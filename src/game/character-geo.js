// INKWAVE — squidkid geometry: rig definition, procedural primitives and the shared (cached) meshes.
// Everything is authored in "kid space" (feet at y=0, facing +Z, character's right = -X) in the rest pose.
// Rest orientation of every bone is identity, so kid-space == bone-space up to a translation.
// Budget: the whole visible character (kid + held weapon) stays under 40k triangles; kid form ≈ 8–10 draw calls.
//
// Material contracts (see character-mats.js):
//   skin  : aEx = sub-material (0 skin · 1 nail · 2 inner ear), aHead = unit head direction for face decals
//   cloth : aEx = colour source (CS), aCloth = (part id, material class, param), uv = part coordinates
//   hair  : aTint + colour = strand data | cap flag | gear accessory (see makeHairMaterial)
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { CS, MC, PART } from './character-mats.js';

const V3 = THREE.Vector3;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gauss = (x, s) => Math.exp(-((x / s) ** 2));
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------
// Rig
// ------------------------------------------------------------------------------------------------
export const HAIR_MAX = 8;
export const HAIR_SEGS = 3;

// name, parent, rest position (kid space). Right side = -X.
const BODY_BONES = [
  ['hips', null, [0, 0.64, 0]],
  ['spine', 'hips', [0, 0.745, -0.004]],
  ['chest', 'spine', [0, 0.86, -0.01]],
  ['neck', 'chest', [0, 0.992, -0.008]],
  ['head', 'neck', [0, 1.05, -0.002]],
  ['clavL', 'chest', [0.035, 0.952, -0.012]],
  ['uArmL', 'clavL', [0.146, 0.946, -0.014]],
  ['fArmL', 'uArmL', [0.17, 0.736, -0.022]],
  ['handL', 'fArmL', [0.184, 0.542, -0.006]],
  ['clavR', 'chest', [-0.035, 0.952, -0.012]],
  ['uArmR', 'clavR', [-0.146, 0.946, -0.014]],
  ['fArmR', 'uArmR', [-0.17, 0.736, -0.022]],
  ['handR', 'fArmR', [-0.184, 0.542, -0.006]],
  ['thighL', 'hips', [0.078, 0.622, 0]],
  ['shinL', 'thighL', [0.081, 0.347, 0.012]],
  ['footL', 'shinL', [0.084, 0.085, -0.01]],
  ['thighR', 'hips', [-0.078, 0.622, 0]],
  ['shinR', 'thighR', [-0.081, 0.347, 0.012]],
  ['footR', 'shinR', [-0.084, 0.085, -0.01]],
  ['eyeL', 'head', [0, 0, 0]],
  ['eyeR', 'head', [0, 0, 0]],
  ['browL', 'head', [0, 0, 0]],
  ['browR', 'head', [0, 0, 0]],
  ['mouth', 'head', [0, 0, 0]],
  ['mouthO', 'head', [0, 0, 0]],
];
const REST_BODY = {};
for (const [n, , p] of BODY_BONES) REST_BODY[n] = new V3(...p);

// ---- hand design (canonical LEFT hand, wrist-relative; palm faces -X, thumb +Z, fingers -Y) ----
// The fingers wrap a Ø ≈ 3.2 cm handle whose axis runs along hand Z through GRIP_HOLE (the weapon grip point).
export const HAND = {
  hole: new V3(-0.0255, -0.0525, 0.0), // grip-hole axis point, LEFT hand (mirror X for the right hand)
  holeR: 0.014,                        // handle radius the fist is shaped around (Ø 2.8 cm)
  palmX: -0.0112,                      // palm (inner) surface
};
const FINGERS = [
  // name, MCP [x,y,z], radius, [proximal, middle, distal] lengths
  ['index', [0.0005, -0.0585, 0.0183], 0.0077, [0.0215, 0.0135, 0.0122]],
  ['middle', [0.0, -0.0605, 0.0058], 0.0081, [0.0235, 0.0145, 0.013]],
  ['ring', [0.0, -0.0592, -0.0063], 0.0076, [0.022, 0.0138, 0.0122]],
  ['pinky', [0.0012, -0.0558, -0.0178], 0.0066, [0.0178, 0.011, 0.0106]],
];
/** Finger joint chain (canonical left hand, wrist-relative) wrapping the grip circle. */
function fingerChain(mcp, r, lens) {
  const H = HAND.hole, rho = HAND.holeR + r * 0.98;
  // work in (a = -x, y) — the palm-direction plane; wrap counter-clockwise (under the handle, up the far side)
  const ca = -H.x, cy = H.y;
  const M = { a: -mcp[0], y: mcp[1] };
  const dM = Math.hypot(M.a - ca, M.y - cy);
  const phM = Math.atan2(M.y - cy, M.a - ca);
  const cosD = clamp((rho * rho + dM * dM - lens[0] * lens[0]) / (2 * rho * dM), -1, 1);
  let ph = phM + Math.acos(cosD);
  const pts = [new V3(mcp[0], mcp[1], mcp[2])];
  const at = (phi) => new V3(-(ca + rho * Math.cos(phi)), cy + rho * Math.sin(phi), mcp[2]);
  pts.push(at(ph));
  for (let k = 1; k < 3; k++) { ph += 2 * Math.asin(clamp(lens[k] / (2 * rho), -1, 1)); pts.push(at(ph)); }
  return pts; // [MCP, PIP, DIP, tip]
}
const THUMB = [[-0.0058, -0.0142, 0.0148], [-0.0158, -0.0272, 0.0252], [-0.0282, -0.0322, 0.0272], [-0.0372, -0.0438, 0.0238]];
const THUMB_R = [0.0106, 0.0089, 0.0083];

// extra bones (appended after the hair bones so existing indices never move)
/** Finger bone name: hand{L|R}_{thumb|index|middle|ring|pinky}{1|2} (1 = knuckle, 2 = middle joint). */
export const fb = (s, finger, k) => `hand${s}_${finger}${k}`;
const EXTRA_BONES = [];
for (const [s, sx] of [['L', 1], ['R', -1]]) {
  const W = REST_BODY['hand' + s];
  const m = (p) => new V3(p[0] * sx, p[1], p[2]).add(W);
  EXTRA_BONES.push([fb(s, 'thumb', 1), 'hand' + s, m(THUMB[0])], [fb(s, 'thumb', 2), fb(s, 'thumb', 1), m(THUMB[1])]);
  for (const [fn, mcp, r, lens] of FINGERS) {
    const ch = fingerChain(mcp, r, lens);
    EXTRA_BONES.push([fb(s, fn, 1), 'hand' + s, m([ch[0].x, ch[0].y, ch[0].z])], [fb(s, fn, 2), fb(s, fn, 1), m([ch[1].x, ch[1].y, ch[1].z])]);
  }
  const F = REST_BODY['foot' + s];
  EXTRA_BONES.push(['toe' + s, 'foot' + s, new V3(F.x, 0.028, F.z + 0.1)]);
}
EXTRA_BONES.push(['jaw', 'head', null], ['cheekL', 'head', null], ['cheekR', 'head', null], ['earL', 'head', null], ['earR', 'head', null]);
EXTRA_BONES.push(['hemF', 'hips', new V3(0, 0.712, 0.082)], ['hemB', 'hips', new V3(0, 0.712, -0.1)]);
EXTRA_BONES.push(['tank', 'chest', new V3(0, 0.848, -0.176)]);
for (let s = 0; s < HAIR_MAX; s++) EXTRA_BONES.push([`hairTip${s}`, `hair${s}_2`, null]);

export const BONE_NAMES = BODY_BONES.map((b) => b[0]);
for (let s = 0; s < HAIR_MAX; s++) for (let k = 0; k < HAIR_SEGS; k++) BONE_NAMES.push(`hair${s}_${k}`);
for (const [n] of EXTRA_BONES) BONE_NAMES.push(n);
export const BONE_INDEX = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));
export const BONE_PARENT = {};
for (const [n, p] of BODY_BONES) BONE_PARENT[n] = p;
for (let s = 0; s < HAIR_MAX; s++) for (let k = 0; k < HAIR_SEGS; k++) BONE_PARENT[`hair${s}_${k}`] = k === 0 ? 'head' : `hair${s}_${k - 1}`;
for (const [n, p] of EXTRA_BONES) BONE_PARENT[n] = p;
for (const [n, , p] of EXTRA_BONES) if (p) REST_BODY[n] = p.clone();
/** Names of the bones beyond the core skeleton (see docs/RIG.md → Added bones). */

// ------------------------------------------------------------------------------------------------
// Head surface (analytic, so face decals and hair hug it exactly)
// ------------------------------------------------------------------------------------------------
export const HEAD_C = new V3(0, 1.214, 0.012);
const HR = { x: 0.178, y: 0.176, z: 0.165 };

/** Sculpted head: unit direction (dx,dy,dz) → surface point relative to HEAD_C. */
function headShape(dx, dy, dz, out) {
  let x = dx * HR.x, y = dy * HR.y, z = dz * HR.z;
  if (dy < 0) {
    const k = Math.pow(-dy, 1.3);
    x *= 1 - 0.235 * k;
    if (dz > 0) z *= 1 - 0.04 * k;
    y *= 1 - 0.03 * k;
  }
  if (dz < 0) z *= 1 + 0.06 * -dz * (1 - Math.abs(dy));       // fuller back of the skull
  if (dy > 0) y *= 1 - 0.045 * dy * dy;                        // slightly flattened crown
  const az = Math.atan2(dx, dz), el = Math.asin(clamp(dy, -1, 1));
  const aa = Math.abs(az);
  let off = 0;
  off += 0.0088 * Math.exp(-(((aa - 0.6) / 0.36) ** 2) - (((el + 0.31) / 0.22) ** 2));   // cheeks
  off += 0.0058 * Math.exp(-((az / 0.24) ** 2) - (((el + 0.84) / 0.15) ** 2));           // chin
  off += 0.0056 * Math.exp(-((az / 0.058) ** 2) - (((el + 0.128) / 0.064) ** 2));        // nose
  off += 0.0012 * Math.exp(-((az / 0.1) ** 2) - (((el + 0.06) / 0.07) ** 2));            // nose bridge
  off -= 0.0032 * Math.exp(-((az / 0.55) ** 2) - (((el - 0.14) / 0.2) ** 2));            // mask plane
  off -= 0.0034 * Math.exp(-(((aa - 1.15) / 0.25) ** 2) - (((el - 0.25) / 0.2) ** 2));   // temples
  off += 0.0018 * Math.exp(-((az / 0.5) ** 2) - (((el - 0.4) / 0.1) ** 2));              // soft brow
  off -= 0.0025 * Math.exp(-((az / 0.16) ** 2) - (((el + 0.6) / 0.06) ** 2));            // under-lip dip
  const r = Math.hypot(x, y, z);
  return out.set(x, y, z).multiplyScalar((r + off) / r);
}
const _hd = new V3(), _h0 = new V3(), _h1 = new V3(), _h2 = new V3(), _ha = new V3(), _hb = new V3();
function dirAE(az, el, out) { const c = Math.cos(el); return out.set(Math.sin(az) * c, Math.sin(el), Math.cos(az) * c); }
/** Point on the head surface (kid space) at azimuth/elevation (az=0 front, +az toward +X/left), offset along the normal. */
export function headSurf(az, el, off, out, nOut) {
  dirAE(az, el, _hd); headShape(_hd.x, _hd.y, _hd.z, _h0);
  const e = clamp(el, -1.555, 1.555);
  dirAE(az + 1e-3, e, _hd); headShape(_hd.x, _hd.y, _hd.z, _h1);
  dirAE(az, e + 1e-3, _hd); headShape(_hd.x, _hd.y, _hd.z, _h2);
  dirAE(az, e, _hd); headShape(_hd.x, _hd.y, _hd.z, _ha);
  _h1.sub(_ha); _h2.sub(_ha);
  _hb.crossVectors(_h1, _h2).normalize();
  if (Math.abs(el) > 1.55) _hb.set(0, Math.sign(el), 0);
  if (nOut) nOut.copy(_hb);
  return out.copy(_h0).addScaledVector(_hb, off).add(HEAD_C);
}

// Scalp (hair cap): hairline elevation as a function of azimuth.
function hairline(az) {
  const a = Math.abs(az) / Math.PI;
  let h = lerp(0.58, 0.3, sstep(0.1, 0.42, a));
  h = lerp(h, -0.8, sstep(0.5, 0.96, a));
  return h;
}
/** Hair-cap thickness above the skin at (az, el) (full volume; the rolled lip is added by the cap builder). */
export function capOffset(az, el) {
  const back = Math.max(0, -Math.cos(az));
  return 0.0075 + 0.003 * sstep(0.45, 1.0, el) + 0.0135 * back * sstep(-0.7, 0.4, el) + 0.0025 * sstep(0.8, 1.4, el);
}

export const EYE = { az: 0.355, el: 0.14, daz: 0.172, del: 0.222, tilt: 0.1 };
export const MOUTH = { el: -0.45, halfAz: 0.11 };
export const BROW = { az0: 0.19, az1: 0.54, el: 0.455 };
const EAR = { az: 1.5, el: -0.035 };

// face bone rest positions (derived from the head surface; see docs/RIG.md)
headSurf(EYE.az, EYE.el, 0.0022, REST_BODY.eyeL);
headSurf(-EYE.az, EYE.el, 0.0022, REST_BODY.eyeR);
headSurf((BROW.az0 + BROW.az1) / 2, BROW.el + 0.03, 0.002, REST_BODY.browL);
headSurf(-(BROW.az0 + BROW.az1) / 2, BROW.el + 0.03, 0.002, REST_BODY.browR);
headSurf(0, MOUTH.el, 0.002, REST_BODY.mouth);
headSurf(0, MOUTH.el - 0.02, 0.0005, REST_BODY.mouthO);
REST_BODY.jaw = HEAD_C.clone().add(new V3(0, -0.035, -0.035));
REST_BODY.cheekL = headSurf(0.6, -0.31, -0.02, new V3());
REST_BODY.cheekR = headSurf(-0.6, -0.31, -0.02, new V3());
REST_BODY.earL = headSurf(EAR.az, EAR.el, -0.006, new V3());
REST_BODY.earR = headSurf(-EAR.az, EAR.el, -0.006, new V3());

// ------------------------------------------------------------------------------------------------
// Primitive helpers
// ------------------------------------------------------------------------------------------------
function finalize(geo) {
  geo.deleteAttribute('uv');
  if (geo.attributes.normal) geo.deleteAttribute('normal');
  const g = mergeVertices(geo, 1e-6);
  g.computeVertexNormals();
  return g;
}
function flipWinding(g) { const ix = g.index.array; for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; } g.computeVertexNormals(); }
function signedPow(v, e) { return Math.sign(v) * Math.pow(Math.abs(v), e); }
/** Mirror a geometry across X (fixes winding + normals). Keeps custom attributes. */
function mirrorX(g) {
  g.scale(-1, 1, 1);
  const ix = g.index.array; for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
  const n = g.attributes.normal; if (n) for (let i = 0; i < n.count; i++) n.setX(i, -n.getX(i));
  return g;
}

/** Super-ellipsoid (chunky rounded box/pill). e1: vertical squareness, e2: horizontal squareness (<1 boxier). */
export function superEllipsoid(rx, ry, rz, e1 = 1, e2 = 1, ws = 18, hs = 12, deform = null) {
  const g = finalize(new THREE.SphereGeometry(1, ws, hs));
  const p = g.attributes.position; const v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ce = Math.hypot(v.x, v.z);
    const cw = ce > 1e-9 ? v.x / ce : 1, sw = ce > 1e-9 ? v.z / ce : 0;
    v.set(signedPow(ce, e1) * signedPow(cw, e2) * rx, signedPow(v.y, e1) * ry, signedPow(ce, e1) * signedPow(sw, e2) * rz);
    if (deform) deform(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Lathe around +Y from [r, y] profile, optional per-vertex deform(v). */
export function lathe(profile, seg = 24, deform = null) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y));
  const g = finalize(new THREE.LatheGeometry(pts, seg));
  {
    const p = g.attributes.position, n = g.attributes.normal; let acc = 0;
    for (let i = 0; i < p.count; i++) acc += n.getX(i) * p.getX(i) + n.getZ(i) * p.getZ(i);
    if (acc < 0) flipWinding(g);
  }
  if (deform) {
    const p = g.attributes.position; const v = new V3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); deform(v); p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals();
  }
  return g;
}

/** Smooth a sparse [r,y] profile with a Catmull-Rom so lathes have no visible kinks. */
export function smoothProfile(ctrl, n = 20) {
  const c = new THREE.SplineCurve(ctrl.map(([r, y]) => new THREE.Vector2(r, y)));
  return c.getSpacedPoints(n).map((p) => [p.x, p.y]);
}

/** Orient a geometry built along -Y (hanging) so it points along `dir`, then place at `at`. */
export function alongAxis(geo, at, dir) {
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, -1, 0), dir.clone().normalize());
  geo.applyQuaternion(q); geo.translate(at.x, at.y, at.z);
  return geo;
}

/**
 * Sweep a variable-radius, optionally flattened tube along a Catmull-Rom curve with rounded end caps.
 * Returns { geo, t, cs, sn, sample(t), curve } — t = per-vertex curve param, cs/sn = cos/sin of the ring angle.
 * opts.section(c, s, t) → [c', s'] reshapes the unit cross-section (e.g. a keel).
 */
export function sweep(points, opts = {}) {
  const seg = opts.seg ?? 16, radial = opts.radial ?? 10;
  const radius = opts.radius ?? (() => 0.03);
  const flatFn = typeof opts.flat === 'function' ? opts.flat : (() => opts.flat ?? 1);
  const capSteps = opts.capSteps ?? 3;
  const section = opts.section || null;
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p.clone() : new V3(...p))), false, opts.curveType || 'centripetal');
  const frames = curve.computeFrenetFrames(seg, false);
  const pos = [], tt = [], cs = [], sn = [], idx = [];
  const P = new V3(), o = new V3(), b = new V3(), T = new V3(), tmp = new V3();
  // opts.transport: carry the cross-section frame along the curve (no flips where the outward hint turns parallel
  // to the tangent, e.g. curled tentacle tips), gently biased back toward the outward hint where it is well defined.
  let oFrames = null;
  if (opts.transport && opts.outward) {
    oFrames = []; const prev = new V3(), hint = new V3(), Pt = new V3();
    for (let i = 0; i <= seg; i++) {
      const t = i / seg; curve.getPointAt(t, Pt); const Ti = frames.tangents[i];
      opts.outward(Pt, hint, t); hint.addScaledVector(Ti, -hint.dot(Ti));
      const hl = hint.length();
      let oi;
      if (i === 0 || hl < 1e-6) oi = hl > 1e-6 ? hint.clone().normalize() : frames.normals[i].clone();
      else {
        oi = prev.clone().addScaledVector(Ti, -prev.dot(Ti)).normalize();
        const w = 0.22 * hl * hl;                               // hint weight fades where it becomes unreliable
        oi.lerp(hint.multiplyScalar(1 / hl), w).normalize();
      }
      prev.copy(oi); oFrames.push(oi);
    }
  }
  const frameAt = (i) => {
    const t = i / seg;
    curve.getPointAt(t, P); T.copy(frames.tangents[i]);
    if (oFrames) o.copy(oFrames[i]);
    else if (opts.outward) opts.outward(P, o, t); else o.copy(frames.normals[i]);
    o.addScaledVector(T, -o.dot(T));
    if (o.lengthSq() < 1e-8) o.copy(frames.normals[i]);
    o.normalize();
    b.crossVectors(T, o).normalize();
    return t;
  };
  const twistFn = opts.twist || null;
  const ring = (center, r, t) => {
    const flat = flatFn(t);
    const tw = twistFn ? twistFn(t) : 0, ct = Math.cos(tw), st = Math.sin(tw);
    for (let k = 0; k < radial; k++) {
      const th = (k / radial) * Math.PI * 2; let c = Math.cos(th), s = Math.sin(th);
      if (section) [c, s] = section(c, s, t);
      const xo = c * r * flat, xb = s * r;
      tmp.copy(center).addScaledVector(o, xo * ct - xb * st).addScaledVector(b, xo * st + xb * ct);
      pos.push(tmp.x, tmp.y, tmp.z); tt.push(t); cs.push(Math.cos(th)); sn.push(Math.sin(th));
    }
  };
  const hasStart = opts.capStart !== false, hasEnd = opts.capEnd !== false;
  let rings = 0;
  frameAt(0);
  const r0 = radius(0);
  if (hasStart) {
    tmp.copy(P).addScaledVector(T, -r0 * 0.9); pos.push(tmp.x, tmp.y, tmp.z); tt.push(0); cs.push(1); sn.push(0);
    for (let j = 1; j < capSteps; j++) { const a = (j / capSteps) * Math.PI * 0.5; ring(P.clone().addScaledVector(T, -r0 * 0.9 * Math.cos(a)), r0 * Math.sin(a), 0); rings++; }
  }
  for (let i = 0; i <= seg; i++) { const t = frameAt(i); ring(P, radius(t), t); rings++; }
  const r1 = radius(1);
  if (hasEnd) {
    for (let j = 1; j < capSteps; j++) { const a = (j / capSteps) * Math.PI * 0.5; ring(P.clone().addScaledVector(T, r1 * 1.05 * Math.sin(a)), r1 * Math.cos(a), 1); rings++; }
    tmp.copy(P).addScaledVector(T, r1 * 1.05); pos.push(tmp.x, tmp.y, tmp.z); tt.push(1); cs.push(1); sn.push(0);
  }
  const ringBase = (r) => (hasStart ? 1 : 0) + r * radial;
  for (let r = 0; r < rings - 1; r++) {
    const a0 = ringBase(r), a1 = ringBase(r + 1);
    for (let k = 0; k < radial; k++) { const k1 = (k + 1) % radial; idx.push(a0 + k, a1 + k1, a1 + k, a0 + k, a0 + k1, a1 + k1); }
  }
  if (hasStart) for (let k = 0; k < radial; k++) idx.push(0, 1 + ((k + 1) % radial), 1 + k);
  if (hasEnd) { const tip = pos.length / 3 - 1, last = ringBase(rings - 1); for (let k = 0; k < radial; k++) idx.push(last + k, last + ((k + 1) % radial), tip); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const sample = (t) => { const i = clamp(Math.round(t * seg), 0, seg); frameAt(i); return { P: P.clone(), T: T.clone(), o: o.clone(), b: b.clone(), r: radius(t) }; };
  return { geo, t: new Float32Array(tt), cs: new Float32Array(cs), sn: new Float32Array(sn), sample, curve };
}

/** Grid over (u,v) in [0,1]^2 → fn(u, v, outPos); indexed, merged, smooth normals. */
/**
 * Structured grid with explicit rows: rows[j] = array of V3 (all rows the same length nu).
 * wrapU closes the ring (seam normals averaged, seam column duplicated so uv stays continuous).
 * uv(i, j) → [u, v] (defaults to i/nu, j/(rows-1)). outward: V3 hint point (normals face away from it) or fn.
 * skip(i, j) → true drops quad (i,j). poles: { start: V3?, end: V3? } fans the first/last row to a point.
 */
function gridGeo(rows, opt = {}) {
  const nv = rows.length - 1, nu = rows[0].length;
  const wrap = opt.wrapU !== false;
  const qu = wrap ? nu : nu - 1;
  const uvFn = opt.uv || ((i, j) => [i / (wrap ? nu : nu - 1), j / nv]);
  const skip = opt.skip || null;
  // topology on the unduplicated grid (for normals)
  const P = []; for (const r of rows) for (const p of r) P.push(p);
  const quads = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < qu; i++) { if (skip && skip(i, j)) continue; quads.push([i, j]); }
  const vid = (i, j) => j * nu + (i % nu);
  const N = P.map(() => new V3());
  const e1 = new V3(), e2 = new V3(), fn = new V3();
  const addTri = (a, b, c) => { e1.subVectors(P[b], P[a]); e2.subVectors(P[c], P[a]); fn.crossVectors(e1, e2); N[a].add(fn); N[b].add(fn); N[c].add(fn); };
  for (const [i, j] of quads) { const a = vid(i, j), b = vid(i + 1, j), c = vid(i + 1, j + 1), d = vid(i, j + 1); addTri(a, b, c); addTri(a, c, d); }
  const poleS = opt.poles?.start, poleE = opt.poles?.end;
  if (poleS) { const ps = P.length; P.push(poleS); N.push(new V3()); for (let i = 0; i < qu; i++) addTri(ps, vid(i + 1, 0), vid(i, 0)); }
  if (poleE) { const pe = P.length; P.push(poleE); N.push(new V3()); for (let i = 0; i < qu; i++) addTri(vid(i, nv), vid(i + 1, nv), pe); }
  // orientation: flip if normals point toward the hint
  let flip = !!opt.flip;
  if (opt.outward) {
    let acc = 0; const c = new V3();
    for (let k = 0; k < P.length; k++) { if (typeof opt.outward === 'function') opt.outward(P[k], c); else c.copy(opt.outward); acc += N[k].dot(e1.subVectors(P[k], c)); }
    flip = acc < 0;
  }
  for (const n of N) { if (flip) n.negate(); n.normalize(); }
  // output (duplicate the seam column when wrapping)
  const oc = wrap ? nu + 1 : nu;
  const pos = [], nrm = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i < oc; i++) { const k = vid(i, j); pos.push(P[k].x, P[k].y, P[k].z); nrm.push(N[k].x, N[k].y, N[k].z); uv.push(...uvFn(i, j)); }
  const o = (i, j) => j * oc + i;
  const tri = (a, b, c) => { if (flip) idx.push(a, c, b); else idx.push(a, b, c); };
  for (const [i, j] of quads) { const a = o(i, j), b = o(i + 1, j), c = o(i + 1, j + 1), d = o(i, j + 1); tri(a, b, c); tri(a, c, d); }
  const base = pos.length / 3;
  let extra = 0;
  if (poleS) { const k = P.length - (poleE ? 2 : 1); pos.push(P[k].x, P[k].y, P[k].z); nrm.push(N[k].x, N[k].y, N[k].z); uv.push(...(opt.poleUv?.start || [0.5, 0])); for (let i = 0; i < qu; i++) tri(base, o(i + 1, 0), o(i, 0)); extra++; }
  if (poleE) { const k = P.length - 1; pos.push(P[k].x, P[k].y, P[k].z); nrm.push(N[k].x, N[k].y, N[k].z); uv.push(...(opt.poleUv?.end || [0.5, 1])); for (let i = 0; i < qu; i++) tri(o(i, nv), o(i + 1, nv), base + extra); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Samples on [lo, hi] distributed with density rho(x) (n+1 values, ends included). */
function densitySamples(n, lo, hi, rho, steps = 3000) {
  const cum = new Float64Array(steps + 1); const h = (hi - lo) / steps;
  for (let i = 0; i < steps; i++) cum[i + 1] = cum[i] + rho(lo + (i + 0.5) * h) * h;
  const out = []; let j = 0; const tot = cum[steps];
  for (let k = 0; k <= n; k++) {
    const target = (k / n) * tot;
    while (j < steps - 1 && cum[j + 1] < target) j++;
    const f = (target - cum[j]) / Math.max(1e-12, cum[j + 1] - cum[j]);
    out.push(lo + (j + clamp(f, 0, 1)) * h);
  }
  return out;
}

/** Elliptical dome patch on a polar grid: fn(u, v in [-1,1], r, outPos). Keeps uv = (u, v). */
function polarPatch(rings, segs, fn) {
  const pos = [], uv = [], idx = []; const p = new V3();
  fn(0, 0, 0, p); pos.push(p.x, p.y, p.z); uv.push(0, 0);
  for (let r = 1; r <= rings; r++) {
    const rr = r / rings;
    for (let s = 0; s < segs; s++) { const th = (s / segs) * Math.PI * 2; const u = Math.cos(th) * rr, v = Math.sin(th) * rr; fn(u, v, rr, p); pos.push(p.x, p.y, p.z); uv.push(u, v); }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segs));
  for (let r = 1; r < rings; r++) { const a0 = 1 + (r - 1) * segs, a1 = 1 + r * segs; for (let s = 0; s < segs; s++) { const s1 = (s + 1) % segs; idx.push(a0 + s, a1 + s, a1 + s1, a0 + s, a1 + s1, a0 + s1); } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function torus(R, r, rs, ts, arc = Math.PI * 2) { return finalize(new THREE.TorusGeometry(R, r, rs, ts, arc)); }
/** Superellipse ring point: theta 0 = +Z (front), pi/2 = +X. */
function seRing(th, a, b, n, out, cx = 0, cz = 0) {
  const s = Math.sin(th), c = Math.cos(th);
  return out.set(cx + a * signedPow(s, 2 / n), 0, cz + b * signedPow(c, 2 / n));
}
/** Catmull-Rom interpolation of a keyed table: keys = [x0..], vals = [v0..] (non-uniform keys, clamped). */
function interpTable(keys, vals, x) {
  const n = keys.length;
  if (x <= keys[0]) return vals[0];
  if (x >= keys[n - 1]) return vals[n - 1];
  let i = 0; while (i < n - 2 && x > keys[i + 1]) i++;
  const t = (x - keys[i]) / (keys[i + 1] - keys[i]);
  const p0 = vals[Math.max(0, i - 1)], p1 = vals[i], p2 = vals[i + 1], p3 = vals[Math.min(n - 1, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// ------------------------------------------------------------------------------------------------
// Builder: concatenates parts with skin weights + per-vertex extras into one skinned geometry.
// ------------------------------------------------------------------------------------------------
const _c = new THREE.Color();
class Builder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.si = []; this.sw = []; this.ex = []; this.v3 = []; this.idx = []; }
  /** o.bone | o.weights(p,i) -> [[name,w],..] ; o.color: hex|Color|fn(p,i)->Color ; o.ex: number|fn ; o.uv: bool|fn(i)->[u,v] ; o.v3: fn(p,i)->[x,y,z] | [x,y,z] */
  add(geo, o = {}) {
    const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv;
    const base = this.pos.length / 3; const p = new V3();
    const fixedCol = typeof o.color === 'function' ? null : _c.set(o.color ?? 0xffffff).clone();
    const fixedV3 = Array.isArray(o.v3) ? o.v3 : null;
    const boneIdx = BONE_INDEX[o.bone || 'hips'];
    const selW = [0, 0, 0, 0], selB = [null, null, null, null];
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i);
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(N.getX(i), N.getY(i), N.getZ(i));
      if (typeof o.uv === 'function') this.uv.push(...o.uv(i, p)); else if (o.uv && UV) this.uv.push(UV.getX(i), UV.getY(i)); else this.uv.push(0, 0);
      const c = fixedCol || o.color(p, i);
      this.col.push(c.r, c.g, c.b);
      this.ex.push(typeof o.ex === 'function' ? o.ex(p, i) : (o.ex ?? 0));
      if (fixedV3) this.v3.push(fixedV3[0], fixedV3[1], fixedV3[2]); else if (o.v3) this.v3.push(...o.v3(p, i)); else this.v3.push(0, 0, 0);
      if (!o.weights) { this.si.push(boneIdx, 0, 0, 0); this.sw.push(1, 0, 0, 0); continue; }
      // top-4 influences without per-vertex filter/sort allocations
      const w = o.weights(p, i);
      let n = 0;
      for (let e = 0; e < w.length; e++) {
        const we = w[e][1]; if (!(we > 1e-4)) continue;
        let k = n < 4 ? n++ : 4;
        if (k === 4) { if (we <= selW[3]) continue; k = 3; }
        while (k > 0 && selW[k - 1] < we) { selW[k] = selW[k - 1]; selB[k] = selB[k - 1]; k--; }
        selW[k] = we; selB[k] = w[e][0];
      }
      let sum = 0; for (let k = 0; k < n; k++) sum += selW[k];
      if (n === 0 || sum <= 0) { this.si.push(boneIdx, 0, 0, 0); this.sw.push(1, 0, 0, 0); continue; }
      for (let k = 0; k < 4; k++) { if (k < n) { this.si.push(BONE_INDEX[selB[k]]); this.sw.push(selW[k] / sum); } else { this.si.push(0); this.sw.push(0); } }
    }
    if (geo.index) { const ix = geo.index.array; for (let i = 0; i < ix.length; i++) this.idx.push(ix[i] + base); }
    else for (let i = 0; i < P.count; i++) this.idx.push(i + base);
    return this;
  }
  build(extraName = 'aEx', v3Name = null) {
    const g = new THREE.BufferGeometry();
    if (v3Name) g.setAttribute(v3Name, new THREE.Float32BufferAttribute(this.v3, 3));
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute(extraName, new THREE.Float32BufferAttribute(this.ex, 1));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.boundingSphere = new THREE.Sphere(new V3(0, 0.75, 0), 1.3);
    return g;
  }
}

/** Legacy slot names (colour sources) kept for compatibility. */
export const SLOT = { plain: CS.white, team: CS.team, shirt: CS.shirt, shorts: CS.shorts, shoe: CS.shoe, sock: CS.sock, sole: CS.sole, strap: CS.strap };

// ------------------------------------------------------------------------------------------------
// Kid: skin (head, ears, neck, arms, hands, legs)
// ------------------------------------------------------------------------------------------------
const R = REST_BODY;

function limbWeights(A, B, C, names, lo, hi, loW = -0.012, hiW = 0.012) {
  const up = B.clone().sub(A).normalize(), dn = C.clone().sub(B).normalize();
  return (p) => {
    const s1 = (p.x - B.x) * up.x + (p.y - B.y) * up.y + (p.z - B.z) * up.z;
    const w1 = sstep(lo, hi, s1);
    const s2 = (p.x - C.x) * dn.x + (p.y - C.y) * dn.y + (p.z - C.z) * dn.z;
    const w2 = sstep(loW, hiW, s2);
    return [[names[0], 1 - w1], [names[1], w1 * (1 - w2)], [names[2], w1 * w2]];
  };
}

// stylised kid arm (t: sleeve hem ≈ 0.21, elbow ≈ 0.485, wrist ≈ 0.955)
const ARM_RADIUS = (t) => interpTable([0, 0.1, 0.21, 0.36, 0.46, 0.5, 0.58, 0.68, 0.8, 0.9, 0.96, 1],
  [0.0368, 0.0385, 0.0356, 0.0322, 0.0292, 0.029, 0.0318, 0.0302, 0.0264, 0.0236, 0.0226, 0.0228], t);
const ARM_FLAT = (t) => lerp(1, 0.82, sstep(0.72, 0.98, t));

/** Head: lat-long grid with face-weighted density; the region fully under the hair cap is not emitted. */
function buildHeadGeo() {
  const nAz = 64, nEl = 40;
  const azs = densitySamples(nAz, -Math.PI, Math.PI, (a) => 1 + 2.4 * gauss(a, 0.78) + 0.8 * gauss(Math.abs(a) - EAR.az, 0.32));
  azs.pop();
  const els = densitySamples(nEl, -1.5, 1.5, (e) => 0.45 + 1.8 * gauss(e + 0.22, 0.56) + 0.5 * gauss(e - 0.48, 0.22));
  const d = new V3();
  const rows = els.map((el) => azs.map((az) => { dirAE(az, el, d); return headShape(d.x, d.y, d.z, new V3()).add(HEAD_C); }));
  const covered = (az, el) => el > hairline(az) + 0.22;
  const geo = gridGeo(rows, {
    wrapU: true, outward: HEAD_C,
    uv: (i, j) => [azs[i % nAz], els[j]],
    skip: (i, j) => covered(azs[i], els[j]) && covered(azs[(i + 1) % nAz], els[j]),
  });
  return geo;
}

function buildEarGeo(sx) {
  const root = headSurf(sx * EAR.az, EAR.el, -0.0085, new V3());
  const A = new V3(sx * 0.63, 0.43, -0.65).normalize();                 // ear axis: out, up, back
  const F = new V3(sx * 0.46, 0.1, 0.88); F.addScaledVector(A, -F.dot(A)).normalize(); // concha faces forward-out
  const W = new V3().crossVectors(A, F).normalize();
  const L = 0.106, nU = 18, nTh = 16;
  const rows = [], meta = [];
  const C = new V3();
  for (let j = 0; j <= nU; j++) {
    const u = j / nU;
    C.copy(root).addScaledVector(A, u * L).addScaledVector(F, -0.011 * u * u).addScaledVector(W, 0.004 * Math.sin(Math.PI * u));
    const w = 0.0268 * Math.pow(1 - u, 0.8) * sstep(-0.4, 0.28, u) + 0.0011;
    const t = 0.0075 * (1 - 0.55 * u) + 0.0009;
    const dent = 0.62 * t * sstep(0.1, 0.34, u) * sstep(0.94, 0.62, u);
    const row = [];
    for (let i = 0; i < nTh; i++) {
      const th = (i / nTh) * TAU; const c = Math.cos(th), s = Math.sin(th);
      const front = Math.max(0, s);
      const off = t * s - dent * front * Math.pow(1 - c * c, 1.4) + 0.0012 * front * Math.pow(Math.abs(c), 6); // concave bowl + rolled helix
      row.push(C.clone().addScaledVector(W, w * c).addScaledVector(F, off));
      meta.push([u, s, c]);
    }
    rows.push(row);
  }
  const tip = root.clone().addScaledVector(A, L * 1.035).addScaledVector(F, -0.0118);
  const g = gridGeo(rows, {
    wrapU: true, poles: { end: tip },
    outward: (p, out) => { const k = clamp(p.clone().sub(root).dot(A), 0, L); out.copy(root).addScaledVector(A, k); },
    uv: (i, j) => [i / nTh, j / nU],
  });
  return { geo: g, root, A, L };
}

/** Canonical LEFT hand parts (wrist at the origin). Returns [{geo, weights(localP)->[[bone,w]], ex, isSweep}] */
function handParts(s, sx) {
  const parts = [];
  const H = HAND.hole;
  const outwardFromGrip = (P, o) => { o.set(P.x - H.x * sx, P.y - H.y, 0); if (o.lengthSq() < 1e-10) o.set(sx, 0, 0); o.normalize(); };
  // ---- palm block
  const palm = superEllipsoid(0.0136, 0.0298, 0.0268, 0.72, 0.78, 14, 12, (q) => {
    const yr = q.y;
    const tw = sstep(0.0, 0.03, yr);
    q.z *= 1 - 0.22 * tw; q.x *= 1 - 0.12 * tw; q.z *= 1 + 0.06 * sstep(0, -0.025, yr);
    if (q.x < 0) {
      q.x -= 0.0036 * gauss(q.z - 0.0145, 0.011) * gauss(yr - 0.004, 0.016);   // thenar pad
      q.x -= 0.0022 * gauss(q.z + 0.016, 0.01) * gauss(yr + 0.002, 0.016);     // hypothenar pad
      q.x += 0.0026 * gauss(q.z, 0.011) * gauss(yr + 0.006, 0.011);            // cupped centre
    } else {
      let kb = 0; for (const f of FINGERS) kb += gauss(q.z - f[1][2], 0.0055);
      q.x += 0.0024 * kb * gauss(yr + 0.0235, 0.0068);                           // knuckles
      q.x += 0.001 * gauss(q.z, 0.02) * gauss(yr - 0.01, 0.015);                  // back-of-hand dome
    }
  });
  palm.translate(0.0022, -0.0302, 0.0015);
  if (sx < 0) mirrorX(palm);
  parts.push({ geo: palm, weights: () => [['hand' + s, 1]], ex: 0 });
  // ---- fingers
  for (const [fn, mcp, r, lens] of FINGERS) {
    const ch = fingerChain(mcp, r, lens).map((p) => new V3(p.x * sx, p.y, p.z));
    const base = ch[0].clone().add(new V3(0.0015 * sx, 0.012, 0));
    const pts = [base, ch[0], ch[1], ch[2], ch[3]];
    const seglen = [0.012, lens[0], lens[1], lens[2]];
    const tot = seglen.reduce((a, b) => a + b, 0);
    const tM = seglen[0] / tot, tP = (seglen[0] + lens[0]) / tot, tD = (seglen[0] + lens[0] + lens[1]) / tot;
    const sw = sweep(pts, {
      seg: 10, radial: 7, capSteps: 3, capStart: false, curveType: 'centripetal',
      radius: (t) => r * (lerp(1.04, 0.86, sstep(tM, 1, t)) + 0.07 * gauss(t - tP, 0.05) + 0.04 * gauss(t - tD, 0.04)),
      flat: 0.9, outward: outwardFromGrip,
    });
    const tA = sw.t;
    parts.push({
      geo: sw.geo, ex: 0,
      weights: (p, i) => { const t = tA[i]; const w2 = sstep(tP - 0.05, tP + 0.05, t); const w1 = (1 - w2) * sstep(tM - 0.08, tM + 0.03, t); return [[fb(s, fn, 2), w2], [fb(s, fn, 1), w1], ['hand' + s, 1 - w1 - w2]]; },
    });
    // nail on the distal phalanx (dorsal side)
    const dirT = ch[3].clone().sub(ch[2]).normalize();
    const o = new V3(); outwardFromGrip(ch[2].clone().lerp(ch[3], 0.6), o);
    o.addScaledVector(dirT, -o.dot(dirT)).normalize();
    const zb = new V3().crossVectors(dirT, o).normalize();
    const nail = superEllipsoid(r * 0.6, lens[2] * 0.4, 0.0011, 0.5, 0.7, 6, 3, (q) => { q.z -= 180 * (q.x * q.x); });
    // local: x across (zb), y along (dirT), z outward (o)
    const m = new THREE.Matrix4().makeBasis(zb, dirT, o);
    nail.applyMatrix4(m);
    nail.translate(...ch[2].clone().lerp(ch[3], 0.6).addScaledVector(o, r * 0.86).toArray());
    parts.push({ geo: nail, ex: 1, weights: () => [[fb(s, fn, 2), 1]] });
  }
  // ---- thumb
  {
    const tp = THUMB.map((p) => new V3(p[0] * sx, p[1], p[2]));
    const base = tp[0].clone().add(new V3(0.004 * sx, 0.006, -0.004));
    const pts = [base, ...tp];
    const L = [base.distanceTo(tp[0]), tp[0].distanceTo(tp[1]), tp[1].distanceTo(tp[2]), tp[2].distanceTo(tp[3])];
    const tot = L.reduce((a, b) => a + b, 0);
    const tC = L[0] / tot, tMp = (L[0] + L[1]) / tot, tI = (L[0] + L[1] + L[2]) / tot;
    const sw = sweep(pts, {
      seg: 11, radial: 8, capSteps: 3, capStart: false,
      radius: (t) => (t < tMp ? lerp(0.0122, THUMB_R[0], sstep(0, tC, t)) * lerp(1, THUMB_R[1] / THUMB_R[0], sstep(tC, tMp, t)) : lerp(THUMB_R[1], THUMB_R[2] * 0.92, sstep(tMp, 1, t))) * (1 + 0.06 * gauss(t - tI, 0.05)),
      flat: 0.88, outward: outwardFromGrip,
    });
    const tA = sw.t;
    parts.push({ geo: sw.geo, ex: 0, weights: (p, i) => { const t = tA[i]; const w2 = sstep(tMp - 0.05, tMp + 0.05, t); const w1 = (1 - w2) * sstep(0, tC + 0.05, t); return [[fb(s, 'thumb', 2), w2], [fb(s, 'thumb', 1), w1], ['hand' + s, 1 - w1 - w2]]; } });
    const dirT = tp[3].clone().sub(tp[2]).normalize();
    const o = new V3(); outwardFromGrip(tp[2].clone().lerp(tp[3], 0.6), o); o.addScaledVector(dirT, -o.dot(dirT)).normalize();
    const zb = new V3().crossVectors(dirT, o).normalize();
    const nail = superEllipsoid(THUMB_R[2] * 0.64, 0.0062, 0.0011, 0.5, 0.7, 6, 3, (q) => { q.z -= 160 * (q.x * q.x); });
    nail.applyMatrix4(new THREE.Matrix4().makeBasis(zb, dirT, o));
    nail.translate(...tp[2].clone().lerp(tp[3], 0.62).addScaledVector(o, THUMB_R[2] * 0.86).toArray());
    parts.push({ geo: nail, ex: 1, weights: () => [[fb(s, 'thumb', 2), 1]] });
  }
  return parts;
}

// leg sweep (shared with the socks so the sock always clears the skin)
const _legCache = {};
function legSpec(s) {
  if (_legCache[s]) return _legCache[s];
  const hp2 = R['thigh' + s], kn = R['shin' + s], an = R['foot' + s];
  const dn = an.clone().sub(kn).normalize();
  const pts = [hp2.clone().add(new V3(0, 0.012, 0)), hp2.clone().add(new V3(0, -0.03, 0.002)), kn, an, an.clone().addScaledVector(dn, 0.03)];
  // stylised kid leg: full thigh → soft knee → calf swell → slim ankle (t: knee ≈ 0.49, ankle ≈ 0.95)
  const radius = (t) => interpTable([0, 0.08, 0.29, 0.42, 0.49, 0.55, 0.62, 0.72, 0.84, 0.95, 1],
    [0.044, 0.05, 0.0468, 0.0392, 0.0362, 0.0368, 0.0384, 0.0335, 0.0282, 0.0266, 0.0265], t);
  const sd = s === 'L' ? 1 : -1;
  // section: c = forward (+Z), s = toward -X; medial side is -X for the left leg
  const section = (c, sn, t) => {
    const back = Math.max(0, -c), front = Math.max(0, c), medial = Math.max(0, sn * sd);
    let k = 1;
    const lateral = Math.max(0, -sn * sd);
    k += 0.3 * gauss(t - 0.6, 0.075) * Math.pow(back, 1.3) + 0.15 * gauss(t - 0.59, 0.07) * medial * medial + 0.08 * gauss(t - 0.62, 0.07) * lateral * lateral; // calf
    k -= 0.06 * gauss(t - 0.465, 0.035) * (1 - Math.abs(c));                                                    // knee waist (sides)
    k += 0.11 * gauss(t - 0.49, 0.026) * Math.pow(front, 3);                                                     // knee cap
    k -= 0.05 * gauss(t - 0.5, 0.03) * back * back;                                                              // back of the knee
    k -= 0.07 * sstep(0.54, 0.62, t) * sstep(0.86, 0.78, t) * front * front;                                     // flat shin
    k += 0.05 * gauss(t - 0.33, 0.07) * front * front;                                                           // quads
    k -= 0.03 * sstep(0.84, 0.95, t) * (1 - Math.abs(c)) ;                                                       // ankle waist
    return [c * k, sn * k];
  };
  const maxK = (t) => { let m = 0; for (let i = 0; i < 24; i++) { const th = (i / 24) * TAU; const [c, sn] = section(Math.cos(th), Math.sin(th), t); m = Math.max(m, Math.hypot(c * 0.96, sn)); } return m; };
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const lut = []; for (let k = 0; k <= 400; k++) { const t = k / 400; lut.push([curve.getPointAt(t).y, t]); }
  const rAtY = (y) => { let best = lut[0]; for (const e of lut) if (Math.abs(e[0] - y) < Math.abs(best[0] - y)) best = e; return radius(best[1]) * maxK(best[1]); };
  return (_legCache[s] = { pts, radius, section, rAtY, hp2, kn, an });
}

function buildSkin() {
  const B = new Builder();
  // ---- head
  {
    const hg = buildHeadGeo(); const uvA = hg.attributes.uv; const d = new V3();
    B.add(hg, {
      v3: (p, i) => { dirAE(uvA.getX(i), uvA.getY(i), d); return [d.x, d.y, d.z]; },
      color: (p, i) => {
        const az = uvA.getX(i), el = uvA.getY(i);
        const blush = Math.exp(-(((Math.abs(az) - 0.62) / 0.2) ** 2) - (((el + 0.33) / 0.12) ** 2));
        const nose = gauss(az, 0.07) * gauss(el + 0.13, 0.07) * 0.4;
        const underChin = sstep(-0.9, -1.25, el) * 0.12;
        const b = blush + nose;
        return _c.setRGB(1 - underChin, (1 - 0.22 * b) * (1 - underChin), (1 - 0.2 * b) * (1 - underChin));
      },
      weights: (p, i) => {
        const az = uvA.getX(i), el = uvA.getY(i);
        const jw = 0.92 * sstep(-0.5, -0.78, el) * sstep(1.35, 0.85, Math.abs(az));
        const ck = 0.55 * gauss(Math.abs(az) - 0.6, 0.24) * gauss(el + 0.31, 0.16) * (1 - jw);
        return [['head', 1 - jw - ck], ['jaw', jw], [az > 0 ? 'cheekL' : 'cheekR', ck]];
      },
    });
  }
  // ---- ears
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const { geo, root, A, L } = buildEarGeo(sx); const uvA = geo.attributes.uv;
    B.add(geo, {
      v3: [0, 0, 0],
      ex: (p, i) => { const u = uvA.getY(i), th = uvA.getX(i) * TAU; const sn = Math.sin(th), cs = Math.cos(th); return sn > 0.25 && Math.abs(cs) < 0.8 && u > 0.12 && u < 0.86 ? 2 : 0; },
      weights: (p) => { const k = p.clone().sub(root).dot(A) / L; const w = sstep(0.02, 0.22, k); return [['ear' + s, w], ['head', 1 - w]]; },
    });
  }
  // ---- neck
  const neck = lathe(smoothProfile([[0, 0.935], [0.037, 0.94], [0.0395, 0.985], [0.0375, 1.04], [0.0355, 1.09], [0.0345, 1.125], [0, 1.13]], 12), 18, (p) => { p.x *= 1.05; p.z *= 0.95; p.z -= 0.006; p.z += 0.004 * sstep(1.06, 1.12, p.y) * (p.z > 0 ? 1 : 0); });
  B.add(neck, { v3: [0, 0, 0], weights: (p) => { const w1 = sstep(0.975, 1.02, p.y), w2 = sstep(1.05, 1.1, p.y); return [['chest', 1 - w1], ['neck', w1 * (1 - w2)], ['head', w2]]; } });
  // ---- arms + hands
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const sh = R['uArm' + s], el = R['fArm' + s], wr = R['hand' + s];
    const up = el.clone().sub(sh).normalize(), fd = wr.clone().sub(el).normalize();
    const pts = [sh.clone().addScaledVector(up, 0.012), sh.clone().addScaledVector(up, 0.06), el, wr.clone().addScaledVector(fd, -0.03), wr, wr.clone().addScaledVector(fd, 0.018)];
    const arm = sweep(pts, {
      seg: 19, radial: 12, capSteps: 2, capEnd: false,
      radius: ARM_RADIUS,
      flat: ARM_FLAT,                                 // wrist flattens toward the hand
      section: (c, sn, t) => {
        // c = lateral (+sx), sn = forward for L / backward for R  → back = -sx * sn
        const back = Math.max(0, -sx * sn), front = Math.max(0, sx * sn);
        let k = 1;
        k += 0.16 * gauss(t - 0.485, 0.028) * Math.pow(back, 3);                     // elbow point
        k += 0.06 * gauss(t - 0.49, 0.03) * Math.pow(Math.max(0, c), 3) - 0.05 * gauss(t - 0.49, 0.03) * Math.max(0, -c) ** 2; // epicondyle / crease
        k += 0.04 * gauss(t - 0.33, 0.08) * (front * front + 0.6 * back * back);       // biceps / triceps
        k += 0.09 * gauss(t - 0.58, 0.07) * Math.max(0, c) + 0.04 * gauss(t - 0.6, 0.07) * back;   // forearm swell
        k += 0.035 * gauss(t - 0.1, 0.07) * Math.max(0, c);                            // deltoid (under the sleeve)
        return [c * k, sn * k * (t < 0.46 ? 1.04 : 1)];
      },
      outward: (P, o) => o.set(sx, 0, 0),
    });
    B.add(arm.geo, { v3: [0, 0, 0], weights: limbWeights(sh, el, wr, ['uArm' + s, 'fArm' + s, 'hand' + s], -0.035, 0.03) });
    for (const part of handParts(s, sx)) {
      part.geo.translate(wr.x, wr.y, wr.z);
      B.add(part.geo, { v3: [0, 0, 0], ex: part.ex, weights: part.weights });
    }
  }
  // ---- legs
  for (const s of ['L', 'R']) {
    const { pts, radius, section, hp2, kn, an } = legSpec(s);
    const leg = sweep(pts, { seg: 18, radial: 12, capSteps: 2, flat: 0.96, outward: (P, o) => o.set(0, 0, 1), radius, section });
    const lw = limbWeights(hp2, kn, an, ['thigh' + s, 'shin' + s, 'foot' + s], -0.04, 0.035, -0.02, 0.01);
    B.add(leg.geo, { v3: [0, 0, 0], weights: (p) => { const w = lw(p); const wtop = sstep(0.02, -0.04, p.y - hp2.y); w[0][1] *= wtop; w.push(['hips', 1 - wtop]); return w; } });
  }
  return B.build('aEx', 'aHead');
}

// ------------------------------------------------------------------------------------------------
// Eyes (polar patches that hug the head surface; blink = eye bone Y scale)
// ------------------------------------------------------------------------------------------------
function buildEyes() {
  const B = new Builder();
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const g = polarPatch(6, 28, (u, v, r, out) => {
      const c = Math.cos(EYE.tilt * sx), sn = Math.sin(EYE.tilt * sx);
      const uu = u * c - v * sn, vv = u * sn + v * c;
      headSurf(sx * EYE.az + uu * EYE.daz, EYE.el + vv * EYE.del, 0.0026 + 0.0036 * (1 - r * r), out);
    });
    B.add(g, { bone: 'eye' + s, uv: true, ex: sx });
  }
  return B.build('aEx');
}

// ------------------------------------------------------------------------------------------------
// Kid: cloth (tee, shorts, socks, sneakers, tank hardware + harness) — one skinned mesh
// ------------------------------------------------------------------------------------------------
export const TANK = { center: new V3(0, 0.848, -0.176), tilt: -0.1, r: 0.066, h: 0.19, bone: 'tank' };

// tee torso: y → half-width a, half-depth b, superellipse n, centre z
const TEE = {
  y: [0.698, 0.72, 0.76, 0.80, 0.84, 0.875, 0.905, 0.93, 0.95, 0.968, 0.982, 0.992, 0.998],
  a: [0.118, 0.114, 0.108, 0.107, 0.112, 0.118, 0.122, 0.125, 0.123, 0.108, 0.085, 0.064, 0.05],
  b: [0.086, 0.084, 0.081, 0.082, 0.086, 0.088, 0.086, 0.08, 0.072, 0.064, 0.057, 0.051, 0.046],
  n: [2.3, 2.3, 2.35, 2.4, 2.5, 2.6, 2.7, 2.9, 3.0, 2.7, 2.4, 2.2, 2.0],
  zc: [-0.012, -0.012, -0.012, -0.012, -0.011, -0.011, -0.011, -0.012, -0.012, -0.012, -0.011, -0.009, -0.007],
};
const TEE_HEM = 0.698, TEE_TOP = 0.998;
/** Point on the tee at angle th (0 = front, +pi/2 = +X) and height y, offset outward by `off`. */
function teePoint(th, y, off, out) {
  const a = interpTable(TEE.y, TEE.a, y), b = interpTable(TEE.y, TEE.b, y), n = interpTable(TEE.y, TEE.n, y), zc = interpTable(TEE.y, TEE.zc, y);
  seRing(th, a + off, b + off, n, out, 0, zc);
  const c = Math.cos(th);
  const front = Math.max(0, c), back = Math.max(0, -c);
  out.z += front * front * (0.007 * gauss(y - 0.865, 0.035) + 0.0055 * gauss(y - 0.775, 0.04));
  out.z -= back * 0.0045 * gauss(y - 0.9, 0.04);
  out.x *= 1 + 0.018 * gauss(y - TEE_HEM, 0.012);
  out.y = y - 0.014 * front * front * sstep(0.955, TEE_TOP, y);
  return out;
}
const teeZc = (y) => interpTable(TEE.y, TEE.zc, y);

// shorts pelvis (inside the tee above the hem, full hips below it)
const SHORTS = {
  y: [0.576, 0.584, 0.597, 0.615, 0.635, 0.66, 0.685, 0.70, 0.72, 0.745, 0.775],
  a: [0.062, 0.094, 0.112, 0.122, 0.126, 0.124, 0.118, 0.112, 0.107, 0.102, 0.099],
  b: [0.045, 0.07, 0.084, 0.092, 0.095, 0.093, 0.087, 0.08, 0.077, 0.074, 0.072],
  n: [2.0, 2.1, 2.2, 2.3, 2.35, 2.35, 2.3, 2.3, 2.3, 2.3, 2.3],
  zc: [-0.004, -0.004, -0.005, -0.006, -0.007, -0.008, -0.01, -0.011, -0.011, -0.011, -0.011],
};
function shortsPoint(th, y, off, out) {
  const a = interpTable(SHORTS.y, SHORTS.a, y), b = interpTable(SHORTS.y, SHORTS.b, y), n = interpTable(SHORTS.y, SHORTS.n, y), zc = interpTable(SHORTS.y, SHORTS.zc, y);
  seRing(th, a + off, b + off, n, out, 0, zc);
  const c = Math.cos(th); const back = Math.max(0, -c), front = Math.max(0, c);
  out.z -= back * back * 0.012 * gauss(y - 0.635, 0.035);
  out.z += front * front * 0.003 * gauss(y - 0.66, 0.04);
  out.y = y;
  return out;
}

const cl = (part, cls, param = 0) => [part, cls, param];
/** Right-handed placement basis for a small part: X, Y given (Y is orthogonalised), Z = X × Y. */
function placeBasis(geo, X, Y, at) {
  const x = X.clone().normalize(); const y = Y.clone().addScaledVector(x, -Y.dot(x)).normalize(); const z = new V3().crossVectors(x, y);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(at));
  return geo;
}
function revolve(profile, seg) {
  const rows = profile.map(([r, y]) => { const row = []; for (let i = 0; i < seg; i++) { const th = (i / seg) * TAU; row.push(new V3(r * Math.sin(th), y, r * Math.cos(th))); } return row; });
  const y0 = Math.min(...profile.map((p) => p[1])), y1 = Math.max(...profile.map((p) => p[1]));
  return gridGeo(rows, { wrapU: true, outward: (p, out) => out.set(0, p.y, 0), uv: (i, j) => [i / seg, (profile[j][1] - y0) / Math.max(1e-6, y1 - y0)] });
}

function addTee(B) {
  const nTh = 40;
  const ys = densitySamples(23, TEE_HEM, TEE_TOP, (y) => 1 + 1.7 * gauss(y - 0.976, 0.028) + 0.6 * gauss(y - 0.93, 0.03));
  const rows = [];
  // rolled hem: inside lip → around the edge → outside
  for (const [dy, inset] of [[0.009, 0.0048], [0.0022, 0.0038], [-0.0012, 0.0016]]) {
    const r = []; for (let i = 0; i < nTh; i++) { const p = teePoint((i / nTh) * TAU, TEE_HEM, -inset, new V3()); p.y = TEE_HEM + dy; r.push(p); } rows.push(r);
  }
  for (const y of ys) { const r = []; for (let i = 0; i < nTh; i++) r.push(teePoint((i / nTh) * TAU, y, 0, new V3())); rows.push(r); }
  const g = gridGeo(rows, { wrapU: true, outward: (p, out) => out.set(0, p.y, teeZc(p.y)), uv: (i, j) => [i / nTh, rows[j][0].y] });
  B.add(g, {
    ex: CS.shirt, uv: true, v3: cl(PART.tee, MC.jersey, TEE_HEM),
    weights: (p) => {
      const a = sstep(0.715, 0.8, p.y), b = sstep(0.8, 0.9, p.y);
      const w = [['hips', 1 - a], ['spine', a * (1 - b)], ['chest', b]];
      const wc = 0.45 * sstep(0.085, 0.12, Math.abs(p.x)) * sstep(0.9, 0.95, p.y);
      if (wc > 0) { for (const e of w) e[1] *= 1 - wc; w.push([p.x > 0 ? 'clavL' : 'clavR', wc]); }
      const f = 0.55 * sstep(0.76, 0.705, p.y) * sstep(0.02, 0.07, Math.abs(p.z));
      if (f > 0) { for (const e of w) e[1] *= 1 - f; w.push([p.z > 0 ? 'hemF' : 'hemB', f]); }
      return w;
    },
  });
  // ---- ribbed crew collar: a rolled band sitting on the neckline
  {
    const nC = 36, nPsi = 8;
    const top = [], rad = [];
    for (let i = 0; i < nC; i++) { const th = (i / nC) * TAU; const p = teePoint(th, TEE_TOP - 0.0005, 0, new V3()); top.push(p); rad.push(new V3(p.x, 0, p.z - teeZc(TEE_TOP)).normalize()); }
    const rows = [];
    for (let j = 0; j <= nPsi; j++) {
      const psi = -Math.PI / 2 + (j / nPsi) * TAU;
      const r = [];
      for (let i = 0; i < nC; i++) {
        const cx = -0.0014, cy = -0.0036, hw = 0.0027, hh = 0.0072;
        const c = Math.cos(psi), s = Math.sin(psi);
        const u = cx + hw * signedPow(c, 0.8), v = cy + hh * signedPow(s, 0.8);
        r.push(top[i].clone().addScaledVector(rad[i], u).add(new V3(0, v, 0)));
      }
      rows.push(r);
    }
    const cg = gridGeo(rows, { wrapU: true, outward: (p, out) => { out.set(0, p.y - 0.004, teeZc(TEE_TOP)); }, uv: (i, j) => [i / nC, j / nPsi] });
    B.add(cg, { ex: CS.trim, uv: true, v3: cl(PART.collar, MC.rib), weights: (p) => [['chest', 0.85], ['neck', 0.15]] });
  }
  // ---- set-in sleeves with a domed cap and a rolled cuff
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const sh = R['uArm' + s], el = R['fArm' + s];
    const d = el.clone().sub(sh).normalize();
    const side = new V3(sx, 0, 0).addScaledVector(d, -d.x * sx).normalize();
    const fwd = new V3().crossVectors(d, side).normalize().multiplyScalar(sx);
    const L = 0.1, S0 = -0.035, nTh = 20;
    const ss = densitySamples(11, S0, L, (x) => 1 + 1.6 * gauss(x - S0, 0.018) + 1.2 * gauss(x - L, 0.015));
    const rad = (x) => (x < 0 ? 0.0505 * Math.sqrt(Math.max(0.004, 1 - (x / (S0 * 1.03)) ** 2)) : lerp(0.0505, 0.0468, x / L) + 0.0016 * sstep(L - 0.016, L, x));
    const ctr = (x) => sh.clone().addScaledVector(d, x).addScaledVector(side, 0.005 * sstep(0.012, S0, x));
    const ring = (c, r) => { const row = []; for (let i = 0; i < nTh; i++) { const th = (i / nTh) * TAU; row.push(c.clone().addScaledVector(side, r * Math.cos(th)).addScaledVector(fwd, r * 0.93 * Math.sin(th))); } return row; };
    const rows = ss.map((x) => ring(ctr(x), rad(x)));
    const svals = ss.slice();
    for (const [dx, dr] of [[0.0016, 0.0006], [-0.0012, -0.0024], [-0.009, -0.0034]]) { rows.push(ring(ctr(L + dx), rad(L) + dr)); svals.push(L + Math.abs(dx) * 0.5); }
    const g = gridGeo(rows, { wrapU: true, poles: { start: ctr(S0 - 0.0008) }, outward: (p, out) => { const k = p.clone().sub(sh).dot(d); out.copy(sh).addScaledVector(d, k); }, uv: (i, j) => [i / nTh, svals[j] - S0] });
    B.add(g, {
      ex: CS.shirt, uv: true, v3: cl(PART.sleeve, MC.jersey, L - S0),
      weights: (p) => { const k = p.clone().sub(sh).dot(d); const w = sstep(-0.03, 0.016, k); return [['uArm' + s, w], ['clav' + s, (1 - w) * 0.75], ['chest', (1 - w) * 0.25]]; },
    });
  }
}

function addShorts(B) {
  const nTh = 40;
  const ys = densitySamples(14, 0.576, 0.775, (y) => 1 + 0.8 * gauss(y - 0.59, 0.02));
  const rows = ys.map((y) => { const r = []; for (let i = 0; i < nTh; i++) r.push(shortsPoint((i / nTh) * TAU, y, 0, new V3())); return r; });
  const g = gridGeo(rows, { wrapU: true, poles: { start: new V3(0, 0.573, -0.004) }, outward: (p, out) => out.set(0, p.y, -0.006), uv: (i, j) => [i / nTh, ys[j]] });
  B.add(g, { ex: CS.shorts, uv: true, v3: cl(PART.shorts, MC.twill), weights: (p) => { const a = sstep(0.7, 0.77, p.y); return [['hips', 1 - a], ['spine', a]]; } });
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const hp = R['thigh' + s], kn = R['shin' + s];
    const d = kn.clone().sub(hp).normalize();
    const side = new V3(sx, 0, 0).addScaledVector(d, -d.x * sx).normalize();
    const fwd = new V3(0, 0, 1).addScaledVector(d, -d.z).normalize();
    const L = 0.158, nT = 28;
    const r0 = (x) => 0.0685 + 0.0065 * sstep(0, L, x);
    const ctr = (x) => hp.clone().addScaledVector(d, x).addScaledVector(side, 0.004);
    // theta from the front: 0.25 = outer side, 0.75 = inseam
    const ring = (x, r) => { const c = ctr(x); const row = []; for (let i = 0; i < nT; i++) { const th = (i / nT) * TAU; row.push(c.clone().addScaledVector(fwd, r * 0.95 * Math.cos(th)).addScaledVector(side, r * Math.sin(th))); } return row; };
    const xs = densitySamples(9, -0.03, L - 0.008, (x) => 1 + 1.2 * gauss(x - L, 0.03));
    const rows = xs.map((x) => ring(x, r0(x)));
    const lg = gridGeo(rows, { wrapU: true, outward: (p, out) => { const k = p.clone().sub(hp).dot(d); out.copy(hp).addScaledVector(d, k); }, uv: (i, j) => [i / nT, xs[j]] });
    const legW = (p) => { const k = p.clone().sub(hp).dot(d); const w = sstep(-0.005, 0.075, k); return [['hips', 1 - w], ['thigh' + s, w]]; };
    B.add(lg, { ex: CS.shorts, uv: true, v3: cl(PART.shortLeg, MC.twill, L), weights: legW });
    // rolled cuff
    const prof = [[-0.017, 0.0005], [-0.014, 0.0038], [0.002, 0.0044], [0.0062, 0.0024], [0.0071, -0.0004], [0.0035, -0.0028], [-0.006, -0.0032]];
    const crow = prof.map(([dx, dr]) => ring(L + dx, r0(L) + dr));
    const cg = gridGeo(crow, { wrapU: true, outward: (p, out) => { const k = p.clone().sub(hp).dot(d); out.copy(hp).addScaledVector(d, k); }, uv: (i, j) => [i / nT, j / (prof.length - 1)] });
    B.add(cg, { ex: CS.team, uv: true, v3: cl(PART.cuff, MC.twill), weights: legW });
  }
  // drawcords peeking out under the tee hem
  for (const sx of [1, -1]) {
    const x = 0.011 * sx;
    const pts = [new V3(x, 0.708, 0.0705), new V3(x, 0.699, 0.0735), new V3(x + 0.0018 * sx, 0.684, 0.0838), new V3(x + 0.0038 * sx, 0.668, 0.0928)];
    const sw = sweep(pts, { seg: 7, radial: 5, capSteps: 2, radius: () => 0.0021, outward: (P, o) => o.set(0, 0, 1) });
    const len = sw.curve.getLength(); const tA = sw.t, cA = sw.cs;
    B.add(sw.geo, { ex: CS.lace, uv: (i) => [tA[i] * len, cA[i]], v3: cl(PART.cord, MC.lace), bone: 'hips' });
    const tipP = sw.curve.getPointAt(1), tipT = sw.curve.getTangentAt(1);
    const ag = lathe([[0, -0.0045], [0.0026, -0.0045], [0.0029, -0.0035], [0.0029, 0.0035], [0.0024, 0.0045], [0, 0.0045]], 8);
    alongAxis(ag, tipP.clone().addScaledVector(tipT, 0.0035), tipT.clone().negate());
    B.add(ag, { ex: CS.metal, v3: cl(PART.none, MC.metal), bone: 'hips' });
  }
}

function addSocks(B) {
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const kn = R['shin' + s], an = R['foot' + s];
    const ax = kn.clone().sub(an);
    const at = (y) => an.clone().addScaledVector(ax, (y - an.y) / ax.y);
    const side = new V3(sx, 0, 0), fwd = new V3(0, 0, 1);
    const RY = [0.07, 0.1, 0.13, 0.16, 0.19, 0.2, 0.206];
    const RR = [0.0333, 0.0336, 0.0346, 0.036, 0.0371, 0.0377, 0.0376];
    const nT = 20, top = 0.2065;
    const ring = (y, r) => { const c = at(y); const row = []; for (let i = 0; i < nT; i++) { const th = (i / nT) * TAU; row.push(c.clone().addScaledVector(fwd, r * 1.05 * Math.cos(th)).addScaledVector(side, r * Math.sin(th))); } return row; };
    const ys = densitySamples(10, 0.07, top, (y) => 1 + 1.2 * gauss(y - 0.2, 0.012));
    const LS = legSpec(s);
    const sr = (y) => Math.max(interpTable(RY, RR, y), LS.rAtY(y) + 0.0034);
    const rows = ys.map((y) => ring(y, sr(y)));
    const yv = ys.slice();
    for (const [dy, dr] of [[0.0016, -0.0012], [0.0006, -0.0036]]) { rows.push(ring(top + dy, sr(top) + dr)); yv.push(top + dy); }
    const g = gridGeo(rows, { wrapU: true, outward: (p, out) => out.copy(at(p.y)), uv: (i, j) => [i / nT, top - yv[j]] });
    B.add(g, { ex: CS.sock, uv: true, v3: cl(PART.sock, MC.rib), weights: (p) => { const w = sstep(0.1, 0.075, p.y); return [['shin' + s, 1 - w], ['foot' + s, w]]; } });
  }
}

// ---- sneakers (built as the LEFT shoe in foot-local space: origin under the ankle bone, z forward; mirrored for the right)
const SHOE = { L: 0.128, cz: 0.045 };
function shoeOutline(phi, inset, out) {
  const c = Math.cos(phi), s = Math.sin(phi);
  const zN = signedPow(c, 2 / 2.3);
  const zl = SHOE.L * zN;
  let w = lerp(0.047, 0.0585, sstep(-0.1, 0.055, zl));
  if (s < 0) w -= 0.0068 * gauss(zl + 0.004, 0.036);
  return out.set((w + inset) * signedPow(s, 2 / 2.8), 0, SHOE.cz + (SHOE.L + inset) * zN);
}
const shoeSpring = (zl) => 0.02 * sstep(0.03, 0.128, zl) ** 2 + 0.004 * sstep(-0.085, -0.128, zl) ** 2;
const SHOE_COLLAR = (phi, out) => out.set(0.0395 * Math.sin(phi), 0.1045 - 0.0075 * Math.cos(phi), -0.002 + 0.05 * Math.cos(phi));
const MID_TOP = (zl) => 0.0455 + 0.006 * sstep(-0.03, -0.11, zl) + 0.009 * sstep(0.085, 0.124, zl);

function shoeParts() {
  const parts = []; // { geo, ex, v3, uv:bool }
  const nP = 32;
  const phis = []; for (let i = 0; i < nP; i++) phis.push((i / nP) * TAU);
  const tmp = new V3();
  // ---- outsole: flat tread bottom + bevelled rubber wall
  {
    const rows = [];
    for (const k of [0.45, 0.82, 0.97]) rows.push(phis.map((ph) => { const o = shoeOutline(ph, -0.0022, new V3()); const p = new V3(o.x * k, 0, SHOE.cz + (o.z - SHOE.cz) * k); p.y = shoeSpring(p.z - SHOE.cz); return p; }));
    const g = gridGeo(rows, { wrapU: true, poles: { start: new V3(0, shoeSpring(0), SHOE.cz) }, flip: false, outward: (p, out) => out.set(p.x, p.y + 1, p.z), uv: (i, j) => { const p = rows[j][i % nP]; return [p.x, p.z - SHOE.cz]; }, poleUv: { start: [0, 0] } });
    parts.push({ geo: g, ex: CS.outsole, v3: cl(PART.outsole, MC.rubber, 0), uv: true });
    const wr = [];
    for (const [y, inset] of [[0.0, -0.0022], [0.0026, -0.0005], [0.0105, 0.0007], [0.0136, -0.0004]]) wr.push(phis.map((ph) => { const p = shoeOutline(ph, inset, new V3()); p.y = y + shoeSpring(p.z - SHOE.cz); return p; }));
    const wg = gridGeo(wr, { wrapU: true, outward: (p, out) => out.set(0, p.y, SHOE.cz), uv: (i, j) => { const p = wr[j][i % nP]; return [p.x, p.z - SHOE.cz]; } });
    parts.push({ geo: wg, ex: CS.outsole, v3: cl(PART.outsole, MC.rubber, 1), uv: true });
  }
  // ---- midsole: bulged foam wall, raised heel + toe bumper
  {
    const prof = [[0.0126, -0.0006], [0.017, 0.0017], [0.028, 0.0028], [0.038, 0.0017], [0.0448, -0.0012], [0.0462, -0.0048]];
    const rows = prof.map(([y, inset], j) => phis.map((ph) => {
      const p = shoeOutline(ph, inset, new V3()); const zl = p.z - SHOE.cz; const f = j / (prof.length - 1);
      p.y = 0.0126 + (y - 0.0126) * (MID_TOP(zl) / 0.0455) + shoeSpring(zl);
      p.y += 0 * f; return p;
    }));
    const g = gridGeo(rows, { wrapU: true, outward: (p, out) => out.set(0, p.y, SHOE.cz), uv: (i, j) => [i / nP, j / (prof.length - 1)] });
    parts.push({ geo: g, ex: CS.sole, v3: cl(PART.midsole, MC.foam), uv: true });
  }
  // ---- upper: quadratic loft sole-line → collar, then a team lining folding inside
  const upperPt = (ph, t, out) => {
    const b = shoeOutline(ph, -0.0042, new V3()); const zl = b.z - SHOE.cz;
    b.y = MID_TOP(zl) - 0.002 + shoeSpring(zl);
    const c = SHOE_COLLAR(ph, new V3());
    const cf = Math.max(0, Math.cos(ph)), cb = Math.max(0, -Math.cos(ph)), sn = Math.sin(ph);
    let k = lerp(0.35, 0.12, cf * cf); k = lerp(k, 0.1, cb * cb);
    const m = b.clone().lerp(c, k);
    m.x += Math.sign(b.x) * 0.0055 * sn * sn;
    m.y = 0.069 + 0.004 * sn * sn + 0.03 * cb * cb + shoeSpring(zl) * 0.6;
    const u = 1 - t;
    return out.set(u * u * b.x + 2 * u * t * m.x + t * t * c.x, u * u * b.y + 2 * u * t * m.y + t * t * c.y, u * u * b.z + 2 * u * t * m.z + t * t * c.z);
  };
  {
    const ts = densitySamples(10, 0, 1, (t) => 1 + 0.8 * gauss(t, 0.1) + 1.2 * gauss(t - 1, 0.08));
    const rows = ts.map((t) => phis.map((ph) => upperPt(ph, t, new V3())));
    const tv = ts.slice();
    for (const [dy, k] of [[-0.0022, 0.9], [-0.017, 0.84]]) { rows.push(phis.map((ph) => { const c = SHOE_COLLAR(ph, new V3()); return new V3(c.x * k, c.y + dy, -0.002 + (c.z + 0.002) * k); })); tv.push(1 + (1 - k)); }
    const g = gridGeo(rows, { wrapU: true, outward: (p, out) => out.set(0, 0.03, SHOE.cz - 0.03), uv: (i, j) => [i / nP, tv[j]] });
    parts.push({ geo: g, ex: (p, i, uvA) => (uvA.getY(i) > 1.001 ? CS.teamDark : CS.shoe), v3: cl(PART.upper, MC.leather, 1), uv: true });
  }
  // ---- padded collar roll
  {
    const nC = 28, nPsi = 6;
    const rows = [];
    for (let j = 0; j <= nPsi; j++) {
      const psi = (j / nPsi) * TAU;
      rows.push(Array.from({ length: nC }, (_, i) => {
        const ph = (i / nC) * TAU; const c = SHOE_COLLAR(ph, new V3());
        const n = new V3(Math.sin(ph) / 0.0395, 0, Math.cos(ph) / 0.05).normalize();
        const rp = 0.0072 + 0.0012 * Math.max(0, -Math.cos(ph));
        return c.clone().addScaledVector(n, 0.0016 + rp * Math.cos(psi)).add(new V3(0, -0.0018 + rp * 0.85 * Math.sin(psi), 0));
      }));
    }
    const g = gridGeo(rows, { wrapU: true, outward: (p, out) => out.set(0, p.y, -0.002), uv: (i, j) => [i / nC, j / nPsi] });
    parts.push({ geo: g, ex: CS.shoe2, v3: cl(PART.collarPad, MC.padding), uv: true });
  }
  // ---- tongue with a team tab
  {
    const tg = superEllipsoid(0.0215, 0.033, 0.0046, 0.35, 0.45, 8, 8, (q) => { const f = (q.y / 0.033 + 1) / 2; q.z += 0.009 * f * f; });
    const P = tg.attributes.position; const uv = new Float32Array(P.count * 2);
    for (let i = 0; i < P.count; i++) { uv[i * 2] = P.getX(i) / 0.0215; uv[i * 2 + 1] = (P.getY(i) / 0.033 + 1) / 2; }
    tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    placeBasis(tg, new V3(1, 0, 0), new V3(0, 0.72, -0.69), new V3(0, 0.1035, 0.026));
    parts.push({ geo: tg, ex: CS.shoe2, v3: cl(PART.tongue, MC.mesh), uv: true });
  }
  // ---- laces (bar lacing + bow), eyelets
  {
    const vampY = (z) => { let best = 0, bd = 1e9; for (let k = 0; k <= 60; k++) { const p = upperPt(0, k / 60, tmp); const dd = Math.abs(p.z - z); if (dd < bd) { bd = dd; best = p.y; } } return best; };
    const zs = [0.086, 0.07, 0.054, 0.038];
    for (const z of zs) {
      const y = vampY(z) + 0.0036;
      const pts = [new V3(-0.0185, y - 0.003, z), new V3(-0.009, y + 0.0006, z + 0.0006), new V3(0.009, y + 0.0006, z + 0.0006), new V3(0.0185, y - 0.003, z)];
      const sw = sweep(pts, { seg: 4, radial: 4, capSteps: 2, radius: () => 0.0023, flat: 0.6, outward: (P, o) => o.set(0, 1, 0) });
      const len = sw.curve.getLength(); const tA = sw.t, cA = sw.cs;
      parts.push({ geo: sw.geo, ex: CS.lace, v3: cl(PART.cord, MC.lace), uvFn: (i) => [tA[i] * len, cA[i]] });
    }
    // bow: two loops + two tails at the top lace
    const zt = 0.03, yt = vampY(zt) + 0.006;
    const bowPts = (sx) => [new V3(0, yt, zt), new V3(0.012 * sx, yt + 0.006, zt + 0.004), new V3(0.021 * sx, yt + 0.003, zt - 0.003), new V3(0.014 * sx, yt - 0.001, zt - 0.006), new V3(0.002 * sx, yt, zt)];
    for (const sx of [1, -1]) {
      for (const pts of [bowPts(sx)]) {
        const sw = sweep(pts, { seg: 6, radial: 4, capSteps: 2, radius: () => 0.0021, flat: 0.65, outward: (P, o) => o.set(0, 1, 0) });
        const len = sw.curve.getLength(); const tA = sw.t, cA = sw.cs;
        parts.push({ geo: sw.geo, ex: CS.lace, v3: cl(PART.cord, MC.lace), uvFn: (i) => [tA[i] * len, cA[i]] });
      }
    }
    const knot = superEllipsoid(0.0042, 0.0034, 0.004, 0.8, 0.8, 5, 4); knot.translate(0, yt, zt);
    parts.push({ geo: knot, ex: CS.lace, v3: cl(PART.cord, MC.lace) });
  }
  // ---- heel pull tab
  {
    const tb = superEllipsoid(0.0085, 0.0165, 0.0034, 0.4, 0.5, 6, 5);
    placeBasis(tb, new V3(1, 0, 0), new V3(0, 0.95, -0.3), new V3(0, 0.117, -0.0555));
    parts.push({ geo: tb, ex: CS.team, v3: cl(PART.heelTab, MC.webbing) });
  }
  return parts;
}

function addShoes(B) {
  const parts = shoeParts();
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const F = R['foot' + s];
    for (const pt of parts) {
      const g = pt.geo.clone();
      if (sx < 0) mirrorX(g);
      g.translate(F.x, 0, F.z);
      const uvA = g.attributes.uv;
      B.add(g, {
        ex: typeof pt.ex === 'function' ? (p, i) => pt.ex(p, i, uvA) : pt.ex,
        uv: pt.uvFn ? (i) => pt.uvFn(i) : !!pt.uv,
        v3: pt.v3,
        weights: (p) => { const zl = p.z - F.z; const w = sstep(0.058, 0.09, zl) * sstep(0.1, 0.06, p.y); return [['toe' + s, w], ['foot' + s, 1 - w]]; },
      });
    }
  }
}

function addTankRig(B) {
  const T = TANK;
  const M = new THREE.Matrix4().makeRotationX(T.tilt).setPosition(T.center);
  const add = (g, ex, v3, extra = {}) => { g.applyMatrix4(M); B.add(g, { ex, v3, bone: 'tank', uv: !!g.attributes.uv, ...extra }); };
  // machined end caps: dark body with crisp chamfers + a knurled metal collar where they grip the glass
  const capBody = [[0, -0.1285], [0.05, -0.1285], [0.0615, -0.1278], [0.0662, -0.1262], [0.0688, -0.1232], [0.0694, -0.1195], [0.0694, -0.1072], [0.072, -0.1068], [0, -0.1068]];
  add(revolve(capBody, 24), CS.darkPlastic, cl(PART.none, MC.plastic));
  const collar = [[0.0662, -0.1076], [0.0772, -0.1076], [0.0788, -0.1062], [0.0791, -0.1044], [0.0791, -0.0895], [0.0786, -0.0876], [0.0768, -0.0862], [0.0688, -0.0862]];
  add(revolve(collar, 28), CS.metal, cl(PART.tankCap, MC.metal));
  const capTop = capBody.map(([r, y]) => [r, -y]).reverse();
  capTop.splice(capTop.length - 1, 0, [0.032, 0.1287], [0.0275, 0.1305]);
  capTop[capTop.length - 1] = [0, 0.1305];
  add(revolve(capTop, 24), CS.darkPlastic, cl(PART.none, MC.plastic));
  add(revolve(collar.map(([r, y]) => [r, -y]).reverse(), 28), CS.metal, cl(PART.tankCap, MC.metal));
  for (const y of [-0.0852, 0.0852]) { const r = torus(0.0688, 0.0026, 4, 24); r.rotateX(Math.PI / 2); r.translate(0, y, 0); add(r, CS.team, cl(PART.none, MC.plastic)); }
  // valve knob
  add(lathe([[0, 0.13], [0.0105, 0.13], [0.0105, 0.141], [0.0058, 0.142], [0.0058, 0.146], [0, 0.146]], 10), CS.metal, cl(PART.none, MC.metal));
  add(lathe(smoothProfile([[0, 0.1455], [0.0165, 0.1455], [0.0185, 0.149], [0.0182, 0.1545], [0.014, 0.158], [0, 0.1585]], 6), 12), CS.team, cl(PART.none, MC.plastic));
  // pressure gauge on the back-top of the upper cap
  {
    const n = new V3(0, 0.62, -0.785).normalize();
    const at = new V3(0, 0.113, -0.056);
    const housing = lathe([[0, -0.006], [0.0142, -0.006], [0.0148, 0.0], [0.0142, 0.0035], [0, 0.0035]], 14);
    alongAxis(housing, at, n.clone().negate());
    add(housing, CS.darkPlastic, cl(PART.none, MC.plastic));
    const bez = torus(0.0128, 0.0021, 4, 14); bez.lookAt(n); bez.translate(...at.clone().addScaledVector(n, 0.0036).toArray());
    add(bez, CS.metal, cl(PART.none, MC.metal));
    const face = polarPatch(3, 16, (u, v, r, out) => out.set(u * 0.0118, v * 0.0118, 0));
    const P = face.attributes.position; const uv = new Float32Array(P.count * 2);
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i); const a = (Math.atan2(-x, -y) / TAU + 0.5); uv[i * 2] = (a - 0.12) / 0.76; uv[i * 2 + 1] = Math.hypot(x, y) / 0.0118; }
    face.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const faceN = n.clone();
    placeBasis(face, new V3(1, 0, 0), new V3().crossVectors(faceN, new V3(1, 0, 0)), at.clone().addScaledVector(n, 0.0038));
    add(face, CS.white, cl(PART.gauge, MC.plastic));
    const needle = superEllipsoid(0.0007, 0.0052, 0.0006, 0.8, 0.8, 4, 4);
    needle.translate(0, 0.0045, 0); needle.rotateZ(-0.9);
    placeBasis(needle, new V3(1, 0, 0), new V3().crossVectors(faceN, new V3(1, 0, 0)), at.clone().addScaledVector(n, 0.0046));
    add(needle, CS.white, cl(PART.none, MC.plastic), { color: new THREE.Color(0.9, 0.12, 0.08) });
  }
  // back plate (quilted pad against the body)
  {
    const pl = superEllipsoid(0.074, 0.1, 0.0115, 0.45, 0.55, 14, 12, (q) => { q.z += 0.013 * (q.x / 0.074) ** 2; });
    const P = pl.attributes.position; const uv = new Float32Array(P.count * 2);
    for (let i = 0; i < P.count; i++) { uv[i * 2] = P.getX(i); uv[i * 2 + 1] = P.getY(i); }
    pl.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    pl.translate(0, 0, 0.074);
    add(pl, CS.strap, cl(PART.plate, MC.padding));
  }
}

function addHarness(B) {
  const T = TANK;
  const M = new THREE.Matrix4().makeRotationX(T.tilt).setPosition(T.center);
  // side rails + bolts
  for (const sx of [1, -1]) {
    const rail = superEllipsoid(0.0062, 0.099, 0.0105, 0.5, 0.6, 6, 10); rail.translate(0.0745 * sx, 0, 0.0); rail.applyMatrix4(M);
    B.add(rail, { ex: CS.darkPlastic, v3: cl(PART.none, MC.plastic), bone: 'tank' });
    for (const y of [-0.088, 0.088]) {
      const bolt = lathe([[0, 0], [0.0046, 0], [0.0046, 0.0012], [0.0034, 0.0026], [0, 0.003]], 6);
      bolt.rotateZ(-sx * Math.PI / 2); bolt.translate(0.0805 * sx, y, 0.0); bolt.applyMatrix4(M);
      B.add(bolt, { ex: CS.metal, v3: cl(PART.none, MC.metal), bone: 'tank' });
    }
  }
  // shoulder straps: plate top → over the shoulder → down the front → under the arm → plate bottom
  const tp = new V3();
  const strapOut = (P, o) => o.set(P.x, 0, P.z - teeZc(P.y)).normalize();
  const fronts = [];
  for (const sx of [1, -1]) {
    const pts = [new V3(0.05 * sx, 0.944, -0.124), new V3(0.066 * sx, 0.981, -0.078)];
    for (const [ang, y] of [[1.05, 0.988], [0.62, 0.972], [0.5, 0.93], [0.52, 0.87], [0.58, 0.8], [0.9, 0.748], [1.55, 0.742], [2.1, 0.748]]) pts.push(teePoint(ang * sx, y, 0.0048, tp).clone());
    pts.push(new V3(0.06 * sx, 0.75, -0.128));
    const sw = sweep(pts, { seg: 28, radial: 6, radius: () => 0.0113, flat: 0.22, outward: strapOut, capStart: false, capEnd: false });
    const len = sw.curve.getLength(); const tA = sw.t, sA = sw.sn;
    B.add(sw.geo, { ex: CS.strap, uv: (i) => [tA[i] * len, sA[i]], v3: cl(PART.strap, MC.webbing), weights: (p) => { const w = sstep(-0.085, -0.118, p.z); return [['tank', w], ['chest', 1 - w]]; } });
    // find the strap frame at chest height on the front run
    let best = null;
    for (let k = 0; k <= 200; k++) { const t = k / 200; const P = sw.curve.getPointAt(t); if (P.z > 0.03 && (!best || Math.abs(P.y - 0.858) < Math.abs(best.P.y - 0.858))) best = { t, P }; }
    const P = best.P, Tg = sw.curve.getTangentAt(best.t).normalize();
    const o = new V3(); strapOut(P, o); o.addScaledVector(Tg, -o.dot(Tg)).normalize();
    const bdir = new V3().crossVectors(Tg, o).normalize();
    fronts.push({ sx, P, T: Tg, o, b: bdir });
    // ladder-lock adjuster + centre bar
    const lock = superEllipsoid(0.0148, 0.0102, 0.0031, 0.3, 0.35, 10, 6);
    placeBasis(lock, bdir, Tg, P.clone().addScaledVector(o, 0.0042));
    B.add(lock, { ex: CS.darkPlastic, v3: cl(PART.none, MC.plastic), bone: 'chest' });
    const bar = superEllipsoid(0.0128, 0.0016, 0.0022, 0.6, 0.6, 6, 4);
    placeBasis(bar, bdir, Tg, P.clone().addScaledVector(o, 0.0073).addScaledVector(Tg, 0.0));
    B.add(bar, { ex: CS.metal, v3: cl(PART.none, MC.metal), bone: 'chest' });
    // loose strap tail hanging below the adjuster
    const t0 = P.clone().addScaledVector(o, 0.0056).addScaledVector(Tg, 0.006);
    const tail = sweep([t0, t0.clone().addScaledVector(Tg, 0.018).addScaledVector(o, 0.0022), t0.clone().addScaledVector(Tg, 0.038).addScaledVector(o, 0.0036)], {
      seg: 5, radial: 6, radius: () => 0.0105, flat: 0.2, outward: (Q, oo) => oo.copy(o), capStart: false, capEnd: true, capSteps: 2,
    });
    const tl = tail.curve.getLength(); const tA2 = tail.t, sA2 = tail.sn;
    B.add(tail.geo, { ex: CS.strap, uv: (i) => [tA2[i] * tl, sA2[i]], v3: cl(PART.strap, MC.webbing), bone: 'chest' });
  }
  // chest strap + side-release buckle
  {
    const pts = []; for (let a = -0.56; a <= 0.561; a += 0.08) pts.push(teePoint(a, 0.886, 0.0098, tp).clone());
    const sw = sweep(pts, { seg: 12, radial: 6, capSteps: 2, radius: () => 0.0076, flat: 0.3, outward: strapOut });
    const len = sw.curve.getLength(); const tA = sw.t, sA = sw.sn;
    B.add(sw.geo, { ex: CS.strap, uv: (i) => [tA[i] * len, sA[i]], v3: cl(PART.strap, MC.webbing), bone: 'chest' });
    const c = teePoint(0, 0.886, 0.0165, tp).clone(); const n = new V3(0, 0.05, 1).normalize();
    const fem = superEllipsoid(0.0205, 0.0122, 0.0046, 0.32, 0.38, 12, 6);
    placeBasis(fem, new V3(1, 0, 0), new V3(0, 1, 0), c);
    B.add(fem, { ex: CS.darkPlastic, v3: cl(PART.none, MC.plastic), bone: 'chest' });
    for (const sx of [1, -1]) {
      const tab = superEllipsoid(0.0048, 0.0078, 0.0034, 0.5, 0.5, 6, 5);
      placeBasis(tab, new V3(1, 0, 0), new V3(0, 1, 0), c.clone().add(new V3(0.0172 * sx, 0, 0.0022)));
      B.add(tab, { ex: CS.team, v3: cl(PART.none, MC.plastic), bone: 'chest' });
    }
    const badge = superEllipsoid(0.0062, 0.0062, 0.0012, 1, 1, 10, 4);
    placeBasis(badge, new V3(1, 0, 0), new V3(0, 1, 0), c.clone().addScaledVector(n, 0.0046));
    B.add(badge, { ex: CS.team, v3: cl(PART.none, MC.plastic), bone: 'chest' });
  }
}

function buildCloth() {
  const B = new Builder();
  addTee(B);
  addShorts(B);
  addSocks(B);
  addShoes(B);
  addTankRig(B);
  addHarness(B);
  return B.build('aEx', 'aCloth');
}

// ------------------------------------------------------------------------------------------------
// Hair styles (team-colour glossy tentacles).
// Control points: S(az, el, extra) hugs the scalp; IN(az, el) is buried inside the cap (hidden root);
// O(az, el, off) is offset from the bare head surface; [x, y, z] are head-relative free points.
// ------------------------------------------------------------------------------------------------
const S = (az, el, extra = 0) => ['s', az, el, extra];
const IN = (az, el) => ['in', az, el];
const O = (az, el, off) => ['o', az, el, off];
const mirror = (pts) => pts.map((p) => (p[0] === 's' || p[0] === 'in' || p[0] === 'o' ? [p[0], -p[1], ...p.slice(2)] : [-p[0], p[1], p[2]]));

/** Bun coil: a spherical helix winding up and over a ball of radius Rb centred at C (head-relative), around `axis`. */
function knotCoil(C, Rb, p0, axis = [0, 1, 0]) {
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), new V3(...axis).normalize());
  const P = (x, y, z) => { const v = new V3(x, y, z).applyQuaternion(q); return [C[0] + v.x, C[1] + v.y, C[2] + v.z]; };
  const pts = [P(0.022 * Math.sin(p0), -0.064, 0.022 * Math.cos(p0))]; // root, buried in the scalp under the bun
  for (let k = 0; k <= 10; k++) {
    const u = k / 10, th = lerp(2.3, 0.42, u), ph = p0 + u * TAU * 1.55;
    pts.push(P(Rb * Math.sin(th) * Math.sin(ph), Rb * Math.cos(th), Rb * Math.sin(th) * Math.cos(ph)));
  }
  return { pts, r0: Rb * 0.75, r1: Rb * 0.6, taper: 1.5, flat: 1.25, K: 3.0, G: 0.12, suck: false, curl: 0, twist: 0, noClub: true };
}

const STYLES = [
  { // 0 — "Tide": long swept-back tentacles + face-framing locks + a swept bang
    name: 'Tide',
    strands: (() => {
      const backL = { pts: [IN(2.55, 0.9), S(2.65, 0.45), S(2.78, -0.1), [0.05, -0.17, -0.212], [0.06, -0.218, -0.222], [0.074, -0.24, -0.238]], r0: 0.058, r1: 0.018, flat: 0.5, K: 1, G: 1, suck: true, curl: 0.9 };
      const outL = { pts: [IN(2.0, 0.8), S(2.08, 0.35), S(2.18, -0.15), [0.158, -0.13, -0.11], [0.185, -0.175, -0.112], [0.2, -0.192, -0.128]], r0: 0.052, r1: 0.016, flat: 0.5, K: 1.2, G: 0.9, suck: true, curl: 1.0 };
      const lockL = { pts: [IN(1.15, 0.85), S(1.25, 0.42), S(1.34, 0.08), [0.18, -0.07, 0.03], [0.176, -0.118, 0.055], [0.165, -0.14, 0.075]], r0: 0.042, r1: 0.015, flat: 0.5, K: 1.5, G: 0.8, suck: false, curl: 0.7 };
      return [
        backL, { ...backL, pts: mirror(backL.pts).map((p, i) => (i === 5 ? [-0.07, -0.232, -0.236] : p)) },
        outL, { ...outL, pts: mirror(outL.pts) },
        lockL, { ...lockL, pts: mirror(lockL.pts) },
        { pts: [IN(0.95, 1.12), S(0.45, 0.94, 0.002), S(-0.1, 0.77, 0.003), S(-0.6, 0.63, 0.004), S(-1.0, 0.47, 0.004), [-0.192, 0.05, 0.068]], r0: 0.048, r1: 0.017, flat: 0.4, K: 2.4, G: 0.4, suck: false, curl: 0.5 },
      ];
    })(),
    gear: 'wristbands',
  },
  { // 1 — "Spike": short upswept spikes + a front quiff
    name: 'Spike',
    strands: (() => {
      const sideL = { pts: [IN(0.85, 0.95), [0.095, 0.205, 0.0], [0.155, 0.215, -0.07], [0.195, 0.185, -0.13], [0.215, 0.14, -0.16]], r0: 0.052, r1: 0.017, flat: 0.52, K: 2.2, G: 0.3, suck: true, curl: 0.8 };
      const backL = { pts: [IN(2.25, 0.75), S(2.38, 0.42), [0.14, 0.03, -0.205], [0.155, -0.035, -0.235], [0.175, -0.06, -0.265]], r0: 0.05, r1: 0.017, flat: 0.52, K: 1.8, G: 0.6, suck: true, curl: 1.0 };
      return [
        { pts: [IN(0.15, 1.05), [0.0, 0.212, -0.02], [0.0, 0.245, -0.1], [0.0, 0.225, -0.18], [0.0, 0.18, -0.222]], r0: 0.056, r1: 0.018, flat: 0.52, K: 2.2, G: 0.3, suck: true, curl: 1.0 },
        sideL, { ...sideL, pts: mirror(sideL.pts) },
        backL, { ...backL, pts: mirror(backL.pts) },
        { pts: [IN(3.14, 0.55), S(3.14, 0.05), [0.0, -0.11, -0.205], [0.0, -0.155, -0.215], [0.0, -0.175, -0.245]], r0: 0.05, r1: 0.018, flat: 0.52, K: 1.6, G: 0.7, suck: true, curl: 0.9 },
        { pts: [IN(0.3, 1.0), [0.02, 0.2, 0.12], [-0.04, 0.218, 0.172], [-0.1, 0.19, 0.198], [-0.135, 0.152, 0.2]], r0: 0.048, r1: 0.017, flat: 0.48, K: 2.8, G: 0.2, suck: false, curl: 0.8 },
      ];
    })(),
    // under a hat the spikes are squashed flat: short flicks kick out below the rim at the back instead
    underHat: {
      strands: (() => {
        const flick = { pts: [IN(2.3, 0.62), S(2.4, 0.16), [0.134, -0.046, -0.2], [0.148, -0.09, -0.228], [0.16, -0.112, -0.25]], r0: 0.046, r1: 0.017, flat: 0.52, K: 1.8, G: 0.6, suck: true, curl: 0.7 };
        return [flick, { ...flick, pts: mirror(flick.pts) },
          { pts: [IN(3.14, 0.55), S(3.14, 0.05), [0.0, -0.11, -0.205], [0.0, -0.155, -0.215], [0.0, -0.175, -0.245]], r0: 0.05, r1: 0.018, flat: 0.52, K: 1.6, G: 0.7, suck: true, curl: 0.9 }];
      })(),
    },
    gear: 'headphones',
  },
  { // 2 — "Twin": two long tied tails + split bangs
    name: 'Twin',
    strands: (() => {
      const tailL = { pts: [IN(1.95, 0.55), S(2.0, 0.35), [0.2, 0.04, -0.105], [0.235, -0.07, -0.112], [0.242, -0.2, -0.096], [0.228, -0.305, -0.07], [0.245, -0.345, -0.035]], r0: 0.056, r1: 0.024, flat: 0.55, K: 0.85, G: 1.1, suck: true, curl: 1.1 };
      const bangL = { pts: [IN(0.55, 1.15), S(0.38, 0.9, 0.002), S(0.58, 0.72, 0.003), S(0.9, 0.56, 0.004), [0.184, 0.06, 0.078]], r0: 0.045, r1: 0.017, flat: 0.4, K: 2.6, G: 0.3, suck: false, curl: 0.6 };
      return [
        tailL, { ...tailL, pts: mirror(tailL.pts) },
        { pts: [IN(3.14, 0.9), S(3.14, 0.3), S(3.14, -0.25), [0.0, -0.14, -0.205], [0.0, -0.18, -0.232]], r0: 0.05, r1: 0.02, flat: 0.52, K: 1.4, G: 0.8, suck: true, curl: 0.9 },
        bangL, { ...bangL, pts: mirror(bangL.pts) },
      ];
    })(),
    ties: [[0.2, 0.04, -0.105, 1], [-0.2, 0.04, -0.105, -1]],
    // under a hat the tails are tied lower, just below the rim, so they hang from under it
    underHat: {
      strands: (() => {
        const tailL = { pts: [IN(1.95, 0.42), S(2.0, 0.08), [0.19, -0.03, -0.118], [0.226, -0.13, -0.116], [0.234, -0.235, -0.097], [0.222, -0.318, -0.07], [0.238, -0.35, -0.038]], r0: 0.054, r1: 0.023, flat: 0.55, K: 0.85, G: 1.1, suck: true, curl: 1.1 };
        const bangL = { pts: [IN(0.55, 1.15), S(0.38, 0.9, 0.002), S(0.58, 0.72, 0.003), S(0.9, 0.56, 0.004), [0.184, 0.06, 0.078]], r0: 0.045, r1: 0.017, flat: 0.4, K: 2.6, G: 0.3, suck: false, curl: 0.6 };
        return [tailL, { ...tailL, pts: mirror(tailL.pts) },
          { pts: [IN(3.14, 0.9), S(3.14, 0.3), S(3.14, -0.25), [0.0, -0.14, -0.205], [0.0, -0.18, -0.232]], r0: 0.05, r1: 0.02, flat: 0.52, K: 1.4, G: 0.8, suck: true, curl: 0.9 },
          bangL, { ...bangL, pts: mirror(bangL.pts) }];
      })(),
      ties: [[0.19, -0.03, -0.118, 1], [-0.19, -0.03, -0.118, -1]],
    },
    gear: 'twin',
  },
  { // 3 — "Bob": rounded bob that curls in at the jaw + side-swept bang
    name: 'Bob',
    strands: (() => {
      const mk = (az, len, r0, suck) => ({ pts: [IN(az, 0.95), S(az * 1.03, 0.45), S(az * 1.05, 0.0), O(az * 1.06, -0.32 * len, 0.05), O(az * 1.02, -0.52 * len, 0.028)], r0, r1: 0.024, flat: 0.52, K: 1.4, G: 0.85, suck, curl: -0.9 });
      const a = mk(1.3, 1.0, 0.05, false), b = mk(2.0, 1.05, 0.054, true), c = mk(2.7, 1.1, 0.056, true);
      return [a, { ...a, pts: mirror(a.pts) }, b, { ...b, pts: mirror(b.pts) }, c, { ...c, pts: mirror(c.pts) },
        { pts: [IN(-0.75, 1.15), S(-0.2, 0.9, 0.002), S(0.3, 0.75, 0.003), S(0.78, 0.6, 0.004), S(1.1, 0.44, 0.004), [0.196, 0.005, 0.058]], r0: 0.047, r1: 0.02, flat: 0.4, K: 2.4, G: 0.4, suck: false, curl: 0.5 }];
    })(),
    gear: 'bob',
  },
  { // 4 — "Pony": high fountain ponytail — a thick three-tentacle bundle gathered at the back of the crown, swept fringe
    name: 'Pony',
    strands: (() => {
      const tail = { pts: [[0, 0.12, -0.085], [0, 0.172, -0.13], [0, 0.235, -0.175], [0, 0.262, -0.235], [0, 0.235, -0.3], [0, 0.165, -0.345], [0, 0.07, -0.36], [0, -0.03, -0.345], [0, -0.11, -0.31]], r0: 0.066, r1: 0.03, taper: 1.7, flat: 1.25, K: 0.95, G: 1.05, suck: true, curl: 0.85 };
      const flank = { pts: [[0.012, 0.12, -0.085], [0.02, 0.17, -0.13], [0.04, 0.226, -0.172], [0.054, 0.246, -0.23], [0.062, 0.212, -0.29], [0.068, 0.138, -0.326], [0.074, 0.05, -0.332], [0.084, -0.03, -0.31]], r0: 0.048, r1: 0.022, taper: 1.4, flat: 1.1, K: 1.05, G: 1.0, suck: true, curl: 1.0 };
      const lock = { pts: [IN(1.06, 0.82), S(1.17, 0.42), S(1.25, 0.08), [0.183, -0.072, 0.05], [0.177, -0.122, 0.064]], r0: 0.036, r1: 0.014, flat: 0.5, K: 1.8, G: 0.7, suck: false, curl: 0.6 };
      return [
        tail, flank, { ...flank, pts: mirror(flank.pts) }, lock, { ...lock, pts: mirror(lock.pts) },
        { pts: [IN(-0.9, 1.12), S(-0.5, 0.95, 0.002), S(-0.05, 0.8, 0.003), S(0.42, 0.66, 0.004), S(0.8, 0.52, 0.004), [0.18, 0.058, 0.096]], r0: 0.046, r1: 0.018, flat: 0.4, K: 2.4, G: 0.4, suck: false, curl: 0.55 },
      ];
    })(),
    cap: { pole: [0, 0.8, -0.6] },
    tie: { at: [0, 0.172, -0.13] },
    // under a hat: a low ponytail tied at the nape, below the rim
    underHat: {
      strands: [
        { pts: [IN(3.14, 0.3), S(3.14, -0.06), [0, -0.05, -0.2], [0, -0.1, -0.236], [0, -0.148, -0.254], [0, -0.172, -0.262]], r0: 0.06, r1: 0.028, taper: 1.6, flat: 1.2, K: 1.0, G: 1.0, suck: true, curl: 0.8 },
        { pts: [IN(1.06, 0.82), S(1.17, 0.42), S(1.25, 0.08), [0.183, -0.072, 0.05], [0.177, -0.122, 0.064]], r0: 0.036, r1: 0.014, flat: 0.5, K: 1.8, G: 0.7, suck: false, curl: 0.6 },
        { pts: mirror([IN(1.06, 0.82), S(1.17, 0.42), S(1.25, 0.08), [0.183, -0.072, 0.05], [0.177, -0.122, 0.064]]), r0: 0.036, r1: 0.014, flat: 0.5, K: 1.8, G: 0.7, suck: false, curl: 0.6 },
        { pts: [IN(-0.9, 1.12), S(-0.5, 0.95, 0.002), S(-0.05, 0.8, 0.003), S(0.42, 0.66, 0.004), S(0.8, 0.52, 0.004), [0.18, 0.058, 0.096]], r0: 0.046, r1: 0.018, flat: 0.4, K: 2.4, G: 0.4, suck: false, curl: 0.55 },
      ],
      tie: { at: [0, -0.05, -0.2] },
    },
    gear: 'pony',
  },
  { // 5 — "Crest": a tall mohawk of overlapping tentacle flames along the midline, clean sides
    name: 'Crest',
    strands: (() => {
      const fin = (root, pts, r0, K = 2.4, curl = 0.9) => ({ pts: [root, ...pts], r0, r1: 0.019, taper: 1.15, flat: 1.25, K, G: 0.32, suck: false, curl, out: 'x', twist: 0 });
      return [
        fin(IN(0, 1.0), [[0, 0.212, 0.084], [0, 0.262, 0.046], [0, 0.285, -0.014], [0, 0.272, -0.07]], 0.056),
        fin(IN(0, 1.4), [[0, 0.226, 0.014], [0, 0.262, -0.036], [0, 0.265, -0.096], [0, 0.24, -0.14]], 0.058),
        fin(IN(3.14, 1.18), [[0, 0.206, -0.07], [0, 0.236, -0.12], [0, 0.226, -0.175], [0, 0.19, -0.21]], 0.056),
        fin(IN(3.14, 0.85), [[0, 0.16, -0.126], [0, 0.18, -0.18], [0, 0.156, -0.23], [0, 0.11, -0.256]], 0.052, 2.0),
        fin(IN(3.14, 0.5), [[0, 0.1, -0.172], [0, 0.104, -0.226], [0, 0.062, -0.256], [0, 0.0, -0.262]], 0.047, 1.6, 0.8),
      ];
    })(),
    // under a hat the crest is pressed flat: only its tail shows, kicking out below the rim at the nape
    underHat: {
      strands: [
        { pts: [IN(3.14, 0.4), S(3.14, -0.08), [0, -0.1, -0.205], [0, -0.13, -0.236], [0, -0.14, -0.262]], r0: 0.05, r1: 0.019, taper: 1.15, flat: 1.25, K: 1.6, G: 0.6, suck: false, curl: 0.9, out: 'x', twist: 0 },
      ],
    },
    gear: 'crest',
  },
  { // 6 — "Knot": coiled top-knot bun with two sprouting tentacle ends, long face-framing side tentacles
    name: 'Knot',
    strands: (() => {
      const C = [0, 0.214, -0.036], Rb = 0.04;
      const sprout = { pts: [[0.004, 0.238, -0.036], [0.012, 0.276, -0.04], [0.034, 0.306, -0.068], [0.068, 0.302, -0.108], [0.09, 0.272, -0.134]], r0: 0.036, r1: 0.017, flat: 0.7, K: 2.0, G: 0.45, suck: true, curl: 0.9 };
      const side = { pts: [IN(1.02, 0.86), S(1.16, 0.44), S(1.26, 0.08), [0.186, -0.075, 0.046], [0.182, -0.132, 0.058], [0.172, -0.16, 0.072]], r0: 0.042, r1: 0.017, flat: 0.52, K: 1.5, G: 0.8, suck: true, curl: 0.75 };
      return [
        knotCoil(C, Rb, 0.3), knotCoil(C, Rb, 0.3 + Math.PI),
        sprout, { ...sprout, pts: mirror(sprout.pts).map((p, i) => (i === 4 ? [-0.094, 0.262, -0.128] : p)) },
        side, { ...side, pts: mirror(side.pts) },
        { pts: [IN(3.14, 0.45), S(3.14, 0.02), [0, -0.118, -0.196], [0, -0.156, -0.212]], r0: 0.04, r1: 0.017, flat: 0.55, K: 1.6, G: 0.7, suck: true, curl: 0.8 },
      ];
    })(),
    knot: { at: [0, 0.214, -0.036], r: 0.04 },
    // under a hat: a low bun on the nape (axis pointing back and down), face-framing tentacles kept
    underHat: {
      strands: (() => {
        const C = [0, -0.075, -0.212], ax = [0, -0.34, -0.94];
        const side = { pts: [IN(1.02, 0.86), S(1.16, 0.44), S(1.26, 0.08), [0.186, -0.075, 0.046], [0.182, -0.132, 0.058], [0.172, -0.16, 0.072]], r0: 0.042, r1: 0.017, flat: 0.52, K: 1.5, G: 0.8, suck: true, curl: 0.75 };
        return [knotCoil(C, 0.034, 0.3, ax), knotCoil(C, 0.034, 0.3 + Math.PI, ax), side, { ...side, pts: mirror(side.pts) }];
      })(),
      knot: { at: [0, -0.075, -0.212], r: 0.034, axis: [0, -0.34, -0.94] },
    },
    gear: 'knot',
  },
  { // 7 — "Swoop": asymmetric side part — a heavy swoop across the brow and down the right side, short tucked left
    name: 'Swoop',
    strands: (() => [
      { pts: [IN(0.78, 1.08), S(0.42, 0.95, 0.004), S(-0.02, 0.8, 0.006), S(-0.46, 0.66, 0.006), S(-0.86, 0.5, 0.004), O(-1.1, 0.14, 0.048), O(-1.14, -0.2, 0.05), [-0.168, -0.2, 0.068]], r0: 0.058, r1: 0.022, flat: 0.44, K: 1.5, G: 0.7, suck: false, curl: 0.7 },
      { pts: [IN(0.95, 1.3), S(0.35, 1.2), S(-0.35, 1.0), S(-0.95, 0.72), S(-1.25, 0.36), O(-1.34, 0.0, 0.052), [-0.18, -0.17, 0.012], [-0.17, -0.225, 0.02]], r0: 0.056, r1: 0.022, flat: 0.5, K: 1.2, G: 0.9, suck: true, curl: 0.8 },
      { pts: [IN(1.5, 1.35), S(-1.8, 1.2), S(-2.05, 0.7), S(-2.12, 0.2), [-0.15, -0.1, -0.13], [-0.148, -0.19, -0.14]], r0: 0.052, r1: 0.02, flat: 0.52, K: 1.2, G: 0.9, suck: true, curl: 0.8 },
      { pts: [IN(-2.5, 0.95), S(-2.66, 0.44), S(-2.8, -0.06), [-0.062, -0.16, -0.2], [-0.07, -0.236, -0.214]], r0: 0.05, r1: 0.019, flat: 0.52, K: 1.3, G: 0.9, suck: true, curl: 0.85 },
      { pts: [IN(1.35, 0.95), S(1.62, 0.52), S(1.9, 0.2), [0.172, -0.02, -0.108], [0.15, -0.055, -0.14]], r0: 0.04, r1: 0.016, flat: 0.52, K: 2.0, G: 0.5, suck: true, curl: 1.0 },
      { pts: [IN(2.62, 0.85), S(2.76, 0.4), S(2.86, -0.02), [0.05, -0.1, -0.2]], r0: 0.044, r1: 0.017, flat: 0.52, K: 1.8, G: 0.6, suck: true, curl: 1.0 },
    ])(),
    cap: { pole: [0.52, 0.8, 0.3] },
    gear: 'swoop',
  },
];
export const HAIR_STYLE_NAMES = STYLES.map((s) => s.name);

function strandPoint(cp, r0, flat, out) {
  if (cp[0] === 's') { const [, az, el, extra = 0] = cp; return headSurf(az, el, capOffset(az, el) + r0 * flat * 0.42 + extra, out); }
  if (cp[0] === 'in') { const [, az, el] = cp; return headSurf(az, el, capOffset(az, el) - 0.012, out); }
  if (cp[0] === 'o') { const [, az, el, off] = cp; return headSurf(az, el, off, out); }
  return out.set(cp[0], cp[1], cp[2]).add(HEAD_C);
}

// gear encoding for the hair material: aTint = -2 - class (0 plastic, 1 metal, 2 fabric, 3 rubber);
// colour: literal rgb, or code (r = -1 team, -2 shirt, -3 strap, -4 shorts) × g
const GEAR = { plastic: -2, metal: -3, fabric: -4, rubber: -5 };
const gcol = (code, k = 1) => new THREE.Color(code, k, 0);

/** Style accessories, built into the hair mesh (per style, skinned to the full skeleton). */
function addGear(B, style, strandInfo, hatCtx = null) {
  const kind = style.gear;
  const hidden = (p) => !!hatCtx && hatCtx.hidden(p); // accessories a hat covers are not built
  const hb = (si, k) => `hair${strandInfo[si].bi}_${k}`; // bone of a style strand (indices shift when a hat drops some)
  if (kind === 'wristbands') {
    for (const [s] of [['L'], ['R']]) {
      const el = R['fArm' + s], wr = R['hand' + s];
      const fd = wr.clone().sub(el).normalize();
      const side = new V3(1, 0, 0).addScaledVector(fd, -fd.x).normalize(), fw = new V3().crossVectors(fd, side).normalize();
      const nT = 20, c0 = wr.clone().addScaledVector(fd, -0.026);
      // follows the forearm's flattened wrist section (lateral axis is 0.84 × the radius)
      const ra = ARM_RADIUS(0.893) + 0.0004;
      const prof = [[-0.0105, 0.0006], [-0.0098, 0.0027], [-0.0082, 0.0036], [0.0082, 0.0036], [0.0098, 0.0027], [0.0105, 0.0006]];
      const rows = prof.map(([a, dr]) => { const row = []; for (let i = 0; i < nT; i++) { const th = (i / nT) * TAU; row.push(c0.clone().addScaledVector(fd, a).addScaledVector(side, (ra * ARM_FLAT(0.893) + dr) * Math.cos(th)).addScaledVector(fw, (ra + dr) * Math.sin(th))); } return row; });
      const g = gridGeo(rows, { wrapU: true, outward: (p, out) => { const k = p.clone().sub(c0).dot(fd); out.copy(c0).addScaledVector(fd, k); } });
      B.add(g, { ex: GEAR.fabric, color: (p) => { const k = p.clone().sub(c0).dot(fd); return Math.abs(k) < 0.0022 ? _c.setRGB(0.96, 0.96, 0.95) : gcol(-1, 1); }, bone: 'fArm' + s });
    }
  } else if (kind === 'headphones') {
    const tp = new V3();
    const cups = [];
    for (const sx of [1, -1]) {
      const c = teePoint(0.62 * sx, 0.964, 0.012, tp).clone();
      const n = new V3(c.x * 1.4, 0.55, c.z + 0.02).normalize();
      cups.push({ sx, c, n });
      const prof = [[0, -0.001], [0.021, -0.001], [0.0255, 0.0035], [0.026, 0.008], [0.0245, 0.0095], [0.0265, 0.011], [0.0268, 0.018], [0.0235, 0.0235], [0.012, 0.0262], [0, 0.0265]];
      const cg = lathe(prof, 12);
      const P = cg.attributes.position;
      alongAxis(cg, c, n.clone().negate());
      B.add(cg, {
        ex: (p, i) => (i < P.count && cgY(cg, i, c, n) < 0.0098 ? GEAR.fabric : GEAR.plastic),
        color: (p, i) => { const h = cgY(cg, i, c, n); const r = radial(cg, i, c, n); return h < 0.0098 ? _c.setRGB(0.1, 0.1, 0.12) : (h > 0.021 && r < 0.017 ? gcol(-1, 1) : gcol(-3, 1.15)); },
        weights: () => [['chest', 1]],
      });
    }
    // headband resting behind the neck
    const [L, Rr] = cups;
    const top = (cp) => cp.c.clone().addScaledVector(cp.n, 0.02);
    const pts = [top(L), new V3(0.064, 1.0, -0.012), new V3(0.045, 1.012, -0.05), new V3(0, 1.016, -0.064), new V3(-0.045, 1.012, -0.05), new V3(-0.064, 1.0, -0.012), top(Rr)];
    const sw = sweep(pts, { seg: 16, radial: 6, capSteps: 2, radius: () => 0.0062, flat: 0.45, outward: (P, o) => o.set(P.x, 0, P.z + 0.006).normalize() });
    B.add(sw.geo, { ex: GEAR.plastic, color: gcol(-3, 1.15), weights: (p) => { const w = sstep(-0.01, -0.05, p.z) * 0.6; return [['chest', 1 - w], ['neck', w]]; } });
    // kneepad on the right knee
    const kn = R.shinR;
    const pad = superEllipsoid(0.034, 0.043, 0.0105, 0.42, 0.5, 10, 8, (q) => { q.z -= 16 * q.x * q.x; });
    pad.translate(kn.x, kn.y + 0.006, kn.z + 0.052);
    B.add(pad, { ex: GEAR.plastic, color: gcol(-1, 1), weights: () => [['shinR', 0.65], ['thighR', 0.35]] });
    const padIn = superEllipsoid(0.02, 0.026, 0.004, 0.5, 0.5, 8, 5, (q) => { q.z -= 16 * q.x * q.x; });
    padIn.translate(kn.x, kn.y + 0.006, kn.z + 0.0628);
    B.add(padIn, { ex: GEAR.rubber, color: _c.setRGB(0.12, 0.12, 0.14), weights: () => [['shinR', 0.65], ['thighR', 0.35]] });
    for (const dy of [0.034, -0.028]) {
      const axisC = kn.clone().add(new V3(0, dy, 0));
      const r0 = 0.0435 - (dy < 0 ? 0.004 : 0);
      const prof = [[-0.0055, r0], [-0.0045, r0 + 0.0028], [0.0045, r0 + 0.0028], [0.0055, r0]];
      const rows = prof.map(([a, r]) => Array.from({ length: 14 }, (_, i) => { const th = (i / 14) * TAU; return axisC.clone().add(new V3(r * Math.sin(th), a, r * 0.96 * Math.cos(th) + 0.004)); }));
      const g = gridGeo(rows, { wrapU: true, outward: (p, out) => out.set(axisC.x, p.y, axisC.z + 0.004) });
      B.add(g, { ex: GEAR.fabric, color: _c.setRGB(0.13, 0.13, 0.15), weights: () => [[dy > 0 ? 'thighR' : 'shinR', 0.75], [dy > 0 ? 'shinR' : 'thighR', 0.25]] });
    }
  } else if (kind === 'twin') {
    // bobble ties at the tail roots
    for (const tie of style.ties || []) {
      const [x, y, z, sx] = tie;
      const si = sx > 0 ? 0 : 1;
      if (!strandInfo[si] || hidden(new V3(x, y, z).add(HEAD_C))) continue;
      const g = torus(0.036, 0.0105, 8, 18); g.rotateY(Math.PI / 2 - 0.25 * sx); g.rotateZ(0.5 * sx);
      g.translate(HEAD_C.x + x, HEAD_C.y + y, HEAD_C.z + z);
      B.add(g, { ex: GEAR.fabric, color: gcol(-2, 1.0), bone: hb(si, 0) });
      const bead = superEllipsoid(0.0135, 0.0135, 0.0135, 1, 1, 12, 8);
      bead.translate(HEAD_C.x + x + 0.012 * sx, HEAD_C.y + y + 0.036, HEAD_C.z + z + 0.004);
      B.add(bead, { ex: GEAR.plastic, color: gcol(-1, 1.18), bone: hb(si, 0) });
    }
    // star clip on the left bang
    const info = strandInfo[3];
    const smp = info && info.sample(0.45);
    if (smp && !hidden(smp.P)) {
      const sh = new THREE.Shape();
      for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + (k / 10) * TAU; const r = k % 2 ? 0.0068 : 0.0155; const px = Math.cos(a) * r, py = Math.sin(a) * r; if (k === 0) sh.moveTo(px, py); else sh.lineTo(px, py); }
      const st = finalize(new THREE.ExtrudeGeometry(sh, { depth: 0.0026, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 2 }));
      const up = new V3(0, 1, 0);
      placeBasis(st, new V3().crossVectors(up, smp.o).normalize(), up, smp.P.clone().addScaledVector(smp.o, smp.r * 0.52));
      B.add(st, { ex: GEAR.plastic, color: _c.setRGB(0.98, 0.94, 0.62), bone: hb(3, 1) });
    }
  } else if (kind === 'bob') {
    // twin-bar barrette on the side-swept bang
    const info = strandInfo[6];
    if (info) {
      for (const [t, k] of [[0.62, 0], [0.7, 1]]) {
        const smp = info.sample(t);
        if (!smp || hidden(smp.P)) continue;
        const bar = superEllipsoid(0.0035, 0.017, 0.0022, 0.5, 0.6, 6, 8);
        const across = new V3().crossVectors(smp.T, smp.o).normalize();
        placeBasis(bar, smp.T, across, smp.P.clone().addScaledVector(smp.o, smp.r * 0.44));
        B.add(bar, { ex: GEAR.metal, color: k ? _c.setRGB(0.96, 0.8, 0.46) : gcol(-1, 1), bone: hb(6, 1) });
      }
    }
    // carabiner + squid charm on the left hip, under the tee hem
    const c0 = new V3(0.118, 0.683, 0.012);
    const ring = torus(0.0105, 0.0019, 5, 16); ring.scale(1, 1.45, 1); ring.rotateY(Math.PI / 2 - 0.25); ring.translate(c0.x, c0.y, c0.z);
    B.add(ring, { ex: GEAR.metal, color: gcol(-1, 1), bone: 'hips' });
    const gate = superEllipsoid(0.0016, 0.009, 0.0016, 0.8, 0.8, 4, 4); gate.translate(c0.x + 0.0012, c0.y, c0.z + 0.0085);
    B.add(gate, { ex: GEAR.metal, color: _c.setRGB(0.8, 0.82, 0.86), bone: 'hips' });
    const charm = superEllipsoid(0.0078, 0.011, 0.0055, 0.9, 0.9, 10, 8, (q) => { if (q.y > 0) { q.x *= 1 - 0.55 * (q.y / 0.011); q.z *= 1 - 0.3 * (q.y / 0.011); } });
    charm.translate(c0.x + 0.001, c0.y - 0.031, c0.z + 0.001);
    B.add(charm, { ex: GEAR.plastic, color: gcol(-1, 1.12), bone: 'hips' });
    for (const sx of [1, -1]) { const e = superEllipsoid(0.0016, 0.0019, 0.001, 1, 1, 6, 4); e.translate(c0.x + 0.0072, c0.y - 0.032, c0.z + 0.001 + 0.0032 * sx); B.add(e, { ex: GEAR.plastic, color: _c.setRGB(0.02, 0.02, 0.03), bone: 'hips' }); }
  } else if (kind === 'pony') {
    // chunky ruffled scrunchie gathering the tail (rides on the tail's root bone so the tail never slides out of it)
    const info = strandInfo[0];
    const at = style.tie && new V3(...style.tie.at).add(HEAD_C);
    if (info && at && !hidden(at)) {
      const t = closestT(info.sw.curve, at);
      const smp = info.sw.sample(t);
      const R0 = smp.r * 0.98 + 0.004;
      const g = ruffledRing(R0, 0.0135, 13, 0.0032, 10, 44);
      placeBasis(g, smp.o, smp.T, smp.P);
      B.add(g, { ex: GEAR.fabric, color: gcol(-2, 1.0), bone: hb(0, 0) });
      // a small team-ink bead knotted on the scrunchie
      const bead = superEllipsoid(0.0118, 0.0118, 0.0118, 1, 1, 12, 8);
      const bp = smp.P.clone().addScaledVector(smp.o, R0 + 0.012).addScaledVector(smp.b, 0.006);
      bead.translate(bp.x, bp.y, bp.z);
      B.add(bead, { ex: GEAR.plastic, color: gcol(-1, 1.18), bone: hb(0, 0) });
    }
  } else if (kind === 'crest') {
    // two small hoops through the rim of the left ear (punk detail to go with the mohawk)
    const root = headSurf(EAR.az, EAR.el, -0.0085, new V3());
    const A = new V3(0.63, 0.43, -0.65).normalize();
    const F = new V3(0.46, 0.1, 0.88); F.addScaledVector(A, -F.dot(A)).normalize();
    const W = new V3().crossVectors(A, F).normalize();
    const up = W.y > 0 ? 1 : -1;
    for (const u of [0.42, 0.58]) {
      const w = 0.0268 * Math.pow(1 - u, 0.8) * sstep(-0.4, 0.28, u) + 0.0011;
      const e = root.clone().addScaledVector(A, u * 0.106).addScaledVector(F, -0.011 * u * u).addScaledVector(W, up * w);
      const ring = torus(0.0056, 0.0011, 5, 16);
      placeBasis(ring, W, F, e);
      B.add(ring, { ex: GEAR.metal, color: _c.setRGB(0.86, 0.87, 0.9), bone: 'earL' });
    }
  } else if (kind === 'knot') {
    // wrapped band at the base of the bun + a lacquered hairpin through it (both ride on the first coil's root)
    const K0 = new V3(...style.knot.at).add(HEAD_C), Rb = style.knot.r;
    if (!strandInfo[0] || hidden(K0)) return;
    const kb = hb(0, 0), ax = new V3(...(style.knot.axis || [0, 1, 0])).normalize();
    const kq = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), ax);
    const kp = (x, y, z) => new V3(x, y, z).applyQuaternion(kq).add(K0);
    const band = torus(Rb * 1.08, 0.0082, 8, 28); band.rotateX(Math.PI / 2); band.scale(1, 1.3, 1);
    band.translate(0, -Rb * 0.62, 0); band.applyQuaternion(kq); band.translate(K0.x, K0.y, K0.z);
    B.add(band, { ex: GEAR.fabric, color: gcol(-3, 1.25), bone: kb });
    const a = kp(-0.088, 0.002, 0.014), b = kp(0.09, 0.024, -0.014);
    const pin = sweep([a, a.clone().lerp(b, 0.5).add(kp(0, 0.004, 0).sub(K0)), b], { seg: 6, radial: 6, capSteps: 2, radius: (t) => lerp(0.0036, 0.0027, t) });
    B.add(pin.geo, { ex: GEAR.plastic, color: _c.setRGB(0.06, 0.06, 0.08), bone: kb });
    const ball = superEllipsoid(0.011, 0.011, 0.011, 1, 1, 12, 8); const bc = b.clone().addScaledVector(b.clone().sub(a).normalize(), 0.007);
    ball.translate(bc.x, bc.y, bc.z);
    B.add(ball, { ex: GEAR.plastic, color: gcol(-1, 1.15), bone: kb });
  } else if (kind === 'swoop') {
    // two crossed enamel bobby pins holding the short side back (on the scalp above the left ear)
    for (const [a0, tilt] of [[0.0, 0.55], [0.018, -0.5]]) {
      const n = new V3(); const c = headSurf(1.2 + a0, 0.5, capOffset(1.2 + a0, 0.5) + 0.0045, new V3(), n);
      if (hidden(c)) continue;
      const along = new V3(0, 1, 0).addScaledVector(n, -n.y).normalize();
      const side = new V3().crossVectors(n, along).normalize();
      along.multiplyScalar(Math.cos(tilt)).addScaledVector(side, Math.sin(tilt)).normalize();
      const pinG = superEllipsoid(0.0034, 0.024, 0.0022, 0.45, 0.6, 6, 10, (q) => { q.z -= 3.2 * q.y * q.y; });
      placeBasis(pinG, new V3().crossVectors(along, n), along, c);
      B.add(pinG, { ex: GEAR.plastic, color: gcol(-1, 1.12), bone: 'head' });
    }
  }
}
/** Parameter of the curve point closest to `p` (coarse scan + refine). */
function closestT(curve, p) {
  let best = 0, bd = 1e9; const q = new V3();
  for (let k = 0; k <= 200; k++) { curve.getPointAt(k / 200, q); const d = q.distanceToSquared(p); if (d < bd) { bd = d; best = k / 200; } }
  return best;
}
/** Ruffled ring (scrunchie) around +Y: ring radius R, tube radius r with `n` puffs of amplitude `amp`. */
function ruffledRing(R, r, n, amp, rs, ts) {
  const g = new THREE.TorusGeometry(R, r, rs, ts);
  const P = g.attributes.position; const v = new V3(), c = new V3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    const th = Math.atan2(v.y, v.x);
    c.set(Math.cos(th) * R, Math.sin(th) * R, 0);
    const d = v.clone().sub(c); const cp = d.dot(c) / (R * r); // cos(psi): +1 on the outer rim
    const puff = 1 + (amp / r) * Math.cos(th * n) * (0.55 + 0.45 * cp);
    d.multiplyScalar(puff); d.z *= 1.15;
    v.copy(c).add(d); P.setXYZ(i, v.x, v.y, v.z);
  }
  g.rotateX(-Math.PI / 2);
  return finalize(g);
}
// helpers for the headphone cup lathe (height along the cup axis / radius from it)
function cgY(g, i, c, n) { const P = g.attributes.position; return (P.getX(i) - c.x) * n.x + (P.getY(i) - c.y) * n.y + (P.getZ(i) - c.z) * n.z; }
function radial(g, i, c, n) { const P = g.attributes.position; const v = new V3(P.getX(i) - c.x, P.getY(i) - c.y, P.getZ(i) - c.z); const h = v.dot(n); return v.addScaledVector(n, -h).length(); }

/** Hairline-aligned scalp cap with a thick rolled lip. */
function buildCap(pole = null, hat = null) {
  const nA = 48, K = 10;
  const rowsSpec = [[-0.012, 'in'], [-0.006, 'lip0'], [0.0, 'lip1'], [0.016, 'lip2'], [0.042, 'full']];
  const azs = []; for (let i = 0; i < nA; i++) azs.push(-Math.PI + (i / nA) * TAU);
  const rows = [], meta = [];
  const pushRow = (fn) => { const r = [], m = []; for (const az of azs) { const [p, el, g] = fn(az); r.push(p); m.push([az, el, g]); } rows.push(r); meta.push(m); };
  const scal = (az) => 0.5 + 0.5 * Math.cos(az * 11 + 0.4);
  for (const [del, kind] of rowsSpec) {
    pushRow((az) => {
      const k = scal(az);
      const h = hairline(az) + 0.016 * (1 - k) * (kind === 'full' ? 0.4 : 1), el = h + del, T = capOffset(az, el);
      const lip = 0.72 + 0.28 * k;
      const off = kind === 'in' ? -0.0048 : kind === 'lip0' ? -0.0006 : kind === 'lip1' ? T * 0.5 * lip : kind === 'lip2' ? T * 0.88 * lip : T * (0.9 + 0.1 * k);
      return [headSurf(az, el, off, new V3()), el, 0];
    });
  }
  for (let k = 1; k <= K; k++) {
    pushRow((az) => {
      const h = hairline(az), e0 = h + 0.042;
      const el = lerp(e0, 1.5, Math.pow(k / K, 1.15));
      return [headSurf(az, el, capOffset(az, el), new V3()), el, clamp((el - h) / 0.25, 0, 1)];
    });
  }
  const top = headSurf(0, Math.PI / 2, capOffset(0, Math.PI / 2), new V3());
  // under a dome hat the cap is never seen: drop every quad well inside the rim (and the pole fan)
  const under = hat && hat.rim ? (i, j) => { for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const m = meta[Math.min(rows.length - 1, j + dj)][(i + di) % nA]; if (m[1] < hat.rim(m[0]) + 0.09) return false; } return true; } : null;
  const g = gridGeo(rows, { wrapU: true, poles: under ? {} : { end: top }, skip: under, outward: HEAD_C, uv: (i, j) => [meta[j][i % nA][0], meta[j][i % nA][1]], poleUv: { end: [0, Math.PI / 2] } });
  // uv = stereographic coordinates of the head direction about the style's groove pole (the crown by default; the
  // ponytail tie or the side part for styles that gather their hair elsewhere). The shader rebuilds (az, el) about that
  // pole per fragment, so the bundle grooves radiate from it with no interpolation seam.
  {
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(...(pole || [0, 1, 0])).normalize(), new V3(0, 1, 0));
    const UV = g.attributes.uv, d = new V3();
    for (let i = 0; i < UV.count; i++) {
      dirAE(UV.getX(i), UV.getY(i), d).applyQuaternion(q);
      UV.setXY(i, d.x / (1 + d.y), d.z / (1 + d.y));
    }
  }
  const col = new Float32Array(g.attributes.position.count * 3);
  const nc = nA + 1;
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < nc; i++) { const k = j * nc + i; col[k * 3] = 0; col[k * 3 + 1] = meta[j][i % nA][2]; col[k * 3 + 2] = 2.0; }
  if (!under) { const last = g.attributes.position.count - 1; col[last * 3 + 1] = 1; col[last * 3 + 2] = 2.0; }
  return { geo: g, col };
}

// ------------------------------------------------------------------------------------------------
// Headgear (style.hat). Dome hats built into the hair mesh (same skinning / material as the style's gear):
//  • rim(az): the hat's edge as a head elevation per azimuth (clears the brows at the front and the ears at the sides);
//  • every tentacle is re-rooted where it leaves the rim: the covered part is not built, the bone chain starts at the
//    exit so the springs swing only what shows, and strands that would leave through the crown (spikes, crests, high
//    buns — anything that exits more than exitMax off the scalp) are dropped; styles with a hat-compatible variant
//    (`underHat`: low ponytail, low bun, low twin tails) switch to it;
//  • the inner surface sits on the scalp cap and flares over the hair emerging at the rim (a blurred height field of
//    the kept strands near their exits), so nothing pokes through at rest or when the strands swing outward.
// ------------------------------------------------------------------------------------------------
const rimTable = (tab) => { const k = tab.map((e) => e[0]), v = tab.map((e) => e[1]); return (az) => interpTable(k, v, Math.abs(az)); };
export const HAT_KINDS = [
  { name: 'none' },
  { // snapback: structured six-panel crown (taller at the front), curved bill, strap + snaps at the back
    name: 'cap', cls: 4, col: [-3, 1.22], thick: 0.0058, exitMax: 0.05, flare: 0.006, rows: [0, 0.025, 0.07, 0.14, 0.22, 0.32], crown: 8,
    rim: rimTable([[0, 0.63], [0.6, 0.6], [1.2, 0.42], [1.6, 0.29], [2.3, 0.12], [Math.PI, 0.03]]),
    lift: (az, el) => 0.019 * Math.max(0, Math.cos(az)) ** 1.5 * sstep(0.62, 1.05, el) * (1 - 0.35 * sstep(1.25, 1.57, el)) + 0.012 * sstep(0.75, 1.45, el),
    shape: () => 0,
  },
  { // beanie: knit dome with a folded cuff (team stripe) and a pom-pom
    name: 'beanie', cls: 5, col: [-2, 1.0], thick: 0.0085, exitMax: 0.052, flare: 0.009, rows: [0, 0.012, 0.09, 0.17, 0.186, 0.196, 0.206, 0.22, 0.27, 0.32], crown: 7,
    rim: rimTable([[0, 0.67], [0.6, 0.62], [1.2, 0.43], [1.6, 0.28], [2.3, 0.05], [Math.PI, -0.05]]),
    lift: (az, el) => 0.006 + 0.013 * Math.max(0, -Math.cos(az)) * sstep(0.3, 1.1, el) * (1 - 0.5 * sstep(1.2, 1.57, el)),
    shape: (az, e) => 0.0068 * sstep(-0.01, 0.012, e) * (1 - sstep(0.188, 0.206, e)) + 0.0012 * gauss(e - 0.197, 0.008),
  },
  { // bucket hat: soft crown with a team band, stitched brim all the way round (sloping down)
    name: 'bucket', cls: 6, col: [-4, 1.06], thick: 0.0062, exitMax: 0.05, flare: 0.008, rows: [0, 0.03, 0.08, 0.14, 0.22, 0.32], crown: 7,
    rim: rimTable([[0, 0.63], [0.6, 0.59], [1.2, 0.43], [1.6, 0.31], [2.3, 0.12], [Math.PI, 0.04]]),
    lift: (az, el) => 0.016 * sstep(0.45, 1.0, el) * (1 - 0.55 * sstep(1.15, 1.57, el)) + 0.004,
    shape: () => 0,
  },
];

/** Classify every strand against a dome hat and build the clearance field the hat's inner surface follows. */
function analyseHat(hat, specs) {
  const N = 180; const tmp = new V3(), d = new V3(), sk = new V3();
  const cut = []; const hs = [];
  for (const sp of specs) {
    const S = []; let last = -1;
    for (let k = 0; k <= N; k++) {
      const t = k / N; sp.curve.getPointAt(t, tmp);
      d.subVectors(tmp, HEAD_C); const r = d.length(); d.divideScalar(r);
      const el = Math.asin(clamp(d.y, -1, 1)), az = Math.atan2(d.x, d.z);
      const off = r - headShape(d.x, d.y, d.z, sk).length();
      if (el > hat.rim(az)) last = k;
      S.push({ az, el, top: off + sp.top(t), off, w: sp.radius(t) });
    }
    if (last < 0) { cut[sp.si] = { keep: true, tExit: 0 }; continue; }
    const kx = Math.min(N, last + 1), tExit = kx / N;
    if (tExit > 0.88 || S[kx].off > hat.exitMax) { cut[sp.si] = { keep: false, tExit }; continue; }
    cut[sp.si] = { keep: true, tExit };
    // the hidden stub (built from tExit - 0.045) and the first free stretch below the rim must clear the hat
    for (let k = Math.max(0, kx - Math.ceil(0.075 * N)); k <= Math.min(N, kx + Math.ceil(0.035 * N)); k++) hs.push(S[k]);
  }
  // clearance field (radial height above the skin) on an (az, el) grid: splat, dilate, blur
  const nA = 72, nE = 40, e0 = -0.4, e1 = 1.6;
  let F = new Float32Array(nA * nE);
  const ang = (a1, e1_, a2, e2) => { const da = Math.atan2(Math.sin(a1 - a2), Math.cos(a1 - a2)) * Math.cos((e1_ + e2) / 2); return Math.hypot(da, e1_ - e2); };
  for (const sm of hs) {
    const rho = sm.w / 0.17 + 0.05;
    for (let j = 0; j < nE; j++) {
      const el = e0 + (j / (nE - 1)) * (e1 - e0); if (Math.abs(el - sm.el) > rho) continue;
      for (let i = 0; i < nA; i++) {
        const az = -Math.PI + (i / nA) * TAU;
        if (ang(az, el, sm.az, sm.el) < rho) F[j * nA + i] = Math.max(F[j * nA + i], sm.top);
      }
    }
  }
  const pass = (fn) => { const G = new Float32Array(nA * nE); for (let j = 0; j < nE; j++) for (let i = 0; i < nA; i++) { let acc = fn === 'max' ? 0 : 0, n = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = clamp(j + dj, 0, nE - 1), ii = (i + di + nA) % nA; const v = F[jj * nA + ii]; if (fn === 'max') acc = Math.max(acc, v); else { acc += v; n++; } } G[j * nA + i] = fn === 'max' ? acc : acc / n; } F = G; };
  pass('max'); pass('max'); pass('avg'); pass('avg');
  const H = (az, el) => {
    const fi = ((az + Math.PI) / TAU) * nA, fj = clamp(((el - e0) / (e1 - e0)) * (nE - 1), 0, nE - 1.001);
    const i0 = Math.floor(fi), j0 = Math.floor(fj), a = fi - i0, b = fj - j0;
    const at = (i, j) => F[j * nA + (((i % nA) + nA) % nA)];
    return lerp(lerp(at(i0, j0), at(i0 + 1, j0), a), lerp(at(i0, j0 + 1), at(i0 + 1, j0 + 1), a), b);
  };
  // inner surface: sits on the scalp cap; near the rim it may flare (≤ hat.flare) over the hair that emerges there —
  // the rest of that hair is tucked flat under the rim instead (see tuck), so the crown stays a clean shape
  const base = (az, el) => capOffset(az, el) + 0.0045 + hat.lift(az, el);
  const offIn = (az, el) => { const b = base(az, el); const rz = 1 - sstep(0.05, 0.2, el - hat.rim(az)); return b + rz * clamp(H(az, el) + 0.0028 - b, 0, hat.flare); };
  // max radial offset allowed for hair geometry at (az, el): under the hat, just inside its inner surface; below the
  // rim it opens up quickly so the tentacles fan out from under the edge
  const tuck = (az, el) => {
    const rim = hat.rim(az);
    if (el >= rim) return offIn(az, el) - 0.0015;
    const k = (rim - el) / 0.075; return k >= 1 ? Infinity : offIn(az, rim) - 0.0015 + 0.05 * k * k;
  };
  const hidden = (p) => {
    d.subVectors(p, HEAD_C); const r = d.length(); d.divideScalar(r);
    const el = Math.asin(clamp(d.y, -1, 1)), az = Math.atan2(d.x, d.z);
    if (el < hat.rim(az) - 0.015) return false;
    return r - headShape(d.x, d.y, d.z, sk).length() < offIn(az, el) + hat.thick + 0.004;
  };
  return { cut, H, offIn, tuck, hidden, hat };
}

/** Build the hat mesh (dome + its trims) into the hair builder. */
function buildHat(B, hat, ctx) {
  const nA = 48, T = hat.thick, offIn = ctx.offIn;
  const azs = []; for (let i = 0; i < nA; i++) azs.push(-Math.PI + (i / nA) * TAU);
  const at = (az, el, off, out = new V3(), nOut = undefined) => headSurf(az, el, off, out, nOut);
  const outer = (az, e) => { const el = hat.rim(az) + e; return offIn(az, el) + T + hat.shape(az, e); };
  // rows: hidden inner tuck → rounded lip → outer surface (dense near the rim for cuffs/bands) → crown → pole
  const rowE = [], rowOff = [], rowV = [];
  const addRow = (eFn, offFn, v) => { rowE.push(eFn); rowOff.push(offFn); rowV.push(v); };
  addRow(() => 0.07, (az, e) => offIn(az, hat.rim(az) + e), -0.08);
  addRow(() => 0.0, (az, e) => offIn(az, hat.rim(az) + e), -0.03);
  addRow(() => -0.0055, (az, e) => offIn(az, hat.rim(az)) + T * 0.5 + hat.shape(az, 0) * 0.5, -0.015);
  for (const e of hat.rows) addRow(() => e, (az, ee) => outer(az, ee), e);
  const top = (az) => 1.5 - hat.rim(az) - 0.32;
  for (let k = 1; k <= hat.crown; k++) { const f = k / hat.crown; addRow((az) => 0.32 + top(az) * Math.pow(f, 0.92), (az, ee) => outer(az, ee), 0.32 + f); }
  const rows = rowE.map((eFn, j) => azs.map((az) => { const e = eFn(az); return at(az, hat.rim(az) + e, rowOff[j](az, e)); }));
  const pole = at(0, Math.PI / 2, offIn(0, Math.PI / 2) + T);
  const dome = gridGeo(rows, { wrapU: true, poles: { end: pole }, outward: HEAD_C, uv: (i, j) => [i / nA, rowV[j]], poleUv: { end: [0.5, 1.4] } });
  const tint = -2 - hat.cls;
  B.add(dome, { ex: tint, uv: true, color: gcol(hat.col[0], hat.col[1]), bone: 'head' });
  const n = new V3(), p = new V3();
  if (hat.name === 'cap') {
    // bill: a curved half-ellipse plate hanging off the front rim (top in the crown colour, team underside)
    const nu = 18, ns = 7, L0 = 0.084, TH = 0.0052;
    const base = (u, out) => { const az = u * 0.98; const el = hat.rim(az); return at(az, el, offIn(az, el) + T * 0.6, out); };
    const dirAt = (u) => { const az = u * 0.98; return new V3(Math.sin(az) * 1.0, -0.24, Math.cos(az)).normalize(); };
    const topPt = (u, sN) => {
      const L = L0 * Math.sqrt(Math.max(0, 1 - u * u)) + 0.004;
      const q = base(u, new V3()).addScaledVector(dirAt(u), sN * L);
      q.y -= 0.02 * u * u * sN + 0.004 * sN * sN;   // curved bill: sides droop
      return q;
    };
    const loop = []; // cross-section: top from base → edge, round the front edge, bottom back to base
    const sTop = [0, 0.2, 0.45, 0.7, 0.88, 1.0];
    for (const sN of sTop) loop.push([sN, 0]);
    loop.push([1.02, 0.5]);
    for (const sN of [...sTop].reverse()) loop.push([sN, 1]);
    const rowsB = [];
    for (let k = 0; k <= nu; k++) {
      const u = -1 + (2 * k) / nu;
      rowsB.push(loop.map(([sN, side]) => { const q = topPt(u, Math.min(1, sN)); if (side === 1) q.y -= TH; else if (side === 0.5) { q.y -= TH * 0.5; q.addScaledVector(dirAt(u), 0.0022); } return q; }));
    }
    const bill = gridGeo(rowsB, { wrapU: true, outward: (q, out) => { out.set(0, q.y + 0.5, 0); }, uv: (i, j) => [j / nu, 2 + (i < loop.length ? loop[i][0] + (loop[i][1] > 0.75 ? 1.2 : 0) : 0)] });
    B.add(bill, { ex: tint, uv: true, color: (q, i) => { const uvA = bill.attributes.uv; return uvA.getY(i) > 3.1 ? gcol(-1, 0.86) : gcol(hat.col[0], hat.col[1]); }, bone: 'head' });
    // top button
    const btn = superEllipsoid(0.0105, 0.0052, 0.0105, 0.7, 1, 12, 6);
    at(0, Math.PI / 2, offIn(0, Math.PI / 2) + T + 0.001, p); btn.translate(p.x, p.y, p.z);
    B.add(btn, { ex: tint, color: gcol(-1, 1.0), bone: 'head' });
    // back strap + snaps
    {
      const e = 0.04, az = Math.PI; const c = at(az, hat.rim(az) + e, outer(az, e) + 0.0012, new V3(), n);
      const strap = superEllipsoid(0.034, 0.0072, 0.0022, 0.35, 0.4, 12, 6, (q) => { q.z -= 3.5 * q.x * q.x; });
      placeBasis(strap, new V3(-1, 0, 0), new V3(0, 1, 0), c);
      B.add(strap, { ex: GEAR.plastic, color: _c.setRGB(0.08, 0.08, 0.1), bone: 'head' });
      for (const x of [-0.018, -0.006, 0.006, 0.018]) {
        const snap = superEllipsoid(0.0026, 0.0026, 0.0014, 1, 1, 8, 4);
        placeBasis(snap, new V3(-1, 0, 0), new V3(0, 1, 0), c.clone().add(new V3(x, 0, -0.0026)));
        B.add(snap, { ex: GEAR.plastic, color: _c.setRGB(0.16, 0.16, 0.19), bone: 'head' });
      }
    }
  } else if (hat.name === 'beanie') {
    // pom-pom: a fluffy ball of yarn on top (team colour)
    const pom = superEllipsoid(0.03, 0.027, 0.03, 1, 1, 14, 10, (q) => { const k = 1 + 0.09 * Math.sin(q.x * 420) * Math.sin(q.y * 390 + 1.3) * Math.sin(q.z * 410 + 2.1); q.multiplyScalar(k); });
    at(0, 1.5, offIn(0, 1.5) + T + 0.018, p); pom.translate(p.x, p.y, p.z - 0.004);
    B.add(pom, { ex: GEAR.fabric, color: gcol(-1, 1.08), bone: 'head' });
  } else if (hat.name === 'bucket') {
    // brim: a stitched ring sloping down and out from the rim, top + rolled edge + underside (wraps round)
    const rowsR = [], vR = [];
    const prof = [[0.0, 0, -0.002], [0.35, 0, 0], [0.75, 0, 0], [0.97, 0, 0], [1.02, 0.5, 0], [0.97, 1, 0], [0.6, 1, 0], [0.0, 1, -0.002]];
    for (const [sN, side, inset] of prof) {
      rowsR.push(azs.map((az) => {
        const el = hat.rim(az); const q = at(az, el, offIn(az, el) + T * 0.7 + inset, new V3(), n);
        const L = 0.05 + 0.006 * Math.max(0, Math.cos(az));
        const dir = new V3(n.x, 0, n.z).normalize().multiplyScalar(Math.cos(0.62)).add(new V3(0, -Math.sin(0.62), 0));
        q.addScaledVector(dir, Math.min(1, sN) * L);
        const up = new V3(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
        if (side === 1) q.addScaledVector(up, -0.0048); else if (side === 0.5) q.addScaledVector(up, -0.0024).addScaledVector(dir, 0.0018);
        return q;
      }));
      vR.push(2 + sN + (side > 0.75 ? 1.2 : 0));
    }
    const brim = gridGeo(rowsR, { wrapU: true, outward: (q, out) => out.set(HEAD_C.x, q.y + 0.3, HEAD_C.z), uv: (i, j) => [i / nA, vR[j]] });
    B.add(brim, { ex: tint, uv: true, color: gcol(hat.col[0], hat.col[1]), bone: 'head' });
  }
}

/** Everything needed to sweep one strand (built once per style variant; `si` = the style's strand index). */
function strandSpec(sd, si, capCenter) {
  const pts = sd.pts.map((cp) => strandPoint(cp, sd.r0, sd.flat, new V3()));
  // curled tip: extend the last segment and roll it outward (away from the head) / upward
  if (sd.curl) {
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const d = b.clone().sub(a).normalize();
    const out = b.clone().sub(capCenter); out.addScaledVector(d, -out.dot(d)).normalize();
    const len = a.distanceTo(b) * 0.5;
    const k = sd.curl * 0.75;
    pts.push(b.clone().addScaledVector(d, len * 0.8).addScaledVector(out, len * 0.45 * k));
    pts.push(b.clone().addScaledVector(d, len * 1.05).addScaledVector(out, len * 1.1 * k).add(new V3(0, len * 0.35 * Math.abs(k), 0)));
  }
  const radius = (t) => {
    let r = lerp(sd.r0, sd.r1 * 0.92, Math.pow(sstep(0.0, 0.88, t), sd.taper ?? 0.78)); // firm taper (taper > 1 stays full longer)
    if (!sd.noClub) r *= 1 + 0.24 * Math.exp(-(((t - 0.83) / 0.06) ** 2));          // tentacle club near the tip
    return r * lerp(1, 0.62, sstep(0.91, 1, t));
  };
  // lens-shaped ribbon: thin crisp edges, a soft ridge along the top, flatter sucker side underneath.
  // Fin strands (out: 'x') are flattened sideways instead (a mohawk blade) with a symmetric lens section.
  const fin = sd.out === 'x';
  const section = fin
    ? (c, s) => [c * (1 - 0.3 * s * s), s]
    : (c, s) => {
      let cc = c * (1 - 0.34 * s * s);
      if (c > 0) cc += 0.2 * c * Math.pow(1 - s * s, 2); else cc *= 0.82;
      return [cc, s];
    };
  const tw = sd.twist ?? (si % 2 ? 1 : -1) * (0.22 + 0.12 * ((si * 37) % 5) / 4) * (sd.K > 2 ? 0.5 : 1);
  const twist = (t) => tw * sstep(0.12, 0.62, t) * (1 - 0.7 * sstep(0.7, 0.95, t));
  const flat = (t) => lerp(sd.flat * 0.62, Math.min(0.78, sd.flat + 0.24), sstep(0.5, 0.92, t));
  const outward = fin ? (P, o) => o.set(1, 0, 0) : (P, o) => o.copy(P).sub(capCenter).normalize();
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => p.clone()), false, 'centripetal');
  // half-thickness toward the scalp normal (how far the strand's top stands off its centreline)
  const top = (t) => (fin ? 1 : 1.2 * flat(t)) * radius(t);
  return { sd, si, pts, radius, section, twist, flat, outward, fin, curve, top };
}

/**
 * Sweep one strand into the hair mesh and set its bone chain. tExit > 0 re-roots it under a hat: the part before
 * tExit is hidden under the hat (only a short stub is built), the bones start where it leaves the rim, and every
 * profile (radius, flattening, twist, shading t) keeps the untrimmed strand's parametrisation so it looks the same.
 */
function buildStrand(B, sp, si, tExit, rest, meta, hatCtx = null) {
  const { sd } = sp;
  const t0 = tExit > 0 ? Math.max(0, tExit - 0.045) : 0;
  const map = (t) => t0 + t * (1 - t0);
  let pts = sp.pts;
  if (t0 > 0) { pts = []; for (let k = 0; k <= 26; k++) pts.push(sp.curve.getPointAt(map(k / 26))); }
  const sw = sweep(pts, {
    seg: t0 > 0 ? Math.max(8, Math.round(18 * (1 - t0) + 2)) : 18, radial: 9, capSteps: 3, transport: !sp.fin, section: sp.section, outward: sp.outward,
    radius: t0 > 0 ? (t) => sp.radius(map(t)) : sp.radius,
    twist: t0 > 0 ? (t) => sp.twist(map(t)) : sp.twist,
    flat: t0 > 0 ? (t) => sp.flat(map(t)) : sp.flat,
  });
  if (hatCtx) {
    // tuck: any vertex standing proud of the hat's inner surface (the hidden stub, a ribbon edge brushing the rim) is
    // pulled radially under it; just below the rim the limit opens up so the tentacle fans out from under the edge
    const P = sw.geo.attributes.position; const v = new V3(), d = new V3(), sk = new V3(); let moved = false;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); d.subVectors(v, HEAD_C); const r = d.length(); d.divideScalar(r);
      const lim = hatCtx.tuck(Math.atan2(d.x, d.z), Math.asin(clamp(d.y, -1, 1))); if (!Number.isFinite(lim)) continue;
      const skin = headShape(d.x, d.y, d.z, sk).length();
      if (r - skin > lim) { v.copy(d).multiplyScalar(skin + Math.max(0.0005, lim)).add(HEAD_C); P.setXYZ(i, v.x, v.y, v.z); moved = true; }
    }
    if (moved) sw.geo.computeVertexNormals();
  }
  // bone chain on the free part [tExit, 1] (param of this sweep: tb)
  const tb = (u) => (lerp(tExit, 1, u) - t0) / (1 - t0);
  const bt = [0, 0.34, 0.67];
  for (let k = 0; k < HAIR_SEGS; k++) rest[`hair${si}_${k}`] = sw.curve.getPointAt(tb(bt[k]));
  rest[`hairTip${si}`] = sw.curve.getPointAt(tb(0.86));
  const len = sp.curve.getLength();
  const tA = sw.t, cA = sw.cs, sA = sw.sn;
  B.add(sw.geo, {
    ex: 0,
    color: (p, i) => _c.setRGB(map(tA[i]), sd.suck ? 1 : 0, sA[i] * 0.5 + 0.5),
    uv: (i) => [map(tA[i]) * len, cA[i]],
    weights: (p, i) => {
      const t = tExit > 0 ? clamp((map(tA[i]) - tExit) / (1 - tExit), 0, 1) : tA[i]; const w = [];
      for (let k = 0; k < HAIR_SEGS; k++) { const c = (k + 0.5) / HAIR_SEGS; w.push([`hair${si}_${k}`, Math.max(0, 1 - Math.abs(t - c) * HAIR_SEGS)]); }
      if (t < 1 / 6) { w[0][1] = 1; w[1][1] = 0; }
      if (t > 5 / 6) { w[2][1] = 1; w[1][1] = 0; }
      const wt = sstep(0.84, 0.95, t);
      if (wt > 0) { for (const e of w) e[1] *= 1 - wt; w.push([`hairTip${si}`, wt]); }
      // the stub hidden under a hat is pinned to the head (only what leaves the rim swings)
      if (tExit > 0) { const kh = 1 - sstep(tExit - 0.016, tExit, map(tA[i])); if (kh > 0) { for (const e of w) e[1] *= 1 - kh; w.push(['head', kh]); } }
      return w;
    },
  });
  const first = tExit > 0 ? rest[`hair${si}_0`] : pts[0];
  const dir = pts[pts.length - 1].clone().sub(first);
  meta.push({ dir: dir.clone().normalize(), len: dir.length(), K: sd.K, G: sd.G });
  // sample(t) in the ORIGINAL strand parametrisation (gear placement); null where the strand is hidden by a hat
  const sample = (t) => (t < tExit + 0.02 ? null : sw.sample((t - t0) / (1 - t0)));
  return { sw, sd, bi: si, t0, tExit, sample };
}

// Brow shapes (style.brows). t = 0 inner end (near the nose) → 1 outer end. el(t) is the stroke's elevation on the head,
// r(t) its radius. 0 is the original stroke (unchanged); the others are painted-ink variants for the locker.
export const BROW_KINDS = [
  { name: 'classic', el: (t) => BROW.el + 0.045 * Math.sin(Math.PI * (t * 0.8 + 0.12)) - 0.014 * t, r: (t) => 0.0092 * (0.5 + 0.5 * Math.sin(Math.PI * (0.22 + 0.72 * t))) * lerp(1.15, 0.7, t), az1: BROW.az1 },
  // bold: thick, low and level with a slight downward slant toward the nose (determined)
  { name: 'bold', el: (t) => BROW.el - 0.004 + 0.022 * Math.sin(Math.PI * (t * 0.7 + 0.2)) + 0.01 * t, r: (t) => 0.0128 * (0.62 + 0.38 * Math.sin(Math.PI * (0.18 + 0.7 * t))) * lerp(1.12, 0.82, t), az1: BROW.az1 + 0.02 },
  // arched: high, thin, elegant arch that tapers to a fine tail
  { name: 'arched', el: (t) => BROW.el + 0.012 + 0.07 * Math.sin(Math.PI * (t * 0.86 + 0.08)) - 0.02 * t, r: (t) => 0.0078 * (0.55 + 0.45 * Math.sin(Math.PI * (0.2 + 0.75 * t))) * lerp(1.1, 0.55, t), az1: BROW.az1 + 0.03 },
  // straight: short, blunt, perfectly level bars
  { name: 'straight', el: (t) => BROW.el + 0.022 + 0.004 * Math.sin(Math.PI * t), r: (t) => 0.0104 * (0.82 + 0.18 * Math.sin(Math.PI * (0.1 + 0.8 * t))), az1: BROW.az1 - 0.05 },
];

function buildHair(styleIdx, hatIdx = 0, browIdx = 0) {
  const style = STYLES[styleIdx % STYLES.length];
  const hat = HAT_KINDS[hatIdx] || HAT_KINDS[0];
  const B = new Builder();
  const rest = {}; const meta = [];
  // ---- scalp cap
  {
    const { geo, col } = buildCap(style.cap?.pole, hat);
    B.add(geo, { bone: 'head', ex: -0.08, uv: true, color: (p, i) => _c.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]) });
  }
  // ---- brows: tapered ink strokes on the brow bones (shape per style.brows)
  const bk = BROW_KINDS[browIdx] || BROW_KINDS[0];
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const pts = []; const q = new V3();
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(headSurf(sx * lerp(BROW.az0, bk.az1, t), bk.el(t), 0.0035, q).clone()); }
    const st = sweep(pts, { seg: 10, radial: 6, capSteps: 2, radius: bk.r, flat: 0.5, outward: (P, o) => o.copy(P).sub(HEAD_C).normalize() });
    B.add(st.geo, { bone: 'brow' + s, ex: -0.62, color: _c.setRGB(0, 0, 0) });
  }
  // ---- strands: specs first, so a hat can analyse (and re-root / drop) them before anything is built
  const capCenter = HEAD_C.clone().add(new V3(0, -0.02, -0.005));
  const vs = hat.rim && style.underHat ? { ...style, ...style.underHat } : style; // hat-compatible variant (low tail / bun)
  const specs = vs.strands.map((sd, si) => strandSpec(sd, si, capCenter));
  const hatCtx = hat.rim ? analyseHat(hat, specs) : null;
  const strandInfo = []; let bi = 0; // strandInfo is indexed by the style's strand index (null = dropped under the hat)
  for (const sp of specs) {
    const cut = hatCtx ? hatCtx.cut[sp.si] : { keep: true, tExit: 0 };
    if (!cut.keep) { strandInfo.push(null); continue; }
    const si = bi++;
    const info = buildStrand(B, sp, si, cut.tExit, rest, meta, hatCtx);
    strandInfo.push(info);
  }
  for (let si = bi; si < HAIR_MAX; si++) { for (let k = 0; k < HAIR_SEGS; k++) rest[`hair${si}_${k}`] = HEAD_C.clone(); rest[`hairTip${si}`] = HEAD_C.clone(); }
  addGear(B, vs, strandInfo, hatCtx);
  if (hatCtx) buildHat(B, hat, hatCtx);
  return { geo: B.build('aTint'), rest, meta, name: style.name, hat: hat.name, dropped: strandInfo.filter((x) => !x).length };
}

// ------------------------------------------------------------------------------------------------
// Tank glass + ink fill (tank-local: capsule axis = +Y)
// ------------------------------------------------------------------------------------------------
function buildTankParts() {
  const T = TANK; const chest = REST_BODY.chest;
  const glass = lathe(smoothProfile([[0, -0.098], [0.045, -0.098], [0.063, -0.092], [0.068, -0.075], [0.068, 0.075], [0.063, 0.092], [0.045, 0.098], [0, 0.098]], 14), 24);
  const fill = lathe(smoothProfile([[0, 0.0], [0.05, 0.0], [0.06, 0.006], [0.0615, 0.03], [0.0615, 0.975], [0.059, 0.998], [0.04, 1.003], [0, 1.004]], 10), 20);
  return {
    glass, fill, offset: T.center.clone().sub(chest), center: T.center.clone(), offsetTank: T.center.clone().sub(REST_BODY.tank),
    tilt: T.tilt, fillBottom: -0.09, fillHeight: 0.18,
  };
}

// ------------------------------------------------------------------------------------------------
// Squid form: one continuous mantle with blended arrowhead fins, raised visor band, big eyes, ten tentacles
// ------------------------------------------------------------------------------------------------
const SQ_PROF = [[0, -0.034], [0.07, -0.03], [0.108, -0.009], [0.126, 0.03], [0.131, 0.08], [0.127, 0.13], [0.114, 0.175], [0.099, 0.214], [0.081, 0.254], [0.059, 0.298], [0.035, 0.34], [0.015, 0.366], [0, 0.375]];
const SQ_ZS = 0.86;
const sqR = (y) => interpTable(SQ_PROF.map((p) => p[1]), SQ_PROF.map((p) => p[0]), y);
function sqFin(y) { return 0.108 * sstep(0.158, 0.222, y) * Math.pow(1 - sstep(0.222, 0.374, y), 1.05); }
function sqPoint(th, y, off, out) {
  const r = Math.max(0, sqR(y)) + off;
  const s = Math.sin(th), c = Math.cos(th);
  const f = sqFin(y) * Math.pow(Math.abs(s), 7);
  out.set(s * r + Math.sign(s) * f, y, c * r * SQ_ZS * (1 - 0.8 * Math.min(1, f / 0.05) * Math.pow(Math.abs(s), 4)));
  out.y -= 0.02 * f * 3 * Math.pow(Math.abs(s), 7);   // wing tips sweep slightly down
  return out;
}
function sqSurfN(th, y, off, out) {
  const p0 = sqPoint(th, y, 0, new V3()), p1 = sqPoint(th + 0.002, y, 0, new V3()), p2 = sqPoint(th, y + 0.002, 0, new V3());
  const n = p1.sub(p0).cross(p2.sub(p0)).normalize();
  return out.copy(p0).addScaledVector(n, off);
}

function buildSquid() {
  const body = new Builder(), dark = new Builder(), eyes = new Builder();
  // ---- mantle + fins
  {
    const nT = 44;
    const ys = densitySamples(34, -0.034, 0.375, (y) => 1 + 1.4 * gauss(y - 0.2, 0.05) + 0.8 * gauss(y + 0.02, 0.03));
    const rows = ys.slice(1, -1).map((y) => Array.from({ length: nT }, (_, i) => sqPoint((i / nT) * TAU, y, 0, new V3())));
    const g = gridGeo(rows, { wrapU: true, poles: { start: new V3(0, -0.034, 0), end: new V3(0, 0.375, 0) }, outward: (p, out) => out.set(0, p.y, 0) });
    body.add(g, {
      ex: 0,
      color: (p) => {
        const fin = sqFin(p.y) > 0.01 ? sstep(0.12, 0.2, Math.abs(p.x)) : 0;
        const face = sstep(0.02, 0.11, p.z) * sstep(0.2, 0.02, p.y) * 0.55;
        const top = sstep(0.22, 0.37, p.y) * 0.25;
        const belly = sstep(0.02, -0.03, p.y) * -0.35;
        return _c.setRGB(Math.max(fin * 0.5 + face + top, 0) + belly, fin * 0.25, 0.1);
      },
    });
  }
  // ---- tentacles (8 short arms + 2 longer feelers at the back)
  const N = 10;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * TAU + 0.31;
    const feeler = k === 4 || k === 6;
    const len = lerp(0.15, 0.108, Math.max(0, Math.cos(a))) * (k % 2 ? 0.92 : 1.0) * (feeler ? 1.3 : 1);
    const dx = Math.sin(a), dz = Math.cos(a) * SQ_ZS;
    const curl = 0.028 * (k % 2 ? 1 : 0.7);
    const pts = [[dx * 0.055, 0.012, dz * 0.055], [dx * 0.09, -0.04, dz * 0.09], [dx * 0.118, -0.035 - len * 0.55, dz * 0.118], [dx * 0.15, -0.035 - len * 0.86, dz * 0.15], [dx * (0.178 + curl * 0.6), -0.032 - len * 0.98, dz * (0.178 + curl * 0.6)], [dx * (0.2 + curl), -0.024 - len * 0.97, dz * (0.2 + curl)]];
    const sw = sweep(pts, { seg: 16, radial: 8, capSteps: 2, radius: (t) => lerp(0.0255, 0.0068, Math.pow(t, 0.78)) * (1 + 0.08 * gauss(t - 0.2, 0.1)), flat: 0.8, outward: (P, o) => o.set(P.x, 0, P.z).normalize() });
    const tA = sw.t, cA = sw.cs;
    body.add(sw.geo, { ex: 1, uv: (i) => [tA[i], cA[i]], color: (p, i) => _c.setRGB(0.12 + 0.3 * tA[i] - 0.25 * (1 - tA[i]) * 0.5, tA[i], k / N) });
  }
  // ---- raised visor band with rolled edges + eye sockets
  {
    const nu = 40, nv = 10;
    const rows = [];
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      rows.push(Array.from({ length: nu + 1 }, (_, i) => {
        const u = i / nu; const ang = lerp(-2.05, 2.05, u);
        const c = 0.09 + 0.02 * (Math.abs(ang) / 2.05) ** 2;
        const hh = 0.045 * Math.pow(Math.max(0, 1 - (Math.abs(ang) / 2.05) ** 2), 0.6);
        const y = c + (v * 2 - 1) * (hh + 0.004);
        const e = Math.abs(v * 2 - 1);
        const lift = 0.0078 * Math.sqrt(Math.max(0, 1 - Math.pow(e, 6))) - 0.003 * sstep(0.9, 1, e);
        const endK = sstep(2.05, 1.35, Math.abs(ang));
        return sqSurfN(ang, y, -0.002 + lift * endK, new V3());
      }));
    }
    const g = gridGeo(rows, { wrapU: false, outward: (p, out) => out.set(0, p.y, 0) });
    dark.add(g, { color: new THREE.Color(0.018, 0.02, 0.03) });
  }
  for (const sx of [1, -1]) {
    const g = polarPatch(6, 24, (u, v, r, out) => sqSurfN(sx * 0.5 + u * 0.31, 0.092 + v * 0.037, 0.0092 + 0.0042 * (1 - r * r), out));
    eyes.add(g, { uv: true, ex: sx });
  }
  return { body: body.build('aEx'), dark: dark.build('aEx'), eyes: eyes.build('aEx') };
}

// ------------------------------------------------------------------------------------------------
// Caches
// ------------------------------------------------------------------------------------------------
let _shared = null;
const _hair = new Map();
export function getKidShared() {
  if (!_shared) _shared = { skin: buildSkin(), cloth: buildCloth(), eyes: buildEyes(), tank: buildTankParts(), squid: buildSquid() };
  return _shared;
}
/**
 * Hair-mesh key of a style: accepts a style object ({ hair, hat, brows, … }) or a bare hair index (legacy callers).
 * The hair mesh carries the tentacles, scalp cap, brows, style accessories and headgear, so all three select it.
 */
const wrapN = (v, n) => ((Math.round(+v || 0) % n) + n) % n;
function hairKey(st) {
  if (st && typeof st === 'object') return { hair: wrapN(st.hair, STYLES.length), hat: wrapN(st.hat, HAT_KINDS.length), brows: wrapN(st.brows, BROW_KINDS.length) };
  return { hair: wrapN(st, STYLES.length), hat: 0, brows: 0 };
}
const keyStr = (k) => `${k.hair}.${k.hat}.${k.brows}`;
export function getHairStyle(st) {
  const k = hairKey(st), ks = keyStr(k);
  if (!_hair.has(ks)) _hair.set(ks, buildHair(k.hair, k.hat, k.brows));
  return _hair.get(ks);
}
export function getRestPositions(st) {
  const h = getHairStyle(st); const out = {};
  for (const n of BONE_NAMES) out[n] = (REST_BODY[n] || h.rest[n] || HEAD_C).clone();
  return out;
}
const _inv = new Map();
export function getBoneInverses(st) {
  const ks = keyStr(hairKey(st));
  if (!_inv.has(ks)) { const rest = getRestPositions(st); _inv.set(ks, BONE_NAMES.map((n) => new THREE.Matrix4().makeTranslation(-rest[n].x, -rest[n].y, -rest[n].z))); }
  return _inv.get(ks);
}
/** Cloth (garment) mesh for a style — every outfit currently shares the tee cut (patterns/colours are shader-side). */
export function getClothGeo(st) { return getKidShared().cloth; }
/** Triangle count of the visible meshes under an object (for budgets / the lab). */
export function countTriangles(obj) {
  let n = 0;
  obj.traverseVisible((o) => { if (o.isMesh && o.geometry) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  return n;
}
export const REST = REST_BODY;
export { sstep, clamp, lerp, finalize, torus, mirrorX, gridGeo, revolve, placeBasis, densitySamples };
