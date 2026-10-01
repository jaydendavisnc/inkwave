// Saltpan Basin — stage prop pack + placements (owner: the saltpan stage; see layout.js for the folder contract).
//
// register(D, H): this stage's prop builders (same contract as props-marina-dock.js: H carries THREE + the kit helpers;
// every type is prefixed 'saltpan_'). PLACEMENTS: the set dressing (half list: every entry is mirrored (x,z) → (-x,-z)
// with rotY + π unless it says `mirror: false`). Solid props hand the level collision boxes (nav, physics, cover).
//
// Conventions follow props.js: metres, Y up, `pos` = base point, rotY turns local +Z (the "front"). Wall-mounted pieces
// treat local z = 0 as the wall face and project toward +Z. Runs (rails, posts, railings) extend along local +X.
// Palette: bleached silver timber, salt white, pink brine, faded oxide red, rust and galvanised steel — muted, so the
// team inks stay the loudest thing on screen. Signage uses 3D channel / painted letters from a small stroke font.
import { STRETCH } from './layout.js';

const P = Math.PI;

export function register(D, H) {
  const { THREE, col, shade, mixc, chamferBox, latheGeo, tubeGeo, extrudeGeo, blobGeo, drum, PI, TAU, HP, P3 } = H;
  const NS = (m) => (H.noShadow && m !== 'glow' && m !== 'blob' ? H.noShadow(m) : m);

  // ------------------------------------------------------------------------------------------ local palette
  const K = {
    timber: '#b8ad9c', timberLt: '#d2cabb', timberDk: '#8f8373', timberOld: '#7a6f62', tar: '#3b352f', endgrain: '#cfc2a8',
    salt: '#f5f2eb', saltSh: '#ddd7cd', brine: '#e6bfb9',
    rust: '#94583b', rustDk: '#6a3e2a', iron: '#55595c', ironLt: '#7b8084', galv: '#b4babf', galvDk: '#878e93',
    oxide: '#9a6353', oxideDk: '#774b3f', cream: '#eee6d5', white: '#f2eee6', trim: '#e9e3d6',
    sack: '#e8e0cd', sackDk: '#cfc4ab', jute: '#bfa57c', printBlue: '#3e587a', printRed: '#a9493c',
    wagonA: '#6f848b', wagonB: '#9a5d42', wagonC: '#b39655', wagonD: '#6d7a63',
    shed: '#b7bcb0', roof: '#9a6b58', office: '#e2cf9f', officeTrim: '#f1ebdd', navy: '#33405a', teal: '#3f8a86',
    lamp: '#ffe0a3', glass: '#35495a', glassLt: '#52697a', rope: '#cdb894', canvas: '#d8cdb4', red: '#b8493d',
    // stroke-font defaults (letters())
    club: '#33405a', clubGold: '#caa251',
  };

  // Parts whose shadow can't be seen (under-deck posts, lettering, small fittings, far scenery) go through NS(mat).
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
  const cx3 = (c) => { const k = col(c); return [k.r, k.g, k.b]; };
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  // Compose another prop type inside this one (at x,y,z / ry in the current local frame) with its colliders carried
  // along (B.col boxes are prop-local, so nested builds must be re-mapped).
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
      B.cols[i] = [x0, b[1] + y, z0, x1, b[4] + y, z1];
    }
  }
  // local-frame collider helper: centre + size
  const colBox = (B, x, y, z, w, h, d) => B.col(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);

  // ------------------------------------------------------------------------------------------ stroke font
  // Rounded bold sans (cap height 1): centre-line strokes, round caps + round joins, bevelled front, flat back.
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

  // 7-segment LED digits (unit cell 0.62 × 1, slight italic): lit segments on 'glow', the unlit "ghost 8" on 'paint'
  const pboxGeo = () => tpl('pbox', () => new THREE.BoxGeometry(1, 1, 1));
  const pbox = (B, mat, c, w, h, d, x, y, z, o = {}) => B.add(mat, pboxGeo(), c, x, y, z, { ...o, sx: w, sy: h, sz: d });

  // ------------------------------------------------------------------------------------------ geometry helpers
  // box between two points a → b (current frame): w = horizontal width, h = height of the section
  function beam(B, mat, c, a, b, w, h, o = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
    B.box(mat, c, L + (o.ext ?? 0), h, w, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { ry: Math.atan2(-dz, dx), rz: Math.atan2(dy, Math.hypot(dx, dz)), r: o.r ?? 0.012 });
  }
  function pbeam(B, mat, c, a, b, w, h) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
    pbox(B, mat, c, L, h, w, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { ry: Math.atan2(-dz, dx), rz: Math.atan2(dy, Math.hypot(dx, dz)) });
  }
  const rodT = (B, mat, c, a, b, r, radial = 5) => B.tube(mat, c, [a, b], r, { radial });
  // Railing collision (engine `rail`: kids can't pass; shots, ink, squids and sight go through; nobody stands on it)
  // along a run a → b of base points on the walking surface (prop-local frame), `h` tall above that line. Sloped or
  // non-axis-aligned runs are split into short steps so each axis-aligned box hugs the rail.
  function railCols(B, a, b, h = 1.05, w = 0.12, seg = 0.6) {
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.ceil(L / seg - 1e-6));
    for (let i = 0; i < n; i++) {
      const p = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const p0 = p(i / n), p1 = p((i + 1) / n);
      B.col(Math.min(p0[0], p1[0]) - w / 2, Math.min(p0[1], p1[1]) - 0.05, Math.min(p0[2], p1[2]) - w / 2,
        Math.max(p0[0], p1[0]) + w / 2, Math.max(p0[1], p1[1]) + h, Math.max(p0[2], p1[2]) + w / 2, { rail: true });
    }
  }
  // sagging cable / rope a → b
  function sag(B, mat, c, a, b, s, r, n = 8) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push(P3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - s * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t)); }
    B.tube(mat, c, pts, r, { radial: 4 });
  }
  // merge several geometries (position / normal / uv / color + index) into one template
  function mergeGeos(list) {
    let nv = 0, ni = 0;
    for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), cl = new Float32Array(nv * 3), idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const g of list) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
      if (g.attributes.color) cl.set(g.attributes.color.array, vo * 3); else cl.fill(1, vo * 3, (vo + n) * 3);
      if (g.index) { const I = g.index.array; for (let k = 0; k < I.length; k++) idx[io++] = I[k] + vo; } else for (let k = 0; k < n; k++) idx[io++] = vo + k;
      vo += n;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }
  const paintGeo = (g, c) => { const k = cx3(c), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(k, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const xform = (g, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s)));

  // Lumpy salt mound / windrow along local X (base y = 0): rounded cross-section, rounded ends, crumbly lumps, a pink
  // brine-wet foot; L = length, W = base width, H = height. Vertex colours carry the shading (multiply by white).
  function moundGeo(L, W, H, seed) {
    return tpl(['mound', L, W, H, seed % 7].map(kf).join('|'), () => {
      const nu = Math.max(6, Math.min(120, Math.round(L / 0.22))), nv = 10, s = (seed % 7) * 1.37 + 0.4, fq = 1 / Math.max(1, W / 1.15), amp = Math.min(1, 1.6 / W);
      const pos = [], cl = [], idx = [];
      const e = Math.min(0.5, (W * 0.55) / L);
      const wet = cx3('#efd9d6'), dry = cx3('#fbfaf6'), shadeC = cx3('#e3ded5');
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, x = (u - 0.5) * L;
        const g = Math.sin(Math.min(1, u / e, (1 - u) / e) * HP);
        for (let j = 0; j <= nv; j++) {
          const v = (j / nv) * 2 - 1;
          const nz = amp * (0.2 * Math.sin(x * 3.1 * fq + s) * Math.sin(v * 2.9 + s * 1.7) + 0.08 * Math.sin(x * 7.3 * fq + v * 5.3 + s * 2.3) + 0.05 * Math.sin(x * 13.7 * fq - v * 8.9 + s * 0.7));
          const tri = 0.45 + 0.4 * (1 - amp);
          const prof = tri * (1 - Math.abs(v)) + (1 - tri) * Math.pow(Math.max(0, 1 - v * v), 0.75);
          const y = H * prof * Math.pow(g, 0.7) * (1 + nz * (0.3 + 0.7 * prof)) * (1 + amp * 0.05 * Math.sin(v * 11 + s + x * 0.4));
          const z = v * (W / 2) * (0.35 + 0.65 * Math.sqrt(g)) * (1 + 0.5 * nz * (1 - prof));
          pos.push(x, Math.max(0, y) - 0.02, z);
          const t = y / H, k = (0.93 + 0.07 * Math.sin(x * 11.1 + v * 7.7 + s * 3.1)) * (1 - amp * 0.07 * Math.pow(0.5 + 0.5 * Math.sin(v * 21 + x * 0.3), 6));
          const c = lerp3(lerp3(wet, shadeC, smooth(0.0, 0.2, t)), dry, smooth(0.25, 0.9, t));
          cl.push(c[0] * k, c[1] * k, c[2] * k);
        }
      }
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    });
  }
  const mound = (B, L, W, H, x, y, z, o = {}) => B.add(o.mat ?? 'rubber', moundGeo(L, W, H, o.seed ?? Math.floor(B.r(0, 7))), o.c ?? 'white', x, y, z, { ry: o.ry ?? 0, ao: o.ao });

  // ------------------------------------------------------------------------------------------ narrow-gauge railway
  function pathSamples(pts, step) {
    if (pts.length === 2) {
      const [a, b] = pts, dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), n = Math.max(1, Math.round(L / step));
      const out = []; for (let i = 0; i <= n; i++) out.push({ x: a[0] + (dx * i) / n, z: a[1] + (dz * i) / n, tx: dx / L, tz: dz / L });
      return { s: out, L, straight: true };
    }
    const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal');
    const L = c.getLength(), n = Math.max(2, Math.ceil(L / step)), out = [];
    for (let i = 0; i <= n; i++) { const p = c.getPointAt(i / n), d = c.getTangentAt(i / n); out.push({ x: p.x, z: p.z, tx: d.x, tz: d.z }); }
    return { s: out, L, straight: false };
  }
  D.saltpan_rail = {
    desc: 'Narrow-gauge (600 mm) salt-works track laid on the ground: tarred timber sleepers every 0.6 m, flat-bottom rails (rusty sides, polished running tops) along a smoothed local path (pos = start; path = [[x, z], …] local points; default a straight run of `length` along +X). Non-colliding.',
    params: { path: 'local [[x, z], …]', length: 'm (8)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const pts = o.path || [[0, 0], [o.length ?? 8, 0]];
      const G2 = 0.3;
      const rails = pathSamples(pts, o.path && o.path.length > 2 ? 0.4 : 1e9);
      const rs = rails.s;
      for (let i = 0; i + 1 < rs.length; i++) {
        const a = rs[i], b = rs[i + 1];
        for (const sd of [-1, 1]) {
          const ax = a.x - a.tz * G2 * sd, az = a.z + a.tx * G2 * sd, bx = b.x - b.tz * G2 * sd, bz = b.z + b.tx * G2 * sd;
          const L = Math.hypot(bx - ax, bz - az) + 0.012, ry = Math.atan2(-(bz - az), bx - ax), cx = (ax + bx) / 2, cz = (az + bz) / 2;
          pbox(B, 'metal', K.rust, L, 0.062, 0.042, cx, 0.082, cz, { ry });
          pbox(B, NS('metal'), K.galv, L, 0.01, 0.034, cx, 0.117, cz, { ry });
          pbox(B, NS('metal'), K.rustDk, L, 0.012, 0.075, cx, 0.057, cz, { ry });
        }
      }
      const sl = pathSamples(pts, 0.6).s;
      sl.forEach((p, i) => {
        if (i === 0 || i === sl.length - 1) return;
        const ry = Math.atan2(-p.tz, p.tx) + B.r(-0.03, 0.03);
        pbox(B, 'wood', shade(K.tar, B.r(0.85, 1.35)), 0.13, 0.055, 0.92, p.x, 0.028, p.z, { ry });
      });
    },
  };
  D.saltpan_buffer = {
    desc: 'Timber buffer stop closing a narrow-gauge line (the track runs along local +X, the stop faces -X at pos): two posts with raking shores, red buffer beam with white bands, a red tail lamp. Collides.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      for (const sz of [-0.32, 0.32]) {
        B.box('wood', K.timberDk, 0.16, 0.95, 0.16, 0.12, 0.475, sz, { r: 0.02 });
        beam(B, 'wood', K.timberDk, [0.18, 0.78, sz], [1.1, 0.04, sz], 0.14, 0.13);
        pbox(B, NS('metal'), K.iron, 0.32, 0.03, 0.22, 1.02, 0.015, sz);
      }
      B.box('paint', K.red, 0.2, 0.26, 1.05, -0.02, 0.64, 0, { r: 0.025 });
      for (const z of [-0.36, 0, 0.36]) pbox(B, NS('paint'), K.white, 0.01, 0.24, 0.1, -0.125, 0.64, z);
      B.box('metal', K.iron, 0.12, 0.16, 0.12, 0.12, 1.05, 0, { r: 0.02 });
      B.sph('glow', '#ff5a3c', 0.042, 0.05, 1.06, 0, { ws: 8, hs: 6, glow: 1.6 });
      B.col(-0.12, 0, -0.5, 1.15, 0.95, 0.5); B.blob(1.5, 1.3, 0.5, 0);
    },
  };
  D.saltpan_turntable = {
    desc: 'Flush wagon turntable at a narrow-gauge junction: round cast-iron deck plate (1.5 m) with crossed rail stubs, a raised rim, handling pin sockets. Non-colliding.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.cyl('metal', K.iron, 0.8, 0.05, 0, 0.025, 0, { seg: 24 });
      B.cyl(NS('metal'), K.ironLt, 0.74, 0.012, 0, 0.056, 0, { seg: 24 });
      B.tor(NS('metal'), K.rustDk, 0.78, 0.022, 0, 0.055, 0, { rx: HP, rs: 4, ts: 28 });
      for (const a of [0, HP]) for (const sd of [-0.3, 0.3]) pbox(B, NS('metal'), K.galv, 1.46, 0.03, 0.04, Math.sin(a) * sd, 0.075, Math.cos(a) * sd, { ry: a });
      for (let k = 0; k < 4; k++) { const a = k * HP + PI / 4; B.cyl(NS('metal'), K.tar, 0.03, 0.01, Math.cos(a) * 0.62, 0.064, Math.sin(a) * 0.62, { seg: 6 }); }
    },
  };

  // V-skip tipper wagon. Local X along the track, pos = track centre at ground (rail tops at y 0.12).
  const VSHELL = [[-0.52, 0.46], [-0.14, -0.07], [0.14, -0.07], [0.52, 0.46], [0.485, 0.46], [0.12, -0.035], [-0.12, -0.035], [-0.485, 0.46]];
  const VEND = [[-0.52, 0.46], [-0.14, -0.07], [0.14, -0.07], [0.52, 0.46]];
  D.saltpan_wagon = {
    desc: 'Decauville V-skip tipper wagon on 600 mm track (pos = track centre at ground, local X along the rails): flanged wheels on axle boxes, iron frame, timber buffer beams with link couplings, the V skip on rocking cradles with a locking catch. variant 0 heaped with salt, 1 empty, 2 skip tipped over to +Z with the load spilled. color = skip paint. Collides.',
    params: { color: 'skip paint' }, variants: 3, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 3, wc = col(o.color ?? [K.wagonA, K.wagonB, K.wagonC, K.wagonD][Math.floor(B.r(0, 3.999))]);
      // running gear
      for (const sx of [-0.42, 0.42]) {
        for (const sz of [-0.3, 0.3]) {
          B.cyl('metal', K.iron, 0.17, 0.055, sx, 0.29, sz, { rx: HP, seg: 14 });
          B.cyl(NS('metal'), K.ironLt, 0.2, 0.016, sx, 0.29, sz - Math.sign(sz) * 0.036, { rx: HP, seg: 14 });
          B.cyl(NS('metal'), K.rustDk, 0.06, 0.07, sx, 0.29, sz, { rx: HP, seg: 8 });
          pbox(B, 'metal', K.iron, 0.16, 0.14, 0.08, sx, 0.31, sz + Math.sign(sz) * 0.08);
        }
        B.cyl(NS('metal'), K.iron, 0.03, 0.62, sx, 0.29, 0, { rx: HP, seg: 6 });
      }
      for (const sz of [-0.26, 0.26]) pbox(B, 'metal', shade(K.iron, 1.1), 1.5, 0.1, 0.05, 0, 0.4, sz);
      for (const sx of [-0.55, 0, 0.55]) pbox(B, NS('metal'), K.iron, 0.05, 0.05, 0.52, sx, 0.4, 0);
      for (const sx of [-0.8, 0.8]) {
        B.box('wood', K.timberDk, 0.12, 0.17, 0.72, sx, 0.42, 0, { r: 0.015 });
        B.tor(NS('metal'), K.iron, 0.05, 0.012, sx + Math.sign(sx) * 0.1, 0.42, 0, { rs: 4, ts: 8 });
        pbox(B, NS('metal'), K.iron, 0.08, 0.04, 0.06, sx + Math.sign(sx) * 0.05, 0.42, 0);
      }
      // cradles
      for (const sx of [-0.56, 0.56]) {
        B.add('metal', tpl('wcrad', () => extrudeGeo([[-0.3, 0], [0.3, 0], [0.1, 0.28], [-0.1, 0.28]], 0.04, 0.004)), K.iron, sx, 0.44, 0, {});
        B.cyl(NS('metal'), K.galvDk, 0.035, 0.08, sx, 0.72, 0, { rz: HP, seg: 8 });
      }
      // skip (pivot at y 0.72)
      const tip = v === 2 ? 1.05 : 0;
      B.push(0, 0.72, 0, 0, tip);
      B.add('paint', tpl('wshell', () => extrudeGeo(VSHELL, 1.3, 0.006)), wc, 0, 0.02, 0, {});
      for (const sx of [-0.66, 0.66]) B.add('paint', tpl('wend', () => extrudeGeo(VEND, 0.035, 0.005)), shade(wc, 0.92), sx, 0.02, 0, {});
      for (const sz of [-0.5, 0.5]) pbox(B, 'metal', K.iron, 1.36, 0.04, 0.05, 0, 0.49, sz);
      for (const sx of [-0.35, 0.35]) for (const sz of [-1, 1]) pbeam(B, NS('paint'), shade(wc, 0.8), [sx, 0.47, sz * 0.52], [sx, -0.05, sz * 0.15], 0.035, 0.03);
      pbox(B, NS('paint'), shade(wc, 0.55), 1.2, 0.08, 0.035, 0, 0.12, 0.33, { rx: -0.63 });   // rust bloom along the belly
      if (v === 0) B.add('rubber', tpl('wload', () => blobGeo(1, 2, 3, 0.2, 0.84, 1.06)), K.salt, 0, 0.42, 0, { sx: 0.6, sy: 0.17, sz: 0.44 });
      if (v === 1) pbox(B, NS('paint'), '#5d534b', 1.24, 0.01, 0.8, 0, 0.44, 0);
      B.pop();
      pbox(B, NS('metal'), K.iron, 0.04, 0.18, 0.04, 0.7, 0.64, -0.42);   // catch lever
      if (v === 2) { mound(B, 1.4, 1.1, 0.32, 0, 0, 1.05, { seed: 2 }); B.col(-0.85, 0, -0.55, 0.85, 1.05, 0.95); }
      else B.col(-0.86, 0, -0.52, 0.86, v === 0 ? 1.3 : 1.2, 0.52);
      B.blob(2.0, 1.4);
    },
  };

  // ------------------------------------------------------------------------------------------ salt in the pans
  D.saltpan_saltrow = {
    desc: 'Raked salt in a crystallising pan: variant 0 a windrow (length L × 1.1 m, 0.6 m high), 1 a row of small cones along +X (count, 1.8 m apart), 2 one big cone (1.9 m, 1.0 m high). Lumpy white salt with a pink brine-wet foot. Collides.',
    params: { length: 'windrow m (5)', count: 'cones (3)', height: 'm' }, variants: 3, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 3, sd = Math.floor(B.r(0, 7));
      if (v === 0) {
        const L = o.length ?? 5, H = o.height ?? 0.62;
        mound(B, L, 1.15, H, 0, 0, 0, { seed: sd });
        B.col(-L / 2 + 0.25, 0, -0.38, L / 2 - 0.25, H * 0.85, 0.38); B.blob(L + 0.6, 1.6);
      } else if (v === 1) {
        const n = o.count ?? 3, H = o.height ?? 0.58;
        for (let i = 0; i < n; i++) {
          const x = i * 1.8 + B.r(-0.1, 0.1), h = H * B.r(0.85, 1.1);
          mound(B, 1.05, 1.05, h, x, 0, B.r(-0.08, 0.08), { seed: (sd + i) % 7, ry: B.r(0, PI) });
          B.col(x - 0.34, 0, -0.34, x + 0.34, h * 0.8, 0.34);
        }
        B.blob(n * 1.8, 1.4, (n - 1) * 0.9, 0);
      } else {
        const H = o.height ?? 1.0;
        mound(B, 1.95, 1.9, H, 0, 0, 0, { seed: sd });
        B.col(-0.62, 0, -0.6, 0.62, H * 0.78, 0.6); B.blob(2.6, 2.6);
      }
    },
  };

  // timber revetment posts lining a pan wall: the wall face at local z = 0 (pan on +Z), dyke top at y = 0, `length`
  // along +X, `depth` = pan depth. Posts + a top waling tucked under the dyke edge. Non-colliding.
  D.saltpan_revet = {
    desc: 'Timber revetment on a pan wall (wall face at local z = 0, pan on +Z, dyke top at y = 0): tarred posts every `spacing` from the pan floor to just above the dyke edge, iron dogs, a few salt-crusted tide lines. Non-colliding.',
    params: { length: 'm', depth: 'pan depth m (0.9)', spacing: 'm (1.6)' }, variants: 1, mount: 'wall',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 8, d = o.depth ?? 0.9, sp = o.spacing ?? 1.6, n = Math.max(1, Math.round(L / sp));
      for (let i = 0; i <= n; i++) {
        const x = (i / n) * L, h = d + 0.07;
        B.box('wood', shade(K.timberOld, B.r(0.85, 1.1)), 0.13, h, 0.09, x, -d + h / 2, 0.045, { r: 0.015 });
        pbox(B, NS('metal'), K.rustDk, 0.035, 0.1, 0.02, x, -0.18, 0.1);
        pbox(B, NS('paint'), K.salt, 0.14, 0.05, 0.095, x, -d + 0.04, 0.05);
      }
    },
  };

  // boardwalk under-structure: deck top at y = 0 (pos), deck runs along +X for `length`, width W across Z, floor at
  // y = -drop. Paired posts, cross bearers + stringers under the deck, optional post-and-rail handrail on one side.
  D.saltpan_bwposts = {
    desc: 'Salt-pan boardwalk structure under a level deck (deck top at pos y, runs along local +X for `length`, width `width` across Z, pan floor `drop` below): paired tarred posts every 1.6 m, cross bearers and stringers, iron straps; `rail` = +1/-1 adds a post-and-rope handrail on that side. Non-colliding.',
    params: { length: 'm', width: 'm (1.8)', drop: 'm (0.9)', rail: '0 | 1 | -1' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 8, W = o.width ?? 1.8, d = o.drop ?? 0.9, n = Math.max(1, Math.round(L / 1.6)), hw = W / 2 - 0.12;
      for (const sz of [-hw, hw]) pbox(B, NS('wood'), K.timberOld, L, 0.14, 0.09, L / 2, -0.24, sz);
      for (let i = 0; i <= n; i++) {
        const x = 0.2 + (i / n) * (L - 0.4);
        for (const sz of [-hw, hw]) {
          B.box(NS('wood'), shade(K.tar, B.r(0.9, 1.3)), 0.13, d - 0.14, 0.13, x, -d + (d - 0.14) / 2, sz, { r: 0.02 });
          pbox(B, NS('paint'), K.salt, 0.14, 0.06, 0.14, x, -d + 0.03, sz);
        }
        pbox(B, NS('wood'), K.timberOld, 0.1, 0.12, W - 0.1, x, -0.22, 0);
      }
      for (const side of o.rail === 2 ? [1, -1] : o.rail ? [o.rail] : []) {
        // (railTo: the handrail stops short of the far end, where the Tower Command track crosses the landing)
        const z = side * (W / 2 - 0.08), RL = Math.min(L, o.railTo ?? L), m = Math.max(1, Math.round(RL / 2.4));
        const tops = [];
        for (let i = 0; i <= m; i++) {
          const x = 0.15 + (i / m) * (RL - 0.3);
          B.box('wood', K.timberDk, 0.09, 1.02, 0.09, x, 0.51, z, { r: 0.015 });
          B.box(NS('wood'), K.timberDk, 0.13, 0.04, 0.13, x, 1.04, z, { r: 0.01 });
          tops.push([x, 0.98, z]);
        }
        for (let i = 0; i < m; i++) sag(B, NS('paint'), K.rope, tops[i], tops[i + 1], 0.12, 0.018, 6);
        railCols(B, [0.1, 0, z], [RL - 0.1, 0, z], 1.06, 0.12, 99);   // turned placements keep a turned collider (engine)
        if (o.lamps) for (let i = 1; i < tops.length; i += 2) { const t = tops[i]; B.cyl('metal', K.iron, 0.05, 0.1, t[0], t[1] + 0.13, t[2], { seg: 8 }); B.sph('glow', K.lamp, 0.045, t[0], t[1] + 0.2, t[2], { ws: 8, hs: 6, glow: 1.8 }); B.cyl(NS('metal'), K.iron, 0.06, 0.02, t[0], t[1] + 0.25, t[2], { seg: 8 }); }
      }
    },
  };

  // ------------------------------------------------------------------------------------------ sluice gate
  D.saltpan_sluice = {
    desc: 'Timber sluice headstock on a dyke (pos = dyke top centre; the culvert runs along local Z under the dyke, pans on ±Z): two heavy posts and a head beam, the raised gate paddle with iron straps, rack and pinion with a spoked handwheel, sill timbers, culvert mouths on the pan walls (walls = [[z, depth], …]). Collides.',
    params: { walls: '[[z of pan wall face, pan depth], …]', open: '0..1 paddle raise (0.4)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const lift = (o.open ?? 0.4) * 0.8, tb = K.timberDk;
      B.box('wood', shade(K.timberOld, 0.9), 1.8, 0.14, 0.62, 0, 0.07, 0, { r: 0.02 });
      for (const sx of [-0.56, 0.56]) {
        B.box('wood', tb, 0.24, 1.78, 0.24, sx, 0.89, 0, { r: 0.03 });
        B.box(NS('wood'), K.endgrain, 0.26, 0.03, 0.26, sx, 1.79, 0, { r: 0.01 });
        for (const y of [0.5, 1.2]) pbox(B, NS('metal'), K.rustDk, 0.26, 0.05, 0.25, sx, y, 0);
        beam(B, 'wood', tb, [sx * 1.0, 0.14, 0.45], [sx * 0.62, 0.95, 0.1], 0.13, 0.13);
        beam(B, 'wood', tb, [sx * 1.0, 0.14, -0.45], [sx * 0.62, 0.95, -0.1], 0.13, 0.13);
      }
      B.box('wood', tb, 1.5, 0.22, 0.3, 0, 1.62, 0, { r: 0.03 });
      // paddle (raised) + straps
      const py = 0.45 + lift;
      B.box('wood', K.timberOld, 0.86, 0.9, 0.1, 0, py, 0, { r: 0.015 });
      for (const y of [-0.3, 0, 0.3]) pbox(B, NS('metal'), K.rustDk, 0.88, 0.05, 0.11, 0, py + y, 0);
      pbox(B, NS('paint'), '#7b6a63', 0.84, 0.06, 0.105, 0, py - 0.42, 0);            // brine stain
      pbox(B, 'metal', K.iron, 0.06, 1.2, 0.05, 0, py + 0.95, 0.04);                    // rack
      for (let k = 0; k < 9; k++) pbox(B, NS('metal'), K.ironLt, 0.08, 0.02, 0.03, 0, py + 0.45 + k * 0.1, 0.07);
      // pinion + handwheel on the front of the head beam
      B.cyl('metal', K.navy, 0.12, 0.08, 0, 1.62, 0.2, { rx: HP, seg: 12 });
      B.cyl(NS('metal'), K.iron, 0.03, 0.34, 0, 1.62, 0.3, { rx: HP, seg: 6 });
      B.tor('metal', K.red, 0.3, 0.022, 0, 1.62, 0.46, { rs: 5, ts: 22 });
      for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; pbeam(B, NS('metal'), K.red, [0, 1.62, 0.46], [Math.cos(a) * 0.29, 1.62 + Math.sin(a) * 0.29, 0.46], 0.018, 0.018); }
      B.cyl(NS('metal'), K.iron, 0.045, 0.06, 0, 1.62, 0.47, { rx: HP, seg: 8 });
      // culvert mouths on the pan walls
      for (const [wz, dep] of o.walls || []) {
        const s = Math.sign(wz) || 1, y = -dep + 0.26;
        B.push(0, 0, wz, s > 0 ? 0 : PI);
        B.cyl(NS('paint'), '#2b2724', 0.21, 0.02, 0, y, 0.01, { rx: HP, seg: 14 });
        B.tor('metal', K.rust, 0.22, 0.035, 0, y, 0.025, { rs: 5, ts: 16 });
        pbox(B, NS('wood'), K.timberOld, 0.7, 0.1, 0.08, 0, y + 0.3, 0.04);
        B.pop();
      }
      // solid parts (posts, head beam, raised paddle) + the see-through frame round them as a rail
      for (const sx of [-0.56, 0.56]) B.col(sx - 0.12, 0, -0.12, sx + 0.12, 1.8, 0.12, { roof: true });
      B.col(-0.75, 1.5, -0.15, 0.75, 1.8, 0.15, { roof: true });
      B.col(-0.43, py - 0.45, -0.06, 0.43, py + 0.45, 0.06, { roof: true });
      B.col(-1.0, 0, -0.45, 1.0, 1.8, 0.45, { rail: true });
      B.blob(2.0, 1.2);
    },
  };

  // ------------------------------------------------------------------------------------------ sacks, barrows, tools
  function sack(B, x, y, z, ry, c, print) {
    B.box('rubber', c, 0.64, 0.19, 0.4, x, y + 0.095, z, { round: true, r: 0.07, ry });
    B.push(x, y, z, ry);
    for (const s of [-1, 1]) B.sph(NS('rubber'), shade(c, 0.9), 0.035, s * 0.31, 0.11, s * 0.1, { ws: 5, hs: 4 });
    if (print) { pbox(B, NS('paint'), print, 0.36, 0.004, 0.05, 0, 0.192, -0.06); pbox(B, NS('paint'), print, 0.36, 0.004, 0.02, 0, 0.192, 0.03); }
    B.pop();
  }
  D.saltpan_sacks = {
    desc: 'Salt sacks: variant 0 a pallet stacked `rows` high in a brick bond (5 sacks a layer, alternating), 1 a loose heap of sacks, 2 a single row of sacks along +X (count). Jute-white sacks with blue or red printed bands. Collides.',
    params: { rows: 'layers (3)', count: 'variant 2 sacks (4)' }, variants: 3, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 3, pr = [K.printBlue, K.printRed][Math.floor(B.r(0, 1.999))];
      const sc = () => mixc(K.sack, K.sackDk, B.r(0, 0.6));
      if (v === 0) {
        const rows = o.rows ?? 3;
        for (let i = 0; i < 3; i++) pbox(B, 'wood', K.timberLt, 1.2, 0.03, 0.1, 0, 0.125, -0.45 + i * 0.45);
        for (const x of [-0.55, 0, 0.55]) pbox(B, 'wood', K.timberDk, 0.1, 0.1, 1.0, x, 0.055, 0);
        for (let r = 0; r < rows; r++) {
          const y = 0.14 + r * 0.19;
          if (r % 2 === 0) { for (const z of [-0.29, 0.13]) for (const x of [-0.32, 0.32]) sack(B, x + B.r(-0.02, 0.02), y, z, B.r(-0.05, 0.05), sc(), pr); sack(B, 0, y, 0.43, HP + B.r(-0.05, 0.05), sc(), pr); }
          else { for (const x of [-0.4, 0, 0.4]) sack(B, x, y, -0.19, HP + B.r(-0.05, 0.05), sc(), pr); for (const x of [-0.3, 0.3]) sack(B, x, y, 0.33, B.r(-0.05, 0.05), sc(), pr); }
        }
        B.col(-0.62, 0, -0.52, 0.62, 0.14 + rows * 0.19, 0.55); B.blob(1.7, 1.6);
      } else if (v === 1) {
        const spots = [[0, 0, 0, 0.2], [0.5, 0, 0.2, -0.4], [-0.45, 0, 0.1, 0.9], [0.1, 0.19, 0.05, 0.6], [0.2, 0, -0.45, 1.4], [-0.3, 0.19, -0.1, -0.3]];
        for (const [x, y, z, ry] of spots) sack(B, x, y, z, ry, sc(), pr);
        B.col(-0.75, 0, -0.7, 0.8, 0.36, 0.5); B.blob(2, 1.7);
      } else {
        const n = o.count ?? 4;
        for (let i = 0; i < n; i++) { B.push(i * 0.44, 0, 0, 0, 0, 0.18); sack(B, 0, 0, 0, HP + B.r(-0.08, 0.08), sc(), pr); B.pop(); }
        B.col(-0.25, 0, -0.35, n * 0.44 - 0.2, 0.3, 0.35); B.blob(n * 0.44 + 0.4, 0.9, n * 0.22 - 0.22, 0);
      }
    },
  };

  D.saltpan_barrow = {
    desc: 'Timber salt barrow (wheel at local +X): tapered slatted tray, long handles with worn grips, iron-shod spoked wheel, splayed legs; variant 0 heaped with salt, 1 empty, 2 tipped up on its wheel against nothing (resting on the handles). Collides.',
    params: {}, variants: 3, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 3;
      const tilt = v === 2 ? -0.55 : 0.1;
      B.push(0, 0, 0, 0, 0, tilt);
      const tray = tpl('btray', () => extrudeGeo([[-0.3, 0], [0.3, 0], [0.4, 0.32], [-0.4, 0.32]], 0.8, 0.01));
      B.add('wood', tray, K.timber, 0.15, 0.3, 0, {});
      for (let k = 0; k < 3; k++) pbox(B, NS('wood'), K.timberDk, 0.82, 0.02, 0.82 - k * 0.04, 0.15, 0.44 + k * 0.08, 0);
      pbox(B, NS('paint'), '#4e4640', 0.72, 0.01, 0.56, 0.15, 0.625, 0);
      for (const sz of [-0.3, 0.3]) {
        beam(B, 'wood', K.timberDk, [-0.95, 0.52, sz], [0.62, 0.26, sz * 0.7], 0.06, 0.06);
        B.cyl(NS('wood'), K.timberOld, 0.03, 0.2, -0.88, 0.53, sz, { rz: HP - 0.17, seg: 6 });
        beam(B, 'wood', K.timberDk, [-0.35, 0.37, sz], [-0.42, 0.0, sz * 1.1], 0.05, 0.05);
      }
      B.cyl('wood', K.timberDk, 0.2, 0.07, 0.68, 0.2, 0, { rx: HP, seg: 12 });
      B.tor(NS('metal'), K.iron, 0.2, 0.018, 0.68, 0.2, 0, { rs: 4, ts: 16 });
      if (v === 0) B.add('rubber', tpl('bload', () => blobGeo(1, 1, 5, 0.12, 0.88, 1.06)), K.salt, 0.15, 0.6, 0, { sx: 0.42, sy: 0.18, sz: 0.3 });
      B.pop();
      B.col(-1.0, 0, -0.42, 0.9, 0.75, 0.42); B.blob(1.9, 0.9);
    },
  };

  // salt rake (las): long ash pole with a wide timber head
  function rake(B, a, b, headW = 0.62) {
    rodT(B, 'wood', K.timberLt, a, b, 0.018, 5);
    const dx = b[0] - a[0], dz = b[2] - a[2], ry = Math.atan2(-dz, dx);
    B.push(b[0], b[1], b[2], ry + HP);
    B.box('wood', K.timberDk, headW, 0.1, 0.025, 0, 0.0, 0, { r: 0.008 });
    B.pop();
  }
  D.saltpan_tools = {
    desc: 'Salt-worker tools: variant 0 two long salt rakes and a shovel lying on the ground, 1 rakes + shovel + broom leaning on a little timber rack (rack along +X, tools lean toward -Z), 2 one rake lying by a pan edge. Non-colliding.',
    params: {}, variants: 3, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 3;
      const shovel = (x, y, z, ry, rz) => {
        B.push(x, y, z, ry, 0, rz);
        rodT(B, 'wood', K.timberLt, P3(-0.75, 0, 0), P3(0.45, 0, 0), 0.02, 5);
        B.tor(NS('wood'), K.timberDk, 0.06, 0.015, -0.8, 0, 0, { rs: 4, ts: 8, rx: HP });
        B.box('metal', K.galvDk, 0.34, 0.02, 0.28, 0.6, 0, 0, { r: 0.008 });
        B.pop();
      };
      if (v === 0) {
        rake(B, P3(-1.4, 0.02, 0.1), P3(1.3, 0.05, -0.15)); rake(B, P3(-1.2, 0.02, 0.45), P3(1.4, 0.05, 0.55));
        shovel(0.2, 0.03, -0.55, 0.3, 0);
      } else if (v === 1) {
        for (const sx of [-0.8, 0.8]) B.box('wood', K.timberDk, 0.08, 1.1, 0.08, sx, 0.55, 0, { r: 0.012 });
        B.box('wood', K.timberDk, 1.8, 0.08, 0.08, 0, 1.05, 0, { r: 0.012 });
        rake(B, P3(-0.5, 0, -0.55), P3(-0.55, 2.9, 0.12), 0.58);
        rake(B, P3(-0.2, 0, -0.55), P3(-0.1, 2.9, 0.1), 0.58);
        shovel(0.35, 0.8, -0.3, HP, 1.2);
        rodT(B, 'wood', K.timberLt, P3(0.62, 0.05, -0.5), P3(0.66, 1.4, 0.06), 0.017);
        B.box('wood', K.timberDk, 0.34, 0.08, 0.08, 0.62, 0.08, -0.5, { r: 0.01 });
        B.col(-0.9, 0, -0.1, 0.9, 1.1, 0.1, { rail: true });
      } else rake(B, P3(-1.4, 0.02, 0), P3(1.35, 0.05, 0.2));
    },
  };

  // ------------------------------------------------------------------------------------------ lamps
  // enamel dish shade with a warm glowing bulb (shade axis down), at x,y,z in the current frame
  function dishLamp(B, x, y, z, R = 0.24) {
    B.lathe('gloss', '#2f5a4e', [[0, 0.0], [R * 0.38, -0.02], [R * 0.96, -0.085], [R * 1.02, -0.08], [R, -0.06], [R * 0.4, 0.04], [0.02, 0.06]], x, y, z, { seg: 14 });
    B.cyl(NS('metal'), K.iron, 0.04, 0.08, x, y + 0.08, z, { seg: 8 });
    B.sph('glow', K.lamp, 0.075, x, y - 0.05, z, { ws: 10, hs: 6, glow: 1.9 });
    B.cyl('glow', K.lamp, R * 0.9, 0.012, x, y - 0.075, z, { seg: 14, glow: 1.4 });
  }
  D.saltpan_lamp = {
    desc: 'Salt-works lighting: variant 0 a tarred timber pole (5.4 m) with a crossarm, pot insulators and a swan-neck enamel dish lamp reaching toward +Z (optional `cable` = [dx, dy, dz] local offset to the next pole top: a sagging line); 1 a wall-mounted swan-neck dish lamp (wall at z = 0). Pole collides.',
    params: { cable: '[dx, dy, dz]', height: 'm (5.4)' }, variants: 2, mount: 'ground|wall',
    build(B, o) {
      const v = (o.variant ?? 0) % 2;
      if (v === 1) {
        B.aoBase = null;
        B.box('metal', K.iron, 0.14, 0.2, 0.03, 0, 0, 0.015, { r: 0.01 });
        B.tube('metal', K.iron, [P3(0, 0.05, 0.02), P3(0, 0.25, 0.25), P3(0, 0.2, 0.5), P3(0, 0.08, 0.58)], 0.022, { radial: 6 });
        dishLamp(B, 0, 0.0, 0.6, 0.2);
        return;
      }
      const H = o.height ?? 5.4;
      B.lathe('wood', K.tar, [[0.12, 0], [0.11, 0.5], [0.085, H], [0.05, H + 0.05], [0, H + 0.06]], 0, 0, 0, { seg: 8 });
      B.cyl(NS('wood'), '#2a2521', 0.13, 0.5, 0, 0.25, 0, { seg: 8 });
      B.box('wood', K.timberDk, 1.3, 0.1, 0.1, 0, H - 0.35, 0, { r: 0.015 });
      for (const sx of [-0.55, -0.2, 0.55]) { B.cyl(NS('paint'), '#e9e6de', 0.035, 0.1, sx, H - 0.24, 0, { seg: 6 }); B.cyl(NS('metal'), K.iron, 0.008, 0.08, sx, H - 0.33, 0, { seg: 4 }); }
      B.tube('metal', K.iron, [P3(0, H - 0.9, 0.08), P3(0, H - 0.6, 0.45), P3(0, H - 0.72, 0.9), P3(0, H - 0.88, 1.02)], 0.03, { radial: 6 });
      dishLamp(B, 0, H - 0.98, 1.04);
      B.tube(NS('paint'), '#1f1d1b', [P3(0, H - 0.3, 0.1), P3(0, H - 0.8, 0.16), P3(0, H - 1.2, 0.1)], 0.01, { radial: 3 });
      if (o.cable) sag(B, NS('paint'), '#1f1d1b', P3(0.55, H - 0.2, 0), P3(o.cable[0] + 0.55, o.cable[1] + H - 0.2, o.cable[2]), 0.5, 0.012, 10);
      B.col(-0.13, 0, -0.13, 0.13, H, 0.13, { roof: true }); B.blob(0.8, 0.8);
    },
  };

  // ------------------------------------------------------------------------------------------ small fittings
  // four-pane timber window (opening w × h, bottom at y, centred at x) on a wall at z = 0
  function window4(B, x, y, w, h, o = {}) {
    const fc = o.frame ?? K.trim, t = 0.07;
    pbox(B, NS('gloss'), o.glass ?? K.glass, w, h, 0.02, x, y + h / 2, 0.012);
    pbox(B, 'paint', fc, w + t * 2, t, 0.06, x, y + h + t / 2, 0.03);
    pbox(B, 'paint', fc, w + t * 2 + 0.06, 0.05, 0.1, x, y - 0.025, 0.05);
    for (const sx of [-1, 1]) pbox(B, 'paint', fc, t, h, 0.06, x + sx * (w / 2 + t / 2), y + h / 2, 0.03);
    pbox(B, NS('paint'), fc, 0.035, h, 0.035, x, y + h / 2, 0.03);
    pbox(B, NS('paint'), fc, w, 0.035, 0.035, x, y + h / 2, 0.03);
    if (o.lit) pbox(B, 'glow', K.lamp, w - 0.06, h * 0.45, 0.004, x, y + h * 0.3, 0.024, { glow: o.lit });
    if (o.shutter) for (const sx of [-1, 1]) {
      const sxp = x + sx * (w / 2 + t + w / 4 + 0.02);
      pbox(B, 'paint', o.shutter, w / 2, h + 0.06, 0.04, sxp, y + h / 2, 0.02);
      beamZ(B, NS('paint'), shade(o.shutter, 0.8), sxp - w / 4 + 0.05, y + 0.08, sxp + w / 4 - 0.05, y + h - 0.08, 0.045);
    }
  }
  // diagonal brace on a wall (x0,y0) → (x1,y1) at depth z
  function beamZ(B, mat, c, x0, y0, x1, y1, z, w = 0.07) { pbeam(B, mat, c, [x0, y0, z], [x1, y1, z], 0.03, w); }
  // ledged-and-braced timber door leaf (w × h), bottom-left… centred at x, bottom y, on a wall at z = 0
  function ledgedDoor(B, x, y, w, h, c, o = {}) {
    B.box('wood', c, w, h, 0.05, x, y + h / 2, 0.03, { r: 0.012 });
    const nb = Math.max(2, Math.round(w / 0.16));
    for (let i = 1; i < nb; i++) pbox(B, NS('paint'), shade(c, 0.78), 0.012, h - 0.04, 0.01, x - w / 2 + (i * w) / nb, y + h / 2, 0.056);
    for (const yy of [0.18, 0.5, 0.82]) pbox(B, NS('wood'), shade(c, 0.9), w - 0.06, 0.12, 0.03, x, y + h * yy, 0.07);
    beamZ(B, NS('wood'), shade(c, 0.9), x - w / 2 + 0.08, y + h * 0.2, x + w / 2 - 0.08, y + h * 0.47, 0.07, 0.1);
    beamZ(B, NS('wood'), shade(c, 0.9), x - w / 2 + 0.08, y + h * 0.53, x + w / 2 - 0.08, y + h * 0.8, 0.07, 0.1);
    if (o.track) { pbox(B, 'metal', K.iron, o.track, 0.06, 0.05, x + (o.trackX ?? 0), y + h + 0.06, 0.08); for (const sx of [-1, 1]) B.cyl(NS('metal'), K.iron, 0.04, 0.03, x + sx * w * 0.3, y + h + 0.06, 0.12, { rx: HP, seg: 8 }); }
    pbox(B, NS('metal'), K.iron, 0.03, 0.14, 0.03, x + w * 0.38, y + 1.0, 0.085);
  }
  // board sign: text painted on a board (centre x, y; faces +Z at z)
  function boardSign(B, text, x, y, z, o = {}) {
    const h = o.h ?? 0.22, pad = o.pad ?? h * 0.6, W = o.w ?? textW(text, o.wt ?? 0.19, o.track ?? 0.12) * h + pad * 2, Hb = o.hb ?? h + pad * 1.1;
    B.box(o.mat ?? 'paint', o.board ?? K.white, W, Hb, 0.05, x, y, z + 0.025, { r: Math.min(0.03, Hb * 0.15) });
    if (o.border) B.box(NS('paint'), o.border, W - 0.05, Hb - 0.05, 0.004, x, y, z + 0.052, { r: 0.01 });
    if (o.border) B.box(NS('paint'), o.board ?? K.white, W - 0.1, Hb - 0.1, 0.004, x, y, z + 0.055, { r: 0.01 });
    letters(B, text, { h, x, y: y - h / 2, z: z + 0.058, c: o.c ?? K.navy, flat: true, wt: o.wt ?? 0.19, track: o.track ?? 0.12, mat: o.glow ? 'glow' : undefined, glow: o.glow });
    return W;
  }

  // ------------------------------------------------------------------------------------------ the wind pump
  // multi-blade windwheel template (disc in the XZ plane, spun about Y; the placement turns Y to the wind axis)
  H.spinTemplate('saltpan_wheel', () => {
    const g = new GB(), N = 18, r0 = 0.5, r1 = 1.85, blade = cx3('#c3c8cb'), blade2 = cx3('#a9b0b4'), red = cx3('#a8503f');
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * TAU, ca = Math.cos(a0), sa = Math.sin(a0), cB = i % 6 === 0 ? red : i % 2 ? blade : blade2;
      const F = [], Bk = [];
      for (let s = 0; s <= 3; s++) {
        const r = r0 + ((r1 - r0) * s) / 3, w = 0.14 + (0.2 * s) / 3, p = 0.62 - (0.2 * s) / 3;
        const tx = -sa * Math.cos(p), ty = Math.sin(p), tz = ca * Math.cos(p), nx = sa * Math.sin(p), ny = Math.cos(p), nz = -ca * Math.sin(p);
        const px = ca * r, pz = sa * r;
        F.push([g.v(px - (tx * w) / 2, -(ty * w) / 2, pz - (tz * w) / 2, nx, ny, nz, ...cB), g.v(px + (tx * w) / 2, (ty * w) / 2, pz + (tz * w) / 2, nx, ny, nz, ...cB)]);
        Bk.push([g.v(px - (tx * w) / 2, -(ty * w) / 2 - 0.006, pz - (tz * w) / 2, -nx, -ny, -nz, ...cB), g.v(px + (tx * w) / 2, (ty * w) / 2 - 0.006, pz + (tz * w) / 2, -nx, -ny, -nz, ...cB)]);
      }
      for (let s = 0; s < 3; s++) { g.quad(F[s][0], F[s][1], F[s + 1][1], F[s + 1][0]); g.quad(Bk[s][0], Bk[s][1], Bk[s + 1][1], Bk[s + 1][0]); }
    }
    const parts = [g.geo()];
    const ring = (R, r) => { const pts = []; for (let k = 0; k < 36; k++) { const a = (k / 36) * TAU; pts.push([Math.cos(a) * R, 0, Math.sin(a) * R]); } return paintGeo(tubeGeo(pts, r, 4, true), '#8d959a'); };
    parts.push(ring(r1, 0.022), ring(1.15, 0.018), ring(r0, 0.02));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; parts.push(paintGeo(tubeGeo([[Math.cos(a) * 0.14, 0.05, Math.sin(a) * 0.14], [Math.cos(a) * r1, 0, Math.sin(a) * r1]], 0.016, 4), '#80888d')); }
    parts.push(paintGeo(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 12), '#5a6063'));
    parts.push(paintGeo(xform(new THREE.SphereGeometry(0.1, 10, 6), 0, 0.16, 0), '#5a6063'));
    return mergeGeos(parts);
  });
  D.saltpan_windpump = {
    desc: 'The brine wind pump (landmark): 9 m four-legged galvanised lattice tower on concrete footings with girts, X-bracing and a ladder, a timber work platform with a rail at the top, the geared head on its turntable, an 18-blade 3.7 m windwheel turning to face +Z, a faded red tail vane lettered SALTPAN on a braced boom, the pump rod down the middle to a cast-iron pump head feeding a brine launder. Feet + pump collide.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const Ht = 9.0, b0 = 1.3, b1 = 0.34, stl = '#9aa2a6', stlDk = '#72797d';
      const half = (y) => b0 + ((b1 - b0) * y) / Ht;
      // footings
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        B.box('paint', '#c9c3b6', 0.5, 0.26, 0.5, sx * b0, 0.13, sz * b0, { r: 0.03 });
        for (const k of [-1, 1]) B.cyl(NS('metal'), K.iron, 0.018, 0.05, sx * b0 + k * 0.12, 0.28, sz * b0, { seg: 5 });
      }
      // legs (angle sections: two plates each)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const a = [sx * b0, 0.26, sz * b0], b = [sx * b1, Ht, sz * b1];
        pbeam(B, 'metal', stl, [a[0] - sx * 0.03, a[1], a[2]], [b[0] - sx * 0.03, b[1], b[2]], 0.02, 0.1);
        pbeam(B, 'metal', stl, [a[0], a[1], a[2] - sz * 0.03], [b[0], b[1], b[2] - sz * 0.03], 0.1, 0.02);
      }
      // girts + X bracing
      const lv = [0.5, 2.5, 4.4, 6.1, 7.6, Ht - 0.1];
      for (let i = 0; i < lv.length; i++) {
        const y = lv[i], s = half(y);
        for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
          pbeam(B, 'metal', stlDk, [ax * s, y, az * s], [bx * s, y, bz * s], 0.06, 0.05);
          if (i + 1 < lv.length) {
            const y2 = lv[i + 1], s2 = half(y2);
            rodT(B, NS('metal'), stlDk, P3(ax * s, y + 0.04, az * s), P3(bx * s2, y2 - 0.04, bz * s2), 0.011, 3);
            rodT(B, NS('metal'), stlDk, P3(bx * s, y + 0.04, bz * s), P3(ax * s2, y2 - 0.04, az * s2), 0.011, 3);
          }
        }
      }
      // work lamps on two legs, lighting the staging at dusk
      for (const [sx, sz] of [[1, 1], [-1, -1]]) {
        const y = 3.1, s = half(y);
        B.push(sx * s, y, sz * s, Math.atan2(sx, sz));
        B.box('metal', K.iron, 0.12, 0.12, 0.1, 0, 0, 0.08, { r: 0.015 });
        B.cyl('metal', '#2f5a4e', 0.13, 0.12, 0, -0.05, 0.22, { seg: 10 });
        B.cyl('glow', K.lamp, 0.1, 0.01, 0, -0.115, 0.22, { seg: 10, glow: 1.8 });
        B.pop();
      }
      // the braced bottom bay of the tower is see-through: a rail on each face keeps kids out of the lattice (not up on
      // the Tower Command trestle, `raised`: nobody walks up there)
      if (!o.raised) for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) railCols(B, [ax * 1.2, 0, az * 1.2], [bx * 1.2, 0, bz * 1.2], 2.4, 0.16, 99);
      // ladder up the -X face
      for (const k of [-0.2, 0.2]) pbeam(B, NS('metal'), stlDk, [-half(0.3) - 0.05, 0.3, k], [-half(Ht) - 0.05, Ht, k], 0.03, 0.03);
      for (let y = 0.6; y < Ht; y += 0.32) pbox(B, NS('metal'), stlDk, 0.025, 0.025, 0.4, -half(y) - 0.05, y, 0);
      // top platform + rail
      B.box('wood', K.timberDk, 1.6, 0.07, 1.6, 0, Ht + 0.035, 0, { r: 0.01 });
      for (const [x, z] of [[-0.78, -0.78], [0.78, -0.78], [0.78, 0.78], [-0.78, 0.78]]) pbox(B, NS('metal'), stlDk, 0.03, 0.75, 0.03, x, Ht + 0.43, z);
      for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) pbeam(B, NS('metal'), stlDk, [ax * 0.78, Ht + 0.8, az * 0.78], [bx * 0.78, Ht + 0.8, bz * 0.78], 0.03, 0.03);
      // head: turntable, gearbox, hub shaft, wheel (spinner)
      const hy = Ht + 0.62;
      B.cyl('metal', K.iron, 0.28, 0.12, 0, Ht + 0.13, 0, { seg: 14 });
      B.box('gloss', '#5b6d78', 0.46, 0.42, 0.9, 0, hy, 0.02, { round: true, r: 0.1 });
      B.cyl('metal', K.iron, 0.07, 0.5, 0, hy + 0.02, 0.55, { rx: HP, seg: 8 });
      B.spin('saltpan_wheel', 0, hy + 0.02, 0.84, { rx: HP, speed: 1.4 });
      B.cyl('metal', K.iron, 0.012, 0.35, 0, hy + 0.4, -0.1, { seg: 4 }); B.blink('#ff3b2a', 0, hy + 0.62, -0.1, { size: 0.06, rate: 0.5, lo: 0.3, hi: 4 });
      // tail vane on a braced boom (behind the head, -Z)
      beam(B, 'metal', stlDk, [0, hy + 0.05, -0.3], [0, hy + 0.3, -2.4], 0.07, 0.07);
      rodT(B, NS('metal'), stlDk, P3(0, hy + 0.6, -0.2), P3(0, hy + 0.35, -2.2), 0.012, 3);
      rodT(B, NS('metal'), stlDk, P3(0, hy - 0.2, -0.2), P3(0, hy + 0.25, -2.2), 0.012, 3);
      B.add('paint', tpl('vane', () => extrudeGeo([[-0.9, -0.55], [0.35, -0.3], [0.35, 0.55], [-0.9, 0.7]], 0.04, 0.008)), K.oxide, 0, hy + 0.35, -2.55, {});
      for (const f of [1, -1]) { B.push(f * 0.023, hy + 0.3, -2.75, f > 0 ? HP : -HP); letters(B, 'SALTPAN', { h: 0.2, x: 0, y: -0.05, z: 0, c: K.cream, flat: true, wt: 0.2, track: 0.1 }); B.pop(); }
      // pump rod + guides down the middle, pump head at the base
      B.cyl('metal', K.galv, 0.022, Ht - 0.6, 0, 0.6 + (Ht - 0.6) / 2, 0, { seg: 5 });
      for (const y of [2.5, 4.4, 6.1, 7.6]) { const s = half(y); pbeam(B, NS('metal'), stlDk, [-s, y + 0.05, 0], [s, y + 0.05, 0], 0.04, 0.04); }
      B.lathe('metal', '#3f4e57', [[0, 0], [0.22, 0], [0.22, 0.08], [0.13, 0.12], [0.12, 0.62], [0.16, 0.66], [0.16, 0.74], [0, 0.76]], 0, 0, 0, { seg: 12 });
      B.tube('metal', '#3f4e57', [P3(0.1, 0.5, 0), P3(0.45, 0.52, 0), P3(0.62, 0.42, 0)], 0.055, { radial: 7 });
      B.col(-0.3, 0, -0.3, 0.3, 0.9, 0.3);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.col(sx * b0 - 0.28, 0, sz * b0 - 0.28, sx * b0 + 0.28, 1.4, sz * b0 + 0.28, { roof: true });
      B.blob(3.4, 3.4);
    },
  };
  // Tower Command: the wind pump raised on a timber trestle over the staging, so the tower starts underneath it and rolls
  // out (its track leaves the centre +Z, then runs out along the ±X boardwalks). Stage-centre coordinates (place at
  // [0, 0.08, 0], mirror: false). Two braced bents stand at the staging's ±Z edges (x ±1.25, z ±3.2) — clear of the
  // tower's sweep — and carry two stringers along Z with a plank deck in the middle; the pump stands on the stringers.
  // Everything over the tower is ≥ 4.0 m up: the stringers' undersides (the tower needs TOWER_HEAD, 3.72 m, over its
  // base; the caps are lower but stand outside its sweep).
  D.saltpan_trestle = {
    desc: 'Wind-pump trestle (Tower Command): two tarred timber bents (posts, cap beam, X-bracing, knee braces, iron straps) at z ±3.2, two stringers along Z and a plank deck at `top` (4.3 m) carrying the brine wind pump (raised), work lamps under the caps. Posts, caps, stringers and deck collide (roof); the bracing is a rail.',
    params: { top: 'deck top m (4.3; the caps 0.55 and the stringers 0.3 below it)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const T = o.top ?? 4.3, px = 1.25, pz = 3.2, capY = T - 0.55, sY = T - 0.3, tb = K.timberDk;
      for (const sz of [-1, 1]) {
        const z = sz * pz;
        // posts: tarred, salt-crusted feet, iron straps
        for (const sx of [-1, 1]) {
          const x = sx * px;
          B.box('wood', shade(K.tar, sx * sz > 0 ? 1.05 : 1.2), 0.28, capY, 0.28, x, capY / 2, z, { r: 0.03 });
          pbox(B, NS('paint'), K.salt, 0.3, 0.08, 0.3, x, 0.04, z);
          for (const y of [0.9, capY / 2 + 0.4, capY - 0.75]) pbox(B, NS('metal'), K.rustDk, 0.3, 0.06, 0.3, x, y, z);
          B.col(x - 0.14, 0, z - 0.14, x + 0.14, capY, z + 0.14, { roof: true });
          // knee brace post → cap (in the bent's plane)
          beam(B, 'wood', tb, [x, capY - 0.75, z], [x * 0.45, capY - 0.02, z], 0.14, 0.12);
        }
        // cap beam
        B.box('wood', tb, px * 2 + 0.5, sY - capY, 0.32, 0, (capY + sY) / 2, z, { r: 0.025 });
        B.col(-px - 0.25, capY, z - 0.16, px + 0.25, sY, z + 0.16, { roof: true });
        // X-bracing + a low tie between the posts (the brace plane is a rail: kids can't walk through the bent)
        beam(B, 'wood', K.timberOld, [-px + 0.1, 0.35, z + sz * 0.16], [px - 0.1, capY - 0.35, z + sz * 0.16], 0.1, 0.08);
        beam(B, 'wood', K.timberOld, [px - 0.1, 0.35, z - sz * 0.16], [-px + 0.1, capY - 0.35, z - sz * 0.16], 0.1, 0.08);
        pbox(B, 'wood', K.timberOld, px * 2, 0.16, 0.08, 0, 0.45, z + sz * 0.16);
        B.col(-px + 0.14, 0, z - 0.2, px - 0.14, capY, z + 0.2, { rail: true });
        // a work lamp under the cap, lighting the tower's start at dusk
        dishLamp(B, 0, capY - 0.12, z - sz * 0.05, 0.2);
      }
      // stringers along Z on the caps, cross joists + a plank deck in the middle under the pump
      for (const sx of [-1, 1]) {
        B.box('wood', tb, 0.28, T - sY, pz * 2 + 0.5, sx * px, (sY + T) / 2, 0, { r: 0.025 });
        for (const z of [-pz, -1.3, 1.3, pz]) pbox(B, NS('metal'), K.rustDk, 0.3, T - sY + 0.02, 0.06, sx * px, (sY + T) / 2, z);
        B.col(sx * px - 0.14, sY, -pz - 0.25, sx * px + 0.14, T, pz + 0.25, { roof: true });
      }
      for (const z of [-1.5, -0.5, 0.5, 1.5]) pbox(B, 'wood', K.timberOld, px * 2 - 0.28, 0.2, 0.14, 0, sY + 0.12, z);
      for (let k = 0; k < 11; k++) pbox(B, 'wood', shade(K.timber, 0.92 + (k % 3) * 0.05), px * 2 - 0.28, 0.06, 0.29, 0, T - 0.03, -1.6 + 0.16 + k * 0.29);
      B.col(-px + 0.14, T - 0.08, -1.62, px - 0.14, T, 1.62, { roof: true });
      // the pump man's ladder up the outside of the +Z bent (clear of the tower's sweep)
      for (const k of [-0.2, 0.2]) pbox(B, NS('metal'), K.iron, 0.04, T + 0.9, 0.04, -px + 0.45 + k, (T + 0.9) / 2, pz + 0.3);
      for (let y = 0.3; y < T + 0.6; y += 0.3) pbox(B, NS('metal'), K.iron, 0.4, 0.025, 0.025, -px + 0.45, y, pz + 0.3);
      for (const k of [-0.2, 0.2]) pbox(B, NS('metal'), K.iron, 0.04, 0.04, 0.2, -px + 0.45 + k, 2.2, pz + 0.2);
      B.blob(3.2, 7.4);
      // the pump itself on the stringers (its bottom-bay rails stay off: nobody walks up here)
      sub(B, 'saltpan_windpump', 0, T, 0, 0, { raised: true });
    },
  };

  // brine launder: open timber trough on trestles along +X (top rim at `height`), fed by the pump
  D.saltpan_launder = {
    desc: 'Brine launder: an open timber trough (0.4 m wide) on trestles along local +X at rim height `height`, pink brine inside, drips of salt crust on the outside, a spout at the far end. Collides.',
    params: { length: 'm (4)', height: 'rim m (0.9)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 4, Hh = o.height ?? 0.9, n = Math.max(1, Math.round(L / 1.8));
      B.box('wood', K.timberDk, L, 0.05, 0.42, L / 2, Hh - 0.3, 0, { r: 0.01 });
      for (const sz of [-0.19, 0.19]) B.box('wood', K.timberDk, L, 0.3, 0.05, L / 2, Hh - 0.15, sz, { r: 0.01 });
      pbox(B, NS('gloss'), '#d9a9a6', L - 0.04, 0.01, 0.33, L / 2, Hh - 0.08, 0);
      pbox(B, NS('paint'), K.salt, L, 0.05, 0.44, L / 2, Hh - 0.3, 0);
      for (let i = 0; i <= n; i++) {
        const x = 0.15 + (i / n) * (L - 0.3);
        for (const sz of [-0.28, 0.28]) beam(B, 'wood', K.timberOld, [x, 0, sz * 1.3], [x, Hh - 0.32, sz * 0.8], 0.08, 0.08);
        pbox(B, NS('wood'), K.timberOld, 0.08, 0.08, 0.7, x, Hh - 0.36, 0);
      }
      B.box('wood', K.timberDk, 0.3, 0.05, 0.3, L + 0.1, Hh - 0.33, 0, { r: 0.01, rz: -0.35 });
      B.col(0, 0, -0.3, L, Hh, 0.3);
    },
  };
  D.saltpan_tank = {
    desc: 'Brine header tank: corrugated-iron round tank (1.9 m) with a conical lid and hatch on a timber stand (1.2 m), outlet pipe and valve wheel, a ladder, salt-crusted drips. Collides (roof-flagged: nobody stands on the tank).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const R = 0.95, y0 = 1.25, Ht = 1.3;
      for (const sx of [-0.7, 0.7]) for (const sz of [-0.7, 0.7]) B.box('wood', K.timberDk, 0.16, y0, 0.16, sx, y0 / 2, sz, { r: 0.02 });
      for (const sx of [-0.7, 0.7]) { pbeam(B, NS('wood'), K.timberOld, [sx, 0.15, -0.7], [sx, y0 - 0.15, 0.7], 0.06, 0.1); pbeam(B, NS('wood'), K.timberOld, [-0.7, 0.15, sx], [0.7, y0 - 0.15, sx], 0.1, 0.06); }
      B.box('wood', K.timberDk, 1.9, 0.1, 1.9, 0, y0 - 0.05, 0, { r: 0.02 });
      const prof = [[0, y0], [R, y0]];
      for (let k = 0; k <= 12; k++) prof.push([R + 0.025 * Math.cos(k * PI), y0 + (k / 12) * Ht]);
      prof.push([R + 0.03, y0 + Ht], [0.2, y0 + Ht + 0.32], [0, y0 + Ht + 0.34]);
      B.lathe('metal', '#9aa3a6', prof, 0, 0, 0, { seg: 18 });
      for (const y of [0.1, 0.65, 1.2]) B.tor(NS('metal'), K.rustDk, R + 0.035, 0.012, 0, y0 + y, 0, { rx: HP, rs: 3, ts: 24 });
      B.box('metal', '#8b9397', 0.35, 0.06, 0.35, 0.35, y0 + Ht + 0.2, 0, { r: 0.01, rz: -0.33 });
      B.tube('metal', K.iron, [P3(0, y0 + 0.1, R - 0.1), P3(0, y0 - 0.2, R + 0.1), P3(0, 0.6, R + 0.25), P3(0, 0.25, R + 0.3)], 0.05, { radial: 7 });
      B.tor(NS('metal'), K.red, 0.1, 0.012, 0.12, 0.8, R + 0.28, { ry: HP, rs: 3, ts: 12 });
      for (const k of [-0.18, 0.18]) pbeam(B, NS('metal'), K.iron, [-R - 0.1, 0.0, k], [-R - 0.05, y0 + Ht + 0.1, k], 0.03, 0.03);
      for (let y = 0.3; y < y0 + Ht; y += 0.3) pbox(B, NS('metal'), K.iron, 0.03, 0.02, 0.36, -R - 0.08, y, 0);
      B.col(-1.0, 0, -1.0, 1.0, y0 + Ht + 0.3, 1.0, { roof: true }); B.blob(2.4, 2.4);   // (nobody stands on the tank)
    },
  };

  // ------------------------------------------------------------------------------------------ conveyor gantry
  // Built in Alpha-half stage coordinates (place at pos [0,0,0], rotY 0; the mirror copy dresses Bravo's).
  // Level pieces it dresses: catwalk x 20…22.6 / z -26…-13 / top 3.6, head platform x 16…22.6 / z -13…-9.5,
  // incline 2.6 wide from (21.3, 0, -35.6) up to (21.3, 3.6, -26), hopper block x 19.2…23.2 / z -39.8…-36.8 / 1.4.
  const yInc = (z) => (3.6 * (z + 35.6)) / 9.6;
  function beltRun(B, z0, y0, z1, y1, x) {
    // troughed belt along Z from (z0, y0) to (z1, y1) (belt surface heights), frame stringers, idlers every 1.2 m
    const L = Math.hypot(z1 - z0, y1 - y0), a = Math.atan2(y1 - y0, z1 - z0), n = Math.max(1, Math.round(L / 1.2));
    B.push(x, (y0 + y1) / 2, (z0 + z1) / 2, 0, -a);
    for (const sx of [-0.36, 0.36]) pbox(B, 'metal', '#6d7478', 0.06, 0.16, L, sx, -0.12, 0);
    pbox(B, 'rubber', '#2d2f33', 0.34, 0.02, L, 0, 0, 0);
    for (const sx of [-1, 1]) pbox(B, 'rubber', '#2d2f33', 0.2, 0.02, L, sx * 0.26, 0.05, 0, { rz: sx * 0.5 });
    B.add('rubber', moundGeo(Math.max(1, L - 0.3), 0.36, 0.07, 3), 'white', 0, 0.0, 0, { ry: HP });
    for (let i = 0; i <= n; i++) {
      const z = -L / 2 + 0.1 + (i / n) * (L - 0.2);
      B.cyl(NS('metal'), K.galvDk, 0.045, 0.3, 0, -0.05, z, { rz: HP, seg: 6 });
      for (const sx of [-1, 1]) B.cyl(NS('metal'), K.galvDk, 0.045, 0.22, sx * 0.25, 0.02, z, { rz: HP - sx * 0.5, seg: 6 });
      pbox(B, NS('metal'), '#6d7478', 0.8, 0.04, 0.05, 0, -0.1, z);
    }
    B.pop();
  }
  D.saltpan_gantry = {
    desc: 'Conveyor gantry feeding the salt heap (stage coordinates, place at the origin): lattice trestle bents under the catwalk, head platform and incline, troughed belt carrying salt from the tail hopper up the incline and along the catwalk to the head drum, discharge chute with a salt stream onto the heap ridge, corrugated drive house on the head platform, galvanised handrails, hopper funnel with a grizzly. Legs, belt frame, drive house and funnel collide.',
    params: { headBent: 'z of the open bent under the head platform (-9.8)', headEdge: 'z of the head platform\'s mid edge (-9.5; layout.js gantry-head)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = 0;
      const stl = '#8e979b', stlDk = '#6d7478', rail = '#b4babf';
      // (Tower Command cuts the head platform's mid edge back, `headEdge`: its edge stringer and handrail come with it)
      const dE = (o.headEdge ?? -9.5) + 9.5;
      const bent = (z, xs, top, foot = 0, open = false) => {
        for (const x of xs) {
          B.box('metal', stl, 0.16, top - foot, 0.16, x, foot + (top - foot) / 2, z, { r: 0.02 });
          for (const k of [-1, 1]) pbox(B, NS('metal'), stlDk, 0.03, top - foot, 0.03, x + k * 0.09, foot + (top - foot) / 2, z + 0.09);
          pbox(B, NS('metal'), K.iron, 0.34, 0.03, 0.34, x, 0.015, z);
          B.col(x - 0.11, 0, z - 0.11, x + 0.11, top, z + 0.11);
        }
        pbox(B, 'metal', stlDk, xs[xs.length - 1] - xs[0] + 0.3, 0.18, 0.16, (xs[0] + xs[xs.length - 1]) / 2, top - 0.1, z);
        for (let i = 0; i + 1 < xs.length; i++) {
          const x0 = xs[i], x1 = xs[i + 1], ym = foot + (top - foot) * 0.5;
          if (top - foot > 1.6 && !open) { rodT(B, NS('metal'), stlDk, P3(x0, foot + 0.3, z), P3(x1, top - 0.25, z), 0.018, 4); rodT(B, NS('metal'), stlDk, P3(x1, foot + 0.3, z), P3(x0, top - 0.25, z), 0.018, 4); }
          pbeam(B, NS('metal'), stlDk, [x0, ym, z], [x1, ym, z], 0.06, 0.06);
        }
      };
      for (const z of [-25.7, -21.4, -17.2, -13.3]) bent(z, [20.2, 22.3], 3.35);
      // the open bent under the head platform's mid edge (Tower Command moves it back, `headBent`, so the tower's
      // track along the dyke below passes its legs)
      bent(o.headBent ?? -9.8, [16.3, 19.3, 22.2], 3.35, 0, true);
      for (const x of [16.3, 19.3]) { B.box('metal', stl, 0.16, 3.35, 0.16, x, 1.675, -12.75, { r: 0.02 }); B.col(x - 0.11, 0, -12.86, x + 0.11, 3.35, -12.64); }
      for (const z of [-33.2, -29.8]) bent(z, [20.2, 22.3], yInc(z) - 0.28);
      // the strip under the catwalk + incline is closed off by longitudinal X-bracing between the bents (colliders keep
      // players / bots out of the gap under the deck)
      const zs = [-35.2, -33.2, -29.8, -25.7, -21.4, -17.2, -13.3];
      for (const x of [20.2, 22.3]) {
        for (let i = 0; i + 1 < zs.length; i++) {
          const za = zs[i], zb2 = zs[i + 1], ta = Math.min(3.25, yInc(za) - 0.32), tb = Math.min(3.25, yInc(zb2) - 0.32), foot = x < 21 ? heapY(x) : 0;
          if (tb < 0.9) continue;
          const f0 = zb2 > -25 ? Math.max(0.1, foot) : 0.1;
          if (ta > f0 + 0.6) { rodT(B, NS('metal'), stlDk, P3(x, f0, za + 0.1), P3(x, tb - 0.05, zb2 - 0.1), 0.02, 4); rodT(B, NS('metal'), stlDk, P3(x, f0, zb2 - 0.1), P3(x, ta - 0.05, za + 0.1), 0.02, 4); }
        }
        for (let z = -31.8; z < -13.31;) {
          const z2 = Math.min(-13.3, z + (z < -26 ? 0.9 : 4.3));
          B.col(x - 0.08, 0, z, x + 0.08, Math.min(3.25, yInc(z) - 0.32), z2, { rail: true });
          z = z2;
        }
      }
      B.col(20.2, 0, -13.42, 22.3, 3.25, -13.18, { rail: true });
      rodT(B, NS('metal'), stlDk, P3(20.2, 0.2, -13.3), P3(22.3, 3.1, -13.3), 0.02, 4); rodT(B, NS('metal'), stlDk, P3(22.3, 0.2, -13.3), P3(20.2, 3.1, -13.3), 0.02, 4);
      // longitudinal stringers under the catwalk / head
      for (const x of [20.15, 22.3]) pbox(B, 'metal', stlDk, 0.1, 0.24, 13.2, x, 3.22, -19.5);
      for (const z of [-12.9, -9.6 + dE]) pbox(B, 'metal', stlDk, 6.45, 0.24, 0.1, 19.22, 3.22, z);
      for (const x of [20.15, 22.3]) { B.push(x, yInc(-30.8) - 0.3, -30.8, 0, -Math.atan2(3.6, 9.6)); pbox(B, 'metal', stlDk, 0.1, 0.22, 10.2, 0, 0, 0); B.pop(); }
      // handrails: outer edge of incline + catwalk + head platform (north + east)
      const railRun = (pts) => {
        for (const p of pts) { B.cyl('metal', rail, 0.022, 1.0, p[0], p[1] + 0.5, p[2], { seg: 6 }); }
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1];
          rodT(B, 'metal', rail, P3(a[0], a[1] + 1.0, a[2]), P3(b[0], b[1] + 1.0, b[2]), 0.022, 6);
          rodT(B, NS('metal'), rail, P3(a[0], a[1] + 0.5, a[2]), P3(b[0], b[1] + 0.5, b[2]), 0.014, 4);
          pbeam(B, NS('metal'), stlDk, [a[0], a[1] + 0.06, a[2]], [b[0], b[1] + 0.06, b[2]], 0.02, 0.1);
          railCols(B, a, b, 1.05, 0.12, Math.abs(b[1] - a[1]) > 0.01 ? 0.6 : 99);
        }
      };
      const inc = []; for (let z = -35.2; z <= -26.05; z += 1.53) inc.push([22.36, yInc(z), z]);
      inc.push([22.36, 3.6, -26]);
      const cw = []; for (let z = -26; z <= -9.7 + dE; z += 1.63) cw.push([22.36, 3.6, z]);
      cw.push([22.36, 3.6, -9.62 + dE]);
      railRun([...inc, ...cw.slice(1)]);
      for (const p of [...inc.filter((_, i) => i % 2), ...cw.filter((_, i) => i % 3 === 1)]) {
        pbox(B, NS('metal'), K.iron, 0.1, 0.14, 0.08, p[0] - 0.06, p[1] + 0.82, p[2]);
        B.box('glow', K.lamp, 0.02, 0.09, 0.09, p[0] - 0.115, p[1] + 0.82, p[2], { r: 0.01, glow: 1.6 });
      }
      railRun([[22.36, 3.6, -9.62 + dE], [20.8, 3.6, -9.62 + dE], [19.3, 3.6, -9.62 + dE]]);
      // belt: hopper tail → incline → catwalk → head drum
      beltRun(B, -36.4, 1.05, -26.2, 4.18, 20.45);
      beltRun(B, -26.2, 4.18, -14.2, 4.18, 20.45);
      for (let z = -25; z < -14; z += 1.5) for (const sx of [-0.36, 0.36]) pbox(B, NS('metal'), stlDk, 0.05, 0.45, 0.05, 20.45 + sx, 3.83, z);
      for (let k = 0; k < 6; k++) { const z = -35.6 + k * 1.75, yb = 1.05 + ((z + 36.4) / 10.2) * 3.13; for (const sx of [-0.36, 0.36]) pbox(B, NS('metal'), stlDk, 0.05, Math.max(0.2, yb - yInc(z) - 0.1), 0.05, 20.45 + sx, (yb + yInc(z)) / 2 - 0.08, z); }
      B.col(20.05, 3.6, -26.2, 20.85, 4.36, -14.0, { roof: true });
      for (let k = 0; k < 5; k++) { const z0 = -35.6 + k * 1.92, z1 = z0 + 1.92; B.col(20.05, Math.max(0, yInc(z0)), z0, 20.85, 1.2 + ((z1 + 36.4) / 10.2) * 3.13, z1, { roof: true }); }
      // head drum + chute + salt stream onto the ridge
      B.cyl('metal', K.iron, 0.26, 0.82, 20.45, 4.05, -14.05, { rz: HP, seg: 12 });
      pbox(B, 'metal', stlDk, 1.0, 0.7, 0.9, 20.45, 3.95, -13.7);
      B.push(19.3, 3.9, -14.55, 0, 0, -0.32);
      pbox(B, 'metal', '#7b8387', 2.1, 0.04, 0.55, 0, 0, 0);
      for (const sz of [-0.27, 0.27]) pbox(B, 'metal', '#7b8387', 2.1, 0.3, 0.04, 0, 0.14, sz);
      B.pop();
      B.tube(NS('rubber'), K.salt, [P3(18.25, 3.55, -14.55), P3(18.0, 3.1, -14.6), P3(17.85, 2.55, -14.62)], 0.09, { radial: 6 });
      mound(B, 2.2, 1.6, 0.5, 17.6, 1.95, -14.9, { seed: 4, ry: HP });
      // drive house on the head platform
      const dh = { x: 21.75, z: -11.9 };
      B.box('paint', '#8c9599', 1.5, 1.9, 1.8, dh.x, 3.6 + 0.95, dh.z, { r: 0.02 });
      for (let k = -6; k <= 6; k++) pbox(B, NS('paint'), '#7c8589', 0.03, 1.9, 1.82, dh.x + k * 0.11, 4.55, dh.z);
      B.box('paint', K.roof, 1.8, 0.08, 2.1, dh.x, 5.55, dh.z, { r: 0.01, rz: 0.12 });
      ledgedDoorOn(B, dh.x - 0.76, 3.6, dh.z, -HP, 0.8, 1.7, '#6f8583');
      B.push(dh.x, 3.6, dh.z + 0.91, 0); letters(B, 'DANGER', { h: 0.1, x: 0, y: 1.45, z: 0.005, c: K.red, flat: true, wt: 0.22 }); B.pop();
      B.col(dh.x - 0.75, 3.6, dh.z - 0.9, dh.x + 0.75, 5.5, dh.z + 0.9, { roof: true });
      B.blink('#ff3b2a', dh.x, 5.7, dh.z, { size: 0.055, rate: 0.5, phase: 1.3, lo: 0.3, hi: 4 });
      B.push(dh.x - 0.76, 5.05, dh.z + 0.45, -HP); D.saltpan_lamp.build(B, { variant: 1 }); B.pop(); B.aoBase = 0;
      // tail: hopper funnel + grizzly on the hopper block
      const hx = 21.2, hz = -38.3;
      for (const [w, d, x, z, rx, rz] of [[4.2, 0.08, hx, hz - 1.35, -0.55, 0], [4.2, 0.08, hx, hz + 1.35, 0.55, 0], [0.08, 3.0, hx - 1.85, hz, 0, 0.5], [0.08, 3.0, hx + 1.85, hz, 0, -0.5]]) pbox(B, 'metal', '#7f878b', w, 1.05, d, x, 1.95, z, { rx, rz });
      for (let k = -4; k <= 4; k++) pbox(B, NS('metal'), K.iron, 0.05, 0.06, 3.1, hx + k * 0.44, 2.46, hz);
      pbox(B, 'metal', stlDk, 4.4, 0.1, 0.1, hx, 2.47, hz - 1.6); pbox(B, 'metal', stlDk, 4.4, 0.1, 0.1, hx, 2.47, hz + 1.6);
      B.col(hx - 2.05, 1.4, hz - 1.55, hx + 2.05, 2.5, hz + 1.55, { roof: true });
      B.cyl('metal', K.iron, 0.2, 0.82, 20.45, 1.05, -36.45, { rz: HP, seg: 12 });
    },
  };
  // door leaf on a side wall: frame at x,z facing ry
  function ledgedDoorOn(B, x, y, z, ry, w, h, c) { B.push(x, y, z, ry); ledgedDoor(B, 0, 0, w, h, c); B.pop(); }

  // ------------------------------------------------------------------------------------------ the salt heap
  // Heap (stage coordinates, place at the origin): ridge x 17.5 / y 2.4 from z -25 to -13, slopes to x 11.8 and 23.2.
  const heapY = (x) => Math.max(0, 2.4 * (1 - Math.abs(x - 17.5) / 5.7));
  D.saltpan_heap = {
    desc: 'Salt heap dressing (stage coordinates, place at the origin): timber heap-board bulkhead with posts across the back end, the working face at the mid end with a fall of loose salt and a shovel, crumbly salt lumps softening both toes, a rounded crest along the ridge. Bulkhead + salt fall collide.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const zb = -25;
      for (const x of [12.3, 14.6, 17.5, 20.4, 22.7]) {
        const h = heapY(x) + 0.35;
        B.box('wood', shade(K.tar, 1.4), 0.2, h, 0.2, x, h / 2, zb - 0.17, { r: 0.025 });
        beam(B, 'wood', K.timberOld, [x, 0.02, zb - 1.3], [x, h * 0.7, zb - 0.28], 0.13, 0.13);
      }
      for (let k = 0; ; k++) {
        const y = 0.12 + k * 0.24, need = y + 0.14;
        if (need > 2.45) break;
        const hw = 5.7 * (1 - need / 2.4) + 0.12;
        B.box('wood', shade(K.timber, B.r(0.82, 1.05)), hw * 2, 0.22, 0.06, 17.5, y, zb - 0.04, { r: 0.012 });
      }
      for (let i = 0; i < 10; i++) { const x0 = 11.8 + i * 1.14, x1 = x0 + 1.14, h = Math.min(heapY(x0), heapY(x1)) + 0.12; B.col(x0, 0, zb - 0.25, x1, h, zb); }
      // working face at the mid end: a fall of loose salt, shovels
      mound(B, 8.4, 1.5, 0.28, 17.5, 0, -12.45, { seed: 5 });
      for (const [x, z, r] of [[15.2, -11.6, 0.3], [18.9, -11.3, 0.4], [20.4, -11.9, 0.25], [16.8, -10.9, 0.2]]) mound(B, r * 2, r * 1.6, r * 0.5, x, 0, z, { seed: Math.floor(x) % 7, ry: x });
      // the tarp over the back half: rolled-back edge across the heap, creases, tyres holding it down
      const th = Math.atan2(2.4, 5.7), roll = [];
      for (let x = 11.95; x <= 23.06; x += 0.37) roll.push(P3(x, heapY(x) + 0.13, -19.05 + 0.05 * Math.sin(x * 2.1)));
      B.tube('rubber', '#4f5955', roll, 0.15, { radial: 7 });
      for (const z of [-23.6, -21.3]) for (const s2 of [-1, 1]) { const pts = []; for (let t = 0; t <= 5; t++) { const x = 17.5 + s2 * (0.3 + t * 1.05); pts.push(P3(x, heapY(x) + 0.02, z + Math.sin(t * 1.3 + z) * 0.25)); } B.tube(NS('rubber'), '#56605c', pts, 0.035, { radial: 4 }); }
      for (const [x, z] of [[13.4, -24.1], [15.6, -22.8], [13.9, -20.6], [16.2, -24.4], [19.3, -23.9], [21.4, -22.6], [19.0, -20.9], [21.9, -24.6], [17.5, -22.2], [15.1, -20.1], [20.6, -20.4]]) {
        const s2 = x < 17.5 ? 1 : x > 17.5 ? -1 : 0;
        B.lathe('rubber', '#2d2e31', H.TIRE, x, heapY(x) + 0.09, z, { seg: 12, closed: true, rz: s2 * th });
      }
      for (let x = 12.2; x < 23; x += 1.4) if (Math.abs(x - 17.5) > 0.8) B.lathe(NS('rubber'), '#2d2e31', H.TIRE, x, 0.1, -25.3 + (x % 2) * 0.1, { seg: 10, closed: true });
      // toe lumps + crest
      for (let z = -18.6; z < -13.4; z += 1.35) {
        mound(B, 0.9, 0.7, 0.18, 11.85 + B.r(-0.1, 0.1), 0, z + B.r(-0.3, 0.3), { seed: Math.floor(B.r(0, 7)), ry: B.r(0, PI) });
        mound(B, 0.9, 0.7, 0.18, 23.15 + B.r(-0.1, 0.1), 0, z + B.r(-0.3, 0.3), { seed: Math.floor(B.r(0, 7)), ry: B.r(0, PI) });
      }
      mound(B, 5.6, 0.9, 0.12, 17.5, 2.3, -16.1, { seed: 6, ry: HP });
      for (const [x, z, r] of [[14.4, -17.8, 0.45], [20.3, -15.2, 0.5], [15.8, -14.3, 0.35], [21.2, -17.6, 0.4], [13.1, -15.9, 0.3]]) mound(B, r * 1.6, r * 1.2, r * 0.3, x, heapY(x) - 0.05, z, { seed: Math.floor(x * 3) % 7, ry: x });
    },
  };

  // ------------------------------------------------------------------------------------------ packing shed
  // Stage coordinates (place at the origin). Shed block x -26…-15 / z -25…-18 / walls 3.2, corrugated roof ridge 4.2
  // at z -21.5 (ridge along X), loading dock x -26…-16 / z -18…-15.4 / 1.1, loft stair x -17.9…-16.1 from (0, -33)
  // up to (3.2, -25), dock steps x -24.9…-23.1 from (0, -12.6) up to (1.1, -15.4).
  D.saltpan_shed = {
    desc: 'Packing-shed dressing (stage coordinates, place at the origin): corner boards, tarred plinth, sliding ledged doors onto the loading dock (one open on a dark interior of sacks), four-pane windows, eaves overhangs with fascias, gutters and downpipes, barge boards, galvanised ridge roll, two roof ventilators (collide), PACKING SHED board and a louvred vent on the gable, loft-stair stringers, posts and handrail, dock nosing and rubbing posts, dock-step rails. zones: true = the Zone Control front (layout.js shed-stair + shed-landing): the facade stair and landing dressed (stringer, posts, handrail + rail colliders), the second door, window and wall lamp moved out of the stair\'s way.',
    params: { zones: 'bool: the Zone Control front (facade stair)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = 0;
      const ZC = !!o.zones;
      const x0 = -26, x1 = -15, zb = -25, zf = -18, Hw = 3.2, zr = -21.5, dockY = 1.1;
      const trim = K.trim, wall = K.shed;
      // corner boards + plinth
      for (const x of [x0, x1]) for (const z of [zb, zf]) B.box('paint', trim, 0.18, Hw, 0.18, x + (x === x0 ? 0.07 : -0.07), Hw / 2, z + (z === zb ? -0.07 : 0.07), { r: 0.02 });
      pbox(B, 'paint', K.tar, x1 - x0, 0.34, 0.04, (x0 + x1) / 2, 0.17, zb - 0.02);
      pbox(B, 'paint', K.tar, 0.04, 0.34, zf - zb, x1 + 0.02, 0.17, (zb + zf) / 2);
      pbox(B, 'paint', K.tar, 0.04, 0.34, zf - zb, x0 - 0.02, 0.17, (zb + zf) / 2);
      // eaves: overhang sheets following the roof plane, fascia, gutter, downpipes
      const pitch = Math.atan2(1.0, 3.5);
      // (Zone Control: the front eave stops either side of the facade stair + landing, x −23 … −16.6, so nothing hangs
      // over the treads — the stair climbs straight onto the roof edge)
      const eaveRuns = (z) => (ZC && z === zf ? [[x0 - 0.15, -23], [-16.6, x1 + 0.15]] : [[x0 - 0.15, x1 + 0.15]]);
      for (const [z, s] of [[zb, -1], [zf, 1]]) for (const [ea, eb] of eaveRuns(z)) {
        const em = (ea + eb) / 2, eL = eb - ea;
        B.push(em, Hw - 0.02, z + s * 0.2, 0, s * pitch);
        pbox(B, 'paint', K.roof, eL, 0.04, 0.44, 0, 0, 0);
        for (let x = -5.5; x <= 5.5; x += 0.3) if (Math.abs((x0 + x1) / 2 + x - em) <= eL / 2 - 0.02) pbox(B, NS('paint'), shade(K.roof, 1.12), 0.04, 0.03, 0.44, (x0 + x1) / 2 + x - em, 0.03, 0);
        B.pop();
        B.box('paint', trim, eL, 0.18, 0.04, em, Hw - 0.2, z + s * 0.42, { r: 0.01 });
        B.cyl('metal', K.galvDk, 0.07, eL, em, Hw - 0.32, z + s * 0.5, { rz: HP, seg: 8, open: true });
      }
      for (const [z, s] of [[zb, -1], [zf, 1]]) {
        for (const x of [x0 + 0.25, x1 - 0.25]) {
          const yb = z === zf ? dockY : 0;
          B.cyl('metal', K.galvDk, 0.045, Hw - 0.32 - yb, x, yb + (Hw - 0.32 - yb) / 2, z + s * 0.12, { seg: 8 });
          B.tube(NS('metal'), K.galvDk, [P3(x, Hw - 0.3, z + s * 0.5), P3(x, Hw - 0.5, z + s * 0.3), P3(x, Hw - 0.6, z + s * 0.12)], 0.045, { radial: 6 });
        }
      }
      // barge boards along the gables (following the roof line)
      for (const x of [x0 - 0.04, x1 + 0.04]) for (const s of [-1, 1]) {
        const za = zr + s * 3.5 + s * 0.35, ya = Hw - 0.1, zc = zr, yc = 4.2 + 0.06;
        pbeam(B, 'paint', trim, [x, ya, za], [x, yc, zc], 0.05, 0.22);
      }
      // ridge roll + ventilators (collide: cover on the roof)
      B.cyl('metal', K.galv, 0.09, x1 - x0, (x0 + x1) / 2, 4.2 + 0.02, zr, { rz: HP, seg: 8 });
      for (const x of [-23.4, -17.6]) {
        B.box('metal', K.galvDk, 0.6, 0.18, 0.6, x, 4.3, zr, { r: 0.02 });
        B.lathe('metal', K.galv, [[0, 0], [0.18, 0], [0.18, 0.35], [0.3, 0.42], [0.3, 0.46], [0.1, 0.62], [0, 0.64]], x, 4.36, zr, { seg: 12 });
        B.col(x - 0.32, 4.1, zr - 0.32, x + 0.32, 4.95, zr + 0.32, { roof: true });
      }
      // front (dock side, z = zf): sliding doors (A open, B closed) on a top track, window
      B.push(0, 0, zf, 0);
      pbox(B, NS('paint'), '#1f1c1a', 2.5, 1.78, 0.02, -22.2, dockY + 0.89, 0.01);
      for (let k = 0; k < 3; k++) sack(B, -22.8 + k * 0.62, dockY, 0.25, 0.1, K.sackDk, K.printBlue);
      ledgedDoor(B, -24.55, dockY, 2.3, 1.8, '#6f8583', ZC ? { track: 2.6, trackX: -0.15 } : { track: 6.0, trackX: 2.2 });
      if (!ZC) { ledgedDoor(B, -18.2, dockY, 2.3, 1.8, '#6f8583', {}); window4(B, -20.2, 1.75, 0.8, 0.9, { lit: 0.6 }); }
      B.pop();
      // back (z = zb, facing -Z): windows, a door, the loft-stair landing
      B.push(0, 0, zb, PI);
      for (const x of [23.8, 21.0]) window4(B, x, 1.35, 0.9, 0.95, {});
      ledgedDoor(B, 18.8, 0, 1.0, 2.1, '#6f8583', {});
      B.pop();
      // gables
      B.push(x1, 0, (zb + zf) / 2, HP);
      boardSign(B, 'PACKING SHED', 0, 2.62, 0, { h: 0.3, board: K.cream, c: K.oxideDk, border: K.oxideDk });
      window4(B, -2.2, 1.0, 0.8, 0.9, {});
      ledgedDoor(B, 1.9, 0, 1.0, 2.05, '#6f8583', {});
      for (let k = 0; k < 5; k++) pbox(B, NS('paint'), '#5d615d', 1.0, 0.05, 0.05, 0, 3.4 + k * 0.1, 0.05, { rx: 0.5 });
      pbox(B, 'paint', trim, 1.12, 0.6, 0.03, 0, 3.6, 0.015);
      B.pop();
      B.push(x0, 0, (zb + zf) / 2, -HP);
      window4(B, 0, 1.2, 1.2, 1.0, {});
      pbox(B, 'paint', trim, 1.12, 0.6, 0.03, 0, 3.6, 0.015);
      B.pop();
      // wall lamps over the doors (Zone Control: over the stair foot)
      B.push(0, 0, zf, 0); B.push(ZC ? -16.05 : -20.2, ZC ? 2.9 : 2.78, 0); D.saltpan_lamp.build(B, { variant: 1 }); B.pop(); B.pop();
      B.aoBase = 0;
      // Zone Control: the facade stair (dock 1.1 → eave 3.2, rising west along the wall, z −18 … −16.5) and its landing
      // (x −23 … −21.5, flush with the eave): a nosing stringer on the open side, posts, a handrail following the flight
      // and the landing's front edge (rail colliders: kids keep to the treads, squids and shots pass); the landing's west
      // end stays open (swim up its timber end wall, or hop over from the sack pallets)
      if (ZC) {
        const x0 = -16.7, x1 = -21.5, xl = -23, y0 = dockY, y1 = 3.2, ze = -16.52;
        const sy = (x) => y0 + ((y1 - y0) * (x0 - x)) / (x0 - x1);
        pbeam(B, 'wood', K.timberDk, [x0 + 0.3, y0 - 0.06, ze], [x1, y1 - 0.06, ze], 0.08, 0.16);
        pbox(B, 'wood', K.timberDk, x1 - xl, 0.16, 0.08, (x1 + xl) / 2, y1 - 0.06, ze);
        for (const x of [-17.1, -18.6, -20.1, -21.5, -23.0]) B.box('wood', K.timberDk, 0.08, 1.02, 0.08, x, (x < x1 ? y1 : sy(x)) + 0.51, ze, { r: 0.012 });
        pbeam(B, 'wood', K.timberLt, [-17.1, sy(-17.1) + 1.0, ze], [x1, y1 + 1.0, ze], 0.07, 0.07);
        pbox(B, 'wood', K.timberLt, x1 - xl + 0.04, 0.07, 0.07, (x1 + xl) / 2, y1 + 1.0, ze);
        pbeam(B, NS('wood'), K.timberOld, [-17.1, sy(-17.1) + 0.5, ze], [x1, y1 + 0.5, ze], 0.05, 0.05);
        pbox(B, NS('wood'), K.timberOld, x1 - xl, 0.05, 0.05, (x1 + xl) / 2, y1 + 0.5, ze);
        railCols(B, [-17.05, sy(-17.05), ze], [x1, y1, ze], 1.05, 0.12, 0.6);
        railCols(B, [x1, y1, ze], [xl + 0.04, y1, ze], 1.05, 0.12, 0.6);
        // tread nosings (iron strips) and the landing's corner post footing on the dock
        for (let k = 1; k < 11; k++) { const x = x0 - ((x0 - x1) * k) / 11; pbox(B, NS('metal'), K.iron, 0.04, 0.03, 1.46, x, sy(x) + 0.012, -17.25); }
        pbox(B, 'metal', K.iron, 1.5, 0.05, 0.08, (x1 + xl) / 2, y1 - 0.02, ze + 0.02);
      }
      // loft stair: stringers, posts, handrails
      const sy = (z) => (3.2 * (z + 33)) / 8;
      for (const x of [-17.95, -16.05]) {
        pbeam(B, 'wood', K.timberDk, [x, -0.08, -33.4], [x, 3.12, -25.2], 0.08, 0.34);
        for (const z of [-31.5, -29.5, -27.5]) B.box('wood', K.timberOld, 0.14, sy(z) - 0.25, 0.14, x, (sy(z) - 0.25) / 2, z, { r: 0.02 });
        for (const z of [-32.6, -30.3, -28, -25.7]) B.box('wood', K.timberDk, 0.08, 1.0, 0.08, x, sy(z) + 0.5, z, { r: 0.012 });
        pbeam(B, 'wood', K.timberLt, [x, sy(-32.6) + 1.0, -32.6], [x, sy(-25.7) + 1.0, -25.7], 0.07, 0.07);
        railCols(B, [x, sy(-32.6), -32.6], [x, sy(-25.7), -25.7], 1.05, 0.12, 0.6);
      }
      // dock: nosing, rubbing posts, step rails
      pbox(B, 'metal', K.iron, 10, 0.05, 0.08, -21, dockY - 0.02, -15.43);
      for (let x = -25.4; x < -16; x += 1.55) if (!ZC || x < -17.9) B.box('wood', K.tar, 0.16, dockY, 0.12, x, dockY / 2, -15.34, { r: 0.02 });
      for (const x of ZC ? [-24.95, -23.05, -17.85, -15.95] : [-24.95, -23.05]) {
        B.box('wood', K.timberDk, 0.08, 1.0, 0.08, x, 0.5, -12.7, { r: 0.012 });
        B.box('wood', K.timberDk, 0.08, 1.0, 0.08, x, dockY + 0.5, -15.2, { r: 0.012 });
        pbeam(B, 'wood', K.timberLt, [x, 1.0, -12.7], [x, dockY + 1.0, -15.2], 0.07, 0.07);
        railCols(B, [x, 0, -12.7], [x, dockY, -15.2], 1.05, 0.12, 0.6);
      }
    },
  };

  // jib crane on a loading dock: cast-iron post, jib reaching +Z, tie rod, chain + hook with a sack sling
  D.saltpan_crane = {
    desc: 'Hand jib crane on a loading dock: cast-iron post (3.1 m) on a bolted base, jib reaching toward local +Z with a tie rod, crab, chain and hook carrying a sling of salt sacks, winch with a crank on the post. Post collides.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.lathe('metal', '#3f4e57', [[0.28, 0], [0.28, 0.06], [0.14, 0.12], [0.1, 0.3], [0.08, 3.0], [0.12, 3.06], [0.12, 3.12], [0, 3.14]], 0, 0, 0, { seg: 12 });
      B.box('metal', '#3f4e57', 0.16, 0.2, 2.0, 0, 2.95, 0.9, { r: 0.02 });
      rodT(B, 'metal', '#3f4e57', P3(0, 3.1, 0), P3(0, 3.0, 1.85), 0.02, 5);
      rodT(B, NS('metal'), '#3f4e57', P3(0, 1.8, 0.06), P3(0, 2.86, 1.4), 0.025, 5);
      pbox(B, 'metal', K.iron, 0.2, 0.12, 0.2, 0, 2.8, 1.7);
      for (let k = 0; k < 10; k++) B.tor(NS('metal'), K.iron, 0.03, 0.008, 0, 2.7 - k * 0.07, 1.7, { rs: 3, ts: 6, ry: (k % 2) * HP });
      B.tube('metal', K.iron, [P3(0, 1.98, 1.7), P3(0, 1.88, 1.74), P3(0, 1.85, 1.66)], 0.018, { radial: 5 });
      for (const k of [-1, 1]) rodT(B, NS('paint'), K.rope, P3(0, 1.88, 1.7), P3(k * 0.3, 1.55, 1.7), 0.012, 4);
      for (let k = 0; k < 2; k++) sack(B, (k - 0.5) * 0.4, 1.3 - k * 0.02, 1.7, HP, K.sack, K.printRed);
      B.cyl('metal', K.iron, 0.12, 0.2, 0.18, 1.1, 0, { rz: HP, seg: 10 });
      B.tube(NS('metal'), K.iron, [P3(0.3, 1.1, 0), P3(0.36, 1.1, 0), P3(0.36, 1.3, 0.12), P3(0.45, 1.3, 0.12)], 0.015, { radial: 4 });
      B.col(-0.2, 0, -0.2, 0.2, 3.1, 0.2, { roof: true }); B.blob(0.9, 0.9);
    },
  };
  D.saltpan_scale = {
    desc: 'Platform weighing scale for sacks: low iron platform, cast column with a sliding-weight beam and counterweights on a hook, brass plate. Collides (low).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('metal', '#4b5a5f', 0.9, 0.14, 0.7, 0, 0.07, 0, { r: 0.02 });
      pbox(B, NS('metal'), K.ironLt, 0.82, 0.01, 0.62, 0, 0.145, 0);
      B.lathe('metal', '#4b5a5f', [[0.1, 0], [0.08, 0.1], [0.05, 1.1], [0.07, 1.16], [0, 1.17]], 0, 0, -0.42, { seg: 10 });
      pbox(B, 'metal', K.galv, 0.7, 0.03, 0.03, 0.2, 1.1, -0.42);
      pbox(B, 'metal', K.iron, 0.06, 0.08, 0.05, 0.35, 1.1, -0.42);
      for (let k = 0; k < 3; k++) B.cyl(NS('metal'), K.iron, 0.05 - k * 0.008, 0.03, 0.5, 0.85 - k * 0.04, -0.42, { seg: 10 });
      pbox(B, NS('metal'), K.clubGold, 0.12, 0.06, 0.01, 0, 0.9, -0.36);
      B.col(-0.45, 0, -0.52, 0.45, 0.2, 0.35); B.col(-0.1, 0, -0.52, 0.1, 1.15, -0.32);
    },
  };

  // ------------------------------------------------------------------------------------------ the salt store (spawn)
  // Stage coordinates (place at the origin). Level facade x -12…8 / z -46…-45.4 / 5.4 (face at z -45.4), the loading
  // gallery x -9…5 in front (deck 2.4). Everything above 5.4 and behind z -46 is this prop (outside the arena).
  D.saltpan_store = {
    desc: 'The Salt Store behind the spawn (stage coordinates, place at the origin): facade fittings (corner boards, eaves band, loading doors onto the gallery — one open on stacked sacks — windows, small doors in the side bays, wall lamps), the big boarded gable with SALTPAN BASIN channel letters and SALT CO. · 1889, loft door and hoist beam with pulley, rope and a hanging sling of sacks, corrugated roof with a louvred ventilator and fish weather-vane, side walls, the quay it stands on, and the tall brick chimney of the old boiling house. The gable top collides (keeps climbers off the wall head).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const zf = -45.4, xl = -12, xr = 8, Hw = 5.4, cxg = -2, apex = 9.5, zbk = -60;
      const wall = '#9c6a5b', wallDk = '#86594c', trim = K.trim;
      const gw = (xr - xl) / 2 + 0.2, pitch = Math.atan2(apex - Hw, gw);
      // facade fittings
      B.push(0, 0, zf, 0);
      for (const x of [xl + 0.1, xr - 0.1]) pbox(B, 'paint', trim, 0.22, Hw, 0.06, x, Hw / 2, 0.03);
      pbox(B, 'paint', trim, xr - xl + 0.1, 0.16, 0.07, (xl + xr) / 2, Hw - 0.08, 0.035);
      pbox(B, 'paint', trim, 14.2, 0.1, 0.06, -2, 2.46, 0.03);
      // loading doors on the gallery
      pbox(B, NS('paint'), '#1f1c1a', 2.4, 2.25, 0.02, -6.2, 3.55, 0.01);
      for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) sack(B, -6.9 + k * 0.62, 2.4 + r * 0.19, 0.3, 0.05 * (k - 1), K.sackDk, K.printBlue);
      ledgedDoor(B, -8.1, 2.4, 1.3, 2.3, '#7c8f8f', { track: 5.4, trackX: 1.9 });
      ledgedDoor(B, 2.7, 2.4, 2.4, 2.3, '#7c8f8f', { track: 5.2, trackX: -1.2 });
      for (const x of [-3.2, -0.8]) window4(B, x, 3.1, 0.9, 1.3, { lit: 0.35 });
      // side bays: ground-floor doors and windows
      ledgedDoor(B, -10.5, 0, 1.4, 2.3, '#7c8f8f', {});
      window4(B, -10.5, 3.2, 1.0, 1.1, {});
      window4(B, 6.5, 3.2, 1.0, 1.1, {});
      for (const x of [-10.5, 6.5]) { B.push(x, 4.6, 0); D.saltpan_lamp.build(B, { variant: 1 }); B.pop(); }
      for (const x of [-4.4, 0.4]) { B.push(x, 4.95, 0); D.saltpan_lamp.build(B, { variant: 1 }); B.pop(); }
      B.aoBase = null;
      B.pop();
      // gable: boarded triangle above the eaves, barge boards, sign, loft door, hoist
      const gab = tpl('sgable', () => extrudeGeo([[-gw, 0], [gw, 0], [0, apex - Hw]], 0.3, 0.01));
      B.add('paint', gab, wall, cxg, Hw, zf - 0.15, { ry: HP });
      for (let y = Hw + 0.18; y < apex - 0.1; y += 0.18) { const hw = gw * (1 - (y - Hw) / (apex - Hw)) - 0.05; pbox(B, NS('paint'), wallDk, hw * 2, 0.018, 0.01, cxg, y, zf + 0.004); }
      for (const s of [-1, 1]) pbeam(B, 'paint', trim, [cxg + s * (gw + 0.35), Hw - 0.15, zf + 0.08], [cxg, apex + 0.12, zf + 0.08], 0.08, 0.3);
      B.push(0, 0, zf, 0);
      letters(B, 'SALTPAN BASIN', { h: 0.62, x: cxg, y: 5.85, z: 0.01, c: K.cream, dep: 0.07, wt: 0.19, track: 0.1, mat: 'paint' });
      letters(B, 'SALT CO. · 1889', { h: 0.26, x: cxg, y: 6.75, z: 0.01, c: K.cream, flat: true, wt: 0.2, track: 0.14 });
      ledgedDoor(B, cxg, 7.2, 1.1, 1.3, '#7c8f8f', {});
      pbox(B, 'paint', trim, 1.3, 0.08, 0.1, cxg, 8.54, 0.05);
      B.pop();
      B.box('wood', K.timberDk, 0.22, 0.26, 1.9, cxg, 8.8, zf + 0.75, { r: 0.02 });
      B.cyl('metal', K.iron, 0.11, 0.07, cxg, 8.55, zf + 1.5, { seg: 10 });
      rodT(B, NS('paint'), K.rope, P3(cxg, 8.48, zf + 1.5), P3(cxg, 4.85, zf + 1.5), 0.014, 4);
      for (const k of [-1, 1]) rodT(B, NS('paint'), K.rope, P3(cxg, 4.85, zf + 1.5), P3(cxg + k * 0.34, 4.55, zf + 1.5), 0.012, 4);
      for (let k = 0; k < 3; k++) sack(B, cxg + (k - 1) * 0.3, 4.3 + (k % 2) * 0.05, zf + 1.5, HP + (k - 1) * 0.3, K.sack, K.printRed);
      B.col(xl, Hw, -46, xr, 7.2, zf, { roof: true });
      // roof: two corrugated slopes back to zbk, ventilator with a weather vane
      const sl = Math.hypot(gw, apex - Hw) + 0.5, dep = zf - zbk + 0.4;
      for (const s of [-1, 1]) {
        B.push(cxg + (s * gw) / 2 + s * 0.2, (Hw + apex) / 2 - 0.05, (zf + zbk) / 2 + 0.2, 0, 0, -s * pitch);
        pbox(B, 'paint', K.roof, sl, 0.1, dep, 0, 0, 0);
        for (let z = -dep / 2 + 0.2; z < dep / 2; z += 0.38) pbox(B, NS('paint'), shade(K.roof, 1.1), sl, 0.035, 0.07, 0, 0.06, z);
        for (const [x, z, w, d] of [[-1.5, -3, 2.2, 1.6], [2.4, 4.2, 1.5, 2.6]]) pbox(B, NS('paint'), K.rust, w, 0.012, d, x, 0.06, z);
        B.pop();
      }
      B.cyl('metal', K.galvDk, 0.12, dep, cxg, apex + 0.05, (zf + zbk) / 2, { rx: HP, seg: 8 });
      const vz = -51;
      B.box('paint', trim, 1.3, 1.0, 1.3, cxg, apex + 0.5, vz, { r: 0.02 });
      for (let k = 0; k < 4; k++) for (const f of [1, -1]) pbox(B, NS('paint'), '#8f8a80', 1.0, 0.05, 0.02, cxg, apex + 0.3 + k * 0.17, vz + f * 0.66, { rx: f * 0.4 });
      B.add('paint', tpl('pyr', () => latheGeo([[0, 0], [1.0, 0], [0, 0.6]], 4)), K.roof, cxg, apex + 1.0, vz, { ry: PI / 4 });
      B.cyl('metal', K.iron, 0.02, 1.1, cxg, apex + 2.0, vz, { seg: 5 });
      for (const [a, t] of [[0, 'N'], [HP, 'E'], [PI, 'S'], [-HP, 'W']]) pbox(B, NS('metal'), K.iron, 0.4, 0.015, 0.015, cxg + Math.cos(a) * 0.2, apex + 1.9, vz - Math.sin(a) * 0.2, { ry: a });
      B.add('metal', tpl('fish', () => extrudeGeo([[-0.45, 0], [-0.2, 0.14], [0.2, 0.12], [0.35, 0.2], [0.4, 0], [0.35, -0.2], [0.2, -0.12], [-0.2, -0.14]], 0.02, 0.004)), K.clubGold, cxg, apex + 2.3, vz, { ry: HP + 0.4 });
      // side + back walls
      for (const x of [xl - 0.1, xr + 0.1]) {
        pbox(B, 'paint', wall, 0.2, Hw, -zbk + zf, x, Hw / 2, (zf + zbk) / 2);
        for (let y = 0.2; y < Hw; y += 0.18) pbox(B, NS('paint'), wallDk, 0.01, 0.018, -zbk + zf - 0.2, x + Math.sign(x + 2) * 0.105, y, (zf + zbk) / 2);
        for (const z of [-49, -53, -57]) { B.push(x, 0, z, Math.sign(x + 2) * HP); window4(B, 0, 2.4, 0.9, 1.0, {}); B.pop(); }
      }
      pbox(B, 'paint', wall, xr - xl + 0.4, Hw, 0.2, cxg, Hw / 2, zbk);
      // the quay under it + the chimney of the old boiling house
      pbox(B, 'paint', '#b9b2a4', xr - xl + 4, 2.4, -zbk + zf + 3.2, cxg, -1.2, (zf + zbk) / 2 - 1.6);
      pbox(B, NS('paint'), '#8a8479', xr - xl + 4.04, 0.4, -zbk + zf + 3.24, cxg, -1.5, (zf + zbk) / 2 - 1.6);
      const chx = 12.5, chz = -58;
      pbox(B, 'paint', '#a9a295', 3.2, 2.6, 3.2, chx, -0.2, chz);
      B.lathe('paint', '#9b5f48', [[1.15, 0], [1.1, 1.0], [0.72, 15.5], [0, 15.5]], chx, 1.1, chz, { seg: 12 });
      B.lathe('paint', '#7d4a3b', [[0.84, 13.6], [0.84, 14.1], [0.78, 14.1]], chx, 1.1, chz, { seg: 12 });
      B.lathe('paint', '#4a3c35', [[0.8, 15.2], [0.86, 15.35], [0.86, 15.9], [0.62, 15.9], [0, 15.8]], chx, 1.1, chz, { seg: 12 });
      B.blink('#ff3b2a', chx, 17.1, chz, { size: 0.08, rate: 0.4, lo: 0.3, hi: 4 });
      for (const y of [5, 9.5]) B.lathe(NS('paint'), '#7d4a3b', [[1.02 - y * 0.024, y], [1.05 - y * 0.024, y + 0.15], [1.0 - y * 0.024, y + 0.3]], chx, 1.1, chz, { seg: 12 });
    },
  };

  // ------------------------------------------------------------------------------------------ works office
  // Stage coordinates (place at the origin): level block x -25.5…-19 / z -45.5…-40.5 / 2.8 (ochre weatherboard).
  D.saltpan_office = {
    desc: 'Works office dressing (stage coordinates, place at the origin): gabled corrugated roof with a brick chimney, a veranda on posts with a lean-to roof along the front, sash windows, a panelled door, WORKS OFFICE board, a notice board with pinned sheets, a bell on a bracket, bench, rain barrel, telephone pole with wires. Roof block collides (keeps climbers off).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = 0;
      const x0 = -25.5, x1 = -19, z0 = -45.5, z1 = -40.5, Hw = 2.8, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, trim = K.officeTrim;
      for (const x of [x0, x1]) for (const z of [z0, z1]) B.box('paint', trim, 0.16, Hw, 0.16, x + (x === x0 ? 0.06 : -0.06), Hw / 2, z + (z === z0 ? -0.06 : 0.06), { r: 0.02 });
      const rf = tpl('oroof', () => extrudeGeo([[-(z1 - z0) / 2 - 0.35, 0], [(z1 - z0) / 2 + 0.35, 0], [0, 1.25]], x1 - x0 + 0.6, 0.02));
      B.add('paint', rf, K.roof, cx, Hw, cz, {});
      for (let x = x0 - 0.25; x <= x1 + 0.25; x += 0.3) for (const s of [-1, 1]) pbeam(B, NS('paint'), shade(K.roof, 1.12), [x, Hw + 0.02, cz + s * 2.84], [x, Hw + 1.27, cz], 0.035, 0.02);
      for (const s of [-1, 1]) B.box('paint', trim, x1 - x0 + 0.62, 0.14, 0.04, cx, Hw - 0.02, cz + s * 2.87, { r: 0.01 });
      for (const x of [x0 - 0.31, x1 + 0.31]) for (const s of [-1, 1]) pbeam(B, 'paint', trim, [x, Hw - 0.05, cz + s * 2.9], [x, Hw + 1.3, cz], 0.05, 0.16);
      B.box('paint', '#9b5f48', 0.5, 1.5, 0.5, x0 + 1.4, Hw + 1.0, cz + 0.8, { r: 0.02 });
      B.box('paint', '#7d4a3b', 0.58, 0.12, 0.58, x0 + 1.4, Hw + 1.8, cz + 0.8, { r: 0.02 });
      B.cyl('paint', '#6d5d52', 0.08, 0.3, x0 + 1.4, Hw + 1.95, cz + 0.8, { seg: 8 });
      B.col(x0, Hw, z0, x1, Hw + 0.45, z1, { roof: true });
      // veranda along the front (+Z)
      const vz = z1 + 1.55;
      for (const x of [x0 + 0.15, cx, x1 - 0.15]) { B.box('wood', trim, 0.12, 2.45, 0.12, x, 1.225, vz, { r: 0.02 }); B.col(x - 0.07, 0, vz - 0.07, x + 0.07, 2.4, vz + 0.07, { roof: true }); }
      B.push(cx, 2.55, z1 + 0.8, 0, 0.14);
      pbox(B, 'paint', K.roof, x1 - x0 + 0.3, 0.04, 1.8, 0, 0, 0);
      for (let x = -3.3; x <= 3.3; x += 0.3) pbox(B, NS('paint'), shade(K.roof, 1.12), 0.035, 0.03, 1.8, x, 0.03, 0);
      B.pop();
      pbox(B, 'paint', trim, x1 - x0 + 0.3, 0.12, 0.05, cx, 2.34, vz + 0.1);
      for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.55) pbox(B, NS('paint'), trim, 0.03, 0.1, 0.03, x, 2.22, vz + 0.1);
      B.box('wood', K.timberDk, x1 - x0 + 0.2, 0.12, 1.6, cx, 0.06, z1 + 0.8, { r: 0.02 });
      // front: door, windows, sign, notice board, bell
      B.push(0, 0, z1, 0);
      B.box('paint', '#5f7b78', 0.9, 2.05, 0.05, cx + 0.2, 1.025 + 0.12, 0.03, { r: 0.015 });
      for (const y of [0.55, 1.45]) pbox(B, NS('paint'), '#4f6966', 0.7, 0.6, 0.01, cx + 0.2, y + 0.12, 0.057);
      pbox(B, 'paint', trim, 1.06, 0.08, 0.06, cx + 0.2, 2.21, 0.03);
      B.sph(NS('metal'), K.clubGold, 0.03, cx + 0.53, 1.12, 0.07, { ws: 6, hs: 4 });
      window4(B, x0 + 1.25, 1.0, 0.9, 1.1, { lit: 0.7, shutter: '#5f7b78' });
      window4(B, x1 - 1.25, 1.0, 0.9, 1.1, { lit: 0.7, shutter: '#5f7b78' });
      boardSign(B, 'WORKS OFFICE', cx + 0.2, 2.55, 0.06, { h: 0.17, board: '#33405a', c: K.cream, hb: 0.3 });
      B.pop();
      B.push(x1, 0, cz, HP);
      window4(B, -0.9, 1.0, 0.9, 1.1, { shutter: '#5f7b78' });
      B.box('wood', K.timberDk, 1.1, 0.8, 0.05, 1.2, 1.45, 0.03, { r: 0.01 });
      for (const [x, y, w, h] of [[0.86, 1.6, 0.26, 0.34], [1.24, 1.66, 0.3, 0.22], [1.24, 1.37, 0.3, 0.26], [1.58, 1.52, 0.18, 0.42]]) pbox(B, NS('paint'), '#f4efe3', w, h, 0.006, x, y, 0.06);
      pbox(B, NS('paint'), K.red, 0.24, 0.04, 0.007, 0.86, 1.73, 0.061);
      B.pop();
      B.box('metal', K.iron, 0.05, 0.05, 0.4, x1 + 0.2, 2.35, z1 + 0.25, { r: 0.01 });
      B.lathe('metal', K.clubGold, [[0, 0], [0.14, 0.02], [0.12, 0.12], [0.07, 0.22], [0, 0.24]], x1 + 0.2, 2.06, z1 + 0.45, { seg: 12 });
      // bench, barrel, telephone pole
      B.box('wood', K.timberDk, 1.4, 0.06, 0.4, x0 + 1.6, 0.52, z1 + 1.1, { r: 0.01 });
      B.col(x0 + 0.88, 0, z1 + 0.88, x0 + 2.32, 0.55, z1 + 1.32);
      for (const sx of [-0.6, 0.6]) B.box('wood', K.timberDk, 0.06, 0.4, 0.36, x0 + 1.6 + sx, 0.32, z1 + 1.1, { r: 0.01 });
      B.lathe('wood', K.timberOld, [[0, 0], [0.3, 0], [0.34, 0.4], [0.3, 0.8], [0, 0.8]], x1 - 0.5, 0.12, z0 - 0.45, { seg: 12 });
      B.tor(NS('metal'), K.iron, 0.33, 0.015, x1 - 0.5, 0.35, z0 - 0.45, { rx: HP, rs: 3, ts: 16 });
      B.col(x1 - 0.85, 0, z0 - 0.8, x1 - 0.15, 0.92, z0 - 0.1);
    },
  };

  // ------------------------------------------------------------------------------------------ spawn gallery
  // Stage coordinates: gallery body x -9…5 / z -45.4…-38.5 / deck 2.4, stair x -4.5…0.5 from (0, -32.4) up to
  // (2.4, -38.5), side ramp x 5…11.4 at z -45.1…-42.1 (2.4 → 0).
  D.saltpan_gallery = {
    desc: 'Loading-gallery dressing (stage coordinates, place at the origin): heavy timber posts and an edge beam on the gallery front, post-and-rail balustrade round the deck, stair stringers with handrails and newel posts, side-ramp rails, a timber salt chute to the yard. Non-colliding.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = 0;
      const zf = -38.5, top = 2.4;
      for (const x of [-8.85, -6.6, -4.62, 0.62, 2.8, 4.85]) B.box('wood', K.timberOld, 0.24, top - 0.1, 0.16, x, (top - 0.1) / 2, zf + 0.08, { r: 0.03 });
      for (const [a, b] of [[-9, -4.5], [0.5, 5]]) pbox(B, 'wood', K.timberDk, b - a, 0.28, 0.1, (a + b) / 2, top - 0.17, zf + 0.05);
      for (const x of [-9, 5]) pbox(B, 'wood', K.timberDk, 0.1, 0.28, 6.9, x + (x < 0 ? -0.05 : 0.05), top - 0.17, -41.95);
      // balustrade
      const rail = (pts, h = 1.0) => {
        for (const p of pts) B.box('wood', K.timberDk, 0.1, h, 0.1, p[0], p[1] + h / 2, p[2], { r: 0.015 });
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1];
          pbeam(B, 'wood', K.timberLt, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.09, 0.07);
          pbeam(B, NS('wood'), K.timberDk, [a[0], a[1] + h * 0.5, a[2]], [b[0], b[1] + h * 0.5, b[2]], 0.05, 0.05);
          railCols(B, a, b, h + 0.05, 0.12, Math.abs(b[1] - a[1]) > 0.01 ? 0.6 : 99);
        }
      };
      // front balustrade either side of the stair (the west end stays open: a drop exit to the yard)
      rail([[-8.92, top, -38.62], [-6.7, top, -38.62], [-4.62, top, -38.62]]);
      rail([[0.62, top, -38.62], [2.8, top, -38.62], [4.88, top, -38.62], [4.88, top, -40.3], [4.88, top, -41.95]]);
      // festoon masts at the front corners, strings of work lights back to the store facade
      for (const x of [-8.85, 4.85]) {
        B.box('wood', K.tar, 0.12, 3.5, 0.12, x, top + 1.75, -38.75, { r: 0.02 });
        B.box(NS('wood'), K.tar, 0.4, 0.06, 0.06, x, top + 3.4, -38.75, { r: 0.01 });
        B.push(x, top, -45.3, -HP); D.stringlights.build(B, { length: 6.55, height: 2.85, endHeight: 3.3, sag: 0.35, count: 14 }); B.pop();
      }
      B.push(-8.85, top, -38.75, 0); D.stringlights.build(B, { length: 13.7, height: 3.3, endHeight: 3.3, sag: 0.45, count: 26 }); B.pop();
      B.aoBase = 0;
      // stair: stringers, handrails, newels
      const sy = (z) => (top * (z + 32.4)) / -6.1;
      for (const x of [-4.56, 0.56]) {
        pbeam(B, 'wood', K.timberDk, [x, -0.1, -32.1], [x, top - 0.06, -38.52], 0.1, 0.36);
        const pts = [];
        for (const z of [-32.75, -34.5, -36.3, -38.2]) pts.push([x, sy(z), z]);
        rail([[x, 0, -32.5], ...pts]);
        B.box('wood', K.timberDk, 0.2, 1.15, 0.2, x, 0.575, -32.5, { r: 0.03 });
        B.box(NS('wood'), K.endgrain, 0.26, 0.06, 0.26, x, 1.18, -32.5, { r: 0.01 });
      }
      // side ramp (x 5 → 11.4), rail on its open side
      const ry = (x) => top * (1 - (x - 5) / 6.4);
      const rp = []; for (const x of [5.3, 7.3, 9.3, 11.1]) rp.push([x, ry(x), -42.02]);
      rail(rp);
      pbeam(B, 'wood', K.timberDk, [5, top - 0.06, -41.98], [11.6, -0.1, -41.98], 0.1, 0.36);
    },
  };

  // ------------------------------------------------------------------------------------------ signs
  D.saltpan_sign = {
    desc: 'Salt-works sign: variant 0 a painted pan board on two tarred posts (text, e.g. PAN 4), 1 a wall board (wall at z = 0), 2 a small enamel warning plate on a post (text). Board faces +Z. Posts collide (variant 0).',
    params: { text: 'string', board: 'colour', color: 'letter colour', h: 'letter height' }, variants: 3, mount: 'ground|wall',
    build(B, o) {
      const v = (o.variant ?? 0) % 3, text = o.text ?? 'PAN 4';
      if (v === 1) { B.aoBase = null; boardSign(B, text, 0, 0, 0, { h: o.h ?? 0.22, board: o.board ?? K.cream, c: o.color ?? K.navy, border: o.color ?? K.navy }); return; }
      if (v === 2) {
        B.box('wood', K.tar, 0.08, 1.5, 0.08, 0, 0.75, 0, { r: 0.012 });
        boardSign(B, text, 0, 1.3, 0.04, { h: o.h ?? 0.09, board: o.board ?? '#f1c95c', c: o.color ?? K.tar, border: o.color ?? K.tar, mat: 'gloss' });
        B.col(-0.06, 0, -0.06, 0.06, 1.5, 0.06);
        return;
      }
      const W = textW(text, 0.19, 0.12) * (o.h ?? 0.3) + 0.4;
      for (const sx of [-1, 1]) { B.box('wood', K.tar, 0.1, 1.55, 0.1, sx * (W / 2 - 0.12), 0.775, -0.04, { r: 0.015 }); B.col(sx * (W / 2 - 0.12) - 0.06, 0, -0.1, sx * (W / 2 - 0.12) + 0.06, 1.5, 0.02); }
      boardSign(B, text, 0, 1.2, 0.02, { h: o.h ?? 0.3, board: o.board ?? K.white, c: o.color ?? K.navy, w: W, border: o.color ?? K.navy });
      B.col(-W / 2, 0.92, -0.04, W / 2, 1.48, 0.09, { roof: true });
    },
  };

  // ------------------------------------------------------------------------------------------ outer ponds (scenery)
  // Evaporation ponds out on the tidal flat beyond the arena (non-colliding): a patchwork of shallow ponds in
  // green-grey → ochre → rose → pink-white brine stages between low mud dykes, a dyke road with telegraph poles,
  // a distant wind pump and a long white salt camelle. Local frame: the field fills x 0…w, z 0…d.
  const POND = ['#8fa39b', '#9aab96', '#b5ae8b', '#c2b597', '#cdb3a9', '#d6b1ae', '#e3cdc8', '#ece0dc', '#c7a2a3', '#a8b8b2'];
  D.saltpan_ponds = {
    desc: 'Outer evaporation-pond field (scenery beyond the arena, local x 0…w, z 0…d at sea level): brine ponds of graded colours between mud dykes, a dyke road with telegraph poles, optional distant wind pump and salt camelle. Non-colliding.',
    params: { w: 'm', d: 'm', seed: 'n', pump: '[x, z]', camelle: '[x, z, len]' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = o.w ?? 50, Dd = o.d ?? 60, rnd = H.mulberry32(o.seed ?? 7), yW = -1.33, yD = -1.05;
      // dyke grid: columns split x, rows per column split z
      const xs = [0]; while (xs[xs.length - 1] < W - 8) xs.push(Math.min(W, xs[xs.length - 1] + 11 + rnd() * 12)); xs[xs.length - 1] = W;
      for (let i = 0; i + 1 < xs.length; i++) {
        const a = xs[i], b = xs[i + 1];
        const zs = [0]; while (zs[zs.length - 1] < Dd - 6) zs.push(Math.min(Dd, zs[zs.length - 1] + 7 + rnd() * 12)); zs[zs.length - 1] = Dd;
        for (let j = 0; j + 1 < zs.length; j++) {
          const c = zs[j], d = zs[j + 1], k = Math.floor(rnd() * POND.length);
          pbox(B, NS('gloss'), POND[k], b - a - 0.8, 0.04, d - c - 0.8, (a + b) / 2, yW, (c + d) / 2);
          pbox(B, NS('paint'), '#bdae93', b - a, 0.28, 0.9, (a + b) / 2, yD - 0.14, d);
        }
        pbox(B, NS('paint'), '#bdae93', 0.9, 0.28, Dd, b, yD - 0.14, Dd / 2);
      }
      pbox(B, NS('paint'), '#c4b598', W, 0.3, 3.2, W / 2, yD - 0.1, -1.6);
      pbox(B, NS('paint'), '#b1a286', 0.9, 0.28, Dd, 0, yD - 0.14, Dd / 2);
      // telegraph poles along the front dyke road
      const poles = [];
      for (let x = 6; x < W; x += 24) { B.cyl(NS('wood'), K.tar, 0.09, 5.0, x, yD + 2.5, -1.6, { seg: 5 }); pbox(B, NS('wood'), K.tar, 1.0, 0.08, 0.08, x, yD + 4.8, -1.6); poles.push(x); }
      for (let i = 0; i + 1 < poles.length; i++) for (const dx of [-0.45, 0.45]) sag(B, NS('paint'), '#2a2622', P3(poles[i] + dx, yD + 4.85, -1.6), P3(poles[i + 1] + dx, yD + 4.85, -1.6), 0.6, 0.015, 6);
      if (o.pump) {
        const [px, pz] = o.pump;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) pbeam(B, NS('metal'), '#8e979b', [px + sx * 1.1, yD, pz + sz * 1.1], [px + sx * 0.3, yD + 7.5, pz + sz * 0.3], 0.1, 0.1);
        B.cyl(NS('metal'), '#a9b0b4', 1.5, 0.08, px, yD + 8.1, pz + 0.5, { rx: HP, seg: 18 });
        B.add(NS('paint'), tpl('vane2', () => extrudeGeo([[-0.7, -0.4], [0.3, -0.25], [0.3, 0.4], [-0.7, 0.55]], 0.04, 0.008)), K.oxide, px, yD + 8.0, pz - 1.8, {});
      }
      if (o.camelle) {
        const [cx, cz, L] = o.camelle;
        B.add(NS('rubber'), moundGeo(L, 11, 5.2, 2), 'white', cx, yD, cz, { ry: 0.2 });
        B.push(cx, yD, cz, 0.2);
        for (let k = 0; k <= 4; k++) { const x = -L / 2 - 6 + k * ((L + 6) / 4); B.cyl(NS('metal'), '#6d7478', 0.12, 6.4, x, 3.2, 0, { seg: 5 }); }
        pbox(B, NS('metal'), '#6d7478', L + 6, 0.35, 0.8, -3, 6.5, 0);
        beam(B, NS('metal'), '#6d7478', [-L / 2 - 6, 6.5, 0], [-L / 2 - 16, 0.5, 0], 0.8, 0.3);
        B.pop();
      }
    },
  };

  // ------------------------------------------------------------------------------------------ salt-marsh plants
  // glasswort / samphire: fleshy jointed cushions, green going red in the salt — a run along +X (length) or one clump
  const SAMP = ['#7c9453', '#8d9d5b', '#9c6049', '#a86c50', '#878a4f', '#93594a'];
  function sampClump(B, x, y, z, s) {
    const c1 = SAMP[Math.floor(B.r(0, SAMP.length - 0.001))], c2 = SAMP[Math.floor(B.r(0, SAMP.length - 0.001))];
    for (let k = 0; k < 2; k++) {
      const a = B.r(0, TAU), r = B.r(0, 0.1) * s;
      B.add(NS('foliage'), tpl('sampb' + k, () => blobGeo(1, 1, 11 + k, 0.3, 0.62, 1.1)), k ? c2 : c1, x + Math.cos(a) * r, y + 0.02, z + Math.sin(a) * r, { sx: 0.2 * s * B.r(0.8, 1.3), sy: 0.055 * s * B.r(0.8, 1.3), sz: 0.2 * s * B.r(0.8, 1.3) });
    }
    for (let k = 0; k < 9; k++) {
      const a = B.r(0, TAU), r = B.r(0.02, 0.2) * s, h = B.r(0.08, 0.2) * s;
      B.cyl(NS('foliage'), k % 3 ? c1 : c2, 0.016 * s, h, x + Math.cos(a) * r, y + h / 2, z + Math.sin(a) * r, { seg: 4, rx: B.r(-0.35, 0.35), rz: B.r(-0.35, 0.35) });
    }
  }
  D.saltpan_samphire = {
    desc: 'Salt-marsh glasswort (samphire): fleshy jointed cushions going from green to red in the salt; variant 0 a ragged run of clumps along +X (length), 1 a single clump. Non-colliding.',
    params: { length: 'm (4)' }, variants: 2, mount: 'ground',
    build(B, o) {
      if ((o.variant ?? 0) % 2 === 1) { sampClump(B, 0, 0, 0, B.r(0.9, 1.3)); return; }
      const L = o.length ?? 4;
      for (let x = B.r(0, 0.4); x < L; x += B.r(0.35, 0.9)) sampClump(B, x, 0, B.r(-0.18, 0.18), B.r(0.6, 1.25));
    },
  };

  // ------------------------------------------------------------------------------------------ sluice-keeper's hut
  D.saltpan_hut = {
    desc: 'Small timber sluice-keeper hut (front +Z): boarded walls on a tarred plinth, pent corrugated roof, ledged door, four-pane window, stove pipe, a winch wheel and rope coil by the door, lifebuoy-free (this is salt, not a marina). Collides.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const W = 1.9, Dd = 1.7, Hf = 2.3, Hb = 2.0;
      B.box('paint', '#a8b2a9', W, Hb, Dd, 0, Hb / 2, 0, { r: 0.03 });
      pbox(B, 'paint', '#a8b2a9', W, Hf - Hb, 0.06, 0, Hb + (Hf - Hb) / 2, Dd / 2 - 0.03);
      for (let x = -W / 2 + 0.15; x < W / 2; x += 0.15) for (const f of [1, -1]) pbox(B, NS('paint'), '#8e9990', 0.012, Hb, 0.01, x, Hb / 2, f * (Dd / 2 + 0.005));
      pbox(B, 'paint', K.tar, W + 0.04, 0.3, Dd + 0.04, 0, 0.15, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pbox(B, 'paint', K.trim, 0.1, Hb, 0.1, sx * (W / 2 - 0.02), Hb / 2, sz * (Dd / 2 - 0.02));
      B.push(0, (Hb + Hf) / 2 + 0.06, 0, 0, Math.atan2(Hf - Hb, Dd));
      pbox(B, 'paint', K.roof, W + 0.4, 0.05, Dd + 0.5, 0, 0, 0);
      for (let x = -W / 2 - 0.1; x <= W / 2 + 0.1; x += 0.25) pbox(B, NS('paint'), shade(K.roof, 1.12), 0.035, 0.03, Dd + 0.5, x, 0.03, 0);
      B.pop();
      B.push(0, 0, Dd / 2, 0);
      ledgedDoor(B, -0.45, 0.02, 0.75, 1.85, '#6f8583', {});
      window4(B, 0.45, 1.0, 0.55, 0.6, { lit: 0.5 });
      B.pop();
      B.cyl('metal', K.iron, 0.06, 0.9, W / 2 - 0.4, Hf + 0.3, -0.3, { seg: 8 });
      B.cyl(NS('metal'), K.iron, 0.1, 0.06, W / 2 - 0.4, Hf + 0.75, -0.3, { seg: 8 });
      B.tor(NS('paint'), K.rope, 0.2, 0.05, W / 2 + 0.3, 0.06, Dd / 2 + 0.2, { rx: HP, rs: 5, ts: 14 });
      B.col(-W / 2, 0, -Dd / 2, W / 2, Hf, Dd / 2, { roof: true }); B.blob(W + 0.6, Dd + 0.6);
    },
  };

  // ------------------------------------------------------------------------------------------ pump staging kit
  D.saltpan_staging = {
    desc: 'Wind-pump staging dressing (centred on the staging, mirror: false): tarred kerb timbers round the edge (open where the boardwalks land), iron bollards at the corners, a tool chest, rope coil, oil drum. Kerbs + bollards non-colliding, chest collides.',
    params: { size: 'half-size m (3.6)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const s = o.size ?? 3.6, y = 0;
      const kerb = (x0, z0, x1, z1) => pbox(B, 'wood', K.tar, Math.abs(x1 - x0) + 0.16, 0.14, Math.abs(z1 - z0) + 0.16, (x0 + x1) / 2, y + 0.07, (z0 + z1) / 2);
      // edges (boardwalks land at +X z -2.6…-0.8, -X z 0.8…2.6, -Z x 1.4…3.2, +Z x -3.2…-1.4)
      const e = s - 0.1;
      kerb(-e, -e, 1.2, -e); kerb(3.4, -e, e, -e);
      kerb(-e, e, -3.4, e); kerb(-1.2, e, e, e);
      // (Tower Command, `track`: the ±X gaps open wider — the tower leaves the staging there, 2.5 m wide)
      const g0 = o.track ? 0.3 : 0.6, g1 = o.track ? 3.1 : 2.8;
      kerb(e, -e, e, -g1); kerb(e, -g0, e, e);
      kerb(-e, e, -e, g1); kerb(-e, g0, -e, -e);
      for (const [x, z] of [[-e, -e], [e, -e], [e, e], [-e, e]]) B.lathe('metal', K.iron, [[0.14, 0], [0.13, 0.35], [0.17, 0.4], [0.17, 0.46], [0, 0.48]], x, y, z, { seg: 10 });
      B.box('wood', '#6f8583', 0.9, 0.5, 0.5, -2.3, y + 0.25, -2.6, { r: 0.03 });
      pbox(B, NS('metal'), K.iron, 0.94, 0.04, 0.54, -2.3, y + 0.42, -2.6);
      B.col(-2.75, y, -2.85, -1.85, y + 0.5, -2.35);
      B.tor(NS('paint'), K.rope, 0.22, 0.05, -2.9, y + 0.05, -1.4, { rx: HP, rs: 5, ts: 14 });
      drum(B, K.teal, 2.6, y, 2.4); B.col(2.3, y, 2.1, 2.9, y + 0.88, 2.7);
    },
  };

  // ------------------------------------------------------------------------------------------ flamingos (scenery)
  function flamingo(B, x, y, z, ry, feeding, s = 1) {
    B.push(x, y, z, ry, 0, 0, s);
    const pink = '#eea7a1', pinkDk = '#d98580', leg = '#d88e8a';
    B.cyl(NS('paint'), leg, 0.012, 0.78, 0.0, 0.39, 0.05, { seg: 4 });
    B.tube(NS('paint'), leg, [P3(0, 0.78, -0.05), P3(-0.02, 0.5, -0.06), P3(0.12, 0.42, -0.05)], 0.011, { radial: 3 });
    B.add(NS('paint'), tpl('flbody', () => blobGeo(1, 1, 5, 0.06, 0.8, 1.08)), pink, 0, 0.9, 0, { sx: 0.3, sy: 0.17, sz: 0.16 });
    B.add(NS('paint'), tpl('flwing', () => blobGeo(1, 0, 6, 0.05, 0.8, 1.05)), '#2d2b2b', -0.26, 0.93, 0, { sx: 0.1, sy: 0.06, sz: 0.1 });
    const neck = feeding ? [P3(0.22, 0.95, 0), P3(0.34, 0.85, 0), P3(0.36, 0.55, 0), P3(0.33, 0.28, 0), P3(0.36, 0.12, 0)] : [P3(0.22, 0.95, 0), P3(0.32, 1.1, 0), P3(0.22, 1.27, 0), P3(0.14, 1.4, 0), P3(0.22, 1.5, 0)];
    B.tube(NS('paint'), pink, neck, 0.024, { radial: 5 });
    const h = neck[neck.length - 1];
    B.sph(NS('paint'), pinkDk, 0.045, h[0] + 0.02, h[1], 0, { ws: 6, hs: 4 });
    B.tube(NS('paint'), '#2b2929', [P3(h[0] + 0.05, h[1], 0), P3(h[0] + 0.12, h[1] - (feeding ? 0.08 : 0.03), 0), P3(h[0] + 0.13, h[1] - (feeding ? 0.14 : 0.08), 0)], 0.016, { radial: 4 });
    B.pop();
  }
  D.saltpan_flamingos = {
    desc: 'A flock of greater flamingos wading in a brine pond (scenery): `count` birds scattered over a radius, standing, preening or feeding head-down, legs in the water (pos = water surface). Non-colliding.',
    params: { count: 'birds (7)', radius: 'm (4)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const n = o.count ?? 7, R = o.radius ?? 4;
      for (let i = 0; i < n; i++) { const a = B.r(0, TAU), r = Math.sqrt(B.r(0, 1)) * R; flamingo(B, Math.cos(a) * r, -0.12, Math.sin(a) * r, B.r(0, TAU), B.r(0, 1) < 0.45, B.r(0.9, 1.1)); }
    },
  };

  // ------------------------------------------------------------------------------------------ small works clutter
  D.saltpan_gauge = {
    desc: 'Brine staff gauge in a pan: white graduated board with black ticks and red decimetre numbers on a tarred post (pos = pan floor), a salt tide line near the foot. Non-colliding.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('wood', K.tar, 0.1, 1.4, 0.08, 0, 0.7, -0.05, { r: 0.012 });
      pbox(B, 'paint', K.white, 0.12, 1.0, 0.02, 0, 0.72, 0.0);
      for (let k = 0; k <= 20; k++) pbox(B, NS('paint'), k % 5 ? K.tar : K.red, k % 5 ? 0.05 : 0.09, 0.012, 0.004, -0.02, 0.24 + k * 0.047, 0.012);
      pbox(B, NS('paint'), K.salt, 0.14, 0.08, 0.1, 0, 0.1, -0.02);
    },
  };
  D.saltpan_stakes = {
    desc: 'A run of white-painted marker stakes with red tops along +X (length, every 2 m), leaning a little, salt-crusted at the foot. Non-colliding.',
    params: { length: 'm (6)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 6;
      for (let x = 0; x <= L + 0.01; x += 2) {
        const rz = B.r(-0.06, 0.06), rx = B.r(-0.06, 0.06);
        B.box(NS('wood'), '#ece8df', 0.05, 1.0, 0.05, x, 0.5, 0, { r: 0.01, rz, rx });
        B.box(NS('paint'), K.red, 0.055, 0.18, 0.055, x - rz * 0.9, 0.93, rx * 0.9, { r: 0.01, rz, rx });
      }
    },
  };
  D.saltpan_sleepers = {
    desc: 'A crib-stacked pile of spare tarred rail sleepers with a few rail lengths on top. Collides.',
    params: { rows: 'layers (4)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const rows = o.rows ?? 4;
      for (let r = 0; r < rows; r++) for (let k = 0; k < 5; k++) {
        const along = r % 2 === 0;
        pbox(B, 'wood', shade(K.tar, B.r(0.9, 1.4)), along ? 1.0 : 0.13, 0.12, along ? 0.13 : 1.0, along ? 0 : -0.42 + k * 0.21, 0.06 + r * 0.12, along ? -0.42 + k * 0.21 : 0, { ry: B.r(-0.03, 0.03) });
      }
      for (const z of [-0.2, 0.15]) pbox(B, 'metal', K.rust, 2.2, 0.07, 0.05, 0.2, rows * 0.12 + 0.035, z, { ry: 0.08 });
      B.col(-0.55, 0, -0.55, 0.55, rows * 0.12 + 0.07, 0.55); B.blob(1.5, 1.3);
    },
  };

  // ------------------------------------------------------------------------------------------ gulls (perched)
  D.saltpan_gull = {
    desc: 'A herring gull perched on a post or beam (pos = its feet), facing local +X; variant 0 standing, 1 hunkered down. Non-colliding.',
    params: {}, variants: 2, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const v = (o.variant ?? 0) % 2, lo = v ? -0.05 : 0;
      for (const z of [-0.03, 0.03]) if (!v) B.cyl(NS('paint'), '#d7a35a', 0.006, 0.07, 0, 0.035, z, { seg: 3 });
      B.add(NS('paint'), tpl('gullb', () => blobGeo(1, 1, 3, 0.05, 0.85, 1.08)), '#f2f0ea', 0, 0.14 + lo, 0, { sx: 0.16, sy: 0.08, sz: 0.075, rz: 0.15 });
      for (const s of [-1, 1]) B.add(NS('paint'), tpl('gullw', () => blobGeo(1, 0, 4, 0.04, 0.85, 1.05)), '#9aa1a8', -0.03, 0.16 + lo, s * 0.05, { sx: 0.15, sy: 0.035, sz: 0.04, rz: 0.2 });
      pbox(B, NS('paint'), '#2c2c2e', 0.07, 0.02, 0.05, -0.17, 0.19 + lo, 0, { rz: 0.35 });
      B.sph(NS('paint'), '#f4f2ec', 0.048, 0.13, 0.23 + lo, 0, { ws: 8, hs: 6 });
      pbox(B, NS('paint'), '#e2b33c', 0.06, 0.016, 0.016, 0.19, 0.225 + lo, 0);
    },
  };

  // ------------------------------------------------------------------------------------------ tidal-flat quay edge
  D.saltpan_seaedge = {
    desc: 'Timber-revetted tidal-flat quay edge along local +X (length) at a deck edge (deck top y = 0 at pos, sea on local +Z): tarred piles every ~1.3 m driven into the mud, two waling planks on the face, a capping fender along the top, a weed band and a salt tide-line at the waterline, the odd mooring post with a rope. Non-colliding.',
    params: { length: 'm (6)', post: 'bool: a mooring post at mid-length' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 6, n = Math.max(1, Math.round(L / 1.3));
      for (let i = 0; i <= n; i++) {
        const x = (i / n) * L;
        B.cyl('wood', shade(K.tar, B.r(0.95, 1.4)), 0.11, 2.75, x, -1.3, 0.13, { seg: 6 });
        B.cyl(NS('wood'), K.endgrain, 0.1, 0.02, x, 0.075, 0.13, { seg: 6 });
      }
      for (const y of [-0.42, -1.0]) pbox(B, 'wood', shade(K.timberOld, 0.9), L + 0.1, 0.22, 0.08, L / 2, y, 0.05);
      pbox(B, 'wood', K.timberDk, L + 0.14, 0.14, 0.16, L / 2, -0.07, 0.09);
      pbox(B, NS('paint'), '#3d4a33', L + 0.1, 0.16, 0.12, L / 2, -1.52, 0.1);
      pbox(B, NS('paint'), K.salt, L + 0.1, 0.05, 0.1, L / 2, -1.34, 0.1);
      if (o.post) {
        B.lathe('wood', K.tar, [[0.15, 0], [0.15, 0.55], [0.18, 0.6], [0.18, 0.66], [0, 0.68]], L / 2, 0, -0.35, { seg: 10 });
        B.tor(NS('paint'), K.rope, 0.17, 0.03, L / 2, 0.45, -0.35, { rx: HP, rs: 4, ts: 12 });
      }
    },
  };

  // ================================================================================================ the slice (Long Stages)
  // The new land between the pans and the base (layout.js SLICE, 2026-09-30): the brine pump house, its loading
  // platform, the salt cones and the stacker in the cone yard, a coal bin. The first two are authored in Alpha-half
  // stage coordinates (place at the origin, like the store and the gantry).

  // round-arched window on a wall at z = 0 facing +Z (opening w × h, sill at y, centred at x): stone surround with a
  // keystone, small-paned iron glazing
  const archGeo = (w, h) => tpl(['arch', w, h].map(kf).join('|'), () => {
    const r = w / 2, pts = [[-r, 0], [r, 0]];
    for (let k = 0; k <= 10; k++) { const a = (k / 10) * PI; pts.push([Math.cos(a) * r, h - r + Math.sin(a) * r]); }
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    return new THREE.ShapeGeometry(sh, 6);
  });
  function archWin(B, x, y, w, h, o = {}) {
    const r = w / 2, stone = o.stone ?? '#d8cfbd';
    B.add(NS('gloss'), archGeo(w, h), o.glass ?? K.glass, x, y, 0.012, {});
    if (o.lit) B.add(NS('glow'), archGeo(w - 0.1, h * 0.5), K.lamp, x, y + 0.04, 0.016, { glow: o.lit });
    for (let k = 1; k < 3; k++) pbox(B, NS('paint'), K.iron, 0.03, h - 0.05, 0.02, x - r + (k * w) / 3, y + (h - 0.05) / 2, 0.02);
    for (let k = 1; k < 4; k++) pbox(B, NS('paint'), K.iron, w, 0.03, 0.02, x, y + (k * (h - r)) / 4, 0.02);
    for (const sx of [-1, 1]) pbox(B, 'paint', stone, 0.14, h - r, 0.07, x + sx * (r + 0.07), y + (h - r) / 2, 0.035);
    for (let k = 0; k <= 6; k++) { const a = (k / 6) * PI; pbox(B, 'paint', k === 3 ? shade(stone, 1.06) : stone, k === 3 ? 0.2 : 0.16, 0.2, 0.08, x + Math.cos(a) * (r + 0.07), y + h - r + Math.sin(a) * (r + 0.07), 0.04, { rz: a - HP }); }
    pbox(B, 'paint', stone, w + 0.34, 0.1, 0.12, x, y - 0.05, 0.06);
  }

  // ------------------------------------------------------------------------------------------ the brine pump house
  // Stage coordinates (place at the origin). Level block x -23…-17 / z -45…-39, walls to 5.0 (layout.js pump-house:
  // brick, ground floor inkable to 2.8, the upper walls out of play). North gable toward mid; the chimney stack rises
  // through the roof's south end; the rising main crosses the rail spur to the header tank on the loading platform
  // (x -11.2, z -42.3, on the stage at 1.5); the suction pipe drops into the intake bay (x -30…-26, z -43…-37).
  D.saltpan_pumphouse = {
    desc: 'The brine pump house (stage coordinates, place at the origin): brick engine house with stone quoins, plinth and a string course at the inkable line, tall round-arched iron windows, a double door onto the rail spur, a slate roof with a lead ridge and a north gable lettered PUMPING STATION No 2 · 1902 over an oculus, the tall square chimney stack of the boiler rising through the roof, the rising main on a steel post across the spur to the header tank on the loading platform, the suction pipe with a strainer down into the intake bay, a coal heap against the south wall. Roof, chimney, pipe post and coal heap collide.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = 0;
      const x0 = -23, x1 = -17, z0 = -45, z1 = -39, Hw = 5.0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, apex = 7.3;
      const brick = '#bba486', brickDk = '#95574a', stone = '#e0d8c6', slate = '#59636c';
      // stone plinth, string course at the inkable line (2.8), eaves cornice, quoins
      for (const [w, d, x, z] of [[x1 - x0 + 0.1, 0.06, cx, z0 - 0.03], [x1 - x0 + 0.1, 0.06, cx, z1 + 0.03], [0.06, z1 - z0 + 0.1, x0 - 0.03, cz], [0.06, z1 - z0 + 0.1, x1 + 0.03, cz]]) {
        pbox(B, 'paint', stone, w, 0.42, d, x, 0.21, z);
        pbox(B, 'paint', stone, w + (d > 0.05 && w < 0.1 ? 0 : 0.06), 0.14, d + 0.03, x, 2.87, z);
        pbox(B, 'paint', stone, w + 0.1, 0.22, d + 0.1, x, Hw - 0.11, z);
      }
      for (const x of [x0, x1]) for (const z of [z0, z1]) for (let k = 0; k < 9; k++) {
        const y = 0.5 + k * 0.5, big = k % 2 === 0, sx = x === x0 ? 1 : -1, sz = z === z0 ? 1 : -1;
        pbox(B, 'paint', shade(stone, 0.97 + (k % 3) * 0.02), big ? 0.44 : 0.26, 0.42, 0.05, x + sx * ((big ? 0.44 : 0.26) / 2 - 0.02), y + 0.21, z - sz * 0.025);
        pbox(B, 'paint', shade(stone, 0.97 + (k % 3) * 0.02), 0.05, 0.42, big ? 0.26 : 0.44, x - sx * 0.025, y + 0.21, z + sz * ((big ? 0.26 : 0.44) / 2 - 0.02));
      }
      // walls' faces: windows, doors, lettering (each face in its own frame, local +Z out of the wall)
      const face = (x, z, ry, fn) => { B.push(x, 0, z, ry); fn(); B.pop(); };
      face(cx, z1, 0, () => {          // north (toward mid): the lettered panel, a tall window, the oculus in the gable
        archWin(B, 0, 3.05, 1.1, 1.75, { lit: 0.5 });
        pbox(B, 'paint', stone, 3.9, 0.52, 0.06, 0, 4.63, 0.03);
        letters(B, 'PUMPING STATION No 2', { h: 0.2, x: 0, y: 4.55, z: 0.065, c: '#5d3a31', flat: true, wt: 0.2, track: 0.1 });
        for (const sx of [-1.75, 1.75]) pbox(B, NS('paint'), '#5d3a31', 0.08, 0.08, 0.01, sx, 4.63, 0.065);
        B.cyl('paint', stone, 0.52, 0.08, 0, 6.05, 0.0, { rx: HP, seg: 18 });
        B.cyl(NS('gloss'), K.glass, 0.4, 0.02, 0, 6.05, 0.04, { rx: HP, seg: 18 });
        pbox(B, NS('paint'), K.iron, 0.8, 0.03, 0.02, 0, 6.05, 0.055); pbox(B, NS('paint'), K.iron, 0.03, 0.8, 0.02, 0, 6.05, 0.055);
        letters(B, '1902', { h: 0.2, x: 0, y: 5.25, z: 0.03, c: stone, dep: 0.03, wt: 0.2, mat: 'paint' });
      });
      face(cx, z0, PI, () => {         // south: a plain door by the coal heap, a window
        ledgedDoor(B, 1.6, 0, 1.2, 2.3, '#5f7b78', {});
        archWin(B, -1.2, 3.05, 0.9, 1.6, {});
      });
      face(x1, cz, HP, () => {         // east (onto the rail spur): the double door, two tall windows, a wall lamp
        for (const sx of [-0.55, 0.55]) ledgedDoor(B, sx, 0, 1.1, 2.55, '#5f7b78', {});
        pbox(B, 'paint', stone, 2.5, 0.16, 0.08, 0, 2.63, 0.04);
        for (const x of [-2.05, 2.05]) archWin(B, x, 3.05, 1.0, 1.75, { lit: 0.45 });
        B.push(0, 3.35, 0); D.saltpan_lamp.build(B, { variant: 1 }); B.pop(); B.aoBase = 0;
      });
      face(x0, cz, -HP, () => {        // west (the intake bay): two tall windows
        for (const x of [-1.6, 1.6]) archWin(B, x, 3.05, 1.0, 1.75, {});
      });
      // gables: brick triangles above the cornice, stone copings
      const gw = (x1 - x0) / 2 + 0.3, pitch = Math.atan2(apex - Hw, gw);
      const gab = tpl('pgable', () => extrudeGeo([[-gw + 0.3, 0], [gw - 0.3, 0], [0, apex - Hw - 0.25]], 0.3, 0.01));
      for (const z of [z0 + 0.15, z1 - 0.15]) B.add('paint', gab, brick, cx, Hw, z, { ry: HP });
      for (const z of [z0 - 0.05, z1 + 0.05]) for (const s of [-1, 1]) pbeam(B, 'paint', stone, [cx + s * gw, Hw + 0.05, z], [cx, apex + 0.1, z], 0.36, 0.14);
      // slate roof (ridge along Z), lead ridge roll, a roof light
      const sl = Math.hypot(gw, apex - Hw) + 0.1, dep = z1 - z0 + 0.5;
      for (const s of [-1, 1]) {
        B.push(cx + (s * gw) / 2, (Hw + apex) / 2 + 0.06, cz, 0, 0, -s * pitch);
        pbox(B, 'paint', slate, sl, 0.1, dep, 0, 0, 0);
        for (let x = -sl / 2 + 0.15; x < sl / 2; x += 0.3) pbox(B, NS('paint'), shade(slate, 0.9), 0.02, 0.02, dep, x, 0.06, 0);
        if (s > 0) { pbox(B, NS('gloss'), K.glassLt, 1.1, 0.03, 1.6, -0.1, 0.07, -0.6); pbox(B, NS('paint'), K.iron, 1.2, 0.05, 1.7, -0.1, 0.055, -0.6); }
        B.pop();
      }
      B.cyl('metal', '#6b7479', 0.09, dep, cx, apex + 0.08, cz, { rx: HP, seg: 8 });
      B.col(x0 - 0.35, Hw, z0 - 0.3, x1 + 0.35, apex + 0.2, z1 + 0.3, { roof: true });
      // the boiler chimney: a tapered square brick stack through the roof's south end, banded, corbelled cap
      const chx = cx, chz = z0 + 1.1, chB = 5.6, chT = 17.2;
      B.lathe('paint', brick, [[1.0, 0], [0.98, 0.8], [0.72, chT - chB], [0, chT - chB]], chx, chB, chz, { seg: 4, ry: PI / 4 });
      for (const y of [4.2, 8.4]) B.lathe(NS('paint'), stone, [[1.0 - y * 0.023, y], [1.05 - y * 0.023, y + 0.12], [0.99 - y * 0.023, y + 0.26]], chx, chB, chz, { seg: 4, ry: PI / 4 });
      B.lathe('paint', brickDk, [[0.78, chT - chB - 0.05], [0.95, chT - chB + 0.2], [0.95, chT - chB + 0.55], [0.68, chT - chB + 0.6], [0, chT - chB + 0.55]], chx, chB, chz, { seg: 4, ry: PI / 4 });
      B.col(chx - 0.75, Hw, chz - 0.75, chx + 0.75, chT + 0.6, chz + 0.75, { roof: true });
      B.blink('#ff3b2a', chx, chT + 0.8, chz, { size: 0.08, rate: 0.4, phase: 2.1, lo: 0.3, hi: 4 });
      // rising main: out of the east wall at 4.5, across the spur on a steel post, into the header tank's lid
      const my = 4.55, mz = -42.3;
      B.tube('metal', '#5d6f74', [P3(x1, my, mz), P3(-15.3, my, mz), P3(-11.9, my, mz), P3(-11.35, my - 0.05, mz), P3(-11.2, my - 0.3, mz)], 0.11, { radial: 8 });
      for (const x of [-16.4, -14.6, -12.8]) B.cyl(NS('metal'), K.iron, 0.16, 0.06, x, my, mz, { rz: HP, seg: 10 });
      B.box('metal', K.iron, 0.16, my - 0.1, 0.16, -15.3, (my - 0.1) / 2, mz - 0.25, { r: 0.02 });
      pbox(B, 'metal', K.iron, 0.5, 0.08, 0.5, -15.3, my - 0.1, mz - 0.1);
      B.col(-15.4, 0, mz - 0.35, -15.2, my, mz - 0.15, { roof: true });
      pbox(B, NS('metal'), K.navy, 0.3, 0.3, 0.3, x1 + 0.25, my, mz);
      B.tor(NS('metal'), K.red, 0.16, 0.018, x1 + 0.25, my + 0.27, mz, { rs: 4, ts: 14 });
      // suction pipe: out of the west wall at 2.5 (walk under it), over the strip and down into the bay, a strainer
      const sy = 2.55, sz = -41.2;
      B.tube('metal', '#5d6f74', [P3(x0, sy, sz), P3(-25.7, sy, sz), P3(-26.25, sy - 0.15, sz), P3(-26.45, sy - 0.8, sz), P3(-26.45, -1.2, sz)], 0.13, { radial: 8 });
      pbox(B, NS('metal'), K.rustDk, 0.5, 0.6, 0.5, -26.45, -1.45, sz);
      for (const y of [1.2, -0.2]) pbox(B, NS('metal'), K.iron, 0.9, 0.08, 0.1, -26.1, y, sz);
      B.cyl(NS('metal'), K.iron, 0.18, 0.06, x0 - 0.05, sy, sz, { rx: HP, seg: 10 });
      // the coal heap for the boiler against the south wall, in a timber bin
      for (const [w, d, x, z] of [[3.2, 0.1, cx, z0 - 1.7], [0.1, 1.7, cx - 1.55, z0 - 0.85], [0.1, 1.7, cx + 1.55, z0 - 0.85]]) B.box('wood', K.timberOld, w, 0.9, d, x, 0.45, z, { r: 0.015 });
      B.add('rubber', moundGeo(3.0, 1.6, 1.15, 4), '#34322f', cx, 0, z0 - 0.85, {});
      B.col(cx - 1.6, 0, z0 - 1.75, cx + 1.6, 1.0, z0);
      B.blob(3.6, 2.2, cx, z0 - 0.9);
    },
  };

  // ------------------------------------------------------------------------------------------ the loading platform
  // Stage coordinates (place at the origin). Level stage x -12.5…-4 / z -44…-37 / top 1.5 (layout.js pump-stage), its
  // north stair x -10…-7 from (0, -33.2) up to (1.5, -37), the east steps z -39…-37.4 from (-0.3, 0) up to (-4, 1.5),
  // the south ramp x -12.5…-10.5 from (0, -51) up to (1.5, -44).
  D.saltpan_stage = {
    desc: 'Loading-platform dressing (stage coordinates, place at the origin): posted timber faces with a sill and a coping, an iron rubbing strip along the rail-spur side, the north stair\'s stringers, newels and handrails (rail colliders), the east steps\' stringers, the south ramp\'s kerbs, a BRINE STAGE board. Non-colliding except the handrails.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = 0;
      const x0 = -12.5, x1 = -4, z0 = -44, z1 = -37, top = 1.5;
      // coping + sill all round, posts on the faces (skipping the stair / steps openings)
      for (const [w, d, x, z] of [[x1 - x0 + 0.14, 0.14, (x0 + x1) / 2, z0 - 0.03], [x1 - x0 + 0.14, 0.14, (x0 + x1) / 2, z1 + 0.03], [0.14, z1 - z0, x0 - 0.03, (z0 + z1) / 2], [0.14, z1 - z0, x1 + 0.03, (z0 + z1) / 2]]) {
        pbox(B, 'wood', K.timberLt, w, 0.1, d, x, top - 0.04, z);
        pbox(B, NS('wood'), K.tar, w, 0.22, d, x, 0.11, z);
      }
      const post = (x, z) => B.box('wood', K.timberOld, 0.18, top - 0.12, 0.18, x, (top - 0.12) / 2, z, { r: 0.02 });
      for (let x = x0 + 0.1; x <= x1 - 0.09; x += 1.4) { if (x < -10.05 || x > -6.95) post(x, z1 + 0.06); post(x, z0 - 0.06); }
      for (let z = z0 + 0.1; z <= z1 - 0.09; z += 1.4) { post(x0 - 0.06, z); if (z < -39.05) post(x1 + 0.06, z); }
      // iron rubbing strip + wagon stops along the spur side
      pbox(B, 'metal', K.iron, 0.06, 0.12, z1 - z0, x0 - 0.1, 1.1, (z0 + z1) / 2);
      for (const z of [-42.8, -38.3]) pbox(B, NS('metal'), K.rustDk, 0.14, 0.3, 0.3, x0 - 0.12, 1.05, z);
      // north stair (x -10…-7): stringers, newels, handrails (the stair's sides take no ink, layout.js)
      const sy = (z) => (top * (-33.2 - z)) / 3.8;
      for (const x of [-10.02, -6.98]) {
        pbeam(B, 'wood', K.timberDk, [x, -0.05, -32.85], [x, top - 0.05, -37.02], 0.1, 0.34);
        const pts = [[x, 0, -33.3], [x, sy(-34.7), -34.7], [x, sy(-36.1), -36.1], [x, top, -37.1]];
        for (const p of pts) B.box('wood', K.timberDk, 0.1, 1.0, 0.1, p[0], p[1] + 0.5, p[2], { r: 0.015 });
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1];
          pbeam(B, 'wood', K.timberLt, [a[0], a[1] + 1.0, a[2]], [b[0], b[1] + 1.0, b[2]], 0.09, 0.07);
          pbeam(B, NS('wood'), K.timberDk, [a[0], a[1] + 0.5, a[2]], [b[0], b[1] + 0.5, b[2]], 0.05, 0.05);
          railCols(B, a, b, 1.05, 0.12, 0.6);
        }
        B.box('wood', K.timberDk, 0.2, 1.15, 0.2, x, 0.575, -33.3, { r: 0.03 });
        B.box(NS('wood'), K.endgrain, 0.26, 0.06, 0.26, x, 1.18, -33.3, { r: 0.01 });
      }
      // east steps (z -39…-37.4): stringers only (open steps off the causeway)
      for (const z of [-39.02, -37.38]) pbeam(B, 'wood', K.timberDk, [0.25, -0.05, z], [-4.02, top - 0.05, z], 0.08, 0.3);
      // south ramp (x -12.5…-10.5): tarred kerbs along both sides
      for (const x of [-12.52, -10.48]) pbeam(B, 'wood', K.tar, [x, 0.02, -51.5], [x, top + 0.02, -44], 0.1, 0.16);
      // the stage's name board on the east face, over the steps
      B.push(x1 + 0.02, 0, -41.2, HP);
      boardSign(B, 'BRINE STAGE', 0, 1.0, 0, { h: 0.16, board: '#33405a', c: K.cream, hb: 0.28 });
      B.pop();
    },
  };

  // ------------------------------------------------------------------------------------------ salt cones
  D.saltpan_cone = {
    desc: 'Salt cone: a big conical stockpile of harvested salt (radius r, height h) on a ring of tarred heap boards; variant 0 fresh white salt with a shovel stuck in it, 1 under a weighted grey tarp with tyres. The body collides as two stepped boxes, roof-flagged (nobody stands on a cone: you slide off).',
    params: { r: 'm (2.4)', h: 'm (2.6)' }, variants: 2, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 2, R = o.r ?? 2.4, Hh = o.h ?? 2.6;
      if (v === 0) {
        mound(B, R * 2, R * 2, Hh, 0, 0, 0, { seed: 3 });
        rodT(B, 'wood', K.timberLt, P3(R * 0.45, Hh * 0.52, 0.3), P3(R * 0.95, Hh * 0.52 + 0.9, 0.55), 0.02, 5);
        B.box('metal', K.galvDk, 0.3, 0.02, 0.26, R * 0.42, Hh * 0.5, 0.28, { r: 0.008, rz: 0.9 });
      } else {
        const prof = []; for (let k = 0; k <= 8; k++) { const t = k / 8; prof.push([R * 1.02 * (1 - t) + 0.05, Hh * (0.6 * t + 0.4 * (1 - (1 - t) * (1 - t))) * 1.02 + 0.02]); } prof.push([0, Hh + 0.06]);
        B.lathe('rubber', '#5a6560', prof, 0, 0, 0, { seg: 14 });
        for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + 0.3, rr = R * 0.62, t = 1 - (rr - 0.05) / (R * 1.02), h = Hh * (0.6 * t + 0.4 * (1 - (1 - t) * (1 - t))) * 1.02 + 0.04; B.lathe('rubber', '#2d2e31', H.TIRE, Math.cos(a) * rr, h, Math.sin(a) * rr, { seg: 12, closed: true, rz: Math.cos(a) * 0.7, rx: -Math.sin(a) * 0.7 }); }
        B.lathe('rubber', '#2d2e31', H.TIRE, 0, Hh + 0.02, 0, { seg: 12, closed: true });
      }
      // tarred heap boards round the foot
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; B.box('wood', shade(K.tar, B.r(1.0, 1.4)), R * 0.64, 0.3, 0.07, Math.cos(a) * (R + 0.05), 0.15, Math.sin(a) * (R + 0.05), { ry: -a + HP, r: 0.01 }); }
      const a = R * 0.78, b = R * 0.46;
      B.col(-a, 0, -a, a, Hh * 0.5, a, { roof: true });
      B.col(-b, Hh * 0.5, -b, b, Hh * 0.92, b, { roof: true });
      B.blob(R * 2.6, R * 2.6);
    },
  };

  // ------------------------------------------------------------------------------------------ the stacker
  // a radial stacker conveyor building a cone: boom along local +X from the tail hopper (x 0, belt 0.9) up to the head
  // (x L, belt `head`), on a wheeled A-frame; head drum, discharge stream of salt. Tail hopper + A-frame collide (roof).
  D.saltpan_stacker = {
    desc: 'Radial stacker conveyor (boom along local +X, tail at pos): lattice truss boom with a troughed belt of salt rising from a small feed hopper to a head drum and a discharge stream of salt, on a two-wheeled A-frame undercarriage with a drawbar, a drive motor in a hood at the head. Tail hopper and undercarriage collide, roof-flagged.',
    params: { length: 'm (6.5)', head: 'belt height at the head m (3.4)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 6.5, hy = o.head ?? 3.4, ty = 0.95, a = Math.atan2(hy - ty, L), stl = '#8e979b', stlDk = '#6d7478';
      const at = (t) => [t * L, ty + t * (hy - ty)];
      // boom: two chords per side + lacing, belt on top
      for (const sz of [-0.34, 0.34]) {
        for (const dy of [-0.08, -0.5]) { const [xa, ya] = at(0), [xb, yb] = at(1); pbeam(B, 'metal', stl, [xa, ya + dy, sz], [xb, yb + dy, sz], 0.06, 0.06); }
        for (let k = 0; k < 8; k++) { const [xa, ya] = at(k / 8), [xb, yb] = at((k + 1) / 8); pbeam(B, NS('metal'), stlDk, [xa, ya - 0.08, sz], [xb, yb - 0.5, sz], 0.03, 0.03); }
      }
      B.push(L / 2, (ty + hy) / 2, 0, 0, 0, a);
      const BL = Math.hypot(L, hy - ty);
      pbox(B, 'rubber', '#2d2f33', BL, 0.03, 0.5, 0, 0.02, 0);
      B.add('rubber', moundGeo(BL - 0.3, 0.36, 0.08, 5), 'white', 0, 0.02, 0, {});
      for (let k = 0; k < 7; k++) pbox(B, NS('metal'), K.galvDk, 0.05, 0.05, 0.72, -BL / 2 + 0.3 + k * ((BL - 0.6) / 6), -0.06, 0);
      B.pop();
      // head drum + motor hood + the salt stream falling onto the cone
      const [hx] = at(1);
      B.cyl('metal', K.iron, 0.22, 0.72, hx, hy, 0, { rx: HP, seg: 12 });
      B.box('paint', '#6f8583', 0.6, 0.45, 0.4, hx - 0.4, hy + 0.1, 0.55, { r: 0.03 });
      B.tube(NS('rubber'), K.salt, [P3(hx + 0.15, hy - 0.1, 0), P3(hx + 0.35, hy - 0.8, 0), P3(hx + 0.4, hy - 1.6, 0)], 0.1, { radial: 6 });
      // A-frame on wheels under the middle, drawbar at the tail
      const mx = L * 0.55, [, my] = at(0.55);
      for (const sz of [-0.6, 0.6]) {
        pbeam(B, 'metal', stl, [mx - 0.7, 0.35, sz], [mx, my - 0.5, sz * 0.5], 0.08, 0.08);
        pbeam(B, 'metal', stl, [mx + 0.7, 0.35, sz], [mx, my - 0.5, sz * 0.5], 0.08, 0.08);
        B.cyl('rubber', '#2d2e31', 0.32, 0.18, mx, 0.32, sz * 1.1, { rx: HP, seg: 14 });
        B.cyl(NS('metal'), K.galvDk, 0.16, 0.2, mx, 0.32, sz * 1.1, { rx: HP, seg: 10 });
      }
      pbeam(B, 'metal', stlDk, [mx, 0.32, -0.66], [mx, 0.32, 0.66], 0.06, 0.06);
      pbeam(B, NS('metal'), stlDk, [-0.2, 0.3, 0], [mx - 0.7, 0.35, 0], 0.07, 0.07);
      // feed hopper at the tail
      for (const [w, d, x, z, rx, rz] of [[1.3, 0.05, 0.1, -0.5, -0.4, 0], [1.3, 0.05, 0.1, 0.5, 0.4, 0], [0.05, 1.0, -0.55, 0, 0, 0.4], [0.05, 1.0, 0.75, 0, 0, -0.4]]) pbox(B, 'metal', '#7f878b', w, 0.7, d, x, ty + 0.35, z, { rx, rz });
      for (const sx of [-0.4, 0.6]) for (const sz of [-0.35, 0.35]) B.box('metal', stlDk, 0.08, ty, 0.08, sx, ty / 2, sz, { r: 0.01 });
      B.col(-0.6, 0, -0.55, 0.8, ty + 0.7, 0.55, { roof: true });
      B.col(mx - 0.8, 0, -0.75, mx + 0.8, 1.0, 0.75, { roof: true });
      B.blob(2.2, 1.6, mx, 0); B.blob(1.6, 1.4, 0.1, 0);
    },
  };
}

// ================================================================================================ placements
// Alpha half (−Z); every entry is mirrored (x,z) → (−x,−z), rotY + π unless `mirror: false`. Site-specific structure
// dressing (store, gallery, office, shed, heap, gantry, pump house, loading platform) is authored in stage coordinates
// and placed at the origin. The base (store, gallery, yard, office quay, creek) keeps its original numbers in BASE and
// is moved out by the stretch (layout.js STRETCH, back()); the slice between is SLICE, in place.
const H2 = P / 2;
const DZ = STRETCH.d;
const back = (p) => ({ ...p, pos: [p.pos[0], p.pos[1], p.pos[2] - DZ] });
const MID = [
  // ---- structures
  { type: 'saltpan_shed', pos: [0, 0, 0], notIn: 'zones' },
  { type: 'saltpan_shed', pos: [0, 0, 0], zones: true, onlyIn: 'zones' },
  { type: 'saltpan_heap', pos: [0, 0, 0] },
  { type: 'saltpan_gantry', pos: [0, 0, 0], notIn: 'tower' },
  { type: 'saltpan_windpump', pos: [0, 0.08, 0], rotY: 0.62, mirror: false, notIn: 'tower' },
  { type: 'saltpan_launder', pos: [0.75, 0.08, -0.32], length: 2.7, height: 0.85, notIn: 'tower' },
  { type: 'saltpan_staging', pos: [0, 0.08, 0], mirror: false, notIn: 'tower' },
  { type: 'saltpan_hut', pos: [24.6, 0, -5.0], rotY: -H2 },

  // ---- narrow-gauge railway: the shed-dock spur (from the yard line, now 24 m further out: across the slice past the
  //      pump house), sluice-dyke track, heap-face spur, mid siding
  { type: 'saltpan_rail', pos: [-13.5, 0, -30.9 - DZ], path: [[0, 0], [0, 12.4 + DZ], [-0.5, 14.8 + DZ], [-2.2, 16.1 + DZ], [-4.4, 16.3 + DZ], [-8.3, 16.3 + DZ]], notIn: 'zones' },
  { type: 'saltpan_buffer', pos: [-21.9, 0, -14.6], rotY: P, notIn: 'zones' },
  // Zone Control: the dock spur stops at the turntable, leaving the dock front open for the east dock steps (layout.js)
  { type: 'saltpan_rail', pos: [-13.5, 0, -30.9 - DZ], path: [[0, 0], [0, 14.5 + DZ]], onlyIn: 'zones' },
  { type: 'saltpan_buffer', pos: [-13.5, 0, -16.35], rotY: -H2, onlyIn: 'zones' },
  { type: 'saltpan_turntable', pos: [-13.5, 0, -17.7] },
  { type: 'saltpan_rail', pos: [-12.7, 0, -17.7], length: 23.0 },
  { type: 'saltpan_buffer', pos: [10.35, 0, -17.7], rotY: 0 },
  { type: 'saltpan_rail', pos: [12.4, 0, -8.7], length: 10.6 },
  { type: 'saltpan_buffer', pos: [23.05, 0, -8.7], rotY: 0 },
  { type: 'saltpan_rail', pos: [14.2, 0, -4.4], length: 10.2 },
  { type: 'saltpan_buffer', pos: [24.45, 0, -4.4], rotY: 0 },

  // ---- tipper wagons (cover)
  { type: 'saltpan_wagon', pos: [-16.9, 0, -14.6], variant: 0, notIn: 'zones' },
  { type: 'saltpan_wagon', pos: [-18.8, 0, -14.6], variant: 1, notIn: 'zones' },
  { type: 'saltpan_wagon', pos: [-5.8, 0, -17.7], variant: 0, notIn: 'tower' },
  { type: 'saltpan_wagon', pos: [4.6, 0, -17.7], variant: 1 },
  { type: 'saltpan_wagon', pos: [16.6, 0, -8.7], variant: 0, notIn: 'tower' },
  { type: 'saltpan_wagon', pos: [18.5, 0, -8.7], variant: 1, notIn: 'tower' },
  { type: 'saltpan_wagon', pos: [19.4, 0, -4.4], variant: 0, notIn: 'tower' },
  { type: 'saltpan_rail', pos: [-12.6, -1.2, -2.3], length: 6.2 },
  { type: 'saltpan_buffer', pos: [-6.2, -1.2, -2.3], rotY: 0 },
  { type: 'saltpan_wagon', pos: [-9.6, -1.2, -2.3], variant: 0, color: '#9a5d42' },

  // ---- salt in the pans
  { type: 'saltpan_saltrow', pos: [5.2, -0.6, -27.3], variant: 0, length: 6 },
  { type: 'saltpan_saltrow', pos: [4.6, -0.6, -24.6], variant: 0, length: 5 },
  { type: 'saltpan_saltrow', pos: [5.6, -0.6, -22.0], variant: 0, length: 5.5 },
  { type: 'saltpan_saltrow', pos: [-10.6, -0.6, -24.8], variant: 1, count: 3 },
  { type: 'saltpan_saltrow', pos: [-9.6, -0.6, -28.2], variant: 2, height: 0.8 },
  { type: 'saltpan_saltrow', pos: [-7.2, -0.9, -13.5], variant: 2 },
  { type: 'saltpan_saltrow', pos: [7.6, -0.9, -13.4], variant: 0, length: 4.5 },
  { type: 'saltpan_saltrow', pos: [-10.3, -1.2, -5.9], variant: 0, length: 3.6 },
  { type: 'saltpan_saltrow', pos: [6.8, -1.2, -5.4], variant: 2, height: 0.9 },
  { type: 'saltpan_saltrow', pos: [-20.6, 0, -11.2], variant: 2, height: 1.05 },
  { type: 'saltpan_saltrow', pos: [-24.4, 0, -9.3], variant: 1, count: 2, height: 0.5 },

  // ---- sluices (culvert mouths on the pan walls)
  { type: 'saltpan_sluice', pos: [-8.2, 0, -19.0], walls: [[-1.0, 0.6], [2.0, 0.9]], open: 0.5, notIn: 'tower' },
  { type: 'saltpan_sluice', pos: [8.0, 0, -19.0], walls: [[-1.0, 0.6], [2.0, 0.9]], open: 0.25 },
  { type: 'saltpan_sluice', pos: [7.2, 0, -9.0], walls: [[-1.0, 0.9], [1.0, 1.2]], open: 0.6, notIn: 'tower' },

  // ---- pan walls: timber revetment posts
  { type: 'saltpan_revet', pos: [-12, 0, -30], rotY: 0, length: 21, depth: 0.6 },
  { type: 'saltpan_revet', pos: [9, 0, -20], rotY: P, length: 21, depth: 0.6 },
  { type: 'saltpan_revet', pos: [-12, 0, -20], rotY: H2, length: 10, depth: 0.6 },
  { type: 'saltpan_revet', pos: [9, 0, -30], rotY: -H2, length: 10, depth: 0.6 },
  { type: 'saltpan_revet', pos: [-12, 0, -17], rotY: 0, length: 23, depth: 0.9 },
  { type: 'saltpan_revet', pos: [11, 0, -10], rotY: P, length: 23, depth: 0.9 },
  { type: 'saltpan_revet', pos: [-12, 0, -10], rotY: H2, length: 7, depth: 0.9 },
  { type: 'saltpan_revet', pos: [11, 0, -17], rotY: -H2, length: 7, depth: 0.9 },
  { type: 'saltpan_revet', pos: [-13, 0, -8], rotY: 0, length: 26, depth: 1.2 },
  { type: 'saltpan_revet', pos: [13, 0, -8], rotY: -H2, length: 16, depth: 1.2 },

  // ---- boardwalk structures
  { type: 'saltpan_bwposts', pos: [-2.7, 0.08, -30.0], rotY: -H2, length: 10, width: 1.8, drop: 0.68, rail: 1, lamps: true, notIn: 'tower' },
  { type: 'saltpan_bwposts', pos: [3.63, 0.08, -17.0], rotY: -2.234, length: 8.9, width: 1.8, drop: 0.98, rail: -1, notIn: 'tower' },
  { type: 'saltpan_bwposts', pos: [2.3, 0.08, -8.0], rotY: -H2, length: 4.4, width: 1.8, drop: 1.28, notIn: 'tower' },
  { type: 'saltpan_bwposts', pos: [3.6, 0.08, -1.7], rotY: 0, length: 9.4, width: 1.8, drop: 1.28, rail: -1, lamps: true, notIn: 'tower' },

  // ---- loading dock + yard clutter
  { type: 'saltpan_sacks', pos: [-24.4, 1.1, -16.3], variant: 0, rows: 4, notIn: 'zones' },
  { type: 'saltpan_sacks', pos: [-24.4, 1.1, -17.45], variant: 0, rows: 7, notIn: 'zones' },
  // Zone Control: the same two pallets pushed up against the stair landing — steps of sacks, dock 1.1 → 2.0 → 2.6 →
  // the landing / the eave (3.2), with no slot left between the stack and the landing
  { type: 'saltpan_sacks', pos: [-23.62, 1.1, -16.3], variant: 0, rows: 4, onlyIn: 'zones' },
  { type: 'saltpan_sacks', pos: [-23.62, 1.1, -17.45], variant: 0, rows: 7, onlyIn: 'zones' },
  { type: 'saltpan_crane', pos: [-16.9, 1.1, -16.1], rotY: 0, notIn: 'zones' },
  { type: 'saltpan_scale', pos: [-20.4, 1.1, -16.9], rotY: 0, notIn: 'zones' },
  { type: 'saltpan_sacks', pos: [-18.9, 1.1, -17.35], variant: 2, count: 3, rotY: 0.1, notIn: 'zones' },
  // Zone Control: the facade stair takes the dock's back half (layout.js) — the jib crane moves to the west end
  { type: 'saltpan_crane', pos: [-25.55, 1.1, -15.85], rotY: 0, onlyIn: 'zones' },
  { type: 'saltpan_sacks', pos: [-14.6, 0, -27.6], variant: 0, rows: 3, rotY: 0.2 },
  { type: 'saltpan_sacks', pos: [19.6, 0, -1.8], variant: 0, rows: 2, rotY: 0.3 },
  { type: 'saltpan_sacks', pos: [-16.3, 0, -12.4], variant: 0, rows: 2, rotY: -0.2, notIn: 'zones' },
  { type: 'saltpan_sacks', pos: [-19.9, 0, -13.1], variant: 0, rows: 2, rotY: 0.15, onlyIn: 'zones' },
  { type: 'saltpan_sacks', pos: [-15.8, 0, -11.2], variant: 1, rotY: 2.2 },
  { type: 'saltpan_sacks', pos: [15.4, 0, -26.8], variant: 1, rotY: 1.1 },
  { type: 'saltpan_barrow', pos: [-6.2, -0.6, -26.8], rotY: 0.4, variant: 0 },
  { type: 'saltpan_barrow', pos: [-10.3, -0.9, -15.2], rotY: -0.9, variant: 1 },
  { type: 'saltpan_barrow', pos: [-3.8, -1.2, -6.1], rotY: 2.6, variant: 0 },
  { type: 'saltpan_barrow', pos: [-14.4, 0, -10.8], rotY: 1.9, variant: 0, notIn: 'tower' },
  { type: 'saltpan_tools', pos: [-1.5, 0, -19.3], rotY: 0.05, variant: 2, notIn: 'tower' },
  { type: 'saltpan_tools', pos: [8.6, -0.6, -25.9], rotY: -0.3, variant: 0 },
  { type: 'saltpan_tools', pos: [-11.3, -1.2, -3.2], rotY: 1.2, variant: 2 },

  // ---- lighting
  { type: 'saltpan_lamp', pos: [-12.6, 0, -24.8], rotY: -H2 + 0.3 },
  { type: 'saltpan_lamp', pos: [11.5, 0, -8.6], rotY: P - 0.4, notIn: 'tower' },
  { type: 'saltpan_lamp', pos: [-12.5, 0, -8.6], rotY: 0.5, notIn: 'tower' },
  { type: 'saltpan_lamp', pos: [25.2, 0, -7.0], rotY: -H2 },

  // ---- signs (pan boards are per side)
  { type: 'saltpan_sign', pos: [10.2, 0, -30.35], rotY: P, text: 'PAN 2', mirror: false },
  { type: 'saltpan_sign', pos: [-10.2, 0, 30.35], rotY: 0, text: 'PAN 7', mirror: false },
  { type: 'saltpan_sign', pos: [-11.2, 0, -17.35], rotY: P, text: 'PAN 3', h: 0.26, mirror: false, notIn: 'tower' },
  { type: 'saltpan_sign', pos: [11.2, 0, 17.35], rotY: 0, text: 'PAN 6', h: 0.26, mirror: false, notIn: 'tower' },
  { type: 'saltpan_sign', pos: [-12.4, 0, -8.8], rotY: P + 0.4, text: 'GREAT PAN', h: 0.24, mirror: false, notIn: 'tower' },
  { type: 'saltpan_sign', pos: [12.4, 0, 8.8], rotY: 0.4, text: 'GREAT PAN', h: 0.24, mirror: false, notIn: 'tower' },
  { type: 'saltpan_sign', pos: [-12.3, 0, -19.9], rotY: P, variant: 2, text: 'SOFT BRINE' },
  { type: 'saltpan_sign', pos: [12.4, 0, -29.6], rotY: P, variant: 2, text: 'NO BARROWS', board: '#ffffff', color: '#b8493d' },

  // ---- the timber quay edges along the mid-side outline
  { type: 'saltpan_seaedge', pos: [26, 0, -24], rotY: H2, length: 21, post: true },
  { type: 'saltpan_seaedge', pos: [24.2, 0, -24], rotY: 0, length: 1.8 },
  { type: 'saltpan_seaedge', pos: [24.2, 0, -14], rotY: H2, length: 10 },
  { type: 'saltpan_seaedge', pos: [26, 0, -12.2], rotY: 3 * P / 4, length: 2.55 },
  { type: 'saltpan_seaedge', pos: [26, 0, -8], rotY: H2, length: 4.2 },
  { type: 'saltpan_seaedge', pos: [27, 0, -8], rotY: P, length: 1 },
  { type: 'saltpan_seaedge', pos: [29, 0, -6], rotY: 3 * P / 4, length: 2.83 },
  { type: 'saltpan_seaedge', pos: [29, 0, -4], rotY: H2, length: 2, post: true },
  { type: 'saltpan_seaedge', pos: [27, 0, -2], rotY: P / 4, length: 2.83 },
  { type: 'saltpan_seaedge', pos: [23, 0, -2], rotY: 0, length: 4 },
  { type: 'saltpan_seaedge', pos: [23, 0, 8], rotY: H2, length: 10 },
  { type: 'saltpan_seaedge', pos: [-26, 0, -8], rotY: 0, length: 3 },
  { type: 'saltpan_seaedge', pos: [-26, 0, -11], rotY: -H2, length: 3 },
  { type: 'saltpan_seaedge', pos: [-30, 0, -15], rotY: -P / 4, length: 5.66 },
  { type: 'saltpan_seaedge', pos: [-30, 0, -26], rotY: -H2, length: 11, post: true },

  // ---- the shed quay's far side (the path round the shed): a quay crane over the water, sacks, a barrow
  { type: 'saltpan_crane', pos: [-28.6, 0, -23.2], rotY: -H2 },
  { type: 'saltpan_sacks', pos: [-28.3, 0, -17.8], variant: 0, rows: 2, rotY: H2 },
  { type: 'saltpan_sacks', pos: [-27.6, 0, -20.4], variant: 1, rotY: 0.7 },
  { type: 'saltpan_barrow', pos: [-28.4, 0, -14.4], rotY: 2.2, variant: 0 },
  { type: 'saltpan_samphire', pos: [25.2, 0, -12.6], rotY: -H2, variant: 1 },
  { type: 'saltpan_gull', pos: [29.0, 0.68, -5.0], rotY: 1.3 },

  // ---- salt-marsh glasswort along the sea edges, dyke corners and the yard
  { type: 'saltpan_samphire', pos: [25.0, 0, -29.4], rotY: -H2, length: 3.2 },
  { type: 'saltpan_samphire', pos: [25.1, 0, -9.6], rotY: -H2, length: 3.5 },
  { type: 'saltpan_samphire', pos: [24.8, 0, -37.6], rotY: -H2, length: 5 },
  { type: 'saltpan_samphire', pos: [-29.3, 0, -25.4], rotY: -H2, length: 4 },
  { type: 'saltpan_samphire', pos: [-25.3, 0, -12.2], rotY: -H2, length: 3.4 },
  { type: 'saltpan_samphire', pos: [12.2, 0, -29.5], rotY: -H2, length: 2.4 },
  { type: 'saltpan_samphire', pos: [-12.6, 0, -29.6], rotY: 0.1, variant: 1 },
  { type: 'saltpan_samphire', pos: [10.6, 0, -19.6], variant: 1 },
  { type: 'saltpan_samphire', pos: [-11.6, 0, -9.6], variant: 1 },
  { type: 'saltpan_samphire', pos: [13.6, 0, -7.4], rotY: 0.3, length: 2.2 },
  { type: 'saltpan_samphire', pos: [22.3, 0, 7.4], rotY: P, length: 2.5 },
  { type: 'saltpan_samphire', pos: [14.2, 0, 7.4], variant: 1 },

  // ---- small works clutter: staff gauges, marker stakes, spare sleepers, drums
  { type: 'saltpan_gauge', pos: [-11.6, -0.6, -20.5], rotY: P },
  { type: 'saltpan_gauge', pos: [10.6, -0.9, -16.5], rotY: -H2 },
  { type: 'saltpan_gauge', pos: [12.6, -1.2, -7.6], rotY: -H2 },
  { type: 'saltpan_stakes', pos: [-11.7, 0, -30.4], rotY: 0, length: 4 },
  { type: 'saltpan_stakes', pos: [11.3, 0, -16.8], rotY: -H2, length: 6 },
  { type: 'saltpan_sleepers', pos: [20.8, 0, 1.4], rotY: 1.2, rows: 3 },

  // ---- gulls on the works' perches, a warning plate at the heap
  { type: 'saltpan_gull', pos: [-7.9, 1.73, -19.0], rotY: 2.6, variant: 1, notIn: 'tower' },
  { type: 'saltpan_gull', pos: [0.3, 9.15, -0.3], rotY: 0.9, mirror: false, notIn: 'tower' },
  { type: 'saltpan_gull', pos: [21.75, 5.62, -11.9], rotY: -2.2, variant: 1 },
  { type: 'saltpan_gull', pos: [11.3, 1.02, -12.8], rotY: 1.9 },
  { type: 'saltpan_sign', pos: [11.2, 0, -25.4], rotY: -H2 + 0.3, variant: 2, text: 'KEEP OFF THE HEAP', board: '#ffffff', color: '#b8493d' },
  { type: 'saltpan_sign', pos: [-14.4, 0, -25.6], rotY: P, variant: 2, text: 'LOFT', board: '#f1c95c' },

  // ---- out on the tidal flat: evaporation ponds, a distant wind pump and camelle (either side of the stage)
  { type: 'saltpan_ponds', pos: [38, 0, 0], rotY: H2, w: 82, d: 60, seed: 11, pump: [38, 24] },
  { type: 'saltpan_ponds', pos: [38, 0, 82], rotY: H2, w: 82, d: 60, seed: 23, camelle: [32, 38, 26] },
  { type: 'saltpan_flamingos', pos: [45, -1.33, -14], count: 8, radius: 4 },
  { type: 'saltpan_flamingos', pos: [52, -1.33, 22], count: 5, radius: 3 },
];

// ---- the base, moved out by the stretch (original numbers; back() adds -DZ to z)
const BASE = [
  { type: 'saltpan_store', pos: [0, 0, 0] },
  { type: 'saltpan_gallery', pos: [0, 0, 0] },
  { type: 'saltpan_office', pos: [0, 0, 0] },
  // the yard line along the front of the store, its wagons
  { type: 'saltpan_rail', pos: [-17.2, 0, -31.3], length: 34.7 },
  { type: 'saltpan_buffer', pos: [-17.3, 0, -31.3], rotY: P },
  { type: 'saltpan_buffer', pos: [17.55, 0, -31.3], rotY: 0 },
  { type: 'saltpan_wagon', pos: [-10.4, 0, -31.3], variant: 0 },
  { type: 'saltpan_wagon', pos: [-8.5, 0, -31.3], variant: 0 },
  { type: 'saltpan_wagon', pos: [6.9, 0, -31.3], variant: 1 },
  { type: 'saltpan_wagon', pos: [16.4, 0, -31.3], variant: 1 },
  // yard + gallery clutter
  { type: 'saltpan_sacks', pos: [-10.6, 0, -37.6], variant: 0, rows: 3 },
  { type: 'saltpan_sacks', pos: [-7.9, 2.4, -42.4], variant: 0, rows: 2, rotY: 0.1 },
  { type: 'saltpan_sacks', pos: [3.9, 2.4, -40.4], variant: 2, count: 2, rotY: -H2 },
  { type: 'saltpan_barrow', pos: [3.8, 2.4, -42.6], rotY: 2.8, variant: 1 },
  { type: 'saltpan_sacks', pos: [-12.3, 0, -37.2], variant: 1, rotY: 0.6 },
  { type: 'saltpan_sacks', pos: [3.8, 0, -35.3], variant: 1, rotY: -0.4 },
  { type: 'saltpan_barrow', pos: [2.9, 0, -35.2], rotY: -0.2, variant: 1 },
  { type: 'saltpan_tools', pos: [-17.8, 0, -39.4], rotY: 0, variant: 1 },
  { type: 'saltpan_lamp', pos: [-13.0, 0, -36.2], rotY: 0.2 },
  { type: 'saltpan_lamp', pos: [11.8, 0, -35.2], rotY: -0.3 },
  { type: 'saltpan_sleepers', pos: [-15.2, 0, -34.2], rotY: 0.2 },
  { type: 'barrel', pos: [-19.4, 0, -39.3], variant: 1, color: '#5d7082', color2: '#b8493d' },
  { type: 'barrel', pos: [-18.8, 0, -39.0], variant: 0, color: '#8d6e4f' },
  { type: 'barrel', pos: [13.2, 0, -38.8], variant: 1, color: '#6f848b', color2: '#e8e0cf' },
  { type: 'saltpan_gull', pos: [-2.0, 8.93, -44.3], rotY: 1.2 },
  // the diagonal causeway over the creek (railed both sides), a gull on its post
  { type: 'saltpan_bwposts', pos: [-20.2, 0.08, -38.4], rotY: -2.071, length: 14.6, width: 1.8, drop: 2.7, rail: 2 },
  { type: 'saltpan_gull', pos: [-24.42, 0.95, -31.62], rotY: -0.4 },
  // the quay edges round the yard, the office quay and the creek (the creek's north bank, z -26 here, is the intake
  // quay's south edge once moved)
  { type: 'saltpan_seaedge', pos: [-12, 0, -46], rotY: P, length: 14 },
  { type: 'saltpan_seaedge', pos: [14, 0, -46], rotY: P, length: 6 },
  { type: 'saltpan_seaedge', pos: [14, 0, -41], rotY: H2, length: 5 },
  { type: 'saltpan_seaedge', pos: [-18, 0, -26], rotY: P, length: 12 },
  { type: 'saltpan_seaedge', pos: [-18, 0, -38], rotY: -H2, length: 12 },
  { type: 'saltpan_seaedge', pos: [-26, 0, -38], rotY: 0, length: 8, post: true },
  { type: 'saltpan_seaedge', pos: [-26, 0, -46], rotY: -H2, length: 8 },
  { type: 'saltpan_samphire', pos: [-20.6, 0, -37.6], rotY: 0, length: 2.2 },
  { type: 'saltpan_samphire', pos: [9.2, 0, -45.0], rotY: 0, length: 2.4 },
  { type: 'saltpan_samphire', pos: [-25.75, 0, -45.3], rotY: -H2, length: 4 },
  // the pond field behind the store, flamingos in it
  { type: 'saltpan_ponds', pos: [64, 0, -64], rotY: P, w: 128, d: 58, seed: 31, pump: [80, 20], camelle: [30, 34, 40] },
  { type: 'saltpan_flamingos', pos: [-12, -1.33, -74], count: 6, radius: 3.5 },
];

// ---- the slice (Long Stages, 2026-09-30): the evaporation terraces and the brine pump house (layout.js SLICE)
// (Tower Command's track switchbacks up the terraces — lanes z -35.5 / -40.5 / -45.5 / -51 and the turns at x 10.5,
// -8.5 and -2.7 — so nothing that stands on them is built in that mode: `notIn: 'tower'`)
const SLICE = [
  // ---- the pump house, its loading platform, the header tank, the hand crane over the spur
  { type: 'saltpan_pumphouse', pos: [0, 0, 0] },
  { type: 'saltpan_stage', pos: [0, 0, 0] },
  { type: 'saltpan_tank', pos: [-11.2, 1.5, -42.3] },
  { type: 'saltpan_crane', pos: [-12.0, 1.5, -37.7], rotY: -H2 },
  { type: 'saltpan_sacks', pos: [-5.4, 1.5, -43.0], variant: 0, rows: 4, rotY: 0.08 },
  { type: 'saltpan_scale', pos: [-6.6, 1.5, -37.65], rotY: 0 },
  { type: 'saltpan_barrow', pos: [-11.0, 1.5, -39.4], rotY: 1.3, variant: 0 },
  { type: 'saltpan_gull', pos: [-13.6, 4.66, -42.3], rotY: 0.4 },
  // wagons on the spur, loading at the platform; an empty one further back
  { type: 'saltpan_wagon', pos: [-13.5, 0, -38.3], rotY: -H2, variant: 0 },
  { type: 'saltpan_wagon', pos: [-13.5, 0, -40.3], rotY: -H2, variant: 0, color: '#6d7a63' },
  { type: 'saltpan_wagon', pos: [-13.5, 0, -48.2], rotY: -H2, variant: 1 },

  // ---- the intake quay (west): the bay's timber edges, salt cones on the north part, drums, a lamp
  { type: 'saltpan_seaedge', pos: [-30, 0, -37], rotY: -H2, length: 11, post: true },
  { type: 'saltpan_seaedge', pos: [-26, 0, -37], rotY: P, length: 4 },
  { type: 'saltpan_seaedge', pos: [-26, 0, -43], rotY: -H2, length: 6 },
  { type: 'saltpan_seaedge', pos: [-30, 0, -43], rotY: 0, length: 4 },
  { type: 'saltpan_seaedge', pos: [-30, 0, -50], rotY: -H2, length: 7 },
  { type: 'saltpan_cone', pos: [-25.6, 0, -30.8], variant: 0, r: 2.3, h: 2.5 },
  { type: 'saltpan_cone', pos: [-21.6, 0, -34.2], variant: 1, r: 2.2, h: 2.3 },
  { type: 'saltpan_sacks', pos: [-28.4, 0, -35.4], variant: 1, rotY: 0.5 },
  { type: 'barrel', pos: [-17.5, 0, -46.2], variant: 1, color: '#5d7082', color2: '#b8493d' },
  { type: 'barrel', pos: [-17.2, 0, -45.6], variant: 0, color: '#8d6e4f' },
  { type: 'saltpan_tools', pos: [-25.0, 0, -45.6], rotY: 0.1, variant: 1 },
  { type: 'saltpan_lamp', pos: [-24.6, 0, -48.4], rotY: 0.7 },
  { type: 'saltpan_lamp', pos: [-15.9, 0, -35.6], rotY: H2 },
  { type: 'saltpan_samphire', pos: [-29.4, 0, -33.4], rotY: -H2, length: 3 },
  { type: 'saltpan_samphire', pos: [-27.6, 0, -49.5], rotY: P, length: 2.4 },
  { type: 'saltpan_samphire', pos: [-26.6, 0, -42.5], rotY: -H2, length: 2 },
  { type: 'saltpan_gull', pos: [-26.45, 2.82, -41.2], rotY: 2.0, variant: 1 },

  // ---- the pump dyke along the back pan: brine launders feeding the pans (a gap for the plank ramp), a lamp
  { type: 'saltpan_launder', pos: [0.4, 0, -31.3], length: 5.6, height: 1.0 },
  { type: 'saltpan_launder', pos: [9.0, 0, -31.3], length: 3.6, height: 1.0 },
  { type: 'saltpan_lamp', pos: [12.4, 0, -32.2], rotY: P + 0.4 },
  { type: 'saltpan_sacks', pos: [-15.2, 0, -31.6], variant: 0, rows: 4, rotY: -0.1 },

  // ---- the evaporation terraces: revetments on every riser, sluices between the ponds, pond boards, salt
  { type: 'saltpan_revet', pos: [13, 0, -33], rotY: P, length: 13, depth: 0.3 },
  { type: 'saltpan_revet', pos: [0, 0, -33], rotY: H2, length: 5, depth: 0.3 },
  { type: 'saltpan_revet', pos: [13, 0, -38], rotY: -H2, length: 5, depth: 0.3 },
  { type: 'saltpan_revet', pos: [0, 0, -38], rotY: 0, length: 13, depth: 0.3 },
  { type: 'saltpan_revet', pos: [0, 0.3, -43], rotY: 0, length: 13, depth: 0.3 },
  { type: 'saltpan_revet', pos: [0, 0.3, -48], rotY: -H2, length: 5, depth: 0.3 },
  { type: 'saltpan_revet', pos: [13, 0.3, -43], rotY: H2, length: 5, depth: 0.3 },
  { type: 'saltpan_revet', pos: [0, 0.6, -48], rotY: 0, length: 13, depth: 0.3 },
  { type: 'saltpan_revet', pos: [0, 0.6, -54], rotY: -H2, length: 6, depth: 0.6 },
  { type: 'saltpan_revet', pos: [13, 0.6, -48], rotY: H2, length: 6, depth: 0.6 },
  { type: 'saltpan_revet', pos: [13, 0.6, -54], rotY: P, length: 13, depth: 0.6 },
  { type: 'saltpan_sluice', pos: [4.5, 0, -38.2], walls: [[0.2, 0.3]], open: 0.5 },
  { type: 'saltpan_sluice', pos: [8.0, 0.3, -43.2], walls: [[0.2, 0.3]], open: 0.3 },
  { type: 'saltpan_sluice', pos: [3.5, 0.6, -48.2], walls: [[0.2, 0.3]], open: 0.6 },
  { type: 'saltpan_sign', pos: [13.5, 0, -35.5], rotY: -H2, text: 'POND 1', h: 0.26 },
  { type: 'saltpan_sign', pos: [13.5, 0, -40.7], rotY: -H2, text: 'POND 2', h: 0.26 },
  { type: 'saltpan_sign', pos: [13.5, 0, -45.7], rotY: -H2, text: 'POND 3', h: 0.26 },
  { type: 'saltpan_sign', pos: [13.5, 0, -51.0], rotY: -H2, text: 'POND 4', h: 0.26 },
  { type: 'saltpan_gauge', pos: [12.4, -0.3, -37.2], rotY: -H2 },
  { type: 'saltpan_gauge', pos: [0.8, 0.3, -47.4], rotY: H2 },
  { type: 'saltpan_stakes', pos: [0.6, 0, -42.4], rotY: 0, length: 12 },
  // raked salt on the ponds (cover), off the tower's lanes in that mode
  { type: 'saltpan_saltrow', pos: [3.6, -0.3, -35.6], variant: 2, height: 1.2, notIn: 'tower' },
  { type: 'saltpan_saltrow', pos: [10.4, -0.3, -35.4], variant: 0, length: 3.6, height: 1.1, notIn: 'tower' },
  { type: 'saltpan_saltrow', pos: [11.0, 0, -40.9], variant: 2, height: 1.2, notIn: 'tower' },
  { type: 'saltpan_saltrow', pos: [5.4, 0, -40.6], variant: 1, count: 3, height: 0.6, notIn: 'tower' },
  { type: 'saltpan_saltrow', pos: [2.8, 0.3, -45.7], variant: 2, height: 1.2, notIn: 'tower' },
  { type: 'saltpan_saltrow', pos: [9.4, 0.3, -45.6], variant: 0, length: 4, height: 1.1, notIn: 'tower' },
  { type: 'saltpan_saltrow', pos: [6.6, 0.6, -51.2], variant: 2, height: 1.2, notIn: 'tower' },
  { type: 'saltpan_saltrow', pos: [11.3, 0.6, -50.4], variant: 1, count: 2, height: 0.6, notIn: 'tower' },
  { type: 'saltpan_tools', pos: [8.2, 0.6, -52.9], rotY: 0.1, variant: 0 },

  // ---- the pump yard: the causeway down the middle, the apron behind the platform
  { type: 'saltpan_sacks', pos: [-1.0, 0, -35.2], variant: 0, rows: 4, rotY: H2, notIn: 'tower' },
  { type: 'saltpan_sacks', pos: [-1.6, 0, -48.2], variant: 0, rows: 4, rotY: 0.1 },
  { type: 'saltpan_sacks', pos: [-6.3, 0, -49.6], variant: 0, rows: 4, rotY: -0.15 },
  { type: 'saltpan_sacks', pos: [-7.4, 0, -51.4], variant: 1, rotY: 0.9 },
  { type: 'saltpan_sleepers', pos: [-9.2, 0, -52.6], rotY: 0.3 },
  { type: 'saltpan_barrow', pos: [-5.0, 0, -53.0], rotY: -0.5, variant: 1 },
  { type: 'saltpan_lamp', pos: [-4.6, 0, -48.1], rotY: H2 - 0.3 },

  // ---- the hopper yard (east): the tipping siding off the yard line up to the conveyor's tail hopper, its wagons (one
  //      tipping into the hopper), the weigh house; the slipway notch; the cone yard with the stacker building a cone
  { type: 'saltpan_rail', pos: [11.2, 0, -55.3], path: [[0, 0], [3.2, 0.25], [5.5, 1.6], [6.3, 3.6], [6.3, 20.5]] },
  { type: 'saltpan_buffer', pos: [17.5, 0, -34.6], rotY: -H2 },
  { type: 'saltpan_wagon', pos: [17.5, 0, -37.6], rotY: H2, variant: 2 },
  { type: 'saltpan_wagon', pos: [17.5, 0, -43.2], rotY: H2, variant: 0 },
  { type: 'saltpan_wagon', pos: [17.5, 0, -45.1], rotY: H2, variant: 0, color: '#b39655' },
  { type: 'saltpan_hut', pos: [15.2, 0, -49.8], rotY: H2 },
  { type: 'saltpan_sign', pos: [16.07, 1.6, -49.25], rotY: H2, variant: 1, text: 'WEIGH HOUSE', h: 0.12 },
  { type: 'saltpan_lamp', pos: [14.3, 0, -46.6], rotY: -H2 },
  { type: 'saltpan_sacks', pos: [24.0, 0, -33.8], variant: 1, rotY: 0.4 },
  { type: 'saltpan_sacks', pos: [22.6, 0, -42.4], variant: 0, rows: 4, rotY: 0.2 },
  { type: 'saltpan_barrow', pos: [15.4, 0, -31.9], rotY: 1.2, variant: 2 },
  { type: 'saltpan_seaedge', pos: [26, 0, -45], rotY: P, length: 2 },
  { type: 'saltpan_seaedge', pos: [24, 0, -45], rotY: H2, length: 5 },
  { type: 'saltpan_seaedge', pos: [24, 0, -50], rotY: 0, length: 2, post: true },
  { type: 'saltpan_seaedge', pos: [26, 0, -50], rotY: H2, length: 13, post: true },
  { type: 'saltpan_seaedge', pos: [26, 0, -63], rotY: 3 * P / 4, length: 2.83 },
  { type: 'saltpan_seaedge', pos: [24, 0, -65], rotY: P, length: 10 },
  { type: 'saltpan_samphire', pos: [23.4, 0, -46.2], rotY: -H2, length: 2.6 },
  { type: 'saltpan_samphire', pos: [25.2, 0, -52.0], rotY: -H2, length: 4 },
  { type: 'saltpan_samphire', pos: [17.5, 0, -64.3], rotY: P, length: 3 },
  { type: 'saltpan_cone', pos: [22.2, 0, -56.8], variant: 0, r: 2.4, h: 2.7 },
  { type: 'saltpan_cone', pos: [21.0, 0, -62.0], variant: 1, r: 2.1, h: 2.3 },
  { type: 'saltpan_stacker', pos: [15.2, 0, -61.5], rotY: 0, length: 5.2, head: 3.0 },
  { type: 'saltpan_gull', pos: [22.2, 2.72, -56.8], rotY: -1.4 },
];

export const PLACEMENTS = [
  ...MID,
  ...BASE.map(back),
  ...SLICE,

  // ---- Tower Command only (the track: centre → +Z onto the ±X boardwalk → along the mid dyke → the front dyke → the
  //      dock yard → the sluice dyke → down the back-pan boardwalk → switchbacking up the terraces over the loading
  //      platform to the store yard; src/world/tower-data.js). The pieces it would stutter over move aside or go (their
  //      originals above are notIn: 'tower'); the user's two blue X's — the front-dyke sluice (Bravo −7.2, 8.5) and the
  //      tipper wagon at checkpoint 1 (Bravo −18.5, 8.7) — just go.
  // the wind pump on a timber trestle over the staging: the tower starts underneath it (the ground launder goes)
  { type: 'saltpan_trestle', pos: [0, 0.08, 0], mirror: false, onlyIn: 'tower' },
  { type: 'saltpan_staging', pos: [0, 0.08, 0], mirror: false, track: true, onlyIn: 'tower' },
  { type: 'saltpan_gull', pos: [0.3, 13.45, -0.3], rotY: 0.9, mirror: false, onlyIn: 'tower' },
  // the conveyor gantry with its head bent 0.7 m further back and the head platform's mid edge 0.9 m back over it (the
  // track turns at checkpoint 1 beside the head platform, not under it: the tower needs 3.72 m of headroom)
  { type: 'saltpan_gantry', pos: [0, 0, 0], headBent: -10.5, headEdge: -10.4, onlyIn: 'tower' },
  // the boardwalks the tower rides / crosses: no handrail on the ±X and back-pan boardwalks, the diagonal one's stops
  // short of the front dyke; the ±X and mid decks sit flush with the dykes, the diagonal one 8 cm down (layout.js)
  { type: 'saltpan_bwposts', pos: [-2.7, 0, -30.0], rotY: -H2, length: 10, width: 1.8, drop: 0.6, onlyIn: 'tower' },
  { type: 'saltpan_bwposts', pos: [3.63, -0.08, -17.0], rotY: -2.234, length: 8.9, width: 1.8, drop: 0.82, rail: -1, railTo: 7.6, onlyIn: 'tower' },
  { type: 'saltpan_bwposts', pos: [2.3, 0, -8.0], rotY: -H2, length: 4.4, width: 1.8, drop: 1.2, onlyIn: 'tower' },
  { type: 'saltpan_bwposts', pos: [3.6, 0, -1.7], rotY: 0, length: 9.4, width: 1.8, drop: 1.2, onlyIn: 'tower' },
  // tipper wagons rolled along their sidings, clear of the track
  { type: 'saltpan_wagon', pos: [21.5, 0, -8.7], variant: 0, onlyIn: 'tower' },
  { type: 'saltpan_wagon', pos: [20.5, 0, -4.4], variant: 0, onlyIn: 'tower' },
  { type: 'saltpan_wagon', pos: [7.6, 0, -17.7], variant: 0, onlyIn: 'tower' },
  // the sluice-dyke sluice (and its gull) moved west along the dyke, off the track
  { type: 'saltpan_sluice', pos: [2.0, 0, -19.0], walls: [[-1.0, 0.6], [2.0, 0.9]], open: 0.5, onlyIn: 'tower' },
  { type: 'saltpan_gull', pos: [2.3, 1.73, -19.0], rotY: 2.6, variant: 1, onlyIn: 'tower' },
  // the front dyke's end lamps, the pan boards, a barrow and a rake moved off the track
  { type: 'saltpan_lamp', pos: [11.5, 0, -10.7], rotY: P - 0.4, onlyIn: 'tower' },
  { type: 'saltpan_lamp', pos: [-14.8, 0, -7.3], rotY: 0.5, onlyIn: 'tower' },
  { type: 'saltpan_sign', pos: [-0.3, 0, -17.35], rotY: P, text: 'PAN 3', h: 0.26, mirror: false, onlyIn: 'tower' },
  { type: 'saltpan_sign', pos: [0.3, 0, 17.35], rotY: 0, text: 'PAN 6', h: 0.26, mirror: false, onlyIn: 'tower' },
  { type: 'saltpan_sign', pos: [-15.6, 0, -8.4], rotY: P + 0.4, text: 'GREAT PAN', h: 0.24, mirror: false, onlyIn: 'tower' },
  { type: 'saltpan_sign', pos: [15.6, 0, 8.4], rotY: 0.4, text: 'GREAT PAN', h: 0.24, mirror: false, onlyIn: 'tower' },
  { type: 'saltpan_barrow', pos: [-17.2, 0, -9.6], rotY: 1.9, variant: 0, onlyIn: 'tower' },
  { type: 'saltpan_tools', pos: [5.2, 0, -19.6], rotY: 0.05, variant: 2, onlyIn: 'tower' },
];
