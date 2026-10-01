// Calamari County — stage layout (src/world/stages/calamari/). The stage owns every file in this folder:
//   layout.js    level geometry, zones, tower track, env (this file)   props.js    prop pack + placements
//   surfaces.js  stage surface materials (texlib)                       murals.js   stage decals / signage
//   backdrop.js  the far scenery (snowy hills, the coves, the headlands, the village beyond)
import { PATTERN, B, R, O } from '../../mapkit.js';
import { buildBackdrop } from './backdrop.js';
import { SURF } from './surfaces.js';
import { MURAL } from './murals.js';
import { STRETCH as ST, moveOut } from './stretch.js';

// ------------------------------------------------------------------------------------------------------------
// Calamari County — the Squid Sisters' home village, at the far end of the line out of Inkopolis: a snowbound fishing
// village on a neck of land between two coves, the railway running through the middle of it between two headland
// tunnels. Winter: snow on every roof, rime on the quays, steam off the bath house.
// Alpha at −Z (the half list), Bravo is the 180° twin. Plan (Alpha's half; Alpha looks toward +Z, so its left is +X):
//   • mid, the RAILWAY CUT (|z| < 6.6, full width): Calamari County Station's open island platform (1.0, 32 m long) between
//     the two tracks (trackbeds at 0); two broad open overpasses (the station's kosen-kyō, 6 m wide at 4.3: the high
//     ground over mid) spanning the whole cut from side platform to side platform at x ±(2.4 … 8.4), each with wide
//     stairs down its outer edge to both side platforms and the island; the county railcars (stage movers, 3.4 m of cover,
//     roofs off-limits) shuttling between the halves of the station on a timetable (MOVERS below); a level crossing at
//     each end (|x| 18.5 … 25.5) and the tunnel portals capping the cut (|x| 31.5)
//   • station side (z −12.2 … −6.6): the side platform (1.0, 5.6 m deep) with the little station building behind its
//     middle, ramps at both ends, two flights of steps up from the forecourt
//   • right lane (−X) HILLSIDE: the crossing road (0, 7 m) up past the bath house, the open terrace T1
//     (1.3, 6–7 m, hop-up from the road) beside it, T2 (2.6) by the co-op overlooking the back street with the
//     Cuttlefish cottage at its west end, houses climbing the hill behind
//   • mid lane: the station forecourt and the village square as one open space (22 × 20 m: post box, bus shelter,
//     the pine, snowbanks, the side zone) → the co-op stair
//   • left lane (+X) HARBOUR: the basin quay (8–10 m) along the fishing-boat basin that cuts into the village (its edge
//     at an angle, a slipway), the north quay apron (20 × 6 m) with the breakwater, the co-op's quay behind
//   • spawn: the open upper deck of the Fishermen's Co-op warehouse (3.4): grand stair to the square, a timber ramp
//     down to the co-op quay, drops onto T2 (0.8) and the loading dock (1.0)
// The village grew: buildings of different sizes, several turned a few degrees off the street grid, 5 m cross streets
// and a 5 m back street between them; the outline follows the coast (the basin, the breakwater, the stepped co-op quay) and the
// hill (terraces stepping in and out, the hill houses cutting the corner behind the spawn).
// Heights: 0 streets / quays / trackbeds · −0.1 the basin quay (a kerb down from the street) · 1.0 platforms, loading
// dock · 1.3 T1 · 2.6 T2 · 3.4 spawn, railcar tops (off-limits) · 4.3 overpass decks.
//
// THE LONG STAGES STRETCH (2026-09-30, stretch.js): every half 20.5 m longer. The base side (the co-op, T2 and the
// cottage, the dock, the net store, the co-op quay, the hill houses) moves out by ST.d (drawn with P's original numbers
// and moved as a unit: BASE below); the gap between the back street and the base is new land, the VILLAGE HIGH STREET
// (SLICE below, numbers in Q): Alpha's side, from the hill to the harbour —
//   • the allotments: T1 carried on (1.3, the lower beds), stone steps up to the upper allotments (2.6, a potting shed)
//     running into T2's west end — the hillside flank
//   • the hillside road carried on (0) to the co-op forecourt
//   • the onsen inn (Ikayu Inn: the bath house's inn across the back street) and its garden, the onsen lane between them
//   • the High Street (setts) between the inn and the fire-watch terrace
//   • THE FIRE-WATCH TERRACE (1.3, 10 × 10 m, dry-stone walls): the village's hanshō tower (the steel fire lookout with
//     its alarm bell) on a raised stone terrace in the middle of the slice, the fire brigade's pump cart, buckets, the
//     "mind the fire" stone — the slice's strategic point (stairs from the back street, down to the High Street and to
//     the fire lane; a hop-up from anywhere)
//   • the fire lane, the post office (its sorting dock at 1.0, the post van), the basin quay carried on with the fish
//     market's apron and auction shed jutting into the basin
//   • the co-op forecourt in front of the base (the apron: the grand stair's foot, T2's welcome mural)
// ------------------------------------------------------------------------------------------------------------

// an oriented box with one long side along A → B (world x, z), reaching `depth` to the left (side 1) or right (−1) of it
function edgeBox(A, Bp, depth, y0, y1, side, o) {
  const dx = Bp[0] - A[0], dz = Bp[1] - A[1], L = Math.hypot(dx, dz), a = Math.atan2(dx, dz);
  const lx = [dz / L, -dx / L];   // the box's local x axis (level.js obox: (cos a, −sin a))
  const cx = (A[0] + Bp[0]) / 2 + side * lx[0] * depth / 2, cz = (A[1] + Bp[1]) / 2 + side * lx[1] * depth / 2;
  return O(+cx.toFixed(4), +cz.toFixed(4), depth, L, y0, y1, +((a * 180) / Math.PI).toFixed(4), o);
}
// a box of footprint w × d centred at (cx, cz), turned deg (building blocks off the street grid)
const turned = (cx, cz, w, d, y0, y1, deg, o) => O(cx, cz, w, d, y0, y1, deg, o);

// ---- the plan (shared with props.js: dressing is placed from the same numbers)
// (widened 2026-09-29 after the user's play test: "a fairly cramped map … bit wider in terms of flanks and open spaces":
// the stage grew from ±28 to ±34 in x; the hillside road 4.5 → 7 m and T1 3.2 → 6–7 m with no house on it; the harbour
// quay 4–6 → 8–10 m; the square + forecourt one open space 22 × 20 m; the cross and back streets 3–4 → 5 m)
export const P = {
  // railway cut
  track: [3.4, 6.6],            // a track band |z| 3.4 … 6.6 (Alpha's at −z); the island platform |z| < 3.4
  cutX: 31.5,                   // the trackbed runs |x| < 31.5, the tunnel portals beyond
  island: { x: 16.2, z: 3.4, y: 1.0 },
  side: { x0: -16.2, x1: 16.2, z0: -12.2, z1: -6.6, y: 1.0 },
  strip: -11,                   // the station strip (z −11 … −6.6) runs the full width at street level
  crossing: [-25.5, -18.5],     // Alpha's level crossing + hillside road (x); Bravo's is the mirror (x 18.5 … 25.5)
  // Alpha's train on Alpha's track (a stage mover, src/game/movers.js): two 9 m cars coupled (18.3 m), it shuttles
  // between the east half of the corridor (centre x 14.35: x 5.2 … 23.5, over the east level crossing) and the west half
  // (x −23.5 … −5.2) — walling off that whole half of its track, never parked on the centre (|x| < 5); Bravo's does the
  // mirror on Bravo's track
  car: { L: 9, gap: 0.3, W: 2.9, h: 3.4, floor: 1.05, stop: 14.35 },
  // Alpha's overpass (the +x one; the −x one is its mirror): an open deck over the whole cut, side platform to side
  // platform, 6 m wide at 4.3 (3.9 under it: the trains and the tower pass beneath), a 3.6 m stair down its outer edge to
  // each side platform (feet at x 16), slim piers on the platforms. No stair to the island: the island is reached from
  // the deck by the ONE-WAY DROPS — openings in the railings over the island (drops) — so the team whose side
  // platform is walled off by a parked train climbs its own stair and drops over the train onto the island, and
  // nobody climbs back up from the island. Tower Command: the deck at 6.3 (towerY; 5.9 under it: riders + their
  // camera stay clear), its stairs real stepped stairs (18 × 0.29 m risers) on the same footprint.
  overpass: { x0: 2.4, x1: 8.4, y: 4.3, t: 0.4, z: 12.2, foot: 16.0, stairs: [[-10.2, 3.6], [10.2, 3.6]], drops: [-2.6, 2.6], piers: [2.95, 7.85], pierZ: [-10.4, 0, 10.4], towerY: 6.3, towerSteps: 18 },
  // village (buildings: [cx, cz, w (x), d (z), deg, height])
  station: [-3.5, 3.5, -16.2, -12.2],             // station building (x0, x1, z0, z1), behind the side platform's middle
  steps: [-6, 6],                                 // the steps up from the forecourt onto the side platform (x centres)
  bath: [-14.75, -22.75, 6.5, 5.5, 4, 3.6],       // bath house
  store: [13.3, -22.75, 4.8, 5.5, -5, 3.4],       // general store (front on the square) / fish shop (back on the quay)
  square: [-11, 11, -27, -15],                    // the square's setts column (x0, x1) and its open middle (z0, z1)
  backSt: [-30.5, -25.5],                         // the back street (z) from the hillside road to the quay
  T1: [[-32.5, -25.5, -18, -11], [-31.5, -25.5, -28.5, -18]],                          // T1 (1.3) pieces (x0, x1, z0, z1)
  // T2 (2.6): its front run (the welcome mural), the west end, the east run by the spawn deck, the landing behind its
  // stair (a notch in the front: the stair from the back street up onto T2 — one of the base's three ways in)
  T2: [[-25.5, -13.2, -37.2, -30.5], [-31.5, -25.5, -37.2, -28.5], [-9.8, -2.2, -37.2, -30.5], [-13.2, -9.8, -37.2, -36.4]],
  t2stair: { x: -11.5, w: 3.4, z0: -30.5, z1: -36.4 },
  y1: 1.3, y2: 2.6,
  cottage: [-31.5, -25.5, -37.2, -33.2],          // the Cuttlefish cottage at T2's west end, above the village
  // retaining walls along the hill side (x0, x1, z0, z1, top, dressed?): the station corner, behind T1 (a jog), behind
  // T2's end (the last one behind the cottage: no face dressing)
  hillWalls: [[-33.5, -31.5, -11, -8.5, 3.0], [-33.5, -32.5, -18, -11, 3.8], [-33.5, -31.5, -28.5, -18, 3.8], [-33.5, -31.5, -33.2, -28.5, 5.0], [-33.5, -31.5, -37.2, -33.2, 5.0, false]],
  // Fishermen's Co-op
  deck: { x0: -9, x1: 9, z0: -45.5, z1: -37.2, y: 3.4 },
  pad: [0, 3.4, -41.3],
  dock: { x0: 2.2, x1: 9, z0: -37.2, z1: -30.5, y: 1.0 },
  // from the loading dock up onto the spawn deck's east front, flush against the net store (no slot beside it)
  dockStair: { x: 7.7, w: 2.6, z0: -31.8 },
  netStore: [9, 12, -37.2, -30.5],
  // harbour (Alpha's cove side): the basin quay's water edge runs A → B at an angle; the slipway cuts it
  kerb: 16,                                       // the village street ends at x 16; the basin quay is 0.1 lower
  basinEdge: [[24.5, -16.4], [22, -38.6]],
  slip: { t0: 0.44, t1: 0.575 },                  // the slipway's gap along the basin edge (fractions of A → B)
  northQuay: [11, 31.5, -17, -11],
  breakwater: [[28.6, -16.6], [32.9, -21.6]],
  southQuay: [[12, 24.6, -45.5, -38], [11, 18, -47, -45.5]],
};
// hillside road centre (Alpha) and the back street centre: the tower's corners
P.roadX = (P.crossing[0] + P.crossing[1]) / 2;
P.backZ = (P.backSt[0] + P.backSt[1]) / 2 + 0.1;

// ---- the village high street: the new land between the back street (z −30.5) and the moved base (its front at
// z −51: T2's wall, the dock), world numbers (Alpha's half; shared with props.js)
const BZ = P.backSt[0] - ST.d;                    // −51: the base's front after the move
export const Q = {
  z0: P.backSt[0], z1: BZ,
  road: [P.crossing[0], P.crossing[1]],           // the hillside road carried on (x −25.5 … −18.5)
  T1: [-31.5, -25.5, -38.5, P.T1[1][2]],          // the lower allotments (1.3): T1 carried on from its end at −28.5
  up: [-31.5, -25.5, P.T2[1][3] - ST.d, -38.5],  // the upper allotments (2.6), running into T2's west end (moved to −57.7 … −49)
  upStair: { x: -28.5, w: 2.4, z0: -34.8, z1: -38.5 },           // T1 → the upper allotments (like T1's old steps to T2)
  hillWalls: [[-33.5, -31.5, -38.5, -28.5, 3.8], [-33.5, -31.5, -49, -38.5, 5.0]],
  inn: [-18.5, -11.5, -37, -31],                  // the onsen inn (x0, x1, z0, z1), its front on the back street
  boiler: [-20.4, -18.5, -34.6, -31.2],           // its boiler house jutting into the road (the road jogs round it)
  lane: [-42, -37],                               // the onsen lane between the inn and its garden (z)
  garden: [-18.5, -11.5, -46, -42],               // the inn's garden (0.9: a raised stone bed, the steaming rock pool)
  gardenY: 0.9,
  high: [-11.5, -5],                              // the High Street (x)
  terrace: { x0: -5, x1: 5, z0: -43.5, z1: -33.5, y: 1.3 },    // the fire-watch terrace
  nStair: { x: -2.5, w: 4 },                      // up from the back street (its foot on the back street's edge)
  sStairs: { z: -42.25, w: 2.5, run: 3.5 },       // down its south corners: west into the High Street, east into the fire lane
  firetower: [3.0, -35.5],                        // the hanshō tower on the terrace's north-east corner
  fireLane: [5, 9.5],                             // the fire lane (x) between the terrace and the post office
  po: [9.5, 15.5, -38, -31],                      // the post office (its front on the back street)
  poDock: [10, 15.5, -40.5, -38],                 // its sorting dock (1.0) on the yard side
  market: [19, 26, -50, -42],                     // the fish market's apron jutting into the basin …
  floor: [16, 26, -50, -42], floorY: 0.5,       // … and its auction floor (0.5) across the quay: a step up either end
  chiller: [16.2, 19.0, -47.6, -44.4],            // the chiller room on the auction floor (the quay's line jogs round it)
  notch: [-51.8, -55.4, 3.0],                     // a boat notch cut into the quay edge south of the market (z0, z1, depth)
  forecourt: [BZ, -46],                           // the co-op forecourt (z): the apron in front of the base
  // Tower Command (Alpha's frame; the track itself is drawn on Bravo's half, the mirror): the fire lane's centre, the
  // onsen lane's centre, the forecourt run
  tower: { laneX: 7.25, midZ: -39.5, foreZ: -48 },
};

const K = {
  snow: '#d6dce3', ballast: '#c3c8ce', platform: '#76604d', timber: '#6d5543', stone: '#b7b3ab', setts: '#a9a6a0',
  quay: '#a7a39c', wall: '#e8e2d4', plaster: '#ece6d8', dark: '#4a3a2e', spawn: '#eae6de', train: '#d9d4c4', portal: '#8f8b84',
  cedar: '#5d4636',
};
const snow = (o = {}) => ({ color: K.snow, pattern: SURF.snow, ...o });
const setts = (o = {}) => ({ color: K.setts, pattern: SURF.setts, ...o });
const quay = (o = {}) => ({ color: K.quay, pattern: SURF.setts, ...o });
const timber = (o = {}) => ({ color: K.platform, pattern: SURF.timber, ...o });
const bldg = (c, o = {}) => ({ color: c, pattern: PATTERN.weatherboard, roof: true, ...o });
const stair = (o = {}) => ({ color: K.stone, pattern: PATTERN.stonestep, ...o });
const FL = -1.6;   // ground slabs reach down to the sea (the environment reads their tops as the stage's footprint)

const { island: I, side: S, overpass: OP, deck: DK, dock: DO } = P;
// (free-spanning steel stairs: a 0.35 m flight on its stringers, open underneath — you see and shoot under them; the
// sides are the stringers with handrails on top: not inkable, so nobody plans a climb up them into the rail)
const opStair = ([z, w]) => R([OP.foot, S.y, z], [OP.x1, OP.y, z], w, { tag: 'overpass-stair', color: K.timber, pattern: PATTERN.treads, thin: true, thickness: 0.35, noPaint: [[0, 0, 1], [0, 0, -1]], notIn: 'tower' });
// Tower Command: the same stair to the taller deck as real steps (risers of 0.29 m: walked up like any step)
const opSteps = ([z, w]) => {
  const n = OP.towerSteps, run = OP.foot - OP.x1, rise = OP.towerY - S.y, out = [];
  for (let i = 0; i < n; i++) {
    // (each step a 0.35 m slab on the stringers — open underneath, like the free-spanning stairs)
    const top = +(S.y + ((i + 1) * rise) / n).toFixed(4);
    out.push(B(+(OP.foot - ((i + 1) * run) / n).toFixed(4), +(OP.foot - (i * run) / n).toFixed(4), top - 0.35 < S.y + 0.05 ? S.y - 0.3 : +(top - 0.35).toFixed(4), top, z - w / 2, z + w / 2,
      { tag: 'overpass-step', color: K.timber, pattern: PATTERN.treads, noPaint: [[0, 0, 1], [0, 0, -1]], onlyIn: 'tower' }));
  }
  return out;
};
const bx = (r, y0, y1, o) => B(r[0], r[1], y0, y1, r[2], r[3], o);
const bt = (b, y0, o) => turned(b[0], b[1], b[2], b[3], y0, y0 + b[5], b[4], o);
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

const SINGLE = [
  // ================= the railway cut: snowy ballast the full width, the island platform between the tracks
  B(-P.cutX, P.cutX, FL, 0, -P.track[1], P.track[1], snow({ tag: 'trackbed', color: K.ballast })),
  B(-I.x, I.x, 0, I.y, -I.z, I.z, timber({ tag: 'island' })),
];

// the basin quay (0.1 below the street, tucked under the village, the north quay and the co-op quay): its water edge
// runs at an angle along the basin, broken by the slipway. Stretched: the basin runs on south along the same line to the
// moved co-op quay (P.basinEnd), so the quay's edge stays one straight run past the fish market
const [bA, bB] = P.basinEdge, sA = lerp2(bA, bB, P.slip.t0), sB = lerp2(bA, bB, P.slip.t1);
const bE = lerp2(bA, bB, (-59 - bA[1]) / (bB[1] - bA[1]));   // (19.70, −59): the edge's line carried on to the co-op quay
P.basinEnd = [+bE[0].toFixed(3), -59];
const slipDir = (() => { const dx = bB[0] - bA[0], dz = bB[1] - bA[1], L = Math.hypot(dx, dz); return [-dz / L, dx / L]; })();   // outward (east, into the basin)
const SLIP_D = 3.0;   // the slipway's notch reaches this far back into the quay
const back = (p) => [p[0] - slipDir[0] * SLIP_D, p[1] - slipDir[1] * SLIP_D];
// (the notch south of the fish market: the edge's points at its two ends, and the quay behind it)
const onEdge = (z) => lerp2(bA, bB, (z - bA[1]) / (bB[1] - bA[1]));
const nA = onEdge(Q.notch[0]), nB = onEdge(Q.notch[1]), backN = (p) => [p[0] - slipDir0()[0] * Q.notch[2], p[1] - slipDir0()[1] * Q.notch[2]];
function slipDir0() { const dx = bB[0] - bA[0], dz = bB[1] - bA[1], L = Math.hypot(dx, dz); return [-dz / L, dx / L]; }
const BASIN = [
  edgeBox(bA, sA, 9.4, FL, -0.1, 1, quay({ tag: 'basin-quay' })),
  edgeBox(sB, nA, 9.4, FL, -0.1, 1, quay({ tag: 'basin-quay' })),
  edgeBox(backN(nA), backN(nB), 9.4 - Q.notch[2], FL, -0.1, 1, quay({ tag: 'basin-quay' })),
  edgeBox(nB, P.basinEnd, 9.4, FL, -0.1, 1, quay({ tag: 'basin-quay' })),
  // the slipway's head: the basin quay behind its notch; the ramp runs from there down into the water
  edgeBox(back(sA), back(sB), 7.5, FL, -0.1, 1, quay({ tag: 'basin-quay' })),
];
const slipIn = back([(sA[0] + sB[0]) / 2, (sA[1] + sB[1]) / 2]);

// ================= the mid side of Alpha's half (unchanged by the stretch)
const MIDSIDE = [
  // ---- ground
  B(-P.cutX, P.cutX, FL, 0, P.strip, -P.track[1], snow({ tag: 'station-strip' })),
  B(P.crossing[0], P.square[0], FL, 0, P.backSt[0], P.strip, snow({ tag: 'village' })),
  B(P.square[0], P.square[1], FL, 0, P.backSt[0], P.strip, setts({ tag: 'square' })),
  B(P.square[1], P.kerb, FL, 0, P.backSt[0], P.northQuay[2], snow({ tag: 'village' })),
  // harbour: north quay, the basin quay (carried on past the cut), the slipway, the breakwater
  bx(P.northQuay, FL, 0, quay({ tag: 'north-quay' })),
  ...BASIN,
  R([slipIn[0] + slipDir[0] * 6.4, -1.25, slipIn[1] + slipDir[1] * 6.4], [slipIn[0], -0.1, slipIn[1]], 2.8,
    { tag: 'slipway', color: '#8f918f', pattern: PATTERN.concrete }),
  edgeBox(P.breakwater[0], P.breakwater[1], 2.6, FL, 0.25, 1, { tag: 'breakwater', color: '#9d9a93', pattern: PATTERN.concrete }),
  // tunnel portal capping the cut (the headland beyond is scenery)
  B(P.cutX, P.cutX + 1.5, FL, 7.5, -8.5, 8.5, { tag: 'portal', color: K.portal, pattern: SURF.setts, roof: true }),
  // island platform end ramp (down between the tracks, stopping short of the level crossing at x 18.5)
  R([I.x + 2.3, 0, 0], [I.x, I.y, 0], I.z * 2, timber({ tag: 'island-ramp', pattern: PATTERN.rampboard })),

  // ---- station side: the side platform (5.6 m deep), ramps at both ends, steps up from the forecourt
  // (the railcars are stage movers now: LAYOUT.movers below, src/game/movers.js)
  B(S.x0, S.x1, 0, S.y, S.z0, S.z1, timber({ tag: 'side-platform' })),
  R([S.x1 + 2.3, 0, -8.6], [S.x1, S.y, -8.6], 4.0, timber({ tag: 'side-ramp', pattern: PATTERN.rampboard })),
  R([S.x0 - 2.3, 0, -8.6], [S.x0, S.y, -8.6], 4.0, timber({ tag: 'side-ramp', pattern: PATTERN.rampboard })),
  ...P.steps.map((x) => R([x, 0, S.z0 - 2.7], [x, S.y, S.z0], 3.6, stair({ tag: 'platform-steps' }))),

  // ---- Alpha's overpass (the +x one): the deck over the whole cut, its stairs down the outer edge to both side
  // platforms (Tower Command: taller, with real steps)
  B(OP.x0, OP.x1, OP.y - OP.t, OP.y, -OP.z, OP.z, timber({ tag: 'overpass', notIn: 'tower' })),
  ...OP.stairs.map(opStair),
  B(OP.x0, OP.x1, OP.towerY - OP.t, OP.towerY, -OP.z, OP.z, timber({ tag: 'overpass', onlyIn: 'tower' })),
  ...OP.stairs.flatMap(opSteps),

  // ---- village buildings (tops off-limits), some off the street grid
  B(P.station[0], P.station[1], 0, 3.8, P.station[2], P.station[3], bldg(K.wall, { tag: 'station' })),
  bt(P.bath, 0, bldg(K.plaster, { tag: 'bathhouse' })),
  bt(P.store, 0, bldg(K.wall, { tag: 'store' })),

  // ---- hillside: T1 (1.3) stepping along the road (its steps up from the station corner); the hill's retaining walls
  // along the terraces' outer edges (ishigaki: dry stone, snow on top; off-limits tops)
  ...P.T1.map((r) => bx(r, FL, P.y1, setts({ tag: 'T1', color: K.stone }))),
  R([-29.5, 0, -7.6], [-29.5, P.y1, P.strip], 2.4, stair({ tag: 'T1-steps' })),
  ...P.hillWalls.slice(0, 3).map(hillWall),
];
function hillWall([x0, x1, z0, z1, y1]) { return B(x0, x1, FL, y1, z0, z1, { tag: 'hill-wall', color: '#8f8a80', pattern: SURF.setts, roof: true }); }

// ================= the base side of Alpha's half: drawn with the original numbers, moved out by ST.d as a unit
// (T2 with its welcome mural and its stair from the street, the Cuttlefish cottage, the hill walls and houses behind,
// the Fishermen's Co-op with the spawn deck, the grand stair, the loading dock, the net store, the co-op yard and quay)
const BASE = moveOut([
  B(-2.2, P.southQuay[0][0], FL, 0, -45.5, P.backSt[0], snow({ tag: 'coop-yard' })),
  B(P.southQuay[0][0], P.kerb, FL, 0, P.southQuay[0][3], P.backSt[0], snow({ tag: 'coop-yard' })),
  ...P.southQuay.map((r) => bx(r, FL, 0, quay({ tag: 'coop-quay' }))),
  // T2 (2.6) by the co-op (its long wall over the forecourt carries the village's painted welcome mural — murals.js)
  ...P.T2.map((r, i) => bx(r, FL, P.y2, setts({ tag: 'T2', color: K.stone, ...(i === 0 ? { mural: [{ n: [0, 0, 1], id: MURAL.welcome }] } : {}) }))),
  R([P.t2stair.x, 0, P.t2stair.z0], [P.t2stair.x, P.y2, P.t2stair.z1], P.t2stair.w, stair({ tag: 'T2-stair' })),
  bx(P.cottage, P.y2, P.y2 + 3.2, bldg(K.cedar, { tag: 'cottage' })),
  ...P.hillWalls.slice(3).map(hillWall),
  // hill houses stepping up behind T2 and the spawn (out of play; they cut the corner behind the co-op)
  B(-33.5, -9, FL, 5.4, -40.5, -37.2, bldg(K.plaster, { tag: 'hill-house' })),
  B(-17.5, -9, FL, 5.8, -44, -40.5, bldg(K.cedar, { tag: 'hill-house' })),
  B(-12.5, -9, FL, 6.2, -47, -44, bldg(K.plaster, { tag: 'hill-house' })),
  // the Fishermen's Co-op: warehouse behind, spawn deck, grand stair, loading dock, quay ramp
  B(-11, 11, FL, 8, -48, -45.5, bldg(K.wall, { tag: 'coop' })),
  // (its harbour-side wall is the warehouse's boarded side: not inkable — the quay ramp is the way up from the yard)
  B(DK.x0, DK.x1, FL, DK.y - 0.2, DK.z0 - 0.1, DK.z1, { tag: 'spawn-body', color: K.timber, pattern: PATTERN.weatherboard, noPaint: [[1, 0, 0]] }),
  B(DK.x0, DK.x1, DK.y - 0.2, DK.y, DK.z0, DK.z1, { tag: 'spawn', color: K.spawn, pattern: PATTERN.spawn }),
  R([0, 0, -29.5], [0, DK.y, DK.z1], 4.4, stair({ tag: 'grand-stair' })),
  B(DO.x0, DO.x1, 0, DO.y, DO.z0, DO.z1, timber({ tag: 'dock' })),
  R([P.dockStair.x, DO.y, P.dockStair.z0], [P.dockStair.x, DK.y, DK.z1], P.dockStair.w, stair({ tag: 'dock-stair' })),
  B(P.netStore[0], P.netStore[1], 0, 3.2, P.netStore[2], P.netStore[3], bldg(K.wall, { tag: 'net-store' })),
  R([16.9, 0, -42.4], [DK.x1, DK.y, -42.4], 3.0, timber({ tag: 'quay-ramp', pattern: PATTERN.rampboard })),
]);

// ================= the new land: the village high street (Q), z −30.5 … −51 (the hillside column from −28.5)
const { terrace: TR, forecourt: FC } = Q;
const SLICE = [
  // ---- ground: the hillside road, the onsen's yard and garden, the High Street's setts, round the fire-watch terrace,
  // the fire lane, the post office's yard, the forecourt in front of the base
  B(Q.road[0], Q.road[1], FL, 0, FC[0], Q.z0, snow({ tag: 'road' })),
  B(Q.inn[0], Q.inn[1], FL, 0, Q.garden[3], Q.z0, snow({ tag: 'onsen-yard' })),
  B(Q.garden[0], Q.garden[1], FL, Q.gardenY, Q.garden[2], Q.garden[3], setts({ tag: 'onsen-garden', color: K.stone })),
  R([Q.high[0] + 2.1, 0, -44.6], [Q.high[0], Q.gardenY, -44.6], 1.6, stair({ tag: 'garden-steps' })),
  B(Q.high[0], Q.high[1], FL, 0, FC[1], Q.z0, setts({ tag: 'high-street' })),
  B(TR.x0, TR.x1, FL, 0, TR.z1, Q.z0, setts({ tag: 'high-street' })),
  B(TR.x0, TR.x1, FL, 0, FC[1], TR.z0, setts({ tag: 'high-street' })),
  B(Q.fireLane[0], Q.fireLane[1], FL, 0, FC[1], Q.z0, snow({ tag: 'fire-lane' })),
  B(Q.po[0], P.kerb, FL, 0, FC[1], Q.z0, snow({ tag: 'post-yard' })),
  B(Q.road[1], P.kerb, FL, 0, FC[0], FC[1], setts({ tag: 'forecourt' })),
  // ---- the allotments: T1 carried on (1.3), stone steps up to the upper allotments (2.6) that run into T2's west end;
  // the hill walls behind; the potting shed on the upper terrace (its roof off-limits)
  bx(Q.T1, FL, P.y1, setts({ tag: 'T1', color: K.stone })),
  R([Q.upStair.x, P.y1, Q.upStair.z0], [Q.upStair.x, P.y2, Q.upStair.z1], Q.upStair.w, stair({ tag: 'allotment-steps' })),
  bx(Q.up, FL, P.y2, setts({ tag: 'T2', color: K.stone })),
  ...Q.hillWalls.map(hillWall),
  B(-31.5, -28.9, P.y2, P.y2 + 2.3, -48.4, -44.6, bldg(K.cedar, { tag: 'potting-shed' })),
  // ---- the onsen inn (Ikayu Inn: its front on the back street across from the bath house) — tops off-limits
  B(Q.inn[0], Q.inn[1], 0, 3.4, Q.inn[2], Q.inn[3], bldg(K.plaster, { tag: 'inn' })),
  bx(Q.boiler, 0, 2.8, bldg(K.cedar, { tag: 'inn-boiler' })),
  // ---- the fire-watch terrace (1.3, dry-stone walls): stairs up from the back street, down its south corners
  B(TR.x0, TR.x1, FL, TR.y, TR.z0, TR.z1, setts({ tag: 'fire-terrace', color: K.stone })),
  R([Q.nStair.x, 0, Q.z0], [Q.nStair.x, TR.y, TR.z1], Q.nStair.w, stair({ tag: 'terrace-steps' })),
  R([TR.x0 - Q.sStairs.run, 0, Q.sStairs.z], [TR.x0, TR.y, Q.sStairs.z], Q.sStairs.w, stair({ tag: 'terrace-steps' })),
  R([TR.x1 + Q.sStairs.run, 0, Q.sStairs.z], [TR.x1, TR.y, Q.sStairs.z], Q.sStairs.w, stair({ tag: 'terrace-steps' })),
  // ---- the post office (its front on the back street) and its sorting dock on the yard side (1.0, a hop up)
  B(Q.po[0], Q.po[1], 0, 3.4, Q.po[2], Q.po[3], bldg(K.wall, { tag: 'post-office' })),
  bx(Q.poDock, 0, 1.0, timber({ tag: 'post-dock' })),
  // ---- the fish market: its apron jutting into the basin and the auction floor across the quay (0.5; steps up at
  // both ends of the quay), the chiller room on it
  bx(Q.floor, FL, Q.floorY, quay({ tag: 'fish-market', color: '#aeaba4', pattern: PATTERN.concrete })),
  R([18.4, -0.1, Q.floor[3] + 1.5], [18.4, Q.floorY, Q.floor[3]], 2.6, stair({ tag: 'market-steps' })),
  R([18.4, -0.1, Q.floor[2] - 1.5], [18.4, Q.floorY, Q.floor[2]], 2.6, stair({ tag: 'market-steps' })),
  B(Q.chiller[0], Q.chiller[1], Q.floorY, Q.floorY + 2.6, Q.chiller[2], Q.chiller[3], bldg(K.wall, { tag: 'chiller', pattern: PATTERN.metalpanel })),
];

const HALF = [...MIDSIDE, ...SLICE, ...BASE];

// ---- Zone Control: the centre = the middle of the island platform and both trackbeds beside it; the side zone = the
// village square (Alpha's; Bravo's is the mirror)
const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const ZONES = {
  // the centre: the island platform between the tracks under the two overpasses (flat, inkable, never on a track: the
  // trains pass either side of it)
  center: [{ poly: rect(-7.6, 7.6, -P.track[0] + 0.2, P.track[0] - 0.2), y0: 0.8, y1: 1.4 }],
  side: { poly: rect(-5, 5, -27, -18), y0: -0.2, y1: 0.4 },
};

// ---- Tower Command: "the tower rides the railway" (drawn on Bravo's half, Alpha's goal): off the island platform onto
// Bravo's track, along the rails to the level crossing (checkpoint 1), up the hillside road, back along the back street
// — the user's drawing, kept — then (the stretch: a two-checkpoint stage's track is twice as long, 164 m, with detour
// loops; 2026-09-30) a loop through the village high street: down the fire lane beside the fire-watch terrace, back
// across the terrace along the onsen lane (up its wall, checkpoint 2 on top, down into the High Street) and past the
// inn to the hillside road, down the road to the co-op forecourt, along it to the loading dock (the goal: moved out
// with the base). Mirrored (Bravo's frame): the fire lane at x −7.25, the onsen lane at z 39.5, the forecourt at z 48
const TX = -P.roadX, TZ = -P.backZ, GX = -4.2, GZ = 31.8 + ST.d;
const LX = -Q.tower.laneX, MZ = -Q.tower.midZ, FZ = -Q.tower.foreZ;
const TOWER = {
  path: [[0, I.y, 0], [0, 5.0], [TX, 5.0], [TX, TZ], [LX, TZ], [LX, MZ], [TX, MZ], [TX, FZ], [GX, FZ], [GX, GZ]],
  checkpoints: [[TX, 5.0], [0, MZ]],
  yaw: 0,
};

// ---- the stage gimmick: the county railcars (stage movers, src/game/movers.js). Alpha's car waits at the east half of
// the station on Alpha's track, Bravo's (its twin) at the west half of Bravo's: every 25 s one of them has just pulled
// across to the other half (a 20 s wait, a 5 s move through the middle, eased in and out). A parked car walls off its
// half of the platform edge and trackbed — the crossings over that track there — and opens the other half; the two
// are always each other's mirror, so both teams face the same station. Level-crossing lamps flash and the bells ring
// from 4 s before a departure until the car stops; the horn blows 1.2 s before it moves. Tower Command: parked (the
// tower rides the inner half of each track out to the crossings, so the cars wait at the far halves all match);
// Boss Battle: the trains have left (HULLBREAKER roams the whole cut).
const TZc = (P.track[0] + P.track[1]) / 2;
const CAR = P.car;
// the crossing's warning lamps (railway.js calamari_crossing units: at x crossing[0] − 0.7, z ±7.4, lamps ±0.3 at 2.25
// on the face toward the road): [x, y, z, yaw, pair]
const UX = P.crossing[0] - 0.7;
const CROSSING_LAMPS = [[UX + 0.3, 2.25, -7.4 - 0.175, Math.PI, 0], [UX - 0.3, 2.25, -7.4 - 0.175, Math.PI, 1],
  [UX - 0.3, 2.25, 7.4 + 0.175, 0, 0], [UX + 0.3, 2.25, 7.4 + 0.175, 0, 1]];
const MOVERS = {
  mirror: true,
  modes: { tower: 'park', boss: 'off' },
  timetable: { first: 20, dwell: 20, move: 6, warn: 4, horn: 1.2 },
  cars: [{
    id: 'kiha101', stops: [[CAR.stop, -TZc], [-CAR.stop, -TZc]], y: 0, size: [2 * CAR.L + CAR.gap, CAR.h, CAR.W], roof: true,
    mesh: { type: 'calamari_train', L: CAR.L, gap: CAR.gap, W: CAR.W, floor: CAR.floor, h: CAR.h, cars: [{ number: 'KIHA 101', dest: 'INKOPOLIS' }, { number: 'KIHA 111', dest: 'INKOPOLIS' }] },
    twinMesh: { cars: [{ number: 'KIHA 102', dest: 'SHIOKARA BAY' }, { number: 'KIHA 112', dest: 'SHIOKARA BAY' }] },
    sounds: { horn: 'train_horn', run: 'train_run' },
  }],
  signals: { lamps: CROSSING_LAMPS, bells: [[P.roadX, 2.6, 0]], bell: 'crossing_bell' },
};

const CALAMARI = {
  id: 'calamari',
  bounds: { minX: -34, maxX: 34, minZ: -48 - ST.d, maxZ: 48 + ST.d },
  spawnPads: [[P.pad[0], P.pad[1], P.pad[2] - ST.d], [-P.pad[0], P.pad[1], -(P.pad[2] - ST.d)]],
  spawnBarrier: 4.2,
  // the world round it: no Inkopolis bay; our own hills, headlands, village beyond, breakwater, mountains (backdrop.js);
  // snow on the land (a low snow line and a heavy dusting), gentle snowfall, stars at dusk. A cold, clear winter day —
  // a low white sun, a pale blue sky, cool shadows off the snow, a slate sea — and a deep-blue dusk with warm windows.
  env: {
    backdrop: buildBackdrop,
    bay: false, boats: false, edge: 'none', stars: true,
    snow: { line: 9, cover: 0.72 },
    weather: { snow: { count: 2000, fall: 0.85, size: 0.055 } },
    theme: {
      all: { seaCrest: '#9fbcc0', foam: '#f4f8fb' },
      day: {
        sunAz: 208, sunEl: 24, sunColor: '#fff6ea', sunIntensity: 3.0, skySun: 2.5,
        hemiSky: '#bcd2f0', hemiGround: '#d6dde6', hemiGroundK: 2.0, hemiIntensity: 0.5, envK: 0.5,
        zenith: '#3f6fae', skyMid: '#86aad2', horizon: '#dde7f0', ground: '#7f98ab',
        horizonGlow: '#fff3e2', horizonGlowK: 0.08, glowColor: '#fff4e0',
        cloudLit: '#ffffff', cloudShade: '#9eacc0', cloud: [0.5, 1.0, 1.0, 0.52],
        seaDeep: '#1e3a4c', seaShallow: '#3a6a74', waveStrength: 0.9,
        haze: [1 / 1500, 0.9, 240], fog: [25, 700],
        grade: { uExposure: 0.9, uSat: 0.94, uVib: 0.08, uContrast: 1.07, uLift: 0.0, uVignette: 0.2, uShadowTint: [0.88, 0.96, 1.14], uHighTint: [1.0, 1.0, 1.0] },
      },
      sunset: {
        sunAz: 214, sunEl: 7, sunColor: '#ffae70', sunIntensity: 2.6, skySun: 3.2,
        hemiSky: '#4a6cc4', hemiGround: '#7d93c8', hemiGroundK: 1.6, hemiIntensity: 0.66, envK: 0.42,
        zenith: '#101c4a', skyMid: '#324a8c', horizon: '#e9a27e', ground: '#34426e',
        horizonGlow: '#ff9a62', horizonGlowK: 0.5, glowColor: '#ffb070',
        cloudLit: '#ffc2a0', cloudShade: '#48558f',
        seaDeep: '#101a3a', seaShallow: '#26406a', seaCrest: '#6f8fc0',
        grade: { uExposure: 1.1, uSat: 1.0, uVib: 0.1, uContrast: 1.06, uLift: 0.01, uVignette: 0.26, uShadowTint: [0.84, 0.95, 1.22], uHighTint: [1.04, 1.0, 0.94], bloom: [0.45, 0.55, 1.7] },
      },
    },
  },
  single: SINGLE,
  half: HALF,
  zones: ZONES,
  tower: TOWER,
  movers: MOVERS,
  // match intro: high over the station (the footbridges, the railcars, the canopy), then back down to the co-op deck
  intro: { from: [16, 14, 10], lookFrom: [0, 3, -2], toBack: 3.0 },
  // stage-select picture: from high on Alpha's hill over the village high street — the allotments, the inn and its
  // steaming garden, the fire-watch tower on its terrace, the post office and the fish market — across the square and
  // the bath house's chimney to the station, its railcars and footbridges, the tunnel, and Bravo's co-op beyond
  art: { from: [-38, 26, -66], look: [7, 0, -17], fov: 56 },
  decor: { lamps: [], palms: [], flags: [] },
};

export const LAYOUT = CALAMARI;
