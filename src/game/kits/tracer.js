// Tracer Bolt (sub kind 'tracer') — see kits/registry.js.
//
// Fired the instant the sub button is released: a fast bolt (no gravity) sent a few degrees BELOW the crosshair line.
// It ricochets off every surface except grates (it flies straight through those), leaving a big ink puddle at each
// bounce; off a floor the exit angle is flattened (the bounce's vertical speed is scaled down), so after hitting the
// ground it skims along close to it — which is how it usually finds feet, and why firing it from high up is easy.
// It flies until its total travel reaches `range` or it hits a foe. A direct hit damages and marks the foe for a long
// time; the bolt also leaves a team-coloured trail that lingers about a second, and a foe touching it is damaged and
// marked for a short time (once per bolt; a direct hit takes the place of the trail hit).
// While the button is held the local player sees a thin guide: the true launch line to the first bounce, then the
// first rebound (dashed), so the low angle is learnable.
import * as THREE from 'three';
import { G, emit, clamp } from '../../core/ctx.js';
import { PLAYER, SUBS, subViewScale } from '../../config.js';
import { Physics, Hit } from '../physics.js';
import { SUB_KITS, netRec, netId, ghostMute } from './registry.js';
const r3 = (x) => Math.round(x * 1000) / 1000;
import { registerSubModel, getSubDef, GEO_KIT } from '../character-weapons.js';
import { superEllipsoid, smoothProfile } from '../character-geo.js';
import { getPlasticMaterial, getInkMaterial } from '../character-mats.js';
import { SUB_ICONS } from '../../ui/ui-icons.js';
import { SFX } from '../../audio/audio.js';
import { pts, sweep } from '../../audio/music.js';

const V3 = THREE.Vector3;
const DEG = Math.PI / 180;
const UP = new V3(0, 1, 0), ZAX = new V3(0, 0, 1);
const SCALE = 1.9;               // hand-scale prop → world — [sub-view] drawn × SUB_VIEW_SCALE.tracer (visual only: s.size stays)
const HEAD_R = 0.0425;           // [sub-view] the bolt's half thickness in the world at SCALE (m)
const _v = new V3(), _v2 = new V3(), _v3 = new V3(), _end = new V3(), _q = new THREE.Quaternion();
const _hit = new Hit(), _hit2 = new Hit(), _res = { t: 0, dist: 0 };
const nearCam = (p, r = 34) => !!G.camera && G.camera.position.distanceToSquared(p) < r * r;
const hitBase = (e, out) => out.set(e.pos.x, e.pos.y + (e.smoothY || 0), e.pos.z);
const hitH = (e) => e.hitH || (e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height);
const hitR = (e) => e.hitR || PLAYER.radius;

// =============================================================================================== model
// Hand scale, prop space (+Z forward): a slim bolt — a machined metal spike on a cream front body with a team stripe,
// a caged window onto a glowing team-ink core, a cream rear body with three swept team fins, and a knurled rubber
// grip stub (the fist's handle) with a metal end cap.
const YC = 0.02;
function buildTracer() {
  const { Parts, C, M, latheZ, torus, at, profR, led, gripSleeve, chevrons, wrapZ } = GEO_KIT;
  const P = new Parts(), I = new Parts(), L = new Parts();
  const BP = smoothProfile([[0.0122, -0.054], [0.0135, -0.045], [0.0137, -0.03], [0.0133, -0.012], [0.0128, 0.02], [0.0125, 0.045], [0.0114, 0.068]], 30);
  const r = (z) => profR(BP, z);
  const section = (z0, z1, dr = 0, n = 10) => {
    const pr = [[0, z0]];
    for (let i = 0; i <= n; i++) { const z = z0 + (z1 - z0) * i / n; pr.push([r(z) + dr, z]); }
    pr.push([0, z1]);
    return at(latheZ(pr, 22), 0, YC, 0);
  };
  const ring = (z, tube, col, mat, R) => P.add(at(torus(R ?? r(z) + 0.0004, tube, 6, 26), 0, YC, z), col, mat);
  // spike
  P.add(at(latheZ([[0, 0.0675], [0.0104, 0.0675], [0.0098, 0.075], [0.0078, 0.085], [0.0046, 0.0955], [0.0014, 0.1028], [0, 0.104]], 22), 0, YC, 0), C.metal, M.metal);
  ring(0.0685, 0.0019, C.dark, M.gloss, 0.0112);
  // front body + team stripe
  P.add(section(0.035, 0.046), C.cream, M.gloss); I.add(section(0.046, 0.055, 0.0005, 4)); P.add(section(0.055, 0.068), C.cream, M.gloss);
  // caged core window
  ring(0.035, 0.0022, C.dark, M.gloss); ring(-0.012, 0.0022, C.dark, M.gloss);
  L.add(at(latheZ(smoothProfile([[0, -0.012], [0.0088, -0.0105], [0.0098, 0.0], [0.0099, 0.012], [0.0097, 0.024], [0.0086, 0.033], [0, 0.035]], 14), 18), 0, YC, 0));
  P.add(at(latheZ([[0, -0.0125], [0.0062, -0.0125], [0.0062, 0.0355], [0, 0.0355]], 10), 0, YC, 0), C.darker, M.satin);   // socket behind the glow
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + k * Math.PI * 2 / 3, R = 0.0118;
    P.add(at(superEllipsoid(0.0018, 0.0018, 0.0235, 0.6, 0.6, 5, 6), Math.cos(a) * R, YC + Math.sin(a) * R, 0.0115), C.dark, M.satin);
  }
  // rear body, three swept fins (team), rear collar
  P.add(section(-0.054, -0.012), C.cream, M.gloss);
  ring(-0.054, 0.002, C.dark, M.gloss);
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + k * Math.PI * 2 / 3;
    const fin = superEllipsoid(0.0014, 0.0068, 0.0125, 0.55, 0.6, 5, 8, (q) => { q.z -= (q.y + 0.0068) * 0.9; });
    fin.translate(0, 0.0134 + 0.0058, -0.034);
    fin.rotateZ(a - Math.PI / 2);
    I.add(at(fin, 0, YC, 0));
  }
  led(P, new V3(0, YC + r(0.06) + 0.0001, 0.06), new V3(0, 1, 0.1), C.amber, 0.0022);
  for (const g of chevrons(0.012, 0.006, 2)) { g.rotateZ(Math.PI); P.add(wrapZ(g, r(-0.03) + 0.0004, -Math.PI / 2, -0.03, YC), C.dark, M.print); }
  // grip stub + end cap
  const stub = gripSleeve(0, 0.04, 0.0104); stub.rotateX(-Math.PI / 2); P.add(at(stub, 0, YC, -0.0545), C.rubber, M.rubber);
  P.add(at(latheZ([[0, -0.0985], [0.0074, -0.0985], [0.0094, -0.097], [0.0097, -0.0945], [0, -0.0945]], 14), 0, YC, 0), C.metal, M.metal);
  return { kind: 'tracer', body: P.build(), ink: I.build(), glow: L.build(), yc: YC,
    grip: { pos: new V3(0, YC, -0.076), handZ: new V3(0, 0, -1), handY: new V3(0.3, -1, 0.1) } };
}

// =============================================================================================== trail ribbon
// A camera-facing strip through the bolt's path points; each point fades out `life` seconds after it was laid.
const RIB_VS = `
  attribute vec2 aInfo; uniform float uTime; uniform float uLife; varying float vSide; varying float vAge;
  void main(){ vSide = aInfo.x; vAge = clamp((uTime - aInfo.y) / uLife, 0.0, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIB_FS = `
  uniform vec3 uColor; varying float vSide; varying float vAge;
  void main(){
    float s = abs(vSide);
    float edge = 1.0 - smoothstep(0.1, 1.0, s);
    edge *= edge;
    float core = 1.0 - smoothstep(0.0, 0.22, s);
    float fade = pow(1.0 - vAge, 1.5);
    float a = (edge * 0.85 + core * 0.15) * fade;
    if (a < 0.01) discard;
    vec3 c = mix(uColor * 1.45, vec3(1.0), core * 0.7 * (1.0 - vAge * 0.7));
    gl_FragColor = vec4(c, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const RIB_CAP = 160;
function makeRibbon(team, life) {
  const g = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(RIB_CAP * 2 * 3), 3); pos.setUsage(THREE.DynamicDrawUsage);
  const info = new THREE.BufferAttribute(new Float32Array(RIB_CAP * 2 * 2), 2); info.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pos); g.setAttribute('aInfo', info);
  const idx = [];
  for (let i = 0; i < RIB_CAP - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx); g.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: G.teamColors[team].clone() }, uTime: { value: 0 }, uLife: { value: life } },
    vertexShader: RIB_VS, fragmentShader: RIB_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 2;
  return m;
}
function drawRibbon(b) {
  const R = b.rib, P = b.pts, n = P.length;
  if (n < 2 || !G.camera) { R.geometry.setDrawRange(0, 0); return; }
  const pos = R.geometry.attributes.position, info = R.geometry.attributes.aInfo;
  const cam = G.camera.position, life = b.sub.trailLife;
  for (let i = 0; i < n; i++) {
    const p = P[i].p;
    const a = P[Math.max(0, i - 1)].p, c = P[Math.min(n - 1, i + 1)].p;
    _v.subVectors(c, a); if (_v.lengthSq() < 1e-8) _v.copy(b.dir);
    _v2.subVectors(cam, p);
    _v3.crossVectors(_v, _v2); if (_v3.lengthSq() < 1e-8) _v3.set(0, 1, 0);
    const age = clamp((clock - P[i].b) / life, 0, 1);
    const w = 0.085 * (1 + 0.6 * (1 - age));
    _v3.normalize().multiplyScalar(w);
    pos.setXYZ(i * 2, p.x + _v3.x, p.y + _v3.y, p.z + _v3.z); info.setXY(i * 2, -1, P[i].b);
    pos.setXYZ(i * 2 + 1, p.x - _v3.x, p.y - _v3.y, p.z - _v3.z); info.setXY(i * 2 + 1, 1, P[i].b);
  }
  pos.needsUpdate = true; info.needsUpdate = true;
  R.geometry.setDrawRange(0, (n - 1) * 6);
  R.material.uniforms.uTime.value = clock;
}

// =============================================================================================== bolt head
function buildHead(team) {
  const d = getSubDef('tracer'), vs = subViewScale('tracer');   // [sub-view]
  const col = G.teamColors[team];
  const outer = new THREE.Group(), model = new THREE.Group();
  model.scale.setScalar(SCALE * vs); model.position.y = -d.yc * SCALE * vs;
  const body = new THREE.Mesh(d.body, getPlasticMaterial());
  const ink = new THREE.Mesh(d.ink, getInkMaterial(col));
  const gm = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: col.clone(), emissiveIntensity: 2.4, roughness: 0.3 });
  model.add(body, ink, new THREE.Mesh(d.glow, gm));
  // a hot glowing streak round it (reads at speed)
  const streak = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.2).addScalar(0.25), transparent: true, opacity: 0.55, depthWrite: false }));
  streak.scale.set(0.075 * vs, 0.075 * vs, 0.42 * vs); streak.position.z = -0.12 * vs;
  outer.add(model, streak);
  outer.userData = { glow: gm, streak, r: HEAD_R * vs };   // (r: the drawn bolt's half thickness)
  return outer;
}

// =============================================================================================== state
const bolts = [];
let clock = 0;
function credit(b, area) { if (!area) return; if (b.sp) b.owner.addTurfNoSpecial(area); else b.owner.addTurf(area); }
function sceneOf(subs) { return subs?.scene || G.scene; }

// launch point (chest height, a little in front; never inside a wall) and direction (the crosshair line, lowered)
function launch(a, sub, from, dir) {
  const sy = a.smoothY || 0;
  _v.set(a.pos.x, a.pos.y + sy + 1.0, a.pos.z);
  const fx = Math.sin(a.aimYaw), fz = Math.cos(a.aimYaw);
  from.set(a.pos.x + fx * 0.3, a.pos.y + sy + 1.2, a.pos.z + fz * 0.3);
  if (!G.physics.los(_v, from)) from.copy(_v);
  dir.copy(a.aimPoint).sub(from);
  const d = dir.length();
  if (!(d > 2) || dir.dot(a.aimDir) < 0) dir.copy(a.aimDir); else dir.multiplyScalar(1 / d);
  const pitch = clamp(Math.asin(clamp(dir.y, -1, 1)) - sub.pitchDown * DEG, -1.5, 1.45), yaw = Math.atan2(dir.x, dir.z);
  const cp = Math.cos(pitch);
  return dir.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
}
// the bounce rule: mirror off the surface; off a floor the vertical part of the rebound is scaled down (skims low)
function rebound(dir, n, sub) {
  dir.addScaledVector(n, -2 * dir.dot(n));
  if (n.y > 0.6) {
    dir.y *= sub.floorExit;
    dir.normalize();
    const dn = dir.dot(n);
    if (dn < 0.04) dir.addScaledVector(n, 0.04 - dn).normalize();   // sloped floor: never back into it
  }
  return dir.normalize();
}

function use(subs, a, sub) {
  const from = new V3(), dir = new V3();
  launch(a, sub, from, dir);
  const b = spawn(subs, a, sub, from, dir, false, netId(a));
  netRec(a, 'tracer', [0, b.gid, r3(from.x), r3(from.y), r3(from.z), r3(dir.x), r3(dir.y), r3(dir.z)]);
  G.cues?.one('tracer_zap', { at: from, owner: a, kind: 'throw', sub: true, vol: 0.8 });   // sfx-cues: through the cue mix
  emit('sub:use', { actor: a, kind: 'tracer' });
}
// Online, a remote player's bolt is a ghost: it flies and ricochets the same (its puddles are its owner's to send, its
// hits are dropped), but it doesn't decide foe hits itself — its owner's end record does: [1, gid, x, y, z, foe nid]
// (-1 a hit on no one here, -2 blocked by a device)
function spawn(subs, a, sub, from, dir, ghost, gid) {
  const scene = sceneOf(subs);
  const b = {
    kind: 'tracer', sub, owner: a, team: a.team, pos: from.clone(), start: from.clone(), dir, left: sub.range, travel: 0, bounces: 0,
    state: 'fly', hitSet: new Set(), pts: [], sp: !!a.specialActive, age: 0, scene, head: buildHead(a.team), rib: makeRibbon(a.team, sub.trailLife),
    hum: null, path: [from.clone()], direct: null, lastPt: -1, ghost, gid,
  };
  scene.add(b.head, b.rib);
  addPoint(b);
  bolts.push(b);
  b.hum = null;   // sfx-cues: the hum follows the bolt (then its trail) from src/audio/cues.js
  if (nearCam(from, 30)) G.fx?.muzzle?.(from, dir, G.teamColors[a.team], 'shooter');
  poseHead(b);
  return b;
}
function ghost(a, d) {
  if (!Array.isArray(d)) return;
  const [op, gid] = d;
  if (op === 0) {
    if (bolts.some((x) => x.gid === gid)) return;
    const from = new V3(d[2], d[3], d[4]);
    spawn(G.subs, a, SUBS.tracer, from, new V3(d[5], d[6], d[7]).normalize(), true, gid);
    G.cues?.one('tracer_zap', { at: from, owner: a, kind: 'throw', sub: true, vol: 0.8 });   // sfx-cues
    return;
  }
  const b = bolts.find((x) => x.ghost && x.gid === gid);
  if (!b || b.state !== 'fly' || op !== 1) return;
  b.pos.set(d[2], d[3], d[4]); addPoint(b); b.path.push(b.pos.clone());
  const e = d[5] >= 0 ? G.actors.find((x) => x.nid === d[5]) : null;
  if (e) directHit(b, e); else end(b, d[5] === -2 ? 'blocked' : 'hit');
}

function addPoint(b) {
  const P = b.pts;
  if (P.length && P[P.length - 1].p.distanceToSquared(b.pos) < 1e-6) { P[P.length - 1].b = clock; return; }
  if (P.length >= RIB_CAP) P.shift();
  P.push({ p: b.pos.clone(), b: clock });
}

function tick(dt) {
  clock += dt;
  guideTick();
  if (!bolts.length) return;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.age += dt;
    if (b.state === 'fly') {
      ghostMute(b, () => advance(b, b.sub.speed * dt));
      addPoint(b);
      if (b.ghost && b.age > 4) end(b, 'range');   // (never heard how it ended)
    }
    // drop trail points that have fully faded (keep one so the next segment has a start)
    const life = b.sub.trailLife;
    while (b.pts.length > 1 && clock - b.pts[1].b > life) b.pts.shift();
    ghostMute(b, () => trailTouch(b));
    if (b.state !== 'fly' && (!b.pts.length || clock - b.pts[b.pts.length - 1].b > life)) { dispose(b); bolts.splice(i, 1); continue; }
    poseHead(b);
    drawRibbon(b);
    if (b.hum) {
      const k = b.state === 'fly' ? 1 : clamp(1 - (clock - b.pts[b.pts.length - 1].b) / life, 0, 1);
      b.hum.set({ pos: b.state === 'fly' ? b.pos : b.pts[Math.floor(b.pts.length / 2)].p, volume: 0.4 * k, pitch: b.state === 'fly' ? 1.15 : 0.85 + 0.2 * k });
    }
  }
}

// move the bolt `dist` along its path: bounces, direct hits, devices, range
function advance(b, dist) {
  const s = b.sub;
  let remain = dist, guard = 0;
  while (remain > 1e-5 && b.state === 'fly' && guard++ < 24) {
    const step = Math.min(remain, b.left);
    const w = G.physics.raycast(b.pos, b.dir, step, _hit, true);   // grates: straight through
    const seg = w.hit ? w.dist : step;
    _end.copy(b.pos).addScaledVector(b.dir, seg);
    // a foe on this stretch (the earliest one)
    let best = null, bt = 2;
    if (!b.ghost) for (const e of G.actors) {   // (a ghost's foe hit is its owner's call)
      if (e.team === b.team || !e.alive) continue;
      const hr = hitR(e);
      if (Math.max(Math.abs(e.pos.x - b.pos.x), Math.abs(e.pos.z - b.pos.z)) > seg + 3) continue;
      Physics.segmentCapsuleDist(b.pos, _end, hitBase(e, _v3), hr, hitH(e), _res);
      if (_res.dist < hr + s.size && _res.t < bt) { bt = _res.t; best = e; }
    }
    if (best) {
      b.pos.lerp(_end, bt);
      addPoint(b); b.path.push(b.pos.clone());
      directHit(b, best);
      return;
    }
    // enemy curtains / shields / devices / bubbles stop it
    if (G.subs?.blockShot(b.pos, _end, b.team, s.directDamage) || G.specials?.shotHit?.(b.pos, _end, b.team, s.directDamage, b.owner)) {
      b.pos.copy(_end); addPoint(b); b.path.push(b.pos.clone());
      end(b, 'blocked');
      return;
    }
    b.pos.copy(_end);
    b.left -= seg; b.travel += seg; remain -= seg;
    if (w.hit) bounce(b, w);
    if (b.state !== 'fly') return;
    if (b.left <= 1e-4) { addPoint(b); b.path.push(b.pos.clone()); end(b, 'range'); return; }
    if (b.pos.y < PLAYER.waterY - 0.3) { addPoint(b); end(b, 'water'); return; }
  }
}
function bounce(b, w) {
  const s = b.sub, n = w.normal, col = G.teamColors[b.team];
  addPoint(b); b.path.push(b.pos.clone());
  // a big puddle where it strikes
  const blk = G.level.blocks[w.block];
  if (!(blk && (blk.roof || blk.perch))) {
    _v2.set(b.dir.x, 0, b.dir.z); if (_v2.lengthSq() < 1e-4) _v2.set(0, 0, 1); _v2.normalize();
    credit(b, G.paint.splat(_v.copy(w.point).addScaledVector(n, 0.1), s.puddleRadius, b.team, { seed: Math.random(), stretch: _v2, stretchAmt: 0.35 }));
  }
  rebound(b.dir, n, s);
  b.pos.copy(w.point).addScaledVector(n, 0.03);
  if (n.y > 0.6) b.fy = w.point.y;   // ([sub-view] the floor it skims: poseHead keeps the drawn bolt above it)
  b.bounces++;
  if (nearCam(w.point, 30)) {
    G.fx?.burst(w.point, n, col, { count: 7, speed: 3.5, size: 0.07, ring: true });
    G.fx?.bounceSplash?.(w.point, n, col);
  }
  if (nearCam(w.point, 34)) G.audio?.play('tracer_bounce', { pos: w.point, volume: 0.75, pitch: 1 + Math.min(0.3, b.bounces * 0.05) });
  emit('weapon:impact', { pos: w.point.clone(), normal: n.clone(), team: b.team, kind: 'shot', radius: s.puddleRadius * 0.5 });
  if (b.bounces > s.maxBounces) end(b, 'bounces');
}
function directHit(b, e) {
  const s = b.sub, col = G.teamColors[b.team];
  b.hitSet.add(e); b.direct = e;
  G.projectiles.applyHit(b.owner, e, s.directDamage, 'tracer');
  G.subs.track(e, b.team, s.directMark);
  if (nearCam(b.pos, 34)) {
    G.fx?.burst(b.pos, _v.copy(b.dir).negate(), col, { count: 12, speed: 4.5, size: 0.08, ring: true });
    G.fx?.glint?.(b.pos, col, 0.5);
  }
  if (b.owner.isLocal || e.isLocal || nearCam(b.pos, 30)) G.audio?.play('tracer_hit', { pos: e.isLocal ? undefined : b.pos, volume: 0.9 });
  emit('tracer:hit', { actor: b.owner, victim: e, direct: true, pos: b.pos.clone() });
  end(b, 'hit');
}
function end(b, why) {
  if (b.state !== 'fly') return;
  if (!b.ghost && (why === 'hit' || why === 'blocked')) netRec(b.owner, 'tracer', [1, b.gid, r3(b.pos.x), r3(b.pos.y), r3(b.pos.z), why === 'hit' ? b.direct?.nid ?? -1 : -2]);
  b.state = why;
  b.head.visible = false;
  if (why !== 'hit' && nearCam(b.pos, 30)) { G.fx?.burst(b.pos, _v.copy(b.dir).negate(), G.teamColors[b.team], { count: 5, speed: 2.2, size: 0.05 }); }
}
// a foe touching the lingering trail: damaged + marked (short), once per bolt
function trailTouch(b) {
  const P = b.pts, n = P.length, s = b.sub;
  if (n < 2) return;
  const life = s.trailLife * 0.92;
  for (const e of G.actors) {
    if (e.team === b.team || !e.alive || b.hitSet.has(e)) continue;
    const hr = hitR(e), H = hitH(e), reach = hr + s.trailRadius;
    hitBase(e, _v3);
    for (let i = 0; i < n - 1; i++) {
      const a = P[i], c = P[i + 1];
      if (clock - a.b > life) continue;
      const minx = Math.min(a.p.x, c.p.x) - reach, maxx = Math.max(a.p.x, c.p.x) + reach;
      const minz = Math.min(a.p.z, c.p.z) - reach, maxz = Math.max(a.p.z, c.p.z) + reach;
      if (_v3.x < minx || _v3.x > maxx || _v3.z < minz || _v3.z > maxz) continue;
      Physics.segmentCapsuleDist(a.p, c.p, _v3, hr, H, _res);
      if (_res.dist >= reach) continue;
      b.hitSet.add(e);
      G.projectiles.applyHit(b.owner, e, s.trailDamage, 'tracer');
      G.subs.track(e, b.team, s.trailMark);
      _v.lerpVectors(a.p, c.p, _res.t);
      if (nearCam(_v, 30)) G.fx?.burst(_v, UP, G.teamColors[b.team], { count: 6, speed: 2.6, size: 0.06 });
      if (b.owner.isLocal || e.isLocal) G.audio?.play('tracer_hit', { pos: e.isLocal ? undefined : _v, volume: 0.55, pitch: 1.3 });
      emit('tracer:hit', { actor: b.owner, victim: e, direct: false, pos: _v.clone() });
      break;
    }
  }
}
function poseHead(b) {
  const H = b.head;
  if (!H.visible) return;
  H.position.copy(b.pos);
  // [sub-view] skimming off a floor (the bolt's line runs 0.03 m over it at the bounce), the drawn bolt rides on it
  if (b.fy !== undefined) { const up = H.userData.r - (b.pos.y - b.fy); if (up > 0 && up < H.userData.r + 0.05) H.position.y += up; }
  _q.setFromUnitVectors(ZAX, b.dir);
  H.quaternion.copy(_q);
  H.rotateZ(b.age * 26);
  const S = H.userData.streak; S.material.opacity = 0.45 + 0.2 * Math.sin(b.age * 70);
  if (nearCam(b.pos, 30) && Math.random() < 0.7) G.fx?.glint?.(b.pos, G.teamColors[b.team], 0.18);
}
function dispose(b) {
  b.scene.remove(b.head, b.rib);
  b.head.userData.glow.dispose(); b.head.userData.streak.geometry.dispose(); b.head.userData.streak.material.dispose();
  b.rib.geometry.dispose(); b.rib.material.dispose();
  if (b.hum) { b.hum.stop(0.1); b.hum = null; }
}
function clearAll() {
  for (const b of bolts) dispose(b);
  bolts.length = 0;
  hideGuide();
}

// =============================================================================================== aim guide (local player)
let guide = null, guideSeen = false;
const _gFrom = new V3(), _gDir = new V3();
function guideMeshes() {
  if (guide && guide.line.parent) return guide;
  if (!guide) {
    const mk = (dashed) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const m = dashed ? new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.22, gapSize: 0.16, transparent: true, opacity: 0.7, depthTest: false })
        : new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false });
      const l = new THREE.Line(g, m); l.renderOrder = 10; l.frustumCulled = false; l.visible = false;
      return l;
    };
    const ringM = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    ringM.renderOrder = 10; ringM.visible = false;
    guide = { line: mk(false), exit: mk(true), ring: ringM };
  }
  G.scene?.add(guide.line, guide.exit, guide.ring);
  return guide;
}
function hideGuide() { if (guide) guide.line.visible = guide.exit.visible = guide.ring.visible = false; }
function guideTick() { if (!guideSeen) hideGuide(); guideSeen = false; }
function hold(runner, dt, inp, sub) {
  const a = runner.a;
  if (!a || a !== G.local || !a.alive) return;
  guideSeen = true;
  const Gd = guideMeshes();
  const from = _gFrom, dir = _gDir;
  launch(a, sub, from, dir);
  const w = G.physics.raycast(from, dir, sub.range, _hit2, true);
  const p1 = _v3.copy(from).addScaledVector(dir, w.hit ? w.dist : sub.range);
  const col = a.ink >= sub.inkCost ? G.teamColors[a.team] : new THREE.Color(0.6, 0.6, 0.6);
  const la = Gd.line.geometry.attributes.position;
  la.setXYZ(0, from.x, from.y, from.z); la.setXYZ(1, p1.x, p1.y, p1.z); la.needsUpdate = true;
  Gd.line.geometry.computeBoundingSphere();
  Gd.line.material.color.copy(col).multiplyScalar(1.4);
  Gd.line.visible = true;
  if (w.hit) {
    const n = _hit2.normal;
    Gd.ring.position.copy(p1).addScaledVector(n, 0.03);
    Gd.ring.quaternion.setFromUnitVectors(ZAX, n);
    Gd.ring.material.color.copy(col).multiplyScalar(1.4);
    Gd.ring.scale.setScalar(1 + 0.08 * Math.sin(clock * 9));
    Gd.ring.visible = true;
    // the first rebound (dashed), as far as the next surface / 6 m
    const d2 = rebound(_v.copy(dir), n, sub);
    const s0 = _v2.copy(p1).addScaledVector(n, 0.03);
    const left = Math.min(6, sub.range - w.dist);
    const w2 = G.physics.raycast(s0, d2, Math.max(0.1, left), _hit, true);
    const p2 = s0.clone().addScaledVector(d2, w2.hit ? w2.dist : Math.max(0.1, left));
    const ea = Gd.exit.geometry.attributes.position;
    ea.setXYZ(0, p1.x, p1.y, p1.z); ea.setXYZ(1, p2.x, p2.y, p2.z); ea.needsUpdate = true;
    Gd.exit.geometry.computeBoundingSphere();
    Gd.exit.computeLineDistances();
    Gd.exit.material.color.copy(col).multiplyScalar(1.4);
    Gd.exit.visible = left > 0.2;
  } else { Gd.ring.visible = false; Gd.exit.visible = false; }
}

// =============================================================================================== register
SUB_KITS.tracer = {
  ghost,
  use, hold, tick, clear: clearAll, noArc: true,
  _bolts: bolts,   // test / tooling access
  bot: {
    // snap it at a foe in mid range (it's cheap); while painting, now and then skim one along the ground for puddles
    fight(brain, dist) {
      const go = dist > 3 && dist < 17 && Math.random() < 0.05;
      if (go) brain.bombCd = 2.5 + Math.random() * 3;
      return go;
    },
    paint(brain) {
      const go = Math.random() < 0.006;
      if (go) brain.bombCd = 6 + Math.random() * 6;
      return go;
    },
  },
  // test / tooling access
  _bolts: bolts, _launch: launch, _rebound: rebound,
};
registerSubModel('tracer', () => buildTracer());

// =============================================================================================== icon
{
  const K = '#15121c', DK = '#2b2735', LT = '#e4e8ef';
  const O = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  SUB_ICONS.tracer = (`<svg class="iw-ico " viewBox="0 0 64 64" aria-hidden="true">
    <path d="M4 7 L22 49 L44 38" fill="none" stroke="${K}" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4 7 L22 49 L44 38" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9.5 51.5 Q10 46.5 17 46.5 L27.5 46.5 Q34 46.5 34 51 Q33.5 56.5 26 56 Q22 58.5 18 56 Q10 57 9.5 51.5 Z" fill="currentColor" ${O}/>
    <g transform="rotate(-26.6 50 35)"><g ${O}>
      <path d="M38 31.5 L56 31.5 L63 35 L56 38.5 L38 38.5 Z" fill="${LT}"/>
      <path d="M40 31.5 L35 27 L38 31.5 Z M40 38.5 L35 43 L38 38.5 Z" fill="currentColor"/>
      <rect x="44" y="31.5" width="7" height="7" fill="currentColor"/>
      <path d="M56 31.5 L63 35 L56 38.5 Z" fill="${DK}"/>
    </g></g>
    <path d="M40.5 30.2 L47 27" stroke="#fff" stroke-opacity=".6" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="22" cy="49" r="2.4" fill="#fff"/>`).replace(/\n\s*/g, '') + '</svg>';
}

// =============================================================================================== sounds
// zap (the shot: electric crack + a descending laser sweep), bounce (a bright ricochet ping on a wet slap), hum (loop:
// the trail's electric buzz), hit (a zap into a rising two-note "marked" chime).
SFX.tracer_zap = {
  gain: 0.5, max: 4, jitter: 0.04, reverb: 0.08,
  build(v, p) {
    const T = v.t;
    const g = v.gain(0, v.out), bp = v.filter('bandpass', 2400, 2.5, g);
    const o = v.osc('sawtooth', 2600 * p, T, T + 0.2, bp);
    sweep(o.frequency, T, 2600 * p, 420 * p, 0.17); sweep(bp.frequency, T, 3800 * p, 900 * p, 0.17);
    pts(g.gain, T, [[0, 0], [0.004, 0.8], [0.06, 0.4], [0.2, 0]]);
    v.nz({ ft: 'highpass', f: 4200, a: 0.0003, d: 0.025, peak: 0.9 });                            // crack
    v.tone({ f: 190 * p, f1: 70 * p, sw: 0.06, a: 0.001, d: 0.07, peak: 0.55 });                   // kick
    v.nz({ t: 0.01, f: 1500 * p, f1: 3200 * p, sw: 0.12, q: 1.4, a: 0.01, d: 0.12, peak: 0.35 });   // air
  },
};
SFX.tracer_bounce = {
  gain: 0.45, max: 5, jitter: 0.05, reverb: 0.12, minGap: 0.03,
  build(v, p) {
    v.tone({ type: 'triangle', f: 2900 * p, f1: 1900 * p, sw: 0.09, a: 0.001, d: 0.11, peak: 0.5 });   // ricochet ping
    v.tone({ f: 4400 * p, f1: 3100 * p, sw: 0.05, a: 0.001, d: 0.05, peak: 0.25 });
    v.tone({ f: 160 * p, f1: 60 * p, sw: 0.06, a: 0.001, d: 0.08, peak: 0.6 });                        // slap
    v.nz({ f: v.r(1600, 2100) * p, f1: 600 * p, sw: 0.1, q: 3, a: 0.002, d: 0.12, peak: 0.6 });        // wet splash
    for (let i = 0; i < 3; i++) v.bub(v.t + 0.03 + v.r(0, 0.08), v.r(700, 1300) * p, 0.12, 0.025, 1.8);
  },
};
SFX.tracer_hum = {
  gain: 0.14, max: 4, jitter: 0, reverb: 0.05, oneShot: 1.2,
  loop(v, p) {
    const T = v.t;
    const amp = v.gain(0.5, v.out), lp = v.filter('lowpass', 2400 * p, 1.2, amp);
    const o1 = v.osc('sawtooth', 118 * p, T, null, lp), o2 = v.osc('square', 237 * p, T, null, v.gain(0.25, lp));
    const flick = v.lfo(31, 0.2, amp.gain, T, null, 'triangle');                                       // electric flutter
    const hiss = v.gain(0.06, v.out); v.noise('white', T, null, v.filter('bandpass', 5200, 2, hiss));
    return {
      pitch(q, now) {
        const k = 0.05;
        o1.frequency.setTargetAtTime(118 * q, now, k); o2.frequency.setTargetAtTime(237 * q, now, k);
        lp.frequency.setTargetAtTime(2400 * q, now, k); flick.osc.frequency.setTargetAtTime(31 * q, now, k);
      },
    };
  },
};
SFX.tracer_hit = {
  gain: 0.5, max: 4, jitter: 0.02, reverb: 0.12, minGap: 0.05,
  build(v, p) {
    const T = v.t, g = v.gain(0, v.out), bp = v.filter('bandpass', 3000, 3, g);
    const o = v.osc('sawtooth', 1800 * p, T, T + 0.1, bp);
    sweep(o.frequency, T, 1800 * p, 300 * p, 0.09);
    pts(g.gain, T, [[0, 0], [0.003, 0.7], [0.1, 0]]);
    v.nz({ ft: 'highpass', f: 3500, a: 0.0003, d: 0.02, peak: 0.7 });
    for (const [t, f] of [[0.05, 1568], [0.12, 2349]]) {                                               // "marked" chime
      v.tone({ t, f: f * p, a: 0.002, d: 0.22, peak: 0.3 });
      v.tone({ t, type: 'triangle', f: f * 2 * p, a: 0.001, d: 0.08, peak: 0.08 });
    }
  },
};
