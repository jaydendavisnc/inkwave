// Pure-math generators behind environment.js (no three.js import, so the same module also runs as a Worker):
// value noise, the tileable wave texture, the foam distance field and the island terrain mesh. Loaded as a module
// Worker it answers { fn, args } with { r } (typed arrays transferred), so the ~0.6 s of CPU they cost at boot runs on
// other cores (runJob).
import { PLAYER } from '../config.js';

const WATER_Y = PLAYER.waterY;

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export function fbm(x, y, oct = 4) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x, y); n += a; x = x * 2.03 + 5.3; y = y * 2.03 - 1.7; a *= 0.5; } return s / n; }
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Tileable wave normal/height texture from integer-frequency sine sums (perfectly periodic). RGBA8: gradient x/y,
// height^1.8, 255.
export function waveData(size = 256, seed = 11) {
  const rnd = mulberry(seed);
  const waves = [];
  const wind = 0.55;
  for (let i = 0; i < 44; i++) {
    const f = 2 + Math.pow(rnd(), 1.5) * 26;
    const ang = wind + (rnd() - 0.5) * 2.4;
    let kx = Math.round(Math.cos(ang) * f), ky = Math.round(Math.sin(ang) * f);
    if (kx === 0 && ky === 0) kx = 2;
    const kl = Math.hypot(kx, ky);
    waves.push([kx, ky, 1 / Math.pow(kl, 1.3), rnd() * Math.PI * 2]);
  }
  const N = size * size;
  const H = new Float32Array(N), GX = new Float32Array(N), GY = new Float32Array(N);
  let hMin = Infinity, hMax = -Infinity, gMax = 0;
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let h = 0, gx = 0, gy = 0;
      for (let k = 0; k < waves.length; k++) {
        const w = waves[k];
        const ph = TAU * (w[0] * u + w[1] * v) + w[3];
        const s = Math.sin(ph), c = Math.cos(ph);
        h += w[2] * s; gx += w[2] * w[0] * c; gy += w[2] * w[1] * c;
      }
      const i = y * size + x;
      H[i] = h; GX[i] = gx; GY[i] = gy;
      if (h < hMin) hMin = h; if (h > hMax) hMax = h;
      gMax = Math.max(gMax, Math.abs(gx), Math.abs(gy));
    }
  }
  const data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const hn = (H[i] - hMin) / (hMax - hMin);
    data[i * 4] = Math.round((GX[i] / gMax * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round((GY[i] / gMax * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round(Math.pow(hn, 1.8) * 255);
    data[i * 4 + 3] = 255;
  }
  return data;
}

// Distance field (metres, 0..range → 0..255) to capsule shapes { ax, az, bx, bz, r, reach } around the deck.
// Marina mode: finer (0.1 m) and short-range (2.5 m, 1 cm steps), fed by the real waterline contours.
export function foamField(shapes, b, marina) {
  const pad = 22, res = marina ? 0.1 : 0.2, range = marina ? 2.5 : 8;
  const minX = b.minX - pad, minZ = b.minZ - pad;
  const W = Math.ceil((b.maxX - b.minX + pad * 2) / res), H = Math.ceil((b.maxZ - b.minZ + pad * 2) / res);
  const data = new Uint8Array(W * H).fill(255);
  const segDist = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
    const ex = px - ax - dx * t, ez = pz - az - dz * t;
    return Math.sqrt(ex * ex + ez * ez);   // not Math.hypot: the hot loop (hypot is several × slower)
  };
  for (const s of shapes) {
    const reach = s.r + Math.min(s.reach ?? 3, range);   // beyond r + range every texel saturates to 255 (a no-op)
    const x0 = Math.max(0, Math.floor((Math.min(s.ax, s.bx) - reach - minX) / res)), x1 = Math.min(W - 1, Math.ceil((Math.max(s.ax, s.bx) + reach - minX) / res));
    const z0 = Math.max(0, Math.floor((Math.min(s.az, s.bz) - reach - minZ) / res)), z1 = Math.min(H - 1, Math.ceil((Math.max(s.az, s.bz) + reach - minZ) / res));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
      const px = minX + (i + 0.5) * res, pz = minZ + (j + 0.5) * res;
      const d = Math.max(0, segDist(px, pz, s.ax, s.az, s.bx, s.bz) - s.r);
      const v = Math.min(255, Math.round((d / range) * 255));
      const k = j * W + i;
      if (v < data[k]) data[k] = v;
    }
  }
  return { data, W, H, minX, minZ, res, range };
}

// Smooth stylised island/hill height field (local coords: unit ellipse, rotated/scaled into the world).
export function islandField(o) {
  const { x: cx, z: cz, rx, rz, h, seed = 1, rot = 0, plateau = false, ridge = 0.3 } = o;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const hLocal = (lx, lz) => {
    const r = Math.sqrt(lx * lx + lz * lz);
    const a = Math.atan2(lz, lx);
    const edge = 1 + (fbm(Math.cos(a) * 1.2 + seed * 3.7, Math.sin(a) * 1.2 - seed * 1.9, 3) - 0.5) * 0.34;
    const f = r / edge;
    if (f >= 1) return -(f - 1) * 30 - 0.6;
    const n = fbm(lx * 1.15 + seed * 5.1, lz * 1.15 - seed * 2.3, 4);
    if (plateau) return h * smooth(1.0, 0.8, f) * (0.92 + 0.16 * n) + (1 - f) * 0.6 - 0.35;
    // rounded ridgelines: smooth |x| keeps crests soft (stylised, no knife edges), gentle spurs down the flanks
    const q = 2 * fbm(lx * 1.7 + seed * 1.7, lz * 1.7 - seed * 0.9, 3) - 1;
    const rg = 1 - Math.sqrt(q * q + 0.035);
    const prof = Math.pow(1 - f * f, 1.35);
    return h * prof * (0.52 + 0.6 * n + ridge * rg * rg) + (1 - f) * 0.6 - 0.35;
  };
  const toLocal = (wx, wz) => { const dx = wx - cx, dz = wz - cz; return [(dx * cr + dz * sr) / rx, (-dx * sr + dz * cr) / rz]; };
  const toWorld = (lx, lz) => [cx + lx * rx * cr - lz * rz * sr, cz + lx * rx * sr + lz * rz * cr];
  return { hLocal, toLocal, toWorld };
}

// Indexed radial grid for one island: smooth analytic normals from the height field (never the mesh facets), vertex
// colour = grass tint (linear rgb) × a little per-metre variation, glow = baked fold AO from the height laplacian.
function islandGrid(o, tint) {
  const { rx, rz, h, R = 12, S = 44 } = o;
  const { hLocal, toLocal, toWorld } = islandField(o);
  const pos = [], col = [], ao = [], idx = [], nor = [];
  const dl = 0.05;
  const eW = Math.max(rx, rz) * 0.012;
  const hW = (wx, wz) => { const [lx, lz] = toLocal(wx, wz); return hLocal(lx, lz); };
  const push = (lx, lz, yOverride) => {
    const [wx, wz] = toWorld(lx, lz);
    const hy = yOverride ?? hLocal(lx, lz);
    pos.push(wx, WATER_Y + hy, wz);
    if (yOverride !== undefined) nor.push(0, 1, 0);
    else {
      const gx = (hW(wx + eW, wz) - hW(wx - eW, wz)) / (2 * eW), gz = (hW(wx, wz + eW) - hW(wx, wz - eW)) / (2 * eW);
      const il = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      nor.push(-gx * il, il, -gz * il);
    }
    const tv = 0.94 + 0.12 * hash2(Math.round(wx), Math.round(wz));
    col.push(tint[0] * tv, tint[1] * tv, tint[2] * tv);
    // fold AO from the local height laplacian (concave → darker)
    const lap = (hLocal(lx + dl, lz) + hLocal(lx - dl, lz) + hLocal(lx, lz + dl) + hLocal(lx, lz - dl)) / 4 - hy;
    ao.push(yOverride !== undefined ? 1 : 1 - Math.min(1, Math.max(0, lap / (0.02 * h + 0.4))) * 0.42);
  };
  push(0, 0);
  const rings = R + 2;
  for (let k = 1; k < rings; k++) {
    const f = k === rings - 1 ? 1.4 : (k / R) * 1.1;
    for (let sI = 0; sI < S; sI++) {
      const a = (sI / S) * Math.PI * 2;
      push(Math.cos(a) * f, Math.sin(a) * f, k === rings - 1 ? -6 : undefined);
    }
  }
  const ring = (k, sI) => 1 + (k - 1) * S + ((sI + S) % S);
  for (let sI = 0; sI < S; sI++) idx.push(0, ring(1, sI + 1), ring(1, sI));
  for (let k = 1; k < rings - 1; k++) {
    for (let sI = 0; sI < S; sI++) {
      const a = ring(k, sI), b = ring(k, sI + 1), c = ring(k + 1, sI + 1), d = ring(k + 1, sI);
      idx.push(a, c, d, a, b, c);
    }
  }
  return { pos, nor, col, ao, idx };
}

// All islands merged into one non-indexed triangle soup (what prep() + mergeGeometries used to produce):
// { position, normal, color, glow } Float32Arrays. islands = [{ ...makeIsland opts, tint: [r, g, b] (linear) }].
export function islandMesh(islands) {
  const grids = islands.map((o) => islandGrid(o, o.tint));
  const n = grids.reduce((s, g) => s + g.idx.length, 0);
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), color = new Float32Array(n * 3), glow = new Float32Array(n);
  let v = 0;
  for (const g of grids) {
    for (const i of g.idx) {
      for (let c = 0; c < 3; c++) { position[v * 3 + c] = g.pos[i * 3 + c]; normal[v * 3 + c] = g.nor[i * 3 + c]; color[v * 3 + c] = g.col[i * 3 + c]; }
      glow[v++] = g.ao[i];
    }
  }
  return { position, normal, color, glow };
}

const JOBS = { waveData, foamField, islandMesh };

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = ({ data: { fn, args } }) => {
    const r = JOBS[fn](...args);
    const transfer = [];
    for (const v of Object.values(r instanceof Uint8Array ? { r } : r)) if (ArrayBuffer.isView(v)) transfer.push(v.buffer);
    self.postMessage({ r }, transfer);
  };
}

// Runs a generator on its own Worker (jobs run in parallel, one core each) and resolves with its result; runs it
// inline instead when a module Worker can't be created or fails to load.
export function runJob(fn, ...args) {
  let w;
  try { w = new Worker(new URL('./envgen.js', import.meta.url), { type: 'module' }); } catch { return Promise.resolve(JOBS[fn](...args)); }
  return new Promise((resolve) => {
    w.onmessage = ({ data }) => { w.terminate(); resolve(data.r); };
    w.onerror = (e) => { e.preventDefault(); w.terminate(); resolve(JOBS[fn](...args)); };
    w.postMessage({ fn, args });
  });
}
