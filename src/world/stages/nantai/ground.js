// Mount Nantai — the land: the brook's banks and the promontory's outline as polygons, and the kit that builds them.
// (pure data + mapkit boxes: imported by layout.js for the ground and by props.js for the bank dressing / footprint)
//
// A region is a simple polygon (counter-clockwise, x right / z up) filled at one height: axis-aligned columns (x-slabs
// between its vertices, split so a slanted edge wanders less than its ledge is wide across one slab), each column the
// polygon's cross-section common to the whole slab, inset from slanted edges; and along every slanted edge a granite
// ledge (an O-box from below the water to a lip a little above the region) that covers the columns' stepped edge.
// Overlapping ledges step between three lips (0.12 / 0.21 / 0.3 over the region, coloured so no two that overlap share
// one), so where they meet at a corner their tops never z-fight; a ledge reaches past a reflex corner to close the wedge between it and its neighbour.
import { B, O } from '../../mapkit.js';
import { sxz } from './stretch.js';

const FL = -2.4, INSET = 0.18, LIPS = [0.12, 0.21, 0.3], DEG = 180 / Math.PI;

// ============================================================================================================
// The Nantai Brook (Alpha's reach; Bravo's is its twin): its banks as polylines, x ascending. BS = the base side, BN
// = the lawn side. Reaches: W (the weir, bending at x −16), M (the Old Stone Bridge, straight along x), E (the log
// bridge, bending at x 19). The polylines run past the land's ends (±27); the land stops at the mouths.
// ============================================================================================================
export const BS = [[-27, -11.14], [-16, -11.8], [-8, -13.8], [12, -13.8], [19, -16.2], [27, -22.14]];
export const BN = [[-27, -6.12], [-16, -7.0], [-8, -9.6], [12, -9.6], [19, -12.2], [27, -18.14]];
export const zAt = (pl, x) => {
  for (let i = 0; i < pl.length - 1; i++) { const [ax, az] = pl[i], [bx, bz] = pl[i + 1]; if (x <= bx || i === pl.length - 2) return az + ((bz - az) * (x - ax)) / (bx - ax); }
  return pl[pl.length - 1][1];
};
const on = (pl, x) => [x, +zAt(pl, x).toFixed(3)];

// ============================================================================================================
// The promontory's outline (Alpha's half; Bravo's is the 180° twin). Points run counter-clockwise round each region.
// ============================================================================================================
// the lawn's east end (+X): from the E mouth (a square bank end) out round a bay to the lookout point, in to a notch on
// the centre line (Bravo's twin of the lawn's west end continues it past z 0)
const M_NE = on(BN, 24.4), N1 = [+(M_NE[0] + 0.596 * 2.0).toFixed(3), +(M_NE[1] + 0.803 * 2.0).toFixed(3)];
export const LAWN_E = [
  [7.2, -9.6], [12, -9.6], [19, -12.2], M_NE, N1,
  [24.3, -12.7], [21.6, -11.6], [20.3, -9.5], [20.8, -7.2], [23.8, -5.8], [26.2, -4.5], [26.4, -2.4], [24.6, -1.0], [22.8, 0], [7.2, 0],
];
// the lawn's west end (−X): the centre-line notch, the weir's abutment point, the W mouth
const M_NW = on(BN, -25.2);
export const LAWN_W = [
  [-7.2, 0], [-22.8, 0], [-23.9, -1.1], [-26.0, -2.4], [-26.4, -4.4], [-25.3, -5.07], M_NW, [-16, -7.0], [-8, -9.6], [-7.2, -9.6],
];
// the base side: along the brook's south bank, round the ridge's cliff (a bay mid-way, the lookout's nose), the corner
// cut behind the spawn, the back, the corner cut, the shore trail's bent shoreline (a deep bay, the switchback point)
const M_SE = on(BS, 24.6), S1 = [+(M_SE[0] - 0.596 * 1.8).toFixed(3), +(M_SE[1] - 0.803 * 1.8).toFixed(3)];
const M_SW = on(BS, -25.9);
// (the Long Stages stretch, stretch.js: the points beyond the cut move out with the base; the slice's own stretch of
// cliff and shore is drawn in between — the ridge's cliff bulges out to a point under the solar tower's shoulder and
// falls back into a bay; the shore trail narrows past the terrace, then opens out round the rock garden's point)
const RIDGE_SLICE = [[-24.0, -34.2], [-26.3, -37.6], [-26.7, -41.2], [-25.3, -44.6], [-23.5, -47.8], [-23.3, -51.4], [-24.1, -54.6]];
const SHORE_SLICE = [[22.6, -54.4], [24.8, -51.8], [25.8, -48.4], [25.2, -45.0], [23.2, -42.4], [21.8, -39.4], [21.6, -36.0], [22.0, -33.2]];
export const RIDGE_EDGE = [[-26.3, -19.2], [-26.5, -21.6], [-24.3, -24.2], [-22.6, -27.6], [-22.7, -31.0], ...RIDGE_SLICE,
  ...[[-24.6, -33.6], [-26.2, -36.6], [-25.9, -39.4], [-20, -45.4]].map(sxz)];
export const SHORE_EDGE = [...[[22.4, -45.4], [24.3, -41.6], [24.6, -39.8], [23.6, -37.6], [21.9, -35.8], [21.5, -33.0]].map(sxz), ...SHORE_SLICE,
  [22.8, -30.4], [25.6, -28.2], [26.3, -25.0], S1];
export const BASE = [
  M_SE, [19, -16.2], [12, -13.8], [-8, -13.8], [-16, -11.8], M_SW, [-26.3, -15.2],
  ...RIDGE_EDGE, ...SHORE_EDGE,
];
// the ridge (2.6): its cliff is the outline from the nose to the corner cut
export const RIDGE = [[-19, -19.2], ...RIDGE_EDGE, sxz([-19, -45.4])];

// ============================================================================================================
// The kit
// ============================================================================================================
const area2 = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length]; a += x0 * z1 - x1 * z0; } return a; };
const axial = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 || Math.abs(a[1] - b[1]) < 1e-6;
// the interior angle at vertex i (degrees)
function interior(P, i) {
  const n = P.length, a = P[(i - 1 + n) % n], v = P[i], b = P[(i + 1) % n];
  const d1 = [v[0] - a[0], v[1] - a[1]], d2 = [b[0] - v[0], b[1] - v[1]];
  const turn = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]) * DEG;   // + = left (convex in a CCW ring)
  return 180 - turn;
}

// fill(P, o): o = { y0, top, mk (() → block opts, columns), ledge(i) → null | { w, mk?, skip?, pin? } for edge i (P[i] →
// P[i+1]) } → { cols, ledges, feet } (feet: the ledges' footprints for the environment, see props.js nantai_foot)
export function fill(P, o) {
  if (area2(P) < 0) throw new Error('nantai ground: polygon must run counter-clockwise');
  const n = P.length, edges = [];
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    const L = o.ledge && !axial(a, b) ? o.ledge(i, a, b) : null;
    edges.push({ i, a, b, slant: !axial(a, b), L });
  }
  // --- columns
  const xs = [...new Set(P.map((p) => +p[0].toFixed(4)))].sort((p, q) => p - q);
  const cols = [];
  for (let k = 0; k < xs.length - 1; k++) {
    const X0 = xs[k], X1 = xs[k + 1];
    if (X1 - X0 < 0.02) continue;
    const xm = (X0 + X1) / 2;
    const cross = edges.filter((e) => Math.min(e.a[0], e.b[0]) < xm && Math.max(e.a[0], e.b[0]) > xm);
    // split the slab so each slanted edge wanders ≤ its cover (ledge width) minus the inset across one column
    let wMax = 4;
    for (const e of cross) {
      if (!e.slant) continue;
      const s = Math.abs((e.b[1] - e.a[1]) / (e.b[0] - e.a[0])), w = e.L ? e.L.w : 0.6;
      wMax = Math.min(wMax, Math.max(0.25, ((w - INSET - 0.12) * Math.sqrt(1 + s * s)) / s));
    }
    const m = Math.ceil((X1 - X0) / wMax - 1e-6);
    for (let j = 0; j < m; j++) {
      const xa = X0 + ((X1 - X0) * j) / m, xb = X0 + ((X1 - X0) * (j + 1)) / m, xc = (xa + xb) / 2;
      const zOf = (e, x) => e.a[1] + ((e.b[1] - e.a[1]) * (x - e.a[0])) / (e.b[0] - e.a[0]);
      const hits = cross.map((e) => ({ e, zc: zOf(e, xc), za: zOf(e, xa), zb: zOf(e, xb) })).sort((p, q) => p.zc - q.zc);
      for (let h = 0; h + 1 < hits.length; h += 2) {
        const lo = Math.max(hits[h].za, hits[h].zb) + (hits[h].e.slant ? INSET : 0);
        const hi = Math.min(hits[h + 1].za, hits[h + 1].zb) - (hits[h + 1].e.slant ? INSET : 0);
        if (hi - lo > 0.08) cols.push(B(+xa.toFixed(4), +xb.toFixed(4), o.y0, o.top, +lo.toFixed(4), +hi.toFixed(4), o.mk()));
      }
    }
  }
  // --- ledges
  const rects = [];
  for (const e of edges) {
    if (!e.L || e.L.skip) continue;
    const [ax, az] = e.a, [bx, bz] = e.b, dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const nx = -uz, nz = ux;                                   // inward (left of a CCW ring)
    const w = e.L.w;
    // ends: reach past a reflex corner (close the wedge), pull back from an acute one (never poke into the water)
    const endAdj = (vi) => { const a = interior(P, vi); if (a > 181) return w * Math.tan(((a - 180) * Math.PI) / 360) + 0.06; if (a < 89) return -w / Math.tan((a * Math.PI) / 180); return 0; };
    const e0 = endAdj(e.i), e1 = endAdj((e.i + 1) % n);
    const len = L + e0 + e1, off = (e1 - e0) / 2;
    const cx = (ax + bx) / 2 + ux * off + (nx * w) / 2, cz = (az + bz) / 2 + uz * off + (nz * w) / 2;
    rects.push({ e, cx, cz, len, w, ux, uz, rot: -Math.atan2(uz, ux) * DEG });
  }
  // lips: greedy colouring over the overlap graph (SAT on the turned rects), alternating along the ring by preference
  const corners = (r) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => [r.cx + r.ux * (r.len / 2) * i - r.uz * (r.w / 2) * k, r.cz + r.uz * (r.len / 2) * i + r.ux * (r.w / 2) * k]);
  const overlap = (A, Bq) => {
    const ca = corners(A), cb = corners(Bq);
    for (const [px, pz] of [[A.ux, A.uz], [-A.uz, A.ux], [Bq.ux, Bq.uz], [-Bq.uz, Bq.ux]]) {
      const pa = ca.map((c) => c[0] * px + c[1] * pz), pb = cb.map((c) => c[0] * px + c[1] * pz);
      if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) < 1e-3) return false;
    }
    return true;
  };
  rects.forEach((r, k) => {
    const used = new Set(rects.slice(0, k).filter((q) => overlap(q, r)).map((q) => q.lip));
    const pref = k > 0 ? (rects[k - 1].lip + 1) % 3 : 0;
    r.lip = [pref, (pref + 1) % 3, (pref + 2) % 3].find((v) => !used.has(v)) ?? pref;
    if (used.has(r.lip)) console.warn('[nantai] ground: ledge lip clash at edge', r.e.i);
  });
  const ledges = [], feet = [];
  for (const r of rects) {
    const top = o.top + LIPS[r.lip];
    ledges.push(O(+r.cx.toFixed(4), +r.cz.toFixed(4), +r.len.toFixed(4), r.w, FL, +top.toFixed(3), +r.rot.toFixed(4), (r.e.L.mk || o.ledgeMk)()));
    feet.push({ cx: +r.cx.toFixed(4), cz: +r.cz.toFixed(4), len: +r.len.toFixed(4), w: r.w, rot: +r.rot.toFixed(4) });
  }
  return { cols, ledges, feet };
}
// the outline's corners that come out acute (a ledge there is pulled back): for checks
export const acuteCorners = (P) => P.map((p, i) => [p, interior(P, i)]).filter(([, a]) => a < 89);
