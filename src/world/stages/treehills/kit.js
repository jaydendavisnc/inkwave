// Eco-Forest Treehills — the prop pack's shared toolkit (props.js hands it H, the PropKit helpers; nothing here imports
// three). makeKit(H) → { K (palette), GB, tpl, pbox, ccyl, seg, colC, colSeg, letters, textW, boardSign, railing,
// evergreen, puffs … }. Conventions as props.js: metres, Y up, a prop's local +Z is its front; B (the PropKit builder)
// carries the frame stack; colliders are always in the prop's root frame (B.col ignores the push stack).
//
// The Alterna language (the buildings reference): deep-green modular units with chequer-plate roofs and pale trims,
// half-cylinder glass greenhouse pods, white dishes with a round blue badge, red valve wheels, round hatches, painted
// floor labels, a pale-cyan float balloon. Clean, engineered, a little retro-futurist.

export function makeKit(H) {
  const { THREE, PI, TAU, HP, col, shade, mixc, latheGeo, extrudeGeo, puffGeo, blobGeo, tubeGeo } = H;
  const NS = (m) => (H.noShadow ? H.noShadow(m) : m);

  // ------------------------------------------------------------------------------------------ palette
  const K = {
    // modules: deep green painted steel, a lighter rib, near-black green shadow lines; pale trims
    mod: '#3d6b55', modLt: '#4c7d64', modDk: '#28473a', modRib: '#355f4b', trim: '#e6eae4', trimSh: '#c9cfca',
    plate: '#9aa39f', plateDk: '#7c8581', steel: '#8e9894', steelLt: '#c2c9c6', steelDk: '#5a6461', dark: '#232a28', black: '#1d2120',
    white: '#f1f3ee', whiteSh: '#d7dbd6', red: '#c4473b', redDk: '#8f2f28', blue: '#2f6db0', blueLt: '#6aa2d6', yellow: '#e3b64a',
    orange: '#e0853d', cyan: '#a6e0e2', cyanDk: '#6fb9bd', glass: '#9fcfd2', glassDk: '#2d4a4c', glassLt: '#d7f0ef',
    lamp: '#ffe2b0', screen: '#bfe8f0', label: '#eef1ea',
    // planting: cypress / thujopsis greens (dark, blue-green), lawn edging, soil, bark, flowers
    cyp: '#2e5a3d', cypDk: '#23452f', cypLt: '#4d7d4f', thu: '#3b6b43', thuLt: '#5f9153', thuDk: '#2a5134',
    shrub: '#557f45', shrubLt: '#79a45a', leafLt: '#c6e0b0', leafMid: '#9fc88a', soil: '#4b3a2c', soilDk: '#35291f', bark: '#6b5140', barkDk: '#4c3a2e',
    flowers: ['#f2d45a', '#e98ab0', '#b79ae6', '#f4f1e6', '#7fb6e6', '#f0a15a'],
    timber: '#b08a64', timberDk: '#86684b',
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
  const ucyl = (seg, open) => tpl('ucyl|' + seg + (open ? 'o' : ''), () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, !!open));
  const ccyl = (B, mat, c, r, h, x, y, z, o = {}) => B.add(mat, ucyl(o.seg ?? 8, o.open), c, x, y, z, { ...o, sx: r, sy: h, sz: r });
  const cone = (seg) => tpl('ucone|' + seg, () => new THREE.CylinderGeometry(0, 1, 1, seg, 1, false));
  const puff = (det, seed) => tpl('pf|' + det + '|' + seed, () => puffGeo(det, seed));
  const blob = (det, seed) => tpl('bl|' + det + '|' + seed, () => blobGeo(1, det, seed));
  // a beam (box, or a low-poly cylinder with round: true) between two local points, section w × h
  function seg(B, mat, c, a, b, w, h, o = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
    const ry = Math.atan2(-dz, dx), rz = Math.atan2(dy, Math.hypot(dx, dz));
    B.push((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, ry, 0, rz);
    if (o.round) B.add(mat, ucyl(o.seg ?? 6), c, 0, 0, 0, { rz: HP, sx: w / 2, sy: L, sz: h / 2, glow: o.glow });
    else pbox(B, mat, c, L, h, w, 0, 0, 0, { glow: o.glow });
    B.pop();
  }
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
  // Rounded bold sans (cap height 1): centre-line strokes, round caps + joins, flat faces (the canal pack's font,
  // Alterna's stencil signage is drawn with it too — each pack keeps its own copy).
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
    '>': [0.46, [[0, 0.9], [0.46, 0.45], [0, 0]]],
    '<': [0.46, [[0.46, 0.9], [0, 0.45], [0.46, 0]]],
    '^': [0.5, [[0, 0.5], [0.25, 1], [0.5, 0.5]], [[0.25, 1], [0.25, 0]]],
  };
  const DOTS = { '·': [[0, 0.46]], '.': [[0, 0]], ':': [[0, 0.1], [0, 0.62]] };
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
    const rings = pts.map((p, i) => { const [nx, ny, k] = N[i]; return [g.v(p[0] + nx * k * hw, p[1] + ny * k * hw, d, 0, 0, 1), g.v(p[0] - nx * k * hw, p[1] - ny * k * hw, d, 0, 0, 1)]; });
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) { const A = rings[i], Bq = rings[(i + 1) % n]; g.quad(A[0], A[1], Bq[1], Bq[0]); }
  }
  function disc(g, cx, cy, r, d, sg, a0 = 0, a1 = TAU) {
    const full = a1 - a0 > TAU - 1e-4, c0 = g.v(cx, cy, d, 0, 0, 1), f = [], n = full ? sg : sg + 1;
    for (let k = 0; k < n; k++) { const a = a0 + ((a1 - a0) * k) / sg; f.push(g.v(cx + Math.cos(a) * r, cy + Math.sin(a) * r, d, 0, 0, 1)); }
    for (let k = 0; k < sg; k++) g.tri(c0, f[k], f[full ? (k + 1) % sg : k + 1]);
  }
  function glyph(ch, wt, ds = 8) {
    return tpl(['gl', ch, wt, ds].map(kf).join('|'), () => {
      const s = 1 - wt, hw = wt / 2, T = (p) => [hw + p[0] * s, hw + p[1] * s];
      const g = new GB();
      const def = GL[ch];
      if (DOTS[ch] && !def) { for (const p of DOTS[ch]) { const q = T(p); disc(g, hw * 1.15, q[1], hw * 1.15, 0, ds); } return { geo: g.geo(), adv: wt * 1.3 }; }
      if (!def) return { geo: null, adv: SPACE };
      const [w, ...strokes] = def;
      strokes.forEach((st, si) => {
        const d = si * 0.0004;
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
      if (DOTS[ch]) for (const p of DOTS[ch]) { const q = T(p); disc(g, q[0], q[1], hw * 1.1, 0, ds); }
      return { geo: g.geo(), adv: w * s + wt };
    });
  }
  const textW = (str, wt = 0.17, track = 0.12) => { let w = 0; const cs = [...str]; cs.forEach((ch, i) => { w += ch === ' ' ? SPACE : glyph(ch, wt).adv; if (i < cs.length - 1) w += track; }); return w; };
  // a line of flat letters facing +Z in the current frame; returns the width (m)
  function letters(B, str, o = {}) {
    const h = o.h ?? 0.3, wt = o.wt ?? 0.17, track = o.track ?? 0.12;
    const W = textW(str, wt, track) * h;
    let x = o.align === 'left' ? 0 : o.align === 'right' ? -W : -W / 2;
    const cs = [...str];
    cs.forEach((ch, i) => {
      if (ch === ' ') { x += (SPACE + track) * h; return; }
      const gi = glyph(ch, wt);
      if (gi.geo) B.add(NS(o.mat ?? 'paint'), gi.geo, o.c ?? K.black, (o.x ?? 0) + x, o.y ?? 0, o.z ?? 0, { s: h, sz: 1, glow: o.glow, ao: false });
      x += (gi.adv + (i < cs.length - 1 ? track : 0)) * h;
    });
    return W;
  }
  // flush sign board with flat letters (board centred at x, y; faces +Z); returns the board width
  function boardSign(B, text, x, y, o = {}) {
    const lines = Array.isArray(text) ? text : [text];
    const h = o.h ?? 0.2, lh = h * (o.lead ?? 1.5), pad = o.pad ?? h * 0.6;
    const W = o.w ?? Math.max(...lines.map((t) => textW(t, o.wt ?? 0.18, o.track ?? 0.12))) * h + pad * 2;
    const Hb = o.hb ?? h + lh * (lines.length - 1) + pad * 1.1, bd = o.bd ?? 0.04, z = o.z ?? 0;
    pbox(B, o.boardMat ?? 'paint', o.board ?? K.mod, W, Hb, bd, x, y, z + bd / 2);
    if (o.border) { pbox(B, NS('paint'), o.border, W - 0.04, Hb - 0.04, 0.004, x, y, z + bd + 0.001); pbox(B, NS('paint'), o.board ?? K.mod, W - 0.08, Hb - 0.08, 0.004, x, y, z + bd + 0.003); }
    lines.forEach((t, i) => letters(B, t, { h, x: x + (o.align === 'left' ? -W / 2 + pad : 0), align: o.align, y: y + (lh * (lines.length - 1)) / 2 - i * lh - h / 2, z: z + bd + 0.006, c: o.c ?? K.label, wt: o.wt ?? 0.18, track: o.track, mat: o.mat, glow: o.glow }));
    return W;
  }

  // ------------------------------------------------------------------------------------------ fittings
  // tubular steel railing from a to b (local points [x, y, z], y = ground height), posts every ≤ gap, top + mid rail
  function railing(B, a, b, o = {}) {
    const h = o.h ?? 1.0, c = o.c ?? K.steelLt, L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.ceil(L / (o.gap ?? 1.5)));
    for (let i = 0; i <= n; i++) {
      if (o.skipPosts && o.skipPosts.includes(i)) continue;
      const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      ccyl(B, 'metal', c, 0.028, h, x, y + h / 2, z, { seg: 8 });
    }
    seg(B, 'metal', c, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.05, 0.05, { round: true, seg: 8 });
    if (o.mid !== false) seg(B, 'metal', c, [a[0], a[1] + h * 0.5, a[2]], [b[0], b[1] + h * 0.5, b[2]], 0.03, 0.03, { round: true, seg: 6 });
    if (o.kick) seg(B, 'metal', c, [a[0], a[1] + 0.06, a[2]], [b[0], b[1] + 0.06, b[2]], 0.02, 0.1);
  }
  // a red valve wheel on a stub pipe (facing +Z), radius r
  function valve(B, x, y, z, r = 0.16) {
    ccyl(B, 'metal', K.steel, 0.04, 0.16, x, y, z + 0.08, { rx: HP, seg: 8 });
    B.tor('gloss', K.red, r, r * 0.16, x, y, z + 0.18, { rs: 5, ts: 16 });
    for (let k = 0; k < 3; k++) seg(B, 'gloss', K.red, [x, y, z + 0.18], [x + Math.cos((k / 3) * TAU) * r, y + Math.sin((k / 3) * TAU) * r, z + 0.18], 0.025, 0.025);
    ccyl(B, 'gloss', K.redDk, 0.035, 0.06, x, y, z + 0.18, { rx: HP, seg: 8 });
  }

  // ------------------------------------------------------------------------------------------ planting
  // evergreen (Hinoki cypress / Thujopsis): a straight trunk under stacked, drooping foliage tiers — each tier a
  // skirt of sprays (a lathe cone whose rim is jagged into spray tips), darker under and inside, lighter at the tips.
  // kind 'hinoki': a tall narrow cone (dense tiers); 'thujopsis': broader, flatter tiers in layers with gaps (the
  // layered sprays read), a softer top. Local: base at y 0, height ≈ h.
  const evGeo = (kind, seed) => tpl('ev|' + kind + '|' + seed, () => {
    const parts = [];
    const r = (i) => hash(seed * 13.7 + i * 7.3);
    const th = kind === 'thujopsis';
    const nT = th ? 7 : 10;
    const base = th ? 0.33 : 0.25;
    for (let i = 0; i < nT; i++) {
      const t = i / (nT - 1);
      const y0 = (th ? 0.12 : 0.09) + t * (th ? 0.66 : 0.76);
      const rad = base * (th ? 1 - t * 0.72 : Math.pow(1 - t * 0.9, 0.85)) * (0.93 + 0.14 * r(i));
      const hh = (th ? 0.2 : 0.17) * (1 - t * 0.3);
      const sg = th ? 11 : 9;
      const g = new GB();
      const ring = (yy, rr, jag, cMul) => {
        const ids = [];
        for (let k = 0; k < sg * 2; k++) {
          const a = (k / (sg * 2)) * TAU + r(i + 30) * 3, tip = k % 2 === 0;
          const rj = rr * (tip ? 1 : 1 - jag) * (0.94 + 0.12 * hash(seed + i * 17 + k));
          const cx = Math.cos(a), cz = Math.sin(a);
          const c = cMul * (tip ? 1.08 : 0.9);
          ids.push(g.v(cx * rj, yy - (tip ? hh * 0.18 : 0), cz * rj, cx * 0.8, 0.45, cz * 0.8, c * 0.94, c, c * 0.92));
        }
        return ids;
      };
      const rim = ring(y0, rad, th ? 0.26 : 0.14, 0.9 + 0.2 * t);
      const mid = ring(y0 + hh * 0.55, rad * 0.55, 0.12, 0.98 + 0.14 * t);
      const top = g.v(0, y0 + hh, 0, 0, 1, 0, 1.1, 1.14, 1.05);
      const n = rim.length;
      for (let k = 0; k < n; k++) { g.quad(rim[k], rim[(k + 1) % n], mid[(k + 1) % n], mid[k]); g.tri(mid[k], mid[(k + 1) % n], top); }
      // underside (a shallow cone back to the trunk: seen from below the tier reads dark)
      const und = g.v(0, y0 - hh * 0.06, 0, 0, -1, 0, 0.55, 0.58, 0.55);
      for (let k = 0; k < n; k++) g.tri(rim[(k + 1) % n], rim[k], und);
      parts.push(g.geo());
    }
    return parts;
  });
  // tree at (x, y, z): height h, colour tone c. Hinoki: a soft cone of layered fan sprays (flattened leafy plates
  // round the trunk in tiers, drooping a little at the tips, a filled core, a rounded top); Thujopsis: broader, flatter
  // plates in distinct layers with gaps between them. The trunk shows below the first tier.
  function evergreen(B, x, y, z, h, o = {}) {
    const kind = o.kind ?? 'hinoki', seed = (o.seed ?? 1) % 9, c = o.c ?? (kind === 'thujopsis' ? K.thu : K.cyp);
    const w = o.w ?? 1, th = kind === 'thujopsis', r = (i) => hash(seed * 13.7 + i * 7.3);
    // lite (the groves' fill trees): fewer tiers and sprays, low-detail cores — about half the triangles, same outline
    const lite = !!o.lite, det = lite ? 0 : o.det ?? (h > 5 ? 1 : 0);
    B.push(x, y, z, o.rot ?? hash(seed * 3.3) * TAU, 0, 0);
    ccyl(B, 'wood', K.bark, 0.06 + 0.012 * h, h * (th ? 0.34 : 0.26), 0, h * (th ? 0.17 : 0.13), 0, { seg: lite ? 5 : 7 });
    const nT = lite ? (th ? 5 : 7) : th ? 7 : 10, base = h * w * (th ? 0.34 : 0.27);
    const cDk = mixc(c, '#1c3322', 0.35), cLt = mixc(c, th ? K.thuLt : K.cypLt, 0.5);
    for (let i = 0; i < nT; i++) {
      const t = i / (nT - 1);
      const yy = h * ((th ? 0.2 : 0.14) + t * (th ? 0.66 : 0.72));
      const R = base * (th ? 1 - t * 0.72 : Math.pow(1 - t * 0.88, 0.9)) * (0.92 + 0.16 * r(i));
      const k = lite ? Math.max(2, Math.round((th ? 5 : 4) * (1 - t * 0.5))) : Math.max(3, Math.round((th ? 7 : 6) * (1 - t * 0.55)));
      const ph = r(i + 20) * TAU;
      // the core of the tier
      B.add('foliage', puff(det, (seed + i) % 6), mixc(cDk, c, 0.4 + 0.3 * t), 0, yy, 0, { sx: R * 0.72, sy: R * (th ? 0.36 : 0.52), sz: R * 0.72 });
      // fan sprays round it (flattened, reaching out, tips drooping)
      for (let j = 0; j < k; j++) {
        const a = ph + (j / k) * TAU + (r(i * 9 + j) - 0.5) * 0.5, rr = R * (0.55 + 0.1 * r(i * 5 + j));
        const sw = lite ? 1.18 : 1;   // (fewer sprays: each a little broader)
        B.add('foliage', puff(0, (seed + i + j) % 6), mixc(c, cLt, 0.2 + 0.5 * r(i * 3 + j) * (0.4 + 0.6 * t)), Math.cos(a) * rr, yy - R * 0.08, Math.sin(a) * rr,
          { sx: R * 0.55 * sw, sy: R * (th ? 0.2 : 0.28) * (lite ? 1.12 : 1), sz: R * 0.4 * sw, ry: -a, rz: -0.22 });
      }
    }
    B.add('foliage', puff(det, seed % 6), cLt, 0, h * (th ? 0.84 : 0.88), 0, { sx: base * (th ? 0.3 : 0.22), sy: h * 0.07, sz: base * (th ? 0.3 : 0.22) });
    if (!th) B.add('foliage', puff(0, (seed + 3) % 6), cLt, 0, h * 0.94, 0, { sx: base * 0.1, sy: h * 0.05, sz: base * 0.1 });
    B.pop();
  }
  // a clump of shrub puffs (visual) of width w at (x, y, z)
  function shrub(B, x, y, z, w, seed, c, o = {}) {
    const n = o.n ?? 4 + (seed % 3);
    for (let i = 0; i < n; i++) {
      const a = hash(seed + i * 3.1) * TAU, rr = w * 0.3 * hash(seed * 2 + i);
      const s = w * (0.22 + 0.12 * hash(seed * 5 + i));
      B.add(o.ns ? NS('foliage') : 'foliage', puff(1, (seed + i) % 6), mixc(c ?? K.shrub, K.shrubLt, hash(seed + i) * 0.4), x + Math.cos(a) * rr, y + s * 0.55, z + Math.sin(a) * rr, { sx: s, sy: s * (o.flat ?? 0.8), sz: s * 0.9 });
    }
  }
  // flowers: little heads (tiny puffs) scattered over a w × d bed at height y
  function flowerBed(B, x, y, z, w, d, n, seed, o = {}) {
    const cols = o.cols ?? K.flowers;
    for (let i = 0; i < n; i++) {
      const fx = x + (hash(seed + i * 1.7) - 0.5) * w, fz = z + (hash(seed * 3 + i * 2.3) - 0.5) * d, s = 0.045 + 0.04 * hash(seed + i * 5.1);
      B.add(NS('foliage'), blob(0, i % 8), cols[(seed + i) % cols.length], fx, y + (o.lift ?? 0.1) + hash(i + seed) * (o.spread ?? 0.12), fz, { s, ao: false });
    }
  }

  return { K, NS, GB, TPL, tpl, kf, hash, pbox, ucyl, ccyl, cone, puff, blob, seg, colC, colSeg, ROOF, RAIL, PERCH, EA, letters, textW, boardSign, glyph,
    railing, valve, evGeo, evergreen, shrub, flowerBed, col, shade, mixc, latheGeo, extrudeGeo, tubeGeo };
}
