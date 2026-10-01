// Kelpline Terminal — stage prop pack + placements (owner: the kelpline stage; see layout.js for the folder contract).
//
// register(D, H): this stage's prop builders (types prefixed 'kelpline_'), same contract as props-marina-dock.js: H carries
// THREE + the kit helpers; parts merge into the kit's material buckets (paint / gloss / metal / wood / rubber / glow …),
// tiny parts go through H.noShadow. PLACEMENTS: the set dressing (half list, mirrored (x,z) → (-x,-z) unless
// `mirror: false`). Solid props hand the level collision boxes (un-inkable; nav + physics).
//
// Conventions: metres, Y up, `pos` = base point, rotY turns local +Z (the "front"). Wall-mounted pieces treat local
// z = 0 as the wall face and project toward +Z. Signage uses 3D channel / flat painted letters from a stroke font.
import { LOCAL, ROT_RAD, toWorld, AISLE, STRETCH, SLICE, S0, stretchZ } from './layout.js';

const P = Math.PI;

export function register(D, H) {
  const { THREE, col, shade, mixc, latheGeo, tubeGeo, extrudeGeo, flangeProf, TIRE, PI, TAU, HP, P3 } = H;
  // no-shadow alias for small parts (glow never casts anyway, so it stays in the one glow bucket). Rubber / timber parts
  // use the paint buckets with their own vertex colours: fewer merged meshes = fewer draw calls.
  const NS = (m) => (m === 'glow' || m === 'blob' ? m : H.noShadow ? H.noShadow(m) : m);

  // ------------------------------------------------------------------------------------------ palette
  // terminal steel: crane yellow, terminal blue; weathered concrete; muted container liveries
  const K = {
    crane: '#d9a93c', craneDk: '#b98b2c', craneLt: '#e6be5e', blue: '#2f5b8c', blueDk: '#23456b', blueLt: '#4a78aa',
    white: '#eeebe4', offwhite: '#e2ded5', grey: '#8a9097', greyDk: '#5c636b', charcoal: '#3a3e45', ink: '#25282e',
    galv: '#b9c0c6', galvDk: '#8b939a', steel: '#9aa3ab', rail: '#6d6660', rust: '#8c5a3c', rubber: '#26282c',
    concrete: '#cfc9bd', concreteDk: '#a8a295', glass: '#2f4658', glassLt: '#557386', lamp: '#ffe2a8', lampCool: '#e8f3ff',
    red: '#c9453b', green: '#3d8a5a', hazY: '#e8b83a', hazK: '#2a2c31', rope: '#d8c9a4', ropeDk: '#b3a078',
    hull: '#2e3f5c', hullRed: '#a3453a', hull2: '#2f5a4e', deck: '#8c8f86',
  };

  // ------------------------------------------------------------------------------------------ geometry helpers
  class GB {
    constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.idx = []; }
    v(x, y, z, nx, ny, nz, r = 1, g = r, b = r) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(0, 0); this.c.push(r, g, b); return this.p.length / 3 - 1; }
    tri(a, b, c) {
      const P = this.p, N = this.n;
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az;
      const e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
      const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
      if (cx * cx + cy * cy + cz * cz < 1e-18) return;
      const s = cx * (N[a * 3] + N[b * 3] + N[c * 3]) + cy * (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) + cz * (N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]);
      if (s < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
    }
    quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
    // flat-shaded quad from four points (normal from the first three, flipped toward `hint` if given)
    face(pts, hint) {
      const [a, b, c] = pts;
      let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const ids = pts.map((p) => this.v(p[0], p[1], p[2], nx, ny, nz));
      for (let i = 1; i < ids.length - 1; i++) this.tri(ids[0], ids[i], ids[i + 1]);
    }
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
  const TPL = new Map();
  const tpl = (key, fn) => { let g = TPL.get(key); if (!g) { g = fn(); TPL.set(key, g); } return g; };
  const kf = (a) => (typeof a === 'number' ? a.toFixed(4) : String(a));
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  // plain (unbevelled) box for small / flush parts: 12 triangles
  const pboxGeo = () => tpl('pbox', () => new THREE.BoxGeometry(1, 1, 1));
  const pbox = (B, mat, c, w, h, d, x, y, z, o = {}) => B.add(mat, pboxGeo(), c, x, y, z, { ...o, sx: w, sy: h, sz: d });
  // frustum box (bottom w0 × d0 at y = 0, top w1 × d1 at y = h), flat faces — tapered legs, hoppers, cabs
  const frustumGeo = (w0, d0, w1, d1, h, top = true) => tpl(['fr', w0, d0, w1, d1, h, top].map(kf).join('|'), () => {
    const g = new GB(), b = [[-w0 / 2, 0, -d0 / 2], [w0 / 2, 0, -d0 / 2], [w0 / 2, 0, d0 / 2], [-w0 / 2, 0, d0 / 2]];
    const t = [[-w1 / 2, h, -d1 / 2], [w1 / 2, h, -d1 / 2], [w1 / 2, h, d1 / 2], [-w1 / 2, h, d1 / 2]];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, c = [(b[i][0] + b[j][0]) / 2, 0, (b[i][2] + b[j][2]) / 2]; g.face([b[i], b[j], t[j], t[i]], c); }
    if (top) g.face([t[0], t[1], t[2], t[3]], [0, 1, 0]);
    return g.geo();
  });
  // straight beam between two points (square section w × h, 'up' hint for the section's vertical)
  function beam(B, mat, c, a, b, w, h = w) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    B.push((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, yaw, pitch);
    pbox(B, mat, c, w, h, L, 0, 0, 0);
    B.pop();
  }
  const rodT = (B, mat, c, a, b, r, radial = 6) => B.tube(mat, c, [P3(...a), P3(...b)], r, { radial });
  // compose a prop type as pure dressing (its colliders dropped)
  function subNC(B, type, x, y, z, ry, opts = {}) { const n0 = B.cols.length; sub(B, type, x, y, z, ry, opts); B.cols.length = n0; }
  const colBox = (B, x, y, z, w, h, d, o) => B.col(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, o);
  // compose another prop type inside this one (colliders re-mapped into this prop's frame)
  function sub(B, type, x, y, z, ry, opts = {}) {
    const def = D[type];
    if (!def) return;
    const n0 = B.cols.length, ao = B.aoBase;
    B.push(x, y, z, ry);
    def.build(B, opts);
    B.pop();
    B.aoBase = ao;
    const c = Math.cos(ry), s = Math.sin(ry);
    for (let i = n0; i < B.cols.length; i++) {
      const b = B.cols[i];
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [lx, lz] of [[b[0], b[2]], [b[3], b[2]], [b[3], b[5]], [b[0], b[5]]]) {
        const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
        x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); z0 = Math.min(z0, wz); z1 = Math.max(z1, wz);
      }
      B.cols[i] = b.length > 6 ? [x0, b[1] + y, z0, x1, b[4] + y, z1, b[6]] : [x0, b[1] + y, z0, x1, b[4] + y, z1];
    }
  }
  // diagonal hazard stripes on a flat panel facing +Z (w × h centred at x, y; z = panel face), stripes clipped to the panel
  function clipPoly(poly, x0, y0, x1, y1) {
    const edges = [[(p) => p[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]], [(p) => p[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
      [(p) => p[1] >= y0, (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0]], [(p) => p[1] <= y1, (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1]]];
    let out = poly;
    for (const [inside, cut] of edges) {
      const inp = out; out = [];
      for (let i = 0; i < inp.length; i++) {
        const a = inp[i], b = inp[(i + 1) % inp.length], ia = inside(a), ib = inside(b);
        if (ia) out.push(a);
        if (ia !== ib) out.push(cut(a, b));
      }
      if (!out.length) break;
    }
    return out;
  }
  const hazardGeo = (w, h, pitch) => tpl(['hz', w, h, pitch].map(kf).join('|'), () => {
    const g = new GB(), sw = pitch / 2;
    for (let k = -Math.ceil(h / pitch) - 1; k * pitch < w + h; k++) {
      const x = -w / 2 + k * pitch;
      const poly = clipPoly([[x, -h / 2], [x + sw, -h / 2], [x + sw + h, h / 2], [x + h, h / 2]], -w / 2, -h / 2, w / 2, h / 2);
      if (poly.length >= 3) g.face(poly.map((p) => [p[0], p[1], 0]), [0, 0, 1]);
    }
    return g.geo();
  });
  function hazard(B, w, h, x, y, z, o = {}) {
    pbox(B, NS(o.mat ?? 'paint'), o.a ?? K.hazY, w, h, 0.01, x, y, z);
    B.add(NS(o.mat ?? 'paint'), hazardGeo(w, h, o.pitch ?? 0.36), o.b ?? K.hazK, x, y, z + 0.0055, { ao: false });
  }

  // ------------------------------------------------------------------------------------------ stroke font
  // Rounded bold sans (cap height 1): centre-line strokes, round caps + joins, bevelled front, flat back.
  const EA = (cx, cy, rx, ry, a0, a1, n = 12) => { const o = []; for (let i = 0; i <= n; i++) { const a = ((a0 + (a1 - a0) * (i / n)) * PI) / 180; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; };
  const LOOP = (cx, cy, rx, ry, n = 24) => ({ c: EA(cx, cy, rx, ry, 0, 360, n).slice(0, n) });
  const GL = {
    A: [0.66, [[0, 0], [0.33, 1], [0.66, 0]], [[0.13, 0.33], [0.53, 0.33]]],
    B: [0.58, [[0, 0], [0, 1]], [[0, 1], ...EA(0.3, 0.755, 0.245, 0.245, 90, -90, 12), [0, 0.51]], [[0, 0.51], ...EA(0.32, 0.255, 0.255, 0.255, 90, -90, 12), [0, 0]]],
    C: [0.64, EA(0.34, 0.5, 0.34, 0.5, 46, 314, 22)],
    D: [0.6, [[0, 0], [0, 1]], [[0, 1], ...EA(0.16, 0.5, 0.44, 0.5, 90, -90, 16), [0, 0]]],
    E: [0.5, [[0.5, 1], [0, 1], [0, 0], [0.5, 0]], [[0, 0.52], [0.42, 0.52]]],
    F: [0.5, [[0.5, 1], [0, 1], [0, 0]], [[0, 0.52], [0.42, 0.52]]],
    G: [0.68, [...EA(0.34, 0.5, 0.34, 0.5, 46, 360, 22), [0.4, 0.5]]],
    H: [0.6, [[0, 0], [0, 1]], [[0.6, 0], [0.6, 1]], [[0, 0.52], [0.6, 0.52]]],
    I: [0, [[0, 0], [0, 1]]],
    J: [0.5, [[0.5, 1], ...EA(0.25, 0.3, 0.25, 0.3, 0, -172, 12)]],
    K: [0.58, [[0, 0], [0, 1]], [[0.56, 1], [0.02, 0.38]], [[0.22, 0.6], [0.6, 0]]],
    L: [0.48, [[0, 1], [0, 0], [0.48, 0]]],
    M: [0.76, [[0, 0], [0, 1], [0.38, 0.3], [0.76, 1], [0.76, 0]]],
    N: [0.62, [[0, 0], [0, 1], [0.62, 0], [0.62, 1]]],
    O: [0.74, LOOP(0.37, 0.5, 0.37, 0.5, 28)],
    P: [0.56, [[0, 0], [0, 1]], [[0, 1], ...EA(0.29, 0.735, 0.265, 0.265, 90, -90, 12), [0, 0.47]]],
    Q: [0.74, LOOP(0.37, 0.5, 0.37, 0.5, 28), [[0.46, 0.22], [0.78, -0.04]]],
    R: [0.58, [[0, 0], [0, 1]], [[0, 1], ...EA(0.29, 0.735, 0.265, 0.265, 90, -90, 12), [0, 0.47]], [[0.26, 0.47], [0.6, 0]]],
    S: [0.56, [...EA(0.28, 0.75, 0.27, 0.25, 28, 270, 12), ...EA(0.28, 0.25, 0.28, 0.25, 90, -152, 12).slice(1)]],
    T: [0.62, [[0, 1], [0.62, 1]], [[0.31, 1], [0.31, 0]]],
    U: [0.6, [[0, 1], ...EA(0.3, 0.32, 0.3, 0.32, 180, 360, 14), [0.6, 1]]],
    V: [0.66, [[0, 1], [0.33, 0], [0.66, 1]]],
    W: [0.92, [[0, 1], [0.23, 0], [0.46, 0.72], [0.69, 0], [0.92, 1]]],
    X: [0.62, [[0, 1], [0.62, 0]], [[0, 0], [0.62, 1]]],
    Y: [0.64, [[0, 1], [0.32, 0.48], [0.64, 1]], [[0.32, 0.48], [0.32, 0]]],
    Z: [0.56, [[0, 1], [0.56, 1], [0, 0], [0.56, 0]]],
    0: [0.56, LOOP(0.28, 0.5, 0.28, 0.5, 26)],
    1: [0.3, [[0, 0.78], [0.26, 1], [0.26, 0]]],
    2: [0.54, [...EA(0.27, 0.72, 0.27, 0.28, 160, -30, 12), [0, 0], [0.56, 0]]],
    3: [0.54, EA(0.26, 0.75, 0.25, 0.25, 150, -90, 12), EA(0.27, 0.26, 0.28, 0.26, 90, -150, 12)],
    4: [0.6, [[0.44, 0], [0.44, 1], [0, 0.3], [0.6, 0.3]]],
    5: [0.54, [[0.5, 1], [0.07, 1], [0.05, 0.52], ...EA(0.29, 0.34, 0.28, 0.34, 150, -150, 14)]],
    6: [0.56, [...EA(0.28, 0.5, 0.28, 0.5, 62, 180, 10), [0, 0.3]], LOOP(0.28, 0.3, 0.28, 0.3, 20)],
    7: [0.54, [[0, 1], [0.54, 1], [0.18, 0]]],
    8: [0.56, LOOP(0.28, 0.76, 0.23, 0.24, 18), LOOP(0.28, 0.27, 0.28, 0.27, 20)],
    9: [0.56, LOOP(0.28, 0.7, 0.28, 0.3, 20), [[0.56, 0.7], ...EA(0.28, 0.5, 0.28, 0.5, 0, -118, 10)]],
    '-': [0.36, [[0, 0.45], [0.36, 0.45]]],
    '+': [0.46, [[0, 0.45], [0.46, 0.45]], [[0.23, 0.22], [0.23, 0.68]]],
    '/': [0.4, [[0, 0], [0.4, 1]]],
    "'": [0, [[0, 1], [0, 0.8]]],
    '&': [0.7, [[0.7, 0], ...EA(0.27, 0.72, 0.17, 0.2, -40, 220, 12).reverse(), [0.08, 0.28], ...EA(0.26, 0.24, 0.24, 0.24, 180, 300, 6), [0.62, 0.36]]],
    '>': [0.4, [[0, 0.9], [0.4, 0.45], [0, 0]]],
    '<': [0.4, [[0.4, 0.9], [0, 0.45], [0.4, 0]]],
  };
  const DOTS = { '·': [[0, 0.46]], '.': [[0, 0]], ':': [[0, 0.1], [0, 0.62]] };
  const SPACE = 0.34;
  function ribbon(g, pts, closed, hw, b, d, z0) {
    const n = pts.length, R = Math.SQRT1_2, walls = d - z0 > 1e-5, bev = b > 1e-5;
    const N = pts.map((p, i) => {
      const a = closed ? pts[(i - 1 + n) % n] : i > 0 ? pts[i - 1] : null;
      const c = closed ? pts[(i + 1) % n] : i < n - 1 ? pts[i + 1] : null;
      const nrm = (u, v) => { const dx = v[0] - u[0], dy = v[1] - u[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
      const n1 = a ? nrm(a, p) : null, n2 = c ? nrm(p, c) : null;
      if (!n1) return [n2[0], n2[1], 1];
      if (!n2) return [n1[0], n1[1], 1];
      let mx = n1[0] + n2[0], my = n1[1] + n2[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      return [mx, my, Math.min(1.6, 1 / Math.max(0.3, mx * n2[0] + my * n2[1]))];
    });
    const rings = pts.map((p, i) => {
      const [nx, ny, k] = N[i];
      const at = (s) => [p[0] + nx * k * s, p[1] + ny * k * s];
      const hi = bev ? hw - b : hw, Li = at(hi), Lo = at(hw), Ri = at(-hi), Ro = at(-hw), dz = bev ? b : 0;
      const r = [g.v(Li[0], Li[1], d, 0, 0, 1), g.v(Ri[0], Ri[1], d, 0, 0, 1)];
      if (bev) r.push(g.v(Li[0], Li[1], d, nx * R, ny * R, R), g.v(Lo[0], Lo[1], d - b, nx * R, ny * R, R), g.v(Ri[0], Ri[1], d, -nx * R, -ny * R, R), g.v(Ro[0], Ro[1], d - b, -nx * R, -ny * R, R));
      if (walls) r.push(g.v(Lo[0], Lo[1], d - dz, nx, ny, 0), g.v(Lo[0], Lo[1], z0, nx, ny, 0), g.v(Ro[0], Ro[1], d - dz, -nx, -ny, 0), g.v(Ro[0], Ro[1], z0, -nx, -ny, 0));
      return r;
    });
    const segs = closed ? n : n - 1, np = rings[0].length;
    for (let i = 0; i < segs; i++) {
      const A = rings[i], Bq = rings[(i + 1) % n];
      for (let j = 0; j < np; j += 2) g.quad(A[j], A[j + 1], Bq[j + 1], Bq[j]);
    }
  }
  function disc(g, cx, cy, r, b, d, z0, seg, a0 = 0, a1 = TAU) {
    const R = Math.SQRT1_2, walls = d - z0 > 1e-5, bev = b > 1e-5, ri = bev ? r - b : r, full = a1 - a0 > TAU - 1e-4;
    const c0 = g.v(cx, cy, d, 0, 0, 1), f = [], bi = [], bo = [], wt = [], wb = [];
    const n = full ? seg : seg + 1;
    for (let k = 0; k < n; k++) {
      const a = a0 + ((a1 - a0) * k) / seg, cs = Math.cos(a), sn = Math.sin(a);
      f.push(g.v(cx + cs * ri, cy + sn * ri, d, 0, 0, 1));
      if (bev) { bi.push(g.v(cx + cs * ri, cy + sn * ri, d, cs * R, sn * R, R)); bo.push(g.v(cx + cs * r, cy + sn * r, d - b, cs * R, sn * R, R)); }
      if (walls) { wt.push(g.v(cx + cs * r, cy + sn * r, d - (bev ? b : 0), cs, sn, 0)); wb.push(g.v(cx + cs * r, cy + sn * r, z0, cs, sn, 0)); }
    }
    for (let k = 0; k < seg; k++) {
      const j = full ? (k + 1) % seg : k + 1;
      g.tri(c0, f[k], f[j]);
      if (bev) g.quad(bi[k], bo[k], bo[j], bi[j]);
      if (walls) g.quad(wt[k], wb[k], wb[j], wt[j]);
    }
  }
  function glyph(ch, wt, dep, bev, ds = 10) {
    return tpl(['kgl', ch, wt, dep, bev, ds].map(kf).join('|'), () => {
      const s = 1 - wt, hw = wt / 2, T = (p) => [hw + p[0] * s, hw + p[1] * s];
      const g = new GB();
      const b = Math.min(bev, hw * 0.6);
      if (DOTS[ch]) {
        for (const p of DOTS[ch]) { const q = T(p); disc(g, hw * 1.15, q[1], hw * 1.15, b, dep, 0, ds); }
        return { geo: g.geo(), adv: wt * 1.3 };
      }
      const def = GL[ch];
      if (!def) return { geo: null, adv: SPACE };
      const [w, ...strokes] = def;
      strokes.forEach((st, si) => {
        const d = dep > 0 ? dep - si * 0.006 : si * 0.0004;
        const closed = !Array.isArray(st);
        let pts = (closed ? st.c : st).map(T);
        pts = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-4);
        if (closed) { ribbon(g, pts, true, hw, b, d, 0); return; }
        let cur = [pts[0]];
        const joints = [pts[0], pts[pts.length - 1]];
        for (let i = 1; i < pts.length; i++) {
          cur.push(pts[i]);
          if (i < pts.length - 1) {
            const a = pts[i - 1], p = pts[i], c = pts[i + 1];
            const t1 = Math.atan2(p[1] - a[1], p[0] - a[0]), t2 = Math.atan2(c[1] - p[1], c[0] - p[0]);
            let dt = Math.abs(t2 - t1); if (dt > PI) dt = TAU - dt;
            if (dt > 0.6) { ribbon(g, cur, false, hw, b, d, 0); cur = [pts[i]]; joints.push(pts[i]); }
          }
        }
        if (cur.length > 1) ribbon(g, cur, false, hw, b, d, 0);
        const endCap = (p, q) => { const a = Math.atan2(p[1] - q[1], p[0] - q[0]); disc(g, p[0], p[1], hw, b, d, 0, Math.max(3, Math.round(ds / 2)), a - HP, a + HP); };
        endCap(pts[0], pts[1]); endCap(pts[pts.length - 1], pts[pts.length - 2]);
        for (const p of joints.slice(2)) disc(g, p[0], p[1], hw, b, d, 0, ds);
      });
      return { geo: g.geo(), adv: w * s + wt };
    });
  }
  const textW = (str, wt = 0.17, track = 0.12) => { let w = 0; const cs = [...str]; cs.forEach((ch, i) => { w += ch === ' ' ? SPACE : glyph(ch, wt, 0.12, 0.035).adv; if (i < cs.length - 1) w += track; }); return w; };
  // a line of letters facing +Z in the current frame (raised channel letters, or flat paint with flat: true); returns width
  function letters(B, str, o = {}) {
    const h = o.h ?? 0.3, wt = o.wt ?? 0.17, flat = !!o.flat;
    const dep = flat ? 0 : o.dep ?? 0.12, bev = flat ? 0 : o.bev ?? (h < 0.34 ? 0 : 0.03), track = o.track ?? 0.12;
    const ds = o.ds ?? (flat || h < 0.12 ? 6 : 8);
    const W = textW(str, wt, track) * h;
    let x = o.align === 'left' ? 0 : o.align === 'right' ? -W : -W / 2;
    const cs = [...str];
    cs.forEach((ch, i) => {
      if (ch === ' ') { x += (SPACE + track) * h; return; }
      const gi = glyph(ch, wt, dep, bev, ds);
      const m = o.mat ?? (flat ? 'paint' : 'gloss');
      if (gi.geo) B.add(flat || h < 0.2 ? NS(m) : m, gi.geo, o.c ?? K.white, (o.x ?? 0) + x, o.y ?? 0, o.z ?? 0, { s: h, sz: flat ? 1 : h, glow: o.glow, ao: false });
      if (gi.geo && o.lit) {
        const fg = glyph(ch, wt, 0, 0, ds);
        if (fg.geo) B.add(NS('glow'), fg.geo, o.litC ?? o.c ?? K.lamp, (o.x ?? 0) + x, o.y ?? 0, (o.z ?? 0) + dep * h + 0.004, { s: h, sz: 1, glow: o.lit, ao: false });
      }
      x += (gi.adv + (i < cs.length - 1 ? track : 0)) * h;
    });
    return W;
  }

  // ------------------------------------------------------------------------------------------ small kit
  // glowing flood head (faces local -Y by default: tilt with rx), housing + lens
  function flood(B, x, y, z, o = {}) {
    B.push(x, y, z, o.ry ?? 0, o.rx ?? 0);
    B.box(NS('paint'), o.c ?? K.charcoal, 0.56, 0.2, 0.4, 0, 0, 0, { r: 0.04 });
    pbox(B, 'glow', o.lamp ?? K.lampCool, 0.5, 0.012, 0.34, 0, -0.105, 0, { glow: (o.glow ?? 1.6) * 2.2 });
    for (let k = -2; k <= 2; k++) pbox(B, NS('paint'), shade(o.c ?? K.charcoal, 0.8), 0.02, 0.06, 0.36, k * 0.09, 0.11, 0);
    B.pop();
  }
  // handrail run between two points (posts every ~1.2 m, top + knee rail), for catwalks / stairs
  function handrail(B, a, b, h = 1.0, c = K.crane, o = {}) {
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.round(L / (o.every ?? 1.3)));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      rodT(B, NS('paint'), c, [x, y, z], [x, y + h, z], 0.022, 5);
    }
    rodT(B, 'paint', c, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.024, 6);
    rodT(B, NS('paint'), c, [a[0], a[1] + h * 0.5, a[2]], [b[0], b[1] + h * 0.5, b[2]], 0.018, 5);
    if (o.toe) { const dx = b[0] - a[0], dz = b[2] - a[2]; beam(B, NS('paint'), c, [a[0], a[1] + 0.06, a[2]], [b[0], b[1] + 0.06, b[2]], 0.012, 0.1); }
  }

  // ================================================================================================ ship-to-shore crane
  // Central STS gantry crane "K7": rails at x = ±G (waterside +X), legs at z = ±LZ. Local frame = world (placed once at the
  // origin, mirror: false). Colliders: 4 legs (tall, off-limits tops) + 4 bogie runs (1.2 m: low cover in the apron lanes);
  // the overhead steel is a perch (walkable, never inkable — see the collider block at the end of build).
  D.kelpline_crane = {
    desc: 'Ship-to-shore gantry crane (crane-yellow box girders): four tapered portal legs on rail bogies (rails at x = ±21, legs at z = ±6), portal beams + tie beams at 17 m, twin trolley girders from the backreach (machinery house, x -33) to the boom tip over the ship (x +56), A-frame with forestays, trolley with hanging operator cab, spreader holding a 40\' box over the middle, floodlights, warning beacons, KELPLINE lettering. Colliders: legs + bogie runs; the overhead steel (portal beams + walkways, tie beams, girders + walkways, trolley, cab, machinery house, chords) is a perch: walkable, never inkable (o.coarse: off-limits roofs instead).',
    params: { gauge: 'half gauge (21)', lz: 'leg z (6)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const G = o.gauge ?? 21, LZ = o.lz ?? 6, Y0 = 1.5, YP = 17, YG = 18.6, GH = 1.8, GZ = 2.7, c = K.crane, cd = K.craneDk;
      // ---- bogies + legs
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * G, z = sz * LZ;
        // equaliser beam + two bogie frames, 4 wheels each, buffers at the ends
        B.box('paint', c, 1.0, 0.5, 7.2, x, 1.25, z, { r: 0.06 });
        for (const bz of [-1.9, 1.9]) {
          B.box('paint', cd, 0.84, 0.72, 3.1, x, 0.66, z + bz, { r: 0.05 });
          pbox(B, NS('paint'), K.charcoal, 0.86, 0.1, 3.0, x, 0.28, z + bz);
          for (let k = 0; k < 4; k++) {
            const wz = z + bz - 1.14 + k * 0.76;
            B.cyl('metal', K.greyDk, 0.33, 0.24, x, 0.33, wz, { rz: HP, seg: 14 });
            B.cyl(NS('metal'), K.galvDk, 0.12, 0.9, x, 0.33, wz, { rz: HP, seg: 8 });
          }
          // drive motor + gearbox on the outside of each frame
          B.box('paint', K.blueDk, 0.36, 0.42, 0.7, x + sx * 0.6, 0.78, z + bz + 0.4, { r: 0.05 });
          B.cyl(NS('paint'), K.blueDk, 0.16, 0.5, x + sx * 0.6, 0.78, z + bz - 0.25, { seg: 10, rx: HP });
        }
        for (const ez of [-3.75, 3.75]) {
          B.box('paint', K.charcoal, 0.6, 0.5, 0.3, x, 0.9, z + ez, { r: 0.08 });
        }
        // hazard band on the equaliser ends
        for (const ez of [-1, 1]) { B.push(x, 1.25, z + ez * 3.605, ez > 0 ? 0 : PI); hazard(B, 0.96, 0.44, 0, 0, 0); B.pop(); }
        // tapered leg (wider in z at the foot), hazard band, stiffener rings, access door, crane number
        B.add('paint', frustumGeo(1.5, 1.9, 1.2, 1.4, YP - Y0), c, x, Y0, z, {});
        for (const yy of [4.5, 8.5, 12.5]) pbox(B, 'paint', cd, 1.5 - (yy - Y0) * 0.3 / (YP - Y0) + 0.06, 0.12, 1.9 - (yy - Y0) * 0.5 / (YP - Y0) + 0.06, x, yy, z);
        for (const f of [-1, 1]) {
          B.push(x, 0, z + f * (0.95 - 0.02), f > 0 ? 0 : PI);
          hazard(B, 1.48, 0.8, 0, 2.0, 0.012);
          B.pop();
        }
        // door on the inboard face (toward the lanes) + crane number
        B.push(x - sx * 0.74, 0, z, -sx * HP);
        pbox(B, NS('paint'), cd, 0.7, 1.6, 0.04, 0, 3.1, 0.01);
        pbox(B, NS('metal'), K.galvDk, 0.06, 0.18, 0.05, 0.25, 3.0, 0.03);
        letters(B, o.num ?? 'K7', { h: 0.9, x: 0, y: 5.2, z: 0.01, c: K.ink, flat: true, wt: 0.2 });
        B.pop();
        B.col(x - 0.75, 0, z - 0.95, x + 0.75, YP, z + 0.95, { roof: true });
        B.col(x - 0.5, 0, z - 3.6, x + 0.5, 1.2, z + 3.6);
      }
      // ---- power cable reel on the −X sill (one per crane): drum, spokes, cable dropping into the quay's cable trench
      {
        const rx = -G - 1.3, ry = 3.4, rz = -LZ + 1.2, R0 = 1.15;
        B.cyl('paint', K.blueDk, R0, 0.12, rx - 0.42, ry, rz, { rz: HP, seg: 20 });
        B.cyl('paint', K.blueDk, R0, 0.12, rx + 0.42, ry, rz, { rz: HP, seg: 20 });
        B.cyl('paint', K.charcoal, R0 - 0.25, 0.72, rx, ry, rz, { rz: HP, seg: 20 });
        for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; for (const ex of [-0.49, 0.49]) pbox(B, NS('paint'), K.blue, 0.03, R0 * 1.9, 0.1, rx + ex, ry, rz, { rx: a }); }
        B.cyl('metal', K.galvDk, 0.22, 1.2, rx, ry, rz, { rz: HP, seg: 10 });
        pbox(B, 'paint', c, 0.9, 0.3, 0.5, rx + 0.35, ry - 0.2, rz - R0 + 0.2);
        B.tube(NS('paint'), K.charcoal, [P3(rx, ry - R0 + 0.25, rz + 0.2), P3(rx, 1.4, rz + 0.5), P3(rx, 0.5, rz + 0.9), P3(rx, 0.03, rz + 1.6)], 0.06, { radial: 6 });
        B.box('paint', c, 0.4, 2.4, 0.4, rx + 0.5, 2.4, rz - 1.3, { r: 0.04 });
        pbox(B, 'paint', c, 1.2, 0.3, 0.3, rx + 0.9, 3.4, rz - 1.3);
      }
      // ---- portal beams (along z on each rail) + tie beams (along x at each leg pair) + knee braces
      for (const sx of [-1, 1]) {
        const x = sx * G;
        B.box('paint', c, 1.3, 1.6, LZ * 2 + 1.6, x, YP + 0.8, 0, { r: 0.08 });
        for (const sz of [-1, 1]) beam(B, 'paint', cd, [x, 11.5, sz * LZ * 0.9], [x, YP, sz * 1.2], 0.5, 0.5);
        // walkway + handrail on the outside of the portal beam
        pbox(B, NS('metal'), K.galvDk, 0.9, 0.06, LZ * 2 + 1.4, x + sx * 1.1, YP + 0.05, 0);
        handrail(B, [x + sx * 1.5, YP + 0.08, -LZ - 0.6], [x + sx * 1.5, YP + 0.08, LZ + 0.6], 1.0, c);
      }
      for (const sz of [-1, 1]) {
        const z = sz * LZ;
        B.box('paint', c, G * 2 + 1.0, 1.0, 1.0, 0, YP + 0.5, z, { r: 0.07 });
        for (const sx of [-1, 1]) beam(B, 'paint', cd, [sx * (G - 0.4), 12.2, z], [sx * (G - 6), YP, z], 0.5, 0.5);
        // big KELPLINE lettering on the tie beams, facing the bases
        B.push(0, YP, z + sz * 0.51, sz > 0 ? 0 : PI);
        letters(B, 'KELPLINE', { h: 0.7, x: -10, y: 0.15, z: 0.0, c: K.blueDk, flat: true, wt: 0.2, track: 0.16 });
        letters(B, o.num ?? 'K7', { h: 0.7, x: 12, y: 0.15, z: 0.0, c: K.blueDk, flat: true, wt: 0.2 });
        B.pop();
      }
      // ---- trolley girders (backreach → boom hinge), the boom (tapers to the tip; o.boom = raised angle °, 0 = down
      //      over the ship), bracing, walkways, hinge, A-frame + boom hoist ropes / forestays
      const X0 = -33, X1 = 56, XH = G + 2, bA = ((o.boom ?? 0) * PI) / 180, bc = Math.cos(bA), bs = Math.sin(bA), BL = X1 - XH;
      const onBoom = (d, dy = 0) => [XH + d * bc - dy * bs, YG + GH + d * bs + dy * bc - GH];   // boom point d m out (girder top line)
      for (const sz of [-1, 1]) {
        const z = sz * GZ;
        B.box('paint', c, XH - X0, GH, 1.0, (X0 + XH) / 2, YG + GH / 2, z, { r: 0.07 });
        B.push(XH, YG, z, 0, 0, bA);
        B.add('paint', tpl('kboom', () => { const g = new GB(), L = BL, h0 = GH, h1 = 1.1; const pts = [[0, 0, -0.5], [L, h0 - h1, -0.45], [L, h0, -0.45], [0, h0, -0.5]]; const q = pts.map((p) => [p[0], p[1], -p[2]]); g.face([pts[0], pts[1], pts[2], pts[3]], [0, 0, -1]); g.face([q[0], q[1], q[2], q[3]], [0, 0, 1]); g.face([pts[0], pts[1], q[1], q[0]], [0, -1, 0.01]); g.face([pts[3], pts[2], q[2], q[3]], [0, 1, 0]); g.face([pts[1], pts[2], q[2], q[1]], [1, 0, 0]); return g.geo(); }), c, 0, 0, 0, {});
        pbox(B, NS('metal'), K.galvDk, BL - 4, 0.05, 0.8, (BL - 4) / 2, -0.02, sz * 0.95);
        handrail(B, [0.5, 0, sz * 1.3], [BL - 6, 0, sz * 1.3], 1.0, c, { every: 2.2 });
        B.push(11, 0, sz * 0.505, sz > 0 ? 0 : PI);
        letters(B, 'SWL 65 T', { h: 0.5, x: 0, y: 0.45, z: 0.0, c: K.ink, flat: true, wt: 0.22 });
        B.pop();
        B.pop();
        B.cyl('metal', K.galvDk, 0.35, 0.3, XH, YG + 0.4, z + sz * 0.62, { rx: HP, seg: 12 });
        // outer walkway with handrail along the backreach + portal girder
        pbox(B, NS('metal'), K.galvDk, XH - X0, 0.05, 1.0, (X0 + XH) / 2, YG - 0.02, z + sz * 1.0);
        // its handrail: gates where it crosses the portal beams (step out onto the beam), closed across the backreach end
        for (const [ra, rb] of [[X0 + 0.1, -G - 0.8], [-G + 0.8, G - 0.8], [G + 0.8, XH - 0.5]]) handrail(B, [ra, YG, z + sz * 1.45], [rb, YG, z + sz * 1.45], 1.0, c, { every: 2.2 });
        handrail(B, [X0 + 0.1, YG, z + sz * 0.55], [X0 + 0.1, YG, z + sz * 1.45], 1.0, c);
        // KELPLINE on the girder's outer face (visible from both bases)
        B.push(-6, YG, z + sz * 0.505, sz > 0 ? 0 : PI);
        letters(B, 'KELPLINE', { h: 1.05, x: sz > 0 ? -2 : 2, y: 0.38, z: 0.0, c: K.white, flat: true, wt: 0.19, track: 0.18 });
        B.pop();
      }
      // cross bracing between the girders (bottom chords every 6 m, top ties at the portals), along the boom too
      for (let x = X0 + 2; x < XH; x += 6) pbox(B, 'paint', cd, 0.4, 0.4, GZ * 2 - 1.0, x, YG + 0.2, 0);
      B.push(XH, YG, 0, 0, 0, bA);
      for (let d = 3; d < BL - 2; d += 6) pbox(B, 'paint', cd, 0.4, 0.4, GZ * 2 - 1.0, d, 0.2, 0);
      for (let d = 3; d <= 27; d += 8) for (const sz of [-1, 1]) flood(B, d, -0.15, sz * GZ, { glow: 1.4 });
      B.pop();
      for (const x of [-G, G]) pbox(B, 'paint', c, 1.0, 0.6, GZ * 2 + 1.0, x, YG + GH + 0.3, 0);
      // ---- A-frame (over the waterside legs) + forestays to the boom + backstays
      const AX = 15, AY = 33;
      for (const sz of [-1, 1]) {
        const z = sz * (GZ + 0.2);
        beam(B, 'paint', c, [G - 1, YG + GH, z], [AX, AY, z * 0.8], 0.9, 0.9);
        beam(B, 'paint', c, [4, YG + GH, z], [AX, AY, z * 0.8], 0.8, 0.8);
        for (const d of [13, 27]) { const [bx, by] = onBoom(d); rodT(B, 'metal', K.galvDk, [AX + 0.4, AY - 0.3, z * 0.8], [bx, by + GH + 0.1, sz * GZ], 0.09, 6); }
        rodT(B, 'metal', K.galvDk, [AX - 0.4, AY - 0.3, z * 0.8], [X0 + 3, YG + GH + 0.1, sz * GZ], 0.08, 6);
      }
      B.box('paint', c, 1.4, 1.4, GZ * 1.6 + 1.2, AX, AY, 0, { r: 0.08 });
      B.cyl('paint', cd, 0.15, 1.2, AX, AY + 1.3, 0, { seg: 8 });
      B.blink('#ff4030', AX, AY + 2.0, 0, { size: 0.16, rate: 0.5, lo: 0.4, hi: 6 });
      { const [tx2, ty2] = onBoom(BL - 0.6, 0.3); B.blink('#ff4030', tx2, ty2 + GH, 0, { size: 0.14, rate: 0.5, phase: 1.2, lo: 0.4, hi: 6 }); }
      B.blink('#ff4030', X0 + 0.6, YG + GH + 4.4, 0, { size: 0.12, rate: 0.5, phase: 2.2, lo: 0.4, hi: 6 });
      // ---- machinery house on the backreach
      const MX = X0 + 5.2;
      B.box('paint', K.white, 9.6, 3.8, 7.4, MX, YG + GH + 1.9, 0, { r: 0.1 });
      B.box('paint', c, 9.8, 0.3, 7.6, MX, YG + GH + 3.95, 0, { r: 0.06 });
      for (const sz of [-1, 1]) {
        B.push(MX, YG + GH, sz * 3.71, sz > 0 ? 0 : PI);
        for (let k = 0; k < 7; k++) pbox(B, NS('paint'), K.offwhite, 0.05, 3.4, 0.03, -4.2 + k * 1.4, 1.9, 0.01);
        letters(B, 'KELPLINE', { h: 1.2, x: 0, y: 1.3, z: 0.02, c: K.blue, flat: true, wt: 0.2, track: 0.14 });
        for (const lx of [-3.9, 3.9]) pbox(B, NS('paint'), K.greyDk, 0.9, 0.7, 0.04, lx, 2.9, 0.02);
        B.pop();
      }
      // ---- trolley over the middle, operator cab below it, ropes + spreader + hanging 40' box
      const TX = o.trolley ?? 0;
      B.box('paint', c, 5.4, 1.2, GZ * 2 + 1.6, TX, YG + GH + 0.6, 0, { r: 0.08 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl('metal', K.greyDk, 0.35, 0.3, TX + sx * 1.9, YG + GH + 0.1, sz * GZ, { rx: HP, seg: 12 });
      // cab: hangs off the trolley on the -Z side, glazed front + floor window
      B.push(TX + 1.4, YG - 0.2, -GZ - 1.2);
      B.box('paint', c, 2.6, 2.4, 2.2, 0, -1.2, 0, { r: 0.1 });
      pbox(B, NS('gloss'), K.glassLt, 2.3, 1.5, 0.04, 0, -1.1, -1.11);
      pbox(B, NS('gloss'), K.glassLt, 0.04, 1.5, 1.8, 1.31, -1.1, 0);
      pbox(B, NS('gloss'), K.glass, 1.6, 0.04, 1.4, 0, -2.41, -0.1);
      pbox(B, 'paint', c, 0.3, 1.0, 0.3, 0, 0.3, 0.8);
      B.pop();
      // wire ropes to the spreader
      const SY = 9.9;
      for (const sx of [-0.9, 0.9]) for (const sz of [-4.8, 4.8]) rodT(B, NS('metal'), K.galvDk, [TX + sx * 0.6, YG + GH * 0.2, sz * 0.4], [TX + sx, SY + 0.25, sz], 0.035, 4);
      // spreader: telescopic frame on top of the box, twistlock corners, flippers, hydraulics
      B.box('paint', c, 2.2, 0.35, 12.2, TX, SY + 0.18, 0, { r: 0.05 });
      B.box('paint', cd, 1.2, 0.55, 2.6, TX, SY + 0.35, 0, { r: 0.06 });
      for (const sz of [-1, 1]) {
        pbox(B, 'paint', cd, 2.6, 0.3, 0.4, TX, SY + 0.16, sz * 5.9);
        for (const sx of [-1, 1]) { B.box(NS('paint'), K.ink, 0.35, 0.5, 0.35, TX + sx * 1.12, SY + 0.0, sz * 6.0, { r: 0.03 }); }
        B.cyl(NS('paint'), K.ink, 0.1, 1.6, TX, SY + 0.5, sz * 2.4, { seg: 8, rx: HP });
      }
      // the hanging box (full modelled container, see containerBody), along Z
      containerBody(B, TX, SY - 2.6, 0, 40, K.rust, { logo: 'TIDEBANK', logoC: K.white, bottom: true });
      // ---- lighting: floods under the girders over the lanes, on the portal, festoon of deck lights
      for (let x = -18; x <= 18; x += 9) for (const sz of [-1, 1]) flood(B, x, YG - 0.2, sz * (GZ + 0.2), { rx: 0.15 * sz, glow: 1.8 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) flood(B, sx * (G - 0.9), YP - 0.2, sz * (LZ + 1.3), { rx: -0.5 * sz, ry: 0, glow: 1.6 });
      for (let x = 26; x <= 50; x += 8) for (const sz of [-1, 1]) flood(B, x, YG - 0.15, sz * GZ, { glow: 1.4 });
      // ---- stair tower up the landside leg at (-G, -LZ) (visual; starts above head height)
      {
        const x = -G - 1.9, z = -LZ;
        for (let k = 0; k < 6; k++) {
          const y0 = 3.2 + k * 2.3, dir = k % 2 ? 1 : -1;
          beam(B, 'metal', K.galvDk, [x, y0, z - dir * 1.3], [x, y0 + 2.3, z + dir * 1.3], 0.9, 0.08);
          pbox(B, NS('metal'), K.galvDk, 1.0, 0.06, 1.0, x, y0 + 2.3, z + dir * 1.8);
          handrail(B, [x - 0.5, y0, z - dir * 1.3], [x - 0.5, y0 + 2.3, z + dir * 1.3], 0.95, c, { every: 3 });
        }
        pbox(B, NS('paint'), c, 0.16, YP - 3, 0.16, x - 0.55, 3 + (YP - 3) / 2, z - 2.3);
        pbox(B, NS('paint'), c, 0.16, YP - 3, 0.16, x - 0.55, 3 + (YP - 3) / 2, z + 2.3);
        B.col(x - 0.6, 3.0, z - 2.4, x + 0.55, YP, z + 2.4, { rail: true });
      }
      // ---- colliders on the overhead steel. K7 (the arena's crane) is a PERCH: anyone who gets up there (Zipline, a
      //      special) can stand and walk on the steel — never inkable, no cover added: a high vantage point and a sitting
      //      duck. Every top matches the visible steel; every surface lets you walk or drop off (the gap between the
      //      girders is open to the Landing, the walkways' ends and the girder ends are open drops). The legs keep their
      //      off-limits tops (buried under the portal beams). K6 (outside the arena, o.coarse) stays off-limits.
      //      The hanging box stays collision-free (it would otherwise roof over the Landing).
      const P = o.coarse ? { roof: true } : { perch: true }, RL = { rail: true };
      const rng = (a, b) => (a < b ? [a, b] : [b, a]);
      for (const sx of [-1, 1]) {
        const x = sx * G, [wa, wb] = rng(x + sx * 0.65, x + sx * 1.55), [ra, rb] = rng(x + sx * 1.49, x + sx * 1.57);
        B.col(x - 0.65, YP, -LZ - 0.8, x + 0.65, YP + 1.6, LZ + 0.8, P);                       // portal beam (18.6)
        B.col(wa, YP - 0.12, -LZ - 0.7, wb, YP + 0.08, LZ + 0.7, P);                             // its outboard walkway (17.08)
        if (!o.coarse) B.col(ra, YP + 0.08, -LZ - 0.6, rb, YP + 1.12, LZ + 0.6, RL);           // + handrail (open ends)
        B.col(x - 0.5, YG + GH, -GZ - 0.5, x + 0.5, YG + GH + 0.6, GZ + 0.5, P);               // top tie over the girders (21.0)
      }
      for (const sz of [-1, 1]) {
        const z = sz * GZ, [ga, gb] = rng(z - sz * 0.5, z + sz * 0.5), [wa, wb] = rng(z + sz * 0.5, z + sz * 1.5), [ra, rb] = rng(z + sz * 1.42, z + sz * 1.5);
        B.col(-G + 0.65, YP, sz * LZ - 0.5, G - 0.65, YP + 1.0, sz * LZ + 0.5, P);              // tie beam (18.0)
        B.col(X0, YG, ga, XH, YG + GH, gb, P);                                                  // trolley girder (20.4)
        B.col(X0, YG - 0.15, wa, XH, YG, wb, P);                                                // its outer walkway (18.6)
        if (!o.coarse) for (const [xa, xb] of [[X0 + 0.1, -G - 0.8], [-G + 0.8, G - 0.8], [G + 0.8, XH - 0.5]]) B.col(xa - 0.03, YG, ra, xb + 0.03, YG + 1.04, rb, RL);   // + handrail (gates at the portals)
        if (!o.coarse) B.col(X0 + 0.05, YG, wa, X0 + 0.15, YG + 1.04, wb, RL);               // closed at the backreach end (over the sea)
        // A-frame feet on the girder (the legs lean away steeply: a wall across the girder top, nobody stands on them)
        if (!o.coarse) B.col(G - 2.0, YG + GH, ga - 0.1, G - 0.55, YG + GH + 2.2, gb + 0.1, { roof: true });
        if (!o.coarse) B.col(3.55, YG + GH, ga - 0.1, 5.6, YG + GH + 2.0, gb + 0.1, { roof: true });
      }
      // bottom chords between the girders (not under the trolley: nobody fits there)
      if (!o.coarse) for (let x = X0 + 2; x < XH; x += 6) if (Math.abs(x - TX) > 3.2) B.col(x - 0.2, YG, -GZ + 0.5, x + 0.2, YG + 0.4, GZ - 0.5, P);
      B.col(TX - 2.7, YG + GH, -GZ - 0.8, TX + 2.7, YG + GH + 1.2, GZ + 0.8, P);                // trolley (21.6)
      B.col(TX + 0.1, YG - 2.6, -GZ - 2.2, TX + 2.7, YG - 0.2, -GZ - 0.1, P);                  // operator cab roof (18.4)
      B.col(MX - 4.9, YG + GH, -3.8, MX + 4.9, YG + GH + 4.1, 3.8, P);                         // machinery house roof (24.5)
      // the raised boom's foot at the girder ends (a steel wall; the boom itself stands near-vertical: no perch)
      if (bA > 0.1) B.col(XH - 1.75, YG + GH, -GZ - 0.5, XH + 1.2, YG + GH + 6, GZ + 0.5, { roof: true });
      else for (const sz of [-1, 1]) { const [ga, gb] = rng(sz * GZ - sz * 0.5, sz * GZ + sz * 0.5); B.col(XH, YG, ga, X1, YG + GH, gb, P); }
      B.col(-G - 1.85, 2.2, -LZ - 0.05, -G - 0.75, 4.6, -LZ + 2.45, { roof: true });
    },
  };

  // ================================================================================================ ISO containers
  // Container dressing around a box whose body is a level block (corrugated container pattern) or, for loose boxes
  // (o.bottom), a modelled body. Local frame: length along local Z (−L/2 … +L/2), door end at +Z, bottom at y = 0.
  // Corner posts + castings (with the oval twistlock holes), top / bottom side + end rails, forklift pockets on 20',
  // the door end (two leaves, four locking bars with cams + handles, hinges, CSC plate, owner code), or for reefers the
  // machinery end at −Z (grille, fan, control box, power cable). Everything hugs the block faces (≤ 4 cm proud).
  function containerBody(B, x, y, z, len, color, o = {}) {
    const L = len === 20 ? 6.06 : len === 10 ? 2.99 : 12.19, W = 2.44, Hh = o.h ?? 2.6, c = color, dk = shade(c, 0.8), dk2 = shade(c, 0.6);
    B.push(x, y, z, o.ry ?? 0);
    if (o.bottom) {
      // loose box (hanging from the spreader / on a chassis): core + ribbed side sheets + cross members underneath
      pbox(B, 'paint', c, W - 0.06, Hh - 0.1, L - 0.1, 0, Hh / 2, 0);
      for (let k = -L / 2 + 0.3; k < L / 2 - 0.2; k += 0.3) for (const sx of [-1, 1]) pbox(B, NS('paint'), shade(c, 1.06), 0.03, Hh - 0.3, 0.12, sx * (W / 2 - 0.02), Hh / 2, k);
      for (let k = -L / 2 + 0.6; k < L / 2 - 0.3; k += 1.2) pbox(B, NS('paint'), dk2, W - 0.1, 0.1, 0.1, 0, 0.05, k);
    }
    // corner posts + castings
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      pbox(B, NS('paint'), dk, 0.17, Hh - 0.3, 0.17, sx * (W / 2 - 0.075), Hh / 2, sz * (L / 2 - 0.075));
      for (const cy of [0.09, Hh - 0.09]) {
        pbox(B, 'paint', dk2, 0.19, 0.18, 0.19, sx * (W / 2 - 0.085), cy, sz * (L / 2 - 0.085));
        pbox(B, NS('paint'), K.ink, 0.1, 0.06, 0.012, sx * (W / 2 - 0.085), cy, sz * (L / 2 + 0.012));
        pbox(B, NS('paint'), K.ink, 0.012, 0.06, 0.1, sx * (W / 2 + 0.012), cy, sz * (L / 2 - 0.085));
        if (cy > 1) pbox(B, NS('paint'), K.ink, 0.06, 0.012, 0.11, sx * (W / 2 - 0.085), cy + 0.091, sz * (L / 2 - 0.085));
      }
    }
    // side + end rails (the top rail carries a thin light edge where the paint is chipped)
    for (const sx of [-1, 1]) {
      pbox(B, NS('paint'), dk, 0.07, 0.16, L - 0.36, sx * W / 2, 0.08, 0);
      pbox(B, NS('paint'), dk, 0.07, 0.14, L - 0.36, sx * W / 2, Hh - 0.07, 0);
      pbox(B, NS('paint'), shade(c, 1.25), 0.072, 0.012, L - 0.4, sx * W / 2, Hh - 0.005, 0);
    }
    for (const sz of [-1, 1]) {
      pbox(B, NS('paint'), dk, W - 0.36, 0.18, 0.07, 0, 0.09, sz * L / 2);
      pbox(B, NS('paint'), dk, W - 0.36, 0.22, 0.07, 0, Hh - 0.11, sz * L / 2);
    }
    if (len === 20) for (const sx of [-1, 1]) for (const pz of [-1.03, 1.03]) pbox(B, NS('paint'), K.ink, 0.02, 0.1, 0.36, sx * (W / 2 + 0.036), 0.1, pz);
    // door end
    // (a stack box's end is its level block's face — inkable — so its door leaves are that face itself: only the hardware
    //  (seam, locking bars, cams, handles, hinges, plate) stands proud of it, and ink shows between. Loose boxes get the
    //  modelled leaves.)
    const stack = !o.bottom;
    const doorEnd = (zs) => {
      B.push(0, 0, zs * (L / 2 + 0.004), zs > 0 ? 0 : PI);
      const lw = W / 2 - 0.14, ly0 = 0.18, ly1 = Hh - 0.23, lh = ly1 - ly0;
      if (stack) pbox(B, NS('paint'), dk2, 0.024, lh, 0.012, 0, ly0 + lh / 2, 0.004);
      for (const sx of [-1, 1]) {
        const lx = sx * (0.012 + lw / 2);
        if (!stack) {
          pbox(B, NS('paint'), shade(c, 0.94), lw, lh, 0.03, lx, ly0 + lh / 2, 0.015);
          for (let k = 0; k < 4; k++) pbox(B, NS('paint'), shade(c, 1.04), 0.1, lh - 0.34, 0.022, lx + (k - 1.5) * lw * 0.24, ly0 + lh / 2, 0.038);
        }
        for (const bo of [-0.3, 0.3]) {
          const bx = lx + bo * lw * 0.9;
          B.cyl(NS('metal'), K.galv, 0.019, Hh - 0.32, bx, Hh / 2, 0.07, { seg: 6 });
          for (const yy of [0.24, Hh - 0.3]) pbox(B, NS('metal'), K.galvDk, 0.08, 0.08, 0.05, bx, yy, 0.065);
          pbox(B, NS('metal'), K.galvDk, 0.07, 0.05, 0.05, bx, 1.35, 0.075);
          B.push(bx, 1.22, 0.09, 0, 0, -sx * HP * 0.9); pbox(B, NS('metal'), K.galv, 0.028, 0.36, 0.024, 0, -0.18, 0); B.pop();
        }
        for (let k = 0; k < 4; k++) B.cyl(NS('metal'), K.galvDk, 0.026, 0.13, sx * (W / 2 - 0.13), 0.42 + k * (Hh - 0.84) / 3, 0.045, { seg: 6 });
      }
      pbox(B, NS('paint'), K.galv, 0.2, 0.13, 0.008, -0.42, 1.62, 0.05);
      if (o.code) letters(B, o.code, { h: 0.09, x: 0.6, y: Hh - 0.52, z: 0.052, c: shade(c, 1) === c ? K.white : K.white, flat: true, wt: 0.22 });
      B.pop();
    };
    // reefer machinery end: recessed aluminium panel, evaporator grille, condenser fan, control box, cable to a plug
    const reeferEnd = (zs) => {
      B.push(0, 0, zs * (L / 2 + 0.004), zs > 0 ? 0 : PI);
      // (a stack reefer's machinery end is its block face: no solid panel over it — grille slats, fan, control box only)
      if (!stack) pbox(B, NS('metal'), '#c9ccc9', W - 0.34, Hh - 0.44, 0.02, 0, Hh / 2, 0.01);
      for (let k = 0; k < 7; k++) pbox(B, NS('metal'), '#aeb2b0', W - 0.5, 0.025, 0.03, 0, Hh - 0.42 - k * 0.07, 0.03);
      B.cyl(NS('metal'), '#3a3f45', 0.34, 0.04, -0.42, 0.95, 0.03, { rx: HP, seg: 16 });
      B.tor(NS('metal'), '#b8bcba', 0.34, 0.025, -0.42, 0.95, 0.05, { rs: 4, ts: 16 });
      for (let k = 0; k < 4; k++) pbox(B, NS('metal'), '#8d9290', 0.64, 0.02, 0.02, -0.42, 0.95, 0.06, { rz: (k * PI) / 4 });
      B.box('paint', '#e9e6de', 0.5, 0.55, 0.14, 0.55, 1.05, 0.08, { r: 0.03 });
      pbox(B, NS('glow'), '#8fe39a', 0.16, 0.06, 0.01, 0.55, 1.18, 0.155, { glow: 1.3 });
      pbox(B, NS('paint'), K.ink, 0.3, 0.12, 0.01, 0.55, 0.98, 0.155);
      B.tube(NS('paint'), '#2c2d31', [P3(0.72, 0.55, 0.1), P3(0.9, 0.3, 0.2), P3(0.95, 0.12, 0.35), P3(1.05, 0.05, 0.6)], 0.028, { radial: 5 });
      B.box(NS('paint'), '#e2b531', 0.12, 0.09, 0.2, 1.08, 0.05, 0.72, { r: 0.02 });
      B.pop();
    };
    if (o.reefer) { reeferEnd(o.doorAt > 0 ? -1 : 1); doorEnd(o.doorAt > 0 ? 1 : -1); } else doorEnd(o.doorAt ?? 1);
    // painted logo (loose boxes only; stack boxes carry theirs as murals on the block faces)
    if (o.logo) for (const sx of [-1, 1]) {
      B.push(sx * (W / 2 + 0.035), 0, 0, sx * HP);
      letters(B, o.logo, { h: o.logoH ?? (len === 20 ? 0.42 : 0.62), x: 0, y: Hh * 0.46, z: 0, c: o.logoC ?? K.white, flat: true, wt: 0.2, track: 0.14 });
      B.pop();
    }
    B.pop();
  }
  D.kelpline_box = {
    desc: 'Container dressing for a stack box (the body is a level block): corner posts + castings, rails, forklift pockets, door end (locking bars, cams, hinges, CSC plate, owner code) at +Z or a reefer machinery end — hardware only over the block face, so ink on the end shows. pos = bottom centre, local Z = length.',
    params: { len: '10 | 20 | 40', color: 'box paint', door: '+1 door at local +Z, -1 at −Z', reefer: 'bool', code: 'owner code' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      containerBody(B, 0, 0, 0, o.len ?? 20, o.color ?? '#a8583f', { doorAt: o.door ?? 1, reefer: !!o.reefer, code: o.code });
    },
  };
  D.kelpline_loosebox = {
    desc: 'A complete loose container (modelled body + dressing), e.g. on a trailer chassis. pos = bottom centre, local Z = length, door at +Z.',
    params: { len: '20 | 40', color: 'paint', logo: 'side lettering', logoC: 'lettering colour' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      containerBody(B, 0, 0, 0, o.len ?? 20, o.color ?? '#3d5f8c', { bottom: true, logo: o.logo, logoC: o.logoC, code: o.code });
    },
  };

  // ================================================================================================ steel stairs
  // Dressing for a layout stair (ramp with the treads surface): channel stringers over the ramp's top edges, stanchions
  // with a crane-yellow handrail + knee rail, landing plate at the top, hazard-striped kick plate at the foot.
  // Local +Z runs from the foot (0,0,0) up to (0, rise, run); width W centred. Non-colliding (outside the walking width
  // they sit on the ramp's own sides).
  D.kelpline_stair = {
    desc: 'Steel stair dressing (local +Z from the foot up to (0, rise, run), width W): channel stringers on the ramp edges, stanchions, yellow handrail + knee rail, foot kick plate with hazard stripes. Non-colliding.',
    params: { run: 'm', rise: 'm', width: 'm', rails: '[left, right] (true, true)', c: 'rail colour' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const run = o.run ?? 6.3, rise = o.rise ?? 2.6, W = o.width ?? 2.3, L = Math.hypot(run, rise), pitch = Math.atan2(rise, run);
      const rc = o.c ?? K.crane, sc = o.stringer ?? K.greyDk, HR = 0.95, rails = o.rails ?? [true, true];
      [-1, 1].forEach((sx, i) => {
        const x = sx * (W / 2 - 0.05);
        B.push(x, rise / 2, run / 2, 0, -pitch);
        pbox(B, 'paint', sc, 0.1, 0.34, L + 0.02, 0, -0.1, 0);
        pbox(B, NS('paint'), shade(sc, 1.15), 0.14, 0.03, L + 0.02, sx * 0.02, 0.075, 0);
        B.pop();
        if (!rails[i]) return;
        const n = Math.max(2, Math.round(run / 1.5) + 1);
        const at = (t, h) => [x, (rise * t) / run + h, t];
        for (let k = 0; k < n; k++) { const t = 0.15 + ((run - 0.3) * k) / (n - 1); rodT(B, NS('paint'), rc, at(t, 0.06), at(t, HR), 0.022, 5); }
        B.tube('paint', rc, [P3(...at(0.15, HR - 0.05)), P3(...at(0.15, HR)), P3(...at(run - 0.15, HR)), P3(...at(run + 0.35, HR + 0.02 - rise * 0.35 / run))], 0.026, { radial: 6 });
        rodT(B, NS('paint'), rc, at(0.15, HR * 0.5), at(run - 0.15, HR * 0.5), 0.016, 4);
        // (its rail colliders are layout pieces — see stairZ in layout.js — so they follow the turned berth exactly)
      });
      // foot kick plate (hazard) + top landing nosing
      B.push(0, 0.02, -0.02, PI); hazard(B, W - 0.1, 0.04, 0, 0, 0, { pitch: 0.3 }); B.pop();
      pbox(B, NS('paint'), K.hazY, W - 0.1, 0.02, 0.08, 0, rise + 0.005, run - 0.04);
    },
  };

  // ================================================================================================ ops building
  // Terminal Operations building. pos = centre of the back wall's inner face (z = 0 there, arena toward +Z); the spawn
  // block (x ±9, depth 8, 2.4 m + deck) sits in front of it. Dresses the block (front + side facades: glazing with
  // blinds, doors under canopies, signage, lights, AC, downpipes), the roof deck (edge trims, flag + CCTV poles, stair
  // head gates) and builds the two-storey office + the control tower behind the wall (outside the arena, collides).
  D.kelpline_ops = {
    desc: 'Terminal Operations building (pos = centre of the back wall inner face, arena toward +Z): ground-floor facades on the spawn block (x ±9, 8 deep, 2.4 m), roof-deck kit, two-storey office behind the wall and the control tower (glazed cab at 20 m) at local x = tx; KELPLINE TERMINAL channel letters.',
    params: { tx: 'tower x (-6.5)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const D0 = 8, HB = 2.4, HX = 9, panel = '#dfe3e6', trim = K.blueDk, glass = K.glass, tx = o.tx ?? -6.5;
      // ---- front facade (face z = D0): two office bays either side of the stair
      for (const sx of [-1, 1]) {
        B.push(0, 0, D0);
        const cx = sx * 6.2;
        // plinth + fascia band under the deck edge
        pbox(B, 'paint', '#9aa3ab', 5.6, 0.3, 0.06, cx, 0.15, 0.03);
        pbox(B, 'paint', trim, 5.7, 0.28, 0.08, cx, HB - 0.02, 0.04);
        // ribbon window with mullions + blinds (lit at dusk)
        const wx = cx + sx * 0.7, ww = 3.6;
        pbox(B, NS('gloss'), glass, ww, 1.1, 0.03, wx, 1.45, 0.015);
        for (let k = 0; k <= 4; k++) pbox(B, NS('paint'), trim, 0.06, 1.18, 0.06, wx - ww / 2 + (k * ww) / 4, 1.45, 0.04);
        pbox(B, 'paint', trim, ww + 0.1, 0.07, 0.08, wx, 2.04, 0.04);
        pbox(B, 'paint', '#c9cfd4', ww + 0.2, 0.06, 0.14, wx, 0.87, 0.07);
        for (let k = 0; k < 4; k++) pbox(B, NS('glow'), '#ffe2b0', ww / 4 - 0.12, 0.95, 0.01, wx - ww / 2 + (k + 0.5) * (ww / 4), 1.47, 0.031, { glow: 1.25 });
        // door by the stair, canopy, plate
        const dx = sx * 3.95;
        pbox(B, 'paint', trim, 1.1, 2.15, 0.07, dx, 1.075, 0.035);
        pbox(B, NS('paint'), '#46607a', 0.9, 2.0, 0.03, dx, 1.02, 0.07);
        pbox(B, NS('gloss'), glass, 0.5, 0.9, 0.02, dx, 1.45, 0.09);
        pbox(B, NS('metal'), K.galv, 0.05, 0.2, 0.05, dx + sx * -0.32, 1.05, 0.1);
        B.box('paint', K.white, 1.5, 0.08, 0.7, dx, 2.25, 0.35, { r: 0.02 });
        B.pop();
      }
      // ---- side facades (faces x = ±HX): window pair, fire exit, AC unit, downpipe, TERMINAL OPS sign
      for (const sx of [-1, 1]) {
        B.push(sx * HX, 0, D0 / 2, sx * HP);
        pbox(B, 'paint', '#9aa3ab', D0, 0.3, 0.06, 0, 0.15, 0.03);
        pbox(B, 'paint', trim, D0 + 0.1, 0.28, 0.08, 0, HB - 0.02, 0.04);
        for (const wx of [-2.2, 0.2]) {
          pbox(B, NS('gloss'), glass, 1.6, 1.0, 0.03, wx, 1.45, 0.015);
          pbox(B, NS('paint'), trim, 0.06, 1.06, 0.06, wx, 1.45, 0.04);
          pbox(B, 'paint', '#c9cfd4', 1.8, 0.06, 0.14, wx, 0.92, 0.07);
          pbox(B, NS('glow'), '#ffe2b0', 1.5, 0.9, 0.01, wx, 1.47, 0.031, { glow: 1.2 });
        }
        pbox(B, 'paint', '#c8573f', 1.0, 2.1, 0.06, 2.6, 1.05, 0.03);
        pbox(B, NS('metal'), K.galv, 0.7, 0.05, 0.06, 2.6, 1.0, 0.08);
        B.push(2.6, 2.25, 0.02); letters(B, 'EXIT', { h: 0.12, x: 0, y: -0.06, z: 0, c: K.white, flat: true, wt: 0.24, mat: 'glow', glow: 1.0 }); B.pop();
        pbox(B, NS('glow'), '#3fbf6a', 0.5, 0.18, 0.02, 2.6, 2.19, 0.01, { glow: 0.9 });
        B.cyl('paint', '#b9c1c8', 0.05, HB - 0.2, -3.8, (HB - 0.2) / 2, 0.08, { seg: 8 });
        B.box('paint', '#e9ecee', 1.0, 0.7, 0.4, -1.0, 0.45, 0.2, { r: 0.04 });
        B.cyl(NS('paint'), '#3a3f45', 0.24, 0.02, -1.0, 0.45, 0.41, { rx: HP, seg: 12 });
        B.pop();
      }
      // ---- roof deck kit: edge trims, CCTV + flag poles at the back corners, stair-head gate posts, a radio mast
      for (const sx of [-1, 1]) {
        pbox(B, 'paint', trim, 0.08, 0.14, D0, sx * (HX + 0.04), HB + 0.13, D0 / 2);
        // CCTV pole
        B.cyl('metal', K.galvDk, 0.06, 3.2, sx * 8.6, HB + 0.2 + 1.6, 0.5, { seg: 8 });
        B.col(sx * 8.6 - 0.07, HB + 0.2, 0.43, sx * 8.6 + 0.07, HB + 3.45, 0.57, { roof: true });
        B.box('paint', K.white, 0.18, 0.16, 0.42, sx * 8.6, HB + 3.35, 0.72, { r: 0.03, rx: 0.3 });
        pbox(B, NS('gloss'), K.ink, 0.1, 0.08, 0.02, sx * 8.6, HB + 3.3, 0.94, { rx: 0.3 });
      }
      // ---- KELPLINE TERMINAL channel letters on the parapets (face z = D0 + 0.6 − 0.6, parapets from x ±3.4 to ±9)
      B.push(0, HB + 0.2, D0 + 0.001);
      letters(B, 'KELPLINE', { h: 0.46, x: -6.2, y: 0.12, z: 0, c: K.blueDk, dep: 0.06, wt: 0.2, track: 0.14, lit: 0.9, litC: '#dfe9ff' });
      letters(B, 'TERMINAL', { h: 0.46, x: 6.2, y: 0.12, z: 0, c: K.blueDk, dep: 0.06, wt: 0.2, track: 0.14, lit: 0.9, litC: '#dfe9ff' });
      B.pop();
      // ================= behind the wall: two-storey office (z −0.6 … −11), roof kit, control tower
      const BZ0 = -0.6, BZ1 = -11, OH = 8.2;
      B.box('paint', panel, 26, OH, BZ0 - BZ1, 0, OH / 2, (BZ0 + BZ1) / 2, { r: 0.12 });
      B.box('paint', trim, 26.3, 0.35, BZ0 - BZ1 + 0.3, 0, OH + 0.1, (BZ0 + BZ1) / 2, { r: 0.05 });
      // storey above the wall: ribbon windows facing the arena, panel joints
      for (let k = 0; k < 10; k++) {
        const wx = -11.7 + k * 2.6;
        pbox(B, NS('gloss'), glass, 2.2, 1.4, 0.03, wx, 6.3, BZ0 + 0.015);
        pbox(B, NS('glow'), '#ffe2b0', 2.0, 1.25, 0.01, wx, 6.3, BZ0 + 0.032, { glow: 1.15 });
        pbox(B, NS('paint'), trim, 0.1, 1.5, 0.05, wx + 1.3, 6.3, BZ0 + 0.03);
      }
      pbox(B, 'paint', trim, 26, 0.14, 0.12, 0, 5.52, BZ0 + 0.06);
      pbox(B, 'paint', trim, 26, 0.14, 0.12, 0, 7.1, BZ0 + 0.06);
      B.push(0, 7.45, BZ0 + 0.02);
      letters(B, 'TERMINAL OPERATIONS', { h: 0.5, x: 0, y: 0, z: 0, c: K.blueDk, dep: 0.05, wt: 0.2, track: 0.14 });
      B.pop();
      // roof kit: AC units, vent stacks, a satellite dish
      for (const [ax, az] of [[5, -4], [8, -7], [-2, -8]]) { B.box('paint', '#e6e8ea', 1.8, 1.0, 1.2, ax, OH + 0.75, az, { r: 0.05 }); B.cyl(NS('paint'), '#3a3f45', 0.4, 0.04, ax, OH + 1.26, az, { seg: 14 }); }
      sub(B, 'dish', 10.5, OH + 0.25, -3, -0.6, { variant: 0 });
      // control tower (collides): shaft, gallery, glazed cab with sloped glass, roof + antenna mast
      const TZ = -5.2, TH = 18.5;
      B.cyl('paint', panel, 1.9, TH - OH, tx, OH + (TH - OH) / 2, TZ, { seg: 16 });
      for (let k = 0; k < 4; k++) pbox(B, NS('gloss'), glass, 0.5, 1.2, 0.05, tx + 1.88, OH + 2.2 + k * 2.3, TZ, { ry: HP });
      B.cyl('paint', trim, 2.3, 0.3, tx, TH, TZ, { seg: 16 });
      B.lathe('gloss', glass, [[2.25, TH + 0.15], [2.9, TH + 0.35], [3.1, TH + 2.6], [2.95, TH + 2.7]], tx, 0, TZ, { seg: 16 });
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; rodT(B, NS('paint'), K.white, [tx + Math.cos(a) * 2.3, TH + 0.2, TZ + Math.sin(a) * 2.3], [tx + Math.cos(a) * 3.12, TH + 2.62, TZ + Math.sin(a) * 3.12], 0.04, 4); }
      B.lathe('glow', '#ffe8c0', [[2.2, TH + 1.1], [2.6, TH + 1.1], [2.6, TH + 1.9], [2.2, TH + 1.9]], tx, 0, TZ, { seg: 16, glow: 0.45 });
      B.lathe('paint', K.white, [[3.25, TH + 2.6], [3.3, TH + 2.9], [2.2, TH + 3.2], [0.4, TH + 3.4], [0, TH + 3.4]], tx, 0, TZ, { seg: 16 });
      B.cyl('metal', K.galvDk, 0.08, 4.5, tx, TH + 5.6, TZ, { seg: 6 });
      for (const [h, w] of [[TH + 4.6, 1.2], [TH + 6.0, 0.8]]) pbox(B, NS('metal'), K.galvDk, w, 0.05, 0.05, tx, h, TZ);
      B.blink('#ff4030', tx, TH + 8.0, TZ, { size: 0.12, rate: 0.45, lo: 0.3, hi: 6 });
      B.push(tx, TH + 2.95, TZ + 3.05);
      letters(B, 'K4', { h: 0.35, x: 0, y: 0, z: 0, c: K.blueDk, flat: true, wt: 0.22 });
      B.pop();
      B.col(-13, 0, BZ1, 13, OH + 0.3, BZ0, { roof: true });
      B.col(tx - 2, OH, TZ - 2, tx + 2, TH, TZ + 2, { roof: true });
    },
  };

  // ================================================================================================ reefer rack
  // Plug-in rack over the reefer alley (pos = centre of the alley at ground, local Z along the alley, length L, width W
  // between the reefer rows): column pairs every ~6 m at the alley edges (colliders), channel stringers + cross members
  // under the grate catwalk (catwalk top 2.6), top frame at 5.7 with cable trays, CEE socket boxes + plugged cables
  // to the reefers, alley lights under the catwalk, floods on the top frame, R2 end plates.
  // Tower Command's build (layout.js AISLE) passes gap: [z0, z1] where the catwalk is cut for the tower's aisle (its
  // stringers stop, hazard-striped ends), bare: [sx, z] — no reefer row on side sx below z (no cables to plug in) — and
  // landing: [z0, z1], the grate landing at row 1's stair top off the −X side (the grate is a level block).
  D.kelpline_reeferrack = {
    desc: 'Reefer plug-in rack over an alley (pos = alley centre at ground, local Z along it): columns (colliders), catwalk stringers + cross members, top frame + cable trays, socket boxes + cables, lights, end plates.',
    params: { length: 'm (18.35)', width: 'alley m (2.0)', name: 'end plate (R2)', gap: '[z0, z1] catwalk cut', bare: '[sx, z] no cables on side sx below z', landing: '[z0, z1] stair landing off −X' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 18.35, W = o.width ?? 2.0, YC = 2.6, YT = 5.7, bl = K.blue, bd = K.blueDk;
      const n = Math.max(2, Math.round(L / 6)) + 1, cz = (i) => -L / 2 + 0.15 + ((L - 0.3) * i) / (n - 1);
      const gap = o.gap, inGap = (zz) => !!gap && zz > gap[0] - 0.05 && zz < gap[1] + 0.05;
      for (let i = 0; i < n; i++) {
        const z = cz(i);
        for (const sx of [-1, 1]) {
          const x = sx * (W / 2 - 0.11);
          // H-column: web + flanges
          pbox(B, 'paint', bl, 0.2, YT, 0.05, x, YT / 2, z);
          for (const fz of [-0.09, 0.09]) pbox(B, 'paint', bd, 0.2, YT, 0.03, x, YT / 2, z + fz);
          pbox(B, NS('metal'), K.galvDk, 0.34, 0.03, 0.34, x, 0.015, z);
          B.col(x - 0.11, 0, z - 0.11, x + 0.11, YT, z + 0.11, { roof: true });
          // CEE socket box on the column at catwalk level + one at ground level, plugged cables drooping onto the reefers
          for (const yy of [YC + 1.05, 1.15]) {
            B.push(x + sx * 0.12, yy, z, sx * HP);
            B.box('paint', '#e8e4d8', 0.34, 0.46, 0.14, 0, 0, 0.07, { r: 0.03 });
            for (const px of [-0.08, 0.08]) { B.cyl(NS('paint'), '#e2b531', 0.045, 0.08, px, -0.08, 0.16, { rx: HP, seg: 8 }); }
            pbox(B, NS('glow'), '#8fe39a', 0.05, 0.03, 0.01, 0.1, 0.16, 0.145, { glow: 1.4 });
            B.pop();
          }
          if (o.bare && sx === o.bare[0] && z < o.bare[1]) continue;
          const f = inGap(z + 0.7) ? -1 : 1;   // (a cable that would hang over the aisle droops the other way, onto the box)
          B.tube(NS('paint'), '#26282c', [P3(x + sx * 0.3, YC + 0.9, z), P3(x + sx * 0.45, YC + 0.35, z + f * 0.2), P3(x + sx * 0.8, YC + 0.06, z + f * 0.5), P3(x + sx * 1.6, YC + 0.03, z + f * 0.7)], 0.025, { radial: 5 });
        }
        // top cross beam + catwalk cross member + lamp under the catwalk
        pbox(B, 'paint', bl, W, 0.22, 0.16, 0, YT - 0.11, z);
        pbox(B, NS('paint'), bd, W - 0.2, 0.14, 0.1, 0, YC - 0.22, z);
        const lz = inGap(z + 0.4) ? z - 0.4 : z + 0.4;
        B.box(NS('paint'), K.charcoal, 0.5, 0.08, 0.18, 0, YC - 0.34, lz, { r: 0.02 });
        pbox(B, NS('glow'), K.lampCool, 0.44, 0.012, 0.12, 0, YC - 0.385, lz, { glow: 3.2 });
      }
      // catwalk stringers along both edges + intermediate cross members every 1.2 m
      const spans = gap ? [[-L / 2, gap[0]], [gap[1], L / 2]] : [[-L / 2, L / 2]];
      for (const sx of [-1, 1]) {
        for (const [a, b] of spans) pbox(B, 'paint', bd, 0.08, 0.22, b - a, sx * (W / 2 - 0.05), YC - 0.26, (a + b) / 2);
        for (const [a, b] of spans) pbox(B, NS('paint'), K.hazY, 0.085, 0.05, b - a, sx * (W / 2 - 0.05), YC - 0.13, (a + b) / 2);
        // top longitudinal beams + cable trays
        pbox(B, 'paint', bl, 0.16, 0.26, L, sx * (W / 2 - 0.11), YT - 0.13, 0);
        B.push(sx * (W / 2 - 0.45), YT + 0.1, 0);
        pbox(B, NS('metal'), K.galv, 0.5, 0.03, L, 0, 0, 0);
        for (const ex of [-0.24, 0.24]) pbox(B, NS('metal'), K.galv, 0.02, 0.12, L, ex, 0.06, 0);
        for (let k = 0; k < 4; k++) B.cyl(NS('paint'), ['#26282c', '#3a3d44', '#2e4a6a', '#26282c'][k], 0.03, L, -0.15 + k * 0.1, 0.045, 0, { rx: HP, seg: 5 });
        B.pop();
      }
      for (let z = -L / 2 + 0.6; z < L / 2 - 0.3; z += 1.2) if (!inGap(z)) pbox(B, NS('paint'), bd, W - 0.2, 0.08, 0.06, 0, YC - 0.2, z);
      // the catwalk's cut ends: hazard stripes on the end faces, a cross channel under an end that's clear of a column pair
      if (gap) for (const [ze, f] of [[gap[0], 1], [gap[1], -1]]) {
        B.push(0, YC - 0.075, ze, f > 0 ? 0 : PI); hazard(B, W - 0.04, 0.13, 0, 0, 0.001, { pitch: 0.24 }); B.pop();
        let near = false;
        for (let i = 0; i < n; i++) if (Math.abs(cz(i) - ze) < 0.3) near = true;
        if (!near) pbox(B, NS('paint'), bd, W - 0.2, 0.14, 0.1, 0, YC - 0.22, ze - f * 0.06);
      }
      // row 1's stair landing off the −X side: edge channels under its open sides, a post at its free corner (collider),
      // hazard stripes along its open edge
      if (o.landing) {
        const [z0, z1] = o.landing, x0 = -W / 2 - 2.44, xm = (x0 - W / 2) / 2;
        pbox(B, 'paint', bd, 2.44, 0.22, 0.08, xm, YC - 0.26, z0 + 0.04);
        pbox(B, 'paint', bd, 0.08, 0.22, z1 - z0, x0 + 0.04, YC - 0.26, (z0 + z1) / 2);
        B.push(xm, YC - 0.075, z0, PI); hazard(B, 2.4, 0.13, 0, 0, 0.001, { pitch: 0.24 }); B.pop();
        pbox(B, 'paint', bl, 0.14, YC - 0.15, 0.14, x0 + 0.09, (YC - 0.15) / 2, z0 + 0.09);
        pbox(B, NS('metal'), K.galvDk, 0.26, 0.03, 0.26, x0 + 0.09, 0.015, z0 + 0.09);
        B.col(x0 + 0.02, 0, z0 + 0.02, x0 + 0.16, YC - 0.15, z0 + 0.16);
      }
      // floods on the top frame over the rows, end plates
      for (let i = 0; i < n; i += 2) for (const sx of [-1, 1]) flood(B, sx * 0.4, YT + 0.35, cz(i), { rx: 0, glow: 1.5 });
      for (const sz of [-1, 1]) {
        B.push(0, YT - 0.6, sz * (L / 2 + 0.02), sz > 0 ? 0 : PI);
        B.box('paint', K.white, 1.4, 0.6, 0.05, 0, 0, 0, { r: 0.03 });
        letters(B, 'REEFER ' + (o.name ?? 'R2'), { h: 0.2, x: 0, y: -0.1, z: 0.03, c: bd, flat: true, wt: 0.22 });
        B.pop();
      }
    },
  };

  // ================================================================================================ hatch covers
  // Dressing on a hatch-cover block (pos = bottom centre; w along X, d along Z, h tall): vertical web stiffeners on the
  // sides, bottom flange, top gasket channel, container-socket plates (flush), pad-eyes at the corners, hatch number
  // + NO STANDING stencils, hazard stripes on the corners, cleats along the lower edge. All flush (≤ 4 cm).
  D.kelpline_hatch = {
    desc: 'Hatch-cover dressing (pos = bottom centre, w × d × h block): side stiffeners, flanges, gasket channel, corner pad-eyes, socket plates, hatch number stencils, hazard corners, cleats.',
    params: { w: 'x size', d: 'z size', h: 'height', num: 'hatch number', c: 'paint' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const w = o.w ?? 10.8, d = o.d ?? 6, h = o.h ?? 1.2, c = o.c ?? K.blue, dk = shade(c, 0.78), y0 = o.y0 ?? 0;
      const side = (len, depth, ry, label) => {
        B.push(Math.sin(ry) * depth / 2, y0, Math.cos(ry) * depth / 2, ry);
        pbox(B, 'paint', dk, len + 0.04, 0.1, 0.04, 0, 0.05, 0.02);
        pbox(B, NS('paint'), K.rubber, len - 0.1, 0.06, 0.035, 0, h - 0.06, 0.0175);
        for (let x = -len / 2 + 0.4; x < len / 2 - 0.2; x += 0.8) pbox(B, NS('paint'), shade(c, 0.9), 0.06, h - 0.2, 0.03, x, h / 2 - 0.02, 0.015);
        for (let x = -len / 2 + 1.0; x < len / 2 - 0.6; x += 2.2) { B.box(NS('metal'), K.greyDk, 0.14, 0.18, 0.08, x, 0.24, 0.04, { r: 0.02 }); }
        if (label) letters(B, label, { h: Math.min(0.5, h * 0.4), x: 0, y: h * 0.32, z: 0.032, c: K.white, flat: true, wt: 0.2, track: 0.14 });
        // (hazard corner markers: narrow, so ink on the side shows — the side is the inkable block face)
        for (const sx of [-1, 1]) { B.push(sx * (len / 2 - 0.13), h * 0.5, 0.034); hazard(B, 0.22, h - 0.25, 0, 0, 0, { pitch: 0.22 }); B.pop(); }
        B.pop();
      };
      side(w, d, 0, o.num ? 'NO. ' + o.num : null); side(w, d, PI, o.num ? 'NO. ' + o.num : null);
      side(d, w, HP, null); side(d, w, -HP, null);
      // corner pad-eyes + flush socket plates on top
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        B.push(sx * (w / 2 - 0.25), y0 + h, sz * (d / 2 - 0.25));
        pbox(B, NS('metal'), K.greyDk, 0.2, 0.02, 0.14, 0, 0.01, 0);
        B.tor(NS('metal'), K.greyDk, 0.07, 0.022, 0, 0.07, 0, { rs: 4, ts: 10 });
        B.pop();
      }
    },
  };

  // ================================================================================================ truck gate
  // Gate 4 (pos = centre of the gate area at ground, arena toward +Z; lanes run along Z): booth cabins on the two
  // islands (x ±3.1 from pos, colliders), canopy on four columns over all lanes (5.4 m, not reachable), GATE 4 fascia,
  // lane signals, OCR camera heads, raised boom barriers, height gauge, sliding gate leaves on the back wall.
  D.kelpline_gate = {
    desc: 'Truck gate (pos = centre of the gate area, arena toward +Z): two booth cabins on islands, canopy on columns with GATE 4 fascia, lane signals + OCR cameras, raised boom barriers, sliding gate on the back wall.',
    params: { islands: '[x offsets] (-3.1, 3.1)', back: 'z of the back wall face (-5)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const isl = o.islands ?? [-3.1, 3.1], zb = o.back ?? -5, bl = K.blue, bd = K.blueDk, YC = 5.4;
      for (const ix of isl) {
        // booth cabin (1.5 × 2.1 × 2.5) on the island, windows all round, door on the +X side, AC on the back
        const bz = -0.8;
        B.box('paint', '#e9ecee', 1.5, 2.5, 2.2, ix, 0.18 + 1.25, bz, { r: 0.06 });
        B.box('paint', bd, 1.62, 0.18, 2.32, ix, 0.18 + 2.56, bz, { r: 0.04 });
        for (const sx of [-1, 1]) pbox(B, NS('gloss'), K.glass, 0.03, 1.0, 1.6, ix + sx * 0.755, 1.75, bz);
        pbox(B, NS('gloss'), K.glass, 1.2, 1.0, 0.03, ix, 1.75, bz + 1.105);
        pbox(B, NS('glow'), '#ffe2b0', 1.1, 0.25, 0.01, ix, 2.1, bz + 1.12, { glow: 0.7 });
        B.box('paint', '#e6e8ea', 0.8, 0.5, 0.35, ix, 2.1, bz - 1.25, { r: 0.04 });
        colBox(B, ix, 0, bz, 1.6, 2.9, 2.3, { roof: true });
        // kerb-end bollards (yellow) at both island noses
        for (const ez of [-2.9, 2.9]) { B.cyl('paint', K.hazY, 0.13, 1.0, ix, 0.68, ez, { seg: 10 }); B.cyl(NS('paint'), K.ink, 0.135, 0.12, ix, 0.8, ez, { seg: 10 }); colBox(B, ix, 0, ez, 0.3, 1.18, 0.3); }
        // canopy columns
        for (const cz2 of [-2.4, 1.6]) { B.box('paint', bl, 0.3, YC, 0.3, ix, YC / 2 + 0.18, cz2, { r: 0.03 }); colBox(B, ix, 0, cz2, 0.32, YC, 0.32, { roof: true }); }
        // raised boom barrier at the arena end of the island
        B.push(ix + 0.45, 0.18, 2.4);
        B.box('paint', K.white, 0.36, 1.05, 0.36, 0, 0.525, 0, { r: 0.04 });
        B.col(ix + 0.27, 0.18, 2.22, ix + 0.63, 1.23, 2.58, { roof: true });   // (B.col takes the prop's own frame, not the pushed one)
        B.push(0.05, 1.0, 0, 0, 0, 1.35);
        for (let k = 0; k < 8; k++) pbox(B, NS('paint'), k % 2 ? K.white : K.red, 0.42, 0.08, 0.06, 0.25 + k * 0.42, 0, 0);
        B.pop();
        B.pop();
        // lane signal (red / green) + OCR camera heads hanging from the canopy
        B.push(ix, YC - 0.6, 1.8);
        B.box(NS('paint'), K.ink, 0.35, 0.7, 0.2, 0, 0, 0, { r: 0.03 });
        B.sph(NS('glow'), '#ff5a3c', 0.08, 0, 0.15, 0.1, { ws: 8, hs: 6, glow: 1.3 });
        B.sph(NS('glow'), '#63e08a', 0.08, 0, -0.15, 0.1, { ws: 8, hs: 6, glow: 1.6 });
        B.pop();
        for (const sx of [-1, 1]) { B.box(NS('paint'), K.white, 0.18, 0.16, 0.4, ix + sx * 1.3, YC - 0.3, 1.4, { r: 0.03, rx: 0.35 }); }
      }
      // canopy slab + fascia with GATE 4 letters (both faces), soffit lights, height gauge bar
      const cw = 14.0, cd = 5.0, cc = -0.4;
      B.box('paint', '#eceff1', cw, 0.5, cd, 0, YC + 0.18 + 0.25, cc, { r: 0.06 });
      B.box('paint', bd, cw + 0.1, 0.18, cd + 0.1, 0, YC + 0.18 + 0.52, cc, { r: 0.03 });
      for (const sz of [-1, 1]) {
        B.push(0, YC + 0.18, cc + sz * (cd / 2 + 0.01), sz > 0 ? 0 : PI);
        pbox(B, 'paint', bd, cw, 0.5, 0.04, 0, 0.25, 0);
        letters(B, 'GATE 4', { h: 0.34, x: -4.6, y: 0.08, z: 0.03, c: K.white, flat: true, wt: 0.2, track: 0.16, mat: 'glow', glow: 0.9 });
        letters(B, 'KELPLINE TERMINAL', { h: 0.2, x: 3.4, y: 0.15, z: 0.03, c: '#cfd9e6', flat: true, wt: 0.22, track: 0.14 });
        B.pop();
      }
      for (let x = -6; x <= 6; x += 3) pbox(B, NS('glow'), K.lampCool, 1.2, 0.02, 0.3, x, YC + 0.17, cc, { glow: 3.0 });
      // sliding gate leaves on the back wall (face at z = zb) + a gate motor
      B.push(0, 0, zb + 0.02);
      for (let x = -6.8; x < 6.9; x += 0.22) pbox(B, NS('metal'), K.galvDk, 0.05, 2.3, 0.05, x, 1.35, 0.06);
      for (const yy of [0.25, 1.35, 2.45]) pbox(B, 'metal', K.galvDk, 13.8, 0.08, 0.08, 0, yy, 0.08);
      B.box('paint', K.hazY, 0.6, 0.8, 0.4, 7.4, 0.4, 0.2, { r: 0.04 });
      B.pop();
    },
  };

  // ================================================================================================ vehicles
  const tyre = (B, x, y, z, R, w) => {
    B.lathe('paint', '#25272c', TIRE.map(([r, yy]) => [r * (R / 0.33), yy * (w / 0.2)]), x, y, z, { seg: 12, closed: true, rz: HP });
    B.cyl('metal', K.greyDk, R * 0.55, w * 0.92, x, y, z, { rz: HP, seg: 10 });
    B.cyl(NS('metal'), K.galv, R * 0.22, w * 1.02, x, y, z, { rz: HP, seg: 8 });
  };
  // skeletal trailer chassis under a level box (the box sits at deck height) — pos = centre under the box, local Z =
  // length, kingpin end at +Z. Colliders: rear bogie + landing legs (squids can slip under the middle).
  D.kelpline_chassis = {
    desc: 'Skeletal container chassis (pos = centre on the ground, local Z = length, kingpin end +Z, deck at 1.35): main beams, cross members, twistlock bolsters, landing legs, tandem rear bogie with dual wheels, lights, mudflaps. Colliders: bogie + legs.',
    params: { len: '20 | 40', deck: 'm (1.35)', c: 'frame paint' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = (o.len ?? 20) === 20 ? 6.3 : 12.4, DK = o.deck ?? 1.35, c = o.c ?? '#3a3f47';
      for (const sx of [-0.48, 0.48]) { pbox(B, 'paint', c, 0.14, 0.34, L, sx, DK - 0.17, 0); pbox(B, NS('paint'), c, 0.22, 0.03, L, sx, DK - 0.33, 0); }
      for (let z = -L / 2 + 0.3; z < L / 2; z += 1.1) pbox(B, NS('paint'), c, 2.3, 0.12, 0.1, 0, DK - 0.12, z);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { pbox(B, 'paint', c, 0.3, 0.2, 0.3, sx * 1.07, DK - 0.1, sz * (L / 2 - 0.15)); }
      // gooseneck + kingpin at the front
      pbox(B, 'paint', c, 1.0, 0.2, 1.2, 0, DK - 0.3, L / 2 - 0.6);
      // landing legs
      for (const sx of [-0.55, 0.55]) { pbox(B, 'paint', c, 0.12, DK - 0.3, 0.12, sx, (DK - 0.3) / 2 + 0.05, L / 2 - 2.0); pbox(B, NS('metal'), K.greyDk, 0.3, 0.05, 0.3, sx, 0.025, L / 2 - 2.0); }
      B.col(-0.65, 0, L / 2 - 2.15, 0.65, DK - 0.3, L / 2 - 1.85);
      // tandem bogie: two axles, dual wheels, mudflaps, rear bumper + lights
      const bz = -L / 2 + 1.6;
      for (const az of [bz - 0.7, bz + 0.7]) {
        B.cyl(NS('metal'), K.charcoal, 0.08, 2.0, 0, 0.5, az, { rz: HP, seg: 8 });
        for (const sx of [-1, 1]) for (const dx of [0.66, 0.96]) tyre(B, sx * dx, 0.5, az, 0.5, 0.26);
      }
      pbox(B, 'paint', c, 2.3, 0.2, 2.2, 0, DK - 0.42, bz);
      for (const sx of [-1, 1]) pbox(B, NS('paint'), K.rubber, 0.6, 0.5, 0.02, sx * 0.8, 0.5, bz - 1.35);
      B.col(-1.2, 0, bz - 1.25, 1.2, DK - 0.35, bz + 1.25);
      pbox(B, 'paint', K.hazY, 2.2, 0.14, 0.1, 0, 0.62, -L / 2 + 0.05);
      for (const sx of [-1, 1]) pbox(B, NS('glow'), '#ff3a2a', 0.2, 0.08, 0.02, sx * 0.9, 0.78, -L / 2 + 0.02, { glow: 1.2 });
    },
  };
  // terminal tractor (yard tug): offset one-man cab, short hood, fifth-wheel ramp, big wheels, beacon. pos = centre,
  // local +Z = front. Collider: the whole body.
  D.kelpline_tractor = {
    desc: 'Terminal tractor (yard tug): offset cab, short hood, fifth-wheel ramp at the rear, 4 big wheels, amber beacon, exhaust stack. pos = ground centre, front +Z. Collider: body.',
    params: { c: 'body paint' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const c = o.c ?? K.crane, dk = shade(c, 0.78);
      B.box('paint', K.charcoal, 2.3, 0.5, 5.2, 0, 0.75, 0, { r: 0.05 });
      for (const [az, R] of [[1.55, 0.55], [-1.5, 0.55]]) for (const sx of [-1, 1]) tyre(B, sx * 1.05, R, az, R, sx > 0 ? 0.4 : 0.4);
      // fifth-wheel ramp + plate at the rear
      B.push(0, 1.05, -1.4, 0, 0.18); pbox(B, 'paint', K.greyDk, 1.9, 0.12, 2.0, 0, 0, 0); B.pop();
      B.cyl('metal', K.greyDk, 0.6, 0.12, 0, 1.22, -1.4, { seg: 16 });
      // hood + cab (offset to −X), glazing, roof beacon, exhaust
      B.box('paint', c, 2.2, 0.9, 1.6, 0, 1.45, 1.75, { r: 0.08 });
      pbox(B, NS('paint'), K.ink, 1.4, 0.4, 0.04, 0, 1.4, 2.56);
      for (const sx of [-1, 1]) pbox(B, NS('glow'), '#fff1cc', 0.22, 0.14, 0.02, sx * 0.8, 1.55, 2.57, { glow: 1.1 });
      B.box('paint', c, 1.3, 1.9, 1.9, -0.45, 1.0 + 0.95, 0.5, { r: 0.08 });
      pbox(B, NS('gloss'), K.glassLt, 1.1, 0.9, 0.03, -0.45, 2.3, 1.46);
      pbox(B, NS('gloss'), K.glassLt, 0.03, 0.8, 1.4, -1.11, 2.3, 0.5);
      pbox(B, NS('gloss'), K.glassLt, 0.03, 0.8, 1.4, 0.21, 2.3, 0.5);
      pbox(B, 'paint', dk, 1.4, 0.12, 2.0, -0.45, 2.96, 0.5);
      B.cyl('paint', '#e8962f', 0.1, 0.18, -0.45, 3.1, 0.5, { seg: 10 });
      B.blink('#ffa030', -0.45, 3.14, 0.5, { size: 0.09, rate: 1.2, lo: 0.3, hi: 5 });
      B.cyl('metal', K.charcoal, 0.07, 1.6, 0.75, 2.4, 0.2, { seg: 8 });
      pbox(B, 'paint', K.hazY, 2.2, 0.16, 0.12, 0, 0.72, 2.62);
      B.col(-1.2, 0, -2.6, 1.2, 1.3, 2.6);
      B.col(-1.15, 1.3, -0.5, 0.25, 3.0, 1.5, { roof: true });
      B.col(-1.1, 1.3, 0.95, 1.1, 1.9, 2.6);
    },
  };
  // reach stacker: big front drive wheels, counterweight at the rear, cab, telescopic boom rising from the rear over the
  // cab with the spreader at the tip (boom raised, spreader empty). pos = centre, front +Z. Collider: body + cab (roofs);
  // the boom arm + spreader are a perch.
  D.kelpline_reachstacker = {
    desc: 'Reach stacker (front +Z): chassis with big front drive wheels + rear steer wheels, counterweight, side cab, telescopic boom raised over the cab with a rotating spreader at the tip, beacons, KELPLINE branding. Colliders: body + cab (off-limits roofs); the boom arm, tip head and spreader are a perch (walkable, never inkable).',
    params: { c: 'paint (crane yellow)', boom: 'boom angle rad (0.5)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const c = o.c ?? K.crane, dk = shade(c, 0.75), ang = o.boom ?? 0.5;
      B.box('paint', c, 3.4, 1.4, 7.6, 0, 1.25, 0, { r: 0.1 });
      B.box('paint', dk, 3.6, 1.2, 1.5, 0, 1.4, -3.6, { r: 0.12 });                      // counterweight
      for (const sx of [-1, 1]) {
        tyre(B, sx * 1.35, 0.85, 2.6, 0.85, 0.55); tyre(B, sx * 1.55, 0.85, 2.6, 0.85, 0.55);
        tyre(B, sx * 1.4, 0.75, -2.8, 0.75, 0.5);
      }
      // cab on the left, glazed
      B.box('paint', c, 1.5, 2.1, 2.2, -0.9, 3.0, 0.4, { r: 0.08 });
      pbox(B, NS('gloss'), K.glassLt, 1.3, 1.2, 0.03, -0.9, 3.25, 1.51);
      pbox(B, NS('gloss'), K.glassLt, 0.03, 1.1, 1.8, -1.66, 3.25, 0.4);
      B.cyl('paint', '#e8962f', 0.1, 0.16, -0.9, 4.13, 0.4, { seg: 10 });
      B.blink('#ffa030', -0.9, 4.16, 0.4, { size: 0.09, rate: 1.1, phase: 0.7, lo: 0.3, hi: 5 });
      // boom: pivot at the rear top, rising forward over the cab; telescopic inner section; spreader at the tip
      const pz = -2.6, py = 2.2, Lb = 9.2;
      B.push(0.7, py, pz, 0, -ang);
      B.box('paint', c, 0.9, 0.9, Lb, 0, 0, Lb / 2, { r: 0.06 });
      B.box('paint', dk, 0.7, 0.7, 3.0, 0, 0, Lb + 1.3, { r: 0.05 });
      B.push(0, -0.1, Lb / 3); letters(B, 'KELPLINE', { h: 0.34, x: 0, y: 0, z: 0, c: K.ink, flat: true, wt: 0.22 }); B.pop();
      B.pop();
      // lift cylinder
      rodT(B, 'metal', K.galv, [0.7, 1.9, 0.2], [0.7, py + Math.sin(ang) * 4.2, pz + Math.cos(ang) * 4.2], 0.16, 8);
      const tipY = py + Math.sin(ang) * (Lb + 2.8), tipZ = pz + Math.cos(ang) * (Lb + 2.8);
      B.box('paint', dk, 0.8, 0.9, 0.8, 0.7, tipY - 0.6, tipZ, { r: 0.05 });
      B.box('paint', c, 2.4, 0.4, 6.1, 0.7, tipY - 1.25, tipZ, { r: 0.05 });
      for (const sz of [-1, 1]) for (const sx of [-1, 1]) B.box(NS('paint'), K.ink, 0.25, 0.35, 0.25, 0.7 + sx * 1.1, tipY - 1.55, tipZ + sz * 2.95, { r: 0.03 });
      B.col(-1.75, 0, -4.4, 1.75, 1.95, 3.8, { roof: true });
      B.col(-1.7, 1.95, -0.7, -0.1, 4.1, 1.55, { roof: true });
      // the boom arm is a PERCH (walkable, never inkable — a Zipline / special gets you up there): stepped along its top
      // line (0.3 m steps), then the telescopic section, the tip head and the
      // spreader out over the Landing — walk out to the end and drop off. Body + cab keep their off-limits roofs.
      {
        const sa = Math.sin(ang), ca = Math.cos(ang), P = { perch: true };
        const at = (d, h) => [py + d * sa + h * ca, pz + d * ca - h * sa];   // (y, z) on the boom's top line, d out
        // (step tops 10 cm under the line at their middle: the flat foot probe rides the step ahead, so the feet end up on
        //  the sloped steel within a few cm)
        const seg = (d0, d1, h) => { const [y0, z0] = at(d0, h), [y1, z1] = at(d1, h), yt = (y0 + y1) / 2 - 0.1; B.col(0.7 - h, yt - 0.6, z0, 0.7 + h, yt, z1, P); };
        for (let d = 0; d < Lb - 0.01; d += 0.3) seg(d, Math.min(Lb, d + 0.3), 0.45);
        for (let d = Lb; d < Lb + 2.79; d += 0.3) seg(d, Math.min(Lb + 2.8, d + 0.3), 0.35);
        B.col(0.3, tipY - 1.05, tipZ - 0.4, 1.1, tipY - 0.15, tipZ + 0.4, P);
        B.col(-0.5, tipY - 1.45, tipZ - 3.05, 1.9, tipY - 1.05, tipZ + 3.05, P);
      }
    },
  };
  // straddle carrier (1-over-2): two sills with four wheels each (colliders), two legs per side, top frame + engine
  // housing, cab on the front-left top, hoist ropes + spreader resting on the box it straddles. pos = centre on the
  // ground, local Z = length, front +Z; inner clearance 3.1 m.
  D.kelpline_straddle = {
    desc: 'Straddle carrier (front +Z): sills with 4 wheels each side (colliders, 1.3 m cover), two legs per side, top frame at 9 m with engine housing, front cab, hoist ropes and spreader resting on the box beneath (the box is a level block). Top frame, engine housing, cab roof and the spreader are a perch (walkable, never inkable).',
    params: { c: 'paint', spread: 'spreader y (2.6)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const c = o.c ?? K.blue, dk = shade(c, 0.75), HI = 1.55, SW = 0.62, LZ = 8.4, YT = 9.0, sy = o.spread ?? 2.6;
      for (const sx of [-1, 1]) {
        const x = sx * (HI + SW / 2);
        B.box('paint', c, SW, 0.8, LZ, x, 0.95, 0, { r: 0.06 });
        pbox(B, NS('paint'), K.hazY, SW + 0.02, 0.12, 0.6, x, 1.0, LZ / 2 - 0.3);
        pbox(B, NS('paint'), K.hazY, SW + 0.02, 0.12, 0.6, x, 1.0, -LZ / 2 + 0.3);
        for (const wz of [-3.1, -1.1, 1.1, 3.1]) tyre(B, x, 0.55, wz, 0.55, 0.45);
        B.col(x - SW / 2, 0, -LZ / 2, x + SW / 2, 1.35, LZ / 2);
        // legs: tapered, from the sill up to the top frame
        for (const lz of [-3.2, 3.2]) {
          B.add('paint', frustumGeo(0.6, 0.9, 0.45, 0.6, YT - 1.35), c, x, 1.35, lz, {});
          B.col(x - 0.3, 1.35, lz - 0.45, x + 0.3, YT, lz + 0.45, { roof: true });
        }
        B.box('paint', c, 0.5, 0.8, LZ - 1.2, x, YT + 0.4, 0, { r: 0.05 });
        pbox(B, NS('paint'), K.white, 0.02, 0.3, 3.0, x + sx * 0.26, YT + 0.4, 0);
        B.push(x + sx * 0.265, YT + 0.28, 0, sx * HP); letters(B, 'S12', { h: 0.34, x: 0, y: 0, z: 0, c: K.white, flat: true, wt: 0.22 }); B.pop();
      }
      for (const lz of [-3.2, 3.2]) B.box('paint', dk, 2 * (HI + SW), 0.7, 0.6, 0, YT + 0.35, lz, { r: 0.05 });
      // engine housing on top (rear), cab (front, −X side), exhaust, beacon
      B.box('paint', c, 2.6, 1.3, 2.6, 0.3, YT + 1.35, -1.9, { r: 0.08 });
      for (let k = 0; k < 5; k++) pbox(B, NS('paint'), dk, 0.04, 0.8, 2.3, 1.62, YT + 1.35, -2.5 + k * 0.3);
      B.cyl('metal', K.charcoal, 0.08, 1.2, 1.2, YT + 2.5, -2.6, { seg: 8 });
      B.box('paint', c, 1.4, 1.8, 1.6, -(HI + SW / 2) + 0.2, YT - 0.4, LZ / 2 - 1.2, { r: 0.08 });
      pbox(B, NS('gloss'), K.glassLt, 1.2, 1.0, 0.03, -(HI + SW / 2) + 0.2, YT - 0.25, LZ / 2 - 0.39);
      pbox(B, NS('gloss'), K.glassLt, 0.03, 0.9, 1.3, -(HI + SW / 2) - 0.51, YT - 0.25, LZ / 2 - 1.2);
      B.cyl('paint', '#e8962f', 0.1, 0.16, 0.3, YT + 2.08, 0, { seg: 10 });
      B.blink('#ffa030', 0.3, YT + 2.12, 0, { size: 0.09, rate: 1.0, phase: 2.1, lo: 0.3, hi: 5 });
      // hoist: ropes down to the spreader resting on the box
      for (const sx of [-0.9, 0.9]) for (const sz of [-2.4, 2.4]) rodT(B, NS('metal'), K.galvDk, [sx * 0.8, YT - 0.1, sz * 0.8], [sx, sy + 0.35, sz], 0.03, 4);
      B.box('paint', K.crane, 2.3, 0.3, 6.1, 0, sy + 0.17, 0, { r: 0.04 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(NS('paint'), K.ink, 0.22, 0.3, 0.22, sx * 1.12, sy + 0.1, sz * 2.95, { r: 0.02 });
      // PERCH (walkable, never inkable): the top frame (side + cross beams), engine housing and cab roof; the legs keep
      // their off-limits tops (buried under the frame). The spreader resting on the box is walkable too: it covers the
      // box top, so that top is no longer inkable-but-hidden turf. The open middle of the frame drops onto it.
      const P = { perch: true };
      for (const sx of [-1, 1]) { const x = sx * (HI + SW / 2); B.col(x - 0.25, YT, -(LZ - 1.2) / 2, x + 0.25, YT + 0.8, (LZ - 1.2) / 2, P); }
      for (const lz of [-3.2, 3.2]) B.col(-(HI + SW), YT, lz - 0.3, HI + SW, YT + 0.7, lz + 0.3, P);
      B.col(-1.0, YT + 0.7, -3.2, 1.6, YT + 2.0, -0.6, P);
      B.col(-(HI + SW / 2) - 0.5, YT - 1.3, LZ / 2 - 2.0, -(HI + SW / 2) + 0.9, YT + 0.5, LZ / 2 - 0.4, P);
      B.col(-1.15, sy + 0.02, -3.05, 1.15, sy + 0.32, 3.05, P);
    },
  };

  // ================================================================================================ yard kit
  // lashing cage: galvanised mesh stillage on skids full of lashing bars + turnbuckles (collider = cover, 1.2 m)
  D.kelpline_cage = {
    desc: 'Lashing-gear cage (2.4 × 1.2 × 1.2, collider): galvanised frame on forklift skids, mesh sides, lashing bars + turnbuckles inside, stencilled bay number. variant 1 = twistlock bin (1.2 × 1.0 × 0.9) full of cones.',
    params: {}, variants: 2, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 2, w = v ? 1.2 : 2.4, d = v ? 1.0 : 1.2, h = v ? 0.9 : 1.2, g = K.galv, gd = K.galvDk;
      for (const sz of [-1, 1]) pbox(B, 'metal', gd, w, 0.12, 0.14, 0, 0.06, sz * (d / 2 - 0.1));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pbox(B, 'metal', g, 0.06, h - 0.1, 0.06, sx * (w / 2 - 0.03), 0.12 + (h - 0.12) / 2, sz * (d / 2 - 0.03));
      for (const yy of [0.14, h]) { for (const sz of [-1, 1]) pbox(B, 'metal', g, w, 0.05, 0.05, 0, yy, sz * (d / 2 - 0.03)); for (const sx of [-1, 1]) pbox(B, 'metal', g, 0.05, 0.05, d, sx * (w / 2 - 0.03), yy, 0); }
      // mesh sides: welded bar grid (vertical bars every 0.16 m, two horizontal ties)
      const ym = 0.12 + (h - 0.12) / 2, hb = h - 0.2;
      for (const sz of [-1, 1]) { for (let x = -w / 2 + 0.16; x < w / 2 - 0.1; x += 0.16) pbox(B, NS('metal'), g, 0.014, hb, 0.014, x, ym, sz * (d / 2 - 0.03)); pbox(B, NS('metal'), g, w - 0.06, 0.02, 0.02, 0, ym, sz * (d / 2 - 0.03)); }
      for (const sx of [-1, 1]) { for (let z = -d / 2 + 0.16; z < d / 2 - 0.1; z += 0.16) pbox(B, NS('metal'), g, 0.014, hb, 0.014, sx * (w / 2 - 0.03), ym, z); pbox(B, NS('metal'), g, 0.02, 0.02, d - 0.06, sx * (w / 2 - 0.03), ym, 0); }
      if (!v) {
        for (let k = 0; k < 9; k++) rodT(B, NS('metal'), k % 3 ? '#8a8f8a' : '#c49a3a', [-w / 2 + 0.15, 0.25 + (k % 3) * 0.12, -0.4 + k * 0.1], [w / 2 - 0.2, 0.35 + ((k + 1) % 3) * 0.1, -0.35 + k * 0.09], 0.018, 4);
        for (let k = 0; k < 4; k++) B.cyl(NS('metal'), '#c49a3a', 0.04, 0.5, -0.6 + k * 0.4, h - 0.2, 0.1 * (k % 2), { rz: HP, seg: 6 });
      } else {
        for (let k = 0; k < 10; k++) B.box(NS('metal'), '#6f7176', 0.14, 0.1, 0.1, -0.4 + (k % 5) * 0.2, h - 0.12 + Math.floor(k / 5) * 0.06, -0.25 + (k % 3) * 0.2, { r: 0.02, ry: k });
      }
      B.push(0, h * 0.55, d / 2 + 0.005); pbox(B, NS('paint'), K.hazY, 0.5, 0.2, 0.01, 0, 0, 0); letters(B, v ? 'TL' : 'L4', { h: 0.12, x: 0, y: -0.06, z: 0.008, c: K.ink, flat: true, wt: 0.22 }); B.pop();
      B.col(-w / 2, 0, -d / 2, w / 2, h, d / 2, { rail: true }); B.blob(w + 0.4, d + 0.4);   // bar mesh: see-through
    },
  };
  // quay edge run along local +X (deck edge at z = 0, water +Z): capping beam steel edge angle, tee-head bollards
  // (colliders, 0.75 m), cone fenders with front panels on the face, recessed ladders, yellow edge paint
  D.kelpline_quayedge = {
    desc: 'Quay edge along +X (edge at z = 0, water +Z): steel edge angle, painted yellow edge band, tee-head bollards at `bollards` (colliders), cone fenders + steel panels on the face at `fenders`, recessed ladders at `ladders`.',
    params: { length: 'm', bollards: '[s]', fenders: '[s]', ladders: '[s]' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 40;
      pbox(B, NS('metal'), K.greyDk, L, 0.06, 0.08, L / 2, -0.03, -0.04);
      pbox(B, NS('metal'), K.greyDk, L, 0.25, 0.03, L / 2, -0.15, 0.015);
      for (const s of o.bollards ?? []) {
        B.push(s, 0, -0.55);
        B.box('paint', K.charcoal, 0.8, 0.06, 0.8, 0, 0.03, 0, { r: 0.02 });
        B.lathe('paint', K.charcoal, [[0.26, 0.04], [0.22, 0.12], [0.2, 0.55], [0.34, 0.62], [0.36, 0.7], [0.32, 0.76], [0, 0.77]], 0, 0, 0, { seg: 14 });
        pbox(B, 'paint', K.charcoal, 0.9, 0.12, 0.24, 0, 0.66, 0);
        B.cyl(NS('paint'), K.hazY, 0.205, 0.08, 0, 0.35, 0, { seg: 14 });
        B.pop();
        B.col(s - 0.45, 0, -0.95, s + 0.45, 0.77, -0.15);
      }
      for (const s of o.fenders ?? []) {
        B.push(s, -1.5, 0);
        B.lathe('paint', K.rubber, [[0.55, 0], [0.42, 0.25], [0.32, 0.5], [0.34, 0.55], [0, 0.55]], 0, 0, 0, { seg: 12, rx: HP });
        B.box('paint', '#3a4a60', 2.0, 1.4, 0.12, 0, 0, 0.6, { r: 0.04 });
        pbox(B, NS('paint'), '#1f2125', 1.9, 1.3, 0.04, 0, 0, 0.68);
        for (const sx of [-1, 1]) rodT(B, NS('metal'), K.galvDk, [sx * 0.9, 0.7, 0.62], [sx * 0.5, 1.45, 0.05], 0.02, 4);
        B.pop();
      }
      for (const s of o.ladders ?? []) {
        B.push(s, 0, 0.02);
        for (const sx of [-0.22, 0.22]) pbox(B, NS('metal'), K.hazY, 0.05, 2.4, 0.05, sx, -1.2, 0.03);
        for (let y = -2.2; y < -0.1; y += 0.3) pbox(B, NS('metal'), K.hazY, 0.44, 0.03, 0.04, 0, y, 0.04);
        for (const sx of [-0.22, 0.22]) B.tube(NS('metal'), K.hazY, [P3(sx, -0.1, 0.03), P3(sx, 0.35, 0.03), P3(sx, 0.55, -0.12), P3(sx, 0.35, -0.3), P3(sx, 0.0, -0.3)], 0.025, { radial: 5 });
        B.pop();
        B.col(s - 0.26, 0, -0.34, s + 0.26, 0.6, 0.06, { rail: true });
      }
    },
  };
  // high-mast lighting tower (outside the arena): 26 m tapered pole, service ring with a crown of floodlights
  D.kelpline_mast = {
    desc: 'High-mast lighting tower: tapered galvanised pole on a plinth, headframe ring with a crown of floodlights (glow), obstruction lamp. Collider: plinth + pole.',
    params: { h: 'm (26)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const Hh = o.h ?? 26;
      B.box('paint', K.concrete, 1.4, 0.5, 1.4, 0, 0.25, 0, { r: 0.05 });
      B.lathe('metal', K.galv, [[0.42, 0.5], [0.4, 0.8], [0.18, Hh], [0, Hh]], 0, 0, 0, { seg: 12 });
      B.box('paint', K.greyDk, 0.3, 0.7, 0.12, 0, 1.4, 0.37, { r: 0.02 });
      B.tor('metal', K.galvDk, 1.4, 0.06, 0, Hh - 0.3, 0, { rs: 4, ts: 20 });
      B.cyl('metal', K.galvDk, 1.35, 0.1, 0, Hh - 0.5, 0, { seg: 16 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        B.push(Math.cos(a) * 1.2, Hh - 0.1, Math.sin(a) * 1.2, -a + HP, 0.65);
        B.box('paint', K.charcoal, 0.7, 0.2, 0.5, 0, 0, 0, { r: 0.05 });
        pbox(B, NS('glow'), K.lampCool, 0.62, 0.015, 0.44, 0, -0.105, 0, { glow: 4.0 });
        B.pop();
      }
      B.blink('#ff4030', 0, Hh + 0.25, 0, { size: 0.12, rate: 0.5, phase: 0.4, lo: 0.3, hi: 6 });
      B.col(-0.7, 0, -0.7, 0.7, Hh, 0.7, { roof: true });
    },
  };

  // flat rack (40'): low steel platform with folding end walls up (floor top 0.65 walkable, end walls 2.6), lashed
  // timber cargo on it. pos = centre, length along local Z. Colliders: floor + both end walls + the cargo stack.
  D.kelpline_flatrack = {
    desc: 'Flat-rack container (length along local Z): steel floor with timber decking (0.65, walkable), end walls up with corner posts + castings, lashed crated cargo in the middle (collider), chains + straps. Colliders: floor, end walls, cargo.',
    params: { len: '20 | 40', c: 'paint', cargo: 'bool (true)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = (o.len ?? 40) === 20 ? 6.06 : 12.19, W = 2.44, FH = 0.65, c = o.c ?? '#5f6f84', dk = shade(c, 0.75);
      for (const sx of [-1, 1]) pbox(B, 'paint', c, 0.2, 0.5, L, sx * (W / 2 - 0.1), 0.3, 0);
      for (let z = -L / 2 + 0.4; z < L / 2; z += 0.8) pbox(B, NS('paint'), dk, W - 0.3, 0.2, 0.12, 0, 0.35, z);
      for (let k = 0; k < 9; k++) pbox(B, 'paint', shade('#b58b5e', 0.9 + 0.05 * (k % 3)), 0.25, 0.05, L - 0.2, -W / 2 + 0.2 + k * 0.255, FH - 0.025, 0);
      for (const sz of [-1, 1]) {
        const z = sz * (L / 2 - 0.12);
        pbox(B, 'paint', c, W, 2.6 - FH, 0.2, 0, FH + (2.6 - FH) / 2, z);
        for (let k = -2; k <= 2; k++) pbox(B, NS('paint'), dk, 0.08, 1.8, 0.04, k * 0.45, 1.6, z - sz * 0.12);
        for (const sx of [-1, 1]) {
          pbox(B, 'paint', dk, 0.2, 2.6, 0.24, sx * (W / 2 - 0.1), 1.3, z);
          for (const cy of [0.09, 2.51]) pbox(B, NS('paint'), K.ink, 0.21, 0.18, 0.25, sx * (W / 2 - 0.1), cy, z);
        }
        B.col(-W / 2, 0, z - 0.14, W / 2, 2.6, z + 0.14);
      }
      B.col(-W / 2, 0, -L / 2, W / 2, FH, L / 2);
      if (o.cargo !== false) {
        // two big timber crates, strapped down
        for (const cz of [-1.6, 1.6]) {
          B.box('paint', '#c49a68', 2.0, 1.3, 2.6, 0, FH + 0.65, cz, { r: 0.03 });
          for (const bz of [-1.1, 0, 1.1]) pbox(B, NS('paint'), '#a57a4b', 2.04, 1.34, 0.12, 0, FH + 0.65, cz + bz);
          B.push(0, FH + 0.9, cz + 1.31); letters(B, 'THIS WAY UP', { h: 0.09, x: 0, y: 0, z: 0, c: K.ink, flat: true, wt: 0.24 }); B.pop();
          for (const bz of [-0.6, 0.6]) {
            B.tube(NS('paint'), '#d9a33a', [P3(-1.18, FH, cz + bz), P3(-1.02, FH + 1.32, cz + bz), P3(1.02, FH + 1.32, cz + bz), P3(1.18, FH, cz + bz)], 0.018, { radial: 4 });
          }
        }
        B.col(-1.0, FH, -2.9, 1.0, FH + 1.3, 2.9);
      }
    },
  };
  // mobile lighting tower: towable trailer, stabiliser legs, telescopic mast with a four-lamp head (glow at dusk)
  D.kelpline_lighttower = {
    desc: 'Towable lighting tower: box body on a single-axle trailer with drawbar, four stabiliser legs, telescopic mast (6.5 m) with a four-lamp head. Collider: body.',
    params: { c: 'body paint (crane yellow)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const c = o.c ?? K.crane;
      B.box('paint', c, 1.3, 1.2, 2.1, 0, 0.95, 0, { r: 0.08 });
      for (let k = 0; k < 6; k++) pbox(B, NS('paint'), shade(c, 0.75), 0.02, 0.6, 0.06, 0.66, 0.95, -0.7 + k * 0.28);
      for (const sx of [-1, 1]) tyre(B, sx * 0.78, 0.33, 0, 0.33, 0.2);
      B.cyl(NS('metal'), K.charcoal, 0.04, 1.6, 0, 0.33, 0, { rz: HP, seg: 6 });
      pbox(B, 'paint', K.charcoal, 0.1, 0.1, 1.4, 0, 0.45, 1.6);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { rodT(B, NS('metal'), K.greyDk, [sx * 0.6, 0.7, sz * 0.9], [sx * 1.0, 0.05, sz * 1.1], 0.04, 5); pbox(B, NS('metal'), K.greyDk, 0.2, 0.03, 0.2, sx * 1.0, 0.015, sz * 1.1); }
      for (const [r, y0, y1] of [[0.09, 1.5, 3.8], [0.07, 3.8, 5.6], [0.055, 5.6, 7.0]]) B.cyl('metal', K.galv, r, y1 - y0, 0, (y0 + y1) / 2, -0.6, { seg: 8 });
      pbox(B, 'metal', K.galvDk, 1.4, 0.08, 0.08, 0, 7.0, -0.6);
      for (const [x, y] of [[-0.45, 7.3], [0.45, 7.3], [-0.45, 6.75], [0.45, 6.75]]) flood(B, x, y, -0.45, { rx: -1.15, glow: 1.7 });
      B.col(-0.7, 0, -1.1, 0.7, 1.6, 1.1, { roof: true });
    },
  };
  // terminal safety board on two posts: KELPLINE TERMINAL · PPE pictograms + text (both faces)
  D.kelpline_signboard = {
    desc: 'Terminal notice board on two galvanised posts (faces ±Z): blue header, PPE pictograms (hard hat, hi-vis, boots), text lines. variant 0 = HARD HAT AREA, 1 = BERTH 4 / 20 KM/H, 2 = MUSTER POINT (green). Collider: posts.',
    params: {}, variants: 3, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 3, W = 1.6, Hs = 1.1, y = 1.35;
      for (const sx of [-1, 1]) { B.cyl('metal', K.galv, 0.04, y + Hs / 2 + 0.1, sx * (W / 2 - 0.12), (y + Hs / 2 + 0.1) / 2, 0, { seg: 8 }); }
      B.box('paint', K.white, W, Hs, 0.05, 0, y, 0, { r: 0.02 });
      for (const f of [1, -1]) {
        B.push(0, y, f * 0.028, f > 0 ? 0 : PI);
        const hc = v === 2 ? '#3d8a5a' : K.blueDk;
        pbox(B, NS('paint'), hc, W - 0.06, 0.28, 0.004, 0, Hs / 2 - 0.17, 0);
        if (v === 0) {
          letters(B, 'HARD HAT AREA', { h: 0.1, x: 0, y: Hs / 2 - 0.22, z: 0.004, c: K.white, flat: true, wt: 0.24 });
          for (let k = 0; k < 3; k++) { B.cyl(NS('paint'), '#2f6db0', 0.15, 0.004, -0.5 + k * 0.5, -0.05, 0.003, { rx: HP, seg: 14 }); pbox(B, NS('paint'), K.white, 0.14, 0.1, 0.006, -0.5 + k * 0.5, -0.03, 0.006); }
          letters(B, 'HI-VIS · BOOTS · HELMET', { h: 0.055, x: 0, y: -0.38, z: 0.004, c: K.ink, flat: true, wt: 0.24 });
        } else if (v === 1) {
          letters(B, 'BERTH 4', { h: 0.12, x: 0, y: Hs / 2 - 0.23, z: 0.004, c: K.white, flat: true, wt: 0.22 });
          B.cyl(NS('paint'), K.red, 0.26, 0.004, -0.4, -0.12, 0.003, { rx: HP, seg: 18 });
          B.cyl(NS('paint'), K.white, 0.2, 0.004, -0.4, -0.12, 0.005, { rx: HP, seg: 18 });
          letters(B, '20', { h: 0.16, x: -0.4, y: -0.2, z: 0.008, c: K.ink, flat: true, wt: 0.24 });
          letters(B, 'KM/H', { h: 0.08, x: 0.3, y: -0.05, z: 0.004, c: K.ink, flat: true, wt: 0.24 });
          letters(B, 'GIVE WAY TO', { h: 0.06, x: 0.3, y: -0.2, z: 0.004, c: K.ink, flat: true, wt: 0.24 });
          letters(B, 'STRADDLES', { h: 0.06, x: 0.3, y: -0.31, z: 0.004, c: K.ink, flat: true, wt: 0.24 });
        } else {
          letters(B, 'MUSTER POINT', { h: 0.1, x: 0, y: Hs / 2 - 0.22, z: 0.004, c: K.white, flat: true, wt: 0.24 });
          pbox(B, NS('paint'), '#3d8a5a', 0.5, 0.5, 0.004, 0, -0.12, 0.003);
          for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + PI / 4; B.push(Math.cos(a) * 0.14, -0.12 + Math.sin(a) * 0.14, 0.006, 0, 0, a + PI); pbox(B, NS('paint'), K.white, 0.1, 0.04, 0.003, 0, 0, 0); B.pop(); }
          B.sph(NS('paint'), K.white, 0.05, 0, -0.12, 0.006, { ws: 8, hs: 4, half: true, rx: HP });
        }
        B.pop();
      }
      B.col(-W / 2, 0, -0.1, W / 2, y + Hs / 2, 0.1, { roof: true });
    },
  };
  // welfare / lashers' cabin on a level box (the box's side face at local z = 0, pos = bottom centre of that face):
  // door with a step, windows with blinds, AC unit, KELPLINE LASHING sign, a bench and a bin outside
  D.kelpline_cabin = {
    desc: 'Site-cabin fittings on a container side face (face at z = 0, pos = bottom centre): door + steel step, two windows with bars + lit blinds, AC unit, LASHING GANG sign, cable entry. Non-colliding except the step.',
    params: { w: 'face width (6.06)', sign: 'text' }, variants: 1, mount: 'wall',
    build(B, o) {
      B.aoBase = null;
      const w = o.w ?? 6.06;
      pbox(B, 'paint', '#5d6b78', 0.95, 2.05, 0.05, -w / 2 + 1.1, 1.08, 0.025);
      pbox(B, NS('metal'), K.galv, 0.05, 0.22, 0.06, -w / 2 + 1.45, 1.05, 0.07);
      B.box('metal', K.galvDk, 1.2, 0.08, 0.7, -w / 2 + 1.1, 0.04, 0.35, { r: 0.01 });
      B.col(-w / 2 + 0.5, 0, 0, -w / 2 + 1.7, 0.08, 0.7);
      for (const wx of [0.4, 1.9]) {
        pbox(B, NS('gloss'), K.glass, 1.0, 0.8, 0.02, wx, 1.6, 0.012);
        pbox(B, NS('glow'), '#ffe2b0', 0.94, 0.28, 0.01, wx, 1.82, 0.025, { glow: 0.7 });
        pbox(B, 'paint', K.white, 1.1, 0.06, 0.06, wx, 1.17, 0.03);
        for (let k = -2; k <= 2; k++) pbox(B, NS('metal'), K.galvDk, 0.02, 0.8, 0.02, wx + k * 0.2, 1.6, 0.05);
      }
      B.box('paint', '#e9ecee', 0.8, 0.55, 0.3, w / 2 - 0.8, 2.0, 0.15, { r: 0.04 });
      B.cyl(NS('paint'), '#3a3f45', 0.2, 0.02, w / 2 - 0.8, 2.0, 0.31, { rx: HP, seg: 12 });
      B.push(0.4, 2.35, 0.01);
      B.box('paint', K.blueDk, 2.6, 0.32, 0.03, 0.75, 0, 0, { r: 0.01 });
      letters(B, o.sign ?? 'LASHING GANG', { h: 0.14, x: 0.75, y: -0.07, z: 0.018, c: K.white, flat: true, wt: 0.22 });
      B.pop();
    },
  };

  // terminal service pickup (front +Z): cab + open bed with a toolbox and cones, amber light bar, KELPLINE door mark.
  // Collider: body (1.5) + cab (1.95 roof, off limits).
  D.kelpline_pickup = {
    desc: 'Terminal service pickup (front +Z): white body, cab with glazing + amber light bar, open bed with a toolbox and cones, KELPLINE TERMINAL door mark, hi-vis side stripe. Colliders: body + cab (roof).',
    params: { c: 'body paint' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const c = o.c ?? '#eceae4', L = 5.2, W = 1.9;
      B.box('paint', c, W, 0.75, L, 0, 0.8, 0, { r: 0.1 });
      B.box('paint', c, W - 0.05, 0.75, 2.2, 0, 1.55, 0.35, { r: 0.12 });
      pbox(B, NS('gloss'), K.glassLt, W - 0.2, 0.55, 0.04, 0, 1.6, 1.46, { rx: -0.35 });
      for (const sx of [-1, 1]) pbox(B, NS('gloss'), K.glassLt, 0.03, 0.5, 1.7, sx * (W / 2 - 0.02), 1.62, 0.3);
      pbox(B, NS('paint'), '#e8962f', 1.2, 0.1, 0.22, 0, 1.97, 0.1);
      for (const sx of [-0.45, 0.45]) B.blink('#ffa030', sx, 2.05, 0.1, { size: 0.06, rate: 1.3, phase: sx * 3, lo: 0.3, hi: 5 });
      for (const sx of [-1, 1]) {
        pbox(B, NS('paint'), K.hazY, 0.02, 0.1, L - 0.4, sx * (W / 2 + 0.005), 0.9, 0);
        B.push(sx * (W / 2 + 0.01), 1.2, 0.5, sx * HP); letters(B, 'KELPLINE', { h: 0.12, x: 0, y: 0, z: 0, c: K.blueDk, flat: true, wt: 0.22 }); B.pop();
        for (const tz of [1.6, -1.6]) tyre(B, sx * 0.82, 0.38, tz, 0.38, 0.25);
      }
      // bed: side walls, toolbox, cones
      for (const sx of [-1, 1]) pbox(B, 'paint', c, 0.06, 0.4, 2.3, sx * (W / 2 - 0.03), 1.37, -1.3);
      pbox(B, 'paint', c, W, 0.4, 0.06, 0, 1.37, -2.47);
      B.box('metal', K.greyDk, W - 0.3, 0.3, 0.4, 0, 1.35, -0.45, { r: 0.03 });
      for (let k = 0; k < 3; k++) subNC(B, 'cone', -0.5 + k * 0.4, 1.17, -1.8 + (k % 2) * 0.3, 0, {});
      pbox(B, NS('glow'), '#fff1cc', 0.3, 0.12, 0.02, 0.62, 0.95, L / 2 + 0.005, { glow: 1.1 });
      pbox(B, NS('glow'), '#fff1cc', 0.3, 0.12, 0.02, -0.62, 0.95, L / 2 + 0.005, { glow: 1.1 });
      B.col(-W / 2, 0, -L / 2, W / 2, 1.2, L / 2);
      B.col(-W / 2, 1.2, -0.75, W / 2, 1.95, 1.45, { roof: true });
      B.blob(W + 0.6, L + 0.6);
    },
  };
  // container forklift (front +Z): mast + forks raised with a lashing-cage pallet, counterweight, cab cage, amber beacon.
  // Collider: body (1.6) + mast (roof).
  D.kelpline_forklift = {
    desc: 'Heavy forklift (front +Z): body with counterweight, protective cab cage, twin-mast with raised forks carrying a twistlock bin, big front tyres, beacon. Colliders: body + mast (roof).',
    params: { c: 'paint', lift: 'fork height (1.3)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const c = o.c ?? K.crane, dk = shade(c, 0.75), lift = o.lift ?? 1.3;
      B.box('paint', c, 2.0, 1.0, 3.4, 0, 0.95, -0.2, { r: 0.1 });
      B.box('paint', dk, 2.1, 1.1, 0.8, 0, 1.05, -1.8, { r: 0.12 });
      for (const sx of [-1, 1]) { tyre(B, sx * 0.9, 0.55, 1.1, 0.55, 0.42); tyre(B, sx * 0.85, 0.45, -1.3, 0.45, 0.36); }
      // cab cage: four posts + roof
      for (const sx of [-0.8, 0.8]) for (const sz of [-0.9, 0.5]) pbox(B, NS('paint'), K.charcoal, 0.07, 1.3, 0.07, sx, 2.1, sz);
      pbox(B, 'paint', K.charcoal, 1.7, 0.08, 1.5, 0, 2.78, -0.2);
      B.box('paint', K.charcoal, 0.5, 0.5, 0.5, 0, 1.7, -0.5, { r: 0.08 });
      B.cyl('paint', '#e8962f', 0.08, 0.14, 0.5, 2.9, -0.8, { seg: 8 });
      B.blink('#ffa030', 0.5, 2.94, -0.8, { size: 0.07, rate: 1.1, phase: 1.3, lo: 0.3, hi: 5 });
      // mast + forks + carriage
      for (const sx of [-0.55, 0.55]) pbox(B, 'paint', dk, 0.14, 3.2, 0.2, sx, 1.7, 1.65);
      pbox(B, 'paint', dk, 1.3, 0.12, 0.2, 0, 3.25, 1.65);
      pbox(B, 'paint', K.charcoal, 1.3, 0.6, 0.1, 0, lift + 0.3, 1.8);
      for (const sx of [-0.35, 0.35]) pbox(B, NS('metal'), K.greyDk, 0.12, 0.06, 1.2, sx, lift, 2.4);
      subNC(B, 'kelpline_cage', 0, lift + 0.03, 2.4, 0, { variant: 1 });
      B.col(-1.05, 0, -2.2, 1.05, 1.6, 1.5);
      B.col(-0.7, 0, 1.5, 0.7, 3.3, 1.8, { roof: true });
      B.blob(2.6, 4.6);
    },
  };

  // ================================================================================================ beyond the back wall
  // The terminal carries on behind each base (outside the arena, visual only): the pier slab, container blocks either
  // side of the ops building (1–4 high), an RTG crane over one block, a truck queuing at the gate, perimeter fence.
  // pos = centre of the back wall's outer face (local +Z = toward the arena, the yard runs toward −Z).
  D.kelpline_backyard = {
    desc: 'Terminal beyond the back wall (visual): pier slab to 34 m behind the wall, container blocks 1–4 high either side of the ops building, an RTG gantry, a truck at the gate, fence line.',
    params: { seed: 'stack seed' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const rnd = shipRng(o.seed ?? 5), DZ = 34;
      // pier slab + edge
      pbox(B, NS('paint'), '#bdb8ad', 48, 1.2, DZ, 0, -0.6, -DZ / 2);
      for (const sx of [-1, 1]) pbox(B, NS('paint'), '#8f8a80', 0.3, 0.3, DZ, sx * 23.85, 0.15, -DZ / 2);
      // container blocks: rows along z, 40' boxes, tiers by a skyline profile (tallest in the middle of each block)
      const pal = ['#a8583f', '#3d5f8c', '#3f8580', '#c99a3c', '#858c93', '#56794f', '#e4e2da', '#7d3f45', '#34435f', '#c47440', '#b9b3a7'];
      const block = (x0, nRows, z0, nBays, maxT) => {
        for (let r = 0; r < nRows; r++) for (let b = 0; b < nBays; b++) {
          const x = x0 + r * 2.54 + 1.22, z = z0 - b * 12.5 - 6.1;
          const t = Math.max(1, Math.min(maxT, Math.round(maxT - Math.abs(r - (nRows - 1) / 2) * 0.8 - rnd() * 1.8 + 0.6)));
          for (let k = 0; k < t; k++) {
            const c = pal[Math.floor(rnd() * pal.length)];
            pbox(B, 'paint', c, 2.44, 2.56, 12.14, x, 2.6 * k + 1.28, z);
            pbox(B, NS('paint'), shade(c, 0.7), 2.46, 0.12, 12.16, x, 2.6 * k + 0.06, z);
            pbox(B, NS('paint'), shade(c, 0.75), 2.46, 2.4, 0.08, x, 2.6 * k + 1.3, z + 6.06);
          }
        }
      };
      block(13.9, 4, -2.5, 2, 4);
      block(-24.0 + 0.2, 4, -2.5, 2, 3);
      block(-12.7, 10, -13.5, 1, 3);
      // RTG gantry over the left block: four legs on rubber-tyred bogies, girders at 19 m, trolley, cab
      {
        const x0 = -24.0, x1 = -13.4, zc = -9.0, YT = 19, rc = '#3e6fa8', wc = K.white;
        for (const x of [x0, x1]) for (const dz of [-3.2, 3.2]) {
          B.add('paint', frustumGeo(0.9, 0.9, 0.7, 0.7, YT), wc, x, 1.1, zc + dz, {});
          B.box('paint', rc, 0.9, 0.9, 2.6, x, 0.9, zc + dz, { r: 0.05 });
          for (const wz of [-0.8, 0.8]) tyre(B, x, 0.6, zc + dz + wz, 0.6, 0.45);
        }
        for (const x of [x0, x1]) B.box('paint', rc, 0.9, 1.2, 7.4, x, YT + 1.6, zc, { r: 0.06 });
        for (const dz of [-3.2, 3.2]) B.box('paint', wc, x1 - x0 + 1.2, 1.3, 1.0, (x0 + x1) / 2, YT + 1.7, zc + dz, { r: 0.06 });
        B.box('paint', rc, 3.0, 1.4, 7.6, (x0 + x1) / 2 + 1.5, YT + 3.0, zc, { r: 0.08 });
        B.box('paint', wc, 1.6, 2.0, 1.8, (x0 + x1) / 2 + 1.5, YT - 1.2, zc - 2.8, { r: 0.08 });
        pbox(B, NS('gloss'), K.glassLt, 1.4, 1.0, 0.04, (x0 + x1) / 2 + 1.5, YT - 1.0, zc - 1.88);
        B.push((x0 + x1) / 2, YT + 1.7, zc + 3.71); letters(B, 'RTG 22', { h: 0.7, x: 0, y: -0.35, z: 0, c: rc, flat: true, wt: 0.2 }); B.pop();
        B.blink('#ffa030', (x0 + x1) / 2 + 1.5, YT + 3.9, zc, { size: 0.12, rate: 0.9, lo: 0.3, hi: 5 });
        for (const dz of [-3.2, 3.2]) flood(B, (x0 + x1) / 2 - 3, YT + 1.0, zc + dz, { glow: 1.6 });
        for (const sx of [-0.9, 0.9]) rodT(B, NS('metal'), K.galvDk, [(x0 + x1) / 2 + 1.5 + sx, YT + 2.3, zc], [(x0 + x1) / 2 + 1.5 + sx, 12.2, zc], 0.03, 4);
        B.box('paint', K.crane, 2.3, 0.35, 6.1, (x0 + x1) / 2 + 1.5, 12.0, zc, { r: 0.04 });
      }
      // off-limits colliders: the pier slab, the two stack blocks, the RTG legs
      B.col(-24, -1.2, -DZ, 24, 0, -0.6, { roof: true });
      B.col(13.9, 0, -27.5, 24, 10.4, -2.5, { roof: true });
      B.col(-23.8, 0, -27.5, -13.6, 7.8, -2.5, { roof: true });
      B.col(-12.7, 0, -26, 12.7, 7.8, -13.5, { roof: true });
      // truck queuing outside the gate, fence line along the pier edge behind the gate
      B.push(16.4, 0, -6.5, PI);
      B.box('paint', '#c9453b', 2.4, 2.6, 2.2, 0, 1.9, 4.5, { r: 0.12 });
      pbox(B, NS('gloss'), K.glassLt, 2.2, 1.0, 0.04, 0, 2.5, 5.62);
      for (const sx of [-1, 1]) for (const tz of [4.4, 2.2, -2.2, -3.4]) tyre(B, sx * 1.0, 0.5, tz, 0.5, 0.3);
      pbox(B, 'paint', '#3a3f47', 1.2, 0.35, 12.4, 0, 1.2, -1.2);
      B.pop();
      containerBody(B, 16.4, 1.35, -7.7, 40, '#3f8580', { bottom: true, logo: 'KRAKEN', logoC: K.white });
    },
  };

  // ship's accommodation ladder: from the ship's deck edge (local x = +run, y = rise) down to a landing platform on the
  // quay (pos = foot on the quay, local +X toward the ship), aluminium stringers, treads, stanchions + rope rails, a
  // safety net slung underneath. Collider: the landing platform only.
  D.kelpline_gangway = {
    desc: "Ship's accommodation ladder from the quay (pos = foot, local +X toward the ship) up to the ship's deck (run, rise): landing platform (collider), aluminium ladder with treads, stanchions + rope handrails, safety net underneath, a lifebuoy at the top.",
    params: { run: 'm (4.4)', rise: 'm (5.2)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const run = o.run ?? 4.4, rise = o.rise ?? 5.2, W = 0.8, L = Math.hypot(run, rise), pitch = Math.atan2(rise, run), al = '#c9cfd4';
      B.box('paint', K.greyDk, 1.2, 0.2, 1.4, -0.3, 0.1, 0, { r: 0.03 });
      pbox(B, NS('paint'), K.hazY, 1.2, 0.02, 0.1, -0.3, 0.205, 0.65);
      B.col(-0.9, 0, -0.7, 0.3, 0.2, 0.7);
      B.push(run / 2, rise / 2 + 0.2, 0, 0, 0, pitch);
      for (const sz of [-1, 1]) pbox(B, 'paint', al, L, 0.22, 0.05, 0, 0, sz * W / 2);
      for (let k = 0; k < Math.floor(L / 0.3); k++) pbox(B, NS('paint'), shade(al, 0.85), 0.14, 0.03, W, -L / 2 + 0.2 + k * 0.3, 0.05, 0, { rz: -pitch });
      B.pop();
      for (const sz of [-1, 1]) {
        const at = (t, h) => [t * run, 0.2 + t * rise + h, sz * (W / 2)];
        for (let k = 0; k <= 5; k++) { const t = k / 5; rodT(B, NS('paint'), al, at(t, 0), at(t, 1.0), 0.02, 4); }
        B.tube(NS('paint'), K.rope, [P3(...at(0, 1.0)), P3(...at(0.5, 0.95)), P3(...at(1, 1.0))], 0.02, { radial: 4 });
      }
      // net underneath (a sagging diamond mesh of thin ropes)
      for (let k = 0; k <= 6; k++) { const t = k / 6; B.tube(NS('paint'), '#d9ceb2', [P3(t * run, 0.2 + t * rise - 0.1, -1.2), P3(t * run + 0.3, t * rise - 0.8, 0), P3(t * run, 0.2 + t * rise - 0.1, 1.2)], 0.012, { radial: 3 }); }
      B.push(run, rise + 0.9, -0.65); B.tor('paint', '#e9836c', 0.3, 0.06, 0, 0, 0, { rs: 6, ts: 16 }); B.pop();
      // chain + CREW ONLY plate across the foot (closed to players), rail colliders along both rope rails
      B.tube(NS('paint'), K.hazY, [P3(0.05, 1.0, -W / 2), P3(0.05, 0.78, 0), P3(0.05, 1.0, W / 2)], 0.02, { radial: 4 });
      B.push(0.07, 0.72, 0, HP); pbox(B, NS('paint'), K.white, 0.36, 0.2, 0.01, 0, 0, 0); letters(B, 'CREW ONLY', { h: 0.05, x: 0, y: -0.025, z: 0.006, c: K.red, flat: true, wt: 0.24 }); B.pop();
      B.col(-0.02, 0, -W / 2 - 0.05, 0.12, 1.2, W / 2 + 0.05, { rail: true });
      for (let k = 0; k < 3; k++) { const t0 = k / 3, t1 = (k + 1) / 3; for (const sz of [-1, 1]) B.col(t0 * run, 0, sz * W / 2 - 0.06, t1 * run, 0.2 + t1 * rise + 1.05, sz * W / 2 + 0.06, { rail: true }); }
    },
  };

  // shore-power substation kiosk (front +Z): green steel housing on a plinth, louvres, hazard plates, a cable duct
  // into the quay, SHORE POWER lettering. Collider: body (roof).
  D.kelpline_kiosk = {
    desc: 'Shore-power substation kiosk (2.6 × 1.6 × 2.3, front +Z): plinth, green steel housing with double doors, louvres, danger plates, cable duct, roof kit. Collider: body (roof).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const g = '#4f7a5c', gd = shade(g, 0.78), W2 = 2.6, D2 = 1.6, H2 = 2.3;
      B.box('paint', K.concrete, W2 + 0.3, 0.2, D2 + 0.3, 0, 0.1, 0, { r: 0.04 });
      B.box('paint', g, W2, H2 - 0.2, D2, 0, 0.2 + (H2 - 0.2) / 2, 0, { r: 0.05 });
      B.box('paint', gd, W2 + 0.16, 0.12, D2 + 0.16, 0, H2 + 0.04, 0, { r: 0.03 });
      for (const f of [1, -1]) {
        B.push(0, 0, f * (D2 / 2 + 0.005), f > 0 ? 0 : PI);
        for (const dx of [-0.62, 0.62]) { pbox(B, NS('paint'), gd, 1.1, 1.8, 0.02, dx, 1.2, 0.01); pbox(B, NS('metal'), K.galv, 0.04, 0.22, 0.04, dx + (dx < 0 ? 0.45 : -0.45), 1.2, 0.03); }
        for (let k = 0; k < 5; k++) pbox(B, NS('paint'), shade(g, 0.6), 0.8, 0.04, 0.02, 0, 1.75 + k * 0.08, 0.025);
        pbox(B, NS('paint'), K.hazY, 0.3, 0.26, 0.01, -0.62, 1.55, 0.025);
        pbox(B, NS('paint'), K.white, 0.5, 0.18, 0.01, 0.62, 1.55, 0.025);
        if (f > 0) letters(B, 'SHORE POWER', { h: 0.11, x: 0, y: 2.0, z: 0.03, c: K.white, flat: true, wt: 0.22 });
        B.pop();
      }
      B.box('paint', K.charcoal, 0.4, 0.3, 0.6, W2 / 2 + 0.2, 0.15, 0, { r: 0.05 });
      B.col(-W2 / 2 - 0.15, 0, -D2 / 2 - 0.15, W2 / 2 + 0.4, H2 + 0.1, D2 / 2 + 0.15, { roof: true });
      B.blob(W2 + 0.8, D2 + 0.8);
    },
  };

  // ================================================================================================ crane rail
  D.kelpline_rail = {
    desc: 'Crane rail set into the quay along +X (pos = start, on the deck): steel rail head proud of the paving by 3 cm on a sole plate, clips every 0.9 m, end stop with a rubber buffer at the start when `stop`.',
    params: { length: 'm (40)', stop: 'bool' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 40;
      pbox(B, NS('metal'), K.rail, L, 0.03, 0.09, L / 2, 0.015, 0);
      pbox(B, NS('metal'), K.steel, L, 0.006, 0.05, L / 2, 0.032, 0);
      for (let x = 0.4; x < L; x += 0.9) for (const s of [-1, 1]) pbox(B, NS('metal'), K.greyDk, 0.12, 0.022, 0.07, x, 0.011, s * 0.09);
      if (o.stop) {
        B.box('paint', K.hazY, 0.6, 0.7, 0.8, 0.3, 0.35, 0, { r: 0.05 });
        B.cyl('paint', K.rubber, 0.2, 0.3, 0.75, 0.45, 0, { rz: HP, seg: 12 });
        B.col(0, 0, -0.4, 0.9, 0.7, 0.4);
      }
    },
  };

  // ================================================================================================ container ship
  // Laden box ship alongside the quay. Local frame: the hull side facing the quay is the plane x = 0 (ship extends to
  // +X, beam B), bow stem at z = 0, hull running aft toward -Z (length L), y = quay level (sea at -1.6). Pneumatic
  // fenders float in the gap on local -X; mooring lines run down to quay bollards at x = -o.gap + 0.6.
  const SEA = -1.6;
  const shipRng = (seed) => { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  // hull half-width at distance t aft of the stem and height y (fine entry at the waterline, flared bow above it)
  function hullHW(t, y, Bm, Lb) {
    if (t >= Lb) return Bm / 2;
    const u = Math.max(0, t) / Lb, flare = Math.max(0, Math.min(1, (y - SEA) / 7.5));
    const k = Math.pow(u, 0.62 - 0.22 * flare);
    return Math.max(0.12, (Bm / 2) * Math.min(1, k * (0.93 + 0.12 * flare)));
  }
  // lofted hull shell between heights y0..y1 (sections every dz, finer at the bow); flat-shaded faces, both sides + stem
  const hullGeo = (Bm, L, Lb, y0, y1, stemRake, yr = -3.4) => tpl(['khull', Bm, L, Lb, y0, y1, stemRake, yr].map(kf).join('|'), () => {
    const g = new GB(), ts = [];
    for (let t = 0; t < Lb; t += Lb / 14) ts.push(t);
    for (let t = Lb; t <= L + 1e-6; t += 12) ts.push(t);
    if (ts[ts.length - 1] < L) ts.push(L);
    const ys = [y0, (y0 + y1) / 2, y1], c = Bm / 2;
    const rake = (y) => stemRake * (y - yr);           // stem leans forward with height (from the keel line yr, shared by every shell)
    const ring = (t) => ys.map((y) => { const tt = t - (t < Lb ? rake(y) * (1 - t / Lb) : 0); return [hullHW(tt, y, Bm, Lb), y, -t + (t === 0 ? rake(y) : 0)]; });
    for (let i = 0; i < ts.length - 1; i++) {
      const A = ring(ts[i]), Bq = ring(ts[i + 1]);
      for (let j = 0; j < ys.length - 1; j++) for (const s of [-1, 1]) {
        const pa = [c + s * A[j][0], A[j][1], A[j][2]], pb = [c + s * Bq[j][0], Bq[j][1], Bq[j][2]], pc = [c + s * Bq[j + 1][0], Bq[j + 1][1], Bq[j + 1][2]], pd = [c + s * A[j + 1][0], A[j + 1][1], A[j + 1][2]];
        g.face([pa, pb, pc, pd], [s, 0, 0.3 * (i < 14 ? 1 : 0)]);
      }
    }
    // stem cap (narrow front) + transom
    const A = ring(0);
    for (let j = 0; j < ys.length - 1; j++) g.face([[c - A[j][0], A[j][1], A[j][2]], [c + A[j][0], A[j][1], A[j][2]], [c + A[j + 1][0], A[j + 1][1], A[j + 1][2]], [c - A[j + 1][0], A[j + 1][1], A[j + 1][2]]], [0, 0, 1]);
    g.face([[0, y0, -L], [Bm, y0, -L], [Bm, y1, -L], [0, y1, -L]], [0, 0, -1]);
    return g.geo();
  });
  // deck plate (top of the hull outline at y), sampled exactly like the hull shell so the edges meet
  const deckGeo = (Bm, L, Lb, y, stemRake = 0.5, yr = -3.4) => tpl(['kdeck', Bm, L, Lb, y, stemRake, yr].map(kf).join('|'), () => {
    const g = new GB(), c = Bm / 2, ts = [], rk = stemRake * (y - yr);
    for (let t = 0; t < Lb; t += Lb / 14) ts.push(t);
    ts.push(Lb, L);
    const hw = (t) => hullHW(t - (t < Lb ? rk * (1 - t / Lb) : 0), y, Bm, Lb), zz = (t) => -t + (t === 0 ? rk : 0);
    for (let i = 0; i < ts.length - 1; i++) {
      const a = hw(ts[i]), b = hw(ts[i + 1]);
      g.face([[c - a, y, zz(ts[i])], [c + a, y, zz(ts[i])], [c + b, y, zz(ts[i + 1])], [c - b, y, zz(ts[i + 1])]], [0, 1, 0]);
    }
    return g.geo();
  });
  function bollardPair(B, x, y, z, ry, c = K.charcoal) {
    B.push(x, y, z, ry);
    pbox(B, NS('paint'), c, 1.2, 0.08, 0.5, 0, 0.04, 0);
    for (const sx of [-0.35, 0.35]) { B.cyl('paint', c, 0.17, 0.5, sx, 0.29, 0, { seg: 10 }); B.cyl(NS('paint'), c, 0.22, 0.06, sx, 0.56, 0, { seg: 10 }); }
    B.pop();
  }
  // sagging rope between two points
  function rope(B, a, b, sag, r = 0.045, c = K.rope) {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(P3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t)); }
    B.tube(NS('paint'), c, pts, r, { radial: 5 });
  }
  D.kelpline_ship = {
    desc: 'Laden container ship alongside (quay-side hull plane at local x = 0, bow stem at z = 0, hull aft toward -Z): lofted flared bow + parallel midbody, boot-topping, anchors + hawse, forecastle with breakwater, winches, foremast; deck cargo in bays (3–5 tiers, lashing bridges), hull-side line name in big letters, bow name + draft marks, accommodation block + bridge wings + funnel near the stern, pneumatic fenders in the gap, mooring lines to quay bollards. Visual only (outside the arena).',
    params: { length: 'm (110)', beam: 'm (26)', hull: 'topsides colour', boot: 'boot-top colour', name: 'ship name', line: 'hull-side lettering', gap: 'quay gap m (3.5)', seed: 'cargo seed' },
    variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 110, Bm = o.beam ?? 26, Lb = 26, YD = 5.2, YF = 7.6, gap = o.gap ?? 3.5;
      const hc = o.hull ?? K.hull, boot = o.boot ?? K.hullRed, rnd = shipRng(o.seed ?? 7);
      // hull: boot-top (below -0.8) + topsides + a thin white sheer line
      B.add(NS('paint'), hullGeo(Bm, L, Lb, -3.4, -0.8, 0.5), boot, 0, 0, 0, {});
      B.add('paint', hullGeo(Bm, L, Lb, -0.8, YD, 0.5), hc, 0, 0, 0, {});
      B.add('paint', hullGeo(Bm, Lb * 0.55, Lb, YD, YF, 0.5), hc, 0, 0, 0, {});
      pbox(B, NS('paint'), K.white, 0.04, 0.22, L - Lb, -0.02, YD - 0.35, -(L + Lb) / 2);
      B.add('paint', deckGeo(Bm, L, Lb, YD), K.deck, 0, 0, 0, {});
      B.add('paint', deckGeo(Bm, Lb * 0.55, Lb, YF), shade(K.deck, 1.05), 0, 0, 0, {});
      // forecastle bulwark rail + breakwater (V wall) + winches, bollards, foremast
      const tF = Lb * 0.55;
      {
        // V-shaped breakwater just aft of the forecastle (fits inside the hull at that station)
        const hwB = hullHW(tF + 0.6, YF, Bm, Lb) - 0.4, tipZ = -tF + 1.8, endZ = -tF - 0.6;
        for (const s of [-1, 1]) {
          const a = [Bm / 2, tipZ], b = [Bm / 2 + s * hwB, endZ];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
          B.push((a[0] + b[0]) / 2, YF, (a[1] + b[1]) / 2, ang);
          pbox(B, 'paint', K.offwhite, 0.3, 2.4, len, 0, 1.2, 0);
          for (let k = 1; k < 5; k++) pbox(B, NS('paint'), K.offwhite, 0.9, 0.12, 0.1, -0.5 * s, 0.4 + k * 0.4, -len / 2 + k * len / 5);
          B.pop();
        }
      }
      for (const sx of [-1, 1]) {
        B.cyl('paint', K.blueLt, 0.7, 1.6, Bm / 2 + sx * 4.2, YF + 0.9, -9, { rz: HP, seg: 14 });
        B.box('paint', K.greyDk, 1.4, 1.2, 1.8, Bm / 2 + sx * 5.6, YF + 0.6, -9, { r: 0.1 });
        bollardPair(B, Bm / 2 + sx * 8.5, YF, -12, 0);
        bollardPair(B, Bm / 2 + sx * 5.5, YF, -4, HP * 0.4 * sx);
      }
      B.cyl('paint', K.offwhite, 0.25, 9, Bm / 2, YF + 4.5, -6, { seg: 10 });
      pbox(B, 'paint', K.offwhite, 2.4, 0.2, 0.2, Bm / 2, YF + 7.5, -6);
      B.sph(NS('glow'), K.lamp, 0.18, Bm / 2, YF + 9.1, -6, { ws: 8, hs: 6, glow: 2 });
      // anchors in their hawse pockets (both bows), bow name, bulb mark, draft marks
      for (const s of [-1, 1]) {
        const t = 5.5, y = 3.2, hw = hullHW(t, y, Bm, Lb), x = Bm / 2 + s * (hw + 0.05);
        B.push(x, y, -t, s * (HP - 0.5));
        B.cyl(NS('paint'), K.ink, 0.75, 0.2, 0, 0, 0, { rx: HP, seg: 14 });
        B.box('paint', K.charcoal, 0.4, 1.6, 0.35, 0, -0.9, 0.15, { r: 0.05 });
        B.box('paint', K.charcoal, 1.6, 0.35, 0.4, 0, -1.7, 0.2, { r: 0.08 });
        rodT(B, NS('metal'), K.charcoal, [0, 0.2, 0.1], [0.1, 1.5, -0.6], 0.07, 5);
        B.pop();
        const tn = 9, hwn = hullHW(tn, YD - 0.8, Bm, Lb);
        B.push(Bm / 2 + s * (hwn + 0.06), YD - 1.3, -tn, s * HP + (s > 0 ? 0.28 : -0.28) * 0 + (s > 0 ? 0 : 0));
        letters(B, o.name ?? 'TIDEBANK', { h: 0.9, x: 0, y: 0, z: 0, c: K.white, flat: true, wt: 0.19, track: 0.14 });
        B.pop();
        for (let k = 0; k < 5; k++) { const hw2 = hullHW(1.6, -1.4 + k * 0.9, Bm, Lb); B.push(Bm / 2 + s * (hw2 + 0.03), -1.4 + k * 0.9, -1.6, s * HP); letters(B, String(12 + k), { h: 0.3, x: 0, y: 0, z: 0, c: K.white, flat: true, wt: 0.22 }); B.pop(); }
      }
      // plating seams along the parallel midbody (both sides), bow-thruster marks, pilot door + stern draft marks
      for (const sx of [-1, 1]) {
        const xs = sx < 0 ? -0.012 : Bm + 0.012;
        for (const yy of [0.9, 2.6]) pbox(B, NS('paint'), shade(hc, 0.8), 0.02, 0.05, L - Lb - 2, xs, yy, -(L + Lb) / 2);
        for (let t = Lb + 6; t < L - 2; t += 9) pbox(B, NS('paint'), shade(hc, 0.82), 0.02, YD + 0.7, 0.05, xs, (YD - 0.8) / 2, -t);
        const tb = 3.2, hwb = hullHW(tb, 1.4, Bm, Lb);
        B.push(Bm / 2 + sx * (hwb + 0.04), 1.4, -tb, sx * HP);
        B.cyl(NS('paint'), K.white, 0.55, 0.01, 0, 0, 0, { rx: HP, seg: 18 });
        B.cyl(NS('paint'), hc, 0.45, 0.012, 0, 0, 0.002, { rx: HP, seg: 18 });
        for (const a of [PI / 4, -PI / 4]) pbox(B, NS('paint'), K.white, 0.08, 0.9, 0.012, 0, 0, 0.004, { rz: a });
        B.pop();
        B.push(xs, 0, -(L - 8), sx * HP);
        pbox(B, NS('paint'), shade(hc, 0.75), 0.9, 1.4, 0.02, 0, 1.4, 0);
        for (let k = 0; k < 5; k++) letters(B, String(12 + k), { h: 0.3, x: 3, y: -1.4 + k * 0.9, z: 0, c: K.white, flat: true, wt: 0.22 });
        B.pop();
      }
      // hull-side line name, big, on the quay side
      B.push(-0.03, 0, -(Lb + (L - Lb) * 0.38), -HP);
      letters(B, o.line ?? 'TIDEBANK', { h: 3.2, x: 0, y: 0.4, z: 0, c: K.white, flat: true, wt: 0.2, track: 0.16 });
      B.pop();
      // ---- deck cargo: bays of 40' boxes behind the breakwater (lashing bridges between bays), stepped silhouette
      const pal = ['#a8583f', '#3d5f8c', '#3f8580', '#c99a3c', '#858c93', '#56794f', '#e4e2da', '#7d3f45', '#34435f', '#c47440', '#b9b3a7', '#5a6f86'];
      const nRow = Math.floor((Bm - 1.6) / 2.54), x0 = (Bm - nRow * 2.54) / 2 + 1.27;
      let bz = tF + 2.2, bay = 0;
      const tStern = L - 30;                                    // superstructure begins here
      while (bz + 12.2 < tStern) {
        const hcap = bz < Lb ? 2 : 3 + ((bay * 7) % 3 === 0 ? 1 : 0);
        for (let r = 0; r < nRow; r++) {
          const xr = x0 + r * 2.54, edge = Math.min(r, nRow - 1 - r);
          const hw = hullHW(bz, YD, Bm, Lb);
          if (Math.abs(xr - Bm / 2) > hw - 1.5) continue;
          const tiers = Math.max(1, Math.min(hcap + (edge > 1 ? 1 : 0), Math.round(hcap - 0.4 + rnd() * 1.6)));
          for (let k = 0; k < tiers; k++) {
            const cc = pal[Math.floor(rnd() * pal.length)];
            pbox(B, 'paint', cc, 2.44, 2.56, 12.14, xr, YD + 1.3 + 2.6 * k + 1.28, -(bz + 6.1));
            pbox(B, NS('paint'), shade(cc, 0.72), 2.46, 0.12, 12.16, xr, YD + 1.3 + 2.6 * k + 0.06, -(bz + 6.1));
          }
        }
        // hatch coaming under the bay + lashing bridge aft of it
        pbox(B, 'paint', shade(K.deck, 0.9), Bm - 2.4, 1.3, 12.4, Bm / 2, YD + 0.65, -(bz + 6.1));
        const lz = -(bz + 12.9);
        for (const yy of [YD + 1.3, YD + 3.9]) pbox(B, NS('metal'), K.galvDk, Bm - 2, 0.08, 1.0, Bm / 2, yy, lz);
        for (let x = 1.6; x < Bm - 1; x += 3.2) pbox(B, NS('paint'), K.crane, 0.12, 5.2, 0.12, x, YD + 2.6, lz + 0.45);
        bz += 13.6; bay++;
      }
      // ---- accommodation block, bridge + wings, funnel
      const tA = tStern + 2, zA = -(tA + 6);
      B.box('paint', K.white, 18, 20, 11, Bm / 2, YD + 10, zA, { r: 0.12 });
      for (let k = 0; k < 7; k++) {
        const yy = YD + 1.8 + k * 2.75;
        for (const s of [-1, 1]) pbox(B, NS('glow'), '#ffe6b8', 0.04, 0.7, 9.6, Bm / 2 + s * 9.01, yy, zA, { glow: 1.1 });
        pbox(B, NS('glow'), '#ffe6b8', 15, 0.7, 0.04, Bm / 2, yy, zA + 5.51, { glow: 1.1 });
        pbox(B, NS('paint'), K.offwhite, 18.2, 0.12, 11.2, Bm / 2, yy - 0.75, zA);
      }
      B.box('paint', K.white, Bm + 1.2, 2.6, 5.5, Bm / 2, YD + 21.3, zA + 2.6, { r: 0.1 });
      pbox(B, NS('gloss'), K.glass, Bm + 1.0, 1.1, 0.05, Bm / 2, YD + 21.6, zA + 5.37);
      pbox(B, NS('paint'), hc, Bm + 1.3, 0.35, 5.6, Bm / 2, YD + 22.7, zA + 2.6);
      B.cyl('paint', K.offwhite, 0.2, 6, Bm / 2, YD + 25.6, zA, { seg: 8 });
      pbox(B, NS('paint'), K.offwhite, 4, 0.18, 0.4, Bm / 2, YD + 27.5, zA);
      B.blink('#ff4030', Bm / 2, YD + 28.8, zA, { size: 0.14, rate: 0.5, lo: 0.3, hi: 5 });
      const zF = zA - 9;
      B.add('paint', frustumGeo(6, 7, 5, 6, 12), hc, Bm / 2, YD + 10, zF, {});
      pbox(B, NS('paint'), K.white, 5.1, 2.0, 6.1, Bm / 2, YD + 19.4, zF);
      pbox(B, NS('paint'), K.ink, 5.1, 0.8, 6.1, Bm / 2, YD + 21.6, zF);
      // off-limits colliders (a special can take you out here; you slide off into the sea): hull + cargo, bow, house
      B.col(0, -2.5, -(L - 1), Bm, 14, -Lb, { roof: true });
      B.col(Bm * 0.25, -2.5, -Lb, Bm * 0.75, YF, -3, { roof: true });
      B.col(Bm / 2 - 9, YD, zA - 5.5, Bm / 2 + 9, YD + 22.5, zA + 5.5, { roof: true });
      // ---- quay side: pneumatic fenders + mooring lines to the quay bollards
      for (const fz of o.fenders ?? [-28, -42, -56, -70, -84]) {
        B.push(-gap / 2, SEA + 0.55, fz, 0, 0, 0);
        B.lathe('paint', K.rubber, [[0, -2.3], [0.7, -2.2], [1.15, -1.6], [1.2, -0.8], [1.2, 0.8], [1.15, 1.6], [0.7, 2.2], [0, 2.3]], 0, 0, 0, { seg: 14, rx: HP });
        for (let k = -3; k <= 3; k++) B.tor(NS('paint'), '#3b3e44', 1.22, 0.07, 0, 0, k * 0.62, { rs: 4, ts: 16 });
        B.pop();
        rope(B, [-gap + 0.3, 0.1, fz], [-gap / 2, SEA + 1.8, fz], 0.2, 0.03, K.charcoal);
      }
      // mooring lines: [fairlead t, quay bollard z] (local), down to the tee-head bollards on the quay
      for (const [tz, qz] of o.lines ?? [[-5, -4], [-16, -14], [-28, -24], [-40, -24], [-56, -35]]) {
        const fx = tz > -Lb ? Bm / 2 - hullHW(-tz, YF, Bm, Lb) - 0.05 : -0.05, fy = tz > -Lb ? YF - 0.3 : YD - 0.3;
        rope(B, [fx, fy, tz], [-gap - 0.6, 0.55, qz], 0.9, 0.05);
        B.box(NS('paint'), K.charcoal, 0.3, 0.5, 0.7, fx + 0.1, fy, tz, { r: 0.08 });
      }
    },
  };

  // ================================================================================================ the slice (Long Stages)
  // RTG 41: a rubber-tyred gantry parked across the truck lane (pos = centre on the ground; its sills run along local Z at
  // x = ±xl, the span across X). Each sill rides two 2-wheel bogies (sill colliders: 1.3 m cover, walkable, never
  // inkable); four tapered legs (off-limits tops); side girders + portal beams at yt; trolley over the lane with the
  // operator cab hanging below it and the spreader hoisted empty (no collider: it would roof the transfer platform);
  // the diesel house on the +X girder; a caged ladder up one leg; floods over the lane; beacons. The whole top frame
  // is off limits (roof: a special can get you up there, you slide off). Same livery as the backyard's RTG 22.
  D.kelpline_rtg = {
    desc: 'Rubber-tyred gantry crane parked across a lane (pos = centre on the ground, sills along local Z at x = ±xl): tyred bogies, sill beams (colliders, 1.3 m), four tapered white legs, blue side girders + portal beams at yt, trolley with a hanging cab and the spreader hoisted empty, diesel house, caged ladder, floods, beacons, RTG number + KELPLINE lettering. Top frame off limits (roof).',
    params: { xl: 'sill centre |x| (8.09)', lz: 'leg z (3.15)', yt: 'top of the legs (15)', sill: 'sill length (7.2)', tx: 'trolley x (0)', num: 'RTG 41' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const XL = o.xl ?? 8.09, LZ = o.lz ?? 3.15, YT = o.yt ?? 15, SL = o.sill ?? 7.2, rc = '#3e6fa8', rd = shade(rc, 0.78), wc = K.white, num = o.num ?? 'RTG 41';
      for (const sx of [-1, 1]) {
        const x = sx * XL;
        // sill beam on its bogies (2 wheels in line each end), hazard ends, buffer blocks
        B.box('paint', rc, 0.9, 0.62, SL, x, 1.0, 0, { r: 0.06 });
        for (const ez of [-1, 1]) { B.push(x, 1.0, ez * (SL / 2 + 0.005), ez > 0 ? 0 : PI); hazard(B, 0.86, 0.5, 0, 0, 0); B.pop(); }
        for (const bz of [-(SL / 2 - 1.15), SL / 2 - 1.15]) {
          B.box('paint', rd, 0.8, 0.5, 2.1, x, 0.95, bz, { r: 0.05 });
          for (const wz of [-0.55, 0.55]) tyre(B, x, 0.6, bz + wz, 0.6, 0.46);
        }
        B.col(x - 0.45, 0, -SL / 2, x + 0.45, 1.3, SL / 2);
        // legs (wider at the foot), a tie beam between them above head height + a K brace, the leg number
        for (const sz of [-1, 1]) {
          B.add('paint', frustumGeo(0.9, 1.2, 0.7, 0.8, YT - 1.3), wc, x, 1.3, sz * LZ, {});
          pbox(B, NS('paint'), rc, 0.94, 0.5, 1.24, x, 1.55, sz * LZ);
          B.col(x - 0.45, 0, sz * LZ - 0.6, x + 0.45, YT, sz * LZ + 0.6, { roof: true });
        }
        pbox(B, 'paint', wc, 0.5, 0.6, LZ * 2 - 0.8, x, 7.2, 0);
        for (const sz of [-1, 1]) beam(B, 'paint', wc, [x, 7.5, 0], [x, YT - 1.2, sz * (LZ - 0.5)], 0.4, 0.4);
        B.push(x - sx * 0.46, 0, -LZ, -sx * HP); letters(B, num.replace('RTG ', ''), { h: 0.8, x: 0, y: 4.2, z: 0.01, c: rc, flat: true, wt: 0.2 }); B.pop();
        // side girder over the legs
        B.box('paint', rc, 0.9, 1.3, LZ * 2 + 1.6, x, YT + 0.65, 0, { r: 0.06 });
      }
      // portal beams across the span (lettering both faces), trolley rails on them
      for (const sz of [-1, 1]) {
        B.box('paint', rc, XL * 2 + 1.2, 1.4, 1.0, 0, YT + 0.7, sz * LZ, { r: 0.07 });
        pbox(B, NS('metal'), K.greyDk, XL * 2 - 1.0, 0.12, 0.14, 0, YT + 1.46, sz * LZ);
        B.push(0, YT, sz * (LZ + 0.505), sz > 0 ? 0 : PI);
        letters(B, num, { h: 0.72, x: -XL / 2, y: 0.34, z: 0, c: K.white, flat: true, wt: 0.2, track: 0.14 });
        letters(B, 'KELPLINE', { h: 0.62, x: XL / 2, y: 0.38, z: 0, c: K.white, flat: true, wt: 0.2, track: 0.16 });
        B.pop();
        for (let x = -XL + 2.5; x <= XL - 2.4; x += 4.7) flood(B, x, YT - 0.1, sz * (LZ - 0.6), { rx: -0.25 * sz, glow: 1.7 });
      }
      // trolley (parked at tx, off the lane's middle so the map shows what's under the portal), the operator cab below
      // it, ropes down to the spreader hoisted empty
      const TX = o.tx ?? 0;
      B.box('paint', rc, 3.0, 1.2, LZ * 2 + 1.4, TX, YT + 2.1, 0, { r: 0.08 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl('metal', K.greyDk, 0.3, 0.26, TX + sx * 1.1, YT + 1.6, sz * LZ, { rx: HP, seg: 12 });
      B.box('paint', wc, 1.6, 2.0, 1.9, TX - 1.0, YT - 0.9, -LZ + 1.3, { r: 0.08 });
      pbox(B, NS('gloss'), K.glassLt, 1.4, 1.2, 0.04, TX - 1.0, YT - 0.8, -LZ + 2.27);
      pbox(B, NS('gloss'), K.glassLt, 0.04, 1.1, 1.5, TX - 1.82, YT - 0.8, -LZ + 1.3);
      pbox(B, NS('gloss'), K.glass, 1.2, 0.04, 1.4, TX - 1.0, YT - 1.92, -LZ + 1.3);
      const SY = 10.2;
      for (const sx of [-0.7, 0.7]) for (const sz of [-4.6, 4.6]) rodT(B, NS('metal'), K.galvDk, [TX + sx * 0.5, YT + 1.5, sz * 0.35], [TX + sx, SY + 0.3, sz], 0.035, 4);
      B.box('paint', K.crane, 2.2, 0.35, 12.2, TX, SY + 0.18, 0, { r: 0.05 });
      B.box('paint', K.craneDk, 1.1, 0.5, 2.4, TX, SY + 0.5, 0, { r: 0.05 });
      for (const sz of [-1, 1]) { pbox(B, 'paint', K.craneDk, 2.6, 0.3, 0.4, TX, SY + 0.16, sz * 5.9); for (const sx of [-1, 1]) B.box(NS('paint'), K.ink, 0.32, 0.45, 0.32, TX + sx * 1.12, SY - 0.05, sz * 6.0, { r: 0.03 }); }
      // diesel house on the +X girder: radiator louvres, exhaust stack, KELPLINE panel; beacons at both top corners
      B.box('paint', wc, 2.4, 2.1, 4.8, XL + 0.2, YT + 2.35, 0, { r: 0.08 });
      for (let k = 0; k < 6; k++) pbox(B, NS('paint'), K.greyDk, 0.03, 1.2, 0.08, XL + 1.41, YT + 2.3, -1.6 + k * 0.62);
      B.cyl('metal', K.charcoal, 0.12, 1.4, XL - 0.4, YT + 4.0, 1.5, { seg: 8 });
      B.push(XL + 0.2, YT + 2.35, 2.41); letters(B, 'KELPLINE', { h: 0.3, x: 0, y: -0.15, z: 0, c: rc, flat: true, wt: 0.22 }); B.pop();
      for (const sx of [-1, 1]) { B.cyl('paint', '#e8962f', 0.1, 0.18, sx * XL, YT + 1.42, LZ + 0.3, { seg: 10 }); B.blink('#ffa030', sx * XL, YT + 1.56, LZ + 0.3, { size: 0.1, rate: 0.9, phase: sx, lo: 0.3, hi: 5 }); }
      // caged ladder up the outside of the −X, −Z leg (starts above head height)
      {
        const x = -XL - 0.62, z = -LZ;
        for (const dz of [-0.24, 0.24]) pbox(B, NS('metal'), K.hazY, 0.05, YT - 2.4, 0.05, x, 2.4 + (YT - 2.4) / 2, z + dz);
        for (let y = 2.6; y < YT; y += 0.3) pbox(B, NS('metal'), K.hazY, 0.04, 0.03, 0.48, x, y, z);
        for (let y = 3.2; y < YT; y += 1.2) B.tor(NS('metal'), K.hazY, 0.4, 0.02, x - 0.2, y, z, { rs: 4, ts: 12, arc: PI, rz: HP, ry: -HP });
      }
      // off-limits top frame: girders + portal beams, the trolley, the diesel house
      B.col(-XL - 0.6, YT, -LZ - 0.8, XL + 0.6, YT + 1.5, LZ + 0.8, { roof: true });
      B.col(TX - 1.5, YT + 1.5, -LZ - 0.7, TX + 1.5, YT + 2.7, LZ + 0.7, { roof: true });
      B.col(XL - 1.0, YT + 1.3, -2.4, XL + 1.4, YT + 3.4, 2.4, { roof: true });
    },
  };

  // Transfer platform dressing (pos = bottom centre of the w × d × h deck block; a stair of width sw at both ±Z ends):
  // plated sides with stiffeners and flanges (the plates are the block's own faces: they take ink between the ribs), a
  // hazard band under the top edge, TRANSFER POINT boards on the long sides, corner handrails either side of each stair
  // head (rail colliders; the long sides stay open in the middle so you can drop off), the lashers' booth on the deck
  // (roof collider), a lashing-bar rack (collider, a step), a cone bin, a lamp mast on the booth.
  D.kelpline_tp = {
    desc: 'Transfer platform dressing (pos = bottom centre of its w × d × h deck block, stairs of width sw at both ±Z ends): plated sides with stiffeners, flanged top edge + hazard band, TRANSFER POINT 4B boards, corner handrails (rail colliders), the lashers\' booth (roof), a lashing-bar rack (collider), a cone bin.',
    params: { w: 'x size (6)', d: 'z size (5.6)', h: 'deck height (2.4)', sw: 'stair width (3)', name: '4B' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const w = o.w ?? 6, d = o.d ?? 5.6, h = o.h ?? 2.4, sw = o.sw ?? 3, c = '#4f6d8c', dk = shade(c, 0.78), HR = 1.0;
      // one side face: along local +X of the pushed frame, the face at z = 0 facing +Z; `hole` = the stair's span
      const side = (len, depth, ry, hole, label) => {
        B.push(Math.sin(ry) * depth / 2, 0, Math.cos(ry) * depth / 2, ry);
        const spans = hole ? [[-len / 2, -hole / 2], [hole / 2, len / 2]] : [[-len / 2, len / 2]];
        for (const [a, b] of spans) {
          const m = (a + b) / 2, L = b - a;
          pbox(B, 'paint', dk, L + 0.02, 0.12, 0.04, m, 0.06, 0.02);                       // base flange
          pbox(B, 'paint', dk, L + 0.02, 0.08, 0.06, m, h - 0.04, 0.03);                     // top edge angle
          B.push(m, h - 0.2, 0.012); hazard(B, L - 0.06, 0.16, 0, 0, 0, { pitch: 0.3 }); B.pop();
          for (let x = a + 0.45; x < b - 0.2; x += 0.9) pbox(B, NS('paint'), shade(c, 0.9), 0.07, h - 0.46, 0.035, x, (h - 0.28) / 2 + 0.12, 0.0175);
        }
        if (label) {
          pbox(B, NS('paint'), K.blueDk, 2.9, 0.46, 0.02, 0, h * 0.52, 0.045);
          letters(B, label, { h: 0.24, x: 0, y: h * 0.52 - 0.12, z: 0.056, c: K.white, flat: true, wt: 0.2, track: 0.12 });
        }
        B.pop();
      };
      side(w, d, 0, sw, null); side(w, d, PI, sw, null);
      side(d, w, HP, 0, 'TRANSFER ' + (o.name ?? '4B')); side(d, w, -HP, 0, 'TRANSFER ' + (o.name ?? '4B'));
      // handrails: beside both stair heads (across the ends) and 1.6 m down each long side from the corners
      const rail = (a, b) => {
        handrail(B, [a[0], h, a[1]], [b[0], h, b[1]], HR, K.crane);
        B.col(Math.min(a[0], b[0]) - 0.05, h, Math.min(a[1], b[1]) - 0.05, Math.max(a[0], b[0]) + 0.05, h + HR + 0.05, Math.max(a[1], b[1]) + 0.05, { rail: true });
      };
      const ex = w / 2 - 0.06, ez = d / 2 - 0.06;
      for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
        rail([sx * (sw / 2 + 0.06), sz * ez], [sx * ex, sz * ez]);
        rail([sx * ex, sz * ez], [sx * ex, sz * (ez - 1.5)]);
      }
      // the lashers' booth (+X, base-side corner of the deck): steel box, glazed all round, roof with drip edge, sign
      {
        const bx = 2.205, bz = -1.75, bw = 1.35, bd = 1.9, bh = 2.25, y0 = h;
        B.push(bx, y0, bz);
        B.box('paint', '#e6e8ea', bw, bh, bd, 0, bh / 2, 0, { r: 0.05 });
        B.box('paint', K.blueDk, bw + 0.16, 0.12, bd + 0.16, 0, bh + 0.06, 0, { r: 0.03 });
        for (const f of [1, -1]) {
          pbox(B, NS('gloss'), K.glass, bw - 0.4, 0.8, 0.03, 0, 1.45, f * (bd / 2 + 0.005));
          pbox(B, NS('glow'), '#ffe2b0', bw - 0.46, 0.22, 0.01, 0, 1.68, f * (bd / 2 + 0.02), { glow: 0.7 });
        }
        pbox(B, NS('gloss'), K.glass, 0.03, 0.8, bd - 0.5, bw / 2 + 0.005, 1.45, 0);
        pbox(B, NS('paint'), '#5d6b78', 0.03, 1.95, 0.8, -bw / 2 - 0.005, 1.0, 0.2);                 // door (−X, toward the lane's middle)
        B.push(0, bh - 0.32, bd / 2 + 0.02); pbox(B, NS('paint'), K.hazY, 1.2, 0.22, 0.01, 0, 0, 0); letters(B, 'LASHING', { h: 0.12, x: 0, y: -0.06, z: 0.006, c: K.ink, flat: true, wt: 0.24 }); B.pop();
        B.box('paint', '#e6e8ea', 0.5, 0.4, 0.25, 0.3, bh - 0.5, -bd / 2 - 0.12, { r: 0.03 });   // AC
        // lamp mast on the booth's corner: two floods over the deck
        B.cyl('metal', K.galv, 0.05, 2.0, bw / 2 - 0.1, bh + 1.0, bd / 2 - 0.1, { seg: 8 });
        flood(B, bw / 2 - 0.4, bh + 2.0, bd / 2 - 0.4, { rx: -0.9, ry: PI * 0.75, glow: 1.6 });
        B.pop();
        B.col(bx - bw / 2, y0, bz - bd / 2, bx + bw / 2, y0 + bh + 0.12, bz + bd / 2, { roof: true });
      }
      // lashing-bar rack (−X, mid-side corner): a steel frame of bars + turnbuckles (solid: cover, a step), cone bin
      {
        const rx = -2.13, rz = 2.15, rw = 1.5, rd = 1.1, rh = 1.1;
        B.push(rx, h, rz);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) pbox(B, 'metal', K.galvDk, 0.08, rh, 0.08, sx * (rw / 2 - 0.04), rh / 2, sz * (rd / 2 - 0.04));
        pbox(B, 'metal', K.galvDk, rw, 0.08, rd, 0, 0.1, 0);
        // (bars lie along the stillage in layers — laid flat, so nobody reads it as a stair)
        for (let k = 0; k < 5; k++) for (let j = 0; j < 7; j++) B.cyl(NS('metal'), (j + k) % 5 ? '#8a8f8a' : '#c49a3a', 0.035, rw - 0.12, 0, 0.24 + k * 0.16, -rd / 2 + 0.16 + j * ((rd - 0.32) / 6), { rz: HP, seg: 5 });
        for (const sx of [-1, 1]) pbox(B, 'metal', K.galvDk, 0.06, 0.06, rd, sx * (rw / 2 - 0.04), rh - 0.03, 0);
        pbox(B, NS('paint'), K.hazY, 0.4, 0.16, 0.01, 0, rh * 0.6, rd / 2 + 0.005);
        B.pop();
        B.col(rx - rw / 2, h, rz - rd / 2, rx + rw / 2, h + rh, rz + rd / 2);
        subNC(B, 'kelpline_cage', -2.3, h, -2.2, 0, { variant: 1 });
        B.col(-2.9, h, -2.7, -1.7, h + 0.9, -1.7, { rail: true });
      }
    },
  };

  // Lashing store: a steel shed on the reefer side of the slice (pos = floor centre of its w × d × h block, the loading
  // dock of depth dk × 1.2 along its +X side). Low-pitch roof (off limits), corner + base trims, two roller shutters on
  // the dock side under a cantilevered canopy (roof collider) and a fascia sign, dock bumpers and lamps, a door +
  // windows on the +Z end, clerestory strip + downpipes on the −X side, pallets of lashing bars on the dock (colliders).
  // The dock side and the +Z end are dressed facades (layout.js makes them un-inkable); the −X side and −Z end take ink.
  D.kelpline_store = {
    desc: 'Lashing store (pos = floor centre of its w × d × h block, a 1.2 m loading dock of depth dk along +X): low-pitch roof, trims, roller shutters under a cantilevered canopy, LASHING STORE fascia, dock bumpers + lamps, door + windows on the +Z end, clerestory + downpipes on −X, pallets of lashing bars on the dock. Colliders: roof, canopy (roof), pallets.',
    params: { w: 'x size', d: 'z size', h: 'eaves height (4.4)', dk: 'dock depth (2.06)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const w = o.w ?? 5.46, d = o.d ?? 11.9, h = o.h ?? 4.4, dk = o.dk ?? 2.06, wall = '#8fa3a8', trim = K.blueDk, rf = '#6f8088';
      // roof: two slopes to a ridge along Z (0.7 m rise), gutters along the eaves, verge trims at the gable ends
      B.add('paint', tpl(['kstroof', w, d].map(kf).join('|'), () => {
        const g = new GB(), hw = w / 2 + 0.25, hd = d / 2 + 0.2, rh = 0.7;
        g.face([[-hw, 0, -hd], [0, rh, -hd], [0, rh, hd], [-hw, 0, hd]], [-0.3, 1, 0]);
        g.face([[hw, 0, -hd], [hw, 0, hd], [0, rh, hd], [0, rh, -hd]], [0.3, 1, 0]);
        for (const sz of [-1, 1]) g.face([[-hw, 0, sz * hd], [hw, 0, sz * hd], [0, rh, sz * hd]], [0, 0, sz]);
        return g.geo();
      }), rf, 0, h, 0, {});
      for (const sx of [-1, 1]) pbox(B, 'paint', trim, 0.14, 0.14, d + 0.4, sx * (w / 2 + 0.28), h - 0.02, 0);
      for (const sz of [-1, 1]) pbox(B, NS('paint'), trim, w + 0.5, 0.1, 0.08, 0, h + 0.05, sz * (d / 2 + 0.2));
      // corner trims + base plinth band
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pbox(B, NS('paint'), trim, 0.12, h, 0.12, sx * (w / 2 + 0.01), h / 2, sz * (d / 2 + 0.01));
      // ---- the dock side (+X face at x = w/2): two roller shutters, frames, canopy, fascia sign, lamps, bumpers
      B.push(w / 2, 0, 0, HP);   // local +Z = out of the dock-side face
      for (const zc of [-d / 4, d / 4]) {
        const dw = 3.0, y0 = 1.2, dh = 2.5;
        pbox(B, 'paint', '#c9ced2', dw, dh, 0.03, zc, y0 + dh / 2, 0.015);
        for (let y = y0 + 0.1; y < y0 + dh; y += 0.12) pbox(B, NS('paint'), '#aeb4b9', dw - 0.04, 0.025, 0.02, zc, y, 0.035);
        for (const sx of [-1, 1]) pbox(B, NS('paint'), K.hazY, 0.14, dh + 0.1, 0.06, zc + sx * (dw / 2 + 0.07), y0 + dh / 2, 0.03);
        pbox(B, 'paint', trim, dw + 0.4, 0.26, 0.2, zc, y0 + dh + 0.13, 0.1);
      }
      // cantilevered canopy over the dock (brackets from the wall), fascia with the sign
      const cy = h - 0.35;
      pbox(B, 'paint', '#dfe3e6', d - 0.4, 0.16, dk + 0.2, 0, cy, (dk + 0.2) / 2);
      pbox(B, 'paint', trim, d - 0.3, 0.42, 0.08, 0, cy + 0.05, dk + 0.24);
      B.push(0, cy + 0.05, dk + 0.285); letters(B, 'LASHING STORE', { h: 0.26, x: 0, y: -0.13, z: 0, c: K.white, flat: true, wt: 0.2, track: 0.14 }); B.pop();
      for (let z = -d / 2 + 0.6; z <= d / 2 - 0.5; z += (d - 1.1) / 3) beam(B, NS('paint'), trim, [z, cy - 0.9, 0.02], [z, cy - 0.06, dk], 0.08, 0.08);
      for (let z = -d / 2 + 1.5; z < d / 2 - 1; z += 2.4) pbox(B, NS('glow'), K.lampCool, 1.0, 0.02, 0.2, z, cy - 0.09, dk * 0.6, { glow: 2.4 });
      // dock face bumpers (on the dock block's outer face, x = w/2 + dk) where the RTG sill doesn't stand
      for (const z of [d / 2 - 0.8, d / 2 - 2.8, d / 2 - 4.8]) B.box('paint', K.rubber, 0.36, 0.4, 0.14, z, 0.7, dk + 0.07, { r: 0.04 });   // (the base end: the RTG's sill stands against the mid end)
      pbox(B, NS('paint'), K.hazY, d - 0.2, 0.06, 0.02, 0, 1.17, dk + 0.01);
      B.pop();
      B.col(w / 2, cy - 0.08, -d / 2 + 0.2, w / 2 + dk + 0.2, cy + 0.26, d / 2 - 0.2, { roof: true });
      // ---- the +Z end (toward cross aisle C): a door with a canopy hood, two windows, a sign, a wall lamp
      B.push(0, 0, d / 2, 0);
      pbox(B, 'paint', '#5d6b78', 1.0, 2.1, 0.04, -1.2, 1.05, 0.02);
      pbox(B, NS('metal'), K.galv, 0.05, 0.22, 0.06, -0.85, 1.05, 0.06);
      pbox(B, 'paint', trim, 1.4, 0.08, 0.5, -1.2, 2.3, 0.25);
      for (const wx of [0.6, 1.9]) { pbox(B, NS('gloss'), K.glass, 0.9, 0.9, 0.02, wx, 1.7, 0.012); pbox(B, NS('glow'), '#ffe2b0', 0.84, 0.3, 0.01, wx, 1.95, 0.025, { glow: 0.7 }); pbox(B, 'paint', K.white, 1.0, 0.06, 0.06, wx, 1.22, 0.03); }
      pbox(B, 'paint', K.blueDk, 3.2, 0.42, 0.03, 0.4, 3.35, 0.015);
      letters(B, 'LASHING STORE · 4B', { h: 0.2, x: 0.4, y: 3.25, z: 0.035, c: K.white, flat: true, wt: 0.22 });
      flood(B, -1.2, 2.75, 0.3, { rx: 0.6, c: K.charcoal, lamp: K.lamp, glow: 1.0 });
      B.pop();
      // ---- the −X side: clerestory strip (lit at dusk), downpipes at the ends
      B.push(-w / 2, 0, 0, -HP);
      pbox(B, NS('gloss'), K.glass, d - 2.0, 0.4, 0.02, 0, h - 0.6, 0.012);
      pbox(B, NS('glow'), '#ffe2b0', d - 2.1, 0.12, 0.01, 0, h - 0.66, 0.024, { glow: 0.5 });
      for (const z of [-d / 2 + 0.35, d / 2 - 0.35]) B.cyl(NS('paint'), trim, 0.06, h - 0.1, z, (h - 0.1) / 2, 0.1, { seg: 6 });
      B.pop();
      // ---- on the dock: two pallets of lashing bars (cover, a step up) and a pallet truck
      for (const [z, n] of [[-d / 2 + 2.2, 3], [d / 2 - 3.6, 2]]) {
        const x = w / 2 + dk / 2, ph = 0.14 + n * 0.28;
        B.push(x, 1.2, z);
        pbox(B, 'wood', '#a88a62', 1.0, 0.14, 1.2, 0, 0.07, 0);
        for (let k = 0; k < n; k++) for (let j = 0; j < 7; j++) rodT(B, NS('metal'), j % 3 ? '#8a8f8a' : '#c49a3a', [-0.42 + j * 0.14, 0.22 + k * 0.28, -0.56], [-0.42 + j * 0.14, 0.22 + k * 0.28, 0.56], 0.05, 5);
        for (const sz of [-0.35, 0.35]) pbox(B, NS('paint'), K.hazY, 1.02, ph - 0.1, 0.03, 0, (ph + 0.1) / 2, sz);
        B.pop();
        B.col(x - 0.5, 1.2, z - 0.6, x + 0.5, 1.2 + ph, z + 0.6);
      }
      B.push(w / 2 + dk / 2 + 0.1, 1.2, 0.4, 0.3);
      pbox(B, 'paint', K.red, 0.5, 0.12, 1.1, 0, 0.1, 0); B.cyl(NS('metal'), K.charcoal, 0.03, 1.0, 0, 0.6, -0.55, { seg: 6, rx: -0.3 });
      B.pop();
      // off-limits roof (the block's own top is off limits too; this catches the pitched sheets above it)
      B.col(-w / 2 - 0.25, h, -d / 2 - 0.2, w / 2 + 0.25, h + 0.72, d / 2 + 0.2, { roof: true });
    },
  };

  // Weighbridge office (front +Z, pos = bottom centre): a small cabin with a glazed front, door, AC, WEIGHBRIDGE 2 sign,
  // and beside it on a post the read-out board (GROSS … t, glowing digits) and a traffic signal. Collider: cabin (roof),
  // the post.
  D.kelpline_wbhut = {
    desc: 'Weighbridge office (front +Z): cabin with glazed front + side, door, AC, WEIGHBRIDGE 2 sign, read-out board on a post (glowing digits), red/green signal. Colliders: cabin (roof), post.',
    params: { w: 'm (2.6)', d: 'm (2.4)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const w = o.w ?? 2.6, d = o.d ?? 2.4, h = 2.6;
      B.box('paint', '#e9ecee', w, h, d, 0, h / 2 + 0.15, 0, { r: 0.06 });
      B.box('paint', K.concrete, w + 0.3, 0.15, d + 0.3, 0, 0.075, 0, { r: 0.03 });
      B.box('paint', K.blueDk, w + 0.2, 0.18, d + 0.2, 0, h + 0.24, 0, { r: 0.04 });
      pbox(B, NS('gloss'), K.glass, w - 0.4, 1.0, 0.03, 0, 1.75, d / 2 + 0.005);
      pbox(B, NS('glow'), '#ffe2b0', w - 0.46, 0.3, 0.01, 0, 2.05, d / 2 + 0.02, { glow: 0.8 });
      pbox(B, NS('gloss'), K.glass, 0.03, 1.0, d - 0.8, w / 2 + 0.005, 1.75, 0.1);
      pbox(B, NS('paint'), '#5d6b78', 0.03, 2.0, 0.85, -w / 2 - 0.005, 1.15, 0.5);
      B.box('paint', '#e6e8ea', 0.7, 0.5, 0.3, 0.4, 2.1, -d / 2 - 0.15, { r: 0.04 });
      B.push(0, h + 0.33, d / 2 + 0.11); pbox(B, 'paint', K.hazY, 2.2, 0.3, 0.04, 0, 0.1, 0); letters(B, 'WEIGHBRIDGE 2', { h: 0.14, x: 0, y: 0.03, z: 0.025, c: K.ink, flat: true, wt: 0.24 }); B.pop();
      B.col(-w / 2 - 0.15, 0, -d / 2 - 0.15, w / 2 + 0.15, h + 0.35, d / 2 + 0.15, { roof: true });
      // read-out board + signal on a post at the front corner
      const px = w / 2 + 0.6, pz = d / 2 + 0.2;
      B.cyl('metal', K.galv, 0.07, 3.4, px, 1.7, pz, { seg: 8 });
      B.push(px, 3.0, pz, 0);
      B.box('paint', K.ink, 1.4, 0.6, 0.14, 0, 0, 0, { r: 0.03 });
      letters(B, '28.4 T', { h: 0.28, x: 0, y: -0.14, z: 0.075, c: '#ff8a3a', flat: true, wt: 0.22, mat: 'glow', glow: 1.6 });
      B.pop();
      B.push(px, 2.2, pz + 0.12);
      B.box(NS('paint'), K.ink, 0.28, 0.6, 0.18, 0, 0, 0, { r: 0.03 });
      B.sph(NS('glow'), '#ff5a3c', 0.075, 0, 0.14, 0.09, { ws: 8, hs: 6, glow: 1.2 });
      B.sph(NS('glow'), '#63e08a', 0.075, 0, -0.14, 0.09, { ws: 8, hs: 6, glow: 1.8 });
      B.pop();
      B.col(px - 0.1, 0, pz - 0.1, px + 0.1, 3.4, pz + 0.1);
    },
  };

  // Block sign at a stack block's end (pos = pole base): a galvanised pole with a terminal-blue board carrying the block
  // id on both faces (read from the aisle), a lamp over it. Collider: the pole.
  D.kelpline_blocksign = {
    desc: 'Block id sign (pos = pole base): galvanised pole, blue board with the block id on both faces, a small lamp. Collider: pole.',
    params: { text: 'block id (4B)', h: 'board centre height (3.4)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const h = o.h ?? 3.4, txt = o.text ?? '4B';
      B.cyl('metal', K.galv, 0.07, h + 0.7, 0, (h + 0.7) / 2, 0, { seg: 8 });
      pbox(B, NS('metal'), K.galvDk, 0.3, 0.04, 0.3, 0, 0.02, 0);
      B.box('paint', K.blueDk, 1.3, 1.0, 0.08, 0, h, 0, { r: 0.03 });
      for (const f of [1, -1]) { B.push(0, h, f * 0.045, f > 0 ? 0 : PI); letters(B, txt, { h: 0.56, x: 0, y: -0.28, z: 0, c: K.white, flat: true, wt: 0.2, track: 0.1 }); B.pop(); }
      flood(B, 0, h + 0.75, 0.25, { rx: 0.7, c: K.charcoal, glow: 1.2 });
      B.col(-0.08, 0, -0.08, 0.08, h + 0.7, 0.08);
    },
  };

  // Folded flat racks stacked four high on a level block (pos = bottom centre, length along local Z, the block is the
  // collider): each layer's side beams, corner castings, folded end walls, two yellow straps round the stack
  D.kelpline_flatstack = {
    desc: 'Dressing for a stack of folded flat racks (pos = bottom centre of its 2.44 × h × 6.06 block, length along local Z): per-layer side beams, corner castings, folded end walls, straps. Non-colliding.',
    params: { h: 'stack height (1.3)', n: 'layers (4)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = 2.44, L = 6.06, H = o.h ?? 1.3, n = o.n ?? 4, lh = H / n, c = '#56794f', dk = shade(c, 0.7);
      for (let k = 0; k < n; k++) {
        const y = k * lh;
        for (const sx of [-1, 1]) pbox(B, NS('paint'), dk, 0.04, 0.12, L - 0.3, sx * (W / 2 + 0.02), y + 0.08, 0);
        for (const sz of [-1, 1]) pbox(B, NS('paint'), shade(c, 0.85), W - 0.3, lh - 0.08, 0.04, 0, y + lh / 2, sz * (L / 2 + 0.02));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) pbox(B, NS('paint'), K.ink, 0.2, 0.14, 0.2, sx * (W / 2 - 0.08), y + 0.07, sz * (L / 2 - 0.08));
      }
      for (const z of [-1.5, 1.5]) for (const sx of [-1, 1]) pbox(B, NS('paint'), K.hazY, 0.02, H, 0.06, sx * (W / 2 + 0.035), H / 2, z);
    },
  };

  // Container barge moored alongside the free (reefer-side) quay: quay-side hull plane at local x = 0 (the barge lies
  // toward +X, beam bm), centred on pos along Z (length L). Low hull with a gunwale and rubbing strakes, a hold coaming
  // and two rows of boxes 1–2 high, the liftable wheelhouse + accommodation at the local −Z end, name + registration,
  // tyre fenders on the quay side, mooring lines to the quay bollards (o.lines: [bitt z, bollard z], quay at x = −gap).
  // Visual only (outside the arena); its hull + cargo are off limits (roof: you slide off into the harbour).
  D.kelpline_barge = {
    desc: 'Container barge alongside (quay-side hull plane at local x = 0, the barge toward +X, centred on pos along Z): hull + gunwale + strakes, hold coaming, 20\'/40\' boxes in two rows, wheelhouse + accommodation at −Z, name, tyre fenders, mooring lines to the quay bollards. Visual only; hull + cargo off limits.',
    params: { length: 'm (27)', beam: 'm (9.4)', gap: 'quay gap m (0.9)', name: 'barge name', seed: 'cargo seed', lines: '[[bitt z, bollard z]]' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 27, Bm = o.beam ?? 9.4, gap = o.gap ?? 0.9, YD = -0.55, hull = '#2f3d4a', rnd = shipRng(o.seed ?? 31);
      // hull: box with a raked bow end at +Z, boot top, gunwale, strakes
      B.add('paint', tpl(['kbarge', L, Bm].map(kf).join('|'), () => {
        const g = new GB(), y0 = SEA - 1.2, y1 = YD, z0 = -L / 2, z1 = L / 2, rk = 1.6;
        g.face([[0, y0, z0], [0, y0, z1 - rk], [0, y1, z1], [0, y1, z0]], [-1, 0, 0]);
        g.face([[Bm, y0, z0], [Bm, y1, z0], [Bm, y1, z1], [Bm, y0, z1 - rk]], [1, 0, 0]);
        g.face([[0, y0, z1 - rk], [Bm, y0, z1 - rk], [Bm, y1, z1], [0, y1, z1]], [0, -0.6, 1]);
        g.face([[0, y0, z0], [0, y1, z0], [Bm, y1, z0], [Bm, y0, z0]], [0, 0, -1]);
        g.face([[0, y1, z0], [0, y1, z1], [Bm, y1, z1], [Bm, y1, z0]], [0, 1, 0]);
        return g.geo();
      }), hull, 0, 0, 0, {});
      for (const sx of [0, Bm]) {
        pbox(B, NS('paint'), '#8a3a30', 0.03, 0.5, L - 1.8, sx + (sx ? 0.012 : -0.012), SEA + 0.1, -0.9);
        pbox(B, 'paint', shade(hull, 0.8), 0.16, 0.3, L, sx + (sx ? 0.06 : -0.06), YD + 0.1, 0);
        pbox(B, NS('paint'), shade(hull, 0.75), 0.12, 0.12, L - 1, sx + (sx ? 0.06 : -0.06), YD - 0.5, -0.5);
      }
      // hold coaming and the cargo: two rows of boxes, 1–2 high, 20' and 40' bays
      const hz0 = -L / 2 + 6.2, hz1 = L / 2 - 1.6;
      pbox(B, 'paint', '#3b4a58', Bm - 1.2, 0.9, hz1 - hz0, Bm / 2, YD + 0.45, (hz0 + hz1) / 2);
      const pal = ['#a8583f', '#3d5f8c', '#3f8580', '#c99a3c', '#858c93', '#56794f', '#e4e2da', '#7d3f45', '#34435f', '#c47440'];
      for (let r = 0; r < 3; r++) {
        const xr = Bm / 2 + (r - 1) * 2.54;
        let z = hz0 + 0.2;
        while (z < hz1 - 6.2) {
          const len = z + 12.4 < hz1 && rnd() < 0.5 ? 12.19 : 6.06, t = 1 + (rnd() < 0.55 ? 1 : 0);
          for (let k = 0; k < t; k++) {
            const cc = pal[Math.floor(rnd() * pal.length)];
            pbox(B, 'paint', cc, 2.44, 2.56, len - 0.05, xr, YD + 0.9 + 2.6 * k + 1.28, z + len / 2);
            pbox(B, NS('paint'), shade(cc, 0.72), 2.46, 0.1, len - 0.03, xr, YD + 0.9 + 2.6 * k + 0.05, z + len / 2);
            pbox(B, NS('paint'), shade(cc, 0.78), 2.46, 2.4, 0.06, xr, YD + 0.9 + 2.6 * k + 1.3, z + len);
          }
          z += len + 0.12;
        }
      }
      // wheelhouse + accommodation at the −Z end: deckhouse, raised wheelhouse on a column, mast, radar, lights
      const az = -L / 2 + 3.0;
      B.box('paint', K.white, Bm - 1.6, 2.4, 4.6, Bm / 2, YD + 1.2, az, { r: 0.08 });
      for (const f of [1, -1]) pbox(B, NS('glow'), '#ffe6b8', 0.03, 0.5, 3.4, Bm / 2 + f * (Bm / 2 - 0.79), YD + 1.5, az, { glow: 0.9 });
      B.cyl('paint', K.white, 0.5, 3.0, Bm / 2 + 1.5, YD + 3.9, az + 0.6, { seg: 12 });
      B.box('paint', K.white, 3.4, 2.0, 2.4, Bm / 2 + 1.5, YD + 6.3, az + 0.6, { r: 0.08 });
      pbox(B, NS('gloss'), K.glass, 3.2, 0.8, 0.04, Bm / 2 + 1.5, YD + 6.6, az + 1.82);
      pbox(B, NS('gloss'), K.glass, 0.04, 0.8, 2.0, Bm / 2 + 1.5 - 1.71, YD + 6.6, az + 0.6);
      pbox(B, 'paint', '#c9453b', 3.6, 0.2, 2.6, Bm / 2 + 1.5, YD + 7.4, az + 0.6);
      B.cyl('metal', K.galv, 0.06, 2.4, Bm / 2 + 1.5, YD + 8.6, az + 0.6, { seg: 6 });
      pbox(B, NS('paint'), K.charcoal, 1.4, 0.1, 0.2, Bm / 2 + 1.5, YD + 9.2, az + 0.6);
      B.blink('#ff4030', Bm / 2 + 1.5, YD + 9.9, az + 0.6, { size: 0.1, rate: 0.5, lo: 0.3, hi: 5 });
      // name + registration on the quay side, bow and stern
      B.push(-0.1, 0, -L / 2 + 8.5, -HP); letters(B, o.name ?? 'EBB RUNNER', { h: 0.7, x: 0, y: YD - 0.95, z: 0, c: K.white, flat: true, wt: 0.2, track: 0.14 }); B.pop();
      B.push(Bm / 2, 0, -L / 2 - 0.01, PI); letters(B, (o.name ?? 'EBB RUNNER') + ' · INKOPOLIS', { h: 0.34, x: 0, y: YD - 0.7, z: 0, c: K.white, flat: true, wt: 0.22 }); B.pop();
      // bitts, tyre fenders on the quay side, mooring lines to the quay bollards
      for (const fz of [-L / 2 + 3, -L / 2 + 10, L / 2 - 10, L / 2 - 3]) {
        B.tor('paint', K.rubber, 0.36, 0.14, -0.14, YD - 0.4, fz, { rs: 6, ts: 12, ry: HP });
        rope(B, [0.2, YD + 0.2, fz], [-0.05, YD - 0.1, fz], 0.05, 0.02, K.charcoal);
      }
      for (const [bz, qz] of o.lines ?? [[-L / 2 + 1.2, -L / 2 - 4], [-2, -3], [L / 2 - 1.5, L / 2 + 3]]) {
        bollardPair(B, 0.9, YD, bz, HP);
        rope(B, [0.9, YD + 0.5, bz], [-gap - 0.55, 0.55, qz], 0.35, 0.045);
      }
      B.col(0, SEA - 1, -L / 2, Bm, YD + 0.9 + 5.2, L / 2, { roof: true });
      B.col(Bm / 2 - 0.2, YD, az - 0.6, Bm / 2 + 3.2, YD + 7.5, az + 1.8, { roof: true });
    },
  };

}


// ==================================================================================================== placements
// Authored in the berth's local frame (like layout.js) and turned with it at the end: pos → toWorld, rotY + ROT
// (`worldRot`: rotY is already a world angle — loose kit parked square to the harbour; `world`: pos + rotY untouched).
// Alpha half (−Z); every entry is mirrored (x,z) → (−x,−z), rotY + π, unless `mirror: false`.
// Container + stair dressing is generated from the layout's local pieces (every stack box / stair), so the geometry
// and its dressing never drift apart.
const CODES = ['KRKU', 'TDBU', 'CRLU', 'KLPU', 'SLTU', 'HLBU', 'INKU', 'TIDU'];
function autoDressing() {
  const out = [];
  let k = 0;
  for (const d of LOCAL.half) {
    const tag = d.tag || '', mode = { ...(d.onlyIn ? { onlyIn: d.onlyIn } : {}), ...(d.notIn ? { notIn: d.notIn } : {}) };
    if (d.kind === 'box' && tag === 'trailer') {
      out.push({ type: 'kelpline_box', pos: [(d.min[0] + d.max[0]) / 2, d.min[1], (d.min[2] + d.max[2]) / 2], rotY: 0, len: 20, color: d.color, door: 1, code: 'KLPU 204816', ...mode });
    } else if (d.kind === 'box' && (tag.startsWith('box:') || tag.startsWith('boxx:'))) {
      const [kind, len, door, reefer] = tag.split(':');
      const alongX = kind === 'boxx', dp = door === '1';
      const rotY = alongX ? (dp ? P / 2 : -P / 2) : (dp ? 0 : P);
      const cx = (d.min[0] + d.max[0]) / 2, cz = (d.min[2] + d.max[2]) / 2;
      const n = d.onlyIn ? k + 500 : k;
      const code = `${CODES[(n * 5 + 3) % CODES.length]} ${String(100000 + ((n * 7919 + 1234) % 899999)).slice(0, 6)}`;
      out.push({ type: 'kelpline_box', pos: [cx, d.min[1], cz], rotY, len: +len, color: d.color, door: 1, reefer: reefer === '1', code, ...mode });
      if (!d.onlyIn) k++;
    } else if (d.kind === 'ramp' && (tag === 'stair' || tag === 'ops-stair')) {
      const dx = d.high[0] - d.low[0], dz = d.high[2] - d.low[2];
      out.push({ type: 'kelpline_stair', pos: [...d.low], rotY: Math.atan2(dx, dz), run: Math.hypot(dx, dz), rise: d.high[1] - d.low[1], width: d.width, ...(tag === 'ops-stair' ? { c: '#2f5b8c' } : {}), ...mode });
    }
  }
  return out;
}

const Q = P / 4;
const DZ = STRETCH.d;
// The berth's dressing as it stood before the Long Stages stretch: every placement beyond the cut (layout.js
// beyondCut: the base end, the reefer-side depot) moves DZ toward the base with it; `final` ones are already drawn at
// their stretched place (the runs that cross the cut: crane rails, quay edges along the aprons)
const BERTH_PLACEMENTS = [
  // K7 at mid, idle between the two berths with its boom raised; the two ships alongside, bows pointing at mid
  { type: 'kelpline_crane', pos: [0, 0, 0], rotY: 0, mirror: false, boom: 80 },
  { type: 'kelpline_ship', pos: [27.5, 0, -14], rotY: 0, mirror: false, name: 'TIDEBANK', line: 'TIDEBANK', hull: '#2e3f5c', boot: '#a3453a', seed: 11 },
  { type: 'kelpline_ship', pos: [-27.5, 0, 14], rotY: P, mirror: false, name: 'CORAL MAXIMA', line: 'CORAL MAX', hull: '#3c4650', boot: '#35598a', seed: 23 },
  // crane rails along both aprons (the gate-side one stops at the water slot; the mirror copies run the Bravo half)
  { type: 'kelpline_rail', pos: [21, 0, -41 - DZ], rotY: -P / 2, length: 41 + DZ, stop: true, final: true },
  { type: 'kelpline_rail', pos: [-21, 0, -46.2 - DZ], rotY: -P / 2, length: 46.2 + DZ, stop: true, final: true },
  // the terminal beyond the back wall (visual) + the next crane along the quay, working the far end of each ship
  { type: 'kelpline_backyard', pos: [0, 0, -48], rotY: 0, seed: 5 },
  { type: 'kelpline_crane', pos: [0, 0, -64], rotY: 0, trolley: 40, num: 'K6', coarse: true },
  // Terminal Operations building (spawn) + control tower behind the back wall; high-mast lights behind the wall
  { type: 'kelpline_ops', pos: [0, 0, -47.4], rotY: 0, tx: -6.5 },
  { type: 'kelpline_mast', pos: [21.5, 0, -50.5] },
  { type: 'kelpline_mast', pos: [-19.5, 0, -50.5] },
  // flood-light poles: spawn deck back corners, the gate corner, the reefer corner
  { type: 'lightpole', pos: [6.4, 2.6, -46.9], rotY: 0, variant: 1, height: 6.5, color: '#b9c0c6' },
  { type: 'lightpole', pos: [-6.4, 2.6, -46.9], rotY: 0, variant: 1, height: 6.5, color: '#b9c0c6' },
  { type: 'lightpole', pos: [19.9, 0, -46.7], rotY: -0.6, variant: 0, height: 10, color: '#b9c0c6' },
  { type: 'lightpole', pos: [-23.2, 0, -37.2], rotY: 0.9, variant: 0, height: 10, color: '#b9c0c6' },
  // truck gate (left corner of the base; its canopy overhangs the water slot)
  { type: 'kelpline_gate', pos: [16.5, 0, -42.4], rotY: 0 },
  // quay edges along the new outline: bollards (low cover), cone fenders, ladders — the ships' lines run to the
  // bollards on the long ship-side edge. Runs go along local +X with the water on local +Z.
  { type: 'kelpline_quayedge', pos: [20.6, 0, -41], rotY: P / 2, length: 6.4 },                                   // water slot, inner side
  { type: 'kelpline_quayedge', pos: [24, 0, -41], rotY: P, length: 3.4 },                                         // water slot, head
  { type: 'kelpline_quayedge', pos: [24, 0, -14], rotY: P / 2, length: 27 + DZ, bollards: [4, 14, 24, 34, 44], fenders: [9, 19, 29, 39], ladders: [16.5, 38.5], final: true },
  { type: 'kelpline_quayedge', pos: [30, -0.1, -8], rotY: 3 * Q, length: 8.485, bollards: [4.2] },               // mid bulge shoulder
  { type: 'kelpline_quayedge', pos: [30, 0, 0], rotY: P / 2, length: 8, bollards: [4], fenders: [6.5] },          // mid bulge face
  { type: 'kelpline_quayedge', pos: [-30, 0, -8], rotY: -P / 2, length: 8, bollards: [4], fenders: [1.5] },
  { type: 'kelpline_quayedge', pos: [-24, -0.1, -14], rotY: -3 * Q, length: 8.485, bollards: [4.2] },
  { type: 'kelpline_quayedge', pos: [-24, 0, -22 - DZ], rotY: -P / 2, length: 8 + DZ, bollards: [5, 15, 25], fenders: [10, 20, 27], ladders: [12.5], final: true },
  // the reefer-side wing (stepped outline)
  { type: 'kelpline_quayedge', pos: [-29.5, 0, -22], rotY: 0, length: 5.5, bollards: [2.7] },
  { type: 'kelpline_quayedge', pos: [-29.5, 0, -27], rotY: -P / 2, length: 5 },
  { type: 'kelpline_quayedge', pos: [-32, 0, -27], rotY: 0, length: 2.5 },
  { type: 'kelpline_quayedge', pos: [-32, 0, -42], rotY: -P / 2, length: 15, bollards: [3.5, 11.5], fenders: [7.5], ladders: [5.5] },
  { type: 'kelpline_quayedge', pos: [-29.5, 0, -42], rotY: P, length: 2.5 },
  { type: 'kelpline_quayedge', pos: [-29.5, 0, -46.4], rotY: -P / 2, length: 4.4 },
  { type: 'kelpline_quayedge', pos: [-24, 0, -46.4], rotY: P, length: 5.5, bollards: [2.7] },
  // the reefer rack over the alley, hatch-cover dressing (mid landing — square to the harbour — + apron)
  { type: 'kelpline_reeferrack', pos: [-9.44, 0, -16.125], rotY: 0, length: 18.35, width: 2.0, name: 'R2', notIn: 'tower' },
  // (Tower Command: the rack over its aisle — layout.js AISLE — the catwalk cut, no cables on the side where row 1 was,
  //  row 1's stair landing; rack-local z = local z + 16.125)
  { type: 'kelpline_reeferrack', pos: [-9.44, 0, -16.125], rotY: 0, length: 18.35, width: 2.0, name: 'R2', onlyIn: 'tower',
    gap: AISLE.gap.map((z) => z + 16.125), bare: [-1, AISLE.landing + 16.125], landing: [AISLE.landing + 16.125, -13.25 + 16.125] },
  { type: 'kelpline_hatch', pos: [0, 0, 0], rotY: 0, w: 10.8, d: 6, h: 1.2, num: '4', mirror: false, world: true },
  { type: 'kelpline_hatch', pos: [0, 0, 0], rotY: 0, w: 4.4, d: 3.2, h: 1.2, y0: 1.2, c: '#58779a', mirror: false, world: true },
  { type: 'kelpline_hatch', pos: [18.6, 0, -23.5], rotY: P / 2, w: 7, d: 2.8, h: 1.2, num: '7' },
  // truck lane: tractor + chassis under the trailer box, the reach stacker reaching toward the landing
  { type: 'kelpline_chassis', pos: [2.82, 0, -25.57], rotY: 0, len: 20 },
  { type: 'kelpline_tractor', pos: [2.82, 0, -21.6], rotY: 0 },
  { type: 'kelpline_reachstacker', pos: [-3.3, 0, -10.8], rotY: 0 },
  // straddle carrier over its box on the right apron
  { type: 'kelpline_straddle', pos: [-20.2, 0, -25.97], rotY: 0 },
  // lashing cages + twistlock bins
  { type: 'kelpline_cage', pos: [22.7, 0, -35], rotY: P / 2 },
  { type: 'kelpline_cage', pos: [-22.9, 0, -12.5], rotY: P / 2 },
  { type: 'kelpline_cage', pos: [1.2, 0, -7.6], rotY: 0.08, variant: 1 },
  { type: 'kelpline_cage', pos: [-13.8, 0, -36.2], rotY: 0.04, variant: 1, notIn: 'tower' },
  { type: 'kelpline_cage', pos: [-14.5, 0, -36.2], rotY: 0.04, variant: 1, onlyIn: 'tower' },   // (Tower Command: off the goal)
  { type: 'kelpline_cage', pos: [27.2, 0, -3.2], rotY: 0.15 },
  // flat rack with crated cargo on the left apron, light towers (cover by day, the lamps at dusk)
  { type: 'kelpline_flatrack', pos: [19.2, 0, -14.0], rotY: 0, len: 20 },
  { type: 'kelpline_lighttower', pos: [-18.6, 0, -17.2], rotY: 0.3 },
  { type: 'kelpline_lighttower', pos: [12.6, 0, -35.6], rotY: -1.3 },
  // truck lane: barriers (parked square to the harbour, i.e. skewed across the lane) + cones
  { type: 'barrier', pos: [-3.0, 0, -26.0], rotY: 0, worldRot: true, variant: 1, length: 3.6 },
  { type: 'barrier', pos: [-3.8, 0, -20.4], rotY: P / 2, worldRot: true, variant: 0, length: 1.8, color: '#e8a33a' },
  { type: 'cone', pos: [-1.6, 0, -19.8] }, { type: 'cone', pos: [-5.2, 0, -21.3] },
  { type: 'cone', pos: [1.0, 0, -18.6], notIn: 'tower' }, { type: 'cone', pos: [5.2, 0, -18.4], notIn: 'tower' },
  // (Tower Command: the track crosses the lane here — those two stand off it, by the tractor's nose)
  { type: 'cone', pos: [0.6, 0, -20.4], onlyIn: 'tower' }, { type: 'cone', pos: [5.2, 0, -20.6], onlyIn: 'tower' },
  // service vehicles: pickup on the right apron by the reefer corner, a forklift with a twistlock bin by the gate
  { type: 'kelpline_pickup', pos: [-20.4, 0, -34.0], rotY: 0.12 },
  { type: 'kelpline_forklift', pos: [19.3, 0, -36.6], rotY: -1.35 },
  // ships' gangways down to the quay (the mirror copy serves the other ship)
  { type: 'kelpline_gangway', pos: [23.3, 0, -36.0], rotY: 0, run: 4.7, rise: 5.2 },
  // quay clutter: rope coils by the bollards, life rings on the edge, drums in the reefer corner, bins
  { type: 'ropecoil', pos: [22.6, 0, -17.2], rotY: 0.4 },
  { type: 'ropecoil', pos: [-30.9, 0, -40.4], rotY: 2.2 },
  { type: 'lifering', pos: [23.55, 0, -25.8], rotY: -P / 2 },
  { type: 'lifering', pos: [-31.55, 0, -30.5], rotY: P / 2 },
  { type: 'barrel', pos: [-21.4, 0, -40.6], color: '#3f6fb0' },
  { type: 'barrel', pos: [-20.8, 0, -41.1], color: '#c9453b' },
  { type: 'kelpline_cage', pos: [-19.4, 0, -40.4], rotY: 0.2, variant: 1 },
  { type: 'trashbin', pos: [9.7, 0, -47.0], rotY: 0, variant: 1, color: '#3f7d5a' },
  { type: 'trashbin', pos: [10.5, 0, -47.0], rotY: 0, variant: 1, color: '#2f5b8c' },
  { type: 'hydrant', pos: [-16.6, 0, -39.3], rotY: 0.4 },
  // the reefer-side wing: shore-power kiosk, a lashing cage, a light tower out on the step
  { type: 'kelpline_kiosk', pos: [-27.0, 0, -25.4], rotY: 0 },
  { type: 'kelpline_cage', pos: [-25.4, 0, -30.8], rotY: 0.2 },
  { type: 'kelpline_lighttower', pos: [-30.7, 0, -34.2], rotY: 0.4 },
  // mid landing zone: cones around the crane's working area
  { type: 'cone', pos: [7.2, 0, -4.4], notIn: 'tower' }, { type: 'cone', pos: [8.9, 0, -0.6], notIn: 'tower' }, { type: 'cone', pos: [-6.3, 0, -5.4] },
  // (Tower Command: the track runs out from the centre and back along the stack ends — those two stand inside its bend)
  { type: 'cone', pos: [6.0, 0, -3.2], onlyIn: 'tower' }, { type: 'cone', pos: [8.6, 0, -2.6], onlyIn: 'tower' },
  // safety boards
  { type: 'kelpline_signboard', pos: [-8.1, 0, -35.0], rotY: 0.2, variant: 0 },
  { type: 'kelpline_signboard', pos: [15.5, 0, -33.6], rotY: -0.25, variant: 2 },
  { type: 'kelpline_signboard', pos: [-16.9, 0, -33.0], rotY: 0.6, variant: 1 },
  // reefer technicians' cabin in the reefer corner (fittings on the front of the reefer yard box)
  { type: 'kelpline_cabin', pos: [-14.41, 0, -44.86], rotY: 0, w: 6.06, sign: 'REEFER TECH' },
];
const moved = (it) => { if (it.final) { const { final, ...q } = it; return q; } return { ...it, pos: [it.pos[0], it.pos[1], stretchZ(it.pos[0], it.pos[2])] }; };

// ==================================================================================================== the slice
// (final coordinates: layout.js SLICE — cross aisle C, Block 4B, the RTG lane + transfer platform, the lashing store)
const T = SLICE.tp, ST = SLICE.store, TPZ = (T.z[0] + T.z[1]) / 2;
const SLICE_PLACEMENTS = [
  // RTG 41 parked across the lane over the transfer platform; the platform's dressing (booth, rack, rails, boards)
  { type: 'kelpline_rtg', pos: [0, 0, SLICE.rtg.z], rotY: 0, xl: SLICE.rtg.x, sill: SLICE.rtg.sill, tx: 5.4 },
  { type: 'kelpline_tp', pos: [0, 0, TPZ], rotY: 0, w: T.x * 2, d: T.z[1] - T.z[0], h: T.y, sw: T.w },
  // the lashing store + its dock, the weighbridge office in its yard facing the lane, a forklift, cages
  { type: 'kelpline_store', pos: [(ST.x[0] + ST.x[1]) / 2, 0, (ST.z[0] + ST.z[1]) / 2], rotY: 0, w: ST.x[1] - ST.x[0], d: ST.z[1] - ST.z[0], h: ST.h, dk: ST.dock - ST.x[1] },
  { type: 'kelpline_wbhut', pos: [-14.6, 0, -39.9], rotY: P / 2 },
  { type: 'kelpline_cage', pos: [-12.0, 0, -41.7], rotY: 0.1, variant: 1 },
  { type: 'kelpline_forklift', pos: [-20.6, 0, -45.6], rotY: 0.35 },   // (parked on the quay beside the store, clear of the dock steps)
  // the stacked hatch covers on the ship-side quay; folded flat racks + a barge on the reefer side
  { type: 'kelpline_hatch', pos: [18.6, 0, -47.7], rotY: 0, w: 3.4, d: 7.0, h: 1.2, num: '9' },
  { type: 'kelpline_hatch', pos: [18.6, 0, -48.1], rotY: 0, w: 2.2, d: 3.6, h: 1.2, y0: 1.2, c: '#58779a' },
  { type: 'kelpline_flatstack', pos: [-21.08, 0, -37.17], rotY: 0 },
  { type: 'kelpline_barge', pos: [-24.9, 0, -29.6], rotY: P, length: 27, beam: 9.4, gap: 0.9, name: 'EBB RUNNER', seed: 31,
    lines: [[12.0, 10.4], [1.5, 0.4], [-12.3, -9.6]] },   // (barge-local z: the quay bollards at local z −40, −30, −20)
  // cross aisle C: cones round the platform's stair foot, barriers, a lashing cage + twistlock bins at the aisle ends
  { type: 'cone', pos: [-2.3, 0, -33.3] }, { type: 'cone', pos: [2.5, 0, -33.0] }, { type: 'cone', pos: [5.4, 0, -34.2] },
  { type: 'barrier', pos: [3.9, 0, -36.3], rotY: 0, worldRot: true, variant: 1, length: 2.4 },
  { type: 'kelpline_cage', pos: [22.3, 0, -34.2], rotY: P / 2 },
  { type: 'kelpline_cage', pos: [-17.3, 0, -35.9], rotY: 0.1, variant: 1 },
  { type: 'kelpline_cage', pos: [10.6, 0, -35.8], rotY: -0.15, variant: 1 },
  // quay kit: light towers, rope coils, a life ring
  { type: 'kelpline_lighttower', pos: [-19.6, 0, -50.2], rotY: 0.2 },
  { type: 'kelpline_lighttower', pos: [22.0, 0, -41.6], rotY: -0.3 },
  { type: 'ropecoil', pos: [22.8, 0, -48.4], rotY: 1.1 },
  { type: 'ropecoil', pos: [-22.9, 0, -41.0], rotY: 0.3 },
  { type: 'lifering', pos: [23.55, 0, -44.8], rotY: -P / 2 },
  { type: 'lifering', pos: [-23.55, 0, -26.5], rotY: P / 2 },
  { type: 'kelpline_signboard', pos: [6.9, 0, -52.9], rotY: 0.15, variant: 1 },
  // block ids where the stacks meet cross aisle C (4A's base end, 4B's mid end), read along the aisle
  { type: 'kelpline_blocksign', pos: [16.45, 0, -32.3], rotY: P / 2, text: '4A' },
  { type: 'kelpline_blocksign', pos: [16.45, 0, -36.6], rotY: P / 2, text: '4B' },
];

const LOCAL_PLACEMENTS = [...BERTH_PLACEMENTS.map(moved), ...SLICE_PLACEMENTS, ...autoDressing()];

// turn the berth: pos about the origin, rotY + ROT (see the note above)
export const PLACEMENTS = LOCAL_PLACEMENTS.map((it) => {
  if (it.world) { const { world, ...q } = it; return q; }
  const { worldRot, ...q } = it;
  const [x, z] = toWorld(it.pos[0], it.pos[2]);
  return { ...q, pos: [x, it.pos[1], z], rotY: worldRot ? it.rotY || 0 : (it.rotY || 0) + ROT_RAD };
});
