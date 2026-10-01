// Spirhalite Islands — organic island outlines built from the level's boxes (imported by layout.js; pure data, no three).
//
// The level is made of boxes, and two boxes may only overlap where their tops differ by ≥ 8 cm (check-maps: equal
// tops z-fight). An island is an outline polygon [[x, z], …]:
//   • shelf  — a wet-sand bar runs inside every outline edge (SHELF wide), its top a few cm under the dry sand
//              (LEVELS, alternating edge to edge so neighbouring bars never share a top): the organic beach band
//   • cores  — the dry sand at 0: axis-aligned slabs laid greedily on a raster (the biggest rectangle of free cells
//              first), touching each other and never overlapping, until every point the bars don't reach is covered.
//              They stay ≥ INSET inside the outline and tuck over the bars, so the band shows as a lower lip all round.
// A point-symmetric outline (the whole arena's landmass) is authored as its Alpha half chain P … −P; the bars and cores
// of the Alpha half go in the layout's `half` list and the mirror builds the rest.
import { B, O } from '../../mapkit.js';

export const SHELF = 1.5;                          // bar width (m)
export const LEVELS = [-0.09, -0.18, -0.27, -0.36]; // bar tops (the third only where an odd chain wraps round; the fourth: reflex patches)
const INSET = 0.45, CELL = 0.5, BOT = -2.4;

export const polyArea = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length]; a += x0 * z1 - x1 * z0; } return a / 2; };
export function inPoly(p, x, z) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; }
  return c;
}
function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}
export function edgeDist(p, x, z) { let d = Infinity; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; d = Math.min(d, segDist(x, z, a[0], a[1], b[0], b[1])); } return d; }

// the full outline of a point-symmetric island from its Alpha half chain (P … −P exclusive of −P's repeat)
export const symOutline = (chain) => [...chain, ...chain.map(([x, z]) => [-x, -z])];

// wet-sand bars along the edges of `poly` (indices `only`: which edges to emit; heights from `level(i)`)
export function shelfBars(poly, { only = null, level = (i) => LEVELS[i % 2], w = SHELF, opts = {} } = {}) {
  const s = polyArea(poly) > 0 ? 1 : -1, out = [];
  for (let i = 0; i < poly.length; i++) {
    if (only && !only(i)) continue;
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz * s, nz = ux * s;   // (n: inward)
    const cx = (x0 + x1) / 2 + (nx * w) / 2, cz = (z0 + z1) / 2 + (nz * w) / 2;
    const deg = (Math.atan2(-dz, dx) * 180) / Math.PI;
    out.push(O(+cx.toFixed(4), +cz.toFixed(4), +L.toFixed(4), w, BOT, level(i), +deg.toFixed(4), { ...opts, shelf: [x0, z0, x1, z1] }));
  }
  return out;
}
// reflex (inward) corners: the two bars' end caps leave a wedge between them — a small square patch, lower still,
// laid along the corner's inward bisector fills it (vertices `only(i)`; vertex i joins edge i − 1 and edge i)
export function reflexPatches(poly, { only = null, size = 1.3, top = LEVELS[3], opts = {} } = {}) {
  const s = polyArea(poly) > 0 ? 1 : -1, n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    if (only && !only(i)) continue;
    const [px, pz] = poly[(i + n - 1) % n], [vx, vz] = poly[i], [qx, qz] = poly[(i + 1) % n];
    const ax = vx - px, az = vz - pz, bx = qx - vx, bz = qz - vz;
    if ((ax * bz - az * bx) * s >= -1e-9) continue;                       // convex (or straight): the bars meet
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    // inward bisector: sum of the two edges' inward normals
    let nx = (-az / la - bz / lb) * s, nz = (ax / la + bx / lb) * s; const l = Math.hypot(nx, nz); nx /= l; nz /= l;
    const deg = (Math.atan2(-nz, nx) * 180) / Math.PI;
    out.push(O(+(vx + (nx * size) / 2).toFixed(4), +(vz + (nz * size) / 2).toFixed(4), size, size, BOT, top, +deg.toFixed(4), { ...opts, patch: true }));
  }
  return out;
}
// the bars' cover test (a point inside any bar's rectangle)
function inBars(bars, x, z) {
  for (const b of bars) {
    const a = (b.rotY * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), dx = x - b.center[0], dz = z - b.center[2];
    if (Math.abs(dx * c - dz * s) <= b.size[0] / 2 && Math.abs(dx * s + dz * c) <= b.size[2] / 2) return true;
  }
  return false;
}

// Dry-sand cores over `poly` (restricted to the window {x0,x1,z0,z1}); `pre` = rectangles already laid (never overlapped),
// `bars` = the shelf bars (what they cover needs no core). Returns boxes [x0, x1, z0, z1].
export function coreRects(poly, bars, win, pre = []) {
  const nx = Math.round((win.x1 - win.x0) / CELL), nz = Math.round((win.z1 - win.z0) / CELL);
  const X = (i) => win.x0 + i * CELL, Z = (j) => win.z0 + j * CELL;
  const inPre = (x, z) => pre.some((r) => x > r[0] && x < r[1] && z > r[2] && z < r[3]);
  const ok = new Uint8Array(nx * nz), need = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const cx = X(i + 0.5), cz = Z(j + 0.5);
    if (inPre(cx, cz)) continue;
    const corners = [[X(i), Z(j)], [X(i + 1), Z(j)], [X(i + 1), Z(j + 1)], [X(i), Z(j + 1)]];
    const inside = corners.every(([x, z]) => inPoly(poly, x, z) && edgeDist(poly, x, z) >= INSET - 1e-6);
    if (inside) ok[j * nx + i] = 1;
    // needed: any sample of the cell inside the island that no bar covers
    for (const [x, z] of [[cx, cz], ...corners.map(([x, z]) => [x + (cx - x) * 0.1, z + (cz - z) * 0.1])]) if (inPoly(poly, x, z) && !inBars(bars, x, z)) { need[j * nx + i] = 1; break; }
  }
  const used = new Uint8Array(nx * nz), rects = [];
  const left = () => { for (let k = 0; k < nx * nz; k++) if (need[k] && !used[k]) return true; return false; };
  const h = new Int32Array(nx);
  const ps = new Int32Array((nx + 1) * (nz + 1));   // prefix sums of still-needed cells (O(1) "covers one?" test)
  for (let guard = 0; guard < 400 && left(); guard++) {
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) ps[(j + 1) * (nx + 1) + i + 1] = (need[j * nx + i] && !used[j * nx + i] ? 1 : 0) + ps[j * (nx + 1) + i + 1] + ps[(j + 1) * (nx + 1) + i] - ps[j * (nx + 1) + i];
    const cnt = (i0, i1, j0, j1) => ps[(j1 + 1) * (nx + 1) + i1 + 1] - ps[j0 * (nx + 1) + i1 + 1] - ps[(j1 + 1) * (nx + 1) + i0] + ps[j0 * (nx + 1) + i0];
    // largest all-free rectangle (histogram method) that covers at least one still-needed cell
    let best = null, bestA = 0;
    h.fill(0);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) h[i] = ok[j * nx + i] && !used[j * nx + i] ? h[i] + 1 : 0;
      for (let i = 0; i < nx; i++) {
        let mh = Infinity;
        for (let k = i; k < nx && h[k] > 0; k++) {
          mh = Math.min(mh, h[k]);
          const a = (k - i + 1) * mh;
          if (a > bestA && cnt(i, k, j - mh + 1, j) > 0) { bestA = a; best = [i, k, j - mh + 1, j]; }
        }
      }
    }
    if (!best) break;
    const [i0, i1, j0, j1] = best;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) used[j * nx + i] = 1;
    rects.push([X(i0), X(i1 + 1), Z(j0), Z(j1 + 1)]);
  }
  const miss = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (need[j * nx + i] && !used[j * nx + i]) miss.push([X(i + 0.5), Z(j + 0.5)]);
  return { rects, miss };
}
export const coreBoxes = (rects, opts) => rects.map(([x0, x1, z0, z1]) => B(x0, x1, BOT, 0, z0, z1, opts));
