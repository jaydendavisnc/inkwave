// Terrace Heights — stage layout (src/world/stages/terraces/). The stage owns every file in this folder:
//   layout.js    level geometry (this file)        props.js    prop pack + placements (set dressing)
//   surfaces.js  stage surface materials (texlib)  murals.js   stage decals / signage (mural atlas)
import { PATTERN, B, R, O } from '../../mapkit.js';
import { SURF } from './surfaces.js';
import { MURAL } from './murals.js';

// ------------------------------------------------------------------------------------------------------------
// Terrace Heights — a whitewashed hill village on two headlands joined by a piazza. Each team's village climbs its own
// hill in curved terraces that follow the contour lines; the hills sit on opposite wings of the map (Alpha to the
// south-west, Bravo to the north-east), so the playable ground reads as a sweeping S of two round hills around the
// Piazzetta, with arrow bastions, a headland and coves along an irregular quay wall.
// Levels: H0 piazza / promenade 0 · H1 1.2 · H2 2.4 · H3 3.6 · H4 4.8 (spawn). Alpha at −Z (half list), Bravo is the
// 180° twin. How the ground is built (see the contour kit and the ground builder below): every level is a nested
// region (discs round the hilltop, the crescent ring round the piazza, straight clips at the incline and the back
// wall, a polygon for the quay wall); its contour line is chorded into straight terracotta coping bars, and the floor
// inside is laid as a few big turned slabs (with pebble gutters where slabs of different directions meet) — about 20
// deck slabs per half at the sea level, so the environment's sea footprint stays exact.
//   • spawn: the belvedere terrace of Villa Limoni on the hilltop (H4, a side wing of the map) — a 2.4 m drop and the
//     Scalinata straight down to the Largo in front, the forecourt to the funicular station on the right
//   • centre: Scalinata → Largo della Fontana (H2) → the Vicolo between the Caffè and the Ceramiche shop (two flights)
//     → the Piazzetta; the Caffè roof (H3) overlooks the Vicolo and the piazza
//   • right lane (−X for Alpha) "Funicolare": the funicular incline runs diagonally down the cliff edge from the upper
//     station to the piazza's west side, the car stopped halfway as cover; the curved Salita terraces beside it
//   • left lane (+X) "Limonaia": the lemon garden and pergola on the hill's east shoulder (H3), the Orto (H2), the
//     Case sul Mare over the east cove, down to the belvedere bastion by the piazza
//   • piazza: ringed by the house crescent, San Vito on its sagrato in the middle (the chapel itself, its dome and bell
//     gables are off-limits), arrow bastions with pebble compass roses projecting over the sea on both sides
// ------------------------------------------------------------------------------------------------------------
const H0 = 0, H1 = 1.2, H2 = 2.4, H3 = 3.6, H4 = 4.8, FL = -1.2;
const TH = {
  white: '#f3efe6', warm: '#f1e8d6', ochre: '#e9cf9c', pink: '#efcdbd', sky: '#dfe8ea', lemon: '#f0e2a8',
  wall: '#ddd3c1',          // retaining walls: limewash over rubble, warm grey
  step: '#ddd4c3',          // limestone steps
  cotto: '#d9d2c6', pebble: '#d8d2c6', spawn: '#eae6de', villa: '#f2e6cf', station: '#e8d9b8', rim: '#e2d6c4',
};
const T = (x0, x1, z0, z1, top, o) => B(x0, x1, FL, top, z0, z1, o);
const cotto = (o = {}) => ({ color: TH.wall, pattern: SURF.cotto ?? PATTERN.tiles, ...o });
const pebble = (o = {}) => ({ color: TH.wall, pattern: SURF.pebble ?? PATTERN.pavers, ...o });
const house = (c, o = {}) => ({ color: c, pattern: SURF.calce ?? PATTERN.render, ...o });
const stair = (o = {}) => ({ color: TH.step, pattern: PATTERN.stonestep, ...o });
// upper storeys, back walls, the chapel: scenery only — never inked, never climbed, and their tops are off-limits
// (`roof`: nobody can stand there, anyone who lands on one slides off; the pitched roofs / domes on top are props)
const NOPAINT = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
const upper = (c, o = {}) => house(c, { noPaint: NOPAINT, roof: true, ...o });
const DEG = 180 / Math.PI;

// ============================================================================================================
// Contour kit. A region is { iv(x) → sorted disjoint z-intervals, curves: boundary candidates [{ pts, nrm, norim }] }.
// Primitives: disc, rect, halfplane (line through a point, inside = left of its direction), poly; combinators union /
// inter / diff. A level = the nested region of everything at or above that height. Its contour line (curves marked
// norim are clip lines: the back wall, the half line z = 0, the incline which covers its own edge) becomes the rim — a
// chain of coping bars RIM_W wide — and the floor inside is laid by the ground builder further down.
// ============================================================================================================
// THE LONG STAGES STRETCH (2026-09-30): the hill (Alpha's spawn wing) stands DS further out along -Z than first drawn;
// the back wall with it. See the ground section below.
const DS = 22;
const ZBACK = -45.4 - DS, ZMID = 0, RIM_W = 0.8;
const Iv = {
  norm(a) { a = a.filter(([l, h]) => h - l > 1e-6).sort((p, q) => p[0] - q[0]); const o = []; for (const s of a) { if (o.length && s[0] <= o[o.length - 1][1] + 1e-9) o[o.length - 1][1] = Math.max(o[o.length - 1][1], s[1]); else o.push([s[0], s[1]]); } return o; },
  union(a, b) { return Iv.norm([...a, ...b]); },
  inter(a, b) { const o = []; for (const [l1, h1] of a) for (const [l2, h2] of b) { const l = Math.max(l1, l2), h = Math.min(h1, h2); if (h > l + 1e-9) o.push([l, h]); } return Iv.norm(o); },
  diff(a, b) { let o = a.map((s) => [...s]); for (const [l2, h2] of b) { const n = []; for (const [l, h] of o) { if (h2 <= l || l2 >= h) { n.push([l, h]); continue; } if (l2 > l) n.push([l, l2]); if (h2 < h) n.push([h2, h]); } o = n; } return Iv.norm(o); },
};
const INF = 1e6;
function disc(cx, cz, r, o = {}) {
  const n = Math.max(24, Math.ceil((2 * Math.PI * r) / 0.08)), pts = [], nrm = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); nrm.push([Math.cos(a), Math.sin(a)]); }
  return { iv: (x) => { const d = r * r - (x - cx) * (x - cx); return d > 0 ? [[cz - Math.sqrt(d), cz + Math.sqrt(d)]] : []; }, curves: [{ pts, nrm, closed: true, norim: o.norim }] };
}
function rect(x0, x1, z0, z1, o = {}) {
  const e = (ax, az, bx, bz, nx, nz) => { const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / 0.08)), pts = [], nrm = []; for (let i = 0; i <= n; i++) { pts.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n]); nrm.push([nx, nz]); } return { pts, nrm, norim: o.norim }; };
  return { iv: (x) => (x >= x0 && x <= x1 ? [[z0, z1]] : []), xs: [x0, x1], curves: [e(x0, z0, x1, z0, 0, -1), e(x1, z0, x1, z1, 1, 0), e(x1, z1, x0, z1, 0, 1), e(x0, z1, x0, z0, -1, 0)] };
}
// half-plane on the left of the directed line (ax,az)→(bx,bz); the boundary is sampled between the two points only
function halfplane(ax, az, bx, bz, o = {}) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), nx = dz / L, nz = -dx / L;   // outward normal (right side)
  const n = Math.max(2, Math.ceil(L / 0.08)), pts = [], nrm = [];
  for (let i = 0; i <= n; i++) { pts.push([ax + (dx * i) / n, az + (dz * i) / n]); nrm.push([nx, nz]); }
  // inside: nx*(x-ax) + nz*(z-az) <= 0
  const iv = (x) => { if (Math.abs(nz) < 1e-9) return nx * (x - ax) <= 0 ? [[-INF, INF]] : []; const zc = az - (nx * (x - ax)) / nz; return nz > 0 ? [[-INF, zc]] : [[zc, INF]]; };
  return { iv, curves: [{ pts, nrm, norim: o.norim }] };
}
// simple polygon (vertices in order, either winding); every edge is a rim candidate
function poly(pts, o = {}) {
  const n = pts.length;
  const R = { xs: pts.map((p) => p[0]), curves: [] };
  R.iv = (x) => { const zs = []; for (let i = 0; i < n; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n]; if ((ax <= x && bx > x) || (bx <= x && ax > x)) zs.push(az + ((bz - az) * (x - ax)) / (bx - ax)); } zs.sort((a, b) => a - b); const out = []; for (let k = 0; k + 1 < zs.length; k += 2) out.push([zs[k], zs[k + 1]]); return out; };
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n], L = Math.hypot(bx - ax, bz - az), m = Math.max(2, Math.ceil(L / 0.08));
    let nx = (bz - az) / L, nz = -(bx - ax) / L;
    if (R.iv(ax + (bx - ax) / 2 + nx * 0.01).some(([l, h]) => az + (bz - az) / 2 + nz * 0.01 >= l && az + (bz - az) / 2 + nz * 0.01 <= h)) { nx = -nx; nz = -nz; }
    const p = [], nr = []; for (let k = 0; k <= m; k++) { p.push([ax + ((bx - ax) * k) / m, az + ((bz - az) * k) / m]); nr.push([nx, nz]); }
    R.curves.push({ pts: p, nrm: nr, norim: o.norim });
  }
  return R;
}
const union = (...rs) => ({ iv: (x) => rs.reduce((a, r) => Iv.union(a, r.iv(x)), []), curves: rs.flatMap((r) => r.curves), xs: rs.flatMap((r) => r.xs || []) });
const inter = (...rs) => ({ iv: (x) => rs.slice(1).reduce((a, r) => Iv.inter(a, r.iv(x)), rs[0].iv(x)), curves: rs.flatMap((r) => r.curves), xs: rs.flatMap((r) => r.xs || []) });
const diff = (a, b) => ({ iv: (x) => Iv.diff(a.iv(x), b.iv(x)), curves: [...a.curves, ...b.curves.map((c) => ({ ...c, nrm: c.nrm.map(([p, q]) => [-p, -q]) }))], xs: [...(a.xs || []), ...(b.xs || [])] });
const inside = (r, x, z) => r.iv(x).some(([l, h]) => z >= l - 1e-7 && z <= h + 1e-7);

// SAT penetration of two turned rectangles { c:[x,z], ax:[[ux,uz],[vx,vz]], h:[hu,hv] }
const corners = (s) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => [s.c[0] + s.ax[0][0] * s.h[0] * i + s.ax[1][0] * s.h[1] * k, s.c[1] + s.ax[0][1] * s.h[0] * i + s.ax[1][1] * s.h[1] * k]);
function pen(A, Bs) {
  let min = Infinity; const ca = corners(A), cb = corners(Bs);
  for (const ax of [...A.ax, ...Bs.ax]) { const pa = ca.map((p) => p[0] * ax[0] + p[1] * ax[1]), pb = cb.map((p) => p[0] * ax[0] + p[1] * ax[1]); min = Math.min(min, Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb))); }
  return min;
}
// ============================================================================================================
// The ground (Alpha's half, z ≤ 0; the mirror builds Bravo's). The Long Stages stretch: the hilltop (the spawn, the
// villa, the upper station, the Limonaia) moved out by DS along -Z; C0 is where it was first drawn — the Largo, the Orto,
// the lanes' mid ends and the lower Scalinata are still laid out round it (mid is untouched). The band between (the old
// hilltop's ground and the DS added) is new: THE OLIVE TERRACES (the Oliveto, H3, with the village LAVATOIO on it) and
// the lemon groves (H2) round the lemon house, the funicular's gentler upper reach and the Salita beside it.
// ============================================================================================================
const C0 = [-12, -35];                                 // the hilltop as first drawn
const C = [C0[0], C0[1] - DS];                         // Alpha's hilltop (the spawn wing, south-west)
const toO = [-C[0] / Math.hypot(C[0], C[1]), -C[1] / Math.hypot(C[0], C[1])];
const toO0 = [12 / Math.hypot(12, 35), 35 / Math.hypot(12, 35)];
// the funicular incline down the west cliff edge, a polyline of two straight reaches: from the upper station (moved out
// with the hill) a gentler upper reach down to the KINK — where the first drawing's incline came down to H2 — then that
// drawing's own lower reach to the foot by the piazza (so the Salita's lower flights, the Largo's west side and the
// tower's climb there are untouched)
const INC = { top: [-24.3, H4, -41.4 - DS], kink: [-20.95, H2, -25.9], foot: [-17.6, H0, -10.4], w: 3.8 };
// the reaches: from a to b (downhill), plan direction, the normal pointing east (+x-ish), plan length
const INC_SEG = [[INC.top, INC.kink], [INC.kink, INC.foot]].map(([a, b]) => { const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz); return { a, b, dir: [dx / L, dz / L], n: [dz / L, -dx / L], L }; });
const INC_LEN = INC_SEG[0].L + INC_SEG[1].L;
// along the incline: t 0 (top) … 1 (foot) by plan length (past 1: on beyond the foot), off = metres to its east
const incSeg = (t) => { let s = t * INC_LEN; if (s <= INC_SEG[0].L) return { g: INC_SEG[0], u: s / INC_SEG[0].L }; s -= INC_SEG[0].L; return { g: INC_SEG[1], u: s / INC_SEG[1].L }; };
const incP = (t, off = 0) => { const { g, u } = incSeg(t); return [g.a[0] + (g.b[0] - g.a[0]) * u + g.n[0] * off, g.a[2] + (g.b[2] - g.a[2]) * u + g.n[1] * off]; };
const incY = (t) => { const { g, u } = incSeg(t); return g.a[1] + (g.b[1] - g.a[1]) * u; };
const incDirAt = (t) => incSeg(t).g.dir, incNAt = (t) => incSeg(t).g.n;
// where the track comes down to height y (fraction t)
const incT = (y) => { let s = 0; for (const g of INC_SEG) { if (y <= g.a[1] + 1e-9 && y >= g.b[1] - 1e-9) return (s + ((g.a[1] - y) / (g.a[1] - g.b[1])) * g.L) / INC_LEN; s += g.L; } return y > INC.top[1] ? 0 : 1; };
// half-plane with outward normal n through P (the boundary sampled ±E along the line)
const hpN = (P, n, E = 40, o = {}) => { const d = [-n[1], n[0]]; return halfplane(P[0] - d[0] * E, P[1] - d[1] * E, P[0] + d[0] * E, P[1] + d[1] * E, o); };
// the z span of a reach (the upper one runs on back past the station, the lower one on past the foot to the half line)
const reachZ = (i) => (i === 0 ? rect(-28, 28, -110, INC.kink[2], { norim: true }) : rect(-28, 28, INC.kink[2], 10, { norim: true }));
// the side of the incline `off` metres east of its centre line (outward normal west), reach by reach
const eastOf = (off) => union(...INC_SEG.map((g, i) => inter(hpN([(g.a[0] + g.b[0]) / 2 + g.n[0] * off, (g.a[2] + g.b[2]) / 2 + g.n[1] * off], [-g.n[0], -g.n[1]], 44, { norim: true }), reachZ(i))));
// the hill levels stop 0.8 m in under the incline's east edge (the ramp hides their ends); the footprint stops at its
// west parapet. North of the foot there is no incline, so nothing is clipped there.
const NORTH = rect(-28, 28, INC.foot[2] - 0.01, ZMID, { norim: true });
const eastOfIncline = union(inter(eastOf(INC.w / 2 - 0.8), rect(-28, 28, -110, INC.foot[2], { norim: true })), NORTH);
const eastOfInclineW = union(inter(eastOf(-INC.w / 2 - 0.3), rect(-28, 28, -110, INC.foot[2], { norim: true })), NORTH);
// the Salita: a 4 m street beside the incline that steps down with it — level L stops there where the track comes down
// to it (so the ground never rises above the track), each cut a 1.2 m step with a flight of stairs
const SAL_W = 4.2, T_CUT = { 4: incT(4.704), 3: incT(3.624), 2: incT(2.424), 1: incT(1.224) };
const salStrip = union(...INC_SEG.map((g, i) => inter(hpN([(g.a[0] + g.b[0]) / 2 + g.n[0] * (INC.w / 2 + SAL_W), (g.a[2] + g.b[2]) / 2 + g.n[1] * (INC.w / 2 + SAL_W)], g.n, 44), reachZ(i))));
const salitaCut = (L) => { const d = incDirAt(T_CUT[L]); return inter(hpN(incP(T_CUT[L]), [-d[0], -d[1]], 12), salStrip); };
const zone = (r, west = eastOfIncline, L = 0) => inter(L ? diff(r, salitaCut(L)) : r, west, rect(-28, 28, ZBACK, ZMID, { norim: true }));
// the north sector in front of the spawn (its rims' faces are never inked)
const wedge = (() => { const a = Math.atan2(toO[1], toO[0]), h = (27 * Math.PI) / 180, L = 20; const p1 = [C[0] + Math.cos(a - h) * L, C[1] + Math.sin(a - h) * L], p2 = [C[0] + Math.cos(a + h) * L, C[1] + Math.sin(a + h) * L]; return inter(halfplane(C[0], C[1], p1[0], p1[1]), halfplane(p2[0], p2[1], C[0], C[1])); })();
// a capsule: the two discs and the band between them (any direction)
function capsule(a, b, r) { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), nx = (-dz / L) * r, nz = (dx / L) * r; return union(disc(a[0], a[1], r), disc(b[0], b[1], r), poly([[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]])); }
const PIAZZA_R = 14.8, BELV = [18.9, -1.2], BELV_D = 5.0;   // belvedere bastion: flanks off the piazza, a 45° prow (half-diagonal BELV_D)
// hill levels: discs round the hilltop with a few lobes (the lemon-garden shoulder, the Largo), clipped at the incline.
// H4 the spawn terrace; H3 its ring, the Limonaia (the lemon garden on the east shoulder) and the OLIVETO — the olive
// terrace striding down the band from the spawn's ring to the lower Scalinata over the Largo (the lavatoio on its
// north end) — the rest of the band H2 (the lemon groves round the lemon house, the Salita's middle reach)
const LIMONAIA = [-1.5, -33.5 - DS];
// the lemon house in the groves (a building block on H2: centre, size, eaves) and the lavatoio loggia on the Oliveto
const LEMON = { cx: 0.25, cz: -40.5, w: 5.5, d: 8.0, top: 6.6 };
const LAVATOIO = { cx: -9.8, cz: -30.45, rot: Math.atan2(1.6, 6.1), W: 6.2, Dd: 8.0 };
const OLIVETO = union(capsule([-11.4, -46.5], [-10.6, -33.5], 4.4), capsule([-10.6, -33.5], [-9.0, -27.4], 4.3));
const R4 = zone(union(disc(C[0], C[1], 8.5), rect(-26.8, -4.4, ZBACK, -41.3 - DS)), eastOfIncline, 4);
const R3 = union(R4, zone(union(disc(C[0], C[1], 13.5), disc(LIMONAIA[0], LIMONAIA[1], 6.5), OLIVETO), eastOfIncline, 3));
// sector of the ring round the piazza (ψ = compass angle round O from −Z, + toward +x; radii from O)
const uO = (psi) => [Math.sin((psi * Math.PI) / 180), -Math.cos((psi * Math.PI) / 180)];
const sectorO = (r0, r1, psi0, psi1) => { const a = (psi0 * Math.PI) / 180, b = (psi1 * Math.PI) / 180; return diff(inter(disc(0, 0, r1), hpN([0, 0], [-Math.cos(a), -Math.sin(a)]), hpN([0, 0], [Math.cos(b), Math.sin(b)])), disc(0, 0, r0)); };
// the piazza frame: a crescent of houses on the piazza's rim (fronts on the circle, 4.4 m deep), the H2 street behind
// them, H1 landings in the gaps between them (the Vicolo, the Passo)
const HOUSE_R0 = PIAZZA_R, HOUSE_R1 = PIAZZA_R + 4.4, STREET_R0 = PIAZZA_R + 3.9, STREET_R1 = PIAZZA_R + 8.0;
const GAPS = { vicolo: [-28, -10], passo: [11, 20] };
// H2 round the hilltop and, as first drawn, round C0 (the Largo); the band between them out to the lemon groves' curved
// terrace wall on the east (the tower's lane runs its length at x 6.3); the Orto; the street behind the crescent
const GROVES = poly([[-24, -57], [8.9, -57], [9.8, -50], [10.2, -43], [9.8, -36], [8.6, -30], [-24, -30]]);
const R2 = union(R3, zone(union(disc(C[0], C[1], 19.0), disc(C0[0], C0[1], 19.0), GROVES, disc(2.5, -27.5, 7.0), sectorO(STREET_R0, STREET_R1, -52, 34)), eastOfIncline, 2));
const R1 = union(R2, zone(union(diff(union(disc(C[0], C[1], 23.5), disc(C0[0], C0[1], 23.5), poly([[-24, -57], [11.5, -57], [13.4, -50], [13.6, -40], [12.6, -32], [11.5, -26], [-24, -26]]), disc(6.5, -22, 7.5)), disc(0, 0, STREET_R0)),
  sectorO(PIAZZA_R, STREET_R0 + 0.3, ...GAPS.vicolo), sectorO(PIAZZA_R, STREET_R0 + 0.3, ...GAPS.passo)), eastOfIncline, 1));
// the footprint: an irregular sea wall (straight runs of quay wall) round the hill's promenade, the Case sul Mare
// headland and the piazza, and the belvedere bastions either side of the piazza — arrow bastions pointing out to sea
// (the west one is Bravo's twin, mirrored); a cove between the headland and the east bastion, an inlet by the funicular
// (the stretch: the back and the diagonal run off it moved out with the hill; in the band, the promenade under the lemon
// groves bellies out into a little arrow bastion — the washerwomen's lookout below the lavatoio's lane)
const SHORE = poly([[-29.0, -45.4 - DS], [10.0, -45.4 - DS], [16.0, -36.0 - DS], [16.0, -50.5], [19.6, -45.2], [19.6, -40.8], [16.0, -35.5], [16.0, -26.4], [20.0, -22.0], [20.0, -15.0], [14.4, -9.4], [14.4, 0.0],
  [-14.4, 0.0], [-14.4, -6.8], [-17.4, -6.8], [-20.8, -8.6], [-21.6, -12.6], [-29.0, -12.6]]);
// a bastion: straight flanks out from the piazza's sea wall (x = 14.4) and a prow of two 45° faces
const bastion = (s) => poly([[14.4 * s, (BELV[1] - BELV_D) * s], [BELV[0] * s, (BELV[1] - BELV_D) * s], [(BELV[0] + BELV_D) * s, BELV[1] * s], [BELV[0] * s, (BELV[1] + BELV_D) * s], [14.4 * s, (BELV[1] + BELV_D) * s]]);
const R0 = union(R1, zone(union(SHORE, bastion(1), bastion(-1)), eastOfInclineW));

// ============================================================================================================
// Features on the hill: frames round the hilltop (φ in degrees from the direction to the piazza, + = east). P is the
// frame round C0 (where the hilltop was first drawn: the Largo and its shoulder, the lower Scalinata), PB the one round
// the hilltop where it stands now (the spawn terrace's own flight)
// ============================================================================================================
const hillFrame = (c, fwd) => { const sd = [fwd[1], -fwd[0]]; return (r, phi) => { const a = (phi * Math.PI) / 180, dx = fwd[0] * Math.cos(a) + sd[0] * Math.sin(a), dz = fwd[1] * Math.cos(a) + sd[1] * Math.sin(a); return [c[0] + dx * r, c[1] + dz * r, dx, dz]; }; };
const P = hillFrame(C0, toO0), PB = hillFrame(C, toO);
const rotOf = (dx, dz) => Math.atan2(dx, dz) * DEG;   // O() / prop rotY (deg) that turns local +Z to (dx, dz)
// a radial ramp from radius r0 (height y0) to r1 (height y1) along φ (frame f)
const rRamp = (phi, r0, y0, r1, y1, w, o, f = P) => { const a = f(r0, phi), b = f(r1, phi); return y0 < y1 ? R([a[0], y0, a[1]], [b[0], y1, b[1]], w, o) : R([b[0], y1, b[1]], [a[0], y0, a[1]], w, o); };
// a house on the piazza crescent between compass angles psi0..psi1 (front on the circle, facing the piazza centre)
function frame(psi0, psi1, r0 = HOUSE_R0, r1 = HOUSE_R1) { const pc = (psi0 + psi1) / 2, u = uO(pc), rm = (r0 + r1) / 2, w = 2 * r0 * Math.tan(((psi1 - psi0) * Math.PI) / 360); return { cx: u[0] * rm, cz: u[1] * rm, w, d: r1 - r0, rot: rotOf(-u[0], -u[1]), psi: pc }; }
// the houses of Alpha's village (props.js dresses them from this table: same centre / size / turn)
const HOUSES = {
  caffe: { ...frame(-52, -28), y0: FL, top: H3, color: TH.ochre, tag: 'caffe' },
  ceramiche: { ...frame(-10, 11), y0: FL, top: H3, color: TH.white, tag: 'ceramiche' },
  mare: { ...frame(20, 38), y0: FL, top: H2 + 0.2, color: TH.sky, tag: 'case-sul-mare' },
};
const houseBlock = (h, o = {}) => O(h.cx, h.cz, h.w, h.d, h.y0, h.top, h.rot, house(h.color, { tag: h.tag, ...o }));
// an upper storey on part of a house: offsets along the house's own axes (lx across the front, lz back → front)
function upperOf(h, lx, lz, w, d, top, color, o = {}) { const a = (h.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a); return { cx: h.cx + c * lx + sn * lz, cz: h.cz - sn * lx + c * lz, w, d, rot: h.rot, y0: h.top, top, color, ...o }; }
const UPPERS = {
  caffe: upperOf(HOUSES.caffe, -1.1, -1.0, 4.2, 2.4, 6.4, TH.ochre, { tag: 'caffe-upper' }),
  ceramiche: upperOf(HOUSES.ceramiche, 1.2, -1.0, 3.6, 2.4, 6.0, TH.white, { tag: 'ceramiche-upper' }),
  mare: upperOf(HOUSES.mare, 1.2, -0.7, 2.6, 3.0, 5.6, TH.sky, { tag: 'case-sul-mare-upper' }),
};
// world normal of a turned block's face: (sx, sz) = (±1, 0) side faces along local x, (0, ±1) front / back
const faceN = (h, sx, sz) => { const a = (h.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a); return [c * sx + sn * sz, 0, -sn * sx + c * sz]; };
const upperBlock = (u, o = {}) => O(u.cx, u.cz, u.w, u.d, u.y0, u.top, u.rot, upper(u.color, { tag: u.tag, ...o }));
// radial ramp round the piazza centre along ψ: from r0 (height y0) to r1 (y1)
const oRamp = (psi, r0, y0, r1, y1, w, o) => { const u = uO(psi), a = [u[0] * r0, u[1] * r0], b = [u[0] * r1, u[1] * r1]; return y0 < y1 ? R([a[0], y0, a[1]], [b[0], y1, b[1]], w, o) : R([b[0], y1, b[1]], [a[0], y0, a[1]], w, o); };
// Salita flights beside the incline: from the lower street up to each cut (t_L), 2.6 m wide in the middle of the band
const salitaFlight = (L, y0, y1) => { const run = 3.1 / INC_LEN, off = INC.w / 2 + SAL_W / 2 + 0.2, a = incP(T_CUT[L] + run, off), b = incP(T_CUT[L] - 0.005, off); return R([a[0], y0, a[1]], [b[0], y1, b[1]], 2.6, stair({ tag: 'salita-flight' })); };

const VIC = (GAPS.vicolo[0] + GAPS.vicolo[1]) / 2, PAS = (GAPS.passo[0] + GAPS.passo[1]) / 2;
// a straight flight from (a, height ya) to (b, height yb) in plan
const flight = (a, ya, b, yb, w, tag) => (ya < yb ? R([a[0], ya, a[1]], [b[0], yb, b[1]], w, stair({ tag })) : R([b[0], yb, b[1]], [a[0], ya, a[1]], w, stair({ tag })));
const along = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const unit = (p, q) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); return [(q[0] - p[0]) / d, (q[1] - p[1]) / d]; };
// the east lane down the lemon shoulder: Limonaia (H3; moved out with the hill, its flight now comes down into the lemon
// groves) → the groves + the Orto (H2) → the Case sul Mare lane (H1) → the headland (H0)
const EAST = (() => {
  const L3 = LIMONAIA, G2 = [2.5, -45], L2 = [2.5, -27.5], L1 = [6.5, -22], HD = [11.5, -17.5];
  const e1 = unit(L3, G2), p1 = [L3[0] + e1[0] * 6.47, L3[1] + e1[1] * 6.47];
  const e2 = unit(L2, L1), p2 = [L2[0] + e2[0] * 6.97, L2[1] + e2[1] * 6.97];
  const e3 = unit(L1, HD), p3 = [L1[0] + e3[0] * 7.47, L1[1] + e3[1] * 7.47];
  return { p1, e1, p2, e2, p3, e3 };
})();
const LARGO = (() => { const m = P(16.0, 0); return { x: m[0], z: m[1], h: 2.0 }; })();
const FEATURES = [
  // the Scalinata, in two flights now: from the villa terrace (H4) down to the Oliveto (H3), and from the Oliveto's north
  // end down to the Largo (H2) — the lower half of the first drawing's single flight, where it stood
  rRamp(0, 8.45, H4, 11.55, H3, 5.2, stair({ tag: 'scalinata' }), PB),
  rRamp(0, 11.55, H3, 14.65, H2, 5.2, stair({ tag: 'scalinata' })),
  // the Vicolo between the Caffè and the Ceramiche shop: the piazza → an H1 landing → the street (H2)
  oRamp(VIC, PIAZZA_R - 3.1, H0, PIAZZA_R + 0.02, H1, 4.0, stair({ tag: 'vicolo-flight-1' })),
  oRamp(VIC, STREET_R0 - 3.1, H1, STREET_R0 + 0.02, H2, 4.0, stair({ tag: 'vicolo-flight-2' })),
  // the Passo: a narrow stair between the Ceramiche and the Case sul Mare
  oRamp(PAS, PIAZZA_R - 3.1, H0, PIAZZA_R + 0.02, H1, 2.2, stair({ tag: 'passo-flight-1' })),
  oRamp(PAS, STREET_R0 - 3.1, H1, STREET_R0 + 0.02, H2, 2.2, stair({ tag: 'passo-flight-2' })),
  // (Tower Command builds the Caffè and the Ceramiche from TOWER_HALF below: the Caffè open underneath at its Salita end,
  // the Ceramiche 0.7 m shallower at the back)
  houseBlock(HOUSES.caffe, { notIn: 'tower' }), houseBlock(HOUSES.ceramiche, { notIn: 'tower' }), houseBlock(HOUSES.mare),
  upperBlock(UPPERS.caffe, { mural: [{ n: faceN(UPPERS.caffe, -1, 0), id: MURAL.sundial }], notIn: 'tower' }), upperBlock(UPPERS.ceramiche, { notIn: 'tower' }), upperBlock(UPPERS.mare, { mural: [{ n: faceN(UPPERS.mare, 0, 1), id: MURAL.ghost }] }),
  // roof-terrace stairs from the street behind the crescent (H2) up onto the Caffè and Ceramiche roofs (H3)
  // (not in Tower Command: both stand across the track, the Caffè's in the Salita and the Ceramiche's in the street behind)
  oRamp(-44, STREET_R1 - 0.4, H2, HOUSE_R1 + 0.02, H3, 1.8, stair({ tag: 'caffe-stair', notIn: 'tower' })),
  oRamp(-4, STREET_R1 - 0.4, H2, HOUSE_R1 + 0.02, H3, 1.8, stair({ tag: 'ceramiche-stair', notIn: 'tower' })),
  // the east lane
  flight([EAST.p1[0] + EAST.e1[0] * 3.1, EAST.p1[1] + EAST.e1[1] * 3.1], H2, [EAST.p1[0] - EAST.e1[0] * 0.02, EAST.p1[1] - EAST.e1[1] * 0.02], H3, 2.8, 'limonaia-stair'),
  flight([EAST.p2[0] + EAST.e2[0] * 3.1, EAST.p2[1] + EAST.e2[1] * 3.1], H1, [EAST.p2[0] - EAST.e2[0] * 0.02, EAST.p2[1] - EAST.e2[1] * 0.02], H2, 2.8, 'orto-stair'),
  flight([EAST.p3[0] + EAST.e3[0] * 3.1, EAST.p3[1] + EAST.e3[1] * 3.1], H0, [EAST.p3[0] - EAST.e3[0] * 0.02, EAST.p3[1] - EAST.e3[1] * 0.02], H1, 2.8, 'gradoni'),
  // the Largo's pebble sun (its own floor piece, so the mural fits one face)
  B(LARGO.x - LARGO.h, LARGO.x + LARGO.h, FL, H2, LARGO.z - LARGO.h, LARGO.z + LARGO.h, pebble({ tag: 'largo-sun', mural: [{ n: [0, 1, 0], id: MURAL.sun }] })),
  // the Salita beside the funicular
  salitaFlight(4, H3, H4), salitaFlight(3, H2, H3), salitaFlight(2, H1, H2), salitaFlight(1, H0, H1),
  // the Oliveto's side flight up from the lemon groves' lane (H2 → H3), square to its east wall
  (() => { const a = [-11.4, -46.5], b = [-10.6, -33.5], z = -39.2, t = (z - a[1]) / (b[1] - a[1]), d = unit(a, b), n = [d[1], -d[0]], e = [a[0] + (b[0] - a[0]) * t + n[0] * 4.4, z + n[1] * 4.4];
    return flight([e[0] + n[0] * 3.1, e[1] + n[1] * 3.1], H2, [e[0] - n[0] * 0.02, e[1] - n[1] * 0.02], H3, 2.4, 'oliveto-stair'); })(),
  // the lemon house (a limonaia: the winter house of the lemon trees, tall south windows) in the lemon groves, its top
  // off-limits (props.js dresses it, gable roof on)
  O(LEMON.cx, LEMON.cz, LEMON.w, LEMON.d, FL, LEMON.top, 0, house(TH.lemon, { tag: 'lemonhouse', roof: true })),
];

// Tower Command's own takes on two houses of the crescent (TOWER_HALF, onlyIn 'tower'; the originals are notIn 'tower').
//   • the Caffè: its Salita end stands in the way of the track up the Salita, so the ground floor there opens into a
//     sottoportico — the roof terrace, the upper storey and the front wall stay, the side and the back open underneath
//     (4.3 m over the passage, so the tower — it needs 3.72 m, TOWER_HEAD — keeps 4 m even where it starts up the
//     Salita's first flight under the portico's back edge): lx −w/2 … −PORTICO.um is the portico, the front wall runs on
//     to lx −PORTICO.uf. For that the whole Caffè stands PORTICO.lift taller than the shared one — its roof terrace at
//     H3 + lift, the upper storey on it
//   • the Ceramiche: 0.7 m shallower at the back (the track runs along the street behind it), its upper storey with it
// A piece of a house: its own frame, lx across the front (−w/2 … w/2), lz back → front (−d/2 … d/2)
const houseSub = (h, lx0, lx1, lz0, lz1) => { const a = (h.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), lx = (lx0 + lx1) / 2, lz = (lz0 + lz1) / 2;
  return { cx: h.cx + c * lx + sn * lz, cz: h.cz - sn * lx + c * lz, w: lx1 - lx0, d: lz1 - lz0, rot: h.rot }; };
const PORTICO = { um: 0.13, uf: 2.2, ceil: 4.3, wall: 0.4, lift: 1.0 };
const CAFFE_T = (() => {
  const h = HOUSES.caffe, hw = h.w / 2, hd = h.d / 2;
  return { main: houseSub(h, -PORTICO.um, hw, -hd, hd), front: houseSub(h, -PORTICO.uf, -PORTICO.um, hd - PORTICO.wall, hd), ceiling: houseSub(h, -hw, -PORTICO.um, -hd, hd) };
})();
const CER_CUT = 0.7;
const CERAMICHE_T = { ...HOUSES.ceramiche, ...houseSub(HOUSES.ceramiche, -HOUSES.ceramiche.w / 2, HOUSES.ceramiche.w / 2, -HOUSES.ceramiche.d / 2 + CER_CUT, HOUSES.ceramiche.d / 2) };
const UPPER_CERAMICHE_T = { ...UPPERS.ceramiche, ...houseSub(UPPERS.ceramiche, -UPPERS.ceramiche.w / 2, UPPERS.ceramiche.w / 2, -UPPERS.ceramiche.d / 2 + CER_CUT, UPPERS.ceramiche.d / 2 + CER_CUT) };
const TOWER_HALF = (() => {
  const T = { onlyIn: 'tower' }, cf = HOUSES.caffe, piece = (p, y0, y1) => O(p.cx, p.cz, p.w, p.d, y0, y1, p.rot, house(cf.color, { tag: 'caffe', ...T }));
  const top = cf.top + PORTICO.lift, uc = UPPERS.caffe;
  return [
    piece(CAFFE_T.main, cf.y0, top), piece(CAFFE_T.front, cf.y0, PORTICO.ceil), piece(CAFFE_T.ceiling, PORTICO.ceil, top),
    upperBlock({ ...uc, y0: uc.y0 + PORTICO.lift, top: uc.top + PORTICO.lift }, { mural: [{ n: faceN(uc, -1, 0), id: MURAL.sundial }], ...T }),
    houseBlock(CERAMICHE_T, T), upperBlock(UPPER_CERAMICHE_T, T),
  ];
})();

// ============================================================================================================
// Ground builder (bake time only — the result is baked into GROUND_DATA below). Levels are laid top-down (H4 first):
//   • rims: the contour line chorded into straight coping bars (sagitta ≤ SAG, ≤ SEG_MAX long), RIM_W deep inside it
//     and 10 cm above the floor (terracotta coping on a limewashed retaining wall); joints trimmed so bars only touch
//   • slabs: a few big rectangles picked greedily on a raster in every direction (5° steps) — each new slab is the
//     rectangle that covers the most still-bare floor while staying inside the level (or under its coping, never past
//     a coping's face) and clear of the level's other slabs — then grown exactly until it touches its neighbours
//   • gutters: the thin wedges left where slabs of different directions meet, pebble joints 10 cm lower (a second tier
//     18 cm lower where two would cross)
// Bare floor = the level's region minus its rims minus whatever stands on it (higher levels, houses, walls). The
// promenade level (H0) is laid solid under the whole hill too, so the stage's sea footprint has no holes.
// ============================================================================================================
const SAG = 0.3, SEG_MAX = 7.0, RS = 0.05, RR = 0.1, MIN_SLAB = 0.3, GUT = [0.1, 0.19];
const orect = (cx, cz, w, d, deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return { c: [cx, cz], ax: [[c, -s], [s, c]], h: [w / 2, d / 2], deg }; };
const inO = (s, x, z, g = 0) => { const dx = x - s.c[0], dz = z - s.c[1]; return Math.abs(dx * s.ax[0][0] + dz * s.ax[0][1]) <= s.h[0] + g && Math.abs(dx * s.ax[1][0] + dz * s.ax[1][1]) <= s.h[1] + g; };
const ptO = (s, u, v) => [s.c[0] + s.ax[0][0] * u + s.ax[1][0] * v, s.c[1] + s.ax[0][1] * u + s.ax[1][1] * v];
const rad0 = (s) => Math.hypot(s.h[0], s.h[1]);
// raster grids: { x0, z0, rs, nx, nz }
function paintO(G, m, s, g = 0, v = 1) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of corners(s)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const i0 = Math.max(0, Math.floor((x0 - g - G.x0) / G.rs)), i1 = Math.min(G.nx - 1, Math.ceil((x1 + g - G.x0) / G.rs));
  const j0 = Math.max(0, Math.floor((z0 - g - G.z0) / G.rs)), j1 = Math.min(G.nz - 1, Math.ceil((z1 + g - G.z0) / G.rs));
  for (let j = j0; j <= j1; j++) { const z = G.z0 + (j + 0.5) * G.rs; for (let i = i0; i <= i1; i++) if (inO(s, G.x0 + (i + 0.5) * G.rs, z, g)) m[j * G.nx + i] = v; }
}
function paintR(G, m, r) {
  for (let i = 0; i < G.nx; i++) {
    const x = G.x0 + (i + 0.5) * G.rs;
    for (const [l, h] of r.iv(x)) { const j0 = Math.max(0, Math.ceil((l - G.z0) / G.rs - 0.5)), j1 = Math.min(G.nz - 1, Math.floor((h - G.z0) / G.rs - 0.5)); for (let j = j0; j <= j1; j++) m[j * G.nx + i] = 1; }
  }
}
const cellAt = (G, m, x, z) => { const i = Math.floor((x - G.x0) / G.rs), j = Math.floor((z - G.z0) / G.rs); return i < 0 || j < 0 || i >= G.nx || j >= G.nz ? 0 : m[j * G.nx + i]; };
// footprint + vertical range of a layout piece (ramps: null)
const shapeOf = (d) => (d.kind === 'box' ? { ...orect((d.min[0] + d.max[0]) / 2, (d.min[2] + d.max[2]) / 2, d.max[0] - d.min[0], d.max[2] - d.min[2], 0), y0: d.min[1], y1: d.max[1] }
  : d.kind === 'obox' ? { ...orect(d.center[0], d.center[2], d.size[0], d.size[2], d.rotY), y0: d.center[1] - d.size[1] / 2, y1: d.center[1] + d.size[1] / 2 } : null);
const mirrorDef = (d) => (d.kind === 'box' ? { ...d, min: [-d.max[0], d.min[1], -d.max[2]], max: [-d.min[0], d.max[1], -d.min[2]] }
  : d.kind === 'obox' ? { ...d, center: [-d.center[0], d.center[1], -d.center[2]] } : d);

// ---- boundary runs of a region: samples [x, z, nx, nz] on its true contour (clip lines and norim curves excluded)
function boundaryRuns(r) {
  const eps = 0.03, runs = [];
  const clipOK = (x, z) => z <= ZMID - 0.02 && z >= ZBACK + 0.02;
  for (const c of r.curves) {
    if (c.norim) continue;
    const n = c.pts.length;
    const on = c.pts.map(([x, z], k) => clipOK(x, z) && inside(r, x - c.nrm[k][0] * eps, z - c.nrm[k][1] * eps) && !inside(r, x + c.nrm[k][0] * eps, z + c.nrm[k][1] * eps));
    let start = 0;
    if (c.closed) { start = on.indexOf(false); if (start < 0) { runs.push([...c.pts.map((p, k) => [p[0], p[1], ...c.nrm[k]]), [c.pts[0][0], c.pts[0][1], ...c.nrm[0]]]); continue; } }
    let run = [];
    const m = c.closed ? n + 1 : n;
    for (let j = 0; j < m; j++) {
      const k = (start + j) % n;
      if (on[k]) run.push([c.pts[k][0], c.pts[k][1], ...c.nrm[k]]);
      else { if (run.length > 1) runs.push(run); run = []; }
    }
    if (run.length > 1) runs.push(run);
  }
  return runs;
}
// ---- rims: coping bars on chords of the contour. A bar = outer face P→Q (on the contour), n = inward normal
function mkBar(r, P, Q) {
  const dx = Q[0] - P[0], dz = Q[1] - P[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  let ix = -uz, iz = ux; const mx = (P[0] + Q[0]) / 2, mz = (P[1] + Q[1]) / 2;
  if (!inside(r, mx + ix * 0.25, mz + iz * 0.25)) { ix = -ix; iz = -iz; }
  return { P: [P[0], P[1]], Q: [Q[0], Q[1]], u: [ux, uz], n: [ix, iz] };
}
const barLen = (b) => Math.hypot(b.Q[0] - b.P[0], b.Q[1] - b.P[1]);
// the bar's solid (inset = pulled in from the outer face), and the band just outside its face (no slab may reach there)
const barRect = (b, inset = 0) => { const mx = (b.P[0] + b.Q[0]) / 2, mz = (b.P[1] + b.Q[1]) / 2, d = RIM_W - inset, off = inset + d / 2; return { c: [mx + b.n[0] * off, mz + b.n[1] * off], ax: [b.u, b.n], h: [barLen(b) / 2, d / 2] }; };
const bandRect = (b) => { const mx = (b.P[0] + b.Q[0]) / 2, mz = (b.P[1] + b.Q[1]) / 2; return { c: [mx - b.n[0] * 0.49, mz - b.n[1] * 0.49], ax: [b.u, b.n], h: [barLen(b) / 2, 0.51] }; };
const trimmed = (b, end, t) => (end ? { ...b, Q: [b.Q[0] - b.u[0] * t, b.Q[1] - b.u[1] * t] } : { ...b, P: [b.P[0] + b.u[0] * t, b.P[1] + b.u[1] * t] });
// least trim of bar b at `end` that makes bad(bar) false (binary search); null if even a 0.3 m stub is bad
function trimUntil(b, end, bad) {
  if (!bad(b)) return b;
  const L = barLen(b); if (L < 0.35 || bad(trimmed(b, end, L - 0.3))) return null;
  let lo = 0, hi = L - 0.3;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (bad(trimmed(b, end, m))) lo = m; else hi = m; }
  return trimmed(b, end, hi + 1e-4);
}
function rimBars(r) {
  let bars = [];
  for (const rr of boundaryRuns(r)) {
    const cum = [0]; for (let i = 1; i < rr.length; i++) cum.push(cum[i - 1] + Math.hypot(rr[i][0] - rr[i - 1][0], rr[i][1] - rr[i - 1][1]));
    const len = cum[cum.length - 1];
    if (len < 0.4) continue;
    const dev = (a, b) => { const P = rr[a], Q = rr[b], dx = Q[0] - P[0], dz = Q[1] - P[1], L = Math.hypot(dx, dz) || 1; let m = 0; for (let i = a; i <= b; i++) m = Math.max(m, Math.abs((rr[i][0] - P[0]) * dz - (rr[i][1] - P[1]) * dx) / L); return m; };
    for (let n = Math.max(1, Math.ceil(len / SEG_MAX)); ; n++) {
      const idx = [0];
      for (let k = 1; k < n; k++) { let i = idx[k - 1]; while (i < rr.length - 1 && cum[i] < (len * k) / n) i++; idx.push(i); }
      idx.push(rr.length - 1);
      let ok = true;
      for (let k = 0; k < n && ok; k++) if (idx[k + 1] <= idx[k] || dev(idx[k], idx[k + 1]) > SAG) ok = false;
      if (!ok && n < 400) continue;
      for (let k = 0; k < n; k++) if (idx[k + 1] > idx[k]) bars.push(mkBar(r, rr[idx[k]], rr[idx[k + 1]]));
      break;
    }
  }
  // keep inside the half (z ≤ 0: the mirror's bars are the twins), the back wall and the side bounds
  const out = (b) => corners(barRect(b)).some(([x, z]) => z > ZMID - 1e-4 || z < ZBACK - 1e-4 || x < -28 + 1e-4 || x > 28 - 1e-4);
  bars = bars.map((b) => { if (!out(b)) return b; const a = trimUntil(b, 0, out), c = trimUntil(b, 1, out); return a && c ? (barLen(a) >= barLen(c) ? a : c) : a || c; }).filter(Boolean);
  return bars;
}
// coping tops: bars that overlap at a convex joint alternate between 10 and 18 cm proud (so they may overlap instead of
// leaving a notch); where neither height is free the later bar gives way at the joint
const RIM_UP = [0.1, 0.19];
function seatRims(bars, obst, y) {
  const near = (a, b) => Math.hypot((a.P[0] + a.Q[0]) / 2 - (b.P[0] + b.Q[0]) / 2, (a.P[1] + a.Q[1]) / 2 - (b.P[1] + b.Q[1]) / 2) < (barLen(a) + barLen(b)) / 2 + 1.2;
  const hit = (a, b) => near(a, b) && pen(barRect(a), barRect(b)) > 3e-4;
  const OB = RIM_UP.map((u) => obst(y + u));
  const blocked = (b, k) => OB[k].some((t) => Math.hypot(t.c[0] - barRect(b).c[0], t.c[1] - barRect(b).c[1]) < rad0(t) + barLen(b) / 2 + 1 && pen(barRect(b), t) > 3e-4);
  const out = [];
  for (let b of bars) {
    for (let tries = 0; tries < 4 && b; tries++) {
      const k = [0, 1].find((k) => !blocked(b, k) && !out.some((o) => o.k === k && hit(o, b)));
      if (k !== undefined) { out.push({ ...b, k }); b = null; break; }
      // trim against the nearest same-height neighbour it hits
      const o = out.filter((o) => hit(o, b)).sort((p, q) => pen(barRect(q), barRect(b)) - pen(barRect(p), barRect(b)))[0];
      if (!o) { b = null; break; }
      let best = null;
      for (const ea of [0, 1]) for (const eb of [0, 1]) { const pa = ea ? o.Q : o.P, pb = eb ? b.Q : b.P, d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]); if (!best || d < best.d) best = { d, eb }; }
      b = trimUntil(b, best.eb, (x) => hit(o, x));
    }
  }
  return out;
}

// ---- slabs: greedy raster cover (see above). stand: shapes standing on this floor; obst(y): shapes topped at y.
// Slabs come in tiers (floor, 10 cm and 18 cm below it): a tier's slabs never overlap each other, slabs of different
// tiers may (the higher one hides the lower). The lower tiers are dearer, so they only fill in where the floor tier
// would need many small pieces.
const TIER_DN = [0, 0.1, 0.19], TIER_PREF = [1, 0.8, 0.72], LOWER_MAX = 5;   // m² of visible floor a lower slab may take
function laySlabs(L, r, bars, stand, obst, y, tiers = 1, designed = []) {
  const G = { x0: -28, z0: ZBACK - 0.6, rs: RS, nx: Math.round(56 / RS), nz: Math.round((0.6 - ZBACK) / RS) }, N = G.nx * G.nz;
  const inR = new Uint8Array(N), rimIn = new Uint8Array(N), band = new Uint8Array(N), above = new Uint8Array(N);
  paintR(G, inR, r);
  const rIn = bars.map((b) => barRect(b, 0.02)), rBand = bars.map(bandRect);
  const T = TIER_DN.slice(0, tiers).map((dn) => ({ dn, OB: [...obst(y - dn), ...designed], occ: new Uint8Array(N), slabs: [] }));
  for (const s of rIn) paintO(G, rimIn, s);
  for (const s of rBand) paintO(G, band, s);
  for (const t of T) for (const s of t.OB) paintO(G, t.occ, s, 0.03);
  for (const s of stand) paintO(G, above, s);
  for (const b of bars) paintO(G, above, barRect(b));
  const req = new Uint8Array(N), geo = new Uint8Array(N), sure = new Uint8Array(N);
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (let k = 0; k < N; k++) geo[k] = rimIn[k] || (inR[k] && !band[k]) ? 1 : 0;
  // cells whose 5×5 neighbourhood is all inside (1) / all outside (2): no exact test needed there
  for (let j = 2; j < G.nz - 2; j++) for (let i = 2; i < G.nx - 2; i++) {
    let a = 0; for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) a += geo[(j + dj) * G.nx + i + di];
    sure[j * G.nx + i] = a === 25 ? 1 : a === 0 ? 2 : 0;
  }
  const ri0 = rIn, rb0 = rBand;
  const okAt = (x, z, ri = ri0, rb = rb0) => { const c = cellAt(G, sure, x, z); if (c === 1) return true; if (c === 2) return false; for (const t of ri) if (inO(t, x, z, 1e-6)) return true; if (!inside(r, x, z)) return false; for (const t of rb) if (inO(t, x, z, -1e-6)) return false; return true; };
  for (let k = 0; k < N; k++) {
    // the floor to lay: 3 where it shows; on the promenade level also 1 under whatever stands on it (the sea footprint)
    req[k] = geo[k] && !T[0].occ[k] && inR[k] ? (!above[k] ? 3 : L === 0 ? 1 : 0) : 0;
    if (geo[k]) { const i = k % G.nx, j = (k / G.nx) | 0; bx0 = Math.min(bx0, i); bx1 = Math.max(bx1, i); bz0 = Math.min(bz0, j); bz1 = Math.max(bz1, j); }
  }
  const box = [G.x0 + bx0 * RS - 0.2, G.x0 + (bx1 + 1) * RS + 0.2, G.z0 + bz0 * RS - 0.2, G.z0 + (bz1 + 1) * RS + 0.2];
  // exact tests
  const near = (s, list, pad) => list.filter((t) => Math.hypot(t.c[0] - s.c[0], t.c[1] - s.c[1]) < rad0(s) + rad0(t) + pad);
  const valid = (s, t) => {
    if (s.h[0] < 0.1 || s.h[1] < 0.1) return false;
    for (const o of near(s, [...t.slabs, ...t.OB], 0.01)) if (pen(s, o) > 3e-4) return false;
    const ri = near(s, rIn, 0.05), rb = near(s, rBand, 0.05), ok = (x, z) => okAt(x, z, ri, rb);
    const n0 = Math.max(1, Math.ceil((s.h[0] * 2) / 0.05)), n1 = Math.max(1, Math.ceil((s.h[1] * 2) / 0.05));
    for (let a = 0; a <= n0; a++) for (const b of [0, n1]) { const [x, z] = ptO(s, -s.h[0] + (2 * s.h[0] * a) / n0, -s.h[1] + (2 * s.h[1] * b) / n1); if (!ok(x, z)) return false; }
    for (let b = 1; b < n1; b++) for (const a of [0, n0]) { const [x, z] = ptO(s, -s.h[0] + (2 * s.h[0] * a) / n0, -s.h[1] + (2 * s.h[1] * b) / n1); if (!ok(x, z)) return false; }
    const m0 = Math.ceil((s.h[0] * 2) / 0.4), m1 = Math.ceil((s.h[1] * 2) / 0.4);
    for (let a = 1; a < m0; a++) for (let b = 1; b < m1; b++) { const [x, z] = ptO(s, -s.h[0] + (2 * s.h[0] * a) / m0, -s.h[1] + (2 * s.h[1] * b) / m1); if (!ok(x, z)) return false; }
    return true;
  };
  // move one side of s outward by e (side 0: +u, 1: −u, 2: +v, 3: −v)
  const grown = (s, side, e) => { const k = side >> 1, sg = side & 1 ? -1 : 1, h = [...s.h]; h[k] += e / 2; const c = [s.c[0] + s.ax[k][0] * sg * e / 2, s.c[1] + s.ax[k][1] * sg * e / 2]; return { ...s, c, h }; };
  const refine = (s, t) => {
    for (let i = 0; i < 12 && !valid(s, t); i++) s = { ...s, h: [s.h[0] - 0.01, s.h[1] - 0.01] };
    if (!valid(s, t)) return null;
    for (let round = 0; round < 2; round++) for (let side = 0; side < 4; side++) {
      if (!valid(grown(s, side, 0.002), t)) continue;
      let lo = 0.002, hi = 1.5;
      if (valid(grown(s, side, hi), t)) { s = grown(s, side, hi); continue; }
      for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (valid(grown(s, side, m), t)) lo = m; else hi = m; }
      s = grown(s, side, lo);
    }
    return s;
  };
  // directions: the level's coping chords, the axes, the incline (a rectangle at a and a + 90° is the same shape)
  const oris = [];
  for (const d of [0, 45, ...INC_SEG.map((g) => Math.atan2(g.dir[0], g.dir[1]) * DEG), ...bars.map((b) => Math.atan2(-b.u[1], b.u[0]) * DEG)]) { const m = ((d % 90) + 90) % 90; if (!oris.some((o) => Math.min(Math.abs(o - m), 90 - Math.abs(o - m)) < 1.5)) oris.push(m); }
  const F = [];
  for (const deg of oris) {
    const a = (deg * Math.PI) / 180, ex = [Math.cos(a), -Math.sin(a)], ez = [Math.sin(a), Math.cos(a)];
    const cs = [[box[0], box[2]], [box[1], box[2]], [box[1], box[3]], [box[0], box[3]]];
    const ps = cs.map(([x, z]) => x * ex[0] + z * ex[1]), qs = cs.map(([x, z]) => x * ez[0] + z * ez[1]);
    const p0 = Math.min(...ps), q0 = Math.min(...qs), NP = Math.ceil((Math.max(...ps) - p0) / RR), NQ = Math.ceil((Math.max(...qs) - q0) / RR);
    const free = T.map(() => new Uint8Array(NP * NQ)), unc = new Uint8Array(NP * NQ);
    const W = (p, q) => [p * ex[0] + q * ez[0], p * ex[1] + q * ez[1]];
    for (let j = 0; j < NQ; j++) for (let i = 0; i < NP; i++) {
      const p = p0 + (i + 0.5) * RR, q = q0 + (j + 0.5) * RR, [x, z] = W(p, q);
      if (!cellAt(G, geo, x, z)) continue;
      const pts = [[x, z]]; for (const [dp, dq] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) pts.push(W(p + dp * RR * 0.98, q + dq * RR * 0.98));
      if (pts.every(([xx, zz]) => cellAt(G, geo, xx, zz))) T.forEach((t, ti) => { free[ti][j * NP + i] = pts.every(([xx, zz]) => !cellAt(G, t.occ, xx, zz)) ? 1 : 0; });
      unc[j * NP + i] = cellAt(G, req, x, z);
    }
    F.push({ deg, ex, ez, p0, q0, NP, NQ, free, unc, W, pref: deg === 0 ? 1.12 : 1, S: new Int32Array((NP + 1) * (NQ + 1)), V: new Int32Array((NP + 1) * (NQ + 1)), hgt: new Int32Array(NP + 1), stk: new Int32Array(NP + 2) });
  }
  const mark = (s, ti, g) => {
    for (const f of F) {
      const cs = corners(s), ps = cs.map(([x, z]) => x * f.ex[0] + z * f.ex[1]), qs = cs.map(([x, z]) => x * f.ez[0] + z * f.ez[1]);
      const i0 = Math.max(0, Math.floor((Math.min(...ps) - g - f.p0) / RR)), i1 = Math.min(f.NP - 1, Math.ceil((Math.max(...ps) + g - f.p0) / RR));
      const j0 = Math.max(0, Math.floor((Math.min(...qs) - g - f.q0) / RR)), j1 = Math.min(f.NQ - 1, Math.ceil((Math.max(...qs) + g - f.q0) / RR));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const [x, z] = f.W(f.p0 + (i + 0.5) * RR, f.q0 + (j + 0.5) * RR);
        if (inO(s, x, z, g)) f.free[ti][j * f.NP + i] = 0;
        if (inO(s, x, z, 0)) f.unc[j * f.NP + i] = 0;
      }
    }
  };
  for (let step = 0; step < 400; step++) {
    let best = null;
    for (const f of F) {
      const { NP, NQ, unc, S, V, hgt, stk } = f, W1 = NP + 1;
      for (let j = 0; j < NQ; j++) { let row = 0, rv = 0; for (let i = 0; i < NP; i++) { const u = unc[j * NP + i]; row += u; rv += u === 3 ? 1 : 0; S[(j + 1) * W1 + i + 1] = S[j * W1 + i + 1] + row; V[(j + 1) * W1 + i + 1] = V[j * W1 + i + 1] + rv; } }
      for (let ti = 0; ti < T.length; ti++) {
        const free = f.free[ti], pref = f.pref * TIER_PREF[ti];
        hgt.fill(0);
        for (let j = 0; j < NQ; j++) {
          for (let i = 0; i < NP; i++) hgt[i] = free[j * NP + i] ? hgt[i] + 1 : 0;
          let sp = 0;
          for (let i = 0; i <= NP; i++) {
            const h = i < NP ? hgt[i] : 0;
            while (sp > 0 && hgt[stk[sp - 1]] >= h) {
              const H = hgt[stk[--sp]], l = sp > 0 ? stk[sp - 1] + 1 : 0, rr = i - 1;
              if (H >= 3 && rr - l + 1 >= 3) {
                const j0 = j - H + 1, w = S[(j + 1) * W1 + rr + 1] - S[j0 * W1 + rr + 1] - S[(j + 1) * W1 + l] + S[j0 * W1 + l];
                const sc = w * pref + H * (rr - l + 1) * 1e-4;
                if ((!best || sc > best.sc) && (ti === 0 || (V[(j + 1) * W1 + rr + 1] - V[j0 * W1 + rr + 1] - V[(j + 1) * W1 + l] + V[j0 * W1 + l]) * RR * RR <= LOWER_MAX)) best = { sc, w, f, ti, l, rr, j, H };
              }
            }
            stk[sp++] = i;
          }
        }
      }
    }
    if (!best || (best.w / 3) * RR * RR < MIN_SLAB) break;
    const { f, ti, l, rr, j, H } = best;
    const pc = f.p0 + ((l + rr + 1) / 2) * RR, qc = f.q0 + ((2 * j - H + 2) / 2) * RR, [cx, cz] = f.W(pc, qc);
    const s = refine({ ...orect(cx, cz, (rr - l + 1) * RR, H * RR, f.deg) }, T[ti]);
    if (!s) { for (let jj = j - H + 1; jj <= j; jj++) for (let i = l; i <= rr; i++) f.free[ti][jj * f.NP + i] = 0; continue; }
    T[ti].slabs.push(s);
    mark(s, ti, 0.071);
  }
  const slabs = T.flatMap((t, ti) => t.slabs.map((s) => ({ ...s, tier: ti })));
  return { slabs, rIn, rBand, okAt, dirs: oris };
}

// ---- gutters: cover the bare floor the slabs left (0.025 m raster), each patch with its tightest turned rectangle
function layGutters(L, r, bars, stand, obst, y, slabs, rIn, rBand, okAt, dirs, designed = []) {
  const out = [];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const s of [...slabs, ...rIn]) for (const [x, z] of corners(s)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const rs = 0.025, G = { x0: x0 - 0.3, z0: z0 - 0.3, rs, nx: Math.ceil((x1 - x0 + 0.6) / rs), nz: Math.ceil((z1 - z0 + 0.6) / rs) }, N = G.nx * G.nz;
  const inR = new Uint8Array(N), cov = new Uint8Array(N), band = new Uint8Array(N), occ = new Uint8Array(N), rimIn = new Uint8Array(N);
  paintR(G, inR, r);
  for (const s of rBand) paintO(G, band, s);
  for (const s of rIn) paintO(G, rimIn, s);
  for (const s of slabs) paintO(G, cov, s);
  const OB = [...obst(y), ...designed];
  for (const s of OB) paintO(G, occ, s);
  for (const s of stand) paintO(G, cov, s);
  for (const b of bars) paintO(G, cov, barRect(b));
  const bare = new Uint8Array(N);
  // (the hills end under the incline's service stair: slivers along that clip line are hidden by it)
  // (a point's offset east of the incline's centre line and its fraction along the reach beside it)
  const incOff = (x, z) => { const g = INC_SEG[z < INC.kink[2] ? 0 : 1], o = (x - g.a[0]) * g.n[0] + (z - g.a[2]) * g.n[1], s = (x - g.a[0]) * g.dir[0] + (z - g.a[2]) * g.dir[1]; return { o, t: (s + (g === INC_SEG[1] ? INC_SEG[0].L : 0)) / INC_LEN }; };
  const underStair = (x, z) => { const { o } = incOff(x, z); return o > INC.w / 2 - 0.8 - 0.05 && o < INC.w / 2 + 0.1; };
  // (the promenade under the incline itself is hidden by it)
  const underIncline = (x, z) => { const { o, t } = incOff(x, z); return o > -INC.w / 2 - 0.35 && o < INC.w / 2 + 0.1 && t < 0.97; };
  for (let k = 0; k < N; k++) bare[k] = inR[k] && !band[k] && !cov[k] && !occ[k] && !(L > 0 ? underStair : underIncline)(G.x0 + ((k % G.nx) + 0.5) * rs, G.z0 + (((k / G.nx) | 0) + 0.5) * rs) ? 1 : 0;
  // patches (8-connected)
  const seen = new Uint8Array(N), q = new Int32Array(N);
  const ok = (x, z) => okAt(x, z);
  // tightest turned rectangle round a patch: try every hull edge direction (the optimum has a side on one) + the level's
  const hull = (P) => { const p = [...P].sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p; const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = []; for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (const q of p.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); } return lo.slice(0, -1).concat(up.slice(0, -1)); };
  const fitRect = (pts) => {
    const hp = hull(pts), degs = [...dirs];
    for (let i = 0; i < hp.length; i++) { const a = hp[i], b = hp[(i + 1) % hp.length]; degs.push(Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * DEG); }
    let best = null;
    for (const deg of degs) {
      const a = (deg * Math.PI) / 180, ex = [Math.cos(a), -Math.sin(a)], ez = [Math.sin(a), Math.cos(a)];
      let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
      for (const [x, z] of hp) { const p = x * ex[0] + z * ex[1], qq = x * ez[0] + z * ez[1]; p0 = Math.min(p0, p); p1 = Math.max(p1, p); q0 = Math.min(q0, qq); q1 = Math.max(q1, qq); }
      const g = rs / 2 + 0.03, A = (p1 - p0 + 2 * g) * (q1 - q0 + 2 * g);
      if (!best || A < best.A - 1e-9) { const pc = (p0 + p1) / 2, qc = (q0 + q1) / 2; best = { A, s: orect(pc * ex[0] + qc * ez[0], pc * ex[1] + qc * ez[1], p1 - p0 + 2 * g, q1 - q0 + 2 * g, deg) }; }
    }
    return best.s;
  };
  const inside2 = (s) => {
    const n0 = Math.max(1, Math.ceil((s.h[0] * 2) / 0.04)), n1 = Math.max(1, Math.ceil((s.h[1] * 2) / 0.04));
    for (let a = 0; a <= n0; a++) for (let b = 0; b <= n1; b += a === 0 || a === n0 ? 1 : n1) { const [x, z] = ptO(s, -s.h[0] + (2 * s.h[0] * a) / n0, -s.h[1] + (2 * s.h[1] * b) / n1); if (!ok(x, z)) return false; }
    return true;
  };
  // pull in only the sides that poke out (a patch along a clip line keeps its length)
  const firstOut = (s) => {
    const n0 = Math.max(1, Math.ceil((s.h[0] * 2) / 0.04)), n1 = Math.max(1, Math.ceil((s.h[1] * 2) / 0.04));
    for (let a = 0; a <= n0; a++) for (let b = 0; b <= n1; b += a === 0 || a === n0 ? 1 : n1) { const u = -s.h[0] + (2 * s.h[0] * a) / n0, v = -s.h[1] + (2 * s.h[1] * b) / n1, [x, z] = ptO(s, u, v); if (!ok(x, z)) return [u, v]; }
    return null;
  };
  const fits = (s) => {
    for (let i = 0; i < 16; i++) {
      const o = firstOut(s); if (!o) return s;
      const k = Math.abs(o[0]) / s.h[0] >= Math.abs(o[1]) / s.h[1] ? 0 : 1, side = k * 2 + (o[k] < 0 ? 1 : 0);
      s = grown(s, side, -0.01);
      if (s.h[0] < 0.015 || s.h[1] < 0.015) return null;
    }
    return null;
  };
  const grown = (s, side, e) => { const k = side >> 1, sg = side & 1 ? -1 : 1, h = [...s.h]; h[k] += e / 2; const c = [s.c[0] + s.ax[k][0] * sg * e / 2, s.c[1] + s.ax[k][1] * sg * e / 2]; return { ...s, c, h }; };
  const tierFor = (s) => [0, 1].find((tier) => ![...out.filter((o) => o.tier === tier), ...slabs.filter((o) => o.tier === tier + 1), ...obst(y - GUT[tier]), ...designed.filter((o) => Math.abs(o.y1 - (y - GUT[tier])) < 0.085)].some((t) => Math.hypot(t.c[0] - s.c[0], t.c[1] - s.c[1]) < rad0(s) + rad0(t) + 0.01 && pen(s, t) > 3e-4));
  const place = (pts, depth = 0) => {
    const s = fits(fitRect(pts)), tier = s ? tierFor(s) : undefined;
    if (s && tier !== undefined) { out.push({ ...s, tier }); return true; }
    if (pts.length < 6 || depth > 6) { if (pts.length > 12) console.warn('terraces ground: unfilled patch', L, pts.length, pts[0]); return false; }
    // split along the long axis
    const t = fitRect(pts), ax = t.h[0] >= t.h[1] ? t.ax[0] : t.ax[1], ps = pts.map(([x, z]) => x * ax[0] + z * ax[1]), mid = [...ps].sort((a, b) => a - b)[ps.length >> 1];
    place(pts.filter((_, i) => ps[i] < mid), depth + 1); place(pts.filter((_, i) => ps[i] >= mid), depth + 1);
    return true;
  };
  const patches = [];
  for (let k = 0; k < N; k++) {
    if (!bare[k] || seen[k]) continue;
    let h = 0, t = 0; q[t++] = k; seen[k] = 1; const pts = [];
    while (h < t) {
      const c = q[h++], i = c % G.nx, j = (c / G.nx) | 0; pts.push([G.x0 + (i + 0.5) * rs, G.z0 + (j + 0.5) * rs]);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= G.nx || jj >= G.nz) continue; const kk = jj * G.nx + ii; if (bare[kk] && !seen[kk]) { seen[kk] = 1; q[t++] = kk; } }
    }
    if (pts.length >= 3) { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } patches.push({ pts, bb: [x0, x1, z0, z1] }); }
  }
  // cluster neighbouring patches under one gutter while its rectangle still fits (the slabs hide the parts between)
  patches.sort((a, b) => b.pts.length - a.pts.length);
  const used = new Array(patches.length).fill(false);
  for (let i = 0; i < patches.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let pts = patches[i].pts, bb = [...patches[i].bb], s = fits(fitRect(pts)), tier = s ? tierFor(s) : undefined;
    if (!s || tier === undefined) { place(pts); continue; }
    for (;;) {
      let bestJ = -1, bestD = 2.5;
      for (let j = 0; j < patches.length; j++) { if (used[j]) continue; const b = patches[j].bb, d = Math.max(0, b[0] - bb[1], bb[0] - b[1]) + Math.max(0, b[2] - bb[3], bb[2] - b[3]); if (d < bestD) { bestD = d; bestJ = j; } }
      if (bestJ < 0) break;
      const P2 = pts.concat(patches[bestJ].pts), s2 = fits(fitRect(P2)), t2 = s2 ? tierFor(s2) : undefined;
      if (!s2 || t2 === undefined || s2.h[0] * s2.h[1] * 4 > (s.h[0] * s.h[1] * 4 + patches[bestJ].pts.length * rs * rs) * 3 + 2) { used[bestJ] = 'skip'; continue; }
      used[bestJ] = true; pts = P2; s = s2; tier = t2; const b = patches[bestJ].bb; bb = [Math.min(bb[0], b[0]), Math.max(bb[1], b[1]), Math.min(bb[2], b[2]), Math.max(bb[3], b[3])];
    }
    for (let j = 0; j < used.length; j++) if (used[j] === 'skip') used[j] = false;
    out.push({ ...s, tier });
  }
  return out;
}

function generateGround(features) {
  const REG = [R0, R1, R2, R3, R4], LY = [H0, H1, H2, H3, H4];
  const FEAT = features.map(shapeOf).filter(Boolean);
  const laid = [];                    // ground shapes so far (with y0/y1)
  const out = [];
  for (let L = 4; L >= 0; L--) {
    const r = REG[L], y = LY[L];
    const all = () => [...FEAT, ...laid];
    const stand = all().filter((s) => s.y0 <= y + 0.01 && s.y1 >= y + 0.08);
    const obst = (yy) => all().filter((s) => Math.abs(s.y1 - yy) < 0.085 && s.y0 < yy - 1e-3);
    const bars = seatRims(rimBars(r), obst, y);
    const t0 = Date.now();
    // designed floor pieces set a little below this level (the bastion prow, the Largo sun): nothing is laid over them
    const designed = FEAT.filter((s) => s.y1 >= y - 0.19 && s.y1 <= y + 0.01 && s.y0 < y - 1e-3);
    const { slabs, rIn, rBand, okAt, dirs } = laySlabs(L, r, bars, stand, obst, y, 3, designed);
    const t1 = Date.now();
    const guts = layGutters(L, r, bars, stand, obst, y, slabs, rIn, rBand, okAt, dirs, designed);
    if (globalThis.__TERRACES_LOG) console.log(`level ${L}: ${bars.length} rims, ${slabs.length} slabs (${t1 - t0} ms), ${guts.length} gutters (${Date.now() - t1} ms)`);
    for (const b of bars) {
      const s = barRect(b), deg = Math.atan2(-b.u[1], b.u[0]) * DEG;
      laid.push({ ...s, y0: FL, y1: y + RIM_UP[b.k] });
      const np = L === 4 && inside(wedge, s.c[0], s.c[1]);
      out.push(O(s.c[0], s.c[1], barLen(b), RIM_W, FL, y + RIM_UP[b.k], deg, { ...RIM_MAT, tag: 'rim-' + L + '-' + b.k, ...(np ? { noPaint: NO_SIDES } : {}) }));
    }
    for (const s of slabs) { const yt = y - TIER_DN[s.tier]; laid.push({ ...s, y0: FL, y1: yt }); out.push(O(s.c[0], s.c[1], s.h[0] * 2, s.h[1] * 2, FL, yt, s.deg, { ...STRIP_MAT[L], tag: 'ground-' + L + '-' + s.tier })); }
    for (const s of guts) { laid.push({ ...s, y0: FL, y1: y - GUT[s.tier] }); out.push(O(s.c[0], s.c[1], s.h[0] * 2, s.h[1] * 2, FL, y - GUT[s.tier], s.deg, { ...GUT_MAT, tag: 'gutter-' + L + '-' + s.tier })); }
  }
  return out;
}
// The ground is generated once by the builder above and baked into GROUND_DATA below (the builder takes a while,
// which would otherwise run at every game boot). Regenerate after editing the regions or the features with
//   node $S/maps/terraces/tools/bake-ground.mjs   (sets globalThis.__TERRACES_REGEN and rewrites the table)
// Rows: [0, level, cx, cz, w, d, rotY°, tier] = a slab (FL → level height − TIER_DN[tier]) · [1, level, cx, cz, length, rotY°, noPaint, k] = a
// rim (RIM_W deep, RIM_UP[k] proud) · [2, level, cx, cz, w, d, rotY°, tier] = a pebble gutter (10 / 18 cm below the floor)
const LEVEL_Y = [H0, H1, H2, H3, H4];
const STRIP_MAT = [pebble({ color: TH.pebble }), pebble(), pebble(), cotto(), cotto()], RIM_MAT = cotto({ color: TH.rim }), GUT_MAT = pebble({ color: TH.pebble });
const NO_SIDES = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
function unbake(rows) {
  return rows.map((r) => (r[0] === 0 ? O(r[2], r[3], r[4], r[5], FL, LEVEL_Y[r[1]] - TIER_DN[r[7]], r[6], { ...STRIP_MAT[r[1]], tag: 'ground-' + r[1] + '-' + r[7] })
    : r[0] === 1 ? O(r[2], r[3], r[4], RIM_W, FL, LEVEL_Y[r[1]] + RIM_UP[r[7]], r[5], { ...RIM_MAT, tag: 'rim-' + r[1] + '-' + r[7], ...(r[6] ? { noPaint: NO_SIDES } : {}) })
    : O(r[2], r[3], r[4], r[5], FL, LEVEL_Y[r[1]] - GUT[r[7]], r[6], { ...GUT_MAT, tag: 'gutter-' + r[1] + '-' + r[7] })));
}
export function bakeGround(list) {
  const q = (v) => +v.toFixed(4);
  return list.map((d) => {
    const t = d.tag.split('-'), lv = +t[1];
    if (t[0] === 'rim') return [1, lv, q(d.center[0]), q(d.center[2]), q(d.size[0]), q(d.rotY), d.noPaint ? 1 : 0, +t[2]];
    if (t[0] === 'ground') return [0, lv, q(d.center[0]), q(d.center[2]), q(d.size[0]), q(d.size[2]), q(d.rotY), +t[2]];
    return [2, lv, q(d.center[0]), q(d.center[2]), q(d.size[0]), q(d.size[2]), q(d.rotY), +t[2]];
  });
}
/*GROUND_DATA*/const GROUND_DATA = [
  [1,4,-17.8473,-62.5786,1.1185,46.3473,0,0], [1,4,-5.4261,-61.2487,4.2711,-57.1257,0,0], [1,4,-4.1896,-57.515,4.2711,-86.2275,0,1], [1,4,-4.9004,-53.6804,4.1936,-115.0599,0,0], [1,4,-7.3873,-50.6762,4.2711,-143.8922,1,1], [1,4,-11.0453,-49.2311,4.2711,-172.994,1,0],
  [1,4,-14.9139,-49.7245,4.1936,158.1737,0,1], [1,4,-4.8,-65.3106,4.0212,-90,0,0], [1,4,-5.32,-63.7,1.84,-180,0,1], [1,4,-20.44,-63.7,5.36,-180,0,0], [1,4,-17.4143,-59.372,6.16,-84.8951,0,1], [1,4,-16.8662,-53.2365,6.16,-84.8951,0,0],
  [0,4,-11.6571,-59.2,10.7868,16.34,0,0], [0,4,-20.1417,-65.61,6.1829,3.5799,0,0], [0,4,-5.4641,-57.0292,1.5997,7.4817,0,0], [0,4,-11.8821,-50.2801,7.1363,1.5002,0,0], [0,4,-11.2182,-64.17,13.1385,3.76,12.1957,1], [0,4,-11.69,-56.1858,11.2506,10.6,7.006,1],
  [0,4,-5.3319,-58.2805,1.2197,7.38,12.1957,1], [0,4,-10.6597,-50.1183,6.6967,1.095,12.1957,1], [0,4,-13.9253,-66.715,19.0105,1.37,0,2], [2,4,-5.593,-53.2,0.185,0.26,0,1], [2,4,-17.1055,-60.9125,0.16,0.185,0,1], [2,4,-4.643,-58.1375,0.085,0.385,0,1],
  [1,3,-16.1259,-44.9495,1.2,-84.8951,0,0], [1,3,-2.7145,-47.9453,3.7454,-134.279,0,0], [1,3,-5.4877,-45.7715,3.5869,-149.8869,0,1], [1,3,-15.9503,-44.516,0.7993,162.4411,0,1], [1,3,-20.0606,-46.8396,3.7454,141.574,0,0], [1,3,-2.4425,-65.7832,3.5869,-47.4175,0,0],
  [1,3,-0.4799,-62.9928,3.5077,-62.5165,0,1], [1,3,1.8905,-60.2707,3.5508,-35.4012,0,0], [1,3,3.8917,-57.7771,3.5508,-67.1037,0,1], [1,3,4.2999,-54.638,3.4739,-98.454,0,0], [1,3,2.9964,-51.7532,3.5508,-129.8043,0,1], [1,3,0.394,-49.9507,3.4739,-161.1546,0,0],
  [1,3,-14.347,-32.6703,2.3675,102.4855,0,0], [1,3,-6.628,-33.8616,0.6387,-84.7977,0,0], [1,3,-15.0882,-41.3095,5.4336,-86.4785,0,0], [1,3,-14.7569,-35.9261,5.3537,-86.4785,0,1], [1,3,-6.772,-36.4175,5.3537,93.5215,0,1], [1,3,-7.1008,-41.761,5.3537,93.5215,0,0],
  [1,3,-5.3532,-27.5017,2.8996,-88.4024,0,0], [1,3,-6.0865,-25.1823,2.8242,-127.2781,0,1], [1,3,-8.0907,-23.8532,2.8242,-165.6213,0,0], [1,3,-10.4872,-24.0541,2.8242,156.0355,0,1], [1,3,-12.2421,-25.6984,2.8242,117.6923,0,0], [1,3,-13.4711,-29.0744,5.5081,-75.3027,0,1],
  [1,3,-5.9813,-31.2631,4.5938,104.6973,0,0], [1,3,-17.7538,-45.8647,2.24,5.1049,0,1], [0,3,-8.5978,-53.7224,22.8294,15.3457,45,0], [0,3,-10.1086,-32.6948,7.2427,15.2016,12.1957,0], [0,3,-20.1259,-61.4,4.71,12,0,0], [0,3,1.8094,-52.2182,6.3312,1.5003,45,0],
  [0,3,-19.6605,-47.6698,1.376,4.969,45,0], [0,3,-21.1276,-54.3001,2.3134,2.2003,0,0], [0,3,-2.4323,-64.6285,1.0375,6.5748,42.5825,0], [0,3,-13.8169,-41.4848,1.7294,3.1,42.5825,0], [0,3,-12.6999,-58.75,18.6149,17.3,0,1], [0,3,-10.9359,-41.8001,8.1046,16.6003,0,1],
  [0,3,-8.8528,-28.7151,4.5813,9.5703,0,1], [0,3,0.5145,-59.4085,3.1693,8.1,42.5825,1], [0,3,-0.5012,-51.2503,12.8565,1.9993,45,1], [0,3,-13.3214,-29.9534,1.1912,7,12.1957,1], [0,3,-11.8337,-56.7171,21.4389,16.18,5.1049,2], [2,3,-15.428,-44.1275,0.4669,0.7214,45,0],
  [2,3,2.107,-51.3375,1.9942,0.2264,45,0], [2,3,-6.4515,-25.5864,0.71,0.3533,-127.5686,1], [2,3,-5.4055,-29.025,0.46,0.21,0,0], [2,3,-5.1555,-29.0375,0.16,0.235,0,1], [2,3,-5.088,-29.0825,0.095,0.125,0,0], [2,3,-5.0255,-29.005,0.07,0.07,0,1],
  [2,3,-14.0555,-33.4375,0.21,0.185,0,1], [2,3,-6.418,-33.5375,0.3889,0.1222,7.125,1], [2,3,-17.4305,-46.3,0.2264,0.1911,45,0], [2,3,-1.1867,-49.1187,0.138,0.1204,45,1], [1,2,-14.4673,-26.3834,0.88,-84.8951,0,0], [1,2,-13.6737,-23.0028,6,-77.8043,0,1],
  [1,2,-12.4231,-17.2164,5.84,-77.8043,0,0], [1,2,-12.4231,-17.2164,5.84,-77.8043,0,1], [1,2,4.7146,-64.6933,5.4979,-65.2847,0,0], [1,2,6.2178,-59.6638,5.3396,-81.6812,0,1], [1,2,-4.386,-18.1316,3.752,-155.7066,0,0], [1,2,-7.7716,-16.9744,3.5928,-166.7984,0,1],
  [1,2,7.9817,-56.6,1.8367,0,0,0], [1,2,8.7308,-55.1793,3.5685,-82.6736,0,1], [1,2,9.1808,-51.6793,3.4892,-82.6736,0,0], [1,2,9.5029,-48.1874,3.5854,-86.7295,0,1], [1,2,9.7029,-44.6874,3.426,-86.7295,0,0], [1,2,9.6984,-41.233,3.5854,-93.2705,0,1],
  [1,2,9.4984,-37.733,3.426,-93.2705,0,0], [1,2,8.8779,-33.4291,5.4036,-101.3099,0,1], [1,2,8.734,-28.9872,3.2488,-76.5818,0,0], [1,2,8.734,-26.0128,3.2488,-103.4182,0,1], [1,2,7.3912,-23.3587,3.2488,-130.2545,0,0], [1,2,9.5292,-19.9987,6.6946,-25.4774,0,0],
  [1,2,11.0189,-17.0515,3.1562,-124,0,0], [1,2,-10.5135,-15.8657,2.2273,35.228,0,0], [1,2,-0.2636,-18.9594,4.5478,0.7965,0,1], [1,2,4.3209,-18.4624,4.5478,-13.1722,0,0], [1,2,8.2806,-17.0671,3.7157,-27.0184,0,0], [1,2,-17.4334,-26.9937,4.96,5.1049,0,0],
  [0,2,-5.6071,-41.95,28.6592,30.06,0,0], [0,2,0.9135,-22.7607,11.4492,8.2999,0,0], [0,2,-9.3603,-62.25,26.5485,10.26,0,0], [0,2,-10.7252,-21.6701,3.8292,10.5002,0,0], [0,2,4.8738,-60.0749,1.9203,6.1902,0,0], [0,2,9.0956,-18.4696,2.9776,4.7,76.5818,0],
  [0,2,-6.8108,-24.3924,4.0001,5.0556,0,0], [0,2,-20.4328,-47.5751,0.9928,19.0902,0,0], [0,2,9.1244,-43.3522,0.8043,17.2355,0,0], [0,2,7.5389,-25.4651,1.8021,2.9103,0,0], [0,2,-7.3835,-17.4376,2.8548,0.8551,0,0], [0,2,-3.522,-40,20.9154,34.76,0,1],
  [0,2,-21.542,-50.1272,0.9319,34.6,5.1049,1], [0,2,7.7164,-19.0995,3.7586,8.1296,62.9816,1], [0,2,-7.7632,-60.2201,4.0891,28.0164,86.7295,1], [0,2,-7.5482,-45.912,28.0585,36.6872,5.1049,2], [0,2,-12.4442,-21.1361,2.3749,11.5927,12.1957,2], [2,2,6.7741,-22.955,2.433,0.4124,-108.2394,1],
  [2,2,-14.5473,-26.8439,0.6647,0.1348,4.9697,0], [2,2,-14.108,-26.875,0.135,0.11,0,0], [2,2,-14.0705,-26.725,0.11,0.11,0,0], [2,2,-14.0705,-26.8,0.11,0.11,0,1], [2,2,-4.583,-18.4875,0.535,0.285,0,0], [2,2,12.0095,-18.3225,0.3086,0.1633,-26.5651,1],
  [2,2,12.1574,-18.2481,0.1751,0.1682,-123.6901,0], [2,2,12.202,-18.2125,0.105,0.085,0,1], [2,2,8.4795,-26.725,0.16,0.46,0,0], [2,2,6.5295,-57.1875,1.1734,0.1469,-29.7449,1], [2,2,3.9295,-65.4125,0.11,0.185,0,0], [2,2,5.867,-57.3875,0.135,0.085,0,1],
  [2,2,-9.4964,-16.3827,0.1751,0.1127,123.6901,0], [2,2,-14.6805,-25.9175,0.03,0.075,0,0], [2,2,-11.583,-15.375,0.138,0.1027,45,0], [1,1,-12.3724,-16.9818,5.36,-77.8043,0,0], [1,1,-12.3724,-16.9818,5.36,-77.8043,0,1], [1,1,-3.0198,-18.7154,0.7196,-151.1253,0,0],
  [1,1,-9.1353,-16.6254,0.7196,-171.1386,0,0], [1,1,-10.5135,-15.8657,2.2273,35.228,0,1], [1,1,0.5039,-18.8468,6.052,-1.5317,0,1], [1,1,8.6158,-16.8961,4.4684,-27.0184,0,0], [1,1,9.6266,-64.6591,5.4269,-70.4984,0,0], [1,1,10.8071,-59.5333,5.3475,-83.662,0,1],
  [1,1,11.5942,-55.126,3.6665,-74.8142,0,0], [1,1,12.5442,-51.626,3.5868,-74.8142,0,0], [1,1,13.0509,-47.4523,5.0804,-88.8542,0,1], [1,1,13.1509,-42.4523,4.9216,-88.8542,0,0], [1,1,12.9506,-38.0298,4.071,-97.125,0,1], [1,1,12.4506,-34.0298,3.9912,-97.125,0,0],
  [1,1,11.7851,-29.7734,4.674,-100.3889,0,1], [1,1,12.341,-25.6981,3.3267,-57.661,0,0], [1,1,13.3658,-22.808,3.3267,-83.2881,0,1], [1,1,13.0399,-19.7589,3.3267,-108.9153,0,0], [1,1,11.4593,-17.171,3.2488,-134.2373,0,1], [1,1,-7.451,-14.8654,3.5964,118,0,0],
  [1,1,-3.2765,-16.2783,3.6,-80,0,0], [1,1,-4.92,-14.1965,4.5396,19.1144,0,1], [1,1,4.0252,-14.6135,2.2367,-15.3998,0,0], [1,1,3.583,-16.3365,3.84,79,0,1], [1,1,5.3427,-15.8485,3.84,-110,0,1], [1,1,-15.847,-19.4624,4.9435,12.1957,0,0],
  [0,1,-3.3689,-37.85,30.2011,36.44,0,0], [0,1,7.8106,-61.7349,4.5893,10.6,12.1957,0], [0,1,12.2318,-42.8018,1.0009,19.1636,0,0], [0,1,-5.5091,-16.9701,4.1539,5.3202,0,0], [0,1,12.3897,-21.95,1.3164,6.68,0,0], [0,1,4.5107,-17.3,1.8768,4.54,0,0],
  [0,1,-19.206,-24.3335,0.3189,5.5,12.1957,0], [0,1,-4.9852,-44.85,28.127,45.08,0,1], [0,1,-17.8667,-20.4528,1.346,3.484,15.1858,1], [0,1,10.9908,-29.8891,27.1068,1.7,82.875,1], [0,1,-4.2993,-43.2,30.4584,37.34,0,2], [2,1,11.9197,-25.6,0.435,0.66,0,0],
  [2,1,-6.2803,-14.175,0.885,0.31,0,0], [2,1,-7.7428,-16.3,0.36,0.66,0,0], [2,1,11.8322,-52.7125,0.26,0.735,0,0], [2,1,11.4947,-19.5125,0.535,0.285,0,0], [2,1,4.3447,-14.95,0.585,0.21,0,0], [2,1,13.0947,-21.4875,0.135,0.885,0,0],
  [2,1,5.5322,-17.575,0.21,0.46,0,0], [2,1,-3.3079,-18.1802,0.3869,0.0733,26.5651,0], [2,1,-8.4802,-16.3594,0.3045,0.1517,14.0362,0], [2,1,6.2362,-17.6125,0.3059,0.0745,-18.4349,0], [2,1,10.1043,-62.0644,0.34,0.1144,101.3099,0], [2,1,11.7372,-27.3,0.07,0.06,0,0],
  [1,0,-26.4,-66.651,0.5519,90,0,0], [1,0,-23.6,-35.3121,0.5592,90,0,0], [1,0,-23.6,-35.308,0.5593,90,0,1], [1,0,11.2057,-64.7676,5.5758,-57.45,0,0], [1,0,14.1843,-60.1012,5.4962,-57.45,0,0], [1,0,15.6,-56.125,3.75,-90,0,1],
  [1,0,15.6,-52.375,3.75,-90,0,0], [1,0,17.4691,-47.6252,6.407,-55.8139,0,0], [1,0,19.2,-43,4.4,-90,0,1], [1,0,17.4691,-38.3748,6.407,-124.1861,0,0], [1,0,15.6,-33.225,4.55,-90,0,0], [1,0,15.6,-28.675,4.55,-90,0,0],
  [1,0,17.704,-23.9309,5.9464,-47.7263,0,0], [1,0,19.6,-18.5,7,-90,0,1], [1,0,18.303,-13.8687,3.9998,-135,0,0], [1,0,15.503,-11.0687,3.9198,-135,0,0], [1,0,14,-7.8068,3.1864,-90,0,0], [1,0,-14,-5.28,2.88,90,0,0],
  [1,0,-15.9395,-7.2,2.9211,-180,0,0], [1,0,-18.9128,-8.0535,3.8471,152.1027,0,1], [1,0,-20.5882,-9.5804,1.8396,101.3099,0,0], [1,0,16.65,-5.8,4.5,0,0,0], [1,0,19.8812,-4.6531,3.5753,-45,0,1], [1,0,22.3812,-2.1531,3.4958,-45,0,0],
  [1,0,23.0273,-0.893,1.6685,-135,0,1], [1,0,-20.2342,-1.9001,4.5738,45,0,0], [1,0,-16.6895,-3.4,4.4211,0,0,1], [0,0,-20.5457,-46.1462,8.6376,41.9051,5.1049,0], [0,0,-17.1152,-16.6463,5.4708,17.0526,0,0], [0,0,-3.7462,-63.95,27.4921,6.9,0,0],
  [0,0,15.1556,-34.5149,1.5518,47.1102,0,0], [0,0,17.543,-18.5415,3.2235,8.7169,0,0], [0,0,17.2848,-43,2.7072,7.16,0,0], [0,0,-20.5886,-21.1353,1.4767,7.8107,0,0], [0,0,11.1145,-62.1349,2.2298,3.4703,0,0], [0,0,-15.9723,-7.5151,3.1852,1.2103,0,0],
  [0,0,19.5672,-18.5,0.8255,7,0,0], [0,0,-20.3037,-9.505,0.907,1.81,0,0], [0,0,-20.5806,-14.6117,0.3527,5.2818,12.1957,0], [0,0,14.8046,-58.6199,0.8497,1.1002,0,0], [0,0,13.0846,-60.7949,1.7108,0.7903,0,0], [0,0,-18.5099,-45.3527,8.2603,44.0946,0,1],
  [0,0,15.9582,-18.6224,3.1568,12.1151,0,1], [0,0,-19.2106,-15.4798,2.8365,15.4,12.1957,1], [0,0,15.8599,-43,2.9603,10.98,0,1], [0,0,11.193,-63.8998,1.7152,7.21,32.55,1], [0,0,-24.6828,-66.615,4.0861,1.57,0,1], [0,0,18.4599,-43,2.2402,4.4,0,1],
  [0,0,-18.7953,-17.6669,4.9069,19.1,12.1957,2], [0,0,17.1799,-12.9763,6.9199,1,45,2], [0,0,16.9799,-38.63,6.6639,1.76,55.8139,2], [0,0,16.9799,-47.2784,1.8713,6.5,34.1861,2], [0,0,17.1799,-23.2751,2.2048,5.9,42.2737,2], [2,0,-19.84,-10.6875,0.03,0.485,0,0],
  [2,0,-19.92,-10.9375,0.04,0.185,0,0], [2,0,-19.9175,-10.975,0.085,0.11,0,1], [2,0,-19.9175,-11.08,0.135,0.1,0,0], [2,0,-19.9425,-11.08,0.085,0.1,0,1], [2,0,-19.9925,-11.4625,0.135,0.185,0,0], [2,0,-20.015,-11.4,0.08,0.11,0,1],
  [2,0,-19.9675,-11.1875,0.085,0.085,0,0], [2,0,-19.9875,-11.28,0.075,0.1,0,0], [2,0,-19.9675,-11.23,0.085,0.1,0,1], [2,0,14.4575,-10.7375,0.235,0.485,0,0], [2,0,-17.6675,-7.875,0.285,0.21,0,1], [2,0,15.9325,-12.4625,0.085,0.135,0,0],
  [2,0,-14.43,-6.875,0.16,0.11,0,0], [2,0,-14.41,-6.8425,0.12,0.075,0,1], [2,0,17.62,-14.125,0.16,0.16,0,0], [2,0,15.9425,-26.36,0.105,0.08,0,0],
];/*END_GROUND_DATA*/
// San Vito on its sagrato (a 1.2 m limestone platform: cover walls on the long sides, church steps at both ends).
// Zone Control (src/world/variants.js) builds the centre zone differently: the chapel block is gone — San Vito is opened
// up into a tempietto (eight columns under the majolica dome, props.js terraces_tempietto: only its slender columns
// stand on the platform, the dome above is off-limits) — and the sagrato is 2 m deeper (16 x 12), so the whole platform
// is one open, inkable zone instead of a thin ring round an un-inkable box.
const SAGRATO = { tag: 'sagrato', color: '#e6dccb', pattern: PATTERN.pavers };
// San Vito open (Tower Command): 0.6 m taller than the shared chapel (5.8), so its arcade is 4.0 m clear over the
// sagrato (the tower needs 3.72 m, TOWER_HEAD); the block over the arches keeps its 1.2 m
const SV = { y0: H1, y1: 6.4, spring: 5.2, wall: 0.8, pier: [1.8, 2.4], depth: 0.6 };
const SAN_VITO_OPEN = (() => {
  const t = (o = {}) => upper(TH.white, { tag: 'chapel', onlyIn: 'tower', ...o });
  const out = [B(-5.5, 5.5, SV.spring, SV.y1, -3, 3, t({ noPaint: [...NOPAINT, [0, -1, 0]] }))];
  for (const s of [-1, 1]) out.push(B(s < 0 ? -5.5 : 5.5 - SV.wall, s < 0 ? -5.5 + SV.wall : 5.5, SV.y0, SV.spring, -3, 3, t()));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [a, b] = SV.pier, z0 = 3 - SV.depth;
    out.push(B(sx < 0 ? -b : a, sx < 0 ? -a : b, SV.y0, SV.spring, sz < 0 ? -3 : z0, sz < 0 ? -z0 : 3, t()));
  }
  return out;
})();
const SINGLE = [
  B(-8, 8, H0, H1, -5, 5, { ...SAGRATO, mural: [{ n: [0, 1, 0], id: MURAL.sagrato }, { n: [0, 0, 1], id: MURAL.frieze }, { n: [0, 0, -1], id: MURAL.frieze }], notIn: 'zones' }),
  B(-8, 8, H0, H1, -6, 6, { ...SAGRATO, mural: [{ n: [0, 1, 0], id: MURAL.sagratoZ }, { n: [0, 0, 1], id: MURAL.frieze }, { n: [0, 0, -1], id: MURAL.frieze }], onlyIn: 'zones' }),
  R([11.1, H0, 0], [8, H1, 0], 6, stair({ tag: 'sagrato-steps' })),
  R([-11.1, H0, 0], [-8, H1, 0], 6, stair({ tag: 'sagrato-steps' })),
  B(-5.5, 5.5, H1, 5.8, -3, 3, upper(TH.white, { tag: 'chapel', notIn: ['zones', 'tower'] })),
  // Tower Command: San Vito open at the base (the tower starts under the dome and rolls out through the long sides) —
  // the same block and dome, carried on its two facade walls and four piers: an arcade of three arches along each long
  // side (the middle one 3.6 m wide over the track), 4.0 m clear inside (props.js terraces_chapel `open` dresses it)
  ...SAN_VITO_OPEN,
];
const EXTRA = [
  // belvedere bastion floors (pebble, compass rose) — one each side of the piazza, mirrored as a pair
  // the piazza's floor, running on under the crescent and the hill (the rest of the promenade level — the east
  // promenade, the headland, the funicular landing, the back — is laid by the ground builder round it)
  B(-14.38, 14.38, FL, H0, -38.4 - DS, 0, pebble({ tag: 'piazza', color: TH.pebble })),
  // (flanks level with the piazza; the prow a step down, the pebble compass rose on it)
  B(14.38, BELV[0], FL, H0, BELV[1] - BELV_D, BELV[1] + BELV_D, pebble({ tag: 'belvedere', color: TH.pebble })),   // (flush with the piazza slab, which stops 2 cm short of the sea wall)
  O(BELV[0], BELV[1], BELV_D * Math.SQRT2, BELV_D * Math.SQRT2, FL, H0 - 0.1, 45, pebble({ tag: 'belvedere-prow', color: TH.pebble, mural: [{ n: [0, 1, 0], id: MURAL.rose }] })),
  // back walls
  B(-26.8, -19.6, FL, 7.6, ZBACK - 0.6, ZBACK, upper(TH.station, { tag: 'station-back' })),
  B(-19.6, -4.4, FL, 8.4, ZBACK - 0.6, ZBACK, upper(TH.villa, { tag: 'villa-facade' })),
  B(-4.4, 8.5, FL, 5.0, ZBACK - 0.6, ZBACK, upper(TH.wall, { tag: 'garden-wall' })),
  // the funicular incline: track bed + service stair + west parapet
  // (reach by reach: the upper one from the station down to the kink, the lower one on to the foot)
  ...INC_SEG.flatMap((g) => [
    R([g.b[0] - g.n[0] * 0.9, g.b[1], g.b[2] - g.n[1] * 0.9], [g.a[0] - g.n[0] * 0.9, g.a[1], g.a[2] - g.n[1] * 0.9], 2.0, { tag: 'incline-track', color: '#d3cbbd', pattern: PATTERN.concrete }),
    R([g.b[0] + g.n[0] * 1.0, g.b[1], g.b[2] + g.n[1] * 1.0], [g.a[0] + g.n[0] * 1.0, g.a[1], g.a[2] + g.n[1] * 1.0], 1.8, stair({ tag: 'incline-stair' })),
    R([g.b[0] - g.n[0] * 2.03, g.b[1] + 1.0, g.b[2] - g.n[1] * 2.03], [g.a[0] - g.n[0] * 2.03, g.a[1] + 1.0, g.a[2] - g.n[1] * 2.03], 0.26, { tag: 'incline-parapet', color: TH.wall, pattern: SURF.calce ?? PATTERN.render }),
  ]),
];
// (the ground is shared by every mode: it is laid round the Turf War pieces)
export const GROUND_FRESH = globalThis.__TERRACES_REGEN || !GROUND_DATA ? generateGround([...SINGLE.filter((d) => !d.onlyIn), ...FEATURES, ...EXTRA, ...[...FEATURES, ...EXTRA].map(mirrorDef)]) : null;
const GROUND = GROUND_FRESH || unbake(GROUND_DATA);
// Tower Command: the kerb of the street behind the Ceramiche (a rim the house used to stand on) gives way to a pebble
// gutter 10 cm below the street — the house stands 0.7 m further forward (CERAMICHE_T) and the track runs along the
// street (a 19 cm kerb under one side of the platform would tilt it); the street's slab covers all but the strip along
// the house. [level, centre x, centre z] of the rims replaced:
const TOWER_GUTTER = [[2, -0.2636, -18.9594]];
const GROUND_T = GROUND.flatMap((d) => {
  const f = TOWER_GUTTER.find(([L, x, z]) => String(d.tag).startsWith('rim-' + L + '-') && Math.abs(d.center[0] - x) < 1e-3 && Math.abs(d.center[2] - z) < 1e-3);
  if (!f) return [d];
  return [{ ...d, notIn: 'tower' }, O(d.center[0], d.center[2], d.size[0], d.size[2], FL, LEVEL_Y[f[0]] - GUT[0], d.rotY, { ...GUT_MAT, tag: 'gutter-t', onlyIn: 'tower' })];
});

const TERRACES = {
  id: 'terraces',
  bounds: { minX: -28, maxX: 28, minZ: -46 - DS, maxZ: 46 + DS },
  spawnPads: [[-12, H4, -38.4 - DS], [12, H4, 38.4 + DS]],
  spawnBarrier: 4.0,
  single: SINGLE,
  half: [...GROUND_T, ...FEATURES, ...EXTRA, ...TOWER_HALF],
  decor: { lamps: [], palms: [], flags: [[-18.6, H4, -44.6 - DS], [-5.4, H4, -44.6 - DS]] },
  // HULLBREAKER's floor: the piazza + promenade level (the stretch's olive terraces made H2 the stage's most common level)
  boss: { floorY: H0 },
  intro: { from: [26, 11, 10], lookFrom: [2, 3, -6], toBack: 3.2 },
  // (the stretch: over the olive terraces — the lavatoio, the lemon house — to San Vito's dome and the piazza)
  art: { from: [30, 24, -52], look: [-5, 2, -16], fov: 60 },
};

export const LAYOUT = TERRACES;
export const TERRAIN = { C, C0, DS, LEMON, LAVATOIO, R0, R1, R2, R3, R4, inside, INC, INC_SEG, INC_LEN, incP, incY, incDirAt, incNAt, T_CUT, PB, OLIVETO, LIMONAIA, SAL_W, PIAZZA_R, BELV, BELV_D, P, rotOf, uO, HOUSES, UPPERS, PORTICO, CAFFE_T, CERAMICHE_T, UPPER_CERAMICHE_T, SV, GAPS, STREET_R0, STREET_R1, EAST, LARGO, HOUSE_R0, HOUSE_R1, wedge, FL, H0, H1, H2, H3, H4 };
