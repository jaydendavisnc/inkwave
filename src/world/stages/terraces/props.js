// Terrace Heights — stage prop pack + placements (owner: the terraces stage; see layout.js for the folder contract).
//
// register(D, H): add this stage's own prop builders to the PropKit definition table D (same contract as
// props-marina-dock.js / props-marina-vessels.js: H carries THREE + the kit helpers; types must be prefixed 'terraces_' so
// stages never collide). PLACEMENTS: this stage's set dressing (half list: every entry is mirrored (x,z) → (-x,-z)
// with rotY + π unless it says `mirror: false`). Solid props hand the level collision boxes (paintable, nav, physics).
//
// Conventions (as props.js): metres, Y up, `pos` = base point, rotY turns local +Z (the "front"). Wall-mounted pieces
// treat local z = 0 as the wall face and project toward +Z. Building dressings take pos = [block centre x, 0, block
// centre z] with world heights in their specs (y = 0 is the piazza) and dress the level block they belong to: face
// sides 0 = +Z, 1 = +X, 2 = −Z, 3 = −X; on a face, x runs to the viewer's right (seen from outside).
import { LAYOUT, TERRAIN } from './layout.js';

const P = Math.PI;

export function register(D, H) {
  const { THREE, col, shade, mixc, extrudeGeo, puffGeo, blobGeo, PI, TAU, HP, P3 } = H;
  const NS = (m) => (H.noShadow ? H.noShadow(m) : m);

  // ------------------------------------------------------------------------------------------ palette
  // limewash whites, Mediterranean shutter blues/greens, fired terracotta, majolica accents — all kept below ink saturation
  const K = {
    white: '#f4f0e7', whiteSh: '#e6dfd0', lime: '#ece3cf', ochre: '#e7cf9f', pink: '#eecbbd', sky: '#dde7e8',
    stone: '#ddd3c0', stoneDk: '#b8ad98', stoneLt: '#e9e2d3', tufa: '#cdb893',
    blue: '#41709c', blueDk: '#2e5378', green: '#4f7e62', greenDk: '#39604a', teal: '#3f8588',
    wood: '#8a5d3b', woodDk: '#5c3d26', woodLt: '#b68b61', chestnut: '#7a5a3e',
    iron: '#2d3035', ironLt: '#4a5057',
    terra: '#bb6a4c', terraDk: '#9b5139', terraLt: '#d08c6a', coppi: '#b76c4d', coppiDk: '#a05a3f',
    glass: '#2c3a45', glassLt: '#4a5e6e', dark: '#2b2724', cloth: '#f2ead8',
    majBlue: '#2f5f9a', majYel: '#e2b23c', majGreen: '#4b9168', majWhite: '#f2ede1',
    lamp: '#ffd9a0', gold: '#c9a24e', brass: '#b8924a',
    leaf: '#4f7b38', leafDk: '#3a6230', leafLt: '#78a24c', olive: '#8e9c6c', oliveDk: '#6c7b53', vine: '#5d8a3a',
    lemon: '#f0d139', bougain: '#c64590', bougainLt: '#dc6aaa', geranium: '#d8473f', lavender: '#9280c6', white2: '#f7f3ea',
    red: '#b8453b', cream: '#efe4c8', rope: '#d8c79f', soil: '#5a4535', bark: '#6f5a46', barkDk: '#54443a',
  };

  // ------------------------------------------------------------------------------------------ geometry helpers
  class GB {
    constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.idx = []; }
    v(x, y, z, nx, ny, nz, r = 1, g = r, b = r) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(0, 0); this.c.push(r, g, b); return this.p.length / 3 - 1; }
    tri(a, b, c) {
      const P3a = this.p, N = this.n;
      const ax = P3a[a * 3], ay = P3a[a * 3 + 1], az = P3a[a * 3 + 2];
      const e1x = P3a[b * 3] - ax, e1y = P3a[b * 3 + 1] - ay, e1z = P3a[b * 3 + 2] - az;
      const e2x = P3a[c * 3] - ax, e2y = P3a[c * 3 + 1] - ay, e2z = P3a[c * 3 + 2] - az;
      const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
      if (cx * cx + cy * cy + cz * cz < 1e-18) return;
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
  const TPL = new Map();
  const tpl = (key, fn) => { let g = TPL.get(key); if (!g) { g = fn(); TPL.set(key, g); } return g; };
  const kf = (a) => (typeof a === 'number' ? a.toFixed(4) : String(a));
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const pboxGeo = () => tpl('pbox', () => new THREE.BoxGeometry(1, 1, 1));
  const pbox = (B, mat, c, w, h, d, x, y, z, o = {}) => B.add(mat, pboxGeo(), c, x, y, z, { ...o, sx: w, sy: h, sz: d });
  const puff = (det, seed) => tpl('pf|' + det + '|' + seed, () => puffGeo(det, seed));
  const blob = (r, det, seed) => tpl(['bl', r, det, seed].map(kf).join('|'), () => blobGeo(r, det, seed));
  const cylGeo = (rt, rb, h, seg, open = false, t0 = 0, tl = TAU) => tpl(['cy', rt, rb, h, seg, open ? 1 : 0, t0, tl].map(kf).join('|'), () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, t0, tl));
  // collision box (centre x/z, base y); roof = an off-limits top nobody can stand on (never inked, you slide off)
  const colBox = (B, x, y, z, w, h, d, roof = false) => B.col(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, roof ? ROOF : undefined);
  const ROOF = { roof: true };
  // railings, balustrades, handrails: kids can't pass, shots / ink / squids / sight lines go through, nobody stands on top
  const RAIL = { rail: true };
  const det = (B) => (B.k.qf >= 1 ? 2 : 1);
  // compose another type inside this one (its colliders re-mapped from its own frame into ours)
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
      B.cols[i] = b[6] ? [x0, b[1] + y, z0, x1, b[4] + y, z1, b[6]] : [x0, b[1] + y, z0, x1, b[4] + y, z1];   // keep the roof / rail flags
    }
  }
  // run fn in the frame of one face of a W x Dd block centred on the prop origin (x along the face, z out of it)
  function onFace(B, W, Dd, side, fn) {
    const ry = [0, HP, PI, -HP][side], off = side % 2 === 0 ? Dd / 2 : W / 2;
    B.push(Math.sin(ry) * off, 0, Math.cos(ry) * off, ry); fn(side % 2 === 0 ? W : Dd); B.pop();
  }
  // collider of a strip along one face edge, in the prop frame (from the face's local x0..x1, depth into the block)
  function faceCol(W, Dd, side, x0, x1, y0, y1, dz0, dz1) {
    const ry = [0, HP, PI, -HP][side], off = side % 2 === 0 ? Dd / 2 : W / 2, c = Math.cos(ry), s = Math.sin(ry);
    const pts = [[x0, dz0], [x1, dz0], [x1, dz1], [x0, dz1]].map(([lx, lz]) => [Math.sin(ry) * off + lx * c + lz * s, Math.cos(ry) * off - lx * s + lz * c]);
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    return [Math.min(...xs), y0, Math.min(...zs), Math.max(...xs), y1, Math.max(...zs)];
  }

  // ------------------------------------------------------------------------------------------ stroke font
  // rounded bold sans for channel letters and painted lettering (cap height 1): centre-line strokes, round caps
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
    'È': [0.5, [[0.5, 1], [0, 1], [0, 0], [0.5, 0]], [[0, 0.52], [0.42, 0.52]], [[0.12, 1.32], [0.3, 1.16]]],
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
    "'": [0, [[0, 1], [0, 0.8]]],
    '→': [0.7, [[0, 0.5], [0.7, 0.5]], [[0.42, 0.8], [0.7, 0.5], [0.42, 0.2]]],
    '←': [0.7, [[0.7, 0.5], [0, 0.5]], [[0.28, 0.8], [0, 0.5], [0.28, 0.2]]],
    '↑': [0.6, [[0.3, 0], [0.3, 1]], [[0, 0.7], [0.3, 1], [0.6, 0.7]]],
    '↓': [0.6, [[0.3, 1], [0.3, 0]], [[0, 0.3], [0.3, 0], [0.6, 0.3]]],
  };
  const DOTS = { '·': [[0, 0.46]], '.': [[0, 0]] };
  const SPACE = 0.34;
  function ribbon(g, pts, closed, hw, d) {
    const n = pts.length;
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
    const walls = d > 1e-5;
    const rings = pts.map((p, i) => {
      const [nx, ny, k] = N[i];
      const L = [p[0] + nx * k * hw, p[1] + ny * k * hw], Rr = [p[0] - nx * k * hw, p[1] - ny * k * hw];
      const r = [g.v(L[0], L[1], d, 0, 0, 1), g.v(Rr[0], Rr[1], d, 0, 0, 1)];
      if (walls) r.push(g.v(L[0], L[1], d, nx, ny, 0), g.v(L[0], L[1], 0, nx, ny, 0), g.v(Rr[0], Rr[1], d, -nx, -ny, 0), g.v(Rr[0], Rr[1], 0, -nx, -ny, 0));
      return r;
    });
    const segs = closed ? n : n - 1, np = rings[0].length;
    for (let i = 0; i < segs; i++) { const A = rings[i], Bq = rings[(i + 1) % n]; for (let j = 0; j < np; j += 2) g.quad(A[j], A[j + 1], Bq[j + 1], Bq[j]); }
  }
  function disc(g, cx, cy, r, d, seg, a0 = 0, a1 = TAU) {
    const full = a1 - a0 > TAU - 1e-4, walls = d > 1e-5;
    const c0 = g.v(cx, cy, d, 0, 0, 1), f = [], wt = [], wb = [];
    const n = full ? seg : seg + 1;
    for (let k = 0; k < n; k++) {
      const a = a0 + ((a1 - a0) * k) / seg, cs = Math.cos(a), sn = Math.sin(a);
      f.push(g.v(cx + cs * r, cy + sn * r, d, 0, 0, 1));
      if (walls) { wt.push(g.v(cx + cs * r, cy + sn * r, d, cs, sn, 0)); wb.push(g.v(cx + cs * r, cy + sn * r, 0, cs, sn, 0)); }
    }
    for (let k = 0; k < seg; k++) { const j = full ? (k + 1) % seg : k + 1; g.tri(c0, f[k], f[j]); if (walls) g.quad(wt[k], wb[k], wb[j], wt[j]); }
  }
  function glyph(ch, wt, dep, ds = 8) {
    return tpl(['gl', ch, wt, dep, ds].map(kf).join('|'), () => {
      const s = 1 - wt, hw = wt / 2, T = (p) => [hw + p[0] * s, hw + p[1] * s];
      const g = new GB();
      if (DOTS[ch]) { for (const p of DOTS[ch]) { const q = T(p); disc(g, hw * 1.15, q[1], hw * 1.15, dep, ds); } return { geo: g.geo(), adv: wt * 1.3 }; }
      const def = GL[ch];
      if (!def) return { geo: null, adv: SPACE };
      const [w, ...strokes] = def;
      strokes.forEach((st, si) => {
        const d = dep > 0 ? dep - si * 0.004 : si * 0.0004;
        const closed = !Array.isArray(st);
        let pts = (closed ? st.c : st).map(T);
        pts = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-4);
        if (closed) { ribbon(g, pts, true, hw, d); return; }
        let cur = [pts[0]];
        const joints = [];
        for (let i = 1; i < pts.length; i++) {
          cur.push(pts[i]);
          if (i < pts.length - 1) {
            const a = pts[i - 1], p = pts[i], c = pts[i + 1];
            const t1 = Math.atan2(p[1] - a[1], p[0] - a[0]), t2 = Math.atan2(c[1] - p[1], c[0] - p[0]);
            let dt = Math.abs(t2 - t1); if (dt > PI) dt = TAU - dt;
            if (dt > 0.6) { ribbon(g, cur, false, hw, d); cur = [pts[i]]; joints.push(pts[i]); }
          }
        }
        if (cur.length > 1) ribbon(g, cur, false, hw, d);
        const endCap = (p, q) => { const a = Math.atan2(p[1] - q[1], p[0] - q[0]); disc(g, p[0], p[1], hw, d, Math.max(3, Math.round(ds / 2)), a - HP, a + HP); };
        endCap(pts[0], pts[1]); endCap(pts[pts.length - 1], pts[pts.length - 2]);
        for (const p of joints) disc(g, p[0], p[1], hw, d, ds);
      });
      return { geo: g.geo(), adv: w * s + wt };
    });
  }
  const textW = (str, wt = 0.17, track = 0.12) => { let w = 0; const cs = [...str]; cs.forEach((ch, i) => { w += ch === ' ' ? SPACE : glyph(ch, wt, 0.1).adv; if (i < cs.length - 1) w += track; }); return w; };
  // a line of letters facing +Z in the current frame (raised channel letters, or flat paint with flat: true); returns width
  function letters(B, str, o = {}) {
    const h = o.h ?? 0.3, wt = o.wt ?? 0.17, flat = !!o.flat, dep = flat ? 0 : o.dep ?? 0.1, track = o.track ?? 0.12;
    const W = textW(str, wt, track) * h;
    let x = o.align === 'left' ? 0 : o.align === 'right' ? -W : -W / 2;
    const cs = [...str];
    cs.forEach((ch, i) => {
      if (ch === ' ') { x += (SPACE + track) * h; return; }
      const gi = glyph(ch, wt, dep, flat || h < 0.15 ? 6 : 8);
      const m = o.mat ?? (flat ? 'paint' : 'gloss');
      if (gi.geo) B.add(flat || h < 0.25 ? NS(m) : m, gi.geo, o.c ?? K.iron, (o.x ?? 0) + x, o.y ?? 0, o.z ?? 0, { s: h, sz: flat ? 1 : h, glow: o.glow, ao: false });
      if (gi.geo && o.lit) { const fg = glyph(ch, wt, 0, 6); B.add(NS('glow'), fg.geo, o.litC ?? K.lamp, (o.x ?? 0) + x, o.y ?? 0, (o.z ?? 0) + dep * h + 0.004, { s: h, sz: 1, glow: o.lit, ao: false }); }
      x += (gi.adv + (i < cs.length - 1 ? track : 0)) * h;
    });
    return W;
  }

  // ------------------------------------------------------------------------------------------ plants
  // puff cluster: n puffs of radius ~R scattered in an ellipsoid (rx, ry, rz) around (x, y, z); tints lerp dark → light by height
  function cluster(B, x, y, z, rx, ry, rz, n, R, cDk, cLt, seed, mat = 'foliage', o = {}) {
    const dd = (R >= 0.5 ? det(B) : R >= 0.25 ? det(B) - 1 : 0) - (o.low ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const h1 = hash(seed * 13.1 + i * 7.7), h2 = hash(seed * 3.7 + i * 1.3), h3 = hash(seed * 5.9 + i * 2.9);
      const a = i * 2.39996 + h1 * 0.6, t = n > 1 ? i / (n - 1) : 0.5, yy = 1 - 2 * t, r = Math.sqrt(Math.max(0, 1 - yy * yy)) * (0.55 + 0.45 * h2);
      const px = x + Math.cos(a) * r * rx, py = y + yy * ry * 0.75, pz = z + Math.sin(a) * r * rz;
      const s = R * (0.75 + 0.45 * h3);
      B.add(mat, puff(Math.max(0, dd), (seed + i) % 6), mixc(cDk, cLt, Math.max(0, Math.min(1, 0.5 + yy * 0.5)) * 0.8 + h2 * 0.2), px, py, pz, { s, sy: s * (o.flat ?? 0.85), ry: h1 * TAU, ao: false });
    }
  }
  // small scattered spheres (fruit / flowers) on the surface of an ellipsoid
  function dots(B, x, y, z, rx, ry, rz, n, r, c, seed, mat = NS('gloss'), yMin = -0.6) {
    for (let i = 0; i < n; i++) {
      const a = hash(seed + i * 3.1) * TAU, yy = yMin + (1 - yMin) * hash(seed * 1.7 + i * 5.3) * 0.9, rr = Math.sqrt(Math.max(0, 1 - yy * yy));
      B.sph(mat, c, r * (0.85 + 0.3 * hash(seed + i)), x + Math.cos(a) * rr * rx, y + yy * ry, z + Math.sin(a) * rr * rz, { ws: 5, hs: 3, ao: false });
    }
  }
  // terracotta pot (lathe): rim, belly, foot; r = rim radius, h = height
  const potProf = (r, h) => [[0, 0], [r * 0.62, 0], [r * 0.66, 0.03], [r * 0.8, h * 0.45], [r * 0.9, h * 0.82], [r * 0.9, h * 0.86], [r, h * 0.88], [r, h], [r * 0.9, h], [r * 0.86, h * 0.9], [0, h * 0.9]];
  function pot(B, x, y, z, r, h, c = K.terra) {
    B.lathe('paint', c, potProf(r, h), x, y, z, { seg: r > 0.25 ? 12 : 8 });
    B.cyl(NS('paint'), K.soil, r * 0.84, 0.02, x, y + h * 0.9, z, { seg: 12 });
  }

  // ------------------------------------------------------------------------------------------ building kit
  // (all mount flush on a wall at local z = 0 facing +Z; y = world height of the feature's bottom)
  // louvred shutter leaf (persiana): frame + slats, w x h, hinged at x (opens against the wall toward sx)
  function shutter(B, x, y, w, h, c, open = 1) {
    const ang = open >= 1 ? 0 : (1 - open) * 1.2;
    B.push(x, y, 0.03, 0);
    pbox(B, 'paint', c, w, h, 0.035, 0, h / 2, 0.02, { ry: 0 });
    const n = Math.max(4, Math.round(h / 0.1));
    for (let k = 1; k < n; k++) pbox(B, NS('paint'), shade(c, 0.78), w - 0.07, 0.018, 0.012, 0, (k * h) / n, 0.042);
    pbox(B, NS('paint'), shade(c, 1.1), w - 0.07, 0.03, 0.01, 0, h * 0.45, 0.046);
    B.pop();
    void ang;
  }
  // window: surround band, recessed dark glass with a cross frame, stone sill, shutters, optional grille / flower box / lit blind
  function windowU(B, x, y, w, h, o = {}) {
    const fc = o.frame ?? K.white2, sc = o.shut ?? K.blue, sur = o.surround;
    if (sur) {
      const t = 0.11;
      pbox(B, 'paint', sur, w + t * 2, t, 0.02, x, y + h + t / 2, 0.01);
      for (const sx of [-1, 1]) pbox(B, 'paint', sur, t, h, 0.02, x + sx * (w / 2 + t / 2), y + h / 2, 0.01);
    }
    pbox(B, NS('paint'), o.lit ? '#3b3129' : K.dark, w, h, 0.01, x, y + h / 2, 0.006);
    pbox(B, NS('gloss'), K.glass, w - 0.1, h - 0.1, 0.01, x, y + h / 2, 0.018);
    if (o.lit) pbox(B, NS('glow'), K.lamp, w - 0.16, h * 0.38, 0.004, x, y + h * 0.72, 0.024, { glow: o.lit });
    pbox(B, NS('paint'), fc, w, 0.05, 0.03, x, y + h - 0.025, 0.02);
    pbox(B, NS('paint'), fc, 0.05, h, 0.03, x - w / 2 + 0.025, y + h / 2, 0.02);
    pbox(B, NS('paint'), fc, 0.05, h, 0.03, x + w / 2 - 0.025, y + h / 2, 0.02);
    pbox(B, NS('paint'), fc, 0.04, h - 0.08, 0.025, x, y + h / 2, 0.028);
    pbox(B, NS('paint'), fc, w - 0.08, 0.035, 0.025, x, y + h * 0.62, 0.028);
    B.box('paint', o.sill ?? K.stone, w + 0.16, 0.06, 0.14, x, y - 0.03, 0.07, { r: 0.015 });
    if (o.shutters !== false) {
      const sw = w / 2 + 0.02;
      if (o.half) { shutter(B, x - w / 4 - 0.005, y, sw - 0.02, h, sc); shutter(B, x + w / 2 + sw / 2 + 0.03, y, sw, h, sc); }
      else for (const sx of [-1, 1]) shutter(B, x + sx * (w / 2 + sw / 2 + 0.03), y, sw, h, sc);
    }
    if (o.grille) {
      for (let k = 0; k <= 4; k++) B.cyl(NS('metal'), K.iron, 0.012, h + 0.04, x - w / 2 + 0.06 + (k * (w - 0.12)) / 4, y + h / 2, 0.075, { seg: 5 });
      for (const yy of [0.12, h - 0.12]) pbox(B, NS('metal'), K.iron, w, 0.025, 0.02, x, y + yy, 0.075);
    }
    if (o.box) {
      B.box('paint', K.terra, w + 0.1, 0.16, 0.2, x, y - 0.14, 0.14, { r: 0.02 });
      cluster(B, x, y + 0.04, 0.16, w * 0.42, 0.08, 0.1, 4, 0.13, K.leafDk, K.leaf, Math.round(x * 13 + y * 7), 'foliage', { low: true, flat: 0.7 });
      dots(B, x, y + 0.08, 0.17, w * 0.45, 0.08, 0.1, 9, 0.035, o.flowers ?? K.geranium, Math.round(x * 17 + y * 3), NS('paint'), -0.1);
    }
  }
  // plank door with a stone frame (round-arched when arch), knocker, threshold step
  function doorU(B, x, y, w, h, o = {}) {
    const lc = o.leaf ?? K.green, fc = o.frame ?? K.stone, arch = o.arch !== false;
    const hs = arch ? h - w / 2 : h;       // spring line
    pbox(B, NS('paint'), K.dark, w, hs, 0.01, x, y + hs / 2, 0.006);
    // leaf: vertical boards
    const nb = Math.max(3, Math.round(w / 0.16));
    for (let k = 0; k < nb; k++) pbox(B, 'wood', shade(lc, 0.94 + 0.1 * hash(k + x * 3)), w / nb - 0.012, hs - 0.02, 0.05, x - w / 2 + (k + 0.5) * (w / nb), y + hs / 2, 0.03);
    for (const yy of [0.35, hs - 0.35]) pbox(B, NS('wood'), shade(lc, 0.82), w - 0.06, 0.08, 0.02, x, y + yy, 0.062);
    if (arch) {
      B.add('wood', cylGeo(w / 2 - 0.01, w / 2 - 0.01, 0.05, 14, false, -HP, PI), shade(lc, 0.9), x, y + hs, 0.03, { rx: HP });
      B.tube('paint', fc, Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * PI; return P3(x + Math.cos(a) * (w / 2 + 0.07), y + hs + Math.sin(a) * (w / 2 + 0.07), 0.035); }), 0.075, { radial: 6 });
    } else pbox(B, 'paint', fc, w + 0.28, 0.14, 0.07, x, y + h + 0.07, 0.035);
    for (const sx of [-1, 1]) B.box('paint', fc, 0.14, hs, 0.07, x + sx * (w / 2 + 0.07), y + hs / 2, 0.035, { r: 0.012 });
    B.tor(NS('metal'), K.brass, 0.045, 0.008, x + w * 0.22, y + 1.05, 0.07, { ts: 10, rs: 4 });
    B.sph(NS('metal'), K.brass, 0.018, x - w * 0.3, y + 1.0, 0.065, { ws: 6, hs: 4 });
    if (o.step !== false) B.box('paint', K.stoneLt, w + 0.36, 0.1, 0.34, x, y + 0.05, 0.17, { r: 0.02 });
    if (o.lunette) { pbox(B, NS('gloss'), K.glass, w * 0.6, 0.02, 0.01, x, y + hs + 0.02, 0.06); }
  }
  // round-arched opening (loggia / shop / passage) shown as a dark recess with a stone arch ring
  function archU(B, x, y, w, h, o = {}) {
    const hs = h - w / 2, fc = o.frame ?? K.stone;
    pbox(B, NS('paint'), o.inside ?? K.dark, w, hs, 0.01, x, y + hs / 2, 0.005);
    B.add(NS('paint'), cylGeo(w / 2, w / 2, 0.01, 16, false, -HP, PI), o.inside ?? K.dark, x, y + hs, 0.005, { rx: HP });
    B.tube('paint', fc, Array.from({ length: 15 }, (_, i) => { const a = (i / 14) * PI; return P3(x + Math.cos(a) * (w / 2 + 0.08), y + hs + Math.sin(a) * (w / 2 + 0.08), 0.03); }), 0.085, { radial: 6 });
    for (const sx of [-1, 1]) B.box('paint', fc, 0.16, hs, 0.06, x + sx * (w / 2 + 0.08), y + hs / 2, 0.03, { r: 0.012 });
  }
  // balcony: slab on corbels, wrought-iron railing, French window with shutters behind, pots
  function balconyU(B, x, y, w, o = {}) {
    const dp = o.depth ?? 0.62, rc = o.rail ?? K.iron;
    windowU(B, x, y + 0.08, Math.min(1.0, w - 0.5), 2.0, { shut: o.shut, lit: o.lit });
    B.box('paint', K.stone, w, 0.1, dp, x, y + 0.03, dp / 2, { r: 0.02 });
    for (const sx of [-0.36, 0, 0.36]) B.box(NS('paint'), K.stone, 0.12, 0.2, dp * 0.8, x + sx * w, y - 0.1, dp * 0.4, { r: 0.02 });
    const Hr = 0.95;
    B.tube('metal', rc, [P3(x - w / 2 + 0.05, y + Hr, 0.02), P3(x - w / 2 + 0.05, y + Hr, dp - 0.05), P3(x + w / 2 - 0.05, y + Hr, dp - 0.05), P3(x + w / 2 - 0.05, y + Hr, 0.02)], 0.018, { radial: 5 });
    const nb = Math.round(w / 0.12);
    for (let k = 0; k <= nb; k++) B.cyl(NS('metal'), rc, 0.008, Hr - 0.08, x - w / 2 + 0.05 + (k * (w - 0.1)) / nb, y + 0.08 + (Hr - 0.08) / 2, dp - 0.05, { seg: 4 });
    for (const sx of [-1, 1]) for (let k = 1; k < 5; k++) B.cyl(NS('metal'), rc, 0.008, Hr - 0.08, x + sx * (w / 2 - 0.05), y + 0.08 + (Hr - 0.08) / 2, (k * dp) / 5, { seg: 4 });
    pbox(B, NS('metal'), rc, w - 0.1, 0.02, 0.02, x, y + 0.2, dp - 0.05);
    if (o.pots !== false) {
      for (const [px, pc] of [[-w / 2 + 0.2, K.terra], [w / 2 - 0.22, K.terraLt]]) {
        pot(B, x + px, y + 0.08, dp - 0.2, 0.12, 0.2, pc);
        cluster(B, x + px, y + 0.38, dp - 0.18, 0.14, 0.1, 0.14, 3, 0.1, K.leafDk, K.leaf, Math.round(px * 31 + y), 'foliage', { low: true });
        dots(B, x + px, y + 0.42, dp - 0.18, 0.14, 0.08, 0.14, 6, 0.028, o.flowers ?? K.geranium, Math.round(px * 7 + y * 3), NS('paint'), -0.2);
      }
      // trailing plant over the railing
      if (o.trail) cluster(B, x + o.trail, y + 0.55, dp + 0.02, 0.3, 0.45, 0.08, 6, 0.12, K.leafDk, K.leafLt, Math.round(x * 5 + y), 'foliage', { low: true });
    }
  }
  // wrought-iron wall lantern: scroll bracket + lantern with glowing panes (dusk)
  function lanternU(B, x, y, o = {}) {
    const ic = K.iron;
    B.box('metal', ic, 0.12, 0.2, 0.025, x, y, 0.012, { r: 0.008 });
    B.tube('metal', ic, [P3(x, y + 0.02, 0.02), P3(x, y + 0.1, 0.2), P3(x, y + 0.02, 0.34)], 0.014, { radial: 5 });
    B.tube(NS('metal'), ic, [P3(x, y - 0.08, 0.02), P3(x, y - 0.02, 0.12), P3(x, y + 0.06, 0.2)], 0.008, { radial: 4 });
    const lx = x, ly = y - 0.2, lz = 0.34;
    B.box('glow', K.lamp, 0.13, 0.18, 0.13, lx, ly, lz, { r: 0.01, glow: o.glow ?? 1.6 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pbox(B, NS('metal'), ic, 0.018, 0.2, 0.018, lx + sx * 0.068, ly, lz + sz * 0.068);
    B.lathe('metal', ic, [[0, 0.1], [0.11, 0.1], [0.1, 0.13], [0.03, 0.2], [0, 0.22]], lx, ly, lz, { seg: 4 });
    B.lathe(NS('metal'), ic, [[0, -0.14], [0.07, -0.1], [0.08, -0.09], [0, -0.09]], lx, ly, lz, { seg: 4 });
    B.sph(NS('metal'), ic, 0.018, lx, ly + 0.24, lz, { ws: 5, hs: 4 });
  }
  // majolica plaque (tile panel) with a painted border and flat lettering or a number
  function plaqueU(B, x, y, text, o = {}) {
    const h = o.h ?? 0.1, W = o.w ?? Math.max(0.3, textW(text, 0.2, 0.12) * h + 0.16), Hh = o.hh ?? h + 0.12;
    B.box('gloss', K.majWhite, W, Hh, 0.02, x, y, 0.01, { r: 0.006 });
    pbox(B, NS('gloss'), o.border ?? K.majBlue, W - 0.02, Hh - 0.02, 0.004, x, y, 0.021);
    pbox(B, NS('gloss'), K.majWhite, W - 0.05, Hh - 0.05, 0.004, x, y, 0.023);
    for (const sx of [-1, 1]) B.sph(NS('gloss'), o.accent ?? K.majYel, 0.018, x + sx * (W / 2 - 0.045), y, 0.024, { ws: 6, hs: 4 });
    letters(B, text, { h, x, y: y - h / 2, z: 0.025, c: o.c ?? K.majBlue, flat: true, wt: 0.2, track: 0.12 });
  }
  // downpipe: terracotta pipe from the roof to the ground with a hopper head and brackets
  function pipeU(B, x, y0, y1, c = K.terraDk) {
    B.cyl('paint', c, 0.045, y1 - y0 - 0.2, x, (y0 + y1) / 2 - 0.05, 0.06, { seg: 8 });
    B.box('paint', c, 0.15, 0.14, 0.13, x, y1 - 0.12, 0.065, { r: 0.02 });
    B.cyl(NS('paint'), c, 0.05, 0.16, x, y0 + 0.08, 0.1, { rx: 0.8, seg: 8 });
    for (let yy = y0 + 0.8; yy < y1 - 0.4; yy += 1.1) pbox(B, NS('metal'), K.iron, 0.12, 0.025, 0.08, x, yy, 0.04);
  }
  // bougainvillea mass climbing a wall (w wide, from y0 to y1): leafy base, magenta bracts in clumps, a woody stem
  function bougainU(B, x, y0, y1, w, o = {}) {
    const seed = Math.round(x * 37 + y0 * 11), hgt = y1 - y0, c1 = o.c ?? K.bougain, c2 = o.c2 ?? K.bougainLt;
    B.tube('wood', K.barkDk, [P3(x - 0.1, y0, 0.08), P3(x + 0.05, y0 + hgt * 0.4, 0.12), P3(x - 0.05, y0 + hgt * 0.75, 0.14)], 0.035, { radial: 5 });
    const n = Math.max(4, Math.round(w * hgt * 2.2));
    for (let i = 0; i < n; i++) {
      const t = hash(seed + i * 1.7), u = hash(seed * 0.3 + i * 4.1);
      const px = x + (u - 0.5) * w * (0.5 + 0.5 * t), py = y0 + hgt * (0.25 + 0.75 * t), pz = 0.14 + 0.12 * hash(i + seed);
      const s = 0.2 + 0.14 * hash(seed + i * 9.3);
      const flower = t > 0.25 && hash(seed * 7 + i) > 0.25;
      B.add('foliage', puff(Math.max(0, det(B) - 1), (seed + i) % 6), flower ? mixc(c1, c2, hash(i * 3.3 + seed)) : mixc(K.leafDk, K.leaf, t), px, py, pz, { s, sy: s * 0.8, sz: s * 0.6, ry: u * TAU, ao: false });
    }
  }
  // the roof edge coping of a walkable flat roof: 0.28 m (walk-over) white cap with a drip line, collides
  const COPE_H = 0.18, COPE_W = 0.3;

  // pitched coppi roof over a W (along the ridge) x Dd block at eave height y: gable prism, two corrugated slopes,
  // ridge tiles, eave cornice. Built along local X (ridge along X).
  function coppiSheet(L, S) {
    return tpl(['cop', L, S].map(kf).join('|'), () => {
      const g = new GB(), per = 0.26, nw = Math.max(2, Math.round(L / per)), sp = L / nw, amp = 0.045, ns = 6;
      const xs = []; for (let i = 0; i <= nw * ns; i++) xs.push(-L / 2 + (i / ns) * sp);
      const yAt = (x) => amp * Math.sin(((x + L / 2) / sp) * TAU), dy = (x) => amp * Math.cos(((x + L / 2) / sp) * TAU) * (TAU / sp);
      const top0 = [], top1 = [], f0 = [], f1 = [];
      for (const x of xs) {
        const y = yAt(x), d = dy(x), l = Math.hypot(d, 1), shadeK = 0.9 + 0.12 * (y / amp);
        top0.push(g.v(x, y + amp, -S / 2, -d / l, 1 / l, 0, shadeK)); top1.push(g.v(x, y + amp, S / 2, -d / l, 1 / l, 0, shadeK));
        f0.push(g.v(x, y + amp, S / 2, 0, 0, 1, shadeK * 0.8)); f1.push(g.v(x, -0.02, S / 2, 0, 0, 1, 0.6));
      }
      for (let i = 0; i < xs.length - 1; i++) { g.quad(top0[i], top0[i + 1], top1[i + 1], top1[i]); g.quad(f0[i], f0[i + 1], f1[i + 1], f1[i]); }
      return g.geo();
    });
  }
  function gableRoof(B, cx, cz, W, Dd, yE, rise, o = {}) {
    const alongX = o.alongX ?? W >= Dd, L = alongX ? W : Dd, d = alongX ? Dd : W, ov = o.ov ?? 0.3, rc = o.roof ?? K.coppi, wc = o.wall ?? K.white;
    B.push(cx, 0, cz, alongX ? 0 : HP);
    B.add('paint', tpl(['gpr', d, rise].map(kf).join('|'), () => extrudeGeo([[-d / 2, 0], [d / 2, 0], [0, rise]], 1, 0.001)), wc, 0, yE, 0, { sx: L });
    const pitch = Math.atan2(rise, d / 2), sl = Math.hypot(rise, d / 2) + ov;
    for (const s of [-1, 1]) {
      B.push(0, yE + rise / 2, (s * d) / 4, 0, s * pitch);
      B.push(0, 0.04, s * (ov / 2), s > 0 ? 0 : PI);
      B.add('paint', coppiSheet(L + ov * 2, sl), rc, 0, 0, 0, {});
      B.pop();
      B.pop();
      // double row of eave tiles + white cornice under the eaves
      B.box('paint', wc, L + 0.06, 0.18, 0.2, 0, yE - 0.02, s * (d / 2 - 0.02), { r: 0.03 });
      B.box(NS('paint'), shade(rc, 0.85), L + ov * 2, 0.07, 0.12, 0, yE - 0.02 - ov * Math.tan(pitch) * 0.6, s * (d / 2 + ov * 0.85), { r: 0.02 });
    }
    // ridge: coppi laid along the top
    B.add('paint', cylGeo(0.1, 0.1, L + ov * 2 + 0.05, 8, false, 0, PI), shade(rc, 0.9), 0, yE + rise + 0.03, 0, { rz: HP, rx: HP });
    B.pop();
  }
  // barrel vault (volta a botte) in limewash over a W x Dd block at y, axis along X unless alongX false
  function vaultRoof(B, cx, cz, W, Dd, y, rise, o = {}) {
    const alongX = o.alongX ?? W >= Dd, L = alongX ? W : Dd, d = alongX ? Dd : W, wc = o.wall ?? K.white;
    const prof = []; const n = 14;
    for (let i = 0; i <= n; i++) { const a = PI - (i / n) * PI; prof.push([Math.cos(a) * d / 2, Math.sin(a) * rise]); }
    B.push(cx, 0, cz, alongX ? 0 : HP);
    B.add('paint', tpl(['vault', d, rise].map(kf).join('|'), () => extrudeGeo(prof, 1, 0.001)), wc, 0, y, 0, { sx: L + 0.02 });
    B.box('paint', shade(wc, 0.96), L + 0.12, 0.12, d + 0.12, 0, y - 0.04, 0, { r: 0.04 });
    B.pop();
  }
  // chimney (comignolo): limewashed stack with a tiny tiled roof on four posts
  function chimney(B, x, y, z, c = K.white) {
    B.box('paint', c, 0.5, 0.95, 0.5, x, y + 0.47, z, { r: 0.04 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pbox(B, NS('paint'), c, 0.08, 0.22, 0.08, x + sx * 0.2, y + 1.06, z + sz * 0.2);
    B.push(x, y + 1.17, z);
    for (const s of [-1, 1]) B.box('paint', K.coppi, 0.66, 0.05, 0.4, 0, 0.09, s * 0.16, { rx: s * 0.5, r: 0.015 });
    B.box(NS('paint'), K.coppiDk, 0.7, 0.06, 0.08, 0, 0.2, 0, { r: 0.02 });
    B.pop();
    pbox(B, NS('paint'), K.dark, 0.3, 0.12, 0.3, x, y + 1.02, z);
  }

  // ------------------------------------------------------------------------------------------ building dressing
  // One type dresses any house block. pos = [block centre x, 0, block centre z], w × d block footprint, top = roof
  // height (world y). faces: { side: [items] } with items { t: kind, x, y, w, h, ... } in that face's frame:
  //   win, door, arch, balc, lamp, plaque, pipe, bougain, sign (channel letters), awning, shop, niche, band (string course)
  // roof: 'flat' (low coping on the listed edges: cope: [sides], visual only) · 'gable' · 'vault' · null
  // extras on the roof: chimneys [[x, z]], tank [x, z], antenna [x, z] (roof items on flat roofs only where noted).
  D.terraces_house = {
    desc: 'Terrace Heights house dressing for a level block (pos = block centre at y 0; w, d, top): per-face windows with louvred shutters, arched plank doors, balconies, lanterns, majolica plaques, downpipes, bougainvillea, shop signs, string courses; roof: flat (low visual coping on chosen edges; chimneys + water tank collide with off-limits tops), coppi gable or limewashed barrel vault.',
    params: { w: 'm', d: 'm', top: 'm (roof y)', faces: '{ side: [items] }', roof: "'flat' | 'gable' | 'vault'", cope: 'sides with coping', color: 'wall colour (for roof prisms)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = o.w, Dd = o.d, top = o.top, wc = o.color ?? K.white;
      for (const side of [0, 1, 2, 3]) {
        const items = o.faces && o.faces[side];
        if (!items) continue;
        onFace(B, W, Dd, side, (L) => {
          for (const it of items) {
            const x = it.x ?? 0, y = it.y ?? 0;
            switch (it.t) {
              case 'win': windowU(B, x, y, it.w ?? 0.8, it.h ?? 1.15, it); break;
              case 'door': doorU(B, x, y, it.w ?? 1.0, it.h ?? 2.2, it); break;
              case 'arch': archU(B, x, y, it.w ?? 1.6, it.h ?? 2.6, it); break;
              case 'balc': balconyU(B, x, y, it.w ?? 1.6, it); B.cols.push([...faceCol(W, Dd, side, x - (it.w ?? 1.6) / 2, x + (it.w ?? 1.6) / 2, y + 0.02, y + 1.0, 0, it.depth ?? 0.62), 2]); break;
              case 'lamp': lanternU(B, x, y, it); break;
              case 'plaque': plaqueU(B, x, y, it.text ?? '7', it); break;
              case 'pipe': pipeU(B, x, it.y0 ?? y, it.y1 ?? top, it.c); break;
              case 'bougain': bougainU(B, x, y, it.y1 ?? y + 2.5, it.w ?? 1.8, it); break;
              case 'band': B.box('paint', it.c ?? shade(wc, 0.94), it.w ?? L, it.h ?? 0.14, 0.08, x, y, 0.04, { r: 0.02 }); break;
              case 'sign': {
                if (it.board) B.box('paint', it.board, it.bw ?? textW(it.text, it.wt ?? 0.18, it.track ?? 0.14) * (it.h ?? 0.3) + 0.3, (it.h ?? 0.3) + 0.2, 0.04, x, y + (it.h ?? 0.3) / 2, 0.02, { r: 0.02 });
                letters(B, it.text, { h: it.h ?? 0.3, x, y, z: it.board ? 0.045 : 0.005, c: it.c ?? K.majBlue, wt: it.wt ?? 0.18, track: it.track ?? 0.14, dep: it.dep ?? 0.06, lit: it.lit, litC: it.litC, flat: it.flat });
                break;
              }
              case 'awning': awningU(B, x, y, it.w ?? 2.2, it); break;
              case 'shop': shopU(B, x, y, it.w ?? 2.4, it.h ?? 2.3, it); break;
              case 'niche': nicheU(B, x, y, it); break;
              case 'plates': for (let i = 0; i < (it.n ?? 5); i++) { const px = x + (i - ((it.n ?? 5) - 1) / 2) * 0.36, py = y + (i % 2) * 0.3, r = 0.13 + 0.03 * hash(i + x); B.cyl(NS('gloss'), K.majWhite, r, 0.02, px, py, 0.015, { rx: HP, seg: 14 }); B.tor(NS('gloss'), [K.majBlue, K.majYel, K.majGreen][i % 3], r * 0.8, 0.012, px, py, 0.027, { ts: 14, rs: 3 }); B.sph(NS('gloss'), [K.majYel, K.majBlue, K.lemon][i % 3], r * 0.38, px, py, 0.02, { ws: 8, hs: 4, sz: 0.15 }); } break;
              case 'gnomon': B.box('metal', K.iron, 0.14, 0.14, 0.02, x, y, 0.01, { r: 0.01 }); B.tube('metal', K.iron, [P3(x, y, 0.01), P3(x, y - 0.3, 0.42)], 0.016, { radial: 5 }); B.tube(NS('metal'), K.iron, [P3(x, y - 0.55, 0.01), P3(x, y - 0.3, 0.42)], 0.008, { radial: 4 }); break;
              case 'vent': B.box('paint', K.stoneDk, 0.3, 0.2, 0.03, x, y, 0.015, { r: 0.01 }); for (let k = 0; k < 3; k++) pbox(B, NS('paint'), K.dark, 0.24, 0.02, 0.01, x, y - 0.06 + k * 0.06, 0.032); break;
              default: break;
            }
          }
        });
      }
      // roof
      const roof = o.roof ?? 'flat';
      if (roof === 'flat') {
        for (const side of o.cope ?? []) {
          onFace(B, W, Dd, side, (L) => {
            const x0 = -L / 2, x1 = L / 2;
            B.box('paint', wc, L, COPE_H, COPE_W, 0, top + COPE_H / 2, -COPE_W / 2 + 0.03, { r: 0.05 });
            B.box(NS('paint'), shade(wc, 0.9), L + 0.02, 0.05, 0.05, 0, top - 0.06, 0.02, { r: 0.015 });
            void x0; void x1;
          });
        }
      } else if (roof === 'gable') gableRoof(B, 0, 0, W, Dd, top, o.rise ?? Math.min(W, Dd) * 0.28, { wall: wc, alongX: o.alongX });
      else if (roof === 'vault') vaultRoof(B, 0, 0, W, Dd, top, o.rise ?? Math.min(W, Dd) * 0.3, { wall: wc, alongX: o.alongX });
      for (const [x, z] of o.chimneys ?? []) { chimney(B, x, roof === 'gable' ? top + (o.rise ?? Math.min(W, Dd) * 0.28) * 0.4 : top, z, wc); if (roof === 'flat') colBox(B, x, top, z, 0.52, 1.35, 0.52, true); }
      if (o.tank) { const [x, z] = o.tank; B.box('paint', shade(wc, 0.95), 0.9, 0.3, 0.9, x, top + 0.15, z, { r: 0.04 }); B.lathe('paint', '#3a3f45', [[0, 0], [0.38, 0], [0.4, 0.05], [0.4, 0.95], [0.36, 1.0], [0.08, 1.2], [0, 1.22]], x, top + 0.3, z, { seg: 14 }); for (const yy of [0.35, 0.7]) B.tor(NS('paint'), '#2c3036', 0.405, 0.015, x, top + 0.3 + yy, z, { rx: HP, ts: 16, rs: 3 }); B.tube(NS('metal'), K.ironLt, [P3(x + 0.35, top + 0.5, z), P3(x + 0.6, top + 0.5, z), P3(x + 0.6, top, z)], 0.02, { radial: 4 }); colBox(B, x, top, z, 0.9, 1.4, 0.9, true); }
      if (o.antenna) { const [x, z] = o.antenna; B.cyl('metal', K.ironLt, 0.02, 2.2, x, top + 1.1, z, { seg: 5 }); for (const [yy, l] of [[1.8, 0.9], [2.0, 0.7], [2.15, 0.5]]) B.cyl(NS('metal'), K.ironLt, 0.01, l, x, top + yy, z, { rz: HP, seg: 4 }); }
    },
  };
  // ---- Tower Command: the Caffè's sottoportico (layout.js CAFFE_T): the house's Salita end open underneath — the
  // portico (lx −w/2 … −um) under a plank ceiling on chestnut beams with stone corbels, the front wall running on to
  // lx −uf, the café's side door moved onto the solid wall inside, a lantern. Dresses the level pieces; non-colliding.
  D.terraces_portico = {
    desc: 'Sottoportico under the Caffè (pos = house centre, the house frame; w, d, um, uf, ceil, wall, top, color): the open end of the house under a timber ceiling — chestnut edge beams on stone corbels, joists, a plank soffit, a plank door and a lantern on the solid wall inside, quoins on the front wall end. Non-colliding.',
    params: { w: 'house width', d: 'house depth', um: 'lx of the solid wall inside (−um)', uf: 'lx where the front wall ends (−uf)', ceil: 'ceiling height', wall: 'front wall depth' },
    variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const hw = o.w / 2, hd = o.d / 2, x0 = -hw, x1 = -o.um, xf = -o.uf, c = o.ceil, wc = o.color ?? K.ochre, bw = K.chestnut, st = K.stoneLt;
      // plank soffit and joists across the portico
      B.box(NS('wood'), K.woodLt, x1 - x0 - 0.02, 0.03, o.d - 0.02, (x0 + x1) / 2, c - 0.015, 0, { r: 0.005 });
      for (let x = x0 + 0.45; x < x1 - 0.2; x += 0.62) B.box('wood', bw, 0.1, 0.12, o.d - 0.3, x, c - 0.09, 0, { r: 0.015 });
      // edge beams along the open sides (the Salita side, the back, the open front corner)
      B.box('wood', shade(bw, 0.9), 0.2, 0.22, o.d, x0 + 0.1, c - 0.11, 0, { r: 0.02 });
      B.box('wood', shade(bw, 0.9), x1 - x0, 0.22, 0.2, (x0 + x1) / 2, c - 0.11, -hd + 0.1, { r: 0.02 });
      B.box('wood', shade(bw, 0.9), xf - x0, 0.22, 0.2, (x0 + xf) / 2, c - 0.11, hd - 0.1, { r: 0.02 });
      // stone corbels where the beams meet the walls
      for (const [x, z, ry] of [[x1 - 0.18, -hd + 0.1, 0], [xf - 0.18, hd - 0.1, 0]]) {
        B.box('paint', st, 0.36, 0.14, 0.24, x, c - 0.29, z, { r: 0.02, ry });
        B.box('paint', st, 0.24, 0.12, 0.22, x + 0.06, c - 0.42, z, { r: 0.02, ry });
      }
      // quoins up the front wall's open end, a plinth along the walls inside
      for (let k = 0; k < Math.floor((c - 0.3) / 0.58); k++) B.box('paint', st, 0.06, 0.5, k % 2 ? 0.36 : 0.26, xf - 0.03, 0.26 + k * 0.58, hd - (k % 2 ? 0.18 : 0.13), { r: 0.012 });
      B.box('paint', K.stone, 0.06, 0.3, o.d - o.wall, x1 - 0.03, 0.15, -o.wall / 2, { r: 0.015 });
      B.box('paint', K.stone, x1 - xf, 0.3, 0.06, (x1 + xf) / 2, 0.15, hd - o.wall - 0.03, { r: 0.015 });
      // the side door and a lantern on the solid wall inside (it faces −lx)
      B.push(x1, 0, 0.2, -HP);
      doorU(B, 0, 0, 0.9, 2.1, { leaf: K.blue });
      lanternU(B, -1.05, 2.45);
      B.pop();
    },
  };
  // striped canvas awning on a shop (projects 1.1 m), scalloped valance, iron arms
  function awningU(B, x, y, w, o = {}) {
    const cA = o.cA ?? K.blue, cB = o.cB ?? K.cloth, pr = o.proj ?? 1.0, drop = 0.42, n = Math.max(4, Math.round(w / 0.3));
    const ang = Math.atan2(drop, pr), sl = Math.hypot(drop, pr);
    for (let i = 0; i < n; i++) {
      const sx = x - w / 2 + (i + 0.5) * (w / n);
      B.box('foliage', i % 2 ? cB : cA, w / n + 0.002, 0.02, sl, sx, y - drop / 2, pr / 2, { rx: ang, r: 0.004 });
      B.box(NS('foliage'), i % 2 ? cB : cA, w / n + 0.002, 0.18, 0.012, sx, y - drop - 0.09, pr, { r: 0.004 });
    }
    B.box('metal', K.iron, w + 0.06, 0.06, 0.06, x, y, 0.03, { r: 0.015 });
    for (const sx of [-1, 1]) B.tube(NS('metal'), K.iron, [P3(x + sx * (w / 2 - 0.05), y - 0.75, 0.01), P3(x + sx * (w / 2 - 0.05), y - drop, pr)], 0.012, { radial: 4 });
  }
  // shopfront: timber-framed glazing + door, stall riser, lettering fascia (optional)
  function shopU(B, x, y, w, h, o = {}) {
    const fc = o.frame ?? K.greenDk;
    pbox(B, NS('paint'), '#3a3430', w, h, 0.01, x, y + h / 2, 0.005);
    pbox(B, NS('gloss'), K.glassLt, w - 0.14, h - 0.62, 0.012, x, y + 0.5 + (h - 0.62) / 2, 0.02);
    if (o.lit) pbox(B, NS('glow'), K.lamp, w - 0.24, (h - 0.62) * 0.4, 0.004, x, y + h - 0.35, 0.03, { glow: o.lit });
    B.box('paint', fc, w, 0.5, 0.06, x, y + 0.25, 0.03, { r: 0.015 });
    for (const sx of [-1, 1]) B.box('paint', fc, 0.08, h, 0.07, x + sx * (w / 2 - 0.04), y + h / 2, 0.035, { r: 0.012 });
    B.box('paint', fc, w, 0.08, 0.07, x, y + h - 0.04, 0.035, { r: 0.012 });
    const nm = Math.max(1, Math.round(w / 0.9) - 1);
    for (let i = 1; i <= nm; i++) pbox(B, NS('paint'), fc, 0.05, h - 0.55, 0.05, x - w / 2 + (i * w) / (nm + 1), y + 0.5 + (h - 0.55) / 2, 0.035);
    // goods on the sill: ceramics / bottles
    if (o.goods === 'ceramics') for (let k = 0; k < Math.round(w / 0.25); k++) { const gx = x - w / 2 + 0.2 + k * 0.25; B.lathe(NS('gloss'), [K.majBlue, K.majYel, K.majGreen, K.majWhite][k % 4], [[0, 0], [0.06, 0], [0.08, 0.06], [0.05, 0.14], [0.04, 0.18], [0, 0.18]], gx, y + 0.5, 0.09, { seg: 8 }); }
    if (o.goods === 'lemons') for (let k = 0; k < Math.round(w / 0.16); k++) { const gx = x - w / 2 + 0.15 + k * 0.16; B.lathe(NS('gloss'), k % 3 ? K.lemon : '#e8e0c0', [[0, 0], [0.035, 0], [0.04, 0.12], [0.015, 0.2], [0.012, 0.26], [0, 0.26]], gx, y + 0.5, 0.09, { seg: 6 }); }
  }
  // votive niche (edicola): arched recess with a painted tile Madonna, a little roof, flowers and a lamp
  function nicheU(B, x, y, o = {}) {
    B.box('paint', K.stoneLt, 0.62, 0.9, 0.08, x, y + 0.45, 0.04, { r: 0.02 });
    B.box('paint', K.coppi, 0.72, 0.06, 0.24, x, y + 0.95, 0.11, { rx: -0.3, r: 0.015 });
    pbox(B, NS('gloss'), K.majBlue, 0.42, 0.52, 0.01, x, y + 0.45, 0.085);
    pbox(B, NS('gloss'), K.majWhite, 0.36, 0.46, 0.01, x, y + 0.45, 0.09);
    B.sph(NS('gloss'), K.majBlue, 0.09, x, y + 0.36, 0.095, { ws: 8, hs: 6, sz: 0.25 });
    B.sph(NS('gloss'), '#e8c9a8', 0.045, x, y + 0.56, 0.1, { ws: 8, hs: 6, sz: 0.3 });
    B.tor(NS('gloss'), K.majYel, 0.07, 0.008, x, y + 0.58, 0.1, { ts: 12, rs: 3 });
    B.box('paint', K.stone, 0.66, 0.05, 0.2, x, y + 0.02, 0.1, { r: 0.01 });
    pot(B, x - 0.2, y + 0.05, 0.13, 0.05, 0.1, K.majWhite);
    dots(B, x - 0.2, y + 0.2, 0.13, 0.06, 0.05, 0.06, 5, 0.022, K.geranium, Math.round(x * 3 + y), NS('paint'));
    B.cyl('glow', '#ff9c5c', 0.025, 0.06, x + 0.2, y + 0.08, 0.13, { seg: 8, glow: 2.2 });
  }

  // ------------------------------------------------------------------------------------------ edges, balustrades, rails
  // stone balustrade (belvedere): plinth, turned balusters, moulded top rail; runs along +X for `length`; collides (1.0)
  D.terraces_balustrade = {
    desc: 'Limestone belvedere balustrade along +X (pos = start, face +Z): plinth, turned balusters every 0.24 m, square piers every ~2.4 m with ball finials at the ends, moulded rail. Rail collider 1.0 m high (0.34 deep): kids blocked, shots / ink / squids pass.',
    params: { length: 'm (4)', piers: 'bool (true)', finials: 'bool' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 4, Hh = 1.0, sc = K.stoneLt;
      B.box('paint', sc, L, 0.16, 0.34, L / 2, 0.08, 0, { r: 0.03 });
      B.box('paint', sc, L, 0.1, 0.36, L / 2, Hh - 0.05, 0, { r: 0.035 });
      B.box(NS('paint'), shade(sc, 0.92), L, 0.05, 0.3, L / 2, Hh - 0.12, 0, { r: 0.015 });
      const prof = [[0, 0], [0.07, 0], [0.05, 0.08], [0.085, 0.3], [0.04, 0.56], [0.07, 0.62], [0.07, 0.66], [0, 0.66]];
      const nP = o.piers === false ? 0 : Math.max(1, Math.round(L / 2.4));
      const pierAt = []; for (let i = 0; i <= nP; i++) pierAt.push((i * L) / Math.max(1, nP));
      for (let x = 0.2; x < L - 0.1; x += 0.24) {
        if (pierAt.some((p) => Math.abs(p - x) < 0.24)) continue;
        B.lathe('paint', sc, prof, x, 0.16, 0, { seg: 6 });
      }
      for (const p of pierAt) {
        const px = Math.min(L - 0.15, Math.max(0.15, p));
        B.box('paint', sc, 0.3, Hh + 0.06, 0.38, px, (Hh + 0.06) / 2, 0, { r: 0.03 });
        if ((p === 0 || p === L) && o.finials !== false) B.lathe('paint', sc, [[0, 0], [0.1, 0], [0.1, 0.04], [0.05, 0.08], [0.1, 0.18], [0.02, 0.3], [0, 0.31]], px, Hh + 0.06, 0, { seg: 10 });
      }
      B.col(0, 0, -0.17, L, Hh, 0.17, RAIL);
    },
  };
  // wrought-iron handrail beside stairs / along drops (non-colliding): posts + rail + scroll bars; runs along +X, slope
  D.terraces_rail = {
    desc: 'Wrought-iron handrail along +X from pos (rise over its length for stairs): square posts every ~1.1 m, round top rail, a lower rail and simple scrolls. Rail colliders follow the slope in ~2 m steps (kids blocked, shots / ink / squids pass).',
    params: { length: 'm', rise: 'm (0)', height: 'm (0.95)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 3, rise = o.rise ?? 0, Hh = o.height ?? 0.95, ic = K.iron;
      const yAt = (x) => (rise * x) / L;
      B.tube('metal', ic, [P3(0, Hh, 0), P3(L, Hh + rise, 0)], 0.022, { radial: 6 });
      B.tube(NS('metal'), ic, [P3(0, 0.25, 0), P3(L, 0.25 + rise, 0)], 0.012, { radial: 4 });
      const n = Math.max(1, Math.round(L / 1.1));
      for (let i = 0; i <= n; i++) { const x = (i * L) / n; pbox(B, 'metal', ic, 0.03, Hh, 0.03, x, yAt(x) + Hh / 2, 0); }
      for (let x = 0.15; x < L - 0.1; x += 0.28) B.cyl(NS('metal'), ic, 0.007, Hh - 0.28, x, yAt(x) + 0.25 + (Hh - 0.28) / 2, 0, { seg: 4 });
      const ns = rise ? Math.max(1, Math.ceil(L / 2.2)) : 1;
      for (let i = 0; i < ns; i++) { const xa = (i * L) / ns, xb = ((i + 1) * L) / ns; B.col(xa - (i ? 0 : 0.02), Math.min(yAt(xa), yAt(xb)) - 0.05, -0.06, xb + (i < ns - 1 ? 0 : 0.02), Math.max(yAt(xa), yAt(xb)) + Hh + 0.03, 0.06, RAIL); }
    },
  };
  // terrace edge cap: limestone coping slabs along a slab edge (flush, 4 cm), with a drip shadow line (non-colliding)
  D.terraces_edge = {
    desc: 'Limestone edge coping along +X on a terrace / wall top edge (pos = start on the edge, the drop on local +Z): slabs 0.9 m with joints, rounded nosing, a thin drip shadow under it. Flat (≤ 5 cm): walk over.',
    params: { length: 'm' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 4, n = Math.max(1, Math.round(L / 0.9)), sl = L / n;
      for (let i = 0; i < n; i++) B.box('paint', mixc(K.stoneLt, K.stone, hash(i + L) * 0.6), sl - 0.012, 0.05, 0.34, (i + 0.5) * sl, 0.018, -0.12, { r: 0.018 });
      pbox(B, NS('paint'), shade(K.stoneDk, 0.8), L, 0.06, 0.012, L / 2, -0.06, 0.012);
    },
  };

  // ------------------------------------------------------------------------------------------ pergola + planting
  // pergola: limewashed masonry pillars, chestnut beams + rafters, a vine canopy with grape bunches (or wisteria)
  D.terraces_pergola = {
    desc: 'Pergola over a terrace (pos = centre, w along X, d along Z, h clear height): square limewashed pillars at the corners (+ midspan when long), chestnut beams and rafters, a leafy grapevine canopy with bunches hanging through (variant 1 = wisteria with lilac racemes). Pillars collide.',
    params: { w: 'm (4)', d: 'm (3)', h: 'm (2.5)', pillars: '[[x,z]] override', cover: '0..1 canopy density (0.8)' }, variants: 2, mount: 'ground',
    build(B, o) {
      const W = o.w ?? 4, Dd = o.d ?? 3, Hh = o.h ?? 2.5, v = (o.variant ?? 0) % 2, wc = o.color ?? K.white;
      const nx = Math.max(1, Math.round(W / 3.2)), nz = Math.max(1, Math.round(Dd / 3.2));
      const pil = o.pillars ?? (() => { const a = []; for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) if (i === 0 || i === nx || k === 0 || k === nz) a.push([-W / 2 + (i * W) / nx, -Dd / 2 + (k * Dd) / nz]); return a; })();
      for (const [x, z] of pil) {
        B.box('paint', wc, 0.34, Hh, 0.34, x, Hh / 2, z, { r: 0.04 });
        B.box(NS('paint'), shade(wc, 0.9), 0.42, 0.12, 0.42, x, 0.06, z, { r: 0.02 });
        B.box(NS('paint'), shade(wc, 0.95), 0.4, 0.08, 0.4, x, Hh - 0.04, z, { r: 0.02 });
        colBox(B, x, 0, z, 0.36, Hh, 0.36, true);
      }
      // beams along X on the pillar lines, rafters along Z across them
      const zs = [...new Set(pil.map((p) => p[1]))];
      for (const z of zs) B.box('wood', K.chestnut, W + 0.5, 0.16, 0.12, 0, Hh + 0.08, z, { r: 0.03 });
      const nr = Math.max(2, Math.round(W / 0.55));
      for (let i = 0; i <= nr; i++) B.box('wood', shade(K.chestnut, 0.9 + 0.15 * hash(i)), 0.08, 0.1, Dd + 0.5, -W / 2 - 0.1 + (i * (W + 0.2)) / nr, Hh + 0.21, 0, { r: 0.02 });
      // canopy: flattened leafy puffs over the rafters, fruit / flowers hanging through
      const cover = o.cover ?? 0.8, seed = Math.round(W * 13 + Dd * 7);
      const cells = Math.round((W * Dd * cover) / 0.9);
      for (let i = 0; i < cells; i++) {
        const x = (hash(seed + i * 1.37) - 0.5) * (W + 0.3), z = (hash(seed * 1.9 + i * 2.71) - 0.5) * (Dd + 0.3), s = 0.42 + 0.22 * hash(i * 5.1 + seed);
        B.add('foliage', puff(0, (seed + i) % 6), mixc(K.leafDk, v ? K.leafLt : K.vine, hash(i * 3.3)), x, Hh + 0.36 + 0.08 * hash(i * 7.7), z, { s, sy: s * 0.42, ry: hash(i) * TAU, ao: false });
      }
      const hang = Math.round(W * Dd * 0.55);
      for (let i = 0; i < hang; i++) {
        const x = (hash(seed + i * 9.1) - 0.5) * W, z = (hash(seed * 0.7 + i * 4.3) - 0.5) * Dd;
        if (v) { B.lathe(NS('foliage'), mixc(K.lavender, '#c4b4e8', hash(i)), [[0, 0], [0.045, -0.04], [0.04, -0.14], [0.02, -0.24], [0, -0.28]], x, Hh + 0.22, z, { seg: 5 }); }
        else { B.lathe(NS('gloss'), mixc('#5a3b62', '#7a5580', hash(i)), [[0, 0], [0.06, -0.03], [0.065, -0.1], [0.04, -0.2], [0, -0.25]], x, Hh + 0.2, z, { seg: 6 }); }
      }
    },
  };
  // potted plants in big terracotta pots: lemon tree, olive, bougainvillea bush, agave, palm-free Mediterranean set
  D.terraces_potplant = {
    desc: 'Big terracotta pot (rim ~0.4 m) with a Mediterranean plant: variant 0 lemon tree (glossy dark canopy, lemons), 1 small olive (silvery), 2 bougainvillea bush (magenta), 3 agave (blue-grey rosette), 4 oleander (pink). Pot collides.',
    params: { scale: 'uniform', color: 'pot colour' }, variants: 5, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 5, r = 0.4, h = 0.62, pc = o.color ?? K.terra, seed = Math.round((o.pos?.[0] ?? 0) * 7 + (o.pos?.[2] ?? 0) * 3) + v;
      pot(B, 0, 0, 0, r, h, pc);
      B.tor(NS('paint'), shade(pc, 0.86), r * 0.93, 0.02, 0, h * 0.62, 0, { rx: HP, ts: 16, rs: 4 });
      if (v === 0 || v === 1) {
        const th = v ? 1.2 : 1.1;
        B.tube('wood', K.bark, [P3(0, h * 0.85, 0), P3(0.04, h + th * 0.5, 0.02), P3(-0.02, h + th, 0)], (t) => 0.05 - t * 0.02, { radial: 6 });
        if (v === 0) {
          cluster(B, 0, h + th + 0.3, 0, 0.5, 0.45, 0.5, 7, 0.34, K.leafDk, K.leaf, seed, 'foliage');
          dots(B, 0, h + th + 0.3, 0, 0.62, 0.5, 0.62, 16, 0.055, K.lemon, seed, NS('gloss'), -0.7);
        } else {
          cluster(B, 0, h + th + 0.3, 0, 0.55, 0.4, 0.55, 8, 0.28, K.oliveDk, K.olive, seed, 'foliage', { flat: 0.7 });
        }
      } else if (v === 2) {
        cluster(B, 0, h + 0.45, 0, 0.45, 0.35, 0.45, 7, 0.28, K.leafDk, K.leaf, seed, 'foliage');
        cluster(B, 0.05, h + 0.6, 0, 0.5, 0.35, 0.5, 7, 0.2, K.bougain, K.bougainLt, seed + 3, 'foliage');
      } else if (v === 3) {
        for (let i = 0; i < 11; i++) {
          const a = i * 2.4, len = 0.55 + 0.25 * hash(i + seed), up = 0.5 + 0.9 * hash(i * 3 + seed);
          B.tube('foliage', mixc('#6f8f86', '#9ab0a3', hash(i)), [P3(0, h * 0.9, 0), P3(Math.cos(a) * len * 0.5, h + up * len * 0.5, Math.sin(a) * len * 0.5), P3(Math.cos(a) * len, h + up * len * 0.7, Math.sin(a) * len)], (t) => 0.06 * (1 - t) + 0.005, { radial: 4 });
        }
      } else {
        cluster(B, 0, h + 0.55, 0, 0.42, 0.45, 0.42, 7, 0.28, K.leafDk, K.leaf, seed, 'foliage');
        dots(B, 0, h + 0.6, 0, 0.45, 0.45, 0.45, 18, 0.05, '#e59ab3', seed, NS('foliage'), -0.3);
      }
      colBox(B, 0, 0, 0, r * 1.9, h, r * 1.9, true);
      B.blob(1.2, 1.2);
    },
  };
  // cluster of small pots (geraniums, basil, succulents) — doorstep / stair-side clutter, non-colliding
  D.terraces_pots = {
    desc: 'Doorstep cluster of 3–5 small terracotta and majolica pots with geraniums, basil and succulents (along +X, ~1 m). Non-colliding.',
    params: { count: '3–5 (4)', seed: 'layout' }, variants: 2, mount: 'ground',
    build(B, o) {
      const n = o.count ?? 4, seed = o.seed ?? Math.round((o.pos?.[0] ?? 0) * 11 + (o.pos?.[2] ?? 0) * 5);
      for (let i = 0; i < n; i++) {
        const x = i * 0.26 + (hash(seed + i) - 0.5) * 0.06, z = (hash(seed * 3 + i) - 0.5) * 0.18, r = 0.1 + 0.06 * hash(i * 7 + seed), h = 0.16 + 0.12 * hash(i * 5 + seed);
        const pc = hash(seed + i * 9) > 0.8 ? K.majBlue : mixc(K.terra, K.terraLt, hash(i * 2 + seed));
        pot(B, x, 0, z, r, h, pc);
        const kind = Math.floor(hash(seed * 1.3 + i * 4.7) * 3);
        if (kind === 0) { cluster(B, x, h + 0.1, z, r * 1.2, 0.1, r * 1.2, 3, r * 0.9, K.leafDk, K.leaf, seed + i, 'foliage', { low: true }); dots(B, x, h + 0.14, z, r * 1.3, 0.1, r * 1.3, 6, 0.03, (o.variant ?? 0) ? K.bougainLt : K.geranium, seed + i, NS('paint'), -0.2); }
        else if (kind === 1) cluster(B, x, h + 0.08, z, r, 0.1, r, 3, r * 0.8, K.leaf, K.leafLt, seed + i * 3, 'foliage', { low: true });
        else for (let k = 0; k < 5; k++) { const a = k * 1.26; B.sph(NS('foliage'), '#7d9a86', 0.05, x + Math.cos(a) * r * 0.45, h + 0.03, z + Math.sin(a) * r * 0.45, { ws: 6, hs: 4, sy: 0.6 }); }
      }
    },
  };
  // big olive tree in a round limestone planter (collides): gnarled twin trunk, silvery clumped canopy
  D.terraces_olive = {
    desc: 'Old olive tree in a round limestone planter (1.5 m, 0.55 high, seat-height rim): gnarled twisted twin trunk, silvery clumped canopy (~4 m). Planter + trunk collide.',
    params: { seed: 'shape' }, variants: 1, mount: 'ground',
    build(B, o) {
      const seed = o.seed ?? 5, R = 0.78;
      B.lathe('paint', K.stoneLt, [[0, 0], [R, 0], [R + 0.02, 0.05], [R, 0.1], [R - 0.02, 0.45], [R + 0.05, 0.47], [R + 0.05, 0.55], [R - 0.12, 0.55], [R - 0.14, 0.5], [0, 0.5]], 0, 0, 0, { seg: 20 });
      B.cyl(NS('paint'), K.soil, R - 0.14, 0.02, 0, 0.5, 0, { seg: 16 });
      const tr = (a, lean, hgt, r0) => {
        const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(P3(Math.cos(a) * lean * t + 0.08 * Math.sin(t * 9 + seed), 0.45 + hgt * t, Math.sin(a) * lean * t + 0.08 * Math.cos(t * 7 + seed))); }
        B.tube('wood', mixc(K.bark, K.barkDk, 0.4), pts, (t) => r0 * (1 - 0.55 * t) * (1 + 0.15 * Math.sin(t * 20)), { radial: 7 });
        return pts[8];
      };
      const t1 = tr(0.4 + seed, 0.7, 1.9, 0.16), t2 = tr(3.3 + seed, 0.55, 1.6, 0.13);
      for (const [p, k] of [[t1, 0], [t2, 1]]) cluster(B, p[0], p[1] + 0.45, p[2], 1.15, 0.6, 1.15, 9, 0.52, K.oliveDk, K.olive, seed * 3 + k, 'foliage', { flat: 0.62 });
      cluster(B, 0, 2.9, 0, 0.9, 0.35, 0.9, 5, 0.5, K.oliveDk, K.olive, seed * 7, 'foliage', { flat: 0.6 });
      colBox(B, 0, 0, 0, R * 2, 0.55, R * 2);
      colBox(B, 0, 0.55, 0, 0.5, 1.6, 0.5, true);
      B.blob(3.4, 3.4);
    },
  };
  // ---- the village LAVATOIO on the Oliveto (the Long Stages slice, layout.js OLIVETO): an open wash-house loggia — six
  // limewashed pillars under a coppi roof, the long double stone basin down the middle (the wash trough and the rinse
  // trough, washboard slabs on the rims, water in them), the spring head on the low back wall at the uphill end pouring
  // into it, the founding tablet on the front architrave, a lantern under the ridge, a basket of washing on the rim.
  // pos = the loggia's centre on the terrace floor; local +Z = its long axis (the open front, downhill), W across, Dd along.
  D.terraces_lavatoio = {
    desc: 'Village lavatoio: open loggia (W x Dd, pos = centre on the floor, local +Z the front): six limewashed pillars, beams, a coppi gable roof (collides, off-limits), the double stone wash basin down the middle (collides 0.85: cover) with water and washboard slabs, the spring head on the low back wall (collides 1.3) pouring into it, the founding tablet, a lantern, washing in a basket and on a line.',
    params: { W: 'm (6.2)', Dd: 'm (8)', h: 'm pillar height (3.1)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const W = o.W ?? 6.2, Dd = o.Dd ?? 8, Hp = o.h ?? 3.1, wc = K.lime, sc = K.stoneLt, px = W / 2 - 0.26, pz = Dd / 2 - 0.26;
      // pillars (plinth, shaft, capital) + their colliders; beams round the top; the roof
      for (const sx of [-1, 1]) for (const z of [-pz, 0, pz]) {
        B.box('paint', sc, 0.56, 0.3, 0.56, sx * px, 0.15, z, { r: 0.03 });
        B.box('paint', wc, 0.46, Hp - 0.5, 0.46, sx * px, 0.3 + (Hp - 0.5) / 2, z, { r: 0.03 });
        B.box('paint', sc, 0.6, 0.2, 0.6, sx * px, Hp - 0.1, z, { r: 0.03 });
        colBox(B, sx * px, 0, z, 0.56, Hp, 0.56);
      }
      for (const sx of [-1, 1]) B.box('paint', wc, 0.5, 0.36, Dd, sx * px, Hp + 0.18, 0, { r: 0.03 });
      for (const sz of [-1, 1]) B.box('paint', wc, W, 0.36, 0.5, 0, Hp + 0.18, sz * pz, { r: 0.03 });
      for (let z = -pz + 1.1; z < pz - 0.5; z += 1.1) pbox(B, NS('wood'), K.chestnut, W - 0.6, 0.14, 0.12, 0, Hp + 0.28, z);
      gableRoof(B, 0, 0, W, Dd, Hp + 0.36, 1.25, { wall: wc, alongX: false, ov: 0.35 });
      B.col(-W / 2 - 0.4, Hp, -Dd / 2 - 0.4, W / 2 + 0.4, Hp + 1.7, Dd / 2 + 0.4, ROOF);
      // the founding tablet on the front architrave + the lantern under the ridge
      B.push(0, Hp + 0.18, Dd / 2 - 0.26 + 0.26);
      B.box('paint', K.stone, 3.1, 0.3, 0.04, 0, 0, 0.02, { r: 0.01 });
      letters(B, 'LAVATOIO PUBBLICO 1891', { h: 0.13, x: 0, y: -0.065, z: 0.045, c: K.blueDk, flat: true, wt: 0.2, track: 0.1 });
      B.pop();
      B.cyl(NS('metal'), K.iron, 0.012, 0.8, 0, Hp + 0.6, 0, { seg: 4 });
      lanternU(B, 0, Hp - 0.1, {});
      // the double basin: outer stone box, two troughs with water, a centre rib, washboard slabs sloping into each
      const bl = Dd - 2.2, bw = 1.7, bh = 0.85, bz = -0.35;
      B.box('paint', sc, bw, bh, bl, 0, bh / 2, bz, { r: 0.05 });
      for (const sx of [-1, 1]) {
        B.box(NS('gloss'), '#6f9aa2', bw / 2 - 0.22, 0.02, bl - 0.28, sx * (bw / 4), bh - 0.12, bz, { r: 0.01 });
        B.push(sx * (bw / 2 - 0.16), bh + 0.02, bz, 0, 0, sx * 0.32);
        B.box('paint', shade(sc, 0.95), 0.36, 0.06, bl - 0.3, 0, 0, 0, { r: 0.02 });
        for (let k = -bl / 2 + 0.4; k < bl / 2 - 0.3; k += 0.14) pbox(B, NS('paint'), shade(sc, 0.85), 0.34, 0.012, 0.03, 0, 0.032, k);
        B.pop();
      }
      B.box('paint', shade(sc, 0.97), 0.14, 0.12, bl - 0.1, 0, bh + 0.02, bz, { r: 0.02 });
      colBox(B, 0, 0, bz, bw + 0.1, bh, bl);
      // the spring head on the low back wall at the uphill (−Z) end, pouring into the basin's end
      const wz = -Dd / 2 + 0.26;
      B.box('paint', wc, W - 1.0, 1.3, 0.36, 0, 0.65, wz, { r: 0.03 });
      B.box('paint', sc, W - 0.9, 0.1, 0.46, 0, 1.33, wz, { r: 0.02 });
      B.box('paint', sc, 0.9, 0.9, 0.12, 0, 1.0, wz + 0.2, { r: 0.04 });
      B.sph('paint', shade(sc, 0.95), 0.16, 0, 1.05, wz + 0.28, { ws: 10, hs: 8, sz: 0.6 });
      B.cyl('metal', K.brass, 0.02, 0.2, 0, 1.0, wz + 0.38, { rx: HP, seg: 8 });
      B.tube(NS('gloss'), '#bfe1ee', [P3(0, 1.0, wz + 0.47), P3(0, 0.96, wz + 0.58), P3(0, 0.84, wz + 0.64)], (t) => 0.016 + 0.008 * t, { radial: 6 });
      plaqueU(B, 0, 1.2, 'ACQUA', { h: 0.06, w: 0.44 });
      colBox(B, 0, 0, wz, W - 1.0, 1.3, 0.36);
      // washing: a basket on the rim, a scrubbed shirt on the washboard, a line of cloths between the back pillars
      B.lathe('wood', '#c8a870', [[0, 0], [0.26, 0], [0.3, 0.26], [0.32, 0.3], [0, 0.3]], 0.55, bh + 0.02, bz + bl / 2 - 0.5, { seg: 10 });
      for (let k = 0; k < 4; k++) B.box(NS('paint'), [K.cloth, '#dfe7ef', '#e9c9c0', K.cloth][k], 0.3, 0.06, 0.24, 0.5 + (k % 2) * 0.1, bh + 0.3 + k * 0.05, bz + bl / 2 - 0.5, { round: true, r: 0.05, ry: k });
      B.box(NS('paint'), '#dfe7ef', 0.4, 0.02, 0.5, -0.58, bh + 0.1, bz, { rz: 0.3, r: 0.01 });
      B.tube(NS('paint'), K.rope, [P3(-px, 2.3, -pz + 0.2), P3(0, 2.1, -pz + 0.2), P3(px, 2.3, -pz + 0.2)], 0.01, { radial: 3 });
      for (const [x, c, hh] of [[-1.6, K.cloth, 0.7], [-0.8, '#e9c9c0', 0.55], [0.1, '#dfe7ef', 0.75], [1.0, K.cloth, 0.6], [1.8, '#f0e2a8', 0.5]]) B.box(NS('paint'), c, 0.55, hh, 0.02, x, 2.15 - hh / 2 + (Math.abs(x) / px) * 0.12, -pz + 0.2, { r: 0.005 });
    },
  };

  // ---- the olive terraces' furniture (the Long Stages slice): the old olive mill in the Oliveto, dry-stone wall stubs
  // (cover among the trees), olive nets rolled on a ladder
  D.terraces_press = {
    desc: 'Old stone olive mill (frantoio) out in the grove: a round limestone basin (2.3 m, 0.8 high) with a vertical millstone on a chestnut axle and a pushing beam, olives in the basin, two oil jars. Collides 1.25 m (cover).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const R = 1.15, sc = K.stone;
      B.lathe('paint', sc, [[0, 0], [R, 0], [R + 0.04, 0.08], [R, 0.16], [R - 0.03, 0.7], [R + 0.03, 0.74], [R + 0.03, 0.8], [R - 0.18, 0.8], [R - 0.2, 0.72], [0.2, 0.72], [0.2, 0.8], [0, 0.8]], 0, 0, 0, { seg: 22 });
      B.cyl(NS('paint'), '#4a4a2c', R - 0.22, 0.02, 0, 0.73, 0, { seg: 18 });
      dots(B, 0, 0.76, 0, R - 0.35, 0.02, R - 0.35, 30, 0.03, '#3b3a26', 7, NS('gloss'), 0);
      B.cyl('paint', shade(sc, 0.93), 0.62, 0.34, 0.45, 1.22, 0, { rz: HP, seg: 18 });
      B.cyl('paint', shade(sc, 0.93), 0.62, 0.34, -0.45, 1.22, 0, { rz: HP, seg: 18 });
      B.cyl('wood', K.chestnut, 0.09, 1.6, 0, 1.22, 0, { rz: HP, seg: 8 });
      B.cyl('wood', K.chestnut, 0.13, 1.4, 0, 1.2, 0, { seg: 8 });
      B.tube('wood', K.chestnut, [P3(0, 1.55, 0), P3(0.6, 1.5, 0.2), P3(2.1, 1.1, 0.6)], 0.07, { radial: 6 });
      for (const [x, z, h] of [[-1.5, 0.9, 0.7], [-1.9, 0.3, 0.55]]) B.lathe('paint', K.terra, [[0, 0], [0.16, 0], [0.26, h * 0.5], [0.12, h], [0.14, h + 0.05], [0, h + 0.05]], x, 0, z, { seg: 12 });
      colBox(B, 0, 0, 0, R * 2, 1.25, R * 2);
      colBox(B, -1.7, 0, 0.6, 0.6, 0.72, 0.9);
      B.blob(3.2, 3.0);
    },
  };
  D.terraces_drywall = {
    desc: 'A stub of dry-stone wall along +X (pos = its centre, length L, 0.6 thick, ~1.05 high): rough limestone blocks laid dry, capstones, a caper plant in a gap, an olive net rolled on a ladder against it (net: true). Collides (cover).',
    params: { length: 'm (2.8)', net: 'bool' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 2.8, Hh = 1.05, seed = Math.round((o.seed ?? 3) * 7);
      for (let row = 0; row < 4; row++) {
        let x = -L / 2 + (row % 2) * 0.18;
        for (let i = 0; x < L / 2 - 0.05; i++) {
          const w = Math.min(0.35 + 0.3 * hash(seed + row * 11 + i), L / 2 - x), h = 0.22 + 0.06 * hash(seed + i * 3 + row), y = row * 0.25;
          B.box('paint', mixc(K.stone, K.tufa, hash(seed + i + row * 5)), w - 0.03, h, 0.56 + 0.06 * hash(i + row), x + w / 2, y + h / 2, (hash(i * 7 + row) - 0.5) * 0.05, { r: 0.05 });
          x += w;
        }
      }
      for (let x = -L / 2 + 0.25; x < L / 2 - 0.1; x += 0.5) B.box('paint', shade(K.stoneLt, 0.97), 0.48, 0.14, 0.64, x, Hh - 0.05, 0, { r: 0.05, ry: (hash(x * 13) - 0.5) * 0.2 });
      cluster(B, L * 0.2, 0.75, 0.32, 0.25, 0.2, 0.12, 4, 0.12, K.leafDk, K.leaf, seed, 'foliage', { low: true });
      if (o.net) {
        seg2(B, [L / 2 - 0.4, 0, 0.45], [L / 2 - 0.6, 2.2, 0.32], 0.05);
        seg2(B, [L / 2 - 1.0, 0, 0.45], [L / 2 - 1.2, 2.2, 0.32], 0.05);
        for (let k = 0; k < 6; k++) pbox(B, NS('wood'), K.woodLt, 0.64, 0.04, 0.04, L / 2 - 0.8 - k * 0.02, 0.3 + k * 0.35, 0.44 - k * 0.02);
        B.cyl('paint', '#3f6b4a', 0.22, 1.3, L / 2 - 1.8, 0.35, 0.5, { rz: HP, seg: 10 });
      }
      colBox(B, 0, 0, 0, L, Hh, 0.64);
      B.blob(L + 0.6, 1.3);
    },
  };
  // a garden urn on a pedestal (villa terraces, the belvedere): moulded limestone pedestal, a big terracotta urn with a
  // clipped lemon tree (variant 1: an agave). Collides 1.3 (cover).
  D.terraces_urn = {
    desc: 'Garden urn on a limestone pedestal (0.75 square, 0.7 high) with a big terracotta urn and a clipped lemon tree (variant 1 agave). Collides 1.3 m (cover).',
    params: {}, variants: 2, mount: 'ground',
    build(B, o) {
      const sc = K.stoneLt, v = (o.variant ?? 0) % 2;
      B.box('paint', sc, 0.82, 0.12, 0.82, 0, 0.06, 0, { r: 0.02 });
      B.box('paint', shade(sc, 0.96), 0.66, 0.5, 0.66, 0, 0.37, 0, { r: 0.02 });
      B.box('paint', sc, 0.8, 0.1, 0.8, 0, 0.67, 0, { r: 0.02 });
      B.lathe('paint', K.terra, [[0, 0], [0.22, 0], [0.18, 0.08], [0.34, 0.2], [0.42, 0.42], [0.4, 0.56], [0.46, 0.6], [0.46, 0.66], [0, 0.66]], 0, 0.72, 0, { seg: 16 });
      B.tor(NS('paint'), K.terraDk, 0.41, 0.025, 0, 1.06, 0, { rx: HP, ts: 16, rs: 3 });
      if (v === 0) {
        B.cyl('wood', K.bark, 0.04, 0.6, 0, 1.6, 0, { seg: 5 });
        cluster(B, 0, 2.15, 0, 0.5, 0.45, 0.5, 8, 0.3, K.leafDk, K.leaf, Math.round((o.pos?.[0] ?? 1) * 11), 'foliage', {});
        dots(B, 0, 2.15, 0, 0.5, 0.42, 0.5, 12, 0.05, K.lemon, Math.round((o.pos?.[2] ?? 1) * 7), NS('paint'), -0.4);
      } else for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; B.tube('foliage', '#7f9e9a', [P3(0, 1.3, 0), P3(Math.cos(a) * 0.35, 1.7, Math.sin(a) * 0.35), P3(Math.cos(a) * 0.6, 1.8, Math.sin(a) * 0.6)], (t) => 0.06 * (1 - t) + 0.01, { radial: 4 }); }
      colBox(B, 0, 0, 0, 0.82, 1.35, 0.82);
      B.blob(1.2, 1.2);
    },
  };
  // a lemon picker's hand cart: two wheels, shafts down, crates of lemons stacked on the bed. Collides 1.25 (cover).
  D.terraces_lemoncart = {
    desc: "Lemon picker's hand cart along +X (shafts toward +X, resting on the ground): two spoked wheels, slatted bed with three crates of lemons stacked, a sack. Collides 1.25 m (cover).",
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.push(0, 0.62, 0, 0, 0, -0.08);
      B.box('wood', K.woodLt, 1.9, 0.08, 1.1, -0.1, 0, 0, { r: 0.02 });
      for (const z of [-0.55, 0.55]) B.box('wood', K.wood, 1.9, 0.22, 0.05, -0.1, 0.13, z, { r: 0.01 });
      for (const z of [-0.35, 0.35]) B.box('wood', K.wood, 1.6, 0.07, 0.07, 1.5, -0.08, z, { r: 0.015 });
      for (const [x, y, z] of [[-0.55, 0.24, -0.26], [-0.55, 0.24, 0.26], [0.1, 0.24, 0], [-0.55, 0.62, 0]]) {
        B.box('wood', '#c49b62', 0.6, 0.36, 0.46, x, y, z, { r: 0.02 });
        dots(B, x, y + 0.2, z, 0.24, 0.02, 0.18, 10, 0.05, K.lemon, Math.round(x * 13 + z * 7 + y * 3), NS('paint'), 0);
      }
      B.pop();
      for (const z of [-0.66, 0.66]) {
        B.tor('wood', K.woodDk, 0.5, 0.04, -0.2, 0.52, z, { rs: 5, ts: 18 });
        for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; B.cyl(NS('wood'), K.woodDk, 0.02, 0.48, -0.2 + Math.cos(a) * 0.24, 0.52 + Math.sin(a) * 0.24, z, { rz: a + HP, seg: 4 }); }
      }
      colBox(B, -0.1, 0, 0, 2.0, 1.25, 1.4);
      B.col(0.9, 0, -0.45, 2.3, 0.6, 0.45);
      B.blob(3.0, 1.8);
    },
  };
  function seg2(B, a, b, r) { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz); B.push((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.atan2(-dz, dx), 0, Math.atan2(dy, Math.hypot(dx, dz))); B.box('wood', K.woodLt, L, r, r, 0, 0, 0, { r: r * 0.3 }); B.pop(); }

  // wall fountain: limestone aedicule with a shell niche, lion-mask spout, semicircular basin (collides)
  D.terraces_fountain = {
    desc: 'Wall fountain (wall at z = 0, front +Z, 2.2 m wide): limestone back with pilasters, pediment and a shell niche, lion-mask spout pouring into a semicircular basin on a moulded base, majolica name tile, mossy streak. Basin collides (0.8 high).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const sc = K.stoneLt, W = 2.2;
      B.box('paint', sc, W, 2.5, 0.16, 0, 1.25, 0.08, { r: 0.03 });
      for (const sx of [-1, 1]) B.box('paint', shade(sc, 0.97), 0.26, 2.3, 0.26, sx * (W / 2 - 0.13), 1.15, 0.13, { r: 0.03 });
      B.box('paint', sc, W + 0.2, 0.16, 0.34, 0, 2.38, 0.17, { r: 0.04 });
      B.add('paint', tpl('ped', () => extrudeGeo([[-0.5, 0], [0.5, 0], [0, 1]], 1, 0.004)), sc, 0, 2.46, 0.17, { ry: HP, sz: W + 0.2, sy: 0.4, sx: 0.34 });
      // shell niche
      B.add('paint', cylGeo(0.5, 0.5, 0.06, 16, false, -HP, PI), shade(sc, 0.9), 0, 1.75, 0.16, { rx: HP });
      for (let i = 0; i < 9; i++) { const a = (i / 8) * PI; B.box(NS('paint'), shade(sc, 1.04), 0.04, 0.46, 0.03, Math.cos(a) * 0.24, 1.75 + Math.sin(a) * 0.24, 0.2, { rz: a - HP, r: 0.01 }); }
      // lion mask + spout + water
      B.sph('paint', shade(sc, 0.95), 0.18, 0, 1.35, 0.18, { ws: 12, hs: 8, sz: 0.6 });
      for (const sx of [-1, 1]) B.sph(NS('paint'), shade(sc, 0.8), 0.03, sx * 0.07, 1.42, 0.27, { ws: 6, hs: 4 });
      B.cyl('metal', K.brass, 0.022, 0.18, 0, 1.3, 0.3, { rx: HP, seg: 8 });
      B.tube(NS('gloss'), '#bfe1ee', [P3(0, 1.3, 0.38), P3(0, 1.22, 0.46), P3(0, 1.0, 0.5), P3(0, 0.7, 0.51)], (t) => 0.018 + 0.01 * t, { radial: 6 });
      // basin
      const bR = 0.85;
      B.add('paint', tpl('fbasin', () => { const g = new THREE.CylinderGeometry(bR, bR - 0.06, 0.62, 20, 1, false, -HP, PI); return g; }), sc, 0, 0.31 + 0.12, 0.16, {});
      B.box('paint', shade(sc, 0.92), W - 0.1, 0.12, 0.3, 0, 0.06, 0.15, { r: 0.02 });
      B.add(NS('gloss'), cylGeo(bR - 0.08, bR - 0.08, 0.02, 20, false, -HP, PI), '#5f8e98', 0, 0.68, 0.16, {});
      B.tor(NS('paint'), shade(sc, 1.02), bR, 0.05, 0, 0.74, 0.16, { rx: HP, arc: PI, ts: 16, rs: 5, rz: 0 });
      plaqueU(B, 0, 2.07, 'ACQUA', { h: 0.08, w: 0.56 });
      pbox(B, NS('paint'), '#8a9a74', 0.18, 0.5, 0.01, 0.35, 0.9, 0.165);
      B.col(-bR, 0, 0, bR, 0.8, bR + 0.16);
      B.col(-W / 2, 0, 0, W / 2, 2.5, 0.3, ROOF);
    },
  };

  // ------------------------------------------------------------------------------------------ street furniture
  D.terraces_lamppost = {
    desc: 'Cast-iron street lamp (3.4 m): fluted post on a moulded base, a lantern with glowing panes under a crown; wall: true = the same lantern on a scroll wall bracket (wall at z = 0).',
    params: { wall: 'bool', height: 'm (3.4)' }, variants: 1, mount: 'ground|wall',
    build(B, o) {
      if (o.wall) { lanternU(B, 0, 0); return; }
      const Hh = o.height ?? 3.4, ic = K.iron;
      B.lathe('metal', ic, [[0, 0], [0.18, 0], [0.18, 0.05], [0.13, 0.12], [0.12, 0.4], [0.08, 0.5], [0.07, 0.55], [0, 0.55]], 0, 0, 0, { seg: 10 });
      B.lathe('metal', ic, [[0.065, 0.55], [0.05, 0.8], [0.045, Hh - 0.45], [0.07, Hh - 0.4], [0, Hh - 0.4]], 0, 0, 0, { seg: 8 });
      const ly = Hh - 0.1;
      B.box('glow', K.lamp, 0.24, 0.32, 0.24, 0, ly, 0, { r: 0.02, glow: 1.6 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pbox(B, NS('metal'), ic, 0.03, 0.36, 0.03, sx * 0.125, ly, sz * 0.125);
      B.lathe('metal', ic, [[0, 0.16], [0.2, 0.16], [0.18, 0.2], [0.05, 0.34], [0, 0.36]], 0, ly, 0, { seg: 4, ry: P / 4 });
      B.lathe(NS('metal'), ic, [[0, -0.26], [0.1, -0.2], [0.13, -0.16], [0, -0.16]], 0, ly, 0, { seg: 4 });
      B.sph(NS('metal'), K.gold, 0.035, 0, ly + 0.4, 0, { ws: 6, hs: 4 });
      B.col(-0.12, 0, -0.12, 0.12, Hh - 0.4, 0.12, ROOF);
      B.blob(0.6, 0.6);
    },
  };
  // café set: round marble-top table on an iron base, 2–3 bistro chairs, optional parasol (cream / blue)
  D.terraces_cafe = {
    desc: 'Café set: round marble table on a cast-iron base, three bistro chairs with cane seats, an espresso cup + a glass of limoncello; variant 1 adds a cream-and-blue parasol. Collider covers table + chairs (0.75 m).',
    params: {}, variants: 2, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 2, ic = K.iron;
      B.cyl('gloss', '#ece8e0', 0.36, 0.035, 0, 0.74, 0, { seg: 16 });
      B.lathe('metal', ic, [[0, 0], [0.22, 0], [0.2, 0.03], [0.05, 0.08], [0.035, 0.2], [0.03, 0.7], [0.08, 0.72], [0, 0.72]], 0, 0, 0, { seg: 8 });
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + (o.seed ?? 0.4), cx = Math.cos(a) * 0.62, cz = Math.sin(a) * 0.62;
        B.push(cx, 0, cz, -a - HP);
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.cyl(NS('metal'), ic, 0.012, 0.46, sx * 0.16, 0.23, sz * 0.16, { seg: 4 });
        B.cyl('wood', K.woodLt, 0.2, 0.04, 0, 0.47, 0, { seg: 10 });
        B.tube('metal', ic, [P3(-0.16, 0.47, -0.16), P3(-0.17, 0.8, -0.2), P3(0, 0.84, -0.22), P3(0.17, 0.8, -0.2), P3(0.16, 0.47, -0.16)], 0.012, { radial: 4 });
        B.pop();
      }
      B.cyl(NS('gloss'), K.white2, 0.03, 0.04, 0.12, 0.78, 0.05, { seg: 8 });
      B.cyl(NS('gloss'), K.lemon, 0.02, 0.06, -0.1, 0.79, -0.08, { seg: 6 });
      if (v) {
        B.cyl('metal', K.woodLt, 0.022, 2.35, 0, 1.17, 0, { seg: 6 });
        const R = 1.25, n = 8;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, g = new GB(), c = i % 2 ? col(K.blue) : col(K.cloth);
          const p0 = g.v(0, 2.42, 0, 0, 1, 0, c.r, c.g, c.b), p1 = g.v(Math.cos(a0) * R, 2.05, Math.sin(a0) * R, Math.cos(a0) * 0.3, 1, Math.sin(a0) * 0.3, c.r, c.g, c.b), p2 = g.v(Math.cos(a1) * R, 2.05, Math.sin(a1) * R, Math.cos(a1) * 0.3, 1, Math.sin(a1) * 0.3, c.r, c.g, c.b);
          g.tri(p0, p1, p2);
          B.add('foliage', tpl('parasol|' + i, () => g.geo()), 'white', 0, 0, 0, {});
        }
      }
      B.col(-0.85, 0, -0.85, 0.85, 0.75, 0.85, ROOF);
      B.blob(1.9, 1.9);
    },
  };
  // stone bench with a majolica-tiled back (the tiles are painted boxes)
  D.terraces_bench = {
    desc: 'Limestone bench (2 m along +X, seat faces +Z) on two scroll supports, the backrest faced with majolica tiles (lemon + blue pattern). Collides 0.5 m (the back 0.95).',
    params: { length: 'm (2)', back: 'bool (true)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 2, sc = K.stoneLt;
      for (const sx of [-1, 1]) B.box('paint', sc, 0.14, 0.42, 0.5, sx * (L / 2 - 0.2), 0.21, 0, { r: 0.04 });
      B.box('paint', sc, L, 0.1, 0.52, 0, 0.47, 0, { r: 0.03 });
      if (o.back !== false) {
        B.box('paint', sc, L, 0.5, 0.1, 0, 0.77, -0.24, { r: 0.03 });
        const n = Math.round((L - 0.2) / 0.2);
        for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) {
          const tx = -L / 2 + 0.2 + i * 0.2, ty = 0.66 + k * 0.2;
          pbox(B, NS('gloss'), (i + k) % 2 ? K.majWhite : K.majBlue, 0.185, 0.185, 0.01, tx, ty, -0.185);
          if ((i + k) % 2) B.sph(NS('gloss'), K.majYel, 0.045, tx, ty, -0.18, { ws: 6, hs: 4, sz: 0.2 });
        }
        B.col(-L / 2, 0, -0.3, L / 2, 1.0, -0.18);
      }
      B.col(-L / 2, 0, -0.26, L / 2, 0.52, 0.26);
    },
  };

  // ================================================================================================ landmarks
  // unit pediment (triangle 1 wide x 1 high in the geometry's z/y plane, 1 long along x): place with ry: HP, sz = width, sy = height, sx = depth
  const pedGeo = () => tpl('ped', () => extrudeGeo([[-0.5, 0], [0.5, 0], [0, 1]], 1, 0.004));
  // majolica dome: hemisphere (+ a slight ogee to the lantern) in glazed tiles, zig-zag bands of lemon / green / cobalt
  function domeGeo(R, Hd, seg, rings) {
    return tpl(['dome', R, Hd, seg, rings].map(kf).join('|'), () => {
      const g = new GB(), cols = [col(K.majYel), col(K.majGreen), col(K.majBlue), col('#e9e1c8')];
      for (let j = 0; j < rings; j++) {
        const t0 = j / rings, t1 = (j + 1) / rings;
        const pt = (t) => { const a = t * HP; return [R * Math.cos(a) * (1 - 0.12 * t * t), Hd * Math.sin(a)]; };
        const [r0, y0] = pt(t0), [r1, y1] = pt(t1);
        const nrm = (t) => { const a = t * HP; const nx = Math.cos(a) / R, ny = Math.sin(a) / Hd, l = Math.hypot(nx, ny); return [nx / l, ny / l]; };
        const n0 = nrm(t0), n1 = nrm(t1);
        for (let k = 0; k < seg; k++) {
          const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU;
          // zig-zag chevron bands (lemon / green / cobalt) climbing the dome, a cream band at the top
          const tri = Math.abs((k % 8) - 4) * 0.5, band = Math.floor((j + tri) / 1.5) % 4, c = j >= rings - 1 ? cols[3] : cols[[0, 1, 0, 2][band]];
          const kk = 0.92 + 0.12 * hash(j * 31 + k);
          const v = (r, y, a, n) => g.v(r * Math.cos(a), y, r * Math.sin(a), n[0] * Math.cos(a), n[1], n[0] * Math.sin(a), c.r * kk, c.g * kk, c.b * kk);
          g.quad(v(r0, y0, a0, n0), v(r0, y0, a1, n0), v(r1, y1, a1, n1), v(r1, y1, a0, n1));
        }
      }
      return g.geo();
    });
  }
  // ---- San Vito: dresses the chapel block (x ±5.5, z ±3, from the sagrato top 1.2 up to 5.8) and the sagrato
  D.terraces_chapel = {
    desc: 'Chapel of San Vito (single, self-symmetric; pos = piazza centre): limewashed block dressing with stone quoins, plinth and cornice, a baroque facade at each end (studded door in a stone frame, rose window, pilasters, curved gable) crowned by a bell gable with two bells, tall arched side windows, a flat roof with coping round an octagonal drum and a majolica-tiled dome with a lantern and cross; the sagrato gets stone edge coping and a lantern post at each corner. Drum/dome, bell gables and lantern posts collide as off-limits tops (roof).',
    params: { open: 'Tower Command: open at the base (layout.js SAN_VITO_OPEN) — an arcade of three arches on each long side, a starry ceiling inside' },
    variants: 1, mount: 'ground',
    build(B, o = {}) {
      B.aoBase = null;
      const W = 11, Dd = 6, y0 = 1.2, wc = K.white, sc = K.stoneLt, open = !!o.open;
      // (open) the arcade along a long side (layout.js SV): [x0, x1] of each opening under the lintel, the solid parts;
      // the open chapel stands 0.6 m taller (SV.y1; its arcade 4.0 m clear), dS: how much higher its arches spring
      const SV = TERRAIN.SV, SPR = SV.spring, TH = SV.depth, [pa, pb] = SV.pier, ew = W / 2 - SV.wall;
      const y1 = open ? SV.y1 : 5.8, dS = SPR - 4.6, NQ = open ? Math.round((y1 - y0 - 0.34) / 0.55) : 8;
      const BAYS = [[-ew, -pb], [-pa, pa], [pb, ew]], SOLID = [[-W / 2, -ew], [-pb, -pa], [pa, pb], [ew, W / 2]];
      // sagrato: limestone coping on the platform edge + corner lanterns
      for (const side of [0, 1, 2, 3]) onFace(B, 16, 10, side, (L) => {
        B.box('paint', sc, L + 0.06, 0.06, 0.38, 0, y0 + 0.01, -0.16, { r: 0.02 });
        B.box(NS('paint'), K.stone, L, 0.14, 0.03, 0, y0 - 0.09, 0.015, { r: 0.01 });
      });
      for (const [sx, sz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) sub(B, 'terraces_lamppost', sx * 7.55, y0, sz * 4.55, 0, { height: 3.2 });
      // plinth, quoins, cornice on all faces
      for (const side of [0, 1, 2, 3]) onFace(B, W, Dd, side, (L) => {
        if (open && side % 2 === 0) for (const [a, b] of SOLID) B.box('paint', K.stone, b - a + (Math.abs(a) > 5 || Math.abs(b) > 5 ? 0.05 : 0.1), 0.34, 0.08, (a + b) / 2, y0 + 0.17, 0.04, { r: 0.02 });
        else B.box('paint', K.stone, L + 0.1, 0.34, 0.08, 0, y0 + 0.17, 0.04, { r: 0.02 });
        for (const sx of [-1, 1]) for (let k = 0; k < NQ; k++) { const yy = y0 + 0.34 + k * 0.55; B.box('paint', sc, k % 2 ? 0.5 : 0.36, 0.5, 0.06, sx * (L / 2 - (k % 2 ? 0.25 : 0.18)), yy + 0.26, 0.03, { r: 0.015 }); }
        B.box('paint', sc, L + 0.3, 0.2, 0.3, 0, y1 - 0.1, 0.1, { r: 0.04 });
        B.box(NS('paint'), shade(sc, 0.95), L + 0.18, 0.12, 0.2, 0, y1 - 0.26, 0.06, { r: 0.03 });
        B.box(NS('paint'), shade(wc, 0.93), L + 0.1, 0.35, 0.03, 0, y1 - 0.55, 0.015, { r: 0.01 });
      });
      // long sides: three tall arched windows between pilaster strips, a lantern at each end — or (open) three arches
      if (open) {
        for (const side of [0, 2]) onFace(B, W, Dd, side, () => {
          for (const [a, b] of BAYS) {
            // a segmental arch under the lintel: its spandrels fill the opening's top corners through the wall, a stone
            // archivolt and keystone on the face, moulded imposts on the piers
            const c = b - a, xm = (a + b) / 2, rise = 0.7, crown = SPR - 0.12, ys = crown - rise, Rr = (c * c / 4 + rise * rise) / (2 * rise), cy = crown - Rr;
            const arc = []; for (let i = 0; i <= 16; i++) { const x = a + (c * i) / 16; arc.push([x, cy + Math.sqrt(Math.max(0, Rr * Rr - (x - xm) * (x - xm)))]); }
            B.add('paint', tpl('svspan|' + c.toFixed(2), () => extrudeGeo([...arc.map(([x, y]) => [x - xm, y - ys]), [c / 2, SPR - ys], [-c / 2, SPR - ys]], TH, 0.01)), wc, xm, ys, -TH / 2, { ry: HP });
            B.tube('paint', sc, arc.map(([x, y]) => P3(x, y + 0.04, 0.035)), 0.09, { radial: 6 });
            B.box('paint', sc, 0.26, 0.36, 0.12, xm, crown + 0.08, 0.05, { r: 0.02 });
            for (const x of [a, b]) B.box('paint', sc, 0.7, 0.12, TH + 0.06, x + (x === a ? -0.3 : 0.3), ys - 0.06, 0.03 - TH / 2, { r: 0.02 });
          }
          for (const x of [-(pa + pb) / 2, (pa + pb) / 2]) B.box('paint', shade(wc, 0.97), 0.34, 2.2 + dS, 0.06, x, y0 + 0.34 + (2.2 + dS) / 2, 0.03, { r: 0.015 });
          lanternU(B, -(ew + W / 2) / 2, y0 + 2.6 + dS); lanternU(B, (ew + W / 2) / 2, y0 + 2.6 + dS);
        });
        // inside: a starry blue ceiling, two lanterns over the side bays, a votive niche on each end wall
        const iz = Dd / 2 - TH;
        B.box(NS('paint'), '#2d4a73', ew * 2 - 0.04, 0.03, iz * 2 - 0.04, 0, SPR - 0.015, 0, { r: 0.005 });
        for (let k = 0; k < 40; k++) B.sph(NS('metal'), K.gold, 0.035, (ew - 0.3) * (2 * hash(k * 5.7 + 2) - 1), SPR - 0.04, (iz - 0.2) * (2 * hash(k * 3.3 + 7) - 1), { ws: 5, hs: 3 });
        for (const x of [-(ew + pb) / 2, (ew + pb) / 2]) {
          B.cyl(NS('metal'), K.iron, 0.012, 0.42, x, SPR - 0.21, 0, { seg: 4 });
          B.box('glow', K.lamp, 0.22, 0.3, 0.22, x, SPR - 0.6, 0, { r: 0.02, glow: 1.4 });
          B.lathe('metal', K.iron, [[0, 0.15], [0.17, 0.15], [0.15, 0.19], [0.04, 0.3], [0, 0.32]], x, SPR - 0.6, 0, { seg: 4, ry: P / 4 });
        }
        for (const s of [-1, 1]) { B.push(s * ew, 0, 0, s > 0 ? -HP : HP); nicheU(B, 0, y0 + 1.0); B.pop(); }
      } else for (const side of [0, 2]) onFace(B, W, Dd, side, () => {
        for (const x of [-3.2, 0, 3.2]) {
          archU(B, x, y0 + 1.25, 0.9, 2.3, { inside: '#39424a', frame: sc });
          pbox(B, NS('gloss'), '#56687a', 0.8, 1.6, 0.01, x, y0 + 2.05, 0.012);
          for (let k = 1; k < 4; k++) pbox(B, NS('metal'), K.iron, 0.8, 0.02, 0.015, x, y0 + 1.25 + k * 0.45, 0.02);
          B.box('paint', sc, 1.2, 0.08, 0.18, x, y0 + 1.2, 0.09, { r: 0.02 });
        }
        for (const x of [-1.6, 1.6]) B.box('paint', shade(wc, 0.97), 0.34, y1 - y0 - 0.9, 0.06, x, y0 + 0.34 + (y1 - y0 - 0.9) / 2, 0.03, { r: 0.015 });
        lanternU(B, -4.6, y0 + 2.9); lanternU(B, 4.6, y0 + 2.9);
      });
      // facades at ±X
      for (const side of [1, 3]) onFace(B, W, Dd, side, (L) => {
        for (const sx of [-1, 1]) B.box('paint', sc, 0.42, y1 - y0 - 0.5, 0.14, sx * 1.75, y0 + 0.34 + (y1 - y0 - 0.84) / 2, 0.07, { r: 0.02 });
        // studded door in a stone frame with a little pediment
        const dw = 1.5, dh = 2.7;
        pbox(B, NS('paint'), K.dark, dw, dh - dw / 2, 0.01, 0, y0 + (dh - dw / 2) / 2, 0.005);
        for (const s2 of [-1, 1]) {
          B.box('wood', K.woodDk, dw / 2 - 0.02, dh - dw / 2 - 0.02, 0.06, s2 * dw / 4, y0 + (dh - dw / 2) / 2, 0.04, { r: 0.01 });
          for (let r = 0; r < 5; r++) for (let c2 = 0; c2 < 3; c2++) B.sph(NS('metal'), K.brass, 0.018, s2 * (0.12 + c2 * 0.22), y0 + 0.3 + r * 0.42, 0.075, { ws: 5, hs: 3 });
        }
        B.add('wood', cylGeo(dw / 2 - 0.02, dw / 2 - 0.02, 0.06, 14, false, -HP, PI), K.woodDk, 0, y0 + dh - dw / 2, 0.04, { rx: HP });
        B.tube('paint', sc, Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * PI; return P3(Math.cos(a) * (dw / 2 + 0.1), y0 + dh - dw / 2 + Math.sin(a) * (dw / 2 + 0.1), 0.05); }), 0.11, { radial: 6 });
        for (const s2 of [-1, 1]) B.box('paint', sc, 0.22, dh - dw / 2, 0.1, s2 * (dw / 2 + 0.11), y0 + (dh - dw / 2) / 2, 0.05, { r: 0.02 });
        B.add('paint', pedGeo(), sc, 0, y0 + dh + 0.12, 0.14, { ry: HP, sz: 2.3, sy: 0.34, sx: 0.28 });
        B.box('paint', sc, 2.4, 0.1, 0.3, 0, y0 + dh + 0.08, 0.14, { r: 0.02 });
        // rose window with a majolica ring
        const ry = open ? y1 - 1.05 : y0 + 3.55;   // (under the frieze)
        B.tor('paint', sc, 0.55, 0.09, 0, ry, 0.05, { ts: 24, rs: 6 });
        B.add(NS('gloss'), cylGeo(0.5, 0.5, 0.02, 20), '#4c6174', 0, ry, 0.02, { rx: HP });
        for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; pbox(B, NS('paint'), sc, 0.05, 0.5, 0.03, Math.cos(a) * 0.24, ry + Math.sin(a) * 0.24, 0.04, { rz: a + HP }); }
        B.sph(NS('paint'), sc, 0.08, 0, ry, 0.05, { ws: 8, hs: 5 });
        for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; B.box(NS('gloss'), k % 2 ? K.majYel : K.majBlue, 0.12, 0.12, 0.02, Math.cos(a) * 0.72, ry + Math.sin(a) * 0.72, 0.02, { rz: a, r: 0.01 }); }
        // SAN VITO on the frieze
        letters(B, 'SAN VITO', { h: 0.22, x: 0, y: y1 - 0.66, z: 0.035, c: K.stoneDk, wt: 0.2, track: 0.2, dep: 0.04 });
        // curved baroque gable above the cornice (both sides of the bell gable)
        for (const s2 of [-1, 1]) {
          const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(P3(s2 * (2.95 - t * 1.3), y1 + 0.05 + Math.sin(t * HP) * 0.7, 0.02)); }
          B.tube('paint', sc, pts, 0.1, { radial: 6 });
          B.add('paint', tpl('chgab', () => { const pr = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pr.push([-(2.95 - t * 1.3), Math.sin(t * HP) * 0.7]); } pr.push([-1.65, 0]); return extrudeGeo(pr.map(([a, b]) => [a, b]).reverse().map(([a, b]) => [a, b]), 0.3, 0.01); }), wc, 0, y1 + 0.02, -0.1, { ry: HP, sx: s2 });
          B.lathe('paint', sc, [[0, 0], [0.12, 0], [0.12, 0.05], [0.06, 0.1], [0.12, 0.22], [0.03, 0.36], [0, 0.37]], s2 * 2.95, y1 + 0.02, 0.02, { seg: 10 });
        }
        // bell gable (campanile a vela): wall with two arched openings, two bronze bells, a cornice and a cross
        const gy = y1 - 0.05, gw = 3.1, gh = 2.7, gz = -0.25;
        B.push(0, 0, gz);
        B.box('paint', wc, gw, 0.9, 0.46, 0, gy + 0.45, 0, { r: 0.04 });
        for (const sx of [-1, 0, 1]) B.box('paint', wc, sx ? 0.5 : 0.42, gh - 0.9, 0.46, sx * (gw / 2 - 0.25), gy + 0.9 + (gh - 0.9) / 2, 0, { r: 0.04 });
        for (const sx of [-0.73, 0.73]) {
          B.add('paint', tpl('bgarch', () => { const pr = []; for (let i = 0; i <= 10; i++) { const a = (i / 10) * PI; pr.push([Math.cos(a) * 0.5, Math.sin(a) * 0.4]); } pr.push([-0.5, 0.62], [0.5, 0.62]); return extrudeGeo(pr.map(([x, y]) => [x, y]), 0.46, 0.01); }), wc, sx, gy + gh - 0.62 - 0.02, 0, { ry: HP });
          B.lathe('metal', K.brass, [[0, 0], [0.24, 0], [0.26, 0.04], [0.2, 0.1], [0.16, 0.3], [0.14, 0.42], [0.06, 0.47], [0, 0.48]], sx, gy + 1.05, 0, { seg: 12 });
          B.cyl(NS('metal'), K.iron, 0.02, 0.7, sx, gy + 1.62, 0, { rz: HP, seg: 5 });
        }
        B.box('paint', sc, gw + 0.2, 0.14, 0.56, 0, gy + gh + 0.05, 0, { r: 0.04 });
        B.add('paint', pedGeo(), wc, 0, gy + gh + 0.12, 0, { ry: HP, sz: gw + 0.1, sy: 0.4, sx: 0.5 });
        B.box('metal', K.iron, 0.06, 0.7, 0.06, 0, gy + gh + 0.85, 0, { r: 0.01 });
        B.box('metal', K.iron, 0.36, 0.06, 0.06, 0, gy + gh + 0.98, 0, { r: 0.01 });
        B.pop();
      });
      B.col(5.1, y1, -1.6, 5.6, y1 + 2.8, 1.6, ROOF); B.col(-5.6, y1, -1.6, -5.1, y1 + 2.8, 1.6, ROOF);
      // roof (off-limits: the chapel block is `roof` in layout.js): coping, drum + majolica dome + lantern
      for (const side of [0, 2]) onFace(B, W, Dd, side, (L) => { B.box('paint', sc, L - 1.2, 0.24, 0.3, 0, y1 + 0.12, -0.18, { r: 0.05 }); });
      const dR = 2.0;
      B.lathe('paint', wc, [[0, 0], [dR + 0.25, 0], [dR + 0.25, 0.2], [dR, 0.22], [dR, 1.05], [dR + 0.14, 1.1], [dR + 0.14, 1.22], [0, 1.22]], 0, y1, 0, { seg: 8, ry: PI / 8 });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; B.push(Math.cos(a) * (dR * 0.93), y1 + 0.35, Math.sin(a) * (dR * 0.93), -a + HP); archU(B, 0, 0, 0.36, 0.62, { inside: '#39424a', frame: sc }); B.pop(); }
      B.add('gloss', domeGeo(dR + 0.02, 2.0, 48, 14), 'white', 0, y1 + 1.2, 0, {});
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + PI / 8; const pts = []; for (let i = 0; i <= 8; i++) { const t = (i / 8) * HP; pts.push(P3(Math.cos(a) * Math.cos(t) * (dR + 0.06) * (1 - 0.12 * (t / HP) ** 2), y1 + 1.2 + Math.sin(t) * 2.02, Math.sin(a) * Math.cos(t) * (dR + 0.06) * (1 - 0.12 * (t / HP) ** 2))); } B.tube(NS('paint'), sc, pts, 0.05, { radial: 4 }); }
      const ly = y1 + 3.15;
      B.cyl('paint', wc, 0.4, 0.75, 0, ly + 0.37, 0, { seg: 8 });
      for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; pbox(B, NS('paint'), '#39424a', 0.16, 0.4, 0.02, Math.cos(a) * 0.4, ly + 0.4, Math.sin(a) * 0.4, { ry: -a + HP }); }
      B.add('gloss', domeGeo(0.46, 0.4, 12, 4), 'white', 0, ly + 0.75, 0, {});
      B.sph('metal', K.brass, 0.07, 0, ly + 1.2, 0, { ws: 8, hs: 6 });
      B.box('metal', K.iron, 0.05, 0.62, 0.05, 0, ly + 1.5, 0, { r: 0.01 });
      B.box('metal', K.iron, 0.3, 0.05, 0.05, 0, ly + 1.62, 0, { r: 0.01 });
      B.col(-dR - 0.2, y1, -dR - 0.2, dR + 0.2, y1 + 3.2, dR + 0.2, ROOF);
    },
  };
  // ---- San Vito's tempietto (Zone Control build, layout.js SINGLE): the chapel opened up into a round colonnade on
  // the deeper sagrato (16 x 12) — the centre zone is the whole open platform. Eight Tuscan columns on a 3.4 m circle
  // (set between the axes, so the stairs and the long sides look straight through), an entablature ring with a
  // majolica frieze, a starry vault inside, an attic drum and the majolica dome with its lantern (all off-limits roof).
  D.terraces_tempietto = {
    desc: 'San Vito tempietto (single, self-symmetric; pos = piazza centre; Zone Control): eight limestone Tuscan columns on a 3.4 m circle carrying an entablature ring (majolica frieze, moulded cornice), a starry blue vault with a hanging lantern, an attic drum with oculi, the chevron majolica dome, lantern and cross; the 16 x 12 sagrato coping and corner lamps. Columns collide; the canopy is an off-limits roof.',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      B.aoBase = null;
      const y0 = 1.2, Rc = 3.4, wc = K.white, sc = K.stoneLt;
      // sagrato: limestone coping on the platform edge + corner lamps (as the chapel's, on the deeper platform)
      for (const side of [0, 1, 2, 3]) onFace(B, 16, 12, side, (L) => {
        B.box('paint', sc, L + 0.06, 0.06, 0.38, 0, y0 + 0.01, -0.16, { r: 0.02 });
        B.box(NS('paint'), K.stone, L, 0.14, 0.03, 0, y0 - 0.09, 0.015, { r: 0.01 });
      });
      for (const [sx, sz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) sub(B, 'terraces_lamppost', sx * 7.55, y0, sz * 5.55, 0, { height: 3.2 });
      // columns: square plinth, torus base, a shaft with entasis, necking, echinus, abacus
      const shaft = [[0, 0], [0.25, 0], [0.252, 1.1], [0.238, 2.3], [0.214, 3.33], [0, 3.33]];
      const yCap = y0 + 0.16 + 0.16 + 3.33 + 0.3;   // 5.15: underside of the entablature
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + PI / 8, x = Math.cos(a) * Rc, z = Math.sin(a) * Rc;
        B.box('paint', sc, 0.7, 0.16, 0.7, x, y0 + 0.08, z, { r: 0.02, ry: -a });
        B.lathe('paint', sc, [[0, 0], [0.31, 0], [0.315, 0.05], [0.28, 0.11], [0.26, 0.16], [0, 0.16]], x, y0 + 0.16, z, { seg: 16 });
        B.lathe('paint', wc, shaft, x, y0 + 0.32, z, { seg: 16 });
        B.tor(NS('paint'), sc, 0.225, 0.03, x, y0 + 0.32 + 3.3, z, { rx: HP, rs: 5, ts: 16 });
        B.lathe('paint', sc, [[0, 0], [0.22, 0], [0.3, 0.1], [0.33, 0.16], [0, 0.16]], x, y0 + 0.32 + 3.33, z, { seg: 16 });
        B.box('paint', sc, 0.72, 0.14, 0.72, x, yCap - 0.07, z, { r: 0.015, ry: -a });
        colBox(B, x, y0, z, 0.6, yCap - y0, 0.6, true);
      }
      // entablature ring: architrave, majolica frieze, cornice (the soffit and inner face close it)
      const yE = yCap;
      B.lathe('paint', sc, [[3.0, 0], [3.72, 0], null, [3.72, 0], [3.72, 0.24], null, [3.72, 0.24], [3.6, 0.26], null, [3.0, 0.64], [3.0, 0]], 0, yE, 0, { seg: 40 });
      B.lathe('gloss', K.majBlue, [[3.62, 0.26], [3.62, 0.46]], 0, yE, 0, { seg: 40 });
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * TAU;
        B.box(NS('gloss'), k % 2 ? K.majYel : K.majWhite, 0.2, 0.12, 0.02, Math.cos(a) * 3.635, yE + 0.36, Math.sin(a) * 3.635, { ry: -a + HP, rz: P / 4, r: 0.01 });
      }
      B.lathe('paint', sc, [[3.6, 0.46], [3.95, 0.52], null, [3.95, 0.52], [3.95, 0.64], null, [3.95, 0.64], [3.0, 0.64]], 0, yE, 0, { seg: 40 });
      // the vault inside: deep blue with gilt stars, a lantern hanging on a chain (lit at dusk)
      B.lathe('paint', '#2d4a73', [[0, 1.05], [1.5, 0.95], [2.5, 0.55], [3.0, 0.02]], 0, yE, 0, { seg: 32 });
      for (let k = 0; k < 44; k++) {
        const rr = 0.4 + 2.4 * Math.sqrt(hash(k * 7.3)), a = hash(k * 3.1 + 1) * TAU, yy = rr < 1.5 ? 1.05 - (0.1 * rr) / 1.5 : rr < 2.5 ? 0.95 - (0.4 * (rr - 1.5)) : 0.55 - 1.06 * (rr - 2.5);
        B.sph(NS('metal'), K.gold, 0.035, Math.cos(a) * rr, yE + yy - 0.035, Math.sin(a) * rr, { ws: 5, hs: 3 });
      }
      for (let k = 0; k < 6; k++) B.tor(NS('metal'), K.iron, 0.035, 0.009, 0, yE + 0.98 - k * 0.09, 0, { rs: 3, ts: 6, ry: (k % 2) * HP });
      B.box('glow', K.lamp, 0.26, 0.34, 0.26, 0, yE + 0.22, 0, { r: 0.02, glow: 1.6 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pbox(B, NS('metal'), K.iron, 0.03, 0.38, 0.03, sx * 0.135, yE + 0.22, sz * 0.135);
      B.lathe('metal', K.iron, [[0, 0.17], [0.2, 0.17], [0.18, 0.21], [0.05, 0.34], [0, 0.36]], 0, yE + 0.22, 0, { seg: 4, ry: P / 4 });
      B.lathe(NS('metal'), K.iron, [[0, -0.27], [0.1, -0.21], [0.13, -0.17], [0, -0.17]], 0, yE + 0.22, 0, { seg: 4 });
      // attic drum with oculi, a stone ring, the majolica dome + ribs, lantern and cross
      const yA = yE + 0.64, dR = 3.1, yD = yA + 0.6;
      B.lathe('paint', wc, [[3.3, 0], [3.3, 0.08], null, [3.3, 0.08], [dR + 0.05, 0.1], null, [dR + 0.05, 0.1], [dR + 0.05, 0.5], null, [dR + 0.05, 0.5], [dR + 0.18, 0.54], null, [dR + 0.18, 0.54], [dR + 0.18, 0.6], null, [dR + 0.18, 0.6], [0, 0.6]], 0, yA, 0, { seg: 40 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        B.push(Math.cos(a) * (dR + 0.06), yA + 0.3, Math.sin(a) * (dR + 0.06), -a + HP);
        B.add(NS('paint'), cylGeo(0.13, 0.13, 0.01, 12), '#39424a', 0, 0, 0.0, { rx: HP });
        B.tor(NS('paint'), sc, 0.15, 0.03, 0, 0, 0.01, { rs: 4, ts: 12 });
        B.pop();
      }
      B.add('gloss', domeGeo(dR + 0.02, 2.5, 56, 14), 'white', 0, yD, 0, {});
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + PI / 8, pts = [];
        for (let i = 0; i <= 8; i++) { const t = (i / 8) * HP, f = (dR + 0.06) * (1 - 0.12 * (t / HP) ** 2); pts.push(P3(Math.cos(a) * Math.cos(t) * f, yD + Math.sin(t) * 2.52, Math.sin(a) * Math.cos(t) * f)); }
        B.tube(NS('paint'), sc, pts, 0.06, { radial: 4 });
      }
      const ly = yD + 2.42;
      B.cyl('paint', wc, 0.48, 0.8, 0, ly + 0.4, 0, { seg: 8 });
      for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; pbox(B, NS('paint'), '#39424a', 0.18, 0.44, 0.02, Math.cos(a) * 0.48, ly + 0.42, Math.sin(a) * 0.48, { ry: -a + HP }); }
      B.add('gloss', domeGeo(0.55, 0.45, 12, 4), 'white', 0, ly + 0.8, 0, {});
      B.sph('metal', K.brass, 0.08, 0, ly + 1.3, 0, { ws: 8, hs: 6 });
      B.box('metal', K.iron, 0.06, 0.7, 0.06, 0, ly + 1.65, 0, { r: 0.01 });
      B.box('metal', K.iron, 0.34, 0.06, 0.06, 0, ly + 1.78, 0, { r: 0.01 });
      // the canopy is an off-limits roof: a round-ish stack of boxes (entablature + drum, dome, lantern)
      const R0 = 3.95, Rd = R0 * 0.415, Rx = R0 * 0.707;
      for (const [hx, hz] of [[R0, Rd], [Rd, R0], [Rx, Rx]]) B.col(-hx, yE, -hz, hx, yA + 0.6, hz, ROOF);
      for (const [hx, hz] of [[2.9, 1.2], [1.2, 2.9], [2.1, 2.1]]) B.col(-hx, yA + 0.6, -hz, hx, yD + 1.6, hz, ROOF);
      B.col(-1.3, yD + 1.6, -1.3, 1.3, ly + 1.4, 1.3, ROOF);
    },
  };

  // ---- funicular: track (rails, sleepers, rollers), the car, the two stations -------------------------------
  const INC = Math.atan2(4.8, 28), INCL = Math.hypot(4.8, 28);
  D.terraces_track = {
    desc: 'Funicular track dressing on the incline ramp (pos = low end on the track centre-line, local +Z uphill along the ramp, rise/run given): timber sleepers every 0.7 m, two steel rails (gauge 1.0), cable rollers on the centre-line with the haul cable, a buffer stop at the bottom, a low kerb along the stair side. Flush (≤ 9 cm): walk over.',
    params: { run: 'm (28)', rise: 'm (4.8)', buffer: 'bool (true): the buffer stop at the low end' }, variants: 1, mount: 'ground',
    build(B, o) {
      const run = o.run ?? 28, rise = o.rise ?? 4.8, a = Math.atan2(rise, run), L = Math.hypot(rise, run);
      B.push(0, 0, 0, 0, -a);
      const n = Math.floor((L - 0.4) / 0.7);
      for (let i = 0; i <= n; i++) B.box('wood', mixc(K.woodDk, '#6d5a48', hash(i)), 1.6, 0.05, 0.22, 0, 0.022, 0.3 + i * 0.7, { r: 0.012 });
      for (const sx of [-0.5, 0.5]) {
        B.box('metal', '#7b7670', 0.07, 0.06, L - 0.2, sx, 0.075, L / 2, { r: 0.01 });
        pbox(B, NS('metal'), '#b9b6ae', 0.05, 0.01, L - 0.2, sx, 0.108, L / 2);
      }
      for (let z = 1.5; z < L - 0.5; z += 3.2) { B.cyl(NS('metal'), '#8c8c86', 0.07, 0.24, 0, 0.09, z, { rz: HP, seg: 8 }); pbox(B, NS('metal'), K.iron, 0.3, 0.05, 0.1, 0, 0.03, z); }
      B.cyl(NS('metal'), '#3c3b38', 0.015, L - 1.0, 0, 0.17, L / 2, { rx: HP, seg: 4 });
      B.pop();
      // buffer stop at the low end: two sprung buffers on a steel frame (not where the track runs on down another reach)
      if (o.buffer === false) return;
      B.box('metal', K.iron, 1.6, 0.5, 0.2, 0, 0.35, -0.25, { r: 0.02 });
      for (const sx of [-0.45, 0.45]) { B.cyl('metal', '#c6a23c', 0.1, 0.25, sx, 0.45, -0.05, { rx: HP, seg: 10 }); B.cyl('metal', K.iron, 0.14, 0.04, sx, 0.45, 0.08, { rx: HP, seg: 12 }); }
      for (let k = 0; k < 5; k++) pbox(B, NS('paint'), k % 2 ? K.iron : '#d8b24a', 0.3, 0.12, 0.01, -0.6 + k * 0.3, 0.48, -0.14, { rz: 0.6 });
      B.col(-0.8, 0, -0.35, 0.8, 0.6, -0.15);
    },
  };
  // funicular car on the incline (pos = centre of its footprint on the track centre-line at track height there,
  // local +Z uphill): stepped body (three level compartments), Pompeian red with a cream window band, glazed stepped
  // ends, roof with a destination board, bogies on the rails, headlamps. Collides as three stepped boxes.
  D.terraces_funicar = {
    desc: 'Funicular car standing on the incline (pos = centre of the car on the track at track height, local +Z uphill; slope from rise/run): stepped three-compartment body in Pompeian red and cream, glazed stepped ends with wipers, sliding doors, number 2, roof boards reading FUNICOLARE, bogies on the rails, lamps. Three stepped colliders.',
    params: { run: 'm (28)', rise: 'm (4.8)', name: 'board text' }, variants: 1, mount: 'ground',
    build(B, o) {
      const a = Math.atan2(o.rise ?? 4.8, o.run ?? 28), ta = Math.tan(a);
      const Lc = 5.4, Wc = 1.9, red = '#a84a3d', cream = '#efe3c8', roofC = '#5b5f63', ncomp = 3, cl = Lc / ncomp;
      // chassis + bogies (in the slope frame)
      B.push(0, 0, 0, 0, -a);
      B.box('metal', K.iron, Wc - 0.3, 0.22, Lc - 0.3, 0, 0.38, 0, { r: 0.03 });
      for (const bz of [-Lc / 2 + 0.8, Lc / 2 - 0.8]) {
        B.box('metal', '#3a3c40', 1.3, 0.2, 1.0, 0, 0.26, bz, { r: 0.03 });
        for (const sx of [-0.5, 0.5]) for (const dz of [-0.3, 0.3]) B.cyl('metal', '#55585c', 0.14, 0.08, sx, 0.2, bz + dz, { rz: HP, seg: 12 });
      }
      B.pop();
      // level compartments stepping up the slope
      for (let i = 0; i < ncomp; i++) {
        const cz = -Lc / 2 + cl * (i + 0.5), yb = 0.5 + cz * ta, Hc = 2.25;
        B.box('paint', red, Wc, 1.0, cl + 0.02, 0, yb + 0.5, cz, { r: 0.05 });
        B.box('paint', cream, Wc + 0.02, 0.85, cl + 0.02, 0, yb + 1.43, cz, { r: 0.03 });
        B.box('paint', red, Wc + 0.02, 0.16, cl + 0.02, 0, yb + 1.94, cz, { r: 0.02 });
        B.box('paint', roofC, Wc + 0.12, 0.12, cl + 0.1, 0, yb + Hc - 0.06, cz, { r: 0.04 });
        for (const sx of [-1, 1]) {
          pbox(B, NS('gloss'), K.glassLt, 0.02, 0.62, cl - 0.4, sx * (Wc / 2 + 0.012), yb + 1.44, cz);
          pbox(B, NS('paint'), red, 0.025, 0.05, cl - 0.3, sx * (Wc / 2 + 0.015), yb + 1.08, cz);
          pbox(B, NS('paint'), shade(red, 0.8), 0.02, 0.9, 0.03, sx * (Wc / 2 + 0.014), yb + 0.55, cz - cl / 2 + 0.25);
        }
        // step between compartments: a riser panel
        if (i > 0) pbox(B, 'paint', red, Wc, cl * ta + 0.02, 0.04, 0, yb + Hc - cl * ta / 2, cz - cl / 2);
      }
      // stepped glazed ends
      for (const e of [-1, 1]) {
        const z = e * (Lc / 2 + 0.01), yb = 0.5 + e * (Lc / 2 - cl / 2) * ta;
        pbox(B, NS('gloss'), K.glassLt, Wc - 0.3, 0.8, 0.02, 0, yb + 1.45, z);
        B.box('paint', cream, Wc, 0.1, 0.05, 0, yb + 1.0, z, { r: 0.02 });
        for (const sx of [-0.6, 0.6]) { B.cyl(NS('glow'), K.lamp, 0.07, 0.03, sx, yb + 0.75, z + e * 0.02, { rx: HP, seg: 10, glow: 1.6 }); B.cyl(NS('metal'), K.iron, 0.09, 0.05, sx, yb + 0.75, z, { rx: HP, seg: 10 }); }
        pbox(B, NS('metal'), K.iron, 0.02, 0.5, 0.01, -0.3, yb + 1.5, z + e * 0.015, { rz: 0.4 });
        B.push(0, yb + 0.35, z + e * 0.03, e > 0 ? 0 : PI);
        letters(B, '2', { h: 0.28, x: 0, y: 0, z: 0, c: cream, flat: true, wt: 0.22 });
        B.pop();
      }
      // roof destination board (both sides) on the middle compartment
      const yr = 0.5 + 2.25;
      B.box('paint', '#2f3a4a', 0.08, 0.34, 2.6, 0, yr + 0.22, 0, { r: 0.02 });
      for (const sx of [-1, 1]) { B.push(sx * 0.045, yr + 0.1, 0, sx * HP); letters(B, o.name ?? 'FUNICOLARE', { h: 0.17, x: 0, y: 0, z: 0, c: '#f0d78a', flat: true, wt: 0.2, track: 0.14, mat: 'glow', glow: 1.0 }); B.pop(); }
      for (const dz of [-0.9, 0.9]) B.box('metal', K.iron, 0.05, 0.12, 0.05, 0, yr + 0.02, dz, { r: 0.01 });
      // colliders: one per compartment (world-axis boxes; the car sits along local Z)
      for (let i = 0; i < ncomp; i++) {
        const cz = -Lc / 2 + cl * (i + 0.5), yb = 0.5 + cz * ta;
        B.col(-Wc / 2, yb - 0.6, cz - cl / 2, Wc / 2, yb + 2.25, cz + cl / 2, ROOF);
      }
    },
  };
  // station canopy (lower station at the foot of the incline): four iron columns, a tiled hip roof, the FUNICOLARE
  // sign, a ticket booth with a timetable, a turnstile, a bench
  D.terraces_station = {
    desc: 'Funicular station canopy (pos = centre, canopy w along X, d along Z): cast-iron columns, a coppi-tiled hip roof on a timber frame with a scalloped valance, a lit FUNICOLARE sign board on the +Z eave, a timetable board and clock on a column; booth: true adds the ticket booth (collides). Columns collide.',
    params: { w: 'm (3.4)', d: 'm (3.6)', h: 'm eaves (2.9)', booth: 'bool', sign: 'text', clock: 'bool' }, variants: 1, mount: 'ground',
    build(B, o) {
      const W = o.w ?? 3.4, Dd = o.d ?? 3.6, Hh = o.h ?? 2.9, ic = K.iron;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = sx * (W / 2 - 0.15), z = sz * (Dd / 2 - 0.15);
        B.lathe('metal', ic, [[0, 0], [0.13, 0], [0.13, 0.12], [0.07, 0.2], [0.055, 0.35], [0.05, Hh - 0.3], [0.09, Hh - 0.15], [0.12, Hh], [0, Hh]], x, 0, z, { seg: 8 });
        colBox(B, x, 0, z, 0.24, Hh, 0.24, true);
      }
      for (const sz of [-1, 1]) B.box('wood', K.chestnut, W + 0.1, 0.16, 0.1, 0, Hh + 0.08, sz * (Dd / 2 - 0.15), { r: 0.02 });
      for (const sx of [-1, 1]) B.box('wood', K.chestnut, 0.1, 0.16, Dd + 0.1, sx * (W / 2 - 0.15), Hh + 0.08, 0, { r: 0.02 });
      // hip roof: four sloped tiled panels
      const rise = 0.9, ov = 0.4;
      B.add('paint', tpl(['hip', W, Dd, rise, ov].map(kf).join('|'), () => {
        const g = new GB(), c = col(K.coppi), hw = W / 2 + ov, hd = Dd / 2 + ov, rl = Math.max(0, hw - hd);
        const A = [-hw, 0, -hd], Bq = [hw, 0, -hd], C = [hw, 0, hd], Dq = [-hw, 0, hd], R0 = [-rl, rise, 0], R1 = [rl, rise, 0];
        const face = (pts) => { const e1 = pts[1].map((v, i) => v - pts[0][i]), e2 = pts[2].map((v, i) => v - pts[0][i]); let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(...n); n = n.map((v) => v / l); if (n[1] < 0) n = n.map((v) => -v); const ids = pts.map((p) => g.v(p[0], p[1], p[2], n[0], n[1], n[2], c.r, c.g, c.b)); if (ids.length === 3) g.tri(ids[0], ids[1], ids[2]); else g.quad(ids[0], ids[1], ids[2], ids[3]); };
        face([A, Bq, R1, R0]); face([Bq, C, R1]); face([C, Dq, R0, R1]); face([Dq, A, R0]);
        return g.geo();
      }), 'white', 0, Hh + 0.18, 0, {});
      for (const sz of [-1, 1]) B.add(NS('foliage'), cylGeo(0.05, 0.05, W + 2 * ov, 6), K.coppiDk, 0, Hh + 0.18, sz * (Dd / 2 + ov), { rz: HP });
      // sign on the +Z eave
      const sy = Hh + 0.55;
      B.box('paint', '#2f4a66', 2.6, 0.42, 0.06, 0, sy, Dd / 2 + ov + 0.05, { r: 0.03 });
      B.box(NS('paint'), K.gold, 2.52, 0.34, 0.01, 0, sy, Dd / 2 + ov + 0.082, { r: 0.02 });
      B.box(NS('paint'), '#2f4a66', 2.46, 0.28, 0.01, 0, sy, Dd / 2 + ov + 0.086, { r: 0.02 });
      B.push(0, sy - 0.08, Dd / 2 + ov + 0.092); letters(B, o.sign ?? 'FUNICOLARE', { h: 0.16, x: 0, y: 0, z: 0, c: '#f3e2b0', flat: true, wt: 0.2, track: 0.16, mat: 'glow', glow: 1.1 }); B.pop();
      if (o.clock !== false) {
        const cx = W / 2 - 0.15, cz = Dd / 2 - 0.15;
        B.cyl('metal', ic, 0.24, 0.12, cx, Hh - 0.45, cz + 0.2, { rx: HP, seg: 16 });
        B.cyl(NS('paint'), K.white2, 0.2, 0.01, cx, Hh - 0.45, cz + 0.265, { rx: HP, seg: 16 });
        pbox(B, NS('paint'), K.iron, 0.02, 0.14, 0.01, cx, Hh - 0.4, cz + 0.275);
        pbox(B, NS('paint'), K.iron, 0.1, 0.02, 0.01, cx + 0.04, Hh - 0.45, cz + 0.275);
      }
      if (o.booth) {
        const bx = o.boothX ?? (-W / 2 + 0.7), bz = o.boothZ ?? 0;
        B.box('paint', K.stoneLt, 1.2, 1.1, 1.3, bx, 0.55, bz, { r: 0.04 });
        B.box('paint', '#2f4a66', 1.24, 0.9, 1.34, bx, 1.55, bz, { r: 0.03 });
        pbox(B, NS('gloss'), K.glassLt, 1.26, 0.6, 0.9, bx, 1.6, bz);
        B.box('paint', K.coppi, 1.5, 0.12, 1.6, bx, 2.08, bz, { r: 0.04 });
        B.box('wood', K.woodLt, 0.5, 0.05, 0.3, bx + 0.7, 1.08, bz, { r: 0.01 });
        B.push(bx + 0.63, 2.2, bz, HP); letters(B, 'BIGLIETTI', { h: 0.1, x: 0, y: 0, z: 0, c: '#2f4a66', flat: false, dep: 0.03, wt: 0.2 }); B.pop();
        colBox(B, bx, 0, bz, 1.3, 2.1, 1.4, true);
      }
    },
  };

  // ---- backdrop kit (outside the arena): simple houses, cypresses, stone pines, rock masses ------------------
  function backHouse(B, x, y, z, w, d, h, o = {}) {
    const wc = o.c ?? K.white, ry = o.ry ?? 0;
    B.push(x, y, z, ry);
    B.box(NS('paint'), wc, w, h, d, 0, h / 2, 0, { r: 0.08 });
    // windows on the front (+Z) and the side (+X): flat dark openings + shutters
    const nw = Math.max(1, Math.floor(w / 1.6)), nf = Math.max(1, Math.floor((h - 0.6) / 2.6));
    for (let f = 0; f < nf; f++) for (let i = 0; i < nw; i++) {
      if (hash(x * 3 + i * 7 + f * 13 + z) < 0.2) continue;
      const wx = -w / 2 + (i + 0.5) * (w / nw), wy = 0.9 + f * 2.6, sh = hash(x + i + f) > 0.5 ? K.blue : K.green;
      pbox(B, NS('paint'), K.dark, 0.7, 1.05, 0.02, wx, wy + 0.52, d / 2 + 0.005);
      if (hash(i * 5 + f + x) > 0.35) for (const s2 of [-1, 1]) pbox(B, NS('paint'), sh, 0.36, 1.05, 0.03, wx + s2 * 0.55, wy + 0.52, d / 2 + 0.015);
      if (o.lit && hash(i * 11 + f * 3 + x + z) > 0.55) pbox(B, NS('glow'), K.lamp, 0.6, 0.5, 0.01, wx, wy + 0.7, d / 2 + 0.012, { glow: 1.1 });
    }
    if (o.roof === 'gable') {
      const rise = Math.min(w, d) * 0.26, al = w >= d, L = al ? w : d, dd = al ? d : w;
      B.push(0, 0, 0, al ? 0 : HP);
      B.add(NS('paint'), tpl(['gpr', dd, rise].map(kf).join('|'), () => extrudeGeo([[-dd / 2, 0], [dd / 2, 0], [0, rise]], 1, 0.001)), wc, 0, h, 0, { sx: L });
      const pitch = Math.atan2(rise, dd / 2), sl = Math.hypot(rise, dd / 2) + 0.25;
      for (const s of [-1, 1]) { B.push(0, h + rise / 2, (s * dd) / 4, 0, s * pitch); B.box(NS('paint'), mixc(K.coppi, K.terraDk, hash(x + z) * 0.5), L + 0.4, 0.12, sl, 0, 0.06, s * 0.12, { r: 0.03 }); B.pop(); }
      B.pop();
    } else {
      B.box(NS('paint'), shade(wc, 0.95), w + 0.1, 0.22, d + 0.1, 0, h + 0.05, 0, { r: 0.05 });
      if (o.pergola) { for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pbox(B, NS('paint'), wc, 0.2, 2.1, 0.2, sx * (w / 2 - 0.3), h + 1.05, sz * (d / 2 - 0.3)); cluster(B, 0, h + 2.25, 0, w * 0.4, 0.2, d * 0.4, 5, 0.7, K.leafDk, K.vine, Math.round(x * 3 + z), NS('foliage'), { low: true, flat: 0.4 }); }
      if (o.vault) vaultRoof(B, 0, 0, w * 0.7, d * 0.7, h + 0.1, 0.8, { wall: wc });
    }
    B.pop();
  }
  function cypress(B, x, y, z, h, seed = 1, mat = 'foliage') {
    B.cyl(NS('wood'), K.barkDk, 0.1, 0.8, x, y + 0.4, z, { seg: 6 });
    const n = Math.max(4, Math.round(h / 0.9));
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), r = 0.62 * Math.sin(Math.min(1, 0.25 + t * 0.95) * PI) * (0.55 + 0.45 * (1 - t)) + 0.08;
      B.add(mat, puff(Math.max(0, det(B) - 1), (seed + i) % 6), mixc('#2c4a2c', '#4b6b3c', t * 0.7 + 0.2 * hash(seed + i)), x + 0.06 * Math.sin(seed + i), y + 0.6 + t * (h - 0.9), z + 0.06 * Math.cos(seed + i * 2), { s: r, sy: h / n * 0.95, ry: hash(i + seed) * TAU, ao: false });
    }
  }
  function stonePine(B, x, y, z, h, seed = 1) {
    B.tube(NS('wood'), K.bark, [P3(x, y, z), P3(x + 0.3, y + h * 0.5, z + 0.1), P3(x + 0.1, y + h * 0.85, z - 0.1)], (t) => 0.2 - 0.1 * t, { radial: 6 });
    cluster(B, x + 0.1, y + h, z, 2.4, 0.5, 2.4, 9, 1.0, '#34502e', '#5f7d42', seed, NS('foliage'), { flat: 0.45 });
  }
  // faceted rock (icosahedron, jittered corners, flat facets, darker underside): tufa / limestone boulders
  function rockGeo(seed) {
    return tpl('rock|' + seed, () => {
      const g = new THREE.IcosahedronGeometry(1, 1);   // polyhedra are non-indexed: every facet keeps its own corners
      const P = g.attributes.position, pos = [];
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const n = 0.8 + 0.34 * hash(Math.round(x * 9) * 3.1 + Math.round(y * 9) * 1.7 + Math.round(z * 9) * 2.3 + seed * 5.1);
        pos.push(x * n, y * n * (y > 0.5 ? 0.8 : 1), z * n);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const C = new Float32Array(P.count * 3);
      for (let i = 0; i < P.count; i += 3) {
        const y = (pos[i * 3 + 1] + pos[i * 3 + 4] + pos[i * 3 + 7]) / 3, k = 0.72 + 0.28 * Math.max(0, Math.min(1, (y + 0.8) / 1.6)) + 0.1 * (hash(i + seed) - 0.5);
        for (let v = 0; v < 3; v++) { C[(i + v) * 3] = k; C[(i + v) * 3 + 1] = k * 0.99; C[(i + v) * 3 + 2] = k * 0.95; }
      }
      geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(P.count * 2), 2));
      return geo;
    });
  }
  function rockMass(B, x, y, z, sx, sy, sz, seed, c = K.tufa) {
    B.add(NS('paint'), rockGeo(seed % 9), mixc(c, '#a89a82', hash(seed) * 0.5), x, y, z, { sx, sy, sz, ry: hash(seed * 3) * TAU, ao: false });
  }
  D.terraces_cypress = {
    desc: 'Italian cypress: a tall narrow dark-green flame on a short trunk (h 5–9 m). Trunk collides.',
    params: { height: 'm (7)', seed: 'shape' }, variants: 1, mount: 'ground',
    build(B, o) { cypress(B, 0, 0, 0, o.height ?? 7, o.seed ?? 3); colBox(B, 0, 0, 0, 0.5, 2.0, 0.5, true); B.blob(1.3, 1.3); },
  };
  // hillside rising behind a base (outside the arena, pos = centre of the back wall line at y 0, local −Z = away):
  // terraced garden walls, houses stepping up the slope with pitched coppi roofs and roof terraces, cypresses and
  // stone pines, a ruined watchtower on the crest
  D.terraces_hillside = {
    desc: 'Backdrop hillside behind a base (outside the arena; pos on the back wall line, the hill rises toward local −Z): scrubby slope and rock, terrace walls, ~14 whitewashed / ochre / pink houses stepping up with shutters, roofs and roof terraces, cypresses and stone pines, a round watchtower on the crest. Scenery only (no colliders).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      // ground mass: stepped terrace slabs (earth + limewashed retaining walls) rising away
      const tiers = [[-0.6, 7.5, 8.4], [-9, 10.5, 9], [-15, 13.5, 8], [-21, 16, 7], [-27, 18, 6]];
      let prev = 4.8;
      tiers.forEach(([z, top, dz], ti) => {
        // earth mass (scrubby top) behind a limewashed rubble terrace wall; ends taper into rock above the sea
        const Wt = 58 - ti * 3;
        B.box(NS('paint'), '#86905e', Wt, top + 2, dz, 0, (top - 2) / 2, z - dz / 2, { r: 0.2 });
        B.box(NS('paint'), mixc(K.stone, '#cbbd9f', ti * 0.15), Wt, top - prev + 0.4, 0.5, 0, prev + (top - prev) / 2 - 0.1, z + 0.2, { r: 0.05 });
        B.box(NS('paint'), K.stoneLt, Wt + 0.2, 0.18, 0.62, 0, top + 0.02, z + 0.2, { r: 0.04 });
        for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) rockMass(B, sx * (Wt / 2 + 0.6 + k * 1.3), (top - 2) * (1 - k * 0.22) - 0.8, z - dz * (0.2 + 0.2 * k), 2.4 + k * 0.4, (top + 1.8) * (0.55 - k * 0.08), dz * 0.42, ti * 13 + k * 5 + (sx > 0 ? 3 : 0));
        // olive groves on the terrace
        const n = 7 - ti;
        for (let i = 0; i < n; i++) {
          const x = -Wt / 2 + 3 + hash(ti * 17 + i * 3.3) * (Wt - 6), zz = z - dz * (0.25 + 0.5 * hash(ti * 5 + i * 7.1));
          B.tube(NS('wood'), K.bark, [P3(x, top, zz), P3(x + 0.2, top + 1.2, zz)], 0.12, { radial: 4 });
          cluster(B, x + 0.2, top + 1.9, zz, 1.3, 0.55, 1.3, 4, 0.7, K.oliveDk, K.olive, ti * 31 + i, NS('foliage'), { low: true, flat: 0.6 });
        }
        prev = top;
      });
      const houses = [
        [-19, 7.5, -5, 5, 4, 4.2, K.white, 'gable'], [-12, 7.5, -4.5, 4, 4.5, 5.0, K.ochre, 'flat'], [-5.5, 8.4, -6.5, 5.5, 4, 5.4, K.white, 'gable'],
        [3, 8.4, -6, 6, 4.5, 5.2, K.pink, 'flat'], [11, 7.5, -4.5, 4.5, 4, 4.4, K.white, 'gable'], [18, 7.5, -5, 5, 4.5, 3.8, K.sky, 'flat'],
        [-22, 10.5, -11, 5, 4, 4.4, K.ochre, 'flat'], [-14, 10.5, -12, 6, 4.5, 4.0, K.white, 'gable'], [-2, 10.5, -12, 5, 4, 5.6, K.white, 'flat'],
        [7, 10.5, -11.5, 4.5, 4, 4.6, K.lemon ?? K.ochre, 'gable'], [16, 10.5, -11, 5.5, 4.5, 4.2, K.white, 'gable'], [25, 10.5, -11, 4, 4, 3.6, K.pink, 'flat'],
        [-9, 13.5, -17, 5, 4.5, 4.4, K.white, 'gable'], [4, 13.5, -18, 6, 4, 4.0, K.ochre, 'flat'], [13, 13.5, -17, 4.5, 4, 4.8, K.white, 'gable'],
        [-20, 13.5, -17.5, 5, 4, 3.8, K.pink, 'gable'], [21, 13.5, -17, 5, 4, 4.0, K.white, 'flat'],
      ];
      houses.forEach(([x, y, z, w, d, h, c, roof], i) => backHouse(B, x, y, z, w, d, h, { c: c === K.lemon ? '#efe0a4' : c, roof, lit: true, pergola: roof === 'flat' && i % 3 === 0, vault: roof === 'flat' && i % 3 === 1 }));
      // watchtower on the crest
      B.lathe(NS('paint'), K.tufa, [[0, 0], [3.2, 0], [2.9, 6], [3.1, 6.2], [3.1, 7.2], [0, 7.2]], -6, 18, -30, { seg: 16 });
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; B.box(NS('paint'), K.tufa, 0.8, 0.7, 0.5, -6 + Math.cos(a) * 2.95, 25.5, -30 + Math.sin(a) * 2.95, { ry: -a, r: 0.05 }); }
      pbox(B, NS('paint'), K.dark, 0.5, 1.1, 0.1, -6, 21, -26.9);
      // trees
      const cyp = [[-24, 7.5, -2.5, 7], [-16.5, 7.5, -2.8, 6], [8, 7.5, -2.5, 7.5], [23, 7.5, -3, 6.5], [-9.5, 10.5, -8.5, 7], [12, 10.5, -8.5, 6], [0, 13.5, -14, 8], [-15, 13.5, -14.5, 6.5], [19, 13.5, -14.5, 7], [-11, 18, -26, 7], [2, 18, -25, 6]];
      cyp.forEach(([x, y, z, h], i) => cypress(B, x, y, z, h, i * 3 + 1, NS('foliage')));
      for (const [x, y, z, h, s] of [[-27, 10.5, -8, 5, 3], [27, 13.5, -15, 5.5, 5], [-25, 16, -21, 5, 7], [14, 16, -22, 6, 11], [26, 7.5, -3, 4.5, 13]]) stonePine(B, x, y, z, h, s);
      for (let i = 0; i < 26; i++) { const x = -30 + hash(i * 3.1) * 60, t = hash(i * 7.7); const tier = tiers[Math.min(4, Math.floor(t * 5))]; cluster(B, x, tier[1] + 0.3, tier[0] - tier[2] * (0.2 + 0.5 * hash(i)), 1.1, 0.5, 0.8, 3, 0.7, '#4a6336', '#7a8f4e', i * 5, NS('foliage'), { low: true, flat: 0.6 }); }
    },
  };
  // cliff below the arena's long edge (outside, pos = on the edge line at y 0, local +Z = out to sea): tufa rock face
  // falling to the water with ledges, prickly pear, agave, caper bushes, a fishing-hut cove with a rowing boat
  D.terraces_cliff = {
    desc: 'Sea cliff under a long arena edge (outside; pos = edge line, local +X along the edge for `length`, local +Z out to sea, top = the edge height at local x 0 → x L, linear): tufa rock slabs and boulders down to the water, ledges with prickly pear, agave and caper bushes, surf rocks. Scenery only.',
    params: { length: 'm', top0: 'm', top1: 'm', seed: 'n' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 20, t0 = o.top0 ?? 0, t1 = o.top1 ?? t0, seed = o.seed ?? 1, n = Math.ceil(L / 2.2);
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * (L / n), top = t0 + (t1 - t0) * (x / L), hh = top + 3.2;
        rockMass(B, x, top - hh / 2 - 0.25, 1.45 + 0.4 * hash(seed + i), 1.5 + 0.4 * hash(i + seed * 2), hh / 2 + 0.1, 1.2, seed * 7 + i);
        rockMass(B, x + 0.8, -1.4, 2.6 + 0.8 * hash(i * 3 + seed), 1.3 + 0.5 * hash(i), 0.9, 1.1, seed * 11 + i * 3, '#9c8f77');
        if (hash(seed * 5 + i) > 0.55) cluster(B, x, top - 0.5 - 1.5 * hash(i + 9), 1.4, 0.6, 0.35, 0.4, 3, 0.4, '#50663a', '#7c8f4c', seed + i, NS('foliage'), { low: true, flat: 0.7 });
        if (hash(seed * 9 + i) > 0.7) { // prickly pear: flat paddles
          const px = x + 0.3, py = top - 1.0 * hash(i), pz = 1.1;
          for (let k = 0; k < 6; k++) B.sph(NS('foliage'), '#6f8f4f', 0.22, px + (hash(k + i) - 0.5) * 0.5, py + 0.2 + k * 0.12, pz + (hash(k * 3 + i) - 0.5) * 0.3, { sx: 1, sy: 1.25, sz: 0.3, ry: hash(k) * PI, ws: 8, hs: 6 });
        }
      }
      for (let i = 0; i < Math.ceil(L / 3); i++) rockMass(B, (i + 0.3) * 3 + hash(i) * 1.5, -1.75, 4.2 + 1.2 * hash(i * 5 + seed), 1.0 + 0.6 * hash(i * 7), 0.5, 0.9, seed * 13 + i, '#8d8472');
    },
  };


  // ================================================================================================ the back of each base
  // hip roof over w x d at y (rise r): four coppi-coloured planes + ridge (for buildings seen from afar)
  function hipRoof(B, x, y, z, w, d, r, c = K.coppi, ov = 0.35) {
    B.add('paint', tpl(['hip2', w, d, r, ov].map(kf).join('|'), () => {
      const g = new GB(), cc = col('#ffffff'), hw = w / 2 + ov, hd = d / 2 + ov, rl = Math.max(0, hw - hd), rd = Math.max(0, hd - hw);
      const A = [-hw, 0, -hd], Bq = [hw, 0, -hd], C = [hw, 0, hd], Dq = [-hw, 0, hd], R0 = [-rl, r, -rd], R1 = [rl, r, rd];
      const face = (pts) => { const e1 = pts[1].map((v, i) => v - pts[0][i]), e2 = pts[2].map((v, i) => v - pts[0][i]); let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(...n) || 1; n = n.map((v) => v / l); if (n[1] < 0) n = n.map((v) => -v); const ids = pts.map((p) => g.v(p[0], p[1], p[2], n[0], n[1], n[2], cc.r, cc.g, cc.b)); if (ids.length === 3) g.tri(ids[0], ids[1], ids[2]); else g.quad(ids[0], ids[1], ids[2], ids[3]); };
      if (w >= d) { face([A, Bq, R1, R0]); face([Bq, C, R1]); face([C, Dq, R0, R1]); face([Dq, A, R0]); }
      else { face([A, Bq, R0]); face([Bq, C, R1, R0]); face([C, Dq, R1]); face([Dq, A, R0, R1]); }
      return g.geo();
    }), c, x, y, z, {});
    // tile courses as thin ribs across the slopes (read as coppi rows at a distance)
    B.box(NS('paint'), shade(c, 0.85), w + ov * 2 + 0.05, 0.08, 0.14, x, y + 0.02, z - d / 2 - ov, { r: 0.02 });
    B.box(NS('paint'), shade(c, 0.85), w + ov * 2 + 0.05, 0.08, 0.14, x, y + 0.02, z + d / 2 + ov, { r: 0.02 });
  }
  // ---- Villa Limoni: the spawn's backdrop (pos = centre of the back wall face, wall top at `top`, terrace at `floor`)
  D.terraces_villa = {
    desc: 'Villa Limoni (pos = centre of the back wall face, local z = 0 = the wall face, building behind): ground floor on the spawn terrace — a three-arched loggia with French doors, shuttered windows, lanterns, pots of lemons, VILLA LIMONI letters on the frieze; a set-back upper storey with balconies and a coppi hip roof, a belvedere tower (altana) with open arches on top, chimneys, a pergola roof garden and cypresses at the sides. The upper storey collides (camera-safe).',
    params: { floor: 'm (4.8)', top: 'm wall top (8.4)', w: 'm (20)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const F = o.floor ?? 4.8, T = o.top ?? 8.4, W = o.w ?? 20, wc = K.villa ?? '#f2e6cf', tc = K.stoneLt, sh = K.green, k = W / 20;
      // ground floor (on the playable face): plinth, pilasters, loggia arches + French doors, windows, cornice
      B.box('paint', K.stone, W, 0.3, 0.06, 0, F + 0.15, 0.03, { r: 0.015 });
      for (const x of [-9.7, -5.4, 5.4, 9.7]) B.box('paint', tc, 0.4, T - F - 0.3, 0.1, x * k, F + (T - F) / 2, 0.05, { r: 0.02 });
      for (const x of [-2.4 * k, 0, 2.4 * k]) {
        archU(B, x, F, 2.0 * k, 3.0, { inside: '#4a3f36', frame: tc });
        // French doors inside each arch: glazed leaves, a lit fanlight at dusk
        for (const s2 of [-1, 1]) { pbox(B, NS('paint'), sh, 0.66 * k, 2.0, 0.03, x + s2 * 0.36 * k, F + 1.0, 0.02); pbox(B, NS('gloss'), K.glass, 0.5 * k, 1.6, 0.01, x + s2 * 0.36 * k, F + 1.1, 0.036); }
        pbox(B, NS('glow'), K.lamp, 1.5 * k, 0.28, 0.01, x, F + 2.25, 0.02, { glow: 1.0 });
      }
      for (const x of [-7.55, 7.55]) windowU(B, x * k, F + 0.9, 1.0, 1.7, { shut: sh, grille: true, lit: 0.9 });
      for (const x of [-4.1, 4.1, -8.4, 8.4]) lanternU(B, x * k, F + 2.6);
      B.box('paint', tc, W + 0.3, 0.26, 0.34, 0, T - 0.13, 0.12, { r: 0.04 });
      B.box(NS('paint'), shade(wc, 0.94), W + 0.1, 0.5, 0.05, 0, T - 0.55, 0.025, { r: 0.01 });
      letters(B, 'VILLA LIMONI', { h: 0.36, x: 0, y: T - 0.72, z: 0.05, c: '#a0845a', wt: 0.19, track: 0.22, dep: 0.07, lit: 0.9, litC: '#ffe3a6' });
      // big terracotta pots with lemon trees against the facade
      for (const x of [-6.2, 6.2]) sub(B, 'terraces_potplant', x * k, F, 0.6, 0, { variant: 0 });
      for (const x of [-9.2, 9.2]) bougainU(B, x * k, F, T + 0.4, 1.6);
      // upper storey (behind the wall top) + roofs + altana
      const uz = -3.2, ud = 6.4, uh = 3.4;
      B.box('paint', wc, W - 1.2, uh, ud, 0, T + uh / 2, uz, { r: 0.06 });
      B.box('paint', tc, W - 0.9, 0.2, ud + 0.3, 0, T + uh, uz, { r: 0.04 });
      for (const x of [-7.2, -4.2, 4.2, 7.2]) windowU(B, x * k, T + 0.9, 0.9, 1.5, { shut: sh, lit: 0.9, frame: K.white2 });
      B.push(0, 0, uz + ud / 2);
      for (const x of [-7.2, -4.2, 4.2, 7.2]) windowU(B, x * k, T + 0.9, 0.9, 1.5, { shut: sh, lit: 0.9 });
      balconyU(B, 0, T + 0.6, 3.2, { shut: sh, lit: 0.9, trail: 0.8, flowers: K.bougain });
      B.pop();
      B.col(-1.6, T + 0.4, uz + ud / 2, 1.6, T + 1.6, uz + ud / 2 + 0.62, RAIL);
      hipRoof(B, -5.2 * k, T + uh + 0.1, uz, 7.8 * k, ud, 1.7);
      hipRoof(B, 5.2 * k, T + uh + 0.1, uz, 7.8 * k, ud, 1.7);
      // altana (belvedere tower) in the middle: open arches, balustraded roof, weather vane
      const az = uz, ay = T + uh;
      B.box('paint', wc, 3.4, 2.8, 3.4, 0, ay + 1.4, az, { r: 0.05 });
      for (let side = 0; side < 4; side++) { const a = side * HP; B.push(Math.sin(a) * 1.7, 0, az + Math.cos(a) * 1.7, a); archU(B, 0, ay + 0.35, 1.4, 2.1, { inside: '#3d3833', frame: tc }); B.pop(); }
      B.box('paint', tc, 3.8, 0.2, 3.8, 0, ay + 2.9, az, { r: 0.04 });
      hipRoof(B, 0, ay + 3.0, az, 3.4, 3.4, 1.2);
      B.cyl('metal', K.iron, 0.02, 1.2, 0, ay + 4.6, az, { seg: 5 });
      B.box('metal', K.iron, 0.5, 0.2, 0.02, 0.15, ay + 4.9, az, { r: 0.01 });
      for (const [x, z] of [[-8.2, uz - 1.5], [8.6, uz + 1.2]]) chimney(B, x * k, T + uh + 0.5, z, wc);
      // side wings stepping down + cypresses
      for (const s2 of [-1, 1]) {
        const wx = W / 2 + 1.6;
        B.box('paint', wc, 3.6, 2.6, 5.6, s2 * wx, T - 1.0 + 1.3, -3.2, { r: 0.05 });
        B.push(s2 * wx, 0, -3.2 + 2.8); windowU(B, 0, T + 0.1, 0.8, 1.2, { shut: sh }); B.pop();
        vaultRoof(B, s2 * wx, -3.2, 3.6, 5.6, T + 1.6, 0.7, { wall: wc, alongX: false });
        cypress(B, s2 * (wx + 2.8), T - 1.2, -2.2, 8.5, 5 + s2, NS('foliage'));
        cypress(B, s2 * (wx + 4.0), T - 1.4, -4.8, 7.2, 9 + s2, NS('foliage'));
      }
      B.col(-W / 2 + 0.6, T, uz - ud / 2, W / 2 - 0.6, T + uh, uz + ud / 2, ROOF);
      B.col(-W / 2, T, -0.6, W / 2, T + 0.3, 0.2, ROOF);
    },
  };
  // ---- upper funicular station (pos = centre of its back-wall face; the track's top end is at trackX, floor F):
  //      the engine house on the wall with a big arched portal over the track end, FUNICOLARE · STAZIONE letters,
  //      a clock, windows; a hip roof behind; a platform canopy is placed separately (terraces_station)
  D.terraces_upstation = {
    desc: 'Upper funicular station (pos = centre of the back-wall face, local z = 0 = wall face, building behind): engine-house facade with a big stone-framed arched portal at the track end (the haul-cable wheel visible inside), a clock under a little pediment, FUNICOLARE letters, windows with green shutters, a coppi hip roof and a chimney behind. Upper part collides.',
    params: { floor: 'm (4.8)', top: 'm (7.6)', w: 'm (14)', trackX: 'local x of the track (−5.77)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const F = o.floor ?? 4.8, T = o.top ?? 7.6, W = o.w ?? 14, tx = o.trackX ?? -5.77, wc = K.ochre, tc = K.stoneLt;
      B.box('paint', K.stone, W, 0.3, 0.06, 0, F + 0.15, 0.03, { r: 0.015 });
      // portal over the track end: dark tunnel mouth + stone arch, the cable wheel inside
      archU(B, tx, F - 0.02, 2.6, 2.75, { inside: '#2a2724', frame: tc });
      B.tor(NS('metal'), '#55585c', 0.7, 0.05, tx, F + 1.25, -0.25, { ts: 20, rs: 5 });
      for (let k = 0; k < 6; k++) pbox(B, NS('metal'), '#55585c', 0.04, 1.4, 0.04, tx, F + 1.25, -0.25, { rz: (k / 6) * PI });
      // windows + door along the rest of the facade
      const free = (x, hw) => Math.abs(x - tx) > 1.45 + hw && Math.abs(x) < W / 2 - hw - 0.2;
      for (const x of [-4.6, -1.6, 1.6, 4.6]) if (free(x, 0.75)) windowU(B, x, F + 0.9, 0.9, 1.25, { shut: K.green, lit: 0.9 });
      if (free(-3.4, 0.7)) doorU(B, -3.4, F, 1.1, 2.3, { leaf: K.greenDk });
      for (const x of [-2.5, 0.3, 3.1]) if (free(x, 0.2)) lanternU(B, x, F + 2.4);
      // cornice, FUNICOLARE letters, clock
      B.box('paint', tc, W + 0.3, 0.24, 0.3, 0, T - 0.12, 0.1, { r: 0.04 });
      const px = W < 10 ? 0 : 2.0, pw = Math.min(7.6, W - 0.2);
      B.box('paint', wc, pw, 0.62, 0.3, px, T + 0.31, -0.02, { r: 0.04 });
      B.box('paint', tc, pw + 0.2, 0.1, 0.36, px, T + 0.66, -0.02, { r: 0.03 });
      letters(B, 'FUNICOLARE', { h: W < 10 ? 0.32 : 0.36, x: px, y: T + 0.14, z: 0.13, c: '#2f4a66', wt: 0.2, track: 0.2, dep: 0.06, lit: 0.9, litC: '#ffe3a6' });
      const cy = T + (W < 10 ? 1.9 : 0.9);
      B.box('paint', wc, 2.2, 1.9, 0.5, tx, cy, -0.1, { r: 0.04 });
      B.add('paint', tpl('ped', () => extrudeGeo([[-0.5, 0], [0.5, 0], [0, 1]], 1, 0.004)), tc, tx, cy + 0.95, -0.1, { ry: HP, sz: 2.5, sy: 0.6, sx: 0.56 });
      B.cyl('paint', K.white2, 0.55, 0.06, tx, cy, 0.16, { rx: HP, seg: 24 });
      B.tor(NS('metal'), K.iron, 0.55, 0.03, tx, cy, 0.19, { ts: 24, rs: 4 });
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; pbox(B, NS('paint'), K.iron, 0.03, k % 3 ? 0.06 : 0.12, 0.01, tx + Math.cos(a) * 0.45, cy + Math.sin(a) * 0.45, 0.2, { rz: a + HP }); }
      pbox(B, NS('paint'), K.iron, 0.035, 0.36, 0.01, tx, cy + 0.15, 0.205, { rz: 0.4 });
      pbox(B, NS('paint'), K.iron, 0.035, 0.26, 0.01, tx + 0.08, cy - 0.06, 0.21, { rz: -1.9 });
      // engine house body + roof behind the wall
      B.box('paint', wc, W - 0.6, 2.2, 5.6, 0.2, T + 1.1, -3.0, { r: 0.06 });
      hipRoof(B, 0.2, T + 2.2, -3.0, W - 0.6, 5.6, 1.6);
      chimney(B, Math.min(4.0, W / 2 - 1), T + 2.6, -3.6, wc);
      B.col(-W / 2 + 0.3, T, -5.8, W / 2 - 0.1, T + 2.2, -0.2, ROOF);
    },
  };
  // ---- garden wall at the back of the pergola terrace: coping, a wrought-iron gate between piers, lemon trees and
  //      cypresses behind, bougainvillea spilling over
  D.terraces_gardenwall = {
    desc: 'Garden wall above a terrace (pos = centre of the wall face, local z = 0 = face; w long, from floor F to top T): stone coping, a wrought-iron gate between piers with ball finials, lemon trees + a cypress + a stone pine behind, bougainvillea spilling over, a majolica street plaque. Scenery (collider only on the gate piers).',
    params: { floor: 'm (4.8)', top: 'm (7.0)', w: 'm (14)', gateX: 'm (2)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const F = o.floor ?? 4.8, T = o.top ?? 7.0, W = o.w ?? 14, gx = o.gateX ?? 2, tc = K.stoneLt;
      B.box('paint', tc, W, 0.16, 0.42, 0, T + 0.02, -0.12, { r: 0.04 });
      B.box('paint', K.stone, W, 0.28, 0.06, 0, F + 0.14, 0.03, { r: 0.015 });
      // gate: dark garden beyond, iron bars with a scrolled top
      pbox(B, NS('paint'), '#3b4a33', 1.9, 2.2, 0.01, gx, F + 1.1, 0.005);
      for (let k = 0; k < 10; k++) { const x = gx - 0.85 + k * 0.19; B.cyl(NS('metal'), K.iron, 0.014, 2.2, x, F + 1.1, 0.06, { seg: 5 }); B.sph(NS('metal'), K.iron, 0.03, x, F + 2.25, 0.06, { ws: 5, hs: 4 }); }
      for (const yy of [0.3, 1.2, 2.0]) pbox(B, NS('metal'), K.iron, 1.9, 0.04, 0.03, gx, F + yy, 0.06);
      B.tube(NS('metal'), K.iron, Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * PI; return P3(gx + Math.cos(a) * 0.95, F + 2.25 + Math.sin(a) * 0.35, 0.06); }), 0.02, { radial: 4 });
      for (const s2 of [-1, 1]) {
        B.box('paint', K.white, 0.5, T - F + 0.45, 0.5, gx + s2 * 1.2, F + (T - F + 0.45) / 2, 0.1, { r: 0.04 });
        B.lathe('paint', tc, [[0, 0], [0.18, 0], [0.18, 0.06], [0.08, 0.12], [0.16, 0.26], [0.03, 0.42], [0, 0.43]], gx + s2 * 1.2, T + 0.45, 0.1, { seg: 10 });
        colBox(B, gx + s2 * 1.2, F, 0.1, 0.5, T - F, 0.5, true);
      }
      plaqueU(B, gx - 2.2, F + 2.2, 'GIARDINO', { h: 0.09 });
      // behind the wall: lemon trees, a cypress, a pine, the bougainvillea over the top
      for (const [x, z, s] of [[-5.5, -2, 1], [-1.5, -3, 2], [4.5, -2.5, 3], [-3.5, -5.5, 4], [2.5, -6, 5]]) {
        B.tube(NS('wood'), K.bark, [P3(x, T - 1.5, z), P3(x + 0.1, T + 0.6, z)], 0.08, { radial: 5 });
        cluster(B, x, T + 1.2, z, 1.3, 0.9, 1.3, 8, 0.6, K.leafDk, K.leaf, s * 7, 'foliage');
        dots(B, x, T + 1.2, z, 1.35, 0.95, 1.35, 12, 0.07, K.lemon, s * 11, NS('gloss'), -0.6);
      }
      cypress(B, -W / 2 + 1.2, T - 1.5, -1.6, 7.5, 21, NS('foliage'));
      stonePine(B, W / 2 - 2.5, T - 1.5, -4.5, 5.2, 17);
      bougainU(B, -3.5, T - 0.5, T + 0.6, 3.0);
      B.push(0, 0, 0); for (let i = 0; i < 9; i++) { const x = -3.5 + (hash(i * 2.3) - 0.5) * 3; B.add('foliage', puff(0, i % 6), mixc(K.bougain, K.bougainLt, hash(i)), x, T - 0.2 - hash(i * 5) * 1.3, 0.18, { s: 0.28, sy: 0.35, sz: 0.18, ao: false }); } B.pop();
    },
  };
  // ---- washing line between two walls (along +X): sagging line with shirts, sheets and towels, pegs
  D.terraces_laundry = {
    desc: 'Washing line strung along +X for `length` between two walls (pos = start, at the line height): a sagging cord with pegged shirts, sheets, towels and socks in soft colours (hung pieces are thin boxes). Non-colliding.',
    params: { length: 'm', sag: 'm (0.3)', posts: 'pole height m (0 = wall anchors)' }, variants: 2, mount: 'wall',
    build(B, o) {
      const L = o.length ?? 5, sag = o.sag ?? 0.3, seed = Math.round(L * 7 + (o.variant ?? 0) * 13);
      const yAt = (x) => -sag * 4 * (x / L) * (1 - x / L);
      const pts = []; for (let i = 0; i <= 10; i++) { const x = (i / 10) * L; pts.push(P3(x, yAt(x), 0)); }
      B.tube(NS('paint'), K.cream, pts, 0.006, { radial: 3 });
      if (o.posts) for (const px of [0, L]) { B.cyl('metal', K.ironLt, 0.03, o.posts + 0.1, px, -o.posts / 2 + 0.05, 0, { seg: 6 }); B.box(NS('metal'), K.ironLt, 0.04, 0.04, 0.5, px, 0.08, 0, { r: 0.01 }); B.col(px - 0.05, -o.posts, -0.05, px + 0.05, 0.1, 0.05, ROOF); }
      const cl = ['#f2eee6', '#9fc0d8', '#e8c9a8', '#f3d98c', '#c4d8b8', '#e0a8a0', '#ffffff', '#b8c4e8'];
      let x = 0.3 + hash(seed) * 0.3;
      while (x < L - 0.4) {
        const k = Math.floor(hash(seed + x * 13) * 4), c = cl[Math.floor(hash(seed * 3 + x * 7) * cl.length)];
        const w = [0.55, 1.1, 0.45, 0.16][k], h = [0.62, 0.9, 0.7, 0.26][k], y = yAt(x + w / 2);
        B.box(NS('foliage'), c, w, h, 0.012, x + w / 2, y - h / 2, 0, { r: 0.004, rz: (hash(x) - 0.5) * 0.08 });
        if (k === 0) for (const s2 of [-1, 1]) B.box(NS('foliage'), c, 0.16, 0.24, 0.012, x + w / 2 + s2 * (w / 2 + 0.06), y - 0.14, 0, { rz: s2 * 0.5, r: 0.004 });
        for (const px of [x + 0.03, x + w - 0.03]) pbox(B, NS('wood'), K.woodLt, 0.02, 0.07, 0.02, px, yAt(px) - 0.01, 0);
        x += w + 0.12 + hash(seed + x) * 0.3;
      }
    },
  };
  // ---- piazza well (pozzo): octagonal limestone curb, wrought-iron arch with a pulley, bucket; collides
  D.terraces_well = {
    desc: 'Village well: octagonal limestone curb (1.5 m, 0.9 high) with a moulded rim, a wrought-iron arch with scrolls and a pulley, a copper bucket on the rim, a pot of geraniums. Collides (0.9 m).',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      const R = 0.75, sc = K.stoneLt;
      B.lathe('paint', sc, [[0, 0], [R + 0.05, 0], [R + 0.05, 0.12], [R, 0.16], [R, 0.78], [R + 0.08, 0.82], [R + 0.08, 0.92], [R - 0.14, 0.92], [R - 0.14, 0.8], [0, 0.8]], 0, 0, 0, { seg: 8, ry: PI / 8 });
      B.cyl(NS('paint'), '#1f2a2e', R - 0.15, 0.01, 0, 0.84, 0, { seg: 8, ry: PI / 8 });
      for (const s2 of [-1, 1]) B.box('paint', sc, 0.24, 0.6, 0.3, s2 * (R - 0.02), 1.2, 0, { r: 0.03 });
      B.tube('metal', K.iron, Array.from({ length: 15 }, (_, i) => { const a = (i / 14) * PI; return P3(Math.cos(a) * (R - 0.02), 1.5 + Math.sin(a) * 0.95, 0); }), 0.025, { radial: 5 });
      for (const s2 of [-1, 1]) B.tube(NS('metal'), K.iron, [P3(s2 * 0.2, 1.8, 0), P3(s2 * 0.35, 2.1, 0), P3(s2 * 0.12, 2.3, 0), P3(0, 2.1, 0)], 0.012, { radial: 4 });
      B.cyl('metal', K.iron, 0.13, 0.05, 0, 2.3, 0, { rx: HP, seg: 12 });
      B.tube(NS('paint'), K.rope, [P3(0.13, 2.3, 0), P3(0.13, 1.3, 0)], 0.008, { radial: 3 });
      B.lathe('metal', '#b8733f', [[0, 0], [0.13, 0], [0.16, 0.24], [0, 0.24]], 0.55, 0.92, 0.2, { seg: 10 });
      pot(B, -0.45, 0.92, -0.35, 0.12, 0.18, K.terra);
      dots(B, -0.45, 1.16, -0.35, 0.13, 0.08, 0.13, 7, 0.03, K.geranium, 7, NS('paint'), -0.2);
      cluster(B, -0.45, 1.13, -0.35, 0.14, 0.06, 0.14, 3, 0.1, K.leafDk, K.leaf, 3, 'foliage', { low: true });
      B.col(-R - 0.08, 0, -R - 0.08, R + 0.08, 0.92, R + 0.08, ROOF);
      B.col(-R, 0.92, -0.15, -R + 0.2, 1.5, 0.15, ROOF); B.col(R - 0.2, 0.92, -0.15, R, 1.5, 0.15, ROOF);
      B.blob(2.2, 2.2);
    },
  };
  // ---- three-wheeled delivery truck with crates of lemons (cover)
  D.terraces_truck = {
    desc: 'Little three-wheeled delivery truck (front +X): rounded cab with a single headlamp, windscreen, handlebar inside, a flatbed with dropsides loaded with lemon crates and a basket. Collides (2.6 × 1.3 × 1.4).',
    params: { color: 'cab (sky blue)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const cc = o.color ?? '#7fa6b8', L = 2.6, Wd = 1.3;
      // wheels
      B.cyl('rubber', '#2a2a2c', 0.24, 0.16, 1.0, 0.24, 0, { rx: HP, seg: 14 });
      for (const s2 of [-1, 1]) B.cyl('rubber', '#2a2a2c', 0.24, 0.16, -0.75, 0.24, s2 * 0.52, { rx: HP, seg: 14 });
      for (const [x, z] of [[1.0, 0], [-0.75, 0.52], [-0.75, -0.52]]) B.cyl(NS('metal'), '#c9ccd0', 0.12, 0.17, x, 0.24, z, { rx: HP, seg: 10 });
      B.box('metal', K.iron, 2.2, 0.12, 0.4, 0.1, 0.42, 0, { r: 0.02 });
      // cab
      B.box('gloss', cc, 0.9, 0.7, 1.15, 0.85, 0.85, 0, { round: true, r: 0.14 });
      B.box('gloss', cc, 0.75, 0.62, 1.1, 0.8, 1.45, 0, { round: true, r: 0.16 });
      pbox(B, NS('gloss'), K.glassLt, 0.02, 0.4, 0.9, 1.19, 1.5, 0, { rz: -0.25 });
      for (const s2 of [-1, 1]) pbox(B, NS('gloss'), K.glassLt, 0.4, 0.32, 0.02, 0.8, 1.5, s2 * 0.56);
      B.cyl(NS('glow'), K.lamp, 0.07, 0.03, 1.31, 1.02, 0, { rz: HP, seg: 10, glow: 1.2 });
      B.box(NS('metal'), '#c9ccd0', 0.06, 0.1, 1.0, 1.3, 0.55, 0, { r: 0.02 });
      // flatbed + dropsides + load
      B.box('wood', K.woodLt, 1.5, 0.08, Wd, -0.55, 0.62, 0, { r: 0.015 });
      for (const s2 of [-1, 1]) B.box('paint', cc, 1.5, 0.32, 0.04, -0.55, 0.82, s2 * (Wd / 2 - 0.02), { r: 0.01 });
      B.box('paint', cc, 0.04, 0.32, Wd, -1.28, 0.82, 0, { r: 0.01 });
      for (let i = 0; i < 4; i++) {
        const x = -0.95 + (i % 2) * 0.7, z = i < 2 ? -0.3 : 0.3, y = 0.66;
        B.box('wood', K.woodLt, 0.6, 0.3, 0.5, x, y + 0.15, z, { r: 0.01 });
        dots(B, x, y + 0.3, z, 0.24, 0.02, 0.2, 10, 0.06, K.lemon, i * 7 + 3, NS('gloss'), 0.0);
      }
      B.box('wood', K.woodLt, 0.6, 0.3, 0.5, -0.6, 0.96 + 0.15, 0, { r: 0.01 });
      dots(B, -0.6, 1.26, 0, 0.24, 0.02, 0.2, 10, 0.06, K.lemon, 31, NS('gloss'), 0.0);
      B.col(-1.3, 0, -0.66, 1.33, 1.4, 0.66, ROOF);
      B.blob(3.0, 1.7);
    },
  };
  // ---- terracotta planter wall (fioriera) along +X with flowers / rosemary; collides 0.6
  D.terraces_planterbox = {
    desc: 'Long terracotta planter along +X (pos = start, 0.5 deep, 0.6 high): moulded rim, a garland band, rosemary / geraniums / trailing ivy. Collides 0.6.',
    params: { length: 'm (2.4)', flowers: 'colour' }, variants: 2, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 2.4, Hh = 0.6, Dp = 0.5, seed = Math.round(L * 17 + (o.pos?.[0] ?? 0) * 3);
      B.box('paint', K.terra, L, Hh - 0.06, Dp, L / 2, (Hh - 0.06) / 2, 0, { r: 0.04 });
      B.box('paint', K.terraLt, L + 0.06, 0.07, Dp + 0.06, L / 2, Hh - 0.035, 0, { r: 0.025 });
      B.box(NS('paint'), K.terraDk, L + 0.01, 0.06, Dp + 0.01, L / 2, 0.18, 0, { r: 0.015 });
      B.box(NS('paint'), K.soil, L - 0.08, 0.02, Dp - 0.08, L / 2, Hh - 0.02, 0, { r: 0.01 });
      const n = Math.max(2, Math.round(L / 0.45));
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * (L / n);
        if ((o.variant ?? 0) === 1) { cluster(B, x, Hh + 0.15, 0, 0.2, 0.18, 0.18, 3, 0.16, '#5f7a5a', '#8ea486', seed + i, 'foliage', { low: true }); dots(B, x, Hh + 0.22, 0, 0.2, 0.15, 0.18, 5, 0.025, K.lavender, seed + i, NS('paint'), -0.3); }
        else { cluster(B, x, Hh + 0.12, 0, 0.22, 0.12, 0.2, 3, 0.15, K.leafDk, K.leaf, seed + i, 'foliage', { low: true }); dots(B, x, Hh + 0.2, 0, 0.22, 0.1, 0.2, 7, 0.032, o.flowers ?? K.geranium, seed + i * 3, NS('paint'), -0.2); }
      }
      B.col(0, 0, -Dp / 2, L, Hh, Dp / 2);
    },
  };
  // ---- belvedere telescope (coin-operated) on a pedestal
  D.terraces_telescope = {
    desc: 'Coin-operated belvedere telescope on a cast-iron pedestal (1.4 m), binocular head tilted out to sea (+Z). Pedestal collides.',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      B.lathe('metal', '#3c5a4a', [[0, 0], [0.22, 0], [0.2, 0.06], [0.08, 0.16], [0.06, 1.0], [0.1, 1.05], [0, 1.05]], 0, 0, 0, { seg: 10 });
      B.push(0, 1.2, 0, 0, -0.25);
      B.box('gloss', '#3c5a4a', 0.34, 0.26, 0.4, 0, 0, 0, { round: true, r: 0.08 });
      for (const s2 of [-1, 1]) { B.cyl('gloss', '#3c5a4a', 0.07, 0.3, s2 * 0.09, 0.02, 0.32, { rx: HP, seg: 10 }); B.cyl(NS('gloss'), '#1b2126', 0.055, 0.01, s2 * 0.09, 0.02, 0.475, { rx: HP, seg: 10 }); }
      B.box(NS('metal'), K.brass, 0.1, 0.06, 0.02, 0, 0.05, -0.21, { r: 0.01 });
      B.pop();
      B.col(-0.15, 0, -0.15, 0.15, 1.05, 0.15, ROOF);
    },
  };


  // ================================================================================================ village clutter
  // ---- newspaper kiosk (edicola): octagonal green kiosk, domed zinc roof, magazines, GIORNALI fascia; collides
  D.terraces_kiosk = {
    desc: 'Newspaper kiosk (edicola, 1.9 m octagon, front +Z): bottle-green panelled body, open counter with stacked papers and a rack of magazines, a scalloped zinc canopy and dome with a finial, GIORNALI fascia letters on both sides, a lamp under the canopy. Collides (1.9 × 2.6).',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      const R = 0.95, gc = '#3d6b55', gcd = '#2e5242', H1 = 2.3;
      B.lathe('paint', gc, [[0, 0], [R, 0], [R, 0.12], [R - 0.03, 0.14], [R - 0.03, H1], [0, H1]], 0, 0, 0, { seg: 8, ry: PI / 8 });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + PI / 8 + PI / 8; const cx = Math.sin(a) * (R - 0.02), cz = Math.cos(a) * (R - 0.02); pbox(B, NS('paint'), gcd, 0.04, H1 - 0.2, 0.04, cx, H1 / 2 + 0.05, cz); }
      // open counter on the front: dark opening, papers + magazines
      pbox(B, NS('paint'), '#2a2622', 1.0, 1.0, 0.02, 0, 1.45, R - 0.02);
      B.box('wood', K.woodLt, 1.1, 0.06, 0.34, 0, 0.95, R + 0.1, { r: 0.01 });
      for (let i = 0; i < 6; i++) { const x = -0.42 + i * 0.17; B.box(NS('paint'), ['#f1ede4', '#e8e2d2', '#d9d2c4'][i % 3], 0.14, 0.06 + 0.02 * (i % 3), 0.22, x, 1.0, R + 0.1, { r: 0.004 }); }
      for (let r2 = 0; r2 < 2; r2++) for (let i = 0; i < 5; i++) pbox(B, NS('paint'), ['#d35d4b', '#4a78a8', '#e2b23c', '#6aa57d', '#b46aa0'][(i + r2 * 2) % 5], 0.16, 0.22, 0.01, -0.36 + i * 0.18, 1.35 + r2 * 0.28, R - 0.005, { rx: -0.15 });
      // canopy + dome + finial
      B.lathe('metal', '#8f9aa0', [[0, 0], [R + 0.35, -0.02], [R + 0.36, 0.06], [R * 0.7, 0.35], [R * 0.35, 0.62], [0.12, 0.72], [0, 0.74]], 0, H1, 0, { seg: 16 });
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; B.sph(NS('metal'), '#8f9aa0', 0.07, Math.cos(a) * (R + 0.32), H1 - 0.03, Math.sin(a) * (R + 0.32), { ws: 6, hs: 3, half: true, rx: PI }); }
      B.lathe('metal', K.gold, [[0, 0], [0.05, 0], [0.07, 0.08], [0.02, 0.2], [0.04, 0.26], [0, 0.3]], 0, H1 + 0.72, 0, { seg: 8 });
      for (const f of [0, PI]) { B.push(0, 0, 0, f); B.box('paint', gcd, 1.25, 0.24, 0.05, 0, H1 - 0.2, R + 0.02, { r: 0.02 }); letters(B, 'GIORNALI', { h: 0.14, x: 0, y: H1 - 0.27, z: R + 0.05, c: K.cream, flat: true, wt: 0.2, track: 0.14 }); B.pop(); }
      B.cyl(NS('glow'), K.lamp, 0.06, 0.08, 0, H1 - 0.05, R + 0.18, { seg: 10, glow: 1.5 });
      B.col(-R, 0, -R, R, H1, R, ROOF);
      B.blob(2.4, 2.4);
    },
  };
  // ---- stacked wooden crates of lemons (and one of oranges) on a pallet; collides
  D.terraces_crates = {
    desc: 'Stack of slatted wooden produce crates full of lemons (one of blood oranges), a wicker basket on top; variant 1 = low double row. Collides.',
    params: {}, variants: 2, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 2, seed = Math.round((o.pos?.[0] ?? 0) * 13 + (o.pos?.[2] ?? 0) * 7);
      const crate = (x, y, z, ry, fruit) => {
        B.push(x, y, z, ry);
        for (const s2 of [-1, 1]) { B.box('wood', K.woodLt, 0.03, 0.3, 0.4, s2 * 0.29, 0.15, 0, { r: 0.006 }); }
        for (let k = 0; k < 3; k++) for (const s2 of [-1, 1]) pbox(B, 'wood', shade(K.woodLt, 0.92 + 0.1 * hash(k + seed)), 0.58, 0.06, 0.012, 0, 0.05 + k * 0.1, s2 * 0.2);
        pbox(B, 'wood', K.woodLt, 0.58, 0.02, 0.4, 0, 0.01, 0);
        dots(B, 0, 0.26, 0, 0.26, 0.02, 0.17, 14, 0.06, fruit, seed + x * 7 + y * 13, NS('gloss'), 0.0);
        B.pop();
      };
      if (v === 0) {
        crate(-0.32, 0, 0, 0.05, K.lemon); crate(0.32, 0, 0.02, -0.04, K.lemon); crate(0, 0.31, 0, 0.1, K.lemon); crate(-0.3, 0, 0.44, 0.02, '#d9793a');
        B.lathe('wood', '#c9a46a', [[0, 0], [0.16, 0], [0.22, 0.2], [0.23, 0.22], [0, 0.22]], 0.05, 0.62, 0.02, { seg: 10 });
        B.tor(NS('wood'), '#b08a52', 0.17, 0.012, 0.05, 0.9, 0.02, { ts: 10, rs: 3, arc: PI });
        B.col(-0.62, 0, -0.22, 0.62, 0.84, 0.66);
      } else {
        for (const [x, z, f] of [[-0.62, 0, K.lemon], [0, 0, K.lemon], [0.62, 0, '#d9793a'], [-0.31, 0.44, K.lemon], [0.31, 0.44, K.lemon]]) crate(x, 0, z, (hash(x + z) - 0.5) * 0.1, f);
        B.col(-0.93, 0, -0.22, 0.93, 0.33, 0.66);
      }
      B.blob(2.0, 1.4);
    },
  };
  // ---- cat (sleeping curled or sitting): village life, non-colliding
  D.terraces_cat = {
    desc: 'Village cat: variant 0 curled asleep, 1 sitting upright watching (+Z), 2 loaf. Coat from color (ginger / tabby grey / black-white). Non-colliding.',
    params: { color: 'coat' }, variants: 3, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 3, c = o.color ?? '#d18a4a', cd = shade(c, 0.75), s = 1;
      const ear = (x, y, z, ry) => B.add('paint', cylGeo(0, 0.035, 0.06, 4), cd, x, y, z, { ry });
      if (v === 0) {
        B.sph('paint', c, 0.16, 0, 0.09, 0, { ws: 10, hs: 6, sy: 0.55 });
        B.sph('paint', c, 0.075, 0.1, 0.1, 0.1, { ws: 8, hs: 6 });
        ear(0.08, 0.17, 0.14, 0.3); ear(0.14, 0.16, 0.08, 0.3);
        B.tube('paint', cd, [P3(-0.14, 0.05, 0), P3(-0.1, 0.05, 0.14), P3(0.05, 0.05, 0.18)], 0.025, { radial: 5 });
      } else if (v === 1) {
        B.sph('paint', c, 0.1, 0, 0.12, 0, { ws: 10, hs: 6, sy: 1.3 });
        B.sph('paint', c, 0.07, 0, 0.3, 0.03, { ws: 8, hs: 6 });
        ear(-0.035, 0.37, 0.03, 0); ear(0.035, 0.37, 0.03, 0);
        for (const sx of [-0.03, 0.03]) B.sph(NS('glow'), '#c8d86a', 0.011, sx, 0.31, 0.093, { ws: 5, hs: 3, glow: 0.8 });
        B.tube('paint', cd, [P3(0, 0.02, -0.08), P3(0.12, 0.02, -0.02), P3(0.16, 0.02, 0.08)], 0.02, { radial: 5 });
      } else {
        B.sph('paint', c, 0.14, 0, 0.09, 0, { ws: 10, hs: 6, sz: 1.5, sy: 0.7 });
        B.sph('paint', c, 0.07, 0, 0.16, 0.2, { ws: 8, hs: 6 });
        ear(-0.035, 0.22, 0.2, 0); ear(0.035, 0.22, 0.2, 0);
      }
      void s;
    },
  };
  // ---- scooter (classic step-through with rounded side panels), parked on its stand; collides
  D.terraces_scooter = {
    desc: 'Classic step-through scooter parked on its stand (front +X): rounded rear body with side cowls, leg shield, round headlamp on the handlebar, small wheels, a saddle and a rack with a crate of lemons. Colour from color. Collides (1.7 × 0.7 × 1.1).',
    params: { color: 'body (pastel)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const c = o.color ?? '#9dc2b8';
      B.push(0, 0, 0, 0, 0, 0.06);
      for (const x of [-0.55, 0.6]) { B.cyl('rubber', '#2a2a2c', 0.2, 0.1, x, 0.2, 0, { rx: HP, seg: 12 }); B.cyl(NS('metal'), '#c9ccd0', 0.11, 0.11, x, 0.2, 0, { rx: HP, seg: 10 }); }
      B.sph('gloss', c, 0.36, -0.45, 0.48, 0, { ws: 12, hs: 8, sx: 1.1, sy: 0.7, sz: 0.62 });
      B.box('gloss', c, 0.7, 0.08, 0.34, 0.1, 0.3, 0, { r: 0.03 });
      B.box('gloss', c, 0.14, 0.72, 0.42, 0.52, 0.62, 0, { r: 0.07, rz: -0.25 });
      B.sph('gloss', c, 0.2, 0.62, 0.32, 0, { ws: 10, hs: 6, sz: 0.55, sy: 0.9 });
      B.cyl('metal', '#c9ccd0', 0.02, 0.5, 0.62, 1.1, 0, { rx: HP, seg: 6 });
      B.cyl('gloss', c, 0.08, 0.1, 0.68, 1.08, 0, { rz: HP, seg: 10 });
      B.cyl(NS('glow'), K.lamp, 0.06, 0.01, 0.735, 1.08, 0, { rz: HP, seg: 10, glow: 1.2 });
      B.box('wood', '#6b4a36', 0.5, 0.1, 0.26, -0.4, 0.86, 0, { round: true, r: 0.04 });
      B.box('metal', '#c9ccd0', 0.3, 0.02, 0.3, -0.8, 0.8, 0, { r: 0.01 });
      B.box('wood', K.woodLt, 0.3, 0.16, 0.26, -0.8, 0.9, 0, { r: 0.01 });
      dots(B, -0.8, 0.98, 0, 0.11, 0.01, 0.09, 6, 0.045, K.lemon, 5, NS('gloss'), 0.0);
      B.pop();
      B.col(-0.95, 0, -0.35, 0.8, 1.1, 0.35, ROOF);
      B.blob(1.8, 0.8);
    },
  };
  // ---- tool shed in the Orto: limewashed hut with a mono-pitch coppi roof, plank door, tools; collides
  D.terraces_shed = {
    desc: 'Garden tool shed (2.0 × 1.6, front +Z): limewashed rubble walls, a mono-pitch coppi roof, a plank door ajar, a hoe and spade leaning, a watering can, a rain barrel at the side. Collides.',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      const W = 2.0, Dd = 1.6, Hf = 2.3, Hb = 1.9;
      B.box('paint', K.white, W, Hb, Dd, 0, Hb / 2, 0, { r: 0.05 });
      B.add('paint', tpl('shedgab', () => extrudeGeo([[-Dd / 2, 0], [Dd / 2, 0], [Dd / 2, Hf - Hb], [-Dd / 2, 0]].slice(0, 3), 1, 0.002)), K.white, 0, Hb, 0, { sx: W });
      B.push(0, Hb + (Hf - Hb) / 2 + 0.06, 0, 0, -Math.atan2(Hf - Hb, Dd));
      B.add('paint', coppiSheet(W + 0.4, Math.hypot(Dd, Hf - Hb) + 0.4), K.coppi, 0, 0, 0, {});
      B.pop();
      doorU(B, 0.2, 0, 0.8, 1.75, { arch: false, leaf: K.greenDk, frame: K.stone, step: false });
      B.push(0, 0, Dd / 2);
      B.tube('wood', K.woodLt, [P3(-0.6, 0, 0.12), P3(-0.52, 1.4, 0.03)], 0.02, { radial: 5 });
      B.box('metal', '#7c7a74', 0.2, 0.14, 0.02, -0.52, 1.42, 0.03, { r: 0.01 });
      B.tube('wood', K.woodLt, [P3(-0.8, 0, 0.14), P3(-0.76, 1.1, 0.03)], 0.02, { radial: 5 });
      B.box('metal', '#8d8b84', 0.18, 0.25, 0.03, -0.8, 0.12, 0.14, { r: 0.01 });
      B.lathe('metal', '#5c7a6a', [[0, 0], [0.12, 0], [0.12, 0.26], [0, 0.26]], 0.78, 0, 0.25, { seg: 10 });
      B.tube(NS('metal'), '#5c7a6a', [P3(0.88, 0.16, 0.25), P3(1.05, 0.34, 0.25)], 0.015, { radial: 4 });
      B.pop();
      B.lathe('wood', '#7d5a3c', [[0, 0], [0.3, 0], [0.33, 0.4], [0.3, 0.8], [0, 0.8]], W / 2 + 0.36, 0, -0.3, { seg: 12 });
      for (const y of [0.15, 0.65]) B.tor(NS('metal'), K.iron, 0.315, 0.012, W / 2 + 0.36, y, -0.3, { rx: HP, ts: 14, rs: 3 });
      B.col(-W / 2, 0, -Dd / 2, W / 2, Hf, Dd / 2, ROOF);
      B.col(W / 2, 0, -0.65, W / 2 + 0.7, 0.8, 0.05);
    },
  };
  // ---- raised vegetable bed: timber frame with tomatoes on canes, artichokes, basil; collides 0.5
  D.terraces_bed = {
    desc: 'Raised vegetable bed along +X (pos = start; 0.9 deep, 0.5 high): timber boards on corner posts, dark soil, a row of tomato plants tied to cane tripods with red fruit, artichokes and basil. Collides 0.5.',
    params: { length: 'm (2.4)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 2.4, Dp = 0.9, Hh = 0.5, seed = Math.round(L * 11 + (o.pos?.[2] ?? 0) * 5);
      for (const s2 of [-1, 1]) { B.box('wood', K.woodLt, L, Hh, 0.05, L / 2, Hh / 2, s2 * (Dp / 2 - 0.025), { r: 0.01 }); B.box('wood', K.woodLt, 0.05, Hh, Dp, L / 2 + s2 * (L / 2 - 0.025), Hh / 2, 0, { r: 0.01 }); }
      B.box(NS('paint'), K.soil, L - 0.1, 0.03, Dp - 0.1, L / 2, Hh - 0.03, 0, { r: 0.01 });
      const n = Math.max(2, Math.round(L / 0.6));
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * (L / n);
        for (const a of [0, 2.1, 4.2]) B.tube(NS('wood'), '#b89a6a', [P3(x + Math.cos(a) * 0.14, Hh, -0.15 + Math.sin(a) * 0.14), P3(x, Hh + 1.0, -0.15)], 0.008, { radial: 3 });
        cluster(B, x, Hh + 0.45, -0.15, 0.16, 0.35, 0.16, 4, 0.14, K.leafDk, K.leaf, seed + i, 'foliage', { low: true });
        dots(B, x, Hh + 0.4, -0.15, 0.18, 0.3, 0.18, 6, 0.04, '#c8412f', seed * 3 + i, NS('gloss'), -0.6);
        if (i % 2) { for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; B.sph(NS('foliage'), '#7c9c80', 0.12, x + Math.cos(a) * 0.12, Hh + 0.12, 0.22 + Math.sin(a) * 0.08, { ws: 6, hs: 4, sx: 1.6, sy: 0.3, ry: -a }); } }
        else cluster(B, x, Hh + 0.1, 0.22, 0.13, 0.08, 0.1, 3, 0.1, K.leaf, K.leafLt, seed + i * 5, 'foliage', { low: true });
      }
      B.col(0, 0, -Dp / 2, L, Hh, Dp / 2);
    },
  };
  // ---- ivy / caper cascade spilling over a wall top (wall face at z = 0 facing +Z, top at y = 0; along +X)
  D.terraces_ivy = {
    desc: 'Trailing ivy / caper plant spilling over a wall top down the face (pos = wall top edge, along +X for `width`, hanging `drop` m down local −Y in front of the face at +Z): a leafy cushion along the top edge and hanging strands of shrinking leaf clumps. variant 1 = caper with white-pink flowers. Non-colliding.',
    params: { width: 'm (1.2)', drop: 'm (1.0)' }, variants: 2, mount: 'wall',
    build(B, o) {
      const Wd = o.width ?? 1.2, dr = o.drop ?? 1.0, seed = Math.round((o.pos?.[0] ?? 0) * 7 + (o.pos?.[2] ?? 0) * 11 + (o.pos?.[1] ?? 0) * 3);
      const leaf = (x, y, z, s, k) => B.add(NS('foliage'), blob(1, 0, (seed + k) % 8), mixc(K.leafDk, K.leaf, 0.25 + 0.6 * hash(k * 1.7 + seed)), x, y, z, { s, sy: s * 0.9, sz: s * 0.55, ry: hash(k) * TAU, ao: false });
      const nTop = Math.max(2, Math.round(Wd / 0.22));
      for (let i = 0; i < nTop; i++) leaf((i + 0.5) * (Wd / nTop) + (hash(seed + i) - 0.5) * 0.08, 0.02 + 0.03 * hash(i * 3 + seed), 0.06, 0.15 + 0.04 * hash(i + seed), i);
      const nS = Math.max(2, Math.round(Wd / 0.3));
      let k = 100;
      for (let j = 0; j < nS; j++) {
        const x0 = (j + 0.2 + 0.6 * hash(seed * 3 + j)) * (Wd / nS), L = dr * (0.45 + 0.55 * hash(seed + j * 7.3)), steps = Math.max(2, Math.round(L / 0.13));
        for (let t = 0; t < steps; t++) { const u = t / steps; leaf(x0 + 0.05 * Math.sin(u * 5 + j), -0.04 - u * L, 0.07 + 0.02 * Math.sin(u * 3 + j), 0.12 * (1 - 0.45 * u), k++); }
      }
      if ((o.variant ?? 0) === 1) dots(B, Wd / 2, -dr * 0.3, 0.12, Wd / 2, dr * 0.3, 0.04, Math.round(Wd * 7), 0.03, '#f3dbe4', seed, NS('paint'));
    },
  };
}

// ------------------------------------------------------------------------------------------------------------
// Placements (Alpha half; each entry is mirrored (x, z) → (−x, −z), rotY + π)
// ------------------------------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------------------------------
// Placements (Alpha half; each entry is mirrored (x, z) → (−x, −z), rotY + π). The contour layout exports its
// geometry (layout.js TERRAIN): houses turned to the piazza's curve or the hill's contours, the rim chords that trace
// every terrace edge, the stairs — so balustrades, cliffs, ivy and handrails follow the curves exactly.
// ------------------------------------------------------------------------------------------------------------
const HP_ = P / 2, rad = (deg) => (deg * P) / 180;
const TR = TERRAIN;
const LV = [TR.R0, TR.R1, TR.R2, TR.R3, TR.R4], LVY = [TR.H0, TR.H1, TR.H2, TR.H3, TR.H4];
// terrain height at (x, z) (Alpha half): the highest level whose region holds the point
const yAt = (x, z) => { let y = 0; for (let L = 0; L < 5; L++) if (TR.inside(LV[L], x, z)) y = LVY[L]; return y; };
const at = (type, x, z, o = {}) => ({ type, pos: [x, o.y ?? yAt(x, z), z], ...o });
const W_ = '#f4f0e7', OCHRE = '#e9cf9c', PINK = '#efcdbd', SKYC = '#dfe8ea', BLUE = '#41709c', GREEN = '#4f7e62', TEAL = '#3f8588';
// rotY (radians) that turns a prop's local +X along the plan direction (dx, dz); its local +Z is then (−dz, dx)
const rotX = (dx, dz) => Math.atan2(-dz, dx);
// rotY (radians) that turns a prop's local +Z (its front) toward (dx, dz)
const rotZ = (dx, dz) => Math.atan2(dx, dz);
const HALF = LAYOUT.half;

// ---- the rim chords of each level: centre, direction, length, outward normal (toward the lower side)
function rimsOf(L) {
  return HALF.filter((d) => String(d.tag).startsWith('rim-' + L + '-')).map((d) => {
    const a = rad(d.rotY), dx = Math.cos(a), dz = -Math.sin(a);
    let nx = -dz, nz = dx;                                   // one of the two normals
    if (TR.inside(LV[L], d.center[0] + nx * 0.6, d.center[2] + nz * 0.6)) { nx = -nx; nz = -nz; }
    const len = d.size[0], hw = d.size[2] / 2;
    // chord on the outer face, oriented so that (−dz', dx') points outward (the balustrade / cliff / ivy frame)
    let ux = dx, uz = dz; if (-uz * nx + ux * nz < 0) { ux = -ux; uz = -uz; }
    const ox = d.center[0] + nx * hw, oz = d.center[2] + nz * hw;
    return { L, cx: d.center[0], cz: d.center[2], ox, oz, ux, uz, nx, nz, len, y: d.center[1] + d.size[1] / 2, start: [ox - (ux * len) / 2, oz - (uz * len) / 2] };
  });
}
const RIM0 = rimsOf(0);
// belvedere balustrades along the whole sea edge (on the coping, 0.18 m in from the face)
const seaBalustrades = RIM0.map((r) => ({ type: 'terraces_balustrade', pos: [r.start[0] - r.nx * 0.18, r.y, r.start[1] - r.nz * 0.18], rotY: rotX(r.ux, r.uz), length: r.len, piers: r.len > 2.2, finials: false }));
// sea cliffs under the edge (outside the arena)
const seaCliffs = RIM0.map((r, i) => ({ type: 'terraces_cliff', pos: [r.start[0], 0, r.start[1]], rotY: rotX(r.ux, r.uz), length: r.len, top0: 0, top1: 0, seed: 3 + i }));
// ivy / caper cascades on every third terrace wall (levels 1–3)
// (Tower Command: not on the terrace wall the tower climbs from the Salita onto the Largo — the rail runs up its face)
const IVY_NOT_TOWER = [[-13.56, -20.6]];
const ivy = [1, 2, 3].flatMap((L) => rimsOf(L).filter((r, i) => (i + L) % 3 === 0 && r.len > 0.8).map((r, i) => ({ type: 'terraces_ivy', pos: [r.start[0] + r.ux * 0.1, r.y, r.start[1] + r.uz * 0.1], rotY: rotX(r.ux, r.uz), width: r.len - 0.2, drop: 0.95, variant: (i + L) % 2 })))
  .map((it) => (IVY_NOT_TOWER.some(([x, z]) => Math.hypot(it.pos[0] - x, it.pos[2] - z) < 0.05) ? { ...it, notIn: 'tower' } : it));

// ---- handrails both sides of every stair (rail colliders follow the slope)
const STAIRS = HALF.filter((d) => d.kind === 'ramp' && /scalinata|vicolo|passo|stair|salita|gradoni/.test(d.tag) && !/incline/.test(d.tag));
// Tower Command: rails the track runs into — the Salita's first flight (the track climbs it) loses both, four others
// lose the metre nearest the track ({ tag, low: the stair's low height, s: which side, bottom / top: metres cut })
const TOWER_RAILS = [
  { tag: 'salita-flight', low: 0, s: 1, drop: true }, { tag: 'salita-flight', low: 0, s: -1, drop: true },
  { tag: 'scalinata', low: 2.4, s: -1, bottom: 0.6 }, { tag: 'vicolo-flight-2', low: 1.2, s: 1, top: 0.7 },
  { tag: 'orto-stair', low: 1.2, s: -1, top: 0.7 }, { tag: 'limonaia-stair', low: 2.4, s: 1, bottom: 0.5 },
];
const stairRails = STAIRS.flatMap((d) => {
  const dx = d.high[0] - d.low[0], dz = d.high[2] - d.low[2], run = Math.hypot(dx, dz), ux = dx / run, uz = dz / run, sx = -uz, sz = ux, off = d.width / 2 + 0.07;
  const rise = d.high[1] - d.low[1], modes = { ...(d.onlyIn ? { onlyIn: d.onlyIn } : {}), ...(d.notIn ? { notIn: d.notIn } : {}) };   // (a stair's rails go where it goes)
  return [1, -1].flatMap((s) => {
    const rail = (a, b) => ({ type: 'terraces_rail', pos: a ? [d.low[0] + sx * off * s + ux * a, d.low[1] + (rise * a) / run, d.low[2] + sz * off * s + uz * a] : [d.low[0] + sx * off * s, d.low[1], d.low[2] + sz * off * s], rotY: rotX(ux, uz), length: run - a - b, rise: a || b ? (rise * (run - a - b)) / run : rise });
    const cut = TOWER_RAILS.find((c) => c.tag === d.tag && Math.abs(c.low - d.low[1]) < 0.01 && c.s === s);
    if (!cut) return [{ ...rail(0, 0), ...modes }];
    return [{ ...rail(0, 0), notIn: 'tower' }, ...(cut.drop ? [] : [{ ...rail(cut.bottom ?? 0, cut.top ?? 0), onlyIn: 'tower' }])];
  });
});

// ---- the houses (dressing for the turned blocks in layout.js)
const H = TR.HOUSES, U = TR.UPPERS;
const dress = (h, faces, o = {}) => ({ type: 'terraces_house', pos: [h.cx, 0, h.cz], rotY: rad(h.rot), w: h.w, d: h.d, top: h.top, faces, color: h.color, ...o });

// ---- the funicular along the incline (local +Z uphill)
// (two straight reaches since the stretch — layout.js INC_SEG: the upper one from the station down to the kink, the
// first drawing's lower one on to the foot)
const I = TR.INC, SEG = TR.INC_SEG, lowSeg = SEG[1], down = rotZ(lowSeg.dir[0], lowSeg.dir[1]);
const incAt = (t, off) => TR.incP(t, off);
const funicular = [
  // the track, reach by reach (the upper one runs on through the kink: no buffer stop there)
  ...SEG.map((g, i) => ({ type: 'terraces_track', pos: [g.b[0] - g.n[0] * 0.9, g.b[1], g.b[2] - g.n[1] * 0.9], rotY: rotZ(-g.dir[0], -g.dir[1]), run: g.L, rise: g.a[1] - g.b[1], buffer: i === SEG.length - 1 })),
  // the car stopped on the upper reach, in the olive terraces (cover beside the Salita)
  (() => { const g = SEG[0], u = 0.56, x = g.a[0] + (g.b[0] - g.a[0]) * u - g.n[0] * 0.9, z = g.a[2] + (g.b[2] - g.a[2]) * u - g.n[1] * 0.9; return { type: 'terraces_funicar', pos: [x, g.a[1] + (g.b[1] - g.a[1]) * u, z], rotY: rotZ(-g.dir[0], -g.dir[1]), run: g.L, rise: g.a[1] - g.b[1] }; })(),
  // the lower station canopy past the foot, the upper one on the spawn terrace (moved out with it)
  (() => { const p = incAt(1.03, -0.9); return { type: 'terraces_station', pos: [p[0], 0, p[1]], rotY: down, w: 1.9, d: 2.0, h: 2.8, sign: 'FUNICOLARE' }; })(),
  { type: 'terraces_station', pos: [-24.6, 4.8, -43.2 - TR.DS], rotY: 0, w: 3.4, d: 3.6, h: 2.8, sign: 'STAZIONE', clock: false },
  // the incline's own cliff down the west side, reach by reach
  ...SEG.map((g, i) => ({ type: 'terraces_cliff', pos: [g.a[0] - g.n[0] * 2.2, 0, g.a[2] - g.n[1] * 2.2], rotY: rotX(g.dir[0], g.dir[1]), length: g.L, top0: g.a[1], top1: g.b[1], seed: 2 + i })),
];
// the Long Stages stretch: the hill's own pieces (the villa and the back of the base, the spawn terrace's furniture, the
// Limonaia) are drawn below where they first stood and moved out with the hilltop (layout.js DS)
const outB = (p) => ({ ...p, pos: [p.pos[0], p.pos[1], p.pos[2] - TR.DS] });
const atB = (type, x, z, o = {}) => at(type, x, z - TR.DS, o);

// ---- the piazza ring: compass angle ψ round the centre, radius r
const po = (psi, r) => { const u = TR.uO(psi); return [u[0] * r, u[1] * r]; };
const onP = (type, psi, r, o = {}) => { const [x, z] = po(psi, r); return at(type, x, z, o); };
// ---- the hill frame: φ from the direction to the piazza (+ east), radius from the hilltop
const ph = (r, phi) => { const q = TR.P(r, phi); return [q[0], q[1]]; };
const onH = (type, r, phi, o = {}) => { const [x, z] = ph(r, phi); return at(type, x, z, o); };

export const PLACEMENTS = [
  // ================= San Vito (single, self-symmetric)
  { type: 'terraces_chapel', pos: [0, 0, 0], mirror: false, notIn: ['zones', 'tower'] },
  // Tower Command: San Vito open at the base (layout.js SAN_VITO_OPEN) — the tower starts under the dome
  { type: 'terraces_chapel', pos: [0, 0, 0], mirror: false, onlyIn: 'tower', open: true },
  // Zone Control: the chapel opened up into the tempietto on the deeper sagrato (layout.js SINGLE)
  { type: 'terraces_tempietto', pos: [0, 0, 0], mirror: false, onlyIn: 'zones' },

  // ================= the back of the base: Villa Limoni (spawn backdrop), upper funicular station, garden wall, hill
  ...[
    { type: 'terraces_villa', pos: [-12, 0, -45.4], rotY: 0, w: 15.2 },
    { type: 'terraces_upstation', pos: [-23.2, 0, -45.4], rotY: 0, w: 7.2, trackX: SEG[0].a[0] - SEG[0].n[0] * 0.9 + 23.2 },
    { type: 'terraces_gardenwall', pos: [2.05, 0, -45.4], rotY: 0, w: 12.9, gateX: -1.5, floor: 2.4, top: 5.0 },
    { type: 'terraces_hillside', pos: [-10, 0, -46], rotY: 0 },
    { type: 'terraces_balustrade', pos: [-26.6, 4.8, -45.2], rotY: -HP_, length: 3.9 },
  ].map(outB),
  // sea edge: balustrades on the coping, cliffs below
  ...seaBalustrades, ...seaCliffs,

  // ================= the funicular: two reaches of track, the car stopped on the upper one, the station canopies
  ...funicular,

  // ================= the crescent round the piazza
  dress(H.caffe, {
    0: [{ t: 'shop', x: -1.3, y: 0, w: 2.3, h: 2.1, frame: '#3f5f7f', lit: 1.0 }, { t: 'door', x: 1.5, y: 0, w: 1.0, h: 2.2, arch: false, leaf: '#3f5f7f', frame: '#e9e2d3' },
      { t: 'awning', x: -1.3, y: 2.5, w: 2.5, cA: BLUE }, { t: 'lamp', x: 2.45, y: 2.4 }, { t: 'win', x: 1.5, y: 2.55, w: 0.7, h: 0.8, shut: BLUE }],
    1: [{ t: 'win', x: 0.6, y: 2.0, w: 0.7, h: 0.95, shut: BLUE, box: true }, { t: 'plaque', x: -1.2, y: 2.4, text: 'VICOLO DEL SOLE', h: 0.065 }, { t: 'lamp', x: -0.3, y: 3.0 }],
    3: [{ t: 'door', x: 0.9, y: 0, w: 0.9, h: 2.05, leaf: BLUE }, { t: 'win', x: -1.0, y: 1.2, w: 0.7, h: 1.0, shut: BLUE }, { t: 'bougain', x: 1.9, y: 0, y1: 3.4, w: 1.1 }, { t: 'pipe', x: -2.05, y0: 0, y1: 3.6 }],
    2: [{ t: 'plaque', x: 1.4, y: 3.05, text: '12', h: 0.1, w: 0.26 }],
  }, { roof: 'flat', cope: [0, 1, 3], notIn: 'tower' }),
  // Tower Command: the Caffè over its sottoportico (layout.js CAFFE_T) — the shop front a little narrower (the front
  // wall stops 0.95 m short of the corner), the Salita side open underneath, its door moved in under the portico; the
  // whole house TR.PORTICO.lift taller (the portico 4.3 m clear), its upper storey and roof terrace with it
  dress({ ...H.caffe, top: H.caffe.top + TR.PORTICO.lift }, {
    0: [{ t: 'shop', x: -1.15, y: 0, w: 1.95, h: 2.1, frame: '#3f5f7f', lit: 1.0 }, { t: 'door', x: 1.5, y: 0, w: 1.0, h: 2.2, arch: false, leaf: '#3f5f7f', frame: '#e9e2d3' },
      { t: 'awning', x: -1.15, y: 2.5, w: 2.05, cA: BLUE }, { t: 'lamp', x: 2.45, y: 2.4 }, { t: 'win', x: 1.5, y: 2.55, w: 0.7, h: 0.8, shut: BLUE }],
    1: [{ t: 'win', x: 0.6, y: 2.0, w: 0.7, h: 0.95, shut: BLUE, box: true }, { t: 'plaque', x: -1.2, y: 2.4, text: 'VICOLO DEL SOLE', h: 0.065 }, { t: 'lamp', x: -0.3, y: 3.0 }],
    2: [{ t: 'plaque', x: 1.4, y: 3.42 + TR.PORTICO.lift, text: '12', h: 0.1, w: 0.26 }],
  }, { roof: 'flat', cope: [0, 1, 3], onlyIn: 'tower' }),
  { type: 'terraces_portico', pos: [H.caffe.cx, 0, H.caffe.cz], rotY: rad(H.caffe.rot), w: H.caffe.w, d: H.caffe.d, um: TR.PORTICO.um, uf: TR.PORTICO.uf, ceil: TR.PORTICO.ceil, wall: TR.PORTICO.wall, top: H.caffe.top + TR.PORTICO.lift, color: H.caffe.color, onlyIn: 'tower' },
  // the upper storey and the roof terrace's pergola + tables: as built, and (Tower Command) TR.PORTICO.lift higher
  ...[[0, { notIn: 'tower' }], [TR.PORTICO.lift, { onlyIn: 'tower' }]].flatMap(([dy, m]) => [
    { type: 'terraces_house', pos: [U.caffe.cx, dy, U.caffe.cz], rotY: rad(U.caffe.rot), w: U.caffe.w, d: U.caffe.d, top: U.caffe.top, color: U.caffe.color, roof: 'gable', rise: 1.0, alongX: true,
      faces: { 0: [{ t: 'sign', x: 0, y: 4.9, text: 'CAFFÈ', h: 0.4, c: '#35506e', lit: 0.9, litC: '#ffe3a6' }, { t: 'win', x: 1.3, y: 3.95, w: 0.7, h: 0.85, shut: BLUE, lit: 0.9 }, { t: 'door', x: -1.2, y: 3.6, w: 0.85, h: 2.0, leaf: BLUE }],
        3: [{ t: 'gnomon', x: 0, y: 5.75 }], 1: [{ t: 'win', x: 0, y: 4.3, w: 0.7, h: 1.1, shut: BLUE, lit: 0.9 }] }, ...m },
    onP('terraces_pergola', H.caffe.psi + 6, 15.0, { y: 3.6 + dy, rotY: rad(H.caffe.rot), w: 2.6, d: 2.2, h: 2.2, variant: 0, pillars: [[-1.1, 0.9], [1.1, 0.9]], ...m }),
    onP('terraces_cafe', H.caffe.psi + 5, 14.9, { y: 3.6 + dy, variant: 0, seed: 0.9, ...m }),
  ]),
  // (the Ceramiche and its upper storey twice: as built, and Tower Command's 0.7 m shallower one, layout.js CERAMICHE_T)
  ...[[H.ceramiche, U.ceramiche, { notIn: 'tower' }], [TR.CERAMICHE_T, TR.UPPER_CERAMICHE_T, { onlyIn: 'tower' }]].flatMap(([h, u, m]) => [
    dress(h, {
      0: [{ t: 'shop', x: -1.2, y: 0, w: 2.1, h: 2.0, frame: '#2f5f8a', goods: 'ceramics', lit: 0.8 }, { t: 'door', x: 1.25, y: 0, w: 1.0, h: 2.05, arch: false, leaf: '#2f5f8a', frame: '#e9e2d3' },
        { t: 'sign', x: 0, y: 2.55, text: 'CERAMICHE', h: 0.2, c: '#2f5f8a', flat: true }, { t: 'plates', x: 0, y: 3.05, n: 5 }, { t: 'lamp', x: 2.1, y: 2.35 }],
      3: [{ t: 'plates', x: 0.2, y: 1.8, n: 4 }, { t: 'niche', x: -1.3, y: 1.9 }],
      1: [{ t: 'win', x: -0.2, y: 1.9, w: 0.7, h: 0.95, shut: '#2f5f8a', grille: true }, { t: 'plaque', x: 1.2, y: 2.9, text: 'PASSO', h: 0.07 }],
    }, { roof: 'flat', cope: [0, 1, 3], ...m }),
    { type: 'terraces_house', pos: [u.cx, 0, u.cz], rotY: rad(u.rot), w: u.w, d: u.d, top: u.top, color: u.color, roof: 'gable', rise: 0.9,
      faces: { 0: [{ t: 'balc', x: 0, y: 3.9, w: 1.5, shut: '#2f5f8a', lit: 0.9, trail: 0.4 }], 1: [{ t: 'win', x: 0, y: 4.2, w: 0.7, h: 1.0, shut: '#2f5f8a' }] }, chimneys: [[-1.0, -0.4]], ...m },
  ]),
  onP('terraces_potplant', H.ceramiche.psi - 7, 14.2, { y: 3.6, variant: 0 }),
  dress(H.mare, {
    0: [{ t: 'shop', x: -0.8, y: 0, w: 1.9, h: 1.95, frame: GREEN, goods: 'lemons', lit: 0.8 }, { t: 'door', x: 1.3, y: 0, w: 0.9, h: 2.0, leaf: GREEN }, { t: 'sign', x: -0.8, y: 2.05, text: 'LIMONCELLO', h: 0.13, c: '#c69a1e', flat: true }],
    3: [{ t: 'win', x: 0.3, y: 1.35, w: 0.6, h: 0.8, shut: GREEN, box: true, flowers: '#f7f3ea' }],
    1: [{ t: 'win', x: 0, y: 1.0, w: 0.7, h: 1.0, shut: GREEN }, { t: 'lamp', x: 1.2, y: 2.0 }],
  }, { roof: 'flat', cope: [0, 3] }),
  { type: 'terraces_house', pos: [U.mare.cx, 0, U.mare.cz], rotY: rad(U.mare.rot), w: U.mare.w, d: U.mare.d, top: U.mare.top, color: U.mare.color, roof: 'gable', rise: 0.8, alongX: false,
    faces: { 1: [{ t: 'win', x: 0, y: 3.6, w: 0.7, h: 1.0, shut: BLUE, lit: 0.9 }], 2: [{ t: 'win', x: 0, y: 3.5, w: 0.6, h: 0.9, shut: BLUE }] } },
  onP('terraces_crates', H.mare.psi - 4, 14.9, { y: 2.6, rotY: rad(H.mare.rot) + 0.1, variant: 1 }),
  // ================= the Largo (H2): wall fountain on the shoulder wall, the olive, lamps, a lemon tree, the cat
  // (the stretch: the Largo's west shoulder it stood against is gone — the fountain now stands against the Oliveto's
  // north-east wall, over the lane from the groves into the Largo)
  (() => { const L = TR.LAVATOIO, ax = [Math.sin(L.rot), Math.cos(L.rot)], n = [ax[1], -ax[0]], p = [-9.05 + n[0] * 4.3, -27.6 + n[1] * 4.3]; return { type: 'terraces_fountain', pos: [p[0], 2.4, p[1]], rotY: rotZ(n[0], n[1]) }; })(),
  onH('terraces_olive', 16.2, 17, { seed: 5, notIn: 'tower' }),
  (() => { const [x, z] = ph(16.2, 17); return at('terraces_olive', x, z - 1.3, { seed: 5, onlyIn: 'tower' }); })(),   // (Tower Command: clear of the track behind the Ceramiche)
  onH('terraces_lamppost', 12.8, -20),
  onH('terraces_lamppost', 12.8, 20),
  at('terraces_potplant', -3.6, -28.6, { variant: 0 }),
  onH('terraces_cat', 15.0, -9, { rotY: 1.2, variant: 0, color: '#d18a4a', notIn: 'tower' }),
  at('terraces_cat', -13.0, -23.3, { rotY: 1.2, variant: 0, color: '#d18a4a', onlyIn: 'tower' }),   // (Tower Command: off the track, by the fountain)

  // ================= the street behind the crescent (H2): laundry on poles, doorstep pots
  onP('terraces_laundry', -34, 20.4, { y: 5.2, rotY: rotX(TR.uO(-34)[1] * -1, TR.uO(-34)[0]), length: 3.6, posts: 2.8, variant: 0, notIn: 'tower' }),   // (its far post stands on the track)
  onP('terraces_laundry', 12, 20.3, { y: 5.2, rotY: rotX(-TR.uO(12)[1], TR.uO(12)[0]), length: 3.4, posts: 2.8, variant: 1 }),
  onP('terraces_pots', -26, 20.9, { count: 4, notIn: 'tower' }),   // (on the track in Tower Command)
  onP('terraces_pots', 24, 20.8, { count: 5, variant: 1 }),

  // ================= the piazza (Alpha side of the ring)
  onP('terraces_cafe', -33, 11.9, { variant: 0, seed: 1.2 }),
  onP('terraces_lamppost', -62, 12.4),
  onP('terraces_lamppost', 46, 12.3),
  onP('terraces_kiosk', 38, 10.6, { rotY: rotZ(-TR.uO(38)[0], -TR.uO(38)[1]) }),
  onP('terraces_truck', 57, 12.8, { rotY: rotX(TR.uO(57)[1] * -1, TR.uO(57)[0]) + 0.15, color: '#7fa6b8' }),
  onP('terraces_well', -68, 13.0),
  onP('terraces_cat', -68.4, 13.55, { y: 0.92, rotY: 1.2, variant: 2, color: '#3a3634' }),
  onP('stringlights', -52, 12.9, { rotY: rotX(-TR.uO(-46)[1], TR.uO(-46)[0]), length: 6.5, height: 2.7, posts: true, sag: 0.3, notIn: 'tower' }),
  // (Tower Command: its first post stood on the track across the piazza — 2.5 m shorter, from the café's side)
  (() => { const [x, z] = po(-52, 12.9), d = [-TR.uO(-46)[1], TR.uO(-46)[0]]; return at('stringlights', x + d[0] * 2.5, z + d[1] * 2.5, { rotY: rotX(d[0], d[1]), length: 4.0, height: 2.7, posts: true, sag: 0.25, onlyIn: 'tower' }); })(),

  // ================= the east bastion (and, mirrored, the west one): the telescope on the prow, an agave in the corner
  { type: 'terraces_telescope', pos: [TR.BELV[0] + 2.3, -0.1, TR.BELV[1]], rotY: HP_ },
  { type: 'terraces_potplant', pos: [15.0, 0, -5.55], variant: 3 },

  // ================= the east lane: Limonaia (H3 lobe, moved out with the hill) under its pergola, Orto (H2), the
  // headland lookout (H0)
  atB('terraces_pergola', -1.6, -33.8, { rotY: 0.55, w: 8.0, d: 6.0, h: 2.5, variant: 0, cover: 0.6 }),
  atB('terraces_potplant', -4.2, -35.6, { variant: 0 }),
  atB('terraces_potplant', 1.6, -35.9, { variant: 1 }),
  at('terraces_shed', 6.2, -29.4, { rotY: -0.7, notIn: 'tower' }),   // (shed, washing line and the cat on the shed: on the track in Tower Command)
  at('terraces_bed', 1.2, -25.0, { rotY: 0.6, length: 2.4 }),
  at('terraces_laundry', 3.5, -30.8, { y: 5.2, rotY: 0.95, length: 3.4, posts: 2.8, variant: 1, notIn: 'tower' }),
  at('terraces_cat', 7.4, -28.2, { y: 3.2, rotY: 0.4, variant: 0, color: '#8d8a86', notIn: 'tower' }),
  at('terraces_lamppost', 9.2, -25.3),
  at('terraces_telescope', 16.8, -20.8, { rotY: rotZ(0.8, -0.6) }),
  at('terraces_lamppost', 12.6, -12.4),

  // ================= the spawn terrace (Villa Limoni's belvedere, H4): urns and benches for cover round the pad (the
  // Long Stages stretch: the terrace was bare, its middle the stage's largest open floor)
  at('terraces_urn', -19.2, -57.4, { variant: 0 }),
  at('terraces_urn', -4.8, -57.4, { variant: 0 }),
  at('terraces_bench', -16.4, -52.4, { rotY: 0.45, length: 2 }),
  at('terraces_bench', -7.6, -52.4, { rotY: -0.45, length: 2 }),
  // ================= the west: the Salita, the forecourt, the villa terrace (moved out with the hill)
  atB('terraces_lamppost', -15.4, -35.6),
  atB('terraces_potplant', -20.4, -44.6, { y: 4.8, variant: 3 }),
  atB('terraces_bench', -16.4, -44.95, { y: 4.8, rotY: 0, length: 2 }),
  atB('terraces_cat', -21.6, -44.7, { y: 4.8, rotY: 0.4, variant: 2, color: '#e8e2d8' }),
  atB('terraces_pots', -7.6, -45.0, { y: 4.8, count: 4 }),
  atB('terraces_lamppost', -16.8, -40.2, { y: 4.8 }),

  // ================= THE OLIVE TERRACES (the Long Stages slice between the hill and the Largo; layout.js OLIVETO / LEMON)
  // the Oliveto (H3): the lavatoio on its north end over the lower Scalinata, the old olive mill, olives in their stone
  // rings, a dry-stone wall stub with an olive net on a ladder
  { type: 'terraces_lavatoio', pos: [TR.LAVATOIO.cx, TR.H3, TR.LAVATOIO.cz], rotY: TR.LAVATOIO.rot, W: TR.LAVATOIO.W, Dd: TR.LAVATOIO.Dd },
  at('terraces_press', -12.3, -40.4, { rotY: 0.4 }),
  at('terraces_olive', -13.6, -44.4, { seed: 2 }),
  at('terraces_olive', -8.4, -37.2, { seed: 9 }),
  at('terraces_olive', -13.4, -35.2, { seed: 13 }),
  at('terraces_drywall', -7.6, -42.4, { rotY: HP_ + 0.06, length: 2.6, net: true, seed: 2 }),
  at('terraces_lamppost', -12.6, -46.2),
  // the lemon groves (H2) round the lemon house: its dressing, the vine pergola over the lemon pots north of it, crates,
  // the well in the lane by the Oliveto, lemon trees along the groves' east wall (the tower's lane kept clear, x 5–7.6)
  { type: 'terraces_house', pos: [TR.LEMON.cx, 0, TR.LEMON.cz], rotY: 0, w: TR.LEMON.w, d: TR.LEMON.d, top: TR.LEMON.top, color: '#f0e2a8', roof: 'gable', rise: 1.4,
    faces: { 0: [{ t: 'arch', x: 0, y: 2.4, w: 2.2, h: 3.4 }, { t: 'sign', x: 0, y: 5.9, text: 'LIMONAIA', h: 0.28, c: '#4f7e62', flat: true }],
      1: [{ t: 'win', x: -2.6, y: 3.0, w: 1.2, h: 2.4, shut: GREEN }, { t: 'win', x: 0, y: 3.0, w: 1.2, h: 2.4, shut: GREEN, lit: 0.7 }, { t: 'win', x: 2.6, y: 3.0, w: 1.2, h: 2.4, shut: GREEN }],
      2: [{ t: 'door', x: 1.2, y: 2.4, w: 1.0, h: 2.2, leaf: GREEN }, { t: 'win', x: -1.2, y: 3.4, w: 0.8, h: 1.0, shut: GREEN }, { t: 'lamp', x: 0.1, y: 4.6 }],
      3: [{ t: 'win', x: -2.4, y: 3.2, w: 0.9, h: 1.3, shut: GREEN }, { t: 'win', x: 1.4, y: 3.2, w: 0.9, h: 1.3, shut: GREEN }, { t: 'bougain', x: -0.6, y: 2.4, y1: 5.8, w: 1.4 }, { t: 'pipe', x: 2.65, y0: 2.4, y1: 6.5 }] } },
  at('terraces_pergola', 0.5, -33.7, { rotY: 0, w: 5.6, d: 4.0, h: 2.6, variant: 0 }),
  at('terraces_potplant', -0.8, -33.4, { variant: 0 }),
  at('terraces_potplant', 1.9, -34.1, { variant: 0 }),
  at('terraces_crates', 3.5, -36.3, { rotY: 0.2, variant: 1 }),
  at('terraces_crates', -4.3, -43.6, { rotY: -0.3, variant: 0 }),
  at('terraces_well', -4.3, -34.6),
  at('terraces_lamppost', -5.2, -47.2),
  ...[[9.0, -53.0], [9.2, -47.0], [9.3, -41.0], [9.0, -35.2]].map(([x, z], i) => at('terraces_potplant', x, z, { variant: i === 2 ? 4 : 0 })),
  // (turf + zones: lemon carts down the groves' street; in Tower Command that street is the tower's lane)
  at('terraces_lemoncart', 6.3, -44.2, { rotY: HP_ + 0.1, notIn: 'tower' }),
  at('terraces_lemoncart', 6.2, -34.8, { rotY: -HP_ + 0.15, notIn: 'tower' }),
  // the lemon walk on the terrace below the groves (H1): a pergola of lemon pots, urns at its ends
  at('terraces_pergola', 11.8, -44.0, { rotY: 0, w: 2.8, d: 9.0, h: 2.5, variant: 0 }),
  ...[[11.8, -47.2], [11.8, -41.0]].map(([x, z]) => at('terraces_potplant', x, z, { variant: 0 })),
  at('terraces_urn', 11.9, -52.6, { variant: 0 }),
  at('terraces_urn', 11.7, -34.2, { variant: 1 }),
  // the promenade under the groves (H0) and the washerwomen's lookout on its little bastion
  at('terraces_bench', 14.6, -46.0, { rotY: HP_, length: 2 }),
  at('terraces_bench', 14.6, -38.0, { rotY: HP_, length: 2 }),
  at('terraces_lamppost', 14.2, -52.6),
  at('terraces_lamppost', 14.2, -31.6),
  { type: 'terraces_telescope', pos: [18.0, 0, -43.0], rotY: HP_ },
  at('terraces_kiosk', 15.0, -49.4, { rotY: -HP_ }),
  at('terraces_urn', 18.5, -41.4, { variant: 1 }),

  at('terraces_potplant', 18.6, -45.4, { variant: 3 }),
  // the Salita's middle reach beside the funicular: a lamp, pots on a doorstep
  at('terraces_lamppost', -16.0, -37.0),
  at('terraces_pots', -16.4, -48.8, { count: 3 }),

  // ================= stairs: handrails; terrace walls: ivy
  ...stairRails, ...ivy,
];
