// Spirhalite Islands — stage layout (src/world/stages/spirhalite/). The stage owns every file in this folder:
//   layout.js    level geometry, zones, tower track, env (this file)   props.js    prop pack + placements
//   surfaces.js  stage surface materials (texlib)                       murals.js   stage decals / signage
//   backdrop.js  the far archipelago (layout.env.backdrop)              outline.js  the landmass outline (the S)
import { PATTERN, B, R, O, OCT } from '../../mapkit.js';
import { buildBackdrop } from './backdrop.js';
import { SURF } from './surfaces.js';
import { shelfBars, reflexPatches, coreRects, coreBoxes } from './islands.js';
import { CHAIN, OUTLINE, barLevel, PILLAR, SHIFT, sh } from './outline.js';
export { OUTLINE };

// Spirhalite Islands — a remote archipelago raised out of the sea by a tectonic shift, reached only by helicopter.
// Deep Cut's expedition camp investigates the ruins: a colossal stone arch over the central sandbar and ancient tiered
// pillars with water pouring down their drums.
//
// The chain of islets is an S (outline.js). Its middle stroke is the central sandbar under the Great Arch (the arch
// crosses it, a leg standing in each lagoon's mouth). Each half: the mid islet (the Spine Crest) runs out to the bend;
// the bend wraps the half's lagoon — the ancient causeway across the inlet on its outside, a sandbar neck along the
// lagoon, then the dig (Deep Cut's trench after the causeway's buried south end); the bottom stroke comes back as the
// camp islet (Deep Cut's camp in its dune hollow), a sandbar pinch and the helipad islet at the tail. From the tail two
// arms reach back into the lagoon: the tide-pool islet (a rock shelf with the ruined watch-post: the slice's strategic
// point) on its sand tombolo, the pillar islet beyond it (the cascade pillar; the side zone) across the notch — a rope
// bridge over it, a sandbar ford beside it — with a log bridge from its tip to the central sandbar; and the Arch spit
// along the lagoon's mouth inside the arch's leg, a second log bridge from its tip under the arch.
// The Long Stages stretch (2026-09-30): the base (the bottom stroke, the tail and everything on them) moved out SHIFT =
// 22 m along the spawn axis; the slice between is new — the dig, the tide-pool islet with its crossings, the spit's
// root. Pieces and placements of the base are written where they stood before and moved by `moved(…)` (sh(x, z) for
// single points), so the old plan still reads in the numbers.
// Routes from each pad to the centre (nav-check.js): the Arch spit → its bridge → the sandbar's east end; the tide-pool
// islet → the rope bridge or the ford → the pillar islet round the plinth (or over its tiers) → its bridge → the
// sandbar's south edge; the dig → the neck → the mid islet's lagoon beach → the sandbar's west end, or the dig → the
// causeway round the outside of the bend → the Spine Crest or the mid islet's north shore.
// Heights: −1.0 the dig's trench · 0 sand · 1.3 dunes / causeway / pillar plinth / tide-pool shelf / rope bridge ·
// 2.5 crests / pillar tier / watch-post · 3.2 helipads.
const H1 = 1.3, H2 = 2.5, HP = 3.2, BOT = -2.4;
export const PAD = sh(8.5, -36);                                  // Alpha's helipad (deck centre; (8.5, −36) before the stretch)
export const PAD_BODY = 4.9;                                      // its frame body's circumradius (the deck plate's: 5.9)
const K = { sand: '#e6dfcf', wet: '#d8cfbd', dune: '#ebe4d4', stone: '#c9c4b8', stoneDk: '#aaa498', steel: '#8d979e', steelDk: '#59626a', pad: '#dcdcd6', moss: '#9aa878' };
const sand = (o = {}) => ({ color: K.sand, pattern: SURF.dune, ...o });
const moss = (o = {}) => ({ color: K.dune, pattern: SURF.moss, ...o });
const stone = (o = {}) => ({ color: K.stone, pattern: SURF.ruin, ...o });
const SIDES = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
const OCTSIDES = [...SIDES, [0.7071, 0, 0.7071], [0.7071, 0, -0.7071], [-0.7071, 0, 0.7071], [-0.7071, 0, -0.7071]];

// a ramp whose slab's 0.6 m low-end extension ends exactly on the low edge (dune slopes, stone steps)
const rise = (x0, z0, y0, x1, z1, y1) => { const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), a = Math.atan2(y1 - y0, L); return [x0 + (dx / L) * 0.6 * Math.cos(a), y0 + 0.6 * Math.sin(a), z0 + (dz / L) * 0.6 * Math.cos(a)]; };
// a sand slope from (x0, z0) at y0 up to (x1, z1) at y1, w wide
const slope = (x0, z0, y0, x1, z1, y1, w, o = {}) => R(rise(x0, z0, y0, x1, z1, y1), [x1, y1, z1], w, sand({ tag: 'dune-slope', color: K.dune, ...o }));
// dune ridge: a flat crest (w wide, len long, height h) along the direction deg (0 = along +x), sand slopes (≤ 23°) both sides
function dune(cx, cz, len, h, deg, o = {}) {
  const a = (deg * Math.PI) / 180, ux = Math.cos(a), uz = -Math.sin(a), nx = -uz, nz = ux;   // along, across
  const w = o.crest ?? 1.0, run = h / Math.tan((22.5 * Math.PI) / 180);
  const out = [O(cx, cz, len, w, 0, h, deg, sand({ tag: 'dune', color: K.dune, ...o.opts }))];
  for (const s of [-1, 1]) {
    const hx = cx + nx * s * (w / 2), hz = cz + nz * s * (w / 2), lx = hx + nx * s * run, lz = hz + nz * s * run;
    out.push(R([lx, 0, lz], [hx, h, hz], len, sand({ tag: 'dune-slope', color: K.dune, ...o.opts })));
  }
  return out;
}

// the stretch: a piece of the base, authored where it stood before, moved out by SHIFT (outline.js)
const mv1 = (d) => {
  const [dx, dz] = SHIFT, o = { ...d };
  if (d.kind === 'box') { o.min = [d.min[0] + dx, d.min[1], d.min[2] + dz]; o.max = [d.max[0] + dx, d.max[1], d.max[2] + dz]; }
  else if (d.kind === 'obox') o.center = [d.center[0] + dx, d.center[1], d.center[2] + dz];
  else { o.low = [d.low[0] + dx, d.low[1], d.low[2] + dz]; o.high = [d.high[0] + dx, d.high[1], d.high[2] + dz]; }
  if (d.oct) o.oct = [d.oct[0] + dx, d.oct[1] + dz, d.oct[2]];
  return o;
};
export const moved = (list) => list.map(mv1);

const NC = CHAIN.length;
// Alpha's bars: the chain's edges (the last one wraps into the mirror chain: a third level where the count is odd)
const BARS = shelfBars(OUTLINE, { only: (i) => i < NC, level: barLevel, opts: { tag: 'shore', color: K.wet, pattern: SURF.dune } });
const PATCHES = reflexPatches(OUTLINE, { only: (i) => i < NC, opts: { tag: 'shore', color: K.wet, pattern: SURF.dune } });
const ALL_BARS = [...BARS, ...PATCHES].flatMap((b) => [b, { ...b, center: [-b.center[0], b.center[1], -b.center[2]] }]);
// the dry sand: the centre slab under the arch (single, symmetric) first, then Alpha's half (z ≤ 0) greedily
const CENTRE = [[-6, 6, -4, 4]];
// (the dig's trench is cut out of the dry sand: its floor and ramps are pieces of their own)
export const TRENCH = { x0: -29.0, x1: -25.5, z0: -42.5, z1: -32.0, y: -1.0 };   // (on the cores' 0.5 m raster)
const CORES = coreRects(OUTLINE, ALL_BARS, { x0: -37, x1: 37, z0: -68, z1: 0 }, [...CENTRE, [TRENCH.x0, TRENCH.x1, TRENCH.z0, TRENCH.z1]]);
export const CORE_MISS = CORES.miss;
// the Arch spit's dry sand (its cores) is wet-sand coloured: a shallow sandbar across the lagoon's mouth, not another stroke
const onSpit = ([x0, x1, z0, z1]) => (x0 + x1) / 2 > 10.4 && (x0 + x1) / 2 < 17.2 && (z0 + z1) / 2 > -24.4 && (z0 + z1) / 2 < -8;
// … and so is the ford between the pillar islet and the tide-pool islet (a sandbar the tide runs over)
const onFord = ([x0, x1, z0, z1]) => (x0 + x1) / 2 > -7.2 && (x0 + x1) / 2 < -3.0 && (z0 + z1) / 2 > -34.6 && (z0 + z1) / 2 < -28.2;
// the cascade pillar on its headland (outline.js): the plinth's apothem (its faces), the log bridge from the headland's tip
// to the central sandbar (4 m wide, centred on a nav column: three lanes between its side logs), the Arch spit's bridge under the arch
const PX = PILLAR.x, PZ = PILLAR.z, PA = PILLAR.plinth * Math.cos(Math.PI / 8);
// the tide-pool islet's shelf and the watch-post on it ([x0, x1, z0, z1]), the post's broken walls ([x0, x1, z0, z1, top]);
// the rope bridge from the pillar islet's south beach up onto the shelf (x, foot z0, top z1 at the shelf's north face, width)
export const WATCH = {
  shelf: [-1.4, 6.0, -42.0, -33.9], post: [2.6, 6.0, -38.2, -34.4],
  walls: [[2.6, 3.3, -34.9, -34.4, 3.4], [4.0, 6.0, -34.9, -34.4, 3.4], [5.5, 6.0, -38.2, -34.9, 3.4], [4.8, 5.5, -38.2, -37.7, 3.0]],
  stub: [[4.0, 6.0, -35.0, -34.4, 3.4, 8.8], [5.4, 6.0, -37.0, -35.0, 3.4, 7.2]],
};
export const ROPE = { x: 1.4, z0: -26.0, z1: -33.9, w: 2.2 };
// the dig's log bridge across the lagoon to the tide-pool islet's west beach (runs along x: z, x0 … x1, width) — the
// slice's cross link: the bend's lane to the strategic point without going round by the camp; 4 m wide like the
// pillar's bridge (the tower crosses it: 3 m between its side logs)
export const DIGBRIDGE = { z: -40.0, x0: -19.6, x1: -7.2, w: 4.0 };
// the east bay's log bridge from the Arch spit's bay side to the pillar islet's south-east shore (the side zone's east
// way in: the stretch put water between the zone and the tail, this gives it back the spit lane's approach)
export const BAYBRIDGE = { z: -23.2, x0: 4.4, x1: 11.6, w: 3.2 };
export const BRIDGES = [
  { x: PX, z0: -12.9, z1: -6.1, w: 4.04 },      // the pillar headland → the central sandbar
  { x: 14.5, z0: -10.3, z1: -0.3, w: 4.04 },     // the Arch spit → the central sandbar's east end, under the Great Arch
];

// the centre zone: a 12 × 8 m rectangle under the arch, along the central sandbar (the middle stroke runs at 25°)
const ZU = [Math.cos((25 * Math.PI) / 180), Math.sin((25 * Math.PI) / 180)], ZN = [-ZU[1], ZU[0]];
const zrect = (hu, hn) => [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [+(a * hu * ZU[0] + b * hn * ZN[0]).toFixed(2), +(a * hu * ZU[1] + b * hn * ZN[1]).toFixed(2)]);

const SPIRHALITE = {
  id: 'spirhalite',
  bounds: { minX: -37, maxX: 37, minZ: -67, maxZ: 67 },
  spawnPads: [[PAD[0], HP, PAD[1]], [-PAD[0], HP, -PAD[1]]],
  spawnBarrier: 4.2,
  // the world round it: no Inkopolis bay — more of the archipelago in the mist (backdrop.js); a pale jade-turquoise sea,
  // strong fog banks lying on the water between the far islets, a soft silvery late-morning light and a hazy pink-orange
  // sunset
  env: {
    backdrop: buildBackdrop, bay: false, edge: 'none', boats: false, buoys: false, gulls: true, stars: true,
    weather: { mist: { layers: 4, height: 3.2, reach: 170, inner: 6, opacity: 0.62, scale: 0.024 } },
    theme: {
      all: { seaDeep: '#1f666c', seaShallow: '#4bb3a6', seaCrest: '#a2e3d3', foam: '#fbfffd', waveStrength: 0.7 },
      golden: {
        sunAz: 196, sunEl: 38, sunColor: '#fff2df', sunIntensity: 2.9, skySun: 2.6,
        hemiSky: '#c3d4df', hemiGround: '#e6dac4', hemiGroundK: 2.0, hemiIntensity: 0.56, envK: 0.55,
        zenith: '#5f88ad', skyMid: '#9ebccd', horizon: '#e2eaea', ground: '#7d9ba2',
        horizonGlow: '#fff1d8', horizonGlowK: 0.16, glowColor: '#fff0d2', glow: [520, 1.2, 5.0, 0.16],
        cloudLit: '#f7f8f6', cloudShade: '#a9b7c3', cloud: [0.46, 1.0, 0.85, 0.5], cloudCov: 0.5,
        haze: [1 / 620, 0.95, 150], fog: [22, 520],
        grade: { uExposure: 0.97, uSat: 0.98, uVib: 0.08, uContrast: 1.03, uLift: 0.015, uVignette: 0.2, uShadowTint: [0.95, 1.0, 1.07], uHighTint: [1.025, 1.0, 0.965] },
      },
      sunset: {
        horizon: '#ffae8c', skyMid: '#b27aa0', zenith: '#3b3f7e', horizonGlow: '#ff9a6a', glowColor: '#ffbd86',
        seaDeep: '#243f68', seaShallow: '#4a7f98', seaCrest: '#9fb8d2', foam: '#ffe4d6',
        haze: [1 / 950, 0.9, 190], fog: [30, 700],
      },
    },
  },
  single: [
    // ================= the central sandbar under the Great Arch (its legs stand in the lagoons' mouths)
    ...coreBoxes(CENTRE, sand({ tag: 'sandbar', mural: [{ n: [0, 1, 0], id: 4 }] })),
  ],
  half: [
    // ================= the ground: the wet-sand shelf round every shore, the dry sand inside it
    ...BARS,
    ...PATCHES,
    ...coreBoxes(CORES.rects.filter((r) => !onSpit(r) && !onFord(r)), sand({ tag: 'sand' })),
    ...coreBoxes(CORES.rects.filter(onSpit), sand({ tag: 'sandbar', color: K.wet })),   // (the Arch spit: a low, wet sandbar)
    ...coreBoxes(CORES.rects.filter(onFord), sand({ tag: 'ford', color: K.wet })),      // (the ford)

    // ================= the base (moved out by the stretch): the helipad islet (the tail) — the high dune the pad stands
    // on, its west arm down to the pinch, the shoulder north of the pad down to the tombolo; the camp islet — Deep Cut's
    // camp in the dune hollow, the south ridge (1.3, a 2.5 crest at its west end; set back 2.5 m off the south beach so
    // the beach under it is a lane, not a pocket), the camp's sign board
    ...moved([
      B(-1.5, 16, 0, H1, -40.2, -30.6, sand({ tag: 'pad-dune', color: K.dune })),
      B(0.6, 14.6, 0, H1, -41.4, -40.2, sand({ tag: 'pad-dune', color: K.dune })),   // (its back face set in, both back corners cut: a beach lane behind it, open at both ends)
      B(-5.2, -1.5, 0, H1, -37.5, -34.5, moss({ tag: 'pad-dune-arm' })),
      slope(-8.3, -36, 0, -5.2, -36, H1, 3),
      B(1.6, 12.6, 0, H1, -30.6, -26.0, moss({ tag: 'pad-shoulder' })),
      slope(-1.5, -29.2, 0, 1.6, -29.2, H1, 2.8),
      slope(15.9, -28.3, 0, 12.6, -28.3, H1, 3.2),                  // (the shoulder's east end: down to the spit's root)
      slope(19.1, -36.5, 0, 16, -36.5, H1, 5.6),
      B(-24, -10.2, 0, H1, -41.0, -38.6, moss({ tag: 'camp-ridge' })),
      B(-23.6, -19.6, H1, H2, -41.0, -39.0, sand({ tag: 'camp-crest', color: K.dune })),
      slope(-16.5, -40.0, H1, -19.6, -40.0, H2, 2.0),
      slope(-12.1, -35.5, 0, -12.1, -38.6, H1, 3),
      // the camp's sign board (planks on two posts, props.js): SPIRHALITE ISLANDS · DEEP CUT EXPEDITION
      B(-10.4, -10.28, 0.7, 1.8, -36.3, -33.7, { tag: 'camp-sign', color: '#a88963', pattern: PATTERN.wood, noPaint: [...SIDES, [0, 1, 0]], mural: [{ n: [1, 0, 0], id: 8 }] }),
    ]),
    // spawn: the expedition helipad (steel deck on stilts, 1.9 m over the high dune; a steel frame body R 4.9, the deck
    // plate R 5.9 cantilevered a metre past it on brackets: props.js dresses both), stairs north onto the shoulder and
    // west onto the arm. (The frame is set back so the dune under the deck's rim is floor: every spot on the rim outside
    // the spawn circle has a drop to the dune — an enemy that lands on the rim, where the only way along is through
    // the spawn circle, can always get off it.)
    ...OCT(PAD[0], PAD[1], PAD_BODY, H1, 3.0, { tag: 'helipad-frame', color: K.steelDk, pattern: PATTERN.metalpanel, noPaint: OCTSIDES }),
    ...OCT(PAD[0], PAD[1], 5.9, 2.95, HP, { tag: 'helipad', color: K.pad, pattern: PATTERN.spawn, noPaint: OCTSIDES }).map((d, i) => (i === 1 ? { ...d, mural: [{ n: [0, 1, 0], id: 7 }] } : d)),   // (its front arm: SPIRHALITE / DC-1)
    R([PAD[0], H1, PAD[1] + 9.9], [PAD[0], HP, PAD[1] + 5.45], 3, { tag: 'helipad-stair', color: K.steel, pattern: PATTERN.treads }),
    R([PAD[0] - 9.9, H1, PAD[1]], [PAD[0] - 5.45, HP, PAD[1]], 3, { tag: 'helipad-stair', color: K.steel, pattern: PATTERN.treads }),

    // ================= the bend: the ancient causeway (stone slabs at 1.3) across the inlet from the mid islet's head to
    // the camp islet. Its north end is a sheer 1.3 m face (the tower climbs it); kids take the steps off the bastion beside
    // it. Its south end is broken off (a 1.3 m drop onto the camp islet), with side steps down from it
    B(-31.1, -26.9, BOT, H1, -26.2, -10, stone({ tag: 'causeway', mural: [{ n: [0, 1, 0], id: 5 }, { n: [1, 0, 0], id: 6 }, { n: [-1, 0, 0], id: 6 }] })),
    B(-26.9, -24.8, 0, H1, -12.6, -10, stone({ tag: 'causeway-bastion' })),
    R(rise(-25.85, -6.9, 0, -25.85, -10, H1), [-25.85, H1, -10], 2.1, stone({ tag: 'causeway-steps', pattern: PATTERN.stonestep })),
    R(rise(-23.8, -24.6, 0, -26.9, -24.6, H1), [-26.9, H1, -24.6], 2.0, stone({ tag: 'causeway-steps', pattern: PATTERN.stonestep })),

    // ================= the mid islet: the Spine Crest (a 1.3 dune, a 2.5 crest) between the tower's run along its north
    // shore and the lagoon beach; slopes up from the centre side and down to the bend's head
    B(-24.2, -16, 0, H1, -8.7, -4.8, moss({ tag: 'spine-dune' })),
    B(-22.4, -19, H1, H2, -8.3, -5.2, sand({ tag: 'spine-crest', color: K.dune })),
    slope(-12.9, -6.75, 0, -16, -6.75, H1, 3.9),
    slope(-16, -6.75, H1, -19, -6.75, H2, 2.4),
    slope(-27.2, -6.75, 0, -24.2, -6.75, H1, 3.9),

    // ================= the cascade pillar on its headland (Alpha's side zone round it): the plinth (1.3) and its tier
    // (2.5), the drum above out of reach; stone steps up the plinth's south face from the zone (the route over the tiers:
    // up the steps, across the plinth, off its north face to the bridge); drums fallen from the column lie round it as
    // cover; the log bridges to the central sandbar (the headland's, the Arch spit's)
    ...OCT(PX, PZ, PILLAR.plinth, 0, H1, stone({ tag: 'pillar-plinth' })).map((d, i) => (i === 0 ? { ...d, mural: [{ n: [1, 0, 0], id: 10 }, { n: [-1, 0, 0], id: 10 }] } : i < 3 ? { ...d, mural: [{ n: [0, 0, 1], id: 10 }, { n: [0, 0, -1], id: 10 }] } : d)),
    ...OCT(PX, PZ, PILLAR.tier, H1, H2, stone({ tag: 'pillar-tier' })),
    ...OCT(PX, PZ, 1.2, H2, 4.4, stone({ tag: 'pillar-drum', roof: true, noPaint: OCTSIDES })),   // (the column above: props.js)
    R(rise(PX, PZ - PA - 3.3, 0, PX, PZ - PA, H1), [PX, H1, PZ - PA], 2.4, stone({ tag: 'pillar-steps', pattern: PATTERN.stonestep })),
    O(PX - 2.9, PZ - 5.9, 1.1, 2.1, 0, 1.1, 10, stone({ tag: 'fallen-drum' })),     // the zone's south-west (beside the steps)
    O(PX + 3.8, PZ - 5.4, 2.1, 1.1, 0, 1.1, -8, stone({ tag: 'fallen-drum' })),     // its south-east
    ...BRIDGES.map((b) => B(b.x - b.w / 2, b.x + b.w / 2, -0.3, 0.25, b.z0, b.z1, { tag: 'log-bridge', color: '#a78c6c', pattern: PATTERN.wood })),
    ...[DIGBRIDGE, BAYBRIDGE].map((b) => B(b.x0, b.x1, -0.3, 0.25, b.z - b.w / 2, b.z + b.w / 2, { tag: 'log-bridge', color: '#a78c6c', pattern: PATTERN.wood })),

    // ================= the central sandbar: blocks fallen from the arch (cover round the centre zone)
    O(-4.6, -4.8, 2.4, 1.3, 0, 1.4, 20, stone({ tag: 'arch-block' })),
    O(6.2, -2.9, 1.3, 1.1, 0, 0.9, -10, stone({ tag: 'arch-block' })),
    O(-8.4, 3.4, 2.0, 1.6, 0, 1.8, 35, stone({ tag: 'arch-block' })),

    // ================= the slice (the stretch): the tide-pool islet — a terrace of the ancient stone at 1.3 on its rocks
    // (the shelf), the ruined watch-post on it (2.5; broken parapet walls, roof tops); steps up the shelf's west face
    // from the ford's side, a sand slope up its south face from the tombolo, stone steps from the shelf to the post;
    // the rope bridge over the notch from the pillar islet's south beach up onto the shelf
    B(WATCH.shelf[0], WATCH.shelf[1], 0, H1, WATCH.shelf[2], WATCH.shelf[3], stone({ tag: 'watch-shelf' })),
    B(WATCH.post[0], WATCH.post[1], H1, H2, WATCH.post[2], WATCH.post[3], stone({ tag: 'watch-post' })),
    ...WATCH.walls.map(([x0, x1, z0, z1, y1]) => B(x0, x1, H2, y1, z0, z1, stone({ tag: 'watch-wall', roof: true, noPaint: [[0, 1, 0]] }))),
    // (the upper storey's north-east corner still stands: a broken stub over the parapet, the landmark seen from mid)
    ...WATCH.stub.map(([x0, x1, z0, z1, y0, y1]) => B(x0, x1, y0, y1, z0, z1, stone({ tag: 'watch-stub', roof: true, noPaint: [[0, 1, 0]] }))),
    R(rise(WATCH.post[0] - 2.9, -36.4, H1, WATCH.post[0], -36.4, H2), [WATCH.post[0], H2, -36.4], 2.0, stone({ tag: 'watch-steps', pattern: PATTERN.stonestep })),
    R(rise(-4.4, -35.6, 0, WATCH.shelf[0], -35.6, H1), [WATCH.shelf[0], H1, -35.6], 2.2, stone({ tag: 'watch-steps', pattern: PATTERN.stonestep })),
    slope(1.0, WATCH.shelf[2] - 3.2, 0, 1.0, WATCH.shelf[2], H1, 3.0),
    R(rise(ROPE.x, ROPE.z0, 0, ROPE.x, ROPE.z1, H1), [ROPE.x, H1, ROPE.z1], ROPE.w, { tag: 'rope-bridge', color: '#a88963', pattern: PATTERN.wood, thin: true, thickness: 0.2 }),

    // ================= the dig (the bend's new ground): Deep Cut's trench after the causeway's buried south end (floor
    // −1.0, ramps down at both ends), the spoil heap at its south-west corner (1.3; its slope down to the lagoon side)
    B(TRENCH.x0, TRENCH.x1, BOT, TRENCH.y, TRENCH.z0 + 2.4, TRENCH.z1 - 2.4, stone({ tag: 'trench', color: K.stoneDk })),   // (its floor: the buried causeway's paving)
    R(rise((TRENCH.x0 + TRENCH.x1) / 2, TRENCH.z1 - 2.4, TRENCH.y, (TRENCH.x0 + TRENCH.x1) / 2, TRENCH.z1, 0), [(TRENCH.x0 + TRENCH.x1) / 2, 0, TRENCH.z1], TRENCH.x1 - TRENCH.x0, sand({ tag: 'trench-ramp', color: K.wet })),
    R(rise((TRENCH.x0 + TRENCH.x1) / 2, TRENCH.z0 + 2.4, TRENCH.y, (TRENCH.x0 + TRENCH.x1) / 2, TRENCH.z0, 0), [(TRENCH.x0 + TRENCH.x1) / 2, 0, TRENCH.z0], TRENCH.x1 - TRENCH.x0, sand({ tag: 'trench-ramp', color: K.wet })),
    B(-32.4, -27.6, 0, H1, -49.6, -46.6, moss({ tag: 'spoil' })),
    slope(-24.5, -48.1, 0, -27.6, -48.1, H1, 3.0, { color: K.sand }),

    // blocks fallen from the tide-pool islet's watch-post, dragged to the camp islet's north beach by the expedition (cover
    // along the tower's run there)
    O(-16.2, -50.25, 2.1, 1.1, 0, 1.1, 4, stone({ tag: 'fallen-drum' })),
    O(-11.6, -50.4, 2.0, 1.1, 0, 1.1, -6, stone({ tag: 'fallen-drum' })),

    // ================= the spit's root (the stretch): a low dune across it (you walk over it; its ends at the kerbs)
    ...dune(16.4, -37.0, 4.6, 0.9, -14, { crest: 0.8 }),
  ],
  // Zone Control: the sandbar under the arch; the pillar headland (Alpha's): the sand round the plinth and the plinth's
  // top (the tier above is out of the count), the tombolo to the steps' foot. ~100 m²; its floor's centroid (−1.5,
  // −20.5) is 18.5 m from Alpha's pad and 20.5 m from the centre — halfway out, on Alpha's side of halfway
  zones: {
    center: [{ poly: zrect(6, 4), y0: -0.3, y1: 0.3 }],
    side: { poly: [[PX - 5.3, -25.6], [PX + 5.3, -25.6], [PX + 5.3, -14.8], [PX - 5.3, -14.8]], y0: -0.4, y1: 1.45 },
  },
  // Tower Command (authored on Bravo's side, z > 0: Alpha pushes along it), zig-zagging along the S: along the central
  // sandbar and the mid islet's north shore to the bend's head, CLIMB the causeway's sheer end (checkpoint 1 at its
  // foot), along the causeway over the inlet, DROP off its broken end into the dig; then (the stretch) down through the
  // trench (down its ramp into it, up the other out), over the dig bridge to the tide-pool islet and CLIMB onto the
  // shelf (checkpoint 2 under the watch-post, ~64 % of the way); then its detour loop: DROP off the shelf's south face,
  // back west along the lagoon's south beach, round the dig's south corner and east again along the camp islet's north
  // beach (the fallen blocks between the two runs) to the goal below the helipad's west stair, 13 m short of the pad.
  // Two checkpoints: the track is twice the first drawing's 88 m (tower.js: 80 s of it at 1.5× speed)
  tower: {
    path: [[0, 0], [10, 0], [10, 3], [29, 3], [29, 27.8], [27.25, 27.8], [27.25, 44], [22, 44], [22, 40], [-4.2, 40],
      [-4.2, 47.5], [21.5, 47.5], [21.5, 52.41], [-1.56, 52.41]],
    checkpoints: [[29, 8], [-0.3, 40]],
  },
  // match intro: opens over the lagoon beside the cascade pillar looking at the tide-pool islet's watch-post (its broken
  // stub, the rope bridge, the ford), then pulls back over it to your pad
  intro: { from: [-11, 7.5, -16], lookFrom: [3.2, 4.2, -36], toBack: 3.0 },
  // stage-select picture: high over Alpha's helipad — the tide-pool islet and the S sweeping away round both lagoons,
  // the arch across it
  art: { from: [11, 46, -96], look: [0, 0, -30], fov: 60 },
  decor: { lamps: [], palms: [], flags: [] },
};

export const LAYOUT = SPIRHALITE;
