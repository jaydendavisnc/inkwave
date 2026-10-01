// Spirhalite Islands — the landmass outline (pure data: imported by layout.js for the ground, by props.js for the shore
// dressing and by backdrop.js for the sandy banks under its edges). One point-symmetric outline round the whole arena:
// Alpha's half chain from the central sandbar's north shore round its half to the mirror of that point; the full outline
// is the chain + its mirror.
//
// The chain is an S (seen as the minimap shows it to Alpha: +x on the left). The middle stroke is the central sandbar
// under the Great Arch, running WSW–ENE through the centre; Alpha's half carries on west along the mid islet, bends
// south round its lagoon (the bend: an inlet from the sea spanned by the ancient causeway, a sandbar neck on the lagoon
// side, then the dig, where Deep Cut trench after the causeway's buried south end) and runs back east along the bottom
// stroke (the camp islet, a sandbar pinch, the helipad islet) to the tail. From the tail two arms reach back north into
// the lagoon: the tide-pool islet (a rock shelf with the ruined watch-post, tied to the helipad islet by a sand tombolo)
// with the pillar islet beyond it (the cascade pillar's islet: Alpha's side zone; joined to the tide-pool islet by a
// sandbar ford on its west, a rope bridge over the notch on its east; a log bridge from its tip to the central
// sandbar), and the Arch spit, a sandbar along the lagoon's mouth inside the Great Arch's leg (a second log bridge
// from its tip, under the arch, to the central sandbar's east end). Bravo's half is the same turned 180°.
//
// The Long Stages stretch (2026-09-30): the base — the bottom stroke and the tail, everything south of the cut — was
// moved out SHIFT = 22 m along the spawn axis (mid → Alpha's pad, 13° off −z); the gap is the slice: the dig in the
// bend, the tide-pool islet between the pillar islet and the helipad islet, the Arch spit's root. The base's points
// below are written where they stood before (sh(x, z) moves them), so the old plan still reads in the numbers.
import { symOutline, LEVELS } from './islands.js';

export const STRETCH = { d: 22, axis: [8.5 / 36.99, -36 / 36.99] };   // Δ along the unit spawn axis
export const SHIFT = [+(STRETCH.d * STRETCH.axis[0]).toFixed(2), +(STRETCH.d * STRETCH.axis[1]).toFixed(2)];   // (5.06, −21.41)
export const sh = (x, z) => [+(x + SHIFT[0]).toFixed(2), +(z + SHIFT[1]).toFixed(2)];

// the cascade pillar (Alpha's; Bravo's is the mirror): its centre, the plinth (1.3) and tier (2.5) octagons' circumradii,
// the islet's radius round it
export const PILLAR = { x: -1.5, z: -18.6, plinth: 3.8, tier: 2.2, isle: 6.6 };
const arc = (a0, a1, step) => { const out = []; for (let a = a0; a <= a1 + 1e-9; a += step) { const r = (a * Math.PI) / 180; out.push([+(PILLAR.x + Math.cos(r) * PILLAR.isle).toFixed(2), +(PILLAR.z + Math.sin(r) * PILLAR.isle).toFixed(2)]); } return out; };

// the slice's new shores (named: props.js lays its shore kerbs along the same points)
export const DIG_SEA = [[-35.2, -26.8], [-36.4, -31.0], [-36.8, -35.6], [-36.4, -40.2], [-35.2, -44.4], [-33.4, -48.4]];   // the dig's sea shore
export const SPIT_SEA = [[22.2, -43.4], [20.4, -39.2], [19.0, -34.6], [17.8, -29.8]];                                      // the spit's root: sea side
export const SPIT_BAY = [[11.0, -25.0], [11.8, -30.0], [12.6, -35.0], [13.6, -39.6]];                                      // … its bay side
export const TIDE_E = [[8.0, -42.6], [6.6, -41.4], [6.4, -38.4], [6.9, -35.6], [3.0, -33.8], [0.0, -34.0], [-2.8, -34.3]];   // the tide-pool islet: east shore, the notch
export const FORD_E = [[-3.6, -32.4], [-3.6, -29.6]];                                                                       // the ford's east edge
export const PILLAR_S = [[-1.6, -28.0], [1.6, -27.6], [3.8, -26.6], [5.0, -24.8], [5.3, -23.0]];                           // the pillar islet's south shore
export const FORD_W = [[-7.3, -28.4], [-6.6, -29.8], [-6.6, -32.4], [-7.4, -34.4]];                                        // the ford's west edge
export const TIDE_W = [[-8.2, -36.6], [-8.0, -40.6], [-7.4, -42.6], [-8.6, -44.2]];                                         // the tide-pool islet: west shore, the tombolo
export const DIG_LAGOON = [[-11.4, -44.8], [-14.4, -44.9], [-17.0, -44.2], [-18.6, -42.8], [-19.2, -39.4], [-19.4, -35.0], [-19.2, -31.0], [-18.6, -27.6]];   // the lagoon's south end, the dig's lagoon shore

export const CHAIN = [
  [1.0, 7.6], [-4.0, 5.6], [-8.0, 3.9], [-12.0, 2.6], [-16.0, 1.4], [-20.0, 0.6], [-24.0, 0.2], [-28.0, -0.4],   // mid islet: north shore
  [-31.6, -2.2], [-34.2, -5.6], [-35.2, -9.6], [-34.6, -13.2],                                                   // the bend's head
  [-32.0, -14.6], [-28.5, -15.0], [-24.6, -15.6], [-23.4, -18.6], [-24.6, -21.4], [-28.5, -22.6], [-32.6, -23.2], // the inlet under the causeway
  ...DIG_SEA,                                                                                     // the dig's sea shore (new)
  sh(-35.4, -31.4), sh(-33.5, -35.9), sh(-29.4, -40.4), sh(-23.8, -43.4), sh(-17.0, -44.6), sh(-11.6, -44.2),   // the camp islet
  sh(-9.4, -42.4), sh(-8.4, -39.8), sh(-7.0, -39.3), sh(-5.2, -40.3), sh(-4.2, -42.4), sh(-2.2, -44.0),         // the pinch (an inlet from the south)
  sh(3.6, -44.8), sh(10.0, -44.6), sh(16.6, -43.6), sh(19.8, -39.6), sh(21.0, -35.4), sh(20.8, -30.6), sh(19.0, -26.8),   // the helipad islet, the tail
  ...SPIT_SEA,                                                                                                    // the spit's root: sea side (new)
  [16.6, -24.4], [15.9, -20.0], [15.9, -14.2], [16.8, -11.4], [16.7, -8.6], [12.2, -8.4], [11.3, -10.0],        // the Arch spit: out along the leg …
  [10.9, -12.4], [10.9, -16.0], [10.7, -20.4],                                                                    // … and back down the east bay
  ...SPIT_BAY,                                                                                                    // the spit's root: bay side (new)
  sh(9.4, -22.5), sh(7.2, -22.9), sh(5.4, -22.4),                                                                 // the east bay's head
  ...TIDE_E, ...FORD_E,                                                                                           // the tide-pool islet: east shore, the notch under the rope bridge, the ford's east edge (new)
  ...PILLAR_S,                                                                                                    // the pillar islet's south shore (new)
  ...arc(-25, 205, 23),                                                                                           // the pillar islet
  [-7.4, -23.8], [-7.9, -26.2],                                                                                   // its west beach
  ...FORD_W, ...TIDE_W,                                                                                           // the ford's west edge, the tide-pool islet's west shore, the tombolo (new)
  ...DIG_LAGOON,                                                                                                  // the lagoon's south end, the dig's lagoon shore (new)
  [-17.8, -24.4], [-18.4, -21.0], [-18.2, -17.0], [-17.4, -13.8],                                                // the neck
  [-15.0, -12.7], [-11.0, -11.5], [-7.0, -9.9], [-3.2, -8.4],                                                    // mid islet: lagoon shore
];
export const OUTLINE = symOutline(CHAIN);
// the wet-sand shelf bar's top on outline edge i (edges alternate; an odd chain wraps round on the third level)
export const barLevel = (i) => { const n = CHAIN.length, k = i % n; return n % 2 && k === n - 1 ? LEVELS[2] : LEVELS[k % 2]; };
// every shore with its bar level per edge: the backdrop's banks run under all of them
export const SHORES = [{ poly: OUTLINE, level: barLevel }];
