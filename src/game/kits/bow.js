// Tideline Bow (main weapon, kind 'bow') — a Tri-Stringer-style bow: hold to draw, release to loose THREE arrows at
// once. Tuning lives in config.js WEAPONS.bow; the model / part animation / icon in bow-model.js; sounds in bow-sfx.js;
// the draw pose in character.js (the "Tideline Bow" block after the HOLD tables: HOLD.bow + poseBow); the two-ring
// reticle in hud.js (+ styles/hud.css).
//
//   draw      charge 0..1 builds linearly over chargeTime; ring 1 at `ring1` (0.45 s), ring 2 = full draw (1.0 s).
//             Slow walk while drawing; the draw holds at full like a charger's. The tank caps how far you can draw.
//   loose     three arrows: a flat (horizontal) fan when you're on the ground, an upright (vertical) one in the air.
//             A tap (< ring 1) = short, weak arrows that just splat. Ring 1+ = the arrows LODGE where they land (or at
//             a victim's feet on a direct hit), glow and tick, then burst after a short fuse. Full draw = full reach,
//             top damage and a bigger burst. Centre + side direct hits, or a direct hit + its burst, splat.
//   arrows    this module's own projectiles (not G.projectiles.list): fast with a light arc, the same flight model
//             Projectiles uses (straight phase → gravity) so its ballistic solver lands them on the crosshair; past
//             their reach they nose down into the ground. Drawn as instanced meshes + additive streaks and glows.
import * as THREE from 'three';
import { G, emit, clamp, lerp, angleDiff } from '../../core/ctx.js';
import { WEAPONS, PLAYER } from '../../config.js';
import { Physics, Hit } from '../physics.js';
import { MAIN_KITS, netRec } from './registry.js';
import { CHARGES, LONG } from '../bots.js';
import './bow-model.js';
import './bow-sfx.js';

const W = WEAPONS.bow;
const DEG = Math.PI / 180;
const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), ZAX = new THREE.Vector3(0, 0, 1);
const MAX = 192;             // arrows alive at once (flying + lodged)
const ARROW_R = 0.11;        // added to the victim's capsule radius (a thin shaft, a fair hitbox)
const LEN = 0.62;            // drawn arrow length (tip → nock), m
const LIFE = 3;              // a flying arrow gives up after this long (s)

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _dir = new THREE.Vector3(), _ax = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _hit = new Hit(), _hit2 = new Hit(), _res = { t: 0, dist: 0 };

function rumble(a, strong, weak, ms) { if (a && a.isLocal && !a.isBot) G.input?.rumble?.(strong, weak, ms); }
function near(p, d) { const c = G.camera; return !!c && c.position.distanceToSquared(p) < d * d; }
function credit(owner, area) { if (!(area > 0)) return; if (owner.specialActive) owner.addTurfNoSpecial(area); else owner.addTurf(area); }
function kitOf(r) { return r.kit || (r.kit = { ring: 0, stall: 0, lastC: 0, botYaw: 0, botWant: 0, botJump: 0, botJumped: false, botPaint: 0 }); }

// ---------------------------------------------------------------------------------------------- shot tiers
// charge → { tier 0 tap | 1 ring | 2 full, range (straight flight before the dive), speed, damage (centre / side), fan
// (deg), lodge + burst }
const _shot = {};
export function bowShot(c) {
  const S = _shot;
  if (c >= 0.999) {
    Object.assign(S, { tier: 2, range: W.flightFull, speed: W.speedFull, dmg: W.damageFull, side: W.sideFull, fan: W.fanFull, lodge: true,
      fuse: W.fuseFull, br: W.burstRadius[1], bd: W.burstDamage[1], be: W.burstEdge[1], bp: W.burstPaint[1] });
  } else if (c >= W.ring1) {
    const u = (c - W.ring1) / (1 - W.ring1), d = lerp(W.damageRing[0], W.damageRing[1], u);
    Object.assign(S, { tier: 1, range: lerp(W.flightRing[0], W.flightRing[1], u), speed: lerp(W.speedRing[0], W.speedRing[1], u), dmg: d, side: d * W.sideMul,
      fan: W.fanRing, lodge: true, fuse: W.fuseRing, br: W.burstRadius[0], bd: W.burstDamage[0], be: W.burstEdge[0], bp: W.burstPaint[0] });
  } else {
    const u = clamp(c / W.ring1, 0, 1), d = lerp(W.damageTap[0], W.damageTap[1], u);
    Object.assign(S, { tier: 0, range: lerp(W.flightTap[0], W.flightTap[1], u), speed: W.speedTap, dmg: d, side: d * W.sideMul, fan: W.fanTap, lodge: false,
      fuse: 0, br: 0, bd: 0, be: 0, bp: 0 });
  }
  return S;
}

// ---------------------------------------------------------------------------------------------- arrows
const arrows = [];            // live records (flying: st 0, lodged: st 1)
const STATS = { grouped: 0 };   // bots' fan nudges toward a second foe (tests read it)
const pool = [];
function newArrow() {
  return pool.pop() || { pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), dir: new THREE.Vector3(), fdir: new THREE.Vector3(),
    hitP: new THREE.Vector3(), nrm: new THREE.Vector3() };
}
function kill(i) { const p = arrows[i]; arrows[i] = arrows[arrows.length - 1]; arrows.pop(); p.owner = null; pool.push(p); }

// Loose a volley from actor a at charge c (weapons-side: ink, sounds, pose are the runner's).
export function looseVolley(a, c) {
  const S = bowShot(c), P = G.projectiles;
  const m = P._muzzle(a, _v.set(0, 0, 0)).clone();
  const dir = P._aimFrom(a, m, _dir);
  P._ballistic(m, dir, a.aimPoint, S.speed, W.straight, W.grav, 0, S.range);
  // fan axis: on the ground the arrows spread about the vertical (a flat fan); in the air about the aim's horizontal
  // right axis (an upright fan)
  const air = !a.grounded;
  // bots: nudge the fan's centre toward a second foe beside the target, so the fan spans both
  const k = a.weaponRunner && kitOf(a.weaponRunner);
  if (k && k.botYaw && !air) { dir.applyAxisAngle(UP, k.botYaw); k.botYaw = 0; STATS.grouped++; }
  if (k) k.botYaw = 0;
  volley(a, S, m, dir, air);
  // online: the other players' screens loose the same volley (visual arrows; the owner's hits + splats arrive apart)
  netRec(a, 'bow', [r2(m.x), r2(m.y), r2(m.z), r3(dir.x), r3(dir.y), r3(dir.z), r3(c), air ? 1 : 0]);
  if (a.isLocal) emit('recoil', { amount: 0.004 + 0.004 * S.tier });
  emit('weapon:fire', { actor: a, weapon: W.id, muzzle: m.clone(), dir: dir.clone(), charge: c });
  rumble(a, 0.1 + 0.15 * S.tier, 0.18 + 0.12 * S.tier, 70 + 30 * S.tier);
  return S;
}

// the three arrows of a volley from m along dir (the fan: about the vertical on the ground, about the aim's right axis
// in the air). ghost: a remote player's volley (online) — the arrows fly, lodge and burst for the eye only
function volley(a, S, m, dir, air, ghost = false) {
  if (air) { _ax.crossVectors(dir, UP); if (_ax.lengthSq() < 1e-4) _ax.set(1, 0, 0); _ax.normalize(); } else _ax.copy(UP);
  const col = G.teamColors[a.team];
  for (let i = -1; i <= 1; i++) {
    if (arrows.length >= MAX) kill(0);
    const p = newArrow();
    const d = _v2.copy(dir); if (i) d.applyAxisAngle(_ax, i * S.fan * DEG);
    p.pos.copy(m); p.prev.copy(m); p.vel.copy(d).multiplyScalar(S.speed); p.dir.copy(d); p.fdir.copy(d);
    Object.assign(p, { owner: a, team: a.team, st: 0, age: 0, dist: 0, t: 0, range: S.range, speed: S.speed, tier: S.tier, dmg: i ? S.side : S.dmg, lodge: S.lodge, fuse: S.fuse,
      br: S.br, bd: S.bd, be: S.be, bp: S.bp, trail: -1.8, seed: Math.random(), noHit: false, ticks: 0, spawnT: G.time, center: i === 0, ghost });
    arrows.push(p);
  }
  if (a.isLocal || a._nearCamera?.()) {
    G.audio?.play('bow_loose', { pos: a.isLocal ? undefined : m, volume: a.isLocal ? 0.75 : 0.55, pitch: 1.12 - 0.12 * S.tier });
    G.fx?.muzzle?.(m, dir, col, S.tier === 2 ? 'charger' : 'shooter');
  }
}
function ghost(a, d) {
  if (!Array.isArray(d)) return;
  const S = bowShot(d[6]);
  volley(a, S, _gm.set(d[0], d[1], d[2]), _gd.set(d[3], d[4], d[5]).normalize(), !!d[7], true);
}
const _gm = new THREE.Vector3(), _gd = new THREE.Vector3();

// stick arrow p into a surface at `point` (normal n); `d` = the direction it sinks in
function lodge(p, point, n, d) {
  // (point / n / d may be shared temporaries: copy them first, then only read the arrow's own fields)
  p.st = 1; p.t = 0; p.hitP.copy(point); p.nrm.copy(n); p.dir.copy(d).normalize();
  p.pos.copy(p.hitP).addScaledVector(p.dir, 0.12);      // tip buried; the shaft sticks out behind it
  _v.copy(p.hitP).addScaledVector(p.nrm, 0.08);
  credit(p.owner, G.paint.splat(_v, W.paintStick, p.team, { seed: p.seed, stretch: p.dir, stretchAmt: 0.5 }));
  if (p.owner.isLocal || near(p.hitP, 26)) {
    G.audio?.play('bow_thunk', { pos: p.hitP, volume: 0.5 + 0.15 * p.tier, pitch: p.center ? 1 : 1.07 });
    G.fx?.burst(p.hitP, p.nrm, G.teamColors[p.team], { count: 5, speed: 2.4, size: 0.06, paint: false });
  }
}

// the lodged arrow bursts: paint, splash damage (falloff past burstInner, needs line of sight), devices, fx
function burst(p) {
  const c = _v3.copy(p.hitP).addScaledVector(p.nrm, 0.18);
  const col = G.teamColors[p.team], owner = p.owner;
  let area = G.paint.splat(_v.copy(p.hitP).addScaledVector(p.nrm, 0.1), p.bp, p.team, { seed: p.seed });
  for (let i = 0; i < 2; i++) {
    const a = p.seed * 20 + i * 2.7, r = p.bp * 0.55;
    _v.set(c.x + Math.cos(a) * r, c.y + 0.1, c.z + Math.sin(a) * r);
    area += G.paint.splat(_v, p.bp * 0.45, p.team, { seed: p.seed + i });
  }
  credit(owner, area);
  if (p.ghost) { burstFx(p, c, col, owner); return; }
  const inner = W.burstInner;
  for (const e of G.actors) {
    if (e.team === p.team || !e.alive) continue;
    // nearest point of the victim's body axis (feet + 0.25 … head - 0.25)
    const h = e.hitH || (e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height);
    const by = e.pos.y + (e.smoothY || 0);
    _v.set(e.pos.x, clamp(c.y, by + 0.25, by + Math.max(0.3, h - 0.25)), e.pos.z);
    const d = Math.max(0, _v.distanceTo(c) - (e.hitR || PLAYER.radius) * 0.6);
    if (d > p.br) continue;
    if (!G.physics.los(c, _v)) continue;
    const dmg = d <= inner ? p.bd : lerp(p.bd, p.be, (d - inner) / Math.max(0.01, p.br - inner));
    G.projectiles.applyHit(owner, e, dmg, W.id);
  }
  G.subs?.damageArea(c, p.br, p.be, p.team);
  G.boss?.splash(owner, c, p.br, p.bd, p.be, W.id);   // Boss Battle
  burstFx(p, c, col, owner);
}
function burstFx(p, c, col, owner) {
  const loud = owner.isLocal || near(c, 34);
  if (loud) {
    G.fx?.explosion(c, col, p.br * (p.tier === 2 ? 0.7 : 0.55));
    G.audio?.play('bow_burst', { pos: c, volume: 0.45 + 0.15 * p.tier, pitch: (p.tier === 2 ? 0.95 : 1.1) * (p.center ? 1 : 1.06) });
    if (near(c, 9)) emit('shake', { pos: c.clone(), amount: 0.12 + 0.08 * p.tier });
  }
  emit('weapon:impact', { pos: c.clone(), normal: p.nrm.clone(), team: p.team, kind: 'blast', radius: p.br });
}

function hitBase(e) { return _v2.set(e.pos.x, e.pos.y + (e.smoothY || 0), e.pos.z); }

function stepArrow(p, i, dt) {
  if (p.st === 1) {
    p.t += dt;
    // countdown ticks: three, closing in on the burst
    const left = p.fuse - p.t;
    if (p.ticks < 3 && left < [0.42, 0.24, 0.1][p.ticks]) {
      p.ticks++;
      if (p.center && (p.owner.isLocal || near(p.hitP, 24))) G.audio?.play('bow_tick', { pos: p.hitP, volume: 0.35 + 0.1 * p.ticks, pitch: 1 + 0.12 * p.ticks });
      if (near(p.hitP, 30)) G.fx?.beepPulse?.(_v.copy(p.hitP).addScaledVector(p.nrm, 0.1), null, null, G.teamColors[p.team], p.br, p.t / p.fuse);
    }
    if (p.t >= p.fuse) { burst(p); kill(i); }
    return;
  }
  p.age += dt;
  p.prev.copy(p.pos);
  if (p.age > W.straight) p.vel.y -= W.grav * dt;
  if (p.dist > p.range) { p.vel.y -= W.diveGrav * dt; p.vel.multiplyScalar(1 - W.diveDrag * dt); }
  p.pos.addScaledVector(p.vel, dt);
  const sp = p.vel.length();
  p.dist += sp * dt;
  if (sp > 0.01) p.dir.copy(p.vel).multiplyScalar(1 / sp);
  // actors (a victim takes the direct hit; a lodging arrow then drops and sticks into the floor at their feet)
  if (!p.noHit) {
    for (const e of G.actors) {
      if (e.team === p.team || !e.alive) continue;
      const h = e.hitH || (e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height), hr = e.hitR || PLAYER.radius;
      if (Math.abs(e.pos.x - p.pos.x) > 3 + hr || Math.abs(e.pos.z - p.pos.z) > 3 + hr) continue;
      Physics.segmentCapsuleDist(p.prev, p.pos, hitBase(e), hr, h, _res);
      if (_res.dist < hr * 0.95 + ARROW_R) {
        _v.copy(p.prev).lerp(p.pos, _res.t);
        if (!p.ghost) G.projectiles.applyHit(p.owner, e, p.dmg, W.id);
        G.fx?.burst(_v, _v3.copy(p.dir).negate(), G.teamColors[p.team], { count: 6, speed: 3, size: 0.07 });
        emit('weapon:impact', { pos: _v.clone(), normal: _v3.clone(), team: p.team, kind: 'shot', radius: 0.3, victim: e });
        if (!p.lodge) { kill(i); return; }
        p.noHit = true; p.fdir.copy(p.dir);
        p.pos.copy(_v); p.prev.copy(_v); p.vel.set(p.dir.x * 1.5, -9, p.dir.z * 1.5); p.dist = Math.max(p.dist, p.range);
        return;
      }
    }
  }
  // Boss Battle: HULLBREAKER's hit spheres / its crablets take the direct hit (a lodging arrow sticks there and bursts)
  if (!p.noHit && G.boss) {
    const bh = G.boss.segHit(p.prev, p.pos, ARROW_R);
    if (bh) {
      const at = bh.point.clone();
      G.boss.hit(p.owner, p.dmg, bh.target, W.id, at);
      if (p.lodge) lodge(p, at, _v.copy(p.dir).negate(), p.dir); else kill(i);
      return;
    }
  }
  // enemy devices (curtains, sprinklers …) and special objects (bubbles) catch arrows; lodging ones stick in them
  const bd = p.ghost ? 0 : p.dmg;   // (a ghost arrow's blow costs a device nothing)
  const blocked = !p.noHit && ((G.subs && G.subs.blockShot(p.prev, p.pos, p.team, bd)) || (G.specials && G.specials.shotHit(p.prev, p.pos, p.team, bd, p.owner)));
  if (blocked) {
    if (p.lodge) lodge(p, p.pos, _v.copy(p.dir).negate(), p.dir); else kill(i);
    return;
  }
  // world
  const hit = G.physics.segment(p.prev, p.pos, _hit, true);
  if (hit.hit) {
    if (p.lodge) {
      // a dropped arrow (after a direct hit) sticks in at a slant along its old flight line
      if (p.noHit) _dir.set(p.fdir.x * 0.55, -1, p.fdir.z * 0.55).normalize(); else _dir.copy(p.dir);
      lodge(p, hit.point, hit.normal, _dir);
    } else {
      _v.copy(hit.point).addScaledVector(hit.normal, 0.12);
      credit(p.owner, G.paint.splat(_v, W.paintTap * (0.85 + 0.3 * p.seed), p.team, { seed: p.seed, stretch: p.dir, stretchAmt: 0.7 }));
      emit('weapon:impact', { pos: hit.point.clone(), normal: hit.normal.clone(), team: p.team, kind: 'shot', radius: W.paintTap });
      if (p.owner.isLocal || near(hit.point, 22)) {
        G.fx?.burst(hit.point, hit.normal, G.teamColors[p.team], { count: 5, speed: 3, size: 0.07, paint: false });
        if (p.center) G.audio?.play('splat_small', { pos: hit.point, volume: 0.35 });
      }
      kill(i);
    }
    return;
  }
  // trail drips (lodging arrows only: a dotted ink line under the flight)
  if (p.lodge && !p.noHit) {
    p.trail += sp * dt;
    if (p.trail > W.trailEvery) {
      p.trail = 0;
      const g = G.physics.raycast(p.pos, DOWN, 4, _hit2, true);
      if (g.hit) credit(p.owner, G.paint.splat(_v.copy(g.point).addScaledVector(g.normal, 0.1), W.trailRadius * (0.8 + Math.random() * 0.4), p.team, { seed: Math.random() }));
    }
  }
  if (p.age > LIFE || p.pos.y < PLAYER.waterY - 1.2) {
    if (p.pos.y < PLAYER.waterY - 1.2 && near(p.pos, 30)) G.fx?.waterPlop?.(_v.copy(p.pos).setY(PLAYER.waterY), 0.5);
    kill(i);
  }
}

// ---------------------------------------------------------------------------------------------- drawing
let R = null;   // render objects (built on first use; the scene lives for the whole session)
function gate(renderer, scene, camera, geometry) { geometry.drawRange.count = scene.overrideMaterial ? 0 : Infinity; }
function arrowGeometry() {
  // shaft + ink-bulb head (team ink) · fletching + nock (white / dark) — tip at the origin, the shaft runs back along -Z
  const lz = (prof, seg) => { const g = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), seg); g.rotateX(Math.PI / 2); return g; };
  const shaft = lz([[0, -LEN], [0.015, -LEN + 0.005], [0.015, -0.08], [0, -0.07]], 8);
  const hp = new THREE.SplineCurve([[0, -0.12], [0.018, -0.11], [0.034, -0.07], [0.028, -0.032], [0.012, -0.007], [0, 0]].map(([r, z]) => new THREE.Vector2(r, z))).getSpacedPoints(14);
  const head = lz(hp.map((p) => [Math.max(0, p.x), p.y]), 12);
  shaft.deleteAttribute('uv'); head.deleteAttribute('uv');
  const ink = mergeSimple([shaft, head]);
  const parts = [], cols = [];
  const vane = (roll) => {
    const g = new THREE.BoxGeometry(0.003, 0.036, 0.1);
    const pz = g.attributes.position;
    for (let k = 0; k < pz.count; k++) { const y = pz.getY(k), z = pz.getZ(k); pz.setY(k, y > 0 ? y - (z + 0.0425) * 0.12 : y); }
    g.translate(0, 0.032, -LEN + 0.08); g.rotateZ(roll); g.deleteAttribute('uv'); return g;
  };
  for (let k = 0; k < 3; k++) { parts.push(vane(k * Math.PI * 2 / 3 + 0.4)); cols.push(k ? 0xf4f6fa : 0xffcf33); }
  const nock = lz([[0, -LEN - 0.022], [0.017, -LEN - 0.02], [0.017, -LEN + 0.014], [0, -LEN + 0.014]], 8); nock.deleteAttribute('uv');
  parts.push(nock); cols.push(0x1b1e25);
  for (let i = 0; i < parts.length; i++) {
    const g = parts[i], n = g.attributes.position.count, a = new Float32Array(n * 3); _c.set(cols[i]);
    for (let k = 0; k < n; k++) { a[k * 3] = _c.r; a[k * 3 + 1] = _c.g; a[k * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  return { ink, fletch: mergeSimple(parts) };
}
function mergeSimple(list) {
  // non-indexed merge of position / normal (/ color) — enough for these little meshes
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const hasC = geos.every((g) => g.attributes.color);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = hasC ? new Float32Array(n * 3) : null;
  let o = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (col) col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
function streakMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */`
      varying float vF; varying vec3 vC;
      void main() {
        vF = clamp(-position.z, 0.0, 1.0);
        vC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #endif
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }`,
    fragmentShader: /* glsl */`
      varying float vF; varying vec3 vC;
      void main() {
        float a = 1.0 - vF; a *= a;
        gl_FragColor = vec4(vC * a, a);
      }`,
  });
}
function ensureRender() {
  if (R || !G.scene) return R;
  const geo = arrowGeometry();
  const inkMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });
  const flMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const mk = (g, mat, color) => {
    const m = new THREE.InstancedMesh(g, mat, MAX);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (color) { m.setColorAt(0, _c.set(0xffffff)); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    m.frustumCulled = false; m.count = 0; G.scene.add(m);
    return m;
  };
  const streakGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); streakGeo.rotateX(Math.PI / 2); streakGeo.translate(0, 0, -0.5);
  R = {
    ink: mk(geo.ink, inkMat, true), fl: mk(geo.fletch, flMat, false),
    glow: mk(new THREE.SphereGeometry(1, 10, 8), glowMat, true), streak: mk(streakGeo, streakMaterial(), true),
  };
  R.ink.castShadow = true; R.fl.castShadow = true;
  R.glow.onBeforeRender = gate; R.streak.onBeforeRender = gate; R.glow.renderOrder = 5; R.streak.renderOrder = 4;
  return R;
}
function draw() {
  const r = ensureRender(); if (!r) return;
  let n = 0, ng = 0, ns = 0;
  const t = G.time;
  for (const p of arrows) {
    const col = G.teamColors[p.team];
    _q.setFromUnitVectors(ZAX, p.dir);
    _m.compose(p.pos, _q, _s.set(1, 1, 1));
    r.ink.setMatrixAt(n, _m); r.ink.setColorAt(n, col); r.fl.setMatrixAt(n, _m); n++;
    if (p.st === 1) {
      // lodged: the head swells and throbs faster toward the burst, the danger ring fills on the surface
      const k = clamp(p.t / p.fuse, 0, 1), beat = 0.5 + 0.5 * Math.sin(t * (14 + 30 * k));
      _v.copy(p.hitP).addScaledVector(p.nrm, 0.05);
      _m.compose(_v, _q, _s.setScalar(0.07 + 0.07 * k + 0.035 * beat));
      r.glow.setMatrixAt(ng, _m); r.glow.setColorAt(ng, _c.copy(col).multiplyScalar(1.2 + 2.2 * k + 1.6 * beat)); ng++;
      if (near(p.hitP, 36)) G.fx?.dangerRing?.(_v.copy(p.hitP).addScaledVector(p.nrm, 0.02), p.nrm, col, p.br, k);
    } else {
      // flying: a glowing head and a fading streak behind (longer for faster, charged arrows)
      _m.compose(_v.copy(p.pos).addScaledVector(p.dir, -0.05), _q, _s.setScalar(p.tier === 2 ? 0.085 : p.tier ? 0.07 : 0.05));
      r.glow.setMatrixAt(ng, _m); r.glow.setColorAt(ng, _c.copy(col).multiplyScalar(p.tier === 2 ? 2.4 : p.tier ? 1.6 : 0.9)); ng++;
      const len = Math.min(p.dist, p.vel.length() * 0.06 + 0.4), rad = p.tier === 2 ? 0.045 : p.tier ? 0.036 : 0.026;
      _v.copy(p.pos).addScaledVector(p.dir, -0.25);
      _m.compose(_v, _q, _s.set(rad, rad, len));
      r.streak.setMatrixAt(ns, _m); r.streak.setColorAt(ns, _c.copy(col).multiplyScalar(p.tier === 2 ? 1.5 : 1.0)); ns++;
    }
  }
  r.ink.count = n; r.fl.count = n; r.glow.count = ng; r.streak.count = ns;
  for (const m of [r.ink, r.fl, r.glow, r.streak]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}

// ---------------------------------------------------------------------------------------------- the runner
function update(runner, dt, inp, w) {
  const a = runner.a, k = kitOf(runner);
  k.seen = G.time;
  const pos = a.isLocal ? undefined : a.pos;
  if (inp.fire && runner.cooldown <= 0) {
    if (!runner.charging) {
      if (a.ink < w.inkFull * w.inkMin) { runner._empty(); return; }
      runner.charging = true; runner.charge = 0; runner.chargeT = 0; k.ring = 0; k.stall = 0; k.lastC = 0;
      if (a.isLocal || a._nearCamera()) runner.chargeLoop = G.audio?.loop('bow_draw', { pos, volume: a.isLocal ? 0.5 : 0.32, pitch: 0.6 });
    }
    // the draw builds linearly (ring 1 at w.ring1 of the way); the tank caps it
    const maxC = clamp(a.ink / w.inkFull, 0, 1);
    runner.chargeT = Math.min(1, runner.chargeT + dt / w.chargeTime);
    runner.charge = Math.min(maxC, runner.chargeT);
    a.fireFacing = 0.4;
    runner.chargeLoop?.set({ pitch: 0.6 + 0.9 * runner.charge, pos });
    if (k.ring < 1 && runner.charge >= w.ring1) {
      k.ring = 1;
      if (a.isLocal) G.audio?.play('bow_ring1', { volume: 0.65 });
      rumble(a, 0.03, 0.18, 45);
      emit('bow:ring', { actor: a, ring: 1 });
    }
    if (k.ring < 2 && runner.charge >= 0.999) {
      k.ring = 2;
      if (a.isLocal) G.audio?.play('bow_full', { volume: 0.7 });
      rumble(a, 0.05, 0.3, 60);
      emit('bow:ring', { actor: a, ring: 2 });
    }
    // bots only: a draw that can't grow (tank-capped / held at full) while not duelling lets go after a beat, so a
    // bot painting a puddle to refill never stands there holding the string
    k.stall = runner.charge > k.lastC + 1e-4 ? 0 : k.stall + dt; k.lastC = runner.charge;
    if (a.bot && k.stall > 0.45 && a.bot.mode !== 'fight') release(runner, w, k);
  } else if (runner.charging) release(runner, w, k);
}
function release(runner, w, k) {
  const a = runner.a;
  runner.charging = false;
  runner.chargeLoop?.stop(0.06); runner.chargeLoop = null;
  const c = runner.charge;
  a.ink = Math.max(0, a.ink - w.inkFull * Math.max(w.inkMin, c));
  a.lastFire = 0;
  looseVolley(a, c);
  a.character.trigger('charge_release');
  runner.charge = 0; runner.chargeT = 0; k.ring = 0; k.stall = 0;
  runner.firingT = 0.35;
  runner.cooldown = w.cooldown;
}

// ---------------------------------------------------------------------------------------------- bots
// fight: a full draw at range, ring 1 up close; the flat fan leans toward a second foe beside the target; a target
// above / below (ledge, stairs), or now and then at mid range, gets a jump shot with the upright fan
function groupYaw(brain, a, t, fanRad) {
  let best = null, bd = 3.5;
  for (const e of G.actors) {
    // (a second foe the bot can see — bots.js / botSight.js — never one behind a wall)
    if (e === brain.target || e.team === a.team || !e.alive || !brain.sight?.sees(e)) continue;
    const d = Math.hypot(e.pos.x - t.pos.x, e.pos.z - t.pos.z);
    if (d < bd) { bd = d; best = e; }
  }
  if (!best) return 0;
  const y1 = Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z), y2 = Math.atan2(best.pos.x - a.pos.x, best.pos.z - a.pos.z);
  return clamp(angleDiff(y1, y2) * 0.5, -fanRad, fanRad);
}
const bot = {
  paintPitch: -0.18,
  fight(brain, ctx) {
    const { a, w, dist, range, it, move, target } = ctx;
    const wr = a.weaponRunner, k = kitOf(wr);
    if (!wr.charging) {
      if (dist > range * 1.1 || wr.cooldown > 0) return false;
      k.botWant = dist > 11 ? 1 : w.ring1 + 0.08;
      const dy = (target.pos.y - a.pos.y);
      k.botJump = a.grounded && dist > 4 && dist < 17 && (Math.abs(dy) > 1.3 || Math.random() < 0.18) ? 1 : 0;
      k.botJumped = false;
      return true;
    }
    move.multiplyScalar(0.4);
    const want = Math.min(k.botWant, clamp(a.ink / w.inkFull, 0, 1) - 0.001);
    if (wr.charge < want) return true;
    if (k.botJump) {
      if (!k.botJumped) { if (a.grounded) { it.jump = true; k.botJumped = true; } return true; }
      if (a.grounded && a.vel.y <= 0.5 && k.botJumped) { k.botJump = 0; return false; }   // landed already: just loose
      if (a.vel.y > 1.5) return true;                                                     // rising: loose near the top
      return false;
    }
    if (a.grounded) k.botYaw = groupYaw(brain, a, target, bowShot(wr.charge).fan * DEG);
    return false;
  },
  paint(brain, ctx) {
    const { a, w, needPaint, inkFrac } = ctx;
    const wr = a.weaponRunner, k = kitOf(wr);
    if (wr.charging) {
      const done = wr.charge >= Math.min(k.botPaint || w.ring1 + 0.05, clamp(a.ink / w.inkFull, 0, 1) - 0.001);
      if (done) brain.paintPause = 0.3 + Math.random() * 0.35;
      return !done;
    }
    if (!(needPaint && inkFrac > 0.25 && (brain.paintPause || 0) <= 0 && wr.cooldown <= 0)) return false;
    // not getting anywhere on its path: hold off the next draw (drawing resets the unstick timer) so the brain's
    // hop / skip / replan recovery gets its turn
    if ((brain.noProg || 0) > 0.25) return false;
    k.botPaint = Math.random() < 0.3 ? 1 : w.ring1 + 0.05;
    return true;
  },
};
CHARGES.bow = true;
LONG.bow = true;

// ---------------------------------------------------------------------------------------------- registration
MAIN_KITS.bow = {
  update,
  ghost,
  reset(runner) { runner.kit = null; },
  moveSpeed(runner, w) {
    if (runner.charging) return lerp(PLAYER.runSpeed * 0.75, w.moveSpeedDrawing, Math.min(1, runner.charge * 2.5));
    if (runner.firingT > 0) return w.moveSpeedFiring;
    return 0;
  },
  spreadDeg() { return 0; },
  tick(dt) {
    const nm = G.netm;
    for (let i = arrows.length - 1; i >= 0; i--) {
      const p = arrows[i], g = p.ghost && nm;   // (a ghost arrow's splats are its owner's to send)
      if (g) nm.mute++;
      try { stepArrow(p, i, dt); } finally { if (g) nm.mute--; }
    }
    // a draw left hanging (a special took over the trigger mid-draw, so the runner stopped updating): let it go quietly
    for (const a of G.actors) {
      const r = a.weaponRunner;
      if (r && r.charging && r.kit && a.weapon?.kind === 'bow' && G.time - (r.kit.seen ?? G.time) > 0.15) {
        r.charging = false; r.charge = 0; r.chargeT = 0; r.kit.ring = 0; r.chargeLoop?.stop(0.06); r.chargeLoop = null;
      }
    }
    draw();
  },
  clear() { while (arrows.length) kill(arrows.length - 1); if (R) for (const m of [R.ink, R.fl, R.glow, R.streak]) m.count = 0; },
  bot,
};
// test / debug handle (page tests read the live arrows)
export const BOW_DEBUG = { arrows, bowShot, stats: STATS };
