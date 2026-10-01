// Specials (everything except Tidal Slam and Ink Tempest, which live in actor.js / weapons.js).
//
// A running special is `actor.specialActive = { id, def, t, dur, … }`. Flags on it steer the actor's own update:
//   body      the special owns movement this frame (G.specials.body runs instead of the normal controller)
//   speed     ground speed override (m/s); accel: acceleration override
//   noSquid   can't turn into a squid;  inkProof: enemy ink neither slows nor hurts
//   faceYaw   body yaw to hold (crab hull);  faceMove: face the velocity;  aimFace: face the aim
//   firing    > 0 → firing pose;  hang > 0 → clinging in place (zipline)
//   seatY     lift the character (riding the crab)
// Hooks called by the actor / projectiles: start, tick, body, weapon, filterDamage, onSplat, shotHit, rayHit, areaHit.
// World objects (tornados, twisters, speakers, bubbles, thrown stamps, shells, cheer-orb bombs, missiles) live in
// this.world and update in update(dt).
import * as THREE from 'three';
import { G, emit, on, clamp, lerp, angleDiff } from '../core/ctx.js';
import { SPECIALS, SPECIAL_ORDER, SUBS, PLAYER } from '../config.js';
import { Physics, Hit } from './physics.js';
import { getWeaponDef } from './character-weapons.js';
import { getPlasticMaterial, getInkMaterial } from './character-mats.js';
import { rumble } from './actor.js';
import { SPECIAL_ICONS } from '../ui/ui-icons.js';
import { KIT_GHOSTS, netRec, netId, netHurt, netMuted, ghostMute } from './kits/registry.js';
import { teamKnown } from './botSight.js';

// world props for the big specials (kraken, speaker, missile, jetpack, crab) — optional until they exist
let PROPS = null;
import('./special-props.js').then((m) => { PROPS = m; }).catch(() => { /* placeholders are used */ });
const prop = (kind) => { try { return PROPS && PROPS.getSpecialProp ? PROPS.getSpecialProp(kind) : null; } catch (e) { console.warn('[specials] prop', kind, e); return null; } };

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const _hit = new Hit(), _hit2 = new Hit();
const _res = { t: 0, dist: 0 };
const TAU = Math.PI * 2;

// ---- online (see SpecialSystem.netGhost): the owner records its special as ['k', nid, 'sp', data] —
//   [0, index in SPECIAL_ORDER] start · [1, reason] end · [2, kind, gid, …] a world object (missile, twister, speaker,
//   bubble, thrown stamp, shell, orb) · [3, gid, what] a world object's event · [4, what, …] a running special's moment
// Everyone else plays it on that player as a ghost: the props / transformation / held things, visual-only (paint muted,
// hits dropped); continuous damage (tornado, sound beam) is each client's own, on its own players.
const r2 = (x) => Math.round(x * 100) / 100;
const v3 = (v) => [r2(v.x), r2(v.y), r2(v.z)];
const V = (d, i) => new THREE.Vector3(d[i], d[i + 1], d[i + 2]);
const rec = (a, d) => netRec(a, 'sp', d);

const near = (p, r = 32) => !!G.camera && G.camera.position.distanceToSquared(p) < r * r;
const hearable = (a) => a.isLocal || a._nearCamera();
const play = (name, o) => G.audio?.play(name, o);
const loop = (name, o) => G.audio?.loop?.(name, o) || null;
function groundBelow(p, maxDown = 30) {
  const g = G.physics.raycast(_v4.copy(p).setY(p.y + 0.3), DOWN, maxDown, _hit2, true);
  return g.hit ? g.point.clone() : null;
}
// special ink counts as turf but never charges the special meter
function paint(owner, pos, r, team) { const area = G.paint.splat(pos, r, team, { seed: Math.random() }); owner?.addTurfNoSpecial?.(area); return area; }
// damage everyone on the other team within `radius` of c (line of sight from c), falloff from dmgMax to dmgMin
// Mega Stamp: the body's facing (it turns slower than the aim) and a front-arc test (is p within arcDeg of the facing?)
function stampFwd(s) { return new THREE.Vector3(Math.sin(s.bodyYaw), 0, Math.cos(s.bodyYaw)); }
function stampFront(a, s, p, arcDeg) {
  const dx = p.x - a.pos.x, dz = p.z - a.pos.z, l = Math.hypot(dx, dz);
  if (l < 0.3) return true;
  return (dx * Math.sin(s.bodyYaw) + dz * Math.cos(s.bodyYaw)) / l >= Math.cos((arcDeg * Math.PI) / 180);
}
// specials that transform you / take over your weapon for a while: they sound a "wearing off" cue before they end
const TRANSFORMS = new Set(['jetpack', 'crab', 'kraken', 'stamp', 'zipcaster', 'zooka', 'blower', 'bubbler']);
const ENDING_CUE = 2.0;   // seconds left when it sounds
const STAMP_SMASHES = new Set(['bomb', 'sticky', 'burst', 'seeker', 'mist', 'mine']);   // sub kinds a swing smashes
function blast(owner, team, c, radius, dmgMax, dmgMin, weaponId, killRadius = 0) {
  for (const e of G.actors) {
    if (e.team === team || !e.alive) continue;
    _v.copy(e.pos); _v.y += 0.8;
    const d = _v.distanceTo(c);
    if (d > radius + 0.3) continue;
    if (!G.physics.los(_v2.copy(c).setY(c.y + 0.35), _v)) continue;
    const k = d <= killRadius ? 0 : clamp((d - killRadius) / Math.max(0.01, radius - killRadius), 0, 1);
    G.projectiles.applyHit(owner, e, lerp(dmgMax, dmgMin, k * k), weaponId);
  }
  G.subs?.damageArea(c, radius, 60, team);
  G.boss?.splash(owner, c, radius, dmgMax, dmgMin, weaponId);   // Boss Battle
}
// continuous damage (tornado, sound beam): no per-frame hit events, only the splat
// (online: each client applies it to its own players — from a ghost's tornado / speaker too, as the Ink Tempest does)
function tickDamage(owner, e, dmg, weaponId) {
  if (!e.alive || e.team === owner.team || e.remote) return;
  const killed = e.damage(dmg, owner, weaponId);
  if (killed) emit('hit', { attacker: owner, victim: e, damage: dmg, killed: true, weaponId });
}
function bounds() { return G.level.bounds; }

// ------------------------------------------------------------------------------------------------ shaders
// swirling funnel (vortex, twisters): spiral streaks scrolling up, soft top/bottom, team tint
const SWIRL_VS = `
  uniform float uTime; uniform float uBottom; uniform float uTop; uniform float uWobble;
  varying vec2 vUv; varying float vRim;
  void main(){
    vUv = uv;
    vec3 p = position;
    float k = mix(uBottom, uTop, pow(uv.y, 0.8));
    p.xz *= k;
    p.x += sin(uTime * 3.1 + uv.y * 5.0) * uWobble * uv.y;
    p.z += cos(uTime * 2.7 + uv.y * 4.2) * uWobble * uv.y;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vRim = 1.0 - abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }`;
const SWIRL_FS = `
  uniform vec3 uColor; uniform float uTime; uniform float uAlpha; uniform float uSpeed;
  varying vec2 vUv; varying float vRim;
  void main(){
    float s = fract(vUv.x * 4.0 + vUv.y * 2.5 - uTime * uSpeed);
    float band = smoothstep(0.0, 0.18, s) * smoothstep(0.62, 0.3, s);
    float s2 = fract(vUv.x * 7.0 - vUv.y * 1.5 - uTime * uSpeed * 1.6);
    float band2 = smoothstep(0.0, 0.1, s2) * smoothstep(0.4, 0.2, s2);
    float fade = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
    float a = (0.28 + 0.5 * band + 0.25 * band2) * fade * (0.55 + 0.45 * vRim) * uAlpha;
    vec3 c = mix(uColor * 0.7, uColor * 1.5 + 0.12, band * 0.8 + band2 * 0.4);
    gl_FragColor = vec4(c, a);
  }`;
// sound beam: rings racing outward along the axis
const BEAM_FS = `
  uniform vec3 uColor; uniform float uTime; uniform float uAlpha; uniform float uCharge;
  varying vec2 vUv; varying float vRim;
  void main(){
    float r = fract(vUv.y * 26.0 - uTime * 5.0);
    float ring = smoothstep(0.0, 0.08, r) * smoothstep(0.35, 0.12, r);
    float edge = smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
    float a = mix(0.12 + 0.5 * vRim, (0.25 + 0.6 * ring) * (0.45 + 0.55 * vRim), uCharge) * edge * uAlpha;
    vec3 c = mix(uColor, uColor * 1.6 + 0.25, ring * uCharge);
    gl_FragColor = vec4(c, a);
  }`;
// soap-ink bubble / force field: iridescent fresnel rim, faint body, moving highlight
const BUBBLE_VS = `
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position;
    gl_Position = projectionMatrix * mv;
  }`;
const BUBBLE_FS = `
  uniform vec3 uColor; uniform float uTime; uniform float uAlpha; uniform float uHit;
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(f, 2.2);
    vec3 irid = 0.5 + 0.5 * cos(6.2831 * (f * 1.3 + uTime * 0.15 + vec3(0.0, 0.33, 0.67)));
    float swirl = 0.5 + 0.5 * sin(vP.y * 5.0 + vP.x * 3.0 + uTime * 2.0);
    vec3 c = mix(uColor, irid, 0.35 * rim) + uColor * swirl * 0.15 + vec3(uHit);
    float hl = pow(max(0.0, dot(normalize(vN), normalize(vec3(-0.4, 0.7, 0.6)))), 40.0);
    float a = (0.1 + 0.75 * rim + 0.2 * swirl * rim + uHit * 0.5) * uAlpha + hl * 0.8;
    gl_FragColor = vec4(c + hl, clamp(a, 0.0, 1.0));
  }`;

// zipline aura: dark smoky shroud, drifting streaks, glowing team-coloured rim
const AURA_VS = `
  uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    vec3 p = position;
    p += normal * (0.1 * sin(uTime * 3.0 + position.y * 7.0 + atan(position.z, position.x) * 3.0) + 0.05 * sin(uTime * 5.3 + position.y * 13.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position;
    gl_Position = projectionMatrix * mv;
  }`;
const AURA_FS = `
  uniform vec3 uColor; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    // drifting patches of dark smoke rising through the shroud, a thin violet-tinted glow at the edge
    float n = sin(vP.x * 6.0 + uTime * 1.3) * sin(vP.y * 5.0 - uTime * 2.4) * sin(vP.z * 6.0 + uTime * 1.1);
    float n2 = sin((vP.x + vP.z) * 9.0 - uTime * 3.0 + vP.y * 4.0);
    float smoke = clamp(0.45 + 0.7 * n + 0.25 * n2, 0.0, 1.0);
    vec3 dark = vec3(0.03, 0.0, 0.06);
    vec3 glow = mix(uColor, vec3(0.62, 0.22, 1.0), 0.5) * 1.9;
    float rim = pow(f, 3.5);
    vec3 c = mix(dark, glow, rim * 0.9);
    float a = smoke * smoke * 0.6 * (0.3 + 0.7 * f) + rim * 0.45;
    gl_FragColor = vec4(c, clamp(a, 0.0, 0.9));
  }`;
function auraMat(color) {
  return new THREE.ShaderMaterial({ uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 } }, vertexShader: AURA_VS, fragmentShader: AURA_FS, transparent: true, depthWrite: false });
}

function swirlMat(color, o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uAlpha: { value: 1 }, uSpeed: { value: o.speed ?? 1.6 },
      uBottom: { value: o.bottom ?? 0.35 }, uTop: { value: o.top ?? 1 }, uWobble: { value: o.wobble ?? 0.2 } },
    vertexShader: SWIRL_VS, fragmentShader: SWIRL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}
function beamMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uAlpha: { value: 1 }, uCharge: { value: 0 }, uBottom: { value: 1 }, uTop: { value: 1 }, uWobble: { value: 0 } },
    vertexShader: SWIRL_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}
function bubbleMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uAlpha: { value: 1 }, uHit: { value: 0 } },
    vertexShader: BUBBLE_VS, fragmentShader: BUBBLE_FS, transparent: true, depthWrite: false,
  });
}

// a mesh group from a prop def's geometry (body plastic + team ink + optional glow)
function propMesh(d, team, glowMat) {
  const g = new THREE.Group();
  if (d.body) { const m = new THREE.Mesh(d.body, getPlasticMaterial()); m.castShadow = true; g.add(m); }
  if (d.ink) { const m = new THREE.Mesh(d.ink, getInkMaterial(G.teamColors[team])); m.castShadow = true; g.add(m); }
  if (d.glow && glowMat) g.add(new THREE.Mesh(d.glow, glowMat));
  return g;
}
function partMesh(body, ink, team) {
  const g = new THREE.Group();
  if (body) { const m = new THREE.Mesh(body, getPlasticMaterial()); m.castShadow = true; g.add(m); }
  if (ink) { const m = new THREE.Mesh(ink, getInkMaterial(G.teamColors[team])); m.castShadow = true; g.add(m); }
  return g;
}

// ================================================================================================ system
export class SpecialSystem {
  constructor(scene) {
    this.scene = scene;
    this.world = [];
    this.owned = new Set();          // meshes a running special put in the scene (kraken body, crab rig, tether, orb)
    this.shieldMeshes = new Map();
    this.cheers = [];
    this.sphereGeo = new THREE.IcosahedronGeometry(1, 4);
    this.funnelGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 12, true).translate(0, 0.5, 0);
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);   // along +Z
    this.ringGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
    this._glow = [];
  }

  _add(...objs) { for (const o of objs) { this.scene.add(o); this.owned.add(o); } }
  _remove(...objs) { for (const o of objs) { if (!o) continue; this.scene.remove(o); this.owned.delete(o); } }

  glowMat(team) {
    if (!this._glow[team]) {
      const c = G.teamColors[team];
      this._glow[team] = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.35), emissive: c.clone(), emissiveIntensity: 1.2, roughness: 0.35 });
    }
    return this._glow[team];
  }

  clear() {
    for (const w of this.world) w.dispose?.();
    this.world.length = 0;
    for (const o of this.owned) this.scene.remove(o);
    this.owned.clear();
    for (const [, m] of this.shieldMeshes) { this.scene.remove(m); m.material.dispose(); }
    this.shieldMeshes.clear();
    this.cheers.length = 0;
    this._glow = [];
  }

  // ---------------------------------------------------------------------------------------------- lifecycle
  start(a, id) {
    const def = SPECIALS[id];
    // `kind` picks the behaviour (the Bomb Barrage variants all share 'barrage')
    const s = { id, kind: def.kind || id, def, t: 0, dur: def.duration || 0 };
    a.specialActive = s;
    rec(a, [0, SPECIAL_ORDER.indexOf(id)]);
    const impl = IMPL[s.kind];
    impl?.start?.call(this, a, s);
    emit('special:start', { actor: a, id });
  }

  // ---------------------------------------------------------------------------------------------- online
  // a remote player's special, from its owner's records (see the note at the top)
  netGhost(a, d) {
    if (!Array.isArray(d)) return;
    switch (d[0]) {
      case 0: { const id = SPECIAL_ORDER[d[1]]; if (id && SPECIALS[id]) this._startGhost(a, id); break; }
      case 1: if (a.specialActive?.ghost) this.end(a, d[1] || 'net'); break;
      case 2: this._ghostObj(a, d); break;
      case 3: { const w = this.world.find((x) => x.ghost && x.gid === d[1] && !x.dead); if (w) w.netEvent?.(d); break; }
      case 4: { const s = a.specialActive; if (s?.ghost) GHOST[s.kind]?.event?.call(this, a, s, d); break; }
    }
  }
  _startGhost(a, id) {
    if (a.specialActive?.ghost) this.end(a, 'net');   // (one that never heard its end)
    const def = SPECIALS[id];
    const s = { id, kind: def.kind || id, def, t: 0, dur: def.duration || 0, ghost: true };
    a.specialActive = s;
    const g = GHOST[s.kind], f = g && 'start' in g ? g.start : IMPL[s.kind]?.start;
    try { f?.call(this, a, s); } catch (e) { console.warn('[specials] ghost start', id, e); }
    emit('special:start', { actor: a, id });
  }
  // per frame: remote players' specials (visuals only; their owners move them)
  _ghostTick(dt) {
    for (const a of G.actors) {
      const s = a.specialActive;
      if (!a.remote || !s || !s.ghost) continue;
      if (!a.alive) { this.end(a, 'splat'); continue; }
      s.t += dt;
      s.firing = Math.max(0, (s.firing || 0) - dt);
      this._endCue(a, s);
      const f = GHOST[s.kind]?.tick;
      if (f) ghostMute(s, () => f.call(this, a, s, dt));
    }
  }
  // the owner's world object: in the world, with an id, recorded for everyone else
  _spawn(a, w, kind, data) {
    this.world.push(w);
    w.gid = netId(a);
    if (w.gid) rec(a, [2, kind, w.gid, ...data]);
    return w;
  }
  _ghostObj(a, d) {
    const [, kind, gid] = d;
    if (this.world.some((x) => x.gid === gid)) return;
    let w = null;
    switch (kind) {
      case 'mi': w = new Missile(this, a, V(d, 3)); break;
      case 'tw': w = new Twister(this, a, V(d, 3), V(d, 6)); break;
      case 'sk': w = new Speaker(this, a, V(d, 3), V(d, 6)); break;
      case 'bu': w = new Bubble(this, a); w.pos.copy(V(d, 3)); w.r = d[6]; w.release(V(d, 7)); break;
      case 'ts': w = new ThrownStamp(this, a, V(d, 3), V(d, 6)); break;
      case 'sh': w = new Shell(this, a, V(d, 3), V(d, 6)); break;
      case 'or': w = new Orb(this, a, V(d, 3), V(d, 6)); break;
    }
    if (!w) return;
    w.ghost = true; w.gid = gid;
    this.world.push(w);
  }
  // a hit on one of our world objects made on another screen (bubbles: dmg < 0 = its own team's ink)
  netHurtObj(gid, dmg) {
    const w = this.world.find((x) => !x.ghost && x.gid === gid && !x.dead);
    if (w && w.kind === 'bubble') this._bubbleHit(w, dmg < 0 ? w.team : 1 - w.team, Math.abs(dmg), null);
  }
  // transformation specials: a "wearing off" jingle ~2 s before the time runs out (loud for you, positional for others)
  _endCue(a, s) {
    if (s.endCued || !s.dur || !TRANSFORMS.has(s.kind) || s.dur - s.t > ENDING_CUE) return;
    s.endCued = true;
    if (a.isLocal) play('special_ending', { volume: 0.75 });
    else if (hearable(a)) play('special_ending', { pos: a.pos, volume: 0.4 });
  }
  // per-frame for non-body specials (after the actor's own movement + weapon)
  tick(a, s, dt) {
    s.t += dt;
    s.firing = Math.max(0, (s.firing || 0) - dt);
    this._endCue(a, s);
    IMPL[s.kind]?.tick?.call(this, a, s, dt);
    if (a.specialActive === s && s.dur && s.t >= s.dur) this.end(a, 'time');
  }
  // body-owning specials (strike aiming, wail placement, sonar cast, jetpack, zipline zips)
  body(a, s, dt) {
    s.t += dt;
    s.firing = Math.max(0, (s.firing || 0) - dt);
    this._endCue(a, s);
    IMPL[s.kind]?.body?.call(this, a, s, dt);
    if (a.specialActive === s && s.dur && s.t >= s.dur) this.end(a, 'time');
    // the sea still wins
    if (a.alive && a.pos.y < PLAYER.fallDeathY && G.level.groundHeight(a.pos.x, a.pos.z, a.pos.y + 0.6) === -Infinity) {
      if (a.specialActive) this.end(a, 'splat');
      a.splat(a.lastDamage < 4 ? a.lastAttacker : null, 'water');
    }
  }
  // before the actor moves: a special may steer / shape the movement input (Mega Stamp)
  move(a, s, dt) { IMPL[s.kind]?.move?.call(this, a, s, dt); }
  // main-weapon replacement; returns true when the special consumed the trigger (the weapon runner is skipped)
  weapon(a, s, dt, inp) {
    const f = IMPL[s.kind]?.weapon;
    return f ? !!f.call(this, a, s, dt, inp) : false;
  }
  end(a, reason = 'time') {
    const s = a.specialActive;
    if (!s || s.ended || s.id === 'slam' || s.id === 'storm') return;
    s.ended = true;
    if (!s.ghost) rec(a, [1, reason]);
    IMPL[s.kind]?.end?.call(this, a, s, reason);
    if (a.specialActive === s) a.specialActive = null;
    emit('special:end', { actor: a, id: s.id, reason });
    if (reason === 'time' && hearable(a)) play('special_end', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 0.7 : 0.45 });
    // jetpack / zipline: super jump back to where the special started (a ghost's owner jumps; its marker greys out)
    if (s.ghost) { if (s.jumpBack && reason === 'time' && a.alive) s.marker?.returning(); else s.marker?.finish(); }
    else if (s.jumpBack && reason !== 'splat' && a.alive && s.origin && a.pos.distanceTo(s.origin) > 2.5 && a.superJump(s.origin.clone(), { instant: true, home: true })) s.marker?.returning();
    else s.marker?.finish();
  }
  onSplat(a) {
    if (a.specialActive && a.specialActive.id !== 'slam' && a.specialActive.id !== 'storm') this.end(a, 'splat');
    if (a.status.shield > 0) this._dropShield(a, false);
  }
  // remaining fraction of a running special (HUD gauge drains)
  remaining(a) {
    const s = a.specialActive;
    if (!s) return 0;
    if (s.id === 'booyah') return s.thrown ? 0 : 1;   // held: stays full until thrown
    if (s.id === 'blower') return Math.max(0, 1 - (s.count || 0) / s.def.max) * (s.dur ? Math.max(0, 1 - s.t / s.dur) : 1);
    if (s.id === 'crab') return Math.min(Math.max(0, 1 - s.t / s.dur), Math.max(0, s.hp / s.def.hp));
    if (s.dur) return Math.max(0, 1 - s.t / s.dur);
    return 1;
  }
  // HUD hint for the local player while a special runs
  prompt(a) {
    const s = a.specialActive;
    if (!s) return null;
    switch (s.kind) {
      case 'barrage': return `${s.def.name}! Throw ${s.bomb.name}s with RMB / E — no ink needed`;
      case 'strike': return s.aiming ? 'Move the mouse to pick a spot · click to launch' : null;
      case 'zooka': return 'Fire twisters with LMB';
      case 'wail': return 'Aim the speaker · click to set it down and blast';
      case 'kraken': return 'Kraken! LMB to jump-attack';
      case 'blower': return `Hold LMB to blow a bubble (${s.def.max - (s.count || 0)} left) · shoot bubbles to blast them`;
      case 'jetpack': return 'Ink Jet! Fire with LMB';
      case 'stamp': return 'LMB to stamp · jump + LMB to slam · RMB to throw';
      case 'booyah': return s.charge >= 1 ? 'Charged! LMB to throw' : 'Charging… teammates press C to cheer!';
      case 'zipcaster': return s.hang > 0 ? 'Clinging — SPACE to jump off' : 'RMB / E to zip to a wall';
      case 'crab': return s.roll ? 'Rolling (release SHIFT to stop)' : 'LMB gatling · RMB cannon · hold SHIFT to roll';
    }
    return null;
  }

  // ---------------------------------------------------------------------------------------------- damage + hits
  filterDamage(v, amount, attacker, source) {
    const s = v.specialActive;
    // riding Tower Command's tower: a Kraken can be shot off it (4× the shove), Bubble Guard's shove is doubled
    const onTower = !!(G.match?.tower && G.match.tower.riderList.includes(v));
    if (s && s.id === 'kraken') { this._knock(v, attacker, onTower ? Math.min(10, amount * s.def.knockPerDamage * 4) : Math.min(4, amount * s.def.knockPerDamage)); this._hitFlash(v); return 0; }
    if (s && s.id === 'crab') return IMPL.crab.hurt.call(this, v, s, amount, attacker);
    // Mega Stamp mid-swing: anything coming from the front is deflected (sides + back stay open)
    if (s && s.id === 'stamp' && s.guard > 0 && attacker && attacker !== v && stampFront(v, s, attacker.pos, s.def.deflectArc)) {
      if (near(v.pos, 40)) { play('shield_hit', { pos: v.isLocal ? undefined : v.pos, volume: 0.6, pitch: 1.3 }); G.fx?.burst(_v.copy(v.pos).setY(v.pos.y + 1.1).addScaledVector(stampFwd(s), 0.9), UP, v.color, { count: 6, speed: 4, size: 0.07 }); }
      return 0;
    }
    if (v.status.shield > 0) {
      const d = SPECIALS.bubbler;
      const k2 = onTower ? 2 : 1;
      this._knock(v, attacker, Math.min(d.knockMax * k2, amount * d.knockPerDamage * k2));
      const m = this.shieldMeshes.get(v); if (m) m.material.uniforms.uHit.value = 0.6;
      if (G.time - (v._shieldSnd || 0) > 0.12 && near(v.pos)) { v._shieldSnd = G.time; play('shield_hit', { pos: v.isLocal ? undefined : v.pos, volume: 0.45 }); }
      return 0;
    }
    return amount;
  }
  _knock(v, attacker, k) {
    if (!(k > 0)) return;
    let dx = 0, dz = 0;
    if (attacker && attacker !== v) { dx = v.pos.x - attacker.pos.x; dz = v.pos.z - attacker.pos.z; }
    const l = Math.hypot(dx, dz);
    if (l < 1e-3) { dx = -Math.sin(v.yaw); dz = -Math.cos(v.yaw); } else { dx /= l; dz /= l; }
    v.vel.x += dx * k; v.vel.z += dz * k;
    if (v.grounded) { v.vel.y = Math.max(v.vel.y, 1.4 + k * 0.18); v.grounded = false; }
  }
  _hitFlash(v) { v.hurtFlash = Math.min(1, v.hurtFlash + 0.25); }

  // projectile segment against special objects (bubbles: any team). true = absorbed
  shotHit(prev, pos, team, dmg, owner) {
    for (const w of this.world) {
      if (w.kind !== 'bubble' || w.dead) continue;
      Physics.segmentCapsuleDist(prev, pos, _v.copy(w.pos).setY(w.pos.y - w.r * 0.5), w.r * 0.5, w.r, _res);
      if (_res.dist < w.r * 0.95) { this._bubbleHit(w, team, dmg, owner); return true; }
    }
    return false;
  }
  rayHit(from, dir, len, team, dmg, owner) {
    let best = len, hitB = null;
    for (const w of this.world) {
      if (w.kind !== 'bubble' || w.dead) continue;
      _v.copy(w.pos).sub(from);
      const t = _v.dot(dir);
      if (t <= 0 || t > best) continue;
      const d2 = _v.lengthSq() - t * t;
      if (d2 > w.r * w.r) continue;
      const tt = t - Math.sqrt(w.r * w.r - d2);
      if (tt < best) { best = Math.max(0.1, tt); hitB = w; }
    }
    if (hitB) this._bubbleHit(hitB, team, dmg, owner);
    return best;
  }
  areaHit(c, radius, dmg, team, owner) {
    for (const w of this.world) {
      if (w.kind !== 'bubble' || w.dead) continue;
      if (w.pos.distanceTo(c) < radius + w.r * 0.8) this._bubbleHit(w, team, dmg * 1.5, owner || null);
    }
  }

  // a bubble hit: your team's ink charges it until it blows; enemy ink is soaked up (and shrinks it a little)
  _bubbleHit(w, team, dmg, owner) {
    if (w.dead || netMuted()) return;   // (a ghost's shot: its owner's copy decides)
    w.mesh.material.uniforms.uHit.value = 0.5;
    if (w.ghost) { if (!(team === w.team && w.held)) netHurt(w.owner, 'sp', w.gid, team === w.team ? -dmg : dmg); return; }
    const d = SPECIALS.blower;
    if (team === w.team) {
      if (w.held) return;
      w.charge += dmg;
      if (w.charge >= d.popDamage) w.explode(owner);
    } else w.r = Math.max(d.rMin * 0.75, w.r - dmg * 0.004);
  }

  // ---------------------------------------------------------------------------------------------- shields
  giveShield(a, time, owner) {
    a.status.shield = Math.max(a.status.shield, time);
    a._shieldOwner = !!owner;
    if (!this.shieldMeshes.has(a)) {
      const m = new THREE.Mesh(this.sphereGeo, bubbleMat(G.teamColors[a.team]));
      m.renderOrder = 4;
      m.scale.setScalar(0.2);
      this.scene.add(m);
      this.shieldMeshes.set(a, m);
    }
    if (hearable(a)) play('shield_up', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 0.8 : 0.5 });
    emit('special:shield', { actor: a, time });
  }
  _dropShield(a, pop) {
    a.status.shield = 0;
    const m = this.shieldMeshes.get(a);
    if (m) { this.scene.remove(m); m.material.dispose(); this.shieldMeshes.delete(a); }
    if (pop && near(a.pos)) {
      play('shield_pop', { pos: a.isLocal ? undefined : a.pos, volume: 0.6 });
      G.fx?.burst(_v.copy(a.pos).setY(a.pos.y + 0.9), UP, a.color, { count: 12, speed: 3, size: 0.07 });
    }
  }

  // ---------------------------------------------------------------------------------------------- "Yeah!" cheers
  cheer(a) {
    if (!a.alive || G.time - (a._cheerT || -9) < 0.4) return;
    a._cheerT = G.time;
    if (hearable(a)) play('booyah_cheer', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 0.7 : 0.5, pitch: 0.95 + Math.random() * 0.15 });
    this.cheers.push({ a, t: 0 });
    const d = SPECIALS.booyah;
    let helped = false;
    for (const o of G.actors) {
      const s = o.specialActive;
      if (o.team !== a.team || !o.alive || !s || s.id !== 'booyah' || s.thrown) continue;
      s.charge = Math.min(1, (s.charge || 0) + d.cheer);
      s.cheered = 0.35;
      helped = true;
    }
    // cheering on a teammate's orb tops up your own special a little
    if (helped && !a.specialActive) {
      const was = a.specialReady();
      a.special = Math.min(a.specialCost(), a.special + d.cheerSpecial);
      if (!was && a.specialReady()) emit('special:ready', { actor: a });
    }
    emit('actor:cheer', { actor: a, helped });
  }
  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    // cheer input (controllers set intent.cheer for one frame)
    for (const a of G.actors) if (a.intent.cheer) { a.intent.cheer = false; this.cheer(a); }
    for (let i = this.cheers.length - 1; i >= 0; i--) {
      const c = this.cheers[i];
      c.t += dt;
      if (c.t >= 1.1 || !c.a.alive) this.cheers.splice(i, 1);
    }
    // force fields: timers, follow, sharing on contact
    for (const a of G.actors) {
      if (!(a.status.shield > 0)) { if (this.shieldMeshes.has(a)) this._dropShield(a, false); continue; }
      if (!a.alive) { this._dropShield(a, false); continue; }
      a.status.shield -= dt;
      const m = this.shieldMeshes.get(a);
      if (m) {
        const R = SPECIALS.bubbler.radius;
        const grow = Math.min(1, (m.scale.x / R) + dt * 6);
        m.scale.setScalar(R * grow * (1 + Math.sin(G.time * 5 + a.slot) * 0.02));
        m.position.set(a.pos.x, a.pos.y + (a.smoothY || 0) + (a.form === 'squid' ? 0.45 : 0.85), a.pos.z);
        m.material.uniforms.uTime.value = G.time;
        m.material.uniforms.uHit.value = Math.max(0, m.material.uniforms.uHit.value - dt * 3);
        m.material.uniforms.uAlpha.value = a.status.shield < 1 ? 0.5 + 0.5 * Math.abs(Math.sin(G.time * 14)) : 1;
      }
      if (a._shieldOwner && a.specialActive && a.specialActive.id === 'bubbler') {
        for (const o of G.actors) {
          if (o === a || o.team !== a.team || !o.alive || o.status.shield > 0) continue;
          if (o.pos.distanceTo(a.pos) < SPECIALS.bubbler.shareRange) this.giveShield(o, a.status.shield, false);
        }
      }
      if (a.status.shield <= 0) this._dropShield(a, true);
    }
    this._ghostTick(dt);
    // world objects (a ghost's: paint muted, hits dropped)
    for (let i = this.world.length - 1; i >= 0; i--) {
      const w = this.world[i];
      if (!ghostMute(w, () => w.update(dt)) || w.dead) { w.dispose?.(); this.world.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------------------------------------- minimap
  drawMap(c, mm, tc, s, hex, t) {
    const me = mm.viewerTeam ?? 0;
    for (const w of this.world) {
      const col = hex[w.team] || '#fff';
      if (w.kind === 'missile') {
        mm.toCanvas(w.to.x, w.to.z, tc);
        const r = SPECIALS.strike.radius * s, pulse = 0.6 + 0.4 * Math.sin(t * 12);
        c.globalAlpha = 0.25 * pulse; c.fillStyle = col; c.beginPath(); c.arc(tc.x, tc.y, r, 0, TAU); c.fill(); c.globalAlpha = 1;
        c.setLineDash([5, 4]); c.lineDashOffset = -t * 20; c.lineWidth = 2.5; c.strokeStyle = col; c.stroke(); c.setLineDash([]);
        c.lineWidth = 2; c.strokeStyle = '#ffffff'; mm._cross(c, tc.x, tc.y, s * 0.9);
      } else if (w.kind === 'tornado') {
        mm.toCanvas(w.pos.x, w.pos.z, tc);
        const r = w.radius * s;
        c.globalAlpha = 0.35; c.fillStyle = col; c.beginPath(); c.arc(tc.x, tc.y, r, 0, TAU); c.fill(); c.globalAlpha = 1;
        c.lineWidth = 2.5; c.strokeStyle = '#ffffff';
        for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(tc.x, tc.y, r * (0.35 + k * 0.28), t * 6 + k * 2, t * 6 + k * 2 + 3.6); c.stroke(); }
      } else if (w.kind === 'speaker') {
        mm.toCanvas(w.pos.x, w.pos.z, tc);
        const x0 = tc.x, y0 = tc.y;
        mm.toCanvas(w.pos.x + w.dir.x * w.range, w.pos.z + w.dir.z * w.range, tc);
        c.lineCap = 'round';
        if (w.phase === 'blast') { c.globalAlpha = 0.6; c.lineWidth = w.radius * 2 * s; c.strokeStyle = col; c.beginPath(); c.moveTo(x0, y0); c.lineTo(tc.x, tc.y); c.stroke(); c.globalAlpha = 1; }
        else { c.setLineDash([6, 6]); c.lineDashOffset = -t * 30; c.lineWidth = 2; c.strokeStyle = col; c.beginPath(); c.moveTo(x0, y0); c.lineTo(tc.x, tc.y); c.stroke(); c.setLineDash([]); }
        c.fillStyle = '#15121c'; c.fillRect(x0 - s * 0.8, y0 - s * 0.8, s * 1.6, s * 1.6); c.fillStyle = col; c.fillRect(x0 - s * 0.6, y0 - s * 0.6, s * 1.2, s * 1.2);
      } else if (w.kind === 'bubble') {
        mm.toCanvas(w.pos.x, w.pos.z, tc);
        c.globalAlpha = 0.3; c.fillStyle = col; c.beginPath(); c.arc(tc.x, tc.y, w.r * s, 0, TAU); c.fill(); c.globalAlpha = 1;
        c.lineWidth = 2; c.strokeStyle = '#ffffff'; c.stroke();
      } else if (w.kind === 'return') {
        mm.toCanvas(w.pos.x, w.pos.z, tc);
        const pulse = 0.5 + 0.5 * Math.sin(t * (w.back ? 12 : 4)), r = s * (1.2 + 0.3 * pulse);
        c.globalAlpha = w.fade;
        c.lineWidth = 4; c.strokeStyle = '#15121c'; c.beginPath(); c.arc(tc.x, tc.y, r + 1, 0, TAU); c.stroke();
        c.lineWidth = 2.5; c.strokeStyle = w.back && w.wipeK > 0.99 ? '#9aa0a6' : col; c.beginPath(); c.arc(tc.x, tc.y, r, 0, TAU); c.stroke();
        const ic = w.mapCanvas, is = s * 2.1;
        if (ic) c.drawImage(ic, tc.x - is / 2, tc.y - is / 2, is, is);
        c.globalAlpha = 1;
      } else if (w.kind === 'orb') {
        mm.toCanvas(w.pos.x, w.pos.z, tc);
        const r = (w.phase === 'fuse' ? SPECIALS.booyah.radius * clamp(w.t / SPECIALS.booyah.fuse, 0.2, 1) : 1) * s;
        c.globalAlpha = 0.35; c.fillStyle = col; c.beginPath(); c.arc(tc.x, tc.y, r, 0, TAU); c.fill(); c.globalAlpha = 1;
        c.lineWidth = 2; c.strokeStyle = '#ffffff'; c.stroke();
      }
    }
    // the local player's strike cursor
    const a = G.local;
    const sp = a && a.specialActive;
    if (sp && sp.id === 'strike' && sp.aiming && a.team === me) {
      mm.toCanvas(sp.target.x, sp.target.z, tc);
      const r = SPECIALS.strike.radius * s, col = hex[a.team] || '#fff';
      c.globalAlpha = 0.28; c.fillStyle = col; c.beginPath(); c.arc(tc.x, tc.y, r, 0, TAU); c.fill(); c.globalAlpha = 1;
      c.lineWidth = 4; c.strokeStyle = '#15121c'; c.stroke();
      c.lineWidth = 2.5; c.strokeStyle = '#ffffff'; c.stroke();
      c.lineWidth = 3; c.strokeStyle = '#ffffff';
      c.beginPath(); c.moveTo(tc.x - r * 1.35, tc.y); c.lineTo(tc.x - r * 0.45, tc.y); c.moveTo(tc.x + r * 0.45, tc.y); c.lineTo(tc.x + r * 1.35, tc.y);
      c.moveTo(tc.x, tc.y - r * 1.35); c.lineTo(tc.x, tc.y - r * 0.45); c.moveTo(tc.x, tc.y + r * 0.45); c.lineTo(tc.x, tc.y + r * 1.35); c.stroke();
    }
  }

  // strike targeting input from the player controller: cursor moves in minimap canvas pixels
  aimMove(a, dxPx, dyPx, mm) {
    const s = a.specialActive;
    if (!s || s.id !== 'strike' || !s.aiming || !mm) return;
    const tc = mm.toCanvas(s.target.x, s.target.z, { x: 0, y: 0 });
    tc.x = clamp(tc.x + dxPx, 0, mm.w); tc.y = clamp(tc.y + dyPx, 0, mm.h);
    s.target.x = mm._worldX(tc.x); s.target.z = mm._worldZ(tc.y);
  }
  aimConfirm(a) { const s = a.specialActive; if (s && s.id === 'strike' && s.aiming && s.t > 0.25) s.confirm = true; }

  // ---------------------------------------------------------------------------------------------- shared helpers
  _stand(a, dt, damp = 8) {
    a.vel.x *= Math.exp(-damp * dt); a.vel.z *= Math.exp(-damp * dt);
    if (!a.grounded) a.vel.y = Math.max(-PLAYER.maxFall, a.vel.y - PLAYER.gravity * dt); else a.vel.y = 0;
    const py = a.pos.y;
    a.pos.addScaledVector(a.vel, dt);
    a._resolve(false, py, a.grounded);
  }
  _swapWeapon(a, kind) { a.character.setWeapon(kind); a.weaponRunner.reset(); }
  _restoreWeapon(a) { a.character.setWeapon(a.weaponId); }
  _fwd(a, out = _v3) { return out.set(Math.sin(a.aimYaw), 0, Math.cos(a.aimYaw)); }
}

// ================================================================================================ world objects
// Where an Ink Jet / Zipline user took off: they super jump back here when the special ends, so it's marked for
// everyone (both teams — the other side can camp it) until they land or are splatted. The beacon carries the special's
// icon in the owner's colour; once they take off for home it wipes round to grey like a clock, reaching full grey the
// instant they land — a countdown to time your attack by.
const RETURN_GREY = new THREE.Color('#9aa0a6');
const _badges = new Map();
// icon badge (canvas + texture, shared): cream disc, colour rim, the special's icon with its accents in `color`
function iconBadge(id, color) {
  const hex = '#' + color.getHexString(), key = id + hex;
  let e = _badges.get(key);
  if (e) return e;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  e = { canvas: c, texture: tex };
  _badges.set(key, e);
  const disc = () => {
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#15121c'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
    g.fillStyle = hex; g.beginPath(); g.arc(128, 128, 115, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#15121c'; g.beginPath(); g.arc(128, 128, 93, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f6f1e7'; g.beginPath(); g.arc(128, 128, 89, 0, Math.PI * 2); g.fill();
  };
  disc(); tex.needsUpdate = true;
  const svg = (SPECIAL_ICONS[id] || '').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" ').replace(/currentColor/g, hex);
  if (svg) {
    const img = new Image();
    img.onload = () => { disc(); g.drawImage(img, 56, 56, 144, 144); tex.needsUpdate = true; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  return e;
}
class ReturnMarker {
  constructor(sys, a, pos, icon) {
    this.sys = sys; this.kind = 'return'; this.owner = a; this.team = a.team; this.icon = icon;
    this.pos = pos.clone(); this.t = 0; this.done = false; this.back = false; this.fade = 1;
    const col = a.color;
    this.col = col.clone();
    this.group = new THREE.Group(); this.group.position.copy(this.pos);
    this.ring = new THREE.Mesh(sys.ringGeo, new THREE.MeshBasicMaterial({ color: col.clone(), transparent: true, opacity: 0.8, depthWrite: false }));
    this.ring.position.y = 0.05; this.ring.scale.setScalar(1.3);
    this.ring2 = new THREE.Mesh(sys.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
    this.ring2.position.y = 0.06;
    this.pillar = new THREE.Mesh(sys.funnelGeo, swirlMat(col, { bottom: 1, top: 0.55, wobble: 0.04, speed: 0.8 }));
    this.pillar.scale.set(0.45, 5.5, 0.45);
    // the special's icon, facing the camera (colour badge; the grey one once the owner is on the way back)
    this.badgeCol = iconBadge(icon, col); this.badgeGrey = iconBadge(icon, RETURN_GREY);
    this.badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.badgeCol.texture, transparent: true, depthWrite: false }));
    this.wipeK = 0; this.wipe = null;          // wipe progress 0 (colour) … 1 (grey), per-marker canvas while it runs
    this.badge.position.y = 2.7; this.badge.scale.setScalar(1.15);
    this.group.add(this.ring, this.ring2, this.pillar, this.badge);
    sys.scene.add(this.group);
    this.unsub = [
      on('superjump:land', ({ actor }) => { if (actor === this.owner && this.back) { this._drawWipe(1); this.finish(true); } }),   // grey for the landing frame, then gone
      on('splatted', ({ victim }) => { if (victim === this.owner) this.finish(); }),
    ];
  }
  // the owner has taken off for home: the colour → grey wipe runs with their flight (see update)
  returning() {
    this.back = true; this.t = Math.min(this.t, 1);
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.wipe = { canvas: c, g: c.getContext('2d'), texture: tex, drawn: -1 };
    this.badge.material.map = tex; this.badge.material.needsUpdate = true;
    this._drawWipe(0);
  }
  // how far through the jump home the owner is: 0 at take-off … 1 on touch-down
  _homeK() {
    const sj = this.owner.superJumpState;
    if (!sj) return this.back ? 1 : 0;
    if (sj.phase !== 'flight') return 0;
    return Math.min(1, sj.t / Math.max(0.01, sj.dur || 1));
  }
  // grey badge underneath, the colour badge on top clipped to the time still left (a clock sweep from 12 o'clock)
  _drawWipe(k) {
    const w = this.wipe; if (!w || Math.abs(k - w.drawn) < 0.004) return;
    w.drawn = k;
    const g = w.g;
    g.clearRect(0, 0, 256, 256);
    g.drawImage(this.badgeGrey.canvas, 0, 0);
    if (k < 1) {
      g.save(); g.beginPath(); g.moveTo(128, 128);
      g.arc(128, 128, 130, -Math.PI / 2 + k * Math.PI * 2, Math.PI * 1.5); g.closePath(); g.clip();
      g.drawImage(this.badgeCol.canvas, 0, 0); g.restore();
    }
    w.texture.needsUpdate = true;
  }
  get mapCanvas() { return this.wipe ? this.wipe.canvas : this.badgeCol.canvas; }
  finish(now = false) { this.done = true; if (now) this.fade = 0.001; }
  update(dt) {
    this.t += dt;
    if (this.done) { this.fade -= dt * 3; if (this.fade <= 0) return false; }
    if (this.t > 30) this.done = true;          // safety net
    const p = 0.5 + 0.5 * Math.sin(this.t * (this.back ? 12 : 4));
    this.ring.material.opacity = (0.45 + 0.4 * p) * this.fade;
    const k = (this.t * 0.8) % 1;
    this.ring2.scale.setScalar(0.4 + k * 1.4); this.ring2.material.opacity = (1 - k) * 0.7 * this.fade;
    this.pillar.material.uniforms.uTime.value = this.t;
    this.pillar.material.uniforms.uAlpha.value = (this.back ? 0.9 : 0.55) * this.fade;
    if (this.back) {
      const k = this._homeK();
      this.wipeK = k;
      this._drawWipe(k);
      this.ring.material.color.copy(this.col).lerp(RETURN_GREY, k);
      this.pillar.material.uniforms.uColor.value.copy(this.col).lerp(RETURN_GREY, k);
    }
    this.badge.position.y = 2.7 + Math.sin(this.t * 2) * 0.15;
    this.badge.scale.setScalar(1.15 * this.fade * (this.back ? 1 + 0.06 * p : 1));
    this.badge.material.opacity = this.fade;
    return true;
  }
  dispose() {
    this.unsub.forEach((u) => u());
    this.sys.scene.remove(this.group);
    this.ring.material.dispose(); this.ring2.material.dispose(); this.pillar.material.dispose(); this.badge.material.dispose();
    this.wipe?.texture.dispose();
  }
}

// Vortex Strike missile: up off the thrower's back, then down onto the target (warning ring on the ground)
class Missile {
  constructor(sys, a, to) {
    this.sys = sys; this.kind = 'missile'; this.team = a.team; this.owner = a; this.t = 0;
    this.from = a.pos.clone().setY(a.pos.y + 1.6); this.to = to.clone();
    this.flight = SPECIALS.strike.flight;
    const d = prop('missile');
    this.mesh = d ? propMesh(d, a.team, sys.glowMat(a.team)) : new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.9, 4, 10).rotateX(Math.PI / 2), getInkMaterial(a.color));
    sys.scene.add(this.mesh);
    this.mesh.position.copy(this.from);
    this.ring = new THREE.Mesh(sys.ringGeo, new THREE.MeshBasicMaterial({ color: a.color.clone(), transparent: true, opacity: 0.7, depthWrite: false }));
    this.ring.position.copy(this.to).setY(this.to.y + 0.06); this.ring.scale.setScalar(SPECIALS.strike.radius);
    sys.scene.add(this.ring);
    this.whistled = false;
    if (hearable(a)) play('strike_launch', { pos: a.isLocal ? undefined : a.pos, volume: 0.8 });
  }
  update(dt) {
    this.t += dt;
    const k = this.t / this.flight;
    const p = this.mesh.position;
    if (k < 0.35) {
      // climb straight up and out of view
      const u = k / 0.35;
      p.set(this.from.x, this.from.y + u * u * 30, this.from.z);
      this.mesh.lookAt(p.x, p.y + 1, p.z);
    } else {
      const u = (k - 0.35) / 0.65;
      p.set(this.to.x, this.to.y + 34 * (1 - u) * (1 - u) + 0.3, this.to.z);
      this.mesh.lookAt(p.x, p.y - 1, p.z);
      // sfx-loud: the whistle down onto the ring through the cue mix (the enemy's louder, boosted when you're in it)
      if (!this.whistled && near(this.to, 40)) { this.whistled = true; if (G.cues) G.cues.one('strike_whistle', { at: this.to, owner: this.owner, kind: 'warn', radius: SPECIALS.strike.radius, range: 40 }); else play('strike_whistle', { pos: this.to, volume: 0.9 }); }
    }
    if (this.t % 0.05 < dt && near(p, 45)) G.fx?.burst(p, UP, this.owner.color, { count: 2, speed: 1.5, size: 0.08, ring: false, mist: false });
    this.ring.material.opacity = 0.35 + 0.35 * Math.abs(Math.sin(this.t * 9));
    this.ring.rotation.y += dt * 2;
    if (k >= 1) {
      const tn = new Tornado(this.sys, this.owner, this.team, this.to);
      tn.ghost = !!this.ghost;
      this.sys.world.push(tn);
      play('strike_impact', { pos: this.to, volume: 1 });
      emit('shake', { pos: this.to.clone(), amount: 0.8 });
      return false;
    }
    return true;
  }
  dispose() { this.sys.scene.remove(this.mesh, this.ring); this.ring.material.dispose(); }
}

class Tornado {
  constructor(sys, owner, team, pos) {
    const d = SPECIALS.strike;
    this.sys = sys; this.kind = 'tornado'; this.owner = owner; this.team = team; this.pos = pos.clone();
    this.t = 0; this.dur = d.duration; this.radius = d.radius; this.paintT = 0;
    const col = G.teamColors[team];
    this.group = new THREE.Group(); this.group.position.copy(this.pos);
    this.inner = new THREE.Mesh(sys.funnelGeo, swirlMat(col, { bottom: 0.25, top: 1, wobble: 0.35, speed: 1.9 }));
    this.outer = new THREE.Mesh(sys.funnelGeo, swirlMat(col.clone().lerp(new THREE.Color(1, 1, 1), 0.25), { bottom: 0.4, top: 1.15, wobble: 0.5, speed: 1.2 }));
    this.inner.scale.set(this.radius * 0.8, 8, this.radius * 0.8);
    this.outer.scale.set(this.radius, 9, this.radius);
    this.group.add(this.inner, this.outer);
    sys.scene.add(this.group);
    this.loop = null;   // sfx-cues: the vortex's loop (and its spin-down) come from src/audio/cues.js
    paint(owner, _v.copy(this.pos).setY(this.pos.y + 0.4), this.radius * 0.7, team);
    G.fx?.explosion(_v.copy(this.pos).setY(this.pos.y + 0.6), col, this.radius * 0.8);
    emit('special:strike', { actor: owner, pos: this.pos.clone(), radius: this.radius });
  }
  update(dt) {
    const d = SPECIALS.strike;
    this.t += dt;
    const grow = Math.min(1, this.t / 0.4), fade = Math.max(0, Math.min(1, (this.dur - this.t) / 0.6));
    for (const m of [this.inner, this.outer]) { m.material.uniforms.uTime.value = this.t; m.material.uniforms.uAlpha.value = grow * fade; }
    this.group.rotation.y += dt * 4;
    this.group.scale.set(1, 0.3 + 0.7 * grow, 1);
    // churn ink all over the footprint
    this.paintT -= dt;
    if (this.paintT <= 0) {
      this.paintT = 0.1;
      for (let k = 0; k < 2; k++) {
        const ang = Math.random() * TAU, r = Math.sqrt(Math.random()) * this.radius;
        const g = groundBelow(_v.set(this.pos.x + Math.cos(ang) * r, this.pos.y + 3, this.pos.z + Math.sin(ang) * r), 8);
        if (g) paint(this.owner, g.setY(g.y + 0.2), 0.9 + Math.random() * 0.8, this.team);
      }
      if (near(this.pos, 38)) G.fx?.burst(_v.set(this.pos.x + (Math.random() - 0.5) * this.radius, this.pos.y + 0.4 + Math.random() * 3, this.pos.z + (Math.random() - 0.5) * this.radius), UP, G.teamColors[this.team], { count: 3, speed: 5, size: 0.1, ring: false, mist: false });
    }
    // hurt (and gently drag) enemies inside
    for (const e of G.actors) {
      if (e.team === this.team || !e.alive) continue;
      const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z, dh = Math.hypot(dx, dz);
      if (dh > this.radius || e.pos.y < this.pos.y - 1.5 || e.pos.y > this.pos.y + 7) continue;
      tickDamage(this.owner, e, d.dps * dt * fade, 'strike');
      if (dh > 0.3) { e.vel.x += (dx / dh) * d.pull * dt; e.vel.z += (dz / dh) * d.pull * dt; }
    }
    this.loop?.set?.({ volume: 0.8 * fade, pitch: 1 + 0.2 * grow });
    return this.t < this.dur;
  }
  dispose() {
    this.sys.scene.remove(this.group);
    this.inner.material.dispose(); this.outer.material.dispose();
    this.loop?.stop?.(0.4);
  }
}

// Twister Zooka shot: a tall spinning twister flying straight; pierces players, stops at walls
class Twister {
  constructor(sys, a, from, dir) {
    const d = SPECIALS.zooka;
    this.sys = sys; this.kind = 'twister'; this.owner = a; this.team = a.team;
    this.pos = from.clone(); this.prev = from.clone(); this.vel = dir.clone().multiplyScalar(d.speed);
    this.t = 0; this.life = d.range / d.speed; this.hit = new Set(); this.paintAcc = 0; this.dead = false;
    this.mesh = new THREE.Mesh(sys.funnelGeo, swirlMat(a.color, { bottom: 0.3, top: 1, wobble: 0.12, speed: 3 }));
    this.mesh.scale.set(d.radius * 1.4, d.height, d.radius * 1.4);
    this.mesh.position.copy(this.pos).setY(this.pos.y - d.height * 0.45);
    sys.scene.add(this.mesh);
  }
  update(dt) {
    const d = SPECIALS.zooka;
    this.t += dt;
    this.prev.copy(this.pos);
    this.pos.addScaledVector(this.vel, dt);
    // walls end it
    const hit = G.physics.segment(this.prev, this.pos, _hit, true);
    if (hit.hit) { this._burst(hit.point, hit.normal); return false; }
    if (G.subs && G.subs.blockShot(this.prev, this.pos, this.team, 120)) { this._burst(this.pos, UP); return false; }
    if (this.sys.shotHit(this.prev, this.pos, this.team, 120, this.owner)) { this._burst(this.pos, UP); return false; }
    // players inside the column
    for (const e of G.actors) {
      if (e.team === this.team || !e.alive || this.hit.has(e)) continue;
      const top = e.pos.y + (e.form === 'squid' ? 0.6 : 1.6);
      if (top < this.pos.y - d.height * 0.5 || e.pos.y > this.pos.y + d.height * 0.5) continue;
      // horizontal distance from the player axis to the segment
      _v.set(e.pos.x, this.prev.y, e.pos.z);
      Physics.segmentCapsuleDist(_v2.copy(this.prev), _v3.copy(this.pos).setY(this.prev.y), _v.setY(this.prev.y - 0.5), 0.01, 1, _res);
      if (_res.dist < d.radius + (e.hitR || PLAYER.radius)) {
        this.hit.add(e);
        G.projectiles.applyHit(this.owner, e, d.damage, 'zooka');
        G.fx?.burst(_v.copy(e.pos).setY(e.pos.y + 0.8), UP, this.owner.color, { count: 10, speed: 4, size: 0.09 });
      }
    }
    // a line of ink under the path
    this.paintAcc += this.vel.length() * dt;
    if (this.paintAcc > d.paintEvery) {
      this.paintAcc = 0;
      const g = groundBelow(this.pos, 3.5);
      if (g) paint(this.owner, g.setY(g.y + 0.15), d.paintRadius * (0.85 + Math.random() * 0.3), this.team);
    }
    this.mesh.position.copy(this.pos).setY(this.pos.y - d.height * 0.45);
    this.mesh.material.uniforms.uTime.value = this.t;
    this.mesh.material.uniforms.uAlpha.value = Math.min(1, (this.life - this.t) / 0.25);
    this.mesh.rotation.y += dt * 14;
    if (this.t > this.life) { this._burst(this.pos, UP, true); return false; }
    return true;
  }
  _burst(p, n, soft) {
    paint(this.owner, _v.copy(p).addScaledVector(n, 0.15), soft ? 1.1 : 1.6, this.team);
    if (near(p, 40)) { G.fx?.burst(p, n, this.owner.color, { count: 12, speed: 4, size: 0.09 }); G.cues?.one('twister_burst', { at: p, owner: this.owner, kind: 'boom', vol: 0.6 }); }   // sfx-cues
  }
  dispose() { this.sys.scene.remove(this.mesh); this.mesh.material.dispose(); }
}

// Howl Box: charges, then blasts a sound wave down its line through walls
class Speaker {
  constructor(sys, a, pos, dir) {
    const d = SPECIALS.wail;
    this.sys = sys; this.kind = 'speaker'; this.owner = a; this.team = a.team;
    this.pos = pos.clone(); this.dir = dir.clone().normalize(); this.range = d.range; this.radius = d.radius;
    this.t = 0; this.phase = 'charge';
    this.group = new THREE.Group(); this.group.position.copy(this.pos);
    this.group.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    const pd = prop('speaker');
    let mouthLocal;
    if (pd) {
      this.group.add(propMesh(pd, a.team, sys.glowMat(a.team)));
      if (pd.cone) {
        this.cone = new THREE.Group(); this.cone.position.copy(pd.coneAt);
        const cm = partMesh(pd.cone, pd.coneInk, a.team); cm.position.copy(pd.coneAt).negate();
        this.cone.add(cm); this.group.add(this.cone);
      }
      mouthLocal = (pd.mouth || new THREE.Vector3(0, 0.8, 0.45)).clone();
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.8).translate(0, 0.7, 0), getPlasticMaterial());
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 0.2, 24).rotateX(Math.PI / 2).translate(0, 0.8, 0.45), getInkMaterial(a.color));
      this.group.add(box, cone);
      mouthLocal = new THREE.Vector3(0, 0.8, 0.5);
    }
    sys.scene.add(this.group);
    this.group.updateMatrixWorld(true);
    this.mouth = mouthLocal.applyMatrix4(this.group.matrixWorld);
    // aim pitch: keep the beam a little tilted at most
    const pitch = Math.asin(clamp(this.dir.y, -0.3, 0.3));
    this.dir.set(Math.sin(this.group.rotation.y) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.group.rotation.y) * Math.cos(pitch));
    this.beam = new THREE.Mesh(sys.beamGeo, beamMat(a.color));
    this.beam.position.copy(this.mouth);
    this.beam.lookAt(_v.copy(this.mouth).add(this.dir));
    this.beam.scale.set(0.12, 0.12, this.range);
    sys.scene.add(this.beam);
    this.group.scale.setScalar(0.2);
    if (near(this.pos, 60)) play('wail_charge', { pos: this.pos, volume: 1 });
    emit('special:wail', { actor: a, pos: this.pos.clone(), dir: this.dir.clone() });
  }
  update(dt) {
    const d = SPECIALS.wail;
    this.t += dt;
    const u = this.beam.material.uniforms;
    u.uTime.value = this.t;
    const pop = Math.min(1, this.t / 0.25);
    this.group.scale.setScalar(0.2 + 0.8 * (1 - (1 - pop) ** 3));
    if (this.phase === 'charge') {
      const k = this.t / d.charge;
      this.beam.scale.set(0.08 + 0.1 * k, 0.08 + 0.1 * k, this.range);
      u.uCharge.value = 0; u.uAlpha.value = 0.35 + 0.35 * Math.abs(Math.sin(this.t * (8 + k * 20)));
      if (this.cone) this.cone.scale.z = 1 + Math.sin(this.t * 40) * 0.05 * k;
      if (this.t >= d.charge) {
        this.phase = 'blast'; this.t = 0;
        this.loop = null;   // sfx-cues: the blast's loop comes from src/audio/cues.js
        emit('shake', { pos: this.pos.clone(), amount: 0.5 });
      }
      return true;
    }
    if (this.phase === 'blast') {
      const out = Math.min(1, this.t / 0.18);
      this.beam.scale.set(this.radius * out, this.radius * out, this.range);
      u.uCharge.value = 1; u.uAlpha.value = 0.9;
      if (this.cone) this.cone.scale.z = 1 + Math.sin(this.t * 60) * 0.12;
      // everyone on the other side in the beam, walls or not
      for (const e of G.actors) {
        if (e.team === this.team || !e.alive) continue;
        _v.copy(e.pos); _v.y += 0.8;
        _v.sub(this.mouth);
        const along = _v.dot(this.dir);
        if (along < -0.5 || along > this.range) continue;
        const off = _v.addScaledVector(this.dir, -along).length();
        if (off < this.radius + 0.45) tickDamage(this.owner, e, d.dps * dt, 'wail');
      }
      if (near(this.mouth, 40) && Math.random() < dt * 30) G.fx?.ring(_v.copy(this.mouth).addScaledVector(this.dir, 1 + Math.random() * 6), this.dir, this.owner.color, { radius: this.radius * 1.3, life: 0.3, snap: false });
      if (this.t >= d.blast) { this.phase = 'fade'; this.t = 0; this.loop?.stop?.(0.3); this.loop = null; }
      return true;
    }
    // fade
    const k = this.t / 0.6;
    this.beam.scale.set(this.radius * (1 - k), this.radius * (1 - k), this.range);
    u.uAlpha.value = 0.9 * (1 - k);
    this.group.scale.setScalar(Math.max(0.01, 1 - k));
    return k < 1;
  }
  dispose() { this.sys.scene.remove(this.group, this.beam); this.beam.material.dispose(); this.loop?.stop?.(0.2); }
}

// Bubble Blower bubble: floats, walls off enemies, soaks up enemy fire; team fire sets it off
class Bubble {
  constructor(sys, a) {
    const d = SPECIALS.blower;
    this.sys = sys; this.kind = 'bubble'; this.owner = a; this.team = a.team;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.r = d.rMin; this.t = 0; this.life = d.life;
    this.charge = 0; this.held = true; this.dead = false; this.ph = Math.random() * 6;
    this.mesh = new THREE.Mesh(sys.sphereGeo, bubbleMat(a.color));
    this.mesh.renderOrder = 4;
    sys.scene.add(this.mesh);
  }
  release(dir) {
    this.held = false;
    this.vel.set(dir.x, 0, dir.z).normalize().multiplyScalar(SPECIALS.blower.drift);
    this.vel.y = 0.25;
    if (near(this.pos)) play('bubble_release', { pos: this.pos, volume: 0.7 });
  }
  update(dt) {
    this.t += dt;
    const u = this.mesh.material.uniforms;
    u.uTime.value = this.t; u.uHit.value = Math.max(0, u.uHit.value - dt * 3);
    if (!this.held) {
      this.life -= dt;
      this.vel.multiplyScalar(Math.exp(-0.45 * dt));
      this.vel.y += Math.sin(this.t * 1.7 + this.ph) * 0.15 * dt;
      _v.copy(this.pos);
      this.pos.addScaledVector(this.vel, dt);
      // don't sink into the deck; stop at walls
      const g = G.level.groundHeight(this.pos.x, this.pos.z, this.pos.y + 1);
      if (g > -Infinity && this.pos.y - this.r * 0.85 < g) { this.pos.y = g + this.r * 0.85; this.vel.y = Math.max(0, this.vel.y); }
      const w = G.physics.raycast(_v, _v2.copy(this.vel).normalize(), this.r * 0.8 + this.vel.length() * dt, _hit, true);
      if (w.hit && Math.abs(w.normal.y) < 0.6) { this.pos.copy(_v); this.vel.set(0, this.vel.y, 0); }
      // enemies can't pass through
      for (const e of G.actors) {
        if (e.team === this.team || !e.alive) continue;
        _v.set(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z);
        const dy = e.pos.y + 0.8 - this.pos.y;
        const R = Math.sqrt(Math.max(0, this.r * this.r - dy * dy)) + PLAYER.radius;
        const dh = _v.length();
        if (dh < R && dh > 1e-3) {
          e.pos.x = this.pos.x + (_v.x / dh) * R; e.pos.z = this.pos.z + (_v.z / dh) * R;
          const vn = (e.vel.x * _v.x + e.vel.z * _v.z) / dh;
          if (vn < 0) { e.vel.x -= (_v.x / dh) * vn; e.vel.z -= (_v.z / dh) * vn; }
        }
      }
      if (this.life <= 0) { this._pop(); return false; }
    }
    const wob = 1 + Math.sin(this.t * 6 + this.ph) * 0.025;
    this.mesh.scale.set(this.r * wob, this.r / wob, this.r * wob);
    this.mesh.position.copy(this.pos);
    u.uAlpha.value = this.life < 1 ? 0.4 + 0.6 * Math.abs(Math.sin(this.t * 16)) : 1;
    return !this.dead;
  }
  _pop() {
    this.dead = true;
    paint(this.owner, _v.copy(this.pos).setY(this.pos.y - this.r * 0.5), this.r * 0.6, this.team);
    if (near(this.pos)) { play('bubble_pop', { pos: this.pos, volume: 0.7 }); G.fx?.burst(this.pos, UP, this.owner.color, { count: 10, speed: 3, size: 0.08 }); }
  }
  // online: the owner's copy says when it blows
  netEvent(d) { if (d[2] === 'x') this.explode(null); }
  explode(by) {
    if (this.dead) return;
    this.dead = true;
    if (!this.ghost && this.gid) rec(this.owner, [3, this.gid, 'x']);
    const d = SPECIALS.blower, R = this.r * d.blastMul;
    const c = this.pos.clone();
    const owner = by && by.team === this.team ? by : this.owner;
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * TAU + Math.random() * 0.4, rr = R * (0.35 + Math.random() * 0.5);
      const g = groundBelow(_v.set(c.x + Math.cos(ang) * rr, c.y + 1, c.z + Math.sin(ang) * rr), 6);
      if (g) paint(owner, g.setY(g.y + 0.2), 1.2 + Math.random() * 0.6, this.team);
    }
    const g0 = groundBelow(c, 6); if (g0) paint(owner, g0.setY(g0.y + 0.2), R * 0.55, this.team);
    G.fx?.explosion(c, this.owner.color, R);
    play('bubble_blast', { pos: c, volume: 1 });
    emit('shake', { pos: c.clone(), amount: 0.7 });
    emit('bomb:explode', { actor: owner, pos: c.clone(), team: this.team, radius: R });
    blast(owner, this.team, c, R, d.damageMax, d.damageMin, 'blower', R * 0.45);   // (areaHit may chain other bubbles)
  }
  dispose() { this.sys.scene.remove(this.mesh); this.mesh.material.dispose(); }
}

// thrown Mega Stamp
class ThrownStamp {
  constructor(sys, a, from, dir) {
    const d = SPECIALS.stamp;
    this.sys = sys; this.kind = 'stamp'; this.owner = a; this.team = a.team;
    this.pos = from.clone(); this.prev = from.clone(); this.vel = dir.clone().multiplyScalar(d.throwSpeed); this.vel.y += 2.5;
    this.t = 0;
    const wd = getWeaponDef('sp_stamp');
    this.mesh = partMesh(wd.body, wd.ink, a.team);
    this.mesh.scale.setScalar(1.6);
    sys.scene.add(this.mesh);
    // sfx-loud: the throw through the cue mix (the enemy's carries across the lane; yours from you)
    if (G.cues) G.cues.one('stamp_throw', { at: a.pos, owner: a, kind: 'throw', vol: 0.9 }); else if (hearable(a)) play('stamp_throw', { pos: a.isLocal ? undefined : a.pos, volume: 0.9 });
  }
  update(dt) {
    this.t += dt;
    this.prev.copy(this.pos);
    this.vel.y -= 12 * dt;
    this.pos.addScaledVector(this.vel, dt);
    let at = null;
    const hit = G.physics.segment(this.prev, this.pos, _hit, true);
    if (hit.hit) at = hit.point.clone().addScaledVector(hit.normal, 0.3);
    if (!at) for (const e of G.actors) {
      if (e.team === this.team || !e.alive) continue;
      Physics.segmentCapsuleDist(this.prev, this.pos, e.pos, 0.7, 1.6, _res);
      if (_res.dist < 0.8) { at = _v.copy(this.prev).lerp(this.pos, _res.t).clone(); break; }
    }
    if (!at && this.sys.shotHit(this.prev, this.pos, this.team, 200, this.owner)) at = this.pos.clone();
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(this.t * 14, Math.atan2(this.vel.x, this.vel.z), 0);
    if (at || this.t > 3 || this.pos.y < PLAYER.waterY - 2) {
      if (at) this._boom(at);
      return false;
    }
    return true;
  }
  _boom(c) {
    const d = SPECIALS.stamp;
    const g = groundBelow(c, 4);
    paint(this.owner, (g || c).clone().setY((g || c).y + 0.2), d.throwRadius * 0.8, this.team);
    for (let k = 0; k < 4; k++) {
      const ang = Math.random() * TAU, rr = d.throwRadius * (0.5 + Math.random() * 0.4);
      paint(this.owner, _v.set(c.x + Math.cos(ang) * rr, c.y + 0.5, c.z + Math.sin(ang) * rr), 0.9, this.team);
    }
    G.fx?.explosion(c, this.owner.color, d.throwRadius);
    G.cues?.one('stamp_crash', { at: c, owner: this.owner, kind: 'boom' });   // sfx-cues: the thrown stamp's own crash
    emit('shake', { pos: c.clone(), amount: 0.8 });
    emit('bomb:explode', { actor: this.owner, pos: c.clone(), team: this.team, radius: d.throwRadius });
    blast(this.owner, this.team, c, d.throwRadius, d.throwDamageMax, d.throwDamageMin, 'stamp', 1.2);
  }
  dispose() { this.sys.scene.remove(this.mesh); }
}

// Crab Rig mortar shell
class Shell {
  constructor(sys, a, from, vel) {
    this.sys = sys; this.kind = 'shell'; this.owner = a; this.team = a.team;
    this.pos = from.clone(); this.prev = from.clone(); this.vel = vel.clone(); this.t = 0;
    this.mesh = new THREE.Mesh(sys.sphereGeo, getInkMaterial(a.color)); this.mesh.scale.setScalar(0.28); this.mesh.castShadow = true;
    sys.scene.add(this.mesh);
  }
  update(dt) {
    this.t += dt;
    this.prev.copy(this.pos);
    this.vel.y -= 20 * dt;
    this.pos.addScaledVector(this.vel, dt);
    let at = null;
    const hit = G.physics.segment(this.prev, this.pos, _hit, true);
    if (hit.hit) at = hit.point.clone().addScaledVector(hit.normal, 0.25);
    if (!at) for (const e of G.actors) {
      if (e.team === this.team || !e.alive) continue;
      Physics.segmentCapsuleDist(this.prev, this.pos, e.pos, e.hitR || PLAYER.radius, e.hitH || PLAYER.height, _res);
      if (_res.dist < (e.hitR || PLAYER.radius) + 0.25) { at = _v.copy(this.prev).lerp(this.pos, _res.t).clone(); break; }
    }
    if (!at && this.sys.shotHit(this.prev, this.pos, this.team, 150, this.owner)) at = this.pos.clone();
    this.mesh.position.copy(this.pos);
    if (at) {
      const d = SPECIALS.crab;
      paint(this.owner, at.clone().setY(at.y + 0.1), d.cannonRadius * 0.75, this.team);
      G.fx?.explosion(at, this.owner.color, d.cannonRadius);
      G.cues?.one('shell_boom', { at, owner: this.owner, kind: 'boom', vol: 0.9 });   // sfx-cues: the mortar's own boom
      emit('bomb:explode', { actor: this.owner, pos: at.clone(), team: this.team, radius: d.cannonRadius });
      blast(this.owner, this.team, at, d.cannonRadius, d.cannonDamageMax, d.cannonDamageMin, 'crab', 0.8);
      return false;
    }
    return this.t < 4 && this.pos.y > PLAYER.waterY - 2;
  }
  dispose() { this.sys.scene.remove(this.mesh); }
}

// Cheer Orb: lobbed, lands, swells, then one huge blast
class Orb {
  constructor(sys, a, from, vel) {
    this.sys = sys; this.kind = 'orb'; this.owner = a; this.team = a.team;
    this.pos = from.clone(); this.prev = from.clone(); this.vel = vel.clone(); this.t = 0; this.phase = 'fly';
    this.mesh = new THREE.Mesh(sys.sphereGeo, new THREE.MeshBasicMaterial({ color: a.color.clone().multiplyScalar(2.2) }));
    this.mesh.scale.setScalar(0.5);
    this.halo = new THREE.Mesh(sys.sphereGeo, bubbleMat(a.color));
    this.halo.scale.setScalar(0.8);
    sys.scene.add(this.mesh, this.halo);
  }
  update(dt) {
    const d = SPECIALS.booyah;
    this.t += dt;
    const hu = this.halo.material.uniforms; hu.uTime.value = this.t;
    if (this.phase === 'fly') {
      this.prev.copy(this.pos);
      this.vel.y -= 24 * dt;
      this.pos.addScaledVector(this.vel, dt);
      const hit = G.physics.segment(this.prev, this.pos, _hit, true);
      if (hit.hit) { this.pos.copy(hit.point).addScaledVector(hit.normal, 0.5); this.phase = 'fuse'; this.t = 0; G.cues?.one('orb_land', { at: this.pos, owner: this.owner, kind: 'warn', radius: SPECIALS.booyah.radius, range: 60 }); }   // sfx-cues (then the orb_fuse loop)
      else if (this.t > 4 || this.pos.y < PLAYER.waterY - 2) return false;
    } else if (this.phase === 'fuse') {
      // swell (warning sphere grows toward the blast radius)
      const k = this.t / d.fuse;
      this.halo.scale.setScalar(0.8 + (d.radius - 0.8) * k * k);
      hu.uAlpha.value = 0.35 + 0.3 * Math.abs(Math.sin(this.t * (6 + k * 20)));
      this.mesh.scale.setScalar(0.5 + Math.sin(this.t * 30) * 0.05 * k);
      if (k >= 1) { this._blast(); return false; }
    }
    this.mesh.position.copy(this.pos); this.halo.position.copy(this.pos);
    return true;
  }
  _blast() {
    const d = SPECIALS.booyah, c = this.pos;
    const g = groundBelow(c, 6);
    const base = (g || c).clone().setY((g || c).y + 0.3);
    paint(this.owner, base, d.radius * 0.72, this.team);
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * TAU + Math.random() * 0.3, rr = d.radius * (0.5 + Math.random() * 0.45);
      const gg = groundBelow(_v.set(c.x + Math.cos(ang) * rr, c.y + 2, c.z + Math.sin(ang) * rr), 8);
      if (gg) paint(this.owner, gg.setY(gg.y + 0.2), 1.3 + Math.random() * 0.7, this.team);
    }
    G.fx?.explosion(c, this.owner.color, d.radius);
    play('booyah_blast', { pos: c, volume: 1 });
    emit('shake', { pos: c.clone(), amount: 1.2 });
    emit('special:slam', { actor: this.owner, pos: c.clone(), radius: d.radius });
    blast(this.owner, this.team, c, d.radius, d.damageMax, d.damageMin, 'booyah', d.killRadius);
  }
  dispose() { this.sys.scene.remove(this.mesh, this.halo); this.mesh.material.dispose(); this.halo.material.dispose(); }
}

// ================================================================================================ specials
const IMPL = {
  // ---------------------------------------------------------------------------------------------- Bomb Barrage
  barrage: {
    start(a, s) {
      s.bomb = SUBS[s.def.bomb] || SUBS.bomb; s.nextThrow = 0;
      a.character.setSub?.(s.bomb.kind);
    },
    end(a) { a.character.setSub?.(a.sub.kind); a.weaponRunner.aimingSub = false; },
  },

  // ---------------------------------------------------------------------------------------------- Bubble Guard
  bubbler: {
    start(a, s) { this.giveShield(a, s.def.duration, true); },
    end(a, s, reason) { if (reason !== 'time') return; /* the field runs out on its own timer */ },
  },

  // ---------------------------------------------------------------------------------------------- Deep Sonar
  sonar: {
    start(a, s) {
      s.body = true; s.dur = s.def.cast;
      a.character.trigger('throw');
      for (const e of G.actors) {
        if (e.team === a.team) continue;
        e.status.reveal = s.def.duration; e.status.revealTeam = a.team;
        G.subs?.track(e, a.team, s.def.duration);
        if (e.isLocal) play('sonar_mark', { volume: 0.8 });
      }
      play('sonar_ping', { volume: 0.9 });
      emit('special:sonar', { actor: a, pos: a.pos.clone() });
      if (near(a.pos, 60)) for (let k = 0; k < 3; k++) G.fx?.ring(_v.copy(a.pos).setY(a.pos.y + 0.1), UP, a.color, { radius: 6 + k * 7, life: 0.8 + k * 0.25 });
    },
    body(a, s, dt) { this._stand(a, dt); },
  },

  // ---------------------------------------------------------------------------------------------- Vortex Strike
  strike: {
    start(a, s) {
      s.body = true; s.aiming = true; s.dur = 0; s.confirm = false;
      const B = bounds();
      s.target = new THREE.Vector3(clamp(a.pos.x + Math.sin(a.aimYaw) * 16, B.minX + 2, B.maxX - 2), 0, clamp(a.pos.z + Math.cos(a.aimYaw) * 16, B.minZ + 2, B.maxZ - 2));
      if (!a.isLocal || a.bot) { IMPL.strike.botTarget(a, s); s.autoT = 0.7 + Math.random() * 0.6; }
      a.character.trigger('throw');
    },
    body(a, s, dt) {
      this._stand(a, dt);
      if (!s.aiming) return;
      if (s.autoT != null && s.t >= s.autoT) s.confirm = true;
      if (s.confirm || s.t >= s.def.aimTime) IMPL.strike.launch.call(this, a, s);
    },
    launch(a, s) {
      s.aiming = false;
      const g = G.physics.raycast(_v.set(s.target.x, 40, s.target.z), DOWN, 80, _hit, true);
      const to = g.hit ? g.point.clone() : new THREE.Vector3(s.target.x, 0, s.target.z);
      this._spawn(a, new Missile(this, a, to), 'mi', v3(to));
      emit('special:launch', { actor: a, to: to.clone() });
      this.end(a, 'launch');
    },
    // bots: the thickest cluster of the enemies their team knows about (seen, located or seen lately — bots.js /
    // botSight.js: never where the rest really are), else the most enemy ink
    botTarget(a, s) {
      let best = null, bs = 0;
      const known = [];
      for (const e of G.actors) {
        if (e.team === a.team || !e.alive) continue;
        const k = a.bot ? teamKnown(a.team, e, 3) : null, p = a.bot ? k && k.pos : e.pos;
        if (p) known.push(p);
      }
      for (const p of known) {
        let n = 1; for (const q of known) if (q !== p && q.distanceTo(p) < 5) n++;
        if (n > bs) { bs = n; best = p; }
      }
      const B = bounds();
      if (!best || Math.random() < 0.35) {
        let bv = -1;
        // sample walkable ground (nav nodes) — on a skewed / jagged stage most of the bounds box is open water
        const nodes = G.nav && G.nav.nodes && G.nav.nodes.length ? G.nav.nodes : null;
        for (let k = 0; k < 24; k++) {
          let x, z;
          if (nodes) { const n = nodes[(Math.random() * nodes.length) | 0]; x = n.x; z = n.z; }
          else { x = lerp(B.minX + 3, B.maxX - 3, Math.random()); z = lerp(B.minZ + 3, B.maxZ - 3, Math.random()); }
          const y = G.level.groundHeight(x, z, 30); if (y === -Infinity) continue;
          const st = G.paint.regionStats(x, y, z, 4, a.team);
          const v = st.n ? st.enemy * 1.5 + st.empty : -1;
          if (v > bv) { bv = v; best = _v.set(x, y, z).clone(); }
        }
      }
      if (best) s.target.set(best.x, 0, best.z);
    },
  },

  // ---------------------------------------------------------------------------------------------- Twister Zooka
  zooka: {
    start(a, s) { s.cd = 0.25; s.speed = 4.2; s.aimFace = true; s.noSquid = true; this._swapWeapon(a, 'sp_zooka'); },
    weapon(a, s, dt, inp) {
      s.cd -= dt;
      if (inp.fire && s.cd <= 0) {
        s.cd = s.def.interval; s.firing = 0.45;
        const m = G.projectiles._muzzle(a, _v.set(0, 0, 0)).clone();
        const dir = G.projectiles._aimFrom(a, m, _v2).clone();
        this._spawn(a, new Twister(this, a, m, dir), 'tw', [...v3(m), ...v3(dir)]);
        a.character.trigger('shoot');
        G.cues?.one('zooka_fire', { at: m, owner: a, kind: 'start', vol: 0.8, range: 50 });   // sfx-cues: a Zooka shot is heard from further off (yours from you)
        if (a.isLocal) emit('recoil', { amount: 0.02 });
        rumble(a, 0.45, 0.5, 140);
        emit('weapon:fire', { actor: a, weapon: 'zooka', muzzle: m, dir });
      }
      return true;
    },
    end(a) { this._restoreWeapon(a); },
  },

  // ---------------------------------------------------------------------------------------------- Howl Box
  wail: {
    // hold the speaker up in front of you and aim (a faint guide shows the line); click sets it down and it fires
    start(a, s) {
      Object.assign(s, { speed: s.def.holdSpeed, noSquid: true, aimFace: true, dur: 0 });
      a.character.weaponHidden = true;
      if (a.character.weapon?.pivot) a.character.weapon.pivot.visible = false;
      if (a.character.weapon?.left?.pivot) a.character.weapon.left.pivot.visible = false;
      const pd = prop('speaker');
      const m = pd ? propMesh(pd, a.team, this.glowMat(a.team)) : new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.8).translate(0, 0.7, 0), getPlasticMaterial());
      m.scale.setScalar(0.36);
      s.heldG = new THREE.Group(); s.heldG.add(m);
      s.guide = new THREE.Mesh(this.beamGeo, beamMat(a.color));
      this._add(s.heldG, s.guide);
      if (a.bot) s.autoT = 0.45 + Math.random() * 0.5;
      IMPL.wail.tick.call(this, a, s, 0);
    },
    weapon(a, s, dt, inp) {
      s.firing = 0.2;
      if ((inp.firePressed && s.t > 0.2) || (s.autoT != null && s.t >= s.autoT) || s.t >= s.def.holdTime) IMPL.wail.place.call(this, a, s);
      return true;
    },
    dirOf(a) {
      const p = clamp(a.aimPitch, -0.3, 0.3);
      return new THREE.Vector3(Math.sin(a.aimYaw) * Math.cos(p), Math.sin(p), Math.cos(a.aimYaw) * Math.cos(p));
    },
    tick(a, s, dt) {
      if (!s.heldG) return;
      // boombox-style on the right shoulder, pointing where you aim (visible from the follow camera)
      const f = this._fwd(a), rx = -f.z, rz = f.x;   // the kid's right
      s.heldG.position.set(a.pos.x + rx * 0.24 + f.x * 0.06, a.pos.y + (a.smoothY || 0) + 1.06 + Math.sin(s.t * 9) * 0.01, a.pos.z + rz * 0.24 + f.z * 0.06);
      s.heldG.rotation.y = a.aimYaw;
      // guide: where the beam will go once the speaker is down
      const dir = IMPL.wail.dirOf(a);
      s.guide.position.set(a.pos.x + f.x * 1.3, a.pos.y + 0.85, a.pos.z + f.z * 1.3);
      s.guide.lookAt(_v.copy(s.guide.position).add(dir));
      s.guide.scale.set(0.07, 0.07, s.def.range);
      const u = s.guide.material.uniforms;
      u.uTime.value = s.t; u.uCharge.value = 0; u.uAlpha.value = 0.3 + 0.15 * Math.sin(s.t * 6);
    },
    place(a, s) {
      const f = this._fwd(a, new THREE.Vector3());
      const at = _v.copy(a.pos).addScaledVector(f, 1.3);
      const g = G.physics.raycast(_v2.copy(at).setY(a.pos.y + 1.2), DOWN, 4, _hit, true);
      const pos = g.hit && g.normal.y > 0.6 ? g.point.clone() : a.pos.clone();
      a.character.trigger('throw');
      const dir = IMPL.wail.dirOf(a);
      this._spawn(a, new Speaker(this, a, pos, dir), 'sk', [...v3(pos), ...v3(dir)]);
      this.end(a, 'place');
    },
    end(a, s) {
      this._remove(s.heldG, s.guide);
      s.guide?.material.dispose();
      a.character.weaponHidden = false;
      if (a.character.weapon?.pivot) a.character.weapon.pivot.visible = true;
      if (a.character.weapon?.left?.pivot) a.character.weapon.left.pivot.visible = true;
    },
  },

  // ---------------------------------------------------------------------------------------------- Kraken
  kraken: {
    start(a, s) {
      Object.assign(s, { noSquid: true, inkProof: true, speed: s.def.speed, accel: 45, faceMove: true, cd: 0, attack: false, trail: 0, air: false });
      a.form = 'kid';
      a.weaponRunner.reset();
      a.character.setVisible(false);
      const d = prop('kraken');
      s.mesh = d ? propMesh(d, a.team, this.glowMat(a.team)) : new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 0.8, 6, 16).translate(0, 1.1, 0), getInkMaterial(a.color));
      s.body3 = new THREE.Group(); s.body3.add(s.mesh);
      this._add(s.body3);
      if (hearable(a)) play('kraken_on', { pos: a.isLocal ? undefined : a.pos, volume: 0.9 });
      G.fx?.explosion(_v.copy(a.pos).setY(a.pos.y + 0.8), a.color, 1.6);
    },
    weapon(a, s, dt, inp) {
      s.cd -= dt;
      if (inp.firePressed && s.cd <= 0) {
        s.cd = s.def.cooldown; s.attack = true;
        if (a.grounded) {
          const f = this._fwd(a);
          a.vel.x += f.x * s.def.attackFwd * 0.5; a.vel.z += f.z * s.def.attackFwd * 0.5;
          a.vel.y = s.def.attackVel; a.grounded = false;
        } else a.vel.y = Math.min(a.vel.y, -16);   // dive onto whoever is below
        if (hearable(a)) play('kraken_jump', { pos: a.isLocal ? undefined : a.pos, volume: 0.8 });
      }
      return true;
    },
    tick(a, s, dt) {
      // big hops on jump
      if (!a.grounded && !s.air && a.vel.y > 3 && !s.attack) { a.vel.y = Math.max(a.vel.y, s.def.hopVel); if (hearable(a)) play('kraken_jump', { pos: a.isLocal ? undefined : a.pos, volume: 0.6, pitch: 1.2 }); }
      const landed = s.air && a.grounded;
      s.air = !a.grounded;
      if (landed && s.attack) {
        s.attack = false;
        const c = a.pos.clone();
        paint(a, _v.copy(c).setY(c.y + 0.3), s.def.radius * 0.8, a.team);
        G.fx?.explosion(_v.copy(c).setY(c.y + 0.4), a.color, s.def.radius);
        play('kraken_slam', { pos: c, volume: 0.9 });
        emit('shake', { pos: c.clone(), amount: 0.6 });
        emit('special:slam', { actor: a, pos: c.clone(), radius: s.def.radius });
        blast(a, a.team, _v2.copy(c).setY(c.y + 0.4).clone(), s.def.radius, s.def.damage, s.def.damage * 0.6, 'kraken', s.def.radius * 0.7);
        rumble(a, 0.6, 0.5, 200);
      }
      // ink trail
      if (a.grounded) {
        s.trail += Math.hypot(a.vel.x, a.vel.z) * dt;
        if (s.trail > 0.5) { s.trail = 0; paint(a, _v.copy(a.pos).setY(a.pos.y + 0.2), s.def.paintRadius, a.team); }
      }
      // visual
      const b = s.body3;
      b.position.set(a.pos.x, a.pos.y + (a.smoothY || 0), a.pos.z);
      b.rotation.y = a.yaw;
      const sq = a.grounded ? 1 + Math.sin(s.t * 14) * 0.04 * Math.min(1, Math.hypot(a.vel.x, a.vel.z) / 4) : clamp(1 + a.vel.y * 0.025, 0.8, 1.25);
      b.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    },
    end(a, s) {
      this._remove(s.body3);
      a.character.setVisible(true);
      if (a.alive) G.fx?.explosion(_v.copy(a.pos).setY(a.pos.y + 0.8), a.color, 1.4);
    },
  },

  // ---------------------------------------------------------------------------------------------- Bubble Blower
  blower: {
    start(a, s) { s.count = 0; s.cur = null; s.aimFace = true; s.noSquid = true; this._swapWeapon(a, 'sp_blower'); },
    weapon(a, s, dt, inp) {
      const d = s.def;
      if (!inp.fire) s.needRelease = false;
      if (inp.fire && !s.cur && s.count < d.max && !s.done && !s.needRelease) {
        s.cur = new Bubble(this, a); s.curT = 0; this.world.push(s.cur); s.cur.gid = netId(a);
        s.inflate = null;   // sfx-cues: the inflate loop comes from src/audio/cues.js
      }
      if (s.cur) {
        s.curT += dt; s.firing = 0.3;
        const k = clamp(s.curT / d.inflate, 0, 1);
        s.cur.r = lerp(d.rMin, d.rMax, 1 - (1 - k) * (1 - k));
        const m = G.projectiles._muzzle(a, _v.set(0, 0, 0));
        const f = this._fwd(a, _v2);
        s.cur.pos.copy(m).addScaledVector(f, s.cur.r + 0.2);
        s.cur.pos.y = Math.max(s.cur.pos.y, a.pos.y + s.cur.r * 0.7);
        s.inflate?.set?.({ pitch: 1 + k });
        if (!inp.fire || s.curT > d.inflate + 0.6) {
          if (inp.fire) s.needRelease = true;
          IMPL.blower.let(a, s.cur, f); s.cur = null; s.count++;
          s.inflate?.stop?.(0.05); s.inflate = null;
          if (s.count >= d.max) { s.done = true; s.dur = s.t + 0.6; }
        }
      }
      return true;
    },
    // let go of the bubble (online: it appears on everyone else's screen now, already blown)
    let(a, b, f) {
      b.release(f);
      if (b.gid) rec(a, [2, 'bu', b.gid, ...v3(b.pos), r2(b.r), r2(f.x), r2(f.y), r2(f.z)]);
    },
    end(a, s) {
      if (s.cur) { IMPL.blower.let(a, s.cur, this._fwd(a, _v2)); s.cur = null; }
      s.inflate?.stop?.(0.05);
      this._restoreWeapon(a);
    },
  },

  // ---------------------------------------------------------------------------------------------- Ink Jet
  jetpack: {
    start(a, s) {
      Object.assign(s, { body: true, origin: a.pos.clone(), jumpBack: true, cd: 0.3, paintT: 0, fx: 0, boostCd: 0, boostT: 0, jumpWas: true });
      s.marker = new ReturnMarker(this, a, a.pos, 'jetpack'); this.world.push(s.marker);
      a.grounded = false; a.vel.y = 7;
      this._swapWeapon(a, 'sp_jetgun');
      // the pack replaces the ink tank on the kid's back
      const tank = a.character.tank?.group;
      const d = prop('jetpack');
      if (tank) {
        s.tankKids = tank.children.filter((c) => c.visible);
        for (const c of s.tankKids) c.visible = false;
        s.pack = d ? propMesh(d, a.team, this.glowMat(a.team)) : new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.16).translate(0, 0.1, -0.05), getInkMaterial(a.color));
        tank.add(s.pack);
        s.nozzles = d && d.nozzles ? d.nozzles.map((n) => n.clone()) : [new THREE.Vector3(-0.08, -0.12, -0.05), new THREE.Vector3(0.08, -0.12, -0.05)];
      }
      s.loop = null;   // sfx-cues: the jet's loop comes from src/audio/cues.js (heard as soon as you're near, never outliving it)
    },
    body(a, s, dt) {
      const d = s.def, mv = a.intent.move;
      // horizontal: steer toward the stick at hover speed
      const tvx = mv.x * d.speed, tvz = mv.z * d.speed;
      const ex = tvx - a.vel.x, ez = tvz - a.vel.z, el = Math.hypot(ex, ez), r = d.accel * dt;
      if (el <= r) { a.vel.x = tvx; a.vel.z = tvz; } else { a.vel.x += ex / el * r; a.vel.z += ez / el * r; }
      // vertical: hold a hover height over whatever is below (never lower than above the take-off point)
      const gy = G.level.groundHeight(a.pos.x, a.pos.z, a.pos.y + 0.5);
      const floor = gy === -Infinity ? s.origin.y : Math.max(gy, s.origin.y - 1);
      const wantY = floor + d.height + Math.sin(s.t * 2.2) * 0.12;
      // jump = a boost: a burst of thrust upward, then the hover settles back down
      s.boostCd -= dt; s.boostT -= dt;
      const jump = !!a.intent.jump;
      if (jump && !s.jumpWas && s.boostCd <= 0) {
        s.boostCd = d.boostGap; s.boostT = 0.35;
        a.vel.y = d.boost;
        G.cues?.one('jet_boost', { at: a.pos, owner: a, kind: 'start', vol: 0.7 });   // sfx-cues: the jet's own boost
        if (near(a.pos) && a.character.tank?.group) for (const n of s.nozzles || []) G.fx?.burst(a.character.tank.group.localToWorld(_v.copy(n)), DOWN, a.color, { count: 8, speed: 7, size: 0.09 });
        rumble(a, 0.3, 0.3, 90);
      }
      s.jumpWas = jump;
      if (s.boostT <= 0) {
        const vy = clamp((wantY - a.pos.y) * 3, -5, 6);
        a.vel.y += (vy - a.vel.y) * Math.min(1, dt * (a.pos.y > wantY + 1 ? 2.5 : 6));
      } else a.vel.y -= PLAYER.gravity * 0.35 * dt;
      const py = a.pos.y;
      a.pos.addScaledVector(a.vel, dt);
      a._resolve(false, py, false);
      a.grounded = false;
      s.faceYaw = a.aimYaw;
      // fire
      s.cd -= dt;
      if (a.intent.fire && s.cd <= 0) {
        s.cd = d.interval; s.firing = 0.4;
        const m = G.projectiles._muzzle(a, _v.set(0, 0, 0)).clone();
        const dir = G.projectiles._aimFrom(a, m, _v2).clone();
        G.projectiles.fireCustom(a, m, dir, { type: 'blast', speed: d.projSpeed, damage: d.directDamage, range: d.range, weaponId: 'jetpack',
          burst: { radius: d.splashRadius, splashRadius: d.splashRadius, dmgMax: d.splashMax, dmgMin: d.splashMin, paint: d.paintRadius } });
        a.character.trigger('shoot');
        if (hearable(a)) play('jet_fire', { pos: a.isLocal ? undefined : m, volume: a.isLocal ? 0.8 : 0.55 });
        if (a.isLocal) emit('recoil', { amount: 0.014 });
        rumble(a, 0.3, 0.4, 100);
      }
      // exhaust ink below
      s.paintT -= dt;
      if (s.paintT <= 0) {
        s.paintT = 0.28;
        const g = groundBelow(a.pos, 9);
        if (g) paint(a, g.setY(g.y + 0.2), 1.0, a.team);
      }
      s.fx -= dt;
      if (s.fx <= 0 && near(a.pos, 30) && a.character.tank?.group) {
        s.fx = 0.05;
        const tg = a.character.tank.group;
        for (const n of s.nozzles || []) G.fx?.burst(tg.localToWorld(_v.copy(n)), DOWN, a.color, { count: 2, speed: 4, size: 0.07, ring: false, mist: false });
      }
      s.loop?.set?.({ pos: a.isLocal ? undefined : a.pos });
    },
    end(a, s) {
      s.loop?.stop?.(0.2);
      if (hearable(a) && a.alive) play('jet_end', { pos: a.isLocal ? undefined : a.pos, volume: 0.7 });
      if (s.pack) s.pack.parent?.remove(s.pack);
      for (const c of s.tankKids || []) c.visible = true;
      this._restoreWeapon(a);
    },
  },

  // ---------------------------------------------------------------------------------------------- Mega Stamp
  stamp: {
    start(a, s) {
      Object.assign(s, { cd: 0, speed: s.def.moveSpeed, noSquid: true, pending: -1, subWas: false, guard: 0, flip: null, bodyYaw: a.yaw, faceYaw: a.yaw });
      this._swapWeapon(a, 'sp_stamp');
    },
    // heavy: the body swings round toward the aim slowly while charging (quicker once stopped), and moves mostly along
    // its facing — sideways input is cut to a shuffle
    move(a, s, dt) {
      const d = s.def, hs = Math.hypot(a.vel.x, a.vel.z);
      const rate = (hs > 1.5 ? d.turnRate : d.turnRateStill) * dt;
      s.bodyYaw += Math.max(-rate, Math.min(rate, angleDiff(s.bodyYaw, a.aimYaw)));
      s.faceYaw = s.bodyYaw;
      const f = stampFwd(s), mv = a.intent.move;
      // (input that nobody rewrote since last frame is still our output: filter the original again, never compound)
      if (s.mvOut && mv.x === s.mvOut.x && mv.z === s.mvOut.z) { mv.x = s.mvIn.x; mv.z = s.mvIn.z; }
      s.mvIn = { x: mv.x, z: mv.z };
      const along = mv.x * f.x + mv.z * f.z;
      mv.x = f.x * along + (mv.x - f.x * along) * d.strafe;
      mv.z = f.z * along + (mv.z - f.z * along) * d.strafe;
      s.mvOut = { x: mv.x, z: mv.z };
    },
    weapon(a, s, dt, inp) {
      const d = s.def;
      s.cd -= dt;
      const subPress = inp.sub && !s.subWas; s.subWas = inp.sub;
      if (subPress) {
        // throw it: a long-range blast, and the special is over
        const m = G.projectiles._muzzle(a, _v.set(0, 0, 0)).clone();
        const dir = G.projectiles._aimFrom(a, m, _v2).clone();
        a.character.trigger('throw');
        const from = _v3.copy(a.pos).setY(a.pos.y + 1.5).clone();
        this._spawn(a, new ThrownStamp(this, a, from, dir), 'ts', [...v3(from), ...v3(dir)]);
        this.end(a, 'throw');
        return true;
      }
      if (inp.fire && s.cd <= 0 && !s.flip) {
        if (!a.grounded) {
          // mid-air swing: a single flip — behind first as the stamp goes over, then a long smash in front
          const f = stampFwd(s);
          s.flip = { t: 0, back: false, front: false }; s.guard = d.flipTime; s.cd = d.flipTime + 0.1;
          const dir = new THREE.Vector3(f.x, 0, f.z); dir.dur = d.flipTime;
          a.character.trigger('roll', dir);
          if (hearable(a)) play('stamp_swing', { pos: a.isLocal ? undefined : a.pos, volume: 0.7, pitch: 0.85 });
        } else {
          s.pending = 0.15; s.cd = d.interval; s.guard = d.guardTime;
          if (hearable(a)) play('stamp_swing', { pos: a.isLocal ? undefined : a.pos, volume: 0.6 });
          a.character.trigger('flick');
        }
        s.firing = 0.5;
      }
      if (s.pending >= 0) {
        s.pending -= dt;
        if (s.pending < 0) {
          IMPL.stamp.slam.call(this, a, s, d.radius, d.reach);
          const f = stampFwd(s);
          a.vel.x += f.x * d.lunge; a.vel.z += f.z * d.lunge;
        }
      }
      return true;
    },
    tick(a, s, dt) {
      const d = s.def;
      if (s.flip) {
        const fl = s.flip; fl.t += dt;
        if (!fl.back && fl.t >= d.flipTime * 0.3) { fl.back = true; IMPL.stamp.slam.call(this, a, s, d.flipBackRadius, -d.flipBackReach); }
        if (!fl.front && fl.t >= d.flipTime * 0.75) { fl.front = true; IMPL.stamp.slam.call(this, a, s, d.flipRadius, d.flipReach); emit('shake', { pos: a.pos.clone(), amount: 0.5 }); }
        if (fl.t >= d.flipTime) s.flip = null;
      }
      if (s.guard > 0) {
        s.guard -= dt;
        IMPL.stamp.guardSweep.call(this, a, s);
      }
    },
    // the swing's guard: enemy shots in front are knocked out of the air, enemy bombs in front are smashed
    guardSweep(a, s) {
      const d = s.def, ay = a.pos.y + 1.0;
      const shots = G.projectiles.list;
      for (let i = shots.length - 1; i >= 0; i--) {
        const p = shots[i];
        if (p.team === a.team || Math.abs(p.pos.y - ay) > 2.0) continue;
        if (Math.hypot(p.pos.x - a.pos.x, p.pos.z - a.pos.z) > d.deflectR || !stampFront(a, s, p.pos, d.deflectArc)) continue;
        G.projectiles.removeShot(p);
        if (near(p.pos, 30)) G.fx?.burst(p.pos, UP, a.color, { count: 4, speed: 3.5, size: 0.06, ring: false });
      }
      for (const b of [...G.projectiles.bombs]) {
        if (b.team === a.team || b.kind !== 'bomb') continue;
        if (b.pos.distanceTo(_v.copy(a.pos).setY(ay)) > d.bombClearR || !stampFront(a, s, b.pos, d.deflectArc)) continue;
        G.projectiles.defuseBomb(b);
        if (near(b.pos, 40)) { G.fx?.burst(b.pos, UP, a.color, { count: 10, speed: 4, size: 0.08 }); play('shield_hit', { pos: b.pos, volume: 0.6, pitch: 0.8 }); }
      }
      for (const it of G.subs?.items || []) {
        if (it.team === a.team || it.state === 'dead' || !STAMP_SMASHES.has(it.kind)) continue;
        if (it.pos.distanceTo(_v.copy(a.pos).setY(ay)) > d.bombClearR || !stampFront(a, s, it.pos, d.deflectArc)) continue;
        G.subs._destroy(it);
      }
    },
    slam(a, s, radius, reach) {
      const f = stampFwd(s);
      const c = _v.copy(a.pos).addScaledVector(f, reach);
      const g = G.physics.raycast(_v2.copy(c).setY(a.pos.y + 1.2), DOWN, 3, _hit, true);
      const at = g.hit ? g.point.clone() : c.clone().setY(a.pos.y);
      paint(a, _v2.copy(at).setY(at.y + 0.2), radius * 0.95, a.team);
      paint(a, _v2.copy(at).addScaledVector(f, radius * 0.7).setY(at.y + 0.2), radius * 0.6, a.team);
      rec(a, [4, 'sl', ...v3(at), r2(radius)]);
      if (near(at, 40)) { G.fx?.explosion(_v2.copy(at).setY(at.y + 0.3), a.color, radius); play('stamp_slam', { pos: at, volume: 0.85 }); }
      rumble(a, 0.5, 0.4, 120);
      for (const e of G.actors) {
        if (e.team === a.team || !e.alive) continue;
        const dh = Math.hypot(e.pos.x - at.x, e.pos.z - at.z);
        if (dh > radius + PLAYER.radius || Math.abs(e.pos.y - at.y) > 1.8) continue;
        if (!G.physics.los(_v2.copy(at).setY(at.y + 0.5), _v3.copy(e.pos).setY(e.pos.y + 0.6))) continue;
        G.projectiles.applyHit(a, e, s.def.damage, 'stamp');
      }
      G.subs?.damageArea(at, radius, 80, a.team);
    },
    end(a) { this._restoreWeapon(a); },
  },

  // ---------------------------------------------------------------------------------------------- Cheer Orb
  booyah: {
    start(a, s) {
      // `bomb` gives the throw-arc preview the orb's launch speed (the orb flies with the same gravity as bombs)
      Object.assign(s, { charge: 0, fullT: 0, speed: s.def.moveSpeed, noSquid: true, aimFace: true, thrown: false, cheered: 0, bomb: { kind: 'booyah', throwSpeed: s.def.throwSpeed } });
      a.character.subPropHidden = true;
      s.ball = new THREE.Mesh(this.sphereGeo, new THREE.MeshBasicMaterial({ color: a.color.clone().multiplyScalar(2) }));
      s.halo = new THREE.Mesh(this.sphereGeo, bubbleMat(a.color));
      this._add(s.ball, s.halo);
      s.loop = null;   // sfx-cues: the charge loop comes from src/audio/cues.js
    },
    weapon(a, s, dt, inp) {
      const d = s.def;
      s.charge = Math.min(1, s.charge + dt / d.charge);
      if (s.charge >= 1) {
        s.fullT += dt;
        if ((inp.firePressed && s.fullT > 0.05) || s.fullT > d.autoThrow) {
          IMPL.booyah.throwIt.call(this, a, s);
          return true;
        }
      }
      s.raise = true;                        // arm up (the sub-aim pose), ball overhead
      return true;
    },
    tick(a, s, dt) {
      if (!s.ball) return;
      if (a.character.getHeadPosition) a.character.getHeadPosition(_v); else _v.copy(a.pos).setY(a.pos.y + 1.5);
      const r = 0.16 + 0.2 * s.charge;
      s.ball.position.set(_v.x, _v.y + 0.42 + r, _v.z);
      s.halo.position.copy(s.ball.position);
      s.cheered = Math.max(0, s.cheered - dt);
      const pulse = 1 + Math.sin(s.t * (6 + s.charge * 12)) * 0.05 + s.cheered * 0.4;
      s.ball.scale.setScalar(r * pulse);
      s.halo.scale.setScalar(r * 1.3 * pulse);
      s.halo.material.uniforms.uTime.value = s.t;
      s.loop?.set?.({ pitch: 1 + s.charge, pos: a.isLocal ? undefined : a.pos });
    },
    throwIt(a, s) {
      s.thrown = true;
      const from = a.pos.clone().setY(a.pos.y + 1.35);
      const vel = G.projectiles.throwVelocity(a, s.def.throwSpeed, new THREE.Vector3());
      this._spawn(a, new Orb(this, a, from, vel), 'or', [...v3(from), ...v3(vel)]);
      s.raise = false;
      a.character.trigger('throw');
      if (hearable(a)) play('booyah_throw', { pos: a.isLocal ? undefined : a.pos, volume: 0.9 });
      this.end(a, 'throw');
    },
    end(a, s) {
      s.loop?.stop?.(0.2);
      this._remove(s.ball, s.halo);
      s.ball?.material.dispose(); s.halo?.material.dispose();
      a.character.subPropHidden = false;
    },
  },

  // ---------------------------------------------------------------------------------------------- Zipline
  zipcaster: {
    start(a, s) {
      Object.assign(s, { origin: a.pos.clone(), jumpBack: true, cd: 0, hang: 0, subWas: false, zip: null, wisp: 0 });
      s.marker = new ReturnMarker(this, a, a.pos, 'zipcaster'); this.world.push(s.marker);
      // a mysterious aura: a dark, shifting shroud with a team-coloured rim, trailing wisps
      s.aura = new THREE.Mesh(this.sphereGeo, auraMat(a.color));
      s.aura.renderOrder = 3;
      this._add(s.aura);
      const mat = new THREE.MeshBasicMaterial({ color: a.color.clone().multiplyScalar(1.4) });
      s.line = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6, 1).translate(0, 0.5, 0).rotateX(Math.PI / 2), mat);
      s.line.visible = false;
      this._add(s.line);
    },
    // the main weapon keeps working; the sub button fires the tether
    weapon(a, s, dt, inp) {
      s.cd -= dt;
      const press = inp.sub && !s.subWas; s.subWas = inp.sub;
      inp.sub = false; inp.subReleased = false;
      if (press && s.cd <= 0 && !s.zip) IMPL.zipcaster.fire.call(this, a, s);
      return false;
    },
    fire(a, s) {
      const from = _v.copy(a.pos).setY(a.pos.y + 1.2).clone();
      const dir = _v2.copy(a.aimPoint).sub(from).normalize().clone();
      s.cd = s.def.cooldown;
      if (hearable(a)) play('zip_fire', { pos: a.isLocal ? undefined : a.pos, volume: 0.7 });
      const g = G.physics.raycast(from, dir, s.def.range, _hit, true);
      if (!g.hit) { s.miss = { to: from.clone().addScaledVector(dir, s.def.range), t: 0.2 }; rec(a, [4, 'zm', ...v3(s.miss.to)]); return; }
      const n = g.normal.clone(), wall = Math.abs(n.y) < 0.55;
      const to = g.point.clone().addScaledVector(n, PLAYER.radius + 0.08);
      if (wall) to.y -= 1.0; else to.y = g.point.y;
      s.zip = { to, n, wall, anchor: g.point.clone(), t: 0, stuck: 0 };
      s.anchor = s.zip.anchor;
      rec(a, [4, 'zf', ...v3(s.anchor), r2(n.x), r2(n.y), r2(n.z)]);
      s.body = true; s.hang = 0;
      paint(a, g.point.clone().addScaledVector(n, 0.1), 1.0, a.team);
      if (near(g.point, 40)) play('zip_latch', { pos: g.point, volume: 0.8 });
      if (hearable(a)) play('zip_pull', { pos: a.isLocal ? undefined : a.pos, volume: 0.7 });
    },
    body(a, s, dt) {
      const z = s.zip;
      if (!z) { s.body = false; return; }
      z.t += dt;
      _v.copy(z.to).sub(a.pos);
      const dist = _v.length(), step = s.def.speed * dt;
      // an enemy in the way: the body slams into them and the zip stops there
      for (const e of G.actors) {
        if (e.team === a.team || !e.alive) continue;
        if (Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z) < PLAYER.radius * 2 + 0.2 && Math.abs(e.pos.y - a.pos.y) < 1.4) {
          a.vel.set(0, 0, 0);
          s.body = false; s.zip = null; s.faceYaw = null;
          IMPL.zipcaster.impact.call(this, a, s, e);
          return;
        }
      }
      if (dist <= step || z.t > 1.6 || z.stuck > 0.15) {
        a.vel.set(0, 0, 0);
        if (dist <= step) a.pos.copy(z.to);
        s.body = false; s.zip = null; s.faceYaw = null;
        if (z.wall) { s.hang = s.def.hang; s.hangN = z.n; a.grounded = false; }
        IMPL.zipcaster.impact.call(this, a, s, null);
        return;
      }
      a.vel.copy(_v).multiplyScalar(s.def.speed / dist);
      const before = a.pos.clone(), py = a.pos.y;
      a.pos.addScaledVector(a.vel, dt);
      a._resolve(false, py, false);
      if (a.pos.distanceTo(before) < step * 0.3) z.stuck += dt; else z.stuck = 0;
      s.faceYaw = Math.atan2(a.vel.x, a.vel.z);
      s.anchor = z.anchor;
      IMPL.zipcaster.tick.call(this, a, s, dt);
    },
    // body impact: a mini explosion round the zipper — a direct hit (the enemy slammed into, or anyone right at the
    // body) takes impactDirect, the rest of the blast impactSplash
    impact(a, s, direct) {
      const d = s.def, c = _v3.copy(a.pos).setY(a.pos.y + 0.7).clone();
      rec(a, [4, 'zi', ...v3(c), s.hang > 0 ? 1 : 0]);
      for (const e of G.actors) {
        if (e.team === a.team || !e.alive) continue;
        _v.copy(e.pos); _v.y += 0.8;
        const dist = _v.distanceTo(c), hitDirect = e === direct || dist <= d.impactDirectR;
        if (!hitDirect && dist > d.impactRadius + 0.3) continue;
        if (e !== direct && !G.physics.los(_v2.copy(c), _v)) continue;
        G.projectiles.applyHit(a, e, hitDirect ? d.impactDirect : d.impactSplash, 'zipcaster');
      }
      G.subs?.damageArea(c, d.impactRadius, d.impactSplash, a.team);
      const g = groundBelow(c, 3);
      paint(a, (g || c).clone().setY((g || c).y + 0.2), d.impactRadius * 0.75, a.team);
      G.fx?.explosion(c, a.color, d.impactRadius);
      G.cues?.one('zip_impact', { at: c, owner: a, kind: 'boom', vol: 0.6, range: 40 });   // sfx-cues: the Zipline's own impact
      emit('shake', { pos: c.clone(), amount: 0.35 });
    },
    tick(a, s, dt) {
      if (!s.zip) s.faceYaw = null;
      if (s.aura) {
        const sq = a.form === 'squid';
        s.aura.position.set(a.pos.x, a.pos.y + (a.smoothY || 0) + (sq ? 0.35 : 0.85), a.pos.z);
        const br = 1 + Math.sin(s.t * 3) * 0.04;
        s.aura.scale.set((sq ? 0.7 : 0.62) * br, (sq ? 0.45 : 1.05) * br, (sq ? 0.7 : 0.62) * br);
        s.aura.material.uniforms.uTime.value = s.t;
        s.wisp -= dt;
        if (s.wisp <= 0 && near(a.pos, 26)) {
          s.wisp = 0.07;
          const c = s.auraCol || (s.auraCol = a.color.clone().lerp(new THREE.Color(0.1, 0.01, 0.18), 0.8));
          G.fx?.burst(_v.set(a.pos.x + (Math.random() - 0.5) * 0.7, a.pos.y + 0.3 + Math.random() * 1.3, a.pos.z + (Math.random() - 0.5) * 0.7), UP, c, { count: 1, speed: 0.8, size: 0.06, gravity: -0.15, ring: false, mist: false });
        }
      }
      if (s.hang > 0) {
        s.hang -= dt;
        // jump (or push away from the wall) lets go
        const mv = a.intent.move;
        const away = s.hangN && (mv.x * s.hangN.x + mv.z * s.hangN.z) > 0.5;
        if (a.intent.jump || away) {
          s.hang = 0;
          const n = s.hangN || UP;
          a.vel.set(n.x * 4, 8, n.z * 4); a.grounded = false;
        }
      }
      // tether line: hand → anchor while zipping or hanging
      const show = !!(s.zip || s.hang > 0 || (s.miss && s.miss.t > 0));
      s.line.visible = show;
      if (show) {
        const hand = a.character.bones?.handL;
        if (hand) hand.getWorldPosition(_v); else _v.copy(a.pos).setY(a.pos.y + 1.2);
        const to = s.zip ? s.zip.anchor : s.hang > 0 ? s.anchor : s.miss?.to;
        if (s.miss) s.miss.t -= dt;
        if (!to) { s.line.visible = false; return; }
        s.line.position.copy(_v);
        s.line.lookAt(to);
        s.line.scale.set(1, 1, Math.max(0.01, _v.distanceTo(to)));
      }
    },
    end(a, s) { this._remove(s.line, s.aura); s.line.material.dispose(); s.line.geometry.dispose(); s.aura?.material.dispose(); s.hang = 0; },
  },

  // ---------------------------------------------------------------------------------------------- Crab Rig
  crab: {
    start(a, s) {
      const d = s.def;
      Object.assign(s, { hp: d.hp, hull: a.yaw, noSquid: true, inkProof: true, speed: d.speed, faceYaw: a.yaw, roll: false,
        gcd: 0, ccd: 0.4, subWas: false, legT: 0, rollAng: 0, seatY: 0.95, sndT: 0 });
      a.form = 'kid';
      a.hitR = 1.0; a.hitH = 2.2;
      a.character.weaponHidden = true;
      if (a.character.weapon?.pivot) a.character.weapon.pivot.visible = false;
      if (a.character.weapon?.left?.pivot) a.character.weapon.left.pivot.visible = false;
      const pd = prop('crab');
      s.rig = new THREE.Group();
      s.hullG = new THREE.Group(); s.rig.add(s.hullG);
      if (pd) {
        s.hullG.add(propMesh(pd, a.team, this.glowMat(a.team)));
        s.legs = (pd.legs || []).map((L, i) => { const g = new THREE.Group(); g.position.copy(L.at); const m = partMesh(L.body, L.ink, a.team); m.position.copy(L.at).negate(); g.add(m); s.hullG.add(g); return { g, i }; });
        if (pd.gun) s.hullG.add(partMesh(pd.gun.body, pd.gun.ink, a.team));
        if (pd.cannon) s.hullG.add(partMesh(pd.cannon.body, pd.cannon.ink, a.team));
        if (pd.gunSpin) { s.gunSpin = new THREE.Group(); s.gunSpin.position.copy(pd.gunSpinAt); const m = partMesh(pd.gunSpin, pd.gunSpinInk, a.team); m.position.copy(pd.gunSpinAt).negate(); s.gunSpin.add(m); s.hullG.add(s.gunSpin); }
        s.gunMuzzle = (pd.gunMuzzle || new THREE.Vector3(0, 0.7, 1.0)).clone();
        s.cannonMuzzle = (pd.cannonMuzzle || new THREE.Vector3(0.5, 1.1, -0.2)).clone();
        s.seatY = pd.seatAt ? pd.seatAt.y : 0.95;
        if (pd.ballBody) {
          const R = pd.ballR || 0.95, m = partMesh(pd.ballBody, pd.ballInk, a.team);
          m.position.y = -R;
          s.ball = new THREE.Group(); s.ball.position.y = R; s.ball.add(m); s.ball.visible = false; s.rig.add(s.ball);
        }
      } else {
        s.hullG.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.6).translate(0, 0.55, 0), getInkMaterial(a.color)));
        s.gunMuzzle = new THREE.Vector3(0, 0.7, 1.0); s.cannonMuzzle = new THREE.Vector3(0.5, 1.1, -0.2);
      }
      if (!s.ball) { s.ball = new THREE.Mesh(this.sphereGeo, getInkMaterial(a.color)); s.ball.scale.setScalar(0.95); s.ball.position.y = 0.95; s.ball.visible = false; s.rig.add(s.ball); }
      this._add(s.rig);
      s.loop = null;   // sfx-cues: the rig's walk / roll loops come from src/audio/cues.js
      G.fx?.explosion(_v.copy(a.pos).setY(a.pos.y + 0.6), a.color, 1.5);
    },
    weapon(a, s, dt, inp) {
      const d = s.def;
      // swim = roll into an armoured ball (fast, can't shoot)
      const roll = !!a.intent.squid;
      if (roll !== s.roll) {
        s.roll = roll;
        s.speed = roll ? d.rollSpeed : d.speed;
        s.loop = null;   // sfx-cues: src/audio/cues.js swaps the walk / roll loops
      }
      // the hull turns slowly toward the aim (shots go where the hull points, not where you look)
      const hs = Math.hypot(a.vel.x, a.vel.z);
      const want = roll ? (hs > 0.8 ? Math.atan2(a.vel.x, a.vel.z) : s.hull) : a.aimYaw;
      const rate = (roll ? 8 : d.turnRate) * dt;
      s.hull += clamp(angleDiff(s.hull, want), -rate, rate);
      s.faceYaw = s.hull;
      if (roll) return true;
      s.gcd -= dt; s.ccd -= dt;
      const pitch = clamp(a.aimPitch, -0.4, 0.5);
      const cp = Math.cos(pitch);
      if (inp.fire) {
        s.firing = 0.3;
        let guard = 0;
        while (s.gcd <= 0 && guard++ < 3) {
          s.gcd += d.gunInterval;
          const m = IMPL.crab.local(a, s, s.gunMuzzle, _v);
          const sp = (Math.random() - 0.5) * 2 * d.gunSpread * Math.PI / 180, sp2 = (Math.random() - 0.5) * d.gunSpread * Math.PI / 180;
          const dir = _v2.set(Math.sin(s.hull + sp) * cp, Math.sin(pitch + sp2), Math.cos(s.hull + sp) * cp);
          G.projectiles.fireCustom(a, m, dir, { type: 'shot', speed: d.gunSpeed, damage: d.gunDamage, range: d.gunRange, straight: 0.4, radius: 0.55, trailEvery: 1.6, trailRadius: 0.35, weaponId: 'crab' });
          if (hearable(a) && G.time - s.sndT > 0.06) { s.sndT = G.time; play('crab_gatling', { pos: a.isLocal ? undefined : m, volume: a.isLocal ? 0.45 : 0.3 }); }
        }
      } else if (s.gcd < 0) s.gcd = 0;
      const subPress = inp.sub && !s.subWas; s.subWas = inp.sub;
      if (subPress && s.ccd <= 0) {
        s.ccd = d.cannonGap;
        const m = IMPL.crab.local(a, s, s.cannonMuzzle, _v).clone();
        const lp = clamp(a.aimPitch + 0.45, 0.1, 1.0);
        const vel = new THREE.Vector3(Math.sin(s.hull) * Math.cos(lp), Math.sin(lp), Math.cos(s.hull) * Math.cos(lp)).multiplyScalar(d.cannonSpeed);
        this._spawn(a, new Shell(this, a, m, vel), 'sh', [...v3(m), ...v3(vel)]);
        if (hearable(a)) play('crab_cannon', { pos: a.isLocal ? undefined : m, volume: 0.9 });
        emit('shake', { pos: a.pos.clone(), amount: 0.25 });
        rumble(a, 0.5, 0.4, 140);
      }
      return true;
    },
    // a point in the hull's frame → world
    local(a, s, p, out) {
      const c = Math.cos(s.hull), sn = Math.sin(s.hull);
      return out.set(a.pos.x + p.x * c + p.z * sn, a.pos.y + p.y, a.pos.z - p.x * sn + p.z * c);
    },
    tick(a, s, dt) {
      const hs = Math.hypot(a.vel.x, a.vel.z);
      s.rig.position.set(a.pos.x, a.pos.y + (a.smoothY || 0), a.pos.z);
      s.hullG.rotation.y = s.hull;
      s.hullG.visible = !s.roll;
      s.ball.visible = s.roll;
      a.character.setVisible(!s.roll);
      s.seat = s.roll ? 0 : s.seatY;
      if (s.roll) {
        s.rollAng += (hs / 0.95) * dt;
        s.ball.rotation.set(s.rollAng, Math.atan2(a.vel.x, a.vel.z), 0, 'YXZ');
        if (a.grounded && hs > 2) { s.legT += dt; if (s.legT > 0.08) { s.legT = 0; paint(a, _v.copy(a.pos).setY(a.pos.y + 0.2), 0.9, a.team); } }
      } else {
        s.legT += dt * (1 + hs * 2.2);
        for (const L of s.legs || []) L.g.rotation.x = Math.sin(s.legT * 5 + L.i * 1.7) * 0.28 * Math.min(1, hs / 1.5);
        if (s.gunSpin) s.gunSpin.rotation.z += dt * (s.firing > 0 ? 40 : 2);
      }
      s.loop?.set?.({ volume: Math.min(1, hs / (s.roll ? 6 : 2)) * (a.isLocal ? 0.5 : 0.35), pitch: 0.8 + hs * 0.08, pos: a.isLocal ? undefined : a.pos });
      if (s.hp <= 0) this.end(a, 'broken');
    },
    hurt(a, s, amount, attacker) {
      const d = s.def;
      let toRider = false;
      if (!s.roll && attacker && attacker !== a) {
        const rx = attacker.pos.x - a.pos.x, rz = attacker.pos.z - a.pos.z, rl = Math.hypot(rx, rz) || 1;
        const front = (rx * Math.sin(s.hull) + rz * Math.cos(s.hull)) / rl;
        toRider = front < -0.45 || attacker.pos.y > a.pos.y + 2.4;     // from behind or from above
      }
      if (toRider) return amount;
      s.hp -= amount * (s.roll ? d.rollArmor : 1);
      this._hitFlash(a);
      if (near(a.pos) && G.time - (s.pingT || 0) > 0.08) { s.pingT = G.time; play('crab_hit', { pos: a.isLocal ? undefined : a.pos, volume: 0.5 }); }
      return 0;
    },
    end(a, s, reason) {
      s.loop?.stop?.(0.15);
      this._remove(s.rig);
      a.hitR = undefined; a.hitH = undefined; s.seat = 0;
      a.character.weaponHidden = false;
      if (a.character.weapon?.pivot) a.character.weapon.pivot.visible = true;
      if (a.character.weapon?.left?.pivot) a.character.weapon.left.pivot.visible = true;
      if (a.alive) a.character.setVisible(true);
      if (reason === 'broken' || reason === 'time') {
        if (near(a.pos)) play('crab_break', { pos: a.isLocal ? undefined : a.pos, volume: 0.8 });
        G.fx?.explosion(_v.copy(a.pos).setY(a.pos.y + 0.8), a.color, 1.8);
      }
      if (a.alive) { a.vel.y = 5; a.grounded = false; }
    },
  },
};

// ================================================================================================ online ghosts
// A remote player's special on this screen (see the note at the top): what differs from IMPL. start (default: IMPL's
// start — kept only where it's visual, or harmless on a squidkid the network moves), tick (visuals per frame; runs
// muted), event (the owner's moments, [4, what, …]). Nothing here decides a hit.
const GHOST = {
  strike: { start(a) { a.character.trigger('throw'); } },                 // (aiming is the owner's; its missile arrives)
  sonar: { start: IMPL.sonar.start },                                      // (the reveal is everyone's)
  wail: {
    start(a, s) { IMPL.wail.start.call(this, a, s); if (s.guide) s.guide.visible = false; },   // (the aim guide is the owner's)
    tick(a, s, dt) { IMPL.wail.tick.call(this, a, s, dt); if (s.guide) s.guide.visible = false; },
  },
  kraken: {
    tick(a, s) {
      const b = s.body3;
      if (!b) return;
      b.position.set(a.pos.x, a.pos.y + (a.smoothY || 0), a.pos.z);
      b.rotation.y = a.yaw;
      const sq = a.grounded ? 1 + Math.sin(s.t * 14) * 0.04 * Math.min(1, Math.hypot(a.vel.x, a.vel.z) / 4) : clamp(1 + a.vel.y * 0.025, 0.8, 1.25);
      b.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    },
  },
  jetpack: {
    tick(a, s, dt) {
      s.fx = (s.fx || 0) - dt;
      const tg = a.character.tank?.group;
      if (s.fx <= 0 && tg && near(a.pos, 30)) {
        s.fx = 0.05;
        for (const n of s.nozzles || []) G.fx?.burst(tg.localToWorld(_v.copy(n)), DOWN, a.color, { count: 2, speed: 4, size: 0.07, ring: false, mist: false });
      }
      s.loop?.set?.({ pos: a.pos });
    },
  },
  stamp: {
    event(a, s, d) {
      if (d[1] !== 'sl') return;
      const at = V(d, 2);
      if (near(at, 40)) { G.fx?.explosion(_v2.copy(at).setY(at.y + 0.3), a.color, d[5]); play('stamp_slam', { pos: at, volume: 0.85 }); }
    },
  },
  booyah: {
    start(a, s) { IMPL.booyah.start.call(this, a, s); s.raise = true; },   // (arm up, the orb overhead)
    tick(a, s, dt) { if (!s.netCharge) s.charge = Math.min(1, s.t / s.def.charge); IMPL.booyah.tick.call(this, a, s, dt); },
  },
  zipcaster: {
    tick: IMPL.zipcaster.tick,   // aura + tether (the zip itself is the owner's movement)
    event(a, s, d) {
      if (d[1] === 'zf') {
        s.zip = { anchor: V(d, 2) }; s.anchor = s.zip.anchor; s.hang = 0;
        if (near(s.anchor, 40)) play('zip_latch', { pos: s.anchor, volume: 0.8 });
        if (hearable(a)) play('zip_pull', { pos: a.pos, volume: 0.7 });
      } else if (d[1] === 'zm') s.miss = { to: V(d, 2), t: 0.2 };
      else if (d[1] === 'zi') {
        const c = V(d, 2);
        s.zip = null; s.hang = d[5] ? s.def.hang : 0;
        G.fx?.explosion(c, a.color, s.def.impactRadius);
        G.cues?.one('zip_impact', { at: c, owner: a, kind: 'boom', vol: 0.6, range: 40 });   // sfx-cues
        emit('shake', { pos: c.clone(), amount: 0.35 });
      }
    },
  },
  crab: {
    tick(a, s, dt) {
      const N = s.net;
      if (N) {
        s.hull += angleDiff(s.hull, N.hull) * Math.min(1, dt * 15);
        if (N.roll !== s.roll) {
          s.roll = N.roll;
          s.loop = null;   // sfx-cues: src/audio/cues.js swaps the walk / roll loops
        }
        if (N.firing) s.firing = 0.3;
      }
      s.faceYaw = s.hull;
      IMPL.crab.tick.call(this, a, s, dt);
    },
  },
};

// the owner's special pose state beyond the actor tick (packActor) → the ghost's (applyRemote)
export function specialNetState(a) {
  const s = a.specialActive;
  if (!s || s.ghost || !s.def) return 0;
  if (s.kind === 'crab') return (s.roll ? 1 : 0) | (s.firing > 0 ? 2 : 0) | ((Math.round((((s.hull % TAU) + TAU) % TAU) / TAU * 255) & 255) << 2);
  if (s.kind === 'booyah') return Math.round(clamp(s.charge || 0, 0, 1) * 63);
  return 0;
}
export function specialNetApply(a, v) {
  const s = a.specialActive;
  if (!s || !s.ghost) return;
  if (s.kind === 'crab') s.net = { roll: !!(v & 1), firing: !!(v & 2), hull: ((v >> 2) & 255) / 255 * TAU };
  else if (s.kind === 'booyah') { s.netCharge = true; s.charge = (v & 63) / 63; }
}

KIT_GHOSTS.sp = { ghost: (a, d) => G.specials?.netGhost(a, d), netHurt: (gid, dmg) => G.specials?.netHurtObj(gid, dmg) };
