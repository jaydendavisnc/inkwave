// Whirl Boomerang (sub kind 'boomerang'): thrown flat along the aim, it spins out ~9 m (stopping short at a wall), hovers
// there shredding anything close (small rapid ticks + ink under it), then whirls back to the thrower, circles them for a
// couple of seconds (grazing foes it touches) and bursts beside them like a small Splat Bomb. Should it hit a foe while
// it flies (out or back), it stops dead, hovers a moment and goes off like a full Splat Bomb instead, without returning.
// One out at a time (blocked() → the core's "Can't use"). If the thrower is splatted while it's out it fizzles: it drops
// and pops in a little splash of ink, no damage (a boomerang already latched onto a foe still goes off, like any bomb).
// Numbers: SUBS.boomerang in config.js. Registers the model, icon, sounds and bot use; see kits/registry.js.
import * as THREE from 'three';
import { G, emit, on, clamp, lerp, angleDiff } from '../../core/ctx.js';
import { SUBS, PLAYER, subViewScale } from '../../config.js';
import { Physics, Hit } from '../physics.js';
import { SUB_KITS, netRec, netId, ghostMute } from './registry.js';
const r3 = (x) => Math.round(x * 1000) / 1000;
import { registerSubModel, getSubDef, GEO_KIT } from '../character-weapons.js';
import { lathe, smoothProfile, sweep } from '../character-geo.js';
import { getPlasticMaterial, getInkMaterial } from '../character-mats.js';
import { SUB_ICONS } from '../../ui/ui-icons.js';
import { SFX, texture } from '../../audio/audio.js';
import { pts } from '../../audio/music.js';
import { THROWN } from '../bots.js';

const KIND = 'boomerang';
const WORLD_SCALE = 2.5;            // the prop is modelled at hand size; in the air it reads bigger (~0.75 m across)
                                    // [sub-view] and is drawn × SUB_VIEW_SCALE.boomerang on top (visual only)
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _hit = new Hit(), _hit2 = new Hit();
const _res = { t: 0, dist: 0 };
const _stats = { own: 0, enemy: 0, empty: 0, n: 0 };
const nearCam = (p, r = 34) => !!G.camera && G.camera.position.distanceToSquared(p) < r * r;

// ================================================================================================= model
// Prop space: the blade lies flat in XZ (spin axis +Y), the elbow hub toward +Z, the two arms sweeping back to ±X.
// Cream plastic arms with a lens section (flatter underneath), a team-ink inlay stripe along both faces of each arm,
// a dark hub with a cream cap (team-ink swirl, metal screw, amber LED on the rim, squid print underneath), a rubber boot
// on one tip and a knurled rubber grip sleeve with a metal ferrule on the other (the left fist holds that tip).
const ARM = [[0, 0.058], [0.05, 0.036], [0.098, -0.002], [0.132, -0.042], [0.148, -0.074]];
const HUB = new THREE.Vector3(0, 0, 0.058);
const armR = (t) => 0.0235 - 0.0085 * t;              // half-width along the arm
const FLAT = 0.3;                                      // thickness : width
const lens = (c, s) => [Math.sign(c) * Math.abs(c) ** 0.85 * (c < 0 ? 0.62 : 1), s];
function buildBoomerang() {
  const { Parts, C, M, at, screw, decal, placeXY, squidShape, hring, led, swirlShapes } = GEO_KIT;
  const P = new Parts(), I = new Parts();
  const up = (Pp, o) => o.set(0, 1, 0);
  let grip = null;
  for (const side of [-1, 1]) {
    const pts3 = ARM.map(([x, z]) => new THREE.Vector3(side * x, 0, z));
    const arm = sweep(pts3, { seg: 22, radial: 18, capSteps: 3, radius: armR, flat: FLAT, outward: up, section: lens });
    P.add(arm.geo, C.cream, M.gloss);
    const cv = arm.curve;
    const sub = (t0, t1, n = 7) => { const o = []; for (let k = 0; k <= n; k++) o.push(t0 + (t1 - t0) * k / n); return o; };
    // ink inlays: a slim raised lens riding each face of the arm
    for (const face of [1, -1]) {
      const ts = sub(0.2, 0.84);
      const pp = ts.map((t) => cv.getPointAt(t).setY(face * armR(t) * FLAT * (face > 0 ? 0.93 : 0.62 * 0.9)));
      I.add(sweep(pp, { seg: 18, radial: 10, capSteps: 3, radius: (u) => armR(lerp(0.2, 0.84, u)) * 0.42, flat: 0.26, outward: up }).geo);
    }
    if (side > 0) {
      // rubber boot over the tip
      const ts = sub(0.88, 1, 3);
      P.add(sweep(ts.map((t) => cv.getPointAt(t)), { seg: 6, radial: 18, capSteps: 3, capStart: false, radius: (u) => armR(lerp(0.88, 1, u)) + 0.0013, flat: 0.34, outward: up, section: lens }).geo, C.rubber, M.rubber);
    } else {
      // grip: metal ferrule, then a knurled rubber sleeve out to the tip
      const tf = sub(0.63, 0.67, 2);
      P.add(sweep(tf.map((t) => cv.getPointAt(t)), { seg: 4, radial: 18, capSteps: 2, radius: (u) => armR(lerp(0.63, 0.67, u)) + 0.0022, flat: 0.4, outward: up, section: lens }).geo, C.metal, M.metal);
      const ts = sub(0.67, 1, 6);
      P.add(sweep(ts.map((t) => cv.getPointAt(t)), { seg: 26, radial: 18, capSteps: 3, capStart: false,
        radius: (u) => armR(lerp(0.67, 1, u)) + 0.0016 + 0.0005 * Math.cos(u * Math.PI * 22), flat: 0.38, outward: up, section: lens }).geo, C.rubber, M.rubber);
      // hand frame: chosen so that in the cocked throw pose the blade's face turns back toward the camera and the rest
      // of it rises up and out past the head (a readable Λ from behind). POSE_* = the left fist's Y / Z axes in that
      // pose (character space: +Z forward, +X left, measured); WANT_* = where the grip arm (tip → hub) and the blade
      // normal should point in the same space.
      const POSE_Y = new THREE.Vector3(0.57, -0.48, 0.66), POSE_Z = new THREE.Vector3(-0.43, -0.86, -0.26);
      const WANT_A = new THREE.Vector3(0.3, 1, -0.1).normalize(), WANT_N = new THREE.Vector3(0.2, 0.3, -0.95);
      WANT_N.addScaledVector(WANT_A, -WANT_N.dot(WANT_A)).normalize();
      const gp = cv.getPointAt(0.84), aP = cv.getTangentAt(0.84).negate().setY(0).normalize(), nP = new THREE.Vector3(0, 1, 0);
      const e3 = new THREE.Vector3().crossVectors(aP, nP), c3 = new THREE.Vector3().crossVectors(WANT_A, WANT_N);
      const toProp = (v) => new THREE.Vector3().addScaledVector(aP, v.dot(WANT_A)).addScaledVector(nP, v.dot(WANT_N)).addScaledVector(e3, v.dot(c3));
      grip = { pos: gp.clone(), handZ: toProp(POSE_Z), handY: toProp(POSE_Y) };
    }
  }
  // hub: dark body, cream cap with an ink ring and swirl, metal screw, amber LED, squid print underneath
  const hx = HUB.x, hz = HUB.z;
  P.add(at(lathe(smoothProfile([[0, -0.0088], [0.029, -0.0088], [0.0322, -0.0045], [0.0322, 0.0052], [0.029, 0.0096], [0, 0.0096]], 10), 30), hx, 0, hz), C.dark, M.gloss);
  P.add(at(lathe([[0, 0.009], [0.0226, 0.009], [0.0234, 0.0116], [0.0212, 0.0136], [0, 0.0138]], 26), hx, 0, hz), C.cream, M.gloss);
  I.add(at(hring(0.0264, 0.0022, 0.0099, 5, 30), hx, 0, hz));
  for (const s of swirlShapes(0.0165, 3, 0.55)) { const g = decal(s, 0.0005); g.rotateX(-Math.PI / 2); I.add(at(g, hx, 0.01375, hz)); }
  screw(P, new THREE.Vector3(hx, 0.0142, hz), UP, 0.0032);
  led(P, new THREE.Vector3(hx, 0.0006, hz + 0.0322), new THREE.Vector3(0, 0, 1), C.amber, 0.0034);
  { const sq = decal(squidShape(0.026)); placeXY(sq, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(hx, -0.0089, hz - 0.002)); P.add(sq, C.decal, M.print); }
  return { kind: KIND, body: P.build(), ink: I.build(), grip };
}
registerSubModel(KIND, buildBoomerang);

// world prop: outer (position) → tilt (bank) → spin (about +Y) → model (centred on the blade's middle, world scale),
// plus a spin-blur disc on the tilt node that fades in with the spin rate
let _proto = null;
function proto() {
  if (_proto) return _proto;
  const d = getSubDef(KIND);
  d.body.computeBoundingBox();
  const bb = d.body.boundingBox, c = new THREE.Vector3((bb.min.x + bb.max.x) / 2, 0, (bb.min.z + bb.max.z) / 2);
  let r = 0; const p = d.body.attributes.position;
  for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i) - c.x, p.getZ(i) - c.z));
  _proto = { d, center: c, radius: r * WORLD_SCALE, disc: new THREE.CircleGeometry(r * WORLD_SCALE * 1.04, 48).rotateX(-Math.PI / 2) };
  return _proto;
}
const BLUR_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BLUR_FS = `
  uniform vec3 uColor; uniform float uAlpha; uniform float uAng; varying vec2 vUv;
  void main(){
    vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
    float a = atan(p.y, p.x) - uAng;
    float arms = pow(0.5 + 0.5 * cos(2.0 * a + r * 2.6), 2.0);          // two smeared blades, swept back
    float band = smoothstep(1.0, 0.8, r) * smoothstep(0.1, 0.34, r);
    float ink = smoothstep(0.38, 0.56, r) * smoothstep(0.86, 0.66, r);
    vec3 cream = vec3(0.93, 0.9, 0.84);
    vec3 c = mix(cream, uColor * 1.15, 0.25 + 0.6 * ink);
    float al = uAlpha * band * (0.22 + 0.78 * arms);
    al += uAlpha * 0.5 * smoothstep(0.86, 0.95, r) * smoothstep(1.0, 0.95, r);   // the tips' bright rim
    gl_FragColor = vec4(c, al);
  }`;
function makeMesh(team, vs = 1) {   // ([sub-view] vs: SUB_VIEW_SCALE.boomerang)
  const P = proto(), col = G.teamColors[team];
  const outer = new THREE.Group(), tilt = new THREE.Group(), spin = new THREE.Group(), model = new THREE.Group();
  model.scale.setScalar(WORLD_SCALE * vs);
  model.position.set(-P.center.x * WORLD_SCALE * vs, 0, -P.center.z * WORLD_SCALE * vs);
  const body = new THREE.Mesh(P.d.body, getPlasticMaterial()); body.castShadow = true;
  const ink = new THREE.Mesh(P.d.ink, getInkMaterial(col)); ink.castShadow = true;
  model.add(body, ink);
  spin.add(model); tilt.add(spin); outer.add(tilt);
  const blur = new THREE.Mesh(P.disc, new THREE.ShaderMaterial({
    uniforms: { uColor: { value: col.clone() }, uAlpha: { value: 0 }, uAng: { value: 0 } },
    vertexShader: BLUR_VS, fragmentShader: BLUR_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  blur.renderOrder = 3; blur.visible = false; blur.scale.setScalar(vs);
  tilt.add(blur);
  outer.userData = { tilt, spin, blur, r: P.radius * vs };   // (r: the drawn blade's reach from its middle)
  return outer;
}

// ================================================================================================= the throw plan
// Start at the throwing hand, flat along the aim (pitch clamped), stop ~range out or short of a wall, never skimming
// the floor. Shared by the throw and the local player's aim guide.
function plan(a, s, out) {
  const pitch = clamp(a.aimPitch, -0.5, 0.25), cp = Math.cos(pitch);
  out.dir.set(Math.sin(a.aimYaw) * cp, Math.sin(pitch), Math.cos(a.aimYaw) * cp);
  out.start.copy(a.pos); out.start.y += 1.35;
  out.start.x += Math.sin(a.aimYaw) * 0.3; out.start.z += Math.cos(a.aimYaw) * 0.3;
  return planFrom(s, out);
}
// the rest of the plan from its start + direction (a ghost's comes from its owner's record)
function planFrom(s, out) {
  const h = G.physics.raycast(out.start, out.dir, s.range + 0.4, _hit);
  out.wall = h.hit;
  out.len = h.hit ? Math.max(0.3, h.dist - 0.4) : s.range;
  if (h.hit) { out.wallPoint.copy(h.point); out.wallNormal.copy(h.normal); }
  out.end.copy(out.start).addScaledVector(out.dir, out.len);
  const gy = G.level.groundHeight(out.end.x, out.end.z, out.end.y + 0.3);
  if (gy > -Infinity && out.end.y - gy < 0.55) out.end.y = gy + 0.55;
  out.ground = gy;
  return out;
}
const newPlan = () => ({ dir: new THREE.Vector3(), start: new THREE.Vector3(), end: new THREE.Vector3(), wallPoint: new THREE.Vector3(), wallNormal: new THREE.Vector3(), len: 0, wall: false, ground: -Infinity });
const _plan = newPlan();

// ================================================================================================= state
const items = [];
const active = (a) => items.some((it) => it.owner === a && it.state !== 'dead');
const chest = (e, out) => out.set(e.pos.x, e.pos.y + (e.form === 'squid' ? 0.3 : 0.75), e.pos.z);
const credit = (it, area) => { if (area > 0) { if (it.sp) it.owner.addTurfNoSpecial(area); else it.owner.addTurf(area); } };
const color = (it) => G.teamColors[it.team];
const bodyH = (e) => (e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height);

function use(subs, a, sub) {
  const P = plan(a, sub, newPlan());
  const it = spawn(subs, a, sub, P, false, netId(a));
  netRec(a, KIND, [0, it.gid, r3(P.start.x), r3(P.start.y), r3(P.start.z), r3(P.dir.x), r3(P.dir.y), r3(P.dir.z)]);
  G.cues?.one('boomerang_throw', { at: a.pos, owner: a, kind: 'throw', sub: true, vol: 0.8 });   // sfx-cues: through the cue mix (heard over a fight)
  emit('sub:use', { actor: a, kind: KIND });
}
// Online, a remote player's boomerang is a ghost: out, hover, home and orbit play the same (its ink is its owner's to
// send, its hits are dropped), but its owner decides how it ends: [3, gid, x, y, z] it caught a foe (armed there),
// [1, gid, x, y, z, big] the burst, [2, gid] it fizzled
function spawn(subs, a, s, P, ghost, gid) {
  const mesh = makeMesh(a.team, subViewScale(KIND));   // [sub-view]
  mesh.position.copy(P.start);
  (G.scene || subs.scene).add(mesh);
  const it = {
    owner: a, team: a.team, sub: s, sp: !!a.specialActive, mesh, state: 'out', t: 0, age: 0,
    pos: P.start.clone(), prev: P.start.clone(), vel: new THREE.Vector3(), plan: P,
    outT: Math.max(0.18, s.outTime * Math.sqrt(P.len / s.range)),
    spinA: Math.random() * 6, spinW: 30, trail: 0, tickT: 0, paintT: 0, fxT: 0,
    hitCd: new Map(), loop: null, loopName: null, fromWall: P.wall, ghost, gid, blasted: false,
  };
  items.push(it);
  setLoop(it, 'boomerang_whirr', 0.55, 1.15);
  return it;
}
function ghost(a, d) {
  if (!Array.isArray(d)) return;
  const [op, gid] = d;
  if (op === 0) {
    if (items.some((x) => x.gid === gid)) return;
    const P = newPlan(); P.start.set(d[2], d[3], d[4]); P.dir.set(d[5], d[6], d[7]).normalize();
    spawn(G.subs, a, SUBS[KIND], planFrom(SUBS[KIND], P), true, gid);
    G.cues?.one('boomerang_throw', { at: a.pos, owner: a, kind: 'throw', sub: true, vol: 0.8 });   // sfx-cues
    return;
  }
  const it = items.find((x) => x.ghost && x.gid === gid && x.state !== 'dead');
  if (!it) return;
  if (op === 3) { it.prev.copy(it.pos); it.pos.set(d[2], d[3], d[4]); arm(it, null); }
  else if (op === 1) { it.pos.set(d[2], d[3], d[4]); const s = it.sub; if (d[5]) blast(it, s.hitRadius, s.hitDamageMax, s.hitDamageMin, s.hitPaintRadius, true); else burst(it); }
  else if (op === 2 && it.state !== 'fizzle') { it.state = 'fizzle'; it.t = 0; it.vel.multiplyScalar(0.25); setLoop(it, null); }
}

function setLoop(it, name, vol, pitch) {
  if (it.loopName === name) { it.loop?.set({ volume: vol, pitch, pos: it.pos }); return; }
  it.loop?.stop(0.12); it.loop = null; it.loopName = name;
  // sfx-cues: the whirr / orbit loops follow it by state from src/audio/cues.js
}

function tick(dt) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.t += dt; it.age += dt;
    it.prev.copy(it.pos);
    ghostMute(it, () => {
      switch (it.state) {
        case 'out': out(it, dt); break;
        case 'hover': hover(it, dt); break;
        case 'back': back(it, dt); break;
        case 'orbit': orbit(it, dt); break;
        case 'armed': armed(it, dt); break;
        case 'fizzle': fizzle(it, dt); break;
      }
    });
    if (it.ghost && it.age > 25) it.state = 'dead';   // (its owner left)
    if (it.state === 'dead') {
      if (!it.ghost && !it.blasted) netRec(it.owner, KIND, [2, it.gid]);
      dispose(it); items.splice(i, 1); continue;
    }
    draw(it, dt);
  }
  guideTick();
}

// ---- outbound: eases from throw speed to a stop at the plan's end point; a foe in the way → armed
function out(it, dt) {
  const P = it.plan, u = clamp(it.t / it.outT, 0, 1), s = P.len * (1 - (1 - u) * (1 - u));
  it.pos.copy(P.start).addScaledVector(P.dir, s);
  it.vel.copy(P.dir).multiplyScalar((2 * P.len / it.outT) * (1 - u));
  it.spinW = lerp(30, 24, u);
  if (!it.ghost && contact(it)) return;
  streak(it, 0.29);
  if (u >= 1) {
    if (it.fromWall) {
      // stopped at a wall: a splat of ink on it where it struck
      credit(it, G.paint.splat(_v.copy(P.wallPoint).addScaledVector(P.wallNormal, 0.1), 0.65, it.team, { seed: Math.random() }));
      if (nearCam(it.pos)) { G.fx?.burst(P.wallPoint, P.wallNormal, color(it), { count: 8, speed: 3, size: 0.07 }); G.audio?.play('ink_hit_wall', { pos: P.wallPoint, volume: 0.6 }); }
    }
    it.state = 'hover'; it.t = 0; it.tickT = 0; it.paintT = 0;
    setLoop(it, 'boomerang_whirr', 0.75, 1.35);
  }
}

// ---- hover: spin fast in place, shred what's close (ticks + device damage), ink the floor under it
function hover(it, dt) {
  const s = it.sub;
  it.spinW = lerp(it.spinW, 34, 1 - Math.exp(-8 * dt));
  it.vel.set(0, 0, 0);
  // settle to a useful height over the floor (thrown off a ledge / aimed low)
  const gy = G.level.groundHeight(it.pos.x, it.pos.z, it.pos.y + 0.2);
  if (gy > -Infinity && it.pos.y - gy < 4.5) {
    const h = it.pos.y - gy, want = h > 1.6 ? gy + 1.1 : h < 0.6 ? gy + 0.8 : it.pos.y;
    it.pos.y = lerp(it.pos.y, want, 1 - Math.exp(-2.5 * dt));
  }
  shred(it, dt, 1);
  if (it.t >= s.hover) startBack(it);
}

// the rapid shredding ticks (hover / armed): foes whose body is within hoverRadius, with a clear line to it
function shred(it, dt, paintK) {
  const s = it.sub;
  it.tickT -= dt;
  if (it.tickT <= 0) {
    it.tickT += 1 / s.tickRate;
    let any = false;
    for (const e of G.actors) {
      if (e.team === it.team || !e.alive) continue;
      if (Physics.pointCapsuleDist(it.pos, e.pos, PLAYER.radius, bodyH(e)) > s.hoverRadius) continue;
      if (!G.physics.los(it.pos, chest(e, _v))) continue;
      G.projectiles.applyHit(it.owner, e, s.tickDamage, KIND);
      any = true;
    }
    G.subs?.damageArea(it.pos, s.hoverRadius, s.tickDamage, it.team);
    if (any && nearCam(it.pos)) G.audio?.play('boomerang_shred', { pos: it.pos, volume: 0.7 });
  }
  it.paintT -= dt;
  if (it.paintT <= 0 && paintK > 0) {
    it.paintT = 0.2;
    const g = G.physics.raycast(it.pos, DOWN, 3.4, _hit2);
    if (g.hit) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.45;
      _v.copy(g.point).add(_v2.set(Math.cos(a) * r, 0.12, Math.sin(a) * r));
      credit(it, G.paint.splat(_v, s.hoverPaint * paintK * (0.8 + Math.random() * 0.4), it.team, { seed: Math.random() }));
    }
  }
}

// ---- return: a curving homing flight back to the thrower (through anything); a foe in the way → armed
function startBack(it) {
  it.state = 'back'; it.t = 0;
  const o = it.owner;
  chest(o, _v).sub(it.pos); _v.y = 0;
  if (_v.lengthSq() < 1e-4) _v.set(0, 0, 1);
  _v.normalize();
  it.vel.set(-_v.z, 0.6, _v.x).multiplyScalar(5.5);          // kicks out to one side first, so it swings home
  if (nearCam(it.pos, 40)) G.audio?.play('boomerang_return', { pos: it.pos, volume: 0.8 });
  setLoop(it, 'boomerang_whirr', 0.6, 1.2);
}
function back(it, dt) {
  const s = it.sub, o = it.owner;
  const tgt = chest(o, _v3); tgt.y += 0.2;
  const sp = Math.min(s.returnSpeed, 4 + it.t * 34);
  _v.copy(tgt).sub(it.pos);
  const d = _v.length();
  _v.multiplyScalar(sp / Math.max(d, 1e-3));
  it.vel.lerp(_v, 1 - Math.exp(-5 * dt));
  it.pos.addScaledVector(it.vel, dt);
  it.spinW = lerp(it.spinW, 26, 1 - Math.exp(-4 * dt));
  if (!it.ghost && contact(it)) return;
  streak(it, 0.22);
  if (it.pos.distanceTo(tgt) < s.orbitRadius + 0.35) {
    it.state = 'orbit'; it.t = 0;
    it.orbitA = Math.atan2(it.pos.z - o.pos.z, it.pos.x - o.pos.x);
    it.from = it.pos.clone();
    it.paintT = 0;
    setLoop(it, 'boomerang_orbit', 0.7, 1);
  } else if (it.t > 3 && !it.ghost) burst(it);              // couldn't catch up (super jump …): goes off where it is
}

// ---- orbit: circles the thrower, grazing foes it touches, lightly inking a ring; then the small burst
function orbit(it, dt) {
  const s = it.sub, o = it.owner;
  it.orbitA += s.orbitSpin * dt;
  const h = o.form === 'squid' ? 0.55 : 0.95;
  _v.set(o.pos.x + Math.cos(it.orbitA) * s.orbitRadius, o.pos.y + h + 0.08 * Math.sin(it.t * 9), o.pos.z + Math.sin(it.orbitA) * s.orbitRadius);
  const k = clamp(it.t / 0.18, 0, 1);
  it.pos.lerpVectors(it.from, _v, k * k * (3 - 2 * k));
  it.vel.set(-Math.sin(it.orbitA), 0, Math.cos(it.orbitA)).multiplyScalar(s.orbitSpin * s.orbitRadius);
  it.spinW = lerp(it.spinW, 30, 1 - Math.exp(-4 * dt));
  for (const e of G.actors) {
    if (e.team === it.team || !e.alive) continue;
    if (Physics.pointCapsuleDist(it.pos, e.pos, PLAYER.radius, bodyH(e)) > PLAYER.radius + 0.4) continue;
    if (G.time - (it.hitCd.get(e) ?? -9) < s.orbitHitCd) continue;
    it.hitCd.set(e, G.time);
    G.projectiles.applyHit(it.owner, e, s.orbitDamage, KIND);
    if (nearCam(it.pos)) G.audio?.play('boomerang_shred', { pos: it.pos, volume: 0.55, pitch: 0.85 });
  }
  it.paintT -= dt;
  if (it.paintT <= 0) {
    it.paintT = 0.1;
    const g = G.physics.raycast(it.pos, DOWN, 2.5, _hit2);
    if (g.hit) credit(it, G.paint.splat(_v.copy(g.point).setY(g.point.y + 0.1), 0.55, it.team, { seed: Math.random() }));
  }
  if (it.t >= s.orbit && !it.ghost) burst(it);   // (a ghost circles on until its owner's burst record)
}

// ---- a foe in its path: stop dead, whirr and blink in place, then a full Splat Bomb
function contact(it) {
  const s = it.sub;
  for (const e of G.actors) {
    if (e.team === it.team || !e.alive || e.invuln > 0) continue;
    Physics.segmentCapsuleDist(it.prev, it.pos, e.pos, PLAYER.radius, bodyH(e), _res);
    if (_res.dist > PLAYER.radius + s.contact) continue;
    it.pos.lerpVectors(it.prev, it.pos, _res.t);
    G.projectiles.applyHit(it.owner, e, s.tickDamage, KIND);
    netRec(it.owner, KIND, [3, it.gid, r3(it.pos.x), r3(it.pos.y), r3(it.pos.z)]);
    arm(it, e);
    return true;
  }
  return false;
}
// caught a foe: stops dead, whirrs and blinks in place, then the full blast
function arm(it, e) {
  const s = it.sub;
  {
    it.state = 'armed'; it.t = 0; it.tickT = 1 / s.tickRate; it.paintT = 0; it.beepT = 0; it.victim = e;
    it.vel.set(0, 0, 0);
    if (nearCam(it.pos, 40)) G.fx?.burst(it.pos, UP, color(it), { count: 10, speed: 3.5, size: 0.08 });
    G.cues?.sub(KIND, 'beep', { owner: it.owner, team: it.team, at: it.pos, target: e, radius: s.hitRadius, pitch: 0.9 });   // sfx-cues: caught one
    setLoop(it, 'boomerang_whirr', 0.85, 1.6);
    emit('sub:arm', { kind: KIND, pos: it.pos.clone(), team: it.team, radius: s.hitRadius });
  }
}
function armed(it, dt) {
  const s = it.sub, k = clamp(it.t / s.hitFuse, 0, 1);
  it.spinW = lerp(it.spinW, 44, 1 - Math.exp(-6 * dt));
  shred(it, dt, 0);
  it.beepT -= dt;
  if (it.beepT <= 0) { it.beepT = lerp(0.2, 0.08, k); G.cues?.sub(KIND, 'beep', { owner: it.owner, team: it.team, at: it.pos, target: it.victim, radius: s.hitRadius, vol: 0.6 + 0.4 * k, pitch: 1 + 0.35 * k }); }   // sfx-cues
  if (it.t >= s.hitFuse && !it.ghost) blast(it, s.hitRadius, s.hitDamageMax, s.hitDamageMin, s.hitPaintRadius, true);
}

// ---- the thrower was splatted: drop out of the air and pop (ink, no damage)
function fizzle(it, dt) {
  it.vel.y -= 20 * dt; it.vel.x *= 1 - 2 * dt; it.vel.z *= 1 - 2 * dt;
  it.pos.addScaledVector(it.vel, dt);
  it.spinW = Math.max(0, it.spinW - 50 * dt);
  const g = G.physics.segment(it.prev, it.pos, _hit2);
  if (g.hit || it.t > 0.7 || it.pos.y < PLAYER.waterY - 1) {
    const c = g.hit ? g.point : it.pos;
    if (it.pos.y > PLAYER.waterY) credit(it, G.paint.splat(_v.copy(c).setY(c.y + 0.15), 0.8, it.team, { seed: Math.random() }));
    if (nearCam(c, 40)) { G.fx?.burst(c, g.hit ? g.normal : UP, color(it), { count: 12, speed: 3, size: 0.08 }); G.audio?.play('splat_small', { pos: c, volume: 0.8, pitch: 0.9 }); }
    it.state = 'dead';
  }
}
on('splatted', ({ victim }) => {
  for (const it of items) {
    if (it.owner !== victim || it.state === 'dead' || it.state === 'armed' || it.state === 'fizzle') continue;
    it.state = 'fizzle'; it.t = 0;
    it.vel.multiplyScalar(0.25);
    setLoop(it, null);
  }
});

// ---- bursts
function burst(it) { const s = it.sub; blast(it, s.radius, s.damageMax, s.damageMin, s.paintRadius, false); }
function blast(it, radius, dmgMax, dmgMin, paintR, big) {
  const c = it.pos.clone();
  if (!it.ghost) netRec(it.owner, KIND, [1, it.gid, r3(c.x), r3(c.y), r3(c.z), big ? 1 : 0]);
  it.blasted = true;
  // ink: on the floor under it (the burst is in the air) plus around the burst itself
  const g = G.physics.raycast(c, DOWN, 3.2, _hit2);
  const pc = g.hit ? _v.copy(g.point).setY(g.point.y + 0.2) : _v.copy(c);
  let area = G.paint.splat(pc, paintR, it.team, { seed: Math.random() });
  for (let k = 0; k < (big ? 5 : 4); k++) {
    const a = Math.random() * Math.PI * 2, rr = paintR * (0.55 + Math.random() * 0.45);
    area += G.paint.splat(_v2.set(pc.x + Math.cos(a) * rr, pc.y + 0.4, pc.z + Math.sin(a) * rr), 0.5 + Math.random() * 0.4, it.team, { seed: Math.random() });
  }
  if (!g.hit || c.y - g.point.y > 1.2) area += G.paint.splat(c, paintR * 0.6, it.team, { seed: Math.random() });
  credit(it, area);
  G.fx?.explosion(c, color(it), big ? radius : radius * 0.85);
  if (big) G.cues?.sub(KIND, 'boom', { owner: it.owner, team: it.team, at: c }); else G.audio?.play('boomerang_burst', { pos: c });   // sfx-cues: the big one's own blast
  emit('shake', { pos: c.clone(), amount: big ? 0.6 : 0.4 });
  emit('bomb:explode', { actor: it.owner, pos: c.clone(), team: it.team, radius });
  for (const e of G.actors) {
    if (e.team === it.team || !e.alive) continue;
    const d = chest(e, _v3).distanceTo(c);
    if (d > radius || !G.physics.los(c, _v3)) continue;
    const k = 1 - clamp((d - 0.8) / (radius - 0.8), 0, 1);
    G.projectiles.applyHit(it.owner, e, lerp(dmgMin, dmgMax, k * k), KIND);
  }
  G.subs?.damageArea(c, radius, big ? 60 : 35, it.team);
  it.state = 'dead';
}

// ---- a light ink streak on the floor under its flight (thinner on the way back)
function streak(it, r) {
  it.trail += it.pos.distanceTo(it.prev);
  if (it.trail < 0.8) return;
  it.trail = 0;
  const g = G.physics.raycast(it.pos, DOWN, 2.6, _hit2);
  if (g.hit) credit(it, G.paint.splat(_v.copy(g.point).setY(g.point.y + 0.1), r * (0.85 + Math.random() * 0.3), it.team, { seed: Math.random() }));
}

// ================================================================================================= visuals
function draw(it, dt) {
  const m = it.mesh, U = m.userData, col = color(it);
  m.position.copy(it.pos);
  // [sub-view] stopped short of a wall (0.4 m, as built): the drawn blade, if it reaches further, is held off the wall
  if (it.fromWall && U.r > proto().radius) {
    const P = it.plan, gap = _v4.copy(it.pos).sub(P.wallPoint).dot(P.wallNormal), want = U.r + 0.03;
    if (gap < want && gap > -0.5) m.position.addScaledVector(P.wallNormal, Math.min(want - gap, U.r - proto().radius + 0.03));
  }
  it.spinA = (it.spinA + it.spinW * dt) % (Math.PI * 2);
  U.spin.rotation.y = it.spinA;
  // bank: tilted into the throw while flying, wobbling level while it hovers, tipped in toward you as it circles
  const moving = it.state === 'out' || it.state === 'back' || it.state === 'fizzle';
  let bx = 0, bz = 0;
  if (moving && it.vel.lengthSq() > 0.01) { const h = Math.atan2(it.vel.x, it.vel.z); U.tilt.rotation.y = h; bz = it.state === 'back' ? -0.35 : 0.28; bx = -0.08; }
  else if (it.state === 'orbit') { U.tilt.rotation.y = -it.orbitA; bz = 0.3; }
  else { bx = 0.07 * Math.sin(it.age * 7.3); bz = 0.07 * Math.cos(it.age * 5.9); }
  U.tilt.rotation.x = lerp(U.tilt.rotation.x, bx, 1 - Math.exp(-10 * dt));
  U.tilt.rotation.z = lerp(U.tilt.rotation.z, bz, 1 - Math.exp(-10 * dt));
  // spin blur: a smeared disc that fades in with the spin rate (armed: pulses hot before the burst)
  const bl = clamp((it.spinW - 8) / 22, 0, 1);
  U.blur.visible = bl > 0.02;
  const bu = U.blur.material.uniforms;
  bu.uAlpha.value = 0.72 * bl;
  bu.uAng.value -= dt * it.spinW * 0.12;
  bu.uColor.value.copy(col);
  if (it.state === 'armed') { const k = clamp(it.t / it.sub.hitFuse, 0, 1); bu.uAlpha.value = 0.55 + 0.35 * Math.abs(Math.sin(it.t * (14 + 26 * k))); bu.uColor.value.multiplyScalar(1 + 1.4 * k); m.scale.setScalar(1 + 0.18 * k); }
  // loop follows it
  if (it.loop) it.loop.set({ pos: it.pos });
  if (!G.fx || !nearCam(it.pos, 40)) return;
  // flying: a light mist + drips; hovering / armed: ink flung off the blades, and a ring on the floor for its reach
  if (moving) G.fx.bombTrail(it.pos, it.vel, col);
  if (it.state === 'hover' || it.state === 'armed' || it.state === 'orbit') {
    it.fxT -= dt;
    if (it.fxT <= 0) {
      it.fxT = it.state === 'orbit' ? 0.09 : 0.045;
      const a = Math.random() * Math.PI * 2, r = proto().radius * 0.92, sp = 4 + Math.random() * 3;   // ([sub-view] the built reach: these droplets ink where they land)
      _v.set(it.pos.x + Math.cos(a) * r, it.pos.y, it.pos.z + Math.sin(a) * r);
      _v2.set(-Math.sin(a) * sp, 0.6 + Math.random(), Math.cos(a) * sp);
      G.fx.drop(_v, _v2, col, { size: 0.035 + Math.random() * 0.025, life: 0.5, quiet: true });
    }
  }
  if (it.state === 'hover' || it.state === 'armed') {
    const g = G.physics.raycast(it.pos, DOWN, 3.4, _hit2);
    if (g.hit) {
      const R = it.state === 'armed' ? it.sub.hitRadius : it.sub.hoverRadius;
      const k = it.state === 'armed' ? clamp(it.t / it.sub.hitFuse, 0, 1) : 0.3 + 0.2 * Math.sin(it.age * 10);
      G.fx.dangerRing(_v.copy(g.point).addScaledVector(g.normal, 0.03), g.normal, col, R, k);
    }
  }
}

function dispose(it) {
  it.loop?.stop(0.1); it.loop = null;
  it.mesh.parent?.remove(it.mesh);
  it.mesh.userData.blur.material.dispose();
}
function clear() {
  for (const it of items) dispose(it);
  items.length = 0;
  if (guide) guide.group.visible = false;
}

// ================================================================================================= aim guide
// While the local player holds the sub: a dashed line along the flat throw to where it will hover, a drop line to the
// floor and a ring there the size of its shredding reach (grey when it can't be thrown).
let guide = null;
function guideMesh() {
  if (guide) return guide;
  const group = new THREE.Group();
  const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
  const lineMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.95, depthTest: false });
  const line = new THREE.LineSegments(lineGeo, lineMat); line.frustumCulled = false; line.renderOrder = 10;
  const s = SUBS[KIND];
  const ring = new THREE.Mesh(new THREE.RingGeometry(s.hoverRadius - 0.1, s.hoverRadius, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }));
  const dot = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  dot.renderOrder = 10;
  group.add(line, ring, dot);
  group.visible = false;
  guide = { group, line, ring, dot, stamp: -1 };
  (G.scene).add(group);
  return guide;
}
function hold(runner, dt, inp, sub) {
  const a = runner.a;
  if (!a.isLocal || !a.alive || !G.scene) return;
  const g = guideMesh();
  if (g.group.parent !== G.scene) G.scene.add(g.group);
  const P = plan(a, sub, _plan), pos = g.line.geometry.attributes.position;
  pos.setXYZ(0, P.start.x, P.start.y, P.start.z); pos.setXYZ(1, P.end.x, P.end.y, P.end.z);
  const gy = P.ground > -Infinity && P.end.y - P.ground < 6 ? P.ground : null;
  pos.setXYZ(2, P.end.x, P.end.y, P.end.z); pos.setXYZ(3, P.end.x, gy ?? P.end.y, P.end.z);
  pos.setXYZ(4, P.end.x, P.end.y, P.end.z); pos.setXYZ(5, P.end.x, P.end.y, P.end.z);
  pos.needsUpdate = true;
  g.line.computeLineDistances();
  g.ring.visible = gy !== null;
  if (gy !== null) { g.ring.position.set(P.end.x, gy + 0.04, P.end.z); g.ring.scale.setScalar(1 + Math.sin(G.time * 8) * 0.04); }
  g.dot.position.copy(P.end);
  if (G.camera) g.dot.quaternion.copy(G.camera.quaternion);
  const ok = a.ink >= sub.inkCost && !active(a);
  const col = ok ? _v4.set(a.color.r, a.color.g, a.color.b).multiplyScalar(1.4) : _v4.set(0.6, 0.6, 0.6);
  for (const m of [g.line.material, g.ring.material, g.dot.material]) m.color.setRGB(col.x, col.y, col.z);
  g.group.visible = true;
  g.stamp = G.time;
}
function guideTick() { if (guide && guide.group.visible && guide.stamp < G.time - 1e-6) guide.group.visible = false; }

// ================================================================================================= bots
const bot = {
  // mid range: the hover catches them where they stand; point blank while under fire: a direct hit bursts on them
  fight(brain, dist) {
    const a = brain.a, tg = brain.target;
    if (active(a) || !tg || !tg.pos || !(brain.seeTimer > 0)) return false;
    // only with the aim on them: the flat throw goes where the bot looks (a direct hit bursts on them)
    const off = Math.abs(angleDiff(a.aimYaw, Math.atan2(tg.pos.x - a.pos.x, tg.pos.z - a.pos.z)));
    if (off > Math.min(0.35, 0.9 / Math.max(dist, 1))) return false;
    const close = dist < 3.2 && a.lastDamage < 0.8 && Math.random() < 0.08;
    const mid = dist > 4 && dist < 10.5 && Math.random() < 0.035 * (1 + (brain.diff?.fireDiscipline ?? 0.8));
    if (!close && !mid) return false;
    brain.bombCd = 6 + Math.random() * 5;
    return true;
  },
  // painting: now and then onto a patch ahead that isn't ours yet (the hover inks a disc, the orbit a ring round you)
  paint(brain) {
    const a = brain.a;
    if (active(a) || Math.random() > 0.006) return false;
    const st = G.paint.regionStats(a.pos.x + Math.sin(a.aimYaw) * 8, a.pos.y, a.pos.z + Math.cos(a.aimYaw) * 8, 2.5, a.team, _stats);
    if (!st.n || st.own > 0.45) return false;
    brain.bombCd = 9 + Math.random() * 7;
    return true;
  },
};
THROWN[KIND] = true;   // Zone Control: lobbed onto enemy ink on a zone (the flat throw hovers over the patch)

SUB_KITS[KIND] = {
  use, tick, clear, hold, bot, ghost, noArc: true,
  blocked: (a) => active(a),
  // test / debug access
  _items: items, _plan: (a) => plan(a, SUBS[KIND], newPlan()),
};

// ================================================================================================= icon
{
  const K = '#15121c', DK = '#2b2735', LT = '#e4e8ef';
  const O = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  // a chunky Λ: cream arms with an ink inlay each, rubber tips, dark hub with an ink eye, spin swooshes over the tips
  const arcs = 'M4.5 21 Q6.5 11 14.5 6 M59.5 21 Q57.5 11 49.5 6';
  const stripeR = 'M37.8 15.8 C43.8 18 49.5 25.5 53.2 35 Q54 37.4 51.8 38.3 Q49.7 39 48.7 36.6 C45.6 29.2 41.6 24.1 37 22.2 Z';
  const stripeL = stripeR.replace(/(-?[\d.]+) (-?[\d.]+)/g, (m, x, y) => `${+(64 - x).toFixed(2)} ${y}`);
  SUB_ICONS[KIND] = `<svg class="iw-ico " viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke-linecap="round"><path d="${arcs}" stroke="${K}" stroke-width="6.5"/><path d="${arcs}" stroke="currentColor" stroke-width="2.6"/></g>
    <g ${O}>
      <path d="M32 8.5 C42 8.5 53.5 20.5 59.5 40 Q61.5 47.5 55.5 49.8 Q50.5 51.3 48.3 45.8 C44.5 35.8 38.8 29 32 29 C25.2 29 19.5 35.8 15.7 45.8 Q13.5 51.3 8.5 49.8 Q2.5 47.5 4.5 40 C10.5 20.5 22 8.5 32 8.5 Z" fill="${LT}"/>
      <path d="M48.6 42.2 Q54.5 41.5 60.2 38.8 Q61.5 47.5 55.5 49.8 Q50.5 51.3 48.3 45.8 Z" fill="${DK}"/>
      <path d="M15.4 42.2 Q9.5 41.5 3.8 38.8 Q2.5 47.5 8.5 49.8 Q13.5 51.3 15.7 45.8 Z" fill="${DK}"/>
      <path d="${stripeR}" fill="currentColor" stroke-width="2.2"/><path d="${stripeL}" fill="currentColor" stroke-width="2.2"/>
      <circle cx="32" cy="17.5" r="7.2" fill="${DK}"/>
    </g>
    <circle cx="32" cy="17.5" r="3.1" fill="currentColor"/>
    <path d="M9.5 37 Q14.5 23.5 23.5 15.5" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
}

// ================================================================================================= sounds
// throw: a whippy "fwip" and the release clack · whirr (loop): blade chop, pitch = spin · shred: a wet slice tick ·
// return: a rising, doppler-ish whoosh · orbit (loop): chop plus a slow circling swell · burst: a small, snappy bomb
SFX.boomerang_throw = {
  gain: 0.62, max: 3, jitter: 0.05, reverb: 0.06,
  build(v, p) {
    v.nz({ f: 700 * p, f1: 2800 * p, sw: 0.14, q: 1.3, a: 0.05, d: 0.1, peak: 0.6 });
    v.nz({ t: 0.09, f: 2600 * p, f1: 900 * p, sw: 0.2, q: 1.6, a: 0.02, d: 0.18, peak: 0.35 });
    v.tone({ type: 'triangle', f: 540 * p, f1: 300 * p, sw: 0.04, a: 0.001, d: 0.05, peak: 0.3 });
    v.nz({ f: 3300 * p, q: 2.5, a: 0.0004, d: 0.012, peak: 0.5 });
    for (let i = 0; i < 4; i++) v.nz({ t: 0.05 + i * 0.04, f: 1500 * p, q: 3, a: 0.004, d: 0.02, peak: 0.18 * (1 - i / 5) });   // first few blade passes
  },
};
SFX.boomerang_whirr = {
  gain: 0.22, max: 4, jitter: 0, reverb: 0.04, oneShot: 1.2,
  loop(v, p) {
    const T = v.t;
    const amp = v.gain(0.5, v.out), bp = v.filter('bandpass', 1300 * p, 1.3, amp);
    v.noise('pink', T, null, bp);
    const chop = v.lfo(24 * p, 0.45, amp.gain, T, null, 'square');
    const hum = v.gain(0.1, v.out), lp = v.filter('lowpass', 700, 1, hum);
    const o = v.osc('sawtooth', 140 * p, T, null, lp);
    const l2 = v.lfo(24 * p, 0.08, hum.gain, T, null);
    const air = v.gain(0.1, v.out);
    v.noise('white', T, null, v.filter('highpass', 5200, 0.7, air));
    return {
      pitch(q, now) {
        bp.frequency.setTargetAtTime(1300 * q, now, 0.05); o.frequency.setTargetAtTime(140 * q, now, 0.05);
        chop.osc.frequency.setTargetAtTime(24 * q, now, 0.05); l2.osc.frequency.setTargetAtTime(24 * q, now, 0.05);
      },
    };
  },
};
SFX.boomerang_shred = {
  gain: 0.3, max: 4, jitter: 0.08, reverb: 0.03, minGap: 0.05,
  build(v, p) {
    v.nz({ f: 4200 * p, f1: 1700 * p, sw: 0.03, q: 2, a: 0.0005, d: 0.035, peak: 0.6 });
    v.nz({ t: 0.004, f: 900 * p, f1: 500 * p, sw: 0.05, q: 4, a: 0.002, d: 0.05, peak: 0.45 });
    v.bub(v.t + 0.012, v.r(900, 1500) * p, 0.2, 0.02, 1.8);
  },
};
SFX.boomerang_return = {
  gain: 0.45, max: 3, jitter: 0.04, reverb: 0.08,
  build(v, p) {
    const T = v.t, g = v.gain(0, v.out), bp = v.filter('bandpass', 500 * p, 2.2, g);
    bp.frequency.setValueAtTime(500 * p, T); bp.frequency.exponentialRampToValueAtTime(2500 * p, T + 0.45); bp.frequency.exponentialRampToValueAtTime(1100 * p, T + 0.72);
    pts(g.gain, T, [[0, 0], [0.35, 0.8], [0.5, 0.9], [0.74, 0]]);
    v.noise('pink', T, T + 0.76, bp);
    v.tone({ t: 0.05, f: 880 * p, f1: 1500 * p, sw: 0.5, a: 0.2, d: 0.35, peak: 0.07 });
    const ch = v.gain(0, v.out); pts(ch.gain, T, [[0, 0], [0.3, 0.25], [0.6, 0.3], [0.74, 0]]);
    const chop = v.gain(0.5, ch); v.lfo(20 * p, 0.5, chop.gain, T, T + 0.76, 'square');           // blade chop in the whoosh
    v.noise('white', T, T + 0.76, v.filter('bandpass', 1600 * p, 2, chop));
  },
};
SFX.boomerang_orbit = {
  gain: 0.2, max: 3, jitter: 0, reverb: 0.04, oneShot: 1.5,
  loop(v, p) {
    const T = v.t;
    const amp = v.gain(0.35, v.out), bp = v.filter('bandpass', 1100 * p, 1.2, amp);
    v.noise('pink', T, null, bp);
    const chop = v.lfo(22 * p, 0.25, amp.gain, T, null, 'square');
    const sw = v.gain(0.3, v.out), bp2 = v.filter('bandpass', 800, 1.5, sw);
    v.noise('pink', T, null, bp2);
    const l = v.lfo(1.1 * p, 0.28, sw.gain, T, null), lf = v.lfo(1.1 * p, 380, bp2.frequency, T, null);
    const hum = v.gain(0.08, v.out), o = v.osc('triangle', 110 * p, T, null, hum);
    const grain = v.gain(0.35, v.filter('highpass', 1400, 0.7, v.out));
    v.buffer(texture(v.ctx, 'bubbles_bright'), T, null, grain, 1.2 * p);   // ink spattering off the blades
    return {
      pitch(q, now) {
        chop.osc.frequency.setTargetAtTime(22 * q, now, 0.05); l.osc.frequency.setTargetAtTime(1.1 * q, now, 0.05);
        lf.osc.frequency.setTargetAtTime(1.1 * q, now, 0.05); o.frequency.setTargetAtTime(110 * q, now, 0.05);
      },
    };
  },
};
SFX.boomerang_burst = {
  gain: 0.55, max: 3, jitter: 0.05, reverb: 0.24,
  build(v, p) {
    v.tone({ f: 140 * p, f1: 44 * p, sw: 0.3, a: 0.002, d: 0.42, peak: 0.9 });
    v.nz({ ft: 'highpass', f: 2500, a: 0.0003, d: 0.03, peak: 0.8 });
    v.nz({ kind: 'pink', ft: 'lowpass', f: 4200, f1: 260, sw: 0.4, q: 1, a: 0.002, d: 0.45, peak: 0.9 });
    v.nz({ t: 0.02, f: 1700 * p, f1: 480 * p, sw: 0.35, q: 3, a: 0.003, d: 0.4, peak: 0.6 });
    for (let i = 0; i < 4; i++) v.bub(v.t + 0.05 + v.r(0, 0.2), v.r(380, 700) * p, 0.22, v.r(0.04, 0.08), 0.4);
    v.tone({ t: 0.004, f: 2100 * p, a: 0.001, d: 0.28, peak: 0.07 });                        // the blades' ring-out
    v.tone({ t: 0.004, f: 3170 * p, a: 0.001, d: 0.2, peak: 0.05 });
    v.nz({ t: 0.05, ft: 'highpass', f: 3200, a: 0.03, d: 0.45, peak: 0.22 });
  },
};
