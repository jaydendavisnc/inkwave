// Saltpan Basin — stage layout (src/world/stages/saltpan/). The stage owns every file in this folder:
//   layout.js    level geometry (this file)        props.js    prop pack + placements (set dressing)
//   surfaces.js  stage surface materials (texlib)  murals.js   stage decals / signage (mural atlas)
import { PATTERN, B, R, O } from '../../mapkit.js';
import { SURF } from './surfaces.js';

// Saltpan Basin — a working salt works on a sun-baked tidal flat. The OPEN map: low, bright, long sightlines, few tall
// walls, low cover (salt rows and cones, tipper wagons, sluice headstocks, sack stacks). Everything is built from
// crystallising pans: sunken pans (salt crust over pink brine, 0.6 / 0.9 / 1.2 m below the dykes), cracked-mud dykes
// lined with timber revetments, bleached timber boardwalks on posts across the pans (squids slip underneath).
//   • spawn: the loading gallery of the Salt Store (2.4 m) — the barn facade is the back wall; a timber stair straight
//     at the pans, a side ramp to the conveyor yard, open drops to the rail yard
//   • rail yard: a narrow-gauge line with tipper wagons along the front of the store, a spur to the shed dock
//   • right lane (per team, −X for Alpha) "Packing Shed": the timber shed with its corrugated roof across the flank —
//     loading dock (1.1 m) facing mid, stacked sacks as steps up to the roof, a boarded loft stair at the back; the
//     roof (3.2–4.2 m) is the flank's real high ground
//   • centre "The Pans": the shallow back pan (−0.6) with its boardwalk, the sluice dyke (Decauville track, sluices),
//     the front pan (−0.9) crossed by a diagonal boardwalk
//   • left lane "Salt Heap": the long heap (2.4 m ridge, walkable 23° slopes; fresh salt at the mid end, the back half
//     under a tyre-weighted tarp) and the conveyor gantry feeding it: an incline from the yard up to the 3.6 m catwalk and
//     the head platform over the heap's mid end (kids jump up to it from the ridge). The strip under the catwalk is
//     braced off (prop colliders), so nobody — bot or kid — ends up underneath the deck
//   • mid: the Great Pan (−1.2) with the wind pump on its timber staging, boardwalks in from each side
//   • the slice (Long Stages, 2026-09-30: 24 m of new land between the pans and the store yard on each half): the
//     brine pump house (No. 2 Pumping Station) and its loading platform (1.5, the strategic point) on the rail spur,
//     the evaporation terraces (four ponds in 0.3 m steps, walkable, up toward the base), the pump dyke along the back
//     pan, the intake quay with its intake bay and salt cones (west), the hopper yard with the tipping siding and weigh
//     house and the cone yard with a stacker (east)
//   • outline: a jagged tidal-flat edge, not a box — a creek cuts in between the office quay and the shed quay (crossed
//     by a diagonal railed causeway), the shed quay juts out past the shed with a 45° cut, the conveyor stage steps out
//     at the base, a sea notch runs beside the heap, the mid dyke ends in a pointed jetty with an inlet beside it, and the
//     pans are staggered (back pan ends 2 m short of the front pan, the Great Pan runs 2 m past both)
// Out-of-play tops (office, store gable, hopper, drive house, vents, lamps, sluices …) are roof colliders in props.js.
// Tower Command builds its own variant (onlyIn / notIn: 'tower', src/world/variants.js): the wind pump stands on a timber
// trestle over the staging so the tower starts underneath it, and the track (src/world/tower-data.js) runs flat along
// the boardwalks and dykes with the clutter on it moved aside (props.js, the end of PLACEMENTS).
const SP = {
  mud: '#cbbb9f', mudDk: '#b9a88b', salt: '#f3ebe8', saltMid: '#f1e3e2', heap: '#e3ded5', tarp: '#5f6a66', timber: '#d6cfc3', timberDk: '#a89c8a',
  store: '#9c6a5b', storeTrim: '#efe9dd', shed: '#b8bdb1', roof: '#9a6b58', office: '#e2cf9f', steel: '#8d969c', spawn: '#d9d2c6', brick: '#bba486',
};
const mud = (o = {}) => ({ color: SP.mud, pattern: SURF.mud, ...o });
const pan = (o = {}) => ({ color: SP.salt, pattern: SURF.salt, ...o });
const wood = (o = {}) => ({ color: SP.timber, pattern: SURF.timber, ...o });

// heights
const P1 = -0.6, P2 = -0.9, P3 = -1.2;
// ramp helper: low point placed so the slab's 0.6 m low-end extension ends exactly on `edge` (roofs, heap slopes)
const rise = (x0, z0, y0, x1, z1, y1) => { const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), a = Math.atan2(y1 - y0, L); return [x0 + (dx / L) * 0.6 * Math.cos(a), y0 + 0.6 * Math.sin(a), z0 + (dz / L) * 0.6 * Math.cos(a)]; };

// 45° chamfer on a convex ground corner (cx, cz): the corner square of size s is left out of the ground boxes and this
// turned slab (9 cm lower, so it tucks under its neighbours) fills the square's inner triangle — the deck edge then runs
// diagonally across the corner. (sx, sz) points from the corner out to sea (±1, ±1).
const chamfer = (cx, cz, s, sx, sz) => O(cx - 0.75 * sx * s, cz - 0.75 * sz * s, s * Math.SQRT2, s / Math.SQRT2, -3, -0.09, (Math.atan2(sz, sx) * 180) / Math.PI, mud({ tag: 'chamfer' }));

// ---- the Long Stages stretch (2026-09-30): each half is D = 24 m longer along the spawn axis (Z). The base — the
// Salt Store, the loading gallery, the rail yard, the office quay and the tidal creek with its causeway — keeps its
// original numbers in BASE below and is moved out as a unit by back(); the new land between it and the mid-side lanes
// (SLICE: the evaporation terraces, the brine pump house and its loading platform, the hopper yard) is authored in
// place. The cut (Alpha's half) follows the seams: the shed quay's back edge (z -26) west of x -18, the back pan's
// back edge (z -30) across the centre, the conveyor stage's back edge (z -41) east of x 14 (the conveyor stays with
// its heap). props.js moves its base placements with the same D.
export const STRETCH = { axis: 'z', d: 24, cut: [[-30, -26], [-18, -26], [-18, -30], [14, -30], [14, -41], [26, -41]] };
const D = STRETCH.d;
const back = (p) => (p.kind === 'box' ? { ...p, min: [p.min[0], p.min[1], p.min[2] - D], max: [p.max[0], p.max[1], p.max[2] - D] }
  : p.kind === 'obox' ? { ...p, center: [p.center[0], p.center[1], p.center[2] - D] }
  : { ...p, low: [p.low[0], p.low[1], p.low[2] - D], high: [p.high[0], p.high[1], p.high[2] - D] });
// the slice's heights: the evaporation terraces step up from the pump dyke toward the base (brine runs down them to
// the pans), the pump house's loading platform stands at wagon-floor height
const E1 = -0.3, E3 = 0.3, E4 = 0.6, STAGE = 1.5;
const pond = (c, o = {}) => ({ color: c, pattern: SURF.salt, ...o });

const SALTPAN = {
  id: 'saltpan',
  bounds: { minX: -30, maxX: 30, minZ: -46 - D, maxZ: 46 + D },
  spawnPads: [[-2, 2.4, -42 - D], [2, 2.4, 42 + D]],
  spawnBarrier: 4.2,
  // match intro: opens on the wind pump over the Great Pan, then pulls back along the centre pans to the spawn gallery
  intro: { from: [10, 10.5, 9], lookFrom: [0, 4.5, -3], toBack: 3.0 },
  // stage-select picture: high three-quarter view from off Alpha's cone yard — the pump house and its terraces in the
  // foreground, the pans and the wind pump beyond, the jagged quays and creeks down both sides
  art: { from: [40, 25, -72], look: [-4, -1, -14], fov: 58 },
  single: [
    // ---- the Great Pan (mid) + the wind pump's timber staging in its middle
    B(-13, 13, -3, P3, -8, 8, pan({ tag: 'great-pan', color: SP.saltMid })),
    B(-3.6, 3.6, P3, 0.08, -3.6, 3.6, wood({ tag: 'pump-staging', mural: [{ n: [0, 1, 0], id: 7 }] })),
  ],
  half: [
    // ================= ground: a jagged tidal-flat outline (no longer a box). Timber-revetted quays step in and out:
    //   west   the packing-shed quay juts out to x −30 (a path round the shed's far side), a 45° cut at its mid end
    //   east   the heap wharf with a sea notch beside the heap, the mid dyke ending in a pointed jetty (x 29) with an
    //          inlet north of it (so each side of mid reads: jetty on one flank, inlet on the other)
    //   (the base — the store yard, the office quay beyond its tidal creek, the causeway — is in BASE below; the new
    //   land between, with its own intake bay (west), slipway notch (east) and chamfered corner, in SLICE)
    //   45° chamfers on the convex corners (chamfer() above)
    B(-18, -12, -3, 0, -30, -26, mud({ tag: 'creek-neck' })),
    B(-30, -12, -3, 0, -26, -15, mud({ tag: 'shed-quay' })),
    chamfer(-30, -11, 4, -1, 1),
    B(-26, -12, -3, 0, -15, -8, mud({ tag: 'dock-yard' })),
    B(9, 26, -3, 0, -30, -24, mud({ tag: 'heap-wharf' })),
    B(9, 24.2, -3, 0, -24, -20, mud({ tag: 'heap-wharf' })),
    B(11, 24.2, -3, 0, -20, -12.2, mud({ tag: 'heap-wharf' })),
    B(11, 26, -3, 0, -12.2, -8, mud({ tag: 'heap-wharf' })),
    chamfer(26, -14, 1.8, 1, -1),
    B(13, 27, -3, 0, -8, -2, mud({ tag: 'mid-jetty' })),
    B(27, 29, -3, 0, -6, -4, mud({ tag: 'mid-jetty' })),
    chamfer(29, -8, 2, 1, -1),
    chamfer(29, -2, 2, 1, 1),
    B(13, 23, -3, 0, -2, 8, mud({ tag: 'mid-dyke' })),

    // ================= centre: the pans
    B(-12, 9, -3, P1, -30, -20, pan({ tag: 'back-pan' })),
    B(-12, 11, -3, 0, -20, -17, mud({ tag: 'sluice-dyke' })),
    B(-12, 11, -3, P2, -17, -10, pan({ tag: 'front-pan' })),
    B(-12, 11, -3, 0, -10, -8, mud({ tag: 'front-dyke' })),
    // boardwalks on posts, 8 cm proud of the dykes they land on (squids slip underneath)
    B(-3.6, -1.8, -0.08, 0.08, -30.4, -19.6, wood({ tag: 'boardwalk', notIn: 'tower' })),
    O(0.9, -13.5, 1.8, 10.6, -0.08, 0.08, -38, wood({ tag: 'boardwalk-diag', notIn: 'tower' })),
    B(1.4, 3.2, -0.08, 0.08, -8.4, -3.6, wood({ tag: 'boardwalk-mid', notIn: 'tower' })),
    B(3.6, 13.4, -0.08, 0.08, -2.6, -0.8, wood({ tag: 'boardwalk-east', notIn: 'tower' })),
    // Tower Command: the three boardwalks its track rides along or crosses the landings of sit no higher than the dykes,
    // so the tower rolls on flat — the ±X and mid ones flush with the dyke tops (ending at the dyke edges), the diagonal
    // one 8 cm down (its ends tuck under the dykes)
    O(0.9, -13.5, 1.8, 10.6, -0.24, -0.08, -38, wood({ tag: 'boardwalk-diag', onlyIn: 'tower' })),
    B(1.4, 3.2, -0.16, 0, -8, -3.6, wood({ tag: 'boardwalk-mid', onlyIn: 'tower' })),
    B(3.6, 13, -0.16, 0, -2.6, -0.8, wood({ tag: 'boardwalk-east', onlyIn: 'tower' })),
    // (and since the stretch the track runs on past the back-pan boardwalk's end onto the pump dyke: that one is flush too)
    B(-3.6, -1.8, -0.16, 0, -30, -20, wood({ tag: 'boardwalk', onlyIn: 'tower' })),
    // plank ramps down into the pans
    R([7.5, P1, -28.4], [7.5, 0, -30], 1.4, wood({ tag: 'pan-ramp', thin: true, thickness: 0.14 })),
    R([-9.5, P2, -12.3], [-9.5, 0, -10], 1.4, wood({ tag: 'pan-ramp', thin: true, thickness: 0.14 })),
    R([-6.5, P3, -4.8], [-6.5, 0, -8], 1.6, wood({ tag: 'pan-ramp', thin: true, thickness: 0.14 })),
    R([9.8, P3, -5.2], [13, P3 + 1.2, -5.2], 1.6, { tag: 'pan-ramp', color: SP.timber, pattern: PATTERN.rampboard, thin: true, thickness: 0.14 }),

    // ================= right lane: the Packing Shed (−X for Alpha)
    // (its back wall takes no ink since the stretch: it faces the intake quay now, not the creek — a squid swimming up it
    // beside the loft stair surfaced under the stair's handrail; the loft stair is the way up at the back)
    B(-26, -15, 0, 3.2, -25, -18, { tag: 'shed', color: SP.shed, pattern: PATTERN.weatherboard, noPaint: [[0, 0, -1]] }),
    R(rise(-20.5, -25, 3.2, -20.5, -21.5, 4.2), [-20.5, 4.2, -21.5], 11, { tag: 'shed-roof', color: SP.roof, pattern: PATTERN.container, mural: [{ n: [0, 0.962, -0.275], id: 5 }] }),
    R(rise(-20.5, -18, 3.2, -20.5, -21.5, 4.2), [-20.5, 4.2, -21.5], 11, { tag: 'shed-roof', color: SP.roof, pattern: PATTERN.container, mural: [{ n: [0, 0.962, 0.275], id: 4 }] }),
    B(-26, -16, 0, 1.1, -18, -15.4, wood({ tag: 'dock', color: SP.timberDk })),
    R([-24, 0, -12.6], [-24, 1.1, -15.4], 1.8, wood({ tag: 'dock-steps' })),
    // loft stair up the back of the shed onto the roof (its foot is on the intake quay now)
    R([-17, 0, -33], [-17, 3.2, -25], 1.8, wood({ tag: 'loft-stair', notIn: 'zones' })),
    // (Zone Control: the same flight, its two sides uninkable — they carry the handrail's rail colliders, and a squid
    // swimming up a side surfaced under the rail: bots got stuck there for seconds while the roof was the objective)
    R([-17, 0, -33], [-17, 3.2, -25], 1.8, wood({ tag: 'loft-stair', noPaint: [[1, 0, 0], [-1, 0, 0]], onlyIn: 'zones' })),
    // Zone Control (src/world/variants.js): the roof is the home side zone, so attackers from mid get ways up on the
    // dock side too — a timber stair up the facade from the dock (1.1) to a landing flush with the eave (3.2) beside
    // the sack pallets (props.js: handrail on the open side, the facade's second door moved out of its way). Routes up
    // from the dock: the stair; hopping the sack pallets stacked against the landing (2.0 / 2.6) onto it or the eave;
    // swimming up the inkable shed front past the pallets or the gables. The defenders keep the loft stair and the rest.
    // (the flight's open side and the landing's front carry the handrail — rail colliders — so those two faces take no
    // ink: a squid swimming up them would surface under the rail; the treads, the landing top and the shed front do)
    R([-16.7, 1.1, -17.24], [-21.5, 3.2, -17.24], 1.5, wood({ tag: 'shed-stair', noPaint: [[0, 0, 1]], onlyIn: 'zones' })),
    B(-23, -21.5, 1.1, 3.2, -18, -16.5, wood({ tag: 'shed-landing', noPaint: [[0, 0, 1]], onlyIn: 'zones' })),
    // … and a second flight of dock steps at the east end, straight up from the yard to the stair's foot (the dock spur
    // stops short at the turntable in this build, props.js)
    R([-16.9, 0, -12.6], [-16.9, 1.1, -15.4], 1.8, wood({ tag: 'dock-steps', onlyIn: 'zones' })),

    // ================= left lane: the Salt Heap + conveyor gantry (+X for Alpha)
    // the heap: fresh salt at the mid end (fed by the conveyor), the older back half under a tarp weighted with tyres
    R(rise(11.8, -16, 0, 17.5, -16, 2.4), [17.5, 2.4, -16], 6, { tag: 'heap', color: SP.heap, pattern: PATTERN.rubber }),
    R(rise(23.2, -16, 0, 17.5, -16, 2.4), [17.5, 2.4, -16], 6, { tag: 'heap', color: SP.heap, pattern: PATTERN.rubber }),
    R(rise(11.8, -22, 0, 17.5, -22, 2.4), [17.5, 2.4, -22], 6, { tag: 'heap-tarp', color: SP.tarp, pattern: PATTERN.rubber }),
    R(rise(23.2, -22, 0, 17.5, -22, 2.4), [17.5, 2.4, -22], 6, { tag: 'heap-tarp', color: SP.tarp, pattern: PATTERN.rubber }),
    B(16, 22.45, 3.35, 3.6, -13, -9.5, { tag: 'gantry-head', color: SP.steel, pattern: PATTERN.metalpanel, notIn: 'tower' }),
    // Tower Command: the head platform's mid edge 0.9 m back (over its moved bent, props.js) — the track turns at
    // checkpoint 1 on the dyke below it, and the tower needs 3.72 m over its base (the head is 3.35 m up)
    B(16, 22.45, 3.35, 3.6, -13, -10.4, { tag: 'gantry-head', color: SP.steel, pattern: PATTERN.metalpanel, onlyIn: 'tower' }),
    B(20, 22.45, 3.35, 3.6, -26, -13, wood({ tag: 'gantry-catwalk' })),
    // the incline up from the tail hopper (the conveyor stays with its heap: the hopper yard below is the slice's east
    // side now)
    R([21.225, 0, -35.6], [21.225, 3.6, -26], 2.45, wood({ tag: 'gantry-incline', thin: true, thickness: 0.25 })),
    // conveyor tail hopper (fed by the tipping siding, props.js)
    B(19.2, 23.2, 0, 1.4, -39.8, -36.8, { tag: 'hopper', color: SP.steel, pattern: PATTERN.metalpanel, noPaint: [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] }),

    // ================= SLICE (new land, 2026-09-30): the evaporation terraces and the brine pump house
    // Sea water comes in at the intake bay (west), the pump house lifts it onto the top terrace, and the brine works down
    // the flight of evaporation ponds (greyer and fresher at the top, pinker as it concentrates) to the crystallising
    // pans at mid. Three ways through (the rail spur past the pump house, the causeway beside the terraces, the hopper
    // yard), two across (the pump dyke along the back pan, and the pump house's loading platform itself); the
    // platform (1.5) is the slice's strategic point: stairs up from the pump dyke and the causeway, a ramp from the
    // base side, the wagons on the spur as steps.
    // -- west: the intake quay round the intake bay (x -30…-26, z -43…-37: sea), the pump house on its east side
    B(-30, -18, -3, 0, -37, -26, mud({ tag: 'intake-quay' })),
    B(-26, -18, -3, 0, -43, -37, mud({ tag: 'intake-quay' })),
    B(-30, -18, -3, 0, -50, -43, mud({ tag: 'intake-quay' })),
    // the brine pump house (No. 2 Pumping Station): brick engine house, its ground-floor walls inkable, everything above
    // out of play (the slate roof and chimney are props, roof-flagged)
    B(-23, -17, 0, 2.8, -45, -39, { tag: 'pump-house', color: SP.brick, pattern: PATTERN.brick }),
    B(-23, -17, 2.8, 5.0, -45, -39, { tag: 'pump-house', color: SP.brick, pattern: PATTERN.brick, paint: false, roof: true }),
    // -- centre: the pump dyke along the back pan (the first link across), the pump yard (the rail spur, the platform,
    //    the causeway down the middle), the four evaporation terraces (0.3 steps: walkable, a carrier's way too)
    B(-18, 13, -3, 0, -33, -30, mud({ tag: 'pump-dyke' })),
    B(-18, 0, -3, 0, -54, -33, mud({ tag: 'pump-yard' })),
    B(0, 13, -3, E1, -38, -33, pond('#f2d2d2', { tag: 'terrace-e1' })),
    B(0, 13, -3, 0, -43, -38, pond('#ecd9c9', { tag: 'terrace-e2' })),
    B(0, 13, -3, E3, -48, -43, pond('#dcdcc4', { tag: 'terrace-e3' })),
    B(0, 13, -3, E4, -54, -48, pond('#cddbd0', { tag: 'terrace-e4' })),
    R([7, 0, -57], [7, E4, -54], 2.4, { tag: 'terrace-ramp', color: SP.timber, pattern: PATTERN.rampboard }),
    // the loading platform (the strategic point): a timber stage at wagon-floor height along the spur, the pump's
    // header tank on it; stairs from the pump dyke (north) and the causeway (east), a cleated ramp from the pump yard
    // (south, the base side)
    B(-12.5, -4, 0, STAGE, -44, -37, wood({ tag: 'pump-stage', color: SP.timberDk })),
    R([-8.5, 0, -33.2], [-8.5, STAGE, -37], 3.0, wood({ tag: 'stage-stair', noPaint: [[1, 0, 0], [-1, 0, 0]] })),
    R([-0.3, 0, -38.2], [-4, STAGE, -38.2], 1.6, wood({ tag: 'stage-steps' })),
    R([-11.5, 0, -51], [-11.5, STAGE, -44], 2.0, { tag: 'stage-ramp', color: SP.timber, pattern: PATTERN.rampboard }),
    // -- east: the hopper yard (the tipping siding, the weigh house) and the cone yard (salt cones, the stacker), a
    //    slipway notch (x 24…26, z -50…-45), a chamfered corner
    B(13, 26, -3, 0, -45, -30, mud({ tag: 'hopper-yard' })),
    B(13, 24, -3, 0, -50, -45, mud({ tag: 'hopper-yard' })),
    B(13, 26, -3, 0, -54, -50, mud({ tag: 'hopper-yard' })),
    B(14, 26, -3, 0, -63, -54, mud({ tag: 'cone-yard' })),
    B(14, 24, -3, 0, -65, -63, mud({ tag: 'cone-yard' })),
    chamfer(26, -65, 2, 1, -1),

    // ================= BASE (moved out by D, back()): the store yard, the office quay beyond its tidal creek, the
    // causeway, the spawn
    ...[
      B(-18, 14, -3, 0, -46, -30, mud({ tag: 'yard' })),
      B(-26, -18, -3, 0, -46, -38, mud({ tag: 'office-quay' })),
      // diagonal causeway boardwalk over the creek: office quay → intake quay (railed both sides, see props.js)
      O(-23.7, -32, 1.8, 14.6, -0.08, 0.08, -28.7, wood({ tag: 'causeway' })),
      // spawn: loading gallery of the Salt Store (the barn facade is the back wall)
      B(-12, 8, 0, 5.4, -46, -45.4, { tag: 'store-facade', color: SP.store, pattern: PATTERN.weatherboard, noPaint: [[0, 0, 1]] }),
      B(-26, -12, 0, 0.9, -46, -45.5, wood({ tag: 'sea-wall', color: SP.timberDk })),
      B(8, 14, 0, 0.9, -46, -45.5, wood({ tag: 'sea-wall', color: SP.timberDk })),
      B(-9, 5, 0, 2.2, -45.4, -38.5, wood({ tag: 'gallery-body', color: SP.timberDk })),
      B(-9, 5, 2.2, 2.4, -45.4, -38.5, wood({ tag: 'gallery-deck', color: SP.spawn, mural: [{ n: [0, 1, 0], id: 6 }] })),
      R([-2, 0, -32.4], [-2, 2.4, -38.5], 5, wood({ tag: 'gallery-stair' })),
      R([11.4, 0, -43.6], [5, 2.4, -43.6], 3, { tag: 'gallery-ramp', color: SP.timber, pattern: PATTERN.rampboard }),
      // works office in the corner (out of play: walls take no ink, its roof slides you off — see props.js)
      B(-25.5, -19, 0, 2.8, -45.5, -40.5, { tag: 'office', color: SP.office, pattern: PATTERN.weatherboard, noPaint: [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] }),
    ].map(back),
  ],
  decor: {
    lamps: [],
    palms: [],
    flags: [[-8.2, 2.4, -44.8 - D], [4.2, 2.4, -44.8 - D]],
  },
};

export const LAYOUT = SALTPAN;
