// Mount Nantai — stage layout (src/world/stages/nantai/). The stage owns every file in this folder:
//   layout.js    level geometry, zones, tower track, environment (this file)
//   props.js     prop pack + placements (set dressing)        surfaces.js  stage surface materials (texlib)
//   murals.js    stage decals / signage (mural atlas)         backdrop.js  the far scenery round the arena
import { PATTERN, B, R, O, OCT } from '../../mapkit.js';
import { SURF } from './surfaces.js';
import { buildBackdrop } from './backdrop.js';
import { MURAL } from './murals.js';
import { BS, BN, zAt, LAWN_E, LAWN_W, BASE, RIDGE, RIDGE_EDGE, fill } from './ground.js';
import { ST, sz, shiftDef } from './stretch.js';
import { SLICE_PIECES } from './slice.js';

// ------------------------------------------------------------------------------------------------------------
// Mount Nantai — the Nantai Observatory grounds on the summit shoulder, a promontory of granite in the tarn below the
// summit. The Nantai Brook runs out of the tarn across the grounds twice (one reach per half), so every push is a
// crossing. Alpha at −Z (the half list), Bravo is the 180° twin.
// Levels: G0 lawn / banks / shore 0 · bridge crown 0.8 · G1 first terrace, weir crest, rehearsal hollow 1.3 ·
//         G2 west terrace + ridge 2.6 · G3 spawn (the forecourt on the control building's roof) 3.8.
// The Long Stages stretch (2026-09-30, stretch.js + slice.js): the base side of each half moved out 24 m past the
// rehearsal hollow (the cut, z −31.5 on Alpha's), and the slice between is the observatory's shoulder — the Solar Tower,
// the Dish Knoll with the radio dish (the strategic point), the receiver hut, the alpine garden; the ridge, the
// stargazing terrace, the first terrace and the shore trail carried on through it. The numbers below are the drawing
// before the stretch: every piece whose centre lies beyond the cut is moved by shiftDef at the end of the half list.
//   • spawn: the dome's forecourt on the control building (G3). Exits: the grand stair (mid), a drop onto the west
//     terrace (right), the side stair down the building's east face to the east yard (left).
//   • right lane (−X for Alpha) "the Ridge": a granite spine (G2) along the tarn cliff to the viewing platform at its
//     nose; a boardwalk down onto the weir's crest (G1) → the lawn's west end. Beside it the rehearsal hollow (G1) with
//     Pearl's rock (2.4) between the ridge and the west terrace (G2).
//   • mid: the grand stair → the first terrace (G1) → steps cut along its wall → the bank → the Old Stone Bridge.
//     Or the west terrace's long flight straight down to the bridge head.
//   • left lane (+X) "the Shore": the east yard (G1) and the tarn shore trail (G0) to the log bridge.
//   • centre: the star-party lawn between the two brooks.
// ------------------------------------------------------------------------------------------------------------
const G0 = 0, G1 = 1.3, G2 = 2.6, G3 = 3.8, FL = -2.4;
const K = {
  turf: '#c3c0b8', gravel: '#cfc9bb', graniteLt: '#d3d0c9', granite: '#c9c6bf', graniteDk: '#b7b3aa', stone: '#d6d0c4', spawn: '#eae6de',
  timber: '#b58d66', concrete: '#c8c5bd', build: '#d8d1c3',
};
const turf = (o = {}) => ({ color: K.turf, pattern: SURF.turf, ...o });
const gravel = (o = {}) => ({ color: K.graniteLt, pattern: SURF.granite, ...o });   // the brook's granite shelves
const granite = (o = {}) => ({ color: K.granite, pattern: SURF.granite, ...o });
const timber = (o = {}) => ({ color: K.timber, pattern: PATTERN.wood, ...o });
const ashlar = (o = {}) => ({ color: K.stone, pattern: SURF.ashlar, ...o });
const steps = (o = {}) => ({ color: K.stone, pattern: PATTERN.stonestep, ...o });
const DEG = 180 / Math.PI;

export { BS, BN, zAt };
// ============================================================================================================
// The ground: the promontory's regions (ground.js) filled as columns with granite ledges along every slanted edge —
// the brook's banks (bars) and the tarn shore (the outline: bays, points, the cut corners behind the spawns)
// ============================================================================================================
const onBank = (pl, p) => Math.abs(zAt(pl, p[0]) - p[1]) < 0.02;
const bankW = (pl, a, b) => { const x = (a[0] + b[0]) / 2; if (x < -8) return 1.3; if (x < 19) return pl === BS ? 1.2 : 1.3; return 1.6; };
const inRidge = (p) => RIDGE_EDGE.some((q) => Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6);
const shoreLedge = () => granite({ tag: 'shore-ledge' });
const barLedge = () => granite({ color: K.graniteLt, tag: 'bar' });
function ledgeFor(pl) {
  return (i, a, b) => {
    if (pl && onBank(pl, a) && onBank(pl, b)) return { w: bankW(pl, a, b), mk: barLedge };
    return { w: 1.2, mk: shoreLedge };
  };
}
const GROUND_LAWN_E = fill(LAWN_E, { y0: FL, top: G0, mk: () => turf({ tag: 'lawn-e' }), ledge: ledgeFor(BN) });
const GROUND_LAWN_W = fill(LAWN_W, { y0: FL, top: G0, mk: () => turf({ tag: 'lawn-w' }), ledge: ledgeFor(BN) });
const GROUND_BASE = fill(BASE, { y0: FL, top: G0, mk: () => turf({ tag: 'bank' }), ledge: (i, a, b) => (inRidge(a) && inRidge(b) ? { w: 1.3, skip: true } : ledgeFor(BS)(i, a, b)) });
const GROUND_RIDGE = fill(RIDGE, { y0: G0, top: G2, mk: () => granite({ tag: 'ridge' }), ledge: () => ({ w: 1.3, mk: () => granite({ tag: 'ridge-cliff' }) }) });
const GROUNDS = [GROUND_LAWN_E, GROUND_LAWN_W, GROUND_BASE, GROUND_RIDGE];
// the ledges' footprints (props.js nantai_foot: hidden slabs so the environment's deck outline — the tarn's edge rocks,
// its foam — follows the true shore, not the columns' steps under the ledges)
export const LEDGE_FEET = GROUNDS.flatMap((g) => g.feet);

// ============================================================================================================
// Pieces (Alpha's half)
// ============================================================================================================
// the ground: the lawn's two ends, the base side, the ridge (columns + ledges; their outlines are stretched in ground.js)
const GROUND = GROUNDS.flatMap((g) => [...g.cols, ...g.ledges]);
const HALF = [
  // dry-stone walls on the lawn (the centre zone's cover, with the Dobsonians' crates)
  B(-6.3, -2.9, G0, 0.95, -4.1, -3.4, granite({ tag: 'drystone-wall', color: K.graniteDk })),

  // ---------------- spawn: the forecourt on the control building (G3), the dome behind
  B(-9, 9, G0, G3 - 0.2, -45.4, -36.5, ashlar({ color: K.graniteDk, tag: 'control-building' })),
  B(-9, 9, G3 - 0.2, G3, -45.4, -36.5, { color: K.spawn, pattern: PATTERN.spawn, tag: 'forecourt' }),
  B(3, 9, G3, G3 + 0.75, -37.1, -36.5, { color: K.build, pattern: PATTERN.render, tag: 'forecourt-parapet' }),
  // the control room: the timber-and-steel upper storey at the forecourt's east corner (weather mast on its roof)
  B(5.4, 9, G3, 6.4, -45.4, -42.2, { color: '#8f7a64', pattern: PATTERN.weatherboard, tag: 'control-room', roof: true }),
  // the dome's drum (the dome itself is a prop) behind the forecourt
  B(-9, 9, G3, 7.2, -46, -45.4, { color: '#eceae4', pattern: PATTERN.render, tag: 'dome-drum', roof: true }),
  R([0, G1, -30.2], [0, G3, -36.5], 6, steps({ tag: 'grand-stair' })),
  // east side stair down the building's face to the east yard (G1)
  B(9, 11.2, G1, G3, -45.4, -44.4, ashlar({ tag: 'east-landing' })),
  R([10.1, G1, -38.1], [10.1, G3, -44.4], 2.2, steps({ tag: 'east-stair' })),

  // ---------------- the first terrace (G1): the front of the observatory, the east yard, the shelf over the log reach
  // (split on the cut: the fronts stay, the backs go with the building; x split on a 2.4 m repeat: no seam; the compass
  // rose centred on the east front — murals.js places it on the 9.3 m face)
  B(-3, 9, G0, G1, ST.cut, -22.2, ashlar({ tag: 't1' })),
  B(-3, 9, G0, G1, -36.5, ST.cut, ashlar({ tag: 't1' })),
  B(9, 17.5, G0, G1, ST.cut, -22.2, ashlar({ tag: 't1', mural: [{ n: [0, 1, 0], id: MURAL.rose }] })),
  B(9, 17.5, G0, G1, -36.5, ST.cut, ashlar({ tag: 't1' })),
  B(3.4, 17.5, G0, G1, -22.2, -20, ashlar({ tag: 't1', mural: [{ n: [0, 0, 1], id: MURAL.inscription }] })),
  B(15, 17.5, G0, G1, -20, -17.1, ashlar({ tag: 't1-shelf' })),
  B(9, 17.5, G0, G1, -45.4, -36.5, ashlar({ tag: 'east-yard' })),
  // the roll-off-roof observatory hut on the terrace (its walls ink, its roof is off-limits)
  B(8.2, 11.8, G1, 3.9, -33.6, -30.4, { color: '#e8e2d4', pattern: PATTERN.weatherboard, tag: 'rolloff-hut', roof: true }),
  // steps cut along the terrace wall down to the bank (the tower's bank run stays clear of them)
  R([-0.8, G0, -21.1], [3.4, G1, -21.1], 2.2, steps({ tag: 'wall-steps' })),
  // the shore trail ↔ the first terrace, and the shore's back end up to the east yard
  // the switchback path up from the shore trail: a leg along the shore to a landing, a leg back up onto the terrace
  R([23.3, G0, -23.6], [23.3, 0.65, -26.4], 2.2, { color: K.gravel, pattern: PATTERN.rampboard, tag: 'switchback' }),
  B(22.2, 24.4, G0, 0.65, -28.4, -26.4, ashlar({ tag: 'switchback-landing' })),
  R([22.2, 0.65, -27.4], [17.5, G1, -27.4], 2.0, { color: K.gravel, pattern: PATTERN.rampboard, tag: 'switchback' }),
  R([19.75, G0, -37.5], [19.75, G1, -43.6], 4.5, steps({ tag: 'shore-stair' })),   // (wall to the water's edge: no blind alley beside it)
  B(17.5, 22, G0, G1, -45.4, -43.6, ashlar({ tag: 'shore-landing' })),

  // ---------------- the west terrace (G2) and its long flight to the bridge head; the bastion by the hollow
  B(-11, -3, G0, G2, ST.cut, -23, ashlar({ tag: 'west-terrace' })),
  B(-11, -3, G0, G2, -36.5, ST.cut, ashlar({ tag: 'west-terrace' })),   // (its back, with the building: split on the cut)
  B(-11, -8.7, G0, G2, -23, -19, ashlar({ tag: 'bastion', mural: [{ n: [0, 0, 1], id: MURAL.blaze }] })),
  R([-5.85, G0, -17.1], [-5.85, G2, -23], 5.7, steps({ tag: 'west-flight' })),   // (wall to wall: bastion → first terrace)

  // ---------------- the rehearsal hollow (G1) and Pearl's rock
  B(-19, -11, G0, G1, -31.5, -19.5, turf({ tag: 'hollow', mural: [{ n: [0, 1, 0], id: MURAL.shock }] })),
  B(-19, -11, G0, G1, -19.5, -17.5, turf({ tag: 'hollow' })),
  ...OCT(-15, -25.5, 2.6, G1, 2.4, granite({ tag: 'pearls-rock' })),
  R([-15.4, G0, -14.4], [-15.4, G1, -17.5], 3, steps({ tag: 'hollow-steps' })),
  R([-12.6, G1, -28.5], [-12.6, G2, -31.5], 3.2, steps({ tag: 'hollow-back-stair' })),   // (abuts the rock steps: no slot between)
  // rough steps up the back of Pearl's rock (onto its flat top, 2.4)
  R([-15, G1, -30.55], [-15, 2.4, -27.95], 1.6, steps({ tag: 'rock-steps', color: K.granite })),
  R([-14.2, G1, -20.9], [-11, G2, -20.9], 2.2, steps({ tag: 'bastion-stair' })),

  // ---------------- the ridge (G2): the spine along the tarn cliff (its ground above), its root behind the hollow, the
  //                  timber viewing platform on its nose, overhanging the cliff
  // (its north face, under the platform's railing, takes no ink: nothing climbs up into the rail — the way up is the
  // boardwalk; nor do the boardwalk's railed sides)
  B(-26.3, -19, G0, 2.45, -19.2, -15.2, granite({ tag: 'ridge-nose', noPaint: [[0, 0, 1]] })),
  B(-26.6, -18.8, 2.45, G2, -19.2, -15.2, timber({ tag: 'viewing-platform', noPaint: [[0, 0, 1]] })),
  B(-19, -9, G0, G2, -45.4, -36.5, granite({ tag: 'ridge-root' })),
  B(-19, -11, G0, G2, -36.5, -31.5, granite({ tag: 'ridge-root' })),
  // the old weather hut on the ridge root, against the summit crag (granite walls ink; its roof is off-limits)
  B(-17, -13.4, G2, 4.9, -45.4, -42.6, granite({ tag: 'weather-hut', color: K.graniteDk, roof: true })),
  R([-22, G1, -12.2], [-22, G2, -15.2], 2.4, timber({ tag: 'boardwalk', noPaint: [[1, 0, 0], [-1, 0, 0]] })),

  // ---------------- crossings
  // the weir across the W reach: crest (G1) bank to bank, steel stair down to the lawn
  B(-23.2, -20.8, FL, G1, -12.6, -5.6, { color: K.concrete, pattern: PATTERN.concrete, tag: 'weir' }),
  R([-22, G0, -2.5], [-22, G1, -5.6], 2.4, { color: '#8a9096', pattern: PATTERN.treads, tag: 'weir-stair' }),
  // the Old Stone Bridge (M reach): humped, crown 0.8, 6 m between the parapets (room to fight round the tower as it
  // crosses), parapets as cover
  B(-3, 3, -0.6, 0.8, -14.6, -9.0, ashlar({ tag: 'bridge-crown' })),
  R([0, G0, -6.8], [0, 0.8, -9.0], 6, ashlar({ tag: 'bridge-ramp' })),
  R([0, G0, -16.8], [0, 0.8, -14.6], 6, ashlar({ tag: 'bridge-ramp' })),
  ...[-1, 1].flatMap((s) => [
    B(s > 0 ? 3 : -3.45, s > 0 ? 3.45 : -3, -0.6, 1.7, -14.6, -9.0, ashlar({ tag: 'bridge-parapet', perch: true, noNav: true })),
    R([s * 3.225, 0.95, -7.3], [s * 3.225, 1.7, -9.0], 0.45, ashlar({ tag: 'bridge-parapet', thin: true, thickness: 0.85, perch: true, noNav: true })),
    R([s * 3.225, 0.95, -16.3], [s * 3.225, 1.7, -14.6], 0.45, ashlar({ tag: 'bridge-parapet', thin: true, thickness: 0.85, perch: true, noNav: true })),
  ]),
  // the log bridge (E reach, past its bend): two split logs, square across the reach
  O(20.6, -15.39, 1.6, 5.2, -0.3, 0.42, 36.6, timber({ tag: 'log-bridge' })),   // (its ends rest on the bank shelves)

  // ---------------- the back: the summit crag behind the ridge root, the east yard and the shore (off-limits)
  B(-20, -9, G2, 6.5, -46, -45.4, granite({ tag: 'crag', roof: true })),
  B(9, 17.5, G1, 5.5, -46, -45.4, granite({ tag: 'crag', roof: true })),
  B(17.5, 22.4, G0, 5.5, -46, -45.4, granite({ tag: 'crag', roof: true })),
].map(shiftDef);   // (the stretch: the base side moves out)

// ============================================================================================================
// Modes
// ============================================================================================================
// Zone Control: the lawn in front of the marquees (centre); Pearl's rock + the hollow floor in front of it (side)
const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const circle = (cx, cz, r, n = 16) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [+(cx + Math.cos(a) * r).toFixed(3), +(cz + Math.sin(a) * r).toFixed(3)]; });
const ZONES = {
  center: [{ poly: rect(-5.5, 5.5, -5, 5), y0: -0.3, y1: 0.6 }],
  side: { polys: [circle(-15, -25.5, 2.3), [[-19, -22.9], [-14.3, -22.9], [-14.3, -19.7], [-11, -19.7], [-11, -17.5], [-19, -17.5]]], y0: 1.2, y1: 2.5 },
};
// Tower Command (authored on Bravo's side, z > 0; Alpha pushes it there): over the Old Stone Bridge, along the bank,
// up onto the shelf, back across the first terrace, up onto the west terrace (the user's drawing, to 31 before the
// stretch) — then the slice's detour loop (two checkpoints: the track 80 of the 100 points, twice the first drawing's
// length): on along the stargazing terrace, down onto the first terrace and east across it to the Dish Knoll's front
// steps, up them onto the knoll (checkpoint 2 on its top, by the dish: two thirds of the way), back west across the
// knoll onto the stargazing terrace and down it past the rock garden, then round the shoulder: west along its front
// (z 52.25), down past the Solar Tower's garden stair to the terrace's back (z 59) under the control building, east
// along it and up to the goal below the forecourt (11 m short of the pad; 1 m further out than before the loop was
// turned round). The telescope piers on the terrace's back stand inside the loop in this mode (slice-props.js).
const TOWER = {
  path: [[0, 0], [0, 18.5], [-16.25, 18.5], [-16.25, 26], [5.75, 26], [5.75, 34], [-3, 34], [-3, 43.5], [5.75, 43.5], [5.75, 52.25],
    [16, 52.25], [16, 59], [5.75, 59], [5.75, 56]],
  checkpoints: [[-6, 18.5], [-2, 43.5]],
};

const LAYOUT_NANTAI = {
  id: 'nantai',
  water: 'marina',   // the tarn: calm, glassy water that mirrors the mountain (the marina water mode: no sea spray)
  bounds: { minX: -27, maxX: 27, minZ: -46 - ST.d, maxZ: 46 + ST.d },
  spawnPads: [[0, G3, sz(-41)], [0, G3, -sz(-41)]],
  spawnBarrier: 4.2,
  // match intro: high over the lawn's west end (the weir behind), looking over the Old Stone Bridge at the terraces and
  // the dome, then down onto your forecourt
  intro: { from: [-10, 12.5, 8], lookFrom: [2, 3.5, -12], toBack: 3.0 },
  // stage-select picture: from high over the tarn by the weir, across the brook and Pearl's rock to the terraces, the
  // Solar Tower and the dish on its knoll, the observatory and the summit (since the stretch: the whole climb to the dome)
  art: { from: [-21, 15, 12], look: [2, 1, -28], fov: 66 },
  env: {
    backdrop: (kit) => buildBackdrop(kit, { d: ST.d }), bay: false, edge: 'none', boats: false, gulls: false, buoys: false, stars: true,
    weather: { mist: { layers: 2, height: 1.6, reach: 150, inner: 10, opacity: 0.26, scale: 0.025 } },   // thin fog lying on the tarn
    // the tarn: cold, clear, calm — deep teal-green, pale green shallows; crisp mountain air (a deeper zenith, less haze)
    theme: {
      all: { seaDeep: '#0d3a3a', seaShallow: '#2a7a70', seaCrest: '#86cbb6', foam: '#eef6f2', waveStrength: 0.32, seaAmbientK: 0.66,
        marina: { channel: '#0e4441', shade: '#061413', calm: 0.4, lap: 0.7, caustic: 1.6, wet: 0.45 } },
      day: { zenith: '#1453c2', skyMid: '#4b97e6', horizon: '#d3e9f6', haze: [1 / 2600, 0.85, 340], fog: [30, 1300] },
    },
  },
  zones: ZONES,
  tower: TOWER,
  // Boss Battle: HULLBREAKER's floor is the lawn (0) — since the stretch the shoulder and the terraces (2.6) out-cover it
  boss: { floorY: 0 },
  // the centre of the lawn: one slab across the centre line (self-symmetric), so the turf runs on without a seam
  single: [B(-7.2, 7.2, FL, G0, -9.6, 9.6, turf({ tag: 'lawn', mural: [{ n: [0, 1, 0], id: MURAL.paths }] }))],
  half: [...GROUND, ...HALF, ...SLICE_PIECES],
  // two heritage lamps per half light the paths at the bridge head and the terrace steps at dusk; the team flags fly
  // from the forecourt's back corners
  // (the slice adds two: on the stargazing terrace by the Solar Tower's forecourt, on the apron below the knoll)
  decor: { lamps: [[-4.4, -8.9], [4.3, -20.6], [-8.0, -33.4], [8.4, -49.6]], palms: [], flags: [[-8.3, G3, sz(-44.7)], [4.7, G3, sz(-44.7)]] },
};

export const LAYOUT = LAYOUT_NANTAI;
