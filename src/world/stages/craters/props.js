// Turf War Craters — stage prop pack + placements (owner: the craters stage; see layout.js for the folder contract).
//
// register(D, H): this stage's prop builders (types prefixed 'craters_'), same contract as the other stage packs: H
// carries THREE + the kit helpers; parts merge into the kit's material buckets (paint / gloss / metal / wood / rubber /
// foliage / glow …), tiny parts go through H.noShadow. PLACEMENTS: the set dressing (half list, mirrored (x,z) → (-x,-z)
// unless `mirror: false`). Solid props hand the level collision boxes (un-inkable; nav + physics).
//
// Conventions: metres, Y up, `pos` = base point, rotY turns local +Z (the "front"). Runs (railings, wire, fences) extend
// along local +X. Signage uses flat painted / raised letters from a stroke font (below).
import { LAYOUT, PAV, PILLBOX, MEMO, T1, T2, T3, T4, BRIDGES, POND, CRATER, COAST, BOARDS, STATIONS, UNDERCLIFF, lipEdge } from './layout.js';
import { topOf, mirrorDef, inPoly, PieceIndex } from './geo.js';
import { sz } from './stretch.js';
import { T5, T6, T7, T8, MOUND, MOUND_PIERS, OP, PONDS, SLICE_BRIDGES, SLICE_BOARDS } from './slice.js';

const P = Math.PI;

export function register(D, H) {
  const { THREE, col, shade, mixc, latheGeo, tubeGeo, extrudeGeo, PI, TAU, HP, P3 } = H;
  const NS = (m) => (m === 'glow' || m === 'blob' ? m : H.noShadow ? H.noShadow(m) : m);

  // ------------------------------------------------------------------------------------------ palette
  // chalk downland + memorial stone, weathered concrete, rusted war steel, board-marked concrete and bronze glazing
  const K = {
    stone: '#ece8dd', stoneDk: '#d4cfc2', stoneLt: '#f6f3ec', concrete: '#c4c0b5', concreteDk: '#9f9b91', concreteLt: '#d8d4ca',
    bronze: '#5a4a38', bronzeLt: '#8a7253', glass: '#3a5059', glassLt: '#5d7680', steel: '#8f969b', steelDk: '#5d6368', galv: '#b8bec2',
    rust: '#7c4a31', rustDk: '#553222', rustLt: '#9a6040', iron: '#34363a', ink: '#2c2d31', timber: '#8b7356', timberDk: '#6a553e',
    timberLt: '#a88d6a', hessian: '#b3a17c', hessianDk: '#8f7f5f', leaf: '#5e7d45', leafDk: '#46623a', reed: '#8a8f55', reedDk: '#6c7040',
    poppy: '#c0392b', poppyDk: '#8e2a20', white: '#f1efe8', teal: '#3f6a62', tealDk: '#2f524b', lamp: '#ffd79a', lampWarm: '#ffc46e',
    gorse: '#4f6b3c', gorseY: '#e2b93b', chalk: '#e6e2d6', flint: '#4f4e4b', brass: '#8a774e', brassDk: '#6a5a38', moss: '#6f7d4a',
    signRed: '#b33a2e', signCream: '#efe6cf', signGreen: '#36584a', board: '#2f4a44',
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
  const pboxGeo = () => tpl('pbox', () => new THREE.BoxGeometry(1, 1, 1));
  const pbox = (B, mat, c, w, h, d, x, y, z, o = {}) => B.add(mat, pboxGeo(), c, x, y, z, { ...o, sx: w, sy: h, sz: d });
  // frustum box (bottom w0 × d0 at y = 0, top w1 × d1 at y = h), flat faces
  const frustumGeo = (w0, d0, w1, d1, h, top = true) => tpl(['fr', w0, d0, w1, d1, h, top].map(kf).join('|'), () => {
    const g = new GB(), b = [[-w0 / 2, 0, -d0 / 2], [w0 / 2, 0, -d0 / 2], [w0 / 2, 0, d0 / 2], [-w0 / 2, 0, d0 / 2]];
    const t = [[-w1 / 2, h, -d1 / 2], [w1 / 2, h, -d1 / 2], [w1 / 2, h, d1 / 2], [-w1 / 2, h, d1 / 2]];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, c = [(b[i][0] + b[j][0]) / 2, 0, (b[i][2] + b[j][2]) / 2]; g.face([b[i], b[j], t[j], t[i]], c); }
    if (top) g.face([t[0], t[1], t[2], t[3]], [0, 1, 0]);
    return g.geo();
  });
  const pyramidGeo = (w, h) => tpl(['py', w, h].map(kf).join('|'), () => {
    const g = new GB(), b = [[-w / 2, 0, -w / 2], [w / 2, 0, -w / 2], [w / 2, 0, w / 2], [-w / 2, 0, w / 2]];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; g.face([b[i], b[j], [0, h, 0]], [(b[i][0] + b[j][0]) / 2, h * 0.3, (b[i][2] + b[j][2]) / 2]); }
    return g.geo();
  });
  // straight beam between two points (square section w × h)
  function beam(B, mat, c, a, b, w, h = w) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
    B.push((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.atan2(dx, dz), -Math.atan2(dy, Math.hypot(dx, dz)));
    pbox(B, mat, c, w, h, L, 0, 0, 0);
    B.pop();
  }
  const rod = (B, mat, c, a, b, r, radial = 6) => B.tube(mat, c, [P3(...a), P3(...b)], r, { radial });
  const colBox = (B, x, y, z, w, h, d, o) => B.col(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, o);
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
  const subNC = (B, type, x, y, z, ry, opts = {}) => { const n0 = B.cols.length; sub(B, type, x, y, z, ry, opts); B.cols.length = n0; };

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
    '/': [0.4, [[0, 0], [0.4, 1]]],
    "'": [0, [[0, 1], [0, 0.8]]],
    '&': [0.7, [[0.7, 0], ...EA(0.27, 0.72, 0.17, 0.2, -40, 220, 12).reverse(), [0.08, 0.28], ...EA(0.26, 0.24, 0.24, 0.24, 180, 300, 6), [0.62, 0.36]]],
    '>': [0.4, [[0, 0.9], [0.4, 0.45], [0, 0]]],
    '<': [0.4, [[0.4, 0.9], [0, 0.45], [0.4, 0]]],
    '!': [0, [[0, 1], [0, 0.34]]],
  };
  const DOTS = { '·': [[0, 0.46]], '.': [[0, 0]], ':': [[0, 0.1], [0, 0.62]], '!': [[0, 0]] };
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
    return tpl(['cgl', ch, wt, dep, bev, ds].map(kf).join('|'), () => {
      const s = 1 - wt, hw = wt / 2, T = (p) => [hw + p[0] * s, hw + p[1] * s];
      const g = new GB();
      const b = Math.min(bev, hw * 0.6);
      if (DOTS[ch] && !GL[ch]) {
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
      if (DOTS[ch]) for (const p of DOTS[ch]) { const q = T(p); disc(g, q[0], q[1], hw * 1.1, b, dep, 0, ds); }
      return { geo: g.geo(), adv: w * s + wt };
    });
  }
  const textW = (str, wt = 0.17, track = 0.12) => { let w = 0; const cs = [...str]; cs.forEach((ch, i) => { w += ch === ' ' ? SPACE : glyph(ch, wt, 0.12, 0.035).adv; if (i < cs.length - 1) w += track; }); return w; };
  // a line of letters facing +Z in the current frame (raised letters, or flat paint with flat: true); returns its width
  function letters(B, str, o = {}) {
    const h = o.h ?? 0.3, wt = o.wt ?? 0.17, flat = !!o.flat;
    const dep = flat ? 0 : o.dep ?? 0.12, bev = flat ? 0 : o.bev ?? (h < 0.34 ? 0 : 0.03), track = o.track ?? 0.12;
    const ds = o.ds ?? (flat || h < 0.12 ? 6 : 8);
    const W = textW(str, wt, track) * h;
    let x = o.align === 'left' ? 0 : o.align === 'right' ? -W : -W / 2;
    [...str].forEach((ch, i, cs) => {
      if (ch === ' ') { x += (SPACE + track) * h; return; }
      const gi = glyph(ch, wt, dep, bev, ds);
      const m = o.mat ?? (flat ? 'paint' : 'gloss');
      if (gi.geo) B.add(flat || h < 0.2 ? NS(m) : m, gi.geo, o.c ?? K.bronze, (o.x ?? 0) + x, o.y ?? 0, o.z ?? 0, { s: h, sz: flat ? 1 : h, glow: o.glow, ao: false });
      if (gi.geo && o.lit) {
        const fg = glyph(ch, wt, 0, 0, ds);
        if (fg.geo) B.add(NS('glow'), fg.geo, o.litC ?? K.lamp, (o.x ?? 0) + x, o.y ?? 0, (o.z ?? 0) + dep * h + 0.004, { s: h, sz: 1, glow: o.lit, ao: false });
      }
      x += (gi.adv + (i < cs.length - 1 ? track : 0)) * h;
    });
    return W;
  }

  // ------------------------------------------------------------------------------------------ small kit
  // stainless post-and-cable balustrade along local +X (length L, height h) with a rail collider
  function balustrade(B, L, h = 1.1, o = {}) {
    const n = Math.max(1, Math.round(L / (o.pitch ?? 1.4))), c = o.c ?? K.galv;
    for (let i = 0; i <= n; i++) {
      const x = (L * i) / n;
      pbox(B, 'metal', c, 0.05, h - 0.04, 0.05, x, (h - 0.04) / 2, 0);
      if (o.foot !== false) pbox(B, NS('metal'), c, 0.12, 0.02, 0.12, x, 0.01, 0);
    }
    B.cyl('metal', c, 0.03, L + 0.06, L / 2, h - 0.02, 0, { rz: HP, seg: 10 });
    for (const y of o.cables ?? [0.18, 0.35, 0.52, 0.69, 0.86]) B.cyl(NS('metal'), shade(c, 0.85), 0.005, L, L / 2, y, 0, { rz: HP, seg: 4 });
    if (o.col !== false) B.col(-0.04, 0, -0.06, L + 0.04, h, 0.06, { rail: true });
  }
  // round steel handrail (posts + top rail + knee rail) between two local points a → b (y on each), with rail colliders
  // stepped along it (steps boxes, each as high as the rail over its stretch)
  function handrail(B, a, b, o = {}) {
    const h = o.h ?? 1.0, c = o.c ?? K.steelDk, n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / (o.pitch ?? 1.5)));
    const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    for (let i = 0; i <= n; i++) { const p = at(i / n); rod(B, 'metal', c, [p[0], p[1], p[2]], [p[0], p[1] + h, p[2]], 0.025, 6); }
    rod(B, 'metal', c, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.03, 8);
    rod(B, NS('metal'), c, [a[0], a[1] + h * 0.5, a[2]], [b[0], b[1] + h * 0.5, b[2]], 0.02, 6);
    if (o.col === false) return;
    const steps = o.steps ?? Math.max(1, Math.ceil(Math.abs(b[1] - a[1]) / 0.5));
    for (let k = 0; k < steps; k++) {
      const p = at(k / steps), q = at((k + 1) / steps), top = Math.max(p[1], q[1]) + h;
      B.col(Math.min(p[0], q[0]) - 0.05, 0, Math.min(p[2], q[2]) - 0.05, Math.max(p[0], q[0]) + 0.05, top, Math.max(p[2], q[2]) + 0.05, { rail: true });
    }
  }
  // a glazed bay (w × h, bottom at y0) facing +Z at local z: mullions, a transom, the panes lit at dusk (interior)
  function glazing(B, x0, x1, y0, y1, z, o = {}) {
    const w = x1 - x0, n = Math.max(1, Math.round(w / (o.pane ?? 1.1))), fc = o.frame ?? K.bronze, tr = o.transom ?? y0 + (y1 - y0) * 0.78;
    for (let i = 0; i < n; i++) {
      const a = x0 + (w * i) / n, b = x0 + (w * (i + 1)) / n, lit = o.lit ?? true;
      // dark glass; behind it the interior's ceiling lights (a warm band under the transom, lit at dusk) and a lit
      // back wall low down in some bays
      pbox(B, 'gloss', K.glass, b - a, y1 - y0, 0.02, (a + b) / 2, (y0 + y1) / 2, z - 0.02);
      if (lit) {
        pbox(B, 'glow', o.litC ?? '#ffe2b8', b - a - 0.04, 0.14, 0.01, (a + b) / 2, tr - 0.12, z - 0.004, { glow: o.glowK ?? 0.85 });
      }
      // a reflective sheen across the pane
      pbox(B, NS('gloss'), K.glassLt, (b - a) * 0.9, 0.05, 0.004, (a + b) / 2, y0 + (tr - y0) * (0.72 + 0.12 * hash(i + x0)), z - 0.002);
    }
    for (let i = 0; i <= n; i++) pbox(B, 'metal', fc, 0.06, y1 - y0, 0.1, x0 + (w * i) / n, (y0 + y1) / 2, z);
    for (const y of [y0 + 0.03, tr, y1 - 0.03]) pbox(B, 'metal', fc, w + 0.06, 0.06, 0.1, (x0 + x1) / 2, y, z);
  }
  // board-marked concrete: shallow horizontal shutter lines + tie holes across a wall facing +Z (w wide, y0 → y1)
  function boardMarks(B, x0, x1, y0, y1, z, o = {}) {
    const c = o.c ?? K.concreteDk;
    for (let y = y0 + 0.15; y < y1 - 0.05; y += 0.15) pbox(B, NS('paint'), c, x1 - x0, 0.012, 0.006, (x0 + x1) / 2, y, z + 0.002);
    for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.6) for (let y = y0 + 0.45; y < y1 - 0.2; y += 0.9) B.cyl(NS('paint'), shade(c, 0.8), 0.018, 0.01, x, y, z + 0.004, { rx: HP, seg: 6 });
  }
  // cast-iron remembrance lantern on a post (glows at dusk)
  function lanternHead(B, y, o = {}) {
    const ic = o.c ?? K.iron;
    pbox(B, 'paint', ic, 0.2, 0.03, 0.2, 0, y, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pbox(B, NS('paint'), ic, 0.022, 0.26, 0.022, sx * 0.085, y + 0.145, sz * 0.085);
    pbox(B, 'glow', K.lamp, 0.15, 0.22, 0.15, 0, y + 0.14, 0, { glow: o.glow ?? 1.3 });
    B.add('paint', frustumGeo(0.25, 0.25, 0.06, 0.06, 0.1), ic, 0, y + 0.28, 0);
    B.sph(NS('paint'), ic, 0.03, 0, y + 0.4, 0, { ws: 6, hs: 4 });
  }

  // grass tuft: a fan of tapered, curving blades (crossed ribbons, two-sided foliage)
  const tuftGeo = (n, seed) => tpl(['tuft', n, seed].map(kf).join('|'), () => {
    const g = new GB();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + hash(seed + i) * 0.8, lean = 0.25 + 0.45 * hash(seed * 3 + i), h = 0.7 + 0.3 * hash(seed * 7 + i), w = 0.035;
      const ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca, N = 4, ids = [];
      for (let k = 0; k <= N; k++) {
        const t = k / N, r = lean * t * t * h, y = h * (t - 0.25 * t * t * lean), ww = w * (1 - t * 0.9);
        const cx = ca * r, cz = sa * r, sh = 0.55 + 0.45 * t;
        ids.push([g.v(cx - px * ww, y, cz - pz * ww, ca * 0.3, 0.9, sa * 0.3, sh), g.v(cx + px * ww, y, cz + pz * ww, ca * 0.3, 0.9, sa * 0.3, sh)]);
      }
      for (let k = 0; k < N; k++) g.quad(ids[k][0], ids[k][1], ids[k + 1][1], ids[k + 1][0]);
    }
    return g.geo();
  });
  function tuft(B, x, y, z, s, c, ry = 0, n = 14, seed = 1) { B.add(NS('foliage'), tuftGeo(n, (seed + Math.round(x * 7 + z * 13)) % 5), c, x, y, z, { s, ry }); }

  // ============================================================================================ the visitor pavilion
  // pos = the middle of the pavilion's back edge (world (0, 0, −44) for Alpha), local +Z toward the field. The layout
  // blocks are its body (x ±8.5, z 0 … 7.5, 0 … 2.8), the spawn deck on it, the back block (z 0 … 0.8, up to 5.6), the
  // ramp down the neck and a stair down each side wall; this dresses them: the glazed ground floor (lit inside at dusk),
  // board-marked piers, the deck's post-and-cable balustrade, the slim cantilevered roof, the name in bronze letters,
  // binocular viewers, planters.
  D.craters_pavilion = {
    desc: 'Visitor pavilion dressing (glazing, balustrades, roof canopy, sign, viewers, planters). Local +Z = the field.',
    build(B) {
      const W = PAV.x, Z = PAV.z1 - PAV.z0, YD = 3.0, ramp = 1.8, BK = PAV.back, SX = PAV.stairX, SW = PAV.stairW, open = 2.5, SL = PAV.stairLow - PAV.z0;
      // ---- ground floor facade toward the field: glazing either side of the ramp, board-marked piers + fascia
      for (const s of [-1, 1]) {
        const xa = s < 0 ? -W + 0.45 : 2.4, xb = s < 0 ? -2.4 : W - 0.45;
        glazing(B, xa, xb, 0.12, 2.45, Z + 0.06, { pane: 1.05 });
        // doors (double glass doors with push bars) in the middle bay
        const dx = s * 5.2;
        pbox(B, 'metal', K.bronze, 1.9, 0.08, 0.14, dx, 2.1, Z + 0.1);
        for (const k of [-1, 1]) pbox(B, 'metal', K.galv, 0.05, 0.9, 0.05, dx + k * 0.12, 1.05, Z + 0.14);
        // piers
        pbox(B, 'paint', K.concrete, 0.45, 2.8, 0.18, s * (W - 0.22), 1.4, Z + 0.09);
        pbox(B, 'paint', K.concrete, 0.6, 2.8, 0.18, s * 2.1, 1.4, Z + 0.09);
      }
      pbox(B, 'paint', K.concreteLt, 2 * W + 0.1, 0.34, 0.22, 0, 2.63, Z + 0.11);
      boardMarks(B, -W, W, 2.46, 2.8, Z + 0.22);
      // ---- side walls: board marks above the stair that climbs each of them
      for (const s of [-1, 1]) {
        B.push(s * W, 0, Z / 2, s * HP);
        boardMarks(B, -Z / 2 + 0.2, Z / 2 - 0.2, 0.1, 2.75, 0.0);
        B.pop();
      }
      // ---- deck: post-and-cable balustrade (the front either side of the ramp head, the sides from the stairs' heads on)
      B.push(-W + 0.06, YD, Z - 0.06); balustrade(B, W - ramp - 0.06); B.pop();
      B.push(ramp, YD, Z - 0.06); balustrade(B, W - ramp - 0.06); B.pop();
      for (const s of [-1, 1]) { const a = open, b = Z - 0.06; B.push(s * (W - 0.06), YD, s < 0 ? a : b, s < 0 ? -HP : HP); balustrade(B, b - a); B.pop(); }
      // ---- the back block's face toward the deck: the name in bronze letters, a band of glazing above
      B.push(0, 0, BK);
      letters(B, 'TURF WAR CRATERS', { h: 0.62, wt: 0.16, dep: 0.1, y: 4.05, c: K.bronze, mat: 'metal', track: 0.14 });
      letters(B, 'MEMORIAL PARK · VISITOR CENTRE', { h: 0.2, wt: 0.2, flat: true, y: 3.62, c: K.bronze, mat: 'metal', track: 0.16 });
      boardMarks(B, -W, W, 3.0, 3.55, 0);
      B.pop();
      // ---- the slim cantilevered roof over the back of the deck: concrete top, timber soffit, downlights
      const r0 = -0.25, r1 = 2.6, ry = 5.6;
      B.box('paint', K.concreteLt, 2 * W + 0.8, 0.24, r1 - r0, 0, ry + 0.12, (r0 + r1) / 2, { r: 0.03 });
      pbox(B, 'wood', K.timberLt, 2 * W + 0.6, 0.02, r1 - r0 - 0.2, 0, ry - 0.005, (r0 + r1) / 2 - 0.05);
      for (let x = -W + 1; x <= W - 1; x += 2) B.cyl(NS('glow'), K.lamp, 0.09, 0.012, x, ry - 0.02, 2.4, { seg: 10, glow: 1.2 });
      B.col(-W - 0.4, ry, r0, W + 0.4, ry + 0.24, r1, { roof: true });
      // a sedum roof on top of it: an aluminium upstand round the edge, low tufts of green and rust-red sedum
      for (const [x, z, w, d] of [[0, r0 + 0.06, 2 * W + 0.8, 0.08], [0, r1 - 0.06, 2 * W + 0.8, 0.08], [-W - 0.36, (r0 + r1) / 2, 0.08, r1 - r0], [W + 0.36, (r0 + r1) / 2, 0.08, r1 - r0]]) pbox(B, NS('metal'), K.galv, w, 0.1, d, x, ry + 0.29, z);
      for (let k = 0; k < 40; k++) { const x = -W + 0.4 + hash(k * 1.3) * (2 * W - 0.8), z = r0 + 0.3 + hash(k * 2.7) * (r1 - r0 - 0.6); tuft(B, x, ry + 0.24, z, 0.22 + 0.12 * hash(k), hash(k * 5) > 0.7 ? '#9a5a3c' : mixc(K.leaf, K.reed, hash(k * 7)), k, 10, k % 5); }
      // ---- binocular viewers at the front rail, planters with grasses in the deck's front corners
      for (const s of [-1, 1]) sub(B, 'craters_viewer', s * 5.2, YD, Z - 0.75, 0);
      for (const s of [-1, 1]) {
        const x = s * (W - 0.95), z = Z - 1.0;
        B.box('paint', K.concrete, 1.3, 0.55, 1.3, x, YD + 0.275, z, { r: 0.04 });
        for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + x, r = 0.15 + 0.3 * hash(k + x); tuft(B, x + Math.cos(a) * r, YD + 0.55, z + Math.sin(a) * r, 0.5 + 0.3 * hash(k * 5 + x), mixc(K.reed, K.leaf, hash(k * 3 + x)), a); }
        colBox(B, x, YD, z, 1.3, 0.95, 1.3);
      }
      // ---- the ramp's handrails (both sides) and the side stairs' (both sides of each)
      for (const s of [-1, 1]) handrail(B, [s * (ramp - 0.06), YD, Z], [s * (ramp - 0.06), 0, Z + 6.8]);
      // (the side stairs: a handrail on their cliff side, from the deck's back corner down past the headland's front to the
      // landing in the cove)
      for (const s of [-1, 1]) handrail(B, [s * (SX + SW / 2 - 0.06), YD, 1.0], [s * (SX + SW / 2 - 0.06), -1.1, SL]);
    },
  };

  // coin-operated binocular viewer (the seaside kind), facing +Z
  D.craters_viewer = {
    desc: 'Coin-operated binocular viewer on a pedestal, looking along +Z.',
    build(B) {
      const c = K.teal;
      B.cyl('paint', K.iron, 0.2, 0.05, 0, 0.025, 0, { seg: 14 });
      B.cyl('gloss', c, 0.055, 0.95, 0, 0.5, 0, { seg: 12 });
      B.box('gloss', c, 0.16, 0.12, 0.16, 0, 1.0, 0, { r: 0.03 });
      B.push(0, 1.18, 0, 0, -0.12);
      B.box('gloss', c, 0.42, 0.22, 0.3, 0, 0, 0, { round: true, r: 0.07 });
      for (const s of [-1, 1]) {
        B.cyl('gloss', shade(c, 0.85), 0.07, 0.16, s * 0.1, 0.02, 0.2, { rx: HP, seg: 12 });
        B.cyl(NS('gloss'), '#1e2a30', 0.055, 0.01, s * 0.1, 0.02, 0.281, { rx: HP, seg: 12 });
        B.cyl('rubber', K.ink, 0.04, 0.08, s * 0.08, 0.04, -0.19, { rx: HP, seg: 10 });
      }
      B.box('paint', K.brass, 0.1, 0.07, 0.04, 0.16, -0.02, -0.16, { r: 0.01 });
      B.pop();
      B.col(-0.18, 0, -0.18, 0.18, 1.35, 0.18);
    },
  };

  // ============================================================================================ the memorial
  // The obelisk on the plinth top (pos = the plinth top's centre, local +Z = the inscription's face): a Portland stone die
  // with a moulded foot and cornice, a tapering shaft with a pyramidion, the inscription in bronze letters; laurel wreaths
  // carved on the sides. Solid and off limits (you slide off it).
  D.craters_obelisk = {
    desc: 'Memorial obelisk: die, shaft, pyramidion, inscriptions. Collider: off-limits roof.',
    build(B) {
      const S = K.stone;
      B.box('paint', K.stoneDk, 1.5, 0.14, 1.5, 0, 0.07, 0, { r: 0.03 });
      B.box('paint', S, 1.3, 1.0, 1.3, 0, 0.64, 0, { r: 0.02 });
      B.box('paint', K.stoneDk, 1.46, 0.1, 1.46, 0, 1.19, 0, { r: 0.03 });
      B.box('paint', S, 1.1, 0.12, 1.1, 0, 1.3, 0, { r: 0.02 });
      B.add('paint', frustumGeo(0.84, 0.84, 0.54, 0.54, 6.6, false), S, 0, 1.36, 0);
      B.add('paint', pyramidGeo(0.54, 0.52), K.stoneLt, 0, 7.96, 0);
      // inscriptions (front and back), carved wreaths on the sides
      B.push(0, 0, 0.652);
      letters(B, 'THE GREAT', { h: 0.13, wt: 0.2, flat: true, y: 0.84, c: K.bronze, mat: 'metal', track: 0.16 });
      letters(B, 'TURF WAR', { h: 0.17, wt: 0.2, flat: true, y: 0.6, c: K.bronze, mat: 'metal', track: 0.16 });
      letters(B, 'NEVER AGAIN', { h: 0.085, wt: 0.22, flat: true, y: 0.38, c: K.bronze, mat: 'metal', track: 0.18 });
      B.pop();
      B.push(0, 0, -0.652, P);
      letters(B, 'NEVER', { h: 0.15, wt: 0.2, flat: true, y: 0.74, c: K.bronze, mat: 'metal', track: 0.16 });
      letters(B, 'AGAIN', { h: 0.15, wt: 0.2, flat: true, y: 0.5, c: K.bronze, mat: 'metal', track: 0.16 });
      B.pop();
      for (const s of [-1, 1]) {
        B.push(s * 0.652, 0.66, 0, s * HP);
        B.tor('paint', K.stoneDk, 0.22, 0.035, 0, 0, 0.0, { ts: 20, rs: 6 });
        for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; B.box(NS('paint'), K.stoneDk, 0.05, 0.1, 0.03, Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0.02, { rz: a + 0.6, r: 0.012 }); }
        B.pop();
      }
      B.col(-0.75, 0, -0.75, 0.75, 1.36, 0.75, { roof: true });
      B.col(-0.42, 1.36, -0.42, 0.42, 8.4, 0.42, { roof: true });
    },
  };
  // The Inkling Rifles' cenotaph on the regimental mound (the Long Stages slice; pos = the mound's top at the cenotaph's
  // centre, local +Z = its front, toward mid): a secular memorial — two Portland steps and a plinth course, a battered
  // stone pylon with a band and cornice, the empty tomb-chest on top; on its front a bronze laurel wreath round the
  // regiment's badge (a squid in a roundel), the regiment's name and THE LINE HELD; carved wreaths on the sides, the war
  // on the back. Short and blocky: it reads apart from the crater's two tall obelisks. Solid and off limits (you slide
  // off it).
  const squidBadge = (B, y, z, s = 1) => {
    // bronze roundel with a raised rim, the squid on it (mantle + fins, head with two eyes, four tentacles): the Inkling
    // emblem — nothing on it reads as a cross
    B.push(0, y, z);
    B.cyl('metal', K.bronze, 0.2 * s, 0.03, 0, 0, 0.015, { rx: HP, seg: 24 });
    B.tor('metal', K.bronzeLt, 0.2 * s, 0.014, 0, 0, 0.03, { ts: 28, rs: 5 });
    const plate = (pts, d, c) => { const g = new GB(); g.face(pts.map(([x, yy]) => [x * s, yy * s, d]), [0, 0, 1]);
      for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; g.face([[x0 * s, y0 * s, 0.03], [x1 * s, y1 * s, 0.03], [x1 * s, y1 * s, d], [x0 * s, y0 * s, d]], [y1 - y0, -(x1 - x0), 0]); }
      B.add('metal', g.geo(), c, 0, 0, 0); };
    plate([[0, 0.165], [0.07, 0.07], [0.055, -0.015], [-0.055, -0.015], [-0.07, 0.07]], 0.05, K.bronzeLt);        // mantle
    plate([[0.07, 0.07], [0.115, 0.115], [0.045, 0.125]], 0.048, K.bronzeLt);                                     // fins
    plate([[-0.045, 0.125], [-0.115, 0.115], [-0.07, 0.07]], 0.048, K.bronzeLt);
    plate([[0.05, -0.015], [0.05, -0.07], [-0.05, -0.07], [-0.05, -0.015]], 0.05, K.bronzeLt);                    // head
    for (const x of [-0.024, 0.024]) B.cyl(NS('paint'), K.stoneLt, 0.013 * s, 0.01, x * s, -0.042 * s, 0.055, { rx: HP, seg: 8 });
    for (const x of [-0.036, -0.012, 0.012, 0.036]) rod(B, NS('metal'), K.bronzeLt, [x * s, -0.07 * s, 0.045], [x * 1.5 * s, -0.16 * s, 0.045], 0.009 * s, 4);
    B.pop();
  };
  // a laurel wreath facing +Z (radius R): two rows of leaves along a slim ring, each leaf an almond lying along the ring
  // and angled off it, a ribbon bow tied at the foot
  const laurel = (B, R, c, mat, n = 24) => {
    B.tor(mat, c, R, R * 0.045, 0, 0, 0, { ts: 28, rs: 5 });
    for (let k = 0; k < n; k++) {
      const a = -HP + 0.32 + ((TAU - 0.64) * (k + 0.5)) / n;
      for (const sd of [-1, 1]) { const r = R * (1 + sd * 0.1); B.sph(NS(mat), c, 1, Math.cos(a) * r, Math.sin(a) * r, 0.012, { sx: R * 0.17, sy: R * 0.065, sz: 0.018, rz: a + HP + sd * 0.55, ws: 8, hs: 4 }); }
    }
    B.box(mat, c, R * 0.16, R * 0.12, 0.03, 0, -R, 0.02, { r: 0.01 });
    for (const sd of [-1, 1]) B.box(NS(mat), c, R * 0.1, R * 0.42, 0.02, sd * R * 0.12, -R * 1.2, 0.015, { rz: sd * 0.35, r: 0.008 });
  };
  D.craters_cenotaph = {
    desc: 'Regimental cenotaph: steps, battered pylon, cornice, tomb-chest; bronze wreath round the squid badge. Collider: off-limits roof.',
    build(B) {
      const S = K.stone, y0 = 0.58, hB = 2.2;
      B.box('paint', K.stoneDk, 2.1, 0.18, 1.5, 0, 0.09, 0, { r: 0.02 });
      B.box('paint', S, 1.8, 0.18, 1.2, 0, 0.27, 0, { r: 0.02 });
      B.box('paint', K.stoneDk, 1.5, 0.22, 0.95, 0, 0.47, 0, { r: 0.02 });
      B.add('paint', frustumGeo(1.3, 0.8, 1.14, 0.66, hB, false), S, 0, y0, 0);
      B.box('paint', K.stoneDk, 1.24, 0.1, 0.76, 0, y0 + hB + 0.05, 0, { r: 0.02 });
      B.box('paint', S, 1.36, 0.1, 0.88, 0, y0 + hB + 0.15, 0, { r: 0.03 });
      B.box('paint', K.stoneLt, 1.0, 0.3, 0.58, 0, y0 + hB + 0.35, 0, { r: 0.03 });
      B.add('paint', frustumGeo(1.0, 0.58, 0.84, 0.42, 0.14), S, 0, y0 + hB + 0.5, 0);
      // the front (the face leans back 0.07 over its height: every plate is set on it, tilted with it): the wreath round
      // the badge, the regiment, the line held
      const fz = (y) => 0.4 - (0.07 * (y - y0)) / hB, LEAN = -Math.atan(0.07 / hB);
      const onFace = (ry, y, fn) => { B.push(0, 0, 0, ry); B.push(0, y, fz(y), 0, LEAN); fn(); B.pop(); B.pop(); };
      onFace(0, 2.05, () => { laurel(B, 0.34, K.bronze, 'metal'); squidBadge(B, 0, 0.004, 1.15); });
      onFace(0, 1.42, () => letters(B, 'THE INKLING RIFLES', { h: 0.09, wt: 0.2, flat: true, z: 0.004, c: K.bronze, mat: 'metal', track: 0.14 }));
      onFace(0, 1.16, () => letters(B, 'THE LINE HELD', { h: 0.12, wt: 0.2, flat: true, z: 0.004, c: K.bronze, mat: 'metal', track: 0.16 }));
      // the back: the war and the line; the sides (the face 0.65 → 0.57 out, leaning in): carved laurel wreaths
      onFace(PI, 1.9, () => letters(B, 'THE GREAT TURF WAR', { h: 0.085, wt: 0.2, flat: true, z: 0.004, c: K.bronze, mat: 'metal', track: 0.14 }));
      onFace(PI, 1.7, () => letters(B, 'THE RESERVE LINE', { h: 0.085, wt: 0.2, flat: true, z: 0.004, c: K.bronze, mat: 'metal', track: 0.14 }));
      for (const sx of [-1, 1]) {
        const y = 2.0, x = 0.65 - (0.08 * (y - y0)) / hB;
        B.push(0, 0, 0, sx * HP); B.push(0, y, x, 0, -Math.atan(0.08 / hB)); laurel(B, 0.22, K.stoneDk, 'paint', 18); B.pop(); B.pop();
      }
      B.col(-1.05, 0, -0.75, 1.05, 0.36, 0.75, { roof: true });
      B.col(-0.68, 0.36, -0.44, 0.68, y0 + hB + 0.2, 0.44, { roof: true });
      B.col(-0.5, y0 + hB + 0.2, -0.3, 0.5, y0 + hB + 0.64, 0.3, { roof: true });
    },
  };
  // a gate pier's dressing on the regimental mound (pos = the pier's foot, local +Z = outward, down the steps): a moulded
  // plinth course, a cap with a ball finial, a small bronze poppy wreath on its face (the pier is the layout block)
  D.craters_pier = {
    desc: 'Memorial gate pier dressing: plinth course, cap, ball finial, bronze wreath (the pier is a layout block).',
    build(B) {
      B.box('paint', K.stoneDk, 0.9, 0.16, 0.9, 0, 0.08, 0, { r: 0.02 });
      B.box('paint', K.stoneDk, 0.96, 0.1, 0.96, 0, 1.25, 0, { r: 0.03 });
      B.box('paint', K.stone, 0.86, 0.1, 0.86, 0, 1.35, 0, { r: 0.03 });
      B.sph('paint', K.stoneLt, 0.2, 0, 1.58, 0, { ws: 12, hs: 8 });
      B.push(0, 0.78, 0.402);
      B.tor('metal', K.bronze, 0.14, 0.025, 0, 0, 0, { ts: 16, rs: 5 });
      B.cyl(NS('paint'), K.poppy, 0.04, 0.02, 0, -0.14, 0.02, { rx: HP, seg: 8 });
      B.pop();
      B.col(-0.2, 1.3, -0.2, 0.2, 1.8, 0.2, { roof: true });
    },
  };
  // laurel wreath with red poppies on a little easel stand (faces +Z)
  D.craters_wreath = {
    desc: 'Remembrance wreath (laurel + poppies) on an easel, facing +Z. variant 1 = laid flat.',
    build(B, o) {
      const flat = (o.variant ?? 0) % 2 === 1, R = o.r ?? 0.3;
      if (!flat) { for (const s of [-1, 1]) rod(B, NS('wood'), K.timberDk, [s * 0.2, 0, -0.1], [s * 0.05, 0.85, 0.02], 0.012, 4); rod(B, NS('wood'), K.timberDk, [0, 0, -0.35], [0, 0.8, 0.0], 0.012, 4); }
      B.push(0, flat ? 0.05 : 0.6, flat ? 0 : 0.05, 0, flat ? -HP : -0.12);
      for (let k = 0; k < 22; k++) {
        const a = (k / 22) * TAU, rr = R + (hash(k * 1.7) - 0.5) * 0.04;
        B.box('foliage', mixc(K.leafDk, K.leaf, hash(k)), 0.1, 0.05, 0.03, Math.cos(a) * rr, Math.sin(a) * rr, 0, { rz: a + 0.8, r: 0.02 });
        if (k % 3 === 0) { B.cyl(NS('paint'), K.poppy, 0.045, 0.02, Math.cos(a) * rr, Math.sin(a) * rr, 0.035, { rx: HP, seg: 8 }); B.cyl(NS('paint'), K.ink, 0.013, 0.02, Math.cos(a) * rr, Math.sin(a) * rr, 0.047, { rx: HP, seg: 6 }); }
      }
      B.pop();
    },
  };
  // remembrance lantern on a short cast-iron post (glows at dusk)
  D.craters_lantern = {
    desc: 'Remembrance lantern on a 0.9 m cast-iron post; lit at dusk.',
    build(B) {
      B.cyl('paint', K.iron, 0.09, 0.08, 0, 0.04, 0, { seg: 10 });
      B.cyl('paint', K.iron, 0.035, 0.85, 0, 0.47, 0, { seg: 8 });
      lanternHead(B, 0.9);
      B.col(-0.12, 0, -0.12, 0.12, 1.3, 0.12);
    },
  };
  // memorial bench: a Portland stone slab on two blocks, a small bronze plaque (seat faces +Z)
  D.craters_bench = {
    desc: 'Memorial bench: stone slab seat on two stone blocks, bronze plaque. Seat faces +Z.',
    params: { length: 'm (1.9)' },
    build(B, o) {
      const L = o.length ?? 1.9;
      for (const s of [-1, 1]) B.box('paint', K.stoneDk, 0.3, 0.4, 0.42, s * (L / 2 - 0.3), 0.2, 0, { r: 0.03 });
      B.box('paint', K.stone, L, 0.1, 0.5, 0, 0.45, 0, { r: 0.03 });
      pbox(B, NS('metal'), K.bronzeLt, 0.22, 0.07, 0.01, 0, 0.45, 0.255);
      B.col(-L / 2, 0, -0.26, L / 2, 0.5, 0.26);
      B.blob(L + 0.3, 0.8);
    },
  };

  // ============================================================================================ the pillbox
  // pos = the pillbox's centre at the ground, local +Z = its front (the embrasures). The layout is its walls (5.4 × 5.0,
  // 0 … 2.05) and the roof slab (2.05 … 2.4, overhanging the front and sides); this dresses it: three embrasures with
  // splayed concrete hoods, chipped camouflage paint, moss and streaks, the back door behind a blast wall, a plaque.
  D.craters_pillbox = {
    desc: 'Pillbox dressing: embrasures, camouflage, moss, door + blast wall, plaque. Local +Z = the front.',
    params: { w: 'm (5.4)', d: 'm (5.0)' },
    build(B, o) {
      const w = o.w ?? 5.4, d = o.d ?? 5.0, wall = 2.05;
      const slit = (x, z, ry, len = 1.1) => {
        B.push(x, 1.25, z, ry);
        pbox(B, NS('paint'), '#141516', len, 0.2, 0.02, 0, 0, 0.012);
        B.add('paint', frustumGeo(len + 0.4, 0.14, len + 0.12, 0.04, 0.16), K.concreteDk, 0, 0.1, 0.07, { rx: 0 });
        pbox(B, 'paint', K.concreteDk, len + 0.4, 0.1, 0.16, 0, -0.16, 0.07);
        B.pop();
      };
      slit(0, d / 2, 0, 1.3); slit(-w / 2, 0.6, -HP); slit(w / 2, 0.6, HP);
      // (the flaking camouflage is painted on the walls: murals.js 8) moss along the foot, rust streaks under the slits
      for (const s of [-1, 1]) { B.push(s * (w / 2 + 0.006), 0, 0, s * HP); pbox(B, NS('paint'), K.moss, d, 0.16, 0.012, 0, 0.08, 0); B.pop(); }
      pbox(B, NS('paint'), K.moss, w, 0.14, 0.012, 0, 0.07, d / 2 + 0.006);
      for (let k = 0; k < 6; k++) pbox(B, NS('paint'), '#8b6e52', 0.05, 0.5 + 0.4 * hash(k), 0.006, -2 + k * 0.8, 1.7 - 0.25 * hash(k), d / 2 + 0.008);
      // the door at the back (behind a blast wall), a bronze plaque by it
      B.push(0.9, 0, -d / 2, P);
      pbox(B, 'paint', K.rustDk, 0.8, 1.7, 0.06, 0, 0.85, 0.03);
      for (const y of [0.3, 1.4]) pbox(B, NS('metal'), K.iron, 0.9, 0.06, 0.04, 0, y, 0.08);
      pbox(B, NS('metal'), K.bronzeLt, 0.42, 0.28, 0.02, -1.0, 1.35, 0.01);
      B.push(-1.0, 1.35, 0.022);
      letters(B, o.label ?? 'PILLBOX', { h: 0.05, wt: 0.22, flat: true, y: 0.05, c: K.ink, mat: 'paint', track: 0.16 });
      letters(B, o.no ?? 'No 7', { h: 0.07, wt: 0.22, flat: true, y: -0.07, c: K.ink, mat: 'paint', track: 0.16 });
      B.pop();
      B.pop();
      // a stubby vent pipe + a periscope cap on the roof
      B.cyl('metal', K.rust, 0.08, 0.35, -1.6, wall + 0.35 + 0.175, -1.4, { seg: 8 });
      B.cyl('metal', K.rustDk, 0.12, 0.05, -1.6, wall + 0.35 + 0.35, -1.4, { seg: 8 });
      B.col(-1.72, wall + 0.35, -1.52, -1.48, wall + 0.75, -1.28);
    },
  };

  // ============================================================================================ war relics
  // The giant ink cannon: its turret half-buried in the Great Crater's slope (the layout's octagonal platform is the
  // turret deck: pos = its centre at deck height, local +Z = outward, up the slope), rusted riveted plating round it, the
  // mantlet in the middle and the barrel raised 50° over the rim — a skyline landmark on both sides of the crater.
  D.craters_cannon = {
    desc: 'Giant ink-cannon relic dressing round the crater\'s turret deck (deck top at pos). Local +Z = the barrel\'s bearing.',
    params: { S: 'turret deck size (3.6)', drop: 'm the turret wall runs down below the deck (2.0)' },
    build(B, o) {
      const S = o.S ?? 3.6, h = S / 2, drop = o.drop ?? 2.0;
      // riveted armour skirt round the deck (plates just proud of the layout block's sides), angle irons on the corners,
      // a steel rim round the deck edge
      for (let k = 0; k < 4; k++) {
        B.push(0, 0, 0, (k * PI) / 2);
        B.box('rubber', K.rust, S + 0.08, drop, 0.05, 0, -drop / 2 - 0.02, h + 0.025, { r: 0.01 });
        for (const y of [-0.12, -0.7, -1.3]) for (let i = 0; i < 9; i++) B.sph(NS('rubber'), K.rustDk, 0.03, -h + 0.2 + i * (S - 0.4) / 8, y, h + 0.055, { ws: 5, hs: 3 });
        pbox(B, 'rubber', K.rustDk, S + 0.12, 0.06, 0.1, 0, 0.0, h + 0.03);
        for (const x of [-S / 6, S / 6]) pbox(B, NS('rubber'), K.rustDk, 0.06, drop - 0.1, 0.03, x, -drop / 2, h + 0.06);
        B.pop();
      }
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pbox(B, 'rubber', K.rustDk, 0.14, drop + 0.04, 0.14, sx * (h + 0.03), -drop / 2, sz * (h + 0.03));
      // a hatch and a few rivet heads on the (inkable) deck
      B.cyl(NS('rubber'), K.rust, 0.42, 0.03, -0.9, 0.015, -0.8, { seg: 16 });
      B.tor(NS('rubber'), K.rustDk, 0.42, 0.03, -0.9, 0.03, -0.8, { rx: HP, ts: 16, rs: 4 });
      // the mantlet (a sloped armour block) and the trunnions
      B.push(0, 0, 0.3);
      B.add('rubber', frustumGeo(1.5, 1.2, 1.1, 0.9, 1.1), K.rust, 0, 0.0, 0);
      for (const s2 of [-1, 1]) { B.cyl('rubber', K.rustDk, 0.3, 0.3, s2 * 0.75, 0.75, 0, { rz: HP, seg: 14 }); B.cyl(NS('rubber'), K.rust, 0.18, 0.34, s2 * 0.75, 0.75, 0, { rz: HP, seg: 10 }); }
      // the barrel: a stepped, tapering tube raised 50°, a muzzle ring and the old ink-stained bore
      B.push(0, 0.85, 0.2, 0, 50 * (PI / 180));
      B.lathe('rubber', K.rust, [[0, 0], [0.46, 0], [0.46, 1.2], [0.4, 1.3], [0.38, 3.4], [0.34, 3.5], [0.31, 6.6], [0.37, 6.75], [0.37, 7.1], [0.24, 7.1], [0.24, 6.9]], 0, 0, 0, { seg: 20 });
      B.lathe('rubber', K.rustDk, [[0.39, 1.8], [0.43, 1.85], [0.43, 2.0], [0.39, 2.05]], 0, 0, 0, { seg: 20 });
      B.cyl(NS('paint'), '#1a1c1f', 0.24, 0.02, 0, 7.08, 0, { seg: 16 });
      for (let k = 0; k < 5; k++) B.box(NS('rubber'), K.rustLt, 0.05, 0.9 + hash(k) * 1.5, 0.012, Math.cos(k * 1.3) * 0.36, 2.2 + k * 0.8, Math.sin(k * 1.3) * 0.36, { ry: -k * 1.3 + HP, r: 0.005 });
      B.pop();
      B.pop();
      B.col(-0.8, 0, -0.35, 0.8, 1.35, 0.95, { roof: true });
    },
  };
  // A huge ribbed shell casing lying half-buried along the slope: brass body gone brown, copper driving bands, the fuze
  // nose (local +X). pos = its axis centre at ground contact; it sinks `sink` m into the slope.
  D.craters_shell = {
    desc: 'Giant artillery-shell relic lying along local X, half-buried. Collider: off-limits.',
    params: { L: 'length (5)', R: 'radius (0.78)', sink: 'm buried (0.45)' },
    build(B, o) {
      const L = o.L ?? 5, R = o.R ?? 0.78, sink = o.sink ?? 0.45, y = R - sink;
      B.push(0, y, 0, 0, 0, -HP);
      // profile along the axis (lathe y = axis, pointing +X after the turn): base, body, bands, ogive, fuze
      const x0 = -L / 2;
      B.lathe('metal', K.brass, [[0, x0], [R * 0.94, x0], [R, x0 + 0.06], [R, x0 + L * 0.58], [R * 0.93, x0 + L * 0.7], [R * 0.72, x0 + L * 0.82], [R * 0.44, x0 + L * 0.91], [R * 0.3, x0 + L * 0.95], [0.001, x0 + L * 0.95]], 0, 0, 0, { seg: 24 });
      for (const t of [0.1, 0.16, 0.5]) B.lathe('rubber', K.rust, [[R + 0.001, x0 + L * t], [R + 0.05, x0 + L * t + 0.03], [R + 0.05, x0 + L * t + 0.16], [R + 0.001, x0 + L * t + 0.19]], 0, 0, 0, { seg: 24 });
      for (let k = 0; k < 8; k++) B.lathe(NS('metal'), K.brassDk, [[R + 0.001, x0 + 0.5 + k * 0.28], [R + 0.018, x0 + 0.52 + k * 0.28], [R + 0.018, x0 + 0.56 + k * 0.28], [R + 0.001, x0 + 0.58 + k * 0.28]], 0, 0, 0, { seg: 24 });
      B.lathe('metal', K.steelDk, [[0.001, x0 + L * 0.95], [R * 0.3, x0 + L * 0.95], [R * 0.24, x0 + L * 0.99], [R * 0.08, x0 + L], [0.001, x0 + L]], 0, 0, 0, { seg: 16 });
      B.pop();
      // verdigris + rust streaks, the stencilled lot number
      for (let k = 0; k < 7; k++) { const a = -0.3 + k * 0.28; B.box(NS('metal'), k % 2 ? '#6f8a6a' : K.rust, 0.5 + hash(k) * 0.9, 0.012, 0.05, -1.2 + k * 0.4, y + Math.sin(a + HP) * R, Math.cos(a + HP) * R, { rx: -a, r: 0.004 }); }
      B.push(-0.6, y, R * 0.7, 0, -0.8);
      letters(B, 'IX-44', { h: 0.2, wt: 0.2, flat: true, c: '#ece2c6', mat: 'paint', y: -0.1, z: 0.01 });
      B.pop();
      B.col(-L / 2, 0, -R * 0.9, L / 2 - 0.3, y + R * 0.8, R * 0.9, { roof: true });
    },
  };

  // ============================================================================================ the battlefield
  // barbed-wire entanglement along local +X (length L): screw pickets with pigtail eyes, four strands and cross-wires, a
  // concertina coil along the front (+Z). Rail collider (kids can't pass; ink, shots and squids go through).
  D.craters_wire = {
    desc: 'Barbed-wire entanglement run along +X: screw pickets, strands, concertina coil. Rail collider.',
    params: { length: 'm (6)', coil: 'concertina in front (true)' },
    build(B, o) {
      const L = o.length ?? 6, n = Math.max(2, Math.round(L / 1.5)), coil = o.coil !== false, wc = '#4b4640', pc = '#5b3d2c';
      const pk = [];
      for (let i = 0; i <= n; i++) {
        const x = (L * i) / n, lean = (hash(i + L) - 0.5) * 0.12, h = 1.15 - hash(i * 3 + L) * 0.12;
        pk.push([x + lean * h, h]);
        rod(B, 'rubber', pc, [x, 0, 0], [x + lean * h, h, 0], 0.022, 5);
        for (const y of [0.35, 0.7, 1.02]) if (y < h) B.tor(NS('rubber'), pc, 0.045, 0.01, x + lean * y + 0.04, y, 0, { ts: 8, rs: 3 });
      }
      for (let i = 0; i < n; i++) {
        const [xa, ha] = pk[i], [xb, hb] = pk[i + 1];
        for (const f of [0.3, 0.55, 0.8, 0.98]) rod(B, NS('rubber'), wc, [xa - 0.02 + (f - 1) * 0, ha * f, 0], [xb, hb * f, 0], 0.006, 3);
        rod(B, NS('rubber'), wc, [xa, ha * 0.98, 0], [xb, hb * 0.3, 0], 0.006, 3);
        rod(B, NS('rubber'), wc, [xa, ha * 0.3, 0], [xb, hb * 0.98, 0], 0.006, 3);
      }
      if (coil) {
        const pts = [], r = 0.36, turns = Math.round(L / 0.3);
        for (let k = 0; k <= turns * 10; k++) { const t = k / 10, a = t * TAU; pts.push(P3((L * t) / turns, 0.38 + Math.sin(a) * r * 0.95, 0.45 + Math.cos(a) * r)); }
        B.tube(NS('rubber'), wc, pts, 0.007, { radial: 3 });
      }
      B.col(-0.05, 0, -0.15, L + 0.05, 1.15, coil ? 0.85 : 0.15, { rail: true });
    },
  };
  // chalk boulder (cover): a faceted, weathered lump of chalk with a flint or two and chips round its foot
  const rockGeo = (seed) => tpl(['rock', seed].map(kf).join('|'), () => {
    const g0 = new THREE.IcosahedronGeometry(1, 1), P0 = g0.attributes.position;
    const key = (x, y, z) => Math.round(x * 97) * 7 + Math.round(y * 89) * 13 + Math.round(z * 83) * 29 + seed * 101;
    for (let i = 0; i < P0.count; i++) {
      const x = P0.getX(i), y = P0.getY(i), z = P0.getZ(i), k = 0.78 + 0.34 * hash(key(x, y, z));
      P0.setXYZ(i, x * k * (1 + 0.25 * hash(seed + 1)), Math.max(-0.35, y * k * 0.72), z * k * (1 - 0.15 * hash(seed + 2)));
    }
    g0.computeVertexNormals();
    const n = P0.count, cArr = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 3) { const t = 0.9 + 0.12 * hash(i + seed), yy = (P0.getY(i) + P0.getY(i + 1) + P0.getY(i + 2)) / 3, k = yy < -0.2 ? 0.8 : t; for (let j = 0; j < 3; j++) cArr.set([k, k, k * 0.98], (i + j) * 3); }
    g0.setAttribute('color', new THREE.Float32BufferAttribute(cArr, 3));
    g0.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    return g0;
  });
  D.craters_boulder = {
    desc: 'Chalk boulder: a faceted weathered lump with flints and chips. params: s (size, 1), flat (0.75).',
    build(B, o) {
      const s = o.s ?? 1, fl = o.flat ?? 0.75, seed = Math.round((o.seed ?? 1) * 7) % 6;
      B.add('rubber', rockGeo(seed), K.chalk, 0, 0.3 * s * fl, 0, { s: 0.75 * s, sy: 0.75 * s * fl * 1.25, ry: seed });
      B.add('rubber', rockGeo((seed + 3) % 6), shade(K.chalk, 0.95), 0.55 * s, 0.14 * s, 0.35 * s, { s: 0.32 * s, sy: 0.28 * s, ry: seed * 2 });
      for (let k = 0; k < 2; k++) { const a = k * 2.6 + seed; B.add('rubber', rockGeo((seed + k) % 6), K.flint, Math.cos(a) * 0.5 * s, 0.35 * s * fl, Math.sin(a) * 0.55 * s, { s: 0.09 * s, sy: 0.07 * s }); }
      for (let k = 0; k < 5; k++) { const a = k * 1.7 + seed; B.add(NS('rubber'), rockGeo((seed + k + 1) % 6), shade(K.chalk, 0.9), Math.cos(a) * 0.95 * s, 0.03, Math.sin(a) * 0.9 * s, { s: s * (0.1 + 0.08 * hash(k)), sy: 0.07 * s }); }
      B.col(-0.72 * s, 0, -0.72 * s, 0.72 * s, 0.9 * s * fl + 0.05, 0.72 * s);
    },
  };
  // gorse bush (dense dark green, yellow flower flecks): cover
  D.craters_gorse = {
    desc: 'Gorse bush: a dense rounded mass of dark spiny green with yellow blooms. params: s (1).',
    build(B, o) {
      const s = o.s ?? 1, seed = Math.round((o.seed ?? 1) * 5) % 6;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + seed, r = k ? 0.42 * s : 0, y = k ? 0.42 : 0.62;
        B.add('foliage', H.puffGeo(2, (seed + k) % 6), mixc(K.gorse, K.leafDk, hash(k + seed)), Math.cos(a) * r, y * s, Math.sin(a) * r, { s: (k ? 0.5 : 0.62) * s, sy: (k ? 0.45 : 0.58) * s, ry: a });
      }
      for (let k = 0; k < 26; k++) { const a = hash(k * 3.1 + seed) * TAU, e = hash(k * 1.7 + seed) * 1.2, rr = 0.78 * s; B.sph(NS('paint'), K.gorseY, 0.035, Math.cos(a) * Math.cos(e * 0.8) * rr, (0.45 + Math.sin(e) * 0.55) * s, Math.sin(a) * Math.cos(e * 0.8) * rr, { ws: 5, hs: 3 }); }
      B.col(-0.8 * s, 0, -0.8 * s, 0.8 * s, 1.05 * s, 0.8 * s);
    },
  };
  // wind-bent hawthorn on the downs: a leaning, twisted trunk, a canopy streamed away from the sea wind (−X → +X)
  D.craters_hawthorn = {
    desc: 'Wind-bent hawthorn tree leaning toward local +X. Collider: the trunk.',
    params: { s: 'scale (1)' },
    build(B, o) {
      const s = o.s ?? 1, bark = '#5d4a3a';
      const pts = [P3(0, 0, 0), P3(0.15, 0.8, 0.05), P3(0.55, 1.6, -0.05), P3(1.2, 2.3, 0.1), P3(2.0, 2.75, 0.05)].map((p) => P3(p[0] * s, p[1] * s, p[2] * s));
      B.tube('wood', bark, pts, 0.16 * s, { radial: 8 });
      B.tube('wood', bark, [pts[2], P3(0.9 * s, 2.0 * s, 0.6 * s), P3(1.6 * s, 2.3 * s, 0.9 * s)], 0.08 * s, { radial: 6 });
      B.tube('wood', bark, [pts[3], P3(1.5 * s, 2.9 * s, -0.4 * s), P3(2.3 * s, 3.0 * s, -0.7 * s)], 0.07 * s, { radial: 6 });
      const cl = [[1.5, 2.8, 0.1, 1.0], [2.3, 2.9, -0.4, 0.8], [1.8, 2.5, 0.8, 0.75], [0.9, 2.6, -0.3, 0.7], [2.7, 2.7, 0.3, 0.7], [1.2, 2.2, 0.6, 0.6]];
      cl.forEach(([x, y, z, r], k) => B.add('foliage', H.puffGeo(2, k % 6), mixc(K.leafDk, K.leaf, hash(k * 2.3)), x * s, y * s, z * s, { s: r * s, sy: r * 0.6 * s, ry: k }));
      for (let k = 0; k < 18; k++) { const c = cl[k % cl.length]; B.sph(NS('paint'), '#9c2e25', 0.03 * s, (c[0] + (hash(k) - 0.5) * c[3]) * s, (c[1] + (hash(k * 3) - 0.3) * c[3] * 0.5) * s, (c[2] + (hash(k * 5) - 0.5) * c[3]) * s, { ws: 4, hs: 3 }); }
      B.col(-0.25 * s, 0, -0.25 * s, 0.45 * s, 1.6 * s, 0.25 * s);
    },
  };
  // reed clump (common reed + a few bulrushes), two-sided foliage, no collider
  D.craters_reeds = {
    desc: 'Reed clump with bulrush heads (pond edges). params: s (1), n blades (22).',
    build(B, o) {
      const s = o.s ?? 1, n = o.n ?? 22;
      tuft(B, 0, 0, 0, 1.35 * s, mixc(K.reed, K.reedDk, 0.4), 0, n, 3);
      tuft(B, 0.1, 0, 0.08, 1.0 * s, K.reed, 1.3, Math.round(n * 0.6), 4);
      for (let k = 0; k < 4; k++) {
        const a = k * 1.9 + s, r = 0.12 + 0.1 * hash(k), h = (1.2 + 0.4 * hash(k * 3)) * s, lean = 0.12;
        rod(B, NS('foliage'), K.reedDk, [Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * (r + lean), h, Math.sin(a) * (r + lean)], 0.008, 3);
        B.cyl(NS('foliage'), '#5a4030', 0.025, 0.2, Math.cos(a) * (r + lean * 0.93), h - 0.12, Math.sin(a) * (r + lean * 0.93), { seg: 6 });
      }
    },
  };
  // wildflower patch: field poppies (red), a few ox-eye daisies, grass; no collider
  D.craters_poppies = {
    desc: 'Wildflower patch: red field poppies, daisies, grass. params: r (0.7), n (9).',
    build(B, o) {
      const R = o.r ?? 0.7, n = o.n ?? 9, sd = (o.seed ?? 1) * 11;
      tuft(B, 0, 0, 0, 0.45, K.leaf, sd, 12, 2);
      for (let k = 0; k < n; k++) {
        const a = hash(k + sd) * TAU, r = Math.sqrt(hash(k * 3 + sd)) * R, h = 0.35 + 0.3 * hash(k * 7 + sd), x = Math.cos(a) * r, z = Math.sin(a) * r;
        const daisy = hash(k * 11 + sd) > 0.78;
        rod(B, NS('foliage'), K.leafDk, [x, 0, z], [x + 0.03, h, z], 0.006, 3);
        if (daisy) { B.cyl(NS('paint'), K.white, 0.035, 0.012, x + 0.03, h, z, { seg: 8 }); B.cyl(NS('paint'), K.gorseY, 0.012, 0.02, x + 0.03, h + 0.005, z, { seg: 5 }); }
        else { B.sph(NS('paint'), k % 3 ? K.poppy : K.poppyDk, 0.045, x + 0.03, h, z, { ws: 7, hs: 4, sy: 0.55 }); B.cyl(NS('paint'), K.ink, 0.012, 0.02, x + 0.03, h + 0.02, z, { seg: 5 }); }
      }
    },
  };
  // grass tussock (cliff tops, crater rims, planters); no collider
  D.craters_tussock = {
    desc: 'Grass tussock. params: s (0.6).',
    build(B, o) { tuft(B, 0, 0, 0, o.s ?? 0.6, mixc(K.reed, K.leaf, 0.3 + 0.5 * hash(o.seed ?? 1)), 0, 16, o.seed ?? 1); },
  };
  // post-and-wire fence along +X (timber posts every ~2 m, three plain wires): rail collider
  D.craters_fence = {
    desc: 'Post-and-wire fence run along +X. params: length (m), h (1.0).',
    build(B, o) {
      const L = o.length ?? 6, h = o.h ?? 1.0, n = Math.max(1, Math.round(L / 2));
      for (let i = 0; i <= n; i++) { const x = (L * i) / n; B.box('wood', shade(K.timber, 0.9 + 0.2 * hash(i + L)), 0.1, h + 0.1, 0.1, x, (h + 0.1) / 2, 0, { r: 0.02 }); B.add(NS('wood'), pyramidGeo(0.1, 0.05), K.timberDk, x, h + 0.1, 0); }
      for (const f of [0.35, 0.65, 0.95]) B.cyl(NS('metal'), K.steel, 0.006, L, L / 2, h * f, 0.055, { rz: HP, seg: 4 });
      B.col(-0.06, 0, -0.08, L + 0.06, h + 0.1, 0.1, { rail: true });
    },
  };
  // signage: 0 = cliff-edge warning (red triangle + board), 1 = fingerpost (o.arms: [[text, angle°], …]),
  // 2 = trench board on stakes (o.text), 3 = small keep-off plaque on a stake (o.text)
  D.craters_sign = {
    desc: 'Signs: 0 cliff warning, 1 fingerpost (arms), 2 trench board (text), 3 plaque stake (text).',
    build(B, o) {
      const v = (o.variant ?? 0) % 4;
      if (v === 0) {
        B.box('paint', K.steelDk, 0.07, 1.9, 0.07, 0, 0.95, 0, { r: 0.02 });
        B.push(0, 1.62, 0.05);
        const tri = tpl('tri-sign', () => { const g = new GB(); g.face([[-0.28, -0.22, 0], [0.28, -0.22, 0], [0, 0.26, 0]], [0, 0, 1]); return g.geo(); });
        B.add('paint', tri, K.signRed, 0, 0, 0.012); B.add(NS('paint'), tri, K.white, 0, 0.02, 0.018, { s: 0.72 });
        letters(B, '!', { h: 0.2, wt: 0.24, flat: true, c: K.ink, mat: 'paint', y: -0.12, z: 0.024 });
        B.pop();
        B.box('paint', K.white, 0.7, 0.42, 0.03, 0, 1.12, 0.05, { r: 0.01 });
        B.push(0, 1.12, 0.068);
        letters(B, 'DANGER', { h: 0.1, wt: 0.24, flat: true, c: K.signRed, mat: 'paint', y: 0.04 });
        letters(B, 'CLIFF EDGE', { h: 0.075, wt: 0.24, flat: true, c: K.ink, mat: 'paint', y: -0.11 });
        B.pop();
        B.col(-0.08, 0, -0.08, 0.08, 1.9, 0.08);
      } else if (v === 1) {
        B.box('wood', K.timber, 0.12, 2.3, 0.12, 0, 1.15, 0, { r: 0.02 });
        B.add(NS('wood'), pyramidGeo(0.12, 0.08), K.timberDk, 0, 2.3, 0);
        (o.arms || [['VISITOR CENTRE', 0]]).forEach(([t, deg], i) => {
          const y = 2.0 - i * 0.28, a = (deg * PI) / 180, w = Math.max(0.9, textW(t, 0.22, 0.14) * 0.09 + 0.3);
          B.push(0, y, 0, a + HP);
          B.box('wood', K.signCream, w, 0.2, 0.04, w / 2 + 0.06, 0, 0, { r: 0.015 });
          for (const zz of [0.022, -0.022]) { B.push(w / 2 + 0.06, 0, zz, zz > 0 ? 0 : P); letters(B, t, { h: 0.09, wt: 0.22, flat: true, c: K.signGreen, mat: 'paint', y: -0.045, z: 0.001 }); B.pop(); }
          B.pop();
        });
        B.col(-0.08, 0, -0.08, 0.08, 2.3, 0.08);
      } else if (v === 2) {
        for (const s of [-1, 1]) B.box('wood', K.timberDk, 0.08, 1.1, 0.08, s * 0.55, 0.55, 0, { r: 0.02 });
        B.box('wood', shade(K.timber, 0.85), 1.4, 0.36, 0.05, 0, 0.88, 0.05, { r: 0.015 });
        B.push(0, 0.88, 0.078);
        letters(B, o.text ?? 'TRENCH LINE B', { h: 0.11, wt: 0.24, flat: true, c: '#efe7d2', mat: 'paint', y: -0.055 });
        B.pop();
        B.col(-0.7, 0, -0.06, 0.7, 1.1, 0.1);
      } else {
        B.box('wood', K.timberDk, 0.06, 0.8, 0.06, 0, 0.4, 0, { r: 0.015 });
        B.box('paint', K.white, 0.42, 0.26, 0.02, 0, 0.72, 0.04, { r: 0.008, rx: -0.2 });
        B.push(0, 0.72, 0.052, 0, -0.2);
        letters(B, o.text ?? 'KEEP OFF', { h: 0.06, wt: 0.24, flat: true, c: K.signRed, mat: 'paint', y: -0.03 });
        B.pop();
      }
    },
  };
  // interpretive board frame round a layout panel (the panel + its painted mural are layout.js BOARDS): two steel posts,
  // a slim frame and a little roof cap; pos = the panel's bottom centre on the ground, local +Z = the panel's face
  D.craters_board = {
    desc: 'Interpretive-board frame (posts, frame, cap) round a layout panel. params: w (1.6), y0 (0.65), y1 (1.65).',
    build(B, o) {
      const w = o.w ?? 1.6, y0 = o.y0 ?? 0.65, y1 = o.y1 ?? 1.65, c = K.board;
      for (const s of [-1, 1]) { B.box('gloss', c, 0.08, y1 + 0.18, 0.08, s * (w / 2 + 0.06), (y1 + 0.18) / 2, 0, { r: 0.02 }); B.box(NS('paint'), K.iron, 0.2, 0.05, 0.2, s * (w / 2 + 0.06), 0.025, 0); }
      for (const y of [y0 - 0.03, y1 + 0.03]) B.box('gloss', c, w + 0.2, 0.05, 0.1, 0, y, 0, { r: 0.015 });
      B.box('gloss', c, w + 0.4, 0.05, 0.36, 0, y1 + 0.2, 0.02, { r: 0.015, rx: 0.12 });
      B.col(-w / 2 - 0.12, 0, -0.08, -w / 2, y1 + 0.2, 0.08); B.col(w / 2, 0, -0.08, w / 2 + 0.12, y1 + 0.2, 0.08);
    },
  };

  // timber revetment frames on a trench wall (a run along local +X, the wall at local z = 0, the trench toward +Z): posts
  // every ~1.8 m from the duckboards up to the downs, a waling beam along the top, wire ties back into the bank
  D.craters_revetment = {
    desc: 'Trench revetment frames along +X (posts + waling), on a wall facing +Z. params: length, h (1.0).',
    build(B, o) {
      const L = o.length ?? 6, h = o.h ?? 1.0, n = Math.max(1, Math.round(L / 1.8));
      for (let i = 0; i <= n; i++) { const x = (L * i) / n; B.box('wood', shade(K.timberDk, 0.9 + 0.2 * hash(i + L)), 0.12, h - 0.04, 0.08, x, (h - 0.04) / 2, 0.04, { r: 0.015 }); }
      B.box('wood', K.timberDk, L + 0.1, 0.1, 0.08, L / 2, h - 0.12, 0.05, { r: 0.015 });
      for (let i = 0; i < n; i++) pbox(B, NS('metal'), K.iron, 0.02, 0.02, 0.1, (L * (i + 0.5)) / n, h - 0.05, 0.03);
    },
  };
  // rubble of the war: chalk chips, a slab of shattered concrete, a twisted length of rebar (no collider)
  D.craters_rubble = {
    desc: 'War rubble: chalk chips, a concrete fragment, twisted rebar. No collider.',
    build(B, o) {
      const sd = Math.round((o.seed ?? 1) * 3);
      for (let k = 0; k < 6; k++) { const a = k * 1.1 + sd, r = 0.2 + 0.5 * hash(k + sd); B.add(NS('rubber'), rockGeo((sd + k) % 6), shade(K.chalk, 0.88 + 0.1 * hash(k)), Math.cos(a) * r, 0.04, Math.sin(a) * r, { s: 0.1 + 0.1 * hash(k * 3 + sd), sy: 0.09 }); }
      B.box('rubber', K.concreteDk, 0.6, 0.14, 0.45, 0.1, 0.05, -0.1, { r: 0.03, ry: sd, rz: 0.15 });
      const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(P3(0.1 + t * 0.9, 0.12 + Math.sin(t * 5 + sd) * 0.18 + t * 0.35, -0.1 + Math.sin(t * 3.1) * 0.3)); }
      B.tube(NS('rubber'), K.rustDk, pts, 0.014, { radial: 4 });
      B.tube(NS('rubber'), K.rust, pts.slice(2).map((p) => P3(p[0] - 0.2, p[1] * 0.6, p[2] + 0.2)), 0.012, { radial: 4 });
    },
  };
  // water lilies on the pond: flat pads (a notch each) and a white flower or two
  D.craters_lilies = {
    desc: 'Lily pads + flowers floating on still water (pos at the water surface).',
    build(B, o) {
      const n = o.n ?? 7, R = o.r ?? 0.9, sd = (o.seed ?? 1) * 7;
      const pad = tpl('lilypad', () => { const g = new GB(); const N = 12, c0 = g.v(0, 0, 0, 0, 1, 0); const ring = []; for (let i = 0; i <= N; i++) { const a = 0.35 + (i / N) * (TAU - 0.5); ring.push(g.v(Math.cos(a), 0, Math.sin(a), 0, 1, 0)); } for (let i = 0; i < N; i++) g.tri(c0, ring[i], ring[i + 1]); return g.geo(); });
      for (let k = 0; k < n; k++) {
        const a = hash(k + sd) * TAU, r = Math.sqrt(hash(k * 3 + sd)) * R, s = 0.14 + 0.12 * hash(k * 5 + sd);
        B.add(NS('foliage'), pad, mixc('#4f7a3e', '#6d8f48', hash(k)), Math.cos(a) * r, 0.01, Math.sin(a) * r, { s, ry: hash(k * 7) * TAU, ao: false });
        if (k % 3 === 0) { B.sph(NS('paint'), K.white, 0.05, Math.cos(a) * r, 0.04, Math.sin(a) * r, { ws: 6, hs: 4, sy: 0.6 }); B.sph(NS('paint'), K.gorseY, 0.018, Math.cos(a) * r, 0.065, Math.sin(a) * r, { ws: 5, hs: 3 }); }
      }
    },
  };
  // a park litter bin (dark green, timber-clad) and a picnic table (cover)
  D.craters_bin = {
    desc: 'Park litter bin: timber-slatted with a dark green steel top.',
    build(B) {
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; B.box('wood', shade(K.timber, 0.9 + 0.15 * hash(k)), 0.1, 0.78, 0.03, Math.cos(a) * 0.25, 0.39, Math.sin(a) * 0.25, { ry: -a + HP, r: 0.01 }); }
      B.cyl('gloss', K.signGreen, 0.29, 0.08, 0, 0.82, 0, { seg: 16 });
      B.cyl(NS('paint'), K.ink, 0.12, 0.02, 0, 0.87, 0, { seg: 12 });
      B.col(-0.29, 0, -0.29, 0.29, 0.86, 0.29);
    },
  };
  D.craters_picnic = {
    desc: 'Timber picnic table with attached benches (cover). Local X = along the table.',
    build(B) {
      const L = 1.9;
      B.box('wood', K.timberLt, L, 0.06, 0.8, 0, 0.74, 0, { r: 0.015 });
      for (const s of [-1, 1]) {
        B.box('wood', K.timberLt, L, 0.05, 0.28, 0, 0.44, s * 0.62, { r: 0.015 });
        for (const x of [-0.65, 0.65]) { B.box('wood', K.timber, 0.08, 0.95, 0.08, x, 0.4, s * 0.3, { rx: s * 0.52, r: 0.015 }); }
      }
      for (const x of [-0.65, 0.65]) B.box('wood', K.timber, 0.08, 0.08, 1.5, x, 0.38, 0, { r: 0.015 });
      B.col(-L / 2, 0, -0.78, L / 2, 0.78, 0.78);
    },
  };

  // lifebuoy housing on the cliff top: a red post with the orange ring in its cradle and a little instruction board
  D.craters_lifebuoy = {
    desc: 'Cliff-top lifebuoy post with the ring in its cradle (faces +Z).',
    build(B) {
      B.box('gloss', '#b8392e', 0.12, 1.5, 0.12, 0, 0.75, 0, { r: 0.02 });
      B.box('gloss', '#b8392e', 0.62, 0.62, 0.1, 0, 1.2, 0.08, { r: 0.03 });
      B.tor('gloss', '#e86a2c', 0.24, 0.055, 0, 1.2, 0.17, { ts: 20, rs: 8 });
      for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.78; B.box(NS('paint'), K.white, 0.08, 0.13, 0.12, Math.cos(a) * 0.24, 1.2 + Math.sin(a) * 0.24, 0.17, { rz: a, r: 0.02 }); }
      B.box('paint', K.white, 0.44, 0.3, 0.02, 0, 0.62, 0.07, { r: 0.01 });
      B.push(0, 0.62, 0.082); letters(B, 'LIFEBUOY', { h: 0.055, wt: 0.24, flat: true, c: '#b8392e', mat: 'paint', y: 0.04 }); letters(B, 'IN EMERGENCY', { h: 0.035, wt: 0.24, flat: true, c: K.ink, mat: 'paint', y: -0.06 }); B.pop();
      B.col(-0.32, 0, -0.1, 0.32, 1.55, 0.25);
    },
  };
  // striped canvas deckchair (the downs' visitors), facing +Z; variant = stripe colours
  D.craters_deckchair = {
    desc: 'Striped deckchair facing +Z. variant 0–3 = stripe colours.',
    build(B, o) {
      const cols = [['#c94c3c', '#f1ebdc'], ['#3f6f9a', '#f1ebdc'], ['#d9a93c', '#f1ebdc'], ['#3f8a6a', '#f1ebdc']][(o.variant ?? 0) % 4];
      for (const s of [-1, 1]) { rod(B, 'wood', K.timberLt, [s * 0.28, 0, 0.35], [s * 0.28, 0.78, -0.28], 0.018, 5); rod(B, 'wood', K.timberLt, [s * 0.28, 0, -0.3], [s * 0.28, 0.42, 0.2], 0.018, 5); }
      B.push(0, 0.4, 0.03, 0, -0.95);
      for (let k = 0; k < 5; k++) pbox(B, 'foliage', cols[k % 2], 0.11, 0.9, 0.012, -0.22 + k * 0.11, 0.05, 0);
      B.pop();
      B.col(-0.32, 0, -0.35, 0.32, 0.8, 0.4);
    },
  };
  // viewpoint lectern on the crater's crest: an angled bronze plate on a stone block
  D.craters_lectern = {
    desc: 'Viewpoint lectern: stone block with an angled bronze plate (faces +Z).',
    build(B, o) {
      B.box('paint', K.stoneDk, 0.5, 0.85, 0.35, 0, 0.425, 0, { r: 0.03 });
      B.push(0, 0.95, 0.02, 0, -0.7);
      B.box('metal', K.bronze, 0.62, 0.42, 0.04, 0, 0, 0, { r: 0.015 });
      letters(B, o.text ?? 'THE GREAT CRATER', { h: 0.045, wt: 0.24, flat: true, c: '#e0cc98', mat: 'paint', y: 0.12, z: 0.021 });
      for (let k = 0; k < 3; k++) pbox(B, NS('paint'), '#c9b27c', 0.44 - k * 0.08, 0.012, 0.004, 0, -0.02 - k * 0.07, 0.022);
      B.pop();
      B.col(-0.26, 0, -0.2, 0.26, 1.1, 0.2);
    },
  };
  // ice-cream cart with a striped parasol (cover): a little tricycle cart, cream and mint
  D.craters_icecream = {
    desc: 'Ice-cream cart with a parasol and a menu board (cover). Local +Z = serving side.',
    build(B) {
      B.box('gloss', '#f0e8d4', 1.4, 0.8, 0.8, 0, 0.75, 0, { round: true, r: 0.08 });
      B.box('gloss', '#7cc4a8', 1.44, 0.14, 0.84, 0, 0.42, 0, { r: 0.04 });
      B.box('gloss', '#7cc4a8', 1.44, 0.08, 0.84, 0, 1.18, 0, { r: 0.03 });
      for (const [x, z] of [[-0.55, -0.35], [-0.55, 0.35], [0.7, 0]]) B.cyl('rubber', K.ink, 0.2, 0.06, x + (x > 0 ? 0.25 : 0), 0.2, z, { rx: HP, seg: 14 });
      for (let k = 0; k < 3; k++) B.sph(NS('gloss'), ['#f2c6d0', '#f6ecc8', '#8a5a3c'][k], 0.08, -0.35 + k * 0.35, 1.3, 0.1, { ws: 8, hs: 6 });
      rod(B, 'metal', K.galv, [0, 1.2, 0], [0, 2.3, 0], 0.02, 6);
      const cone = tpl('parasol', () => new THREE.ConeGeometry(1.0, 0.35, 12, 1, true));
      B.add('foliage', cone, '#e8dcc8', 0, 2.3, 0);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; B.box(NS('foliage'), '#d9574a', 0.34, 0.02, 0.36, Math.cos(a) * 0.62, 2.28, Math.sin(a) * 0.62, { ry: -a, rz: 0.33 }); }
      B.box('paint', K.board, 0.5, 0.65, 0.04, 0.95, 0.45, 0.55, { rx: -0.15, r: 0.01 });
      B.push(0.95, 0.5, 0.578, 0, -0.15); letters(B, 'ICES', { h: 0.12, wt: 0.24, flat: true, c: '#f2ead4', mat: 'paint', y: 0.12 }); letters(B, '99', { h: 0.1, wt: 0.24, flat: true, c: '#e8b43a', mat: 'paint', y: -0.1 }); B.pop();
      B.col(-0.75, 0, -0.45, 0.75, 1.35, 0.45);
    },
  };

  // ============================================================================================ trenches + bridges
  // plank bridge dressing (pos = the deck's centre at deck-top height, local +Z along the span): trestle legs down to the
  // trench floor, rope handrails on stakes along both sides (rail colliders on the deck edges)
  D.craters_bridge = {
    desc: 'Plank bridge dressing: trestles, stakes, rope handrails (rail colliders). Local +Z = along the span.',
    params: { w: 'deck width (1.8)', span: 'deck length (3.45)', drop: 'm down to the trench floor (1.7)', ramp: 'ramp run (1.7)' },
    build(B, o) {
      const w = o.w ?? 1.8, span = o.span ?? 3.45, drop = o.drop ?? 1.7, rp = o.ramp ?? 1.7, rope = '#b9a67c';
      for (const zz of [-span / 4, span / 4]) for (const s of [-1, 1]) rod(B, 'wood', K.timberDk, [s * (w / 2 - 0.15), -drop, zz], [s * (w / 2 - 0.1), -0.2, zz], 0.06, 5);
      for (const zz of [-span / 4, span / 4]) beam(B, 'wood', K.timberDk, [-w / 2 + 0.1, -0.3, zz], [w / 2 - 0.1, -0.3, zz], 0.1, 0.12);
      for (const s of [-1, 1]) {
        const x = s * (w / 2 - 0.05), zs = [-span / 2 - rp, -span / 2, span / 2, span / 2 + rp], ys = [-0.7, 0, 0, -0.7];
        zs.forEach((z, i) => rod(B, 'wood', K.timber, [x, ys[i] - 0.1, z], [x, ys[i] + 0.95, z], 0.045, 6));
        for (const f of [0.55, 0.92]) B.tube(NS('rubber'), rope, zs.map((z, i) => P3(x, ys[i] + f + (i === 1 || i === 2 ? 0 : 0.02), z)), 0.018, { radial: 4 });
        B.col(x - 0.06, -0.2, -span / 2, x + 0.06, 0.95, span / 2, { rail: true });
      }
    },
  };
  // trench furniture: 0 = revetment posts + corrugated sheet on a wall (local +Z into the trench), 1 = ladder leaning on
  // the wall, 2 = ammo crates (a stack; cover), 3 = periscope poking over the parapet, 4 = duckboard offcut + sandbags
  D.craters_trenchkit = {
    desc: 'Trench furniture: 0 posts+sheet, 1 ladder, 2 crates, 3 periscope, 4 sandbag pile. Local +Z = away from the wall.',
    build(B, o) {
      const v = (o.variant ?? 0) % 5, H0 = o.h ?? 1.0;
      if (v === 0) {
        for (const x of [-0.9, 0.9]) B.box('wood', K.timberDk, 0.12, H0 + 0.25, 0.12, x, (H0 + 0.25) / 2, 0.07, { r: 0.02 });
        B.box('metal', K.rust, 1.7, H0 * 0.85, 0.03, 0, H0 * 0.47, 0.02, { r: 0.008 });
        for (let k = -7; k <= 7; k++) pbox(B, NS('metal'), K.rustDk, 0.02, H0 * 0.85, 0.035, k * 0.11, H0 * 0.47, 0.03);
      } else if (v === 1) {
        B.push(0, 0, 0.35, 0, 0.3);
        for (const s of [-1, 1]) B.box('wood', K.timber, 0.07, H0 + 0.7, 0.07, s * 0.22, (H0 + 0.7) / 2, 0, { r: 0.015 });
        for (let y = 0.25; y < H0 + 0.6; y += 0.3) B.box(NS('wood'), K.timberLt, 0.44, 0.04, 0.05, 0, y, 0, { r: 0.01 });
        B.pop();
      } else if (v === 2) {
        const cr = (x, y, z, ry) => { B.push(x, y, z, ry); B.box('wood', '#6f6a45', 0.7, 0.36, 0.42, 0, 0.18, 0, { r: 0.02 }); for (const s of [-1, 1]) pbox(B, NS('metal'), K.iron, 0.03, 0.06, 0.2, s * 0.37, 0.22, 0); pbox(B, NS('paint'), '#e9dcb6', 0.3, 0.08, 0.005, 0, 0.2, 0.213); B.pop(); };
        cr(0, 0, 0, 0.05); cr(0.05, 0.36, 0.02, -0.1); cr(0.75, 0, 0.05, 0.12);
        B.col(-0.4, 0, -0.3, 1.15, 0.72, 0.35);
      } else if (v === 3) {
        B.box('metal', K.steelDk, 0.08, H0 + 0.55, 0.06, 0, (H0 + 0.55) / 2, 0.08, { r: 0.01 });
        B.box('metal', K.steelDk, 0.08, 0.14, 0.14, 0, H0 + 0.55, 0.04, { r: 0.01 });
        pbox(B, NS('gloss'), '#1c2a33', 0.06, 0.06, 0.005, 0, H0 + 0.57, -0.035);
      } else {
        const bag = (x, y, z, ry) => B.box('rubber', mixc(K.hessian, K.hessianDk, hash(x * 7 + y * 3 + z)), 0.5, 0.17, 0.3, x, y + 0.085, z, { round: true, r: 0.07, ry });
        bag(0, 0, 0, 0.1); bag(0.48, 0, 0.05, -0.1); bag(0.24, 0.16, 0.02, 0.05); bag(-0.1, 0, 0.35, 1.3);
        B.col(-0.35, 0, -0.2, 0.75, 0.34, 0.5);
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------- placement helpers
const rnd = (i) => { const s = Math.sin(i * 91.7 + 17.3) * 43758.5453; return s - Math.floor(s); };
const ang = (deg) => (deg * Math.PI) / 180;
const polar = (th, r) => [Math.cos(ang(th)) * r, Math.sin(ang(th)) * r];
// the stage's real floor under (x, z) (the highest layout top below yMax): props on the crater's slopes, the cliff lip
const FLOOR_IDX = new PieceIndex([...LAYOUT.single, ...LAYOUT.half, ...LAYOUT.half.map(mirrorDef)].filter((d) => !d.rail && !d.hidden).map((d) => ({ d })));
const groundY = (x, z, yMax = 1.3) => { let t = -Infinity; for (const { d } of FLOOR_IDX.at(x, z)) { const y = topOf(d, x, z); if (y != null && y <= yMax && y > t) t = y; } return +t.toFixed(3); };
const coneY = (r, th) => groundY(Math.cos(ang(th)) * r, Math.sin(ang(th)) * r, 1.8);
// tussocks + cliff-edge warning along the chalk lip (Alpha's half of the coast; the open edges skipped)
const LIP_TUFTS = (() => {
  const out = [];
  COAST.forEach((a, i) => {
    const b = COAST[(i + 1) % COAST.length];
    if (!lipEdge(i)) return;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(L / 1.7);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.3 + rnd(i * 31 + k) * 0.4) / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      // (just inside the edge, on the lip; its top is 0.25 / 0.33)
      let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      if (!inPoly(COAST, (a[0] + b[0]) / 2 + nx * 0.1, (a[1] + b[1]) / 2 + nz * 0.1)) { nx = -nx; nz = -nz; }
      const d = 0.2 + rnd(i * 7 + k) * 0.3, inside = [x + nx * d, z + nz * d];
      out.push({ type: 'craters_tussock', pos: [+inside[0].toFixed(2), groundY(inside[0], inside[1], 0.5), +inside[1].toFixed(2)], s: 0.45 + rnd(k * 3 + i) * 0.35, seed: (i * 13 + k) % 7, rotY: rnd(k) * 6 });
    }
  });
  return out;
})();

// fallen chalk on the undercliff shelf: a boulder every ~8 m along each shelf, by turns at the cliff foot and at the
// shelf's outer edge (cover along the low route; the shelf's own top under it)
const SHELF_ROCKS = (() => {
  const out = [], n = COAST.length;
  let k = 0;
  for (const chain of [UNDERCLIFF.right, UNDERCLIFF.left]) {
    let cum = 0, next = 3.5;
    for (const i of chain) {
      const a = COAST[i], b = COAST[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      let ox = uz, oz = -ux;
      if (inPoly(COAST, (a[0] + b[0]) / 2 + ox * 0.1, (a[1] + b[1]) / 2 + oz * 0.1)) { ox = -ox; oz = -oz; }
      for (; next < cum + L - 0.6; next += 8) {
        const t = Math.max(0.6, next - cum), d = k % 2 ? 1.75 : 0.75, x = a[0] + ux * t + ox * d, z = a[1] + uz * t + oz * d;
        out.push({ type: 'craters_boulder', pos: [+x.toFixed(2), groundY(x, z, 0), +z.toFixed(2)], s: 0.8 + rnd(k + i) * 0.25, flat: 0.8, seed: k % 7, rotY: rnd(k * 3) * 6 });
        k++;
      }
      cum += L;
    }
  }
  // (the saps' mouths stay clear; and the corners where the shelf wraps round a point of the cliff — a rock there left a
  // one-metre squeeze by the water that bots wedged in, the Long Stages stretch's new sides)
  return out.filter((p) => Math.hypot(p.pos[0] - T3.x0, p.pos[2] - T3.z) > 3 && Math.hypot(p.pos[0] - T4.x1, p.pos[2] - T4.z) > 3
    && !COAST.some((c) => Math.hypot(p.pos[0] - c[0], p.pos[2] - c[1]) < 1.6));
})();

// facing helpers: rotY that turns local +Z toward (dx, dz) / toward the crater's middle / away from it
const face = (dx, dz) => +Math.atan2(dx, dz).toFixed(3);
const inward = (x, z) => face(-x, -z), outward = (x, z) => face(x, z);
const at = (th, r) => polar(th, r).map((v) => +v.toFixed(2));
// (onGround takes the drawing's coordinates, before the stretch: beyond the cut they move out with the base, stretch.js)
const onGround = (type, x, z, o = {}) => ({ type, pos: [x, groundY(x, sz(z)), sz(z)], ...o });
const onSlice = (type, x, z, o = {}) => ({ type, pos: [x, groundY(x, z), z], ...o });   // (the slice: already in place)
const [mX, mZ] = MEMO.c;

// the reserve line's dressing (Alpha's half; already in place — the tower's runs kept clear: z −30.5 and −43 across,
// x −26.5 and 6.5 along, 2.5 m wide)
const [crX, crZ] = MOUND.memorial;
// the Long Stages stretch also took the whole stage's cover over 90 % (it was 79 %): gorse on the old downs where the
// open ground ran longest, big chalk boulders on the Great Crater's slopes either side of each cut, one at the cut
const COVER_MID = [
  { type: 'craters_gorse', pos: [-2.3, 0, -19.4], s: 0.95, seed: 7 },
  { type: 'craters_gorse', pos: [-9.8, 0, -16.6], s: 0.95, seed: 8 },
  { type: 'craters_gorse', pos: [12.0, 0, -15.8], s: 0.95, seed: 9 },
  { type: 'craters_gorse', pos: [27.6, 0, -24.2], s: 1.2, seed: 10 },
  { type: 'craters_gorse', pos: [-9.8, 0, -28.1], s: 0.95, seed: 11 },
  // (on the slopes: sunk into the slope so the downhill side doesn't float; clear of the relics, the cuts and the tower)
  ...[[200, 8.8, 1.3], [222, 10.0, 1.15], [246, 8.6, 1.2], [294, 8.6, 1.2], [336, 9.8, 1.2]].map(([th, r, sc], i) => ({ type: 'craters_boulder', pos: [+polar(th, r)[0].toFixed(2), +(coneY(r, th) - 0.28).toFixed(2), +polar(th, r)[1].toFixed(2)], s: sc, flat: 0.9, seed: 11 + i, rotY: i * 2.1 })),
];
const SLICE_DRESSING = [
  ...COVER_MID,
  // the regimental mound: the cenotaph, wreaths at its foot, a bench and a lantern below the south steps
  { type: 'craters_cenotaph', pos: [crX, MOUND.top, crZ], rotY: 0 },
  ...MOUND_PIERS.map(([x, z, sg]) => ({ type: 'craters_pier', pos: [x, MOUND.top, z], rotY: sg > 0 ? 0 : Math.PI })),
  { type: 'craters_wreath', pos: [crX - 1.2, MOUND.top, crZ + 1.05], rotY: 0.12 },
  { type: 'craters_wreath', pos: [crX + 1.15, MOUND.top, crZ + 1.05], rotY: -0.1, variant: 1, r: 0.26 },
  { type: 'craters_poppies', pos: [crX, MOUND.top, crZ - 1.2], r: 0.7, n: 9, seed: 61 },
  { type: 'craters_bench', pos: [-8.2, 0, -50.2], rotY: 0.6 },
  onSlice('craters_lantern', 1.9, -49.8), onSlice('craters_lantern', 1.8, -33.2), onSlice('craters_lantern', -8.4, -47.9),
  // the support trench's bay (the tower's): revetment frames on its walls, the floor left clear; the zig-zag's furniture
  ...[[T8.z0, T5.pts[0][1] - T5.w / 2], [T5.pts[0][1] + T5.w / 2, T8.z1]].map(([a, b]) => ({ type: 'craters_revetment', pos: [T8.x1, -1.0, a], rotY: -Math.PI / 2, length: +(b - a).toFixed(3) })),
  { type: 'craters_revetment', pos: [T8.x0, -1.0, T8.z1], rotY: Math.PI / 2, length: +(T8.z1 - T8.z0).toFixed(3) },
  { type: 'craters_sign', variant: 2, pos: [-22.6, 0, -39.0], rotY: Math.PI, text: 'SUPPORT TRENCH' },
  { type: 'craters_trenchkit', variant: 3, pos: [-19.6, -1.0, T5.pts[0][1] + T5.w / 2 - 0.05], rotY: Math.PI },
  { type: 'craters_trenchkit', variant: 2, pos: [-12.6, -1.0, T5.pts[3][1] - T5.w / 2 + 0.05], rotY: 0 },
  { type: 'craters_trenchkit', variant: 0, pos: [-21.2, -1.0, T5.pts[0][1] - T5.w / 2 + 0.05], rotY: 0, h: 1.0 },
  // the left support trench, the communication trench: furniture, a board by the path
  { type: 'craters_trenchkit', variant: 1, pos: [16.9, -1.0, T6.pts[3][1] + T6.w / 2 - 0.05], rotY: Math.PI },
  { type: 'craters_trenchkit', variant: 4, pos: [25.8, -1.0, T6.pts[4][1] - T6.w / 2 + 0.2], rotY: 0.1 },
  { type: 'craters_trenchkit', variant: 0, pos: [12.2, -1.0, T6.pts[1][1] + T6.w / 2 - 0.05], rotY: Math.PI, h: 1.0 },
  { type: 'craters_trenchkit', variant: 2, pos: [T7.pts[1][0] + T7.w / 2 - 0.05, -1.0, -42.6], rotY: -Math.PI / 2 },
  { type: 'craters_trenchkit', variant: 3, pos: [T7.pts[1][0] - T7.w / 2 + 0.05, -1.0, -43.6], rotY: Math.PI / 2 },
  { type: 'craters_sign', variant: 2, pos: [T7.pts[3][0] + 2.2, 0, -50.9], rotY: -0.4, text: 'TO THE LINE' },
  ...SLICE_BRIDGES.map((b) => ({ type: 'craters_bridge', pos: [b.x, 0.7, b.z], rotY: 0, span: +(2 * b.half).toFixed(3) })),
  ...SLICE_BOARDS.map((b) => ({ type: 'craters_board', pos: [b.x, 0, b.z], rotY: +(b.deg * Math.PI / 180).toFixed(4) })),
  { type: 'craters_wire', pos: [11.6, 0, -32.3], rotY: 0, length: 4.4 },
  // the observation post
  { type: 'craters_pillbox', pos: [(OP.x0 + OP.x1) / 2, 0, (OP.z0 + OP.z1) / 2], rotY: 0, w: OP.x1 - OP.x0, d: OP.z1 - OP.z0, label: 'OBSERVATION', no: 'POST 3' },
  { type: 'craters_trenchkit', variant: 4, pos: [OP.x1 + 0.7, 0, -46.9], rotY: 2.2 },
  // the shell holes: reeds and lilies in the water, poppies on the rims
  ...PONDS.flatMap((pd, j) => [
    ...[[40, 1.3], [150, 1.2], [260, 1.35]].map(([th, sc]) => ({ type: 'craters_reeds', pos: [+(pd.c[0] + Math.cos(ang(th + j * 30)) * (pd.r - 0.25)).toFixed(2), -1.62, +(pd.c[1] + Math.sin(ang(th + j * 30)) * (pd.r - 0.25)).toFixed(2)], s: sc, n: 18 })),
    ...[95, 210, 330].map((th, i) => onSlice('craters_poppies', +(pd.c[0] + Math.cos(ang(th + j * 20)) * (pd.rim - 0.35)).toFixed(2), +(pd.c[1] + Math.sin(ang(th + j * 20)) * (pd.rim - 0.35)).toFixed(2), { r: 0.35, n: 7, seed: 70 + i + j * 5 })),
    { type: 'craters_lilies', pos: [pd.c[0] + 0.5, -1.545, pd.c[1] - 0.4], n: 6, r: 0.9, seed: 5 + j },
  ]),
  // the downs round it all: gorse, a hawthorn, wildflowers, tussocks, chalk boulders
  // (gorse ≥ 0.95 tall is cover; by the cliffs 1.2, over the chalk lip too)
  { type: 'craters_gorse', pos: [-30.2, 0, -31.5], s: 1.15, seed: 4 },
  { type: 'craters_gorse', pos: [29.3, 0, -32.6], s: 1.15, seed: 5 },
  { type: 'craters_gorse', pos: [-14.2, 0, -50.6], s: 1.1, seed: 6 },
  { type: 'craters_gorse', pos: [21.2, 0, -32.4], s: 1.0, seed: 12 },
  { type: 'craters_hawthorn', pos: [-20.5, 0, -33.4], rotY: 0.5, s: 0.95 },
  { type: 'craters_gorse', pos: [-29.2, 0, -42.2], s: 1.0, seed: 13 },
  { type: 'craters_gorse', pos: [9.8, 0, -50.8], s: 0.9, seed: 3 },
  { type: 'craters_hawthorn', pos: [-24.8, 0, -47.8], rotY: 1.1, s: 0.9 },
  { type: 'craters_boulder', pos: [29.0, 0, -40.5], s: 1.35, flat: 0.9, seed: 2 },
  { type: 'craters_boulder', pos: [-9.6, 0, -39.0], s: 0.75, seed: 4 },
  ...[[-17.5, -43.0], [-6.5, -36.0], [12.5, -41.5], [4.0, -39.5], [-22.5, -35.0], [27.5, -45.5], [-12.0, -49.5], [21.8, -32.5]].map(([x, z], i) => onSlice('craters_poppies', x, z, { r: 0.8 + rnd(i * 5) * 0.4, n: 8 + (i % 4), seed: i + 80 })),
  ...[[-20.5, -45.8], [-1.0, -35.5], [10.8, -48.8], [28.3, -36.5], [-29.6, -29.4], [18.6, -33.6], [-13.0, -37.5], [6.2, -39.2]].map(([x, z], i) => onSlice('craters_tussock', x, z, { s: 0.55 + rnd(i * 9) * 0.4, seed: i + 11 })),
];

export const PLACEMENTS = [
  // ================= the visitor pavilion (spawn) on its headland, the neck in front of it
  { type: 'craters_pavilion', pos: [0, 0, PAV.z0], rotY: 0 },
  ...[-1, 1].map((sg) => ({ type: 'craters_fence', pos: [sg * (PAV.head - 0.4), 0.25, PAV.z0 + 0.7], rotY: -Math.PI / 2, length: 6.4 })),
  { type: 'craters_sign', variant: 1, pos: [2.3, 0, -28.4], rotY: 0, arms: [['GREAT CRATER', 90], ['MEMORIAL', 160], ['VISITOR CENTRE', -90]] },
  { type: 'craters_icecream', pos: [5.2, 0, sz(-33.2)], rotY: -Math.PI / 2 },
  { type: 'craters_bin', pos: [2.4, 0, sz(-31.8)] },
  onGround('craters_lifebuoy', -6.6, -33.6, { rotY: Math.PI / 2 }),
  { type: 'craters_picnic', pos: [7.2, 0, -26.2], rotY: -0.5 },
  { type: 'craters_gorse', pos: [9.6, 0, -27.9], s: 0.85, seed: 2 },

  // ================= the memorial (right flank, between the fire trench and the ring; its steps face north)
  { type: 'craters_obelisk', pos: [mX, 2.4, mZ], rotY: 0 },
  { type: 'craters_wreath', pos: [mX - 2.0, 0, mZ + 2.95], rotY: 0.15 },
  { type: 'craters_wreath', pos: [mX + 2.05, 0, mZ + 2.95], rotY: -0.1 },
  { type: 'craters_wreath', pos: [mX + 0.1, 2.4, mZ + 0.95], rotY: 0, variant: 1, r: 0.24 },
  { type: 'craters_lantern', pos: [mX - 1.3, 0, mZ + 5.1] },
  { type: 'craters_lantern', pos: [mX + 1.3, 0, mZ + 5.1] },
  { type: 'craters_poppies', pos: [-19.9, 0, -17.2], r: 0.9, n: 10, seed: 41 },

  // ================= the pillbox on the headland at the right front (it faces the ring over the tower's track)
  { type: 'craters_pillbox', pos: [(PILLBOX.x0 + PILLBOX.x1) / 2, 0, (PILLBOX.z0 + PILLBOX.z1) / 2], rotY: 0, w: PILLBOX.x1 - PILLBOX.x0, d: PILLBOX.z1 - PILLBOX.z0 },
  { type: 'craters_trenchkit', variant: 4, pos: [PILLBOX.x0 - 0.6, 0, -25.5], rotY: 1.2 },
  { type: 'craters_boulder', pos: [-8.0, 0, -27.4], s: 0.7, flat: 0.8, seed: 6 },
  onGround('craters_sign', ...at(232, 34.4), { variant: 0, rotY: inward(...at(232, 34.4)) }),
  { type: 'craters_hawthorn', pos: [-24.6, 0, -22.6], rotY: 2.6, s: 0.95 },
  { type: 'craters_deckchair', pos: [29.2, 0, -3.0], rotY: outward(29.2, -3.0), variant: 0 },
  { type: 'craters_deckchair', pos: [29.4, 0, -4.6], rotY: outward(29.4, -4.6) + 0.3, variant: 2 },

  // ================= the Great Crater: the relics, rubble, poppies in the slopes
  { type: 'craters_cannon', pos: [...polar(315, 7.6).slice(0, 1), 0.9, polar(315, 7.6)[1]], rotY: Math.atan2(Math.cos(ang(315)), Math.sin(ang(315))) },
  { type: 'craters_shell', pos: [polar(225, 7.6)[0], coneY(7.6, 225) - 0.05, polar(225, 7.6)[1]], rotY: -ang(135) },
  { type: 'craters_boulder', pos: [-3.8, -1.3, -2.0], s: 0.7, seed: 1 },
  { type: 'craters_boulder', pos: [1.5, -1.3, -3.6], s: 0.6, flat: 0.65, seed: 3 },
  ...[[255, 7.4], [200, 8.3], [345, 6.9], [282, 8.9], [238, 9.3], [300, 9.6], [192, 6.4], [330, 9.4]].map(([th, r], i) => ({ type: 'craters_poppies', pos: [+polar(th, r)[0].toFixed(2), +(coneY(r, th) - 0.02).toFixed(2), +polar(th, r)[1].toFixed(2)], r: 0.6 + rnd(i) * 0.4, n: 8 + (i % 4), seed: i + 1 })),
  ...[190, 205, 220, 245, 300, 320, 340, 355].map((th, i) => ({ type: 'craters_tussock', pos: [+polar(th, 11.7)[0].toFixed(2), 1.7, +polar(th, 11.7)[1].toFixed(2)], s: 0.5 + rnd(i * 5) * 0.3, seed: i })),
  // war rubble in the crater and round its crest
  ...[[240, 6.2], [300, 5.9], [205, 9.0], [330, 8.6], [262, 13.1], [190, 13.4], [350, 13.3]].map(([th, r], i) => ({ type: 'craters_rubble', pos: [+polar(th, r)[0].toFixed(2), +(coneY(r, th) - 0.03).toFixed(2), +polar(th, r)[1].toFixed(2)], rotY: i * 1.3, seed: i + 1 })),
  { type: 'craters_lectern', pos: [...at(250, 13.0).slice(0, 1), 0, at(250, 13.0)[1]], rotY: inward(...at(250, 13.0)) },
  onGround('craters_sign', ...at(222, 12.9), { variant: 3, rotY: outward(...at(222, 12.9)), text: 'KEEP OFF' }),

  // ================= the fire trench's bay (T1, right flank): revetment frames on both walls (the bay stays clear for
  // the tower), a trench board, a sandbag pile on the cliff side
  ...[[T1.z0, -8], [-6, T1.z1]].map(([a, b]) => ({ type: 'craters_revetment', pos: [T1.x1, -1.0, a], rotY: -Math.PI / 2, length: b - a })),
  ...[[T3.z + T3.w / 2 + T3.wall, T1.z1]].map(([a, b]) => ({ type: 'craters_revetment', pos: [T1.x0, -1.0, b], rotY: Math.PI / 2, length: b - a })),
  { type: 'craters_sign', variant: 2, pos: [-19.2, 0, -5.3], rotY: -Math.PI / 2, text: 'TRENCH LINE B' },
  { type: 'craters_trenchkit', variant: 4, pos: [-28.3, 0, -4.9], rotY: 1.9 },
  { type: 'craters_trenchkit', variant: 3, pos: [-28.6, -1.0, T3.z + T3.w / 2 - 0.05], rotY: Math.PI },

  // ================= the zig-zag trench (T2): bridges, trench furniture along its bays
  ...BRIDGES.map((b) => ({ type: 'craters_bridge', pos: [b.x, 0.7, b.z], rotY: 0, span: +(2 * b.half).toFixed(3) })),
  { type: 'craters_trenchkit', variant: 0, pos: [2.0, -1.0, T2.pts[0][1] - T2.w / 2 + 0.05], rotY: 0, h: 1.0 },
  { type: 'craters_trenchkit', variant: 1, pos: [-0.2, -1.0, T2.pts[0][1] - T2.w / 2 + 0.05], rotY: 0 },
  { type: 'craters_trenchkit', variant: 3, pos: [13.0, -1.0, T2.pts[2][1] + T2.w / 2 - 0.05], rotY: Math.PI },
  { type: 'craters_trenchkit', variant: 2, pos: [T2.pts[4][0] - T2.w / 2 + 0.05, -1.0, -14.4], rotY: Math.PI / 2 },
  { type: 'craters_trenchkit', variant: 0, pos: [T2.pts[4][0] - T2.w / 2 + 0.05, -1.0, -12.6], rotY: Math.PI / 2, h: 1.0 },
  { type: 'craters_trenchkit', variant: 3, pos: [24.2, -1.0, T4.z + T4.w / 2 - 0.05], rotY: Math.PI },
  { type: 'craters_trenchkit', variant: 4, pos: [5.2, 0, -24.8], rotY: 0.3 },

  // ================= the ring: lanterns at the stations, benches, boards, the downs inside and out
  ...[at(210, 15.0), at(240, 18.7), [1.6, -25.9], at(300, 15.0), at(345, 18.6), [-2.4, -31.6]].map(([x, z]) => onGround('craters_lantern', x, z)),
  { type: 'craters_bench', pos: [at(306, 14.6)[0], 0, at(306, 14.6)[1]], rotY: inward(...at(306, 14.6)) },
  ...BOARDS.map((b) => ({ type: 'craters_board', pos: [b.x, 0, b.z], rotY: +(b.deg * Math.PI / 180).toFixed(4) })),
  { type: 'craters_bin', pos: [at(290, 18.9)[0], 0, at(290, 18.9)[1]] },
  { type: 'craters_boulder', pos: [-13.2, 0, -3.0], s: 0.8, seed: 5 },
  { type: 'craters_boulder', pos: [13.6, 0, -2.7], s: 0.9, seed: 4 },
  { type: 'craters_gorse', pos: [19.4, 0, -21.4], s: 1.0, seed: 1 },
  { type: 'craters_hawthorn', pos: [20.9, 0, -23.3], rotY: -0.6, s: 1.0 },
  { type: 'craters_lifebuoy', pos: [...at(306, 29.6).slice(0, 1), 0, at(306, 29.6)[1]], rotY: outward(...at(306, 29.6)) },

  // ================= the flooded crater: reeds, poppies, lilies, a cliff warning on the lip beyond it
  ...[[30, 2.95, 1.25], [80, 2.9, 1.4], [150, 2.95, 1.2], [205, 2.9, 1.35], [262, 2.95, 1.3], [320, 2.9, 1.45]].map(([th, r, sc], i) => ({ type: 'craters_reeds', pos: [+(POND.c[0] + Math.cos(ang(th)) * r).toFixed(2), -1.62, +(POND.c[1] + Math.sin(ang(th)) * r).toFixed(2)], s: sc, n: 20 })),
  ...[[55, 3.5], [115, 3.5], [180, 3.55], [235, 3.5], [290, 3.5], [350, 3.55]].map(([th, r], i) => ({ type: i % 2 ? 'craters_reeds' : 'craters_poppies', pos: [+(POND.c[0] + Math.cos(ang(th)) * r).toFixed(2), i % 2 ? 0.3 : 0.2, +(POND.c[1] + Math.sin(ang(th)) * r).toFixed(2)], s: 0.7, n: i % 2 ? 14 : 7, r: 0.35, seed: i + 3 })),
  { type: 'craters_lilies', pos: [POND.c[0] + 0.8, -1.545, POND.c[1] - 0.6], n: 8, r: 1.2, seed: 1 },
  { type: 'craters_lilies', pos: [POND.c[0] - 1.3, -1.545, POND.c[1] + 0.9], n: 5, r: 0.8, seed: 2 },
  onGround('craters_sign', ...at(343, 30.2), { variant: 0, rotY: inward(...at(343, 30.2)) }),

  // ================= wildflowers + tussocks across the downs
  ...[[9.6, -9.0], [-8.4, -5.9], [4.2, -17.3], [16.0, -21.6], [-4.9, -26.6], [-13.6, -9.4], [-19.6, -23.2], [22.8, -9.8], [-27.6, -2.6], [11.2, -26.2], [-7.9, -25.2], [27.3, -3.5]].map(([x, z], i) => onGround('craters_poppies', x, z, { r: 0.8 + rnd(i * 3) * 0.5, n: 9 + (i % 5), seed: i + 20 })),
  ...[[6.4, -9.9], [-10.4, -8.2], [12.2, -22.9], [-3.8, -33.8], [20.6, -11.0], [-18.9, -21.9], [6.6, -29.2], [-7.2, -25.3], [-28.4, -10.6], [25.8, -12.2]].map(([x, z], i) => onGround('craters_tussock', x, z, { s: 0.55 + rnd(i * 7) * 0.4, seed: i + 3 })),

  // ================= the reserve line (the Long Stages slice, slice.js)
  ...SLICE_DRESSING,

  // ================= the coast: tussocks along the chalk lip, fallen chalk on the undercliff
  ...LIP_TUFTS,
  ...SHELF_ROCKS,
];
void [T1, T2, BRIDGES, POND, CRATER, COAST, STATIONS];
