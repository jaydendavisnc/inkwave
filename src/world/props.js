// INKWAVE prop kit: procedural set dressing for the harbor / skatepark / container-yard arenas.
//
//   const kit = new PropKit(scene, { castShadow: true, quality: 'high' });
//   const { colliders } = kit.add('bench', { pos: [x, y, z], rotY, scale, color, variant, length, height, width, count, seed, team });
//   kit.build();  kit.update(dt, time);  kit.setTeamColors(a, b);  kit.clear();  kit.dispose();
//
// Conventions: metres, Y up. `pos` is the prop's ground point (base centre, or the start point for runs such as railing,
// fence, pipes and bunting, which extend along local +X). Wall-mounted props (mount: 'wall') treat local z = 0 as the wall
// surface and project toward local +Z; rotY turns that normal (rotY = 0 → faces +Z, PI/2 → faces +X).
//
// Rendering: every static part is baked into one merged mesh per material (vertex colours carry the palette, a shared
// canvas atlas carries sign graphics), so ~150 props cost ~9 merged draws + 5 instanced draws (fans, turbine vents,
// blinking lights, bunting flags, banners) plus their shadow passes. update() touches only instance matrices/colours
// and one time uniform; it never allocates.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { registerMarinaVessels } from './props-marina-vessels.js';
import { registerMarinaDock } from './props-marina-dock.js';

const PI = Math.PI, TAU = PI * 2, HP = PI / 2;

// ------------------------------------------------------------------------------------------------ palette
// Neutral bases + muted accents. Saturation stays below the team inks so ink is always the loudest thing on screen.
export const PALETTE = {
  white: '#ffffff', offwhite: '#f2eee6', cream: '#eee2c8', concrete: '#d2cdc3', concreteDark: '#b3ada2', warmgrey: '#a39c90',
  grey: '#7c776f', charcoal: '#474950', ink: '#2c2e35', railing: '#dde2e6',
  steel: '#aeb7bf', galv: '#c5cbd0', darksteel: '#5b616a', copper: '#c78b5d',
  wood: '#cc9d66', woodlight: '#ddb987', wooddark: '#a2733f', kraft: '#c8a177', bark: '#8b6749', soil: '#5a4535',
  teal: '#47aea3', tealdark: '#2f7f78', coral: '#e9836c', coraldark: '#c4614f', mustard: '#e5b94d', mustarddark: '#c0942f',
  lavender: '#a79be0', lavenderdark: '#7c70bd', sky: '#7fc0df', mint: '#a1d7b7', pink: '#eea0bf', navy: '#35405a',
  leaf: '#5ba257', leafdark: '#3f8249', leaflight: '#8fc46b', rubber: '#34353c', cone: '#ec8a57',
};
const ACCENTS = ['teal', 'coral', 'mustard', 'lavender', 'sky', 'mint', 'pink'];

const _colCache = new Map();
function col(c) {
  if (c && c.isColor) return c;
  if (c == null) c = 'white';
  if (typeof c === 'string' && PALETTE[c]) c = PALETTE[c];
  const k = typeof c + ':' + c;
  let v = _colCache.get(k);
  if (!v) { v = new THREE.Color(c); _colCache.set(k, v); }
  return v;
}
const shade = (c, k) => col(c).clone().multiplyScalar(k);
const mixc = (a, b, t) => col(a).clone().lerp(col(b), t);

function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------------------------------------ geometry builder
class GB {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.idx = []; }
  v(x, y, z, nx, ny, nz, u = 0, v = 0, c = 1) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.c.push(c, c, c); return this.p.length / 3 - 1; }
  // Triangles are auto-oriented so their winding agrees with the supplied vertex normals (all our shapes supply outward normals).
  tri(a, b, c) {
    const P = this.p, N = this.n;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az;
    const e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    if (cx * cx + cy * cy + cz * cz < 1e-16) return;
    const s = cx * (N[a * 3] + N[b * 3] + N[c * 3]) + cy * (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) + cz * (N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]);
    if (s < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
  }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.idx);
    return g;
  }
}

// Box with 45° chamfered edges and interpolated normals (reads as rounded): 44 triangles.
function chamferBox(w, h, d, r) {
  const H = [w / 2, h / 2, d / 2];
  r = Math.max(0.0005, Math.min(r, H[0] * 0.48, H[1] * 0.48, H[2] * 0.48));
  const g = new GB();
  const mk = (p, a, s) => {
    const n = [0, 0, 0]; n[a] = s;
    const o1 = (a + 1) % 3, o2 = (a + 2) % 3;
    return g.v(p[0], p[1], p[2], n[0], n[1], n[2], (p[o1] + H[o1]) / (2 * H[o1]), (p[o2] + H[o2]) / (2 * H[o2]));
  };
  for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
    const b = (a + 1) % 3, c = (a + 2) % 3, ids = [];
    for (const [sb, sc] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = [0, 0, 0]; p[a] = s * H[a]; p[b] = sb * (H[b] - r); p[c] = sc * (H[c] - r); ids.push(mk(p, a, s)); }
    g.quad(ids[0], ids[1], ids[2], ids[3]);
  }
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
      const q = [];
      for (const sc of [-1, 1]) { const p = [0, 0, 0]; p[a] = sa * H[a]; p[b] = sb * (H[b] - r); p[c] = sc * (H[c] - r); q.push(mk(p, a, sa)); }
      for (const sc of [1, -1]) { const p = [0, 0, 0]; p[a] = sa * (H[a] - r); p[b] = sb * H[b]; p[c] = sc * (H[c] - r); q.push(mk(p, b, sb)); }
      g.quad(q[0], q[1], q[2], q[3]);
    }
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const s = [sx, sy, sz], ids = [];
    for (let a = 0; a < 3; a++) { const p = [0, 0, 0]; for (let k = 0; k < 3; k++) p[k] = s[k] * (k === a ? H[k] : H[k] - r); ids.push(mk(p, a, s[a])); }
    g.tri(ids[0], ids[1], ids[2]);
  }
  return g.geo();
}

// Rounded box (true 2-segment radius on every edge, smooth corners): 108 triangles. Used for hero-size shapes.
function roundBox(w, h, d, r) {
  const H = [w / 2, h / 2, d / 2];
  r = Math.max(0.001, Math.min(r, H[0] * 0.48, H[1] * 0.48, H[2] * 0.48));
  const g = new GB();
  const I = [H[0] - r, H[1] - r, H[2] - r];
  for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    const cb = [-H[b], -I[b], I[b], H[b]], cc = [-H[c], -I[c], I[c], H[c]];
    const ids = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const p = [0, 0, 0]; p[a] = s * H[a]; p[b] = cb[i]; p[c] = cc[j];
      const q = [0, 0, 0], n = [0, 0, 0];
      let len = 0;
      for (let k = 0; k < 3; k++) { const inner = Math.max(-I[k], Math.min(I[k], p[k])); n[k] = p[k] - inner; q[k] = inner; len += n[k] * n[k]; }
      len = Math.sqrt(len) || 1;
      for (let k = 0; k < 3; k++) { n[k] /= len; q[k] += n[k] * r; }
      ids.push(g.v(q[0], q[1], q[2], n[0], n[1], n[2], (p[b] + H[b]) / (2 * H[b]), (p[c] + H[c]) / (2 * H[c])));
    }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g.quad(ids[i * 4 + j], ids[(i + 1) * 4 + j], ids[(i + 1) * 4 + j + 1], ids[i * 4 + j + 1]);
  }
  return g.geo();
}

// Lathe around +Y. profile = [[r, y], ...] ordered bottom→out→up→in; `null` entries split strips (hard crease).
function latheGeo(profile, seg, closed = false) {
  const g = new GB();
  const strips = [[]];
  for (const p of profile) { if (p === null) strips.push([]); else strips[strips.length - 1].push(p); }
  for (const S of strips) {
    const n = S.length; if (n < 2) continue;
    const nr = [], ny = [];
    for (let i = 0; i < n; i++) {
      let a, b;
      if (closed) { a = S[(i - 1 + n) % n]; b = S[(i + 1) % n]; } else { a = S[Math.max(0, i - 1)]; b = S[Math.min(n - 1, i + 1)]; }
      let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      nr.push(ty); ny.push(-tx);
    }
    const rings = [];
    for (let i = 0; i < n; i++) {
      const ring = [];
      for (let k = 0; k <= seg; k++) {
        const ph = (k / seg) * TAU, cs = Math.cos(ph), sn = Math.sin(ph);
        ring.push(g.v(S[i][0] * cs, S[i][1], -S[i][0] * sn, nr[i] * cs, ny[i], -nr[i] * sn, k / seg, i / (n - 1)));
      }
      rings.push(ring);
    }
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const A = rings[i], B = rings[(i + 1) % n];
      for (let k = 0; k < seg; k++) g.quad(A[k], A[k + 1], B[k + 1], B[k]);
    }
  }
  return g.geo();
}

// Tube along a polyline (parallel-transport frames). radius may be a function of t in [0,1].
function tubeGeo(pts, radius, radial = 8, closed = false, up = null) {
  const n = pts.length, g = new GB();
  const P = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const T = [];
  for (let i = 0; i < n; i++) {
    const a = closed ? P[(i - 1 + n) % n] : P[Math.max(0, i - 1)], b = closed ? P[(i + 1) % n] : P[Math.min(n - 1, i + 1)];
    T.push(b.clone().sub(a).normalize());
  }
  const N = new THREE.Vector3();
  if (up) N.set(up[0], up[1], up[2]).addScaledVector(T[0], -T[0].dot(N.set(up[0], up[1], up[2]))).normalize();
  if (!up || N.lengthSq() < 0.5) { const ax = Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0); N.crossVectors(T[0], ax).normalize(); }
  const Bv = new THREE.Vector3(), rings = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) N.addScaledVector(T[i], -N.dot(T[i])).normalize();
    Bv.crossVectors(T[i], N).normalize();
    const r = typeof radius === 'function' ? radius(i / (n - 1)) : radius;
    const ring = [];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * TAU, cs = Math.cos(a), sn = Math.sin(a);
      const nx = N.x * cs + Bv.x * sn, ny = N.y * cs + Bv.y * sn, nz = N.z * cs + Bv.z * sn;
      ring.push(g.v(P[i].x + nx * r, P[i].y + ny * r, P[i].z + nz * r, nx, ny, nz, k / radial, i / (n - 1)));
    }
    rings.push(ring);
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const A = rings[i], B = rings[(i + 1) % n];
    for (let k = 0; k < radial; k++) g.quad(A[k], A[(k + 1) % radial], B[(k + 1) % radial], B[k]);
  }
  return g.geo();
}

// Extrude a closed (z, y) profile along X, with chamfered end caps (bevel b). Creases where the profile turns > 40°.
function polyNormals(prof) {
  const n = prof.length;
  let A = 0;
  for (let i = 0; i < n; i++) { const p = prof[i], q = prof[(i + 1) % n]; A += p[0] * q[1] - q[0] * p[1]; }
  const s = A > 0 ? 1 : -1, en = [];
  for (let i = 0; i < n; i++) {
    const p = prof[i], q = prof[(i + 1) % n];
    let nz = (q[1] - p[1]) * s, ny = -(q[0] - p[0]) * s; const l = Math.hypot(nz, ny) || 1;
    en.push([nz / l, ny / l]);
  }
  return en;
}
function offsetPoly(prof, d) {
  const en = polyNormals(prof), n = prof.length;
  return prof.map((p, i) => {
    const a = en[(i - 1 + n) % n], b = en[i];
    const k = 1 + a[0] * b[0] + a[1] * b[1];
    const m = [(a[0] + b[0]) / Math.max(0.35, k), (a[1] + b[1]) / Math.max(0.35, k)];
    return [p[0] + m[0] * d, p[1] + m[1] * d];
  });
}
function extrudeGeo(prof, L, b) {
  const n = prof.length, g = new GB(), en = polyNormals(prof);
  const cos40 = Math.cos((40 * PI) / 180);
  const crease = (i) => { const a = en[(i - 1 + n) % n], c = en[i]; return a[0] * c[0] + a[1] * c[1] < cos40; };
  const vn = (i) => { const a = en[(i - 1 + n) % n], c = en[i]; const z = a[0] + c[0], y = a[1] + c[1], l = Math.hypot(z, y) || 1; return [z / l, y / l]; };
  const inset = offsetPoly(prof, -b);
  const xs = L / 2 - b;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, p = prof[i], q = prof[j];
    const na = crease(i) ? en[i] : vn(i), nb = crease(j) ? en[i] : vn(j);
    const v0 = g.v(-xs, p[1], p[0], 0, na[1], na[0]), v1 = g.v(xs, p[1], p[0], 0, na[1], na[0]);
    const v2 = g.v(xs, q[1], q[0], 0, nb[1], nb[0]), v3 = g.v(-xs, q[1], q[0], 0, nb[1], nb[0]);
    g.quad(v0, v1, v2, v3);
    for (const sx of [-1, 1]) {
      const a0 = g.v(sx * xs, p[1], p[0], 0, na[1], na[0]), a1 = g.v(sx * xs, q[1], q[0], 0, nb[1], nb[0]);
      const c1 = g.v(sx * L / 2, inset[j][1], inset[j][0], sx, 0, 0), c0 = g.v(sx * L / 2, inset[i][1], inset[i][0], sx, 0, 0);
      g.quad(a0, a1, c1, c0);
    }
  }
  const tris = THREE.ShapeUtils.triangulateShape(inset.map((p) => new THREE.Vector2(p[0], p[1])), []);
  for (const sx of [-1, 1]) {
    const ids = inset.map((p) => g.v(sx * L / 2, p[1], p[0], sx, 0, 0));
    for (const t of tris) g.tri(ids[t[0]], ids[t[1]], ids[t[2]]);
  }
  return g.geo();
}

// Lumpy smooth blob for foliage (vertex-colour gradient: shaded underside, sunlit top).
function blobGeo(r, detail, seed, lump = 0.13, lo = 0.72, hi = 1.12) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const P = g.attributes.position, s = seed * 1.713;
  const cols = new Float32Array(P.count * 3), uvs = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const nx = x / r, ny = y / r, nz = z / r;
    const n = Math.sin(nx * 3.1 + s) * Math.sin(ny * 2.7 + s * 1.3) * Math.sin(nz * 3.3 + s * 0.7) + 0.45 * Math.sin(nx * 6.3 + nz * 5.1 + s * 2.1) * Math.sin(ny * 5.7 - s);
    let k = 1 + lump * n;
    if (ny < -0.2) k *= 1 - (-0.2 - ny) * 0.35;
    x *= k; y *= k; z *= k;
    P.setXYZ(i, x, y, z);
    const t = Math.max(0, Math.min(1, (ny + 1) / 2));
    const c = lo + (hi - lo) * Math.pow(t, 1.3) + n * 0.04;
    cols[i * 3] = c; cols[i * 3 + 1] = c; cols[i * 3 + 2] = c;
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return g;
}

// Smooth foliage puff: low-noise UV sphere with a baked top-light gradient (cauliflower clusters read as leafy, not rocky).
function puffGeo(det, seed) {
  const [ws, hs] = [[7, 5], [10, 7], [12, 8]][det];
  let g = new THREE.SphereGeometry(1, ws, hs);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const P = g.attributes.position, s = seed * 2.17 + 0.5;
  const cols = new Float32Array(P.count * 3), uvs = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const n = Math.sin(x * 4.1 + s) * Math.sin(y * 3.7 + s * 1.3) * Math.sin(z * 4.3 + s * 0.7);
    let k = 1 + 0.07 * n;
    if (y < -0.3) k *= 1 - (-0.3 - y) * 0.3;
    P.setXYZ(i, x * k, y * k, z * k);
    const t = Math.max(0, Math.min(1, (y + 1) / 2));
    const c = 0.66 + 0.5 * Math.pow(t, 1.4);
    cols[i * 3] = c * 0.97; cols[i * 3 + 1] = c; cols[i * 3 + 2] = c * 0.94;
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return g;
}

// Geometry template cache (CPU-side templates only; they are merged, never rendered directly).
const TPL = new Map();
const kf = (a) => (typeof a === 'number' ? a.toFixed(4) : String(a));
function tpl(key, fn) { let g = TPL.get(key); if (!g) { g = fn(); TPL.set(key, g); } return g; }
const G = {
  cbox: (w, h, d, r) => tpl(['cb', w, h, d, r].map(kf).join('|'), () => chamferBox(w, h, d, r)),
  rbox: (w, h, d, r) => tpl(['rb', w, h, d, r].map(kf).join('|'), () => roundBox(w, h, d, r)),
  cyl: (rt, rb, h, seg, open) => tpl(['cy', rt, rb, h, seg, open ? 1 : 0].map(kf).join('|'), () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)),
  sph: (r, ws, hs, half) => tpl(['sp', r, ws, hs, half ? 1 : 0].map(kf).join('|'), () => new THREE.SphereGeometry(r, ws, hs, 0, TAU, 0, half ? HP : PI)),
  tor: (R, r, rs, ts, arc) => tpl(['to', R, r, rs, ts, arc].map(kf).join('|'), () => new THREE.TorusGeometry(R, r, rs, ts, arc)),
  plane: (w, h) => tpl(['pl', w, h].map(kf).join('|'), () => new THREE.PlaneGeometry(w, h)),
  lathe: (prof, seg, closed) => tpl('la|' + seg + '|' + (closed ? 1 : 0) + '|' + prof.map((p) => (p ? p[0].toFixed(3) + ',' + p[1].toFixed(3) : 'x')).join(';'), () => latheGeo(prof, seg, closed)),
  extrude: (key, prof, L, b) => tpl('ex|' + key + '|' + kf(L) + '|' + kf(b), () => extrudeGeo(prof, L, b)),
  blob: (r, det, seed) => tpl(['bl', r, det, seed].map(kf).join('|'), () => blobGeo(r, det, seed)),
  puff: (det, seed) => tpl(['pf', det, seed].map(kf).join('|'), () => puffGeo(det, seed)),
};
// Rounded-cylinder lathe profile, centred on y = 0.
const rcylProf = (r, h, b) => {
  const y0 = -h / 2, y1 = h / 2;
  return [[0, y0], [r - b, y0], [r, y0 + b], [r, y1 - b], [r - b, y1], [0, y1]];
};
const flangeProf = (R, h) => [[0, 0], [R, 0], [R, h * 0.5], [R * 0.82, h], [0, h]];

// ------------------------------------------------------------------------------------------------ atlas (sign art)
const AW = 2048, AH = 2048;
const REG = {
  sign0: [0, 0, 512, 256], sign1: [512, 0, 512, 256], sign2: [1024, 0, 512, 256], sign3: [1536, 0, 512, 256],
  vend0: [0, 256, 256, 512], vend1: [256, 256, 256, 512], side: [512, 256, 256, 512], emblem: [768, 256, 256, 512],
  head0: [1024, 256, 512, 128], head1: [1024, 384, 512, 128], stencil: [1536, 256, 512, 256],
  hazard: [1024, 512, 512, 128], tag: [1536, 512, 512, 256], grille: [1024, 640, 256, 256],
  badge: [1280, 640, 256, 96], white: [1536, 768, 64, 64], clear: [1600, 768, 64, 64], wbadge: [1280, 736, 256, 96],
  // street-level print: wide poster, shop headers, cabinet header, hazard diamonds, ice-cream menu, torn remnants
  pw0: [0, 768, 512, 256], stall1: [512, 768, 384, 128], stall2: [512, 896, 384, 128], ice: [896, 768, 128, 128], mail: [896, 896, 128, 128],
  cab: [1664, 768, 384, 128], dia0: [1664, 896, 128, 128], dia1: [1792, 896, 128, 128], dia2: [1920, 896, 128, 128],
  menu: [1280, 832, 256, 192], torn: [1536, 832, 128, 192],
  // posters (256×384)
  pst0: [0, 1024, 256, 384], pst1: [256, 1024, 256, 384], pst2: [512, 1024, 256, 384], pst3: [768, 1024, 256, 384],
  pst4: [1024, 1024, 256, 384], pst5: [1280, 1024, 256, 384], pst6: [1536, 1024, 256, 384], pst7: [1792, 1024, 256, 384],
  pst8: [0, 1408, 256, 384], pst9: [256, 1408, 256, 384], pst10: [512, 1408, 256, 384], pst11: [768, 1408, 256, 384],
  chalk: [1024, 1408, 256, 256], ferry: [1280, 1408, 384, 256],
  cart0: [1664, 1408, 384, 128], cart1: [1664, 1536, 384, 128], stall0: [1664, 1664, 384, 128],
  chalk2: [1024, 1664, 256, 128], news0: [1280, 1664, 128, 128], news1: [1408, 1664, 128, 128], qr: [1536, 1664, 128, 128],
  manhole: [0, 1792, 256, 256], gully: [256, 1792, 128, 128], gauge: [384, 1792, 64, 256], scuff: [256, 1920, 128, 128],
};
// stickers stk0..15 (64²), signs sg0..7 (128²), fingerpost blades bl0..7 (256×64), labels lb0..15 (128×32)
for (let i = 0; i < 16; i++) REG['stk' + i] = [448 + (i % 8) * 64, 1792 + Math.floor(i / 8) * 64, 64, 64];
for (let i = 0; i < 8; i++) REG['sg' + i] = [960 + i * 128, 1792, 128, 128];
for (let i = 0; i < 8; i++) REG['bl' + i] = [448 + (i % 4) * 256, 1920 + Math.floor(i / 4) * 64, 256, 64];
for (let i = 0; i < 16; i++) REG['lb' + i] = [1472 + (i % 4) * 128, 1920 + Math.floor(i / 4) * 32, 128, 32];
function regUV(name, pad = 3) {
  const [x, y, w, h] = REG[name];
  return [(x + pad) / AW, 1 - (y + h - pad) / AH, (x + w - pad) / AW, 1 - (y + pad) / AH];
}
const WHITE_UV = (() => { const [x, y, w, h] = REG.white; return [(x + w / 2) / AW, 1 - (y + h / 2) / AH]; })();

let _fontPromise = null;
const FONT_D = 'InkwavePropsDisplay', FONT_T = 'InkwavePropsText';
function loadFonts() {
  if (_fontPromise) return _fontPromise;
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return (_fontPromise = Promise.resolve());
  const d = new FontFace(FONT_D, `url(${new URL('../../assets/fonts/TitanOne-latin.woff2', import.meta.url)})`);
  const t = new FontFace(FONT_T, `url(${new URL('../../assets/fonts/Rubik-latin.woff2', import.meta.url)})`, { weight: '400 900' });
  _fontPromise = Promise.all([d.load(), t.load()]).then((f) => { f.forEach((x) => document.fonts.add(x)); }).catch(() => {});
  return _fontPromise;
}
const FD = (px) => `${px}px ${FONT_D}, 'Titan One', 'Arial Black', sans-serif`;
const FT = (px, w = 800) => `${w} ${px}px ${FONT_T}, Rubik, 'Arial', sans-serif`;
function rr(x, g, y, w, h, r) { x.beginPath(); x.roundRect(g, y, w, h, r); }
function fitText(x, s, maxW, px, fontFn) { let p = px; x.font = fontFn(p); while (x.measureText(s).width > maxW && p > 8) { p -= 2; x.font = fontFn(p); } return p; }
function txt(x, s, cx, cy, px, fontFn, fill, stroke = null, sw = 0, maxW = 9999, align = 'center') {
  fitText(x, s, maxW, px, fontFn);
  x.textAlign = align; x.textBaseline = 'middle'; x.lineJoin = 'round';
  if (stroke) { x.strokeStyle = stroke; x.lineWidth = sw; x.strokeText(s, cx, cy); }
  x.fillStyle = fill; x.fillText(s, cx, cy);
}
function region(x, name, fn) {
  const [rx, ry, w, h] = REG[name];
  x.save(); x.translate(rx, ry); x.beginPath(); x.rect(0, 0, w, h); x.clip(); fn(x, w, h); x.restore();
}
function squidPath(x, cx, cy, s) {
  // original squidkid mascot silhouette: pointed mantle with side fins, round head, four stubby tentacles
  x.beginPath();
  x.moveTo(cx, cy - 1.0 * s);
  x.bezierCurveTo(cx + 0.35 * s, cy - 0.7 * s, cx + 0.45 * s, cy - 0.45 * s, cx + 0.75 * s, cy - 0.25 * s);
  x.bezierCurveTo(cx + 0.55 * s, cy - 0.1 * s, cx + 0.5 * s, cy + 0.0 * s, cx + 0.48 * s, cy + 0.2 * s);
  x.bezierCurveTo(cx + 0.46 * s, cy + 0.45 * s, cx + 0.3 * s, cy + 0.5 * s, cx + 0.32 * s, cy + 0.8 * s);
  x.lineTo(cx + 0.16 * s, cy + 0.62 * s); x.lineTo(cx + 0.08 * s, cy + 0.85 * s); x.lineTo(cx, cy + 0.62 * s);
  x.lineTo(cx - 0.08 * s, cy + 0.85 * s); x.lineTo(cx - 0.16 * s, cy + 0.62 * s); x.lineTo(cx - 0.32 * s, cy + 0.8 * s);
  x.bezierCurveTo(cx - 0.3 * s, cy + 0.5 * s, cx - 0.46 * s, cy + 0.45 * s, cx - 0.48 * s, cy + 0.2 * s);
  x.bezierCurveTo(cx - 0.5 * s, cy + 0.0 * s, cx - 0.55 * s, cy - 0.1 * s, cx - 0.75 * s, cy - 0.25 * s);
  x.bezierCurveTo(cx - 0.45 * s, cy - 0.45 * s, cx - 0.35 * s, cy - 0.7 * s, cx, cy - 1.0 * s);
  x.closePath();
}
function drawAtlas(x) {
  x.clearRect(0, 0, AW, AH);
  // --- sign0: KRAKEN LINES (shipping line)
  region(x, 'sign0', (x, w, h) => {
    x.fillStyle = '#35405a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#3e4c6b'; for (let i = -4; i < 12; i++) { x.beginPath(); x.moveTo(i * 60, h); x.lineTo(i * 60 + 30, h); x.lineTo(i * 60 + 130, 0); x.lineTo(i * 60 + 100, 0); x.fill(); }
    x.fillStyle = '#47aea3'; x.beginPath(); x.arc(108, 128, 78, 0, TAU); x.fill();
    x.strokeStyle = '#f2eee6'; x.lineWidth = 15; x.lineCap = 'round';
    x.beginPath(); x.moveTo(56, 150); x.bezierCurveTo(74, 72, 140, 62, 160, 110); x.bezierCurveTo(175, 150, 120, 170, 110, 135); x.bezierCurveTo(102, 110, 135, 100, 140, 120); x.stroke();
    x.beginPath(); x.moveTo(52, 180); x.quadraticCurveTo(80, 164, 108, 180); x.quadraticCurveTo(136, 196, 164, 180); x.stroke();
    txt(x, 'KRAKEN', 355, 100, 74, FD, '#f2eee6', null, 0, 280);
    txt(x, 'LINES', 355, 168, 60, FD, '#e5b94d', null, 0, 280);
    txt(x, 'HARBOR FREIGHT  ·  EST. 1998', 355, 218, 18, FT, '#9fb0cc', null, 0, 280);
  });
  // --- sign1: TIDE SNACKS
  region(x, 'sign1', (x, w, h) => {
    x.fillStyle = '#f0c65c'; x.fillRect(0, 0, w, h);
    x.save(); x.translate(120, 128); x.fillStyle = '#f5d47e';
    for (let i = 0; i < 16; i++) { x.rotate(TAU / 16); x.beginPath(); x.moveTo(0, 0); x.lineTo(420, -40); x.lineTo(420, 40); x.fill(); }
    x.restore();
    x.fillStyle = '#e9836c'; x.beginPath(); x.ellipse(118, 132, 72, 48, -0.2, 0, TAU); x.fill();
    x.beginPath(); x.moveTo(175, 118); x.lineTo(222, 82); x.lineTo(214, 160); x.closePath(); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(84, 116, 15, 0, TAU); x.fill(); x.fillStyle = '#2c2e35'; x.beginPath(); x.arc(80, 116, 8, 0, TAU); x.fill();
    x.strokeStyle = '#2c2e35'; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath(); x.arc(92, 146, 14, 0.2, 1.9); x.stroke();
    x.fillStyle = '#c4614f'; for (const [px, py] of [[122, 108], [140, 132], [118, 156], [152, 110]]) { x.beginPath(); x.arc(px, py, 5, 0, TAU); x.fill(); }
    txt(x, 'TIDE', 368, 92, 86, FD, '#e9836c', '#fff', 14, 260);
    txt(x, 'SNACKS', 368, 172, 58, FD, '#35405a', '#fff', 10, 270);
    x.save(); x.translate(470, 36); x.rotate(0.25); x.fillStyle = '#35405a'; rr(x, -44, -16, 88, 32, 10); x.fill(); txt(x, 'CRUNCH!', 0, 1, 20, FD, '#f0c65c', null, 0, 80); x.restore();
  });
  // --- sign2: SQUIDKID SKATE
  region(x, 'sign2', (x, w, h) => {
    x.fillStyle = '#f2eee6'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#d9d2f3'; for (let i = -6; i < 14; i++) { x.beginPath(); x.moveTo(i * 44, h); x.lineTo(i * 44 + 22, h); x.lineTo(i * 44 + 122, 0); x.lineTo(i * 44 + 100, 0); x.fill(); }
    x.save(); x.translate(122, 132); x.rotate(-0.35);
    x.fillStyle = '#47aea3'; rr(x, -44, -108, 88, 216, 44); x.fill();
    x.strokeStyle = '#2c2e35'; x.lineWidth = 6; x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(-16, -20, 13, 17, 0, 0, TAU); x.ellipse(16, -20, 13, 17, 0, 0, TAU); x.fill();
    x.fillStyle = '#2c2e35'; x.beginPath(); x.arc(-14, -17, 7, 0, TAU); x.arc(18, -17, 7, 0, TAU); x.fill();
    x.fillStyle = '#e5b94d'; for (const yy of [-78, 78]) for (const xx of [-30, 30]) { x.beginPath(); x.arc(xx, yy, 11, 0, TAU); x.fill(); }
    x.restore();
    x.save(); x.translate(350, 100); x.rotate(-0.08); txt(x, 'SQUIDKID', 0, 0, 70, FD, '#2c2e35', null, 0, 300); x.restore();
    x.save(); x.translate(356, 172); x.rotate(-0.08); x.fillStyle = '#e9836c'; rr(x, -104, -32, 208, 64, 16); x.fill(); txt(x, 'SKATE', 0, 2, 50, FD, '#fff', null, 0, 190); x.restore();
    txt(x, 'DECKS · WHEELS · GEAR', 350, 228, 16, FT, '#7c70bd', null, 0, 280);
  });
  // --- sign3: BARNACLE BREW
  region(x, 'sign3', (x, w, h) => {
    x.fillStyle = '#2f7f78'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#36928a'; x.beginPath(); for (let i = 0; i <= 16; i++) { const px = i * 32; x.lineTo(px, 220 + Math.sin(i * 1.2) * 10); } x.lineTo(w, h); x.lineTo(0, h); x.fill();
    x.fillStyle = '#f2eee6'; rr(x, 64, 92, 104, 118, 18); x.fill();
    x.strokeStyle = '#f2eee6'; x.lineWidth = 14; x.beginPath(); x.arc(172, 146, 26, -1.2, 1.2); x.stroke();
    x.fillStyle = '#c4614f'; x.fillRect(64, 128, 104, 22);
    x.strokeStyle = '#e5b94d'; x.lineWidth = 8; x.lineCap = 'round';
    for (const ox of [92, 118, 144]) { x.beginPath(); x.moveTo(ox, 80); x.bezierCurveTo(ox - 14, 64, ox + 14, 52, ox, 34); x.stroke(); }
    txt(x, 'BARNACLE', 348, 98, 64, FD, '#f2eee6', null, 0, 300);
    txt(x, 'BREW', 348, 164, 64, FD, '#e5b94d', null, 0, 300);
    txt(x, 'COLD BREW · SODA · SHAKES', 348, 214, 17, FT, '#bfe3dc', null, 0, 300);
  });
  // --- vending fronts (glowing product windows)
  const vend = (name, bg0, bg1, draw) => region(x, name, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, bg0); gr.addColorStop(1, bg1); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) {
      const y = 30 + r * 118;
      x.fillStyle = 'rgba(40,50,70,0.18)'; x.fillRect(10, y + 86, w - 20, 8);
      for (let c = 0; c < 3; c++) {
        const cx = 45 + c * 83; draw(x, cx, y, r, c);
        x.fillStyle = '#35405a'; rr(x, cx - 22, y + 96, 44, 14, 4); x.fill();
        x.fillStyle = '#9ff0c8'; x.fillRect(cx - 16, y + 101, 32, 4);
      }
    }
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.moveTo(0, 0); x.lineTo(70, 0); x.lineTo(0, 170); x.fill();
  });
  const canCols = ['#ec7e68', '#47aea3', '#e5b94d', '#a79be0', '#eea0bf', '#7fc0df'];
  vend('vend0', '#e8fbff', '#bfe9f5', (x, cx, y, r, c) => {
    const col = canCols[(r * 3 + c) % canCols.length];
    x.fillStyle = col; rr(x, cx - 20, y + 18, 40, 68, 9); x.fill();
    x.fillStyle = '#ffffff'; x.fillRect(cx - 20, y + 42, 40, 16);
    x.fillStyle = col; x.beginPath(); x.arc(cx, y + 50, 5, 0, TAU); x.fill();
    x.fillStyle = '#d6dbe0'; rr(x, cx - 17, y + 12, 34, 8, 3); x.fill();
  });
  vend('vend1', '#fff8ea', '#fbe7c2', (x, cx, y, r, c) => {
    const col = canCols[(r * 3 + c + 2) % canCols.length];
    x.strokeStyle = '#9aa0a8'; x.lineWidth = 3; x.beginPath(); for (let i = 0; i < 5; i++) x.ellipse(cx, y + 84, 20, 5, 0, 0, PI); x.stroke();
    x.fillStyle = col; x.beginPath(); x.moveTo(cx - 24, y + 22); x.quadraticCurveTo(cx, y + 12, cx + 24, y + 22); x.lineTo(cx + 22, y + 80); x.quadraticCurveTo(cx, y + 88, cx - 22, y + 80); x.closePath(); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx, y + 50, 14, 11, 0, 0, TAU); x.fill();
    x.fillStyle = '#e5b94d'; x.beginPath(); x.ellipse(cx, y + 50, 8, 6, 0.4, 0, TAU); x.fill();
  });
  // side art: white bubbles + wave, alpha
  region(x, 'side', (x, w, h) => {
    x.fillStyle = '#fff';
    x.beginPath(); x.moveTo(0, h * 0.62); for (let i = 0; i <= 20; i++) x.lineTo((i / 20) * w, h * 0.62 + Math.sin(i * 0.9) * 22); x.lineTo(w, h * 0.7); for (let i = 20; i >= 0; i--) x.lineTo((i / 20) * w, h * 0.7 + Math.sin(i * 0.9 + 0.8) * 18); x.fill();
    for (const [bx, by, br] of [[70, 120, 34], [160, 200, 22], [110, 250, 14], [190, 90, 16], [60, 330, 18], [180, 400, 28], [90, 450, 12]]) { x.lineWidth = 8; x.strokeStyle = '#fff'; x.beginPath(); x.arc(bx, by, br, 0, TAU); x.stroke(); }
  });
  // banner emblem: transparent (team colour shows), navy hems, white roundel with a cut-out squid
  region(x, 'emblem', (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = '#2c2e35'; x.fillRect(0, 0, w, 34); x.fillRect(0, h - 44, w, 44);
    x.fillStyle = '#ffffff'; x.fillRect(0, 34, w, 7); x.fillRect(0, h - 51, w, 7);
    x.save(); x.translate(0, h - 40); for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(i * 32 + 4, 0); x.lineTo(i * 32 + 16, 26); x.lineTo(i * 32 + 28, 0); x.fillStyle = '#ffffff'; x.fill(); } x.restore();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(w / 2, 214, 92, 0, TAU); x.fill();
    x.globalCompositeOperation = 'destination-out'; squidPath(x, w / 2, 222, 70); x.fill(); x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(w / 2 - 20, 214, 13, 17, 0, 0, TAU); x.ellipse(w / 2 + 20, 214, 13, 17, 0, 0, TAU); x.fill();
    x.fillStyle = '#2c2e35'; x.beginPath(); x.arc(w / 2 - 18, 218, 7, 0, TAU); x.arc(w / 2 + 22, 218, 7, 0, TAU); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 10; x.lineCap = 'round';
    x.beginPath(); for (let i = 0; i <= 16; i++) { const px = 28 + (i / 16) * (w - 56); x.lineTo(px, 356 + Math.sin(i * 1.2) * 10); } x.stroke();
    txt(x, 'INK', w / 2, 404, 44, FD, '#fff', null, 0, 200);
  });
  // vending headers (glow)
  region(x, 'head0', (x, w, h) => { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#2f7f78'); g.addColorStop(1, '#47aea3'); x.fillStyle = g; x.fillRect(0, 0, w, h); txt(x, 'FIZZ CURRENT', w / 2, h / 2 + 4, 64, FD, '#ffffff', null, 0, w - 60); for (const [bx, by, br] of [[26, 30, 9], [44, 80, 6], [486, 40, 8], [470, 92, 5]]) { x.strokeStyle = '#d9fff8'; x.lineWidth = 4; x.beginPath(); x.arc(bx, by, br, 0, TAU); x.stroke(); } });
  region(x, 'head1', (x, w, h) => { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#c4614f'); g.addColorStop(1, '#e9836c'); x.fillStyle = g; x.fillRect(0, 0, w, h); txt(x, 'TIDE SNACKS', w / 2, h / 2 + 4, 64, FD, '#fff4dc', null, 0, w - 60); });
  // container stencil (alpha)
  region(x, 'stencil', (x, w, h) => {
    x.clearRect(0, 0, w, h);
    txt(x, 'KRAKEN LINES', w / 2, 62, 66, FD, '#fff', null, 0, w - 30);
    x.fillStyle = '#fff'; x.fillRect(24, 106, w - 48, 8);
    txt(x, 'KRKU 204519  3', 30, 150, 40, FT, '#fff', null, 0, w - 60, 'left');
    txt(x, 'MAX GROSS 30,480 KG', 30, 196, 26, FT, '#fff', null, 0, w - 60, 'left');
    txt(x, 'TARE 2,200 KG', 30, 230, 26, FT, '#fff', null, 0, w - 60, 'left');
  });
  // hazard stripes (opaque, tinted by vertex colour)
  region(x, 'hazard', (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#34363c'; for (let i = -3; i < 12; i++) { x.beginPath(); x.moveTo(i * 64, h); x.lineTo(i * 64 + 32, h); x.lineTo(i * 64 + 32 + h, 0); x.lineTo(i * 64 + h, 0); x.fill(); } });
  // graffiti tag (alpha)
  region(x, 'tag', (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.save(); x.translate(w / 2, h / 2); x.rotate(-0.1);
    txt(x, 'SK8 SQUAD', 6, 8, 96, FD, '#2c2e35', '#2c2e35', 26, w - 50);
    txt(x, 'SK8 SQUAD', 0, 0, 96, FD, '#ffffff', '#2c2e35', 12, w - 50);
    x.restore();
    x.fillStyle = '#fff'; for (const [sx, sy] of [[60, 40], [460, 210], [470, 50]]) { x.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, r = i % 2 ? 7 : 18; x.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } x.fill(); }
  });
  // round fan grille (alpha)
  region(x, 'grille', (x, w, h) => {
    x.clearRect(0, 0, w, h); x.strokeStyle = '#fff'; x.lineWidth = 7;
    for (let r = 24; r < 124; r += 19) { x.beginPath(); x.arc(w / 2, h / 2, r, 0, TAU); x.stroke(); }
    x.lineWidth = 9; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; x.beginPath(); x.moveTo(w / 2 + Math.cos(a) * 20, h / 2 + Math.sin(a) * 20); x.lineTo(w / 2 + Math.cos(a) * 124, h / 2 + Math.sin(a) * 124); x.stroke(); }
    x.fillStyle = '#fff'; x.beginPath(); x.arc(w / 2, h / 2, 22, 0, TAU); x.fill();
  });
  region(x, 'badge', (x, w, h) => { x.fillStyle = '#f2eee6'; rr(x, 0, 0, w, h, 18); x.fill(); x.fillStyle = '#35405a'; rr(x, 8, 8, w - 16, h - 16, 12); x.fill(); txt(x, 'KOOLWAVE', w / 2, h / 2 + 3, 44, FD, '#f2eee6', null, 0, w - 36); });
  region(x, 'wbadge', (x, w, h) => { x.fillStyle = '#2c2e35'; rr(x, 0, 0, w, h, 18); x.fill(); txt(x, 'BOOMTIDE', w / 2, h / 2 + 3, 46, FD, '#e5b94d', null, 0, w - 36); });
  region(x, 'white', (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); });
  region(x, 'clear', (x, w, h) => { x.clearRect(0, 0, w, h); });
  drawStreetPrint(x);
}

// ------------------------------------------------------------------------------------------------ atlas: street print
// Posters, flyers, stickers, street signs, shop headers and small labels. All art is original, muted print colours
// (sun-faded inks on paper), deterministic (seeded) so the atlas is identical on every client.
const INK = { navy: '#2f3a57', cream: '#f4ecd8', paper: '#f6f2e8', coral: '#df7c66', coraldk: '#c25f4c', teal: '#3f9f97', tealdk: '#2c7a74',
  mustard: '#e2b64c', lav: '#a397dc', pink: '#e79ab8', sky: '#7fbcd9', mint: '#98cfb0', ink: '#2c2e35', kraft: '#d2b287', grey: '#8b8f98', red: '#d0584a' };
function paperBG(x, w, h, base, seed, fiber = 0.06, folds = true) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const rnd = mulberry32(seed);
  for (let i = 0; i < (w * h) / 140; i++) { x.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${rnd() * fiber})` : `rgba(80,60,30,${rnd() * fiber})`; x.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2.5, 1 + rnd() * 1.5); }
  if (folds) {
    const fx = w * (0.45 + rnd() * 0.1), fy = h * (0.45 + rnd() * 0.1);
    x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(fx, 0, 2, h); x.fillRect(0, fy, w, 2);
    x.fillStyle = 'rgba(60,40,20,0.08)'; x.fillRect(fx + 2, 0, 2, h); x.fillRect(0, fy + 2, w, 2);
  }
}
function vignette(x, w, h, a = 0.16) {
  const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(90,70,40,0)'); g.addColorStop(1, `rgba(90,70,40,${a})`); x.fillStyle = g; x.fillRect(0, 0, w, h);
}
function splatShape(x, cx, cy, r, seed, drips = 3) {
  const rnd = mulberry32(seed);
  x.beginPath();
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + 0.16 * Math.sin(a * 5 + seed) + 0.1 * Math.sin(a * 11 + seed * 1.7) + (rnd() < 0.12 ? 0.22 : 0);
    const px = cx + Math.cos(a) * r * k, py = cy + Math.sin(a) * r * k;
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.fill();
  for (let i = 0; i < drips; i++) { const dx = cx + (rnd() - 0.5) * r * 1.2, len = r * (0.4 + rnd() * 0.7), dw = r * (0.08 + rnd() * 0.07); x.beginPath(); x.roundRect(dx - dw, cy, dw * 2, r * 0.6 + len, dw); x.fill(); x.beginPath(); x.arc(dx, cy + r * 0.6 + len, dw * 1.35, 0, TAU); x.fill(); }
  for (let i = 0; i < 7; i++) { const a = rnd() * TAU, d = r * (1.25 + rnd() * 0.5); x.beginPath(); x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.04 + rnd() * 0.07), 0, TAU); x.fill(); }
}
function halftone(x, x0, y0, w, h, step, color, fn) {
  x.fillStyle = color;
  for (let yy = y0, row = 0; yy < y0 + h; yy += step, row++) for (let xx = x0 + (row % 2) * step * 0.5; xx < x0 + w; xx += step) {
    const r = fn(xx, yy) * step * 0.55; if (r > 0.35) { x.beginPath(); x.arc(xx, yy, r, 0, TAU); x.fill(); }
  }
}
function starburst(x, cx, cy, r1, r2, n, fill, rot = 0) {
  x.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * TAU, r = i % 2 ? r2 : r1; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  x.closePath(); x.fillStyle = fill; x.fill();
}
function ribbon(x, cx, cy, w, h, fill, fold) {
  x.fillStyle = fold;
  for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * (w / 2 - 6), cy - h / 2 + 8); x.lineTo(cx + s * (w / 2 + 22), cy - h / 2 + 8); x.lineTo(cx + s * (w / 2 + 10), cy + 4); x.lineTo(cx + s * (w / 2 + 22), cy + h / 2 + 8); x.lineTo(cx + s * (w / 2 - 6), cy + h / 2 + 8); x.fill(); }
  x.fillStyle = fill; x.fillRect(cx - w / 2, cy - h / 2, w, h);
}
function wavesBand(x, y, w, amp, len, fill, phase = 0, h = 400) {
  x.beginPath(); x.moveTo(0, y);
  for (let i = 0; i <= w; i += 4) x.lineTo(i, y + Math.sin((i / len) * TAU + phase) * amp);
  x.lineTo(w, y + h); x.lineTo(0, y + h); x.closePath(); x.fillStyle = fill; x.fill();
}
function tornEdges(x, w, h, seed, depth = 6) {
  // bite irregular chunks out of the paper border (alpha)
  const rnd = mulberry32(seed);
  x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000';
  for (const side of [0, 1, 2, 3]) {
    x.beginPath();
    const L = side % 2 ? h : w;
    if (side === 0) x.moveTo(0, 0); else if (side === 1) x.moveTo(w, 0); else if (side === 2) x.moveTo(w, h); else x.moveTo(0, h);
    for (let t = 0; t <= L; t += 5) {
      const d = rnd() * depth * (rnd() < 0.08 ? 2.5 : 1);
      if (side === 0) x.lineTo(t, d); else if (side === 1) x.lineTo(w - d, t); else if (side === 2) x.lineTo(w - t, h - d); else x.lineTo(d, h - t);
    }
    if (side === 0) x.lineTo(w, 0); else if (side === 1) x.lineTo(w, h); else if (side === 2) x.lineTo(0, h); else x.lineTo(0, 0);
    x.fill();
  }
  x.restore();
}
function lines(x, x0, y0, w, n, gap, col, seed) { const rnd = mulberry32(seed); x.fillStyle = col; for (let i = 0; i < n; i++) x.fillRect(x0, y0 + i * gap, w * (i === n - 1 ? 0.55 : 0.8 + rnd() * 0.2), Math.max(2, gap * 0.35)); }
function roundSign(x, w, h, ring, bg, slash) {
  x.clearRect(0, 0, w, h);
  x.fillStyle = ring; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 3, 0, TAU); x.fill();
  x.fillStyle = bg; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 15, 0, TAU); x.fill();
  if (slash) return () => { x.save(); x.translate(w / 2, h / 2); x.rotate(-PI / 4); x.fillStyle = ring; x.fillRect(-w / 2 + 16, -6, w - 32, 12); x.restore(); };
  return null;
}
function triSign(x, w, h, fill, border) {
  x.clearRect(0, 0, w, h);
  const tri = (inset) => { x.beginPath(); x.moveTo(w / 2, 8 + inset * 1.9); x.lineTo(w - 6 - inset * 1.6, h - 12 - inset); x.lineTo(6 + inset * 1.6, h - 12 - inset); x.closePath(); };
  x.lineJoin = 'round'; x.lineWidth = 10; x.strokeStyle = border; x.fillStyle = border; tri(0); x.fill(); x.stroke();
  x.fillStyle = fill; tri(9); x.fill();
}
function miniSquid(x, cx, cy, s, body, eye = '#fff', pupil = INK.navy) {
  squidPath(x, cx, cy, s); x.fillStyle = body; x.fill();
  x.fillStyle = eye; x.beginPath(); x.ellipse(cx - 0.2 * s, cy + 0.05 * s, 0.13 * s, 0.17 * s, 0, 0, TAU); x.ellipse(cx + 0.2 * s, cy + 0.05 * s, 0.13 * s, 0.17 * s, 0, 0, TAU); x.fill();
  x.fillStyle = pupil; x.beginPath(); x.arc(cx - 0.18 * s, cy + 0.09 * s, 0.07 * s, 0, TAU); x.arc(cx + 0.22 * s, cy + 0.09 * s, 0.07 * s, 0, TAU); x.fill();
}
function drawStreetPrint(x) {
  const I = INK;
  // ---------------------------------------------------------------- posters
  region(x, 'pst0', (x, w, h) => { // TURF WAR FINALS
    paperBG(x, w, h, '#f3ead6', 11);
    x.fillStyle = '#e8dcc0'; for (let i = -6; i < 16; i++) { x.beginPath(); x.moveTo(i * 30, h); x.lineTo(i * 30 + 14, h); x.lineTo(i * 30 + 214, 0); x.lineTo(i * 30 + 200, 0); x.fill(); }
    x.fillStyle = I.coral; splatShape(x, 78, 168, 78, 3, 2);
    x.fillStyle = I.teal; splatShape(x, 184, 182, 78, 8, 2);
    halftone(x, 0, 90, w, 180, 7, 'rgba(255,255,255,0.28)', (xx, yy) => Math.max(0, 1 - Math.hypot(xx - 128, yy - 175) / 120));
    x.fillStyle = '#fff'; x.strokeStyle = I.navy; x.lineWidth = 5; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(140, 96); x.lineTo(108, 170); x.lineTo(134, 170); x.lineTo(112, 248); x.lineTo(160, 156); x.lineTo(134, 156); x.lineTo(156, 96); x.closePath(); x.fill(); x.stroke();
    miniSquid(x, 62, 172, 30, I.cream, I.coraldk, '#fff');
    miniSquid(x, 200, 188, 30, I.cream, I.tealdk, '#fff');
    txt(x, 'TURF WAR', w / 2, 46, 46, FD, I.navy, I.cream, 10, w - 20);
    ribbon(x, w / 2, 282, 170, 44, I.mustard, '#b98f2f');
    txt(x, 'FINALS', w / 2, 284, 36, FD, I.navy, null, 0, 160);
    txt(x, 'SAT · 8PM', w / 2, 326, 22, FT, I.navy, null, 0, w - 30, 'center');
    txt(x, 'PIER 3 ARENA · FREE ENTRY', w / 2, 348, 12, FT, I.coraldk, null, 0, w - 30);
    x.fillStyle = I.navy; x.fillRect(0, h - 18, w, 18); txt(x, 'LIVE ON SQUID RADIO 88.2 FM', w / 2, h - 9, 10, FT, I.cream, null, 0, w - 20);
    vignette(x, w, h);
  });
  region(x, 'pst1', (x, w, h) => { // LOW TIDE RIOT gig
    paperBG(x, w, h, I.navy, 21, 0.09);
    x.fillStyle = '#394670'; for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(128, 150, 40 + i * 16, 0, TAU); x.lineWidth = 3; x.strokeStyle = '#3a4872'; x.stroke(); }
    x.fillStyle = I.pink; x.beginPath(); x.arc(128, 146, 92, 0, TAU); x.fill();
    x.strokeStyle = '#d686a6'; x.lineWidth = 2; for (let r = 36; r < 90; r += 7) { x.beginPath(); x.arc(128, 146, r, 0, TAU); x.stroke(); }
    x.fillStyle = I.mustard; x.beginPath(); x.arc(128, 146, 28, 0, TAU); x.fill();
    x.fillStyle = I.navy; x.beginPath(); x.arc(128, 146, 5, 0, TAU); x.fill();
    txt(x, 'LTR', 128, 131, 14, FD, I.navy, null, 0, 40);
    x.strokeStyle = I.coral; x.lineCap = 'round'; x.lineWidth = 11;
    for (const [a, b, c] of [[60, 230, -1], [196, 232, 1], [100, 236, -0.4], [156, 236, 0.4]]) { x.beginPath(); x.moveTo(a, 214); x.bezierCurveTo(a + c * 20, 238, b - c * 30, 250, b + c * 16, 226); x.stroke(); }
    txt(x, 'LOW TIDE', w / 2, 272, 40, FD, I.cream, null, 0, w - 24);
    txt(x, 'RIOT', w / 2 + 3, 317, 54, FD, '#1d2438', null, 0, w - 24);
    txt(x, 'RIOT', w / 2, 314, 54, FD, I.mustard, null, 0, w - 24);
    txt(x, 'LIVE @ THE SHACK · FRI 9PM', w / 2, 350, 13, FT, I.pink, null, 0, w - 24);
    txt(x, '+ THE BARNACLES · FREE', w / 2, 368, 11, FT, '#c9cfe0', null, 0, w - 24);
  });
  region(x, 'pst2', (x, w, h) => { // LOST SQUID with tear-off tabs
    paperBG(x, w, h, '#f7f5ef', 31, 0.05);
    txt(x, 'LOST', w / 2, 44, 58, FD, I.red, null, 0, w - 30);
    txt(x, 'SQUID', w / 2, 92, 36, FD, I.navy, null, 0, w - 30);
    x.save(); x.translate(128, 176); x.rotate(-0.035);
    x.fillStyle = '#fff'; x.fillRect(-78, -60, 156, 118); x.fillStyle = '#bfe0ee'; x.fillRect(-70, -52, 140, 96);
    x.fillStyle = '#9fd0e4'; x.fillRect(-70, 20, 140, 24);
    miniSquid(x, 0, -4, 40, I.teal);
    x.restore();
    txt(x, 'HAVE YOU SEEN BLOOP?', w / 2, 256, 15, FT, I.navy, null, 0, w - 24);
    txt(x, 'small · teal · loves fries', w / 2, 276, 12, (p) => FT(p, 600), I.grey, null, 0, w - 30);
    txt(x, 'REWARD!', w / 2, 300, 22, FD, I.red, null, 0, w - 30);
    // tear-off tabs
    const tw = 256 / 7;
    for (let i = 0; i < 7; i++) {
      x.save(); x.translate(i * tw + tw / 2, 348); x.rotate(-HP);
      txt(x, 'BLOOP 555-0142', 0, 0, 9, FT, I.navy, null, 0, 64);
      x.restore();
    }
    x.clearRect(0, 318, w, 2);
    for (let i = 1; i < 7; i++) x.clearRect(i * tw - 1, 318, 2, 66);
    x.clearRect(2 * tw + 1, 320, tw - 2, 64); x.clearRect(5 * tw + 1, 320, tw - 2, 64);
  });
  region(x, 'pst3', (x, w, h) => { // SPLASHFEST
    const g = x.createLinearGradient(0, 0, 0, 230); g.addColorStop(0, '#86c3e0'); g.addColorStop(1, '#f2d6a2'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,240,200,0.5)'; for (let i = 0; i < 14; i++) { x.save(); x.translate(128, 226); x.rotate(-PI + (i / 13) * PI); x.fillRect(0, -5, 200, 10); x.restore(); }
    x.fillStyle = I.mustard; x.beginPath(); x.arc(128, 226, 64, PI, TAU); x.fill();
    wavesBand(x, 222, w, 6, 64, I.teal, 0.4); wavesBand(x, 252, w, 7, 72, '#57b2a8', 1.9); wavesBand(x, 290, w, 6, 58, I.tealdk, 3.1);
    txt(x, 'SPLASH', w / 2, 58, 50, FD, I.cream, I.navy, 10, w - 20);
    txt(x, 'FEST', w / 2, 112, 58, FD, I.coral, I.navy, 10, w - 20);
    txt(x, 'SUMMER MUSIC & INK', w / 2, 150, 13, FT, I.navy, null, 0, w - 30);
    txt(x, 'JULY 12–14', w / 2, 276, 30, FD, I.cream, null, 0, w - 30);
    txt(x, 'LOW TIDE RIOT · DJ KELPY · THE BARNACLES', w / 2, 318, 10, FT, '#e9f6f3', null, 0, w - 24);
    txt(x, 'TIDEWATER PLAZA', w / 2, 344, 14, FT, I.mustard, null, 0, w - 30);
    paperBG(x, 0, 0, 'rgba(0,0,0,0)', 1); vignette(x, w, h, 0.2);
  });
  region(x, 'pst4', (x, w, h) => { // SURF SCHOOL
    paperBG(x, w, h, I.teal, 41, 0.07);
    x.fillStyle = '#48aaa1'; for (let i = -6; i < 14; i++) { x.beginPath(); x.moveTo(i * 40, h); x.lineTo(i * 40 + 18, h); x.lineTo(i * 40 + 218, 0); x.lineTo(i * 40 + 200, 0); x.fill(); }
    x.save(); x.translate(150, 214); x.rotate(-0.62);
    x.fillStyle = I.cream; x.beginPath(); x.ellipse(0, 0, 150, 34, 0, 0, TAU); x.fill();
    x.fillStyle = I.coral; x.fillRect(-150, -8, 300, 16); x.fillStyle = I.mustard; x.fillRect(-150, -2, 300, 4);
    x.fillStyle = I.navy; x.beginPath(); x.moveTo(-120, 30); x.lineTo(-100, 58); x.lineTo(-88, 30); x.fill();
    x.restore();
    txt(x, 'SURF', 84, 54, 56, FD, I.cream, I.tealdk, 8, 150);
    txt(x, 'SCHOOL', 90, 102, 34, FD, I.mustard, I.tealdk, 7, 170);
    x.fillStyle = I.navy; x.fillRect(0, 312, w, 72);
    txt(x, 'LEARN TO RIDE THE SWELL', w / 2, 334, 14, FT, I.cream, null, 0, w - 24);
    txt(x, 'LESSONS DAILY · 7AM · PIER 1', w / 2, 358, 11, FT, I.mint, null, 0, w - 24);
    vignette(x, w, h, 0.18);
  });
  region(x, 'pst5', (x, w, h) => { // SEA SALT FRIES 2 FOR 1
    paperBG(x, w, h, '#e8c25c', 51, 0.07);
    x.save(); x.translate(128, 210); x.fillStyle = '#efd07e'; for (let i = 0; i < 18; i++) { x.rotate(TAU / 18); x.beginPath(); x.moveTo(0, 0); x.lineTo(300, -26); x.lineTo(300, 26); x.fill(); } x.restore();
    const fries = [[-40, -60, -0.25], [-22, -76, -0.12], [-4, -84, 0.02], [14, -78, 0.12], [30, -66, 0.22], [-30, -50, -0.4], [40, -52, 0.35], [6, -70, -0.05]];
    x.save(); x.translate(128, 250);
    for (const [fx, fy, r] of fries) { x.save(); x.translate(fx, fy); x.rotate(r); x.fillStyle = '#f7dc8a'; x.fillRect(-7, -40, 14, 90); x.fillStyle = '#e6be5c'; x.fillRect(3, -40, 4, 90); x.restore(); }
    x.fillStyle = I.coral; x.beginPath(); x.moveTo(-62, -30); x.lineTo(62, -30); x.lineTo(44, 70); x.lineTo(-44, 70); x.closePath(); x.fill();
    x.fillStyle = I.cream; for (const sx of [-30, 0, 30]) { x.beginPath(); x.moveTo(sx - 9, -30); x.lineTo(sx + 9, -30); x.lineTo(sx * 0.7 + 6, 70); x.lineTo(sx * 0.7 - 6, 70); x.fill(); }
    x.fillStyle = '#fff'; for (let i = 0; i < 18; i++) { x.fillRect(-50 + (i * 37) % 100, -100 + (i * 23) % 60, 3, 3); }
    x.restore();
    starburst(x, 204, 118, 44, 32, 14, I.coraldk, 0.1);
    txt(x, '2 FOR 1', 204, 118, 20, FD, I.cream, null, 0, 70);
    txt(x, 'SEA SALT', w / 2, 40, 36, FD, I.navy, null, 0, w - 24);
    txt(x, 'FRIES', 104, 88, 48, FD, I.coral, I.cream, 8, 170);
    x.fillStyle = I.navy; x.fillRect(0, h - 38, w, 38);
    txt(x, 'TIDE SNACKS · KIOSK', w / 2, h - 19, 14, FT, I.mustard, null, 0, w - 24);
  });
  region(x, 'pst6', (x, w, h) => { // SKATE JAM
    paperBG(x, w, h, '#b3a8e3', 61, 0.06);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) { x.fillStyle = (r + c) % 2 ? I.navy : I.cream; x.fillRect(c * 16, h - 64 + r * 16, 16, 16); }
    x.save(); x.translate(128, 196); x.rotate(-0.3);
    x.fillStyle = I.navy; x.beginPath(); x.roundRect(-110, -26, 220, 52, 26); x.fill();
    x.fillStyle = I.coral; x.fillRect(-60, -26, 18, 52); x.fillStyle = I.mustard; x.fillRect(42, -26, 18, 52);
    x.fillStyle = I.mustard; for (const [wx, wy] of [[-70, 34], [-40, 34], [40, 34], [70, 34]]) { x.beginPath(); x.arc(wx, wy, 11, 0, TAU); x.fill(); }
    x.restore();
    x.strokeStyle = I.cream; x.lineWidth = 5; x.lineCap = 'round'; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(12 + i * 6, 150 + i * 16); x.lineTo(40 + i * 6, 150 + i * 16); x.stroke(); }
    txt(x, 'SKATE', w / 2, 52, 52, FD, I.cream, I.navy, 10, w - 20);
    txt(x, 'JAM', w / 2, 114, 70, FD, I.mustard, I.navy, 10, w - 20);
    txt(x, 'BEST TRICK CONTEST', w / 2, 276, 15, FT, I.navy, null, 0, w - 24);
    txt(x, 'SUN 3PM · SQUIDKID SKATE', w / 2, 298, 12, FT, '#5a4f93', null, 0, w - 24);
    vignette(x, w, h, 0.14);
  });
  region(x, 'pst7', (x, w, h) => { // SQUID RADIO 88.2
    paperBG(x, w, h, '#e48a73', 71, 0.07);
    x.strokeStyle = I.cream; x.lineCap = 'round';
    for (let i = 0; i < 5; i++) { x.lineWidth = 9 - i; x.beginPath(); x.arc(128, 150, 36 + i * 26, -PI * 0.8, -PI * 0.2); x.stroke(); }
    x.fillStyle = I.navy; x.beginPath(); x.moveTo(128, 126); x.lineTo(112, 206); x.lineTo(144, 206); x.closePath(); x.fill();
    x.fillStyle = I.cream; x.beginPath(); x.arc(128, 126, 10, 0, TAU); x.fill();
    txt(x, '88.2', w / 2 + 4, 262, 72, FD, '#8c3f31', null, 0, w - 20);
    txt(x, '88.2', w / 2, 258, 72, FD, I.cream, null, 0, w - 20);
    txt(x, 'FM', 220, 222, 22, FD, I.navy, null, 0, 60);
    txt(x, 'SQUID RADIO', w / 2, 44, 32, FD, I.navy, null, 0, w - 24);
    txt(x, 'NONSTOP INK HITS', w / 2, 316, 14, FT, I.navy, null, 0, w - 24);
    txt(x, 'ALL DAY · ALL SPLAT', w / 2, 340, 11, FT, I.cream, null, 0, w - 24);
    vignette(x, w, h);
  });
  region(x, 'pst8', (x, w, h) => { // KRAKEN LINES cruises
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2f3a57'); g.addColorStop(1, '#3d5a7a'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    const rnd = mulberry32(81); x.fillStyle = 'rgba(244,236,216,0.7)'; for (let i = 0; i < 40; i++) x.fillRect(rnd() * w, rnd() * 150, 2, 2);
    x.fillStyle = I.cream; x.beginPath(); x.arc(196, 70, 22, 0, TAU); x.fill();
    x.fillStyle = I.cream; x.beginPath(); x.moveTo(40, 226); x.lineTo(216, 226); x.lineTo(196, 262); x.lineTo(60, 262); x.closePath(); x.fill();
    x.fillRect(80, 196, 100, 30); x.fillRect(100, 176, 56, 20); x.fillStyle = I.coral; x.fillRect(120, 150, 16, 26);
    x.fillStyle = I.navy; for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(94 + i * 18, 211, 5, 0, TAU); x.fill(); }
    x.strokeStyle = I.mustard; x.lineWidth = 12; x.lineCap = 'round';
    x.beginPath(); x.moveTo(30, 300); x.bezierCurveTo(24, 240, 70, 230, 52, 196); x.stroke(); x.beginPath(); x.arc(52, 188, 8, 0, TAU); x.stroke();
    wavesBand(x, 258, w, 7, 50, I.teal, 0.3); wavesBand(x, 282, w, 6, 44, I.tealdk, 2.1);
    txt(x, 'KRAKEN LINES', w / 2, 36, 32, FD, I.cream, null, 0, w - 24);
    txt(x, 'SAIL THE SEVEN REEFS', w / 2, 118, 16, FT, I.mustard, null, 0, w - 24);
    txt(x, 'DAILY FERRIES · PIER 1', w / 2, 336, 13, FT, I.cream, null, 0, w - 24);
    txt(x, 'kids ride free', w / 2, 358, 11, (p) => FT(p, 600), '#bcd6e8', null, 0, w - 24);
  });
  region(x, 'pst9', (x, w, h) => { // municipal NO SWIMMING notice
    paperBG(x, w, h, '#fbfaf6', 91, 0.04, false);
    x.strokeStyle = I.red; x.lineWidth = 8; x.strokeRect(8, 8, w - 16, h - 16);
    x.fillStyle = I.red; x.fillRect(8, 8, w - 16, 58); txt(x, 'NOTICE', w / 2, 38, 34, FD, '#fff', null, 0, w - 40);
    x.save(); x.translate(128, 142);
    x.fillStyle = I.red; x.beginPath(); x.arc(0, 0, 56, 0, TAU); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 45, 0, TAU); x.fill();
    x.fillStyle = I.navy; x.beginPath(); x.ellipse(-4, 4, 26, 12, -0.2, 0, TAU); x.fill(); x.beginPath(); x.arc(22, -6, 9, 0, TAU); x.fill();
    x.strokeStyle = I.sky; x.lineWidth = 4; for (let i = 0; i < 2; i++) { x.beginPath(); for (let t = -40; t <= 40; t += 4) x.lineTo(t, 24 + i * 9 + Math.sin(t * 0.25) * 3); x.stroke(); }
    x.rotate(-PI / 4); x.fillStyle = I.red; x.fillRect(-48, -5, 96, 10);
    x.restore();
    txt(x, 'NO SWIMMING', w / 2, 228, 26, FT, I.navy, null, 0, w - 36);
    txt(x, 'IN THE HARBOR DOCK', w / 2, 254, 14, FT, I.navy, null, 0, w - 36);
    lines(x, 30, 276, w - 60, 5, 12, '#b9bcc4', 92);
    txt(x, 'HARBOR AUTHORITY · BYLAW 14', w / 2, 352, 10, FT, I.grey, null, 0, w - 36);
  });
  region(x, 'pst10', (x, w, h) => { // HARBOR MARKET SUNDAYS (kraft)
    paperBG(x, w, h, I.kraft, 101, 0.1);
    txt(x, 'HARBOR', w / 2, 46, 44, FD, I.navy, null, 0, w - 24);
    txt(x, 'MARKET', w / 2, 96, 48, FD, I.coraldk, null, 0, w - 24);
    x.save(); x.translate(200, 150); x.rotate(0.3); x.strokeStyle = I.red; x.lineWidth = 4; x.beginPath(); x.arc(0, 0, 34, 0, TAU); x.stroke(); x.beginPath(); x.arc(0, 0, 28, 0, TAU); x.stroke(); txt(x, 'SUNDAYS', 0, 1, 12, FT, I.red, null, 0, 52); x.restore();
    x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round';
    x.strokeStyle = I.tealdk; x.beginPath(); x.ellipse(70, 170, 38, 18, 0, 0, TAU); x.stroke(); x.beginPath(); x.moveTo(106, 170); x.lineTo(126, 154); x.lineTo(126, 186); x.closePath(); x.stroke(); x.beginPath(); x.arc(52, 166, 3, 0, TAU); x.stroke();
    x.strokeStyle = '#b8902c'; x.beginPath(); x.ellipse(84, 246, 28, 22, 0.3, 0, TAU); x.stroke(); x.beginPath(); x.moveTo(104, 230); x.lineTo(112, 222); x.stroke();
    x.strokeStyle = I.coraldk; x.beginPath(); x.ellipse(176, 244, 30, 20, 0, 0, TAU); x.stroke(); for (const s of [-1, 1]) { x.beginPath(); x.moveTo(176 + s * 26, 232); x.quadraticCurveTo(176 + s * 44, 210, 176 + s * 30, 204); x.stroke(); }
    txt(x, 'FRESH · LOCAL · SALTY', w / 2, 300, 14, FT, I.navy, null, 0, w - 24);
    txt(x, '8AM – 2PM · PIER 2', w / 2, 324, 12, FT, '#6a5236', null, 0, w - 24);
    vignette(x, w, h, 0.22);
  });
  region(x, 'pst11', (x, w, h) => { // BARNACLE BREW cold brew
    paperBG(x, w, h, I.tealdk, 111, 0.08);
    wavesBand(x, 300, w, 8, 70, '#358c85', 0.5);
    x.save(); x.translate(128, 196);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.moveTo(-50, -80); x.lineTo(50, -80); x.lineTo(38, 80); x.lineTo(-38, 80); x.closePath(); x.fill();
    const g = x.createLinearGradient(0, -40, 0, 80); g.addColorStop(0, '#a9774e'); g.addColorStop(1, '#6e4a2f'); x.fillStyle = g;
    x.beginPath(); x.moveTo(-45, -40); x.lineTo(45, -40); x.lineTo(38, 78); x.lineTo(-38, 78); x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.5)'; for (const [ix, iy, r] of [[-16, -24, 0.3], [14, -10, -0.2], [-6, 8, 0.1]]) { x.save(); x.translate(ix, iy); x.rotate(r); x.fillRect(-12, -12, 24, 24); x.restore(); }
    x.fillStyle = I.cream; x.fillRect(-56, -90, 112, 12);
    x.fillStyle = I.coral; x.save(); x.rotate(0.18); x.fillRect(8, -170, 10, 100); x.restore();
    x.restore();
    starburst(x, 62, 96, 34, 25, 12, I.coral, 0.2); txt(x, 'NEW!', 62, 96, 16, FD, I.cream, null, 0, 52);
    txt(x, 'COLD BREW', w / 2, 44, 40, FD, I.cream, null, 0, w - 24);
    txt(x, 'BARNACLE BREW', w / 2, 330, 18, FD, I.mustard, null, 0, w - 24);
    txt(x, 'SLOW STEEPED · SEA SALT CARAMEL', w / 2, 356, 10, FT, '#cdebe6', null, 0, w - 24);
  });
  region(x, 'pw0', (x, w, h) => { // wide: INK THE TOWN (season 3)
    paperBG(x, w, h, '#f3ead6', 121, 0.05);
    x.fillStyle = I.mustard; splatShape(x, 108, 124, 92, 5, 3);
    x.fillStyle = I.lav; splatShape(x, 420, 70, 50, 9, 1);
    miniSquid(x, 108, 118, 52, I.navy, '#fff', I.navy);
    txt(x, 'INK THE TOWN', 336, 88, 50, FD, I.navy, null, 0, 300);
    txt(x, 'TURF WAR · SEASON 3', 336, 140, 26, FD, I.coral, null, 0, 300);
    txt(x, 'NEW STAGES · NEW GEAR · SAME SQUIDS', 336, 180, 13, FT, I.navy, null, 0, 300);
    x.fillStyle = I.teal; x.fillRect(0, h - 26, w, 26); txt(x, 'KELPLINE TERMINAL NOW OPEN', w / 2, h - 13, 12, FT, I.cream, null, 0, w - 40);
    vignette(x, w, h, 0.14);
  });
  region(x, 'ferry', (x, w, h) => { // ferry timetable
    paperBG(x, w, h, '#fbfaf6', 131, 0.04, false);
    x.fillStyle = I.navy; x.fillRect(0, 0, w, 50);
    txt(x, 'FERRY TIMES', 20, 26, 28, FD, I.cream, null, 0, 240, 'left');
    txt(x, 'PIER 1', w - 20, 27, 18, FT, I.mustard, null, 0, 120, 'right');
    const rows = [['SEVEN REEFS', '07:15'], ['KELP ISLE', '08:40'], ['LIGHTHOUSE', '10:05'], ['CORAL BAY', '12:30'], ['SEVEN REEFS', '15:45'], ['LAST FERRY', '19:20']];
    rows.forEach(([a, b], i) => {
      const y = 62 + i * 30;
      if (i % 2 === 0) { x.fillStyle = '#e6eef4'; x.fillRect(10, y - 2, w - 20, 28); }
      txt(x, a, 22, y + 12, 15, FT, I.navy, null, 0, 220, 'left');
      txt(x, b, w - 22, y + 12, 16, FT, i === 5 ? I.red : I.tealdk, null, 0, 120, 'right');
    });
    txt(x, 'tickets on board · harbor authority', w / 2, h - 12, 10, (p) => FT(p, 600), I.grey, null, 0, w - 30);
  });
  region(x, 'torn', (x, w, h) => { // torn poster remnants (alpha)
    x.clearRect(0, 0, w, h);
    const scraps = [[4, 6, 70, 80, I.coral, 'TUR'], [60, 30, 64, 70, I.teal, 'FEST'], [8, 96, 56, 90, I.cream, 'LOS'], [58, 110, 66, 76, I.mustard, '88']];
    scraps.forEach(([sx, sy, sw, sh, c, t], i) => {
      x.save(); x.translate(sx, sy); x.fillStyle = c; x.fillRect(0, 0, sw, sh);
      txt(x, t, sw / 2, sh * 0.45, 26, FD, i === 2 ? I.red : I.navy, null, 0, sw);
      tornEdges(x, sw, sh, 140 + i, 9);
      x.restore();
    });
  });
  // ---------------------------------------------------------------- shop / cart headers, menus
  const header = (name, bg, fg, title, sub, icon) => region(x, name, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(0, 0, w, h * 0.45);
    x.strokeStyle = fg; x.lineWidth = 4; x.strokeRect(8, 8, w - 16, h - 16);
    if (icon) icon(x, 62, h / 2);
    txt(x, title, 226, h / 2 - (sub ? 10 : 0), 44, FD, fg, null, 0, 280);
    if (sub) txt(x, sub, 226, h / 2 + 30, 14, FT, fg, null, 0, 280);
  });
  header('cart0', '#eba7c0', I.navy, 'CHILLY SCOOPS', 'SOFT SERVE · POPS · FLOATS', (x, cx, cy) => { x.fillStyle = '#c9934f'; x.beginPath(); x.moveTo(cx - 20, cy - 6); x.lineTo(cx + 20, cy - 6); x.lineTo(cx, cy + 44); x.fill(); x.fillStyle = I.cream; x.beginPath(); x.arc(cx, cy - 14, 22, 0, TAU); x.fill(); x.fillStyle = I.pink; x.beginPath(); x.arc(cx + 4, cy - 30, 14, 0, TAU); x.fill(); });
  header('cart1', I.mustard, I.navy, 'SQUID DOGS', 'GRILLED · SAUCED · LEGENDARY', (x, cx, cy) => { x.fillStyle = '#e8cf95'; x.beginPath(); x.roundRect(cx - 42, cy - 14, 84, 30, 14); x.fill(); x.fillStyle = I.coral; x.beginPath(); x.roundRect(cx - 46, cy - 8, 92, 16, 8); x.fill(); x.strokeStyle = I.mustard; x.lineWidth = 3; x.beginPath(); for (let i = 0; i < 8; i++) x.lineTo(cx - 36 + i * 10, cy + (i % 2 ? -4 : 3)); x.stroke(); });
  header('stall0', I.teal, I.cream, 'FRESH CATCH', 'CAUGHT THIS MORNING', (x, cx, cy) => { x.fillStyle = I.cream; x.beginPath(); x.ellipse(cx - 6, cy, 34, 16, 0, 0, TAU); x.fill(); x.beginPath(); x.moveTo(cx + 24, cy); x.lineTo(cx + 44, cy - 16); x.lineTo(cx + 44, cy + 16); x.fill(); x.fillStyle = I.teal; x.beginPath(); x.arc(cx - 24, cy - 3, 4, 0, TAU); x.fill(); });
  header('stall1', '#8cc49a', I.navy, 'HARBOR GREENS', 'FRUIT · VEG · HERBS', (x, cx, cy) => { x.fillStyle = I.mustard; x.beginPath(); x.ellipse(cx - 12, cy + 4, 20, 16, 0.4, 0, TAU); x.fill(); x.fillStyle = I.coral; x.beginPath(); x.arc(cx + 16, cy + 8, 16, 0, TAU); x.fill(); x.fillStyle = '#4f9a57'; x.beginPath(); x.ellipse(cx + 18, cy - 12, 8, 4, -0.6, 0, TAU); x.fill(); });
  header('stall2', I.lav, I.cream, 'SPLAT MERCH', 'TEES · CAPS · STICKERS', (x, cx, cy) => { x.fillStyle = I.cream; x.beginPath(); x.moveTo(cx - 30, cy - 26); x.lineTo(cx - 12, cy - 30); x.quadraticCurveTo(cx, cy - 22, cx + 12, cy - 30); x.lineTo(cx + 30, cy - 26); x.lineTo(cx + 38, cy - 10); x.lineTo(cx + 24, cy - 6); x.lineTo(cx + 24, cy + 30); x.lineTo(cx - 24, cy + 30); x.lineTo(cx - 24, cy - 6); x.lineTo(cx - 38, cy - 10); x.closePath(); x.fill(); x.fillStyle = I.coral; splatShape(x, cx, cy + 6, 10, 4, 0); });
  region(x, 'chalk', (x, w, h) => { // chalk menu board
    x.fillStyle = '#34403d'; x.fillRect(0, 0, w, h);
    const rnd = mulberry32(151); for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${0.02 + rnd() * 0.05})`; x.beginPath(); x.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 30, 2 + rnd() * 6, rnd() * PI, 0, TAU); x.fill(); }
    const chalkTxt = (s, cx, cy, px, col, al = 'center', font = FD) => { txt(x, s, cx, cy, px, font, col, null, 0, w - 30, al); };
    chalkTxt('TODAY', w / 2, 34, 32, '#f3efe4');
    const items = [['SQUID DOG', '3.50'], ['SEA FRIES', '2.00'], ['FISH TACO', '4.00'], ['KELP SHAKE', '3.00'], ['FIZZ', '1.50']];
    items.forEach(([a, b], i) => {
      const y = 76 + i * 34;
      chalkTxt(a, 18, y, 17, '#f3efe4', 'left', FT);
      chalkTxt(b, w - 18, y, 17, i % 2 ? '#f5d98a' : '#f7b6c8', 'right', FT);
      x.fillStyle = 'rgba(243,239,228,0.45)'; for (let d = 130; d < 196; d += 8) x.fillRect(d, y + 2, 3, 3);
    });
    x.strokeStyle = 'rgba(243,239,228,0.7)'; x.lineWidth = 3; x.strokeRect(6, 6, w - 12, h - 12);
  });
  region(x, 'chalk2', (x, w, h) => {
    x.fillStyle = '#34403d'; x.fillRect(0, 0, w, h);
    const items = [['LEMONS', '3 / 1.00'], ['MANGO', '1.50'], ['MELON', '2.50']];
    items.forEach(([a, b], i) => { txt(x, a, 16, 26 + i * 36, 18, FT, '#f3efe4', null, 0, 120, 'left'); txt(x, b, w - 16, 26 + i * 36, 18, FT, '#f5d98a', null, 0, 110, 'right'); });
    x.strokeStyle = 'rgba(243,239,228,0.6)'; x.lineWidth = 3; x.strokeRect(5, 5, w - 10, h - 10);
  });
  region(x, 'menu', (x, w, h) => { // ice-cream menu board
    paperBG(x, w, h, '#fbf3e4', 161, 0.04, false);
    x.fillStyle = I.pink; x.fillRect(0, 0, w, 38); txt(x, 'MENU', w / 2, 20, 26, FD, '#fff', null, 0, w - 20);
    const pops = [[I.pink, 'BERRY'], [I.mint, 'MINT'], [I.mustard, 'MANGO'], [I.lav, 'UBE']];
    pops.forEach(([c, n], i) => {
      const cx = 32 + i * 64;
      x.fillStyle = '#d9b27a'; x.fillRect(cx - 3, 110, 6, 26);
      x.fillStyle = c; x.beginPath(); x.roundRect(cx - 18, 52, 36, 62, 16); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(cx - 12, 58, 6, 44);
      txt(x, n, cx, 150, 11, FT, I.navy, null, 0, 60);
      txt(x, '1.50', cx, 170, 12, FT, I.coraldk, null, 0, 60);
    });
  });
  region(x, 'ice', (x, w, h) => { x.fillStyle = '#e9f5fb'; x.fillRect(0, 0, w, h); x.fillStyle = I.sky; x.fillRect(0, h - 30, w, 30); txt(x, 'ICE', w / 2, 52, 60, FD, '#3d7fb0', '#fff', 8, w - 12); txt(x, 'BAGGED · 5 KG', w / 2, h - 15, 11, FT, '#fff', null, 0, w - 12); x.strokeStyle = '#8cc6e2'; x.lineWidth = 3; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(22, 20); x.lineTo(22 + Math.cos(i * PI / 3) * 12, 20 + Math.sin(i * PI / 3) * 12); x.stroke(); } });
  region(x, 'mail', (x, w, h) => { x.fillStyle = I.coraldk; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.beginPath(); x.roundRect(14, 36, w - 28, 56, 8); x.fill(); txt(x, 'POST', w / 2, 20, 22, FD, '#fff', null, 0, w - 16); txt(x, 'LAST PICKUP', w / 2, 52, 11, FT, I.navy, null, 0, w - 30); txt(x, '5:30 PM', w / 2, 74, 18, FT, I.coraldk, null, 0, w - 30); txt(x, 'HARBOR MAIL', w / 2, 110, 11, FT, '#fbe3dc', null, 0, w - 16); });
  region(x, 'cab', (x, w, h) => { x.fillStyle = '#e8e4d8'; x.fillRect(0, 0, w, h); x.fillStyle = I.navy; x.fillRect(0, 0, 110, h); x.fillStyle = I.mustard; x.beginPath(); x.moveTo(64, 18); x.lineTo(36, 70); x.lineTo(56, 70); x.lineTo(44, 112); x.lineTo(78, 54); x.lineTo(58, 54); x.lineTo(72, 18); x.closePath(); x.fill(); txt(x, 'HARBOR POWER', 244, 50, 34, FD, I.navy, null, 0, 250); txt(x, 'SUBSTATION 7 · AUTHORISED ONLY', 244, 90, 13, FT, '#6b6f7a', null, 0, 250); });
  const diamond = (name, bg, fg, label, num, icon) => region(x, name, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.save(); x.translate(w / 2, h / 2); x.rotate(PI / 4);
    x.fillStyle = '#fff'; x.fillRect(-44, -44, 88, 88); x.fillStyle = bg; x.fillRect(-40, -40, 80, 80); x.strokeStyle = fg; x.lineWidth = 2; x.strokeRect(-36, -36, 72, 72); x.restore();
    icon(x, w / 2, h / 2 - 22); txt(x, label, w / 2, h / 2 + 10, 11, FT, fg, null, 0, 70); txt(x, num, w / 2, h / 2 + 34, 16, FD, fg, null, 0, 30);
  });
  diamond('dia0', I.red, '#fff', 'FLAMMABLE', '2', (x, cx, cy) => { x.fillStyle = '#fff'; x.beginPath(); x.moveTo(cx, cy - 18); x.quadraticCurveTo(cx + 16, cy, cx + 8, cy + 12); x.quadraticCurveTo(cx, cy + 16, cx - 8, cy + 12); x.quadraticCurveTo(cx - 14, cy, cx, cy - 18); x.fill(); });
  diamond('dia1', '#4e9a64', '#fff', 'COMPRESSED', '2', (x, cx, cy) => { x.fillStyle = '#fff'; x.beginPath(); x.roundRect(cx - 7, cy - 16, 14, 32, 6); x.fill(); x.fillRect(cx - 3, cy - 21, 6, 6); });
  diamond('dia2', I.mustard, I.ink, 'OXIDIZER', '5.1', (x, cx, cy) => { x.strokeStyle = I.ink; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy + 6, 8, 0, TAU); x.stroke(); x.fillStyle = I.ink; x.beginPath(); x.moveTo(cx, cy - 18); x.quadraticCurveTo(cx + 10, cy - 4, cx, cy + 2); x.quadraticCurveTo(cx - 10, cy - 4, cx, cy - 18); x.fill(); });
  // newspapers + scooter QR
  const paperFront = (name, mast, head, col, seed) => region(x, name, (x, w, h) => {
    paperBG(x, w, h, '#f1efe8', seed, 0.04, false);
    txt(x, mast, w / 2, 14, 15, FD, I.ink, null, 0, w - 8);
    x.fillStyle = I.ink; x.fillRect(6, 25, w - 12, 2);
    txt(x, head, w / 2, 40, 14, FT, I.ink, null, 0, w - 10);
    x.fillStyle = col; x.fillRect(8, 54, 58, 44);
    x.fillStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); x.arc(37, 76, 12, 0, TAU); x.fill();
    lines(x, 72, 56, 48, 6, 7, '#9a9ca2', seed + 1); lines(x, 8, 104, w - 16, 3, 7, '#9a9ca2', seed + 2);
  });
  paperFront('news0', 'HARBOR DAILY', 'TURF RECORD!', I.coral, 171);
  paperFront('news1', 'INK WEEKLY', 'NEW SEASON', I.teal, 181);
  region(x, 'qr', (x, w, h) => {
    x.fillStyle = '#fff'; x.beginPath(); x.roundRect(0, 0, w, h, 14); x.fill();
    x.fillStyle = I.tealdk; x.fillRect(0, 0, w, 30); txt(x, 'RIDE ME', w / 2, 15, 16, FD, '#fff', null, 0, w - 10);
    const rnd = mulberry32(191); x.fillStyle = I.ink;
    for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) if (rnd() < 0.5) x.fillRect(28 + i * 8, 38 + j * 8, 8, 8);
    for (const [qx, qy] of [[28, 38], [76, 38], [28, 86]]) { x.fillStyle = I.ink; x.fillRect(qx, qy, 24, 24); x.fillStyle = '#fff'; x.fillRect(qx + 4, qy + 4, 16, 16); x.fillStyle = I.ink; x.fillRect(qx + 8, qy + 8, 8, 8); }
    txt(x, 'KELPWHEEL', w / 2, h - 12, 11, FT, I.tealdk, null, 0, w - 10);
  });
  // ---------------------------------------------------------------- floor castings, gauge, scuffs
  region(x, 'manhole', (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const c = w / 2;
    x.fillStyle = '#d4d4d4'; x.beginPath(); x.arc(c, c, c - 2, 0, TAU); x.fill();
    x.fillStyle = '#9a9a9a'; x.beginPath(); x.arc(c, c, c - 12, 0, TAU); x.fill();
    x.fillStyle = '#c8c8c8'; x.beginPath(); x.arc(c, c, c - 18, 0, TAU); x.fill();
    x.save(); x.beginPath(); x.arc(c, c, 78, 0, TAU); x.clip();
    for (let j = -8; j <= 8; j++) for (let i = -8; i <= 8; i++) { x.fillStyle = (i + j) % 2 ? '#a6a6a6' : '#dcdcdc'; x.fillRect(c + i * 12 - 4, c + j * 12 - 4, 8, 8); }
    x.restore();
    x.fillStyle = '#b4b4b4'; x.beginPath(); x.arc(c, c, 40, 0, TAU); x.fill();
    miniSquid(x, c, c + 2, 30, '#e2e2e2', '#8a8a8a', '#e2e2e2');
    x.font = FT(15); x.fillStyle = '#e8e8e8'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const s = 'INKWAVE HARBOR · SEWER · INKWAVE HARBOR · SEWER · ';
    for (let i = 0; i < s.length; i++) { const a = (i / s.length) * TAU - HP; x.save(); x.translate(c + Math.cos(a) * 95, c + Math.sin(a) * 95); x.rotate(a + HP); x.fillText(s[i], 0, 0); x.restore(); }
  });
  region(x, 'gully', (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(0, 0, w, 10); x.fillRect(0, h - 10, w, 10); x.fillRect(0, 0, 10, h); x.fillRect(w - 10, 0, 10, h); for (let i = 1; i < 8; i++) x.fillRect(i * 16 - 3, 0, 6, h); x.fillRect(0, h / 2 - 4, w, 8); });
  region(x, 'gauge', (x, w, h) => {
    x.fillStyle = '#f4f2ea'; x.fillRect(0, 0, w, h);
    for (let i = 0; i <= 32; i++) { const y = 8 + i * 7.5; x.fillStyle = i % 8 === 0 ? I.red : I.ink; x.fillRect(0, y - 1, i % 4 === 0 ? 30 : 16, 3); }
    for (let i = 1; i <= 4; i++) { txt(x, (i * 0.5).toFixed(1), 46, 8 + i * 60, 13, FT, I.ink, null, 0, 30); }
    x.strokeStyle = I.ink; x.lineWidth = 3; x.strokeRect(1, 1, w - 2, h - 2);
  });
  region(x, 'scuff', (x, w, h) => { // dark rubber scuffs (alpha) for skate surfaces
    x.clearRect(0, 0, w, h); const rnd = mulberry32(201);
    for (let i = 0; i < 14; i++) { x.strokeStyle = `rgba(40,40,46,${0.5 + rnd() * 0.4})`; x.lineWidth = 2 + rnd() * 5; x.lineCap = 'round'; x.beginPath(); const y = rnd() * h, x0 = rnd() * 30; x.moveTo(x0, y); x.quadraticCurveTo(w / 2, y + (rnd() - 0.5) * 30, x0 + 60 + rnd() * 60, y + (rnd() - 0.5) * 20); x.stroke(); }
  });
  // ---------------------------------------------------------------- stickers (alpha)
  const stk = (i, fn) => region(x, 'stk' + i, (x, w, h) => { x.clearRect(0, 0, w, h); x.save(); x.translate(w / 2, h / 2); fn(x); x.restore(); });
  const disc = (x, r, c) => { x.fillStyle = c; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill(); };
  stk(0, (x) => { disc(x, 29, '#fff'); disc(x, 25, I.teal); miniSquid(x, 0, 2, 18, I.cream); });
  stk(1, (x) => { starburst(x, 0, 0, 29, 13, 5, '#fff', -HP); starburst(x, 0, 0, 24, 10, 5, I.mustard, -HP); });
  stk(2, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.roundRect(-29, -20, 58, 36, 10); x.fill(); x.beginPath(); x.moveTo(-10, 14); x.lineTo(-18, 28); x.lineTo(2, 14); x.fill(); x.fillStyle = I.coral; x.beginPath(); x.roundRect(-25, -16, 50, 28, 8); x.fill(); txt(x, 'INK!', 0, -2, 18, FD, '#fff', null, 0, 44); });
  stk(3, (x) => { disc(x, 29, '#fff'); disc(x, 25, I.ink); x.fillStyle = I.mustard; x.beginPath(); x.moveTo(4, -18); x.lineTo(-9, 3); x.lineTo(0, 3); x.lineTo(-4, 18); x.lineTo(10, -3); x.lineTo(1, -3); x.closePath(); x.fill(); });
  stk(4, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, 26); x.bezierCurveTo(-40, -2, -18, -34, 0, -12); x.bezierCurveTo(18, -34, 40, -2, 0, 26); x.fill(); x.fillStyle = I.pink; x.beginPath(); x.moveTo(0, 20); x.bezierCurveTo(-32, -2, -16, -27, 0, -8); x.bezierCurveTo(16, -27, 32, -2, 0, 20); x.fill(); });
  stk(5, (x) => { x.fillStyle = I.navy; x.beginPath(); x.roundRect(-30, -16, 60, 32, 8); x.fill(); txt(x, 'SK8', 0, 1, 22, FD, I.mustard, null, 0, 52); });
  stk(6, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(0, 0, 30, 20, 0, 0, TAU); x.fill(); disc(x, 13, I.lav); disc(x, 6, I.ink); x.fillStyle = '#fff'; x.beginPath(); x.arc(4, -4, 3, 0, TAU); x.fill(); });
  stk(7, (x) => { disc(x, 29, '#fff'); disc(x, 25, I.sky); x.strokeStyle = '#fff'; x.lineWidth = 4; for (let i = 0; i < 3; i++) { x.beginPath(); for (let t = -18; t <= 18; t += 3) x.lineTo(t, -8 + i * 9 + Math.sin(t * 0.35) * 3); x.stroke(); } });
  stk(8, (x) => { x.fillStyle = '#fff'; splatShape(x, 0, 0, 20, 12, 0); x.fillStyle = I.mint; splatShape(x, 0, 0, 16, 12, 0); });
  stk(9, (x) => { disc(x, 29, I.coral); txt(x, '88.2', 0, 0, 18, FD, '#fff', null, 0, 50); });
  stk(10, (x) => { x.fillStyle = '#fff'; x.fillRect(-28, -14, 56, 28); x.fillStyle = I.ink; const rnd = mulberry32(210); for (let i = -24; i < 24; i += 2) if (rnd() < 0.6) x.fillRect(i, -10, rnd() < 0.3 ? 2 : 1, 16); });
  stk(11, (x) => { disc(x, 29, I.mustard); x.fillStyle = I.ink; x.beginPath(); x.arc(-9, -6, 4, 0, TAU); x.arc(9, -6, 4, 0, TAU); x.fill(); x.strokeStyle = I.ink; x.lineWidth = 4; x.beginPath(); x.arc(0, 2, 14, 0.3, PI - 0.3); x.stroke(); });
  stk(12, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(-4, 0, 24, 15, 0, 0, TAU); x.fill(); x.beginPath(); x.moveTo(14, 0); x.lineTo(30, -14); x.lineTo(30, 14); x.fill(); x.fillStyle = I.teal; x.beginPath(); x.ellipse(-4, 0, 20, 11, 0, 0, TAU); x.fill(); x.beginPath(); x.moveTo(14, 0); x.lineTo(26, -9); x.lineTo(26, 9); x.fill(); });
  stk(13, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.moveTo(-28, 16); x.lineTo(-28, -12); x.lineTo(-14, 2); x.lineTo(0, -20); x.lineTo(14, 2); x.lineTo(28, -12); x.lineTo(28, 16); x.fill(); x.fillStyle = I.mustard; x.beginPath(); x.moveTo(-24, 12); x.lineTo(-24, -4); x.lineTo(-13, 7); x.lineTo(0, -13); x.lineTo(13, 7); x.lineTo(24, -4); x.lineTo(24, 12); x.fill(); });
  stk(14, (x) => { disc(x, 29, I.ink); txt(x, 'LTR', 0, 1, 20, FD, I.pink, null, 0, 48); });
  stk(15, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.moveTo(-26, -10); x.lineTo(6, -10); x.lineTo(6, -24); x.lineTo(30, 0); x.lineTo(6, 24); x.lineTo(6, 10); x.lineTo(-26, 10); x.fill(); x.fillStyle = I.coraldk; x.beginPath(); x.moveTo(-22, -6); x.lineTo(10, -6); x.lineTo(10, -16); x.lineTo(24, 0); x.lineTo(10, 16); x.lineTo(10, 6); x.lineTo(-22, 6); x.fill(); });
  // ---------------------------------------------------------------- street signs (128²)
  region(x, 'sg0', (x, w, h) => { const sl = roundSign(x, w, h, I.red, '#fff', true); x.fillStyle = I.navy; x.beginPath(); x.ellipse(w / 2 - 6, h / 2 + 2, 26, 12, -0.25, 0, TAU); x.fill(); x.beginPath(); x.arc(w / 2 + 22, h / 2 - 10, 9, 0, TAU); x.fill(); x.strokeStyle = I.sky; x.lineWidth = 4; x.beginPath(); for (let t = -32; t <= 32; t += 4) x.lineTo(w / 2 + t, h / 2 + 26 + Math.sin(t * 0.3) * 3); x.stroke(); sl(); });
  region(x, 'sg1', (x, w, h) => { triSign(x, w, h, '#f1c95c', I.ink); x.fillStyle = I.ink; x.beginPath(); x.arc(58, 60, 7, 0, TAU); x.fill(); x.lineWidth = 6; x.lineCap = 'round'; x.strokeStyle = I.ink; x.beginPath(); x.moveTo(60, 68); x.lineTo(72, 84); x.lineTo(86, 80); x.moveTo(72, 84); x.lineTo(62, 96); x.moveTo(60, 72); x.lineTo(46, 76); x.stroke(); x.fillStyle = I.teal; x.beginPath(); x.ellipse(64, 102, 22, 5, 0, 0, TAU); x.fill(); });
  region(x, 'sg2', (x, w, h) => { triSign(x, w, h, '#f1c95c', I.ink); x.fillStyle = I.ink; x.beginPath(); x.moveTo(70, 42); x.lineTo(52, 78); x.lineTo(64, 78); x.lineTo(56, 104); x.lineTo(78, 68); x.lineTo(66, 68); x.lineTo(76, 42); x.closePath(); x.fill(); });
  region(x, 'sg3', (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = I.red; x.fillRect(0, 0, w, 44); x.fillStyle = '#fff'; x.beginPath(); x.ellipse(w / 2, 22, 52, 15, 0, 0, TAU); x.fill(); txt(x, 'DANGER', w / 2, 23, 20, FD, I.red, null, 0, 96); txt(x, 'DEEP', w / 2, 70, 26, FD, I.ink, null, 0, 110); txt(x, 'WATER', w / 2, 102, 24, FD, I.ink, null, 0, 110); x.strokeStyle = I.ink; x.lineWidth = 4; x.strokeRect(2, 2, w - 4, h - 4); });
  region(x, 'sg4', (x, w, h) => { x.fillStyle = '#fff'; x.beginPath(); x.roundRect(0, 0, w, h, 12); x.fill(); x.fillStyle = '#3f6fb0'; x.beginPath(); x.roundRect(6, 6, w - 12, h - 12, 9); x.fill(); txt(x, 'P', w / 2, 52, 68, FD, '#fff', null, 0, 90); txt(x, '2 HR', w / 2, 104, 20, FT, '#fff', null, 0, 100); });
  region(x, 'sg5', (x, w, h) => { roundSign(x, w, h, I.red, I.red, false); x.fillStyle = '#fff'; x.fillRect(22, h / 2 - 12, w - 44, 24); });
  region(x, 'sg6', (x, w, h) => { x.clearRect(0, 0, w, h); x.save(); x.translate(w / 2, h / 2); x.rotate(PI / 4); x.fillStyle = I.ink; x.fillRect(-44, -44, 88, 88); x.fillStyle = '#f1c95c'; x.fillRect(-39, -39, 78, 78); x.restore(); x.fillStyle = I.teal; splatShape(x, w / 2, h / 2 - 8, 16, 21, 2); txt(x, 'WET INK', w / 2, h / 2 + 30, 12, FT, I.ink, null, 0, 70); });
  region(x, 'sg7', (x, w, h) => { triSign(x, w, h, '#fff', I.red); x.fillStyle = I.ink; x.beginPath(); x.moveTo(64, 38); x.lineTo(56, 50); x.lineTo(72, 50); x.fill(); x.beginPath(); x.moveTo(64, 100); x.lineTo(56, 88); x.lineTo(72, 88); x.fill(); txt(x, '2.0 m', 64, 70, 20, FT, I.ink, null, 0, 70); });
  // fingerpost blades (alpha pointed ends)
  const blade = (i, text, right, bg, fg) => region(x, 'bl' + i, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.fillStyle = bg; x.beginPath();
    if (right) { x.moveTo(4, 4); x.lineTo(w - 34, 4); x.lineTo(w - 4, h / 2); x.lineTo(w - 34, h - 4); x.lineTo(4, h - 4); }
    else { x.moveTo(w - 4, 4); x.lineTo(34, 4); x.lineTo(4, h / 2); x.lineTo(34, h - 4); x.lineTo(w - 4, h - 4); }
    x.closePath(); x.fill(); x.strokeStyle = fg; x.lineWidth = 3; x.stroke();
    txt(x, text, right ? (w - 30) / 2 + 4 : (w + 30) / 2 - 4, h / 2 + 2, 30, FD, fg, null, 0, w - 60);
  });
  blade(0, 'PIER 3', false, I.cream, I.navy); blade(1, 'FERRY', true, I.cream, I.navy); blade(2, 'SKATE PARK', true, I.teal, I.cream); blade(3, 'BEACH', false, I.mustard, I.navy);
  blade(4, 'MARKET', true, I.coral, I.cream); blade(5, 'TERMINAL B', false, I.navy, I.cream); blade(6, 'LIGHTHOUSE', true, I.cream, I.navy); blade(7, 'KELP ISLE', false, I.teal, I.cream);
  // small labels (128×32)
  const lbl = (i, text, bg, fg, stripes) => region(x, 'lb' + i, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    if (stripes) { x.fillStyle = fg; for (let k = -2; k < 20; k++) { x.beginPath(); x.moveTo(k * 12, h); x.lineTo(k * 12 + 6, h); x.lineTo(k * 12 + 6 + h, 0); x.lineTo(k * 12 + h, 0); x.fill(); } x.fillStyle = bg; x.fillRect(12, 4, w - 24, h - 8); }
    txt(x, text, w / 2, h / 2 + 1, 16, FT, fg, null, 0, w - 26);
  });
  lbl(0, 'DANGER 400V', '#f1c95c', I.ink, true); lbl(1, 'POTABLE WATER', '#3f6fb0', '#fff'); lbl(2, 'PROPANE', I.red, '#fff'); lbl(3, 'FIRE HOSE', I.red, '#fff');
  lbl(4, 'NO SMOKING', '#fff', I.red); lbl(5, 'SQD · 042', '#fbfaf4', I.navy); lbl(6, 'KEEP CLEAR', '#f1c95c', I.ink, true); lbl(7, 'CLEARANCE 2.0 M', '#fff', I.ink);
  lbl(8, 'KRKU 882130', '#fff', I.ink); lbl(9, 'SERVICE 24H', I.navy, I.cream); lbl(10, 'FIRE INLET', I.red, '#fff'); lbl(11, 'BAIT · ICE · TACKLE', I.teal, I.cream);
  lbl(12, 'MIND THE GAP', '#f1c95c', I.ink, true); lbl(13, 'MOORING 12', '#fff', I.navy); lbl(14, 'NO PARKING', '#fff', I.red); lbl(15, 'WASH DOWN', '#3f6fb0', '#fff');
}

function canvasTex(w, h, draw, repeat = false) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ------------------------------------------------------------------------------------------------ cloth (flags / banners)
const CLOTH_VERT_PARS = `uniform float uTime;\nattribute float flex;\nattribute vec3 wave;\n`;
const CLOTH_FN = `
  vec3 ipos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float cph = ipos.x * 0.83 + ipos.z * 0.61 + ipos.y * 0.37;
  float ca = uTime * wave.x + cph + position.x * wave.y;
  float cb = uTime * wave.x * 2.3 + cph * 1.7 + position.y * 3.0;
  float cw = sin(ca) + 0.35 * sin(cb);
`;
function clothMaterial(atlas, uTime) {
  const m = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = CLOTH_VERT_PARS + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        ${CLOTH_FN}
        objectNormal = normalize(objectNormal + vec3(-flex * wave.z * wave.y * cos(ca), -flex * wave.z * 1.05 * cos(cb), 0.0));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.z += flex * wave.z * cw;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', `vec4 clothTx = texture2D(map, vMapUv);\n#if defined( USE_COLOR )\n diffuseColor.rgb *= vColor.rgb;\n#endif\n diffuseColor.rgb = mix(diffuseColor.rgb, clothTx.rgb, clothTx.a);`)
      .replace('#include <color_fragment>', '');
  };
  return m;
}
function clothDepthMaterial(uTime) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = CLOTH_VERT_PARS + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      ${CLOTH_FN}
      transformed.z += flex * wave.z * cw;`);
  };
  return m;
}
function flagGeo() {
  const W = 0.28, Hf = 0.34;
  const g = new THREE.PlaneGeometry(W, Hf, 2, 4);
  const P = g.attributes.position, n = P.count;
  const flex = new Float32Array(n), wave = new Float32Array(n * 3), uv = g.attributes.uv;
  const cu = regUV('clear');
  for (let i = 0; i < n; i++) {
    const y = P.getY(i) - Hf / 2, t = -y / Hf;
    P.setXY(i, P.getX(i) * (1 - t), y);
    flex[i] = Math.pow(t, 1.2); wave[i * 3] = 3.4; wave[i * 3 + 1] = 5.0; wave[i * 3 + 2] = 0.055;
    uv.setXY(i, (cu[0] + cu[2]) / 2, (cu[1] + cu[3]) / 2);
  }
  g.setAttribute('flex', new THREE.BufferAttribute(flex, 1));
  g.setAttribute('wave', new THREE.BufferAttribute(wave, 3));
  g.computeVertexNormals();
  return g;
}
function bannerGeo(w, h) {
  const g = new THREE.PlaneGeometry(w, h, 4, 10);
  const P = g.attributes.position, n = P.count, uv = g.attributes.uv, r = regUV('emblem', 2);
  const flex = new Float32Array(n), wave = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = P.getY(i) - h / 2, t = -y / h;
    P.setY(i, y);
    flex[i] = Math.pow(t, 1.15);
    wave[i * 3] = 2.1; wave[i * 3 + 1] = 3.2; wave[i * 3 + 2] = 0.075;
    uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
  }
  g.setAttribute('flex', new THREE.BufferAttribute(flex, 1));
  g.setAttribute('wave', new THREE.BufferAttribute(wave, 3));
  return g;
}

// ------------------------------------------------------------------------------------------------ merge
const _v = new THREE.Vector3(), _nm = new THREE.Matrix3();
function mergeParts(parts) {
  let nv = 0, ni = 0;
  for (const p of parts) { const c = p.g.attributes.position.count; nv += c; ni += p.g.index ? p.g.index.count : c; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), colr = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const p of parts) {
    const g = p.g, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color;
    _nm.getNormalMatrix(p.m);
    const flip = p.m.determinant() < 0;
    const cr = p.c.r, cg = p.c.g, cb = p.c.b;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(p.m);
      const o = (vo + i) * 3;
      pos[o] = _v.x; pos[o + 1] = _v.y; pos[o + 2] = _v.z;
      let ao = 1;
      if (p.ao != null) { const hh = Math.max(0, _v.y - p.ao); const t = Math.min(1, hh / 0.55); ao = 0.72 + 0.28 * t * t * (3 - 2 * t); }
      _v.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
      nor[o] = _v.x; nor[o + 1] = _v.y; nor[o + 2] = _v.z;
      const k = C ? C.getX(i) : 1, k2 = C ? C.getY(i) : 1, k3 = C ? C.getZ(i) : 1;
      colr[o] = cr * k * ao; colr[o + 1] = cg * k2 * ao; colr[o + 2] = cb * k3 * ao;
      const u = (vo + i) * 2;
      if (p.uv) { const r = p.uv; uv[u] = r[0] + U.getX(i) * (r[2] - r[0]); uv[u + 1] = r[1] + U.getY(i) * (r[3] - r[1]); }
      else if (p.uvs) { uv[u] = U.getX(i) * p.uvs[0]; uv[u + 1] = U.getY(i) * p.uvs[1]; }
      else { uv[u] = WHITE_UV[0]; uv[u + 1] = WHITE_UV[1]; }
    }
    if (g.index) {
      const I = g.index.array;
      for (let j = 0; j < I.length; j += 3) {
        idx[io++] = I[j] + vo;
        if (flip) { idx[io++] = I[j + 2] + vo; idx[io++] = I[j + 1] + vo; } else { idx[io++] = I[j + 1] + vo; idx[io++] = I[j + 2] + vo; }
      }
    } else {
      for (let j = 0; j < P.count; j += 3) { idx[io++] = vo + j; idx[io++] = vo + j + (flip ? 2 : 1); idx[io++] = vo + j + (flip ? 1 : 2); }
    }
    vo += P.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
const triCountOf = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

// ------------------------------------------------------------------------------------------------ builder context
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function compose(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
}
class Builder {
  constructor(kit) { this.k = kit; this.stack = [new THREE.Matrix4()]; this.base = new THREE.Matrix4(); this.cols = []; this.aoBase = 0; this.rng = Math.random; this.tris = 0; }
  begin(pos, rotY, scale, seed, ao) {
    this.base = compose(pos[0], pos[1], pos[2], 0, rotY, 0, scale, scale, scale);
    this.stack = [new THREE.Matrix4()]; this.cols = []; this.aoBase = ao ? pos[1] : null; this.rng = mulberry32(seed); this.scale = scale;
  }
  get top() { return this.stack[this.stack.length - 1]; }
  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) { this.stack.push(this.top.clone().multiply(compose(x, y, z, rx, ry, rz, s, s, s))); }
  pop() { this.stack.pop(); }
  seg(n) { return Math.max(3, Math.round(n * this.k.qf)); }
  r(a = 0, b = 1) { return a + (b - a) * this.rng(); }
  _m(x, y, z, o) {
    const s = o.s ?? 1;
    return this.base.clone().multiply(this.top).multiply(compose(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx ?? s, o.sy ?? s, o.sz ?? s));
  }
  add(mat, g, c, x, y, z, o = {}) {
    let cc = col(c);
    if (o.glow) cc = cc.clone().multiplyScalar(o.glow);
    this.k._push(mat, { g, m: this._m(x, y, z, o), c: cc, uv: o.uv || null, uvs: o.uvs || null, ao: o.ao === false || mat.startsWith('glow') || mat.startsWith('blob') ? null : this.aoBase });
    this.tris += triCountOf(g);
  }
  box(mat, c, w, h, d, x, y, z, o = {}) {
    const r = o.r ?? Math.min(0.045, Math.min(w, h, d) * 0.22);
    this.add(mat, o.round ? G.rbox(w, h, d, r) : G.cbox(w, h, d, r), c, x, y, z, o);
  }
  cyl(mat, c, r, h, x, y, z, o = {}) {
    const seg = this.seg(o.seg ?? 12);
    const g = o.bevel ? G.lathe(rcylProf(r, h, o.bevel), seg) : G.cyl(o.r2 ?? r, r, h, seg, !!o.open);
    this.add(mat, g, c, x, y, z, o);
  }
  sph(mat, c, r, x, y, z, o = {}) { this.add(mat, G.sph(r, this.seg(o.ws ?? 12), Math.max(3, this.seg(o.hs ?? 8)), o.half), c, x, y, z, o); }
  tor(mat, c, R, r, x, y, z, o = {}) { this.add(mat, G.tor(R, r, o.rs ?? 6, this.seg(o.ts ?? 20), o.arc ?? TAU), c, x, y, z, o); }
  lathe(mat, c, prof, x, y, z, o = {}) { this.add(mat, G.lathe(prof, this.seg(o.seg ?? 16), o.closed), c, x, y, z, o); }
  tube(mat, c, pts, r, o = {}) { this.add(mat, tubeGeo(pts, r, o.radial ?? 8, !!o.closed, o.up || null), c, o.x || 0, o.y || 0, o.z || 0, o); }
  decal(name, w, h, x, y, z, o = {}) { this.add(o.glow ? 'glow' : 'paint', G.plane(w, h), o.tint ?? 'white', x, y, z, { ...o, uv: regUV(name), ao: false }); }
  blob(w, d, x = 0, z = 0) { if (this.aoBase == null) return; this.add('blob', G.plane(1, 1), 'white', x, 0.012, z, { rx: -HP, sx: w, sy: d, uvs: [1, 1] }); this.tris -= 2; }
  col(x0, y0, z0, x1, y1, z1) { this.cols.push([x0, y0, z0, x1, y1, z1]); }
  spin(kind, x, y, z, o = {}) { this.k._spin.push({ kind, base: this._m(x, y, z, o), speed: o.speed ?? 8, phase: this.r(0, TAU) }); this.tris += this.k._tplTris(kind); }
  blink(c, x, y, z, o = {}) { this.k._blink.push({ m: this._m(x, y, z, { s: o.size ?? 0.045 }), color: col(c).clone(), rate: o.rate ?? 1, phase: o.phase ?? this.r(0, TAU), lo: o.lo ?? 0.25, hi: o.hi ?? 5 }); this.tris += 84; }
  flag(x, y, z, o = {}) { this.k._flags.push({ m: this._m(x, y, z, o), team: o.team ?? null, color: col(o.color ?? 'offwhite').clone(), tint: o.tint ?? 0 }); this.tris += 16; }
  banner(x, y, z, o = {}) { this.k._banners.push({ m: this._m(x, y, z, o), team: o.team ?? null, color: col(o.color ?? 'lavender').clone(), tint: 0 }); this.tris += 80; }
}

// ------------------------------------------------------------------------------------------------ neon path helpers
function circlePts(cx, cy, r, n) { const a = []; for (let i = 0; i < n; i++) { const t = (i / n) * TAU; a.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); } return a; }
function smoothPts(pts, closed, n) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], 0)), closed, 'centripetal');
  const out = c.getPoints(n).map((v) => [v.x, v.y]);
  if (closed) out.pop();
  return out;
}
function roundPoly(pts, r, k = 3) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const da = [a[0] - p[0], a[1] - p[1]], db = [b[0] - p[0], b[1] - p[1]];
    const la = Math.hypot(...da), lb = Math.hypot(...db), rr2 = Math.min(r, la * 0.45, lb * 0.45);
    const s = [p[0] + (da[0] / la) * rr2, p[1] + (da[1] / la) * rr2], e = [p[0] + (db[0] / lb) * rr2, p[1] + (db[1] / lb) * rr2];
    for (let j = 0; j <= k; j++) { const t = j / k, u = 1 - t; out.push([u * u * s[0] + 2 * u * t * p[0] + t * t * e[0], u * u * s[1] + 2 * u * t * p[1] + t * t * e[1]]); }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ prop definitions
const D = {};
const P3 = (x, y, z) => [x, y, z];

D.railing = {
  desc: 'Painted steel handrail (posts every ~1.2 m, rounded top rail, mid + toe rails, flanged feet). Runs from pos along local +X.',
  params: { length: 'm (4)', height: 'm (1.0)', color: 'paint (railing)' }, variants: 1, mount: 'ground',
  build(B, o) {
    const L = o.length ?? 4, H = o.height ?? 1.0, c = o.color ?? 'railing';
    const n = Math.max(2, Math.round(L / 1.2) + 1);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * L;
      B.cyl('gloss', c, 0.03, H - 0.03, x, (H - 0.03) / 2, 0, { seg: 10, open: true });
      B.lathe('gloss', c, flangeProf(0.075, 0.03), x, 0, 0, { seg: 12 });
    }
    B.cyl('gloss', c, 0.036, L, L / 2, H - 0.018, 0, { rz: HP, seg: 12, open: true });
    B.sph('gloss', c, 0.04, 0, H - 0.018, 0, { ws: 10, hs: 6 });
    B.sph('gloss', c, 0.04, L, H - 0.018, 0, { ws: 10, hs: 6 });
    B.cyl('gloss', c, 0.021, L, L / 2, H * 0.55, 0, { rz: HP, seg: 8, open: true });
    B.cyl('gloss', c, 0.018, L, L / 2, 0.15, 0, { rz: HP, seg: 8, open: true });
    B.col(-0.05, 0, -0.06, L + 0.05, H, 0.06);
  },
};

D.fence = {
  desc: 'Harbor site fence on chunky concrete feet. variant 0 = chain-link panels (alpha-tested), 1 = painted bar panels. Runs along +X.',
  params: { length: 'm (4)', height: 'm (2.0)', color: 'frame paint (galv)' }, variants: 2, mount: 'ground',
  build(B, o) {
    const L = o.length ?? 4, H = o.height ?? 2.0, v = (o.variant ?? 0) % 2, c = o.color ?? (v ? 'tealdark' : 'galv');
    const np = Math.max(1, Math.round(L / 2.5)), pw = L / np, y0 = 0.14, top = H;
    for (let i = 0; i <= np; i++) {
      const x = i * pw;
      B.box('paint', 'concrete', 0.6, 0.15, 0.26, x, 0.075, 0, { r: 0.045, round: true });
      B.cyl('metal', c, 0.034, top - 0.1, x, 0.1 + (top - 0.1) / 2, 0, { seg: 10, open: true });
      B.sph('metal', c, 0.038, x, top, 0, { ws: 10, hs: 6 });
      for (const cy of [y0 + 0.08, top - 0.12]) B.cyl('metal', 'darksteel', 0.046, 0.05, x, cy, 0, { seg: 10 });
    }
    for (let j = 0; j < np; j++) {
      const x0 = j * pw + 0.07, x1 = (j + 1) * pw - 0.07, w = x1 - x0, xm = (x0 + x1) / 2;
      for (const yy of [y0 + 0.08, top - 0.12]) B.cyl('metal', c, 0.02, w, xm, yy, 0, { rz: HP, seg: 8, open: true });
      for (const xx of [x0, x1]) B.cyl('metal', c, 0.02, top - 0.2 - y0, xx, (y0 + 0.08 + top - 0.12) / 2, 0, { seg: 8, open: true });
      const ph = top - 0.2 - y0 - 0.02;
      if (v === 0) B.add('fence', G.plane(w, ph), 'galv', xm, (y0 + 0.08 + top - 0.12) / 2, 0, { uvs: [w / 0.16, ph / 0.16] });
      else {
        const nb = Math.max(2, Math.round(w / 0.13));
        for (let k = 1; k < nb; k++) B.cyl('gloss', c, 0.013, ph, x0 + (k / nb) * w, (y0 + 0.08 + top - 0.12) / 2, 0, { seg: 6, open: true });
        B.cyl('gloss', c, 0.016, w, xm, (y0 + top) / 2 + 0.15, 0, { rz: HP, seg: 6, open: true });
      }
    }
    B.col(-0.3, 0, -0.14, L + 0.3, top, 0.14);
  },
};

D.bollard = {
  desc: 'variant 0 = charcoal steel bollard with mustard reflective band, 1 = chunky concrete ball bollard, 2 = harbor mooring bitt.',
  params: { color: 'band / accent (mustard)' }, variants: 3, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 3, acc = o.color ?? 'mustard';
    if (v === 0) {
      B.lathe('gloss', 'charcoal', flangeProf(0.15, 0.035), 0, 0, 0, { seg: 16 });
      B.cyl('gloss', 'charcoal', 0.095, 0.76, 0, 0.03 + 0.38, 0, { seg: 16, open: true });
      B.sph('gloss', 'charcoal', 0.095, 0, 0.79, 0, { ws: 16, hs: 5, half: true });
      B.cyl('gloss', acc, 0.099, 0.07, 0, 0.64, 0, { seg: 16, open: true });
      B.cyl('gloss', acc, 0.099, 0.03, 0, 0.54, 0, { seg: 16, open: true });
      B.col(-0.15, 0, -0.15, 0.15, 0.9, 0.15); B.blob(0.55, 0.55);
    } else if (v === 1) {
      B.lathe('paint', 'concrete', [[0, 0], [0.19, 0], [0.2, 0.03], [0.17, 0.08], [0.15, 0.42], [0, 0.42]], 0, 0, 0, { seg: 16 });
      B.sph('paint', 'concrete', 0.17, 0, 0.52, 0, { ws: 16, hs: 10 });
      B.cyl('paint', acc, 0.153, 0.06, 0, 0.3, 0, { seg: 16, open: true });
      B.col(-0.2, 0, -0.2, 0.2, 0.7, 0.2); B.blob(0.7, 0.7);
    } else {
      B.lathe('gloss', 'charcoal', [[0, 0], [0.32, 0], [0.33, 0.03], [0.3, 0.06], [0.17, 0.09], [0.14, 0.13], [0.14, 0.34], [0.2, 0.38], [0.24, 0.44], [0.22, 0.5], [0.12, 0.53], [0, 0.535]], 0, 0, 0, { seg: 18 });
      B.cyl('gloss', acc, 0.144, 0.05, 0, 0.26, 0, { seg: 18, open: true });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; B.cyl('metal', 'darksteel', 0.018, 0.025, Math.cos(a) * 0.26, 0.04, Math.sin(a) * 0.26, { seg: 6 }); }
      B.col(-0.33, 0, -0.33, 0.33, 0.54, 0.33); B.blob(0.95, 0.95);
    }
  },
};

D.bench = {
  desc: 'Plaza bench: wood slats on painted steel side frames. Seat faces +Z. variant 0 = with backrest, 1 = backless.',
  params: { length: 'm (1.8)', color: 'frame paint (tealdark)' }, variants: 2, mount: 'ground',
  build(B, o) {
    const L = o.length ?? 1.8, back = (o.variant ?? 0) % 2 === 0, fc = o.color ?? 'tealdark';
    for (const fx of [-1, 1]) {
      const x = fx * (L / 2 - 0.22);
      B.box('gloss', fc, 0.06, 0.4, 0.06, x, 0.2, 0.18, { r: 0.02 });
      B.box('gloss', fc, 0.06, 0.4, 0.06, x, 0.2, -0.18, { r: 0.02 });
      B.box('gloss', fc, 0.065, 0.05, 0.52, x, 0.4, 0, { r: 0.02 });
      B.box('gloss', fc, 0.07, 0.035, 0.5, x, 0.018, 0, { r: 0.015 });
      if (back) { B.push(x, 0.4, -0.2, 0, -0.22); B.box('gloss', fc, 0.055, 0.5, 0.05, 0, 0.23, -0.02, { r: 0.018 }); B.pop(); }
    }
    const zs = [-0.165, -0.055, 0.055, 0.165];
    zs.forEach((z) => B.box('wood', shade('wood', B.r(0.9, 1.06)), L, 0.038, 0.095, 0, 0.445, z, { r: 0.014 }));
    if (back) {
      B.push(0, 0.4, -0.23, 0, -0.22);
      [0.16, 0.28, 0.4].forEach((y) => B.box('wood', shade('wood', B.r(0.9, 1.06)), L, 0.095, 0.036, 0, y, 0, { r: 0.014 }));
      B.pop();
    }
    B.col(-L / 2, 0, -0.3, L / 2, back ? 0.88 : 0.47, 0.25);
    B.blob(L + 0.3, 0.8);
  },
};

D.trashbin = {
  desc: 'variant 0 = round street bin (glossy body, domed lid with slot), 1 = wheelie bin with hinged lid, handle and wheels.',
  params: { color: 'body (teal)' }, variants: 2, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 2, c = o.color ?? (v ? 'mustard' : 'teal');
    if (v === 0) {
      B.cyl('paint', 'charcoal', 0.25, 0.06, 0, 0.03, 0, { seg: 18, bevel: 0.015 });
      B.lathe('gloss', c, [[0, 0.06], [0.235, 0.06], [0.255, 0.1], [0.27, 0.74], [0.286, 0.765], [0.29, 0.8], [0.27, 0.82], [0, 0.82]], 0, 0, 0, { seg: 20 });
      B.lathe('gloss', 'offwhite', [[0.2715, 0.555], [0.2735, 0.645]], 0, 0, 0, { seg: 20 });
      B.lathe('gloss', 'offwhite', [[0, 0.8], [0.295, 0.8], [0.3, 0.84], [0.27, 0.9], [0.2, 0.97], [0.1, 1.0], [0, 1.01]], 0, 0, 0, { seg: 20 });
      B.box('paint', 'ink', 0.26, 0.1, 0.1, 0, 0.885, 0.235, { rx: -0.55, r: 0.03 });
      B.sph('gloss', c, 0.045, 0, 1.02, 0, { ws: 10, hs: 6 });
      B.col(-0.3, 0, -0.3, 0.3, 1.05, 0.3); B.blob(0.8, 0.8);
    } else {
      B.box('gloss', c, 0.6, 0.86, 0.7, 0, 0.55, 0.02, { round: true, r: 0.05 });
      B.box('gloss', shade(c, 0.78), 0.66, 0.06, 0.78, 0, 1.0, 0.02, { r: 0.025 });
      B.box('gloss', shade(c, 0.78), 0.58, 0.07, 0.05, 0, 0.965, 0.41, { r: 0.02 });
      B.box('gloss', shade(c, 0.92), 0.44, 0.5, 0.03, 0, 0.58, 0.37, { r: 0.015 });
      B.cyl('paint', 'charcoal', 0.024, 0.56, 0, 0.94, -0.4, { rz: HP, seg: 10 });
      for (const sx of [-1, 1]) {
        B.box('paint', 'charcoal', 0.05, 0.08, 0.1, sx * 0.24, 0.94, -0.36, { r: 0.015 });
        B.cyl('rubber', 'rubber', 0.11, 0.07, sx * 0.3, 0.11, -0.28, { rz: HP, seg: 16, bevel: 0.02 });
        B.cyl('metal', 'galv', 0.045, 0.075, sx * 0.3, 0.11, -0.28, { rz: HP, seg: 10 });
        B.box('paint', 'charcoal', 0.08, 0.12, 0.08, sx * 0.2, 0.08, 0.28, { r: 0.02 });
      }
      B.cyl('metal', 'darksteel', 0.018, 0.62, 0, 0.11, -0.28, { rz: HP, seg: 8 });
      B.col(-0.34, 0, -0.42, 0.34, 1.04, 0.42); B.blob(0.9, 1.0);
    }
  },
};

function bushCluster(B, n, R, y, spread, det, seedBase, c = 'leaf') {
  // dome of smooth puffs: one core, a ring, and a crown puff
  const put = (px, py, pz, r, k, lift = 0) => B.add('foliage', G.puff(det, (seedBase + k) % 6), mixc(c, 'leaflight', lift * 0.45 + B.r(0, 0.08)), px, py, pz, { s: r, sy: r * 0.9, ry: B.r(0, TAU) });
  put(0, y + R * 0.55, 0, R * 0.66, 0, 0.3);
  const ring = Math.max(2, n - 2);
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * TAU + B.r(-0.3, 0.3), d = R * 0.58 + spread * 0.2;
    put(Math.cos(a) * d, y + R * 0.38, Math.sin(a) * d, R * B.r(0.44, 0.52), i + 1, 0.1);
  }
  if (n > 3) put(B.r(-0.1, 0.1) * R, y + R * 1.0, B.r(-0.1, 0.1) * R, R * 0.46, 7, 0.9);
}
function canopy(B, cx, cy, cz, rx, ry, n, det, c = 'leaf') {
  B.add('foliage', G.puff(det, 0), shade(c, 0.95), cx, cy, cz, { s: rx * 0.78, sy: ry * 0.8 });
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, yy = 1 - 1.7 * t, r = Math.sqrt(Math.max(0, 1 - yy * yy)), a = i * 2.39996 + B.r(-0.2, 0.2);
    B.add('foliage', G.puff(det, (i + 1) % 6), mixc(c, 'leaflight', Math.max(0, yy) * 0.55 + B.r(0, 0.08)),
      cx + Math.cos(a) * r * rx * 0.72, cy + yy * ry * 0.7, cz + Math.sin(a) * r * rx * 0.72, { s: rx * B.r(0.44, 0.52), sy: ry * B.r(0.44, 0.5), ry: B.r(0, TAU) });
  }
}

D.planter = {
  desc: 'Rounded concrete planter box with accent band. variant 0 = bushes, 1 = flower bed, 2 = small round tree.',
  params: { length: 'm, X size (1.6)', width: 'm, Z size (0.8)', height: 'm (0.6)', color: 'band accent (teal)' }, variants: 3, mount: 'ground',
  build(B, o) {
    const L = o.length ?? 1.6, W = o.width ?? 0.8, H = o.height ?? 0.6, v = (o.variant ?? 0) % 3, acc = o.color ?? 'teal';
    const det = B.k.qf >= 1 ? 2 : 1;
    B.box('paint', 'concrete', L, H - 0.07, W, 0, (H - 0.07) / 2, 0, { round: true, r: 0.06 });
    B.box('paint', 'offwhite', L + 0.07, 0.08, W + 0.07, 0, H - 0.04, 0, { round: true, r: 0.035 });
    B.box('paint', acc, L + 0.012, 0.08, W + 0.012, 0, 0.17, 0, { r: 0.02 });
    B.box('paint', 'soil', L - 0.1, 0.04, W - 0.1, 0, H + 0.005, 0, { r: 0.015 });
    if (v === 0) {
      const n = Math.max(1, Math.round(L / 0.75));
      for (let i = 0; i < n; i++) { B.push(-L / 2 + ((i + 0.5) / n) * L, 0, 0); bushCluster(B, 4, Math.min(W, 0.9) * 0.5, H - 0.05, 0.05, 1, i * 3 + 1); B.pop(); }
    } else if (v === 1) {
      const n = Math.max(1, Math.round(L / 0.6));
      for (let i = 0; i < n; i++) B.add('foliage', G.blob(1, 1, (i + 2) % 8), 'leafdark', -L / 2 + ((i + 0.5) / n) * L, H + 0.02, 0, { s: 0.34, sy: 0.14, sz: W * 0.52 / 0.34 * 0.34 });
      const fc = ['pink', 'mustard', 'offwhite', 'lavender', 'coral'];
      const nf = Math.round(L * W * 15);
      for (let i = 0; i < nf; i++) {
        const x = B.r(-L / 2 + 0.1, L / 2 - 0.1), z = B.r(-W / 2 + 0.1, W / 2 - 0.1);
        B.add('foliage', G.blob(1, 0, i % 8), fc[i % fc.length], x, H + 0.1 + B.r(0, 0.05), z, { s: 0.055, ry: B.r(0, TAU), ao: false });
        B.sph('foliage', 'mustard', 0.02, x, H + 0.15 + 0.03, z, { ws: 5, hs: 3, ao: false });
      }
    } else {
      B.cyl('wood', 'bark', 0.055, 1.2, 0, H + 0.6, 0, { r2: 0.04, seg: 8 });
      canopy(B, 0, H + 1.5, 0, 0.6, 0.55, 5, 1);
      bushCluster(B, 3, 0.26, H - 0.05, 0.05, 0, 3, 'leafdark');
    }
    B.col(-L / 2 - 0.035, 0, -W / 2 - 0.035, L / 2 + 0.035, H, W / 2 + 0.035);
    B.blob(L + 0.4, W + 0.4);
  },
};

D.bush = {
  desc: 'Round stylised shrub cluster (3–4 lumpy blobs with baked top-light gradient).',
  params: { scale: 'uniform (1)', color: 'leaf', seed: 'layout' }, variants: 1, mount: 'ground',
  build(B, o) {
    const det = B.k.qf >= 1 ? 2 : 1;
    bushCluster(B, o.count ?? 6, 0.5, -0.04, 0.1, det, (o.seed ?? 3) % 6, o.color ?? 'leaf');
    B.col(-0.55, 0, -0.55, 0.55, 0.8, 0.55); B.blob(1.5, 1.5);
  },
};

D.tree = {
  desc: 'variant 0 = round-canopy plaza tree on a steel tree grate, 1 = curved palm with serrated fronds + coconuts.',
  params: { height: 'm (v0 4.2 / v1 5.2)', seed: 'shape' }, variants: 2, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 2, det = B.k.qf >= 1 ? 2 : 1;
    if (v === 0) {
      const h = (o.height ?? 4.2) / 4.2;
      B.push(0, 0, 0, 0, 0, 0, 1);
      B.box('metal', 'darksteel', 1.2, 0.03, 1.2, 0, 0.015, 0, { r: 0.012 });
      B.lathe('wood', 'bark', [[0, 0], [0.24, 0], [0.18, 0.06], [0.14, 0.2], [0.12, 0.9 * h], [0.1, 1.9 * h], [0.08, 2.5 * h], [0, 2.55 * h]], 0, 0, 0, { seg: 10 });
      B.tube('wood', 'bark', [P3(0, 1.5 * h, 0), P3(0.25, 1.9 * h, 0.08), P3(0.55, 2.35 * h, 0.15)], (t) => 0.07 - t * 0.03, { radial: 7 });
      B.tube('wood', 'bark', [P3(0, 1.7 * h, 0), P3(-0.22, 2.1 * h, -0.1), P3(-0.45, 2.5 * h, -0.2)], (t) => 0.06 - t * 0.025, { radial: 7 });
      const cy = 3.0 * h;
      canopy(B, 0, cy, 0, 1.35 * h, 1.1 * h, 7, det);
      B.pop();
      B.col(-0.2, 0, -0.2, 0.2, 2.2 * h, 0.2); B.blob(2.6, 2.6);
    } else {
      const Ht = o.height ?? 5.2, bend = 0.9;
      const pts = [];
      const N = Math.max(12, B.seg(30));
      for (let i = 0; i <= N; i++) { const t = i / N; pts.push(P3(Math.sin(t * 1.4) * bend * t, t * Ht, 0)); }
      B.tube('wood', 'bark', pts, (t) => (0.17 - t * 0.06) * (1 + 0.1 * Math.max(0, Math.sin(t * PI * 22))), { radial: B.seg(9) });
      B.lathe('wood', 'bark', [[0, 0], [0.26, 0], [0.2, 0.08], [0.17, 0.2], [0, 0.2]], 0, 0, 0, { seg: 10 });
      const top = pts[N];
      B.sph('wood', 'wooddark', 0.16, top[0], top[1] + 0.02, 0, { ws: 9, hs: 6 });
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; B.sph('wood', 'wooddark', 0.1, top[0] + Math.cos(a) * 0.14, top[1] - 0.12, Math.sin(a) * 0.14, { ws: 8, hs: 6 }); }
      // fronds
      const g = new GB(), nf = 9, segs = 12;
      for (let f = 0; f < nf; f++) {
        const az = (f / nf) * TAU + B.r(-0.2, 0.2), len = B.r(1.7, 2.1), lift = f % 2 ? 0.55 : 0.35;
        const dx = Math.cos(az), dz = Math.sin(az), lx = -dz, lz = dx;
        for (let s = 0; s <= segs; s++) {
          const t = s / segs;
          const px = top[0] + dx * len * t, pz = dz * len * t, py = top[1] + 0.05 + lift * t - 1.25 * t * t;
          const w = 0.34 * Math.pow(Math.sin(PI * Math.min(1, t * 1.08 + 0.02)), 0.7) * (s % 2 ? 1 : 0.62);
          const shadeK = 0.78 + 0.35 * t;
          const ny = 1, nx = dx * (2.5 * t - lift) * 0.5, nz = dz * (2.5 * t - lift) * 0.5;
          g.v(px, py + w * 0.18, pz, nx, ny, nz, 0, t, shadeK);
          g.v(px + lx * w, py - w * 0.14, pz + lz * w, nx + lx * 0.3, ny, nz + lz * 0.3, 0, t, shadeK * 1.04);
          g.v(px - lx * w, py - w * 0.14, pz - lz * w, nx - lx * 0.3, ny, nz - lz * 0.3, 0, t, shadeK * 1.04);
          if (s > 0) { const b = g.p.length / 3 - 3, a = b - 3; g.quad(a, a + 1, b + 1, b); g.quad(a, b, b + 2, a + 2); }
        }
      }
      B.add('foliage', g.geo(), 'leaf', 0, 0, 0, {});
      B.col(-0.22, 0, -0.22, 0.22, Ht * 0.7, 0.22); B.blob(1.2, 1.2);
    }
  },
};

D.vending = {
  desc: 'Vending machine with glowing product window (emissive, non-blooming), lit brand header, button column, dispense flap, side graphics. variant 0 = FIZZ CURRENT drinks, 1 = TIDE SNACKS. Front faces +Z.',
  params: { color: 'body (teal / coral)' }, variants: 2, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 2, body = o.color ?? (v ? 'coral' : 'teal');
    const W = 1.0, H = 1.86, Dd = 0.78, zf = Dd / 2;
    B.box('gloss', body, W, H - 0.08, Dd, 0, 0.08 + (H - 0.08) / 2, 0, { round: true, r: 0.06 });
    B.box('rubber', 'rubber', W - 0.08, 0.1, Dd - 0.08, 0, 0.05, 0, { r: 0.02 });
    B.box('paint', 'offwhite', 0.72, 1.18, 0.05, -0.12, 1.1, zf, { r: 0.02 });
    B.decal(v ? 'vend1' : 'vend0', 0.64, 1.08, -0.12, 1.1, zf + 0.027, { glow: 1.35 });
    B.box('paint', 'offwhite', 0.72, 0.03, 0.06, -0.12, 0.5, zf + 0.005, { r: 0.01 });
    B.box('paint', 'charcoal', 0.2, 0.96, 0.04, 0.35, 1.1, zf + 0.004, { r: 0.015 });
    B.box('glow', 'mint', 0.14, 0.055, 0.012, 0.35, 1.5, zf + 0.026, { glow: 1.8 });
    for (let r = 0; r < 3; r++) for (let c2 = 0; c2 < 2; c2++) B.box('gloss', r === 0 ? 'offwhite' : c2 ? 'mustard' : 'offwhite', 0.055, 0.04, 0.025, 0.315 + c2 * 0.07, 1.4 - r * 0.07, zf + 0.03, { r: 0.008 });
    B.box('metal', 'galv', 0.07, 0.11, 0.025, 0.35, 1.08, zf + 0.03, { r: 0.01 });
    B.box('paint', 'ink', 0.03, 0.07, 0.01, 0.35, 1.08, zf + 0.043, { r: 0.004 });
    B.box('metal', 'galv', 0.1, 0.05, 0.03, 0.35, 0.86, zf + 0.03, { r: 0.01 });
    B.box('paint', 'ink', 0.64, 0.26, 0.04, -0.12, 0.3, zf + 0.004, { r: 0.015 });
    B.box('gloss', 'charcoal', 0.58, 0.17, 0.03, -0.12, 0.31, zf + 0.03, { rx: 0.18, r: 0.012 });
    B.box('paint', 'offwhite', W - 0.04, 0.2, 0.04, 0, 1.745, zf + 0.004, { r: 0.015 });
    B.decal(v ? 'head1' : 'head0', W - 0.1, 0.16, 0, 1.745, zf + 0.027, { glow: 1.9 });
    for (const sx of [-1, 1]) B.decal('side', 0.6, 1.25, sx * (W / 2 + 0.002), 0.95, -0.02, { ry: sx * HP, tint: shade('offwhite', 1.0) });
    B.col(-W / 2, 0, -Dd / 2, W / 2, H, Dd / 2 + 0.05);
    B.blob(1.45, 1.15, 0, 0.05);
  },
};

D.acunit = {
  desc: 'variant 0 = wall-mounted AC condenser (projects +Z from wall at z=0, pos.y = unit bottom) with spinning fan behind a grille, brackets and refrigerant pipes; 1 = rooftop unit with upward fan and louvres.',
  params: { color: 'casing (offwhite)' }, variants: 2, mount: 'wall',
  build(B, o) {
    const v = (o.variant ?? 0) % 2, c = o.color ?? 'offwhite';
    if (v === 0) {
      B.aoBase = null;
      const W = 0.86, H = 0.62, Dd = 0.34, z0 = 0.06, zf = z0 + Dd;
      B.box('paint', c, W, H, Dd, 0, H / 2, z0 + Dd / 2, { round: true, r: 0.045 });
      B.cyl('paint', 'ink', 0.235, 0.03, -0.13, H / 2, zf - 0.01, { rx: HP, seg: 20 });
      B.spin('fan', -0.13, H / 2, zf + 0.012, { rx: 0, speed: 11, s: 1.05 });
      B.tor('metal', 'galv', 0.238, 0.02, -0.13, H / 2, zf + 0.018, { rs: 5, ts: 24 });
      B.decal('grille', 0.46, 0.46, -0.13, H / 2, zf + 0.034, { tint: 'darksteel' });
      B.cyl('metal', 'galv', 0.035, 0.03, -0.13, H / 2, zf + 0.036, { rx: HP, seg: 10 });
      B.box('paint', 'cream', 0.25, 0.52, 0.024, 0.27, H / 2, zf + 0.004, { r: 0.012 });
      B.decal('badge', 0.17, 0.064, 0.27, H * 0.8, zf + 0.018);
      for (let i = 0; i < 4; i++) B.box('paint', shade(c, 0.86), 0.2, 0.018, 0.02, 0.27, 0.13 + i * 0.055, zf + 0.018, { r: 0.006, rx: -0.4 });
      B.tube('gloss', 'cream', [P3(W / 2 - 0.04, 0.1, z0 + 0.12), P3(W / 2 + 0.06, 0.1, z0 + 0.12), P3(W / 2 + 0.1, 0.1, z0 + 0.06), P3(W / 2 + 0.11, 0.1, 0)], 0.028, { radial: 8 });
      B.tube('metal', 'copper', [P3(W / 2 - 0.04, 0.2, z0 + 0.1), P3(W / 2 + 0.03, 0.2, z0 + 0.1), P3(W / 2 + 0.05, 0.2, z0 + 0.05), P3(W / 2 + 0.055, 0.2, 0)], 0.014, { radial: 6 });
      for (const sx of [-1, 1]) {
        const x = sx * 0.3;
        B.box('metal', 'darksteel', 0.045, 0.045, Dd + 0.1, x, -0.022, (Dd + 0.1) / 2, { r: 0.012 });
        B.box('metal', 'darksteel', 0.1, 0.36, 0.025, x, -0.16, 0.012, { r: 0.01 });
        B.push(x, -0.18, 0.14, 0, -0.9); B.box('metal', 'darksteel', 0.035, 0.035, 0.34, 0, 0, 0, { r: 0.01 }); B.pop();
        B.cyl('rubber', 'rubber', 0.04, 0.03, x, 0.005, z0 + Dd / 2, { seg: 8 });
      }
      B.col(-W / 2, -0.05, 0, W / 2 + 0.12, H, zf + 0.04);
    } else {
      const W = 1.1, H = 0.72, Dd = 0.9, y0 = 0.12;
      for (const sx of [-1, 1]) B.box('metal', 'darksteel', 0.09, y0, Dd + 0.1, sx * 0.44, y0 / 2, 0, { r: 0.02 });
      B.box('paint', c, W, H, Dd, 0, y0 + H / 2, 0, { round: true, r: 0.05 });
      const yt = y0 + H;
      B.cyl('paint', 'ink', 0.34, 0.03, 0, yt - 0.01, 0.0, { seg: 24 });
      B.spin('fan', 0, yt + 0.012, 0, { rx: -HP, speed: 9, s: 1.55 });
      B.tor('metal', 'galv', 0.345, 0.024, 0, yt + 0.02, 0, { rx: HP, rs: 5, ts: 28 });
      B.decal('grille', 0.68, 0.68, 0, yt + 0.036, 0, { rx: -HP, tint: 'darksteel' });
      for (let i = 0; i < 5; i++) B.box('paint', shade(c, 0.84), W - 0.2, 0.03, 0.04, 0, y0 + 0.15 + i * 0.1, Dd / 2 + 0.01, { r: 0.008, rx: -0.5 });
      for (let i = 0; i < 5; i++) B.box('paint', shade(c, 0.84), 0.04, 0.03, Dd - 0.2, W / 2 + 0.01, y0 + 0.15 + i * 0.1, 0, { r: 0.008, rz: 0.5 });
      B.decal('badge', 0.2, 0.075, -W / 2 - 0.002, y0 + H * 0.75, 0.2, { ry: -HP });
      B.tube('gloss', 'cream', [P3(-W / 2 + 0.1, y0 + 0.2, -Dd / 2), P3(-W / 2 + 0.1, y0 + 0.2, -Dd / 2 - 0.12), P3(-W / 2 + 0.1, 0.06, -Dd / 2 - 0.2), P3(-W / 2 + 0.1, 0.03, -Dd / 2 - 0.5)], 0.035, { radial: 8 });
      B.col(-W / 2, 0, -Dd / 2, W / 2, y0 + H + 0.05, Dd / 2);
      B.blob(W + 0.4, Dd + 0.4);
    }
  },
};

D.vent = {
  desc: 'Roof vents. variant 0 = gooseneck pipe hood, 1 = spinning turbine ventilator, 2 = mushroom cap vent, 3 = louvred exhaust box.',
  params: { color: 'metal tint (galv)' }, variants: 4, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 4, c = o.color ?? 'galv';
    if (v === 0) {
      B.lathe('metal', c, flangeProf(0.2, 0.05), 0, 0, 0, { seg: 16 });
      const R = 0.16, pts = [P3(0, 0.04, 0), P3(0, 0.62, 0)];
      for (let i = 1; i <= 8; i++) { const a = (i / 8) * PI; pts.push(P3(R - Math.cos(a) * R, 0.62 + Math.sin(a) * R, 0)); }
      pts.push(P3(2 * R, 0.5, 0));
      B.tube('metal', c, pts, 0.1, { radial: 14 });
      B.lathe('metal', c, [[0.1, 0.52], [0.15, 0.4], [0.16, 0.38], null, [0.14, 0.38], [0.09, 0.5]], 2 * R, 0, 0, { seg: 14 });
      B.cyl('paint', 'ink', 0.13, 0.01, 2 * R, 0.43, 0, { seg: 12 });
      B.cyl('metal', 'darksteel', 0.106, 0.05, 0, 0.3, 0, { seg: 14, open: true });
      B.col(-0.2, 0, -0.2, 0.5, 0.9, 0.2); B.blob(0.8, 0.6, 0.12, 0);
    } else if (v === 1) {
      B.lathe('metal', c, flangeProf(0.24, 0.05), 0, 0, 0, { seg: 16 });
      B.cyl('metal', c, 0.15, 0.36, 0, 0.23, 0, { seg: 16, open: true });
      B.tor('metal', shade(c, 0.85), 0.16, 0.02, 0, 0.42, 0, { rx: HP, rs: 5, ts: 20 });
      B.spin('turbine', 0, 0.42, 0, { speed: 2.2 });
      B.col(-0.26, 0, -0.26, 0.26, 0.9, 0.26); B.blob(0.8, 0.8);
    } else if (v === 2) {
      B.lathe('metal', c, flangeProf(0.22, 0.05), 0, 0, 0, { seg: 16 });
      B.cyl('metal', c, 0.12, 0.5, 0, 0.29, 0, { seg: 16, open: true });
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; B.box('metal', 'darksteel', 0.03, 0.14, 0.03, Math.cos(a) * 0.11, 0.6, Math.sin(a) * 0.11, { r: 0.008 }); }
      B.lathe('metal', c, [[0, 0.64], [0.29, 0.64], [0.3, 0.67], [0.24, 0.74], [0.12, 0.79], [0, 0.8]], 0, 0, 0, { seg: 20 });
      B.cyl('paint', 'ink', 0.115, 0.01, 0, 0.535, 0, { seg: 12 });
      B.col(-0.3, 0, -0.3, 0.3, 0.8, 0.3); B.blob(0.8, 0.8);
    } else {
      B.box('metal', c, 0.9, 0.12, 0.7, 0, 0.06, 0, { r: 0.03 });
      B.box('metal', c, 0.78, 0.5, 0.58, 0, 0.37, 0, { round: true, r: 0.04 });
      B.push(0, 0.66, 0, 0, 0, 0); B.box('metal', shade(c, 0.95), 0.88, 0.06, 0.7, 0, 0, 0, { r: 0.025 }); B.pop();
      for (const sz of [-1, 1]) for (let i = 0; i < 5; i++) B.box('metal', shade(c, 0.8), 0.66, 0.025, 0.05, 0, 0.18 + i * 0.075, sz * 0.3, { rx: sz * 0.6, r: 0.008 });
      B.col(-0.45, 0, -0.35, 0.45, 0.7, 0.35); B.blob(1.2, 1.0);
    }
  },
};

D.pipes = {
  desc: 'Wall pipe run: 2–3 parallel painted pipes along +X at the wall (z=0), nested elbows dropping to the floor at the start and into the wall at the end, clamp brackets, flanges and a valve wheel.',
  params: { length: 'm (4)', count: '2–3 (3)', height: 'm, top pipe centre (2.2)', color: 'all pipes (default mixed teal/cream/mustard)' }, variants: 1, mount: 'wall',
  build(B, o) {
    const L = Math.max(1.6, o.length ?? 4), n = Math.max(1, Math.min(3, o.count ?? 3)), H = o.height ?? 2.2;
    const sp = 0.27, z = 0.2, R = 0.17, R2 = 0.14, xe = L - 0.02;
    const radii = [0.075, 0.062, 0.052], cols = o.color ? [o.color, o.color, o.color] : ['teal', 'cream', 'mustard'];
    const rs = B.seg(8);
    for (let i = 0; i < n; i++) {
      const r = radii[i], y = H - i * sp, xa = i * sp + 0.1;
      const pts = [P3(xa, 0.04, z), P3(xa, y - R, z)];
      for (let k = 1; k <= 4; k++) { const t = (k / 5) * HP; pts.push(P3(xa + R * (1 - Math.cos(t)), y - R + R * Math.sin(t), z)); }
      pts.push(P3(xa + R, y, z), P3(xe - R2, y, z));
      for (let k = 1; k <= 4; k++) { const t = (k / 5) * HP; pts.push(P3(xe - R2 + R2 * Math.sin(t), y, z - R2 + R2 * Math.cos(t))); }
      pts.push(P3(xe, y, z - R2), P3(xe, y, 0.0));
      B.tube('gloss', cols[i], pts, r, { radial: rs });
      B.lathe('metal', 'darksteel', flangeProf(r * 1.6, 0.04), xa, 0, z, { seg: 10 });
      B.cyl('gloss', shade(cols[i], 0.9), r * 1.3, 0.05, xa, 0.5, z, { seg: 10 });
      B.cyl('metal', 'darksteel', r * 1.55, 0.03, xe, y, 0.015, { rx: HP, seg: 10 });
      const run0 = xa + R + 0.3, run1 = xe - R2 - 0.2;
      for (let x = run0 + 0.5; x < run1 - 0.2; x += 1.9) B.cyl('gloss', shade(cols[i], 0.9), r * 1.3, 0.05, x, y, z, { rz: HP, seg: 10 });
    }
    const yTop = H + 0.12, yBot = H - (n - 1) * sp - 0.12;
    const bx0 = (n - 1) * sp + 0.1 + R + 0.35, bx1 = xe - R2 - 0.25;
    const nbr = Math.max(1, Math.round((bx1 - bx0) / 2.0) + 1);
    for (let b = 0; b < nbr; b++) {
      const x = nbr === 1 ? (bx0 + bx1) / 2 : bx0 + (b / (nbr - 1)) * (bx1 - bx0);
      B.box('metal', 'darksteel', 0.05, yTop - yBot, 0.05, x, (yTop + yBot) / 2, z - 0.1, { r: 0.012 });
      for (const yy of [yTop - 0.03, yBot + 0.03]) B.box('metal', 'darksteel', 0.05, 0.05, z - 0.1 + 0.03, x, yy, (z - 0.1) / 2, { r: 0.012 });
      for (let i = 0; i < n; i++) B.cyl('metal', 'galv', radii[i] + 0.012, 0.045, x, H - i * sp, z, { rz: HP, seg: 10 });
    }
    // valve wheel on the top pipe
    const vx = Math.min(bx1 - 0.5, bx0 + 0.7), vy = H;
    B.cyl('gloss', 'coral', radii[0] * 1.5, 0.18, vx, vy, z, { rz: HP, seg: 12, bevel: 0.02 });
    B.cyl('metal', 'galv', 0.018, 0.16, vx, vy + 0.12, z, { seg: 8 });
    B.tor('gloss', 'coral', 0.1, 0.014, vx, vy + 0.2, z, { rx: HP, rs: 5, ts: 16 });
    B.box('gloss', 'coral', 0.2, 0.02, 0.02, vx, vy + 0.2, z, { r: 0.006 });
  },
};

D.ladder = {
  desc: 'Decorative steel wall ladder (wall at z=0): rails with goose-neck tops returning into the wall, rungs every 0.3 m, stand-off brackets.',
  params: { height: 'm (3)', color: 'paint (mustard)' }, variants: 1, mount: 'wall',
  build(B, o) {
    const H = o.height ?? 3, W = 0.5, z = 0.18, c = o.color ?? 'mustard';
    for (const sx of [-1, 1]) {
      const x = (sx * W) / 2, pts = [P3(x, 0.02, z), P3(x, H, z)];
      for (let k = 1; k <= 6; k++) { const t = (k / 6) * HP; pts.push(P3(x, H + Math.sin(t) * z, Math.cos(t) * z)); }
      B.tube('gloss', c, pts, 0.026, { radial: 8 });
      B.cyl('metal', 'darksteel', 0.04, 0.03, x, 0.015, z, { seg: 8 });
      for (const yy of [0.5, H - 0.4]) B.box('metal', 'darksteel', 0.04, 0.05, z, x, yy, z / 2, { r: 0.01 });
    }
    for (let y = 0.3; y < H - 0.05; y += 0.3) B.cyl('gloss', c, 0.016, W, 0, y, z, { rz: HP, seg: 8, open: true });
  },
};

D.sign = {
  desc: 'Billboard with a bold original brand graphic on twin steel posts with goose-neck spot lamps. variant 0 KRAKEN LINES, 1 TIDE SNACKS, 2 SQUIDKID SKATE, 3 BARNACLE BREW. wall:true mounts it flat on a wall (z=0).',
  params: { width: 'm board (2.8)', height: 'm board (1.4)', color: 'frame (charcoal)', wall: 'bool' }, variants: 4, mount: 'ground|wall',
  build(B, o) {
    const W = o.width ?? 2.8, Hs = o.height ?? 1.4, v = (o.variant ?? 0) % 4, wall = !!o.wall, fc = o.color ?? 'charcoal';
    if (wall) B.aoBase = null;
    const y0 = wall ? 0 : 1.9, cy = y0 + Hs / 2, zb = wall ? 0.08 : 0;
    B.box('paint', fc, W + 0.14, Hs + 0.14, 0.12, 0, cy, zb, { round: true, r: 0.045 });
    B.decal('sign' + v, W, Hs, 0, cy, zb + 0.062);
    if (!wall) {
      for (const sx of [-1, 1]) {
        const x = sx * W * 0.3;
        B.box('gloss', 'darksteel', 0.13, y0 + Hs * 0.7, 0.13, x, (y0 + Hs * 0.7) / 2, -0.13, { r: 0.03 });
        B.box('metal', 'darksteel', 0.34, 0.04, 0.34, x, 0.02, -0.13, { r: 0.012 });
        for (const [bx, bz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) B.cyl('metal', 'galv', 0.016, 0.03, x + bx, 0.05, -0.13 + bz, { seg: 6 });
      }
      B.box('gloss', 'darksteel', W * 0.6 + 0.13, 0.09, 0.07, 0, y0 - 0.3, -0.13, { r: 0.02 });
      B.col(-W * 0.3 - 0.17, 0, -0.3, W * 0.3 + 0.17, y0 + Hs, 0.04);
      B.blob(0.5, 0.5, -W * 0.3, -0.13); B.blob(0.5, 0.5, W * 0.3, -0.13);
    }
    for (const sx of [-1, 1]) {
      const x = sx * W * 0.28, yt = y0 + Hs + 0.07;
      B.tube('metal', 'darksteel', [P3(x, yt - 0.05, zb - 0.02), P3(x, yt + 0.16, zb - 0.02), P3(x, yt + 0.26, zb + 0.08), P3(x, yt + 0.28, zb + 0.36)], 0.016, { radial: 6 });
      B.push(x, yt + 0.26, zb + 0.42, 0, 0.75);
      B.box('paint', 'charcoal', 0.24, 0.07, 0.12, 0, 0, 0, { r: 0.025 });
      B.box('glow', 'cream', 0.2, 0.012, 0.09, 0, -0.036, 0, { glow: 3.0, r: 0.004 });
      B.pop();
    }
  },
};

const NEON = {
  0: { W: 0.9, H: 0.95, paths: () => {
    const mantle = smoothPts([[0, 0.33], [0.12, 0.2], [0.27, 0.1], [0.16, 0.06], [0.15, -0.1], [0.07, -0.13], [-0.07, -0.13], [-0.15, -0.1], [-0.16, 0.06], [-0.27, 0.1], [-0.12, 0.2]], true, 36);
    const out = [{ pts: mantle, closed: true, c: 'n_pink' }];
    for (const ex of [-0.065, 0.065]) out.push({ pts: circlePts(ex, -0.03, 0.042, 11), closed: true, c: 'n_white' });
    for (const tx of [-0.1, -0.034, 0.034, 0.1]) { const p = []; for (let i = 0; i <= 8; i++) { const t = i / 8; p.push([tx + 0.025 * Math.sin(t * PI * 2 + tx * 20), -0.17 - t * 0.2]); } out.push({ pts: p, closed: false, c: 'n_pink' }); }
    return out;
  } },
  1: { W: 1.2, H: 0.75, paths: () => {
    const out = [{ pts: circlePts(-0.3, 0.1, 0.14, 22), closed: true, c: 'n_yellow' }];
    for (let i = 0; i < 5; i++) { const a = 0.4 + (i / 4) * (PI - 0.8); out.push({ pts: [[-0.3 + Math.cos(a) * 0.19, 0.1 + Math.sin(a) * 0.19], [-0.3 + Math.cos(a) * 0.26, 0.1 + Math.sin(a) * 0.26]], closed: false, c: 'n_yellow' }); }
    for (const [y0, ph] of [[-0.12, 0], [-0.25, 1.4]]) { const p = []; for (let i = 0; i <= 20; i++) { const x = -0.5 + (i / 20); p.push([x, y0 + 0.04 * Math.sin(x * 13 + ph)]); } out.push({ pts: p, closed: false, c: 'n_cyan' }); }
    out.push({ pts: smoothPts([[0.12, 0.05], [0.2, 0.2], [0.3, 0.12], [0.4, 0.26], [0.48, 0.1]], false, 14), closed: false, c: 'n_cyan' });
    return out;
  } },
  2: { W: 1.1, H: 0.75, paths: () => {
    const body = []; for (let i = 0; i < 30; i++) { const t = (i / 30) * TAU; body.push([0.02 + Math.cos(t) * 0.27, Math.sin(t) * 0.15 * (1 - 0.25 * Math.cos(t))]); }
    return [
      { pts: body, closed: true, c: 'n_coral' },
      { pts: roundPoly([[0.26, 0.0], [0.44, 0.15], [0.44, -0.15]], 0.04), closed: true, c: 'n_coral' },
      { pts: circlePts(-0.14, 0.04, 0.03, 10), closed: true, c: 'n_white' },
      { pts: smoothPts([[-0.2, -0.06], [-0.13, -0.09], [-0.06, -0.07]], false, 8), closed: false, c: 'n_white' },
      { pts: circlePts(-0.38, 0.14, 0.032, 10), closed: true, c: 'n_cyan' },
      { pts: circlePts(-0.43, 0.24, 0.024, 9), closed: true, c: 'n_cyan' },
      { pts: circlePts(-0.36, 0.3, 0.018, 8), closed: true, c: 'n_cyan' },
    ];
  } },
  3: { W: 0.9, H: 0.9, paths: () => {
    const star = []; for (let i = 0; i < 10; i++) { const a = HP + (i / 10) * TAU, r = i % 2 ? 0.12 : 0.28; star.push([Math.cos(a) * r, Math.sin(a) * r - 0.01]); }
    return [{ pts: roundPoly(star, 0.025), closed: true, c: 'n_yellow' }, { pts: circlePts(0, -0.01, 0.37, 40), closed: true, c: 'n_lavender' }];
  } },
};
const NEON_COL = { n_pink: '#ff86c2', n_white: '#e8f6ff', n_yellow: '#ffd978', n_cyan: '#7ee8ff', n_coral: '#ff9c7a', n_lavender: '#c6a8ff' };

D.neon = {
  desc: 'Wall neon sign: glass tubes (emissive ×4.5, blooms) on a dark backing board with stand-offs (wall at z=0, pos.y = board bottom). variant 0 squid, 1 sun + waves, 2 fish + bubbles, 3 star badge.',
  params: { color: 'override tube colour', scale: 'uniform' }, variants: 4, mount: 'wall',
  build(B, o) {
    B.aoBase = null;
    const v = (o.variant ?? 0) % 4, N = NEON[v], cy = N.H / 2, zt = 0.085;
    B.box('paint', 'ink', N.W, N.H, 0.05, 0, cy, 0.03, { round: true, r: 0.03 });
    B.box('paint', 'charcoal', N.W + 0.05, N.H + 0.05, 0.02, 0, cy, 0.01, { r: 0.012 });
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cyl('metal', 'galv', 0.012, 0.03, sx * (N.W / 2 - 0.08), cy + sy * (N.H / 2 - 0.08), 0.065, { rx: HP, seg: 6 });
    const rad = B.seg(5);
    for (const p of N.paths()) {
      const c = o.color ?? NEON_COL[p.c];
      const pts = p.pts.map((q) => P3(q[0], q[1] + cy, zt));
      B.tube('glow', c, pts, 0.016, { radial: rad, closed: p.closed, up: [0, 0, 1], glow: 6 });
      if (!p.closed) for (const e of [pts[0], pts[pts.length - 1]]) B.sph('glow', c, 0.017, e[0], e[1], e[2], { ws: 5, hs: 3, glow: 6 });
    }
  },
};

D.awning = {
  desc: 'Striped canvas shop awning (wall at z=0, pos.y = top edge) with scalloped valance and steel arms.',
  params: { width: 'm (2.4)', length: 'm projection (1.1)', color: 'stripe accent (coral)' }, variants: 1, mount: 'wall',
  build(B, o) {
    B.aoBase = null;
    const W = o.width ?? 2.4, Dd = o.length ?? 1.1, drop = 0.5, c = o.color ?? 'coral';
    const ns = Math.max(4, Math.round(W / 0.24)), sw = W / ns, npf = 7;
    const prof = [];
    for (let i = 0; i <= npf; i++) { const t = i / npf; prof.push([Dd * t, -drop * t + 0.1 * Math.sin(PI * t)]); }
    const g = new GB();
    for (let j = 0; j < ns; j++) {
      const x0 = -W / 2 + j * sw, x1 = x0 + sw, k = j % 2 ? 1.0 : 1.0;
      const cc = j % 2 ? 1 : 0; // colour index packed via separate parts below
      for (const side of [1, -1]) {
        const ids = [];
        for (let i = 0; i <= npf; i++) {
          const a = prof[Math.max(0, i - 1)], b = prof[Math.min(npf, i + 1)];
          let tz = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tz, ty); tz /= l; ty /= l;
          const nz = -ty * side, ny = tz * side, off = side > 0 ? 0 : -0.006;
          ids.push([g.v(x0, prof[i][1] + ny * off, prof[i][0] + nz * off, 0, ny, nz, cc, 0, k), g.v(x1, prof[i][1] + ny * off, prof[i][0] + nz * off, 0, ny, nz, cc, 0, k)]);
        }
        for (let i = 0; i < npf; i++) g.quad(ids[i][0], ids[i][1], ids[i + 1][1], ids[i + 1][0]);
        // valance with scallop
        const zf = Dd + (side > 0 ? 0.002 : -0.004), yv = -drop, vh = 0.15, xm = (x0 + x1) / 2;
        const n0 = g.v(x0, yv, zf, 0, 0, side, cc), n1 = g.v(x1, yv, zf, 0, 0, side, cc), n2 = g.v(x1, yv - vh, zf, 0, 0, side, cc), n3 = g.v(x0, yv - vh, zf, 0, 0, side, cc);
        g.quad(n0, n1, n2, n3);
        const cen = g.v(xm, yv - vh, zf, 0, 0, side, cc), arc = [];
        for (let q = 0; q <= 6; q++) { const t = PI + (q / 6) * PI; arc.push(g.v(xm - Math.cos(t) * sw / 2, yv - vh + Math.sin(t) * sw * 0.42, zf, 0, 0, side, cc)); }
        for (let q = 0; q < 6; q++) g.tri(cen, arc[q], arc[q + 1]);
      }
    }
    // split stripes into two colour parts: rebuild colours from the packed uv.x flag
    const geo = g.geo(), U = geo.attributes.uv, C = geo.attributes.color, ca = col(c), cb = col('offwhite');
    for (let i = 0; i < U.count; i++) { const cc = U.getX(i) > 0.5 ? cb : ca; C.setXYZ(i, cc.r, cc.g, cc.b); U.setXY(i, 0, 0); }
    B.add('paint', geo, 'white', 0, 0, 0, {});
    B.cyl('metal', 'darksteel', 0.03, W + 0.06, 0, 0.02, 0.04, { rz: HP, seg: 8, bevel: 0.01 });
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.01);
      B.tube('metal', 'darksteel', [P3(x, -drop - 0.35, 0.01), P3(x, -drop - 0.02, Dd - 0.02)], 0.016, { radial: 6 });
      B.box('metal', 'darksteel', 0.06, 0.1, 0.02, x, -drop - 0.35, 0.01, { r: 0.008 });
    }
  },
};

D.bunting = {
  desc: 'String of triangular flags on a sagging rope between two poles (flags sway in the shader). team:0|1 tints flags with that team ink (alternating with white), otherwise mixed accents. posts:false omits the poles (rope from pos at `height`).',
  params: { length: 'm (6)', height: 'm rope anchor (3.4)', team: '0|1', posts: 'bool (true)' }, variants: 1, mount: 'ground',
  build(B, o) {
    const L = o.length ?? 6, Hh = o.height ?? 3.4, posts = o.posts !== false, team = o.team ?? null;
    if (posts) {
      for (const x of [0, L]) {
        B.lathe('paint', 'concrete', [[0, 0], [0.2, 0], [0.21, 0.03], [0.17, 0.12], [0, 0.12]], x, 0, 0, { seg: 14 });
        B.cyl('gloss', 'offwhite', 0.04, Hh + 0.08, x, 0.12 + (Hh + 0.08) / 2 - 0.1, 0, { seg: 10, open: true });
        B.sph('gloss', team == null ? 'coral' : 'charcoal', 0.065, x, Hh + 0.14, 0, { ws: 10, hs: 7 });
        B.box('metal', 'darksteel', 0.06, 0.04, 0.06, x, Hh, 0, { r: 0.01 });
        B.blob(0.5, 0.5, x, 0);
      }
      B.col(-0.2, 0, -0.2, 0.2, Hh, 0.2); B.col(L - 0.2, 0, -0.2, L + 0.2, Hh, 0.2);
    }
    const sag = Math.min(0.7, L * 0.075);
    const yAt = (x) => Hh - sag * (1 - Math.pow((2 * x) / L - 1, 2));
    const rp = []; for (let i = 0; i <= 16; i++) { const x = (i / 16) * L; rp.push(P3(x, yAt(x), 0)); }
    B.tube('paint', 'charcoal', rp, 0.008, { radial: 4 });
    const nf = Math.max(2, Math.floor((L - 0.3) / 0.36));
    for (let k = 0; k < nf; k++) {
      const x = 0.15 + ((k + 0.5) / nf) * (L - 0.3), dy = sag * ((4 * x) / L - 2) * (-2 / L) * -1;
      const slope = -sag * (-2 * ((2 * x) / L - 1) * (2 / L));
      const cc = team == null ? ACCENTS[k % 5] : 'offwhite';
      B.flag(x, yAt(x) - 0.004, 0, { rz: Math.atan(slope) + 0 * dy, team: team != null && k % 2 === 0 ? team : null, tint: k % 4 === 2 ? 0.35 : 0, color: cc });
    }
  },
};

D.banner = {
  desc: 'Vertical team banner hanging from a street pole arm (cloth flutters in the shader, emblem from the atlas). team:0|1 = team ink; otherwise `color`.',
  params: { height: 'm pole (3.6)', team: '0|1', color: 'cloth when no team (lavender)' }, variants: 1, mount: 'ground',
  build(B, o) {
    const H = o.height ?? 3.6, team = o.team ?? null;
    B.lathe('paint', 'concrete', [[0, 0], [0.26, 0], [0.27, 0.04], [0.22, 0.16], [0.08, 0.2], [0, 0.2]], 0, 0, 0, { seg: 16 });
    B.cyl('gloss', 'charcoal', 0.05, H - 0.18, 0, 0.18 + (H - 0.18) / 2, 0, { seg: 12, open: true, r2: 0.042 });
    B.sph('gloss', 'mustard', 0.075, 0, H + 0.04, 0, { ws: 12, hs: 8 });
    const ya = H - 0.25;
    B.cyl('gloss', 'charcoal', 0.024, 1.0, 0.5, ya, 0, { rz: HP, seg: 8, open: true });
    B.sph('gloss', 'mustard', 0.045, 1.0, ya, 0, { ws: 10, hs: 6 });
    B.box('gloss', 'charcoal', 0.08, 0.1, 0.08, 0.02, ya, 0, { r: 0.02 });
    for (const x of [0.2, 0.5, 0.8]) B.tor('metal', 'galv', 0.035, 0.008, x, ya, 0, { ry: HP, rs: 4, ts: 10 });
    B.banner(0.5, ya - 0.03, 0, { team, color: o.color ?? 'lavender' });
    B.col(-0.27, 0, -0.27, 0.27, H, 0.27); B.blob(0.8, 0.8);
  },
};

function woofer(B, x, y, z, R) {
  B.lathe('rubber', 'rubber', [[R * 1.04, 0.0], [R * 1.0, 0.012], [R * 0.92, 0.03], [R * 0.84, 0.008], [R * 0.55, -0.03], [R * 0.3, -0.05], [0, -0.05]], x, y, z, { rx: HP, seg: 16 });
  B.sph('metal', 'galv', R * 0.24, x, y, z - 0.03, { ws: 10, hs: 3, half: true, rx: HP });
}
D.speaker = {
  desc: 'Stage speaker stack on a road case: big woofer cabinet + two-driver top cabinet with horn, BOOMTIDE badges, blinking power LED. Faces +Z.',
  params: { color: 'cabinet (ink)' }, variants: 1, mount: 'ground',
  build(B, o) {
    const c = o.color ?? 'ink';
    B.box('paint', 'charcoal', 1.0, 0.28, 0.72, 0, 0.08 + 0.14, 0, { r: 0.03 });
    for (const yy of [0.09, 0.35]) B.box('metal', 'galv', 1.02, 0.03, 0.74, 0, yy, 0, { r: 0.01 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { B.cyl('rubber', 'rubber', 0.045, 0.05, sx * 0.4, 0.045, sz * 0.26, { rz: HP, seg: 10 }); }
    const y1 = 0.365 + 0.47;
    B.box('paint', c, 0.96, 0.94, 0.66, 0, y1, 0, { round: true, r: 0.05 });
    woofer(B, 0, y1 - 0.02, 0.33, 0.35);
    B.decal('wbadge', 0.2, 0.075, 0.33, y1 + 0.39, 0.332);
    for (const sx of [-1, 1]) B.box('metal', 'darksteel', 0.02, 0.06, 0.2, sx * 0.485, y1 + 0.15, 0, { r: 0.008 });
    const y2 = y1 + 0.47 + 0.29;
    B.push(0, y2, 0.0, 0, 0.1);
    B.box('paint', c, 0.94, 0.56, 0.62, 0, 0, 0, { round: true, r: 0.045 });
    woofer(B, -0.24, -0.02, 0.31, 0.17); woofer(B, 0.24, -0.02, 0.31, 0.17);
    B.box('paint', 'charcoal', 0.26, 0.13, 0.04, 0, 0.17, 0.31, { r: 0.025 });
    B.box('paint', 'ink', 0.2, 0.08, 0.03, 0, 0.17, 0.325, { r: 0.02 });
    B.decal('wbadge', 0.16, 0.06, 0, -0.2, 0.312);
    B.pop();
    B.blink('mint', 0.38, y1 - 0.38, 0.335, { rate: 0.7, size: 0.014, lo: 0.4, hi: 4 });
    B.col(-0.5, 0, -0.37, 0.5, y2 + 0.3, 0.37); B.blob(1.4, 1.1);
  },
};

function woodCrate(B, x, y, z, ry, S) {
  B.push(x, y, z, ry);
  B.box('wood', shade('woodlight', B.r(0.95, 1.05)), S - 0.04, S - 0.02, S - 0.04, 0, S / 2, 0, { r: 0.02 });
  for (const yy of [0.045, S - 0.045]) B.box('wood', shade('wooddark', B.r(0.95, 1.05)), S, 0.09, S, 0, yy, 0, { r: 0.018 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box('wood', 'wooddark', 0.075, S - 0.18, 0.075, sx * (S / 2 - 0.03), S / 2, sz * (S / 2 - 0.03), { r: 0.015 });
  B.push(0, S / 2, S / 2 - 0.008, 0, 0, Math.atan2(S - 0.2, S - 0.2)); B.box('wood', 'wooddark', Math.hypot(S - 0.2, S - 0.2) - 0.05, 0.07, 0.03, 0, 0, 0, { r: 0.01 }); B.pop();
  B.decal('stencil', S * 0.5, S * 0.25, S * 0.12, S * 0.66, S / 2 + 0.01, { tint: shade('ink', 1.2) });
  B.pop();
}
D.crates = {
  desc: 'Decor stacks. variant 0 = braced wooden crates (3), 1 = coloured plastic bottle crates (5), 2 = taped cardboard boxes (4).',
  params: { seed: 'layout', color: 'plastic crate accent' }, variants: 3, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 3;
    if (v === 0) {
      const S = 0.66;
      woodCrate(B, -0.36, 0, 0, B.r(-0.08, 0.08), S); woodCrate(B, 0.36, 0, 0.03, B.r(-0.08, 0.08), S);
      woodCrate(B, 0.02, S, 0.0, B.r(0.15, 0.4), S * 0.88);
      B.col(-0.72, 0, -0.36, 0.72, S, 0.38); B.col(-0.38, S, -0.38, 0.42, S * 1.88, 0.38); B.blob(1.9, 1.1);
    } else if (v === 1) {
      const cs = [o.color ?? 'teal', 'mustard', 'coral', 'lavender'];
      const cr = (x, y, z, ry, cc) => {
        B.push(x, y, z, ry);
        const w = 0.52, h = 0.3, d = 0.36;
        B.box('gloss', cc, w, h - 0.004, d, 0, h / 2, 0, { r: 0.016 });
        B.box('paint', shade(cc, 0.42), w - 0.06, 0.02, d - 0.06, 0, h - 0.004, 0, { r: 0.006 });
        for (const sx of [-1, 1]) B.box('paint', 'ink', 0.012, 0.05, 0.14, sx * (w / 2 + 0.001), h - 0.07, 0, { r: 0.004 });
        for (const sz of [-1, 1]) B.box('paint', shade(cc, 0.62), w - 0.12, 0.12, 0.012, 0, h * 0.45, sz * (d / 2 + 0.001), { r: 0.004 });
        B.pop();
      };
      for (let i = 0; i < 3; i++) cr(-0.3, i * 0.3, 0, B.r(-0.06, 0.06), cs[i % 4]);
      for (let i = 0; i < 2; i++) cr(0.3, i * 0.3, 0.04, B.r(-0.06, 0.06), cs[(i + 2) % 4]);
      B.col(-0.58, 0, -0.22, 0.58, 0.9, 0.26); B.blob(1.5, 0.8);
    } else {
      const bx = (x, y, z, w, h, d, ry) => {
        B.push(x, y, z, ry);
        B.box('paint', shade('kraft', B.r(0.92, 1.05)), w, h, d, 0, h / 2, 0, { r: 0.012 });
        B.box('paint', 'cream', w + 0.004, 0.006, 0.07, 0, h + 0.001, 0, { r: 0.002 });
        B.box('paint', 'cream', 0.004 + 0.002, h * 0.35, 0.07, w / 2 + 0.001, h * 0.82, 0, { r: 0.001 });
        B.pop();
      };
      bx(-0.3, 0, 0, 0.55, 0.42, 0.45, 0.05); bx(0.32, 0, 0.05, 0.5, 0.36, 0.5, -0.1); bx(-0.25, 0.42, 0.02, 0.44, 0.32, 0.38, 0.3); bx(0.3, 0.36, 0.05, 0.34, 0.26, 0.3, -0.2);
      B.col(-0.6, 0, -0.3, 0.6, 0.74, 0.32); B.blob(1.5, 1.0);
    }
  },
};

const DRUM = [[0, 0], [0.27, 0], [0.285, 0.015], [0.29, 0.045], [0.29, 0.27], [0.302, 0.29], [0.29, 0.31], [0.29, 0.57], [0.302, 0.59], [0.29, 0.61], [0.29, 0.84], [0.284, 0.87], [0.268, 0.88], [0.255, 0.872], [0, 0.872]];
function drum(B, c, x, y, z, rx = 0, rz = 0) {
  B.push(x, y, z, 0, rx, rz);
  B.lathe('gloss', c, DRUM, 0, 0, 0, { seg: 18 });
  B.lathe('gloss', 'offwhite', [[0.2935, 0.35], [0.2935, 0.53]], 0, 0, 0, { seg: 18 });
  B.cyl('metal', 'galv', 0.035, 0.025, 0.14, 0.875, 0.05, { seg: 8 });
  B.cyl('metal', 'galv', 0.025, 0.025, -0.15, 0.875, -0.05, { seg: 8 });
  B.pop();
}
D.barrel = {
  desc: 'Glossy steel drum with rolling hoops, label band and bungs. variant 0 = single upright, 1 = upright + one lying on its side.',
  params: { color: 'drum (teal)' }, variants: 2, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 2, c = o.color ?? 'teal';
    drum(B, c, 0, 0, 0);
    B.col(-0.3, 0, -0.3, 0.3, 0.88, 0.3); B.blob(0.85, 0.85);
    if (v === 1) {
      drum(B, o.color2 ?? 'coral', 0.72, 0.3, 0.05, 0, 0.0, HP);
      B.box('wood', 'wooddark', 0.1, 0.07, 0.2, 0.36, 0.035, 0.05, { r: 0.015 });
      B.col(0.3, 0, -0.26, 1.2, 0.6, 0.36); B.blob(1.1, 0.8, 0.72, 0.05);
    }
  },
};

function pallet(B, y, ry) {
  B.push(0, y, 0, ry);
  for (const z of [-0.42, 0, 0.42]) B.box('wood', shade('wooddark', B.r(0.95, 1.05)), 1.2, 0.02, 0.1, 0, 0.01, z, { r: 0.006 });
  for (const z of [-0.42, 0, 0.42]) B.box('wood', shade('wood', B.r(0.9, 1.0)), 1.2, 0.08, 0.1, 0, 0.06, z, { r: 0.012 });
  for (let i = 0; i < 7; i++) B.box('wood', shade('woodlight', B.r(0.9, 1.06)), 0.12, 0.022, 1.0, -0.54 + i * 0.18, 0.111, 0, { r: 0.007 });
  B.pop();
}
D.pallet = {
  desc: 'Wooden shipping pallet. variant 0 = single, 1 = stack of 2, 2 = pallet loaded with kraft sacks.',
  params: { seed: 'jitter' }, variants: 3, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 3;
    pallet(B, 0, 0);
    let top = 0.122;
    if (v === 1) { pallet(B, 0.122, B.r(-0.08, 0.08)); top = 0.244; }
    if (v === 2) {
      for (let i = 0; i < 4; i++) { const x = i % 2 ? 0.26 : -0.26, z = i < 2 ? -0.2 : 0.2; B.box('paint', shade('kraft', B.r(0.9, 1.05)), 0.5, 0.2, 0.36, x, top + 0.1, z, { round: true, r: 0.08, ry: B.r(-0.1, 0.1) }); }
      B.box('paint', shade('cream', 0.95), 0.52, 0.2, 0.38, 0, top + 0.3, 0, { round: true, r: 0.08, ry: 0.2 });
      top += 0.4;
    }
    B.col(-0.6, 0, -0.5, 0.6, top, 0.5); B.blob(1.6, 1.4);
  },
};

const TIRE = (() => { const p = [], Ri = 0.17, Ro = 0.33, hw = 0.1, rc = 0.045; const c = [[Ro - rc, hw - rc, 0], [Ri + rc * 0.6, hw - rc * 0.6, HP], [Ri + rc * 0.6, -hw + rc * 0.6, PI], [Ro - rc, -hw + rc, PI * 1.5]]; const rads = [rc, rc * 0.6, rc * 0.6, rc]; for (let q = 0; q < 4; q++) for (let k = 0; k <= 2; k++) { const a = c[q][2] + (k / 2) * HP; p.push([c[q][0] + Math.cos(a) * rads[q], c[q][1] + Math.sin(a) * rads[q]]); } return p; })();
D.tires = {
  desc: 'Tyre stack. variant 0 = three black tyres with painted rims, 1 = skatepark-painted stack of four, 2 = two stacked + one leaning.',
  params: { color: 'paint accent' }, variants: 3, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 3, seg = B.seg(15);
    const tire = (x, y, z, c, rx = 0, rz = 0, ry = 0) => {
      B.lathe('rubber', c, TIRE, x, y, z, { seg, closed: true, rx, rz, ry });
      if (c === 'rubber') B.tor('gloss', o.color ?? 'offwhite', 0.205, 0.014, x, y + 0.092, z, { rx: HP + rx, rs: 4, ts: 18, rz });
    };
    if (v === 0) { for (let i = 0; i < 3; i++) tire(B.r(-0.03, 0.03), 0.1 + i * 0.2, B.r(-0.03, 0.03), 'rubber'); B.col(-0.34, 0, -0.34, 0.34, 0.6, 0.34); }
    else if (v === 1) { const cs = ['teal', 'mustard', 'coral', 'lavender']; for (let i = 0; i < 4; i++) tire(B.r(-0.03, 0.03), 0.1 + i * 0.2, B.r(-0.03, 0.03), shade(cs[i], 0.75)); B.col(-0.34, 0, -0.34, 0.34, 0.8, 0.34); }
    else { tire(0, 0.1, 0, 'rubber'); tire(0.02, 0.3, 0, 'rubber'); tire(0.5, 0.31, 0.02, 'rubber', 0, -1.25); B.col(-0.34, 0, -0.34, 0.66, 0.6, 0.34); }
    B.blob(1.0, 1.0, v === 2 ? 0.2 : 0, 0);
  },
};

D.cone = {
  desc: 'Traffic cone: soft coral-orange glossy cone with two white reflective bands on a square rubber base.',
  params: { color: 'cone (cone)' }, variants: 1, mount: 'ground',
  build(B, o) {
    const c = o.color ?? 'cone';
    B.box('rubber', 'charcoal', 0.4, 0.04, 0.4, 0, 0.02, 0, { r: 0.018 });
    const rAt = (y) => 0.14 - ((y - 0.04) / 0.64) * 0.105;
    B.lathe('gloss', c, [[0, 0.04], [0.15, 0.04], [0.14, 0.07], [rAt(0.4), 0.4], [rAt(0.66), 0.66], [0.03, 0.695], [0, 0.7]], 0, 0, 0, { seg: 16 });
    for (const [a, b] of [[0.3, 0.38], [0.46, 0.52]]) B.lathe('gloss', 'offwhite', [[rAt(a) + 0.003, a], [rAt(b) + 0.003, b]], 0, 0, 0, { seg: 16 });
    B.col(-0.2, 0, -0.2, 0.2, 0.7, 0.2); B.blob(0.6, 0.6);
  },
};

const BARRIER_PLASTIC = [[-0.26, 0], [0.26, 0], [0.27, 0.035], [0.262, 0.1], [0.2, 0.2], [0.13, 0.64], [0.11, 0.74], [0.07, 0.8], [0, 0.815], [-0.07, 0.8], [-0.11, 0.74], [-0.13, 0.64], [-0.2, 0.2], [-0.262, 0.1], [-0.27, 0.035]];
const BARRIER_JERSEY = [[-0.3, 0], [0.3, 0], [0.305, 0.03], [0.3, 0.08], [0.2, 0.25], [0.11, 0.78], [0.08, 0.81], [-0.08, 0.81], [-0.11, 0.78], [-0.2, 0.25], [-0.3, 0.08], [-0.305, 0.03]];
D.barrier = {
  desc: 'Barriers along +X centred on pos. variant 0 = water-filled plastic barrier (glossy, fork slots, fill cap, reflectors), 1 = concrete jersey barrier with hazard stripes, 2 = steel crowd barrier.',
  params: { length: 'm (1.8)', color: 'body (coral / concrete / galv)' }, variants: 3, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 3, L = o.length ?? (v === 2 ? 2.2 : 1.8);
    if (v === 0) {
      const c = o.color ?? 'coral';
      B.add('gloss', G.extrude('bp', BARRIER_PLASTIC, L - 0.06, 0.04), c, 0, 0, 0);
      for (const sx of [-1, 1]) for (const yy of [0.62, 0.22]) B.cyl('gloss', c, 0.06, 0.07, sx * (L / 2 - 0.01), yy, 0, { rz: HP, seg: 10, bevel: 0.02 });
      for (const sx of [-0.28, 0.28]) B.box('paint', 'ink', 0.3, 0.09, 0.55, sx * L, 0.045, 0, { r: 0.02 });
      B.cyl('gloss', 'offwhite', 0.055, 0.03, -L * 0.3, 0.822, 0, { seg: 12, bevel: 0.01 });
      for (const sz of [-1, 1]) for (const sx of [-0.18, 0.18]) B.box('glow', 'offwhite', 0.14, 0.05, 0.01, sx * L, 0.52, sz * 0.15, { rx: -sz * 0.155, glow: 1.15, r: 0.004 });
      B.col(-L / 2, 0, -0.27, L / 2, 0.82, 0.27); B.blob(L + 0.3, 0.9);
    } else if (v === 1) {
      const c = o.color ?? 'concrete';
      B.add('paint', G.extrude('bj', BARRIER_JERSEY, L - 0.02, 0.035), c, 0, 0, 0);
      const ang = Math.atan2(0.53, 0.09);
      for (const sz of [-1, 1]) B.decal('hazard', L - 0.2, 0.2, 0, 0.62, sz * 0.14, { ry: sz > 0 ? 0 : PI, rx: -(HP - ang) * 1, tint: 'mustard' });
      B.col(-L / 2, 0, -0.31, L / 2, 0.81, 0.31); B.blob(L + 0.3, 0.9);
    } else {
      const c = o.color ?? 'galv', w = L - 0.1, y0 = 0.14, y1 = 1.08, rc = 0.08, ptsF = [];
      const corners = [[w / 2 - rc, y1 - rc, 0], [-w / 2 + rc, y1 - rc, HP], [-w / 2 + rc, y0 + rc, PI], [w / 2 - rc, y0 + rc, PI * 1.5]];
      for (const [cx, cy, a0] of corners) for (let k = 0; k <= 3; k++) { const a = a0 + (k / 3) * HP; ptsF.push(P3(cx + Math.cos(a) * rc, cy + Math.sin(a) * rc, 0)); }
      B.tube('metal', c, ptsF, 0.022, { closed: true, radial: 8, up: [0, 0, 1] });
      const nb = Math.round(w / 0.16);
      for (let k = 1; k < nb; k++) B.cyl('metal', c, 0.011, y1 - y0, -w / 2 + (k / nb) * w, (y0 + y1) / 2, 0, { seg: 6, open: true });
      for (const sx of [-1, 1]) { B.box('metal', c, 0.06, 0.025, 0.7, sx * (w / 2 - 0.08), 0.012, 0, { r: 0.01 }); B.cyl('metal', c, 0.02, y0, sx * (w / 2 - 0.08), y0 / 2, 0, { seg: 8 }); }
      B.col(-L / 2, 0, -0.35, L / 2, y1, 0.35); B.blob(L, 0.8);
    }
  },
};

D.lightpole = {
  desc: 'Tall flood-light pole on a concrete plinth. variant 0 = four-head stadium bar, 1 = two-head area light. Heads emissive ×4 (blooms).',
  params: { height: 'm (8)', color: 'pole (galv)' }, variants: 2, mount: 'ground',
  build(B, o) {
    const H = o.height ?? 8, v = (o.variant ?? 0) % 2, c = o.color ?? 'galv';
    B.box('paint', 'concrete', 0.62, 0.55, 0.62, 0, 0.275, 0, { round: true, r: 0.06 });
    B.lathe('metal', c, flangeProf(0.22, 0.04), 0, 0.55, 0, { seg: 16 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + PI / 4; B.cyl('metal', 'darksteel', 0.02, 0.05, Math.cos(a) * 0.17, 0.6, Math.sin(a) * 0.17, { seg: 6 }); }
    B.lathe('metal', c, [[0.13, 0.58], [0.125, 0.7], [0.075, H], [0.06, H + 0.02], [0, H + 0.03]], 0, 0, 0, { seg: 14 });
    B.box('metal', shade(c, 0.9), 0.1, 0.34, 0.03, 0, 1.4, 0.112, { r: 0.012 });
    const aw = v === 0 ? 1.8 : 1.0;
    B.box('metal', c, aw, 0.1, 0.1, 0, H - 0.1, 0.08, { r: 0.03 });
    B.box('metal', c, 0.06, 0.5, 0.06, -aw * 0.3, H - 0.32, 0.08, { rz: 0.9, r: 0.015 });
    B.box('metal', c, 0.06, 0.5, 0.06, aw * 0.3, H - 0.32, 0.08, { rz: -0.9, r: 0.015 });
    const xs = v === 0 ? [-0.66, -0.22, 0.22, 0.66] : [-0.34, 0.34];
    for (const x of xs) {
      B.push(x, H - 0.1, 0.17, 0, 0.55);
      B.box('metal', 'darksteel', 0.05, 0.16, 0.05, 0, -0.04, -0.03, { r: 0.012 });
      B.box('paint', 'charcoal', 0.38, 0.3, 0.16, 0, -0.14, 0.05, { round: true, r: 0.04 });
      B.add('glow', G.plane(0.31, 0.23), 'cream', 0, -0.14, 0.132, { glow: 4.2 });
      B.box('paint', 'charcoal', 0.4, 0.02, 0.1, 0, 0.02, 0.15, { rx: -0.15, r: 0.008 });
      B.pop();
    }
    B.col(-0.31, 0, -0.31, 0.31, H, 0.31); B.blob(1.2, 1.2);
  },
};

D.container_door = {
  desc: 'Shipping-container door end panel to stick on the end face of a container box (face at z=0, pos = bottom centre): corner posts, header/sill, twin ribbed leaves, four lock bars with cams + handles, hinges, KRAKEN LINES stencil.',
  params: { width: 'm (2.44)', height: 'm (2.59)', color: 'container paint (coral)' }, variants: 1, mount: 'wall',
  build(B, o) {
    const W = o.width ?? 2.44, H = o.height ?? 2.59, c = o.color ?? 'coraldark', dark = shade(c, 0.82);
    for (const sx of [-1, 1]) B.box('paint', dark, 0.15, H, 0.09, sx * (W / 2 - 0.075), H / 2, 0.045, { r: 0.02 });
    B.box('paint', dark, W, 0.2, 0.1, 0, H - 0.1, 0.05, { r: 0.025 });
    B.box('paint', dark, W, 0.13, 0.1, 0, 0.065, 0.05, { r: 0.025 });
    const lw = W / 2 - 0.16, ly0 = 0.13, ly1 = H - 0.2, lh = ly1 - ly0;
    for (const sx of [-1, 1]) {
      const lx = sx * (0.004 + lw / 2);
      B.box('paint', c, lw, lh, 0.04, lx, ly0 + lh / 2, 0.03, { r: 0.012 });
      for (let k = 0; k < 3; k++) B.box('paint', shade(c, 1.04), 0.13, lh - 0.36, 0.025, lx + (k - 1) * lw * 0.3, ly0 + lh / 2, 0.055, { r: 0.012 });
      for (const bo of [-0.3, 0.3]) {
        const bx = lx + bo * lw * 0.82;
        B.cyl('metal', 'galv', 0.02, H - 0.26, bx, H / 2, 0.095, { seg: 8 });
                for (const yy of [0.2, H - 0.26]) B.box('metal', 'darksteel', 0.09, 0.08, 0.06, bx, yy, 0.085, { r: 0.015 });
        B.push(bx, 1.15, 0.11, 0, 0, -sx * HP * 0.95); B.box('metal', 'galv', 0.035, 0.34, 0.03, 0, -0.17, 0, { r: 0.01 }); B.pop();
        B.box('metal', 'darksteel', 0.06, 0.06, 0.04, bx - sx * 0.33, 1.15, 0.1, { r: 0.012 });
      }
      for (let k = 0; k < 3; k++) B.cyl('metal', 'darksteel', 0.03, 0.16, sx * (W / 2 - 0.15), 0.4 + k * (H - 0.9) / 2, 0.075, { seg: 8 });
    }
    B.decal('stencil', lw * 0.8, lw * 0.4, 0.004 + lw / 2, H * 0.72, 0.06, { tint: 'offwhite' });
  },
};

const QP = (() => { const H = 0.95, R = 0.95, zc = -0.5 + R, p = [[-0.95, 0], [zc + 0.03, 0], [zc + 0.03, 0.012]]; for (let i = 8; i >= 0; i--) { const t = (i / 8) * HP; p.push([zc - R * Math.cos(t) + (i === 8 ? 0 : 0), H - R * Math.sin(t) + (i === 8 ? 0.012 : 0)]); } p.push([-0.95, H]); return p; })();
const KICK = (() => { const p = [[-0.6, 0], [0.62, 0], [0.62, 0.01]]; for (let i = 7; i >= 0; i--) { const t = i / 7; p.push([0.6 - 1.2 * (1 - t), 0.45 * Math.pow(1 - t, 1.6) + (i === 7 ? 0.01 : 0)]); } return p; })();
D.skateramp = {
  desc: 'Skatepark pieces facing +Z (ride side toward +Z). variant 0 = quarter-pipe with steel coping and deck, 1 = kicker ramp, 2 = grind box with steel edges. Painted side panels with SK8 tag.',
  params: { width: 'm along X (2.4)', color: 'side panels (lavender)' }, variants: 3, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 3, W = o.width ?? 2.4, sc = o.color ?? 'lavender';
    if (v === 2) {
      B.box('paint', 'concrete', W, 0.4, 0.62, 0, 0.2, 0, { round: true, r: 0.04 });
      for (const sz of [-1, 1]) B.cyl('metal', 'galv', 0.025, W - 0.02, 0, 0.4, sz * 0.3, { rz: HP, seg: 8 });
      B.box('paint', sc, W + 0.01, 0.12, 0.63, 0, 0.08, 0, { r: 0.02 });
      B.decal('tag', 0.9, 0.3, W * 0.2, 0.24, 0.312, { tint: 'offwhite' });
      B.col(-W / 2, 0, -0.31, W / 2, 0.42, 0.31); B.blob(W + 0.4, 1.0);
      return;
    }
    const prof = v === 0 ? QP : KICK, key = v === 0 ? 'qp' : 'kick';
    B.add('paint', G.extrude(key, prof, W - 0.1, 0.02), 'offwhite', 0, 0, 0);
    const side = offsetPoly(prof, 0.02);
    for (const sx of [-1, 1]) B.add('paint', G.extrude(key + 's', side, 0.07, 0.02), sc, sx * (W / 2 - 0.035), 0, 0);
    if (v === 0) {
      B.cyl('metal', 'galv', 0.032, W, 0, 0.955, -0.5, { rz: HP, seg: 10, bevel: 0.01 });
      B.box('metal', 'galv', W - 0.1, 0.012, 0.2, 0, 0.006, 0.55, { r: 0.004 });
      for (const sx of [-1, 1]) B.decal('tag', 0.7, 0.35, sx * (W / 2 + 0.003), 0.35, -0.55, { ry: sx * HP, tint: 'offwhite' });
      B.col(-W / 2, 0, -0.95, W / 2, 0.97, 0.5);
    } else {
      B.box('metal', 'galv', W - 0.1, 0.012, 0.16, 0, 0.006, 0.62, { r: 0.004 });
      B.col(-W / 2, 0, -0.6, W / 2, 0.45, 0.62);
    }
    B.blob(W + 0.4, v === 0 ? 1.8 : 1.5, 0, -0.1);
  },
};

D.buoy = {
  desc: 'variant 0 = glossy mooring ball with white band and lifting eye, 1 = channel-marker can buoy with cage and blinking lamp.',
  params: { color: 'body (coral)' }, variants: 2, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 2, c = o.color ?? 'coral';
    if (v === 0) {
      B.sph('gloss', c, 0.45, 0, 0.44, 0, { ws: 22, hs: 14 });
      const band = []; for (let i = 0; i <= 4; i++) { const a = -0.28 + (i / 4) * 0.56; band.push([Math.cos(a) * 0.455, 0.44 + Math.sin(a) * 0.455]); }
      B.lathe('gloss', 'offwhite', band, 0, 0, 0, { seg: 22 });
      B.cyl('metal', 'galv', 0.07, 0.06, 0, 0.9, 0, { seg: 10, bevel: 0.015 });
      B.tor('metal', 'galv', 0.07, 0.018, 0, 1.0, 0, { rs: 5, ts: 14 });
      B.col(-0.45, 0, -0.45, 0.45, 0.9, 0.45); B.blob(1.0, 1.0);
    } else {
      B.lathe('gloss', 'charcoal', [[0, 0], [0.5, 0], [0.54, 0.05], [0.54, 0.15], [0.5, 0.2], [0.3, 0.24], [0, 0.24]], 0, 0, 0, { seg: 20 });
      B.lathe('gloss', c, [[0, 0.24], [0.3, 0.24], [0.3, 0.9], [0.28, 0.95], [0, 0.96]], 0, 0, 0, { seg: 18 });
      B.cyl('gloss', 'offwhite', 0.302, 0.16, 0, 0.62, 0, { seg: 18, open: true });
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; B.tube('metal', 'galv', [P3(Math.cos(a) * 0.24, 0.94, Math.sin(a) * 0.24), P3(Math.cos(a) * 0.08, 1.5, Math.sin(a) * 0.08)], 0.02, { radial: 6 }); }
      B.tor('metal', 'galv', 0.18, 0.015, 0, 1.25, 0, { rx: HP, rs: 4, ts: 16 });
      B.cyl('paint', 'charcoal', 0.1, 0.05, 0, 1.52, 0, { seg: 12, bevel: 0.015 });
      B.sph('glow', 'mustard', 0.07, 0, 1.6, 0, { ws: 10, hs: 6, glow: 0.35, half: false });
      B.blink('#ffd36b', 0, 1.6, 0, { size: 0.075, rate: 0.5, lo: 0.3, hi: 6 });
      B.col(-0.54, 0, -0.54, 0.54, 1.65, 0.54); B.blob(1.3, 1.3);
    }
  },
};

const LIFERING = (() => {
  const g = new THREE.TorusGeometry(0.28, 0.068, 10, 32);
  const P = g.attributes.position, colr = new Float32Array(P.count * 3), a = col('coral'), b = col('offwhite');
  for (let i = 0; i < P.count; i++) {
    const ang = Math.atan2(P.getY(i), P.getX(i)) + TAU;
    const seg = Math.floor(((ang + PI / 8) / (TAU / 8))) % 2;
    const cc = seg ? b : a; colr[i * 3] = cc.r; colr[i * 3 + 1] = cc.g; colr[i * 3 + 2] = cc.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  return g;
})();
D.lifering = {
  desc: 'Harbor life ring (coral/white quarters, rope wraps) hung on a painted post with a little hood; faces +Z.',
  params: { color: 'post (offwhite)' }, variants: 1, mount: 'ground',
  build(B, o) {
    const c = o.color ?? 'offwhite';
    B.box('metal', 'darksteel', 0.26, 0.03, 0.26, 0, 0.015, 0, { r: 0.01 });
    B.box('gloss', c, 0.11, 1.55, 0.11, 0, 0.03 + 0.775, 0, { r: 0.03 });
    B.box('gloss', c, 0.76, 0.76, 0.04, 0, 1.12, 0.075, { round: true, r: 0.02 });
    B.box('gloss', 'navy', 0.86, 0.05, 0.18, 0, 1.52, 0.1, { rx: 0.2, r: 0.02 });
    B.cyl('metal', 'galv', 0.015, 0.12, 0, 1.42, 0.15, { rx: HP, seg: 6 });
    B.add('gloss', LIFERING, 'white', 0, 1.12, 0.17, {});
    for (let k = 0; k < 4; k++) { const a = PI / 4 + (k / 4) * TAU; B.tor('paint', 'cream', 0.075, 0.012, Math.cos(a) * 0.28, 1.12 + Math.sin(a) * 0.28, 0.17, { rz: a, ry: HP, rs: 4, ts: 10 }); }
    B.col(-0.4, 0, -0.08, 0.4, 1.58, 0.26); B.blob(0.7, 0.6);
  },
};

// ================================================================================================ street-level kit
// Posters, signage, bikes & scooters, skate gear, market stalls, food carts, picnic furniture, string lights, cables,
// utility cabinets, hydrants, news boxes, gas cages, dishes, rope / traps / nets, hose reels, pallet jacks, sandbags,
// A-frame boards, ferry boards, potted plants. All merged into the existing material buckets (no new draw calls).
const rod = (B, mat, c, a, b, r, radial = 6) => B.tube(mat, c, [a, b], r, { radial });
function arcPts(cx, cy, cz, R, a0, a1, n, plane = 'xy') {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n), c = Math.cos(a) * R, s = Math.sin(a) * R;
    out.push(plane === 'xy' ? P3(cx + c, cy + s, cz) : plane === 'xz' ? P3(cx + c, cy, cz + s) : P3(cx, cy + s, cz + c));
  }
  return out;
}
const pick = (B, arr) => arr[Math.floor(B.r(0, arr.length - 0.0001))];

// ---- striped fabric: parasol (cone + scalloped valance) and pitched stall canopy, vertex-coloured stripes, two-sided
function parasolGeo(R, h, n, cA, cB) {
  const g = new GB(), rows = [[0, h], [R * 0.5, h * 0.64], [R, 0]], sub = 3;
  const ca = col(cA), cb = col(cB), pk = [];
  const put = (x, y, z, nx, ny, nz, c, side) => { const i = g.v(x, y, z, nx * side, ny * side, nz * side, 0, 0, 1); pk.push(c); return i; };
  for (const side of [1, -1]) {
    const off = side > 0 ? 0 : -0.008;
    for (let i = 0; i < n; i++) {
      const c = i % 2;
      const ids = [];
      for (let r = 0; r < rows.length; r++) {
        const row = [];
        for (let k = 0; k <= sub; k++) {
          const a = ((i + k / sub) / n) * TAU, rr = rows[r][0], yy = rows[r][1];
          // gentle sag between ribs
          const sag = Math.sin((k / sub) * PI) * 0.04 * (r / 2);
          const ny = R / Math.hypot(R, h), nr = h / Math.hypot(R, h);
          row.push(put(Math.cos(a) * rr, yy - sag + off, Math.sin(a) * rr, Math.cos(a) * nr, ny, Math.sin(a) * nr, c, side));
        }
        ids.push(row);
      }
      for (let r = 0; r < rows.length - 1; r++) for (let k = 0; k < sub; k++) g.quad(ids[r][k], ids[r][k + 1], ids[r + 1][k + 1], ids[r + 1][k]);
      // scalloped valance
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, am = (a0 + a1) / 2, vh = 0.11;
      const q = [];
      for (const a of [a0, a1]) for (const y of [0, -vh]) q.push(put(Math.cos(a) * R * 1.001, y + off, Math.sin(a) * R * 1.001, Math.cos(a), 0, Math.sin(a), c, side));
      g.quad(q[0], q[2], q[3], q[1]);
      const cen = put(Math.cos(am) * R, -vh + off, Math.sin(am) * R, Math.cos(am), 0, Math.sin(am), c, side), arc = [];
      for (let k = 0; k <= 6; k++) { const a = a0 + (a1 - a0) * (k / 6), dy = Math.sin((k / 6) * PI) * 0.07; arc.push(put(Math.cos(a) * R, -vh - dy + off, Math.sin(a) * R, Math.cos(a), 0, Math.sin(a), c, side)); }
      for (let k = 0; k < 6; k++) g.tri(cen, arc[k], arc[k + 1]);
    }
  }
  const geo = g.geo(), C = geo.attributes.color, N = geo.attributes.normal;
  for (let i = 0; i < C.count; i++) { const cc = pk[i] ? cb : ca, k = N.getY(i) < -0.2 ? 0.8 : 1; C.setXYZ(i, cc.r * k, cc.g * k, cc.b * k); }
  return geo;
}
function parasol(B, x, z, y0, H, R, cA = 'coral', cB = 'offwhite', n = 8) {
  B.cyl('metal', 'galv', 0.022, H, x, y0 + H / 2, z, { seg: 8 });
  B.add('paint', tpl('parasol|' + [R, n, cA, cB].map(kf).join('|'), () => parasolGeo(R, 0.42, n, cA, cB)), 'white', x, y0 + H - 0.4, z, {});
  B.sph('gloss', cA, 0.04, x, y0 + H + 0.04, z, { ws: 8, hs: 6 });
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; B.tube('metal', 'galv', [P3(x, y0 + H - 0.62, z), P3(x + Math.cos(a) * R * 0.5, y0 + H - 0.14, z + Math.sin(a) * R * 0.5)], 0.007, { radial: 3 }); }
  B.cyl('metal', 'darksteel', 0.035, 0.08, x, y0 + H - 0.62, z, { seg: 8 });
}
// pitched canopy over a W×D footprint (ridge along X), stripes along X, scalloped valance front + back
function canopyGeo(W, D, rise, cA, cB) {
  const g = new GB(), ns = Math.max(4, Math.round(W / 0.26)), sw = W / ns, ca = col(cA), cb = col(cB), pk = [];
  const put = (x, y, z, nx, ny, nz, c) => { const i = g.v(x, y, z, nx, ny, nz); pk.push(c); return i; };
  for (const side of [1, -1]) {
    const off = side > 0 ? 0 : -0.007;
    for (const zs of [-1, 1]) {
      const l = Math.hypot(D / 2, rise), ny = (D / 2) / l * side, nz = zs * rise / l * side;
      for (let j = 0; j < ns; j++) {
        const x0 = -W / 2 + j * sw, x1 = x0 + sw, c = j % 2;
        const a = put(x0, rise + off, 0, 0, ny, nz, c), b = put(x1, rise + off, 0, 0, ny, nz, c);
        const d = put(x1, off, zs * D / 2, 0, ny, nz, c), e = put(x0, off, zs * D / 2, 0, ny, nz, c);
        g.quad(a, b, d, e);
        // valance flap with scallop
        const vh = 0.13, zf = zs * (D / 2 + 0.002 * side);
        const q0 = put(x0, off, zf, 0, 0, zs * side, c), q1 = put(x1, off, zf, 0, 0, zs * side, c);
        const q2 = put(x1, -vh + off, zf, 0, 0, zs * side, c), q3 = put(x0, -vh + off, zf, 0, 0, zs * side, c);
        g.quad(q0, q1, q2, q3);
        const cen = put((x0 + x1) / 2, -vh + off, zf, 0, 0, zs * side, c), arc = [];
        for (let k = 0; k <= 6; k++) { const t = PI + (k / 6) * PI; arc.push(put((x0 + x1) / 2 - Math.cos(t) * sw / 2, -vh + Math.sin(t) * sw * 0.42 + off, zf, 0, 0, zs * side, c)); }
        for (let k = 0; k < 6; k++) g.tri(cen, arc[k], arc[k + 1]);
      }
    }
  }
  const geo = g.geo(), C = geo.attributes.color, N = geo.attributes.normal;
  for (let i = 0; i < C.count; i++) { const cc = pk[i] ? cb : ca, k = N.getY(i) < -0.2 ? 0.78 : 1; C.setXYZ(i, cc.r * k, cc.g * k, cc.b * k); }
  return geo;
}

// ---- a flat print on a wall (z = 0): backing sheet, the print, tape or staples
function paperSheet(B, name, w, h, x, y, z, rz = 0, tape = 'corners') {
  B.push(x, y, z, 0, 0, rz);
  B.box('paint', 'offwhite', w + 0.016, h + 0.016, 0.004, 0, 0, 0.002, { r: 0.0015 });
  B.decal(name, w, h, 0, 0, 0.0065, { tint: shade('white', 0.98) });
  if (tape === 'corners') {
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) B.box('paint', mixc('cream', 'white', 0.4), 0.075, 0.024, 0.002, sx * (w / 2 - 0.012), sy * (h / 2 - 0.008), 0.0085, { rz: sx * sy * 0.72, r: 0.0008 });
  } else if (tape === 'staples') {
    for (const [sx, sy] of [[-1, 1], [1, 1], [0, 1], [-1, -1], [1, -1]]) B.box('metal', 'galv', 0.018, 0.004, 0.003, sx * (w / 2 - 0.03), sy * (h / 2 - 0.03), 0.009, { r: 0.001 });
  }
  B.pop();
}

D.poster = {
  desc: 'Paper posters on a wall (z = 0). variant 0–11 = event / notice posters, 12 = wide INK THE TOWN print, 13 = torn remnants. count > 1 pastes up an overlapping cluster with stickers and torn scraps.',
  params: { count: '1–6 (1)', seed: 'layout' }, variants: 14, mount: 'wall',
  build(B, o) {
    B.aoBase = null;
    const n = Math.max(1, Math.min(6, o.count ?? 1)), v0 = (o.variant ?? 0) % 14;
    const one = (v, x, y, z, rz) => {
      if (v === 12) paperSheet(B, 'pw0', 1.5, 0.75, x, y, z, rz, 'staples');
      else if (v === 13) paperSheet(B, 'torn', 0.34, 0.51, x, y, z, rz, 'none');
      else paperSheet(B, 'pst' + v, 0.56, 0.84, x, y, z, rz, B.r() < 0.5 ? 'corners' : 'staples');
    };
    if (n === 1) { one(v0, 0, 0, 0, B.r(-0.03, 0.03)); return; }
    let x = -(n - 1) * 0.3, z = 0;
    for (let i = 0; i < n; i++) {
      const v = i === 0 ? v0 : (v0 + i * 5) % 12;
      one(v, x + B.r(-0.05, 0.05), B.r(-0.08, 0.08), z, B.r(-0.05, 0.05));
      x += 0.56 + B.r(-0.02, 0.05); z += 0.004;
    }
    const W = n * 0.6;
    for (let k = 0; k < 2 + n; k++) { const s = B.r(0.08, 0.12); B.decal('stk' + Math.floor(B.r(0, 15.99)), s, s, B.r(-W / 2, W / 2), B.r(-0.55, 0.6), z + 0.004 + k * 0.0012, { rz: B.r(-0.5, 0.5) }); }
    paperSheet(B, 'torn', 0.26, 0.39, -W / 2 - 0.1, -0.3, 0.002, B.r(-0.1, 0.1), 'none');
  },
};

D.stickers = {
  desc: 'A scatter of original vinyl stickers on a wall / post (z = 0) within width × height.',
  params: { count: '(8)', width: 'm (1.2)', height: 'm (0.8)' }, variants: 1, mount: 'wall',
  build(B, o) {
    B.aoBase = null;
    const n = o.count ?? 8, W = o.width ?? 1.2, H = o.height ?? 0.8;
    for (let k = 0; k < n; k++) { const s = B.r(0.075, 0.13); B.decal('stk' + Math.floor(B.r(0, 15.99)), s, s, B.r(-W / 2, W / 2), B.r(-H / 2, H / 2), 0.004 + k * 0.0012, { rz: B.r(-0.6, 0.6) }); }
  },
};

D.streetsign = {
  desc: 'Harbor / road sign (variant: 0 no swimming, 1 slippery, 2 high voltage, 3 deep water, 4 P 2HR, 5 no entry, 6 WET INK, 7 2.0 m clearance). Galvanised pole with clamp bands on a foot; wall:true mounts the plate flat on a wall (z = 0).',
  params: { wall: 'bool', height: 'm plate centre (2.05)', size: 'm plate (0.56)' }, variants: 8, mount: 'ground|wall',
  build(B, o) {
    const v = (o.variant ?? 0) % 8, S = o.size ?? 0.56, wall = !!o.wall;
    if (wall) {
      B.aoBase = null;
      B.decal('sg' + v, S, S, 0, 0, 0.012);
      B.decal('sg' + v, S * 1.02, S * 1.02, 0, 0, 0.006, { tint: shade('galv', 0.85) });
      for (const sx of [-1, 1]) B.cyl('metal', 'galv', 0.012, 0.012, sx * S * 0.2, S * 0.2, 0.016, { rx: HP, seg: 6 });
      return;
    }
    const H = o.height ?? 2.05;
    B.lathe('paint', 'concrete', [[0, 0], [0.14, 0], [0.15, 0.03], [0.12, 0.08], [0, 0.08]], 0, 0, 0, { seg: 12 });
    B.cyl('metal', 'galv', 0.03, H + S * 0.5 - 0.08, 0, 0.08 + (H + S * 0.5 - 0.08) / 2, 0, { seg: 10 });
    B.cyl('metal', 'darksteel', 0.034, 0.02, 0, H + S * 0.5 + 0.005, 0, { seg: 10 });
    for (const dy of [-S * 0.28, S * 0.28]) { B.cyl('metal', 'darksteel', 0.036, 0.035, 0, H + dy, 0, { seg: 10 }); B.box('metal', 'darksteel', 0.05, 0.03, 0.05, 0, H + dy, 0.035, { r: 0.008 }); }
    B.decal('sg' + v, S, S, 0, H, 0.068);
    B.decal('sg' + v, S * 1.02, S * 1.02, 0, H, 0.062, { tint: shade('galv', 0.85) });
    B.decal('sg' + v, S * 1.02, S * 1.02, 0, H, 0.061, { ry: PI, tint: shade('galv', 0.9) });
    B.decal('stk' + ((v * 3) % 16), 0.07, 0.07, 0.012, 1.1, 0.031, { rz: 0.3 });
    B.col(-0.07, 0, -0.07, 0.07, H, 0.07); B.blob(0.45, 0.45);
  },
};

// fingerpost blade: arrow-shaped board + print; back shows a partner print pointing the same way (or plain paint)
const BLADE = [
  { right: false, bg: '#f4ecd8', back: 1 }, { right: true, bg: '#f4ecd8', back: 0 }, { right: true, bg: '#3f9f97', back: 7 }, { right: false, bg: '#e2b64c', back: -1 },
  { right: true, bg: '#df7c66', back: -1 }, { right: false, bg: '#2f3a57', back: -1 }, { right: true, bg: '#f4ecd8', back: 0 }, { right: false, bg: '#3f9f97', back: 2 },
];
D.fingerpost = {
  desc: 'Harbor wayfinding fingerpost: fluted post with collar rings and ball finial, 2–4 arrow blades (PIER 3, FERRY, SKATE PARK, BEACH, MARKET, TERMINAL B, LIGHTHOUSE, KELP ISLE) pointing different ways.',
  params: { count: '1–4 (3)', height: 'm (2.7)', variant: 'first blade' }, variants: 8, mount: 'ground',
  build(B, o) {
    const n = Math.max(1, Math.min(4, o.count ?? 3)), H = o.height ?? 2.7, v0 = (o.variant ?? 0) % 8;
    B.lathe('paint', 'concrete', [[0, 0], [0.2, 0], [0.21, 0.03], [0.16, 0.1], [0, 0.1]], 0, 0, 0, { seg: 14 });
    B.lathe('gloss', 'navy', [[0.075, 0.1], [0.07, 0.24], [0.052, 0.3], [0.05, H], [0.058, H + 0.02], [0.045, H + 0.05], [0, H + 0.05]], 0, 0, 0, { seg: 12 });
    for (const y of [0.3, 1.1, H - 0.02]) B.cyl('gloss', 'mustard', 0.06, 0.03, 0, y, 0, { seg: 12, bevel: 0.008 });
    B.sph('gloss', 'mustard', 0.075, 0, H + 0.12, 0, { ws: 12, hs: 8 });
    const L = 0.86, Hb = 0.2, tip = 0.1, T = 0.028;
    const angs = [0.25, 2.2, -1.35, 3.8];
    for (let i = 0; i < n; i++) {
      const bi = (v0 + i * 3) % 8, bd = BLADE[bi], dir = bd.right ? 1 : -1;
      B.push(0, H - 0.22 - i * 0.26, 0, angs[i] + B.r(-0.08, 0.08));
      const prof = [[-L / 2, -Hb / 2], [L / 2 - tip, -Hb / 2], [L / 2, 0], [L / 2 - tip, Hb / 2], [-L / 2, Hb / 2]].map((p) => [p[0] * dir, p[1]]);
      if (dir < 0) prof.reverse();
      const cx = dir * (L / 2 + 0.05);
      B.add('paint', G.extrude('blade' + dir, prof, T, 0.006), bd.bg, cx, 0, 0, { ry: HP });
      B.decal('bl' + bi, L + 0.02, Hb + 0.035, cx, 0, T / 2 + 0.003);
      if (bd.back >= 0) B.decal('bl' + bd.back, L + 0.02, Hb + 0.035, cx, 0, -T / 2 - 0.003, { ry: PI });
      B.box('metal', 'darksteel', 0.12, 0.05, 0.05, dir * 0.07, 0, 0, { r: 0.01 });
      B.pop();
    }
    B.col(-0.09, 0, -0.09, 0.09, H, 0.09); B.blob(0.55, 0.55);
  },
};

// ---- bikes & scooters
function wheel(B, x, y, z, R, c, spokes = 14) {
  B.tor('rubber', 'rubber', R - 0.018, 0.022, x, y, z, { rs: 6, ts: 22 });
  B.tor('metal', c ?? 'galv', R - 0.042, 0.009, x, y, z, { rs: 4, ts: 22 });
  B.cyl('metal', 'galv', 0.022, 0.1, x, y, z, { rx: HP, seg: 8 });
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * TAU, s = k % 2 ? 1 : -1;
    B.tube('metal', 'galv', [P3(x, y, z + s * 0.035), P3(x + Math.cos(a) * (R - 0.05), y + Math.sin(a) * (R - 0.05), z + s * 0.004)], 0.0026, { radial: 3 });
  }
}
function bike(B, frame, basket = false) {
  const R = 0.33, rw = P3(-0.5, R, 0), fw = P3(0.52, R, 0), bb = P3(-0.05, 0.3, 0);
  const st = P3(-0.2, 0.86, 0), ht = P3(0.38, 0.9, 0), hb = P3(0.43, 0.72, 0);
  wheel(B, rw[0], rw[1], 0, R); wheel(B, fw[0], fw[1], 0, R);
  const fr = (a, b, r = 0.018) => rod(B, 'gloss', frame, a, b, r, 7);
  fr(bb, st, 0.02); fr(st, ht, 0.017); fr(bb, hb, 0.022); fr(hb, ht, 0.024);
  for (const s of [-1, 1]) { fr(P3(bb[0], bb[1], s * 0.03), P3(rw[0], rw[1], s * 0.05), 0.011); fr(P3(st[0] + 0.03, st[1] - 0.08, s * 0.02), P3(rw[0], rw[1], s * 0.05), 0.01); }
  for (const s of [-1, 1]) fr(P3(hb[0], hb[1], s * 0.03), P3(fw[0], fw[1], s * 0.05), 0.012);
  // seat post, saddle, stem, bars
  rod(B, 'metal', 'galv', st, P3(st[0] - 0.04, st[1] + 0.12, 0), 0.012);
  B.box('gloss', 'charcoal', 0.26, 0.055, 0.15, st[0] - 0.06, st[1] + 0.15, 0, { round: true, r: 0.025 });
  rod(B, 'metal', 'galv', ht, P3(ht[0] - 0.03, ht[1] + 0.12, 0), 0.013);
  const hy = ht[1] + 0.12;
  B.tube('metal', 'galv', [P3(ht[0] - 0.03, hy, -0.27), P3(ht[0] + 0.02, hy, -0.12), P3(ht[0] + 0.02, hy, 0.12), P3(ht[0] - 0.03, hy, 0.27)], 0.011, { radial: 6 });
  for (const s of [-1, 1]) { B.cyl('rubber', 'rubber', 0.017, 0.11, ht[0] - 0.035, hy, s * 0.24, { rx: HP, seg: 8 }); B.tube('metal', 'darksteel', [P3(ht[0] + 0.01, hy, s * 0.18), P3(ht[0] + 0.07, hy - 0.02, s * 0.2)], 0.005, { radial: 3 }); }
  // drivetrain
  B.tor('metal', 'darksteel', 0.1, 0.008, bb[0], bb[1], 0.055, { rs: 3, ts: 18 });
  B.cyl('metal', 'galv', 0.03, 0.02, bb[0], bb[1], 0.055, { rx: HP, seg: 10 });
  B.tor('metal', 'darksteel', 0.04, 0.006, rw[0], rw[1], 0.055, { rs: 3, ts: 12 });
  rod(B, 'metal', 'darksteel', P3(bb[0], bb[1] + 0.1, 0.055), P3(rw[0], rw[1] + 0.04, 0.055), 0.004, 3);
  rod(B, 'metal', 'darksteel', P3(bb[0], bb[1] - 0.1, 0.055), P3(rw[0], rw[1] - 0.04, 0.055), 0.004, 3);
  for (const s of [-1, 1]) { const px = bb[0] + s * 0.13, py = bb[1] - s * 0.05; rod(B, 'metal', 'galv', P3(bb[0], bb[1], s * 0.07), P3(px, py, s * 0.08), 0.009, 5); B.box('rubber', 'rubber', 0.1, 0.025, 0.08, px, py, s * 0.12, { r: 0.008 }); }
  // mudguards + chain guard + kickstand + lamp
  B.tube('gloss', frame, arcPts(rw[0], rw[1], 0, R + 0.03, 0.2, PI - 0.4, 9), 0.02, { radial: 6 });
  B.tube('gloss', frame, arcPts(fw[0], fw[1], 0, R + 0.03, 0.5, PI - 0.1, 9), 0.02, { radial: 6 });
  rod(B, 'metal', 'darksteel', P3(bb[0] - 0.08, bb[1] - 0.01, -0.05), P3(bb[0] - 0.22, 0.01, -0.17), 0.01, 4);
  B.cyl('gloss', 'offwhite', 0.035, 0.05, ht[0] + 0.07, ht[1] - 0.04, 0, { rz: HP, seg: 10 });
  B.cyl('glow', 'cream', 0.03, 0.005, ht[0] + 0.097, ht[1] - 0.04, 0, { rz: HP, seg: 10, glow: 1.6 });
  B.box('glow', 'coral', 0.02, 0.03, 0.05, rw[0] - 0.36, rw[1] + 0.3, 0, { glow: 1.3, r: 0.006 });
  if (basket) {
    B.push(fw[0] + 0.04, ht[1] - 0.03, 0);
    for (const [w, h, x, y, z, ry] of [[0.3, 0.22, 0, 0.11, 0.17, 0], [0.3, 0.22, 0, 0.11, -0.17, 0], [0.34, 0.22, 0.15, 0.11, 0, HP], [0.34, 0.22, -0.15, 0.11, 0, HP]]) B.add('fence', G.plane(w, h), 'galv', x, y, z, { ry, uvs: [w / 0.08, h / 0.08] });
    B.add('fence', G.plane(0.3, 0.34), 'galv', 0, 0.005, 0, { rx: -HP, uvs: [4, 4] });
    B.tube('metal', 'galv', [P3(-0.15, 0.22, -0.17), P3(0.15, 0.22, -0.17), P3(0.15, 0.22, 0.17), P3(-0.15, 0.22, 0.17)], 0.008, { radial: 4, closed: true });
    B.box('paint', 'kraft', 0.2, 0.12, 0.14, 0.01, 0.1, 0.02, { round: true, r: 0.02, ry: 0.3 });
    B.pop();
  }
}
const BIKE_COLS = ['teal', 'coral', 'mustard', 'lavender', 'sky', 'mint', 'pink', 'navy'];
D.bike = {
  desc: 'City bicycle along local +X (front wheel +X): spoked wheels, diamond frame, saddle, bars with grips, chainring + chain, pedals, mudguards, lamp, kickstand; leans on its stand. variant 1 adds a wire front basket with a parcel.',
  params: { color: 'frame (seeded accent)' }, variants: 2, mount: 'ground',
  build(B, o) {
    const c = o.color ?? pick(B, BIKE_COLS);
    B.push(0, 0, 0, 0, 0.09);
    bike(B, c, (o.variant ?? 0) % 2 === 1);
    B.pop();
    if (o.solid !== false) B.col(-0.85, 0, -0.3, 0.9, 1.05, 0.3);
    B.blob(1.9, 0.6);
  },
};
D.bikerack = {
  desc: 'Row of galvanised hoop bike stands (hoops across Z, spaced along +X) with bikes parked alongside some of them.',
  params: { count: 'hoops (3)', bikes: 'parked bikes (2)' }, variants: 1, mount: 'ground',
  build(B, o) {
    const n = Math.max(1, o.count ?? 3), nb = Math.min(n, o.bikes ?? 2), sp = 0.85;
    for (let i = 0; i < n; i++) {
      const x = i * sp;
      B.tube('metal', 'galv', [P3(x, 0, -0.34), ...arcPts(x, 0.62, 0, 0.34, PI, 0, 10, 'yz'), P3(x, 0, 0.34)], 0.024, { radial: 8 });
      for (const s of [-1, 1]) B.cyl('metal', 'darksteel', 0.05, 0.012, x, 0.006, s * 0.34, { seg: 10 });
      B.cyl('gloss', 'mustard', 0.026, 0.05, x, 0.72, 0.18, { rz: 0, seg: 8 });
    }
    for (let k = 0; k < nb; k++) {
      const i = Math.min(n - 1, Math.round((k + 0.5) * n / nb - 0.5));
      B.push(i * sp + 0.2, 0, B.r(-0.05, 0.05), HP + (k % 2 ? PI : 0) + B.r(-0.05, 0.05), 0.04);
      bike(B, pick(B, BIKE_COLS), B.r() < 0.4);
      B.pop();
    }
    B.col(-0.25, 0, -0.95, (n - 1) * sp + 0.45, 1.05, 0.95);
    B.blob(n * sp + 0.6, 2.0, (n - 1) * sp / 2, 0);
  },
};
D.scooter = {
  desc: 'variant 0 = kick scooter leaning on its stand (grip-taped deck, T-bar, small wheels); 1 = rental moped (rounded body, leg shield, seat, headlight, mirrors, rear rack, RIDE ME QR sticker). Faces +X.',
  params: { color: 'body (mint / sky)' }, variants: 2, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 2;
    if (v === 0) {
      const c = o.color ?? pick(B, ['mint', 'coral', 'sky', 'lavender']);
      B.push(0, 0, 0, 0, 0.12);
      for (const x of [-0.3, 0.32]) { B.cyl('rubber', 'offwhite', 0.06, 0.035, x, 0.06, 0, { rx: HP, seg: 14, bevel: 0.012 }); B.cyl('metal', 'galv', 0.02, 0.045, x, 0.06, 0, { rx: HP, seg: 8 }); }
      B.box('gloss', c, 0.58, 0.035, 0.13, 0, 0.1, 0, { round: true, r: 0.015 });
      B.box('rubber', 'ink', 0.5, 0.004, 0.11, 0, 0.119, 0, { r: 0.002 });
      B.tube('gloss', c, [P3(0.26, 0.1, 0), P3(0.33, 0.16, 0), P3(0.33, 0.9, 0)], 0.018, { radial: 7 });
      B.tube('metal', 'galv', [P3(0.33, 0.9, -0.2), P3(0.33, 0.9, 0.2)], 0.013, { radial: 6 });
      for (const s of [-1, 1]) B.cyl('rubber', 'charcoal', 0.019, 0.08, 0.33, 0.9, s * 0.17, { rx: HP, seg: 8 });
      B.tube('gloss', c, arcPts(-0.3, 0.06, 0, 0.08, 0.2, PI * 0.9, 6), 0.012, { radial: 5 });
      B.pop();
      B.tube('metal', 'darksteel', [P3(-0.05, 0.09, -0.06), P3(-0.15, 0.005, -0.15)], 0.007, { radial: 4 });
      B.col(-0.4, 0, -0.18, 0.42, 0.9, 0.18); B.blob(0.9, 0.45);
      return;
    }
    const c = o.color ?? pick(B, ['mint', 'sky', 'coral', 'mustard']);
    B.push(0, 0, 0, 0, 0.06);
    for (const x of [-0.5, 0.52]) { B.cyl('rubber', 'rubber', 0.2, 0.09, x, 0.2, 0, { rx: HP, seg: 18, bevel: 0.035 }); B.cyl('metal', 'galv', 0.11, 0.1, x, 0.2, 0, { rx: HP, seg: 12 }); }
    B.box('gloss', c, 0.78, 0.36, 0.34, -0.3, 0.52, 0, { round: true, r: 0.14 });
    B.box('gloss', c, 0.5, 0.1, 0.3, 0.12, 0.32, 0, { round: true, r: 0.04 });
    B.box('gloss', c, 0.12, 0.62, 0.36, 0.4, 0.62, 0, { round: true, r: 0.05, rz: 0.22 });
    B.box('gloss', mixc(c, 'ink', 0.1), 0.26, 0.26, 0.2, 0.55, 0.3, 0, { round: true, r: 0.08 });
    B.box('gloss', 'charcoal', 0.62, 0.1, 0.28, -0.34, 0.75, 0, { round: true, r: 0.045 });
    B.box('metal', 'galv', 0.3, 0.02, 0.24, -0.7, 0.72, 0, { r: 0.008 });
    B.box('paint', 'kraft', 0.26, 0.18, 0.22, -0.7, 0.83, 0, { round: true, r: 0.03 });
    B.tube('metal', 'galv', [P3(0.44, 0.9, 0), P3(0.47, 1.05, 0)], 0.022, { radial: 8 });
    B.box('gloss', c, 0.16, 0.12, 0.2, 0.49, 1.07, 0, { round: true, r: 0.045 });
    B.cyl('glow', 'cream', 0.05, 0.02, 0.575, 1.07, 0, { rz: HP, seg: 12, glow: 1.8 });
    B.tube('metal', 'galv', [P3(0.47, 1.1, -0.34), P3(0.47, 1.1, 0.34)], 0.014, { radial: 6 });
    for (const s of [-1, 1]) { B.cyl('rubber', 'charcoal', 0.02, 0.1, 0.47, 1.1, s * 0.3, { rx: HP, seg: 8 }); B.tube('metal', 'darksteel', [P3(0.47, 1.12, s * 0.22), P3(0.44, 1.28, s * 0.28)], 0.006, { radial: 3 }); B.box('gloss', 'charcoal', 0.03, 0.06, 0.09, 0.44, 1.31, s * 0.29, { round: true, r: 0.015 }); }
    B.decal('qr', 0.16, 0.16, -0.3, 0.52, 0.172);
    B.decal('stk' + Math.floor(B.r(0, 15.99)), 0.09, 0.09, 0.2, 0.52, 0.172, { rz: 0.3 });
    B.box('glow', 'coral', 0.03, 0.05, 0.14, -0.69, 0.6, 0, { glow: 1.4, r: 0.01 });
    B.pop();
    B.tube('metal', 'darksteel', [P3(-0.25, 0.15, -0.12), P3(-0.35, 0.005, -0.2)], 0.01, { radial: 4 });
    B.col(-0.78, 0, -0.26, 0.76, 1.2, 0.26); B.blob(1.7, 0.7);
  },
};

// ---- skate
function skateboard(B, deck, wheelC) {
  B.box('gloss', deck, 0.56, 0.016, 0.2, 0, 0.11, 0, { round: true, r: 0.007 });
  for (const s of [-1, 1]) B.box('gloss', deck, 0.14, 0.016, 0.2, s * 0.335, 0.125, 0, { round: true, r: 0.007, rz: s * 0.28 });
  B.box('rubber', 'ink', 0.54, 0.003, 0.18, 0, 0.12, 0, { r: 0.001 });
  for (const s of [-1, 1]) {
    B.box('metal', 'galv', 0.06, 0.03, 0.07, s * 0.2, 0.087, 0, { r: 0.008 });
    B.cyl('metal', 'galv', 0.008, 0.2, s * 0.2, 0.06, 0, { rx: HP, seg: 6 });
    for (const zs of [-1, 1]) B.cyl('rubber', wheelC, 0.03, 0.035, s * 0.2, 0.052, zs * 0.105, { rx: HP, seg: 12, bevel: 0.008 });
  }
}
D.skateboard = {
  desc: 'Skateboard (popsicle deck with kicked nose/tail, grip tape, trucks, urethane wheels). variant 0 lying flat, 1 leaning up against a wall behind it (-Z), 2 flipped wheels-up with a scuffed graphic.',
  params: { color: 'deck (seeded)' }, variants: 3, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 3, deck = o.color ?? pick(B, ['coral', 'teal', 'lavender', 'mustard', 'sky']), wc = pick(B, ['mint', 'cream', 'pink', 'offwhite']);
    if (v === 0) { B.push(0, -0.022, 0); skateboard(B, deck, wc); B.pop(); B.blob(0.9, 0.35); return; }
    if (v === 1) { B.push(0, 0.02, -0.08, HP, -1.2); skateboard(B, deck, wc); B.pop(); B.blob(0.5, 0.4, 0, -0.05); return; }
    B.push(0, 0.155, 0, 0, 0, PI); skateboard(B, deck, wc); B.pop();
    B.decal('tag', 0.44, 0.17, 0, 0.056, 0, { rx: -HP, tint: 'offwhite' });
    B.blob(0.9, 0.35);
  },
};
D.skaterail = {
  desc: 'Low flat-bar grind rail on two posts with steel feet (along +X), scuffed and stickered.',
  params: { length: 'm (2.6)', height: 'm (0.36)' }, variants: 1, mount: 'ground',
  build(B, o) {
    const L = o.length ?? 2.6, H = o.height ?? 0.36;
    B.box('metal', 'galv', L, 0.05, 0.05, L / 2, H, 0, { r: 0.01 });
    for (const x of [0.25, L - 0.25]) { B.box('gloss', 'mustard', 0.05, H - 0.03, 0.05, x, (H - 0.03) / 2, 0, { r: 0.01 }); B.box('metal', 'darksteel', 0.22, 0.012, 0.3, x, 0.006, 0, { r: 0.004 }); }
    B.decal('stk5', 0.08, 0.08, 0.25, H * 0.5, 0.027, { rz: 0.2 });
    B.col(0, 0, -0.1, L, H + 0.03, 0.1); B.blob(L + 0.3, 0.5, L / 2, 0);
  },
};

// ---- market stall + food carts + picnic + deck chairs
const STALL = [{ head: 'stall0', a: 'teal', b: 'offwhite', goods: 'fish' }, { head: 'stall1', a: 'mint', b: 'offwhite', goods: 'fruit' }, { head: 'stall2', a: 'lavender', b: 'offwhite', goods: 'merch' }];
D.stall = {
  desc: 'Harbor market stall (front faces +Z): striped pitched canopy with scalloped valance on four posts, header sign, timber counter with goods (0 fish on ice, 1 fruit & veg crates, 2 tees + caps), chalk price boards, hanging lanterns, crates behind.',
  params: { width: 'm (2.4)' }, variants: 3, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 3, S = STALL[v], W = o.width ?? 2.4, Dd = 1.3, Hc = 0.92, Hp = 2.25;
    for (const [x, z] of [[-W / 2, -Dd / 2], [W / 2, -Dd / 2], [-W / 2, Dd / 2], [W / 2, Dd / 2]]) {
      B.box('metal', 'galv', 0.05, Hp, 0.05, x, Hp / 2, z, { r: 0.012 });
      B.box('metal', 'darksteel', 0.16, 0.02, 0.16, x, 0.01, z, { r: 0.005 });
    }
    for (const z of [-Dd / 2, Dd / 2]) B.box('metal', 'galv', W + 0.05, 0.04, 0.04, 0, Hp, z, { r: 0.01 });
    for (const x of [-W / 2, W / 2]) B.box('metal', 'galv', 0.04, 0.04, Dd, x, Hp, 0, { r: 0.01 });
    B.add('paint', tpl('canopy|' + [W + 0.3, Dd + 0.35, S.a].map(kf).join('|'), () => canopyGeo(W + 0.3, Dd + 0.35, 0.34, S.a, S.b)), 'white', 0, Hp + 0.02, 0, {});
    B.box('paint', 'offwhite', 1.5, 0.42, 0.05, 0, Hp + 0.62, Dd / 2 + 0.2, { round: true, r: 0.02 });
    B.decal(S.head, 1.44, 0.48, 0, Hp + 0.62, Dd / 2 + 0.229);
    for (const s of [-1, 1]) B.box('metal', 'darksteel', 0.03, 0.5, 0.03, s * 0.6, Hp + 0.3, Dd / 2 + 0.18, { r: 0.006 });
    // counter
    B.box('wood', shade('wood', 0.95), W - 0.1, Hc - 0.05, 0.62, 0, (Hc - 0.05) / 2, 0.24, { round: true, r: 0.03 });
    B.box('wood', 'woodlight', W - 0.02, 0.05, 0.72, 0, Hc - 0.025, 0.24, { r: 0.015 });
    for (let i = 0; i < 6; i++) B.box('wood', shade('wooddark', B.r(0.95, 1.05)), (W - 0.2) / 6 - 0.02, Hc - 0.18, 0.02, -W / 2 + 0.1 + ((i + 0.5) / 6) * (W - 0.2), (Hc - 0.05) / 2, 0.555, { r: 0.006 });
    B.box('paint', S.a, W - 0.06, 0.1, 0.03, 0, Hc - 0.12, 0.565, { r: 0.008 });
    // goods
    if (S.goods === 'fish') {
      B.box('paint', 'offwhite', W - 0.3, 0.06, 0.52, 0, Hc + 0.03, 0.24, { round: true, r: 0.02 });
      for (let i = 0; i < 12; i++) { const x = -W / 2 + 0.3 + (i % 6) * ((W - 0.6) / 5), z = 0.1 + Math.floor(i / 6) * 0.26; B.sph('gloss', i % 3 ? mixc('sky', 'galv', 0.5) : 'coral', 0.07, x, Hc + 0.08, z, { ws: 10, hs: 6, sx: 2.3, sy: 0.55, ry: B.r(-0.4, 0.4) }); B.box('gloss', i % 3 ? mixc('sky', 'galv', 0.5) : 'coral', 0.06, 0.04, 0.005, x - 0.17, Hc + 0.08, z, { ry: B.r(-0.3, 0.3) }); }
    } else if (S.goods === 'fruit') {
      const fc = ['mustard', 'coral', 'leaf', 'pink', 'leaflight'];
      for (let i = 0; i < 4; i++) {
        const x = -W / 2 + 0.36 + i * ((W - 0.72) / 3);
        B.box('wood', 'woodlight', 0.48, 0.14, 0.5, x, Hc + 0.07, 0.24, { r: 0.012, rx: -0.08 });
        for (let k = 0; k < 9; k++) B.sph('gloss', fc[i % 5], 0.055, x + ((k % 3) - 1) * 0.13 + B.r(-0.02, 0.02), Hc + 0.16 + B.r(0, 0.03), 0.24 + (Math.floor(k / 3) - 1) * 0.13, { ws: 8, hs: 6 });
      }
    } else {
      for (let i = 0; i < 5; i++) { const x = -W / 2 + 0.35 + i * ((W - 0.7) / 4); B.box('paint', pick(B, ['coral', 'teal', 'mustard', 'lavender', 'offwhite']), 0.36, 0.05, 0.3, x, Hc + 0.025, 0.24, { round: true, r: 0.02 }); }
      for (let i = 0; i < 3; i++) { const x = -0.6 + i * 0.6; B.sph('gloss', pick(B, ['navy', 'coral', 'teal']), 0.1, x, Hp - 0.25, -0.05, { ws: 10, hs: 6, half: true }); B.box('gloss', 'navy', 0.12, 0.012, 0.08, x, Hp - 0.25, 0.06, { r: 0.004 }); B.tube('paint', 'charcoal', [P3(x, Hp - 0.15, -0.05), P3(x, Hp, -0.05)], 0.003, { radial: 3 }); }
    }
    // price boards + lanterns + back crates
    for (const s of [-1, 1]) { B.box('wood', 'wooddark', 0.34, 0.2, 0.02, s * (W / 2 - 0.3), Hc + 0.14, 0.58, { r: 0.006, rx: -0.2 }); B.decal('chalk2', 0.3, 0.16, s * (W / 2 - 0.3), Hc + 0.14, 0.592, { rx: -0.2 }); }
    for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) { B.tube('paint', 'charcoal', [P3(x, Hp, Dd / 2 - 0.05), P3(x, Hp - 0.3, Dd / 2 - 0.05)], 0.004, { radial: 3 }); B.sph('glow', 'cream', 0.07, x, Hp - 0.38, Dd / 2 - 0.05, { ws: 10, hs: 8, glow: 2.4 }); B.cyl('metal', 'darksteel', 0.04, 0.04, x, Hp - 0.3, Dd / 2 - 0.05, { seg: 8 }); }
    woodCrate(B, -W / 2 + 0.4, 0, -0.35, B.r(-0.1, 0.1), 0.5);
    woodCrate(B, W / 2 - 0.45, 0, -0.38, B.r(-0.1, 0.1), 0.46);
    B.decal('stk' + Math.floor(B.r(0, 15.99)), 0.1, 0.1, W / 2 - 0.2, 0.5, 0.568, { rz: 0.4 });
    B.col(-W / 2 - 0.05, 0, -Dd / 2 - 0.05, W / 2 + 0.05, Hc, Dd / 2 + 0.05);
    B.blob(W + 0.8, Dd + 0.6);
  },
};
D.cart = {
  desc: 'Street food cart facing +Z (serving side): variant 0 CHILLY SCOOPS ice-cream cart (freezer lids, cone rack, menu board), 1 SQUID DOGS grill cart (grill with sizzling dogs, condiment bottles, napkins). Two big wheels, push bar, striped parasol, header sign.',
  params: {}, variants: 2, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 2, c = v ? 'mustard' : 'pink', W = 1.5, Dd = 0.75, Hb = 0.95;
    B.box('gloss', c, W, Hb - 0.3, Dd, 0, 0.3 + (Hb - 0.3) / 2, 0, { round: true, r: 0.06 });
    B.box('gloss', 'offwhite', W + 0.06, 0.06, Dd + 0.06, 0, Hb + 0.01, 0, { round: true, r: 0.025 });
    B.box('gloss', 'offwhite', W + 0.02, 0.08, Dd + 0.02, 0, 0.34, 0, { round: true, r: 0.03 });
    B.decal(v ? 'cart1' : 'cart0', 1.3, 0.43, 0, 0.64, Dd / 2 + 0.004);
    B.decal('menu', 0.5, 0.375, W / 2 + 0.004, 0.66, 0, { ry: HP });
    B.decal('stk' + Math.floor(B.r(0, 15.99)), 0.1, 0.1, -W / 2 + 0.1, 0.45, Dd / 2 + 0.006, { rz: -0.3 });
    for (const s of [-1, 1]) {
      B.cyl('rubber', 'rubber', 0.24, 0.07, -0.35, 0.24, s * (Dd / 2 + 0.05), { rx: HP, seg: 18, bevel: 0.025 });
      B.cyl('metal', 'offwhite', 0.14, 0.075, -0.35, 0.24, s * (Dd / 2 + 0.05), { rx: HP, seg: 14 });
      B.cyl('metal', 'galv', 0.03, 0.09, -0.35, 0.24, s * (Dd / 2 + 0.05), { rx: HP, seg: 8 });
    }
    B.box('metal', 'galv', 0.04, 0.3, 0.04, W / 2 - 0.12, 0.15, 0, { r: 0.01 });
    B.box('rubber', 'rubber', 0.1, 0.03, 0.1, W / 2 - 0.12, 0.015, 0, { r: 0.01 });
    B.tube('metal', 'galv', [P3(-W / 2, 0.85, -0.3), P3(-W / 2 - 0.28, 1.0, -0.3), P3(-W / 2 - 0.28, 1.0, 0.3), P3(-W / 2, 0.85, 0.3)], 0.016, { radial: 6 });
    B.cyl('rubber', 'charcoal', 0.022, 0.4, -W / 2 - 0.28, 1.0, 0, { rx: HP, seg: 8 });
    const top = Hb + 0.04;
    if (v === 0) {
      for (const x of [-0.35, 0.3]) { B.cyl('gloss', 'offwhite', 0.2, 0.05, x, top + 0.025, 0, { seg: 18, bevel: 0.015 }); B.box('metal', 'galv', 0.12, 0.03, 0.03, x, top + 0.06, 0.12, { r: 0.008 }); }
      for (let i = 0; i < 4; i++) { const x = -0.6 + i * 0.07; B.lathe('wood', 'woodlight', [[0, 0], [0.028, 0.12]], x, top + 0.01, -0.28, { seg: 8 }); B.sph('gloss', pick(B, ['pink', 'cream', 'mint']), 0.03, x, top + 0.14, -0.28, { ws: 8, hs: 6 }); }
      B.box('gloss', 'navy', 0.3, 0.18, 0.08, 0.62, top + 0.09, -0.28, { round: true, r: 0.02 });
    } else {
      B.box('metal', 'darksteel', 0.9, 0.05, 0.5, -0.15, top + 0.025, 0, { r: 0.01 });
      for (let i = 0; i < 7; i++) B.cyl('metal', 'galv', 0.006, 0.5, -0.55 + i * 0.13, top + 0.055, 0, { rx: HP, seg: 4 });
      for (let i = 0; i < 5; i++) { B.cyl('gloss', 'coraldark', 0.025, 0.2, -0.45 + i * 0.15, top + 0.08, B.r(-0.12, 0.12), { rx: HP, rz: B.r(-0.3, 0.3), seg: 8, bevel: 0.012 }); }
      for (const [x, cc] of [[0.45, 'coral'], [0.53, 'mustard']]) { B.lathe('gloss', cc, [[0, 0], [0.035, 0], [0.035, 0.14], [0.015, 0.18], [0.006, 0.21], [0, 0.21]], x, top, -0.2, { seg: 10 }); }
      B.box('paint', 'offwhite', 0.14, 0.1, 0.1, 0.52, top + 0.05, 0.15, { r: 0.015 });
    }
    parasol(B, 0.55, -0.1, top, 1.25, 1.05, v ? 'mustard' : 'pink', 'offwhite', 10);
    B.col(-W / 2 - 0.3, 0, -Dd / 2 - 0.1, W / 2, Hb + 0.05, Dd / 2 + 0.1);
    B.blob(W + 0.9, Dd + 0.7);
  },
};
D.picnic = {
  desc: 'Timber picnic table with attached bench seats on A-frame steel legs; variant 0 with a striped parasol through the middle, 1 without (bottle + snack box on top). Long axis along X.',
  params: { color: 'parasol accent (teal)' }, variants: 2, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 2, L = 1.8, Ht = 0.76, Hs = 0.45;
    for (let i = 0; i < 5; i++) B.box('wood', shade('wood', B.r(0.92, 1.05)), L, 0.04, 0.14, 0, Ht, -0.3 + i * 0.15, { r: 0.012 });
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) B.box('wood', shade('wood', B.r(0.92, 1.05)), L, 0.04, 0.14, 0, Hs, s * (0.62 + i * 0.15), { r: 0.012 });
    for (const x of [-L / 2 + 0.25, L / 2 - 0.25]) {
      for (const s of [-1, 1]) rod(B, 'gloss', 'charcoal', P3(x, Ht - 0.02, s * 0.12), P3(x, 0.01, s * 0.72), 0.022, 7);
      B.box('gloss', 'charcoal', 0.05, 0.05, 1.7, x, Hs - 0.04, 0, { r: 0.012 });
      B.box('gloss', 'charcoal', 0.05, 0.05, 0.62, x, Ht - 0.05, 0, { r: 0.012 });
    }
    if (v === 0) parasol(B, 0, 0, 0, 2.3, 1.2, o.color ?? pick(B, ['teal', 'coral', 'lavender', 'mustard']), 'offwhite', 8);
    else {
      B.lathe('gloss', 'mint', [[0, 0], [0.035, 0], [0.035, 0.15], [0.014, 0.2], [0.012, 0.24], [0, 0.24]], 0.4, Ht + 0.02, 0.1, { seg: 10 });
      B.box('paint', 'coral', 0.2, 0.08, 0.14, -0.3, Ht + 0.06, -0.05, { round: true, r: 0.02, ry: 0.3 });
    }
    B.col(-L / 2, 0, -0.8, L / 2, Ht + 0.02, 0.8);
    B.blob(L + 0.5, 2.1);
  },
};
D.deckchair = {
  desc: 'Striped canvas deck chair(s) on timber frames facing +Z. variant 0 single, 1 pair with a little side table and a drink.',
  params: { color: 'stripe accent' }, variants: 2, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 2;
    const chair = (x, ry, cc) => {
      B.push(x, 0, 0, ry);
      for (const s of [-1, 1]) {
        rod(B, 'wood', 'woodlight', P3(s * 0.28, 0.01, 0.42), P3(s * 0.28, 0.95, -0.28), 0.018, 6);
        rod(B, 'wood', 'woodlight', P3(s * 0.28, 0.01, -0.35), P3(s * 0.28, 0.42, 0.25), 0.016, 6);
      }
      for (const [z, y] of [[0.42, 0.03], [-0.28, 0.95], [0.25, 0.42]]) B.cyl('wood', 'woodlight', 0.016, 0.58, 0, y, z, { rz: HP, seg: 6 });
      const pts = [P3(0, 0.94, -0.27), P3(0, 0.62, -0.02), P3(0, 0.3, 0.12), P3(0, 0.36, 0.36)];
      const g = new GB(), nsx = 7;
      for (let j = 0; j < pts.length; j++) for (let k = 0; k <= nsx; k++) g.v(-0.26 + (k / nsx) * 0.52, pts[j][1], pts[j][2], 0, 0.6, 0.8, k % 2, 0, 1);
      for (let j = 0; j < pts.length - 1; j++) for (let k = 0; k < nsx; k++) { const a = j * (nsx + 1) + k; g.quad(a, a + 1, a + nsx + 2, a + nsx + 1); }
      const geo = g.geo(), C = geo.attributes.color, U = geo.attributes.uv, ca = col(cc), cb = col('offwhite');
      for (let i = 0; i < C.count; i++) { const q = Math.floor((geo.attributes.position.getX(i) + 0.26) / 0.52 * 4 + 0.001) % 2 ? cb : ca; C.setXYZ(i, q.r, q.g, q.b); U.setXY(i, WHITE_UV[0], WHITE_UV[1]); }
      B.add('foliage', geo, 'white', 0, 0, 0, {});
      B.pop();
    };
    const cc = o.color ?? pick(B, ['coral', 'teal', 'mustard', 'sky']);
    if (v === 0) { chair(0, 0, cc); B.col(-0.32, 0, -0.35, 0.32, 0.8, 0.45); B.blob(0.9, 1.0); return; }
    chair(-0.45, 0.15, cc); chair(0.55, -0.12, pick(B, ['coral', 'teal', 'mustard', 'sky']));
    B.cyl('wood', 'woodlight', 0.16, 0.03, 0.05, 0.45, 0.35, { seg: 14 });
    B.cyl('wood', 'wooddark', 0.018, 0.44, 0.05, 0.22, 0.35, { seg: 6 });
    B.lathe('gloss', 'coral', [[0, 0], [0.03, 0], [0.034, 0.1], [0.02, 0.12], [0, 0.12]], 0.1, 0.465, 0.33, { seg: 10 });
    B.tube('gloss', 'offwhite', [P3(0.1, 0.56, 0.33), P3(0.12, 0.64, 0.31)], 0.004, { radial: 3 });
    B.col(-0.8, 0, -0.35, 0.9, 0.8, 0.45); B.blob(2.0, 1.1);
  },
};
D.cooler = {
  desc: 'variant 0 = portable cooler box (two-tone body, white lid with hinge + latches, carry handle, drain plug, stickers); 1 = ICE merchandiser chest freezer with sliding glass lids and big ICE decals.',
  params: { color: 'body' }, variants: 2, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 2;
    if (v === 0) {
      const c = o.color ?? pick(B, ['teal', 'coral', 'sky', 'navy']);
      B.box('gloss', c, 0.62, 0.34, 0.4, 0, 0.19, 0, { round: true, r: 0.05 });
      B.box('gloss', 'offwhite', 0.64, 0.08, 0.42, 0, 0.39, 0, { round: true, r: 0.035 });
      B.box('rubber', 'charcoal', 0.58, 0.03, 0.36, 0, 0.015, 0, { r: 0.01 });
      B.tube('gloss', 'offwhite', [P3(-0.28, 0.3, 0), P3(-0.34, 0.46, 0), P3(0.34, 0.46, 0), P3(0.28, 0.3, 0)], 0.014, { radial: 6 });
      for (const s of [-1, 1]) B.box('metal', 'galv', 0.05, 0.06, 0.02, s * 0.2, 0.33, 0.212, { r: 0.008 });
      B.cyl('rubber', 'charcoal', 0.02, 0.02, 0.26, 0.06, 0.205, { rx: HP, seg: 8 });
      B.decal('stk' + Math.floor(B.r(0, 15.99)), 0.1, 0.1, -0.15, 0.2, 0.203, { rz: -0.2 });
      B.decal('stk' + Math.floor(B.r(0, 15.99)), 0.08, 0.08, 0.1, 0.24, 0.203, { rz: 0.4 });
      B.col(-0.33, 0, -0.22, 0.33, 0.44, 0.22); B.blob(0.9, 0.7);
      return;
    }
    const W = 1.3, Dd = 0.75, H = 0.92;
    B.box('gloss', 'offwhite', W, H - 0.08, Dd, 0, 0.08 + (H - 0.08) / 2, 0, { round: true, r: 0.05 });
    B.box('rubber', 'charcoal', W - 0.06, 0.08, Dd - 0.06, 0, 0.04, 0, { r: 0.015 });
    B.box('gloss', 'sky', W + 0.01, 0.12, Dd + 0.01, 0, H - 0.1, 0, { r: 0.02 });
    for (const s of [-1, 1]) {
      B.box('metal', 'galv', W / 2 - 0.05, 0.02, Dd - 0.1, s * (W / 4), H + 0.005, 0, { r: 0.008 });
      B.box('paint', mixc('sky', 'white', 0.55), W / 2 - 0.12, 0.012, Dd - 0.18, s * (W / 4), H + 0.012, 0, { r: 0.004 });
    }
    B.decal('ice', 0.5, 0.5, -0.25, 0.46, Dd / 2 + 0.004);
    B.decal('ice', 0.5, 0.5, 0.3, 0.46, Dd / 2 + 0.004);
    B.decal('lb11', 0.5, 0.125, 0, 0.15, Dd / 2 + 0.004);
    B.col(-W / 2, 0, -Dd / 2, W / 2, H + 0.02, Dd / 2); B.blob(W + 0.4, Dd + 0.4);
  },
};
D.surfrack = {
  desc: 'Timber A-frame surfboard rack with 3–4 glossy boards leaning in it (stringers, fins, leashes, wax sticker). variant 1 = a single board leaning against a wall behind it (-Z) with a fin up.',
  params: { count: 'boards (4)' }, variants: 2, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 2, cols = ['teal', 'coral', 'mustard', 'sky', 'lavender', 'mint', 'pink'];
    const board = (x, y, z, rx, ry, rz, c, L = 2.0) => {
      B.push(x, y, z, ry, rx, rz);
      B.sph('gloss', c, 1, 0, 0, 0, { ws: 16, hs: 10, sx: 0.26, sy: L / 2, sz: 0.035 });
      B.box('wood', 'woodlight', 0.012, L * 0.92, 0.074, 0, 0, 0, { r: 0.004 });
      B.box('gloss', 'offwhite', 0.26, 0.04, 0.071, 0, L * 0.2, 0, { r: 0.004 });
      B.box('gloss', mixc(c, 'offwhite', 0.5), 0.2, 0.03, 0.072, 0, L * 0.17, 0, { r: 0.004 });
      B.box('gloss', 'charcoal', 0.012, 0.12, 0.1, 0, -L * 0.4, -0.07, { r: 0.004, rx: -0.2 });
      B.tube('rubber', 'ink', [P3(0, -L * 0.47, -0.02), P3(0.08, -L * 0.5, -0.1), P3(0.14, -L * 0.48 + 0.02, -0.16)], 0.006, { radial: 3 });
      B.pop();
    };
    if (v === 1) { board(0, 1.03, -0.17, -0.14, 0, B.r(-0.06, 0.06), o.color ?? pick(B, cols), 2.1); B.blob(0.7, 0.5, 0, -0.1); return; }
    const n = Math.max(1, Math.min(4, o.count ?? 4)), L = 0.58 * n + 0.2;
    for (const x of [-L / 2, L / 2]) {
      rod(B, 'wood', 'wooddark', P3(x, 0, -0.45), P3(x, 1.2, -0.05), 0.03, 6);
      rod(B, 'wood', 'wooddark', P3(x, 0, 0.3), P3(x, 1.2, -0.05), 0.03, 6);
    }
    B.box('wood', 'wood', L + 0.1, 0.06, 0.06, 0, 1.2, -0.05, { r: 0.012 });
    B.box('wood', 'wood', L + 0.1, 0.05, 0.05, 0, 0.35, -0.33, { r: 0.012 });
    for (let i = 0; i < n; i++) board(-L / 2 + 0.39 + i * 0.58, 1.0, 0.1, -0.2, B.r(-0.03, 0.03), B.r(-0.02, 0.02), pick(B, cols));
    B.decal('stk7', 0.14, 0.14, 0, 1.2, -0.018);
    B.col(-L / 2 - 0.1, 0, -0.5, L / 2 + 0.1, 1.25, 0.35); B.blob(L + 0.6, 1.2);
  },
};

// ---- string lights, cables, utilities
D.stringlights = {
  desc: 'Festoon string lights: a sagging cable with warm glowing bulbs (blooming) between two points along +X, optional painted poles at the ends.',
  params: { length: 'm (6)', height: 'm anchor (3.4)', sag: 'm (L·0.07)', posts: 'bool (false)', solid: 'bool: posts collide (false)', count: 'bulbs (≈ L/0.45)' }, variants: 1, mount: 'ground',
  build(B, o) {
    const L = o.length ?? 6, Hh = o.height ?? 3.4, sag = o.sag ?? Math.min(0.8, L * 0.07), end = o.endHeight ?? Hh;
    if (o.posts) for (const [x, h] of [[0, Hh], [L, end]]) {
      B.lathe('paint', 'concrete', [[0, 0], [0.18, 0], [0.19, 0.03], [0.15, 0.1], [0, 0.1]], x, 0, 0, { seg: 12 });
      B.cyl('gloss', 'charcoal', 0.035, h + 0.2, x, 0.1 + (h + 0.2) / 2 - 0.1, 0, { seg: 8 });
      B.sph('gloss', 'mustard', 0.05, x, h + 0.25, 0, { ws: 8, hs: 6 });
    }
    const yAt = (x) => Hh + (end - Hh) * (x / L) - sag * (1 - Math.pow((2 * x) / L - 1, 2));
    const pts = []; for (let i = 0; i <= 18; i++) { const x = (i / 18) * L; pts.push(P3(x, yAt(x), 0)); }
    B.tube('paint', 'charcoal', pts, 0.006, { radial: 4 });
    const n = o.count ?? Math.max(3, Math.round(L / 0.45));
    for (let k = 0; k < n; k++) {
      const x = ((k + 0.5) / n) * L, y = yAt(x);
      B.cyl('rubber', 'charcoal', 0.012, 0.05, x, y - 0.03, 0, { seg: 6 });
      B.sph('glow', k % 5 === 2 ? '#ffd9a8' : '#fff0c9', 0.034, x, y - 0.085, 0, { ws: 8, hs: 6, glow: 2.8, sy: 1.25 });
    }
    // thin poles: no colliders (like the decor lamp posts) so they never snag movement on parapets / deck edges
    if (o.posts) { if (o.solid) { B.col(-0.12, 0, -0.12, 0.12, Hh, 0.12); B.col(L - 0.12, 0, -0.12, L + 0.12, end, 0.12); } B.blob(0.45, 0.45, 0, 0); B.blob(0.45, 0.45, L, 0); }
  },
};
D.cable = {
  desc: 'Utility cables. variant 0 = 1–3 sagging cables between two anchors along +X (insulator clamps at the ends); 1 = wall cable tray (wall at z = 0) with bundled cables, brackets and a conduit drop to a junction box at the start.',
  params: { length: 'm (5)', height: 'm (3)', count: 'cables (2)' }, variants: 2, mount: 'ground|wall',
  build(B, o) {
    const v = (o.variant ?? 0) % 2, L = o.length ?? 5, H = o.height ?? 3, n = Math.max(1, Math.min(3, o.count ?? 2));
    if (v === 0) {
      B.aoBase = null;
      for (let c = 0; c < n; c++) {
        const y0 = H - c * 0.12, sag = Math.min(0.9, L * 0.08) * (1 + c * 0.15), pts = [];
        for (let i = 0; i <= 16; i++) { const x = (i / 16) * L; pts.push(P3(x, y0 - sag * (1 - Math.pow((2 * x) / L - 1, 2)), c * 0.03)); }
        B.tube('rubber', c === 1 ? 'navy' : 'ink', pts, 0.011, { radial: 5 });
        for (const x of [0, L]) { B.cyl('gloss', 'offwhite', 0.025, 0.06, x, y0, c * 0.03, { rz: HP, seg: 8, bevel: 0.01 }); B.box('metal', 'darksteel', 0.05, 0.05, 0.06, x, y0 + 0.02, c * 0.03 - 0.02, { r: 0.008 }); }
      }
      return;
    }
    B.aoBase = null;
    const z = 0.12;
    B.box('metal', 'galv', L, 0.03, 0.2, L / 2, H - 0.07, z, { r: 0.006 });
    for (const s of [-1, 1]) B.box('metal', 'galv', L, 0.08, 0.012, L / 2, H - 0.03, z + s * 0.1, { r: 0.004 });
    const cc = ['ink', 'navy', 'coraldark', 'ink'];
    for (let c = 0; c < 4; c++) B.cyl('rubber', cc[c], 0.018, L, L / 2, H - 0.035, z - 0.06 + c * 0.04, { rz: HP, seg: 6 });
    for (let x = 0.4; x < L; x += 1.2) { B.box('metal', 'darksteel', 0.04, 0.04, 0.24, x, H - 0.11, z, { r: 0.008 }); B.box('metal', 'darksteel', 0.04, 0.2, 0.02, x, H - 0.2, 0.01, { r: 0.006 }); }
    B.tube('metal', 'galv', [P3(0.2, H - 0.05, z), P3(0.2, H - 0.25, z), P3(0.2, 1.1, z * 0.6)], 0.03, { radial: 8 });
    B.box('paint', 'offwhite', 0.42, 0.52, 0.18, 0.2, 0.8, 0.09, { round: true, r: 0.02 });
    B.decal('lb0', 0.34, 0.085, 0.2, 0.95, 0.182);
    B.decal('dia2', 0.12, 0.12, 0.2, 0.73, 0.182);
    for (let x = 1.4; x < L - 0.3; x += 1.8) { B.tube('rubber', 'ink', [P3(x, H - 0.07, z), P3(x + 0.05, H - 0.5, z + 0.03), P3(x + 0.12, H - 0.55, z + 0.04)], 0.012, { radial: 5 }); }
  },
};
D.cabinet = {
  desc: 'HARBOR POWER street cabinet on a concrete plinth (front +Z): twin doors with seams, louvre vents, handle + lock, hazard diamonds, warning labels, conduits into the ground. variant 1 = wall-mounted fuse box (z = 0).',
  params: { color: 'body (sage)' }, variants: 2, mount: 'ground|wall',
  build(B, o) {
    const v = (o.variant ?? 0) % 2, c = o.color ?? mixc('mint', 'galv', 0.55);
    if (v === 1) {
      B.aoBase = null;
      B.box('gloss', c, 0.5, 0.65, 0.2, 0, 0, 0.1, { round: true, r: 0.02 });
      B.box('gloss', shade(c, 0.94), 0.44, 0.59, 0.02, 0, 0, 0.205, { r: 0.008 });
      B.box('metal', 'galv', 0.03, 0.1, 0.03, 0.17, 0, 0.22, { r: 0.008 });
      B.decal('dia2', 0.13, 0.13, -0.08, 0.14, 0.217);
      B.decal('lb0', 0.3, 0.075, 0, -0.18, 0.217);
      B.tube('metal', 'galv', [P3(0, -0.33, 0.1), P3(0, -0.6, 0.1), P3(0, -2, 0.06)], 0.025, { radial: 6 });
      return;
    }
    const W = 0.95, H = 1.3, Dd = 0.42;
    B.box('paint', 'concrete', W + 0.14, 0.14, Dd + 0.14, 0, 0.07, 0, { round: true, r: 0.03 });
    B.box('gloss', c, W, H, Dd, 0, 0.14 + H / 2, 0, { round: true, r: 0.03 });
    B.box('gloss', shade(c, 0.9), W + 0.06, 0.05, Dd + 0.06, 0, 0.14 + H + 0.02, 0, { r: 0.015, rx: 0.04 });
    B.box('paint', shade(c, 0.7), 0.012, H - 0.12, 0.01, 0, 0.14 + H / 2, Dd / 2 + 0.002, { r: 0.002 });
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) B.box('paint', shade(c, 0.8), 0.28, 0.018, 0.02, s * 0.24, 0.3 + i * 0.045, Dd / 2 + 0.005, { rx: -0.5, r: 0.004 });
    B.box('metal', 'galv', 0.03, 0.14, 0.035, 0.08, 0.14 + H * 0.52, Dd / 2 + 0.015, { r: 0.008 });
    B.cyl('metal', 'darksteel', 0.018, 0.02, 0.08, 0.14 + H * 0.62, Dd / 2 + 0.01, { rx: HP, seg: 8 });
    B.box('paint', 'offwhite', W - 0.08, 0.28, 0.006, 0, 0.14 + H - 0.2, Dd / 2 + 0.003, { r: 0.002 });
    B.decal('cab', W - 0.1, 0.25, 0, 0.14 + H - 0.2, Dd / 2 + 0.008);
    B.decal('dia2', 0.16, 0.16, -0.25, 0.14 + H * 0.52, Dd / 2 + 0.006);
    B.decal('lb0', 0.36, 0.09, 0.22, 0.14 + H * 0.4, Dd / 2 + 0.006);
    B.decal('lb5', 0.26, 0.065, -W / 2 - 0.003, 0.14 + H * 0.7, 0, { ry: -HP });
    B.decal('stk' + Math.floor(B.r(0, 15.99)), 0.1, 0.1, 0.3, 0.14 + H * 0.25, Dd / 2 + 0.007, { rz: 0.4 });
    for (const x of [-0.25, 0.25]) B.tube('metal', 'galv', [P3(x, 0.3, -Dd / 2), P3(x, 0.3, -Dd / 2 - 0.1), P3(x, 0.02, -Dd / 2 - 0.2)], 0.035, { radial: 8 });
    B.col(-W / 2 - 0.07, 0, -Dd / 2 - 0.1, W / 2 + 0.07, 0.14 + H, Dd / 2 + 0.07); B.blob(W + 0.5, Dd + 0.5);
  },
};
D.hydrant = {
  desc: 'variant 0 = chunky harbor fire hydrant (bonnet, twin hose caps on chains, pentagon op-nut, flange bolts); 1 = wall fire inlet with twin couplings, caps and a FIRE INLET plate (wall z = 0).',
  params: { color: 'body (coral red)' }, variants: 2, mount: 'ground|wall',
  build(B, o) {
    const v = (o.variant ?? 0) % 2, c = o.color ?? mixc('coraldark', 'coral', 0.3);
    if (v === 1) {
      B.aoBase = null;
      B.box('gloss', c, 0.5, 0.3, 0.06, 0, 0, 0.03, { round: true, r: 0.02 });
      for (const s of [-1, 1]) { B.cyl('metal', 'galv', 0.055, 0.14, s * 0.13, 0, 0.13, { rx: HP, seg: 12, bevel: 0.01 }); B.cyl('gloss', 'charcoal', 0.06, 0.03, s * 0.13, 0, 0.21, { rx: HP, seg: 12, bevel: 0.008 }); }
      B.decal('lb10', 0.36, 0.09, 0, 0.24, 0.005);
      return;
    }
    B.lathe('gloss', c, [[0, 0], [0.17, 0], [0.18, 0.03], [0.17, 0.06], [0.13, 0.08], [0.12, 0.5], [0.14, 0.52], [0.14, 0.56], [0.12, 0.58], [0.1, 0.66], [0.05, 0.7], [0, 0.71]], 0, 0, 0, { seg: 16 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; B.cyl('metal', 'galv', 0.012, 0.03, Math.cos(a) * 0.15, 0.08, Math.sin(a) * 0.15, { seg: 6 }); }
    B.cyl('metal', 'galv', 0.035, 0.06, 0, 0.73, 0, { seg: 5 });
    for (const s of [-1, 1]) {
      B.cyl('gloss', c, 0.05, 0.1, s * 0.15, 0.36, 0, { rz: HP, seg: 12 });
      B.cyl('gloss', 'offwhite', 0.055, 0.035, s * 0.215, 0.36, 0, { rz: HP, seg: 12, bevel: 0.008 });
      B.tube('metal', 'galv', [P3(s * 0.2, 0.33, 0.04), P3(s * 0.16, 0.24, 0.1), P3(s * 0.1, 0.3, 0.12)], 0.004, { radial: 3 });
    }
    B.cyl('gloss', c, 0.065, 0.1, 0, 0.3, 0.14, { rx: HP, seg: 12 });
    B.cyl('gloss', 'offwhite', 0.07, 0.04, 0, 0.3, 0.2, { rx: HP, seg: 12, bevel: 0.01 });
    B.col(-0.25, 0, -0.2, 0.25, 0.75, 0.22); B.blob(0.7, 0.7);
  },
};
D.newsbox = {
  desc: 'variant 0 = newspaper vending box (window with a front page, coin slot, pull handle, legs); 1 = pair of boxes (HARBOR DAILY + INK WEEKLY); 2 = rounded harbor mail post box with collection plate.',
  params: {}, variants: 3, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 3;
    const box = (x, c, news) => {
      B.push(x, 0, 0);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box('metal', 'darksteel', 0.04, 0.35, 0.04, sx * 0.18, 0.175, sz * 0.16, { r: 0.01 });
      B.box('gloss', c, 0.46, 0.6, 0.4, 0, 0.65, 0, { round: true, r: 0.04 });
      B.box('gloss', shade(c, 0.9), 0.48, 0.06, 0.42, 0, 0.97, 0, { round: true, r: 0.02 });
      B.box('paint', 'charcoal', 0.36, 0.3, 0.01, 0, 0.66, 0.2, { r: 0.006 });
      B.decal(news, 0.3, 0.26, 0, 0.67, 0.207);
      B.box('metal', 'galv', 0.2, 0.03, 0.03, 0, 0.47, 0.215, { r: 0.008 });
      B.box('metal', 'galv', 0.08, 0.08, 0.02, 0.14, 0.88, 0.205, { r: 0.008 });
      B.box('paint', 'ink', 0.03, 0.005, 0.01, 0.14, 0.9, 0.216, { r: 0.001 });
      B.pop();
    };
    if (v === 0) { box(0, pick(B, ['coral', 'teal', 'sky']), 'news0'); B.col(-0.25, 0, -0.22, 0.25, 1.0, 0.22); B.blob(0.7, 0.6); return; }
    if (v === 1) { box(-0.27, 'coral', 'news0'); box(0.27, 'teal', 'news1'); B.col(-0.52, 0, -0.22, 0.52, 1.0, 0.22); B.blob(1.3, 0.6); return; }
    B.lathe('gloss', 'coraldark', [[0, 0], [0.26, 0], [0.27, 0.04], [0.23, 0.1], [0.22, 1.1], [0.25, 1.14], [0.25, 1.2], [0.2, 1.3], [0.1, 1.36], [0, 1.37]], 0, 0, 0, { seg: 20 });
    B.box('paint', 'charcoal', 0.26, 0.035, 0.05, 0, 1.0, 0.21, { r: 0.012 });
    B.box('paint', 'offwhite', 0.18, 0.18, 0.01, 0, 0.72, 0.222, { r: 0.004, ry: 0 });
    B.decal('mail', 0.17, 0.17, 0, 0.72, 0.232);
    B.col(-0.27, 0, -0.27, 0.27, 1.37, 0.27); B.blob(0.75, 0.75);
  },
};
D.gascage = {
  desc: 'Steel mesh safety cage with propane / gas cylinders (collar caps, valve guards), PROPANE + NO SMOKING labels, flammable diamond; padlocked door (front +Z).',
  params: { count: 'cylinders (5)' }, variants: 1, mount: 'ground',
  build(B, o) {
    const W = 1.3, Dd = 0.6, H = 1.45, n = Math.max(1, Math.min(6, o.count ?? 5));
    for (const [x, z] of [[-W / 2, -Dd / 2], [W / 2, -Dd / 2], [-W / 2, Dd / 2], [W / 2, Dd / 2]]) B.box('metal', 'galv', 0.04, H, 0.04, x, H / 2, z, { r: 0.008 });
    for (const y of [0.03, H]) { for (const z of [-Dd / 2, Dd / 2]) B.box('metal', 'galv', W, 0.03, 0.03, 0, y, z, { r: 0.006 }); for (const x of [-W / 2, W / 2]) B.box('metal', 'galv', 0.03, 0.03, Dd, x, y, 0, { r: 0.006 }); }
    for (const [w, x, z, ry] of [[W, 0, Dd / 2, 0], [W, 0, -Dd / 2, 0], [Dd, W / 2, 0, HP], [Dd, -W / 2, 0, HP]]) B.add('fence', G.plane(w - 0.04, H - 0.06), 'galv', x, H / 2, z, { ry, uvs: [(w - 0.04) / 0.1, (H - 0.06) / 0.1] });
    B.add('fence', G.plane(W - 0.04, Dd - 0.04), 'galv', 0, H, 0, { rx: -HP, uvs: [(W - 0.04) / 0.1, (Dd - 0.04) / 0.1] });
    const cc = ['teal', 'coral', 'galv', 'teal', 'mustard', 'coral'];
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.17 + (i % 5) * ((W - 0.34) / 4), z = i < 5 ? -0.05 : 0.12;
      B.lathe('gloss', cc[i], [[0, 0], [0.12, 0], [0.13, 0.03], [0.13, 0.85], [0.1, 0.95], [0.04, 0.99], [0, 0.99]], x, 0.03, z, { seg: 14 });
      B.cyl('metal', 'galv', 0.03, 0.08, x, 1.06, z, { seg: 8 });
      B.tor('metal', 'darksteel', 0.06, 0.012, x, 1.07, z, { rx: HP, rs: 4, ts: 12 });
    }
    B.decal('lb2', 0.4, 0.1, -0.3, 1.2, Dd / 2 + 0.02);
    B.decal('lb4', 0.4, 0.1, 0.3, 1.2, Dd / 2 + 0.02);
    B.decal('dia0', 0.2, 0.2, 0, 0.95, Dd / 2 + 0.02);
    B.box('metal', 'darksteel', 0.05, 0.07, 0.03, W / 2 - 0.08, 0.75, Dd / 2 + 0.03, { r: 0.008 });
    B.col(-W / 2 - 0.03, 0, -Dd / 2 - 0.03, W / 2 + 0.03, H, Dd / 2 + 0.03); B.blob(W + 0.4, Dd + 0.4);
  },
};
D.dish = {
  desc: 'Rooftop kit. variant 0 = satellite dish on a pole mount with LNB arm, feed horn and cable; 1 = antenna mast with cross elements, guy wires and a blinking aviation light.',
  params: {}, variants: 2, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 2;
    B.box('metal', 'darksteel', 0.5, 0.04, 0.5, 0, 0.02, 0, { r: 0.01 });
    if (v === 0) {
      B.cyl('metal', 'galv', 0.035, 0.9, 0, 0.47, 0, { seg: 10 });
      B.push(0, 0.95, 0, 0.3, -0.55);
      B.lathe('gloss', 'offwhite', [[0, -0.03], [0.2, -0.005], [0.36, 0.05], [0.45, 0.11], [0.46, 0.13], [0.44, 0.13], [0.35, 0.075], [0.2, 0.02], [0, 0]], 0, 0, 0, { seg: 20, rx: HP });
      B.tube('metal', 'galv', [P3(0, -0.35, 0.05), P3(0, -0.1, 0.35), P3(0, 0, 0.45)], 0.012, { radial: 5 });
      B.cyl('gloss', 'charcoal', 0.035, 0.1, 0, 0, 0.47, { rx: HP, seg: 10 });
      B.pop();
      B.tube('rubber', 'ink', [P3(0.02, 0.9, 0.02), P3(0.05, 0.5, 0.05), P3(0.2, 0.05, 0.2)], 0.008, { radial: 4 });
      B.col(-0.3, 0, -0.3, 0.3, 1.3, 0.3); B.blob(0.9, 0.9);
      return;
    }
    B.cyl('metal', 'galv', 0.03, 2.6, 0, 1.3, 0, { seg: 8 });
    for (let i = 0; i < 4; i++) { const y = 1.4 + i * 0.32, w = 0.9 - i * 0.16; B.cyl('metal', 'galv', 0.01, w, 0, y, 0, { rz: HP, seg: 5 }); for (let k = -2; k <= 2; k++) B.cyl('metal', 'galv', 0.006, 0.25, k * w * 0.2, y, 0.06, { rx: HP, seg: 4 }); }
    for (const a of [0.5, 2.6, 4.7]) B.tube('metal', 'galv', [P3(0, 2.2, 0), P3(Math.cos(a) * 0.9, 0.02, Math.sin(a) * 0.9)], 0.003, { radial: 3 });
    B.sph('glow', 'coral', 0.04, 0, 2.64, 0, { ws: 8, hs: 6, glow: 0.5 });
    B.blink('#ff6a5a', 0, 2.64, 0, { size: 0.045, rate: 0.6, lo: 0.2, hi: 5 });
    B.col(-0.1, 0, -0.1, 0.1, 2.6, 0.1); B.blob(0.8, 0.8);
  },
};

// ---- harbor clutter
D.ropecoil = {
  desc: 'Coiled mooring rope (stacked turns with a loose tail). variant 1 = two coils, one on a pallet-sized mat.',
  params: { color: 'rope (cream)' }, variants: 2, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 2, c = o.color ?? mixc('cream', 'kraft', 0.35);
    const coil = (x, z, R, turns) => {
      for (let i = 0; i < turns; i++) B.tor('rubber', shade(c, 0.92 + (i % 2) * 0.1), R - i * 0.012, 0.035, x, 0.035 + i * 0.058, z, { rx: HP, rs: 6, ts: 24 });
      B.tube('rubber', c, [P3(x + R, 0.035 + (turns - 1) * 0.058, z), P3(x + R + 0.25, 0.04, z + 0.1), P3(x + R + 0.55, 0.035, z - 0.05), P3(x + R + 0.8, 0.035, z + 0.12)], 0.034, { radial: 6 });
    };
    coil(0, 0, 0.36, 4);
    if (v === 1) coil(-0.9, 0.35, 0.3, 3);
    B.blob(v ? 2.0 : 1.3, v ? 1.3 : 1.0, v ? -0.3 : 0.1, 0);
  },
};
D.crabtrap = {
  desc: 'Crab / lobster pot: timber-framed mesh cage with an entry funnel, a coral marker float and a rope. variant 1 = a stack of three pots.',
  params: {}, variants: 2, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 2;
    const trap = (x, y, z, ry) => {
      B.push(x, y, z, ry);
      const W = 0.75, Dd = 0.55, H = 0.4;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box('wood', 'wooddark', 0.035, H, 0.035, sx * W / 2, H / 2, sz * Dd / 2, { r: 0.006 });
      for (const yy of [0.02, H]) { for (const sz of [-1, 1]) B.box('wood', 'wood', W, 0.035, 0.035, 0, yy, sz * Dd / 2, { r: 0.006 }); for (const sx of [-1, 1]) B.box('wood', 'wood', 0.035, 0.035, Dd, sx * W / 2, yy, 0, { r: 0.006 }); }
      for (const [w, h, xx, yy, zz, ry2, rx2] of [[W, H, 0, H / 2, Dd / 2, 0, 0], [W, H, 0, H / 2, -Dd / 2, 0, 0], [Dd, H, W / 2, H / 2, 0, HP, 0], [Dd, H, -W / 2, H / 2, 0, HP, 0], [W, Dd, 0, H, 0, 0, -HP], [W, Dd, 0, 0.02, 0, 0, -HP]]) B.add('fence', G.plane(w, h), mixc('teal', 'galv', 0.4), xx, yy, zz, { ry: ry2, rx: rx2, uvs: [w / 0.07, h / 0.07] });
      B.lathe('rubber', mixc('teal', 'galv', 0.4), [[0.16, 0], [0.05, 0.22]], W / 2 - 0.02, H / 2, 0, { seg: 10, rz: HP });
      B.pop();
    };
    trap(0, 0, 0, 0);
    if (v === 1) { trap(0.05, 0.42, 0.02, 0.1); trap(-0.05, 0.84, -0.03, -0.12); }
    B.sph('gloss', 'coral', 0.14, 0.62, 0.14, 0.32, { ws: 12, hs: 8, sy: 1.25 });
    B.cyl('gloss', 'offwhite', 0.142, 0.05, 0.62, 0.14, 0.32, { seg: 12, open: true });
    B.tube('rubber', mixc('cream', 'kraft', 0.35), [P3(0.36, 0.3, 0.1), P3(0.5, 0.1, 0.25), P3(0.62, 0.3, 0.32)], 0.012, { radial: 4 });
    B.col(-0.4, 0, -0.3, 0.4, v ? 1.25 : 0.42, 0.3); B.blob(1.2, 0.9);
  },
};
D.net = {
  desc: 'Fishing net hung to dry over two posts (along +X): sagging mesh with a float line of coral + white corks, weighted bottom rope.',
  params: { length: 'm (2.4)', height: 'm (1.9)' }, variants: 1, mount: 'ground',
  build(B, o) {
    const L = o.length ?? 2.4, H = o.height ?? 1.9;
    for (const x of [0, L]) { B.cyl('wood', 'wooddark', 0.05, H + 0.1, x, (H + 0.1) / 2, 0, { seg: 8 }); B.sph('wood', 'wooddark', 0.055, x, H + 0.1, 0, { ws: 8, hs: 5, half: true }); }
    const g = new GB(), nx = 10, ny = 6;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx, t = j / ny, sagTop = 0.18 * Math.sin(PI * u);
      g.v(u * L, H - sagTop - t * (H - 0.35 - sagTop * 0.5) + Math.sin(u * 9 + t * 4) * 0.02, 0.04 * Math.sin(u * 7 + t * 5) + t * 0.12, 0, 0, 1, u * L / 0.12, t * (H - 0.3) / 0.12, 1);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; g.quad(a, a + 1, a + nx + 2, a + nx + 1); }
    B.add('fence', g.geo(), mixc('teal', 'navy', 0.3), 0, 0, 0, { uvs: [1, 1] });
    const top = []; for (let i = 0; i <= 12; i++) { const u = i / 12; top.push(P3(u * L, H - 0.18 * Math.sin(PI * u), 0.02)); }
    B.tube('rubber', mixc('cream', 'kraft', 0.35), top, 0.012, { radial: 4 });
    for (let i = 1; i < 8; i++) { const u = i / 8; B.sph('gloss', i % 2 ? 'coral' : 'offwhite', 0.045, u * L, H - 0.18 * Math.sin(PI * u), 0.03, { ws: 8, hs: 6, sx: 1.4 }); }
    B.col(-0.07, 0, -0.07, 0.07, H, 0.07); B.col(L - 0.07, 0, -0.07, L + 0.07, H, 0.07);
    B.blob(0.35, 0.35, 0, 0); B.blob(0.35, 0.35, L, 0);
  },
};
D.hosereel = {
  desc: 'Wall-mounted wash-down hose reel (wall z = 0): back plate, drum with coiled hose, crank handle, nozzle and a WASH DOWN label; a tap below.',
  params: {}, variants: 1, mount: 'wall',
  build(B, o) {
    B.aoBase = null;
    B.box('metal', 'darksteel', 0.36, 0.42, 0.02, 0, 0, 0.01, { r: 0.008 });
    B.cyl('gloss', 'coral', 0.22, 0.24, 0, 0, 0.18, { rx: HP, seg: 18, open: true });
    for (const z of [0.05, 0.31]) B.cyl('gloss', 'coral', 0.26, 0.015, 0, 0, z, { rx: HP, seg: 18 });
    for (let i = 0; i < 3; i++) B.tor('rubber', 'mustard', 0.235, 0.022, 0, 0, 0.1 + i * 0.05, { rs: 5, ts: 20 });
    B.tube('metal', 'galv', [P3(0.2, 0.05, 0.34), P3(0.2, 0.05, 0.4), P3(0.3, 0.05, 0.4)], 0.01, { radial: 4 });
    B.tube('rubber', 'mustard', [P3(0.22, -0.1, 0.2), P3(0.3, -0.35, 0.25), P3(0.25, -0.55, 0.3)], 0.022, { radial: 6 });
    B.cyl('gloss', 'charcoal', 0.03, 0.14, 0.25, -0.62, 0.3, { seg: 8, bevel: 0.01 });
    B.decal('lb15', 0.3, 0.075, 0, 0.3, 0.022);
    B.tube('metal', 'galv', [P3(-0.1, -0.6, 0.0), P3(-0.1, -0.6, 0.1), P3(-0.1, -0.7, 0.12)], 0.02, { radial: 6 });
    B.cyl('gloss', 'navy', 0.035, 0.02, -0.1, -0.55, 0.1, { seg: 8 });
  },
};
D.palletjack = {
  desc: 'Hand pallet jack (forks along -X, tow handle up at +X), painted body, steering wheel pair and load rollers.',
  params: { color: 'body (mustard)' }, variants: 1, mount: 'ground',
  build(B, o) {
    const c = o.color ?? 'mustard';
    for (const s of [-1, 1]) {
      B.box('gloss', c, 1.15, 0.07, 0.16, -0.45, 0.075, s * 0.26, { r: 0.02 });
      B.cyl('rubber', 'charcoal', 0.035, 0.12, -0.95, 0.035, s * 0.26, { rx: HP, seg: 10 });
    }
    B.box('gloss', c, 0.16, 0.2, 0.7, 0.18, 0.15, 0, { round: true, r: 0.03 });
    B.cyl('gloss', c, 0.06, 0.3, 0.2, 0.36, 0, { seg: 12 });
    for (const s of [-1, 1]) B.cyl('rubber', 'charcoal', 0.09, 0.06, 0.24, 0.09, s * 0.08, { rx: HP, seg: 14, bevel: 0.015 });
    B.tube('gloss', c, [P3(0.22, 0.5, 0), P3(0.45, 1.15, 0)], 0.022, { radial: 7 });
    B.tube('gloss', c, [P3(0.45, 1.15, -0.16), P3(0.5, 1.28, -0.12), P3(0.5, 1.28, 0.12), P3(0.45, 1.15, 0.16)], 0.018, { radial: 6 });
    B.box('gloss', 'coral', 0.04, 0.06, 0.1, 0.49, 1.24, 0, { r: 0.01 });
    B.col(-1.05, 0, -0.35, 0.35, 0.5, 0.35); B.blob(1.5, 0.9, -0.35, 0);
  },
};
D.sandbags = {
  desc: 'Stack of plump burlap sandbags (brick-bonded rows, tied ears) along +X.',
  params: { length: 'bags per row (3)', height: 'rows (2)' }, variants: 1, mount: 'ground',
  build(B, o) {
    const n = Math.max(1, o.length ?? 3), rows = Math.max(1, o.height ?? 2), bw = 0.58;
    for (let r = 0; r < rows; r++) for (let i = 0; i < n - (r % 2); i++) {
      const x = (i + (r % 2) * 0.5) * bw, y = 0.09 + r * 0.16;
      B.box('rubber', shade('kraft', B.r(0.86, 1.02)), bw - 0.04, 0.17, 0.36, x, y, B.r(-0.02, 0.02), { round: true, r: 0.075, ry: B.r(-0.06, 0.06) });
      B.sph('rubber', shade('kraft', 0.8), 0.03, x + bw / 2 - 0.03, y + 0.02, 0, { ws: 6, hs: 4 });
    }
    B.col(-bw / 2, 0, -0.2, (n - 0.5) * bw, rows * 0.16 + 0.02, 0.2); B.blob(n * bw + 0.3, 0.7, (n - 1) * bw / 2, 0);
  },
};
D.aboard = {
  desc: 'A-frame sandwich board (front +Z): timber frame, chalk menus on both faces, little chain spreader.',
  params: {}, variants: 2, mount: 'ground',
  build(B, o) {
    const v = (o.variant ?? 0) % 2, H = 0.95, W = 0.6, a = 0.2;
    for (const s of [-1, 1]) {
      B.push(0, 0, s * 0.2, 0, -s * a);
      B.box('wood', 'wooddark', W, H, 0.03, 0, H / 2, 0, { r: 0.012 });
      B.decal(v ? 'chalk2' : 'chalk', W - 0.08, v ? (W - 0.08) * 0.5 : W - 0.08, 0, H * 0.58, s * 0.02, { ry: s > 0 ? 0 : PI });
      if (v) B.decal('chalk2', W - 0.08, (W - 0.08) * 0.5, 0, H * 0.25, s * 0.02, { ry: s > 0 ? 0 : PI });
      B.pop();
    }
    B.tube('metal', 'galv', [P3(-W / 2 + 0.05, 0.35, -0.12), P3(-W / 2 + 0.05, 0.33, 0.12)], 0.004, { radial: 3 });
    B.col(-W / 2, 0, -0.22, W / 2, H, 0.22); B.blob(W + 0.3, 0.7);
  },
};
D.ferryboard = {
  desc: 'FERRY TIMES timetable board under a little pitched roof on two posts (front +Z); wall:true hangs the board flat on a wall (z = 0).',
  params: { wall: 'bool' }, variants: 1, mount: 'ground|wall',
  build(B, o) {
    const W = 1.2, H = 0.8;
    if (o.wall) { B.aoBase = null; B.box('paint', 'navy', W + 0.08, H + 0.08, 0.04, 0, 0, 0.02, { round: true, r: 0.015 }); B.decal('ferry', W, H, 0, 0, 0.042); return; }
    const y = 1.35;
    for (const s of [-1, 1]) { B.box('gloss', 'navy', 0.07, y + H / 2 + 0.3, 0.07, s * (W / 2 + 0.06), (y + H / 2 + 0.3) / 2, 0, { r: 0.015 }); B.box('metal', 'darksteel', 0.2, 0.02, 0.2, s * (W / 2 + 0.06), 0.01, 0, { r: 0.005 }); }
    B.box('paint', 'navy', W + 0.08, H + 0.08, 0.05, 0, y, 0, { round: true, r: 0.015 });
    B.decal('ferry', W, H, 0, y, 0.027);
    for (const s of [-1, 1]) B.box('gloss', 'coral', W + 0.4, 0.03, 0.3, 0, y + H / 2 + 0.36, s * 0.13, { rx: s * 0.4, r: 0.01 });
    B.sph('gloss', 'mustard', 0.05, 0, y + H / 2 + 0.45, 0, { ws: 8, hs: 6 });
    B.col(-W / 2 - 0.1, 0, -0.08, W / 2 + 0.1, y + H / 2 + 0.3, 0.08); B.blob(W + 0.5, 0.5);
  },
};
D.pot = {
  desc: 'Planting. variant 0 = big glazed pot with a round shrub, 1 = cluster of three terracotta pots with flowers + a herb, 2 = wall-mounted hanging basket (z = 0) with trailing leaves and flowers.',
  params: {}, variants: 3, mount: 'ground|wall',
  build(B, o) {
    const v = (o.variant ?? 0) % 3, det = B.k.qf >= 1 ? 2 : 1;
    const pot = (x, z, R, H, c) => {
      B.lathe('gloss', c, [[0, 0], [R * 0.7, 0], [R * 0.75, 0.02], [R, H - 0.04], [R * 1.08, H - 0.03], [R * 1.08, H], [R * 0.95, H], [0, H - 0.02]], x, 0, z, { seg: 16 });
      B.cyl('paint', 'soil', R * 0.93, 0.02, x, H - 0.03, z, { seg: 14 });
    };
    if (v === 0) {
      pot(0, 0, 0.36, 0.62, pick(B, ['teal', 'navy', 'coraldark', 'mustarddark']));
      bushCluster(B, 5, 0.42, 0.56, 0.05, det, Math.floor(B.r(0, 6)));
      B.col(-0.4, 0, -0.4, 0.4, 0.62, 0.4); B.blob(1.1, 1.1);
      return;
    }
    if (v === 1) {
      const tc = mixc('coral', 'kraft', 0.45);
      for (const [x, z, R, H] of [[0, 0, 0.24, 0.42], [0.42, 0.12, 0.18, 0.3], [-0.3, 0.26, 0.16, 0.26]]) {
        pot(x, z, R, H, tc);
        const fc = pick(B, ['pink', 'mustard', 'lavender', 'coral', 'offwhite']);
        B.add('foliage', G.blob(1, 1, Math.floor(B.r(0, 8))), 'leafdark', x, H + 0.06, z, { s: R * 0.9, sy: R * 0.6 });
        for (let k = 0; k < 6; k++) { const a = B.r(0, TAU), r = B.r(0, R * 0.6); B.add('foliage', G.blob(1, 0, k % 8), fc, x + Math.cos(a) * r, H + 0.12 + B.r(0, 0.05), z + Math.sin(a) * r, { s: 0.05 }); }
      }
      B.col(-0.48, 0, -0.26, 0.62, 0.42, 0.44); B.blob(1.4, 1.0, 0.05, 0.12);
      return;
    }
    B.aoBase = null;
    B.box('metal', 'darksteel', 0.04, 0.3, 0.02, 0, 0.1, 0.01, { r: 0.006 });
    B.tube('metal', 'darksteel', [P3(0, 0.22, 0.01), P3(0, 0.25, 0.25), P3(0, 0.2, 0.36)], 0.012, { radial: 5 });
    for (const a of [0, 2.1, 4.2]) B.tube('metal', 'darksteel', [P3(0, 0.2, 0.36), P3(Math.cos(a) * 0.2, -0.05, 0.36 + Math.sin(a) * 0.2)], 0.004, { radial: 3 });
    B.lathe('wood', 'kraft', [[0, -0.22], [0.12, -0.2], [0.2, -0.1], [0.23, -0.04], [0.22, -0.04], [0, -0.06]], 0, 0, 0.36, { seg: 14 });
    B.add('foliage', G.blob(1, 1, 3), 'leaf', 0, -0.02, 0.36, { s: 0.24, sy: 0.14 });
    for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; B.tube('foliage', 'leafdark', [P3(Math.cos(a) * 0.2, -0.05, 0.36 + Math.sin(a) * 0.2), P3(Math.cos(a) * 0.26, -0.3 - B.r(0, 0.15), 0.36 + Math.sin(a) * 0.26)], 0.012, { radial: 3 }); }
    for (let k = 0; k < 8; k++) { const a = B.r(0, TAU); B.add('foliage', G.blob(1, 0, k % 8), pick(B, ['pink', 'mustard', 'offwhite', 'lavender']), Math.cos(a) * 0.17, 0.02, 0.36 + Math.sin(a) * 0.17, { s: 0.045 }); }
  },
};

// ------------------------------------------------------------------------------------------------ spinner templates
function fanTemplate() {
  const parts = [];
  parts.push({ g: G.cyl(0.045, 0.045, 0.05, 12, false), m: compose(0, 0, 0, HP), c: col('charcoal'), ao: null });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const m = compose(0, 0, 0, 0, 0, a).multiply(compose(0.12, 0, 0, 0.42, 0, 0));
    parts.push({ g: chamferBox(0.16, 0.085, 0.012, 0.006), m, c: col('charcoal'), ao: null });
  }
  return mergeParts(parts);
}
function turbineTemplate() {
  const g = new GB(), N = 14, S = 7, R = 0.2;
  for (let i = 0; i < N; i++) {
    for (const side of [1, -1]) {
      const row = [];
      for (let s = 0; s <= S; s++) {
        const t = s / S, lat = -0.25 + t * 1.25, r = R * Math.cos(lat) + 0.01, y = 0.03 + R * 0.95 * (Math.sin(lat) + 0.25);
        const ph = (i / N) * TAU + t * 0.8, cx = Math.cos(ph), cz = Math.sin(ph);
        const wx = -cz * 0.75 - cx * 0.35, wz = cx * 0.75 - cz * 0.35, w = 0.075 * Math.cos(lat * 0.8);
        const nx = cx * side, nz = cz * side, off = side > 0 ? 0 : -0.004;
        row.push([g.v(cx * (r + off), y, cz * (r + off), nx, 0.2 * side, nz), g.v(cx * (r + off) + wx * w, y, cz * (r + off) + wz * w, nx, 0.2 * side, nz)]);
      }
      for (let s = 0; s < S; s++) g.quad(row[s][0], row[s][1], row[s + 1][1], row[s + 1][0]);
    }
  }
  const parts = [
    { g: g.geo(), m: new THREE.Matrix4(), c: col('galv'), ao: null },
    { g: G.sph(0.07, 12, 5, true), m: compose(0, 0.03 + R * 0.95 * (Math.sin(1.0) + 0.25), 0), c: col('galv'), ao: null },
    { g: G.tor(0.2, 0.014, 5, 20, TAU), m: compose(0, 0.03, 0, HP), c: col('galv'), ao: null },
  ];
  return mergeParts(parts);
}

// ------------------------------------------------------------------------------------------------ the kit
const CASTS = { paint: true, gloss: true, metal: true, wood: true, rubber: true, foliage: true, fence: true, glow: false, blob: false };
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _c1 = new THREE.Color(), _white = new THREE.Color(1, 1, 1);

// Spinner templates registered by packs: kind → () => BufferGeometry (instanced with the metal material, spun about
// local Y by B.spin(kind, …)). Built lazily once per kit, disposed with it.
const SPIN_TEMPLATES = new Map();

// ------------------------------------------------------------------------------------------------ stage prop packs
// Stage-specific prop types live in their own files (one owner each). A pack only uses the builder API it is handed
// (B.box / cyl / lathe / tube / sph / tor / blob / decal / col / push / pop / r …) plus these helpers — it never
// imports this file, so there are no import cycles.
const PACK_HELPERS = {
  THREE, PALETTE, ACCENTS, PI, TAU, HP, P3, col, shade, mixc, mulberry32, chamferBox, roundBox, latheGeo, tubeGeo, extrudeGeo,
  polyNormals, offsetPoly, blobGeo, puffGeo, rcylProf, flangeProf, circlePts, smoothPts, roundPoly, arcPts, woodCrate, drum,
  pallet, rod, wheel, TIRE, LIFERING,
  // route a part to a merged bucket that never casts shadows (sub-deck piles, small fittings, glass, lettering …)
  noShadow: (m) => m + '~ns',
  spinTemplate: (kind, make) => { SPIN_TEMPLATES.set(kind, make); },
};
registerMarinaVessels(D, PACK_HELPERS);
registerMarinaDock(D, PACK_HELPERS);

export class PropKit {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.castShadow = opts.castShadow !== false;
    this.quality = opts.quality || 'high';
    this.qf = { low: 0.6, medium: 0.8, high: 1 }[this.quality] ?? 1;
    this.group = new THREE.Group(); this.group.name = 'props';
    if (scene) scene.add(this.group);
    this.uTime = { value: 0 };
    this.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
    this._headless = !!opts.headless || typeof document === 'undefined';
    if (!this._headless) this._makeMaterials();
    this._buckets = new Map();
    this._spin = []; this._blink = []; this._flags = []; this._banners = [];
    this._meshes = []; this._inst = [];
    this._tpl = {};
    this._B = new Builder(this);
    this.count = 0;
    this.lastTris = 0;
  }

  _makeMaterials() {
    const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
    const atlas = new THREE.CanvasTexture(cv);
    atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 8;
    const redraw = () => { drawAtlas(cv.getContext('2d')); atlas.needsUpdate = true; };
    redraw();
    loadFonts().then(() => { if (!this._disposed) redraw(); });
    this.atlas = atlas;
    this.chain = canvasTex(128, 128, (x, w, h) => {
      x.clearRect(0, 0, w, h); x.strokeStyle = '#fff'; x.lineWidth = 7; x.lineCap = 'round';
      for (const o of [-w, 0, w]) { x.beginPath(); x.moveTo(o, 0); x.lineTo(o + w, h); x.stroke(); x.beginPath(); x.moveTo(o + w, 0); x.lineTo(o, h); x.stroke(); }
    }, true);
    this.blobTex = canvasTex(64, 64, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    this.blobTex.colorSpace = THREE.NoColorSpace;
    this.mat = {
      paint: new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.6, metalness: 0, alphaTest: 0.5 }),
      gloss: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.36, metalness: 0, clearcoat: 0.65, clearcoatRoughness: 0.2 }),
      metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.33, metalness: 0.7 }),
      wood: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0 }),
      rubber: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }),
      foliage: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, side: THREE.DoubleSide }),
      glow: new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true }),
      fence: new THREE.MeshStandardMaterial({ map: this.chain, vertexColors: true, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.4 }),
      blob: new THREE.MeshBasicMaterial({ map: this.blobTex, color: 0x1c2233, transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      blink: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      cloth: clothMaterial(atlas, this.uTime),
      clothDepth: clothDepthMaterial(this.uTime),
    };
    this.mat.fence.alphaToCoverage = true;
    // the instanced spinners get their own copies: a material drawn on both instanced and plain meshes makes three.js
    // swap its program at every switch (four times a frame with the merged props)
    this.mat.paintInst = this.mat.paint.clone();
    this.mat.metalInst = this.mat.metal.clone();
  }

  _push(mat, part) { let a = this._buckets.get(mat); if (!a) { a = []; this._buckets.set(mat, a); } a.push(part); }
  _tplGeo(kind) {
    if (!this._tpl[kind]) this._tpl[kind] = SPIN_TEMPLATES.has(kind) ? SPIN_TEMPLATES.get(kind)() : kind === 'fan' ? fanTemplate() : turbineTemplate();
    return this._tpl[kind];
  }
  _tplTris(kind) { return triCountOf(this._tplGeo(kind)); }

  add(type, o = {}) {
    const def = D[type];
    if (!def) { console.warn('[props] unknown prop type', type); return { colliders: [] }; }
    const pos = o.pos || [0, 0, 0], rotY = o.rotY || 0, scale = o.scale ?? 1;
    const seed = o.seed ?? ((Math.round(pos[0] * 131) ^ Math.round(pos[2] * 71) ^ Math.round(pos[1] * 17)) + 1013);
    const B = this._B;
    B.begin(pos, rotY, scale, seed, def.mount !== 'wall' || type === 'pipes' || type === 'ladder' || type === 'container_door');
    B.tris = 0;
    def.build(B, o);
    this.lastTris = B.tris;
    this.count++;
    return { colliders: this._xfCols(B.cols, pos, rotY, scale) };
  }

  _xfCols(cols, pos, rotY, s) {
    const q = Math.round(rotY / HP), snapped = Math.abs(rotY - q * HP) < 1e-3;
    const qq = ((q % 4) + 4) % 4;
    const c = snapped ? [1, 0, -1, 0][qq] : Math.cos(rotY), sn = snapped ? [0, 1, 0, -1][qq] : Math.sin(rotY);
    const out = [];
    for (const b of cols) {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [lx, lz] of [[b[0], b[2]], [b[3], b[2]], [b[3], b[5]], [b[0], b[5]]]) {
        const x = (lx * c + lz * sn) * s, z = (-lx * sn + lz * c) * s;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      const r4 = (v) => Math.round(v * 1e4) / 1e4;
      out.push({ min: [r4(pos[0] + x0), r4(pos[1] + b[1] * s), r4(pos[2] + z0)], max: [r4(pos[0] + x1), r4(pos[1] + b[4] * s), r4(pos[2] + z1)] });
    }
    return out;
  }

  build() {
    this._disposeMeshes();
    if (this._headless) return this;
    for (const [bucket, parts] of this._buckets) {
      if (!parts.length) continue;
      const [key, flag] = bucket.split('~');   // 'gloss~ns' = gloss material, no shadow casting
      const mesh = new THREE.Mesh(mergeParts(parts), this.mat[key]);
      mesh.name = 'props:' + bucket;
      mesh.castShadow = this.castShadow && CASTS[key] && flag !== 'ns';
      mesh.receiveShadow = key !== 'glow' && key !== 'blob';
      if (key === 'blob') mesh.renderOrder = 1;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh); this._meshes.push(mesh);
    }
    // spinners
    const kinds = {};
    for (const r of this._spin) (kinds[r.kind] ||= []).push(r);
    for (const kind in kinds) {
      const recs = kinds[kind];
      const mesh = new THREE.InstancedMesh(this._tplGeo(kind), kind === 'fan' ? this.mat.paintInst : this.mat.metalInst, recs.length);
      recs.forEach((r, i) => mesh.setMatrixAt(i, r.base));
      mesh.castShadow = this.castShadow; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = 'props:spin:' + kind;
      mesh.userData = { recs, axis: kind === 'fan' ? 'z' : 'y' };
      this.group.add(mesh); this._inst.push(mesh);
    }
    if (this._blink.length) {
      const mesh = new THREE.InstancedMesh(G.sph(1, 8, 6, false), this.mat.blink, this._blink.length);
      this._blink.forEach((r, i) => { mesh.setMatrixAt(i, r.m); mesh.setColorAt(i, _c1.copy(r.color).multiplyScalar(r.hi)); });
      mesh.frustumCulled = false; mesh.name = 'props:blink'; mesh.userData = { recs: this._blink, blink: true };
      this.group.add(mesh); this._inst.push(mesh);
    }
    for (const [recs, geo, name] of [[this._flags, () => flagGeo(), 'flags'], [this._banners, () => bannerGeo(0.8, 1.9), 'banners']]) {
      if (!recs.length) continue;
      const mesh = new THREE.InstancedMesh(geo(), this.mat.cloth, recs.length);
      recs.forEach((r, i) => { mesh.setMatrixAt(i, r.m); mesh.setColorAt(i, _white); });
      mesh.customDepthMaterial = this.mat.clothDepth;
      mesh.castShadow = this.castShadow; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = 'props:' + name;
      mesh.userData = { recs, cloth: true };
      this.group.add(mesh); this._inst.push(mesh);
    }
    this._applyColors();
    return this;
  }

  _applyColors() {
    for (const mesh of this._inst) {
      if (!mesh.userData.cloth) continue;
      mesh.userData.recs.forEach((r, i) => {
        if (r.team != null) _c1.copy(this.teamColors[r.team]).lerp(_white, r.tint || 0); else _c1.copy(r.color);
        mesh.setColorAt(i, _c1);
      });
      mesh.instanceColor.needsUpdate = true;
    }
  }

  // Time of day: lit windows, signs, festoon globes and screens glow at full strength at dusk and read as "on but
  // daylit" (half strength) by day. k = the environment's night factor (0 day/golden … 1 dusk).
  setNight(k = 0) { if (this.mat?.glow) this.mat.glow.color.setScalar(0.5 + 0.5 * Math.min(1, Math.max(0, k))); }

  setTeamColors(a, b) {
    if (a != null) this.teamColors[0].set(a);
    if (b != null) this.teamColors[1].set(b);
    this._applyColors();
  }

  update(dt, time) {
    this.uTime.value = time;
    for (const mesh of this._inst) {
      const ud = mesh.userData;
      if (ud.axis) {
        const recs = ud.recs;
        for (let i = 0; i < recs.length; i++) {
          const r = recs[i], a = time * r.speed + r.phase;
          if (ud.axis === 'z') _m1.makeRotationZ(a); else _m1.makeRotationY(a);
          _m2.multiplyMatrices(r.base, _m1);
          mesh.setMatrixAt(i, _m2);
        }
        mesh.instanceMatrix.needsUpdate = true;
      } else if (ud.blink) {
        const recs = ud.recs;
        for (let i = 0; i < recs.length; i++) {
          const r = recs[i], s = 0.5 + 0.5 * Math.sin(time * r.rate * TAU + r.phase);
          const k = s * s * (3 - 2 * s), on = k > 0.6 ? 1 : k / 0.6 * 0.25;
          mesh.setColorAt(i, _c1.copy(r.color).multiplyScalar(r.lo + (r.hi - r.lo) * on));
        }
        mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  stats() {
    let tris = 0;
    for (const m of this._meshes) tris += triCountOf(m.geometry);
    for (const m of this._inst) tris += triCountOf(m.geometry) * m.count;
    return { props: this.count, meshes: this._meshes.length + this._inst.length, merged: this._meshes.length, instanced: this._inst.length, triangles: Math.round(tris) };
  }

  _disposeMeshes() {
    for (const m of this._meshes) { m.geometry.dispose(); this.group.remove(m); }
    for (const m of this._inst) { if (m.userData.cloth) m.geometry.dispose(); m.dispose?.(); this.group.remove(m); }
    this._meshes = []; this._inst = [];
  }

  clear() {
    this._disposeMeshes();
    this._buckets.clear();
    this._spin = []; this._blink = []; this._flags = []; this._banners = [];
    this.count = 0;
  }

  dispose() {
    this.clear();
    this._disposed = true;
    if (this.mat) for (const k in this.mat) this.mat[k].dispose();
    for (const k in this._tpl) this._tpl[k].dispose();
    this.atlas?.dispose(); this.chain?.dispose(); this.blobTex?.dispose();
    this.group.removeFromParent();
  }

  // Triangle count of one default instance of `type` (for budgets / docs).
  static triangles(type, opts = {}) {
    const k = new PropKit(null, { quality: opts.quality || 'high', headless: true });
    k.add(type, opts);
    return k.lastTris;
  }
}

export const PROP_TYPES = Object.entries(D).map(([type, d]) => ({ type, description: d.desc, params: d.params, variants: d.variants, mount: d.mount }));
