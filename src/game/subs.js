// Sub weapons (every kind except the Splat Bomb, which lives in weapons.js): thrown and placed devices, clouds,
// curtains, mines and jump beacons, plus the status effects they put on players (tracking, poison).
//
//   G.subs.use(actor, subDef)             throw or place (called by the weapon runner after the ink is paid)
//   G.subs.update(dt)                     per frame
//   G.subs.blockActor(actor)              push an actor out of enemy ink curtains (after its movement)
//   G.subs.blockShot(prev, pos, team, dmg) true if an enemy curtain / device absorbed this projectile segment
//   G.subs.blockRay(from, dir, len, team, dmg)  distance to the first enemy curtain / device on a beam (or len)
//   G.subs.damageArea(center, radius, dmg, team)  blasts hurt enemy devices
//   G.subs.beaconsFor(team)               live jump beacons, for the super-jump map
//   G.subs.jumpToBeacon(actor, beacon)
//   G.subs.mineLook(mine, team)           'hidden' | 'ghost' | 'reveal': how a Lurk Mine looks to that team
//   G.subs.viewer                         (tests / pictures) the team whose eyes the team-only looks follow (null: yours)
//   G.subs.clear()
//
// sub-tweaks (2026-10-01): the Twirl Sprinkler sprays out to sprayRadius (5.5 m), evenly over its disc; a Lurk Mine is
// invisible to the other team (a translucent ghost to its own) until it trips, then pops up for everyone through its
// windup; a Skitter Bomb winds up (`delay`) before it bursts; a Hop Beacon shows its jumps left and pings a sonar; a
// Drip Curtain carries an ink meter. Online, the owner's update record ([3, gid, …]: netGhost) keeps the ghosts in step.
//
// Props come from getSubDef(kind) (origin at the bottom centre, +Y away from the surface, +Z forward).
import * as THREE from 'three';
import { G, emit, on, clamp, lerp } from '../core/ctx.js';
import { SUBS, PLAYER, subViewScale } from '../config.js';
import { Physics, Hit } from './physics.js';
import { getSubDef } from './character-weapons.js';
import { getPlasticMaterial, getInkMaterial } from './character-mats.js';
import { MAIN_KITS, SUB_KITS, KIT_GHOSTS, netRec, netId, netHurt, netMuted } from './kits/registry.js';
const r2 = (x) => Math.round(x * 100) / 100;

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const _hit = new Hit(), _hit2 = new Hit();
const _res = { t: 0, dist: 0 };
const GRAV = 24;
const SUB_SCALE = 1.9;         // prop models are built at hand scale; in the world they read at the splat bomb's size
                               // [sub-view] × SUB_VIEW_SCALE[kind] (config.js): drawn bigger, visual only

function nearCam(p, r = 30) { return G.camera && G.camera.position.distanceToSquared(p) < r * r; }
const easeOutBack = (u) => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };

// ------------------------------------------------------------------------------------------------ sprinkler drops
// [sub-tweaks] Each drop flies along its fan direction (unit, in the mounting surface) + SPRAY_UP × the surface normal,
// times a launch speed sp, from 0.2 m off the surface. SPRAY_TAB holds where that lands on a floor for sp = 0, 0.1 …
// (the projectile integrator's own steps — weapons.js _step: gravity 22, drag 0.4, 60 Hz); sprayLaunch(d) inverts it.
// SPRAY_SPLAT: how far a landed drop's own ink reaches past where it lands (its splat, stretched along its flight)
export const SPRAY_UP = 0.75, SPRAY_SPLAT = 0.75;
const SPRAY_TAB = (() => {
  const t = [];
  for (let i = 0; i <= 160; i++) {
    const sp = i * 0.1, dt = 1 / 60;
    let x = 0, y = 0.2, vx = sp, vy = sp * SPRAY_UP, d = 0;
    for (let n = 0; n < 120; n++) {
      vy -= 22 * dt; const k = 1 - 0.4 * dt; vx *= k; vy *= k;
      const nx = x + vx * dt, ny = y + vy * dt;
      if (ny <= 0) { d = x + (nx - x) * (y / Math.max(1e-6, y - ny)); break; }
      x = nx; y = ny; d = x;
    }
    t.push(d);
  }
  return t;
})();
function sprayLaunch(d) {
  const T = SPRAY_TAB;
  if (d <= T[0]) return 0;
  for (let i = 1; i < T.length; i++) if (T[i] >= d) return (i - 1 + (d - T[i - 1]) / Math.max(1e-6, T[i] - T[i - 1])) * 0.1;
  return (T.length - 1) * 0.1;
}

// ------------------------------------------------------------------------------------------------ windup + device looks
// transparent overlays stay out of the GTAO normal / depth pass (scene.overrideMaterial: it would draw them as solid,
// darkening the floor round them) — like towerFx.js noAO; only on geometry these overlays alone use
const noAO = (mesh) => { mesh.onBeforeRender = (r, scene, c, geo) => { geo.drawRange.count = scene.overrideMaterial ? 0 : Infinity; }; return mesh; };
// a ghost-look Lurk Mine draws its body / ink through geometries of its own that share the model's buffers, so its gate
// never touches the opaque mines' (or the hand-held prop's) geometry
const _ghostGeo = new WeakMap();
function ghostGeo(src) {
  let g = _ghostGeo.get(src);
  if (!g) {
    g = new THREE.BufferGeometry();
    for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
    if (src.index) g.setIndex(src.index);
    for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
    g.boundingBox = src.boundingBox; g.boundingSphere = src.boundingSphere;
    _ghostGeo.set(src, g);
  }
  return g;
}
// [sub-tweaks] the sonar's air shell
const FLASH_GEO = new THREE.SphereGeometry(1, 20, 14);
// the Hop Beacon's jumps-left lights: two lamps on a dark pill, over its own lamp, turned to the camera
const PIP_GEO = new THREE.SphereGeometry(0.078, 18, 12), PIP_BAR_GEO = new THREE.CapsuleGeometry(0.105, 0.25, 4, 14).rotateZ(Math.PI / 2).scale(1, 1, 0.45);
const PIP_GAP = 0.25, PIP_UP = 0.24;   // (m between the two lights; how far over the beacon's drawn top they float)
// its sonar: a ring running out along the ground and a shell swelling in the air, every SUBS.beacon.sonar s
const SONAR_DUR = 1.3, SONAR_R = 7, SONAR_AIR = 3.6, SONAR_FOE = 0.18;   // (s a ping lasts, its reach on the ground / in the air, the other team's share)
const RING_GEO = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const SONAR_RING_FS = `
  uniform vec3 uColor; uniform float uR; uniform float uAlpha; varying vec2 vUv;
  void main(){
    float r = length(vUv);
    if (r > 1.0) discard;
    float band = smoothstep(0.045, 0.0, abs(r - uR));
    float wake = smoothstep(uR, uR - 0.22, r) * step(r, uR) * 0.22;
    float fade = 1.0 - smoothstep(0.55, 1.0, uR);
    vec3 c = mix(uColor, vec3(1.0), band * 0.45);
    gl_FragColor = vec4(c, (band * 0.9 + wake) * fade * uAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const SONAR_RING_VS = `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SONAR_AIR_VS = `varying vec3 vN; varying vec3 vV;
  void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const SONAR_AIR_FS = `
  uniform vec3 uColor; uniform float uK; uniform float uAlpha; varying vec3 vN; varying vec3 vV;
  void main(){
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.4);
    float fade = (1.0 - uK) * smoothstep(0.0, 0.08, uK);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), rim * 0.35), rim * fade * uAlpha * 0.5);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
// the Drip Curtain's ink meter: a bar along its top (both faces), team ink shrinking from both ends toward the middle
// (it reads the same from either side), ticks every 10 %, blinking under 30 %
const METER_H = 0.2, METER_UP = 0.3;
const METER_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const METER_FS = `
  uniform vec3 uColor; uniform float uFill; uniform float uTime; uniform float uAspect; varying vec2 vUv;
  void main(){
    float bx = 0.045 / uAspect, by = 0.2;
    float inX = step(bx, vUv.x) * step(vUv.x, 1.0 - bx), inY = step(by, vUv.y) * step(vUv.y, 1.0 - by), inside = inX * inY;
    float x = abs(vUv.x - 0.5) * 2.0 / (1.0 - 2.0 * bx);
    float fill = step(x, uFill) * inside;
    float tick = step(abs(fract(x * 10.0 + 0.5) - 0.5) * 0.1, 0.006) * step(0.05, x) * step(x, 0.95) * inside;
    float edge = smoothstep(0.03, 0.0, abs(x - uFill)) * inside * step(0.001, uFill);
    float low = step(uFill, 0.3) * (0.5 + 0.5 * sin(uTime * 14.0));
    vec3 ink = mix(uColor * 1.1 + 0.04, vec3(1.0), low * 0.45 + edge * 0.5);
    vec3 c = mix(vec3(0.07, 0.06, 0.09), ink, fill);
    c = mix(c, vec3(0.02), tick * 0.6);
    c = mix(vec3(0.94, 0.95, 0.97), c, inside);
    gl_FragColor = vec4(c, inside > 0.5 ? (fill > 0.5 ? 0.96 : 0.8) : 0.92);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// ------------------------------------------------------------------------------------------------ curtain shader
// A sheet of falling ink: scrolling vertical streaks, thicker at the top where it pours from, ragged bottom edge.
const CURTAIN_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CURTAIN_FS = `
  uniform vec3 uColor; uniform float uTime; uniform float uLife; varying vec2 vUv;
  float hash(float n){ return fract(sin(n * 91.3458) * 47453.5453); }
  void main(){
    float col = floor(vUv.x * 46.0);
    float speed = 1.4 + hash(col) * 1.2;
    float y = vUv.y + uTime * speed * 0.55 + hash(col + 3.1);
    float streak = smoothstep(0.35, 0.0, abs(fract(y * 3.0) - 0.5) - 0.15);
    float sheet = 0.42 + 0.35 * streak;
    float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
    float bottom = smoothstep(0.0, 0.12 + 0.06 * hash(col + 7.0), vUv.y);
    float a = sheet * edge * bottom * (0.35 + 0.65 * uLife);
    vec3 c = mix(uColor * 0.7, uColor * 1.35 + 0.08, streak * 0.8 + vUv.y * 0.2);
    gl_FragColor = vec4(c, a);
  }`;

KIT_GHOSTS.subs = { ghost: (a, d) => G.subs?.netGhost(a, d) };
// a super jump that landed on a remote player's Hop Beacon, on the jumper's screen: the owner's copy counts the jump
// (netHurt's channel: [id, jumps used]) and its record updates the lights everywhere
KIT_GHOSTS.beaconUse = { netHurt: (gid, n) => G.subs?.netUse(gid, n) };

export class SubSystem {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.cloudGeo = new THREE.IcosahedronGeometry(1, 3);
    this.viewer = null;          // (tests / pictures) whose eyes the team-only looks follow: a team, or null = the local player's
    this._mats = new Map();      // per-team looks (ghost mine, beacon lights), keyed by colour
    // a splatted owner loses their sprinkler; a super jump that lands on a beacon uses it up
    on('splatted', ({ victim }) => { for (const it of this.items) if (it.owner === victim && it.kind === 'sprinkler' && it.state === 'spray') this._destroy(it); });
    on('superjump:land', ({ actor }) => this._landedOnBeacon(actor));
  }

  clear() {
    for (const it of this.items) this._dispose(it);
    this.items.length = 0;
    for (const k in SUB_KITS) SUB_KITS[k].clear?.();
  }

  // ---------------------------------------------------------------------------------------------- deploy
  use(a, sub) {
    if (SUB_KITS[sub.kind]) return SUB_KITS[sub.kind].use(this, a, sub);   // kit subs (kits/*.js)
    if (sub.placed) return this._place(a, sub);
    const pos = a.pos.clone(); pos.y += 1.35;
    const vel = G.projectiles.throwVelocity(a, sub.throwSpeed, new THREE.Vector3());
    const it = this._throw(a, sub, pos, vel, false);
    netRec(a, 'subs', [0, it.gid, sub.kind, r2(pos.x), r2(pos.y), r2(pos.z), r2(vel.x), r2(vel.y), r2(vel.z)]);
    emit('sub:use', { actor: a, kind: sub.kind });
  }
  // a thrown sub in flight (ghost: a remote player's, online — see netGhost)
  _throw(a, sub, pos, vel, ghost, gid = 0) {
    const mesh = this._prop(sub.kind, a.team);
    mesh.position.copy(pos);
    mesh.userData.inner.position.y = -mesh.userData.lift;   // tumble about the middle while flying
    this.scene.add(mesh);
    const it = { sp: !!a.specialActive,   // thrown during a special (Bomb Barrage): its ink never charges the meter
      kind: sub.kind, sub, owner: a, team: a.team, mesh, pos: pos.clone(), vel: vel.clone(), state: 'fly', age: 0, t: 0,
      spinV: new THREE.Vector3(3 + Math.random() * 6, 3 + Math.random() * 6, 0),
      dir: new THREE.Vector3(vel.x, 0, vel.z).normalize(), ghost, gid: gid || netId(a),
    };
    this.items.push(it);
    G.cues?.sub(sub.kind, 'throw', { owner: a, at: a.pos });   // sfx-cues: each sub's own throw (src/audio/cues.js SUB_CUE)
    return it;
  }

  _place(a, sub) {
    const g = G.physics.raycast(_v.copy(a.pos).setY(a.pos.y + 0.4), DOWN, 3, _hit);
    if (!g.hit) return; { const gb = G.level.blocks[g.block]; if (gb && (gb.roof || gb.rail || gb.perch)) return; }   // nothing gets planted on an off-limits roof, a railing or a crane perch
    // per-player limits: mines — the oldest beyond the limit goes off; beacons — the oldest is removed
    // (a tripped mine is on its way out: it doesn't count, and its windup runs on)
    const mine = this.items.filter((it) => it.owner === a && it.kind === sub.kind && it.state !== 'dead' && it.fuse == null).sort((x, y) => x.born - y.born);
    while (mine.length >= sub.max) { const old = mine.shift(); if (sub.kind === 'mine') this._mineBlast(old); else this._destroy(old); }
    const it = this._plant(a, sub, g.point, g.normal, a.yaw, g, false);
    netRec(a, 'subs', [1, it.gid, sub.kind, r2(it.pos.x), r2(it.pos.y), r2(it.pos.z), r2(g.normal.x), r2(g.normal.y), r2(g.normal.z), r2(a.yaw)]);
    emit('sub:use', { actor: a, kind: sub.kind, pos: it.pos.clone() });
  }
  // a placed device (mine / beacon) on the floor at pos (g: the floor hit, for the ink under it; ghost: see netGhost)
  _plant(a, sub, pos, normal, yaw, g, ghost, gid = 0) {
    const mesh = this._prop(sub.kind, a.team);
    mesh.position.copy(pos);
    mesh.quaternion.setFromUnitVectors(UP, normal);
    mesh.rotateY(yaw);
    this.scene.add(mesh);
    const it = { kind: sub.kind, sub, owner: a, team: a.team, mesh, pos: pos.clone(), state: sub.kind, age: 0, t: 0, born: G.time, normal: normal.clone(), sp: !!a.specialActive,
      face: g ? g.face : -1, u: g ? g.u : 0, v: g ? g.v : 0, hp: sub.hp || 1, uses: sub.uses || 0, ghost, gid: gid || netId(a) };
    this.items.push(it);
    if (sub.kind === 'mine') { this._paintUnder(it, 1.1); this._mineLook(it); }   // (hidden from the other team from its first frame)
    if (sub.kind === 'beacon') this._beaconFx(it);
    G.cues?.sub(sub.kind, 'throw', { owner: a, at: pos, range: sub.kind === 'mine' ? 14 : 30 });   // sfx-cues: placed (a mine is heard only close by)
    return it;
  }

  // prop meshes: an outer node (world transform) → inner (offset while flying so it tumbles about its middle) → model
  // (origin at the model's base: a stuck / planted / landed one sits on its surface at any drawn size)
  _prop(kind, team) {
    const d = getSubDef(kind);
    if (d._top == null) { d.body.computeBoundingBox(); d._top = d.body.boundingBox.max.y; }
    const vs = subViewScale(kind);   // [sub-view] drawn bigger than the built size (visual only)
    const outer = new THREE.Group(), inner = new THREE.Group(), model = new THREE.Group();
    model.scale.setScalar(SUB_SCALE * vs);
    const col = G.teamColors[team];
    const body = new THREE.Mesh(d.body, getPlasticMaterial()); body.castShadow = true;
    const ink = new THREE.Mesh(d.ink, getInkMaterial(col)); ink.castShadow = true;
    model.add(body, ink);
    const glow = d.glow ? new THREE.Mesh(d.glow, this._glowMat(team)) : null;
    if (glow) model.add(glow);
    let spin = null;
    if (d.spin) {
      spin = new THREE.Group(); spin.position.copy(d.spinAt);
      const sm = new THREE.Mesh(d.spin, getPlasticMaterial()); sm.position.copy(d.spinAt).negate(); sm.castShadow = true; spin.add(sm);
      if (d.spinInk) { const si = new THREE.Mesh(d.spinInk, getInkMaterial(col)); si.position.copy(d.spinAt).negate(); spin.add(si); }
      model.add(spin);
    }
    inner.add(model);
    outer.add(inner);
    // [sub-view] lift: half the drawn model's height (it tumbles about its middle in flight: visual); hitH: the height of
    // a sprinkler's / beacon's shot hitbox (blockShot) — the built model's, as always: the bigger look is no bigger target
    outer.userData = { inner, spin, def: d, vs, lift: d._top * SUB_SCALE * vs * 0.5, hitH: d._top * SUB_SCALE, body, ink, glow, top: d._top * SUB_SCALE * vs };
    return outer;
  }
  // [sub-tweaks] a per-team material made once per team colour (key: what it is)
  _teamMat(key, team, make) {
    const c = G.teamColors[team], k = key + ':' + c.getHexString();
    let m = this._mats.get(k);
    if (!m) this._mats.set(k, (m = make(c)));
    return m;
  }
  // lit parts (scan orb band, beacon lamp): team colour that glows a little
  _glowMat(team) {
    this._glow = this._glow || [];
    if (!this._glow[team]) {
      const c = G.teamColors[team];
      this._glow[team] = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.35), emissive: c.clone(), emissiveIntensity: 1.1, roughness: 0.35 });
    }
    return this._glow[team];
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    for (const k in SUB_KITS) SUB_KITS[k].tick?.(dt);   // kit subs' own objects
    this._pulse();
    const items = this.items, nm = G.netm;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.age += dt; it.t += dt;
      const gm = it.ghost && nm;   // (a ghost's splats are its owner's to send; its hits are dropped as a remote's)
      if (gm) nm.mute++;
      try { this._step(it, dt); } finally { if (gm) nm.mute--; }
      if (it.state === 'dead') {
        if (!it.ghost && it.gid) netRec(it.owner, 'subs', [2, it.gid]);
        this._dispose(it); items.splice(i, 1);
      }
    }
  }
  _step(it, dt) {
    if (it.ride) {
      if (G.match?.tower !== it.ride) it.ride = null;
      else { it.pos.copy(it.ride.pos).add(it.rideOff); it.mesh.position.copy(it.pos); }
    }
    {
      switch (it.state) {
        case 'fly': this._fly(it, dt); break;
        case 'stuck': this._stuck(it, dt); break;
        case 'run': this._run(it, dt); break;
        case 'prime': this._primed(it, dt); break;
        case 'cloud': this._cloud(it, dt); break;
        case 'mist': this._mist(it, dt); break;
        case 'curtain': this._curtain(it, dt); break;
        case 'spray': this._spray(it, dt); break;
        case 'mine': this._mine(it, dt); break;
        case 'beacon': this._beacon(it, dt); break;
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- online
  // A remote player's subs: its throws / placements arrive as kit records (KIT_GHOSTS.subs → netGhost) and play out here
  // as ghosts — same flight, sticking, clouds, curtains (solid: they block the local player's shots and push the local
  // kid back), sprinklers, beacons (a teammate can jump to one) — with paint muted and hits dropped (the owner's arrive
  // apart). A ghost mine never goes off by itself: its owner decides (the end record). Damage the local player does to
  // a ghost device goes to its owner (netHurt); the owner's end record ends a ghost still standing.
  // [sub-tweaks] the owner's update record [3, gid, …] keeps every screen's ghost in step: a Lurk Mine tripped (it pops
  // up for everyone: [3, gid]); a Skitter Bomb winding up to burst, where it stopped ([3, gid, x, y, z] — a ghost
  // Skitter never triggers by itself); a Hop Beacon's jumps left ([3, gid, uses]); a Drip Curtain's ink after hits
  // ([3, gid, hp]: its decay runs on every screen, the hits arrive here).
  netGhost(a, d) {
    if (!Array.isArray(d)) return;
    const [op, gid] = d;
    if (op === 2) {
      const it = this.items.find((x) => x.ghost && x.gid === gid && x.state !== 'dead');
      if (!it) return;
      if (it.kind === 'mine') this._mineBlast(it);
      else if (it.state === 'stuck' || it.state === 'run' || it.state === 'prime') this._blast(it, _v.copy(it.pos).setY(it.pos.y + 0.2), it.sub.radius, it.sub.damageMax, it.sub.damageMin, it.sub.paintRadius, it.normal || UP);
      else this._destroy(it);
      it.state = 'dead';
      return;
    }
    if (op === 3) {
      const it = this.items.find((x) => x.ghost && x.gid === gid && x.state !== 'dead');
      if (!it) return;
      if (it.kind === 'mine') { if (it.fuse == null) this._mineTrip(it, null); }
      else if (it.kind === 'seeker') { if (it.state !== 'prime') { it.pos.set(d[2], d[3], d[4]); this._prime(it); } }
      else if (it.kind === 'beacon') it.uses = d[2];
      else if (it.kind === 'curtain' && it.state === 'curtain') it.hp = Math.min(it.hp, d[2]);   // (its own decay runs here too)
      return;
    }
    const sub = SUBS[d[2]];
    if (!sub || this.items.some((x) => x.gid === gid)) return;
    if (op === 0) this._throw(a, sub, _v.set(d[3], d[4], d[5]), _v2.set(d[6], d[7], d[8]), true, gid);
    else if (op === 1) {
      const n = _v2.set(d[6], d[7], d[8]);
      const g = G.physics.raycast(_v3.set(d[3], d[4] + 0.4, d[5]), DOWN, 1.2, _hit);
      this._plant(a, sub, _v.set(d[3], d[4], d[5]), n, d[9], g.hit ? g : null, true, gid);
    }
  }
  // the owner's side of a hit on one of its devices, made on another screen
  netHurt(gid, dmg) {
    const it = this.items.find((x) => !x.ghost && x.gid === gid && x.state !== 'dead');
    if (it) this._hurt(it, dmg);
  }
  // … and of a jump onto one of its Hop Beacons (n: the jumps it used up)
  netUse(gid, n) {
    const b = this.items.find((x) => !x.ghost && x.gid === gid && x.kind === 'beacon' && x.state === 'beacon');
    if (b) this._useBeacon(b, Math.max(1, Math.round(n)));
  }

  _fly(it, dt) {
    const s = it.sub;
    it.vel.y -= GRAV * dt;
    _v.copy(it.pos);
    it.pos.addScaledVector(it.vel, dt);
    // direct hits on enemies (pellet pops on them, murk bomb poisons them for the whole mist)
    if (it.kind === 'burst' || it.kind === 'mist') {
      for (const e of G.actors) {
        if (e.team === it.team || !e.alive) continue;
        Physics.segmentCapsuleDist(_v, it.pos, e.pos, PLAYER.radius + 0.1, e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height, _res);
        if (_res.dist < PLAYER.radius + 0.12) {
          it.pos.lerpVectors(_v, it.pos, _res.t);
          if (it.kind === 'burst') { this._pelletBlast(it, e); it.state = 'dead'; } else { it.direct = e; this._startMist(it); }
          return;
        }
      }
    }
    // clouds burst in mid-air when their fuse runs out
    if ((it.kind === 'scan' || it.kind === 'mist') && it.age > s.fuse) { it.kind === 'scan' ? this._startCloud(it) : this._startMist(it); return; }
    const hit = G.physics.segment(_v, it.pos, _hit);
    if (hit.hit) {
      const n = hit.normal, floor = n.y > 0.6;
      switch (it.kind) {
        case 'sticky': return this._stick(it, hit, 'stuck', s.fuse);
        case 'sprinkler': return this._stick(it, hit, 'spray', 0);
        case 'burst': this._pelletBlast(it, null, hit.point); it.state = 'dead'; return;
        case 'scan': it.pos.copy(hit.point).addScaledVector(n, 0.3); return this._startCloud(it);
        case 'mist': it.pos.copy(hit.point).addScaledVector(n, 0.3); return this._startMist(it);
        case 'seeker': if (floor) return this._startRun(it, hit); break;
        case 'curtain': if (floor) return this._startCurtain(it, hit); break;
      }
      // bounce (seeker / curtain off walls, until they find a floor)
      it.pos.copy(hit.point).addScaledVector(n, 0.12);
      const vn = it.vel.dot(n);
      it.vel.addScaledVector(n, -vn * 1.4).multiplyScalar(0.55);
    }
    if (it.pos.y < PLAYER.waterY - 1.8) { it.state = 'dead'; return; }
    it.mesh.position.copy(it.pos);
    it.mesh.rotation.x += it.spinV.x * dt; it.mesh.rotation.z += it.spinV.y * dt;
  }

  _stick(it, hit, state, fuse) {
    it.state = state; it.t = 0; it.fuse = fuse; it.beepT = 0;
    it.normal = hit.normal.clone();
    it.pos.copy(hit.point).addScaledVector(hit.normal, 0.005);
    it.face = hit.face; it.u = hit.u; it.v = hit.v;
    // stuck to Tower Command's tower (its platform or pillar: moving blocks): ride along with it
    const T = G.match?.tower, lb = hit.block >= 0 ? G.level.blocks[hit.block] : null;
    it.ride = T && lb && lb.dynamic ? T : null;
    if (it.ride) it.rideOff = it.pos.clone().sub(T.pos);
    it.hp = it.sub.hp || 1; it.born = G.time;
    it.mesh.userData.inner.position.y = 0;
    it.mesh.position.copy(it.pos);
    it.mesh.quaternion.setFromUnitVectors(UP, hit.normal);
    if (state === 'spray') {
      // one sprinkler per player: a new one replaces the old
      for (const o of this.items) if (o !== it && o.owner === it.owner && o.kind === 'sprinkler' && o.state === 'spray') this._destroy(o);
      it.pulseT = 0; it.spin = 0;
    }
    G.cues?.sub(it.kind, 'land', { owner: it.owner, team: it.team, at: it.pos });   // sfx-cues: stuck (the fuse / spin loops: src/audio/cues.js)
    emit('sub:land', { kind: it.kind, pos: it.pos.clone(), team: it.team, radius: it.sub.radius || 0 });
  }

  // ---- cling charge: stuck, blinking faster, then a wide blast
  _stuck(it, dt) {
    it.beepT -= dt;
    const k = clamp(it.t / it.fuse, 0, 1);
    it.mesh.scale.setScalar(1 + k * 0.3 + Math.sin(it.t * 40) * 0.025 * k);
    if (it.beepT <= 0) it.beepT = lerp(0.45, 0.1, k);   // sfx-cues: the fuse is the fuse_sticky loop now (src/audio/cues.js)
    if (it.t >= it.fuse) {
      const s = it.sub;
      this._blast(it, it.pos, s.radius, s.damageMax, s.damageMin, s.paintRadius, it.normal);
      it.state = 'dead';
    }
  }

  // ---- skitter bomb: lands, scuttles after the nearest enemy laying a swimmable trail, bursts on reaching them
  _startRun(it, hit) {
    it.state = 'run'; it.t = 0;
    it.pos.copy(hit.point);
    it.heading = Math.atan2(it.dir.x, it.dir.z);
    it.trail = 0; it.stuckT = 0; it.target = null; it.dash = false;
    it.mesh.userData.inner.position.y = 0;
    it.mesh.rotation.set(0, it.heading, 0);
    G.cues?.sub('seeker', 'land', { owner: it.owner, team: it.team, at: it.pos });   // sfx-cues (then the seeker_run loop)
  }
  _run(it, dt) {
    const s = it.sub;
    if (!it.target || !it.target.alive) {
      let best = null, bd = s.seekRange;
      for (const e of G.actors) {
        if (e.team === it.team || !e.alive) continue;
        const d = e.pos.distanceTo(it.pos);
        if (d < bd) { bd = d; best = e; }
      }
      if (best !== it.target) it.dash = false;
      it.target = best;
    }
    // steering, made to be sidestepped: it turns at most s.turnRate (a wide circle at full speed) and, once close and
    // lined up (s.commitDist), dashes straight without steering, so a late sidestep makes it overshoot and swing round.
    // Onto a slow / standing target that sits inside its circle it slows into the turn (s.creep) instead of orbiting.
    let speed = s.speed;
    if (it.target) {
      const tg = it.target, dx = tg.pos.x - it.pos.x, dz = tg.pos.z - it.pos.z, dist = Math.hypot(dx, dz);
      let d = Math.atan2(dx, dz) - it.heading; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      if (!it.dash && dist < s.commitDist && Math.abs(d) < 0.35) it.dash = true;
      else if (it.dash && (Math.abs(d) > Math.PI / 2 || dist > s.commitDist + 1)) it.dash = false;
      if (!it.dash) {
        it.heading += clamp(d, -s.turnRate * dt, s.turnRate * dt);
        if (Math.hypot(tg.vel.x, tg.vel.z) < 2.5) speed *= 1 - s.creep * clamp((Math.abs(d) - 0.7) / 0.6, 0, 1);
      }
    }
    const hx = Math.sin(it.heading), hz = Math.cos(it.heading), step = speed * dt;
    // walls: turn away along them
    _v.copy(it.pos); _v.y += 0.2;
    const w = G.physics.raycast(_v, _v2.set(hx, 0, hz), step + 0.3, _hit2, true);
    if (w.hit && Math.abs(w.normal.y) < 0.5) {
      it.stuckT += dt;
      const side = hx * w.normal.z - hz * w.normal.x >= 0 ? 1 : -1;
      it.heading += side * 6 * dt;
    } else {
      it.stuckT = Math.max(0, it.stuckT - dt);
      const nx = it.pos.x + hx * step, nz = it.pos.z + hz * step;
      const gy = G.level.groundHeight(nx, nz, it.pos.y + 0.6);
      if (gy === -Infinity) { it.state = 'dead'; if (nearCam(it.pos)) G.fx?.burst(it.pos, UP, G.teamColors[it.team], { count: 10, speed: 3, size: 0.08 }); return; }
      it.pos.set(nx, gy, nz);
      it.trail += step;
      if (it.trail > 0.35) { it.trail = 0; this._credit(it, G.paint.splat(_v.copy(it.pos).setY(it.pos.y + 0.12), s.trailRadius, it.team, { seed: Math.random() })); }
    }
    it.mesh.position.copy(it.pos);
    it.mesh.rotation.set(0, it.heading, 0);
    it.mesh.userData.inner.position.y = Math.abs(Math.sin(it.t * 26)) * 0.025 * it.mesh.userData.vs;   // (scuttle bob, drawn size)
    // reached its foe, ran out of time or got stuck: it stops and winds up (s.delay) before it bursts — a foe who reacts
    // can still get clear. (A ghost — a remote player's, online — waits for its owner's word: the update record.)
    if (it.ghost) { if (it.t > s.life + 3) it.state = 'dead'; return; }
    const reached = it.target && it.target.pos.distanceTo(it.pos) < s.triggerDist;
    if (reached || it.t > s.life || it.stuckT > 0.6) this._prime(it);
  }
  // ---- the windup (a Skitter Bomb): it pops up off its wheels, swells and blinks faster and faster, then bursts where it
  // stopped — the damage is decided at the burst, on whoever is still in the blast then
  _prime(it) {
    const s = it.sub;
    if (!it.ghost) netRec(it.owner, 'subs', [3, it.gid, r2(it.pos.x), r2(it.pos.y), r2(it.pos.z)]);
    it.state = 'prime'; it.t = 0; it.fuse = s.delay;
    if (it.heading == null) it.heading = Math.atan2(it.dir.x, it.dir.z);
    it.mesh.position.copy(it.pos);
    G.cues?.sub(it.kind, 'warn', { owner: it.owner, team: it.team, at: it.pos, target: it.target, radius: s.radius });   // sfx-cues: its windup alarm
    if (nearCam(it.pos, 45)) G.fx?.glint?.(_v.copy(it.pos).setY(it.pos.y + it.mesh.userData.lift * 2.2), G.teamColors[it.team], 0.35);
    emit('sub:arm', { kind: it.kind, pos: it.pos.clone(), team: it.team, radius: s.radius });
  }
  _primed(it, dt) {
    const s = it.sub, ud = it.mesh.userData;
    it.fuse -= dt;
    const k = clamp(1 - it.fuse / s.delay, 0, 1), u = clamp(it.t / 0.14, 0, 1);
    ud.inner.position.y = 0.16 * Math.sin(u * Math.PI) * ud.vs * 0.5;                   // a hop off its wheels
    ud.inner.scale.setScalar(1 + 0.32 * k + 0.05 * k * Math.sin(it.t * 70));           // swelling, shuddering
    it.mesh.rotation.set(-0.22 * Math.min(1, it.t / 0.1), it.heading, 0);              // nose up
    this._windupTell(it, k, ud.lift * (1 + 0.32 * k), dt);
    if (it.fuse > 1e-4) return;   // (to the frame: 0.45 s is 27 of them)
    if (it.ghost) { if (it.fuse < -2) it.state = 'dead'; return; }                     // (its owner's end record bursts it)
    this._blast(it, _v.copy(it.pos).setY(it.pos.y + 0.2), s.radius, s.damageMax, s.damageMin, s.paintRadius, UP);
    it.state = 'dead';
  }
  // the windup tell, in the Splat Bomb's own language (fx.js): its blast radius as a danger ring on the floor, every frame,
  // and a beep pulse glowing on it 7 → 20 times a second as k (0 … 1 through the windup) climbs. y: its middle (drawn).
  _windupTell(it, k, y, dt) {
    it.flashT = (it.flashT || 0) + dt * (7 + 13 * k);
    const blink = it.flashT >= 1;
    if (blink) { it.flashT -= 1; it.blinks = (it.blinks || 0) + 1; }
    if (!G.fx || !nearCam(it.pos, 55)) return;
    const n = it.normal || UP, col = G.teamColors[it.team], R = it.sub.radius;
    G.fx.dangerRing?.(_v2.copy(it.pos).addScaledVector(n, 0.02), n, col, R, k);
    if (blink) G.fx.beepPulse?.(_v3.copy(it.pos).addScaledVector(n, y), it.pos, n, col, R, k);
  }

  // ---- echo orb: a sensing cloud that tags enemies it touches (tracked for the thrower's team)
  _startCloud(it) {
    it.state = 'cloud'; it.t = 0;
    it.mesh.visible = false;
    const col = G.teamColors[it.team];
    it.cloud = new THREE.Mesh(this.cloudGeo, new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(1, 1, 1), 0.35), transparent: true, opacity: 0.4, depthWrite: false }));
    it.cloud.position.copy(it.pos); it.cloud.scale.setScalar(0.2);
    this.scene.add(it.cloud);
    it.tagged = new Set();
    G.cues?.sub('scan', 'boom', { owner: it.owner, team: it.team, at: it.pos, range: 40 });   // sfx-cues
    emit('sub:cloud', { kind: 'scan', pos: it.pos.clone(), team: it.team, radius: it.sub.radius });
  }
  _cloud(it, dt) {
    const s = it.sub;
    const grow = clamp(it.t / 0.25, 0, 1), fade = clamp((it.t - s.cloudTime * 0.5) / (s.cloudTime * 0.5), 0, 1);
    it.cloud.scale.setScalar(lerp(0.2, s.radius, 1 - (1 - grow) ** 3));
    it.cloud.material.opacity = 0.4 * (1 - fade);
    for (const e of G.actors) {
      if (e.team === it.team || !e.alive || it.tagged.has(e)) continue;
      if (_v.copy(e.pos).setY(e.pos.y + 0.7).distanceTo(it.pos) < s.radius * grow) {
        it.tagged.add(e);
        this.track(e, it.team, s.trackTime);
      }
    }
    if (it.t >= s.cloudTime) it.state = 'dead';
  }

  // ---- murk bomb: a poison mist (no damage) — slows and drains ink while inside; a direct hit lasts the whole mist
  _startMist(it) {
    it.state = 'mist'; it.t = 0;
    it.mesh.visible = false;
    const col = G.teamColors[it.team].clone().lerp(new THREE.Color(0.25, 0.2, 0.3), 0.55);
    it.cloud = new THREE.Group();
    for (let k = 0; k < 7; k++) {
      const p = new THREE.Mesh(this.cloudGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, depthWrite: false }));
      const a = (k / 7) * Math.PI * 2;
      p.position.set(Math.cos(a) * 1.3 * (k ? 1 : 0), (k % 2) * 0.5, Math.sin(a) * 1.3 * (k ? 1 : 0));
      p.userData.ph = Math.random() * 6;
      it.cloud.add(p);
    }
    it.cloud.position.copy(it.pos);
    it.cloud.scale.setScalar(0.3);
    this.scene.add(it.cloud);
    if (it.direct) this.poison(it.direct, it.sub.mistTime);
    G.cues?.sub('mist', 'boom', { owner: it.owner, team: it.team, at: it.pos, range: 40 });   // sfx-cues (its cloud's hiss: the mist_hiss loop)
    emit('sub:cloud', { kind: 'mist', pos: it.pos.clone(), team: it.team, radius: it.sub.radius });
  }
  _mist(it, dt) {
    const s = it.sub;
    const grow = clamp(it.t / 0.4, 0, 1), fade = clamp((it.t - (s.mistTime - 0.8)) / 0.8, 0, 1);
    it.cloud.scale.setScalar(lerp(0.3, s.radius * 0.72, 1 - (1 - grow) ** 3));
    for (const p of it.cloud.children) {
      p.material.opacity = 0.3 * (1 - fade);
      p.scale.setScalar(1 + 0.12 * Math.sin(it.t * 1.7 + p.userData.ph));
      p.rotation.y += dt * 0.3;
    }
    for (const e of G.actors) {
      if (e.team === it.team || !e.alive) continue;
      if (_v.copy(e.pos).setY(e.pos.y + 0.6).distanceTo(it.pos) < s.radius * grow) this.poison(e, 0.6);
    }
    if (it.t >= s.mistTime) it.state = 'dead';
  }

  // ---- drip curtain: a sheet of falling ink across the throw line; blocks enemy players and shots
  _startCurtain(it, hit) {
    const s = it.sub;
    it.state = 'curtain'; it.t = 0; it.hp = s.hp;
    it.pos.copy(hit.point);
    it.n = it.dir.clone();                               // curtain faces the thrower
    it.tan = new THREE.Vector3(-it.n.z, 0, it.n.x);
    it.mesh.userData.inner.position.y = 0;
    it.mesh.position.copy(it.pos);
    it.mesh.rotation.set(0, Math.atan2(it.n.x, it.n.z), 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: G.teamColors[it.team].clone() }, uTime: { value: 0 }, uLife: { value: 1 } },
      vertexShader: CURTAIN_VS, fragmentShader: CURTAIN_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    it.sheet = noAO(new THREE.Mesh(new THREE.PlaneGeometry(s.width, s.height), mat));
    it.sheet.position.set(0, s.height / 2 + 0.05, 0);
    it.mesh.add(it.sheet);
    // [sub-tweaks] its ink (hp) on a meter along the top, both faces, for everyone (the other team sees how close it is
    // to breaking): team ink shrinking from both ends toward the middle
    const mw = s.width * 0.92;
    it.meter = noAO(new THREE.Mesh(new THREE.PlaneGeometry(mw, METER_H), new THREE.ShaderMaterial({
      uniforms: { uColor: { value: G.teamColors[it.team].clone() }, uFill: { value: 1 }, uTime: { value: 0 }, uAspect: { value: mw / METER_H } },
      vertexShader: METER_VS, fragmentShader: METER_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    })));
    it.meter.renderOrder = 3;
    it.mesh.add(it.meter);
    this._paintUnder(it, 1.4);
    G.cues?.sub('curtain', 'land', { owner: it.owner, team: it.team, at: it.pos });   // sfx-cues
    emit('sub:land', { kind: 'curtain', pos: it.pos.clone(), team: it.team, radius: s.width / 2 });
  }
  _curtain(it, dt) {
    const s = it.sub;
    it.hp -= s.decay * dt;
    it.sheet.material.uniforms.uTime.value = it.t;
    it.sheet.material.uniforms.uLife.value = clamp(it.hp / s.hp, 0, 1);
    const k = it.t < 0.25 ? it.t / 0.25 : 1;
    it.sheet.scale.set(1, k, 1); it.sheet.position.y = (s.height * k) / 2 + 0.05;
    // the meter rides the sheet's top edge
    const mu = it.meter.material.uniforms;
    mu.uFill.value = clamp(it.hp / s.hp, 0, 1); mu.uTime.value = it.t;
    it.meter.position.y = s.height * k + 0.05 + METER_UP; it.meter.scale.y = k;
    // online: the owner tells every screen what hits took (rate-limited; the decay runs everywhere)
    if (!it.ghost && it.hpDirty && G.time - (it.hpSent ?? -9) > 0.1) { it.hpDirty = false; it.hpSent = G.time; netRec(it.owner, 'subs', [3, it.gid, Math.round(it.hp * 10) / 10]); }
    if (it.hp <= 0) this._destroy(it);
  }

  // ---- twirl sprinkler: stuck to a surface, spraying pulses of droplets around itself (weaker after a while). Each drop
  // is aimed at a landing distance picked evenly over the AREA of its disc (0.5 m … sprayRadius − the drop's own splat):
  // the far ring gets as much ink per m² as the middle (sprayLaunch: the launch speed that lands it there on a floor)
  _spray(it, dt) {
    const s = it.sub;
    it.pulseT -= dt;
    it.spin += dt * (it.t < s.sprayFade ? 9 : 4.5);
    const spin = it.mesh.userData.spin;
    if (spin) spin.rotation.y = it.spin;
    if (it.pulseT > 0 || it.ghost) return;   // (a ghost's drops: its owner's arrive as ghost rounds)
    it.pulseT = s.pulse * (it.t < s.sprayFade ? 1 : 2);
    const n = it.normal;
    // a tangent frame on the mounting surface; drops fan out around it, lobbed away from the surface
    const t1 = _v2.set(1, 0, 0); if (Math.abs(n.x) > 0.9) t1.set(0, 0, 1);
    t1.addScaledVector(n, -t1.dot(n)).normalize();
    const t2 = _v3.crossVectors(n, t1);
    const base = _v.copy(it.pos).addScaledVector(n, 0.2);
    const r1 = Math.max(0.8, s.sprayRadius - SPRAY_SPLAT), r0 = Math.min(0.5, r1 * 0.5);
    for (let k = 0; k < s.drops; k++) {
      const a = it.spin * 1.7 + (k / s.drops) * Math.PI * 2 + Math.random() * 0.4;
      const d = Math.sqrt(r0 * r0 + Math.random() * (r1 * r1 - r0 * r0)), sp = sprayLaunch(d);
      const vx = Math.cos(a) * t1.x + Math.sin(a) * t2.x + n.x * SPRAY_UP;
      const vy = Math.cos(a) * t1.y + Math.sin(a) * t2.y + n.y * SPRAY_UP;
      const vz = Math.cos(a) * t1.z + Math.sin(a) * t2.z + n.z * SPRAY_UP;
      G.projectiles.spawnDrop(it.owner, base, vx * sp, vy * sp, vz * sp, { damage: s.dropDamage, radius: 0.5 + Math.random() * 0.25, size: 0.08, weaponId: 'sprinkler' });
    }
  }

  // ---- lurk mine: invisible to the other team; an enemy coming close trips it — it pops up for everyone, blinking, and
  // blows s.delay later (damage + tracking for whoever is still in the blast then)
  _mine(it, dt) {
    const s = it.sub;
    if (it.fuse != null) {
      it.fuse -= dt; it.tripT += dt;
      this._mineLook(it, dt);
      if (it.fuse > 1e-4) return;
      if (!it.ghost) this._mineBlast(it);
      else if (it.fuse < -2) it.state = 'dead';   // (a remote player's mine goes off when its owner says: netGhost; never came)
      return;
    }
    this._mineLook(it, dt);
    if (it.ghost || it.t < s.armTime) return;   // (a remote player's mine trips when its owner says: the update record)
    for (const e of G.actors) {
      if (e.team === it.team || !e.alive) continue;
      if (e.pos.distanceTo(it.pos) < s.triggerRadius) { this._mineTrip(it, e); return; }
    }
  }
  _mineTrip(it, e) {
    const s = it.sub;
    it.fuse = s.delay; it.tripT = 0;
    if (!it.ghost) netRec(it.owner, 'subs', [3, it.gid]);   // (every screen shows it popping up)
    G.cues?.sub('mine', 'warn', { owner: it.owner, team: it.team, at: it.pos, target: e });   // sfx-cues: tripped (the windup to go)
    if (nearCam(it.pos, 45)) G.fx?.glint?.(_v.copy(it.pos).addScaledVector(it.normal || UP, 0.5), G.teamColors[it.team], 0.4);
    emit('sub:arm', { kind: 'mine', pos: it.pos.clone(), team: it.team, radius: s.radius });
    this._mineLook(it, 0);
  }
  // whose eyes the team-only looks follow: SubSystem.viewer (tests, pictures) or the local player's team; -1: nobody's
  // (the menus' backdrop match, a spectator) — they see what a team sees
  viewTeam() { return this.viewer ?? (G.local ? G.local.team : -1); }
  // how a Lurk Mine looks to a team: 'hidden' to the other team until it trips (no mesh — so no shadow — nor a map mark:
  // minimap.js), a translucent pulsing 'ghost' to its own, and once tripped the real thing ('reveal') for everyone
  mineLook(it, team = this.viewTeam()) {
    if (it.fuse != null) return 'reveal';
    return team < 0 || team === it.team ? 'ghost' : 'hidden';
  }
  _mineLook(it, dt = 0) {
    const look = this.mineLook(it), m = it.mesh, ud = m.userData;
    if (look !== it.look) {
      it.look = look;
      m.visible = look !== 'hidden';
      const ghost = look === 'ghost', d = ud.def;
      ud.body.material = ghost ? this._mineGhostMat(it.team, 0) : getPlasticMaterial();
      ud.ink.material = ghost ? this._mineGhostMat(it.team, 1) : getInkMaterial(G.teamColors[it.team]);
      ud.body.castShadow = ud.ink.castShadow = !ghost;
      // (the see-through ghost stays out of the GTAO pass: its own gated geometries; the real thing is solid there)
      ud.body.geometry = ghost ? ghostGeo(d.body) : d.body; ud.ink.geometry = ghost ? ghostGeo(d.ink) : d.ink;
      if (ghost && !ud.body._gated) { noAO(ud.body); noAO(ud.ink); ud.body._gated = true; }
      if (!ghost && ud.body._gated) { ud.body.onBeforeRender = ud.ink.onBeforeRender = () => {}; ud.body._gated = false; }
      if (!ghost && look === 'hidden') { ud.inner.position.y = 0; ud.inner.scale.setScalar(1); }
    }
    if (look !== 'reveal') return;
    // popped up off the floor (an overshooting spring), swelling and shuddering toward the blast; its blast radius on the
    // floor, a beep pulse quickening (_windupTell)
    const k = clamp(1 - it.fuse / it.sub.delay, 0, 1), u = clamp(it.tripT / 0.12, 0, 1);
    ud.inner.position.y = 0.2 * ud.vs * 0.5 * easeOutBack(u);
    ud.inner.scale.setScalar(1 + 0.12 * u + 0.18 * k + 0.04 * k * Math.sin(it.tripT * 70));
    this._windupTell(it, k, ud.lift * (1 + 0.3 * k) + 0.2 * ud.vs * 0.5, dt);
  }
  // the ghost look: the mine's body and ink in see-through team tints (opacity pulsed in _pulse)
  _mineGhostMat(team, ink) {
    return this._teamMat(ink ? 'mineInk' : 'mineBody', team, (c) => new THREE.MeshStandardMaterial({
      color: ink ? c.clone() : c.clone().lerp(new THREE.Color(1, 1, 1), 0.6), emissive: c.clone(), emissiveIntensity: ink ? 0.55 : 0.2,
      roughness: 0.45, transparent: true, opacity: 0.4, depthWrite: false,
    }));
  }
  // per frame: the shared looks that breathe (ghost mines 0.35 … 0.45 opacity; a beacon's last light and its lamp)
  _pulse() {
    const t = G.time, w = 0.5 + 0.5 * Math.sin(t * 3.4), b = 0.5 + 0.5 * Math.sin(t * 7);
    for (const [k, m] of this._mats) {
      if (k.startsWith('mineBody') || k.startsWith('mineInk')) { m.opacity = 0.35 + 0.1 * w; m.emissiveIntensity = (k.startsWith('mineInk') ? 0.4 : 0.12) + 0.35 * w; }
      else if (k.startsWith('pipLast')) m.emissiveIntensity = 0.9 + 1.8 * b;
      else if (k.startsWith('glowLow')) m.emissiveIntensity = 0.25 + 0.75 * b;
    }
  }
  _mineBlast(it) {
    if (it.state === 'dead') return;
    const s = it.sub, c = _v.copy(it.pos).setY(it.pos.y + 0.3).clone();
    this._paint(it, c, s.paintRadius);
    G.fx?.explosion(c, G.teamColors[it.team], s.radius * 0.8);
    G.cues?.sub('mine', 'boom', { owner: it.owner, team: it.team, at: c });   // sfx-cues
    emit('bomb:explode', { actor: it.owner, pos: c.clone(), team: it.team, radius: s.radius });
    for (const e of G.actors) {
      if (e.team === it.team || !e.alive) continue;
      if (_v2.copy(e.pos).setY(e.pos.y + 0.7).distanceTo(c) > s.radius || !G.physics.los(c, _v2)) continue;
      G.projectiles.applyHit(it.owner, e, s.damage, 'mine');
      this.track(e, it.team, s.trackTime);
    }
    this.damageArea(c, s.radius, 30, it.team);
    it.state = 'dead';
  }

  // ---- hop beacon: a super-jump point for the team (two uses). [sub-tweaks] Its jumps left show as two lights floating
  // over it (lit / dark; the last one blinks, and its lamp dims and pulses), turned to whoever looks; every
  // SUBS.beacon.sonar s a sonar ping runs out from it — a ring along the ground and a shell in the air — its team's to
  // see (the other team's faint: SONAR_FOE)
  _beaconFx(it) {
    const ud = it.mesh.userData, fx = { pips: new THREE.Group(), lights: [] };
    fx.pips.position.set(0, ud.top + PIP_UP, 0);
    const bar = new THREE.Mesh(PIP_BAR_GEO, this._teamMat('pipBar', it.team, () => new THREE.MeshStandardMaterial({ color: 0x1c1924, roughness: 0.5, metalness: 0.2 })));
    bar.position.z = -0.03; fx.pips.add(bar);
    for (let i = 0; i < 2; i++) { const l = new THREE.Mesh(PIP_GEO, this._pipMat(it.team, 'on')); l.position.x = (i - 0.5) * PIP_GAP; fx.pips.add(l); fx.lights.push(l); }
    it.mesh.add(fx.pips);
    const col = G.teamColors[it.team].clone();
    fx.ring = noAO(new THREE.Mesh(RING_GEO, new THREE.ShaderMaterial({ uniforms: { uColor: { value: col }, uR: { value: 0 }, uAlpha: { value: 0 } },
      vertexShader: SONAR_RING_VS, fragmentShader: SONAR_RING_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })));
    fx.ring.renderOrder = 3; fx.ring.frustumCulled = false; fx.ring.position.y = 0.03; fx.ring.scale.setScalar(SONAR_R);
    fx.air = noAO(new THREE.Mesh(FLASH_GEO, new THREE.ShaderMaterial({ uniforms: { uColor: { value: col.clone() }, uK: { value: 0 }, uAlpha: { value: 0 } },
      vertexShader: SONAR_AIR_VS, fragmentShader: SONAR_AIR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    fx.air.renderOrder = 4; fx.air.frustumCulled = false; fx.air.position.y = ud.top * 0.88;
    it.mesh.add(fx.ring, fx.air);
    fx.ring.visible = fx.air.visible = false;
    it.fx = fx; it.pipUses = -1;
    this._beaconLook(it);
  }
  _pipMat(team, kind) {
    if (kind === 'off') return this._teamMat('pipOff', team, () => new THREE.MeshStandardMaterial({ color: 0x3a3546, roughness: 0.55, emissive: 0x000000 }));
    return this._teamMat(kind === 'last' ? 'pipLast' : 'pipOn', team, (c) => new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color(1, 1, 1), 0.35), emissive: c.clone(), emissiveIntensity: 2.2, roughness: 0.3 }));
  }
  // the lights and the lamp for the jumps it has left (1: the last light blinks, the lamp dims and pulses)
  _beaconLook(it) {
    const fx = it.fx, n = it.uses, max = it.sub.uses || 2;
    if (!fx || it.pipUses === n) return;
    it.pipUses = n;
    fx.lights.forEach((l, i) => { l.material = i < n ? this._pipMat(it.team, n === 1 && max > 1 ? 'last' : 'on') : this._pipMat(it.team, 'off'); l.scale.setScalar(i < n ? 1 : 0.82); });
    const g = it.mesh.userData.glow;
    if (g) g.material = n === 1 && max > 1 ? this._teamMat('glowLow', it.team, (c) => new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.3), emissive: c.clone(), emissiveIntensity: 0.6, roughness: 0.35 })) : this._glowMat(it.team);
  }
  _beacon(it, dt) {
    const ud = it.mesh.userData, spin = ud.spin, fx = it.fx;
    if (spin) spin.rotation.y += dt * 1.5;
    if (!fx) return;
    this._beaconLook(it);
    // the lights face the camera (about the beacon's own up)
    const cam = G.camera;
    if (cam) {
      it.mesh.updateWorldMatrix(false, false);
      _v.copy(cam.position); it.mesh.worldToLocal(_v);
      fx.pips.rotation.y = Math.atan2(_v.x, _v.z);
      fx.pips.position.y = ud.top + PIP_UP + 0.025 * Math.sin(G.time * 2.4 + it.gid);
    }
    // the sonar: a ping every `sonar` s from when it was planted
    const per = it.sub.sonar || 1.75, ph = (G.time - it.born) % per, on = ph < SONAR_DUR, vt = this.viewTeam();
    fx.ring.visible = fx.air.visible = on;
    if (!on) return;
    const k = ph / SONAR_DUR, a = vt < 0 || vt === it.team ? 1 : SONAR_FOE;
    fx.ring.material.uniforms.uR.value = 0.05 + 0.95 * (1 - Math.pow(1 - k, 1.6)); fx.ring.material.uniforms.uAlpha.value = a;
    fx.air.material.uniforms.uK.value = k; fx.air.material.uniforms.uAlpha.value = a;
    fx.air.scale.setScalar(0.3 + SONAR_AIR * (1 - Math.pow(1 - k, 2)));
  }
  beaconsFor(team) { return this.items.filter((it) => it.kind === 'beacon' && it.state === 'beacon' && it.team === team); }
  jumpToBeacon(actor, b) {
    if (!b || b.state !== 'beacon' || b.team !== actor.team) return false;
    const ok = actor.superJump(b.pos.clone());
    if (ok) actor._jumpBeacon = b;
    return ok;
  }
  _landedOnBeacon(actor) {
    const b = actor._jumpBeacon;
    if (!b) return;
    actor._jumpBeacon = null;
    if (b.state !== 'beacon') return;
    // a jumper who carries beacons themselves uses it up on landing
    const n = actor.sub?.kind === 'beacon' ? Math.max(1, b.uses) : 1;
    if (b.ghost) netHurt(b.owner, 'beaconUse', b.gid, n);   // (a remote player's: its owner's copy counts it and tells everyone)
    this._useBeacon(b, n);
  }
  _useBeacon(b, n) {
    b.uses -= n;
    G.cues?.sub('beacon', 'use', { owner: b.owner, team: b.team, at: b.pos });   // sfx-cues
    if (b.uses <= 0) this._destroy(b);
    else { this._beaconLook(b); if (!b.ghost) netRec(b.owner, 'subs', [3, b.gid, b.uses]); }
  }

  // ---------------------------------------------------------------------------------------------- effects
  track(e, team, time) {
    const st = e.status;
    const fresh = !(st.track > 0 && st.trackTeam === team);
    st.track = Math.max(st.trackTeam === team ? st.track : 0, time); st.trackTeam = team;
    if (fresh) emit('actor:tracked', { actor: e, team });
  }
  poison(e, time) {
    const fresh = !(e.status.poison > 0);
    e.status.poison = Math.max(e.status.poison, time);
    if (fresh) emit('actor:poisoned', { actor: e });
  }

  // paint + damage enemies (with line of sight) around a blast, like the splat bomb
  _blast(it, c, radius, dmgMax, dmgMin, paintRadius, n) {
    const center = c.clone();
    this._paint(it, _v2.copy(center).addScaledVector(n || UP, 0.2), paintRadius);
    G.fx?.explosion(center, G.teamColors[it.team], radius);
    G.cues?.sub(it.kind, 'boom', { owner: it.owner, team: it.team, at: center });   // sfx-cues: each kind's own blast
    emit('shake', { pos: center.clone(), amount: 0.6 });
    emit('bomb:explode', { actor: it.owner, pos: center.clone(), team: it.team, radius });
    for (const e of G.actors) {
      if (e.team === it.team || !e.alive) continue;
      _v3.copy(e.pos); _v3.y += 0.7;
      const d = _v3.distanceTo(center);
      if (d > radius || !G.physics.los(_v2.copy(center).addScaledVector(n || UP, 0.3), _v3)) continue;
      const k = 1 - clamp((d - 0.8) / (radius - 0.8), 0, 1);
      G.projectiles.applyHit(it.owner, e, lerp(dmgMin, dmgMax, k * k), it.kind);
    }
    this.damageArea(center, radius, 60, it.team);
    G.boss?.splash(it.owner, center, radius, dmgMax, dmgMin, it.kind);   // Boss Battle
  }
  _pelletBlast(it, direct, at) {
    const s = it.sub, c = (at || it.pos).clone();
    this._paint(it, _v2.copy(c).setY(c.y + 0.2), s.paintRadius);
    G.fx?.explosion(c, G.teamColors[it.team], s.radius * 0.8);
    G.cues?.sub('burst', 'boom', { owner: it.owner, team: it.team, at: c });   // sfx-cues: the Pop Pellet's own pop
    emit('bomb:explode', { actor: it.owner, pos: c.clone(), team: it.team, radius: s.radius });
    if (direct) G.projectiles.applyHit(it.owner, direct, s.directDamage, 'burst');
    for (const e of G.actors) {
      if (e.team === it.team || !e.alive || e === direct) continue;
      _v3.copy(e.pos); _v3.y += 0.7;
      if (_v3.distanceTo(c) > s.radius || !G.physics.los(_v2.copy(c).setY(c.y + 0.3), _v3)) continue;
      G.projectiles.applyHit(it.owner, e, s.splashDamage, 'burst');
    }
    this.damageArea(c, s.radius, 25, it.team);
    G.boss?.splash(it.owner, c, s.radius, s.directDamage, s.splashDamage, 'burst');   // Boss Battle
  }
  _paint(it, c, r) {
    let area = G.paint.splat(c, r, it.team, { seed: Math.random() });
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * Math.PI * 2, rr = r * (0.55 + Math.random() * 0.45);
      area += G.paint.splat(_v3.set(c.x + Math.cos(a) * rr, c.y + 0.3, c.z + Math.sin(a) * rr), 0.5 + Math.random() * 0.4, it.team, { seed: Math.random() });
    }
    this._credit(it, area);
  }
  _paintUnder(it, r) { this._credit(it, G.paint.splat(_v3.copy(it.pos).setY(it.pos.y + 0.2), r, it.team, { seed: Math.random() })); }
  // turf for the thrower; ink from a special (Bomb Barrage throws) never charges the special meter
  _credit(it, area) { if (it.sp) it.owner.addTurfNoSpecial(area); else it.owner.addTurf(area); }

  // ---------------------------------------------------------------------------------------------- blocking + damage
  _hurt(it, dmg) {
    if (it.state === 'dead' || netMuted()) return;   // (a ghost's hit: its owner's copy decides)
    if (it.ghost) {   // a remote player's device: its owner's copy takes the hit (and says when it's gone)
      netHurt(it.owner, 'subs', it.gid, dmg);
      if (it.state === 'curtain') it.hp -= dmg;   // (the curtain fades as it's hit)
      return;
    }
    it.hp -= dmg;
    if (it.state === 'curtain') { it.hpDirty = true; return; }   // curtains fade instead; _curtain removes them at 0
    if (it.hp <= 0) this._destroy(it);
  }
  // an enemy shot segment: curtains absorb it (and lose hp); devices it touches are damaged
  blockShot(prev, pos, team, dmg) {
    for (const R of [MAIN_KITS, SUB_KITS]) for (const k in R) if (R[k].blockShot?.(prev, pos, team, dmg)) return true;   // kit shields / shoot-able bombs
    for (const it of this.items) {
      if (it.team === team) continue;
      if (it.state === 'curtain') {
        const s = it.sub;
        const a = _v.copy(prev).sub(it.pos).dot(it.n), b = _v2.copy(pos).sub(it.pos).dot(it.n);
        if ((a > 0) === (b > 0)) continue;
        const f = a / (a - b);
        _v3.lerpVectors(prev, pos, f).sub(it.pos);
        if (Math.abs(_v3.dot(it.tan)) > s.width / 2 || _v3.y < -0.2 || _v3.y > s.height) continue;
        this._hurt(it, dmg * s.shotMul);
        if (nearCam(it.pos)) G.fx?.burst(_v3.add(it.pos), it.n, G.teamColors[it.team], { count: 3, speed: 2, size: 0.06 });
        return true;
      }
      if (it.state === 'spray' || it.state === 'beacon') {
        const h = it.mesh.userData.hitH;                    // model height (the built size's: [sub-view] _prop)
        _v.copy(it.pos).addScaledVector(it.normal || UP, h * 0.5);
        Physics.segmentCapsuleDist(prev, pos, _v2.copy(_v).setY(_v.y - h * 0.5), 0.3, h, _res);
        if (_res.dist < 0.34) { this._hurt(it, dmg); return true; }
      }
    }
    return false;
  }
  blockRay(from, dir, len, team, dmg) {
    for (const R of [MAIN_KITS, SUB_KITS]) for (const k in R) if (R[k].blockRay) len = Math.min(len, R[k].blockRay(from, dir, len, team, dmg));   // kit shields
    let best = len, hitIt = null;
    for (const it of this.items) {
      if (it.team === team || it.state !== 'curtain') continue;
      const s = it.sub;
      const dn = dir.dot(it.n);
      if (Math.abs(dn) < 1e-4) continue;
      const t = _v.copy(it.pos).sub(from).dot(it.n) / dn;
      if (t <= 0 || t >= best) continue;
      _v2.copy(from).addScaledVector(dir, t).sub(it.pos);
      if (Math.abs(_v2.dot(it.tan)) > s.width / 2 || _v2.y < -0.2 || _v2.y > s.height) continue;
      best = t; hitIt = it;
    }
    if (hitIt) this._hurt(hitIt, dmg * hitIt.sub.shotMul);
    return best;
  }
  damageArea(c, radius, dmg, team) {
    if (netMuted()) return;   // a ghost's blast: the owner's own blast hurts devices (netHurt carries it to theirs)
    G.specials?.areaHit(c, radius, dmg, team);
    for (const k in SUB_KITS) SUB_KITS[k].damageArea?.(c, radius, dmg, team);   // kit subs caught in a blast (torpedo)
    for (const it of this.items) {
      if (it.team === team || !(it.state === 'curtain' || it.state === 'spray' || it.state === 'beacon')) continue;
      if (it.pos.distanceTo(c) < radius + 0.4) this._hurt(it, dmg);
    }
  }
  // enemy players can't walk (or swim) through a curtain: push them back out to the side they're on
  blockActor(a) {
    for (const it of this.items) {
      if (it.state !== 'curtain' || it.team === a.team) continue;
      const s = it.sub;
      _v.copy(a.pos).sub(it.pos);
      const along = _v.dot(it.tan), across = _v.dot(it.n), r = PLAYER.radius + 0.12;
      if (Math.abs(along) > s.width / 2 + PLAYER.radius || _v.y < -1.2 || _v.y > s.height || Math.abs(across) > r) continue;
      const side = across >= 0 ? 1 : -1;
      a.pos.addScaledVector(it.n, side * r - across);
      const vn = a.vel.dot(it.n);
      if (vn * side < 0) a.vel.addScaledVector(it.n, -vn);
    }
  }

  _destroy(it) {
    if (it.state === 'dead') return;
    const c = _v.copy(it.pos).addScaledVector(it.normal || UP, 0.2);
    if (nearCam(c, 40)) {
      G.fx?.burst(c, it.normal || UP, G.teamColors[it.team], { count: 12, speed: 4, size: 0.08 });
      G.cues?.sub(it.kind, 'end', { owner: it.owner, team: it.team, at: c.clone() });   // sfx-cues: curtain / sprinkler / beacon own ends, else a smash
    }
    emit('sub:destroyed', { kind: it.kind, pos: c.clone(), team: it.team });
    it.state = 'dead';
  }
  _dispose(it) {
    this.scene.remove(it.mesh);
    if (it.cloud) {
      this.scene.remove(it.cloud);
      it.cloud.traverse?.((o) => o.material?.dispose());
      it.cloud.material?.dispose();
    }
    if (it.sheet) { it.sheet.geometry.dispose(); it.sheet.material.dispose(); }
    if (it.meter) { it.meter.geometry.dispose(); it.meter.material.dispose(); }
    if (it.fx) { it.fx.ring.material.dispose(); it.fx.air.material.dispose(); }
  }
}
