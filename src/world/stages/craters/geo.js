// Turf War Craters — geometry helpers for layout.js (pure data: no three.js, importable in Node).
//
//   topOf(piece, x, z)      the top surface of a layout piece over (x, z) (null = not over it), as level.js builds it
//   Raster / tile()         the ground builder: a 0.25 m raster of cells (0 = no ground, 1 = ground needed, 2 = may be
//                           ground: hidden under something standing on it) tiled with as few big axis-aligned slabs as
//                           it takes (greedy largest rectangles). Curved / diagonal edges are always hidden under a rim,
//                           a revetment or a bank block, so the slabs never show a staircase.
//   cone / ring helpers     the craters: a bowl of radial ramp facets (their overlap is the true polyhedral cone:
//                           each facet is the highest surface in its own sector), crest segments round the rim.
import { B, R, O } from '../../mapkit.js';

export const DEG = Math.PI / 180;
export const r3 = (v) => Math.round(v * 1000) / 1000;

// ---------------------------------------------------------------------------------------------------- surfaces
export function topOf(d, x, z) {
  if (d.kind === 'box') return x < d.min[0] || x > d.max[0] || z < d.min[2] || z > d.max[2] ? null : d.max[1];
  if (d.kind === 'obox') {
    const a = d.rotY * DEG, c = Math.cos(a), s = Math.sin(a), dx = x - d.center[0], dz = z - d.center[2];
    const u = dx * c - dz * s, v = dx * s + dz * c;   // level.js: axes[0] = (c, 0, −s), axes[2] = (s, 0, c)
    return Math.abs(u) > d.size[0] / 2 || Math.abs(v) > d.size[2] / 2 ? null : d.center[1] + d.size[1] / 2;
  }
  const [lx, ly, lz] = d.low, [hx, hy, hz] = d.high;
  const fx = hx - lx, fz = hz - lz, run = Math.hypot(fx, fz), ux = fx / run, uz = fz / run;
  const rise = hy - ly, ext = (0.6 * run) / Math.hypot(run, rise);
  const dx = x - lx, dz = z - lz, along = dx * ux + dz * uz, lat = -dx * uz + dz * ux;
  if (Math.abs(lat) > d.width / 2 || along < -ext || along > run) return null;
  return ly + (along * rise) / run;
}
// XZ bounding box of a piece
export function aabbOf(d) {
  if (d.kind === 'box') return [d.min[0], d.max[0], d.min[2], d.max[2]];
  let pts;
  if (d.kind === 'obox') {
    const a = d.rotY * DEG, c = Math.cos(a), s = Math.sin(a), hx = d.size[0] / 2, hz = d.size[2] / 2;
    pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => [d.center[0] + c * hx * i + s * hz * k, d.center[2] - s * hx * i + c * hz * k]);
  } else {
    const [lx, , lz] = d.low, [hx, , hz] = d.high, L = Math.hypot(hx - lx, hz - lz), ux = (hx - lx) / L, uz = (hz - lz) / L, w = d.width / 2;
    const a = [lx - ux * 0.6, lz - uz * 0.6];
    pts = [[a[0] - uz * w, a[1] + ux * w], [a[0] + uz * w, a[1] - ux * w], [hx - uz * w, hz + ux * w], [hx + uz * w, hz - ux * w]];
  }
  return [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
}
// a coarse spatial index of pieces (2 m cells) for point queries
export class PieceIndex {
  constructor(items, cell = 2) {
    this.cell = cell; this.map = new Map();
    for (const it of items) {
      const [x0, x1, z0, z1] = aabbOf(it.d);
      for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
        const k = i * 4096 + j; let l = this.map.get(k); if (!l) this.map.set(k, (l = [])); l.push(it);
      }
    }
  }
  at(x, z) { return this.map.get(Math.floor(x / this.cell) * 4096 + Math.floor(z / this.cell)) || []; }
}
export const mirrorDef = (d) => (d.kind === 'box' ? { ...d, min: [-d.max[0], d.min[1], -d.max[2]], max: [-d.min[0], d.max[1], -d.min[2]] }
  : d.kind === 'obox' ? { ...d, center: [-d.center[0], d.center[1], -d.center[2]] }
  : { ...d, low: [-d.low[0], d.low[1], -d.low[2]], high: [-d.high[0], d.high[1], -d.high[2]] });

// ---------------------------------------------------------------------------------------------------- shapes (2D)
export function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export const inRect = (r, x, z) => x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3];
// turned rectangle: centre, direction (deg, 0 = +x, 90 = +z) of its length, length, width
export function inStrip(s, x, z) {
  const a = s.deg * DEG, ux = Math.cos(a), uz = Math.sin(a), dx = x - s.cx, dz = z - s.cz;
  return Math.abs(dx * ux + dz * uz) <= s.len / 2 && Math.abs(-dx * uz + dz * ux) <= s.w / 2;
}
// a strip between two points (centre line a → b, width w)
export const strip = (a, b, w) => ({ cx: (a[0] + b[0]) / 2, cz: (a[1] + b[1]) / 2, deg: Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG, len: Math.hypot(b[0] - a[0], b[1] - a[1]), w });
// an obox for a strip (O() turns by −deg: its local x runs along the strip)
export const stripBox = (s, y0, y1, o = {}) => O(s.cx, s.cz, s.len, s.w, y0, y1, -s.deg, o);

// ---------------------------------------------------------------------------------------------------- raster tiler
export class Raster {
  constructor(x0, x1, z0, z1, res = 0.25) {
    Object.assign(this, { x0, z0, res, nx: Math.round((x1 - x0) / res), nz: Math.round((z1 - z0) / res) });
    this.s = new Uint8Array(this.nx * this.nz);
  }
  cx(i) { return this.x0 + (i + 0.5) * this.res; }
  cz(j) { return this.z0 + (j + 0.5) * this.res; }
  fill(fn) { for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) this.s[j * this.nx + i] = fn(this.cx(i), this.cz(j)); return this; }
  // greedy cover of every "needed" cell with non-overlapping rectangles of needed / optional cells (largest first)
  tile() {
    const { nx, nz, s } = this, N = nx * nz, avail = new Uint8Array(N);
    let need = 0;
    for (let k = 0; k < N; k++) { avail[k] = s[k] ? 1 : 0; if (s[k] === 1) need++; }
    const out = [], h = new Int32Array(nx), st = new Int32Array(nx + 1);
    for (let guard = 0; need > 0 && guard < 4000; guard++) {
      // largest rectangle of available cells (histogram per row)
      let best = 0, bi0 = 0, bi1 = 0, bj0 = 0, bj1 = 0;
      h.fill(0);
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) h[i] = avail[j * nx + i] ? h[i] + 1 : 0;
        let top = 0;
        for (let i = 0; i <= nx; i++) {
          const hi = i < nx ? h[i] : 0;
          while (top > 0 && h[st[top - 1]] >= hi) {
            const hh = h[st[--top]], left = top > 0 ? st[top - 1] + 1 : 0, a = hh * (i - left);
            if (a > best) { best = a; bi0 = left; bi1 = i; bj0 = j - hh + 1; bj1 = j + 1; }
          }
          st[top++] = i;
        }
      }
      if (!best) break;
      let cnt = 0;
      for (let j = bj0; j < bj1; j++) for (let i = bi0; i < bi1; i++) if (s[j * nx + i] === 1) cnt++;
      for (let j = bj0; j < bj1; j++) for (let i = bi0; i < bi1; i++) { const k = j * nx + i; if (cnt && s[k] === 1) need--; avail[k] = 0; }
      if (cnt) out.push({ x0: this.x0 + bi0 * this.res, x1: this.x0 + bi1 * this.res, z0: this.z0 + bj0 * this.res, z1: this.z0 + bj1 * this.res });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------------------------------- trenches
// A trench along the polyline pts (w wide inside, revetments t thick both sides): its interior as strips (run on past
// each dog-leg so the outer corner is inside too) and its walls as turned boxes along the mitred offsets of the centre
// line (a little longer at the joins so the outer corner closes; legs alternate their parapet height so the overlaps
// at the joins never z-fight), plus end walls across both ends. top(i) = leg i's parapet height; opts(i) = piece opts.
// o.gaps['i:+1' | 'i:-1'] = [[s0, s1], …] openings in leg i's left (+1) / right (−1) wall, metres from the leg's start;
// o.ends = [start, end]: false leaves that end open (stairs up out of it are the caller's)
export function trench(pts, w, t, y0, top, opts = () => ({}), o = {}) {
  const n = pts.length, dir = [], legs = [], walls = [], ends = o.ends || [true, true];
  for (let i = 0; i < n - 1; i++) { const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], L = Math.hypot(dx, dz); dir.push([dx / L, dz / L]); }
  const turn = (i) => (i <= 0 || i >= n - 1 ? 0 : Math.acos(Math.max(-1, Math.min(1, dir[i - 1][0] * dir[i][0] + dir[i - 1][1] * dir[i][1]))));
  for (let i = 0; i < n - 1; i++) {
    const [ux, uz] = dir[i], a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ea = Math.tan(turn(i) / 2) * (w / 2), eb = Math.tan(turn(i + 1) / 2) * (w / 2);
    legs.push(strip([a[0] - ux * ea, a[1] - uz * ea], [b[0] + ux * eb, b[1] + uz * eb], w));
    for (const sg of [-1, 1]) {
      const off = (w + t) / 2, nx = -uz * sg * off, nz = ux * sg * off;
      // run on at a join by the mitre on the outer side; the inner side stops at the mitre (never into the trench)
      const inner = (k) => { if (k <= 0 || k >= n - 1) return false; const c = dir[k - 1][0] * dir[k][1] - dir[k - 1][1] * dir[k][0]; return Math.sign(c) === sg; };
      const ext = (k, first) => (first ? (i === 0 ? (ends[0] ? t : t) : inner(k) ? -Math.tan(turn(k) / 2) * (w / 2) : Math.tan(turn(k) / 2) * (w / 2 + t) + 0.05)
        : (i === n - 2 ? t : inner(k) ? -Math.tan(turn(k) / 2) * (w / 2) : Math.tan(turn(k) / 2) * (w / 2 + t) + 0.05));
      let s0 = -ext(i, true); const s1 = len + ext(i + 1, false);
      const gaps = ((o.gaps && o.gaps[`${i}:${sg > 0 ? '+1' : '-1'}`]) || []).slice().sort((p, q) => p[0] - q[0]);
      const pieces = [];
      for (const [g0, g1] of gaps) { if (g0 > s0 + 0.05) pieces.push([s0, g0]); s0 = Math.max(s0, g1); }
      if (s1 > s0 + 0.05) pieces.push([s0, s1]);
      for (const [p0, p1] of pieces) {
        const P = [a[0] + nx + ux * p0, a[1] + nz + uz * p0], Q = [a[0] + nx + ux * p1, a[1] + nz + uz * p1];
        walls.push(stripBox(strip(P, Q, t), y0, top(i), opts(i)));
      }
    }
  }
  // end walls (between the side walls, just past each end)
  for (const [p, [ux, uz], s, i, on] of [[pts[0], dir[0], -1, 0, ends[0]], [pts[n - 1], dir[n - 2], 1, n - 2, ends[1]]]) {
    if (!on) continue;
    const c = [p[0] + (ux * s * t) / 2, p[1] + (uz * s * t) / 2];
    walls.push(stripBox({ cx: c[0], cz: c[1], deg: Math.atan2(uz, ux) / DEG + 90, len: w, w: t }, y0, top(i), opts(i)));
  }
  return { legs, walls, dir };
}

// a band just inside each edge of a polygon (its outer face on the edge: the chalk lip along the cliff top). Edge i
// runs pts[i] → pts[i + 1]; skip(i) leaves it bare. Neighbouring bands overlap at convex corners (top(i) must alternate);
// at a reflex corner (a cove) the band runs on past the corner by as much as the wedge between the two bands needs.
export function edgeBands(poly, width, y0, top, opts = () => ({}), skip = () => false) {
  const out = [], n = poly.length;
  const dirOf = (i) => { const a = poly[i], b = poly[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / L, (b[1] - a[1]) / L, L]; };
  const inwardOf = (i) => {
    const a = poly[i], b = poly[(i + 1) % n], [ux, uz] = dirOf(i), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    return inPoly(poly, mx - uz * 0.05, mz + ux * 0.05) ? [-uz, ux] : [uz, -ux];
  };
  for (let i = 0; i < n; i++) {
    if (skip(i)) continue;
    const a = poly[i], b = poly[(i + 1) % n], [ux, uz] = dirOf(i), [nx, nz] = inwardOf(i);
    // reflex end: the next edge heads out of the polygon (away from this edge's inside)
    const [vx, vz] = dirOf((i + 1) % n), reflex = vx * nx + vz * nz < -1e-6 && !skip((i + 1) % n);
    const e = reflex ? width * Math.min(1, Math.abs(ux * vz - uz * vx)) + 0.05 : 0;
    out.push(stripBox(strip([a[0] + nx * width / 2, a[1] + nz * width / 2], [b[0] + nx * width / 2 + ux * e, b[1] + nz * width / 2 + uz * e], width), y0, top(i), opts(i)));
  }
  return out;
}

// bands just outside a chain of polygon edges (the shelf at a cliff's foot): edge i runs pts[i] → pts[i + 1], for each
// i in idx. At a convex corner (seen from inside) two outside bands fan apart: the first runs on past the corner by as
// much as the wedge between them needs (neighbours overlap there: top(i) must alternate along the chain).
export function outerBands(poly, idx, width, y0, top, opts = () => ({})) {
  const n = poly.length, set = new Set(idx), out = [];
  const dirOf = (i) => { const a = poly[i], b = poly[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
  const inwardOf = (i) => {
    const a = poly[i], b = poly[(i + 1) % n], [ux, uz] = dirOf(i), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    return inPoly(poly, mx - uz * 0.05, mz + ux * 0.05) ? [-uz, ux] : [uz, -ux];
  };
  for (const i of idx) {
    const a = poly[i], b = poly[(i + 1) % n], [ux, uz] = dirOf(i), [ix, iz] = inwardOf(i), ox = -ix, oz = -iz;
    const j = (i + 1) % n, [vx, vz] = dirOf(j);
    const convex = set.has(j) && vx * ix + vz * iz > 1e-6;
    const e = convex ? width * Math.min(1, Math.abs(ux * vz - uz * vx)) + 0.05 : 0;
    out.push(stripBox(strip([a[0] + ox * width / 2, a[1] + oz * width / 2], [b[0] + ox * width / 2 + ux * e, b[1] + oz * width / 2 + uz * e], width), y0, top(i), opts(i)));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- craters
// A bowl of N radial ramp facets (facet k centred on θ = k·360/N, 0 = +x, 90 = +z): floor at yF inside apothem r0,
// rising to yR at apothem r1. Each facet is exactly as wide as its sector at r1, so the facets meet at the crest and
// overlap below it (the overlap is buried under the neighbour: the union is the true cone). `narrow[k] = [dMinus, dPlus]`
// trims a facet's sides (metres at −θ / +θ) — the cheeks of a gap. `end[k] = { r, y }` stops a facet lower (a gap).
export function coneFacets(cx, cz, N, r0, r1, yF, yR, o = {}) {
  const out = [], half = Math.PI / N, W = 2 * r1 * Math.tan(half);
  for (let k = 0; k < N; k++) {
    if (o.only && !o.only(k)) continue;
    const th = (k * 2 * half), ux = Math.cos(th), uz = Math.sin(th), tx = -uz, tz = ux;
    const [dm, dp] = (o.narrow && o.narrow[k]) || [0, 0], end = o.end && o.end[k];
    const lo = end && end.lo != null ? end.lo : 0;
    const w = (end && end.w) || W - dm - dp, off = end && end.w ? 0 : (dm - dp) / 2;
    const rr = end ? end.r : r1, yy = end ? end.y : yR;
    const low = [cx + ux * r0 + tx * off, yF, cz + uz * r0 + tz * off], high = [cx + ux * rr + tx * off, yy, cz + uz * rr + tz * off];
    out.push({ k, th: th / DEG, piece: R(low.map(r3), high.map(r3), r3(w), { ...(o.opts ? o.opts(k) : {}) }), lo });
  }
  return out;
}
// ring of N flat segments between apothems ra and rb (centred on the facets' directions), segments meet at their
// inner corners (`outer: true`: at their outer corners, overlapping inside — give neighbours different tops)
export function ringSegments(cx, cz, N, ra, rb, y0, y1, o = {}) {
  const out = [], half = Math.PI / N;
  for (let k = 0; k < N; k++) {
    if (o.only && !o.only(k)) continue;
    const th = k * 2 * half + (o.phase || 0) * DEG, ux = Math.cos(th), uz = Math.sin(th), tx = -uz, tz = ux;
    const L = 2 * (o.outer ? rb : ra) * Math.tan(half);
    let [cm, cp] = (o.cut && o.cut[k]) || [0, 0];   // metres trimmed off the −θ / +θ ends
    const len = L - cm - cp, off = (cm - cp) / 2, rm = (ra + rb) / 2;
    const top = typeof y1 === 'function' ? y1(k) : y1;
    out.push({ k, th: th / DEG, piece: O(r3(cx + ux * rm + tx * off), r3(cz + uz * rm + tz * off), r3(rb - ra), r3(len), y0, top, r3(-th / DEG), { ...(o.opts ? o.opts(k) : {}) }) });
  }
  return out;
}
