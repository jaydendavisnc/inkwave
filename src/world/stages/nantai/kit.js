// Mount Nantai — the prop pack's shared toolkit (props.js hands it H, the PropKit helpers; nothing here imports three).
//   makeKit(H) → { K (palette), GB, tpl, pbox, seg, colC, colSeg, colObox, letters, textW, boardSign, rock, pine, rail … }
// Conventions as props.js: metres, Y up, a prop's local +Z is its front; B (the PropKit builder) carries the frame stack.

export function makeKit(H) {
  const { THREE, PI, TAU, HP, col, shade, mixc, blobGeo, latheGeo, extrudeGeo } = H;
  const NS = (m) => (H.noShadow ? H.noShadow(m) : m);

  // ------------------------------------------------------------------------------------------ palette
  // cold granite greys, weathered larch, observatory white + steel, Grizzco orange / brown for the party — all muted
  // below the team inks
  const K = {
    granite: '#aba8a1', graniteLt: '#c2bfb8', graniteDk: '#85827c', graniteWarm: '#c7beb0', scree: '#a9a59d',
    lichen: '#b9ad6a', moss: '#7f8a4a', mossDk: '#5f6a38',
    white: '#eeede8', whiteSh: '#d9d8d2', dome: '#e9eaea', domeSh: '#c9ccce', steel: '#8e969d', steelDk: '#5d646b', steelLt: '#b7bec4',
    iron: '#2e3236', ironLt: '#4a5056', black: '#232427', rubber: '#2b2c30',
    larch: '#9d8a74', larchDk: '#6f604f', larchLt: '#b9a891', timber: '#8a6d52', timberDk: '#5e4a38', bark: '#5d4b3d', barkDk: '#43362c',
    pine: '#3f5a3c', pineDk: '#2f4430', pineLt: '#557450',
    concrete: '#c4c1b9', concreteDk: '#a09d96', render: '#dcd6ca', stone: '#cfc8bb',
    grizz: '#d9772b', grizzDk: '#a9561d', grizzBrown: '#5a3a26', grizzCream: '#f1e3c6', canvas: '#ece6d8', canvasSh: '#d8d0bf',
    navy: '#2f3b55', teal: '#3f7f7a', red: '#b4473c', yellow: '#e2b447', green: '#4f7a4a', blue: '#48688f', plum: '#6e4a6a',
    brass: '#b8924a', gold: '#c9a24e', copper: '#b87b52', glass: '#26313a', glassLt: '#3e5260', lamp: '#ffd9a0', screen: '#1d2a44',
    water: '#2a6f69', waterLt: '#5aa39a', foam: '#e8f2ee', rope: '#c9b48a', ropeDk: '#9e8a62', sign: '#6a4a33', signLt: '#e9dcc0',
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
  const pboxGeo = () => tpl('pbox', () => new THREE.BoxGeometry(1, 1, 1));
  const pbox = (B, mat, c, w, h, d, x, y, z, o = {}) => B.add(mat, pboxGeo(), c, x, y, z, { ...o, sx: w, sy: h, sz: d });
  const cylGeo = (rt, rb, h, seg, open = false, t0 = 0, tl = TAU) => tpl(['cy', rt, rb, h, seg, open ? 1 : 0, t0, tl].map(kf).join('|'), () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, t0, tl));
  const ucyl = (seg, open) => tpl('ucyl|' + seg + (open ? 'o' : ''), () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, !!open));
  const ccyl = (B, mat, c, r, h, x, y, z, o = {}) => B.add(mat, ucyl(o.seg ?? 8, o.open), c, x, y, z, { ...o, sx: r, sy: h, sz: r });
  // a beam (box, or a low-poly cylinder with round: true) between two local points, section w × h
  function seg(B, mat, c, a, b, w, h, o = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
    const ry = Math.atan2(-dz, dx), rz = Math.atan2(dy, Math.hypot(dx, dz));
    B.push((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, ry, 0, rz);
    if (o.round) B.add(mat, ucyl(o.seg ?? 6), c, 0, 0, 0, { rz: HP, sx: w / 2, sy: L, sz: h / 2 });
    else if (o.plain) pbox(B, mat, c, L, h, w, 0, 0, 0); else B.box(mat, c, L, h, w, 0, 0, 0, { r: o.r ?? Math.min(0.03, Math.min(w, h) * 0.2) });
    B.pop();
  }
  // colliders are always in the prop's root frame (B.col ignores the push stack)
  const rot = (x, z, ry) => [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  const colC = (B, x, y, z, w, h, d, o) => B.col(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, o);
  const ROOF = { roof: true }, RAIL = { rail: true }, PERCH = { perch: true };
  // collider chain along a segment in the root frame (short AABBs hug a diagonal)
  function colSeg(B, a, b, r, y0, y1, n, o) {
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const x0 = a[0] + (b[0] - a[0]) * t0, z0 = a[1] + (b[1] - a[1]) * t0, x1 = a[0] + (b[0] - a[0]) * t1, z1 = a[1] + (b[1] - a[1]) * t1;
      B.col(Math.min(x0, x1) - r, y0, Math.min(z0, z1) - r, Math.max(x0, x1) + r, y1, Math.max(z0, z1) + r, o);
    }
  }

  // ------------------------------------------------------------------------------------------ stroke font
  // Rounded bold sans (cap height 1): centre-line strokes, round caps + joins, bevelled face, flat back (after the
  // canal pack's font — each pack keeps its own copy).
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
    '—': [0.6, [[0, 0.45], [0.6, 0.45]]],
    '+': [0.46, [[0, 0.45], [0.46, 0.45]], [[0.23, 0.22], [0.23, 0.68]]],
    '/': [0.4, [[0, 0], [0.4, 1]]],
    "'": [0, [[0, 1], [0, 0.8]]],
    '(': [0.24, EA(0.46, 0.5, 0.46, 0.62, 128, 232, 10)],
    ')': [0.24, EA(-0.22, 0.5, 0.46, 0.62, 52, -52, 10)],
    '>': [0.46, [[0, 0.9], [0.46, 0.45], [0, 0]]],
    '<': [0.46, [[0.46, 0.9], [0, 0.45], [0.46, 0]]],
    '&': [0.7, [[0.7, 0], ...EA(0.27, 0.72, 0.17, 0.2, -40, 220, 12).reverse(), [0.08, 0.28], ...EA(0.26, 0.24, 0.24, 0.24, 180, 300, 6), [0.62, 0.36]]],
  };
  const DOTS = { '·': [[0, 0.46]], '.': [[0, 0]], ':': [[0, 0.1], [0, 0.62]], '!': [[0, 0]] };
  GL['!'] = [0, [[0, 1], [0, 0.32]]];
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
  function disc(g, cx, cy, r, b, d, z0, sg, a0 = 0, a1 = TAU) {
    const R = Math.SQRT1_2, walls = d - z0 > 1e-5, bev = b > 1e-5, ri = bev ? r - b : r, full = a1 - a0 > TAU - 1e-4;
    const c0 = g.v(cx, cy, d, 0, 0, 1), f = [], bi = [], bo = [], wt = [], wb = [];
    const n = full ? sg : sg + 1;
    for (let k = 0; k < n; k++) {
      const a = a0 + ((a1 - a0) * k) / sg, cs = Math.cos(a), sn = Math.sin(a);
      f.push(g.v(cx + cs * ri, cy + sn * ri, d, 0, 0, 1));
      if (bev) { bi.push(g.v(cx + cs * ri, cy + sn * ri, d, cs * R, sn * R, R)); bo.push(g.v(cx + cs * r, cy + sn * r, d - b, cs * R, sn * R, R)); }
      if (walls) { wt.push(g.v(cx + cs * r, cy + sn * r, d - (bev ? b : 0), cs, sn, 0)); wb.push(g.v(cx + cs * r, cy + sn * r, z0, cs, sn, 0)); }
    }
    for (let k = 0; k < sg; k++) {
      const j = full ? (k + 1) % sg : k + 1;
      g.tri(c0, f[k], f[j]);
      if (bev) g.quad(bi[k], bo[k], bo[j], bi[j]);
      if (walls) g.quad(wt[k], wb[k], wb[j], wt[j]);
    }
  }
  function glyph(ch, wt, dep, bev, ds = 10) {
    return tpl(['gl', ch, wt, dep, bev, ds].map(kf).join('|'), () => {
      const s = 1 - wt, hw = wt / 2, T = (p) => [hw + p[0] * s, hw + p[1] * s];
      const g = new GB();
      const b = Math.min(bev, hw * 0.6);
      const def = GL[ch];
      if (DOTS[ch] && !def) {
        for (const p of DOTS[ch]) { const q = T(p); disc(g, hw * 1.15, q[1], hw * 1.15, b, dep, 0, ds); }
        return { geo: g.geo(), adv: wt * 1.3 };
      }
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
  // a line of letters facing +Z in the current frame (raised, or flat paint with flat: true); returns the width (m)
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
      x += (gi.adv + (i < cs.length - 1 ? track : 0)) * h;
    });
    return W;
  }
  // flush sign board with flat painted letters (board centred at x, y; faces +Z); returns the board width
  function boardSign(B, text, x, y, o = {}) {
    const lines = Array.isArray(text) ? text : [text];
    const h = o.h ?? 0.2, lh = h * (o.lead ?? 1.5), pad = o.pad ?? h * 0.6;
    const W = o.w ?? Math.max(...lines.map((t) => textW(t, o.wt ?? 0.18, o.track ?? 0.12))) * h + pad * 2;
    const Hb = o.hb ?? h + lh * (lines.length - 1) + pad * 1.1, bd = o.bd ?? 0.04, z = o.z ?? 0;
    B.box(o.boardMat ?? 'paint', o.board ?? K.sign, W, Hb, bd, x, y, z + bd / 2, { r: Math.min(0.02, Hb * 0.15) });
    if (o.border) { pbox(B, NS('paint'), o.border, W - 0.04, Hb - 0.04, 0.004, x, y, z + bd + 0.001); pbox(B, NS('paint'), o.board ?? K.sign, W - 0.08, Hb - 0.08, 0.004, x, y, z + bd + 0.003); }
    lines.forEach((t, i) => letters(B, t, { h, x: x + (o.align === 'left' ? -W / 2 + pad : 0), align: o.align, y: y + (lh * (lines.length - 1)) / 2 - i * lh - h / 2, z: z + bd + 0.005, c: o.c ?? K.signLt, flat: true, wt: o.wt ?? 0.18, track: o.track, mat: o.mat, glow: o.glow }));
    return W;
  }

  // ------------------------------------------------------------------------------------------ nature
  // granite boulder: a lumpy blob squashed into a rounded block, vertex-shaded darker underneath and lighter on top
  // (lichen tints added per placement); cached per seed + detail
  // granite boulder: a lumpy icosphere pulled toward a rounded block (cleaved faces, soft arrises), longer one way,
  // the base flattened (it sits in the ground), faceted; per-face colour: weathered grey, darker toward the ground,
  // lichen (sulphur yellow / grey-green) on the faces that look up. Local: base at y 0, top ≈ 1.6, radius ≈ 1.
  const rockGeo = (seed, det = 1, lump = 0.22) => tpl(['rk', seed, det, lump].map(kf).join('|'), () => {
    let g = blobGeo(1, det, seed, lump + 0.06, 0.72, 1.12);
    const P0 = g.attributes.position, el = 1.1 + 0.35 * hash(seed * 1.3), cut = -0.35 - 0.2 * hash(seed * 2.9);
    for (let i = 0; i < P0.count; i++) {
      let x = P0.getX(i), y = P0.getY(i), z = P0.getZ(i);
      const k = 0.78 + 0.22 * Math.max(Math.abs(x), Math.abs(y) * 1.1, Math.abs(z));
      x /= k; y /= k; z /= k;
      if (y < cut) y = cut + (y - cut) * 0.15;                 // flat underside, just below the ground line
      x *= el; y = (y - cut) * 0.62 / (1 - cut) * 1.62;        // base at 0, top ≈ 1
      P0.setXYZ(i, x, y, z);
    }
    g = g.toNonIndexed();
    g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal, C = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i += 3) {
      const ny = N.getY(i), cx = (P.getX(i) + P.getX(i + 1) + P.getX(i + 2)) / 3, cz = (P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2)) / 3;
      const n = Math.sin(cx * 3.1 + seed) * Math.sin(cz * 2.7 - seed * 0.7);
      let r = 0.84 + 0.18 * Math.max(0, ny) - 0.1 * Math.max(0, -ny) + 0.07 * (hash(i * 0.37 + seed) - 0.5), gg = r, bb = r;
      if (ny > 0.35 && n > 0.25) { const L = hash(seed + cx * 7) > 0.5; r *= L ? 1.02 : 0.9; gg *= L ? 0.95 : 0.97; bb *= L ? 0.62 : 0.84; }   // lichen
      for (let k = 0; k < 3; k++) { const y = P.getY(i + k), sh = 0.8 + 0.2 * Math.min(1, y / 1.1); C[(i + k) * 3] = r * sh; C[(i + k) * 3 + 1] = gg * sh; C[(i + k) * 3 + 2] = bb * sh; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    return g;
  });
  // a boulder with its base at y (sunk a little), radii rx / rz, height ry·1.62 (a squat boulder: ry ≈ 0.5·rx)
  function rock(B, x, y, z, rx, ry, rz, seed, o = {}) {
    B.add(o.mat ?? 'paint', rockGeo(seed % 23, o.det ?? 1, o.lump ?? 0.22), o.c ?? K.granite, x, y - 0.06 * ry, z, { sx: rx, sy: ry * 1.62, sz: rz, ry: o.rot ?? hash(seed) * TAU, rx: o.tilt ?? 0, ao: o.ao });
  }
  // dwarf mountain pine, bent by the wind (local +X = downwind): a twisting trunk, clumped needle pads up it and out
  // downwind, the lowest sweeping the ground
  const pineGeo = (seed) => tpl('pine|' + seed, () => {
    const parts = [];
    const r = (i) => hash(seed * 13.7 + i * 7.3);
    const lean = 0.35 + 0.25 * r(1), tw = (r(2) - 0.5) * 0.4;
    const pts = [[0, 0, 0], [0.08, 0.45, tw * 0.3], [0.3 + lean * 0.3, 0.95, tw], [0.6 + lean * 0.8, 1.4, tw * 0.5], [0.95 + lean, 1.7, -tw * 0.4]];
    parts.push({ g: H.tubeGeo(pts, (t) => 0.13 - 0.07 * t, 6), c: K.bark });
    parts.push({ g: H.tubeGeo([[0.3 + lean * 0.3, 0.95, tw], [0.1, 1.25, 0.45 + tw], [-0.15, 1.35, 0.6]], (t) => 0.06 - 0.03 * t, 5), c: K.bark });
    const pads = [[0.05, 0.35, 0.05, 0.62, 0.34], [0.55 + lean * 0.5, 1.05, 0.25, 0.58, 0.36], [0.85 + lean, 1.45, -0.15, 0.62, 0.38], [1.2 + lean, 1.72, 0.1, 0.5, 0.3],
      [-0.1, 1.3, 0.62, 0.42, 0.28], [0.4 + lean * 0.4, 1.6, 0.05, 0.46, 0.34], [1.45 + lean, 1.35, -0.25, 0.38, 0.24]];
    pads.forEach(([x, y, z, s, h], i) => parts.push({ g: H.puffGeo(1, seed * 3 + i), m: [x, y, z, s * (1.25 + 0.2 * r(i + 5)), h * 1.4, s * (0.95 + 0.2 * r(i + 9))], c: i % 3 === 0 ? K.pineDk : i % 3 === 1 ? K.pine : K.pineLt }));
    return parts;
  });
  function pine(B, x, y, z, s, seed, rotY) {
    B.push(x, y, z, rotY, 0, 0, s);
    for (const p of pineGeo(seed % 9)) {
      if (p.m) B.add('foliage', p.g, p.c, p.m[0], p.m[1], p.m[2], { sx: p.m[3], sy: p.m[4], sz: p.m[5] });
      else B.add('wood', p.g, p.c, 0, 0, 0);
    }
    B.pop();
  }
  // a low clump of alpine heather / dwarf shrub (visual; the grass and moss round rocks), w wide
  const heathGeo = (seed) => tpl('heath|' + seed, () => H.puffGeo(1, seed));
  const HEATH = ['#6f7d45', '#5d6b3a', '#6e6450', '#7f8a4a', '#83775a'];
  function heath(B, x, y, z, w, seed, c) {
    const n = 4 + (seed % 3);
    for (let i = 0; i < n; i++) {
      const a = hash(seed + i * 3.1) * TAU, rr = w * 0.32 * hash(seed * 2 + i);
      const s = w * (0.2 + 0.12 * hash(seed * 5 + i));
      B.add(NS('foliage'), heathGeo((seed + i) % 6), c ?? HEATH[(seed + i) % HEATH.length], x + Math.cos(a) * rr, y + s * 0.3, z + Math.sin(a) * rr, { sx: s, sy: s * 0.72, sz: s * 0.9 });
    }
  }

  // ------------------------------------------------------------------------------------------ fittings
  // tubular steel railing from a to b (local, ground heights ya / yb), posts every ≤ 1.6 m, top + mid rail
  function railing(B, a, b, o = {}) {
    const h = o.h ?? 1.0, c = o.c ?? K.steel, L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.ceil(L / (o.gap ?? 1.6)));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      if (o.skipPosts && o.skipPosts.includes(i)) continue;
      ccyl(B, 'metal', c, 0.028, h, x, y + h / 2, z, { seg: 8 });
    }
    seg(B, 'metal', c, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.05, 0.05, { round: true, seg: 8 });
    if (o.mid !== false) seg(B, 'metal', c, [a[0], a[1] + h * 0.5, a[2]], [b[0], b[1] + h * 0.5, b[2]], 0.03, 0.03, { round: true, seg: 6 });
  }

  return { K, NS, GB, TPL, tpl, kf, hash, pbox, cylGeo, ucyl, ccyl, seg, rot, colC, colSeg, ROOF, RAIL, PERCH, EA, letters, textW, boardSign, glyph, rockGeo, rock, pine, pineGeo, heath, railing, col, shade, mixc, latheGeo, extrudeGeo };
}
