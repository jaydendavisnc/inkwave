// Waddle Bomb (kit sub 'waddle') — see kits/registry.js.
//
// Thrown in an arc. When it lands it shows a sensing circle (senseRadius). If a foe is inside that circle, either at
// once or at any point during the short fuse, the bomb stands up and waddles after them. It is a little legged bomb
// that turns freely and follows its foe along the nav graph: it walks, steps off ledges and hops up steps, and it never
// walks into the sea. It keeps going for up to `life` s or `maxTravel` m, and goes off when it reaches a foe
// (triggerDist) or runs out. If nobody is near when it lands, it blows where it sits after `fuse`, like a Cling Charge.
// It lays no ink while walking and pays no mind to enemy ink. It patters and beeps the whole time it tracks (a
// positional loop), so its foe hears it coming, and the path it takes gives away where they're hiding. Enemy fire or
// an enemy blast pops it harmlessly (`hp`).
// [sub-tweaks] Reaching its foe (or giving up) it doesn't burst at once: it stops and winds up for `delay` s — rocks,
// swells, its lamp strobing, its blast radius on the floor with a beep pulse quickening (the Splat Bomb's danger ring), its
// own alarm (cues.js SUB_CUE.waddle.warn) — so a foe who reacts can get
// clear; the blast then hits whoever is still in it. (Still shoot-able while it winds up.)
//
// Events: 'sub:use' { actor, kind }, 'sub:land' { kind, pos, team, radius }, 'sub:lock' { kind, pos, team, actor, target },
// 'sub:arm' { kind, pos, team, radius } (its windup), 'bomb:explode' { actor, pos, team, radius, kind }, 'sub:destroyed' { kind, pos, team }.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, emit, clamp, lerp, angleDiff } from '../../core/ctx.js';
import { PLAYER, SUBS, subViewScale } from '../../config.js';
import { SUB_KITS, netRec, netId, netHurt, netMuted, ghostMute } from './registry.js';
import { registerSubModel, GEO_KIT } from '../character-weapons.js';
import { superEllipsoid, lathe, smoothProfile, sweep } from '../character-geo.js';
import { getPlasticMaterial, getInkMaterial } from '../character-mats.js';
import { Physics, Hit } from '../physics.js';
import { THROWN } from '../bots.js';
import { SUB_ICONS } from '../../ui/ui-icons.js';
import { SFX } from '../../audio/audio.js';

const { Parts, C, M, at, screw, decal, squidShape, wrapLathe, profR, orient } = GEO_KIT;
const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0), DOWN = new V3(0, -1, 0);
const _v = new V3(), _v2 = new V3(), _v3 = new V3(), _goal = new V3(), _c = new V3();
const _hit = new Hit(), _hit2 = new Hit();
const _res = { t: 0, dist: 0 };
const GRAV = 24;
const WSCALE = 1.8;               // hand-scale model → world (≈0.4 m tall with its antenna) — [sub-view] drawn × it.vs
const MID = 0.11 * WSCALE;        // world height of the body's middle (it tumbles about it in flight); the bots' aim point
                                  // (threatOf aimY) and the shot hitbox keep this built size: the drawn middle is MID × vs
const r2 = (x) => Math.round(x * 100) / 100;
const STRIDE = 5.5;               // stride cycles per second at full walking speed (two steps each)

// ================================================================================================= model
// Prop space: origin between the feet on the ground, +Y up, +Z forward. An egg-shaped bomb: a cream lower bowl, a dark
// equator band, and a team-ink dome with a dark visor and two green sensor eyes. It has an antenna with a red beacon
// lamp, little cream wing nubs, and a D-handle on its back (the fist's handle). Two stubby dark legs end in big cream
// feet. The legs are separate parts so the thrown one can waddle.
const L = 0.012;                                   // the body sits this much higher so the legs show
const HIP = [new V3(0.03, 0.058, 0.004), new V3(-0.03, 0.058, 0.004)];
const LAMP = new V3(0, 0.2195, 0);
const lift = (pts) => pts.map(([r, y]) => [r, y + L]);
function waddleBody(withLamp) {
  const P = new Parts(), I = new Parts();
  const bowlP = smoothProfile(lift([[0.022, 0.0365], [0.045, 0.044], [0.058, 0.058], [0.0635, 0.077], [0.0645, 0.094]]), 8);
  P.add(lathe([[0, 0.036 + L]].concat(bowlP, [[0, 0.094 + L]]), 32), C.cream, M.satin);
  P.add(lathe(lift([[0, 0.092], [0.0652, 0.092], [0.0668, 0.0955], [0.0668, 0.1005], [0.0652, 0.104], [0, 0.104]]), 32), C.dark, M.gloss);
  const domeP = smoothProfile(lift([[0.0645, 0.102], [0.0635, 0.118], [0.058, 0.138], [0.047, 0.157], [0.03, 0.171], [0, 0.1765]]), 10);
  I.add(lathe([[0, 0.102 + L]].concat(domeP), 32));
  for (let k = 0; k < 4; k++) { const az = Math.PI / 4 + k * Math.PI / 2; screw(P, new V3(Math.sin(az) * 0.0669, 0.098 + L, Math.cos(az) * 0.0669), new V3(Math.sin(az), 0, Math.cos(az)), 0.0026); }
  // visor + two green sensor eyes
  const vy = 0.132 + L, r0 = profR(domeP, vy);
  P.add(wrapLathe(superEllipsoid(0.034, 0.0128, 0.0034, 0.5, 0.55, 14, 8), domeP, 0, vy), C.dark, M.gloss);
  for (const s of [1, -1]) {
    const az = s * 0.25, n = new V3(Math.sin(az), 0.2, Math.cos(az)).normalize();
    const p = new V3(Math.sin(az) * (r0 + 0.003), vy + 0.0005, Math.cos(az) * (r0 + 0.003));
    P.add(orient(superEllipsoid(0.0068, 0.0034, 0.0068, 1, 1, 20, 8), n, p), C.green, M.led);
    // a glint on each eye (up and toward the middle)
    P.add(orient(superEllipsoid(0.0018, 0.001, 0.0018, 1, 1, 10, 5), n, p.clone().addScaledVector(n, 0.0026).add(new V3(-s * 0.0022 * Math.cos(az), 0.0024, s * 0.0022 * Math.sin(az)))), C.white, M.led);
  }
  // squid decal on the belly, wing nubs on the flanks
  P.add(wrapLathe(decal(squidShape(0.024)), bowlP, 0, 0.066 + L, 0.0004), C.dark, M.print);
  for (const s of [1, -1]) { const w = superEllipsoid(0.0058, 0.024, 0.016, 0.7, 0.8, 8, 8); w.rotateZ(s * 0.32); P.add(at(w, s * 0.0645, 0.082 + L, -0.004), C.cream, M.gloss); }
  // antenna: dark boss, metal whip, (red beacon lamp)
  P.add(lathe(lift([[0, 0.172], [0.0088, 0.172], [0.0094, 0.1762], [0.0064, 0.1795], [0, 0.18]]), 12), C.dark, M.gloss);
  P.add(lathe(lift([[0, 0.178], [0.0026, 0.178], [0.0022, 0.2045], [0, 0.2055]]), 8), C.metal, M.metal);
  if (withLamp) P.add(at(lampGeo(), LAMP.x, LAMP.y, LAMP.z), C.red, M.led);
  // D-handle on the back (dark loop, rubber sleeve on its upright)
  const th = sweep(lift([[0.07, -0.05], [0.072, -0.071], [0.083, -0.0855], [0.1, -0.089], [0.117, -0.0855], [0.128, -0.071], [0.13, -0.05]].map(([y, z]) => [z, y])).map(([z, y]) => new V3(0, y, z)), {
    seg: 18, radial: 7, capSteps: 2, radius: () => 0.0062, flat: 1.25, outward: (Pp, o) => o.set(1, 0, 0),
  });
  P.add(th.geo, C.dark, M.satin);
  const sl = []; for (let k = 0; k <= 6; k++) sl.push(th.curve.getPointAt(0.36 + k * 0.047));
  P.add(sweep(sl, { seg: 12, radial: 8, capSteps: 2, radius: (t) => 0.0102 + 0.0006 * Math.cos(t * Math.PI * 10), flat: 1.05, outward: (Pp, o) => o.set(1, 0, 0) }).geo, C.rubber, M.rubber);
  return { P, I };
}
function lampGeo() { return superEllipsoid(0.0074, 0.0074, 0.0074, 1, 1, 12, 8); }
// one leg at rest (s = +1 right / −1 left): hip ball, shin, a big cream foot with a rubber sole
function waddleLeg(s) {
  const P = new Parts(), h = HIP[s > 0 ? 0 : 1];
  P.add(at(superEllipsoid(0.0115, 0.0115, 0.0115, 1, 1, 12, 8), h.x, h.y, h.z), C.dark, M.gloss);
  P.add(at(lathe([[0, 0], [0.0079, 0], [0.0083, 0.004], [0.0076, 0.043], [0, 0.044]], 10), h.x, 0.012, h.z + 0.001), C.dark, M.satin);
  P.add(at(superEllipsoid(0.0175, 0.0072, 0.027, 0.5, 0.6, 12, 6), h.x + s * 0.002, 0.0086, 0.013), C.cream, M.gloss);
  P.add(at(superEllipsoid(0.017, 0.0028, 0.0265, 0.4, 0.55, 12, 4), h.x + s * 0.002, 0.0028, 0.013), C.rubber, M.rubber);
  for (const dx of [-0.007, 0.007]) P.add(at(superEllipsoid(0.0022, 0.0012, 0.009, 0.6, 0.6, 5, 4), h.x + s * 0.002 + dx, 0.0156, 0.028), C.bone, M.satin);   // toe creases
  return P.build();
}
registerSubModel('waddle', () => {
  const b = waddleBody(true);
  return { kind: 'waddle', body: mergeGeometries([b.P.build(), waddleLeg(1), waddleLeg(-1)], false), ink: b.I.build(),
    grip: { pos: new V3(0, 0.1 + L, -0.089), handZ: new V3(0, -1, 0), handY: new V3(-0.3, -0.1, -1) } };
});
let WG = null;   // world geometry (legs re-centred on their hips, lamp separate), built once
function worldGeo() {
  if (!WG) {
    const b = waddleBody(false);
    WG = { body: b.P.build(), ink: b.I.build(), legs: [1, -1].map((s, i) => waddleLeg(s).translate(-HIP[i].x, -HIP[i].y, -HIP[i].z)), lamp: lampGeo() };
  }
  return WG;
}
// outer (at the feet, yaw = heading) → rock (waddle roll about the feet) → tilt (tumble about the middle) → model
// ([sub-view] vs: SUB_VIEW_SCALE.waddle — the model and its middle drawn that much bigger, feet still on the floor)
function makeMesh(team, vs = 1) {
  const g = worldGeo(), col = G.teamColors[team];
  const outer = new THREE.Group(), rock = new THREE.Group(), tilt = new THREE.Group(), model = new THREE.Group();
  tilt.position.y = MID * vs; model.position.y = -MID * vs; model.scale.setScalar(WSCALE * vs);
  const body = new THREE.Mesh(g.body, getPlasticMaterial()); body.castShadow = true;
  const ink = new THREE.Mesh(g.ink, getInkMaterial(col)); ink.castShadow = true;
  const legs = g.legs.map((geo, i) => { const pv = new THREE.Group(); pv.position.copy(HIP[i]); const m = new THREE.Mesh(geo, getPlasticMaterial()); m.castShadow = true; pv.add(m); model.add(pv); return pv; });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x3a0806, emissive: 0xff2a1a, emissiveIntensity: 0.3, roughness: 0.3 });
  const lamp = new THREE.Mesh(g.lamp, lampMat); lamp.position.copy(LAMP);
  model.add(body, ink, lamp);
  tilt.add(model); rock.add(tilt); outer.add(rock);
  return { outer, rock, tilt, model, legs, lamp, lampMat };
}

// ---- the sensing circle: a team-coloured rim, a dashed inner ring, a radar sweep and a pulse; `uGrow` 0..1 opens it
const RING_GEO = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const RING_VS = `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FS = `
  uniform vec3 uColor; uniform float uTime; uniform float uAlpha; uniform float uGrow; uniform float uLock; uniform float uSweep;
  varying vec2 vUv;
  void main(){
    float r = length(vUv) / max(uGrow, 0.001);
    if (r > 1.03) discard;
    float ang = atan(vUv.y, vUv.x);
    float rim = smoothstep(0.03, 0.008, abs(r - 0.965));
    float dark = smoothstep(0.024, 0.0, abs(r - 1.0));
    float dash = step(0.5, fract(ang / 6.2831853 * 36.0 - uTime * 0.6)) * smoothstep(0.018, 0.005, abs(r - 0.9));
    float sw = fract(ang / 6.2831853 + uTime * 0.7);
    float wedge = pow(sw, 8.0) * step(r, 0.965) * (0.25 + 0.75 * r) * 0.6 * uSweep;
    float ph = fract(uTime * 1.3);
    float wave = smoothstep(0.04, 0.0, abs(r - ph * 0.96)) * (1.0 - ph) * 0.55 * uSweep;
    float fill = (0.07 + 0.25 * uLock) * step(r, 0.965);
    float a = max(max(rim, dash * 0.75), max(max(wedge, wave), fill));
    vec3 col = mix(uColor, vec3(1.0), rim * 0.3 + wedge * 0.25 + uLock * 0.45);
    col = mix(col, vec3(0.03), dark * 0.7); a = max(a, dark * 0.45);
    gl_FragColor = vec4(col, a * uAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
function makeRing(col, alpha = 1) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: col.clone() }, uTime: { value: 0 }, uAlpha: { value: alpha }, uGrow: { value: 0 }, uLock: { value: 0 }, uSweep: { value: 1 } },
    vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const m = new THREE.Mesh(RING_GEO, mat); m.renderOrder = 3; m.frustumCulled = false;
  return m;
}

// ================================================================================================= icon + sounds
{
  const K = '#15121c', DK = '#2b2735', LT = '#e4e8ef';
  const O = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  // front view: team dome with a dark visor and green eyes, cream bowl, wing nubs, big feet, antenna lamp, sensing arcs
  SUB_ICONS.waddle = `<svg class="iw-ico " viewBox="0 0 64 64" aria-hidden="true">
    <g fill="none" stroke="${K}" stroke-width="6.5" stroke-linecap="round"><path d="M8 17 Q2.5 25 4 34 M56 17 Q61.5 25 60 34"/></g>
    <g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M8 17 Q2.5 25 4 34 M56 17 Q61.5 25 60 34"/></g>
    <g ${O}>
      <path d="M32 13 L32 7" fill="none"/>
      <path d="M13.5 58.5 Q13.5 51.5 20.5 51.5 L27 51.5 Q29.5 51.5 29.5 54.5 L29.5 58.5 Z" fill="${LT}"/>
      <path d="M50.5 58.5 Q50.5 51.5 43.5 51.5 L37 51.5 Q34.5 51.5 34.5 54.5 L34.5 58.5 Z" fill="${LT}"/>
      <path d="M14 34 Q7.5 39 9.5 46.5 Q14.5 45 16 38.5 Z" fill="${LT}"/>
      <path d="M50 34 Q56.5 39 54.5 46.5 Q49.5 45 48 38.5 Z" fill="${LT}"/>
      <path d="M13.5 32 L50.5 32 Q50.5 52.5 32 52.5 Q13.5 52.5 13.5 32 Z" fill="${LT}"/>
      <path d="M13.5 32 Q13.5 12.5 32 12.5 Q50.5 12.5 50.5 32 Z" fill="currentColor"/>
      <rect x="11.5" y="30" width="41" height="5.5" rx="2.5" fill="${DK}"/>
      <rect x="20" y="19" width="24" height="9.5" rx="4.7" fill="${DK}"/>
      <circle cx="32" cy="5.5" r="3.5" fill="#ff3b30" stroke-width="2.4"/>
    </g>
    <circle cx="26.5" cy="23.7" r="2.4" fill="#3dff7a"/><circle cx="37.5" cy="23.7" r="2.4" fill="#3dff7a"/>
    <path d="M17.5 25 Q18.5 18.5 24 15.5" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round"/>
  </svg>`;
}
// landing: a plasticky clonk and a power-up chirp
SFX.waddle_land = {
  gain: 0.34, max: 3, jitter: 0.04, reverb: 0.06,
  build(v, p) {
    v.tone({ f: 300 * p, f1: 150 * p, sw: 0.05, a: 0.001, d: 0.07, peak: 0.5 });
    v.nz({ f: 1600, q: 1.5, a: 0.0005, d: 0.03, peak: 0.3 });
    v.tone({ t: 0.09, type: 'square', f: 880 * p, f1: 1760 * p, sw: 0.09, a: 0.003, d: 0.09, peak: 0.12, to: v.filter('lowpass', 3000, 0.8, v.out) });
  },
};
// target acquired: "bi-DEEP!"
SFX.waddle_lock = {
  gain: 0.3, max: 3, jitter: 0, reverb: 0.08, minGap: 0.1,
  build(v, p) {
    const lp = v.filter('lowpass', 4200, 0.8, v.out);
    v.tone({ type: 'square', f: 1320 * p, a: 0.002, h: 0.05, d: 0.03, peak: 0.2, to: lp });
    v.tone({ t: 0.08, type: 'square', f: 1760 * p, a: 0.002, h: 0.08, d: 0.05, peak: 0.22, to: lp });
    v.tone({ t: 0.08, f: 1760 * p, a: 0.002, h: 0.08, d: 0.06, peak: 0.25 });
  },
};
// hopping up a step
SFX.waddle_hop = {
  gain: 0.26, max: 3, jitter: 0.06, reverb: 0.04, minGap: 0.08,
  build(v, p) { v.tone({ f: 420 * p, f1: 980 * p, sw: 0.1, a: 0.002, d: 0.11, peak: 0.4 }); v.nz({ f: 1400, f1: 2600, sw: 0.08, q: 1.5, a: 0.01, d: 0.06, peak: 0.15 }); },
};
// Walking (the whole time it tracks): tip-tap feet and a servo whirr on each step, and a "bip" beacon. pitch 1 is the
// base rate; walk() raises it (faster steps, quicker beeps) as it closes in. Gates are rectified sine LFOs.
function gateCurve(th) { const n = 256, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, y = Math.max(0, (x - th) / (1 - th)); c[i] = y * y; } return c; }
const GATE_STEP = gateCurve(0.45), GATE_BEEP = gateCurve(0.86);
SFX.waddle_walk = {
  gain: 0.36, max: 8, jitter: 0, reverb: 0.05, oneShot: 1.5,
  loop(v, p) {
    const T = v.t, ctx = v.ctx;
    const gate = (rate, curve, depth, param) => {
      const ws = ctx.createWaveShaper(); ws.curve = curve; v.nodes.push(ws);
      const d = v.gain(depth); ws.connect(d); d.connect(param);
      return v.osc('sine', rate, T, null, ws);
    };
    const step = STRIDE * 2;
    // feet: a bandpassed tick + a small hollow "tok", once per step
    const tap = v.gain(0, v.out);
    v.noise('white', T, null, v.filter('bandpass', 2600, 2.4, tap));
    const tok = v.gain(0, v.out);
    v.osc('triangle', 520, T, null, v.filter('lowpass', 1400, 0.8, tok));
    const so = gate(step * p, GATE_STEP, 0.55, tap.gain);
    const so2 = gate(step * p, GATE_STEP, 0.4, tok.gain);
    // servo whirr riding the steps
    const wh = v.gain(0.0, v.out), wbp = v.filter('bandpass', 1100, 3, wh);
    v.osc('sawtooth', 140 * p, T, null, wbp);
    const so3 = gate(step * p, GATE_STEP, 0.09, wh.gain);
    // the beacon: a clean high "bip"
    const bip = v.gain(0, v.out);
    const bo = v.osc('sine', 1650, T, null, bip);
    const bg = gate(1.7 * p, GATE_BEEP, 0.3, bip.gain);
    return {
      pitch(q, now) {
        for (const o of [so, so2, so3]) o.frequency.setTargetAtTime(step * q, now, 0.05);
        bg.frequency.setTargetAtTime(1.7 * q * q, now, 0.05);
        bo.frequency.setTargetAtTime(1650 * Math.sqrt(q), now, 0.05);
      },
    };
  },
};

// ================================================================================================= the bomb
// Bots lob it at their foe: the aim pitch that lands a throw (throwVelocity: pitch + 0.28 rad, +1.5 m/s up, released
// 1.35 m up, gravity 24) d m out and dy above the thrower's feet; null if it can't reach (as bots.js lobPitch).
function lobPitch(d, dy, speed) {
  let best = null, be = Infinity;
  for (let p = -0.5; p <= 0.75; p += 0.025) {
    const tp = clamp(p + 0.28, -0.3, 1.1), vx = Math.cos(tp) * speed, vy = Math.sin(tp) * speed + 1.5, disc = vy * vy + 48 * (1.35 - dy);
    if (disc < 0) continue;
    const e = Math.abs((vx * (vy + Math.sqrt(disc))) / 24 - d);
    if (e < be) { be = e; best = p; }
  }
  return be < 1.2 ? best : null;
}
function botLob(a, sub, short) {
  const b = a.bot, t = b?.target;
  if (!t || !t.alive || b.mode !== 'fight') return;
  const tx = t.pos.x + t.vel.x * 0.5, tz = t.pos.z + t.vel.z * 0.5;          // lead it by about the flight time
  const p = lobPitch(Math.max(1.5, Math.hypot(tx - a.pos.x, tz - a.pos.z) - short), t.pos.y - a.pos.y, sub.throwSpeed);
  if (p == null) return;
  a.aimYaw = Math.atan2(tx - a.pos.x, tz - a.pos.z); a.aimPitch = p;
}
const items = [];
function use(subs, a, sub) {
  if (a.bot) botLob(a, sub, 2);         // land it just short of the foe: it walks the rest
  const pos = a.pos.clone(); pos.y += 1.35;
  const vel = G.projectiles.throwVelocity(a, sub.throwSpeed, new V3());
  const it = spawn(a, sub, pos, vel, false, netId(a));
  netRec(a, 'waddle', [0, it.gid, r2(pos.x), r2(pos.y), r2(pos.z), r2(vel.x), r2(vel.y), r2(vel.z)]);
  G.cues?.sub('waddle', 'throw', { owner: a, at: a.pos });   // sfx-cues: its own throw (src/audio/cues.js)
  emit('sub:use', { actor: a, kind: 'waddle' });
}
// Online, a remote player's Waddle is a ghost: it flies and lands the same, but it never picks a foe, walks or goes
// off by itself — its owner's records drive it: [3, gid, foe nid, x, y, z] a lock, [4, gid, x, y, z, heading, foe nid]
// its walk (10 a second), [5, gid, x, y, z] its windup, [1, gid, x, y, z] the blast, [2, gid, popped] an end without
// one. Hits on a ghost go to the owner (netHurt).
function spawn(a, sub, pos, vel, ghost, gid) {
  const vs = subViewScale('waddle');   // [sub-view]
  const m = makeMesh(a.team, vs);
  m.outer.position.copy(pos).setY(pos.y - MID * vs);
  m.outer.rotation.y = a.aimYaw;
  G.scene.add(m.outer);
  const it = { owner: a, team: a.team, sub, m, pos, vel, state: 'fly', t: 0, age: 0, hp: sub.hp, sp: !!a.specialActive,
    heading: a.aimYaw, target: null, path: null, pi: 0, repath: 0, travel: 0, walkT: 0, lostT: 0, air: false, hop: null, phase: 0,
    prog: { t: 0, x: 0, z: 0 }, ring: null, ringT: 0, loop: null, noisy: false, blink: 0, spin: new V3(2 + Math.random() * 3, 0, 2 + Math.random() * 3),
    ghost, gid, net: null, sendT: 0, vs };
  items.push(it);
  return it;
}
const byNid = (n) => (n >= 0 ? G.actors.find((e) => e.nid === n) || null : null);
function ghost(a, d) {
  if (!Array.isArray(d)) return;
  const [op, gid] = d;
  if (op === 0) {
    if (items.some((x) => x.gid === gid)) return;
    spawn(a, SUBS.waddle, new V3(d[2], d[3], d[4]), new V3(d[5], d[6], d[7]), true, gid);
    G.cues?.sub('waddle', 'throw', { owner: a, at: a.pos });   // sfx-cues
    return;
  }
  const it = items.find((x) => x.ghost && x.gid === gid && x.state !== 'dead');
  if (!it) return;
  if (op === 3 || op === 4) {
    const [x, y, z] = op === 3 ? [d[3], d[4], d[5]] : [d[2], d[3], d[4]];
    if (it.state === 'fly') { it.pos.set(x, y, z); land(it, { point: it.pos.clone(), normal: UP }); }
    if (op === 3) { it.pos.set(x, y, z); if (it.state === 'sense') lock(it, byNid(d[2])); return; }
    if (it.state === 'sense') lock(it, byNid(d[6]));
    it.net = { x, y, z, h: d[5] };
    const T = byNid(d[6]); if (T) it.target = T;
  } else if (op === 5) { if (it.state !== 'prime') { it.pos.set(d[2], d[3], d[4]); prime(it, 'net'); } }
  else if (op === 1) { it.pos.set(d[2], d[3], d[4]); it.why = 'net'; blast(it); }
  else if (op === 2) { if (d[2]) pop(it); else it.state = 'dead'; }
}

function near(p, r) { const c = G.rig?.gameCam || G.camera; return !!c && c.position.distanceToSquared(p) < r * r; }
function credit(it, area) { if (it.sp) it.owner.addTurfNoSpecial(area); else it.owner.addTurf(area); }
const alive = (e) => e && e.alive && !e.superJumpState;
// the nearest foe inside the circle (horizontal senseRadius, within senseUp above / below)
function scan(it, R) {
  let best = null, bd = Infinity;
  for (const e of G.actors) {
    if (e.team === it.team || !alive(e)) continue;
    const d = Math.hypot(e.pos.x - it.pos.x, e.pos.z - it.pos.z);
    if (d > R || Math.abs(e.pos.y - it.pos.y) > it.sub.senseUp) continue;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// ---- flight: arcs like the other thrown subs; floors stop it, walls and ceilings bounce it
function fly(it, dt) {
  it.vel.y -= GRAV * dt;
  _v.copy(it.pos);
  it.pos.addScaledVector(it.vel, dt);
  const h = G.physics.segment(_v, it.pos, _hit);
  if (h.hit) {
    const n = h.normal;
    if (n.y > 0.6) return land(it, h);
    it.pos.copy(h.point).addScaledVector(n, 0.15);
    const vn = it.vel.dot(n);
    it.vel.addScaledVector(n, -vn * 1.45).multiplyScalar(0.55);
  }
  if (it.pos.y < PLAYER.waterY - 1.8) { it.why = 'sea'; plop(it); return; }
  it.m.outer.position.copy(it.pos).setY(it.pos.y - MID * it.vs);   // (the drawn middle on the flight path)
  it.m.tilt.rotation.x += it.spin.x * dt; it.m.tilt.rotation.z += it.spin.z * dt;
}
function plop(it) {
  if (near(it.pos, 40)) G.audio?.play('splat_small', { pos: it.pos, volume: 0.5, pitch: 0.7 });
  it.state = 'dead';
}
function land(it, h) {
  const s = it.sub;
  it.pos.copy(h.point);
  it.vel.set(0, 0, 0);
  it.state = 'sense'; it.t = 0;
  it.m.tilt.rotation.set(0, 0, 0);
  it.m.outer.position.copy(it.pos);
  const col = G.teamColors[it.team];
  it.ring = makeRing(col);
  it.ring.position.copy(it.pos).addScaledVector(h.normal, 0.03);
  it.ring.scale.setScalar(s.senseRadius);
  G.scene.add(it.ring);
  if (near(it.pos, 40)) {
    G.cues?.one('waddle_land', { at: it.pos, owner: it.owner, team: it.team, kind: 'land', sub: true, vol: 0.8 });   // sfx-cues: through the cue mix
    G.fx?.ring?.(it.pos, h.normal, col, { radius: 0.55, life: 0.3 });
  }
  emit('sub:land', { kind: 'waddle', pos: it.pos.clone(), team: it.team, radius: s.senseRadius });
}

// ---- sensing: the circle opens; a foe inside (now or before the fuse runs out) wakes it, else it blows where it sits
function sense(it, dt) {
  const s = it.sub, M_ = it.m;
  const tgt = it.ghost ? null : scan(it, s.senseRadius * Math.min(1, it.t / 0.3 + 0.35));
  if (tgt) return lock(it, tgt);
  const k = clamp(it.t / s.fuse, 0, 1);
  // looks around, lamp blinking faster, a nervous jitter at the end
  M_.outer.rotation.y = it.heading + Math.sin(it.t * 5) * 0.55 * (1 - k * 0.5);
  M_.rock.rotation.z = k > 0.6 ? (Math.random() * 2 - 1) * 0.06 * k : 0;
  blinkLamp(it, dt, lerp(0.45, 0.1, k), 2.5 + 3 * k);
  if (it.blinked) G.cues?.sub('waddle', 'beep', { owner: it.owner, team: it.team, at: it.pos, vol: 0.45 + 0.5 * k, pitch: 1 + 0.25 * k });   // sfx-cues: its own sensing bip
  if (it.t >= s.fuse && !it.ghost) { it.why = 'fuse'; blast(it); }
}
function lock(it, tgt) {
  if (!it.ghost) netRec(it.owner, 'waddle', [3, it.gid, tgt?.nid ?? -1, r2(it.pos.x), r2(it.pos.y), r2(it.pos.z)]);
  it.target = tgt; it.state = 'wake'; it.t = 0; it.ringT = 0; it.repath = 0;
  it.heading = it.m.outer.rotation.y;
  if (near(it.pos, 40)) {
    if (!G.cues?.allySub(it.owner, it.team)) G.audio?.play('waddle_lock', { pos: it.pos });   // (a teammate's: no arming sound — cues.js MIX allySub)
    G.fx?.glint?.(_v.copy(it.pos).setY(it.pos.y + 0.55 * it.vs), G.teamColors[it.team], 0.3);   // (over the drawn head)
  }
  emit('sub:lock', { kind: 'waddle', pos: it.pos.clone(), team: it.team, actor: it.owner, target: tgt });
}
// ---- waking: a little hop on the spot to face its foe ("!"), then off it goes
function wake(it, dt) {
  const T = it.target, M_ = it.m;
  if (alive(T)) it.heading += clamp(angleDiff(it.heading, Math.atan2(T.pos.x - it.pos.x, T.pos.z - it.pos.z)), -14 * dt, 14 * dt);
  else if (it.net) it.heading += clamp(angleDiff(it.heading, it.net.h), -14 * dt, 14 * dt);
  const u = clamp(it.t / 0.32, 0, 1);
  M_.outer.position.copy(it.pos); M_.outer.position.y += Math.sin(u * Math.PI) * 0.16 * it.vs;
  M_.outer.rotation.y = it.heading;
  M_.lampMat.emissiveIntensity = 4;
  it.noisy = true;
  if (it.t >= 0.32) { it.state = 'walk'; it.t = 0; it.prog.t = 0; it.prog.x = it.pos.x; it.prog.z = it.pos.z; }
}

// ---- walking after its foe
function repath(it) {
  const nav = G.nav, T = it.target;
  it.path = null; it.pi = 0;
  if (!nav || !T) return;
  const a = nav.nearest(it.pos, 0.8), b = nav.nearest(T.pos, 1.5);
  if (a < 0 || b < 0 || a === b) return;
  const p = nav.path(a, b, it.team, 2500, true);   // no climb edges: it can't swim up walls
  if (p && p.length > 1) { it.path = p; it.pi = 1; }
}
// where to head: the foe itself when close on the same level (or with no route), else the next node on the route
function goal(it) {
  const T = it.target, nav = G.nav;
  const dh = Math.hypot(T.pos.x - it.pos.x, T.pos.z - it.pos.z), dy = T.pos.y - it.pos.y;
  if ((dh < 2.2 && Math.abs(dy) < 0.8) || !it.path) { _goal.copy(T.pos); return null; }
  while (it.pi < it.path.length) {
    const n = nav.nodes[it.path[it.pi]];
    if (Math.hypot(n.x - it.pos.x, n.z - it.pos.z) < 0.45 && Math.abs(n.y - it.pos.y) < 0.6) it.pi++; else break;
  }
  if (it.pi >= it.path.length) { _goal.copy(T.pos); return null; }
  const n = nav.nodes[it.path[it.pi]];
  _goal.set(n.x, n.y, n.z);
  return n;
}
function walk(it, dt) {
  if (it.ghost) return follow(it, dt);
  const s = it.sub;
  it.walkT += dt;
  // lost its foe (splatted, super jumped away): the nearest other foe in range, else it goes off
  if (!alive(it.target)) {
    const nt = scan(it, s.senseRadius);
    if (nt) { it.target = nt; it.repath = 0; it.lostT = 0; }
    else if ((it.lostT += dt) > 0.5) return prime(it, 'lost');
  }
  const T = alive(it.target) ? it.target : null;
  // reached a foe (any foe) → boom
  _c.copy(it.pos); _c.y += 0.3;
  for (const e of G.actors) {
    if (e.team === it.team || !e.alive) continue;
    _v.copy(e.pos); _v.y += e.form === 'squid' ? 0.25 : 0.7;
    if (_v.distanceTo(_c) < s.triggerDist) return prime(it, 'reached');
  }
  if (it.walkT > s.life || it.travel > s.maxTravel) return prime(it, it.travel > s.maxTravel ? 'travel' : 'life');
  let moved = 0;
  if (it.hop) moved = hopStep(it, dt);
  else if (it.air) moved = fallStep(it, dt);
  else if (T) {
    if ((it.repath -= dt) <= 0) { it.repath = 0.35; repath(it); }
    const node = goal(it);
    const turn = angleDiff(it.heading, Math.atan2(_goal.x - it.pos.x, _goal.z - it.pos.z));
    it.heading += clamp(turn, -s.turnRate * dt, s.turnRate * dt);
    // the next node is a step up (a nav 'jump' edge): hop onto it
    if (node && node.y - it.pos.y > 0.45 && Math.hypot(node.x - it.pos.x, node.z - it.pos.z) < 1.35) { startHop(it, node); moved = hopStep(it, dt); }
    else moved = stepWalk(it, dt, s.speed * (Math.abs(turn) > 1.3 ? 0.45 : 1));
  }
  if (it.state === 'dead') return;
  it.travel += moved;
  // stuck (pressed into a wall, stopped at the water's edge with no way round): give up and go off
  it.prog.t += dt;
  if (it.prog.t > 1.4) {
    const pd = Math.hypot(it.pos.x - it.prog.x, it.pos.z - it.prog.z);
    if (pd < 0.4 && !it.hop && !it.air) return prime(it, 'stuck');
    it.prog.t = 0; it.prog.x = it.pos.x; it.prog.z = it.pos.z;
  }
  if ((it.sendT -= dt) <= 0) {   // online: where it is, for the ghosts on other screens
    it.sendT = 0.1;
    netRec(it.owner, 'waddle', [4, it.gid, r2(it.pos.x), r2(it.pos.y), r2(it.pos.z), r2(it.heading), T?.nid ?? -1]);
  }
  look(it, dt, moved, T);
}
// a ghost's walk: eased onto its owner's reported spot and heading
function follow(it, dt) {
  const N = it.net;
  let moved = 0;
  it.walkT += dt;
  if (N) {
    const x0 = it.pos.x, z0 = it.pos.z, k = 1 - Math.exp(-14 * dt);
    it.pos.x += (N.x - it.pos.x) * k; it.pos.y += (N.y - it.pos.y) * k; it.pos.z += (N.z - it.pos.z) * k;
    it.heading += angleDiff(it.heading, N.h) * k;
    moved = Math.hypot(it.pos.x - x0, it.pos.z - z0);
  }
  look(it, dt, moved, alive(it.target) ? it.target : null);
}
function look(it, dt, moved, T) {
  const s = it.sub, M_ = it.m;
  // ---- look: the waddle (alternating feet, a side-to-side roll, a forward lean), beacon blinking, noise
  const k = s.speed > 0 ? clamp(moved / (s.speed * dt + 1e-6), 0, 1.2) : 0;
  it.phase += dt * STRIDE * k;
  const sw = Math.sin(it.phase * Math.PI * 2);
  M_.legs[0].rotation.x = 0.6 * sw * k; M_.legs[1].rotation.x = -0.6 * sw * k;
  M_.legs[0].position.y = HIP[0].y + Math.max(0, -sw) * 0.009 * k; M_.legs[1].position.y = HIP[1].y + Math.max(0, sw) * 0.009 * k;
  M_.rock.rotation.set(-0.1 * k, 0, 0.17 * sw * k);
  M_.model.position.y = (-MID + Math.abs(sw) * 0.012 * k) * it.vs;
  if (!it.hop && !it.air) M_.outer.position.copy(it.pos);
  M_.outer.rotation.y = it.heading + 0.1 * sw * k;
  const close = T ? clamp(1 - Math.hypot(T.pos.x - it.pos.x, T.pos.z - it.pos.z) / s.senseRadius, 0, 1) : 0;
  blinkLamp(it, dt, lerp(0.55, 0.18, close), 3.5);
  noise(it, 1 + 0.45 * close);
}
// one step on the flat: slide along walls, snap onto the ground (steps ≤ 0.45 m), never onto open water
function stepWalk(it, dt, spd) {
  const hx = Math.sin(it.heading), hz = Math.cos(it.heading), step = spd * dt;
  let mx = hx * step, mz = hz * step;
  _v.copy(it.pos); _v.y += 0.42;
  const w = G.physics.raycast(_v, _v2.set(hx, 0, hz), step + 0.2, _hit);
  if (w.hit && Math.abs(w.normal.y) < 0.5) {
    const n = w.normal, dn = mx * n.x + mz * n.z;
    mx -= dn * n.x; mz -= dn * n.z;
    const l = Math.hypot(mx, mz);
    if (l > 1e-5) { const w2 = G.physics.raycast(_v, _v2.set(mx / l, 0, mz / l), l + 0.2, _hit2); if (w2.hit && Math.abs(w2.normal.y) < 0.5) { mx = 0; mz = 0; } }
  }
  const nx = it.pos.x + mx, nz = it.pos.z + mz, moved = Math.hypot(mx, mz);
  if (moved < 1e-6) return 0;
  const gy = G.level.groundHeight(nx, nz, it.pos.y + 0.45);
  if (gy === -Infinity) return 0;                                   // the sea / nothing ahead: stay on the deck
  if (gy < it.pos.y - 0.4) {                                        // off a ledge: drop down
    it.air = true; it.vel.set(mx / dt, 0.6, mz / dt);
    it.pos.x = nx; it.pos.z = nz;
    return moved;
  }
  it.pos.set(nx, gy, nz);
  return moved;
}
function fallStep(it, dt) {
  const x0 = it.pos.x, z0 = it.pos.z, y0 = it.pos.y;
  it.vel.y -= GRAV * dt;
  _v.copy(it.pos); _v.y += 0.3;
  const hl = Math.hypot(it.vel.x, it.vel.z);
  if (hl > 1e-4) { const w = G.physics.raycast(_v, _v2.set(it.vel.x / hl, 0, it.vel.z / hl), hl * dt + 0.15, _hit); if (w.hit && Math.abs(w.normal.y) < 0.5) { it.vel.x = 0; it.vel.z = 0; } }
  it.pos.addScaledVector(it.vel, dt);
  const gy = G.level.groundHeight(it.pos.x, it.pos.z, y0 + 0.05);
  if (gy > -Infinity && it.pos.y <= gy) {
    it.pos.y = gy; it.air = false; it.vel.set(0, 0, 0); it.repath = 0;
    if (near(it.pos, 30)) G.audio?.play('waddle_land', { pos: it.pos, volume: 0.45, pitch: 1.2 });
  }
  if (it.pos.y < PLAYER.waterY - 1.2) { it.why = 'fell'; plop(it); return 0; }
  it.m.outer.position.copy(it.pos);
  return Math.hypot(it.pos.x - x0, it.pos.z - z0);
}
function startHop(it, node) {
  it.hop = { t: 0, dur: 0.5, x0: it.pos.x, y0: it.pos.y, z0: it.pos.z, x1: node.x, y1: node.y, z1: node.z };
  it.heading = Math.atan2(node.x - it.pos.x, node.z - it.pos.z);
  it.pi++;
  if (near(it.pos, 30)) G.audio?.play('waddle_hop', { pos: it.pos, volume: 0.6 });
}
// a hop up a step: rises first, then over (horizontal eased in), landing on the node
function hopStep(it, dt) {
  const H = it.hop, x0 = it.pos.x, z0 = it.pos.z;
  H.t += dt;
  const u = clamp(H.t / H.dur, 0, 1), p = u * u;
  it.pos.set(lerp(H.x0, H.x1, p), lerp(H.y0, H.y1, u) + 4 * 0.5 * u * (1 - u), lerp(H.z0, H.z1, p));
  it.m.outer.position.copy(it.pos);
  if (u >= 1) { it.hop = null; it.repath = 0; }
  return Math.hypot(it.pos.x - x0, it.pos.z - z0);
}

// ---- the windup: it stops where it is (feet on the floor), rocks and swells, the lamp strobing, its blast radius shown
// on the floor with a beep pulse quickening, then bursts (s.delay later). A ghost waits for its owner's blast record.
function prime(it, why) {
  const s = it.sub;
  if (!it.ghost) netRec(it.owner, 'waddle', [5, it.gid, r2(it.pos.x), r2(it.pos.y), r2(it.pos.z)]);
  it.why = why; it.state = 'prime'; it.t = 0; it.fuse = s.delay; it.hop = null; it.air = false; it.flashT = 0;
  it.m.outer.position.copy(it.pos);
  hush(it);
  G.cues?.sub('waddle', 'warn', { owner: it.owner, team: it.team, at: it.pos, target: alive(it.target) ? it.target : null, radius: s.radius });   // sfx-cues: its windup alarm
  if (near(it.pos, 45)) G.fx?.glint?.(_v.copy(it.pos).setY(it.pos.y + 0.55 * it.vs), G.teamColors[it.team], 0.35);
  emit('sub:arm', { kind: 'waddle', pos: it.pos.clone(), team: it.team, radius: s.radius });
}
function primed(it, dt) {
  const s = it.sub, M_ = it.m;
  it.fuse -= dt;
  const k = clamp(1 - it.fuse / s.delay, 0, 1);
  M_.outer.position.copy(it.pos);
  M_.rock.rotation.set(-0.12 * k, 0, Math.sin(it.t * 38) * (0.08 + 0.1 * k));        // rocking, faster and wider
  M_.model.scale.setScalar(WSCALE * it.vs * (1 + 0.3 * k + 0.04 * k * Math.sin(it.t * 70)));
  M_.model.position.y = -MID * it.vs;                                                  // (swells about its feet: they stay down)
  for (const L of M_.legs) L.rotation.x *= 0.8;
  M_.lampMat.emissiveIntensity = (Math.floor(it.t * (10 + 16 * k)) % 2) ? 6 : 0.4;
  // the tell, in the Splat Bomb's language (fx.js): its blast radius as a danger ring, a beep pulse quickening 7 → 20 a second
  it.flashT += dt * (7 + 13 * k);
  const blink = it.flashT >= 1;
  if (blink) { it.flashT -= 1; it.blinks = (it.blinks || 0) + 1; }
  if (G.fx && near(it.pos, 55)) {
    const col = G.teamColors[it.team];
    G.fx.dangerRing?.(_v.copy(it.pos).setY(it.pos.y + 0.02), UP, col, s.radius, k);
    if (blink) G.fx.beepPulse?.(_v2.copy(it.pos).setY(it.pos.y + MID * it.vs * (1 + 0.3 * k)), it.pos, UP, col, s.radius, k);
  }
  if (it.fuse > 1e-4) return;   // (to the frame: 0.45 s is 27 of them)
  if (it.ghost) { if (it.fuse < -2) it.state = 'dead'; return; }
  blast(it);
}

function blinkLamp(it, dt, period, bright) {
  it.blink -= dt; it.blinked = false;
  if (it.blink <= 0) { it.blink = period; it.blinked = true; }
  it.m.lampMat.emissiveIntensity = it.blink > period - 0.08 ? bright : 0.25;
}
function noise(it, pitch) {
  it.noisy = true;
  it.noisePitch = pitch;   // sfx-cues: the walk loop (and the hunt alarm on its target) come from src/audio/cues.js
}
function hush(it) { it.noisy = false; if (it.loop) { it.loop.stop(0.1); it.loop = null; } }

function blast(it) {
  if (it.state === 'dead') return;
  const s = it.sub, a = it.owner, team = it.team, col = G.teamColors[team];
  if (!it.ghost) netRec(a, 'waddle', [1, it.gid, r2(it.pos.x), r2(it.pos.y), r2(it.pos.z)]);
  it.blasted = true;
  const c = it.pos.clone(); c.y += 0.25;
  let area = G.paint.splat(_v.copy(it.pos).setY(it.pos.y + 0.2), s.paintRadius, team, { seed: Math.random() });
  for (let k = 0; k < 4; k++) {
    const ang = Math.random() * Math.PI * 2, r = s.paintRadius * (0.55 + Math.random() * 0.45);
    area += G.paint.splat(_v.set(c.x + Math.cos(ang) * r, c.y + 0.3, c.z + Math.sin(ang) * r), 0.5 + Math.random() * 0.4, team, { seed: Math.random() });
  }
  credit(it, area);
  G.fx?.explosion(c, col, s.radius);
  G.cues?.sub('waddle', 'boom', { owner: a, team, at: c });   // sfx-cues: its own boing-boom
  emit('shake', { pos: c.clone(), amount: 0.6 });
  emit('bomb:explode', { actor: a, pos: c.clone(), team, radius: s.radius, kind: 'waddle' });
  const loc = G.local;
  if (loc && loc.alive) { const d = loc.pos.distanceTo(c); if (d < 14) G.input?.rumble?.(clamp(1 - d / 14, 0, 1) * 0.6, clamp(1 - d / 14, 0, 1) * 0.5, 160); }
  _v2.copy(c); _v2.y += 0.3;
  for (const e of G.actors) {
    if (e.team === team || !e.alive) continue;
    _v.copy(e.pos); _v.y += e.form === 'squid' ? 0.3 : 0.7;
    const d = _v.distanceTo(c);
    if (d > s.radius || !G.physics.los(_v2, _v)) continue;
    const k = 1 - clamp((d - 0.8) / (s.radius - 0.8), 0, 1);
    G.projectiles.applyHit(a, e, lerp(s.damageMin, s.damageMax, k * k), 'waddle');
  }
  G.subs?.damageArea(c, s.radius, 60, team);
  G.boss?.splash(a, c, s.radius, s.damageMax, s.damageMin, 'waddle');   // Boss Battle
  it.state = 'dead';
}
// popped by enemy fire / an enemy blast: harmless
function hurt(it, dmg) {
  if (it.state === 'dead' || it.state === 'fly' || netMuted()) return;   // (a ghost's hit: its owner's copy decides)
  if (!it.ghost) it.hp -= dmg;
  else netHurt(it.owner, 'waddle', it.gid, dmg);   // a remote player's: its owner's copy takes it (and says if it popped)
  _c.copy(it.pos); _c.y += 0.22;
  if (near(_c, 30)) G.fx?.burst?.(_c, UP, G.teamColors[it.team], { count: 3, speed: 2, size: 0.05, sheet: false });
  if (it.hp > 0 || it.ghost) return;
  pop(it);
}
function pop(it) {
  _c.copy(it.pos); _c.y += 0.22;
  if (near(_c, 40)) {
    G.fx?.burst?.(_c, UP, G.teamColors[it.team], { count: 12, speed: 3.5, size: 0.07 });
    G.cues?.sub('waddle', 'end', { owner: it.owner, team: it.team, at: _c.clone() });   // sfx-cues: a squeaky deflate
  }
  emit('sub:destroyed', { kind: 'waddle', pos: _c.clone(), team: it.team });
  it.why = 'popped'; it.state = 'dead';
}

function dispose(it) {
  emit('sub:end', { kind: 'waddle', why: it.why || 'cleared', team: it.team, pos: it.pos.clone() });
  hush(it);
  G.scene?.remove(it.m.outer);
  it.m.lampMat.dispose();
  if (it.ring) { G.scene?.remove(it.ring); it.ring.material.dispose(); it.ring = null; }
}

// the ring: open while sensing; on a lock it flashes and closes in on the bomb; gone once it's walking
function ringFx(it, dt) {
  const R = it.ring;
  if (!R) return;
  const u = R.material.uniforms;
  u.uTime.value = G.time;
  if (it.state === 'sense') { u.uGrow.value = 1 - (1 - clamp(it.t / 0.3, 0, 1)) ** 3; u.uAlpha.value = 1; }
  else {
    it.ringT += dt;
    const k = clamp(it.ringT / 0.4, 0, 1);
    u.uLock.value = 1 - k; u.uSweep.value = 0; u.uGrow.value = 1 - k * k * 0.92; u.uAlpha.value = 1 - k * k;
    if (k >= 1) { G.scene?.remove(R); R.material.dispose(); it.ring = null; }
  }
}

// aiming preview: the sensing circle around the throw arc's landing ring
let preview = null;
function previewFx() {
  const a = G.local, P = G.projectiles;
  const show = !!(a && a.alive && a.weaponRunner?.aimingSub && a.sub?.kind === 'waddle' && P?.arcRing?.visible);
  if (!show) { if (preview) preview.visible = false; return; }
  if (!preview) { preview = makeRing(a.color, 0.4); preview.material.uniforms.uGrow.value = 1; preview.material.uniforms.uSweep.value = 0; G.scene.add(preview); }
  if (preview.parent !== G.scene) G.scene.add(preview);
  preview.material.uniforms.uColor.value.copy(a.color);
  preview.material.uniforms.uTime.value = G.time;
  preview.position.copy(P.arcRing.position);
  preview.scale.setScalar(a.sub.senseRadius);
  preview.visible = true;
}

// ---- query hook for bots (bots.js dodges / shoots enemy Waddles): one stable descriptor per bomb, getters read its
// live state (see kits/registry.js `threats`). Read-only: nothing here changes how the bomb behaves.
function threatOf(it) {
  if (it.thr) return it.thr;
  const s = it.sub, v = new V3();
  it.thr = {
    kind: 'waddle', obj: it, team: it.team, owner: it.owner, pos: it.pos, aimY: MID, radius: s.radius, trigger: s.triggerDist,
    speed: s.speed, senseRadius: s.senseRadius, ground: true,
    get live() { return it.state !== 'dead'; },
    get state() { return it.state; },
    get hp() { return it.hp; },
    get shootable() { return it.state !== 'fly' && it.state !== 'dead'; },
    get locked() { return it.state === 'wake' || it.state === 'walk'; },
    // winding up to burst where it stands (s until it does): botSpecials.js makes it a danger area to get out of
    get priming() { return it.state === 'prime'; },
    get fuse() { return it.state === 'prime' ? Math.max(0, it.fuse) : Infinity; },
    get target() { return (it.state === 'wake' || it.state === 'walk') && alive(it.target) ? it.target : null; },
    // walking: its heading at full speed (it lays no velocity of its own); in the air / falling: its velocity
    get vel() {
      if (it.state === 'walk' && !it.hop && !it.air) return v.set(Math.sin(it.heading) * s.speed, 0, Math.cos(it.heading) * s.speed);
      return it.state === 'fly' || it.air ? v.copy(it.vel) : v.set(0, 0, 0);
    },
    // seconds of chase it has left before it gives up and goes off where it is (life / max travel)
    get left() { return it.state === 'walk' ? Math.max(0, Math.min(s.life - it.walkT, (s.maxTravel - it.travel) / s.speed)) : s.life; },
  };
  return it.thr;
}

// ================================================================================================= registration
SUB_KITS.waddle = {
  use,
  ghost,
  netHurt(gid, dmg) { const it = items.find((x) => !x.ghost && x.gid === gid && x.state !== 'dead'); if (it) hurt(it, dmg); },
  threats(out) { for (const it of items) if (it.state !== 'dead') out.push(threatOf(it)); return out; },
  tick(dt) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.age += dt; it.t += dt;
      ghostMute(it, () => {
        switch (it.state) {
          case 'fly': fly(it, dt); break;
          case 'sense': sense(it, dt); break;
          case 'wake': wake(it, dt); break;
          case 'walk': walk(it, dt); break;
          case 'prime': primed(it, dt); break;
        }
      });
      if (it.ghost && it.age > 40) it.state = 'dead';   // (its owner left)
      if (it.state !== 'dead') ringFx(it, dt);
      if (it.state === 'dead') {
        if (!it.ghost && !it.blasted) netRec(it.owner, 'waddle', [2, it.gid, it.why === 'popped' ? 1 : 0]);
        dispose(it); items.splice(i, 1);
      }
    }
    previewFx();
  },
  clear() {
    for (const it of items) dispose(it);
    items.length = 0;
    if (preview) { preview.parent?.remove(preview); preview.material.dispose(); preview = null; }
  },
  // enemy shots and beams pop it (it absorbs the shot)
  blockShot(prev, pos, team, dmg) {
    for (const it of items) {
      if (it.team === team || it.state === 'fly' || it.state === 'dead') continue;
      Physics.segmentCapsuleDist(prev, pos, it.pos, 0.17, 0.4, _res);
      if (_res.dist < 0.2) { hurt(it, dmg); return true; }
    }
    return false;
  },
  blockRay(from, dir, len, team, dmg) {
    let best = len, hitIt = null;
    for (const it of items) {
      if (it.team === team || it.state === 'fly' || it.state === 'dead') continue;
      _v.copy(it.pos); _v.y += 0.2;
      const t = _v.sub(from).dot(dir);
      if (t <= 0 || t >= best) continue;
      _v3.copy(from).addScaledVector(dir, t);
      _v.copy(it.pos); _v.y += 0.2;
      if (_v3.distanceTo(_v) < 0.24) { best = t; hitIt = it; }
    }
    if (hitIt) hurt(hitIt, dmg);
    return best;
  },
  damageArea(c, radius, dmg, team) {
    for (const it of items) {
      if (it.team === team || it.state === 'fly' || it.state === 'dead') continue;
      if (it.pos.distanceTo(c) < radius + 0.3) hurt(it, dmg);
    }
  },
  items,
  bot: {
    // lob it into the fight: it walks the rest of the way
    fight(brain, dist) {
      const go = dist > 4.5 && dist < 15 && Math.random() < 0.02 * (1 + brain.diff.fireDiscipline);
      if (go) brain.bombCd = 6 + Math.random() * 5;
      return go;
    },
    // scouting: a foe we saw go out of sight (bots.js / botSight.js memory, a few seconds old at most) near where the
    // throw would land — send it to flush them out
    paint(brain) {
      if (Math.random() > 0.03 || !brain.sight) return false;
      const a = brain.a, lx = a.pos.x + Math.sin(a.aimYaw) * 7.5, lz = a.pos.z + Math.cos(a.aimYaw) * 7.5;
      for (const [e, k] of brain.sight.mem) {
        if (k.seen || brain.target === e || G.time - k.t > 4) continue;
        if (Math.hypot(k.pos.x - lx, k.pos.z - lz) < 6.5 && Math.abs(k.pos.y - a.pos.y) < 3) { brain.bombCd = 9 + Math.random() * 6; return true; }
      }
      return false;
    },
  },
};
THROWN.waddle = true;
