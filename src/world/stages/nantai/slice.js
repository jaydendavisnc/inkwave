// Mount Nantai — the slice (the Long Stages stretch, stretch.js): the new land on each half between the rehearsal
// hollow / the terraces' fronts (mid's) and the control building (the base's), z −31.5 … −55.5 on Alpha's half (Bravo's
// is the 180° twin). Pure data (mapkit boxes): imported by layout.js (pieces), props.js (the dressing's anchors).
//
// The observatory's older instruments, on the shoulder under the summit:
//   • the Solar Tower (1954) on the shoulder behind the hollow: a white tower-telescope house, the coelostat's turret on
//     its roof (off limits); the ridge path passes west of it
//   • the rock garden: the observatory's alpine garden sunk into the shoulder (1.3, between the ridge and the
//     stargazing terrace): rockery, boulders, dwarf pines, a pool; steps down from the shoulder, the ridge and the back
//   • the Dish Knoll (the strategic point): a granite knoll (2.6) in the middle of the slice, joined to the stargazing
//     terrace, with the 5.6 m radio dish on its concrete pedestal (the dish and the pedestal off limits). Four ways up:
//     the front steps (north, toward mid), the terrace (level, west), the gravel ramp (east), the back steps (south,
//     onto the apron in front of the grand stair). The tower's track climbs the front steps onto its top (its second
//     checkpoint) and leaves it west onto the stargazing terrace
//   • the dish's receiver hut on the first terrace beside the knoll (off-limits roof)
//   • the shore meadow (0) where the first terrace falls to the shore trail: a knoll of turf, boulders, a stair and a ramp
//   • the ridge (2.6), the shoulder (2.6), the stargazing terrace (2.6), the first terrace (1.3), the shore trail (0)
//     all carried on through it: three lanes and the links across the slice
import { PATTERN, B, R } from '../../mapkit.js';
import { SURF } from './surfaces.js';

const G0 = 0, G1 = 1.3, G2 = 2.6, FL = -2.4;
export const SLICE = { z0: -55.5, z1: -31.5 };
export const KNOLL = { x0: -3, x1: 9, z0: -49, z1: -39.3 };
export const SOLAR = { x0: -19, x1: -15, z0: -39, z1: -33.2, h: 3.4 };
// (the stargazing terrace keeps its 2.4 m courses: the garden's edges sit on them)
export const DELL = { x0: -19, x1: -8.6, z0: -50.7, z1: -41.1 };
export const HUT = { x0: 9, x1: 12.6, z0: -41.6, z1: -36.4, h: 2.6 };
export const PEDESTAL = { x0: 3.5, x1: 6.5, z0: -48.6, z1: -45.6, h: 2.2 };
export const ROLL1 = { x0: 5.0, z0: -31.6 };   // roll-off hut no. 1 (3.6 × 3.2, its frame 3.4 m out to the east)
export const GARDEN = { x0: 15, z0: -55.5, z1: -45.5 };   // the shore meadow (0): x 15 … the shore, z −55.5 … −45.5
const K = { turf: '#c3c0b8', granite: '#c9c6bf', graniteDk: '#b7b3aa', stone: '#d6d0c4', concrete: '#c8c5bd', render: '#e8e4da', gravel: '#cfc9bb' };
const turf = (o = {}) => ({ color: K.turf, pattern: SURF.turf, ...o });
const granite = (o = {}) => ({ color: K.granite, pattern: SURF.granite, ...o });
const ashlar = (o = {}) => ({ color: K.stone, pattern: SURF.ashlar, ...o });
const steps = (o = {}) => ({ color: K.stone, pattern: PATTERN.stonestep, ...o });
const gravel = (o = {}) => ({ color: K.gravel, pattern: PATTERN.rampboard, ...o });

const { z0: Z0, z1: Z1 } = SLICE;
export const SLICE_PIECES = [
  // ---------------- the shoulder (2.6) between the ridge and the stargazing terrace: its granite face behind the hollow
  //                  (the hollow's back stair tops out on it), alpine turf over the rest; the Solar Tower on it, the rock
  //                  garden sunk into it
  B(-19, -11, G0, G2, Z1 - 1.2, Z1, granite({ tag: 'shoulder-face' })),
  B(-19, -11, G0, G2, DELL.z1, Z1 - 1.2, turf({ tag: 'shoulder' })),
  B(-19, -11, G0, G2, Z0, DELL.z0, turf({ tag: 'shoulder' })),
  B(SOLAR.x0, SOLAR.x1, G2, G2 + SOLAR.h, SOLAR.z0, SOLAR.z1, { color: K.render, pattern: PATTERN.render, tag: 'solar-tower', roof: true }),
  // ---------------- the stargazing terrace (2.6) carried on (its blocks on the 2.4 m courses from the cut: no seams),
  //                  narrowed beside the rock garden
  B(-11, -3, G0, G2, DELL.z1, Z1, ashlar({ tag: 'west-terrace' })),
  B(DELL.x1, -3, G0, G2, DELL.z0, DELL.z1, ashlar({ tag: 'west-terrace' })),
  B(-11, -3, G0, G2, Z0, DELL.z0, ashlar({ tag: 'west-terrace' })),
  // ---------------- the rock garden (1.3): its floor, the rockery in it (1.95), the steps down into it from the
  //                  shoulder (north), the ridge (west) and the shoulder's back (south)
  B(DELL.x0, DELL.x1, G0, G1, DELL.z0, DELL.z1, turf({ tag: 'rock-garden' })),
  B(-13.4, -10.2, G1, 1.95, -49.2, -45.6, granite({ tag: 'rockery' })),
  R([-11.5, G1, -44.1], [-11.5, G2, DELL.z1], 2.6, steps({ tag: 'garden-steps' })),
  R([-16, G1, -45.4], [DELL.x0, G2, -45.4], 2.4, steps({ tag: 'garden-steps', color: K.granite })),
  R([-15.6, G1, -47.7], [-15.6, G2, DELL.z0], 2.6, steps({ tag: 'garden-steps' })),
  // ---------------- the first terrace (1.3) carried on: west of the knoll's east face, and the east yard's side (to the
  //                  alpine garden's edge)
  B(-3, 9, G0, G1, Z0, Z1, ashlar({ tag: 't1' })),
  B(9, 17.5, G0, G1, GARDEN.z1, Z1, ashlar({ tag: 't1' })),
  B(9, GARDEN.x0, G0, G1, Z0, GARDEN.z1, ashlar({ tag: 't1' })),
  // ---------------- the Dish Knoll (2.6) on the terrace: granite, joined to the stargazing terrace on its west
  B(KNOLL.x0, KNOLL.x1, G1, G2, KNOLL.z0, KNOLL.z1, granite({ tag: 'knoll', color: K.graniteDk })),
  // its front steps (toward mid: the tower's way up, 5 m wide for its 2.5 m platform), its back steps (onto the apron in
  // front of the grand stair), the gravel ramp up its east side
  R([3, G1, -35.6], [3, G2, KNOLL.z1], 5, steps({ tag: 'knoll-steps' })),
  R([0, G1, -52.2], [0, G2, KNOLL.z0], 4.4, steps({ tag: 'knoll-steps' })),
  R([12.5, G1, -47.3], [KNOLL.x1, G2, -47.3], 3.4, gravel({ tag: 'knoll-ramp' })),
  // a stone parapet along the knoll's front either side of the steps (cover looking down the terrace toward mid)
  B(KNOLL.x0, 0.5, G2, G2 + 0.95, KNOLL.z1 - 0.6, KNOLL.z1, ashlar({ tag: 'knoll-parapet', perch: true })),
  B(5.5, KNOLL.x1, G2, G2 + 0.95, KNOLL.z1 - 0.6, KNOLL.z1, ashlar({ tag: 'knoll-parapet', perch: true })),
  // the dish's concrete pedestal (the dish is a prop over it: both off limits)
  B(PEDESTAL.x0, PEDESTAL.x1, G2, G2 + PEDESTAL.h, PEDESTAL.z0, PEDESTAL.z1, { color: K.concrete, pattern: PATTERN.concrete, tag: 'dish-pedestal', roof: true }),
  // the receiver hut beside the knoll (its walls ink; its roof is off limits)
  B(HUT.x0, HUT.x1, G1, G1 + HUT.h, HUT.z0, HUT.z1, { color: K.concrete, pattern: PATTERN.concrete, tag: 'dish-hut', roof: true }),
  // ---------------- the shore meadow (0): a stair down into it from the terrace's edge, a gravel ramp from the strip by
  //                  the knoll; a turf knoll in its middle (0.65)
  R([16.25, G0, -48.7], [16.25, G1, GARDEN.z1], 2.5, steps({ tag: 'garden-stair' })),
  R([18.4, G0, -51.6], [GARDEN.x0, G1, -51.6], 2.6, gravel({ tag: 'garden-ramp' })),
  B(19.2, 23.0, G0, 0.65, -54.6, -51.2, turf({ tag: 'meadow-knoll' })),
  // ---------------- on the first terrace's front (beside the tower's runs across it): roll-off hut no. 1, where the
  //                  terrace lost no. 2 to the base's move (its walls ink, its roof is off limits)
  B(ROLL1.x0, ROLL1.x0 + 3.6, G1, 3.9, ROLL1.z0, ROLL1.z0 + 3.2, { color: '#e8e2d4', pattern: PATTERN.weatherboard, tag: 'rolloff-hut', roof: true }),
  // ---------------- the shore trail ↔ the first terrace: a stair up from the trail's narrows past the hut
  R([20.6, G0, -40.2], [17.5, G1, -40.2], 2.6, steps({ tag: 'shore-steps' })),
];
void FL;
