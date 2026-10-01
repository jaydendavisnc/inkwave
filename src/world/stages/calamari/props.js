// Calamari County — stage prop pack + placements (owner: the calamari stage; see layout.js for the folder contract).
//
// register(D, H): adds this stage's prop builders to the PropKit table D (types prefixed 'calamari_'; H = PACK_HELPERS).
// The builders live in this folder: kit.js (palette, geometry, snow, roofs, lettering), buildings.js (the village's
// houses, the bath house, the station building, the co-op), railway.js, harbour.js, village.js.
// PLACEMENTS: the half list (Alpha's side, z < 0) — every entry is mirrored (x, z) → (−x, −z), rotY + π, unless it
// says `mirror: false` (one-offs that never change play: the Cuttlefish nameplate …).
// The Long Stages stretch (stretch.js): the base side's dressing is placed with the original numbers and moved out by
// ST.d with its pieces (moveOut); the new land's dressing is HIGH_STREET (the village high street, numbers in Q).
import { makeKit } from './kit.js';
import { registerBuildings } from './buildings.js';
import { registerRailway } from './railway.js';
import { registerHarbour } from './harbour.js';
import { registerVillage } from './village.js';
import { registerHighStreet } from './highstreet.js';
import { P, Q } from './layout.js';
import { STRETCH as ST, moveOut } from './stretch.js';

const PI = Math.PI, HP = PI / 2, DEG = PI / 180;

export function register(D, H) {
  const KIT = makeKit(D, H);
  registerBuildings(D, H, KIT);
  registerRailway(D, H, KIT);
  registerHarbour(D, H, KIT);
  registerVillage(D, H, KIT);
  registerHighStreet(D, H, KIT);
}

// ================================================================================================ placements
const box4 = (r) => ({ pos: [(r[0] + r[1]) / 2, 0, (r[2] + r[3]) / 2], w: r[1] - r[0], d: r[3] - r[2] });
const turned = (b) => ({ pos: [b[0], 0, b[1]], rotY: b[4] * DEG, w: b[2], d: b[3], h: b[5] });
const at = (o, y) => ({ ...o, pos: [o.pos[0], y, o.pos[2]] });

const BUILDINGS = [
  // Calamari County Station (south exit): forecourt face −Z; its platform face +Z over the side platform's back edge
  // (the platform face's windows + door at platform height; a cantilevered eave, no posts on the platform)
  { type: 'calamari_station', ...box4(P.station), h: 3.8, platY: P.side.y, posts: false, canopy: 1.6 },
  // the bath house (sento), entrance on the square
  { type: 'calamari_bathhouse', ...turned(P.bath), door: 1 },
  // the general store (noren on the square) / fish shop (open front on the harbour lane)
  { type: 'calamari_house', ...turned(P.store), style: 'plaster',
    faces: {
      3: [{ t: 'shop', x: 0.3, w: 4.0, h: 2.3, goods: 'veg', noren: { c: K_INDIGO(), n: 5, L: 0.62 } }, { t: 'sign', text: 'TAKOYAMA GENERAL STORE', x: 0.3, at: 2.5, h: 0.2, board: '#3d2d23' }, { t: 'lamp', x: -2.3, at: 2.4 }],
      1: [{ t: 'shop', x: 0.6, w: 3.6, h: 2.2, goods: 'fish', noren: { c: '#2f5d6b', n: 4, L: 0.55 } }, { t: 'sign', text: 'FRESH FISH', x: 0.6, at: 2.35, h: 0.22, board: '#2c4d56' }, { t: 'kerosene', x: -2.1 }],
      0: [{ t: 'win', x: -0.8, w: 1.4, h: 1.0, sash: true, lit: 1 }, { t: 'pipe', x: 2.0 }, { t: 'meter', x: 1.1 }],
      2: [{ t: 'win', x: 0.4, w: 1.2, h: 0.9 }, { t: 'ac', x: -1.5 }],
    },
    upper: { h: 2.5, inset: 0.3, faces: { 3: [{ t: 'win', x: -1.3, w: 1.3, h: 0.9, sill: 0.8, sash: true, lit: 1.1 }, { t: 'win', x: 1.4, w: 1.3, h: 0.9, sill: 0.8, sash: true }], 1: [{ t: 'win', x: 0, w: 1.6, h: 0.9, sill: 0.8, sash: true, lit: 0.9 }], 0: [{ t: 'win', x: 0, w: 1.0, h: 0.9, sill: 0.8, sash: true }] } },
    hisashi: [1, 3], roof: { f: 0.5, pitch: 0.5, alongX: false }, snow: [0] },
];
// (the base side: moved out with the co-op)
const BASE_BUILDINGS = [
  // the co-op's net store beside the loading dock
  { type: 'calamari_house', ...box4(P.netStore), h: 3.2, style: 'cedar', plinth: false,
    faces: { 1: [{ t: 'win', x: -1.6, w: 1.0, h: 0.8, sill: 1.4 }, { t: 'pipe', x: 3.0 }], 3: [{ t: 'sign', text: 'NETS', x: 1.3, at: 2.4, h: 0.2 }] },
    roof: { f: 1, pitch: 0.45, alongX: false, ov: 0.5 } },
  // the Cuttlefish cottage at T2's west end, looking out over the village (its nameplate, anchor and sea chest are
  // one-offs: mirror false)
  at({ type: 'calamari_house', ...box4(P.cottage), h: 3.2, style: 'cedar', wallC: '#5f4a3a',
    faces: { 0: [{ t: 'door', x: -2.3, w: 1.1 }, { t: 'win', x: 2.0, w: 1.2, h: 0.9, lit: 1.1 }], 1: [{ t: 'wood', x: -0.4, w: 2.2 }, { t: 'win', x: 1.2, w: 0.9, h: 0.8, sill: 1.1 }] },
    roof: { f: 1, pitch: 0.6, alongX: true, ov: 0.7 }, snow: [0, 1] }, P.y2),
  // hill houses stepping up behind T2 and the spawn (their walls rise above T2 / the deck)
  { type: 'calamari_house', pos: [-27.5, 2.6, -38.85], w: 12, d: 3.3, h: 2.8, style: 'plaster', plinth: false, faces: { 0: [{ t: 'win', x: 4.0, w: 1.3, h: 0.9, sill: 0.7, sash: true, lit: 0.9 }, { t: 'kerosene', x: 5.2 }] }, roof: { f: 0.5, pitch: 0.5, alongX: true } },
  { type: 'calamari_house', pos: [-15.25, 2.6, -38.85], w: 12.5, d: 3.3, h: 2.8, style: 'cedar', plinth: false, faces: { 0: [{ t: 'win', x: -4, w: 1.4, h: 0.9, sill: 0.7, lit: 1 }, { t: 'door', x: 0.2, w: 1.4 }, { t: 'win', x: 3.6, w: 1.4, h: 0.9, sill: 0.7, sash: true, lit: 0.8 }, { t: 'kerosene', x: 5.3 }] }, roof: { f: 1, pitch: 0.55, alongX: true } },
  { type: 'calamari_house', pos: [-13.25, 3.4, -42.25], w: 8.5, d: 3.5, h: 2.4, style: 'plaster', plinth: false, faces: { 0: [{ t: 'win', x: -1.5, w: 1.3, h: 0.9, sill: 0.6, sash: true, lit: 1 }], 1: [{ t: 'win', x: 0, w: 1.0, h: 0.8, sill: 0.8, lit: 1 }] }, upper: { h: 2.3, inset: 0.2, faces: { 1: [{ t: 'win', x: 0, w: 1.0, h: 0.8, sill: 0.7, sash: true }] } }, roof: { f: 0.5, pitch: 0.5, alongX: true } },
  { type: 'calamari_house', pos: [-10.75, 3.4, -45.5], w: 3.5, d: 3, h: 2.8, style: 'cedar', plinth: false, faces: { 1: [{ t: 'win', x: 0, w: 1.0, h: 0.8, sill: 0.8, lit: 1 }] }, roof: { f: 1, pitch: 0.6, alongX: false } },
  // the Fishermen's Co-op (warehouse face at z −45.5; the spawn deck in front, a narrow awning over its back)
  { type: 'calamari_coop', pos: [0, 0, P.deck.z0], w: 22, deckD: P.deck.z1 - P.deck.z0, deckW: P.deck.x1 - P.deck.x0, deckY: P.deck.y },
];
function K_INDIGO() { return '#2d3f63'; }

// ---- the railway
const TZ = -(P.track[0] + P.track[1]) / 2;                 // Alpha's track centre (z −5)
const XR = [P.crossing[0] + P.cutX, P.crossing[1] + P.cutX];  // the crossings' spans along a track (local x from its start)
const OP = P.overpass, OPc = (OP.x0 + OP.x1) / 2, OPw = OP.x1 - OP.x0;
const overpass = (y, tag) => ({ type: 'calamari_overpass', pos: [OPc, 0, 0], w: OPw, d: OP.z * 2, y, t: OP.t, ...tag,
  stairs: OP.stairs.map(([z, w]) => ({ z, w, xLow: OP.foot - OPc, xTop: OP.x1 - OPc, yLow: P.side.y })),
  drops: [OP.drops], innerDrops: [OP.drops],
  piers: OP.piers.flatMap((x) => OP.pierZ.map((z) => [x - OPc, z, P.side.y])),
  lamps: [[-OPw / 2 + 0.08, -7.2], [-OPw / 2 + 0.08, 7.2], [OPw / 2 - 0.08, -5.2], [OPw / 2 - 0.08, 5.2]],
  signs: [[-OPw / 2 - 0.02, -6.0, -1], [OPw / 2 + 0.02, -5.0, 1]], clock: [0, 0], numbers: [[-2.0, '2'], [2.0, '1']] });
const RAILWAY = [
  { type: 'calamari_track', pos: [-P.cutX, 0, TZ], length: P.cutX * 2, skip: [XR, [2 * P.cutX - XR[1], 2 * P.cutX - XR[0]]] },
  // (the railcars are stage movers: layout.js MOVERS builds + moves them — src/game/movers.js)
  // platform edges: the island's south edge (Alpha's track), the side platform's
  { type: 'calamari_platedge', pos: [P.island.x, 0, -P.island.z], rotY: PI, length: P.island.x * 2, y: P.island.y },
  { type: 'calamari_platedge', pos: [P.side.x0, 0, P.side.z1], rotY: 0, length: P.side.x1 - P.side.x0, y: P.side.y },
  // name boards: on the island under Alpha's overpass facing Alpha's track, on Alpha's side platform facing it
  { type: 'calamari_nameboard', pos: [5.6, P.island.y, -2.75], rotY: PI, notIn: 'boss' },
  { type: 'calamari_nameboard', pos: [-5.4, P.side.y, -7.35], rotY: 0, prev: 'SHIOKARA BAY →', next: '← INKOPOLIS' },
  // Alpha's overpass (the +x one): girders, piers, railings (open at its two stair heads and at the one-way drops over
  // the island, both edges), the stairs' stringers, lamps, signs, clock, numbers; Tower Command's is the taller one
  overpass(OP.y, { notIn: 'tower' }),
  overpass(OP.towerY, { onlyIn: 'tower' }),
  // Alpha's level crossing (x −25.5 … −18.5) over both tracks; Bravo's is the mirror. Its lamps are dark lenses: the
  // stage movers flash them (and ring its bell) while a railcar is due
  { type: 'calamari_crossing', pos: [(P.crossing[0] + P.crossing[1]) / 2, 0, 0], w: P.crossing[1] - P.crossing[0], reach: P.track[1], tracks: [TZ, -TZ], lit: false,
    units: [[P.crossing[0] - (P.crossing[0] + P.crossing[1]) / 2 - 0.7, -7.4, PI, -1], [P.crossing[0] - (P.crossing[0] + P.crossing[1]) / 2 - 0.7, 7.4, 0, 1]] },
  // tunnel portals (one-offs: each has its own name)
  { type: 'calamari_portal', pos: [P.cutX, 0, 0], rotY: -HP, w: 17, h: 7.5, bores: [-5, 5], name: 'CAPE TUNNEL', year: '1931', mirror: false },
  { type: 'calamari_portal', pos: [-P.cutX, 0, 0], rotY: HP, w: 17, h: 7.5, bores: [-5, 5], name: 'HILL TUNNEL', year: '1933', mirror: false },
  { type: 'calamari_signal', pos: [30.3, 0, -7.3], rotY: -HP, aspect: 'red' },
];

// ---- edges: a run from A to B (world x, z) with the water / drop on its right-hand side (local +Z)
const edge = (type, A, Bp, o = {}) => {
  const dx = Bp[0] - A[0], dz = Bp[1] - A[1], L = Math.hypot(dx, dz);
  return { type, pos: [A[0], o.y ?? 0, A[1]], rotY: Math.atan2(-dz, dx), length: L, ...o };
};
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const [bA, bB] = P.basinEdge, sA = lerp2(bA, bB, P.slip.t0), sB = lerp2(bA, bB, P.slip.t1);
const basinRot = Math.atan2(-(bB[1] - bA[1]), bB[0] - bA[0]);   // (the basin quay's frame: local x toward the co-op)
const bwA = P.breakwater[0], bwB = P.breakwater[1], bwL = Math.hypot(bwB[0] - bwA[0], bwB[1] - bwA[1]);
const bwU = [(bwB[0] - bwA[0]) / bwL, (bwB[1] - bwA[1]) / bwL], bwN = [bwU[1], -bwU[0]];   // along the arm, and across it (inward)
const bwTip = [bwB[0] + bwN[0] * 1.3 - bwU[0] * 1.1, bwB[1] + bwN[1] * 1.3 - bwU[1] * 1.1];
const onEdge = (z) => lerp2(bA, bB, (z - bA[1]) / (bB[1] - bA[1]));   // the basin edge's point at z (its line carried on south)
const onBasin = (t, off, y = -0.1) => { const p = lerp2(bA, bB, t); return [p[0] - Math.cos(basinRot) * 0 + off * Math.sin(basinRot) * 0 - off * 0.99, y, p[1] + off * 0.14]; };

const NQ = P.northQuay, SQ = P.southQuay;
const HARBOUR = [
  // quay edges: the basin quay (both sides of the slipway; carried on south past the fish market to the co-op quay),
  // the north quay's shore + east end
  edge('calamari_quayedge', bA, sA, { y: -0.1, bollards: [2.5, 7.0], ladders: [5.2], drop: 1.5 }),
  edge('calamari_quayedge', sB, onEdge(Q.floor[3]), { y: -0.1, bollards: [2.0, 7.5], fenders: 3.0, drop: 1.5 }),
  edge('calamari_quayedge', [NQ[1], NQ[2]], [bA[0] + 0.9, NQ[2]], { bollards: [1.6], ladders: [4.2] }),
  edge('calamari_quayedge', [NQ[1], -8.5], [NQ[1], NQ[2]], { bollards: [3.0, 7.0] }),
  // the breakwater's light on its head; bollards along it
  { type: 'calamari_harbourlight', pos: [bwTip[0], 0.25, bwTip[1]] },
  { type: 'calamari_quayedge', pos: [bwA[0] + bwN[0] * 2.4, 0.25, bwA[1] + bwN[1] * 2.4], rotY: Math.atan2(-bwU[1], bwU[0]), length: bwL - 2.4, fenders: 0, bollards: [1.5], drop: 1.85 },
  // the slipway: a winch at its head, a boat hauled half up it
  { type: 'calamari_winch', pos: [onBasin((P.slip.t0 + P.slip.t1) / 2, 3.9)[0], -0.1, onBasin((P.slip.t0 + P.slip.t1) / 2, 3.9)[2]], rotY: basinRot - Math.PI / 2 + Math.PI, length: 5 },
  { type: 'calamari_boat', pos: [onBasin((P.slip.t0 + P.slip.t1) / 2, -4.6)[0], -1.62, onBasin((P.slip.t0 + P.slip.t1) / 2, -4.6)[2]], rotY: basinRot + Math.PI / 2 + Math.PI, L: 6.2, name: 'HOSHI MARU', c: '#b8413a' },
  // boats moored in the basin
  { type: 'calamari_boat', pos: [27.8, -1.62, -21.8], rotY: 0.08, L: 7, name: 'KAIYO MARU', c: '#3d7f7a' },
  { type: 'calamari_boat', pos: [26.4, -1.62, -34.4], rotY: Math.PI + 0.12, L: 6.5, name: 'SHOU MARU', c: '#2d3f63' },
  // the basin quay (8 m between the store and the water): fish boxes and nets staggered either side, lamps on the kerb
  { type: 'calamari_fishboxes', pos: [22.0, -0.1, -20.6], rotY: basinRot, cols: 2, rows: 3, variant: 0 },
  { type: 'calamari_nets', pos: [17.3, -0.1, -24.6], r: 0.8, variant: 0 },
  { type: 'calamari_lamppost', pos: [16.5, -0.1, -18.6], rotY: -Math.PI / 2 },
  { type: 'calamari_lamppost', pos: [16.4, -0.1, -29.8], rotY: -Math.PI / 2 },
  // the north quay apron (20 × 6 m): a boat hauled up on blocks, the seaweed drying rack, fish boxes, a snowbank
  { type: 'calamari_boat', pos: [27.2, 0, -14.1], rotY: Math.PI / 2, L: 5.6, hauled: true, name: 'KOMA MARU', c: '#c99a3c' },
  { type: 'calamari_rack', pos: [14.2, 0, -13.0], rotY: 0, length: 4.2 },
  { type: 'calamari_fishboxes', pos: [21.0, 0, -15.4], rotY: 0.1, cols: 2, rows: 2, variant: 2 },
  { type: 'calamari_lamppost', pos: [30.6, 0, -11.6], rotY: Math.PI },
];
// the base side's harbour: the co-op quay (stepped corner) with its edges and clutter, the co-op yard's nets
const BASE_HARBOUR = [
  edge('calamari_quayedge', [SQ[0][1], SQ[0][3]], [SQ[0][1], SQ[0][2]], { bollards: [1.5, 5.5], ladders: [3.4] }),
  edge('calamari_quayedge', [SQ[0][1], SQ[0][2]], [SQ[1][1], SQ[0][2]], { bollards: [3.2] }),
  edge('calamari_quayedge', [SQ[1][1], SQ[1][3]], [SQ[1][1], SQ[1][2]], { fenders: 0 }),
  edge('calamari_quayedge', [SQ[1][1], SQ[1][2]], [SQ[1][0], SQ[1][2]], { fenders: 0 }),
  { type: 'calamari_nets', pos: [14.6, 0, -36.2], r: 0.7, variant: 1 },
  // the co-op quay (12 × 7.5 m) below the spawn's quay ramp: fish boxes, a snowbank, nets
  { type: 'calamari_fishboxes', pos: [20.2, 0, -41.0], rotY: 0.05, cols: 3, rows: 2, variant: 2 },
  { type: 'calamari_snowbank', pos: [14.6, 0, -39.6], rotY: 0.1, length: 2.2, h: 0.9, d: 1.1, variant: 0 },
  { type: 'calamari_nets', pos: [22.8, 0, -44.2], r: 0.7, variant: 0 },
];

// ---- the railway cut, the platforms, the station forecourt
const STATION = [
  // snowbanks between the tracks beyond the platform ends (between the crossing and the portal), the crossing approach
  { type: 'calamari_snowbank', pos: [28.2, 0, 0], rotY: 0, length: 3.2, h: 0.95, d: 1.5, variant: 0, notIn: 'boss' },
  { type: 'calamari_snowbank', pos: [22.0, 0, -10.2], rotY: 0, length: 2.4, h: 0.9, d: 1.1, variant: 2 },
  { type: 'calamari_signal', pos: [-29.8, 0, 2.2], rotY: Math.PI / 2, aspect: 'green', notIn: 'boss' },
  // island platform (open floor now: no canopy; the overpass decks shelter it): benches back to back between the
  // overpass piers, a vending machine at its edge
  { type: 'calamari_bench', pos: [5.4, P.island.y, -0.36], rotY: Math.PI, notIn: 'boss' },
  { type: 'calamari_bench', pos: [5.4, P.island.y, 0.36], rotY: 0, notIn: 'boss' },
  { type: 'calamari_vending', pos: [7.2, P.island.y, 2.95], rotY: Math.PI, variant: 0, notIn: 'boss' },
  // side platform (5.6 m deep): vending machine + payphone against the station's platform face, a parcel cart under
  // the overpass, lamps along the edge
  { type: 'calamari_vending', pos: [-2.8, P.side.y, -11.72], rotY: 0, variant: 1 },
  { type: 'calamari_payphone', pos: [0.9, P.side.y, -11.85], rotY: 0 },
  { type: 'calamari_cart', pos: [6.4, P.side.y, -9.3], rotY: 0.08 },
  { type: 'calamari_lamppost', pos: [-12.8, P.side.y, -7.1], rotY: 0, h: 3.6, arm: 0.6 },
  { type: 'calamari_lamppost', pos: [12.6, P.side.y, -7.1], rotY: 0, h: 3.6, arm: 0.6 },
  // the forecourt + square (one open space, 22 × 18 m, the station building on its north edge): bus shelter, kei truck,
  // post box, the pine in its planter, snowbanks, lanterns, a snowman, the notice board — low cover every 6–8 m, lanes
  // 5 m+ between them (the back street's middle, z −29.2 … −26.6, stays clear: the tower rides it)
  { type: 'calamari_busstop', pos: [-14.4, 0, -16.9], rotY: 0, w: 2.8 },
  { type: 'calamari_snowbank', pos: [-12.4, 0, -13.2], rotY: 0.1, length: 2.4, h: 0.9, d: 1.1, variant: 1 },
  { type: 'calamari_snowbank', pos: [10.6, 0, -13.3], rotY: -0.1, length: 2.2, h: 0.9, d: 1.1, variant: 2, shovel: true },
  { type: 'calamari_kei', pos: [-8.2, 0, -17.6], rotY: Math.PI / 2 + 0.08 },
  { type: 'calamari_postbox', pos: [2.2, 0, -17.6] },
  { type: 'calamari_tree', pos: [-3.9, 0, -21.3], kind: 'pine', h: 5.2, planter: 1.2, variant: 0 },
  { type: 'calamari_snowbank', pos: [3.5, 0, -23.8], rotY: 0.35, length: 2.6, h: 1.0, d: 1.3, variant: 1, shovel: true },
  { type: 'calamari_lantern', pos: [-1.2, 0, -25.2], h: 1.7 },
  { type: 'calamari_snowman', pos: [4.8, 0, -19.9], rotY: -0.6 },
  { type: 'calamari_vending', pos: [4.5, 0, -16.8], rotY: Math.PI, variant: 0 },
  { type: 'calamari_snowbank', pos: [-8.3, 0, -23.4], rotY: Math.PI / 2 - 0.15, length: 2.6, h: 0.95, d: 1.2, variant: 2 },
  { type: 'calamari_snowbank', pos: [8.6, 0, -19.2], rotY: Math.PI / 2 + 0.2, length: 2.2, h: 0.9, d: 1.1, variant: 0 },
  { type: 'calamari_lantern', pos: [7.6, 0, -25.6], h: 1.6 },
  { type: 'calamari_noticeboard', pos: [-9.3, 0, -25.6], rotY: 0.05 },
  { type: 'calamari_lamppost', pos: [-11.0, 0, -15.6], rotY: Math.PI / 2 },
  { type: 'calamari_lamppost', pos: [10.4, 0, -27.8], rotY: -Math.PI / 2 },
  { type: 'calamari_bike', pos: [-4.3, 0, -16.9], rotY: 0.3, variant: 0 },
  { type: 'calamari_bike', pos: [-5.3, 0, -17.1], rotY: 0.25, variant: 2 },
];

// ---- the hillside: road, T1 (the mid side)
const HILL = [
  // the hillside road (7 m): snowbanks + a lamp along the houses' side, the terrace's low wall on the other
  { type: 'calamari_snowbank', pos: [-18.3, 0, -13.4], rotY: Math.PI / 2, length: 2.2, h: 0.9, d: 0.9, variant: 2 },
  { type: 'calamari_snowbank', pos: [-18.5, 0, -24.4], rotY: Math.PI / 2, length: 2.4, h: 0.95, d: 0.9, variant: 0, shovel: true },
  { type: 'calamari_lamppost', pos: [-18.4, 0, -18.4], rotY: -Math.PI / 2 },
  // T1 (6–7 m): lantern, bench, bare tree, snowbank, lamp, a woodpile shed's stone wall
  { type: 'calamari_lantern', pos: [-26.4, P.y1, -14.2], h: 1.6 },
  { type: 'calamari_tree', pos: [-30.6, P.y1, -15.0], kind: 'bare', h: 4.5, variant: 1 },
  { type: 'calamari_stonewall', pos: [-30.6, P.y1, -20.6], rotY: -Math.PI / 2, length: 2.6, h: 0.85, t: 0.5 },
  { type: 'calamari_bench', pos: [-26.6, P.y1, -21.6], rotY: Math.PI / 2 },
  { type: 'calamari_snowbank', pos: [-26.4, P.y1, -26.6], rotY: Math.PI / 2, length: 2.2, h: 0.9, d: 1.1, variant: 1 },
  { type: 'calamari_lamppost', pos: [-26.1, P.y1, -18.2], rotY: Math.PI / 2, h: 3.8 },
  ...P.hillWalls.slice(0, 3).map(ishigaki),
];
// the hill walls' snowy tops (no stones: their faces stay inkable)
function ishigaki([x0, x1, z0, z1, y1, dressed]) {
  if (dressed === false) return null;
  const alongX = x1 - x0 > z1 - z0;
  return alongX ? { type: 'calamari_ishigaki', pos: [x0, 0, z1 - 0.15], rotY: 0, length: x1 - x0, y0: 0, y1, stones: false }
    : { type: 'calamari_ishigaki', pos: [x1 - 0.15, 0, z1], rotY: Math.PI / 2, length: z1 - z0, y0: 0, y1, stones: false };
}

// ---- the base side: T2 by the co-op with the Cuttlefish cottage, the base's approaches (moved out with the base)
const BASE_HILL = [
  // T2: parapet walls along its edge over the forecourt, a pine, lanterns, a snowman, a snowbank
  { type: 'calamari_stonewall', pos: [-22.5, P.y2, -30.8], rotY: 0, length: 3.0, h: 0.85, t: 0.5 },
  { type: 'calamari_stonewall', pos: [-17.6, P.y2, -30.8], rotY: 0, length: 4.0, h: 0.85, t: 0.5 },
  { type: 'calamari_stonewall', pos: [-7.8, P.y2, -30.8], rotY: 0, length: 3.0, h: 0.85, t: 0.5 },
  // the base's approaches: cover on T2 by the spawn deck's west front, on the loading dock, in the co-op yard, and
  // stacks on the spawn deck's front corners (breaking the pad's long sightlines down the flanks)
  { type: 'calamari_snowbank', pos: [-6.4, P.y2, -35.9], rotY: 0.2, length: 2.2, h: 0.95, d: 1.1, variant: 2 },
  { type: 'calamari_fishboxes', pos: [3.6, P.dock.y, -35.2], rotY: 0.05, cols: 2, rows: 3, variant: 1 },
  { type: 'calamari_fishboxes', pos: [13.6, 0, -32.9], rotY: -0.1, cols: 2, rows: 2, variant: 0 },
  { type: 'calamari_fishboxes', pos: [-7.6, P.deck.y, -38.3], rotY: 0.08, cols: 2, rows: 3, variant: 2 },
  { type: 'calamari_fishboxes', pos: [5.4, P.deck.y, -38.3], rotY: -0.06, cols: 2, rows: 3, variant: 1 },
  { type: 'calamari_lantern', pos: [-3.5, 0, -30.1], h: 1.7 },
  { type: 'calamari_tree', pos: [-18.6, P.y2, -35.0], kind: 'pine', h: 5.6, variant: 2 },
  { type: 'calamari_lantern', pos: [-11.2, P.y2, -35.2], h: 1.7 },
  { type: 'calamari_snowman', pos: [-5.0, P.y2, -34.4], rotY: 0.4 },
  { type: 'calamari_snowbank', pos: [-24.0, P.y2, -35.4], rotY: 0, length: 2.2, h: 0.85, d: 1.1, variant: 0 },
  ...P.hillWalls.slice(3).map(ishigaki).filter(Boolean),
  // Cap'n Cuttlefish's cottage at T2's west end (Alpha's side only): nameplate, anchor, sea chest, by its door
  { type: 'calamari_cuttlefish', pos: [(P.cottage[0] + P.cottage[1]) / 2 - 0.25, P.y2, P.cottage[3]], rotY: 0, mirror: false },
];

// ---- the village high street (the new land, Q): the allotments, the hillside road, the onsen inn and its garden, the
// High Street, the fire-watch terrace, the fire lane, the post office and its yard, the basin quay with the fish
// market, the co-op forecourt. The Tower Command track rides the back street, the fire lane, the onsen lane (across
// the terrace), the road's south half and the forecourt: that clutter stays off those lanes (layout.js TOWER)
const TR = Q.terrace, GY = Q.gardenY, FY = Q.floorY;
const slipN = (() => { const dx = bB[0] - bA[0], dz = bB[1] - bA[1], L = Math.hypot(dx, dz); return [-dz / L, dx / L]; })();
const nA = onEdge(Q.notch[0]), nB = onEdge(Q.notch[1]), backN = (p) => [p[0] - slipN[0] * Q.notch[2], p[1] - slipN[1] * Q.notch[2]];
const cope = (x0, z0, x1, z1, y, o = {}) => ({ ...edge('calamari_coping', [x0, z0], [x1, z1], { y }), ...o });
const HIGH_STREET = [
  // ================= buildings: the onsen inn (Ikayu Inn: noren with the hot-spring mark, its souvenir shop on the High
  // Street), its boiler house on the road, the post office (its sign, its sorting dock's door), the potting shed
  { type: 'calamari_house', ...box4(Q.inn), h: 3.4, style: 'plaster',
    faces: {
      0: [{ t: 'door', x: 0, w: 2.0, noren: { c: '#6b2f3a', n: 3, L: 0.8, mark: 'onsen' } }, { t: 'sign', text: 'IKAYU INN', x: 0, at: 2.62, h: 0.26 }, { t: 'chochin', x: -1.5, at: 2.2 }, { t: 'chochin', x: 1.5, at: 2.2 }, { t: 'win', x: -2.7, w: 0.9, h: 0.9, sill: 1.1, lit: 1.1 }, { t: 'win', x: 2.7, w: 0.9, h: 0.9, sill: 1.1, lit: 1.1 }],
      1: [{ t: 'shop', x: 0.2, w: 3.4, h: 2.2, goods: 'sundry', noren: { c: '#2f5d6b', n: 4, L: 0.55 } }, { t: 'sign', text: 'SOUVENIRS', x: 0.2, at: 2.4, h: 0.2 }, { t: 'lamp', x: -2.3, at: 2.5 }],
      2: [{ t: 'win', x: -2.2, w: 1.5, h: 0.8, sill: 1.9, sash: true, lit: 0.9 }, { t: 'wood', x: 0.4, w: 2.2 }, { t: 'win', x: 2.4, w: 1.2, h: 0.8, sill: 1.9, sash: true, lit: 0.9 }],
      3: [{ t: 'win', x: -2.1, w: 1.1, h: 0.9, sill: 1.0, lit: 1.0 }],
    },
    upper: { h: 2.5, inset: 0.3, faces: { 0: [{ t: 'win', x: -2.0, w: 1.4, h: 0.9, sill: 0.8, lit: 1.1 }, { t: 'win', x: 0, w: 1.4, h: 0.9, sill: 0.8, lit: 1.1 }, { t: 'win', x: 2.0, w: 1.4, h: 0.9, sill: 0.8, lit: 1.1 }], 1: [{ t: 'win', x: 0, w: 1.4, h: 0.9, sill: 0.8, sash: true, lit: 1 }], 2: [{ t: 'win', x: -1.5, w: 1.4, h: 0.9, sill: 0.8, lit: 1.1 }, { t: 'win', x: 1.5, w: 1.4, h: 0.9, sill: 0.8, lit: 1.1 }], 3: [{ t: 'win', x: 0, w: 1.2, h: 0.9, sill: 0.8, lit: 1 }] } },
    hisashi: [0], roof: { f: 0.45, pitch: 0.55, ov: 0.8, alongX: true } },
  { type: 'calamari_house', ...box4(Q.boiler), h: 2.8, style: 'cedar', plinth: false,
    faces: { 3: [{ t: 'wood', x: 0.2, w: 2.4 }], 0: [{ t: 'pipe', x: -0.5 }, { t: 'meter', x: 0.4 }], 2: [{ t: 'door', x: 0, w: 1.0, hood: false }] },
    roof: { f: 1, pitch: 0.5, alongX: false, ov: 0.4 }, chimney: [0.3, -0.7, 2.6], snow: [3] },
  { type: 'calamari_house', ...box4(Q.po), h: 3.4, style: 'plaster', wallC: '#e3ddd0',
    faces: {
      0: [{ t: 'door', x: -1.3, w: 1.6 }, { t: 'sign', text: 'POST OFFICE', x: 0.4, at: 2.62, h: 0.24, board: '#8e2f2a' }, { t: 'win', x: 1.8, w: 1.3, h: 1.0, sill: 0.95, sash: true, lit: 1.2 }],
      1: [{ t: 'win', x: -1.8, w: 1.3, h: 0.9, sill: 1.0, sash: true, lit: 1 }, { t: 'win', x: 1.2, w: 1.3, h: 0.9, sill: 1.0, sash: true }, { t: 'pipe', x: 3.1 }],
      2: [{ t: 'door', x: 0.8, y: 1.0, w: 2.2, hood: false }, { t: 'lamp', x: -1.4, y: 1.0, at: 2.2 }, { t: 'meter', x: -2.3, y: 0.6 }],
      3: [{ t: 'win', x: -1.5, w: 1.3, h: 0.9, sill: 1.0, sash: true, lit: 1 }, { t: 'poster', x: 0.6, at: 1.5 }, { t: 'win', x: 2.2, w: 1.0, h: 0.9, sill: 1.0, sash: true }],
    },
    upper: { h: 2.4, inset: 0.25, faces: { 0: [{ t: 'win', x: -1.3, w: 1.3, h: 0.9, sill: 0.8, sash: true, lit: 1 }, { t: 'win', x: 1.3, w: 1.3, h: 0.9, sill: 0.8, sash: true }], 1: [{ t: 'win', x: 0, w: 1.4, h: 0.9, sill: 0.8, sash: true, lit: 0.9 }], 3: [{ t: 'win', x: 0, w: 1.4, h: 0.9, sill: 0.8, sash: true }] } },
    hisashi: [0], roof: { f: 0.5, pitch: 0.5, ov: 0.6, alongX: false }, snow: [1] },
  { type: 'calamari_postsign', pos: [Q.po[1] - 0.6, 2.95, Q.po[3]], rotY: 0 },
  { type: 'calamari_house', pos: [-30.2, P.y2, -46.5], w: 2.6, d: 3.8, h: 2.3, style: 'cedar', plinth: false,
    faces: { 1: [{ t: 'door', x: 0.4, w: 1.1, hood: false }], 0: [{ t: 'win', x: 0, w: 0.9, h: 0.6, sill: 1.1 }] }, roof: { f: 1, pitch: 0.45, alongX: false, ov: 0.4 } },

  // ================= the fire-watch terrace (1.3): the hanshō tower on its north-east corner, the "mind the fire" stone
  // by the steps, the fire brigade's pump cart and buckets on its south side (the tower's track crosses its middle,
  // z −38 … −41: kept clear), granite coping round its edges
  { type: 'calamari_hansho', pos: [Q.firetower[0], TR.y, Q.firetower[1]], rotY: 0, h: 12 },
  { type: 'calamari_firestone', pos: [-3.0, TR.y, -36.3], rotY: 0.12 },
  { type: 'calamari_pumpcart', pos: [-1.9, TR.y, -42.3], rotY: 0.05 },
  { type: 'calamari_firebuckets', pos: [2.2, TR.y, -43.05], rotY: 0 },
  { type: 'calamari_bench', pos: [0.6, TR.y, -34.1], rotY: 0 },
  cope(TR.x0, TR.z1, TR.x1, TR.z1, TR.y), cope(TR.x1, TR.z1, TR.x1, TR.z0, TR.y), cope(TR.x1, TR.z0, TR.x0, TR.z0, TR.y), cope(TR.x0, TR.z0, TR.x0, TR.z1, TR.y),

  // ================= the hillside road carried on: the inn's boiler house juts into it, a kei truck parked across its
  // west half, the yaki-imo cart by the inn's corner (a chicane: the road's long view is broken), a vending machine on
  // the allotments' wall, the curve mirror at the onsen lane, snowbanks along the garden's wall, a lamp
  { type: 'calamari_kei', pos: [-23.5, 0, -32.9], rotY: Math.PI / 2 + 0.1 },
  { type: 'calamari_yatai', pos: [-20.75, 0, -36.6], rotY: 0 },
  { type: 'calamari_vending', pos: [-25.1, 0, -35.8], rotY: Math.PI / 2, variant: 0 },
  { type: 'calamari_mirror', pos: [-18.9, 0, -37.6], rotY: -Math.PI * 0.75 },
  { type: 'calamari_snowbank', pos: [-19.1, 0, -44.2], rotY: Math.PI / 2, length: 2.4, h: 0.9, d: 0.9, variant: 2, shovel: true },
  { type: 'calamari_lamppost', pos: [-25.0, 0, -42.5], rotY: Math.PI / 2 },
  { type: 'calamari_snowbank', pos: [-23.8, 0, -50.4], rotY: 0, length: 2.4, h: 0.9, d: 1.0, variant: 0 },
  { type: 'calamari_fingerpost', pos: [-24.9, 0, -30.9], arms: [{ text: 'STATION', yaw: -Math.PI / 2, y: 2.25 }, { text: 'CO-OP', yaw: Math.PI / 2, y: 1.95 }] },

  // ================= the allotments: the lower beds on T1 carried on (1.3), stone steps up to the upper allotments (2.6)
  // with the potting shed, compost bays, straw stooks, a scarecrow, bamboo frames
  { type: 'calamari_bed', pos: [-30.4, P.y1, -31.3], rotY: Math.PI / 2, length: 3.4, w: 1.1, crop: 'leek' },
  { type: 'calamari_bed', pos: [-26.8, P.y1, -31.3], rotY: Math.PI / 2, length: 3.4, w: 1.1, crop: 'daikon' },
  { type: 'calamari_straw', pos: [-30.5, P.y1, -36.6], rotY: Math.PI / 2, length: 1.8, variant: 0 },
  { type: 'calamari_scarecrow', pos: [-26.4, P.y1, -34.0], rotY: 0.4 },
  { type: 'calamari_frame', pos: [-26.2, P.y1, -35.4], rotY: Math.PI / 2, length: 2.7 },
  { type: 'calamari_compost', pos: [-30.6, P.y2, -40.7], rotY: Math.PI / 2 },
  { type: 'calamari_bed', pos: [-27.0, P.y2, -42.4], rotY: Math.PI / 2, length: 3.2, w: 1.2, crop: 'cabbage' },
  { type: 'calamari_straw', pos: [-26.9, P.y2, -47.3], rotY: Math.PI / 2, length: 1.8, variant: 1 },
  { type: 'calamari_snowbank', pos: [-30.0, P.y2, -43.2], rotY: 0, length: 1.8, h: 0.85, d: 0.9, variant: 1 },
  ...Q.hillWalls.map(ishigaki),

  // ================= the onsen lane and the inn's garden (0.9, a raised stone bed): the steaming rock pool, a bamboo
  // screen along its lane and road sides, a stone parapet over the forecourt, a lantern and a pine; its steps down
  // to the High Street
  { type: 'calamari_pool', pos: [-15.5, GY, -44.3], length: 3.0, w: 1.8 },
  { type: 'calamari_screen', pos: [-18.3, GY, -42.2], rotY: 0, length: 3.6, h: 1.3 },
  { type: 'calamari_screen', pos: [-18.25, GY, -45.6], rotY: -Math.PI / 2, length: 3.2, h: 1.3 },
  { type: 'calamari_stonewall', pos: [-17.9, GY, -45.75], rotY: 0, length: 4.6, h: 0.85, t: 0.45 },
  { type: 'calamari_lantern', pos: [-12.3, GY, -42.8], h: 1.5 },
  { type: 'calamari_tree', pos: [-13.1, GY, -45.3], kind: 'pine', h: 3.8, variant: 1 },
  cope(Q.garden[0], Q.garden[3], Q.garden[1], Q.garden[3], GY), cope(Q.garden[1], Q.garden[3], Q.garden[1], Q.garden[2], GY, { ice: false }),
  cope(Q.garden[1], Q.garden[2], Q.garden[0], Q.garden[2], GY), cope(Q.garden[0], Q.garden[2], Q.garden[0], Q.garden[3], GY),

  // ================= the High Street: the souvenir shop's banners, a vending machine on the terrace's wall, snowbanks,
  // a lamp, bicycles
  { type: 'calamari_nobori', pos: [-11.1, 0, -32.6], rotY: -Math.PI / 2, text: 'ONSEN', c: '#6b2f3a' },
  { type: 'calamari_nobori', pos: [-11.1, 0, -35.4], rotY: -Math.PI / 2, text: 'GIFTS', c: '#2f5d6b' },
  { type: 'calamari_vending', pos: [-5.45, 0, -35.8], rotY: -Math.PI / 2, variant: 1 },
  { type: 'calamari_snowbank', pos: [-6.3, 0, -32.3], rotY: Math.PI / 2, length: 2.0, h: 0.9, d: 1.0, variant: 2 },
  { type: 'calamari_lamppost', pos: [-11.1, 0, -37.1], rotY: Math.PI / 2 },
  { type: 'calamari_bike', pos: [-8.9, 0, -36.8], rotY: 0.2, variant: 1 },
  { type: 'calamari_snowbank', pos: [-7.0, 0, -45.2], rotY: 0.05, length: 2.2, h: 0.9, d: 1.0, variant: 0 },

  // ================= the fire lane, the post office's sorting dock (parcel cages) and yard (the post van), the hydrant
  { type: 'calamari_hydrant', pos: [9.1, 0, -44.6], rotY: -Math.PI / 2 },
  { type: 'calamari_snowbank', pos: [7.2, 0, -45.4], rotY: 0, length: 2.2, h: 0.9, d: 1.0, variant: 1 },
  { type: 'calamari_cages', pos: [12.1, 1.0, -39.3], rotY: 0 },
  { type: 'calamari_postvan', pos: [12.9, 0, -44.3], rotY: 0.05 },
  { type: 'calamari_snowbank', pos: [15.3, 0, -47.6], rotY: Math.PI / 2, length: 2.2, h: 0.9, d: 1.0, variant: 2 },
  { type: 'calamari_bike', pos: [10.2, 0, -41.3], rotY: Math.PI / 2, variant: 0, c: '#b8413a' },

  // ================= the basin quay carried on: fish boxes and nets, the fish market (its auction floor across the quay,
  // the shed, the chiller room, the boxes stacked for the morning's sale), the boat notch south of it, boats
  { type: 'calamari_fishboxes', pos: [20.2, -0.1, -34.2], rotY: basinRot + 0.1, cols: 2, rows: 3, depth: 2, variant: 1 },
  { type: 'calamari_nets', pos: [17.4, -0.1, -37.8], r: 0.8, variant: 1 },
  { type: 'calamari_lamppost', pos: [16.35, -0.1, -40.6], rotY: -Math.PI / 2 },
  { type: 'calamari_market', pos: [(Q.floor[0] + Q.floor[1]) / 2, FY, (Q.floor[2] + Q.floor[3]) / 2], w: Q.floor[1] - Q.floor[0] - 0.2, d: 7.6, h: 3.4 },
  { type: 'calamari_chiller', pos: [(Q.chiller[0] + Q.chiller[1]) / 2, FY, (Q.chiller[2] + Q.chiller[3]) / 2], w: Q.chiller[1] - Q.chiller[0], d: Q.chiller[3] - Q.chiller[2], h: 2.6, face: 0 },
  { type: 'calamari_fishboxes', pos: [19.98, FY, -46.0], rotY: 0, cols: 3, rows: 3, variant: 2 },
  { type: 'calamari_fishboxes', pos: [23.2, FY, -43.3], rotY: 0.05, cols: 3, rows: 2, variant: 1 },
  { type: 'calamari_fishboxes', pos: [24.4, FY, -48.1], rotY: -0.1, cols: 2, rows: 3, variant: 0 },
  { type: 'calamari_nets', pos: [21.6, FY, -49.0], r: 0.6, variant: 0 },
  edge('calamari_quayedge', onEdge(Q.floor[3]), [Q.floor[1], Q.floor[3]], { y: FY, bollards: [2.5], fenders: 2.2, drop: 2.1 }),
  edge('calamari_quayedge', [Q.floor[1], Q.floor[3]], [Q.floor[1], Q.floor[2]], { y: FY, bollards: [1.4, 6.6], ladders: [4.0], drop: 2.1 }),
  edge('calamari_quayedge', [Q.floor[1], Q.floor[2]], onEdge(Q.floor[2]), { y: FY, bollards: [3.0], fenders: 2.2, drop: 2.1 }),
  edge('calamari_quayedge', onEdge(Q.floor[2]), nA, { y: -0.1, fenders: 0, drop: 1.5 }),
  edge('calamari_quayedge', nA, backN(nA), { y: -0.1, fenders: 0, drop: 1.5 }),
  edge('calamari_quayedge', backN(nA), backN(nB), { y: -0.1, ladders: [1.8], fenders: 1.8, drop: 1.5 }),
  edge('calamari_quayedge', backN(nB), nB, { y: -0.1, fenders: 0, drop: 1.5 }),
  edge('calamari_quayedge', nB, onEdge(SQ[0][3] - ST.d), { y: -0.1, bollards: [1.6], fenders: 0, drop: 1.5 }),
  edge('calamari_quayedge', [onEdge(SQ[0][3] - ST.d)[0] - 0.05, SQ[0][3] - ST.d], [SQ[0][1], SQ[0][3] - ST.d], { fenders: 0 }),
  { type: 'calamari_boat', pos: [(nA[0] + backN(nA)[0]) / 2 + 0.2, -1.62, (Q.notch[0] + Q.notch[1]) / 2], rotY: Math.PI + 0.05, L: 3.3, beam: 1.5, name: 'IKA MARU', c: '#8e5a3c' },
  { type: 'calamari_boat', pos: [25.2, -1.62, -38.2], rotY: 0.1, L: 5.6, name: 'TAKO MARU', c: '#5f8f86' },
  { type: 'calamari_nets', pos: [17.0, -0.1, -56.8], r: 0.7, variant: 0 },
  { type: 'calamari_lamppost', pos: [16.35, -0.1, -53.6], rotY: -Math.PI / 2 },

  // ================= the co-op forecourt (the apron in front of the base: the Bazookarp goal's spot at the grand stair's
  // foot): snowbanks shovelled against T2's wall, fish boxes by the dock
  { type: 'calamari_snowbank', pos: [-16.5, 0, -50.4], rotY: 0, length: 2.6, h: 0.95, d: 1.0, variant: 1 },
  { type: 'calamari_snowbank', pos: [-7.0, 0, -50.4], rotY: 0, length: 2.2, h: 0.9, d: 1.0, variant: 2, shovel: true },
  { type: 'calamari_fishboxes', pos: [8.0, 0, -48.6], rotY: 0.05, cols: 2, rows: 3, variant: 1 },
];

export const PLACEMENTS = [...BUILDINGS, ...RAILWAY, ...HARBOUR, ...STATION, ...HILL, ...HIGH_STREET,
  ...moveOut([...BASE_BUILDINGS, ...BASE_HARBOUR, ...BASE_HILL])];
