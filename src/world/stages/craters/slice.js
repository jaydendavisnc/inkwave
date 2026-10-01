// Turf War Craters — the slice (the Long Stages stretch, stretch.js): the new land on each half between the Round Down's
// front (mid's: the crater, the Remembrance Walk, the zig-zag, the pillbox, the memorial) and the pavilion's neck (the
// base's), z −28.5 … −50.5 on Alpha's half (Bravo's is the 180° twin). Pure data (mapkit boxes + geo.js helpers):
// imported by layout.js (it builds the ground and the trench floors round these), props.js (the dressing's anchors).
//
// The reserve line — the Great Turf War's second line, kept like the first:
//   • the support trench: on the right flank its bay (3.2 m, open at both ends: the tower's — it drops in at the north
//     end and climbs out at the south), a zig-zag from the bay east toward the mound (a plank bridge over it); on the
//     left a zig-zag from the central path out to the left cliff walk (a plank bridge over its last bay)
//   • the communication trench zig-zagging back from the left support trench toward the neck (a stair up at its end)
//   • the observation post: a concrete bunker behind the left support trench, its roof (2.4) reached by a stair at its
//     side — high ground over the left flank
//   • the regimental mound (the strategic point): a turf octagon (1.6) on the reserve line's axis with the Inkling
//     Rifles' cenotaph on its top; four ways up (the north steps, the south steps onto the neck's forecourt, ramps on its
//     north-east and south-west shoulders); the tower climbs its west face, crosses its top and drops off its east face
//     (its checkpoint 2 is in the support trench's bay, where the zig-zag to the mound leaves it: see SLICE_TOWER)
//   • two more flooded shell holes (the right flank's route bends round one, the left cliff walk's round the other)
//   • the cliffs run on down both sides (the park's circle becomes a stadium: coastL / coastR), the undercliff shelf at
//     their foot from the coves by the neck to the saps' mouths (layout.js)
import { PATTERN, B, R, O, OCT, OCTRAMP } from '../../mapkit.js';
import { SURF } from './surfaces.js';
import { trench, ringSegments, inRect, inStrip, r3 } from './geo.js';

const FL = -2.0, YF = -1.0, YM = 1.6, YP = 2.4, PARAPET = 0.3;
const CO = { turf: '#9cab74', slope: '#a3ad77', crest: '#aab07c', sandbag: '#b9a986', timber: '#8d7a62', concrete: '#bdb9ae', stone: '#ece8de', plank: '#a98f6e', path: '#cbbd9a' };
const turf = (o = {}) => ({ color: CO.turf, pattern: SURF.turf ?? PATTERN.plain, ...o });
const bags = (o = {}) => ({ color: CO.sandbag, pattern: SURF.sandbag ?? PATTERN.plain, ...o });
const NOSIDES = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

// ------------------------------------------------------------------------------------------------ the outline
// the stadium's sides (Alpha's half): the left side from past the T4 sap (325°) south to the cap by the neck; the right
// side from the cap north to the pillbox's shore (220°) — bowed out a little, faceted like the rest of the Round Down
export const SLICE = {
  z0: -50.5, z1: -28.5,
  coastL: [[29.3, -22.8], [31.0, -27.6], [31.6, -32.8], [31.3, -38.2], [30.0, -43.0], [27.6, -47.0], [23.9, -50.0], [19.2, -51.9], [14.2, -52.5], [10.0, -52.3]],
  coastR: [[-10.0, -52.3], [-14.4, -52.6], [-19.4, -51.9], [-24.2, -49.9], [-28.0, -46.8], [-30.4, -42.6], [-31.7, -37.6], [-32.0, -33.8], [-31.6, -29.6], [-30.2, -25.9]],
};
// (ten points a side: the coast keeps an odd point count, so the chalk lip's alternating tops (layout.js LIP) still meet
// their twins at the half line with different heights, and the edges past the slice keep their parity)

// ------------------------------------------------------------------------------------------------ the support trench
// T8 — its bay on the right flank (the tower's: 3.2 m inside, open at both ends; timber revetments, sandbag parapets;
// the zig-zag T5 leaves its east wall)
export const T8 = { x0: -28.1, x1: -24.9, z0: -41.2, z1: -32.0, wall: 0.5 };
// T5 — the zig-zag east from the bay (2.25 m inside), a stair up at its east end toward the mound's north steps
export const T5 = { pts: [[-23.9, -36.8], [-18.5, -36.8], [-15, -33.8], [-10.5, -33.8]], w: 2.25, wall: 0.5, stair: 2.5 };   // (its walls start at the bay's wall)
const T5_GAP = [T5.pts[0][1] - T5.w / 2, T5.pts[0][1] + T5.w / 2];                 // the opening in the bay's east wall
// T6 — the left support trench: from a stair down off the central path, out to a stair up onto the left cliff walk
export const T6 = { pts: [[8, -35.5], [10.5, -35.5], [14, -38.5], [19.5, -38.5], [23, -35.5], [27.5, -35.5]], w: 2.25, wall: 0.5, stair: 2.5 };
// T7 — the communication trench back from T6's middle bay toward the neck, a stair up at its end
export const T7 = { pts: [[16.75, -40.125], [16.75, -44.5], [13.25, -47.5], [13.25, -49.2]], w: 2.25, wall: 0.5, stair: 2.5 };
const T7_GAP = [T7.pts[0][0] - T7.w / 2, T7.pts[0][0] + T7.w / 2];                // T7's mouth in T6's south wall (x)
const T6_T7 = [T7_GAP[0], T7_GAP[1], T7.pts[0][1], T7.pts[0][1] + T6.wall];         // the junction under T6's wall line

const trenchPieces = [];
{
  const w = T8.wall;
  const wall = (x0, x1, z0, z1) => trenchPieces.push(B(x0, x1, YF, 0, z0, z1, { tag: 't8-revetment', color: CO.timber, pattern: PATTERN.weatherboard }), B(x0, x1, 0, PARAPET, z0, z1, bags({ tag: 't8-parapet' })));
  wall(T8.x0 - w, T8.x0, T8.z0, T8.z1);
  wall(T8.x1, T8.x1 + w, T8.z0, T5_GAP[0]);
  wall(T8.x1, T8.x1 + w, T5_GAP[1], T8.z1);
}
const T5B = trench(T5.pts, T5.w, T5.wall, YF, (i) => (i % 2 ? PARAPET + 0.1 : PARAPET), () => bags({ tag: 't5-parapet' }), { ends: [false, false] });
const T6B = trench(T6.pts, T6.w, T6.wall, YF, (i) => (i % 2 ? PARAPET + 0.1 : PARAPET), () => bags({ tag: 't6-parapet' }), {
  ends: [false, false], gaps: { '2:-1': [[T7_GAP[0] - T6.pts[2][0], T7_GAP[1] - T6.pts[2][0]]] },
});
const T7B = trench(T7.pts, T7.w, T7.wall, YF, (i) => (i % 2 ? PARAPET : PARAPET + 0.1), () => bags({ tag: 't7-parapet' }), { ends: [false, false] });
trenchPieces.push(...T5B.walls, ...T6B.walls, ...T7B.walls);
const LEGS = [...T5B.legs, ...T6B.legs, ...T7B.legs];
// the stairs (timber fire-step stairs, rising out of the trench)
const stair = (a, b) => R([a[0], YF, a[1]], [b[0], 0, b[1]], T5.w, { tag: 'trench-stair', color: CO.timber, pattern: PATTERN.rampboard });
const t5e = T5.pts[T5.pts.length - 1], t6a = T6.pts[0], t6e = T6.pts[T6.pts.length - 1], t7e = T7.pts[T7.pts.length - 1];
const STAIRS = [
  stair(t5e, [t5e[0] + T5.stair, t5e[1]]),
  stair(t6a, [t6a[0] - T6.stair, t6a[1]]),
  stair(t6e, [t6e[0] + T6.stair, t6e[1]]),
  stair(t7e, [t7e[0], t7e[1] - T7.stair]),
];
const STAIR_RECTS = [
  [t5e[0], t5e[0] + T5.stair, t5e[1] - T5.w / 2, t5e[1] + T5.w / 2], [t6a[0] - T6.stair, t6a[0], t6a[1] - T6.w / 2, t6a[1] + T6.w / 2],
  [t6e[0], t6e[0] + T6.stair, t6e[1] - T6.w / 2, t6e[1] + T6.w / 2], [t7e[0] - T7.w / 2, t7e[0] + T7.w / 2, t7e[1] - T7.stair, t7e[1]],
];
// plank bridges (as layout.js: deck 0.5 … 0.7 on trestles, a plank ramp down each side) over T5's first bay and T6's last
export const SLICE_BRIDGES = [{ x: -21.5, z: T5.pts[0][1], half: T5.w / 2 + T5.wall + 0.1 }, { x: 25.3, z: T6.pts[4][1], half: T6.w / 2 + T6.wall + 0.1 }];
const BR = { w: 1.8, deck: [0.5, 0.7], ramp: 1.7 };
const bridgePieces = SLICE_BRIDGES.flatMap(({ x, z, half }) => [
  B(x - BR.w / 2, x + BR.w / 2, BR.deck[0], BR.deck[1], z - half, z + half, { tag: 'bridge', color: CO.plank, pattern: PATTERN.planks }),
  R([x, 0, z - half - BR.ramp], [x, BR.deck[1], z - half], BR.w, { tag: 'bridge-ramp', thin: true, thickness: 0.2, color: CO.plank, pattern: PATTERN.rampboard }),
  R([x, 0, z + half + BR.ramp], [x, BR.deck[1], z + half], BR.w, { tag: 'bridge-ramp', thin: true, thickness: 0.2, color: CO.plank, pattern: PATTERN.rampboard }),
]);

// ------------------------------------------------------------------------------------------------ the regimental mound
// a turf octagon (1.6) with the Inkling Rifles' cenotaph on its top (props.js); the north steps toward mid, the south steps
// onto the neck's forecourt, turf ramps up its north-east and south-west shoulders
export const MOUND = { c: [-3, -43], R: 5.2, top: YM, memorial: [-3, -45.9] };
const [mcx, mcz] = MOUND.c, MA = MOUND.R * Math.cos(Math.PI / 8);
export const MOUND_PIERS = [-1, 1].flatMap((sg) => [-1, 1].map((sx) => [mcx + sx * 2.1, r3(mcz + sg * (MA - 0.5)), sg]));
const moundPieces = [
  ...OCT(mcx, mcz, MOUND.R, 0, YM, turf({ tag: 'mound', color: CO.crest })),
  R([mcx, 0, r3(mcz + MA + 4.0)], [mcx, YM, r3(mcz + MA)], 3.0, { tag: 'mound-steps', color: '#d6d1c5', pattern: PATTERN.stonestep }),
  R([mcx, 0, r3(mcz - MA - 4.0)], [mcx, YM, r3(mcz - MA)], 3.0, { tag: 'mound-steps', color: '#d6d1c5', pattern: PATTERN.stonestep }),
  // stone gate piers either side of the steps' heads (cover on the top's edges; props.js caps them)
  ...MOUND_PIERS.map(([x, z]) => B(x - 0.4, x + 0.4, YM, YM + 1.3, r3(z - 0.4), r3(z + 0.4), { tag: 'mound-pier', color: CO.stone, pattern: PATTERN.pavers, roof: true })),
  OCTRAMP(mcx, mcz, MOUND.R, 0, YM, 1, 1, 4.0, 2.4, turf({ tag: 'mound-ramp', color: CO.slope })),
  OCTRAMP(mcx, mcz, MOUND.R, 0, YM, -1, -1, 4.0, 2.4, turf({ tag: 'mound-ramp', color: CO.slope })),
];

// ------------------------------------------------------------------------------------------------ the observation post
// a concrete bunker behind the left support trench (walls 0 … 2.05, the roof slab to 2.4 overhanging its front and
// sides), its stair up the west side (against the communication trench's wall) from the front to the roof's back
export const OP = { x0: 20.575, x1: 25.575, z0: -47.0, z1: -42.0 };
const opPieces = [
  B(OP.x0, OP.x1, 0, 2.05, OP.z0, OP.z1, { tag: 'op', color: CO.concrete, pattern: PATTERN.concrete, mural: NOSIDES.map((n) => ({ n, id: 8 })) }),
  B(OP.x0 - 0.2, OP.x1 + 0.2, 2.05, YP, OP.z0, OP.z1 + 0.2, { tag: 'op-roof', color: CO.concrete, pattern: PATTERN.concrete }),
  B(OP.x1 - 1.6, OP.x1 - 0.3, YP, YP + 0.95, OP.z1 - 0.55, OP.z1 + 0.05, bags({ tag: 'op-sandbags' })),
  B(OP.x0 + 0.25, OP.x0 + 1.55, YP, YP + 0.95, OP.z1 - 0.55, OP.z1 + 0.05, bags({ tag: 'op-sandbags' })),
  R([OP.x0 - 1.1, 0, OP.z1 + 0.2], [OP.x0 - 1.1, YP, OP.z0 - 0.2], 2.2, { tag: 'op-stair', color: CO.concrete, pattern: PATTERN.treads }),
];

// ------------------------------------------------------------------------------------------------ flooded shell holes
// round ponds of dark water (the death plane) in turf rims, like the flooded crater on the left flank (layout.js POND)
export const PONDS = [{ c: [-18.5, -47.9], r: 2.2, rim: 2.9, N: 12 }, { c: [25, -29.6], r: 2.6, rim: 3.3, N: 12 }];
const pondPieces = PONDS.flatMap((p) => [
  B(p.c[0] - p.rim, p.c[0] + p.rim, FL, -1.75, p.c[1] - p.rim, p.c[1] + p.rim, { tag: 'pond-still', hidden: true, solid: false, paint: false }),
  ...ringSegments(p.c[0], p.c[1], p.N, p.r, p.rim, FL, (k) => (k % 2 ? 0.3 : 0.2), { outer: true, opts: () => turf({ tag: 'pond-rim', color: CO.slope }) }).map((c) => c.piece),
]);

// ------------------------------------------------------------------------------------------------ cover
// sandbag emplacements (0.95) across the reserve line — none on the tower's runs
const bagwall = (x0, x1, z0, z1) => B(x0, x1, 0, 0.95, z0, z1, bags({ tag: 'emplacement' }));
const coverPieces = [
  bagwall(-20.5, -18.5, -40.4, -39.65),     // inside the tower's loop, behind the support trench's first bay
  bagwall(-14.2, -12.2, -40.4, -39.65),
  bagwall(-14.8, -12.8, -47.4, -46.65),     // between the right shell hole and the mound
  bagwall(-25.4, -23.4, -46.3, -45.55),     // the right cliff walk, behind the bay
  bagwall(8.5, 10.5, -46.2, -45.45),        // by the goal's run, the communication trench behind
  bagwall(21.5, 23.5, -49.0, -48.25),       // behind the observation post
  bagwall(8.5, 10.5, -31.4, -30.65),        // in front of the left support trench
  bagwall(17.0, 19.0, -33.4, -32.65),       // the same, by its dog-leg
  bagwall(-8.5, -6.5, -37.0, -36.25),       // below the mound's north-west shoulder, by the zig-zag's stair
  bagwall(8.8, 10.8, -40.4, -39.65),        // behind the left support trench's first dog-leg
];

// ------------------------------------------------------------------------------------------------ the board
// an interpretive board by the path (a painted panel, murals.js 11: THE RESERVE LINE, in a steel frame, props.js)
//   deg = the way the panel faces (0 = +z, 90 = +x)
export const SLICE_BOARDS = [{ x: 6.3, z: -32.4, deg: -90, id: 11 }];
const boardPieces = SLICE_BOARDS.map((b) => { const a = (b.deg * Math.PI) / 180, f = [r3(Math.sin(a)), 0, r3(Math.cos(a))];
  return O(b.x, b.z, 1.6, 0.06, 0.65, 1.65, b.deg, { tag: 'board', color: '#e9e4d6', pattern: PATTERN.plain, roof: true, noPaint: [f, f.map((v) => -v), [0, 1, 0]], mural: [{ n: f, id: b.id }] }); });

// ------------------------------------------------------------------------------------------------ what layout.js takes
// the flush hoggin path: from the neck's forecourt north past the mound's east face, then back onto the old path's line
export const SLICE_PATHS = [[2.4, 5.0, -51.7, -30.2], [-1.3, 5.0, -30.2, -28.5]];
// the ground: holes (trench interiors, their stairs, the ponds' water) and where the trench floors go
export const inSliceTrench = (x, z) => inRect([T8.x0, T8.x1, T8.z0, T8.z1], x, z) || inRect([T8.x1, T5.pts[0][0], T5_GAP[0], T5_GAP[1]], x, z)
  || inRect(T6_T7, x, z) || LEGS.some((L) => inStrip(L, x, z));
const T8_WALLS = [[T8.x0 - T8.wall, T8.x0, T8.z0, T8.z1], [T8.x1, T8.x1 + T8.wall, T8.z0, T8.z1]];   // (the revetments stand in the ground: no slab under them)
export const inSliceHole = (x, z) => inSliceTrench(x, z) || T8_WALLS.some((r) => inRect(r, x, z)) || STAIR_RECTS.some((r) => inRect(r, x, z)) || PONDS.some((p) => Math.hypot(x - p.c[0], z - p.c[1]) < p.r);
export const SLICE_TRENCH_PIECES = trenchPieces;
export const SLICE_STANDING = [...trenchPieces, ...bridgePieces, ...moundPieces, ...opPieces, ...pondPieces.filter((d) => !d.hidden), ...coverPieces, ...boardPieces];
export const SLICE_PIECES = [...trenchPieces, ...STAIRS, ...bridgePieces, ...moundPieces, ...opPieces, ...pondPieces, ...coverPieces, ...boardPieces];
// the tower's loop through the slice (Alpha's side; layout.js turns it to Bravo's for the track): on from the old goal
// (−5, −28.5) along the reserve line's front, down the bay, back over the mound, to the goal before the neck.
// Checkpoint 2 is in the bay, opposite the mouth of the zig-zag (T5) that leads off to the mound: 69 % of the way. On
// the mound it was 89 %, the last stop before the goal, and it can't come earlier there: the tower only gets from the
// reserve line's front to the base side through the bay (the mound's north-east ramp and the left trench's stair leave
// no 2.5 m lane down the centre, the mound's top is barred north–south by the cenotaph), so the mound always comes
// after the bay's loop, with only the short run to the goal behind it.
export const SLICE_TOWER = { path: [[-5, -30.5], [-26.5, -30.5], [-26.5, -43], [5.5, -43], [5.5, -50]], cp2: [(T8.x0 + T8.x1) / 2, T5.pts[0][1]] };
