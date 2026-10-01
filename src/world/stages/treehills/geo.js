// Eco-Forest Treehills — the ground kit: a tier region (a simple polygon, counter-clockwise, x right / z up) filled at
// one height as level boxes. Pure data + mapkit boxes (imported by layout.js for the ground and by props.js for the
// retaining-wall dressing and the environment's footprint), nothing that imports three.
//
// A region is laid as axis-aligned columns (x-slabs between its vertices, split so a slanted edge wanders less than its
// coping is wide across one slab): each column is the polygon's cross-section common to the whole slab, inset from the
// slanted edges. Along every slanted edge an engineered retaining wall with its coping (an O-box from under the
// reservoir to a lip a little above the region) covers the columns' stepped edge. Where two regions share a slanted
// edge both sides get one (the lower side's reads as the kerb at the foot of the higher wall). Overlapping copings step
// between three lips (LIPS over the region) so no two that overlap share a top (no z-fighting at the corners); a coping
// reaches past a reflex corner to close the wedge between it and its neighbour, and pulls back from an acute one.
import { B, O } from '../../mapkit.js';

export const FL = -2.4;                               // column / wall bottoms (the reservoir is at −1.6)
const INSET = 0.16, LIPS = [0.14, 0.22, 0.3], DEG = 180 / Math.PI;

export const area2 = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length]; a += x0 * z1 - x1 * z0; } return a; };
const axial = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 || Math.abs(a[1] - b[1]) < 1e-6;
// the interior angle at vertex i (degrees)
function interior(P, i) {
  const n = P.length, a = P[(i - 1 + n) % n], v = P[i], b = P[(i + 1) % n];
  const d1 = [v[0] - a[0], v[1] - a[1]], d2 = [b[0] - v[0], b[1] - v[1]];
  const turn = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]) * DEG;   // + = left (convex in a CCW ring)
  return 180 - turn;
}
// point in polygon (even-odd)
export function inPoly(P, x, z) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// fill(P, o): o = { y0, top, mk (() → block opts, columns), ledge(i, a, b) → null | { w, mk?, skip? } for the slanted
// edge i (P[i] → P[i+1]); default { w: 0.8 }; extend: at an acute corner run on to the vertex (poking into a
// same-height neighbour) instead of pulling back } → { cols, ledges, feet, edges } (feet: every coping's footprint, for the
// environment's deck outline; edges: the slanted edges with their inward normal, for the wall dressing)
export function fill(P, o) {
  if (area2(P) < 0) throw new Error('treehills ground: polygon must run counter-clockwise');
  const n = P.length, edges = [];
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    const slant = !axial(a, b);
    const L = slant ? (o.ledge ? o.ledge(i, a, b) : { w: 0.8 }) : null;
    edges.push({ i, a, b, slant, L });
  }
  // --- columns
  const xs = [...new Set(P.map((p) => +p[0].toFixed(4)))].sort((p, q) => p - q);
  const cols = [];
  for (let k = 0; k < xs.length - 1; k++) {
    const X0 = xs[k], X1 = xs[k + 1];
    if (X1 - X0 < 0.02) continue;
    const xm = (X0 + X1) / 2;
    const cross = edges.filter((e) => Math.min(e.a[0], e.b[0]) < xm && Math.max(e.a[0], e.b[0]) > xm);
    let wMax = o.colMax ?? 6;
    for (const e of cross) {
      if (!e.slant) continue;
      const s = Math.abs((e.b[1] - e.a[1]) / (e.b[0] - e.a[0])), w = e.L && !e.L.skip ? e.L.w : 0.6;
      wMax = Math.min(wMax, Math.max(0.25, ((w - INSET - 0.1) * Math.sqrt(1 + s * s)) / s));
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
  // --- copings (retaining walls on the slanted edges)
  const rects = [];
  for (const e of edges) {
    if (!e.L || e.L.skip) continue;
    const [ax, az] = e.a, [bx, bz] = e.b, dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const nx = -uz, nz = ux;                                   // inward (left of a CCW ring)
    const w = e.L.w;
    const endAdj = (vi) => { const a = interior(P, vi); if (a > 181) return w * Math.tan(((a - 180) * Math.PI) / 360) + 0.06; if (a < 89) return e.L.extend ? 0 : -w / Math.tan((a * Math.PI) / 180); return 0; };
    const e0 = endAdj(e.i), e1 = endAdj((e.i + 1) % n);
    const len = L + e0 + e1, off = (e1 - e0) / 2;
    const cx = (ax + bx) / 2 + ux * off + (nx * w) / 2, cz = (az + bz) / 2 + uz * off + (nz * w) / 2;
    rects.push({ e, cx, cz, len, w, ux, uz, nx, nz, rot: -Math.atan2(uz, ux) * DEG });
  }
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
    const pref = r.e.L.lip ?? (k > 0 ? (rects[k - 1].lip + 1) % 3 : 1);
    r.lip = [pref, (pref + 1) % 3, (pref + 2) % 3].find((v) => !used.has(v)) ?? pref;
  });
  const ledges = [], feet = [], walls = [];
  for (const r of rects) {
    const top = o.top + LIPS[r.lip];
    ledges.push(O(+r.cx.toFixed(4), +r.cz.toFixed(4), +r.len.toFixed(4), r.w, r.e.L.y0 ?? FL, +top.toFixed(3), +r.rot.toFixed(4), (r.e.L.mk || o.mkLedge)()));
    feet.push({ cx: +r.cx.toFixed(4), cz: +r.cz.toFixed(4), len: +r.len.toFixed(4), w: r.w, rot: +r.rot.toFixed(4) });
    walls.push({ a: r.e.a, b: r.e.b, nx: r.nx, nz: r.nz, top, w: r.w, outer: !!r.e.L.outer });
  }
  return { cols, ledges, feet, walls };
}

// kerbs(regions, all, o): a coping kerb (W wide, H high, on top of the tier) along every axis-aligned edge of the
// authored regions where the ground beyond is lower (another tier's wall or the reservoir) — the slanted edges have
// their retaining-wall copings already. regions: [{ P, top, mk }] authored; all: [{ P, top }] every region incl. the
// mirrored twins (for what lies beyond an edge); o.skip: [[x0, x1, z0, z1], …] where no kerb goes (stair heads, the
// tower's crossings, the copings' footprints are skipped automatically via o.feet). Edges along x run full length;
// edges along z stop W short of a corner so the kerbs never overlap.
export function kerbs(regions, all, o = {}) {
  const W = o.w ?? 0.3, H = o.h ?? 0.16, STEP = 0.1, out = [];
  const heightAt = (x, z) => { let h = -1.6; for (const r of all) if (r.top > h && inPoly(r.P, x, z)) h = r.top; return h; };
  const inRect = (x, z, r) => x > r[0] && x < r[1] && z > r[2] && z < r[3];
  const inFoot = (x, z) => (o.feet || []).some((f) => {
    const a = (f.rot * Math.PI) / 180, ux = Math.cos(a), uz = -Math.sin(a), dx = x - f.cx, dz = z - f.cz;
    return Math.abs(dx * ux + dz * uz) < f.len / 2 + 0.4 && Math.abs(-dx * uz + dz * ux) < f.w / 2 + 0.4;
  }) || (o.feet || []).some((f) => {
    const a = (f.rot * Math.PI) / 180, ux = Math.cos(a), uz = -Math.sin(a), dx = x + f.cx, dz = z + f.cz;
    return Math.abs(dx * ux + dz * uz) < f.len / 2 + 0.4 && Math.abs(-dx * uz + dz * ux) < f.w / 2 + 0.4;
  });
  for (const reg of regions) {
    const P = reg.P, n = P.length;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      if (!axial(a, b)) continue;
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux;   // n inward
      const alongX = Math.abs(uz) < 1e-6;
      const cut0 = alongX ? 0 : W, cut1 = alongX ? 0 : W;
      let run = null;
      const flush = () => { if (run && run[1] - run[0] > 0.5) out.push(run); run = null; };
      const runs = [];
      for (let s = cut0 + STEP / 2; s < L - cut1; s += STEP) {
        const px = a[0] + ux * s, pz = a[1] + uz * s;
        const inside = [px + nx * W * 0.5, pz + nz * W * 0.5], outside = [px - nx * 0.25, pz - nz * 0.25];
        const ok = heightAt(outside[0], outside[1]) < reg.top - 0.5 && !(o.skip || []).some((r) => inRect(inside[0], inside[1], r)) && !inFoot(inside[0], inside[1]);
        if (ok) { if (!run) run = [s - STEP / 2, s + STEP / 2]; else run[1] = s + STEP / 2; } else if (run) { if (run[1] - run[0] > 0.5) runs.push(run); run = null; }
      }
      if (run && run[1] - run[0] > 0.5) runs.push(run);
      for (let [s0, s1] of runs) {
        s0 = Math.max(s0, cut0); s1 = Math.min(s1, L - cut1);
        const x0 = a[0] + ux * s0, z0 = a[1] + uz * s0, x1 = a[0] + ux * s1, z1 = a[1] + uz * s1;
        const xs = [x0, x1, x0 + nx * W, x1 + nx * W], zs = [z0, z1, z0 + nz * W, z1 + nz * W];
        out.push(B(+Math.min(...xs).toFixed(4), +Math.max(...xs).toFixed(4), reg.top, +(reg.top + H).toFixed(3), +Math.min(...zs).toFixed(4), +Math.max(...zs).toFixed(4), reg.mk()));
      }
      void flush;
    }
  }
  return out;
}
