// Eco-Forest Treehills — the plan: every tier region's outline and the key numbers, in world metres (Alpha at −Z).
// Pure data (imported by layout.js for the ground and by props.js / backdrop dressing, which place things from the same
// numbers). Alpha's half is authored; Bravo's is the 180° twin ((x, z) → (−x, −z)). The east tree-hill (+X) is authored
// whole (it spans both halves); the west one is its twin. Regions share their edges exactly (no gaps, no overlaps).
//
//   heights: G0 the lowland (meadow + gardens) 0 · T1 the terraces 1.3 · T2 the hill's upper tier 2.6 ·
//            T3 the hill's crown 3.9 · SP the spawn deck (the research station's roof: one storey of modules on the
//            base terrace) 3.9 · NT the nursery's seedbed terrace 1.95 · the potting deck T2 · the channel's bed 1.0
export const G0 = 0, T1 = 1.3, T2 = 2.6, T3 = 3.9, SP = 3.9;

// ---------------------------------------------------------------------------------------------------------------------
// The Long Stages stretch (the user, 2026-09-30: "extend each half of every map by 25 %"): each half is D m longer. The
// base — the station, its terrace, the lobe's tip, the strip's end — is drawn below at its old place (|z| beyond CUT) and
// moved out by D through mz(); the land the move opens between the cut and the base is the nursery (NURSERY …). The cut
// runs across the whole stage at |z| 26, along the seam between the garden's hardstanding and the old base terrace (no
// building crosses it). Everything nearer mid than the cut — the meadow, the plaza, the garden, the hills' middles — is
// where it was.
export const STRETCH = { cut: 26, d: 22 };
export const mz = (z) => (z < -STRETCH.cut ? z - STRETCH.d : z > STRETCH.cut ? z + STRETCH.d : z);

// the station (spawn building): its roof deck is the spawn (was z −47 … −38, the pad at −42.5)
export const STATION = { x0: -9, x1: 9, z0: mz(-47), z1: mz(-38) };
export const PAD = [0, SP, mz(-42.5)];

// the lowland: a self-symmetric core box (|x| ≤ 15, |z| ≤ 14) + Alpha's garden below it (its corners cut at 30° / 60°)
export const CORE = { x: 15, z: 14 };
// Alpha's garden, split by the rill (a shallow decorative channel, floor −0.3) running from the band's wall to the apron's
// chamfered wall: the strip north of it, the rill, the working garden south of it
export const RILL_Y = -0.3;
export const GARDEN_N = [[-15, -14], [-13.6, -16.2], [15, -16.2], [15, -14]];
export const RILL = [[-13.6, -16.2], [-12.836, -17.4], [15, -17.4], [15, -16.2]];
export const GARDEN_S = [[-12.836, -17.4], [-8, -25], [8, -25], [15, -21], [15, -17.4]];
export const GARDEN = [[-15, -14], [-8, -25], [8, -25], [15, -21], [15, -14]];

// the Seed Vault Plaza at mid (a single piece, self-symmetric): a raised hexagon (1.3) with flat faces north and south
// (the broad ramps), slanted faces (the stairs on SE / NW, climbable walls on SW / NE) and short flats east and west
// where the tower drops off it; the centre zone on its top; the Solar Canopy over it on six pylons (underside 7 m)
export const PLAZA = [[7.3, -2.1], [7.3, 2.1], [3.9, 6.75], [-3.9, 6.75], [-7.3, 2.1], [-7.3, -2.1], [-3.9, -6.75], [3.9, -6.75]];
export const CANOPY = { y: 7.0, R: 9.6, pylons: [[3.3, 5.6], [-3.3, 5.6], [-3.3, -5.6], [3.3, -5.6], [6.3, -2.75], [-6.3, 2.75]] };
// the greenhouse pods flanking it (Alpha's in the south-west quadrant, Bravo's its twin), the meadow's mounds
export const GREENHOUSE = { x: -9, z: -12.0, L: 8, R: 2.15 };
// the mounds: grass banks (w along their heading × d, top) with a broad ramp up each long side (run), turned deg
export const MOUNDS = [{ x: 11.0, z: -10.3, w: 4.2, d: 2.2, top: 0.8, run: 2.0, deg: 30 }, { x: -11, z: -4.8, w: 3.4, d: 1.6, top: 0.6, run: 1.5, deg: -20 }];

// Alpha's T1 ground round the garden and back to the station (all at 1.3): the hardstanding (chequer plate) framing the
// garden's south wall; the nursery (the new land, lawn) from the cut back to the irrigation channel; the channel (its bed
// at CH_Y) along the base terrace's front; the base terrace (chequer plate, the station's apron: the old one, moved out)
// round the station's front, its west side up to x −15. And the east tree-hill's south lobe (lawn, the left lane) from
// the base terrace up to the hill's upper tier (z −10), meeting them along x 15: its outer edge runs straight on through
// the nursery (x 21), with a faceted bay (x 24.5) for the nursery's wind turbine
export const NT = 1.95, CH_Y = 1.0;
export const HARD = [[-15, -26], [15, -26], [15, -21], [8, -25], [-8, -25], [-15, -14]];
export const CHANNEL = [[-12, -48], [14, -48], [14, -46.6], [-12, -46.6]];
// the nursery's ground (x −15 … 15, z −26 … −48 but the channel): the service lanes — twin gravel wheel tracks with a
// grass strip between (the front lane, the middle walk to the deck, the channel's bank; gravel squares where they turn:
// Tower Command's loop runs on them) — between lawn plots. All flush at T1
const rz = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];   // (a rect, x0 < x1, z0 < z1: counter-clockwise)
export const NURSERY_GRAVEL = [
  rz(-15, 2.6, -27.2, -26), rz(-15, 2.6, -29.4, -28.2), rz(2.6, 5.4, -29.4, -26),                  // the front lane + its turn
  rz(2.6, 3.6, -42.9, -29.4), rz(4.4, 5.4, -42.9, -29.4),                                          // the middle walk (on under the deck)
  rz(-15, 2.6, -43.8, -42.9), rz(-15, 2.6, -46.6, -44.8), rz(2.6, 5.4, -46.6, -42.9),               // the bank lane + its turn
];
export const NURSERY_GRASS = [rz(-15, 2.6, -28.2, -27.2), rz(3.6, 4.4, -42.9, -29.4), rz(-15, 2.6, -44.8, -43.8)];
export const NURSERY_LAWN = [
  [[-15, -42.9], [2.6, -42.9], [2.6, -29.4], [-15, -29.4]],
  [[5.4, -46.6], [15, -46.6], [15, -26], [5.4, -26]],
  [[-15, -48], [-12, -48], [-12, -46.6], [-15, -46.6]],
  [[14, -48], [15, -48], [15, -46.6], [14, -46.6]],
];
export const BASE = [[-9, mz(-38)], [9, mz(-38)], [9, mz(-47)], [13, mz(-47)], [13, mz(-41.547)], [15, mz(-38.083)], [15, -48], [-15, -48],
  [-15, mz(-38.083)], [-13, mz(-41.547)], [-13, mz(-47)], [-9, mz(-47)]];
// (the lobe's outer edge through the nursery: straight on from its old corner (21, −25.6), out round the turbine's bay,
// then one long 60° facet in toward the base and a 30° one onto the base terrace's corner — the diamond narrowing to
// the station again)
export const LOBE = [[15, -51.81], [18.5, -49.79], [24.5, -39.4], [24.5, -35.608], [21, -29.546], [21, -25.608], [25, -23.299], [31.5, -12.041],
  [31.5, -10], [19.5, -10], [19.5, -21], [15, -21]];
// the east tree-hill (authored whole). T1: the band along the lowland + the north strip (Bravo's right lane: the Tower
// Command route down to Bravo's plateau, on through Bravo's nursery — its outer edge stepping in at 60° to x 23, then 30°
// toward the base terrace's corner: the diamond narrowing to the station; its end square at x 15 … 19, the band's column); T2 the upper tier (a C round the crown, open to
// the reservoir); T3 the crown
export const STRIP = [[15, -21], [19.5, -21], [19.5, 20], [31, 20], [28, 25.196], [28, 34], [23, 42.66], [23, 55], [19, 57.309], [15, 57.309]];
// the strip's orchard bank through the nursery (NT, lawn: a raised bank against the reservoir edge — groves, hives,
// saplings on it; stairs down its inner side to the strip's lane). Authored on the north strip (Bravo's); the west one
// in Alpha's nursery is its twin
export const BANK = [[23.5, 41.8], [19.5, 41.8], [19.5, 30.4], [28, 30.4], [28, 34]];
export const UPPER = [[19.5, -10], [31.5, -10], [33, -7.402], [33, -4], [26.5, -4], [26.5, 14], [33, 14], [31, 17.464], [31, 20], [19.5, 20]];
export const CROWN = [[26.5, -4], [33, -4], [35.5, 0.33], [35.5, 9.67], [33, 14], [26.5, 14]];
// the wind turbine on the crown (its base is off-limits); the nursery's, in the lobe's bay
export const TURBINE = { x: 32.6, z: 5, r: 1.6, hub: 15.5, rotor: 7.2 };
export const NTURBINE = { x: 21.8, z: -37.4, hub: 15.5 };

// ---------------------------------------------------------------------------------------------------------------------
// The nursery (the new land, Alpha's; Bravo's is its twin): the research station's seedling nursery between the garden
// and the base terrace. Its middle is a stepped block: the seedbed terrace (NT, raised seedbeds in rows) and, east of it,
// the potting deck (T2, the potting shed and the benches) — the slice's strategic point, over the nursery with a view
// down the garden stair to the plaza. The deck's twin front stairs face mid, its side stair the zone; the terrace has
// stairs on three sides and a flight up onto the deck. Tower Command's service lanes run round and over it (TRACK).
export const TERRACE = { x0: -14, x1: -4, z0: -41, z1: -33 };
export const DECK = { x0: -4, x1: 8, z0: -41, z1: -33 };

// Tower Command (authored on Bravo's side, z > 0): across the meadow, up the band (1.3) and the upper tier (2.6), along
// the upper tier past the crown and the turbine, down onto the north strip (1.3); then (the stretch: twice the length,
// the tower 1.5 × as fast) a loop through the nursery on its service lanes — along the nursery's front (loopN), down its
// middle walk and over the potting deck (loopX), back along the channel's bank (loopS) to the strip's lane (backX) —
// and on down the strip to Bravo's terrace and along it to the goal
export const TRACK = { x: 24, z: mz(31), goalX: 6, loopX: -4, loopN: 28, loopS: 44.3, backX: 20.5 };

// Zone Control: the meadow's middle (centre); the side zone as far from mid as it always was (it sat on the old base
// terrace, x 3.5 … 14, z −26.5 … −36.5; now the nursery's east side between the deck and the lobe's lane)
export const ZONE_C = [[6.4, -1.6], [6.4, 1.6], [3.4, 5.85], [-3.4, 5.85], [-6.4, 1.6], [-6.4, -1.6], [-3.4, -5.85], [3.4, -5.85]];
export const ZONE_S = [8, 18.5, -36.5, -26.5];

// the reservoir's outline (the playable ground's outer edge), for checks and the backdrop: Alpha's half, from the west
// end of the station's back round the east side to the north; the full ring is this + its twin
export const bounds = { minX: -35.5, maxX: 35.5, minZ: mz(-47), maxZ: mz(47) };

// ---------------------------------------------------------------------------------------------------------------------
// The forest: groves on every terrace of the east tree-hill (authored whole; the west hill is its twin). Each grove is a
// bed (an O-box: centre x, z on tier y, w × d turned deg — the mapkit O convention) of bark mulch or moss 12 cm proud of
// the lawn (layout.js lays it: paintable, walkable), planted as one solid clump (props.js: groveParts) — trees on a
// 1.45 m hex lattice nearest the bed's middle (their cores touch: no pockets between them), shrubs on the next lattice
// points out (or pts / spts: their local spots, for the small beds), ferns round the rim. bed: null = no bed (the band and the upper tier's meadow edge: their ground is the
// stage's murals). n trees, m shrubs, hmax the tallest (in the middle).
export const BED_H = 0.12;
export const GROVES = [
  // the south lobe (T1, Alpha's left lane): along the tip's outer edge (beside the side zone), the corner grove short
  // of the hill ramp, the pocket between the hill ramp and the lobe stair against the upper tier's wall
  // (the stretch: the lobe's tip grove stands on its new 60° facet toward the base, by the channel's end)
  { id: 'lobe-tip', x: 19.2, z: -45.0, y: T1, w: 4.0, d: 1.6, deg: -60, n: 3, m: 0, hmax: 7.6, bed: 'mulch', seed: 1 },
  { id: 'lobe-corner', x: 22.83, z: -20.77, y: T1, w: 5.6, d: 2.4, deg: -45, n: 6, m: 2, hmax: 8.0, bed: 'moss', seed: 2 },
  { id: 'lobe-wall', x: 26.7, z: -11.33, y: T1, w: 2.3, d: 2.55, deg: 0, n: 2, m: 1, hmax: 6.4, bed: 'mulch', seed: 3, pts: [[-0.45, -0.4], [0.45, 0.45]], spts: [[0.55, -0.6]] },
  // the upper tier (T2): the forest round the ranger's clearing (between it and the stairs), the meadow edge (the
  // track's west side: three stands with gaps to shoot through), the north corner beside the crown stair
  { id: 'upper-ranger', x: 26.85, z: -6.65, y: T2, w: 1.5, d: 5.1, deg: 0, n: 3, m: 1, hmax: 6.6, bed: 'mulch', seed: 4 },
  { id: 'upper-edge-s', x: 20.65, z: 4.5, y: T2, w: 1.5, d: 4.4, deg: 0, n: 3, m: 0, hmax: 5.4, bed: 'mulch', seed: 5 },
  { id: 'upper-edge-m', x: 20.65, z: 10.5, y: T2, w: 1.5, d: 3.8, deg: 0, n: 3, m: 0, hmax: 4.8, bed: 'moss', seed: 6 },
  { id: 'upper-edge-n', x: 20.65, z: 16.0, y: T2, w: 1.5, d: 4.0, deg: 0, n: 3, m: 0, hmax: 5.6, bed: 'mulch', seed: 7 },
  { id: 'upper-north', x: 27.25, z: 15.35, y: T2, w: 1.3, d: 2.5, deg: 0, n: 2, m: 0, hmax: 6.0, bed: 'moss', seed: 8 },
  // the crown (T3): trees round the turbine's clearing — both prows and both corners over the upper tier (the stair
  // heads and the overlook over the meadow stay open)
  { id: 'crown-ne', x: 32.5, z: 10.5, y: T3, w: 1.8, d: 1.8, deg: 0, n: 2, m: 0, hmax: 7.0, bed: 'mulch', seed: 10, pts: [[-0.35, -0.3], [0.35, 0.4]] },
  { id: 'crown-se', x: 32.9, z: 0.1, y: T3, w: 1.4, d: 2.0, deg: 0, n: 2, m: 0, hmax: 6.2, bed: 'moss', seed: 11, pts: [[0, -0.45], [0.05, 0.55]] },
  { id: 'crown-nw', x: 27.45, z: 11.95, y: T3, w: 1.1, d: 3.3, deg: 0, n: 2, m: 0, hmax: 7.2, bed: 'mulch', seed: 12 },
  { id: 'crown-sw', x: 27.5, z: -2.1, y: T3, w: 1.2, d: 3.0, deg: 0, n: 2, m: 0, hmax: 6.4, bed: 'moss', seed: 13 },
  // the band (T1) along the meadow: stands against the upper tier's wall, the lane open beside them
  { id: 'band-s', x: 18.68, z: -9.25, y: T1, w: 1.55, d: 2.7, deg: 0, n: 2, m: 1, hmax: 5.2, bed: null, seed: 14, pts: [[0, -0.55], [0.05, 0.75]], spts: [[-0.25, -1.5]] },
  { id: 'band-m', x: 18.68, z: 12.8, y: T1, w: 1.55, d: 3.2, deg: 0, n: 2, m: 1, hmax: 5.4, bed: null, seed: 15, pts: [[0, -0.7], [0.05, 0.6]], spts: [[-0.3, 1.75]] },
  { id: 'band-n', x: 18.2, z: 17.9, y: T1, w: 2.45, d: 4.0, deg: 0, n: 3, m: 1, hmax: 6.0, bed: null, seed: 16, pts: [[0.45, -1.1], [-0.3, -0.1], [0.5, 0.95]], spts: [[-0.55, 1.35]] },
  // the north strip (T1, Bravo's right lane): the corner under the upper tier's wall east of the track, the stand
  // north of the strip pod (clear of the track and the pod's hedge)
  { id: 'strip-ne', x: 27.2, z: 21.85, y: T1, w: 1.6, d: 3.1, deg: 0, n: 2, m: 0, hmax: 7.0, bed: 'mulch', seed: 17 },
  // the stretch's nursery: the strip's reservoir edge (Bravo's right lane through its nursery; the west strip's twin is
  // Alpha's), the lobe's edge either side of the turbine's bay
  { id: 'bank-n', x: 26.5, z: 32.2, y: NT, w: 1.8, d: 2.9, deg: 0, n: 3, m: 1, hmax: 7.4, bed: 'mulch', seed: 19 },
  { id: 'bank-s', x: 24.1, z: 36.95, y: NT, w: 4.2, d: 1.6, deg: 60, n: 3, m: 1, hmax: 7.0, bed: 'moss', seed: 22 },
  { id: 'nlobe-n', x: 19.95, z: -27.8, y: T1, w: 1.3, d: 3.0, deg: 0, n: 2, m: 1, hmax: 6.8, bed: 'moss', seed: 20 },
];
// stepping-stone trails (level pads 8 cm proud of the lawn, 1.0 × 0.8 m, every 1.35 m along a polyline) — the south
// lobe: from the band's junction to the hill ramp's foot, and on past the corner grove to the lobe stair
export const TRAIL_H = 0.08;
function pads(pts, y, step = 1.35) {
  const out = [];
  let carry = step / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), deg = (Math.atan2(-(bz - az), bx - ax) * 180) / Math.PI;
    let s = carry;
    for (; s <= L; s += step) out.push({ x: +(ax + ((bx - ax) * s) / L).toFixed(3), z: +(az + ((bz - az) * s) / L).toFixed(3), y, deg: +deg.toFixed(2) });
    carry = s - L;
  }
  return out;
}
export const TRAILS = [
  ...pads([[17.2, -21.9], [19.6, -19.9], [22.2, -18.4], [23.0, -16.6]], T1),
  ...pads([[25.2, -17.1], [26.9, -15.3], [28.5, -14.1]], T1),
  // (the stretch) the lobe's trail on south through the nursery: along the zone's east edge, past the turbine's bay and
  // the saplings to the channel's end; the strip's, down its lane between the propagation tunnel and the edge's grove
  ...pads([[16.4, -47.2], [17.1, -43.8], [18.2, -40.6], [18.6, -36.8], [18.9, -33.2], [18.7, -30.4], [18.3, -26.8], [17.7, -23.6]], T1),
  ...pads([[17.3, 30.2], [17.0, 33.2], [17.4, 36.6], [16.9, 39.8], [17.2, 42.2]], T1),
];
