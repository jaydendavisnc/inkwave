// Mount Nantai — stage prop pack + placements (owner: the nantai stage; see layout.js for the folder contract).
//
// register(D, H): this stage's own prop builders (types prefixed 'nantai_'), same contract as props-marina-dock.js: H
// carries THREE + the PropKit helpers. The builders live in modules by theme:
//   kit.js        the shared toolkit: palette, geometry helpers, stroke font, rocks, pines, railings
//   obs.js        the observatory: dome, front wall, control building, control room + weather mast, roll-off hut
//   crossings.js  the Old Stone Bridge, the weir, the log bridge, the lookout + boardwalk
//   nature.js     brook banks, pines, boulders, cairns, signs, scree, Pearl's rock, the rowing boat, benches
//   party.js      Grizzco's star party: marquee, telescopes, chairs, screen, generator, crates, lights, banner
// PLACEMENTS: this stage's set dressing (half list: every entry is mirrored (x,z) → (-x,-z) with rotY + π unless it says
// `mirror: false`). Solid props hand the level collision boxes; turned ones keep turned colliders (oboxCols).
import { makeKit } from './kit.js';
import { registerObservatory } from './obs.js';
import { registerCrossings } from './crossings.js';
import { registerNature } from './nature.js';
import { registerParty } from './party.js';
import { registerSlice } from './slice-props.js';
import { BS, BN, zAt, LEDGE_FEET } from './layout.js';
import { shiftPlacement } from './stretch.js';
import { SLICE_PLACEMENTS } from './slice-props.js';

const P = Math.PI, HP = P / 2;

export function register(D, H) {
  const T = makeKit(H);
  registerObservatory(D, H, T);
  registerCrossings(D, H, T);
  registerNature(D, H, T);
  registerParty(D, H, T);
  registerSlice(D, H, T);
}

// a brook bank dressing from world point a to b (the water on the run's right-hand side → local +Z), stones = stones in
// the stream (width: how far across they spread)
function bank(a, b, o = {}) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  return { type: 'nantai_bank', pos: [a[0], 0, a[1]], rotY: Math.atan2(-dz / L, dx / L), length: L, oboxCols: true, ...o };
}
const zN = (x) => zAt(BN, x), zS = (x) => zAt(BS, x);

// (the Long Stages stretch: the list below is the drawing before the stretch — every placement beyond the cut moves out
// with the base, stretch.js; the ledge footprints are already stretched; the slice's own dressing is slice-props.js)
const DRAWN = [
  // ================= the observatory (behind the forecourt), the control building, the control room
  { type: 'nantai_observatory', pos: [0, 0, -45.4], rotY: 0 },
  { type: 'nantai_controlbuilding', pos: [9, 1.3, -36.5], rotY: 0 },
  { type: 'nantai_controlroom', pos: [7.2, 3.8, -43.8], rotY: 0 },
  { type: 'nantai_stevenson', pos: [15.6, 1.3, -42.4], rotY: -HP },
  { type: 'nantai_rolloff', pos: [10, 1.3, -32], rotY: 0 },
  { type: 'nantai_telepier', pos: [-7.4, 3.8, -38.2], rotY: 0.4 },
  { type: 'nantai_stairrail', pos: [11.2, 1.3, -38.1], rotY: P, run: 6.3, rise: 2.5, x: 0 },

  // ================= the brook: banks (boulders at the waterline, stones, the gravel bars' footprint), the crossings
  bank([-8, zN(-8)], [-16, zN(-16)], { seed: 3, width: 3.8 }),
  bank([-16, zN(-16)], [-25.2, zN(-25.2)], { seed: 23, width: 4.4 }),
  bank([12, -9.6], [-8, -9.6], { seed: 5, width: 3.8 }),
  bank([19, zN(19)], [12, zN(12)], { seed: 7, width: 3.6 }),
  bank([24.4, zN(24.4)], [19, zN(19)], { seed: 27, width: 3.0 }),
  bank([-25.9, zS(-25.9)], [-16, zS(-16)], { seed: 11, stones: 0 }),
  bank([-16, zS(-16)], [-8, zS(-8)], { seed: 29, stones: 0 }),
  bank([-8, -13.8], [12, -13.8], { seed: 13, stones: 0 }),
  bank([12, -13.8], [19, zS(19)], { seed: 17, stones: 0 }),
  bank([19, zS(19)], [24.6, zS(24.6)], { seed: 19, stones: 0 }),
  // the footprint under every shore ledge and bank shelf (hidden): the tarn's edge rocks and foam follow the true shore
  ...LEDGE_FEET.map((f) => ({ type: 'nantai_foot', pos: [f.cx, 0, f.cz], rotY: (f.rot * P) / 180, len: f.len, w: f.w, oboxCols: true })),
  { type: 'nantai_stonebridge', pos: [0, 0, -11.8], rotY: 0 },
  { type: 'nantai_weir', pos: [-22, 0, -9.6], rotY: 0 },
  { type: 'nantai_logbridge', pos: [20.6, 0, -15.39], rotY: (36.6 * P) / 180, oboxCols: true },
  { type: 'nantai_lookout', pos: [-18.8, 2.6, -15.2], rotY: 0 },
  { type: 'nantai_fingerpost', pos: [-4.7, 0, -7.4], rotY: P, blades: [['OBSERVATORY', -HP + 0.2], ['LOOKOUT · WEIR', P - 0.1], ['LOG BRIDGE', 0.25]] },
  { type: 'nantai_fingerpost', pos: [18.9, 0, -22.4], rotY: 0, blades: [['SUMMIT 0.2 KM', HP + 0.3], ['OCTO VALLEY 6 KM', -0.1], ['INKOPOLIS 14 KM', P]] },

  // ================= Pearl's rock + the hollow
  { type: 'nantai_pearlsrock', pos: [-15, 1.3, -25.5], rotY: 0 },

  // ================= the ridge: pines, outcrops, a cairn
  { type: 'nantai_pine', pos: [-19.8, 2.6, -41.6], rotY: 0.5, seed: 1 },
  { type: 'nantai_pine', pos: [-24.0, 2.6, -36.6], rotY: 2.2, seed: 2, scale2: 0.85 },
  { type: 'nantai_pine', pos: [-22.8, 2.6, -22.4], rotY: -0.8, seed: 4 },
  { type: 'nantai_outcrop', pos: [-20.2, 2.6, -34.0], rotY: 0.2, w: 2.2, h: 1.2, d: 1.6, seed: 33 },
  { type: 'nantai_outcrop', pos: [-23.4, 2.6, -39.0], rotY: 0.3, w: 2.2, h: 1.1, d: 1.6, seed: 35 },
  { type: 'nantai_outcrop', pos: [-22.4, 2.6, -21.2], rotY: 2.1, w: 2.0, h: 1.05, d: 1.4, seed: 37 },
  { type: 'nantai_heath', pos: [-21.3, 2.6, -29.8], w: 1.0, d: 1.6, n: 3, seed: 5 },
  { type: 'nantai_heath', pos: [-21.6, 2.6, -42.4], w: 1.6, d: 1.2, n: 4, seed: 9 },
  { type: 'nantai_cairn', pos: [-24.4, 2.6, -34.4], rotY: 0 },
  { type: 'nantai_weatherhut', pos: [-15.2, 2.6, -44.0], rotY: 0 },
  { type: 'nantai_clutter', variant: 'wheelbarrow', pos: [-18.2, 2.6, -41.8], rotY: 0.6 },
  { type: 'nantai_scree', pos: [-20.6, 2.6, -25.6], w: 1.6, d: 2.0, n: 14, seed: 3 },

  // ================= the west terrace: a telescope pier and a bench off the tower's line
  { type: 'nantai_telepier', pos: [-9.6, 2.6, -34.2], rotY: 2.6, notIn: 'tower' },   // (Tower Command: inside the loop, slice-props.js)
  { type: 'nantai_bench', pos: [-10.3, 2.6, -28.5], rotY: HP },
  { type: 'nantai_infoboard', pos: [-10.1, 2.6, -32.2], rotY: HP, title: 'STARGAZING TERRACE' },
  { type: 'nantai_planter', pos: [-9.9, 2.6, -24.1], rotY: 0, w: 1.6 },

  // ================= the first terrace + east yard: piers, benches, crates
  { type: 'nantai_telepier', pos: [6.2, 1.3, -22.9], rotY: 0.2 },
  { type: 'nantai_telepier', pos: [13.2, 1.3, -22.7], rotY: -0.3 },
  { type: 'nantai_bench', pos: [9.4, 1.3, -20.55], rotY: 0 },
  { type: 'nantai_crates', pos: [5.2, 1.3, -34.6], rotY: 0.1, n: 3 },
  { type: 'nantai_planter', pos: [-1.4, 1.3, -23.3], rotY: 0, w: 1.8 },
  { type: 'nantai_planter', pos: [15.9, 1.3, -30.6], rotY: HP, w: 1.4 },
  { type: 'nantai_infoboard', pos: [3.9, 1.3, -28.8], rotY: 0 },
  { type: 'nantai_bollard', pos: [3.6, 1.3, -30.1] },
  { type: 'nantai_bollard', pos: [-9.1, 0, -16.6] },
  { type: 'nantai_bollard', pos: [-20.6, 0, -3.1] },
  { type: 'nantai_bollard', pos: [-14.0, 0, -14.3] },
  { type: 'nantai_crates', pos: [14.6, 1.3, -38.8], rotY: -0.2, n: 2 },
  { type: 'nantai_dish', pos: [13.6, 1.3, -44.2], rotY: 0.6 },
  { type: 'nantai_clutter', variant: 'tarp', pos: [16.3, 1.3, -40.6], rotY: HP },
  { type: 'nantai_clutter', variant: 'hose', pos: [11.9, 1.3, -39.4], rotY: 0.3 },
  { type: 'nantai_clutter', variant: 'ladder', pos: [7.8, 3.8, -41.4], rotY: 0, len: 2.4 },

  // ================= the shore trail: boulders, pines, a cairn, the rowing boat
  { type: 'nantai_boulder', pos: [18.2, 0, -33.4], rotY: 0.4, w: 1.4, h: 1.1, d: 1.2, seed: 41 },   // (against the terrace wall)
  { type: 'nantai_boulder', pos: [23.2, 0, -40.4], rotY: 1.9, w: 1.2, h: 0.85, d: 1.0, seed: 43 },
  { type: 'nantai_crates', pos: [18.0, 0, -23.2], rotY: HP, n: 2 },
  { type: 'nantai_cairn', pos: [18.6, 0, -30.6], rotY: 0 },
  { type: 'nantai_rowboat', pos: [25.15, 0, -26.4], rotY: 0.12 },   // pulled up on the point by the switchback
  { type: 'nantai_scree', pos: [19.6, 0, -35.6], w: 1.4, d: 2.4, n: 12, seed: 7 },
  { type: 'nantai_heath', pos: [19.2, 0, -31.0], w: 1.2, d: 1.8, n: 3, seed: 19 },
  { type: 'nantai_heath', pos: [22.6, 0, -38.6], w: 1.0, d: 1.2, n: 3, seed: 17 },

  // ================= the bank below the ridge nose and in front of the hollow
  { type: 'nantai_pine', pos: [-24.6, 0, -13.6], rotY: 1.0, seed: 7, scale2: 0.9 },
  { type: 'nantai_boulder', pos: [-11.8, 0, -16.2], rotY: 0.2, w: 1.4, h: 0.9, d: 1.1, seed: 45 },
  { type: 'nantai_boulder', pos: [8.6, 0, -15.5], rotY: -0.4, w: 1.5, h: 0.95, d: 1.1, seed: 49 },
  { type: 'nantai_bench', pos: [-6.4, 0, -15.1], rotY: 0 },
  { type: 'nantai_heath', pos: [-17.4, 0, -14.6], w: 2.2, d: 1.0, n: 4, seed: 21 },
  { type: 'nantai_heath', pos: [-21.5, 0, -1.8], w: 2.0, d: 1.4, n: 3, seed: 23 },
  { type: 'nantai_heath', pos: [18.4, 0, -7.6], w: 1.2, d: 1.6, n: 4, seed: 25 },

  // ================= the star party on the lawn
  { type: 'nantai_marquee', pos: [10.6, 0, -4.4], rotY: -HP },
  { type: 'nantai_dobsonian', pos: [4.3, 0, -2.7], rotY: 0.35 },
  { type: 'nantai_screen', pos: [-13.2, 0, -3.6], rotY: -HP },   // faces the lawn's west end, its audience in camp chairs
  { type: 'nantai_chairs', pos: [-7.4, 0, -7.0], rotY: 0.3, n: 3 },
  { type: 'nantai_chairs', pos: [16.4, 0, -6.2], rotY: 2.2, n: 2 },
  { type: 'nantai_boulder', pos: [18.9, 0, -11.7], rotY: 0.9, w: 1.6, h: 1.0, d: 1.2, seed: 47 },
  { type: 'nantai_refractor', pos: [-17.6, 0, -2.6], rotY: 1.2, aim: 0.8 },
  { type: 'nantai_chairs', pos: [-18.2, 0, -3.6], rotY: -0.6, n: 2 },
  { type: 'nantai_refractor', pos: [-10.6, 0, -6.4], rotY: 0.2, aim: 0.4 },
  { type: 'nantai_refractor', pos: [7.2, 0, -8.6], rotY: -0.4, aim: -0.3, color: '#c9a24e' },
  { type: 'nantai_generator', pos: [14.6, 0, -8.0], rotY: 0.1 },
  { type: 'nantai_clutter', variant: 'cable', pos: [0, 0, 0], rotY: 0, pts: [[13.8, -7.8], [12.9, -7.2], [12.8, -6.4], [12.3, -5.6]] },
  { type: 'nantai_clutter', variant: 'bin', pos: [8.2, 0, -6.9] },
  { type: 'nantai_clutter', variant: 'cooler', pos: [15.2, 0, -5.2], rotY: 0.4 },
  { type: 'nantai_clutter', variant: 'chairstack', pos: [12.6, 0, -2.2], rotY: -HP },
  { type: 'nantai_clutter', variant: 'bin', pos: [-5.2, 0, -15.1] },
  { type: 'nantai_crates', pos: [-9.9, 0, -1.6], rotY: -0.25, n: 2 },
  { type: 'nantai_banner', pos: [-6.0, 0, -9.0], rotY: P, w: 3.4 },
  { type: 'nantai_festoon', pos: [0, 0, 0], rotY: 0, pts: [[5.2, -9.2], [9.4, -8.6], [13.4, -6.9]], h: 4.3 },
  { type: 'nantai_festoon', pos: [0, 0, 0], rotY: 0, pts: [[-12.4, -6.2], [-8.6, -9.2], [-3.2, -9.4]], h: 4.3 },

  // ================= the lookout points at the lawn's ends: where it all began (one-off), and its twin
  { type: 'nantai_bench', pos: [24.4, 0, -3.1], rotY: HP, plaque: 'WHERE IT ALL BEGAN · P + M', mirror: false },
  { type: 'nantai_bench', pos: [-24.4, 0, 3.1], rotY: -HP, mirror: false },
];

export const PLACEMENTS = [...DRAWN.map((p) => (p.type === 'nantai_foot' ? p : shiftPlacement(p))), ...SLICE_PLACEMENTS];
