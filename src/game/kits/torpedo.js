// Tide Torpedo (sub kind 'torpedo') — see kits/registry.js.
//
// Thrown like a bomb (the same arc as the throw preview); throwing inks a patch under the thrower's feet. While it is
// still in the air, a foe within lockRange (in sight) makes it stop dead, unfold its fins (a dashed lock ring appears
// round the foe — seen by the thrower's team and, as a warning, by the foe) and then swim slowly at them, speeding up and
// homing gently. It bursts on touching a foe, a wall or the floor: 60 up close (35 at the rim), a wide paint splash
// (a bit more than a Cling Charge) and a spray of droplets that ink where they land and hit for 12 each, at most three
// per foe (96 in all). A torpedo that touches anything before it locks (or never finds anyone) bursts like a plain
// bomb: the base blast only, a small splash, no droplets.
// Enemy fire shoots it down (20 damage, any form). Locked, it treats lethal blasts like a Drip Curtain does: an enemy
// bomb that touches it goes off at once, and a lethal blast that catches it sets it off at once — which can hurt its
// own team standing close. One out per player: a second throw while one is live is refused ("Can't use").
//
// Everything lives here: the model (registerSubModel + a world rig with unfolding fins and a propeller), the flight /
// lock / launch state machine, the burst + droplets, the lock ring, shoot-down, sounds, icon and bot use.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, emit, clamp, lerp } from '../../core/ctx.js';
import { PLAYER, SUBS, subViewScale } from '../../config.js';
import { Physics, Hit } from '../physics.js';
import { SUB_KITS, KIT_GHOSTS, netRec, netId, netHurt, netMuted, ghostMute } from './registry.js';
import { registerSubModel, getSubDef, GEO_KIT } from '../character-weapons.js';
import { superEllipsoid, smoothProfile } from '../character-geo.js';
import { getPlasticMaterial, getInkMaterial } from '../character-mats.js';
import { SUB_ICONS } from '../../ui/ui-icons.js';
import { SFX } from '../../audio/audio.js';
import { pts, sweep } from '../../audio/music.js';
import { THROWN } from '../bots.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0), DOWN = new V3(0, -1, 0), ZAX = new V3(0, 0, 1);
const r2 = (x) => Math.round(x * 100) / 100;
const GRAV = 24;                 // same as every thrown sub (and the throw-arc preview)
const SCALE = 1.9;               // prop models are built at hand scale (SubSystem's SUB_SCALE) — [sub-view] drawn × t.vs
const HIT_R = 0.3;               // shot-down / contact radius of the torpedo in the world (m): NOT the drawn size ([sub-view])
const _v = new V3(), _v2 = new V3(), _v3 = new V3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _hit = new Hit(), _res = { t: 0, dist: 0 };
const nearCam = (p, r = 34) => !!G.camera && G.camera.position.distanceToSquared(p) < r * r;
const backOut = (t, s = 2.2) => { t = clamp(t, 0, 1) - 1; return 1 + t * t * ((s + 1) * t + s); };
const chest = (e, out) => out.set(e.pos.x, e.pos.y + (e.smoothY || 0) + (e.form === 'squid' ? 0.3 : 0.8), e.pos.z);
const hitBase = (e, out) => out.set(e.pos.x, e.pos.y + (e.smoothY || 0), e.pos.z);
const hitH = (e) => e.hitH || (e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height);
const hitR = (e) => e.hitR || PLAYER.radius;

// =============================================================================================== model
// Hand scale, prop space (+Z = nose). A stubby torpedo lying along Z, axis at height YC: dark tail cone, cream rear body
// under four curved team-ink fins (folded flush round the hull; they swing out when it locks), an ink window band in a
// dark cage, cream front body with squid decals and forward chevrons, a hazard collar, a soft rubber nose with a glowing
// sensor lens; a folding three-blade propeller and a knurled tail stub (the fist's handle).
const YC = 0.034;
const HP = smoothProfile([[0.0105, -0.086], [0.016, -0.081], [0.022, -0.072], [0.0275, -0.06], [0.0305, -0.045], [0.0318, -0.02],
  [0.032, 0.01], [0.031, 0.04], [0.0282, 0.062], [0.022, 0.08], [0.0135, 0.093], [0.004, 0.0995]], 48);
const FIN = { R: 0.0331, z0: -0.016, n: 4, span: 1.8 };        // fin arc radius, root front z, count, unfold swing (rad)
const PROP_AT = new V3(0, YC, -0.0895);

function buildTorpedo() {
  const { Parts, C, M, latheZ, torus, at, decal, squidShape, chevrons, wrapZ, profR, led, gripSleeve } = GEO_KIT;
  const P = new Parts(), I = new Parts(), L = new Parts();
  const r = (z) => profR(HP, z);
  const section = (z0, z1, dr = 0, n = 12) => {
    const pr = [[0, z0]];
    for (let i = 0; i <= n; i++) { const z = z0 + (z1 - z0) * i / n; pr.push([r(z) + dr, z]); }
    pr.push([0, z1]);
    return at(latheZ(pr, 30), 0, YC, 0);
  };
  const ring = (z, tube, col, mat, dr = 0.0004) => { const g = torus(r(z) + dr, tube, 6, 34); P.add(at(g, 0, YC, z), col, mat); };
  // hull
  P.add(section(-0.086, -0.056), C.gunmetal, M.gloss);
  P.add(section(-0.056, -0.012), C.cream, M.gloss);
  I.add(section(-0.012, 0.022, -0.0007));
  P.add(section(0.022, 0.066), C.cream, M.gloss);
  P.add(section(0.066, 0.093), C.rubber, M.rubber);
  ring(-0.056, 0.0021, C.dark, M.gloss); ring(-0.012, 0.0024, C.dark, M.gloss); ring(0.022, 0.0024, C.dark, M.gloss);
  ring(0.066, 0.0019, C.hazard, M.gloss);
  // cage bars over the ink window
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, R = r(0.005) + 0.0003;
    P.add(at(superEllipsoid(0.0021, 0.0021, 0.0175, 0.6, 0.6, 5, 6), Math.cos(a) * R, YC + Math.sin(a) * R, 0.005), C.dark, M.satin);
  }
  // nose: metal bezel + glowing sensor lens
  P.add(at(torus(0.0118, 0.0017, 6, 26), 0, YC, 0.0932), C.metal, M.metal);
  L.add(at(latheZ([[0, 0.0925], [0.0108, 0.0925], [0.0102, 0.0962], [0.0072, 0.0994], [0.003, 0.1009], [0, 0.1011]], 24), 0, YC, 0));
  // flank squid decals (nose-forward) and top chevrons on the front body
  for (const az of [0, Math.PI]) {
    const sq = decal(squidShape(0.02)); sq.rotateZ(Math.PI / 2);
    P.add(wrapZ(sq, r(0.044) + 0.0004, az, 0.044, YC), C.dark, M.print);
  }
  for (const g of chevrons(0.022, 0.009, 3)) { g.rotateZ(Math.PI); I.add(wrapZ(g, r(0.047) + 0.0004, Math.PI / 2, 0.047, YC)); }
  // fin hinge strips (static) along each fin root
  for (let k = 0; k < FIN.n; k++) {
    const a = finAz(k);
    P.add(at(superEllipsoid(0.0016, 0.0016, 0.019, 0.7, 0.7, 5, 6), Math.cos(a) * (FIN.R - 0.0008), YC + Math.sin(a) * (FIN.R - 0.0008), FIN.z0 - 0.019), C.metal, M.metal);
  }
  // amber status LED on top of the tail cone
  led(P, new V3(0, YC + r(-0.064) + 0.0002, -0.064), new V3(0, 1, -0.3), C.amber, 0.0026);
  // tail: knurled rubber stub (the handle) + metal end cap
  const stub = gripSleeve(0, 0.024, 0.0108); stub.rotateX(-Math.PI / 2); P.add(at(stub, 0, YC, -0.0925), C.rubber, M.rubber);
  P.add(at(latheZ([[0, -0.1195], [0.0078, -0.1195], [0.0098, -0.1182], [0.0101, -0.1158], [0, -0.1158]], 14), 0, YC, 0), C.metal, M.metal);
  const hullBody = P.build(), hullInk = I.build(), glow = L.build();
  // fin (ink), authored in place at azimuth finAz(0), re-centred on its hinge point
  const fin = finGeometry();
  const piv = finPivot(0);
  const finLocal = fin.clone().translate(-piv.x, -piv.y, -piv.z);
  // propeller (re-centred on PROP_AT): hub cone + three swept blades
  const PP = new Parts();
  PP.add(latheZ([[0, -0.0935], [0.0098, -0.0932], [0.0106, -0.0905], [0.0092, -0.0868], [0, -0.0862]], 16).translate(0, YC, 0), C.dark, M.gloss);
  for (let k = 0; k < 3; k++) {
    const b = superEllipsoid(0.0048, 0.0115, 0.0014, 0.55, 0.6, 6, 6, (q) => { q.z += (q.y + 0.0115) * 0.12; });
    b.rotateY(0.5); b.translate(0, 0.0128, 0); b.rotateZ(k * Math.PI * 2 / 3);
    PP.add(at(b, 0, YC, -0.0895), C.cream, M.gloss);
  }
  const prop = PP.build().translate(-PROP_AT.x, -PROP_AT.y, -PROP_AT.z);
  // the held prop: hull + folded fins + folded propeller, all in one
  const foldedFins = []; for (let k = 0; k < FIN.n; k++) foldedFins.push(finAt(fin, k));
  const propFolded = prop.clone().scale(0.38, 0.38, 1).translate(PROP_AT.x, PROP_AT.y, PROP_AT.z);
  return {
    kind: 'torpedo', body: mergeGeometries([hullBody, propFolded], false), ink: mergeGeometries([hullInk, ...foldedFins], false), glow,
    grip: { pos: new V3(0, YC, -0.106), handZ: new V3(0, 0, -1), handY: new V3(0.3, -1, 0.1) },
    hullBody, hullInk, finLocal, prop, yc: YC,
  };
}
function finAz(k) { return Math.PI / 4 + k * Math.PI / 2 - 0.47; }
function finPivot(k) { const a = finAz(k); return new V3(Math.cos(a) * FIN.R, YC + Math.sin(a) * FIN.R, FIN.z0); }
// a curved fin: an arc of the hull's cylinder (radius FIN.R), root along +Z at azimuth finAz(0), running round the hull
// (counter-clockwise seen from the nose) — folded it lies flush; turning it clockwise about its root swings it out
function finGeometry() {
  const { wrapZ } = GEO_KIT;
  const s = new THREE.Shape();                       // x = back along the hull from the root front, y = round the hull
  s.moveTo(0, 0); s.lineTo(0.036, 0);
  s.quadraticCurveTo(0.0445, 0.0005, 0.0452, 0.009);
  s.lineTo(0.0442, 0.0255);
  s.quadraticCurveTo(0.0432, 0.0312, 0.0372, 0.0312);
  s.lineTo(0.0262, 0.0312);
  s.quadraticCurveTo(0.0118, 0.0282, 0.0038, 0.0112);
  s.quadraticCurveTo(0.0004, 0.0038, 0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0022, bevelEnabled: true, bevelThickness: 0.0007, bevelSize: 0.0007, bevelSegments: 2, curveSegments: 6 });
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  return wrapZ(mergeVertices(g, 1e-6), FIN.R, finAz(0), FIN.z0, YC);
}
// fin k folded, in prop space (for the held prop)
function finAt(fin, k) {
  const g = fin.clone();
  g.translate(0, -YC, 0).rotateZ(finAz(k) - finAz(0)).translate(0, YC, 0);
  // Parts geometry carries color + aMat: give the fin the same attribute set as the ink Parts output
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  return g;
}

// =============================================================================================== world rig
// per torpedo (its lens brightens as it locks and launches)
function glowMat(team) { return new THREE.MeshStandardMaterial({ color: 0x111111, emissive: G.teamColors[team].clone(), emissiveIntensity: 1.2, roughness: 0.3 }); }
function buildRig(team, vs = 1) {   // ([sub-view] vs: SUB_VIEW_SCALE.torpedo — drawn that much bigger, visual only)
  const d = getSubDef('torpedo');
  const col = G.teamColors[team];
  const outer = new THREE.Group(), model = new THREE.Group();
  model.scale.setScalar(SCALE * vs); model.position.y = -d.yc * SCALE * vs;          // the hull axis runs through the outer origin
  const body = new THREE.Mesh(d.hullBody, getPlasticMaterial()); body.castShadow = true;
  const ink = new THREE.Mesh(d.hullInk, getInkMaterial(col)); ink.castShadow = true;
  const gm = glowMat(team);
  const glow = new THREE.Mesh(d.glow, gm);
  model.add(body, ink, glow);
  const fins = [];
  const piv0 = finPivot(0);
  for (let k = 0; k < FIN.n; k++) {
    const arm = new THREE.Group(); arm.position.set(0, YC, 0); arm.rotation.z = finAz(k) - finAz(0);
    const pivot = new THREE.Group(); pivot.position.set(piv0.x, piv0.y - YC, piv0.z);
    const fm = new THREE.Mesh(d.finLocal, getInkMaterial(col)); fm.castShadow = true;
    pivot.add(fm); arm.add(pivot); model.add(arm);
    fins.push(pivot);
  }
  const prop = new THREE.Group(); prop.position.copy(PROP_AT);
  const pm = new THREE.Mesh(d.prop, getPlasticMaterial()); pm.castShadow = true;
  prop.add(pm); model.add(prop);
  outer.add(model);
  outer.userData = { model, fins, prop, glow: gm };
  return outer;
}
function poseRig(t) {
  const U = t.mesh.userData, k = t.fin;
  for (const f of U.fins) f.rotation.z = -FIN.span * k;
  const pk = t.propOpen;
  U.prop.scale.set(lerp(0.38, 1, pk), lerp(0.38, 1, pk), 1);
  U.prop.rotation.z = t.propA;
  U.glow.emissiveIntensity = t.glowI;
}

// dashed lock ring round the targeted foe (team colour; the thrower's team and the target see it)
const RING_VS = `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FS = `
  uniform vec3 uColor; uniform float uTime; uniform float uAlpha; varying vec2 vP;
  void main(){
    float r = length(vP) / 1.15, a = atan(vP.y, vP.x);
    float dash = step(0.45, fract(a / 6.2831853 * 16.0 - uTime * 0.55));
    float band = smoothstep(0.76, 0.79, r) * (1.0 - smoothstep(0.93, 0.96, r));
    float rim = smoothstep(0.93, 0.95, r) * (1.0 - smoothstep(0.97, 0.99, r));
    float inner = smoothstep(0.60, 0.62, r) * (1.0 - smoothstep(0.645, 0.665, r));
    float tick = step(0.92, fract(a / 6.2831853 * 4.0 + 0.125 - uTime * 0.12)) * smoothstep(0.46, 0.5, r) * (1.0 - smoothstep(0.72, 0.75, r));
    float al = (band * (1.0 - dash) + inner * 0.5 + tick * 0.95 + rim * (1.0 - dash) * 0.6) * uAlpha;
    if (al < 0.01) discard;
    vec3 c = mix(uColor * 1.3, vec3(1.0), 0.12 + 0.3 * band * (1.0 - dash));
    gl_FragColor = vec4(c, al);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
function makeRing(team) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: G.teamColors[team].clone() }, uTime: { value: 0 }, uAlpha: { value: 0 } },
    vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3, 1, 1), mat);   // flat on the ground (vP = the plane's own xy); dashes at r ≈ 0.9–1.1 m
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 3; m.frustumCulled = false;
  return m;
}

// droplets: glossy team-ink blobs, one instanced draw
const MAX_DROPS = 96;
let dropMesh = null;
function dropsMesh() {
  if (dropMesh && dropMesh.parent) return dropMesh;
  if (!dropMesh) {
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
    dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 9), mat, MAX_DROPS);
    dropMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    dropMesh.setColorAt(0, new THREE.Color());
    dropMesh.frustumCulled = false; dropMesh.castShadow = true; dropMesh.count = 0;
  }
  G.scene?.add(dropMesh);
  return dropMesh;
}

// =============================================================================================== state
const list = [];     // live torpedoes
const drops = [];    // live droplets

function sceneOf(subs) { return subs?.scene || G.scene; }
function credit(t, area) { if (!area) return; if (t.sp) t.owner.addTurfNoSpecial(area); else t.owner.addTurf(area); }
function locked(t) { return t.state === 'unfold' || t.state === 'launch'; }
function live(t) { return t.state !== 'dead'; }

function use(subs, a, sub) {
  const pos = a.pos.clone(); pos.y += 1.35;
  const vel = G.projectiles.throwVelocity(a, sub.throwSpeed, new V3());
  const t = spawn(subs, a, sub, pos, vel, false, netId(a));
  netRec(a, 'torpedo', [0, t.gid, r2(pos.x), r2(pos.y), r2(pos.z), r2(vel.x), r2(vel.y), r2(vel.z)]);
  // the throw inks a patch under the thrower's feet
  const g = G.physics.raycast(_v.copy(a.pos).setY(a.pos.y + 0.4), DOWN, 2.5, _hit);
  if (g.hit) { const b = G.level.blocks[g.block]; if (!(b && (b.roof || b.rail || b.perch))) credit(t, G.paint.splat(_v2.copy(g.point).addScaledVector(g.normal, 0.1), sub.feetPaint, a.team, { seed: Math.random() })); }
  G.cues?.sub('torpedo', 'throw', { owner: a, at: a.pos });   // sfx-cues: its own motor-start throw (src/audio/cues.js)
  emit('sub:use', { actor: a, kind: 'torpedo' });
}
// Online, a remote player's torpedo is a ghost: it flies the same arc, but its owner decides the rest — records
// [3, gid, foe nid, x, y, z] the lock, [4, gid, x, y, z, dx, dy, dz, speed] its swim (10 a second, dead-reckoned in
// between), [1, gid, x, y, z, full] the burst, [2, gid, shot] an end without one. Hits on a ghost go to its owner.
function spawn(subs, a, sub, pos, vel, ghost, gid) {
  const vs = subViewScale('torpedo');   // [sub-view]
  const mesh = buildRig(a.team, vs);
  const scene = sceneOf(subs);
  scene.add(mesh);
  const t = {
    kind: 'torpedo', sub, owner: a, team: a.team, pos, prev: pos.clone(), vel, dir: vel.clone().normalize(), speed: 0,
    state: 'fly', t: 0, age: 0, hp: sub.hp, target: null, mesh, scene, ring: null, sp: !!a.specialActive,
    fin: 0, propOpen: 0, propA: 0, roll: Math.random() * 6, glowI: 0.5, hover: new V3(), whirr: null, flash: 0,
    ghost, gid, net: null, sendT: 0, burst: false, vs,
  };
  list.push(t);
  t.whirr = null;   // sfx-cues: the whirr (and the lock tone on its target) come from src/audio/cues.js
  orient(t, t.dir);
  mesh.position.copy(pos);
  return t;
}
const byNid = (n) => (n >= 0 ? G.actors.find((e) => e.nid === n) || null : null);
const own = (gid) => list.find((t) => !t.ghost && t.gid === gid && live(t));
function ghost(a, d) {
  if (!Array.isArray(d)) return;
  const [op, gid] = d;
  if (op === 0) {
    if (list.some((x) => x.gid === gid)) return;
    spawn(G.subs, a, SUBS.torpedo, new V3(d[2], d[3], d[4]), new V3(d[5], d[6], d[7]), true, gid);
    G.cues?.sub('torpedo', 'throw', { owner: a, at: a.pos });   // sfx-cues
    return;
  }
  const t = list.find((x) => x.ghost && x.gid === gid && live(x));
  if (!t) return;
  if (op === 3) { t.pos.set(d[3], d[4], d[5]); if (t.state === 'fly') startLock(t, byNid(d[2])); }
  else if (op === 4) {
    if (t.state === 'fly') { t.pos.set(d[2], d[3], d[4]); startLock(t, null); }
    if (t.state === 'unfold') { t.state = 'launch'; t.t = 0; }
    t.speed = d[8];
    t.net = { p: new V3(d[2], d[3], d[4]), d: new V3(d[5], d[6], d[7]).normalize(), s: d[8], age: 0 };
  } else if (op === 1) { t.pos.set(d[2], d[3], d[4]); burst(t, !!d[5]); }
  else if (op === 2) { if (d[2]) destroy(t); else fizzle(t); }
}

function orient(t, dir) {
  _q.setFromUnitVectors(ZAX, _v3.copy(dir).normalize());
  t.mesh.quaternion.copy(_q);
  t.mesh.rotateZ(t.roll);
}

function tick(dt) {
  if (!list.length && !drops.length) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    if (live(t)) {
      t.age += dt; t.t += dt;
      const n = Math.max(1, Math.ceil(dt / (1 / 60) - 1e-6)), h = dt / n;
      ghostMute(t, () => {
        for (let s = 0; s < n && live(t); s++) {
          if (t.state === 'fly') fly(t, h);
          else if (t.state === 'unfold') unfold(t, h);
          else if (t.state === 'launch') launch(t, h);
        }
      });
      if (live(t) && locked(t)) lethalContact(t);   // (unmuted: it sets off this client's own bombs)
      if (!t.ghost && live(t) && t.state === 'launch' && (t.sendT -= dt) <= 0) {   // online: its swim, for the ghosts
        t.sendT = 0.1;
        netRec(t.owner, 'torpedo', [4, t.gid, r2(t.pos.x), r2(t.pos.y), r2(t.pos.z), r2(t.dir.x), r2(t.dir.y), r2(t.dir.z), r2(t.speed)]);
      }
      if (t.ghost && t.age > 15) fizzle(t);   // (its owner left)
    }
    if (live(t)) visuals(t, dt);
    else {
      if (!t.ghost && !t.burst) netRec(t.owner, 'torpedo', [2, t.gid, t.shot ? 1 : 0]);
      dispose(t); list.splice(i, 1);
    }
  }
  tickDrops(dt);
}

// ---- in flight: gravity arc; locks onto a foe in range, bursts small on touching anything first
function fly(t, h) {
  const s = t.sub;
  t.prev.copy(t.pos);
  t.vel.y -= GRAV * h;
  t.pos.addScaledVector(t.vel, h);
  if (t.vel.lengthSq() > 1e-4) t.dir.copy(t.vel).normalize();
  if (t.ghost) {   // flies the arc; stops where it touches something and waits for its owner's word
    const w = G.physics.segment(t.prev, t.pos, _hit);
    if (w.hit) { t.pos.copy(w.point).addScaledVector(w.normal, 0.14); t.vel.set(0, 0, 0); }
    if (t.pos.y < PLAYER.waterY - 1.8) fizzle(t);
    return;
  }
  const e = touchFoe(t);
  if (e) return burst(t, false);
  if (touchDevice(t)) return burst(t, false);
  const w = G.physics.segment(t.prev, t.pos, _hit);          // grates count: any surface
  if (w.hit) { t.pos.copy(w.point).addScaledVector(w.normal, 0.14); t.hitN = w.normal.clone(); return burst(t, false); }
  if (t.pos.y < PLAYER.waterY - 1.8) { fizzle(t); return; }
  if (t.age >= s.armTime) {
    const tg = findTarget(t, s.lockRange);
    if (tg) return startLock(t, tg);
  }
  if (t.age > s.flyLife) burst(t, false);
}
function findTarget(t, range) {
  let best = null, bd = range;
  for (const e of G.actors) {
    if (e.team === t.team || !e.alive || e.superJumpState) continue;
    // a squid hidden in its own ink stays hidden (unless it is being tracked for the thrower's team)
    if (e.form === 'squid' && e.submerged && !(e.status?.track > 0 && e.status.trackTeam === t.team)) continue;
    chest(e, _v);
    const d = _v.distanceTo(t.pos);
    if (d >= bd || !G.physics.los(t.pos, _v)) continue;
    bd = d; best = e;
  }
  return best;
}
function startLock(t, e) {
  if (!t.ghost) netRec(t.owner, 'torpedo', [3, t.gid, e?.nid ?? -1, r2(t.pos.x), r2(t.pos.y), r2(t.pos.z)]);
  t.state = 'unfold'; t.t = 0; t.target = e;
  t.vel.set(0, 0, 0); t.hover.copy(t.pos);
  t.ring = makeRing(t.team); t.ringT = 0;
  t.scene.add(t.ring);
  G.cues?.one('torpedo_transform', { at: t.pos, owner: t.owner, team: t.team, kind: 'land', sub: true, vol: 0.8 });   // sfx-cues: through the cue mix
  if (e?.isLocal || t.owner.isLocal) G.audio?.play('torpedo_lock', { volume: e?.isLocal ? 0.7 : 0.45 });
  if (e) emit('sub:arm', { kind: 'torpedo', pos: t.pos.clone(), team: t.team, radius: t.sub.radius, target: e, actor: t.owner });
}
// ---- locked: hovers, fins swing out, turns to face the foe
function unfold(t, h) {
  const s = t.sub;
  if (!t.ghost && (!t.target || !t.target.alive)) t.target = findTarget(t, s.lockRange * 1.4) || t.target;
  const k = clamp(t.t / s.unfoldTime, 0, 1);
  if (t.target && t.target.alive) {
    chest(t.target, _v).sub(t.pos).normalize();
    t.dir.lerp(_v, 1 - Math.exp(-9 * h)).normalize();
  }
  const shake = k > 0.6 ? (k - 0.6) * 0.03 : 0;
  t.pos.set(t.hover.x + (Math.random() - 0.5) * shake, t.hover.y + Math.sin(t.t * 13) * 0.025 + 0.06 * backOut(k, 1.5) * 0.4, t.hover.z + (Math.random() - 0.5) * shake);
  if (t.t >= s.unfoldTime) {
    t.state = 'launch'; t.t = 0; t.speed = s.launchSpeed0;
    if (nearCam(t.pos, 40) && !G.cues?.allySub(t.owner, t.team)) G.audio?.play('torpedo_launch', { pos: t.pos, volume: 0.8 });   // (a teammate's: none — cues.js allySub)
    if (nearCam(t.pos, 30)) G.fx?.burst(_v.copy(t.pos).addScaledVector(t.dir, -0.4), _v2.copy(t.dir).negate(), G.teamColors[t.team], { count: 4, speed: 1.8, size: 0.04, sheet: false });
  }
}
// ---- launched: swims at the foe, speeding up, homing gently; bursts on a foe, a wall or the floor
function launch(t, h) {
  const s = t.sub;
  if (t.ghost) return swim(t, h);
  t.speed = Math.min(s.launchSpeed, t.speed + s.launchAccel * h);
  if (t.target && t.target.alive) {
    chest(t.target, _v).sub(t.pos);
    if (_v.lengthSq() > 1e-4) {
      _v.normalize();
      const ang = Math.acos(clamp(t.dir.dot(_v), -1, 1)), max = s.turnRate * h;
      if (ang > 1e-4) {
        _v2.crossVectors(t.dir, _v); if (_v2.lengthSq() < 1e-8) _v2.set(0, 1, 0); _v2.normalize();
        t.dir.applyAxisAngle(_v2, Math.min(ang, max)).normalize();
      }
    }
  }
  t.prev.copy(t.pos);
  t.pos.addScaledVector(t.dir, t.speed * h);
  if (touchFoe(t)) return burst(t, true);
  if (touchDevice(t)) return burst(t, true);
  const w = G.physics.segment(t.prev, t.pos, _hit);
  if (w.hit) { t.pos.copy(w.point).addScaledVector(w.normal, 0.16); t.hitN = w.normal.clone(); return burst(t, true); }
  if (t.pos.y < PLAYER.waterY - 0.2) { fizzle(t); return; }
  if (t.t > s.launchLife) burst(t, true);
}
// a ghost's swim: dead-reckoned from its owner's last report, eased onto it
function swim(t, h) {
  const N = t.net;
  t.prev.copy(t.pos);
  if (!N) { t.speed = Math.min(t.sub.launchSpeed, t.speed + t.sub.launchAccel * h); t.pos.addScaledVector(t.dir, t.speed * h); return; }
  N.age += h;
  _v.copy(N.p).addScaledVector(N.d, N.s * N.age);
  const k = 1 - Math.exp(-18 * h);
  t.pos.addScaledVector(t.dir, t.speed * h).lerp(_v, k);
  t.dir.lerp(N.d, 1 - Math.exp(-12 * h)).normalize();
  t.speed = N.s;
}
// any foe's body along this step
function touchFoe(t) {
  for (const e of G.actors) {
    if (e.team === t.team || !e.alive) continue;
    const hr = hitR(e);
    if (Math.abs(e.pos.x - t.pos.x) > 3 || Math.abs(e.pos.z - t.pos.z) > 3) continue;
    Physics.segmentCapsuleDist(t.prev, t.pos, hitBase(e, _v3), hr, hitH(e), _res);
    if (_res.dist < hr + 0.16) { t.pos.lerpVectors(t.prev, t.pos, _res.t); t.hitFoe = e; return e; }
  }
  return null;
}
// enemy curtains, shields, sprinklers, beacons, bubbles … count as surfaces (the probe does no damage)
function touchDevice(t) {
  if (G.subs?.blockShot(t.prev, t.pos, t.team, 0)) return true;
  if (G.specials?.shotHit?.(t.prev, t.pos, t.team, 0, t.owner)) return true;
  return false;
}
// Locked form vs lethal bombs (the Drip Curtain rule): an enemy bomb that touches it goes off right there (and its
// blast then sets the torpedo off too, through damageArea)
function lethalContact(t) {
  const P = G.projectiles;
  // (only this client's own bombs and subs: a remote player's are set off on its owner's screen)
  if (P?.bombs) for (const b of P.bombs.slice()) {
    if (b.kind !== 'bomb' || b.ghost || b.team === t.team || b.pos.distanceTo(t.pos) > 0.62) continue;
    P._explodeBomb(b); P.defuseBomb(b);
    if (!live(t)) return;
  }
  const S = G.subs;
  if (S?.items) for (const it of S.items) {
    if (it.state !== 'fly' || it.ghost || it.team === t.team || !(it.kind === 'sticky' || it.kind === 'seeker')) continue;
    if (it.pos.distanceTo(t.pos) > 0.62) continue;
    const s = it.sub;
    S._blast(it, it.pos, s.radius, s.damageMax, s.damageMin, s.paintRadius, UP);
    it.state = 'dead';
    if (!live(t)) return;
  }
}

// ---- the burst. full = the locked torpedo's (wide paint + droplets); else the plain bomb-like one
function burst(t, full) {
  if (!live(t)) return;
  if (!t.ghost) netRec(t.owner, 'torpedo', [1, t.gid, r2(t.pos.x), r2(t.pos.y), r2(t.pos.z), full ? 1 : 0]);
  t.state = 'dead'; t.burst = true;
  const s = t.sub, col = G.teamColors[t.team];
  const c = t.pos.clone();
  // paint on the ground under a mid-air burst (a foe's body), else where it touched
  let pc = c;
  const g = G.physics.raycast(_v.copy(c).setY(c.y + 0.2), DOWN, 2.6, _hit, true);
  if (g.hit) pc = _v2.copy(g.point).addScaledVector(g.normal, 0.2).clone();
  if (full) {
    let area = G.paint.splat(pc, s.paintRadius, t.team, { seed: Math.random() });
    for (let k = 0; k < 5; k++) {
      const a = Math.random() * Math.PI * 2, rr = s.paintRadius * (0.55 + Math.random() * 0.45);
      area += G.paint.splat(_v3.set(pc.x + Math.cos(a) * rr, pc.y + 0.3, pc.z + Math.sin(a) * rr), 0.55 + Math.random() * 0.45, t.team, { seed: Math.random() });
    }
    credit(t, area);
  } else credit(t, G.paint.splat(pc, s.fallbackPaint, t.team, { seed: Math.random() }));
  G.fx?.explosion(c, col, full ? s.radius : s.radius * 0.8);
  G.cues?.sub('torpedo', 'boom', { owner: t.owner, team: t.team, at: c, vol: full ? 1 : 0.75, pitch: full ? 0.95 : 1.12 });   // sfx-cues: its own burst
  emit('shake', { pos: c.clone(), amount: full ? 0.55 : 0.45 });
  emit('bomb:explode', { actor: t.owner, pos: c.clone(), team: t.team, radius: s.radius, kind: 'torpedo' });
  for (const e of G.actors) {
    if (e.team === t.team || !e.alive) continue;
    chest(e, _v3);
    const d = e === t.hitFoe ? 0 : _v3.distanceTo(c);
    if (d > s.radius) continue;
    if (d > 0 && !G.physics.los(_v.copy(c).addScaledVector(t.hitN || UP, 0.25), _v3)) continue;
    const dmg = d <= s.coreRadius ? s.damageMax : lerp(s.damageMax, s.damageMin, (d - s.coreRadius) / (s.radius - s.coreRadius));
    G.projectiles.applyHit(t.owner, e, dmg, 'torpedo');
  }
  G.subs?.damageArea(c, s.radius, 60, t.team);   // enemy curtains / devices / bubbles; sets off enemy locked torpedoes
  G.boss?.splash(t.owner, c, s.radius, s.damageMax, s.damageMin, 'torpedo');   // Boss Battle
  if (full) spawnDrops(t, c);
}
// shot down (or out of the world): gone without a blast
function destroy(t) {
  if (!live(t)) return;
  t.state = 'dead'; t.shot = true;
  if (nearCam(t.pos, 40)) {
    G.fx?.burst(t.pos, UP, G.teamColors[t.team], { count: 12, speed: 4, size: 0.08, mist: true });
    G.audio?.play('splat_small', { pos: t.pos, volume: 0.8, pitch: 0.75 });
    G.audio?.play('torpedo_pop', { pos: t.pos, volume: 0.45, pitch: 1.6 });
  }
  emit('sub:destroyed', { kind: 'torpedo', pos: t.pos.clone(), team: t.team });
}
function fizzle(t) {
  if (!live(t)) return;
  t.state = 'dead';
  if (nearCam(t.pos, 40)) { G.fx?.waterPlop?.(t.pos, 0.4); }
}
function hurt(t, dmg) {
  if (!live(t) || !(dmg > 0) || netMuted()) return;   // (a ghost's hit: its owner's copy decides)
  t.flash = 1;
  if (t.ghost) { netHurt(t.owner, 'torpedo', t.gid, dmg); return; }   // a remote player's: its owner's copy takes it
  t.hp -= dmg;
  if (t.hp <= 0) destroy(t);
}

// ---- droplets: fly out of a locked burst, ink where they land, 12 a hit, three hits per foe at most
function spawnDrops(t, c) {
  const s = t.sub, rec = { hits: new Map() };
  const base = Math.random() * Math.PI * 2;
  for (let k = 0; k < s.drops; k++) {
    if (drops.length >= MAX_DROPS) break;
    const a = base + (k / s.drops) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const hs = 3.2 + Math.random() * 3.4, vy = 3.2 + Math.random() * 3.2;
    const p = new V3(c.x + Math.cos(a) * 0.22, c.y + 0.15, c.z + Math.sin(a) * 0.22);
    drops.push({ pos: p, prev: p.clone(), vel: new V3(Math.cos(a) * hs, vy, Math.sin(a) * hs), age: 0, owner: t.owner, team: t.team, rec, sp: t.sp, ghost: t.ghost,
      size: 0.075 + Math.random() * 0.035, dmg: s.dropDamage, cap: s.dropHits, paint: s.dropPaint });
  }
}
function tickDrops(dt) {
  if (!drops.length) { if (dropMesh) dropMesh.count = 0; return; }
  const M = dropsMesh();
  let n = 0;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    const dead = ghostMute(d, () => dropStep(d, dt));   // (a ghost's drops: no paint, no hits — its owner's arrive)
    if (dead) { drops[i] = drops[drops.length - 1]; drops.pop(); continue; }
    if (n < MAX_DROPS) {
      const sp = d.vel.length(), st = 1 + Math.min(1.2, sp * 0.06);
      _q.setFromUnitVectors(ZAX, _v.copy(d.vel).multiplyScalar(1 / Math.max(sp, 1e-3)));
      _m.compose(d.pos, _q, _v2.set(d.size, d.size, d.size * st));
      M.setMatrixAt(n, _m); M.setColorAt(n, G.teamColors[d.team]);
      n++;
    }
  }
  M.count = n;
  M.instanceMatrix.needsUpdate = true;
  if (M.instanceColor) M.instanceColor.needsUpdate = true;
}
// one droplet's step → true when it's done
function dropStep(d, dt) {
  {
    d.age += dt;
    d.prev.copy(d.pos);
    d.vel.y -= 21 * dt;
    d.pos.addScaledVector(d.vel, dt);
    let dead = d.age > 2.4 || d.pos.y < PLAYER.waterY - 1;
    if (!dead) for (const e of G.actors) {
      if (e.team === d.team || !e.alive) continue;
      if (Math.abs(e.pos.x - d.pos.x) > 2.5 || Math.abs(e.pos.z - d.pos.z) > 2.5) continue;
      const hr = hitR(e);
      Physics.segmentCapsuleDist(d.prev, d.pos, hitBase(e, _v3), hr, hitH(e), _res);
      if (_res.dist < hr + d.size) {
        const k = d.rec.hits.get(e) || 0;
        if (k < d.cap) { d.rec.hits.set(e, k + 1); G.projectiles.applyHit(d.owner, e, d.dmg, 'torpedo'); }
        _v.lerpVectors(d.prev, d.pos, _res.t);
        G.fx?.burst(_v, _v2.copy(d.vel).normalize().negate(), G.teamColors[d.team], { count: 5, speed: 2.5, size: 0.06 });
        dead = true; break;
      }
    }
    if (!dead && G.subs?.blockShot(d.prev, d.pos, d.team, d.dmg)) dead = true;
    if (!dead) {
      const w = G.physics.segment(d.prev, d.pos, _hit, true);
      if (w.hit) {
        const area = G.paint.splat(_v.copy(w.point).addScaledVector(w.normal, 0.1), d.paint * (0.8 + Math.random() * 0.4), d.team, { seed: Math.random(), stretch: _v2.copy(d.vel).normalize(), stretchAmt: 0.5 });
        if (area) { if (d.sp) d.owner.addTurfNoSpecial(area); else d.owner.addTurf(area); }
        if (nearCam(w.point, 26)) G.fx?.bounceSplash?.(w.point, w.normal, G.teamColors[d.team]);
        if (Math.random() < 0.35 && nearCam(w.point, 22)) G.audio?.play('splat_small', { pos: w.point, volume: 0.3, pitch: 1.2 });
        dead = true;
      }
    }
    return dead;
  }
}

// ---- per-frame look: fold/unfold, spin, glow, lock ring, trail, whirr
function visuals(t, dt) {
  const s = t.sub;
  if (t.state === 'fly') {
    t.roll += dt * 7; t.fin = 0; t.glowI = 0.45 + 0.25 * Math.sin(t.age * 20);
  } else if (t.state === 'unfold') {
    const k = clamp(t.t / s.unfoldTime, 0, 1);
    t.fin = backOut(clamp(k / 0.65, 0, 1), 2.4);
    t.propOpen = backOut(clamp((k - 0.45) / 0.45, 0, 1), 2);
    t.roll += dt * 2 * (1 - k);
    t.glowI = 1.2 + 2.6 * k + 0.8 * Math.sin(t.t * 40) * k;
    t.propA += dt * 30 * k;
  } else if (t.state === 'launch') {
    t.fin = 1; t.propOpen = 1;
    t.propA += dt * (30 + t.speed * 6);
    t.roll += dt * 1.2;
    t.glowI = 3.2 + 0.8 * Math.sin(t.t * 30);
    if (nearCam(t.pos, 26)) {
      _v.copy(t.pos).addScaledVector(t.dir, -0.45);
      G.fx?.bombTrail?.(_v, _v2.copy(t.dir).multiplyScalar(-t.speed), G.teamColors[t.team]);
    }
  }
  if (t.flash > 0) { t.flash = Math.max(0, t.flash - dt * 6); t.glowI += 5 * t.flash; }
  t.mesh.position.copy(t.pos);
  orient(t, t.dir);
  poseRig(t);
  // lock ring on the target's feet
  if (t.ring) {
    const e = t.target;
    if (!e || !e.alive) { t.ring.visible = false; }
    else {
      t.ringT += dt;
      const loc = G.local;
      t.ring.visible = !loc || loc.team === t.team || loc === e;
      t.ring.position.set(e.pos.x, e.pos.y + (e.smoothY || 0) + 0.06, e.pos.z);
      const k = clamp(t.ringT / 0.22, 0, 1);
      t.ring.scale.setScalar(lerp(1.9, 1, 1 - (1 - k) ** 3) * (1 + 0.04 * Math.sin(t.ringT * 9)));
      t.ring.rotation.z = t.ringT * 0.7;
      const U = t.ring.material.uniforms; U.uTime.value = t.ringT; U.uAlpha.value = k * (t.state === 'launch' ? 1 : 0.8 + 0.2 * Math.sin(t.ringT * 18));
    }
  }
  if (t.whirr) t.whirr.set({ pos: t.pos, pitch: t.state === 'launch' ? 1 + t.speed / 10 : t.state === 'unfold' ? 0.8 + 0.6 * clamp(t.t / s.unfoldTime, 0, 1) : 0.8, volume: t.state === 'fly' ? 0.3 : 0.55 });
}
function dispose(t) {
  if (t.mesh) { t.scene.remove(t.mesh); t.mesh.userData.glow?.dispose(); t.mesh = null; }
  if (t.ring) { t.scene.remove(t.ring); t.ring.geometry.dispose(); t.ring.material.dispose(); t.ring = null; }
  if (t.whirr) { t.whirr.stop(0.12); t.whirr = null; }
}
function clearAll() {
  for (const t of list) { t.state = 'dead'; dispose(t); }
  list.length = 0; drops.length = 0;
  if (dropMesh) dropMesh.count = 0;
}

// ---- shoot-down: enemy shots / beams / blasts
function closestOnSeg(a, b, p, out) {
  _v3.subVectors(b, a); const L2 = _v3.lengthSq();
  const k = L2 > 1e-9 ? clamp(_v.subVectors(p, a).dot(_v3) / L2, 0, 1) : 0;
  return out.copy(a).addScaledVector(_v3, k);
}
function blockShot(prev, pos, team, dmg) {
  for (const t of list) {
    if (!live(t) || t.team === team) continue;
    if (Math.abs(t.pos.x - pos.x) > 4 || Math.abs(t.pos.z - pos.z) > 4) continue;
    if (closestOnSeg(prev, pos, t.pos, _v2).distanceTo(t.pos) > HIT_R) continue;
    hurt(t, dmg);
    return true;
  }
  return false;
}
function blockRay(from, dir, len, team, dmg) {
  let best = len, hitT = null;
  for (const t of list) {
    if (!live(t) || t.team === team) continue;
    _v.copy(t.pos).sub(from);
    const tc = _v.dot(dir);
    if (tc <= 0 || tc > best + HIT_R) continue;
    const d2 = _v.lengthSq() - tc * tc;
    if (d2 > HIT_R * HIT_R) continue;
    const tt = Math.max(0.05, tc - Math.sqrt(HIT_R * HIT_R - d2));
    if (tt < best) { best = tt; hitT = t; }
  }
  if (hitT) hurt(hitT, dmg);
  return best;
}
// a blast went off: enemy torpedoes caught in it — locked ones treat a lethal blast like a Drip Curtain (they go off
// at once), anything else takes the damage (20 shoots one down)
function damageArea(c, radius, dmg, team) {
  for (const t of list.slice()) {
    if (!live(t) || t.team === team) continue;
    if (t.pos.distanceTo(c) > radius + 0.3) continue;
    if (t.ghost) { t.flash = 1; netHurt(t.owner, 'torpedoArea', t.gid, dmg); continue; }   // its owner's copy decides
    areaHit(t, dmg);
  }
}
function areaHit(t, dmg) {
  if (locked(t) && dmg >= 50) burst(t, true);
  else hurt(t, dmg);
}
KIT_GHOSTS.torpedoArea = { netHurt(gid, dmg) { const t = own(gid); if (t) areaHit(t, dmg); } };

// ---- query hook for bots (bots.js shoots down / sidesteps enemy Torpedoes): one stable descriptor per torpedo, getters
// read its live state (see kits/registry.js `threats`). Read-only: nothing here changes how the torpedo behaves.
function threatOf(t) {
  if (t.thr) return t.thr;
  const s = t.sub, v = new V3();
  t.thr = {
    kind: 'torpedo', obj: t, team: t.team, owner: t.owner, pos: t.pos, aimY: 0, radius: s.radius, trigger: HIT_R + PLAYER.radius,
    speed: s.launchSpeed, lockRange: s.lockRange, ground: false,
    get live() { return live(t); },
    get state() { return t.state; },
    get hp() { return t.hp; },
    get shootable() { return live(t); },
    get locked() { return locked(t); },
    get target() { return locked(t) && t.target && t.target.alive ? t.target : null; },
    get vel() { return t.state === 'launch' ? v.copy(t.dir).multiplyScalar(t.speed) : t.state === 'fly' ? v.copy(t.vel) : v.set(0, 0, 0); },
    // hovering (fins unfolding): seconds until it launches
    get hover() { return t.state === 'unfold' ? Math.max(0, s.unfoldTime - t.t) : 0; },
  };
  return t.thr;
}

// =============================================================================================== register
SUB_KITS.torpedo = {
  use,
  ghost,
  netHurt(gid, dmg) { const t = own(gid); if (t) hurt(t, dmg); },
  blocked: (a) => list.some((t) => t.owner === a && live(t)),
  tick, clear: clearAll, blockShot, blockRay, damageArea,
  threats(out) { for (const t of list) if (live(t)) out.push(threatOf(t)); return out; },
  bot: {
    // throw it at a foe it can reach and lock onto; one out at a time
    fight(brain, dist) {
      const a = brain.a;
      if (list.some((t) => t.owner === a && live(t))) return false;
      const go = dist > 4 && dist < 13.5 && Math.random() < 0.035;
      if (go) brain.bombCd = 6 + Math.random() * 5;
      return go;
    },
    paint() { return false; },
  },
  // test / tooling access
  _list: list, _drops: drops,
};
THROWN.torpedo = true;

// ---- model registration (hand prop; the world rig reuses its extra parts)
registerSubModel('torpedo', () => buildTorpedo());

// =============================================================================================== icon
{
  const K = '#15121c', DK = '#2b2735', LT = '#e4e8ef';
  const O = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  SUB_ICONS.torpedo = `<svg class="iw-ico " viewBox="0 0 64 64" aria-hidden="true">
    <g fill="none" stroke="${K}" stroke-width="6" stroke-linecap="round"><path d="M44 5.5 A 13 13 0 0 1 59 18.5" stroke-dasharray="0.1 7.2"/></g>
    <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 4.2"><path d="M40.5 5.2 A 14 14 0 0 1 59.5 22"/></g>
    <g transform="rotate(-28 32 36)"><g ${O}>
      <path d="M16 27.5 L9 16.5 Q8 14.5 10.5 15.2 L22 22.5 Z M16 44.5 L9 55.5 Q8 57.5 10.5 56.8 L22 49.5 Z" fill="currentColor"/>
      <rect x="2.5" y="31" width="8" height="10" rx="2.6" fill="${DK}"/>
      <path d="M11 29 Q11 23.5 17 23 L41 23 Q55 23 59 36 Q55 49 41 49 L17 49 Q11 48.5 11 43 Z" fill="${LT}"/>
      <rect x="26.5" y="23" width="10" height="26" fill="currentColor"/>
      <path d="M47 24.2 Q55.5 26.5 59 36 Q55.5 45.5 47 47.8 Z" fill="${DK}"/>
    </g>
    <circle cx="55.5" cy="36" r="2.8" fill="currentColor" stroke="${K}" stroke-width="2"/>
    <path d="M16 28.5 L41 28.5" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/></g>`
    .replace(/\n\s*/g, '') + '</svg>';
}

// =============================================================================================== sounds
// Whirr (loop, pitch rises as it swims), transform (servo whine + three latch clacks), launch (prop spin-up + wet
// whoosh), pop (a bright wet crack with a patter of droplets), lock (two short rising pips), throw (a soft motor start).
SFX.torpedo_whirr = {
  gain: 0.2, max: 4, jitter: 0, reverb: 0.05, oneShot: 1.2,
  loop(v, p) {
    const T = v.t, base = 240;
    const amp = v.gain(0.55, v.out), lp = v.filter('lowpass', 1500 * p, 0.9, amp);
    const o1 = v.osc('sawtooth', base * p, T, null, lp);
    const o2 = v.osc('triangle', base * 1.5 * p, T, null, v.gain(0.35, lp));
    const trem = v.lfo(18 * p, 0.18, amp.gain, T, null);
    const fizz = v.gain(0.08, v.out); v.noise('pink', T, null, v.filter('bandpass', 2600, 1.2, fizz));
    return {
      pitch(q, now) {
        const k = 0.06;
        o1.frequency.setTargetAtTime(base * q, now, k); o2.frequency.setTargetAtTime(base * 1.5 * q, now, k);
        lp.frequency.setTargetAtTime(Math.min(900 + 1500 * q * q, 9000), now, k); trem.osc.frequency.setTargetAtTime(18 * q, now, k);
        fizz.gain.setTargetAtTime(0.05 + 0.05 * q, now, k);
      },
    };
  },
};
SFX.torpedo_throw = {
  gain: 0.22, max: 3, jitter: 0.04, reverb: 0.05,
  build(v, p) {
    const T = v.t, g = v.gain(0, v.out), lp = v.filter('lowpass', 900, 1, g);
    const o = v.osc('sawtooth', 120 * p, T, T + 0.3, lp);
    sweep(o.frequency, T, 120 * p, 320 * p, 0.25); sweep(lp.frequency, T, 700, 2400, 0.25);
    pts(g.gain, T, [[0, 0], [0.04, 0.5], [0.22, 0.35], [0.3, 0]]);
    v.nz({ f: 3000 * p, q: 3, a: 0.0005, d: 0.02, peak: 0.4 });
  },
};
SFX.torpedo_transform = {
  gain: 0.55, max: 3, jitter: 0.03, reverb: 0.12,
  build(v, p) {
    const T = v.t, g = v.gain(0, v.out), bp = v.filter('bandpass', 900, 3, g);
    const o = v.osc('square', 420 * p, T, T + 0.46, bp);
    sweep(o.frequency, T, 380 * p, 1250 * p, 0.42); sweep(bp.frequency, T, 700 * p, 2600 * p, 0.42);
    pts(g.gain, T, [[0, 0], [0.03, 0.22], [0.36, 0.3], [0.46, 0]]);                           // servo whine
    for (const [t, f] of [[0.06, 2100], [0.2, 2500], [0.34, 3000]]) {                           // latches
      v.nz({ t, f: f * p, q: 4, a: 0.0004, d: 0.018, peak: 0.9 });
      v.tone({ t, f: 190 * p, f1: 90 * p, sw: 0.03, a: 0.001, d: 0.04, peak: 0.55 });
    }
    v.tone({ t: 0.36, type: 'triangle', f: 1760 * p, a: 0.002, d: 0.18, peak: 0.18 });          // armed ting
  },
};
SFX.torpedo_launch = {
  gain: 0.6, max: 3, jitter: 0.04, reverb: 0.1,
  build(v, p) {
    const T = v.t, g = v.gain(0, v.out), bp = v.filter('bandpass', 400, 1.4, g);
    sweep(bp.frequency, T, 300 * p, 2200 * p, 0.3);
    pts(g.gain, T, [[0, 0], [0.08, 0.7], [0.3, 0.3], [0.5, 0]]);
    v.noise('pink', T, T + 0.52, bp);                                                           // whoosh
    const m = v.gain(0, v.out), o = v.osc('sawtooth', 90 * p, T, T + 0.5, v.filter('lowpass', 1400, 1, m));
    sweep(o.frequency, T, 90 * p, 420 * p, 0.35);
    pts(m.gain, T, [[0, 0], [0.05, 0.35], [0.35, 0.25], [0.5, 0]]);                            // prop spin-up
    v.tone({ f: 150 * p, f1: 60 * p, sw: 0.08, a: 0.002, d: 0.12, peak: 0.6 });                  // kick-off thump
    for (let i = 0; i < 4; i++) v.bub(T + 0.05 + i * 0.05 + v.r(0, 0.02), v.r(500, 900) * p, 0.14, 0.03, 1.8);
  },
};
SFX.torpedo_pop = {
  gain: 0.55, max: 4, jitter: 0.05, reverb: 0.2,
  build(v, p) {
    v.nz({ ft: 'highpass', f: 2500, a: 0.0003, d: 0.03, peak: 1 });                            // crack
    v.tone({ f: 260 * p, f1: 70 * p, sw: 0.12, a: 0.001, d: 0.2, peak: 0.9 });
    v.nz({ t: 0.01, f: 1900 * p, f1: 500 * p, sw: 0.25, q: 4, a: 0.002, d: 0.28, peak: 0.7 });  // wet tear
    for (let i = 0; i < 7; i++) v.bub(v.t + 0.08 + v.r(0, 0.35), v.r(700, 1700) * p, 0.16, v.r(0.018, 0.032), 1.8);   // droplet patter
  },
};
SFX.torpedo_lock = {
  gain: 0.3, max: 2, jitter: 0, reverb: 0.06, minGap: 0.1,
  build(v, p) {
    for (const [t, f] of [[0, 1320], [0.09, 1760]]) {
      v.tone({ t, type: 'square', f: f * p, a: 0.002, h: 0.045, d: 0.03, peak: 0.16, to: v.filter('lowpass', 5000, 0.8, v.out) });
      v.tone({ t, f: f * p, a: 0.002, h: 0.05, d: 0.05, peak: 0.3 });
    }
  },
};
