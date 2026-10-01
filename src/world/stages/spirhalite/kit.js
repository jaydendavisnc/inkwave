// Spirhalite Islands — shared helpers for this stage's prop builders (props-*.js). Everything is made from the THREE
// handed over in the prop pack helpers (H.THREE): this file imports nothing, so props.js stays importable in Node.
//
// makeKit(H) → { THREE, K (palette), GB, tpl, meshGeo, pbox, colBox, ROOF, RAIL, PERCH, NS, noise3, fbm3, rng, lerp,
//               smooth, sweep, rockGeo, leafGeo, ... }
export function makeKit(H) {
  const { THREE } = H;
  const PI = Math.PI, TAU = PI * 2, HP = PI / 2;
  const NS = (m) => (H.noShadow ? H.noShadow(m) : m);

  // ------------------------------------------------------------------------------------------------ palette
  // pale weathered stone, bleached driftwood, canvas and expedition steel; muted so team ink stays the loudest thing
  const K = {
    stone: '#c7c1b3', stoneLt: '#d9d4c8', stoneDk: '#9d978a', stoneWet: '#7d7a70', algae: '#6f7d5a', rock: '#aaa397', rockDk: '#7f796e',
    sand: '#ece5d6', sandDk: '#d6ccb8', moss: '#8e9d6a', mossDk: '#6d7c50', mossLt: '#aab884',
    leaf: '#5f7a45', leafDk: '#465f35', leafLt: '#86a060', trunk: '#5b5a3d', trunkDk: '#43432c', root: '#6e5236',
    pom: '#e4c643', pomDk: '#c9a52c', stalk: '#7d8d4c', grass: '#9aa76a', grassDry: '#c5bd8a',
    drift: '#bfb3a0', driftDk: '#978a76', wood: '#a88963', woodDk: '#7b6246', rope: '#cdb88c',
    canvas: '#d8ccb0', canvasDk: '#b8aa8c', tarp: '#3f8d86', tarpDk: '#2f6c67', olive: '#6f7250',
    steel: '#8e979c', steelDk: '#5a6267', steelLt: '#b7bec2', paint: '#384a5c', navy: '#2e3b4f',
    yellow: '#e2b53a', orange: '#d9773a', red: '#b8493f', white: '#eeeae2', black: '#26282c', glass: '#2b3a44', glassLt: '#557083',
    glow: '#ffd79a', glowCool: '#dff2ff', floatGlass: '#5f9a7c', floatGlassLt: '#8cc3a0',
    dc1: '#4b3f78', dc2: '#e0b640', dc3: '#2b2d3a',   // Deep Cut: dusk purple, eel gold, abyss navy
  };

  // ------------------------------------------------------------------------------------------------ geometry
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
  // indexed mesh from raw arrays: smooth normals from the faces, vertex colours (default white)
  function meshGeo(pos, idx, col = null) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const n = pos.length / 3;
    g.setAttribute('color', new THREE.Float32BufferAttribute(col || new Array(n * 3).fill(1), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    return g;
  }
  const TPL = new Map();
  const tpl = (key, fn) => { let g = TPL.get(key); if (!g) { g = fn(); TPL.set(key, g); } return g; };
  const boxG = () => tpl('box1', () => { const g = new THREE.BoxGeometry(1, 1, 1); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(72).fill(1), 3)); return g; });
  // sharp box (w × h × d, base at y) — for thin parts where the kit's chamfer is too round
  const pbox = (B, mat, c, w, h, d, x, y, z, o = {}) => B.add(mat, boxG(), c, x, y + h / 2, z, { ...o, sx: w, sy: h, sz: d });
  const ROOF = { roof: true }, RAIL = { rail: true }, PERCH = { perch: true };
  // collider: centre x/z, base y, size (local frame)
  const colBox = (B, x, y, z, w, h, d, flags) => B.col(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, flags);

  // ------------------------------------------------------------------------------------------------ noise
  const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  const smooth = (t) => t * t * (3 - 2 * t);
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
    const L = (a, b, t) => a + (b - a) * t;
    const h = (i, j, k) => hash3(xi + i, yi + j, zi + k);
    return L(L(L(h(0, 0, 0), h(1, 0, 0), xf), L(h(0, 1, 0), h(1, 1, 0), xf), yf), L(L(h(0, 0, 1), h(1, 0, 1), xf), L(h(0, 1, 1), h(1, 1, 1), xf), yf), zf) * 2 - 1;
  }
  const fbm3 = (x, y, z, oct = 3) => { let s = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { s += a * noise3(x, y, z); n += a; x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; } return s / n; };
  function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const col3 = (hex) => new THREE.Color(hex);

  // ------------------------------------------------------------------------------------------------ shapes
  // Sweep: a closed cross-section ring along a centreline. frames(t) → { p: [x,y,z], n: [x,y,z] (section "up"),
  // b: [x,y,z] (section "side") }, ring(t, k) → [u, v] offsets (along n, b) for ring sample k of nk. Returns raw arrays.
  function sweep(nt, nk, frame, ring, colour) {
    const pos = [], idx = [], col = [];
    for (let i = 0; i <= nt; i++) {
      const t = i / nt, f = frame(t);
      for (let k = 0; k < nk; k++) {
        const [u, v] = ring(t, k);
        const x = f.p[0] + f.n[0] * u + f.b[0] * v, y = f.p[1] + f.n[1] * u + f.b[1] * v, z = f.p[2] + f.n[2] * u + f.b[2] * v;
        pos.push(x, y, z);
        const c = colour ? colour(x, y, z, t, k) : [1, 1, 1];
        col.push(c[0], c[1], c[2]);
      }
    }
    for (let i = 0; i < nt; i++) for (let k = 0; k < nk; k++) {
      const a = i * nk + k, b = i * nk + ((k + 1) % nk), c = (i + 1) * nk + ((k + 1) % nk), d = (i + 1) * nk + k;
      idx.push(a, b, c, a, c, d);
    }
    return { pos, idx, col };
  }
  // weld a non-indexed geometry's coincident vertices (smooth normals after displacement)
  function weld(g) {
    const P = g.attributes.position, map = new Map(), pos = [], idx = [];
    for (let i = 0; i < P.count; i++) {
      const k = `${P.getX(i).toFixed(4)},${P.getY(i).toFixed(4)},${P.getZ(i).toFixed(4)}`;
      let j = map.get(k);
      if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(P.getX(i), P.getY(i), P.getZ(i)); }
      idx.push(j);
    }
    return { pos, idx };
  }
  // lumpy rock: a welded icosphere displaced by fbm and squashed, lit from above (vertex colour: darker underside)
  function rockGeo(seed, det = 1, sx = 1, sy = 0.7, sz = 1, lump = 0.28) {
    return tpl(`rock|${seed}|${det}|${sx}|${sy}|${sz}|${lump}`, () => {
      const { pos, idx } = weld(new THREE.IcosahedronGeometry(1, det));
      const col = [];
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i], y = pos[i + 1], z = pos[i + 2];
        const d = 1 + lump * fbm3(x * 1.6 + seed * 3.1, y * 1.6 - seed, z * 1.6 + seed * 0.7, 3) + 0.08 * noise3(x * 5 + seed, y * 5, z * 5);
        pos[i] = x * d * sx; pos[i + 1] = y * d * sy; pos[i + 2] = z * d * sz;
        const t = clamp((y + 1) / 2, 0, 1), c = 0.72 + 0.34 * t + 0.06 * noise3(x * 3 + seed, y * 3, z * 3);
        col.push(c, c, c * 0.98);
      }
      return meshGeo(pos, idx, col);
    });
  }
  return { THREE, PI, TAU, HP, NS, K, GB, meshGeo, tpl, boxG, pbox, ROOF, RAIL, PERCH, colBox, noise3, fbm3, hash3, rng, lerp, clamp, smooth, col3, sweep, rockGeo, weld };
}
