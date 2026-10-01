// Lockgate Canals — stage prop pack + placements (owner: the lockgate stage; see layout.js for the folder contract).
//
// register(D, H): this stage's own prop builders (types prefixed 'lockgate_'), same contract as props-marina-dock.js:
// H carries THREE + the kit helpers. PLACEMENTS: this stage's set dressing (half list: every entry is mirrored
// (x,z) → (-x,-z) with rotY + π unless it says `mirror: false`). Solid props hand the level collision boxes.
//
// The place: a flight of broad locks climbing out of the harbour basin through an old brick warehouse district.
// Materials: red + blue engineering brick, sandstone copings with worn arrises, black-and-white lock timber, cast iron.
// Signage is modelled (flat painted / raised stroke letters, cached per glyph) — never the shared sign atlas.
import { BRIDGE_T, XBOAT, XBOATS, xboatT, LS, DOCK_Z, DOCKBOAT, STAGING, SHED } from './layout.js';
const P = Math.PI;

export function register(D, H) {
  const { THREE, PI, TAU, HP, P3, col, shade, mixc, latheGeo, tubeGeo, extrudeGeo, arcPts } = H;
  const NS = (m) => (H.noShadow ? H.noShadow(m) : m);

  // ------------------------------------------------------------------------------------------ palette
  // muted, sooty canal tones: the team inks stay the loudest thing on screen
  const K = {
    black: '#26272b', blackLt: '#34363b', white: '#e9e5da', whiteDk: '#cfcabd', timber: '#3b3029', timberLt: '#5a4a3d',
    oak: '#7a6048', oakLt: '#9a7d5f', stone: '#cdc3ae', stoneDk: '#a99f8a', stoneLt: '#ddd4c1', brick: '#8c4a3b',
    brickDk: '#6f3a2f', brickLt: '#a2604c', blue: '#4c505b', blueDk: '#3a3d46', iron: '#2c3036', ironLt: '#454b53',
    green: '#2f4a3c', greenLt: '#44634f', maroon: '#6a2a28', cream: '#e8dcc0', gold: '#c9a24e', slate: '#4b5260',
    slateDk: '#3b414d', slateLt: '#5d6574', glass: '#27323b', glassLt: '#3a4a55', lamp: '#ffd79a', water: '#1d3129',
    waterLt: '#2c4a3d', foam: '#dfe8e2', rope: '#cbb892', ropeDk: '#a38d68', rust: '#8a4b2e', moss: '#56663a',
    render: '#e9e2d2', sash: '#ede8dc', red: '#b0433a', mud: '#4a4034', puddle: '#2a3334',
  };

  // ------------------------------------------------------------------------------------------ geometry kit
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
  // plain 12-tri box for small / flush parts
  const pboxGeo = () => tpl('pbox', () => new THREE.BoxGeometry(1, 1, 1));
  const pbox = (B, mat, c, w, h, d, x, y, z, o = {}) => B.add(mat, pboxGeo(), c, x, y, z, { ...o, sx: w, sy: h, sz: d });
  // low-poly unit cylinders (scaled)
  const ucyl = (seg, open) => tpl('ucyl|' + seg + (open ? 'o' : ''), () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, !!open));
  const cyl = (B, mat, c, r, h, x, y, z, o = {}) => B.add(mat, ucyl(o.seg ?? 8, o.open), c, x, y, z, { ...o, sx: r, sy: h, sz: r });
  // a segment (box) between two points in the XZ plane at height y (beam, rail …), section w x h
  function seg(B, mat, c, a, b, w, h, o = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
    const ry = Math.atan2(-dz, dx), rz = Math.atan2(dy, Math.hypot(dx, dz));
    B.push((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, ry, 0, rz);
    if (o.plain) pbox(B, mat, c, L, h, w, 0, 0, 0); else B.box(mat, c, L, h, w, 0, 0, 0, { r: o.r ?? Math.min(0.03, Math.min(w, h) * 0.2) });
    B.pop();
  }
  // collision boxes are always in the prop's root frame: rotate a local (x, z) about Y by ry and offset
  const rot = (x, z, ry) => [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  const colC = (B, x, y, z, w, h, d, o) => B.col(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, o);
  const ROOF = { roof: true };
  const RAIL = { rail: true };   // see-through railings: kids blocked, shots / ink / squids pass, nobody stands on top
  // collider chain along a segment (AABBs of short pieces hug a diagonal beam)
  function colSeg(B, a, b, r, y0, y1, n) {
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const x0 = a[0] + (b[0] - a[0]) * t0, z0 = a[1] + (b[1] - a[1]) * t0, x1 = a[0] + (b[0] - a[0]) * t1, z1 = a[1] + (b[1] - a[1]) * t1;
      B.col(Math.min(x0, x1) - r, y0, Math.min(z0, z1) - r, Math.max(x0, x1) + r, y1, Math.max(z0, z1) + r);
    }
  }
  // brick-coursed box: body + faint course lines on the ±X/±Z faces (flush lines, no shadow) — for prop brickwork
  function brickBox(B, c, w, h, d, x, y, z, o = {}) {
    B.box(o.mat ?? 'paint', c, w, h, d, x, y, z, { r: o.r ?? 0.02 });
    if (o.courses === false) return;
    const cc = shade(c, 0.82), step = o.step ?? 0.3;
    for (let yy = y - h / 2 + step; yy < y + h / 2 - 0.05; yy += step) {
      if (o.faces?.includes('z') !== false) { pbox(B, NS('paint'), cc, w - 0.02, 0.012, d + 0.008, x, yy, z); }
      if (o.faces?.includes('x')) pbox(B, NS('paint'), cc, w + 0.008, 0.012, d - 0.02, x, yy, z);
    }
  }

  // ------------------------------------------------------------------------------------------ stroke font (from the dock pack)

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
      if (gi.geo) B.add(flat || h < 0.2 ? NS(m) : m, gi.geo, o.c ?? K.black, (o.x ?? 0) + x, o.y ?? 0, o.z ?? 0, { s: h, sz: flat ? 1 : h, glow: o.glow, ao: false });
      // lit channel letters: an illuminated acrylic face (flat, unlit-shaded) just proud of the raised letter's face, so
      // the sign reads as switched on at dusk and as a crisp lit sign by day
      if (gi.geo && o.lit) {
        const fg = glyph(ch, wt, 0, 0, ds);
        if (fg.geo) B.add(NS('glow'), fg.geo, o.litC ?? o.c ?? K.blackGold, (o.x ?? 0) + x, o.y ?? 0, (o.z ?? 0) + dep * h + 0.004, { s: h, sz: 1, glow: o.lit, ao: false });
      }
      x += (gi.adv + (i < cs.length - 1 ? track : 0)) * h;
    });
    return W;
  }

  // 7-segment LED digits (unit cell 0.62 × 1, slight italic): lit segments on 'glow', the unlit "ghost 8" on 'paint'
  const SEG7 = { a: [[0.1, 1], [0.46, 1]], b: [[0.53, 0.94], [0.53, 0.56]], c: [[0.53, 0.44], [0.53, 0.06]], d: [[0.1, 0], [0.46, 0]], e: [[0.03, 0.44], [0.03, 0.06]], f: [[0.03, 0.94], [0.03, 0.56]], g: [[0.1, 0.5], [0.46, 0.5]] };
  const DIG = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];

  // flush sign board with flat painted letters (board centred at x, y; faces +Z); returns the board width
  function boardSign(B, text, x, y, o = {}) {
    const h = o.h ?? 0.2, pad = o.pad ?? h * 0.6, W = o.w ?? textW(text, o.wt ?? 0.18, o.track ?? 0.12) * h + pad * 2, Hb = o.hb ?? h + pad * 1.1;
    const bd = o.bd ?? 0.04, z = o.z ?? 0;
    B.box(o.boardMat ?? 'paint', o.board ?? K.green, W, Hb, bd, x, y, z + bd / 2, { r: Math.min(0.02, Hb * 0.15) });
    if (o.border) { pbox(B, NS('paint'), o.border, W - 0.04, Hb - 0.04, 0.004, x, y, z + bd + 0.001); pbox(B, NS('paint'), o.board ?? K.green, W - 0.08, Hb - 0.08, 0.004, x, y, z + bd + 0.003); }
    letters(B, text, { h, x, y: y - h / 2, z: z + bd + 0.005, c: o.c ?? K.cream, flat: true, wt: o.wt ?? 0.18, track: o.track, mat: o.mat, glow: o.glow });
    return W;
  }

  // ================================================================================================ small cast iron
  // Victorian gas lamp: stepped plinth, fluted shaft, ladder bar, square tapered lantern (glowing panes), crown + finial.
  function lantern(B, x, y, z, s = 1) {
    B.push(x, y, z, 0, 0, 0, s);
    B.lathe('metal', K.iron, [[0.07, 0], [0.11, 0.03], [0.12, 0.06], [0.07, 0.09], [0, 0.09]], 0, 0, 0, { seg: 8 });
    B.add('glow', tpl('lantern', () => latheGeo([[0.09, 0], [0.16, 0.42], [0, 0.42]], 4)), K.lamp, 0, 0.09, 0, { ry: PI / 4, glow: 1.5 });
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; seg(B, 'metal', K.iron, [Math.cos(a) * 0.09, 0.09, Math.sin(a) * 0.09], [Math.cos(a) * 0.16, 0.51, Math.sin(a) * 0.16], 0.025, 0.025); }
    B.lathe('metal', K.iron, [[0.2, 0], [0.21, 0.03], [0.12, 0.13], [0.04, 0.2], [0, 0.21]], 0, 0.5, 0, { seg: 4, ry: PI / 4 });
    B.sph('metal', K.ironLt, 0.035, 0, 0.74, 0, { ws: 6, hs: 4 });
    cyl(B, 'metal', K.iron, 0.012, 0.1, 0, 0.68, 0, { seg: 4 });
    B.pop();
  }
  D.lockgate_lamp = {
    desc: 'Cast-iron canal gas lamp. variant 0 = 3.6 m post (plinth, fluted shaft, ladder bar, square lantern with warm panes); 1 = wall bracket lamp (wall at z = 0, pos.y = bracket height) with a scroll arm; 2 = short pier-top lamp (sits on a parapet pier).',
    params: {}, variants: 3, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 3;
      if (v === 0) {
        B.lathe('metal', K.iron, [[0, 0], [0.2, 0], [0.2, 0.08], [0.16, 0.12], [0.15, 0.42], [0.12, 0.5], [0.09, 0.56], [0, 0.56]], 0, 0, 0, { seg: 8 });
        B.lathe('metal', K.iron, [[0.075, 0.55], [0.06, 1.2], [0.055, 2.9], [0.08, 2.96], [0.06, 3.02], [0, 3.02]], 0, 0, 0, { seg: 8 });
        for (const yy of [1.2, 2.2]) B.tor('metal', K.ironLt, 0.066, 0.014, 0, yy, 0, { rs: 4, ts: 10, rx: HP });
        cyl(B, 'metal', K.iron, 0.018, 0.7, 0, 2.78, 0, { seg: 5, rz: HP });
        for (const sx of [-1, 1]) B.sph('metal', K.iron, 0.03, sx * 0.35, 2.78, 0, { ws: 5, hs: 4 });
        lantern(B, 0, 3.0, 0);
        colC(B, 0, 0, 0, 0.36, 3.2, 0.36, ROOF);
        B.blob(0.9, 0.9);
      } else if (v === 1) {
        B.aoBase = null;
        B.box('metal', K.iron, 0.14, 0.3, 0.04, 0, 0, 0.02, { r: 0.01 });
        B.tube('metal', K.iron, [P3(0, -0.1, 0.03), P3(0, 0.05, 0.3), P3(0, 0.16, 0.5), P3(0, 0.12, 0.58)], 0.02, { radial: 5 });
        B.tube(NS('metal'), K.iron, [P3(0, -0.12, 0.03), P3(0, -0.06, 0.2), P3(0, 0.02, 0.3)], 0.012, { radial: 4 });
        lantern(B, 0, -0.34, 0.6, 0.85);
      } else {
        B.aoBase = null;
        pierLamp(B, 0, 0, 0);
        colC(B, 0, 0, 0, 0.26, 1.2, 0.26, ROOF);
      }
    },
  };
  function pierLamp(B, x, y, z) {
    B.lathe('metal', K.iron, [[0.12, 0], [0.1, 0.06], [0.06, 0.1], [0.05, 0.62], [0.08, 0.66], [0, 0.68]], x, y, z, { seg: 8 });
    lantern(B, x, y + 0.66, z, 0.95);
  }

  // canal bollard: waisted cast-iron mushroom, black with a white band; variant 1 = timber mooring post (stump)
  D.lockgate_bollard = {
    desc: 'Canal mooring bollard. variant 0 = cast-iron mushroom bollard (black, white band, worn rope groove); 1 = oak mooring stump with an iron cap band.',
    params: {}, variants: 2, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 2;
      if (v === 0) {
        B.lathe('gloss', K.black, [[0, 0], [0.17, 0], [0.18, 0.03], [0.14, 0.08], [0.11, 0.2], [0.1, 0.34], [0.13, 0.42], [0.17, 0.46], [0.17, 0.5], [0.12, 0.55], [0, 0.57]], 0, 0, 0, { seg: 12 });
        B.lathe(NS('gloss'), K.white, [[0.106, 0.24], [0.103, 0.31]], 0, 0, 0, { seg: 12 });
        B.lathe(NS('metal'), '#7d7a74', [[0.101, 0.33], [0.1, 0.36]], 0, 0, 0, { seg: 12 });
        colC(B, 0, 0, 0, 0.34, 0.58, 0.34);
        B.blob(0.6, 0.6);
      } else {
        B.lathe('wood', K.oak, [[0, 0], [0.15, 0], [0.15, 0.6], [0.13, 0.66], [0, 0.68]], 0, 0, 0, { seg: 9 });
        B.lathe(NS('metal'), K.iron, [[0.155, 0.5], [0.155, 0.56]], 0, 0, 0, { seg: 9 });
        colC(B, 0, 0, 0, 0.32, 0.68, 0.32);
        B.blob(0.55, 0.55);
      }
    },
  };

  // iron mooring ring on a staple set into the coping (edge at z = 0, water +Z)
  function ring(B, x, y, z, ry = 0) {
    B.push(x, y, z, ry);
    B.box(NS('metal'), K.iron, 0.14, 0.02, 0.1, 0, 0.01, 0, { r: 0.006 });
    B.tor(NS('metal'), K.ironLt, 0.08, 0.014, 0, 0.016, 0.12, { rs: 4, ts: 10, rx: HP });
    B.pop();
  }

  D.lockgate_ring = {
    desc: 'Iron mooring ring on a staple set in the coping (edge at z = 0, water +Z). Non-colliding.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) { B.aoBase = null; ring(B, 0, 0, -0.12, 0); },
  };

  // ground paddle gear: cast-iron rack post on a bed plate — the lock's water valves (cover on the lock side)
  function paddleGear(B, x, y, z, ry, o = {}) {
    B.push(x, y, z, ry);
    B.box('paint', K.stoneDk, 0.62, 0.06, 0.5, 0, 0.03, 0, { r: 0.015 });
    B.box('gloss', K.black, 0.3, 0.72, 0.24, 0, 0.42, 0, { r: 0.03 });
    B.box('gloss', K.black, 0.4, 0.08, 0.3, 0, 0.1, 0, { r: 0.02 });
    // gear cheeks + pinion shaft for the windlass, pawl, rack rising out of the top
    for (const sz of [-1, 1]) B.cyl('gloss', K.black, 0.16, 0.05, 0, 0.72, sz * 0.15, { rx: HP, seg: 12 });
    B.cyl('metal', K.ironLt, 0.03, 0.46, 0, 0.72, 0, { rx: HP, seg: 6 });
    pbox(B, 'gloss', K.white, 0.05, 0.05, 0.05, 0, 0.72, 0.25);
    const up = o.raised ? 0.5 : 0.18;
    B.box('metal', K.ironLt, 0.07, 0.4 + up, 0.05, 0.06, 0.78 + (0.4 + up) / 2, 0, { r: 0.01 });
    for (let k = 0; k < 6 + Math.round(up * 10); k++) pbox(B, NS('metal'), K.iron, 0.02, 0.018, 0.055, 0.1, 0.84 + k * 0.06, 0);
    seg(B, 'gloss', K.black, [-0.1, 0.9, 0.05], [0.03, 1.02, 0.05], 0.03, 0.03);
    if (o.windlass) {           // a windlass left on the spindle
      B.push(0, 0.72, 0.26);
      B.box('metal', K.ironLt, 0.03, 0.34, 0.03, 0, -0.14, 0, { r: 0.008 });
      cyl(B, 'wood', K.oakLt, 0.024, 0.14, 0, -0.3, 0.07, { rx: HP, seg: 6 });
      B.pop();
    }
    B.pop();
    const [cx, cz] = rot(0, 0, ry);
    colC(B, x + cx, y, z + cz, 0.44, 1.1, 0.44);
  }
  D.lockgate_paddle = {
    desc: 'Lock ground-paddle gear: black cast-iron rack post with gear cheeks, pinion spindle (white tip) and pawl on a stone bed plate. raised: rack drawn up; windlass: a windlass left on the spindle.',
    params: { raised: 'bool', windlass: 'bool' }, variants: 1, mount: 'ground',
    build(B, o) { paddleGear(B, 0, 0, 0, 0, o); B.blob(0.8, 0.7); },
  };

  // ================================================================================================ lock gates
  // One pair of mitre gates across the chamber. Local frame: origin on the gate line at coping level (world 1.3),
  // +X = upstream, chamber spans z ±2.75, the walkway (a level block, x ±0.6) sits on top of the leaves. Leaves hang
  // from the heel posts (x -0.7, z ±2.75) to the mitre (x -0.1, z 0). Balance beams run from the heel posts back over
  // the lock sides (colliding, waist high). kind 'lower': leaves down to the chamber floor, lower pound downstream,
  // handrail on the downstream side, gate paddles. kind 'upper': leaves stand on the brick cill (colliding) with the
  // upper pound behind (visual water, higher than the sea), leaks spraying through into the drained chamber.
  const LOCK = { half: 2.75, floor: -3.2, low: -2.9, up: -1.6, heelX: -0.7, mitreX: -0.1 };
  function gateLeaf(B, side, yb, yt) {
    const hx = LOCK.heelX, hz = side * LOCK.half, mx = LOCK.mitreX, dx = mx - hx, dz = -hz, L = Math.hypot(dx, dz);
    const ry = Math.atan2(-dz, dx), H = yt - yb, dn = side < 0 ? 1 : -1;       // local z * dn = downstream
    B.push(hx, yb, hz, ry);
    const blk = K.black, t = 0.3;
    B.box('wood', blk, 0.36, H, 0.36, 0.14, H / 2, 0, { r: 0.05 });                         // heel post
    B.box('wood', blk, 0.26, H, 0.3, L - 0.13, H / 2, 0, { r: 0.03 });                     // mitre post
    const nr = Math.max(3, Math.round(H / 0.72));
    for (let i = 0; i < nr; i++) {
      const y = 0.14 + ((H - 0.3) * i) / (nr - 1);
      B.box('wood', i === nr - 1 ? K.white : blk, L - 0.3, 0.22, t, L / 2, y, 0, { r: 0.03 });
    }
    // planked face (upstream side) with plank seams, iron strap across the downstream frame
    B.box('wood', K.timber, L - 0.2, H - 0.1, 0.07, L / 2, H / 2, -dn * 0.17, { r: 0.012 });
    for (let x = 0.4; x < L - 0.25; x += 0.26) pbox(B, NS('wood'), shade(K.timber, 0.7), 0.012, H - 0.14, 0.074, x, H / 2, -dn * 0.17);
    seg(B, 'metal', K.iron, [0.3, 0.2, dn * 0.17], [L - 0.3, H - 0.3, dn * 0.17], 0.03, 0.1, { plain: true });
    for (const y of [0.3, H * 0.5, H - 0.35]) pbox(B, NS('metal'), K.iron, 0.5, 0.1, 0.33, 0.2, y, 0);
    // weed + damp line where the lower pound laps the downstream face
    B.pop();
    return { L, ry, dn };
  }
  function balanceBeam(B, side, len = 4.4, sweep = 1) {
    const hx = LOCK.heelX, hz = side * LOCK.half;
    // heel post extension above the coping + the beam running back over the lock side
    B.box('wood', K.black, 0.34, 1.2, 0.34, hx, 0.5, hz, { r: 0.05 });
    B.box('wood', K.white, 0.38, 0.06, 0.38, hx, 1.12, hz, { r: 0.02 });
    const dir = [-0.12, side * 0.993], a = [hx + dir[0] * 0.1, 0.92, hz + dir[1] * 0.1], b = [hx + dir[0] * len, 0.86, hz + dir[1] * len];
    const cut = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    seg(B, 'wood', K.black, a, cut(0.74), 0.3, 0.32);
    seg(B, 'wood', K.white, cut(0.74), b, 0.31, 0.33);
    seg(B, 'wood', K.white, a, cut(0.06), 0.31, 0.33);
    // worn grip battens at the end, a bolted iron strap at the heel
    for (const t of [0.86, 0.93]) { const p = cut(t); pbox(B, NS('wood'), K.whiteDk, 0.34, 0.03, 0.06, p[0], p[1] + 0.17, p[2], { ry: Math.atan2(-dir[1], dir[0]) }); }
    const s1 = cut(0.16);
    pbox(B, NS('metal'), K.iron, 0.34, 0.36, 0.1, s1[0], s1[1], s1[2], { ry: Math.atan2(-dir[1], dir[0]) });
    // the arc of raised brick treads stepped into the coping where the lock keeper walks the beam round
    const phi0 = Math.atan2(dir[1], dir[0]), r = len - 0.35;
    for (let k = 0; k < Math.round(sweep * 7); k++) {
      const ph = phi0 + side * (0.12 + k * 0.2);
      pbox(B, NS('paint'), K.stoneDk, 0.6, 0.02, 0.14, hx + Math.cos(ph) * r, 0.008, hz + Math.sin(ph) * r, { ry: -ph });
    }
    colSeg(B, [hx, hz], [b[0], b[2]], 0.2, 0.62, 1.1, 3);   // timber cover at waist height; squids + shots pass under
    return b;
  }
  // a cranked balance beam (where the lock side is too tight for a straight one): out from the heel post in line with
  // the leaf for `out` m, then bent to run back downstream (local -X) for `back` m, parallel to the chamber
  function crankedBeam(B, side, out = 0.9, back = 2.2) {
    const hx = LOCK.heelX, hz = side * LOCK.half;
    B.box('wood', K.black, 0.34, 1.2, 0.34, hx, 0.5, hz, { r: 0.05 });
    B.box('wood', K.white, 0.38, 0.06, 0.38, hx, 1.12, hz, { r: 0.02 });
    const dir = [-0.12, side * 0.993], a = [hx + dir[0] * 0.1, 0.92, hz + dir[1] * 0.1], k = [hx + dir[0] * out, 0.9, hz + dir[1] * out];
    const b = [k[0] - back, 0.86, k[2]];
    const cut = (t) => [k[0] + (b[0] - k[0]) * t, k[1] + (b[1] - k[1]) * t, k[2]];
    seg(B, 'wood', K.black, a, k, 0.3, 0.32);
    seg(B, 'wood', K.black, k, cut(0.7), 0.3, 0.32);
    seg(B, 'wood', K.white, cut(0.7), b, 0.31, 0.33);
    seg(B, 'wood', K.white, a, [hx + dir[0] * 0.16, 0.92, hz + dir[1] * 0.16], 0.31, 0.33);
    // the knee: an iron strap wrapped round the bend + a diagonal brace, worn grip battens at the end
    B.box('metal', K.iron, 0.4, 0.36, 0.4, k[0], k[1], k[2], { r: 0.02 });
    seg(B, 'metal', K.iron, [k[0] - 0.7, 0.86, k[2]], [a[0] + dir[0] * 0.3, 0.9, a[2] + dir[1] * 0.3], 0.06, 0.08, { plain: true });
    for (const t of [0.86, 0.93]) { const p = cut(t); pbox(B, NS('wood'), K.whiteDk, 0.06, 0.03, 0.34, p[0], p[1] + 0.17, p[2]); }
    colSeg(B, [hx, hz], [k[0], k[2]], 0.2, 0.62, 1.1, 1);
    colSeg(B, [k[0], k[2]], [b[0], b[2]], 0.2, 0.62, 1.1, 2);
    return b;
  }
  D.lockgate_gates = {
    desc: 'A pair of black timber mitre gates with white-ended balance beams across a broad lock chamber (local +X upstream, chamber z ±2.75, origin on the gate line at coping level; the walkway on top is a level block x ±0.6). kind lower | upper (see LOCK notes in props.js). Beams, heel posts, handrail, cill (upper) collide. crank: the +Z beam is a cranked one bent back downstream (Tower Command: it clears the track along that lock side).',
    params: { kind: 'lower | upper', crank: 'bool' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const upper = o.kind === 'upper';
      const yb = upper ? -2.25 : LOCK.floor, yt = -0.25;
      for (const side of [-1, 1]) {
        gateLeaf(B, side, yb, yt);
        if (o.crank && side > 0) crankedBeam(B, side); else balanceBeam(B, side, upper ? 4.4 : 3.6, upper ? 1.2 : 0.3);
      }
      // the leaves are solid timber from the cill / chamber floor up to under the walkway: nobody walks through a gate.
      // A lower gate's leaves stand 0.33 m proud of the walkway on the pound side, outside the handrail over the water:
      // that sliver is off-limits (slide off), so nobody — bot or kid — ends up wedged on it
      B.col(-0.95, upper ? yb : LOCK.floor, -LOCK.half, 0.05, -0.25, LOCK.half, upper ? undefined : ROOF);
      colC(B, LOCK.heelX, 0, -LOCK.half, 0.36, 1.15, 0.36, ROOF);
      colC(B, LOCK.heelX, 0, LOCK.half, 0.36, 1.15, 0.36, ROOF);
      // walkway edge boards, anti-slip battens, handrail on the water side (the chamber side stays open: a safe drop)
      const rx = upper ? 0.62 : -0.62;
      for (const sx of [-1, 1]) pbox(B, 'wood', sx * rx > 0 ? K.white : K.timber, 0.06, 0.26, 5.5, sx * 0.63, -0.13, 0);
      for (let z = -2.4; z <= 2.41; z += 0.6) pbox(B, NS('wood'), K.timberLt, 1.1, 0.025, 0.07, 0, 0.012, z);
      const posts = [-2.55, -1.3, 0, 1.3, 2.55];
      for (const z of posts) {
        B.cyl('gloss', K.white, 0.026, 1.0, rx, 0.5, z, { seg: 6 });
        B.cyl(NS('gloss'), K.white, 0.05, 0.03, rx, 0.015, z, { seg: 8 });
      }
      B.cyl('gloss', K.white, 0.03, 5.2, rx, 1.0, 0, { rx: HP, seg: 8 });
      B.cyl(NS('gloss'), K.white, 0.02, 5.2, rx, 0.55, 0, { rx: HP, seg: 6 });
      B.col(rx - 0.05, 0, -2.75, rx + 0.05, 1.05, 2.75, RAIL);
      if (!upper) {
        // gate paddles: rack posts on the downstream face of each leaf, rising beside the handrail
        for (const sz of [-1.45, 1.45]) {
          B.box('gloss', K.black, 0.16, 1.25, 0.14, -0.78, 0.25, sz, { r: 0.02 });
          B.cyl('gloss', K.black, 0.1, 0.05, -0.78, 0.62, sz + 0.1, { rx: HP, seg: 10 });
          B.box('metal', K.ironLt, 0.06, 0.5, 0.045, -0.78, 1.1, sz - 0.02, { r: 0.01 });
          pbox(B, 'gloss', K.white, 0.04, 0.04, 0.12, -0.78, 0.62, sz + 0.18);
        }
        // the lower pound laps the downstream face: a dark wet band + weed on the leaves
        pbox(B, NS('paint'), '#1d2622', 0.06, 0.5, 5.3, -0.92, LOCK.low + 0.1, 0);
        // lock number on the beam-end post plates
        B.push(LOCK.heelX - 0.2, 0.62, -LOCK.half, -HP);
        boardSign(B, 'LOCK 2', 0, 0, { h: 0.08, board: K.white, c: K.black, bd: 0.012, pad: 0.04 });
        B.pop();
      } else {
        // brick cill the upper leaves stand on, with the leak cascading over it into the dry chamber
        brickBox(B, K.blue, 1.0, yb - LOCK.floor, 5.5, -0.35, (yb + LOCK.floor) / 2, 0, { mat: 'paint', step: 0.225 });
        B.col(-0.85, LOCK.floor, -2.75, 0.15, yb, 2.75);
        const jets = [[-0.38, -1.0, 0.05, 0.05], [-0.98, yb - 0.05, -1.4, 0.036], [-0.98, yb - 0.05, 1.7, 0.03], [-0.62, -1.7, -0.95, 0.026]];
        for (const [xs, ys, zj, r] of jets) {
          const pts = [];
          for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(P3(xs - t * 0.55, ys - t * t * (ys - LOCK.floor), zj)); }
          B.tube(NS('gloss'), K.foam, pts, (t) => r * (1 + t * 0.8), { radial: 6 });
          B.add(NS('paint'), tpl('splash', () => latheGeo([[0, 0.02], [0.18, 0.015], [0.34, 0.0]], 8)), K.foam, pts[8][0], LOCK.floor + 0.012, zj, { s: 1 + r * 6 });
        }
        // the leak's puddle along the foot of the cill
        pbox(B, NS('gloss'), K.puddle, 0.7, 0.01, 4.8, -1.2, LOCK.floor + 0.006, 0.2);
        // wet cill face + weed
        pbox(B, NS('paint'), '#233029', 0.02, yb - LOCK.floor - 0.1, 5.4, -0.86, (yb + LOCK.floor) / 2, 0);
      }
    },
  };

  // ================================================================================================ water
  // Visual (non-lethal-looking-but-honest) canal water ABOVE the sea: the upper pounds only, which the arena never
  // borders except across a gate. Gently rippled gloss surface (baked normal jitter), foam lines along the walls.
  function waterSheet(L, W, seedN) {
    return tpl(['water', L, W, seedN].map(kf).join('|'), () => {
      const g = new GB(), nx = Math.max(2, Math.round(L / 0.9)), nz = Math.max(2, Math.round(W / 0.9)), ids = [];
      const c0 = cx3(K.water), c1 = cx3(K.waterLt);
      for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) {
        const x = (i / nx) * L, z = (k / nz - 0.5) * W, h1 = hash(i * 7.1 + k * 3.3 + seedN), h2 = hash(i * 1.7 + k * 9.1 + seedN);
        const edge = Math.min(k, nz - k) === 0 ? 0.6 : 1;
        const c = lerp3(c0, c1, 0.25 + 0.5 * h2 * edge);
        const tx = (h1 - 0.5) * 0.12, tz = (h2 - 0.5) * 0.12, l = Math.hypot(tx, 1, tz);
        ids.push(g.v(x, 0, z, tx / l, 1 / l, tz / l, c[0], c[1], c[2]));
      }
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) { const a = i * (nz + 1) + k; g.quad(a, a + nz + 1, a + nz + 2, a + 1); }
      return g.geo();
    });
  }
  D.lockgate_pound = {
    desc: 'Upper-pound canal water (visual, above the sea): rippled gloss sheet running along local +X for `length` (width `width`, surface at pos.y), foam lines along both walls and at the start (the gate).',
    params: { length: 'm (18)', width: 'm (5.5)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 18, W = o.width ?? 5.5;
      B.add('gloss', waterSheet(L, W, 3), 'white', 0, 0, 0, {});
      for (const sz of [-1, 1]) {
        pbox(B, NS('paint'), K.foam, L, 0.012, 0.08, L / 2, 0.006, sz * (W / 2 - 0.05));
        for (let x = 0.3; x < L; x += 1.7) pbox(B, NS('paint'), K.foam, 0.4 + hash(x) * 0.5, 0.01, 0.05, x, 0.005, sz * (W / 2 - 0.16 - hash(x * 3) * 0.1));
      }
      pbox(B, NS('paint'), K.foam, 0.1, 0.012, W - 0.1, 0.05, 0.006, 0);
      // a drift of leaves and a lost ball in the corner
      for (let k = 0; k < 9; k++) pbox(B, NS('paint'), ['#7a6a3a', '#8a5a30', '#5d6a33'][k % 3], 0.07, 0.006, 0.05, 0.4 + hash(k) * 2.2, 0.004, -W / 2 + 0.3 + hash(k * 5) * 0.8, { ry: hash(k * 2) * 3 });
      B.sph(NS('gloss'), K.red, 0.09, 1.6, 0.02, W / 2 - 0.45, { ws: 8, hs: 6 });
    },
  };

  // ================================================================================================ humpback bridge
  // The centre crossing (placed once at the origin, mirror: false). The level carries the walking surfaces: approach
  // ramps (z ±13.8 → ±7, 0 → 3.0), the humped crest (3.0 → 3.3 at z 0), brick parapets x ±2.2…2.6. This prop builds
  // everything else: the water arch (springs at the canal edges z ±5 from the water line, crown soffit 2.45), the two
  // towpath arches (z ±5…±7, springing 1.9) the towpaths pass under, spandrel walls, the barrel soffits, blue-brick
  // voussoir rings, stone string course, saddleback parapet copings (colliding), end piers with lamps, bridge plates.
  const BR = { R: 5.11, yc: 2.45 - 5.11, Rt: 1.336, yt: 1.014, spring: 1.9, face: 2.6 };
  const deckTop = (z) => { const a = Math.abs(z); return a >= 8.4 ? (3.0 * (15.2 - a)) / 6.8 : a >= 7 ? 3.0 : 3.0 + 0.3 * (1 - a / 7); };
  const soffitW = (z) => BR.yc + Math.sqrt(Math.max(0, BR.R * BR.R - z * z));
  const soffitT = (z) => { const c = z < 0 ? -6 : 6; return BR.yt + Math.sqrt(Math.max(0, BR.Rt * BR.Rt - (z - c) * (z - c))); };
  function spandrelProfile() {
    const p = [];
    for (let i = 0; i <= 28; i++) { const z = -7 + (i / 28) * 14; p.push([z, deckTop(z) - 0.25]); }
    p.push([7, BR.spring]);
    for (let i = 1; i < 10; i++) { const z = 7 - (i / 10) * 2; p.push([z, soffitT(z)]); }
    p.push([5, BR.spring], [5, -1.85], [4.995, soffitW(4.995)]);
    for (let i = 1; i < 40; i++) { const z = 5 - (i / 40) * 10; p.push([z, soffitW(z)]); }
    p.push([-4.995, soffitW(-4.995)], [-5, -1.85], [-5, BR.spring]);
    for (let i = 1; i < 10; i++) { const z = -5 - (i / 10) * 2; p.push([z, soffitT(z)]); }
    p.push([-7, BR.spring]);
    return p.reverse();
  }
  // voussoir ring on a face (face plane at local z = 0, facing +Z in the ring frame): blocks between radii r0 … r1 on a
  // circle centred (cz, cy) from angle a0 → a1; colours alternate (blue headers, the odd red), mortar gaps between
  function voussoirGeo(key, cz, cy, r0, r1, a0, a1, n, proud) {
    return tpl('vous|' + key, () => {
      const g = new GB(), cb = cx3(K.blue), cb2 = cx3(K.blueDk), cr = cx3(K.brickDk), gap = 0.006;
      for (let i = 0; i < n; i++) {
        const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n, h = hash(i * 3.7 + r0);
        const c = h < 0.12 ? cr : h < 0.55 ? cb : cb2;
        const q = (r, t) => [cz + Math.cos(t) * r, cy + Math.sin(t) * r];
        const e0 = t0 + gap / r0, e1 = t1 - gap / r0;
        const A = q(r0, e0), Bq = q(r0, e1), C = q(r1, e1), Dq = q(r1, e0);
        const f = [A, Bq, C, Dq].map(([z, y]) => g.v(z, y, proud, 0, 0, 1, c[0], c[1], c[2]));
        g.quad(f[0], f[1], f[2], f[3]);
        // intrados (soffit edge) + extrados edge + radial sides of the proud block
        const side = (P0, P1, nz, ny) => { const a = g.v(P0[0], P0[1], proud, nz, ny, 0, ...c), b = g.v(P1[0], P1[1], proud, nz, ny, 0, ...c), c2 = g.v(P1[0], P1[1], 0, nz, ny, 0, ...c), d = g.v(P0[0], P0[1], 0, nz, ny, 0, ...c); g.quad(a, b, c2, d); };
        const tm = (e0 + e1) / 2;
        side(A, Bq, -Math.cos(tm), -Math.sin(tm));
        side(Dq, C, Math.cos(tm), Math.sin(tm));
      }
      return g.geo();
    });
  }
  // a curved barrel soffit (under an arch): rows along X, profile fn(z) → y, faces down
  function barrelGeo(key, z0, z1, fn, W, n, colr) {
    return tpl('barrel|' + key, () => {
      const g = new GB(), rows = [], c0 = cx3(colr);
      for (let i = 0; i <= n; i++) {
        const z = z0 + ((z1 - z0) * i) / n, y = fn(z), dz = 0.01, dy = (fn(z + dz) - fn(z - dz)) / (2 * dz);
        const l = Math.hypot(dy, 1), nz = dy / l, ny = -1 / l;
        const k = 0.85 + 0.2 * hash(i * 1.3), c = [c0[0] * k, c0[1] * k, c0[2] * k];
        rows.push([g.v(-W / 2, y, z, 0, ny, nz, ...c), g.v(W / 2, y, z, 0, ny, nz, ...c)]);
      }
      for (let i = 0; i < n; i++) g.quad(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]);
      return g.geo();
    });
  }
  D.lockgate_bridge = {
    desc: 'The humpback brick bridge dressing (placed once at the origin, mirror: false): water arch + towpath arches, spandrels, barrel soffits, blue-brick voussoir rings, stone string course, saddleback parapet copings, end piers with lamps, cast-iron bridge plates, rope guards. See the BR notes in props.js. half: the deck half-width (2.2; Tower Command builds it wider, layout.js BRIDGE_T).',
    params: { half: 'deck half-width (2.2)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      // outer faces ±F, parapet centre lines ±PX (the layout's parapets run bw … bw + 0.4)
      const F = o.half != null ? o.half + 0.4 : BR.face, PX = o.half != null ? o.half + 0.2 : 2.4, wk = o.half != null ? '|' + kf(F) : '';
      const span = tpl('spandrel', () => extrudeGeo(spandrelProfile(), 0.36, 0.004));
      for (const sx of [-1, 1]) B.add('paint', span, K.brickDk, sx * PX, 0, 0, {});
      // brick courses on the spandrel faces (flush mortar lines clipped to the masonry)
      const inMasonry = (z, y) => {
        const a = Math.abs(z);
        if (y > deckTop(z) - 0.3) return false;
        if (a < 5) return y > soffitW(z) + 0.02;
        if (a <= 7) return y < 0 ? false : y > soffitT(z) + 0.02 || (a > 4.99 && a < 5.01);
        return false;
      };
      B.add(NS('paint'), tpl('spandrelBricks', () => {
        // brick face detail over the flat spandrel: course lines + vitrified blue headers + per-brick tone patches
        const g = new GB(), cl = cx3(K.brickDk), cb = cx3(K.blueDk), cL = cx3(K.brickLt);
        const quad = (z0, z1, y0, y1, c) => { const a = g.v(0, y0, z0, 1, 0, 0, ...c), b = g.v(0, y0, z1, 1, 0, 0, ...c), d = g.v(0, y1, z1, 1, 0, 0, ...c), e = g.v(0, y1, z0, 1, 0, 0, ...c); g.quad(a, b, d, e); };
        let row = 0;
        for (let y = -1.3; y < 3.2; y += 0.075, row++) {
          const hdr = row % 2 === 1, bl = hdr ? 0.1125 : 0.225, off = hdr ? 0 : 0.056;
          for (let z = -7 + off; z < 7; z += bl) {
            const zm = z + bl / 2;
            if (!inMasonry(z + 0.01, y + 0.01) || !inMasonry(z + bl - 0.01, y + 0.064)) continue;
            const h = hash(z * 13.1 + y * 71.7);
            if (hdr && h < 0.42) quad(z + 0.006, z + bl - 0.006, y + 0.006, y + 0.069, lerp3(cb, cl, hash(h * 9) * 0.3));
            else if (h > 0.86) quad(z + 0.006, z + bl - 0.006, y + 0.006, y + 0.069, h > 0.93 ? cL : cl);
            if (zm > 20) break;
          }
          if (row % 2 === 0) { let s0 = null; for (let i = 0; i <= 140; i++) { const z = -7 + (i / 140) * 14, ok = inMasonry(z, y) && i < 140; if (ok && s0 === null) s0 = z; if (!ok && s0 !== null) { if (z - 0.1 - s0 > 0.15) quad(s0, z - 0.1, y - 0.004, y + 0.004, lerp3(cl, [0.55, 0.52, 0.48], 0.35)); s0 = null; } } }
        }
        return g.geo();
      }), 'white', F - 0.011, 0, 0, {});
      B.push(0, 0, 0, PI);
      B.add(NS('paint'), TPL.get('spandrelBricks'), 'white', F - 0.011, 0, 0, {});
      B.pop();
      // soffits: the water barrel + the two towpath barrels, pier faces toward the towpaths
      B.add(NS('paint'), barrelGeo('w' + wk, -4.99, 4.99, soffitW, 2 * F - 0.06, 40, K.blueDk), 'white', 0, 0, 0, {});
      for (const s of [-1, 1]) {
        B.add('paint', barrelGeo('t' + s + wk, s * 7, s * 5, soffitT, 2 * F - 0.06, 10, K.blue), 'white', 0, 0, 0, {});
        pbox(B, 'paint', K.blue, 2 * F - 0.04, BR.spring + 1.7, 0.04, 0, (BR.spring - 1.7) / 2, s * 5.02);
        pbox(B, NS('paint'), K.blueDk, 2 * F - 0.06, 1.78, 0.6, 0, -0.81, s * 4.72);   // haunch fill below the soffit at the springing
      }
      // voussoir rings: water arch (2 rings of headers), towpath arches (1 ring)
      const a0 = Math.atan2(-1.6 - BR.yc, 5), a1 = PI - a0;
      const vw1 = voussoirGeo('w1', 0, BR.yc, BR.R, BR.R + 0.22, a0, a1, 120, 0.05);
      const vw2 = voussoirGeo('w2', 0, BR.yc, BR.R + 0.22, BR.R + 0.44, a0 + 0.004, a1 - 0.004, 128, 0.035);
      const ta0 = Math.atan2(BR.spring - BR.yt, 1), ta1 = PI - ta0;
      const vt = voussoirGeo('t', 0, BR.yt, BR.Rt, BR.Rt + 0.2, ta0, ta1, 22, 0.045);
      for (const sx of [-1, 1]) {
        B.push(sx * F, 0, 0, sx * HP);
        B.add('paint', vw1, 'white', 0, 0, 0, {}); B.add('paint', vw2, 'white', 0, 0, 0, {});
        for (const s of [-1, 1]) B.add('paint', vt, 'white', s * 6 * sx, 0, 0, {});
        // keystone
        B.box('paint', K.stone, 0.34, 0.5, 0.09, 0, BR.yc + BR.R + 0.24, 0.02, { r: 0.02 });
        B.pop();
        // string course following the hump, just under the parapet
        for (let i = 0; i < 14; i++) {
          const zA = -7 + i, zB = zA + 1;
          seg(B, 'paint', K.stone, [sx * (F + 0.04), deckTop(zA) - 0.3, zA], [sx * (F + 0.04), deckTop(zB) - 0.3, zB], 0.1, 0.13);
        }
        // cast-iron rope guards on the towpath-arch corners, the rope grooves they save
        for (const s of [-1, 1]) {
          B.box('metal', K.iron, 0.08, 1.3, 0.08, sx * (F + 0.02), 0.65, s * 5.0, { r: 0.02 });
          for (let k = 0; k < 4; k++) pbox(B, NS('paint'), K.blueDk, 0.012, 0.02, 0.25, sx * (F + 0.004), 0.5 + k * 0.23, s * 5.15);
        }
        // bridge plate on the parapet over the crown: black oval, white raised letters
        B.push(sx * (F + 0.01), 3.72, 0, sx * HP);
        B.add('gloss', tpl('plate', () => latheGeo([[0, 0.04], [0.3, 0.04], [0.32, 0.02], [0.32, 0], [0, 0]], 20)), K.black, 0, 0, 0, { rx: HP, sx: 1.5, sz: 0.85, s: 1 });
        letters(B, 'BRIDGE 2', { h: 0.1, x: 0, y: 0.02, z: 0.045, c: K.white, flat: true, wt: 0.2 });
        letters(B, 'LOCKGATE', { h: 0.065, x: 0, y: -0.14, z: 0.045, c: K.white, flat: true, wt: 0.22, track: 0.2 });
        B.pop();
      }
      // saddleback copings on the four parapet runs (collide), end piers with lamps
      const top = (z) => deckTop(z) + 0.85;
      for (const sx of [-1, 1]) {
        const x = sx * PX;
        for (let i = 0; i < 40; i++) {
          const zA = -15.1 + i * 0.9, zB = Math.min(15.1, zA + 0.88);
          if (zA >= 15.1) break;
          const yA = top(zA), yB = top(zB);
          B.push(x, (yA + yB) / 2, (zA + zB) / 2, 0, -Math.atan2(yB - yA, zB - zA));
          B.box('paint', mixc(K.stone, K.stoneDk, hash(i + sx) * 0.6), 0.52, 0.1, zB - zA - 0.012, 0, 0.05, 0, { r: 0.02 });
          B.add('paint', tpl('saddle', () => extrudeGeo([[-0.24, 0], [0.24, 0], [0.04, 0.1], [-0.04, 0.1]], 1, 0.005)), mixc(K.stone, K.stoneDk, hash(i * 3 + sx) * 0.6), 0, 0.1, 0, { ry: HP, sx: zB - zA - 0.012 });
          B.pop();
          // (the parapets are roof: true level pieces: no coping colliders — a turned bridge would inflate their AABBs)
        }
        for (const s of [-1, 1]) {
          const z = s * 15.45;
          brickBox(B, K.brick, 0.72, 1.3, 0.72, x, 0.65, z, { step: 0.225, faces: 'zx' });
          B.box('paint', K.stone, 0.86, 0.14, 0.86, x, 1.37, z, { r: 0.03 });
          B.box('paint', K.stoneLt, 0.62, 0.1, 0.62, x, 1.49, z, { r: 0.03 });
          colC(B, x, 0, z, 0.86, 1.55, 0.86, ROOF);
          pierLamp(B, x, 1.54, z);
        }
      }
      // masonry colliders (turned with the bridge): the arch springings over the water's edge and the towpath-arch
      // soffits the towpaths pass under (headroom 1.8 m over the quay)
      for (const s of [-1, 1]) {
        B.col(-F, -1.6, s > 0 ? 4.3 : -4.77, F, 2.6, s > 0 ? 4.77 : -4.3);
        B.col(-F, BR.spring + 0.05, s > 0 ? 4.77 : -7.0, F, 2.7, s > 0 ? 7.0 : -4.77);
      }
    },
  };

  // ================================================================================================ building kit
  // Façades face +Z in the current frame with the wall plane at z = 0 (fittings ≤ 0.12 m proud on playable walls).
  // pitched slate roof over x0…x1 × z0…z1, ridge along X at yE + rise: gable-end prisms, slates with course lines,
  // ridge tiles, eaves gutter. o.wall = gable brick colour, o.ov = overhang, o.hip: no gable prisms (hidden ends)
  function slateRoof(B, x0, x1, z0, z1, yE, rise, o = {}) {
    const L = x1 - x0, cx = (x0 + x1) / 2, d = z1 - z0, cz = (z0 + z1) / 2, ov = o.ov ?? 0.3, sc = o.slate ?? K.slate;
    const mat = o.ns ? NS('paint') : 'paint';
    if (!o.noGable) B.add(mat, tpl(['gprism', d, rise].map(kf).join('|'), () => extrudeGeo([[-d / 2, 0], [d / 2, 0], [0, rise]], 1, 0.001)), o.wall ?? K.brick, cx, yE, cz, { sx: L });
    const pitch = Math.atan2(rise, d / 2), sl = Math.hypot(rise, d / 2) + ov, t = 0.12;
    for (const s of [-1, 1]) {
      B.push(cx, yE + rise / 2, cz + (s * d) / 4, 0, s * pitch);
      B.box(mat, sc, L + ov * 2, t, sl, 0, t / 2, s * (ov / 2), { r: 0.02 });
      if (!o.ns) for (let k = 0.35; k < sl - 0.1; k += o.course ?? 0.42) pbox(B, NS('paint'), shade(sc, 0.82), L + ov * 2 - 0.02, 0.02, 0.03, 0, t + 0.006, s * (ov / 2) - sl / 2 + k);
      B.pop();
      if (!o.noGutter) { B.cyl(mat, K.iron, 0.07, L + ov * 2, cx, yE - 0.06, cz + s * (d / 2 + ov * 0.85), { rz: HP, seg: 6 }); }
    }
    B.box(mat, shade(sc, 0.7), L + ov * 2 + 0.04, 0.16, 0.26, cx, yE + rise + 0.06, cz, { r: 0.05 });
  }
  // segmental-arched cast-iron window (opening w × h, sill at y): dark glass, glazing bars, blue-brick arch, stone sill
  function archWin(B, x, y, w, h, o = {}) {
    const mat = o.ns ? NS('paint') : 'paint', gl = o.glass ?? K.glass, fr = o.frame ?? K.iron;
    pbox(B, NS('gloss'), gl, w, h, 0.02, x, y + h / 2, 0.01);
    if (o.lit) pbox(B, NS('glow'), '#ffcf8a', w * 0.8, h * 0.5, 0.004, x, y + h * 0.45, 0.022, { glow: o.lit });
    const nb = o.bars ?? Math.max(1, Math.round(w / 0.32) - 1), nh = Math.max(1, Math.round(h / 0.36) - 1);
    for (let i = 1; i <= nb; i++) pbox(B, NS('paint'), fr, 0.03, h, 0.03, x - w / 2 + (i * w) / (nb + 1), y + h / 2, 0.03);
    for (let j = 1; j <= nh; j++) pbox(B, NS('paint'), fr, w, 0.03, 0.03, x, y + (j * h) / (nh + 1), 0.03);
    for (const sx of [-1, 1]) pbox(B, mat, fr, 0.06, h, 0.05, x + sx * (w / 2 - 0.03), y + h / 2, 0.025);
    // arch head: a segmental band of blue headers springing just below the frame head (glass fills up to it)
    const Rw = w * 0.95, al = Math.asin(Math.min(0.99, (w / 2 + 0.06) / Rw));
    pbox(B, NS('gloss'), gl, w, 0.12, 0.02, x, y + h + 0.05, 0.01);
    B.add(mat, voussoirGeo('win' + kf(w), 0, -Rw + 0.1, Rw, Rw + 0.23, HP - al, HP + al, 9, 0.03), 'white', x, y + h, 0, {});
    B.box(mat, o.sill ?? K.stone, w + 0.22, 0.09, 0.14, x, y - 0.045, 0.06, { r: 0.015 });
  }
  // timber taking-in door pair (opening w × h, bottom at y), open: one leaf folded back, a sack in the dark doorway
  function takingDoor(B, x, y, w, h, o = {}) {
    const c = o.c ?? K.green;
    pbox(B, NS('paint'), '#141517', w, h, 0.02, x, y + h / 2, 0.01);
    B.box('paint', K.stone, w + 0.3, 0.14, 0.2, x, y - 0.07, 0.08, { r: 0.02 });
    B.box('paint', K.stone, w + 0.3, 0.22, 0.12, x, y + h + 0.11, 0.05, { r: 0.02 });
    if (o.open) {
      for (const sx of [-1, 1]) {
        B.box('wood', c, 0.07, h - 0.04, w / 2, x + sx * (w / 2 + 0.04), y + h / 2, w / 4 + 0.02, { r: 0.012 });
        for (const yy of [0.25, h - 0.25]) pbox(B, NS('metal'), K.iron, 0.075, 0.06, w / 2 - 0.1, x + sx * (w / 2 + 0.04), y + yy, w / 4 + 0.03);
      }
      B.box('paint', '#b89a6a', w * 0.5, 0.5, 0.4, x - w * 0.12, y + 0.25, -0.12, { r: 0.1 });
      B.box('paint', '#a88a5c', w * 0.4, 0.42, 0.36, x + w * 0.2, y + 0.21, -0.2, { r: 0.1 });
    } else {
      for (const sx of [-1, 1]) {
        B.box('wood', c, w / 2 - 0.02, h - 0.04, 0.07, x + sx * w / 4, y + h / 2, 0.035, { r: 0.012 });
        for (const yy of [0.3, h / 2, h - 0.3]) pbox(B, NS('paint'), shade(c, 0.8), w / 2 - 0.1, 0.1, 0.02, x + sx * w / 4, y + yy, 0.075);
        seg(B, NS('paint'), shade(c, 0.8), [x + sx * 0.08, y + 0.35, 0.075], [x + sx * (w / 2 - 0.1), y + h - 0.35, 0.075], 0.02, 0.09, { plain: true });
      }
      for (const sx of [-1, 1]) for (const yy of [0.3, h - 0.3]) pbox(B, NS('metal'), K.iron, 0.3, 0.05, 0.02, x + sx * (w / 2 - 0.15), y + yy, 0.08);
    }
  }
  // chimney stack with oversailing courses and pots
  function chimney(B, x, y, z, w, d, h, pots = 2, mat = 'paint') {
    B.box(mat, K.brick, w, h, d, x, y + h / 2, z, { r: 0.03 });
    B.box(mat, K.brickDk, w + 0.12, 0.12, d + 0.12, x, y + h - 0.2, z, { r: 0.02 });
    B.box(mat, K.brickDk, w + 0.16, 0.1, d + 0.16, x, y + h - 0.05, z, { r: 0.02 });
    for (let k = 0; k < pots; k++) B.lathe(mat, '#a45a3c', [[0.13, 0], [0.11, 0.3], [0.13, 0.34], [0.1, 0.36], [0, 0.36]], x + (k - (pots - 1) / 2) * (w / pots), y + h, z, { seg: 7 });
  }
  function downpipe(B, x, y0, y1, z = 0.08, c = K.iron) {
    B.cyl('paint', c, 0.05, y1 - y0, x, (y0 + y1) / 2, z, { seg: 6 });
    B.box('paint', c, 0.2, 0.22, 0.16, x, y1 - 0.05, z, { r: 0.03 });
    B.cyl('paint', c, 0.06, 0.2, x, y0 + 0.1, z + 0.05, { rx: 0.9, seg: 6 });
    for (let yy = y0 + 1.0; yy < y1 - 0.4; yy += 1.8) pbox(B, NS('metal'), K.ironLt, 0.14, 0.04, 0.1, x, yy, z - 0.03);
  }

  // ================================================================================================ the wharf warehouse
  // Spawn building (pos = centre of the back wall face, local z = 0 is the façade, building behind it; the level wall
  // carries the ground floor up to 4.6 m). Five-storey centre block with a pediment, clock and the lucam hoist over the
  // loading-door stack; three-storey wings with a cast-iron wall crane; painted LOCKGATE WHARF band; canopy over the
  // loading stage; slate roofs, chimneys; the building mass collides above the wall (camera-safe).
  D.lockgate_warehouse = {
    desc: 'LOCKGATE WHARF bonded warehouse (spawn building; pos = centre of the back wall face, local z = 0, building behind): ground-floor fittings on the playable wall, loading canopy over the spawn stage, 5-storey centre block with pediment + clock + lucam hoist (jib, chain, hook, bale), 3-storey wings with a cast-iron wall crane, painted sign band, slate roofs, chimneys; upper mass collides.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const WT = 4.6, CE = 16.4, WE = 11, DZ = -12.6, br = K.brick, trim = K.stone;
      const floorsC = [4.6, 7.6, 10.6, 13.6], floorsW = [4.6, 7.8];
      // ---- masses (behind the façade plane): centre block + wings
      B.box('paint', br, 26, CE - WT, -DZ, 0, (CE + WT) / 2, DZ / 2, { r: 0.05 });
      for (const sx of [-1, 1]) B.box('paint', br, 13, WE - WT, -DZ, sx * 19.5, (WE + WT) / 2, DZ / 2, { r: 0.05 });
      // brick course lines on the upper façade (flush), plinth band
      for (let y = WT + 0.3; y < CE; y += 0.3) pbox(B, NS('paint'), K.brickDk, y < WE ? 52 : 26, 0.014, 0.01, 0, y, 0.004);
      // ---- pilasters, string courses, cornices
      const bayC = [-13, -9.75, -6.5, -3.25, 3.25, 6.5, 9.75, 13];
      for (const x of bayC) B.box('paint', br, 0.5, CE - WT, 0.14, x, (CE + WT) / 2, 0.07, { r: 0.02 });
      for (const sx of [-1, 1]) for (const x of [16.25, 19.5, 22.75, 26]) B.box('paint', br, 0.5, WE - WT, 0.14, sx * (x - (x === 26 ? 0.25 : 0)), (WE + WT) / 2, 0.07, { r: 0.02 });
      for (const y of floorsC.slice(1)) B.box('paint', trim, 26.4, 0.16, 0.2, 0, y, 0.1, { r: 0.02 });
      for (const sx of [-1, 1]) B.box('paint', trim, 13.2, 0.16, 0.2, sx * 19.5, floorsW[1], 0.1, { r: 0.02 });
      B.box('paint', trim, 26.6, 0.3, 0.34, 0, CE - 0.15, 0.12, { r: 0.04 });
      B.box('paint', br, 26.4, 0.25, 0.22, 0, CE - 0.45, 0.08, { r: 0.02 });
      for (let x = -12.9; x <= 12.9; x += 0.45) pbox(B, NS('paint'), br, 0.2, 0.14, 0.14, x, CE - 0.64, 0.07);
      for (const sx of [-1, 1]) { B.box('paint', trim, 13.2, 0.26, 0.3, sx * 19.5, WE - 0.13, 0.1, { r: 0.04 }); for (let x = 13.2; x <= 25.9; x += 0.45) pbox(B, NS('paint'), br, 0.2, 0.14, 0.14, sx * x, WE - 0.4, 0.07); }
      // ---- windows (dark, small panes); lit ones at dusk
      for (const [i, y] of floorsC.entries()) if (i < 3) for (const x of [-11.4, -8.1, -4.9, 4.9, 8.1, 11.4]) archWin(B, x, y + 0.7, 1.3, 1.75, { lit: hash(x * 3 + y) > 0.72 ? 0.9 : 0 });
      for (const sx of [-1, 1]) for (const y of floorsW) for (const x of [14.6, 17.9, 21.1, 24.3]) archWin(B, sx * x, y + 0.75, 1.3, 1.75, { lit: hash(x * 7 + y * sx) > 0.75 ? 0.9 : 0 });
      // ---- centre bay: taking-in doors up the stack (the lowest opens onto the stage), lucam hoist on top
      for (const [i, y] of floorsC.entries()) if (i > 0) takingDoor(B, 0, y + 0.15, 1.9, 2.4, { open: i === 2 });
      // the stage doors (on the level wall, at stage level 2.4): wide open, dark interior + sacks
      takingDoor(B, -5.2, 2.4, 2.4, 2.05, { open: true, c: K.green });
      takingDoor(B, 5.2, 2.4, 2.4, 2.05, { open: false, c: K.green });
      // lucam: weatherboarded hoist housing projecting over the door stack, gabled, on iron brackets
      const LY = 13.6, LZ = 1.1;
      B.box('paint', K.timber, 2.6, 3.2, LZ, 0, LY + 1.6, LZ / 2, { r: 0.04 });
      for (let y = LY + 0.2; y < LY + 3.1; y += 0.2) pbox(B, NS('paint'), shade(K.timber, 0.75), 2.62, 0.025, LZ + 0.02, 0, y, LZ / 2);
      pbox(B, NS('paint'), '#141517', 1.6, 2.1, 0.02, 0, LY + 1.25, LZ + 0.01);
      B.box('wood', K.green, 0.08, 2.05, 0.8, -0.85, LY + 1.25, LZ + 0.4, { r: 0.012 });
      B.push(0, LY + 3.2, LZ / 2, HP);
      slateRoof(B, -LZ / 2 - 0.2, LZ / 2 + 0.6, -1.3, 1.3, 0, 1.0, { wall: K.timber, ov: 0.15, noGutter: true });
      B.pop();
      for (const sx of [-1, 1]) seg(B, 'metal', K.iron, [sx * 1.1, LY - 0.6, 0.05], [sx * 1.1, LY, LZ - 0.1], 0.08, 0.08);
      // jib beam out of the gable with a pulley, chain, hook and a bale on its way up
      B.box('wood', K.timberLt, 0.26, 0.3, 2.2, 0, LY + 4.35, 1.4, { r: 0.03 });
      B.cyl('metal', K.iron, 0.2, 0.08, 0, LY + 4.05, 2.35, { rx: 0, rz: HP, seg: 12 });
      B.tube(NS('metal'), K.ironLt, [P3(0, LY + 4.0, 2.55), P3(0, 7.9, 2.55)], 0.018, { radial: 4 });
      B.tor('metal', K.iron, 0.12, 0.025, 0, 7.75, 2.55, { rs: 4, ts: 10, arc: PI * 1.3, rz: -0.6 });
      B.box('paint', '#b39a6a', 0.9, 0.7, 0.7, 0, 7.1, 2.55, { round: true, r: 0.12 });
      for (const sy of [-0.2, 0.2]) pbox(B, NS('paint'), K.rope, 0.92, 0.03, 0.72, 0, 7.1 + sy, 2.55);
      // ---- pediment, clock, name band
      B.push(0, CE, DZ / 2, 0);
      B.add('paint', tpl('pedi', () => extrudeGeo([[-6.2, 0], [6.2, 0], [0, 3.1]], 1, 0.002)), br, 0, 0, 0, { ry: HP, sx: -DZ });
      B.pop();
      for (const s of [-1, 1]) { B.push(s * 3.1, CE + 1.55, 0.12, 0, 0, -s * Math.atan2(3.1, 6.2)); B.box('paint', trim, 7.2, 0.26, 0.28, 0, 0, 0, { r: 0.04 }); B.pop(); }
      B.cyl('paint', trim, 1.05, 0.16, 0, CE + 1.35, 0.1, { rx: HP, seg: 24 });
      B.cyl('paint', K.cream, 0.9, 0.06, 0, CE + 1.35, 0.2, { rx: HP, seg: 24 });
      B.cyl(NS('glow'), '#fff3d6', 0.8, 0.02, 0, CE + 1.35, 0.235, { rx: HP, seg: 24, glow: 0.6 });
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; pbox(B, NS('paint'), K.black, 0.05, k % 3 ? 0.08 : 0.16, 0.01, Math.sin(a) * 0.68, CE + 1.35 + Math.cos(a) * 0.68, 0.25, { rz: -a }); }
      pbox(B, NS('paint'), K.black, 0.05, 0.42, 0.012, Math.sin(0.9) * 0.2, CE + 1.35 + Math.cos(0.9) * 0.2, 0.26, { rz: -0.9 });
      pbox(B, NS('paint'), K.black, 0.04, 0.6, 0.012, Math.sin(4.2) * 0.3, CE + 1.35 + Math.cos(4.2) * 0.3, 0.262, { rz: -4.2 });
      B.sph('metal', K.gold, 0.14, 0, CE + 3.25, 0.05, { ws: 8, hs: 6 });
      // painted name across the top storey, either side of the lucam (sign-writer's shaded cream letters on a green band)
      for (const sx of [-1, 1]) {
        const cxs = sx * 7.35;
        B.box('paint', K.green, 10.4, 1.55, 0.03, cxs, 14.85, 0.015, { r: 0.01 });
        pbox(B, NS('paint'), K.cream, 10.1, 0.05, 0.005, cxs, 15.5, 0.032); pbox(B, NS('paint'), K.cream, 10.1, 0.05, 0.005, cxs, 14.2, 0.032);
        letters(B, sx < 0 ? 'LOCKGATE' : 'WHARF', { h: 0.95, x: cxs + 0.05, y: 14.33, z: 0.031, c: K.blackLt, flat: true, wt: 0.21, track: 0.16 });
        letters(B, sx < 0 ? 'LOCKGATE' : 'WHARF', { h: 0.95, x: cxs, y: 14.38, z: 0.034, c: K.cream, flat: true, wt: 0.21, track: 0.16 });
      }
      for (const sx of [-1, 1]) {
        B.box('paint', K.green, 11.2, 0.62, 0.03, sx * 19.5, 7.28, 0.015, { r: 0.01 });
        letters(B, sx < 0 ? 'BONDED STORES' : 'CARRIERS & WHARFINGERS', { h: 0.34, x: sx * 19.5, y: 7.11, z: 0.034, c: K.cream, flat: true, wt: 0.2, track: 0.1 });
      }
      // ---- roofs + chimneys
      slateRoof(B, -13.2, 13.2, DZ - 0.1, 0.05, CE + 0.05, 3.2, { ov: 0.35, noGable: true });
      for (const sx of [-1, 1]) slateRoof(B, sx > 0 ? 13 : -26.3, sx > 0 ? 26.3 : -13, DZ - 0.1, 0.05, WE + 0.05, 2.6, { ov: 0.3 });
      for (const [x, y, h] of [[-9, CE + 1.2, 3.2], [9, CE + 1.2, 3.2], [-21, WE + 0.8, 3.0], [21, WE + 0.8, 3.0]]) chimney(B, x, y, DZ / 2 - 1.5, 1.1, 0.8, h, 3);
      // ---- loading canopy over the stage: slate-topped lean-to on scrolled iron brackets
      const CY = 6.3, CD = 3.6;
      B.push(0, CY, CD / 2, 0, -0.18);
      B.box('paint', K.slateDk, 18.6, 0.14, CD + 0.2, 0, 0, 0, { r: 0.03 });
      for (let k = -8.8; k <= 8.8; k += 0.9) pbox(B, NS('paint'), K.slate, 0.04, 0.03, CD + 0.18, k, 0.08, 0);
      B.pop();
      B.box('paint', K.green, 18.6, 0.3, 0.1, 0, CY - 0.47, CD + 0.02, { r: 0.02 });
      for (let x = -9; x <= 9.01; x += 3) {
        B.box('metal', K.green, 0.12, 1.6, 0.12, x, CY - 0.9, 0.08, { r: 0.02 });
        B.tube('metal', K.green, [P3(x, CY - 1.6, 0.1), P3(x, CY - 0.9, 1.0), P3(x, CY - 0.5, 2.4), P3(x, CY - 0.4, CD)], 0.045, { radial: 5 });
        B.tube(NS('metal'), K.green, [P3(x, CY - 1.0, 0.12), P3(x, CY - 1.15, 0.7), P3(x, CY - 0.8, 1.1)], 0.025, { radial: 4 });
      }
      for (const x of [-7.5, -2.8, 2.8, 7.5]) { cyl(B, 'metal', K.iron, 0.012, 0.5, x, CY - 0.72, CD - 0.3, { seg: 4 }); lantern(B, x, CY - 1.72, CD - 0.3, 0.85); }
      // ---- ground floor fittings on the playable wall (wings): cart arches, barred windows, downpipes, plaques
      for (const sx of [-1, 1]) {
        for (const x of [12.2, 23.4]) {
          const X = sx * x;
          pbox(B, NS('paint'), '#141517', 2.6, 3.1, 0.02, X, 1.55, 0.01);
          B.add('paint', voussoirGeo('cart', 0, -1.3, 1.45, 1.75, 0.45, PI - 0.45, 13, 0.05), 'white', X, 3.1 + 0.1, 0, {});
          for (const s2 of [-1, 1]) {
            B.box('wood', K.green, 1.26, 2.95, 0.08, X + s2 * 0.66, 1.5, 0.04, { r: 0.012 });
            for (let k = -0.5; k <= 0.51; k += 0.25) pbox(B, NS('paint'), shade(K.green, 0.78), 0.02, 2.9, 0.02, X + s2 * 0.66 + k, 1.5, 0.085);
          }
          B.box('paint', K.stone, 0.3, 0.6, 0.18, X - 1.45, 0.3, 0.09, { r: 0.04 });
          B.box('paint', K.stone, 0.3, 0.6, 0.18, X + 1.45, 0.3, 0.09, { r: 0.04 });
        }
        for (const x of [15.8, 19.6]) {
          archWin(B, sx * x, 1.4, 1.2, 1.6, {});
          for (let k = -0.45; k <= 0.46; k += 0.15) pbox(B, NS('metal'), K.iron, 0.025, 1.6, 0.025, sx * x + k, 2.2, 0.06);
        }
        downpipe(B, sx * 13.3, 0, WE - 0.1);
        downpipe(B, sx * 9.35, 0, CE - 0.3);
        // cast-iron wall crane on the wing (jib swung out over the yard, chain + hook)
        const cxw = sx * 17.9, cyw = 4.2;
        B.box('metal', K.iron, 0.2, 3.2, 0.14, cxw, cyw + 1.6, 0.1, { r: 0.03 });
        seg(B, 'metal', K.iron, [cxw, cyw + 3.1, 0.12], [cxw, cyw + 2.9, 2.6], 0.14, 0.2);
        seg(B, 'metal', K.iron, [cxw, cyw + 0.3, 0.14], [cxw, cyw + 2.75, 2.2], 0.1, 0.12);
        B.cyl('metal', K.ironLt, 0.16, 0.06, cxw, cyw + 2.75, 2.55, { rz: HP, seg: 10 });
        B.cyl('metal', K.iron, 0.24, 0.1, cxw + sx * 0.15, cyw + 0.9, 0.3, { rz: HP, seg: 12 });
        B.tube(NS('metal'), K.ironLt, [P3(cxw, cyw + 2.7, 2.62), P3(cxw, 2.6, 2.62)], 0.014, { radial: 4 });
        B.tor(NS('metal'), K.iron, 0.09, 0.02, cxw, 2.5, 2.62, { rs: 4, ts: 8, arc: PI * 1.3, rz: -0.6 });
      }
      // stage doorway plaque + lamps on the wall at stage level
      B.push(0, 3.6, 0);
      boardSign(B, 'No 1 WAREHOUSE', 0, 0.6, { h: 0.2, board: K.green, c: K.cream, border: K.cream, bd: 0.03 });
      B.pop();
      // ground storey of the wings beyond the playable wall (out of play): brick + arches + windows
      for (const [a, b2] of o.fill || []) {
        B.box(NS('paint'), br, b2 - a, WT, -DZ, (a + b2) / 2, WT / 2, DZ / 2, { r: 0.04 });
        for (let x = a + 1.6; x < b2 - 1; x += 3.2) archWin(B, x, 1.4, 1.2, 1.6, { ns: true });
      }
      // colliders: upper storeys + roofs (camera-safe, all behind the façade)
      B.col(-13.2, WT, DZ - 0.3, 13.2, CE + 3.3, 0, ROOF);
      B.col(-26.3, WT, DZ - 0.3, 26.3, WE + 2.6, 0, ROOF);
      B.col(-1.3, LY, 0, 1.3, LY + 4.4, LZ, ROOF);
    },
  };

  // ================================================================================================ canyon mill
  // The mill that straddles the upper pound at each end of the arena (pos = the arena face of the mill, world x 24,
  // rotY -π/2: local +Z faces into the arena, local x = world z). The level supplies the wall up to 9 m (with the canal
  // opening up to 4.2 m); this prop builds the arch ring + tunnel vault, the storeys above, windows, the name band,
  // lucam, roof — and beyond, the canal running on through the mill into daylight toward the next lock up.
  D.lockgate_mill = {
    desc: 'ANCHOR MILLS: five-storey brick mill straddling the upper pound (pos = arena face at the canal centre, local +Z into the arena, building behind). Arch ring + tunnel vault over the canal, windows, name band, lucam, slate roof; collides above the level wall.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = o.W ?? 24, DZ = -14, EA = 17.2, br = K.brickDk;
      B.box('paint', br, W, EA - 9, -DZ, 0, (EA + 9) / 2, DZ / 2, { r: 0.05 });
      for (const sx of [-1, 1]) B.box(NS('paint'), br, W / 2 - 2.9, 9, -DZ - 2, sx * (2.9 + (W / 2 - 2.9) / 2), 4.5, (DZ - 2) / 2, { r: 0.05 });
      B.box(NS('paint'), br, 5.8, 4.8, -DZ - 2, 0, 6.6, (DZ - 2) / 2, { r: 0.05 });
      for (let y = 9.3; y < EA; y += 0.3) pbox(B, NS('paint'), shade(br, 0.85), W, 0.014, 0.01, 0, y, 0.004);
      for (const y of [4.6, 7.8, 11.0, 14.2]) B.box('paint', K.stone, W + 0.2, 0.16, 0.18, 0, y, 0.09, { r: 0.02 });
      for (const x of [-W / 2, -8.5, -5.1, 5.1, 8.5, W / 2]) B.box('paint', br, 0.46, EA, 0.14, x - Math.sign(x) * (Math.abs(x) === W / 2 ? 0.23 : 0), EA / 2, 0.07, { r: 0.02 });
      for (const y of [4.6, 7.8, 11.0, 14.2]) for (const x of [-10.2, -6.8, -3.4, 0, 3.4, 6.8, 10.2, ...(W > 26 ? [-12.6, 12.6] : [])]) {
        if (y < 5 && Math.abs(x) < 4) continue;
        if (y < 1.4 && Math.abs(x) < 9.1) continue;
        archWin(B, x, y + 0.65, 1.2, y > 14 ? 1.3 : 1.7, { lit: hash(x * 5 + y) > 0.8 ? 0.8 : 0, ns: y > 9 });
      }
      for (const x of [-10.2, -6.8, 6.8, 10.2]) archWin(B, x, 2.3, 1.2, 1.6, {});
      // cornice + roof + lucam over the canal bay + name band over the arch
      B.box('paint', K.stone, W + 0.4, 0.3, 0.34, 0, EA - 0.15, 0.1, { r: 0.04 });
      for (let x = -W / 2 + 0.1; x <= W / 2 - 0.1; x += 0.45) pbox(B, NS('paint'), br, 0.2, 0.14, 0.14, x, EA - 0.42, 0.07);
      slateRoof(B, -W / 2 - 0.2, W / 2 + 0.2, DZ - 0.1, 0.05, EA, 3.4, { wall: br, ov: 0.3 });
      chimney(B, 7, EA + 1.4, DZ / 2 - 2, 1.0, 0.8, 3.0, 2, 'paint');
      B.box('paint', K.green, 9.6, 0.9, 0.03, 0, 5.5, 0.015, { r: 0.01 });
      letters(B, 'ANCHOR MILLS', { h: 0.52, x: 0, y: 5.23, z: 0.034, c: K.cream, flat: true, wt: 0.21, track: 0.16 });
      B.box('paint', K.timber, 2.4, 3.0, 1.0, 0, 15.9, 0.5, { r: 0.04 });
      for (let y = 14.6; y < 17.3; y += 0.2) pbox(B, NS('paint'), shade(K.timber, 0.75), 2.42, 0.025, 1.02, 0, y, 0.5);
      pbox(B, NS('paint'), '#141517', 1.4, 1.9, 0.02, 0, 15.5, 1.01);
      B.push(0, 17.4, 0.5, HP); slateRoof(B, -0.7, 1.1, -1.2, 1.2, 0, 0.9, { wall: K.timber, ov: 0.15, noGutter: true }); B.pop();
      B.box('wood', K.timberLt, 0.24, 0.28, 1.8, 0, 17.1, 1.4, { r: 0.03 });
      B.tube(NS('metal'), K.ironLt, [P3(0, 17.0, 2.2), P3(0, 12.0, 2.2)], 0.016, { radial: 4 });
      B.tor(NS('metal'), K.iron, 0.1, 0.02, 0, 11.9, 2.2, { rs: 4, ts: 8, arc: PI * 1.3, rz: -0.6 });
      // canal arch: voussoir ring round the opening, front fillets in the corners, tunnel vault + side walls
      const R = 2.94, cy = 1.26, sa = Math.asin((2.3 - cy) / R);
      B.add('paint', voussoirGeo('millArch', 0, cy, R, R + 0.5, sa, PI - sa, 30, 0.06), 'white', 0, 0, 0, {});
      B.add('paint', tpl('millFill', () => { const p = [[2.76, 4.21], [-2.76, 4.21], [-2.76, 2.3]]; for (let i = 0; i <= 16; i++) { const a = PI - sa - (i / 16) * (PI - 2 * sa); p.push([Math.cos(a) * R, cy + Math.sin(a) * R]); } p.push([2.76, 2.3]); return extrudeGeo(p.map(([x, y]) => [x, y]), 0.06, 0.002); }), br, 0, 0, 0.0, { ry: -HP });
      B.add(NS('paint'), barrelGeo('millVault', -2.75, 2.75, (x) => cy + Math.sqrt(Math.max(0, R * R - x * x)), 16, 20, K.blueDk), 'white', 0, 0, -8, { ry: HP });
      for (const sx of [-1, 1]) pbox(B, NS('paint'), K.blueDk, 0.3, 4.0, 14, sx * 2.9, 0.3, -8);
      // beyond the mill: the next lock up (gates + beams in the sunlight at the tunnel's end)
      B.push(0, 1.3, -20, -HP);
      for (const side of [-1, 1]) { gateLeaf(B, side, -1.4, -0.25); }
      B.pop();
      B.col(-W / 2, 9, DZ, W / 2, EA + 3.4, 0, ROOF);
      B.col(-1.3, 14.4, 0, 1.3, 17.6, 1.0, ROOF);
    },
  };

  // ================================================================================================ the town beyond
  // Everything outside the walls for one half (placed once, mirrored): land slabs so the district reads as land, not a
  // raft in the bay; terraced houses behind the west wall (backs, yards, chimneys), ANCHOR WAREHOUSE behind the transit
  // shed, the mill chimney (a landmark from anywhere), roofs behind the wharf warehouse, the upper canal's banks.
  function terraceRow(B, x0, z0, n, o = {}) {
    // n houses along local +X from (x0, z0), rear elevation facing +Z at z0, 5 m deep behind it
    const hw = o.w ?? 4.6, eaves = o.eaves ?? 6.4, rise = o.rise ?? 2.2, D = 5.2, rend = o.render;
    for (let i = 0; i < n; i++) {
      const x = x0 + hw * (i + 0.5), c = rend && i % 3 === 1 ? K.render : mixc(K.brick, K.brickDk, hash(i * 3.3 + z0) * 0.8);
      B.box(NS('paint'), c, hw, eaves, D, x, eaves / 2, z0 - D / 2, { r: 0.03 });
      for (const y of [1.2, 3.9]) { pbox(B, NS('gloss'), K.glass, 1.0, 1.35, 0.02, x - 0.8, y + 0.68, z0 + 0.01); pbox(B, NS('paint'), K.sash, 1.12, 0.07, 0.08, x - 0.8, y - 0.02, z0 + 0.04); pbox(B, NS('paint'), K.sash, 0.05, 1.35, 0.03, x - 0.8, y + 0.68, z0 + 0.03); }
      pbox(B, NS('paint'), [K.green, K.maroon, K.blackLt, '#3d5a73'][i % 4], 0.9, 2.0, 0.04, x + 1.0, 1.0, z0 + 0.02);
      // back-yard wall + outshut
      B.box(NS('paint'), mixc(K.brick, K.brickDk, 0.5), 2.0, 3.0, 2.2, x + 0.9, 1.5, z0 + 1.1, { r: 0.03 });
      B.push(x + 0.9, 3.0, z0 + 1.1, 0, -0.35); B.box(NS('paint'), K.slate, 2.2, 0.1, 2.5, 0, 0, 0, { r: 0.02 }); B.pop();
      chimney(B, x - hw / 2, eaves + rise - 0.4, z0 - D / 2, 0.7, 0.9, 1.4, 3, NS('paint'));
      // street front (seen only from outside the arena): sashes, a door, a brick arch
      for (const y of [1.2, 3.9]) { pbox(B, NS('gloss'), K.glass, 1.0, 1.35, 0.02, x + 0.7, y + 0.68, z0 - D - 0.01); pbox(B, NS('paint'), K.sash, 1.12, 0.07, 0.08, x + 0.7, y - 0.02, z0 - D - 0.04); }
      pbox(B, NS('paint'), [K.maroon, K.green, '#3d5a73', K.blackLt][i % 4], 0.9, 2.0, 0.04, x - 1.0, 1.0, z0 - D - 0.02);
    }
    slateRoof(B, x0 - 0.1, x0 + hw * n + 0.1, z0 - D - 0.1, z0 + 0.1, eaves, rise, { ov: 0.25, ns: true, noGable: !o.gable });
  }
  D.lockgate_backdrop = {
    desc: 'The town beyond one half of the arena (placed once at the origin, mirrored): land slabs (incl. the cut SW + SE corners inside the bounds), a terrace row along the chamfered SW corner, the cooperage in the SW notch, ANCHOR WAREHOUSE in the stepped SE corner, the upper canal walls east of the mill, roofs behind the wharf warehouse, a spire, the mill chimney. No colliders, no shadows.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const land = (x0, x1, z0, z1, c = '#8f8a82') => pbox(B, NS('paint'), c, x1 - x0, 0.6, z1 - z0, (x0 + x1) / 2, -0.35, (z0 + z1) / 2);
      // (the Long Stages stretch: Alpha's base and everything behind it is LS.d further out; this half's pieces for the
      // dry dock slice are Bravo's dock arm — x > 28, z ≈ +43 — which the mirror turns into Alpha's at x < -28)
      const d = LS.d, AZ = -DOCK_Z, AW = 2.95;          // Bravo's dock arm: centre line z, half-width to its walls' faces
      land(-90, 90, -140, -46 - d);
      land(28, 90, -46 - d, 9.05); land(28, 90, 14.95, AZ - AW - 0.2); land(28, 90, AZ + AW + 0.2, 46 + d);
      land(22.6, 28, -46 - d, -17);                    // the stepped SE corner
      land(-28, -12.6, -46 - d, -36.6 - d); land(-28, -20, -36.6 - d, -29 - d);   // the notched + chamfered SW corner
      // the upper canal's walls east of the mill (the water itself is the pound prop)
      for (const s of [-1, 1]) pbox(B, NS('paint'), K.blue, 62, 1.9, 0.4, 59, -0.95, 12 + s * 2.95);
      // the dock arm running off from the dock gates (its water is the pound prop): walls, a humped footbridge over it,
      // the boathouse it runs into, a tow-rope roller on the corner
      for (const s of [-1, 1]) { pbox(B, NS('paint'), K.blue, 34, 1.9, 0.4, 45, -0.95, AZ + s * AW); pbox(B, NS('paint'), K.stone, 34, 0.08, 0.6, 45, 0.02, AZ + s * (AW + 0.1)); }
      pbox(B, NS('paint'), '#1d2622', 34, 0.3, 5.5, 45, -1.2, AZ);
      {
        const bx = 40.5;
        for (const s of [-1, 1]) B.add(NS('paint'), voussoirGeo('armBridge', 0, -2.2, 3.3, 3.75, 0.74, PI - 0.74, 16, 0.3), 'white', bx + s * 1.5 - (s > 0 ? 0.3 : 0), 0, AZ, { ry: HP });
        pbox(B, NS('paint'), '#8f8a82', 3.2, 0.35, 7.6, bx, 1.45, AZ);
        for (const s of [-1, 1]) pbox(B, NS('paint'), K.brick, 0.3, 0.9, 7.6, bx + s * 1.45, 2.05, AZ);
      }
      {
        const x0 = 50, x1 = 60, z0 = AZ - 5, z1 = AZ + 5, Hh = 5.2;
        for (const s of [-1, 1]) B.box(NS('paint'), K.timber, x1 - x0, Hh, 1.6, (x0 + x1) / 2, Hh / 2, AZ + s * 4.2, { r: 0.04 });
        B.box(NS('paint'), K.timber, x1 - x0, Hh - 3.2, 5.8, (x0 + x1) / 2, 3.2 + (Hh - 3.2) / 2, AZ, { r: 0.04 });
        B.push((x0 + x1) / 2, 0, AZ, 0); slateRoof(B, -(x1 - x0) / 2, (x1 - x0) / 2, -(z1 - z0) / 2, (z1 - z0) / 2, Hh, 2.4, { ns: true, ov: 0.3, wall: K.timber }); B.pop();
        B.push(x0, 0, AZ, -HP);
        B.box(NS('paint'), K.green, 5.2, 0.6, 0.03, 0, 4.4, 0.015, { r: 0.01 });
        letters(B, 'BOAT HOUSE', { h: 0.34, x: 0, y: 4.23, z: 0.034, c: K.cream, flat: true, wt: 0.21, track: 0.14 });
        B.pop();
      }
      // flanking the dock arm behind the boundary wall: DOCK STORES (three storeys, loading doors over the arm, a wall
      // crane) on the mid side of it, the dock smithy (its forge chimney) on the base side
      {
        const x0 = 28.4, x1 = 41, z0 = AZ - AW - 13.2, z1 = AZ - AW - 0.5, EA = 10.4;
        B.box(NS('paint'), K.brick, x1 - x0, EA, z1 - z0, (x0 + x1) / 2, EA / 2, (z0 + z1) / 2, { r: 0.05 });
        B.push(x0, 0, (z0 + z1) / 2, -HP);
        for (const y of [5.0, 7.9]) for (let x = -5.1; x <= 5.2; x += 3.4) archWin(B, x, y, 1.2, 1.6, { ns: true, lit: hash(x * 2 + y) > 0.75 ? 0.8 : 0 });
        B.box(NS('paint'), K.green, 9.6, 0.8, 0.03, 0, 9.35, 0.015, { r: 0.01 });
        letters(B, 'DOCK STORES', { h: 0.46, x: 0, y: 9.12, z: 0.034, c: K.cream, flat: true, wt: 0.21, track: 0.14 });
        B.pop();
        B.push((x0 + x1) / 2, 0, z1, 0);
        for (const [i, y] of [4.8, 7.7].entries()) takingDoor(B, -2.2, y, 1.5, 2.1, { open: i === 0, c: K.green });
        for (const y of [5.0, 7.9]) for (const x of [1.4, 4.2]) archWin(B, x, y, 1.1, 1.5, { ns: true });
        B.pop();
        B.push((x0 + x1) / 2, 0, (z0 + z1) / 2, 0);
        slateRoof(B, -(x1 - x0) / 2, (x1 - x0) / 2, -(z1 - z0) / 2, (z1 - z0) / 2, EA, 3.0, { ns: true, ov: 0.3 });
        B.pop();
        chimney(B, x1 - 2.2, EA + 1.6, z0 + 3, 0.9, 0.9, 2.2, 2, NS('paint'));
      }
      {
        const x0 = 28.4, x1 = 36.5, z0 = AZ + AW + 0.5, z1 = AZ + AW + 7.2, Hh = 4.4;
        B.box(NS('paint'), mixc(K.brick, K.brickDk, 0.5), x1 - x0, Hh, z1 - z0, (x0 + x1) / 2, Hh / 2, (z0 + z1) / 2, { r: 0.04 });
        B.push((x0 + x1) / 2, 0, (z0 + z1) / 2, HP);
        slateRoof(B, -(z1 - z0) / 2, (z1 - z0) / 2, -(x1 - x0) / 2, (x1 - x0) / 2, Hh, 2.0, { ns: true, ov: 0.25 });
        B.pop();
        B.push((x0 + x1) / 2, 0, z0, PI);
        archWin(B, -1.8, 1.4, 1.1, 1.4, { ns: true, lit: 0.9 }); archWin(B, 1.8, 1.4, 1.1, 1.4, { ns: true });
        B.box(NS('paint'), K.maroon, 3.6, 0.5, 0.03, 0, 3.55, 0.015, { r: 0.01 });
        letters(B, 'SMITHY', { h: 0.28, x: 0, y: 3.41, z: 0.034, c: K.cream, flat: true, wt: 0.21, track: 0.14 });
        B.pop();
        chimney(B, x1 - 1.4, Hh + 1.0, (z0 + z1) / 2, 1.0, 1.0, 3.4, 1, NS('paint'));
      }
      // terraces backing onto the dock arm further out, either side (their backs + yards toward the water)
      B.push(42.2, 0, AZ - AW - 0.6, 0); terraceRow(B, 0, 0, 4, { eaves: 6.2 }); B.pop();
      B.push(49.4, 0, AZ + AW + 0.6, PI); terraceRow(B, 0, 0, 2, { render: true, eaves: 6.0, gable: true }); B.pop();
      // SW: a terrace row set back along the chamfer (backs toward the arena), the cooperage in the notch
      B.push(-29.2, 0, -31.0 - d, PI / 4);                  // local +Z (the backs) faces the arena across the chamfer wall
      terraceRow(B, 0, 0, 2, { render: true, gable: true, eaves: 6.8 });
      B.pop();
      {
        const x0 = -22, x1 = -13.2, z0 = -45.2 - d, z1 = -37.2 - d, Hh = 4.2;
        B.box(NS('paint'), K.brick, x1 - x0, Hh, z1 - z0, (x0 + x1) / 2, Hh / 2, (z0 + z1) / 2, { r: 0.04 });
        B.push((x0 + x1) / 2, 0, (z0 + z1) / 2, 0);
        slateRoof(B, -(x1 - x0) / 2, (x1 - x0) / 2, -(z1 - z0) / 2, (z1 - z0) / 2, Hh, 2.2, { ns: true, ov: 0.25 });
        B.pop();
        B.push((x0 + x1) / 2, 0, z1, 0);
        for (const x of [-2.6, 2.6]) archWin(B, x, 1.3, 1.1, 1.4, { ns: true });
        B.box(NS('paint'), K.green, 4.6, 0.55, 0.03, 0, 3.5, 0.015, { r: 0.01 });
        letters(B, 'COOPERAGE', { h: 0.3, x: 0, y: 3.35, z: 0.034, c: K.cream, flat: true, wt: 0.21, track: 0.14 });
        B.pop();
        chimney(B, x0 + 1.5, Hh + 0.8, z0 + 2, 0.8, 0.8, 2.2, 2, NS('paint'));
        for (let k = 0; k < 5; k++) cask(B, -15 + k * 0.75, 0, -36.9 - d, { c: K.oak, s: 0.9 });
      }
      // SE: ANCHOR WAREHOUSE (4 storeys) filling the stepped corner, its painted end wall facing the arena
      {
        const x0 = 22.6, x1 = 38, z0 = -46, z1 = -17.2, EA = 13.5;
        B.box(NS('paint'), K.brick, x1 - x0, EA, z1 - z0, (x0 + x1) / 2, EA / 2, (z0 + z1) / 2, { r: 0.05 });
        B.push(x0, 0, (z0 + z1) / 2, -HP);
        for (const y of [5.2, 8.4, 11.2]) for (let x = -12.8; x <= 12.9; x += 3.2) archWin(B, x, y, 1.2, 1.7, { ns: true, lit: hash(x + y) > 0.8 ? 0.8 : 0 });
        B.box(NS('paint'), K.green, 18, 1.2, 0.03, 0, 6.9, 0.015, { r: 0.01 });
        letters(B, 'ANCHOR WAREHOUSE', { h: 0.72, x: 0, y: 6.54, z: 0.034, c: K.cream, flat: true, wt: 0.21, track: 0.14 });
        B.pop();
        B.push(x0 + (x1 - x0) / 2, 0, z1, 0);
        for (const y of [5.2, 8.4, 11.2]) for (let x = -6.4; x <= 6.5; x += 3.2) archWin(B, x, y, 1.2, 1.7, { ns: true, lit: hash(x * 3 + y) > 0.8 ? 0.8 : 0 });
        B.pop();
        B.push((x0 + x1) / 2, 0, (z0 + z1) / 2, HP);
        slateRoof(B, -(z1 - z0) / 2 - 0.2, (z1 - z0) / 2 + 0.2, -(x1 - x0) / 2 - 0.1, (x1 - x0) / 2 + 0.1, EA, 3.6, { ns: true, ov: 0.3 });
        B.pop();
        chimney(B, 34, EA + 1.8, -40, 1.0, 1.0, 2.6, 3, NS('paint'));
      }
      // behind the dry dock slice's east wall: the boatbuilder's saw mill + timber store (two storeys, north lights, its
      // iron chimney), a lower lean-to at the wharf end
      {
        const x0 = 22.6, x1 = 33, z0 = -46 - d, z1 = -46.4, EA = 7.2;
        B.box(NS('paint'), K.brickDk, x1 - x0, EA, z1 - z0, (x0 + x1) / 2, EA / 2, (z0 + z1) / 2, { r: 0.05 });
        B.push(x0, 0, (z0 + z1) / 2, -HP);
        for (const y of [5.0]) for (let x = -9.6; x <= 9.7; x += 3.2) archWin(B, x, y, 1.2, 1.5, { ns: true, lit: hash(x + y * 3) > 0.75 ? 0.8 : 0 });
        B.box(NS('paint'), K.maroon, 14, 0.9, 0.03, 0, 6.35, 0.015, { r: 0.01 });
        letters(B, 'PEARCE & SONS  SAW MILLS', { h: 0.5, x: 0, y: 6.1, z: 0.034, c: K.cream, flat: true, wt: 0.21, track: 0.12 });
        B.pop();
        // north-light roof: four saw-teeth along z, the glazed faces toward +Z
        for (let k = 0; k < 4; k++) {
          const za = z0 + ((z1 - z0) * k) / 4, zb = z0 + ((z1 - z0) * (k + 1)) / 4;
          B.add(NS('paint'), tpl('sawtooth' + kf(zb - za), () => extrudeGeo([[0, 0], [zb - za, 0], [zb - za, 2.2]], 1, 0.002)), K.slate, (x0 + x1) / 2, EA, za, { ry: -HP, sx: x1 - x0 });
          pbox(B, NS('gloss'), K.glassLt, x1 - x0 - 0.2, 2.0, 0.03, (x0 + x1) / 2, EA + 1.05, zb - 0.02);
        }
        B.lathe(NS('metal'), '#2c3036', [[0.5, 0], [0.4, 0.4], [0.32, 18], [0.42, 18.4], [0, 18.5]], 30, 0, z0 + 6, { seg: 10 });
      }
      // roofs and gables behind the wharf warehouse, a church spire far off
      B.push(-30, 0, -64 - d, 0); terraceRow(B, 0, 0, 13, { eaves: 8, rise: 2.6 }); B.pop();
      B.box(NS('paint'), K.stone, 5, 22, 5, 22, 11, -92 - d, { r: 0.05 });
      B.lathe(NS('paint'), K.slateDk, [[3.2, 0], [0.2, 16], [0, 16.4]], 22, 22, -92 - d, { seg: 8 });
      // the mill chimney beyond the west mill: octagonal brick shaft on a plinth, oversailing cap, iron bands
      const CX = -40, CZ = -2;
      B.box(NS('paint'), K.brickDk, 3.4, 5, 3.4, CX, 2.5, CZ, { r: 0.05 });
      B.lathe('paint', K.brick, [[1.45, 5], [1.1, 30], [1.35, 30.6], [1.4, 31.6], [1.15, 32], [0, 32]], CX, 0, CZ, { seg: 8 });
      for (const y of [9, 14, 19, 24, 28]) B.lathe(NS('paint'), K.iron, [[1.45 - (y - 5) * 0.014 + 0.02, y], [1.45 - (y - 5) * 0.014 + 0.02, y + 0.14]], CX, 0, CZ, { seg: 8 });
    },
  };

  // ================================================================================================ small buildings
  // face helper for block dressings: side 0 +Z, 1 +X, 2 -Z, 3 -X → frame on that face (x along the face, z out)
  function onFace(B, W, Dd, side, fn) {
    const ry = [0, HP, PI, -HP][side], off = side % 2 === 0 ? Dd / 2 : W / 2;
    B.push(Math.sin(ry) * off, 0, Math.cos(ry) * off, ry); fn(side % 2 === 0 ? W : Dd); B.pop();
  }
  // painted timber sash window (opening w × h, sill at y): white frame, 2-over-2 bars, stone sill + lintel
  function sashWin(B, x, y, w, h, o = {}) {
    const fr = o.frame ?? K.sash;
    pbox(B, NS('gloss'), K.glass, w, h, 0.02, x, y + h / 2, 0.01);
    if (o.lit) pbox(B, NS('glow'), '#ffd49a', w * 0.8, h * 0.4, 0.004, x, y + h * 0.7, 0.022, { glow: o.lit });
    pbox(B, 'paint', fr, w + 0.1, 0.06, 0.06, x, y + h + 0.03, 0.03); pbox(B, 'paint', fr, w + 0.1, 0.06, 0.06, x, y - 0.0, 0.03);
    for (const sx of [-1, 1]) pbox(B, 'paint', fr, 0.06, h, 0.06, x + sx * (w / 2 + 0.02), y + h / 2, 0.03);
    pbox(B, NS('paint'), fr, w, 0.05, 0.05, x, y + h / 2, 0.035);
    pbox(B, NS('paint'), fr, 0.03, h, 0.035, x, y + h / 2, 0.03);
    B.box('paint', o.sill ?? K.stone, w + 0.26, 0.08, 0.12, x, y - 0.05, 0.06, { r: 0.015 });
    if (o.lintel !== false) B.box('paint', o.sill ?? K.stone, w + 0.3, 0.16, 0.04, x, y + h + 0.13, 0.02, { r: 0.01 });
    if (o.box) {         // window box with flowers
      B.box('wood', o.box, w + 0.1, 0.18, 0.2, x, y - 0.18, 0.12, { r: 0.02 });
      for (let k = 0; k < 5; k++) B.sph('foliage', ['#c94f5c', '#e8b64a', '#f2eee6', '#b563a8', '#5ba257'][(k + Math.round(x * 3)) % 5], 0.07, x - w / 2 + 0.1 + (k * (w - 0.1)) / 4, y - 0.05, 0.12, { ws: 6, hs: 4 });
    }
  }
  function plankDoor(B, x, y, w, h, c, o = {}) {
    pbox(B, NS('paint'), '#141517', w + 0.04, h + 0.04, 0.012, x, y + h / 2, 0.006);
    B.box('wood', c, w, h, 0.06, x, y + h / 2, 0.03, { r: 0.01 });
    for (let k = -w / 2 + 0.12; k < w / 2 - 0.05; k += 0.14) pbox(B, NS('paint'), shade(c, 0.78), 0.012, h - 0.04, 0.012, x + k, y + h / 2, 0.062);
    if (o.dutch) pbox(B, NS('paint'), shade(c, 0.7), w, 0.05, 0.02, x, y + h * 0.5, 0.066);
    B.sph(NS('metal'), K.gold, 0.03, x + w / 2 - 0.1, y + 1.0, 0.075, { ws: 6, hs: 4 });
    if (o.frame) { pbox(B, 'paint', o.frame, w + 0.16, 0.08, 0.06, x, y + h + 0.04, 0.03); for (const sx of [-1, 1]) pbox(B, 'paint', o.frame, 0.08, h, 0.06, x + sx * (w / 2 + 0.04), y + h / 2, 0.03); }
    if (o.fan) { B.add('paint', tpl('fan', () => latheGeo([[0, 0], [0.45, 0], [0, 0.001]], 10)), o.frame ?? K.sash, x, y + h + 0.08, 0.02, { rx: -HP, sy: 1, s: 1 }); pbox(B, NS('gloss'), K.glassLt, w * 0.8, 0.2, 0.02, x, y + h + 0.2, 0.02); }
  }
  // stone steps up to a door (along +Z from the wall)
  function doorStep(B, x, w, n = 1) { for (let i = 0; i < n; i++) B.box('paint', K.stone, w + 0.3 - i * 0.1, 0.16, 0.36 + (n - 1 - i) * 0.3, x, 0.08 + i * 0.16, 0.18 + (n - 1 - i) * 0.15, { r: 0.02 }); }

  // ---- lock-keeper's cottage (pos = centre of the 6.5 x 6.5 x 5.2 block base; front door +Z toward the lock)
  D.lockgate_cottage = {
    desc: "Lock-keeper's cottage dressing around a 6.5 x 6.5 x 5.2 rendered block: slate roof + gable chimneys (roof collides), gabled timber porch over the front door (+Z), sash windows with window boxes, lamp, LOCK HOUSE plaque, back door + water butt, the flat-roofed wash-house outshut on +X (walkable roof: coping + chimney pot).",
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = 6.5, Dd = 6.5, Hh = 5.2;
      for (let side = 0; side < 4; side++) onFace(B, W, Dd, side, (L) => {
        B.box('paint', mixc(K.render, K.stoneDk, 0.55), L + 0.04, 0.35, 0.05, 0, 0.175, 0.025, { r: 0.012 });
        B.box('paint', K.sash, L + 0.1, 0.18, 0.08, 0, Hh - 0.09, 0.04, { r: 0.02 });
      });
      onFace(B, W, Dd, 0, () => {
        plankDoor(B, 0, 0, 0.95, 2.1, K.green, { frame: K.sash, fan: true });
        doorStep(B, 0, 1.0, 1);
        for (const x of [-1.95, 1.95]) sashWin(B, x, 0.95, 1.0, 1.35, { box: K.green, lit: x < 0 ? 0.7 : 0 });
        for (const x of [-1.95, 0, 1.95]) sashWin(B, x, 3.3, 0.9, 1.2, {});
        // porch: two posts, bracketed gable canopy with slates
        for (const sx of [-1, 1]) { B.box('wood', K.sash, 0.12, 2.3, 0.12, sx * 0.72, 1.15, 0.95, { r: 0.02 }); seg(B, NS('wood'), K.sash, [sx * 0.72, 1.9, 0.9], [sx * 0.72, 2.3, 0.2], 0.06, 0.06); }
        B.push(0, 2.32, 0.55, HP); slateRoof(B, -0.62, 0.62, -0.95, 0.95, 0, 0.6, { wall: K.sash, ov: 0.12, noGutter: true, course: 0.2 }); B.pop();
        B.push(0.0, 2.55, 0.02); lantern(B, 1.05, -0.3, 0.2, 0.7); B.pop();
        B.push(-1.1, 2.3, 0); boardSign(B, 'LOCK HOUSE', 0, 0, { h: 0.1, board: K.cream, c: K.green, bd: 0.02, pad: 0.06 }); B.pop();
      });
      B.col(-0.85, 0, Dd / 2, 0.85, 0.2, Dd / 2 + 1.1);
      B.col(-0.85, 2.2, Dd / 2, 0.85, 3.1, Dd / 2 + 1.15, ROOF);
      for (const sx of [-1, 1]) B.col(sx * 0.72 - 0.08, 0, Dd / 2 + 0.87, sx * 0.72 + 0.08, 2.3, Dd / 2 + 1.03, ROOF);
      onFace(B, W, Dd, 2, () => {
        plankDoor(B, 1.6, 0, 0.9, 2.0, K.maroon, { dutch: true, frame: K.sash });
        sashWin(B, -1.4, 0.95, 1.0, 1.3, {});
        for (const x of [-1.6, 1.6]) sashWin(B, x, 3.3, 0.9, 1.2, { lit: x > 0 ? 0.6 : 0 });
        downpipe(B, -2.95, 0, Hh);
      });
      onFace(B, W, Dd, 3, () => { sashWin(B, 0, 3.5, 0.7, 0.9, {}); });
      onFace(B, W, Dd, 1, () => { sashWin(B, 0.3, 3.4, 0.9, 1.1, {}); downpipe(B, 2.95, 2.6, Hh); });
      // roof + chimneys (collide), the outshut on +X (x 3.25 … 5.25, z -2.75 … 1.75): door, window, coping, pot
      slateRoof(B, -W / 2, W / 2, -Dd / 2, Dd / 2, Hh, 2.3, { wall: K.render, ov: 0.35 });
      for (const sx of [-1, 1]) chimney(B, sx * 2.95, Hh + 1.2, 0, 0.6, 0.9, 1.9, 2);
      B.col(-W / 2 - 0.35, Hh, -Dd / 2 - 0.4, W / 2 + 0.35, Hh + 2.4, Dd / 2 + 0.4, ROOF);
      B.push(4.25, 0, 1.75);
      plankDoor(B, 0.2, 0, 0.8, 1.95, K.green, {});
      B.pop();
      B.push(5.25, 0, -0.5, HP); sashWin(B, 0, 1.0, 0.8, 0.9, {}); B.pop();
      for (const [x0, z0, x1, z1] of [[3.25, 1.75, 5.25, 1.75], [5.25, -2.75, 5.25, 1.75], [3.25, -2.75, 5.25, -2.75]]) {
        const L = Math.hypot(x1 - x0, z1 - z0);
        B.box('paint', K.stone, x1 === x0 ? 0.3 : L + 0.1, 0.1, x1 === x0 ? L + 0.1 : 0.3, (x0 + x1) / 2, 2.65, (z0 + z1) / 2, { r: 0.02 });
      }
      B.lathe('paint', '#a45a3c', [[0.13, 0], [0.11, 0.42], [0.14, 0.46], [0.11, 0.48], [0, 0.48]], 4.9, 2.6, -2.4, { seg: 7 });
      colC(B, 4.9, 2.6, -2.4, 0.3, 0.5, 0.3, ROOF);
    },
  };

  // ---- canal company office (pos = centre of the 6.5 x 8 block, roof terrace at 2.6 with parapets N + E in the level)
  D.lockgate_office = {
    desc: 'LOCKGATE CANAL Co. office dressing around a 6.5 x 8 x 2.45 block: sash windows, panelled door with fanlight + steps (+X), name board on the canal face, bracket clock at the NE corner, roof terrace kit (chimney stack collides, flag staff), rails for the iron stair up the south face. depth: the block\'s depth (8; Tower Command: 7, pos 0.5 m further back).',
    params: { depth: 'm (8)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = 6.5, Dd = o.depth ?? 8, Hh = 2.6;
      // roof kit spots (chimney near the back, flag staff by the canal-side parapet) keep their distance from the ends
      const zChim = o.depth ? -Dd / 2 + 1.6 : -2.4, zFlag = o.depth ? Dd / 2 - 0.7 : 3.3;
      for (let side = 0; side < 4; side++) onFace(B, W, Dd, side, (L) => {
        B.box('paint', K.stone, L + 0.06, 0.12, 0.08, 0, Hh - 0.06, 0.04, { r: 0.02 });
        B.box('paint', K.blue, L + 0.02, 0.4, 0.04, 0, 0.2, 0.02, { r: 0.01 });
      });
      onFace(B, W, Dd, 0, () => {
        for (const x of [-2.1, 0, 2.1]) sashWin(B, x, 0.8, 1.0, 1.3, { lit: x === 0 ? 0.7 : 0 });
        B.box('paint', K.green, 5.6, 0.42, 0.04, 0, 3.22, -0.13, { r: 0.01 });
      });
      // name board on the canal-side parapet (level parapet face at z = Dd/2 + 0.3 → board just proud of it)
      B.push(0, 2.83, Dd / 2 + 0.01);
      boardSign(B, 'LOCKGATE CANAL CO', 0, 0, { h: 0.2, board: K.green, c: K.cream, border: K.cream, bd: 0.03, w: 5.6 });
      B.pop();
      onFace(B, W, Dd, 1, () => {
        plankDoor(B, -1.2, 0.32, 0.95, 2.0, K.green, { frame: K.sash, fan: true });
        doorStep(B, -1.2, 1.0, 2);
        sashWin(B, 1.6, 0.8, 1.0, 1.3, {});
      });
      onFace(B, W, Dd, 2, () => { for (const x of [-0.2, 2.0]) sashWin(B, x, 0.8, 1.0, 1.3, {}); });
      onFace(B, W, Dd, 3, () => { for (const x of [-2.2, 0.4, 2.6]) sashWin(B, x, 0.8, 1.0, 1.3, {}); });
      // bracket clock at the NE corner (double-sided dial, lit at dusk)
      B.push(W / 2 + 0.05, 1.95, Dd / 2 - 0.4, 0);
      seg(B, 'metal', K.iron, [0, 0, 0], [0.55, 0.05, 0], 0.06, 0.08);
      B.cyl('gloss', K.black, 0.34, 0.16, 0.8, 0.0, 0, { rx: HP, seg: 18 });
      for (const f of [1, -1]) {
        B.cyl(NS('glow'), '#fff3d6', 0.28, 0.01, 0.8, 0, f * 0.085, { rx: HP, seg: 18, glow: 0.7 });
        pbox(B, NS('paint'), K.black, 0.03, 0.2, 0.01, 0.8 + 0.05, 0.07, f * 0.092, { rz: -0.5 });
        pbox(B, NS('paint'), K.black, 0.025, 0.25, 0.01, 0.8 - 0.07, -0.07, f * 0.094, { rz: 2.3 });
      }
      B.sph('metal', K.gold, 0.06, 0.8, 0.4, 0, { ws: 6, hs: 4 });
      B.pop();
      // roof kit: chimney stack (collides), flag staff with the company pennant, skylight
      chimney(B, -2.6, Hh, zChim, 0.9, 1.2, 1.9, 3);
      colC(B, -2.6, Hh, zChim, 1.1, 2.2, 1.4, ROOF);
      B.lathe('metal', K.white, [[0.06, 0], [0.04, 0.2], [0.035, 4.2], [0, 4.25]], -2.7, Hh, zFlag, { seg: 6 });
      B.flag(-2.7, Hh + 4.0, zFlag, { color: K.maroon, rz: HP, s: 1.6 });
      colC(B, -2.7, Hh, zFlag, 0.2, 4.2, 0.2, ROOF);
      B.box('paint', K.iron, 1.3, 0.3, 1.0, 0.8, Hh + 0.15, -1.8, { r: 0.04 });
      B.push(0.8, Hh + 0.32, -1.8, 0, 0.35); pbox(B, NS('gloss'), K.glassLt, 1.2, 0.03, 0.9, 0, 0, 0); B.pop();
      colC(B, 0.8, Hh, -1.8, 1.3, 0.45, 1.0);
      // iron stair rails (the level ramp x -3.25 … -1.25, climbing along +Z to the south edge of the roof)
      const run = 6, rise = 2.6, z0 = -Dd / 2 - run;
      for (const sx of [-3.28, -1.22]) {
        for (let i = 0; i <= 4; i++) { const t = i / 4, z = z0 + t * run, y = rise * t; B.cyl('metal', K.iron, 0.022, 1.0, sx, y + 0.5, z, { seg: 5 }); }
        B.tube('metal', K.iron, [P3(sx, 1.0, z0), P3(sx, rise + 1.0, z0 + run), P3(sx, rise + 1.0, z0 + run + 0.4)], 0.028, { radial: 6 });
        B.tube(NS('metal'), K.iron, [P3(sx, 0.5, z0), P3(sx, rise + 0.5, z0 + run)], 0.016, { radial: 4 });
        for (let k = 0; k < 5; k++) { const t0 = k / 5, t1 = (k + 1) / 5; B.col(sx - 0.05, rise * t0, z0 + run * t0, sx + 0.05, rise * t1 + 1.02, z0 + run * t1, RAIL); }
      }
    },
  };

  // ---- stables with a hay loft (pos = centre of the 7 x 8 x 3.6 block; stable doors + loft door face +Z, the wharf)
  D.lockgate_stables = {
    desc: 'Canal horse stables with a hay loft around a 7 x 8 x 3.6 brick block: Dutch stable doors, loft gablet with a hay door + hoist beam, louvred ridge vent, slate roof (collides), tack hooks, a horse trough and a hay rack on the wharf side. flat: the Tower Command version — a flat leaded loft deck in play (the level carries it), the horse ramp up the -Z side (no windows there), the loft hatch and cover on the roof (louvred vent, chimney stack + cast-iron water tank on the +Z edge, hay bales by the ramp; all collide, slide-off tops).',
    params: { flat: 'bool' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = 7, Dd = 8, Hh = 3.6;
      for (let side = 0; side < 4; side++) onFace(B, W, Dd, side, (L) => {
        B.box('paint', K.blue, L + 0.02, 0.45, 0.04, 0, 0.225, 0.02, { r: 0.01 });
        B.box('paint', K.stone, L + 0.08, 0.14, 0.08, 0, Hh - 0.07, 0.04, { r: 0.02 });
      });
      onFace(B, W, Dd, 0, () => {
        for (const x of [-2.2, 0, 2.2]) plankDoor(B, x, 0, 1.2, 2.2, x === 0 ? K.maroon : K.green, { dutch: true, frame: K.stone });
        for (const x of [-1.1, 1.1]) { archWin(B, x, 1.3, 0.6, 0.7, { bars: 2 }); }
        for (const x of [-3.0, 3.0]) { B.tor(NS('metal'), K.iron, 0.07, 0.014, x, 1.4, 0.05, { rs: 4, ts: 8 }); }
      });
      if (o.flat) {
        // the loft deck: lead rolls across the roof (flush), the hay hatch by the ramp's landing, a louvred vent box at the
        // far end (colliding cover, slide-off top); the ramp side keeps one high window above the ramp's low end
        onFace(B, W, Dd, 3, () => { plankDoor(B, 0, 0, 1.4, 2.4, K.green, { frame: K.stone }); });
        onFace(B, W, Dd, 2, () => archWin(B, -2.4, 2.35, 0.6, 0.7, { bars: 2 }));
        for (let x = -W / 2 + 1.2; x < W / 2 - 0.5; x += 1.2) pbox(B, NS('paint'), shade(K.slate, 0.8), 0.05, 0.012, Dd - 0.1, x, Hh + 0.006, 0);
        B.box('wood', K.timber, 1.3, 0.05, 1.0, -W / 2 + 1.0, Hh + 0.02, -Dd / 2 + 1.0, { r: 0.01 });
        for (const dx of [-0.3, 0.3]) pbox(B, NS('metal'), K.iron, 0.08, 0.02, 0.9, -W / 2 + 1.0 + dx, Hh + 0.05, -Dd / 2 + 1.0);
        B.cyl(NS('metal'), K.iron, 0.06, 0.03, -W / 2 + 1.0, Hh + 0.05, -Dd / 2 + 1.45, { rx: HP, seg: 8 });
        const vx = 2.0, vz = -1.6;
        B.box('paint', K.sash, 1.2, 0.85, 0.9, vx, Hh + 0.425, vz, { r: 0.03 });
        for (let k = 0; k < 4; k++) pbox(B, NS('paint'), K.slateDk, 1.22, 0.04, 0.92, vx, Hh + 0.2 + k * 0.15, vz);
        B.push(vx, Hh + 0.85, vz, HP); slateRoof(B, -0.55, 0.55, -0.7, 0.7, 0, 0.3, { ov: 0.1, noGutter: true, noGable: true, course: 0.2 }); B.pop();
        colC(B, vx, Hh, vz, 1.3, 1.15, 1.0, ROOF);
        // more cover on the deck (the user's round-2 note), all straight-edged, colliding (never inked, slide-off tops) and
        // clear of the lane from the ramp's top (-X, x < -0.6) straight across to the street edge: along the street edge
        // (+Z, over the tower's street and the first checkpoint) the tack room's chimney stack at the +X corner and a
        // cast-iron water tank with a gap between them to shoot through; a stack of hay bales by the ramp's top (-Z)
        brickBox(B, K.brick, 0.8, 2.0, 1.2, 3.1, Hh + 1.0, 3.4, { faces: ['x', 'z'], step: 0.25 });
        pbox(B, NS('paint'), '#7a7d82', 0.86, 0.08, 1.26, 3.1, Hh + 0.04, 3.4);                         // lead flashing
        B.box('paint', K.brickDk, 0.92, 0.12, 1.32, 3.1, Hh + 1.8, 3.4, { r: 0.02 });
        B.box('paint', K.brickDk, 0.96, 0.1, 1.36, 3.1, Hh + 1.95, 3.4, { r: 0.02 });
        for (const dz of [-0.3, 0.3]) B.lathe('paint', '#a45a3c', [[0.13, 0], [0.11, 0.3], [0.13, 0.34], [0.1, 0.36], [0, 0.36]], 3.1, Hh + 2.0, 3.4 + dz, { seg: 7 });
        colC(B, 3.1, Hh, 3.4, 0.8, 2.0, 1.2, ROOF);
        const tx = 0.7, tz = 3.4;
        for (const dx of [-0.55, 0.55]) B.box('wood', K.timber, 0.22, 0.28, 1.2, tx + dx, Hh + 0.14, tz, { r: 0.02 });
        B.box('paint', K.iron, 1.6, 1.12, 1.2, tx, Hh + 0.84, tz, { r: 0.03 });
        for (const k of [-0.4, 0, 0.4]) pbox(B, NS('metal'), K.ironLt, 0.05, 1.12, 1.24, tx + k, Hh + 0.84, tz);       // panel flanges
        for (const k of [-0.3, 0.3]) pbox(B, NS('metal'), K.ironLt, 1.64, 1.12, 0.05, tx, Hh + 0.84, tz + k);
        pbox(B, NS('metal'), K.ironLt, 1.64, 0.05, 1.24, tx, Hh + 0.84, tz);
        pbox(B, 'metal', K.ironLt, 1.68, 0.07, 1.28, tx, Hh + 1.41, tz);                                          // top lip
        B.cyl('metal', K.iron, 0.05, 0.9, tx - 0.95, Hh + 0.95, tz - 0.3, { seg: 6 });                              // feed pipe
        B.cyl('metal', K.iron, 0.05, 0.3, tx - 0.82, Hh + 1.4, tz - 0.3, { rz: HP, seg: 6 });
        colC(B, tx, Hh, tz, 1.6, 1.45, 1.2, ROOF);
        // hay bales: two along Z under two across (straight-edged, twine bands)
        const hx = 0, hz = -3.45, straw = ['#c9a857', '#bf9c4c', '#d2b163', '#c4a255'];
        const bale = (x, y, z, alongX, k) => {
          const w = alongX ? 1.18 : 0.58, d = alongX ? 0.54 : 1.08;
          B.box('paint', straw[k], w, 0.44, d, x, y + 0.22, z, { r: 0.04 });
          for (const f of [-0.27, 0.27]) {
            if (alongX) pbox(B, NS('paint'), '#6b5a3a', 0.03, 0.448, d + 0.012, x + f * w, y + 0.22, z);
            else pbox(B, NS('paint'), '#6b5a3a', w + 0.012, 0.448, 0.03, x, y + 0.22, z + f * d);
          }
        };
        for (const [dx, k] of [[-0.3, 0], [0.3, 1]]) bale(hx + dx, Hh, hz, false, k);
        for (const [dz, k] of [[-0.28, 2], [0.28, 3]]) bale(hx, Hh + 0.46, hz + dz, true, k);
        colC(B, hx, Hh, hz, 1.2, 0.92, 1.1, ROOF);
        return;
      }
      onFace(B, W, Dd, 2, () => { for (const x of [-2, 0, 2]) archWin(B, x, 1.5, 0.7, 0.8, { bars: 2 }); });
      onFace(B, W, Dd, 3, () => { plankDoor(B, 0, 0, 1.4, 2.4, K.green, { frame: K.stone }); });
      slateRoof(B, -W / 2, W / 2, -Dd / 2, Dd / 2, Hh, 2.2, { ov: 0.3 });
      // loft gablet on the +Z slope with the hay door and a hoist beam; louvred vent on the ridge
      B.push(0, Hh - 0.1, Dd / 2 - 0.1);
      B.box('paint', K.brick, 1.8, 1.9, 1.2, 0, 0.95, -0.4, { r: 0.03 });
      plankDoor(B, 0, 0.25, 1.1, 1.3, K.green, {});
      B.push(0, 1.9, -0.4, HP); slateRoof(B, -0.7, 0.7, -1.05, 1.05, 0, 0.7, { wall: K.brick, ov: 0.12, noGutter: true, course: 0.25 }); B.pop();
      B.box('wood', K.timberLt, 0.2, 0.22, 1.2, 0, 2.0, 0.35, { r: 0.03 });
      B.cyl('metal', K.iron, 0.08, 0.06, 0, 1.87, 0.85, { rz: HP, seg: 8 });
      B.pop();
      B.box('paint', K.sash, 1.0, 0.7, 0.8, 0, Hh + 2.4, 0, { r: 0.03 });
      for (let k = 0; k < 4; k++) pbox(B, NS('paint'), K.slateDk, 1.02, 0.04, 0.82, 0, Hh + 2.15 + k * 0.14, 0);
      B.push(0, Hh + 2.8, 0, HP); slateRoof(B, -0.5, 0.5, -0.6, 0.6, 0, 0.35, { ov: 0.1, noGutter: true, noGable: true, course: 0.2 }); B.pop();
      B.col(-W / 2 - 0.3, Hh, -Dd / 2 - 0.3, W / 2 + 0.3, Hh + 2.4, Dd / 2 + 0.6, ROOF);
    },
  };

  // ---- transit shed (pos = centre of the 10 x 15 x 4.8 block; loading bank side = -X at 1.3 m)
  D.lockgate_shed = {
    desc: 'Canal carriers\' transit shed around a 10 x 15 x 4.8 brick block: three sliding goods doors on the loading-bank side (-X, bank at 1.3 m) under a boarded canopy on iron brackets (collides), painted band, cart door + windows on the yard end, slate roof with a hoist gablet and ridge louvres (collides).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = 10, Dd = 15, Hh = 4.8, bank = 1.3;
      for (let side = 0; side < 4; side++) onFace(B, W, Dd, side, (L) => {
        B.box('paint', K.stone, L + 0.08, 0.16, 0.1, 0, Hh - 0.08, 0.05, { r: 0.02 });
        for (let x = -L / 2 + 0.2; x < L / 2 - 0.1; x += 0.45) pbox(B, NS('paint'), K.brick, 0.2, 0.12, 0.1, x, Hh - 0.24, 0.05);
      });
      onFace(B, W, Dd, 3, (L) => {
        B.push(0, bank, 0);
        for (const x of [-5, 0, 5]) {
          pbox(B, NS('paint'), '#141517', 2.6, 2.6, 0.012, x, 1.3, 0.006);
          B.box('wood', K.green, 2.9, 2.7, 0.08, x + (x === 0 ? 1.2 : 0), 1.35, 0.1, { r: 0.015 });
          for (let k = -1.3; k <= 1.31; k += 0.29) pbox(B, NS('paint'), shade(K.green, 0.78), 0.015, 2.64, 0.015, x + (x === 0 ? 1.2 : 0) + k, 1.35, 0.145);
          pbox(B, 'metal', K.iron, 3.2, 0.08, 0.08, x + 0.6, 2.8, 0.1);
          B.box('paint', K.stone, 3.0, 0.24, 0.1, x, 2.72, 0.05, { r: 0.015 });
        }
        B.pop();
        // canopy over the bank: boarded, on scrolled brackets
        const cy = 4.45, cd = 3.1;
        B.push(0, cy, cd / 2, 0, -0.1);
        B.box('wood', K.timberLt, L + 0.3, 0.12, cd, 0, 0, 0, { r: 0.02 });
        for (let x = -L / 2; x <= L / 2; x += 0.35) pbox(B, NS('wood'), shade(K.timberLt, 0.8), 0.03, 0.02, cd, x, -0.07, 0);
        B.pop();
        B.box('wood', K.green, L + 0.3, 0.24, 0.08, 0, cy - 0.28, cd, { r: 0.02 });
        for (let x = -L / 2 + 0.5; x <= L / 2; x += 3.5) {
          B.box('metal', K.green, 0.1, 1.1, 0.1, x, cy - 0.7, 0.06, { r: 0.02 });
          B.tube('metal', K.green, [P3(x, cy - 1.25, 0.08), P3(x, cy - 0.7, 1.0), P3(x, cy - 0.25, cd - 0.2)], 0.04, { radial: 5 });
        }
        for (const x of [-2.5, 2.5]) { cyl(B, 'metal', K.iron, 0.012, 0.3, x, cy - 0.35, cd - 0.3, { seg: 4 }); lantern(B, x, cy - 1.2, cd - 0.3, 0.75); }
      });
      B.col(-W / 2 - 3.2, 4.3, -Dd / 2, -W / 2, 4.75, Dd / 2, ROOF);
      onFace(B, W, Dd, 2, () => {
        pbox(B, NS('paint'), '#141517', 3.0, 3.4, 0.012, 1.5, 1.7, 0.006);
        for (const sx of [-1, 1]) B.box('wood', K.green, 1.46, 3.3, 0.07, 1.5 + sx * 0.76, 1.65, 0.04, { r: 0.012 });
        B.box('paint', K.stone, 3.4, 0.28, 0.1, 1.5, 3.5, 0.05, { r: 0.02 });
        archWin(B, -2.8, 1.4, 1.1, 1.5, {});
      });
      onFace(B, W, Dd, 0, () => { for (const x of [-2.5, 1.0]) archWin(B, x, 2.2, 1.1, 1.4, {}); plankDoor(B, 3.4, 1.3, 0.9, 2.0, K.green, { frame: K.stone }); });
      B.push(0, 0, 0, HP);
      slateRoof(B, -Dd / 2, Dd / 2, -W / 2, W / 2, Hh, 2.4, { ov: 0.3 });
      B.pop();
      for (let z = -5; z <= 5; z += 5) { B.box('paint', K.slateDk, 0.7, 0.45, 1.4, 0, Hh + 2.55, z, { r: 0.04 }); B.push(0, Hh + 2.8, z, HP); slateRoof(B, -0.75, 0.75, -0.45, 0.45, 0, 0.25, { ov: 0.08, noGutter: true, noGable: true, course: 0.2 }); B.pop(); }
      B.col(-W / 2 - 0.3, Hh, -Dd / 2 - 0.3, W / 2 + 0.3, Hh + 2.5, Dd / 2 + 0.3, ROOF);
    },
  };

  // ================================================================================================ narrowboats
  // Dressing for a narrowboat whose hull (gunwale at -0.7) and cabin / hold (top 0.25, walkable) are level blocks.
  // pos = hull block centre at gunwale height; bow toward local -X. kind 'cabin' (painted cabin, windows, roof kit,
  // livery on the level face = mural) or 'working' (cloth-covered hold on the level block: strings, top plank, stern
  // back-cabin, cratch at the fore end). L = hull block length (the blocks' ends), W = beam, cab = cabin half length.
  function bowGeo(len, hw, key) {
    return tpl('bow|' + key, () => {
      const g = new GB(), n = 10, cBlk = cx3('#1f2226'), cTop = cx3('#8d2f2a'), cDeck = cx3(K.oak);
      const sec = (t) => { const w = hw * Math.pow(Math.max(0, Math.cos(t * HP)), 0.72); return { x: -t * len, w, y0: -1.9 + 0.5 * t * t, y1: 0.04 + 0.38 * t * t }; };
      const S = []; for (let i = 0; i <= n; i++) S.push(sec(i / n));
      for (const side of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          const a = S[i], b = S[i + 1], dx = b.x - a.x, dw = (b.w - a.w) * side, l = Math.hypot(dx, dw) || 1, nx = -dw / l, nz = dx / l * side;
          const nn = [nx * -side * 0 + (dw / l) * -1 * 0 + nx, 0, nz];
          const q = (p, y, c) => g.v(p.x, y, side * p.w, (b.w - a.w) / l, 0, side * Math.abs(dx) / l, ...c);
          // hull black up to the top-bend strake, a red-oxide top band
          const yb = (p) => p.y1 - 0.14;
          g.quad(q(a, a.y0, cBlk), q(b, b.y0, cBlk), q(b, yb(b), cBlk), q(a, yb(a), cBlk));
          g.quad(q(a, yb(a), cTop), q(b, yb(b), cTop), q(b, b.y1, cTop), q(a, a.y1, cTop));
          void nn;
        }
      }
      // fore deck (well deck, a little below the gunwale) + the cant top edge
      for (let i = 0; i < n; i++) {
        const a = S[i], b = S[i + 1], y = -0.12;
        const v = [g.v(a.x, y + a.y1 * 0.2, -a.w + 0.06, 0, 1, 0, ...cDeck), g.v(b.x, y + b.y1 * 0.2, -Math.max(0, b.w - 0.06), 0, 1, 0, ...cDeck), g.v(b.x, y + b.y1 * 0.2, Math.max(0, b.w - 0.06), 0, 1, 0, ...cDeck), g.v(a.x, y + a.y1 * 0.2, a.w - 0.06, 0, 1, 0, ...cDeck)];
        g.quad(v[0], v[1], v[2], v[3]);
      }
      return g.geo();
    });
  }
  function sternGeo(len, hw, key) {
    return tpl('stern|' + key, () => {
      const g = new GB(), n = 8, cBlk = cx3('#1f2226'), cTop = cx3('#8d2f2a'), cDeck = cx3('#3a3d42');
      const S = [];
      for (let i = 0; i <= n; i++) { const t = i / n, a = t * HP; S.push({ x: len * 0.35 + Math.sin(a) * len * 0.65, w: hw * Math.cos(a) * 0.96 + (t < 0.01 ? 0.04 * hw : 0), y0: -1.6 + 1.1 * t, y1: 0.0 + 0.06 * t }); }
      S.unshift({ x: 0, w: hw, y0: -1.9, y1: 0 });
      for (const side of [-1, 1]) for (let i = 0; i < S.length - 1; i++) {
        const a = S[i], b = S[i + 1], dx = b.x - a.x, dw = b.w - a.w, l = Math.hypot(dx, dw) || 1;
        const q = (p, y, c) => g.v(p.x, y, side * p.w, -dw / l * 0 + (dw < 0 ? -dw / l : 0) + (dx / l) * 0 + (i === 0 ? 0 : 0.7), 0, side * (dx / l), ...c);
        const yb = (p) => p.y1 - 0.14;
        g.quad(q(a, a.y0, cBlk), q(b, b.y0, cBlk), q(b, yb(b), cBlk), q(a, yb(a), cBlk));
        g.quad(q(a, yb(a), cTop), q(b, yb(b), cTop), q(b, b.y1, cTop), q(a, a.y1, cTop));
      }
      const c0 = g.v(len * 0.3, 0.02, 0, 0, 1, 0, ...cDeck), ring = S.map((p) => g.v(p.x, p.y1 + 0.02, p.w, 0, 1, 0, ...cDeck)), ring2 = S.map((p) => g.v(p.x, p.y1 + 0.02, -p.w, 0, 1, 0, ...cDeck));
      for (let i = 0; i < S.length - 1; i++) { g.tri(c0, ring[i], ring[i + 1]); g.tri(c0, ring2[i], ring2[i + 1]); }
      return g.geo();
    });
  }
  function waterCan(B, x, y, z, s = 1) {
    B.push(x, y, z, 0, 0, 0, s);
    B.lathe('gloss', K.green, [[0, 0], [0.15, 0], [0.16, 0.02], [0.15, 0.3], [0.12, 0.34], [0.06, 0.36], [0, 0.36]], 0, 0, 0, { seg: 10 });
    B.lathe(NS('gloss'), K.red, [[0.152, 0.1], [0.152, 0.22]], 0, 0, 0, { seg: 10 });
    for (let k = 0; k < 3; k++) B.sph(NS('paint'), ['#e8b64a', '#f2eee6', '#c94f5c'][k], 0.03, Math.cos(k * 2.1) * 0.152, 0.16, Math.sin(k * 2.1) * 0.152, { ws: 5, hs: 4 });
    B.tube(NS('metal'), K.gold, [P3(-0.08, 0.36, 0), P3(0, 0.48, 0), P3(0.08, 0.36, 0)], 0.012, { radial: 4 });
    B.cyl('gloss', K.green, 0.03, 0.2, 0.17, 0.3, 0, { rz: -0.9, seg: 6 });
    B.pop();
  }
  D.lockgate_narrowboat = {
    desc: 'Narrowboat dressing around level hull (gunwale -0.7) + cabin (top 0.25) blocks. kind cabin | working. Bow (pointed, top bend, button fender, well deck) at local -X, counter stern + rudder + brass tiller at +X, rubbing strakes, portholes / cloth strings, roof kit kept to the edges (chimney collides), mooring lines to the bank (lines: [[x, z] …] prop-local bank points).',
    params: { kind: 'cabin | working', L: 'hull block length (7.8)', W: 'beam (2.0)', cab: 'cabin half length (2.9)', lines: 'bank tie points (local)', name: 'boat name on the stern' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.L ?? 7.8, W = o.W ?? 2.0, cab = o.cab ?? 2.9, hw = W / 2, working = o.kind === 'working';
      const paint = working ? '#2f4a3c' : K.green, band = working ? '#b58a3a' : K.maroon;
      // bow + stern shapes off the block ends (gunwale at local 0)
      B.add('gloss', bowGeo(1.7, hw, 'b' + kf(hw)), 'white', -L / 2, 0, 0, {});
      B.add('gloss', sternGeo(0.9, hw, 's' + kf(hw)), 'white', L / 2, 0, 0, {});
      B.col(-L / 2 - 1.2, -1.2, -hw * 0.6, -L / 2, 0.1, hw * 0.6);
      B.col(L / 2, -1.2, -hw * 0.8, L / 2 + 0.6, 0.05, hw * 0.8);
      // rubbing strakes along the hull sides + the top bend, tyre fenders
      for (const s of [-1, 1]) {
        for (const y of [-0.55, -0.3]) pbox(B, 'metal', '#1a1c20', L, 0.05, 0.05, 0, y, s * (hw + 0.02));
        pbox(B, 'gloss', band, L, 0.1, 0.03, 0, -0.07, s * (hw + 0.012));
      }
      B.cyl('rubber', '#2b2622', 0.2, 0.34, -L / 2 - 1.65, -0.1, 0, { rz: HP, seg: 10 });
      for (let k = 0; k < 3; k++) B.tor(NS('rubber'), K.rope, 0.2, 0.02, -L / 2 - 1.62 + k * 0.1, -0.1, 0, { rs: 3, ts: 10, ry: HP });
      B.cyl('rubber', '#2b2622', 0.16, 0.28, L / 2 + 0.95, -0.35, 0, { rz: HP, seg: 10 });
      // rudder + swan-neck tiller (brass) + the stern's painted rings
      B.box('gloss', '#1f2226', 0.9, 1.1, 0.06, L / 2 + 1.25, -0.9, 0, { r: 0.02 });
      B.cyl('metal', K.iron, 0.04, 1.0, L / 2 + 0.85, -0.3, 0, { seg: 6 });
      B.tube('metal', K.gold, [P3(L / 2 + 0.85, 0.2, 0), P3(L / 2 + 0.9, 0.55, 0), P3(L / 2 + 0.6, 0.72, 0), P3(L / 2 - 0.3, 0.78, 0)], 0.028, { radial: 6 });
      B.tor('metal', K.gold, 0.05, 0.012, L / 2 - 0.1, 0.78, 0, { rs: 4, ts: 8, ry: HP });
      B.cyl('gloss', K.white, 0.035, 0.18, L / 2 - 0.3, 0.78, 0, { rz: HP, seg: 6 });
      if (!working) {
        // cabin: windows + brass portholes on both sides, bulkhead doors, roof handrails, roof kit at the edges
        for (const s of [-1, 1]) {
          B.push(0, 0, s * (hw - 0.1), s > 0 ? 0 : PI);
          for (const x of [-2.0, -0.8]) { pbox(B, NS('gloss'), K.glassLt, 0.62, 0.34, 0.02, x, 0.58 + 0.12, 0.012); B.box(NS('metal'), K.gold, 0.7, 0.42, 0.02, x, 0.7, 0.004, { r: 0.05 }); }
          for (const x of [0.12]) { B.cyl('metal', K.gold, 0.12, 0.03, x, 0.72, 0.012, { rx: HP, seg: 12 }); B.cyl(NS('gloss'), K.glassLt, 0.09, 0.02, x, 0.72, 0.022, { rx: HP, seg: 10 }); }
          B.pop();
          pbox(B, 'metal', K.gold, cab * 2 - 0.3, 0.035, 0.035, 0, 0.98 + 0.05, s * (hw - 0.22));
          for (let x = -cab + 0.3; x <= cab - 0.2; x += 1.1) pbox(B, NS('metal'), K.gold, 0.03, 0.05, 0.03, x, 0.98 + 0.02, s * (hw - 0.22));
        }
        for (const [x, dir] of [[-cab, -1], [cab, 1]]) {
          B.push(x, 0, 0, dir > 0 ? -HP : HP);
          for (const sx of [-1, 1]) { B.box('wood', paint, 0.55, 0.85, 0.05, sx * 0.29, 0.47, 0.01, { r: 0.01 }); pbox(B, NS('paint'), '#e8b64a', 0.4, 0.62, 0.012, sx * 0.29, 0.48, 0.04); pbox(B, NS('paint'), K.red, 0.3, 0.5, 0.014, sx * 0.29, 0.48, 0.042); B.sph(NS('paint'), K.cream, 0.07, sx * 0.29, 0.5, 0.05, { ws: 6, hs: 4 }); }
          B.pop();
        }
        const ry = 0.95 + 0.01;
        // chimney (collides), water cans, plants, bike, gangplank + pole along the roof edges
        B.cyl('metal', '#2a2c30', 0.08, 0.6, -cab + 0.6, ry + 0.3, hw - 0.45, { seg: 8 });
        for (const y of [0.1, 0.25, 0.4]) B.cyl(NS('metal'), K.gold, 0.086, 0.035, -cab + 0.6, ry + y, hw - 0.45, { seg: 8 });
        B.cyl('metal', '#2a2c30', 0.11, 0.05, -cab + 0.6, ry + 0.62, hw - 0.45, { seg: 8 });
        colC(B, -cab + 0.6, ry, hw - 0.45, 0.24, 0.7, 0.24, ROOF);
        waterCan(B, -cab + 1.2, ry, hw - 0.35, 0.9); waterCan(B, -cab + 1.6, ry, hw - 0.35, 0.9);
        for (const [x, k] of [[0.3, 0], [0.8, 1], [2.1, 2]]) { B.lathe('paint', '#a45a3c', [[0, 0], [0.12, 0], [0.15, 0.2], [0, 0.2]], x, ry, hw - 0.3, { seg: 8 }); B.sph('foliage', ['#5ba257', '#3f8249', '#8fc46b'][k], 0.16, x, ry + 0.26, hw - 0.3, { ws: 7, hs: 5 }); if (k !== 1) for (let j = 0; j < 3; j++) B.sph(NS('paint'), ['#e5577a', '#f2eee6', '#e8b64a'][j], 0.035, x + Math.cos(j * 2) * 0.1, ry + 0.36, hw - 0.3 + Math.sin(j * 2) * 0.1, { ws: 4, hs: 3 }); }
        B.box('wood', K.oakLt, 2.6, 0.04, 0.26, 0.6, ry + 0.02, -hw + 0.3, { r: 0.01 });
        B.cyl('wood', K.oak, 0.025, 3.2, 0.4, ry + 0.07, -hw + 0.2, { rz: HP, seg: 5 });
        B.cyl('wood', K.oak, 0.025, 2.2, 0.6, ry + 0.07, -hw + 0.42, { rz: HP, seg: 5 });
        B.lathe('metal', K.iron, [[0.1, 0], [0.08, 0.12], [0.02, 0.18], [0, 0.18]], cab - 0.8, ry, -hw + 0.35, { seg: 8 });
        B.box('gloss', '#1d2a3a', 0.9, 0.04, 0.6, cab - 1.6, ry + 0.03, 0.0, { r: 0.01 });
        colC(B, cab - 1.6, ry, 0, 0.9, 0.1, 0.6);
      } else {
        // working boat: side cloths on the level hold block, strings over, top plank on stands, cratch + back cabin
        for (const s of [-1, 1]) for (let x = -cab + 0.35; x < cab; x += 0.7) {
          B.tube(NS('paint'), K.rope, [P3(x, -0.05, s * (hw - 0.02)), P3(x, 0.6, s * (hw - 0.09)), P3(x, 0.955, s * 0.5), P3(x, 0.965, 0)], 0.014, { radial: 3 });
        }
        for (let x = -cab + 0.35; x < cab; x += 1.4) pbox(B, NS('wood'), K.oakLt, 0.06, 0.05, 1.7, x, 0.97, 0);
        B.box('wood', K.oakLt, cab * 2 - 0.2, 0.04, 0.26, 0, 0.99, 0, { r: 0.008 });
        // cratch: painted triangular board at the fore end of the hold
        B.push(-cab - 0.02, 0, 0, HP);
        B.add('paint', tpl('cratch', () => extrudeGeo([[-0.75, 0], [0.75, 0], [0, 0.9]], 0.06, 0.004)), K.cream, 0, 0.02, 0, { ry: HP });
        B.add(NS('paint'), tpl('cratch2', () => extrudeGeo([[-0.55, 0.1], [0.55, 0.1], [0, 0.72]], 0.02, 0.002)), K.red, 0, 0.02, 0.035, { ry: HP });
        B.sph(NS('paint'), '#e8b64a', 0.09, 0, 0.36, 0.05, { ws: 6, hs: 4 });
        B.pop();
        // back cabin at the stern end of the hold: roses-and-castles panels, brass rings, chimney (collides)
        for (const s of [-1, 1]) {
          pbox(B, NS('paint'), K.red, 0.9, 0.5, 0.012, cab - 0.6, 0.55, s * (hw - 0.09));
          pbox(B, NS('paint'), '#e8b64a', 0.8, 0.4, 0.014, cab - 0.6, 0.55, s * (hw - 0.085));
          pbox(B, NS('paint'), K.green, 0.6, 0.28, 0.016, cab - 0.6, 0.55, s * (hw - 0.08));
          for (let k = 0; k < 4; k++) B.sph(NS('paint'), ['#c94f5c', '#f2eee6', '#e8b64a', '#c94f5c'][k], 0.045, cab - 0.84 + k * 0.16, 0.55 + (k % 2) * 0.06, s * (hw - 0.07), { ws: 5, hs: 4 });
        }
        B.cyl('metal', '#2a2c30', 0.07, 0.55, cab - 0.3, 1.2, hw - 0.4, { seg: 8 });
        B.cyl(NS('metal'), K.gold, 0.075, 0.05, cab - 0.3, 1.35, hw - 0.4, { seg: 8 });
        colC(B, cab - 0.3, 0.95, hw - 0.4, 0.2, 0.55, 0.2, ROOF);
      }
      // mooring lines to the bank (prop-local tie points on the towpath), with rope wraps at the cleats
      for (const [tx, tz, ty] of o.lines || []) {
        const bx = tx < 0 ? -L / 2 - 0.9 : L / 2 + 0.5, by = 0.1;
        const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(P3(bx + (tx - bx) * t, by + ((ty ?? 0.7) + 0.35 - by) * t - Math.sin(t * PI) * 0.35, (tz) * t)); }
        B.tube(NS('paint'), K.rope, pts, 0.022, { radial: 4 });
      }
    },
  };

  // ================================================================================================ wharf goods + furniture
  // oak cask (hoops, bung): upright at (x, y, z) or lying along local X (lie: true)
  function cask(B, x, y, z, o = {}) {
    const s = o.s ?? 1, c = o.c ?? K.oak;
    B.push(x, y, z, o.ry ?? 0, 0, o.lie ? HP : 0, s);
    const oy = o.lie ? -0.36 : 0;
    B.lathe('wood', c, [[0, 0], [0.26, 0], [0.3, 0.12], [0.33, 0.36], [0.3, 0.6], [0.26, 0.72], [0, 0.72]], 0, oy, 0, { seg: 12 });
    for (const y2 of [0.05, 0.2, 0.52, 0.67]) B.lathe(NS('metal'), K.iron, [[0.27 + (y2 > 0.1 && y2 < 0.6 ? 0.045 : 0.005), y2], [0.27 + (y2 > 0.1 && y2 < 0.6 ? 0.045 : 0.005), y2 + 0.04]], 0, oy, 0, { seg: 12 });
    B.pop();
  }
  D.lockgate_casks = {
    desc: 'Oak casks on the wharf. variant 0 = a pyramid of 3 lying on a timber stillage + 2 upright; 1 = 3 upright with a lid plank; 2 = a single lying cask chocked with bricks.',
    params: {}, variants: 3, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 3;
      if (v === 0) {
        for (const z of [-0.45, 0.45]) B.box('wood', K.timberLt, 1.7, 0.12, 0.14, 0, 0.06, z, { r: 0.02 });
        for (const z of [-0.36, 0.36]) cask(B, -0.35, 0.48, z, { lie: true });
        cask(B, -0.35, 1.06, 0, { lie: true, c: K.oakLt });
        for (const z of [-0.36, 0.36]) cask(B, 0.72, 0, z, {});
        B.col(-0.75, 0, -0.75, 1.1, 1.0, 0.75); B.col(-0.75, 1.0, -0.4, 0.05, 1.42, 0.4);
        B.blob(2.2, 1.8);
      } else if (v === 1) {
        for (const [x, z] of [[-0.35, -0.3], [0.35, -0.3], [0, 0.32]]) cask(B, x, 0, z, {});
        B.box('wood', K.timberLt, 1.3, 0.05, 0.3, 0, 0.745, -0.3, { r: 0.01 });
        B.col(-0.72, 0, -0.68, 0.72, 0.78, 0.7);
        B.blob(1.7, 1.6);
      } else {
        cask(B, 0, 0.36, 0, { lie: true });
        for (const z of [-0.3, 0.3]) B.box('paint', K.brick, 0.22, 0.08, 0.11, 0.25, 0.04, z, { r: 0.01 });
        B.col(-0.4, 0, -0.36, 0.4, 0.72, 0.36);
        B.blob(1.0, 0.9);
      }
    },
  };
  // hessian sacks + tea chests on a pallet-ish stillage
  D.lockgate_goods = {
    desc: 'Wharf goods stack (collides): variant 0 = sacks on a stillage + tea chests; 1 = crated machinery under a tied tarpaulin; 2 = timber deals stacked on bearers.',
    params: {}, variants: 3, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 3;
      if (v === 0) {
        B.box('wood', K.timberLt, 1.8, 0.14, 1.2, 0, 0.07, 0, { r: 0.02 });
        for (let i = 0; i < 6; i++) { const x = -0.6 + (i % 3) * 0.6, z = i < 3 ? -0.3 : 0.3; B.box('paint', mixc('#bda274', '#a88c5f', hash(i)), 0.56, 0.3, 0.5, x, 0.3, z, { round: true, r: 0.1 }); }
        for (let i = 0; i < 3; i++) B.box('paint', mixc('#bda274', '#c9b287', hash(i + 7)), 0.56, 0.3, 0.5, -0.3 + i * 0.3 - 0.15, 0.6, (i - 1) * 0.3, { round: true, r: 0.1, ry: 0.3 * i });
        for (const [x, z, h] of [[1.3, -0.3, 0.55], [1.3, 0.35, 0.55], [1.3, 0.0, 1.1]]) { B.box('wood', '#9a7550', 0.55, 0.55, 0.55, x, h - 0.275, z, { r: 0.015 }); pbox(B, NS('paint'), '#2a2a2a', 0.3, 0.12, 0.004, x, h - 0.25, z + 0.277); }
        B.col(-0.92, 0, -0.62, 1.6, 0.8, 0.62); B.col(1.02, 0.8, -0.3, 1.6, 1.1, 0.3);
        B.blob(2.8, 1.6);
      } else if (v === 1) {
        B.box('wood', K.timberLt, 1.6, 1.0, 1.1, 0, 0.5, 0, { r: 0.03 });
        B.box('paint', '#3c4f45', 1.7, 1.02, 1.2, 0, 0.53, 0, { round: true, r: 0.06 });
        for (const x of [-0.5, 0.5]) B.tube(NS('paint'), K.rope, [P3(x, 0.02, -0.62), P3(x, 1.06, -0.55), P3(x, 1.06, 0.55), P3(x, 0.02, 0.62)], 0.015, { radial: 3 });
        pbox(B, NS('paint'), K.cream, 0.5, 0.2, 0.004, 0.3, 0.6, 0.603);
        B.col(-0.85, 0, -0.62, 0.85, 1.06, 0.62);
        B.blob(2.2, 1.6);
      } else {
        for (const x of [-0.8, 0, 0.8]) B.box('wood', K.timber, 0.12, 0.12, 1.3, x, 0.06, 0, { r: 0.02 });
        for (let j = 0; j < 5; j++) for (let i = 0; i < 4; i++) B.box('wood', mixc(K.oakLt, '#c9a56f', hash(i * 3 + j)), 2.2 - (j % 2) * 0.1, 0.07, 0.24, (j % 2) * 0.05, 0.155 + j * 0.075, -0.39 + i * 0.26, { r: 0.008 });
        B.col(-1.1, 0, -0.6, 1.1, 0.52, 0.6);
        B.blob(2.6, 1.6);
      }
    },
  };
  // two-wheeled flat cart (dray) with big spoked wheels, shafts down on the setts
  D.lockgate_cart = {
    desc: 'Two-wheeled timber flat cart: big iron-tyred spoked wheels, shafts resting on the ground (+X), a load of sacks + a cask (collides).',
    params: { load: 'bool (true)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.push(0, 0.72, 0, 0, 0, -0.09);
      B.box('wood', K.oakLt, 2.2, 0.1, 1.3, -0.2, 0, 0, { r: 0.02 });
      for (const z of [-0.66, 0.66]) B.box('wood', K.oak, 2.2, 0.2, 0.06, -0.2, 0.12, z, { r: 0.01 });
      for (const z of [-0.45, 0.45]) B.box('wood', K.oak, 2.1, 0.08, 0.08, 1.9, -0.04, z * 0.9, { r: 0.015 });
      if (o.load !== false) { for (let i = 0; i < 3; i++) B.box('paint', mixc('#bda274', '#a88c5f', hash(i + 3)), 0.55, 0.3, 0.45, -0.8 + i * 0.5, 0.2, -0.3, { round: true, r: 0.1 }); cask(B, 0.3, 0.05, 0.3, { lie: true, ry: HP, s: 0.8 }); }
      B.pop();
      for (const z of [-0.78, 0.78]) {
        B.tor('wood', K.maroon, 0.58, 0.05, -0.1, 0.62, z, { rs: 5, ts: 20 });
        B.tor(NS('metal'), K.iron, 0.62, 0.02, -0.1, 0.62, z, { rs: 3, ts: 20 });
        for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; seg(B, NS('wood'), K.maroon, [-0.1, 0.62, z], [-0.1 + Math.cos(a) * 0.56, 0.62 + Math.sin(a) * 0.56, z], 0.03, 0.03, { plain: true }); }
        B.cyl('wood', K.maroon, 0.1, 0.16, -0.1, 0.62, z, { rx: HP, seg: 8 });
      }
      B.col(-1.4, 0, -0.9, 1.0, 1.1, 0.9); B.col(1.0, 0, -0.5, 2.9, 0.6, 0.5);
      B.blob(3.8, 2.0);
    },
  };
  // stone horse trough on two plinths
  D.lockgate_trough = {
    desc: 'Granite horse trough (1.9 m) on plinths with water in it and a cast-iron drinking fountain plate at one end (collides).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      for (const x of [-0.6, 0.6]) B.box('paint', K.stoneDk, 0.3, 0.3, 0.6, x, 0.15, 0, { r: 0.03 });
      B.box('paint', K.stone, 1.9, 0.5, 0.75, 0, 0.55, 0, { r: 0.05 });
      pbox(B, 'gloss', K.water, 1.7, 0.02, 0.55, 0, 0.74, 0);
      B.box('metal', K.iron, 0.12, 0.8, 0.5, 1.0, 0.4, 0, { r: 0.03 });
      B.lathe('metal', K.iron, [[0.05, 0], [0.03, 0.12], [0, 0.12]], 0.98, 0.86, 0, { seg: 6, rz: HP });
      B.col(-1.0, 0, -0.4, 1.08, 0.82, 0.4);
      B.blob(2.3, 1.1);
    },
  };
  // lock-side bench: slatted timber on cast-iron ends, a brass plaque
  D.lockgate_bench = {
    desc: 'Canal-side bench: painted slats on black cast-iron scroll ends, faces +Z (collides).',
    params: { length: 'm (1.8)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 1.8;
      for (const sx of [-1, 1]) {
        const x = sx * (L / 2 - 0.12);
        B.tube('metal', K.black, [P3(x, 0, 0.22), P3(x, 0.42, 0.18), P3(x, 0.44, -0.18), P3(x, 0.86, -0.3)], 0.03, { radial: 5 });
        B.tube('metal', K.black, [P3(x, 0, -0.22), P3(x, 0.42, -0.1), P3(x, 0.62, 0.22)], 0.028, { radial: 5 });
      }
      for (const z of [-0.14, -0.02, 0.1]) B.box('wood', K.green, L, 0.035, 0.1, 0, 0.45, z, { r: 0.01 });
      for (const y of [0.6, 0.74]) B.push(0, y, -0.25, 0, -0.3), B.box('wood', K.green, L, 0.1, 0.035, 0, 0, 0, { r: 0.01 }), B.pop();
      pbox(B, NS('metal'), K.gold, 0.16, 0.05, 0.01, 0, 0.74, -0.215, { rx: -0.3 });
      B.col(-L / 2, 0, -0.32, L / 2, 0.86, 0.26);
      B.blob(L + 0.3, 0.8);
    },
  };
  // cast-iron canal milepost
  D.lockgate_milepost = {
    desc: 'Cast-iron canal milepost (white with black raised lettering): LOCKGATE BASIN ½ MILE (collides).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('paint', K.white, 0.32, 0.9, 0.22, 0, 0.45, 0, { r: 0.03 });
      B.push(0, 0.86, 0, 0, 0, 0); B.box('paint', K.white, 0.4, 0.24, 0.32, 0, 0.1, 0.04, { rx: -0.5, r: 0.03 }); B.pop();
      B.push(0, 0.62, 0.115);
      letters(B, 'BASIN', { h: 0.05, x: 0, y: 0.08, z: 0.002, c: K.black, flat: true, wt: 0.22, track: 0.1 });
      letters(B, '1/2', { h: 0.1, x: 0, y: -0.07, z: 0.002, c: K.black, flat: true, wt: 0.22 });
      letters(B, 'MILE', { h: 0.045, x: 0, y: -0.18, z: 0.002, c: K.black, flat: true, wt: 0.22, track: 0.1 });
      B.pop();
      colC(B, 0, 0, 0, 0.36, 1.0, 0.3);
      B.blob(0.6, 0.5);
    },
  };
  // pillar box (Victorian post box)
  D.lockgate_postbox = {
    desc: 'Red cast-iron pillar box with a crowned cap, a slot and a collection plate (collides).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.lathe('gloss', K.red, [[0, 0], [0.27, 0], [0.27, 0.08], [0.23, 0.12], [0.23, 1.2], [0.28, 1.26], [0.28, 1.32], [0.18, 1.45], [0.06, 1.52], [0, 1.53]], 0, 0, 0, { seg: 14 });
      pbox(B, NS('paint'), K.black, 0.28, 0.04, 0.02, 0, 1.12, 0.23);
      pbox(B, NS('paint'), K.white, 0.2, 0.14, 0.01, 0, 0.9, 0.232);
      B.sph('gloss', K.red, 0.05, 0, 1.56, 0, { ws: 6, hs: 4 });
      colC(B, 0, 0, 0, 0.56, 1.55, 0.56, ROOF);
      B.blob(0.8, 0.8);
    },
  };
  // canal fingerpost
  D.lockgate_fingerpost = {
    desc: 'Canal junction fingerpost: black-and-white post with cast finial, three arms (HARBOUR BASIN / TOWPATH / LOCKS) (collides as a post).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.lathe('paint', K.black, [[0.12, 0], [0.09, 0.3], [0.06, 0.34], [0.06, 2.4], [0.08, 2.46], [0, 2.52]], 0, 0, 0, { seg: 8 });
      B.lathe(NS('paint'), K.white, [[0.061, 0.4], [0.061, 1.8]], 0, 0, 0, { seg: 8 });
      B.sph('paint', K.white, 0.08, 0, 2.58, 0, { ws: 8, hs: 6 });
      for (const [ry, txt, y] of [[0.3, 'HARBOUR', 2.2], [PI + 0.2, 'LOCKS', 2.0], [HP + 0.4, 'TOWPATH', 1.8]]) {
        B.push(0, y, 0, ry);
        B.box('paint', K.white, 1.0, 0.16, 0.04, 0.55, 0, 0, { r: 0.01 });
        B.add('paint', tpl('fpTip', () => extrudeGeo([[-0.08, 0], [0.08, 0], [0, 0.1]], 0.04, 0.002)), K.white, 1.05, 0, 0, { rz: -HP });
        for (const f of [1, -1]) { B.push(0.52, -0.05, f * 0.021, f > 0 ? 0 : PI); letters(B, txt, { h: 0.085, x: 0, y: 0, z: 0.001, c: K.black, flat: true, wt: 0.22, track: 0.08 }); B.pop(); }
        B.pop();
      }
      colC(B, 0, 0, 0, 0.24, 2.4, 0.24, ROOF);
      B.blob(0.6, 0.6);
    },
  };
  // life ring on a post (canal pattern: red/white ring in a wooden cabinet-free holder)
  D.lockgate_lifebuoy = {
    desc: 'Towpath life buoy on a black post with a white hood + throwline (collides as a post).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('paint', K.black, 0.12, 1.5, 0.12, 0, 0.75, 0, { r: 0.02 });
      B.box('paint', K.white, 0.5, 0.08, 0.2, 0, 1.52, 0.02, { r: 0.02 });
      const g = tpl('buoyRing', () => { const t = new THREE.TorusGeometry(0.26, 0.06, 6, 20), Pp = t.attributes.position, cl = new Float32Array(Pp.count * 3); const a = new THREE.Color(K.red), b = new THREE.Color(K.white); for (let i = 0; i < Pp.count; i++) { const ang = Math.atan2(Pp.getY(i), Pp.getX(i)) + TAU; const q = Math.floor((ang + PI / 8) / (TAU / 8)) % 2 ? b : a; cl.set([q.r, q.g, q.b], i * 3); } t.setAttribute('color', new THREE.BufferAttribute(cl, 3)); return t; });
      B.add('gloss', g, 'white', 0, 1.12, 0.1, {});
      B.tube(NS('paint'), K.rope, [P3(-0.2, 1.2, 0.16), P3(0, 0.95, 0.2), P3(0.2, 1.2, 0.16)], 0.012, { radial: 3 });
      colC(B, 0, 0, 0.02, 0.6, 1.56, 0.34, ROOF);
    },
  };
  // stop planks stacked on the lock side (the chamber is drained behind them) + LOCK CLOSED notice on trestles
  D.lockgate_stopplanks = {
    desc: 'Maintenance kit on the lock side: a stack of timber stop planks on bearers, a LOCK CLOSED FOR REPAIR notice on a trestle, cones, a portable pump with its hose over the chamber edge (+Z side = the chamber) (collides).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      for (const x of [-1.0, 0, 1.0]) B.box('wood', K.timber, 0.12, 0.1, 0.9, x, 0.05, -1.0, { r: 0.02 });
      for (let j = 0; j < 4; j++) B.box('wood', mixc(K.timberLt, K.oak, hash(j)), 2.6, 0.12, 0.26, (j % 2) * 0.05, 0.16 + j * 0.12, -1.0 + (j % 2 ? 0.14 : -0.14), { r: 0.015 });
      B.col(-1.35, 0, -1.45, 1.35, 0.64, -0.55);
      // notice on a trestle
      B.push(1.9, 0, -0.9, -0.35);
      for (const sx of [-1, 1]) { seg(B, 'wood', K.white, [sx * 0.5, 0, -0.15], [sx * 0.5, 0.9, 0], 0.05, 0.05); seg(B, 'wood', K.white, [sx * 0.5, 0, 0.15], [sx * 0.5, 0.9, 0], 0.05, 0.05); }
      B.box('wood', K.white, 1.1, 0.08, 0.06, 0, 0.9, 0, { r: 0.01 });
      B.box('paint', K.red, 1.0, 0.45, 0.03, 0, 1.18, 0.02, { r: 0.01 });
      letters(B, 'LOCK CLOSED', { h: 0.1, x: 0, y: 1.22, z: 0.04, c: K.white, flat: true, wt: 0.22, track: 0.08 });
      letters(B, 'FOR REPAIR', { h: 0.08, x: 0, y: 1.06, z: 0.04, c: K.white, flat: true, wt: 0.22, track: 0.08 });
      B.pop();
      B.col(1.25, 0, -1.3, 2.55, 1.42, -0.5, ROOF);
      // pump on a skid, hose snaking to the chamber edge and down the wall
      B.box('paint', '#b0433a', 0.9, 0.55, 0.6, -0.4, 0.34, 0.1, { round: true, r: 0.06 });
      B.box('metal', K.iron, 1.0, 0.08, 0.7, -0.4, 0.04, 0.1, { r: 0.02 });
      B.cyl('metal', K.ironLt, 0.14, 0.3, -0.05, 0.4, 0.1, { rz: HP, seg: 10 });
      B.tube('rubber', '#22242a', [P3(0.1, 0.4, 0.1), P3(0.5, 0.1, 0.3), P3(0.9, 0.06, 0.55), P3(1.1, 0.06, 0.9), P3(1.2, 0.02, 1.2), P3(1.25, -1.0, 1.28), P3(1.3, -3.1, 1.3)], 0.05, { radial: 6 });
      B.col(-0.9, 0, -0.25, 0.1, 0.65, 0.45);
      for (const [x, z] of [[-1.6, 0.6], [2.6, 0.3]]) { B.lathe('gloss', '#e0773c', [[0.16, 0], [0.16, 0.03], [0.1, 0.05], [0.03, 0.55], [0, 0.56]], x, 0, z, { seg: 10 }); B.lathe(NS('gloss'), K.white, [[0.075, 0.25], [0.056, 0.36]], x, 0, z, { seg: 10 }); }
      B.blob(4.5, 2.4);
    },
  };
  // junk in the drained chamber: an old bike, a pram chassis, a tyre, silt banks + puddles
  D.lockgate_silt = {
    desc: 'Drained-chamber floor dressing (flat, non-colliding except the pram): silt banks along the walls, puddles, weed, a lost bike, a rusty pram chassis, a tyre, bricks.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      for (const [x, z, w, d] of [[0.5, 2.3, 5.5, 0.9], [-2.6, -2.3, 2.4, 0.7], [2.2, -2.35, 2.0, 0.6]]) B.box(NS('paint'), K.mud, w, 0.08, d, x, 0.02, z, { round: true, r: 0.04 });
      for (const [x, z, w, d] of [[-1.2, 0.4, 2.2, 1.1], [1.8, -0.6, 1.4, 0.8], [3.3, 1.2, 0.9, 0.7]]) B.box(NS('gloss'), K.puddle, w, 0.012, d, x, 0.008, z, { round: true, r: 0.004 });
      for (let k = 0; k < 16; k++) B.sph(NS('foliage'), K.moss, 0.1 + hash(k) * 0.08, -3.5 + hash(k * 3) * 7, 0.03, (hash(k * 7) > 0.5 ? 1 : -1) * (2.45 - hash(k * 11) * 0.3), { ws: 5, hs: 3, sy: 0.4 });
      // bike lying in the silt
      B.push(-2.0, 0.08, 1.6, 0.4, 0, HP * 0.98);
      for (const x of [-0.5, 0.5]) { B.tor('metal', '#6d3a2a', 0.33, 0.02, x, 0, 0, { rs: 4, ts: 16 }); }
      seg(B, 'metal', '#3f6b8a', [-0.5, 0, 0], [0, 0.05, 0], 0.03, 0.03); seg(B, 'metal', '#3f6b8a', [0, 0.05, 0], [0.5, 0, 0], 0.03, 0.03); seg(B, 'metal', '#3f6b8a', [0, 0.05, 0], [0.1, 0.45, 0], 0.03, 0.03);
      B.pop();
      // pram chassis on its side (collides)
      B.push(2.4, 0, 0.9, 0.7);
      for (const x of [-0.3, 0.3]) for (const z of [-0.25, 0.25]) B.tor('metal', '#4a3a30', 0.14, 0.015, x, 0.14, z, { rs: 3, ts: 12 });
      B.box('metal', '#5a3a2a', 0.8, 0.35, 0.45, 0, 0.45, 0, { r: 0.04 });
      B.pop();
      B.col(2.0, 0, 0.5, 2.8, 0.65, 1.3);
      B.tor('rubber', '#1e2024', 0.3, 0.1, 0.4, 0.1, -1.6, { rs: 6, ts: 14, rx: HP });
      for (let k = 0; k < 5; k++) B.box('paint', K.brick, 0.22, 0.07, 0.11, -0.5 + hash(k) * 1.5, 0.035, -1.9 + hash(k * 5) * 0.6, { ry: hash(k * 2) * 3, r: 0.01 });
    },
  };
  // iron ladder recessed in a wall (wall at z = 0, water/chamber on +Z), from y0 up to the coping
  D.lockgate_ladder = {
    desc: 'Recessed iron ladder in a canal / chamber wall (wall at z = 0, facing +Z) from y0 up to the coping (pos.y), grab hoop over the edge. Non-colliding.',
    params: { depth: 'm below the coping (3)' }, variants: 1, mount: 'wall',
    build(B, o) {
      B.aoBase = null;
      const d = o.depth ?? 3;
      pbox(B, NS('paint'), '#1a1c1e', 0.55, d, 0.01, 0, -d / 2, 0.004);
      for (const sx of [-0.22, 0.22]) B.box('metal', K.iron, 0.04, d, 0.06, sx, -d / 2, 0.04, { r: 0.01 });
      for (let y = -d + 0.25; y < -0.1; y += 0.3) B.cyl(NS('metal'), K.ironLt, 0.016, 0.44, 0, y, 0.06, { rz: HP, seg: 5 });
      for (const sx of [-0.22, 0.22]) B.tube('metal', K.iron, [P3(sx, -0.1, 0.06), P3(sx, 0.35, 0.04), P3(sx, 0.4, -0.15), P3(sx, 0.0, -0.3)], 0.02, { radial: 5 });
    },
  };
  // half-barrel planter of bright flowers (lock keepers' pride)
  D.lockgate_planter = {
    desc: 'Half-barrel planter with geraniums / marigolds (collides).',
    params: {}, variants: 2, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 2;
      B.lathe('wood', K.oak, [[0, 0], [0.34, 0], [0.4, 0.2], [0.42, 0.42], [0, 0.42]], 0, 0, 0, { seg: 12 });
      for (const y of [0.08, 0.34]) B.lathe(NS('metal'), K.iron, [[0.37 + y * 0.12, y], [0.37 + y * 0.12, y + 0.04]], 0, 0, 0, { seg: 12 });
      B.sph('foliage', '#4f8a45', 0.38, 0, 0.46, 0, { ws: 10, hs: 6, sy: 0.55 });
      const fc = v ? ['#e8b64a', '#e07b39'] : ['#d13b4a', '#f2eee6'];
      for (let k = 0; k < 11; k++) { const a = k * 2.4, r = 0.1 + (k % 3) * 0.1; B.sph(NS('paint'), fc[k % 2], 0.055, Math.cos(a) * r, 0.6 + (k % 2) * 0.04, Math.sin(a) * r, { ws: 5, hs: 4 }); }
      colC(B, 0, 0, 0, 0.84, 0.7, 0.84);
      B.blob(1.0, 1.0);
    },
  };
  // an apple tree for the cottage garden
  D.lockgate_tree = {
    desc: 'Old apple tree: gnarled trunk, lumpy canopy puffs with a few apples (trunk collides).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.tube('wood', '#6b5140', [P3(0, 0, 0), P3(0.1, 1.0, 0.05), P3(-0.1, 1.8, 0.1), P3(0.2, 2.4, 0)], (t) => 0.2 - t * 0.09, { radial: 7 });
      for (const [x, y, z, r] of [[0.1, 3.0, 0, 1.2], [-0.8, 2.7, 0.4, 0.9], [0.9, 2.6, -0.4, 0.9], [0.2, 2.5, 0.9, 0.8], [-0.2, 3.5, -0.3, 0.8]]) B.add('foliage', tpl('puff' + (Math.round(x * 3 + 5) % 6), () => H.puffGeo(1, Math.round(x * 3 + 5) % 6)), mixc('#4f8a45', '#8fc46b', hash(x + z) * 0.4), x, y, z, { s: r, sy: r * 0.85 });
      for (let k = 0; k < 9; k++) B.sph(NS('paint'), K.red, 0.06, Math.cos(k * 1.9) * 1.1, 2.3 + hash(k) * 0.9, Math.sin(k * 1.9) * 1.0, { ws: 5, hs: 4 });
      colC(B, 0, 0, 0, 0.45, 2.2, 0.45, ROOF);
      B.blob(3.2, 3.2);
    },
  };
  // wharf crane: cast-iron hand crane on a stone pier (jib over the water, gear frame, crank, chain + hook)
  D.lockgate_crane = {
    desc: 'Victorian cast-iron wharf crane on a stone plinth at the canal edge: tapering post, curved jib over the water (+Z), gear frame with crank handles, chain + hook with a bale, painted black and white (post + plinth collide).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('paint', K.stone, 1.3, 0.4, 1.3, 0, 0.2, 0, { r: 0.05 });
      B.lathe('gloss', K.black, [[0.32, 0.4], [0.28, 0.6], [0.2, 2.6], [0.17, 3.1], [0.22, 3.2], [0, 3.25]], 0, 0, 0, { seg: 10 });
      // jib: two curved plates from the post top out over the water, a tie back to the post
      for (const sx of [-0.08, 0.08]) B.tube('gloss', K.black, [P3(sx, 1.4, 0.18), P3(sx, 2.6, 1.0), P3(sx, 3.3, 2.2), P3(sx, 3.5, 3.3)], 0.07, { radial: 6 });
      B.tube('gloss', K.black, [P3(0, 3.15, 0.1), P3(0, 3.5, 3.2)], 0.045, { radial: 5 });
      B.cyl('gloss', K.white, 0.18, 0.12, 0, 3.45, 3.32, { rz: HP, seg: 10 });
      // gear frame + crank
      B.box('gloss', K.black, 0.5, 0.7, 0.36, 0, 1.3, -0.3, { r: 0.04 });
      for (const sx of [-1, 1]) { B.cyl('gloss', K.black, 0.3, 0.05, sx * 0.28, 1.35, -0.3, { rz: HP, seg: 14 }); seg(B, 'metal', K.ironLt, [sx * 0.34, 1.35, -0.3], [sx * 0.34, 1.0, -0.62], 0.04, 0.04); B.cyl('wood', K.oakLt, 0.03, 0.2, sx * 0.44, 1.0, -0.62, { rz: HP, seg: 5 }); }
      B.cyl('metal', K.ironLt, 0.12, 0.3, 0, 1.6, -0.3, { rz: HP, seg: 10 });
      B.tube(NS('metal'), K.ironLt, [P3(0, 1.72, -0.25), P3(0, 3.0, 0.3), P3(0, 3.4, 3.3), P3(0, 1.3, 3.34)], 0.015, { radial: 4 });
      B.tor('metal', K.iron, 0.1, 0.022, 0, 1.2, 3.34, { rs: 4, ts: 8, arc: PI * 1.3, rz: -0.6 });
      B.box('paint', '#b39a6a', 0.6, 0.5, 0.5, 0, 0.8, 3.34, { round: true, r: 0.1 });
      colC(B, 0, 0, 0, 1.3, 1.9, 1.3, ROOF);
      B.col(-0.3, 1.9, -0.3, 0.3, 3.2, 0.3, ROOF);
      B.blob(1.8, 1.8);
    },
  };
  // iron railing along +X (painted black, spear-top bars) — spawn stage edges, office stair …
  D.lockgate_railing = {
    desc: 'Black cast-iron railing along +X: spear-top bars, top + bottom rails, square posts every ~1.8 m (rail collider: shots / squids pass).',
    params: { length: 'm (4)', height: 'm (1.0)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 4, Hh = o.height ?? 1.0, n = Math.max(1, Math.round(L / 1.8));
      for (let i = 0; i <= n; i++) { const x = (i / n) * L; B.box('metal', K.black, 0.07, Hh + 0.08, 0.07, x, (Hh + 0.08) / 2, 0, { r: 0.012 }); B.sph(NS('metal'), K.black, 0.05, x, Hh + 0.1, 0, { ws: 6, hs: 4 }); }
      for (const y of [0.12, Hh - 0.08]) pbox(B, 'metal', K.black, L, 0.035, 0.03, L / 2, y, 0);
      for (let x = 0.12; x < L - 0.05; x += 0.13) { pbox(B, NS('metal'), K.black, 0.018, Hh - 0.05, 0.018, x, Hh / 2, 0); B.add(NS('metal'), tpl('spear', () => latheGeo([[0.02, 0], [0.012, 0.06], [0, 0.07]], 4)), K.black, x, Hh - 0.04, 0, {}); }
      B.col(-0.04, 0, -0.05, L + 0.04, Hh + 0.1, 0.05, RAIL);
    },
  };

  // scaffold-tube handrail along a chamber stair (local +X from the foot at (0,0,0) up to (run, rise, 0), open side at
  // local z = side * 0.75): standards, top + knee rails, a toe board (the rail collides, off-limits on top)
  D.lockgate_scaffrail = {
    desc: 'Scaffold-tube handrail for the chamber maintenance stairs (local +X from the foot up to (run, rise); rail on the open side z = side * 0.93): galvanised standards with couplers, top + knee rails, toe board. Rail colliders follow the slope.',
    params: { run: 'm (7.25)', rise: 'm (3.2)', side: '+1 | -1' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const run = o.run ?? 7.25, rise = o.rise ?? 3.2, sd = o.side ?? 1, z = sd * 0.93, n = 5, galv = '#aab2b8';
      const at = (t, h) => P3(t * run, t * rise + h, z);
      for (let i = 0; i <= n; i++) { const t = 0.03 + (i / n) * 0.94, p = at(t, 0); B.cyl('metal', galv, 0.024, 1.1, p[0], p[1] + 0.55, z, { seg: 6 }); B.cyl(NS('metal'), K.iron, 0.05, 0.03, p[0], p[1] + 0.02, z, { seg: 6 }); for (const h of [0.55, 1.0]) B.sph(NS('metal'), '#8d959c', 0.035, p[0], p[1] + h, z, { ws: 5, hs: 4 }); }
      B.tube('metal', galv, [at(0.02, 1.0), at(0.98, 1.0)], 0.024, { radial: 6 });
      B.tube(NS('metal'), galv, [at(0.02, 0.55), at(0.98, 0.55)], 0.022, { radial: 6 });
      B.push(run / 2, rise / 2 + 0.08, z, 0, 0, Math.atan2(rise, run)); pbox(B, 'wood', '#b89a62', Math.hypot(run, rise) * 0.96, 0.15, 0.03, 0, 0, 0); B.pop();
      const L = Math.hypot(run, rise);
      void L;
      for (let k = 0; k < 6; k++) { const t0 = k / 6, t1 = (k + 1) / 6; B.col(t0 * run, t0 * rise, z - 0.05, t1 * run, t1 * rise + 1.05, z + 0.05, RAIL); }
    },
  };
  // lock-keeper's timber tool hut on the lock side (collides; the roof is off-limits)
  D.lockgate_hut = {
    desc: "Lock-keeper's tool hut: black-tarred weatherboards, white window + door, felt roof with a stove pipe, windlasses hung by the door, a bucket (collides; roof off-limits).",
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const W = 2.0, Dd = 1.8, Hh = 2.2;
      B.box('wood', K.black, W, Hh, Dd, 0, Hh / 2, 0, { r: 0.03 });
      for (let y = 0.15; y < Hh; y += 0.18) for (const s of [-1, 1]) { pbox(B, NS('wood'), K.blackLt, W + 0.01, 0.02, 0.01, 0, y, s * (Dd / 2 + 0.004)); pbox(B, NS('wood'), K.blackLt, 0.01, 0.02, Dd + 0.01, s * (W / 2 + 0.004), y, 0); }
      B.push(0, 0, Dd / 2);
      B.box('wood', K.white, 0.8, 1.9, 0.05, -0.45, 0.95, 0.02, { r: 0.01 });
      pbox(B, NS('gloss'), K.glass, 0.5, 0.4, 0.02, 0.5, 1.4, 0.01);
      for (const [x, y, w, h] of [[0.5, 1.62, 0.6, 0.05], [0.5, 1.18, 0.6, 0.05], [0.22, 1.4, 0.05, 0.5], [0.78, 1.4, 0.05, 0.5]]) pbox(B, 'paint', K.white, w, h, 0.05, x, y, 0.025);
      for (const x of [0.25, 0.55]) { B.box('metal', K.iron, 0.03, 0.4, 0.03, x, 0.75, 0.05, { r: 0.008 }); B.box('metal', K.iron, 0.25, 0.03, 0.03, x + 0.1, 0.55, 0.05, { r: 0.008 }); }
      B.pop();
      B.push(0, Hh + 0.12, 0, 0, 0, 0.12); B.box('paint', '#2b2d31', W + 0.3, 0.08, Dd + 0.3, 0, 0, 0, { r: 0.02 }); B.pop();
      B.cyl('metal', K.iron, 0.06, 0.7, 0.6, Hh + 0.45, -0.4, { seg: 6 });
      B.lathe('metal', K.ironLt, [[0.14, 0], [0.15, 0.3], [0, 0.3]], -0.7, 0, Dd / 2 + 0.3, { seg: 8 });
      B.col(-W / 2, 0, -Dd / 2, W / 2, Hh, Dd / 2);
      B.col(-W / 2 - 0.15, Hh, -Dd / 2 - 0.15, W / 2 + 0.15, Hh + 0.9, Dd / 2 + 0.15, ROOF);
      B.blob(2.8, 2.6);
    },
  };
  // cast-iron yard water pump with a stone trough (cover)
  D.lockgate_pump = {
    desc: 'Cast-iron parish pump: fluted column with a domed cap, swan-neck spout over a stone basin, long handle (collides).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('paint', K.stone, 1.0, 0.25, 0.6, 0.35, 0.125, 0, { r: 0.04 });
      pbox(B, NS('gloss'), K.water, 0.8, 0.02, 0.44, 0.35, 0.24, 0);
      B.lathe('gloss', K.green, [[0.2, 0], [0.18, 0.12], [0.13, 0.2], [0.13, 1.25], [0.16, 1.3], [0.18, 1.42], [0.1, 1.55], [0, 1.6]], -0.2, 0, 0, { seg: 12 });
      B.tube('gloss', K.green, [P3(-0.1, 0.95, 0), P3(0.2, 0.92, 0), P3(0.32, 0.7, 0)], 0.045, { radial: 6 });
      B.tube('gloss', K.green, [P3(-0.25, 1.3, 0), P3(-0.6, 1.5, 0), P3(-0.95, 1.4, 0)], 0.03, { radial: 5 });
      B.sph('gloss', K.gold, 0.05, -0.2, 1.64, 0, { ws: 6, hs: 4 });
      B.col(-0.45, 0, -0.32, 0.87, 1.0, 0.32);
      B.col(-0.4, 1.0, -0.2, 0.0, 1.62, 0.2, ROOF);
      B.blob(1.6, 1.0);
    },
  };

  // ================================================================================================ stage + garden kits
  // spawn stage dressing (pos = centre of the stage front edge at ground level, stage spans x ±9, back to z -7):
  // stone copings on the front parapets (off-limits), the grand stair's stone cheeks + newel piers with lamps, a
  // cast-iron sack barrow + weighing machine on the stage corners
  D.lockgate_stagekit = {
    desc: 'Loading-stage dressing for the spawn: parapet copings, grand-stair cheeks + newel piers with lamps (piers collide, off-limits), stage-edge stone band, sack barrow + platform scale in the back corners.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const top = 2.4;
      for (const sx of [-1, 1]) {
        // parapet coping (parapet x 3.2 … 9, z -0.6 … 0, top 3.15)
        B.box('paint', K.stone, 5.95, 0.12, 0.74, sx * 6.1, 3.21, -0.3, { r: 0.03 });
        B.col(sx > 0 ? 3.15 : -9.05, 3.15, -0.67, sx > 0 ? 9.05 : -3.15, 3.3, 0.07, ROOF);
        // newel piers at the head of the grand stair + at its foot, lamps on top
        for (const [z, y0, h] of [[-0.3, top, 1.0], [6.25, 0, 1.2]]) {
          brickBox(B, K.brick, 0.62, h, 0.62, sx * 3.35, y0 + h / 2, z, { step: 0.225, faces: 'zx' });
          B.box('paint', K.stone, 0.74, 0.12, 0.74, sx * 3.35, y0 + h + 0.06, z, { r: 0.03 });
          pierLamp(B, sx * 3.35, y0 + h + 0.12, z);
          colC(B, sx * 3.35, y0, z, 0.74, h + 0.9, 0.74, ROOF);
        }
        // stone cheek along the stair side (x ±3 … ±3.3), sloping with the flight
        B.push(sx * 3.15, top / 2, 3.0, 0, Math.atan2(top, 6.0));
        B.box('paint', K.stone, 0.3, 0.3, Math.hypot(6, top) + 0.2, 0, 0.05, 0, { r: 0.03 });
        B.pop();
        // sack barrow + platform scale in the back corners of the stage
        B.push(sx * 7.6, top, -4.6, sx * 0.4);
        seg(B, 'metal', K.green, [-0.25, 0, 0.25], [-0.25, 1.2, -0.05], 0.05, 0.05); seg(B, 'metal', K.green, [0.25, 0, 0.25], [0.25, 1.2, -0.05], 0.05, 0.05);
        B.box('metal', K.iron, 0.6, 0.04, 0.3, 0, 0.02, 0.35, { r: 0.01 });
        for (const x of [-0.3, 0.3]) B.cyl('rubber', '#2a2c30', 0.15, 0.06, x, 0.15, 0.22, { rz: HP, seg: 10 });
        for (let k = 0; k < 2; k++) B.box('paint', mixc('#bda274', '#a88c5f', hash(k + sx)), 0.5, 0.3, 0.4, 0, 0.22 + k * 0.3, 0.12 - k * 0.05, { round: true, r: 0.1, rx: -0.25 });
        B.pop();
        B.col(sx * 7.6 - 0.45, top, -5.0, sx * 7.6 + 0.45, top + 1.1, -4.2);
      }
      // platform scale (the weigh-house kind) on the east corner, a notice frame on the west
      B.box('metal', K.green, 0.9, 0.12, 0.7, 8.25, top + 0.06, -6.35, { r: 0.02 });
      B.box('metal', K.green, 0.18, 1.1, 0.18, 8.25, top + 0.6, -6.75, { r: 0.02 });
      B.cyl('gloss', K.cream, 0.18, 0.06, 8.25, top + 1.25, -6.7, { rx: HP, seg: 16 });
      B.col(7.75, top, -6.85, 8.75, top + 1.3, -5.95);
      B.push(-5.6, top + 0.02, -6.97);
      B.box('wood', K.green, 1.3, 1.0, 0.06, 0, 1.2, 0.03, { r: 0.01 });
      B.box('paint', K.cream, 1.16, 0.86, 0.01, 0, 1.2, 0.065, { r: 0.005 });
      letters(B, 'NOTICE TO BOATMEN', { h: 0.07, x: 0, y: 1.5, z: 0.071, c: K.black, flat: true, wt: 0.22, track: 0.06 });
      for (let k = 0; k < 6; k++) pbox(B, NS('paint'), '#8a8578', 0.9 - (k % 3) * 0.2, 0.03, 0.004, -0.05, 1.36 - k * 0.1, 0.071);
      B.pop();
    },
  };
  // cottage garden kit (pos = garden centre, lawn level): picket fence + gate on the street side, veg beds, washing
  // line with sheets (cloth flags), beehive, water butt, rhubarb forcers, a watering can
  D.lockgate_garden = {
    desc: "Lock-keeper's back garden kit: white picket fence along +X with a gate gap, raised veg beds, a washing line of cloth, beehive, water butt, rhubarb forcers (fence + beds + hive collide).",
    params: { length: 'fence length (5.8)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 5.8;
      // picket fence on the +X edge (x = 4.9), gate gap z -0.8 … 0.4
      for (let z = -2.9; z <= 2.9; z += 0.16) { if (z > -0.8 && z < 0.4) continue; B.box('wood', K.white, 0.05, 0.85, 0.07, 4.9, 0.42, z, { r: 0.01 }); B.add(NS('wood'), tpl('picket', () => latheGeo([[0.04, 0], [0, 0.07]], 4)), K.white, 4.9, 0.85, z, {}); }
      for (const y of [0.25, 0.65]) for (const [z0, z1] of [[-2.95, -0.8], [0.4, 2.95]]) pbox(B, 'wood', K.white, 0.04, 0.07, z1 - z0, 4.86, y, (z0 + z1) / 2);
      B.col(4.8, 0, -2.95, 5.0, 0.92, -0.8, RAIL); B.col(4.8, 0, 0.4, 5.0, 0.92, 2.95, RAIL);
      // raised veg beds with rows of cabbages + beans on canes
      for (const [x, z] of [[1.5, -1.8], [1.5, 1.4]]) {
        B.box('wood', K.oak, 2.2, 0.3, 1.1, x, 0.15, z, { r: 0.02 });
        B.box(NS('paint'), K.mud, 2.1, 0.02, 1.0, x, 0.3, z, {});
        for (let k = 0; k < 6; k++) B.sph('foliage', mixc('#4f8a45', '#8fc46b', hash(k + x)), 0.16, x - 0.85 + k * 0.34, 0.4, z - 0.25, { ws: 7, hs: 5, sy: 0.7 });
        for (let k = 0; k < 4; k++) { cyl(B, NS('wood'), K.oakLt, 0.012, 1.5, x - 0.8 + k * 0.5, 1.0, z + 0.25, { seg: 4 }); B.sph(NS('foliage'), '#5ba257', 0.12, x - 0.8 + k * 0.5, 1.2, z + 0.25, { ws: 5, hs: 4, sy: 2.5 }); }
        B.col(x - 1.1, 0, z - 0.55, x + 1.1, 0.5, z + 0.55);
      }
      // washing line between two posts with sheets flapping (cloth flags, their own tint)
      for (const z of [-2.6, 2.6]) B.box('wood', K.oakLt, 0.08, 2.0, 0.08, -2.6, 1.0, z, { r: 0.015 });
      B.tube(NS('paint'), K.white, [P3(-2.6, 1.9, -2.6), P3(-2.6, 1.78, 0), P3(-2.6, 1.9, 2.6)], 0.008, { radial: 3 });
      for (const [z, c, w, h] of [[-1.7, '#f2eee6', 0.9, 0.8], [-0.6, '#9cc3dd', 0.7, 0.55], [0.5, '#f2eee6', 1.0, 0.9], [1.6, '#d9b35f', 0.5, 0.45]]) {
        B.push(-2.6, 1.8 - h / 2, z, HP, 0.06);
        B.box(NS('foliage'), c, w, h, 0.012, 0, 0, 0, { r: 0.004 });
        for (const sx of [-1, 1]) pbox(B, NS('wood'), K.oakLt, 0.02, 0.07, 0.03, sx * (w / 2 - 0.08), h / 2 + 0.01, 0);
        B.pop();
      }
      // beehive, water butt, rhubarb forcers
      B.box('wood', K.white, 0.5, 0.6, 0.5, 3.8, 0.35, 2.3, { r: 0.02 });
      for (let k = 0; k < 3; k++) B.box('wood', K.white, 0.56, 0.12, 0.56, 3.8, 0.7 + k * 0.12, 2.3, { r: 0.02 });
      B.add('paint', tpl('hiveRoof', () => extrudeGeo([[-0.34, 0], [0.34, 0], [0, 0.22]], 0.64, 0.01)), K.slate, 3.8, 1.04, 2.3, {});
      B.col(3.5, 0, 2.0, 4.1, 1.26, 2.6);
      cask(B, 3.9, 0, -2.4, { c: K.green });
      B.col(3.55, 0, -2.75, 4.25, 0.75, -2.05);
      for (const z of [-0.2, 0.3]) B.lathe('paint', '#a45a3c', [[0, 0], [0.2, 0], [0.18, 0.4], [0.12, 0.5], [0, 0.52]], -1.2, 0, z, { seg: 8 });
      waterCan(B, 0.2, 0, 0.1, 0.9);
    },
  };
  // enamel / cast signs for walls and posts (wall at z = 0, faces +Z): variant = which sign
  const ENAMEL = [
    ['NO MOORING', K.white, K.red], ['BEWARE OF THE LOCK', K.white, K.blue], ['DEAD SLOW', K.black, '#e8c84a'],
    ['TOWPATH', K.white, K.green], ['LOCK 2', K.black, K.white], ['NO SWIMMING', K.white, K.red], ['KEEP CLEAR', K.black, '#e8c84a'], ['BASIN', K.white, K.blue],
  ];
  D.lockgate_enamel = {
    desc: 'Enamel sign on a wall (wall at z = 0, pos.y = sign centre): variant 0 NO MOORING, 1 BEWARE OF THE LOCK, 2 DEAD SLOW, 3 TOWPATH, 4 LOCK 2, 5 NO SWIMMING, 6 KEEP CLEAR, 7 BASIN. post: true stands it on its own post (pos = ground).',
    params: { post: 'bool' }, variants: ENAMEL.length, mount: 'wall',
    build(B, o) {
      B.aoBase = null;
      const [txt, fg, bg] = ENAMEL[(o.variant ?? 0) % ENAMEL.length];
      const h = 0.13, W = textW(txt, 0.2, 0.1) * h + 0.24, y = o.post ? 1.6 : 0;
      if (o.post) { B.box('paint', K.black, 0.08, 1.9, 0.08, 0, 0.95, -0.06, { r: 0.015 }); colC(B, 0, 0, -0.06, 0.2, 1.9, 0.2, ROOF); }
      B.box('gloss', bg, W, 0.3, 0.02, 0, y, 0.01, { r: 0.03 });
      pbox(B, NS('gloss'), fg, W - 0.05, 0.25, 0.004, 0, y, 0.021);
      pbox(B, NS('gloss'), bg, W - 0.08, 0.22, 0.004, 0, y, 0.023);
      letters(B, txt, { h, x: 0, y: y - h / 2, z: 0.027, c: fg, flat: true, wt: 0.2, track: 0.1 });
      for (const sx of [-1, 1]) B.sph(NS('metal'), K.ironLt, 0.012, sx * (W / 2 - 0.05), y, 0.025, { ws: 4, hs: 3 });
    },
  };

  // brick cheek wall along the open side of a stone flight (local +X from the foot at (0,0,0) up to (run, rise); the
  // cheek stands just outside the flight's side face at local z = 0 and covers it down to the ground) + stone coping
  D.lockgate_cheek = {
    desc: 'Brick cheek wall with a sloping stone coping along the open side of a flight of steps (local +X from the foot up to (run, rise), cheek face at local z = 0 facing +Z; covers the flight\'s side). Non-colliding (the flight\'s own side is the wall).',
    params: { run: 'm', rise: 'm', up: 'coping height above the treads (0.25)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const run = o.run ?? 4, rise = o.rise ?? 1.3, up = o.up ?? 0.25, f = o.flip ? -1 : 1;
      const prof = [[0, -0.05], [run + 0.02, -0.05], [run + 0.02, rise + up], [0, up + 0.02]];
      B.add('paint', tpl(['cheek', run, rise, up].map(kf).join('|'), () => extrudeGeo(prof.map(([x, y]) => [x, y]), 0.08, 0.004)), K.brick, 0, 0, f * 0.04, { ry: HP, sx: 1 });
      for (let y = 0.3; y < rise + up - 0.05; y += 0.3) { const x0 = Math.max(0, ((y - up) / rise) * run); if (run - x0 > 0.2) pbox(B, NS('paint'), K.brickDk, run - x0, 0.012, 0.012, (x0 + run) / 2, y, f * 0.085); }
      B.push(run / 2, (rise + up * 2) / 2 + 0.04, f * 0.04, 0, 0, Math.atan2(rise, run));
      B.box('paint', K.stone, Math.hypot(run, rise) + 0.1, 0.1, 0.24, 0, 0, 0, { r: 0.02 });
      B.pop();
    },
  };
  // weeds + moss tufts along a wall foot (along +X from pos, wall at z = 0 behind, tufts toward +Z)
  D.lockgate_weeds = {
    desc: 'Weeds and moss along a wall foot / kerb: tufts of grass, dandelions, a buddleia sprig (along +X for length). Non-colliding.',
    params: { length: 'm (4)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 4, n = Math.max(2, Math.round(L * 1.6));
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * (L / n) + (hash(i + L) - 0.5) * 0.3, s = 0.5 + hash(i * 3.1 + L) * 0.7;
        B.add(NS('foliage'), tpl('tuft', () => { const g = new GB(); const c1 = cx3('#5d7a3c'), c2 = cx3('#8aa35a'); for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, bx = Math.cos(a) * 0.05, bz = Math.sin(a) * 0.05, tx = Math.cos(a) * 0.16, tz = Math.sin(a) * 0.16; const v0 = g.v(bx - bz * 0.3, 0, bz + bx * 0.3, Math.cos(a), 0.4, Math.sin(a), ...c1), v1 = g.v(bx + bz * 0.3, 0, bz - bx * 0.3, Math.cos(a), 0.4, Math.sin(a), ...c1), v2 = g.v(tx, 0.22, tz, Math.cos(a), 0.5, Math.sin(a), ...c2); g.tri(v0, v1, v2); } return g.geo(); }), 'white', x, 0, 0.06 + hash(i * 7) * 0.08, { s, ry: hash(i) * 6 });
        if (hash(i * 5.3) > 0.72) B.sph(NS('paint'), '#e8c84a', 0.025, x + 0.05, 0.18 * s, 0.1, { ws: 4, hs: 3 });
      }
      if (L > 3) { B.tube(NS('wood'), '#6b5a42', [P3(L * 0.7, 0, 0.05), P3(L * 0.7 + 0.1, 0.5, 0.15), P3(L * 0.7 + 0.2, 0.8, 0.3)], 0.015, { radial: 3 }); B.sph(NS('foliage'), '#a07ac0', 0.1, L * 0.7 + 0.22, 0.85, 0.32, { ws: 5, hs: 4, sy: 1.6 }); B.sph(NS('foliage'), '#5d7a3c', 0.14, L * 0.7 + 0.12, 0.62, 0.2, { ws: 5, hs: 4 }); }
    },
  };
  // paper bills pasted on a wall (wall at z = 0): coloured bills with printed-looking bars + a headline
  const BILLS = [['REGATTA', '#e9dcb8', '#8e2f2a'], ['TURF WAR', '#f0e6c8', '#2f4a3c'], ['LOCK CLOSED', '#e6e0cf', '#3a4a6a'], ['DANCE', '#efd9b0', '#6a2a5a'], ['BOATS FOR HIRE', '#e8e2d0', '#2c3a58']];
  D.lockgate_bills = {
    desc: 'Paper bills pasted on a wall (wall at z = 0, pos.y = bottom): 2–3 overlapping posters with headlines and print bars, a torn one (non-colliding).',
    params: { count: '2|3' }, variants: 5, mount: 'wall',
    build(B, o) {
      B.aoBase = null;
      const n = o.count ?? 3, v = o.variant ?? 0;
      for (let k = 0; k < n; k++) {
        const [t, bg, ink] = BILLS[(v + k) % BILLS.length], w = 0.6 + hash(k + v) * 0.15, h = 0.82, x = (k - (n - 1) / 2) * 0.62, y = 0.45 + h / 2 + (k % 2) * 0.12, z = 0.004 + k * 0.002;
        B.push(x, y, z, 0, 0, (hash(k * 3 + v) - 0.5) * 0.08);
        pbox(B, NS('paint'), bg, w, h, 0.003, 0, 0, 0);
        letters(B, t, { h: Math.min(0.1, (w - 0.08) / textW(t, 0.2, 0.08)), x: 0, y: h / 2 - 0.2, z: 0.003, c: ink, flat: true, wt: 0.2, track: 0.08 });
        pbox(B, NS('paint'), ink, w * 0.7, 0.2, 0.002, 0, 0.02, 0.003);
        for (let l = 0; l < 5; l++) pbox(B, NS('paint'), shade(ink, 1.3), w * (0.5 + hash(l + k) * 0.3), 0.022, 0.002, 0, -0.15 - l * 0.045, 0.003);
        B.pop();
      }
    },
  };

  // ================================================================================================ THE DRY DOCK
  // The Long Stages slice (layout.js DOCK / LS): the canal company's dry dock with a working boat up on its keel blocks,
  // the crane staging over it, the gates at its mouth, the boatbuilder's shed and yard east of it.
  //
  // The dock's dressing. pos = the head's top centre (coping level, the dock's centre line), the chamber running off
  // along local -X for `len` to the mouth cheeks; top half-width hw, floor F, altar ledges at A (aw wide) along both
  // sides, head steps ±st wide climbing +X to the head. Copings, altar nosings, drainage channels + the sump grating,
  // puddles and silt, keel blocks under the boat (bx0 … bx1, local), breast shores, the head capstans + DRY DOCK boards,
  // iron handrails down both sides of the head steps (rail colliders), the mouth arch in the west wall (+ its fill).
  D.lockgate_drydock = {
    desc: 'Dry dock dressing (pos = head top centre, chamber along local -X): stone copings round the edges, altar nosings, drainage channels + sump, puddles, keel blocks + shores under the boat, head capstans, DRY DOCK boards, handrails down the head steps (rail colliders), the arch over the mouth in the boundary wall.',
    params: { len: 'm (21)', hw: 'top half-width (4)', steps: 'head steps half-width (1.5)', boat: '[x0, x1] local (keel blocks)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const len = o.len ?? 21, hw = o.hw ?? 4, F = -1.9, A = -0.95, aw = 0.6, st = o.steps ?? 1.5, run = 4.5;
      // copings: 0.45 m stones along both long edges and the head (not over the head steps), a bull-nose over the edge
      const cope = (x0, x1, z, dir) => {
        const n = Math.max(1, Math.round((x1 - x0) / 0.95));
        for (let i = 0; i < n; i++) {
          const a = x0 + ((x1 - x0) * i) / n, b = x0 + ((x1 - x0) * (i + 1)) / n - 0.015, c = mixc(K.stone, K.stoneDk, hash(i * 2.3 + z) * 0.6);
          B.box('paint', c, b - a, 0.05, 0.46, (a + b) / 2, 0.02, z + dir * 0.2, { r: 0.015 });
        }
        pbox(B, NS('paint'), K.stoneDk, x1 - x0, 0.1, 0.05, (x0 + x1) / 2, -0.03, z - dir * 0.03);
      };
      cope(-len, 0, hw, 1); cope(-len, 0, -hw, -1);
      B.push(0, 0, 0, HP); cope(-hw, -st - 0.05, 0, 1); cope(st + 0.05, hw, 0, 1); B.pop();
      // altar ledges: a stone nosing along each, a dark damp band at the foot of the walls
      for (const s of [-1, 1]) {
        pbox(B, 'paint', K.stoneDk, len - 0.6, 0.06, 0.16, -len / 2 + 0.3, A + 0.02, s * (hw - aw + 0.08));
        pbox(B, NS('paint'), '#3c4238', len - 0.6, 0.35, 0.02, -len / 2 + 0.3, F + 0.17, s * (hw - aw - 0.009));
        pbox(B, NS('paint'), '#3c4238', len - 0.6, 0.2, 0.02, -len / 2 + 0.3, A + 0.1, s * (hw - 0.009));
      }
      // floor: drainage channels (grated) along both sides, the sump grating by the head steps, puddles, silt, weed
      for (const s of [-1, 1]) {
        pbox(B, NS('paint'), '#23282a', len - 1.2, 0.012, 0.3, -len / 2, F + 0.006, s * (hw - aw - 0.28));
        for (let x = -len + 0.9; x < -0.5; x += 0.22) pbox(B, NS('metal'), K.iron, 0.04, 0.014, 0.32, x, F + 0.01, s * (hw - aw - 0.28));
      }
      B.box('metal', K.iron, 1.0, 0.03, 1.0, -run - 0.8, F + 0.012, -2.6, { r: 0.01 });
      for (let k = -0.4; k <= 0.41; k += 0.1) pbox(B, NS('metal'), '#1a1c1e', 0.03, 0.035, 0.9, -run - 0.8 + k, F + 0.014, -2.6);
      for (const [x, z, w, d] of [[-7.2, 1.9, 2.4, 0.9], [-12.5, -2.2, 1.6, 0.7], [-18.8, 2.4, 1.9, 0.6], [-5.6, -1.2, 1.2, 0.8]]) B.box(NS('gloss'), K.puddle, w, 0.008, d, x, F + 0.004, z, { round: true, r: 0.3 });
      for (let k = 0; k < 14; k++) pbox(B, NS('paint'), ['#6d6450', '#58603f', '#7a6f58'][k % 3], 0.3 + hash(k) * 0.6, 0.02, 0.2 + hash(k * 3) * 0.3, -len + 1.2 + hash(k * 5) * (len - 3), F + 0.01, (hash(k * 7) - 0.5) * 2 * (hw - aw - 0.4), { ry: hash(k * 11) * 3 });
      // keel blocks under the boat (the hull block sits on them) + breast shores at its bilges, blocks + wedges stacked
      // spare against the head wall
      const [bx0, bx1] = o.boat || [-17, -11];
      for (let x = bx0 + 0.5; x <= bx1 - 0.3; x += 1.3) {
        B.box('wood', K.timber, 0.4, 0.22, 1.4, x, F + 0.11, 0, { r: 0.02 });
        B.box('wood', K.timberLt, 0.34, 0.18, 1.1, x, F + 0.31, 0, { r: 0.02 });
        for (const s of [-1, 1]) { B.push(x, F, s * 1.35, 0, -s * 0.45); pbox(B, 'wood', K.oak, 0.16, 0.95, 0.14, 0, 0.42, 0); B.pop(); }
      }
      for (let k = 0; k < 3; k++) B.box('wood', mixc(K.timber, K.timberLt, hash(k)), 1.2, 0.22, 0.4, -run - 1.4, F + 0.11 + k * 0.22, 2.5 + (k % 2) * 0.1, { r: 0.02, ry: (hash(k * 3) - 0.5) * 0.3 });
      // head: capstans either side of the steps (back from the edge), the dock's boards on the side walls by the head
      for (const s of [-1, 1]) {
        B.push(2.2, 0, s * 3.2);
        B.lathe('gloss', K.black, [[0, 0], [0.34, 0], [0.34, 0.08], [0.22, 0.14], [0.2, 0.55], [0.26, 0.62], [0.26, 0.7], [0, 0.72]], 0, 0, 0, { seg: 12 });
        for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.3; B.box(NS('metal'), K.ironLt, 0.06, 0.06, 0.42, Math.cos(a) * 0.36, 0.62, Math.sin(a) * 0.36, { ry: -a }); }
        B.pop();
        colC(B, 2.2, 0, s * 3.2, 0.6, 0.72, 0.6, ROOF);
        B.push(-run - 1.6, -0.5, s * (hw - 0.01), s > 0 ? PI : 0);
        boardSign(B, s > 0 ? 'No 1 DRY DOCK' : 'KEEP CLEAR OF THE GATES', 0, 0, { h: 0.12, board: K.white, c: K.black, bd: 0.02, pad: 0.07 });
        B.pop();
      }
      // the mouth: the arch ring + fill over the opening in the boundary wall (wall face x = -len, facing +X), both faces
      for (const [xf, dir] of [[-len, 1], [-len - 1, -1]]) {
        B.push(xf, 0, 0, dir > 0 ? HP : -HP);
        const R = 2.94, cy = -0.04, sa = Math.asin((1.0 - cy) / R);
        B.add('paint', voussoirGeo('dockArch', 0, cy, R, R + 0.5, sa, PI - sa, 30, 0.06), 'white', 0, 0, 0, {});
        B.add('paint', tpl('dockFill', () => { const p = [[2.76, 2.91], [-2.76, 2.91], [-2.76, 1.0]]; for (let i = 0; i <= 16; i++) { const a = PI - sa - (i / 16) * (PI - 2 * sa); p.push([Math.cos(a) * R, cy + Math.sin(a) * R]); } p.push([2.76, 1.0]); return extrudeGeo(p, 0.06, 0.002); }), K.brickDk, 0, 0, 0, { ry: -HP });
        B.pop();
      }
      B.add(NS('paint'), barrelGeo('dockVault', -2.75, 2.75, (z) => -0.04 + Math.sqrt(Math.max(0, 2.94 * 2.94 - z * z)), 1.0, 16, K.blueDk), 'white', -len - 0.5, 0, 0, {});
    },
  };

  // The dock's mitre gates (pos = the gate line at coping level, local +X upstream = the dock arm, the dock downstream
  // at -X, mouth z ±2.75): black leaves on a brick cill (0.4 over the dock floor), balance beams swung back over both
  // docksides (waist-high cover), the walkway on top flush with the docksides (the level carries it) with its handrail
  // on the arm side (rail collider: nobody walks off into the arm), the arm's leaks spraying through into the dry dock.
  D.lockgate_dockgate = {
    desc: 'Dry dock mitre gates (pos = gate line at coping level, local +X = the dock arm upstream, the dock downstream): leaves on a brick cill, balance beams over both docksides (collide, waist high), walkway edge boards + handrail on the arm side (rail), leaks into the dock. The leaves collide from the dock floor up to the walkway.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const F = -1.9, yb = F + 0.4, yt = -0.25;
      for (const side of [-1, 1]) { gateLeaf(B, side, yb, yt); balanceBeam(B, side, 4.4, 1.2); }
      brickBox(B, K.blue, 1.0, yb - F, 5.5, -0.35, (yb + F) / 2, 0, { mat: 'paint', step: 0.225 });
      B.col(-0.95, F, -LOCK.half, 0.05, yt, LOCK.half);
      colC(B, LOCK.heelX, 0, -LOCK.half, 0.36, 1.15, 0.36, ROOF);
      colC(B, LOCK.heelX, 0, LOCK.half, 0.36, 1.15, 0.36, ROOF);
      for (const sx of [-1, 1]) pbox(B, 'wood', sx > 0 ? K.white : K.timber, 0.06, 0.26, 5.5, sx * 0.63, -0.13, 0);
      for (let z = -2.4; z <= 2.41; z += 0.6) pbox(B, NS('wood'), K.timberLt, 1.1, 0.025, 0.07, 0, 0.012, z);
      const rx = 0.62;
      for (const z of [-2.55, -1.3, 0, 1.3, 2.55]) { B.cyl('gloss', K.white, 0.026, 1.0, rx, 0.5, z, { seg: 6 }); B.cyl(NS('gloss'), K.white, 0.05, 0.03, rx, 0.015, z, { seg: 8 }); }
      B.cyl('gloss', K.white, 0.03, 5.2, rx, 1.0, 0, { rx: HP, seg: 8 });
      B.cyl(NS('gloss'), K.white, 0.02, 5.2, rx, 0.55, 0, { rx: HP, seg: 6 });
      B.col(rx - 0.05, 0, -2.75, rx + 0.05, 1.05, 2.75, RAIL);
      // the arm's water leaking through the mitre and the heel posts into the drained dock, a puddle along the cill
      for (const [xs, ys, zj, r] of [[-0.4, -0.9, 0.05, 0.045], [-0.98, yb + 0.1, -1.6, 0.032], [-0.98, yb + 0.1, 1.9, 0.028]]) {
        const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(P3(xs - t * 0.5, ys - t * t * (ys - F), zj)); }
        B.tube(NS('gloss'), K.foam, pts, (t) => r * (1 + t * 0.8), { radial: 6 });
        B.add(NS('paint'), tpl('splash', () => latheGeo([[0, 0.02], [0.18, 0.015], [0.34, 0.0]], 8)), K.foam, pts[8][0], F + 0.012, zj, { s: 1 + r * 6 });
      }
      pbox(B, NS('gloss'), K.puddle, 0.8, 0.01, 5.0, -1.3, F + 0.006, 0.1);
      pbox(B, NS('paint'), '#233029', 0.02, yb - F - 0.05, 5.4, -0.86, (yb + F) / 2, 0);
      B.push(LOCK.heelX - 0.2, 0.62, -LOCK.half, -HP);
      boardSign(B, 'DOCK GATES', 0, 0, { h: 0.08, board: K.white, c: K.black, bd: 0.012, pad: 0.04 });
      B.pop();
    },
  };

  // The crane staging (pos = its centre at ground level; deck x ±2.5, z ±5.5, top 1.3; the span over the dock z ±4
  // is a thin level deck, the landings on the docksides solid). Timber fascias + joists, trestle bents on the altar
  // ledges (posts collide), iron handrails along the span (rail colliders), the landings' boarded cribs, stair strings,
  // a lamp on the north-east post, the dock's name board facing up the yard.
  D.lockgate_staging = {
    desc: 'Timber crane staging over the dry dock (pos = centre at ground; deck x ±2.5, z ±5.5 at 1.3; span z ±4 over the dock, the landings solid): fascias, joists, trestle bents on the altars (posts collide), handrails along the span (rail), boarded landing cribs, stair strings for the flights off the north (x -2.5…0.5) and south (x -0.5…2.5) ends, lamp, name board.',
    params: { hw: 'dock top half-width (4)', half: '[x, z] deck half extents ([2.5, 5.5])' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const [hx, hz] = o.half || [2.5, 5.5], hw = o.hw ?? 4, top = 1.3, A = -0.95;
      // fascias along the span, plank ends, joists under it
      for (const s of [-1, 1]) {
        B.box('wood', K.timber, 0.14, 0.34, 2 * hw + 0.2, s * (hx + 0.06), top - 0.16, 0, { r: 0.02 });
        for (let z = -hw + 0.3; z < hw; z += 1.6) pbox(B, NS('metal'), K.iron, 0.02, 0.26, 0.08, s * (hx + 0.135), top - 0.16, z);
      }
      for (let x = -hx + 0.3; x < hx; x += 0.6) pbox(B, NS('wood'), K.timberLt, 0.14, 0.2, 2 * hw, x, top - 0.4, 0);
      for (const s of [-1, 1]) pbox(B, 'wood', K.timber, 2 * hx, 0.3, 0.3, 0, top - 0.45, s * (hw - 0.15));
      // trestle bents on the altar ledges: posts, cap, cross braces
      for (const s of [-1, 1]) {
        const z = s * (hw - 0.3);
        for (const x of [-hx + 0.25, 0, hx - 0.25]) { B.box('wood', K.timber, 0.26, top - 0.45 - A, 0.26, x, (A + top - 0.45) / 2, z, { r: 0.02 }); colC(B, x, A, z, 0.28, top - 0.3 - A, 0.28); }
        for (const [a, b] of [[-hx + 0.25, 0], [0, hx - 0.25]]) { seg(B, 'wood', K.timberLt, [a, A + 0.2, z + s * 0.05], [b, top - 0.6, z + s * 0.05], 0.1, 0.12); seg(B, 'wood', K.timberLt, [b, A + 0.2, z - s * 0.05], [a, top - 0.6, z - s * 0.05], 0.1, 0.12); }
        pbox(B, NS('metal'), K.iron, 2 * hx, 0.04, 0.3, 0, A + 0.02, z);
      }
      // handrails along the span (over the 3.2 m drop into the dock), a little onto each landing
      for (const s of [-1, 1]) {
        const x = s * (hx - 0.05), z0 = -hw - 0.4, z1 = hw + 0.4;
        for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 6) { B.box('wood', K.timber, 0.1, 1.05, 0.1, x, top + 0.52, z, { r: 0.015 }); }
        B.box('wood', K.timberLt, 0.1, 0.1, z1 - z0 + 0.1, x, top + 1.02, 0, { r: 0.02 });
        pbox(B, NS('wood'), K.timberLt, 0.06, 0.08, z1 - z0, x, top + 0.55, 0);
        B.col(x - 0.06, top, z0 - 0.05, x + 0.06, top + 1.08, z1 + 0.05, RAIL);
      }
      // the landings: boarded cribs (the level block is the solid), corner posts
      for (const s of [-1, 1]) {
        const z0 = s * hw, z1 = s * hz, zc = (z0 + z1) / 2, dz = Math.abs(z1 - z0);
        for (const x of [-hx, hx]) for (let y = 0.12; y < top; y += 0.22) pbox(B, NS('wood'), shade(K.timber, 0.8), 0.012, 0.02, dz, x + Math.sign(x) * 0.006, y, zc);
        for (const x of [-hx + 0.08, hx - 0.08]) B.box('wood', K.timber, 0.2, top + 0.06, 0.2, x, (top + 0.06) / 2, z1 - s * 0.08, { r: 0.02 });
      }
      // stair strings: the north flight (x -2.5 … 0.5) off the +Z end, the south one (x -0.5 … 2.5) off the -Z end
      for (const [xa, xb, s] of [[-hx, 0.5, 1], [-0.5, hx, -1]]) for (const x of [xa, xb]) {
        B.push(x, top / 2 - 0.08, s * (hz + 1.6), 0, 0, 0); B.push(0, 0, 0, 0, s * Math.atan2(top, 3.2)); pbox(B, 'wood', K.timber, 0.08, 0.3, Math.hypot(3.2, top) + 0.1, 0, 0, 0); B.pop(); B.pop();
      }
      // lamp on the north-east corner post, the name board on the north landing's end facing up the yard
      pierLamp(B, hx - 0.08, top + 0.06, hz - 0.08);
      colC(B, hx - 0.08, top, hz - 0.08, 0.3, 1.0, 0.3, ROOF);
      B.push(1.5, 0.62, hz + 0.01);
      boardSign(B, 'LOCKGATE CANAL Co.  No 1 DRY DOCK', 0, 0, { h: 0.09, board: K.green, c: K.cream, border: K.cream, bd: 0.02, w: 1.9 });
      B.pop();
    },
  };

  // The boatbuilder's shed (pos = the level block's centre at ground; W x Dd x Hh, weatherboard walls in the level) and
  // its loading bay on the -X side (the level carries the bay: x -W/2 - bay … -W/2, top 1.3): corner posts, tarred
  // plinth, pitched slate roof (ridge along X, collides), big doors onto the bay (one open, a hull's stem inside), the
  // loft door + a hoist beam over the bay with a bundle of planks slung, the bay's canopy on two posts (collide, top
  // off-limits), windows, the painted name board facing up the yard (+Z), stove pipe, planks leaning on the -Z wall.
  D.lockgate_boatshed = {
    desc: "Boatbuilder's shed dressing (pos = the level block centre; W x Dd x Hh) + its loading bay on -X (bay width `bay`, top 1.3): corner posts, plinth, slate roof (collides), double doors onto the bay, loft door + hoist beam with slung planks, bay canopy on posts (collide; roof off-limits), windows, name board on +Z, stove pipe, planks leaning on -Z.",
    params: { W: 'm (9)', Dd: 'm (9)', Hh: 'm (4.4)', bay: 'm (3.5)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = o.W ?? 9, Dd = o.Dd ?? 9, Hh = o.Hh ?? 4.4, bay = o.bay ?? 3.5, bt = 1.3, tar = '#3a2f28';
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('wood', tar, 0.2, Hh, 0.2, sx * (W / 2 + 0.02), Hh / 2, sz * (Dd / 2 + 0.02), { r: 0.02 });
      for (let side = 0; side < 4; side++) onFace(B, W, Dd, side, (L) => {
        B.box('paint', K.brickDk, L + 0.04, 0.4, 0.05, 0, 0.2, 0.025, { r: 0.01 });
        B.box('wood', tar, L + 0.1, 0.22, 0.06, 0, Hh - 0.11, 0.03, { r: 0.01 });
      });
      // roof: ridge along X, gables at ±X; stove pipe
      slateRoof(B, -W / 2, W / 2, -Dd / 2, Dd / 2, Hh, 2.1, { wall: tar, ov: 0.35 });
      B.col(-W / 2 - 0.4, Hh, -Dd / 2 - 0.45, W / 2 + 0.4, Hh + 2.2, Dd / 2 + 0.45, ROOF);
      B.cyl('metal', '#2a2c30', 0.1, 1.6, W / 2 - 1.6, Hh + 1.3, -Dd / 4, { seg: 8 });
      B.lathe('metal', '#2a2c30', [[0.18, 0], [0.2, 0.08], [0, 0.22]], W / 2 - 1.6, Hh + 2.1, -Dd / 4, { seg: 8 });
      // -X face (onto the bay): big doors (one leaf swung open, the stem of a hull on the stocks inside), loft door,
      // hoist beam out over the bay with a sling of planks
      onFace(B, W, Dd, 3, () => {
        B.push(0, bt, 0);
        pbox(B, NS('paint'), '#141517', 3.4, 2.9, 0.012, 0.3, 1.45, 0.006);
        B.box('wood', K.green, 1.7, 2.85, 0.08, -0.55, 1.43, 0.06, { r: 0.012 });
        for (let k = -0.7; k <= 0.71; k += 0.28) pbox(B, NS('paint'), shade(K.green, 0.78), 0.015, 2.8, 0.015, -0.55 + k, 1.43, 0.105);
        B.box('wood', K.green, 0.08, 2.85, 1.7, 2.0 + 0.04, 1.43, 0.85, { r: 0.012 });
        B.pop();
        takingDoor(B, 0.3, Hh + 0.3, 1.3, 1.2, { c: K.green, open: false });
        B.box('wood', K.timberLt, 0.26, 0.3, 2.6, 0.3, Hh + 1.75, 1.3, { r: 0.03 });
        B.cyl('metal', K.iron, 0.14, 0.07, 0.3, Hh + 1.52, 2.4, { rz: HP, seg: 10 });
        B.tube(NS('metal'), K.ironLt, [P3(0.3, Hh + 1.5, 2.45), P3(0.3, Hh + 0.5, 2.45)], 0.014, { radial: 4 });
        B.tor(NS('metal'), K.iron, 0.09, 0.02, 0.3, Hh + 0.42, 2.45, { rs: 4, ts: 8, arc: PI * 1.3, rz: -0.6 });
      });
      // the open door leaf stands out across the bay's back (collides: cover on the bay)
      B.col(-W / 2 - 1.72, bt, 1.98, -W / 2, bt + 2.85, 2.1);
      // the bay's canopy (boarded lean-to off the wall) on two posts at the bay's outer edge
      const cx0 = -W / 2 - bay + 0.15;
      B.push((cx0 - W / 2) / 2, 3.72, 0, 0, 0, 0.09);
      B.box('wood', K.timberLt, W / 2 - cx0 + 0.3, 0.1, Dd - 0.6, 0, 0, 0, { r: 0.02 });
      for (let z = -Dd / 2 + 0.6; z < Dd / 2 - 0.4; z += 0.4) pbox(B, NS('wood'), shade(K.timberLt, 0.8), W / 2 - cx0 + 0.3, 0.02, 0.03, 0, -0.06, z);
      B.pop();
      for (const s of [-1, 1]) {
        B.box('wood', K.timber, 0.2, 3.58 - bt, 0.2, cx0, bt + (3.58 - bt) / 2, s * 3.8, { r: 0.02 });
        seg(B, 'wood', K.timber, [cx0, 3.0, s * 3.8], [cx0 + 0.9, 3.66, s * 3.8], 0.1, 0.12);
        colC(B, cx0, bt, s * 3.8, 0.24, 3.58 - bt, 0.24);
      }
      B.col(cx0 - 0.25, 3.55, -Dd / 2 + 0.3, -W / 2, 4.0, Dd / 2 - 0.3, ROOF);
      for (const z of [-1.8, 1.8]) { cyl(B, 'metal', K.iron, 0.012, 0.3, cx0 + 1.2, 3.5, z, { seg: 4 }); lantern(B, cx0 + 1.2, 2.72, z, 0.75); }
      // +Z face (up the yard, toward mid): name board, windows, a small door; -Z face: windows, planks leaning on it
      onFace(B, W, Dd, 0, () => {
        boardSign(B, 'J. PEARCE & SONS  BOATBUILDERS', 0, 3.55, { h: 0.26, board: K.green, c: K.cream, border: K.cream, bd: 0.04, w: 8.2 });
        for (const x of [-2.6, 0.2, 2.9]) { pbox(B, NS('gloss'), K.glass, 1.1, 0.9, 0.02, x, 1.9, 0.01); for (const [dx, dy, w, h] of [[0, 0.47, 1.2, 0.07], [0, -0.47, 1.2, 0.07], [-0.57, 0, 0.07, 0.9], [0.57, 0, 0.07, 0.9], [0, 0, 1.1, 0.04], [0, 0, 0.04, 0.9]]) pbox(B, 'paint', K.white, w, h, 0.05, x + dx, 1.9 + dy, 0.025); }
      });
      onFace(B, W, Dd, 2, () => {
        for (const x of [-2.4, 2.4]) { pbox(B, NS('gloss'), K.glass, 1.0, 0.8, 0.02, x, 2.0, 0.01); pbox(B, 'paint', K.white, 1.1, 0.07, 0.05, x, 2.43, 0.025); pbox(B, 'paint', K.white, 1.1, 0.07, 0.05, x, 1.58, 0.025); }
        for (let k = 0; k < 7; k++) { B.push(-3.6 + k * 0.5 + hash(k) * 0.2, 0, 0.38, 0, -0.14 - hash(k * 3) * 0.06); B.box('wood', mixc(K.oakLt, '#c9a56f', hash(k * 5)), 0.26, 2.6 + hash(k * 7) * 0.6, 0.05, 0, 1.4, 0, { r: 0.01 }); B.pop(); }
        B.col(-3.9, 0, 0.1, -0.3, 2.2, 0.62);
      });
      onFace(B, W, Dd, 1, () => { plankDoor(B, 1.5, 0, 0.95, 2.1, K.green, { frame: K.white }); pbox(B, NS('gloss'), K.glass, 1.0, 0.8, 0.02, -2.0, 2.0, 0.01); pbox(B, 'paint', K.white, 1.1, 0.07, 0.05, -2.0, 2.43, 0.025); });
      // the bay: edge beam along its outer face
      pbox(B, 'wood', K.timber, 0.1, 0.24, Dd - 1, -W / 2 - bay - 0.03, bt - 0.12, 0);
    },
  };

  // Stickered timber: variant 0 = oak boards in a stickered stack on bearers (3.4 x 1.1 x 1.35); 1 = elm butts (round
  // logs) chocked in a pile (3 x 1.6 x 1.1); 2 = boards standing in an A-frame rack (2.6 x 1.2 x 2.2). All collide.
  D.lockgate_timber = {
    desc: 'Boatyard timber (collides): variant 0 = stickered oak boards on bearers (3.4 x 1.1 x 1.35); 1 = a chocked pile of elm butts (3 x 1.6 x 1.1); 2 = boards standing in an A-frame rack (2.6 x 1.2 x 2.2).',
    params: {}, variants: 3, mount: 'ground',
    build(B, o) {
      const v = (o.variant ?? 0) % 3;
      if (v === 0) {
        for (const x of [-1.3, 0, 1.3]) B.box('wood', K.timber, 0.14, 0.14, 1.2, x, 0.07, 0, { r: 0.02 });
        for (let j = 0; j < 9; j++) {
          const y = 0.17 + j * 0.13, n = 4;
          for (let i = 0; i < n; i++) B.box('wood', mixc(K.oakLt, '#c9a56f', hash(i * 3 + j)), 3.4 - (j % 3) * 0.08, 0.07, 0.25, ((j % 2) - 0.5) * 0.06, y, -0.405 + i * 0.27, { r: 0.008 });
          if (j < 8) for (const x of [-1.3, 0, 1.3]) pbox(B, NS('wood'), K.timberLt, 0.04, 0.06, 1.12, x, y + 0.065, 0);
        }
        B.col(-1.72, 0, -0.56, 1.72, 1.36, 0.56);
        B.blob(3.8, 1.5);
      } else if (v === 1) {
        for (const [y, zs] of [[0.3, [-0.55, 0, 0.55]], [0.78, [-0.28, 0.28]]]) for (const z of zs) {
          const r = 0.27 + hash(z * 7 + y) * 0.04;
          B.cyl('wood', '#6b5a48', r, 3.0 - hash(z + y) * 0.3, 0, y, z, { rz: HP, seg: 10 });
          for (const s of [-1, 1]) B.cyl(NS('wood'), '#c8a67a', r - 0.03, 0.01, s * (1.5 - hash(z + y) * 0.15), y, z, { rz: HP, seg: 10 });
        }
        for (const s of [-1, 1]) B.box('wood', K.timber, 0.3, 0.2, 0.3, s * 1.0, 0.1, s * 0.85, { r: 0.03 });
        B.col(-1.5, 0, -0.84, 1.5, 1.08, 0.84);
        B.blob(3.4, 2.0);
      } else {
        for (const s of [-1, 1]) { seg(B, 'wood', K.timber, [s * 1.2, 0, -0.55], [s * 1.2, 2.1, 0], 0.12, 0.12); seg(B, 'wood', K.timber, [s * 1.2, 0, 0.55], [s * 1.2, 2.1, 0], 0.12, 0.12); }
        B.box('wood', K.timber, 2.6, 0.12, 0.12, 0, 2.1, 0, { r: 0.02 });
        for (let k = 0; k < 9; k++) { const s = k % 2 ? 1 : -1, x = -1.0 + (k >> 1) * 0.5 + hash(k) * 0.1; B.push(x, 0, s * 0.42, 0, s * -0.23); B.box('wood', mixc(K.oakLt, '#c9a56f', hash(k * 3)), 0.28, 2.05 - hash(k) * 0.3, 0.05, 0, 1.0, 0, { r: 0.01 }); B.pop(); }
        B.col(-1.3, 0, -0.6, 1.3, 2.15, 0.6);
        B.blob(3.0, 1.6);
      }
    },
  };

  // Steam chest: a long plank-bending box on two trestles, a little vertical boiler with its stove pipe at one end and
  // the steam pipe across, bent planks cooling on the ground (collides: cover)
  D.lockgate_steamchest = {
    desc: 'Plank-bending steam chest (along X, 4.4 m): timber box on trestles (top 1.35), vertical boiler + stove pipe at +X, steam pipe, bent planks at its foot (collides).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      for (const x of [-1.5, 1.2]) for (const s of [-1, 1]) seg(B, 'wood', K.timber, [x, 0, s * 0.45], [x, 0.85, s * 0.1], 0.1, 0.1);
      B.box('wood', '#5a4636', 4.0, 0.52, 0.55, -0.3, 1.1, 0, { r: 0.03 });
      for (let x = -2.0; x <= 1.5; x += 0.7) pbox(B, 'metal', K.iron, 0.05, 0.56, 0.6, x, 1.1, 0);
      B.box('wood', K.timberLt, 0.1, 0.5, 0.5, -2.32, 1.1, 0, { r: 0.02 });
      B.lathe('gloss', K.black, [[0, 0], [0.34, 0], [0.34, 1.1], [0.28, 1.25], [0, 1.28]], 2.2, 0, 0, { seg: 12 });
      B.box('metal', K.iron, 0.3, 0.26, 0.05, 2.2, 0.35, 0.34, { r: 0.02 });
      B.box(NS('glow'), '#ff9a4a', 0.22, 0.16, 0.02, 2.2, 0.35, 0.37, { glow: 0.8 });
      B.cyl('metal', '#2a2c30', 0.07, 1.6, 2.2, 2.0, 0, { seg: 6 });
      B.tube('metal', K.ironLt, [P3(2.0, 1.15, 0), P3(1.75, 1.2, 0), P3(1.7, 1.2, 0)], 0.035, { radial: 5 });
      for (let k = 0; k < 4; k++) B.tube('wood', mixc(K.oakLt, '#c9a56f', hash(k)), [P3(-1.8, 0.05, 0.7 + k * 0.1), P3(-0.4, 0.22, 0.72 + k * 0.1), P3(1.0, 0.05, 0.7 + k * 0.1)], 0.03, { radial: 4 });
      B.col(-2.4, 0, -0.5, 1.75, 1.38, 0.5);
      B.col(1.8, 0, -0.38, 2.6, 1.3, 0.38);
      B.col(2.1, 1.3, -0.1, 2.3, 2.8, 0.1, ROOF);
      B.blob(5.4, 1.6);
    },
  };

  // A wooden joey boat on the stocks, half planked (keel on blocks, oak frames, the lower strakes on, a plank clamped
  // ready), 5.2 m long along X; its hull collides (cover)
  D.lockgate_stocks = {
    desc: 'A wooden day boat on the building stocks (5.2 m along X): keel on blocks, oak frames, the lower strakes planked, stem + sternpost, a plank clamped on (hull collides: cover).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const L = 5.2, hb = 0.85, keelY = 0.42;
      for (const x of [-1.8, 0, 1.8]) B.box('wood', K.timber, 0.4, keelY - 0.02, 1.0, x, (keelY - 0.02) / 2, 0, { r: 0.02 });
      B.box('wood', K.oak, L, 0.18, 0.16, 0, keelY + 0.09, 0, { r: 0.02 });
      const half = (x) => hb * Math.pow(Math.max(0, 1 - Math.pow((2 * x) / L, 2)), 0.55);
      for (let x = -L / 2 + 0.45; x < L / 2 - 0.3; x += 0.42) {
        const w = half(x);
        for (const s of [-1, 1]) B.tube('wood', K.oakLt, [P3(x, keelY + 0.15, 0), P3(x, keelY + 0.3, s * w * 0.8), P3(x, keelY + 0.9, s * w), P3(x, keelY + 1.25, s * w * 1.02)], 0.035, { radial: 4 });
      }
      for (const [x, s] of [[-L / 2, -1], [L / 2, 1]]) seg(B, 'wood', K.oak, [x - s * 0.1, keelY + 0.1, 0], [x + s * 0.25, keelY + 1.35, 0], 0.14, 0.16);
      // the lower strakes on (two each side), a new plank clamped at the turn of the bilge
      for (const s of [-1, 1]) for (const [y0, k] of [[0.25, 0.82], [0.48, 0.95]]) {
        const pts = []; for (let i = 0; i <= 10; i++) { const x = -L / 2 + 0.1 + ((L - 0.2) * i) / 10; pts.push(P3(x, keelY + y0 + 0.1 * Math.pow((2 * x) / L, 2), s * half(x) * k)); }
        B.tube('wood', mixc(K.oakLt, '#c9a56f', y0), pts, 0.07, { radial: 4 });
      }
      for (const x of [-0.8, 0.9]) { B.box('metal', K.iron, 0.08, 0.3, 0.22, x, keelY + 0.95, hb + 0.08, { r: 0.01 }); }
      B.col(-L / 2 - 0.1, 0, -hb - 0.05, L / 2 + 0.1, keelY + 1.25, hb + 0.05);
      B.blob(L + 0.6, 2.2);
    },
  };

  // The dockyard's weigh house at the head of the yard (pos = centre of its 3 x 2.4 footprint; the bay window and door
  // face +Z, up the bridge street): brick, slate hipped roof (collides, off-limits), a cast-iron weighbridge plate set in
  // the setts in front, WEIGH HOUSE board, a lamp bracket. Collides (cover).
  D.lockgate_weighhouse = {
    desc: 'Dockyard weigh house (3 x 2.4 x 2.5 brick hut, pos = footprint centre, front +Z): bay window + door, slate roof (collides, off-limits), WEIGH HOUSE board, lamp, the weighbridge plate flush in the setts in front (non-colliding). Collides.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const W = 3.0, Dd = 2.4, Hh = 2.5;
      brickBox(B, K.brick, W, Hh, Dd, 0, Hh / 2, 0, { step: 0.225, faces: 'zx' });
      for (let side = 0; side < 4; side++) onFace(B, W, Dd, side, (L) => { B.box('paint', K.stone, L + 0.06, 0.12, 0.06, 0, Hh - 0.06, 0.03, { r: 0.015 }); B.box('paint', K.blue, L + 0.02, 0.35, 0.03, 0, 0.175, 0.015, { r: 0.01 }); });
      onFace(B, W, Dd, 0, () => {
        plankDoor(B, 0.85, 0, 0.85, 2.0, K.green, { frame: K.white });
        B.box('paint', K.white, 1.3, 1.1, 0.34, -0.55, 1.35, 0.17, { r: 0.03 });
        pbox(B, NS('gloss'), K.glass, 1.16, 0.9, 0.02, -0.55, 1.35, 0.345);
        for (const x of [-0.95, -0.55, -0.15]) pbox(B, NS('paint'), K.white, 0.04, 0.9, 0.03, x, 1.35, 0.352);
        B.box('paint', K.stone, 1.4, 0.1, 0.42, -0.55, 0.75, 0.2, { r: 0.02 });
        boardSign(B, 'WEIGH HOUSE', 0, 2.2, { h: 0.13, board: K.green, c: K.cream, border: K.cream, bd: 0.02, w: 2.2 });
      });
      onFace(B, W, Dd, 1, () => { B.push(0, 2.0, 0.02); lantern(B, 0, 0, 0.3, 0.7); B.pop(); seg(B, 'metal', K.iron, [0, 1.95, 0], [0, 1.95, 0.3], 0.04, 0.04); });
      B.push(0, Hh, 0, 0); slateRoof(B, -W / 2, W / 2, -Dd / 2, Dd / 2, 0, 1.1, { ov: 0.25, wall: K.brick }); B.pop();
      chimney(B, W / 2 - 0.4, Hh + 0.6, -0.4, 0.45, 0.45, 1.0, 1);
      B.col(-W / 2, 0, -Dd / 2, W / 2, Hh, Dd / 2);
      B.col(-W / 2 - 0.25, Hh, -Dd / 2 - 0.25, W / 2 + 0.25, Hh + 1.6, Dd / 2 + 0.25, ROOF);
      // the weighbridge plate in the setts in front (chequered iron in a stone kerb, flush)
      B.box('paint', K.stoneDk, 3.2, 0.012, 2.2, 0, 0.006, Dd / 2 + 1.5, { r: 0.01 });
      B.box('metal', K.ironLt, 3.0, 0.016, 2.0, 0, 0.008, Dd / 2 + 1.5, { r: 0.01 });
      for (let x = -1.35; x <= 1.36; x += 0.3) pbox(B, NS('metal'), K.iron, 0.02, 0.018, 1.9, x, 0.01, Dd / 2 + 1.5);
      B.blob(3.6, 3.0);
    },
  };

  // Tar kettle: a small iron cauldron on a wheeled firebox with a stove pipe (collides)
  D.lockgate_tarkettle = {
    desc: 'Wheeled tar kettle: riveted firebox on two iron wheels, a lidded cauldron, stove pipe, a drip of tar, a mop in a bucket (collides).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('metal', K.black, 1.0, 0.6, 0.7, 0, 0.55, 0, { r: 0.04 });
      for (const s of [-1, 1]) { B.tor('metal', K.iron, 0.3, 0.04, -0.25, 0.3, s * 0.42, { rs: 4, ts: 14 }); B.cyl(NS('metal'), K.iron, 0.05, 0.1, -0.25, 0.3, s * 0.42, { rx: HP, seg: 6 }); }
      B.lathe('metal', '#1d1e20', [[0, 0], [0.34, 0.02], [0.36, 0.3], [0.38, 0.34], [0, 0.34]], 0.05, 0.85, 0, { seg: 12 });
      B.lathe('metal', K.iron, [[0.36, 0], [0.3, 0.06], [0.05, 0.1], [0, 0.12]], 0.05, 1.2, 0, { seg: 12 });
      B.cyl('metal', '#2a2c30', 0.06, 0.9, -0.4, 1.3, 0, { seg: 6 });
      seg(B, 'metal', K.iron, [0.5, 0.5, 0], [1.1, 0.1, 0], 0.05, 0.05);
      B.box(NS('glow'), '#ff9a4a', 0.2, 0.12, 0.02, 0.2, 0.4, 0.36, { glow: 0.6 });
      B.lathe('metal', '#6a6d72', [[0.14, 0], [0.16, 0.3], [0, 0.3]], 0.9, 0, 0.55, { seg: 8 });
      B.cyl('wood', K.oakLt, 0.02, 1.1, 0.95, 0.6, 0.55, { rz: 0.3, seg: 4 });
      B.col(-0.55, 0, -0.5, 0.55, 1.35, 0.5);
      B.blob(1.8, 1.4);
    },
  };

  // stone coping along a wall top (along +X for length, centred on the wall, pos.y = wall top). Non-colliding.
  D.lockgate_wallcap = {
    desc: 'Saddleback stone coping along a wall top (along +X, width w, pos.y = the wall top), weathered joints every ~0.9 m. Non-colliding.',
    params: { length: 'm (6)', w: 'wall width + overhang (0.72)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 6, w = o.w ?? 0.72, n = Math.max(1, Math.round(L / 0.9));
      for (let i = 0; i < n; i++) {
        const x0 = (i / n) * L, x1 = ((i + 1) / n) * L - 0.012, c = mixc(K.stone, K.stoneDk, hash(i * 1.7 + L) * 0.7);
        B.box('paint', c, x1 - x0, 0.08, w, (x0 + x1) / 2, 0.04, 0, { r: 0.015 });
        B.add('paint', tpl('capSaddle' + kf(w), () => extrudeGeo([[-w / 2 + 0.03, 0], [w / 2 - 0.03, 0], [0.05, 0.09], [-0.05, 0.09]], 1, 0.006)), c, (x0 + x1) / 2, 0.08, 0, { sx: x1 - x0 });
      }
    },
  };

}

// frame helpers for the diagonal pound (must match layout.js): s along u = (c, c), t along v = (-c, c)
const C45 = Math.SQRT1_2;
const DW = (s, t, y = 0) => [C45 * (s - t), y, C45 * (s + t)];
const Q = -P / 4;                       // rotY that turns local +X along u (local +Z along v)

// The placements as drawn before the Long Stages stretch (Alpha's half); the ones beyond the cut move out with the
// base (outP, like layout.js base()) unless they say `stay` (the east yard wall's coping: that stretch of wall stays)
const DRAWN = [
  // ================= landmarks + buildings (Alpha half; each is mirrored to Bravo's)
  { type: 'lockgate_bridge', pos: [0, 0, 0], rotY: Q, mirror: false, notIn: 'tower' },
  { type: 'lockgate_bridge', pos: [0, 0, 0], rotY: Q, mirror: false, half: BRIDGE_T, onlyIn: 'tower' },
  { type: 'lockgate_warehouse', pos: [4, 0, -45.4], rotY: 0, fill: [[-26.3, -16], [18, 26.3]] },
  { type: 'lockgate_cottage', pos: [-17.75, 0, -28.75], rotY: 0 },
  { type: 'lockgate_office', pos: [-4.75, 0, -22], rotY: 0, notIn: 'tower' },
  { type: 'lockgate_office', pos: [-4.75, 0, -22.5], rotY: 0, depth: 7, onlyIn: 'tower' },
  { type: 'lockgate_stables', pos: [9, 0, -23], rotY: 0, notIn: 'tower' },
  { type: 'lockgate_stables', pos: [9, 0, -23], rotY: 0, flat: true, onlyIn: 'tower' },
  { type: 'lockgate_shed', pos: [23, 0, -9.5], rotY: 0 },
  { type: 'lockgate_mill', pos: [27, 0, 12], rotY: -P / 2, W: 28 },
  { type: 'lockgate_backdrop', pos: [0, 0, 0], rotY: 0 },

  // ================= lock E (lock W is its 180° twin): gates, upper pound + railings, drained chamber, maintenance
  { type: 'lockgate_gates', pos: [16.5, 1.3, 12], rotY: 0, kind: 'lower', notIn: 'tower' },
  { type: 'lockgate_gates', pos: [16.5, 1.3, 12], rotY: 0, kind: 'lower', crank: true, onlyIn: 'tower' },
  { type: 'lockgate_gates', pos: [24.5, 1.3, 12], rotY: 0, kind: 'upper' },
  { type: 'lockgate_pound', pos: [25.12, -0.3, 12], rotY: 0, length: 66, width: 5.5 },
  { type: 'lockgate_railing', pos: [25.2, 1.3, 9.2], rotY: 0, length: 1.75, height: 1.05 },
  { type: 'lockgate_railing', pos: [25.2, 1.3, 14.8], rotY: 0, length: 1.75, height: 1.05 },
  { type: 'lockgate_scaffrail', pos: [16.65, -1.9, 10.15], rotY: 0, run: 7.25, rise: 3.2, side: 1 },
  { type: 'lockgate_scaffrail', pos: [16.65, -1.9, 13.85], rotY: 0, run: 7.25, rise: 3.2, side: -1 },
  // Alpha's wharf platform (south side, 1.3): paddle gear, stop planks + pump, the lock-keeper's hut, lamp, bollard
  { type: 'lockgate_paddle', pos: [18.3, 1.3, 8.25], rotY: 0, windlass: true },
  { type: 'lockgate_paddle', pos: [22.3, 1.3, 8.25], rotY: 0, raised: true },
  { type: 'lockgate_stopplanks', pos: [20.2, 1.3, 8.0], rotY: 0 },
  { type: 'lockgate_hut', pos: [26.0, 1.3, 1.2], rotY: -P / 2 },
  { type: 'lockgate_lamp', pos: [26.6, 1.3, 6.2], variant: 0 },
  { type: 'lockgate_bollard', pos: [26.4, 1.3, 8.8] },
  { type: 'lockgate_planter', pos: [16.4, 1.3, -1.3], variant: 0 },
  { type: 'lockgate_casks', pos: [14.2, 1.3, 0.2], rotY: 0.2, variant: 1 },
  // Bravo's lock side (north, 1.3): paddles, bench, planter, bollard, lamp
  { type: 'lockgate_paddle', pos: [18.3, 1.3, 15.75], rotY: P },
  { type: 'lockgate_paddle', pos: [22.3, 1.3, 15.75], rotY: P, windlass: true },
  { type: 'lockgate_bench', pos: [20.2, 1.3, 20.3], rotY: P },
  { type: 'lockgate_planter', pos: [26.8, 1.3, 20.3], variant: 1 },
  { type: 'lockgate_bollard', pos: [26.4, 1.3, 15.2] },
  { type: 'lockgate_lamp', pos: [26.8, 1.3, 18.0], variant: 0 },
  // Bravo's basin quay (0) by the lower gates
  { type: 'lockgate_bollard', pos: [9.6, 0, 15.3], variant: 1 },
  { type: 'lockgate_bollard', pos: [14.6, 0, 15.3] },
  { type: 'lockgate_lifebuoy', pos: [11.2, 0, 20.4], rotY: P },
  { type: 'lockgate_lamp', pos: [8.8, 0, 20.4], variant: 0 },
  // mill-face signs
  { type: 'lockgate_enamel', pos: [26.98, 3.2, 4.5], rotY: -P / 2, variant: 1 },
  { type: 'lockgate_enamel', pos: [26.98, 3.2, 18.2], rotY: -P / 2, variant: 4 },

  // ================= the diagonal pound: Alpha's towpath quay, moored boats, wharf crane, ladders, rings
  { type: 'lockgate_narrowboat', pos: DW(7.5, -3.67, -0.7), rotY: Q, kind: 'working', L: 7.8, W: 2.0, cab: 2.9, lines: [[-2.3, -1.5, 0.9], [2.7, -1.5, 0.9]], notIn: 'tower' },
  { type: 'lockgate_narrowboat', pos: DW(7.2, -1.52, -0.7), rotY: Q, kind: 'cabin', L: 7.8, W: 2.0, cab: 2.9, lines: [[-2.0, -3.6, 0.9], [3.0, -3.6, 0.9]], notIn: 'tower' },
  { type: 'lockgate_bollard', pos: DW(5.2, -5.25, 0.15), notIn: 'tower' },
  { type: 'lockgate_bollard', pos: DW(10.2, -5.25, 0.15), notIn: 'tower' },
  // (Tower Command: the two boats turned across the pound beside the bridge — layout.js XBOATS builds the hulls, roofs
  // and boarding planks, these dress them (bow at local -X: the heading runs from the bow's quay to the stern's); mooring
  // bollards at the crossing's outer corners; the oak stump, the ladder and the NO MOORING post moved off the landing of
  // the mirrored crossing, on this bank the other side of the bridge)
  ...XBOATS.map((b) => {
    const [h0, h1] = xboatT(b);
    return { type: 'lockgate_narrowboat', pos: DW(b.s0 + XBOAT.beam / 2, (h0 + h1) / 2, -0.7), rotY: b.bow < 0 ? -3 * P / 4 : P / 4, kind: b.kind, L: XBOAT.L, W: 2.0, cab: XBOAT.cab, onlyIn: 'tower' };
  }),
  { type: 'lockgate_bollard', pos: DW(6.5, -5.25, 0.15), onlyIn: 'tower' },
  { type: 'lockgate_bollard', pos: DW(12.3, -5.25, 0.15), onlyIn: 'tower' },
  { type: 'lockgate_bollard', pos: DW(-9.2, -5.25, 0.15), variant: 1, notIn: 'tower' },
  { type: 'lockgate_bollard', pos: DW(-12.3, -5.25, 0.15), variant: 1, onlyIn: 'tower' },
  { type: 'lockgate_bollard', pos: DW(-13.8, -5.25, 0.15) },
  { type: 'lockgate_ring', pos: DW(-11.5, -4.82, 0.15), rotY: Q },
  { type: 'lockgate_ring', pos: DW(-4.0, -4.82, 0.15), rotY: Q, notIn: 'tower' },
  { type: 'lockgate_ring', pos: DW(3.8, -4.82, 0.15), rotY: Q, notIn: 'tower' },
  { type: 'lockgate_ring', pos: DW(-5.6, -4.82, 0.15), rotY: Q, onlyIn: 'tower' },
  { type: 'lockgate_ring', pos: DW(5.6, -4.82, 0.15), rotY: Q, onlyIn: 'tower' },
  { type: 'lockgate_ring', pos: DW(14.5, -4.82, 0.15), rotY: Q },
  { type: 'lockgate_ladder', pos: DW(-10.4, -4.77, 0.15), rotY: Q, depth: 2.35, notIn: 'tower' },
  { type: 'lockgate_ladder', pos: DW(-13.0, -4.77, 0.15), rotY: Q, depth: 2.35, onlyIn: 'tower' },   // (the boats' hulls lie on its wall)
  { type: 'lockgate_crane', pos: DW(-6.3, -6.4, 0.15), rotY: Q },
  { type: 'lockgate_lifebuoy', pos: DW(-12.5, -8.3, 0.15), rotY: Q },
  { type: 'lockgate_bench', pos: DW(-15.2, -8.3, 0.15), rotY: Q, notIn: 'tower' },
  { type: 'lockgate_milepost', pos: DW(4.3, -8.35, 0.15), rotY: Q, notIn: 'tower' },
  // (Tower Command: the bench is gone — the tower's street and the boats' landing leave it no room)
  { type: 'lockgate_milepost', pos: DW(5.4, -8.35, 0.15), rotY: Q, onlyIn: 'tower' },        // (clear of the wider bridge)
  { type: 'lockgate_enamel', pos: DW(-9.8, -8.35, 0.15), rotY: Q, variant: 0, post: true, notIn: 'tower' },
  { type: 'lockgate_enamel', pos: DW(-5.0, -8.4, 0.15), rotY: Q, variant: 0, post: true, onlyIn: 'tower' },   // (off the boats' landing)
  { type: 'lockgate_lamp', pos: DW(-8.5, -9.5), variant: 0 },
  { type: 'lockgate_lamp', pos: DW(8.2, -9.5), variant: 0 },

  // ================= the bridge street + crane wharf courtyard (bends round the stables onto the bridge)
  { type: 'lockgate_goods', pos: [12.4, 0, -15.3], rotY: 0.2, variant: 0, notIn: 'tower' },
  { type: 'lockgate_casks', pos: [7.2, 0, -16.6], rotY: -0.4, variant: 1, notIn: 'tower' },
  { type: 'lockgate_goods', pos: [1.2, 0, -13.8], rotY: -P / 4, variant: 1 },
  { type: 'lockgate_trough', pos: [2, 0, -22.2], rotY: 0 },
  { type: 'lockgate_pump', pos: [-0.5, 0, -16.4], rotY: P / 2, notIn: 'tower' },
  { type: 'lockgate_postbox', pos: [-0.8, 0, -28.6] },
  { type: 'lockgate_fingerpost', pos: [-6.3, 0, -16.2], rotY: 0.3, notIn: 'tower' },
  { type: 'lockgate_casks', pos: [-10.0, 0, -16.0], rotY: 0.5, variant: 2, notIn: 'tower' },
  // (Tower Command: the tower's street along the office + stables fronts (z -18.8 … -16.3) cleared — the same street
  // furniture a step toward the canal, the crate stack into the lee of the bridge by the loading bank)
  { type: 'lockgate_goods', pos: [11.81, 0, -4.45], rotY: P / 4, variant: 0, onlyIn: 'tower' },
  { type: 'lockgate_casks', pos: [7.2, 0, -15.0], rotY: -0.4, variant: 1, onlyIn: 'tower' },
  { type: 'lockgate_pump', pos: [-0.5, 0, -15.0], rotY: P / 2, onlyIn: 'tower' },
  { type: 'lockgate_fingerpost', pos: [-8.3, 0, -15.9], rotY: 0.3, onlyIn: 'tower' },
  { type: 'lockgate_casks', pos: [-12.0, 0, -15.5], rotY: 0.5, variant: 2, onlyIn: 'tower' },
  { type: 'lockgate_lamp', pos: [-1.48, 2.0, -21], rotY: P / 2, variant: 1 },
  { type: 'lockgate_lamp', pos: [9, 2.7, -18.98], rotY: 0, variant: 1 },

  // ================= west: the lock-keeper's front garden, the horse ramp, the west yard
  { type: 'lockgate_tree', pos: [-26.2, 0, -28.6] },
  { type: 'lockgate_planter', pos: [-19.8, 0, -22.4], variant: 0 },
  { type: 'lockgate_planter', pos: [-15.7, 0, -22.4], variant: 1, notIn: 'tower' },
  { type: 'lockgate_planter', pos: [-15.7, 0, -24.6], variant: 1, onlyIn: 'tower' },          // (off the tower's lane)
  { type: 'lockgate_bench', pos: [-21.33, 0, -28.4], rotY: -P / 2 },
  { type: 'lockgate_casks', pos: [-10.6, 0, -24.0], rotY: 0.3, variant: 2, notIn: 'tower' },
  { type: 'lockgate_casks', pos: [-13.0, 0, -24.6], rotY: 0.3, variant: 2, onlyIn: 'tower' },  // (off the tower's lane)
  { type: 'lockgate_lamp', pos: [-11.4, 0, -33.8], variant: 0 },
  { type: 'lockgate_cart', pos: [-17.2, 0, -34.2], rotY: 0.35 },
  { type: 'lockgate_goods', pos: [-22.6, 0, -31.6], rotY: P / 4, variant: 2 },
  { type: 'lockgate_casks', pos: [-9.6, 0, -38.8], rotY: -0.2, variant: 0 },

  // ================= centre: the back yard + loading stage
  { type: 'lockgate_goods', pos: [-2.9, 0, -35.2], rotY: 0, variant: 1 },
  { type: 'lockgate_casks', pos: [10.6, 0, -35.8], rotY: 0.2, variant: 1 },
  { type: 'lockgate_casks', pos: [-2.8, 2.4, -40.4], rotY: 0.3, variant: 1 },
  { type: 'lockgate_stagekit', pos: [4, 0, -38.4], rotY: 0 },

  // ================= east: the yard south of the shed, the loading bank
  { type: 'lockgate_goods', pos: [19.2, 0, -31.2], rotY: 0, variant: 2 },
  { type: 'lockgate_goods', pos: [20.2, 0, -24.8], rotY: P / 2, variant: 1 },
  { type: 'lockgate_lamp', pos: [16.4, 0, -30.6], variant: 0 },
  { type: 'lockgate_goods', pos: [15.3, 1.3, -12.4], rotY: P / 2, variant: 0 },
  { type: 'lockgate_casks', pos: [15.1, 1.3, -6.6], rotY: 0.2, variant: 1 },
  { type: 'lockgate_enamel', pos: [17.98, 3.45, -13.0], rotY: -P / 2, variant: 2 },

  // ================= stair cheeks, wall copings, weeds, bills, signs
  { type: 'lockgate_cheek', pos: [14.5, 0, -22], rotY: -P / 2, run: 5, rise: 1.3 },
  { type: 'lockgate_cheek', pos: [17.5, 0, -22], rotY: -P / 2, run: 5, rise: 1.3, flip: true },
  { type: 'lockgate_cheek', pos: [12, 0, 16.4], rotY: 0, run: 3.5, rise: 1.3, flip: true },
  { type: 'lockgate_cheek', pos: [12, 0, 18.8], rotY: 0, run: 3.5, rise: 1.3 },
  { type: 'lockgate_cheek', pos: [-11, 0, -41.7], rotY: 0, run: 6, rise: 2.4 },
  { type: 'lockgate_cheek', pos: [-8, 0, -32], rotY: -P / 2, run: 6, rise: 2.6 },
  { type: 'lockgate_cheek', pos: [-6, 0, -32], rotY: -P / 2, run: 6, rise: 2.6, flip: true },
  { type: 'lockgate_cheek', pos: [7, 0, -32.4], rotY: P / 2, run: 6, rise: 2.4 },
  { type: 'lockgate_cheek', pos: [1, 0, -32.4], rotY: P / 2, run: 6, rise: 2.4, flip: true },
  { type: 'lockgate_wallcap', pos: [-12.3, 4.6, -45.4], rotY: -P / 2, length: 9.4, w: 0.76 },
  { type: 'lockgate_wallcap', pos: [-20, 4.6, -36.3], rotY: 0, length: 7.4, w: 0.76 },
  { type: 'lockgate_wallcap', pos: [22.3, 4.6, -45.4], rotY: -P / 2, length: 28.4, w: 0.76, stay: true },
  { type: 'lockgate_wallcap', pos: [-27.5, 4.6, -29], rotY: -P / 2, length: 5, w: 1.1 },
  { type: 'lockgate_wallcap', pos: DW(-39.9, -11.6, 4.45), rotY: -3 * P / 4, length: 10.5, w: 0.76 },
  { type: 'lockgate_weeds', pos: [-19.6, 0, -35.95], rotY: 0, length: 6 },
  { type: 'lockgate_weeds', pos: [-26.95, 0, -24.2], rotY: P / 2, length: 4.5 },
  { type: 'lockgate_weeds', pos: [21.95, 0, -36], rotY: -P / 2, length: 4 },
  { type: 'lockgate_weeds', pos: [22, 0, -17.05], rotY: P, length: 3.5 },
  { type: 'lockgate_weeds', pos: [5.45, 0, -27], rotY: -P / 2, length: 3.5 },
  { type: 'lockgate_weeds', pos: [-1.45, 0, -19], rotY: P / 2, length: 3 },
  { type: 'lockgate_weeds', pos: [26.95, 1.3, -1.5], rotY: -P / 2, length: 1.8 },
  { type: 'lockgate_bills', pos: [-1.48, 0, -23.8], rotY: P / 2, variant: 0, count: 3 },
  { type: 'lockgate_bills', pos: [9.0, 0, -27.02], rotY: P, variant: 2, count: 2, notIn: 'tower' },
  { type: 'lockgate_bills', pos: [12.52, 0, -23], rotY: P / 2, variant: 2, count: 2, onlyIn: 'tower' },   // (the loft ramp covers that wall)
  { type: 'lockgate_bills', pos: [21.95, 0, -40.5], rotY: -P / 2, variant: 3, count: 2 },
  { type: 'lockgate_bills', pos: [-12.55, 0, -40], rotY: P / 2, variant: 1, count: 2 },
  { type: 'lockgate_enamel', pos: [-16, 1.6, -35.98], rotY: 0, variant: 3 },
  { type: 'lockgate_enamel', pos: [5.48, 1.9, -23], rotY: -P / 2, variant: 6 },
];

// ================= THE DRY DOCK slice (layout.js DOCK; Alpha's half, mirrored to Bravo's). Every piece of cover keeps
// off the tower's lanes (the yard lane x -10.3, the dock road z -35.4, the east lane x 16.6, the back road z -50.2 and
// the goal run x -3: ±1.25 + 0.3 m), so every mode shares one dressing.
const SX = (STAGING.x0 + STAGING.x1) / 2, SZ = (STAGING.z0 + STAGING.z1) / 2;
const DOCK_PLACEMENTS = [
  // the dock, its gates, the arm beyond, the boat on its keel blocks, ladders, bollards
  { type: 'lockgate_drydock', pos: [-6, 0, DOCK_Z], rotY: 0, len: 21, hw: 4, steps: 3.4, boat: [DOCKBOAT.x0 + 6, DOCKBOAT.x1 + 6] },
  { type: 'lockgate_dockgate', pos: [-26.4, 0, DOCK_Z], rotY: P },
  { type: 'lockgate_pound', pos: [-26.35, -0.3, DOCK_Z], rotY: P, length: 36, width: 5.5 },
  { type: 'lockgate_narrowboat', pos: [(DOCKBOAT.x0 + DOCKBOAT.x1) / 2, DOCKBOAT.gun, DOCK_Z], rotY: 0, kind: 'working', L: DOCKBOAT.x1 - DOCKBOAT.x0, W: DOCKBOAT.W, cab: DOCKBOAT.cab },
  { type: 'lockgate_ladder', pos: [-20.6, 0, -39.02], rotY: P, depth: 0.95 },
  { type: 'lockgate_ladder', pos: [-20.6, -0.95, -39.62], rotY: P, depth: 0.95 },
  { type: 'lockgate_ladder', pos: [-8.2, 0, -46.98], rotY: 0, depth: 0.95 },
  { type: 'lockgate_ladder', pos: [-8.2, -0.95, -46.38], rotY: 0, depth: 0.95 },
  { type: 'lockgate_bollard', pos: [-22, 0, -38.6] },
  { type: 'lockgate_bollard', pos: [-8.4, 0, -38.6], variant: 1 },
  { type: 'lockgate_bollard', pos: [-18.6, 0, -47.4] },
  { type: 'lockgate_bollard', pos: [-7.8, 0, -47.4], variant: 1 },
  { type: 'lockgate_ring', pos: [-16.8, 0, -39.12], rotY: P },
  { type: 'lockgate_ring', pos: [-23.5, 0, -46.88], rotY: 0 },
  { type: 'lockgate_goods', pos: [-12.6, -1.9, -45.2], rotY: 0, variant: 1 },          // the boat's new engine, crated
  { type: 'lockgate_casks', pos: [-9.3, -1.9, -40.7], rotY: 0.3, variant: 2 },
  // the crane staging + its hand crane (jib swung out over the boat)
  { type: 'lockgate_staging', pos: [SX, 0, SZ], rotY: 0, hw: 4, half: [2.5, 5.5] },
  { type: 'lockgate_crane', pos: [-13.85, 1.3, DOCK_Z - 0.4], rotY: -P / 2 },
  { type: 'lockgate_casks', pos: [-11.2, 1.3, DOCK_Z + 1.6], rotY: 0.4, variant: 1 },
  // the north dockside: the dockmaster's hut by the gates, a stack of oak boards, a lamp by the cottage's back
  { type: 'lockgate_hut', pos: [-26, 0, -33.4], rotY: -P / 2 },
  { type: 'lockgate_timber', pos: [-19.5, 0, -35.4], rotY: 0, variant: 0 },
  { type: 'lockgate_lamp', pos: [-16.6, 0, -32.9], variant: 0 },
  { type: 'lockgate_weeds', pos: [-26.95, 0, -35.8], rotY: P / 2, length: 2.2 },
  // the south dockside: the steam chest, the tar kettle, elm butts, a lamp by the staging's south flight
  { type: 'lockgate_steamchest', pos: [-19.8, 0, -49.6], rotY: 0 },
  { type: 'lockgate_tarkettle', pos: [-22.9, 0, -52.0], rotY: 0.4 },
  { type: 'lockgate_timber', pos: [-8.5, 0, -52.2], rotY: 0, variant: 1 },
  { type: 'lockgate_lamp', pos: [-15.8, 0, -50.6], variant: 0 },
  { type: 'lockgate_weeds', pos: [-26.95, 0, -48.2], rotY: P / 2, length: 1.8 },
  // the boatbuilder's shed and its loading bay (stair cheeks, boards + casks on the bay)
  { type: 'lockgate_boatshed', pos: [(SHED.x0 + SHED.x1) / 2, 0, (SHED.z0 + SHED.z1) / 2], rotY: 0, W: SHED.x1 - SHED.x0, Dd: SHED.z1 - SHED.z0, Hh: SHED.top, bay: SHED.x0 - SHED.bay },
  { type: 'lockgate_cheek', pos: [-1.6, 0, -39.5], rotY: 0, run: 3.1, rise: 1.3 },
  { type: 'lockgate_cheek', pos: [-1.6, 0, -41.7], rotY: 0, run: 3.1, rise: 1.3, flip: true },
  { type: 'lockgate_cheek', pos: [-1.6, 0, -44.3], rotY: 0, run: 3.1, rise: 1.3 },
  { type: 'lockgate_cheek', pos: [-1.6, 0, -46.5], rotY: 0, run: 3.1, rise: 1.3, flip: true },
  { type: 'lockgate_timber', pos: [3.7, 1.3, DOCK_Z], rotY: P / 2, variant: 0 },
  { type: 'lockgate_casks', pos: [4.1, 1.3, -39.9], rotY: 0.2, variant: 1 },
  // the lane by the dock head: a rack of boards; the dock road: casks + boards along its edges, lamps
  { type: 'lockgate_timber', pos: [-3.2, 0, DOCK_Z], rotY: P / 2, variant: 2 },
  { type: 'lockgate_enamel', pos: [-4.7, 0, -47.9], rotY: 0, variant: 6, post: true },
  { type: 'lockgate_casks', pos: [-3.6, 0, -33.0], rotY: 0.1, variant: 0 },
  { type: 'lockgate_timber', pos: [8.5, 0, -33.0], rotY: 0, variant: 0 },
  { type: 'lockgate_goods', pos: [20.3, 0, -33.2], rotY: P / 2, variant: 0 },
  { type: 'lockgate_casks', pos: [12.2, 0, -37.8], rotY: 0.3, variant: 1 },
  { type: 'lockgate_lamp', pos: [0.8, 0, -37.8], variant: 0 },
  // the east lane along the yard wall: elm butts, a day boat on the stocks, a board rack; the back road: boards, crates
  { type: 'lockgate_timber', pos: [20.4, 0, -37.8], rotY: P / 2, variant: 1 },
  { type: 'lockgate_stocks', pos: [20.2, 0, -43.6], rotY: P / 2 },
  { type: 'lockgate_timber', pos: [20.6, 0, -49.9], rotY: P / 2, variant: 2 },
  { type: 'lockgate_lamp', pos: [14.4, 0, -48.2], variant: 0 },
  { type: 'lockgate_timber', pos: [11.5, 0, -53.1], rotY: 0, variant: 0 },
  { type: 'lockgate_goods', pos: [16.5, 0, -53.0], rotY: 0, variant: 1 },
  // the head of the yard, where the bridge street comes out of the canal-side row: the weigh house (its weighbridge in
  // front), a dray waiting by the stables' back
  { type: 'lockgate_weighhouse', pos: [2.2, 0, -31.0], rotY: 0 },
  { type: 'lockgate_cart', pos: [9.4, 0, -31.2], rotY: P + 0.15 },
  // small dressing: the dockmaster's planter, a fingerpost at the dock road's corner, a bench under the shed's windows,
  // weeds along the shed and the copings
  { type: 'lockgate_planter', pos: [-24.4, 0, -32.9], variant: 0 },
  { type: 'lockgate_fingerpost', pos: [-5.3, 0, -37.7], rotY: 0.6 },
  { type: 'lockgate_bench', pos: [7.2, 0, -38.15], rotY: 0 },
  { type: 'lockgate_weeds', pos: [5.2, 0, -38.52], rotY: 0, length: 1.6 },
  { type: 'lockgate_weeds', pos: [10.6, 0, -47.48], rotY: P, length: 2.4 },
  { type: 'lockgate_weeds', pos: [-14.6, 0, -38.45], rotY: 0, length: 1.2 },
  { type: 'lockgate_weeds', pos: [-24.4, 0, -47.55], rotY: P, length: 1.5 },
  // the walls: copings on the dock's west wall (over the arch) and the east yard wall carried on, bills, weeds
  { type: 'lockgate_wallcap', pos: [-27.5, 4.6, -51], rotY: -P / 2, length: 22, w: 1.1 },
  { type: 'lockgate_wallcap', pos: [22.3, 4.6, -45.4 - LS.d], rotY: -P / 2, length: LS.d, w: 0.76 },
  { type: 'lockgate_bills', pos: [21.95, 0, -41.0], rotY: -P / 2, variant: 4, count: 2 },
  { type: 'lockgate_weeds', pos: [21.95, 0, -46.5], rotY: -P / 2, length: 3.5 },
];

// the stretch: placements beyond the cut move out with the base
const outP = (p) => (p.stay || p.pos[2] >= LS.cut ? p : { ...p, pos: [p.pos[0], p.pos[1], p.pos[2] - LS.d] });
export const PLACEMENTS = [...DRAWN.map(outP), ...DOCK_PLACEMENTS];

