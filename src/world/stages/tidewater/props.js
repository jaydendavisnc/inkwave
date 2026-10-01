// Tidewater Plaza — stage prop pack + placements (owner: the tidewater stage; see layout.js for the folder contract).
//
// register(D, H): this stage's own prop builders (types prefixed 'tidewater_'), same contract as
// props-marina-dock.js: H carries THREE + the kit helpers. PLACEMENTS: the set dressing (half list — every entry is
// mirrored (x,z) → (-x,-z) with rotY + π unless it says `mirror: false`). Solid props hand the level collision boxes.
//
// Conventions follow props.js: metres, Y up, `pos` = base point, rotY turns local +Z (the "front"). Wall-mounted pieces
// treat local z = 0 as the wall face and project toward +Z. Runs (balustrades, railings) start at pos along local +X.
//
// The place: a Victorian seaside town's civic plaza where the harbour meets the promenade — the Town Hall and the
// Custom House facing each other across the square, the Jubilee clock tower on its terrace in the middle, a cast-iron
// colonnade (covered walk below, terrace walk on top) along one side, the open promenade with its shelters, kiosks
// and sea railings along the other, bandstands, a floral clock, the lifeboat station and the two piers out at sea.
// Palette: cream / pastel stucco, sea-green painted cast iron, coral + navy accents, gilt details, slate roofs.
import { SQ, PROM, ESPL, TERR, COLO, STAIR, STAIR_REV, STAIR_AR, TW, GARDEN, TD, tq, chainSections } from './layout.js';

const P = Math.PI;

export function register(D, H) {
  const { THREE, col, shade, mixc, latheGeo, tubeGeo, extrudeGeo, arcPts, PI, TAU, HP, P3 } = H;
  const NS = (m) => (H.noShadow ? H.noShadow(m) : m);

  // ------------------------------------------------------------------------------------------ local palette
  const K = {
    stucco: '#efe6d3', stuccoDk: '#d9cfbb', trim: '#f7f3ea', stone: '#e6dfcf', stoneDk: '#c9c1ae', granite: '#a9a49b',
    graniteDk: '#85817a', iron: '#4d8b7e', ironDk: '#2f5d55', ironLt: '#6fa99b', navy: '#2f3d5c', coral: '#d9826c',
    coralDk: '#b8624f', gold: '#c9a453', bronze: '#8a6a3c', glass: '#344a58', glassLt: '#557384', slate: '#5b6877',
    slateDk: '#4a5563', lead: '#727d88', copper: '#7fb2a0', copperDk: '#5d8f7f', brick: '#b76b55', pot: '#b86a4f',
    wood: '#a87b52', woodLt: '#c49a6c', lamp: '#ffe1a6', blind: '#efe2c4', mint: '#cfe3d6', pink: '#eed7cb',
    butter: '#f0e2bd', sky: '#d4e3ea', white: '#f5f2ea', ink: '#23262d', leaf: '#4f8a4a', leafDk: '#3a6b3c',
    leafLt: '#79a95c', red: '#c8483e', yellow: '#f0c94c', purple: '#8a6cc0', water: '#5f9fa6',
    club: '#2f3d5c', clubGold: '#c9a453',
  };

  // ------------------------------------------------------------------------------------------ geometry helpers
  // tiny builder (same contract as props.js GB: triangles auto-orient to the supplied outward normals)
  class GB {
    constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.idx = []; }
    v(x, y, z, nx, ny, nz, r = 1, g = r, b = r) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(0, 0); this.c.push(r, g, b); return this.p.length / 3 - 1; }
    tri(a, b, c) {
      const Pp = this.p, N = this.n;
      const ax = Pp[a * 3], ay = Pp[a * 3 + 1], az = Pp[a * 3 + 2];
      const e1x = Pp[b * 3] - ax, e1y = Pp[b * 3 + 1] - ay, e1z = Pp[b * 3 + 2] - az;
      const e2x = Pp[c * 3] - ax, e2y = Pp[c * 3 + 1] - ay, e2z = Pp[c * 3 + 2] - az;
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
  const cx3 = (c) => { const k = col(c); return [k.r, k.g, k.b]; };
  const pboxGeo = () => tpl('pbox', () => new THREE.BoxGeometry(1, 1, 1));
  // plain (unbevelled) box for small parts: 12 triangles
  const pbox = (B, mat, c, w, h, d, x, y, z, o = {}) => B.add(mat, pboxGeo(), c, x, y, z, { ...o, sx: w, sy: h, sz: d });
  // cached extrusion of a closed (z, y) profile along X (length L)
  const ext = (key, prof, L, b = 0.004) => tpl('tx|' + key + '|' + kf(L), () => extrudeGeo(prof, L, b));
  // Colliders are prop-local (B.col ignores B.push), so builders that nest frames track them here: fpush/fpop wrap
  // B.push/B.pop for yaw-only frames, COL maps a box from the current frame into prop-local space (AABB).
  const FR = [];
  const frame = () => FR[FR.length - 1] || [0, 0, 0, 0];
  function fpush(B, x, y, z, ry = 0) { const t = frame(), c = Math.cos(t[3]), sn = Math.sin(t[3]); FR.push([t[0] + x * c + z * sn, t[1] + y, t[2] - x * sn + z * c, t[3] + ry]); B.push(x, y, z, ry); }
  function fpop(B) { FR.pop(); B.pop(); }
  // o.roof: an off-limits top (never inkable, nobody can stand on it); o.rail: a railing / balustrade / grille — kids
  // can't pass, shots, ink and squids can (and nobody stands on it) — see props.js B.col
  function COL(B, x0, y0, z0, x1, y1, z1, o) {
    const t = frame(), c = Math.cos(t[3]), sn = Math.sin(t[3]);
    let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity;
    for (const [lx, lz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) { const wx = t[0] + lx * c + lz * sn, wz = t[2] - lx * sn + lz * c; ax = Math.min(ax, wx); bx = Math.max(bx, wx); az = Math.min(az, wz); bz = Math.max(bz, wz); }
    const r = (v) => Math.round(v * 1e4) / 1e4;
    const f = (o && o.roof ? 1 : 0) | (o && o.rail ? 2 : 0);
    B.cols.push(f ? [r(ax), r(t[1] + y0), r(az), r(bx), r(t[1] + y1), r(bz), f] : [r(ax), r(t[1] + y0), r(az), r(bx), r(t[1] + y1), r(bz)]);
  }
  const colBox = (B, x, y, z, w, h, d, o) => COL(B, x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, o);
  // every build starts with an empty frame stack (a throw mid-build must not leak frames into the next prop)
  const def = (o) => { const b = o.build; o.build = (B, opts) => { FR.length = 0; b(B, opts); }; return o; };
  // flat disc facing +Z (for dials, glass heads), optional half (top) disc
  const discGeo = (r, seg, half = false) => tpl(['disc', r, seg, half ? 1 : 0].map(kf).join('|'), () => {
    const g = new GB(), c0 = g.v(0, 0, 0, 0, 0, 1), ids = [];
    const n = half ? seg : seg;
    for (let i = 0; i <= n; i++) { const a = half ? (i / n) * PI : (i / n) * TAU; ids.push(g.v(Math.cos(a) * r, Math.sin(a) * r, 0, 0, 0, 1)); }
    for (let i = 0; i < n; i++) g.tri(c0, ids[i], ids[i + 1]);
    return g.geo();
  });
  // round-headed panel (rectangle w × h with a semicircular head on top, total height h + w/2), facing +Z
  const archPanelGeo = (w, h, seg = 10) => tpl(['archp', w, h, seg].map(kf).join('|'), () => {
    const g = new GB(), r = w / 2;
    const q = [g.v(-r, 0, 0, 0, 0, 1), g.v(r, 0, 0, 0, 0, 1), g.v(r, h, 0, 0, 0, 1), g.v(-r, h, 0, 0, 0, 1)];
    g.quad(q[0], q[1], q[2], q[3]);
    const c0 = g.v(0, h, 0, 0, 0, 1), ids = [];
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * PI; ids.push(g.v(Math.cos(a) * r, h + Math.sin(a) * r, 0, 0, 0, 1)); }
    for (let i = 0; i < seg; i++) g.tri(c0, ids[i], ids[i + 1]);
    return g.geo();
  });
  // triangle (gable / pediment face) facing +Z: base w, height h
  const triGeo = (w, h) => tpl(['tri', w, h].map(kf).join('|'), () => {
    const g = new GB(); g.tri(g.v(-w / 2, 0, 0, 0, 0, 1), g.v(w / 2, 0, 0, 0, 0, 1), g.v(0, h, 0, 0, 0, 1)); return g.geo();
  });
  // mouldings (closed z/y profiles, z = projection from the wall)
  const PROF = {
    cornice: [[0, 0], [0.06, 0], [0.06, 0.05], [0.1, 0.08], [0.13, 0.14], [0.26, 0.17], [0.3, 0.24], [0.33, 0.3], [0.34, 0.36], [0, 0.36]],
    string: [[0, 0], [0.05, 0], [0.07, 0.03], [0.07, 0.09], [0.05, 0.12], [0, 0.12]],
    plinth: [[0, 0], [0.09, 0], [0.09, 0.28], [0.05, 0.32], [0, 0.34]],
    sill: [[0, 0], [0.09, 0.01], [0.1, 0.05], [0.08, 0.07], [0, 0.07]],
    coping: [[-0.22, 0], [0.22, 0], [0.22, 0.06], [0.17, 0.1], [0, 0.13], [-0.17, 0.1], [-0.22, 0.06]],
  };
  const mould = (B, mat, c, kind, L, x, y, z, o = {}) => B.add(mat, ext(kind, PROF[kind], L), c, x, y, z, o);

  // ------------------------------------------------------------------------------------------ stroke font
  // (adapted from the marina dock pack) Rounded bold sans (cap height 1): centre-line strokes, round caps + round joins, bevelled front, flat back.
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
  };
  const DOTS = { '·': [[0, 0.46]], '.': [[0, 0]], ':': [[0, 0.1], [0, 0.62]] };
  const SPACE = 0.34;

  // Stroke ribbon: flat face at z = d (bevel b down to the sides), side walls to z0. b = 0 → no bevel; d = z0 → flat
  // (paint / stencil lettering: face only).
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
  // round cap / join: disc (a0..a1 = 0..TAU) or a half disc facing an open stroke end
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
  // glyph geometry in cap units (baseline y = 0, cap y = 1, back at z = 0, face at z = dep); returns { geo, adv }.
  // dep = 0 → flat painted lettering (face only); ds = round-cap segments.
  function glyph(ch, wt, dep, bev, ds = 10) {
    return tpl(['gl', ch, wt, dep, bev, ds].map(kf).join('|'), () => {
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
        // split at sharp turns (round join discs there), round caps at both ends
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
        // half-disc caps at the two open ends (facing outward), full discs at the sharp joints
        const endCap = (p, q) => { const a = Math.atan2(p[1] - q[1], p[0] - q[0]); disc(g, p[0], p[1], hw, b, d, 0, Math.max(3, Math.round(ds / 2)), a - HP, a + HP); };
        endCap(pts[0], pts[1]); endCap(pts[pts.length - 1], pts[pts.length - 2]);
        for (const p of joints.slice(2)) disc(g, p[0], p[1], hw, b, d, 0, ds);
      });
      return { geo: g.geo(), adv: w * s + wt };
    });
  }
  const textW = (str, wt = 0.17, track = 0.12) => { let w = 0; const cs = [...str]; cs.forEach((ch, i) => { w += ch === ' ' ? SPACE : glyph(ch, wt, 0.12, 0.035).adv; if (i < cs.length - 1) w += track; }); return w; };
  // Lay out a line of letters facing +Z in the current frame (raised channel letters, or flat paint with flat: true).
  // Returns the width (m).
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
      if (gi.geo) B.add(flat || h < 0.2 ? NS(m) : m, gi.geo, o.c ?? K.club, (o.x ?? 0) + x, o.y ?? 0, o.z ?? 0, { s: h, sz: flat ? 1 : h, glow: o.glow, ao: false });
      // lit channel letters: an illuminated acrylic face (flat, unlit-shaded) just proud of the raised letter's face, so
      // the sign reads as switched on at dusk and as a crisp lit sign by day
      if (gi.geo && o.lit) {
        const fg = glyph(ch, wt, 0, 0, ds);
        if (fg.geo) B.add(NS('glow'), fg.geo, o.litC ?? o.c ?? K.clubGold, (o.x ?? 0) + x, o.y ?? 0, (o.z ?? 0) + dep * h + 0.004, { s: h, sz: 1, glow: o.lit, ao: false });
      }
      x += (gi.adv + (i < cs.length - 1 ? track : 0)) * h;
    });
    return W;
  }

  // ------------------------------------------------------------------------------------------ building kit
  // Everything mounts on a wall at local z = 0 facing +Z (≤ 0.12 m proud unless it is a sill, hood or cornice).
  // Victorian sash window: stucco architrave, recessed dark glass, two sashes with glazing bars, bracketed sill,
  // optional hood (cornice / triangular / segmental pediment), keystone, lit blind (glows at dusk).
  function sash(B, x, y, w, h, o = {}) {
    const fc = o.frame ?? K.trim, sc = o.sash ?? K.white, t = 0.12, dz = 0.05, Pm = o.ns ? NS('paint') : 'paint';
    pbox(B, NS('gloss'), o.glass ?? K.glass, w, h, 0.02, x, y + h / 2, 0.01);
    // architrave
    pbox(B, Pm, fc, w + t * 2, t, dz, x, y + h + t / 2, dz / 2);
    for (const sx of [-1, 1]) pbox(B, Pm, fc, t, h + t, dz, x + sx * (w / 2 + t / 2), y + (h + t) / 2 - 0.0, dz / 2);
    // sashes: outer frame, meeting rail, glazing bars
    const bars = o.bars ?? (w > 0.9 ? 2 : 1);
    pbox(B, NS('paint'), sc, w, 0.05, 0.035, x, y + h - 0.025, 0.03);
    pbox(B, NS('paint'), sc, w, 0.06, 0.035, x, y + 0.03, 0.03);
    for (const sx of [-1, 1]) pbox(B, NS('paint'), sc, 0.045, h, 0.035, x + sx * (w / 2 - 0.022), y + h / 2, 0.03);
    pbox(B, NS('paint'), sc, w, 0.055, 0.045, x, y + h * 0.5, 0.035);
    for (let i = 1; i < bars; i++) pbox(B, NS('paint'), sc, 0.025, h, 0.03, x - w / 2 + (i * w) / bars, y + h / 2, 0.028);
    if (o.lit) pbox(B, NS('glow'), K.lamp, w - 0.1, h * 0.28, 0.006, x, y + h * 0.82, 0.024, { glow: o.lit });
    else if (o.blind) pbox(B, NS('paint'), o.blind, w - 0.1, h * 0.26, 0.006, x, y + h * 0.84, 0.024);
    // sill on two small corbels
    B.add(Pm, ext('sill', PROF.sill, w + t * 2 + 0.12), fc, x, y - 0.075, 0, {});
    for (const sx of [-1, 1]) pbox(B, NS('paint'), fc, 0.08, 0.12, 0.07, x + sx * (w / 2 + 0.02), y - 0.14, 0.035);
    // head
    const hy = y + h + t;
    if (o.hood === 'cornice' || o.hood === 'pediment' || o.hood === 'segment') {
      pbox(B, Pm, fc, w + t * 2, 0.16, 0.04, x, hy + 0.08, 0.02);   // frieze
      B.add(Pm, ext('hoodc', [[0, 0], [0.07, 0], [0.1, 0.05], [0.12, 0.1], [0, 0.1]], w + t * 2 + 0.16), fc, x, hy + 0.16, 0, {});
      if (o.hood === 'pediment') {
        B.add(Pm, triGeo(w + t * 2 + 0.1, 0.36), fc, x, hy + 0.26, 0.06, {});
        for (const s of [-1, 1]) { B.push(x + s * (w / 2 + t + 0.05) / 2, hy + 0.26 + 0.18, 0.07, 0, 0, -s * Math.atan2(0.36, (w + t * 2 + 0.1) / 2)); pbox(B, Pm, fc, Math.hypot(0.36, (w + t * 2 + 0.1) / 2) + 0.06, 0.07, 0.1, 0, 0, 0); B.pop(); }
      } else if (o.hood === 'segment') {
        B.tube(Pm, fc, arcPts(x, hy + 0.05 - (w + 0.3) * 0.5, 0.06, (w + 0.3) * 0.5 / Math.sin(1.05) * Math.sin(1.05), HP - 0.75, HP + 0.75, 10), 0.05, { radial: 5 });
      }
    } else if (o.key !== false) {
      pbox(B, Pm, fc, 0.14, 0.2, 0.07, x, hy - 0.02, 0.035);
    }
    if (o.balconette) {
      // cast-iron balconette on the sill: posts, rails, bellied bars
      const bw = w + 0.3, bz = 0.26;
      pbox(B, 'gloss', K.ironDk, bw, 0.04, 0.3, x, y - 0.06, bz / 2 + 0.02);
      for (const sx of [-1, 1]) B.cyl('gloss', K.ironDk, 0.018, 0.55, x + sx * bw / 2, y + 0.22, bz, { seg: 6 });
      B.cyl('gloss', K.ironDk, 0.016, bw, x, y + 0.48, bz, { rz: HP, seg: 6 });
      for (let i = 1; i < Math.round(bw / 0.11); i++) B.tube(NS('gloss'), K.ironDk, [P3(x - bw / 2 + i * 0.11, y - 0.04, bz), P3(x - bw / 2 + i * 0.11, y + 0.2, bz + 0.05), P3(x - bw / 2 + i * 0.11, y + 0.48, bz)], 0.008, { radial: 4 });
    }
  }
  // round-headed window / door opening with archivolt + keystone (opening w wide, springing at y + h)
  function archOpening(B, x, y, w, h, o = {}) {
    const fc = o.frame ?? K.trim, r = w / 2;
    B.add(NS('gloss'), archPanelGeo(w, h, 12), o.glass ?? K.glass, x, y, 0.012, {});
    // reveal lining + archivolt
    B.tube('paint', fc, arcPts(x, y + h, 0.04, r + 0.07, 0, PI, 12), 0.07, { radial: 5 });
    for (const sx of [-1, 1]) pbox(B, 'paint', fc, 0.14, h, 0.08, x + sx * (r + 0.07), y + h / 2, 0.04);
    pbox(B, 'paint', o.key ?? fc, 0.18, 0.26, 0.1, x, y + h + r + 0.06, 0.05);
    if (o.impost !== false) for (const sx of [-1, 1]) pbox(B, 'paint', fc, 0.24, 0.07, 0.12, x + sx * (r + 0.07), y + h, 0.06);
    // glazing: fanlight radial bars + transom + mullion
    if (o.fan !== false) {
      pbox(B, NS('paint'), K.white, w, 0.05, 0.04, x, y + h, 0.03);
      for (let i = 1; i < 4; i++) { const a = (i / 4) * PI; B.push(x, y + h, 0.03, 0, 0, a - HP); pbox(B, NS('paint'), K.white, 0.025, r, 0.03, 0, r / 2, 0); B.pop(); }
      B.tube(NS('paint'), K.white, arcPts(x, y + h, 0.03, r * 0.45, 0, PI, 8), 0.014, { radial: 4 });
    }
    if (o.door) {
      const dc = o.door;
      for (const sx of [-1, 1]) {
        const lx = x + sx * w / 4;
        B.box('paint', dc, w / 2 - 0.02, h - 0.04, 0.05, lx, (h - 0.04) / 2 + y, 0.03, { r: 0.012 });
        pbox(B, NS('gloss'), o.glass ?? K.glass, w / 2 - 0.2, h * 0.42, 0.012, lx, y + h * 0.66, 0.058);
        for (const yy of [0.18, 0.4]) pbox(B, NS('paint'), shade(dc, 0.85), w / 2 - 0.2, h * 0.17, 0.012, lx, y + h * yy, 0.058);
        pbox(B, NS('metal'), K.gold, 0.03, 0.16, 0.03, x + sx * 0.06, y + 1.0, 0.07);
      }
      if (o.lit) pbox(B, NS('glow'), K.lamp, w * 0.5, r * 0.45, 0.004, x, y + h + r * 0.35, 0.016, { glow: o.lit });
    } else {
      if (o.bars !== false) pbox(B, NS('paint'), K.white, 0.04, h, 0.035, x, y + h / 2, 0.03);
      if (o.transom) pbox(B, NS('paint'), K.white, w, 0.045, 0.035, x, y + h * o.transom, 0.03);
      if (o.lit) pbox(B, NS('glow'), K.lamp, w - 0.1, h * 0.3, 0.004, x, y + h * 0.78, 0.016, { glow: o.lit });
    }
  }
  // flat pilaster with base + capital (wall z = 0), from y0 to y1
  function pilaster(B, x, y0, y1, w = 0.4, c = K.trim, dz = 0.07) {
    pbox(B, 'paint', c, w, y1 - y0 - 0.3, dz, x, (y0 + y1) / 2, dz / 2);
    pbox(B, 'paint', c, w + 0.1, 0.18, dz + 0.04, x, y0 + 0.09, (dz + 0.04) / 2);
    pbox(B, 'paint', c, w + 0.12, 0.08, dz + 0.06, x, y1 - 0.2, (dz + 0.06) / 2);
    pbox(B, 'paint', c, w + 0.16, 0.1, dz + 0.08, x, y1 - 0.06, (dz + 0.08) / 2);
  }
  // corner quoins down a vertical corner (along the wall at x, facing +Z), alternating long/short blocks
  function quoins(B, x, y0, y1, side = 1, c = K.stoneDk) {
    let k = 0;
    for (let y = y0; y < y1 - 0.1; y += 0.4, k++) pbox(B, 'paint', c, k % 2 ? 0.34 : 0.52, 0.34, 0.035, x - side * (k % 2 ? 0.17 : 0.26), y + 0.19, 0.0175);
  }

  // stone balustrade along +X (freestanding, centred on the run line): plinth, vase balusters, coping, piers every
  // `bay` m with ball finials or urns; a rail collider (kids blocked, shots / squids pass) unless col: false
  const BALU = [[0, 0], [0.068, 0], [0.068, 0.05], [0.048, 0.075], [0.043, 0.11], [0.07, 0.21], [0.076, 0.27], [0.062, 0.37], [0.04, 0.45], [0.036, 0.5], [0.05, 0.53], [0.064, 0.56], [0.064, 0.6], [0, 0.6]];
  function balustrade(B, L, o = {}) {
    const Hh = o.h ?? 0.95, c = o.c ?? K.stone, bay = o.bay ?? 2.6, nb = Math.max(1, Math.round(L / bay)), bl = L / nb;
    const pw = 0.34, sy = 0.17, top = Hh - 0.13, bh = top - sy;
    B.box('paint', shade(c, 0.93), L, sy, 0.3, L / 2, sy / 2, 0, { r: 0.025 });
    B.add('paint', ext('coping', PROF.coping, L), c, L / 2, top, 0, {});
    for (let i = 0; i <= nb; i++) {
      if ((i === 0 && o.p0 === false) || (i === nb && o.p1 === false)) continue;
      const x = i * bl;
      B.box('paint', c, pw, Hh + 0.02, pw + 0.04, x, (Hh + 0.02) / 2, 0, { r: 0.03 });
      pbox(B, 'paint', shade(c, 1.03), pw + 0.08, 0.07, pw + 0.12, x, Hh + 0.055, 0);
      if ((i === 0 && o.lamp0) || (i === nb && o.lamp1)) pierLamp(B, x, Hh + 0.09, 0);
      else if (o.urns && i % o.urns === 0) urn(B, x, Hh + 0.09, 0, o.urnC);
      else if (o.balls !== false) { pbox(B, 'paint', c, 0.18, 0.05, 0.18, x, Hh + 0.115, 0); B.sph('paint', c, 0.1, x, Hh + 0.24, 0, { ws: 10, hs: 7 }); }
      if (i < nb) {
        const x0 = x + pw / 2 + 0.06, x1 = x + bl - pw / 2 - 0.06, n = Math.max(1, Math.round((x1 - x0) / 0.2));
        for (let k = 0; k <= n; k++) B.lathe('paint', c, BALU, x0 + ((x1 - x0) * k) / n, sy, 0, { seg: o.seg ?? 7, sy: bh / 0.6 });
      }
    }
    if (o.col !== false) COL(B, o.c0 ?? -pw / 2, 0, -0.2, L + (o.c1 ?? pw / 2), Hh + 0.1, 0.2, { rail: true });
  }
  // planted stone urn
  function urn(B, x, y, z, flowers = K.coral) {
    B.lathe('paint', K.stone, [[0, 0], [0.12, 0], [0.12, 0.04], [0.06, 0.08], [0.06, 0.14], [0.16, 0.2], [0.21, 0.32], [0.22, 0.4], [0.2, 0.42], [0, 0.42]], x, y, z, { seg: 10 });
    B.add('foliage', G_blob(0.2, 1, 3), K.leaf, x, y + 0.47, z, { sy: 0.7 });
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; B.sph(NS('paint'), flowers, 0.045, x + Math.cos(a) * 0.14, y + 0.52 + (i % 2) * 0.04, z + Math.sin(a) * 0.14, { ws: 6, hs: 4 }); }
  }
  const G_blob = (r, det, seed) => tpl(['blob', r, det, seed].map(kf).join('|'), () => H.blobGeo(r, det, seed));

  // cast-iron sea railing along +X (height 1.05): moulded posts with ball finials every ~1.8 m, rounded top rail,
  // bottom rail, dog bars, a band of rings under the top rail; collides as a thin wall (players can hop it)
  function ironRail(B, L, o = {}) {
    const Hh = o.h ?? 1.05, c = o.c ?? K.iron, nb = Math.max(1, Math.round(L / (o.bay ?? 1.8))), bl = L / nb;
    B.cyl('gloss', c, 0.028, L, L / 2, Hh, 0, { rz: HP, seg: 8, open: true });
    B.cyl('gloss', c, 0.017, L, L / 2, Hh - 0.24, 0, { rz: HP, seg: 6, open: true });
    B.cyl('gloss', c, 0.017, L, L / 2, 0.1, 0, { rz: HP, seg: 6, open: true });
    for (let i = 0; i <= nb; i++) {
      const x = i * bl;
      if ((i === 0 && o.p0 === false) || (i === nb && o.p1 === false)) continue;
      B.lathe('gloss', c, [[0, 0], [0.07, 0], [0.07, 0.04], [0.045, 0.08], [0.035, 0.16], [0.03, Hh - 0.1], [0.04, Hh - 0.04], [0.04, Hh + 0.03], [0.025, Hh + 0.06], [0, Hh + 0.07]], x, 0, 0, { seg: 8 });
      B.sph('gloss', c, 0.05, x, Hh + 0.1, 0, { ws: 8, hs: 6 });
      if (i < nb) {
        const n = Math.max(2, Math.round(bl / 0.12));
        for (let k = 1; k < n; k++) {
          const xx = x + (k * bl) / n;
          B.cyl(NS('gloss'), c, 0.009, Hh - 0.34, xx, 0.1 + (Hh - 0.34) / 2, 0, { seg: 4, open: true });
          if (k % 2 === 1) B.tor(NS('gloss'), c, 0.085, 0.009, xx + bl / n / 2 - bl / n / 2, Hh - 0.12, 0, { rs: 3, ts: 10 });
        }
      }
    }
    if (o.col !== false) COL(B, 0, 0, -0.08, L, Hh + 0.12, 0.08, { rail: true });
  }

  // ------------------------------------------------------------------------------------------ street furniture
  // Victorian seafront lamp standard: a coiled-dolphin cast-iron base on a stone plinth, fluted column with collars,
  // variant 0 = one lantern on top, 1 = scrolled crossarm with two lanterns, 2 = five-light candelabra
  function lantern(B, x, y, z, s = 1) {
    B.push(x, y, z, 0, 0, 0, s);
    B.lathe('gloss', K.ironDk, [[0, 0], [0.05, 0], [0.11, 0.06], [0.13, 0.1], [0.1, 0.12], [0, 0.12]], 0, 0, 0, { seg: 6 });
    B.lathe(NS('glow'), K.lamp, [[0, 0.1], [0.11, 0.12], [0.14, 0.34], [0.12, 0.42], [0, 0.42]], 0, 0, 0, { seg: 6, glow: 1.5 });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; B.cyl(NS('gloss'), K.ironDk, 0.01, 0.32, Math.cos(a) * 0.14, 0.27, Math.sin(a) * 0.14, { seg: 4, rz: -Math.cos(a) * 0.08, rx: Math.sin(a) * 0.08 }); }
    B.lathe('gloss', K.ironDk, [[0, 0.4], [0.17, 0.42], [0.18, 0.45], [0.08, 0.56], [0.04, 0.62], [0, 0.63]], 0, 0, 0, { seg: 6 });
    B.sph('gloss', K.gold, 0.035, 0, 0.66, 0, { ws: 6, hs: 4 });
    B.pop();
  }
  function dolphinBase(B, c) {
    B.lathe('paint', K.granite, [[0, 0], [0.34, 0], [0.34, 0.1], [0.3, 0.14], [0.28, 0.3], [0.24, 0.34], [0, 0.34]], 0, 0, 0, { seg: 10 });
    B.lathe('gloss', c, [[0, 0.34], [0.2, 0.34], [0.2, 0.4], [0.14, 0.46], [0.11, 0.62], [0.13, 0.66], [0.09, 0.7], [0, 0.7]], 0, 0, 0, { seg: 10 });
    // three dolphins coiled round the foot of the column: fat bodies tapering to upturned tails
    for (let k = 0; k < 3; k++) {
      const a0 = (k / 3) * TAU, pts = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10, a = a0 + t * 2.2, r = 0.18 - 0.06 * t; pts.push(P3(Math.cos(a) * r, 0.42 + t * 0.55 + 0.08 * Math.sin(t * PI), Math.sin(a) * r)); }
      B.add('gloss', tpl('dolph' + k, () => tubeGeo(pts, (t) => 0.012 + 0.05 * Math.pow(Math.sin(PI * Math.min(1, t * 1.25)), 0.7), 6)), c, 0, 0, 0, {});
      const p = pts[pts.length - 1];
      B.push(p[0], p[1], p[2], -(a0 + 2.2)); pbox(B, 'gloss', c, 0.02, 0.08, 0.12, 0, 0.02, 0, { rx: 0.4 }); B.pop();
    }
  }
  D.tidewater_lamp = {
    desc: 'Victorian seafront lamp standard: granite plinth, three coiled cast-iron dolphins round the foot, fluted column with gilt collars; variant 0 single lantern on top, 1 scrolled crossarm with two lanterns (arm along X), 2 five-light candelabra. Lanterns glow at dusk. Base collides.',
    params: { color: 'iron paint', height: 'm (4.2)' }, variants: 3, mount: 'ground',
    build(B, o) {
      const c = o.color ?? K.iron, v = (o.variant ?? 0) % 3, Hh = o.height ?? (v === 2 ? 4.6 : 4.2);
      dolphinBase(B, c);
      B.lathe('gloss', c, [[0.075, 0.7], [0.07, 1.2], [0.058, Hh - 0.35], [0.07, Hh - 0.3], [0.07, Hh - 0.22], [0.05, Hh - 0.18], [0, Hh - 0.18]], 0, 0, 0, { seg: 10 });
      for (const yy of [1.2, 1.26, Hh - 0.36]) B.tor(NS('metal'), K.gold, 0.072, 0.012, 0, yy, 0, { rx: HP, rs: 4, ts: 12 });
      const basket = (x, y, z) => {
        B.tube(NS('metal'), K.ironDk, [P3(x, y + 0.45, z), P3(x, y + 0.1, z)], 0.008, { radial: 3 });
        B.lathe('metal', K.ironDk, [[0, 0], [0.2, 0.02], [0.27, 0.16], [0, 0.16]], x, y - 0.1, z, { seg: 8 });
        B.add('foliage', G_blob(0.3, 1, 11), K.leaf, x, y + 0.02, z, { sy: 0.7 });
        for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; B.sph(NS('paint'), [K.coral, '#f1ede0', '#9a6ac2', '#e7d24a'][i % 4], 0.055, x + Math.cos(a) * 0.24, y + (i % 2) * 0.1 - 0.08, z + Math.sin(a) * 0.24, { ws: 5, hs: 4 }); }
        for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; B.tube(NS('foliage'), K.leafLt, [P3(x + Math.cos(a) * 0.24, y - 0.05, z + Math.sin(a) * 0.24), P3(x + Math.cos(a) * 0.3, y - 0.35, z + Math.sin(a) * 0.3), P3(x + Math.cos(a) * 0.28, y - 0.6, z + Math.sin(a) * 0.28)], 0.02, { radial: 3 }); }
      };
      if (o.baskets && v !== 1) { B.tube('gloss', c, [P3(0, Hh - 1.2, 0), P3(0.3, Hh - 1.05, 0), P3(0.55, Hh - 1.1, 0)], 0.018, { radial: 4 }); basket(0.55, Hh - 1.65, 0); }
      if (v === 0) lantern(B, 0, Hh - 0.2, 0, 1.1);
      else if (v === 1) {
        const ay = Hh - 0.45;
        B.tube('gloss', c, [P3(-0.62, ay + 0.1, 0), P3(-0.4, ay - 0.02, 0), P3(0, ay, 0), P3(0.4, ay - 0.02, 0), P3(0.62, ay + 0.1, 0)], 0.025, { radial: 6 });
        for (const sx of [-1, 1]) {
          B.tube(NS('gloss'), c, [P3(0, ay - 0.5, 0), P3(sx * 0.15, ay - 0.45, 0), P3(sx * 0.32, ay - 0.25, 0), P3(sx * 0.3, ay - 0.1, 0), P3(sx * 0.22, ay - 0.08, 0)], 0.012, { radial: 4 });
          B.tor(NS('gloss'), c, 0.05, 0.01, sx * 0.24, ay - 0.13, 0, { rs: 3, ts: 8 });
          lantern(B, sx * 0.62, ay + 0.1, 0, 0.95);
          if (o.baskets) basket(sx * 0.4, ay - 0.55, 0);
        }
      } else {
        lantern(B, 0, Hh - 0.2, 0, 1.1);
        const ay = Hh - 0.7;
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + PI / 4, dx = Math.cos(a), dz = Math.sin(a);
          B.tube('gloss', c, [P3(0, ay - 0.2, 0), P3(dx * 0.25, ay - 0.1, dz * 0.25), P3(dx * 0.45, ay + 0.08, dz * 0.45), P3(dx * 0.5, ay + 0.2, dz * 0.5)], 0.02, { radial: 5 });
          lantern(B, dx * 0.5, ay + 0.22, dz * 0.5, 0.85);
        }
      }
      B.col(-0.3, 0, -0.3, 0.3, 1.1, 0.3, { roof: true });
      B.blob(1.0, 1.0);
    },
  };

  // seaside bench: cast-iron scroll ends (sea green), varnished slats, faces +Z; optional back-to-back pair
  function benchUnit(B, L, c) {
    for (const fx of [-1, 1]) {
      const x = fx * (L / 2 - 0.08);
      B.tube('gloss', c, [P3(x, 0.0, 0.26), P3(x, 0.22, 0.22), P3(x, 0.42, 0.2), P3(x, 0.44, 0.0), P3(x, 0.44, -0.18)], 0.028, { radial: 5 });
      B.tube('gloss', c, [P3(x, 0.0, -0.24), P3(x, 0.2, -0.2), P3(x, 0.44, -0.18), P3(x, 0.66, -0.26), P3(x, 0.86, -0.3), P3(x, 0.9, -0.24)], 0.028, { radial: 5 });
      B.tube(NS('gloss'), c, [P3(x, 0.44, 0.2), P3(x, 0.6, 0.24), P3(x, 0.64, 0.14), P3(x, 0.56, 0.1)], 0.022, { radial: 4 });
      B.tor(NS('gloss'), c, 0.05, 0.012, x, 0.2, 0.02, { ry: HP, rs: 3, ts: 8 });
    }
    for (let i = 0; i < 4; i++) B.box('wood', shade(K.woodLt, 0.92 + (i % 2) * 0.08), L, 0.035, 0.085, 0, 0.47, 0.17 - i * 0.105, { r: 0.012 });
    for (let i = 0; i < 3; i++) { B.push(0, 0.56 + i * 0.12, -0.215 - i * 0.03, 0, -0.25); B.box('wood', shade(K.woodLt, 0.95 + (i % 2) * 0.06), L - 0.05, 0.085, 0.03, 0, 0, 0, { r: 0.012 }); B.pop(); }
  }
  D.tidewater_bench = {
    desc: 'Victorian seaside bench: sea-green cast-iron scroll ends, varnished slat seat + back, faces +Z. variant 1 = back-to-back pair. Low collider.',
    params: { length: 'm (1.9)', color: 'iron' }, variants: 2, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 1.9, c = o.color ?? K.iron;
      benchUnit(B, L, c);
      const pair = (o.variant ?? 0) % 2, z0 = pair ? -0.95 : -0.32, nc = o.segCol ?? 1;
      if (pair) { B.push(0, 0, -0.64, PI); benchUnit(B, L, c); B.pop(); }
      // nc > 1 splits the collider along the bench so a bench turned off-axis keeps a tight AABB footprint
      for (let k = 0; k < nc; k++) B.col(-L / 2 + (k * L) / nc, 0, z0 + (nc > 1 ? 0.1 : 0), -L / 2 + ((k + 1) * L) / nc, 0.9, 0.3 - (nc > 1 ? 0.1 : 0));
      B.blob(L + 0.3, 0.9);
    },
  };

  D.tidewater_balustrade = {
    desc: 'Portland-stone balustrade run along +X from pos: plinth, vase balusters, moulded coping, piers every ~2.6 m with ball finials (urns: every Nth pier carries a planted urn). Collides as a low wall (0.95 m) unless col:false.',
    params: { length: 'm (4)', h: 'm (0.95)', urns: 'N', col: 'bool', p0: 'first pier', p1: 'last pier' }, variants: 1, mount: 'ground',
    build(B, o) { balustrade(B, o.length ?? 4, o); },
  };
  D.tidewater_searail = {
    desc: 'Sea-green cast-iron promenade railing along +X from pos (posts with ball finials, rings under the top rail, dog bars); collides as a thin 1.1 m wall.',
    params: { length: 'm (6)', col: 'bool' }, variants: 1, mount: 'ground',
    build(B, o) { ironRail(B, o.length ?? 6, o); },
  };

  // ------------------------------------------------------------------------------------------ the Jubilee clock tower
  // dial: cream glass disc (glows at dusk), iron bezel, minute ring, hour batons (heavier at 12 / 3 / 6 / 9), gilt
  // spade hands at ten past ten, centre boss
  function clockFace(B, x, y, z, R, ry) {
    B.push(x, y, z, ry);
    B.add(NS('glow'), discGeo(R, 32), '#f6eedb', 0, 0, 0.02, { glow: 0.95 });
    B.tor('gloss', K.ironDk, R + 0.03, 0.05, 0, 0, 0.03, { rs: 4, ts: 32 });
    B.tor(NS('gloss'), K.gold, R + 0.1, 0.03, 0, 0, 0.02, { rs: 4, ts: 32 });
    B.tor(NS('paint'), K.ink, R * 0.86, 0.008, 0, 0, 0.03, { rs: 3, ts: 32 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, big = i % 3 === 0;
      B.push(Math.sin(a) * R * 0.74, Math.cos(a) * R * 0.74, 0.03, 0, 0, -a);
      pbox(B, NS('paint'), K.ink, big ? 0.07 : 0.04, big ? 0.24 : 0.16, 0.01, 0, 0, 0);
      B.pop();
    }
    const hand = (a, len, w) => { B.push(0, 0, 0.05, 0, 0, -a); pbox(B, NS('gloss'), K.ink, w, len, 0.012, 0, len / 2 - 0.06, 0); B.add(NS('gloss'), triGeo(w * 2.8, w * 2.4), K.ink, 0, len - 0.06, 0.001, {}); B.pop(); };
    hand((10 + 10 / 60) / 12 * TAU, R * 0.5, 0.05);
    hand((10 / 60) * TAU, R * 0.74, 0.035);
    B.cyl(NS('gloss'), K.gold, 0.05, 0.05, 0, 0, 0.07, { rx: HP, seg: 10 });
    B.pop();
  }
  D.tidewater_clocktower = {
    desc: 'Jubilee clock tower dressing for the 3.4 m square tower block (pos = centre of its base on the terrace, block rises 11.3 m): granite quoins, drinking-fountain troughs (±X) and JUBILEE plaques (±Z) on the plinth, string courses, tall lancet slots, four gabled clock stages with glowing dials, then (above the block) an open belfry with a bell, a balustrade, the copper ogee dome, a lantern and a ship weather vane (~18 m). open: the tower stands on an open arcade instead (the layout\'s TW.arcade piers + soffit: round arches on all four faces, archivolts + keystones, quoined piers, a frieze with bronze plaques under a cornice; the spandrels collide). Mirror-symmetric; place once (mirror:false).',
    params: { top: 'block height over pos (m)', open: 'bool: the open-arcade base (Tower Command)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const Wd = 3.4, hw = Wd / 2, TOP = o.top ?? 11.3, stucco = K.stucco, trim = K.trim, open = !!o.open;
      // the open arcade (heights prop-local: pos is on the dais): piers at the corners, a round arch on each face
      const AR = TW.arcade, AW = AR.hw, OP = AR.open, PD = AW - OP, SP = AR.spring - TERR.daisTop, SO = AR.soffit - TERR.daisTop, AT = AR.top - TERR.daisTop;
      const LIFT = open ? 1.9 : 0;   // the shaft's lancet slots ride up above the arcade
      if (open) {
        // wall between the piers over the springing, the half-disc of the arch cut out (profile: u across, y up)
        const spand = [[OP, SP], [OP, SO], [-OP, SO], [-OP, SP], ...Array.from({ length: 23 }, (_, i) => { const a = PI - ((i + 1) / 24) * PI; return [Math.cos(a) * OP, SP + Math.sin(a) * OP]; })];
        for (let side = 0; side < 4; side++) {
          const ry = side * HP;
          fpush(B, Math.sin(ry) * AW, 0, Math.cos(ry) * AW, ry);
          B.add('paint', ext('twSpand', spand, PD), stucco, 0, 0, -PD / 2, { ry: HP });
          // archivolts (both faces), keystone, impost bands on the jambs
          for (const z of [0.04, -PD - 0.04]) B.tube('paint', trim, arcPts(0, SP, z, OP + 0.08, 0, PI, 18), 0.08, { radial: 5 });
          pbox(B, 'paint', trim, 0.3, 0.34, 0.12, 0, SP + OP + 0.08, 0.06);
          for (const sx of [-1, 1]) {
            pbox(B, 'paint', trim, 0.12, 0.12, PD + 0.12, sx * (OP + 0.05), SP - 0.06, -PD / 2);
            // pier: granite plinth + quoins on the outer corner
            B.add('paint', ext('plinthTA', PROF.plinth, PD + 0.18), K.granite, sx * (AW - PD / 2), 0, 0, {});
            quoins(B, sx * (AW - 0.01), 0.34, SP + 0.4, sx, '#c9c2b2');
          }
          // string course, frieze (bronze plaque), cornice; the soffit's inner cornice
          mould(B, 'paint', trim, 'string', 2 * AW + 0.12, 0, SO - 0.12, 0);
          pbox(B, 'paint', mixc(stucco, K.stoneDk, 0.25), 2 * AW - 0.1, AT - 0.36 - SO, 0.04, 0, SO + (AT - 0.36 - SO) / 2, 0.02);
          B.add('paint', ext('cornTA', PROF.cornice, 2 * AW + 0.3), trim, 0, AT - 0.36, 0, {});
          B.add('paint', ext('strTA', PROF.string, 2 * OP), trim, 0, SO - 0.12, -PD, { ry: PI });
          pbox(B, 'paint', trim, 1.9, 0.42, 0.05, 0, SO + 0.26, 0.045);
          pbox(B, 'metal', K.bronze, 1.7, 0.3, 0.03, 0, SO + 0.26, 0.075);
          letters(B, side % 2 === 0 ? 'JUBILEE 1887' : 'VICTORIA R', { h: 0.13, x: 0, y: SO + 0.195, z: 0.094, c: '#f0d9a0', flat: true, wt: 0.22, track: 0.14, mat: 'metal' });
          // the spandrels collide (stepped under the arch; clear of the tower and its riders)
          for (const sx of [-1, 1]) for (const [u0, u1] of [[0.5, 1.0], [1.0, 1.3], [1.3, OP]]) {
            const y0 = SP + Math.sqrt(OP * OP - u0 * u0);   // the arch's height at the strip's inner edge
            COL(B, Math.min(sx * u0, sx * u1), y0, -PD, Math.max(sx * u0, sx * u1), SO, 0, { roof: true });
          }
          fpop(B);
        }
      }
      for (let side = 0; side < 4; side++) {
        const ry = side * HP;
        fpush(B, Math.sin(ry) * hw, 0, Math.cos(ry) * hw, ry);
        if (open) {
          // the shaft rises off the arcade: a granite base course on its top
          B.add('paint', ext('plinthT', PROF.plinth, Wd + 0.18), K.granite, 0, AT, 0, {});
        } else {
        // plinth: granite base course + quoins
        B.add('paint', ext('plinthT', PROF.plinth, Wd + 0.18), K.granite, 0, 0, 0, {});
        for (const sx of [-1, 1]) quoins(B, sx * (hw - 0.01), 0.34, 2.3, sx, '#c9c2b2');
        mould(B, 'paint', trim, 'string', Wd + 0.16, 0, 2.3, 0);
        if (side % 2 === 0) {
          // bronze jubilee plaque in a moulded frame
          pbox(B, 'paint', trim, 1.3, 0.8, 0.05, 0, 1.35, 0.025);
          pbox(B, 'metal', K.bronze, 1.1, 0.6, 0.03, 0, 1.35, 0.06);
          letters(B, 'JUBILEE', { h: 0.14, x: 0, y: 1.44, z: 0.082, c: '#f0d9a0', flat: true, wt: 0.22, track: 0.16, mat: 'metal' });
          letters(B, '1887', { h: 0.18, x: 0, y: 1.15, z: 0.082, c: '#f0d9a0', flat: true, wt: 0.22, track: 0.2, mat: 'metal' });
        } else {
          // drinking fountain: shell niche, lion-mask spout, granite trough (low cover)
          B.add(NS('paint'), archPanelGeo(0.9, 0.7, 10), K.stoneDk, 0, 0.75, 0.01, {});
          B.tube('paint', trim, arcPts(0, 1.45, 0.04, 0.5, 0, PI, 10), 0.05, { radial: 5 });
          for (const sx of [-1, 1]) pbox(B, 'paint', trim, 0.1, 0.72, 0.08, sx * 0.5, 1.09, 0.04);
          B.sph('metal', K.bronze, 0.1, 0, 1.3, 0.06, { ws: 8, hs: 6 });
          B.cyl('metal', K.bronze, 0.018, 0.12, 0, 1.24, 0.14, { rx: HP, seg: 6 });
          B.box('paint', K.granite, 1.1, 0.5, 0.42, 0, 0.25, 0.22, { r: 0.05 });
          COL(B, -0.55, 0, 0, 0.55, 0.5, 0.43);
          B.box(NS('gloss'), K.water, 0.94, 0.02, 0.3, 0, 0.47, 0.22, { r: 0.01 });
        }
        }
        // shaft: corner pilaster strips, a tall lancet slot with a hood mould
        const S0 = open ? AT + 0.34 : 2.42;
        for (const sx of [-1, 1]) pbox(B, 'paint', trim, 0.28, TOP - 2.9 - S0, 0.05, sx * (hw - 0.14), S0 + (TOP - 2.9 - S0) / 2, 0.025);
        B.add(NS('gloss'), archPanelGeo(0.42, 2.2, 8), K.glass, 0, 3.7 + LIFT, 0.012, {});
        B.tube('paint', trim, arcPts(0, 5.9 + LIFT, 0.03, 0.29, 0, PI, 8), 0.045, { radial: 4 });
        for (const sx of [-1, 1]) pbox(B, 'paint', trim, 0.08, 2.2, 0.06, sx * 0.29, 4.8 + LIFT, 0.03);
        B.add('paint', ext('sillT', PROF.sill, 0.8), trim, 0, 3.62 + LIFT, 0, {});
        if (!open) mould(B, 'paint', trim, 'string', Wd + 0.16, 0, 6.9, 0);
        // clock stage: cornice band, gablet over the dial, the dial
        mould(B, 'paint', trim, 'string', Wd + 0.16, 0, TOP - 2.95, 0);
        pbox(B, 'paint', mixc(stucco, K.stoneDk, 0.3), Wd - 0.5, 2.3, 0.04, 0, TOP - 1.65, 0.02);
        clockFace(B, 0, TOP - 1.7, 0.02, 0.92, 0);
        for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) B.add(NS('paint'), triGeo(0.3, 0.3), K.gold, sx * 1.22, TOP - 1.7 + sy * 0.98, 0.045, { rz: sx * sy > 0 ? (sx > 0 ? PI * 0.75 : -PI * 0.75) : (sx > 0 ? PI / 4 : -PI / 4) });
        B.add('paint', ext('cornT', PROF.cornice, Wd + 0.3), trim, 0, TOP - 0.36, 0, {});
        // gablet above the cornice (pediment) with a gilt roundel
        B.add('paint', triGeo(Wd - 0.2, 0.9), stucco, 0, TOP, -0.05, {});
        for (const s of [-1, 1]) { B.push(s * (Wd - 0.2) / 4, TOP + 0.45, 0.0, 0, 0, -s * Math.atan2(0.9, (Wd - 0.2) / 2)); pbox(B, 'paint', trim, Math.hypot(0.9, (Wd - 0.2) / 2) + 0.12, 0.12, 0.16, 0, 0, 0); B.pop(); }
        B.cyl('gloss', K.gold, 0.16, 0.04, 0, TOP + 0.3, 0.0, { rx: HP, seg: 12 });
        fpop(B);
      }
      // corner pinnacles on the clock-stage cornice (spiky Victorian silhouette)
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const px = sx * (hw + 0.05), pz = sz * (hw + 0.05);
        B.box('paint', trim, 0.36, 0.3, 0.36, px, TOP + 0.15, pz, { r: 0.03 });
        B.lathe('paint', stucco, [[0.15, 0], [0.15, 0.5], [0.19, 0.55], [0.19, 0.62], [0, 0.62]], px, TOP + 0.3, pz, { seg: 4, ry: PI / 4 });
        B.lathe('paint', K.slate, [[0.2, 0], [0.12, 0.3], [0.03, 0.75], [0, 0.8]], px, TOP + 0.92, pz, { seg: 4, ry: PI / 4 });
        B.sph('metal', K.gold, 0.05, px, TOP + 1.76, pz, { ws: 6, hs: 4 });
      }
      // gablet roofs: pyramid of slate over the square top, hidden mostly by the belfry
      B.lathe('paint', K.slate, [[hw * 1.414, 0], [0.9, 0.85], [0, 0.95]], 0, TOP, 0, { seg: 4, ry: PI / 4 });
      // belfry: square base, four clustered corner columns, arches, bell, balustrade round the top
      const BY = TOP + 0.75;
      B.box('paint', trim, 2.5, 0.3, 2.5, 0, BY + 0.15, 0, { r: 0.04 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        B.cyl('paint', stucco, 0.14, 1.9, sx * 1.0, BY + 1.25, sz * 1.0, { seg: 10 });
        B.box('paint', trim, 0.36, 0.14, 0.36, sx * 1.0, BY + 0.37, sz * 1.0, { r: 0.02 });
        B.box('paint', trim, 0.38, 0.16, 0.38, sx * 1.0, BY + 2.26, sz * 1.0, { r: 0.02 });
      }
      for (let side = 0; side < 4; side++) {
        const ry = side * HP;
        B.push(Math.sin(ry) * 1.0, 0, Math.cos(ry) * 1.0, ry);
        B.tube('paint', trim, arcPts(0, BY + 1.75, 0, 0.72, 0.05, PI - 0.05, 10), 0.07, { radial: 5 });
        pbox(B, 'paint', trim, 2.3, 0.3, 0.2, 0, BY + 2.49, 0);
        B.pop();
      }
      B.lathe('metal', K.bronze, [[0, 0.62], [0.12, 0.6], [0.22, 0.45], [0.3, 0.12], [0.36, 0], [0.3, 0.02], [0, 0.05]], 0, BY + 1.0, 0, { seg: 14 });
      B.box('paint', trim, 2.7, 0.2, 2.7, 0, BY + 2.72, 0, { r: 0.04 });
      for (let side = 0; side < 4; side++) { B.push(0, BY + 2.82, 0, side * HP); B.push(-1.2, 0, 1.22, 0); balustrade(B, 2.4, { h: 0.55, bay: 2.4, col: false, balls: true, seg: 5 }); B.pop(); B.pop(); }
      // copper ogee dome, lantern, finial, ship vane
      const DY = BY + 2.82;
      COL(B, -1.35, BY, -1.35, 1.35, DY + 0.62, 1.35, { rail: true });   // open belfry + its balustrade
      COL(B, -1.05, DY + 0.62, -1.05, 1.05, DY + 2.4, 1.05, { roof: true });
      B.lathe('gloss', K.copper, [[1.05, 0], [1.02, 0.25], [0.9, 0.55], [0.62, 0.95], [0.42, 1.3], [0.34, 1.62], [0.26, 1.75], [0, 1.8]], 0, DY, 0, { seg: 16 });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; B.tube(NS('gloss'), K.copperDk, [P3(Math.cos(a) * 1.05, DY + 0.02, Math.sin(a) * 1.05), P3(Math.cos(a) * 0.92, DY + 0.55, Math.sin(a) * 0.92), P3(Math.cos(a) * 0.62, DY + 0.97, Math.sin(a) * 0.62), P3(Math.cos(a) * 0.4, DY + 1.34, Math.sin(a) * 0.4), P3(Math.cos(a) * 0.27, DY + 1.76, Math.sin(a) * 0.27)], 0.025, { radial: 4 }); }
      const LY = DY + 1.72;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; B.cyl('paint', trim, 0.035, 0.55, Math.cos(a) * 0.24, LY + 0.3, Math.sin(a) * 0.24, { seg: 5 }); }
      B.lathe(NS('glow'), K.lamp, [[0, 0.02], [0.2, 0.04], [0.2, 0.5], [0, 0.52]], 0, LY, 0, { seg: 8, glow: 0.8 });
      B.lathe('gloss', K.copper, [[0.34, 0], [0.3, 0.06], [0.14, 0.3], [0.05, 0.42], [0, 0.45]], 0, LY + 0.58, 0, { seg: 12 });
      B.sph('metal', K.gold, 0.1, 0, LY + 1.1, 0, { ws: 10, hs: 7 });
      B.cyl('metal', K.ink, 0.02, 1.3, 0, LY + 1.5, 0, { seg: 5 });
      for (const a of [0, HP]) pbox(B, 'metal', K.ink, 0.7, 0.014, 0.014, 0, LY + 1.35, 0, { ry: a });
      // ship weather vane: hull, three masts with sails, pennant (flat profile, gilt)
      B.push(0, LY + 1.95, 0, 0.7);
      B.add('metal', tpl('vane-ship', () => extrudeGeo([[-0.34, 0], [0.34, 0], [0.42, 0.1], [-0.4, 0.1]], 0.02, 0.002)), K.gold, 0, 0, 0, { ry: HP });
      for (const [x, hh] of [[-0.18, 0.42], [0.02, 0.52], [0.2, 0.4]]) {
        pbox(B, 'metal', K.gold, 0.012, 0.012, hh, 0, 0.1 + hh / 2, x, { sx: 0.012, sy: hh, sz: 0.012 });
        B.add('metal', tpl('vane-sail' + hh, () => extrudeGeo([[-0.09, 0], [0.09, 0], [0.07, hh * 0.7], [-0.07, hh * 0.7]], 0.012, 0.002)), K.gold, 0, 0.14, x, { ry: HP });
      }
      B.pop();
    },
  };

  // ------------------------------------------------------------------------------------------ Town Hall / Custom House
  // pos = centre of the playable back wall face (local z = 0), building behind (local -z). The spawn loggia floor is
  // at y = 2.4 (x -9.5 … 9.5), the east wing's roof walk at 2.4 (x 9.5 … 22); the playable wall is 5.2 m tall.
  // variant 0 = TOWN HALL (Alpha's end), 1 = CUSTOM HOUSE (Bravo's end): same massing, own name + crest + colours.
  D.tidewater_townhall = {
    desc: 'Town Hall (variant 0) / Custom House (1): blind arcade of glazed doors with fanlights behind the spawn loggia and the east wing walk, pilasters, lanterns; above the 5.2 m wall a two-storey stucco palazzo — giant-order centre pavilion with a pediment carrying the borough crest, the name in bronze letters on the frieze, sash windows with hoods and balconettes, balustraded parapet with urns, slate roof with dormers and chimneys, a flagstaff; building mass behind the wall for outside views. Upper storey collides (camera-safe).',
    params: {}, variants: 2, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const v = (o.variant ?? 0) % 2, stucco = v ? '#eadfcb' : K.stucco, trim = K.trim, accent = v ? K.navy : K.ironDk;
      const WT = 5.2, X0 = -9.5, X1 = 22, BZ = -8.5;
      // ---- ground level: blind arcade behind the loggia (floor 2.4) and the wing walk
      B.push(0, 2.4, 0);
      for (const x of [-7.2, -3.6, 0, 3.6, 7.2]) archOpening(B, x, 0, 1.7, 1.75, { door: accent, lit: 0.9, key: K.stone });
      for (const x of [-9.0, -5.4, -1.8, 1.8, 5.4, 9.0]) pilaster(B, x, 0, WT - 2.4 - 0.25, 0.42, trim, 0.08);
      for (const x of [11.6, 15.2]) sash(B, x, 0.55, 1.1, 1.65, { frame: trim, lit: 0.8, key: true });
      B.pop();
      // wall lanterns between the doors
      for (const x of [-5.4, -1.8, 1.8, 5.4, 13.4, 17.0]) { pbox(B, 'gloss', K.ironDk, 0.06, 0.4, 0.2, x, 4.25, 0.1); lantern(B, x, 3.9, 0.3, 0.8); }
      // cornice over the playable wall (hides the seam to the upper storey)
      B.add('paint', ext('cornTH', PROF.cornice, X1 - X0 + 0.2), trim, (X0 + X1) / 2, WT - 0.35, 0, {});
      // ---- upper storeys (facade plane z = 0, from WT), weatherings, windows
      const U0 = WT, U1 = 10.4, FZ = -0.02;
      B.box('paint', stucco, X1 - X0, U1 - U0, 7.5, (X0 + X1) / 2, (U0 + U1) / 2, FZ - 3.75, { r: 0.05 });
      mould(B, 'paint', trim, 'string', X1 - X0, (X0 + X1) / 2, 7.55, FZ);
      // side bays: sash windows (first floor with hoods + balconettes, second floor plain)
      const bays = [-8.1, -6.2, 6.2, 8.1, 11.2, 13.4, 15.6, 17.8, 20.0];
      for (const x of bays) {
        sash(B, x, 5.85, 0.95, 1.5, { frame: trim, hood: x > 10 ? 'cornice' : 'pediment', lit: 0.7, balconette: x < 10 });
        sash(B, x, 8.2, 0.95, 1.2, { frame: trim, lit: 0.6 });
      }
      // centre pavilion: slightly proud, giant pilasters, three tall arched windows, entablature + pediment
      const PW = 5.2;
      B.box('paint', stucco, PW * 2, U1 - U0 + 1.2, 0.3, 0, (U0 + U1 + 1.2) / 2, 0.13, { r: 0.04 });
      for (const x of [-4.9, -1.75, 1.75, 4.9]) pilaster(B, x, U0, U1 + 0.2, 0.5, trim, 0.12);
      for (const x of [-3.3, 0, 3.3]) { B.push(0, 0, 0.28); archOpening(B, x, 5.75, 1.3, 2.3, { lit: 0.75, transom: 0.72 }); B.pop(); }
      B.push(0, 0, 0.28);
      // bronze name on the frieze
      pbox(B, 'paint', trim, PW * 2 + 0.3, 0.7, 0.12, 0, U1 + 0.55, 0.06);
      letters(B, v ? 'CUSTOM HOUSE' : 'TOWN HALL', { h: 0.46, x: 0, y: U1 + 0.33, z: 0.12, c: K.bronze, mat: 'metal', dep: 0.04, bev: 0, wt: 0.17, track: v ? 0.16 : 0.24 });
      B.add('paint', ext('cornTH2', PROF.cornice, PW * 2 + 0.5), trim, 0, U1 + 0.9, 0, {});
      // pediment with the crest (ship on waves in a gilt roundel)
      const PY = U1 + 1.26, PHh = 1.9;
      B.add('paint', triGeo(PW * 2 + 0.2, PHh), stucco, 0, PY, 0.02, {});
      for (const s of [-1, 1]) { B.push(s * (PW + 0.1) / 2, PY + PHh / 2, 0.1, 0, 0, -s * Math.atan2(PHh, PW + 0.1)); B.box('paint', trim, Math.hypot(PHh, PW + 0.1) + 0.35, 0.22, 0.3, 0, 0, 0, { r: 0.03 }); B.pop(); }
      pbox(B, 'paint', trim, PW * 2 + 0.4, 0.14, 0.34, 0, PY + 0.02, 0.1);
      B.cyl('gloss', v ? K.navy : K.ironDk, 0.62, 0.06, 0, PY + 0.78, 0.06, { rx: HP, seg: 24 });
      B.tor(NS('metal'), K.gold, 0.64, 0.05, 0, PY + 0.78, 0.1, { rs: 4, ts: 28 });
      B.push(0, PY + 0.78, 0.12);
      B.add(NS('metal'), tpl('crest-hull', () => extrudeGeo([[-0.32, -0.12], [0.32, -0.12], [0.42, 0.02], [-0.42, 0.02]], 0.02, 0.003)), K.gold, 0, -0.05, 0, { ry: HP });
      pbox(B, NS('metal'), K.gold, 0.03, 0.5, 0.02, 0, 0.18, 0);
      B.add(NS('metal'), triGeo(0.36, 0.42), K.gold, 0.02, -0.02, 0.005, { rz: -0.1 });
      for (let k = 0; k < 3; k++) B.tube(NS('metal'), K.gold, arcPts(-0.3 + k * 0.2, -0.3, 0.01, 0.1, 0.2, PI - 0.2, 6), 0.018, { radial: 3 });
      B.pop();
      // urns on the pediment corners, figure-less acroterion on top
      for (const s of [-1, 1]) urn(B, s * (PW + 0.1), PY + 0.1, 0.1, v ? K.yellow : K.coral);
      B.lathe('paint', trim, [[0, 0], [0.2, 0], [0.18, 0.3], [0.1, 0.4], [0.14, 0.55], [0, 0.62]], 0, PY + PHh - 0.05, 0.1, { seg: 10 });
      B.pop();
      // parapet balustrade over the side bays with urns, cornice below
      B.add('paint', ext('cornTH3', PROF.cornice, X1 - X0), trim, (X0 + X1) / 2, U1 - 0.36, FZ, {});
      for (const [a, b] of [[X0, -PW], [PW, X1]]) { B.push(a, U1, 0.1); balustrade(B, b - a, { h: 0.85, bay: 2.3, col: false, urns: 2, urnC: v ? K.yellow : K.coral, seg: 5 }); B.pop(); }
      // slate roof behind the parapet: hipped block with dormers + chimneys, flagstaff on the pediment
      const RY = U1, RD = 7.3;
      B.push((X0 + X1) / 2, RY, FZ - 0.3 - RD / 2);
      B.add('paint', tpl('thRoof', () => extrudeGeo([[-RD / 2, 0], [RD / 2, 0], [0.6, 2.2], [-0.6, 2.2]], 1, 0.001)), K.slate, 0, 0, 0, { sx: X1 - X0 - 0.4 });
      B.pop();
      for (const x of [-7.2, 12.3, 16.7]) {
        B.push(x, RY + 0.5, FZ - 1.3);
        B.box('paint', stucco, 0.9, 1.0, 0.9, 0, 0.5, 0, { r: 0.03 });
        B.add('paint', tpl('dormRoof', () => extrudeGeo([[-0.55, 0], [0.55, 0], [0, 0.45]], 1.0, 0.001)), K.slateDk, 0, 1.0, -0.05, { ry: HP });
        pbox(B, NS('gloss'), K.glass, 0.5, 0.6, 0.02, 0, 0.5, 0.455);
        pbox(B, NS('paint'), K.white, 0.04, 0.6, 0.03, 0, 0.5, 0.465);
        B.pop();
      }
      for (const [x, z] of [[-5.6, -4.6], [5.6, -4.6], [19.6, -5.0], [14.0, -4.2]]) {
        B.box('paint', stucco, 1.1, 2.0, 0.7, x, RY + 2.2, FZ + z, { r: 0.03 });
        pbox(B, 'paint', trim, 1.24, 0.12, 0.84, x, RY + 3.2, FZ + z);
        for (const dx of [-0.3, 0, 0.3]) B.cyl('paint', K.pot, 0.08, 0.36, x + dx, RY + 3.44, FZ + z, { seg: 8 });
      }
      B.cyl('paint', K.white, 0.07, 6.5, 0, PY + PHh + 3.6, -0.3, { seg: 8 });
      B.sph('metal', K.gold, 0.11, 0, PY + PHh + 6.9, -0.3, { ws: 8, hs: 6 });
      B.flag(0, PY + PHh + 6.65, -0.3, { color: v ? K.navy : K.coral, s: 2.4 });
      // back of the building (outside views): the ground storeys behind the wall, the quay it stands on
      B.box(NS('paint'), stucco, X1 - X0, U0 + 1.2, 7.9, (X0 + X1) / 2, (U0 - 1.2) / 2, FZ - 4.15, { r: 0.03 });
      B.box(NS('paint'), K.stoneDk, X1 - X0 + 2, 2.2, 10, (X0 + X1) / 2, -1.1, BZ + 3.5, { r: 0.04 });
      B.push(X0 - 0.02, 0, (FZ + BZ) / 2, -HP);
      for (const x of [-2.4, 0, 2.4]) { sash(B, x, 1.4, 0.95, 1.5, { frame: trim, ns: true }); sash(B, x, 5.9, 0.95, 1.5, { frame: trim, ns: true }); sash(B, x, 8.2, 0.95, 1.2, { frame: trim, ns: true, key: false }); }
      B.pop();
      // back of the building (outside views)
      B.box(NS('paint'), stucco, X1 - X0, U1, 0.2, (X0 + X1) / 2, U1 / 2, BZ, { r: 0.03 });
      B.box(NS('paint'), stucco, 0.2, U1, -BZ, X1 - 0.1, U1 / 2, BZ / 2, { r: 0.03 });
      B.push((X0 + X1) / 2, 0, BZ - 0.1, PI);
      for (let x = -14; x <= 14.1; x += 3.5) { sash(B, x, 5.9, 0.95, 1.5, { frame: trim, ns: true, key: false }); sash(B, x, 1.4, 0.95, 1.5, { frame: trim, ns: true, key: false }); }
      B.pop();
      // colliders: the whole upper building above the playable wall (camera-safe), roof
      B.col(X0, WT, BZ, X1, U1 + 1.3, 0.35, { roof: true });
      B.col(-PW - 0.3, U1, BZ, PW + 0.3, PY + PHh, 0.4, { roof: true });
    },
  };
  // ------------------------------------------------------------------------------------------ the Colonnade
  // cast-iron column (foot at y = 0, abacus top at yTop): square plinth, fluted shaft with collars, bell capital
  function ironColumn(B, x, z, yTop, c = K.iron) {
    B.box('gloss', c, 0.36, 0.28, 0.36, x, 0.14, z, { r: 0.03 });
    B.lathe('gloss', c, [[0.15, 0.28], [0.15, 0.34], [0.115, 0.4], [0.1, 0.48], [0.09, yTop - 0.55], [0.105, yTop - 0.5], [0.095, yTop - 0.44], [0.14, yTop - 0.32], [0.19, yTop - 0.2], [0, yTop - 0.2]], x, 0, z, { seg: 10 });
    for (const yy of [0.6, yTop - 0.62]) B.tor(NS('gloss'), c, 0.098, 0.018, x, yy, z, { rx: HP, rs: 4, ts: 10 });
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + PI / 4; pbox(B, NS('gloss'), c, 0.03, yTop - 1.4, 0.03, x + Math.cos(a) * 0.09, (yTop + 0.1) / 2, z + Math.sin(a) * 0.09); }
    B.box('gloss', c, 0.42, 0.2, 0.42, x, yTop - 0.1, z, { r: 0.02 });
  }
  // shopfront on a wall (z = 0, facing +Z), W wide centred on x = 0, fascia with the name; o.c = paint, o.sign = board
  function shopfront(B, W, name, o = {}) {
    const c = o.c ?? K.navy, board = o.board ?? c, lc = o.lc ?? K.gold, Hs = o.h ?? 2.7;
    for (const sx of [-1, 1]) { pbox(B, 'paint', c, 0.2, Hs, 0.1, sx * (W / 2 - 0.1), Hs / 2, 0.05); pbox(B, 'paint', shade(c, 1.1), 0.26, 0.3, 0.16, sx * (W / 2 - 0.1), Hs - 0.02, 0.08); }
    const dw = 0.95, dx = o.doorLeft ? -W / 2 + 0.2 + dw / 2 : W / 2 - 0.2 - dw / 2;
    const wx0 = o.doorLeft ? dx + dw / 2 : -W / 2 + 0.2, wx1 = o.doorLeft ? W / 2 - 0.2 : dx - dw / 2, ww = wx1 - wx0, wxc = (wx0 + wx1) / 2;
    // stallriser + display window with a transom band of small panes
    pbox(B, 'paint', c, ww, 0.55, 0.08, wxc, 0.275, 0.04);
    pbox(B, 'paint', shade(c, 0.85), ww - 0.12, 0.35, 0.02, wxc, 0.28, 0.085);
    pbox(B, NS('gloss'), K.glass, ww, 1.55, 0.02, wxc, 1.33, 0.012);
    if (o.lit !== false) pbox(B, NS('glow'), o.glowC ?? K.lamp, ww - 0.1, 0.5, 0.004, wxc, 1.72, 0.024, { glow: o.lit ?? 0.7 });
    pbox(B, NS('paint'), c, ww, 0.06, 0.05, wxc, 0.58, 0.05);
    pbox(B, NS('paint'), c, ww, 0.07, 0.05, wxc, 1.85, 0.05);
    pbox(B, NS('paint'), c, ww, 0.06, 0.05, wxc, 2.1, 0.05);
    const nm = Math.max(1, Math.round(ww / 0.9));
    for (let i = 1; i < nm; i++) pbox(B, NS('paint'), c, 0.05, 1.55, 0.05, wx0 + (i * ww) / nm, 1.33, 0.05);
    for (let i = 1; i < nm * 3; i++) pbox(B, NS('paint'), c, 0.025, 0.25, 0.04, wx0 + (i * ww) / (nm * 3), 1.975, 0.045);
    // door: panelled leaf with a glazed top, brass handle, fanlight
    B.box('paint', c, dw, 2.05, 0.06, dx, 1.025, 0.02, { r: 0.012 });
    pbox(B, NS('gloss'), K.glass, dw - 0.24, 0.9, 0.012, dx, 1.45, 0.056);
    pbox(B, NS('paint'), shade(c, 0.85), dw - 0.24, 0.55, 0.012, dx, 0.48, 0.056);
    pbox(B, NS('metal'), K.gold, 0.035, 0.035, 0.08, dx + (o.doorLeft ? 0.33 : -0.33), 1.0, 0.09);
    pbox(B, NS('gloss'), K.glass, dw, 0.3, 0.012, dx, 2.25, 0.012);
    // fascia with raised letters, cornice, console brackets
    const fy = 2.52;
    B.box('paint', board, W - 0.1, 0.4, 0.1, 0, fy, 0.08, { r: 0.02 });
    pbox(B, 'paint', shade(board, 1.2), W - 0.1, 0.05, 0.12, 0, fy + 0.22, 0.09);
    if (name) letters(B, name, { h: o.lh ?? 0.2, x: 0, y: fy - (o.lh ?? 0.2) / 2, z: 0.135, c: lc, flat: true, wt: 0.2, track: 0.1, mat: o.glowLetters ? 'glow' : 'paint', glow: o.glowLetters });
    for (const sx of [-1, 1]) B.box('paint', shade(board, 1.1), 0.12, 0.44, 0.2, sx * (W / 2 - 0.06), fy - 0.04, 0.1, { r: 0.03 });
  }
  // wares by a shop door (a little cover on the covered walk): v 0 bucket-and-spade stand, 1 postcard spinner +
  // rock barrel, 2 fish-box of lettered rock + bins, 3 news + sweets stand
  function wares(B, x, z, v) {
    B.push(x, 0, z);
    if (v === 0) {
      B.box('wood', K.woodLt, 0.9, 0.9, 0.5, 0, 0.45, 0, { r: 0.02 });
      for (let i = 0; i < 6; i++) { const cc = [K.red, K.yellow, '#3f7fc1', '#5caa66', K.coral, K.purple][i]; B.lathe('gloss', cc, [[0, 0], [0.08, 0], [0.11, 0.2], [0, 0.2]], -0.32 + (i % 3) * 0.32, 0.9, -0.12 + Math.floor(i / 3) * 0.24, { seg: 8 }); }
      for (let i = 0; i < 4; i++) { B.cyl('wood', K.woodLt, 0.012, 0.7, -0.3 + i * 0.2, 1.25, 0.2, { seg: 4, rx: 0.12 }); B.box('gloss', [K.red, '#3f7fc1', K.yellow, '#5caa66'][i], 0.12, 0.16, 0.02, -0.3 + i * 0.2, 1.62, 0.24, { r: 0.01 }); }
      B.tor('paint', K.yellow, 0.18, 0.05, 0.3, 1.1, 0.26, { rs: 5, ts: 14 });
      colBox(B, 0, 0, 0, 0.9, 0.95, 0.5);
    } else if (v === 1) {
      B.cyl('metal', K.ironDk, 0.02, 1.6, -0.2, 0.8, 0, { seg: 5 });
      for (let t = 0; t < 4; t++) for (let r = 0; r < 4; r++) { B.push(-0.2, 0.55 + r * 0.3, 0, (t / 4) * TAU); pbox(B, NS('paint'), ['#f3e9d2', '#bfe0ea', '#f4d3c4', '#d9ebd0'][(t + r) % 4], 0.22, 0.15, 0.01, 0, 0, 0.12, { rx: -0.1 }); B.pop(); }
      B.lathe('wood', K.wood, [[0, 0], [0.26, 0], [0.29, 0.3], [0.27, 0.62], [0, 0.62]], 0.35, 0, 0, { seg: 10 });
      for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; B.cyl(NS('gloss'), i % 2 ? '#f07fa8' : K.white, 0.022, 0.4, 0.35 + Math.cos(a) * 0.13, 0.78, Math.sin(a) * 0.13, { seg: 5, rz: Math.cos(a) * 0.2, rx: -Math.sin(a) * 0.2 }); }
      colBox(B, 0.05, 0, 0, 0.9, 0.8, 0.6);
    } else if (v === 2) {
      B.box('wood', K.wood, 1.1, 0.72, 0.6, 0, 0.36, 0, { r: 0.02 });
      B.box('paint', K.white, 1.02, 0.02, 0.52, 0, 0.73, 0, { r: 0.005 });
      for (let i = 0; i < 14; i++) B.cyl(NS('gloss'), i % 3 === 0 ? '#f07fa8' : i % 3 === 1 ? K.white : '#e25555', 0.022, 0.48, -0.44 + (i % 7) * 0.145, 0.76, -0.12 + Math.floor(i / 7) * 0.2, { rz: HP, seg: 5, ry: 0.05 * (i % 3) });
      pbox(B, 'paint', '#fbf1d8', 0.36, 0.24, 0.02, 0.2, 0.95, -0.25, { rx: -0.3 });
      colBox(B, 0, 0, 0, 1.1, 0.8, 0.6);
    } else {
      B.box('paint', K.red, 0.7, 1.1, 0.45, 0, 0.55, 0, { r: 0.03 });
      for (let r = 0; r < 3; r++) pbox(B, NS('paint'), ['#fbeecf', '#d7e6f2', '#fbe0d0'][r], 0.6, 0.02, 0.3, 0, 0.35 + r * 0.3, 0.12, { rx: -0.35 });
      B.box('glass' in K ? 'gloss' : 'gloss', K.glassLt, 0.62, 0.3, 0.02, 0, 1.25, -0.2, { r: 0.01 });
      colBox(B, 0, 0, 0, 0.7, 1.1, 0.45);
    }
    B.blob(1.1, 0.8);
    B.pop();
  }

  // ------------------------------------------------------------------------------------------ the Crescent
  // The colonnade + its three buildings follow the layout's bent shop-front line (COLO / chainSections): each section
  // is dressed in its own frame — local +z along the section (from its railing-line corner q0), local +x outward (the
  // railing line at x = 0, columns at 0.2, the shop fronts at DK, the shops' backs at DK + shops depth).
  const SECS = chainSections(COLO.front, -COLO.deck), DK = COLO.deck, YT = COLO.deckBot, DT = COLO.deckTop, BK = COLO.deck + COLO.shops;
  const secFrame = (B, s) => fpush(B, s.q0[0], 0, s.q0[1], (s.h * PI) / 180);
  const frontSpan = (s, i) => { const f0 = COLO.front[i], f1 = COLO.front[i + 1]; return [(f0[0] - s.q0[0]) * s.d[0] + (f0[1] - s.q0[1]) * s.d[1], (f1[0] - s.q0[0]) * s.d[0] + (f1[1] - s.q0[1]) * s.d[1]]; };
  D.tidewater_colonnade = {
    desc: 'The Crescent’s cast-iron colonnade (site piece, pos = world origin, Alpha half; mirrored copy dresses Bravo’s): fluted sea-green columns (collide) at every bay and bend of the three bent sections, elliptical arches with pierced spandrels, the frieze on the terrace-walk edge, transverse girders + pendant lanterns, the walk railing (visual; the layout carries the rail collision), the landing pier, the mid stair’s handrail (rail collision), the open end’s stone piers. rev: the stair turned round (layout STAIR_REV, Tower Command): an open landing at the walk’s end with its own stone pier + urn.',
    params: { rev: 'bool: the turned-round stair (STAIR_REV)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const c = K.iron;
      SECS.forEach((s, si) => {
        const L = s.len, m = Math.max(1, Math.round(L / 3.4)), zs = Array.from({ length: m + 1 }, (_, k) => (k * L) / m);
        secFrame(B, s);
        zs.forEach((z, k) => {
          if ((k === m && si < SECS.length - 1) || (si === 0 && k === 0)) return;
          ironColumn(B, 0.2, z, YT - 0.02, c); colBox(B, 0.2, 0, z, 0.36, YT, 0.36, { roof: true });
        });
        for (let k = 0; k < m; k++) {
          const za = zs[k] + 0.2, zb = zs[k + 1] - 0.2, zm = (za + zb) / 2, hw = (zb - za) / 2;
          const pts = []; for (let q = 0; q <= 12; q++) { const t = (q / 12) * PI; pts.push(P3(0.2, YT - 0.57 + Math.sin(t) * 0.46, zm - Math.cos(t) * hw)); }
          if (!(si === 0 && k === 0)) { B.tube('gloss', c, pts, 0.045, { radial: 5 }); B.tube(NS('gloss'), c, pts.map((p) => P3(p[0], p[1] + 0.07, p[2])), 0.018, { radial: 4 }); }
          for (const sg of [-1, 1]) { B.tor(NS('gloss'), c, 0.13, 0.016, 0.2, YT - 0.23, zm + sg * hw * 0.62, { ry: HP, rs: 3, ts: 12 }); B.sph(NS('gloss'), K.gold, 0.035, 0.2, YT - 0.23, zm + sg * hw * 0.62, { ws: 6, hs: 4 }); }
          pbox(B, 'gloss', c, 0.06, 0.08, zb - za + 0.4, 0.2, YT - 0.04, zm);
          pbox(B, 'gloss', c, DK - 0.2, 0.12, 0.12, (DK + 0.2) / 2, YT - 0.06, zs[k]);
          B.cyl(NS('metal'), K.ironDk, 0.008, 0.36, 2.2, YT - 0.18, zm, { seg: 4 });
          lantern(B, 2.2, YT - 0.95, zm, 0.8);
        }
        // frieze on the walk edge (x = 0 face): plate, roundels, drip-edge fringe
        pbox(B, 'gloss', c, 0.03, 0.34, L, -0.015, YT + 0.17, L / 2);
        for (let z = 0.35; z < L - 0.2; z += 0.7) { B.tor(NS('gloss'), K.ironLt, 0.1, 0.016, -0.04, YT + 0.17, z, { ry: HP, rs: 3, ts: 10 }); B.sph(NS('gloss'), K.gold, 0.025, -0.04, YT + 0.17, z, { ws: 5, hs: 3 }); }
        for (let z = 0.12; z < L; z += 0.24) pbox(B, NS('gloss'), c, 0.02, 0.1, 0.1, -0.01, YT - 0.03, z, { rx: PI / 4 });
        // walk railing (visual) on the first three sections (the Assembly Rooms' open at their stair's landing); the north
        // one is open to the stair / landing
        if (si < 2) { fpush(B, 0.08, DT, 0, 0); B.push(0, 0, 0, -HP); ironRail(B, L, { h: 1.0, col: false, p0: si === 0 }); B.pop(); fpop(B); }
        if (si === 2) {
          const a = STAIR_AR.top - s.q0[1], b = STAIR_AR.landing - s.q0[1];
          for (const [z0, z1] of [[0, a], [b, L]]) { fpush(B, 0.08, DT, z0, 0); B.push(0, 0, 0, -HP); ironRail(B, z1 - z0, { h: 1.0, col: false, p0: z0 > 0 }); B.pop(); fpop(B); }
        }
        fpop(B);
      });
      // the north section (axis-aligned) in world coordinates: landing pier, its south rail, the stair's handrail
      // (rev: the stair turned round — the landing meets the walk's open end and stays open like it); the Assembly Rooms'
      // stair (the stretch) the same way, its foot on the Winter Gardens' paving
      stairDress(B, !!o.rev ? STAIR_REV : STAIR, !!o.rev, !!o.rev ? SQ : 0);
      stairDress(B, STAIR_AR, false, SQ);
      // stone piers + urns marking the open north end of the walk
      const P3e = COLO.front[COLO.front.length - 1];
      for (const x of [P3e[0] - DK + 0.25, P3e[0] - 0.25]) { B.box('paint', K.stone, 0.42, 1.0, 0.42, x, DT + 0.5, P3e[1] - 0.25, { r: 0.03 }); pbox(B, 'paint', K.trim, 0.5, 0.08, 0.5, x, DT + 1.04, P3e[1] - 0.25); urn(B, x, DT + 1.08, P3e[1] - 0.25, K.coral); colBox(B, x, DT, P3e[1] - 0.25, 0.42, 1.0, 0.42, { roof: true }); }
    },
  };
  // a Crescent stair's dressing (world coordinates, ST = STAIR / STAIR_REV / STAIR_AR): the rail across the landing's
  // far end (not on a turned stair's open landing), the landing pier's plinth + quoins, its lamp, the stair's handrail
  // along the square side (rail collision) with a newel lantern at the foot (y0 = the foot's floor)
  function stairDress(B, ST, rev, y0) {
    const c = K.iron;
    {
      const X0 = ST.x[0], X1 = ST.x[1], LZ0 = ST.landing, LZ1 = ST.top, SF = ST.foot, LL = Math.abs(LZ1 - LZ0), ld = Math.sign(LZ0 - LZ1), sd = Math.sign(SF - LZ1);
      if (!rev) { fpush(B, ld < 0 ? X0 : X1, DT, LZ0 - 0.08 * ld, ld < 0 ? 0 : PI); ironRail(B, X1 - X0, { h: 1.0, col: false }); fpop(B); }
      pbox(B, 'gloss', c, 0.03, 0.34, LL, X0 - 0.015, YT + 0.17, (LZ0 + LZ1) / 2);
      fpush(B, X0, 0, (LZ0 + LZ1) / 2, -HP);
      B.add('paint', ext('plinthLd', PROF.plinth, LL), shade(K.stone, 0.9), 0, 0, 0, {});
      for (const sx of [-1, 1]) quoins(B, sx * (LL / 2 - 0.01), 0.35, YT - 0.1, sx, '#c9c2b2');
      fpop(B);
      pierLamp(B, X0 + 0.2, DT, LZ1 + 0.2 * ld);
      if (rev) { const x = X0 + 0.25, z = LZ0 - 0.25 * ld; B.box('paint', K.stone, 0.42, 1.0, 0.42, x, DT + 0.5, z, { r: 0.03 }); pbox(B, 'paint', K.trim, 0.5, 0.08, 0.5, x, DT + 1.04, z); urn(B, x, DT + 1.08, z, K.coral); colBox(B, x, DT, z, 0.42, 1.0, 0.42, { roof: true }); }
      {
        const n = 7, xr = X0 - 0.08;
        const yA = (t) => y0 + t * (DT - y0);
        for (let i = 0; i <= n; i++) { const t = i / n, z = SF + t * (LZ1 - SF), y = yA(t); B.lathe('gloss', c, [[0, 0], [0.05, 0], [0.035, 0.08], [0.03, 1.0], [0.04, 1.04], [0, 1.08]], xr, y, z, { seg: 6 }); }
        B.tube('gloss', c, [P3(xr, y0 + 1.02, SF), P3(xr, DT + 1.02, LZ1)], 0.03, { radial: 6 });
        B.tube(NS('gloss'), c, [P3(xr, y0 + 0.55, SF), P3(xr, DT + 0.55, LZ1)], 0.016, { radial: 4 });
        for (let i = 0; i < 24; i++) { const t = (i + 0.5) / 24, z = SF + t * (LZ1 - SF), y = yA(t); B.cyl(NS('gloss'), c, 0.008, 0.9, xr, y + 0.55, z, { seg: 4 }); }
        const mm = 8; for (let i = 0; i < mm; i++) { const t0 = i / mm, t1 = (i + 1) / mm, za = SF + t0 * (LZ1 - SF), zb = SF + t1 * (LZ1 - SF); COL(B, xr - 0.1, Math.min(0, y0), Math.min(za, zb), X0 + 0.02, yA(t1) + 1.12, Math.max(za, zb), { rail: true }); }
        const ny = y0;   // (the foot's floor: the forecourt at 0, the square at SQ)
        B.lathe('gloss', c, [[0, 0], [0.14, 0], [0.14, 0.1], [0.08, 0.2], [0.07, 1.2], [0.1, 1.28], [0, 1.3]], xr, ny, SF + 0.25 * sd, { seg: 8 });
        lantern(B, xr, ny + 1.3, SF + 0.25 * sd, 1.0);
      }
    }
  }

  // ------------------------------------------------------------------------------------------ the Crescent's frontage
  // bay window (projects from the wall, first floor and up): canted sides, sashes, cornice + lead roof
  function bayWindow(B, x, y, w, h, c, o = {}) {
    const d = 0.55, sw = 0.45;
    B.box('paint', c, w, 0.3, d, x, y - 0.15, d / 2, { r: 0.03 });
    B.box('paint', c, w + 0.1, 0.25, d + 0.08, x, y + h + 0.12, d / 2, { r: 0.03 });
    pbox(B, 'paint', K.lead, w + 0.14, 0.12, d + 0.12, x, y + h + 0.3, d / 2);
    pbox(B, NS('gloss'), K.glass, w - sw * 1.2, h, 0.02, x, y + h / 2, d - 0.02);
    for (const sx of [-1, 1]) { B.push(x + sx * (w / 2 - sw * 0.35), y + h / 2, d / 2, sx * 0.9); pbox(B, NS('gloss'), K.glass, sw, h, 0.02, 0, 0, 0); B.pop(); }
    for (const sx of [-1, 1, -0.33, 0.33]) pbox(B, 'paint', K.white, 0.07, h, 0.07, x + sx * (w / 2 - sw * 0.6), y + h / 2, d - 0.02);
    pbox(B, NS('paint'), K.white, w - 0.2, 0.05, d, x, y + h * 0.62, d / 2 - 0.02);
    if (o.lit) pbox(B, NS('glow'), K.lamp, w - sw * 1.4, h * 0.25, 0.004, x, y + h * 0.84, d - 0.005, { glow: o.lit });
  }
  const SHOPS = [
    ['PENNY ARCADE', '#7a3b67', K.yellow, { glowLetters: 1.4, glowC: '#ffd27a', lit: 1.2 }],
    ['ROCK SHOP', '#e8a7b8', '#8a2f52', {}],
    ['FISH & CHIPS', '#2f5d8a', K.white, {}],
    ['POST OFFICE', '#b8342c', K.gold, {}],
    ['ICES & TEAS', '#5f9f8c', K.white, { doorLeft: true }],
    ['BUCKETS & SPADES', K.yellow, K.navy, { lh: 0.17 }],
    // (the Assembly Rooms' ground floor under the colonnade: the stretch's fourth house)
    ['BOX OFFICE', '#3f5f7a', K.gold, { lit: 0.9 }],
    ['READING ROOM', '#6a4a3a', K.white, { doorLeft: true }],
    ['TEA ROOM', '#4f7a5f', K.white, { lit: 0.9 }],
    ['SEASIDE GIFTS', '#6b7fb3', K.white, { doorLeft: true }],
    ['SWEETS', '#c97a9a', K.white, {}],
    ['THE ANCHOR', '#2f4a3a', K.gold, { lit: 0.9 }],
  ];
  D.tidewater_arcadefront = {
    desc: 'The Crescent’s frontage (site piece, pos = world origin, Alpha half): twelve shopfronts on the covered walk (PENNY ARCADE … THE ANCHOR) with wares out front (small cover, collides) and blade signs, then above the terrace walk the four buildings of the bent terrace: seaside houses with bay windows, the GRAND HOTEL (glazed canopy, parapet, roof letters), the ASSEMBLY ROOMS (ballroom windows between giant pilasters, a pedimented frontispiece over its stair\'s landing, a parapet, a glazed roof lantern), a turreted corner house at the mid end; slate roofs, chimneys, dormers, the sea-side backs.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      let shopIdx = 0;
      SECS.forEach((s, si) => {
        const [f0, f1] = frontSpan(s, si), Wf = f1 - f0, ns = 3;
        secFrame(B, s);
        // shopfronts on the front (x = DK, facing the square) + wares + blade signs
        for (let k = 0; k < ns; k++) {
          const zc = f0 + (Wf * (k + 0.5)) / ns, [name, cc, lc, extra] = SHOPS[shopIdx++ % SHOPS.length];
          fpush(B, DK, 0, zc, -HP); shopfront(B, Wf / ns - 0.12, name, { c: cc, lc, ...extra }); fpop(B);
          if (!(si === 1 && k === 0) && !(si === 3 && k === 2)) wares(B, DK - 0.65, zc + (extra.doorLeft ? 0.7 : -0.7), (shopIdx + si) % 4);
          if (k < ns - 1 && (k + si) % 2 === 0) {
            const z = f0 + (Wf * (k + 1)) / ns, [t, bc, lc2] = [['ROCK', '#e8a7b8', K.navy], ['POST', '#b8342c', K.gold], ['GIFTS', '#6b7fb3', K.white], ['ALES', '#2f4a3a', K.gold]][(si + k) % 4];
            B.box('paint', bc, 0.05, 0.42, 0.8, DK - 0.75, 2.55, z, { r: 0.02 });
            pbox(B, 'metal', K.ironDk, 0.75, 0.03, 0.03, DK - 0.4, 2.8, z);
            B.tube(NS('metal'), K.ironDk, [P3(DK - 0.05, 2.55, z), P3(DK - 0.3, 2.78, z)], 0.012, { radial: 3 });
            for (const sx of [1, -1]) { B.push(DK - 0.75 + sx * 0.03, 2.5, z, sx * HP); letters(B, t, { h: 0.13, x: 0, y: -0.02, z: 0.001, c: lc2, flat: true, wt: 0.22, track: 0.1 }); B.pop(); }
          }
        }
        // ---- upper frontage (x = DK plane facing the square, from the terrace walk at DT); frontage x runs along +z
        fpush(B, DK, DT - 3.2, f0, -HP);
        if (si === 0) {
          const c = K.pink, top = 3.9 + 3.2;
          for (const x of [Wf / 6, Wf / 2, (5 * Wf) / 6]) { archOpening(B, x, 3.2, 1.0, 1.55, { door: '#3f6d64', lit: 0.8 }); bayWindow(B, x, 5.0, 1.5, 1.4, c, { lit: 0.7 }); }
          B.add('paint', ext('cornA' + Wf.toFixed(2), PROF.cornice, Wf + 0.2), K.trim, Wf / 2, top - 0.36, 0, {});
          for (const x of [0.15, Wf / 3, (2 * Wf) / 3, Wf - 0.15]) pbox(B, 'paint', K.trim, 0.22, top - 3.3, 0.06, x, 3.2 + (top - 3.3) / 2, 0.03);
          B.push(Wf / 2, top, -1.5); B.add('paint', tpl('roofA' + Wf.toFixed(2), () => extrudeGeo([[-1.6, 0], [1.6, 0], [0, 1.6]], 1, 0.001)), K.slate, 0, 0, 0, { sx: Wf + 0.3 }); B.pop();
          for (const x of [Wf / 6, Wf / 2, (5 * Wf) / 6]) { B.box('paint', c, 0.8, 1.6, 0.6, x - 0.8, top + 1.3, -1.5, { r: 0.03 }); pbox(B, 'paint', K.trim, 0.9, 0.1, 0.7, x - 0.8, top + 2.1, -1.5); for (const dx of [-0.2, 0.2]) B.cyl('paint', K.pot, 0.07, 0.3, x - 0.8 + dx, top + 2.3, -1.5, { seg: 6 }); }
          for (const x of [Wf / 3 + 0.6, (2 * Wf) / 3 + 0.6]) { B.push(x, top + 0.1, -0.6); B.box('paint', c, 0.9, 0.9, 0.8, 0, 0.45, 0, { r: 0.03 }); B.add('paint', tpl('dormA', () => extrudeGeo([[-0.55, 0], [0.55, 0], [0, 0.45]], 1.0, 0.001)), K.slateDk, 0, 0.9, 0, { ry: HP }); pbox(B, NS('gloss'), K.glass, 0.5, 0.55, 0.02, 0, 0.45, 0.405); B.pop(); }
        } else if (si === 1) {
          const c = K.butter, top = 5.5 + 3.2, xc = Wf / 2;
          B.box('gloss', K.ironDk, Wf - 0.6, 0.12, 1.5, xc, 5.45, 0.75, { r: 0.03 });
          pbox(B, NS('gloss'), K.glassLt, Wf - 0.8, 0.03, 1.4, xc, 5.53, 0.75);
          for (let x = 0.5; x <= Wf - 0.49; x += (Wf - 1) / 7) B.tube('gloss', K.ironDk, [P3(x, 4.45, 0.02), P3(x, 4.9, 0.4), P3(x, 5.4, 1.4)], 0.025, { radial: 4 });
          for (let x = 0.4; x <= Wf - 0.39; x += 0.3) pbox(B, NS('gloss'), K.ironDk, 0.02, 0.18, 0.02, x, 5.33, 1.5);
          letters(B, 'GRAND HOTEL', { h: 0.34, x: xc, y: 5.62, z: 1.46, c: K.gold, mat: 'gloss', dep: 0.05, bev: 0, wt: 0.18, track: 0.14, lit: 1.1, litC: '#ffdca0' });
          for (const x of [xc - 3.6, xc - 1.2, xc + 1.2, xc + 3.6]) archOpening(B, x, 3.2, 1.1, 1.75, { door: '#5a3a2a', lit: 0.9 });
          for (const x of [xc - 4.2, xc - 2.5, xc - 0.85, xc + 0.85, xc + 2.5, xc + 4.2]) { sash(B, x, 6.0, 0.85, 1.2, { frame: K.trim, hood: 'segment', lit: 0.6, balconette: true }); sash(B, x, 7.55, 0.85, 0.9, { frame: K.trim, lit: 0.5, key: false }); }
          B.add('paint', ext('cornB' + Wf.toFixed(2), PROF.cornice, Wf + 0.2), K.trim, xc, top - 0.36, 0, {});
          B.push(0.1, top, 0.1); balustrade(B, Wf - 0.2, { h: 0.8, bay: 2.4, col: false, urns: 2, urnC: K.coral, seg: 5 }); B.pop();
          B.push(xc, top + 1.0, -1.2);
          for (const x of [-3.9, -1.3, 1.3, 3.9]) { pbox(B, 'metal', K.ironDk, 0.08, 1.6, 0.08, x, 0.4, -0.1); B.tube(NS('metal'), K.ironDk, [P3(x, -0.4, -0.9), P3(x, 1.0, -0.1)], 0.02, { radial: 3 }); }
          pbox(B, 'metal', K.ironDk, 8.8, 0.06, 0.06, 0, 0.1, -0.1);
          letters(B, 'GRAND HOTEL', { h: 0.85, x: 0, y: 0.15, z: -0.05, c: '#b23a48', mat: 'gloss', dep: 0.1, bev: 0, wt: 0.17, track: 0.08, lit: 1.3, litC: '#ff8f7a' });
          B.pop();
          B.push(xc, top, -1.5); B.add('paint', tpl('roofB' + Wf.toFixed(2), () => extrudeGeo([[-1.6, 0], [1.6, 0], [0.5, 1.4], [-0.5, 1.4]], 1, 0.001)), K.slate, 0, 0, 0, { sx: Wf + 0.2 }); B.pop();
          for (const x of [0.6, Wf - 0.6]) { B.cyl('paint', K.white, 0.05, 3.2, x, top + 1.6, 0.1, { seg: 6 }); B.flag(x, top + 3.0, 0.1, { color: x < xc ? K.navy : K.coral, s: 1.5, ry: -HP }); }
        } else if (si === 2) {
          // the Assembly Rooms: stucco palazzo front over the terrace walk — tall round-headed ballroom windows between
          // giant pilasters, a frontispiece of four attached columns with a pediment over the stair's landing (double doors
          // onto the walk, ASSEMBLY ROOMS on the frieze), a cornice + balustraded parapet with urns, a hipped slate roof
          // with a glazed lantern over the ballroom
          const c = K.stucco, top = 9.7, xp = (STAIR_AR.top + STAIR_AR.landing) / 2 - s.q0[1] - f0;
          const bays = (off) => { const xs = []; for (let k = 0; k < 8; k++) for (const sg of [-1, 1]) { const x = xp + sg * (off + k * 2.6); if (x > 0.9 && x < Wf - 0.9) xs.push(x); } return xs; };
          for (const x of bays(3.5)) {
            archOpening(B, x, 3.75, 1.2, 2.35, { lit: 0.85, fan: true });
            pbox(B, 'gloss', K.ironDk, 1.5, 0.04, 0.3, x, 3.72, 0.17);
            for (let i = 0; i <= 6; i++) B.cyl(NS('gloss'), K.ironDk, 0.012, 0.52, x - 0.72 + i * 0.24, 3.98, 0.3, { seg: 4 });
            B.cyl('gloss', K.ironDk, 0.02, 1.5, x, 4.24, 0.3, { rz: HP, seg: 5 });
            sash(B, x, 7.05, 0.9, 1.05, { frame: K.trim, lit: 0.5, key: false });
          }
          for (const x of [...bays(4.8), 0.3, Wf - 0.3]) pilaster(B, x, 3.2, 9.25, 0.46, K.trim, 0.1);
          mould(B, 'paint', K.trim, 'string', Wf, Wf / 2, 6.72, 0);
          // the frontispiece: four attached Corinthian-ish columns, entablature with the name, pediment, doors
          for (const dx of [-2.15, -0.95, 0.95, 2.15]) {
            B.lathe('paint', K.trim, [[0, 0], [0.3, 0], [0.3, 0.14], [0.24, 0.24], [0.21, 0.3], [0.18, 5.1], [0.25, 5.2], [0.3, 5.36], [0, 5.36]], xp + dx, 3.2, 0.2, { seg: 12 });
            for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; pbox(B, NS('paint'), shade(K.trim, 0.9), 0.02, 4.7, 0.02, xp + dx + Math.cos(a) * 0.19, 5.75, 0.2 + Math.sin(a) * 0.19); }
          }
          B.box('paint', K.trim, 5.6, 0.62, 0.62, xp, 8.87, 0.3, { r: 0.03 });
          pbox(B, 'paint', K.navy, 4.9, 0.34, 0.01, xp, 8.84, 0.615);
          letters(B, 'ASSEMBLY ROOMS', { h: 0.22, x: xp, y: 8.73, z: 0.62, c: K.gold, mat: 'metal', dep: 0.03, bev: 0, wt: 0.2, track: 0.12 });
          B.add('paint', triGeo(5.9, 1.45), K.trim, xp, 9.18, 0.32, {});
          B.add('paint', triGeo(5.2, 1.15), c, xp, 9.3, 0.34, {});
          for (const sg of [-1, 1]) { B.push(xp + sg * 1.475, 9.18 + 0.725, 0.52, 0, 0, -sg * Math.atan2(1.45, 2.95)); pbox(B, 'paint', K.trim, Math.hypot(1.45, 2.95) + 0.1, 0.14, 0.44, 0, 0, 0); B.pop(); }
          B.cyl('metal', K.gold, 0.4, 0.06, xp, 9.72, 0.36, { rx: HP, seg: 16 });
          B.cyl('paint', K.navy, 0.32, 0.03, xp, 9.72, 0.39, { rx: HP, seg: 16 });
          for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; pbox(B, NS('metal'), K.gold, 0.03, 0.12, 0.01, xp + Math.cos(a) * 0.24, 9.72 + Math.sin(a) * 0.24, 0.41, { rz: a }); }
          archOpening(B, xp, 3.2, 1.6, 2.3, { door: '#5a3a2a', lit: 0.9, key: K.stone });
          for (const dx of [-1.55, 1.55]) { pbox(B, 'gloss', K.ironDk, 0.06, 0.4, 0.2, xp + dx, 4.95, 0.1); lantern(B, xp + dx, 4.6, 0.3, 0.85); }
          COL(B, xp - 3.0, 8.5, -0.1, xp + 3.0, 10.7, 0.9, { roof: true });
          // cornice, parapet, the roof and the ballroom's lantern
          B.add('paint', ext('cornD' + Wf.toFixed(2), PROF.cornice, Wf + 0.2), K.trim, Wf / 2, top - 0.36, 0, {});
          B.push(0.1, top, 0.1); balustrade(B, Wf - 0.2, { h: 0.8, bay: 2.6, col: false, urns: 2, urnC: K.coral, seg: 5 }); B.pop();
          B.push(Wf / 2, top, -1.5); B.add('paint', tpl('roofD' + Wf.toFixed(2), () => extrudeGeo([[-1.6, 0], [1.6, 0], [0.5, 1.5], [-0.5, 1.5]], 1, 0.001)), K.slate, 0, 0, 0, { sx: Wf + 0.2 }); B.pop();
          B.push(xp, top + 1.5, -1.5);
          B.lathe('paint', K.trim, [[1.2, 0], [1.2, 0.2], [1.05, 0.25], [0, 0.25]], 0, 0, 0, { seg: 8, ry: PI / 8 });
          B.lathe('gloss', K.glassLt, [[1.0, 0.25], [1.0, 1.4], [0, 1.4]], 0, 0, 0, { seg: 8, ry: PI / 8 });
          for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + PI / 8; pbox(B, 'paint', K.trim, 0.08, 1.15, 0.08, Math.cos(a) * 1.0, 0.82, Math.sin(a) * 1.0); }
          B.lathe('paint', K.copper, [[1.15, 1.4], [0.8, 1.9], [0.25, 2.3], [0, 2.35]], 0, 0, 0, { seg: 8, ry: PI / 8 });
          B.sph('metal', K.gold, 0.1, 0, 2.45, 0, { ws: 8, hs: 6 });
          B.pop();
          COL(B, xp - 1.3, top, -2.8, xp + 1.3, top + 4.0, -0.2, { roof: true });
          for (const x of [0.6, Wf - 0.6]) { B.cyl('paint', K.white, 0.05, 3.0, x, top + 1.5, 0.1, { seg: 6 }); B.flag(x, top + 2.8, 0.1, { color: x < Wf / 2 ? K.coral : K.navy, s: 1.5, ry: -HP }); }
        } else {
          const c = K.mint, top = 3.5 + 3.2;
          for (const x of [Wf * 0.17, Wf * 0.47, Wf * 0.72]) { archOpening(B, x, 3.2, 1.1, 1.6, { door: '#7a4a3a', lit: 0.8 }); sash(B, x, 5.05, 0.9, 1.2, { frame: K.trim, hood: 'cornice', lit: 0.6 }); }
          B.add('paint', ext('cornC' + Wf.toFixed(2), PROF.cornice, Wf + 0.2), K.trim, Wf / 2, top - 0.36, 0, {});
          B.push(Wf / 2 - 1.0, top, -1.5); B.add('paint', tpl('roofC' + Wf.toFixed(2), () => extrudeGeo([[-1.6, 0], [1.6, 0], [0, 1.5]], 1, 0.001)), K.slate, 0, 0, 0, { sx: Wf - 1.8 }); B.pop();
          // corner turret at the walk's open end: octagonal drum, windows, candle-snuffer roof
          const tx = Wf - 1.15, tz = -1.45;
          B.lathe('paint', c, [[1.25, 3.2], [1.25, top + 1.6], [0, top + 1.6]], tx, 0, tz, { seg: 8, ry: PI / 8 });
          for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + PI / 8; if (Math.sin(a) < -0.3) continue; B.push(tx + Math.cos(a) * 1.16, 0, tz + Math.sin(a) * 1.16, HP - a); sash(B, 0, 5.3, 0.55, 1.1, { frame: K.trim, lit: 0.6, key: false }); sash(B, 0, 7.1, 0.5, 0.8, { frame: K.trim, lit: 0.5, key: false }); B.pop(); }
          B.lathe('paint', K.trim, [[1.38, 0], [1.38, 0.2], [1.3, 0.24], [0, 0.24]], tx, top + 1.6, tz, { seg: 8, ry: PI / 8 });
          B.lathe('paint', K.slate, [[1.42, 0], [1.1, 0.5], [0.5, 1.8], [0.12, 2.8], [0, 2.9]], tx, top + 1.84, tz, { seg: 8, ry: PI / 8 });
          B.sph('metal', K.gold, 0.1, tx, top + 4.8, tz, { ws: 8, hs: 6 });
          B.cyl('metal', K.ink, 0.02, 0.8, tx, top + 5.1, tz, { seg: 4 });
          COL(B, tx - 1.3, 3.2, tz - 1.3, tx + 1.3, top + 1.6, tz + 1.3, { roof: true });
        }
        fpop(B);
        // the sea-side backs (x = BK, facing out): plain windows, no shadow (distant)
        fpush(B, BK, 0, (f0 + f1) / 2, HP);
        for (let x = -Wf / 2 + 1.4; x <= Wf / 2 - 1.3; x += 2.6) { sash(B, x, 1.0, 0.9, 1.3, { frame: K.trim, ns: true, key: false }); sash(B, x, 4.6, 0.9, 1.3, { frame: K.trim, ns: true, key: false }); }
        fpop(B);
        fpop(B);
      });
      // the Crescent's end house over the spawn-wing corner (out of play): a hipped slate roof on its block
      B.push(21.45, 5.4, tq(-41.85));
      B.lathe('paint', K.slate, [[5.05, 0], [2.6, 1.6], [0, 1.7]], 0, 0, 0, { seg: 4, ry: PI / 4 });
      B.box('paint', K.pink, 0.8, 1.4, 0.6, 1.6, 1.3, 1.2, { r: 0.03 });
      B.pop();
    },
  };

  // ------------------------------------------------------------------------------------------ the bandstand
  // on the 1 m octagonal stage (OCT R 3.8, flat faces on ±X / ±Z, steps on ±Z): eight cast-iron columns at the
  // vertices, railings on the six faces without steps (collide), fretwork frieze, an ogee roof with a cresting and a
  // lantern cupola, music stands + chairs, pendant lamps; grilles on the stage's plinth faces
  D.tidewater_bandstand = {
    desc: 'Victorian bandstand dressing for the octagonal 1 m stage (pos = stage centre at ground level, R 3.8): eight sea-green cast-iron columns (collide), railings on the six step-less faces (collide), fretwork frieze, cream + coral ogee roof with cresting, cupola lantern and lyre vane, music stands and chairs, pendant lanterns; cast-iron grilles on the plinth faces. Tower Command (ct / wide / back): a taller column height, the four columns by the steps set wide along the diagonal faces (a 2.5 m tower rides between them) with the stage kept clear on that line, and a step-less open back (-Z) face.',
    params: { R: 'circumradius (3.8)', ct: 'column top over pos (4.1)', wide: 'bool: steps-side columns set wide', back: 'bool: steps on -Z (true)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const R = o.R ?? 3.8, A = R * Math.cos(PI / 8), c = K.iron, FL = 1.0, CT = o.ct ?? 4.1, rc = R - 0.28, wide = !!o.wide, back = o.back !== false;
      const V0 = (k, r = rc) => { const a = PI / 8 + (k * PI) / 4; return [Math.cos(a) * r, Math.sin(a) * r]; };
      // the columns (wide: the four beside the ±Z faces slide out along their diagonal face, 0.2 m in from its edge)
      const V = (k, r = rc) => {
        const [x, z] = V0(k, r), kk = ((k % 8) + 8) % 8;
        if (!wide || r !== rc || !(kk === 1 || kk === 2 || kk === 5 || kk === 6)) return [x, z];
        const sx = Math.sign(x), sz = Math.sign(z), X = 1.62;
        return [sx * X, sz * (A * Math.SQRT2 - 0.2 * Math.SQRT2 - X)];
      };
      // plinth faces: arched grilles
      for (let k = 0; k < 8; k++) {
        const a = (k * PI) / 4, fx = Math.cos(a) * A, fz = Math.sin(a) * A;
        if (Math.abs(Math.sin(a)) > 0.99 && (back || Math.sin(a) > 0)) continue;   // ±Z faces carry the steps
        B.push(fx, 0, fz, HP - a);
        B.add(NS('paint'), archPanelGeo(0.7, 0.4, 8), K.ironDk, 0, 0.18, 0.012, {});
        for (let i = -2; i <= 2; i++) pbox(B, NS('gloss'), c, 0.025, 0.72, 0.03, i * 0.13, 0.52, 0.03);
        pbox(B, 'paint', K.trim, 2.6, 0.08, 0.12, 0, FL - 0.04, 0.06);
        B.pop();
      }
      // columns (collide) + brackets
      for (let k = 0; k < 8; k++) {
        const [x, z] = V(k);
        B.lathe('gloss', c, [[0, 0], [0.12, 0], [0.12, 0.08], [0.08, 0.14], [0.065, 0.2], [0.055, CT - FL - 0.35], [0.07, CT - FL - 0.3], [0.12, CT - FL - 0.12], [0, CT - FL - 0.12]], x, FL, z, { seg: 8 });
        B.tor(NS('gloss'), K.gold, 0.065, 0.014, x, FL + 0.5, z, { rx: HP, rs: 3, ts: 8 });
        colBox(B, x, FL, z, 0.24, CT - FL, 0.24, { roof: true });
        const [xn, zn] = V(k + 1), mx = (x + xn) / 2, mz = (z + zn) / 2;
        // arched fretwork between columns: a shallow arch + roundel + drops
        const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(P3(x + (xn - x) * t, CT - 0.12 - 0.4 * (1 - Math.sin(t * PI)), z + (zn - z) * t)); }
        B.tube('gloss', c, pts, 0.03, { radial: 4 });
        B.tor(NS('gloss'), c, 0.14, 0.015, mx, CT - 0.3, mz, { ry: -Math.atan2(zn - z, xn - x), rs: 3, ts: 12 });
        for (let i = 1; i < 6; i++) { const t = i / 6; pbox(B, NS('gloss'), c, 0.02, 0.14, 0.02, x + (xn - x) * t, CT - 0.2, z + (zn - z) * t); }
        // railing on the step-less faces (the faces centred at angles k*45°: ±X and the diagonals)
      }
      for (let k = 0; k < 8; k++) {
        const a = (k * PI) / 4;
        if (Math.abs(Math.sin(a)) > 0.99) continue;
        const [x0, z0] = V(k - 1, R - 0.28), [x1, z1] = V(k, R - 0.28);
        const L = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
        B.push(x0, FL, z0, -ang);
        B.cyl('gloss', c, 0.025, L, L / 2, 0.85, 0, { rz: HP, seg: 6, open: true });
        B.cyl(NS('gloss'), c, 0.016, L, L / 2, 0.12, 0, { rz: HP, seg: 5, open: true });
        for (let i = 1; i < 12; i++) B.cyl(NS('gloss'), c, 0.009, 0.72, (i * L) / 12, 0.48, 0, { seg: 4, open: true });
        for (let i = 0; i < 3; i++) B.tor(NS('gloss'), c, 0.16, 0.012, L * (i + 1) / 4, 0.48, 0, { rs: 3, ts: 12 });
        B.pop();
        // collider: 2-3 axis-aligned boxes along the (possibly diagonal) rail
        const n = Math.abs(Math.cos(a)) > 0.99 ? 1 : 3;
        for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, cx = x0 + (x1 - x0) * t, cz = z0 + (z1 - z0) * t; const w = n === 1 ? 0.12 : Math.abs(x1 - x0) / n + 0.1, d = n === 1 ? L : Math.abs(z1 - z0) / n + 0.1; colBox(B, cx, FL, cz, w, 0.92, d, { rail: true }); }
      }
      // roof: ogee in cream with coral ribs, cresting, cupola, lyre vane
      const RY = CT;
      B.lathe('paint', K.trim, [[R + 0.25, 0], [R + 0.25, 0.3], [R + 0.1, 0.32], [0, 0.32]], 0, RY, 0, { seg: 8, ry: PI / 8 });
      for (let k = 0; k < 8; k++) { const a = PI / 8 + (k * PI) / 4; for (let i = 0; i < 7; i++) { const aa = a + ((i + 0.5) / 7 - 0.5) * (PI / 4) * 0.92; pbox(B, NS('paint'), K.coral, 0.1, 0.12, 0.03, Math.cos(aa) * (R + 0.2), RY - 0.05, Math.sin(aa) * (R + 0.2), { ry: -aa + HP }); } }
      B.lathe('paint', K.stucco, [[R + 0.15, 0], [R - 0.2, 0.25], [R * 0.72, 0.9], [R * 0.42, 1.5], [R * 0.2, 1.95], [0.5, 2.05], [0, 2.08]], 0, RY + 0.32, 0, { seg: 8, ry: PI / 8 });
      for (let k = 0; k < 8; k++) { const a = PI / 8 + (k * PI) / 4, ca = Math.cos(a), sa = Math.sin(a); B.tube('gloss', K.coral, [[R + 0.15, 0], [R - 0.2, 0.25], [R * 0.72, 0.9], [R * 0.42, 1.5], [R * 0.2, 1.95], [0.5, 2.05]].map(([r, y]) => P3(ca * (r + 0.03), RY + 0.33 + y, sa * (r + 0.03))), 0.05, { radial: 4 }); }
      B.lathe('paint', K.ironDk, [[0, 0], [R * 0.95, 0], [R * 0.95, 0.02], [0, 0.02]], 0, RY - 0.01, 0, { seg: 8, ry: PI / 8 });
      COL(B, -2.7, RY, -2.7, 2.7, RY + 2.3, 2.7, { roof: true });   // the roof: off limits (Ink Jet / Zipline landings slide off)
      const CY = RY + 2.35;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; B.cyl('gloss', c, 0.03, 0.6, Math.cos(a) * 0.42, CY + 0.3, Math.sin(a) * 0.42, { seg: 5 }); }
      B.lathe(NS('glow'), K.lamp, [[0, 0], [0.36, 0.02], [0.36, 0.55], [0, 0.57]], 0, CY, 0, { seg: 6, glow: 0.7 });
      B.lathe('paint', K.coral, [[0.62, 0], [0.5, 0.12], [0.2, 0.4], [0.06, 0.6], [0, 0.66]], 0, CY + 0.6, 0, { seg: 6 });
      B.sph('metal', K.gold, 0.08, 0, CY + 1.3, 0, { ws: 8, hs: 6 });
      B.cyl('metal', K.ink, 0.018, 0.9, 0, CY + 1.65, 0, { seg: 4 });
      B.push(0, CY + 1.9, 0, 0.5);
      B.tube('metal', K.gold, [P3(-0.18, 0, 0), P3(-0.22, 0.2, 0), P3(-0.14, 0.4, 0), P3(0, 0.46, 0), P3(0.14, 0.4, 0), P3(0.22, 0.2, 0), P3(0.18, 0, 0)], 0.018, { radial: 4 });
      for (let i = -1; i <= 1; i++) pbox(B, 'metal', K.gold, 0.008, 0.36, 0.008, i * 0.06, 0.2, 0);
      B.pop();
      // under the roof: pendant lamps, music stands, chairs (no colliders — the stage stays open; wide: none on the
      // line the tower rides, |x| < 1.8)
      for (let k = 0; k < 8; k += wide ? 4 : 2) { const [x, z] = V(k, 2.2); B.cyl(NS('metal'), K.ironDk, 0.008, 0.6, x, RY - 0.3, z, { seg: 4 }); lantern(B, x, RY - 1.2, z, 0.75); }
      for (let k = 0; k < 7; k++) {
        const a = -PI * 0.1 + (k / 6) * PI * 1.2 + HP, r = 1.9, x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9;
        if (Math.abs(x) < (wide ? 1.8 : 1.4)) continue;
        B.push(x, FL, z, -a - HP);
        pbox(B, 'wood', K.wood, 0.4, 0.04, 0.4, 0, 0.45, 0);
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pbox(B, NS('wood'), K.wood, 0.03, 0.45, 0.03, sx * 0.17, 0.22, sz * 0.17);
        pbox(B, NS('wood'), K.wood, 0.4, 0.4, 0.03, 0, 0.7, -0.19);
        B.cyl(NS('metal'), K.ink, 0.01, 1.0, 0, 0.5, 0.45, { seg: 4 });
        pbox(B, NS('metal'), K.ink, 0.4, 0.28, 0.01, 0, 1.05, 0.45, { rx: -0.35 });
        pbox(B, NS('paint'), K.white, 0.34, 0.22, 0.004, 0, 1.06, 0.458, { rx: -0.35 });
        B.pop();
      }
      // a timpani + a bass drum on the stage's back
      const dx = wide ? 1.2 : 0, dz = wide ? -0.7 : 0;
      B.lathe('metal', K.copper, [[0, 0], [0.3, 0.05], [0.36, 0.3], [0.36, 0.55], [0, 0.55]], 1.1 + dx, FL, 1.9 + dz, { seg: 12 });
      B.cyl('paint', K.coral, 0.34, 0.28, 1.6 + dx, FL + 0.4, 1.5 + dz, { rx: HP, rz: 0.5, seg: 14 });
      B.blob(8.5, 8.5);
    },
  };

  // ------------------------------------------------------------------------------------------ the fountain
  D.tidewater_fountain = {
    desc: 'Town Hall Square fountain (pos = centre): granite basin 4.8 m across (0.34 m kerb, walk-over), water, a tiered cast-iron fountain — dolphin pedestal, scalloped lower bowl, upper bowl, gilt ship finial — with falling water; the pedestal + lower bowl collide (cover).',
    params: { Rb: 'basin radius (2.4)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const Rb = o.Rb ?? 2.4;
      B.lathe('paint', K.granite, [[Rb - 0.34, 0.33], [Rb - 0.3, 0.36], [Rb - 0.02, 0.36], [Rb + 0.02, 0.3], [Rb + 0.04, 0.05], [Rb + 0.1, 0], [0, 0]], 0, 0, 0, { seg: 24 });
      B.lathe('paint', shade(K.granite, 0.8), [[0, 0.05], [Rb - 0.33, 0.05], [Rb - 0.33, 0.3]], 0, 0, 0, { seg: 24 });
      B.lathe(NS('gloss'), '#6fb3b8', [[0, 0.26], [Rb - 0.32, 0.26]], 0, 0, 0, { seg: 24 });
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, r = Rb - 0.15; colBox(B, Math.cos(a) * r, 0, Math.sin(a) * r, 0.5, 0.34, 0.5); }
      // pedestal with three dolphins, lower bowl, upper bowl, finial
      B.lathe('paint', K.granite, [[0, 0.26], [0.7, 0.26], [0.7, 0.5], [0.6, 0.56], [0.5, 0.56], [0, 0.56]], 0, 0, 0, { seg: 12 });
      B.lathe('gloss', K.iron, [[0, 0.56], [0.3, 0.56], [0.26, 0.7], [0.18, 0.9], [0.16, 1.3], [0.22, 1.45], [0, 1.45]], 0, 0, 0, { seg: 12 });
      for (let k = 0; k < 3; k++) {
        const a0 = (k / 3) * TAU + 0.5, pts = [];
        for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(P3(Math.cos(a0 + t * 0.9) * (0.2 + 0.3 * Math.sin(t * PI)), 0.62 + t * 0.85, Math.sin(a0 + t * 0.9) * (0.2 + 0.3 * Math.sin(t * PI)))); }
        B.add('gloss', tpl('fdolph' + k, () => tubeGeo(pts, (t) => 0.02 + 0.09 * Math.pow(Math.sin(PI * Math.min(1, 0.15 + t)), 0.8), 7)), K.ironLt, 0, 0, 0, {});
        const p = pts[0];
        B.sph('gloss', K.ironLt, 0.08, p[0], p[1], p[2], { ws: 6, hs: 5 });
        // water jet from each dolphin's mouth arcing into the basin
        const ex = Math.cos(a0) * 1.35, ez = Math.sin(a0) * 1.35;
        B.tube(NS('gloss'), '#cfeef0', [P3(p[0] * 1.2, p[1] + 0.02, p[2] * 1.2), P3(p[0] * 2 + ex * 0.3, p[1] + 0.2, p[2] * 2 + ez * 0.3), P3(ex, 0.28, ez)], 0.035, { radial: 5 });
      }
      B.lathe('gloss', K.iron, [[0, 1.4], [0.4, 1.42], [1.05, 1.55], [1.15, 1.68], [1.08, 1.7], [0.3, 1.6], [0, 1.6]], 0, 0, 0, { seg: 16 });
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; B.sph(NS('gloss'), K.ironLt, 0.06, Math.cos(a) * 1.12, 1.66, Math.sin(a) * 1.12, { ws: 5, hs: 4 }); }
      B.lathe(NS('gloss'), '#8cc9cc', [[0, 1.62], [1.02, 1.62]], 0, 0, 0, { seg: 16 });
      // water sheet falling from the lower bowl's lip
      B.lathe(NS('gloss'), '#d8f2f2', [[1.17, 1.66], [1.24, 1.4], [1.3, 0.9], [1.34, 0.3]], 0, 0, 0, { seg: 16, open: true });
      B.lathe('gloss', K.iron, [[0, 1.6], [0.12, 1.6], [0.1, 2.0], [0.16, 2.2], [0, 2.2]], 0, 0, 0, { seg: 10 });
      B.lathe('gloss', K.iron, [[0, 2.15], [0.5, 2.22], [0.58, 2.34], [0.2, 2.3], [0, 2.3]], 0, 0, 0, { seg: 12 });
      B.lathe(NS('gloss'), '#d8f2f2', [[0.58, 2.33], [0.62, 2.1], [0.66, 1.8]], 0, 0, 0, { seg: 12, open: true });
      B.lathe('metal', K.gold, [[0, 2.3], [0.08, 2.32], [0.06, 2.5], [0.1, 2.56], [0, 2.6]], 0, 0, 0, { seg: 8 });
      B.push(0, 2.6, 0, 0.4);
      B.add('metal', tpl('fship', () => extrudeGeo([[-0.22, 0], [0.22, 0], [0.28, 0.08], [-0.26, 0.08]], 0.05, 0.004)), K.gold, 0, 0, 0, { ry: HP });
      pbox(B, 'metal', K.gold, 0.02, 0.36, 0.02, 0, 0.26, 0);
      B.add('metal', triGeo(0.24, 0.28), K.gold, 0, 0.12, 0.012, {});
      B.pop();
      B.tube(NS('gloss'), '#e4f6f6', [P3(0, 2.62, 0), P3(0.05, 3.0, 0), P3(0.1, 3.2, 0.05)], 0.03, { radial: 4 });
      colBox(B, 0, 0, 0, 1.3, 1.45, 1.3, { roof: true });
      colBox(B, 0, 1.45, 0, 2.1, 0.3, 2.1, { roof: true });
      colBox(B, 0, 1.75, 0, 0.4, 0.85, 0.4, { roof: true });
      B.blob((5.6 * Rb) / 2.4, (5.6 * Rb) / 2.4);
    },
  };

  // ------------------------------------------------------------------------------------------ promenade shelter
  // cross-plan glazed shelter on the cross of stucco screens (level blocks, 1.15 m, centred on pos): glazed screens
  // above them (collide, so the walls can't be stood on), a bench in each bay facing out, four iron corner columns
  // (collide), a hipped slate roof with a coral fascia, a gilt finial, a clock on the seaward gable
  D.tidewater_shelter = {
    desc: 'Cross-plan promenade shelter over the 5 × 5 m cross of 1.15 m stucco screens (pos = centre): white-framed glazed screens above the walls (collide), four bays with benches (collide), iron corner columns (collide), hipped slate roof with a coral fretwork fascia and a finial.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const hw = 2.5, WH = 1.15, TOP = 2.6;
      for (const [ax, L] of [[0, 2.5], [HP, 2.5]]) for (const s of [-1, 1]) {
        B.push(0, 0, 0, ax + (s > 0 ? 0 : PI));
        // screen arm along local +X from the centre (0 … hw), wall thickness 0.3
        pbox(B, 'paint', K.trim, hw, 0.08, 0.38, hw / 2, WH + 0.04, 0);
        pbox(B, NS('gloss'), '#9fc6cf', hw - 0.1, TOP - WH - 0.1, 0.03, hw / 2, (WH + TOP) / 2, 0);
        for (let i = 0; i <= 3; i++) pbox(B, 'paint', K.white, 0.07, TOP - WH, 0.08, 0.1 + (i * (hw - 0.2)) / 3, (WH + TOP) / 2, 0);
        pbox(B, 'paint', K.white, hw, 0.07, 0.08, hw / 2, TOP - 0.03, 0);
        pbox(B, NS('paint'), K.white, hw, 0.04, 0.06, hw / 2, WH + 0.6, 0);
        B.pop();
      }
      COL(B, -hw, WH, -0.2, hw, TOP, 0.2, { roof: true }); COL(B, -0.2, WH, -hw, 0.2, TOP, hw, { roof: true });
      COL(B, -hw - 0.35, TOP, -hw - 0.35, hw + 0.35, TOP + 1.6, hw + 0.35, { roof: true });
      // benches in the four bays (backs to the screens), the corner columns
      for (let q = 0; q < 4; q++) {
        const a = q * HP + PI / 4;
        const bx = Math.cos(a) * 1.3, bz = Math.sin(a) * 1.3;
        for (const [ox, oz, ry] of [[bx, Math.sign(bz) * 0.42, bz > 0 ? 0 : PI], [Math.sign(bx) * 0.42, bz, bx > 0 ? HP : -HP]]) {
          B.push(ox, 0, oz, ry);
          for (let i = 0; i < 3; i++) B.box('wood', shade(K.woodLt, 0.95 + i * 0.04), 1.4, 0.035, 0.09, 0, 0.46, 0.08 + i * 0.1, { r: 0.01 });
          for (const sx of [-0.6, 0.6]) { pbox(B, 'gloss', K.iron, 0.05, 0.46, 0.05, sx, 0.23, 0.2); B.tube(NS('gloss'), K.iron, [P3(sx, 0.46, 0.3), P3(sx, 0.3, 0.05), P3(sx, 0.0, 0.0)], 0.02, { radial: 4 }); }
          B.pop();
        }
        colBox(B, bx, 0, Math.sign(bz) * 0.6, 1.4, 0.5, 0.34);
        colBox(B, Math.sign(bx) * 0.6, 0, bz, 0.34, 0.5, 1.4);
        const cx = Math.sign(Math.cos(a)) * (hw - 0.12), cz = Math.sign(Math.sin(a)) * (hw - 0.12);
        B.lathe('gloss', K.iron, [[0, 0], [0.1, 0], [0.1, 0.1], [0.06, 0.16], [0.05, TOP - 0.3], [0.09, TOP - 0.1], [0, TOP - 0.1]], cx, 0, cz, { seg: 8 });
        colBox(B, cx, 0, cz, 0.2, TOP, 0.2, { roof: true });
        for (const [ex, ez] of [[0, -Math.sign(cz)], [-Math.sign(cx), 0]]) B.tube(NS('gloss'), K.iron, [P3(cx, TOP - 0.55, cz), P3(cx + ex * 0.25, TOP - 0.2, cz + ez * 0.25), P3(cx + ex * 0.55, TOP - 0.05, cz + ez * 0.55)], 0.02, { radial: 4 });
      }
      // roof: fascia + fretwork valance, hipped slate, ridge + finial
      B.box('paint', K.trim, hw * 2 + 0.7, 0.18, hw * 2 + 0.7, 0, TOP + 0.09, 0, { r: 0.03 });
      for (let side = 0; side < 4; side++) { B.push(0, 0, 0, side * HP); for (let x = -hw - 0.3; x <= hw + 0.31; x += 0.2) pbox(B, NS('paint'), K.coral, 0.12, 0.16, 0.025, x, TOP - 0.06, hw + 0.36, {}); B.pop(); }
      B.lathe('paint', K.slate, [[(hw + 0.4) * 1.414, 0], [0.3, 1.5], [0, 1.55]], 0, TOP + 0.18, 0, { seg: 4, ry: PI / 4 });
      B.lathe('paint', K.trim, [[0, 0], [0.12, 0], [0.08, 0.3], [0.12, 0.4], [0, 0.55]], 0, TOP + 1.65, 0, { seg: 8 });
      B.sph('metal', K.gold, 0.07, 0, TOP + 2.25, 0, { ws: 8, hs: 6 });
      B.blob(6.4, 6.4);
    },
  };

  // ------------------------------------------------------------------------------------------ the ice-cream kiosk
  D.tidewater_icecream = {
    desc: 'Ice-cream kiosk dressing on the 2.6 m square, 2.5 m block (pos = block base centre): serving hatches with striped awnings on the plaza + spawn-facing sides, menu boards, a chest freezer (collides), a scalloped canopy valance round the flat roof (a squid-only perch) and a giant 99 cone sculpture on the roof (collides), wall posters.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const hw = 1.3, Hh = 2.5;
      const face = (side, fn) => { const ry = [0, HP, PI, -HP][side]; fpush(B, Math.sin(ry) * hw, 0, Math.cos(ry) * hw, ry); fn(); fpop(B); };
      for (let side = 0; side < 4; side++) face(side, () => {
        pbox(B, 'paint', K.trim, 2.7, 0.14, 0.08, 0, Hh - 0.07, 0.04);
        for (let i = 0; i < 13; i++) { const x = -1.3 + (i + 0.5) * 0.2; B.add(NS('paint'), discGeo(0.1, 6, true), i % 2 ? K.white : '#e98aa6', x, Hh - 0.14, 0.085, { rz: PI }); }
        pbox(B, 'paint', mixc(K.mint, K.ink, 0.3), 2.62, 0.2, 0.05, 0, 0.1, 0.025);
        if (side === 1 || side === 2) {
          // serving hatch: counter, glazed hatch, striped awning, menu + cone boards
          pbox(B, NS('gloss'), K.glass, 1.5, 0.9, 0.02, 0, 1.45, 0.012);
          pbox(B, NS('glow'), K.lamp, 1.4, 0.25, 0.004, 0, 1.75, 0.024, { glow: 0.8 });
          pbox(B, 'paint', K.white, 1.64, 0.07, 0.07, 0, 1.94, 0.035);
          B.box('wood', K.woodLt, 1.7, 0.06, 0.32, 0, 0.97, 0.16, { r: 0.015 });
          for (let i = 0; i < 9; i++) { const x = -0.8 + i * 0.2; B.push(x, 2.12, 0.02, 0, 0.62); pbox(B, 'paint', i % 2 ? K.white : '#e98aa6', 0.2, 0.03, 0.6, 0, 0, 0.3); B.pop(); }
          for (const sx of [-1, 1]) B.tube(NS('metal'), K.ironDk, [P3(sx * 0.82, 1.8, 0.02), P3(sx * 0.82, 1.9, 0.35), P3(sx * 0.82, 1.83, 0.5)], 0.012, { radial: 3 });
          letters(B, 'ICES', { h: 0.14, x: 0, y: 2.25, z: 0.09, c: '#b83a5e', flat: true, wt: 0.22, track: 0.15 });
          for (const [x, n] of [[-1.05, 'ice'], [1.05, 'menu']]) B.decal(n, 0.34, 0.44, x, 1.45, 0.02);
        }
      });
      // chest freezer at the plaza-side hatch (collides)
      fpush(B, hw + 0.55, 0, 0.55, 0);
      B.box('gloss', K.white, 0.9, 0.82, 0.62, 0, 0.41, 0, { round: true, r: 0.05 });
      pbox(B, NS('gloss'), K.glassLt, 0.8, 0.02, 0.52, 0, 0.83, 0);
      B.decal('ice', 0.3, 0.3, 0, 0.45, 0.315);
      COL(B, -0.45, 0, -0.31, 0.45, 0.85, 0.31);
      fpop(B);
      // giant 99 cone on the roof (the kiosk's landmark), roof cap trim
      const cx = -0.55, cz = -0.55;
      B.box('paint', K.trim, 2.66, 0.08, 2.66, 0, Hh + 0.04, 0, { r: 0.02 });
      B.lathe('paint', '#d9a55c', [[0.04, 0], [0.36, 1.25], [0.4, 1.3], [0, 1.3]], cx, Hh, cz, { seg: 12 });
      for (let k = 0; k < 6; k++) B.tube(NS('paint'), '#b98543', [P3(cx + Math.cos(k) * 0.05, Hh + 0.1, cz + Math.sin(k) * 0.05), P3(cx + Math.cos(k + 1.6) * 0.36, Hh + 1.25, cz + Math.sin(k + 1.6) * 0.36)], 0.012, { radial: 3 });
      B.lathe('gloss', '#fbf3df', [[0.44, 0], [0.46, 0.14], [0.38, 0.35], [0.3, 0.46], [0.22, 0.62], [0.1, 0.78], [0, 0.84]], cx, Hh + 1.26, cz, { seg: 14 });
      B.cyl('paint', '#5a3522', 0.05, 0.5, cx + 0.12, Hh + 2.0, cz, { rz: -0.4, seg: 6 });
      B.tube(NS('gloss'), '#e25a6d', [P3(cx - 0.3, Hh + 1.62, cz + 0.25), P3(cx - 0.2, Hh + 1.45, cz + 0.33), P3(cx - 0.34, Hh + 1.3, cz + 0.36)], 0.035, { radial: 5 });
      COL(B, cx - 0.45, Hh, cz - 0.45, cx + 0.45, Hh + 2.1, cz + 0.45, { roof: true });
      // roof clutter: an umbrella stand, a stool — the perch
      B.cyl('paint', K.coral, 0.2, 0.4, 0.6, Hh + 0.2, 0.6, { seg: 10 });
      B.blob(3.4, 3.4);
    },
  };

  // ------------------------------------------------------------------------------------------ tea rooms
  D.tidewater_tearooms = {
    desc: 'Tea rooms pavilion on the 4 × 4 m, 2.8 m block (pos = block base centre): arched glazed bays on all sides, a glass entrance porch, a verandah canopy on iron posts on the plaza side, a hipped roof with a lantern cupola and TEA ROOMS letters (roof collides), café tables + parasols outside (cover, collide).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const hw = 2.0, Hh = o.h ?? 2.8;
      const face = (side, fn) => { const ry = [0, HP, PI, -HP][side]; fpush(B, Math.sin(ry) * hw, 0, Math.cos(ry) * hw, ry); fn(); fpop(B); };
      for (let side = 0; side < 4; side++) face(side, () => {
        B.add('paint', ext('plinthTR', PROF.plinth, 4.1), K.stoneDk, 0, 0, 0, {});
        for (const x of [-1.0, 1.0]) archOpening(B, x, 0.55, 1.0, 1.35, { lit: 0.85, transom: 0.7, key: K.coral });
        for (const x of [-1.95, 0, 1.95]) pbox(B, 'paint', K.trim, 0.14, Hh - 0.3, 0.06, x, (Hh - 0.3) / 2, 0.03);
        B.add('paint', ext('cornTR', PROF.cornice, 4.3), K.trim, 0, Hh - 0.36, 0, {});
      });
      // hipped roof + cupola + letters (collide)
      B.lathe('paint', '#6f8a9a', [[hw * 1.414 + 0.35, 0], [0.9, 1.2], [0, 1.3]], 0, Hh, 0, { seg: 4, ry: PI / 4 });
      for (let k = 0; k < 4; k++) { const a = k * HP + PI / 4; B.tube(NS('paint'), K.trim, [P3(Math.cos(a) * (hw * 1.414 + 0.35), Hh + 0.02, Math.sin(a) * (hw * 1.414 + 0.35)), P3(Math.cos(a) * 0.9, Hh + 1.22, Math.sin(a) * 0.9)], 0.05, { radial: 4 }); }
      B.box('paint', K.trim, 0.9, 0.7, 0.9, 0, Hh + 1.5, 0, { r: 0.03 });
      for (let k = 0; k < 4; k++) { B.push(0, 0, 0, k * HP); pbox(B, NS('glow'), K.lamp, 0.5, 0.4, 0.01, 0, Hh + 1.52, 0.455, { glow: 0.7 }); B.pop(); }
      B.lathe('gloss', K.copper, [[0.62, 0], [0.4, 0.3], [0.1, 0.62], [0, 0.66]], 0, Hh + 1.85, 0, { seg: 4, ry: PI / 4 });
      B.sph('metal', K.gold, 0.07, 0, Hh + 2.58, 0, { ws: 8, hs: 6 });
      COL(B, -hw, Hh, -hw, hw, Hh + 1.3, hw, { roof: true });
      // plaza-side verandah (-X face) on posts with the sign
      fpush(B, -hw, 0, 0, -HP);
      B.box('gloss', K.ironDk, 4.4, 0.08, 1.3, 0, 2.62, 0.65, { r: 0.02 });
      for (let i = 0; i < 22; i++) pbox(B, NS('paint'), i % 2 ? K.white : K.coral, 0.2, 0.18, 0.02, -2.1 + i * 0.2, 2.5, 1.31);
      for (const x of [-2.0, 2.0]) { B.cyl('gloss', K.iron, 0.05, 2.6, x, 1.3, 1.22, { seg: 8 }); COL(B, x - 0.08, 0, 1.14, x + 0.08, 2.6, 1.3, { roof: true }); }
      COL(B, -2.2, 2.58, 0, 2.2, 2.7, 1.3, { roof: true });
      B.box('paint', K.navy, 2.4, 0.4, 0.06, 0, 3.05, 1.2, { r: 0.02 });
      letters(B, 'TEA ROOMS', { h: 0.22, x: 0, y: 2.94, z: 1.235, c: K.gold, flat: true, wt: 0.2, track: 0.14 });
      fpop(B);
      // café tables with parasols (cover)
      for (const [x, z, st] of [[-3.3, -1.1, 0], [-3.1, 1.6, 1], [0.4, -3.1, 1], [0.6, 3.0, 0]]) cafeTable(B, x, 0, z, st);
      B.blob(5.2, 5.2);
    },
  };

  // ------------------------------------------------------------------------------------------ floral clock + border
  function flowerBed(B, w, d, y, seed, cols) {
    const n = Math.round(w * d * 5), rnd = H.mulberry32(seed);
    for (let i = 0; i < n; i++) {
      const x = (rnd() - 0.5) * (w - 0.2), z = (rnd() - 0.5) * (d - 0.2);
      B.sph(NS('foliage'), cols[Math.floor(rnd() * cols.length)], 0.07 + rnd() * 0.05, x, y + 0.04, z, { ws: 5, hs: 3 });
    }
  }
  D.tidewater_floralclock = {
    desc: 'Floral clock on the 4.4 m square, 0.7 m kerbed bed (pos = bed centre on the ground): a tilted dial of bedding plants in rings (numerals as dark leaf batons), giant iron hands, a bronze plaque, box-hedge border. A raked collider over the dial (cover).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const hw = 2.2, Y = 0.7;
      B.box('paint', K.stone, 4.5, 0.12, 4.5, 0, Y - 0.04, 0, { r: 0.03 });
      for (const s of [-1, 1]) { B.box('foliage', K.leafDk, 4.3, 0.28, 0.3, 0, Y + 0.14, s * 2.0, { r: 0.1 }); B.box('foliage', K.leafDk, 0.3, 0.28, 3.7, s * 2.0, Y + 0.14, 0, { r: 0.1 }); }
      // the dial on a raked bank (low edge toward local +X, the square): soil wedge, then the dial tilted 22°
      const tilt = 0.38, rise = 3.8 * Math.tan(tilt);
      B.add('paint', tpl('fcBank', () => extrudeGeo([[-1.9, 0], [1.9, 0], [1.9, 0.06], [-1.9, rise]], 3.8, 0.002)), '#5a4535', 0, Y, 0, { ry: HP });
      fpush(B, 0, Y + rise / 2 + 0.04, 0, HP);
      B.push(0, 0, 0, 0, tilt);
      const rings = [['#e7d24a', 1.75], ['#d9554f', 1.45], [K.leaf, 1.2], ['#f1ede0', 0.95], ['#9a6ac2', 0.5]];
      for (const [cc, r] of rings) B.add('foliage', discGeo(r, 28), cc, 0, 0.002 * (2 - r), 0, { rx: -HP });
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; B.push(Math.sin(a) * 1.32, 0.03, Math.cos(a) * 1.32, -a); pbox(B, NS('foliage'), K.leafDk, 0.1, 0.06, 0.26, 0, 0, 0); B.pop(); }
      B.push(0, 0.07, 0, 0.8); pbox(B, 'gloss', K.ink, 0.1, 0.04, 1.0, 0, 0, 0.45); B.pop();
      B.push(0, 0.11, 0, 2.4); pbox(B, 'gloss', K.ink, 0.07, 0.04, 1.45, 0, 0, 0.66); B.pop();
      B.cyl('metal', K.gold, 0.1, 0.12, 0, 0.1, 0, { seg: 10 });
      B.pop();
      fpop(B);
      COL(B, -1.9, Y, -1.9, 1.9, Y + rise * 0.6, 1.9);
      // bronze plaque on the kerb facing the square (+X side in world → local +X)
      B.box('metal', K.bronze, 0.05, 0.3, 0.8, hw + 0.03, 0.4, 0, { r: 0.01 });
      B.push(hw + 0.06, 0.35, 0, HP); letters(B, 'FLORAL CLOCK', { h: 0.05, x: 0, y: 0, z: 0, c: K.gold, flat: true, wt: 0.24, track: 0.1, mat: 'metal' }); B.pop();
    },
  };
  D.tidewater_border = {
    desc: 'Raised flower border on a W × D stone-kerbed bed of height h (pos = bed centre on the ground): massed bedding (coral, cream, violet, yellow), cordyline palms, clipped box balls, a TIDEWATER IN BLOOM sign.',
    params: { w: 'm (6)', d: 'm (5)', h: 'm (0.9)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const w = o.w ?? 6, d = o.d ?? 5, Y = o.h ?? 0.9;
      B.box('paint', K.stone, w + 0.1, 0.12, d + 0.1, 0, Y - 0.04, 0, { r: 0.03 });
      B.box('paint', '#5a4535', w - 0.3, 0.04, d - 0.3, 0, Y + 0.005, 0, { r: 0.01 });
      flowerBed(B, w - 0.4, d - 0.4, Y, 7, ['#e3715e', '#f3ecd8', '#9a6ac2', '#e7d24a', '#e3715e', K.leaf]);
      for (const [x, z] of [[-w * 0.28, -d * 0.2], [w * 0.1, d * 0.25], [w * 0.3, -d * 0.25]]) {
        B.cyl('wood', '#8b6d4f', 0.07, 1.4, x, Y + 0.7, z, { seg: 6 });
        for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; B.push(x, Y + 1.4, z, a, 0.9 - (k % 3) * 0.25); pbox(B, NS('foliage'), K.leafLt, 0.06, 0.02, 0.7, 0, 0, 0.3); B.pop(); }
      }
      for (const [x, z] of [[-w / 2 + 0.5, d / 2 - 0.5], [w / 2 - 0.5, -d / 2 + 0.5], [w / 2 - 0.5, d / 2 - 0.5], [-w / 2 + 0.5, -d / 2 + 0.5]]) B.add('foliage', G_blob(0.34, 1, 5), K.leafDk, x, Y + 0.3, z, {});
      B.push(w / 2 + 0.02, 0, 0, HP);
      B.cyl('gloss', K.iron, 0.025, 0.7, -0.6, 0.35, 0.25, { seg: 5 }); B.cyl('gloss', K.iron, 0.025, 0.7, 0.6, 0.35, 0.25, { seg: 5 });
      B.box('paint', '#2f5d55', 1.5, 0.36, 0.04, 0, 0.62, 0.25, { r: 0.01 });
      letters(B, 'TIDEWATER IN BLOOM', { h: 0.075, x: 0, y: 0.58, z: 0.275, c: K.white, flat: true, wt: 0.22, track: 0.08 });
      B.pop();
    },
  };

  // ------------------------------------------------------------------------------------------ anchor memorial
  D.tidewater_anchor = {
    desc: 'Lifeboat memorial on the 2.2 m square, 1.0 m granite plinth (pos = plinth base centre): a great black admiralty anchor standing on it with a chain swag, bronze plaques, a wreath.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const Y = 1.0;
      B.add('paint', ext('plinthAn', PROF.plinth, 2.3), K.graniteDk, 0, 0, 1.1, {});
      B.box('paint', K.trim, 2.3, 0.1, 2.3, 0, Y + 0.05, 0, { r: 0.02 });
      B.box('paint', K.granite, 1.2, 0.3, 1.2, 0, Y + 0.25, 0, { r: 0.03 });
      for (let s = 0; s < 4; s++) { B.push(0, 0, 0, s * HP); pbox(B, 'metal', K.bronze, 1.0, 0.5, 0.03, 0, 0.5, 1.115); letters(B, s % 2 ? 'LOST AT SEA' : 'IN MEMORIAM', { h: 0.07, x: 0, y: 0.55, z: 1.135, c: K.gold, flat: true, wt: 0.24, track: 0.1, mat: 'metal' }); B.pop(); }
      const c = '#2b2d33', AY = Y + 0.4;
      B.push(0, AY, 0, 0.35);
      pbox(B, 'metal', c, 0.14, 2.3, 0.14, 0, 1.15, 0);
      B.cyl('metal', c, 0.05, 1.3, 0, 2.1, 0, { rz: HP, seg: 8 });
      for (const s of [-1, 1]) B.sph('metal', c, 0.08, s * 0.65, 2.1, 0, { ws: 8, hs: 6 });
      B.tor('metal', c, 0.16, 0.035, 0, 2.42, 0, { rs: 6, ts: 14 });
      B.tube('metal', c, arcPts(0, 0.75, 0, 0.75, PI + 0.25, TAU - 0.25, 12), 0.08, { radial: 7 });
      for (const s of [-1, 1]) { B.push(s * 0.73, 0.55, 0, 0, 0, s * 0.6); B.add('metal', triGeo(0.36, 0.34), c, 0, 0, 0, { rz: s > 0 ? -0.2 : 0.2 }); B.add('metal', triGeo(0.36, 0.34), c, 0, 0, -0.04, { ry: PI }); B.pop(); }
      B.pop();
      for (let i = 0; i < 9; i++) { const t = i / 8; B.tor(NS('metal'), '#3a3d44', 0.07, 0.02, -0.8 + t * 1.6, AY + 0.5 - 0.3 * Math.sin(t * PI), 0.62, { ry: i % 2 ? 0 : HP, rs: 3, ts: 8 }); }
      B.tor('foliage', K.leafDk, 0.28, 0.08, 0.6, Y + 0.55, 0.62, { rs: 5, ts: 14 });
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; B.sph(NS('paint'), K.red, 0.05, 0.6 + Math.cos(a) * 0.28, Y + 0.55 + Math.sin(a) * 0.28, 0.72, { ws: 5, hs: 4 }); }
      COL(B, -0.5, Y, -0.5, 0.5, Y + 2.8, 0.5, { roof: true });
      B.blob(3, 3);
    },
  };

  // ------------------------------------------------------------------------------------------ stair + wall dressing
  // stone balustrade following a flight along +X from height ya (x = 0) to yb (x = L), on the flight's open edge; a
  // skirt panel (facing local +Z, skirtZ behind pos) over the flight's side face below it; stepped colliders
  function rampBalustrade(B, L, ya, yb, o = {}) {
    const c = o.c ?? K.stone, Hh = o.h ?? 0.95, sl = Math.atan2(yb - ya, L), len = Math.hypot(L, yb - ya), yAt = (x) => ya + (yb - ya) * (x / L);
    if (o.rail !== false) {
      for (const [x, y] of [[0, ya], [L, yb]]) { B.box('paint', c, 0.4, Hh + 0.12, 0.42, x, y + (Hh + 0.12) / 2, 0, { r: 0.03 }); pbox(B, 'paint', shade(c, 1.03), 0.48, 0.07, 0.5, x, y + Hh + 0.155, 0); B.sph('paint', c, 0.12, x, y + Hh + 0.3, 0, { ws: 10, hs: 7 }); }
      B.push(L / 2, (ya + yb) / 2 + Hh - 0.08, 0, 0, 0, sl);
      B.box('paint', c, len - 0.36, 0.13, 0.36, 0, 0, 0, { r: 0.03 });
      pbox(B, 'paint', shade(c, 0.93), len - 0.36, 0.1, 0.3, 0, -Hh + 0.2, 0);
      B.pop();
      const n = Math.max(2, Math.round((L - 0.4) / 0.2));
      for (let k = 0; k < n; k++) { const x = 0.3 + ((L - 0.6) * k) / (n - 1); B.lathe('paint', c, BALU, x, yAt(x) + 0.16, 0, { seg: 6, sy: (Hh - 0.36) / 0.6 }); }
      if (o.col !== false) { const m = Math.max(2, Math.round(L / 1.0)); for (let k = 0; k < m; k++) { const x0 = (k * L) / m, x1 = ((k + 1) * L) / m; COL(B, x0, 0, -0.2, x1, Math.max(yAt(x0), yAt(x1)) + Hh + 0.1, 0.2, { rail: true }); } }
    }
    if (o.skirt !== false) {
      const zS = -(o.skirtZ ?? 0.22);
      const g = tpl(['skirt', L, ya, yb].map(kf).join('|'), () => { const gb = new GB(); const q = [gb.v(0, 0, 0, 0, 0, 1), gb.v(L, 0, 0, 0, 0, 1), gb.v(L, yb, 0, 0, 0, 1), gb.v(0, ya, 0, 0, 0, 1)]; gb.quad(q[0], q[1], q[2], q[3]); return gb.geo(); });
      B.add('paint', g, shade(c, 0.9), 0, 0, zS, {});
      B.push(L / 2, (ya + yb) / 2 - 0.12, zS + 0.03, 0, 0, sl); pbox(B, 'paint', c, len, 0.12, 0.06, 0, 0, 0); B.pop();
      B.push(L / 2, 0.12, zS + 0.03); pbox(B, 'paint', shade(c, 0.8), L, 0.24, 0.06, 0, 0, 0); B.pop();
      // channelled courses under the raking string (rusticated stone), where the face is tall enough
      for (let y = 0.6; y < Math.max(ya, yb) - 0.35; y += 0.42) {
        const lo = ya === yb ? 0 : Math.max(0, Math.min(L, ((y + 0.25 - ya) / (yb - ya)) * L)), x0 = ya > yb ? 0 : lo, x1 = ya > yb ? lo : L;
        if (x1 - x0 > 0.3) pbox(B, NS('paint'), shade(c, 0.74), x1 - x0, 0.035, 0.02, (x0 + x1) / 2, y, zS + 0.012);
      }
      for (let x = 0.9, k = 0; x < L - 0.3; x += 0.9, k++) { const top = Math.min(ya + (yb - ya) * (x / L), 99) - 0.3; for (let y = 0.6 + (k % 2) * 0.42; y < top - 0.42; y += 0.84) pbox(B, NS('paint'), shade(c, 0.74), 0.03, 0.42, 0.02, x, y + 0.21, zS + 0.012); }
    }
  }
  D.tidewater_rampbal = {
    desc: 'Stone balustrade on a flight’s open edge: runs along +X from pos, from height ya to yb over `length` (piers + ball finials at both ends, raking coping, balusters), with a skirt over the flight’s side face (rail:false = skirt only); stepped colliders.',
    params: { length: 'm', ya: 'm at pos', yb: 'm at the far end', col: 'bool', rail: 'bool', skirt: 'bool', skirtZ: 'm behind pos (0.22)' }, variants: 1, mount: 'ground',
    build(B, o) { rampBalustrade(B, o.length ?? 6, o.ya ?? 0, o.yb ?? 2.4, o); },
  };
  // rusticated stone wall dressing on a block face (wall z = 0, W wide centred on x = 0, Hh tall): channelled courses,
  // a plinth, optional blind arches / doors
  function rusticate(B, W, Hh, o = {}) {
    const c = o.c ?? K.stone;
    B.add('paint', ext('plinthR', PROF.plinth, W), shade(c, 0.9), 0, 0, 0, {});
    for (let y = 0.6; y < Hh - 0.1; y += 0.45) pbox(B, NS('paint'), shade(c, 0.82), W, 0.035, 0.02, 0, y, 0.008);
    if (o.cap !== false) B.add('paint', ext('capR', PROF.string, W + 0.04), K.trim, 0, Hh - 0.12, 0, {});
  }
  D.tidewater_townhallbase = {
    desc: 'Town Hall ground storey under the spawn (site piece, pos = world origin, Alpha half): the balcony front with the rusticated entrance arch + doors, lanterns and a plaque; the east wing front with blind arches + a side door; the wing-steps block’s side; bike stands, a notice board and bins in the nook behind the east flight.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      // balcony body front (z = -36, x -4.8 … 4.8, 0 … 2.2)
      fpush(B, 0, 0, -36, 0);
      rusticate(B, 9.6, 2.4);
      archOpening(B, 0, 0, 1.8, 1.25, { door: K.ironDk, lit: 0.9, key: K.stoneDk });
      for (const x of [-2.6, 2.6]) { archOpening(B, x, 0.55, 0.8, 0.8, { lit: 0.7, bars: true }); }
      for (const x of [-1.35, 1.35]) { pbox(B, 'gloss', K.ironDk, 0.06, 0.4, 0.2, x, 1.75, 0.1); lantern(B, x, 1.4, 0.3, 0.75); }
      const vv = (o.variant ?? 0) % 2;
      pbox(B, 'metal', K.bronze, 0.8, 0.34, 0.03, -3.8, 1.25, 0.02);
      letters(B, vv ? 'CUSTOM HOUSE' : 'TOWN HALL', { h: 0.07, x: -3.8, y: 1.3, z: 0.04, c: K.gold, flat: true, wt: 0.24, track: 0.1, mat: 'metal' });
      letters(B, 'OPEN 9 - 5', { h: 0.05, x: -3.8, y: 1.17, z: 0.04, c: K.gold, flat: true, wt: 0.24, track: 0.1, mat: 'metal' });
      fpop(B);
      // the loggia's seaward side (x = -9.5, facing the bay) — a rusticated sea wall with arched windows
      fpush(B, -9.5, 0, -41.9, -HP);
      rusticate(B, 7.0, 2.4, { c: K.stoneDk });
      for (const x of [-2.2, 0, 2.2]) archOpening(B, x, 0.6, 0.8, 0.9, { lit: 0.6, key: K.stone });
      fpop(B);
      // loggia side facing the nook (x = 9.5, z -41.5 … -38.4)
      fpush(B, 9.5, 0, -39.95, HP);
      rusticate(B, 3.1, 2.4);
      archOpening(B, 0, 0.2, 1.0, 1.3, { door: '#3a4a5c', lit: 0.8 });
      fpop(B);
      // east wing front (z = -41.5, x 9.5 … 17.5 visible, 0 … 2.2)
      fpush(B, 11.8, 0, -41.5, 0);
      rusticate(B, 4.6, 2.4);
      archOpening(B, -1.1, 0.3, 1.2, 0.95, { door: '#3a4a5c', lit: 0.8 });
      pbox(B, 'wood', K.wood, 1.4, 0.9, 0.06, 1.25, 1.35, 0.03);
      pbox(B, NS('paint'), '#2f4f45', 1.3, 0.8, 0.02, 1.25, 1.35, 0.065);
      for (const [x, y, n] of [[0.9, 1.5, 'pst2'], [1.55, 1.4, 'pst6']]) B.decal(n, 0.3, 0.45, x, y, 0.08);
      fpop(B);
      // the nook: bike stands, bins, a lamp
      for (const x of [11.0, 11.9, 12.8]) { B.tube('metal', K.ironDk, arcPts(x, 0, -40.5, 0.4, 0, PI, 8, 'xz').map((p) => P3(p[0], Math.sin(Math.acos(Math.max(-1, Math.min(1, (p[0] - x) / 0.4)))) * 0.75, -40.5)), 0.025, { radial: 5 }); COL(B, x - 0.42, 0, -40.56, x + 0.42, 0.8, -40.44, { rail: true }); }
      B.push(13.7, 0, -40.9); B.lathe('gloss', K.ironDk, [[0, 0], [0.26, 0], [0.26, 0.85], [0.28, 0.9], [0.2, 1.0], [0, 1.02]], 0, 0, 0, { seg: 10 }); B.pop();
      COL(B, 13.4, 0, -41.2, 14.0, 1.0, -40.6, { roof: true });
    },
  };

  // ------------------------------------------------------------------------------------------ the lifeboat station
  D.tidewater_lifeboat = {
    desc: 'Lifeboat station out on its own stone jetty off the tip of the promenade (pos = centre of its front at the foot, front faces +Z; out of play, no collision): the 15.5 × 7.6 m, 6.2 m house — gable, LIFEBOAT STATION letters, crew door, windows, service boards, the old bell — roofs + the octagonal lookout tower with its flagstaff, the boat-hall doors (local -X end) open onto a slipway running down into the sea with the lifeboat on its cradle.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const X0 = -25, X1 = -9.5, FZ = -38.4, TOP = 6.2, red = '#b8403a', navy = K.navy, cream = K.butter;
      // authored in the old corner coordinates: shift so the front centre is the prop origin
      fpush(B, 17.25, 0, 38.4, 0);
      B.box('paint', cream, X1 - X0, TOP + 1.2, 7.6, (X0 + X1) / 2, (TOP - 1.2) / 2, FZ - 3.8, { r: 0.05 });
      B.box(NS('paint'), K.stoneDk, X1 - X0 + 2.4, 2.4, 10.2, (X0 + X1) / 2, -1.2, FZ - 3.3, { r: 0.05 });
      pbox(B, NS('paint'), K.granite, X1 - X0 + 2.5, 0.1, 10.3, (X0 + X1) / 2, 0.02, FZ - 3.3);
      // ---- promenade front (z = -38.4 face, facing +Z)
      fpush(B, (X0 + X1) / 2, 0, FZ, 0);   // local x = world x + 17.25
      const Lw = X1 - X0;
      rusticate(B, Lw, 1.0, { c: K.stoneDk, cap: true });
      B.add('paint', ext('cornL', PROF.cornice, Lw + 0.2), K.trim, 0, TOP - 0.36, 0, {});
      mould(B, 'paint', K.trim, 'string', Lw, 0, 3.55, 0);
      for (const sx of [-1, 1]) quoins(B, sx * (Lw / 2 - 0.01), 0.4, TOP - 0.4, sx, K.stoneDk);
      // crew door + windows + first-floor windows
      archOpening(B, -3.2, 0, 1.3, 1.9, { door: navy, lit: 0.8, key: red });
      for (const x of [-6.2, 0.2, 3.2]) sash(B, x, 1.0, 1.0, 1.55, { frame: K.trim, lit: 0.7, hood: 'cornice' });
      for (const x of [-6.2, -3.2, 0.2, 3.2, 6.2]) sash(B, x, 4.1, 0.9, 1.3, { frame: K.trim, lit: 0.6, key: true });
      // name band + letters, crest roundel
      pbox(B, 'paint', navy, 9.0, 0.6, 0.08, -1.2, 3.1, 0.04);
      letters(B, 'LIFEBOAT STATION', { h: 0.34, x: -1.2, y: 2.93, z: 0.085, c: K.white, flat: true, wt: 0.2, track: 0.14 });
      B.cyl('gloss', red, 0.4, 0.05, 6.4, 3.1, 0.03, { rx: HP, seg: 18 });
      B.cyl('gloss', K.white, 0.3, 0.02, 6.4, 3.1, 0.06, { rx: HP, seg: 18 });
      B.tor(NS('gloss'), navy, 0.19, 0.04, 6.4, 3.1, 0.075, { rs: 4, ts: 16 });
      // service boards: launches, the tide table, a crew call bell on a bracket, a collection box (cover)
      pbox(B, 'wood', K.woodLt, 1.2, 1.5, 0.06, 5.2, 1.5, 0.03);
      pbox(B, NS('paint'), '#1f3150', 1.1, 1.4, 0.02, 5.2, 1.5, 0.065);
      letters(B, 'SERVICES', { h: 0.08, x: 5.2, y: 2.05, z: 0.08, c: K.gold, flat: true, wt: 0.24, track: 0.12 });
      for (let i = 0; i < 8; i++) pbox(B, NS('paint'), K.gold, 0.8 - (i % 3) * 0.15, 0.025, 0.004, 5.1, 1.85 - i * 0.12, 0.078);
      pbox(B, 'gloss', K.ironDk, 0.06, 0.06, 0.5, -1.5, 2.3, 0.25);
      B.lathe('metal', K.bronze, [[0, 0.3], [0.08, 0.28], [0.14, 0.12], [0.2, 0], [0.17, 0.01], [0, 0.04]], -1.5, 1.95, 0.45, { seg: 12 });
      fpop(B);
      // ---- roofs: slate, ridge along X, gable ends; the lookout tower on the east end
      B.push((X0 + X1) / 2 - 2.5, TOP, (FZ - 46) / 2);
      B.add('paint', tpl('lbRoof', () => extrudeGeo([[-3.9, 0], [3.9, 0], [0, 2.3]], 1, 0.001)), K.slate, 0, 0, 0, { sx: 10.6 });
      B.box('paint', shade(K.slate, 0.8), 10.8, 0.14, 0.26, 0, 2.3, 0, { r: 0.04 });
      B.pop();
      for (const x of [X0 + 0.02, X0 + 10.6]) { B.push(x, TOP, (FZ - 46) / 2, x < -20 ? -HP : HP); B.add('paint', triGeo(7.8, 2.3), cream, 0, 0, 0.0, {}); B.pop(); }
      const TX = -12.2, TZ = -42.2;
      B.box('paint', cream, 5.4, 0.4, 7.4, TX + 0.2, TOP + 0.2, TZ, { r: 0.04 });
      B.lathe('paint', cream, [[1.5, 0], [1.5, 2.6], [0, 2.6]], TX, TOP + 0.4, TZ, { seg: 8, ry: PI / 8 });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + PI / 8; B.push(TX + Math.cos(a) * 1.4, TOP + 0.4, TZ + Math.sin(a) * 1.4, HP - a); pbox(B, NS('gloss'), K.glassLt, 0.9, 1.2, 0.02, 0, 1.5, 0.02); pbox(B, 'paint', K.white, 0.95, 0.07, 0.06, 0, 2.12, 0.03); pbox(B, 'paint', K.white, 0.95, 0.07, 0.06, 0, 0.88, 0.03); B.pop(); }
      B.lathe('paint', K.white, [[1.7, 0], [1.7, 0.18], [0, 0.18]], TX, TOP + 3.0, TZ, { seg: 8, ry: PI / 8 });
      B.lathe('paint', red, [[1.72, 0], [0.9, 0.9], [0.12, 1.7], [0, 1.75]], TX, TOP + 3.18, TZ, { seg: 8, ry: PI / 8 });
      B.cyl('paint', K.white, 0.05, 4.0, TX, TOP + 5.9, TZ, { seg: 6 });
      B.cyl('paint', K.white, 0.03, 1.6, TX, TOP + 6.9, TZ, { rz: HP, seg: 5 });
      B.flag(TX, TOP + 7.7, TZ, { color: '#e8793a', s: 2.0 });
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) B.flag(TX + sx * (0.25 + k * 0.28), TOP + 6.82 - k * 0.2, TZ, { color: [red, K.yellow, '#3f6fb0', navy, K.white, red][k + (sx > 0 ? 3 : 0)], s: 0.9 });
      // ---- seaward end (x = -25): boat-hall doors open, slipway into the sea, the lifeboat on its cradle
      fpush(B, X0, 0, -42.2, -HP);   // facing -X; local x runs toward world -Z... (local +X = world +Z? no: -HP → +Z)
      B.add('paint', archPanelGeo(4.2, 2.9, 14), '#1b2430', 0, 0.0, 0.01, {});
      B.tube('paint', K.trim, arcPts(0, 2.9, 0.06, 2.2, 0, PI, 14), 0.1, { radial: 5 });
      for (const sx of [-1, 1]) { pbox(B, 'paint', K.trim, 0.26, 2.9, 0.14, sx * 2.23, 1.45, 0.07); B.push(sx * 2.1, 0, 0.02, sx * -1.2); pbox(B, 'wood', navy, 2.1, 2.8, 0.09, sx * -1.05, 1.4, 0.05); for (let i = 0; i < 7; i++) pbox(B, NS('wood'), shade(navy, 1.15), 0.04, 2.75, 0.02, sx * (-0.15 - i * 0.3), 1.4, 0.1); B.pop(); }
      letters(B, 'LIFEBOAT', { h: 0.42, x: 0, y: 5.3 - 0.1, z: 0.04, c: red, flat: true, wt: 0.2, track: 0.16 });
      fpop(B);
      // slipway: timber-decked ramp on piers from the door down into the sea
      B.push(X0 - 7.5, -1.55, -42.2, 0, 0, 0.2);
      B.box('wood', K.wood, 15.3, 0.3, 4.2, 0, 0, 0, { r: 0.04 });
      for (let i = -3; i <= 3; i++) pbox(B, NS('wood'), shade(K.wood, 0.8), 15.3, 0.02, 0.05, 0, 0.16, i * 0.55);
      for (const sz of [-1.6, 1.6]) pbox(B, 'metal', K.lead, 15.3, 0.12, 0.14, 0, 0.2, sz);
      B.pop();
      for (let i = 0; i < 5; i++) { const x = X0 - 1.5 - i * 3.2; B.cyl(NS('wood'), K.wood, 0.18, 4, x, -2.8 - i * 0.6 + 0.9, -43.9, { seg: 7 }); B.cyl(NS('wood'), K.wood, 0.18, 4, x, -2.8 - i * 0.6 + 0.9, -40.5, { seg: 7 }); }
      // the lifeboat on its cradle at the head of the slip: lofted navy hull with an orange sheer band, orange
      // wheelhouse with a window band, a lattice mast with the blue light, fenders — sitting on the slip's rake
      B.push(X0 - 5.4, -1.02, -42.2, -HP, 0.2, 0);
      B.add('gloss', tpl('lbHull2', () => {
        const g = new GB(), n = 14, m = 8, rows = [], cN = cx3(navy), cO = cx3('#e8793a'), cW = cx3('#f2eee6');
        for (let i = 0; i <= n; i++) {
          const t = i / n, zz = -4.2 + t * 8.4, bow = Math.max(0, (t - 0.62) / 0.38), hw = 1.45 * Math.sqrt(Math.max(0.02, 1 - bow * bow)) * (t < 0.08 ? 0.9 + t : 1);
          const sheer = 1.55 + 0.35 * bow * bow, keel = 0.05 + 0.15 * bow, row = [];
          for (let k = 0; k <= m; k++) {
            const u = k / m, a = (u - 0.5) * PI, y = keel + (sheer - keel) * (1 - Math.cos(a)) * 0.5 + (sheer - keel) * 0.5 * Math.abs(Math.sin(a)) * 0 , x = Math.sin(a) * hw * Math.pow(Math.abs(Math.sin(a)), -0.25 + 0.25);
            const yy = u === 0.5 ? keel : keel + (sheer - keel) * Math.pow(Math.abs(u - 0.5) * 2, 0.6);
            const c = yy > sheer - 0.3 ? cO : yy > sheer - 0.4 ? cW : cN;
            row.push(g.v(x, yy, zz, Math.sin(a), -Math.cos(a) * 0.4, 0, ...c));
          }
          rows.push(row);
        }
        for (let i = 0; i < n; i++) for (let k = 0; k < m; k++) g.quad(rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]);
        const geo = g.geo(); geo.computeVertexNormals(); return geo;
      }), 'white', 0, 0, 0, {});
      pbox(B, 'paint', K.white, 2.6, 0.06, 6.2, 0, 1.56, -0.8);
      B.box('gloss', navy, 2.7, 1.5, 0.08, 0, 0.8, -4.2, { r: 0.04 });
      pbox(B, 'paint', '#e8793a', 2.72, 0.3, 0.09, 0, 1.4, -4.2);
      B.box('gloss', '#e8793a', 2.1, 1.3, 3.2, 0, 2.2, -0.9, { round: true, r: 0.15 });
      for (const sx of [-1, 1]) pbox(B, NS('gloss'), K.glass, 0.02, 0.4, 2.6, sx * 1.06, 2.45, -0.9);
      pbox(B, NS('gloss'), K.glass, 1.8, 0.45, 0.02, 0, 2.45, 0.71);
      B.box('gloss', '#e8793a', 1.5, 0.5, 1.6, 0, 3.1, -1.2, { r: 0.1 });
      pbox(B, 'paint', K.white, 1.6, 0.06, 1.7, 0, 3.38, -1.2);
      for (const sx of [-0.25, 0.25]) B.cyl('metal', K.white, 0.035, 1.5, sx, 4.1, -1.3, { seg: 5 });
      for (let i = 0; i < 4; i++) pbox(B, NS('metal'), K.white, 0.5, 0.025, 0.025, 0, 3.55 + i * 0.3, -1.3);
      B.lathe(NS('glow'), '#6ab0ff', [[0, 0], [0.09, 0], [0.09, 0.15], [0, 0.15]], 0, 4.85, -1.3, { seg: 8, glow: 1.4 });
      for (let i = 0; i < 5; i++) B.lathe(NS('gloss'), '#2a2c31', [[0, -0.2], [0.09, -0.18], [0.1, 0.18], [0, 0.2]], 1.47, 1.3, -3 + i * 1.3, { seg: 6, rz: HP * 0.1 });
      B.push(1.47, 1.1, 0.4, HP); letters(B, 'TIDEWATER', { h: 0.2, x: 0, y: 0, z: 0.02, c: K.white, flat: true, wt: 0.22, track: 0.12 }); B.pop();
      B.pop();
      // cradle + keel rollers on the slip
      B.push(X0 - 5.4, -1.25, -42.2, -HP, 0.2, 0);
      for (const z of [-3, -1, 1, 3]) { pbox(B, 'metal', K.ironDk, 2.6, 0.18, 0.2, 0, 0.05, z); for (const sx of [-1, 1]) pbox(B, 'metal', K.ironDk, 0.15, 0.6, 0.2, sx * 1.1, 0.35, z); }
      B.pop();
      fpop(B);
    },
  };

  // ------------------------------------------------------------------------------------------ pier gate + the pier
  // pos = the gate centre on the sea edge (x = -25 side for Alpha's promenade, gate spanning local z -2.5 … 2.5,
  // the pier running out along local -X). The booths either side are level blocks (3 × 3 × 2.6).
  D.tidewater_pier = {
    desc: 'Pier gate + pier (pos = gate centre on the promenade edge, pier out along local -X): booth dressing (turnstile windows, clocks, pay boards, domed cupolas), a lit wrought-iron arch with the pier’s name, closed ornamental gates (collide), then the pier over the sea: cast-iron legs + bracing, a planked deck with railings and lamps, twin kiosks halfway, and the domed pavilion at the end with flags. variant 0 PALACE PIER, 1 VICTORIA PIER.',
    params: {}, variants: 2, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 2, name = v ? 'VICTORIA PIER' : 'PALACE PIER', accent = v ? '#5e7fb0' : K.coral, c = K.iron;
      // booths: dress the gate-facing + promenade-facing sides of the two 3 × 3 blocks (local x 0 … 3, z ±(2.5 … 5.5))
      for (const s of [-1, 1]) {
        const bz = s * 4.0, bx = 1.5;
        // promenade face (local +X, x = 3)
        fpush(B, 3, 0, bz, HP);
        rusticate(B, 3.0, 2.6, { c: K.stone });
        archOpening(B, 0, 0.8, 1.2, 0.9, { lit: 0.9, transom: 0.6 });
        pbox(B, 'wood', K.woodLt, 1.5, 0.08, 0.3, 0, 0.8, 0.15);
        B.decal('ferry', 0.5, 0.33, 0, 2.2, 0.02);
        fpop(B);
        // gate-facing side (z = ±2.5 facing the gate)
        fpush(B, bx, 0, s * 2.5, s > 0 ? PI : 0);
        B.add('paint', ext('plinthR', PROF.plinth, 3.0), shade(K.stone, 0.9), 0, 0, 0, {});
        B.add('paint', ext('capR', PROF.string, 3.04), K.trim, 0, 2.48, 0, {});
        fpop(B);
        // cupola on the booth roof (collides)
        B.lathe('paint', K.trim, [[1.6, 0], [1.6, 0.15], [0, 0.15]], bx, 2.6, bz, { seg: 4, ry: PI / 4 });
        B.lathe('paint', K.trim, [[1.0, 0], [1.0, 0.3], [1.08, 0.34], [1.08, 0.4], [0, 0.4]], bx, 2.75, bz, { seg: 8, ry: PI / 8 });
        const OG = [[1.02, 0], [1.06, 0.2], [0.94, 0.5], [0.62, 0.82], [0.32, 1.06], [0.16, 1.3], [0.1, 1.45], [0, 1.5]];
        B.lathe('gloss', accent, OG, bx, 3.15, bz, { seg: 8, ry: PI / 8 });
        for (let k = 0; k < 8; k++) { const a = PI / 8 + (k / 8) * TAU; B.tube(NS('gloss'), K.trim, OG.slice(0, 7).map(([r, y]) => P3(bx + Math.cos(a) * (r * 0.96 + 0.03), 3.16 + y, bz + Math.sin(a) * (r * 0.96 + 0.03))), 0.035, { radial: 3 }); }
        B.sph('metal', K.gold, 0.09, bx, 4.72, bz, { ws: 8, hs: 6 });
        B.cyl('metal', K.ink, 0.02, 0.6, bx, 5.0, bz, { seg: 4 });
        COL(B, bx - 1.5, 2.6, bz - 1.5, bx + 1.5, 4.3, bz + 1.5, { roof: true });
      }
      // the arch over the gate: two iron piers on the booth corners, a lattice arch, name letters (lit), lamps
      const AX = 0.3, AT = 5.2;
      for (const s of [-1, 1]) { B.box('gloss', c, 0.3, AT - 2.6, 0.3, AX, 2.6 + (AT - 2.6) / 2, s * 2.6, { r: 0.03 }); lantern(B, AX, AT, s * 2.6, 1.0); }
      const arch = []; for (let k = 0; k <= 14; k++) { const t = (k / 14) * PI; arch.push(P3(AX, AT - 0.2 + Math.sin(t) * 0.9, -Math.cos(t) * 2.6)); }
      B.tube('gloss', c, arch, 0.06, { radial: 6 });
      B.tube(NS('gloss'), c, arch.map((p) => P3(p[0], p[1] - 0.55, p[2] * 0.97)), 0.04, { radial: 5 });
      for (let k = 1; k < 14; k++) { const t = (k / 14) * PI; B.cyl(NS('gloss'), c, 0.015, 0.5, AX, AT - 0.48 + Math.sin(t) * 0.9, -Math.cos(t) * 2.55, { seg: 4 }); }
      B.push(AX + 0.05, AT - 0.85, 0, HP);
      letters(B, name, { h: 0.3, x: 0, y: 0, z: 0.0, c: K.white, flat: true, wt: 0.2, track: 0.12, mat: 'glow', glow: 1.2 });
      B.pop();
      B.push(AX - 0.05, AT - 0.85, 0, -HP);
      letters(B, name, { h: 0.3, x: 0, y: 0, z: 0.0, c: K.white, flat: true, wt: 0.2, track: 0.12, mat: 'glow', glow: 1.2 });
      B.pop();
      // closed gates (collide): two leaves of bars with a scrolled top
      for (const s of [-1, 1]) {
        B.push(0.15, 0, s * 1.25);
        pbox(B, 'gloss', c, 0.06, 0.06, 2.5, 0, 0.12, 0); pbox(B, 'gloss', c, 0.06, 0.06, 2.5, 0, 2.0, 0);
        for (let i = 0; i < 13; i++) { const z = -1.2 + i * 0.2; B.cyl(NS('gloss'), c, 0.016, 2.1, 0, 1.05, z, { seg: 4 }); B.sph(NS('gloss'), K.gold, 0.03, 0, 2.18, z, { ws: 4, hs: 3 }); }
        B.tor(NS('gloss'), c, 0.4, 0.02, 0, 1.3, 0, { ry: HP, rs: 3, ts: 14 });
        B.pop();
      }
      COL(B, -0.1, 0, -2.5, 0.4, 2.3, 2.5, { rail: true });
      // ---- the pier over the sea (outside the arena): deck at 0 from x = 0 to -58, pavilion at the end
      const L0 = -0.2, L1 = -60, W = 6.4, DK = K.woodLt;
      B.box(NS('wood'), DK, L0 - L1, 0.35, W, (L0 + L1) / 2, -0.175, 0, { r: 0.03 });
      for (let z = -W / 2 + 0.35; z < W / 2; z += 0.35) pbox(B, NS('wood'), shade(DK, 0.82), L0 - L1, 0.01, 0.025, (L0 + L1) / 2, 0.002, z);
      pbox(B, NS('paint'), c, L0 - L1, 0.35, 0.05, (L0 + L1) / 2, -0.35, W / 2 + 0.02); pbox(B, NS('paint'), c, L0 - L1, 0.35, 0.05, (L0 + L1) / 2, -0.35, -W / 2 - 0.02);
      for (let x = -3; x > L1 + 1; x -= 6) {
        for (const z of [-W / 2 + 0.3, 0, W / 2 - 0.3]) B.cyl(NS('gloss'), c, 0.16, 3.2, x, -1.95, z, { seg: 7 });
        B.tube(NS('gloss'), c, [P3(x, -2.8, -W / 2 + 0.3), P3(x, -0.6, W / 2 - 0.3)], 0.04, { radial: 4 });
        B.tube(NS('gloss'), c, [P3(x, -2.8, W / 2 - 0.3), P3(x, -0.6, -W / 2 + 0.3)], 0.04, { radial: 4 });
      }
      for (const s of [-1, 1]) {
        B.push(L1 + 0.5, 0, s * (W / 2 - 0.08), 0);
        B.cyl(NS('gloss'), c, 0.025, L0 - L1 - 0.5, (L0 - L1 - 0.5) / 2, 1.0, 0, { rz: HP, seg: 6, open: true });
        B.cyl(NS('gloss'), c, 0.015, L0 - L1 - 0.5, (L0 - L1 - 0.5) / 2, 0.12, 0, { rz: HP, seg: 4, open: true });
        for (let x = 0; x < L0 - L1 - 0.5; x += 0.5) B.cyl(NS('gloss'), c, 0.01, 0.9, x, 0.55, 0, { seg: 3, open: true });
        B.pop();
        for (let x = -8; x > L1 + 4; x -= 10) { B.lathe(NS('gloss'), c, [[0, 0], [0.12, 0], [0.06, 0.3], [0.05, 3.2], [0, 3.2]], x, 0, s * (W / 2 - 0.25), { seg: 6 }); lantern(B, x, 3.15, s * (W / 2 - 0.25), 0.9); }
        // halfway kiosks with little domes
        const kx = -30;
        B.box(NS('paint'), K.stucco, 2.4, 2.4, 1.8, kx, 1.2, s * (W / 2 - 1.2), { r: 0.04 });
        B.lathe(NS('gloss'), accent, [[1.3, 0], [1.1, 0.4], [0.5, 1.1], [0, 1.4]], kx, 2.4, s * (W / 2 - 1.2), { seg: 8 });
      }
      // pavilion: long hall with arched windows, a big onion dome, four turrets, flags
      const PX = L1 - 7, PW = 16, PD = 12;
      B.box(NS('paint'), DK, PW + 2, 0.35, PD + 3, PX, -0.175, 0, { r: 0.04 });
      for (let x = PX - 7; x <= PX + 7; x += 7) for (const z of [-5, 0, 5]) B.cyl(NS('gloss'), c, 0.2, 3.2, x, -1.95, z, { seg: 7 });
      B.box(NS('paint'), K.stucco, PW, 5.2, PD, PX, 2.6, 0, { r: 0.05 });
      for (const [rx, ry2, w] of [[HP, 0, PD], [-HP, 0, PD]]) { B.push(PX + (rx > 0 ? PW / 2 : -PW / 2), 0, 0, rx); for (let x = -4; x <= 4.1; x += 2.6) archOpening(B, x, 1.0, 1.4, 2.0, { lit: 1.0, key: accent }); B.pop(); }
      for (const s of [-1, 1]) { B.push(PX, 0, s * PD / 2, s > 0 ? 0 : PI); for (let x = -6; x <= 6.1; x += 2.4) archOpening(B, x, 1.0, 1.4, 2.0, { lit: 1.0, key: accent }); B.pop(); }
      B.box(NS('paint'), K.trim, PW + 0.4, 0.4, PD + 0.4, PX, 5.4, 0, { r: 0.05 });
      B.lathe(NS('paint'), K.stucco, [[4.2, 0], [4.2, 1.6], [0, 1.6]], PX, 5.6, 0, { seg: 12 });
      B.lathe(NS('gloss'), accent, [[4.4, 0], [4.9, 1.6], [4.6, 3.2], [3.4, 4.6], [1.6, 5.8], [0.5, 6.6], [0, 7.2]], PX, 7.2, 0, { seg: 16 });
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; B.tube(NS('gloss'), K.trim, [[4.4, 0], [4.9, 1.6], [4.6, 3.2], [3.4, 4.6], [1.6, 5.8], [0.5, 6.6]].map(([r, y]) => P3(PX + Math.cos(a) * (r + 0.04), 7.2 + y, Math.sin(a) * (r + 0.04))), 0.06, { radial: 3 }); }
      B.cyl(NS('metal'), K.gold, 0.08, 2.0, PX, 15.2, 0, { seg: 6 });
      B.sph(NS('metal'), K.gold, 0.25, PX, 14.5, 0, { ws: 10, hs: 8 });
      B.flag(PX, 16.0, 0, { color: accent, s: 2.4 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const tx = PX + sx * (PW / 2 - 0.2), tz = sz * (PD / 2 - 0.2);
        B.lathe(NS('paint'), K.stucco, [[1.2, 0], [1.2, 7.2], [0, 7.2]], tx, 0, tz, { seg: 8 });
        B.lathe(NS('gloss'), accent, [[1.3, 0], [1.45, 0.7], [1.2, 1.5], [0.5, 2.3], [0, 2.7]], tx, 7.2, tz, { seg: 8 });
        B.cyl(NS('paint'), K.white, 0.04, 1.8, tx, 10.6, tz, { seg: 4 });
        B.flag(tx, 11.4, tz, { color: sx * sz > 0 ? K.white : accent, s: 1.3 });
      }
      B.push(PX + PW / 2 + 0.05, 4.4, 0, HP);
      letters(B, name, { h: 0.55, x: 0, y: 0, z: 0, c: accent, flat: true, wt: 0.2, track: 0.1, mat: 'glow', glow: 1.0 });
      B.pop();
    },
  };

  // ------------------------------------------------------------------------------------------ seaside furniture
  // café table: iron pedestal, marble top, three bistro chairs, a striped parasol (st 0 teal, 1 coral)
  function cafeTable(B, x, y, z, st) {
    B.push(x, y, z);
    B.cyl('metal', K.ironDk, 0.03, 0.72, 0, 0.36, 0, { seg: 6 });
    B.cyl('paint', K.white, 0.4, 0.04, 0, 0.74, 0, { seg: 14 });
    B.lathe(NS('metal'), K.ironDk, [[0, 0], [0.22, 0], [0.2, 0.03], [0, 0.03]], 0, 0, 0, { seg: 8 });
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.4; B.push(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62, -a - HP); pbox(B, 'gloss', K.iron, 0.36, 0.03, 0.36, 0, 0.45, 0); pbox(B, NS('gloss'), K.iron, 0.36, 0.4, 0.03, 0, 0.66, -0.17); for (const sx of [-1, 1]) pbox(B, NS('gloss'), K.iron, 0.025, 0.45, 0.025, sx * 0.15, 0.22, 0); B.pop(); }
    B.cyl(NS('metal'), K.white, 0.02, 1.6, 0, 1.4, 0, { seg: 5 });
    B.add('foliage', tpl('parasol' + st, () => { const g = new GB(); const n = 8, R2 = 1.1, h = 0.35; const top = g.v(0, h, 0, 0, 1, 0, ...cx3(K.white)); const ids = []; for (let i = 0; i <= n; i++) { const a = (i / n) * TAU; const cc = cx3(i % 2 ? K.white : (st ? K.coral : '#4f8fa0')); ids.push(g.v(Math.cos(a) * R2, 0, Math.sin(a) * R2, Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3, ...cc)); } for (let i = 0; i < n; i++) g.tri(top, ids[i], ids[i + 1]); return g.geo(); }), 'white', 0, 2.05, 0, {});
    COL(B, -0.45, 0, -0.45, 0.45, 0.78, 0.45);
    B.blob(1.8, 1.8);
    B.pop();
  }
  D.tidewater_cafe = {
    desc: 'Café table (marble top on an iron pedestal) with three bistro chairs and a striped parasol; the table collides (low cover). variant 0 teal, 1 coral.',
    params: {}, variants: 2, mount: 'ground',
    build(B, o) { cafeTable(B, 0, 0, 0, (o.variant ?? 0) % 2); },
  };

  D.tidewater_punchjudy = {
    desc: 'Punch & Judy booth (front +Z): red-and-white striped canvas tower on a frame, a gilt proscenium with PUNCH & JUDY letters, curtains, Mr Punch and his crocodile, a swazzle-man’s bottle bag; collides (cover).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const W = 1.5, Dd = 1.0, Hh = 2.1;
      // striped canvas sides (vertex-coloured stripes)
      const stripes = tpl('pjStripe', () => { const g = new GB(); const n = 10; for (let i = 0; i < n; i++) { const c3 = cx3(i % 2 ? K.white : K.red); const x0 = -0.5 + i / n, x1 = x0 + 1 / n; const q = [g.v(x0, 0, 0, 0, 0, 1, ...c3), g.v(x1, 0, 0, 0, 0, 1, ...c3), g.v(x1, 1, 0, 0, 0, 1, ...c3), g.v(x0, 1, 0, 0, 0, 1, ...c3)]; g.quad(q[0], q[1], q[2], q[3]); } return g.geo(); });
      for (let side = 0; side < 4; side++) {
        const ry = side * HP, w = side % 2 ? Dd : W, off = side % 2 ? W / 2 : Dd / 2;
        B.push(Math.sin(ry) * off, 0, Math.cos(ry) * off, ry);
        if (side === 0) { B.add('foliage', stripes, 'white', 0, 0, 0, { sx: w, sy: 1.25 }); B.add('foliage', stripes, 'white', 0, 1.95, 0, { sx: w, sy: 0.6 }); }
        else B.add('foliage', stripes, 'white', 0, 0, 0, { sx: w, sy: Hh + 0.45 });
        B.pop();
      }
      // proscenium: gilt frame, red curtains, the playboard ledge, name board on top
      B.box('paint', K.gold, W + 0.06, 0.08, 0.1, 0, 1.25, Dd / 2 + 0.03, { r: 0.02 });
      B.box('paint', K.gold, W + 0.06, 0.08, 0.1, 0, 1.95, Dd / 2 + 0.03, { r: 0.02 });
      for (const sx of [-1, 1]) B.box('paint', K.gold, 0.08, 0.78, 0.1, sx * (W / 2 - 0.02), 1.6, Dd / 2 + 0.03, { r: 0.02 });
      for (const sx of [-1, 1]) B.box('paint', '#9e2c34', 0.3, 0.66, 0.04, sx * 0.52, 1.62, Dd / 2 - 0.02, { r: 0.02 });
      pbox(B, NS('paint'), '#1d2a44', W - 0.2, 0.66, 0.02, 0, 1.6, Dd / 2 - 0.08);
      B.box('wood', K.wood, W, 0.06, 0.24, 0, 1.3, Dd / 2 + 0.1, { r: 0.01 });
      B.box('paint', K.navy, W + 0.3, 0.42, 0.06, 0, Hh + 0.3, Dd / 2 + 0.02, { r: 0.03 });
      letters(B, 'PUNCH & JUDY', { h: 0.17, x: 0, y: Hh + 0.22, z: Dd / 2 + 0.055, c: K.yellow, flat: true, wt: 0.22, track: 0.08 });
      B.lathe('paint', K.red, [[0, 0], [0.12, 0.02], [0.14, 0.18], [0, 0.34]], 0, Hh + 0.45, 0, { seg: 8 });
      // Mr Punch (hooked nose, red coat, hat) + crocodile on the playboard
      B.push(-0.3, 1.33, Dd / 2 + 0.05);
      B.lathe('paint', K.red, [[0, 0], [0.09, 0], [0.1, 0.2], [0.05, 0.28], [0, 0.28]], 0, 0, 0, { seg: 8 });
      B.sph('paint', '#f1c8a8', 0.08, 0, 0.36, 0, { ws: 8, hs: 6 });
      B.cyl('paint', '#e79a7a', 0.025, 0.1, 0, 0.35, 0.08, { rx: HP, r2: 0.012, seg: 5 });
      B.lathe('paint', K.yellow, [[0, 0], [0.07, 0], [0.03, 0.18], [0, 0.2]], 0, 0.42, 0, { seg: 6, rz: 0.4 });
      B.pop();
      B.push(0.35, 1.36, Dd / 2 + 0.06, 0.3);
      pbox(B, 'paint', '#4f8a4a', 0.34, 0.1, 0.12, 0, 0.05, 0);
      pbox(B, 'paint', '#4f8a4a', 0.2, 0.05, 0.1, -0.2, 0.08, 0, { rz: 0.3 });
      for (const sx of [-0.1, 0.02, 0.14]) pbox(B, NS('paint'), K.white, 0.02, 0.03, 0.12, sx, 0.0, 0);
      B.pop();
      colBox(B, 0, 0, 0, W, Hh + 0.2, Dd, { roof: true });
      B.blob(W + 0.8, Dd + 0.8);
    },
  };
  D.tidewater_telescope = {
    desc: 'Coin-operated seafront binocular viewer on a fluted cast-iron pedestal, faces +Z; small collider.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const c = o.color ?? K.iron;
      B.lathe('gloss', c, [[0, 0], [0.2, 0], [0.2, 0.06], [0.1, 0.12], [0.07, 0.2], [0.06, 1.0], [0.09, 1.06], [0, 1.08]], 0, 0, 0, { seg: 10 });
      B.push(0, 1.25, 0, 0, -0.15);
      B.box('gloss', c, 0.34, 0.26, 0.3, 0, 0, 0, { round: true, r: 0.06 });
      for (const sx of [-1, 1]) { B.cyl('gloss', c, 0.07, 0.3, sx * 0.08, 0.02, 0.25, { rx: HP, seg: 10 }); B.cyl(NS('gloss'), K.glass, 0.055, 0.01, sx * 0.08, 0.02, 0.405, { rx: HP, seg: 10 }); B.cyl('gloss', K.ink, 0.05, 0.08, sx * 0.07, 0.03, -0.18, { rx: HP, seg: 8 }); }
      pbox(B, NS('metal'), K.gold, 0.06, 0.02, 0.01, 0.1, 0.1, -0.15);
      B.pop();
      B.cyl('metal', K.ironDk, 0.03, 0.18, 0, 1.12, 0, { seg: 6 });
      COL(B, -0.2, 0, -0.2, 0.2, 1.3, 0.2, { roof: true });
      B.blob(0.7, 0.7);
    },
  };
  D.tidewater_tidegauge = {
    desc: 'Harbour tide board on the sea railing: a tall white post with a painted metre scale, a TIDE TABLE board with high/low water times and a little hood, a brass tide-clock dial. Non-colliding apart from the post.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('paint', K.white, 0.22, 3.4, 0.14, 0, 1.7, 0, { r: 0.02 });
      for (let i = 0; i < 16; i++) pbox(B, NS('paint'), i % 2 ? K.ink : K.red, i % 5 === 0 ? 0.16 : 0.1, 0.03, 0.01, 0.04, 0.3 + i * 0.2, 0.075);
      B.box('paint', K.navy, 0.9, 1.05, 0.06, 0, 2.0, 0.1, { r: 0.03 });
      B.add('paint', ext('tgHood', [[0, 0], [0.25, 0], [0, 0.18]], 1.0), K.slate, 0, 2.55, 0.08, {});
      letters(B, 'TIDE TABLE', { h: 0.07, x: 0, y: 2.36, z: 0.135, c: K.gold, flat: true, wt: 0.24, track: 0.1 });
      for (let i = 0; i < 4; i++) { letters(B, ['HW 06:12', 'LW 12:31', 'HW 18:40', 'LW 00:55'][i], { h: 0.055, x: -0.05, y: 2.18 - i * 0.12, z: 0.135, c: K.white, flat: true, wt: 0.24, track: 0.06 }); }
      B.cyl('metal', K.bronze, 0.16, 0.05, 0, 1.65, 0.12, { rx: HP, seg: 14 });
      B.cyl(NS('paint'), '#f4ecd8', 0.13, 0.01, 0, 1.65, 0.15, { rx: HP, seg: 14 });
      B.push(0, 1.65, 0.16, 0, 0, -0.7); pbox(B, NS('paint'), K.ink, 0.015, 0.11, 0.005, 0, 0.05, 0); B.pop();
      COL(B, -0.12, 0, -0.08, 0.12, 2.6, 0.08, { roof: true });
    },
  };
  D.tidewater_pillarbox = {
    desc: 'Victorian hexagonal pillar box (red, crowned cap with acanthus bud, VR cypher, posting slit, collection plate); collides.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const c = '#c7372f';
      B.lathe('gloss', c, [[0.3, 0], [0.3, 0.1], [0.26, 0.14], [0.26, 1.2], [0.31, 1.26], [0.31, 1.32], [0.22, 1.42], [0.12, 1.5], [0.06, 1.6], [0, 1.66]], 0, 0, 0, { seg: 6, ry: PI / 6 });
      B.sph('gloss', c, 0.07, 0, 1.66, 0, { ws: 8, hs: 6 });
      pbox(B, NS('gloss'), K.ink, 0.3, 0.035, 0.03, 0, 1.08, 0.24);
      pbox(B, 'gloss', shade(c, 1.1), 0.34, 0.06, 0.06, 0, 1.13, 0.24);
      pbox(B, NS('paint'), K.white, 0.18, 0.12, 0.01, 0, 0.8, 0.266);
      letters(B, 'VR', { h: 0.09, x: 0, y: 0.5, z: 0.266, c: K.gold, flat: true, wt: 0.24, track: 0.1 });
      COL(B, -0.3, 0, -0.3, 0.3, 1.5, 0.3, { roof: true });
      B.blob(0.9, 0.9);
    },
  };
  D.tidewater_barometer = {
    desc: 'The public barometer: a Portland-stone obelisk pillar on a stepped base with a big aneroid barometer dial (glows at dusk), a thermometer, a tide-time plaque and a gas lamp on top; collides (cover).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('paint', K.granite, 1.1, 0.2, 1.1, 0, 0.1, 0, { r: 0.03 });
      B.box('paint', K.stone, 0.9, 0.25, 0.9, 0, 0.32, 0, { r: 0.03 });
      B.lathe('paint', K.stone, [[0.36, 0], [0.3, 2.3], [0.36, 2.34], [0.36, 2.44], [0, 2.44]], 0, 0.44, 0, { seg: 4, ry: PI / 4 });
      for (let s = 0; s < 2; s++) {
        B.push(0, 0, 0, s * PI);
        B.push(0, 1.9, 0.25, 0, -0.05);
        B.add(NS('glow'), discGeo(0.22, 24), '#f6eedb', 0, 0, 0.03, { glow: 0.8 });
        B.tor('metal', K.bronze, 0.24, 0.03, 0, 0, 0.03, { rs: 4, ts: 24 });
        for (let i = 0; i < 9; i++) { const a = -2.2 + (i / 8) * 4.4; B.push(Math.sin(a) * 0.17, Math.cos(a) * 0.17, 0.035, 0, 0, -a); pbox(B, NS('paint'), K.ink, 0.012, 0.04, 0.004, 0, 0, 0); B.pop(); }
        B.push(0, 0, 0.045, 0, 0, 0.6); pbox(B, NS('paint'), K.ink, 0.012, 0.18, 0.004, 0, 0.07, 0); B.pop();
        B.pop();
        pbox(B, 'metal', K.bronze, 0.1, 0.7, 0.03, 0, 1.2, 0.3);
        B.cyl(NS('paint'), K.red, 0.012, 0.5, 0, 1.15, 0.32, { seg: 4 });
        pbox(B, 'metal', K.bronze, 0.5, 0.3, 0.02, 0, 0.62, 0.36);
        B.pop();
      }
      lantern(B, 0, 2.9, 0, 1.0);
      COL(B, -0.45, 0, -0.45, 0.45, 2.9, 0.45, { roof: true });
      B.blob(1.4, 1.4);
    },
  };
  D.tidewater_boattrips = {
    desc: 'BOAT TRIPS booking kiosk: hexagonal timber booth (2 m across) with a glazed hatch, fare boards, a bell-cast roof and a pennant; collides (cover).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const R = 1.0, Hh = 2.3;
      B.lathe('paint', '#3f7fa0', [[R, 0], [R, Hh], [0, Hh]], 0, 0, 0, { seg: 6 });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU, ax = Math.cos(a + PI / 6) * R * 0.866, az = Math.sin(a + PI / 6) * R * 0.866;
        B.push(ax, 0, az, HP - a - PI / 6);
        pbox(B, 'paint', K.white, 1.0, 0.12, 0.04, 0, 0.1, 0.02); pbox(B, 'paint', K.white, 1.0, 0.1, 0.04, 0, Hh - 0.05, 0.02);
        if (k === 1 || k === 4) { pbox(B, NS('gloss'), K.glass, 0.7, 0.75, 0.02, 0, 1.45, 0.012); pbox(B, NS('glow'), K.lamp, 0.62, 0.2, 0.004, 0, 1.7, 0.024, { glow: 0.8 }); B.box('wood', K.woodLt, 0.8, 0.05, 0.22, 0, 1.05, 0.11, { r: 0.01 }); }
        else { pbox(B, 'paint', K.white, 0.72, 0.9, 0.02, 0, 1.3, 0.012); for (let i = 0; i < 5; i++) pbox(B, NS('paint'), '#1f3150', 0.55 - (i % 2) * 0.12, 0.03, 0.004, 0, 1.6 - i * 0.14, 0.024); }
        B.pop();
      }
      B.lathe('gloss', K.white, [[R + 0.25, 0], [R + 0.1, 0.15], [0.45, 0.6], [0.1, 0.9], [0, 0.95]], 0, Hh, 0, { seg: 6 });
      B.cyl('paint', K.white, 0.025, 0.9, 0, Hh + 1.3, 0, { seg: 5 });
      B.flag(0, Hh + 1.72, 0, { color: '#3f7fa0', s: 1.2 });
      B.push(0, Hh + 0.25, R + 0.2, 0, -0.35);
      B.box('paint', K.navy, 1.4, 0.3, 0.05, 0, 0, 0, { r: 0.02 });
      letters(B, 'BOAT TRIPS', { h: 0.14, x: 0, y: -0.07, z: 0.03, c: K.yellow, flat: true, wt: 0.22, track: 0.1 });
      B.pop();
      COL(B, -0.9, 0, -0.9, 0.9, Hh + 0.6, 0.9, { roof: true });
      B.blob(2.6, 2.6);
    },
  };
  D.tidewater_urn = {
    desc: 'Planted Portland-stone urn on a square pedestal (1.3 m), bedding flowers; collides.',
    params: { color: 'flowers' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('paint', K.stone, 0.56, 0.72, 0.56, 0, 0.36, 0, { r: 0.03 });
      pbox(B, 'paint', K.trim, 0.66, 0.08, 0.66, 0, 0.76, 0);
      urn(B, 0, 0.8, 0, o.color ?? K.coral);
      COL(B, -0.3, 0, -0.3, 0.3, 1.3, 0.3, { roof: true });
      B.blob(0.9, 0.9);
    },
  };


  // granite band / kerb laid flush in the paving along +X from pos (w wide, 2 cm proud): covers pattern seams
  D.tidewater_kerb = {
    desc: 'Granite band laid in the paving along +X from pos (length, width w), 2 cm proud; non-colliding.',
    params: { length: 'm', w: 'm (0.36)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 10, w = o.w ?? 0.36, n = Math.max(1, Math.round(L / 1.2));
      for (let i = 0; i < n; i++) B.box(NS('paint'), shade(K.granite, 0.94 + 0.08 * ((i * 7) % 3) / 2), L / n - 0.012, 0.03, w, (i + 0.5) * (L / n), 0.005, 0, { r: 0.008 });
    },
  };

  D.tidewater_fingerpost = {
    desc: 'Cast-iron fingerpost with a crown finial and three or four pointing arms (PIER, TOWN HALL, BANDSTAND, LIFEBOAT, TEA ROOMS, PROMENADE); arm angles via `arms` [[label, deg], …]. Post collides.',
    params: { arms: '[[label, yaw deg], …]' }, variants: 1, mount: 'ground',
    build(B, o) {
      const c = K.iron, arms = o.arms ?? [['PIER', 90], ['TOWN HALL', 180], ['BANDSTAND', 0]];
      B.lathe('gloss', c, [[0, 0], [0.16, 0], [0.16, 0.1], [0.1, 0.18], [0.07, 0.3], [0.06, 2.9], [0.08, 2.95], [0.08, 3.02], [0, 3.02]], 0, 0, 0, { seg: 8 });
      B.tor(NS('gloss'), K.gold, 0.065, 0.014, 0, 0.5, 0, { rx: HP, rs: 3, ts: 10 });
      B.lathe('gloss', c, [[0, 0], [0.1, 0], [0.12, 0.08], [0.06, 0.16], [0.08, 0.24], [0, 0.3]], 0, 3.02, 0, { seg: 8 });
      B.sph('metal', K.gold, 0.05, 0, 3.36, 0, { ws: 6, hs: 4 });
      arms.forEach(([t, deg], i) => {
        const y = 2.68 - i * 0.3;
        B.push(0, y, 0, (deg * PI) / 180);
        const w = Math.max(0.7, t.length * 0.1 + 0.25);
        B.box('paint', K.white, w, 0.2, 0.04, w / 2 + 0.06, 0, 0, { r: 0.02 });
        B.add('paint', triGeo(0.2, 0.14), K.white, w + 0.06, -0.1, 0.0, { rz: -HP });
        for (const f of [1, -1]) { B.push(w / 2 + 0.06, -0.055, f * 0.021, f > 0 ? 0 : PI); letters(B, t, { h: 0.1, x: 0, y: 0, z: 0.001, c: K.navy, flat: true, wt: 0.22, track: 0.08 }); B.pop(); }
        B.pop();
      });
      COL(B, -0.16, 0, -0.16, 0.16, 2.2, 0.16, { roof: true });
      B.blob(0.6, 0.6);
    },
  };
  D.tidewater_bollard = {
    desc: 'Cast-iron cannon bollard (a muzzle-down old cannon, painted), collides; `count` of them along +X every `step` m.',
    params: { count: '1', step: 'm (1.4)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const n = o.count ?? 1, st = o.step ?? 1.4;
      for (let i = 0; i < n; i++) {
        const x = i * st;
        B.lathe('gloss', K.ironDk, [[0, 0], [0.15, 0], [0.15, 0.05], [0.13, 0.08], [0.12, 0.62], [0.14, 0.66], [0.14, 0.72], [0.1, 0.78], [0.12, 0.84], [0.06, 0.92], [0, 0.93]], x, 0, 0, { seg: 10 });
        B.tor(NS('gloss'), K.gold, 0.125, 0.012, x, 0.62, 0, { rx: HP, rs: 3, ts: 10 });
        COL(B, x - 0.15, 0, -0.15, x + 0.15, 0.93, 0.15, { roof: true });
      }
    },
  };
  D.tidewater_drain = {
    desc: 'Round cast-iron gully cover / coal-hole plate flush in the paving (no collider).',
    params: { r: 'm (0.3)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const r = o.r ?? 0.3;
      B.cyl(NS('metal'), '#3d4046', r, 0.02, 0, 0.005, 0, { seg: 16 });
      for (let i = -2; i <= 2; i++) pbox(B, NS('metal'), '#2b2d31', r * 1.6 * Math.cos(Math.asin(Math.min(0.95, Math.abs(i) * 0.3))), 0.004, 0.04, 0, 0.017, i * r * 0.3);
    },
  };


  function pierLamp(B, x, y, z) {
    B.lathe('gloss', K.iron, [[0, 0], [0.14, 0], [0.14, 0.06], [0.09, 0.12], [0.06, 0.2], [0.05, 0.85], [0.07, 0.9], [0, 0.92]], x, y, z, { seg: 8 });
    B.tor(NS('gloss'), K.gold, 0.055, 0.012, x, y + 0.3, z, { rx: HP, rs: 3, ts: 8 });
    lantern(B, x, y + 0.9, z, 1.0);
  }

  // pollarded London plane in a cast-iron tree grate with a hooped guard; trunk collides
  D.tidewater_tree = {
    desc: 'Pollarded London plane: mottled trunk with knuckled pollard heads, a cloud of leaf clusters (≈ 3.5 m up, 5 m across), a square cast-iron tree grate + hooped guard; the trunk collides.',
    params: { s: 'size (1)' }, variants: 2, mount: 'ground',
    build(B, o) {
      const s = o.s ?? 1, v = (o.variant ?? 0) % 2;
      pbox(B, NS('metal'), K.ironDk, 1.3, 0.02, 1.3, 0, 0.01, 0);
      for (let i = -2; i <= 2; i++) { pbox(B, NS('metal'), '#2a2d31', 1.2, 0.022, 0.03, 0, 0.012, i * 0.22); }
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; B.cyl(NS('gloss'), K.iron, 0.015, 1.0, Math.cos(a) * 0.36, 0.5, Math.sin(a) * 0.36, { seg: 4 }); }
      B.tor(NS('gloss'), K.iron, 0.36, 0.015, 0, 1.0, 0, { rx: HP, rs: 3, ts: 14 });
      B.tor(NS('gloss'), K.iron, 0.36, 0.012, 0, 0.55, 0, { rx: HP, rs: 3, ts: 14 });
      const trunk = [P3(0, 0, 0), P3(0.05, 1.2, 0.02), P3(-0.04, 2.4, 0.06), P3(0.02, 3.2 * s, 0)];
      B.tube('wood', '#9c9580', trunk, (t) => 0.2 - 0.07 * t, { radial: 8 });
      for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + v; B.tube('wood', '#a8a08a', [P3(0.02, 3.0 * s, 0), P3(Math.cos(a) * 0.6, 3.6 * s, Math.sin(a) * 0.6), P3(Math.cos(a) * 1.0, 4.1 * s, Math.sin(a) * 1.0)], (t) => 0.1 - 0.05 * t, { radial: 5 }); B.sph('wood', '#8f8874', 0.11, Math.cos(a) * 1.0, 4.1 * s, Math.sin(a) * 1.0, { ws: 6, hs: 4 }); }
      const rnd = H.mulberry32(17 + v * 7), tones = ['#5f9a52', '#6fa85c', '#4f8a4a', '#86b565'];
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU * 2.3 + rnd(), r = 0.35 + rnd() * 1.45, y = 4.3 + rnd() * 1.3 - r * 0.3 + (k < 3 ? 0.6 : 0);
        B.add('foliage', G_blob(0.45 + rnd() * 0.3, 1, 3 + (k % 6)), tones[k % 4], Math.cos(a) * r, y * s, Math.sin(a) * r, { sy: 0.75 });
      }
      COL(B, -0.25, 0, -0.25, 0.25, 3.0, 0.25, { roof: true });
      COL(B, -0.4, 0, -0.4, 0.4, 1.05, 0.4, { rail: true });   // the hooped tree guard
      B.blob(3.6, 3.6);
    },
  };

  D.tidewater_streetname = {
    desc: 'Cast-iron street name plate on a wall (z = 0, pos = plate centre): white enamel, black letters, a coral key line, fixing bolts; text param.',
    params: { text: 'TIDEWATER PLAZA', sub: 'second line (optional)' }, variants: 1, mount: 'wall',
    build(B, o) {
      const t = o.text ?? 'TIDEWATER PLAZA', w = Math.max(1.0, t.length * 0.11 + 0.3), h = o.sub ? 0.44 : 0.32, bronze = !!o.bronze;
      B.box(bronze ? 'metal' : 'paint', bronze ? K.bronze : K.ink, w + 0.06, h + 0.06, 0.03, 0, 0, 0.015, { r: 0.02 });
      B.box(bronze ? 'metal' : 'paint', bronze ? shade(K.bronze, 0.8) : K.white, w, h, 0.02, 0, 0, 0.035, { r: 0.02 });
      if (bronze) { letters(B, t, { h: 0.12, x: 0, y: o.sub ? 0.0 : -0.06, z: 0.046, c: '#f0d9a0', flat: true, wt: 0.2, track: 0.1, mat: 'metal' }); if (o.sub) letters(B, o.sub, { h: 0.06, x: 0, y: -0.14, z: 0.046, c: '#f0d9a0', flat: true, wt: 0.24, track: 0.1, mat: 'metal' }); return; }
      pbox(B, NS('paint'), K.coral, w - 0.08, 0.012, 0.004, 0, h / 2 - 0.05, 0.047); pbox(B, NS('paint'), K.coral, w - 0.08, 0.012, 0.004, 0, -h / 2 + 0.05, 0.047);
      letters(B, t, { h: 0.12, x: 0, y: o.sub ? 0.0 : -0.06, z: 0.046, c: K.ink, flat: true, wt: 0.2, track: 0.1 });
      if (o.sub) letters(B, o.sub, { h: 0.06, x: 0, y: -0.14, z: 0.046, c: K.coralDk, flat: true, wt: 0.24, track: 0.1 });
      for (const sx of [-1, 1]) B.cyl(NS('metal'), K.lead, 0.015, 0.01, sx * (w / 2 - 0.05), 0, 0.048, { rx: HP, seg: 6 });
    },
  };

  // a herring gull perched on something (pos = its feet), facing +Z; variant 1 = hunched, 2 = calling (beak up)
  D.tidewater_gull = {
    desc: 'Herring gull perched (pos = feet), faces +Z: white body, grey back + wings with black tips, yellow beak with a red spot, pink legs. variant 1 hunched, 2 calling. No collider.',
    params: {}, variants: 3, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 3, s = 1;
      for (const sx of [-0.035, 0.035]) B.cyl(NS('paint'), '#e8a6a0', 0.008, 0.08, sx, 0.04, 0, { seg: 3 });
      B.push(0, 0.1, 0, 0, v === 1 ? 0.1 : -0.25);
      B.add('paint', tpl('gullBody', () => latheGeo([[0, -0.16], [0.05, -0.14], [0.075, -0.06], [0.07, 0.06], [0.04, 0.14], [0, 0.17]], 7)), '#f4f2ec', 0, 0.05, 0, { rx: HP });
      for (const sx of [-1, 1]) { B.push(sx * 0.06, 0.08, -0.03, 0, 0, sx * 0.25); pbox(B, NS('paint'), '#9aa3ab', 0.03, 0.05, 0.24, 0, 0, 0); pbox(B, NS('paint'), '#23262d', 0.028, 0.045, 0.07, 0, 0, -0.14); B.pop(); }
      B.pop();
      B.push(0, v === 1 ? 0.2 : 0.24, 0.1, 0, v === 2 ? -0.7 : 0);
      B.sph('paint', '#f4f2ec', 0.05, 0, 0, 0, { ws: 7, hs: 5 });
      B.cyl(NS('paint'), '#e9c24a', 0.012, 0.07, 0, -0.005, 0.07, { rx: HP, r2: 0.006, seg: 4 });
      for (const sx of [-1, 1]) B.sph(NS('paint'), '#1a1c20', 0.008, sx * 0.03, 0.015, 0.03, { ws: 4, hs: 3 });
      B.pop();
    },
  };



  D.tidewater_rnlibox = {
    desc: 'Lifeboat collection box: a little navy-and-orange lifeboat on a red pillar (collides, off-limits top).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const red = '#b8403a';
      B.box('paint', red, 0.5, 0.95, 0.5, 0, 0.475, 0, { r: 0.05 });
      B.add('gloss', tpl('cbhull', () => extrudeGeo([[-0.34, 0], [0.34, 0], [0.4, 0.2], [-0.4, 0.2]], 0.9, 0.02)), K.navy, 0, 0.95, 0, {});
      pbox(B, 'paint', K.white, 0.9, 0.04, 0.72, 0, 1.17, 0);
      B.box('gloss', '#e8793a', 0.4, 0.18, 0.4, 0.1, 1.28, 0, { r: 0.03 });
      letters(B, 'LIFEBOATS', { h: 0.06, x: 0, y: 0.6, z: 0.252, c: K.white, flat: true, wt: 0.24, track: 0.08 });
      COL(B, -0.45, 0, -0.35, 0.45, 1.3, 0.35, { roof: true });
      B.blob(0.9, 0.9);
    },
  };

  // ================================================================================================ the Winter Gardens
  // (the Long Stages stretch, 2026-09-30: layout.js GARDEN) — the Palm House and its terrace, the garden's topiary, tub
  // palms, the drinking fountain, the coxswain's statue, the carpet beds, the esplanade's seat shelters

  // ---- the Palm House: dresses the layout's plinth + glass collider + terrace (pos = the plinth's centre on the square,
  //      front +Z to the terrace and mid): a cast-iron glasshouse — two glazed wings with curved roofs either side of a
  //      taller central pavilion carrying a ribbed glass dome, a lantern and a finial; white-painted glazing bars on
  //      pale glass, a gutter cornice with cresting, the doors onto the terrace, a stove stack at the back. On the terrace:
  //      the stone balustrade with urns, THE WINTER GARDENS on its front face, flight balustrades. The roofs collide
  //      (off limits); the walls are the layout's glass collider.
  D.tidewater_palmhouse = {
    desc: 'The Winter Gardens Palm House over its plinth (pos = plinth centre on the square, front +Z): glazed wings with barrel-vault roofs, central pavilion with a ribbed glass dome, lantern + finial, glazing bars, gutter cornice + iron cresting, terrace doors, rear stove stack; the terrace balustrade between its two flights (visual), urns, THE WINTER GARDENS on the terrace front. Roof colliders (off limits).',
    params: { w: 'plinth length along X (12.8)', d: 'plinth depth (6.4)', plinth: 'plinth top above pos (1.1)', glass: 'wall top above pos (5.6)', td: 'terrace depth (3.2)', tt: 'terrace top above pos (1.4)', fx: 'the flights\' inner edge |x| (4.0)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = o.w ?? 12.8, Dd = o.d ?? 6.4, PT = o.plinth ?? 1.1, GT = o.glass ?? 5.6, TD = o.td ?? 3.2, TT = o.tt ?? 1.4, FX = o.fx ?? 4.0;
      const hw = W / 2, hd = Dd / 2, CW = 3.0, CT = GT + 1.4, iron = K.white, ironDk = '#d9d6cc', glass = '#b9d5d0', glassDk = '#98bab6', stone = K.stone;
      const WY = PT + 0.12;   // glass walls start on the coping
      // ---- plinth coping + base course + iron grilles (the plinth is the layout block)
      B.box('paint', stone, W + 0.12, 0.14, Dd + 0.12, 0, PT + 0.05, 0, { r: 0.03 });
      for (const [sx, sz, L, ry] of [[0, -1, W, PI], [1, 0, Dd, HP], [-1, 0, Dd, -HP]]) {
        fpush(B, sx * hw, 0, sz * hd, ry);
        pbox(B, 'paint', K.stoneDk, L + 0.06, 0.16, 0.05, 0, 0.1, 0.02);
        for (let x = -L / 2 + 1.1; x < L / 2 - 0.8; x += 2.1) { pbox(B, NS('metal'), K.ironDk, 0.5, 0.26, 0.02, x, PT * 0.55, 0.012); for (let k = -2; k <= 2; k++) pbox(B, NS('metal'), '#1f2a2c', 0.02, 0.22, 0.02, x + k * 0.09, PT * 0.55, 0.02); }
        fpop(B);
      }
      // ---- glazed walls: a pane per face strip, the bars over it; the pavilion's walls rise to CT
      const wall = (L, y0, y1, bay, ry, x, z) => {
        fpush(B, x, 0, z, ry);
        pbox(B, 'gloss', glass, L, y1 - y0, 0.02, 0, (y0 + y1) / 2, 0.02);
        const n = Math.max(1, Math.round(L / bay));
        for (let i = 0; i <= n; i++) pbox(B, 'paint', iron, 0.07, y1 - y0, 0.07, -L / 2 + (i * L) / n, (y0 + y1) / 2, 0.05);
        for (const y of [y0 + 0.05, y0 + (y1 - y0) * 0.45, y1 - 0.05]) pbox(B, 'paint', iron, L, 0.07, 0.07, 0, y, 0.05);
        for (let i = 0; i < n; i++) pbox(B, NS('paint'), ironDk, 0.03, y1 - y0 - 0.1, 0.03, -L / 2 + ((i + 0.5) * L) / n, (y0 + y1) / 2, 0.045);
        fpop(B);
      };
      const wingL = hw - CW;
      for (const s of [-1, 1]) {
        const xc = s * (CW + wingL / 2);
        wall(wingL, TT, GT, 0.7, 0, xc, hd + 0.03);            // front (over the terrace)
        wall(wingL, WY, GT, 0.7, PI, xc, -hd - 0.03);          // back
        wall(Dd, WY, GT, 0.72, s * HP, s * (hw + 0.03), 0);    // end
      }
      wall(CW * 2, TT, CT, 0.72, 0, 0, hd + 0.03);
      wall(CW * 2, WY, CT, 0.72, PI, 0, -hd - 0.03);
      for (const s of [-1, 1]) wall(Dd, GT, CT, 0.72, s * HP, s * (CW + 0.03), 0);   // the pavilion's side walls above the wings
      // corner piers: fluted iron columns with capitals at every corner of the wings and the pavilion
      for (const [x, z] of [[-hw, -hd], [-hw, hd], [hw, -hd], [hw, hd], [-CW, -hd], [-CW, hd], [CW, -hd], [CW, hd]]) {
        const top = Math.abs(x) < CW + 0.1 ? CT : GT, y0 = z > 0 ? TT : WY;
        B.lathe('paint', iron, [[0, y0], [0.12, y0], [0.12, y0 + 0.12], [0.08, y0 + 0.2], [0.07, top - 0.3], [0.12, top - 0.18], [0.12, top], [0, top]], x, 0, z, { seg: 8 });
      }
      // ---- gutter cornices: along the wings at GT, round the pavilion at CT, with an iron cresting on the pavilion
      for (const s of [-1, 1]) {
        const xc = s * (CW + wingL / 2);
        for (const sz of [-1, 1]) B.box('paint', iron, wingL + 0.2, 0.18, 0.26, xc, GT + 0.06, sz * (hd + 0.1), { r: 0.03 });
        B.box('paint', iron, 0.26, 0.18, Dd + 0.4, s * (hw + 0.1), GT + 0.06, 0, { r: 0.03 });
      }
      B.box('paint', iron, CW * 2 + 0.3, 0.2, Dd + 0.4, 0, CT + 0.07, 0, { r: 0.03 });
      for (const sz of [-1, 1]) for (let x = -CW; x <= CW + 0.01; x += 0.36) B.lathe(NS('paint'), iron, [[0, 0], [0.03, 0], [0.02, 0.18], [0.05, 0.24], [0, 0.32]], x, CT + 0.17, sz * (hd + 0.15), { seg: 5 });
      // ---- wing roofs: glass barrel vaults along X (springing at GT, rise 1.4) with iron ribs every 0.85 m
      const rise = 1.4, prof = [];
      for (let i = 0; i <= 12; i++) { const a = (i / 12) * PI; prof.push([Math.cos(a) * (hd + 0.05), Math.sin(a) * rise]); }
      const vaultGeo = tpl(['pvault', hd, rise].map(kf).join('|'), () => extrudeGeo([...prof, ...prof.slice().reverse().map(([zz, yy]) => [zz * 0.985, yy * 0.97])], 1, 0.001));
      for (const s of [-1, 1]) {
        const xc = s * (CW + wingL / 2);
        B.add('gloss', vaultGeo, glassDk, xc, GT + 0.12, 0, { sx: wingL });
        const nr = Math.max(2, Math.round(wingL / 0.85));
        for (let k = 0; k <= nr; k++) { const x = s * CW + s * (k * wingL) / nr; B.tube('paint', iron, prof.map(([zz, yy]) => P3(x, GT + 0.14 + yy, zz)), 0.035, { radial: 4 }); }
        B.tube('paint', iron, [P3(s * CW, GT + 0.14 + rise, 0), P3(s * hw, GT + 0.14 + rise, 0)], 0.05, { radial: 5 });
        // the lunette at the wing's end: a half-disc of glass with radial bars, a ball finial on top
        fpush(B, s * (hw + 0.02), GT + 0.12, 0, s * HP);
        B.add('gloss', discGeo(1, 14, true), glass, 0, 0, 0.01, { sx: hd, sy: rise });
        for (let k = 1; k < 6; k++) { const a = (k / 6) * PI; B.tube(NS('paint'), iron, [P3(0, 0, 0.03), P3(Math.cos(a) * hd, Math.sin(a) * rise, 0.03)], 0.02, { radial: 3 }); }
        fpop(B);
        B.sph('metal', K.gold, 0.09, s * (hw + 0.05), GT + 0.2 + rise + 0.1, 0, { ws: 8, hs: 6 });
      }
      // ---- the dome: drum, ribbed glass dome, lantern, finial
      const DR = 2.75, DY = CT + 0.18;
      B.cyl('paint', iron, DR + 0.1, 0.5, 0, DY + 0.25, 0, { seg: 24 });
      B.lathe('gloss', glass, [[DR, 0], [DR * 0.97, 0.85], [DR * 0.86, 1.7], [DR * 0.66, 2.4], [DR * 0.38, 2.9], [0.5, 3.1], [0, 3.13]], 0, DY + 0.5, 0, { seg: 24 });
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU, pts = [[DR + 0.03, 0], [DR * 0.99, 0.85], [DR * 0.88, 1.7], [DR * 0.68, 2.4], [DR * 0.4, 2.9], [0.53, 3.09]];
        B.tube(k % 2 ? NS('paint') : 'paint', iron, pts.map(([r, y]) => P3(Math.cos(a) * r, DY + 0.5 + y, Math.sin(a) * r)), k % 2 ? 0.022 : 0.04, { radial: 4 });
      }
      for (const y of [0.95, 1.9]) B.tor(NS('paint'), iron, DR * (y < 1.5 ? 0.965 : 0.84), 0.025, 0, DY + 0.5 + y, 0, { rx: HP, rs: 3, ts: 28 });
      const LY = DY + 0.5 + 3.09;
      B.cyl('paint', iron, 0.62, 0.85, 0, LY + 0.42, 0, { seg: 10 });
      B.cyl(NS('glow'), K.lamp, 0.55, 0.66, 0, LY + 0.42, 0, { seg: 10, glow: 0.75 });   // (the lantern lit: it glows at dusk)
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; B.cyl(NS('paint'), iron, 0.03, 0.76, Math.cos(a) * 0.59, LY + 0.42, Math.sin(a) * 0.59, { seg: 4 }); }
      B.lathe('paint', iron, [[0, 0], [0.78, 0], [0.46, 0.33], [0.11, 0.56], [0, 0.58]], 0, LY + 0.85, 0, { seg: 10 });
      B.lathe('metal', K.gold, [[0, 0], [0.08, 0], [0.05, 0.4], [0.12, 0.5], [0, 0.7]], 0, LY + 1.4, 0, { seg: 8 });
      B.flag(0, LY + 2.0, 0, { color: K.navy, s: 1.3 });
      B.cyl('metal', K.ironDk, 0.02, 0.9, 0, LY + 1.9, 0, { seg: 4 });
      // roof colliders (off limits): the wing vaults, the pavilion top, the dome + lantern
      COL(B, -hw - 0.2, GT, -hd - 0.3, -CW, GT + rise + 0.2, hd + 0.3, { roof: true });
      COL(B, CW, GT, -hd - 0.3, hw + 0.2, GT + rise + 0.2, hd + 0.3, { roof: true });
      COL(B, -CW - 0.15, GT, -hd - 0.3, CW + 0.15, CT + 0.25, hd + 0.3, { roof: true });
      COL(B, -DR, CT + 0.25, -DR, DR, LY + 1.3, DR, { roof: true });
      // ---- the doors onto the terrace (pavilion front, closed: double glazed doors under a fanlight), end doors
      fpush(B, 0, 0, hd + 0.08, 0);
      for (const sx of [-1, 1]) { B.box('paint', K.ironDk, 0.9, 2.3, 0.06, sx * 0.47, TT + 1.15, 0.02, { r: 0.015 }); pbox(B, NS('gloss'), glassDk, 0.7, 1.9, 0.02, sx * 0.47, TT + 1.2, 0.06); pbox(B, NS('metal'), K.gold, 0.03, 0.2, 0.03, sx * 0.08, TT + 1.05, 0.07); }
      B.add('paint', archPanelGeo(1.95, 0.02, 12), K.ironDk, 0, TT + 2.32, 0.03, {});
      for (const sx of [-1, 1]) { pbox(B, 'gloss', K.ironDk, 0.06, 0.36, 0.22, sx * 1.4, TT + 2.35, 0.1); lantern(B, sx * 1.4, TT + 2.0, 0.3, 0.85); }
      fpop(B);
      for (const s of [-1, 1]) { fpush(B, s * (hw + 0.06), 0, 0, s * HP); B.box('paint', K.ironDk, 1.4, 2.1, 0.05, 0, WY + 1.05, 0.02, { r: 0.015 }); pbox(B, NS('gloss'), glassDk, 1.2, 1.7, 0.02, 0, WY + 1.1, 0.05); pbox(B, 'gloss', K.ironDk, 0.06, 0.36, 0.22, 0, WY + 2.5, 0.1); lantern(B, 0, WY + 2.15, 0.3, 0.8); fpop(B); }
      // ---- the stove stack at the back (brick, off limits; west of centre, clear of Tower Command's south-walk leg)
      const sx0 = -4.3;
      B.box('paint', K.brick, 0.8, CT + 0.8, 0.6, sx0, (CT + 0.8) / 2, -hd - 0.33, { r: 0.03 });
      pbox(B, 'paint', K.stone, 0.95, 0.15, 0.75, sx0, CT + 0.85, -hd - 0.33);
      for (const dx of [-0.18, 0.18]) B.cyl('paint', K.pot, 0.09, 0.4, sx0 + dx, CT + 1.1, -hd - 0.33, { seg: 8 });
      COL(B, sx0 - 0.4, 0, -hd - 0.63, sx0 + 0.4, CT + 0.95, -hd, { roof: true });
      // ---- the terrace (in front, local z hd … hd + TD at TT): the stone balustrade between the two flights with urns,
      //      its coping + a string course along the front, THE WINTER GARDENS on the front wall between the flights
      const fz = hd + TD - 0.18;
      fpush(B, -FX + 0.1, TT, fz, 0); balustrade(B, 2 * FX - 0.2, { col: false, urns: 1, urnC: K.coral, bay: 2.6 }); fpop(B);
      fpush(B, 0, 0, hd + TD, 0);
      pbox(B, 'paint', K.stoneDk, 2 * FX - 0.1, 0.14, 0.04, 0, 0.07, 0.02);
      B.box('paint', K.navy, 5.6, 0.46, 0.04, 0, TT * 0.5, 0.02, { r: 0.015 });
      pbox(B, 'paint', K.gold, 5.4, 0.02, 0.005, 0, TT * 0.5 + 0.19, 0.043);
      pbox(B, 'paint', K.gold, 5.4, 0.02, 0.005, 0, TT * 0.5 - 0.19, 0.043);
      letters(B, 'THE WINTER GARDENS · 1887', { h: 0.15, x: 0, y: TT * 0.5 - 0.075, z: 0.045, c: K.gold, flat: true, wt: 0.22, track: 0.12 });
      fpop(B);
      // the terrace's end walls: a stone band and quoins (the ends stay open: a hop, a squid climb)
      for (const s of [-1, 1]) { fpush(B, s * hw, 0, hd + TD / 2, s * HP); pbox(B, 'paint', K.stoneDk, TD, 0.14, 0.04, 0, TT - 0.05, 0.02); quoins(B, -TD / 2 + 0.02, 0.1, TT - 0.1, -1); quoins(B, TD / 2 - 0.02, 0.1, TT - 0.1, 1); fpop(B); }
      B.blob(W + 2, Dd + 2);
    },
  };

  // ---- topiary: variant 0 a clipped yew cone in a white Versailles planter, 1 a box ball on a clean stem (a
  //      "lollipop") in a planter, 2 a tiered yew (three clipped discs on a trunk) set straight in a bed. Collides (cover).
  D.tidewater_topiary = {
    desc: 'Clipped topiary: 0 yew cone in a white Versailles planter (2.2 m), 1 box ball on a stem in a planter (1.9 m), 2 three-tier yew in the ground (2.1 m). Collider = planter + foliage core (cover).',
    params: { s: 'size (1)' }, variants: 3, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 3, s = o.s ?? 1, yew = '#2f5a38', box = '#4d7d43';
      let base = 0;
      if (v < 2) {
        const P = 0.72, PH = 0.62;
        B.box('paint', K.white, P, PH, P, 0, PH / 2, 0, { r: 0.03 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { B.box('paint', K.white, 0.1, PH + 0.12, 0.1, sx * P / 2, (PH + 0.12) / 2, sz * P / 2, { r: 0.02 }); B.sph('paint', K.white, 0.06, sx * P / 2, PH + 0.18, sz * P / 2, { ws: 6, hs: 4 }); }
        for (const [ry, sz] of [[0, 1], [PI, -1], [HP, 1], [-HP, 1]]) { B.push(0, 0, 0, ry); for (let k = -1; k <= 1; k++) pbox(B, NS('paint'), shade(K.white, 0.9), 0.025, PH - 0.14, 0.01, k * 0.18, PH / 2, P / 2 + 0.005); B.pop(); }
        pbox(B, 'paint', '#4a3a2c', P - 0.08, 0.02, P - 0.08, 0, PH - 0.02, 0);
        base = PH;
      }
      if (v === 0) {
        B.lathe('foliage', yew, [[0, 0], [0.5 * s, 0.05], [0.46 * s, 0.4 * s], [0.3 * s, 1.0 * s], [0.12 * s, 1.4 * s], [0, 1.55 * s]], 0, base, 0, { seg: 12 });
        B.add('foliage', G_blob(0.2, 1, 4), shade(yew, 1.15), 0, base + 1.55 * s, 0, { s: 0.6 });
        COL(B, -0.38, 0, -0.38, 0.38, base + 1.3 * s, 0.38);
      } else if (v === 1) {
        B.cyl('wood', '#6b5540', 0.045, 0.7 * s, 0, base + 0.35 * s, 0, { seg: 6 });
        B.add('foliage', G_blob(0.52 * s, 1, 7), box, 0, base + 0.7 * s + 0.45 * s, 0, {});
        COL(B, -0.38, 0, -0.38, 0.38, base + 0.3, 0.38);
        COL(B, -0.42 * s, base + 0.72 * s, -0.42 * s, 0.42 * s, base + 1.5 * s, 0.42 * s);
      } else {
        B.cyl('wood', '#6b5540', 0.07, 1.9 * s, 0, 0.95 * s, 0, { seg: 6 });
        for (const [y, r] of [[0.35, 0.62], [1.05, 0.46], [1.65, 0.3]]) B.lathe('foliage', yew, [[0, y * s - 0.2], [r * s, y * s - 0.15], [r * s, y * s + 0.12], [0, y * s + 0.2]], 0, 0, 0, { seg: 12 });
        B.add('foliage', G_blob(0.16, 1, 5), yew, 0, 2.0 * s, 0, {});
        COL(B, -0.5 * s, 0, -0.5 * s, 0.5 * s, 1.35 * s, 0.5 * s);
      }
      B.blob(1.2, 1.2);
    },
  };

  // ---- tub palm: a white Versailles tub with a Chusan fan palm (shaggy trunk, fans of pleated leaves)
  D.tidewater_palmtub = {
    desc: 'Chusan fan palm in a white Versailles tub (0.9 m tub, 2.6 m palm): hooped planks, finials, a shaggy trunk and a crown of pleated fan leaves on long stalks. Tub collides (cover).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const P = 0.9, PH = 0.82;
      B.box('paint', K.white, P, PH, P, 0, PH / 2, 0, { r: 0.03 });
      for (const y of [0.18, PH - 0.16]) pbox(B, NS('metal'), K.ironDk, P + 0.02, 0.05, P + 0.02, 0, y, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { B.box('paint', K.white, 0.12, PH + 0.16, 0.12, sx * P / 2, (PH + 0.16) / 2, sz * P / 2, { r: 0.02 }); B.sph('paint', K.gold, 0.06, sx * P / 2, PH + 0.22, sz * P / 2, { ws: 6, hs: 4 }); }
      pbox(B, 'paint', '#4a3a2c', P - 0.1, 0.02, P - 0.1, 0, PH - 0.02, 0);
      B.tube('wood', '#6d5a45', [P3(0, PH, 0), P3(0.04, PH + 0.9, 0.02), P3(0.02, PH + 1.7, -0.02)], (t) => 0.13 - 0.03 * t, { radial: 7 });
      // the crown: fans of pleated leaflets on short stalks, the young ones held up, the old ones drooping
      for (let k = 0; k < 13; k++) {
        const a = (k / 13) * TAU * 1.0 + (k % 2) * 0.2, up = k < 4 ? 0.9 : k < 9 ? 0.35 : -0.25, top = PH + 1.72, L = 0.42;
        const sx = Math.cos(a) * Math.cos(up), sy = Math.sin(up), sz = Math.sin(a) * Math.cos(up);
        const hx = sx * L, hy = top + sy * L, hz = sz * L;
        B.tube(NS('wood'), '#7d8a4a', [P3(0, top, 0), P3(hx, hy, hz)], 0.014, { radial: 3 });
        B.push(hx, hy, hz, -a + HP, -up);
        for (let f = -5; f <= 5; f++) { B.push(0, 0, 0, f * 0.15, 0.04 * Math.abs(f), 0); pbox(B, 'foliage', f % 2 ? K.leaf : K.leafLt, 0.09, 0.012, 0.55, 0, 0, 0.27); B.pop(); }
        B.pop();
      }
      COL(B, -P / 2, 0, -P / 2, P / 2, PH + 0.2, P / 2);
      B.blob(1.3, 1.3);
    },
  };

  // ---- the drinking fountain: a Victorian cast-iron canopy on four columns over a pedestal with lion-mask spouts and
  //      basins, chained cups, a scalloped ogee canopy with a crown; the pedestal collides (cover)
  D.tidewater_drinkfountain = {
    desc: 'Cast-iron drinking fountain (3.9 m): octagonal granite step, a pedestal with four basins + lion-mask spouts + chained cups, four twisted columns carrying a pierced ogee canopy with a crest and a gilt crown finial, a bronze plaque. Pedestal + columns collide.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const c = K.iron, R = 1.1, TOP = 2.9;
      B.lathe('paint', K.granite, [[0, 0], [1.35, 0], [1.35, 0.14], [1.2, 0.18], [0, 0.18]], 0, 0, 0, { seg: 8, ry: PI / 8 });
      B.lathe('gloss', c, [[0, 0.18], [0.5, 0.18], [0.5, 0.3], [0.36, 0.4], [0.3, 0.9], [0.4, 1.0], [0.4, 1.1], [0.2, 1.3], [0.16, 1.9], [0.24, 2.0], [0, 2.02]], 0, 0, 0, { seg: 8 });
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU;
        B.push(Math.cos(a) * 0.42, 0.9, Math.sin(a) * 0.42, -a + HP);
        B.lathe('gloss', c, [[0, 0], [0.22, 0.02], [0.25, 0.14], [0, 0.14]], 0, 0, 0.12, { seg: 10 });
        pbox(B, NS('paint'), K.water, 0.36, 0.01, 0.2, 0, 0.13, 0.14);
        B.sph('metal', K.gold, 0.07, 0, 0.42, -0.02, { ws: 8, hs: 6 });
        B.cyl('metal', K.gold, 0.012, 0.12, 0, 0.36, 0.05, { rx: HP, seg: 4 });
        B.tube(NS('metal'), K.ironDk, [P3(0.14, 0.3, 0.02), P3(0.18, 0.05, 0.1), P3(0.2, -0.05, 0.16)], 0.006, { radial: 3 });
        B.cyl('metal', K.lead, 0.04, 0.09, 0.2, -0.1, 0.16, { seg: 6 });
        B.pop();
      }
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + PI / 4, x = Math.cos(a) * R, z = Math.sin(a) * R, pts = [];
        for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(P3(x + Math.cos(t * 9) * 0.03, 0.18 + t * (TOP - 0.18), z + Math.sin(t * 9) * 0.03)); }
        B.tube('gloss', c, pts, 0.045, { radial: 5 });
        B.lathe('gloss', c, [[0, 0], [0.09, 0], [0.09, 0.14], [0.05, 0.2], [0, 0.2]], x, 0.18, z, { seg: 6 });
        B.lathe('gloss', c, [[0.05, 0], [0.12, 0.1], [0.12, 0.16], [0, 0.16]], x, TOP - 0.12, z, { seg: 6 });
        COL(B, x - 0.08, 0, z - 0.08, x + 0.08, TOP, z + 0.08, { roof: true });
      }
      B.lathe('gloss', c, [[R * 1.35, 0], [R * 1.35, 0.14], [R * 1.1, 0.3], [R * 0.7, 0.62], [R * 0.4, 0.95], [R * 0.3, 1.1], [0, 1.12]], 0, TOP, 0, { seg: 16 });
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; B.tor(NS('gloss'), c, 0.1, 0.012, Math.cos(a) * R * 1.35, TOP - 0.05, Math.sin(a) * R * 1.35, { ry: -a, rs: 3, ts: 8, arc: PI, rz: PI }); }
      B.lathe('metal', K.gold, [[0, 0], [0.14, 0], [0.18, 0.1], [0.1, 0.2], [0.14, 0.3], [0, 0.42]], 0, TOP + 1.1, 0, { seg: 8 });
      pbox(B, 'metal', K.bronze, 0.3, 0.2, 0.02, 0, 1.55, 0.2, { rx: -0.1 });
      COL(B, -0.5, 0, -0.5, 0.5, 2.0, 0.5, { roof: true });
      COL(B, -R * 1.35, TOP, -R * 1.35, R * 1.35, TOP + 1.5, R * 1.35, { roof: true });
      B.blob(2.6, 2.6);
    },
  };

  // ---- the coxswain's statue: a bronze lifeboatman in oilskins and sou'wester holding up a storm lantern, on a
  //      granite pedestal with a plaque and a wreath (pedestal collides, off limits)
  D.tidewater_statue = {
    desc: 'Statue of Coxswain Hartley (2.0 m bronze figure: oilskin coat, sou\'wester, sea boots, a raised storm lantern, a coil of rope at his feet) on a 1.6 m granite pedestal with a bronze plaque and a laurel wreath. Pedestal collides (off limits).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const bz = '#5d6a5a', bzDk = '#46503f', PY = 1.6;
      B.box('paint', K.granite, 1.5, 0.3, 1.5, 0, 0.15, 0, { r: 0.03 });
      B.box('paint', K.granite, 1.2, PY - 0.5, 1.2, 0, 0.3 + (PY - 0.5) / 2, 0, { r: 0.03 });
      B.box('paint', K.granite, 1.35, 0.2, 1.35, 0, PY - 0.1, 0, { r: 0.03 });
      pbox(B, 'metal', K.bronze, 0.7, 0.45, 0.02, 0, 0.95, 0.605);
      letters(B, 'HARTLEY', { h: 0.08, x: 0, y: 1.02, z: 0.618, c: '#f0d9a0', flat: true, wt: 0.22, track: 0.1, mat: 'metal' });
      letters(B, 'COXSWAIN 1861-1904', { h: 0.045, x: 0, y: 0.88, z: 0.618, c: '#f0d9a0', flat: true, wt: 0.24, track: 0.08, mat: 'metal' });
      B.tor('foliage', K.leafDk, 0.22, 0.05, 0, 0.7, 0.64, { rs: 5, ts: 14 });
      // the figure (faces +Z): boots, coat (a flared lathe), arms, head + sou'wester, lantern held up in the right hand
      const y = PY;
      for (const sx of [-0.14, 0.14]) B.lathe('metal', bzDk, [[0, 0], [0.11, 0], [0.1, 0.45], [0, 0.46]], sx, y, 0, { seg: 8 });
      B.lathe('metal', bz, [[0, 0.35], [0.36, 0.38], [0.3, 0.8], [0.26, 1.25], [0.2, 1.42], [0, 1.44]], 0, y, 0, { seg: 10 });
      B.sph('metal', bz, 0.14, 0, y + 1.6, 0.02, { ws: 10, hs: 8 });
      B.lathe('metal', bzDk, [[0, 0], [0.3, 0.02], [0.26, 0.06], [0.14, 0.1], [0.12, 0.22], [0, 0.24]], 0, y + 1.62, 0, { seg: 12, rx: -0.12 });
      B.tube('metal', bz, [P3(-0.24, y + 1.3, 0), P3(-0.3, y + 0.95, 0.1), P3(-0.22, y + 0.75, 0.2)], 0.07, { radial: 6 });
      B.tube('metal', bz, [P3(0.24, y + 1.3, 0), P3(0.38, y + 1.55, 0.12), P3(0.32, y + 1.95, 0.2)], 0.07, { radial: 6 });
      B.lathe('metal', bzDk, [[0, 0], [0.09, 0], [0.1, 0.2], [0.06, 0.28], [0, 0.3]], 0.32, y + 1.72, 0.22, { seg: 8 });
      B.tor('metal', bzDk, 0.18, 0.04, -0.1, y + 0.08, 0.3, { rx: HP, rs: 4, ts: 12 });
      COL(B, -0.62, 0, -0.62, 0.62, PY + 1.9, 0.62, { roof: true });
      B.blob(1.8, 1.8);
    },
  };

  // ---- carpet bed dressing on a stone-kerbed garden bed (pos = bed centre at its top): massed bedding in bands and
  //      a scroll, box edging along the kerb, standard roses at the corners (no collider; the topiary set on it is)
  D.tidewater_carpetbed = {
    desc: 'Carpet bedding on a kerbed bed top (pos = bed centre at the top, w × d): box edging inside the kerb, bands of bedding (coral, cream, violet, gold), a sinuous scroll of dark foliage, standard roses at the corners, a little enamel CARPET BED 1887 plate. Non-colliding.',
    params: { w: 'm', d: 'm', seed: 'n' }, variants: 1, mount: 'ground',
    build(B, o) {
      const w = o.w ?? 6, d = o.d ?? 4, sd = o.seed ?? 3;
      for (const s of [-1, 1]) { B.box('foliage', K.leafDk, w - 0.6, 0.22, 0.24, 0, 0.11, s * (d / 2 - 0.4), { r: 0.08 }); B.box('foliage', K.leafDk, 0.24, 0.22, d - 0.6, s * (w / 2 - 0.4), 0.11, 0, { r: 0.08 }); }
      flowerBed(B, w - 1.1, d - 1.1, 0.0, 11 + sd, ['#e3715e', '#f3ecd8', '#9a6ac2', '#e7d24a', '#e3715e', '#f3ecd8']);
      const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(P3((t - 0.5) * (w - 1.4), 0.08, Math.sin(t * TAU * 1.5 + sd) * (d / 2 - 0.9))); }
      B.tube('foliage', '#5a2f45', pts, 0.12, { radial: 5 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * (w / 2 - 0.45), z = sz * (d / 2 - 0.45);
        B.cyl('wood', '#6b5540', 0.03, 1.0, x, 0.5, z, { seg: 5 });
        B.add('foliage', G_blob(0.26, 1, 6), K.leaf, x, 1.1, z, {});
        for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; B.sph(NS('paint'), sx * sz > 0 ? '#e25577' : '#f3ecd8', 0.05, x + Math.cos(a) * 0.2, 1.15 + (k % 2) * 0.06, z + Math.sin(a) * 0.2, { ws: 5, hs: 3 }); }
      }
    },
  };

  // ---- seat shelter: a lean-to seaside shelter with its back to the garden (glazed screen over a stucco wall) and a
  //      long bench facing the sea under a slate lean-to roof on iron brackets; wall + roof collide
  D.tidewater_seatshelter = {
    desc: 'Lean-to promenade seat shelter (L long along X, faces +Z): a 1.15 m stucco back wall with a white-framed glazed screen over it, end screens, a long slatted bench, iron brackets carrying a slate lean-to roof with a coral fretwork fascia and finials. Wall + roof collide (roof off limits).',
    params: { length: 'm (4.2)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 4.2, WH = 1.15, TOP = 2.6, D = 1.7;
      B.box('paint', K.mint, L, WH, 0.3, 0, WH / 2, -D / 2 + 0.15, { r: 0.03 });
      pbox(B, 'paint', K.trim, L + 0.06, 0.08, 0.38, 0, WH + 0.04, -D / 2 + 0.15);
      pbox(B, NS('gloss'), '#9fc6cf', L - 0.1, TOP - WH - 0.1, 0.03, 0, (WH + TOP) / 2, -D / 2 + 0.15);
      for (let i = 0; i <= 5; i++) pbox(B, 'paint', K.white, 0.07, TOP - WH, 0.08, -L / 2 + 0.05 + (i * (L - 0.1)) / 5, (WH + TOP) / 2, -D / 2 + 0.15);
      for (const sx of [-1, 1]) {
        B.box('paint', K.mint, 0.3, WH, D - 0.3, sx * (L / 2 - 0.15), WH / 2, 0, { r: 0.03 });
        pbox(B, NS('gloss'), '#9fc6cf', 0.03, TOP - WH - 0.1, D - 0.4, sx * (L / 2 - 0.15), (WH + TOP) / 2, 0);
        B.lathe('gloss', K.iron, [[0, 0], [0.08, 0], [0.08, 0.1], [0.05, 0.16], [0.04, TOP - 0.2], [0.08, TOP], [0, TOP]], sx * (L / 2 - 0.15), 0, D / 2 - 0.15, { seg: 8 });
        COL(B, sx * (L / 2 - 0.15) - 0.1, 0, D / 2 - 0.25, sx * (L / 2 - 0.15) + 0.1, TOP, D / 2 - 0.05, { roof: true });
      }
      for (let i = 0; i < 3; i++) B.box('wood', shade(K.woodLt, 0.95 + i * 0.04), L - 0.8, 0.035, 0.09, 0, 0.46, -D / 2 + 0.55 + i * 0.1, { r: 0.01 });
      for (let i = 0; i < 2; i++) B.box('wood', K.woodLt, L - 0.8, 0.09, 0.035, 0, 0.62 + i * 0.16, -D / 2 + 0.36, { r: 0.01 });
      // lean-to roof: slate slab falling toward the sea, fascia + fretwork, finials
      B.push(0, TOP + 0.35, 0, 0, -0.22); B.box('paint', K.slate, L + 0.5, 0.12, D + 0.5, 0, 0, 0, { r: 0.03 }); B.pop();
      pbox(B, 'paint', K.trim, L + 0.5, 0.18, 0.06, 0, TOP + 0.06, D / 2 + 0.26);
      for (let x = -L / 2 - 0.2; x <= L / 2 + 0.21; x += 0.2) pbox(B, NS('paint'), K.coral, 0.12, 0.16, 0.025, x, TOP - 0.06, D / 2 + 0.3);
      for (const sx of [-1, 1]) B.sph('metal', K.gold, 0.07, sx * (L / 2 + 0.2), TOP + 0.62, -D / 2 - 0.1, { ws: 6, hs: 4 });
      COL(B, -L / 2, 0, -D / 2, L / 2, WH, -D / 2 + 0.3);
      COL(B, -L / 2 - 0.25, TOP - 0.1, -D / 2 - 0.25, L / 2 + 0.25, TOP + 0.8, D / 2 + 0.3, { roof: true });
      COL(B, -L / 2 + 0.4, 0, -D / 2 + 0.3, L / 2 - 0.4, 0.5, -D / 2 + 0.8);
      B.blob(L + 0.6, D + 0.6);
    },
  };

  for (const k of Object.keys(D)) if (k.startsWith('tidewater_')) def(D[k]);
}

// ------------------------------------------------------------------------------------------ placements
// Alpha's half (mirrored automatically unless mirror:false). Curve-following dressing is generated from the layout's
// geometry (PROM crescent, TERR ring, COLO sections) so railings, lamps and benches sit exactly on the curves.
const D2R = Math.PI / 180, HPI = Math.PI / 2;
const polar = (c, r, a) => [c[0] + r * Math.cos(a * D2R), c[1] + r * Math.sin(a * D2R)];
const runRot = (p, q) => Math.atan2(-(q[1] - p[1]), q[0] - p[0]);          // rotY so local +X runs from p to q
const faceRot = (dx, dz) => Math.atan2(dx, dz);                              // rotY so local +Z faces (dx, dz)
const dist = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const SECT = chainSections(COLO.front, -COLO.deck);
const onSec = (i, x, z) => { const s = SECT[i]; return [s.q0[0] + s.d[0] * z + s.n[0] * x, s.q0[1] + s.d[1] * z + s.n[1] * x]; };
const out = [];
// ---- the promenade crescent: sea railing chords, lamps with baskets, bunting, benches + deckchairs facing the bay
{
  const c = PROM.c, rR = PROM.rOut - 0.16, a0 = 181.9, a1 = PROM.a1, n = 13, da = (a1 - a0) / n;
  for (let i = 0; i < n; i++) {
    const p = polar(c, rR, a0 + i * da), q = polar(c, rR, a0 + (i + 1) * da);
    out.push({ type: 'tidewater_searail', pos: [p[0], 0, p[1]], rotY: runRot(p, q), length: dist(p, q), col: false, p1: i === n - 1 });
  }
  const tip = polar(c, rR, a1), hall = [-9.55, tq(-38.28)];
  out.push({ type: 'tidewater_searail', pos: [tip[0], 0, tip[1]], rotY: runRot(tip, hall), length: dist(tip, hall), col: false, p0: false });
  const lamps = [186, 198, 210, 222].map((a) => polar(c, PROM.rOut - 0.65, a));
  lamps.forEach((p, k) => {
    const a = [186, 198, 210, 222][k] * D2R;
    out.push({ type: 'tidewater_lamp', pos: [p[0], 0, p[1]], variant: 1, rotY: Math.atan2(-Math.cos(a), -Math.sin(a)), baskets: true });
    if (k < lamps.length - 1) out.push({ type: 'bunting', pos: [p[0], 0, p[1]], rotY: runRot(p, lamps[k + 1]), length: dist(p, lamps[k + 1]), height: 3.55, posts: false });
  });
  for (const a of [192, 204, 216]) { const p = polar(c, PROM.rOut - 1.3, a); out.push({ type: 'tidewater_bench', pos: [p[0], 0, p[1]], rotY: faceRot(Math.cos(a * D2R), Math.sin(a * D2R)), segCol: 3 }); }
  for (const a of [195.5, 213]) { const p = polar(c, PROM.rOut - 0.72, a); out.push({ type: 'tidewater_telescope', pos: [p[0], 0, p[1]], rotY: faceRot(Math.cos(a * D2R), Math.sin(a * D2R)) }); }
  for (const a of [189, 226]) { const p = polar(c, PROM.rOut - 0.45, a); out.push({ type: 'lifering', pos: [p[0], 0, p[1]], rotY: faceRot(-Math.cos(a * D2R), -Math.sin(a * D2R)) }); }
  { const a = 183.6, p = polar(c, PROM.rOut - 0.25, a); out.push({ type: 'tidewater_tidegauge', pos: [p[0], 0, p[1]], rotY: faceRot(-Math.cos(a * D2R), -Math.sin(a * D2R)) }); }
  for (const a of [201, 219]) { const p = polar(c, PROM.rOut - 0.8, a); out.push({ type: 'trashbin', pos: [p[0], 0, p[1]], color: '#2f5d55' }); }
  { const a = 207, p = polar(c, PROM.rOut - 2.6, a); out.push({ type: 'deckchair', pos: [p[0], 0, p[1]], rotY: faceRot(Math.cos(a * D2R), Math.sin(a * D2R)) + 0.2, variant: 1 }); }
  // gulls on the railing top and a lamp arm
  { const p = polar(c, rR, 203.4); out.push({ type: 'tidewater_gull', pos: [p[0], 1.07, p[1]], rotY: 2.0 }); }
  { const a = 210, p = polar(c, PROM.rOut - 0.65, a), t = [-Math.sin(a * D2R), Math.cos(a * D2R)]; out.push({ type: 'tidewater_gull', pos: [p[0] + t[0] * 0.45, 3.8, p[1] + t[1] * 0.45], rotY: 0.6 }); }
}
// ---- the round terrace (single, mirror:false): balustrade chords round the ring, open at the four flights
{
  const skip = new Set([7, 8, 9, 16, 17, 18, 25, 26, 27, 34, 35, 0]), r = TERR.rOut - 0.22;
  for (let i = 0; i < TERR.n; i++) {
    if (skip.has(i)) continue;
    const p = polar([0, 0], r, TERR.a0 + i * 10), q = polar([0, 0], r, TERR.a0 + (i + 1) * 10);
    out.push({ type: 'tidewater_balustrade', pos: [p[0], TERR.top, p[1]], rotY: runRot(p, q), length: dist(p, q), col: false, bay: 3, p0: skip.has((i + 35) % 36), urns: i % 3 === 1 ? 1 : 0, mirror: false });
  }
  const g = polar([0, 0], r * Math.cos(5 * D2R), 220);
  out.push({ type: 'tidewater_gull', pos: [g[0], TERR.top + 0.95, g[1]], rotY: -0.9, variant: 1, mirror: false });
}
// ---- the Crescent's terrace walk: café tables, benches against the frontage, a viewer at the open end
{
  const tbl = [[0, 2.6, 0.5], [1, 2.6, 0.3], [1, 2.6, 0.72], [2, 2.6, 0.16], [2, 2.6, 0.84], [3, 2.7, 0.62]];
  tbl.forEach(([i, x, t], k) => { const p = onSec(i, x, SECT[i].len * t); out.push({ type: 'tidewater_cafe', pos: [p[0], COLO.deckTop, p[1]], variant: k % 2 }); });
  for (const [i, t] of [[0, 0.22], [1, 0.5], [2, 0.3], [2, 0.7], [3, 0.3]]) { const s = SECT[i], p = onSec(i, COLO.deck - 0.35, s.len * t); out.push({ type: 'tidewater_bench', pos: [p[0], COLO.deckTop, p[1]], rotY: faceRot(-s.n[0], -s.n[1]), segCol: 3 }); }
  { const p = onSec(3, 1.2, SECT[3].len - 0.9); out.push({ type: 'tidewater_telescope', pos: [p[0], COLO.deckTop, p[1]], rotY: 0.2 }); }
  // (the Assembly Rooms' stretch: planted urns either side of their landing's opening)
  for (const z of [STAIR_AR.top - 0.5, STAIR_AR.landing + 0.5]) out.push({ type: 'tidewater_urn', pos: [COLO.front[3][0] - COLO.deck + 0.55, COLO.deckTop, z], color: '#9a6ac2' });
  { const s = SECT[1], p = onSec(1, 0.08, s.len * 0.4); out.push({ type: 'tidewater_gull', pos: [p[0], COLO.deckTop + 1.03, p[1]], rotY: 1.9, variant: 1 }); }
}
const SQL = (x, z, o) => ({ pos: [x, SQ, z], ...o });
// ---- the Winter Gardens (layout.js GARDEN; the Long Stages stretch). Tower Command runs its track through the garden
//      (tower-data.js: the north walk z -18, the esplanade x -23.3 and back, along the terrace z -24.3, a jog up the east
//      walk x 13.2 / 16.0, the south walk z -33.7): the cover standing on it is Turf War / Zone Control only (notIn 'tower').
{
  const G = GARDEN, T = G.terrace, pz = (G.palm[2] + G.palm[3]) / 2, NT = { notIn: 'tower' }, FW = G.flights[1][3];
  const FX = G.flights[1][0] - FW / 2;   // the flights' inner edge |x|
  out.push({ type: 'tidewater_palmhouse', pos: [0, SQ, pz], rotY: 0, w: G.palm[1] - G.palm[0], d: G.palm[3] - G.palm[2], plinth: G.plinth - SQ, glass: G.glass - SQ,
    td: T[3] - T[2], tt: G.top - SQ, fx: FX });
  // the terrace's two flights: stone balustrades down both sides
  for (const [x, zt, zf, w] of G.flights) {
    out.push({ type: 'tidewater_rampbal', pos: [x - w / 2 - 0.12, SQ, zt], rotY: -P / 2, length: zf - zt, ya: G.top - SQ, yb: 0, skirtZ: 0.11 });
    out.push({ type: 'tidewater_rampbal', pos: [x + w / 2 + 0.12, SQ, zf], rotY: P / 2, length: zf - zt, ya: 0, yb: G.top - SQ, skirtZ: 0.11 });
  }
  // the beds: carpet bedding, tiered yews at their corners (the cover), a cone at the terrace's bed's centre
  G.beds.forEach((b, i) => {
    const cx = (b[0] + b[1]) / 2, cz = (b[2] + b[3]) / 2, w = b[1] - b[0], d = b[3] - b[2];
    out.push({ type: 'tidewater_carpetbed', pos: [cx, G.bedTop, cz], w, d, seed: i * 3 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.push({ type: 'tidewater_topiary', pos: [cx + sx * (w / 2 - 0.75), G.bedTop, cz + sz * (d / 2 - 0.75)], variant: 2, s: i === 0 ? 0.85 : 1.05 });
    if (i === 0) out.push({ type: 'tidewater_topiary', pos: [cx, G.bedTop, cz], variant: 1, s: 1.0 });
  });
  // the terrace: tub palms at its front corners behind the flights' heads, a bench either side of the doors (Turf War /
  // Zone Control: the track runs along the terrace in Tower Command)
  for (const sx of [-1, 1]) {
    out.push({ type: 'tidewater_palmtub', pos: [sx * (T[1] - 0.7), G.top, T[2] + 0.75], ...NT });
    out.push({ type: 'tidewater_bench', pos: [sx * 2.2, G.top, T[2] + 0.5], rotY: 0, ...NT });
  }
  // tub palms at the side beds' inner corners, beside the walks along the Palm House
  for (const sx of [-1, 1]) out.push({ type: 'tidewater_palmtub', pos: [sx * 10.1, SQ, -34.2], ...(sx > 0 ? NT : {}) });
  // the west walk: the drinking fountain, lamps, a bench; the coxswain's statue at the south walk's west end
  out.push({ type: 'tidewater_drinkfountain', ...SQL(-13.2, -21.2) });
  out.push({ type: 'tidewater_statue', ...SQL(-12.4, -35.0), rotY: P * 0.15 });
  out.push({ type: 'tidewater_lamp', ...SQL(-9.4, -26.8), variant: 0, baskets: true });
  out.push({ type: 'tidewater_lamp', ...SQL(-18.1, -20.6), variant: 0 });
  out.push({ type: 'tidewater_bench', ...SQL(-16.9, -31.4), rotY: P / 2 });
  // the north walk (from the mid square into the garden): clipped cones in planters (the west ones stand on the track's
  // leg in Tower Command), a lollipop pair either side of the terrace's bed
  for (const x of [-14.3, -8.4]) out.push({ type: 'tidewater_topiary', ...SQL(x, -18.4), variant: 0, ...NT });
  for (const x of [8.0, 12.6]) out.push({ type: 'tidewater_topiary', ...SQL(x, -18.4), variant: 0 });
  // the east walk: a fingerpost, a lamp, cones along the Assembly Rooms' colonnade (on the track's east leg: not in
  // Tower Command), a bench facing the Palm House
  out.push({ type: 'tidewater_fingerpost', ...SQL(18.5, -24.6), arms: [['PALM HOUSE', -90], ['ASSEMBLY ROOMS', 10], ['PROMENADE', 180], ['TOWN HALL', -120]] });
  out.push({ type: 'tidewater_lamp', ...SQL(18.6, -20.8), variant: 0 });
  out.push({ type: 'tidewater_urn', ...SQL(16.9, STAIR_AR.foot - 1.1), color: '#9a6ac2' });   // (by the Assembly Rooms' stair foot)
  for (const z of [-26.2, -32.4]) out.push({ type: 'tidewater_topiary', ...SQL(16.0, z), variant: 1, ...NT });
  out.push({ type: 'tidewater_bench', ...SQL(15.9, -30.0), rotY: -P / 2, ...NT });
  out.push({ type: 'tidewater_lamp', ...SQL(9.4, -26.8), variant: 0, baskets: true });
  // the south walk: a bench pair facing the bandstand, lamps, cones
  out.push({ type: 'tidewater_bench', ...SQL(-4.8, -34.9), rotY: P, ...NT });
  out.push({ type: 'tidewater_bench', ...SQL(4.8, -34.9), rotY: P, ...NT });
  out.push({ type: 'tidewater_lamp', ...SQL(-6.9, -33.0), variant: 0 });
  out.push({ type: 'tidewater_lamp', ...SQL(6.9, -33.0), variant: 0, ...NT });
  out.push({ type: 'tidewater_topiary', ...SQL(-8.4, -35.6), variant: 0 });
  out.push({ type: 'tidewater_topiary', ...SQL(10.8, -34.6), variant: 0, ...NT });
  // Tower Command cover in the garden (off the track): inflatables by the walks
  out.push({ type: 'inflatable', size: 'small', ...SQL(-8.6, -20.6), onlyIn: 'tower' });
  out.push({ type: 'inflatable', size: 'small', ...SQL(6.2, -36.1), onlyIn: 'tower' });
}
// ---- the esplanade (layout ESPL: the promenade's straight run from the pier forecourt to the crescent): its sea railing,
//      basket lamps with bunting, benches + a telescope facing the bay, a lifebuoy, a bin, the seat shelter backing onto
//      the Winter Gardens (the track's leg runs down its middle in Tower Command: all of this stands clear of it)
{
  const xs = ESPL.x[0] + 0.16, z0 = PROM.c[1] - 1.52;
  out.push({ type: 'tidewater_searail', pos: [xs, 0, z0], rotY: -P / 2, length: -5.5 - z0, col: false, p1: false });
  const lz = [-8.6, -16.0], lx = ESPL.x[0] + 0.65;   // (the crescent's first lamp stands at -27.9)
  lz.forEach((z, k) => {
    out.push({ type: 'tidewater_lamp', pos: [lx, 0, z], variant: 1, rotY: HPI, baskets: true });
    if (k < lz.length - 1) out.push({ type: 'bunting', pos: [lx, 0, z], rotY: P / 2, length: z - lz[k + 1], height: 3.55, posts: false });
  });
  for (const z of [-13.2, -22.0]) out.push({ type: 'tidewater_bench', pos: [ESPL.x[0] + 1.3, 0, z], rotY: -P / 2, segCol: 3 });
  out.push({ type: 'tidewater_telescope', pos: [ESPL.x[0] + 0.72, 0, -19.8], rotY: -P / 2 });
  out.push({ type: 'lifering', pos: [ESPL.x[0] + 0.45, 0, -11.0], rotY: P / 2 });
  out.push({ type: 'trashbin', pos: [ESPL.x[0] + 0.8, 0, -18.0], color: '#2f5d55' });
  out.push({ type: 'tidewater_seatshelter', pos: [ESPL.x[1] - 0.95, 0, -23.0], rotY: -P / 2, length: 4.2 });
  out.push({ type: 'deckchair', pos: [ESPL.x[0] + 2.4, 0, -25.4], rotY: -P / 2 + 0.2, variant: 1, notIn: 'tower' });
  out.push({ type: 'tidewater_gull', pos: [xs, 1.07, -14.1], rotY: -1.2 });
}
// Tower Command's bandstand steps: foot → top (z, Alpha's half)
const BSTEP = [TW.band.stepFoot, TW.band.z + 3.8 * Math.cos(Math.PI / 8)];
export const PLACEMENTS = [
  // ---- the clock tower (single, self-symmetric) on its dais
  { type: 'tidewater_clocktower', pos: [0, TERR.daisTop, 0], rotY: 0, top: 12.5 - TERR.daisTop, mirror: false, notIn: 'tower' },
  { type: 'tidewater_clocktower', pos: [0, TERR.daisTop, 0], rotY: 0, top: 12.5 - TERR.daisTop, open: true, mirror: false, onlyIn: 'tower' },
  // ---- Town Hall (Alpha's end) + Custom House (Bravo's end): same massing, own names; their ground storeys
  { type: 'tidewater_townhall', pos: [0, 0, tq(-45.4)], rotY: 0, variant: 0, mirror: false },
  { type: 'tidewater_townhall', pos: [0, 0, -tq(-45.4)], rotY: P, variant: 1, mirror: false },
  { type: 'tidewater_townhallbase', pos: [0, SQ, -TD], rotY: 0, variant: 0, mirror: false },   // (built in the first build's coordinates: moved out whole)
  { type: 'tidewater_townhallbase', pos: [0, SQ, TD], rotY: P, variant: 1, mirror: false },
  // ---- the Crescent (colonnade + frontage follow the layout's sections)
  { type: 'tidewater_colonnade', pos: [0, 0, 0], notIn: 'tower' },
  { type: 'tidewater_colonnade', pos: [0, 0, 0], rev: true, onlyIn: 'tower' },
  { type: 'tidewater_arcadefront', pos: [0, 0, 0] },
  // ---- the lifeboat station out on its jetty off the promenade's tip, the two piers (named apart: mirror:false)
  { type: 'tidewater_lifeboat', pos: [-19.6, 0, tq(-41.2)], rotY: P / 4 },
  { type: 'tidewater_pier', pos: [-27, 0, 0], rotY: 0, variant: 0, mirror: false },
  { type: 'tidewater_pier', pos: [27, 0, 0], rotY: P, variant: 1, mirror: false },
  // ---- spawn loggia: balcony balustrade (open in the middle: the front drop), over the flights, the wing, the sea side
  { type: 'tidewater_balustrade', pos: [-4.65, 2.4, tq(-36.2)], length: 2.45, lamp1: true },
  { type: 'tidewater_balustrade', pos: [2.2, 2.4, tq(-36.2)], length: 2.45, lamp0: true },
  { type: 'tidewater_balustrade', pos: [-9.35, 2.4, tq(-38.58)], length: 4.5, urns: 1 },
  { type: 'tidewater_balustrade', pos: [4.85, 2.4, tq(-38.58)], length: 4.5, urns: 1 },
  { type: 'tidewater_balustrade', pos: [9.68, 2.4, tq(-41.62)], length: 4.42, p0: false, urns: 1 },
  { type: 'tidewater_balustrade', pos: [9.68, 2.4, tq(-41.5)], rotY: -P / 2, length: 3.0, p0: false },
  { type: 'tidewater_balustrade', pos: [-9.33, 2.4, tq(-45.25)], rotY: -P / 2, length: 6.85, col: false, urns: 2 },
  // ---- stair balustrades + skirts: the spawn flights, the terrace flights, the bandstand steps, the Crescent's stairs
  { type: 'tidewater_rampbal', pos: [-10.8, SQ, tq(-35.9)], rotY: 0, length: 6, ya: 0, yb: 2.6, skirtZ: 0.09 },
  { type: 'tidewater_rampbal', pos: [4.8, SQ, tq(-35.9)], rotY: 0, length: 6, ya: 2.6, yb: 0, skirtZ: 0.09 },
  { type: 'tidewater_rampbal', pos: [-2.12, SQ, -12.4], rotY: -P / 2, length: 4.4, ya: 0, yb: 1.2, skirtZ: 0.11, notIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [2.12, SQ, -8.0], rotY: P / 2, length: 4.4, ya: 1.2, yb: 0, skirtZ: 0.11, notIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [-8.0, SQ, -2.12], rotY: P, length: 4.4, ya: 1.2, yb: 0, skirtZ: 0.11, notIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [-12.4, SQ, 2.12], rotY: 0, length: 4.4, ya: 0, yb: 1.2, skirtZ: 0.11, notIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [-1.2, SQ, tq(-27.2)], rotY: -P / 2, length: 2.69, ya: 0, yb: 1.0, rail: false, skirtZ: 0.025, notIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [1.2, SQ, tq(-24.51)], rotY: P / 2, length: 2.69, ya: 1.0, yb: 0, rail: false, skirtZ: 0.025, notIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [-1.2, SQ, tq(-17.49)], rotY: -P / 2, length: 2.69, ya: 1.0, yb: 0, rail: false, skirtZ: 0.025, notIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [1.2, SQ, tq(-14.8)], rotY: P / 2, length: 2.69, ya: 0, yb: 1.0, rail: false, skirtZ: 0.025, notIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [17.47, 0, STAIR.top], rotY: -P / 2, length: STAIR.foot - STAIR.top, ya: COLO.deckTop, yb: 0, rail: false, skirtZ: 0, notIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [13.96, 0, tq(-41.5)], rotY: -P / 2, length: 3.2, ya: 2.4, yb: 3.8, skirtZ: 0.13 },
  { type: 'tidewater_rampbal', pos: [20.01, 0, STAIR.foot], rotY: P / 2, length: STAIR.foot - STAIR.top, ya: 0, yb: COLO.deckTop, rail: false, skirtZ: 0, notIn: 'tower' },
  // Tower Command: the shorter terrace flights, the bandstand's (wider) mid-side steps, the Crescent's turned stair
  { type: 'tidewater_rampbal', pos: [-2.12, SQ, -TW.flight], rotY: -P / 2, length: TW.flight - 8.0, ya: 0, yb: 1.2, skirtZ: 0.11, onlyIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [2.12, SQ, -8.0], rotY: P / 2, length: TW.flight - 8.0, ya: 1.2, yb: 0, skirtZ: 0.11, onlyIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [-8.3, SQ, -2.12], rotY: P, length: TW.flightW - 8.3, ya: 1.3, yb: 0, skirtZ: 0.11, onlyIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [-TW.flightW, SQ, 2.12], rotY: 0, length: TW.flightW - 8.3, ya: 0, yb: 1.3, skirtZ: 0.11, onlyIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [-1.4, SQ, BSTEP[1]], rotY: -P / 2, length: BSTEP[0] - BSTEP[1], ya: 1.0, yb: 0, rail: false, skirtZ: 0.025, onlyIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [1.4, SQ, BSTEP[0]], rotY: P / 2, length: BSTEP[0] - BSTEP[1], ya: 0, yb: 1.0, rail: false, skirtZ: 0.025, onlyIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [17.47, 0, STAIR_REV.foot], rotY: -P / 2, length: STAIR_REV.top - STAIR_REV.foot, ya: 0, yb: COLO.deckTop, rail: false, skirtZ: 0, onlyIn: 'tower' },
  { type: 'tidewater_rampbal', pos: [20.01, 0, STAIR_REV.top], rotY: P / 2, length: STAIR_REV.top - STAIR_REV.foot, ya: COLO.deckTop, yb: 0, rail: false, skirtZ: 0, onlyIn: 'tower' },
  // bronze name plaques on the terrace's outer face beside its south + west flights
  { type: 'tidewater_streetname', pos: [-2.914, 0.42, -8.006], rotY: -2.793, text: 'JUBILEE', sub: '1887', bronze: true },
  { type: 'tidewater_streetname', pos: [-8.006, 0.42, -2.914], rotY: -1.920, text: 'JUBILEE', sub: '1887', bronze: true },
  // ---- the terrace: candelabra lamps on the dais corners, a back-to-back bench pair (Turf War only: Zone Control's
  //      centre zone is the terrace, and the benches are cleared off it so the dais is open to fight over)
  { type: 'tidewater_lamp', pos: [-5.1, TERR.daisTop, -5.1], variant: 2 },
  { type: 'tidewater_lamp', pos: [5.1, TERR.daisTop, -5.1], variant: 2, notIn: 'tower' },   // (Tower Command: the inflatable)
  { type: 'tidewater_bench', pos: [-3.95, TERR.daisTop, -2.9], rotY: P / 2, variant: 1, notIn: 'zones' },
  // Tower Command: a long inflatable across the dais corner, its long side on the diagonal (the user's drawing)
  { type: 'inflatable', size: 'long', pos: [4.9, TERR.daisTop - 0.05, -5.1], rotY: -P / 4, onlyIn: 'tower' },
  // ---- the Square (paving at SQ)
  { type: 'tidewater_kerb', ...SQL(-11.5, tq(-37)), length: 30.1 },
  { type: 'tidewater_kerb', ...SQL(-15, tq(-25)), length: 36 },
  { type: 'tidewater_kerb', ...SQL(-9, tq(-37)), rotY: -P / 2, length: 12, w: 0.3 },
  { type: 'tidewater_kerb', ...SQL(9, tq(-37)), rotY: -P / 2, length: 12, w: 0.3 },
  // the two halves' slabs meet on the mid line (flight foot → pier forecourt), and the loggia-front strip by the wing
  { type: 'tidewater_kerb', ...SQL(12.4, 0), length: 4.7, notIn: 'tower' },
  { type: 'tidewater_kerb', ...SQL(TW.flightW, 0), length: TW.forecourt - TW.flightW, onlyIn: 'tower' },   // (to the forecourt's new edge)
  { type: 'tidewater_kerb', ...SQL(10.8, tq(-38.4)), length: 3.15, w: 0.3 },
  { type: 'tidewater_fountain', ...SQL(0, tq(-31)), notIn: 'tower' },
  { type: 'tidewater_bandstand', ...SQL(0, tq(-21)), notIn: 'tower' },
  { type: 'tidewater_floralclock', ...SQL(-8.5, tq(-25)) },
  { type: 'tidewater_border', ...SQL(-12, -12), w: 6, d: 5, h: 0.9, notIn: 'tower' },
  // Tower Command: the fountain's basin a little smaller (the track's goal run passes its front), the bandstand moved
  // out, raised and opened at the back (the tower rides through it), the flower border trimmed (the track rounds it)
  { type: 'tidewater_fountain', ...SQL(0, tq(-31)), Rb: 2.0, onlyIn: 'tower' },
  { type: 'tidewater_bandstand', ...SQL(0, TW.band.z), ct: TW.band.ct, wide: true, back: false, onlyIn: 'tower' },
  { type: 'tidewater_border', ...SQL(-11.55, -11.8), w: 5.1, d: 4.0, h: 0.9, onlyIn: 'tower' },
  { type: 'tidewater_tearooms', ...SQL(10.5, tq(-28)), h: 3.0 },
  { type: 'tidewater_anchor', ...SQL(12.5, -17.5) },
  { type: 'tidewater_lamp', ...SQL(-6.5, tq(-35.2)), variant: 0 },
  { type: 'tidewater_lamp', ...SQL(6.5, tq(-35.2)), variant: 0 },
  { type: 'tidewater_lamp', ...SQL(-4.9, tq(-26.6)), variant: 0, baskets: true, notIn: 'tower' },
  { type: 'tidewater_lamp', ...SQL(4.9, tq(-26.6)), variant: 0, baskets: true, rotY: P, notIn: 'tower' },
  { type: 'tidewater_lamp', ...SQL(6.2, -15.4), variant: 0 },
  { type: 'tidewater_lamp', ...SQL(-6.4, -15.8), variant: 0, notIn: 'tower' },
  { type: 'bunting', ...SQL(-4.9, tq(-26.6)), rotY: 0, length: 9.8, height: 4.5, posts: false, notIn: 'tower' },
  // Tower Command: the fountain band's lamp pair set wider (the goal run passes between them), one lamp off the track
  { type: 'tidewater_lamp', ...SQL(-6.4, tq(-26.6)), variant: 0, baskets: true, onlyIn: 'tower' },
  { type: 'tidewater_lamp', ...SQL(6.4, tq(-26.6)), variant: 0, baskets: true, rotY: P, onlyIn: 'tower' },
  { type: 'bunting', ...SQL(-6.4, tq(-26.6)), rotY: 0, length: 12.8, height: 4.5, posts: false, onlyIn: 'tower' },
  { type: 'bunting', ...SQL(-6.5, tq(-35.2)), rotY: 0, length: 13, height: 4.4, posts: false },
  { type: 'tidewater_bench', ...SQL(-6.5, tq(-20.5)), rotY: P / 2 },
  { type: 'tidewater_bench', ...SQL(6.5, tq(-20.5)), rotY: -P / 2 },
  { type: 'tidewater_barometer', ...SQL(-5.4, -12.4), notIn: 'tower' },
  { type: 'tidewater_pillarbox', ...SQL(5.0, -13.4), notIn: 'tower' },
  { type: 'tidewater_barometer', ...SQL(-4.4, -10.3), onlyIn: 'tower' },   // (Tower Command: both off the track)
  { type: 'tidewater_pillarbox', ...SQL(5.0, -14.5), onlyIn: 'tower' },
  { type: 'tidewater_boattrips', ...SQL(12.6, -9.8) },
  { type: 'tidewater_urn', ...SQL(15.3, tq(-31.6)) },
  { type: 'tidewater_urn', ...SQL(-15.2, tq(-17.4)), color: '#9a6ac2' },
  { type: 'tidewater_tree', ...SQL(8.0, tq(-33.6)), variant: 1, s: 0.95 },
  { type: 'tidewater_tree', ...SQL(-10.0, tq(-18.8)), variant: 0 },
  { type: 'tidewater_fingerpost', ...SQL(-6.6, tq(-33.8)), arms: [['PROMENADE', 150], ['TOWN HALL', -90], ['BANDSTAND', 90], ['LIFEBOAT', -150]] },
  { type: 'tidewater_fingerpost', ...SQL(14.6, -12.8), arms: [['CRESCENT', -20], ['TOWN HALL', -95], ['PIER', 180]], notIn: 'tower' },
  { type: 'tidewater_bollard', ...SQL(16.4, -8.6), rotY: -P / 2, count: 3, step: 1.3, notIn: 'tower' },
  // Tower Command: the fingerpost off the track's corner, the cannon bollards along the forecourt's new kerb
  { type: 'tidewater_fingerpost', ...SQL(13.4, -14.4), arms: [['CRESCENT', -20], ['TOWN HALL', -95], ['PIER', 180]], onlyIn: 'tower' },
  { type: 'tidewater_bollard', pos: [TW.forecourt + 0.25, 0, -8.6], rotY: -P / 2, count: 3, step: 1.3, onlyIn: 'tower' },
  { type: 'tidewater_drain', ...SQL(-2.4, tq(-27.8)) }, { type: 'tidewater_drain', ...SQL(8.6, tq(-19.6)) }, { type: 'tidewater_drain', ...SQL(-9.3, -6.2) },
  { type: 'tidewater_drain', ...SQL(3.2, tq(-36.2)), r: 0.25 }, { type: 'tidewater_drain', ...SQL(-14.2, -4.3), r: 0.25 },
  { type: 'tidewater_gull', pos: [0.44, SQ + 2.33, tq(-31.25)], rotY: -0.8, variant: 2 },
  { type: 'tidewater_streetname', pos: [13.9, 2.1, tq(-37.35)], rotY: -P / 2, text: 'TIDEWATER PLAZA', sub: 'BOROUGH OF TIDEWATER' },
  { type: 'tidewater_streetname', pos: [9.5, 1.7, tq(-39.2)], rotY: P / 2, text: 'HALL LANE' },
  { type: 'tidewater_streetname', pos: [17.5, 2.6, -17.0], rotY: -P / 2, text: 'THE CRESCENT', notIn: 'tower' },
  { type: 'tidewater_streetname', pos: [17.5, 2.6, (STAIR_REV.top + STAIR_REV.landing) / 2], rotY: -P / 2, text: 'THE CRESCENT', onlyIn: 'tower' },
  // ---- the Promenade: shelter, ice-cream kiosk + cart, Punch & Judy, the lifeboat collection box
  { type: 'tidewater_shelter', pos: [-20.5, 0, tq(-19)] },
  { type: 'tidewater_icecream', pos: [-23.6, 0, -9] },
  { type: 'cart', pos: [-19.6, 0, -12.6], rotY: P / 2, variant: 0 },
  { type: 'tidewater_punchjudy', pos: [-14.4, 0, tq(-30.4)], rotY: P },
  { type: 'deckchair', pos: [-13.4, 0, tq(-32.9)], rotY: 0.15, variant: 1 },
  { type: 'deckchair', pos: [-15.8, 0, tq(-32.6)], rotY: -0.3 },
  { type: 'tidewater_rnlibox', pos: [-11.9, 0, tq(-35.4)], rotY: -0.5 },
  { type: 'tidewater_streetname', pos: [-24, 2.1, -4.0], rotY: P / 2, text: 'MARINE PARADE' },
  { type: 'tidewater_gull', pos: [-24.45, 3.15, -4.0], rotY: 2.2, variant: 2 },
  // ---- the pier forecourt: its sea railing past the booths, a lamp, a bench
  { type: 'tidewater_searail', pos: [-26.87, 0, 5.5], rotY: -P / 2, length: 3.5, col: false },
  { type: 'tidewater_lamp', pos: [-18.2, 0, 7.6], variant: 0, baskets: true, notIn: 'tower' },
  { type: 'tidewater_lamp', pos: [-18.2, SQ, 7.6], variant: 0, baskets: true, onlyIn: 'tower' },   // (on the square there)
  { type: 'tidewater_bench', pos: [-25.9, 0, 7.2], rotY: P / 2 },
  ...out,
];
