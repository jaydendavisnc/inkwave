// Canopy Brolly (main weapon, kind 'brolly') — see kits/registry.js for the hooks; model + part animation in
// kits/brolly-model.js; tuning in WEAPONS.brolly (config.js).
//
// Fire: each trigger pull fires a narrow cone of ink pellets (core projectiles via fireCustom, damage 0 there). The
//   kit scores pellet hits itself in tick(): it replays the core's integrator + hit test one frame ahead, so a blast's
//   pellets that land together sum into ONE hit per victim (one damage number / hit sound) with per-pellet distance
//   falloff. Holding the trigger with no canopy (broken / launched) repeats the blast at the fire rate.
// Canopy: keep holding after the shot and it unfolds into a shield in front of you (you move slower). It blocks
//   enemy shots, beams and ink (tick pre-scans every projectile's next step, so a shot never slips through to the
//   body behind; blockShot / blockRay cover other callers), soaks bomb blasts (bomb:explode), shows tears + flicker
//   as it wears, breaks at 0 hp and regrows after regrowTime. Held open for launchHold s it LAUNCHES: detaches and
//   slides along the ground as a wall (inks under itself, blocks enemy shots and enemy players, lets allies and
//   their shots through), fading after launchLife s or when shot apart. No canopy until it regrows.
//   Bomb blasts rip into canopies in their radius, and a canopy between a blast and a player on its team takes the
//   blast for them: every bomb emits bomb:explode just before its damage loop, so the kit gives the players it covers
//   a one-frame guard (invuln) for that loop (there is no per-player damage-filter hook for kits).
// Runner state lives in runner.kit (kit.brolly === true); the HUD reticle reads hp / hpMax / state / open / launchK /
//   regrowK straight off it.
import * as THREE from 'three';
import { G, emit, on, clamp, lerp, angleDiff } from '../../core/ctx.js';
import { WEAPONS, PLAYER, weaponRange } from '../../config.js';
import { Physics, Hit } from '../physics.js';
import { MAIN_KITS, netRec } from './registry.js';
import { CHARGES, LONG } from '../bots.js';
import { rumble } from '../actor.js';
import { registerWeaponModel } from '../character-weapons.js';
import { getPlasticMaterial } from '../character-mats.js';
import { WEAPON_ICONS } from '../../ui/ui-icons.js';
import { SFX } from '../../audio/audio.js';
import { pts } from '../../audio/music.js';
import { brollyDef, animateBrolly, canopyOpenGeo, makeFabric, DEPTH, RIM_R } from './brolly-model.js';

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _n = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const _m = new THREE.Vector3(), _x = new THREE.Vector3(), _hb = new THREE.Vector3();
const _hit = new Hit(), _res = { t: 0, dist: 0 };
const W = () => WEAPONS.brolly;

// held canopy (logical shield): a disc facing the aim, centred ahead of the chest (matches the model in the aim pose)
const HELD = { up: 0.9, fwd: 0.62, r: 0.8, pitchMin: -0.5, pitchMax: 0.45 };
// launched canopy: crown this high over the ground; the blocking plane sits half the dome's depth behind the crown
const LAUNCH_H = 0.76, LAUNCH_R = 0.8;
// share of a projectile's damage the canopy takes, by type (flick / swipe / sprinkler drops are sprays; bucket blobs volleys)
const CANOPY_MUL = { drop: 0.25, slosh: 0.5 };

// ---------------------------------------------------------------------------------------------- runner state
function kitOf(r) {
  let k = r.kit;
  if (!k || !k.brolly) {
    const w = W();
    k = r.kit = {
      brolly: true, hp: w.canopyHp, hpMax: w.canopyHp, state: 'ready', regrowT: 0, regrowK: 0, grow: 1,
      open: 0, opening: false, want: false, pressT: 0, openT: 0, launchK: 0, shot: false, prevFire: false, lockRelease: false,
      flash: 0, shake: 0, lastHit: -9, lastUpd: G.time || 0, sndT: -9,
      sh: { held: true, kit: null, owner: r.a, team: r.a.team, C: new THREE.Vector3(), N: new THREE.Vector3(), R: HELD.r, Cp: new THREE.Vector3(), Np: new THREE.Vector3(), prev: false },
    };
    k.sh.kit = k;
  }
  return k;
}

// pellet damage by distance travelled
function pelletDamage(d) {
  const w = W();
  if (d <= w.falloffStart) return w.pelletDamage;
  return lerp(w.pelletDamage, w.pelletDamageFar, clamp((d - w.falloffStart) / (w.falloffEnd - w.falloffStart), 0, 1));
}

// ---------------------------------------------------------------------------------------------- firing
const PELLETS = [];   // { p, id, owner } — live pellets this kit scores
let SEQ = 0, BLAST = 0;
const LOOK = Object.freeze({ vis: 0.068, tail0: 0.55, tailK: 1.1, wob: 0.06, wobF: 24, nose: 0.2, sats: 1 });
// pellet pattern (unit cone): centre, an inner ring of 4, an outer ring of 6 — turned randomly per blast, jittered
const PATTERN = [[0, 0]];
for (let i = 0; i < 4; i++) PATTERN.push([0.42, (i / 4) * Math.PI * 2 + 0.4]);
for (let i = 0; i < 6; i++) PATTERN.push([0.9, (i / 6) * Math.PI * 2]);

function fireBlast(r, w) {
  const a = r.a, PJ = G.projectiles;
  if (a.ink < w.inkPerShot) { r._empty(); r.cooldown = Math.max(r.cooldown, 0.2); return false; }
  a.ink -= w.inkPerShot; a.lastFire = 0;
  r.firingT = 0.35; a.fireFacing = 0.5;
  const m = PJ._muzzle(a, _m.set(0, 0, 0));
  const dir = PJ._aimFrom(a, m, _d);
  PJ._ballistic(m, dir, a.aimPoint, w.projSpeed, w.straightTime, w.pelletGrav, w.pelletDrag, w.range);
  _r.crossVectors(dir, UP); if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0); _r.normalize();
  _u.crossVectors(_r, dir).normalize();
  const cone = Math.tan((a.grounded ? w.spreadDeg : w.spreadAir) * DEG), turn = Math.random() * Math.PI * 2;
  const n = Math.min(w.pellets, PATTERN.length);
  BLAST++;
  for (let i = 0; i < n; i++) {
    const [pr, pa] = PATTERN[i];
    const ang = pa + turn, jx = (Math.random() - 0.5) * 0.18, jy = (Math.random() - 0.5) * 0.18;
    const ox = (pr * Math.cos(ang) + jx) * cone, oy = (pr * Math.sin(ang) + jy) * cone * 0.72;
    _v.copy(dir).addScaledVector(_r, ox).addScaledVector(_u, oy).normalize();
    const p = PJ.fireCustom(a, m, _v, {
      // one speed for the whole blast (± a hair): the pellets arrive together, so a blast lands as one hit
      type: 'shot', speed: w.projSpeed * (0.985 + Math.random() * 0.03), range: w.range, life: w.pelletLife, damage: 0, radius: w.pelletPaint * (0.85 + Math.random() * 0.3),
      size: w.pelletSize, grav: w.pelletGrav, drag: w.pelletDrag, straight: w.straightTime, weaponId: 'brolly', trailEvery: 0,
      look: { ...LOOK, vis: LOOK.vis * (i === 0 ? 1.25 : 0.85 + Math.random() * 0.3) },
    });
    p.life = w.pelletLife;
    p._bid = ++SEQ;
    PELLETS.push({ p, id: p._bid, owner: a, blast: BLAST });
  }
  const near = a.isLocal || a._nearCamera();
  if (near) {
    G.audio?.play('brolly_blast', { pos: a.isLocal ? undefined : m, volume: a.isLocal ? 0.7 : 0.5 });
    G.fx?.muzzle(m, dir, a.color, 'blaster');
  }
  if (a.isLocal) emit('recoil', { amount: 0.011 });
  emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone() });
  a.character.trigger('shoot');
  rumble(a, 0.22, 0.3, 80);
  r.cooldown = w.fireInterval;
  STATS.blasts++;
  return true;
}

// ---------------------------------------------------------------------------------------------- per-frame trigger
function update(r, dt, inp, w) {
  const a = r.a, k = kitOf(r);
  k.lastUpd = G.time;
  const bb = a.bot && a.bot._brolly;
  // bots: the canopy only opens when their fight logic asks (bb.holdUntil) — a trigger held to paint, refill or climb
  // repeats blasts instead. A bot holding the canopy keeps it up while its aim settles.
  const botHold = !!bb && bb.holdUntil > G.time && a.form === 'kid' && a.bot.mode === 'fight';
  const fire = inp.fire || botHold;
  const press = fire && !k.prevFire;
  k.prevFire = fire;
  if (press) { k.pressT = 0; k.shot = false; }
  if (fire) k.pressT += dt; else k.lockRelease = false;
  const canopy = k.state === 'ready' && k.grow > 0.6 && !k.lockRelease;
  const shieldMode = canopy && (!bb || botHold);
  let want = false;
  if (fire && !k.lockRelease) {
    if (shieldMode) {
      // tap = one blast; hold = the blast, then the canopy unfolds
      if (!k.shot && r.cooldown <= 0 && k.open < 0.05 && k.pressT <= w.openDelay + 0.06) { fireBlast(r, w); k.shot = true; }
      want = k.pressT >= w.openDelay;
    } else if (r.cooldown <= 0) fireBlast(r, w);
  }
  if (!fire && r.cooldown < 0) r.cooldown = 0;
  // unfold / fold
  const was = k.open;
  if (want) k.open = Math.min(1, k.open + dt / w.openTime); else k.open = Math.max(0, k.open - dt / w.closeTime);
  k.opening = k.open > was || (k.open >= 1 && k.opening);
  if (was <= 0 && k.open > 0) { sound(a, 'brolly_open', 0.6); STATS.opens++; }
  if (k.want && !want && was > 0.4) sound(a, 'brolly_close', 0.5);
  k.want = want;
  if (k.open > 0) { a.fireFacing = 0.5; a.lastFire = 0; r.firingT = Math.max(r.firingT, 0.2); }
  // held fully open → launch
  if (k.open >= 1 && want) {
    k.openT += dt;
    if (k.openT >= w.launchHold) launch(r, k, w);
  } else k.openT = 0;
  k.launchK = k.state === 'ready' ? clamp(k.openT / w.launchHold, 0, 1) : 0;
}

function sound(a, name, vol, pitch) {
  if (!G.audio || !(a.isLocal || a._nearCamera())) return;
  G.audio.play(name, { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? vol : vol * 0.7, pitch });
}

// ---------------------------------------------------------------------------------------------- shields
const LAUNCHED = [];   // world canopies
const STATS = { blasts: 0, opens: 0, blocked: 0, blockedDmg: 0, launches: 0, breaks: 0, guarded: 0 };   // (tests / tuning)
const SH = [];         // active shields this frame (held + launched)
let SH_T = -1;         // G.time of the last refresh (blockShot / blockRay reuse it within a frame)

function heldPose(a, s) {
  const yaw = a.aimYaw, p = clamp(a.aimPitch, HELD.pitchMin, HELD.pitchMax), cp = Math.cos(p);
  s.N.set(Math.sin(yaw) * cp, Math.sin(p), Math.cos(yaw) * cp);
  s.C.set(a.pos.x, a.pos.y + (a.smoothY || 0) + HELD.up, a.pos.z).addScaledVector(s.N, HELD.fwd);
  s.team = a.team; s.owner = a;
}
function refreshShields() {
  SH.length = 0; SH_T = G.time;
  for (const a of G.actors || []) {
    if (a.weapon?.kind !== 'brolly') continue;
    const k = a.weaponRunner?.kit;
    if (!k || !k.brolly) continue;
    if (!a.alive || a.form !== 'kid' || k.state !== 'ready' || k.open < 0.55 || k.grow < 0.9) { k.sh.prev = false; continue; }
    heldPose(a, k.sh); SH.push(k.sh);
  }
  for (const c of LAUNCHED) if (c.alive) SH.push(c.sh);
  for (const s of SH) if (!s.prev) { s.Cp.copy(s.C); s.Np.copy(s.N); s.prev = true; }
  return SH;
}
// end of the frame: this pose becomes the swept test's start pose
function snapShields() { for (const s of SH) { s.Cp.copy(s.C); s.Np.copy(s.N); } }
// segment prev→pos through shield s, either direction. Swept: prev is measured against the shield's pose at the
// start of the frame and pos against its pose now, so a canopy moving / turning onto a shot can't skip past it.
function segShield(prev, pos, s, out) {
  const a = _v3.copy(prev).sub(s.Cp).dot(s.Np), b = _v3.copy(pos).sub(s.C).dot(s.N);
  if ((a > 0) === (b > 0) || a === b) return false;
  out.lerpVectors(prev, pos, a / (a - b));
  return out.distanceToSquared(s.C) < s.R * s.R;
}
// hp / flash / sound state: the runner's kit for a held canopy, the canopy record for a launched one
function hpOf(s) { return s.held ? s.kit : s.ref; }
function hitShield(s, at, dmg, color, from) {
  const o = hpOf(s);
  if (o.hp <= 0 || !(dmg > 0)) return;
  o.hp -= dmg; o.lastHit = G.time; STATS.blocked++; STATS.blockedDmg += dmg;
  o.flash = Math.min(1, (o.flash || 0) + 0.3 + dmg / 140);
  o.shake = Math.min(1, (o.shake || 0) + 0.25 + dmg / 120);
  const nearCam = G.camera && G.camera.position.distanceToSquared(at) < 26 * 26;
  if (nearCam) {
    // ink splashing off the canopy (toward the side it came from)
    _n.copy(s.N); if (from && _v2.copy(from).sub(s.C).dot(s.N) < 0) _n.negate();
    G.fx?.burst(at, _n, color, { count: dmg > 40 ? 9 : 4, speed: dmg > 40 ? 3.4 : 2.4, size: dmg > 40 ? 0.085 : 0.065 });
    if (G.time - (o.sndT || -9) > 0.07) {
      o.sndT = G.time;
      const local = s.owner && s.owner.isLocal && s.held;
      G.audio?.play('brolly_hit', { pos: local ? undefined : at, volume: clamp(0.35 + dmg / 90, 0.35, 0.9) * (local ? 0.8 : 0.65), pitch: dmg > 60 ? 0.8 : 1 });
    }
  }
  if (s.held && s.owner?.isLocal) rumble(s.owner, 0.05 + Math.min(0.3, dmg / 300), 0.12, 50);
  if (o.hp <= 0) breakShield(s);
}
function breakShield(s) {
  const o = hpOf(s), w = W();
  o.hp = 0; STATS.breaks++;
  const col = G.teamColors?.[s.team] || s.owner?.color;
  if (G.camera && G.camera.position.distanceToSquared(s.C) < 40 * 40) {
    G.fx?.burst(s.C, s.N, col, { count: 22, speed: 5.2, size: 0.11, spread: 1.6 });
    G.fx?.burst(s.C, _n.copy(s.N).negate(), new THREE.Color('#f4efe4'), { count: 10, speed: 3.5, size: 0.08, spread: 1.4 });
    G.fx?.ring?.(s.C, s.N, col, { radius: RIM_R * 1.2, life: 0.3, snap: false });
    G.audio?.play('brolly_break', { pos: s.held && s.owner?.isLocal ? undefined : s.C, volume: 0.85 });
  }
  if (s.held) {
    const k = s.kit;
    k.state = 'broken'; k.regrowT = w.regrowTime; k.regrowK = 0; k.open = 0; k.grow = 0; k.openT = 0; k.lockRelease = true;
    if (s.owner?.isLocal) { rumble(s.owner, 0.45, 0.4, 160); emit('shake', { amount: 0.25 }); }
  } else o.alive = false;
  emit('brolly:break', { actor: s.owner, pos: s.C.clone(), team: s.team, launched: !s.held });
}

// damage a projectile deals to a canopy
function projDamage(p) {
  if (p._bid && p.weaponId === 'brolly') return pelletDamage(p.start.distanceTo(p.pos));
  let d = p.damage || 10;
  if (p.type === 'drop') d = lerp(p.damage || 10, p.dmgFar ?? p.damage ?? 10, clamp(p.start.distanceTo(p.pos) / 7, 0, 1));
  return d * (CANOPY_MUL[p.type] ?? 1);
}
// where a core projectile will be after this frame's step (the exact integrator Projectiles.update runs next)
function predict(p, dt, out) {
  const age = p.age + dt, g = age > p.straight;
  let vx = p.vel.x, vy = p.vel.y, vz = p.vel.z;
  if (g) vy -= p.grav * dt;
  if (p.drag) { const f = 1 - p.drag * dt * (g ? 1 : 0); vx *= f; vy *= f; vz *= f; }
  return out.set(p.pos.x + vx * dt, p.pos.y + vy * dt, p.pos.z + vz * dt);
}

// ---------------------------------------------------------------------------------------------- launched canopy
function launch(r, k, w) {
  const a = r.a;
  const yaw = a.aimYaw, dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  // start where the held canopy was, settle onto the ground just ahead
  const g = G.physics.raycast(_v.set(a.pos.x + dir.x * 0.9, a.pos.y + 1.2, a.pos.z + dir.z * 0.9), DOWN, 3.5, _hit, true);
  const pos = g.hit ? g.point.clone() : new THREE.Vector3(a.pos.x + dir.x * 0.9, a.pos.y, a.pos.z + dir.z * 0.9);
  const hp = Math.max(k.hp, w.canopyHp * 0.5), h0 = a.pos.y + (a.smoothY || 0) + HELD.up - pos.y;
  addLaunched(a, pos, dir, hp, h0, false);
  netRec(a, 'brolly', [r2(pos.x), r2(pos.y), r2(pos.z), r3(dir.x), r3(dir.z), Math.round(hp), r2(h0)]);
  STATS.launches++;
  k.state = 'launched'; k.regrowT = w.regrowTime; k.regrowK = 0; k.open = 0; k.grow = 0; k.openT = 0; k.launchK = 0; k.lockRelease = true;
  sound(a, 'brolly_launch', 0.8);
  if (a.isLocal) emit('recoil', { amount: 0.008 });
  rumble(a, 0.3, 0.35, 120);
  emit('brolly:launch', { actor: a, pos: pos.clone(), dir: dir.clone() });
}
// a launched canopy in the world. ghost: a remote player's (online) — it slides, blocks shots and holds players back
// like the owner's (solid on every screen), but never paints (its stripe is the owner's to send)
function addLaunched(a, pos, dir, hp, h0, ghost) {
  const w = W();
  const c = {
    held: false, alive: true, owner: a, team: a.team, pos: pos.clone(), dir: dir.clone(), t: 0, life: w.launchLife, hp, hpMax: w.canopyHp,
    vy: 0, paintAcc: 0, shoving: false, h0, flash: 0, shake: 0, sndT: -9, fxT: 0, ghost,
    sh: null, mesh: null, mats: null,
  };
  c.sh = { held: false, kit: null, ref: c, owner: a, team: a.team, C: new THREE.Vector3(), N: c.dir.clone(), R: LAUNCH_R, Cp: new THREE.Vector3(), Np: c.dir.clone(), prev: false };
  buildLaunchedMesh(c);
  LAUNCHED.push(c);
  if (ghost) sound(a, 'brolly_launch', 0.8);
  return c;
}
function buildLaunchedMesh(c) {
  const geo = canopyOpenGeo();
  const col = G.teamColors?.[c.team] || c.owner.color;
  const ink = makeFabric(col, true), cream = makeFabric(new THREE.Color(1, 1, 1), false);
  ink.transparent = cream.transparent = true;
  const root = new THREE.Group(), inner = new THREE.Group();
  const mi = new THREE.Mesh(geo.ink, ink), mc = new THREE.Mesh(geo.cream, cream), mh = new THREE.Mesh(geo.hub, getPlasticMaterial());
  for (const m of [mi, mc, mh]) { m.castShadow = true; inner.add(m); }
  root.add(inner);
  root.rotation.y = Math.atan2(c.dir.x, c.dir.z);
  G.scene?.add(root);
  c.mesh = root; c.inner = inner; c.mats = [ink, cream];
}
function disposeLaunched(c) {
  if (c.mesh) { c.mesh.parent?.remove(c.mesh); for (const m of c.mats) m.dispose(); }
  c.mesh = null;
}
function updateLaunched(c, dt) {
  c.t += dt;
  const w = W();
  if (c.alive && c.t >= c.life) c.alive = false;
  if (!c.alive) {
    // fade out (or collapse, when shot apart)
    c.fade = (c.fade || 0) + dt / (c.hp <= 0 ? 0.18 : 0.45);
    if (c.fade >= 1) { disposeLaunched(c); return false; }
  } else {
    // slide: stop at walls; ease off while shoving an enemy
    const sp = w.launchSpeed * (c.shoving ? 0.6 : 1) * Math.min(1, 0.35 + c.t * 3);
    c.shoving = false;
    const step = sp * dt;
    let blocked = false;
    for (const hgt of [0.3, 1.0]) {
      _v.copy(c.pos); _v.y += hgt;
      if (G.physics.raycast(_v, c.dir, 0.12 + step, _hit, true).hit) { blocked = true; break; }
    }
    if (!blocked) {
      c.pos.addScaledVector(c.dir, step);
      // ground: step up small lips, follow slopes down, fall off edges (and into the sea)
      const g = G.physics.raycast(_v.set(c.pos.x, c.pos.y + 0.6, c.pos.z), DOWN, 1.5, _hit, true);
      if (g.hit && g.point.y > c.pos.y - 0.12 - Math.max(0, -c.vy) * dt - 0.02 && c.vy <= 0.01) { c.pos.y = g.point.y; c.vy = 0; }
      else { c.vy -= 24 * dt; c.pos.y += c.vy * dt; if (g.hit && c.pos.y < g.point.y) { c.pos.y = g.point.y; c.vy = 0; } }
      if (c.pos.y < PLAYER.waterY - 0.4) { c.alive = false; c.hp = 0; }
      // ink the ground under it: a stripe the canopy's width
      c.paintAcc += step;
      if (c.paintAcc >= 0.32 && c.vy === 0) {
        c.paintAcc = 0;
        _v.set(c.pos.x, c.pos.y + 0.3, c.pos.z);
        const area = G.paint.splat(_v, w.launchPaint, c.team, { seed: Math.random(), kind: 'roll', stretch: c.dir });
        const o = c.owner; if (o) { if (o.specialActive) o.addTurfNoSpecial(area); else o.addTurf(area); }
      }
    }
  }
  // blocking shield (crown ahead, plane at mid-depth)
  const hNow = LAUNCH_H + (c.h0 - LAUNCH_H) * Math.max(0, 1 - c.t / 0.22);
  c.sh.C.set(c.pos.x, c.pos.y + hNow, c.pos.z).addScaledVector(c.dir, -DEPTH * 0.5);
  c.sh.N.copy(c.dir);
  // mesh
  if (c.mesh) {
    c.flash = Math.max(0, c.flash - dt * 6); c.shake *= Math.exp(-dt * 12);
    const fade = c.alive ? 0 : c.fade || 0, k = 1 - fade;
    c.mesh.position.set(c.pos.x, c.pos.y, c.pos.z);
    c.inner.position.set(0, hNow + 0.012 * Math.sin(c.t * 11), 0);
    c.inner.rotation.set(-0.08 * c.shake, 0, 0.035 * Math.sin(c.t * 7.3));
    const s = c.hp <= 0 ? 1 + 0.4 * fade : 1 - 0.25 * fade;
    c.inner.scale.set(s, s, c.hp <= 0 ? Math.max(0.05, 1 - fade) : s);
    const col = G.teamColors?.[c.team] || c.owner.color;
    const low = c.hp / c.hpMax < 0.25 && Math.sin(c.t * 37) * Math.sin(c.t * 23.3) > 0.2 ? 0.35 : 0;
    c.mats[0].emissive.copy(col).multiplyScalar(0.5 * c.flash + low);
    c.mats[1].emissive.setRGB(1, 1, 1).multiplyScalar(0.45 * c.flash + low * 0.6);
    for (const m of c.mats) m.opacity = k;
    // a spray of ink kicked up at the leading edge
    c.fxT -= dt;
    if (c.alive && c.fxT <= 0 && G.camera && G.camera.position.distanceToSquared(c.pos) < 28 * 28) {
      c.fxT = 0.22;
      G.fx?.burst(_v.copy(c.pos).addScaledVector(c.dir, 0.05), _v2.copy(c.dir).setY(0.8).normalize(), col, { count: 3, speed: 1.8, size: 0.05, sheet: false });
    }
  }
  return true;
}
// enemy players can't pass a launched canopy: push them back out to the side they're on (allies walk through)
function blockActors(c) {
  if (!c.alive) return;
  const N = c.dir, tx = -N.z, tz = N.x, rr = PLAYER.radius + 0.18;
  for (const e of G.actors || []) {
    if (!e.alive || e.team === c.team) continue;
    const dx = e.pos.x - c.pos.x, dz = e.pos.z - c.pos.z, dy = e.pos.y - c.pos.y;
    if (dy < -1.2 || dy > 1.6) continue;
    const along = dx * tx + dz * tz;
    if (Math.abs(along) > LAUNCH_R + PLAYER.radius * 0.6) continue;
    const across = dx * N.x + dz * N.z + DEPTH * 0.5;   // from the blocking plane
    if (Math.abs(across) >= rr) continue;
    const side = across >= 0 ? 1 : -1, push = side * rr - across;
    e.pos.x += N.x * push; e.pos.z += N.z * push;
    const vn = e.vel.x * N.x + e.vel.z * N.z;
    if (vn * side < 0) { e.vel.x -= N.x * vn; e.vel.z -= N.z * vn; }
    if (side > 0) c.shoving = true;   // shoving someone along slows it (next frame)
  }
}

// ---------------------------------------------------------------------------------------------- per-frame (world)
const PEND = new Map(), LIVE = new Set(), MERGE = 1 / 30;
function tick(dt) {
  const w = W();
  // runner-side timers (run even while a special owns the body / the runner is idle)
  for (const a of G.actors || []) {
    if (a.weapon?.kind !== 'brolly') continue;
    const r = a.weaponRunner, k = r?.kit;
    if (!k || !k.brolly) continue;
    if (G.time - k.lastUpd > 0.1 || !a.alive || a.form !== 'kid') { k.want = false; k.open = Math.max(0, k.open - dt / w.closeTime); k.openT = 0; }
    if (k.state !== 'ready') {
      k.regrowT -= dt; k.regrowK = clamp(1 - k.regrowT / w.regrowTime, 0, 1);
      if (k.regrowT <= 0) {
        k.state = 'ready'; k.hp = k.hpMax; k.grow = 0.001; k.regrowK = 1;
        if (a.alive) {
          sound(a, 'brolly_regrow', 0.6);
          if (a._nearCamera() || a.isLocal) { a.character.getMuzzle?.(_v); G.fx?.burst(_v, UP, a.color, { count: 6, speed: 1.6, size: 0.05, sheet: false }); }
        }
      }
    } else {
      if (k.grow < 1) k.grow = Math.min(1, k.grow + dt / 0.32);
      if (k.open <= 0 && G.time - k.lastHit > w.canopyRegenDelay) k.hp = Math.min(k.hpMax, k.hp + w.canopyRegen * dt);
    }
    k.flash = Math.max(0, k.flash - dt * 6); k.shake *= Math.exp(-dt * 12);
  }
  // launched canopies move first (their shields must be where they are this frame)
  const nm = G.netm;
  for (let i = LAUNCHED.length - 1; i >= 0; i--) {
    const c = LAUNCHED[i], gm = c.ghost && nm;   // (a ghost canopy's stripe is its owner's to send)
    if (gm) nm.mute++;
    let keep = true;
    try { keep = updateLaunched(c, dt); } finally { if (gm) nm.mute--; }
    if (!keep) LAUNCHED.splice(i, 1);
  }
  refreshShields();
  // 1) every projectile's next step vs every enemy canopy: blocked shots end on the canopy (before the body behind it)
  const PJ = G.projectiles, list = PJ.list;
  if (SH.length) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (!p.owner || (p.delay > 0 && p.delay - dt > 0)) continue;
      predict(p, dt, _v);
      for (const s of SH) {
        if (s.team === p.team) continue;
        if (!segShield(p.pos, _v, s, _x)) continue;
        hitShield(s, _x, projDamage(p), p.owner.color, p.pos);
        if (p._bid > 0) p._bid = -p._bid;
        PJ.removeShot(p);
        break;
      }
    }
  }
  // 2) this kit's pellets vs enemy bodies: one summed hit per victim per frame. A pellet that is no longer in the
  // live list died last frame (wall, canopy, curtain …); one that scores here dies in the core pass right after.
  if (PELLETS.length) { LIVE.clear(); for (const p of list) if (p._bid > 0) LIVE.add(p); }
  for (let i = PELLETS.length - 1; i >= 0; i--) {
    const e = PELLETS[i], p = e.p;
    if (p._bid !== e.id || !LIVE.has(p)) { PELLETS[i] = PELLETS[PELLETS.length - 1]; PELLETS.pop(); continue; }
    predict(p, dt, _v);
    // Boss Battle: pellets into HULLBREAKER / a crablet add up per blast the same way (one hit; the core pass ends
    // the pellet there)
    if (G.boss) {
      const bh = G.boss.segHit(p.pos, _v, p.size);
      if (bh) {
        const key = e.blast * 64 + 63;
        let rec = PEND.get(key);
        if (!rec) PEND.set(key, (rec = { owner: e.owner, boss: bh.target, point: bh.point.clone(), dmg: 0, n: 0, at: G.time + MERGE }));
        rec.dmg += pelletDamage(p.start.distanceTo(bh.point)); rec.n++;
        p._bid = -p._bid;
        continue;
      }
    }
    for (const v of G.actors || []) {
      if (v.team === p.team || !v.alive) continue;
      const h = v.hitH || (v.form === 'squid' ? PLAYER.squidHeight : PLAYER.height), hr = v.hitR || PLAYER.radius;
      if (Math.abs(v.pos.x - _v.x) > 3 + hr || Math.abs(v.pos.z - _v.z) > 3 + hr) continue;
      Physics.segmentCapsuleDist(p.pos, _v, _hb.set(v.pos.x, v.pos.y + (v.smoothY || 0), v.pos.z), hr, h, _res);
      if (_res.dist < hr * 0.95 + p.size) {
        _x.lerpVectors(p.pos, _v, _res.t);
        // pellets of one blast reaching the same body within MERGE s land as one hit
        const key = e.blast * 64 + (G.actors.indexOf(v) & 63);
        let rec = PEND.get(key);
        if (!rec) PEND.set(key, (rec = { owner: e.owner, victim: v, dmg: 0, n: 0, at: G.time + MERGE }));
        rec.dmg += pelletDamage(p.start.distanceTo(_x)); rec.n++;
        p._bid = -p._bid;   // scored: never counted again (the core pass ends it on the same body this frame)
        break;
      }
    }
  }
  for (const [key, rec] of PEND) {
    if (G.time < rec.at - 1e-6) continue;
    PEND.delete(key);
    if (rec.boss) G.boss?.hit(rec.owner, rec.dmg, rec.boss, 'brolly', rec.point); else PJ.applyHit(rec.owner, rec.victim, rec.dmg, 'brolly');
  }
  snapShields();
  // 3) launched canopies hold enemy players back
  for (const c of LAUNCHED) blockActors(c);
}

function clearAll() {
  for (const c of LAUNCHED) disposeLaunched(c);
  LAUNCHED.length = 0; PELLETS.length = 0; SH.length = 0; PEND.clear();
}

// ---------------------------------------------------------------------------------------------- blocking hooks
function blockShot(prev, pos, team, dmg) {
  if (SH_T !== G.time) refreshShields();
  if (!SH.length) return false;
  for (const s of SH) {
    if (s.team === team) continue;
    if (!segShield(prev, pos, s, _x)) continue;
    hitShield(s, _x, dmg, G.teamColors?.[team] || s.owner.color, prev);
    return true;
  }
  return false;
}
function blockRay(from, dir, len, team, dmg) {
  if (SH_T !== G.time) refreshShields();
  if (!SH.length) return len;
  let best = len, hit = null;
  for (const s of SH) {
    if (s.team === team) continue;
    const dn = dir.dot(s.N);
    if (Math.abs(dn) < 1e-4) continue;
    const t = _v.copy(s.C).sub(from).dot(s.N) / dn;
    if (t <= 0 || t >= best) continue;
    _v2.copy(from).addScaledVector(dir, t);
    if (_v2.distanceToSquared(s.C) > s.R * s.R) continue;
    best = t; hit = s;
  }
  if (hit) hitShield(hit, _x.copy(from).addScaledVector(dir, best), dmg, G.teamColors?.[team] || hit.owner.color, from);
  return best;
}
// bomb blasts: canopies between the blast and players on their team take it for them (a guard for the damage loop
// that follows this event), and every canopy in the radius is ripped into
on('bomb:explode', (e) => {
  if (!e || !e.pos || !G.actors) return;
  const R = e.radius || 3;
  refreshShields();
  if (!SH.length) return;
  for (const v of G.actors) {
    if (!v.alive || v.team === e.team) continue;
    _v.set(v.pos.x, v.pos.y + (v.smoothY || 0) + 0.7, v.pos.z);
    if (_v.distanceTo(e.pos) > R + 0.6) continue;
    for (const s of SH) if (s.team === v.team && segShield(e.pos, _v, s, _x)) { v.invuln = Math.max(v.invuln, 1e-4); STATS.guarded++; break; }
  }
  for (const s of SH.slice()) {
    if (s.team === e.team) continue;
    const d = Math.max(0, e.pos.distanceTo(s.C) - s.R * 0.5);
    if (d > R) continue;
    const k = 1 - clamp((d - 0.8) / Math.max(0.1, R - 0.8), 0, 1);
    hitShield(s, s.C, lerp(35, 180, k * k), G.teamColors?.[e.team] || new THREE.Color(1, 1, 1), e.pos);
  }
});

// ---------------------------------------------------------------------------------------------- bots
// an enemy charger / long-range weapon lining up on this bot
function lineThreat(a, brain) {
  for (const e of G.actors || []) {
    if (e.team === a.team || !e.alive || (brain?.sight && !brain.sight.sees(e))) continue;   // (one the bot can see)
    const kind = e.weapon?.kind, KB = MAIN_KITS[kind]?.bot;
    if (!(CHARGES[kind] || LONG[kind] || KB?.long || KB?.charges)) continue;
    const r = e.weaponRunner; if (!r || !(r.charging || r.firingT > 0 || r.streaming || r.burstT > 0)) continue;
    const dx = a.pos.x - e.pos.x, dy = a.pos.y + 0.8 - (e.pos.y + 1.1), dz = a.pos.z - e.pos.z, d = Math.hypot(dx, dy, dz);
    if (d > weaponRange(e.weapon) + 3 || d < 1) continue;
    if ((e.aimDir.x * dx + e.aimDir.y * dy + e.aimDir.z * dz) / d < Math.cos(0.14)) continue;
    return e;
  }
  return null;
}
const bot = {
  paintPitch: -0.36,
  fight(brain, ctx) {
    const { a, w, dist, range, dt, move, target } = ctx;
    const k = kitOf(a.weaponRunner);
    const bb = brain._brolly || (brain._brolly = { holdUntil: 0, nextShield: 0, launch: false, advanceUntil: 0 });
    // open the canopy when taking fire, or when a long-range weapon is lining up from roughly ahead
    if (k.state === 'ready' && k.grow > 0.9 && bb.holdUntil <= G.time && G.time >= bb.nextShield && dist < 18) {
      const thr = lineThreat(a, brain);
      const ahead = thr && Math.abs(angleDiff(a.aimYaw, Math.atan2(thr.pos.x - a.pos.x, thr.pos.z - a.pos.z))) < 0.9;
      const hurt = a.lastDamage < 0.45 && a.lastAttacker && a.lastAttacker.alive && Math.abs(angleDiff(a.aimYaw, Math.atan2(a.lastAttacker.pos.x - a.pos.x, a.lastAttacker.pos.z - a.pos.z))) < 1.0;
      const disc = brain.diff?.fireDiscipline ?? 0.8;
      if ((ahead && Math.random() < 0.35 * dt * 60 * disc) || (hurt && Math.random() < 0.2 * dt * 60 * disc)) {
        let allies = 0;
        for (const o of G.actors) if (o !== a && o.alive && o.team === a.team && o.pos.distanceToSquared(a.pos) < 49) allies++;
        const launchIt = dist > 4 && dist < 14 && (allies > 0 || ahead) && Math.random() < (allies > 0 ? 0.45 : 0.2);
        const hold = launchIt ? w.openDelay + w.openTime + w.launchHold + 0.12 : 0.5 + Math.random() * 0.3;
        bb.holdUntil = G.time + hold; bb.launch = launchIt;
        bb.nextShield = G.time + hold + 0.9 + Math.random() * 1.4;
        if (launchIt) bb.advanceUntil = G.time + hold + 2.2;
      }
    }
    if (bb.holdUntil > G.time && k.state === 'ready') {
      if (!bb.launch) move.multiplyScalar(0.4);   // plant behind the canopy (it slows you anyway)
      return true;
    }
    if (bb.holdUntil > G.time) bb.holdUntil = 0;   // broke / launched mid-hold
    // advance behind the canopy we just launched (it slides toward the target)
    if (bb.advanceUntil > G.time && k.state === 'launched') {
      const own = LAUNCHED.find((c) => c.owner === a && c.alive);
      if (own) {
        const bx = own.pos.x - own.dir.x * 1.3 - a.pos.x, bz = own.pos.z - own.dir.z * 1.3 - a.pos.z, bl = Math.hypot(bx, bz);
        if (bl > 0.4) move.set(bx / bl, 0, bz / bl); else move.set(own.dir.x * 0.5, 0, own.dir.z * 0.5);
      }
    }
    return dist < range * 1.1;
  },
  paint(brain, ctx) {
    brain._brolly || (brain._brolly = { holdUntil: 0, nextShield: 0, launch: false, advanceUntil: 0 });
    return ctx.needPaint && ctx.inkFrac > 0.2;
  },
};

// ---------------------------------------------------------------------------------------------- query hook
// Bots (bots.js) route round enemy launched canopies and flank held ones: one stable descriptor per shield, getters read
// its live state (see kits/registry.js `shields`). Read-only: nothing here changes how a canopy behaves.
function shieldOf(s) {
  if (s.info) return s.info;
  const w = W(), c = s.ref;
  s.info = {
    kind: 'brolly', held: s.held, owner: s.owner, C: s.C, N: s.N, R: s.R, hpMax: w.canopyHp, blocksActors: !s.held,
    // launched: foot position (N = its travel direction), half-width it blocks players over, and the blocking plane's
    // offset along N from pos (enemy players are held on their side of it)
    pos: s.held ? null : c.pos, halfW: LAUNCH_R, planeOff: -DEPTH * 0.5, speed: s.held ? 0 : w.launchSpeed,
    get team() { return s.team; },
    get hp() { return Math.max(0, hpOf(s).hp); },
    get live() {
      if (!s.held) return c.alive;
      const a = s.owner, k = s.kit;
      return !!a && a.alive && a.form === 'kid' && a.weaponRunner?.kit === k && k.state === 'ready' && k.open >= 0.55 && k.grow >= 0.9;
    },
    get left() { return s.held ? 0 : Math.max(0, c.life - c.t); },   // launched: seconds until it fades
  };
  return s.info;
}
function shields(out) {
  if (SH_T !== G.time) refreshShields();
  for (const s of SH) out.push(shieldOf(s));
  return out;
}

// ---------------------------------------------------------------------------------------------- registration
// ---------------------------------------------------------------------------------------------- online
// A remote Brolly kid: netState packs its canopy (state 0 ready · 1 broken · 2 launched in bits 0–1, open 0–15 bits 2–5,
// grow 0–7 bits 6–8, hp 0–31 bits 9–13, regrow 0–7 bits 14–16) → netApply rebuilds runner.kit, so its held canopy is
// drawn AND blocks the local player's shots here (refreshShields reads every actor's kit). A launch → ghost: a solid
// sliding canopy (see addLaunched).
const STATE_N = { ready: 0, broken: 1, launched: 2 }, STATE_OF = ['ready', 'broken', 'launched'];
function netState(r) {
  const k = r.kit && r.kit.brolly ? r.kit : null;
  if (!k) return 0;
  const q = (v, n) => Math.max(0, Math.min(n, Math.round(clamp(v, 0, 1) * n)));
  return (STATE_N[k.state] ?? 0) | (q(k.open, 15) << 2) | (q(k.grow, 7) << 6) | (q(k.hp / k.hpMax, 31) << 9) | (q(k.regrowK || 0, 7) << 14);
}
function netApply(r, b) {
  const k = kitOf(r);
  const st = STATE_OF[b & 3] || 'ready';
  const hp = (((b >> 9) & 31) / 31) * k.hpMax;
  if (hp < k.hp - 1) { k.flash = Math.min(1, (k.flash || 0) + 0.4); k.shake = Math.min(1, (k.shake || 0) + 0.3); }   // hit on the owner's screen
  k.state = st; k.hp = hp;
  k.open = ((b >> 2) & 15) / 15; k.grow = ((b >> 6) & 7) / 7; k.regrowK = ((b >> 14) & 7) / 7;
}
function ghost(a, d) {
  if (!Array.isArray(d)) return;
  addLaunched(a, _gp.set(d[0], d[1], d[2]), _gd.set(d[3], 0, d[4]).normalize(), d[5], d[6], true);
}
const _gp = new THREE.Vector3(), _gd = new THREE.Vector3();
const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;

MAIN_KITS.brolly = {
  netState,
  netApply,
  ghost,
  update,
  busy: () => false,
  firingPose: (r) => !!(r.kit && r.kit.brolly && r.kit.open > 0),
  moveSpeed: (r, w) => (r.kit && r.kit.brolly && r.kit.open > 0.2 ? w.moveSpeedShield : 0),
  spreadDeg: (r, w) => (r.a.grounded ? w.spreadDeg : w.spreadAir),
  tick, clear: clearAll, blockShot, blockRay, shields,
  bot,
  // test / tooling access
  _state: { LAUNCHED, PELLETS, SH, STATS, refreshShields, pelletDamage, kitOf },
};
registerWeaponModel('brolly', brollyDef, animateBrolly);

// ---------------------------------------------------------------------------------------------- icon
{
  const K = '#15121c', DK = '#2b2735', LT = '#e4e8ef';
  const O = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  // an open brolly tipped toward the upper right, alternating ink / white panels, J handle, pellets flying off the tip
  WEAPON_ICONS.brolly = `<svg class="iw-ico " viewBox="0 0 64 64" aria-hidden="true"><g transform="translate(31 33) scale(1.14) rotate(30) translate(-30 -33)">
    <g ${O}>
      <path d="M30 34 L30 52 Q30 58.5 24.5 58.5 Q19.5 58.5 19.5 53.5" fill="none" stroke-width="7.5"/>
      <path d="M8 31 Q8 11 30 10 Q52 11 52 31 Q46.5 26.5 41 31 Q35.5 26.5 30 31 Q24.5 26.5 19 31 Q13.5 26.5 8 31 Z" fill="${LT}"/>
    </g>
    <path d="M30 34 L30 52 Q30 58.5 24.5 58.5 Q19.5 58.5 19.5 53.5" fill="none" stroke="#c08a58" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M30 11.5 Q20 15 19 29.6 Q24.5 27 30 30.6 Z" fill="currentColor"/>
    <path d="M30 11.5 Q46 13 50.5 29.2 Q46.5 26.8 41 30.6 Q39 16 30 11.5 Z" fill="currentColor"/>
    <g ${O}><path d="M8 31 Q8 11 30 10 Q52 11 52 31 Q46.5 26.5 41 31 Q35.5 26.5 30 31 Q24.5 26.5 19 31 Q13.5 26.5 8 31 Z" fill="none"/>
      <path d="M30 10.5 Q20 15 19 30 M30 10.5 Q39 16 41 30.5 M30 10.5 L30 30.5" fill="none" stroke-width="2.2"/>
      <rect x="27" y="3.5" width="6" height="7.5" rx="2" fill="${DK}"/></g>
    <path d="M13.5 22 Q17 15 24 13" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2.6" stroke-linecap="round"/>
  </g>
  <g ${O} stroke-width="2.4"><circle cx="54" cy="8.5" r="3.4" fill="currentColor"/><circle cx="60" cy="16.5" r="2.6" fill="currentColor"/><circle cx="47" cy="3.8" r="2.3" fill="currentColor"/></g></svg>`;
}

// ---------------------------------------------------------------------------------------------- sounds
// (same shape as audio.js def(name, {…}); gain/max/jitter/reverb/minGap, build(v, p) with the voice helpers)
SFX.brolly_blast = {
  gain: 0.62, max: 4, jitter: 0.04, reverb: 0.12,
  build(v, p) {
    v.nz({ ft: 'highpass', f: 3200, a: 0.0003, d: 0.012, peak: 0.7 });                                     // valve crack
    v.tone({ f: 175 * p, f1: 46 * p, sw: 0.12, a: 0.001, d: 0.2, peak: 1 });                                // chest thump
    v.nz({ kind: 'pink', ft: 'lowpass', f: 2800, f1: 480, sw: 0.14, q: 1.2, a: 0.001, d: 0.16, peak: 0.95 }); // blast body
    v.nz({ f: 2600 * p, f1: 850 * p, sw: 0.08, q: 2.2, a: 0.001, d: 0.09, peak: 0.65 });                    // spray "pshh"
    v.nz({ t: 0.006, f: 1300 * p, f1: 420 * p, sw: 0.08, q: 5, a: 0.003, d: 0.08, peak: 0.55 });             // wet splort
    for (let i = 0; i < 7; i++) v.bub(v.t + 0.02 + v.r(0, 0.08), v.r(900, 2100) * p, 0.13, v.r(0.012, 0.022), v.r(1.5, 2));   // pellets
    v.nz({ t: 0.03, ft: 'highpass', f: 4800, a: 0.01, d: 0.12, peak: 0.16 });
  },
};
SFX.brolly_open = {
  gain: 0.42, max: 3, jitter: 0.04, reverb: 0.06, minGap: 0.05,
  build(v, p) {
    const T = v.t, g = v.gain(0, v.out), bp = v.filter('bandpass', 420 * p, 1.3, g);
    bp.frequency.setValueAtTime(380 * p, T); bp.frequency.exponentialRampToValueAtTime(2300 * p, T + 0.1);
    pts(g.gain, T, [[0, 0], [0.06, 0.75], [0.11, 0.35], [0.2, 0]]);
    v.noise('pink', T, T + 0.22, bp);                                                                     // fabric whoosh
    v.tone({ t: 0.095, f: 230 * p, f1: 120 * p, sw: 0.06, a: 0.001, d: 0.09, peak: 0.75 });              // canopy catches: "fwump"
    v.nz({ t: 0.1, kind: 'pink', ft: 'lowpass', f: 900, a: 0.001, d: 0.06, peak: 0.5 });
    v.nz({ t: 0.1, f: 3300 * p, q: 3, a: 0.0004, d: 0.012, peak: 0.55 });                                // latch click
    v.tone({ t: 0.1, f: 2150 * p, a: 0.0005, d: 0.035, peak: 0.1 });                                     // ribs ring
  },
};
SFX.brolly_close = {
  gain: 0.3, max: 3, jitter: 0.05, reverb: 0.04, minGap: 0.05,
  build(v, p) {
    const T = v.t, g = v.gain(0, v.out), bp = v.filter('bandpass', 1800 * p, 1.3, g);
    bp.frequency.setValueAtTime(1800 * p, T); bp.frequency.exponentialRampToValueAtTime(500 * p, T + 0.09);
    pts(g.gain, T, [[0, 0], [0.03, 0.6], [0.1, 0]]);
    v.noise('pink', T, T + 0.12, bp);
    v.nz({ t: 0.08, f: 2600 * p, q: 3, a: 0.0004, d: 0.01, peak: 0.45 });                                // clack
    v.tone({ t: 0.08, f: 300 * p, f1: 180 * p, sw: 0.03, a: 0.001, d: 0.04, peak: 0.35 });
  },
};
SFX.brolly_hit = {
  gain: 0.46, max: 5, jitter: 0.08, reverb: 0.05, minGap: 0.04,
  build(v, p) {
    v.tone({ f: 155 * p, f1: 92 * p, sw: 0.05, a: 0.001, d: 0.08, peak: 0.85 });                          // drum-skin thump
    v.tone({ type: 'triangle', f: 310 * p, f1: 200 * p, sw: 0.04, a: 0.001, d: 0.05, peak: 0.25 });
    v.nz({ f: 950 * p, f1: 380 * p, sw: 0.06, q: 2.4, a: 0.001, d: 0.07, peak: 0.6 });                    // wet slap
    v.nz({ ft: 'highpass', f: 3600, a: 0.0005, d: 0.02, peak: 0.25 });
    v.tone({ f: 1450 * p, a: 0.0005, d: 0.05, peak: 0.07 });                                            // rib ring
    v.bub(v.t + v.r(0.02, 0.04), v.r(800, 1300) * p, 0.1, 0.02, 1.8);
  },
};
SFX.brolly_break = {
  gain: 0.6, max: 3, jitter: 0.04, reverb: 0.16,
  build(v, p) {
    let t = 0;
    for (let i = 0; i < 8; i++) { t += v.r(0.008, 0.022); v.nz({ t, f: v.r(1400, 3600) * p, q: v.r(2, 4), a: 0.0008, d: v.r(0.015, 0.03), peak: 0.55 - i * 0.04 }); }   // rip
    v.tone({ f: 240 * p, f1: 58 * p, sw: 0.16, a: 0.001, d: 0.26, peak: 0.85 });                          // collapse
    v.nz({ t: 0.02, kind: 'pink', ft: 'lowpass', f: 2200, f1: 280, sw: 0.22, q: 1.4, a: 0.002, d: 0.3, peak: 0.8 });   // splash
    v.tone({ t: 0.03, f: 2650 * p, f1: 2350 * p, sw: 0.2, a: 0.0005, d: 0.2, peak: 0.12 });              // sprung rib ping
    v.tone({ t: 0.05, f: 3710 * p, a: 0.0005, d: 0.12, peak: 0.06 });
    for (let i = 0; i < 5; i++) v.bub(v.t + 0.06 + v.r(0, 0.18), v.r(600, 1600) * p, 0.14, v.r(0.015, 0.03), v.r(1.4, 2));
  },
};
SFX.brolly_launch = {
  gain: 0.5, max: 3, jitter: 0.04, reverb: 0.12,
  build(v, p) {
    const T = v.t;
    const g = v.gain(0, v.out); pts(g.gain, T, [[0, 0], [0.01, 0.55], [0.3, 0]]);                        // spring "thwang"
    const o = v.osc('sine', 190 * p, T, T + 0.32, g); o.frequency.exponentialRampToValueAtTime(330 * p, T + 0.25);
    const vib = v.lfo(24, 26, o.detune, T, T + 0.32);
    pts(vib.depth.gain, T, [[0, 60], [0.3, 0]]);
    const g2 = v.gain(0, v.out), bp = v.filter('bandpass', 600 * p, 1.2, g2);
    bp.frequency.setValueAtTime(600 * p, T); bp.frequency.exponentialRampToValueAtTime(2600 * p, T + 0.12); bp.frequency.exponentialRampToValueAtTime(700 * p, T + 0.4);
    pts(g2.gain, T, [[0, 0], [0.08, 0.7], [0.42, 0]]);
    v.noise('pink', T, T + 0.44, bp);                                                                    // whoosh
    v.tone({ f: 130 * p, f1: 55 * p, sw: 0.12, a: 0.001, d: 0.16, peak: 0.7 });                          // thunk
    v.nz({ f: 2900 * p, q: 3, a: 0.0004, d: 0.012, peak: 0.5 });                                         // release catch
  },
};
SFX.brolly_regrow = {
  gain: 0.3, max: 2, jitter: 0.02, reverb: 0.2,
  build(v, p) {
    v.nz({ f: 700 * p, f1: 3200 * p, sw: 0.16, q: 2, a: 0.03, d: 0.13, peak: 0.35 });                     // unfurling fwip
    v.tone({ t: 0.1, f: 1318 * p, a: 0.001, d: 0.28, peak: 0.24 });
    v.tone({ t: 0.16, f: 1976 * p, a: 0.001, d: 0.34, peak: 0.2 });
    v.tone({ t: 0.16, f: 3952 * p, a: 0.001, d: 0.12, peak: 0.05 });
  },
};

// tests / online checks
export const BROLLY_DEBUG = { LAUNCHED, STATS, refreshShields };
