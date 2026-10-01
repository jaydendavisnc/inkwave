// Halyard Marina — vessel prop pack (owner: vessels stream). Detail meshes that dress the playable vessel blocks of
// the HALYARD layout (ferry, tug on blocks, houseboat, dinghy) plus the non-playable moored boats around the arena.
// Registered into the PropKit by props.js; placements are exported below and merged into the stage dressing.
//
// Conventions (same as props.js): metres, Y up, sea surface y = -1.6. Every placement in HALYARD_VESSELS is mirrored
// by the map's 180° rotation unless `mirror: false`, so the "half" props (ferry_hull, ferry_cabin, …) dress one long
// side + one end and the mirror copy dresses the other. The playable blocks stay the paint/collision truth: detail on
// playable walls stands off the face by ≤ 0.12 m, never covers floors, and colliders exist only where listed in
// docs/HALYARD.md (cover pieces) or where a prop is genuinely solid and out of the lanes.

import { hq, QUAY_FRONT, SLICE } from './props-marina-slice.js';

export function registerMarinaVessels(D, H) {
  const { THREE, PI, TAU, HP, P3, col, shade, mixc, extrudeGeo, TIRE, LIFERING } = H;

  // ================================================================================================ palette
  // Muted, weathered marine paints; bold accents only on landmarks (ferry funnel, tug, lettering).
  const C = {
    hull: '#3f5372', hullDk: '#34455f', hullLt: '#4b6182', boot: '#b04a3f', bootDk: '#8e3a31',
    white: '#f1ede4', whiteDk: '#dcd6ca', cream: '#ece3cf', glass: '#1c2733', glassLt: '#2a3a4a',
    frame: '#e6e2d9', frameDk: '#b9b6ae', black: '#23262d', rubber: '#1b1e24', steel: '#aab2ba', steelDk: '#6b727b',
    galv: '#c3c9ce', rust: '#9c5a3a', rustLt: '#b8744d', teak: '#a87a4f', teakDk: '#8a6240', rope: '#e2d3b0',
    ropeDk: '#c9b58c', mustard: '#e0b347', mustardDk: '#b98f2f', teal: '#3f9f97', tealDk: '#2c7a74', coral: '#df7c66',
    navy: '#2f3a57', red: '#c8473d', green: '#3fae6a', hazard: '#e2b64c', canvas: '#2f4f6e', canvasTeal: '#2f6f6a',
    tug: '#9c4838', tugDk: '#7a3629', tugHouse: '#efe9dd', buff: '#d9b77a', houseTeal: '#8fb8b4', houseTop: '#f0ebe0',
  };

  // ================================================================================================ geometry kit
  // Local template cache (CPU-side geometry, merged by the kit like props.js templates).
  const CACHE = new Map();
  const cached = (key, fn) => { let g = CACHE.get(key); if (!g) { g = fn(); CACHE.set(key, g); } return g; };

  // Cheap primitives for small flat details (12-tri box, low-seg cylinder) — scaled unit templates.
  const UBOX = new THREE.BoxGeometry(1, 1, 1);
  const bx = (B, mat, c, w, h, d, x, y, z, o = {}) => B.add(mat, UBOX, c, x, y, z, { ...o, sx: w, sy: h, sz: d });
  const ucyl = (seg) => cached('ucyl|' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, false));
  const cy = (B, mat, c, r, h, x, y, z, o = {}) => B.add(mat, ucyl(o.seg ?? 6), c, x, y, z, { ...o, sx: r, sy: h, sz: r });
  const ucylO = (seg) => cached('ucylO|' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, true));
  const post = (B, mat, c, r, h, x, y, z, o = {}) => B.add(mat, ucylO(o.seg ?? 6), c, x, y, z, { ...o, sx: r, sy: h, sz: r });

  // Ring buoy (coral/white quarters baked in vertex colour), faces +Z. ≈ 290 tris.
  const RINGBUOY = (() => {
    const g = new THREE.TorusGeometry(0.28, 0.068, 6, 24), P = g.attributes.position, cl = new Float32Array(P.count * 3);
    const a = new THREE.Color('#e9836c'), b = new THREE.Color('#f2eee6');
    for (let i = 0; i < P.count; i++) { const ang = Math.atan2(P.getY(i), P.getX(i)) + TAU; const q = Math.floor((ang + PI / 8) / (TAU / 8)) % 2 ? b : a; cl.set([q.r, q.g, q.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    return g;
  })();
  function ringBuoy(B, x, y, z, s = 0.8) {
    B.add('gloss', RINGBUOY, 'white', x, y, z, { s });
    for (let k = 0; k < 4; k++) { const a = PI / 4 + (k / 4) * TAU; B.tor('rubber', C.cream, 0.075 * s, 0.011, x + Math.cos(a) * 0.28 * s, y + Math.sin(a) * 0.28 * s, z, { rz: a, ry: HP, rs: 3, ts: 8 }); }
  }

  // Shadow-pass budget: flush detail, thin lines, small fittings and everything outside the arena go into the kit's
  // no-shadow buckets (H.noShadow(mat) → 'mat~ns': same material, never casts). Falls back to the plain bucket.
  const NS = (m) => (H.noShadow ? H.noShadow(m) : m);
  function ns(B, key) { return key === 'glow' || key === 'blob' || key.includes('~') ? key : NS(key); }
  function noShadow(B, fn) {
    const own = Object.prototype.hasOwnProperty.call(B, 'add'), prev = B.add;
    B.add = function (mat, ...rest) { return prev.call(this, ns(this, mat), ...rest); };
    try { fn(); } finally { if (own) B.add = prev; else delete B.add; }
  }

  // Mesh builder with per-vertex colour; triangles auto-orient to agree with the supplied normals (like props.js GB).
  class MB {
    constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
    v(x, y, z, nx, ny, nz, c) {
      const l = Math.hypot(nx, ny, nz) || 1;
      this.p.push(x, y, z); this.n.push(nx / l, ny / l, nz / l);
      if (c) this.c.push(c.r, c.g, c.b); else this.c.push(1, 1, 1);
      return this.p.length / 3 - 1;
    }
    tri(a, b, c) {
      const P = this.p, N = this.n;
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az;
      const e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
      const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
      if (cx * cx + cy * cy + cz * cz < 1e-18) return;
      const s = cx * (N[a * 3] + N[b * 3] + N[c * 3]) + cy * (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) + cz * (N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]);
      if (s < 0) this.i.push(a, c, b); else this.i.push(a, b, c);
    }
    quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
    geo() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((this.p.length / 3) * 2), 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setIndex(this.i);
      return g;
    }
  }

  // Grid surface from rows of points (rows[i][j] = [x,y,z]); smooth normals from the grid, oriented away from `ref(i,j)`
  // (a function returning a point inside the solid). Optional per-vertex colour fn(x,y,z,i,j) → THREE.Color.
  function gridSurface(mb, rows, ref, colorFn, closedJ = false) {
    const ni = rows.length, nj = rows[0].length, ids = [];
    for (let i = 0; i < ni; i++) {
      const row = [];
      for (let j = 0; j < nj; j++) {
        const p = rows[i][j];
        const pi0 = rows[Math.max(0, i - 1)][j], pi1 = rows[Math.min(ni - 1, i + 1)][j];
        const jm = closedJ ? (j - 1 + nj) % nj : Math.max(0, j - 1), jp = closedJ ? (j + 1) % nj : Math.min(nj - 1, j + 1);
        const pj0 = rows[i][jm], pj1 = rows[i][jp];
        const ux = pi1[0] - pi0[0], uy = pi1[1] - pi0[1], uz = pi1[2] - pi0[2];
        const vx = pj1[0] - pj0[0], vy = pj1[1] - pj0[1], vz = pj1[2] - pj0[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const r = ref(i, j);
        if (nx * (p[0] - r[0]) + ny * (p[1] - r[1]) + nz * (p[2] - r[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
        row.push(mb.v(p[0], p[1], p[2], nx, ny, nz, colorFn ? colorFn(p[0], p[1], p[2], i, j) : null));
      }
      ids.push(row);
    }
    const nq = closedJ ? nj : nj - 1;
    for (let i = 0; i < ni - 1; i++) for (let j = 0; j < nq; j++) mb.quad(ids[i][j], ids[i + 1][j], ids[i + 1][(j + 1) % nj], ids[i][(j + 1) % nj]);
    return ids;
  }

  // Flat polygon (convex or simple) in a plane: pts [[x,y,z]], normal n.
  function polyFan(mb, pts, n, c) {
    const ids = pts.map((p) => mb.v(p[0], p[1], p[2], n[0], n[1], n[2], c));
    const tris = THREE.ShapeUtils.triangulateShape(pts.map((p) => {
      // project to the dominant plane
      const ax = Math.abs(n[0]), ay = Math.abs(n[1]);
      return ax > 0.6 ? new THREE.Vector2(p[2], p[1]) : ay > 0.6 ? new THREE.Vector2(p[0], p[2]) : new THREE.Vector2(p[0], p[1]);
    }), []);
    for (const t of tris) mb.tri(ids[t[0]], ids[t[1]], ids[t[2]]);
  }

  // Sweep a closed 2D profile (in the path's normal plane: [u = side, v = up]) along a 3D polyline with parallel-transport
  // frames; `up` seeds the frame. Caps the ends flat. Creases where the profile turns sharply.
  function sweep(profile, path, up = [0, 1, 0], caps = true) {
    const mb = new MB(), n = path.length, P = path.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const T = P.map((p, i) => P[Math.min(n - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize());
    const U = new THREE.Vector3(up[0], up[1], up[2]);
    let Nv = U.clone().addScaledVector(T[0], -U.dot(T[0])).normalize();
    const frames = [];
    for (let i = 0; i < n; i++) {
      if (i > 0) Nv.addScaledVector(T[i], -Nv.dot(T[i])).normalize();
      const Bv = new THREE.Vector3().crossVectors(T[i], Nv).normalize();
      frames.push([Nv.clone(), Bv]);
    }
    // profile edge normals (2D, outward) with creases > 50°
    const m = profile.length;
    let A = 0; for (let k = 0; k < m; k++) { const a = profile[k], b = profile[(k + 1) % m]; A += a[0] * b[1] - b[0] * a[1]; }
    const sg = A > 0 ? 1 : -1;
    const en = profile.map((a, k) => { const b = profile[(k + 1) % m]; const du = b[0] - a[0], dv = b[1] - a[1], l = Math.hypot(du, dv) || 1; return [dv / l * sg, -du / l * sg]; });
    const cosC = Math.cos(50 * PI / 180);
    for (let k = 0; k < m; k++) {
      const k1 = (k + 1) % m, a = profile[k], b = profile[k1];
      const e0 = en[(k - 1 + m) % m], e1 = en[k], e2 = en[k1];
      const na = e0[0] * e1[0] + e0[1] * e1[1] < cosC ? e1 : [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2];
      const nb = e1[0] * e2[0] + e1[1] * e2[1] < cosC ? e1 : [(e1[0] + e2[0]) / 2, (e1[1] + e2[1]) / 2];
      let prev = null;
      for (let i = 0; i < n; i++) {
        const [Nf, Bf] = frames[i];
        const pa = P[i].clone().addScaledVector(Bf, a[0]).addScaledVector(Nf, a[1]);
        const pb = P[i].clone().addScaledVector(Bf, b[0]).addScaledVector(Nf, b[1]);
        const nva = Bf.clone().multiplyScalar(na[0]).addScaledVector(Nf, na[1]);
        const nvb = Bf.clone().multiplyScalar(nb[0]).addScaledVector(Nf, nb[1]);
        const ia = mb.v(pa.x, pa.y, pa.z, nva.x, nva.y, nva.z), ib = mb.v(pb.x, pb.y, pb.z, nvb.x, nvb.y, nvb.z);
        if (prev) mb.quad(prev[0], prev[1], ib, ia);
        prev = [ia, ib];
      }
    }
    if (caps) for (const [i, s] of [[0, -1], [n - 1, 1]]) {
      const [Nf, Bf] = frames[i];
      const pts = profile.map((q) => { const p = P[i].clone().addScaledVector(Bf, q[0]).addScaledVector(Nf, q[1]); return [p.x, p.y, p.z]; });
      const nn = T[i].clone().multiplyScalar(s);
      const ids = pts.map((p) => mb.v(p[0], p[1], p[2], nn.x, nn.y, nn.z));
      const tris = THREE.ShapeUtils.triangulateShape(profile.map((q) => new THREE.Vector2(q[0], q[1])), []);
      for (const t of tris) mb.tri(ids[t[0]], ids[t[1]], ids[t[2]]);
    }
    return mb.geo();
  }
  // rounded-rectangle profile (u half-width, v half-height, radius) centred on 0
  function rrectProf(hw, hh, r, k = 3) {
    r = Math.min(r, hw * 0.98, hh * 0.98);
    const out = [], cs = [[hw - r, hh - r, 0], [-hw + r, hh - r, HP], [-hw + r, -hh + r, PI], [hw - r, -hh + r, PI * 1.5]];
    for (const [cx, cy, a0] of cs) for (let i = 0; i <= k; i++) { const a = a0 + (i / k) * HP; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return out;
  }
  // D-section fender profile: flat back on u = 0 facing -u… bulge toward +u by `d`, height h (v from -h/2..h/2)
  function dProf(d, h, n = 7) {
    const out = [[0, -h / 2]];
    for (let i = 0; i <= n; i++) { const a = -HP + (i / n) * PI; out.push([Math.cos(a) * d, Math.sin(a) * h / 2]); }
    out.push([0, h / 2]);
    return out;
  }

  // ------------------------------------------------------------------------------------------------ stroke lettering
  // A sign-writer's block alphabet (octagonal joins read as painted/welded marine lettering). Cap height 1; each glyph:
  // [advance width, ...polylines]; a polyline whose last point equals its first is closed.
  const FONT = {
    A: [0.64, [[0, 0], [0, 0.76], [0.2, 1], [0.44, 1], [0.64, 0.76], [0.64, 0]], [[0, 0.44], [0.64, 0.44]]],
    B: [0.62, [[0, 0], [0, 1], [0.44, 1], [0.6, 0.86], [0.6, 0.66], [0.46, 0.53], [0, 0.53]], [[0.46, 0.53], [0.62, 0.4], [0.62, 0.15], [0.46, 0], [0, 0]]],
    C: [0.6, [[0.6, 0.82], [0.43, 1], [0.17, 1], [0, 0.83], [0, 0.17], [0.17, 0], [0.43, 0], [0.6, 0.18]]],
    D: [0.62, [[0, 0], [0, 1], [0.38, 1], [0.62, 0.76], [0.62, 0.24], [0.38, 0], [0, 0]]],
    E: [0.54, [[0.54, 1], [0, 1], [0, 0], [0.54, 0]], [[0, 0.52], [0.44, 0.52]]],
    F: [0.52, [[0.52, 1], [0, 1], [0, 0]], [[0, 0.52], [0.42, 0.52]]],
    G: [0.62, [[0.62, 0.82], [0.45, 1], [0.17, 1], [0, 0.83], [0, 0.17], [0.17, 0], [0.45, 0], [0.62, 0.17], [0.62, 0.46], [0.34, 0.46]]],
    H: [0.62, [[0, 0], [0, 1]], [[0.62, 0], [0.62, 1]], [[0, 0.52], [0.62, 0.52]]],
    I: [0, [[0, 0], [0, 1]]],
    J: [0.5, [[0.5, 1], [0.5, 0.17], [0.33, 0], [0.16, 0], [0, 0.16], [0, 0.3]]],
    K: [0.6, [[0, 0], [0, 1]], [[0.6, 1], [0, 0.4]], [[0.2, 0.58], [0.6, 0]]],
    L: [0.5, [[0, 1], [0, 0], [0.5, 0]]],
    M: [0.8, [[0, 0], [0, 1], [0.4, 0.4], [0.8, 1], [0.8, 0]]],
    N: [0.64, [[0, 0], [0, 1], [0.64, 0], [0.64, 1]]],
    O: [0.66, [[0.17, 0], [0, 0.17], [0, 0.83], [0.17, 1], [0.49, 1], [0.66, 0.83], [0.66, 0.17], [0.49, 0], [0.17, 0]]],
    P: [0.6, [[0, 0], [0, 1], [0.44, 1], [0.6, 0.84], [0.6, 0.6], [0.44, 0.45], [0, 0.45]]],
    Q: [0.66, [[0.17, 0], [0, 0.17], [0, 0.83], [0.17, 1], [0.49, 1], [0.66, 0.83], [0.66, 0.17], [0.49, 0], [0.17, 0]], [[0.4, 0.22], [0.7, -0.08]]],
    R: [0.62, [[0, 0], [0, 1], [0.44, 1], [0.6, 0.84], [0.6, 0.62], [0.44, 0.47], [0, 0.47]], [[0.36, 0.47], [0.62, 0]]],
    S: [0.6, [[0.6, 0.83], [0.43, 1], [0.17, 1], [0, 0.83], [0, 0.64], [0.13, 0.53], [0.47, 0.49], [0.6, 0.37], [0.6, 0.17], [0.43, 0], [0.17, 0], [0, 0.17]]],
    T: [0.6, [[0, 1], [0.6, 1]], [[0.3, 1], [0.3, 0]]],
    U: [0.62, [[0, 1], [0, 0.17], [0.17, 0], [0.45, 0], [0.62, 0.17], [0.62, 1]]],
    V: [0.64, [[0, 1], [0.32, 0], [0.64, 1]]],
    W: [0.86, [[0, 1], [0.2, 0], [0.43, 0.62], [0.66, 0], [0.86, 1]]],
    X: [0.62, [[0, 1], [0.62, 0]], [[0, 0], [0.62, 1]]],
    Y: [0.62, [[0, 1], [0.31, 0.5], [0.62, 1]], [[0.31, 0.5], [0.31, 0]]],
    Z: [0.58, [[0, 1], [0.58, 1], [0, 0], [0.58, 0]]],
    0: [0.56, [[0.16, 0], [0, 0.16], [0, 0.84], [0.16, 1], [0.4, 1], [0.56, 0.84], [0.56, 0.16], [0.4, 0], [0.16, 0]]],
    1: [0.3, [[0, 0.8], [0.26, 1], [0.26, 0]]],
    2: [0.56, [[0, 0.83], [0.16, 1], [0.4, 1], [0.56, 0.84], [0.56, 0.6], [0, 0.12], [0, 0], [0.56, 0]]],
    3: [0.56, [[0, 0.84], [0.16, 1], [0.4, 1], [0.56, 0.84], [0.56, 0.66], [0.44, 0.54], [0.18, 0.54]], [[0.44, 0.54], [0.56, 0.42], [0.56, 0.16], [0.4, 0], [0.16, 0], [0, 0.16]]],
    4: [0.58, [[0.42, 0], [0.42, 1], [0, 0.3], [0.58, 0.3]]],
    5: [0.56, [[0.54, 1], [0.02, 1], [0, 0.56], [0.4, 0.56], [0.56, 0.42], [0.56, 0.16], [0.4, 0], [0.16, 0], [0, 0.16]]],
    6: [0.56, [[0.54, 0.86], [0.4, 1], [0.16, 1], [0, 0.84], [0, 0.16], [0.16, 0], [0.4, 0], [0.56, 0.16], [0.56, 0.4], [0.4, 0.56], [0, 0.56]]],
    7: [0.54, [[0, 1], [0.54, 1], [0.16, 0]]],
    8: [0.56, [[0.14, 0.53], [0, 0.66], [0, 0.86], [0.14, 1], [0.42, 1], [0.56, 0.86], [0.56, 0.66], [0.42, 0.53], [0.14, 0.53], [0, 0.4], [0, 0.14], [0.14, 0], [0.42, 0], [0.56, 0.14], [0.56, 0.4], [0.42, 0.53]]],
    9: [0.56, [[0.02, 0.14], [0.16, 0], [0.4, 0], [0.56, 0.16], [0.56, 0.84], [0.4, 1], [0.16, 1], [0, 0.84], [0, 0.6], [0.16, 0.44], [0.56, 0.44]]],
    '-': [0.36, [[0, 0.48], [0.36, 0.48]]],
    '.': [0.04, [[0, 0], [0, 0.06]]],
    '/': [0.4, [[0, 0], [0.4, 1]]],
    '·': [0.04, [[0, 0.46], [0, 0.54]]],
  };

  // Mitred ribbon for one polyline (in XY, front face at z = d, open back). t = stroke width.
  function strokeRibbon(mb, pts, t, d, c) {
    let closed = pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    if (closed) pts = pts.slice(0, -1);
    const n = pts.length, hw = t / 2, L = [], R = [];
    const dir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    for (let i = 0; i < n; i++) {
      const hasPrev = closed || i > 0, hasNext = closed || i < n - 1;
      const dp = hasPrev ? dir(pts[(i - 1 + n) % n], pts[i]) : null, dn = hasNext ? dir(pts[i], pts[(i + 1) % n]) : null;
      let mx, my, k = 1;
      if (dp && dn) {
        const nx0 = -dp[1], ny0 = dp[0], nx1 = -dn[1], ny1 = dn[0];
        mx = nx0 + nx1; my = ny0 + ny1; const l = Math.hypot(mx, my) || 1; mx /= l; my /= l;
        k = Math.min(2.2, 1 / Math.max(0.2, mx * nx1 + my * ny1));
      } else { const dd = dp || dn; mx = -dd[1]; my = dd[0]; }
      L.push([pts[i][0] + mx * hw * k, pts[i][1] + my * hw * k]);
      R.push([pts[i][0] - mx * hw * k, pts[i][1] - my * hw * k]);
    }
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      const a = mb.v(L[i][0], L[i][1], d, 0, 0, 1, c), b = mb.v(R[i][0], R[i][1], d, 0, 0, 1, c);
      const e = mb.v(R[j][0], R[j][1], d, 0, 0, 1, c), f = mb.v(L[j][0], L[j][1], d, 0, 0, 1, c);
      mb.quad(a, b, e, f);
      for (const S of [L, R]) {
        const dx = S[j][0] - S[i][0], dy = S[j][1] - S[i][1];
        let nx = dy, ny = -dx; const mxp = (S[i][0] + S[j][0]) / 2 - (pts[i][0] + pts[j][0]) / 2, myp = (S[i][1] + S[j][1]) / 2 - (pts[i][1] + pts[j][1]) / 2;
        if (nx * mxp + ny * myp < 0) { nx = -nx; ny = -ny; }
        const q0 = mb.v(S[i][0], S[i][1], d, nx, ny, 0, c), q1 = mb.v(S[j][0], S[j][1], d, nx, ny, 0, c);
        const q2 = mb.v(S[j][0], S[j][1], 0, nx, ny, 0, c), q3 = mb.v(S[i][0], S[i][1], 0, nx, ny, 0, c);
        mb.quad(q0, q1, q2, q3);
      }
    }
    if (!closed) for (const [i, s] of [[0, -1], [n - 1, 1]]) {
      const dd = dir(pts[i === 0 ? 0 : n - 2], pts[i === 0 ? 1 : n - 1]);
      const nx = dd[0] * s, ny = dd[1] * s;
      const q0 = mb.v(L[i][0], L[i][1], d, nx, ny, 0, c), q1 = mb.v(R[i][0], R[i][1], d, nx, ny, 0, c);
      const q2 = mb.v(R[i][0], R[i][1], 0, nx, ny, 0, c), q3 = mb.v(L[i][0], L[i][1], 0, nx, ny, 0, c);
      mb.quad(q0, q1, q2, q3);
    }
  }
  // Text geometry in the XY plane facing +Z: baseline y = 0, cap height h, centred on x = 0 (align 'c') or left 'l' / right 'r'.
  function textGeo(str, h, o = {}) {
    const t = (o.weight ?? 0.15) * h, d = o.depth ?? 0.012, sp = (o.spacing ?? 0.24) * h, align = o.align ?? 'c';
    const key = ['txt', str, h, o.weight ?? 0.15, d, o.spacing ?? 0.24, align, o.slant ?? 0].join('|');
    return cached(key, () => {
      const mb = new MB();
      let x = 0; const placed = [];
      for (const ch of String(str).toUpperCase()) {
        if (ch === ' ') { x += 0.5 * h; continue; }
        const g = FONT[ch]; if (!g) { x += 0.5 * h; continue; }
        placed.push([g, x]); x += g[0] * h + t + sp;
      }
      const W = Math.max(0, x - sp);
      const x0 = align === 'c' ? -W / 2 : align === 'r' ? -W : 0;
      const sl = o.slant ?? 0;
      for (const [g, gx] of placed) for (let k = 1; k < g.length; k++) {
        const pts = g[k].map((p) => [x0 + gx + t / 2 + p[0] * h + p[1] * h * sl, p[1] * h * (1 - t / h) + t / 2]);
        strokeRibbon(mb, pts, t, d, null);
      }
      const geo = mb.geo(); geo.userData = { width: W };
      return geo;
    });
  }
  // Place text on a plane: (x,y,z) = baseline centre, ry turns the +Z-facing text (0 → faces +Z, PI → faces -Z …)
  function text(B, str, h, c, x, y, z, o = {}) {
    B.add(ns(B, o.mat || 'paint'), textGeo(str, h, o), c, x, y, z, { ry: o.ry ?? 0, rx: o.rx ?? 0, rz: o.rz ?? 0 });
  }

  // ------------------------------------------------------------------------------------------------ ropes
  // Catenary-ish rope between a and b (sag metres at mid-span, measured below the chord) as a tube.
  function ropePts(a, b, sag, n = 18) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, s = 4 * t * (1 - t);
      out.push(P3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * s, a[2] + (b[2] - a[2]) * t));
    }
    return out;
  }
  function rope(B, a, b, sag, r = 0.03, c = C.rope, n = 18) { B.tube(ns(B, 'rubber'), c, ropePts(a, b, sag, n), r, { radial: 6 }); }

  // ------------------------------------------------------------------------------------------------ wear + small parts
  // Weathering streak on a wall (local plane z = 0, facing +Z): tapered quad fading from `c0` at the top into `c1`.
  function streakGeo(w, h, c0, c1) {
    return cached(['streak', w, h, c0, c1].join('|'), () => {
      const mb = new MB(), a = col(c0), b = col(c1);
      const q = [mb.v(-w / 2, 0, 0, 0, 0, 1, a), mb.v(w / 2, 0, 0, 0, 0, 1, a), mb.v(w * 0.18, -h, 0, 0, 0, 1, b), mb.v(-w * 0.18, -h, 0, 0, 0, 1, b)];
      const m0 = mb.v(0, -h * 0.45, 0, 0, 0, 1, a.clone().lerp(b, 0.55));
      mb.tri(q[0], q[1], m0); mb.tri(q[1], q[2], m0); mb.tri(q[2], q[3], m0); mb.tri(q[3], q[0], m0);
      return mb.geo();
    });
  }
  function streak(B, x, y, z, w, h, c0, c1, ry = 0) { B.add(ns(B, 'paint'), streakGeo(w, h, c0, c1), 'white', x, y, z, { ry }); }

  // Bake transformed template parts into one coloured geometry (for kit spinner templates).
  function bakeParts(parts) {
    let nv = 0, ni = 0;
    for (const p of parts) { nv += p.g.attributes.position.count; ni += p.g.index.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), cl = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
    const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    let vo = 0, io = 0;
    for (const p of parts) {
      const P = p.g.attributes.position, N = p.g.attributes.normal, CC = p.g.attributes.color, c = col(p.c);
      nm.getNormalMatrix(p.m);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(p.m); pos.set([v.x, v.y, v.z], (vo + i) * 3);
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (vo + i) * 3);
        const k = CC ? CC.getX(i) : 1;
        cl.set([c.r * k, c.g * k, c.b * k], (vo + i) * 3);
      }
      const I = p.g.index.array;
      for (let j = 0; j < I.length; j++) idx[io++] = I[j] + vo;
      vo += P.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }
  const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
  // Open-array radar antenna (spins about +Y at the origin): slotted waveguide bar with end caps + turning hub.
  function radarTemplate(len) {
    const parts = [];
    parts.push({ g: H.roundBox(len, 0.13, 0.2, 0.05), m: M4(0, 0.14, 0), c: C.white });
    parts.push({ g: H.chamferBox(len - 0.1, 0.05, 0.012, 0.004), m: M4(0, 0.14, 0.103), c: '#b9bcc0' });
    parts.push({ g: H.chamferBox(len - 0.1, 0.05, 0.012, 0.004), m: M4(0, 0.14, -0.103), c: '#b9bcc0' });
    parts.push({ g: H.latheGeo([[0, 0], [0.09, 0], [0.09, 0.09], [0.06, 0.12], [0, 0.12]], 12), m: M4(0, -0.02, 0), c: C.whiteDk });
    return bakeParts(parts);
  }
  // Spinner via the kit's pack template registry (H.spinTemplate); a static antenna if the kit can't spin.
  function radar(B, x, y, z, len, speed) {
    const kind = 'hv_radar' + Math.round(len * 10);
    if (H.spinTemplate && typeof B.spin === 'function') {
      H.spinTemplate(kind, () => radarTemplate(len));
      B.spin(kind, x, y, z, { speed });
    } else B.add('gloss', radarTemplate(len), 'white', x, y, z, {});
  }

  // ================================================================================================ FERRY "HALYARD"
  // Blocks (maps.js): hull x ±16, z ±5, y -1.9…1.1; deck plate to 1.3; cabin x ±6.5, z ±2.9 to 3.8 (sun deck);
  // wheelhouse x ±1.5, z ±1.6 to 5.2; bulwarks z ±(4.6…5) to 2.0, open at |x| < 1.8; stairs; plank lands x 13.8…16,
  // z -4.6…-2.6 (Alpha). ferry_hull dresses the -Z side + the +X end (mirror copy: +Z side + -X end).
  const FZ = -5, FX = 16, DECK = 1.3;

  // Stockless (Hall) anchor silhouette: shank, crown and two raised flukes, extruded + bevelled. Built hanging in the
  // XY plane (shackle at y = 0, crown at y ≈ -1.0), plate normal +Z, thickness toward +Z.
  const ANCHOR = [[-0.065, 0], [0.065, 0], [0.065, -0.78], [0.12, -0.8], [0.25, -0.44], [0.3, -0.42], [0.31, -0.5], [0.27, -0.92], [0.2, -1.02], [-0.2, -1.02], [-0.27, -0.92], [-0.31, -0.5], [-0.3, -0.42], [-0.25, -0.44], [-0.12, -0.8], [-0.065, -0.78]];
  function anchor(B, c) {
    const g = cached('anchor', () => extrudeGeo(ANCHOR.map(([x, y]) => [x, y]), 0.1, 0.025));
    B.add('metal', g, c, 0, 0, 0.055, { ry: -HP });
    B.box('metal', c, 0.2, 0.14, 0.12, 0, -0.05, 0.06, { r: 0.04 });                        // shank head
    B.tor('metal', c, 0.07, 0.022, 0, 0.1, 0.06, { rs: 6, ts: 12 });                          // shackle
    B.box('metal', shade(c, 1.15), 0.5, 0.06, 0.12, 0, -0.9, 0.06, { r: 0.025 });            // tripping palm ridge
    for (let k = 0; k < 2; k++) B.tor('metal', shade(c, 0.9), 0.07, 0.024, 0, 0.23 + k * 0.13, 0.05, { ry: k % 2 ? HP : 0, rs: 5, ts: 10, sy: 1.4 });
  }
  // Oval Panama chock casting on a wall face (face normal +Z in the current frame), centred at (x, y, z).
  function chock(B, x, y, z) {
    noShadow(B, () => {
    B.tor('gloss', C.black, 0.13, 0.05, x, y, z + 0.035, { sx: 1.35, rs: 5, ts: 14 });
    B.cyl('gloss', C.black, 0.26, 0.03, x, y, z + 0.015, { rx: HP, sx: 1.3, seg: 14 });
    B.cyl('paint', '#15161a', 0.12, 0.004, x, y, z + 0.032, { rx: HP, sx: 1.3, seg: 10 });
    });
  }
  // Heavy mooring eye on a wall face (normal +Z in the current frame): plate, eye, drop ring with a rope eye splice.
  // Returns the point where the rope leaves the splice (local coords).
  function ringBolt(B, x, y, z, rope = true) {
    noShadow(B, () => {
    B.box('metal', C.steelDk, 0.24, 0.24, 0.03, x, y, z + 0.015, { round: true, r: 0.02 });
    for (const [qx, qy] of [[-0.08, -0.08], [0.08, 0.08]]) cy(B, 'metal', '#50555c', 0.018, 0.02, x + qx, y + qy, z + 0.035, { rx: HP });
    B.box('metal', C.steelDk, 0.07, 0.09, 0.08, x, y + 0.02, z + 0.07, { r: 0.02 });
    B.tor('metal', C.steel, 0.1, 0.022, x, y - 0.1, z + 0.1, { rx: 0.25, rs: 5, ts: 12 });
    if (rope) B.tor('rubber', C.ropeDk, 0.07, 0.026, x, y - 0.2, z + 0.13, { ry: HP, rs: 4, ts: 10 });
    });
    return [x, y - 0.26, z + 0.16];
  }
  // Figure-eight turns of rope around a double bitt (posts at ±sep along X), rising `turns` times.
  function bittTurns(B, x, y, z, sep, rad, turns, c) {
    noShadow(B, () => {
    const pts = [], N = 28;
    for (let k = 0; k < turns; k++) for (let i = 0; i < N; i++) {
      const t = i / N, a = t * TAU;
      pts.push(P3(x + Math.sin(a) * (sep + rad), y + (k + t) * 0.07, z + Math.sin(a) * Math.cos(a) * rad * 1.6));
    }
    B.tube('rubber', c, pts, 0.028, { radial: 6 });
    });
  }

  D.ferry_hull = {
    desc: 'HALYARD double-ended ferry: one long side of the hull (boot-top, belting, plate seams, livery lettering, anchors, draft marks, bulwark cap + guard rail (rail collider), freeing ports, mooring lines) + one end (lowered car-ramp flap, corner fenders). Place at the origin; the mirror copy dresses the other side/end.',
    params: { linkspan: 'Tower Command: a float pontoon lies against the end (no lowered car-ramp flap; the bitt line goes to the float)' }, variants: 1, mount: 'ground',
    build(B, o = {}) {
      B.aoBase = null;
      const seam = shade(C.hull, 0.82), weep = mixc(C.hull, '#7a5646', 0.42), wet = shade(C.hull, 0.8);
      // --- boot-top (red band at the waterline) with a white line above it; wraps the end
      noShadow(B, () => {
        B.box('paint', C.boot, 32.06, 0.44, 0.024, 0, -1.47, FZ - 0.012, { r: 0.008 });
        B.box('paint', C.boot, 0.024, 0.44, 10.04, FX + 0.012, -1.47, 0, { r: 0.008 });
        B.box('paint', C.white, 32.06, 0.035, 0.02, 0, -1.232, FZ - 0.01, { r: 0.006 });
        B.box('paint', C.white, 0.02, 0.035, 10.04, FX + 0.01, -1.232, 0, { r: 0.006 });
      });
      // --- main belting (black D-fender) along the side, and the two end runs either side of the ramp
      const bprof = dProf(0.11, 0.28).slice(1, -1).map(([u, v]) => [-u, v]);
      const belt = cached('ferryBelt', () => extrudeGeo(bprof, 31.66, 0.05));
      B.add('gloss', belt, '#1c1f26', 0, 0.77, FZ, {});
      const beltEnd = cached('ferryBeltEnd', () => extrudeGeo(bprof, 2.24, 0.05));
      for (const s of [-1, 1]) B.add('gloss', beltEnd, '#1c1f26', FX, 0.77, s * 3.72, { ry: -HP });
      noShadow(B, () => {
        B.box('metal', C.steelDk, 31.5, 0.035, 0.02, 0, 0.61, FZ - 0.01, { r: 0.008 });
        for (let x = -15.2; x <= 15.3; x += 1.2) cy(B, 'metal', C.steelDk, 0.017, 0.022, x, 0.61, FZ - 0.02, { rx: HP });
      });
      // --- corner fenders (vertical rubber blocks wrapping both corners of this side)
      for (const cx of [-FX, FX]) {
        const sx = Math.sign(cx);
        B.box('gloss', '#1c1f26', 0.4, 2.2, 0.4, cx, -0.08, FZ, { round: true, r: 0.13 });
        for (const y of [-0.85, -0.15, 0.55]) {
          B.cyl('metal', C.steelDk, 0.024, 0.012, cx + sx * 0.08, y, FZ - 0.203, { rx: HP, seg: 6 });
          B.cyl('metal', C.steelDk, 0.024, 0.012, cx + sx * 0.203, y, FZ + 0.08, { rz: HP, seg: 6 });
        }
      }
      // --- livery (reads from the fuel dock): HALYARD + home port at the +X end, Kraken roundel + KRAKEN LINES on
      //     the -X half, draft marks at both ends. Text faces -Z (ry = PI) and runs toward -X for a viewer at -Z.
      text(B, 'HALYARD', 0.46, C.white, 9.6, -0.08, FZ, { ry: PI, weight: 0.16 });
      text(B, 'INKWAVE', 0.19, C.white, 9.6, -0.5, FZ, { ry: PI, weight: 0.17, spacing: 0.45 });
      const kl = textGeo('KRAKEN LINES', 0.52, { weight: 0.17, depth: 0.014 });
      const klW = kl.userData.width, klX = -8.7;
      B.add('paint', kl, C.white, klX, -0.34, FZ, { ry: PI });
      B.push(klX + klW / 2 + 0.72, -0.08, FZ, PI);                     // roundel reads before the lettering
      B.cyl('paint', C.teal, 0.44, 0.014, 0, 0, 0.007, { rx: HP, seg: 32 });
      B.tor('paint', C.white, 0.44, 0.024, 0, 0, 0.012, { rs: 5, ts: 32 });
      B.tube('paint', C.white, [P3(-0.26, -0.1, 0.018), P3(-0.21, 0.13, 0.018), P3(-0.02, 0.25, 0.018), P3(0.17, 0.15, 0.018), P3(0.15, -0.05, 0.018), P3(0.0, -0.08, 0.018), P3(-0.02, 0.06, 0.018), P3(0.06, 0.05, 0.018)], 0.036, { radial: 6 });
      B.tube('paint', C.white, [P3(-0.28, -0.23, 0.018), P3(-0.14, -0.29, 0.018), P3(0.0, -0.23, 0.018), P3(0.14, -0.29, 0.018), P3(0.28, -0.23, 0.018)], 0.03, { radial: 6 });
      B.pop();
      for (const cx of [-15.3, 15.3]) {
        for (const [s, y] of [['2', -1.4], ['4', -1.2], ['6', -1.0], ['8', -0.8], ['4M', -0.6]]) text(B, s, 0.1, C.white, cx, y, FZ, { ry: PI, weight: 0.18, depth: 0.008 });
      }
      // --- hawse pipes + stowed anchors near both ends, rust weeping below the pockets
      for (const cx of [-14.2, 14.2]) {
        B.push(cx, 0.36, FZ, PI);
        B.box('paint', C.hullDk, 0.72, 1.38, 0.03, 0, -0.56, 0.015, { round: true, r: 0.05 });
        B.tor('metal', C.steelDk, 0.17, 0.045, 0, 0.05, 0.03, { rs: 6, ts: 18 });
        B.cyl('paint', C.black, 0.15, 0.01, 0, 0.05, 0.032, { rx: HP, seg: 14 });
        B.push(0, -0.06, 0.02); anchor(B, '#4a4e55'); B.pop();
        streak(B, 0.1, -0.98, 0.034, 0.16, 0.7, weep, C.hull);
        streak(B, -0.13, -1.0, 0.034, 0.09, 0.45, mixc(C.hull, '#7a5646', 0.3), C.hull);
        B.pop();
      }
      // --- bulwark: outboard cap rail over its full run, stanchions + guard rail (top ≤ 2.35), inboard stiffeners
      for (const [x0, x1] of [[-15.0, -1.8], [1.8, 15.0]]) {
        const L = x1 - x0, xm = (x0 + x1) / 2, capX0 = x0 < 0 ? -FX : x0, capX1 = x0 < 0 ? x1 : FX;
        B.box('gloss', C.white, capX1 - capX0, 0.08, 0.1, (capX0 + capX1) / 2, 2.0, FZ + 0.03, { r: 0.03 });
        const n = Math.round(L / 1.45);
        for (let i = 0; i <= n; i++) {
          const x = x0 + (i / n) * L;
          post(B, 'metal', C.galv, 0.021, 0.28, x, 2.18, FZ + 0.04, { seg: 8 });
          bx(B, 'metal', C.galv, 0.07, 0.02, 0.07, x, 2.05, FZ + 0.04);
          if (i < n) bx(B, 'paint', seam, 0.05, 0.62, 0.05, x + L / n / 2, 1.62, FZ + 0.42);
        }
        B.cyl('metal', C.galv, 0.025, L, xm, 2.32, FZ + 0.04, { rz: HP, seg: 10 });
        B.cyl('metal', C.galv, 0.008, L, xm, 2.19, FZ + 0.04, { rz: HP, seg: 6 });
        for (const x of [x0, x1]) B.sph('metal', C.galv, 0.03, x, 2.32, FZ + 0.04, { ws: 8, hs: 6 });
        // guard rail over the outboard edge of the bulwark top: rail collider (nobody walks off the bulwark through
        // it; shots / ink / squids pass). 6 cm clear of the bulwark top, 0.75 m tall so a kid up there is pushed, not
        // lifted; it reaches 0.5 m outboard of the hull so its centre lies beyond the bulwark's outer face by more than a
        // foot's reach: a kid on the bulwark is always pushed back inboard, never overboard
        B.col(x0 < 0 ? x0 - 0.03 : x0, 2.06, FZ - 0.5, x0 < 0 ? x1 : x1 + 0.03, 2.75, FZ + 0.1, { rail: true });
      }
      // freeing ports along the bulwark foot, hinged flaps, wet streaks weeping down the hull below
      for (let x = -13.5; x <= 13.6; x += 3.0) {
        if (Math.abs(x) < 5) continue;
        B.box('paint', C.black, 0.5, 0.15, 0.012, x, 1.38, FZ - 0.006, { r: 0.02 });
        B.box('paint', C.hullDk, 0.54, 0.17, 0.02, x, 1.39, FZ - 0.022, { rx: 0.18, r: 0.02 });
        B.cyl('metal', C.steelDk, 0.012, 0.6, x, 1.47, FZ - 0.025, { rz: HP, seg: 6 });
        streak(B, x + 0.06, 0.6, FZ - 0.002, 0.34, 0.9, wet, C.hull, PI);
      }
      // rubbing strips on the hull either side of the gangway landing (below the belting)
      for (const s of [-1, 1]) B.box('rubber', C.rubber, 0.16, 1.5, 0.1, s * 1.95, -0.2, FZ - 0.05, { round: true, r: 0.04 });

      // --- the end: lowered car-ramp flap hanging below the deck edge (hinge knuckles, ribs, toe flaps, rams)
      const phi = 0.27, RW = 4.7, RL = 2.3;
      for (let k = 0; k < 7; k++) { const z = -RW / 2 + 0.3 + k * ((RW - 0.6) / 6); B.cyl('metal', k % 2 ? C.steelDk : C.steel, 0.075, 0.42, FX + 0.06, 1.19, z, { rx: HP, seg: 12 }); }
      B.box('metal', C.steelDk, 0.08, 0.22, RW + 0.2, FX + 0.04, 1.02, 0, { r: 0.02 });
      if (o.linkspan) {
        // Tower Command: the flap is off (the ferry lies against a float); a hazard-striped end plate under the knuckles
        B.box('metal', mixc(C.steel, C.hull, 0.35), 0.06, 0.7, RW - 0.2, FX + 0.03, 0.55, 0, { r: 0.02 });
        B.decal('hazard', RW - 0.4, 0.16, FX + 0.065, 0.82, 0, { ry: HP, tint: C.hazard });
      } else {
      B.push(FX + 0.08, 1.14, 0, 0, 0, phi);
      B.box('metal', mixc(C.steel, C.hull, 0.35), 0.16, RL, RW - 0.04, 0.08, -RL / 2, 0, { r: 0.04 });
      for (let s = 0.22; s < RL - 0.2; s += 0.19) B.box('metal', C.steel, 0.035, 0.03, RW - 0.34, 0.175, -s, 0, { r: 0.01 });
      for (const zs of [-1, 1]) {
        B.box('metal', C.steelDk, 0.26, RL, 0.1, 0.02, -RL / 2, zs * (RW / 2 - 0.05), { r: 0.03 });
        B.decal('hazard', RL - 0.1, 0.16, 0.06, -RL / 2, zs * (RW / 2 + 0.003), { ry: zs > 0 ? 0 : PI, rz: HP, tint: C.hazard });
      }
      for (let k = 0; k < 6; k++) {
        const z = -RW / 2 + 0.45 + k * ((RW - 0.9) / 5);
        B.push(0.1, -RL, z, 0, 0, 0.35);
        B.box('metal', C.steel, 0.05, 0.42, 0.66, 0, -0.21, 0, { r: 0.015 });
        B.pop();
        B.cyl('metal', C.steelDk, 0.04, 0.68, 0.1, -RL + 0.02, z, { rx: HP, seg: 8 });
      }
      B.pop();
      for (const zs of [-1, 1]) {
        const a = [FX + 0.02, -0.55, zs * 2.05];
        const t = 1.45, b = [FX + 0.08 + Math.sin(phi) * t, 1.14 - Math.cos(phi) * t, zs * 2.05];
        B.tube('metal', C.galv, [P3(...a), P3(a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55, a[2])], 0.07, { radial: 10 });
        B.tube('metal', C.steel, [P3(a[0] + (b[0] - a[0]) * 0.5, a[1] + (b[1] - a[1]) * 0.5, a[2]), P3(...b)], 0.04, { radial: 8 });
        B.box('metal', C.steelDk, 0.12, 0.26, 0.26, FX + 0.06, -0.55, zs * 2.05, { r: 0.03 });
      }
      }

      // --- mooring: double bitt in the free (-X) corner; line through a Panama chock to the Long Pier face
      B.box('metal', C.steelDk, 0.95, 0.05, 0.42, -14.0, DECK + 0.025, -4.12, { r: 0.02 });
      for (const s of [-1, 1]) B.lathe('gloss', C.black, [[0, 0], [0.13, 0], [0.13, 0.25], [0.18, 0.28], [0.18, 0.32], [0.11, 0.34], [0, 0.34]], -14.0 + s * 0.28, DECK + 0.03, -4.12, { seg: 14 });
      B.col(-14.5, DECK, -4.33, -13.5, DECK + 0.34, -3.91);
      bittTurns(B, -14.0, DECK + 0.1, -4.12, 0.28, 0.16, 2, C.rope);
      B.push(-14.0, 0, FZ + 0.4); chock(B, 0, 1.66, 0); B.pop();                               // inboard face
      B.push(-14.0, 0, FZ, PI); chock(B, 0, 1.66, 0); B.pop();                                 // outboard face
      rope(B, [-14.25, DECK + 0.2, -4.12], [-14.0, 1.66, FZ + 0.42], 0.03, 0.03);
      if (!o.linkspan) {
        rope(B, [-14.0, 1.66, FZ - 0.02], [-19.5 + 0.16, -0.72, -9.2], 0.4, 0.032);
        B.push(-19.5, 0, -9.2, HP); ringBolt(B, 0, -0.46, 0); B.pop();
      } else rope(B, [-14.0, 1.66, FZ - 0.02], [-15.2, 0.07, -5.46], 0.1, 0.032);   // down to a cleat on the float
      // breast lines either side of the gangway: horn cleats inboard, chocks through the bulwark, rings on the dock face
      for (const s of [-1, 1]) {
        const x = s * 4.4;
        B.box('metal', C.steelDk, 0.44, 0.06, 0.08, x, 1.84, FZ + 0.45, { r: 0.025 });
        B.box('metal', C.steelDk, 0.1, 0.12, 0.06, x, 1.79, FZ + 0.43, { r: 0.02 });
        B.push(x, 0, FZ + 0.4); chock(B, 0.3 * s, 1.62, 0); B.pop();
        B.push(x, 0, FZ, PI); chock(B, -0.3 * s, 1.62, 0); B.pop();
        rope(B, [x - 0.12 * s, 1.87, FZ + 0.47], [x + 0.3 * s, 1.62, FZ + 0.42], 0.02, 0.028);
        rope(B, [x + 0.3 * s, 1.62, FZ - 0.02], [s * 3.2, -0.72, -8.6 + 0.16], 0.28, 0.03);
        B.push(s * 3.2, 0, -8.6); ringBolt(B, 0, -0.46, 0); B.pop();
      }
      // stern line from the +X quarter to the boatyard face (clear of the plank)
      B.box('metal', C.steelDk, 0.44, 0.06, 0.08, 12.4, 1.84, FZ + 0.45, { r: 0.025 });
      B.box('metal', C.steelDk, 0.1, 0.12, 0.06, 12.4, 1.79, FZ + 0.43, { r: 0.02 });
      B.push(12.1, 0, FZ + 0.4); chock(B, 0, 1.62, 0); B.pop();
      B.push(12.1, 0, FZ, PI); chock(B, 0, 1.62, 0); B.pop();
      rope(B, [12.5, 1.87, FZ + 0.47], [12.1, 1.62, FZ + 0.42], 0.02, 0.028);
      rope(B, [12.1, 1.62, FZ - 0.02], [12.9, -0.72, -7.0 + 0.16], 0.1, 0.03);
      B.push(12.9, 0, -7.0); ringBolt(B, 0, -0.46, 0); B.pop();
    },
  };

  // ------------------------------------------------------------------------------------------------ ferry superstructure
  // Steel weathertight door on a wall (local plane z = 0, facing +Z), sill on y = 0: frame, leaf, porthole, dogs, hinges.
  function shipDoor(B, x, w = 0.84, h = 1.98, c = C.whiteDk, hingeSide = -1) {
    B.box('gloss', shade(c, 0.9), w + 0.16, h + 0.1, 0.03, x, (h + 0.1) / 2, 0.015, { round: true, r: 0.07 });   // frame
    B.box('gloss', c, w, h - 0.12, 0.035, x, 0.12 + (h - 0.12) / 2, 0.045, { round: true, r: 0.09 });           // leaf
    B.box('gloss', shade(c, 0.94), w - 0.18, 0.05, 0.012, x, 0.62, 0.068, { r: 0.01 });                       // kick rib
    B.box('metal', C.steelDk, w + 0.14, 0.1, 0.07, x, 0.05, 0.035, { r: 0.02 });                              // coaming sill
    // porthole: rim, dark glass, dogs
    const py = h - 0.52;
    B.tor('metal', C.steel, 0.15, 0.03, x, py, 0.07, { rs: 6, ts: 20 });
    B.cyl('gloss', C.glass, 0.14, 0.012, x, py, 0.066, { rx: HP, seg: 18 });
    for (let k = 0; k < 4; k++) { const a = PI / 4 + k * HP; B.box('metal', C.steelDk, 0.035, 0.05, 0.03, x + Math.cos(a) * 0.2, py + Math.sin(a) * 0.2, 0.07, { rz: a, r: 0.008 }); }
    // lever handle + dogs down the free edge, hinges on the other
    const fx = x - hingeSide * (w / 2 - 0.09);
    B.box('metal', C.steelDk, 0.05, 0.12, 0.05, fx, 1.02, 0.075, { r: 0.012 });
    B.box('metal', C.steel, 0.2, 0.035, 0.035, fx + hingeSide * 0.08, 1.02, 0.1, { r: 0.012 });
    for (const y of [0.35, h - 0.35]) B.box('metal', C.steelDk, 0.07, 0.04, 0.045, fx, y, 0.07, { r: 0.01 });
    for (const y of [0.34, h / 2 + 0.05, h - 0.3]) B.cyl('metal', C.steelDk, 0.028, 0.16, x + hingeSide * (w / 2 + 0.03), y, 0.06, { seg: 8 });
  }
  // Continuous glazed band (dark glass, thin light mullions, frame strips) on a wall plane z = 0 facing +Z.
  function glazing(B, x0, x1, y0, y1, n, o = {}) {
    noShadow(B, () => {
    const w = x1 - x0, xm = (x0 + x1) / 2, h = y1 - y0, ym = (y0 + y1) / 2, fc = o.frame ?? C.frameDk;
    B.box('gloss', C.glass, w, h, 0.02, xm, ym, 0.01, { r: 0.03 });
    B.box('gloss', fc, w + 0.08, 0.06, 0.04, xm, y1 + 0.02, 0.02, { r: 0.018 });
    B.box('gloss', fc, w + 0.08, 0.07, 0.05, xm, y0 - 0.025, 0.025, { r: 0.02 });
    for (let i = 0; i <= n; i++) B.box('gloss', fc, 0.07, h, 0.035, x0 + (i / n) * w, ym, 0.018, { r: 0.014 });
    // faint sky sheen near the top of each pane
    for (let i = 0; i < n; i++) B.box('gloss', C.glassLt, w / n - 0.14, h * 0.18, 0.004, x0 + ((i + 0.5) / n) * w, y1 - h * 0.16, 0.022, { r: 0.003 });
    });
  }
  // Life-raft canister stowed in a wall recess (local plane z = 0, facing +Z), lying along X.
  function raftCanister(B, x, y, L = 1.2, R = 0.2) {
    B.box('paint', shade(C.whiteDk, 0.7), L + 0.16, 2 * R + 0.1, 0.012, x, y, 0.006, { round: true, r: 0.08 });
    B.push(x, y, 0.12 - R, 0, 0, HP);
    const half = L / 2;
    B.lathe('gloss', C.white, [[0, -half], [R * 0.55, -half + 0.01], [R * 0.9, -half + 0.06], [R, -half + 0.16], [R, half - 0.16], [R * 0.9, half - 0.06], [R * 0.55, half - 0.01], [0, half]], 0, 0, 0, { seg: 18 });
    for (const yy of [-half + 0.3, half - 0.3]) B.cyl('gloss', C.black, R + 0.01, 0.05, 0, yy, 0, { seg: 18, open: true });
    B.cyl('gloss', C.white, R + 0.012, 0.012, 0, -0.05, 0, { seg: 18, open: true });
    B.pop();
    B.box('gloss', C.red, 0.1, 0.12, 0.06, x + L / 2 + 0.03, y - R + 0.04, 0.03, { r: 0.015 });   // hydrostatic release
    text(B, 'LIFERAFT', 0.06, C.navy, x - 0.05, y - 0.03, 0.117, { weight: 0.2, depth: 0.003 });
  }

  D.ferry_cabin = {
    desc: 'HALYARD passenger saloon (one long side): dark glazed window band with mullions + sky sheen, handrail under the sills, flush life-raft canisters in wall recesses, slim roof lip. Place at the origin (mirrored).',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      B.aoBase = null;
      // long wall z = -2.9 (face -Z); local frame: +Z out of the wall, +X = world -X. The livery stripe band (y 1.3…2.1)
      // and the cabin ends belong to the surfaces stream: everything here sits above y 2.15.
      B.push(0, DECK, -2.9, PI);
      glazing(B, -5.6, 5.6, 1.0, 1.9, 7);
      B.cyl('metal', C.galv, 0.02, 11.6, 0, 0.89, 0.075, { rz: HP, seg: 8 });                         // handrail under the sills
      for (let x = -5.6; x <= 5.61; x += 1.6) { B.box('metal', C.galv, 0.03, 0.03, 0.07, x, 0.89, 0.036, { r: 0.008 }); B.cyl('metal', C.galv, 0.03, 0.01, x, 0.89, 0.005, { rx: HP, seg: 8 }); }
      raftCanister(B, -3.0, 2.18);
      raftCanister(B, 3.0, 2.18);
      B.pop();
      // slim roof lip (sun-deck edge trim, ≤ 2 cm above the roof) along the long side
      B.box('gloss', C.white, 13.0, 0.1, 0.08, 0, 3.77, -2.94, { r: 0.03 });
      B.box('metal', C.steelDk, 13.0, 0.02, 0.03, 0, 3.71, -2.975, { r: 0.006 });
    },
  };

  // Wheelhouse, funnel + radar mast (centred, placed once: mirror false)
  D.ferry_bridge = {
    desc: 'HALYARD wheelhouse dressing (placed once at the wheelhouse base): raked wraparound windows, doors, sidelights, nameboards, wipers; the proud Kraken funnel (collider) with emblem, exhausts and horns; radar mast with two spinning scanners, yard, masthead lights, antennas and signal pennants.',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      B.aoBase = null;
      // --- windows on all four faces (local frames: +Z out of each face)
      const faces = [[1.5, 0, HP, 3.2, 'end'], [-1.5, 0, -HP, 3.2, 'end'], [0, 1.6, 0, 3.0, 'side'], [0, -1.6, PI, 3.0, 'side']];
      for (const [fx, fz, ry, W, kind] of faces) {
        B.push(fx, 0, fz, ry);
        if (kind === 'end') {
          const n = 4, x0 = -W / 2 + 0.16, x1 = W / 2 - 0.16;
          B.push(0, 0.55, 0, 0, 0);
          glazing(B, x0, x1, 0.0, 0.66, n, { frame: C.white });
          for (let i = 1; i < 3; i++) {                     // wipers
            const x = x0 + ((i + 0.5) / n) * (x1 - x0);
            B.box('paint', C.black, 0.02, 0.5, 0.012, x + 0.12, 0.3, 0.035, { rz: -0.5, r: 0.004 });
            B.cyl('metal', C.black, 0.02, 0.03, x, 0.05, 0.035, { rx: HP, seg: 6 });
          }
          B.pop();
          text(B, 'HALYARD', 0.12, C.navy, 0, 1.24, 0.003, { weight: 0.19, depth: 0.006 });
        } else {
          glazing(B, -1.36, 0.26, 0.55, 1.2, 2, { frame: C.white });
          shipDoor(B, 0.82, 0.68, 1.26, C.whiteDk, -1);
          for (const [lx, lc] of [[-1.32, C.red], [1.32, C.green]]) {           // sidelight screens (port red on -Z at +X)
            B.box('paint', C.black, 0.26, 0.2, 0.2, lx, 1.3 - 0.02, 0.1, { r: 0.02 });
            B.cyl('glow', lc, 0.05, 0.06, lx, 1.28, 0.2, { rx: HP, seg: 10, glow: 1.4 });
            B.blink(lc, lx, 1.28, 0.23, { size: 0.045, rate: 0.15, lo: 2.2, hi: 2.6 });
          }
        }
        B.box('gloss', C.white, W + 0.2, 0.05, 0.1, 0, 1.385, 0.05, { r: 0.02 });               // roof edge visor
        B.box('paint', mixc(C.hull, C.whiteDk, 0.35), W - 0.04, 0.1, 0.012, 0, 0.05, 0.006, { r: 0.004 });
        B.pop();
      }
      // --- the funnel: rounded-oval casing lofted with crisp paint bands (Kraken mustard / white / teal / soot top),
      //     flared rim, dark top plate, twin rain-capped exhausts + generator stack, emblem roundels on both long sides
      const FB = 1.4, FH = 2.4, FA = 0.85, FBz = 0.58, FR = 0.3, TAP = 0.06;
      const kAt = (h) => 1 - TAP * (h / FH);
      const soot = '#23262c';
      const bands = [[0, C.steelDk], [0.1, C.steelDk], [0.1, C.mustard], [1.6, C.mustard], [1.6, C.white], [1.68, C.white], [1.68, C.teal], [1.84, C.teal], [1.84, C.white], [1.89, C.white], [1.89, soot], [FH - 0.08, soot], [FH, soot]];
      const funnel = cached('ferryFunnel2', () => {
        const mb = new MB();
        const outline = rrectProf(FA, FBz, FR, 5);
        const rows = bands.map(([h], i) => { const k = kAt(h) * (i === bands.length - 1 ? 1.035 : 1); return outline.map(([u, v]) => [u * k, h, v * k]); });
        gridSurface(mb, rows, (i) => [0, bands[i][0], 0], (x, y, z, i) => col(bands[i][1]), true);
        const kt = kAt(FH) * 1.035, ki = kAt(FH) * 0.9;
        const rimOut = outline.map(([u, v]) => [u * kt, FH, v * kt]), rimIn = outline.map(([u, v]) => [u * ki, FH, v * ki]);
        const rimIn2 = outline.map(([u, v]) => [u * ki, FH - 0.06, v * ki]);
        gridSurface(mb, [rimOut, rimIn], () => [0, FH - 1, 0], () => col(soot), true);
        gridSurface(mb, [rimIn, rimIn2], () => [0, FH + 1, 0], () => col('#17181c'), true);
        polyFan(mb, rimIn2, [0, 1, 0], col('#17181c'));
        // base flange
        const f0 = outline.map(([u, v]) => [u * 1.05, 0, v * 1.05]), f1 = outline.map(([u, v]) => [u * 1.05, 0.06, v * 1.05]), f2 = outline.map(([u, v]) => [u, 0.06, v]);
        gridSurface(mb, [f0, f1], () => [0, 0.03, 0], () => col(C.steelDk), true);
        gridSurface(mb, [f1, f2], () => [0, -1, 0], () => col(C.steelDk), true);
        return mb.geo();
      });
      B.add('gloss', funnel, 'white', 0, FB, 0, {});
      B.col(-FA, FB, -FBz, FA, FB + FH, FBz);
      const topY = FB + FH;
      for (const [x, z, r, h] of [[0.36, 0, 0.12, 0.55], [-0.36, 0, 0.12, 0.55], [0, 0.26, 0.06, 0.38]]) {
        B.cyl('metal', '#2a2c31', r, h, x, topY + h / 2 - 0.06, z, { seg: 16 });
        B.lathe('metal', '#1d1e22', [[r * 0.8, 0], [r * 1.35, 0.05], [r * 1.4, 0.09], [r * 0.8, 0.07]], x, topY + h - 0.06, z, { seg: 16 });
        B.tor('metal', '#3a3c42', r + 0.01, 0.012, x, topY + 0.1, z, { rx: HP, rs: 4, ts: 16 });
      }
      // emblem roundels on the flat long sides (tilted with the taper), rivet rows at the band edges
      const hE = 0.95, zE = FBz * kAt(hE), tilt = Math.atan(TAP * FBz / FH);
      for (const s of [-1, 1]) {
        B.push(0, FB + hE, s * zE, s > 0 ? 0 : PI, -tilt);
        B.cyl('paint', C.white, 0.47, 0.012, 0, 0, 0.006, { rx: HP, seg: 36 });
        B.cyl('paint', C.teal, 0.42, 0.014, 0, 0, 0.008, { rx: HP, seg: 36 });
        B.tube('paint', C.white, [P3(-0.25, -0.1, 0.018), P3(-0.2, 0.13, 0.018), P3(-0.02, 0.24, 0.018), P3(0.16, 0.14, 0.018), P3(0.14, -0.05, 0.018), P3(0.0, -0.08, 0.018), P3(-0.02, 0.06, 0.018), P3(0.06, 0.05, 0.018)], 0.036, { radial: 6 });
        B.tube('paint', C.white, [P3(-0.27, -0.22, 0.018), P3(-0.135, -0.28, 0.018), P3(0.0, -0.22, 0.018), P3(0.135, -0.28, 0.018), P3(0.27, -0.22, 0.018)], 0.03, { radial: 6 });
        B.pop();
        for (let k = 0; k < 11; k++) {
          const x = -0.5 + k * 0.1, h = 1.55;
          B.sph('metal', shade(C.mustard, 0.8), 0.011, x, FB + h, s * (FBz * kAt(h) + 0.004), { ws: 5, hs: 3, half: true, rx: s * HP });
        }
      }
      // ladder up the +X end to the mast step, intake louvres on the -X end
      const endX = (h) => FA * kAt(h);
      for (let k = 0; k < 10; k++) { const h = 0.3 + k * 0.22; B.cyl('metal', C.galv, 0.013, 0.34, endX(h) + 0.09, FB + h, 0, { rx: HP, seg: 6 }); }
      for (const s of [-1, 1]) B.tube('metal', C.galv, [P3(endX(0.1) + 0.02, FB + 0.1, s * 0.17), P3(endX(0.2) + 0.09, FB + 0.2, s * 0.17), P3(endX(FH) + 0.09, FB + FH + 0.25, s * 0.17), P3(endX(FH) - 0.05, FB + FH + 0.42, s * 0.17)], 0.018, { radial: 6 });
      B.push(-endX(1.15) - 0.005, FB + 1.15, 0, -HP, -tilt);
      B.box('paint', '#2b2e34', 0.5, 0.56, 0.02, 0, 0, 0.01, { r: 0.03 });
      for (let k = 0; k < 7; k++) B.box('paint', shade(C.mustard, 0.85), 0.46, 0.035, 0.035, 0, -0.24 + k * 0.08, 0.025, { rx: -0.55, r: 0.008 });
      B.pop();
      // --- mast: tapered pole rising from the funnel top, radar bracket (twin scanners), yard, lights, antennas
      const m0 = topY, mTop = 7.4;
      B.lathe('gloss', C.white, [[0, m0], [0.1, m0], [0.085, m0 + 0.12], [0.055, mTop], [0, mTop + 0.01]], 0, 0, 0, { seg: 12 });
      const rb = 6.05;                                                                            // radar bracket (world 9.85, 4.65 m over the roof)
      B.box('gloss', C.white, 2.5, 0.1, 0.14, 0, rb, 0, { r: 0.03 });
      for (const s of [-1, 1]) {
        B.tube('gloss', C.white, [P3(0, rb - 0.75, 0), P3(s * 0.9, rb - 0.04, 0)], 0.03, { radial: 6 });
        B.box('gloss', C.whiteDk, 0.34, 0.24, 0.3, s * 1.1, rb + 0.17, 0, { round: true, r: 0.05 });  // turning unit
        radar(B, s * 1.1, rb + 0.3, 0, 1.7, s > 0 ? 2.4 : 2.9);
      }
      const yd = 6.8;                                                                             // signal yard (along Z)
      B.box('gloss', C.white, 0.08, 0.08, 1.9, 0, yd, 0, { r: 0.025 });
      for (const s of [-1, 1]) {
        B.cyl(ns(B, 'metal'), C.steelDk, 0.012, 1.1, 0, yd + 0.55, s * 0.9, { seg: 6 });            // whip antennas
        B.sph('gloss', C.white, 0.07, 0, yd + 0.1, s * 0.55, { ws: 10, hs: 6, half: true });        // GPS domes
        B.cyl('gloss', C.white, 0.035, 0.1, 0, yd + 0.05, s * 0.55, { seg: 8 });
      }
      B.cyl('paint', C.black, 0.07, 0.12, 0, mTop - 0.25, 0, { seg: 10 });                          // masthead lights
      B.blink('#fff4dc', 0, mTop - 0.25, 0, { size: 0.06, rate: 0.12, lo: 2.4, hi: 2.8 });
      B.cyl('paint', C.black, 0.07, 0.12, 0, yd - 0.45, 0, { seg: 10 });
      B.blink('#fff4dc', 0, yd - 0.45, 0, { size: 0.055, rate: 0.12, lo: 2.2, hi: 2.6 });
      B.blink('#ff5a4a', 0, mTop + 0.08, 0, { size: 0.05, rate: 0.5, lo: 0.3, hi: 4.5 });            // aviation blink on top
      // horns (trumpets fore + aft) and a searchlight on the mast
      for (const s of [-1, 1]) {
        B.push(s * 0.12, 4.55, 0, 0, 0, -s * HP);
        B.lathe('gloss', C.white, [[0.03, 0], [0.035, 0.25], [0.06, 0.4], [0.13, 0.5], [0.12, 0.52], [0.05, 0.42]], 0, 0, 0, { seg: 14 });
        B.pop();
      }
      B.box('metal', C.steelDk, 0.12, 0.1, 0.12, 0.08, 4.95, 0, { r: 0.02 });
      B.cyl('gloss', '#36383e', 0.1, 0.22, 0.25, 5.1, 0, { rz: HP, seg: 14 });
      B.cyl('glow', '#fff1d6', 0.085, 0.01, 0.362, 5.1, 0, { rz: HP, seg: 14, glow: 1.2 });
      // signal dressing line from the yardarm up to the masthead with pennants (all ≥ 4.6 m over the wheelhouse roof)
      const hy0 = [0, yd + 0.02, 0.92], hy1 = [0, mTop - 0.05, 0.05];
      B.tube(ns(B, 'rubber'), C.white, ropePts(hy0, hy1, 0.04, 8), 0.008, { radial: 4 });
      const pc = [C.teal, C.mustard, C.coral, C.navy];
      for (let k = 0; k < 4; k++) {
        const t = (k + 0.5) / 4.4, p = ropePts(hy0, hy1, 0.04, 40)[Math.round(t * 40)];
        B.flag(p[0], p[1], p[2], { color: pc[k], s: 1.25, ry: HP });
      }
    },
  };

  // ------------------------------------------------------------------------------------------------ ferry cover pieces
  D.ferry_locker = {
    desc: 'Lifejacket lockers on the ferry car deck (cover, collider 2.5 × 2.5 × 1.1): two GRP deck chests side by side with overhanging lids, piano hinges, hasps + padlocks, reflective tape, LIFEJACKETS lettering and the lifejacket pictogram.',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      const body = '#e9e5dc', lid = mixc(C.coral, '#d9d2c6', 0.25);
      for (const s of [-1, 1]) {
        const z = s * 0.63;
        B.box('paint', '#5b616a', 2.44, 0.08, 1.14, 0, 0.04, z, { r: 0.02 });                       // plinth rail
        B.box('gloss', body, 2.4, 0.9, 1.1, 0, 0.08 + 0.45, z, { round: true, r: 0.06 });
        for (let k = 0; k < 4; k++) B.box('gloss', shade(body, 0.95), 0.05, 0.66, 0.02, -0.9 + k * 0.6, 0.53, z + s * 0.555, { r: 0.012 });   // moulded ribs
        B.box('gloss', lid, 2.5, 0.12, 1.2, 0, 1.04, z, { round: true, r: 0.05 });
        B.box('gloss', shade(lid, 0.88), 2.44, 0.03, 1.16, 0, 0.965, z, { r: 0.012 });                // rain lip shadow line
        B.cyl('metal', C.galv, 0.02, 2.2, 0, 0.99, z - s * 0.56, { rz: HP, seg: 8 });                 // piano hinge (inboard)
        B.box('paint', C.hazard, 2.36, 0.05, 0.006, 0, 0.2, z + s * 0.553, { r: 0.002 });           // reflective tape
        for (const hx of [-0.7, 0.7]) {                                                              // hasps + padlocks
          B.box('metal', C.steel, 0.08, 0.16, 0.03, hx, 0.9, z + s * 0.565, { r: 0.01 });
          B.box('metal', '#9a8a4a', 0.07, 0.07, 0.03, hx, 0.8, z + s * 0.585, { r: 0.012 });
          B.tor('metal', C.steel, 0.022, 0.006, hx, 0.85, z + s * 0.585, { rs: 4, ts: 10, arc: PI });
        }
        text(B, 'LIFEJACKETS', 0.17, C.navy, 0.08, 0.5, z + s * 0.552, { ry: s > 0 ? 0 : PI, weight: 0.18, depth: 0.006 });
        text(B, '40 ADULT · 10 CHILD', 0.06, C.navy, 0.08, 0.34, z + s * 0.552, { ry: s > 0 ? 0 : PI, weight: 0.2, depth: 0.004 });
      }
      // lifejacket pictograms on both ends (orange vest on white)
      for (const s of [-1, 1]) {
        B.push(s * 1.203, 0.55, 0, s * HP);
        B.box('paint', C.white, 0.8, 0.5, 0.006, 0, 0, 0.003, { r: 0.01 });
        for (const side of [-1, 1]) B.box('paint', '#e07a3a', 0.16, 0.34, 0.006, side * 0.11, -0.02, 0.008, { r: 0.04 });
        B.box('paint', '#e07a3a', 0.12, 0.1, 0.006, 0, 0.14, 0.008, { r: 0.03 });
        B.box('paint', C.white, 0.05, 0.08, 0.006, 0, 0.1, 0.011, { r: 0.01 });
        B.box('paint', C.navy, 0.3, 0.02, 0.006, 0, -0.08, 0.011, { r: 0.004 });
        B.pop();
      }
      B.col(-1.25, 0, -1.25, 1.25, 1.1, 1.25);
      B.blob(3.0, 3.0);
    },
  };

  // Custom-size timber pallet (deck boards along X) at the current frame's origin.
  function palletXZ(B, L, W) {
    const nb = Math.max(3, Math.round(W / 0.19));
    for (const z of [-W / 2 + 0.05, 0, W / 2 - 0.05]) B.box('wood', shade(C.teak, B.r(0.95, 1.05)), L, 0.09, 0.1, 0, 0.065, z, { r: 0.012 });
    for (const z of [-W / 2 + 0.05, 0, W / 2 - 0.05]) B.box('wood', shade(C.teakDk, B.r(0.95, 1.05)), L, 0.02, 0.1, 0, 0.01, z, { r: 0.005 });
    for (let i = 0; i < nb; i++) B.box('wood', shade('#d2b082', B.r(0.9, 1.05)), 0.12, 0.022, W, -L / 2 + 0.06 + (i / (nb - 1)) * (L - 0.12), 0.121, 0, { r: 0.006 });
  }
  D.ferry_cargo = {
    desc: 'Deck cargo on the ferry car deck (cover: carton half solid 1 × 2 × 0.9, mesh cage half 1 × 2 × 1.4 = rail): a galvanised mesh stillage of spare fenders, buoys and rope on one pallet, a strapped stack of KRAKEN LINES cartons on the other, ratchet straps to deck rings, a sack truck.',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      // low half (+X): pallet + cartons strapped to 0.9 m
      B.push(0.5, 0, 0); palletXZ(B, 0.98, 1.98); B.pop();
      for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) {
        const y = 0.145 + i * 0.37, z = -0.64 + j * 0.64;
        B.box('paint', shade('#c8a177', B.r(0.9, 1.04)), 0.9, 0.36, 0.62, 0.5, y + 0.18, z, { r: 0.015 });
        B.box('paint', '#e7dcc4', 0.9, 0.004, 0.08, 0.5, y + 0.362, z, { r: 0.001 });                  // tape
        B.decal('stencil', 0.4, 0.2, 0.95 + 0.002, y + 0.2, z, { ry: HP, tint: C.navy });
      }
      for (const z of [-0.35, 0.35]) {                                                                // ratchet straps
        B.box('paint', '#e0a33a', 0.92, 0.012, 0.05, 0.5, 0.892, z, { r: 0.003 });
        for (const s of [-1, 1]) B.box('paint', '#e0a33a', 0.012, 0.86, 0.05, 0.5 + s * 0.456, 0.46, z, { r: 0.003 });
        B.box('metal', C.steel, 0.1, 0.06, 0.06, 0.956, 0.62, z, { r: 0.015 });
      }
      // high half (-X): galvanised stillage cage to 1.4 m with marine spares inside
      B.push(-0.5, 0, 0); palletXZ(B, 0.98, 1.98); B.pop();
      const x0 = -0.98, x1 = -0.02, y0 = 0.145, y1 = 1.4, z0 = -0.98, z1 = 0.98;
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) B.box('metal', C.galv, 0.045, y1 - y0, 0.045, x, (y0 + y1) / 2, z, { r: 0.01 });
      for (const y of [y0 + 0.02, y1 - 0.02]) {
        for (const z of [z0, z1]) B.box('metal', C.galv, x1 - x0, 0.04, 0.04, (x0 + x1) / 2, y, z, { r: 0.008 });
        for (const x of [x0, x1]) B.box('metal', C.galv, 0.04, 0.04, z1 - z0, x, y, 0, { r: 0.008 });
      }
      const hH = y1 - y0 - 0.06, yM = (y0 + y1) / 2;
      for (const [w, x, z, ry] of [[x1 - x0, (x0 + x1) / 2, z1, 0], [x1 - x0, (x0 + x1) / 2, z0, 0], [z1 - z0, x0, 0, HP], [z1 - z0, x1, 0, HP]]) B.add('fence', cached('pl|' + w.toFixed(2) + '|' + hH.toFixed(2), () => new THREE.PlaneGeometry(w - 0.05, hH)), C.galv, x, yM, z, { ry, uvs: [(w - 0.05) / 0.09, hH / 0.09] });
      B.add('fence', cached('pl|cagetop', () => new THREE.PlaneGeometry(x1 - x0 - 0.05, z1 - z0 - 0.05)), C.galv, (x0 + x1) / 2, y1, 0, { rx: -HP, uvs: [10, 20] });
      // contents: black cylindrical fenders, a coral mooring buoy, rope coil
      for (let k = 0; k < 3; k++) B.lathe('rubber', C.black, [[0, -0.42], [0.1, -0.41], [0.16, -0.34], [0.17, -0.2], [0.17, 0.2], [0.16, 0.34], [0.1, 0.41], [0, 0.42]], -0.72 + (k % 2) * 0.22, 0.34 + k * 0.33, -0.3 + k * 0.28, { rx: HP, rz: 0.1 * k, seg: 12 });
      B.sph('gloss', C.coral, 0.3, -0.45, 0.47, 0.5, { ws: 16, hs: 10 });
      B.cyl('gloss', C.white, 0.302, 0.08, -0.45, 0.47, 0.5, { seg: 16, open: true });
      for (let k = 0; k < 3; k++) B.tor('rubber', shade(C.rope, 0.95 + k * 0.03), 0.25 - k * 0.012, 0.03, -0.5, 0.2 + k * 0.055, -0.55, { rx: HP, rs: 5, ts: 18 });
      B.box('paint', C.white, 0.5, 0.18, 0.006, -0.5, 1.2, z1 + 0.03, { r: 0.01 });
      text(B, 'SPARES', 0.09, C.navy, -0.5, 1.155, z1 + 0.034, { weight: 0.2, depth: 0.004 });
      // sack truck leaning on the cage
      B.push(-0.99, 0, -0.55, 0, 0, 0.12);
      for (const s of [-1, 1]) B.cyl('metal', C.red, 0.018, 1.2, -0.05, 0.62, s * 0.18, { seg: 8 });
      B.box('metal', C.steelDk, 0.28, 0.02, 0.4, 0.06, 0.05, 0, { r: 0.006 });
      for (const s of [-1, 1]) B.cyl('rubber', C.black, 0.1, 0.06, -0.12, 0.1, s * 0.22, { rx: HP, seg: 14, bevel: 0.02 });
      B.cyl('metal', C.red, 0.018, 0.4, -0.05, 1.22, 0, { rx: HP, seg: 8 });
      B.pop();
      B.col(0, 0, -1, 1, 0.9, 1);                        // strapped cartons: solid cover
      B.col(-1, 0, -1, 0, 1.4, 1, { rail: true });      // mesh stillage cage: kids blocked, shots / ink / squids pass
      B.blob(2.4, 2.4);
    },
  };


  // ================================================================================================ RAMP DRESSING
  // Sloped handrail along a ramp edge: rail points sit `h` above the slope line at stations `ts` (0…1 along a → b).
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // Ferry sun-deck stair (Alpha: slope from (12.6, 1.3) up to (6.5, 3.8), z -2.9…-0.9; the mirror dresses Bravo's).
  // Both sides are open (the cabin end wall only meets the stair head), so both get cheek stringers with support flats
  // and stanchion handrails (0.95 m above the slope, 7 cm outboard of the walking width); the rails run out onto the
  // sun deck as landing stubs and turn down to the car deck at the foot. Nothing sits on or over the treads.
  D.ferry_stair = {
    desc: 'Ferry sun-deck stair dressing (place at the origin; mirrored): steel cheek stringers with flanges + support flats on both side faces, stanchion handrails with mid rails following the slope, landing stubs on the sun deck, foot returns. Handrails = rail colliders.',
    params: { zIn: "the stair's inner edge (-0.9; Tower Command -1.45)" }, variants: 1, mount: 'ground',
    build(B, o = {}) {
      B.aoBase = null;
      const lo = [12.6, 1.3], hi = [6.5, 3.8], L = Math.hypot(hi[0] - lo[0], hi[1] - lo[1]);
      const dx = (hi[0] - lo[0]) / L, dy = (hi[1] - lo[1]) / L, nx = dy, ny = -dx;          // up-slope dir + up-normal (0.379, 0.925)
      const ang = Math.atan2(dy, dx) - PI;                                  // box rz so +X runs down the slope
      const strC = shade('#6d7f95', 0.78), railC = C.galv;
      const at = (s) => [lo[0] + dx * s, lo[1] + dy * s];                  // point on the slope edge line, s from the foot
      for (const [ze, out] of [[-2.9, -1], [o.zIn ?? -0.9, 1]]) {
        const zS = ze + out * 0.03, zR = ze + out * 0.07;
        // cheek stringer: channel band just under the tread edge + bottom flange, bolted support flats down to the deck
        const mid = at(L / 2), off = 0.2;
        B.box('metal', strC, L + 0.3, 0.3, 0.06, mid[0] - nx * off + dx * -0.15, mid[1] - ny * off + dy * -0.15, zS, { rz: ang, r: 0.015 });
        B.box('metal', shade(strC, 0.85), L + 0.3, 0.04, 0.1, mid[0] - nx * 0.37 + dx * -0.15, mid[1] - ny * 0.37 + dy * -0.15, ze + out * 0.05, { rz: ang, r: 0.01 });
        noShadow(B, () => {
          for (let s = 0.9; s < L - 0.3; s += 1.05) {
            const p = at(s), top = p[1] - 0.4, h = top - DECK;
            if (h > 0.12) bx(B, 'metal', strC, 0.07, h, 0.04, p[0] + 0.14, DECK + h / 2, ze + out * 0.02);
            for (const q of [-0.07, 0.07]) cy(B, 'metal', '#50555c', 0.014, 0.016, p[0] + q * dx - nx * 0.08, p[1] + q * dy - ny * 0.08, ze + out * 0.064, { rx: HP });
          }
        });
        // stanchions (vertical, bolted to the stringer) + sloped top rail + mid rail
        const stations = [0.45, 2.0, 3.55, 5.1, L - 0.25];
        const tops = [];
        for (const s of stations) {
          const p = at(s);
          post(B, 'metal', railC, 0.022, 1.2, p[0], p[1] + 0.35, zR, { seg: 8 });
          bx(B, 'metal', shade(railC, 0.8), 0.07, 0.12, 0.05, p[0], p[1] - 0.15, ze + out * 0.045);
          tops.push([p[0], p[1] + 0.95, zR]);
        }
        const foot = at(0), head = at(L);
        const zL = out < 0 ? ze + 0.03 : zR;                                 // corridor side: landing stub stays on the sun deck
        const rail = [[foot[0] + 0.45, DECK + 0.02, zR], [foot[0] + 0.45, DECK + 0.6, zR], [foot[0] + 0.2, foot[1] + 0.92, zR], ...tops,
          [head[0] - 0.05, head[1] + 0.95, zR], [head[0] - 0.3, head[1] + 0.95, zL], [head[0] - 0.42, head[1] + 0.95, zL], [head[0] - 0.55, head[1] + 0.82, zL], [head[0] - 0.55, head[1] + 0.03, zL]];
        B.tube('metal', railC, rail.map((q) => P3(...q)), 0.025, { radial: 8 });
        B.tube('metal', railC, [P3(foot[0] + 0.3, foot[1] + 0.5 - 0.05, zR), ...stations.map((sv) => { const q = at(sv); return P3(q[0], q[1] + 0.5, zR); }), P3(head[0] - 0.2, head[1] + 0.5, zR), P3(head[0] - 0.55, head[1] + 0.5, zL)], 0.016, { radial: 6 });
        B.cyl('metal', shade(railC, 0.8), 0.045, 0.02, head[0] - 0.55, head[1] + 0.01, zL, { seg: 8 });   // landing foot on the sun deck
        B.cyl('metal', shade(railC, 0.8), 0.045, 0.02, foot[0] + 0.45, DECK + 0.01, zR, { seg: 8 });       // foot on the car deck
        // rail colliders (kids can't walk off the stair side; shots / ink / squids pass). Strips stay ≥ 4.5 cm off the
        // stair's side face and 6 cm above the decks so the level's face / bevel samples never land inside them.
        const [c0, c1] = out < 0 ? [ze - 0.13, ze - 0.045] : [ze + 0.045, ze + 0.13];   // (-3.03 keeps the corridor's nav row at z -3.5)
        const yS = (x) => lo[1] + (lo[0] - x) * (hi[1] - lo[1]) / (lo[0] - hi[0]);
        B.col(lo[0], DECK + 0.06, c0, foot[0] + 0.5, DECK + 0.95, c1, { rail: true });                           // foot return
        for (let i = 0; i < 4; i++) {
          const xa = lo[0] - ((lo[0] - hi[0]) * i) / 4, xb = lo[0] - ((lo[0] - hi[0]) * (i + 1)) / 4;
          B.col(xb, yS(xa) + 0.06, c0, xa, yS(xb) + 0.98, c1, { rail: true });
        }
        const [s0, s1] = out < 0 ? [ze + 0.005, ze + 0.1] : [c0, c1];                                          // sun-deck stub
        B.col(head[0] - 0.55, hi[1] + 0.06, s0, hi[0], hi[1] + 0.98, s1, { rail: true });
      }
    },
  };

  // Tug ramp (Alpha: x 16.4…18.6, slope from z -7.6 (y 0) up to the stern at z -13 (y 2.6); the mirror dresses Bravo's).
  // Scaffold-tube guardrails on standards set just outside both edges (sole boards + base plates on the yard), top rail
  // 0.95 m and mid rail 0.5 m above the slope, scaffold-board toe boards, couplers; the east rail is tied into the docks
  // stream's scaffold tower (posts x 19.05, z -12.87 / -11.85) at its ledger heights and the west rail to the tug's deck
  // rail end. Nothing over the 2.2 m walking width.
  D.tug_ramp_rails = {
    desc: 'Scaffold-style guardrails for the tug ramp (place at the origin; mirrored): galvanised standards on sole boards, sloped top + mid rails, timber toe boards, couplers, ties into the adjacent scaffold tower and the tug deck rail. Guardrails = rail colliders.',
    params: { z0: 'ramp foot z (-7.6)', z1: 'ramp head z (-13.0; Zone Control: -13.45, landing in the stern notch)' }, variants: 1, mount: 'ground',
    build(B, o = {}) {
      B.aoBase = 0;
      const z0 = o.z0 ?? -7.6, z1 = o.z1 ?? -13.0, H = 2.6, ySl = (z) => H * (z0 - z) / (z0 - z1), zStern = -13.0;
      const tube = '#c3cad0', cpl = '#8f979e', board = '#b89568';
      const standards = [-7.95, -9.6, -11.25, -12.87];
      const eastStd = [-7.95, -9.6, -11.85, -12.87];                         // east standards line up with the tower posts
      for (const [xe, out, zs] of [[16.4, -1, standards], [18.6, 1, eastStd]]) {
        const xs = xe + out * 0.1, xt = xe + out * 0.045;
        for (const z of zs) {
          const top = ySl(z) + 0.95;
          post(B, 'metal', tube, 0.024, top + 0.05, xs, (top + 0.05) / 2, z, { seg: 8 });
          bx(B, 'metal', cpl, 0.15, 0.012, 0.15, xs, 0.006, z);                                               // base plate
          bx(B, 'wood', shade(board, 0.8), 0.24, 0.035, 0.4, xs, 0.0, z);                                   // sole board
          noShadow(B, () => { for (const yy of [ySl(z) + 0.5, top]) bx(B, 'metal', cpl, 0.07, 0.06, 0.07, xs, yy, z); });
        }
        // top + mid rails along the slope (overhang the end standards a little), toe board on edge
        const za = zs[0] + 0.25, zb = zs[zs.length - 1] - 0.06;
        for (const h of [0.95, 0.5]) B.tube('metal', tube, [P3(xs, ySl(za) + h, za), P3(xs, ySl(zb) + h, zb)], 0.024, { radial: 8 });
        const zt0 = z0 - 0.1, zt1 = Math.max(z1, zStern) + 0.08, Lt = Math.hypot(zt0 - zt1, ySl(zt1) - ySl(zt0)), angT = Math.atan2(ySl(zt1) - ySl(zt0), zt0 - zt1);
        B.box('wood', board, 0.035, 0.15, Lt, xt, (ySl(zt0) + ySl(zt1)) / 2 + 0.075, (zt0 + zt1) / 2, { rx: angT, r: 0.008 });
        noShadow(B, () => { for (const z of zs) bx(B, 'metal', cpl, 0.03, 0.06, 0.05, xt + out * 0.03, ySl(z) + 0.09, z); });  // toe-board clips
      }
      // ties: east rail into the scaffold tower's west posts at its ledger heights; west rail clamped to the tug's rail end
      for (const [z, ys] of [[-12.87, [2.3, 3.18]], [-11.85, [2.3]]]) for (const y of ys) {
        B.tube('metal', tube, [P3(18.7, y, z), P3(19.05, y, z)], 0.024, { radial: 6 });
        noShadow(B, () => { bx(B, 'metal', cpl, 0.07, 0.07, 0.07, 18.7, y, z); bx(B, 'metal', cpl, 0.07, 0.07, 0.07, 19.03, y, z); });
      }
      B.tube('metal', tube, [P3(16.3, 2.85, -12.87), P3(16.21, 2.85, -13.06)], 0.02, { radial: 6 });
      noShadow(B, () => bx(B, 'metal', cpl, 0.07, 0.07, 0.07, 16.3, 2.85, -12.87));
      // rail colliders along both guardrails (≥ 4.5 cm off the ramp's side faces, 6 cm above the slope, clear of the
      // tug's stern face): kids can't step off the ramp side, shots / ink / squids pass. Up the slope they reach 0.2 m past
      // the standards so the nav keeps its ramp column in the middle (no bot plans a side entry / drop through the rail);
      // the foot box stays tight to the standards and starts at the first standard (z -7.95), so a kid walking the 0.6 m
      // strip between the ramp foot and the yard edge (the way onto the ramp, nav row z -7.5) never brushes it and is
      // never nudged toward the water.
      const zA = -7.95, zF = -8.3, zB = -12.95, n = 4;
      for (const [xa, xb, xn0, xn1] of [[15.98, 16.355, 16.2, 16.355], [18.645, 19.02, 18.645, 18.8]]) {
        B.col(xn0, 0.06, zF, xn1, ySl(zF) + 0.98, zA, { rail: true });
        for (let i = 0; i < n; i++) {
          const za = zF + ((zB - zF) * i) / n, zb = zF + ((zB - zF) * (i + 1)) / n;
          B.col(xa, ySl(za) + 0.06, zb, xb, ySl(zb) + 0.98, za, { rail: true });
        }
      }
    },
  };

  // ================================================================================================ ZONE CONTROL ACCESS (tug)
  // Zone Control only (dressing onlyIn 'zones'; place at the origin, mirrored): the two extra ways onto the tug deck
  // (the side zone). Blocks: tug-bow-stair (x 17.9…20.1, treads from z -29.95 on the yard up to the bow at z -24.0, y 2.6)
  // — the defenders' way up from the quay; the crate steps (colliders here, x 12.1…13.1 top 0.87 and x 13.1…14.5 top
  // 1.73, z -16.9…-13.3) against the west hull side along the aft deck to the stern corner — the attackers' way up from the mid side. The tug's
  // own rail / fender / hull clutter is opened for both by tug_dress { access: true }.
  const TA = { zF: -29.95, zH: -24.0, yH: 2.6, xL: 17.9, xR: 20.1, cx0: 12.1, cx1: 13.1, cx2: 14.5, cz0: -16.9, cz1: -13.3, cA: 0.87, cB: 1.73 };
  function crateBox(B, x0, x1, y0, y1, z0, z1, tone = 1, ry = 0) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0, wc = shade('#c9a47a', tone), dk = shade('#8d6a45', tone);
    B.push((x0 + x1) / 2, y0, (z0 + z1) / 2, ry);
    B.box('wood', wc, w - 0.03, h - 0.02, d - 0.03, 0, h / 2, 0, { r: 0.015 });
    noShadow(B, () => {
      for (let k = 1; k < 5; k++) { const yy = (k * h) / 5; bx(B, 'wood', shade(wc, 0.72), w - 0.05, 0.008, d - 0.018, 0, yy, 0); bx(B, 'wood', shade(wc, 0.72), w - 0.018, 0.008, d - 0.05, 0, yy, 0); }
      for (const yy of [0.05, h - 0.05]) {
        for (const sz of [-1, 1]) bx(B, 'wood', dk, w - 0.01, 0.09, 0.04, 0, yy, sz * (d / 2 - 0.02));
        for (const sx of [-1, 1]) bx(B, 'wood', dk, 0.04, 0.09, d - 0.09, sx * (w / 2 - 0.02), yy, 0);
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(B, 'wood', dk, 0.06, h - 0.16, 0.06, sx * (w / 2 - 0.03), h / 2, sz * (d / 2 - 0.03));
      // diagonal braces on the long (x) faces
      for (const sx of [-1, 1]) { B.push(sx * (w / 2 - 0.012), h / 2, 0, 0, Math.atan2(h - 0.2, d - 0.2) * sx); bx(B, 'wood', dk, 0.025, 0.08, Math.hypot(d - 0.2, h - 0.2), 0, 0, 0); B.pop(); }
    });
    B.box('wood', shade(wc, 1.05), w - 0.05, 0.03, d - 0.05, 0, h - 0.005, 0, { r: 0.01 });   // lid
    B.pop();
  }
  function palletUnder(B, x0, x1, z0, z1, tone = 1) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const f of [-0.42, 0, 0.42]) bx(B, 'wood', shade('#7b5a3a', tone), w - 0.02, 0.1, 0.1, cx, 0.05, cz + f * (d - 0.1) / 0.84 * 0.84);
    noShadow(B, () => { for (let i = 0; i < Math.round(w / 0.17); i++) bx(B, 'wood', shade('#b48f63', tone * (0.92 + (i % 3) * 0.04)), 0.13, 0.022, d - 0.02, x0 + 0.08 + i * ((w - 0.16) / Math.max(1, Math.round(w / 0.17) - 1)), 0.111, cz); });
  }
  D.tug_access = {
    desc: 'Zone Control access to the tug deck (place at the origin; mirrored): steel boarding-stair dressing on the tug-bow-stair block (cheek stringers, support flats, galvanised stanchion handrails with mid rails, hazard kick plates, rails turned down onto the foredeck — rail colliders) and a two-step stack of braced timber spares crates on pallets against the west hull side (colliders: 0.87 m and 1.73 m steps up to the 2.6 m deck), stencilled NUDGE SPARES, lashed with rope.',
    params: { stairOnly: 'Tower Command: the bow ramp dressing only (no crate steps)' }, variants: 1, mount: 'ground',
    build(B, o = {}) {
      B.aoBase = 0;
      // ---------------- bow boarding stair (slope along +Z)
      const { zF, zH, yH, xL, xR } = TA, run = zH - zF, L = Math.hypot(run, yH), dz = run / L, dy = yH / L, th = Math.atan2(yH, run);
      const nz = -dy, ny = dz;                                                  // up-normal of the slope (z, y)
      const at = (sv) => [zF + dz * sv, dy * sv];                               // [z, y] on the slope's edge line, sv from the foot
      const ySl = (z) => yH * (z - zF) / run;
      const strC = shade('#6d7f95', 0.78), railC = C.galv;
      for (const [xe, out] of [[xL, -1], [xR, 1]]) {
        const xS = xe + out * 0.03, xR2 = xe + out * 0.07;
        const mid = at(L / 2);
        B.box('metal', strC, 0.06, 0.3, L + 0.3, xS, mid[1] - ny * 0.2 - dy * 0.15, mid[0] - nz * 0.2 - dz * 0.15, { rx: -th, r: 0.015 });
        B.box('metal', shade(strC, 0.85), 0.1, 0.04, L + 0.3, xe + out * 0.05, mid[1] - ny * 0.37 - dy * 0.15, mid[0] - nz * 0.37 - dz * 0.15, { rx: -th, r: 0.01 });
        noShadow(B, () => {
          for (let sv = 0.9; sv < L - 0.3; sv += 1.05) {
            const p = at(sv), top = p[1] - 0.4;
            if (top > 0.12) bx(B, 'metal', strC, 0.04, top, 0.07, xe + out * 0.02, top / 2, p[0] - 0.14);
            for (const q of [-0.07, 0.07]) cy(B, 'metal', '#50555c', 0.014, 0.016, xe + out * 0.064, p[1] + q * dy - ny * 0.08, p[0] + q * dz - nz * 0.08, { rz: HP });
          }
        });
        // stanchions + sloped top rail + mid rail; the rail turns down onto the foredeck at the head, into the yard at the foot
        const stations = [0.45, 2.0, 3.55, 5.1, L - 0.25], tops = [];
        for (const sv of stations) {
          const p = at(sv);
          post(B, 'metal', railC, 0.022, 1.2, xR2, p[1] + 0.35, p[0], { seg: 8 });
          bx(B, 'metal', shade(railC, 0.8), 0.05, 0.12, 0.07, xe + out * 0.045, p[1] - 0.15, p[0]);
          tops.push([xR2, p[1] + 0.95, p[0]]);
        }
        const foot = at(0), head = at(L);
        const rail = [[xR2, 0.02, foot[0] - 0.45], [xR2, 0.6, foot[0] - 0.45], [xR2, foot[1] + 0.92, foot[0] - 0.2], ...tops,
          [xR2, head[1] + 0.95, head[0] + 0.05], [xR2, head[1] + 0.95, head[0] + 0.3], [xR2, head[1] + 0.82, head[0] + 0.42], [xR2, head[1] + 0.03, head[0] + 0.42]];
        B.tube('metal', railC, rail.map((q) => P3(...q)), 0.025, { radial: 8 });
        B.tube('metal', railC, [P3(xR2, foot[1] + 0.45, foot[0] - 0.3), ...stations.map((sv) => { const q = at(sv); return P3(xR2, q[1] + 0.5, q[0]); }), P3(xR2, head[1] + 0.5, head[0] + 0.2), P3(xR2, head[1] + 0.5, head[0] + 0.42)], 0.016, { radial: 6 });
        B.cyl('metal', shade(railC, 0.8), 0.045, 0.02, xR2, head[1] + 0.01, head[0] + 0.42, { seg: 8 });
        B.cyl('metal', shade(railC, 0.8), 0.045, 0.02, xR2, 0.01, foot[0] - 0.45, { seg: 8 });
        // rail colliders (kids can't step off the stair side; shots / ink / squids pass): ≥ 4.5 cm off the side face, 6 cm
        // above the slope; the head stub runs onto the foredeck to meet the tug rail's end post
        const [c0, c1] = out < 0 ? [xe - 0.13, xe - 0.045] : [xe + 0.045, xe + 0.13];
        B.col(c0, 0.06, foot[0] - 0.5, c1, 0.95, zF, { rail: true });
        for (let i = 0; i < 4; i++) {
          const za = zF + (run * i) / 4, zb = zF + (run * (i + 1)) / 4;
          B.col(c0, ySl(za) + 0.06, za, c1, ySl(zb) + 0.98, zb, { rail: true });
        }
        B.col(c0, yH + 0.06, zH, c1, yH + 0.98, zH + 0.45, { rail: true });
      }
      if (o.stairOnly) return;
      // ---------------- crate steps against the west hull side (attackers' way up from the mid side)
      const { cx0, cx1, cx2, cz0, cz1, cA, cB } = TA, zm = (cz0 + cz1) / 2;
      palletUnder(B, cx0 + 0.02, cx1 - 0.01, cz0 + 0.03, zm - 0.02, 0.95);
      palletUnder(B, cx0 + 0.02, cx1 - 0.01, zm + 0.02, cz1 - 0.03, 1.02);
      crateBox(B, cx0 + 0.04, cx1 - 0.02, 0.122, cA, cz0 + 0.05, zm - 0.03, 0.97);
      crateBox(B, cx0 + 0.02, cx1 - 0.03, 0.122, cA, zm + 0.03, cz1 - 0.06, 1.04);
      palletUnder(B, cx1 + 0.02, cx2 - 0.03, cz0 + 0.03, cz1 - 0.03, 0.9);
      crateBox(B, cx1 + 0.04, cx2 - 0.04, 0.122, 0.93, cz0 + 0.05, cz1 - 0.05, 1.0);
      crateBox(B, cx1 + 0.05, cx2 - 0.05, 0.93, cB, cz0 + 0.12, zm - 0.02, 0.92);
      crateBox(B, cx1 + 0.06, cx2 - 0.04, 0.93, cB, zm + 0.02, cz1 - 0.1, 1.06);
      // stencils on the faces toward the yard (-X) and the ends (±Z)
      B.push(cx0 + 0.05, 0, zm, -HP);
      text(B, 'NUDGE', 0.12, '#3a3f4a', 0.6, 0.55, 0.004, { weight: 0.2 });
      text(B, 'SPARES', 0.09, '#3a3f4a', 0.6, 0.38, 0.004, { weight: 0.2, spacing: 0.3 });
      text(B, 'THIS WAY UP', 0.06, '#3a3f4a', -0.7, 0.62, 0.004, { weight: 0.2, spacing: 0.2 });
      B.pop();
      B.push(cx1 + 0.075, 0, zm, -HP);
      text(B, 'HALYARD BOATYARD', 0.09, '#3a3f4a', 0.7, 1.45, 0.004, { weight: 0.2, spacing: 0.2 });
      B.pop();
      B.push((cx1 + cx2) / 2, 0, cz0 + 0.065, PI);
      text(B, 'FRAGILE', 0.08, '#b0473b', 0, 0.62, 0.004, { weight: 0.22, spacing: 0.3 });
      B.pop();
      // rope lashings over the upper crates (down to pallet rings) + a coil left on the lower step
      for (const zz of [cz0 + 0.45, zm - 0.35, zm + 0.4, cz1 - 0.45]) {
        B.tube(ns(B, 'rubber'), C.rope, [P3(cx1 + 0.03, 0.2, zz), P3(cx1 + 0.03, cB + 0.005, zz), P3(cx2 - 0.3, cB + 0.02, zz), P3(cx2 - 0.05, cB + 0.005, zz)], 0.012, { radial: 4 });
      }
      B.tor('rubber', C.ropeDk, 0.2, 0.035, cx0 + 0.5, cA + 0.035, cz1 - 0.55, { rx: HP, rs: 5, ts: 16 });
      B.tor('rubber', C.rope, 0.14, 0.03, cx0 + 0.5, cA + 0.09, cz1 - 0.55, { rx: HP, rs: 5, ts: 14 });
      // colliders: the two steps (walkable tops)
      B.col(cx0, 0, cz0, cx1, cA, cz1);
      B.col(cx1, 0, cz0, cx2, cB, cz1);
    },
  };

  // ================================================================================================ small-boat library
  // Parametric lofted hull, waterline at y = 0, stern at z = -L/2, bow at +L/2. spec: L, B (beam), T (depth of the
  // canoe body below the waterline), F0/F1 (freeboard at stern/bow), tr (transom width fraction; 0 = pointed stern),
  // rake (bow overhang at the sheer), chine (0 round bilge … 1 hard chine), flare. Returns { geo, sheer(t) → [hb, top, z],
  // at(t, s, side), yAt(t, y) → s, band(y0, y1, color) → ribbon geo, deck(color, camber) → geo }.
  function makeHull(sp) {
    const { L, B: Bm, T, F0, F1, tr = 0.7, rake = 0.3, chine = 0, flare = 0.06, NS = 20, NP = 7, sternRake = 0.1, keelRise = 0.6 } = sp;
    const hb = (t) => {
      if (t < 0.46) { const u = t / 0.46; return (Bm / 2) * (tr + (1 - tr) * Math.pow(Math.sin(u * HP), 0.6)); }
      const u = (t - 0.46) / 0.54; return (Bm / 2) * Math.pow(Math.max(0, Math.cos(u * HP)), 0.85);
    };
    const top = (t) => F0 + (F1 - F0) * Math.pow(t, 1.7);
    const bot = (t) => -T * (1 - keelRise * Math.pow(Math.max(0, (t - 0.55) / 0.45), 1.6)) * (1 - 0.25 * Math.pow(Math.max(0, 0.12 - t) / 0.12, 1.5));
    const zOf = (t, v) => { // v: 0 at the keel … 1 at the sheer; bow + stern rake with height
      const z = -L / 2 + t * L;
      return z + rake * Math.pow(Math.max(0, (t - 0.8) / 0.2), 1.5) * v * v - sternRake * Math.pow(Math.max(0, (0.06 - t) / 0.06), 1) * v;
    };
    const at = (t, s, side) => {
      const b = hb(t), y0 = bot(t), y1 = top(t);
      const round = 1 - Math.cos(s * HP), g = Math.pow(Math.sin(s * HP), 0.55);
      const hard = s < 0.55 ? (s / 0.55) * 0.92 : 0.92 + (s - 0.55) / 0.45 * 0.08;
      const hardY = s < 0.55 ? (s / 0.55) * 0.18 : 0.18 + (s - 0.55) / 0.45 * 0.82;
      const gx = g * (1 - chine) + hard * chine, gy = round * (1 - chine) + hardY * chine;
      const x = side * b * gx * (1 + flare * Math.max(0, s - 0.6) / 0.4);
      const y = y0 + (y1 - y0) * gy;
      return [x, y, zOf(t, gy)];
    };
    const yAt = (t, y) => { // s where the section reaches height y (bisection on the monotone gy)
      let a = 0, b = 1;
      for (let k = 0; k < 24; k++) { const m = (a + b) / 2; if (at(t, m, 1)[1] < y) a = m; else b = m; }
      return (a + b) / 2;
    };
    const geo = () => {
      const mb = new MB(), rows = [];
      for (let i = 0; i <= NS; i++) {
        const t = i / NS, row = [];
        for (let j = -NP; j <= NP; j++) row.push(at(Math.min(t, 0.9995), Math.abs(j) / NP, j < 0 ? -1 : 1));
        rows.push(row);
      }
      gridSurface(mb, rows, (i, j) => { const t = i / NS; return [0, (bot(t) + top(t)) / 2, rows[i][j][2]]; }, null);
      // transom (flat, raked)
      if (tr > 0.05) { const st = rows[0]; polyFan(mb, st.map((p) => [p[0], p[1], p[2]]), [0, 0, -1], null); }
      return mb.geo();
    };
    const band = (Y0, Y1, off = 0.004) => {
      const mb = new MB(), rows = [];
      const tmax = 0.995, fy = (Y, t) => (typeof Y === 'function' ? Y(t) : Y);
      const y0 = fy(Y0, 0.5), y1 = fy(Y1, 0.5);
      for (let i = 0; i <= NS * 2; i++) {
        const t = Math.min(tmax, i / (NS * 2)), a0 = fy(Y0, t), a1 = fy(Y1, t); if (bot(t) > a0 - 0.001 || top(t) < a1) continue;
        const row = [];
        for (const side of [-1, 1]) {
          const pa = at(t, yAt(t, a0), side), pb = at(t, yAt(t, a1), side);
          row.push([pa[0] + side * off, pa[1], pa[2]], [pb[0] + side * off, pb[1], pb[2]]);
        }
        rows.push(row);
      }
      for (const side of [0, 1]) {
        const strip = rows.map((r) => [r[side * 2], r[side * 2 + 1]]);
        if (strip.length > 1) gridSurface(mb, strip, (i) => [0, (y0 + y1) / 2, strip[i][0][2]], null);
      }
      // across the transom
      if (tr > 0.05 && rows.length) { const r = rows[0]; gridSurface(mb, [[r[0], r[1]], [r[2], r[3]]].map((q) => q.map((p) => [p[0], p[1], p[2] - off])), () => [0, (y0 + y1) / 2, r[0][2] + 1], null); }
      return mb.geo();
    };
    const deck = (camber = 0.04, inset = 0.0) => {
      const mb = new MB(), rows = [];
      for (let i = 0; i <= NS; i++) {
        const t = Math.min(0.998, i / NS), l = at(t, 1, -1), r = at(t, 1, 1), row = [];
        for (let k = 0; k <= 4; k++) { const u = k / 4, x = l[0] + (r[0] - l[0]) * u; row.push([x * (1 - inset), l[1] - 0.012 + camber * Math.sin(u * PI) * Math.min(1, hb(t) * 4), l[2]]); }
        rows.push(row);
      }
      gridSurface(mb, rows, (i, j) => [rows[i][j][0], rows[i][j][1] - 1, rows[i][j][2]], null);
      return mb.geo();
    };
    const sheer = (t) => { const p = at(t, 1, 1); return [p[0], p[1], p[2]]; };
    return { geo, band, deck, sheer, at, yAt, hb, top, bot, spec: sp };
  }
  function hullOf(key, spec) { return cached('hull|' + key, () => { const h = makeHull(spec); return { h, body: h.geo(), deckGeo: h.deck(spec.camber ?? 0.05) }; }); }

  // Sea kayak (pointed both ends) lying along local Z at (x, y, z): hull + deck, cockpit coaming, bungees, grab toggles.
  const kayakTop = (L, H, z) => { const t = z / L + 0.5, sn = Math.max(0, Math.sin(t * PI)); return H * (0.55 + 0.45 * Math.pow(sn, 0.45)) + 0.05 * Math.pow(Math.abs(t - 0.5) * 2, 3); };
  function kayakGeo(L, W, H) {
    return cached(['kayak', L, W, H].join('|'), () => {
      const mb = new MB(), NS = 16, NP = 6, rows = [];
      for (let i = 0; i <= NS; i++) {
        const t = i / NS, sw = Math.pow(Math.sin(t * PI), 0.62), z = (t - 0.5) * L;
        const w = Math.max(0.004, (W / 2) * sw), hTop = kayakTop(L, H, z), hBot = H * 0.45 * Math.pow(Math.sin(t * PI), 0.5);
        const row = [];
        for (let j = 0; j < NP * 2; j++) { const a = (j / (NP * 2)) * TAU; const c = Math.cos(a), sn = Math.sin(a); row.push([w * c, sn > 0 ? sn * hTop : sn * hBot, z]); }
        rows.push(row);
      }
      gridSurface(mb, rows, (i) => [0, 0.02, rows[i][0][2]], null, true);
      return mb.geo();
    });
  }
  function kayakMesh(B, x, y, z, L, W, H, c, ry = 0) {
    B.push(x, y, z, ry);
    B.add('gloss', kayakGeo(L, W, H), c, 0, 0, 0, {});
    const cz = -0.12, dy = kayakTop(L, H, cz);
    B.cyl('gloss', C.black, W * 0.3, 0.03, 0, dy - 0.005, cz, { sz: 1.9, seg: 16 });                  // cockpit well
    B.tor('gloss', shade(c, 0.7), W * 0.31, 0.02, 0, dy + 0.012, cz, { rx: HP, sy: 1.9, rs: 5, ts: 20 });
    for (const zz of [0.62, 0.9, -0.8]) B.box('rubber', C.black, W * 0.5 * Math.pow(Math.sin((zz / L + 0.5) * PI), 0.62), 0.012, 0.014, 0, kayakTop(L, H, zz) + 0.004, zz, { r: 0.004 });
    B.box('gloss', C.black, 0.018, 0.012, 0.9, 0, kayakTop(L, H, 0.95) + 0.006, 0.95, { r: 0.004 });   // deck line
    for (const zz of [L / 2 - 0.08, -L / 2 + 0.08]) B.tor('rubber', C.black, 0.035, 0.008, 0, kayakTop(L, H, zz) - 0.04, zz, { rs: 3, ts: 8 });
    B.pop();
  }


  // ------------------------------------------------------------------------------------------------ outboard motor
  // Outboard hung on a transom at the current frame's origin (transom face at z = 0, motor aft toward -Z), tilted up by `tilt`.
  function outboard(B, c = '#2b2e34', tilt = 0, s = 1) {
    B.push(0, 0, -0.06 * s, 0, -tilt);
    B.box('metal', C.steelDk, 0.12 * s, 0.22 * s, 0.1 * s, 0, 0.02 * s, 0.04 * s, { r: 0.02 });                 // clamp bracket
    B.box('gloss', c, 0.34 * s, 0.36 * s, 0.5 * s, 0, 0.26 * s, -0.2 * s, { round: true, r: 0.1 * s });          // cowling
    B.box('gloss', shade(c, 1.4), 0.345 * s, 0.03 * s, 0.505 * s, 0, 0.14 * s, -0.2 * s, { r: 0.01 });
    B.box('gloss', c, 0.16 * s, 0.62 * s, 0.2 * s, 0, -0.26 * s, -0.16 * s, { round: true, r: 0.05 * s });      // midsection + leg
    B.box('gloss', c, 0.36 * s, 0.03 * s, 0.34 * s, 0, -0.5 * s, -0.2 * s, { r: 0.01 });                         // cavitation plate
    B.box('gloss', c, 0.1 * s, 0.14 * s, 0.26 * s, 0, -0.6 * s, -0.16 * s, { round: true, r: 0.04 * s });       // gearcase
    for (let k = 0; k < 3; k++) bx(B, 'metal', C.steel, 0.02 * s, 0.14 * s, 0.05 * s, 0, -0.6 * s, -0.3 * s, { rz: k * TAU / 3 + 0.3 });
    B.pop();
  }

  // ------------------------------------------------------------------------------------------------ marina pontoons
  // Floating pontoon along local +X (from x = 0 to L), width W, deck `dy` above the sea: plank decking in units with
  // joint plates, timber fascia + rubbing strip, black float drums at the waterline, cleats, optional service pedestals.
  const SEA = -1.6;
  function pontoonRun(B, L, W, o = {}) {
    const dy = o.dy ?? 0.45, top = SEA + dy, unit = o.unit ?? 4.4, n = Math.max(1, Math.round(L / unit)), u = L / n;
    const wood = o.wood ?? '#b99670';
    for (let k = 0; k < n; k++) {
      const x0 = k * u, xm = x0 + u / 2;
      const nb = Math.max(3, Math.round(W / 0.4));
      for (let b = 0; b < nb; b++) bx(B, 'wood', shade(wood, 0.9 + ((k * 3 + b * 7) % 5) * 0.035), u - 0.03, 0.05, W / nb - 0.02, xm, top - 0.025, -W / 2 + (b + 0.5) * (W / nb));
      bx(B, 'metal', C.galv, 0.12, 0.012, W - 0.1, x0 + (k ? 0 : 0.06), top + 0.001, 0);                   // joint plate
      for (const zs of [-1, 1]) {
        bx(B, 'wood', shade(wood, 0.75), u, 0.24, 0.07, xm, top - 0.14, zs * (W / 2 + 0.035));              // fascia
        bx(B, 'rubber', C.rubber, u - 0.1, 0.06, 0.05, xm, top - 0.2, zs * (W / 2 + 0.09));                  // rub strip
        bx(B, 'rubber', '#23262b', u - 0.3, 0.4, 0.5, xm, SEA - 0.05, zs * (W / 2 - 0.3));                 // float drum
      }
      if (o.cleats !== false && k % 2 === 0) for (const zs of (o.cleatSides || [-1, 1])) {
        const cx = xm, cz = zs * (W / 2 - 0.12);
        bx(B, 'metal', C.galv, 0.12, 0.07, 0.05, cx, top + 0.035, cz);
        bx(B, 'metal', C.galv, 0.3, 0.03, 0.05, cx, top + 0.075, cz);
      }
    }
  }
  // Steel guide pile with a conical cap and a pontoon hoop (at x, z; hoop around the pontoon edge).
  function guidePile(B, x, z, h = 3.2, r = 0.16) {
    B.cyl('metal', '#6f7479', r, h + 1.0, x, SEA + (h + 1.0) / 2 - 1.0, z, { seg: 10 });
    B.lathe('gloss', C.white, [[0, 0], [r + 0.03, 0], [r + 0.03, 0.06], [0.03, 0.32], [0, 0.33]], x, SEA + h, z, { seg: 10 });
    B.cyl('paint', '#2d3a2f', r + 0.004, 0.5, x, SEA + 0.1, z, { seg: 10, open: true });                    // weed line
    B.tor('metal', C.galv, r + 0.07, 0.025, x, SEA + 0.6, z, { rx: HP, rs: 4, ts: 12 });
  }

  // Spray dodger: canvas hood lofted over arch sections (low sloped front → full-height open back), base at y 0,
  // front at z = 0 running aft (-Z). Returns { canvas, frame } geometries.
  function dodgerGeo(w, h, d) {
    return cached(['dodger', w, h, d].join('|'), () => {
      const mb = new MB(), rows = [], st = [[0, 0.22, 0.86], [0.25, 0.78, 0.96], [0.6, 1.0, 1.0], [1.0, 1.0, 1.0]];
      for (const [f, hk, wk] of st) {
        const row = [];
        for (let j = 0; j <= 10; j++) { const a = (j / 10) * PI, c = Math.cos(a), sn = Math.sin(a); row.push([c * (w / 2) * wk, Math.pow(sn, 0.55) * h * hk + (1 - sn) * 0.0, -f * d]); }
        rows.push(row);
      }
      gridSurface(mb, rows, (i2, j) => [0, 0, rows[i2][j][2]], null);
      const g = mb.geo();
      const fr = []; for (let j = 0; j <= 10; j++) { const a = (j / 10) * PI; fr.push(P3(Math.cos(a) * (w / 2 + 0.01), Math.pow(Math.sin(a), 0.55) * h + 0.012, -d + 0.02)); }
      return { canvas: g, frame: fr };
    });
  }

  // ------------------------------------------------------------------------------------------------ SAILBOAT
  // Masthead cruising yacht, waterline at the prop's y (put pos y at the sea, -1.6), bow toward local +Z.
  function sailboat(B, o) {
    const L = o.length ?? 10, Bm = L * 0.32, pick = (a) => a[Math.floor(B.r(0, a.length - 0.001))];
    const hullC = o.color ?? pick(['#f4f1ea', '#f4f1ea', '#f1eee6', '#2f3a57', '#e8e2d2', '#35574f', '#7a2f35']);
    const dark = col(hullC).getHSL({}).l < 0.4;
    const acc = o.accent ?? pick([C.navy, C.teal, '#8a2f35', '#3b5f8a', '#b98f2f', '#4d6e8e']);
    const spec = { L, B: Bm, T: 0.55, F0: 0.72 + L * 0.018, F1: 0.95 + L * 0.03, tr: 0.64, rake: L * 0.055, chine: 0, flare: 0.04, sternRake: -0.2, keelRise: 0.75, NS: 18, NP: 6 };
    const { h, body, deckGeo } = hullOf('sail' + L.toFixed(1), spec);
    const zt = (t) => -L / 2 + t * L, far = !!o.far;   // far: a boat out of the arena (no rails, lifelines, fenders)
    B.add('gloss', body, hullC, 0, 0, 0, {});
    B.add('paint', cached('sailAF' + L.toFixed(1), () => h.band(-0.2, 0.0)), dark ? '#1c2130' : '#2a3350', 0, 0, 0, {});
    B.add('paint', cached('sailBT' + L.toFixed(1), () => h.band(0.0, 0.07)), dark ? C.white : acc, 0, 0, 0, {});
    B.add('paint', cached('sailCV' + L.toFixed(1), () => h.band((t) => h.top(t) - 0.17, (t) => h.top(t) - 0.13)), dark ? '#c9a24a' : acc, 0, 0, 0, {});
    B.add('paint', deckGeo, '#e9e4d8', 0, 0, 0, {});
    // teak toe rails along the sheer
    if (!far) for (const sd of [-1, 1]) { const tp = []; for (let k = 1; k < 10; k++) { const t = k / 10, p = h.at(t * 0.985, 1, sd); tp.push(P3(p[0] * 0.985, p[1] + 0.02, p[2])); } B.tube('wood', C.teak, tp, 0.028, { radial: 4 }); }
    // coachroof with ports, hatch and grab rails
    const t0 = 0.34, t1 = 0.64, zc = (zt(t0) + zt(t1)) / 2, len = zt(t1) - zt(t0), wC = h.hb(0.5) * 1.18, yC = h.top(0.5) + 0.2;
    B.box('gloss', '#f1eee6', wC, 0.42, len, 0, yC, zc, { round: true, r: 0.14 });
    for (const sd of [-1, 1]) { bx(B, 'gloss', C.glass, 0.01, 0.1, len * 0.28, sd * wC / 2, yC + 0.02, zc + len * 0.18); bx(B, 'gloss', C.glass, 0.01, 0.1, len * 0.22, sd * wC / 2, yC + 0.02, zc - len * 0.2); }
    bx(B, 'gloss', C.glass, wC * 0.4, 0.01, 0.5, 0, yC + 0.212, zc + len * 0.25);
    if (!far) for (const sd of [-1, 1]) B.tube('wood', C.teak, [P3(sd * wC * 0.34, yC + 0.21, zc - len * 0.35), P3(sd * wC * 0.34, yC + 0.27, zc - len * 0.3), P3(sd * wC * 0.34, yC + 0.27, zc + len * 0.3), P3(sd * wC * 0.34, yC + 0.21, zc + len * 0.35)], 0.016, { radial: 4 });
    // cockpit coamings, sole, wheel or tiller, and a spray dodger over the companionway
    const tc0 = 0.07, tc1 = 0.33, zcc = (zt(tc0) + zt(tc1)) / 2, lc = zt(tc1) - zt(tc0), wc = h.hb(0.2) * 1.2, yT = h.top(0.2);
    for (const sd of [-1, 1]) B.box('gloss', '#f1eee6', 0.08, 0.26, lc, sd * wc / 2, yT + 0.1, zcc, { r: 0.03 });
    bx(B, 'wood', C.teakDk, wc - 0.1, 0.02, lc - 0.1, 0, yT + 0.001, zcc);
    if (L >= 9.5) {
      const wz = zt(0.12);
      cy(B, 'metal', C.galv, 0.05, 0.6, 0, yT + 0.3, wz, { seg: 8 });
      B.tor('metal', C.galv, 0.34, 0.018, 0, yT + 0.72, wz - 0.06, { rx: -0.25, rs: 4, ts: 18 });
      for (let k = 0; k < 3; k++) bx(B, 'metal', C.galv, 0.012, 0.66, 0.012, 0, yT + 0.72, wz - 0.06, { rx: -0.25, rz: k * PI / 3 });
    } else B.tube('wood', C.teak, [P3(0, yT + 0.3, zt(0.02)), P3(0, yT + 0.4, zt(0.18))], 0.03, { radial: 5 });
    const dg = dodgerGeo(wC * 0.92, 0.62, 0.8), dy0 = yC + 0.2, dz0 = zt(t0) + 0.1;
    B.add('foliage', dg.canvas, acc, 0, dy0, dz0, {});
    B.tube('metal', C.galv, dg.frame.map((q) => P3(q[0], q[1] + dy0, q[2] + dz0)), 0.014, { radial: 4 });
    B.push(0, dy0 + 0.24, dz0 - 0.1, 0, -0.95); bx(B, 'gloss', C.glass, wC * 0.62, 0.3, 0.012, 0, 0, 0.004); B.pop();
    for (const sd of [-1, 1]) { B.push(sd * wC * 0.4, dy0 + 0.36, dz0 - 0.42, sd * 0.2); bx(B, 'gloss', C.glass, 0.012, 0.18, 0.34, 0, 0, 0); B.pop(); }
    // mast, spreaders, masthead kit
    const tm = 0.6, zm = zt(tm), y0 = yC + 0.21, Hm = L * 1.22 + 1.0, sp1 = h.hb(0.5) * 0.92, sp2 = h.hb(0.5) * 0.6;
    B.lathe('metal', '#d6dbe0', [[0, y0], [0.075, y0], [0.07, y0 + Hm * 0.55], [0.05, y0 + Hm], [0, y0 + Hm + 0.02]], 0, 0, zm, { seg: 8 });
    for (const [f, sp] of [[0.4, sp1], [0.72, sp2]]) bx(B, 'metal', '#d6dbe0', 2 * sp, 0.035, 0.07, 0, y0 + Hm * f, zm, { rz: 0 });
    cy(B, 'metal', C.black, 0.008, 1.0, 0.06, y0 + Hm + 0.5, zm, { seg: 4 });
    if (!far) {
      bx(B, 'metal', C.black, 0.02, 0.02, 0.4, 0, y0 + Hm + 0.1, zm - 0.1, { rx: 0.3 });                   // windex
      cy(B, 'metal', '#e8ecef', 0.09, 0.4, 0, y0 + Hm * 0.55, zm + 0.12, { seg: 6 });                       // radar reflector
    }
    B.blink('#fff6e0', 0, y0 + Hm + 0.06, zm, { size: 0.035, rate: 0.1, lo: 1.6, hi: 1.9 });
    // standing rigging (forestay, backstay, cap shrouds over the spreaders, lowers)
    const stem = h.at(0.995, 1, 1), tr0 = h.at(0.004, 1, 1), mh = [0, y0 + Hm * 0.985, zm];
    const rig = (pts, r = 0.013) => B.tube('metal', '#8d949b', pts.map((p) => P3(...p)), r, { radial: 3 });
    rig([mh, [0, stem[1] + 0.08, stem[2] - 0.05]]);
    rig([mh, [0, tr0[1] + 0.2, tr0[2] + 0.05]]);
    for (const sd of [-1, 1]) {
      const cp = [sd * h.hb(tm) * 0.9, h.top(tm) + 0.03, zm - 0.05];
      rig([mh, [sd * sp2, y0 + Hm * 0.72, zm], [sd * sp1, y0 + Hm * 0.4, zm], cp]);
      rig([[0, y0 + Hm * 0.4, zm], [cp[0], cp[1], cp[2] + 0.35]]);
      rig([[0, y0 + Hm * 0.4, zm], [cp[0], cp[1], cp[2] - 0.45]]);
    }
    // boom with the mainsail stack-pack cover, lazy jacks, mainsheet
    const by = y0 + 1.05, bz0 = zm - 0.1, bz1 = zt(0.1);
    B.tube('metal', '#d6dbe0', [P3(0, by, bz0), P3(0, by + 0.08, bz1)], 0.055, { radial: 6 });
    const nC = 8, cover = [];
    for (let k = 0; k <= nC; k++) { const t = k / nC; cover.push(P3(0, 0.18 * (1 - t * 0.55) + t * 0.08, bz0 - 0.1 + (bz1 + 0.35 - bz0) * t)); }
    B.tube('paint', acc, cover, (t) => 0.2 * (1 - t * 0.45), { radial: 7, y: by, sx: 0.8, sy: 1.25 });
    bx(B, 'paint', shade(acc, 0.7), 0.02, 0.02, (bz0 - bz1) * 0.9, 0, by + 0.43, (bz0 + bz1) / 2 + 0.2);
    if (!far) for (const sd of [-1, 1]) rig([[0, y0 + Hm * 0.55, zm], [sd * 0.16, by + 0.3, (bz0 + bz1) / 2 + 0.3]], 0.006);
    rig([[0, by, bz1 + 0.35], [0, yT + 0.15, zt(0.03)]], 0.008);
    // furled genoa on the forestay (UV strip in the accent colour) + furling drum
    const fs = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10; fs.push(P3(0, stem[1] + 0.25 + (mh[1] - stem[1] - 0.25) * t * 0.9, stem[2] - 0.05 + (zm - stem[2] + 0.05) * t * 0.9)); }
    B.tube('paint', acc, fs, (t) => 0.018 + 0.075 * Math.pow(Math.sin(PI * Math.min(1, t * 1.05)), 0.7) * (1 - t * 0.6), { radial: 6 });
    cy(B, 'metal', C.galv, 0.07, 0.12, 0, stem[1] + 0.16, stem[2] - 0.05, { seg: 8 });
    // bow + stern pulpits, stanchions, lifelines
    const pul = (ts, up, closeFwd) => {
      const pts = [];
      for (const sd of [-1, 1]) { const p = h.at(ts, 1, sd); pts.push(P3(p[0] * 0.92, p[1] + up, p[2])); }
      const e = h.at(closeFwd ? 0.998 : 0.02, 1, 1);
      const mid = P3(0, e[1] + up, e[2] + (closeFwd ? -0.12 : 0.1));
      B.tube('metal', C.galv, [pts[0], mid, pts[1]], 0.02, { radial: 5 });
      for (const q of pts) B.tube('metal', C.galv, [q, P3(q[0], q[1] - up + 0.02, q[2])], 0.016, { radial: 4 });
      return pts;
    };
    const bp = far ? null : pul(0.9, 0.62, true), sp = far ? null : pul(0.05, 0.66, false);
    if (!far) for (const sd of [0, 1]) {
      const side = sd ? 1 : -1, tops = [bp[sd]];
      for (const t of [0.72, 0.52, 0.32]) { const p = h.at(t, 1, side); const q = P3(p[0] * 0.94, p[1] + 0.62, p[2]); B.tube('metal', C.galv, [P3(p[0] * 0.94, p[1], p[2]), q], 0.014, { radial: 4 }); tops.push(q); }
      tops.push(sp[sd]);
      B.tube('metal', '#c9ced3', tops, 0.007, { radial: 3 });
    }
    // fenders on the side facing the neighbouring finger, ensign on the backstay, transom name
    const fs0 = o.fenderSide ?? 1;
    if (!far) for (const t of [0.3, 0.62]) { const p = h.at(t, 1, fs0); B.lathe('gloss', t > 0.5 ? C.white : '#2f3a57', [[0, -0.28], [0.07, -0.26], [0.1, -0.18], [0.1, 0.18], [0.07, 0.26], [0, 0.28]], p[0] * 1.02 + fs0 * 0.1, p[1] - 0.55, p[2], { seg: 8 }); B.tube('rubber', C.white, [P3(p[0] * 0.96, p[1] + 0.3, p[2]), P3(p[0] * 1.02 + fs0 * 0.1, p[1] - 0.26, p[2])], 0.007, { radial: 3 }); }
    const bsp = [0, tr0[1] + 0.2 + (mh[1] - tr0[1]) * 0.12, tr0[2] + 0.05 + (mh[2] - tr0[2]) * 0.12];
    B.flag(bsp[0], bsp[1], bsp[2], { color: o.flag ?? pick(['#2f3a57', '#c8473d', '#3f9f97', '#f2eee6']), s: 1.3, ry: HP });
    if (o.name) { const tp = h.at(0.004, 0.55, 1); text(B, o.name, 0.13, dark ? C.white : C.navy, 0, tp[1] + 0.02, tp[2] - 0.03, { ry: PI, weight: 0.18, depth: 0.004 }); }
    // berthed in the arena (col: true): the hull, the coachroof and the spray dodger collide (a pontoon's cover); col: 'roof'
    // (a boat out of reach, e.g. hanging in the travel lift): the same, off limits
    if (o.col) {
      const f = o.col === 'roof' ? { roof: true } : undefined, hbC = h.hb(0.45) * 0.9, yd = Math.min(h.top(0.15), h.top(0.5));
      B.col(-hbC, -0.3, zt(0.04), hbC, yd, zt(0.86), f);
      B.col(-wC / 2, yd, zt(t0), wC / 2, yC + 0.21, zt(t1), f);
      B.col(-wC * 0.46, yC + 0.21, dz0 - 0.55, wC * 0.46, yC + 0.21 + 0.6, dz0 + 0.05, f);
    }
  }

  // ------------------------------------------------------------------------------------------------ MOTOR YACHT
  function motorYacht(B, o) {
    const L = o.length ?? 12, Bm = L * 0.34, pick = (a) => a[Math.floor(B.r(0, a.length - 0.001))];
    const hullC = o.color ?? pick(['#f4f1ea', '#f4f1ea', '#1f2a40', '#e9e4d6']), dark = col(hullC).getHSL({}).l < 0.4;
    const acc = o.accent ?? pick(['#2f3a57', '#3f9f97', '#6b7280', '#3b5f8a']);
    const spec = { L, B: Bm, T: 0.6, F0: 1.05 + L * 0.02, F1: 1.45 + L * 0.03, tr: 0.92, rake: L * 0.05, chine: 0.75, flare: 0.12, sternRake: 0.05, keelRise: 0.55, NS: 18, NP: 6 };
    const { h, body, deckGeo } = hullOf('motor' + L.toFixed(1), spec);
    const zt = (t) => -L / 2 + t * L, far = !!o.far;   // far: a boat out of the arena (no rails, fenders, ladder)
    B.add('gloss', body, hullC, 0, 0, 0, {});
    B.add('paint', cached('myAF' + L.toFixed(1), () => h.band(-0.2, 0.0)), '#26314a', 0, 0, 0, {});
    B.add('paint', cached('myBT' + L.toFixed(1), () => h.band(0.0, 0.1)), dark ? C.white : acc, 0, 0, 0, {});
    B.add('paint', cached('myHW' + L.toFixed(1), () => h.band((t) => h.top(t) - 0.62, (t) => h.top(t) - 0.5)), C.glass, 0, 0, 0, {});   // hull windows
    B.add('paint', deckGeo, '#ece8de', 0, 0, 0, {});
    if (!far) { const tp = []; for (let k = 1; k < 16; k++) { const t = k / 16, p = h.at(t, 1, 1); tp.push(P3(p[0] * 1.01, p[1] - 0.04, p[2])); } B.tube('metal', C.galv, tp, 0.03, { radial: 4 }); B.tube('metal', C.galv, tp.map((p) => P3(-p[0], p[1], p[2])), 0.03, { radial: 4 }); }
    // swim platform + boarding ladder
    const tr0 = h.at(0.003, 1, 1);
    bx(B, 'wood', C.teak, h.hb(0) * 2 - 0.1, 0.06, 0.9, 0, 0.32, tr0[2] - 0.45);
    if (!far) for (const sd of [-1, 1]) cy(B, 'metal', C.galv, 0.015, 0.5, sd * 0.2, 0.1, tr0[2] - 0.86, { seg: 5 });
    // saloon deckhouse (dark window band, raked front), flybridge + helm, bimini, radar arch
    const ts0 = 0.14, ts1 = 0.64, zs = (zt(ts0) + zt(ts1)) / 2, ls = zt(ts1) - zt(ts0), ws = h.hb(0.4) * 1.56, ys = h.top(0.4) + 0.42;
    B.box('gloss', hullC === '#1f2a40' ? '#f1eee6' : '#f4f1ea', ws, 0.84, ls, 0, ys, zs, { round: true, r: 0.18 });
    bx(B, 'gloss', C.glass, ws + 0.012, 0.3, ls * 0.8, 0, ys + 0.08, zs - ls * 0.05);
    B.push(0, ys + 0.1, zt(ts1) - 0.04, 0, 0.62); bx(B, 'gloss', C.glass, ws * 0.84, 0.42, 0.02, 0, 0, 0); B.pop();
    const yf = ys + 0.42, tf0 = 0.2, tf1 = 0.5, zf = (zt(tf0) + zt(tf1)) / 2, lf = zt(tf1) - zt(tf0);
    B.box('gloss', '#f1eee6', ws * 0.84, 0.3, lf, 0, yf + 0.15, zf, { round: true, r: 0.12 });
    bx(B, 'gloss', C.glass, ws * 0.7, 0.2, 0.02, 0, yf + 0.46, zt(tf1) - 0.1, { rx: -0.4 });
    for (const sd of [-1, 1]) { B.box('gloss', '#e8e2d2', 0.44, 0.14, 0.42, sd * 0.32, yf + 0.37, zf, { round: true, r: 0.05 }); B.box('gloss', '#e8e2d2', 0.44, 0.36, 0.1, sd * 0.32, yf + 0.52, zf - 0.2, { round: true, r: 0.04 }); }     // helm seats
    const bim = cached('bimini' + (ws * 0.9).toFixed(2), () => { const mb = new MB(), rows = []; for (let i = 0; i <= 3; i++) { const z = (i / 3 - 0.5) * lf * 0.95, row = []; for (let j = 0; j <= 8; j++) { const a = PI * (j / 8); row.push([Math.cos(a) * ws * 0.45, Math.sin(a) * 0.25, z]); } rows.push(row); } gridSurface(mb, rows, () => [0, -1, 0], null); return mb.geo(); });
    B.add('foliage', bim, acc, 0, yf + 1.2, zf, {});
    for (const sd of [-1, 1]) for (const dz of [-0.45, 0.45]) B.tube('metal', C.galv, [P3(sd * ws * 0.44, yf + 0.36, zf + dz * lf), P3(sd * ws * 0.45, yf + 1.2, zf + dz * lf)], 0.014, { radial: 4 });
    B.tube('metal', C.white, [P3(-ws * 0.45, yf + 0.36, zt(0.2)), P3(-ws * 0.38, yf + 1.5, zt(0.19)), P3(ws * 0.38, yf + 1.5, zt(0.19)), P3(ws * 0.45, yf + 0.36, zt(0.2))], 0.05, { radial: 6 });
    B.box('gloss', C.white, 0.7, 0.14, 0.3, 0, yf + 1.62, zt(0.19), { round: true, r: 0.06 });           // open-array radome
    B.sph('gloss', C.white, 0.14, 0.4, yf + 1.65, zt(0.19), { ws: 8, hs: 5, half: true });
    cy(B, 'metal', C.black, 0.008, 1.2, -0.3, yf + 2.1, zt(0.19), { seg: 4 });
    // bow rail, anchor on the roller, transom name, fenders, ensign
    const bpts = [];
    for (let k = 0; k <= 8; k++) { const t = 0.62 + 0.36 * (k / 8), p = h.at(t, 1, -1); bpts.push(P3(p[0] * 0.9, p[1] + 0.55, p[2])); }
    for (let k = 8; k >= 0; k--) { const t = 0.62 + 0.36 * (k / 8), p = h.at(t, 1, 1); bpts.push(P3(p[0] * 0.9, p[1] + 0.55, p[2])); }
    if (!far) B.tube('metal', C.galv, bpts, 0.022, { radial: 5 });
    if (!far) for (const t of [0.66, 0.8, 0.92]) for (const sd of [-1, 1]) { const p = h.at(t, 1, sd); B.tube('metal', C.galv, [P3(p[0] * 0.9, p[1], p[2]), P3(p[0] * 0.9, p[1] + 0.55, p[2])], 0.016, { radial: 4 }); }
    const st = h.at(0.998, 1, 1);
    B.box('metal', C.galv, 0.14, 0.12, 0.5, 0, st[1] + 0.05, st[2] - 0.1, { r: 0.03 });
    B.push(0, st[1] - 0.05, st[2] + 0.12, 0, 0.3); B.add('metal', cached('anchorS', () => extrudeGeo(ANCHOR, 0.08, 0.02)), C.steel, 0, 0, 0, { ry: -HP, s: 0.45 }); B.pop();
    if (o.name) { const tp = h.at(0.003, 0.5, 1); text(B, o.name, 0.15, dark ? C.white : C.navy, 0, tp[1] + 0.05, tp[2] - 0.03, { ry: PI, weight: 0.18, depth: 0.004 }); }
    const fs0 = o.fenderSide ?? 1;
    if (!far) for (const t of [0.3, 0.55]) { const p = h.at(t, 1, fs0); B.lathe('gloss', C.white, [[0, -0.3], [0.08, -0.28], [0.11, -0.2], [0.11, 0.2], [0.08, 0.28], [0, 0.3]], p[0] + fs0 * 0.12, p[1] - 0.7, p[2], { seg: 8 }); }
    B.flag(0, tr0[1] + 0.9, tr0[2] + 0.15, { color: o.flag ?? '#2f3a57', s: 1.3, ry: HP });
    cy(B, 'metal', C.teak, 0.012, 0.9, 0, tr0[1] + 0.5, tr0[2] + 0.15, { seg: 4 });
    // berthed in the arena (col: true): hull, saloon + flybridge collide (cover); col: 'roof': the same, off limits
    if (o.col) {
      const f = o.col === 'roof' ? { roof: true } : undefined, hbC = h.hb(0.45) * 0.9, yd = Math.min(h.top(0.1), h.top(0.5));
      B.col(-hbC, -0.3, zt(0.03), hbC, yd, zt(0.88), f);
      B.col(-ws / 2, yd, zt(ts0), ws / 2, ys + 0.42, zt(ts1), f);
      B.col(-ws * 0.42, ys + 0.42, zt(tf0), ws * 0.42, yf + 0.3, zt(tf1), f);
    }
  }

  // ------------------------------------------------------------------------------------------------ FISHING BOAT
  function fishingBoat(B, o) {
    const L = o.length ?? 10, Bm = L * 0.36, pick = (a) => a[Math.floor(B.r(0, a.length - 0.001))];
    const hullC = o.color ?? pick(['#2f5a52', '#8a2f35', '#2f3a57', '#3b5f8a']), acc = o.accent ?? pick(['#e2b64c', C.white]);
    const spec = { L, B: Bm, T: 0.9, F0: 0.95, F1: 1.7, tr: 0.62, rake: 0.35, chine: 0.15, flare: 0.1, sternRake: -0.1, keelRise: 0.45, NS: 18, NP: 6 };
    const { h, body, deckGeo } = hullOf('fish' + L.toFixed(1), spec);
    const zt = (t) => -L / 2 + t * L;
    B.add('gloss', body, hullC, 0, 0, 0, {});
    B.add('paint', cached('fbAF' + L.toFixed(1), () => h.band(-0.2, 0.0)), '#7a2b24', 0, 0, 0, {});
    B.add('paint', cached('fbBT' + L.toFixed(1), () => h.band(0.0, 0.08)), C.white, 0, 0, 0, {});
    B.add('paint', cached('fbSH' + L.toFixed(1), () => h.band((t) => h.top(t) - 0.24, (t) => h.top(t) - 0.02)), acc, 0, 0, 0, {});
    B.add('paint', deckGeo, '#9aa0a0', 0, 0, 0, {});
    // bulwark rail + tyre fenders along both sides
    for (const sd of [-1, 1]) {
      const tp = []; for (let k = 1; k < 16; k++) { const t = k / 16, p = h.at(t, 1, sd); tp.push(P3(p[0] * 0.99, p[1] + 0.05, p[2])); }
      B.tube('wood', C.teakDk, tp, 0.04, { radial: 4 });
      for (const t of [0.25, 0.45, 0.65]) { const p = h.at(t, 0.8, sd); tyre(B, p[0] + sd * 0.09, p[1], p[2], 'x', 0.8); }
    }
    // wheelhouse forward with windows, mast + lights, radar, outrigger booms
    const tw0 = 0.52, tw1 = 0.76, zw = (zt(tw0) + zt(tw1)) / 2, lw = zt(tw1) - zt(tw0), ww = h.hb(0.64) * 1.3, yw = h.top(0.64) + 0.85;
    B.box('gloss', '#f1eee6', ww, 1.7, lw, 0, yw, zw, { round: true, r: 0.1 });
    B.box('gloss', hullC, ww + 0.1, 0.1, lw + 0.1, 0, yw + 0.88, zw, { r: 0.04 });
    bx(B, 'gloss', C.glass, ww + 0.012, 0.42, lw * 0.7, 0, yw + 0.45, zw);
    B.push(0, yw + 0.45, zt(tw1) + 0.005, 0, 0.12); bx(B, 'gloss', C.glass, ww * 0.84, 0.46, 0.02, 0, 0, 0); B.pop();
    const my = yw + 0.93, mz = zw - 0.2;
    B.lathe('gloss', C.white, [[0, my], [0.07, my], [0.045, my + 3.2], [0, my + 3.22]], 0, 0, mz, { seg: 8 });
    bx(B, 'gloss', C.white, 1.2, 0.06, 0.06, 0, my + 2.4, mz);
    B.blink('#fff6e0', 0, my + 3.1, mz + 0.06, { size: 0.04, rate: 0.12, lo: 1.8, hi: 2.1 });
    B.box('gloss', C.white, 0.5, 0.1, 0.18, 0, my + 1.2, mz + 0.25, { round: true, r: 0.04 });
    for (const sd of [-1, 1]) {
      B.tube('metal', '#8d949b', [P3(sd * 0.25, my + 0.2, mz), P3(sd * (Bm * 0.55 + 2.2), my + 3.6, mz - 0.4)], 0.035, { radial: 5 });
      B.tube('metal', '#8d949b', [P3(0, my + 3.0, mz), P3(sd * (Bm * 0.55 + 2.2), my + 3.6, mz - 0.4)], 0.008, { radial: 3 });
    }
    // aft working deck: A-frame gantry, net drum, fish boxes, marker buoys
    const za = zt(0.04), ya = h.top(0.05);
    for (const sd of [-1, 1]) B.tube('metal', C.mustardDk, [P3(sd * h.hb(0.05) * 0.85, ya, za + 0.15), P3(sd * 0.35, ya + 2.1, za - 0.15)], 0.06, { radial: 6 });
    B.tube('metal', C.mustardDk, [P3(-0.4, ya + 2.1, za - 0.15), P3(0.4, ya + 2.1, za - 0.15)], 0.07, { radial: 6 });
    B.cyl('gloss', C.mustardDk, 0.45, 1.3, 0, ya + 0.6, zt(0.2), { rz: HP, seg: 14 });
    B.cyl('paint', '#3f6f5a', 0.4, 1.2, 0, ya + 0.6, zt(0.2), { rz: HP, seg: 14 });
    for (let k = 0; k < 4; k++) bx(B, 'gloss', k % 2 ? '#3f9f97' : '#e2b64c', 0.62, 0.26, 0.4, (k % 2 ? -1 : 1) * 0.45, ya + 0.13 + Math.floor(k / 2) * 0.26, zt(0.33));
    for (let k = 0; k < 3; k++) B.sph('gloss', '#e9703a', 0.2, -0.55 + k * 0.5, ya + 0.2, zt(0.4) + 0.1 * k, { ws: 10, hs: 7 });
    if (o.name) { const tp = h.at(0.004, 0.55, 1); text(B, o.name, 0.16, C.white, 0, tp[1] + 0.02, tp[2] - 0.03, { ry: PI, weight: 0.18, depth: 0.004 }); }
    B.flag(0, my + 3.3, mz, { color: o.flag ?? C.teal, s: 1.2, ry: HP });
  }

  // ------------------------------------------------------------------------------------------------ RIB tender
  function ribBoat(B, o) {
    const L = o.length ?? 5, pick = (a) => a[Math.floor(B.r(0, a.length - 0.001))];
    const tubeC = o.color ?? pick(['#5d6470', '#2f3a57', '#e9703a', '#6b7280']), R = L * 0.07, hw = L * 0.19;
    const spec = { L: L * 0.92, B: hw * 2, T: 0.28, F0: 0.28, F1: 0.36, tr: 0.85, rake: 0.08, chine: 1, flare: 0, keelRise: 0.6, NS: 14, NP: 4 };
    const { h, body } = hullOf('rib' + L.toFixed(1), spec);
    B.add('gloss', body, '#e9e5dc', 0, 0, 0, {});
    const z0 = -L * 0.46, z1 = L * 0.22, yT = 0.3;
    const path = [];
    path.push(P3(-hw, yT, z0));
    for (let k = 1; k < 4; k++) path.push(P3(-hw, yT + k * 0.01, z0 + (z1 - z0) * (k / 4)));
    for (let k = 0; k <= 10; k++) { const a = PI + (k / 10) * PI; path.push(P3(Math.cos(a) * hw, yT + 0.05 + 0.08 * Math.sin((k / 10) * PI), z1 - Math.sin(a) * (L * 0.24))); }
    for (let k = 3; k >= 1; k--) path.push(P3(hw, yT + k * 0.01, z0 + (z1 - z0) * (k / 4)));
    path.push(P3(hw, yT, z0));
    B.tube('gloss', tubeC, path, R, { radial: 10 });
    for (const sd of [-1, 1]) B.lathe('gloss', tubeC, [[0, -0.3], [R * 0.55, -0.26], [R * 0.9, -0.14], [R, 0]], sd * hw, yT, z0, { rx: HP, seg: 10 });
    B.tube('rubber', C.rope, path.map((p) => P3(p[0] * (1 + R * 0.4 / hw), p[1] + R * 0.55, p[2])), 0.01, { radial: 3 });
    if (o.console !== false) {
      B.box('gloss', '#e9e5dc', 0.6, 0.72, 0.5, 0, yT + 0.28, 0.1, { round: true, r: 0.08 });            // console
      bx(B, 'gloss', C.glass, 0.56, 0.3, 0.02, 0, yT + 0.78, 0.36, { rx: -0.4 });
      B.tor('rubber', C.black, 0.13, 0.016, 0, yT + 0.72, -0.12, { rx: -0.6, rs: 3, ts: 12 });
      B.box('gloss', C.black, 0.62, 0.35, 0.5, 0, yT + 0.18, -0.55, { round: true, r: 0.1 });             // jockey seat
    } else {
      B.box('wood', C.teak, hw * 2 - 0.1, 0.05, 0.3, 0, yT + 0.02, -0.2, { r: 0.015 });                  // thwart
      B.box('gloss', '#c8473d', 0.36, 0.22, 0.26, 0.2, yT - 0.12, -1.0, { round: true, r: 0.05 });       // fuel tank
      B.tube('rubber', C.black, [P3(0.2, yT, -1.0), P3(0.1, yT - 0.05, -1.4), P3(0, yT, z0 + 0.1)], 0.012, { radial: 4 });
      for (const sd of [-1, 1]) B.tube('wood', C.teak, [P3(sd * 0.25, yT - 0.08, -0.6), P3(sd * 0.32, yT - 0.05, 0.9)], 0.022, { radial: 4 });   // stowed oars
      bx(B, 'wood', C.teak, 0.1, 0.02, 0.45, 0.32, yT - 0.05, 1.05);
      bx(B, 'wood', C.teak, 0.1, 0.02, 0.45, -0.25, yT - 0.08, -0.85);
    }
    B.push(0, yT - 0.05, z0 - 0.02); outboard(B, '#2b2e34', o.tilt ?? 0, o.motorScale ?? 1.1); B.pop();
  }

  // ================================================================================================ TUG "NUDGE" (on blocks)
  // Blocks: tug-hull x 14.5…20.5, z -24…-13, deck y 2.6; tug-house x 15.8…19.2, z -20.4…-17.4, top 4.3; the ramp lands on
  // the stern (+Z end, x 16.4…18.6). Placed at the hull centre (17.5, 0, -18.5): local hull x ±3, z ±5.5, bow at -Z.
  // Tyre hung flat against a wall: `axis` = the wall normal axis ('x' | 'z').
  const TYRE = [[0.33, -0.05], [0.315, -0.088], [0.28, -0.103], [0.2, -0.1], [0.17, -0.06], [0.17, 0.06], [0.2, 0.1], [0.28, 0.103], [0.315, 0.088], [0.33, 0.05]];
  function tyre(B, x, y, z, axis, s = 0.9, c = '#202227') {
    B.lathe('rubber', c, TYRE, x, y, z, { seg: 12, closed: true, s, ...(axis === 'x' ? { rz: HP } : { rx: HP }) });
  }
  // Rope lanyard from a to b that ends in a small loop through a tyre / fitting at b.
  function lanyard(B, a, b, r = 0.014, c = C.rope) {
    B.tube(ns(B, 'rubber'), c, [P3(...a), P3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.02, (a[2] + b[2]) / 2 + 0.01), P3(...b)], r, { radial: 4 });
  }
  // Short chain (a few oval links) from a to b.
  function chain(B, a, b, n = 5, r = 0.035) {
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const yaw = Math.atan2(dx, dz), pitch = Math.atan2(Math.hypot(dx, dz), dy);
      B.tor('metal', '#4d5157', r, 0.009, x, y, z, { ry: yaw + (k % 2 ? HP : 0), rx: pitch - HP, sy: 1.5, rs: 4, ts: 8 });
    }
  }
  // Screw-type boat stand (tripod + threaded post + pad) pressing on a hull wall at local plane z = 0 (normal +Z).
  function boatStand(B, x, padY, out) {
    const hub = [x, 0.5, out], pad = [x, padY, 0.05];
    for (let k = 0; k < 3; k++) {
      const a = k * TAU / 3 + 0.5;
      B.tube('metal', '#5f7d84', [P3(hub[0], hub[1], hub[2]), P3(x + Math.cos(a) * 0.36, 0.03, out + Math.sin(a) * 0.36)], 0.022, { radial: 6 });
      bx(B, 'metal', C.steelDk, 0.09, 0.02, 0.09, x + Math.cos(a) * 0.36, 0.01, out + Math.sin(a) * 0.36, { ry: a });
    }
    cy(B, 'metal', '#5f7d84', 0.05, 0.18, hub[0], hub[1], hub[2], { seg: 8 });
    B.tube('metal', C.galv, [P3(...hub), P3(pad[0], pad[1] - 0.05, pad[2] + 0.12)], 0.022, { radial: 6 });
    cy(B, 'metal', C.galv, 0.012, 0.3, hub[0], hub[1] + 0.12, hub[2], { rz: HP });                       // tommy bar
    B.box('rubber', C.rubber, 0.22, 0.3, 0.05, pad[0], pad[1], pad[2], { r: 0.015 });
    B.box('metal', '#5f7d84', 0.14, 0.18, 0.06, pad[0], pad[1] - 0.02, pad[2] + 0.05, { r: 0.015 });
  }
  // Timber cribbing stack under the hull edge (local plane z = 0 is the hull wall, blocks poke out toward +Z).
  function cribbing(B, x, layers, out) {
    // a sleeper on the ground along the hull, then crossed timbers running in under the hull (ends showing)
    bx(B, 'wood', shade(C.teakDk, 0.9), 0.95, 0.16, 0.22, x, 0.08, out - 0.14);
    for (let k = 0; k < layers; k++) {
      const y = 0.16 + 0.09 + k * 0.18, c = shade(k % 2 ? C.teak : C.teakDk, 0.88 + 0.08 * (k % 2));
      for (const dx of [-0.26, 0.26]) bx(B, 'wood', c, 0.2, 0.17, out + 0.35, x + dx + (k % 2 ? 0.05 : 0), y, (out - 0.35) / 2);
    }
    bx(B, 'wood', shade(C.teak, 0.8), 0.28, 0.1, 0.22, x, 0.16 + layers * 0.18 + 0.1, 0.1, { rx: 0.3 });   // wedge
  }
  // Round porthole on a wall (plane z = 0, facing +Z)
  function porthole(B, x, y, r = 0.13, rim = '#b58a4a') {
    noShadow(B, () => {
    B.tor('metal', rim, r, 0.028, x, y, 0.02, { rs: 4, ts: 12 });
    B.cyl('gloss', C.glass, r * 0.95, 0.01, x, y, 0.012, { rx: HP, seg: 12 });
    bx(B, 'gloss', C.glassLt, r * 0.9, r * 0.3, 0.004, x - r * 0.1, y + r * 0.35, 0.02, { rz: 0.5 });
    for (let k = 0; k < 3; k++) { const a = -HP + k * (TAU / 3); bx(B, 'metal', rim, 0.04, 0.05, 0.03, x + Math.cos(a) * (r + 0.05), y + Math.sin(a) * (r + 0.05), 0.02, { rz: a }); }
    });
  }
  // Kraken fleet stack/funnel (rounded casing with company bands); returns its geometry (base at y 0).
  function fleetFunnelGeo(a, b, r, h, key) {
    return cached('funnel|' + key, () => {
      const mb = new MB(), soot = '#23262c';
      const bands = [[0, C.mustard], [h * 0.62, C.mustard], [h * 0.62, C.white], [h * 0.66, C.white], [h * 0.66, C.teal], [h * 0.74, C.teal], [h * 0.74, soot], [h - 0.04, soot], [h, soot]];
      const outline = rrectProf(a, b, r, 4);
      const kAt = (hh, i) => (1 - 0.06 * hh / h) * (i === bands.length - 1 ? 1.04 : 1);
      gridSurface(mb, bands.map(([hh], i) => outline.map(([u, v]) => [u * kAt(hh, i), hh, v * kAt(hh, i)])), (i) => [0, bands[i][0], 0], (x, y, z, i) => col(bands[i][1]), true);
      const ki = (1 - 0.06) * 0.9, rimO = outline.map(([u, v]) => [u * 0.94 * 1.04, h, v * 0.94 * 1.04]), rimI = outline.map(([u, v]) => [u * ki, h, v * ki]), rimI2 = outline.map(([u, v]) => [u * ki, h - 0.05, v * ki]);
      gridSurface(mb, [rimO, rimI], () => [0, h - 1, 0], () => col(soot), true);
      gridSurface(mb, [rimI, rimI2], () => [0, h + 1, 0], () => col('#17181c'), true);
      polyFan(mb, rimI2, [0, 1, 0], col('#17181c'));
      return mb.geo();
    });
  }

  D.tug_dress = {
    desc: 'Harbour tug NUDGE up on blocks (dresses the tug-hull/tug-house blocks, placed at the hull centre): raked stem with bow fender + tyre stack, gunwale fender, tyre fenders all round on chains, rubbing strake, portholes, boot-top + load line, low deck rail open at the ramp (rail colliders), H-bitt + towing winch (colliders), towing hook, windowed deckhouse with doors + sidelights, Kraken stack (collider), mast with towing lights, radar, horn, searchlight, antennas + flag; boat stands, timber cribbing and a ladder in the yard.',
    params: { access: 'Zone Control build: open the bow rail for the boarding stair (local x 0.35…2.65) and the west rail for the crate steps (local z 1.55…5.25, to the stern corner)' },
    variants: 1, mount: 'ground',
    build(B, o = {}) {
      B.aoBase = 0;
      const HX = 3.0, HZ = 5.5, DK = 2.6, buff = C.buff, tugDk = C.tugDk;
      // Zone Control access (tug_access dresses the stair + crates): gaps in the deck rail, the gunwale fender and the
      // hull-side clutter where the bow stair lands (bow, local x) and where the crate steps stand (west side, local z)
      // (access: 'bow' — Tower Command's bow ramp — opens the bow only)
      const acc = !!o.access, accW = acc && o.access !== 'bow', bowGap = [0.35, 2.65], westGap = [1.55, 5.25];
      const inBow = (x) => acc && x > bowGap[0] - 0.05 && x < bowGap[1] + 0.1;
      const inWest = (z, pad = 0) => accW && z > westGap[0] - pad && z < westGap[1] + pad;
      // --- gunwale fender: one continuous rubber bumper around the hull (open at the ramp), swelling into the bow fender
      const gy = 2.44, pts = [], rad = [], R0 = 0.12, cr = 0.2;
      const push = (x, z, r = R0) => { pts.push(P3(x, gy, z)); rad.push(r); };
      const arc = (cx, cz, a0, a1, n = 4) => { for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * (k / n); push(cx + Math.cos(a) * cr, cz + Math.sin(a) * cr); } };
      push(1.28, HZ);
      arc(HX - cr, HZ - cr, HP, 0);
      for (let k = 1; k < 10; k++) push(HX, HZ - cr - (k / 10) * (2 * HZ - 2 * cr));
      arc(HX - cr, -HZ + cr, 0, -HP);
      for (let k = 1; k < 16; k++) { const u = k / 16, sw = Math.sin(PI * u); push((HX - cr) * (1 - 2 * u), -HZ - 0.3 * sw, R0 + 0.1 * sw); }
      arc(-HX + cr, -HZ + cr, -HP, -PI);
      for (let k = 1; k < 10; k++) push(-HX, -HZ + cr + (k / 10) * (2 * HZ - 2 * cr));
      arc(-HX + cr, HZ - cr, PI, HP);
      push(-1.28, HZ);
      if (!acc) B.tube('rubber', C.rubber, pts, (t) => rad[Math.round(t * (rad.length - 1))], { radial: 8 });
      else {
        // two runs either side of the bow stair's landing, each ending in a rounded cap
        let run = [], rr = [];
        const flush = () => {
          if (run.length > 1) {
            const rs = rr.slice();
            B.tube('rubber', C.rubber, run, (t) => rs[Math.round(t * (rs.length - 1))], { radial: 8 });
            for (const k of [0, run.length - 1]) B.sph('rubber', C.rubber, rs[k], run[k][0], run[k][1], run[k][2], { ws: 8, hs: 6 });
          }
          run = []; rr = [];
        };
        pts.forEach((p, k) => { if (p[2] < -HZ + 0.05 && inBow(p[0])) { flush(); return; } run.push(p); rr.push(rad[k]); });
        flush();
      }
      // --- raked stem under the bow fender, resting on the bow cribbing; bow tyre stack chained to it
      const stem = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8, y = 0.42 + t * 1.8; stem.push(P3(0, y, -HZ - 0.09 - 0.21 * Math.pow(t, 1.6))); }
      B.add('gloss', sweep(rrectProf(0.17, 0.08, 0.05), stem, [0, 0, -1]), tugDk, 0, 0, 0, {});
      for (const s of [-1, 1]) B.box('gloss', tugDk, 0.05, 1.5, 0.2, s * 0.19, 1.35, -HZ - 0.1, { rx: -0.1, r: 0.02 });       // cheek plates
      for (const [y, z] of [[0.82, -5.77], [1.38, -5.83], [1.92, -5.91]]) tyre(B, 0, y, z, 'z', 0.9);
      for (const s of [-1, 1]) B.box('rubber', C.rubber, 0.34, 1.7, 0.34, s * HX, 1.45, -HZ, { round: true, r: 0.12 });
      lanyard(B, [0, 2.26, -5.84], [0, 2.14, -5.93], 0.016);
      // --- rubbing strake, boot-top line, load line, name, portholes
      for (const s of [-1, 1]) {
        B.cyl('gloss', tugDk, 0.05, 2 * HZ - 0.3, s * HX, 1.25, 0, { rx: HP, seg: 10 });
        B.box(ns(B, 'paint'), C.white, 0.014, 0.06, 2 * HZ + 0.02, s * (HX + 0.007), 0.69, 0, { r: 0.004 });
      }
      B.box(ns(B, 'paint'), C.white, 2 * HX + 0.02, 0.06, 0.014, 0, 0.69, -HZ - 0.007, { r: 0.004 });
      for (const s of [-1, 1]) B.box(ns(B, 'paint'), C.white, HX - 1.18, 0.06, 0.014, s * (HX + 1.18) / 2, 0.69, HZ + 0.007, { r: 0.004 });
      for (const s of [-1, 1]) {
        B.push(s * HX, 0, 0, s * HP);                                              // local +Z = out of this side
        text(B, 'NUDGE', 0.32, C.white, s * 3.9, 0.8, 0.002, { weight: 0.17 });
        // load line (Plimsoll) mark amidships
        B.tor(ns(B, 'paint'), C.white, 0.16, 0.018, -s * 1.3, 1.02, 0.01, { rs: 4, ts: 24 });
        B.box(ns(B, 'paint'), C.white, 0.5, 0.035, 0.012, -s * 1.3, 1.02, 0.01, { r: 0.004 });
        B.box(ns(B, 'paint'), C.white, 0.4, 0.03, 0.012, -s * 1.3, 1.25, 0.01, { r: 0.004 });
        for (const z of [-2.2, -1.0, 0.2]) porthole(B, -s * z, 1.72);
        // tyre fenders hung on chains below the gunwale fender
        for (let k = 0; k < 8; k++) {
          const z = -4.0 + k * 1.2;
          if (s < 0 && inWest(z, 0.4)) continue;
          tyre(B, -s * z, 1.72, 0.09, 'z', 0.9);
          lanyard(B, [-s * z - 0.1, 2.31, 0.06], [-s * z - 0.04, 1.97, 0.1]);
          lanyard(B, [-s * z + 0.1, 2.31, 0.06], [-s * z + 0.04, 1.97, 0.1]);
        }
        // weathering: tyre scuffs + a primer patch on the lower hull
        for (let k = 0; k < 8; k += 2) if (!(s < 0 && inWest(-4.0 + k * 1.2, 0.4))) streak(B, -s * (-4.0 + k * 1.2), 1.42, 0.004, 0.36, 0.3, shade(C.tug, 0.78), C.tug);
        streak(B, s * 3.4, 0.62, 0.005, 0.9, 0.5, mixc(C.tug, '#b9b3a6', 0.42), C.tug);                 // sanded patches
        streak(B, s * 2.55, 0.5, 0.006, 0.55, 0.36, mixc(C.tug, '#b9b3a6', 0.32), C.tug);
        B.pop();
      }
      // stern: quarter tyres + name/port left of the ramp
      for (const x of [1.75, 2.55]) tyre(B, -x, 1.72, HZ + 0.09, 'z', 0.9);                      // (+X quarter: yard scaffold)
      text(B, 'NUDGE', 0.2, C.white, -2.15, 1.0, HZ + 0.002, { weight: 0.18 });
      text(B, 'INKWAVE', 0.1, C.white, -2.15, 0.82, HZ + 0.002, { weight: 0.2, spacing: 0.4 });
      // --- low deck-edge rail (0.36 m), open at the ramp; buff paint
      const railY = DK + 0.36, inset = 0.1;
      const railRuns = !acc ? [
        [[1.3, HZ - inset], [HX - inset, HZ - inset], [HX - inset, -HZ + inset], [-HX + inset, -HZ + inset], [-HX + inset, HZ - inset], [-1.3, HZ - inset]],
      ] : !accW ? [
        // Tower Command: open at the stern ramp and the bow ramp's landing
        [[1.3, HZ - inset], [HX - inset, HZ - inset], [HX - inset, -HZ + inset], [bowGap[1], -HZ + inset]],
        [[bowGap[0], -HZ + inset], [-HX + inset, -HZ + inset], [-HX + inset, HZ - inset], [-1.3, HZ - inset]],
      ] : [
        // Zone Control: open at the stern ramp, the bow stair landing and the west crate steps
        [[1.3, HZ - inset], [HX - inset, HZ - inset], [HX - inset, -HZ + inset], [bowGap[1], -HZ + inset]],
        [[bowGap[0], -HZ + inset], [-HX + inset, -HZ + inset], [-HX + inset, westGap[0]]],
        [[-HX + inset, westGap[1]], [-HX + inset, HZ - inset], [-1.3, HZ - inset]],
      ];
      for (const run of railRuns) {
        const rp = [];
        for (let k = 0; k < run.length - 1; k++) {
          const [ax, az] = run[k], [bx, bz] = run[k + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.15));
          for (let i = 0; i < n; i++) {
            const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
            post(B, 'metal', buff, 0.02, 0.36, x, DK + 0.18, z, { seg: 7 });
          }
          rp.push(P3(ax, railY, az));
        }
        const last = run[run.length - 1];
        rp.push(P3(last[0], railY, last[1]));
        B.cyl('metal', buff, 0.02, 0.36, last[0], DK + 0.18, last[1], { seg: 8 });
        B.tube('metal', buff, rp, 0.024, { radial: 8 });
        B.tube('metal', buff, rp.map((p) => P3(p[0], DK + 0.19, p[2])), 0.012, { radial: 6 });
        for (const e of [rp[0], rp[rp.length - 1]]) B.sph('metal', buff, 0.032, e[0], railY, e[2], { ws: 8, hs: 6 });
      }
      // deck-rail colliders (rail: kids can't walk off the deck edge, shots / ink / squids pass), open at the ramp like
      // the rail itself. A floating band 0.62…1.1 m over the deck: a kid's body (0.35…1.45 m) can't get past it, but a
      // squid climbing the inked hull side passes under it (the climb probes at +0.3 / +0.85 m never touch it before the
      // ledge pop), so the hull stays a squid route onto the flank high ground. The boxes sit just OUTBOARD of the hull
      // edge (0.3 m, over the yard): a kid anywhere on the deck — even one that surfaces right on the edge after a climb —
      // is always pushed back inboard (a rail pushes out along its nearest face), never off the deck; and the nav keeps
      // its deck-edge nodes (the only ones along the 1.3 m strips beside the deckhouse) and the bow row.
      // (5 mm clear of the edge so the edge-line nav nodes never hinge on float rounding; ≤ 0.3 m out, or the nav's
      // 45° clearance probe would drop them)
      const r0 = DK + 0.62, r1 = DK + 1.1, O = 0.3, e = 0.005;
      B.col(HX + e, r0, -HZ - O, HX + O, r1, HZ + O, { rail: true });
      if (!acc) {
        B.col(-HX - O, r0, -HZ - O, -HX - e, r1, HZ + O, { rail: true });
        B.col(-HX - O, r0, -HZ - O, HX + O, r1, -HZ - e, { rail: true });
      } else if (!accW) {
        B.col(-HX - O, r0, -HZ - O, -HX - e, r1, HZ + O, { rail: true });
        B.col(-HX - O, r0, -HZ - O, bowGap[0], r1, -HZ - e, { rail: true });
        B.col(bowGap[1], r0, -HZ - O, HX + O, r1, -HZ - e, { rail: true });
      } else {
        // the gaps' edges line up with the rail's end posts (the stair handrails / crate edges take over there)
        B.col(-HX - O, r0, -HZ - O, -HX - e, r1, westGap[0], { rail: true });
        B.col(-HX - O, r0, westGap[1], -HX - e, r1, HZ + O, { rail: true });
        B.col(-HX - O, r0, -HZ - O, bowGap[0], r1, -HZ - e, { rail: true });
        B.col(bowGap[1], r0, -HZ - O, HX + O, r1, -HZ - e, { rail: true });
      }
      for (const s of [-1, 1]) B.col(s > 0 ? 1.26 : -HX - O, r0, HZ + e, s > 0 ? HX + O : -1.26, r1, HZ + O, { rail: true });
      // --- foredeck H-bitt (collider) and the towing winch against the deckhouse (collider)
      B.box('metal', C.steelDk, 1.16, 0.05, 0.4, 0, DK + 0.025, -3.7, { r: 0.02 });
      for (const s of [-1, 1]) {
        B.lathe('gloss', C.black, [[0, 0], [0.12, 0], [0.12, 0.54], [0.16, 0.57], [0.16, 0.62], [0.1, 0.64], [0, 0.64]], s * 0.4, DK + 0.04, -3.7, { seg: 14 });
        B.cyl('gloss', C.black, 0.045, 0.2, s * 0.53, DK + 0.46, -3.7, { rz: HP, seg: 8 });
      }
      B.cyl('gloss', C.black, 0.07, 0.8, 0, DK + 0.44, -3.7, { rz: HP, seg: 12 });
      B.col(-0.58, DK, -3.9, 0.58, DK + 0.68, -3.5);
      const wz = 1.47, wy = DK + 0.47;
      for (const s of [-1, 1]) {
        B.box('gloss', buff, 0.08, 0.72, 0.7, s * 0.72, DK + 0.36, wz, { r: 0.03 });                  // side cheeks
        B.cyl('gloss', buff, 0.42, 0.05, s * 0.6, wy, wz, { rz: HP, seg: 24 });                          // drum flanges
      }
      B.cyl('gloss', C.steelDk, 0.26, 1.16, 0, wy, wz, { rz: HP, seg: 18 });
      B.cyl('rubber', C.rope, 0.35, 1.08, 0, wy, wz, { rz: HP, seg: 20 });
      for (let k = 0; k < 6; k++) B.tor('rubber', shade(C.rope, 0.86 + (k % 2) * 0.1), 0.35, 0.03, -0.46 + k * 0.184, wy, wz, { ry: HP, rs: 3, ts: 16 });
      B.box('gloss', shade(buff, 0.85), 0.34, 0.4, 0.5, -0.48, DK + 0.2, wz + 0.02, { round: true, r: 0.04 });    // gearbox
      B.box('metal', C.steelDk, 1.5, 0.05, 0.7, 0, DK + 0.025, wz, { r: 0.015 });
      B.tube('rubber', C.rope, [P3(0.3, wy + 0.3, wz + 0.05), P3(0.33, wy + 0.34, wz + 0.2), P3(0.36, wy + 0.1, wz + 0.36), P3(0.37, wy - 0.12, wz + 0.37)], 0.045, { radial: 7 });
      B.tor('rubber', C.ropeDk, 0.08, 0.035, 0.37, wy - 0.2, wz + 0.37, { ry: HP, rs: 6, ts: 12 });
      B.col(-0.8, DK, 1.1, 0.8, DK + 0.9, 1.84);
      // --- deckhouse: raked front windows, side windows + doors, aft windows, towing hook, sidelights, life ring
      const HB = 2.6, HT = 4.3, hx = 1.7, hz0 = -1.9, hz1 = 1.1;
      B.push(0, HB, hz0, PI);                                                         // front (-Z)
      glazing(B, -1.45, 1.45, 0.72, 1.34, 4, { frame: C.white });
      B.box('gloss', C.white, 2 * hx + 0.2, 0.05, 0.1, 0, HT - HB - 0.03, 0.05, { r: 0.02 });
      for (const [lx, lc] of [[-1.5, C.green], [1.5, C.red]]) {
        B.box('paint', C.black, 0.22, 0.18, 0.16, lx, 1.47, 0.08, { r: 0.02 });
        B.cyl('glow', lc, 0.045, 0.05, lx, 1.47, 0.16, { rx: HP, seg: 10, glow: 1.4 });
        B.blink(lc, lx, 1.47, 0.19, { size: 0.04, rate: 0.15, lo: 2.2, hi: 2.6 });
      }
      B.pop();
      for (const s of [-1, 1]) {
        B.push(s * hx, HB, 0, s * HP);                                                // sides: local +X = world ∓Z…
        const toZ = (z) => -s * z;                                                    // local x for a world z on this face
        glazing(B, Math.min(toZ(-1.5), toZ(-0.45)), Math.max(toZ(-1.5), toZ(-0.45)), 0.8, 1.35, 1, { frame: C.white });
        shipDoor(B, toZ(0.66), 0.62, 1.44, C.whiteDk, s);
        ringBuoy(B, toZ(-0.06), 0.72, 0.07, 0.8);
        B.box('gloss', C.white, hz1 - hz0 + 0.2, 0.05, 0.1, 0, HT - HB - 0.03, 0.05, { r: 0.02 });
        B.pop();
      }
      B.push(0, HB, hz1);                                                             // aft (+Z)
      for (const x of [-1.05, 1.05]) glazing(B, x - 0.42, x + 0.42, 1.0, 1.4, 1, { frame: C.white });
      B.box('metal', C.steelDk, 0.5, 0.42, 0.05, 0, 1.2, 0.025, { r: 0.02 });
      for (const q of [-1, 1]) B.box('metal', C.steelDk, 0.05, 0.3, 0.12, q * 0.1, 1.22, 0.08, { r: 0.015 });
      cy(B, 'metal', C.steel, 0.03, 0.26, 0, 1.3, 0.12, { rz: HP, seg: 8 });
      B.tube('metal', '#3c4046', [P3(0, 1.3, 0.12), P3(0, 1.14, 0.14), P3(0, 1.02, 0.14), P3(0.0, 0.95, 0.1), P3(0, 0.97, 0.04), P3(0, 1.04, 0.03)], 0.04, { radial: 8 });
      B.box('gloss', C.white, 2 * hx + 0.2, 0.05, 0.1, 0, HT - HB - 0.03, 0.05, { r: 0.02 });
      B.pop();
      // --- the stack (collider) on the deckhouse roof, aft; rain-capped exhaust
      B.add('gloss', fleetFunnelGeo(0.45, 0.35, 0.16, 1.2, 'tug'), 'white', 0, HT, 0.45, {});
      B.col(-0.45, HT, 0.1, 0.45, HT + 1.2, 0.8);
      B.cyl('metal', '#2a2c31', 0.08, 0.4, 0.12, HT + 1.35, 0.45, { seg: 12 });
      B.lathe('metal', '#1d1e22', [[0.06, 0], [0.11, 0.04], [0.11, 0.07], [0.06, 0.05]], 0.12, HT + 1.53, 0.45, { seg: 12 });
      for (const s of [-1, 1]) {
        B.push(0, HT + 0.62, 0.45 + s * 0.339, s > 0 ? 0 : PI);
        B.cyl('paint', C.white, 0.17, 0.01, 0, 0, 0.005, { rx: HP, seg: 24 });
        B.cyl('paint', C.teal, 0.145, 0.012, 0, 0, 0.007, { rx: HP, seg: 24 });
        B.tube('paint', C.white, [P3(-0.09, -0.03, 0.014), P3(-0.07, 0.05, 0.014), P3(0.0, 0.09, 0.014), P3(0.06, 0.05, 0.014), P3(0.05, -0.02, 0.014), P3(0.0, -0.03, 0.014)], 0.014, { radial: 4 });
        B.pop();
      }
      // --- mast (buff) on the deckhouse roof front: towing lights, horn, searchlight, yard, radar on top (≥ 4.6 m over the roof)
      const mx = 0, mz = -1.3, mTop = 9.15;
      B.box('metal', C.steelDk, 0.3, 0.04, 0.3, mx, HT + 0.02, mz, { r: 0.012 });
      B.lathe('gloss', buff, [[0, HT], [0.08, HT], [0.07, HT + 0.12], [0.05, mTop], [0, mTop + 0.01]], mx, 0, mz, { seg: 12 });
      for (let k = 0; k < 9; k++) B.cyl(ns(B, 'metal'), C.galv, 0.012, 0.18, mx + (k % 2 ? 0.1 : -0.1), HT + 0.45 + k * 0.38, mz, { rz: HP, seg: 5 });
      for (const [y, c] of [[7.35, '#fff4dc'], [7.75, '#fff4dc'], [8.15, '#fff4dc']]) {
        B.box('metal', C.steelDk, 0.06, 0.04, 0.16, mx, y - 0.06, mz - 0.1, { r: 0.01 });
        B.cyl('paint', C.black, 0.055, 0.1, mx, y, mz - 0.17, { seg: 10 });
        B.blink(c, mx, y, mz - 0.17, { size: 0.045, rate: 0.13, lo: 2.2, hi: 2.6 });
      }
      B.box('gloss', buff, 1.3, 0.06, 0.06, mx, 8.92, mz, { r: 0.02 });                                  // yard (4.6 m over the roof)
      for (const s of [-1, 1]) B.cyl(ns(B, 'metal'), C.steelDk, 0.01, 0.9, mx + s * 0.62, 9.37, mz, { seg: 5 });
      B.flag(mx + 0.62, 8.9, mz, { color: C.teal, s: 1.2, ry: HP });
      B.push(mx, 6.2, mz - 0.05, 0, -HP);
      B.lathe('gloss', C.white, [[0.025, 0], [0.03, 0.2], [0.05, 0.32], [0.1, 0.4], [0.09, 0.42], [0.04, 0.34]], 0, 0, 0, { seg: 12 });
      B.pop();
      B.box('metal', C.steelDk, 0.1, 0.08, 0.2, mx, 5.75, mz - 0.1, { r: 0.02 });
      B.cyl('gloss', '#36383e', 0.085, 0.2, mx, 5.85, mz - 0.26, { rx: HP, seg: 12 });
      B.cyl('glow', '#fff1d6', 0.07, 0.01, mx, 5.85, mz - 0.362, { rx: HP, seg: 12, glow: 1.2 });
      B.box('gloss', C.whiteDk, 0.26, 0.18, 0.24, mx, mTop + 0.08, mz, { round: true, r: 0.04 });
      radar(B, mx, mTop + 0.2, mz, 1.1, 2.7);
      B.blink('#ff5a4a', mx, mTop + 0.45, mz, { size: 0.04, rate: 0.5, lo: 0.3, hi: 4.5 });
      // --- in the yard: boat stands, cribbing under the bow + bilges, a ladder up the west side
      for (const s of [-1, 1]) {
        B.push(s * HX, 0, 0, s * HP);
        for (const z of [-3.3, 0.9, 4.25]) if (!(s < 0 && inWest(z, 0.45))) boatStand(B, -s * z, 1.05, 0.62);
        cribbing(B, -s * -1.6, 2, 0.34);
        if (!(s < 0 && inWest(2.0, 0.6))) cribbing(B, -s * 2.0, 2, 0.34);
        B.pop();
      }
      B.push(acc ? -0.35 : 0, 0, -HZ, PI); cribbing(B, 0, 2, 0.5); B.pop();
      if (!accW) {
      B.push(-HX, 0, 2.6, -HP);                                                                          // ladder (west side)
      for (const s of [-1, 1]) {
        B.tube('metal', '#c9ced3', [P3(s * 0.23, 0.02, 0.78), P3(s * 0.23, 2.3, 0.14)], 0.024, { radial: 6 });
        B.box('rubber', C.rubber, 0.08, 0.05, 0.1, s * 0.23, 0.025, 0.79, { r: 0.015 });
      }
      for (let k = 1; k < 8; k++) { const t = k / 8.2; B.cyl('metal', '#c9ced3', 0.016, 0.46, 0, 0.02 + t * 2.28, 0.78 - t * 0.64, { rz: HP, seg: 6 }); }
      B.pop();
      }
    },
  };

  // ================================================================================================ HOUSEBOAT "SEA SHANTY"
  // Blocks: houseboat-hull x -17.6…-7.0, z -23.4…-14.4, deck y 0.7 (a wide floating-home pontoon filling the slip:
  // kid-hoppable from the Long Pier gangway side, the finger pier and the boardwalk; a porch rail along the fuel-dock
  // side); houseboat-cabin x -16.2…-13.0, z -21.4…-16.2, roof y 2.9 (squid-only high ground); gangway lands on the west
  // edge at z -18.8. Placed at the CABIN centre (-14.6, 0, -18.9): local hull x -3.0…7.6, z ±4.5 (the open sun deck is
  // local x 1.6…7.6); cabin x ±1.6, z -2.5…2.7.
  const bushPuff = (seed, det = 1) => cached('puff|' + seed + '|' + det, () => H.puffGeo(det, seed));
  const flowerBlob = (seed) => cached('blob|' + seed, () => H.blobGeo(1, 0, seed));
  // leafy mound + flower heads inside a W × D footprint at height y (planter soil level)
  function plantBed(B, x, y, z, W, Dp, seed, flowers = ['#e79ab8', '#f2eee6', '#e5b94d', '#a79be0'], det = 1) {
    const n = Math.max(2, Math.round(W / 0.36));
    for (let i = 0; i < n; i++) {
      const px = x - W / 2 + (i + 0.5) * (W / n), r = Math.min(Dp * 0.55, 0.26) * (0.85 + ((i * 37 + seed) % 5) * 0.06);
      B.add('foliage', bushPuff((i + seed) % 6, det), mixc('#4f9a57', '#8fc46b', ((i + seed) % 3) * 0.2), px, y + r * 0.55, z + ((i % 2) - 0.5) * Dp * 0.18, { s: r, sy: r * 0.8, ry: i * 1.3 });
    }
    for (let k = 0; k < n * 2; k++) {
      const fx = x - W / 2 + 0.08 + ((k * 0.618 + seed * 0.13) % 1) * (W - 0.16), fz = z + (((k * 0.414 + seed * 0.29) % 1) - 0.5) * Dp * 0.7;
      B.add('foliage', flowerBlob(k % 8), flowers[k % flowers.length], fx, y + 0.24 + ((k * 7) % 5) * 0.025, fz, { s: 0.045 });
    }
  }
  // Timber-framed cottage window on a wall (plane z = 0, facing +Z): frame, cross mullions, glass, curtains, sill.
  function cottageWindow(B, x, y, w, h, curtain = '#e5b94d', box = false) {
    noShadow(B, () => {
    B.box('gloss', C.white, w + 0.14, h + 0.14, 0.05, x, y, 0.025, { r: 0.025 });
    bx(B, 'gloss', C.glass, w, h, 0.02, x, y, 0.045);
    for (const s of [-1, 1]) bx(B, 'paint', curtain, w * 0.26, h - 0.04, 0.012, x + s * (w / 2 - w * 0.13), y, 0.058);
    bx(B, 'paint', shade(curtain, 0.85), w - 0.02, 0.07, 0.014, x, y + h / 2 - 0.05, 0.06);                  // valance
    bx(B, 'gloss', C.white, 0.04, h, 0.035, x, y, 0.07);
    bx(B, 'gloss', C.white, w, 0.04, 0.035, x, y + h * 0.1, 0.07);
    B.box('wood', C.teak, w + 0.24, 0.05, 0.1, x, y - h / 2 - 0.1, 0.05, { r: 0.015 });                  // sill
    if (box) {
      B.box('wood', shade(C.teak, 0.9), w + 0.1, 0.16, 0.12, x, y - h / 2 - 0.22, 0.06, { r: 0.02 });
      plantBed(B, x, y - h / 2 - 0.21, 0.07, w + 0.02, 0.1, Math.round(x * 10 + y * 7) & 7, undefined, 0);
    }
    });
  }

  // Light city bike along local +X (front wheel +X), for set dressing at a distance (≈ 1.3k tris).
  function lightBike(B, frame, basket = false) {
    const R = 0.33, rw = [-0.5, R], fw = [0.52, R], bb = [-0.05, 0.3], st = [-0.2, 0.86], ht = [0.38, 0.9];
    for (const [wx, wy] of [rw, fw]) {
      B.tor('rubber', C.black, R - 0.018, 0.022, wx, wy, 0, { rs: 5, ts: 18 });
      B.tor('metal', C.galv, R - 0.045, 0.01, wx, wy, 0, { rs: 3, ts: 18 });
      cy(B, 'metal', C.galv, 0.024, 0.1, wx, wy, 0, { rx: HP, seg: 8 });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * PI; bx(B, 'metal', C.galv, 0.006, 2 * (R - 0.05), 0.006, wx, wy, 0, { rz: a }); }
    }
    const fr = (a, b, r = 0.018) => B.tube('gloss', frame, [P3(a[0], a[1], 0), P3(b[0], b[1], 0)], r, { radial: 5 });
    fr(bb, st, 0.02); fr(st, ht, 0.017); fr(bb, [0.43, 0.72], 0.022); fr([0.43, 0.72], ht, 0.024);
    fr(bb, rw, 0.012); fr([st[0] + 0.03, st[1] - 0.08], rw, 0.011); fr([0.43, 0.72], fw, 0.013);
    B.box('gloss', C.black, 0.26, 0.055, 0.15, st[0] - 0.08, st[1] + 0.14, 0, { round: true, r: 0.025 });
    B.tube('metal', C.galv, [P3(ht[0] - 0.02, ht[1], 0), P3(ht[0] - 0.02, ht[1] + 0.12, 0)], 0.012, { radial: 5 });
    B.tube('metal', C.galv, [P3(ht[0] - 0.06, ht[1] + 0.12, -0.26), P3(ht[0] + 0.02, ht[1] + 0.12, -0.1), P3(ht[0] + 0.02, ht[1] + 0.12, 0.1), P3(ht[0] - 0.06, ht[1] + 0.12, 0.26)], 0.011, { radial: 5 });
    for (const q of [-1, 1]) cy(B, 'rubber', C.black, 0.018, 0.1, ht[0] - 0.07, ht[1] + 0.12, q * 0.23, { rx: HP });
    B.tor('metal', C.steelDk, 0.1, 0.008, bb[0], bb[1], 0.05, { rs: 3, ts: 14 });
    bx(B, 'gloss', frame, 0.42, 0.06, 0.012, (bb[0] + rw[0]) / 2, bb[1] + 0.03, 0.065, { rz: 0.06 });   // chain guard
    for (const [wx, wy, a0, a1] of [[rw[0], rw[1], 0.25, PI - 0.4], [fw[0], fw[1], 0.5, PI - 0.15]]) B.tube('gloss', frame, arcPtsXY(wx, wy, R + 0.035, a0, a1, 7), 0.018, { radial: 5 });
    B.tube('metal', C.steelDk, [P3(bb[0] - 0.08, bb[1] - 0.01, -0.05), P3(bb[0] - 0.22, 0.01, -0.17)], 0.01, { radial: 4 });
    cy(B, 'gloss', C.white, 0.035, 0.05, ht[0] + 0.08, ht[1] - 0.04, 0, { rz: HP, seg: 8 });
    if (basket) {
      B.push(fw[0] + 0.05, ht[1] - 0.02, 0);
      B.box('wood', C.teak, 0.3, 0.2, 0.34, 0, 0.1, 0, { r: 0.02 });
      B.box('paint', '#5a4535', 0.26, 0.02, 0.3, 0, 0.19, 0, { r: 0.005 });
      B.add('foliage', bushPuff(2), '#6aa35d', 0.02, 0.24, 0.02, { s: 0.12, sy: 0.08 });
      B.pop();
    }
  }
  function arcPtsXY(cx, cy2, R, a0, a1, n) { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push(P3(cx + Math.cos(a) * R, cy2 + Math.sin(a) * R, 0)); } return out; }

  D.houseboat_dress = {
    desc: 'Houseboat SEA SHANTY (dresses the houseboat hull/cabin blocks, placed at the cabin centre): timber deck-edge cap + rubbing strip, waterline band, sheer line + scuppers, names, fenders, mooring lines to the Long Pier and fuel-dock cleats, porch rail along the fuel-dock side + the open-water stern (rail colliders; open at the gangway, the pier, the finger pier and the boardwalk), cottage windows with curtains + flower boxes, door with lamp + mailbox, fascia/gutters; open sun deck with a café table set + a timber planter bench (colliders) and festoon lights; roof garden (planter trough, solar panels, kayak on a rack, chimney — colliders), deck chair + furled parasol; bike + laundry line.',
    params: { xe: "the hull's east end, local (7.6; Tower Command 1.6: the sun deck is the checkpoint float)" }, variants: 1, mount: 'ground',
    build(B, o = {}) {
      B.aoBase = 0.7;
      // local frame = the cabin centre; the hull runs from XW (west, Long Pier side) to XE (east, fuel-dock side).
      // Tower Command trims it at the cabin's east wall (xe 1.6): no sun deck, porch rail, fuel-dock lines or RIB there.
      const XW = -3.0, XE = o.xe ?? 7.6, XC = (XW + XE) / 2, HW = (XE - XW) / 2, HZ = 4.5, trim = XE < 2.4;
      const DK = 0.7, CX = 1.6, CZ0 = -2.5, CZ1 = 2.7, RF = 2.9, wood = C.teak, woodDk = C.teakDk;
      const ORG = [-14.6, -18.9];                                               // placement (world) → local = world - ORG
      const band = '#2f3b3a', sheer = shade(C.houseTeal, 1.12);
      // --- pontoon hull: waterline band, rubbing strip, pale sheer line, deck-edge timber cap on the faces, scuppers
      for (const [x, s] of [[XW, -1], [XE, 1]]) {
        B.box(ns(B, 'paint'), band, 0.02, 0.34, 2 * HZ + 0.04, x + s * 0.01, -1.5, 0, { r: 0.006 });
        B.box('rubber', C.rubber, 0.07, 0.1, 2 * HZ - 0.3, x + s * 0.03, 0.3, 0, { round: true, r: 0.03 });
        B.box(ns(B, 'paint'), sheer, 0.012, 0.07, 2 * HZ - 0.1, x + s * 0.006, 0.47, 0, { r: 0.004 });
        B.box('wood', wood, 0.07, 0.14, 2 * HZ + 0.14, x + s * 0.035, DK - 0.07, 0, { r: 0.02 });
      }
      for (const s of [-1, 1]) {
        B.box(ns(B, 'paint'), band, 2 * HW + 0.04, 0.34, 0.02, XC, -1.5, s * (HZ + 0.01), { r: 0.006 });
        B.box('rubber', C.rubber, 2 * HW - 0.3, 0.1, 0.07, XC, 0.3, s * (HZ + 0.03), { round: true, r: 0.03 });
        B.box(ns(B, 'paint'), sheer, 2 * HW - 0.1, 0.07, 0.012, XC, 0.47, s * (HZ + 0.006), { r: 0.004 });
        B.box('wood', wood, 2 * HW, 0.14, 0.07, XC, DK - 0.07, s * (HZ + 0.035), { r: 0.02 });
      }
      noShadow(B, () => {                                                       // deck scuppers just above the rubbing strip
        for (let x = XW + 1.2; x < XE - 0.8; x += 2.1) for (const s of [-1, 1]) bx(B, 'paint', band, 0.22, 0.06, 0.012, x, 0.12, s * (HZ + 0.006));
        for (const z of [-3.2, -1.05, 1.1, 3.25]) bx(B, 'paint', band, 0.012, 0.06, 0.22, XE + 0.006, 0.12, z);
        // welded pontoon plate seams between the waterline band and the rubbing strip (clear of the names + swim ladder)
        const seam = shade(C.houseTeal, 0.86), sy = (-1.33 + 0.24) / 2, sh = 0.24 + 1.33;
        for (let z = -HZ + 1.5; z < HZ - 0.5; z += 1.5) {
          if (Math.abs(z - 2.75) > 1.35) bx(B, 'paint', seam, 0.01, sh, 0.035, XW - 0.005, sy, z);
          if (Math.abs(z) > 1.35) bx(B, 'paint', seam, 0.01, sh, 0.035, XE + 0.005, sy, z);
        }
        for (let x = XW + 1.5; x < XE - 0.5; x += 1.5) {
          if (Math.abs(x - (trim ? XC : 4.9)) > 1.45) bx(B, 'paint', seam, 0.035, sh, 0.01, x, sy, -HZ - 0.005);
          bx(B, 'paint', seam, 0.035, sh, 0.01, x, sy, HZ + 0.005);
        }
      });
      B.push(XW, 0, 0, -HP);                                                    // west face (toward the Long Pier)
      text(B, 'SEA SHANTY', 0.26, C.white, 2.75, -0.2, 0.002, { weight: 0.17 });
      text(B, 'INKWAVE', 0.11, C.white, 2.75, -0.4, 0.002, { weight: 0.2, spacing: 0.4 });
      B.pop();
      B.push(trim ? XC : 4.9, 0, -HZ, PI);                                      // south face (seen from the quay across the slip)
      text(B, 'SEA SHANTY', 0.3, C.white, 0, -0.18, 0.002, { weight: 0.17 });
      text(B, 'INKWAVE', 0.12, C.white, 0, -0.42, 0.002, { weight: 0.2, spacing: 0.4 });
      B.pop();
      if (!trim) {
      B.push(XE, 0, 0, HP);                                                      // east face
      text(B, 'SEA SHANTY', 0.26, C.white, 0, -0.2, 0.002, { weight: 0.17 });
      // swim ladder down the east side
      for (const s of [-1, 1]) B.tube('metal', C.galv, [P3(s * 0.22, -1.9, 0.12), P3(s * 0.22, 0.45, 0.12), P3(s * 0.22, 0.62, 0.08), P3(s * 0.22, 0.62, 0.02)], 0.02, { radial: 6 });
      for (let y = -1.35; y < 0.4; y += 0.3) B.cyl('metal', C.galv, 0.016, 0.44, 0, y, 0.12, { rz: HP, seg: 6 });
      B.pop();
      }
      // --- fenders hung off hull-side cleats; mooring lines to the pier cleats (docks stream, Long Pier inner run)
      const sideCleat = (x, y, z, ry) => { B.push(x, y, z, ry); B.box('metal', C.galv, 0.2, 0.04, 0.05, 0, 0, 0.03, { r: 0.012 }); for (const q of [-1, 1]) B.cyl('metal', C.galv, 0.015, 0.05, q * 0.06, 0, 0.02, { rx: HP, seg: 6 }); B.pop(); };
      const hangFender = (x, z, ry, c = C.navy) => {
        B.push(x, 0, z, ry);
        sideCleat(0, 0.58, 0.035, 0);
        B.tube('rubber', C.rope, [P3(0, 0.56, 0.07), P3(0, 0.3, 0.14), P3(0, 0.12, 0.17)], 0.012, { radial: 4 });
        B.lathe('gloss', c, [[0, -0.36], [0.06, -0.355], [0.1, -0.31], [0.115, -0.2], [0.115, 0.2], [0.1, 0.31], [0.06, 0.355], [0, 0.36]], 0, -0.28, 0.17, { seg: 12 });
        for (const q of [-1, 1]) B.tor('gloss', C.white, 0.02, 0.008, 0, -0.28 + q * 0.38, 0.17, { rs: 3, ts: 7 });
        B.pop();
      };
      hangFender(XW, -2.9, -HP); hangFender(XW, 3.1, -HP, C.white);
      hangFender(-1.4, -HZ, PI, C.white); hangFender(1.2, -HZ, PI);
      if (!trim) { hangFender(6.7, -HZ, PI, C.white); hangFender(XE, -2.1, HP); hangFender(XE, 2.35, HP, C.white); }
      // mooring lines: west to the Long Pier inner-run cleats (world x -19.64, z -22.8 / -14.8), east across the slip to
      // the fuel dock's berth cleats (world x -4.36, z -21.6 / -16.4) — breast lines both sides, as if moored in the berth
      const L2 = (wx, wz) => [wx - ORG[0], wz - ORG[1]];
      const lines = [[XW, -3.85, -1, L2(-19.64, -22.8)], [XW, 4.05, -1, L2(-19.64, -14.8)], ...(trim ? [] : [[XE, -2.95, 1, L2(-4.36, -21.6)], [XE, 2.95, 1, L2(-4.36, -16.4)]])];
      for (const [hx0, hz0, s, [px, pz]] of lines) {
        const hy0 = 0.62, py = 0.075;
        sideCleat(hx0, hy0, hz0, s * HP);
        rope(B, [hx0 + s * 0.07, hy0, hz0], [px - s * 0.07, py + 0.04, pz], 0.22, 0.018, C.rope, 14);
        bittTurns(B, px, py - 0.015, pz, 0.05, 0.035, 1, C.rope);
      }
      // --- cabin: corner boards, fascia + gutters + downpipes, windows, door
      for (const [x, z] of [[-CX, CZ0], [CX, CZ0], [-CX, CZ1], [CX, CZ1]]) B.box('wood', C.white, 0.12, RF - DK, 0.12, x, (DK + RF) / 2, z, { r: 0.03 });
      for (const s of [-1, 1]) {
        B.box('wood', C.white, 0.06, 0.14, CZ1 - CZ0 + 0.12, s * (CX + 0.03), RF - 0.07, (CZ0 + CZ1) / 2, { r: 0.015 });
        B.box('wood', C.white, 2 * CX + 0.12, 0.14, 0.06, 0, RF - 0.07, s > 0 ? CZ1 + 0.03 : CZ0 - 0.03, { r: 0.015 });
        B.cyl('metal', C.galv, 0.05, CZ1 - CZ0 + 0.1, s * (CX + 0.075), RF - 0.12, (CZ0 + CZ1) / 2, { rx: HP, seg: 10 });
        B.tube('metal', C.galv, [P3(s * (CX + 0.06), RF - 0.16, CZ1 - 0.08), P3(s * (CX + 0.1), RF - 0.3, CZ1 - 0.08), P3(s * (CX + 0.1), DK + 0.2, CZ1 - 0.08), P3(s * (CX + 0.14), DK + 0.05, CZ1 - 0.04)], 0.035, { radial: 8 });
      }
      // east wall (+X): three windows with flower boxes
      B.push(CX, 0, 0, HP);
      for (const [z, cc] of [[-1.55, '#e5b94d'], [0.1, '#df7c66'], [1.75, '#e5b94d']]) cottageWindow(B, -z, 1.95, 0.9, 0.72, cc, true);
      B.pop();
      // south wall (-Z): two windows
      B.push(0, 0, CZ0, PI);
      for (const x of [-0.78, 0.78]) cottageWindow(B, x, 1.95, 0.78, 0.72, '#a79be0', x > 0);
      B.pop();
      // north wall (+Z): one wide window + a small one
      B.push(0, 0, CZ1);
      cottageWindow(B, -0.55, 2.0, 1.2, 0.66, '#df7c66');
      cottageWindow(B, 0.95, 2.1, 0.44, 0.44, '#e5b94d');
      B.pop();
      // west wall (-X): the door facing the gangway, lamp, house number, mailbox, one window, a life ring
      B.push(-CX, 0, 0, -HP);                                                    // local +X = world +Z
      const dz = 0.1;
      B.box('wood', C.white, 1.02, 2.08, 0.06, dz, DK + 1.04, 0.03, { round: true, r: 0.03 });
      B.box('gloss', C.tealDk, 0.84, 1.96, 0.05, dz, DK + 0.98, 0.07, { round: true, r: 0.03 });
      for (const [py, ph] of [[0.55, 0.62], [1.35, 0.5]]) B.box('gloss', shade(C.tealDk, 1.12), 0.64, ph, 0.02, dz, DK + py, 0.1, { round: true, r: 0.02 });
      B.tor('metal', '#b58a4a', 0.13, 0.025, dz, DK + 1.58, 0.11, { rs: 6, ts: 18 });
      B.cyl('gloss', C.glass, 0.12, 0.01, dz, DK + 1.58, 0.1, { rx: HP, seg: 16 });
      B.sph('metal', '#b58a4a', 0.04, dz + 0.32, DK + 1.0, 0.12, { ws: 8, hs: 6 });
      B.box('wood', woodDk, 1.1, 0.06, 0.14, dz, DK + 2.1, 0.07, { r: 0.02 });                          // drip cap
      B.box('metal', C.black, 0.14, 0.24, 0.1, dz + 0.72, DK + 1.75, 0.05, { r: 0.03 });                  // lamp
      B.box('glow', '#ffdca0', 0.1, 0.14, 0.02, dz + 0.72, DK + 1.73, 0.105, { glow: 1.6, r: 0.01 });
      B.box('metal', C.black, 0.18, 0.03, 0.12, dz + 0.72, DK + 1.89, 0.06, { r: 0.01 });
      B.box('gloss', C.navy, 0.2, 0.2, 0.012, dz - 0.62, DK + 1.62, 0.006, { r: 0.03 });                 // house number plaque
      text(B, '7', 0.13, C.white, dz - 0.62, DK + 1.555, 0.012, { weight: 0.2, depth: 0.004 });
      B.box('gloss', C.coral, 0.32, 0.22, 0.12, dz - 0.66, DK + 1.2, 0.06, { round: true, r: 0.04 });   // mailbox
      B.box('gloss', shade(C.coral, 0.8), 0.24, 0.02, 0.01, dz - 0.66, DK + 1.26, 0.121, { r: 0.004 });
      cottageWindow(B, -1.75, 2.0, 0.7, 0.6, '#e79ab8');
      cottageWindow(B, 1.85, 2.0, 0.7, 0.6, '#e79ab8');
      ringBuoy(B, 1.85, DK + 0.72, 0.07, 0.75);
      B.pop();

      if (!trim) {
      // --- porch rail: the fuel-dock (east) side, the stern over open water (south, from the finger pier's end to the
      //     corner) and a short return on the boardwalk side (north). The west/pier side, the gangway, the finger-pier
      //     stretch of the stern and the rest of the boardwalk side stay open (kid hops onto the deck).
      const railH = 0.82, px = XE - 0.12, XS = 2.4;
      const posts = [];
      for (let z = -HZ + 0.12; z <= HZ - 0.11; z += 1.1) posts.push([px, z]);
      posts.push([px, HZ - 0.12]);
      for (let x = px - 1.1; x > XS + 0.3; x -= 1.1) posts.push([x, -HZ + 0.12]);
      posts.push([XS, -HZ + 0.12]);
      for (const x of [px - 0.6, px - 1.2]) posts.push([x, HZ - 0.12]);
      for (const [x, z] of posts) {
        B.box('wood', C.white, 0.08, railH, 0.08, x, DK + railH / 2, z, { r: 0.02 });
        bx(B, 'wood', C.white, 0.1, 0.04, 0.1, x, DK + railH + 0.02, z);
      }
      B.box('wood', wood, 0.12, 0.05, 2 * HZ - 0.12, px, DK + railH + 0.05, 0, { r: 0.02 });
      B.box('wood', wood, px - XS + 0.12, 0.05, 0.12, (px + XS) / 2, DK + railH + 0.05, -HZ + 0.12, { r: 0.02 });
      B.box('wood', wood, 1.32, 0.05, 0.12, px - 0.6, DK + railH + 0.05, HZ - 0.12, { r: 0.02 });
      for (const y of [0.32, 0.56]) {
        B.cyl('rubber', C.rope, 0.014, 2 * HZ - 0.3, px, DK + y, 0, { rx: HP, seg: 6 });
        B.cyl('rubber', C.rope, 0.014, px - XS - 0.1, (px + XS) / 2, DK + y, -HZ + 0.12, { rz: HP, seg: 6 });
        B.cyl('rubber', C.rope, 0.014, 1.2, px - 0.6, DK + y, HZ - 0.12, { rz: HP, seg: 6 });
      }
      // porch-rail colliders (rail: kids can't walk through, shots / ink / squids pass), 6 cm above the deck. Each box
      // reaches 0.7 m out over the water so its centre lies beyond the deck edge by more than a foot's reach (0.24): a kid
      // anywhere its feet still hold the deck — even a squid surfacing on the very lip — is pushed back inboard (a rail
      // pushes out along its nearest face), never into the slip.
      // the RIB tender's painter from the stern corner post down to its bow eye (boat_rib placed at world (-9.4, -27.0))
      rope(B, [px, DK + 0.12, -HZ + 0.12], [-7.74 - ORG[0], -1.28, -27.12 - ORG[1]], 0.35, 0.014, C.rope, 16);
      const p0 = DK + 0.06, p1 = DK + railH + 0.08, t = XE - (px - 0.04), W0 = 0.7;
      B.col(px - 0.04, p0, -HZ - W0, XE + W0, p1, HZ + W0, { rail: true });
      B.col(XS - 0.06, p0, -HZ - W0, px - 0.04, p1, -HZ + t, { rail: true });
      B.col(px - 1.26, p0, HZ - t, px - 0.04, p1, HZ + W0, { rail: true });
      // festoon lights over the sun deck: from the roof's east corner posts out to two tall posts on the porch rail
      for (const [zr, zp] of [[CZ0 + 0.08, -HZ + 0.12 + 1.1], [CZ1 - 0.08, -HZ + 0.12 + 4.4]]) {   // on the rail posts at z -3.28 / 0.02
        B.box('wood', C.white, 0.08, 1.55, 0.08, px, DK + railH + 0.1 + 0.62, zp, { r: 0.02 });
        B.sph('metal', C.black, 0.03, px, DK + railH + 0.1 + 1.4, zp, { ws: 8, hs: 6 });
        const a = [CX - 0.06, RF + 1.4, zr], b = [px, DK + railH + 0.1 + 1.36, zp];
        B.tube(ns(B, 'rubber'), C.black, ropePts(a, b, 0.42, 16), 0.006, { radial: 4 });
        const lp3 = ropePts(a, b, 0.42, 44);
        for (let k = 1; k < 11; k++) {
          const q = lp3[k * 4];
          cy(B, 'rubber', C.black, 0.01, 0.04, q[0], q[1] - 0.025, q[2], { seg: 5 });
          B.sph('glow', k % 3 === 1 ? '#ffd9a8' : '#fff0c9', 0.03, q[0], q[1] - 0.07, q[2], { ws: 6, hs: 4, glow: 2.6, sy: 1.25 });
        }
      }
      // --- the open sun deck (local x 1.6…7.6): a café table set under a coral parasol and a timber planter bench —
      //     two low cover pieces (colliders), everything else left clear
      { const n = B.cols.length; B.push(4.4, DK, -1.9, 0.35); D.cafeset.build(B, { color: C.coral, variant: 1 }); B.pop(); B.cols.length = n; }
      B.col(4.4 - 0.85, DK, -1.9 - 0.85, 4.4 + 0.85, DK + 0.78, -1.9 + 0.85);
      {
        const bx0 = 5.0, bz = 2.95, bW = 2.6, bD = 0.55, bH = 0.5;
        B.box('wood', wood, bW, bH, bD, bx0, DK + bH / 2, bz, { r: 0.03 });
        for (let k = 0; k < 3; k++) B.box('wood', shade(wood, 0.92), bW + 0.02, 0.02, bD + 0.02, bx0, DK + 0.12 + k * 0.14, bz, { r: 0.006 });
        B.box('paint', '#5a4535', bW - 0.1, 0.04, bD - 0.1, bx0, DK + bH - 0.03, bz, { r: 0.01 });
        plantBed(B, bx0 - 0.35, DK + bH - 0.04, bz, bW - 0.9, bD - 0.12, 5);
        // a little olive tree at the east end of the trough
        B.cyl('wood', C.teakDk, 0.035, 0.9, bx0 + 0.9, DK + bH + 0.4, bz, { seg: 7 });
        for (let k = 0; k < 4; k++) B.add('foliage', bushPuff((k + 2) % 6), mixc('#6f8f5a', '#9db77a', k * 0.25), bx0 + 0.9 + ((k % 2) - 0.5) * 0.3, DK + bH + 0.95 + (k >> 1) * 0.18, bz + ((k >> 1) - 0.5) * 0.22, { s: 0.3, sy: 0.24, ry: k * 1.7 });
        // slatted bench seat along the trough's inboard (south) face
        for (let k = 0; k < 4; k++) B.box('wood', shade(C.teak, 1.06), bW - 0.2, 0.03, 0.08, bx0, DK + 0.44, bz - bD / 2 - 0.08 - k * 0.09, { r: 0.01 });
        for (const q of [-1, 1]) B.box('wood', woodDk, 0.06, 0.44, 0.36, bx0 + q * (bW / 2 - 0.3), DK + 0.22, bz - bD / 2 - 0.2, { r: 0.012 });
        B.col(bx0 - bW / 2, DK, bz - bD / 2 - 0.42, bx0 + bW / 2, DK + bH, bz + bD / 2);
      }
      // laundry pegged on a line along the outside of the east porch rail (never over the deck), between two tall posts
      const lz0 = 1.05, lz1 = HZ - 0.12, ly = DK + railH + 0.3, lx = px + 0.07;
      for (const z of [lz0, lz1]) B.box('wood', C.white, 0.08, 0.5, 0.08, px, DK + railH + 0.22, z, { r: 0.02 });
      const l0 = [lx, ly, lz0], l1 = [lx, ly, lz1];
      B.tube(ns(B, 'rubber'), C.white, ropePts(l0, l1, 0.08, 10), 0.006, { radial: 4 });
      const cloth = [['#e9836c', 0.34, 0.42], ['#f2eee6', 0.42, 0.3], ['#7fc0df', 0.3, 0.4], ['#e5b94d', 0.16, 0.2], ['#f2eee6', 0.16, 0.2], ['#a79be0', 0.36, 0.46]];
      const lpts = ropePts(l0, l1, 0.08, 60);
      cloth.forEach(([c, w, h], k) => {
        const p = lpts[Math.round(((k + 0.8) / (cloth.length + 0.6)) * 60)];
        B.box('foliage', c, 0.012, h, w, p[0] + 0.01, p[1] - h / 2 + 0.01, p[2], { rx: (k % 2 ? 0.05 : -0.04), r: 0.004 });
        for (const q of [-1, 1]) bx(B, 'wood', '#ddb987', 0.02, 0.05, 0.015, p[0] + 0.012, p[1] + 0.005, p[2] + q * w * 0.35);
      });
      }
      // bike leaning on the back (north) wall of the cabin
      B.push(0.25, DK, CZ1 + 0.3, 0, 0.08); lightBike(B, C.sky || '#7fc0df', true); B.pop();

      // --- roof garden (y 2.9, squid-only): planter trough + chimney north, solar panels south, kayak rack east,
      //     deck chair + furled parasol on the west edge; festoon lights along the long edges. Solid items collide.
      B.aoBase = RF;
      // planter trough
      const tz = 2.18, tW = 2.3, tD = 0.5, tH = 0.42, tx = -0.35;
      B.box('wood', wood, tW, tH, tD, tx, RF + tH / 2, tz, { r: 0.03 });
      for (let k = 0; k < 3; k++) B.box('wood', shade(wood, 0.92), tW + 0.02, 0.02, tD + 0.02, tx, RF + 0.1 + k * 0.13, tz, { r: 0.006 });
      B.box('paint', '#5a4535', tW - 0.1, 0.04, tD - 0.1, tx, RF + tH - 0.03, tz, { r: 0.01 });
      plantBed(B, tx, RF + tH - 0.04, tz, tW - 0.2, tD - 0.12, 3);
      B.col(tx - tW / 2, RF, tz - tD / 2, tx + tW / 2, RF + tH, tz + tD / 2);
      // chimney (stove pipe + cap) in the north-east corner
      B.box('metal', C.steelDk, 0.3, 0.06, 0.3, 1.25, RF + 0.03, 2.3, { r: 0.02 });
      B.cyl('metal', '#2b2d31', 0.075, 1.05, 1.25, RF + 0.55, 2.3, { seg: 12 });
      B.lathe('metal', '#1f2024', [[0.07, 0], [0.16, 0.08], [0.02, 0.2]], 1.25, RF + 1.1, 2.3, { seg: 12 });
      B.cyl('metal', '#2b2d31', 0.1, 0.04, 1.25, RF + 0.85, 2.3, { seg: 12 });
      B.col(1.1, RF, 2.15, 1.4, RF + 1.1, 2.45);
      // solar panels on a raked frame (south end)
      for (const x of [-0.78, 0.78]) {
        B.push(x, RF + 0.3, -1.98, 0, -0.32);
        B.box('metal', C.galv, 1.46, 0.04, 0.96, 0, 0, 0, { r: 0.012 });
        B.box('gloss', '#1f2d4a', 1.38, 0.02, 0.88, 0, 0.025, 0, { r: 0.006 });
        for (let k = 1; k < 6; k++) bx(B, 'gloss', '#3a4a6a', 0.01, 0.004, 0.86, -0.69 + k * 0.23, 0.037, 0);
        for (let k = 1; k < 4; k++) bx(B, 'gloss', '#3a4a6a', 1.36, 0.004, 0.01, 0, 0.037, -0.44 + k * 0.22);
        B.pop();
        for (const [dz, h] of [[-0.42, 0.18], [0.42, 0.44]]) B.box('metal', C.galv, 0.04, h, 0.04, x, RF + h / 2, -1.98 + dz, { r: 0.01 });
      }
      B.col(-1.55, RF, -2.46, 1.55, RF + 0.48, -1.5);
      // kayak on a low roof rack along the east edge
      for (const z of [-0.8, 1.1]) {
        B.box('metal', C.steelDk, 0.44, 0.04, 0.06, 1.33, RF + 0.3, z, { r: 0.012 });
        for (const x of [1.16, 1.5]) B.box('metal', C.steelDk, 0.04, 0.3, 0.04, x, RF + 0.15, z, { r: 0.01 });
        B.box('rubber', C.black, 0.12, 0.03, 0.08, 1.33, RF + 0.335, z, { r: 0.01 });
      }
      kayakMesh(B, 1.33, RF + 0.36, 0.15, 3.1, 0.58, 0.3, C.coral, 0);
      B.col(1.1, RF, -1.45, 1.58, RF + 0.62, 1.75);
      // deck chair + furled parasol on the west edge (facing the sunset over the Long Pier)
      { const n = B.cols.length; B.push(-1.0, RF, -0.55, -HP + 0.25); D.deckchair.build(B, { color: 'teal', variant: 0 }); B.pop(); B.cols.length = n; }
      B.cyl('metal', C.steelDk, 0.16, 0.06, -1.3, RF + 0.03, 0.35, { seg: 14, bevel: 0.02 });
      B.lathe('foliage', mixc(C.coral, C.white, 0.2), [[0.014, 0.95], [0.045, 1.08], [0.07, 1.34], [0.066, 1.56], [0.045, 1.78], [0.016, 1.92]], -1.3, RF, 0.35, { seg: 10 });
      for (let k = 0; k < 5; k++) B.lathe('foliage', shade(C.coral, 0.82), [[0.02, 1.0 + k * 0.18], [0.068, 1.12 + k * 0.17]], -1.3, RF, 0.35, { seg: 10, ry: k * 0.9 });   // fabric folds
      B.cyl('paint', C.white, 0.072, 0.035, -1.3, RF + 1.45, 0.35, { seg: 10 });                           // tie strap
      B.cyl('wood', C.teak, 0.022, 0.95, -1.3, RF + 0.5, 0.35, { seg: 8 });
      B.sph('wood', C.teakDk, 0.03, -1.3, RF + 1.97, 0.35, { ws: 8, hs: 6 });
      // festoon lights along both long edges between corner posts
      for (const s of [-1, 1]) {
        for (const z of [CZ0 + 0.08, CZ1 - 0.08]) {
          B.cyl('metal', C.black, 0.025, 1.45, s * (CX - 0.06), RF + 0.72, z, { seg: 8 });
          B.sph('metal', C.black, 0.035, s * (CX - 0.06), RF + 1.45, z, { ws: 8, hs: 6 });
        }
        const a = [s * (CX - 0.06), RF + 1.4, CZ0 + 0.08], b = [s * (CX - 0.06), RF + 1.4, CZ1 - 0.08];
        B.tube(ns(B, 'rubber'), C.black, ropePts(a, b, 0.32, 16), 0.006, { radial: 4 });
        const lp2 = ropePts(a, b, 0.32, 40);
        for (let k = 1; k < 10; k++) {
          const p = lp2[k * 4];
          cy(B, 'rubber', C.black, 0.01, 0.04, p[0], p[1] - 0.025, p[2], { seg: 5 });
          B.sph('glow', k % 3 === 1 ? '#ffd9a8' : '#fff0c9', 0.03, p[0], p[1] - 0.07, p[2], { ws: 6, hs: 4, glow: 2.6, sy: 1.25 });
        }
      }
    },
  };

  // ================================================================================================ marina prop types
  // Moored boats sit with their waterline at the prop's y (place at y -1.6), bow toward local +Z. Non-colliding.
  const boatType = (desc, fn) => ({ desc, params: { length: 'm', color: 'hull', accent: 'stripe / canvas', name: 'transom name', fenderSide: '±1', col: "true: hull + deckhouse colliders (a berth in the arena), 'roof': off limits", far: 'yachts out of the arena: no rails, lifelines or fenders' }, variants: 1, mount: 'ground', build(B, o) { B.aoBase = null; noShadow(B, () => fn(B, o)); } });
  D.yacht_sail = boatType('Masthead cruising yacht: lofted hull with antifouling, boot + cove stripes, teak toe rails, coachroof with ports, cockpit (wheel or tiller), spray dodger, mast with spreaders + standing rigging, boom with stack-pack cover and lazy jacks, furled genoa, pulpits + lifelines, fenders, ensign, transom name.', sailboat);
  D.yacht_motor = boatType('Motor cruiser: hard-chine hull with window band, swim platform, saloon with raked glazing, flybridge with helm seats + bimini, radar arch, bow rail + anchor, fenders, ensign, transom name.', motorYacht);
  D.boat_fishing = boatType('Inshore fishing boat: high-bowed hull with bulwark stripe, tyre fenders, forward wheelhouse with mast, radar + lights, outrigger booms, A-frame gantry, net drum, fish boxes and marker buoys.', fishingBoat);
  D.boat_rib = boatType('RIB tender: GRP deep-V hull inside a grey Hypalon tube with grab line, console + windscreen, jockey seat, outboard.', ribBoat);

  D.marina_pontoon = {
    desc: 'Floating marina pontoon along local +X (deck 0.45 m above the sea): plank units with joint plates, fascia + rubbing strip, float drums, cleats; optional guide piles, service pedestals, dock boxes, life ring posts. Non-colliding scenery (outside the arena).',
    params: { length: 'm', width: 'm (2)', piles: '[s] pile positions on the +Z edge (or {s, side})', pedestals: '[s]', boxes: '[s]', rings: '[s]', kayaks: 's of a kayak rack' },
    variants: 1, mount: 'ground',
    build(B, o) {
      noShadow(B, () => {
      B.aoBase = null;
      const L = o.length ?? 8, W = o.width ?? 2.0, top = SEA + 0.45;
      pontoonRun(B, L, W, o);
      for (const p of o.piles || []) { const s = typeof p === 'number' ? p : p.s, side = typeof p === 'number' ? 1 : p.side; guidePile(B, s, side * (W / 2 + 0.24), p.h ?? 3.2); }
      for (const sx of o.pedestals || []) {                                               // shore-power / water pedestal
        const z = -W / 2 + 0.25;
        B.box('gloss', C.white, 0.26, 0.9, 0.22, sx, top + 0.45, z, { r: 0.05 });
        B.box('gloss', C.navy, 0.28, 0.12, 0.24, sx, top + 0.84, z, { r: 0.04 });
        B.box('glow', '#ffe9b8', 0.2, 0.04, 0.2, sx, top + 0.93, z, { glow: 1.8, r: 0.01 });
        bx(B, 'paint', C.teal, 0.2, 0.08, 0.01, sx, top + 0.62, z + 0.115);
        B.tube('rubber', '#3a6fb0', [P3(sx + 0.08, top + 0.5, z + 0.1), P3(sx + 0.3, top + 0.2, z + 0.3), P3(sx + 0.6, top + 0.03, z + 0.4)], 0.014, { radial: 4 });
      }
      for (const sx of o.boxes || []) {                                                  // white GRP dock box
        const z = W / 2 - 0.45;
        B.box('gloss', '#f1eee6', 1.3, 0.6, 0.6, sx, top + 0.3, z, { round: true, r: 0.06 });
        B.box('gloss', '#e6e1d6', 1.34, 0.08, 0.64, sx, top + 0.62, z, { round: true, r: 0.03 });
        bx(B, 'metal', C.galv, 0.1, 0.1, 0.02, sx, top + 0.52, z - 0.31);
      }
      for (const sx of o.rings || []) {                                                  // life ring on a post
        const z = W / 2 - 0.15;
        cy(B, 'gloss', C.white, 0.04, 1.4, sx, top + 0.7, z, { seg: 8 });
        ringBuoy(B, sx, top + 1.05, z - 0.08, 0.75);
        bx(B, 'gloss', '#c8473d', 0.36, 0.06, 0.14, sx, top + 1.45, z - 0.04);
      }
      if (o.kayaks != null) {                                                            // kayak rack with three kayaks
        const sx = o.kayaks, z = 0;
        for (const dx of [-1.1, 1.1]) for (const dz of [-0.45, 0.45]) cy(B, 'metal', C.galv, 0.03, 1.2, sx + dx, top + 0.6, z + dz, { seg: 6 });
        for (let k = 0; k < 3; k++) {
          for (const dx of [-1.1, 1.1]) bx(B, 'metal', C.galv, 0.05, 0.05, 1.0, sx + dx, top + 0.3 + k * 0.4, z);
          kayakMesh(B, sx, top + 0.33 + k * 0.4, z + (k - 1) * 0.08, 3.4, 0.58, 0.3, [C.coral, C.mustard, C.teal][k], HP);
        }
      }
      });
    },
  };

  // Marina gate: aluminium gangway from the quay edge (local x = 0, y = 0) down to a pontoon at local x = run, y = -1.15,
  // handrails, a locked mesh gate with a "BERTH HOLDERS ONLY" sign at the top (so it never reads as a way out).
  D.marina_gate = {
    desc: 'Marina access: hinged aluminium gangway with handrails from the quay edge down to the marina pontoon, locked security gate + sign at the top. Outside the play bounds; only the gate collides (rail).',
    params: { run: 'm (3.4)', width: 'm (1.3)' }, variants: 1, mount: 'ground',
    build(B, o) {
      noShadow(B, () => {
      B.aoBase = null;
      const run = o.run ?? 3.4, W = o.width ?? 1.3, drop = 1.15, ang = Math.atan2(drop, run), Lr = Math.hypot(run, drop);
      B.push(0.02, 0, 0, 0, 0, -ang);
      bx(B, 'metal', '#b7bec4', Lr - 0.1, 0.06, W, Lr / 2, -0.03, 0);
      for (let k = 0; k < 14; k++) bx(B, 'metal', '#9aa2a9', 0.04, 0.02, W - 0.1, 0.2 + k * ((Lr - 0.4) / 13), 0.005, 0);
      for (const zs of [-1, 1]) {
        bx(B, 'metal', '#b7bec4', Lr, 0.18, 0.05, Lr / 2, 0.06, zs * W / 2);
        for (let k = 0; k <= 4; k++) cy(B, 'metal', '#c9ced3', 0.02, 0.95, 0.1 + k * (Lr - 0.2) / 4, 0.5, zs * W / 2, { seg: 6 });
        B.tube('metal', '#c9ced3', [P3(0.1, 0.98, zs * W / 2), P3(Lr - 0.1, 0.98, zs * W / 2)], 0.025, { radial: 6 });
        B.tube('metal', '#c9ced3', [P3(0.1, 0.52, zs * W / 2), P3(Lr - 0.1, 0.52, zs * W / 2)], 0.014, { radial: 4 });
      }
      for (const zs of [-1, 1]) cy(B, 'rubber', C.black, 0.08, 0.1, Lr - 0.1, -0.08, zs * (W / 2 - 0.2), { rx: HP, seg: 10 });   // rollers
      B.pop();
      // gate frame at the top of the gangway
      for (const zs of [-1, 1]) B.box('metal', '#8b949c', 0.1, 2.1, 0.1, 0.32, 1.05, zs * (W / 2 + 0.08), { r: 0.02 });
      B.box('metal', '#8b949c', 0.1, 0.1, W + 0.26, 0.32, 2.1, 0, { r: 0.02 });
      B.add('fence', cached('gateMesh', () => new THREE.PlaneGeometry(W - 0.08, 1.7)), C.galv, 0.32, 1.0, 0, { ry: HP, uvs: [(W - 0.08) / 0.07, 1.7 / 0.07] });
      B.tube('metal', '#8b949c', [P3(0.32, 0.15, -W / 2 + 0.04), P3(0.32, 1.86, -W / 2 + 0.04), P3(0.32, 1.86, W / 2 - 0.04), P3(0.32, 0.15, W / 2 - 0.04), P3(0.32, 0.15, -W / 2 + 0.04)], 0.025, { radial: 5 });
      B.box('metal', C.black, 0.08, 0.16, 0.1, 0.36, 1.05, W / 2 - 0.12, { r: 0.02 });                   // lock box
      B.box('gloss', C.navy, 0.04, 0.46, 1.2, 0.26, 2.42, 0, { round: true, r: 0.03 });
      B.push(0.235, 0, 0, -HP); text(B, 'HALYARD MARINA', 0.1, C.white, 0, 2.47, 0.001, { weight: 0.2, depth: 0.004 }); text(B, 'BERTH HOLDERS ONLY', 0.06, C.mustard, 0, 2.3, 0.001, { weight: 0.22, depth: 0.004 }); B.pop();
      });
      // the locked gate is a rail collider (a kid on the quay can't walk through it; shots / ink / squids pass)
      const Wg = (o.width ?? 1.3) / 2 + 0.13;
      B.col(0.27, 0, -Wg, 0.37, 2.15, Wg, { rail: true });
    },
  };

  // ================================================================================================ DINGHY ON TRAILER
  // Cover piece (collider 3.0 × 3.8 × 1.5, base y 0): a grey-tubed RIB tender on a galvanised road trailer, drawbar +Z.
  D.dinghy_trailer = {
    desc: 'Dinghy on its road trailer (cover, collider 3.0 × 3.8 × 1.5): galvanised A-frame trailer with bunks, mudguards, wheels, jockey wheel, winch post + strap, light board; a RIB tender with grey tubes, grab lines, console and a tilted-up outboard.',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      const g = '#aeb5bb', gDk = '#7d858c';
      // trailer chassis
      for (const s of [-1, 1]) {
        bx(B, 'metal', g, 0.08, 0.1, 3.0, s * 0.62, 0.36, -0.35);
        B.tube('metal', g, [P3(s * 0.62, 0.36, 1.15), P3(s * 0.06, 0.38, 1.82)], 0.045, { radial: 6 });
        B.box('wood', '#6b5a48', 0.14, 0.08, 2.4, s * 0.45, 0.47, -0.45, { r: 0.02 });                     // carpeted bunks
        cy(B, 'metal', gDk, 0.035, 0.12, s * 0.45, 0.41, 0.35, { seg: 6 });
        cy(B, 'metal', gDk, 0.035, 0.12, s * 0.45, 0.41, -1.3, { seg: 6 });
        B.cyl('rubber', C.black, 0.3, 0.2, s * 1.18, 0.3, -0.45, { rz: HP, seg: 16, bevel: 0.05 });        // wheels
        B.cyl('metal', '#c9ced3', 0.17, 0.21, s * 1.18, 0.3, -0.45, { rz: HP, seg: 12 });
        cy(B, 'metal', gDk, 0.05, 0.22, s * 1.25, 0.3, -0.45, { rz: HP, seg: 6 });
        const guard = []; for (let k = 0; k <= 8; k++) { const a = PI * (k / 8); guard.push(P3(s * 1.18, 0.3 + Math.sin(a) * 0.42, -0.45 + Math.cos(a) * 0.42)); }
        B.tube('metal', g, guard, 0.03, { radial: 5 });
        bx(B, 'metal', g, 0.26, 0.02, 0.85, s * 1.18, 0.73, -0.45);
        bx(B, 'metal', g, 0.56, 0.06, 0.06, s * 0.9, 0.36, -0.45);
        bx(B, 'metal', '#c9473d', 0.16, 0.08, 0.04, s * 0.72, 0.42, -1.86);                                // tail lights
      }
      cy(B, 'metal', gDk, 0.04, 2.5, 0, 0.3, -0.45, { rz: HP, seg: 8 });                                   // axle
      bx(B, 'metal', g, 1.3, 0.08, 0.08, 0, 0.36, 1.15); bx(B, 'metal', g, 1.3, 0.08, 0.08, 0, 0.36, -1.84);
      bx(B, 'paint', '#f1eee6', 0.5, 0.12, 0.012, 0, 0.42, -1.885);                                        // number plate
      text(B, 'KL 204', 0.07, C.navy, 0, 0.39, -1.892, { ry: PI, weight: 0.2, depth: 0.003 });
      B.box('metal', gDk, 0.14, 0.1, 0.24, 0, 0.4, 1.84, { r: 0.03 });                                   // hitch coupler
      cy(B, 'metal', g, 0.035, 0.5, 0.22, 0.38, 1.5, { seg: 8 });                                         // jockey wheel
      B.cyl('rubber', C.black, 0.09, 0.06, 0.22, 0.09, 1.5, { rz: HP, seg: 12 });
      bx(B, 'metal', g, 0.08, 0.7, 0.08, 0, 0.72, 1.15);                                                   // winch post + strap
      B.box('metal', C.steelDk, 0.18, 0.14, 0.14, 0, 0.98, 1.2, { r: 0.03 });
      B.tube('paint', '#3a6fb0', [P3(0, 0.98, 1.1), P3(0, 0.86, 1.03)], 0.012, { radial: 3 });
      // the RIB, sitting on the bunks (hull keel at y ≈ 0.5), outboard tilted up over the light board
      B.push(0, 0.78, 0.12);
      ribBoat(B, { length: 3.9, color: '#5d6470', tilt: 1.25, console: false, motorScale: 0.95 });
      B.pop();
      B.col(-1.5, 0, -1.9, 1.5, 1.5, 1.9);
      B.blob(3.2, 4.2);
    },
  };

  // ================================================================================================ TOWER COMMAND FLOATS + BOATS
  // Tower Command only (placements onlyIn 'tower'): the user's FLOAT / BOAT notes. The playable surfaces are level blocks
  // (maps.js, tag 'float' / 'workboat-*' / 'waterbus-*'): decks inkable, hull sides never. Everything here dresses them
  // from outside the walking surfaces (nothing on a deck the track crosses; colliders only where listed).

  // ---- floating dock section (in the arena; the user's FLOAT notes): dresses one section block of a modular floating
  // dock (maps.js floats(): a 0.4 m deck frame, top y 0 = the pier decks, so the track stays flat), placed at the section's
  // top centre. Local frame: x ±w/2, z ±d/2. sides: { '+x' | '-x' | '+z' | '-z': [[kind, a, b], …] } — a…b the stretch
  // along that side (local), kind 'w' open water · 'j' a join to the next section (5 cm) · 's' a seam to a fixed pier /
  // boat (15 cm) · 'b' a seam to a moored boat (fenders hung). Every side gets the galvanised frame channel; open water
  // gets a black rubber rub rail, corner bumpers and deck-edge cleats; joins get connector plates across the gap. Under
  // the frame: stringers and the grey float tubs it rides on (showing above the waterline, a weed line on each). piles:
  // [[x, z]] steel guide piles standing off a water side, each with a pile hoop (collar, rollers, arms bolted to the
  // frame). Non-colliding.
  D.floatdeck = {
    desc: 'Modular floating-dock section dressing (Tower Command): galvanised frame channel round a composite-deck section, black rubber rub rails, corner bumpers and deck-edge cleats on open water, connector plates across the joins to the next section, stringers and grey poly float tubs at the waterline, guide piles with pile hoops, hung fenders toward moored boats. Non-colliding.',
    params: { w: 'section x size', d: 'section z size', y0: 'frame bottom (-0.4)', sea: 'sea level, prop-local (-1.6: a deck at pier level)', lite: 'no bolt heads', sides: "{ side: [[kind 'w'|'j'|'s'|'b', a, b]] }", piles: '[[x, z]]' },
    variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const w = o.w ?? 3, d = o.d ?? 3, y0 = o.y0 ?? -0.4, hw = w / 2, hd = d / 2, fh = -y0, SEA = o.sea ?? -1.6;   // (a lower deck: the visitor pontoons)
      const galv = C.galv, galvDk = shade(C.galv, 0.72), rub = '#1d2025', tub = '#8d949a', tubDk = shade('#8d949a', 0.8);
      // side frame: n = outward normal, u runs along the side (local x for ±z sides, local z for ±x sides)
      const SIDE = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
      const at = (sd, u, out) => { const [nx, nz] = SIDE[sd]; return nx ? [nx * (hw + out), u] : [u, nz * (hd + out)]; };
      const run = (sd, a, b, out, y, hgt, thick, mat, c, o2) => {     // a box along a side stretch
        const [nx] = SIDE[sd], m = (a + b) / 2, [x, z] = at(sd, m, out);
        if (nx) B.box(mat, c, thick, hgt, b - a, x, y, z, o2 || { r: 0.012 }); else B.box(mat, c, b - a, hgt, thick, x, y, z, o2 || { r: 0.012 });
      };
      const sides = o.sides || {};
      const kindAt = (sd, u) => { for (const [k, a, b] of sides[sd] || []) if (u >= a - 1e-3 && u <= b + 1e-3) return k; return 'w'; };
      const corner = (sx, sz) => kindAt(sx > 0 ? '+x' : '-x', sz * hd) === 'w' && kindAt(sz > 0 ? '+z' : '-z', sx * hw) === 'w';
      for (const sd of Object.keys(SIDE)) {
        const L = SIDE[sd][0] ? hd : hw;
        for (const [k, a0, b0] of sides[sd] || [['w', -L, L]]) {
          const a = Math.max(-L, a0), b = Math.min(L, b0);
          if (b - a < 0.05) continue;
          // the frame channel: a galvanised C-section standing 2 cm off the section's side, lip over the deck edge band
          run(sd, a, b, 0.02, y0 / 2 - 0.01, fh + 0.02, 0.035, 'metal', galv);
          noShadow(B, () => {
            run(sd, a + 0.01, b - 0.01, 0.042, -0.02, 0.035, 0.012, 'metal', shade(galv, 1.1));
            run(sd, a + 0.01, b - 0.01, 0.042, y0 + 0.02, 0.035, 0.012, 'metal', galvDk);
            // bolt heads along the channel every 0.6 m (lite: none — the visitor pontoons, low by the water)
            if (!o.lite) for (let u = a + 0.3; u < b - 0.15; u += 0.6) { const [x, z] = at(sd, u, 0.045); B.cyl('metal', galvDk, 0.018, 0.012, x, y0 / 2, z, SIDE[sd][0] ? { rz: HP, seg: 6 } : { rx: HP, seg: 6 }); }
          });
          if (k === 'w') {
            // black rubber rub rail (D-section) along the channel, broken 12 cm short of each end: the joins read
            run(sd, a + 0.12, b - 0.12, 0.08, -0.17, 0.12, 0.08, 'rubber', rub, { round: true, r: 0.035 });
            // horn cleats on the deck edge (flush fittings, 7 cm) every other 2.2 m bay
            const n = Math.max(1, Math.round((b - a) / 2.2));
            for (let i = 0; i < n; i += 2) {
              const u = a + ((b - a) * (i + 0.5)) / n, [x, z] = at(sd, u, -0.13);
              B.push(x, 0, z, SIDE[sd][0] ? 0 : HP);
              bx(B, 'metal', galv, 0.06, 0.035, 0.12, 0, 0.017, 0);
              B.box('metal', galv, 0.045, 0.03, 0.32, 0, 0.052, 0, { r: 0.012 });
              B.pop();
            }
          }
          if (k === 'j') {
            // connector plates across the 5 cm join (this section's half; the neighbour draws the other): a galvanised
            // plate over the deck edge with two bolts, and the steel pin block under the frame
            for (const u of b - a > 1.2 ? [a + 0.35, b - 0.35] : [(a + b) / 2]) {
              const [x, z] = at(sd, u, -0.035), sx = SIDE[sd][0] ? 0.1 : 0.18, sz = SIDE[sd][0] ? 0.18 : 0.1;
              B.box('metal', galvDk, sx, 0.012, sz, x + SIDE[sd][0] * 0.02, 0.006, z + SIDE[sd][1] * 0.02, { r: 0.004 });
              noShadow(B, () => { for (const q of [-0.05, 0.05]) { const [bx2, bz2] = SIDE[sd][0] ? [x - SIDE[sd][0] * 0.01, z + q] : [x + q, z - SIDE[sd][1] * 0.01]; B.cyl('metal', galv, 0.014, 0.01, bx2, 0.014, bz2, { seg: 6 }); } });
              const [px, pz] = at(sd, u, 0.02);
              B.box('metal', galvDk, SIDE[sd][0] ? 0.06 : 0.14, 0.2, SIDE[sd][0] ? 0.14 : 0.06, px, y0 + 0.12, pz, { r: 0.012 });
            }
          }
          if (k === 'b') {
            // hung cylinder fenders toward the moored boat
            const n = Math.max(1, Math.round((b - a) / 1.7));
            for (let i = 0; i < n; i++) {
              const u = a + ((b - a) * (i + 0.5)) / n, [x, z] = at(sd, u, 0.14), [xa, za] = at(sd, u, -0.1);
              B.lathe('gloss', C.navy, [[0, -0.34], [0.07, -0.33], [0.11, -0.28], [0.12, -0.18], [0.12, 0.18], [0.11, 0.28], [0.07, 0.33], [0, 0.34]], x, -0.62, z, { seg: 12 });
              for (const q of [-1, 1]) B.tor('gloss', C.white, 0.022, 0.008, x, -0.62 + q * 0.36, z, { rs: 3, ts: 7 });
              B.tube(ns(B, 'rubber'), C.rope, [P3(x, -0.26, z), P3((x + xa) / 2, 0.04, (z + za) / 2), P3(xa, 0.01, za)], 0.012, { radial: 4 });
            }
          }
        }
      }
      // corner bumpers (vertical rubber caps) where two open-water sides meet
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) if (corner(sx, sz)) {
        B.box('rubber', rub, 0.16, fh + 0.02, 0.16, sx * (hw + 0.04), y0 / 2, sz * (hd + 0.04), { round: true, r: 0.05 });
      }
      // under the frame: two stringers along the long axis, and the float tubs (rounded poly pontoon tubs, a grid inset
      // from the edges) from below the waterline up to the stringers, each with moulded ribs and a weed line
      const alongX = w >= d, Ls = alongX ? w : d, Ws = alongX ? d : w;
      noShadow(B, () => {
        for (const q of [-0.3, 0.3]) { const off = q * Ws; if (alongX) bx(B, 'metal', galvDk, Ls - 0.1, 0.16, 0.1, 0, y0 - 0.08, off); else bx(B, 'metal', galvDk, 0.1, 0.16, Ls - 0.1, off, y0 - 0.08, 0); }
        const nx = Math.max(1, Math.round((w - 0.2) / 1.45)), nz = Math.max(1, Math.round((d - 0.2) / 1.45));
        const tw = (w - 0.2) / nx - 0.22, td = (d - 0.2) / nz - 0.22, ty1 = y0 - 0.16, ty0 = SEA - 0.45;
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          const x = -hw + 0.1 + ((w - 0.2) * (i + 0.5)) / nx, z = -hd + 0.1 + ((d - 0.2) * (j + 0.5)) / nz;
          B.box('gloss', mixc(tub, tubDk, ((i * 3 + j * 5) % 4) * 0.12), tw, ty1 - ty0, td, x, (ty0 + ty1) / 2, z, { round: true, r: 0.12 });
          for (const ry of [ty1 - 0.28, SEA + 0.35]) bx(B, 'gloss', tubDk, tw + 0.03, 0.05, td + 0.03, x, ry, z);
          bx(B, 'paint', '#34402f', tw + 0.012, 0.13, td + 0.012, x, SEA + 0.02, z);
        }
      });
      // guide piles standing off a water side: galvanised tube, white conical cap + a lamp, weed line, and the pile hoop —
      // a collar round the pile with rubber rollers, two arms bolted to the frame channel
      for (const [x, z] of o.piles || []) {
        B.cyl('metal', '#737a80', 0.17, 4.4, x, SEA + 1.7, z, { seg: 12 });
        B.lathe('gloss', C.white, [[0, 0], [0.2, 0], [0.2, 0.07], [0.04, 0.36], [0, 0.37]], x, SEA + 3.9, z, { seg: 12 });
        B.cyl('paint', '#2d3a2f', 0.174, 0.45, x, SEA + 0.05, z, { seg: 12, open: true });
        B.blink('#ffcf73', x, SEA + 4.32, z, { size: 0.05, rate: 0.35, lo: 0.4, hi: 2.4 });
        B.tor('metal', galv, 0.27, 0.035, x, -0.2, z, { rx: HP, rs: 5, ts: 16 });
        for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + PI / 4; B.cyl('rubber', rub, 0.05, 0.14, x + Math.cos(a) * 0.23, -0.2, z + Math.sin(a) * 0.23, { seg: 8 }); }
        // arms to the nearest side of the section
        const dx = Math.abs(x) - hw, dz = Math.abs(z) - hd, toX = dx > dz;
        const ex = toX ? Math.sign(x) * (hw + 0.04) : x, ez = toX ? z : Math.sign(z) * (hd + 0.04);
        for (const q of [-0.2, 0.2]) {
          const ax = toX ? x - Math.sign(x) * 0.25 : x + q, az = toX ? z + q : z - Math.sign(z) * 0.25;
          const bx3 = toX ? ex : ex + q * 1.5, bz3 = toX ? ez + q * 1.5 : ez;
          B.tube('metal', galv, [P3(ax, -0.2, az), P3(bx3, -0.2, bz3)], 0.035, { radial: 6 });
          B.box('metal', galvDk, toX ? 0.04 : 0.2, 0.2, toX ? 0.2 : 0.04, bx3, -0.2, bz3, { r: 0.01 });
        }
      }
    },
  };

  // ---- workboat LIMPET (Tower Command: "BOAT / BACK OF BOAT"): dresses the workboat-hull / -deck / -wheelhouse blocks,
  // placed at the hull centre on the waterline plane (y 0 = pier deck level). Local: beam x ±2.5, stern at z -4.5, bow at
  // z +4.5; deck plate top y 1.2; wheelhouse x ±1.1, z 1.0…3.3, roof 3.5. The open aft deck (z -4.5…1.0) is where the
  // track crosses (z -2.8…-0.2 clear of everything, both sides open); stern gantry, net drum + fish boxes at the transom,
  // side rails from the wheelhouse forward (rail colliders), windlass + bitts on the foredeck.
  D.workboat = {
    desc: 'Harbour workboat LIMPET (Tower Command): hull boot-top + sheer stripe + black rubbing strake, raked stem piece, tyre fenders on chains, names; windowed wheelhouse with doors, Kraken stack, mast (lights, radar, horn, searchlight, flag); stern A-frame gantry with a transom rail, net drum and a fish-box stack (colliders); guard rails along the foredeck (rail colliders); windlass + bitts; mooring lines to the fuel dock and the boatyard.',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      B.aoBase = null;
      const HX = 2.5, HZ = 4.5, DK = 1.2, WX = 1.1, WZ0 = 1.0, WZ1 = 3.3, WT = 3.5;
      const hull = '#2f6b62', hullDk = shade(hull, 0.8), yel = C.mustard;
      // --- hull paint: boot-top + white line at the waterline, sheer stripe (mustard) under the deck plate, strake
      noShadow(B, () => {
        for (const s of [-1, 1]) {
          B.box('paint', C.boot, 0.024, 0.44, 2 * HZ + 0.04, s * (HX + 0.012), -1.47, 0, { r: 0.008 });
          B.box('paint', C.white, 0.02, 0.035, 2 * HZ + 0.04, s * (HX + 0.01), -1.232, 0, { r: 0.006 });
          B.box('paint', yel, 0.02, 0.1, 2 * HZ, s * (HX + 0.01), 0.9, 0, { r: 0.006 });
          B.box('paint', C.boot, 2 * HX + 0.04, 0.44, 0.024, 0, -1.47, s * (HZ + 0.012), { r: 0.008 });
          B.box('paint', C.white, 2 * HX + 0.04, 0.035, 0.02, 0, -1.232, s * (HZ + 0.01), { r: 0.006 });
          B.box('paint', yel, 2 * HX, 0.1, 0.02, 0, 0.9, s * (HZ + 0.01), { r: 0.006 });
        }
      });
      for (const s of [-1, 1]) B.box('rubber', '#1c1f26', 0.07, 0.12, 2 * HZ - 0.4, s * (HX + 0.035), 0.55, 0, { round: true, r: 0.03 });
      B.box('rubber', '#1c1f26', 2 * HX - 0.4, 0.12, 0.07, 0, 0.55, -HZ - 0.035, { round: true, r: 0.03 });
      // raked stem on the bow (below the deck, non-colliding): a tapered prism + bow fender
      const stem = cached('wbStem', () => extrudeGeo([[0, HX - 0.05], [0, -HX + 0.05], [0.45, 0]], 2.7, 0.03));
      B.add('gloss', stem, hull, 0, -0.35, HZ - 0.02, { rz: HP });
      B.box('rubber', '#1c1f26', 0.2, 1.2, 0.2, 0, 0.3, HZ + 0.42, { round: true, r: 0.07 });
      // plate seams + weeping on the sides (from the strake down), draft marks at the stern
      noShadow(B, () => {
        for (let z = -HZ + 1.2; z < HZ - 0.4; z += 1.5) for (const s of [-1, 1]) bx(B, 'paint', hullDk, 0.01, 1.5, 0.035, s * (HX + 0.005), -0.35, z);
        for (const [t, y] of [['2', -1.4], ['4', -1.2], ['6', -1.0]]) text(B, t, 0.1, C.white, HX - 0.3, y, -HZ - 0.004, { ry: PI, weight: 0.18, depth: 0.006 });
      });
      // names: both bow quarters + the transom
      for (const s of [-1, 1]) text(B, 'LIMPET', 0.3, C.white, s * (HX + 0.004), 0.15, HZ - 1.6, { ry: s * HP, weight: 0.17 });
      text(B, 'LIMPET', 0.28, C.white, 0, 0.12, -HZ - 0.004, { ry: PI, weight: 0.17 });
      text(B, 'HALYARD', 0.12, C.white, 0, -0.18, -HZ - 0.004, { ry: PI, weight: 0.2, spacing: 0.4 });
      // tyre fenders on chains: forward of the track crossing only (z > 0.6), both sides, and on the transom corners
      for (const s of [-1, 1]) for (const z of [1.3, 2.7, 3.9]) {
        tyre(B, s * (HX + 0.1), 0.25, z, 'x', 0.95);
        chain(B, [s * (HX - 0.05), DK - 0.02, z], [s * (HX + 0.1), 0.55, z], 4, 0.03);
      }
      // --- wheelhouse (block x ±1.1, z 1.0…3.3, 1.2…3.5): windows all round, doors on both sides, roof edge, stack, mast
      const faces = [[0, WZ1, 0, 2 * WX, 'front'], [0, WZ0, PI, 2 * WX, 'back'], [WX, (WZ0 + WZ1) / 2, HP, WZ1 - WZ0, 'side'], [-WX, (WZ0 + WZ1) / 2, -HP, WZ1 - WZ0, 'side']];
      for (const [fx, fz, ry, W, kind] of faces) {
        B.push(fx, DK, fz, ry);
        if (kind === 'front') glazing(B, -W / 2 + 0.15, W / 2 - 0.15, 1.25, 1.95, 3, { frame: C.white });
        else if (kind === 'back') { glazing(B, 0.2, W / 2 - 0.15, 1.3, 1.9, 1, { frame: C.white }); shipDoor(B, -0.45, 0.7, 1.9, C.whiteDk, 1); }
        else { glazing(B, -W / 2 + 0.2, 0.35, 1.3, 1.95, 2, { frame: C.white }); shipDoor(B, 0.72, 0.66, 1.9, C.whiteDk, -1); }
        B.box('gloss', C.white, W + 0.16, 0.06, 0.1, 0, WT - DK - 0.02, 0.05, { r: 0.02 });                       // roof visor
        B.box('paint', yel, W - 0.02, 0.12, 0.012, 0, WT - DK - 0.16, 0.006, { r: 0.004 });                         // mustard band
        B.pop();
      }
      text(B, 'LIMPET', 0.16, C.navy, 0, DK + 2.1, WZ1 + 0.008, { weight: 0.19, depth: 0.006 });
      // Kraken stack at the wheelhouse's aft end (roof: off-limits anyway)
      B.add('gloss', fleetFunnelGeo(0.42, 0.3, 0.16, 1.1, 'wb'), 'white', 0, WT, WZ0 + 0.55, {});
      // mast on the forward roof: masthead + steaming lights, radar, horn, searchlight, a Kraken pennant
      B.cyl('metal', C.white, 0.05, 2.0, 0, WT + 1.0, WZ1 - 0.6, { seg: 10 });
      B.box('metal', C.white, 1.1, 0.06, 0.08, 0, WT + 1.35, WZ1 - 0.6, { r: 0.02 });
      radar(B, 0, WT + 1.42, WZ1 - 0.6, 0.9, 1.2);
      for (const [lx, lc] of [[-0.5, C.red], [0.5, C.green]]) { B.box('paint', C.black, 0.12, 0.14, 0.12, lx, WT + 1.28, WZ1 - 0.6, { r: 0.02 }); B.blink(lc, lx, WT + 1.28, WZ1 - 0.53, { size: 0.04, rate: 0.12, lo: 2.0, hi: 2.4 }); }
      B.blink('#fff1d0', 0, WT + 2.02, WZ1 - 0.6, { size: 0.05, rate: 0.1, lo: 2.2, hi: 2.6 });
      B.cyl('metal', C.steelDk, 0.09, 0.16, 0.45, WT + 0.12, WZ1 - 0.25, { rx: HP, seg: 12 });                     // searchlight
      B.cyl('glow', '#fff4d6', 0.075, 0.01, 0.45, WT + 0.12, WZ1 - 0.16, { rx: HP, seg: 12, glow: 1.2 });
      B.lathe('metal', C.galv, [[0.02, 0], [0.05, 0.02], [0.09, 0.25]], -0.4, WT + 0.9, WZ1 - 0.6, { seg: 10, rx: HP });   // horn
      B.flag(0, WT + 2.1, WZ1 - 0.6, { color: C.mustard, rz: HP, ry: PI, s: 0.9 });
      B.col(-0.5, WT, WZ0 + 0.3, 0.5, WT + 1.2, WZ0 + 0.8, { roof: true });                                        // (stack)
      // --- stern: A-frame gantry at the transom corners (legs collide), transom rail between them, net drum + fish boxes
      const gz = -HZ + 0.18, gy = DK + 3.0;
      for (const s of [-1, 1]) {
        B.box('gloss', yel, 0.22, 3.0, 0.22, s * (HX - 0.2), DK + 1.5, gz, { r: 0.04 });
        B.box('metal', C.steelDk, 0.4, 0.06, 0.4, s * (HX - 0.2), DK + 0.03, gz, { r: 0.015 });
        B.col(s * (HX - 0.2) - 0.12, DK, gz - 0.12, s * (HX - 0.2) + 0.12, DK + 3.0, gz + 0.12);
      }
      B.box('gloss', yel, 2 * HX - 0.18, 0.24, 0.26, 0, gy, gz, { r: 0.04 });
      B.cyl('metal', C.steelDk, 0.07, 0.3, 0, gy - 0.25, gz, { seg: 10 });                                        // sheave block
      B.tube(ns(B, 'rubber'), C.ropeDk, [P3(0, gy - 0.4, gz), P3(0, DK + 0.9, gz - 0.02)], 0.018, { radial: 4 });
      B.box('metal', C.steelDk, 0.12, 0.14, 0.12, 0, DK + 0.85, gz, { r: 0.02 });                                  // hook
      for (const y of [0.55, 1.0]) B.cyl('metal', C.galv, 0.022, 2 * HX - 0.66, 0, DK + y, gz - 0.02, { rz: HP, seg: 8 });
      B.col(-HX + 0.32, DK + 0.06, gz - 0.35, HX - 0.32, DK + 1.05, gz + 0.06, { rail: true });
      // net drum (flanged reel of green net) on stands just inboard of the transom — cover
      const nz = -HZ + 1.05;
      for (const s of [-1, 1]) { B.box('gloss', yel, 0.08, 0.8, 0.45, s * 0.85, DK + 0.4, nz, { r: 0.02 }); B.cyl('gloss', yel, 0.45, 0.05, s * 0.75, DK + 0.6, nz, { rz: HP, seg: 20 }); }
      B.cyl('paint', '#3d6b4b', 0.4, 1.44, 0, DK + 0.6, nz, { rz: HP, seg: 18 });
      noShadow(B, () => { for (let k = 0; k < 6; k++) B.tor('paint', shade('#3d6b4b', 0.8 + (k % 2) * 0.25), 0.405, 0.012, -0.6 + k * 0.24, DK + 0.6, nz, { ry: HP, rs: 3, ts: 18 }); });
      B.col(-0.9, DK, nz - 0.45, 0.9, DK + 1.05, nz + 0.45);
      // fish boxes stacked in the stern corner (-x), a coil of rope and marker buoys
      for (let k = 0; k < 5; k++) {
        const x = -HX + 0.55 + (k % 2) * 0.02, y = DK + Math.floor(k / 1) * 0.2, c = [C.coral, '#3f7fb0', C.coral, C.mustard, '#3f7fb0'][k];
        B.box('gloss', c, 0.72, 0.19, 0.5, x, y + 0.1, -HZ + 1.0 + (k % 2) * 0.03, { round: true, r: 0.03 });
      }
      B.col(-HX + 0.15, DK, -HZ + 0.7, -HX + 0.95, DK + 1.0, -HZ + 1.3);
      B.tor('rubber', C.rope, 0.28, 0.04, HX - 0.55, DK + 0.05, -HZ + 1.0, { rx: HP, rs: 5, ts: 18 });
      B.tor('rubber', C.ropeDk, 0.2, 0.035, HX - 0.55, DK + 0.12, -HZ + 1.0, { rx: HP, rs: 5, ts: 16 });
      for (const [x, c] of [[HX - 0.3, C.coral], [HX - 0.75, C.mustard]]) { B.sph('gloss', c, 0.2, x, DK + 0.2, -HZ + 0.45, { ws: 12, hs: 8 }); B.cyl('metal', C.black, 0.012, 0.9, x, DK + 0.62, -HZ + 0.45, { seg: 5 }); }
      // --- foredeck: guard rails along both sides from the wheelhouse to the bow and round the bow (rail colliders),
      //     windlass + bitts on the centreline
      const railY = DK + 0.95, rz0 = WZ0 - 0.1;
      for (const s of [-1, 1]) {
        const x = s * (HX - 0.08), pts = [];
        for (let z = rz0; z <= HZ - 0.08 + 1e-3; z += (HZ - 0.08 - rz0) / 4) { post(B, 'metal', C.galv, 0.022, 0.95, x, DK + 0.475, z, { seg: 7 }); pts.push(P3(x, railY, z)); }
        pts.push(P3(x * 0.5, railY, HZ - 0.08));
        B.tube('metal', C.galv, pts, 0.026, { radial: 8 });
        B.tube('metal', C.galv, pts.map((p) => P3(p[0], DK + 0.5, p[2])), 0.014, { radial: 6 });
        B.col(s > 0 ? HX + 0.005 : -HX - 0.3, DK + 0.6, rz0, s > 0 ? HX + 0.3 : -HX - 0.005, DK + 1.1, HZ + 0.3, { rail: true });
      }
      post(B, 'metal', C.galv, 0.022, 0.95, 0, DK + 0.475, HZ - 0.08, { seg: 7 });
      B.col(-HX, DK + 0.6, HZ + 0.005, HX, DK + 1.1, HZ + 0.3, { rail: true });
      B.box('gloss', C.steelDk, 0.9, 0.42, 0.5, 0, DK + 0.21, HZ - 0.9, { r: 0.05 });                               // windlass
      B.cyl('gloss', C.black, 0.16, 1.1, 0, DK + 0.32, HZ - 0.9, { rz: HP, seg: 14 });
      B.col(-0.55, DK, HZ - 1.2, 0.55, DK + 0.5, HZ - 0.6);
      for (const s of [-1, 1]) B.lathe('gloss', C.black, [[0, 0], [0.1, 0], [0.1, 0.34], [0.14, 0.37], [0, 0.39]], s * 0.6, DK, HZ - 0.35, { seg: 12 });
      // --- mooring: bow + stern lines from the rail posts to the fuel dock (+x) and boatyard (-x) faces
      for (const s of [-1, 1]) for (const [z0, z1] of [[HZ - 0.5, HZ + 0.8], [-HZ + 0.45, -HZ - 1.2]]) {
        rope(B, [s * (HX - 0.1), DK + 0.3, z0], [s * (HX + 0.3), -0.55, z1], 0.25, 0.022);
      }
      // life ring on the gantry's +x leg (facing forward, over the aft deck)
      B.push(HX - 0.2, DK + 1.6, gz + 0.13); ringBuoy(B, 0, 0, 0, 0.72); B.pop();
    },
  };

  // ---- water-bus PUFFIN (Tower Command: "BOAT WITH 1 WAY DROP"): moored bow-in between the quay (the defenders' side)
  // and checkpoint 2's floating dock. Dresses the waterbus-hull / -saloon / -deck blocks, placed at the hull centre (y 0 =
  // pier deck level) with rotY π/2 on Bravo's half. Local: stern -x (x -3.325: the quay, where the boarding gangway from
  // the quay lands on the top deck), bow +x (x 3.325: over the float, facing the checkpoint), beam z ±2.35; saloon band
  // y 0.5…2.15, open top deck at 2.3. The top deck is railed along both sides and the stern (rail colliders; open at the
  // gangway landing, z ±1.15) and OPEN across the bow: the one-way drop onto the float — a vantage point over the
  // checkpoint (2.3 m up, hull sides never inkable: no way back up from the float). Flat bow with push knees, benches
  // (colliders), a coin-op viewer at the bow corner, mast + flag at the stern corner, life rings; fenders; names.
  D.waterbus = {
    desc: 'Harbour water-bus PUFFIN (Tower Command): navy hull with boot-top, white sheer line + rubbing strakes, a flat bow with rubber push knees; white saloon with a wraparound window band, doors, route boards; open top deck railed along both sides and the stern (rail colliders, open at the gangway landing) and open across the bow (the one-way drop); slatted benches (colliders), a coin-op viewer at the bow corner, mast with light + flag, life rings; fenders, mooring lines; names.',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      B.aoBase = null;
      const HX = 3.325, HZ = 2.35, S0 = 0.5, S1 = 2.15, DK = 2.3, LAND = 1.15;
      const navy = C.navy, coral = C.coral, rubC = '#1c1f26';
      noShadow(B, () => {
        for (const s of [-1, 1]) {
          B.box('paint', C.boot, 2 * HX + 0.04, 0.44, 0.024, 0, -1.47, s * (HZ + 0.012), { r: 0.008 });
          B.box('paint', C.white, 2 * HX + 0.04, 0.035, 0.02, 0, -1.232, s * (HZ + 0.01), { r: 0.006 });
          B.box('paint', C.boot, 0.024, 0.44, 2 * HZ + 0.04, s * (HX + 0.012), -1.47, 0, { r: 0.008 });
          B.box('paint', C.white, 0.02, 0.035, 2 * HZ + 0.04, s * (HX + 0.01), -1.232, 0, { r: 0.006 });
          B.box('paint', coral, 2 * HX, 0.1, 0.02, 0, S0 - 0.12, s * (HZ + 0.01), { r: 0.006 });                     // coral sheer stripe
          B.box('paint', coral, 0.02, 0.1, 2 * HZ, s * (HX + 0.01), S0 - 0.12, 0, { r: 0.006 });
          B.box('paint', navy, 2 * HX, 0.08, 0.02, 0, S1 - 0.05, s * (HZ + 0.01), { r: 0.006 });                     // roof band
          B.box('paint', navy, 0.02, 0.08, 2 * HZ, s * (HX + 0.01), S1 - 0.05, 0, { r: 0.006 });
        }
        // plate seams down the hull sides
        for (let x = -HX + 1.1; x < HX - 0.5; x += 1.4) for (const s of [-1, 1]) bx(B, 'paint', C.hullDk, 0.035, 1.9, 0.01, x, -0.8, s * (HZ + 0.005));
      });
      // rubbing strakes all round (black), heavier across the flat bow
      for (const s of [-1, 1]) B.box('rubber', rubC, 2 * HX - 0.3, 0.12, 0.07, 0, S0 + 0.02, s * (HZ + 0.035), { round: true, r: 0.03 });
      B.box('rubber', rubC, 0.07, 0.12, 2 * HZ - 0.3, -HX - 0.035, S0 + 0.02, 0, { round: true, r: 0.03 });
      B.box('rubber', rubC, 0.12, 0.2, 2 * HZ - 0.2, HX + 0.06, S0 - 0.02, 0, { round: true, r: 0.05 });
      // push knees on the flat bow: rubber-faced uprights from the waterline to the sheer (she noses up to floats)
      for (const z of [-1.3, 1.3]) {
        B.box('gloss', navy, 0.16, 1.9, 0.3, HX + 0.08, -0.6, z, { r: 0.04 });
        B.box('rubber', rubC, 0.12, 1.8, 0.26, HX + 0.2, -0.6, z, { round: true, r: 0.05 });
      }
      // saloon window band on both long sides + the bow, doors at the stern corners, route boards
      for (const s of [-1, 1]) {
        B.push(0, 0, s * HZ, s > 0 ? 0 : PI);                                   // (local +x = kit +x on +z, -x on -z)
        const g0 = s > 0 ? -HX + 1.35 : -HX + 0.35, g1 = s > 0 ? HX - 0.35 : HX - 1.35;
        glazing(B, g0, g1, S0 + 0.4, S1 - 0.42, 6, { frame: C.white });
        shipDoor(B, s * (-HX + 0.62), 0.74, 1.5, C.whiteDk, -1);
        B.box('gloss', navy, 1.9, 0.2, 0.04, s * 0.4, S1 - 0.2, 0.02, { round: true, r: 0.03 });
        text(B, 'WATER BUS', 0.11, C.white, s * 0.4, S1 - 0.25, 0.045, { weight: 0.2, spacing: 0.3 });
        B.pop();
        text(B, 'PUFFIN', 0.32, C.white, HX - 1.3, -0.15, s * (HZ + 0.004), { ry: s > 0 ? 0 : PI, weight: 0.17 });
        text(B, 'HALYARD MARINA', 0.11, C.white, HX - 1.3, -0.42, s * (HZ + 0.004), { ry: s > 0 ? 0 : PI, weight: 0.2, spacing: 0.3 });
      }
      // the bow: raked window band under a sun visor, red / green sidelights on the saloon's front corners, an anchor in
      // its hawse and a navy bow panel with the name
      B.push(HX, 0, 0, HP);
      glazing(B, -HZ + 0.35, HZ - 0.35, S0 + 0.4, S1 - 0.42, 3, { frame: C.white });
      B.box('gloss', C.white, 2 * HZ - 0.3, 0.06, 0.34, 0, S1 - 0.3, 0.17, { rx: 0.22, r: 0.02 });
      for (const [x, lc] of [[-HZ + 0.12, C.green], [HZ - 0.12, C.red]]) {   // (kit -x side → starboard, green)
        B.box('paint', C.black, 0.16, 0.2, 0.12, x, S1 - 0.18, 0.06, { r: 0.02 });
        B.blink(lc, x, S1 - 0.18, 0.13, { size: 0.04, rate: 0.12, lo: 2.0, hi: 2.4 });
      }
      B.box('paint', C.hullDk, 0.55, 0.36, 0.02, 0.9, -0.2, 0.01, { round: true, r: 0.12 });
      B.box('metal', C.black, 0.12, 0.5, 0.05, 0.9, -0.42, 0.04, { r: 0.02 });
      B.box('metal', C.black, 0.42, 0.07, 0.05, 0.9, -0.66, 0.04, { rz: 0.0, r: 0.02 });
      text(B, 'PUFFIN', 0.22, C.white, -0.5, -0.35, 0.004, { weight: 0.17 });
      B.pop();
      B.push(-HX, 0, 0, -HP);
      text(B, 'PUFFIN', 0.26, C.white, 0, -0.1, 0.004, { weight: 0.17 });
      text(B, 'HALYARD', 0.12, C.white, 0, -0.38, 0.004, { weight: 0.2, spacing: 0.4 });
      glazing(B, -HZ + 0.45, -0.35, S0 + 0.5, S1 - 0.42, 1, { frame: C.white });
      glazing(B, 0.35, HZ - 0.45, S0 + 0.5, S1 - 0.42, 1, { frame: C.white });
      B.pop();
      // fenders: along both sides, and the stern (toward the quay's fender piles, clear of the gangway)
      const fenderAt = (x, z, nx, nz) => {
        B.lathe('gloss', C.white, [[0, -0.3], [0.06, -0.29], [0.1, -0.24], [0.11, -0.15], [0.11, 0.15], [0.1, 0.24], [0.06, 0.29], [0, 0.3]], x + nx * 0.12, 0.02, z + nz * 0.12, { seg: 12 });
        B.tube(ns(B, 'rubber'), C.rope, [P3(x + nx * 0.12, 0.33, z + nz * 0.12), P3(x + nx * 0.04, S0 + 0.05, z + nz * 0.04)], 0.012, { radial: 4 });
      };
      for (const s of [-1, 1]) { for (const x of [-2.2, -0.4, 1.4]) fenderAt(x, s * HZ, 0, s); fenderAt(-HX, s * 1.75, -1, 0); }
      // --- top deck: guard rails along both sides (bow corner to stern corner) and the stern either side of the landing
      const rY = DK + 1.0, e = 0.1, runs = [
        [[HX - e, HZ - e], [-HX + e, HZ - e], [-HX + e, LAND]],
        [[HX - e, -HZ + e], [-HX + e, -HZ + e], [-HX + e, -LAND]],
      ];
      for (const rn of runs) {
        const rp = [];
        for (let k = 0; k < rn.length - 1; k++) {
          const [ax, az] = rn[k], [bx2, bz] = rn[k + 1], L = Math.hypot(bx2 - ax, bz - az), n = Math.max(1, Math.round(L / 1.2));
          for (let i = 0; i < n; i++) { const t = i / n; post(B, 'metal', C.galv, 0.022, 1.0, ax + (bx2 - ax) * t, DK + 0.5, az + (bz - az) * t, { seg: 7 }); }
          rp.push(P3(ax, rY, az));
        }
        const last = rn[rn.length - 1];
        rp.push(P3(last[0], rY, last[1]));
        post(B, 'metal', C.galv, 0.022, 1.0, last[0], DK + 0.5, last[1], { seg: 7 });
        B.tube('metal', C.galv, rp, 0.027, { radial: 8 });
        B.tube('metal', C.galv, rp.map((p) => P3(p[0], DK + 0.5, p[2])), 0.014, { radial: 6 });
        for (const q of [rp[0], rp[rp.length - 1]]) B.sph('metal', C.galv, 0.034, q[0], rY, q[2], { ws: 8, hs: 6 });
      }
      // rail colliders: floating bands 0.6…1.1 m over the deck just outboard of the edge (a kid on the deck is pushed back
      // inboard). Both sides end at the bow edge; the bow stays open (the drop), the stern only either side of the landing
      const r0 = DK + 0.6, r1 = DK + 1.1, O = 0.3, q = 0.005;
      B.col(-HX - O, r0, HZ + q, HX, r1, HZ + O, { rail: true });                        // +z side
      B.col(-HX - O, r0, -HZ - O, HX, r1, -HZ - q, { rail: true });                      // -z side
      B.col(-HX - O, r0, LAND + 0.1, -HX - q, r1, HZ + O, { rail: true });                // stern, beside the landing
      B.col(-HX - O, r0, -HZ - O, -HX - q, r1, -LAND - 0.1, { rail: true });
      // gangway landing: a galvanised threshold strip on the stern edge
      bx(B, 'metal', C.galv, 0.12, 0.012, 2 * LAND - 0.1, -HX + 0.06, DK + 0.006, 0);
      // benches along both rails facing inboard (colliders: low cover), the forward third of the deck left clear
      for (const s of [-1, 1]) for (const x of [-1.9, -0.2]) {
        B.box('wood', C.teak, 1.5, 0.06, 0.42, x, DK + 0.44, s * (HZ - 0.42), { r: 0.015 });
        B.box('wood', C.teak, 1.5, 0.35, 0.05, x, DK + 0.7, s * (HZ - 0.2), { r: 0.015 });
        for (const k of [-1, 1]) B.box('metal', C.steelDk, 0.05, 0.44, 0.4, x + k * 0.65, DK + 0.22, s * (HZ - 0.4), { r: 0.01 });
        B.col(x - 0.75, DK, s > 0 ? HZ - 0.65 : -HZ + 0.15, x + 0.75, DK + 0.5, s > 0 ? HZ - 0.15 : -HZ + 0.65);
      }
      // coin-op viewer at the +z bow corner (the lookout), on a pedestal (small collider)
      {
        const vx = HX - 0.32, vz = HZ - 0.32;
        B.cyl('metal', C.steelDk, 0.07, 1.05, vx, DK + 0.525, vz, { seg: 10 });
        B.cyl('metal', C.steelDk, 0.16, 0.05, vx, DK + 0.025, vz, { seg: 12 });
        B.push(vx, DK + 1.2, vz, 0, 0, -0.18);
        B.box('gloss', C.mustard, 0.34, 0.24, 0.3, 0, 0, 0, { round: true, r: 0.07 });
        for (const z of [-0.07, 0.07]) B.cyl('gloss', C.black, 0.05, 0.14, 0.2, 0.02, z, { rz: HP, seg: 10 });
        B.box('metal', C.galv, 0.2, 0.04, 0.16, -0.05, 0.14, 0, { r: 0.01 });
        B.pop();
        B.col(vx - 0.1, DK, vz - 0.1, vx + 0.1, DK + 1.35, vz + 0.1);
      }
      // mast with steaming light + flag at the stern corner (+z), life rings on both side rails
      B.cyl('metal', C.white, 0.045, 2.6, -HX + 0.3, DK + 1.3, HZ - 0.3, { seg: 10 });
      B.blink('#fff1d0', -HX + 0.3, DK + 2.62, HZ - 0.3, { size: 0.05, rate: 0.1, lo: 2.2, hi: 2.6 });
      B.flag(-HX + 0.3, DK + 2.5, HZ - 0.3, { color: coral, rz: HP, ry: PI, s: 1.0 });
      for (const s of [-1, 1]) { B.push(0.9, DK + 0.72, s * (HZ - e + 0.03), s > 0 ? 0 : PI); ringBuoy(B, 0, 0, 0, 0.72); B.pop(); }
      // mooring lines: bow lines down to the float's edge, stern lines to the quay edge
      for (const s of [-1, 1]) {
        rope(B, [HX - 0.15, S0 + 0.1, s * (HZ - 0.2)], [HX + 0.75, 0.05, s * (HZ + 0.4)], 0.22, 0.022);
        rope(B, [-HX + 0.15, S0 + 0.1, s * (HZ - 0.2)], [-HX - 0.95, 0.05, s * (HZ + 0.25)], 0.22, 0.022);
      }
    },
  };

  // ---- crate step (Tower Command: "CRATE TO TOP"): a timber spares crate on a pallet against the ferry cabin's side on
  // the side corridor — a step from the corridor (1.3) up onto the sun deck (3.8). Placed at the crate's base centre on the
  // corridor deck; local x along the cabin, the cabin wall at local z -0.4. Collider = the crate (walkable top, no ink).
  D.crate_step = {
    desc: 'Spares crate on a pallet (Tower Command crate step): braced timber crate with stencils and rope lashing, 1.4 × 0.75 × 1.25 on a pallet (collider).',
    params: { w: 'm (1.4)', d: 'm (0.75)', h: 'top above the base (1.25)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const w = o.w ?? 1.4, d = o.d ?? 0.75, h = o.h ?? 1.25;
      palletUnder(B, -w / 2 + 0.02, w / 2 - 0.02, -d / 2 + 0.02, d / 2 - 0.02, 0.96);
      crateBox(B, -w / 2 + 0.03, w / 2 - 0.03, 0.122, h, -d / 2 + 0.03, d / 2 - 0.03, 1.0);
      text(B, 'KRAKEN LINES', 0.08, '#3a3f4a', 0, 0.8, d / 2 - 0.02, { weight: 0.2, spacing: 0.3 });
      text(B, 'SHIP SPARES', 0.065, '#3a3f4a', 0, 0.62, d / 2 - 0.02, { weight: 0.2, spacing: 0.3 });
      for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) B.tube(ns(B, 'rubber'), C.rope, [P3(x, 0.2, d / 2 + 0.005), P3(x, h + 0.005, d / 2 - 0.02), P3(x, h + 0.005, -d / 2 + 0.02), P3(x, 0.2, -d / 2 - 0.005)], 0.012, { radial: 4 });
      B.col(-w / 2, 0, -d / 2, w / 2, h, d / 2);
    },
  };
}

// ---- Tower Command floating docks (the user's FLOAT notes, drawn on Bravo's half: authored there, mirrored). Modular
// floating-dock sections added beside the timber piers "for more land": level with the pier decks (top y 0, a FLOAT_Y0
// deep deck frame — the track stays flat), riding on float tubs (floatdeck dresses each section). Each float is a
// rectangle cut into sections along x = cx / z = cz lines; sections sit FLOAT_JOIN apart (the join lines — every cut stays
// clear of the 1 m nav grid's half-metre sample lines), 15–30 cm off the piers and boats round them. maps.js builds the
// level blocks from floatSections(), this file their dressing: one table for both.
export const FLOAT_Y0 = -0.4, FLOAT_JOIN = 0.05;
export const HALYARD_FLOATS = [
  { x: [16.25, 19.35], z: [-2.5, 10.25], cz: [1.0, 4.0, 7.0] },                                   // FLOAT (L): off the ferry's end…
  { x: [10.0, 16.25], z: [5.3, 10.25], cx: [13.0], piles: [[9.62, 6.3]] },                       // …and along the ferry to the boardwalk
  { x: [4.65, 12.8], z: [14.4, 23.4], cx: [7.0, 10.0], cz: [17.0, 20.0], piles: [[5.9, 14.03], [5.8, 23.77]] },   // FLOAT round checkpoint 2
  { x: [10.0, 12.8], z: [12.55, 14.4] },                                                           // (its neck to the boardwalk)
  { x: [-9.85, -4.65], z: [26.15, 30.85], cx: [-7.0] },                                            // FLOAT beside LIMPET, walkway ↔ quay
];
// what lies round the floats (Bravo's half): a float side within 0.35 m of one of these is a seam ('s'; 'b' a boat: fenders)
// (the Long Stages slice moved the quay out to z ±QUAY_FRONT: the piers and the yard run on to it)
const FLOAT_NEIGHBOURS = [
  [-16, 16, -5, 5, 'b'],                            // the ferry
  [19.5, 24, -7, 0, 's'], [19.5, 24, 0, -QUAY_FRONT, 's'],   // Alpha's yard strip, the Long Pier
  [4.5, 19.5, 10.4, 12.4, 's'],                     // the boardwalk
  [-4.5, 4.5, 8.6, -QUAY_FRONT, 's'],               // the fuel dock
  [13, 17.6, 14.4, 23.4, 'b'],                      // the houseboat (Tower Command's trimmed hull)
  [-24, 24, -QUAY_FRONT, -hq(-46), 's'],            // the quay
  [-24, -10, 7, 35.5, 's'], [-10, -4.5, 24, 26, 's'], // the boatyard (to the travel-lift slip), its walkway
  [-9.8, -4.8, 14.4, 23.4, 'b'],                    // workboat LIMPET
  [7.1, 11.8, 23.7, 30.35, 'b'],                    // water-bus PUFFIN
  [12.5, 19.5, 25.2, 26.4, 's'],                    // the finger pier
];
// The sections (Bravo's half): { x0, x1, z0, z1 } pulled back half a join wherever they meet another section, and for the
// dressing each side's stretches ('w' open water, 'j' a join, 's' / 'b' a seam) in section-local coordinates + its piles.
export function floatSections() {
  const raw = [];
  for (const f of HALYARD_FLOATS) {
    const xs = [f.x[0], ...(f.cx || []), f.x[1]], zs = [f.z[0], ...(f.cz || []), f.z[1]];
    for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) raw.push({ x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1], f });
  }
  const eq = (a, b) => Math.abs(a - b) < 1e-6, ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 1e-6, h = FLOAT_JOIN / 2;
  const out = raw.map((r) => {
    const q = { ...r };
    for (const t of raw) {
      if (t === r) continue;
      if (ov(r.z0, r.z1, t.z0, t.z1)) { if (eq(r.x1, t.x0)) q.x1 = r.x1 - h; if (eq(r.x0, t.x1)) q.x0 = r.x0 + h; }
      if (ov(r.x0, r.x1, t.x0, t.x1)) { if (eq(r.z1, t.z0)) q.z1 = r.z1 - h; if (eq(r.z0, t.z1)) q.z0 = r.z0 + h; }
    }
    return q;
  });
  const inside = (x, z, a) => x > a[0] && x < a[1] && z > a[2] && z < a[3];
  const kindAt = (q, x, z) => {
    for (const t of out) if (t !== q && inside(x, z, [t.x0, t.x1, t.z0, t.z1])) return 'j';
    for (const n of FLOAT_NEIGHBOURS) if (inside(x, z, n)) return n[4];
    return 'w';
  };
  for (const q of out) {
    const cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2, P = 0.35;
    q.sides = {};
    for (const [sd, ax, fixed, lo, hi] of [['+x', 'z', q.x1 + P, q.z0, q.z1], ['-x', 'z', q.x0 - P, q.z0, q.z1], ['+z', 'x', q.z1 + P, q.x0, q.x1], ['-z', 'x', q.z0 - P, q.x0, q.x1]]) {
      const segs = [], c = ax === 'z' ? cz : cx, n = Math.max(2, Math.round((hi - lo) / 0.05));
      for (let i = 0; i < n; i++) {
        const u = lo + ((hi - lo) * (i + 0.5)) / n, k = ax === 'z' ? kindAt(q, fixed, u) : kindAt(q, u, fixed);
        const last = segs[segs.length - 1];
        if (last && last[0] === k) last[2] = +(lo + ((hi - lo) * (i + 1)) / n - c).toFixed(3);
        else segs.push([k, +(lo + ((hi - lo) * i) / n - c).toFixed(3), +(lo + ((hi - lo) * (i + 1)) / n - c).toFixed(3)]);
      }
      // (slivers under 0.4 m — a probe that fell into a neighbour's join, a corner — go to the stretch before them)
      for (let i = 0; i < segs.length && segs.length > 1; i++) {
        if (segs[i][2] - segs[i][1] >= 0.4) continue;
        const into = i > 0 ? segs[i - 1] : segs[i + 1];
        into[1] = Math.min(into[1], segs[i][1]); into[2] = Math.max(into[2], segs[i][2]);
        segs.splice(i, 1); i = -1;
      }
      for (let i = 1; i < segs.length; i++) if (segs[i][0] === segs[i - 1][0]) { segs[i - 1][2] = segs[i][2]; segs.splice(i, 1); i--; }
      q.sides[sd] = segs;
    }
    // guide piles: each goes with the section whose side it stands off
    q.piles = (q.f.piles || []).filter(([x, z]) => x > q.x0 - 0.6 && x < q.x1 + 0.6 && z > q.z0 - 0.6 && z < q.z1 + 0.6).map(([x, z]) => [+(x - cx).toFixed(3), +(z - cz).toFixed(3)]);
  }
  return out.map(({ x0, x1, z0, z1, sides, piles }) => ({ x0, x1, z0, z1, sides, piles }));
}

// Placements (same format as src/world/dressing.js; mirrored by the map's 180° rotation unless mirror: false).
export const HALYARD_VESSELS = [
  // ---- the ferry (hull side + end, saloon side; the mirror copies dress the far side and end)
  { type: 'ferry_hull', pos: [0, 0, 0], notIn: 'tower' },
  { type: 'ferry_hull', pos: [0, 0, 0], linkspan: true, onlyIn: 'tower' },   // Tower Command: floats against both ends
  { type: 'ferry_cabin', pos: [0, 0, 0] },
  { type: 'ferry_bridge', pos: [0, 3.8, 0], mirror: false, notIn: 'tower' },
  // cover pieces from docs/HALYARD.md (Alpha half; mirrored)
  { type: 'ferry_locker', pos: [11.75, 1.3, 2.15], notIn: 'tower' },
  { type: 'ferry_cargo', pos: [14.2, 1.3, 0.4], notIn: 'tower' },
  // ---- the tug on blocks in the boatyard (Zone Control build: its deck is the side zone — rails opened for the bow
  //      boarding stair + the crate steps, the stern ramp eased to 23.8° into a notch; see tug_access)
  { type: 'tug_dress', pos: [17.5, 0, -18.5], notIn: ['zones', 'tower'] },
  { type: 'tug_dress', pos: [17.5, 0, -18.5], access: 'bow', onlyIn: 'tower' },   // Tower Command: bow rail open for the bow ramp
  { type: 'tug_dress', pos: [17.5, 0, -18.5], access: true, onlyIn: 'zones' },
  { type: 'tug_access', pos: [0, 0, 0], onlyIn: 'zones' },
  { type: 'tug_access', pos: [0, 0, 0], stairOnly: true, onlyIn: 'tower' },     // Tower Command: the bow ramp's handrails
  // ---- ramp dressing: ferry sun-deck stair (stringers + handrails) and the tug ramp's scaffold guardrails
  { type: 'ferry_stair', pos: [0, 0, 0], notIn: 'tower' },
  { type: 'ferry_stair', pos: [0, 0, 0], zIn: -1.45, onlyIn: 'tower' },          // Tower Command: the narrowed stair
  { type: 'tug_ramp_rails', pos: [0, 0, 0], notIn: 'zones' },
  { type: 'tug_ramp_rails', pos: [0, 0, 0], z0: -7.55, z1: -13.45, onlyIn: 'zones' },
  // ---- the houseboat in the Long Pier slip + its RIB tender on a painter off the stern (in the open-water corner of the
  //      slip by the fuel dock; non-colliding)
  { type: 'houseboat_dress', pos: [-14.6, 0, -18.9], notIn: 'tower' },
  { type: 'houseboat_dress', pos: [-14.6, 0, -18.9], xe: 1.6, onlyIn: 'tower' },  // Tower Command: trimmed at the cabin
  { type: 'boat_rib', pos: [-9.4, -1.6, -27.0], rotY: Math.PI / 2 - 0.08, length: 3.6, color: '#3f9f97', notIn: 'tower' },
  // ---- dinghy on its trailer (boatyard cover piece). Zone Control: the bow stair takes the yard in front of the tug's
  //      bow, so the trailer is parked out on the quay by the boathouse instead (keeps the lane east of the stair open
  //      from the quay — no dead-end alley beside the tug)
  { type: 'dinghy_trailer', pos: [22.1, 0, -27.7], notIn: ['zones', 'tower'] },
  { type: 'dinghy_trailer', pos: [20.4, 0, hq(-35.3)], rotY: 0.12, onlyIn: 'tower' },   // (Tower Command: clear of the bow ramp, as in Zone Control)
  { type: 'dinghy_trailer', pos: [20.4, 0, hq(-35.3)], rotY: 0.12, onlyIn: 'zones' },
  // ---- Tower Command (the user's notes; authored on Bravo's half where they drew them, mirrored): the floating docks'
  //      sections (floatSections, below), workboat LIMPET across the channel ("BOAT / BACK OF BOAT"), water-bus PUFFIN
  //      moored bow-in between the quay and checkpoint 2's float ("BOAT WITH 1 WAY DROP", a vantage point for the
  //      defenders) + its boarding gangway from the quay, the crate step onto the ferry's sun deck ("CRATE TO TOP")
  ...floatSections().map((q) => ({ type: 'floatdeck', pos: [(q.x0 + q.x1) / 2, 0, (q.z0 + q.z1) / 2], w: q.x1 - q.x0, d: q.z1 - q.z0, y0: FLOAT_Y0, sides: q.sides, piles: q.piles, onlyIn: 'tower' })),
  { type: 'workboat', pos: [-7.3, 0, 18.9], onlyIn: 'tower' },
  { type: 'waterbus', pos: [9.45, 0, 27.025], rotY: Math.PI / 2, onlyIn: 'tower' },
  { type: 'gangwayrails', pos: [9.45, SLICE.pontoonY, 37.55], rotY: Math.PI, run: 7.2, rise: 2.3 - SLICE.pontoonY, width: 1.8, thick: 0.22, posts: 6, land0: 0, onlyIn: 'tower' },   // (up from the visitor pontoons' finger: the Long Stages slice)
  { type: 'crate_step', pos: [-2.75, 1.3, 3.375], onlyIn: 'tower' },
  // ---- the marina beyond the boatyard (mirrored beyond the Long Pier): quay gate + gangway, walkway, fingers, boats
  ...marina(),
];

// The marina layout (Alpha half, x > 24; mirrored). It lives in the basin behind the docks stream's breakwater (rocks
// from x ≈ 38.7, head at z 10) and south of its channel markers (z 17…22): a walkway along Z at x 26.7…28.5 reached by a
// gated gangway from the quay at z -37.9, fingers off its outer side every 4.2 m, boats in the berths (sterns to the
// walkway, bows toward the breakwater, ≤ 8.6 m so they clear the rocks), a RIB + kayaks alongside its inner side.
// Also clear of the environment's moored boats (+X fishing boat at z 20…29; the mirror side's rowboat at x -26.4…-25.1).
// (the Long Stages stretch: the quay moved out 24 m, hq(); the walkway runs on to it, five more berths — two of them free)
function marina() {
  const P = Math.PI, out = [], SEA = -1.6, WX = 27.6, WW = 1.8, Z0 = hq(-38.8), Z1 = 4.0;
  out.push({ type: 'marina_gate', pos: [24.0, 0, hq(-37.9)], run: 3.3, width: 1.4 });
  out.push({ type: 'marina_pontoon', pos: [WX, 0, Z0], rotY: -P / 2, length: Z1 - Z0, width: WW, unit: 4.3,
    piles: [{ s: 3.4, side: 1 }, { s: 20.5, side: 1 }, { s: 33.2, side: 1 }, { s: 42.2, side: 1 }, { s: 51.9, side: 1 }, { s: 61.6, side: 1 }],
    pedestals: [7.5, 15.9, 24.3, 32.7, 41.1, 49.5, 57.9], boxes: [12.0, 29.0, 46.0], rings: [5.0, 38.2, 60.2], kayaks: 36.2 });
  const fingers = [];
  for (let k = 0; k <= 14; k++) fingers.push(hq(-35.5) + k * 4.2);
  for (const z of fingers) out.push({ type: 'marina_pontoon', pos: [WX + WW / 2, 0, z], length: 4.8, width: 0.7, unit: 2.4, cleatSides: [-1, 1], piles: [{ s: 4.95, side: 0, h: 2.8 }] });
  const berths = [
    ['yacht_sail', 7.6, 'CURLEW'], [null], ['yacht_sail', 7.9, 'SEA HOLLY'], [null], ['yacht_sail', 7.3, 'WHIMBREL'],
    ['yacht_sail', 7.8, 'SALT SPRAY'], ['yacht_sail', 7.4, 'KITTIWAKE'], ['yacht_motor', 7.6, 'REEL TIME'], ['yacht_sail', 7.8, 'HALCYON'], ['yacht_sail', 7.6, 'PIPIT'],
    ['boat_fishing', 7.6, 'MARY ANN'], ['yacht_sail', 7.2, 'TERN'], ['yacht_sail', 7.9, 'MARGUERITE'], ['yacht_motor', 7.4, 'SEA BISCUIT'],
  ];
  berths.forEach(([type, L, name], k) => {
    if (!type) return;   // (a visitors' berth left free)
    const z = hq(-33.4) + k * 4.2;
    out.push({ type, pos: [WX + WW / 2 + 0.5 + L / 2, SEA, z + (k % 2 ? 0.12 : -0.12)], rotY: P / 2 + ((k % 3) - 1) * 0.015, length: L, name, fenderSide: k % 2 ? -1 : 1, far: true });
  });
  // alongside the inner side of the walkway (broadside to the arena)
  out.push({ type: 'boat_rib', pos: [25.58, SEA, -24.6], rotY: 0.02, length: 4.0 });
  out.push({ type: 'boat_rib', pos: [25.58, SEA, -9.8], rotY: P - 0.02, length: 4.0, color: '#e9703a' });
  return out;
}
