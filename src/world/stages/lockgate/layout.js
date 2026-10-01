// Lockgate Canals — stage layout (src/world/stages/lockgate/). The stage owns every file in this folder:
//   layout.js    level geometry (this file)        props.js    prop pack + placements (set dressing)
//   surfaces.js  stage surface materials (texlib)  murals.js   stage decals / signage (mural atlas)
import { PATTERN, B, R, O } from '../../mapkit.js';
import { SURF } from './surfaces.js';

// Lockgate Canals — a flight of broad locks climbing out of the harbour through an old brick warehouse district. The
// CHOKEPOINT map, and a zig-zag one: the canal crosses the arena as a Z — lock W along x (z ≈ -12), a DIAGONAL pound
// through the middle (45°, under the humpback bridge), lock E along x (z ≈ +12) — so the frontline zig-zags and each
// team's territory is a stepped, angled band (Alpha: the south + the east flank up to lock E; Bravo: the mirror).
//   • water, honestly: the pound + its angled lock-tail basins are sea level (real, lethal, marina water). The locks
//     are DRAINED for a winter stoppage: chamber floors at -1.9 (below the sea, dry and safe; their blocks mask the
//     sea), leaks spraying through the upper gates. Above the upper gates the canal (visual water, 1.3 m higher) runs
//     off under ANCHOR MILLS behind iron railings.
//   • crossings: the humpback bridge over the diagonal pound (crest 3.3 m; the towpaths pass under it), the lower +
//     upper gate walkways of each lock (1.3 m, balance beams as waist-high cover) and the drained chambers (one broad
//     maintenance stair down each, split into three flights by handrails). Squids: the breasted narrowboats against your own towpath leave a
//     ~5.2 m jump to the enemy bank; ink-climb the chamber walls, lock sides, loading bank, office.
//   • each half: spawn on the loading stage of LOCKGATE WHARF (2.4; grand stair, west stair, east cart ramp) in a
//     back yard with a notched SW corner; lanes bend round the buildings — the west street past the lock-keeper's
//     cottage and up the horse ramp to lock W; the bridge street between the company office (roof terrace 2.6) and
//     the stables, turning 45° onto the bridge; the east lane along the transit shed's loading bank (1.3) onto the
//     lock-E wharf platform (1.3). The diagonal towpath (a raised stone quay, +0.15) runs from basin to basin.
//   • outline: the zig-zag frontline, 45° quays, a chamfered + notched SW corner, a stepped SE corner (both halves by
//     rotation) — framed by out-of-play architecture (mills, terraces, ANCHOR WAREHOUSE).
//   • off-limits (roof: true): building tops, wall tops, parapet tops, the mills. Railings are rail colliders (props).
//   • Tower Command builds its own variant (src/world/variants.js: onlyIn / notIn 'tower'; every other mode is untouched):
//     the humpback bridge 7.2 m wide between its parapets, the moored narrowboats turned across the pound beside it as a
//     low crossing (XBOATS), the stables' flat loft roof in play (inkable, walkable: the one roof that is) up a horse ramp,
//     with cover on it, the office a metre shallower, the towpath ending short of the office street, the lower gates'
//     lock-side beam cranked — the tower's street kept clear.
//   • THE LONG STAGES STRETCH (2026-09-30: every half 22 m longer, spawn → mid 4.6 s → ~6.6 s of swimming). The cut
//     runs across Alpha's half at z = LS.cut (-32.2), just behind the office / stables / lock-keeper's cottage row;
//     everything beyond it — the back yard, the loading stage, the SW notch + chamfer (BASE below, drawn in its old
//     coordinates) — is moved out by LS.d along -Z (base()). The 22 m it leaves is new land, THE DRY DOCK (DOCK below):
//       - the canal company's dry dock across the west of the slice, fed from the upper pound by a dock arm through an
//         arch in the west wall: a drained brick chamber (floor -1.9, an altar ledge -0.95 along each side, head steps
//         the floor's width down at its east end) with a working boat up on keel blocks, mitre gates + balance beams
//         at the mouth (their walkway flush with the docksides: the west flank crossing);
//       - the CRANE STAGING over the dock (1.3, stairs from both docksides, a hand crane on it): the slice's strategic
//         point, over the dock floor route and the boat, looking up the yard between the cottage and the office to mid;
//       - the boatbuilder's shed with its loading bay (1.3, two flights down to the lane by the dock head) in the east of
//         the slice, the dock road (north) and the back road (south) round it: three lanes through the slice (the dock
//         + gate walkway on the west, the lane between the dock head and the bay, the east lane along the yard wall)
//         and two links across it, timber stacks, a steam chest, a boat on the stocks, tar kettle, casks for cover.
//     Tower Command: the track comes down the yard past the office stair (as drawn) and goes round the boatbuilder's
//     shed (dock road → east lane → back road) to the goal in front of the loading stage (tower-data.js).
const LG = {
  setts: '#a9a39a', lockside: '#6a6b74', brick: '#a4563f', stone: '#d8d0c0', quay: '#bcb4a6',
  timber: '#4a3a30', leads: '#7a7d82', spawn: '#eae6de', render: '#ece4d4', hull: '#2d3440',
};
const brick = (o = {}) => ({ color: LG.brick, pattern: SURF.engbrick, ...o });
const wall = (o = {}) => brick({ roof: true, ...o });

// ---- the diagonal frame: s along u = (c, c) (south-west → north-east), t along v = (-c, c) (toward Bravo's bank)
const c = Math.SQRT1_2;
const W = (s, t) => [c * (s - t), c * (s + t)];                          // frame → world (x, z)
// box in the frame: s0…s1 along u, t0…t1 along v → turned piece (local x along u)
const D = (s0, s1, t0, t1, y0, y1, o) => { const [x, z] = W((s0 + s1) / 2, (t0 + t1) / 2); return O(x, z, s1 - s0, t1 - t0, y0, y1, -45, o); };
// ramp in the frame: low / high points given as [s, y, t]
const DR = (lo, hi, width, o) => { const [lx, lz] = W(lo[0], lo[2]), [hx, hz] = W(hi[0], hi[2]); return R([lx, lo[1], lz], [hx, hi[1], hz], width, o); };
const nU = [c, 0, c], nV = [-c, 0, c];                                   // frame normals (for murals / noPaint)
const neg = (n) => n.map((k) => -k);

// canal geometry (Alpha's side): pound half-width 4.77 (edges z = x ± 6.75), towpath 4 m, lock E chamber x 16.5…24.5
const HW = 4.77, TOW = 4;
const yard = (x0, x1, z0, z1) => B(x0, x1, -0.6, 0, z0, z1, { tag: 'yard', color: LG.setts, pattern: SURF.setts });

// ---- the stretch (see the header): Alpha's base beyond the cut moves out by d; the slice between is the dry dock
export const LS = { cut: -32.2, d: 22 };
// a layout piece of Alpha's base, drawn where it stood before the stretch, moved out by LS.d (props.js does the same to
// the placements beyond the cut)
function base(p) {
  const d = LS.d;
  if (p.kind === 'box') return { ...p, min: [p.min[0], p.min[1], p.min[2] - d], max: [p.max[0], p.max[1], p.max[2] - d] };
  if (p.kind === 'obox') return { ...p, center: [p.center[0], p.center[1], p.center[2] - d] };
  return { ...p, low: [p.low[0], p.low[1], p.low[2] - d], high: [p.high[0], p.high[1], p.high[2] - d] };
}
// setts columns under the diagonal towpath: each column's north-west corner stays 0.25 m inside the water edge (z =
// x - 6.75) and the towpath quay (0.15 higher) covers the stepped edge; they run back to the cut (the yard beyond it is
// the base's)
const cols = [];
for (const [x0, x1] of [[-8, -4], [-4, 0], [0, 4], [4, 8], [8, 14]]) cols.push(yard(x0, x1, LS.cut, x0 - 7));

// ---- Tower Command only (src/world/variants.js: the tower's own build; every other mode keeps the pieces above)
export const BRIDGE_T = 3.6;             // the humpback bridge's deck half-width in Tower Command (2.2 elsewhere)
// the two narrowboats turned across the pound beside the bridge (the user's "shortcut to the other side bypassing the
// bridge"): breasted side by side, each spanning quay to quay — its pointed bow and counter stern down in the water, the
// cabin roof / sheeted hold (5.8 m, top 0.25: a step up from the towpath's 0.15) in the middle, and a wide boarding plank
// from each quay onto its roof over the bow / stern, so the whole crossing is one flat 4.25 m walk with no gap to fall
// into. s0: the hull's side nearer the bridge (s along the pound); bow: the quay the bow points at (-1 Alpha's towpath,
// +1 Bravo's). The props' lockgate_narrowboat dresses each one (props.js reads XBOATS for its pos / heading).
export const XBOAT = { beam: 2.1, L: 6.5, cab: 2.9, bowOut: 1.88 };   // hull block length; bowOut: the bow shape's reach
export const XBOATS = [
  { s0: 7.175, bow: -1, kind: 'cabin' },      // PERSEVERANCE, the livery (bow → stern) on the side facing the bridge
  { s0: 9.325, bow: 1, kind: 'working' },     // the working boat, turned the other way
];
// hull span along t (across the pound) for one of them: its bow shape ends just short of the quay it points at
export const xboatT = (b) => { const t0 = b.bow < 0 ? -HW + XBOAT.bowOut : HW - XBOAT.bowOut - XBOAT.L; return [t0, t0 + XBOAT.L]; };
// the humpback bridge (Alpha's half) with a deck ±bw wide: abutment, approach ramp, humped crest, brick parapets
function wideBridge(bw) {
  const t = { onlyIn: 'tower' }, p = bw + 0.2, q = bw + 0.4;
  return [
    D(-bw, bw, -8.4, -7, 0, 3.0, { tag: 'bridge-abutment', color: LG.setts, pattern: SURF.setts, noPaint: [nV], ...t }),
    DR([0, 0, -15.2], [0, 3.0, -8.4], 2 * bw, { tag: 'bridge-ramp', color: LG.setts, pattern: SURF.hoofsteps, ...t }),
    DR([0, 3.0, -7], [0, 3.3, 0], 2 * bw, { tag: 'bridge-crest', thin: true, thickness: 0.5, color: LG.setts, pattern: SURF.setts, ...t }),
    DR([p, 0.93, -15.2], [p, 3.93, -8.4], 0.4, brick({ tag: 'bridge-parapet', thickness: 4.1, perch: true, noNav: true, ...t })),
    DR([-p, 0.93, -15.2], [-p, 3.93, -8.4], 0.4, brick({ tag: 'bridge-parapet', thickness: 4.1, perch: true, noNav: true, ...t })),
    D(bw, q, -8.4, -7, 0, 3.93, brick({ tag: 'bridge-parapet', perch: true, noNav: true, noPaint: [nV], ...t })),
    D(-q, -bw, -8.4, -7, 0, 3.93, brick({ tag: 'bridge-parapet', perch: true, noNav: true, noPaint: [nV], ...t })),
    DR([p, 3.93, -7], [p, 4.23, 0], 0.4, brick({ tag: 'bridge-parapet', thin: true, thickness: 1.2, perch: true, noNav: true, ...t })),
    DR([-p, 3.93, -7], [-p, 4.23, 0], 0.4, brick({ tag: 'bridge-parapet', thin: true, thickness: 1.2, perch: true, noNav: true, ...t })),
  ];
}
// one of the narrowboats across the pound (Alpha's half; the mirror turns the other pair across on Bravo's side of the
// bridge): hull, cabin / hold (the walk), a boarding plank from each quay (0.3 m onto the coping) to the roof's end.
// Where the pair lie breasted the roofs and planks meet (no slot between them: the walk is one 4 m deck — a slot drops a
// row of nav nodes and bots zig-zag across). Hull, cabin and plank sides are never inked (boat walls); roofs + planks are.
function xboat(b, i) {
  const t = { onlyIn: 'tower' }, s1 = b.s0 + XBOAT.beam, [h0, h1] = xboatT(b), tc = (h0 + h1) / 2;
  const c0 = tc - XBOAT.cab, c1 = tc + XBOAT.cab, sides = [nU, neg(nU), nV, neg(nV)], q = HW + 0.3;
  const seam = (XBOATS[0].s0 + XBOAT.beam + XBOATS[1].s0) / 2, r0 = i ? seam : b.s0 + 0.1, r1 = i ? s1 - 0.1 : seam;
  const p0 = i ? seam : b.s0, p1 = i ? s1 : seam;
  const plank = { tag: 'xboat-plank', color: LG.timber, pattern: PATTERN.planks, noPaint: sides, ...t };
  return [
    D(b.s0, s1, h0, h1, -2.6, -0.7, { tag: 'xboat-hull', color: LG.hull, pattern: PATTERN.hullpaint, noPaint: sides, ...t }),
    b.kind === 'cabin'
      ? D(r0, r1, c0, c1, -0.7, 0.25, { tag: 'xboat-cabin', color: '#2f4a3c', pattern: PATTERN.hullpaint, mural: [{ n: neg(nU), id: 4 }], noPaint: sides, ...t })
      : D(r0, r1, c0, c1, -0.7, 0.25, { tag: 'xboat-hold', color: '#2c3a31', pattern: PATTERN.rubber, noPaint: sides, ...t }),
    D(p0, p1, -q, c0, 0.15, 0.25, plank),
    D(p0, p1, c1, q, 0.15, 0.25, plank),
  ];
}

// ================= Alpha's base, as drawn before the stretch (base() moves it all out by LS.d)
const BASE = [
  // the back yard up to the cut (its strip -36 … -32.2 was the south end of the setts columns and the side yards)
  yard(-12, 22, -45.4, LS.cut),
  // the SW notch's steps along the chamfer, the raised flagged apron hiding their stepped edge, the chamfer wall
  yard(-23, -12, -33, -31), yard(-21, -12, -35, -33), yard(-20, -12, -36, -35),
  D(-39.6, -38.1, -11.3, -1.41, -0.6, 0.15, { tag: 'apron', color: LG.quay, pattern: PATTERN.pavers }),
  D(-40.2, -39.6, -11.6, -1.1, 0, 4.45, wall({ tag: 'boundary-chamfer' })),
  // the spawn: the loading stage in front of LOCKGATE WHARF (x -5 … 13)
  B(-12, 22, 0, 4.6, -46, -45.4, wall({ tag: 'warehouse-front' })),
  B(-5, 13, 0, 2.2, -45.4, -38.4, brick({ tag: 'spawn-stage' })),
  B(-5, 13, 2.2, 2.4, -45.4, -38.4, { tag: 'spawn', color: LG.spawn, pattern: PATTERN.spawn }),
  B(-5, 0.8, 2.4, 3.15, -39.0, -38.4, wall({ tag: 'stage-parapet' })),
  B(7.2, 13, 2.4, 3.15, -39.0, -38.4, wall({ tag: 'stage-parapet' })),
  R([4, 0, -32.4], [4, 2.4, -38.4], 6, { tag: 'grand-stair', color: LG.stone, pattern: PATTERN.stonestep }),
  R([-11, 0, -43.55], [-5, 2.4, -43.55], 3.7, { tag: 'west-stair', color: LG.stone, pattern: PATTERN.stonestep }),
  R([21, 0, -42.05], [13, 2.4, -42.05], 6.7, { tag: 'cart-ramp', color: LG.setts, pattern: SURF.hoofsteps }),
  // the back yard's side walls, the notch wall
  B(-12.6, -12, 0, 4.6, -45.4, -36, wall({ tag: 'boundary' })),
  B(-20, -12.6, 0, 4.6, -36.6, -36, wall({ tag: 'boundary', mural: [{ n: [0, 0, 1], id: 6 }] })),
];

// ================= THE DRY DOCK (the slice: z LS.cut - LS.d … LS.cut = -54.2 … -32.2 on Alpha's half, new land)
// dock: west wall face x0 → head x1, top edges zS / zN, the gate line gx (mouth ±mouth), floor / altar ledge heights
const DK = { x0: -27, x1: -6, zS: -47, zN: -39, gx: -26.4, mouth: 2.75, floor: -1.9, altar: -0.95, aw: 0.6 };
export const DOCK_Z = (DK.zS + DK.zN) / 2;                 // -43: the dock's centre line
// the boat up on keel blocks in the dock (hull block x0 … x1, gunwale 0.4, the hold 0.95 above: top 1.35) — props.js
export const DOCKBOAT = { x0: -23.2, x1: -16.7, W: 2.1, gun: 0.4, keel: -1.5, cab: 2.3 };
// the crane staging over the dock (deck 1.3) and the boatbuilder's shed + its loading bay (1.3)
export const STAGING = { x0: -15, x1: -10, z0: -48.5, z1: -37.5, top: 1.3 };
export const SHED = { x0: 5, x1: 14, z0: -47.5, z1: -38.5, top: 4.4, bay: 1.5 };
const dockBrick = (o) => ({ color: LG.lockside, pattern: PATTERN.brick, ...o });
const timber = (o) => ({ color: LG.timber, pattern: PATTERN.planks, ...o });
const DOCK = [
  // ---- the dock: brick side walls from -3 (they mask the sea, like the lock chambers), an altar ledge along each side,
  // the floor; the head wall at the east end with a broad flight of head steps down into it
  B(DK.x0, DK.x1, -3, 0, DK.zN, DK.zN + 1, dockBrick({ tag: 'dock-wall' })),
  B(DK.x0, DK.x1, -3, 0, DK.zS - 1, DK.zS, dockBrick({ tag: 'dock-wall' })),
  B(DK.x1, DK.x1 + 1, -3, 0, DK.zS - 1, DK.zN + 1, dockBrick({ tag: 'dock-head' })),
  B(DK.gx + 0.6, DK.x1, -3, DK.altar, DK.zN - DK.aw, DK.zN, dockBrick({ tag: 'dock-altar' })),
  B(DK.gx + 0.6, DK.x1, -3, DK.altar, DK.zS, DK.zS + DK.aw, dockBrick({ tag: 'dock-altar' })),
  B(DK.gx + 0.6, DK.x1, -3, DK.floor, DK.zS + DK.aw, DK.zN - DK.aw, { tag: 'dock-floor', color: LG.setts, pattern: PATTERN.concrete }),
  // (the head steps fill the floor's width: no pit beside a flight for a bot to be pinned in)
  R([DK.x1 - 4.5, DK.floor, DOCK_Z], [DK.x1, 0, DOCK_Z], DK.zN - DK.zS - 2 * DK.aw, { tag: 'dock-steps', color: LG.stone, pattern: PATTERN.stonestep }),
  // the mouth: brick cheeks narrow it to the gates (5.5 m), whose walkway lies flush with the docksides; the dock arm
  // runs off west under an arch in the boundary wall (its water is the props' lockgate_pound, held back by the gates)
  B(DK.x0, DK.gx + 0.6, -3, 0, DOCK_Z + DK.mouth, DK.zN, dockBrick({ tag: 'dock-mouth' })),
  B(DK.x0, DK.gx + 0.6, -3, 0, DK.zS, DOCK_Z - DK.mouth, dockBrick({ tag: 'dock-mouth' })),
  B(DK.x0, DK.gx + 0.6, -0.25, 0, DOCK_Z - DK.mouth, DOCK_Z + DK.mouth, timber({ tag: 'dock-gate-walk' })),
  B(-28, -27, 0, 4.6, -51, DOCK_Z - DK.mouth, wall({ tag: 'boundary' })),
  B(-28, -27, 2.9, 4.6, DOCK_Z - DK.mouth, DOCK_Z + DK.mouth, wall({ tag: 'dock-arch' })),
  B(-28, -27, 0, 4.6, DOCK_Z + DK.mouth, -29, wall({ tag: 'boundary' })),
  // the boat on its keel blocks: black hull block + the sheeted hold, both off-limits (slide off)
  B(DOCKBOAT.x0, DOCKBOAT.x1, DOCKBOAT.keel, DOCKBOAT.gun, DOCK_Z - DOCKBOAT.W / 2, DOCK_Z + DOCKBOAT.W / 2, { tag: 'dockboat-hull', color: LG.hull, pattern: PATTERN.hullpaint, roof: true, noPaint: [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] }),
  O((DOCKBOAT.x0 + DOCKBOAT.x1) / 2, DOCK_Z, DOCKBOAT.cab * 2, DOCKBOAT.W - 0.2, DOCKBOAT.gun, DOCKBOAT.gun + 0.95, 0, { tag: 'dockboat-hold', color: '#2c3a31', pattern: PATTERN.rubber, roof: true, noPaint: [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] }),
  // ---- the crane staging: a timber deck (1.3) spanning the dock on trestles standing on the altars, a landing on each
  // dockside, a flight down from each (north: west of the yard's tower lane; south: toward the back road)
  B(STAGING.x0, STAGING.x1, 0, STAGING.top, DK.zN, STAGING.z1, timber({ tag: 'staging' })),
  B(STAGING.x0, STAGING.x1, STAGING.top - 0.3, STAGING.top, DK.zS, DK.zN, timber({ tag: 'staging' })),
  B(STAGING.x0, STAGING.x1, 0, STAGING.top, STAGING.z0, DK.zS, timber({ tag: 'staging' })),
  R([-13.5, 0, STAGING.z1 + 3.2], [-13.5, STAGING.top, STAGING.z1], 3, timber({ tag: 'staging-stair', pattern: PATTERN.rampboard })),
  R([-11.5, 0, STAGING.z0 - 3.2], [-11.5, STAGING.top, STAGING.z0], 3, timber({ tag: 'staging-stair', pattern: PATTERN.rampboard })),
  // ---- the ground of the slice: the dock road (north), the boatyard east of the dock head, the back road (south,
  // stepped along the moved chamfer), the east yard wall carried on
  yard(-27, 22, -38, LS.cut),
  yard(DK.x1 + 1, 22, DK.zS - 1, -38),
  yard(-27, 22, -51, DK.zS - 1), yard(-25, 22, -53, -51), yard(-12, 22, LS.cut - LS.d, -53),
  B(22, 22.6, 0, 4.6, -45.4 - LS.d, -45.4, wall({ tag: 'boundary' })),
  // ---- the boatbuilder's shed (weatherboarded, roof off-limits) and its loading bay on the dock side, two flights down
  B(SHED.x0, SHED.x1, 0, SHED.top, SHED.z0, SHED.z1, { tag: 'boatshed', color: '#6a5646', pattern: PATTERN.weatherboard, roof: true }),
  B(SHED.bay, SHED.x0, 0, 1.3, SHED.z0 + 0.5, SHED.z1 - 0.5, timber({ tag: 'loading-bay' })),
  R([SHED.bay - 3.1, 0, -40.6], [SHED.bay, 1.3, -40.6], 2.2, { tag: 'bay-steps', color: LG.stone, pattern: PATTERN.stonestep }),
  R([SHED.bay - 3.1, 0, -45.4], [SHED.bay, 1.3, -45.4], 2.2, { tag: 'bay-steps', color: LG.stone, pattern: PATTERN.stonestep }),
];

const LOCKGATE = {
  id: 'lockgate',
  water: 'marina',
  bounds: { minX: -28, maxX: 28, minZ: -46 - LS.d, maxZ: 46 + LS.d },
  spawnPads: [[4, 2.4, -41.9 - LS.d], [-4, 2.4, 41.9 + LS.d]],
  spawnBarrier: 4.2,
  // match intro: high over the humpback bridge looking down the diagonal pound, then back down to the loading stage
  intro: { from: [-9, 12, 9], lookFrom: [2, 3, -2], toBack: 3.0 },
  // stage-select picture: from over lock W's south side, across the humpback bridge + moored boats to ANCHOR MILLS
  art: { from: [-24, 14, -12], look: [8, 0, 4], fov: 66 },
  single: [],
  half: [
    // ================= canal: towpath quay, lock E (both sides; lock W is its twin), basins, drained chamber, boats
    D(-16.4, 17.85, -HW - TOW, -HW, -3, 0.15, { tag: 'towpath', color: LG.lockside, pattern: PATTERN.brick, notIn: 'tower' }),
    // (Tower Command: the towpath stops 2.3 m short at the office end, so the tower's street past the office runs level
    // instead of grazing the quay's kerb corner; a flagged landing, a step up from the towpath, finishes it by the water,
    // and a scrap of setts fills the stepped edge that the shorter quay uncovers)
    D(-14.1, 17.85, -HW - TOW, -HW, -3, 0.15, { tag: 'towpath', color: LG.lockside, pattern: PATTERN.brick, onlyIn: 'tower' }),
    D(-16.4, -14.1, -6.5, -HW, -3, 0.23, { tag: 'towpath-landing', color: LG.quay, pattern: PATTERN.pavers, onlyIn: 'tower' }),
    B(-5.85, -4.9, -0.6, 0, -15, -14.55, { tag: 'yard', color: LG.setts, pattern: SURF.setts, onlyIn: 'tower' }),
    B(15.5, 28, -3, 1.3, -2, 9.25, { tag: 'wharf-e', color: LG.lockside, pattern: PATTERN.brick }),
    B(13, 15.5, -3, 1.3, -2, 6.25, { tag: 'wharf-e', color: LG.lockside, pattern: PATTERN.brick }),
    // stepped masonry filling the towpath's dead end under the lower gate's balance beam (no pocket to get stuck in)
    B(14, 15.5, -3, 1.3, 6.25, 7.25, { tag: 'wharf-e', color: LG.lockside, pattern: PATTERN.brick }),
    // (runs on flush with the wharf's edge at the lower gate: a 0.5 m notch of water was left at its corner, and the route
    // onto the wharf cut straight across it)
    B(15, 15.5, -3, 1.3, 7.25, 9.25, { tag: 'wharf-e', color: LG.lockside, pattern: PATTERN.brick }),
    B(15.5, 28, -3, 1.3, 14.75, 21, { tag: 'lockside-n', color: LG.lockside, pattern: PATTERN.brick }),
    B(8, 15.5, -3, 0, 14.75, 21, { tag: 'basin-quay', color: LG.setts, pattern: SURF.setts }),
    B(16.5, 24.5, -3, -1.9, 9.25, 14.75, { tag: 'chamber-floor', color: LG.setts, pattern: PATTERN.concrete }),
    D(3.6, 11.4, -4.72, -2.62, -2.6, -0.7, { tag: 'boat-a-hull', color: LG.hull, pattern: PATTERN.hullpaint, notIn: 'tower' }),
    D(3.3, 11.1, -2.57, -0.47, -2.6, -0.7, { tag: 'boat-b-hull', color: LG.hull, pattern: PATTERN.hullpaint, notIn: 'tower' }),
    D(4.6, 10.4, -4.62, -2.72, -0.7, 0.25, { tag: 'boat-a-hold', color: '#2c3a31', pattern: PATTERN.rubber, notIn: 'tower' }),
    D(4.3, 10.1, -2.47, -0.57, -0.7, 0.25, { tag: 'boat-b-cabin', color: '#2f4a3c', pattern: PATTERN.hullpaint, mural: [{ n: nV, id: 4 }], notIn: 'tower' }),
    // (Tower Command: the same two boats turned across the pound as a crossing beside the bridge — XBOATS)
    ...XBOATS.flatMap(xboat),
    // gate walkways (lower gates x 16.5, upper gates x 24.5); one broad maintenance stair fills the drained chamber from the
    // lower gate up to the upper gates (two scaffold handrails split it into three flights). Solid: a narrow pit or the
    // wedge under a free-spanning flight is somewhere bots get pinned.
    B(15.9, 17.1, 1.05, 1.3, 9.25, 14.75, { tag: 'gate-walk-lower', color: LG.timber, pattern: PATTERN.planks }),
    B(23.9, 25.1, 1.05, 1.3, 9.25, 14.75, { tag: 'gate-walk-upper', color: LG.timber, pattern: PATTERN.planks }),
    R([16.65, -1.9, 12], [23.9, 1.3, 12], 5.5, { tag: 'chamber-stair', color: '#6d7780', pattern: PATTERN.treads }),
    // steps: basin quay → lock side N (Bravo), east yard → wharf platform (Alpha)
    R([12, 0, 17.6], [15.5, 1.3, 17.6], 2.4, { tag: 'lock-steps', color: LG.stone, pattern: PATTERN.stonestep }),

    // ================= humpback bridge (turned 45°: its axis runs along v, Alpha's approach from the south-east)
    D(-2.2, 2.2, -8.4, -7, 0, 3.0, { tag: 'bridge-abutment', color: LG.setts, pattern: SURF.setts, noPaint: [nV], notIn: 'tower' }),
    DR([0, 0, -15.2], [0, 3.0, -8.4], 4.4, { tag: 'bridge-ramp', color: LG.setts, pattern: SURF.hoofsteps, notIn: 'tower' }),
    DR([0, 3.0, -7], [0, 3.3, 0], 4.4, { tag: 'bridge-crest', thin: true, thickness: 0.5, color: LG.setts, pattern: SURF.setts, notIn: 'tower' }),
    // parapets: the outer brick walls are inkable (swim up them from the street onto the bridge) and reach the ground
    // along the approaches; the tops are walkable, never-inked perches (+8 cm: feet in the stone coping, the level top
    // hidden inside it) that routes never run along — nobody slides off them any more
    DR([2.4, 0.93, -15.2], [2.4, 3.93, -8.4], 0.4, brick({ tag: 'bridge-parapet', thickness: 4.1, perch: true, noNav: true, notIn: 'tower' })),
    DR([-2.4, 0.93, -15.2], [-2.4, 3.93, -8.4], 0.4, brick({ tag: 'bridge-parapet', thickness: 4.1, perch: true, noNav: true, notIn: 'tower' })),
    D(2.2, 2.6, -8.4, -7, 0, 3.93, brick({ tag: 'bridge-parapet', perch: true, noNav: true, noPaint: [nV], notIn: 'tower' })),
    D(-2.6, -2.2, -8.4, -7, 0, 3.93, brick({ tag: 'bridge-parapet', perch: true, noNav: true, noPaint: [nV], notIn: 'tower' })),
    DR([2.4, 3.93, -7], [2.4, 4.23, 0], 0.4, brick({ tag: 'bridge-parapet', thin: true, thickness: 1.2, perch: true, noNav: true, notIn: 'tower' })),
    DR([-2.4, 3.93, -7], [-2.4, 4.23, 0], 0.4, brick({ tag: 'bridge-parapet', thin: true, thickness: 1.2, perch: true, noNav: true, notIn: 'tower' })),
    // Tower Command: the same bridge built wider (deck ±BRIDGE_T instead of ±2.2) — the tower rides its crown, with room
    // to fight round it on both sides (the user's "WIDER"); the props' lockgate_bridge takes the same half-width
    ...wideBridge(BRIDGE_T),

    // ================= Alpha's ground on the mid side of the cut: centre columns under the towpath, the west land (the
    // cottage garden, the old chamfer corner behind it now yard up to the dock), the east yard
    ...cols,
    yard(-12, -8, LS.cut, -21),
    yard(-27, -12, -29, -21), yard(-27, -12, LS.cut, -29),
    yard(14, 22, LS.cut, -17),
    // the west wall, the SE step (the east yard's wall runs on down the slice: DOCK)
    B(-28, -27, 0, 4.6, -29, -24, wall({ tag: 'boundary' })),
    B(22, 22.6, 0, 4.6, -45.4, -17, wall({ tag: 'boundary', mural: [{ n: [-1, 0, 0], id: 7 }] })),

    // ================= the base (spawn, back yard, SW notch), moved out by LS.d — and the dry dock slice before it
    ...BASE.map(base),
    ...DOCK,

    // ================= west: lock-keeper's cottage + wash-house outshut, horse ramp up to lock W's south side
    B(-21, -14.5, 0, 5.2, -32, -25.5, { tag: 'cottage', color: LG.render, pattern: PATTERN.render, roof: true }),
    B(-14.5, -12.5, 0, 2.45, -31.5, -27, brick({ tag: 'cottage-outshut' })),
    B(-14.5, -12.5, 2.45, 2.6, -31.5, -27, { tag: 'outshut-roof', color: LG.leads, pattern: PATTERN.asphalt }),
    R([-24.5, 0, -27.5], [-24.5, 1.3, -21], 3, { tag: 'horse-ramp', color: LG.setts, pattern: SURF.hoofsteps }),

    // ================= centre-west: canal company office, roof terrace (2.6) reached by an iron stair
    B(-8, -1.5, 0, 2.45, -26, -18, brick({ tag: 'office', notIn: 'tower' })),
    B(-8, -1.5, 2.45, 2.6, -26, -18, { tag: 'office-roof', color: LG.leads, pattern: PATTERN.asphalt, notIn: 'tower' }),
    B(-8, -1.5, 2.6, 3.05, -18.3, -18, wall({ tag: 'office-parapet', notIn: 'tower' })),
    B(-1.8, -1.5, 2.6, 3.05, -26, -18.3, wall({ tag: 'office-parapet', notIn: 'tower' })),
    // (Tower Command: a metre shallower on the canal side, its front in line with the stables' at z -19, so the tower
    // passes along the street in front of both instead of riding up over the office roof)
    B(-8, -1.5, 0, 2.45, -26, -19, brick({ tag: 'office', onlyIn: 'tower' })),
    B(-8, -1.5, 2.45, 2.6, -26, -19, { tag: 'office-roof', color: LG.leads, pattern: PATTERN.asphalt, onlyIn: 'tower' }),
    B(-8, -1.5, 2.6, 3.05, -19.3, -19, wall({ tag: 'office-parapet', onlyIn: 'tower' })),
    B(-1.8, -1.5, 2.6, 3.05, -26, -19.3, wall({ tag: 'office-parapet', onlyIn: 'tower' })),
    R([-7, 0, -32], [-7, 2.6, -26], 2, { tag: 'office-stair', color: LG.stone, pattern: PATTERN.stonestep }),

    // ================= centre-east: stables + hay loft (the bridge street bends round it)
    B(5.5, 12.5, 0, 3.6, -27, -19, brick({ tag: 'stables', roof: true, notIn: 'tower' })),
    // Tower Command: the stables' roof is a flat leaded loft deck, inkable and walkable (the user's "INKABLE ROOF", the
    // one roof in play: it overlooks the first checkpoint), reached by a cobbled horse ramp up the far side that rises
    // toward the bridge street end (the user's "RAMP"; 23°) onto a brick landing flush with the roof
    B(5.5, 12.5, 0, 3.45, -27, -19, brick({ tag: 'stables', onlyIn: 'tower' })),
    B(5.5, 12.5, 3.45, 3.6, -27, -19, { tag: 'loft-roof', color: LG.leads, pattern: PATTERN.asphalt, onlyIn: 'tower' }),
    R([14.9, 0, -28.25], [6.5, 3.6, -28.25], 2.5, { tag: 'loft-ramp', color: LG.setts, pattern: SURF.hoofsteps, thickness: 4.2, onlyIn: 'tower' }),
    B(5.5, 6.5, 0, 3.6, -29.5, -27, { tag: 'loft-landing', color: LG.setts, pattern: SURF.setts, onlyIn: 'tower' }),

    // ================= east: loading bank (1.3) → lock-E wharf platform; transit shed (roof off-limits)
    B(14, 18, 0, 1.3, -17, -2, { tag: 'loading-bank', color: LG.setts, pattern: SURF.setts }),
    B(18, 28, 0, 4.8, -17, -2, brick({ tag: 'shed', roof: true, mural: [{ n: [0, 0, 1], id: 5 }] })),
    R([16, 0, -22], [16, 1.3, -17], 3, { tag: 'bank-steps', color: LG.stone, pattern: PATTERN.stonestep }),

    // ================= ANCHOR MILLS over the upper pound (east; the west mill is its twin): arena face x 27
    B(27, 28, 1.3, 9, -2, 9.25, wall({ tag: 'mill', noPaint: [[-1, 0, 0], [0, 0, -1]] })),
    B(27, 28, 4.2, 9, 9.25, 14.75, wall({ tag: 'mill-arch', noPaint: [[-1, 0, 0], [0, -1, 0]] })),
    B(27, 28, 1.3, 9, 14.75, 21, wall({ tag: 'mill', noPaint: [[-1, 0, 0]] })),
    B(27, 28, 0, 9, 21, 24, wall({ tag: 'mill', noPaint: [[-1, 0, 0], [0, 0, 1]] })),
  ],
  decor: { lamps: [], palms: [], flags: [[-4, 2.4, -44.8 - LS.d], [12, 2.4, -44.8 - LS.d]] },
};

export const LAYOUT = LOCKGATE;
