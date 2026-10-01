// INKWAVE — squidkid character: skinned procedural model + fully procedural, layered animation.
// API: docs/CONTRACTS.md §1 (constructor, root, setColor, setWeapon, update(dt, AnimState), trigger, setDance, setHurt,
// setVisible, getMuzzle, getHeadPosition, dispose). The engine owns root.position / root.rotation.y; everything here
// animates children. update() is allocation-free (8 characters every frame).
//
// Animation architecture (all procedural, layered, spring-smoothed — nothing is a canned clip):
//   root tracking → world velocity / acceleration / turn rate measured from the root's own motion
//   stepping      → world-locked foot plants (zero sliding by construction), a phase-driven gait whose cadence, duty
//                   factor and lift follow speed, predictive landing targets (turns/strafes/backpedal), settle steps
//                   (stops, turn-in-place, stance changes), catch-up steps, ground raycasts (ramps/steps), footsteps
//   pose layers   → idle (breathing, weight shifts, fidgets) · locomotion (pelvis bob/roll/twist, spine counter-
//                   rotation, arm swing with follow-through) · lean springs (acceleration, turn banking, braking) ·
//                   air (launch/tuck/apex/fall-reach) · weapon holds + aim + recoil springs · one-shots (flick, throw,
//                   hit, jump, land, spawn, specials) · facial animation · dances
//   application   → kid squash/stretch → pelvis reach solve → torso FK → stabilised head look → two-bone IK legs/arms
//                   → face → hair spring chains → tank slosh → weapon extras
import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { G, on } from '../core/ctx.js';
import {
  BONE_NAMES, BONE_PARENT, BONE_INDEX, HAIR_MAX, HAIR_SEGS, REST,
  getKidShared, getHairStyle, getRestPositions, getBoneInverses, getClothGeo,
} from './character-geo.js';
import {
  makeCharUniforms, makeSkinMaterial, makeClothMaterial, makeHairMaterial, getDarkMaterial, makeEyeMaterial,
  getGlassMaterial, makeInkFillMaterial, makeSquidMaterial, getPlasticMaterial, getInkMaterial, makeGlowMaterial,
} from './character-mats.js';
import * as MATS from './character-mats.js';
import { getWeaponDef, getSubDef, FIST_OFFSET, GRIP_HOLE_L, WEAPON_KINDS, makeLampMaterial, makeCoilMaterial, animateWeapon } from './character-weapons.js';
import { TIERS, T_HERO, T_GAME, T_FAR, LOD_QUALITY, KID_H, FADE_S, pickTier, ditherMaterial, farGeometry } from './character-lod.js';

// ------------------------------------------------------------------------------------------------
// Style tables
// ------------------------------------------------------------------------------------------------
// (the catalog lives in character-style.js — owned by the appearance stream; re-exported here for older importers)
import * as STYLE from './character-style.js';
const { SKIN_TONES, OUTFITS, IRIS, HAIR_STYLES, resolveStyle } = STYLE;
export { SKIN_TONES, OUTFITS, IRIS, HAIR_STYLES };

// ------------------------------------------------------------------------------------------------
// Math helpers (allocation-free)
// ------------------------------------------------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); };
const easeIn = (t) => { t = clamp(t, 0, 1); return t * t; };
const mj = (t) => { t = clamp(t, 0, 1); return t * t * t * (10 + t * (6 * t - 15)); }; // minimum-jerk
const backOut = (t, s = 2.2) => { t = clamp(t, 0, 1) - 1; return t * t * ((s + 1) * t + s) + 1; };
const frac = (x) => x - Math.floor(x);
const TAU = Math.PI * 2;
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// impulse envelope: quick attack, exponential decay
const pulse = (t, atk, dec) => (t < 0 ? 0 : t < atk ? t / atk : Math.exp(-(t - atk) * dec));
// window: 0 outside [a,d], eases up a..b, holds, eases down c..d
const win = (t, a, b, c, d) => (t <= a || t >= d ? 0 : t < b ? ease((t - a) / (b - a)) : t > c ? 1 - ease((t - c) / (d - c)) : 1);
/** hand-shape keys: h = -1 fist, 0 grip, 1 relaxed, 2 open */
function hk(h, fist, grip, relaxed, open) { return h < 0 ? grip + (fist - grip) * Math.min(1, -h) : h < 1 ? grip + (relaxed - grip) * h : relaxed + (open - relaxed) * Math.min(1, h - 1); }
function wrapA(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
function dampAngle(a, b, l, dt) { return a + wrapA(b - a) * (1 - Math.exp(-l * dt)); }
/** Keyed curve with eased (held) keys: T ascending times, V values. */
function kf(t, T, V) {
  const n = T.length; if (t <= T[0]) return V[0]; if (t >= T[n - 1]) return V[n - 1];
  let i = 1; while (T[i] < t) i++;
  const u = (t - T[i - 1]) / (T[i] - T[i - 1]);
  return V[i - 1] + (V[i] - V[i - 1]) * (u * u * (3 - 2 * u));
}
/** Keyed curve through keys with Catmull-Rom tangents (fluid, no stops at keys; flat at the ends). */
function kc(t, T, V) {
  const n = T.length; if (t <= T[0]) return V[0]; if (t >= T[n - 1]) return V[n - 1];
  let i = 1; while (T[i] < t) i++;
  const t0 = T[i - 1], h = T[i] - t0, u = (t - t0) / h;
  const m0 = i > 1 ? (V[i] - V[i - 2]) / (T[i] - T[i - 2]) : 0;
  const m1 = i < n - 1 ? (V[i + 1] - V[i - 1]) / (T[i + 1] - T[i - 1]) : 0;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * V[i - 1] + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * V[i] + (u3 - u2) * h * m1;
}
/** Damped spring (semi-implicit Euler, sub-stepped). S[i] = x, S[i+1] = v. Returns x. */
function spr(S, i, target, hz, zeta, dt) {
  const w = TAU * hz, k = w * w, c = 2 * zeta * w;
  let x = S[i], v = S[i + 1];
  const n = Math.max(1, Math.ceil(dt * w * 1.1)), h = dt / n;
  for (let j = 0; j < n; j++) { v += (k * (target - x) - c * v) * h; x += v * h; }
  S[i] = x; S[i + 1] = v; return x;
}

/** Damped spring advanced with the exact (analytic) solution — stable for any damping ratio / step, so heavily damped
 *  weapon kicks keep their shape (spr's Euler sub-steps flip the velocity when 2ζω·h > 1). Same S layout as spr. */
function sprA(S, i, target, hz, zeta, dt) {
  const w = TAU * hz, x0 = S[i] - target, v0 = S[i + 1];
  let x, v;
  if (zeta < 0.999) {
    const wd = w * Math.sqrt(1 - zeta * zeta), e = Math.exp(-zeta * w * dt), c = Math.cos(wd * dt), sn = Math.sin(wd * dt);
    const B = (v0 + zeta * w * x0) / wd;
    x = e * (x0 * c + B * sn);
    v = e * ((-zeta * w * x0 + wd * B) * c + (-zeta * w * B - wd * x0) * sn);
  } else {
    const e = Math.exp(-w * dt), B = v0 + w * x0;
    x = e * (x0 + B * dt); v = e * (v0 - w * B * dt);
  }
  S[i] = x + target; S[i + 1] = v; return S[i];
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion(), _q5 = new THREE.Quaternion(), _q6 = new THREE.Quaternion();
const _e1 = new THREE.Euler(0, 0, 0, 'YXZ');
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _pA = new THREE.Vector3(), _pT = new THREE.Vector3(), _pE = new THREE.Vector3(), _pN = new THREE.Vector3(), _pH = new THREE.Vector3(), _pD = new THREE.Vector3();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
const _cP = new THREE.Vector3(), _cQ = new THREE.Quaternion(), _aP = new THREE.Vector3(), _aQ = new THREE.Quaternion();
const _gO = new THREE.Vector3(), _gHit = { hit: false, dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), block: -1, face: -1, u: 0, v: 0 };
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), XAX = new THREE.Vector3(1, 0, 0), YAX = new THREE.Vector3(0, 1, 0);
const _sEnd = new THREE.Quaternion(), _sQp = new THREE.Quaternion(), _sQa = new THREE.Quaternion(), _sQb = new THREE.Quaternion(), _sP = new THREE.Vector3(), _sT = new THREE.Vector3(), _sPole = new THREE.Vector3();
const IDENT = new THREE.Matrix4();
const _cW = new THREE.Color(1, 1, 1);
const _vVH = new THREE.Vector2(), _lodC = new THREE.Vector3(), _lodK = new THREE.Vector3();
// far-tier triangle targets per part (decimated from the game tier when the builders give no far mesh)
const FAR_TRIS = { skin: 2600, cloth: 3800, hair: 2000, eyes: 260 };
let _warmRT = null;
// G.env.getSkyColors() builds a new object per call: one shared snapshot, refreshed ~4×/s (its colours are live
// references anyway; only the sun intensity / night numbers are copied) — no per-kid per-frame allocation
let _sky = null, _skyEnv = null, _skyT = 0;
function skyColors() {
  const E = G.env; if (!E || !E.getSkyColors) return null;
  const now = performance.now();
  if (E !== _skyEnv || now - _skyT > 250) { _sky = E.getSkyColors(); _skyEnv = E; _skyT = now; }
  return _sky;
}
/** character rim light strength (0 = off) — exported for labs / A-B renders. Above 1 since the lighting pass cut the
 *  world's sky IBL (deeper, bluer shade): kids standing in shade or back-lit by a low sun keep their read. */
export const CHAR_RIM = { k: 1.25, fill: 1.4 };
const EMPTY_STATE = { localMove: { x: 0, z: 0 } };
// Small moving weapon parts sit out override passes (GTAO normals): their AO is invisible and it saves the draws.
function partGate(renderer, scene, camera, geometry) { geometry.drawRange.count = scene.overrideMaterial ? 0 : Infinity; }
// …and the shadow pass (which runs no onBeforeRender) must not inherit a gated count from the previous frame's AO pass
function shadowUngate(renderer, object, camera, shadowCamera, geometry) { geometry.drawRange.count = Infinity; }
/** Character light: a sky/sun-tinted fresnel rim, strongest on the silhouette edge facing the sun (a back-lit kid gets
 *  a bright contour, a front-lit one a soft sky edge) — separates the kids from busy backgrounds. Wraps a body
 *  material's onBeforeCompile (runs after the material's own injections); strength per material (hair > skin > cloth).
 *  uIwRim = (rgb, power), uIwRimL = key-light direction in view space. Both live in the per-kid uniform bundle. */
function withRim(m, u, k) {
  const prev = m.onBeforeCompile, key = (m.customProgramCacheKey ? m.customProgramCacheKey() : '') + '|iwRim';
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    sh.uniforms.uIwRim = u.uIwRim; sh.uniforms.uIwRimL = u.uIwRimL; sh.uniforms.uIwFill = u.uIwFill;
    if (!sh.fragmentShader.includes('#include <opaque_fragment>')) return;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uIwRim; uniform vec3 uIwRimL; uniform vec3 uIwFill;')
      .replace('#include <opaque_fragment>', `{
        vec3 iwV = normalize(vViewPosition);
        float iwF = pow(1.0 - clamp(dot(normal, iwV), 0.0, 1.0), uIwRim.w);
        float iwS = clamp(dot(normal, uIwRimL) * 0.5 + 0.5, 0.0, 1.0);
        outgoingLight += uIwRim.rgb * (${k.toFixed(3)} * iwF * (0.3 + 0.7 * iwS * iwS));
        // soft camera-side fill (a big bounce card above the lens): lifts faces out of low / back-lit sun
        float iwFl = clamp(dot(normal, normalize(vec3(0.25, 0.45, 1.0))) * 0.6 + 0.4, 0.0, 1.0);
        outgoingLight += uIwFill * diffuseColor.rgb * iwFl * iwFl;
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// rig constants (read from the rig so modelling tweaks flow through)
const ANKLE_H = REST.footL.y;            // ankle height above the sole
const HIPW = Math.abs(REST.footL.x) + 0.008;
const BALL_Z = 0.11, HEEL_Z = 0.065;     // toe-roll / heel-roll pivots relative to the ankle projection
const HEAD_CTR = new THREE.Vector3(0, 0.164, 0.014); // head-bone-relative head centre

// ------------------------------------------------------------------------------------------------
// Pose buffer layout (one Float32Array per layer; blended channel-wise)
// ------------------------------------------------------------------------------------------------
let _k = 0; const S = (n = 1) => { const i = _k; _k += n; return i; };
const HIPS_P = S(3), HIPS = S(3), SPINE = S(3), CHEST = S(3), NECK = S(3), HEAD = S(3), CLAVL = S(3), CLAVR = S(3);
const UARML = S(3), UARMR = S(3), FARML = S(3), FARMR = S(3), HANDL = S(3), HANDR = S(3);
const FOOTL = S(3), FOOTLR = S(3), FOOTR = S(3), FOOTRR = S(3);          // kid-space ankle targets + (pitch, yaw, roll)
const ANC = S(3), ANCR = S(3), POLER = S(3), POLEL = S(3), LTGT = S(3), LTGTR = S(3), KNEEL = S(3), KNEER = S(3);
const IKR = S(), IKL = S(), LTW = S(), LTROT = S(), SPIN = S(), WPL = S(), WPR = S(), STAB = S(), AFOLT = S(), AFOLR = S();
const BROW = S(), BROWY = S(), MCURVE = S(), MWIDTH = S(), MOPEN = S(), MTILT = S(), EYE = S(), WINK = S(), SQUINT = S(), LOOKX = S(), LOOKY = S();
const MODEL = S(3), MODELR = S(3), SQY = S(), SQXZ = S(), HLY = S(), HLP = S(), CROUCH = S();
// hand shapes: -1 fist · 0 grip (rest) · 1 relaxed · 2 open palm ; ears: -1 droop … +1 perk
const HANDPL = S(), HANDPR = S(), EARS = S();
// dual wield: the left weapon's anchor (kid space, like ANC/ANCR) · tiptoe: heels up on both planted feet (0..1)
const ANL = S(3), ANLR = S(3), TIPTOE = S();
// brow asymmetry (+ lifts the left brow, drops the right) · pupil dilation 0..1 · breath (0 out … 1 full, for the face)
const BRAS = S(), PUPIL = S(), BREATH = S(), SNEER = S(), PUCKER = S(), BLUSH = S();
const PN = _k;

function poseNeutral(P) {
  P.fill(0);
  P[FOOTL] = HIPW; P[FOOTL + 1] = ANKLE_H; P[FOOTL + 2] = -0.004; P[FOOTLR + 1] = 0.1;
  P[FOOTR] = -HIPW; P[FOOTR + 1] = ANKLE_H; P[FOOTR + 2] = -0.004; P[FOOTRR + 1] = -0.1;
  P[POLER] = -0.7; P[POLER + 1] = -0.55; P[POLER + 2] = -0.45;
  P[POLEL] = 0.7; P[POLEL + 1] = -0.55; P[POLEL + 2] = -0.45;
  P[IKR] = 1; P[WPL] = 1; P[WPR] = 1; P[STAB] = 0.82; P[AFOLT] = 1; P[AFOLR] = 1;
  P[MCURVE] = 0.75; P[MWIDTH] = 1; P[EYE] = 1; P[SQY] = 1; P[SQXZ] = 1; P[HANDPL] = 1; P[PUPIL] = 0.5;
  P[UARML + 2] = 0.1; P[UARMR + 2] = -0.1; P[FARML] = -0.3; P[FARMR] = -0.3;
  P[HANDL + 2] = -0.1; P[HANDR + 2] = 0.1;
}
function poseLerp(out, a, b, t) { for (let i = 0; i < PN; i++) out[i] = a[i] + (b[i] - a[i]) * t; }
function setE(P, i, x, y, z) { P[i] = x; P[i + 1] = y; P[i + 2] = z; }
function lerpE(P, i, x, y, z, w) { P[i] += (x - P[i]) * w; P[i + 1] += (y - P[i + 1]) * w; P[i + 2] += (z - P[i + 2]) * w; }

// springs (index into the spring bank; each spring owns 2 floats)
let _sk = 0; const SPG = () => (_sk++) * 2;
const S_LEANP = SPG(), S_LEANR = SPG(), S_PELY = SPG(), S_SQ = SPG(), S_ARML = SPG(), S_ARMR = SPG(), S_ELBL = SPG();
const S_WPX = SPG(), S_WPY = SPG(), S_WPZ = SPG(), S_WRX = SPG(), S_WRY = SPG();
const S_RCP = SPG(), S_RCZ = SPG(), S_RCY = SPG(), S_RCR = SPG();
const S_HITP = SPG(), S_HITR = SPG(), S_HITY = SPG(), S_HEADP = SPG(), S_HEADR = SPG();
const S_HLY = SPG(), S_HLP = SPG(), S_SHIFT = SPG(), S_TANKX = SPG(), S_TANKZ = SPG(), S_TANKL = SPG();
const S_SQY = SPG(), S_SQP = SPG(), S_SQR = SPG(), S_SQH = SPG(), S_CLAV = SPG(), S_STAG = SPG(), S_LAGX = SPG(), S_LAGZ = SPG(), S_HEMP = SPG(), S_HEMR = SPG(), S_TKY = SPG(), S_TKZ = SPG(), S_TKX = SPG(), S_EARL = SPG(), S_EARR = SPG(), S_HEMV = SPG();
const S_RCP2 = SPG(), S_RCZ2 = SPG(), S_RCY2 = SPG();   // left-hand recoil (dual wield)
const S_ATTY = SPG(), S_ATTP = SPG(), S_GRIP = SPG(), S_GRIPL = SPG();   // attention head turn (menus) · weapon-hand grip squeeze
const SPN = _sk * 2;

// one-shot timers (seconds since trigger)
let _tk = 0; const TK = () => _tk++;
const T_SHOOT = TK(), T_FLICK = TK(), T_THROW = TK(), T_LAND = TK(), T_JUMP = TK(), T_HIT = TK(), T_LEAP = TK(), T_SLAM = TK(), T_SPAWN = TK(), T_REL = TK(), T_IMPACT = TK(), T_BRAKE = TK(), T_FORM = TK(), T_STAG = TK();
const T_SHOOTL = TK(), T_DODGE = TK(), T_SLOSH = TK(), T_ADMIRE = TK(), T_FLIP = TK(), T_WINK = TK();
const TN = _tk;

// stepping modes
const M_GAIT = 0, M_CATCH = 1, M_SETTLE = 2;

// ------------------------------------------------------------------------------------------------
// Weapon holds. Anchor = weapon grip frame in kid space (rest torso): p = position, r = YXZ euler [pitch(+down),
// yaw(+left), roll]. aim.p is relative to AIM_PIVOT and rotates with aim pitch. stance = aim-stance feet
// [lx, lz, lyaw, rx, rz, ryaw] (kid space); hip/chest = aim-stance yaw distribution.
// ------------------------------------------------------------------------------------------------
const AIM_PIVOT = new THREE.Vector3(-0.03, 0.93, 0.05);
const HOLD = {
  shooter: {
    carry: { p: [-0.19, 0.76, 0.14], r: [0.62, 0.12, -0.16] }, twoCarry: 0,
    run: { p: [-0.175, 0.8, 0.2], r: [0.12, 0.06, -0.3] },
    aim: { p: [-0.04, -0.075, 0.27], r: [0, 0.035, 0] }, twoAim: 1,
    poleR: [-0.8, -0.55, -0.3], poleL: [0.75, -0.65, -0.25],
    rc: { kick: 0.09, back: 0.04, hz: 6.5, z: 0.78, jit: 0.028, torso: 0.34, head: 0.12, crouch: 0.006, brace: 1 },
    hip: -0.12, chest: 0.05, crouch: 0.012,
    stance: [0.105, 0.03, 0.16, -0.098, -0.035, -0.34],
    raise: { p: [-0.2, 1.24, 0.12], r: [-1.15, 0.25, -0.3] },
    lobby: { p: [-0.17, 0.99, 0.19], r: [-1.0, 0.55, -0.45] }, lobbyTwo: 0,
  },
  blaster: {
    carry: { p: [-0.13, 0.78, 0.17], r: [0.38, 0.34, 0.24] }, twoCarry: 1,
    aim: { p: [-0.035, -0.09, 0.2], r: [0, 0.04, 0] }, twoAim: 1,
    poleR: [-0.85, -0.5, -0.25], poleL: [0.8, -0.6, -0.2],
    rc: { kick: 0.42, back: 0.075, hz: 3.4, z: 0.7, jit: 0.035, torso: 0.42, head: 0.3, crouch: 0.03, brace: 0.6 },
    hip: -0.16, chest: 0.08, crouch: 0.018,
    stance: [0.118, 0.045, 0.22, -0.112, -0.05, -0.38],
    raise: { p: [-0.18, 1.22, 0.14], r: [-1.1, 0.3, -0.3] },
    lobby: { p: [-0.16, 0.97, 0.2], r: [-0.95, 0.5, -0.4] }, lobbyTwo: 0,
  },
  charger: {
    carry: { p: [-0.12, 0.8, 0.17], r: [-0.25, 0.85, 0.6] }, twoCarry: 1,
    aim: { p: [-0.05, -0.02, 0.12], r: [0, 0.08, 0] }, twoAim: 1,
    poleR: [-0.95, -0.35, -0.1], poleL: [0.6, -0.75, -0.3],
    rc: { kick: 0.22, back: 0.06, hz: 4.2, z: 0.62, jit: 0.012, torso: 0.36, head: 0.28, crouch: 0.02, brace: 0 },
    hip: -0.42, chest: 0.3, crouch: 0.024,
    stance: [0.112, 0.085, 0.3, -0.098, -0.085, -0.78],
    raise: { p: [-0.17, 1.22, 0.1], r: [-1.05, 0.3, -0.3] },
    lobby: { p: [-0.13, 0.8, 0.2], r: [-0.3, 0.78, 0.55] }, lobbyTwo: 1,
  },
  roller: {
    carry: { p: [-0.12, 0.83, 0.16], r: [0.8, 0.1, 0.0] }, twoCarry: 1,
    roll: { p: [-0.07, 0.79, 0.24], r: [0.9, 0.06, 0] },
    aim: { p: [-0.07, -0.13, 0.2], r: [0.9, 0.08, 0] }, twoAim: 1,
    poleR: [-0.7, -0.4, -0.6], poleL: [0.7, -0.4, -0.6],
    rc: { kick: 0.04, back: 0.012, hz: 9, z: 0.45, jit: 0.01, torso: 0.1, head: 0.05, crouch: 0 },
    hip: -0.1, chest: 0.04, crouch: 0.035,
    stance: [0.12, 0.06, 0.16, -0.11, -0.08, -0.32],
    raise: { p: [-0.16, 1.25, 0.08], r: [-1.25, 0.25, -0.2] },
    lobby: { p: [-0.21, 0.86, 0.14], r: [1.2, 0.25, 0] }, lobbyTwo: 0,
  },
};
// ---- kinds added by the arsenal stream (grip frames in character-weapons.js; poses here are pure data + the generic
// layers in _poseWeapon: dual wield mirrors the anchor to the left fist, `fire` names the one-shot the kind plays)
HOLD.dualies = {
  dual: true,   // a second pistol in the LEFT fist: the left anchor is the right one mirrored across the kid's midline
  carry: { p: [-0.165, 0.745, 0.12], r: [0.95, 0.12, -0.18] }, twoCarry: 0,
  run: { p: [-0.16, 0.79, 0.18], r: [0.3, 0.06, -0.22] },
  aim: { p: [-0.055, -0.07, 0.27], r: [0, 0.03, 0] }, twoAim: 0,
  lock: { p: [-0.07, -0.05, 0.31], r: [0, 0.02, -0.06] },          // post-roll turret stance (relative to AIM_PIVOT)
  poleR: [-0.85, -0.55, -0.25], poleL: [0.85, -0.55, -0.25],
  rc: { kick: 0.07, back: 0.03, hz: 7, z: 0.8, jit: 0.03, torso: 0.25, head: 0.1, crouch: 0.004, brace: 1 },
  hip: -0.05, chest: 0.02, crouch: 0.016,
  stance: [0.12, 0.02, 0.2, -0.12, -0.02, -0.2],
  raise: { p: [-0.2, 1.24, 0.12], r: [-1.15, 0.25, -0.3] },
  lobby: { p: [-0.2, 0.84, 0.16], r: [0.2, 0.35, -0.5] }, lobbyTwo: 0,
};
HOLD.slosher = {
  fire: 'slosh',
  carry: { p: [-0.2, 0.62, 0.1], r: [0, 0.2, 0] }, twoCarry: 0,
  run: { p: [-0.215, 0.64, 0.08], r: [0.12, 0.28, 0.06] },
  aim: { p: [-0.04, -0.2, 0.26], r: [0, 0.05, 0] }, twoAim: 1,
  poleR: [-0.85, -0.5, -0.25], poleL: [0.8, -0.6, -0.2],
  rc: { kick: 0.02, back: 0.01, hz: 5, z: 0.7, jit: 0.005, torso: 0.1, head: 0.05, crouch: 0.004, brace: 0 },
  hip: -0.16, chest: 0.08, crouch: 0.018,
  stance: [0.118, 0.045, 0.22, -0.112, -0.05, -0.38],
  raise: { p: [-0.2, 1.08, 0.16], r: [-0.6, 0.3, -0.25] },
  lobby: { p: [-0.21, 0.63, 0.12], r: [0.05, 0.4, -0.05] }, lobbyTwo: 0,
};
HOLD.splatling = {
  fire: 'spin',
  carry: { p: [-0.16, 0.74, 0.16], r: [0.45, 0.2, -0.1] }, twoCarry: 1,
  aim: { p: [-0.07, -0.16, 0.2], r: [0.05, 0.06, 0] }, twoAim: 1,
  poleR: [-0.85, -0.6, -0.2], poleL: [0.75, -0.7, -0.2],
  rc: { kick: 0.035, back: 0.02, hz: 8, z: 0.8, jit: 0.012, torso: 0.2, head: 0.06, crouch: 0.004, brace: 1 },
  hip: -0.24, chest: 0.12, crouch: 0.03,
  stance: [0.125, 0.07, 0.24, -0.11, -0.07, -0.42],
  raise: { p: [-0.17, 1.2, 0.1], r: [-1.0, 0.3, -0.3] },
  lobby: { p: [-0.15, 0.8, 0.2], r: [0.25, 0.4, -0.15] }, lobbyTwo: 1,
};
HOLD.shooter.fire = 'recoil'; HOLD.blaster.fire = 'pump'; HOLD.charger.fire = 'charge'; HOLD.roller.fire = 'flick';
// ---- fork kinds (bucket / spinner / the Twister Zooka special); twins, brush and the other held specials borrow a
// family through ANIM_OF below
// pail held low in front with both hands: right fist on the handle, left palm under the bottom
HOLD.bucket = {
  carry: { p: [-0.1, 0.7, 0.24], r: [0.25, 0.1, 0] }, twoCarry: 1,
  aim: { p: [-0.06, -0.52, 0.34], r: [0.35, 0.06, 0] }, twoAim: 1,
  poleR: [-0.8, -0.6, -0.2], poleL: [0.7, -0.75, -0.2],
  rc: { kick: 0.05, back: 0.02, hz: 6, z: 0.4, jit: 0.01, torso: 0.15, head: 0.08, crouch: 0.02 },
  hip: -0.14, chest: 0.06, crouch: 0.03,
  stance: [0.118, 0.045, 0.22, -0.112, -0.05, -0.38],
  raise: { p: [-0.18, 1.22, 0.14], r: [-1.1, 0.3, -0.3] },
  lobby: { p: [-0.12, 0.72, 0.24], r: [0.3, 0.2, 0.1] }, lobbyTwo: 1,
};
// heavy rotary cannon braced at the hip with both hands, wide planted stance
HOLD.spinner = {
  carry: { p: [-0.1, 0.74, 0.2], r: [0.3, 0.2, 0.15] }, twoCarry: 1,
  aim: { p: [-0.06, -0.42, 0.18], r: [0, 0.06, 0] }, twoAim: 1,
  poleR: [-0.9, -0.5, -0.1], poleL: [0.7, -0.8, -0.1],
  rc: { kick: 0.03, back: 0.02, hz: 14, z: 0.5, jit: 0.018, torso: 0.12, head: 0.06, crouch: 0.02 },
  hip: -0.3, chest: 0.18, crouch: 0.05,
  stance: [0.13, 0.07, 0.26, -0.12, -0.07, -0.55],
  raise: { p: [-0.17, 1.22, 0.1], r: [-1.05, 0.3, -0.3] },
  lobby: { p: [-0.12, 0.76, 0.2], r: [0.2, 0.6, 0.4] }, lobbyTwo: 1,
};
// special: shoulder-fired launcher (Twister Zooka) — tube resting on the right shoulder beside the head, both hands
HOLD.sp_zooka = {
  carry: { p: [-0.2, 0.93, 0.1], r: [-0.22, 0.04, 0] }, twoCarry: 1,
  aim: { p: [-0.17, 0.02, 0.07], r: [0, 0.03, 0] }, twoAim: 1,
  poleR: [-0.55, -0.85, 0.05], poleL: [0.55, -0.8, -0.1],
  rc: { kick: 0.3, back: 0.07, hz: 5, z: 0.38, jit: 0.012, torso: 0.3, head: 0.22, crouch: 0.03 },
  hip: -0.36, chest: 0.26, crouch: 0.03,
  stance: [0.112, 0.085, 0.3, -0.098, -0.085, -0.7],
  raise: { p: [-0.17, 1.22, 0.1], r: [-1.05, 0.3, -0.3] },
  lobby: { p: [-0.2, 0.93, 0.1], r: [-0.3, 0.1, 0] }, lobbyTwo: 1,
};
// ---- Brine Cutlass (kit weapon 'blade', kits/blade.js): one-handed sword. Carry low and forward at the right side,
// run with the blade trailing, a raised guard while fighting; the cuts themselves are _poseBlade (one-shots).
HOLD.blade = {
  carry: { p: [-0.21, 0.72, 0.16], r: [0.62, 0.2, -0.95] }, twoCarry: 0,
  run: { p: [-0.22, 0.76, 0.04], r: [2.0, 0.3, -0.35] },
  aim: { p: [-0.12, -0.06, 0.26], r: [-0.45, 0.4, -0.7] }, twoAim: 0,
  poleR: [-0.9, -0.5, -0.2], poleL: [0.75, -0.65, -0.25],
  rc: { kick: 0.02, back: 0.01, hz: 6, z: 0.6, jit: 0.005, torso: 0.1, head: 0.05, crouch: 0.004, brace: 0 },
  hip: -0.16, chest: 0.07, crouch: 0.03,
  stance: [0.13, 0.07, 0.22, -0.12, -0.08, -0.45],
  raise: { p: [-0.2, 1.3, 0.1], r: [-1.35, 0.2, -0.2] },
  lobby: { p: [-0.2, 0.98, 0.02], r: [-2.35, 0.25, 0.3] }, lobbyTwo: 0,
};
const STANCE_IDLE =[HIPW + 0.012, 0.014, 0.19, -HIPW - 0.008, -0.01, -0.2];   // ready stance: a bit wide, toes out, left foot a touch ahead
const STANCE_LOCK = [0.165, 0.035, 0.42, -0.165, -0.035, -0.42];   // dualies' post-roll turret: wide and planted
// idle re-plants of one foot (kid space, left-foot convention: +x out, +z forward, +yaw toes out): out · back ·
// back-out · forward-in · toes out
const SHUFFLES = [[0.08, 0.015, 0.12], [0.012, -0.085, 0.05], [0.055, -0.065, 0.18], [-0.012, 0.075, -0.08], [0.03, -0.02, 0.45]];

// facial expressions: [BROW, BROWY, EYE, MCURVE, MWIDTH, MOPEN, MTILT, SQUINT] deltas from neutral
const X_FOCUS = [-0.38, -0.25, -0.08, -0.5, -0.18, 0, 0, 0.25];
const X_GRIN = [-0.2, 0, -0.05, 0.3, 0.12, 0.22, 0, 0.2];
const X_EFFORT = [-0.62, -0.35, -0.22, -0.35, 0.22, 0.14, 0, 0.45];
const X_WINCE = [0.85, 0.1, -0.62, -1.9, -0.1, 0.42, 0.18, 0.7];
const X_WORRY = [0.62, 0.45, 0.08, -1.1, -0.28, 0.1, 0, 0];
const X_DETERM = [-0.45, -0.1, -0.06, 0.2, 0.05, 0.05, 0.16, 0.2];
const X_SURPRISE = [0.25, 0.9, 0.18, -0.75, -0.42, 0.55, 0, 0];
const X_TIRED = [0.5, -0.1, -0.2, -0.9, -0.2, 0.22, 0, 0.1];
const X_JOY = [0.1, 0.7, -0.12, 0.25, 0.12, 0.72, 0, 0.35];
const X_POUT = [0.75, -0.3, -0.45, -1.65, -0.35, 0, 0.12, 0.2];
// micro-expressions (short impulses from events / idle flickers, see _mxPlay): same channel order
const X_BROWFLASH = [-0.1, 0.85, 0.1, 0.25, 0.05, 0.04, 0, 0];         // eye contact / attention: quick brow lift
const X_GLOAT = [-0.35, 0.4, -0.1, 1.0, 0.18, 0.28, 0.32, 0.35];         // splatted someone: lopsided grin
const X_OOF = [0.7, 0.35, 0.1, -1.3, -0.3, 0.55, -0.1, 0.35];          // big hit / an ally went down
const X_LIPPRESS = [-0.12, -0.08, 0, -0.45, -0.32, 0, 0, 0.06];        // idle: lips pressed, thinking
const X_SMIRK = [-0.08, 0.12, -0.04, 0.35, 0.06, 0, 0.42, 0.12];       // idle: half smile (MTILT sign = side)
const X_HMM = [0.2, 0.15, 0, -0.25, -0.22, 0.05, -0.2, 0];             // idle: mouth pulled to one side
const X_SOFTSMILE = [-0.05, 0.18, -0.06, 0.45, 0.1, 0.06, 0, 0.22];    // at the viewer: warm little smile
const X_HUP = [-0.3, 0.3, 0.06, 0.1, 0.06, 0.3, 0, 0.1];               // jump: "hup!"
const X_EFFORTP = [-0.5, -0.2, -0.12, -0.3, 0.2, 0.2, 0, 0.4];         // heave / release: clenched effort
const X_SIGH = [0.3, 0.1, -0.35, -0.2, -0.1, 0.22, 0, 0];              // deep breath out
const E_GLOAT = [0.55, 0, 0.2], E_HMM = [0, 0.45, 0], E_BLUSH = [0, 0, 0.45];   // extras: [sneer, pucker, blush]
const XCH = [BROW, BROWY, EYE, MCURVE, MWIDTH, MOPEN, MTILT, SQUINT];
// attention kinds (menus): the viewer (camera), a neighbour kid, an idle glance
const K_NONE = 0, K_VIEWER = 1, K_NEIGHBOUR = 2, K_GLANCE = 3;
const EYE_MID = new THREE.Vector3(0, 0.188, 0.15);   // between the eyes, head-bone space
/** Lid closure of a blink `b` (close c · hold h · open o, seconds) at time t: accelerating close, quick-start open. */
function blinkCurve(b, t) {
  if (t <= 0) return 0;
  if (t < b.c) { const u = t / b.c; return u * u; }
  t -= b.c; if (t < b.h) return 1;
  t -= b.h; if (t < b.o) return Math.pow(1 - t / b.o, 2.2);
  return 0;
}
/** every live character (menus: neighbours to glance at; bus reactions) */
const LIVE = new Set();
// game-bus reactions (one subscription for all kids): splatting someone → a lopsided grin; an ally going down nearby →
// a wince. Pure face acting — no gameplay coupling.
let _busOn = false;
function hookBus() {
  if (_busOn) return; _busOn = true;
  on('splatted', (e) => {
    const k = e && e.attacker && e.attacker.character, v = e && e.victim;
    if (k && v && k !== v.character && k.kidForm) { k._mxPlay(X_GLOAT, 0.95, 0.14, 0.7 + k.rng() * 0.4, 0.6, 0.35, E_GLOAT); k.sp[S_EARL + 1] += 3; k.sp[S_EARR + 1] += 3; }
    if (!v || !v.character) return;
    for (const c of LIVE) {
      const a = c.actor;
      if (!a || a === v || a.team !== v.team || !c.inWorld || !c.kidForm) continue;
      if (c.root.position.distanceToSquared(v.character.root.position) < 14 * 14) c._mxPlay(X_OOF, 0.4, 0.1, 0.35, 0.6);
    }
  });
}
function addExpr(P, X, w) { if (w <= 0.001) return; for (let i = 0; i < 8; i++) P[XCH[i]] += X[i] * w; }

const FIDGETS = ['goggles', 'twirl', 'look', 'stretch', 'tank', 'bounce', 'shake'];
const K_GOG_T = [0, 0.3, 0.45, 0.62, 0.8, 1.0, 1.35], K_GOG_V = [0, 1, 1, 1, 1, 1, 0];
const K_LOOK_T = [0, 0.35, 0.9, 1.25, 1.8, 2.3], K_LOOK_V = [0, 0.75, 0.75, -0.7, -0.7, 0];
const K_TANK_T = [0, 0.3, 1.0, 1.3], K_TANK_V = [0, 1, 1, 0];
const K_MENU_T = [0, 1.2, 1.8, 3.0, 3.5, 5.0, 5.6, 8], K_MENU_V = [0, 0, 0.5, 0.5, -0.4, -0.4, 0.05, 0];
// kid ⇄ squid gesture keys (see _updateFormScales): EM = squid → kid (emerge), DV = kid → squid (dive)
const K_EM_ST = [0, 0.03, 0.07, 0.095], K_EM_SY = [1, 0.72, 1.42, 1.6], K_EM_SX = [1, 1.18, 0.78, 0.62];
const K_EM_KT = [0.045, 0.1, 0.16, 0.24, 0.32, 0.42], K_EM_KY = [1.36, 1.13, 0.88, 1.05, 0.985, 1], K_EM_KX = [0.68, 0.9, 1.09, 0.975, 1.008, 1];
const K_DV_KT = [0, 0.03, 0.07, 0.095], K_DV_KY = [1, 0.82, 0.34, 0.16], K_DV_KX = [1, 1.1, 1.4, 1.2];
const K_DV_ST = [0.045, 0.08, 0.13, 0.2, 0.28, 0.38], K_DV_SY = [0.3, 0.72, 1.3, 0.9, 1.045, 1], K_DV_SX = [1.5, 1.2, 0.83, 1.07, 0.98, 1];
const _dAxis = new THREE.Vector3(), _dQ = new THREE.Quaternion(), _dC = new THREE.Vector3(), _fwdZ = new THREE.Vector3(0, 0, 1);
// weapons animated with another kind's pose family (this.animKind); every other kind is its own family
const ANIM_OF = { twins: 'shooter', brush: 'roller', sp_blower: 'shooter', sp_jetgun: 'blaster', sp_stamp: 'roller' };
// families too heavy / long for the idle and dance weapon twirls
const NO_TWIRL = { roller: true, charger: true, spinner: true, bucket: true, sp_zooka: true, sp_stamp: true };
// ---- Canopy Brolly (kits/brolly.js): held and aimed like a shooter
ANIM_OF.brolly = 'shooter';
// ---- Sponge Mitts (kits/mitts.js): a sponge boxing glove in each fist (dual wield), a boxer's guard in front of the
// face; punches / leap-charge crouch / leap / wall cling are layered on by _poseMitts
HOLD.mitts = {
  dual: true,
  carry: { p: [-0.125, 0.87, 0.15], r: [-0.25, 0.32, 0.12] }, twoCarry: 0,
  run: { p: [-0.13, 0.86, 0.16], r: [-0.1, 0.28, 0.1] },
  aim: { p: [-0.085, 0.03, 0.2], r: [-0.12, 0.2, 0.05] }, twoAim: 0,
  poleR: [-0.9, -0.6, -0.1], poleL: [0.9, -0.6, -0.1],
  rc: { kick: 0.012, back: 0.004, hz: 7, z: 0.8, jit: 0.01, torso: 0.05, head: 0.03, crouch: 0.002, brace: 0 },
  hip: -0.14, chest: 0.06, crouch: 0.03,
  stance: [0.12, 0.07, 0.3, -0.115, -0.07, -0.34],
  raise: { p: [-0.16, 1.26, 0.12], r: [-1.2, 0.3, 0.1] },
  lobby: { p: [-0.13, 0.95, 0.17], r: [-0.35, 0.4, 0.1] }, lobbyTwo: 0,
};
NO_TWIRL.mitts = true;
// punch extension over time since that glove fired (out in 45 ms, back by 210 ms) · a kid-space point pushed onto the
// wall plane p·n = wd (n = the wall normal in kid space), `off` metres out from it (o = [x, z])
const mitPunch = (u) => (u < 0.045 ? easeOut(u / 0.045) : u < 0.21 ? 1 - ease((u - 0.045) / 0.165) : 0);
function mitOnWall(x, z, off, nx, nz, wd, o) { const d = x * nx + z * nz - wd - off; o[0] = x - nx * d; o[1] = z - nz * d; return o; }
// ---- Tideline Bow (kits/bow.js; model + part animation in kits/bow-model.js). Animates as the charger family but
// with its own HOLD (setWeapon prefers HOLD[kind]). The weapon origin is the nock on the string in the RIGHT fist; the
// left fist holds the riser `brace` ahead. The anchors below are the undrawn (string at rest) fist; poseBow pulls that
// fist back along the arrow by drawLen × draw (the model slides the bow forward by as much, so the bow arm stays put)
// and cants the bow on its side on the ground (the fan flies flat) / upright in the air (the fan flies upright).
ANIM_OF.bow = 'charger';
HOLD.bow = {
  fire: 'charge',
  carry: { p: [-0.2, 0.72, 0.14], r: [0.8, -0.15, -0.55] }, twoCarry: 1,
  aim: { p: [-0.14, 0.16, 0.33], r: [0, 0.03, 0] }, twoAim: 1,         // full draw: the fist beside the right cheek
  poleR: [-1, 0.3, -0.45], poleL: [0.6, -0.5, 0.1],
  rc: { kick: 0.06, back: 0.04, hz: 5, z: 0.5, jit: 0.01, torso: 0.25, head: 0.1, crouch: 0.01, brace: 0 },
  hip: -0.9, chest: -0.8, crouch: 0.02,                                  // side-on: the bow shoulder leads
  stance: [0.112, 0.085, 0.3, -0.098, -0.085, -0.78],
  raise: { p: [-0.17, 1.22, 0.1], r: [-1.05, 0.3, -0.3] },
  lobby: { p: [-0.12, 0.76, 0.2], r: [0.5, 0.35, 0.1] }, lobbyTwo: 1,
};
const BOW_CANT = -0.85;   // roll of the whole bow about the arrow on the ground (rad; top limb to the kid's left)
function poseBow(ch, P, dt) {
  const w = ch.weapon, len = w.def.drawLen || 0.2;
  // draw 0..1: a quick first pull, heavier toward full. After a release the fist holds at the cheek a beat, then eases
  // forward to the string again (the model snaps the string home by itself)
  const c = clamp(ch.charge, 0, 1);
  if (ch.lastRelease < (ch._bowLR ?? 99)) ch._bowHold = ch._bowDraw || 0;
  ch._bowLR = ch.lastRelease;
  let draw = 1 - (1 - c) * (1 - c);
  if (ch.lastRelease < 0.5 && c < 0.05) draw = Math.max(draw, (ch._bowHold || 0) * (1 - ease((ch.lastRelease - 0.1) / 0.3)));
  ch._bowDraw = draw; w.bowDraw = draw;
  // the fist back along the arrow (the weapon's +Z, in kid space)
  _e1.set(P[ANCR], P[ANCR + 1], P[ANCR + 2], 'YXZ');
  _v1.set(0, 0, -len * draw).applyEuler(_e1);
  P[ANC] += _v1.x; P[ANC + 1] += _v1.y; P[ANC + 2] += _v1.z;
  // cant (eased, so a jump visibly swings the bow upright)
  ch._bowCant = damp(ch._bowCant ?? BOW_CANT, ch.grounded ? BOW_CANT : 0, 12, dt);
  P[ANCR + 2] += ch._bowCant * ch.wAim;
}
const HOLD_HERO = { p: [-0.14, 1.05, 0.25], r: [-0.35, 0.35, -0.2] };
const K_SL_T = [0, 0.13, 0.25, 0.4, 0.62];
const K_SL_X = [0, -0.08, 0.02, 0.025, 0], K_SL_Y = [0, -0.22, 0.24, 0.33, 0], K_SL_Z = [0, -0.34, 0.04, -0.04, 0];
const K_SL_P = [0, -0.55, 1.5, 1.95, 0], K_SL_W = [0, 0.32, -0.08, -0.14, 0];

function setAnc(D, h) { setE(D, ANC, h.p[0], h.p[1], h.p[2]); setE(D, ANCR, h.r[0], h.r[1], h.r[2]); }
const FIDGET_LEN = [1.35, 1.2, 2.3, 1.9, 1.3, 1.25, 0.95];
const DANCE_VARIANTS = { victory: 3, defeat: 3 };
const FINGER_SPREAD = [-0.1, -0.03, 0.04, 0.11]; // index … pinky, about local X (fan toward the thumb / away)

// ------------------------------------------------------------------------------------------------
// Character
// ------------------------------------------------------------------------------------------------
export class Character {
  /**
   * @param {{color?: THREE.Color|string, weapon?: string, style?: {hair?: number, skin?: number, outfit?: number, eyes?: number}, name?: string, isLocal?: boolean}} opts
   */
  constructor(opts = {}) {
    this.name = opts.name || 'Squidkid';
    this.isLocal = !!opts.isLocal;
    const st = opts.style || {};
    const seed = hashStr(this.name);
    this.seed = seed;
    this.style = resolveStyle(st, seed);
    this.rng = mulberry(seed);
    this.color = new THREE.Color();
    this.enemyColor = new THREE.Color('#2f5bff');
    /** Distance from root to the wall surface while climbing (engine keeps the player centre this far off the wall). */
    this.climbInset = PLAYER.radius;

    this.root = new THREE.Group(); this.root.name = 'squidkid:' + this.name;
    this.model = new THREE.Group(); this.root.add(this.model);
    this.kid = new THREE.Group(); this.model.add(this.kid);
    this.squidRoot = new THREE.Group(); this.model.add(this.squidRoot);

    // materials
    const u = this.u = makeCharUniforms();
    // outfit colourway / pattern / iris (+ any face uniforms) come from the appearance stream's catalogue
    if (typeof STYLE.applyStyleUniforms === 'function') STYLE.applyStyleUniforms(u, this.style);
    else {
      const outfit = OUTFITS[this.style.outfit];
      u.uShirt.value.set(outfit.shirt); u.uShorts.value.set(outfit.shorts); u.uShoe.value.set(outfit.shoe);
      u.uSole.value.set(outfit.sole); u.uSock.value.set(outfit.sock); u.uStrap.value.set(outfit.strap); u.uPattern.value = outfit.pattern;
      u.uIris.value.set(IRIS[this.style.eyes][0]); u.uIris2.value.set(IRIS[this.style.eyes][1]);
    }
    u.uHurtSeed.value = (seed % 997) * 0.37;
    this.mats = {
      skin: makeSkinMaterial(u, SKIN_TONES[this.style.skin]),
      cloth: makeClothMaterial(u),
      hair: makeHairMaterial(u),
      dark: getDarkMaterial(),
      eye: makeEyeMaterial(u),
      fill: makeInkFillMaterial(),
      squid: makeSquidMaterial(u),
      squidGhost: makeSquidMaterial(u, true),
      glow: makeGlowMaterial(),
    };
    u.uIwRim = { value: new THREE.Vector4(0, 0, 0, 3) }; u.uIwRimL = { value: new THREE.Vector3(0, 0, 1) }; u.uIwFill = { value: new THREE.Color(0, 0, 0) };
    withRim(this.mats.skin, u, 1.0); withRim(this.mats.cloth, u, 0.7); withRim(this.mats.hair, u, 1.2);

    // LOD (see _updateLod): active tier, cross-fade state, the last camera this kid was drawn with (menus / labs)
    this.lod = { tier: -1, to: -1, f: 0, px: 0, force: -1, fadeOut: { value: new THREE.Vector2(0, 1) }, fadeIn: { value: new THREE.Vector2(0, -1) } };
    this.matsD = [{}, {}]; this._ownMats = [];
    this._camPos = new THREE.Vector3(); this._camE5 = 1.5; this._camVH = 900; this._camOK = false; this._rendered = false; this._camFrame = -1;
    this._camHook = (renderer, scene, camera) => {
      if (!camera || !camera.isPerspectiveCamera) return;
      this._camPos.setFromMatrixPosition(camera.matrixWorld); this._camE5 = camera.projectionMatrix.elements[5];
      const rt = renderer.getRenderTarget();
      this._camVH = rt ? rt.height / (renderer.getPixelRatio() || 1) : renderer.getSize(_vVH).y;
      this._camOK = true; this._rendered = true; this._camFrame = renderer.info.render.frame;
    };

    this._buildRig();
    this._buildTank();
    this._buildBomb();
    this._buildSquid();
    this._tierProps(this.lod.tier);
    this.weapons = {};
    this.weaponKind = null; this.animKind = null;

    // ---- animation state ----
    this.P = new Float32Array(PN); this.PD = new Float32Array(PN); this.PX = new Float32Array(PN); this.PY = new Float32Array(PN);
    this.sp = new Float32Array(SPN);
    this.tr = new Float32Array(TN).fill(99);
    this.t = 0;
    // root motion
    this.rp = new THREE.Vector3(); this.rv = new THREE.Vector3(); this.ra = new THREE.Vector3(); this.rootInit = false;
    this.yaw = 0; this.prevYaw = 0; this.yawRate = 0; this.kvx = 0; this.kvz = 0; this.kax = 0; this.kaz = 0;
    this.hs = 0; this.gv = 0; this.gs = 0; this.gvx = 0; this.gvz = 0; this.tread = false; this.tvx = 0; this.tvz = 0;
    this.mdx = 0; this.mdz = 1; this.hipTwist = 0; this.vyS = 0; this.gnd = 9; this.airT = 0; this.grounded = true;
    // gait
    this.phase = 0; this.moving = false; this.gaitW = 0; this.runW = 0; this.duty = 0.6; this.cad = 1.5; this.liftH = 0.06;
    this.feet = [this._mkFoot(0), this._mkFoot(1)]; this.feetValid = false; this.replant = true; this.settleCd = 0; this.plantW = 1;
    this.stance = Float32Array.from(STANCE_IDLE); this.footTwist = 0; this.hipDrop = 0; this.stVar = new Float32Array(6); this.shufT = 4 + this.rng() * 6;
    this.stepOfsX = 0; this.stepOfsZ = 0;
    // weights
    this.wSub = 0; this.wAim = 0; this.wRoll = 0; this.wAir = 0; this.wDance = 0; this.wTwo = 0; this.wGlow = 0; this.wLow = 0; this.wTired = 0; this.wGoo = 0;
    this.exert = 0; this.brPh = 0; this.idleT = 0; this.shiftT = 2 + this.rng() * 3; this.shiftTgt = 1;
    this.carryT = 0;   // s left of "carried" (a moving platform under us this frame, held 1 s after it stops)
    this.fidget = -1; this.fidgetT = 0; this.nextFidget = 3 + this.rng() * 3;
    this.lastShot = 99; this.lastRelease = 99; this.charge = 0; this.chargeFlash = 0; this.fullT = 0; this.fireHold = 0; this._fireWant = 0;
    this.lReach = 0; this.ikErrPre = 0; this.leapEnd = -1; this.landAmp = 0; this.hitX = 0; this.hitZ = 1; this.hitAmp = 1; this.hitAcc = 0; this.slamGround = false;
    this.dance = null; this.danceT = 0; this.prevDance = null; this.prevDanceT = 0; this.danceFade = 1; this.lastDance = null;
    this.danceVar = 0; this.danceOfs = frac(seed * 0.61803) * 2.3;
    this.form = 'kid'; this.formPrev = 'kid'; this.formT = 99;
    this.kidScale = 1; this.sqScale = 0; this.kidPop = 1;
    // face: blinks (per-eye close amounts from one blink clock, the right eye trailing by a few ms), gaze (ballistic
    // saccades + fixation micro-saccades), attention target (root-space point), micro-expression impulses
    this.blinkK = 0; this.blinkL = 0; this.blinkR = 0;
    this.bl = { t: -1, c: 0.08, h: 0.03, o: 0.16, amp: 1, lag: 0.008, next: 0.6 + this.rng() * 2.5, dbl: false, squeeze: 0 };
    this.gz = { x: 0, y: 0, x0: 0, y0: 0, x1: 0, y1: 0, st: -1, sd: 0.05, fx: 0, fy: 0, mx: 0, my: 0, mT: 0.5 };
    this.att = { kind: K_NONE, prev: K_NONE, t: 0.3 + this.rng() * 0.8, p: new THREE.Vector3(0, 1.2, 5), on: false, who: null, gy: 0, gp: 0, dist: 5 };
    this.mx = []; for (let i = 0; i < 6; i++) this.mx.push({ X: null, w: 0, t: 99, a: 0.1, h: 0.2, d: 0.4, bras: 0 });
    this.mxT = 2 + this.rng() * 4; this.extGl = 0; this._headQW = new THREE.Quaternion(); this._headSet = false;
    this.brN = 0; this.brAmp = 1; this.brRate = 1; this.sighT = 4 + this.rng() * 5; this.sigh = 0;
    this.gripT = 4 + this.rng() * 5; this.eyeX = 0; this.eyeY = 0;
    this.face = { blinkL: 0, blinkR: 0, lidL: 0, lidR: 0, squintL: 0, squintR: 0, gazeX: 0, gazeY: 0, verge: 0, pupil: 0.5,
      browInL: 0, browInR: 0, browOutL: 0, browOutR: 0, furrow: 0, curve: 0.75, width: 1, open: 0, tilt: 0, jaw: 0, smile: 0, sneer: 0, pucker: 0, breath: 0 };
    LIVE.add(this); hookBus(); this.lifeLv = 2; this._hairAcc = 0; this._hairOdd = false;
    this.lookT = 0.5 + this.rng(); this.lookActor = null; this.lookYaw = 0; this.lookPitch = 0; this.glanceYaw = 0; this.glancePitch = 0;
    this.actor = null; this.team = -1; this._ownT = 0;
    this.xw = new Float32Array(12); // smoothed expression weights
    this.inkS = 1; this.hurt = 0; this.slosh = 0;
    // squid
    this.hopPhase = 0; this.hopAir = false; this.sqYaw = 0; this.sqPos = new THREE.Vector3(); this.sqQuat = new THREE.Quaternion(); this.sqInit = false;
    this.sqBlink = 0; this.sqRoll = 0;
    this.drumAngle = 0; this.visible = true; this.ikErr = [0, 0, 0, 0];
    // hair springs
    const n = HAIR_MAX * HAIR_SEGS * 3;
    this.hx = new Float32Array(n); this.hv = new Float32Array(n);
    this.tipX = new Float32Array(HAIR_MAX * 3); this.tipV = new Float32Array(HAIR_MAX * 3);
    this.headRY = 0; this.headRZ = 0; this.earT = 3 + this.rng() * 4; this.bombHeld = false; this.bombT = 0; this._subPrev = false;
    this.headPrevPos = new THREE.Vector3(); this.headPrevVel = new THREE.Vector3(); this.headAcc = new THREE.Vector3(); this.headVel = new THREE.Vector3(); this.headPrevQuat = new THREE.Quaternion(); this.headInit = false;
    // events
    this._fsPos = new THREE.Vector3(); this._fsData = { foot: 'L', pos: this._fsPos, speed: 0 };
    this._fL = new THREE.Vector3(); this._fR = new THREE.Vector3(); this._fLq = new THREE.Quaternion(); this._fRq = new THREE.Quaternion();
    this.kgx = 0; this.kgz = 0; this.shiftS = 0; this.armR = 0; this.aimP = 0; this.rcP = 0; this.rcZ = 0; this._effort = 0; this._toeUp = 0; this._tapped = false; this.lastFidget = -1; this.inWorld = false; this.phys = null; this.kidForm = true;
    this._hpPos = new THREE.Vector3(); this._hpData = { pos: this._hpPos };
    // weapon kinds (arsenal): dual wield, dodge roll + lock stance, slosh, splatling spin
    this.jumpRun = 0; this.jumpLead = 0;
    this.kidSY = 1; this.kidSXZ = 1; this.sqSY = 1; this.sqSXZ = 1; this.kidLift = 0;
    this.tumble = 0; this.tumbleX = 1; this.tumbleZ = 0; this.tumbleDrop = 0; this._dt = 0;
    // fork kinds: specials hide the held weapon / sub prop; brush swipe side; spinner barrels; twins dodge tumble
    this.weaponHidden = false; this.subPropHidden = false; this.swipeSide = 1; this.spinRate = 0; this.spinAngle = 0; this.dodge = null;
    this.dual = false; this.armL = 0; this.rcP2 = 0; this.rcZ2 = 0; this.dodgeX = 0; this.dodgeZ = 1; this.dodgeDur = 0.3; this.lockW = 0; this.spinW = 0; this.streamW = 0; this.bombSwap = 0;
    this._wst = { t: 0, dt: 0, color: this.color, near: true, hand: 0, runner: null, sinceShoot: 99, sinceFlick: 99, sinceRelease: 99,
      charge: 0, full: false, chargeFlash: 0, lowInk: 0, firing: false, rolling: 0, grounded: true, groundSpeed: 0, worldQuat: null };
    this._wq = new THREE.Quaternion();

    this.setColor(opts.color ?? '#ff8a14');
    this.setWeapon(opts.weapon || 'shooter');
    poseNeutral(this.P);
  }

  _mkFoot(i) {
    return {
      i, side: i === 0 ? 1 : -1, name: i === 0 ? 'L' : 'R',
      pw: new THREE.Vector3(), yaw: 0, n: new THREE.Vector3(0, 1, 0), planted: true, inSt: true, stU: 0.5, stT: 1,
      sw: false, mode: M_SETTLE, su: 0, dur: 0.2, from: new THREE.Vector3(), to: new THREE.Vector3(), fromYaw: 0, toYaw: 0,
      lift: 0.06, toe: 0, land: 0, tn: new THREE.Vector3(0, 1, 0),
      cw: new THREE.Vector3(), cyaw: 0, pitch: 0, cn: new THREE.Vector3(0, 1, 0),
      disp: new THREE.Vector3(), dispYaw: 0, dispOK: false,
    };
  }

  // ---------------------------------------------------------------------------------------------
  _buildRig() {
    const hair = getHairStyle(this.style);   // keyed on the style object (hair + hat + brows)
    this.hairMeta = hair.meta;
    const rest = getRestPositions(this.style);
    const bones = []; const byName = {};
    const yxz = new Set(['hips', 'spine', 'chest', 'neck', 'head', 'clavL', 'clavR']);
    for (const n of BONE_NAMES) {
      const b = new THREE.Bone(); b.name = n; byName[n] = b; bones.push(b);
      if (yxz.has(n)) b.rotation.order = 'YXZ';
    }
    for (const n of BONE_NAMES) {
      const p = BONE_PARENT[n]; const b = byName[n];
      if (p) { byName[p].add(b); b.position.copy(rest[n]).sub(rest[p]); } else { this.kid.add(b); b.position.copy(rest[n]); }
    }
    this.bones = byName; this.boneList = bones;
    this.rest = rest;
    this.skeleton = new THREE.Skeleton(bones, getBoneInverses(this.style));
    // body meshes live in LOD tiers (character-lod.js): hero / game / far sets, each built on first use and all bound to
    // this one skeleton; _updateLod shows one (or two, dither cross-fading). Starts on the game tier.
    this.lodSets = [null, null, null];
    this._setTier(T_GAME);
    // limb constants for IK (rest directions / lengths)
    const lim = (up, lo, end, h0) => {
      const a = this.bones[lo].position.length(), b = this.bones[end].position.length();
      const ru = this.bones[lo].position.clone().normalize(), rf = this.bones[end].position.clone().normalize();
      const mk0 = (r) => { const h = h0.clone().addScaledVector(r, -h0.dot(r)).normalize(); const c = new THREE.Vector3().crossVectors(r, h); return new THREE.Matrix4().makeBasis(r, h, c).transpose(); };
      return { up: this.bones[up], lo: this.bones[lo], end: this.bones[end], a, b, Mu0T: mk0(ru), Mf0T: mk0(rf) };
    };
    this.limbs = {
      armL: lim('uArmL', 'fArmL', 'handL', new THREE.Vector3(-1, 0, 0)),
      armR: lim('uArmR', 'fArmR', 'handR', new THREE.Vector3(-1, 0, 0)),
      legL: lim('thighL', 'shinL', 'footL', new THREE.Vector3(1, 0, 0)),
      legR: lim('thighR', 'shinR', 'footR', new THREE.Vector3(1, 0, 0)),
    };
    this.legReach = (this.limbs.legL.a + this.limbs.legL.b) * 0.985;
    this.faceRest = { browL: this.bones.browL.position.clone(), browR: this.bones.browR.position.clone() };
    // hair: bone refs + per-strand "into the head" direction (head-bone space) so the springs never swing through it
    this.hairBones = [];
    for (let s = 0; s < HAIR_MAX; s++) for (let k = 0; k < HAIR_SEGS; k++) this.hairBones.push(this.bones[`hair${s}_${k}`]);
    this.hairIn = new Float32Array(HAIR_MAX * 3);
    const hc = rest.head.clone().add(HEAD_CTR);
    for (let s = 0; s < this.hairMeta.length; s++) {
      const r0 = rest[`hair${s}_0`]; if (!r0) continue;
      _v1.subVectors(hc, r0).normalize();
      this.hairIn[s * 3] = _v1.x; this.hairIn[s * 3 + 1] = _v1.y; this.hairIn[s * 3 + 2] = _v1.z;
    }
    // optional bones added by the modelling stream (docs/RIG.md) — animated when present
    const opt = (n) => this.bones[n] || null;
    this.xb = {
      jaw: opt('jaw'), lidL: opt('lidL'), lidR: opt('lidR'), tank: opt('tank'), hem: opt('hem'), hemF: opt('hemF'), hemB: opt('hemB'),
      toeL: opt('toeL'), toeR: opt('toeR'), earL: opt('earL'), earR: opt('earR'), cheekL: opt('cheekL'), cheekR: opt('cheekR'),
    };
    this.cheekRest = [this.xb.cheekL ? this.xb.cheekL.position.clone() : null, this.xb.cheekR ? this.xb.cheekR.position.clone() : null];
    // articulated hands (docs/RIG.md → Fingers): rest = power grip, curl about local Z (sign flips per side)
    this.fing = [null, null];
    for (let sd = 0; sd < 2; sd++) {
      const sn = sd === 0 ? 'L' : 'R';
      const t1 = this.bones[`hand${sn}_thumb1`], t2 = this.bones[`hand${sn}_thumb2`];
      const f1 = [], f2 = [];
      for (const fn of ['index', 'middle', 'ring', 'pinky']) { const b1 = this.bones[`hand${sn}_${fn}1`], b2 = this.bones[`hand${sn}_${fn}2`]; if (b1 && b2) { f1.push(b1); f2.push(b2); } }
      this.fing[sd] = t1 && t2 && f1.length === 4 ? { t1, t2, f1, f2 } : null;
    }
    this.handS = new Float32Array([1, 0]); // smoothed hand shapes (L, R)
    // tentacle tips: one more spring stage after hair{s}_2
    this.hairTips = [];
    for (let s = 0; s < HAIR_MAX; s++) this.hairTips.push(this.bones[`hairTip${s}`] || null);
    // per segment (+ tip): its own axis (rest direction to the next joint — bones have identity rest orientation, so
    // that is also the axis in the bone's local frame) and two bend axes for the idle life: A1 = coil in/out of the
    // head (curl plane), A2 = sideways. Hair: the strands are LBS ribbons — twist about the segment axis collapses
    // their section, so the springs project it out (see _updateHair).
    const NS = HAIR_MAX * (HAIR_SEGS + 1);
    this.hairAx = new Float32Array(NS * 3); this.hairA1 = new Float32Array(NS * 3); this.hairA2 = new Float32Array(NS * 3);
    this.hairPh = new Float32Array(HAIR_MAX);
    for (let s = 0; s < this.hairMeta.length; s++) {
      this.hairPh[s] = this.rng() * TAU;
      for (let k = 0; k <= HAIR_SEGS; k++) {
        const a = rest[k < HAIR_SEGS ? `hair${s}_${k}` : `hairTip${s}`], b = k < HAIR_SEGS - 1 ? rest[`hair${s}_${k + 1}`] : k === HAIR_SEGS - 1 ? rest[`hairTip${s}`] : null;
        if (!a) continue;
        if (b) _v1.subVectors(b, a); else _v1.set(this.hairAx[(s * (HAIR_SEGS + 1) + k - 1) * 3], this.hairAx[(s * (HAIR_SEGS + 1) + k - 1) * 3 + 1], this.hairAx[(s * (HAIR_SEGS + 1) + k - 1) * 3 + 2]);
        if (_v1.lengthSq() < 1e-10) _v1.set(0, -1, 0);
        _v1.normalize();
        _v2.subVectors(a, hc).normalize();                       // out of the head
        _v3.crossVectors(_v1, _v2); if (_v3.lengthSq() < 1e-8) _v3.set(1, 0, 0); _v3.normalize();
        _v4.crossVectors(_v1, _v3).normalize();
        const j = (s * (HAIR_SEGS + 1) + k) * 3;
        this.hairAx[j] = _v1.x; this.hairAx[j + 1] = _v1.y; this.hairAx[j + 2] = _v1.z;
        this.hairA1[j] = _v3.x; this.hairA1[j + 1] = _v3.y; this.hairA1[j + 2] = _v3.z;
        this.hairA2[j] = _v4.x; this.hairA2[j + 1] = _v4.y; this.hairA2[j + 2] = _v4.z;
      }
    }
  }

  // the sub prop held in the left hand while a throw is aimed (any sub kind; see getSubDef)
  _buildBomb(kind = 'bomb') {
    const d = getSubDef(kind);
    const g = new THREE.Group(); g.position.copy(d.inHandL.pos); g.quaternion.copy(d.inHandL.quat);
    const body = new THREE.Mesh(d.body, getPlasticMaterial()); body.castShadow = true;
    const ink = new THREE.Mesh(d.ink, getInkMaterial(this.color)); ink.castShadow = true;
    g.add(body, ink);
    let spinInk = null;
    if (d.spin) { const sp = new THREE.Mesh(d.spin, getPlasticMaterial()); sp.castShadow = true; g.add(sp); }
    if (d.spinInk) { spinInk = new THREE.Mesh(d.spinInk, getInkMaterial(this.color)); g.add(spinInk); }
    if (d.glow) g.add(new THREE.Mesh(d.glow, this.mats.glow));
    g.visible = false;
    this.bones.handL.add(g);
    this.bomb = { group: g, ink, spinInk, kind };
  }
  setSub(kind) {
    if (this.bomb && this.bomb.kind === kind) return;
    if (this.bomb) this.bones.handL.remove(this.bomb.group);
    this._buildBomb(kind);
  }

  _buildTank() {
    const sh = getKidShared(); const T = sh.tank;
    const g = new THREE.Group(); g.position.copy(T.offset); g.rotation.x = T.tilt;
    (this.xb.tank || this.bones.chest).add(g);
    if (this.xb.tank) g.position.sub(this.xb.tank.position);
    const glass = new THREE.Mesh(T.glass, getGlassMaterial()); glass.renderOrder = 2;
    const fill = new THREE.Mesh(T.fill, this.mats.fill); fill.position.y = T.fillBottom; fill.castShadow = false;
    g.add(fill); g.add(glass);
    this.tank = { group: g, glass, fill, h: T.fillHeight, bottom: T.fillBottom, tilt: T.tilt };
  }

  _buildSquid() {
    const sh = getKidShared().squid;
    const pivot = new THREE.Group(); this.squidRoot.add(pivot);
    const body = new THREE.Mesh(sh.body, this.mats.squid); body.castShadow = true; body.receiveShadow = true;
    const ghost = new THREE.Mesh(sh.body, this.mats.squidGhost); ghost.renderOrder = 3; ghost.visible = false;
    const dark = new THREE.Mesh(sh.dark, this.mats.dark);
    const eyes = new THREE.Mesh(sh.eyes, this.mats.eye);
    pivot.add(body, ghost, dark, eyes);
    this.squid = { pivot, body, ghost, dark, eyes };
    this.squidRoot.visible = false;
  }

  _getWeapon(kind) {
    if (this.weapons[kind]) return this.weapons[kind];
    const d = getWeaponDef(kind);
    const w = this._weaponInstance(d, false);
    // dual wield: a second instance of the same weapon in the LEFT fist (docs: character-weapons.js getWeaponDef)
    if (d.dual && d.inHandL) w.left = this._weaponInstance(d, true);
    if (d.mirrorDual) {
      // twins: the same gun mirrored across the body's X axis into the left fist (reflection: p → (-x, y, z),
      // q → (x, -y, -z, w)); a static copy that rides the left hand's pose (no parts, no second anchor)
      const pivotL = new THREE.Group(); pivotL.position.set(-FIST_OFFSET.x, FIST_OFFSET.y, FIST_OFFSET.z);
      const offL = new THREE.Group();
      offL.position.copy(d.inHand.pos).sub(FIST_OFFSET); offL.position.x = -offL.position.x;
      offL.quaternion.set(d.inHand.quat.x, -d.inHand.quat.y, -d.inHand.quat.z, d.inHand.quat.w);
      const mir = new THREE.Group(); mir.scale.set(-1, 1, 1);
      const bodyL = new THREE.Mesh(d.body, getPlasticMaterial()); bodyL.castShadow = true;
      const inkL = new THREE.Mesh(d.ink, getInkMaterial(this.color)); inkL.castShadow = true;
      mir.add(bodyL, inkL); offL.add(mir); pivotL.add(offL);
      w.pivotL = pivotL; w.inkL = inkL;
    }
    this.weapons[kind] = w;
    return w;
  }

  /** One held weapon: pivot at the fist's grip axis (twirls spin about the handle) → off = weapon space. */
  _weaponInstance(d, left) {
    const hole = left ? GRIP_HOLE_L : FIST_OFFSET, inHand = left ? d.inHandL : d.inHand;
    const pivot = new THREE.Group(); pivot.position.copy(hole);
    const off = new THREE.Group(); off.position.copy(inHand.pos).sub(hole); off.quaternion.copy(inHand.quat);
    // NB: inHand.pos is relative to the hand origin; the pivot sits at the fist, rotation-free at twirl 0.
    pivot.add(off);
    // two LODs: near = static shell + animated parts (trigger, bolts, pump, gauge, lamps…); far = the complete weapon
    // merged at rest (2 draws, like before) — toggled by camera distance in _animWeapon
    const body = new THREE.Mesh(d.bodyStatic || d.body, getPlasticMaterial()); body.castShadow = true;
    const ink = new THREE.Mesh(d.inkStatic || d.ink, getInkMaterial(this.color)); ink.castShadow = true;
    const bodyFar = new THREE.Mesh(d.body, getPlasticMaterial()); bodyFar.castShadow = true; bodyFar.visible = false;
    const inkFar = new THREE.Mesh(d.ink, getInkMaterial(this.color)); inkFar.castShadow = true; inkFar.visible = false;
    off.add(body, ink, bodyFar, inkFar);
    const parts = {}, partList = [], lamps = [];
    for (const k in d.parts || {}) {
      const pd = d.parts[k];
      const g = new THREE.Group(); g.position.copy(pd.pivot);
      const mat = pd.mat === 'ink' ? getInkMaterial(this.color) : pd.mat === 'lamp' ? makeLampMaterial(pd.lamp) : getPlasticMaterial();
      const m = new THREE.Mesh(pd.geo, mat); m.onBeforeRender = partGate;
      g.add(m); off.add(g);
      g.userData = { mesh: m, rest: pd.pivot, mat: pd.mat };
      parts[k] = g; partList.push(g);
      if (pd.mat === 'lamp') lamps.push(mat);
    }
    let glow = null, drum = null, coil = null;
    if (d.glow) { coil = makeCoilMaterial(); coil.emissive.copy(this.color); glow = new THREE.Mesh(d.glow, coil); off.add(glow); }
    if (d.drum) {
      drum = new THREE.Group(); drum.position.copy(d.drumAt);
      const dm = new THREE.Mesh(d.drum, getInkMaterial(this.color)); dm.castShadow = true;
      const dc = new THREE.Mesh(d.drumCaps, getPlasticMaterial());
      drum.add(dm, dc); off.add(drum); drum.userData.ink = dm;
    }
    let spin = null;
    if (d.spin && !left) {
      // spinner / zooka: the barrel cluster turns about its own axis (weapon +Z through spinAt); geometry is authored in
      // weapon space. Driven by this character (_applyPose), not animateWeapon.
      spin = new THREE.Group(); spin.position.copy(d.spinAt);
      const sm = new THREE.Mesh(d.spin, getPlasticMaterial()); sm.castShadow = true; sm.position.copy(d.spinAt).negate();
      spin.add(sm); off.add(spin);
    }
    const muzzle = new THREE.Object3D(); muzzle.position.copy(d.muzzle); off.add(muzzle);
    // part state (pump, trig, ps, drum, spin…) is owned by animateWeapon (character-weapons.js); pump/trig read here
    return { def: d, pivot, off, body, ink, bodyFar, inkFar, glow, drum, muzzle, parts, partList, lamps, coil, near: true, pump: 0, trig: 0, left: null, hidden: 0, spin, pivotL: null, inkL: null };
  }

  // Dodge roll (twin pistols): one forward tumble about the body centre toward the roll direction, ~0.3 s.
  _updateDodge(dt) {
    const m = this.model;
    if (!this.dodge) return;
    const R = this.dodge; R.t += dt;
    const u = R.t / (R.dur || 0.3);
    if (u >= 1) { this.dodge = null; m.quaternion.identity(); m.position.set(0, 0, 0); return; }
    // roll direction into root space (the engine sets root.rotation.y to the facing)
    const ry = this.root.rotation.y, c = Math.cos(-ry), s = Math.sin(-ry);
    const lx = R.dir.x * c + R.dir.z * s, lz = -R.dir.x * s + R.dir.z * c;
    _dAxis.set(lz, 0, -lx).normalize();                                   // tumble axis: up × direction
    const e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
    _dQ.setFromAxisAngle(_dAxis, TAU * e);
    m.quaternion.copy(_dQ);
    _dC.set(0, 0.55, 0); m.position.copy(_dC).sub(_dC.clone().applyQuaternion(_dQ)); m.position.y -= Math.sin(Math.PI * u) * 0.28;
  }

  // ---------------------------------------------------------------------------------------------
  // LOD tiers (character-lod.js). A tier = the kid's skinned body parts at one level of detail, all on the same skeleton
  // and the same (per-kid) materials. Parts come from the builders — getKidShared(lod) / getHairStyle(style, lod) /
  // getClothGeo(style, lod), plus any `extra` parts they list. A builder that ignores `lod` hands
  // back the same mesh for every tier; the far tier is then decimated here.
  // ---------------------------------------------------------------------------------------------
  _tierParts(t) {
    const tn = TIERS[t];
    const K = getKidShared(tn), H = getHairStyle(this.style, tn);
    const parts = [
      { key: 'skin', geo: K.skin, mat: 'skin', shadow: true },
      { key: 'cloth', geo: (getClothGeo && getClothGeo(this.style, tn)) || K.cloth, mat: 'cloth', shadow: true },
      { key: 'hair', geo: H.geo, mat: 'hair', shadow: true },
      { key: 'eyes', geo: K.eyes, mat: 'eye', shadow: false },
    ];
    for (const x of [...(K.extra || []), ...(H.extra || [])]) {
      if (!x || !x.geo || (x.tiers && !x.tiers.includes(tn))) continue;
      parts.push({ key: x.name || 'part' + parts.length, geo: x.geo, mat: x.mat || 'skin', shadow: x.shadow !== false, order: x.renderOrder || 0 });
    }
    if (t === T_FAR) {
      const gp = this._tierParts(T_GAME), byKey = {};
      for (const p of gp) byKey[p.key] = p.geo;
      for (const p of parts) {
        const tgt = FAR_TRIS[p.key] ?? 500, n = p.geo.index ? p.geo.index.count / 3 : p.geo.attributes.position.count / 3;
        if (p.geo === byKey[p.key] || n > tgt * 1.5) p.geo = farGeometry(p.geo, tgt);
        if (p.key !== 'skin' && p.key !== 'cloth') p.shadow = false;   // far: only the body's bulk casts
      }
    }
    return parts;
  }

  /** The body meshes of tier t (built on first use, invisible until shown). */
  _tierSet(t) {
    if (this.lodSets[t]) return this.lodSets[t];
    const S = { t, meshes: {}, list: [] };
    for (const p of this._tierParts(t)) {
      const m = new THREE.SkinnedMesh(p.geo, this._matFor(p.mat));
      m.bind(this.skeleton, IDENT);
      m.castShadow = p.shadow; m.receiveShadow = true;
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.75, 0), 1.3);
      m.frustumCulled = true; m.renderOrder = p.order || 0; m.visible = false;
      m.name = 'kid:' + p.key + ':' + TIERS[t];
      m.userData.iwMat = p.mat; m.userData.iwShadow = p.shadow;
      this.kid.add(m); S.meshes[p.key] = m; S.list.push(m);
    }
    // far: sit out override passes (GTAO normals) — a 60 px kid's AO is invisible and it saves a draw per part. Only on
    // geometry the far tier owns (a shared game mesh must keep drawing for the kids that use it at game detail).
    if (t === T_FAR) {
      const gs = new Set(this._tierSet(T_GAME).list.map((m) => m.geometry));
      for (const m of S.list) if (!gs.has(m.geometry)) { m.onBeforeRender = partGate; m.onBeforeShadow = shadowUngate; }
    }
    if (S.list[0]) { const g = S.list[0].onBeforeRender, cam = this._camHook; S.list[0].onBeforeRender = g === partGate ? (r, sc, c, geo) => { partGate(r, sc, c, geo); cam(r, sc, c); } : cam; }
    this.lodSets[t] = S;
    return S;
  }

  /** A per-kid material by key: the base set (skin, cloth, hair, eye, dark, squid …) or a character-mats.js factory
   *  named by a builder's extra part (`makeXMaterial(u)` → owned by this kid; `getXMaterial()` → shared). */
  _matFor(k) {
    let m = this.mats[k];
    if (m) return m;
    const f = MATS[k];
    if (typeof f === 'function') {
      m = /^make/.test(k) ? f(this.u) : f();
      if (m) { this.mats[k] = m; if (/^make/.test(k)) this._ownMats.push(m); return m; }
    }
    console.warn('[character] unknown part material', k);
    return (this.mats[k] = this.mats.skin);
  }

  _ditherMat(k, side) {
    const D = this.matsD[side];
    return D[k] || (D[k] = ditherMaterial(this._matFor(k), side ? this.lod.fadeIn : this.lod.fadeOut));
  }

  /** Show tier t now (no fade): first frame, menus, forced tiers. */
  _setTier(t) {
    const L = this.lod, S = this._tierSet(t);
    for (let i = 0; i < 3; i++) {
      const X = this.lodSets[i]; if (!X) continue;
      for (const m of X.list) { m.visible = i === t; m.material = this._matFor(m.userData.iwMat); m.castShadow = m.userData.iwShadow; }
    }
    L.tier = t; L.to = -1; L.f = 0; L.fadeOut.value.x = L.fadeIn.value.x = 0;
    this.meshes = S.meshes;
    this._tierProps(t);
  }

  /** Rigid props follow the tier too (instant swap — small on screen): squid form, tank glass + fill. */
  _tierProps(t) {
    if (!this.squid || !this.tank) return;
    const K = getKidShared(TIERS[t]), sq = K.squid, T = K.tank;
    if (sq && sq.body) {
      let body = sq.body;
      if (t === T_FAR && body === getKidShared('game').squid?.body) body = farGeometry(body, 1500);
      this.squid.body.geometry = body; this.squid.ghost.geometry = body;
      if (sq.dark) this.squid.dark.geometry = sq.dark;
      if (sq.eyes) this.squid.eyes.geometry = sq.eyes;
    }
    if (T && T.glass && T.fill) { this.tank.glass.geometry = T.glass; this.tank.fill.geometry = T.fill; }
    this.tank.glass.visible = t !== T_FAR;   // a 14 %-opaque shell on a 60 px kid: the ink fill alone reads the same
  }

  /** Projected screen height (CSS px) of the kid for the camera it is seen through (game camera in a match, else the
   *  last camera that drew it). 0 = unknown yet. */
  _screenPx() {
    let e5, vh;
    if (this.inWorld && G.camera && G.camera.isPerspectiveCamera) {
      _lodC.setFromMatrixPosition(G.camera.matrixWorld); e5 = G.camera.projectionMatrix.elements[5];
      vh = G.renderer ? G.renderer.getSize(_vVH).y : innerHeight;
    } else if (this._camOK) { _lodC.copy(this._camPos); e5 = this._camE5; vh = this._camVH; }
    else return 0;
    const r = this.root; r.updateWorldMatrix(true, false);
    _lodK.set(0, 0.66, 0).applyMatrix4(r.matrixWorld);
    const sy = r.matrixWorld.elements[5] || 1;   // world Y scale of the root (showcase squash/stretch, pedestals)
    return KID_H * Math.abs(sy) * e5 / Math.max(0.2, _lodK.distanceTo(_lodC)) * vh * 0.5;
  }

  /** Pick the tier for this frame; fade between tiers with the screen-door dither (0.3 s) once the kid is on screen. */
  _updateLod(dt) {
    const L = this.lod;
    // fallback when the host did not warm this kid before the match (see warmAll): at first sight, not at first fade
    if (!this._warmed && this.inWorld && this._rendered) this.warmAll();
    // the builders' detail also depends on the quality setting: a settings change rebuilds the tier sets
    const q = G.settings?.quality || 'high';
    if (q !== L.q && L.to < 0) {
      if (L.q !== undefined) { for (const X of this.lodSets) if (X) for (const m of X.list) this.kid.remove(m); this.lodSets = [null, null, null]; this._setTier(L.tier); }
      L.q = q;
    }
    if (L.to >= 0) {
      L.f = Math.min(1, L.f + dt / FADE_S);
      L.fadeOut.value.x = L.fadeIn.value.x = Math.max(1e-4, L.f);
      if (L.f >= 0.5 && !L.props) { L.props = true; this._tierProps(L.to); }
      if (L.f >= 1) this._setTier(L.to);
      return;
    }
    const Q = LOD_QUALITY[G.settings?.quality] || LOD_QUALITY.high;
    let want;
    const px = L.px = this._screenPx();
    if (L.force >= 0) want = L.force;
    else if (!this.inWorld) want = Q.menu;
    else if (px <= 0) want = L.tier;
    else want = pickTier(px, L.tier, Q, this.isLocal ? Q.heroLocal : Q.hero);
    if (want === L.tier) return;
    // not drawn yet, hidden, or out of a match: switch at once (nothing to pop); on screen: cross-fade
    if (!this._rendered || !this.visible || !this.inWorld || dt <= 0 || L.force >= 0) { this._setTier(want); return; }
    this._startFade(want);
  }

  /** Cross-fade from the current tier to t: outgoing parts keep the IGN ≥ f pixels, incoming the rest; 0.3 s. */
  _startFade(t) {
    const L = this.lod;
    if (L.to >= 0 || t === L.tier) return;
    const A = this.lodSets[L.tier], B = this._tierSet(t);
    for (const m of A.list) { m.material = this._ditherMat(m.userData.iwMat, 0); m.castShadow = false; }
    for (const m of B.list) { m.material = this._ditherMat(m.userData.iwMat, 1); m.castShadow = m.userData.iwShadow; m.visible = true; }
    L.to = t; L.f = 0; L.props = false; L.fadeOut.value.x = L.fadeIn.value.x = 1e-4;
  }

  /** Force a tier ('hero' | 'game' | 'far' | index), or null for automatic. Labs / showcase portraits / audits. */
  setLod(t) {
    const i = typeof t === 'string' ? TIERS.indexOf(t) : t ?? -1;
    this.lod.force = i >= 0 && i < 3 ? i : -1;
    if (this.lod.force >= 0) this._setTier(this.lod.force);
  }
  get lodTier() { return TIERS[this.lod.to >= 0 ? this.lod.to : this.lod.tier]; }

  /**
   * Compile, against the game scene's lights / fog / shadows and into the same kind of target the match renders to,
   * every shader program this kid can use in a match — all three LOD tiers × {plain, dither out, dither in}, the squid
   * form (+ the local swimmer's ghost), the hand-held bomb, the tank, the weapon (near parts, merged far meshes, far
   * decimation) — plus the shadow-depth variants (one shadow pass of the kid with everything shown). Also builds the
   * tier meshes and pre-pays each material's first-use setup, so nothing is built or compiled when the kid first changes
   * tier, dives or throws mid-match. Resolves when the programs are linked. Idempotent per kid; after the first kid of a
   * look/weapon every program is a cache hit (≈ 1–3 ms). Call it for every actor inside the loading fade.
   */
  async warmAll(renderer = G.renderer, camera = G.camera, target = G.scene) {
    if (this._warmed) return this._warmed;
    if (!renderer || !camera || !target || !renderer.compileAsync) return false;
    const done = this._warmed = (async () => {
      const q = G.settings?.quality || 'high';
      // build every tier + the dither twins (warm-only meshes on this skeleton; the materials stay with the kid)
      const grp = new THREE.Group(); grp.name = 'warm';
      for (let t = 0; t < 3; t++) for (const m of this._tierSet(t).list) for (let side = 0; side < 2; side++) {
        const w = new THREE.SkinnedMesh(m.geometry, this._ditherMat(m.userData.iwMat, side));
        w.bind(this.skeleton, IDENT); w.castShadow = m.userData.iwShadow; w.receiveShadow = true; w.frustumCulled = false; grp.add(w);
      }
      this.kid.add(grp);
      // far weapon decimation (CPU, cached per weapon geometry) — built now rather than at the first far switch
      for (const k in this.weapons) for (let w = this.weapons[k]; w; w = w.left) { farGeometry(w.def.body, 700); farGeometry(w.def.ink, 300); }
      // everything a match can show, shown for the synchronous part only (compile + one shadow pass)
      const vis = [];
      this.root.traverse((o) => { vis.push(o, o.visible); o.visible = true; });
      const rt0 = renderer.getRenderTarget();
      let p = null;
      try {
        // programs are keyed by the render target (tone mapping / output colour space): the match draws into the
        // composer's HDR target, so compile against one of those
        renderer.setRenderTarget(G.post?.composer?.readBuffer || (_warmRT || (_warmRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }))));
        p = renderer.compileAsync(this.root, camera, target);
      } finally { renderer.setRenderTarget(rt0); }
      const sm = renderer.shadowMap, lights = [];
      if (sm.enabled) target.traverseVisible((o) => { if (o.isLight && o.castShadow && o.shadow) lights.push(o); });
      if (lights.length) {
        const nu = sm.needsUpdate;
        this.root.updateMatrixWorld(true);
        try { sm.needsUpdate = true; sm.render(lights, this.root, camera); } catch (e) { console.warn('[character] shadow warm', e); }
        finally { sm.needsUpdate = nu; }
      }
      for (let i = 0; i < vis.length; i += 2) vis[i].visible = vis[i + 1];
      this.kid.remove(grp);
      await p;
      return q;
    })();
    return done;
  }

  // ---------------------------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------------------------
  setColor(color) {
    this.color.set(color);
    this.u.uTeam.value.copy(this.color);
    this.mats.fill.color.copy(this.color);
    this.mats.glow.emissive.copy(this.color);
    this.mats.glow.color.copy(this.color).multiplyScalar(0.3);
    if (this.bomb) { this.bomb.ink.material = getInkMaterial(this.color); if (this.bomb.spinInk) this.bomb.spinInk.material = getInkMaterial(this.color); }
    for (const k in this.weapons) {
      for (let w = this.weapons[k]; w; w = w.left) {
        w.ink.material = getInkMaterial(this.color); w.inkFar.material = w.ink.material;
        if (w.inkL) w.inkL.material = w.ink.material;
        if (w.drum) w.drum.userData.ink.material = getInkMaterial(this.color);
        for (const g of w.partList) if (g.userData.mat === 'ink') g.userData.mesh.material = w.ink.material;
        if (w.coil) w.coil.emissive.copy(this.color);
      }
    }
  }

  // kind = weapon model; the pose family (animKind) comes from ANIM_OF — new weapons borrow an existing family's animation
  setWeapon(kind) {
    if (!HOLD[ANIM_OF[kind] || kind]) kind = 'shooter';
    if (kind === this.weaponKind) return;
    const old = this.weaponKind && this.weapons[this.weaponKind];
    if (old) {
      this.bones.handR.remove(old.pivot);
      if (old.left) this.bones.handL.remove(old.left.pivot);
      if (old.pivotL) this.bones.handL.remove(old.pivotL);
    }
    const w = this._getWeapon(kind);
    w.pivot.visible = !this.weaponHidden;
    this.bones.handR.add(w.pivot);
    if (w.left) this.bones.handL.add(w.left.pivot);
    if (w.pivotL) this.bones.handL.add(w.pivotL);
    this.weaponKind = kind; this.animKind = ANIM_OF[kind] || kind; this.weapon = w; this.hold = HOLD[kind] || HOLD[this.animKind];   // a kind may bring its own hold data (bow)
    this.dual = !!w.left;
  }

  trigger(name, arg) {
    const tr = this.tr, sp = this.sp;
    switch (name) {
      case 'shoot': {
        if (this.animKind === 'roller') { tr[T_FLICK] = 0; break; }
        if (this.animKind === 'slosher') { if (tr[T_SLOSH] > 0.3) tr[T_SLOSH] = 0; this.lastShot = 0; break; }
        const hand = arg && typeof arg === 'object' ? (arg.hand | 0) : 0;   // dualies alternate hands: { hand: 0|1 }
        if (this.dual && hand === 1) { tr[T_SHOOTL] = 0; this._recoil(1, 1); sp[S_GRIPL + 1] += 2.2; } else { tr[T_SHOOT] = 0; this._recoil(1, 0); sp[S_GRIP + 1] += 2.2; if (!this.dual) sp[S_GRIPL + 1] += 1.2; }
        this.lastShot = 0;
        break;
      }
      case 'slosh': tr[T_SLOSH] = 0; this.lastShot = 0; break;
      // locker / showcase one-shots (played right after a look swap)
      case 'admire': tr[T_ADMIRE] = 0; break;
      case 'hairflip': tr[T_FLIP] = 0; break;
      case 'wink': tr[T_WINK] = 0; break;
      case 'dodge': {
        // dualies roll: arg { x, z, t } = unit roll direction in root space (+z forward, +x = the character's left), duration
        let x = 0, z = 1, d = 0.3;
        if (arg && typeof arg === 'object') { x = +arg.x || 0; z = +arg.z || 0; d = clamp(+arg.t || 0.3, 0.15, 0.8); }
        const l = Math.hypot(x, z); if (l > 1e-4) { x /= l; z /= l; } else { x = 0; z = 1; }
        tr[T_DODGE] = 0; this.dodgeX = x; this.dodgeZ = z; this.dodgeDur = d; this.lockW = Math.max(this.lockW, 0.001);
        sp[S_SQ + 1] -= 1.6; sp[S_TANKL + 1] += 1.5; this._hairKick(-x * 2, 1.2, -z * 2);
        break;
      }
      // roller-family flick / bucket heave / brush swipe (arg = swipe side ±1, alternating)
      case 'flick': tr[T_FLICK] = 0; this.lastShot = 0; if (arg) this.swipeSide = arg; sp[S_GRIP + 1] += 3; sp[S_GRIPL + 1] += 3; break;
      // Brine Cutlass (kits/blade.js): a quick cut (arg = side ±1, +1 sweeps right → left) / the charged overhead cut
      case 'blade_slash': this.blT = 0; this.blSide = arg || 1; this.blHeavy = false; this.lastShot = 0; sp[S_GRIP + 1] += 2.4; break;
      case 'blade_heavy': this.blT = 0; this.blHeavy = true; this.lastShot = 0; sp[S_SQ + 1] -= 1.2; sp[S_GRIP + 1] += 3.2; break;
      case 'stream': this.lastShot = 0; break;   // spinner burst in progress: keep the aim pose and the barrels spinning
      // twins dodge roll: arg = world-space unit direction (Vector3); one forward tumble of this.model (see _updateDodge)
      case 'roll': this.dodge = { t: 0, dir: (this.dodge?.dir || new THREE.Vector3()).copy(arg || _fwdZ), dur: (arg && arg.dur) || 0.3 }; break;
      case 'throw': tr[T_THROW] = 0; this.bombHeld = false; break;
      case 'land': {
        const a = clamp(((arg ?? 8) - 2.5) / 13, 0.12, 1);
        this.landAmp = tr[T_LAND] < 0.25 ? Math.max(this.landAmp, a) : a; tr[T_LAND] = 0;
        sp[S_PELY + 1] -= 3.0 * a; sp[S_SQ + 1] -= 3.6 * a; sp[S_LEANP + 1] += 2.2 * a; sp[S_HEADP + 1] += 3.5 * a;
        sp[S_ARML + 1] -= 4 * a; sp[S_ARMR + 1] -= 4 * a; sp[S_WPY + 1] -= 0.9 * a; sp[S_WRX + 1] += 4 * a; sp[S_TANKL + 1] -= 3 * a;
        this._hairKick(0, -3.2 * a, 0);
        sp[S_EARL + 1] -= 5 * a; sp[S_EARR + 1] -= 5 * a;
        if (a > 0.55) this._blink();
        break;
      }
      case 'jump': {
        tr[T_JUMP] = 0; sp[S_SQ + 1] += 2.6; sp[S_TANKL + 1] += 2; this._hairKick(0, 2.4, 0);
        if (this.kidForm && !this.dance && this.rng() < 0.6) this._mxPlay(X_HUP, 0.6, 0.05, 0.12, 0.3);
        // a running jump leaps off the planted foot: the leg that is swinging (or furthest behind) drives up in front
        const F = this.feet;
        this.jumpRun = this.kidForm ? sstep(1.5, 4.5, this.gs) : 0;
        this.jumpLead = F[0].sw && !F[1].sw ? 0 : F[1].sw && !F[0].sw ? 1 : (F[0].su > F[1].su ? 0 : 1);
        break;
      }
      case 'hit': {
        tr[T_HIT] = 0;
        let hx = 0, hz = 1, amp = 1;
        if (arg && typeof arg === 'object') { hx = +arg.x || 0; hz = +arg.z || 0; const l = Math.hypot(hx, hz); if (l > 1e-4) { hx /= l; hz /= l; } else { hz = 1; } amp = clamp(arg.amount ?? arg.amp ?? 1, 0.3, 1.6); }
        else { hx = (this.rng() - 0.5) * 1.2; hz = 1; if (typeof arg === 'number') amp = clamp(arg, 0.3, 1.4); }
        this.hitX = hx; this.hitZ = hz; this.hitAmp = amp;
        this.hitAcc += amp;
        // arg {x, z} = unit direction toward the attacker in root space (+z forward, +x = the character's left).
        // Torso knocked away from it: pitch back from frontal hits, roll away from side hits, twist toward the struck side.
        sp[S_HITP + 1] -= hz * 6.5 * amp; sp[S_HITR + 1] += hx * 6.5 * amp; sp[S_HITY + 1] += hx * 5 * amp; sp[S_PELY + 1] -= 0.5 * amp;
        sp[S_HEADP + 1] -= hz * 7.5 * amp; sp[S_HEADR + 1] += hx * 7 * amp;
        sp[S_CLAV + 1] += 3.5 * amp; sp[S_WRX + 1] -= 2 * amp;
        this._hairKick(hx * 1.5, 1.2, -hz * 1.8);
        sp[S_EARL + 1] += (4 + 3 * hx) * amp; sp[S_EARR + 1] += (4 - 3 * hx) * amp;
        this._blink(amp > 0.7);
        if (amp > 0.8 && this.kidForm) this._mxPlay(X_OOF, 0.35 + 0.3 * amp, 0.04, 0.1, 0.45);
        sp[S_GRIP + 1] += 3 * amp;
        if (this.hitAcc > 2.6 && tr[T_STAG] > 0.9) { tr[T_STAG] = 0; this.hitAcc = 0; this.stepOfsZ = -0.16 * hz; this.stepOfsX = -0.1 * hx; sp[S_STAG + 1] -= 2.5; }
        if (this.form !== 'kid') { sp[S_SQP + 1] += 5 * amp; sp[S_SQY + 1] -= 3 * amp; }
        break;
      }
      case 'special_leap': tr[T_LEAP] = 0; tr[T_SLAM] = 99; tr[T_IMPACT] = 99; this.slamGround = false; this.leapEnd = -1; this._hairKick(0, -2, 0); break;
      case 'special_slam': tr[T_SLAM] = 0; this.leapEnd = tr[T_LEAP] < 1.9 ? tr[T_LEAP] : -1; tr[T_IMPACT] = 99; this.slamGround = false; break;
      case 'spawn':
        tr[T_SPAWN] = 0; this.form = 'kid'; this.formPrev = 'kid'; this.formT = 99; this.kidScale = 1; this.sqScale = 0;
        this.feetValid = false; this.replant = true; this.headInit = false; this.rootInit = false;
        break;
      case 'charge_release': tr[T_REL] = 0; this.lastRelease = 0; this.lastShot = 0; this.chargeFlash = 1; this._recoil(0.5 + 0.7 * this.charge); sp[S_GRIP + 1] += 3; sp[S_GRIPL + 1] += 2; if (this.charge > 0.8) this._mxPlay(X_EFFORTP, 0.5, 0.03, 0.08, 0.3); break;
      default: break;
    }
  }

  setDance(name) {
    name = name || null;
    if (name === this.dance) return;
    if (this.dance && name) { this.prevDance = this.dance; this.prevDanceT = this.danceT; this.danceFade = 0; }
    this.dance = name; this.danceT = 0;
    const nv = DANCE_VARIANTS[name] || 1;
    this.danceVar = (this.seed >>> 5) % nv;
    // the moment it lands: a burst of joy (win) / a sinking breath out (lose) on top of the dance's own face
    if (name === 'victory') { this._mxPlay(X_JOY, 0.7, 0.08, 0.5, 0.8, 0, E_BLUSH); this._blinkStart(1, false); }
    else if (name === 'defeat') { this._mxPlay(X_SIGH, 0.9, 0.3, 0.8, 1.2); this.sigh = 1; }
  }

  setHurt(amount, enemyColor) {
    this.hurt = clamp(amount || 0, 0, 1);
    if (enemyColor) this.enemyColor.set(enemyColor);
    const h = this.u.uHurt.value; h.set(this.enemyColor.r, this.enemyColor.g, this.enemyColor.b, this.hurt);
  }

  setVisible(v) { this.visible = !!v; this.root.visible = this.visible; if (!this.visible) { this.feetValid = false; this.rootInit = false; } }

  getMuzzle(out) {
    if (this.form !== 'kid' || !this.weapon) return this.getHeadPosition(out);
    return this.weapon.muzzle.getWorldPosition(out);
  }

  /** World muzzle of one hand's weapon: hand 0 = the main (right) one, hand 1 = the left pistol when dual wielding. */
  getMuzzleHand(out, hand = 0) {
    if (hand === 1 && this.form === 'kid' && this.weapon && this.weapon.left) return this.weapon.left.muzzle.getWorldPosition(out);
    return this.getMuzzle(out);
  }

  /** 0..1 — how far the held weapon is into its aim pose (1 = up and aimed; rollers never "aim"). */
  aimReady() { return this.form !== 'kid' || !this.weapon || this.animKind === 'roller' ? 1 : this.wAim; }

  /** World-space muzzle of the full aim pose at `pitch` — where the gun is springing to when the trigger is pulled
   *  from the carry pose (weapons.js spawns the first shot of a burst there instead of at the hip). false if n/a. */
  getAimMuzzle(out, pitch) {
    if (this.form !== 'kid' || !this.weapon || this.animKind === 'roller') return false;
    const a = this.hold.aim;
    const aimP = clamp(pitch ?? 0, -1.0, 1.15), aimPose = clamp(aimP, -0.8, 1.0);
    _v1.set(a.p[0], a.p[1], a.p[2]).applyAxisAngle(XAX, -aimPose).add(AIM_PIVOT);
    _e1.set(a.r[0] - aimP, a.r[1], a.r[2], 'YXZ'); _q1.setFromEuler(_e1);
    out.copy(this.weapon.def.muzzle).applyQuaternion(_q1).add(_v1);
    this.kid.updateWorldMatrix(true, false);
    return out.applyMatrix4(this.kid.matrixWorld), true;
  }

  /** World position of the head centre (for name tags, cameras). */
  getHeadPosition(out) {
    if (this.form !== 'kid') return this.squid.pivot.getWorldPosition(out);
    this.bones.head.updateWorldMatrix(true, false);
    return out.copy(HEAD_CTR).applyMatrix4(this.bones.head.matrixWorld);
  }

  dispose() {
    LIVE.delete(this);
    this.root.parent?.remove(this.root);
    for (const k of ['skin', 'cloth', 'hair', 'eye', 'fill', 'squid', 'squidGhost', 'glow']) this.mats[k].dispose();
    for (const m of this._ownMats) m.dispose();
    for (const D of this.matsD) for (const k in D) D[k].dispose();
    for (const k in this.weapons) for (let w = this.weapons[k]; w; w = w.left) { for (const m of w.lamps) m.dispose(); w.coil?.dispose(); }
    this.skeleton.dispose();
  }

  /** Debug snapshot for the lab (feet plant state etc.). */
  get dbg() {
    const f = this.feet;
    return { hipDrop: +this.hipDrop.toFixed(3), moving: this.moving, phase: this.phase, duty: this.duty, cad: this.cad, gv: this.gv, gs: this.gs,
      feet: f.map((x) => ({ planted: x.planted, mode: x.mode, su: +x.su.toFixed(3), cw: x.cw.toArray().map((v) => +v.toFixed(4)), disp: x.disp.toArray().map((v) => +v.toFixed(4)), yaw: +x.cyaw.toFixed(3), pitch: +x.pitch.toFixed(3) })) };
  }

  // ---------------------------------------------------------------------------------------------
  // internal event helpers
  // ---------------------------------------------------------------------------------------------
  _recoil(k, hand = 0) {
    const rc = this.hold.rc, sp = this.sp, w = TAU * rc.hz;
    if (hand === 1) {
      sp[S_RCP2 + 1] += rc.kick * w * 1.35 * k; sp[S_RCZ2 + 1] += rc.back * w * 1.35 * k;
      sp[S_RCY2 + 1] += (this.rng() - 0.5) * 2 * rc.jit * w * k;
    } else {
      sp[S_RCP + 1] += rc.kick * w * 1.35 * k;
      sp[S_RCZ + 1] += rc.back * w * 1.35 * k;
      sp[S_RCY + 1] += (this.rng() - 0.5) * 2 * rc.jit * w * k;
      sp[S_RCR + 1] += (this.rng() - 0.5) * 2 * rc.jit * w * k;
    }
    sp[S_TANKX + 1] += (this.rng() - 0.5) * 0.4 * k; sp[S_TANKL + 1] -= 0.4 * k;
  }
  _hairKick(x, y, z) { for (let i = 0; i < this.hv.length; i += 3) { this.hv[i] += z * 0.6 + x * 0.3; this.hv[i + 1] += x * 0.4; this.hv[i + 2] += y * 0.5 - x * 0.2; } }
  _blink(hard = false) { this._blinkStart(1, hard); }

  // ---------------------------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------------------------
  update(dt, s) {
    dt = clamp(dt || 0, 0, 0.1);
    s = s || EMPTY_STATE;
    this._dt = dt;
    this.t += dt;
    const tr = this.tr;
    for (let i = 0; i < TN; i++) tr[i] += dt;
    this.lastShot += dt; this.lastRelease += dt;
    if (this.dance) this.danceT += dt;
    this.prevDanceT += dt; this.danceFade = Math.min(1, this.danceFade + dt / 0.45);
    this.inWorld = !!(G.scene && this.root.parent === G.scene && G.physics);
    this.phys = this.inWorld ? G.physics : null;

    // ---- inputs ----
    const form = s.form || 'kid';
    this.grounded = s.grounded ?? true;
    if (form !== this.form) {
      const k0 = this.form === 'kid', k1 = form === 'kid';
      if (k0 !== k1) this._formEnter(form); else { this.form = form; }   // squid ⇄ swim ⇄ climb: same body, no pop
      if (form === 'kid') this.feetValid = false;
    }
    this.formT += dt;
    this.kidForm = this.form === 'kid';

    this._trackRoot(dt, s);
    this._updateStates(dt, s);
    this._updateFormScales(dt);

    // an external head turn applied after our last update (the showcase lobby glance): yaw of (now · ours⁻¹)
    if (this._headSet && this.kidForm) {
      _q1.copy(this._headQW).invert().premultiply(this.bones.head.quaternion);
      const g = 2 * Math.atan2(_q1.y, _q1.w);
      this.extGl = Math.abs(g) < 1.5 ? g : 0;
    } else this.extGl = 0;
    // life detail: 2 full · 1 small on screen (game tier < 150 px: no idle face flickers / grip re-grips) · 0 far tier
    // (no face, fingers, jiggle, breathing; hair at half rate) — none of it is readable at that size
    const L = this.lod, lt = L.to >= 0 ? Math.min(L.tier, L.to) : L.tier;
    this.lifeLv = !this.inWorld || lt === T_HERO ? 2 : lt === T_FAR ? 0 : L.px > 0 && L.px < 150 ? 1 : 2;
    // hidden (not drawn): keep the clocks and states, skip the pose; the feet re-plant and the hair re-inits on return
    const shown = this.root.visible && (!this.root.parent || this.root.parent.visible !== false);
    if (this.kidScale > 0.001 && shown) {
      this._updateFeet(dt, s);
      this._buildPose(dt, s);
      this._applyPose(dt, s);
    } else { this.feetValid = false; this.headInit = false; this._headSet = false; }
    if (shown) this._updateSquid(dt, s); else this.sqInit = false;
    this._updateMaterials(dt, s);
    this._updateLod(dt);
  }

  // Root motion → world velocity/acceleration (+ kid-space versions), turn rate, ground distance while airborne.
  _trackRoot(dt, s) {
    const r = this.root.position;
    const yaw = this.root.rotation.y;
    if (!this.rootInit || r.distanceToSquared(this.rp) > 9) {
      this.rp.copy(r); this.rv.set(0, 0, 0); this.ra.set(0, 0, 0); this.prevYaw = yaw; this.rootInit = true; this.feetValid = false; this.yawRate = 0;
    }
    this.yaw = yaw;
    if (dt > 0) {
      _v1.subVectors(r, this.rp);
      if (s.carry) _v1.sub(s.carry);           // (a moving platform carrying us isn't us walking)
      const cv = s.carry;
      this.carryT = cv && (cv.x || cv.y || cv.z) ? 1 : Math.max(0, this.carryT - dt);
      _v1.divideScalar(dt);
      _v2.copy(this.rv);
      this.rv.lerp(_v1, 1 - Math.exp(-dt * 32));
      _v3.subVectors(this.rv, _v2).divideScalar(dt);
      this.ra.lerp(_v3, 1 - Math.exp(-dt * 16));
      const dy = wrapA(yaw - this.prevYaw);
      this.yawRate = damp(this.yawRate, clamp(s.turnRate !== undefined ? s.turnRate : dy / dt, -14, 14), s.turnRate !== undefined ? 30 : 14, dt);
    }
    this.rp.copy(r); this.prevYaw = yaw;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    this.kvx = this.rv.x * c - this.rv.z * sn; this.kvz = this.rv.x * sn + this.rv.z * c;
    this.kax = this.ra.x * c - this.ra.z * sn; this.kaz = this.ra.x * sn + this.ra.z * c;
    this.hs = Math.hypot(this.kvx, this.kvz);
    // treadmill: the engine says we move but the root stays put (lab / previews) → the ground slides under us instead
    const sv = s.speed ?? 0;
    const lm = s.localMove || EMPTY_STATE.localMove;
    const lml = Math.hypot(lm.x, lm.z);
    this.tread = this.hs < 0.12 && sv > 0.4 && lml > 0.05 && this.grounded;
    if (this.tread) {
      const kx = (-lm.x / lml) * sv, kz = (lm.z / lml) * sv; // kid space (+x left)
      this.tvx = kx * c + kz * sn; this.tvz = -kx * sn + kz * c;
      this.gvx = this.tvx; this.gvz = this.tvz; this.kgx = kx; this.kgz = kz;
    } else {
      this.tvx = 0; this.tvz = 0; this.gvx = this.rv.x; this.gvz = this.rv.z; this.kgx = this.kvx; this.kgz = this.kvz;
    }
    this.gv = Math.hypot(this.gvx, this.gvz);
    this.gs = damp(this.gs, this.grounded ? this.gv : this.gs, this.gv > this.gs ? 16 : 7, dt);
    if (this.gv > 0.35) {
      const il = 1 / this.gv;
      this.mdx = damp(this.mdx, this.kgx * il, 10, dt); this.mdz = damp(this.mdz, this.kgz * il, 10, dt);
      const ml = Math.hypot(this.mdx, this.mdz) || 1; this.mdx /= ml; this.mdz /= ml;
    }
    this.vyS = damp(this.vyS, s.vy ?? this.rv.y, 14, dt);
    this.airT = this.grounded ? 0 : this.airT + dt;
    // distance to the ground below while airborne (fall reach + landing anticipation)
    if (!this.grounded && this.phys) {
      _gO.set(r.x, r.y + 0.3, r.z);
      const h = this.phys.raycast(_gO, DOWN, 4, _gHit, false);
      this.gnd = h.hit ? Math.max(0, h.dist - 0.3) : 9;
    } else this.gnd = this.grounded ? 0 : 9;
  }

  // Blend weights and slow state (aiming, rolling, air, exertion, tiredness, stance presets, hip twist).
  _updateStates(dt, s) {
    const kid = this.kidForm, dance = this.dance, H = this.hold;
    const ch = s.charge ?? 0;
    let sub = s.subAim;
    if (sub === undefined) { const a = this._owner(); sub = !!(a && a.weaponRunner && a.weaponRunner.aimingSub); }
    this.wSub = damp(this.wSub, sub && kid && !dance ? 1 : 0, sub ? 14 : 9, dt);
    if (sub && !this._subPrev && kid) { this.bombHeld = true; this.bombT = 0; }
    if (!sub && this.wSub < 0.3) this.bombHeld = false;
    this._subPrev = !!sub; this.bombT += dt;
    // dual wield: the left pistol makes way for the bomb (held + throw), then pops back into the fist
    this.bombSwap = damp(this.bombSwap, this.dual && kid && (this.bombHeld || this.tr[T_THROW] < 0.32) ? 1 : 0, 16, dt);
    // dualies: roll → locked turret stance while the runner's lockT runs (labs: 0.5 s after the roll)
    {
      const R = this._runner(s), dk = this.tr[T_DODGE] / this.dodgeDur;
      const lock = kid && !dance && this.dual && ((R ? (R.lockT || 0) > 0 || (!!R.dodge && dk > 0.55) : this.tr[T_DODGE] < this.dodgeDur + 0.5) || (dk > 0.55 && dk < 1));
      this.lockW = damp(this.lockW, lock ? 1 : 0, lock ? 18 : 7, dt);
    }
    const aiming = kid && !dance && this.animKind !== 'roller' && (!!s.firing || ch > 0.01 || this.lastShot < 0.5 || this.lastRelease < 0.35 || this.lockW > 0.5);
    this.wAim = damp(this.wAim, aiming ? 1 : 0, aiming ? 22 : 4.5, dt);
    const rolling = kid && !dance && !!s.rolling && this.animKind === 'roller' && this.tr[T_FLICK] > 0.6;
    this.wRoll = damp(this.wRoll, rolling ? 1 : 0, rolling ? 11 : 6, dt);
    this.wAir = damp(this.wAir, this.grounded ? 0 : 1, this.grounded ? 24 : 12, dt);
    this.wDance = damp(this.wDance, dance ? 1 : 0, 5, dt);
    this.charge = damp(this.charge, ch, 25, dt);
    this.fullT = ch >= 0.995 ? this.fullT + dt : 0;
    this.chargeFlash = Math.max(0, this.chargeFlash - dt * 3.5);
    this.wGlow = damp(this.wGlow, (s.special ?? 0) >= 0.999 ? 1 : 0, 6, dt);
    this.wLow = damp(this.wLow, s.lowInk ? 1 : 0, 8, dt);
    this.inkS = damp(this.inkS, clamp(s.ink ?? 1, 0, 1), 8, dt);
    let hp = s.hp; if (hp !== undefined && hp > 1.001) hp /= PLAYER.hp;
    this.wTired = damp(this.wTired, hp !== undefined ? sstep(0.45, 0.12, hp) : sstep(0.55, 0.9, this.hurt) * 0.6, 3, dt);
    this.wGoo = damp(this.wGoo, s.inEnemyInk && this.grounded && kid ? 1 : 0, 6, dt);
    this.hitAcc = Math.max(0, this.hitAcc - dt * 1.4);
    this.stepOfsX = damp(this.stepOfsX, 0, 2.2, dt); this.stepOfsZ = damp(this.stepOfsZ, 0, 2.2, dt);
    // exertion: builds while sprinting, decays at rest (drives breathing rate/amplitude)
    this.exert = clamp(this.exert + (this.gs > 3.5 ? dt * 0.12 : -dt * 0.06) + (this.tr[T_LAND] < dt * 1.5 ? 0.05 * this.landAmp : 0), 0, 1);
    this.brPh += dt * lerp(0.26, 0.72, Math.max(this.exert, this.wTired * 0.8)) * (this.brRate || 1) * (this.sigh > 0 ? 0.62 : 1);
    // gait params from the smoothed speed
    const v = this.moving ? Math.max(this.gv, 0.6) : this.gs;   // gait params follow the real ground speed (no lag)
    const rw = this.runW = sstep(1.7, 4.3, v);
    this.duty = lerp(0.62, 0.3, rw) + 0.06 * this.wGoo;
    const half = lerp(0.19, 0.265, sstep(0.4, 5, v)) * (1 - 0.18 * this.wGoo);
    this.cad = clamp(Math.max(v, 0.6) * this.duty / (2 * half), 1.1, 4.4) * (1 - 0.1 * this.wGoo);
    this.liftH = lerp(0.05, 0.2, sstep(1.2, 5.5, v)) * (1 + 0.9 * this.wGoo);
    this.gaitW = damp(this.gaitW, this.moving ? 1 : 0, this.moving ? 7 : 4.5, dt);
    // hips twist toward the travel direction when strafing (legs run "diagonal"), upper body counter-rotates
    let tw = 0;
    if (this.moving) {
      tw = Math.atan2(this.mdx, Math.abs(this.mdz) + 0.3) * 0.78;
      if (this.mdz < -0.25) tw = -tw * 0.8;
      tw = clamp(tw, -0.8, 0.8) * sstep(0.5, 2.2, v);
    }
    this.hipTwist = damp(this.hipTwist, tw, 7, dt);
    // stance preset (feet targets when standing): idle, or the weapon's aim / roll stance
    const aimSt = Math.max(this.wAim, this.wRoll) * (1 - this.gaitW);
    const st = this.stance, A = H.stance, lk = this.lockW;
    // idle clock (fidgets + weight shifts)
    const idleNow = kid && !dance && !this.moving && this.grounded && this.wAim < 0.05 && this.wRoll < 0.05 && this.tr[T_LAND] > 0.5 && this.tr[T_SPAWN] > 1.2;
    // idle shuffles: every so often one foot wants to sit a little wider / narrower / turned — the settle steps make it
    // a real little re-plant (people never stand in the exact same footprint for long). Not while something carries us
    // (riding Tower Command's moving tower, and a moment after it stops): a step there reads as walking on it
    const SV = this.stVar;
    if (idleNow) {
      if (this.idleT > 2.5 && this.carryT <= 0) this.shufT -= dt;
      if (this.shufT <= 0) {
        // one foot re-plants 8–11 cm away (out / back / in — never across the other), toes turned a little, and the other
        // foot's offset relaxes: enough to trip a settle step, small enough to read as a weight change
        this.shufT = 5 + this.rng() * 8;
        const o = this.rng() < 0.5 ? 0 : 3, sd = o ? -1 : 1, M = SHUFFLES[(this.rng() * SHUFFLES.length) | 0], j = 0.88 + 0.24 * this.rng();
        SV[o] = sd * M[0] * j; SV[o + 1] = M[1] * j; SV[o + 2] = sd * (M[2] + (this.rng() - 0.5) * 0.15);
        const q = 3 - o; SV[q] *= 0.3; SV[q + 1] *= 0.3; SV[q + 2] *= 0.3;
      }
    } else if (this.moving || this.wAim > 0.2 || dance) { for (let i = 0; i < 6; i++) SV[i] = 0; this.shufT = Math.max(this.shufT, 3); }
    for (let i = 0; i < 6; i++) st[i] = damp(st[i], lerp(STANCE_IDLE[i] + SV[i], lerp(A[i], STANCE_LOCK[i], lk), Math.max(aimSt, lk)), lk > 0.5 ? 16 : 9, dt);
    this.idleT = idleNow ? this.idleT + dt : 0;
    if (this.fidget >= 0) { this.fidgetT += dt; if (this.fidgetT > FIDGET_LEN[this.fidget] || !idleNow) { this.fidget = -1; this.nextFidget = 4 + this.rng() * 5; this.idleT = Math.min(this.idleT, 1.5); } }
    else if (idleNow && this.idleT > this.nextFidget) { this._startFidget(); }
    this.shiftT -= dt;
    if (this.shiftT <= 0) { this.shiftTgt = -this.shiftTgt; this.shiftT = 3.2 + this.rng() * 4; }
  }

  _startFidget() {
    let id = (this.rng() * FIDGETS.length) | 0;
    if (id === this.lastFidget) id = (id + 1 + ((this.rng() * 3) | 0)) % FIDGETS.length;
    // a pistol in each fist: no free hand for the goggles / tank taps
    if ((this.dual || this.weapon?.pivotL) && (FIDGETS[id] === 'goggles' || FIDGETS[id] === 'tank')) id = FIDGETS.indexOf(this.rng() < 0.5 ? 'twirl' : 'look');
    this.fidget = id; this.lastFidget = id; this.fidgetT = 0;
  }

  // Kid ⇄ squid as one continuous elastic gesture (the ink splash itself is FX):
  //   kid → squid: the kid dips (anticipation), flattens into a puddle of ink and is gone; the squid rises out of that
  //                puddle, stretches tall past rest and wobbles to a stop.
  //   squid → kid: the squid crouches, shoots up thin and pops; the kid springs out of it tall and thin (rising out of
  //                the ink when it was swimming), lands in a squash and wobbles to rest.
  // Rapid toggles start the new gesture where the current shapes are, so nothing ever pops.
  _updateFormScales(dt) {
    const toKid = this.form === 'kid', fromKid = this.formPrev === 'kid';
    const t = this.formT;
    let kU = toKid ? 1 : 0, kY = 1, kXZ = 1, sU = toKid ? 0 : 1, sY = 1, sXZ = 1, lift = 0;
    if (toKid && !fromKid && t < 0.45) {
      sU = t < 0.06 ? 1 : 1 - easeIn((t - 0.06) / 0.035);
      sY = kc(t, K_EM_ST, K_EM_SY); sXZ = kc(t, K_EM_ST, K_EM_SX);
      kU = t < 0.045 ? 0 : easeOut((t - 0.045) / 0.055);
      kY = kc(t, K_EM_KT, K_EM_KY); kXZ = kc(t, K_EM_KT, K_EM_KX);
      lift = (this.formPrev === 'swim' ? -0.3 : this.formPrev === 'climb' ? -0.05 : -0.12) * (1 - easeOut((t - 0.045) / 0.1));
    } else if (!toKid && fromKid && t < 0.45) {
      kY = kc(t, K_DV_KT, K_DV_KY); kXZ = kc(t, K_DV_KT, K_DV_KX);
      kU = t < 0.07 ? 1 : 1 - easeIn((t - 0.07) / 0.03);
      sU = t < 0.045 ? 0 : easeOut((t - 0.045) / 0.035);
      sY = kc(t, K_DV_ST, K_DV_SY); sXZ = kc(t, K_DV_ST, K_DV_SX);
    }
    this.kidScale = kU; this.sqScale = sU; this.kidSY = kY; this.kidSXZ = kXZ; this.sqSY = sY; this.sqSXZ = sXZ; this.kidLift = lift;
    this.kidPop = toKid ? kU : 0;
    this.kid.visible = kU > 0.001;
    this.squidRoot.visible = sU > 0.001;
  }

  /** A form change arriving mid-gesture: enter the new timeline at the point that matches what is on screen now. */
  _formEnter(newForm) {
    const wasKidT = this.formT, prev = this.form;
    this.formPrev = prev; this.form = newForm; this.formT = 0; this.tr[T_FORM] = 0;
    if (wasKidT < 0.1) {
      if (newForm === 'kid' && prev !== 'kid') this.formT = clamp(0.06 + 0.035 * (1 - this.sqScale), 0, 0.095) * (this.sqScale < 0.999 ? 1 : 0);
      else if (newForm !== 'kid' && prev === 'kid') this.formT = this.kidScale < 0.999 ? clamp(0.07 + 0.03 * (1 - this.kidScale), 0, 0.1) : 0;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Stepping: world-locked plants, phase-driven gait, settle / catch-up steps
  // ---------------------------------------------------------------------------------------------
  _ground(x, z, n) {
    const ry = this.root.position.y;
    if (this.phys) {
      _gO.set(x, ry + 0.55, z);
      const h = this.phys.raycast(_gO, DOWN, 1.25, _gHit, false);
      if (h.hit && h.normal.y > 0.55) {
        const y = h.point.y;
        if (y > ry - 0.55 && y < ry + 0.52) { if (n) n.copy(h.normal); return y; }
      }
    }
    if (n) n.set(0, 1, 0);
    return ry;
  }

  /** Ideal standing plant (world) for a foot under the current body; returns the foot's world yaw. */
  _idealFoot(f, out) {
    const st = this.stance, R = this.root.position;
    const kx = (f.side > 0 ? st[0] : st[3]) + this.stepOfsX, kz = (f.side > 0 ? st[1] : st[4]) + this.stepOfsZ;
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    out.x = R.x + kx * c + kz * sn; out.z = R.z - kx * sn + kz * c; out.y = R.y;
    return this.yaw + (f.side > 0 ? st[2] : st[5]);
  }

  /** Predicted gait landing (world) for a swing that touches down in tRem seconds. */
  _gaitTarget(f, tRem, out) {
    const R = this.root.position;
    const stHalf = (this.duty / this.cad) * 0.5;
    const yawP = this.yaw + this.yawRate * Math.min(tRem, 0.25) * 0.8;
    const hy = yawP + this.hipTwist;
    const w = lerp(Math.abs(this.stance[f.side > 0 ? 0 : 3]), 0.068, this.runW) * f.side;
    const c = Math.cos(hy), sn = Math.sin(hy);
    const ta = Math.min(tRem, 0.15), ax = this.tread ? 0 : clamp(this.ra.x, -40, 40), az = this.tread ? 0 : clamp(this.ra.z, -40, 40);
    const px = R.x + this.gvx * tRem + 0.5 * ax * ta * ta, pz = R.z + this.gvz * tRem + 0.5 * az * ta * ta;
    let dx = this.gvx * stHalf + w * c, dz = this.gvz * stHalf - w * sn;
    const dl = Math.hypot(dx, dz), mx = 0.3;
    if (dl > mx) { dx *= mx / dl; dz *= mx / dl; }
    out.x = px + dx; out.z = pz + dz;
    out.y = this._ground(out.x, out.z, f.tn);
    // foot points along the hips (toe-out grows a little when walking)
    return hy + f.side * lerp(0.1, 0.04, this.runW);
  }

  _liftOff(f, mode) {
    f.planted = false; f.sw = true; f.mode = mode; f.su = 0;
    f.from.copy(f.pw); f.fromYaw = f.yaw; f.to.copy(f.pw); f.toYaw = f.yaw;
    const fwd = clamp(this.mdz * Math.cos(this.hipTwist) + this.mdx * Math.sin(this.hipTwist), -1, 1);
    f.lift = this.liftH * (mode === M_CATCH ? 0.7 : 1);
    f.toe = lerp(0.3, 0.95, this.runW) * (fwd >= 0 ? fwd : fwd * 0.55);
    f.land = lerp(0.3, 0.1, this.runW) * (fwd >= 0 ? fwd : fwd * 0.6);
    f.dur = mode === M_CATCH ? 0.13 : (1 - this.duty) / this.cad;
  }

  _touchDown(f, loud) {
    f.pw.copy(f.to); f.n.copy(f.tn); f.yaw = f.toYaw;
    f.planted = true; f.sw = false; f.stU = 0; f.su = 0; f.stT = 0;
    // off-beat touchdown (first step, catch-up): re-sync the gait clock to this foot so the other one follows in rhythm
    if (this.moving && f.mode === M_CATCH) {
      this.phase = -f.i * 0.5; f.inSt = true;
      const o = this.feet[1 - f.i]; o.inSt = 0.5 < this.duty;
    }
    this.settleCd = 0.045;
    if (this.onEvent && this.kidForm && this.visible && this.kidScale > 0.5) {
      this._fsPos.copy(f.pw); this._fsData.foot = f.name; this._fsData.speed = loud * Math.max(this.gv, 0.6);
      this.onEvent('footstep', this._fsData);
    }
  }

  _startSettle(f, err) {
    f.planted = false; f.sw = true; f.mode = M_SETTLE; f.su = 0;
    f.from.copy(f.pw); f.fromYaw = f.yaw;
    f.toYaw = this._idealFoot(f, f.to); f.to.y = this._ground(f.to.x, f.to.z, f.tn);
    f.dur = clamp(0.15 + err * 0.42, 0.15, 0.3);
    f.lift = clamp(0.028 + err * 0.22, 0.03, 0.085) + Math.max(0, f.to.y - f.from.y);
    f.toe = 0.25; f.land = 0.12;
  }

  _footErr(f) {
    const yawI = this._idealFoot(f, _v6);
    return Math.hypot(f.pw.x - _v6.x, f.pw.z - _v6.z) + 0.11 * Math.abs(wrapA(f.yaw - yawI));
  }

  _updateFeet(dt, s) {
    const F = this.feet, R = this.root.position;
    const plantOK = this.kidForm && this.grounded && !this.dance && this.tr[T_LEAP] > 1.9 && this.tr[T_SLAM] > 1.4 && this.tr[T_DODGE] > this.dodgeDur * 0.86;
    // treadmill: the ground (and everything planted on it) slides back under a stationary root
    if (this.tread) for (let i = 0; i < 2; i++) { const f = F[i]; f.pw.x -= this.tvx * dt; f.pw.z -= this.tvz * dt; f.from.x -= this.tvx * dt; f.from.z -= this.tvz * dt; f.disp.x -= this.tvx * dt; f.disp.z -= this.tvz * dt; }
    // carried (Tower Command's moving tower): what's planted rides along with the root — else a kid standing still on
    // it keeps stepping after its body (the feet left behind read as a walk)
    const cv = s.carry;
    if (cv && (cv.x || cv.y || cv.z)) for (let i = 0; i < 2; i++) { const f = F[i]; f.pw.add(cv); f.from.add(cv); f.to.add(cv); f.disp.add(cv); f.cw.add(cv); }
    if (!plantOK) {
      this.moving = false; this.replant = true;
      for (let i = 0; i < 2; i++) F[i].sw = false;
      this.plantW = damp(this.plantW, 0, 30, dt);
      this._footPose(F[0]); this._footPose(F[1]);
      return;
    }
    this.plantW = damp(this.plantW, 1, 14, dt);
    if (this.replant || !this.feetValid) {
      for (let i = 0; i < 2; i++) {
        const f = F[i];
        let yaw;
        if (this.feetValid && f.dispOK) { f.pw.copy(f.disp); yaw = f.dispYaw; } else { yaw = this._idealFoot(f, f.pw); }
        f.pw.y = this._ground(f.pw.x, f.pw.z, f.n);
        f.yaw = yaw; f.planted = true; f.sw = false; f.su = 0; f.stU = 0.5; f.inSt = true;
      }
      if (!this.feetValid) this.plantW = 1;
      this.replant = false; this.feetValid = true; this.settleCd = 0.06; this.moving = false;
    }
    const was = this.moving;
    this.moving = was ? this.gv > 0.3 : this.gv > 0.62;
    if (this.moving) {
      if (!was) {
        // start: the foot most "behind" the travel direction takes a quick, short first step while the other pushes
        // off; the gait clock re-syncs to that first touchdown (see _touchDown), so the push-off foot then swings through
        const dx = this.gvx / (this.gv || 1), dz = this.gvz / (this.gv || 1);
        const bL = (F[0].pw.x - R.x) * dx + (F[0].pw.z - R.z) * dz, bR = (F[1].pw.x - R.x) * dx + (F[1].pw.z - R.z) * dz;
        const first = bL <= bR ? 0 : 1;
        this.phase = this.duty + 1e-3 - first * 0.5;
        if (!F[first].sw) { this._liftOff(F[first], M_CATCH); F[first].dur = 0.15; F[first].lift *= 0.8; }
        F[first].inSt = false; F[1 - first].inSt = frac(this.phase + (1 - first) * 0.5) < this.duty;
      }
      this.phase += this.cad * dt;
      for (let i = 0; i < 2; i++) {
        const f = F[i], o = F[1 - i];
        const p = frac(this.phase + i * 0.5);
        const inSt = p < this.duty;
        const wasSt = f.inSt; f.inSt = inSt;
        if (f.planted) {
          f.stU = inSt ? p / this.duty : 1;
          // lift on the stance→swing edge; re-sync when the clock says "swing" while the other foot carries the body;
          // catch up when the body has run away from this foot
          const hx = f.pw.x - R.x, hz = f.pw.z - R.z;
          const far = hx * hx + hz * hz > 0.37 * 0.37;
          if (wasSt && !inSt) this._liftOff(f, M_GAIT);
          else if (!inSt && o.planted && f.stT > 0.06) { this._liftOff(f, M_CATCH); f.dur = clamp((1 - p) / this.cad, 0.09, 0.24); }
          else if (far) this._liftOff(f, M_CATCH);
          f.stT += dt;
        }
        if (f.sw) {
          if (f.mode === M_GAIT) {
            const u = inSt ? 1 : (p - this.duty) / (1 - this.duty);
            f.su = Math.max(f.su, Math.min(1, u));
            const tRem = inSt ? 0 : (1 - p) / this.cad;
            const yawT = this._gaitTarget(f, tRem, _v1);
            const k = f.su > 0.82 ? 1 : 1 - Math.exp(-dt * 28);
            f.to.lerp(_v1, k); f.toYaw = yawT;
            if (f.su >= 1) this._touchDown(f, 1);
          } else {
            f.su = Math.min(1, f.su + dt / f.dur);
            f.toYaw = this._gaitTarget(f, (1 - f.su) * f.dur, f.to);
            if (f.su >= 1) this._touchDown(f, 0.8);
          }
        }
      }
    } else {
      // standing: finish any step in flight onto the stance, then settle the worst foot (stops, turns in place)
      let swinging = 0;
      for (let i = 0; i < 2; i++) {
        const f = F[i];
        if (!f.sw) continue;
        if (f.mode !== M_SETTLE) {
          const rem = clamp((1 - f.su) * (f.mode === M_GAIT ? (1 - this.duty) / Math.max(this.cad, 1.5) : f.dur), 0.09, 0.22);
          f.mode = M_SETTLE; f.dur = rem / Math.max(0.05, 1 - f.su);
          f.lift = Math.max(f.lift * 0.8, 0.04);
        }
        f.su = Math.min(1, f.su + dt / f.dur);
        f.toYaw = this._idealFoot(f, f.to); f.to.y = this._ground(f.to.x, f.to.z, f.tn);
        if (f.su >= 1) this._touchDown(f, 0.45); else swinging++;
      }
      this.settleCd -= dt;
      if (!swinging && this.settleCd <= 0) {
        const eL = this._footErr(F[0]), eR = this._footErr(F[1]);
        const b = eL >= eR ? 0 : 1, e = Math.max(eL, eR);
        if (e > 0.068) this._startSettle(F[b], e);
      }
    }
    this._footPose(F[0]); this._footPose(F[1]);
    // how far the planted feet are turned relative to the body (drives the hip counter-twist when turning in place)
    const tL = wrapA(F[0].cyaw - (this.yaw + this.stance[2])), tR = wrapA(F[1].cyaw - (this.yaw + this.stance[5]));
    this.footTwist = damp(this.footTwist, clamp((tL + tR) * 0.5, -1.2, 1.2), 20, dt);
  }

  /** Current world contact, yaw and pitch of a foot (planted or mid-swing). */
  _footPose(f) {
    if (f.planted || !f.sw) {
      f.cw.copy(f.pw); f.cyaw = f.yaw; f.cn.copy(f.n);
      if (this.moving) {
        const st = f.stU;
        f.pitch = -f.land * (1 - sstep(0, 0.28, st)) + f.toe * sstep(0.42, 1, st);
      } else {
        f.pitch = damp(f.pitch, 0, 12, 1 / 60);
      }
      return;
    }
    const u = f.su;
    const e = lerp(u, mj(u), 0.8);
    f.cw.x = lerp(f.from.x, f.to.x, e); f.cw.z = lerp(f.from.z, f.to.z, e);
    const rise = Math.max(0, f.to.y - f.from.y);
    const gy = lerp(f.from.y, f.to.y, sstep(0.15, 0.7, u));
    const peak = lerp(0.5, 0.4, this.runW);
    const lc = u < peak ? Math.sin((u / peak) * Math.PI * 0.5) : Math.cos(((u - peak) / (1 - peak)) * Math.PI * 0.5);
    f.cw.y = gy + (f.lift + rise * 0.6) * Math.pow(Math.max(0, lc), 1.15);
    f.cyaw = f.fromYaw + wrapA(f.toYaw - f.fromYaw) * e;
    f.cn.copy(f.n).lerp(f.tn, e);
    f.pitch = f.toe * (1 - sstep(0, 0.5, u)) - f.land * sstep(0.55, 0.96, u) + 0.12 * Math.sin(Math.PI * u) * this.runW;
  }

  // ---------------------------------------------------------------------------------------------
  // Pose construction (gameplay layers → P)
  // ---------------------------------------------------------------------------------------------
  _buildPose(dt, s) {
    const P = this.P, sp = this.sp, H = this.hold, tr = this.tr;
    const t = this.t;
    poseNeutral(P);
    const gw = this.gaitW, v = this.gs, rw = this.runW * gw;
    const ph = this.phase, duty = this.duty;
    const pL = frac(ph);
    const air = this.wAir;
    const idleW = (1 - gw) * (1 - air);

    // ---------------- ready stance (idle): soft knees, pelvis tipped forward, chest up and a little proud, arms hanging
    // loose with bent elbows — a coiled little athlete, never a mannequin
    const rdy = idleW * (1 - 0.35 * this.wTired);
    P[HIPS_P + 1] -= 0.036 * idleW;
    P[HIPS] += 0.07 * rdy; P[SPINE] -= 0.03 * rdy; P[CHEST] -= 0.012 * rdy; P[NECK] -= 0.02 * rdy;
    P[UARML] -= 0.1 * rdy; P[UARML + 2] += 0.07 * rdy; P[FARML] -= 0.32 * rdy; P[HANDL + 2] -= 0.12 * rdy;
    P[CLAVL + 2] -= 0.02 * rdy; P[CLAVR + 2] += 0.02 * rdy;

    // (breathing is applied post-dance in _lifePost → _breathe, so menus and dances breathe the same way)
    const shift = spr(sp, S_SHIFT, this.shiftTgt * idleW * (1 - this.wAim * 0.8) * (1 - this.wTired * 0.3), 0.7, 0.85, dt);
    // weight over one leg: the pelvis slides over it and its hip rides up, shoulders tilt back the other way, head tips
    P[HIPS_P] += 0.03 * shift; P[HIPS + 2] += 0.08 * shift; P[SPINE + 2] -= 0.05 * shift; P[CHEST + 2] -= 0.035 * shift;
    P[HIPS + 1] += 0.04 * shift; P[CHEST + 1] -= 0.025 * shift; P[HEAD + 2] += 0.035 * shift;
    P[HIPS_P + 1] -= 0.008 * Math.abs(shift);
    this.shiftS = shift;
    const ms = idleW * (1 - this.wAim);
    P[HIPS + 1] += 0.018 * Math.sin(t * 0.41 + 1.3) * ms; P[SPINE + 2] += 0.012 * Math.sin(t * 0.53) * ms; P[CHEST + 1] += 0.02 * Math.sin(t * 0.29 + 2) * ms;
    // hips follow the planted feet when the body turns in place; the chest keeps facing the aim
    const ft = this.footTwist * (1 - gw);
    P[HIPS + 1] += ft * 0.55; P[SPINE + 1] -= ft * 0.3; P[CHEST + 1] -= ft * 0.25;

    // ---------------- locomotion
    if (gw > 0.001) {
      const bk = sstep(0.1, -0.7, this.mdz), rn = this.runW;
      const yawOsc = -lerp(0.11, 0.2, rn) * Math.cos(TAU * pL) * gw * (1 - bk * 0.5);
      const rollOsc = lerp(0.06, 0.075, rn) * Math.cos(TAU * (pL - duty * 0.5)) * gw;
      const swayX = lerp(0.022, 0.013, rn) * Math.cos(TAU * (pL - duty * 0.5 - 0.06)) * gw;
      // vertical: a run compresses through each stance (lowest ~45 % into it) and floats through the flight; a walk
      // vaults over the planted leg (highest mid-stance)
      const c2 = Math.cos(TAU * 2 * (ph - duty * 0.45));
      const bob = lerp(0.014, -0.036, rn) * c2 * gw * sstep(0.3, 2.0, v);
      P[HIPS_P + 1] += gw * lerp(-0.024, -0.064, rn) * (1 + 0.5 * this.wGoo) + bob;
      P[HIPS_P] += swayX;
      P[HIPS + 1] += this.hipTwist + yawOsc;
      P[HIPS + 2] += rollOsc;
      P[SPINE + 1] -= this.hipTwist * 0.45 + yawOsc * 0.65;
      P[CHEST + 1] -= this.hipTwist * 0.55 + yawOsc * 0.8;
      P[SPINE + 2] -= rollOsc * 0.6; P[CHEST + 2] -= rollOsc * 0.35;
      // run posture: a real forward lean into the stride (less when aiming, backwards when backpedalling); goo wading
      // hunches forward. The stabilised head stays level, so the lean reads as drive, not as falling over.
      const lean = gw * (lerp(0.05, 0.3, rn) * (1 - bk * 1.3) * (1 - 0.55 * this.wAim) + 0.14 * this.wGoo);
      P[HIPS] += lean * 0.3; P[SPINE] += lean * 0.45; P[CHEST] += lean * 0.25;
      // strafing leans into the direction of travel (a sideways shuffle-run banks, it doesn't stay bolt upright)
      const lat = clamp(this.kgx / 6, -1, 1) * gw * (1 - 0.3 * this.wGoo);
      P[SPINE + 2] -= 0.07 * lat; P[CHEST + 2] -= 0.04 * lat; P[HIPS + 2] -= 0.03 * lat;
      // every footfall: a little squash on the compression, a stretch through the flight; a nod that the stabilised
      // head mostly soaks up
      const sq2 = 0.024 * c2 * rn * gw;
      P[SQY] *= 1 - sq2; P[SQXZ] *= 1 + sq2 * 0.45;
      P[HEAD] -= 0.03 * c2 * rn * gw; P[NECK] += 0.02 * c2 * rn * gw;
    }

    // ---------------- lean springs: acceleration, braking, turn banking
    {
      const af = clamp(this.kaz, -48, 48), al = clamp(this.kax, -48, 48);
      const g = 1 - air * 0.75;
      const lp = spr(sp, S_LEANP, clamp(af * 0.0075, -0.36, 0.3) * g, 2.2, 0.4, dt);
      const lr = spr(sp, S_LEANR, clamp(-al * 0.0068, -0.34, 0.34) * g, 2.0, 0.48, dt);
      P[HIPS] += lp * 0.3; P[SPINE] += lp * 0.42; P[CHEST] += lp * 0.28;
      P[HIPS + 2] += lr * 0.4; P[SPINE + 2] += lr * 0.35; P[CHEST + 2] += lr * 0.25;
      // momentum: the body lags the root when it bursts off and carries past it when it brakes, then springs back
      const lagZ = spr(sp, S_LAGZ, clamp(-this.kaz * 0.0012, -0.055, 0.07) * g, 2.3, 0.6, dt);
      const lagX = spr(sp, S_LAGX, clamp(-this.kax * 0.0012, -0.05, 0.05) * g, 2.3, 0.6, dt);
      P[HIPS_P + 2] += lagZ; P[HIPS_P] += lagX;
      P[HIPS_P + 1] -= Math.abs(lp) * 0.06 + Math.abs(lr) * 0.03;
      // hard braking from a run: skid crouch + arms fling forward (the lean spring does the body)
      if (this.kaz < -26 && this.gs > 3 && tr[T_BRAKE] > 0.5) { tr[T_BRAKE] = 0; sp[S_PELY + 1] -= 0.55; sp[S_ARML + 1] -= 5; sp[S_ARMR + 1] -= 1.5; this._hairKick(0, 0, 3); sp[S_TANKZ + 1] += 1.8; }
    }

    // ---------------- springs: pelvis dip, squash, hit reactions, stagger
    const pelY = spr(sp, S_PELY, 0, 3.4, 0.42, dt);
    P[HIPS_P + 1] += clamp(pelY, -0.2, 0.08);
    const sq = spr(sp, S_SQ, 0, 4.8, 0.34, dt);
    P[SQY] *= 1 + clamp(sq, -0.22, 0.16); P[SQXZ] *= 1 - clamp(sq, -0.22, 0.16) * 0.5;
    const hp = spr(sp, S_HITP, 0, 3.4, 0.38, dt), hrl = spr(sp, S_HITR, 0, 3.4, 0.38, dt), hy = spr(sp, S_HITY, 0, 3.4, 0.42, dt);
    P[SPINE] += hp * 0.5; P[CHEST] += hp * 0.6; P[HIPS] += hp * 0.2;
    P[SPINE + 2] += hrl * 0.5; P[CHEST + 2] += hrl * 0.5;
    P[SPINE + 1] += hy * 0.5; P[CHEST + 1] += hy * 0.6;
    P[HIPS_P + 2] += hp * 0.04 + spr(sp, S_STAG, 0, 2.2, 0.5, dt) * 0.05;
    const clv = spr(sp, S_CLAV, 0, 3.5, 0.45, dt);
    P[CLAVL + 2] += clv * 0.12; P[CLAVR + 2] -= clv * 0.12; P[UARML + 2] -= clv * 0.08; P[UARMR + 2] += clv * 0.08;
    P[HIPS_P + 1] -= Math.abs(hp) * 0.08;

    // ---------------- tired / goo posture
    if (this.wTired > 0.01) { const w = this.wTired; P[SPINE] += 0.1 * w; P[CHEST] += 0.08 * w; P[NECK] += 0.05 * w; P[HIPS_P + 1] -= 0.02 * w; P[CLAVL + 2] -= 0.05 * w; P[CLAVR + 2] += 0.05 * w; }

    // ---------------- arms: gait swing with follow-through (springs). A runner's arms: elbows bent near 90°, the fist
    // pumping forward-in to chin height and back-out past the hip; a walk just swings loose.
    {
      const two = this.wTwo, rn = this.runW;
      const armA = gw * lerp(0.3, 0.95, rn) * (1 - 0.35 * this.wGoo);
      const tgt = armA * Math.cos(TAU * (pL - 0.03));
      const aL = spr(sp, S_ARML, tgt, lerp(3.2, 4.8, rn), 0.5, dt);
      const aR = spr(sp, S_ARMR, -tgt, lerp(3.2, 4.8, rn), 0.5, dt);
      const fw = 1 - two;
      P[UARML] += aL * fw; P[UARMR] += aR;
      P[FARML] -= (gw * lerp(0.3, 1.45, rn) + 0.4 * Math.max(0, -aL) * rn) * fw;
      P[UARML + 2] += (0.05 + 0.13 * rw + 0.08 * Math.max(0, aL) * rn + 0.35 * this.wGoo * gw) * fw;
      P[UARML + 1] += 0.18 * Math.max(0, -aL) * rn * fw;                 // the forward swing crosses in a little
      P[CLAVL + 1] += 0.09 * aL * fw; P[CLAVR + 1] -= 0.07 * aR;
      P[CLAVL] -= 0.05 * Math.max(0, -aL) * rn * fw;                     // shoulder rides up on the forward pump
      P[HANDL] -= 0.15 * rw * fw;
      P[HANDPL] = 1 - 0.45 * rw;
      this.armR = aR; this.armL = aL;
    }

    // ---------------- air
    if (air > 0.001) this._poseAir(P, dt, air);

    // ---------------- weapon holds + aim
    this._poseWeapon(dt, s);

    // ---------------- one-shots
    if (tr[T_FLICK] < 0.7) {
      if (this.weaponKind === 'brush') this._poseSwipe(P, tr[T_FLICK]);
      else if (this.weaponKind === 'bucket') this._poseBucket(P, tr[T_FLICK]);
      else if (this.animKind === 'roller') this._poseFlick(P, tr[T_FLICK]);
    }
    if (this.animKind === 'blade') this._poseBlade(P, dt, s);   // Brine Cutlass cuts + charge raise
    if (this.wSub > 0.001 && tr[T_THROW] > 0.05) this._poseSubAim(P, this.wSub);
    if (tr[T_THROW] < 0.62) this._poseThrow(P, tr[T_THROW]);
    if (tr[T_SPAWN] < 1.4) this._poseSpawn(P, tr[T_SPAWN]);
    if (tr[T_LEAP] < 1.9) this._poseLeap(P, tr[T_LEAP]);
    if (tr[T_SLAM] < 1.4) this._poseSlam(P, tr[T_SLAM]);
    if (this.fidget >= 0) this._poseFidget(P, this.fidget, this.fidgetT);
    if (tr[T_LAND] < 0.8 && this.landAmp > 0.3 && this.kidForm && this.grounded && tr[T_SPAWN] > 1.4) this._poseLand(P, tr[T_LAND]);
    if (this.formT < 0.5) this._poseForm(P);
    if (tr[T_ADMIRE] < 1.6 || tr[T_FLIP] < 1.0 || tr[T_WINK] < 0.8) this._poseLocker(P);
    if (tr[T_SLOSH] < 0.66 && this.hold.fire === 'slosh') this._poseSlosh(P, tr[T_SLOSH]);
    if (tr[T_DODGE] < this.dodgeDur + 0.3) this._poseDodge(P, tr[T_DODGE]);
    else { this.tumble = 0; this.tumbleDrop = 0; }
    if (this.weaponKind === 'mitts') this._poseMitts(P, dt, s);   // Sponge Mitts: punches, leap charge, leap, wall cling

    // ---------------- head look + face
    this._poseLook(dt, s);
    this._poseFace(dt, s);

    // ---------------- dances (override everything, blended)
    if (this.wDance > 0.001 || this.dance) {
      const D = this.PD;
      if (this.dance) {
        poseNeutral(D); this._poseDance(D, this.dance, this.danceT + this.danceOfs, dt);
        if (this.danceFade < 1 && this.prevDance) {
          const X = this.PY; poseNeutral(X); this._poseDance(X, this.prevDance, this.prevDanceT + this.danceOfs, 0);
          poseLerp(D, X, D, ease(this.danceFade));
        }
        this.lastDance = this.dance;
      } else if (this.lastDance) { poseNeutral(D); this._poseDance(D, this.lastDance, this.danceT + this.danceOfs, dt); }
      poseLerp(P, P, D, ease(this.wDance));
    }
    // ---------------- life layer on top of everything (micro-expressions, menu head attention, pupils)
    this._lifePost(dt);
  }

  // Air: push-off stretch → knees tuck while rising (a running jump is a leap: the swing knee drives up, the push-off
  // leg trails) → floaty apex → the legs come through and reach for the ground while falling (arms up for balance,
  // windmilling on long falls). The takeoff speed and lead leg are captured by trigger('jump').
  _poseAir(P, dt, air) {
    const X = this.PX; X.set(P);
    const vy = this.vyS, jt = this.tr[T_JUMP];
    const up = sstep(-1.5, 4, vy);                                  // 1 rising … 0 falling
    const launch = jt < 0.3 ? 1 - sstep(0.03, 0.2, jt) : 0;        // legs still extended from the push-off
    const apex = 1 - sstep(0.6, 3.2, Math.abs(vy));                 // hang time at the top
    const reach = (1 - up) * sstep(0.95, 0.15, this.gnd);            // ground coming up: legs reach, knees soft
    const fallLong = sstep(0.4, 1.0, this.airT) * (1 - up) * (1 - reach);
    const lp = jt < 1.2 ? this.jumpRun : 0;                           // running leap vs standing jump
    const ld = this.jumpLead === 1 ? -1 : 1;                          // lead leg side: +1 left, −1 right
    // standing jump: knees tuck up together, then extend down, a little apart
    const tk = (1 - launch) * Math.max(apex, up * 0.85) * (1 - reach);
    setE(X, FOOTL, 0.1, lerp(0.16, 0.34, tk), lerp(0.0, 0.07, tk)); setE(X, FOOTLR, lerp(0.15, 0.55, tk), 0.16, 0);
    setE(X, FOOTR, -0.1, lerp(0.16, 0.31, tk), lerp(-0.03, 0.04, tk)); setE(X, FOOTRR, lerp(0.25, 0.6, tk), -0.16, 0);
    // running leap: lead knee driven up and forward, trail leg stretched back with the toes pointed; it cycles
    // through (legs pass) on the way down
    if (lp > 0.001) {
      const pass = sstep(0.1, -3.5, vy);                            // 0 on the way up … 1 falling: the legs switch
      const lf = ld > 0 ? FOOTL : FOOTR, lr = ld > 0 ? FOOTLR : FOOTRR, tf = ld > 0 ? FOOTR : FOOTL, tr2 = ld > 0 ? FOOTRR : FOOTLR;
      const w = lp * (1 - reach * 0.7);
      lerpE(X, lf, 0.09 * ld, lerp(0.36, 0.16, pass), lerp(0.2, -0.12, pass), w); lerpE(X, lr, lerp(0.25, 0.9, pass), 0.12 * ld, 0, w);
      lerpE(X, tf, -0.09 * ld, lerp(0.15, 0.33, pass), lerp(-0.27, 0.14, pass), w); lerpE(X, tr2, lerp(1.15, 0.3, pass), -0.12 * ld, 0, w);
      X[HIPS + 1] += 0.12 * ld * (1 - 2 * pass) * w; X[CHEST + 1] -= 0.1 * ld * (1 - 2 * pass) * w;
    }
    // push-off: both legs long, toes pointed (the body has left the ground, the feet trail)
    lerpE(X, FOOTL, 0.09, 0.07, -0.06 - 0.06 * lp, launch); lerpE(X, FOOTLR, 1.0, 0.08, 0, launch);
    lerpE(X, FOOTR, -0.09, 0.09, -0.1 - 0.06 * lp, launch); lerpE(X, FOOTRR, 1.1, -0.08, 0, launch);
    // landing reach: legs long and slightly apart under the body, feet flat, ready to absorb
    lerpE(X, FOOTL, 0.11, 0.1, 0.07, reach); lerpE(X, FOOTLR, -0.08, 0.14, 0, reach);
    lerpE(X, FOOTR, -0.11, 0.12, -0.03, reach); lerpE(X, FOOTRR, 0.05, -0.14, 0, reach);
    X[WPL] = 0; X[WPR] = 0;
    X[KNEEL] = 0.12; X[KNEER] = -0.12;
    X[HIPS_P + 1] = -0.03 + 0.03 * up - 0.02 * tk - 0.03 * reach;
    X[HIPS] += 0.1 * tk - 0.06 * launch; X[SPINE] += 0.12 * tk - 0.1 * launch + 0.04 * reach; X[CHEST] += 0.05 * tk - 0.05 * launch;
    X[HLP] += -0.1 * launch + 0.12 * reach + 0.05 * tk;
    // free arm: thrown up with the push-off, spread at the apex, up and out for balance falling, windmilling on long
    // falls; the weapon arm follows its anchor (IK) but the carry lifts a little
    const wm = Math.sin(this.t * 10) * 0.5 * fallLong;
    X[UARML] = lerp(lerp(-1.0, -0.5, up), -2.3, launch) + wm; X[UARML + 2] = lerp(lerp(1.25, 0.95, up), 0.4, launch) + 0.2 * apex; X[FARML] = lerp(-0.7, -0.45, up) - 0.4 * launch;
    X[UARMR] = lerp(lerp(-0.8, -0.35, up), -1.9, launch) - wm; X[UARMR + 2] = -lerp(lerp(1.15, 0.75, up), 0.3, launch); X[FARMR] = lerp(-0.6, -0.4, up);
    X[CLAVL + 2] += 0.1 * (1 - up) + 0.06 * launch; X[CLAVR + 2] -= 0.1 * (1 - up);
    X[ANC + 1] += 0.03 * (1 - this.wAim) * (apex + launch); X[ANCR] -= 0.2 * (1 - this.wAim) * launch;
    X[HANDPL] = 1.4 + 0.5 * (1 - up) + 0.1 * fallLong; X[EARS] += 0.7 * fallLong - 0.4 * launch + 0.4 * apex;
    X[SQY] *= 1 + 0.09 * launch + 0.035 * sstep(-4, -12, vy) - 0.02 * apex; X[SQXZ] *= 1 - 0.045 * launch;
    X[MOPEN] = Math.max(X[MOPEN], 0.25 * apex + 0.45 * fallLong); X[MCURVE] += 0.25 * apex - 0.8 * fallLong;
    X[EYE] += 0.12 * apex + 0.15 * fallLong; X[BROWY] += 0.3 * apex + 0.6 * fallLong;
    X[LOOKY] -= 0.15 * reach;
    poseLerp(P, P, X, air);
  }

  // Weapon anchor (rest-torso kid space) blended over carry / aim / roll + follow weights, stance yaw, recoil, charge.
  // Kinds are data (HOLD): dual wield mirrors the anchor into the left fist; lock / spin / slosh are generic layers.
  _poseWeapon(dt, s) {
    const P = this.P, H = this.hold, sp = this.sp, t = this.t;
    const aimP = clamp(s.aimPitch ?? 0, -1.0, 1.15);
    const aimPose = clamp(aimP, -0.8, 1.0);
    const wAim = this.wAim, wRoll = this.wRoll, gw = this.gaitW;
    const dual = this.dual;
    this.aimP = aimP;
    // carry (one-handed carries swing a little with the arm; a dual carry swings each pistol with its own arm)
    const c = H.carry;
    const one = 1 - H.twoCarry;
    const swR = clamp(this.armR || 0, -0.45, 0.45) * one, swL = dual ? clamp(this.armL || 0, -0.45, 0.45) : 0;
    const swA = dual ? 0 : swR;
    setE(P, ANC, c.p[0], c.p[1] + 0.012 * Math.sin(TAU * 2 * this.phase) * gw, c.p[2] - swA * 0.1);
    setE(P, ANCR, c.r[0] + swA * 0.55, c.r[1], c.r[2]);
    // running carry: the weapon comes up and forward, ready (HOLD.run, or the carry lifted toward level)
    const rk = gw * this.runW;
    if (rk > 0.001) {
      if (H.run) { lerpE(P, ANC, H.run.p[0], H.run.p[1] + 0.012 * Math.sin(TAU * 2 * this.phase), H.run.p[2] - swA * 0.08, rk); lerpE(P, ANCR, H.run.r[0] + swA * 0.4, H.run.r[1], H.run.r[2], rk); }
      else { P[ANC + 1] += 0.025 * rk; P[ANC + 2] += 0.04 * rk; P[ANCR] -= 0.18 * rk; }
    }
    // aim: rotate about the aim pivot with the camera pitch (the dualies' post-roll lock is a lower, wider variant)
    if (wAim > 0.001) {
      const a = H.aim, lk = H.lock ? this.lockW : 0;
      const ax = lerp(a.p[0], lk ? H.lock.p[0] : 0, lk), ay = lerp(a.p[1], lk ? H.lock.p[1] : 0, lk), az = lerp(a.p[2], lk ? H.lock.p[2] : 0, lk);
      _v1.set(ax, ay, az).applyAxisAngle(XAX, -aimPose).add(AIM_PIVOT);
      lerpE(P, ANC, _v1.x, _v1.y, _v1.z, wAim);
      lerpE(P, ANCR, a.r[0] - aimP, lerp(a.r[1], lk ? H.lock.r[1] : 0, lk), lerp(a.r[2], lk ? H.lock.r[2] : 0, lk), wAim);
      lerpE(P, POLER, H.poleR[0], H.poleR[1], H.poleR[2], wAim);
      lerpE(P, POLEL, H.poleL[0], H.poleL[1], H.poleL[2], wAim);
      P[AFOLR] = lerp(P[AFOLR], 0, wAim);
      // aim stance: hips turn with the feet, chest turns back to the target, spine pitches with the aim
      const st = wAim * (1 - 0.6 * gw);
      P[HIPS + 1] += H.hip * st; P[SPINE + 1] -= H.hip * 0.35 * st; P[CHEST + 1] += (H.chest - H.hip * 0.65) * st;
      P[SPINE] -= aimPose * 0.1 * wAim; P[CHEST] -= aimPose * 0.18 * wAim;
      P[HIPS_P + 1] -= H.crouch * st;
      P[NECK] -= aimP * 0.08 * wAim;
      // charger: charge breathing — sway shrinks as the charge builds, a tremble at full charge, cheek to the scope
      if (this.animKind === 'charger') {
        const ch = this.charge;
        const bw = (1 - ch) * 0.012 * wAim;
        P[ANC + 1] += Math.sin(TAU * this.brPh) * bw; P[ANC] += Math.sin(TAU * this.brPh * 0.5 + 1) * bw * 0.6;
        const tremble = ch >= 0.99 ? 0.0025 * Math.sin(t * 71) + 0.0018 * Math.sin(t * 53 + 1) : 0;
        P[ANC + 1] += tremble; P[ANCR] += tremble * 3;
        P[HEAD + 2] -= 0.12 * ch * wAim; P[NECK + 2] -= 0.05 * ch * wAim; P[HLY] -= 0.05 * ch * wAim;
        P[HIPS_P + 1] -= 0.02 * ch * wAim; P[CHEST] += 0.04 * ch * wAim;
      }
      // dualies lock (after a roll): planted turret — wide low stance, both arms locked forward, no carry sway
      if (lk > 0.001) {
        P[HIPS_P + 1] -= 0.05 * lk; P[HIPS] += 0.1 * lk; P[SPINE] += 0.04 * lk; P[CHEST] -= 0.02 * lk;
        P[HLP] += 0.04 * lk; P[KNEEL] += 0.12 * lk; P[KNEER] -= 0.12 * lk;
        P[CLAVL + 1] -= 0.08 * lk; P[CLAVR + 1] += 0.08 * lk;
      }
    }
    if (this.weaponKind === 'bow') poseBow(this, P, dt);   // Tideline Bow: the draw + the cant (see poseBow)
    // splatling: spin-up leans back onto the rear foot with the muzzle rising from low to level (tremble at full
    // charge); the stream plants the kid leaning into a sustained push-back (the 15 Hz kicks ride the recoil springs)
    if (H.fire === 'spin') {
      const R = this._runner(s);
      const charging = R ? !!R.charging : !!s.firing && (s.charge ?? 0) > 0.001 && !this._labStream;
      const streaming = R ? !!R.streaming : !!this._labStream;
      const chg = R ? clamp(R.charge || 0, 0, 1) : clamp(s.charge ?? 0, 0, 1);
      this.spinW = damp(this.spinW, charging ? 1 : 0, charging ? 12 : 7, dt);
      this.streamW = damp(this.streamW, streaming ? 1 : 0, streaming ? 16 : 5, dt);
      const cw = this.spinW * wAim, sw2 = this.streamW * wAim;
      if (cw > 0.001) {
        P[ANCR] += 0.42 * (1 - ease(chg)) * cw;                                  // muzzle low → level as it charges
        P[ANC + 1] -= 0.03 * (1 - chg) * cw; P[ANC + 2] -= 0.02 * cw;
        P[SPINE] -= 0.07 * cw; P[CHEST] -= 0.05 * cw; P[HIPS_P + 2] -= 0.025 * cw; P[HIPS_P] -= 0.012 * cw;
        P[HIPS_P + 1] -= 0.012 * cw; P[HLP] += 0.03 * cw;
        const full = sstep(0.9, 1, chg) * cw;
        if (full > 0.001) {
          const tr1 = 0.0035 * Math.sin(t * 67) + 0.0024 * Math.sin(t * 91 + 1.7), tr2 = 0.0028 * Math.sin(t * 59 + 0.6);
          P[ANC + 1] += tr1 * full; P[ANC] += tr2 * full; P[ANCR] += tr1 * 3 * full; P[CHEST + 2] += tr2 * 2 * full;
        }
        this._effort = Math.max(this._effort || 0, 0.35 + 0.5 * chg * cw);
      }
      if (sw2 > 0.001) {
        P[SPINE] += 0.075 * sw2; P[CHEST] += 0.045 * sw2; P[HIPS_P + 2] -= 0.018 * sw2; P[HIPS_P + 1] -= 0.018 * sw2;
        P[ANC + 2] -= 0.012 * sw2; P[NECK] += 0.02 * sw2; P[KNEEL] += 0.08 * sw2; P[KNEER] -= 0.08 * sw2;
        const bf = R ? clamp(R.burstFrac ?? 1, 0, 1) : 1;
        P[ANCR] += (0.008 * Math.sin(t * 5.3) + 0.004 * Math.sin(t * 11.1)) * sw2 * bf;   // fighting the stream
        this._effort = Math.max(this._effort || 0, 0.7 * sw2);
      }
    }
    // roller push: arms extended, leaning into the handle, drum pressed to the ground
    if (wRoll > 0.001 && H.roll) {
      const a = H.roll;
      lerpE(P, ANC, a.p[0], a.p[1], a.p[2], wRoll);
      lerpE(P, ANCR, a.r[0], a.r[1], a.r[2], wRoll);
      P[AFOLT] = lerp(P[AFOLT], 0.45, wRoll); P[AFOLR] = lerp(P[AFOLR], 0.15, wRoll);
      P[SPINE] += 0.17 * wRoll; P[CHEST] += 0.1 * wRoll; P[HIPS] += 0.08 * wRoll;
      P[HIPS_P + 1] -= H.crouch * wRoll; P[HIPS_P + 2] -= 0.02 * wRoll;
      P[HLP] += 0.05 * wRoll;
      lerpE(P, POLER, -0.7, -0.35, -0.7, wRoll); lerpE(P, POLEL, 0.7, -0.35, -0.7, wRoll);
      P[HIPS + 1] += H.hip * wRoll * (1 - gw);
    }
    // two hands on one weapon (foregrip IK) — a dual wield is never "two-handed": each fist holds its own pistol
    this.wTwo = dual ? 0 : Math.max(lerp(H.twoCarry, H.twoAim, wAim), H.roll ? 1 : 0);
    P[IKL] = dual ? 1 : this.wTwo;
    P[CLAVL + 1] -= 0.28 * this.wTwo; P[CLAVR + 1] += 0.1 * this.wTwo; P[CLAVL + 2] += 0.04 * this.wTwo;
    // support hand can't quite reach the foregrip (steep aim, long guns): protract the shoulder and turn the chest into
    // the gun until it does (integrating on last frame's IK error — the grip never visibly separates)
    const le = this.ikErrPre * (this.wTwo > 0.5 ? 1 : 0);
    this.lReach = clamp(this.lReach + (le > 0.004 ? le * 30 : -0.5) * dt, 0, 0.55);
    P[CLAVL + 1] -= this.lReach; P[CHEST + 1] -= this.lReach * 0.35; P[CLAVL] -= this.lReach * 0.3;
    if (this.wTwo > 0) P[UARML] *= 1 - this.wTwo;
    // sustained fire: lean into the gun, knees soften, a slow fight-the-muzzle wander; letting go gives a small dip +
    // settle (follow-through). Blaster: racking the pump tips the muzzle down and turns the chest into the pull.
    {
      const kind = this.animKind, br = H.rc.brace || 0;
      const want = br > 0 && s.firing && this.lastShot < 0.22 && kind !== 'roller' ? 1 : 0;
      if (!want && this._fireWant) sp[S_RCP + 1] -= 1.1 * br * this.fireHold;
      this._fireWant = want;
      this.fireHold = damp(this.fireHold || 0, want, want ? 9 : 4, dt);
      const fh = this.fireHold * wAim * br;
      if (fh > 0.001) {
        P[CHEST] += 0.055 * fh; P[SPINE] += 0.02 * fh; P[HIPS_P + 1] -= 0.012 * fh; P[NECK] += 0.02 * fh;
        P[ANCR] += (0.012 * Math.sin(t * 4.1 + 1) + 0.006 * Math.sin(t * 9.7)) * fh; P[ANCR + 1] += 0.01 * Math.sin(t * 3.3) * fh;
        P[ANC + 2] -= 0.012 * fh;
      }
      const pk = this.weapon && this.weapon.pump ? this.weapon.pump : 0;
      if (pk) { P[ANCR] += 0.06 * pk; P[CHEST + 1] += 0.05 * pk * wAim; P[SPINE + 1] += 0.02 * pk * wAim; P[ANC + 2] -= 0.01 * pk; }
    }
    // dual wield: the left pistol's anchor is the right one mirrored across the kid's midline (+ its own arm swing)
    if (dual) {
      P[ANL] = -P[ANC]; P[ANL + 1] = P[ANC + 1]; P[ANL + 2] = P[ANC + 2];
      P[ANLR] = P[ANCR]; P[ANLR + 1] = -P[ANCR + 1]; P[ANLR + 2] = -P[ANCR + 2];
      const cw = 1 - wAim;
      P[ANC + 2] -= swR * 0.1 * cw; P[ANCR] += swR * 0.55 * cw;
      P[ANL + 2] -= swL * 0.1 * cw; P[ANLR] += swL * 0.55 * cw;
    }
    // recoil springs (impulses come from trigger('shoot' / 'charge_release'); dual wield: one set per hand)
    const rc = H.rc;
    const rp = sprA(sp, S_RCP, 0, rc.hz, rc.z, dt), rz = sprA(sp, S_RCZ, 0, rc.hz, rc.z, dt);
    sprA(sp, S_RCY, 0, rc.hz * 1.3, 0.5, dt); sprA(sp, S_RCR, 0, rc.hz * 1.3, 0.5, dt);
    P[CHEST] -= rp * rc.torso; P[SPINE] -= rp * rc.torso * 0.4; P[HEAD] -= rp * rc.head;
    P[HIPS_P + 2] -= rz * 0.35; P[HIPS_P + 1] -= Math.abs(rz) * rc.crouch * 8;
    P[CLAVR + 1] -= rz * 1.5;
    this.rcP = rp; this.rcZ = rz;
    if (dual) {
      const rp2 = sprA(sp, S_RCP2, 0, rc.hz, rc.z, dt), rz2 = sprA(sp, S_RCZ2, 0, rc.hz, rc.z, dt);
      sprA(sp, S_RCY2, 0, rc.hz * 1.3, 0.5, dt);
      P[CHEST] -= rp2 * rc.torso; P[SPINE] -= rp2 * rc.torso * 0.4; P[HEAD] -= rp2 * rc.head;
      P[HIPS_P + 2] -= rz2 * 0.35; P[CLAVL + 1] += rz2 * 1.5;
      // alternating shots twist the chest a hair toward the firing side
      P[CHEST + 1] += (rz2 - rz) * 0.6;
      this.rcP2 = rp2; this.rcZ2 = rz2;
    }
  }

  // Moving weapon parts are owned by the arsenal stream: animateWeapon(w, st) (character-weapons.js) runs once per held
  // instance per frame with one reused state object. Near/far LOD by camera distance (far = merged static weapon).
  _animWeapon(dt, s, w) {
    let near = true;
    if (this.inWorld && !this.isLocal && G.camera) near = G.camera.position.distanceToSquared(this.root.position) < 15 * 15;
    // a far-tier kid holds the merged weapon, decimated like the body (a 4–6k-tri gun on a 60 px kid is all waste)
    const farT = this.lod.tier === T_FAR && this.lod.to < 0;
    if (farT) near = false;
    for (let x = w; x; x = x.left) {
      if (x.farDec === farT) continue;
      x.farDec = farT;
      x.bodyFar.geometry = farT ? farGeometry(x.def.body, 700) : x.def.body; x.inkFar.geometry = farT ? farGeometry(x.def.ink, 300) : x.def.ink;
    }
    const st = this._wst;
    st.t = this.t; st.dt = dt; st.color = this.color; st.near = near; st.hand = 0;
    st.runner = this._runner(s); st.sinceShoot = this.tr[T_SHOOT]; st.sinceFlick = this.tr[T_FLICK]; st.sinceRelease = this.lastRelease;
    st.charge = this.charge; st.full = this.fullT > 0; st.chargeFlash = this.chargeFlash; st.lowInk = this.wLow; st.firing = !!s.firing;
    st.rolling = this.wRoll; st.grounded = this.grounded; st.groundSpeed = this.gv;
    st.worldQuat = w.def.kind === 'slosher' && near ? w.off.getWorldQuaternion(this._wq) : null;
    animateWeapon(w, st);
    if (w.left) {
      st.hand = 1; st.sinceShoot = this.tr[T_SHOOTL];
      animateWeapon(w.left, st);
    }
  }

  /** The actor's WeaponRunner (read-only: charging / streaming / dodge / lockT …); labs may pass s.runner. */
  _runner(s) {
    if (s && s.runner !== undefined) return s.runner;
    const a = this._owner();
    return a ? a.weaponRunner || null : null;
  }

  // Roller flick: coiled windup over the shoulder → whip (release at the weapon's windup time) → follow-through.
  _poseFlick(P, ft) {
    const X = this.PX; X.set(P);
    const kUp = ease(ft / 0.15);                 // coil
    const kWhip = ease((ft - 0.15) / 0.08);      // whip through release (~0.22 s)
    const kFol = easeOut((ft - 0.23) / 0.14);    // follow-through
    const kRec = ease((ft - 0.42) / 0.26);       // recover
    let ax = -0.11, ay = 0.84, az = 0.18, rx = 0.8, ry = 0.1;
    ax = lerp(ax, -0.13, kUp); ay = lerp(ay, 1.22, kUp); az = lerp(az, -0.02, kUp); rx = lerp(rx, -2.3, kUp); ry = lerp(ry, 0.3, kUp);
    ax = lerp(ax, -0.07, kWhip); ay = lerp(ay, 0.98, kWhip); az = lerp(az, 0.3, kWhip); rx = lerp(rx, -0.1, kWhip); ry = lerp(ry, 0.05, kWhip);
    ax = lerp(ax, -0.06, kFol); ay = lerp(ay, 0.74, kFol); az = lerp(az, 0.3, kFol); rx = lerp(rx, 0.75, kFol);
    const w = 1 - kRec;
    lerpE(X, ANC, ax, ay, az, w); lerpE(X, ANCR, rx, ry, 0, w);
    X[AFOLT] = lerp(X[AFOLT], 0.6, w); X[AFOLR] = lerp(X[AFOLR], 0.25, w);
    const coil = kUp * (1 - kWhip), whip = kWhip * (1 - kRec);
    X[SPINE] += (-0.22 * coil + 0.34 * whip) ; X[CHEST] += (-0.14 * coil + 0.2 * whip);
    X[SPINE + 1] += 0.2 * coil - 0.12 * whip; X[CHEST + 1] += 0.18 * coil - 0.1 * whip;
    X[HIPS_P + 1] -= 0.03 * coil + 0.05 * whip; X[HIPS_P + 2] += -0.02 * coil + 0.03 * whip;
    X[HLP] += 0.06 * coil - 0.1 * whip;
    lerpE(X, POLER, -0.8, 0.1, -0.3, coil); lerpE(X, POLEL, 0.8, 0.1, -0.3, coil);
    this._effort = Math.max(this._effort || 0, coil + whip * 0.7);
    poseLerp(P, P, X, 1);
  }

  // Bucket (trigger 'flick'): two-handed underarm throw — dip and swing the pail back beside the hip, heave it forward
  // and up so the mouth tips out (ink leaves at ~0.12 s), follow through, settle back into the hold.
  _poseBucket(P, ft) {
    const X = this.PX; X.set(P);
    const kBack = ease(ft / 0.11);
    const kFwd = ease((ft - 0.09) / 0.1);
    const kFol = easeOut((ft - 0.19) / 0.12);
    const kRec = ease((ft - 0.34) / 0.24);
    let ax = -0.1, ay = 0.7, az = 0.24, rx = 0.25;
    ax = lerp(ax, -0.2, kBack); ay = lerp(ay, 0.48, kBack); az = lerp(az, -0.1, kBack); rx = lerp(rx, 0.95, kBack);
    ax = lerp(ax, -0.08, kFwd); ay = lerp(ay, 0.9, kFwd); az = lerp(az, 0.42, kFwd); rx = lerp(rx, -0.5, kFwd);
    ay = lerp(ay, 0.98, kFol); az = lerp(az, 0.46, kFol); rx = lerp(rx, -0.85, kFol);
    const w = 1 - kRec;
    lerpE(X, ANC, ax, ay, az, w); lerpE(X, ANCR, rx, 0.05, 0, w);
    const back = kBack * (1 - kFwd), heave = kFwd * (1 - kRec);
    X[SPINE] += (0.3 * back - 0.12 * heave); X[CHEST] += (0.14 * back - 0.1 * heave);
    X[SPINE + 1] += 0.16 * back - 0.06 * heave; X[CHEST + 1] += 0.12 * back;
    X[HIPS_P + 1] -= 0.07 * back - 0.02 * heave; X[HIPS_P + 2] += -0.04 * back + 0.05 * heave;
    X[HLP] += 0.08 * back - 0.06 * heave;
    lerpE(X, POLER, -0.8, -0.7, 0.1, back); lerpE(X, POLEL, 0.8, -0.7, 0.1, back);
    this._effort = Math.max(this._effort || 0, back * 0.6 + heave);
    poseLerp(P, P, X, 1);
  }

  // Brush: a quick sideways swipe low across the body (alternating direction), torso twisting with the sweep.
  _poseSwipe(P, ft) {
    const X = this.PX; X.set(P);
    const sd = this.swipeSide || 1;
    const k = ease(ft / 0.13);
    const kRec = ease((ft - 0.15) / 0.2);
    const u = lerp(-sd, sd, k);                       // -1 … 1 across the body
    const w = 1 - kRec;
    lerpE(X, ANC, -0.06 + 0.3 * u, 0.78, 0.28, w);
    lerpE(X, ANCR, 0.9, 0.95 * u, -0.2 * u, w);
    X[SPINE + 1] += 0.3 * u * w; X[CHEST + 1] += 0.24 * u * w; X[HIPS + 1] += 0.1 * u * w;
    X[SPINE] += 0.14 * w; X[CHEST] += 0.06 * w; X[HIPS_P + 1] -= 0.03 * w;
    lerpE(X, POLER, -0.7, -0.35, -0.7, w); lerpE(X, POLEL, 0.7, -0.35, -0.7, w);
    this._effort = Math.max(this._effort || 0, 0.5 * w);
    poseLerp(P, P, X, 1);
  }

  // ---- Brine Cutlass (kits/blade.js) ------------------------------------------------------------------------------
  // Quick cut ('blade_slash', side ±1): the fist sweeps a flat, slightly diagonal arc across the chest round a point in
  // front of the sternum, the edge leading (+1: right, high → left, low; −1: back again, rising), the torso whipping round
  // with it; follow-through, then back to the guard. Charging (runner charge > 0): the blade rises over the right
  // shoulder, cocked back, the body coiling as it fills (a tremble at full). Charged cut ('blade_heavy'): the blade
  // whips over and down in front, the kid lunging into it, then recovers.
  _poseBlade(P, dt, s) {
    this.blT = (this.blT ?? 99) + dt;
    const bt = this.blT, sd = this.blSide || 1, heavy = !!this.blHeavy;
    const ch = clamp(s.charge ?? 0, 0, 1);
    const up = ch > 0.001 && this.kidForm && !this.dance;
    this.blRaise = damp(this.blRaise || 0, up ? 1 : 0, up ? 18 : 9, dt);
    const rw = this.blRaise * (heavy && bt < 0.45 ? 0 : 1);
    const cutW = heavy ? (bt < 0.6 ? 1 - ease((bt - 0.26) / 0.3) : 0) : (bt < 0.4 ? ease(bt / 0.03) * (1 - ease((bt - 0.17) / 0.2)) : 0);
    if (rw < 0.001 && cutW < 0.001) return;
    const X = this.PX; X.set(P);
    if (rw > 0.001) {
      const k = ease(ch), full = ch >= 0.999 ? 1 : 0;
      const trem = full ? 0.004 * Math.sin(this.t * 63) + 0.003 * Math.sin(this.t * 41 + 1) : 0;
      lerpE(X, ANC, -0.2, lerp(1.16, 1.3, k) + trem, lerp(0.05, -0.03, k), rw);
      lerpE(X, ANCR, lerp(-1.75, -2.35, k) + trem * 4, lerp(0.12, 0.22, k), lerp(0.05, 0.22, k), rw);
      X[AFOLT] = lerp(X[AFOLT], 0.55, rw); X[AFOLR] = lerp(X[AFOLR], 0.25, rw);
      X[SPINE + 1] -= 0.16 * k * rw; X[CHEST + 1] -= 0.18 * k * rw; X[HIPS + 1] -= 0.05 * rw;   // coil: shoulders turn right
      X[SPINE] -= 0.05 * k * rw; X[CHEST] -= 0.05 * rw; X[HIPS_P + 1] -= 0.025 * k * rw;
      lerpE(X, POLER, -0.95, 0.15, -0.35, rw);
      this._effort = Math.max(this._effort || 0, (0.3 + 0.6 * k) * rw);
    }
    if (cutW > 0.001) {
      const w = cutW;
      let ax, ay, az, rx, ry, rz;
      if (!heavy) {
        // sweep 0.02 → 0.11 s along the arc (φ = where the fist is round the pivot), the blade pointing out along it
        const k = easeOut(clamp((bt - 0.015) / 0.095, 0, 1));
        const f0 = sd > 0 ? -1.3 : 1.15, f1 = sd > 0 ? 1.15 : -1.3, f = lerp(f0, f1, k);
        ax = -0.08 + 0.34 * Math.sin(f); az = 0.06 + 0.3 * Math.cos(f);
        ay = sd > 0 ? 1.03 - 0.13 * k : 0.91 + 0.11 * k;
        ry = f * 1.08; rx = sd > 0 ? lerp(-0.18, 0.28, k) : lerp(0.24, -0.16, k); rz = sd * Math.PI * 0.5;
        const u = lerp(-sd, sd, k);                                 // −1 … 1 across the body (+ = toward the left)
        X[SPINE + 1] += 0.26 * u * w; X[CHEST + 1] += 0.24 * u * w; X[HIPS + 1] += 0.1 * u * w;
        X[SPINE] += 0.08 * w; X[HIPS_P + 1] -= 0.02 * w;
        X[CLAVR + 1] += 0.12 * Math.max(0, u) * w;                   // shoulder reaches across on the forehand
        lerpE(X, POLER, -0.8, -0.55, -0.1, w);
        this._effort = Math.max(this._effort || 0, 0.55 * w);
      } else {
        // over and down: raised (cocked) → level in front (0.06 s) → low in front (0.12 s), the body lunging into it
        const k1 = ease(bt / 0.06), k2 = easeOut((bt - 0.055) / 0.07);
        ax = lerp(lerp(-0.2, -0.1, k1), -0.07, k2); ay = lerp(lerp(1.3, 1.08, k1), 0.62, k2); az = lerp(lerp(-0.03, 0.42, k1), 0.47, k2);
        rx = lerp(lerp(-2.35, -0.15, k1), 0.95, k2); ry = lerp(lerp(0.22, 0.08, k1), 0.04, k2); rz = lerp(0.22, 0, k1);
        const lg = ease(bt / 0.08) * (1 - ease((bt - 0.3) / 0.25));
        X[SPINE] += 0.2 * lg; X[CHEST] += 0.1 * lg; X[HIPS] += 0.06 * lg; X[NECK] -= 0.1 * lg;
        X[HIPS_P + 1] -= 0.045 * lg; X[HIPS_P + 2] += 0.04 * lg;
        X[SPINE + 1] += 0.12 * lg; X[CHEST + 1] += 0.08 * lg;       // uncoil through the cut
        X[KNEEL] += 0.05 * lg; X[KNEER] -= 0.05 * lg;
        lerpE(X, POLER, -0.85, -0.45, -0.3, w);
        this._effort = Math.max(this._effort || 0, 0.9 * w);
      }
      lerpE(X, ANC, ax, ay, az, w); lerpE(X, ANCR, rx, ry, rz, w);
      X[AFOLT] = lerp(X[AFOLT], 0.35, w); X[AFOLR] = lerp(X[AFOLR], 0.12, w);
    }
    poseLerp(P, P, X, 1);
  }

  // Heavy landing (falls from height): the springs give the squash; this adds the absorb — a deep squat with the chest
  // folding over the knees, the free arm flung down and out (a hand to the deck on the biggest drops), head dipping,
  // then a push back up. Scaled by the impact; small hops only get the springs.
  _poseLand(P, lt) {
    const a = this.landAmp, X = this.PX; X.set(P);
    const k = win(lt, 0, 0.035, 0.07 + 0.13 * a, 0.3 + 0.38 * a) * sstep(0.3, 0.75, a);
    if (k <= 0.001) return;
    const big = sstep(0.7, 0.95, a) * (1 - this.wAim) * (1 - this.wTwo);
    X[HIPS_P + 1] -= 0.11 * a; X[HIPS_P + 2] -= 0.02 * a; X[HIPS] += 0.14 * a; X[SPINE] += 0.26 * a; X[CHEST] += 0.1 * a;
    X[HLP] += 0.12 * a; X[NECK] += 0.08 * a; X[KNEEL] += 0.16 * a; X[KNEER] -= 0.16 * a;
    X[UARML] = lerp(X[UARML], -0.35, 0.8); X[UARML + 2] = lerp(X[UARML + 2], 0.95, 0.8); X[FARML] = lerp(X[FARML], -0.25, 0.8);
    X[HANDPL] = lerp(X[HANDPL], 2, 0.8);
    // biggest drops: the free hand slaps the deck beside the front foot
    X[LTW] = Math.max(X[LTW], big); setE(X, LTGT, 0.24, 0.1, 0.2); X[IKL] *= 1 - big;
    lerpE(X, POLEL, 1, 0.2, 0, big); X[HIPS_P + 1] -= 0.05 * big; X[SPINE] += 0.12 * big;
    X[SQUINT] += 0.5 * a; X[MCURVE] -= 0.3 * a; X[EARS] -= 0.7 * a;
    this._effort = Math.max(this._effort || 0, 0.5 * a * k);
    poseLerp(P, P, X, k);
  }

  // Locker one-shots: 'admire' (glance down at the new outfit, tug the tee hem, a satisfied nod), 'hairflip' (a head
  // toss that flings the tentacles, the free hand brushing past), 'wink' (tilt, wink, grin).
  _poseLocker(P) {
    const tr = this.tr, X = this.PX; X.set(P);
    let w = 0;
    if (tr[T_ADMIRE] < 1.6) {
      const t = tr[T_ADMIRE], k = win(t, 0, 0.25, 1.05, 1.5), tug = win(t, 0.35, 0.5, 0.75, 0.95);
      w = Math.max(w, k);
      X[HLP] += 0.42 * k; X[HLY] += 0.22 * k; X[SPINE] += 0.06 * k; X[CHEST + 1] += 0.12 * k; X[LOOKY] -= 0.25 * k;
      X[LTW] = k; setE(X, LTGT, 0.08, 0.735 - 0.035 * tug, 0.13); X[IKL] *= 1 - k;
      lerpE(X, POLEL, 0.8, -0.4, 0.2, k); X[HANDPL] = lerp(X[HANDPL], -0.6, k);
      X[MCURVE] += 0.45 * k; X[BROWY] += 0.3 * k; X[EARS] += 0.3 * k;
      const nod = win(t, 1.0, 1.12, 1.2, 1.4); X[HLP] += 0.12 * nod; X[HEAD] += 0.06 * nod;
      if (tug > 0.9 && !this._tugged) { this._tugged = true; this.sp[S_HEMP + 1] -= 2; } else if (tug < 0.2) this._tugged = false;
    }
    if (tr[T_FLIP] < 1.0) {
      const t = tr[T_FLIP], k = win(t, 0, 0.12, 0.55, 0.95), toss = win(t, 0.1, 0.22, 0.3, 0.5);
      w = Math.max(w, k);
      X[HEAD + 2] += -0.25 * k + 0.4 * toss; X[HLP] -= 0.15 * toss; X[HLY] += 0.15 * k;
      X[LTW] = Math.max(X[LTW], win(t, 0.02, 0.15, 0.3, 0.55)); setE(X, LTGT, 0.2, 1.22, 0.02); X[IKL] *= 1 - k;
      lerpE(X, POLEL, 1, 0.3, -0.2, k); X[HANDPL] = lerp(X[HANDPL], 1.9, k);
      X[MCURVE] += 0.6 * k; X[MTILT] += 0.2 * k; X[EYE] -= 0.35 * toss; X[EARS] += 0.6 * toss;
      if (t >= 0.2 && t - this._dt < 0.2) { this._hairKick(-2.5, 3, 1); this.sp[S_EARL + 1] += 4; this.sp[S_EARR + 1] += 4; }
    }
    if (tr[T_WINK] < 0.8) {
      const t = tr[T_WINK], k = win(t, 0, 0.1, 0.45, 0.75);
      w = Math.max(w, k);
      X[WINK] = Math.max(X[WINK], win(t, 0.08, 0.14, 0.4, 0.5)); X[HEAD + 2] -= 0.16 * k; X[HLY] += 0.08 * k;
      X[MCURVE] += 0.7 * k; X[MTILT] += 0.25 * k; X[MOPEN] = Math.max(X[MOPEN], 0.15 * k); X[BROW] -= 0.2 * k; X[EARS] += 0.5 * k;
    }
    poseLerp(P, P, X, clamp(w * 4, 0, 1));
  }

  // Kid-side acting for the transform: diving in, a dip with the free arm thrown up (like diving into water); springing
  // out, the free arm flings up and out, ears perk, a quick grin — the kid arrives with a flourish, not a fade.
  _poseForm(P) {
    const t = this.formT;
    if (this.form !== 'kid' && this.formPrev === 'kid') {
      if (t > 0.1) return;
      const k = ease(t / 0.05), fw = 1 - this.wTwo;
      P[UARML] = lerp(P[UARML], -2.4, k * fw); P[UARML + 2] = lerp(P[UARML + 2], 0.35, k * fw); P[FARML] = lerp(P[FARML], -0.2, k * fw);
      P[SPINE] += 0.2 * k; P[CHEST] += 0.08 * k; P[HLP] += 0.22 * k; P[HIPS_P + 1] -= 0.05 * k; P[EARS] -= 0.8 * k;
      P[HANDPL] = lerp(P[HANDPL], 2, k); P[EYE] -= 0.45 * k; P[MCURVE] += 0.35 * k;
    } else if (this.form === 'kid' && this.formPrev !== 'kid') {
      if (t >= 0.045 && t - this._dt < 0.045) {
        // out of the ink: the tentacles start from rest and get flung up with the body
        this.hx.fill(0); this.hv.fill(0); this.tipX.fill(0); this.tipV.fill(0);
        this._hairKick(0, 4.2, 0.6); this.sp[S_TANKL + 1] += 2.2; this.sp[S_EARL + 1] += 5; this.sp[S_EARR + 1] += 5;
      }
      const fl = win(t, 0.045, 0.1, 0.17, 0.42), fw = 1 - this.wTwo, na = 1 - this.wAim;
      P[UARML] = lerp(P[UARML], -1.75, fl * fw); P[UARML + 2] = lerp(P[UARML + 2], 1.0, fl * fw); P[FARML] = lerp(P[FARML], -0.35, fl * fw);
      P[HANDPL] = lerp(P[HANDPL], 2, fl); P[EARS] += 1.0 * fl; P[SPINE] -= 0.08 * fl; P[CHEST] -= 0.05 * fl; P[HLP] -= 0.12 * fl;
      P[ANC + 1] += 0.04 * fl * na; P[ANCR] -= 0.3 * fl * na;
      P[MCURVE] += 0.5 * fl; P[MOPEN] = Math.max(P[MOPEN], 0.35 * fl); P[BROWY] += 0.6 * fl;
    }
  }

  // Slosher heave (trigger 'slosh' at the start of the windup; the ink leaves at +0.13 s): dip the bucket back and low,
  // a big upward-forward heave that turns the open top to the target over the lip, follow-through, settle by ~0.6 s.
  // The support hand lets go of the carry bar for the throw and swings back for balance.
  _poseSlosh(P, st) {
    const X = this.PX; X.set(P);
    const dx = kc(st, K_SL_T, K_SL_X), dy = kc(st, K_SL_T, K_SL_Y), dz = kc(st, K_SL_T, K_SL_Z);
    const rp = kc(st, K_SL_T, K_SL_P), ry = kc(st, K_SL_T, K_SL_W);
    X[ANC] += dx; X[ANC + 1] += dy; X[ANC + 2] += dz; X[ANCR] += rp; X[ANCR + 1] += ry;
    X[AFOLR] = Math.max(X[AFOLR], 0.35);
    const wu = win(st, 0, 0.1, 0.12, 0.2);          // windup
    const hv = win(st, 0.12, 0.2, 0.3, 0.46);       // heave + follow-through
    X[HIPS_P + 1] += -0.045 * wu + 0.022 * hv; X[HIPS_P + 2] += -0.02 * wu + 0.025 * hv;
    X[SPINE] += 0.14 * wu - 0.13 * hv; X[CHEST] += 0.06 * wu - 0.1 * hv; X[HIPS] += 0.06 * wu;
    X[SPINE + 1] += 0.12 * wu - 0.1 * hv; X[CHEST + 1] += 0.22 * wu - 0.18 * hv;
    X[HLP] += -0.08 * wu + 0.1 * hv; X[TIPTOE] = Math.max(X[TIPTOE], 0.85 * hv);
    X[KNEEL] += 0.1 * wu; X[KNEER] -= 0.1 * wu;
    // support hand: off the carry bar, swung back for balance, back on by the settle
    const rel = win(st, 0.06, 0.13, 0.36, 0.56);
    X[IKL] *= 1 - rel;
    X[UARML] = lerp(X[UARML], 0.15 + 0.75 * hv - 0.2 * wu, rel); X[UARML + 2] = lerp(X[UARML + 2], 0.25 + 0.2 * hv, rel);
    X[FARML] = lerp(X[FARML], -0.5 - 0.3 * hv, rel); X[HANDPL] = lerp(X[HANDPL], 1.6, rel);
    X[SQY] *= 1 - 0.03 * wu + 0.045 * hv; X[SQXZ] *= 1 + 0.015 * wu - 0.02 * hv;
    X[EARS] += 0.5 * hv - 0.3 * wu;
    this._effort = Math.max(this._effort || 0, 0.6 * wu + hv);
    if (st >= 0.12 && st - this._dt < 0.12) { this.sp[S_TANKL + 1] += 2.2; this._hairKick(0, 2.4, 1.6); this.sp[S_PELY + 1] += 0.35; }
    poseLerp(P, P, X, win(st, 0, 0.015, 0.5, 0.66));
  }

  // Dualies dodge roll (trigger 'dodge' { x, z, t }; root motion comes from the engine): squash → tucked roll over the
  // shoulder along the roll direction, pistols hugged to the chest → unfurl with the feet landing wide, straight into
  // the lock stance. The tumble itself is a kid-group rotation (this.tumble about this.tumbleX/Z) applied in _applyPose.
  _poseDodge(P, tt) {
    const X = this.PX; X.set(P);
    const D = this.dodgeDur, u = clamp(tt / D, 0, 1);
    const tuck = win(u, 0, 0.1, 0.62, 0.96), out = sstep(0.6, 1, u);
    X[WPL] = lerp(X[WPL], 0, tuck); X[WPR] = lerp(X[WPR], 0, tuck);
    lerpE(X, FOOTL, 0.1, 0.38, 0.12, tuck); lerpE(X, FOOTLR, 1.15, 0.25, 0, tuck);
    lerpE(X, FOOTR, -0.1, 0.35, 0.08, tuck); lerpE(X, FOOTRR, 1.25, -0.25, 0, tuck);
    lerpE(X, FOOTL, STANCE_LOCK[0], ANKLE_H, STANCE_LOCK[1], out * (1 - tuck)); lerpE(X, FOOTR, STANCE_LOCK[3], ANKLE_H, STANCE_LOCK[4], out * (1 - tuck));
    X[FOOTLR + 1] = lerp(X[FOOTLR + 1], STANCE_LOCK[2], out); X[FOOTRR + 1] = lerp(X[FOOTRR + 1], STANCE_LOCK[5], out);
    X[KNEEL] += 0.25 * tuck; X[KNEER] -= 0.25 * tuck;
    X[HIPS_P + 1] -= 0.05 * tuck + 0.05 * out * (1 - tuck);
    X[SPINE] += 0.6 * tuck; X[CHEST] += 0.35 * tuck; X[NECK] += 0.25 * tuck; X[HLP] += 0.4 * tuck; X[STAB] *= 1 - 0.85 * tuck;
    // pistols hugged to the chest through the roll (both fists), then snapped forward into the lock
    lerpE(X, ANC, -0.09, 0.93, 0.17, tuck); lerpE(X, ANCR, -0.5, 0.35, 0.4, tuck);
    lerpE(X, ANL, 0.09, 0.93, 0.17, tuck); lerpE(X, ANLR, -0.5, -0.35, -0.4, tuck);
    X[AFOLT] = lerp(X[AFOLT], 1, tuck); X[AFOLR] = lerp(X[AFOLR], 1, tuck);
    lerpE(X, POLER, -0.9, -0.2, -0.3, tuck); lerpE(X, POLEL, 0.9, -0.2, -0.3, tuck);
    X[SQY] *= 1 - 0.07 * tuck + 0.05 * out * (1 - out); X[SQXZ] *= 1 + 0.035 * tuck;
    X[EARS] -= 0.7 * tuck; X[SQUINT] += 0.7 * tuck; X[MCURVE] -= 0.5 * tuck; X[BROW] -= 0.3 * tuck;
    this._effort = Math.max(this._effort || 0, tuck);
    // one full turn about (up × dir): fast out of the push-off, easing into the landing
    this.tumble = u < 1 ? TAU * (1 - Math.pow(1 - u, 2.4)) : 0;
    this.tumbleX = this.dodgeZ; this.tumbleZ = -this.dodgeX;
    this.tumbleDrop = 0.26 * tuck;
    poseLerp(P, P, X, win(tt, 0, 0.015, D, D + 0.28));
  }

  // Bomb / storm throw with the free (left) arm: cocked → whip → follow-through (the projectile leaves at t≈0).
  _poseThrow(P, tt) {
    const X = this.PX; X.set(P);
    const w = win(tt, 0, 0.03, 0.4, 0.62);
    const cock = 1 - ease(tt / 0.06), whip = ease(tt / 0.1) * (1 - ease((tt - 0.1) / 0.16)), fol = ease((tt - 0.08) / 0.14);
    X[IKL] = 0; X[LTW] = 0;
    X[UARML] = -2.6 * cock + -1.35 * whip + -0.55 * fol * (1 - whip); X[UARML + 2] = 0.45 * cock + 0.1 * whip - 0.1 * fol;
    X[FARML] = -1.9 * cock - 0.3 * whip - 0.4 * fol; X[HANDL] = 0.4 * whip;
    X[CLAVL + 2] += 0.16 * cock; X[CLAVL + 1] += -0.1 * cock + 0.12 * whip;
    X[CHEST + 1] += 0.4 * cock - 0.42 * whip - 0.18 * fol; X[SPINE + 1] += 0.16 * cock - 0.18 * whip;
    X[SPINE] += -0.1 * cock + 0.22 * whip + 0.08 * fol; X[CHEST] += 0.1 * whip;
    X[HIPS_P + 2] += 0.03 * whip; X[HIPS_P + 1] -= 0.025 * whip;
    X[HANDPL] = lerp(1.95, 1.05, ease((tt - 0.12) / 0.35));
    this._effort = Math.max(this._effort || 0, whip);
    poseLerp(P, P, X, w);
  }

  // Holding the splat bomb up behind the head (free arm cocked, chest turned), ready to throw.
  _poseSubAim(P, w) {
    const X = this.PX; X.set(P);
    X[IKL] = 0; X[LTW] = 0;
    X[UARML] = -2.55; X[UARML + 2] = 0.48; X[FARML] = -1.85; X[HANDL] = 0.2;
    X[CLAVL + 2] += 0.15; X[CLAVL + 1] -= 0.08;
    X[CHEST + 1] += 0.34; X[SPINE + 1] += 0.12; X[SPINE] -= 0.06;
    X[HLY] -= 0.25; X[HANDPL] = 0;
    this._effort = Math.max(this._effort || 0, 0.35 * w);
    poseLerp(P, P, X, w);
  }

  // Respawn drop: superhero dive → three-point landing → pop up.
  _poseSpawn(P, st) {
    const X = this.PX; X.set(P);
    const landed = this.tr[T_LAND] < st; // landed during this spawn
    const lt = landed ? this.tr[T_LAND] : -1;
    if (!landed) {
      // falling: legs together pointed down, arms up/out, looking down at the pad
      const k = ease(st / 0.12);
      setE(X, FOOTL, 0.07, 0.07, -0.02); setE(X, FOOTLR, 0.9, 0.05, 0); setE(X, FOOTR, -0.07, 0.09, -0.06); setE(X, FOOTRR, 1.0, -0.05, 0);
      X[WPL] = 0; X[WPR] = 0;
      X[UARML] = -2.3; X[UARML + 2] = 0.55; X[FARML] = -0.2;
      X[SPINE] -= 0.08; X[HLP] -= 0.2; X[HANDPL] = 1.7; X[EARS] += 0.8;
      X[SQY] *= 1.1; X[SQXZ] *= 0.95;
      poseLerp(P, P, X, k);
      return;
    }
    // landed: three-point crouch (left hand to the ground), hold, then pop up with a flourish
    const crouch = win(lt, 0, 0.05, 0.3, 0.55);
    const pop = win(lt, 0.3, 0.42, 0.5, 0.8);
    X[HIPS_P + 1] -= 0.24 * crouch; X[HIPS_P + 2] -= 0.02 * crouch;
    X[SPINE] += 0.42 * crouch; X[CHEST] += 0.18 * crouch; X[HLP] += 0.25 * crouch; X[NECK] -= 0.2 * crouch;
    X[LTW] = crouch; setE(X, LTGT, 0.2, 0.08, 0.2); X[IKL] *= 1 - crouch;
    lerpE(X, POLEL, 1, 0.2, 0, crouch);
    X[KNEEL] += 0.25 * crouch; X[KNEER] -= 0.25 * crouch;
    X[UARMR] -= 0.4 * crouch;
    // pop: stretch up, arms flung out, then settle
    X[SQY] *= 1 + 0.08 * pop; X[SQXZ] *= 1 - 0.04 * pop;
    X[UARML] = lerp(X[UARML], -1.2, pop); X[UARML + 2] = lerp(X[UARML + 2], 1.2, pop); X[FARML] = lerp(X[FARML], -0.3, pop);
    X[SPINE] -= 0.08 * pop; X[HLP] += 0.08 * pop;
    X[HANDPL] = lerp(X[HANDPL], 2, crouch); X[HANDPL] = lerp(X[HANDPL], 1.8, pop); X[EARS] += 0.9 * pop - 0.4 * crouch;
    const w = 1 - ease((lt - 0.75) / 0.3);
    poseLerp(P, P, X, w);
  }

  // Tidal Slam: crouch → launch stretch → forward somersault → overhead hang (engine: rise 0.55 s, hang 0.25 s).
  _poseLeap(P, lt) {
    const X = this.PX; X.set(P);
    const launch = win(lt, 0, 0.04, 0.12, 0.24);
    const tuck = win(lt, 0.12, 0.26, 0.42, 0.56);
    const hang = win(lt, 0.44, 0.58, 1.6, 1.9);
    X[WPL] = 0; X[WPR] = 0;
    // legs
    lerpE(X, FOOTL, 0.08, 0.08, -0.05, launch); lerpE(X, FOOTLR, 1.0, 0.1, 0, launch);
    lerpE(X, FOOTR, -0.08, 0.1, -0.1, launch); lerpE(X, FOOTRR, 1.1, -0.1, 0, launch);
    lerpE(X, FOOTL, 0.1, 0.4, 0.14, tuck); lerpE(X, FOOTLR, 0.7, 0.1, 0, tuck);
    lerpE(X, FOOTR, -0.1, 0.36, 0.1, tuck); lerpE(X, FOOTRR, 0.8, -0.1, 0, tuck);
    lerpE(X, FOOTL, 0.12, 0.3, 0.1, hang); lerpE(X, FOOTLR, 0.4, 0.15, 0, hang);
    lerpE(X, FOOTR, -0.12, 0.2, -0.12, hang); lerpE(X, FOOTRR, 0.9, -0.15, 0, hang);
    X[HIPS_P + 1] = -0.03 * tuck;
    // body
    X[SPINE] += -0.14 * launch + 0.5 * tuck - 0.22 * hang; X[CHEST] += -0.08 * launch + 0.25 * tuck - 0.16 * hang;
    X[HLP] += 0.2 * launch - 0.1 * tuck - 0.35 * hang; X[NECK] += 0.12 * hang;
    X[SQY] *= 1 + 0.12 * launch; X[SQXZ] *= 1 - 0.06 * launch;
    // one forward somersault through the tuck
    const flip = ease((lt - 0.14) / 0.36);
    X[MODELR] += lt > 0.14 ? wrapA(flip * TAU) : 0;
    // weapon: thrust up on launch, tucked to the chest, raised overhead two-handed for the hang
    const up = Math.max(launch, hang);
    lerpE(X, ANC, -0.06, 1.34, 0.06, up); lerpE(X, ANCR, -1.85, 0.05, 0, up);
    lerpE(X, ANC, -0.1, 0.86, 0.2, tuck); lerpE(X, ANCR, -0.6, 0.1, 0, tuck);
    X[AFOLT] = 1; X[AFOLR] = 0.5 + 0.5 * tuck;
    X[IKL] = lerp(X[IKL], 1, Math.max(hang, tuck)); X[IKL] = lerp(X[IKL], 0, launch);
    X[UARML] = lerp(X[UARML], -2.7, launch); X[UARML + 2] = lerp(X[UARML + 2], 0.25, launch);
    lerpE(X, POLER, -0.9, 0.3, -0.2, up); lerpE(X, POLEL, 0.9, 0.3, -0.2, up);
    X[STAB] = 0.3; X[HANDPL] = lerp(X[HANDPL], -1, launch); X[EARS] += 0.8 * (launch + hang);
    this._effort = Math.max(this._effort || 0, launch + hang);
    let w = win(lt, 0, 0.04, 1.55, 1.9);
    if (this.leapEnd >= 0) w *= 1 - ease((lt - this.leapEnd) / 0.1); // the slam takes over smoothly
    poseLerp(P, P, X, w);
  }

  // Slam: whip the weapon down while diving, then a crouched impact with the weapon smashed into the ground.
  _poseSlam(P, st) {
    const X = this.PX; X.set(P);
    if (!this.slamGround && this.grounded && st > 0.02) { this.slamGround = true; this.tr[T_IMPACT] = 0; this.sp[S_SQ + 1] -= 3.2; this.sp[S_PELY + 1] -= 0.8; this._hairKick(0, -3, 0); }
    const it = this.slamGround ? this.tr[T_IMPACT] : -1;
    const dive = this.slamGround ? 0 : ease(st / 0.07);
    const imp = it >= 0 ? win(it, 0, 0.02, 0.35, 0.8) : 0;
    X[WPL] = 0; X[WPR] = 0;
    // diving: legs extended down, weapon whipped from overhead to the front
    lerpE(X, FOOTL, 0.1, 0.1, 0.06, dive); lerpE(X, FOOTLR, 0.5, 0.1, 0, dive);
    lerpE(X, FOOTR, -0.1, 0.12, -0.08, dive); lerpE(X, FOOTRR, 0.7, -0.1, 0, dive);
    lerpE(X, ANC, -0.06, 1.3, 0.12, dive * (1 - ease(st / 0.12))); lerpE(X, ANCR, -1.9, 0.05, 0, dive * (1 - ease(st / 0.12)));
    lerpE(X, ANC, -0.05, 0.62, 0.36, ease((st - 0.04) / 0.1) * (1 - imp)); lerpE(X, ANCR, 0.9, 0.05, 0, ease((st - 0.04) / 0.1) * (1 - imp));
    X[SPINE] += 0.3 * dive; X[CHEST] += 0.15 * dive;
    // impact: wide low crouch, weapon planted in front, head down
    lerpE(X, FOOTL, 0.2, ANKLE_H, 0.06, imp); lerpE(X, FOOTLR, 0, 0.35, 0, imp);
    lerpE(X, FOOTR, -0.2, ANKLE_H, -0.1, imp); lerpE(X, FOOTRR, 0, -0.5, 0, imp);
    X[HIPS_P + 1] -= 0.25 * imp; X[SPINE] += 0.45 * imp; X[CHEST] += 0.25 * imp; X[HLP] += 0.2 * imp;
    lerpE(X, ANC, -0.05, this.animKind === 'roller' ? 0.5 : 0.36, 0.4, imp); lerpE(X, ANCR, this.animKind === 'roller' ? 1.2 : 1.35, 0.05, 0, imp);
    X[KNEEL] += 0.3 * imp; X[KNEER] -= 0.3 * imp;
    X[IKL] = 1; X[AFOLT] = 1; X[AFOLR] = 0.6; X[EARS] -= 0.6 * dive; X[HANDPL] = -1;
    lerpE(X, POLER, -0.9, -0.2, -0.3, imp); lerpE(X, POLEL, 0.9, -0.2, -0.3, imp);
    this._effort = Math.max(this._effort || 0, dive + imp);
    const w = win(st, 0, 0.03, 1.0, 1.4);
    poseLerp(P, P, X, w);
  }

  // ---- Sponge Mitts (the mechanics live in kits/mitts.js; this is only its body motion) -------------------------------
  // Reads the runner's kit state (charging / charge, leaping, landT, cling + clingN / clingPt in world space).
  //  · punches: each glove thrusts out along the aim and snaps back (right = tr[T_SHOOT], left = tr[T_SHOOTL]),
  //    knuckles turning in, chest and shoulder driving it
  //  · leap charge: a coiled crouch, gloves drawn back low by the hips, trembling at full charge
  //  · leap: pitched into the flight with both gloves thrown forward on the way up, raised overhead to hammer down on
  //    the way down; landing: a crouched double-glove smash into the ground
  //  · wall cling: the left glove stuck flat on the wall beside the shoulder, feet against the wall with the knees up,
  //    the body hugging in; the right glove keeps its guard and punches
  _poseMitts(P, dt, s) {
    const R = this._runner(s), K = R && R.kit && R.kit.mitts ? R.kit : null, tr = this.tr, t = this.t;
    const kid = this.kidForm && !this.dance;
    // ---- punches
    const eR = kid ? mitPunch(tr[T_SHOOT]) : 0, eL = kid ? mitPunch(tr[T_SHOOTL]) : 0;
    if (eR + eL > 0.001) {
      const ap = clamp(this.aimP || 0, -0.8, 1.0), fy = Math.sin(ap) * 0.24, fz = Math.cos(ap) * 0.24;
      P[ANC] += 0.07 * eR; P[ANC + 1] += fy * eR; P[ANC + 2] += fz * eR;
      P[ANL] -= 0.07 * eL; P[ANL + 1] += fy * eL; P[ANL + 2] += fz * eL;
      P[ANCR + 1] += 0.22 * eR; P[ANCR + 2] -= 0.45 * eR;
      P[ANLR + 1] -= 0.22 * eL; P[ANLR + 2] += 0.45 * eL;
      const tw = eR - eL;
      P[CHEST + 1] += 0.3 * tw; P[SPINE + 1] += 0.12 * tw; P[HIPS + 1] += 0.05 * tw;
      P[CLAVR + 1] += 0.22 * eR; P[CLAVL + 1] -= 0.22 * eL;
      P[SPINE] += 0.035 * (eR + eL);
      this._effort = Math.max(this._effort || 0, 0.45 * Math.max(eR, eL));
    }
    // ---- leap charge: coiled crouch
    const chOn = kid && !!K && K.charging;
    const chW = this.mitCh = damp(this.mitCh || 0, chOn ? 1 : 0, chOn ? 14 : 9, dt);
    if (chW > 0.001) {
      const c = chOn ? K.charge : 0;
      const tb = c >= 0.999 ? 0.004 * Math.sin(t * 71) + 0.003 * Math.sin(t * 53 + 1) : 0.0015 * Math.sin(t * 40) * c;
      P[HIPS_P + 1] -= (0.13 + 0.07 * c) * chW; P[HIPS_P + 2] -= 0.04 * chW;
      P[HIPS] += 0.3 * chW; P[SPINE] += 0.28 * chW; P[CHEST] += 0.1 * chW; P[NECK] -= 0.2 * chW; P[HLP] -= 0.1 * chW;
      P[KNEEL] += 0.24 * chW; P[KNEER] -= 0.24 * chW;
      lerpE(P, ANC, -0.2, 0.56 + tb, -0.08, chW); lerpE(P, ANCR, 1.5, 0.35, 0.3, chW);
      lerpE(P, ANL, 0.2, 0.56 - tb, -0.08, chW); lerpE(P, ANLR, 1.5, -0.35, -0.3, chW);
      lerpE(P, POLER, -0.9, 0.2, -0.7, chW); lerpE(P, POLEL, 0.9, 0.2, -0.7, chW);
      P[SQY] *= 1 - (0.03 + 0.05 * c) * chW; P[SQXZ] *= 1 + 0.03 * chW;
      P[EARS] -= 0.6 * chW;
      addExpr(P, X_EFFORT, (0.3 + 0.6 * c) * chW);
      this._effort = Math.max(this._effort || 0, (0.4 + 0.5 * c) * chW);
    }
    // ---- leap: superman on the way up, gloves raised to hammer down on the way down
    const lpOn = kid && !!K && K.leaping;
    const lpW = this.mitLp = damp(this.mitLp || 0, lpOn ? 1 : 0, lpOn ? 18 : 8, dt);
    if (lpW > 0.001) {
      const rise = sstep(-3, 4, this.vyS), wr = rise * lpW, wf = (1 - rise) * lpW;
      P[MODELR] += 0.5 * wr + 0.12 * wf;
      P[SQY] *= 1 + 0.07 * wr; P[SQXZ] *= 1 - 0.035 * wr;
      lerpE(P, ANC, -0.09, 1.26, 0.32, wr); lerpE(P, ANCR, -0.95, 0.12, -0.15, wr);
      lerpE(P, ANL, 0.09, 1.26, 0.32, wr); lerpE(P, ANLR, -0.95, -0.12, 0.15, wr);
      lerpE(P, ANC, -0.11, 1.36, 0.1, wf); lerpE(P, ANCR, -1.7, 0.2, 0, wf);
      lerpE(P, ANL, 0.11, 1.36, 0.1, wf); lerpE(P, ANLR, -1.7, -0.2, 0, wf);
      P[AFOLT] = lerp(P[AFOLT], 1, lpW); P[AFOLR] = lerp(P[AFOLR], 0.7, lpW);
      lerpE(P, POLER, -0.8, 0.3, -0.3, lpW); lerpE(P, POLEL, 0.8, 0.3, -0.3, lpW);
      lerpE(P, FOOTL, 0.09, 0.2, -0.26, wr); lerpE(P, FOOTLR, 1.2, 0.1, 0, wr);
      lerpE(P, FOOTR, -0.09, 0.26, -0.2, wr); lerpE(P, FOOTRR, 1.0, -0.1, 0, wr);
      lerpE(P, FOOTL, 0.11, 0.34, 0.1, wf); lerpE(P, FOOTLR, 0.5, 0.12, 0, wf);
      lerpE(P, FOOTR, -0.11, 0.3, 0.04, wf); lerpE(P, FOOTRR, 0.6, -0.12, 0, wf);
      P[WPL] *= 1 - lpW; P[WPR] *= 1 - lpW;
      P[EARS] += 0.9 * lpW;
      addExpr(P, X_DETERM, 0.8 * lpW); P[MOPEN] = Math.max(P[MOPEN], 0.3 * wf);
      this._effort = Math.max(this._effort || 0, 0.6 * lpW);
    }
    // ---- landing: crouched double-glove smash
    const smW = K && kid ? win(K.landT, 0, 0.03, 0.16, 0.5) : 0;
    if (smW > 0.001) {
      P[HIPS_P + 1] -= 0.2 * smW; P[HIPS_P + 2] -= 0.02 * smW;
      P[HIPS] += 0.2 * smW; P[SPINE] += 0.4 * smW; P[CHEST] += 0.2 * smW; P[HLP] += 0.2 * smW;
      P[KNEEL] += 0.3 * smW; P[KNEER] -= 0.3 * smW;
      lerpE(P, ANC, -0.13, 0.3, 0.34, smW); lerpE(P, ANCR, 1.35, 0.2, 0, smW);
      lerpE(P, ANL, 0.13, 0.3, 0.34, smW); lerpE(P, ANLR, 1.35, -0.2, 0, smW);
      P[AFOLT] = lerp(P[AFOLT], 1, smW); P[AFOLR] = lerp(P[AFOLR], 0.6, smW);
      lerpE(P, POLER, -0.9, -0.2, -0.3, smW); lerpE(P, POLEL, 0.9, -0.2, -0.3, smW);
      P[EARS] -= 0.6 * smW; addExpr(P, X_EFFORT, 0.7 * smW);
      this._effort = Math.max(this._effort || 0, smW);
    }
    // ---- wall cling (wall plane + contact point taken into kid space; the body hugs 10 cm in toward the wall)
    const clOn = kid && !!K && K.cling;
    const clW = this.mitCl = damp(this.mitCl || 0, clOn ? 1 : 0, clOn ? 20 : 9, dt);
    if (clW > 0.001 && K && K.clingN && K.clingPt) {
      const c = Math.cos(this.yaw), sn = Math.sin(this.yaw), rp = this.root.position, n = K.clingN;
      const nx = n.x * c - n.z * sn, nz = n.x * sn + n.z * c, hug = 0.1 * clW;
      P[MODEL] -= nx * hug; P[MODEL + 2] -= nz * hug;
      const px = K.clingPt.x - rp.x, pz = K.clingPt.z - rp.z;
      const wd = (px * c - pz * sn + nx * hug) * nx + (px * sn + pz * c + nz * hug) * nz;   // wall plane: p·n = wd
      const o = this._mitO || (this._mitO = [0, 0]);
      mitOnWall(0.21, 0.02, 0.085, nx, nz, wd, o);
      lerpE(P, ANL, o[0], 1.12, o[1], clW); lerpE(P, ANLR, -0.25, Math.atan2(-nx, -nz), 0, clW);
      P[AFOLT] *= 1 - clW; P[AFOLR] *= 1 - clW;
      lerpE(P, POLEL, 0.9, 0.2, -0.2, clW);
      mitOnWall(0.1, 0.02, 0.11, nx, nz, wd, o); lerpE(P, FOOTL, o[0], 0.36, o[1], clW); lerpE(P, FOOTLR, 0.35, 0.15, 0, clW);
      mitOnWall(-0.1, 0, 0.11, nx, nz, wd, o); lerpE(P, FOOTR, o[0], 0.27, o[1], clW); lerpE(P, FOOTRR, 0.45, -0.15, 0, clW);
      P[WPL] *= 1 - clW; P[WPR] *= 1 - clW;
      P[KNEEL] += 0.12 * clW; P[KNEER] -= 0.12 * clW;
      P[HIPS_P + 1] -= 0.02 * clW; P[SPINE] += 0.06 * clW;
      P[EARS] += 0.3 * clW;
      addExpr(P, X_DETERM, 0.5 * clW);
    }
  }

  // Idle fidgets (hand-keyed-style one-offs while standing around).
  _poseFidget(P, id, ft) {
    const X = this.PX; X.set(P);
    const L = FIDGET_LEN[id];
    const w = win(ft, 0, 0.22, L - 0.28, L);
    const kind = this.animKind;
    switch (FIDGETS[id]) {
      case 'goggles': { // push the goggles up the nose, adjust twice
        const a = kf(ft, K_GOG_T, K_GOG_V);
        const jig = Math.sin(Math.max(0, ft - 0.4) * 22) * win(ft, 0.4, 0.5, 0.85, 0.95);
        X[LTW] = a; setE(X, LTGT, 0.075, 1.18 + 0.008 * jig, 0.2); X[IKL] *= 1 - a;
        lerpE(X, POLEL, 0.9, -0.6, -0.3, a);
        X[HLP] += 0.08 * a; X[HEAD + 2] += 0.08 * a; X[SQUINT] += 0.5 * a; X[MCURVE] -= 0.3 * a;
        X[HANDPL] = lerp(X[HANDPL], 0.3, a);
        break;
      }
      case 'twirl': {
        if (kind === 'shooter' || kind === 'blaster' || kind === 'dualies') {
          const k = ease((ft - 0.2) / 0.6), lift = win(ft, 0.1, 0.3, 0.75, 1.0);
          X[SPIN] = wrapA(TAU * 2 * k); if (!this.dual) X[IKL] = 0;
          X[ANC + 1] += 0.08 * lift; X[ANC + 2] += 0.08 * lift; X[ANC] -= 0.03 * lift; X[ANCR] -= 0.7 * lift;
          X[HLY] -= 0.15 * lift; X[HLP] -= 0.1 * lift; X[MCURVE] += 0.3 * lift; X[MTILT] += 0.15 * lift;
        } else if (kind === 'slosher') { // lift the bucket, peer in, give it a swirl
          const k = win(ft, 0.1, 0.35, 0.8, 1.15), sw = Math.sin((ft - 0.35) * 14) * win(ft, 0.35, 0.45, 0.7, 0.8);
          lerpE(X, ANC, -0.1, 0.8, 0.24, k); lerpE(X, ANCR, 0.25, 0.25 + 0.25 * sw, 0.12 * sw, k);
          X[HLP] += 0.28 * k; X[HLY] -= 0.1 * k; X[SPINE] += 0.05 * k; X[LOOKY] -= 0.2 * k; X[MCURVE] += 0.25 * k; X[BROWY] += 0.4 * k;
        } else if (kind === 'splatling') { // heft it up, bounce to re-seat the grip
          const k = win(ft, 0.1, 0.3, 0.75, 1.1), b = Math.max(0, Math.sin((ft - 0.3) * 17)) * win(ft, 0.3, 0.35, 0.6, 0.7);
          X[ANC + 1] += 0.07 * k + 0.02 * b; X[ANCR] -= 0.35 * k; X[HIPS_P + 1] -= 0.02 * b; X[SPINE] -= 0.06 * k;
          X[HLP] -= 0.08 * k; X[MCURVE] += 0.3 * k; X[MTILT] -= 0.15 * k;
        } else if (kind === 'charger') { // raise and peek through the scope
          const k = win(ft, 0.1, 0.4, 0.85, 1.15);
          lerpE(X, ANC, -0.05, 1.1, 0.1, k); lerpE(X, ANCR, -0.05, 0.06, 0, k); X[IKL] = 1;
          X[HEAD + 2] -= 0.15 * k; X[SQUINT] += 0.6 * k; X[HLY] -= 0.08 * k;
        } else { // roller: hitch the handle up onto the shoulder and back down
          const k = win(ft, 0.1, 0.35, 0.8, 1.15);
          lerpE(X, ANC, -0.14, 1.06, 0.02, k); lerpE(X, ANCR, -2.3, 0.3, 0.15, k); X[IKL] = lerp(X[IKL], 0, k);
          X[HIPS_P + 1] -= 0.03 * win(ft, 0.3, 0.4, 0.45, 0.6);
        }
        break;
      }
      case 'look': { // glance over each shoulder
        const y = kc(ft, K_LOOK_T, K_LOOK_V);
        X[HLY] += y; X[SPINE + 1] += y * 0.18; X[CHEST + 1] += y * 0.22; X[LOOKX] += y * 0.25;
        X[HLP] += 0.06 * Math.abs(y);
        break;
      }
      case 'stretch': { // arms up, lean back, yawn
        const k = win(ft, 0.1, 0.55, 1.2, 1.7);
        X[UARML] = lerp(X[UARML], -2.85, k); X[UARML + 2] = lerp(X[UARML + 2], 0.25, k); X[FARML] = lerp(X[FARML], -0.15, k); X[IKL] *= 1 - k;
        lerpE(X, ANC, -0.12, 1.25, -0.02, k * 0.8); lerpE(X, ANCR, -2.6, 0.2, 0.2, k * 0.8);
        X[SPINE] -= 0.14 * k; X[CHEST] -= 0.12 * k; X[HLP] += 0.22 * k; X[HIPS_P + 2] += 0.02 * k;
        X[MOPEN] = Math.max(X[MOPEN], 0.85 * win(ft, 0.35, 0.6, 1.05, 1.3)); X[MCURVE] -= 0.7 * k; X[EYE] -= 0.85 * k; X[BROW] += 0.3 * k;
        X[SQY] *= 1 + 0.02 * k; X[HANDPL] = lerp(X[HANDPL], 2, k); X[EARS] -= 0.5 * k;
        break;
      }
      case 'tank': { // reach back and tap the ink tank twice
        const a = kf(ft, K_TANK_T, K_TANK_V);
        const tap = Math.max(0, Math.sin((ft - 0.35) * 18)) * win(ft, 0.35, 0.4, 0.8, 0.9);
        X[LTW] = a; setE(X, LTGT, 0.165, 0.83 + 0.012 * tap, -0.125 - 0.012 * tap); X[IKL] *= 1 - a;
        lerpE(X, POLEL, 0.7, -0.5, -0.5, a);
        X[CHEST + 1] += 0.2 * a; X[HLY] += 0.35 * a; X[HLP] -= 0.1 * a; X[LOOKX] += 0.3 * a; X[HANDPL] = lerp(X[HANDPL], 1.6, a);
        if (tap > 0.9 && !this._tapped) { this._tapped = true; this.sp[S_TANKX + 1] += 0.8; this.sp[S_TANKL + 1] += 1.2; } else if (tap < 0.2) this._tapped = false;
        break;
      }
      case 'bounce': { // bounce on the toes
        const b = Math.max(0, Math.sin((ft - 0.15) * TAU * 2.6)) * win(ft, 0.1, 0.2, 1.0, 1.2);
        X[HIPS_P + 1] += 0.035 * b - 0.02 * win(ft, 0.1, 0.2, 1.0, 1.2); this._toeUp = b;
        X[UARML + 2] += 0.12 * b; X[CLAVL + 2] += 0.05 * b; X[CLAVR + 2] -= 0.05 * b;
        X[MCURVE] += 0.2;
        break;
      }
      case 'shake': { // shake the ink off
        const k = win(ft, 0.05, 0.15, 0.7, 0.95);
        const s1 = Math.sin(ft * 42) * k;
        X[HIPS + 2] += 0.06 * s1; X[CHEST + 2] -= 0.1 * s1; X[HEAD + 2] += 0.14 * s1; X[HLY] += 0.2 * Math.sin(ft * 38 + 1) * k;
        X[UARML + 2] += 0.15 * k + 0.1 * s1; X[SQUINT] += 0.8 * k; X[MCURVE] -= 0.3 * k; X[HANDPL] = lerp(X[HANDPL], 1.85, k); X[EARS] += 0.6 * s1;
        if (k > 0.3 && Math.abs(s1) > 0.95) this._hairKick(s1 * 0.8, 0.3, 0);
        break;
      }
    }
    poseLerp(P, P, X, w);
  }

  // Attention (what the kid looks at) → a root-space gaze point for the eyes (_applyFace saccades to it) + head
  // yaw/pitch targets for the stabilised head (springs: the eyes lead, the head follows with a slight overshoot).
  // In a match: the aim / nearby actors (enemies first) / the attacker right after a hit / into turns and the travel
  // direction / idle glances. Out of one (showcase, locker, lobby, podium): see _attendMenu.
  _poseLook(dt, s) {
    const P = this.P, sp = this.sp, A = this.att;
    let ty = 0, tp = 0;
    if (!this.inWorld) {
      this._attendMenu(dt);
    } else {
      // pick something interesting to look at every so often (enemies > allies > travel direction > idle glances)
      this.lookT -= dt;
      if (this.lookT <= 0) {
        this.lookT = 0.9 + this.rng() * 2.2;
        this.lookActor = null;
        if (G.actors && G.actors.length) this._pickLook();
        this.glanceYaw = (this.rng() - 0.5) * (this.idleT > 1 ? 1.1 : 0.4);
        this.glancePitch = (this.rng() - 0.5) * 0.25;
      }
      let actorGaze = false;
      if (this.wAim > 0.5) { ty = 0; tp = this.aimP * 0.85; }
      else {
        const la = this.lookActor;
        if (la && la.alive && la.pos) {
          const R = this.root.position;
          const dx = la.pos.x - R.x, dz = la.pos.z - R.z, dy = (la.pos.y + (la.form === 'squid' ? 0.3 : 1.15)) - (R.y + 1.2);
          const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
          const kx = dx * c - dz * sn, kz = dx * sn + dz * c;
          ty = Math.atan2(kx, kz); tp = Math.atan2(dy, Math.hypot(kx, kz));
          if (Math.abs(ty) > 1.9) { ty = this.glanceYaw; tp = this.glancePitch; }
          else { A.p.set(kx, dy + 1.2, kz); actorGaze = true; }
        } else { ty = this.glanceYaw * (1 - this.gaitW * 0.7); tp = this.glancePitch; }
        // look into turns / along the travel direction when moving
        ty = lerp(ty, clamp(Math.atan2(this.mdx, Math.max(this.mdz, 0.2)) * 0.5, -0.6, 0.6), this.gaitW * 0.6);
        ty += clamp(this.yawRate * 0.1, -0.35, 0.35) * this.gaitW;
        tp = lerp(tp, this.aimP * 0.6, 0.5);
        if (this.gaitW > 0.5) actorGaze = false;
      }
      // hit: a flinching glance toward whoever it came from (eyes snap there, the head turns partway)
      const hg = this.tr[T_HIT] < 1.1 ? win(this.tr[T_HIT], 0.02, 0.08, 0.55, 1.1) * clamp(this.hitAmp, 0.5, 1) : 0;
      if (hg > 0.01) { ty = lerp(ty, clamp(Math.atan2(this.hitX, this.hitZ), -1.3, 1.3), 0.65 * hg); tp = lerp(tp, 0.05, hg); actorGaze = false; }
      ty = clamp(ty, -1.1, 1.1); tp = clamp(tp, -0.6, 0.55);
      // gaze point: the actor's head, else 8 m out along (ty, tp) from the head (root space)
      if (!actorGaze) { const cp = Math.cos(tp); A.p.set(Math.sin(ty) * cp * 8, 1.2 + Math.sin(tp) * 8, Math.cos(ty) * cp * 8); }
      A.on = true; A.kind = K_NONE;
    }
    // stabilised head: springs toward (ty, tp) — in menus the head is turned post-dance in _lifePost instead
    const hy = spr(sp, S_HLY, clamp(ty, -0.85, 0.85), 2.4, 0.62, dt);
    const hpp = spr(sp, S_HLP, clamp(tp, -0.5, 0.45), 2.6, 0.62, dt);
    P[HLY] += hy; P[HLP] += hpp;
    P[NECK + 1] += hy * 0.3; P[NECK] -= hpp * 0.2;
    // pose-driven eye direction (used when there is no gaze point, e.g. scripted dance looks)
    P[LOOKX] += clamp((ty - hy) * 0.9, -0.36, 0.36);
    P[LOOKY] += clamp((tp - hpp) * 0.8 + 0.02, -0.3, 0.3);
    // head reactions (hits / landings) ride on top of the stabilised look
    const hp = spr(sp, S_HEADP, 0, 3.2, 0.4, dt), hr = spr(sp, S_HEADR, 0, 3.2, 0.4, dt);
    P[HEAD] += hp * 0.5; P[HEAD + 2] += hr * 0.4; P[HLP] -= hp * 0.4;
    // turn / lean compensation: the head rolls less than the body (stabiliser), a little into the turn
    P[HEAD + 2] -= clamp(this.yawRate * this.gs * 0.006, -0.12, 0.12);
  }

  // Out of a match the kid mostly looks at the viewer (the camera it is drawn with), with glances at a neighbour (a
  // kid sharing its parent within 4 m: lobby line-up, podium) and idle glances away. Dances bias it (victory: the
  // viewer; defeat: mostly away). A glance applied by the showcase (it turns the head after our update) takes over.
  _attendMenu(dt) {
    const A = this.att;
    A.t -= dt;
    if (A.t <= 0) {
      const d = this.dance, r = this.rng();
      let viewer = d === 'defeat' ? 0.15 : d === 'victory' ? 0.85 : 0.6;
      if (!this._camOK) viewer = 0;
      const nb = this._neighbour();
      A.prev = A.kind;
      if (r < viewer) { A.kind = K_VIEWER; A.t = 2.2 + this.rng() * 3.2; }
      else if (nb && r < viewer + 0.24) { A.kind = K_NEIGHBOUR; A.who = nb; A.t = 0.9 + this.rng() * 1.7; }
      else { A.kind = K_GLANCE; A.gy = (this.rng() - 0.5) * 1.1; A.gp = d === 'defeat' ? -0.35 - this.rng() * 0.2 : -0.04 - this.rng() * 0.3; A.t = 0.6 + this.rng() * 1.1; }
      // eye contact: a little brow flash + warm smile now and then
      if (A.kind === K_VIEWER && A.prev !== K_VIEWER && d !== 'defeat') {
        if (this.rng() < 0.45) this._mxPlay(X_BROWFLASH, 0.6, 0.07, 0.12, 0.35);
        if (this.rng() < 0.5) this._mxPlay(X_SOFTSMILE, 0.8, 0.25, 1.2 + this.rng(), 0.8, 0, E_BLUSH);
      }
    }
    this.root.updateWorldMatrix(true, false);
    A.on = true;
    if (A.kind === K_VIEWER && this._camOK) { A.p.copy(this._camPos); this.root.worldToLocal(A.p); }
    else if (A.kind === K_NEIGHBOUR && A.who && A.who.visible && A.who.root.parent && A.who.kidForm) { A.who.getHeadPosition(A.p); this.root.worldToLocal(A.p); }
    else if (A.kind === K_GLANCE) { const cp = Math.cos(A.gp); A.p.set(Math.sin(A.gy) * cp * 4, 1.15 + Math.sin(A.gp) * 4, Math.cos(A.gy) * cp * 4); }
    else A.on = false;
    // the showcase is turning our head toward someone: the eyes lead that way instead
    if (Math.abs(this.extGl) > 0.06) A.on = false;
  }

  /** Nearest other visible kid sharing our parent (≤ 4 m) — the lobby line-up / podium neighbour to glance at. */
  _neighbour() {
    const par = this.root.parent; if (!par) return null;
    let best = null, bd = 16;
    for (const c of LIVE) {
      if (c === this || c.root.parent !== par || !c.visible || !c.root.visible) continue;
      const d = c.root.position.distanceToSquared(this.root.position);
      if (d < bd && d > 0.04) { bd = d; best = c; }
    }
    return best;
  }

  // Post-dance life layer (runs after every pose layer incl. dances, so menus get it too): micro-expression impulses +
  // idle flickers, the menu head turn toward the attention target, pupils.
  _lifePost(dt) {
    const P = this.P, sp = this.sp, A = this.att;
    if (this.lifeLv === 0) return;
    this._breathe(P);
    // ---- head follows the gaze partway out of a match (the eyes do the rest); a showcase glance owns the head
    let wy = 0, wp = 0;
    if (!this.inWorld && A.on && this.kidForm && this.tr[T_SPAWN] > 1.4) {
      const d = this.dance;
      const hw = (d === 'victory' ? 0.3 : d === 'defeat' ? 0.25 : d ? 0.55 : 0.75) * (1 - clamp(Math.abs(this.extGl) * 8, 0, 1)) * (1 - this.wAir);
      const curY = P[MODELR + 1] + P[HIPS + 1] + P[SPINE + 1] + P[CHEST + 1] + P[NECK + 1] + P[HEAD + 1] + P[HLY];
      const curP = P[HLP] - (P[NECK] + P[HEAD] + 0.5 * (P[CHEST] + P[SPINE]));
      const yT = Math.atan2(A.p.x, A.p.z), pT = Math.atan2(A.p.y - 1.2, Math.max(0.3, Math.hypot(A.p.x, A.p.z)));
      wy = clamp(wrapA(yT - curY), -0.85, 0.85) * hw; wp = clamp(pT - curP, -0.35, 0.35) * hw * 0.6;
    }
    const ay = spr(sp, S_ATTY, wy, 1.5, 0.78, dt), ap = spr(sp, S_ATTP, wp, 1.6, 0.8, dt);
    P[HLY] += ay; P[HLP] += ap; P[NECK + 1] += ay * 0.25;
    // ---- idle micro-expressions: a lip press, a half smile, one brow up, a "hmm" — never twice the same in a row
    const calm = this.kidForm && !this.moving && this.wAim < 0.2 && this.tr[T_HIT] > 1.5 && (!this.dance || this.dance === 'menu_idle' || this.dance === 'locker_idle' || this.dance === 'lobby_pose');
    this.mxT -= dt;
    if (this.mxT <= 0 && this.lifeLv < 2) this.mxT = 1 + this.rng() * 2;   // small on screen: no idle flickers
    else if (this.mxT <= 0) {
      this.mxT = (this.inWorld ? 4 : 2.6) + this.rng() * 4;
      if (calm) {
        let k = (this.rng() * 5) | 0; if (k === this._mxLast) k = (k + 1) % 5; this._mxLast = k;
        const sd = this.rng() < 0.5 ? 1 : -1, hold = 0.35 + this.rng() * 0.9;
        if (k === 0) this._mxPlay(X_LIPPRESS, 0.7, 0.14, hold, 0.4);
        else if (k === 1) this._mxPlay(X_SMIRK, 0.8 * sd, 0.18, hold, 0.5);
        else if (k === 2) this._mxPlay(X_BROWFLASH, 0.25, 0.2, hold, 0.5, 0.55 * sd);
        else if (k === 3) this._mxPlay(X_HMM, 0.7 * sd, 0.16, hold, 0.45, 0, E_HMM);
        else this._mxPlay(X_SOFTSMILE, 0.6, 0.3, hold + 0.6, 0.7);
      }
    }
    this._mxTick(P, dt);
    // ---- blush: warm flush after exertion, in victory, on locker compliments
    P[BLUSH] += 0.4 * this.exert + 0.2 * this.wTired + (this.dance === 'victory' ? 0.5 : 0) + 0.45 * Math.max(win(this.tr[T_ADMIRE], 0, 0.3, 1.2, 1.6), win(this.tr[T_WINK], 0, 0.1, 0.5, 0.8));
    // ---- pupils: wide when excited / meeting the viewer's eyes, narrower when focused on a target
    P[PUPIL] = clamp(P[PUPIL] + 0.22 * this.xw[8] + 0.2 * this.wGlow - 0.16 * this.wAim + (A.kind === K_VIEWER && !this.inWorld ? 0.12 : 0) + (this.dance === 'victory' ? 0.2 : 0), 0, 1);
  }

  // Breathing: inhale (~40 %) → exhale (~45 %) → a short pause; each breath a little different in depth and length; now
  // and then a deep sigh when idle. The rib cage lifts and opens (chest extends, shoulders ride up, arms float out a
  // hair), the head counters so it stays level. Rate + depth follow exertion / tiredness (brPh in _updateStates).
  _breathe(P) {
    const bu = frac(this.brPh), bn = Math.floor(this.brPh);
    if (bn !== this.brN) {
      this.brN = bn; this.brAmp = 0.8 + 0.4 * this.rng(); this.brRate = 0.88 + 0.24 * this.rng();
      if (this.sigh > 0) this.sigh = 0;
      else if (this.idleT > 3 || (!this.inWorld && this.wDance > 0.5 && this.dance !== 'victory')) { this.sighT -= 1; if (this.sighT <= 0) { this.sighT = 5 + this.rng() * 6; this.sigh = 1; } }
    }
    const bb = bu < 0.4 ? ease(bu / 0.4) : bu < 0.85 ? 1 - ease((bu - 0.4) / 0.45) : 0;   // 0 empty … 1 full
    const idleW = (1 - this.gaitW) * (1 - this.wAir);
    const brA = lerp(1, 2.3, Math.max(this.exert, this.wTired)) * this.brAmp * (this.sigh > 0 ? 2.3 : 1) * (this.kidForm ? 1 : 0);
    const br = (bb * 2 - 1) * brA;
    P[CHEST] -= 0.034 * br; P[SPINE] -= 0.012 * br;
    P[CLAVL + 2] += 0.032 * br; P[CLAVR + 2] -= 0.032 * br; P[CLAVL] -= 0.012 * br; P[CLAVR] -= 0.012 * br;
    P[UARML + 2] += 0.008 * br; P[UARMR + 2] -= 0.008 * br;
    P[HIPS_P + 1] -= 0.003 * br * idleW;
    P[HEAD] += 0.016 * br; P[NECK] += 0.004 * br;
    P[ANC + 1] += 0.003 * br * this.wDance;
    P[BREATH] = bb;
    if (this.sigh > 0 && bu > 0.4) {
      const k = win(bu, 0.4, 0.5, 0.75, 0.95);
      P[MOPEN] = Math.max(P[MOPEN], 0.2 * k); P[EYE] -= 0.25 * k; P[BROW] += 0.2 * k; P[MCURVE] -= 0.2 * k;
      P[CLAVL + 2] -= 0.03 * k; P[CLAVR + 2] += 0.03 * k;
    }
  }

  /** Start a micro-expression impulse: X = expression vector, w = weight (negative flips MTILT: the other side),
   *  a/h/d = attack/hold/decay (s), bras = brow asymmetry (+ left brow up). Reuses the weakest of 6 slots. */
  _mxPlay(X, w, a = 0.1, h = 0.2, d = 0.4, bras = 0, E = null) {
    let best = this.mx[0], bw = Infinity;
    for (const m of this.mx) { const r = m.t > m.a + m.h + m.d ? -1 : m.w * m.w; if (r < bw) { bw = r; best = m; } }
    best.X = X; best.w = w; best.t = 0; best.a = a; best.h = h; best.d = d; best.bras = bras; best.E = E;
  }
  _mxTick(P, dt) {
    for (const m of this.mx) {
      if (!m.X) continue;
      m.t += dt;
      const e = m.a + m.h + m.d;
      if (m.t >= e) { m.X = null; continue; }
      const k = m.t < m.a ? ease(m.t / m.a) : m.t < m.a + m.h ? 1 : 1 - ease((m.t - m.a - m.h) / m.d);
      const w = Math.abs(m.w) * k, sg = m.w < 0 ? -1 : 1;
      for (let i = 0; i < 8; i++) P[XCH[i]] += m.X[i] * w * (XCH[i] === MTILT ? sg : 1);
      P[BRAS] += m.bras * k;
      if (m.E) { P[SNEER] += m.E[0] * w; P[PUCKER] += m.E[1] * w; P[BLUSH] += m.E[2] * w; }   // [sneer, pucker, blush]
    }
  }

  /** The actor that owns this character (read-only: team, sub-weapon aim), found once per match. */
  _owner() {
    if (this.actor && this.actor.character === this) return this.actor;
    if (!this.inWorld || !G.actors) return null;
    if (this._ownT > this.t) return null;
    this._ownT = this.t + 1; this.actor = null;
    const acts = G.actors;
    for (let i = 0; i < acts.length; i++) if (acts[i].character === this) { this.actor = acts[i]; break; }
    return this.actor;
  }

  _pickLook() {
    const acts = G.actors;
    const me = this._owner();
    const R = this.root.position;
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    let best = null, bestS = 0;
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i];
      if (a === me || !a.alive || !a.pos) continue;
      const dx = a.pos.x - R.x, dz = a.pos.z - R.z, d = Math.hypot(dx, dz);
      if (d < 0.5 || d > 18) continue;
      const fz = (dx * sn + dz * c) / d;
      if (fz < -0.15) continue;
      const enemy = me ? a.team !== me.team : false;
      const sc = (enemy ? 2.2 : 1) * (0.6 + fz) / (1 + d * 0.25) * (0.7 + this.rng() * 0.6);
      if (sc > bestS) { bestS = sc; best = a; }
    }
    if (best && this.rng() < 0.85) this.lookActor = best;
  }

  // Blinks: one clock, two lids. A blink = fast accelerating close (≈75 ms), a short hold, a slower decelerating open
  // (≈150 ms); the right lid trails by a few ms; some are partial; ~14 % come as doubles. Spontaneous intervals are
  // skewed-random around a state mean (focus/aim/charging suppress, exertion/tiredness raise); saccades, hits and hard
  // landings trigger their own (_blinkStart).
  _blinkTick(dt) {
    const b = this.bl;
    b.next -= dt;
    // a big fast head / body turn (camera flick, snap turn) takes a blink with it, at most one per second
    this._turnBl = (this._turnBl || 0) - dt;
    if (Math.abs(this.yawRate) > 5.5 && this._turnBl <= 0 && b.t < 0 && this.kidForm) { this._turnBl = 1.1; if (this.rng() < 0.7) this._blinkStart(0.9 + 0.1 * this.rng(), false); }
    if (b.t < 0 && b.next <= 0) this._blinkStart(this.rng() < 0.18 ? 0.55 + this.rng() * 0.3 : 1, false);
    let L = 0, R = 0;
    if (b.t >= 0) {
      b.t += dt;
      L = blinkCurve(b, b.t - (b.lag < 0 ? -b.lag : 0)) * b.amp; R = blinkCurve(b, b.t - (b.lag > 0 ? b.lag : 0)) * b.amp;
      if (b.t > b.c + b.h + b.o + Math.abs(b.lag)) {
        b.t = -1; b.squeeze = 0;
        if (b.dbl) { b.dbl = false; b.next = 0.05 + this.rng() * 0.05; }
        else {
          // ≈ 12–15 blinks/min at rest incl. gaze-evoked ones (more reads nervous on big eyes), far fewer when focused
          let mean = this.inWorld ? 6.4 : 6.0;
          if (this.wAim > 0.5) mean = 7.5;
          if (this.weaponKind === 'charger' && this.charge > 0.3) mean = 11;
          mean = lerp(mean, 2.8, Math.max(this.exert, this.wTired));
          const r = this.rng();
          b.next = mean * (0.3 + 1.35 * Math.pow(r, 1.7));
        }
      }
    }
    this.blinkL = L; this.blinkR = R; this.blinkK = Math.max(L, R);
  }
  /** Start a blink now (amp 0..1; hard = a squeezed, held blink for hits). */
  _blinkStart(amp = 1, hard = false) {
    const b = this.bl;
    if (b.t >= 0 && b.t < b.c) return;    // already closing
    b.t = 0; b.amp = amp;
    b.c = 0.06 + this.rng() * 0.025; b.h = hard ? 0.08 + this.rng() * 0.06 : 0.008 + this.rng() * 0.03; b.o = 0.14 + this.rng() * 0.06 + (hard ? 0.05 : 0);
    b.lag = (this.rng() - 0.5) * 0.024; b.squeeze = hard ? 1 : 0;
    b.dbl = !hard && amp > 0.9 && this.rng() < 0.14;
    b.next = 99;
  }

  // Facial animation: expression mixing from state (gameplay), mouth breathing.
  _poseFace(dt, s) {
    const P = this.P, tr = this.tr;
    if (this.lifeLv === 0) { this._effort = 0; this.blinkL = this.blinkR = this.blinkK = 0; return; }
    this._blinkTick(dt);
    // expression weights (smoothed)
    const xw = this.xw;
    const eff = this._effort || 0; this._effort = 0;
    const hitK = tr[T_HIT] < 0.7 ? pulse(tr[T_HIT], 0.03, 4.5) * clamp(this.hitAmp, 0.5, 1.2) : 0;
    const firing = this.lastShot < 0.25 ? 1 : 0;
    const tgt0 = this.wAim * (1 - firing * 0.5) * (this.animKind === 'charger' ? 1 : 0.8);
    const tgt1 = firing * (this.animKind === 'shooter' ? 1 : 0.4);
    const tgt2 = Math.max(eff, this.animKind === 'charger' ? this.charge * this.wAim : 0);
    const tgt3 = hitK;
    const tgt4 = this.wLow * (1 - hitK);
    const tgt5 = this.wGlow * (1 - this.wLow) * 0.9;
    const tgt6 = tr[T_SPAWN] < 1.3 ? win(tr[T_SPAWN], 0, 0.05, 0.5, 0.9) : 0;
    const tgt7 = Math.max(this.wTired, this.wGoo * 0.7);
    const tgt8 = tr[T_SPAWN] < 1.6 ? win(tr[T_SPAWN], 0.75, 0.9, 1.2, 1.6) : 0;
    const rate = 12;
    xw[0] = damp(xw[0], tgt0, rate, dt); xw[1] = damp(xw[1], tgt1, rate, dt); xw[2] = damp(xw[2], tgt2, rate * 1.5, dt);
    xw[3] = Math.max(tgt3, damp(xw[3], tgt3, 10, dt)); xw[4] = damp(xw[4], tgt4, 6, dt); xw[5] = damp(xw[5], tgt5, 5, dt);
    xw[6] = damp(xw[6], tgt6, 20, dt); xw[7] = damp(xw[7], tgt7, 4, dt); xw[8] = damp(xw[8], tgt8, 8, dt);
    addExpr(P, X_FOCUS, xw[0] * (1 - xw[3])); addExpr(P, X_GRIN, xw[1] * (1 - xw[3])); addExpr(P, X_EFFORT, xw[2] * (1 - xw[3]));
    addExpr(P, X_WINCE, xw[3]); addExpr(P, X_WORRY, xw[4]); addExpr(P, X_DETERM, xw[5] * (1 - xw[0] * 0.5));
    addExpr(P, X_SURPRISE, xw[6]); addExpr(P, X_TIRED, xw[7] * (1 - xw[3])); addExpr(P, X_JOY, xw[8] * 0.6);
    P[EARS] += 0.25 * xw[0] + 0.1 * xw[1] + 0.15 * xw[2] - 0.6 * xw[3] - 0.9 * xw[4] + 0.5 * xw[5] + 0.8 * xw[6] - 0.8 * xw[7] + 0.8 * xw[8] - 0.3 * this.runW * this.gaitW;
    P[HANDPL] = Math.min(2, P[HANDPL] + 0.9 * hitK);
    // breathing through the mouth when exerted, open-mouthed gasps on big air
    P[MOPEN] = Math.max(P[MOPEN], (0.08 + 0.14 * Math.max(this.exert, this.wTired)) * (0.5 + 0.5 * Math.sin(TAU * this.brPh)) * Math.max(this.exert, this.wTired));
    if (this.runW * this.gaitW > 0.5) P[MOPEN] = Math.max(P[MOPEN], 0.12 * this.runW);
  }

  // ---------------------------------------------------------------------------------------------
  // Dances / showcase poses (kid-space feet; variants picked per character)
  // ---------------------------------------------------------------------------------------------
  _poseDance(D, name, t, dt) {
    D[WPL] = 0; D[WPR] = 0; D[STAB] = 0; D[AFOLT] = 0; D[AFOLR] = 0;
    if (name === 'victory') {
      if (this.danceVar === 0) this._dVictoryPump(D, t);
      else if (this.danceVar === 1) this._dVictoryFlourish(D, t);
      else this._dVictoryHops(D, t);
    } else if (name === 'defeat') {
      if (this.danceVar === 0) this._dDefeatSlump(D, t);
      else if (this.danceVar === 1) this._dDefeatSulk(D, t);
      else this._dDefeatKick(D, t);
    } else if (name === 'menu_idle') {
      this._dMenuIdle(D, t);
    } else if (name === 'lobby_pose') {
      this._dLobby(D, t);
    } else if (name === 'locker_idle') {
      this._dLocker(D, t);
    }
  }

  // Victory A: bouncing fist pumps → hop-spin → hero pose + wink (8 beats @ 126 bpm)
  _dVictoryPump(D, t) {
    const H = this.hold;
    const b = (t * 2.1) % 8, bf = frac(b);
    const pump = Math.pow(Math.abs(Math.sin(Math.PI * b)), 0.6);
    const hit = Math.exp(-bf * 7);
    D[HIPS_P + 1] = -0.055 + 0.045 * pump;
    D[SPINE] = 0.05 - 0.05 * pump; D[CHEST] = -0.08 * pump;
    D[HEAD] = 0.12 * hit - 0.1; D[HEAD + 2] = 0.1 * Math.sin(Math.PI * b * 0.5);
    D[SQY] = 1 - 0.05 * hit; D[SQXZ] = 1 + 0.03 * hit;
    setAnc(D, H.raise);
    D[IKL] = 0; D[POLER] = -0.8; D[POLER + 1] = 0.1; D[POLER + 2] = -0.5;
    setE(D, FOOTL, 0.11, ANKLE_H, 0.01); setE(D, FOOTR, -0.11, ANKLE_H, -0.01); D[FOOTLR + 1] = 0.2; D[FOOTRR + 1] = -0.2;
    D[FOOTLR] = 0.25 * pump * (b < 4 ? 1 : 0);
    if (b < 4) {
      D[UARML] = -2.6 - 0.35 * pump; D[UARML + 2] = 0.35; D[FARML] = -0.2 - 1.3 * (1 - pump); D[HANDL] = 0; D[HANDPL] = -1;
      D[ANC + 1] += 0.05 * pump;
      D[CHEST + 1] = 0.12 * Math.sin(Math.PI * b);
      // anticipation crouch before the spin
      const pre = win(b, 3.4, 3.8, 3.9, 4.0);
      D[HIPS_P + 1] -= 0.07 * pre; D[SPINE] += 0.15 * pre; D[UARML] = lerp(D[UARML], -0.6, pre);
    } else if (b < 6) {
      const k = (b - 4) / 2;
      D[MODELR + 1] = wrapA(TAU * ease(k));
      const air = Math.sin(Math.PI * clamp(k * 1.15, 0, 1));
      D[MODEL + 1] = 0.2 * air;
      D[FOOTL + 1] += 0.14 * air; D[FOOTR + 1] += 0.14 * air; D[FOOTLR] = 0.45 * air; D[FOOTRR] = 0.45 * air;
      D[UARML] = -1.4; D[UARML + 2] = 1.1; D[FARML] = -0.6; D[HANDPL] = 1.8;
      D[HEAD + 1] = -0.3 * Math.sin(TAU * k);
      const land = k > 0.87 ? Math.exp(-(k - 0.87) * 18) : 0;
      D[SQY] *= 1 - 0.1 * land; D[HIPS_P + 1] -= 0.06 * land;
    } else {
      const k = backOut((b - 6) / 0.4, 2);
      D[FOOTL] = lerp(0.11, 0.16, k); D[FOOTR] = lerp(-0.11, -0.16, k); D[FOOTLR + 1] = 0.3; D[FOOTRR + 1] = -0.3;
      D[HIPS_P + 1] = -0.07; D[HIPS + 2] = 0.06 * k; D[CHEST] = -0.12;
      D[UARML] = -2.0; D[UARML + 2] = 1.0 * k; D[FARML] = -0.9; D[HANDL + 2] = 0.3; D[HANDPL] = 1.9;
      D[HEAD + 2] = -0.18 * k; D[HEAD] = -0.1;
      D[WINK] = ease((b - 6.3) / 0.12) * (1 - ease((b - 7.6) / 0.15));
      setAnc(D, HOLD_HERO);
    }
    D[MOPEN] = 0.75; D[MCURVE] = 1; D[BROW] = -0.1; D[BROWY] = 0.8; D[EYE] = 0.92; D[LOOKY] = 0.1; D[EARS] = 0.9 + 0.1 * hit;
  }

  // Victory B: anticipation dip → weapon twirl overhead on tiptoe → point it at the camera, hand on hip, wink
  _dVictoryFlourish(D, t) {
    const H = this.hold;
    const c = t % 4.6;
    const dip = win(c, 0, 0.3, 0.42, 0.62), rise = win(c, 0.45, 0.7, 1.4, 1.7), strike = win(c, 1.45, 1.62, 3.9, 4.45);
    const bounce = strike * Math.max(0, Math.sin((c - 1.7) * TAU * 1.05)) ;
    setE(D, FOOTL, 0.1, ANKLE_H, 0.03); setE(D, FOOTR, -0.12, ANKLE_H, -0.04); D[FOOTLR + 1] = 0.25; D[FOOTRR + 1] = -0.35;
    D[HIPS_P + 1] = -0.03 - 0.08 * dip + 0.03 * rise - 0.04 * strike + 0.015 * bounce;
    D[SPINE] = 0.2 * dip - 0.12 * rise - 0.02 * strike; D[CHEST] = 0.1 * dip - 0.1 * rise;
    D[FOOTLR] = 0.45 * rise; D[FOOTRR] = 0.45 * rise; D[FOOTL + 1] += 0.03 * rise; D[FOOTR + 1] += 0.03 * rise;
    // weapon: pulled back → overhead twirl → thrust forward to the camera
    setAnc(D, H.carry);
    lerpE(D, ANC, -0.16, 0.8, -0.02, dip); lerpE(D, ANCR, 0.9, 0.3, 0.2, dip);
    lerpE(D, ANC, -0.15, 1.36, 0.06, rise); lerpE(D, ANCR, -1.6, 0.2, 0, rise);
    D[SPIN] = wrapA(TAU * 2 * ease((c - 0.55) / 0.85)) * (NO_TWIRL[this.animKind] ? 0 : 1);
    lerpE(D, ANC, -0.1, 1.02, 0.32, strike); lerpE(D, ANCR, -0.12, -0.05, 0.25, strike);
    D[IKL] = 0; D[POLER] = -0.9; D[POLER + 1] = 0.05; D[POLER + 2] = -0.3;
    // free hand: up with the twirl, then on the hip
    D[UARML] = -2.4 * rise - 0.4 * dip; D[UARML + 2] = 0.3 + 0.2 * dip; D[FARML] = -0.3 - 0.8 * dip;
    D[LTW] = strike; setE(D, LTGT, 0.19, 0.735, -0.01); lerpE(D, POLEL, 1, 0.1, -0.35, strike);
    D[HANDPL] = lerp(lerp(1, 1.9, rise), 1.5, strike); D[EARS] = 0.4 + 0.5 * rise + 0.4 * strike;
    D[HIPS + 2] = 0.08 * strike; D[HIPS_P] = 0.02 * strike; D[HIPS + 1] = 0.12 * strike; D[CHEST + 1] = -0.15 * strike;
    D[HEAD + 2] = -0.16 * strike + 0.04 * bounce; D[HEAD] = -0.06 * strike - 0.1 * rise; D[HEAD + 1] = 0.08 * strike;
    D[WINK] = win(c, 1.75, 1.85, 2.4, 2.55);
    D[MCURVE] = 1; D[MOPEN] = 0.3 + 0.45 * rise + 0.2 * bounce; D[MTILT] = 0.2 * strike; D[BROW] = -0.2 * strike; D[BROWY] = 0.6 * rise;
    D[LOOKX] = -0.05; D[LOOKY] = 0.05 + 0.2 * rise; D[EYE] = 1 - 0.1 * strike;
  }

  // Victory C: side-to-side happy hops with alternating arm waves → big V jump (8 beats @ 150 bpm)
  _dVictoryHops(D, t) {
    const H = this.hold;
    const b = (t * 2.5) % 8, bf = frac(b), bi = Math.floor(b);
    const sd = bi % 2 ? -1 : 1;
    setAnc(D, H.raise);
    D[IKL] = 0;
    if (b < 6) {
      const hop = Math.sin(Math.PI * clamp(bf / 0.62, 0, 1));
      const squash = bf > 0.62 ? Math.exp(-(bf - 0.62) * 14) : 0;
      const x = 0.07 * sd * ease(bf / 0.6);
      D[MODEL] = lerp(-0.07 * sd, 0.07 * sd, ease(bf / 0.62)); D[MODEL + 1] = 0.09 * hop;
      D[HIPS + 2] = -0.1 * sd * hop; D[CHEST + 2] = 0.08 * sd * hop; D[HEAD + 2] = 0.12 * sd * hop;
      setE(D, FOOTL, 0.11, ANKLE_H + 0.06 * hop * (sd > 0 ? 1 : 0.4), 0); setE(D, FOOTR, -0.11, ANKLE_H + 0.06 * hop * (sd < 0 ? 1 : 0.4), 0);
      D[FOOTLR] = 0.4 * hop; D[FOOTRR] = 0.4 * hop; D[FOOTLR + 1] = 0.15; D[FOOTRR + 1] = -0.15;
      D[HIPS_P + 1] = -0.04 - 0.06 * squash + 0.01 * hop; D[SQY] = 1 - 0.06 * squash + 0.03 * hop;
      // left arm waves big arcs; weapon arm pumps
      D[UARML] = -2.5; D[UARML + 2] = 0.3 + 0.45 * Math.sin(Math.PI * b); D[FARML] = -0.3 - 0.3 * Math.sin(Math.PI * b * 2);
      D[ANC + 1] += 0.06 * hop; D[ANC] += 0.03 * sd; D[HANDPL] = 2; D[EARS] = 0.7 + 0.3 * hop;
      void x;
    } else {
      const k = (b - 6) / 2;
      const crouch = win(k, 0, 0.12, 0.18, 0.26), air = Math.sin(Math.PI * clamp((k - 0.2) / 0.62, 0, 1)), land = k > 0.82 ? Math.exp(-(k - 0.82) * 16) : 0;
      D[MODEL + 1] = 0.28 * air;
      D[HIPS_P + 1] = -0.03 - 0.1 * crouch - 0.07 * land;
      D[SPINE] = 0.2 * crouch - 0.1 * air; D[SQY] = 1 - 0.08 * crouch + 0.08 * air - 0.08 * land;
      setE(D, FOOTL, 0.12, ANKLE_H + 0.18 * air, 0.02 * air); setE(D, FOOTR, -0.12, ANKLE_H + 0.18 * air, 0.02 * air);
      D[FOOTLR] = 0.6 * air; D[FOOTRR] = 0.6 * air;
      D[UARML] = lerp(-0.5, -2.7, air); D[UARML + 2] = lerp(0.2, 0.75, air); D[FARML] = -0.2;
      lerpE(D, ANC, -0.18, 1.4, 0.05, air); lerpE(D, ANCR, -1.9, 0.3, -0.5, air);
      D[HEAD] = -0.2 * air; D[MOPEN] = 0.9 * air; D[HANDPL] = 2; D[EARS] = 1;
    }
    D[MOPEN] = Math.max(D[MOPEN], 0.65); D[MCURVE] = 1; D[BROWY] = 0.9; D[EYE] = 0.88; D[LOOKY] = 0.12;
  }

  // Defeat A: slumped sway, big sigh, head drop
  _dDefeatSlump(D, t) {
    const H = this.hold;
    const cyc = t % 6;
    const sw = Math.sin(t * TAU * 0.28);
    const sigh = win(cyc, 3.0, 3.7, 3.9, 4.8);
    const drop = win(cyc, 4.3, 4.6, 4.7, 5.6);
    D[HIPS_P + 1] = -0.045 - 0.02 * drop; D[HIPS_P] = 0.01 * sw; D[HIPS + 2] = -0.03 * sw;
    D[SPINE] = 0.2 - 0.1 * sigh + 0.05 * drop; D[CHEST] = 0.16 - 0.12 * sigh + 0.05 * drop; D[NECK] = 0.1; D[HEAD] = 0.2 - 0.16 * sigh + 0.1 * drop + 0.03 * sw;
    D[HEAD + 2] = 0.06 * sw; D[HEAD + 1] = 0.05 * Math.sin(t * 0.7);
    D[CLAVL + 2] = -0.12 + 0.2 * sigh; D[CLAVR + 2] = 0.12 - 0.2 * sigh; D[CLAVL + 1] = -0.1; D[CLAVR + 1] = 0.1;
    D[UARML] = 0.1 + 0.03 * sw; D[UARML + 2] = 0.05; D[FARML] = -0.12;
    D[UARMR] = 0.1 - 0.03 * sw; D[UARMR + 2] = -0.05; D[FARMR] = -0.12;
    D[IKR] = 0; D[IKL] = 0;
    D[FOOTL] = 0.075; D[FOOTR] = -0.075; D[FOOTLR + 1] = -0.18; D[FOOTRR + 1] = 0.18;
    D[FOOTLR] = 0.12; D[FOOTL + 2] = 0.02; D[KNEEL] = -0.2; D[KNEER] = 0.2;
    D[MCURVE] = -0.9; D[MWIDTH] = 0.8; D[BROW] = 0.75; D[BROWY] = -0.3; D[EYE] = 0.45 + 0.25 * sigh; D[LOOKY] = -0.4; D[LOOKX] = 0.1 * sw;
    D[MOPEN] = 0.3 * sigh; D[HANDPL] = 1.15; D[EARS] = -1 + 0.2 * sigh;
  }

  // Defeat B: two frustrated stomps → turn away, arms crossed, pouting, sneaking a glance back
  _dDefeatSulk(D, t) {
    const c = t % 6.5;
    const st1 = win(c, 0.1, 0.25, 0.3, 0.42), st2 = win(c, 0.55, 0.7, 0.75, 0.87);
    const stomp = Math.max(st1, st2);
    const imp = (c > 0.42 && c < 0.6 ? Math.exp(-(c - 0.42) * 16) : 0) + (c > 0.87 && c < 1.05 ? Math.exp(-(c - 0.87) * 16) : 0);
    const turn = win(c, 1.0, 1.5, 5.7, 6.4);
    const glance = win(c, 3.2, 3.45, 3.9, 4.15);
    setE(D, FOOTL, 0.095, ANKLE_H, 0.01); setE(D, FOOTR, -0.1, ANKLE_H + 0.14 * stomp, 0.03 * stomp); D[FOOTLR + 1] = 0.12; D[FOOTRR + 1] = -0.2; D[FOOTRR] = -0.2 * stomp;
    D[HIPS_P + 1] = -0.035 - 0.05 * imp - 0.02 * stomp; D[SPINE] = 0.1 + 0.15 * imp; D[CHEST] = 0.05;
    D[HIPS + 2] = -0.06 * stomp;
    // fists clenched down by the sides while stomping
    D[UARML] = 0.15; D[UARML + 2] = 0.2; D[FARML] = -0.5; D[CLAVL + 2] = 0.12 * stomp; D[CLAVR + 2] = -0.12 * stomp;
    setAnc(D, this.hold.carry); D[ANC + 1] -= 0.05 * stomp; D[ANCR] += 0.4;
    // turned away with the free arm across the chest
    D[MODELR + 1] = -0.9 * ease(turn);
    D[LTW] = turn; setE(D, LTGT, -0.06, 0.9, 0.13); lerpE(D, POLEL, 1, -0.3, 0.2, turn); D[IKL] = 0;
    lerpE(D, ANC, -0.16, 0.86, 0.1, turn); lerpE(D, ANCR, 1.1, 0.8, 0.4, turn);
    D[CHEST] -= 0.08 * turn; D[HEAD] = -0.12 * turn + 0.2 * imp; D[HEAD + 2] = 0.1 * turn;
    D[HEAD + 1] = 0.8 * glance * turn - 0.15 * turn; D[NECK + 1] = 0.3 * glance * turn;
    D[LOOKX] = 0.35 * glance - 0.2 * turn * (1 - glance);
    D[MCURVE] = -1.4; D[MWIDTH] = 0.55; D[MTILT] = 0.15; D[BROW] = -0.5 + 1.1 * turn * (1 - glance); D[BROWY] = -0.2;
    D[EYE] = 0.75 - 0.3 * imp; D[SQUINT] = 0.6 * stomp; D[MOPEN] = 0.25 * stomp;
    D[HANDPL] = lerp(-1, 0.6, ease(turn)); D[EARS] = -0.6 - 0.4 * turn + 0.5 * glance;
  }

  // Defeat C: droop, scuff the ground with a foot, sigh, sniff
  _dDefeatKick(D, t) {
    const c = t % 5.2;
    const k1 = win(c, 0.6, 0.85, 0.95, 1.2), k2 = win(c, 1.4, 1.65, 1.75, 2.05);
    const scuff = Math.max(k1, k2);
    const sigh = win(c, 2.6, 3.2, 3.4, 4.2), sniff = win(c, 4.4, 4.5, 4.55, 4.75);
    setE(D, FOOTL, 0.085, ANKLE_H, 0.0); D[FOOTLR + 1] = -0.1; D[FOOTRR + 1] = -0.25;
    setE(D, FOOTR, -0.08, ANKLE_H + 0.03 * scuff, -0.02 + 0.12 * Math.sin(Math.PI * clamp((c - (k2 > k1 ? 1.4 : 0.6)) / 0.65, 0, 1)) * scuff);
    D[FOOTRR] = -0.3 * scuff;
    D[HIPS_P + 1] = -0.05; D[HIPS_P] = 0.02; D[HIPS + 2] = 0.05;
    D[SPINE] = 0.18 - 0.08 * sigh; D[CHEST] = 0.13 - 0.1 * sigh; D[NECK] = 0.1; D[HEAD] = 0.2 - 0.16 * sigh - 0.2 * sniff;
    D[CLAVL + 2] = -0.1 + 0.18 * sigh; D[CLAVR + 2] = 0.1 - 0.18 * sigh;
    D[UARML] = 0.05; D[UARML + 2] = 0.04; D[FARML] = -0.15; D[IKL] = 0;
    setAnc(D, this.hold.carry); D[ANC + 1] -= 0.12; D[ANCR] += 0.55; D[ANC + 2] -= 0.04;
    D[MCURVE] = -1.0; D[MWIDTH] = 0.7; D[BROW] = 0.85; D[BROWY] = -0.2; D[EYE] = 0.5 + 0.3 * sniff; D[LOOKY] = -0.35; D[LOOKX] = -0.1 * scuff;
    D[MOPEN] = 0.35 * sigh; D[HANDPL] = 1.1; D[EARS] = -0.9 + 0.3 * sniff;
  }

  // Menu idle: relaxed weight shifts + fidgets + look-arounds (same systems as gameplay idle, feet in kid space)
  _dMenuIdle(D, t) {
    const H = this.hold;
    const cyc = t % 8;
    const w = Math.sin(t * TAU / 8);
    D[HIPS_P] = 0.028 * w; D[HIPS + 2] = -0.05 * w; D[SPINE + 2] = 0.03 * w; D[CHEST + 2] = 0.015 * w;
    D[HIPS_P + 1] = -0.024 - 0.01 * Math.abs(w);
    setE(D, FOOTL, HIPW + 0.005, ANKLE_H, -0.004); setE(D, FOOTR, -HIPW - 0.005, ANKLE_H, -0.004); D[FOOTLR + 1] = 0.14; D[FOOTRR + 1] = -0.14;
    if (w > 0) { D[FOOTRR] = 0.25 * w; D[FOOTR + 2] += 0.03 * w; D[FOOTR] -= 0.01 * w; } else { D[FOOTLR] = -0.25 * w; D[FOOTL + 2] -= 0.03 * w; D[FOOTL] += 0.01 * w; }
    const br = 0;   // breathing: _breathe (post-dance, same for every pose)
    const yaw = kc(cyc, K_MENU_T, K_MENU_V);
    const pitch = -0.08 * Math.sin(cyc * 0.9);
    D[HEAD + 1] = yaw * 0.7; D[NECK + 1] = yaw * 0.3; D[HEAD] = pitch; D[HEAD + 2] = -0.05 * w;
    const yawL = kc(cyc + 0.25, K_MENU_T, K_MENU_V);
    D[LOOKX] = clamp(yawL * 0.9, -0.35, 0.35); D[LOOKY] = -pitch * 0.5;
    setAnc(D, H.carry);
    D[IKL] = H.twoCarry ? 1 : 0;
    const tw = cyc >= 6.1 && cyc < 7.1 ? (cyc - 6.1) / 1.0 : -1;
    if (tw >= 0 && !NO_TWIRL[this.animKind]) {
      const k = ease(clamp(tw / 0.8, 0, 1));
      const lift = Math.sin(Math.PI * clamp(tw, 0, 1));
      D[SPIN] = wrapA(TAU * 2 * k); D[IKL] = 0;
      D[ANC + 1] += 0.1 * lift; D[ANC + 2] += 0.08 * lift; D[ANC] -= 0.03 * lift; D[ANCR] -= 0.5 * lift;
      D[MCURVE] = 1; D[MOPEN] = 0.25 * lift;
    } else if (tw >= 0) {
      const lift = Math.sin(Math.PI * clamp(tw, 0, 1));
      D[ANC + 1] += 0.06 * lift; D[ANCR] -= 0.25 * lift;
    }
    D[UARML] = -0.05 + 0.03 * br; D[UARML + 2] = 0.12; D[FARML] = -0.35;
    D[MCURVE] = Math.max(D[MCURVE], 0.8); D[EARS] = 0.15 + 0.2 * Math.abs(yaw);
  }

  // Locker: relaxed hand-on-hip weight shifts, looking at the camera (the viewer), a head tilt now and then
  _dLocker(D, t) {
    const H = this.hold;
    const w = Math.sin(t * TAU / 6.5), br = 0, cyc = t % 9;   // breathing: _breathe
    setE(D, FOOTL, 0.12, ANKLE_H, 0.02); setE(D, FOOTR, -0.115, ANKLE_H, -0.02); D[FOOTLR + 1] = 0.26; D[FOOTRR + 1] = -0.24;
    if (w > 0) { D[FOOTRR] = 0.22 * w; D[FOOTR + 2] += 0.02 * w; } else { D[FOOTLR] = -0.22 * w; D[FOOTL + 2] -= 0.02 * w; }
    D[HIPS_P] = 0.03 * w; D[HIPS_P + 1] = -0.035 - 0.012 * Math.abs(w); D[HIPS + 2] = 0.075 * w; D[HIPS + 1] = 0.05 * w;
    D[SPINE + 2] = -0.045 * w; D[CHEST + 2] = -0.03 * w; D[CHEST] = -0.03 - 0.02 * br; D[CLAVL + 2] = 0.02 * br; D[CLAVR + 2] = -0.02 * br;
    const tilt = win(cyc, 3.2, 3.6, 4.6, 5.1), look = win(cyc, 6.2, 6.6, 7.2, 7.7);
    D[HEAD + 2] = -0.04 * w - 0.14 * tilt; D[HEAD] = -0.04 + 0.02 * br; D[HEAD + 1] = 0.25 * look;
    D[LOOKX] = 0.28 * look; D[LOOKY] = 0.05;
    // free hand on the hip, the weapon hand relaxed at the side
    D[LTW] = 1; setE(D, LTGT, 0.17, 0.745, -0.005); D[IKL] = 0;
    D[UARML + 2] = 0.9; D[FARML] = -1.6; D[HANDL] = 0.3; D[HANDL + 2] = 0.6; D[POLEL] = 1; D[POLEL + 1] = 0.1; D[POLEL + 2] = -0.35;
    setAnc(D, H.carry); D[ANC + 1] += 0.005 * br;
    if (H.twoCarry) { D[IKL] = 0; lerpE(D, ANC, -0.19, 0.74, 0.12, 1); }
    D[MCURVE] = 0.95; D[MTILT] = 0.12 * tilt; D[BROWY] = 0.2 * tilt; D[EYE] = 0.95; D[HANDPL] = 1.4; D[EARS] = 0.3 + 0.3 * tilt;
  }

  // Loadout / lobby: confident weapon-presenting stance with breathing and a periodic flourish
  _dLobby(D, t) {
    const H = this.hold;
    const br = 0;   // breathing: _breathe
    const cyc = t % 7;
    const fl = win(cyc, 4.6, 4.9, 5.6, 6.1);
    setE(D, FOOTL, 0.15, ANKLE_H, 0.02); setE(D, FOOTR, -0.15, ANKLE_H, -0.02); D[FOOTLR + 1] = 0.3; D[FOOTRR + 1] = -0.28;
    D[HIPS_P + 1] = -0.05 - 0.004 * br; D[HIPS_P] = 0.012; D[HIPS + 2] = -0.05; D[HIPS + 1] = 0.08;
    D[SPINE + 1] = -0.05; D[SPINE + 2] = 0.03; D[CHEST] = -0.1 - 0.015 * br; D[CHEST + 1] = -0.08;
    D[HEAD] = -0.1; D[HEAD + 2] = -0.1; D[HEAD + 1] = 0.12; D[NECK + 1] = 0.05;
    setAnc(D, H.lobby);
    D[ANC + 1] += 0.006 * br;
    D[POLER] = -0.9; D[POLER + 1] = -0.4; D[POLER + 2] = -0.1;
    if (H.lobbyTwo) { D[IKL] = 1; D[LTW] = 0; D[CHEST + 1] = 0.05; }
    else {
      D[LTW] = 1; setE(D, LTGT, 0.17, 0.745, -0.005); D[IKL] = 0;
      D[UARML + 2] = 0.9; D[FARML] = -1.6; D[HANDL] = 0.3; D[HANDL + 2] = 0.6;
      D[POLEL] = 1; D[POLEL + 1] = 0.1; D[POLEL + 2] = -0.35;
    }
    // flourish: a quick re-grip / twirl and a proud chin-up
    if (this.animKind === 'shooter' || this.animKind === 'blaster') { D[SPIN] = wrapA(TAU * ease((cyc - 4.8) / 0.55)) * (cyc > 4.8 && cyc < 5.5 ? 1 : 0); D[ANC + 1] += 0.05 * fl; }
    else D[ANCR] -= 0.2 * fl;
    D[HEAD] -= 0.08 * fl; D[HIPS_P + 1] -= 0.015 * fl;
    D[MCURVE] = 1; D[MTILT] = 0.22; D[BROW] = -0.25; D[EYE] = 0.92; D[LOOKX] = -0.12; D[LOOKY] = 0.04;
    D[MOPEN] = 0.2 * fl; D[HANDPL] = H.lobbyTwo ? 0 : 1.5; D[EARS] = 0.45 + 0.4 * fl;
  }

  // ---------------------------------------------------------------------------------------------
  // Pose application: kid transform → pelvis reach → torso FK → head → leg IK → arm IK → face → hair → tank
  // ---------------------------------------------------------------------------------------------
  _applyPose(dt, s) {
    const P = this.P, B = this.bones, R = this.root.position, sp = this.sp;
    // ---- hand-held splat bomb: appears (pop) when the sub is aimed, leaves the hand on 'throw'
    if (this.bomb) {
      const on = this.bombHeld && this.kidForm && this.wSub > 0.2;
      this.bomb.group.visible = on && !this.subPropHidden;   // specials that hold their own prop hide it
      if (on) this.bomb.group.scale.setScalar(Math.max(0.05, backOut(clamp(this.bombT / 0.14, 0, 1), 2.6)));
    }
    // ---- kid group transform: squash/stretch, model offsets, rotation about the hips, form-change pop
    const sq = this.kidScale;
    let sqY = P[SQY] * this.kidSY * sq, sqX = P[SQXZ] * this.kidSXZ * sq;
    sqX = Math.max(1e-3, sqX); sqY = Math.max(1e-3, sqY);
    this.kid.scale.set(sqX, sqY, sqX);
    _e1.set(P[MODELR], P[MODELR + 1], P[MODELR + 2], 'YXZ'); this.kid.quaternion.setFromEuler(_e1);
    // dodge roll tumble: the tucked body turns about (up × roll direction) through its centre, lowered to the ground
    if (this.tumble) { _q1.setFromAxisAngle(_v3.set(this.tumbleX, 0, this.tumbleZ), this.tumble); this.kid.quaternion.premultiply(_q1); }
    _v1.set(0, this.tumble ? 0.56 : 0.62, 0); _v2.copy(_v1).applyQuaternion(this.kid.quaternion);
    this.kid.position.set(P[MODEL], P[MODEL + 1] - this.tumbleDrop, P[MODEL + 2]).add(_v1).sub(_v2);
    this.kid.position.y += this.kidLift;
    // inverse kid transform (root space → kid space)
    _q6.copy(this.kid.quaternion).invert();
    const isx = 1 / sqX, isy = 1 / sqY;

    // ---- feet targets in kid space (planted world feet blended with pose feet)
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    const plant = this.plantW;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const FO = i === 0 ? FOOTL : FOOTR, FR = i === 0 ? FOOTLR : FOOTRR;
      const wp = (i === 0 ? P[WPL] : P[WPR]) * plant * (this.feetValid ? 1 : 0);
      // pose target
      _e1.set(P[FR], P[FR + 1], P[FR + 2], 'YXZ'); _q1.setFromEuler(_e1);
      _v3.set(P[FO], P[FO + 1], P[FO + 2]);
      if (wp > 0.001) {
        // world contact → root space
        const dx = f.cw.x - R.x, dy = f.cw.y - R.y, dz = f.cw.z - R.z;
        _v4.set(dx * c - dz * sn, dy, dx * sn + dz * c);
        const fy = f.cyaw - this.yaw;
        let pitch = f.pitch;
        if (!this.moving && i === (this.shiftS > 0 ? 1 : 0)) pitch += 0.1 * Math.abs(this.shiftS || 0) * (1 - this.gaitW);
        const tip = Math.max(P[TIPTOE], this._toeUp || 0);
        if (tip > 0.001) pitch += 0.55 * tip;
        // ground normal in root space → foot orientation = align(up→n) · yaw · pitch
        _v5.set(f.cn.x * c - f.cn.z * sn, f.cn.y, f.cn.x * sn + f.cn.z * c);
        _q2.setFromUnitVectors(UP, _v5);
        _q3.setFromAxisAngle(YAX, fy); _q2.multiply(_q3);
        // ankle above the contact, rolling about the ball (heel up) or the heel (toes up)
        let az, ay;
        if (pitch >= 0) { ay = ANKLE_H * Math.cos(pitch) + BALL_Z * Math.sin(pitch); az = BALL_Z + ANKLE_H * Math.sin(pitch) - BALL_Z * Math.cos(pitch); }
        else { ay = ANKLE_H * Math.cos(pitch) - HEEL_Z * Math.sin(pitch); az = -HEEL_Z + ANKLE_H * Math.sin(pitch) + HEEL_Z * Math.cos(pitch); }
        _v6.set(0, ay, az).applyQuaternion(_q2).add(_v4);
        _q3.setFromAxisAngle(XAX, pitch); _q2.multiply(_q3);
        // root space → kid space
        _v6.sub(this.kid.position).applyQuaternion(_q6); _v6.x *= isx; _v6.y *= isy; _v6.z *= isx;
        _q2.premultiply(_q6);
        _v3.lerp(_v6, wp); _q1.slerp(_q2, wp);
      }
      if (i === 0) { this._fL.copy(_v3); this._fLq.copy(_q1); } else { this._fR.copy(_v3); this._fRq.copy(_q1); }
    }
    this._toeUp = 0;

    // ---- pelvis: pose offsets, then drop just enough that both ankles are reachable
    B.hips.position.copy(this.rest.hips); B.hips.position.x += P[HIPS_P]; B.hips.position.y += P[HIPS_P + 1]; B.hips.position.z += P[HIPS_P + 2];
    B.hips.rotation.set(P[HIPS], P[HIPS + 1], P[HIPS + 2]);
    {
      let drop = 0;
      for (let i = 0; i < 2; i++) {
        const leg = i === 0 ? this.limbs.legL : this.limbs.legR, ft = i === 0 ? this._fL : this._fR;
        // only feet carrying weight pull the pelvis down; a swinging foot just reaches (clamped below)
        const f = this.feet[i];
        if (this.plantW > 0.5 && (i === 0 ? P[WPL] : P[WPR]) > 0.5 && f.sw && f.su > 0.02 && f.su < 0.9) continue;
        _v4.copy(leg.up.position).applyQuaternion(B.hips.quaternion).add(B.hips.position);
        const hx = ft.x - _v4.x, hz = ft.z - _v4.z;
        const reach = this.legReach;
        const h2 = hx * hx + hz * hz;
        const vmax = Math.sqrt(Math.max(0, reach * reach - h2));
        const need = _v4.y - (ft.y + vmax);
        if (need > drop) drop = need;
      }
      drop = Math.min(drop, 0.26);
      this.hipDrop = drop > this.hipDrop ? damp(this.hipDrop, drop, 40, dt) : damp(this.hipDrop, drop, 16, dt);
      B.hips.position.y -= Math.max(drop * 0.85, this.hipDrop);
      // keep swing-foot targets inside the leg's reach (a soft knee, never a locked, popping leg)
      for (let i = 0; i < 2; i++) {
        const leg = i === 0 ? this.limbs.legL : this.limbs.legR, ft = i === 0 ? this._fL : this._fR;
        _v4.copy(leg.up.position).applyQuaternion(B.hips.quaternion).add(B.hips.position);
        _v5.subVectors(ft, _v4); const d = _v5.length(), mxr = this.legReach * 0.97;
        if (d > mxr) ft.copy(_v4).addScaledVector(_v5, mxr / d);
      }
    }

    // ---- torso FK
    B.spine.rotation.set(P[SPINE], P[SPINE + 1], P[SPINE + 2]);
    B.chest.rotation.set(P[CHEST], P[CHEST + 1], P[CHEST + 2]);
    B.neck.rotation.set(P[NECK], P[NECK + 1], P[NECK + 2]);
    B.clavL.rotation.set(P[CLAVL], P[CLAVL + 1], P[CLAVL + 2]);
    B.clavR.rotation.set(P[CLAVR], P[CLAVR + 1], P[CLAVR + 2]);
    B.uArmL.rotation.set(P[UARML], P[UARML + 1], P[UARML + 2]);
    B.uArmR.rotation.set(P[UARMR], P[UARMR + 1], P[UARMR + 2]);
    B.fArmL.rotation.set(P[FARML], P[FARML + 1], P[FARML + 2]);
    B.fArmR.rotation.set(P[FARMR], P[FARMR + 1], P[FARMR + 2]);
    B.handL.rotation.set(P[HANDL], P[HANDL + 1], P[HANDL + 2]);
    B.handR.rotation.set(P[HANDR], P[HANDR + 1], P[HANDR + 2]);

    // ---- head: stabilised look (kid-space yaw/pitch) blended with the FK head
    _e1.set(P[HEAD], P[HEAD + 1], P[HEAD + 2], 'YXZ'); _q1.setFromEuler(_e1);
    if (P[STAB] > 0.001) {
      this._kidXform(B.neck, _v1, _q2);
      const tp = P[HIPS] + P[SPINE] + P[CHEST] + P[NECK], trl = P[HIPS + 2] + P[SPINE + 2] + P[CHEST + 2];
      _e1.set(-P[HLP] + P[HEAD] * 0.5 + tp * 0.4, P[HLY], P[HEAD + 2] + trl * 0.35, 'YXZ'); _q3.setFromEuler(_e1);
      _q2.invert().multiply(_q3);
      _q1.slerp(_q2, P[STAB]);
    } else if (Math.abs(P[HLY]) + Math.abs(P[HLP]) > 1e-4) {
      _e1.set(-P[HLP], P[HLY], 0, 'YXZ'); _q2.setFromEuler(_e1); _q1.premultiply(_q2);
    }
    B.head.quaternion.copy(_q1);

    // ---- legs: IK to the targets, knees toward the feet
    const hyw = P[HIPS + 1];
    for (let i = 0; i < 2; i++) {
      const leg = i === 0 ? this.limbs.legL : this.limbs.legR, sd = i === 0 ? 1 : -1;
      const ft = i === 0 ? this._fL : this._fR, fq = i === 0 ? this._fLq : this._fRq;
      _v1.set(0, 0, 1).applyQuaternion(fq); // foot forward
      const kn = i === 0 ? KNEEL : KNEER;
      _pN.set(_v1.x * 0.7 + Math.sin(hyw) * 0.3 + 0.1 * sd + P[kn], 0.05 + P[kn + 1], _v1.z * 0.7 + Math.cos(hyw) * 0.3 + P[kn + 2]);
      _pT.copy(ft);
      this._solveLimb(leg, _pT, _pN, fq, 1, sd > 0 ? 2 : 3);
    }

    // ---- weapon parts first (arsenal: animateWeapon) so the hands ride this frame's pump / trigger
    const w = this.weapon; const d = w.def;
    this._animWeapon(dt, s, w);
    // ---- weapon anchor → right arm IK
    _e1.set(P[ANCR], P[ANCR + 1], P[ANCR + 2], 'YXZ'); _aQ.setFromEuler(_e1);
    _aP.set(P[ANC], P[ANC + 1], P[ANC + 2]);
    // follow the chest (translation / rotation weights) so the weapon rides with the torso
    const fol = P[AFOLT] > 0.001 || P[AFOLR] > 0.001;
    if (fol) {
      this._kidXform(B.chest, _cP, _cQ);
      _q2.identity().slerp(_cQ, P[AFOLR]);
      _v1.subVectors(_aP, this.rest.chest).applyQuaternion(_q2).add(_cP);
      _aP.lerp(_v1, P[AFOLT]);
      _aQ.premultiply(_q2);
    }
    // sway (lags body acceleration / turning) — damped when aiming so the barrel stays true; none in the dualies' lock
    const swW = lerp(1, 0.3, this.wAim) * (1 - this.lockW);
    const sx = spr(sp, S_WPX, clamp(-this.kax * 0.0011, -0.035, 0.035), 3.0, 0.34, dt);
    const sy = spr(sp, S_WPY, clamp(-this.vyS * 0.002, -0.03, 0.03), 3.4, 0.34, dt);
    const sz = spr(sp, S_WPZ, clamp(-this.kaz * 0.0011, -0.035, 0.035), 3.0, 0.34, dt);
    const rx = spr(sp, S_WRX, clamp(this.vyS * 0.01, -0.12, 0.12), 2.6, 0.32, dt);
    const ry = spr(sp, S_WRY, clamp(-this.yawRate * 0.035, -0.22, 0.22), 2.6, 0.38, dt);
    _aP.x += sx * swW; _aP.y += sy * swW; _aP.z += sz * swW;
    _e1.set(rx * swW, ry * swW, 0, 'YXZ'); _q2.setFromEuler(_e1); _aQ.premultiply(_q2);
    // recoil: kick back along the barrel + muzzle climb + jitter
    _v1.set(0, 0, -this.rcZ).applyQuaternion(_aQ); _aP.add(_v1);
    _e1.set(-this.rcP, sp[S_RCY], sp[S_RCR], 'YXZ'); _q2.setFromEuler(_e1); _aQ.multiply(_q2);
    _q2.copy(_aQ).multiply(d.handR.quat);
    _pT.copy(d.handR.pos).applyQuaternion(_aQ).add(_aP);
    _pN.set(P[POLER], P[POLER + 1], P[POLER + 2]);
    if (P[IKR] > 0.001) this._solveLimb(this.limbs.armR, _pT, _pN, _q2, P[IKR], 1);
    w.pivot.rotation.set(P[SPIN], 0, 0);
    if (this.dual) {
      // ---- dual wield: the left fist holds its own pistol at the mirrored anchor (own sway mirror + own recoil)
      const wl = w.left;
      _e1.set(P[ANLR], P[ANLR + 1], P[ANLR + 2], 'YXZ'); _aQ.setFromEuler(_e1);
      _aP.set(P[ANL], P[ANL + 1], P[ANL + 2]);
      if (fol) {
        _q2.identity().slerp(_cQ, P[AFOLR]);
        _v1.subVectors(_aP, this.rest.chest).applyQuaternion(_q2).add(_cP);
        _aP.lerp(_v1, P[AFOLT]);
        _aQ.premultiply(_q2);
      }
      _aP.x += sx * swW; _aP.y += sy * swW; _aP.z += sz * swW;
      _e1.set(rx * swW, ry * swW, 0, 'YXZ'); _q2.setFromEuler(_e1); _aQ.premultiply(_q2);
      _v1.set(0, 0, -this.rcZ2).applyQuaternion(_aQ); _aP.add(_v1);
      _e1.set(-this.rcP2, -sp[S_RCY2], 0, 'YXZ'); _q2.setFromEuler(_e1); _aQ.multiply(_q2);
      _q2.copy(_aQ).multiply(d.handL.quat);
      _pT.copy(d.handL.pos).applyQuaternion(_aQ).add(_aP);
      if (P[LTW] > 0.001) _pT.lerp(_v6.set(P[LTGT], P[LTGT + 1], P[LTGT + 2]), P[LTW]);
      _pN.set(P[POLEL], P[POLEL + 1], P[POLEL + 2]);
      const wgt = clamp(Math.max(P[IKL], P[LTW]), 0, 1) * (1 - this.bombSwap);
      if (wgt > 0.001) this._solveLimb(this.limbs.armL, _pT, _pN, P[LTW] > 0.5 ? null : _q2, wgt, 0);
      wl.pivot.rotation.set(-P[SPIN], 0, 0);
      // the splat bomb needs the left fist: the pistol shrinks away while it is held and pops back after the throw
      const k = 1 - this.bombSwap;
      wl.pivot.scale.setScalar(Math.max(0.001, k < 1 ? backOut(k, 2) : 1));
      wl.pivot.visible = k > 0.01 && !this.weaponHidden;
    } else if (P[IKL] > 0.001 || P[LTW] > 0.001) {
      // left arm → foregrip, an explicit target (hip / visor / tank), or free FK
      this._kidXform(B.handR, _v3, _q3);
      _v4.copy(w.pivot.position).applyQuaternion(_q3).add(_v3); _q4.copy(_q3).multiply(w.pivot.quaternion);
      _v5.copy(w.off.position).applyQuaternion(_q4).add(_v4); _q5.copy(_q4).multiply(w.off.quaternion);
      _pT.copy(d.handL.pos); if (w.pump) _pT.z -= 0.036 * w.pump;   // blaster: the support hand racks the pump
      _pT.applyQuaternion(_q5).add(_v5);
      _q2.copy(_q5).multiply(d.handL.quat);
      if (P[LTW] > 0.001) {
        _pT.lerp(_v6.set(P[LTGT], P[LTGT + 1], P[LTGT + 2]), P[LTW]);
        const wgt = Math.max(P[IKL], P[LTW]);
        _pN.set(P[POLEL], P[POLEL + 1], P[POLEL + 2]);
        this._solveLimb(this.limbs.armL, _pT, _pN, P[IKL] > P[LTW] ? _q2 : null, wgt, 0);
      } else {
        _pN.set(P[POLEL], P[POLEL + 1], P[POLEL + 2]);
        this._solveLimb(this.limbs.armL, _pT, _pN, _q2, P[IKL], 0);
        // still short of the foregrip (steep aim, fast pitch changes): protract the shoulder toward the grip and
        // re-solve in the same frame, so the support hand never visibly leaves the gun
        this.ikErrPre = this.ikErr[0];
        if (P[IKL] > 0.5 && this.ikErr[0] > 0.0005) {
          const cy = B.clavL.rotation.y;
          for (let it = 0; it < 3 && this.ikErr[0] > 0.0005 && B.clavL.rotation.y > cy - 0.55; it++) {
            const extra = clamp(this.ikErr[0] * 12, 0, 0.3);
            B.clavL.rotation.y -= extra; B.clavL.rotation.x -= extra * 0.35;
            _pN.set(P[POLEL], P[POLEL + 1], P[POLEL + 2]);
            this._solveLimb(this.limbs.armL, _pT, _pN, _q2, P[IKL], 0);
          }
        }
      }
    }

    const lv = this.lifeLv;
    // ---- face
    if (lv > 0) this._applyFace(P, dt);
    // ---- hair secondary motion (far: every other frame on the summed step; the chain sub-steps at ≤ 1/60 s)
    if (lv > 0 || !(this._hairOdd = !this._hairOdd)) { this._updateHair(dt + this._hairAcc); this._hairAcc = 0; } else this._hairAcc += dt;
    // ---- tank slosh (ink level wobble + surface tilt within the glass)
    this._updateTank(dt);
    // ---- fork weapon extras (the arsenal kinds' drums / barrels are turned by animateWeapon)
    if (w.spin) {
      // spinner / zooka barrels: spin up with the charge, flat out while the stream fires, wind down after
      const want = this.lastShot < 0.12 ? 38 : this.charge * 30;
      this.spinRate = damp(this.spinRate || 0, want, want > (this.spinRate || 0) ? 6 : 1.6, dt);
      this.spinAngle = ((this.spinAngle || 0) + this.spinRate * dt) % TAU;
      w.spin.rotation.z = this.spinAngle;
    }
    if (w.pivotL) w.pivotL.visible = !this.bombHeld && !this.weaponHidden;   // twins: the left pistol makes way for the sub
    this._updateDodge(dt);
    // ---- jiggle bones (docs/RIG.md): toes, tee hem flaps, backpack sway, ears
    if (lv > 0) this._applyJiggle(P, dt);
    // ---- hands: grip weapons / the bomb, relax when free, fists and open palms from the pose layers
    if (lv > 0) this._applyFingers(P, dt);
    this._headQW.copy(B.head.quaternion); this._headSet = true;
    // ---- remember where the feet actually are (world) for seamless replanting after air / dances
    this.kid.updateMatrix();
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i], bone = i === 0 ? B.footL : B.footR;
      this._kidXform(bone, _v1, _q1);
      _v1.applyMatrix4(this.kid.matrix); // root space
      f.disp.set(R.x + _v1.x * c + _v1.z * sn, R.y + Math.max(0, _v1.y - ANKLE_H), R.z - _v1.x * sn + _v1.z * c);
      _v2.set(0, 0, 1).applyQuaternion(_q1).applyQuaternion(this.kid.quaternion);
      f.dispYaw = this.yaw + Math.atan2(_v2.x, _v2.z); f.dispOK = true;
    }
  }

  // Gaze: eye yaw/pitch in head space. Big changes of the wanted direction fire a saccade (minimum-jerk, main-sequence
  // duration ≈ 22 ms + 100 ms/rad, big ones undershoot and land with a correction, may trigger a blink); small ones are
  // tracked at once (the eyes stay locked on target while the head moves — VOR) with fixation micro-saccades on top.
  _gazeTick(dt, dx, dy) {
    const g = this.gz;
    dx = clamp(dx, -0.62, 0.62); dy = clamp(dy, -0.42, 0.38);
    if (g.st >= 0) {
      g.st += dt; const u = Math.min(1, g.st / g.sd), k = mj(u);
      g.x = lerp(g.x0, g.x1, k); g.y = lerp(g.y0, g.y1, k);
      if (u >= 1) { g.st = -1; g.fx = g.x1; g.fy = g.y1; }
      return;
    }
    const ex = dx - g.fx, ey = dy - g.fy, amp = Math.hypot(ex, ey);
    if (amp > 0.075 && dt > 0) {
      g.x0 = g.x; g.y0 = g.y;
      const us = amp > 0.25 ? 0.9 + 0.05 * this.rng() : 1;
      g.x1 = g.fx + ex * us; g.y1 = g.fy + ey * us; g.sd = 0.022 + 0.1 * amp; g.st = 0;
      if (amp > 0.3 && this.kidForm && this.bl.t < 0 && this.bl.next > 0.8 && this.rng() < amp * 0.3) this._blinkStart(0.85 + 0.15 * this.rng(), false);
      if (amp > 0.4 && this.rng() < 0.3) this._mxPlay(X_BROWFLASH, 0.3, 0.06, 0.1, 0.3);
      return;
    }
    g.fx = dx; g.fy = dy;
    g.mT -= dt;
    if (g.mT <= 0) { g.mT = 0.28 + this.rng() * 1.1; g.mx = (this.rng() - 0.5) * 0.07; g.my = (this.rng() - 0.5) * 0.045; }
    g.x = damp(g.x, g.fx + g.mx, 45, dt); g.y = damp(g.y, g.fy + g.my, 45, dt);
  }

  _applyFace(P, dt) {
    const B = this.bones, F = this.face, A = this.att;
    // ---- gaze: exact eye-in-head direction to the attention point (real head orientation: dances, lobby turns)
    let ex = P[LOOKX] / 0.9, ey = (P[LOOKY] - 0.02) / 0.8;
    if (A.on) {
      this.kid.updateMatrix();
      _v1.copy(A.p).applyMatrix4(_m1.copy(this.kid.matrix).invert());
      this._kidXform(B.head, _v2, _q1);
      _v3.copy(EYE_MID).applyQuaternion(_q1).add(_v2);
      _v1.sub(_v3).applyQuaternion(_q2.copy(_q1).invert());
      const d = _v1.length();
      if (d > 0.05) { ex = Math.atan2(_v1.x, _v1.z); ey = Math.atan2(_v1.y, Math.hypot(_v1.x, _v1.z)); A.dist = d; }
    }
    // the showcase turned the head toward a neighbour after our last update: the eyes carry the rest of the way
    if (Math.abs(this.extGl) > 0.06) { ex = this.extGl * 0.62; ey = -0.03; }
    this._gazeTick(dt, ex, ey);
    const gzx = this.gz.x, gzy = this.gz.y;
    F.verge = Math.atan2(0.062, Math.max(0.3, A.dist));   // half the convergence angle on the looked-at point
    // ---- lids: blink (per eye) + wink + squint; the upper lid rides the gaze (looking down lowers it, up lifts it)
    const sqz = clamp(P[SQUINT] + 0.35 * this.bl.squeeze * this.blinkK, 0, 1);
    const follow = clamp(-gzy * 0.75, 0, 0.3) - clamp(gzy * 0.3, 0, 0.1);
    const base = clamp(P[EYE] - 0.22 * sqz - follow + 0.04 * (P[PUPIL] - 0.5), 0.07, 1.25);
    const open = Math.max(0.07, base * (1 - 0.94 * this.blinkL));
    const openR = Math.max(0.07, base * (1 - 0.94 * this.blinkR) * (1 - 0.93 * clamp(P[WINK], 0, 1)));
    B.eyeL.scale.set(1 + 0.06 * (1 - open), open, 1);
    B.eyeR.scale.set(1 + 0.06 * (1 - openR), openR, 1);
    // ---- brows (+ asymmetry channel), mouth decal, gaze uniform
    const bra = clamp(P[BRAS], -1, 1);
    B.browL.rotation.z = -P[BROW] * 0.42 - 0.12 * bra; B.browR.rotation.z = P[BROW] * 0.42 - 0.12 * bra;
    B.browL.position.y = this.faceRest.browL.y + (P[BROWY] + 0.6 * bra) * 0.008 - 0.004 * sqz + (1 - open) * -0.004;
    B.browR.position.y = this.faceRest.browR.y + (P[BROWY] - 0.6 * bra) * 0.008 - 0.004 * sqz + (1 - openR) * -0.004;
    const mo = clamp(P[MOPEN], 0, 1);
    F.smile = clamp((P[MCURVE] - 0.3) / 0.6, 0, 1);
    this.u.uMouth.value.set(clamp(P[MCURVE], -1.2, 1.2), clamp(P[MWIDTH], 0.2, 1.4), mo, P[MTILT]);
    const lx = clamp(gzx * 0.9, -0.4, 0.4) * 0.55, ly = clamp(gzy * 0.8 + 0.02, -0.4, 0.4) * 0.5;
    this.u.uLook.value.set(lx, ly);
    // face hooks (character-mats.js): socketed eyeballs turn by uLook·1.25 + uGaze — top that up so the balls really
    // point at the target (90 %: big stylised eyes read better a touch short of it), converging on near targets;
    // lower lids rise with squint / smiles; pupils; mouth extras (sneer, pucker, blush)
    const U = this.u;
    if (U.uGaze) {
      const vg = F.verge * (A.on ? 1 : 0), ex2 = 0.9 * gzx - lx * 1.25, ey2 = 0.9 * gzy - ly * 1.25;
      U.uGaze.value.set(ex2 - vg, ey2, ex2 + vg, ey2);
    }
    if (U.uLid) { const lo = clamp(0.4 * sqz + 0.22 * F.smile, 0, 0.6); U.uLid.value.set(0, 0, lo, lo); }
    if (U.uPupil) U.uPupil.value = P[PUPIL];
    if (U.uMouth2) U.uMouth2.value.set(F.smile, clamp(P[SNEER], 0, 1), clamp(P[PUCKER], 0, 1), clamp(P[BLUSH], 0, 1));
    // ---- face channels: what the face rig / shaders can hook
    F.blinkL = this.blinkL; F.blinkR = Math.max(this.blinkR, clamp(P[WINK], 0, 1)); F.lidL = 1 - open / Math.max(0.07, P[EYE]); F.lidR = 1 - openR / Math.max(0.07, P[EYE]);
    F.squintL = F.squintR = sqz; F.gazeX = gzx; F.gazeY = gzy; F.pupil = P[PUPIL];
    F.browInL = F.browInR = clamp(P[BROWY] * 0.6 + P[BROW] * 0.5, -1, 1); F.browOutL = clamp(P[BROWY] + 0.6 * bra, -1, 1); F.browOutR = clamp(P[BROWY] - 0.6 * bra, -1, 1);
    F.furrow = clamp(-P[BROW], 0, 1); F.curve = P[MCURVE]; F.width = P[MWIDTH]; F.open = mo; F.tilt = P[MTILT]; F.jaw = mo;
    F.breath = P[BREATH]; F.sneer = P[SNEER]; F.pucker = P[PUCKER];
    // optional rig bones
    const xb = this.xb;
    if (xb.jaw) xb.jaw.rotation.x = mo * 0.35;
    if (xb.cheekL || xb.cheekR) {
      const mc = P[MCURVE];
      const smile = clamp(clamp((mc - 0.3) / 0.6, 0, 1) * (1 - 0.4 * mo) + (mc > 0.3 ? clamp(mo - 0.35, 0, 1) * 0.9 : 0), 0, 1);
      const pout = clamp((-mc - 1.2) / 0.4, 0, 1);
      const puff = clamp(Math.max(smile, pout * 0.85) + 0.3 * sqz, 0, 1);
      for (let c = 0; c < 2; c++) {
        const b = c === 0 ? xb.cheekL : xb.cheekR, r = this.cheekRest[c]; if (!b) continue;
        b.position.set(r.x, r.y + 0.0035 * smile + 0.001 * pout, r.z); b.scale.setScalar(1 + 0.06 * puff);
      }
    }
    if (xb.lidL) xb.lidL.rotation.x = (1 - open) * 1.2;
    if (xb.lidR) xb.lidR.rotation.x = (1 - openR) * 1.2;
  }

  _applyJiggle(P, dt) {
    const xb = this.xb, sp = this.sp;
    // toes stay flat on the ground while the heel peels up (planted feet; posed feet only when they touch the ground)
    for (let i = 0; i < 2; i++) {
      const toe = i === 0 ? xb.toeL : xb.toeR; if (!toe) continue;
      const f = this.feet[i];
      const wp = (i === 0 ? P[WPL] : P[WPR]) * this.plantW * (this.feetValid ? 1 : 0);
      const onGnd = f.planted || !f.sw ? 1 : Math.max(0, 1 - f.su * 5);
      const FO = i === 0 ? FOOTL : FOOTR, FR = i === 0 ? FOOTLR : FOOTRR;
      const posed = P[FR] * sstep(0.05, 0.005, P[FO + 1] - ANKLE_H);
      toe.rotation.x = -clamp(lerp(posed, f.pitch * onGnd, wp), 0, 0.5);
    }
    // tee hem: trails back with speed / acceleration, swings forward when braking, flares when falling, sways sideways
    if (xb.hemF || xb.hemB || xb.hem) {
      const fl = spr(sp, S_HEMP, clamp(this.kaz * 0.005 + this.gs * 0.022 * this.gaitW, -0.3, 0.3), 3.0, 0.2, dt);
      const lift = spr(sp, S_HEMV, clamp(-this.vyS * 0.018, -0.1, 0.25), 3.4, 0.25, dt);
      const lat = spr(sp, S_HEMR, clamp(-this.kax * 0.005, -0.15, 0.15), 3.0, 0.25, dt);
      const flut = 0.05 * Math.sin(TAU * 2 * this.phase + 0.7) * this.gaitW * this.runW;
      if (xb.hemF) xb.hemF.rotation.set(clamp(Math.min(0, fl) - Math.max(0, lift) - Math.max(0, flut), -0.25, 0), 0, lat);
      if (xb.hemB) xb.hemB.rotation.set(clamp(Math.max(0, fl) + Math.max(0, lift) + Math.max(0, -flut), 0, 0.25), 0, lat);
      if (xb.hem) xb.hem.rotation.set(clamp(fl, -0.25, 0.25), 0, lat);
    }
    // backpack: hangs from the straps — bottom swings back on acceleration, sways sideways, bounces with the stride
    if (xb.tank) {
      if (!this._tankRest) this._tankRest = xb.tank.position.clone();
      const bob = this.gaitW * this.runW * Math.cos(TAU * 2 * (this.phase - this.duty * 0.5));
      const ty = spr(sp, S_TKY, clamp(-this.headAcc.y * 0.001, -0.012, 0.012), 4.5, 0.22, dt);
      const rx = spr(sp, S_TKX, clamp(this.kaz * 0.0022 + 0.035 * bob - this.vyS * 0.004, -0.12, 0.12), 3.0, 0.26, dt);
      const rz = spr(sp, S_TKZ, clamp(-this.kax * 0.002 + 0.02 * Math.sin(TAU * this.phase) * this.gaitW, -0.1, 0.1), 3.0, 0.26, dt);
      xb.tank.position.set(this._tankRest.x, this._tankRest.y + ty, this._tankRest.z);
      xb.tank.rotation.set(rx, 0, rz);
    }
    // ears: perk / droop with the mood, trail head turns, flick on hits and landings, twitch now and then
    if (xb.earL || xb.earR) {
      this.earT -= dt;
      if (this.earT <= 0) { this.earT = 3 + this.rng() * 6; const e = this.rng() < 0.5 ? S_EARL : S_EARR; sp[e + 1] += this.rng() < 0.7 ? 5 : -4; }
      // left-ear convention: + perk, − droop. Under a snapback / bucket brim the ears tuck down (their tips would pierce it)
      const hat = this.style.hat, hd = hat === 3 ? -0.35 : hat === 1 ? -0.3 : 0;
      const e = clamp(P[EARS], -1, 1), base = hd + (e >= 0 ? (hd ? 0.04 : 0.2) * e : 0.3 * e);
      sp[S_EARL + 1] += (this.headRY * 1.2 - this.headRZ * 1.6) * 60 * dt; sp[S_EARR + 1] += (-this.headRY * 1.2 - this.headRZ * 1.6) * 60 * dt;
      const aL = spr(sp, S_EARL, base, 3.6, 0.2, dt), aR = spr(sp, S_EARR, base, 3.6, 0.2, dt);
      const eHi = hd ? hd + 0.08 : 0.35, eLo = hd ? hd - 0.3 : -0.45;
      if (xb.earL) xb.earL.rotation.z = clamp(aL, eLo, eHi);
      if (xb.earR) xb.earR.rotation.z = -clamp(aR, eLo, eHi);
    }
  }

  // Articulated hands (docs/RIG.md → Fingers). h: −1 fist · 0 grip (rest) · 1 relaxed · 2 open. Curl is about local Z
  // (left + opens, right mirrored); spread about local X (same sign both sides). A gripped weapon or the bomb forces 0.
  _applyFingers(P, dt) {
    const bombOn = this.bomb && this.bomb.group.visible, sp = this.sp;
    const gL = Math.max(clamp(P[IKL], 0, 1) * (1 - clamp(P[LTW], 0, 1)), bombOn ? 1 : 0);
    // micro-grip: fingers squeeze on every shot / hit and settle back (spring); an idle re-grip now and then (the
    // hand loosens a touch and closes again with a little overshoot)
    this.gripT -= dt;
    if (this.gripT <= 0) {
      this.gripT = 4.5 + this.rng() * 6;
      if (this.lifeLv === 2 && this.kidForm && !this.dance && this.wAim < 0.2 && this.gaitW < 0.3) { sp[S_GRIP + 1] -= 3.2; if (gL > 0.5 && this.rng() < 0.5) sp[S_GRIPL + 1] -= 2.6; }
    }
    const sqR = spr(sp, S_GRIP, 0, 5.2, 0.42, dt), sqL = spr(sp, S_GRIPL, 0, 5.2, 0.42, dt);
    this.handS[0] = damp(this.handS[0], clamp(lerp(P[HANDPL], 0, gL), -1, 2), 20, dt);
    this.handS[1] = damp(this.handS[1], clamp(P[HANDPR], -1, 2), 20, dt);
    for (let sd = 0; sd < 2; sd++) {
      const F = this.fing[sd]; if (!F) continue;
      const side = sd === 0 ? 1 : -1, h = this.handS[sd];
      const gq = clamp((sd === 0 ? sqL : sqR) * 0.05, -0.2, 0.14) * clamp(1 - Math.abs(h), 0, 1);   // + tighter, − looser
      const f1 = hk(h, -0.35, 0, 0.45, 0.9) - gq, f2 = hk(h, -0.5, 0, 0.35, 0.75) - gq * 1.3;
      const relaxW = clamp(h, 0, 1) * clamp(2 - h, 0, 1), openW = clamp(h - 1, 0, 1);
      const life = 0.025 * Math.sin(this.t * 0.9 + sd * 2.1) * relaxW;
      // trigger finger: the right index squeezes with the weapon's trigger blade (only while gripping)
      const trig = sd === 1 && this.weapon ? (this.weapon.trig || 0) * clamp(1 - Math.abs(h), 0, 1) : 0;
      for (let k = 0; k < 4; k++) {
        const casc = (k - 1.5) * 0.07 * relaxW; // the pinky side curls a little more than the index side
        const sq = k === 0 ? trig : 0;
        F.f1[k].rotation.set(FINGER_SPREAD[k] * (openW + 0.35 * relaxW), 0, side * (f1 - casc + life - 0.3 * sq));
        F.f2[k].rotation.set(0, 0, side * (f2 - casc * 0.8 + life * 0.5 - 0.35 * sq));
      }
      F.t1.rotation.set(hk(h, 0, 0, 0.35, 0.55), side * hk(h, -0.1, 0, 0, 0), side * hk(h, 0.12, 0, 0, 0));
      F.t2.rotation.set(0, 0, side * hk(h, 0.3, 0, -0.25, -0.5));
    }
  }

  _updateTank(dt) {
    const sp = this.sp, T = this.tank;
    // slosh driven by body acceleration (kid space), lagging and ringing like a liquid
    const tx = spr(sp, S_TANKX, clamp(this.kax * 0.004, -0.1, 0.1), 1.6, 0.14, dt);
    const tz = spr(sp, S_TANKZ, clamp(-this.kaz * 0.004, -0.1, 0.1), 1.6, 0.14, dt);
    const tl = spr(sp, S_TANKL, 0, 2.4, 0.18, dt);
    this.slosh = Math.hypot(tx, tz);
    const f = T.fill;
    f.rotation.set(clamp(tz, -0.06, 0.06), 0, clamp(tx, -0.06, 0.06));
    const lvl = Math.max(0.004, this.inkS * (1 + clamp(tl * 0.06, -0.08, 0.08)));
    f.scale.set(1 - this.slosh * 0.03, lvl * T.h, 1 - this.slosh * 0.03);
    f.visible = this.inkS > 0.005;
  }

  /** kid-space transform of a bone (walks up to this.kid; ignores bone scale). */
  _kidXform(bone, pos, quat) {
    pos.set(0, 0, 0); quat.identity();
    let o = bone;
    while (o && o !== this.kid) { pos.applyQuaternion(o.quaternion).add(o.position); quat.premultiply(o.quaternion); o = o.parent; }
    return pos;
  }

  /** Analytic two-bone IK in kid space. target = end-bone origin, pole = bend direction, endQuat = kid-space end orientation. */
  _solveLimb(L, target, pole, endQuat, weight, errSlot) {
    if (endQuat) _sEnd.copy(endQuat);
    _sT.copy(target); _sPole.copy(pole);
    this._kidXform(L.up.parent, _sP, _sQp);
    _pA.copy(L.up.position).applyQuaternion(_sQp).add(_sP);
    const a = L.a, b = L.b;
    _pD.subVectors(_sT, _pA);
    let dist = _pD.length();
    const dmin = Math.abs(a - b) + 1e-3, dmax = (a + b) * 0.9995;
    this.ikErr[errSlot] = Math.max(0, dist - dmax);
    dist = clamp(dist, dmin, dmax);
    _pD.normalize();
    const cosA = clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    _pN.copy(_sPole).addScaledVector(_pD, -_sPole.dot(_pD));
    if (_pN.lengthSq() < 1e-8) { _pN.set(0, 0, 1).addScaledVector(_pD, -_pD.z); }
    _pN.normalize();
    _pE.copy(_pA).addScaledVector(_pD, a * cosA).addScaledVector(_pN, a * sinA);
    _sT.copy(_pA).addScaledVector(_pD, dist);
    _pH.crossVectors(_pN, _pD).normalize();
    _by.copy(_pE).sub(_pA).normalize();
    _bz.crossVectors(_by, _pH);
    _m1.makeBasis(_by, _pH, _bz).multiply(L.Mu0T);
    _sQa.setFromRotationMatrix(_m1);
    _sQb.copy(_sQp).invert().multiply(_sQa);
    L.up.quaternion.slerp(_sQb, weight);
    _by.copy(_sT).sub(_pE).normalize();
    _bz.crossVectors(_by, _pH);
    _m2.makeBasis(_by, _pH, _bz).multiply(L.Mf0T);
    _sQa.setFromRotationMatrix(_m2);
    _sQp.multiply(L.up.quaternion);
    _sQb.copy(_sQp).invert().multiply(_sQa);
    L.lo.quaternion.slerp(_sQb, weight);
    if (endQuat) {
      _sQp.multiply(L.lo.quaternion);
      _sQb.copy(_sQp).invert().multiply(_sEnd);
      L.end.quaternion.slerp(_sQb, weight);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Hair: per-strand spring chains driven by head inertia (linear + angular), drag and gravity; the "into the head"
  // component of every bend is removed so strands never swing through the skull.
  // ---------------------------------------------------------------------------------------------
  _updateHair(dt) {
    const B = this.bones;
    this.model.updateWorldMatrix(true, false);
    this.kid.updateMatrix(); this.kid.matrixWorld.multiplyMatrices(this.model.matrixWorld, this.kid.matrix);
    this._kidXform(B.head, _v2, _q1);
    _v1.copy(HEAD_CTR).applyQuaternion(_q1).add(_v2);
    _v1.applyMatrix4(this.kid.matrixWorld); // head centre, world
    this.kid.matrixWorld.decompose(_v3, _q3, _v4);
    _q2.copy(_q3).multiply(_q1); // head world quat
    if (!this.headInit || dt <= 0) {
      this.headPrevPos.copy(_v1); this.headPrevVel.set(0, 0, 0); this.headVel.set(0, 0, 0); this.headPrevQuat.copy(_q2); this.headInit = true;
      if (dt <= 0) return;
    }
    _v3.subVectors(_v1, this.headPrevPos).divideScalar(dt);
    if (_v3.lengthSq() > 900) _v3.setLength(30);
    _v4.subVectors(_v3, this.headPrevVel).divideScalar(dt);
    if (_v4.length() > 34) _v4.setLength(34); // instant engine accelerations (58 m/s²) would fling the strands flat
    this.headAcc.lerp(_v4, 1 - Math.exp(-dt * 24));
    this.headVel.lerp(_v3, 1 - Math.exp(-dt * 12));
    this.headPrevPos.copy(_v1); this.headPrevVel.copy(_v3);
    // apparent gravity + air drag, in head space (delta vs. rest)
    const g = 9.8;
    _v5.set(0, -g, 0).sub(this.headAcc).addScaledVector(this.headVel, -0.55);
    _q4.copy(_q2).invert();
    _v5.applyQuaternion(_q4);
    _v5.y += g;
    // head rotation delta (local)
    _q5.copy(this.headPrevQuat).invert().multiply(_q2);
    if (_q5.w < 0) { _q5.x = -_q5.x; _q5.y = -_q5.y; _q5.z = -_q5.z; _q5.w = -_q5.w; }
    const sAng = 2 * Math.acos(clamp(_q5.w, -1, 1));
    const sn = Math.sqrt(Math.max(1e-12, 1 - _q5.w * _q5.w));
    const rx = (_q5.x / sn) * sAng, ry = (_q5.y / sn) * sAng, rz = (_q5.z / sn) * sAng;
    this.headRY = clamp(ry, -0.2, 0.2); this.headRZ = clamp(rz, -0.2, 0.2);
    this.headPrevQuat.copy(_q2);
    const t = this.t;
    const steps = Math.min(4, Math.max(1, Math.ceil(dt * 60 - 0.25))); const h = dt / steps;
    const GAIN = 0.5, GAIN1 = 0.3, GAIN2 = 0.2;
    // heavy gummy strands: ~20 % lower frequency, a touch more damping, more lag behind head turns,
    // less fling from linear acceleration, a heavier club tip that still whips through
    const HK = 0.62, HZ = 0.3, HINE = 1.15, HGK = 0.85, HCL = 0.68, HBR = 0.6;
    // idle life: a slow wave travelling down each strand + the curled tips coiling / uncoiling
    const idleL = (1 - this.gaitW) * (1 - this.wAir) * (this.kidForm ? 1 : 0), wv = TAU * 0.42 * t;
    const AX = this.hairAx, A1 = this.hairA1, A2 = this.hairA2;
    const hx = this.hx, hv = this.hv, hin = this.hairIn;
    for (let si = 0; si < this.hairMeta.length; si++) {
      const m = this.hairMeta[si];
      const ux = m.dir.x, uy = m.dir.y, uz = m.dir.z;
      let tx = uy * _v5.z - uz * _v5.y, ty = uz * _v5.x - ux * _v5.z, tz = ux * _v5.y - uy * _v5.x;
      const gk = (m.G * 0.075 * HGK) * clamp(m.len / 0.22, 0.4, 1.6);
      tx *= gk; ty *= gk * 0.3; tz *= gk;
      const tl = Math.hypot(tx, ty, tz); if (tl > 0.62) { tx *= 0.62 / tl; ty *= 0.62 / tl; tz *= 0.62 / tl; }
      // collision-free: remove the bend component that would move the strand into the head (w = dir × in)
      const ix = hin[si * 3], iy = hin[si * 3 + 1], iz = hin[si * 3 + 2];
      const wx = uy * iz - uz * iy, wy = uz * ix - ux * iz, wz = ux * iy - uy * ix;
      const ww = wx * wx + wy * wy + wz * wz;
      const breeze = HBR * (0.03 * Math.sin(t * 1.7 + si * 1.3) + 0.012 * Math.sin(t * 4.3 + si * 2.1));
      for (let k = 0; k < HAIR_SEGS; k++) {
        const i = (si * HAIR_SEGS + k) * 3;
        const gain = k === 0 ? GAIN : k === 1 ? GAIN1 : GAIN2;
        const ine = (k === 0 ? 0.55 : k === 1 ? 0.3 : 0.15) * clamp(1.2 - m.K * 0.3, 0.3, 1) * HINE;
        hx[i] -= rx * ine; hx[i + 1] -= ry * ine * 0.5; hx[i + 2] -= rz * ine;
        const K = 170 * HK * m.K * (k === 0 ? 1 : k === 1 ? 0.75 : 0.55) / clamp(m.len / 0.22, 0.6, 1.6); const D = 2 * HZ * Math.sqrt(K);
        let gx = tx * gain + breeze * 0.3, gy = ty * gain, gz = tz * gain + breeze * 0.5;
        const j = (si * (HAIR_SEGS + 1) + k) * 3;
        if (idleL > 0.01) {
          const w = idleL * 0.03 * Math.sin(wv - 0.6 * k + this.hairPh[si]) * clamp(1.6 - m.K * 0.4, 0.3, 1);
          gx += (A2[j] * 0.8 + A1[j] * 0.35) * w; gy += (A2[j + 1] * 0.8 + A1[j + 1] * 0.35) * w; gz += (A2[j + 2] * 0.8 + A1[j + 2] * 0.35) * w;
        }
        for (let n = 0; n < steps; n++) {
          hv[i] += (K * (gx - hx[i]) - D * hv[i]) * h;
          hv[i + 1] += (K * (gy - hx[i + 1]) - D * hv[i + 1]) * h;
          hv[i + 2] += (K * (gz - hx[i + 2]) - D * hv[i + 2]) * h;
          hx[i] += hv[i] * h; hx[i + 1] += hv[i + 1] * h; hx[i + 2] += hv[i + 2] * h;
        }
        if (ww > 1e-6) {
          const into = (hx[i] * wx + hx[i + 1] * wy + hx[i + 2] * wz) / ww;
          if (into > 0.05) { const e = into - 0.05; hx[i] -= wx * e; hx[i + 1] -= wy * e; hx[i + 2] -= wz * e; const vi = (hv[i] * wx + hv[i + 1] * wy + hv[i + 2] * wz) / ww; if (vi > 0) { hv[i] -= wx * vi; hv[i + 1] -= wy * vi; hv[i + 2] -= wz * vi; } }
        }
        hx[i] = clamp(hx[i], -HCL, HCL); hx[i + 1] = clamp(hx[i + 1], -HCL, HCL); hx[i + 2] = clamp(hx[i + 2], -HCL, HCL);
        // no candy-wrapper: project the twist (rotation about the segment's own axis) out, keep ±0.12 rad of it
        {
          const ax = AX[j], ay = AX[j + 1], az = AX[j + 2];
          const tw = hx[i] * ax + hx[i + 1] * ay + hx[i + 2] * az, ex = tw - clamp(tw, -0.12, 0.12);
          hx[i] -= ax * ex; hx[i + 1] -= ay * ex; hx[i + 2] -= az * ex;
          const tv = hv[i] * ax + hv[i + 1] * ay + hv[i + 2] * az; hv[i] -= ax * tv; hv[i + 1] -= ay * tv; hv[i + 2] -= az * tv;
        }
        const bone = this.hairBones[si * HAIR_SEGS + k];
        const ax = hx[i], ay = hx[i + 1], az = hx[i + 2];
        const ang = Math.hypot(ax, ay, az);
        if (ang > 1e-6) bone.quaternion.setFromAxisAngle(_v6.set(ax / ang, ay / ang, az / ang), ang); else bone.quaternion.identity();
      }
      // club-shaped tip: one more, floppier stage that keeps bending the way the last segment bends (whip follow-through)
      const tip = this.hairTips[si];
      if (tip) {
        const j = si * 3, i2 = (si * HAIR_SEGS + 2) * 3, px = this.tipX, pv = this.tipV;
        px[j] -= rx * 0.12; px[j + 1] -= ry * 0.06; px[j + 2] -= rz * 0.12;
        const K = 95 * 0.7 * m.K / clamp(m.len / 0.22, 0.6, 1.6), D = 2 * 0.24 * Math.sqrt(K);
        const jt = (si * (HAIR_SEGS + 1) + HAIR_SEGS) * 3, coil = idleL * 0.08 * Math.sin(wv * 0.95 + this.hairPh[si] * 1.7 - 1.8);
        const gx = hx[i2] * 0.45 + tx * 0.12 + breeze * 0.25 + A1[jt] * coil, gy = hx[i2 + 1] * 0.3 + ty * 0.1 + A1[jt + 1] * coil, gz = hx[i2 + 2] * 0.45 + tz * 0.12 + breeze * 0.35 + A1[jt + 2] * coil;
        for (let n = 0; n < steps; n++) {
          pv[j] += (K * (gx - px[j]) - D * pv[j]) * h; pv[j + 1] += (K * (gy - px[j + 1]) - D * pv[j + 1]) * h; pv[j + 2] += (K * (gz - px[j + 2]) - D * pv[j + 2]) * h;
          px[j] += pv[j] * h; px[j + 1] += pv[j + 1] * h; px[j + 2] += pv[j + 2] * h;
        }
        px[j] = clamp(px[j], -0.4, 0.4); px[j + 1] = clamp(px[j + 1], -0.4, 0.4); px[j + 2] = clamp(px[j + 2], -0.4, 0.4);
        { const ax = AX[jt], ay = AX[jt + 1], az = AX[jt + 2], tw = px[j] * ax + px[j + 1] * ay + px[j + 2] * az, ex = tw - clamp(tw, -0.12, 0.12); px[j] -= ax * ex; px[j + 1] -= ay * ex; px[j + 2] -= az * ex; }
        const ang = Math.hypot(px[j], px[j + 1], px[j + 2]);
        if (ang > 1e-6) tip.quaternion.setFromAxisAngle(_v6.set(px[j] / ang, px[j + 1] / ang, px[j + 2] / ang), ang); else tip.quaternion.identity();
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Squid form: transform pops, dry hops with anticipation, dolphin arcs, swim undulation, climb wiggle, blinks.
  // ---------------------------------------------------------------------------------------------
  _updateSquid(dt, s) {
    const sq = this.squid, sp = this.sp;
    if (this.sqScale <= 0.001) { this.sqInit = false; return; }
    const form = this.form === 'kid' ? (this.formPrev === 'kid' ? 'squid' : this.formPrev) : this.form;
    const t = this.t; const v = this.hs;
    this.u.uTime.value = t;
    const p = _v1, q = _q1;
    let wigAmp = 0.012, wigFreq = 9;
    let local = false;
    let sy = 1, sxz = 1;
    const airborne = !this.grounded;
    if (form === 'climb' && s.wallNormal) {
      // belly (+Z) into the wall, mantle (+Y) up the wall, wiggling side to side as it climbs
      const n = _v2.copy(s.wallNormal).normalize();
      _by.copy(UP).addScaledVector(n, -UP.dot(n));
      if (_by.lengthSq() < 1e-4) _by.set(0, 0, 1);
      _by.normalize(); _bz.copy(n).negate(); _bx.crossVectors(_by, _bz).normalize();
      _m1.makeBasis(_bx, _by, _bz); _q2.setFromRotationMatrix(_m1);
      const climbV = Math.min(1, Math.abs(this.vyS) / 5 + v / 6);
      _q3.setFromAxisAngle(_bz, Math.sin(t * 11) * 0.16 * climbV);
      _q2.premultiply(_q3);
      this.root.updateWorldMatrix(true, false);
      this.model.updateWorldMatrix(false, false);
      this.model.matrixWorld.decompose(_v3, _q3, _v4);
      q.copy(_q3).invert().multiply(_q2);
      _v5.copy(this.root.getWorldPosition(_v5)).addScaledVector(UP, 0.26 + 0.025 * Math.sin(t * 14) * climbV).addScaledVector(n, -this.climbInset - 0.07);
      _v5.addScaledVector(_bx, 0.022 * Math.sin(t * 5.5) * climbV);
      this.model.worldToLocal(p.copy(_v5));
      sy = 1 + 0.1 * climbV + 0.05 * Math.sin(t * 14) * climbV; sxz = 1 / Math.sqrt(sy);
      wigAmp = 0.014 + 0.022 * climbV; wigFreq = 10 + 8 * climbV;
      local = true;
    } else if (form === 'swim' && !airborne) {
      if (v > 0.3) this.sqYaw = dampAngle(this.sqYaw, Math.atan2(this.mdx, this.mdz), 10, dt);
      const sv = Math.min(1, v / 11);
      const und = Math.sin(t * lerp(5, 14, sv));
      this.sqRoll = damp(this.sqRoll, clamp(-this.yawRate * 0.08, -0.5, 0.5), 6, dt);
      _e1.set(Math.PI / 2 + 0.06 * und * sv, this.sqYaw + 0.1 * Math.sin(t * lerp(4, 11, sv) + 1) * sv, this.sqRoll + und * 0.12 * Math.min(1, v / 4), 'YXZ'); q.setFromEuler(_e1);
      p.set(0, -0.085 + 0.012 * Math.sin(t * 5), 0);
      _v2.set(0, -0.12, 0).applyQuaternion(q); p.add(_v2);
      sy = 1 + 0.2 * sv + 0.03 * und * sv; sxz = 1 / Math.sqrt(sy);
      wigAmp = 0.018 + 0.022 * sv; wigFreq = 12 + 8 * sv;   // the travelling arm wave reads well up to ≈ 0.04
      local = true;
    } else if (airborne && (this.hs > 3 || form === 'swim' || this.formPrev === 'climb')) {
      // dolphin arc: mantle follows the flight path (nose up rising, nose down falling), stretched along it
      const pit = Math.atan2(this.vyS, Math.max(this.hs, 0.5));
      if (v > 0.3) this.sqYaw = dampAngle(this.sqYaw, Math.atan2(this.mdx, this.mdz), 8, dt);
      _e1.set(Math.PI / 2 - pit, this.sqYaw, 0, 'YXZ'); q.setFromEuler(_e1);
      p.set(0, 0.22, 0);
      const sv = Math.min(1, Math.hypot(this.hs, this.vyS) / 10);
      sy = 1 + 0.22 * sv; sxz = 1 / Math.sqrt(sy);
      wigAmp = 0.03; wigFreq = 16;
    } else {
      // dry squid: hops (anticipation squash → stretch in the air → splat landing), or an idle bob
      let hop = 0, tilt = 0;
      if (!airborne && v > 0.25) {
        this.hopPhase += dt * (v / 0.72);
        const hp = frac(this.hopPhase);
        const k = Math.min(1, v / 1.5);
        const airU = clamp((hp - 0.14) / 0.72, 0, 1);
        hop = 0.14 * Math.sin(Math.PI * airU) * k;
        tilt = (0.3 * Math.cos(Math.PI * airU) - 0.1) * k;
        const anti = hp < 0.14 ? Math.sin(Math.PI * hp / 0.14) : 0;
        const land = hp > 0.86 ? Math.sin(Math.PI * (hp - 0.86) / 0.14) : 0;
        sy = 1 - 0.2 * anti * k + 0.16 * Math.sin(Math.PI * airU) * k - 0.16 * land * k;
        if (v > 0.3) this.sqYaw = dampAngle(this.sqYaw, Math.atan2(this.mdx, this.mdz), 10, dt);
      } else if (airborne) {
        this.hopPhase = 0;
        sy = 1 + clamp(Math.abs(this.vyS) * 0.022, 0, 0.24);
        tilt = clamp(-this.vyS * 0.03, -0.3, 0.3);
      } else {
        this.hopPhase = 0;
        sy = 1 + 0.035 * Math.sin(t * 3.1) + 0.012 * Math.sin(t * 7.3);
        this.sqYaw = dampAngle(this.sqYaw, 0, 3, dt);
      }
      const sqy = spr(sp, S_SQY, 0, 5, 0.3, dt), sqp = spr(sp, S_SQP, 0, 4, 0.35, dt);
      sy *= 1 + clamp(sqy, -0.3, 0.3);
      tilt += sqp * 0.3;
      _e1.set(tilt, this.sqYaw, 0.05 * Math.sin(t * 2.3), 'YXZ'); q.setFromEuler(_e1);
      p.set(0, 0.165 + hop, 0);
      sxz = 1 / Math.sqrt(sy);
      wigAmp = 0.014 + 0.014 * Math.min(1, v); wigFreq = 7 + 6 * Math.min(1, v);
    }
    // transform gesture (see _updateFormScales): puddle → stretch → wobble on the way in, crouch → shoot up on the way out
    sy *= this.sqSY; sxz *= this.sqSXZ;
    sq.pivot.scale.set(sxz, sy, sxz);
    if (!this.sqInit) { this.sqPos.copy(p); this.sqQuat.copy(q); this.sqInit = true; }
    const k = 1 - Math.exp(-dt * 26);
    this.sqPos.lerp(p, k); this.sqQuat.slerp(q, k);
    sq.pivot.position.copy(this.sqPos); sq.pivot.quaternion.copy(this.sqQuat);
    const pop = this.sqScale;
    this.squidRoot.scale.setScalar(Math.max(0.001, pop));
    this.squidRoot.position.set(0, 0, 0);
    this.u.uWig.value.set(wigAmp, wigFreq, clamp(v / 11, 0, 1));
    // blinks (squash the eyes about their centre)
    const bk = this.blinkK;
    sq.eyes.scale.set(1, Math.max(0.08, 1 - 0.92 * bk), 1); sq.eyes.position.y = 0.09 * (1 - sq.eyes.scale.y);
    const ghost = local && this.isLocal;
    sq.ghost.visible = ghost;
    this.mats.squid.transparent = false;
    sq.eyes.visible = !(local && !this.isLocal);
    sq.dark.visible = sq.eyes.visible;
    if (!this.kidForm) this._squidBlink(dt);
  }

  _squidBlink(dt) { this._blinkTick(dt); }

  /** Rim light inputs: in a match from the environment (sky horizon + sun colour, sun direction → view space); out of
   *  one the showcase lights its own stage, so the rim stays a faint neutral edge. CHAR_RIM scales it (0 = off). */
  _updateRim() {
    const R = this.u.uIwRim.value, Ld = this.u.uIwRimL.value, Fl = this.u.uIwFill.value, k = CHAR_RIM.k, kf = CHAR_RIM.fill;
    const sky = this.inWorld ? skyColors() : null;
    R.set(0, 0, 0, 3); Fl.setRGB(0, 0, 0);
    if (sky && G.camera) {
      const si = Math.min(1.5, (sky.sunIntensity || 2) / 2.5), n = 1 - 0.6 * (sky.night || 0);
      if (k > 0) {
        R.set((sky.horizon.r * 0.55 + sky.sun.r * 0.45 * si) * 0.32 * k * n, (sky.horizon.g * 0.55 + sky.sun.g * 0.45 * si) * 0.32 * k * n, (sky.horizon.b * 0.55 + sky.sun.b * 0.45 * si) * 0.32 * k * n, 3.2);
        Ld.copy(sky.sunDir).transformDirection(G.camera.matrixWorldInverse);
      }
      // fill: a low sun (golden hour / sunset) leaves faces in shade → more fill, tinted by the sky, luminance-normalised
      if (kf > 0) {
        const low = 1 - sstep(0.25, 0.68, sky.sunDir.y), h = sky.horizon, lum = Math.max(0.05, h.r * 0.3 + h.g * 0.59 + h.b * 0.11);
        const f = lerp(0.06, 0.25, low) * kf * n / lum;
        Fl.setRGB(lerp(h.r, lum, 0.5) * f, lerp(h.g, lum, 0.5) * f, lerp(h.b, lum, 0.5) * f);
      }
    } else if (k > 0) { R.set(0.06 * k, 0.065 * k, 0.075 * k, 3.4); Ld.set(0.3, 0.6, -0.75).normalize(); }
  }

  // ---------------------------------------------------------------------------------------------
  _updateMaterials(dt, s) {
    const t = this.t; const u = this.u;
    this._updateRim();
    const fl = s.invuln ? 0.22 * (0.5 + 0.5 * Math.sin(t * TAU * 6)) : 0;
    u.uFlash.value.setRGB(fl, fl, fl);
    const pul = 0.5 + 0.5 * Math.sin(t * TAU * 1.6);
    const gl = this.wGlow * (0.35 + 0.45 * pul);
    u.uGlow.value.copy(this.color).multiplyScalar(gl);
    const blink = this.wLow * (0.5 + 0.5 * Math.sin(t * TAU * 3.2));
    this.mats.fill.emissive.copy(this.color).multiplyScalar(0.12 + 0.9 * blink + 0.3 * this.wGlow * pul);
    if (!this.kid.visible) { const f = this.tank.fill; f.scale.y = Math.max(0.004, this.inkS) * this.tank.h; f.visible = this.inkS > 0.005; }
    const ch = this.animKind === 'charger' ? this.charge : 0;
    const full = ch >= 0.995 ? 0.5 + 0.5 * Math.sin(t * TAU * 8) : 0;
    this.mats.glow.emissiveIntensity = 0.15 + 2.6 * ch * ch + 1.5 * full + 3 * this.chargeFlash;
  }
}

export { WEAPON_KINDS };
