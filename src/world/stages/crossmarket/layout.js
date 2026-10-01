// Crossroads Market — stage layout (src/world/stages/crossmarket/). The stage owns every file in this folder:
//   layout.js    level geometry (this file)        props.js    prop pack + placements (set dressing)
//   surfaces.js  stage surface materials (texlib)  murals.js   stage decals / signage (mural atlas)
import { PATTERN, B, R, O } from '../../mapkit.js';
import { SURF } from './surfaces.js';

// Crossroads Market — the market quarter of an old harbour town where Market Street (along Z, spawn to spawn) crosses
// Tram Street at an angle: the tramway runs DIAGONALLY through the town (≈31° off the X axis, through the centre) so
// the crossroads is an X. The cast-iron-and-glass Market Hall sits on the crossing turned square to the tramway, with
// the No. 3 tram standing under its clock lantern; the blocks either side are cut into wedges by the diagonal, leaving
// small wedge plazas; the tramway runs out onto a pier at each end over the harbour, and a dock basin cuts in beside it.
// The CLOSE-QUARTERS map: short sightlines, corners, alleys and covered ways, height from a gallery and a roof terrace.
//   • spawn: the Corn Exchange's first-floor terrace (2.6) — grand stair down to Exchange Square and a side flight on
//     either hand (the Arcade Gallery, an iron veranda at first floor, used to leave the terrace's right end: since the
//     stretch it runs from the butcher's corner to the hall end)
//   • centre lane: Market Street — the fountain, an island row of stalls, then the hall's corner: the street splits
//     round it, into the hall (stalls, the tram as cover; its roof is squid-only high ground) or along the tramway
//   • right lane (−X for Alpha): Fish Lane beside the covered fish-market arcade, out to the tramway where it runs
//     onto its pier; the wedge-shaped fish court between the butcher's and the florist's (turned to the tramway) cuts
//     through to Market Street, with an iron stair up to the gallery
//   • left lane (+X for Alpha): the flank street under the café roof terrace (2.6, stairs at both ends, a bridge over
//     the Market Passage) and the Parade (1.2) along the harbour, down to the dock basin; the flank street runs on
//     past the half line to cross the tramway
//   • the new block (Long Stages, 2026-09-30: 24 m of Market Street between the old square and Exchange Square on each
//     half): the Butter Cross square (the market cross's raised floor, 1.2, is the strategic point), Herring Passage
//     through the west range from Fish Lane, Butter Row through the east range to the flank street, the Butter Market
//     arcade on the harbour, the net loft and the harbour steps on Fish Lane, an open band of stalls in front of the
//     butcher's, the bakery and the roof terrace; the Arcade Gallery now comes down into the square
// Heights: 0 (setts) · 0.1 (tramway bed + hall floor) · 0.15 (pavements, arcade) · 0.3 (tram stop) · 1.2 (Parade, cross)
// · 2.6 (spawn, gallery, terrace) · 3.0 (tram roof). Buildings above their ground floors are out of play (paint: false,
// roof: true); every railing is a `rail` (props).

const FL = 2.6;   // first-floor level: spawn terrace, veranda, roof terrace
const TC = 'tower';   // Tower Command-only pieces (onlyIn / notIn, src/world/variants.js)
const K = 0.15;   // pavement kerb
const CM = {
  setts: '#a39a8e', flags: '#d3c8b3', ashlar: '#dccfb2', rose: '#d8b9a2', ochre: '#d9ae6c', blue: '#a9bcc4', cream: '#e8dfcc',
  brick: '#b8765c', spawn: '#eae6de', step: '#d6ccb6', iron: '#3c5a4c', tramGreen: '#3f6b55', tramCream: '#ece2c8',
  timber: '#9c7a56',
};
// a building: paintable ground floor (0 … FL) + upper storeys that take no ink (FL … eave) with an off-limits top
// (roof: never inked, anyone landing there slides off; the pitched roofs above are prop colliders, also roof-flagged)
const bldg = (x0, x1, z0, z1, eave, color, pattern = SURF.ashlar, o = {}) => [
  B(x0, x1, 0, FL, z0, z1, { color, pattern, ...o }),
  B(x0, x1, FL, eave, z0, z1, { color, pattern, paint: false, roof: true, ...o }),
];

// the tramway frame: u along the tram line (through the origin, rising toward +X +Z), v across it (+v toward +Z)
export const TH = Math.atan(0.6);                       // ≈ 30.96° off the X axis
const CT = Math.cos(TH), ST = Math.sin(TH), DEG = (-TH * 180) / Math.PI;
export const T = (u, v) => [u * CT - v * ST, u * ST + v * CT];          // tramway frame → world (x, z)
// box in the tramway frame: u0…u1 along the line, v0…v1 across (a turned piece)
const TB = (u0, u1, y0, y1, v0, v1, o) => { const [cx, cz] = T((u0 + u1) / 2, (v0 + v1) / 2); return O(cx, cz, u1 - u0, v1 - v0, y0, y1, DEG, o); };
const BED = 0.1;                                         // tramway bed + hall floor sit 10 cm proud of the setts
const TW = 4;                                            // tramway half-width (track + setts to the kerbs)

// ---- the Long Stages stretch (2026-09-30): each half is D = 24 m longer along Market Street (Z). The base — the Corn
// Exchange, its spawn terrace and stairs, the two corner buildings and Exchange Square in front of them — keeps its
// original numbers in BASE below and is moved out as a unit by back(); the new block between it and the old square
// (SLICE: the Butter Cross square, Herring Passage, Butter Row, the Shambles arcade on the harbour) is authored in
// place. The cut runs straight across at z -29 (Alpha's half), between the spawn stairs' feet and the fronts of the
// butcher's, the bakery and the roof terrace; the Fish Lane arcade, the Parade and the roof terrace stay with mid (their
// base-side stairs now land in the slice). props.js moves its base placements with the same D.
export const STRETCH = { axis: 'z', d: 24, cut: -29 };
const D = STRETCH.d;
const back = (p) => (p.kind === 'box' ? { ...p, min: [p.min[0], p.min[1], p.min[2] - D], max: [p.max[0], p.max[1], p.max[2] - D] }
  : p.kind === 'obox' ? { ...p, center: [p.center[0], p.center[1], p.center[2] - D] }
  : { ...p, low: [p.low[0], p.low[1], p.low[2] - D], high: [p.high[0], p.high[1], p.high[2] - D] });
const XF = 1.2;                                          // the Butter Cross's raised floor

const CROSSMARKET = {
  id: 'crossmarket',
  bounds: { minX: -31, maxX: 31, minZ: -44 - D, maxZ: 44 + D },
  spawnPads: [[0, FL, -40.2 - D], [0, FL, 40.2 + D]],
  spawnBarrier: 4.2,
  // match intro: opens over the plaza by the hall's corner, on the clock lantern, then sweeps back to your spawn
  intro: { from: [16, 14, -16], lookFrom: [0, 4, 0], toBack: 3.0 },
  // stage-select picture: from over the tramway's pier, down the diagonal tram line to the hall + its clock lantern
  art: { from: [34, 15.5, 18.5], look: [0, 3.2, -4], fov: 54 },
  single: [
    // the No. 3 tram standing at the Market Hall stop, right under the crossing, turned with the tramway: double-ended
    // (self-symmetric), bottle-green rocker panels under a cream saloon, rounded cab ends; its roof is squid-only
    // (Tower Command: the tram has gone — the tower starts on its spot and rides the tram line out of the hall)
    TB(-5, 5, 0, 1.15, -1.2, 1.2, { color: CM.tramGreen, pattern: PATTERN.hullpaint, tag: 'tram-lower', notIn: TC }),
    TB(-5, 5, 1.15, 3.0, -1.2, 1.2, { color: CM.tramCream, pattern: PATTERN.hullpaint, tag: 'tram-upper', notIn: TC }),
    TB(5, 5.6, 0, 3.0, -0.9, 0.9, { color: CM.tramCream, pattern: PATTERN.hullpaint, tag: 'tram-cab', notIn: TC }),
    TB(-5.6, -5, 0, 3.0, -0.9, 0.9, { color: CM.tramCream, pattern: PATTERN.hullpaint, tag: 'tram-cab', notIn: TC }),
  ],
  half: [
    // ================= ground: the setts (axis blocks); a dock basin cuts in between the tramway pier and the other
    // team's Parade (x -24 … -15), so each flank street ends at the water and bends onto the diagonal tramway
    B(-24, 24, -1.2, 0, -29, -20, { color: CM.setts, pattern: SURF.setts, tag: 'streets' }),
    B(-15, 24, -1.2, 0, -20, 0, { color: CM.setts, pattern: SURF.setts, tag: 'streets' }),
    B(-19.5, -15, -1.2, 0, -20, -7.05, { color: CM.setts, pattern: SURF.setts, tag: 'streets' }),
    B(-24, -19.5, -1.2, 0, -20, -16.3, { color: CM.setts, pattern: SURF.setts, tag: 'streets' }),

    // ================= the tramway (turned): track strip + setts to the kerbs, 10 cm proud, running out onto a pier
    // over the harbour at each end; the Market Hall's flagged floor where it crosses the hall (mosaic thresholds)
    TB(-33, 0, -1.2, BED, -1.25, 1.25, { color: CM.setts, pattern: SURF.tramway, tag: 'tramway' }),
    // the pier's deck slab under the raised bed (top -0.1, 5 cm inside it: fully hidden) — what the sea masking, foam and
    // pilings read as the deck outline where the tramway runs out over the water
    TB(-32.95, 0, -1.2, -0.1, -TW + 0.05, TW - 0.05, { color: CM.setts, pattern: SURF.setts, tag: 'tramway-deck' }),
    TB(-33, -9, -1.2, BED, 1.25, TW, { color: CM.setts, pattern: SURF.setts, tag: 'tramway-setts' }),
    TB(-33, -9, -1.2, BED, -TW, -1.25, { color: CM.setts, pattern: SURF.setts, tag: 'tramway-setts' }),
    TB(-4.5, 0, -1.2, BED, -7, -6, { color: CM.flags, pattern: SURF.ashlar, tag: 'hall-floor', mural: [{ n: [0, 1, 0], id: 7 }] }),
    TB(-4.5, 0, -1.2, BED, 6, 7, { color: CM.flags, pattern: SURF.ashlar, tag: 'hall-floor', mural: [{ n: [0, 1, 0], id: 7 }] }),
    TB(-9, -4.5, -1.2, BED, -7, -6, { color: CM.flags, pattern: SURF.ashlar, tag: 'hall-floor' }),
    TB(-9, -4.5, -1.2, BED, 6, 7, { color: CM.flags, pattern: SURF.ashlar, tag: 'hall-floor' }),
    TB(-9, 0, -1.2, BED, -6, -1.25, { color: CM.flags, pattern: SURF.ashlar, tag: 'hall-floor' }),
    TB(-9, 0, -1.2, BED, 1.25, 6, { color: CM.flags, pattern: SURF.ashlar, tag: 'hall-floor' }),
    // tram stop platform on the tramway's kerb (shelter + flag are props)
    TB(13, 21, 0, 0.3, -3.9, -2.3, { color: CM.flags, pattern: SURF.ashlar, tag: 'tram-platform' }),

    // ================= right flank (−X): Fish Lane + the arcade under the sea-front row (ends at the tramway)
    B(-24, -23.2, 0, 2.8, -36, -20, { color: CM.cream, pattern: SURF.ashlar, tag: 'arcade-back' }),
    B(-23.2, -19.4, 0, K, -36, -20, { color: CM.flags, pattern: SURF.ashlar, tag: 'arcade-floor' }),
    ...[-35.9, -32.1, -28.3, -24.5, -20.7].map((z) => B(-20.2, -19.4, K, 2.8, z, z + 0.7, { color: CM.cream, pattern: SURF.ashlar, tag: 'arcade-pier' })),
    B(-24, -19.4, 2.8, 8.2, -36, -20, { color: CM.cream, pattern: SURF.ashlar, paint: false, roof: true, tag: 'arcade-upper' }),

    // ================= right block (−X): R2 (south, square to Market Street), the wedge-shaped fish court, R1 (north,
    // turned to the tramway); the veranda over Market Street
    // (walls under the gallery / the passage bridge take no ink: an ink-climb there only hits the ceiling)
    B(-15, -6, 0, FL, -28, -23, { color: CM.rose, pattern: SURF.ashlar, tag: 'R2', noPaint: [[1, 0, 0]] }),
    B(-15, -6, FL, 8.0, -28, -23, { color: CM.rose, pattern: SURF.ashlar, paint: false, roof: true, tag: 'R2', mural: [{ n: [-1, 0, 0], id: 5 }] }),
    TB(-19.9, -12.9, 0, FL, -9.2, -TW, { color: CM.blue, pattern: PATTERN.render, tag: 'R1' }),
    TB(-19.9, -12.9, FL, 7.6, -9.2, -TW, { color: CM.blue, pattern: PATTERN.render, paint: false, roof: true, tag: 'R1' }),
    B(-6, -3.8, 0, K, -28, -12, { color: CM.flags, pattern: SURF.ashlar, tag: 'pavement', notIn: TC }),
    // the Arcade Gallery: since the stretch it no longer reaches the spawn terrace (that would be a 40 m high road from
    // the spawn to mid over the new block) — it runs from the butcher's corner to the hall end, with an iron stair
    // at each end: down to the Butter Cross square (south) and to Market Street by the hall (north)
    B(-6, -3.8, 2.3, FL, -29, -19, { color: CM.iron, pattern: PATTERN.planks, tag: 'veranda', notIn: TC }),
    R([-4.9, 0, -12.8], [-4.9, FL, -19], 2.2, { color: CM.iron, pattern: PATTERN.treads, thin: true, thickness: 0.22, tag: 'veranda-stair', notIn: TC }),
    // (the space under it is a boarded store, stepped up under the treads: a bot wedged itself 14 s in the open wedge)
    ...[[-19, -18.1], [-18.1, -17.2], [-17.2, -16.3], [-16.3, -15.4], [-15.4, -14.5]].map(([z0, z1]) => B(-5.95, -3.85, K, (FL * (-12.8 - z1)) / 6.2 - 0.26, z0, z1, { color: CM.timber, pattern: PATTERN.planks, paint: false, tag: 'understair', notIn: TC })),
    R([-4.9, 0, -35.2], [-4.9, FL, -29], 2.2, { color: CM.iron, pattern: PATTERN.treads, thin: true, thickness: 0.22, tag: 'veranda-stair' }),
    ...[[-29.9, -29], [-30.8, -29.9], [-31.7, -30.8], [-32.6, -31.7], [-33.5, -32.6]].map(([z0, z1]) => B(-5.95, -3.85, 0, (FL * (z0 + 35.2)) / 6.2 - 0.26, z0, z1, { color: CM.timber, pattern: PATTERN.planks, paint: false, tag: 'understair' })),
    R([-12.4, 0, -21.9], [-6, FL, -21.9], 2.0, { color: CM.iron, pattern: PATTERN.treads, thin: true, thickness: 0.22, tag: 'court-stair' }),

    // ================= left block (+X): tall row on Market Street (passage through), roof terrace over the shops
    B(6, 10.5, 0, FL, -28, -21, { color: CM.cream, pattern: PATTERN.render, tag: 'LA', noPaint: [[0, 0, 1]] }),
    B(6, 10.5, 0, FL, -18, -12, { color: CM.cream, pattern: PATTERN.render, tag: 'LB', noPaint: [[0, 0, -1]] }),
    B(6, 10.5, FL, 8.4, -28, -12, { color: CM.cream, pattern: PATTERN.render, paint: false, roof: true, tag: 'L-upper', mural: [{ n: [0, 0, -1], id: 4 }, { n: [0, 0, 1], id: 6 }] }),
    B(10.5, 15, 0, FL, -28, -21, { color: CM.ashlar, pattern: SURF.ashlar, tag: 'terrace-A', noPaint: [[0, 0, 1]] }),
    B(10.5, 15, 0, FL, -18, -16, { color: CM.ashlar, pattern: SURF.ashlar, tag: 'terrace-B', noPaint: [[0, 0, -1]] }),
    B(10.5, 15, 2.2, FL, -21, -18, { color: CM.ashlar, pattern: SURF.ashlar, tag: 'passage-bridge' }),
    // the roof terrace's two stairs: the south one lands in the new block's square now, the hall-end one on the flank
    // street (Tower Command: that one goes, its foot stood on the track)
    R([12.75, 0, -34.2], [12.75, FL, -28], 4.5, { color: CM.step, pattern: PATTERN.stonestep, tag: 'terrace-stair' }),
    R([12.75, 0, -9.8], [12.75, FL, -16], 4.5, { color: CM.step, pattern: PATTERN.stonestep, tag: 'terrace-stair', notIn: TC }),
    B(3.8, 6, 0, K, -28, -12, { color: CM.flags, pattern: SURF.ashlar, tag: 'pavement' }),

    // ================= left flank (+X): the Parade (raised harbour walk) down to the dock basin
    B(19.5, 24, 0, 1.2, -30, -6, { color: CM.flags, pattern: SURF.ashlar, tag: 'parade' }),
    R([21.75, 0, -33], [21.75, 1.2, -30], 4.5, { color: CM.step, pattern: PATTERN.stonestep, tag: 'parade-stair' }),
    R([21.75, 0, -3], [21.75, 1.2, -6], 4.5, { color: CM.step, pattern: PATTERN.stonestep, tag: 'parade-stair' }),

    // ================= SLICE (new, 2026-09-30): the next block of Market Street — the Butter Cross square
    // Between the old square (the fountain) and Exchange Square: a band of open street along the butcher's, the bakery and
    // the roof terrace (their stairs come down into it), then the new block — the west range with Herring Passage through
    // it (from Fish Lane), the Butter Cross square on Market Street, the east range with Butter Row (to the flank street),
    // the Shambles (an arcaded range on the harbour, the flank street's covered side), the net loft and a harbour gap on
    // the Fish Lane side. The Butter Cross's raised floor (1.2, steps east and west, columns and a roof over it) is the
    // strategic point. Routes in: Fish Lane, Market Street round the cross, the flank street; across: the open band,
    // Herring Passage + Butter Row through the cross.
    B(-24, 24, -1.2, 0, -53, -29, { color: CM.setts, pattern: SURF.setts, tag: 'streets' }),
    // the Butter Cross: stone floor on a plinth, steps to the east and west (the roof, columns and furniture are props)
    B(-2.8, 2.8, 0, XF, -47.8, -42.6, { color: CM.ashlar, pattern: SURF.ashlar, tag: 'butter-cross' }),
    R([5.6, 0, -45.2], [2.8, XF, -45.2], 3.2, { color: CM.step, pattern: PATTERN.stonestep, tag: 'cross-steps' }),
    R([-5.6, 0, -45.2], [-2.8, XF, -45.2], 3.2, { color: CM.step, pattern: PATTERN.stonestep, tag: 'cross-steps' }),
    // the west range (the chandler's and the net-maker's) with Herring Passage through it at street level (4 m high: the
    // Tower Command track runs through it), the passage vault under the upper floors
    ...bldg(-15, -8, -53, -47.2, 8.0, CM.ochre, PATTERN.render, { tag: 'WS' }),
    ...bldg(-15, -8, -43.2, -39, 7.8, CM.ochre, PATTERN.render, { tag: 'WN' }),
    B(-15, -8, 4.0, 8.0, -47.2, -43.2, { color: CM.ochre, pattern: PATTERN.render, paint: false, roof: true, tag: 'passage-vault' }),
    // the east range (the dairy and the cheesemonger's), split by the open alley of Butter Row
    ...bldg(8, 15, -53, -47.2, 8.4, CM.blue, PATTERN.render, { tag: 'ES' }),
    ...bldg(8, 15, -43.2, -39, 7.2, CM.rose, SURF.ashlar, { tag: 'EN' }),
    // the Shambles: an arcaded range on the harbour (the flank street's covered side), the mirror of the Fish Lane arcade
    B(23.2, 24, 0, 2.8, -53, -34.2, { color: CM.cream, pattern: SURF.ashlar, tag: 'shambles-back' }),
    B(19.4, 23.2, 0, K, -53, -34.2, { color: CM.flags, pattern: SURF.ashlar, tag: 'shambles-floor' }),
    ...[-52.95, -49.35, -45.75, -42.15, -38.55, -34.95].map((z) => B(19.4, 20.2, K, 2.8, z, z + 0.7, { color: CM.cream, pattern: SURF.ashlar, tag: 'shambles-pier' })),
    B(19.4, 24, 2.8, 8.2, -53, -34.2, { color: CM.cream, pattern: SURF.ashlar, paint: false, roof: true, tag: 'shambles-upper' }),
    // the Fish Lane side: the net loft and a narrow house, a gap between them onto the harbour steps
    ...bldg(-24, -19.4, -53, -45, 8.2, CM.brick, PATTERN.brick, { tag: 'net-loft' }),
    ...bldg(-24, -19.4, -41, -36, 7.4, CM.cream, SURF.ashlar, { tag: 'W2' }),

    // ================= BASE (moved out by D, back()): Exchange Square, the spawn terrace and its three stairs, the two
    // corner buildings
    ...[
      B(-24, 24, -1.2, 0, -44, -29, { color: CM.setts, pattern: SURF.setts, tag: 'streets' }),
      // spawn: the Corn Exchange's first-floor terrace (2.6) — grand stair down to Exchange Square and a side flight each
      // side (the west one where the Arcade Gallery used to leave the terrace)
      B(-9, 9, 0, 2.4, -44, -36, { color: CM.ashlar, pattern: SURF.ashlar, tag: 'spawn-terrace-body' }),
      B(-9, 9, 2.4, FL, -44, -36, { color: CM.spawn, pattern: PATTERN.spawn, tag: 'spawn-terrace' }),
      R([0, 0, -29.8], [0, FL, -36], 4.4, { color: CM.step, pattern: PATTERN.stonestep, tag: 'grand-stair' }),
      R([7, 0, -29.8], [7, FL, -36], 2.8, { color: CM.step, pattern: PATTERN.stonestep, tag: 'side-flight' }),
      R([-7, 0, -29.8], [-7, FL, -36], 2.8, { color: CM.step, pattern: PATTERN.stonestep, tag: 'side-flight' }),
      // back corners either side of the spawn
      ...bldg(9, 24, -44, -36, 8.6, CM.ochre, PATTERN.render, { tag: 'BL' }),
      ...bldg(-24, -9, -44, -36, 9.2, CM.brick, PATTERN.brick, { tag: 'BR' }),
    ].map(back),

    // ================= TOWER COMMAND ONLY (onlyIn: 'tower', src/world/variants.js; Turf War + Zone Control untouched).
    // The track (tower-data.js) on each side runs round the hall's corner, along the front of the tall row, past the
    // café roof terrace's end on the street into the flank street, and on (since the stretch) round the new block: west
    // along the open band to Fish Lane, back east through Herring Passage, over the Butter Cross (checkpoint 2) and
    // along Butter Row, and down the flank street to the goal in Exchange Square.
    // · the roof terrace's stair at its hall end goes (its foot stood on the track): the terrace ends in a plain wall
    //   the squids swim up; it is still reached by its south stair
    // · Market Street's end of the Arcade Gallery stops at z -20.95 (the track passes under where it was) and its
    //   Market Street stair goes; the gallery is still reached from the square and the fish court's iron stair
    B(-6, -3.8, 2.3, FL, -29, -20.95, { color: CM.iron, pattern: PATTERN.planks, tag: 'veranda', onlyIn: TC }),
    // (a dropped kerb in the gallery's pavement where the track crosses it)
    B(-6, -3.8, 0, K, -28, -20.95, { color: CM.flags, pattern: SURF.ashlar, tag: 'pavement', onlyIn: TC }),
    B(-6, -3.8, 0, K, -18.05, -12, { color: CM.flags, pattern: SURF.ashlar, tag: 'pavement', onlyIn: TC }),

    // ================= ZONE CONTROL ONLY (onlyIn: 'zones', src/world/variants.js): the goods landing beside the tram
    // pier (the side zone). The market's hoist stage stands on piles in the dock basin and overhangs the pier edge by
    // 0.9 m, 3 m up (a real, inkable position over the zone). The market lighter lies off its outer side, 4.5 m of
    // water out from the pier (beyond a kid's jump, even off the pier railing), laden with a stepped stack of stock
    // (crossmarket_cargo: the steps are its colliders), boarded by a gangplank from the other team's quay at the foot
    // of their Parade stair. Attackers climb the crates (0.6 / 1.5 / 2.35) onto the stage and drop into the zone. The
    // drop is one way: 3.0 m up from the pier deck, 1.95 m over the pier railing's top (out of a kid's reach), and the
    // stage stands on piles in the water: no wall to ink-climb. Props: landing.js (hull, cargo, piles, crane, rails).
    TB(-27.5, -23.7, 2.8, 3.1, 3.05, 8.25, { color: CM.timber, pattern: PATTERN.planks, tag: 'hoist-stage', onlyIn: 'zones' }),
    TB(-27.2, -20.45, -0.9, -0.3, 8.45, 11.55, { color: CM.timber, pattern: PATTERN.planks, tag: 'lighter-deck', onlyIn: 'zones' }),
    R([-22.85, -0.3, -3.0], [-22.85, 0, 0], 1.3, { color: CM.timber, pattern: PATTERN.rampboard, thin: true, thickness: 0.14, tag: 'gangplank', onlyIn: 'zones' }),
  ],
  decor: { lamps: [], palms: [], flags: [] },
};

export const LAYOUT = CROSSMARKET;
