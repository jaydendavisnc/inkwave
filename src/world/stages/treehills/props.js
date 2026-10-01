// Eco-Forest Treehills — stage prop pack + placements (owner: the treehills stage; see layout.js for the folder contract).
//
// register(D, H): this stage's own prop builders (types prefixed 'treehills_'), same contract as props-marina-dock.js: H
// carries THREE + the PropKit helpers. The builders live in modules by theme:
//   kit.js       the shared toolkit: palette, geometry helpers, stroke font, railings, valves, evergreens, shrubs
//   station.js   the research station (façade, back module, dish, balloon), greenhouse pod, seed-bank kiosk + crates, solar
//   flora.js     evergreens, cypress clumps, planters, pollinator borders, shrub fringes; the sprout pods and hedges
//   fittings.js  the wind turbine, lamps, bollards, totems, the stage sign, railings, benches, sprinklers, wall valves
//   nursery.js   the nursery (the stretch's new land): seedbeds, cloches, the potting shed and benches, pot stacks, the
//                channel's pump house, sluice and coping, the turbine's transformer, a bean trellis
// PLACEMENTS: this stage's set dressing (half list: every entry is mirrored (x,z) → (-x,-z) with rotY + π unless it says
// `mirror: false`). Authored on Alpha's half and the whole east tree-hill (x ≥ 15; the west hill is its twin) — never
// on the west hill itself. Solid props hand the level collision boxes; turned ones keep turned colliders (oboxCols).
// Keep clear of the Tower Command track (plan.js TRACK: |z| < 1.9 across the meadow and up the hill, x 22.1 … 25.9
// along the upper tier and the north strip, z 29.1 … 32.9 to the goal) and its headroom.
import { makeKit } from './kit.js';
import { registerStation } from './station.js';
import { registerFlora } from './flora.js';
import { registerFittings } from './fittings.js';
import { registerPlaza } from './plaza.js';
import { registerWorks } from './works.js';
import { registerNursery } from './nursery.js';
import { FEET, GROUND, PODS, GATES, HEDGES } from './layout.js';
import { T1, T2, T3, SP, NT, CH_Y, TURBINE, NTURBINE, GREENHOUSE, RILL_Y, GROVES, BED_H, TERRACE, DECK, mz } from './plan.js';

const P = Math.PI, HP = P / 2;

export function register(D, H) {
  const T = makeKit(H);
  D.treehills_foot = {
    desc: 'footprint slab under a raised tier (collision-only, hidden): the environment reads the deck outline from it',
    build(B, o) { B.col(-o.len / 2 + 0.02, -2.4, -o.w / 2 + 0.02, o.len / 2 - 0.02, -0.02, o.w / 2 - 0.02); },
  };
  registerStation(D, H, T);
  registerFlora(D, H, T);
  registerFittings(D, H, T);
  registerPlaza(D, H, T);
  registerWorks(D, H, T);
  registerNursery(D, H, T);
}

// merged footprint rects for the raised regions' columns (adjacent columns with one z-span join up)
function footOf(cols) {
  const byZ = new Map();
  for (const c of cols) { const k = c.min[2] + '|' + c.max[2]; if (!byZ.has(k)) byZ.set(k, []); byZ.get(k).push([c.min[0], c.max[0], c.min[2], c.max[2]]); }
  const out = [];
  for (const list of byZ.values()) {
    list.sort((a, b) => a[0] - b[0]);
    let cur = null;
    for (const r of list) { if (cur && Math.abs(cur[1] - r[0]) < 1e-4) cur[1] = r[1]; else { if (cur) out.push(cur); cur = [...r]; } }
    if (cur) out.push(cur);
  }
  return out.map(([x0, x1, z0, z1]) => ({ type: 'treehills_foot', pos: [(x0 + x1) / 2, 0, (z0 + z1) / 2], rotY: 0, len: x1 - x0, w: z1 - z0 }));
}
// (lite below 6.8 m: the forest's fill trees — the tall ones keep every tier)
const tree = (x, y, z, h, o = {}) => ({ type: 'treehills_tree', pos: [x, y, z], h, kind: o.kind ?? 'hinoki', seed: o.seed ?? Math.round(Math.abs(x * 7 + z * 3)) % 9, w: o.w ?? 0.8, lite: h < 6.8, ...o });
const rail = (pts, y, o = {}) => ({ type: 'treehills_rail', pos: [0, 0, 0], rotY: 0, pts: pts.map(([x, z]) => [x, y, z]), ...o });
// a point pulled 0.35 m in from an outline corner toward a reference point (railings stand just inside the coping)
const inset = (p, c, d = 0.4) => { const dx = c[0] - p[0], dz = c[1] - p[1], L = Math.hypot(dx, dz); return [p[0] + (dx / L) * d, p[1] + (dz / L) * d]; };

// a grove (plan.js GROVES) → its plants: trees on a 1.45 m hex lattice (rows 1.256 m apart) inside the bed (0.55 m in
// from its edge; a narrow bed: one file), the lattice's phase chosen to fit the most points; the n nearest the bed's middle are trees (the
// tallest in the middle; cores 1.1 m, so neighbours' cores stand 0.35 m apart: one solid clump, no pockets), the next m
// shrubs; ferns round the rim. The bed's lift (BED_H) under them; no mulch rings of their own (the bed is the mulch).
const hs = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export function groveParts(g) {
  const a = (g.deg * P) / 180, ux = [Math.cos(a), -Math.sin(a)], uz = [Math.sin(a), Math.cos(a)];
  const W = (lx, lz) => [+(g.x + lx * ux[0] + lz * uz[0]).toFixed(3), +(g.z + lx * ux[1] + lz * uz[1]).toFixed(3)];
  const S = 1.45, RS = S * 0.866, ix = g.w / 2 - 0.55, iz = g.d / 2 - 0.55;
  let best = [];
  // or (a narrow bed, when it fits more) one file along its long side, 1.3 m apart (cores overlapping), zigzagging a little
  {
    const lim = Math.max(ix, iz), zig = Math.max(0, Math.min(0.15, Math.min(ix, iz)));
    for (const f of [0, 0.5]) {
      const pts = [];
      for (let k = -8; k <= 8; k++) { const s = (k + f) * 1.3; if (Math.abs(s) <= lim + 1e-6) pts.push(ix >= iz ? [s, (k % 2 ? 1 : -1) * zig] : [(k % 2 ? 1 : -1) * zig, s]); }
      if (pts.length > best.length) best = pts;
    }
  }
  for (const fz of [0, 0.5]) for (const fx of [0, 0.5]) {
    const pts = [];
    for (let k = -6; k <= 6; k++) for (let j = -6; j <= 6; j++) {
      const lz = (k + fz) * RS, lx = (j + fx + (Math.abs(k) % 2) * 0.5) * S;
      if (Math.abs(lx) <= ix + 1e-6 && Math.abs(lz) <= iz + 1e-6) pts.push([lx, lz]);
    }
    if (pts.length >= best.length) best = pts;
  }
  best.sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]) || p[0] - q[0] || p[1] - q[1]);
  const tp = g.pts || best.slice(0, g.n), sp = g.spts || (g.pts ? [] : best.slice(g.n, g.n + g.m));
  const y = g.y + (g.bed ? BED_H : 0), out = [];
  tp.forEach(([lx, lz], i) => {
    const r = hs(g.seed * 7 + i), h = i === 0 ? g.hmax : g.hmax * (0.72 + 0.22 * r), kind = hs(g.seed * 3 + i * 5) < 0.62 ? 'hinoki' : 'thujopsis';
    const [x, z] = W(lx + (hs(g.seed + i * 11) - 0.5) * 0.16, lz + (hs(g.seed * 5 + i) - 0.5) * 0.16);
    out.push(tree(x, y, z, +h.toFixed(2), { kind, seed: (g.seed * 3 + i) % 9, w: kind === 'hinoki' ? 0.8 + 0.1 * r : 0.72, core: 1.1, mulch: false }));
  });
  sp.forEach(([lx, lz], i) => {
    const [x, z] = W(lx, lz);
    out.push({ type: 'treehills_shrubs', pos: [x, y, z], w: 1.15, h: 1.05 + 0.2 * hs(g.seed + i), seed: g.seed * 2 + i });
  });
  // ferns: round the rim, every ~1.3 m, 0.35 m in from the bed's edge
  const per = 2 * (g.w + g.d), nf = Math.max(3, Math.round(per / 1.6));
  for (let f = 0; f < nf; f++) {
    let t = ((f + 0.5) / nf) * per, lx, lz;
    const ex = g.w / 2 - 0.4, ez = g.d / 2 - 0.4;
    if (t < g.w) { lx = -g.w / 2 + t; lz = -ez; } else if ((t -= g.w) < g.d) { lx = ex; lz = -g.d / 2 + t; } else if ((t -= g.d) < g.w) { lx = g.w / 2 - t; lz = ez; } else { t -= g.w; lx = -ex; lz = g.d / 2 - t; }
    lx = Math.max(-ex, Math.min(ex, lx)); lz = Math.max(-ez, Math.min(ez, lz));
    if (hs(g.seed * 13 + f) < 0.3) continue;
    const [x, z] = W(lx, lz);
    out.push({ type: 'treehills_ferns', pos: [x, y, z], r: 0.42 + 0.2 * hs(g.seed + f * 3), seed: (g.seed + f) % 9 });
  }
  return out;
}

// the stretch: the hand placements below are authored where they always stood; mv moves the base's out with it (plan.js
// mz: beyond the cut, D further from mid — the station, the base terrace, the lobe's tip, the strip's end)
const mv = (p) => ({ ...p, pos: [p.pos[0], p.pos[1], mz(p.pos[2])], ...(p.pts ? { pts: p.pts.map(([x, y, z]) => [x, y, mz(z)]) } : {}) });

// the nursery's set dressing (Alpha's half, and the west strip's stretch through it authored on the east hill's north
// strip, x 15 … 28, z 26 … 48 — the west hill is its twin)
const DY = T2 + 0.02;   // (the potting deck's decking)
const NURSERY_PLACEMENTS = [
  // ---- the potting deck (T2): the potting shed on its south-west corner (its glazed lean-to and bench face mid), a
  //      potting bench along its east edge; the service lane over it (x 0.1 … 3.9) and the stairs' landings stay open
  { type: 'treehills_pottingshed', pos: [-2.45, DY, -39.72], rotY: 0, seed: 3 },
  { type: 'treehills_pbench', pos: [0.6, DY, -40.55], rotY: 0, w: 2.4, seed: 5 },
  { type: 'treehills_planter', pos: [1.4, DY, -33.5], rotY: 0, w: 1.3, d: 0.8, h: 1.0, seed: 43, tree: 0.2 },
  { type: 'treehills_potstack', pos: [7.2, DY, -35.2], rotY: HP, seed: 4 },
  { type: 'treehills_totem', pos: [8.6, T1, -32.4], rotY: -HP, num: 'N-7', lines: [['POTTING DECK'], ['v STATION 07']] },
  // ---- the seedbed terrace (NT): raised beds along its front and back either side of the stairs, a long bed down its
  //      middle (the aisle round it from the side stair to the deck's flight)
  { type: 'treehills_seedbed', pos: [-13.25, NT, -33.85], rotY: 0, w: 1.3, d: 1.1, kind: 'frame', seed: 11 },
  { type: 'treehills_seedbed', pos: [-9.9, NT, -37.4], rotY: 0, w: 5.4, d: 1.2, kind: 'hoops', seed: 13 },
  { type: 'treehills_seedbed', pos: [-6.15, NT, -40.3], rotY: P, w: 4.3, d: 1.1, seed: 15 },
  // ---- the nursery floor in front (mid side): cloches along the terrace's front, a lamp by its stair, saplings by the
  //      deck's east stair
  { type: 'treehills_cloches', pos: [-14.1, T1, -32.45], rotY: 0, n: 2, seed: 3 },
  { type: 'treehills_lamp', pos: [-8.3, T1, -32.6], rotY: 0 },
  { type: 'treehills_saplings', pos: [8.4, T1, -27.2], rotY: 0, w: 2.6, d: 1.6, num: 'C-11', seed: 4 },
  // ---- the zone (x 8 … 18.5, z −26.5 … −36.5): a seedbed down its middle, a plant trolley, a water tank on the lobe's
  //      lane; the cloche row along its south edge
  { type: 'treehills_seedbed', pos: [12.2, T1, -31.5], rotY: HP, w: 4.0, d: 1.2, seed: 21 },
  { type: 'treehills_trolley', pos: [10.6, T1, -30.4], rotY: 0.3, seed: 2 },
  { type: 'treehills_tank', pos: [17.0, T1, -28.4], r: 0.8, h: 1.8 },
  { type: 'treehills_cloches', pos: [14.5, T1, -37.5], rotY: 0, n: 4, seed: 7 },
  // ---- south-east: the propagation tunnel by the channel, saplings by the lobe, the nursery's turbine in the lobe's
  //      bay and its transformer
  { type: 'treehills_polytunnel', pos: [12.0, T1, -44.2], rotY: 0, L: 5, R: 1.3 },
  { type: 'treehills_turbine', pos: [NTURBINE.x, T1, NTURBINE.z], rotY: -HP, hub: NTURBINE.hub },
  { type: 'treehills_transformer', pos: [20.2, T1, -41.2], rotY: -HP },
  // ---- the irrigation channel along the base terrace's front: the footbridge on the axis, stepping stones either side,
  //      the intake pump house at its west end, a sluice at its east end, the coping along both banks
  { type: 'treehills_footbridge', pos: [0, T1, -47.3], rotY: HP, L: 2.6, w: 3.0 },
  { type: 'treehills_stones', pos: [-7.2, T1, -47.3], rotY: HP, n: 3, y0: CH_Y - T1, seed: 3 },
  { type: 'treehills_stones', pos: [8.6, T1, -47.3], rotY: HP, n: 3, y0: CH_Y - T1, seed: 6 },
  { type: 'treehills_pumphouse', pos: [-13.6, T1, -47.6], rotY: 0, chan: T1 - CH_Y },
  { type: 'treehills_sluice', pos: [13.6, T1, -47.3], rotY: HP, w: 1.4, y0: CH_Y - T1 },
  { type: 'treehills_chanedge', pos: [1, T1, -46.49], rotY: 0, L: 26 },
  { type: 'treehills_chanedge', pos: [1, T1, -48.11], rotY: 0, L: 26 },
  // ---- the west strip's stretch (authored on the north strip, x 15 … 28, z 26 … 57; Alpha's is its twin): the orchard
  //      bank (NT) against the reservoir edge — its groves (plan.js), a water tank, saplings, beehives — the strip's lane
  //      between it and the nursery (its trail: plan.js), saplings by the tower's lane down to the base terrace
  { type: 'treehills_tank', pos: [20.6, NT, 31.2], r: 0.6, h: 1.6 },
  { type: 'treehills_saplings', pos: [23.6, NT, 31.6], rotY: P, w: 2.0, d: 1.4, num: 'B-03', seed: 17 },
  { type: 'treehills_hives', pos: [21.0, NT, 36.9], rotY: HP, n: 3 },
  { type: 'treehills_saplings', pos: [17.0, T1, 49.0], rotY: P, w: 2.0, d: 1.6, num: 'C-21', seed: 19 },
  // ---- the service lanes' timber edging (the gravel against the lawn), flower strips along the terrace's back and the
  //      lanes, lamps at the lanes' corners, a staked young tree by the channel, crates by the garden's west corner
  { type: 'treehills_edging', pos: [-6.2, T1, -29.4], rotY: 0, L: 17.6 },
  { type: 'treehills_edging', pos: [2.6, T1, -31.2], rotY: HP, L: 3.6 },
  { type: 'treehills_edging', pos: [5.4, T1, -31.2], rotY: HP, L: 3.6 },
  { type: 'treehills_edging', pos: [5.4, T1, -27.7], rotY: HP, L: 3.4 },
  { type: 'treehills_edging', pos: [2.6, T1, -41.95], rotY: HP, L: 1.9 },
  { type: 'treehills_edging', pos: [5.4, T1, -44.75], rotY: HP, L: 3.7 },
  { type: 'treehills_edging', pos: [-6.2, T1, -42.9], rotY: 0, L: 17.6 },
  { type: 'treehills_border', pos: [-14, T1, -41.45], rotY: 0, L: 2.9, d: 0.7, seed: 21 },
  { type: 'treehills_border', pos: [-7.9, T1, -41.45], rotY: 0, L: 4.8, d: 0.7, seed: 23 },
  { type: 'treehills_border', pos: [-15, T1, -29.85], rotY: 0, L: 5.6, d: 0.7, seed: 25 },
  { type: 'treehills_lamp', pos: [-14.6, T1, -30.2], rotY: 0 },
  { type: 'treehills_lamp', pos: [-2.4, T1, -42.2], rotY: P },
  { type: 'treehills_lamp', pos: [9.2, T1, -41.4], rotY: P },
  tree(6.8, T1, -45.8, 4.4, { seed: 5, w: 0.7, core: 0.8 }),
  { type: 'treehills_crates', pos: [-11.8, T1, -24.4], rotY: 0.12, n: 3 },
  // planters flanking the garden stair's head on the hardstanding (the old base terrace had two here before the stretch
  // moved it out: the stair's top was open)
  { type: 'treehills_planter', pos: [5.6, T1, -25.4], rotY: 0, w: 1.8, d: 0.8, h: 1.0, seed: 45 },
  { type: 'treehills_planter', pos: [-6.6, T1, -25.4], rotY: 0, w: 1.6, d: 0.8, h: 1.0, seed: 47, tree: -0.2 },
  { type: 'treehills_saplings', pos: [11.8, T1, -50.2], rotY: 0, w: 3.0, d: 1.6, num: 'C-02', seed: 13 },
  { type: 'treehills_trolley', pos: [15.6, T1, -34.4], rotY: -0.4, seed: 8 },
  // ---- the station's forecourt (the goal-ready spot in front of the deck stair: kept open, a little cover to re-form
  //      behind) — a planter and a plant trolley either side of the footbridge's landing
  { type: 'treehills_planter', pos: [-2.6, T1, -51.0], rotY: 0, w: 1.6, d: 0.8, h: 1.0, seed: 41 },
  { type: 'treehills_trolley', pos: [3.2, T1, -51.6], rotY: 0.2, seed: 11 },
];

export const PLACEMENTS = [
  // ================= the environment's footprint under the raised tiers (their columns and copings) and the station
  ...Object.keys(GROUND).filter((k) => !['gardenN', 'rill', 'gardenS'].includes(k)).flatMap((k) => footOf(GROUND[k].cols)),
  ...FEET.map((f) => ({ type: 'treehills_foot', pos: [f.cx, 0, f.cz], rotY: (f.rot * P) / 180, len: f.len, w: f.w, oboxCols: true })),
  { type: 'treehills_foot', pos: [0, 0, mz(-42.5)], rotY: 0, len: 18, w: 9 },

  // ================= the sprout pods: the planters are the stage's (static colliders, baked, turned ones kept turned);
  //                   the bulbs and hedges are the pods engine's (src/game/pods.js)
  ...PODS.list.map((p) => ({ type: 'treehills_pod', part: 'planter', kind: p.kind || null, col: p.col, pos: p.pos, rotY: p.rotY, oboxCols: true })),
  // the rill hedge (layout.js GATES): its lengths between the gateways, a topiary gate post either side of each gap
  ...(() => {
    const R = GATES.rill, cuts = R.gates.map((g) => [g.x - g.len / 2, g.x + g.len / 2]).sort((p, q) => p[0] - q[0]), out = [];
    let a = R.x0;
    for (let k = 0; k <= cuts.length; k++) {
      const b = k < cuts.length ? cuts[k][0] : R.x1;
      if (b - a > 0.3) out.push({ type: 'treehills_hedgerow', pos: [(a + b) / 2, 0, R.z], rotY: 0, w: b - a, h: R.h, d: R.d, post: k === 0 ? 'b' : k === cuts.length ? 'a' : 'both', seed: 7 + k, oboxCols: true });
      if (k < cuts.length) a = cuts[k][1];
    }
    return out;
  })(),
  // the flank gates' hedgerows (layout.js HEDGES)
  ...HEDGES.map((hd, k) => ({ type: 'treehills_hedgerow', pos: [hd.x, hd.y, hd.z], rotY: hd.deg * Math.PI / 180, w: hd.w, h: hd.h, d: hd.d, post: hd.post, seed: 21 + k, oboxCols: true })),
  // ================= the forest's groves (plan.js GROVES: already where the stretch puts them)
  ...GROVES.flatMap(groveParts),
  // ================= the hand placements
  ...[
  // ================= the research station (spawn) and the base terrace (T1): a working apron — the greenhouse, cargo
  //                   modules, seed-bank crates, a solar rack, the drone pad, the antenna mast; consoles on the deck
  { type: 'treehills_station', pos: [0, 0, -42.5], rotY: 0 },
  { type: 'treehills_console', pos: [7.4, SP, -39.1], rotY: 0, w: 1.4 },
  { type: 'treehills_console', pos: [-7.4, SP, -39.1], rotY: 0, w: 1.4 },
  { type: 'treehills_planter', pos: [4.3, SP, -38.55], rotY: 0, w: 1.6, d: 0.8, h: 1.0, seed: 31 },
  { type: 'treehills_planter', pos: [-4.3, SP, -38.55], rotY: 0, w: 1.6, d: 0.8, h: 1.0, seed: 33 },
  { type: 'treehills_planter', pos: [4.8, T1, -28.6], rotY: 0, w: 1.8, d: 0.8, h: 1.0, seed: 35, tree: 0.2 },
  { type: 'treehills_greenhouse', pos: [-8.5, T1, -34.8], rotY: 0, L: 6, R: 1.55, num: 'G-2', seed: 3 },
  // (the cargo module 3.6 m east of where it stood before the stretch: the channel and its pump house took its old corner)
  { type: 'treehills_cargo', pos: [-7.2, T1, -27.6], rotY: 0, L: 5.5, num: 'ALT-07' },
  { type: 'treehills_crates', pos: [10.2, T1, -31.4], rotY: 0.18, n: 3 },
  { type: 'treehills_solar', pos: [6.2, T1, -35.6], rotY: 0, w: 3.0 },
  { type: 'treehills_planter', pos: [7.4, T1, -37.4], rotY: 0, w: 2.6, d: 0.7, h: 0.55, seed: 19 },
  { type: 'treehills_crates', pos: [-12.6, T1, -39.6], rotY: HP, n: 2 },
  { type: 'treehills_dronepad', pos: [17.6, T1, -42.4], rotY: 0.3 },   // (off the garden's south-east rim: its hedge runs there)
  { type: 'treehills_mast', pos: [13.9, T1, -39.4], rotY: 0.5, h: 8 },
  { type: 'treehills_bench', pos: [-14.2, T1, -35.4], rotY: HP },
  { type: 'treehills_lamp', pos: [-14.3, T1, -24.8], rotY: HP },
  { type: 'treehills_lamp', pos: [14.3, T1, -37.4], rotY: -HP },
  { type: 'treehills_totem', pos: [-4.6, T1, -25.7], rotY: 0, lines: [['^ MEADOW'], ['SEED BANK 05 >']] },
  { type: 'treehills_padring', pos: [-5.47, T1, -30.0], rotY: 0 },
  { type: 'treehills_bollard', pos: [4.1, T1, -25.5] },
  { type: 'treehills_bollard', pos: [-4.1, T1, -32.4] },
  { type: 'treehills_bollard', pos: [4.1, T1, -32.4] },

  // ================= the working garden (0): the rill (footbridge, stepping stones), a polytunnel, the tool shed, a
  //                   water tank, raised beds; the central path stair → footbridge → the plaza's ramp stays open
  { type: 'treehills_footbridge', pos: [-0.6, 0, -16.7], rotY: HP, L: 1.8 },   // (just the rill, landing in the footbridge gate's west way)
  { type: 'treehills_stones', pos: [-7.2, 0, -16.8], rotY: HP, n: 3, y0: RILL_Y, seed: 2 },
  { type: 'treehills_stones', pos: [8.4, 0, -16.8], rotY: HP, n: 3, y0: RILL_Y, seed: 5 },
  { type: 'treehills_polytunnel', pos: [9.2, 0, -20.0], rotY: 0, L: 6, R: 1.4 },
  { type: 'treehills_shed', pos: [-8.4, 0, -21.4], rotY: 0 },   // (1.8 m back from the stones gate: sliding off its roof you drop short of the gate's top)
  // the tank tucked into the garden's south-west corner (against the wall, its coping alongside: no slot behind it)
  { type: 'treehills_tank', pos: [-6.71, 0, -24.05], r: 0.9, h: 2.0 },
  { type: 'treehills_planter', pos: [-5.6, 0, -20.4], rotY: 0, w: 2.6, d: 1.1, h: 0.6, seed: 23 },   // (1.3 m back from the stones gate)
  { type: 'treehills_planter', pos: [5.8, 0, -23.3], rotY: 0, w: 2.6, d: 1.1, h: 0.6, seed: 29, flowers: ['#f2d45a', '#e98ab0', '#b79ae6'] },
  { type: 'treehills_shrubs', pos: [-4.5, 0, -15.2], w: 1.2, h: 1.0, seed: 3, flowers: true },
  { type: 'treehills_shrubs', pos: [9.6, 0, -15.1], w: 1.2, h: 1.0, seed: 9, flowers: true },
  { type: 'treehills_lamp', pos: [-5.0, 0, -22.2], rotY: 0 },
  { type: 'treehills_sprinkler', pos: [-6, 0, -17.9] }, { type: 'treehills_sprinkler', pos: [5, 0, -18.4] },
  { type: 'treehills_wallvalve', pos: [-5.35, 0.72, -25], rotY: 0, label: 'W-07' },
  { type: 'treehills_hatch', pos: [-4.6, 0.64, -25], rotY: 0, r: 0.4, num: '07' },

  // ================= the Seed Vault Plaza (1.3) and the Solar Canopy over it; the meadow round it: the greenhouse pod,
  //                   the mounds (layout), a boulder, a fallen log, pairs of boulders at the ramp's foot
  { type: 'treehills_canopy', pos: [0, 0, 0], rotY: 0, mirror: false },
  { type: 'treehills_clump', pos: [-5.0, T1, -3.9], seed: 12, r: 0.9 },
  { type: 'treehills_console', pos: [2.0, T1, -4.2], rotY: 0, w: 1.6 },
  { type: 'treehills_greenhouse', pos: [GREENHOUSE.x, 0, GREENHOUSE.z], rotY: 0, L: GREENHOUSE.L, R: GREENHOUSE.R, num: 'G-7', seed: 7 },
  { type: 'treehills_boulder', pos: [4.7, 0, -8.0], w: 1.5, h: 1.3, d: 1.2, seed: 4 },
  { type: 'treehills_log', pos: [10.8, 0, -3.4], rotY: 0.08, L: 3.2 },
  { type: 'treehills_boulder', pos: [-2.4, 0, -13.2], w: 1.2, h: 1.0, d: 1.0, seed: 6 },
  { type: 'treehills_boulder', pos: [2.5, 0, -13.7], w: 1.3, h: 1.1, d: 1.1, seed: 8 },
  { type: 'treehills_shrubs', pos: [12.3, 0.8, -11.05], w: 1.2, h: 1.2, seed: 25 },
  // the narrow end of the V between the east mound's ramp and the band's wall (0.6 m at its tip: a bot wedged there),
  // filled: a boulder in the tip, a shrub behind it — what's left opens south, 1.8 m and wider
  { type: 'treehills_boulder', pos: [14.5, 0, -8.95], w: 1.1, h: 1.0, d: 1.0, seed: 21 },
  { type: 'treehills_shrubs', pos: [14.3, 0, -10.2], w: 1.2, h: 1.1, seed: 33 },
  { type: 'treehills_boulder', pos: [-12.0, 0.6, -5.2], w: 1.1, h: 1.0, d: 0.9, seed: 14 },
  { type: 'treehills_sprinkler', pos: [-6, 0, -10.6] }, { type: 'treehills_sprinkler', pos: [7.6, 0, -2.8] },

  // ================= the east tree-hill (authored whole; the west hill is its twin): a forest — the groves (plan.js
  //                   GROVES: a bed each, planted as one solid clump) on every terrace, winding trails between them
  //                   (the lobe's stepping stones, the murals' gravel), clearings for the ranger shelter, the solar
  //                   array and the turbine
  // ---- the south lobe (T1, Alpha's left lane)
  // a tree line along the lobe's water edge (on the coping: the lane stays inside), the corner grove's flank
  tree(21.9, T1, -24.57, 7.4, { kind: 'thujopsis', seed: 7, w: 0.74, core: 1.0 }),
  tree(23.72, T1, -23.51, 6.2, { seed: 1, w: 0.82, core: 1.0 }),
  tree(26.21, T1, -20.3, 7.8, { seed: 6, w: 0.8, core: 1.0 }),
  tree(28.61, T1, -16.15, 6.0, { kind: 'thujopsis', seed: 3, w: 0.74, core: 1.0 }),
  { type: 'treehills_boulder', pos: [27.9, T1, -17.9], w: 1.3, h: 1.1, d: 1.1, seed: 9 },
  { type: 'treehills_lamp', pos: [19.9, T1, -17.4], rotY: -HP },
  { type: 'treehills_shrubs', pos: [19.0, T1, -15.2], w: 1.0, h: 1.1, seed: 27 },
  { type: 'treehills_totem', pos: [26.5, T1, -13.9], rotY: 0, lines: [['^ TURBINE HILL'], ['< MEADOW']] },
  { type: 'treehills_ferns', pos: [21.2, T1, -24.4], r: 0.6, seed: 4 }, { type: 'treehills_ferns', pos: [17.6, T1, -24.9], r: 0.5, seed: 8 },
  // ---- the band (T1) along the meadow: lamps by the upper tier's wall, shrubs at its foot, the groves between
  { type: 'treehills_lamp', pos: [19.05, T1, -6.2], rotY: -HP },
  { type: 'treehills_lamp', pos: [19.05, T1, 9.6], rotY: -HP },
  { type: 'treehills_hives', pos: [18.8, T1, -12.6], rotY: HP, n: 3 },
  { type: 'treehills_shrubs', pos: [18.9, T1, 4.2], w: 1.2, h: 1.1, seed: 15 },
  { type: 'treehills_shrubs', pos: [18.9, T1, -4.5], w: 1.2, h: 1.1, seed: 17 },
  { type: 'treehills_fringe', pos: [19.2, T1, 9.1], rotY: -HP, L: 2.6, seed: 9 },
  { type: 'treehills_fringe', pos: [19.2, T1, 6.1], rotY: -HP, L: 2.4, seed: 5 },
  { type: 'treehills_hatch', pos: [19.5, 1.95, -7.2], rotY: -HP, num: 'T-1' },
  { type: 'treehills_wallvalve', pos: [19.5, 1.9, 15.2], rotY: -HP, label: 'IRR 4' },
  { type: 'treehills_hatch', pos: [15, 0.62, -19.2], rotY: -HP, r: 0.4, num: 'B-3' },
  { type: 'treehills_wallvalve', pos: [15, 0.7, 11.6], rotY: -HP, label: 'IRR 2' },
  // ---- the upper tier (T2): the ranger shelter's clearing, the solar array in the south prow, the hives
  { type: 'treehills_ranger', pos: [23.2, T2 + 0.08, -4.6], rotY: 0 },
  { type: 'treehills_birdhouse', pos: [21.45, T2 + 0.08, -2.5], rotY: -HP },
  { type: 'treehills_bench', pos: [25.75, T2, -8.75], rotY: -HP },
  { type: 'treehills_totem', pos: [19.95, T2, -8.3], rotY: -HP, num: 'T-2', lines: [['RANGER POST'], ['CROWN TRAIL']] },
  { type: 'treehills_ferns', pos: [21.65, T2, 7.7], r: 0.42, seed: 2 }, { type: 'treehills_ferns', pos: [21.65, T2, 13.2], r: 0.42, seed: 5 },
  { type: 'treehills_ferns', pos: [26.15, T2, 4.2], r: 0.4, seed: 7 }, { type: 'treehills_ferns', pos: [26.15, T2, 7.6], r: 0.4, seed: 1 }, { type: 'treehills_ferns', pos: [26.2, T2, 11.9], r: 0.4, seed: 4 },
  { type: 'treehills_solar', pos: [31.7, T2, -5.9], rotY: HP, w: 2.8 },
  { type: 'treehills_hives', pos: [29.6, T2, 18.9], rotY: 0, n: 2 },
  { type: 'treehills_ferns', pos: [20.3, T2, 8.0], r: 0.5, seed: 3 }, { type: 'treehills_ferns', pos: [20.2, T2, 13.1], r: 0.55, seed: 6 },
  rail([inset([31.5, -10], [28, -6]), inset([33, -7.402], [28, -6]), inset([33, -4], [28, -6])], T2),
  rail([inset([33, 14], [28, 16]), inset([31, 17.464], [28, 16]), inset([31, 20], [28, 16])], T2),
  // ---- the crown (T3): the turbine in its clearing, the hut, the weather mast, a bench over the meadow
  { type: 'treehills_turbine', pos: [TURBINE.x, T3, TURBINE.z], rotY: -HP, hub: TURBINE.hub },
  rail([inset([33, -4], [30, 5]), inset([35.5, 0.33], [30, 5]), inset([35.5, 9.67], [30, 5]), inset([33, 14], [30, 5])], T3),
  { type: 'treehills_bench', pos: [27.3, T3, 4.6], rotY: -HP },
  { type: 'treehills_lamp', pos: [30.1, T3, 9.2], rotY: 0 },
  { type: 'treehills_weather', pos: [31.3, T3, -1.0], rotY: 0.3 },
  { type: 'treehills_hut', pos: [28.2, T3, 7.6], rotY: 0 },
  rail(Array.from({ length: 9 }, (_, k) => { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; return [TURBINE.x + Math.cos(a) * 2.25, TURBINE.z + Math.sin(a) * 2.25]; }), T3, { h: 0.95 }),
  { type: 'treehills_hatch', pos: [26.5, 3.25, 1.2], rotY: -HP, r: 0.38, num: 'C-1' },
  // ---- the north strip (T1, Bravo's right lane: the service route down to Bravo's terrace; since the stretch its end is
  //      the base terrace's corner, 22 m on — the seedling rack moves with it)
  { type: 'treehills_nursery', pos: [17.2, T1, 34.0], rotY: 0, w: 2.2 },
  { type: 'treehills_sprinkler', pos: [21.4, T1, 25.6] },
  { type: 'treehills_ferns', pos: [22.6, T1, 24.6], r: 0.5, seed: 9 },
  ].map(mv),
  // ================= the nursery (the stretch's new land, z −26 … −48 on Alpha's half; not moved: it is where the move
  //                   opened the ground). Kept clear of the tower's service lanes (plan.js TRACK, on Bravo's half: here
  //                   their twins — z −28 from the strip, x 4 down over the deck, z −44.3 back to x −20.5 and down to
  //                   the base terrace: 1.9 m either side of each line) and of the zone's floor (plan.js ZONE_S) but for
  //                   its own cover
  ...NURSERY_PLACEMENTS,
];
