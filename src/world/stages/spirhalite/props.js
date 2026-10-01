// Spirhalite Islands — stage prop pack + placements (owner: the spirhalite stage; see layout.js for the folder contract).
//
// register(D, H): adds this stage's prop builders to the PropKit definition table D (H = the kit helpers + THREE; every
// type is prefixed 'spirhalite_'). The builders live in props-*.js next to this file, sharing kit.js.
// PLACEMENTS: this stage's set dressing — the half list: every entry is mirrored (x, z) → (−x, −z) with rotY + π unless
// it says `mirror: false`. Solid props hand the level collision boxes (roof / rail flags as noted).
// Conventions (as props.js): metres, Y up, `pos` = base point, rotY turns local +Z (the "front").
import { makeKit } from './kit.js';
import { registerRuins, ARCH } from './props-ruins.js';
import { registerCamp } from './props-camp.js';
import { registerFlora } from './props-flora.js';
import { registerBridges } from './props-bridges.js';
import { registerSlice } from './props-slice.js';
import { LAYOUT, BRIDGES, DIGBRIDGE, BAYBRIDGE, PAD, PAD_BODY, WATCH, ROPE, TRENCH } from './layout.js';
import { OUTLINE, PILLAR, SHIFT, sh, DIG_SEA, DIG_LAGOON, SPIT_SEA, SPIT_BAY, TIDE_E, TIDE_W, FORD_E, FORD_W, PILLAR_S } from './outline.js';
import { inPoly } from './islands.js';

const P = Math.PI, DEG = Math.PI / 180;

// Ground height under (x, z) from the layout's pieces (boxes, turned boxes, ramps; the half list mirrored): the highest
// top no more than `hint` + 0.3 m — so flora and debris sit on the wet-sand shelf (9–27 cm under the dry sand) or the
// dune they stand on instead of floating.
const PIECES = [...LAYOUT.single, ...LAYOUT.half, ...LAYOUT.half.map((d) => (d.kind === 'box' ? { ...d, min: [-d.max[0], d.min[1], -d.max[2]], max: [-d.min[0], d.max[1], -d.min[2]] }
  : d.kind === 'obox' ? { ...d, center: [-d.center[0], d.center[1], -d.center[2]] } : { ...d, low: [-d.low[0], d.low[1], -d.low[2]], high: [-d.high[0], d.high[1], -d.high[2]] }))]
  .filter((d) => !d.rail && d.solid !== false);
function topAt(d, x, z) {
  if (d.kind === 'box') return x >= d.min[0] && x <= d.max[0] && z >= d.min[2] && z <= d.max[2] ? d.max[1] : -Infinity;
  if (d.kind === 'obox') {
    const a = (d.rotY * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), dx = x - d.center[0], dz = z - d.center[2];
    return Math.abs(dx * c - dz * s) <= d.size[0] / 2 && Math.abs(dx * s + dz * c) <= d.size[2] / 2 ? d.center[1] + d.size[1] / 2 : -Infinity;
  }
  const lx = d.high[0] - d.low[0], lz = d.high[2] - d.low[2], L2 = lx * lx + lz * lz, t = ((x - d.low[0]) * lx + (z - d.low[2]) * lz) / L2;
  const side = Math.abs((x - d.low[0]) * lz - (z - d.low[2]) * lx) / Math.sqrt(L2);
  return t >= 0 && t <= 1 && side <= d.width / 2 ? d.low[1] + (d.high[1] - d.low[1]) * t : -Infinity;
}
export function groundAt(x, z, hint = 0) {
  let best = -Infinity;
  for (const d of PIECES) { const y = topAt(d, x, z); if (y <= hint + 0.3 && y > best) best = y; }
  return best === -Infinity ? hint : +best.toFixed(3);
}
const SNAP = /^spirhalite_(campfire|palm|pompoms|grass|shrub|rock|float|buoy|debris|driftwood|rowboat|crates|table|tent|tarp|generator|mast|lantern|survey|flagpole|signposts|worklight|stakes|kelp|pathlights|drums|rockpool|spoil|sieve|barrow|supplydrop|stones)$/;

export function register(D, H) {
  const X = makeKit(H);
  registerRuins(D, H, X);
  registerCamp(D, H, X);
  registerFlora(D, H, X);
  registerBridges(D, H, X);
  registerSlice(D, H, X);
}

// the stretch: placements of the base (the bottom stroke, the tail), authored where they stood before, moved out by
// SHIFT (outline.js) — like the layout's base pieces
const moved = (list) => list.map((it) => ({ ...it, pos: [+(it.pos[0] + SHIFT[0]).toFixed(3), it.pos[1], +(it.pos[2] + SHIFT[1]).toFixed(3)] }));

const RAW = [
  // ================= the ruins
  { type: 'spirhalite_arch', pos: [0, 0, 0], rotY: ARCH.rotY, mirror: false, oboxCols: true },
  { type: 'spirhalite_pillar', pos: [PILLAR.x, 0, PILLAR.z], rotY: -Math.PI / 2 },
  { type: 'spirhalite_causeway', pos: [-29, 0, -18.1], rotY: 0, len: 16.2, w: 4.2, top: 1.3,
    posts: [[-4.8, -1], [-4.8, 1], [3.4, -1], [3.4, 1], [6.9, -1]], slabs: [[-1.0, -1, 0.3, 0.25], [1.8, 1, -0.4, -0.3]],
    rubble: [] },
  // the expedition's ropes on a kerb of fallen blocks along both edges over the inlet, between the carved posts
  { type: 'spirhalite_ropefence', pos: [-30.8, 1.3, -25.7], rotY: -Math.PI / 2, L: 2.6, seed: 30 },
  { type: 'spirhalite_ropefence', pos: [-30.8, 1.3, -22.5], rotY: -Math.PI / 2, L: 7.6, seed: 31 },
  { type: 'spirhalite_ropefence', pos: [-27.2, 1.3, -22.5], rotY: -Math.PI / 2, L: 7.6, seed: 32 },
  { type: 'spirhalite_ropefence', pos: [-26.6, 1.3, -12.35], rotY: 0, L: 1.55, seed: 33 },                  // the bastion's inlet edge

  // ================= the log bridges across the lagoon (dressing for the level's decks: the pillar headland's, the Arch
  // spit's under the arch); the shore kerbs run up to their side logs (and a short rope closes the spit's tip beside it)
  ...BRIDGES.map((b, i) => ({ type: 'spirhalite_logbridge', pos: [b.x, 0, (b.z0 + b.z1) / 2], rotY: 0, len: b.z1 - b.z0, w: b.w, top: 0.25, seed: 11 + i * 2 })),
  ...[DIGBRIDGE, BAYBRIDGE].map((b, i) => ({ type: 'spirhalite_logbridge', pos: [(b.x0 + b.x1) / 2, 0, b.z], rotY: Math.PI / 2, len: b.x1 - b.x0, w: b.w, top: 0.25, seed: 17 + i * 2 })),   // (the dig's, the east bay's: the stretch)
  { type: 'spirhalite_ropefence', pos: [11.75, -0.12, -9.7], rotY: Math.atan2(0.75, 0.62), L: 0.97, seed: 20 },

  // ================= spawn: the helipad (dressing for the level's pad; stairs: foot → top, width), the helicopter behind
  { type: 'spirhalite_helipad', pos: [PAD[0], 0, PAD[1]], rotY: 0, R: 5.9, body: PAD_BODY, base: 1.3, top: 3.2, open: [1, 3],
    stairs: [[0, 9.9, 0, 5.45, 3], [-9.9, 0, -5.45, 0, 3]] },
  ...moved([
    { type: 'spirhalite_rearpad', pos: [10.5, 0, -51.8], rotY: 0.12, w: 12, d: 10, y: 1.0 },
    { type: 'spirhalite_helicopter', pos: [11.0, 1.0, -52.0], rotY: 0.2 },
  ]),

  // ================= Deep Cut's camp in the camp islet's dune hollow (the base: moved out by the stretch)
  ...moved([
    { type: 'spirhalite_tent', pos: [-27.4, 0, -35.2], rotY: P / 2, w: 2.6, d: 3.4, h: 2.0 },
    { type: 'spirhalite_tent', pos: [-27.0, 0, -39.3], rotY: P / 2 - 0.3, w: 2.2, d: 2.8, h: 1.7, variant: 1 },
    { type: 'spirhalite_tarp', pos: [-24.3, 0, -37.7], rotY: 0.05, w: 3.4, d: 3.0, h: 2.35 },
    { type: 'spirhalite_table', pos: [-24.3, 0, -37.8], rotY: 0.05 },
    { type: 'spirhalite_crates', pos: [-15.6, 0, -34.2], rotY: 0.2, layout: [[0, 0, 0, 0], [1.02, 0.06, 0, 0.05]] },
    { type: 'spirhalite_crates', pos: [-18.6, 0, -37.5], rotY: -0.4, layout: [[0, 0, 0, 0]] },
    { type: 'spirhalite_drums', pos: [-30.6, 0, -33.4], rotY: 1.2 },
    { type: 'spirhalite_generator', pos: [-17.4, 0, -35.9], rotY: 0.3, cable: [[-0.6, 0], [-2.4, -0.6], [-5.2, -1.4]] },
    { type: 'spirhalite_mast', pos: [-31.4, 0, -37.0], rotY: 0.4, h: 7.5 },
    { type: 'spirhalite_lantern', pos: [-25.4, 0, -35.9], rotY: 0.2, to: [1.2, -3.6] },
    { type: 'spirhalite_campfire', pos: [-21.2, 0, -34.4], rotY: 0.4 },
    { type: 'spirhalite_debris', pos: [-14.6, 0, -37.4], rotY: 2.6 },
    { type: 'spirhalite_lantern', pos: [-10.9, 1.3, -40.5], rotY: P },
    { type: 'spirhalite_flagpole', pos: [-29.8, 0, -32.9], rotY: 0, h: 4.4 },
    { type: 'spirhalite_signposts', pos: [-10.34, 0, -35], rotY: P / 2, w: 2.8 },
  ]),

  // ================= the pillar headland (Alpha's side zone): Deep Cut's dig at the pillar's foot — survey stakes and
  // a theodolite on the tombolo, a lantern by the west pool
  { type: 'spirhalite_stakes', pos: [-4.6, 0, -27.0], rotY: 0.2, w: 2.4, d: 1.4, n: 3 },
  { type: 'spirhalite_survey', pos: [3.5, 0, -25.3], rotY: 2.6 },
  { type: 'spirhalite_lantern', pos: [-6.3, 0, -26.1], rotY: 0.6 },
  { type: 'spirhalite_grass', pos: [4.1, 0, -19.6], n: 4, r: 0.6, seed: 19 },

  // ================= the Arch spit: a boulder and a washed-up tarp heap as cover along its edges, a glass float, flora
  { type: 'spirhalite_rock', pos: [15.25, 0, -17.6], rotY: 0.4, w: 1.1, h: 0.8, seed: 7, moss: true },
  { type: 'spirhalite_debris', pos: [12.0, 0, -13.0], rotY: 1.62 },
  { type: 'spirhalite_float', pos: [15.3, 0, -11.9], rotY: 0, r: 0.42 },
  { type: 'spirhalite_grass', pos: [12.1, 0, -20.2], n: 5, r: 0.8, seed: 22 },
  { type: 'spirhalite_pompoms', pos: [15.0, 0, -22.4], n: 5, seed: 23 },
  { type: 'spirhalite_kelp', pos: [11.2, 0, -16.6], rotY: 1.5, seed: 7, L: 1.3 },

  // ================= the helipad islet: fuel drums and a cargo stack on the high dune, palms and shrubs on the tail (moved out by the stretch)
  ...moved([
    { type: 'spirhalite_drums', pos: [15.0, 1.3, -39.6], rotY: 0.3 },
    { type: 'spirhalite_crates', pos: [14.9, 1.3, -32.0], rotY: -0.2, layout: [[0, 0, 0, 0], [1.02, 0.04, 0, 0.05], [0.5, 0.02, 1, 0.1]] },
    { type: 'spirhalite_palm', pos: [18.0, 0, -28.6], rotY: 0, h: 4.2, lean: 1.2, seed: 8 },
    { type: 'spirhalite_palm', pos: [11.6, 1.3, -28.2], rotY: 0, h: 3.4, lean: 0.9, seed: 17 },
    { type: 'spirhalite_shrub', pos: [2.1, 1.3, -40.5], rotY: 0, w: 1.3, h: 0.9, seed: 6 },   // (moved off the back beach's east end)
    { type: 'spirhalite_shrub', pos: [0.95, 1.3, -40.75], rotY: 0.2, w: 1.0, h: 0.7, seed: 3, nocol: true },
    { type: 'spirhalite_float', pos: [19.6, 0, -32.0], rotY: 0, r: 0.42 },
    { type: 'spirhalite_pathlights', pos: [0, 1.3, 0], rotY: 0, nosnap: true, pts: [[2.4, -27.0], [4.2, -28.6], [6.2, -29.4], [11.0, -26.6]] },
  ]),

  // ================= the mid islet and the bend's head: a palm, the rowing boat stranded on the beach, a crate stack on
  // the lagoon beach, a work light aimed up at the arch
  { type: 'spirhalite_palm', pos: [-33.0, 0, -7.2], rotY: 0, h: 4.4, lean: 1.3, seed: 3 },
  { type: 'spirhalite_shrub', pos: [-33.6, 0, -11.2], rotY: 0.5, w: 1.6, h: 1.0, seed: 9 },
  { type: 'spirhalite_rowboat', pos: [-32.6, 0, -5.4], rotY: 2.3 },
  { type: 'spirhalite_crates', pos: [-20.6, 0, -12.0], rotY: 0.45, layout: [[0, 0, 0, 0], [0, 0.85, 0, 0.1]] },
  { type: 'spirhalite_worklight', pos: [-16.9, 1.3, -8.1], rotY: 2.1, h: 2.6, tilt: 0.85 },

  // ================= the camp islet's corners: palms, a shrub, washed-up debris
  { type: 'spirhalite_palm', pos: [-34.6, 0, -28.2], rotY: 0, h: 3.8, lean: 1.0, seed: 12 },   // (the causeway's landing)
  { type: 'spirhalite_palm', pos: [-20.9, 0, -22.4], rotY: 0, h: 3.6, lean: 0.9, seed: 21 },   // (the neck's mouth)
  ...moved([
    { type: 'spirhalite_palm', pos: [-15.4, 1.3, -40.1], rotY: 0, h: 3.2, lean: 0.8, seed: 5 },
    { type: 'spirhalite_shrub', pos: [-29.2, 0, -38.6], rotY: 0.5, w: 1.5, h: 0.9, seed: 4 },
    { type: 'spirhalite_debris', pos: [-33.6, 0, -33.2], rotY: 1.5 },
    { type: 'spirhalite_buoy', pos: [-24.9, 0, -42.2], rotY: 2.2, variant: 0 },
    { type: 'spirhalite_buoy', pos: [18.9, 0, -30.4], rotY: 0.5, variant: 1 },
  ]),

  // ================= the central sandbar: a crate stack stranded by the zone, the survey stakes of a dig under the arch
  { type: 'spirhalite_crates', pos: [-3.2, 0, 3.6], rotY: -0.25, layout: [[0, 0, 0, 0], [0, 0.85, 0, 0.1], [0.05, 0.4, 1, -0.1]] },
  { type: 'spirhalite_stakes', pos: [4.0, 0, 3.0], rotY: -0.44, w: 2.4, d: 1.4, n: 3 },

  // ================= flora on the sand and the dunes: pompom flowers, dune grass, kelp on the beaches
  { type: 'spirhalite_grass', pos: [-22.0, 1.3, -7.4], n: 5, r: 0.8, seed: 14 },
  { type: 'spirhalite_pompoms', pos: [-20.8, 2.5, -6.6], n: 6, seed: 11 },
  { type: 'spirhalite_grass', pos: [-33.8, 0, -25.8], n: 6, r: 1.0, seed: 5 },
  { type: 'spirhalite_grass', pos: [-34.0, 0, -8.8], n: 5, r: 0.8, seed: 4 },
  { type: 'spirhalite_pompoms', pos: [-30.4, 0, -12.2], n: 6, seed: 2 },
  { type: 'spirhalite_grass', pos: [-20.8, 0, -19.6], n: 5, r: 0.7, seed: 2 },
  { type: 'spirhalite_pompoms', pos: [-7.1, 0, -16.4], n: 5, seed: 3 },
  { type: 'spirhalite_grass', pos: [2.5, 0, -14.8], n: 4, r: 0.6, seed: 6 },
  { type: 'spirhalite_pompoms', pos: [-10.8, 0, 1.9], n: 5, seed: 9 },
  { type: 'spirhalite_grass', pos: [8.8, 0, 6.2], n: 4, r: 0.6, seed: 16 },
  { type: 'spirhalite_kelp', pos: [-32.8, 0, -24.4], rotY: 1.1, seed: 2 },
  { type: 'spirhalite_kelp', pos: [-9.2, 0, 2.6], rotY: 0.6, seed: 6, L: 1.6 },
  ...moved([   // (the base's)
    { type: 'spirhalite_pompoms', pos: [-21.4, 2.5, -40.1], n: 6, seed: 13 },
    { type: 'spirhalite_grass', pos: [-13.4, 1.3, -39.9], n: 6, r: 1.0, seed: 12 },
    { type: 'spirhalite_pompoms', pos: [5.2, 1.3, -28.6], n: 7, seed: 8 },
    { type: 'spirhalite_grass', pos: [14.0, 1.3, -30.9], n: 5, r: 0.8, seed: 17 },
    { type: 'spirhalite_grass', pos: [17.6, 0, -34.4], n: 6, r: 1.0, seed: 7 },
    { type: 'spirhalite_pompoms', pos: [19.2, 0, -37.8], n: 7, seed: 10 },
    { type: 'spirhalite_pompoms', pos: [-32.6, 0, -31.0], n: 8, seed: 1 },
    { type: 'spirhalite_grass', pos: [-7.6, 0, -36.2], n: 4, r: 0.6, seed: 15 },
    { type: 'spirhalite_kelp', pos: [-11.0, 0, -29.0], rotY: 0.2, seed: 1 },
    { type: 'spirhalite_kelp', pos: [12.8, 0, -43.4], rotY: 1.5, seed: 3 },
    { type: 'spirhalite_kelp', pos: [7.0, 0, -24.4], rotY: 0.3, seed: 4, L: 1.4 },
  ]),

  // ================= the slice (the stretch). The tide-pool islet: the rope bridge up onto the shelf, the watch-post's
  // dressing, rock pools on the west beach, on the shelf and by the bay head, a boulder and driftwood on the beach, the
  // ford's stepping stones
  { type: 'spirhalite_ropebridge', pos: [ROPE.x, 0, ROPE.z0], rotY: Math.PI, L: +(ROPE.z0 - ROPE.z1).toFixed(2), y0: 0, y1: 1.3, w: ROPE.w, seed: 61 },
  { type: 'spirhalite_watchpost', pos: [(WATCH.post[0] + WATCH.post[1]) / 2, 1.3, (WATCH.post[2] + WATCH.post[3]) / 2], rotY: 0, w: WATCH.post[1] - WATCH.post[0], d: WATCH.post[3] - WATCH.post[2], y0: 1.3, y1: 2.5,
    stub: WATCH.stub.map(([x0, x1, z0, z1, y0, y1]) => { const cx = (WATCH.post[0] + WATCH.post[1]) / 2, cz = (WATCH.post[2] + WATCH.post[3]) / 2; return [x0 - cx, x1 - cx, z0 - cz, z1 - cz, y0 - 1.3, y1 - 1.3]; }) },
  { type: 'spirhalite_rockpool', pos: [-5.2, 0, -43.4], rotY: 0.3, w: 1.9, d: 1.2, seed: 3 },
  { type: 'spirhalite_rockpool', pos: [-9.6, 0, -45.9], rotY: -0.5, w: 1.3, d: 0.9, seed: 7 },
  { type: 'spirhalite_rockpool', pos: [0.5, 1.3, -38.25], rotY: 0.1, w: 1.5, d: 0.95, seed: 11 },
  { type: 'spirhalite_rockpool', pos: [7.1, 0, -43.9], rotY: 1.2, w: 1.2, d: 0.8, seed: 5 },
  { type: 'spirhalite_rock', pos: [-6.0, 0, -36.9], rotY: 0.8, w: 1.5, h: 0.8, seed: 31, moss: true },
  { type: 'spirhalite_rock', pos: [-2.4, -0.9, -30.8], rotY: 0.2, w: 1.1, h: 0.8, seed: 33, nocol: true, nosnap: true, color: '#b5ae9f' },   // (in the notch)
  { type: 'spirhalite_stones', pos: [-5.1, 0, -29.0], rotY: 0, nosnap: true, pts: [[0, 0], [0.3, -0.9], [-0.2, -1.9], [0.2, -2.8], [-0.1, -3.8], [0.35, -4.7]] },
  { type: 'spirhalite_kelp', pos: [-4.4, 0, -33.0], rotY: 1.6, seed: 12, L: 1.4 },
  { type: 'spirhalite_grass', pos: [0.9, 1.3, -41.2], n: 4, r: 0.5, seed: 31 },
  { type: 'spirhalite_pompoms', pos: [-6.2, 0, -44.8], n: 5, seed: 31 },
  { type: 'spirhalite_lantern', pos: [-1.0, 1.3, -34.4], rotY: -0.4 },

  // the shelf is the watch-post's old stone terrace on the islet's rocks: boulders along its foot at the notch and on
  // the east shore (clear of the tower's climb onto its west face and its drop off the south face)
  ...[[-0.8, -33.5, 1.3, 0.55], [1.9, -33.4, 1.0, 0.5], [3.6, -33.3, 1.5, 0.6], [5.4, -33.5, 1.2, 0.6], [6.5, -35.2, 1.1, 0.7], [6.6, -37.4, 1.4, 0.6], [6.5, -39.8, 1.0, 0.7], [6.5, -41.6, 1.2, 0.55]]
    .map(([x, z, w, h], i) => ({ type: 'spirhalite_rock', pos: [x, -0.35, z], rotY: i * 1.3, w, h, seed: 61 + i, nocol: true, nosnap: true, color: '#b5ae9f' })),
  { type: 'spirhalite_rock', pos: [-1.9, 0, -35.4], rotY: 0.4, w: 0.8, h: 0.6, seed: 71, nocol: true },
  { type: 'spirhalite_shrub', pos: [-0.9, 1.3, -41.6], rotY: 0.3, w: 1.0, h: 0.7, seed: 21, nocol: true },
  { type: 'spirhalite_grass', pos: [-0.3, 0, -45.9], n: 5, r: 0.7, seed: 33 },
  { type: 'spirhalite_pompoms', pos: [3.0, 0, -44.9], n: 5, seed: 33 },

  // the dig: timber shoring along the trench's walls, spoil heaps and the sieve on the strips between the tower's legs,
  // the finds shelter (tarp + table) at its north end by the causeway's landing, work lights, a barrow, survey kit,
  // rock pools on the sea shore, a palm, flora
  { type: 'spirhalite_shoring', pos: [TRENCH.x0, 0, TRENCH.z1 - 2.4], rotY: Math.PI / 2, L: TRENCH.z1 - TRENCH.z0 - 4.8, h: 1.0, seed: 31 },
  { type: 'spirhalite_shoring', pos: [TRENCH.x1, 0, TRENCH.z0 + 2.4], rotY: -Math.PI / 2, L: TRENCH.z1 - TRENCH.z0 - 4.8, h: 1.0, seed: 32 },
  { type: 'spirhalite_spoil', pos: [-30.0, 0, -33.6], rotY: Math.PI / 2 + 0.05, L: 2.6, W: 1.3, h: 1.05, seed: 3 },
  { type: 'spirhalite_spoil', pos: [-30.0, 0, -40.2], rotY: Math.PI / 2 - 0.08, L: 2.3, W: 1.3, h: 1.0, seed: 5 },
  { type: 'spirhalite_spoil', pos: [-24.5, 0, -35.2], rotY: Math.PI / 2 + 0.1, L: 2.4, W: 1.3, h: 1.05, seed: 8 },
  { type: 'spirhalite_sieve', pos: [-24.5, 0, -41.2], rotY: Math.PI / 2 },
  { type: 'spirhalite_barrow', pos: [-31.0, 0, -43.8], rotY: -Math.PI / 2 + 0.3 },
  { type: 'spirhalite_tarp', pos: [-22.6, 0, -27.7], rotY: 0.04, w: 3.2, d: 2.8, h: 2.3 },
  { type: 'spirhalite_table', pos: [-22.6, 0, -27.9], rotY: 0.04 },
  { type: 'spirhalite_crates', pos: [-20.4, 0, -29.6], rotY: 0.3, layout: [[0, 0, 0, 0], [0.05, 0, 1, 0.08]] },
  { type: 'spirhalite_worklight', pos: [-25.0, 0, -30.4], rotY: -2.9, h: 2.3, tilt: 0.55 },
  { type: 'spirhalite_worklight', pos: [-31.8, 1.3, -48.8], rotY: 0.2, h: 2.2, tilt: 0.5 },
  { type: 'spirhalite_survey', pos: [-20.2, 0, -36.4], rotY: 1.9 },
  { type: 'spirhalite_lantern', pos: [-30.0, 0, -37.0], rotY: 0.2 },
  { type: 'spirhalite_lantern', pos: [-24.5, 0, -38.3], rotY: 3.3 },
  { type: 'spirhalite_pathlights', pos: [0, 0, 0], rotY: 0, nosnap: true, pts: [[-24.6, -31.4], [-24.4, -45.3], [-30.1, -30.4], [-30.1, -43.4], [-5.9, -35.0], [-5.6, -45.4], [2.4, -45.6]] },
  { type: 'spirhalite_rockpool', pos: [-35.2, 0, -33.6], rotY: 1.4, w: 1.3, d: 0.9, seed: 13 },
  { type: 'spirhalite_rockpool', pos: [-35.1, 0, -41.4], rotY: 1.2, w: 1.5, d: 0.9, seed: 17 },
  { type: 'spirhalite_palm', pos: [-35.0, 0, -37.6], rotY: 0, h: 3.9, lean: 1.2, seed: 27 },
  { type: 'spirhalite_grass', pos: [-30.2, 1.3, -48.0], n: 5, r: 0.8, seed: 32 },
  { type: 'spirhalite_pompoms', pos: [-20.4, 0, -44.0], n: 6, seed: 32 },
  { type: 'spirhalite_kelp', pos: [-20.2, 0, -32.2], rotY: 1.5, seed: 13, L: 1.6 },

  // the base's front (the tombolo, the shoulder's foot): dune grass and flowers, kelp at the lagoon's south end
  { type: 'spirhalite_grass', pos: [1.2, 0, -50.2], n: 6, r: 0.9, seed: 57 },
  { type: 'spirhalite_grass', pos: [-6.4, 0, -51.6], n: 4, r: 0.6, seed: 58 },
  { type: 'spirhalite_pompoms', pos: [-1.6, 0, -49.0], n: 5, seed: 57 },
  { type: 'spirhalite_kelp', pos: [-12.6, 0, -46.0], rotY: 0.1, seed: 16, L: 1.8 },

  // the spoil heap's faces softened by sand slumped against them (dressing: no collider)
  { type: 'spirhalite_spoil', pos: [-30.9, 0, -49.8], rotY: 0.05, L: 2.6, W: 1.0, h: 0.8, seed: 12, nocol: true },
  { type: 'spirhalite_spoil', pos: [-32.5, 0, -48.2], rotY: Math.PI / 2, L: 2.4, W: 0.9, h: 0.9, seed: 14, nocol: true },

  // the spit's root: the supply drop at the dune's foot (its parachute trailing north), a rock outcrop on the sea side,
  // a rock pool, driftwood, flora
  { type: 'spirhalite_supplydrop', pos: [15.3, 0, -31.0], rotY: Math.PI + 0.25, seed: 5 },
  { type: 'spirhalite_rock', pos: [19.4, 0, -40.6], rotY: 0.6, w: 1.5, h: 0.8, seed: 41, moss: true },
  { type: 'spirhalite_rock', pos: [18.4, 0, -41.7], rotY: 1.6, w: 0.8, h: 0.6, seed: 43, nocol: true },
  { type: 'spirhalite_rockpool', pos: [20.3, 0, -43.0], rotY: 0.9, w: 1.3, d: 0.9, seed: 19 },
  { type: 'spirhalite_float', pos: [13.2, 0, -26.4], rotY: 0, r: 0.4 },
  { type: 'spirhalite_grass', pos: [17.0, 0.9, -36.2], n: 5, r: 0.6, seed: 41 },
  { type: 'spirhalite_pompoms', pos: [15.6, 0, -40.4], n: 6, seed: 41 },
  { type: 'spirhalite_kelp', pos: [17.9, 0, -27.8], rotY: 1.8, seed: 14, L: 1.5 },
  { type: 'spirhalite_driftwood', pos: [16.8, 0, -42.3], rotY: 1.15, L: 3.4, seed: 71, two: true },
  { type: 'spirhalite_shrub', pos: [17.2, 0, -33.6], rotY: 0.5, w: 1.4, h: 0.9, seed: 23 },
  { type: 'spirhalite_palm', pos: [18.5, 0, -38.6], rotY: 0, h: 3.6, lean: 1.1, seed: 29 },
  { type: 'spirhalite_buoy', pos: [21.0, 0, -44.2], rotY: 0.8, variant: 1 },

  // the helipad's deck: Deep Cut's cargo lashed down round its rim, clear of the spawn circle and the two stairs (fuel
  // drums at the east and north-west, crate stacks at the back corners, a netted crate at the north-east)
  { type: 'spirhalite_drums', pos: [PAD[0] + 4.95, 3.2, PAD[1] + 0.3], rotY: Math.PI / 2 },
  { type: 'spirhalite_drums', pos: [PAD[0] - 3.5, 3.2, PAD[1] + 3.4], rotY: Math.PI / 4 },
  { type: 'spirhalite_crates', pos: [PAD[0] + 3.3, 3.2, PAD[1] - 3.5], rotY: -Math.PI / 4, layout: [[0, 0, 0, 0], [0.05, 0, 1, 0.06]] },
  { type: 'spirhalite_crates', pos: [PAD[0] - 3.7, 3.2, PAD[1] - 3.1], rotY: Math.PI / 4, layout: [[0, 0, 0, 0], [0.02, 0.03, 1, -0.05]] },
  { type: 'spirhalite_crates', pos: [PAD[0] + 3.4, 3.2, PAD[1] + 3.4], rotY: -Math.PI / 4, layout: [[0, 0, 0, 0], [0.03, 0, 1, 0.04]] },

  // cover on the new ground: crates on the spoil heap, a boulder beside the dig bridge's middle, fallen column drums
  // and camp crates along the camp islet's north beach (the tower's run between them), a rock on the camp's crest, a
  // rock on the neck and on the spit's root
  { type: 'spirhalite_crates', pos: [-29.3, 1.3, -48.3], rotY: 0.15, layout: [[0, 0, 0, 0], [0.04, 0, 1, 0.1]] },
  { type: 'spirhalite_rock', pos: [-13.2, -0.3, -43.1], rotY: 0.5, w: 1.4, h: 1.4, seed: 47, moss: true, nosnap: true },
  { type: 'spirhalite_crates', pos: [-18.6, 0, -54.6], rotY: 0.08, layout: [[0, 0, 0, 0], [1.02, 0.05, 0, 0.06], [0.5, 0.02, 1, 0.1]] },
  { type: 'spirhalite_drums', pos: [-7.8, 0, -55.1], rotY: 0.4 },
  { type: 'spirhalite_rock', pos: [-16.54, 2.5, -61.2], rotY: 0.7, w: 1.3, h: 0.95, seed: 49, moss: true },
  { type: 'spirhalite_rock', pos: [-21.0, 0, -18.2], rotY: 1.1, w: 1.3, h: 0.9, seed: 51, moss: true },
  { type: 'spirhalite_rock', pos: [-19.9, 2.5, -6.4], rotY: 0.3, w: 1.2, h: 0.95, seed: 55, moss: true },   // (the Spine Crest's top)
  { type: 'spirhalite_rock', pos: [14.4, 0, -25.8], rotY: 2.1, w: 1.3, h: 0.9, seed: 53, moss: true },

  // ================= the sea round the islands: the strange vanes (out of bounds)
  { type: 'spirhalite_vane', pos: [-41, 0, -21], rotY: 0.4, h: 4.6, speed: 0.3 },
  { type: 'spirhalite_vane', pos: [34, 0, -44], rotY: -0.3, h: 5.2, speed: 0.22 },
];

// driftwood washed up along the shore where the beach is narrow or the fighting runs along it: logs lying on the
// waterline (0.25 m in from the shore, along it) — kerbs over the step-up height, so nobody walks off into the lagoon
function kerb(a, b, seed, o = {}) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  let nx = -dz / L, nz = dx / L;
  if (!inPoly(OUTLINE, mx + nx * 0.6, mz + nz * 0.6)) { nx = -nx; nz = -nz; }   // (n: toward the land)
  const d = o.in ?? 0.3;
  RAW.push({ type: 'spirhalite_driftwood', pos: [+(mx + nx * d).toFixed(3), 0, +(mz + nz * d).toFixed(3)], rotY: Math.atan2(-dz, dx), L: +(L * (o.k ?? 1.05)).toFixed(2), seed, two: !!o.two });
}
const M = (pts) => pts.map(([x, z]) => sh(x, z));   // (a base shore's points, moved out by the stretch)
for (const [a, b, seed, o] of [
  [[-17.4, -13.8], [-15.0, -12.7], 4],             // the lagoon beach under the Spine Crest …
  [[-15.0, -12.7], [-11.0, -11.5], 9],
  [[-11.0, -11.5], [-7.0, -9.9], 14],
  [[-7.0, -9.9], [-3.95, -8.68], 15, { k: 1.0 }],  // … to the pillar bridge; the central sandbar's shore past it
  [[0.72, -6.91], [4.0, -5.6], 16, { k: 1.0 }],
  [[4.0, -5.6], [8.0, -3.9], 18],
  [[-18.2, -17.0], [-17.4, -13.8], 5],             // the neck: its lagoon side …
  [[-18.4, -21.0], [-18.2, -17.0], 6],
  [[-24.6, -15.6], [-23.4, -18.6], 7],             // … and its inlet side
  [[-23.4, -18.6], [-24.6, -21.4], 8],
  [[-24.6, -21.4], [-26.9, -22.1], 19, { k: 1.0 }],   // the inlet's beaches either side of the causeway
  [[-31.4, -22.85], [-32.6, -23.2], 17, { k: 1.1 }],
  [[-26.9, -15.3], [-24.6, -15.6], 27, { k: 1.0 }],   // the beach under the bastion
  [[-17.8, -24.4], [-18.4, -21.0], 39],
  [[-7.4, -23.8], [-7.9, -26.2], 44],                 // the west pool's beach under the pillar islet
  [[-7.48, -21.39], [-7.4, -23.8], 45],
  [[10.7, -20.4], [10.9, -16.0], 50],                 // the Arch spit: its bay side …
  [[10.9, -16.0], [10.9, -12.4], 51],
  [[10.9, -12.4], [11.3, -10.0], 52],
  [[16.6, -24.4], [15.9, -20.0], 53],                 // … and its sea side along the arch's leg …
  [[15.9, -20.0], [15.9, -14.2], 54],
  [[15.9, -14.2], [16.8, -11.4], 55],
  [[16.8, -11.4], [16.76, -10.25], 57, { k: 1.0 }],        // (up to the bridge's side log)
  [[-31.1, -14.7], [-34.6, -13.2], 43],                // the bend's head over the inlet, west of the causeway
  [[-8.0, 3.9], [-12.0, 2.6], 36],                     // the middle stroke's north shore (the other lagoon's mouth)
  [[-16.0, 1.4], [-20.0, 0.6], 38],
  // the base's shores (moved out by the stretch)
  [...M([[5.4, -22.4], [7.2, -22.9]]), 47],            // the east bay's head
  [...M([[7.2, -22.9], [9.4, -22.5]]), 48],
  [...M([[10.0, -44.6], [16.6, -43.6]]), 34],          // the tail's back beach under the high dune
  [...M([[16.6, -43.6], [19.8, -39.6]]), 35],
  [...M([[19.8, -39.6], [21.0, -35.4]]), 58],          // the tail's east beach at the foot of the pad dune's slope
  [...M([[21.0, -35.4], [20.8, -30.6]]), 59],
  [...M([[-9.4, -42.4], [-8.4, -39.8]]), 28],          // round the pinch inlet
  [...M([[-8.4, -39.8], [-7.0, -39.3]]), 29, { k: 1.1 }],
  [...M([[-7.0, -39.3], [-5.2, -40.3]]), 30, { k: 1.1 }],
  [...M([[-5.2, -40.3], [-4.2, -42.4]]), 31],
  [...M([[-4.2, -42.4], [-2.2, -44.0]]), 32],
  [...M([[-23.8, -43.4], [-17.0, -44.6]]), 24],        // the camp's south beach under the crest
  [...M([[-17.0, -44.6], [-11.6, -44.2]]), 26],
]) kerb(a, b, seed, o);
// the slice's new shores (the stretch): driftwood along the dig's two shores, the lagoon's south end, the tide-pool
// islet's west shore, the pillar islet's south beach (parted for the rope bridge's foot) and both sides of the spit's
// root; the ford's edges and the tide-pool islet's east shore by the tower's goal run get a rope on driftwood stakes
// instead (a rail: the tide runs over the ford, and the tower runs close by the east shore)
function rope(a, b, seed) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  let nx = -dz / L, nz = dx / L;
  if (!inPoly(OUTLINE, mx + nx * 0.6, mz + nz * 0.6)) { nx = -nx; nz = -nz; }
  RAW.push({ type: 'spirhalite_ropefence', pos: [+(a[0] + nx * 0.45).toFixed(3), -0.12, +(a[1] + nz * 0.45).toFixed(3)], rotY: Math.atan2(-dz, dx), L: +L.toFixed(2), seed, bare: true, h: 0.95 });
}
const pairs = (pts) => pts.slice(1).map((q, i) => [pts[i], q]);
let seedK = 100;
for (const [a, b] of [
  ...pairs([[-32.6, -23.2], ...DIG_SEA, sh(-35.4, -31.4)]),
  ...pairs([TIDE_W[2], TIDE_W[3], ...DIG_LAGOON.slice(0, 4)]), ...pairs([...DIG_LAGOON.slice(5), [-17.8, -24.4]]),
  [[-7.52, -42.2], TIDE_W[2]], [DIG_LAGOON[3], [-18.72, -42.1]], [[-19.27, -37.8], DIG_LAGOON[5]],   // (parted for the dig bridge's landings, z −42 … −38)
  [TIDE_W[0], [-8.13, -37.8]],
  [PILLAR_S[0], [0.1, -27.79]], [[2.7, -27.1], PILLAR_S[2]], [PILLAR_S[2], PILLAR_S[3]],   // (parted for the rope bridge's foot and the east bay's bridge)
  [[-1.5, -34.16], TIDE_E[6]],                                                                                   // (the notch's beach west of the shelf)
  [sh(5.4, -22.4), TIDE_E[0]],                                                                                   // (the east bay's head, west of the old one)
  [[10.72, -20.6], [10.84, -21.5]], [[10.94, -24.6], [11.25, -26.6]],                                           // (the spit's bay side either side of the east bay's bridge)
  ...pairs([...SPIT_BAY, sh(9.4, -22.5)]),   // (the spit's bay side from the east bay's bridge on)
  ...pairs([sh(19.0, -26.8), ...SPIT_SEA, [16.6, -24.4]]),
]) kerb(a, b, seedK++);
for (const [a, b] of [
  ...pairs([[-7.9, -26.2], ...FORD_W, TIDE_W[0]]), ...pairs([TIDE_E[6], ...FORD_E, PILLAR_S[0]]),   // (the ford's west rope carried on round the islet's north-west corner)
  ...pairs(TIDE_E.slice(0, 3)),
]) rope(a, b, seedK++);

// the pillar headland's rope ring: 0.45 m in from its shore, round from the west pool to the east bay, parted for the
// bridge (its side logs close the gap)
{
  const R = PILLAR.isle - 0.45, at = (a) => [+(PILLAR.x + Math.cos(a * DEG) * R).toFixed(3), +(PILLAR.z + Math.sin(a * DEG) * R).toFixed(3)];
  const g = (Math.acos(2.0 / R) * 180) / Math.PI;   // (the bridge's side logs: 2 m either side of its axis)
  for (const [a0, a1] of [[205, 180 - g], [g, -25]]) {
    const n = Math.max(1, Math.round(Math.abs(a1 - a0) / 17));
    for (let i = 0; i < n; i++) {
      const p = at(a0 + ((a1 - a0) * i) / n), q = at(a0 + ((a1 - a0) * (i + 1)) / n);
      RAW.push({ type: 'spirhalite_ropefence', pos: [p[0], -0.12, p[1]], rotY: Math.atan2(-(q[1] - p[1]), q[0] - p[0]), L: +Math.hypot(q[0] - p[0], q[1] - p[1]).toFixed(2), seed: 40 + i + (a0 > 100 ? 0 : 10) });
    }
  }
}

// snap the ground-standing dressing onto the real ground (pos[1] is the hint: 0 = the sand, 1.3 = a dune top …)
export const PLACEMENTS = RAW.map((it) => (SNAP.test(it.type) && !it.nosnap ? { ...it, pos: [it.pos[0], groundAt(it.pos[0], it.pos[2], it.pos[1]), it.pos[2]] } : it));
