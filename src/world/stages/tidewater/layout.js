// Tidewater Plaza — stage layout (src/world/stages/tidewater/). The stage owns every file in this folder:
//   layout.js    level geometry (this file)        props.js    prop pack + placements (set dressing)
//   surfaces.js  stage surface materials (texlib)  murals.js   stage decals / signage (mural atlas)
//
// A Victorian seaside town's civic square where the harbour meets the promenade — laid out as a crescent round a bay.
// The Town Hall (Alpha, -Z) and the Custom House (Bravo, +Z) sit out on wings at the two tips; between them the square
// fans out round the round Jubilee terrace and its clock tower. Seen from above the playable deck is a lens: two
// crescents meeting at the spawn wings. Per team (Alpha looking +Z; its right hand is -X):
//   • spawn: the Town Hall's first-floor loggia (2.6 m above the square) — the central balcony with twin stone flights
//     running out sideways, one onto the tip of the promenade, one to the foot of the colonnade; a drop at the front
//   • right lane "the Promenade" (-X): a raised sea-front walk sweeping round the bay in a crescent (R 46 m), cast-iron
//     railing on the sea side, a glazed shelter, the ice-cream kiosk, Punch & Judy; it opens onto the pier gate at mid
//   • centre "the Square": sunk 20 cm below the pavements, fanning out from 22 m wide at the spawn to 45 m at mid — the
//     fountain, the bandstand, then the round terrace (1.2 m) with four flights and the tower on its square dais
//   • left lane "the Colonnade" (+X): a bent terrace of three buildings (the Crescent) with a cast-iron colonnade in
//     front — covered walk below, a 3.7 m terrace walk on top, reached from the spawn wing and, near mid, by a stair
//     along its front (the enemy's way up) or by climbing the landing pier as a squid
// The two lanes swap at mid: your Promenade runs into the enemy's Colonnade, and vice versa.
//
// The Long Stages stretch (2026-09-30): each half is TD = 19.2 m longer. The base side — the Town Hall and its fountain
// forecourt, the tea rooms, the floral clock, the bandstand, the promenade's crescent, the Crescent's first two houses —
// stands TD further out than the first build (tq(z): a base-side z of the first build, moved out), and the new land
// between it and mid is the WINTER GARDENS (GARDEN below): a public garden round a cast-iron Palm House, its raised
// terrace (the slice's strategic point) facing mid over a parterre of beds and topiary; the promenade runs on as a
// straight esplanade along the sea (ESPL) and the Crescent gains a fourth house, the Assembly Rooms, with its colonnade,
// its terrace walk carried on and a stair up to it from the garden.
import { PATTERN, B, R, O, OCT } from '../../mapkit.js';
import { SURF } from './surfaces.js';

const M = {
  plaza: '#c89c84', prom: '#d9d0c0', colFloor: '#dccdc0', loggia: '#e9e0d0', terrace: '#ddd3c1', stucco: '#efe6d3',
  mint: '#cfe3d6', pink: '#eed7cb', butter: '#efe0bb', granite: '#b9b3a8', stone: '#d8d0c0', seawall: '#b8b0a3',
  planter: '#b9ad9a', joint: '#a9a399', lawn: '#9aa47a', palm: '#d8cfbd',
};
const NP_ALL = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
const stucco = (color, o = {}) => ({ color, pattern: SURF.stucco, ...o });
const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------------------------------------------
// Shared geometry (props.js imports it so the dressing follows the curves exactly)
// ---------------------------------------------------------------------------------------------------------------
export const SQ = -0.2;                                             // the square's paving; pavements stand at 0
// the Long Stages stretch: the base side's shift, and a base-side z of the first build moved out
export const TD = 19.2;   // (eight 2.4 m herringbone repeats: the square's brickwork lies as it did)
export const tq = (z) => z - TD;
// the promenade crescent (Alpha's, on -X): an 8 m raised walk round a circle, sea edge at rOut (the crescent moved out
// with the base; ESPL, the straight esplanade section, runs from the pier forecourt at mid to the crescent's start)
export const PROM = { c: [19, tq(-4)], rIn: 38, rOut: 46, a0: 180, a1: 228, n: 13 };
export const ESPL = { x: [PROM.c[0] - PROM.rOut, PROM.c[0] - PROM.rIn], z: [PROM.c[1], -4] };
// the round Jubilee terrace at mid: a ring of turned slabs (top 1.0) round a square dais (1.1) carrying the tower
export const TERR = { rIn: 5.8, rOut: 8.5, n: 36, a0: 5, top: 1.0, dais: 5.8, daisTop: 1.1 };
// the Crescent (Alpha's colonnade, on +X): the shop-front line (bends between three buildings), the covered walk /
// terrace walk depth in front of it, the shops' depth behind it, and the terrace walk slab
// (the stretch: the first two houses moved out, the Assembly Rooms fill the new straight section in line with the
//  north house: sections 0 houses, 1 the Grand Hotel, 2 the Assembly Rooms, 3 the corner house by mid)
export const COLO = { front: [[18.9, tq(-38.3)], [22.5, tq(-29)], [24.5, tq(-19)], [24.5, -19], [24.5, -9]], deck: 4.5, floor: 5.1, shops: 3, deckBot: 3.35, deckTop: 3.7 };
// the landing pier + stair (on the straight north section) and the spawn wing's threshold landing
export const STAIR = { x: [17.5, 20], foot: -7.0, top: -15.5, landing: -18.5 };
// the Assembly Rooms' stair: up from the garden (foot) toward mid onto a landing at the terrace walk's front
export const STAIR_AR = { x: [17.5, 20], foot: -39.1, top: -30.1, landing: -27.1 };
// Tower Command's build of the stage (pieces tagged onlyIn / notIn 'tower', see src/world/variants.js; its track is
// src/world/tower-data.js). The tower starts inside the clock tower and rides out through it, so the tower stands on an
// open arcade; the bandstand's roof goes up and its columns stand wider so the tower rides through under it (in by its
// steps, off its back as a drop); the Crescent's stair is turned round (it climbs toward mid, onto a landing level with
// the terrace walk's open end) and a few flights, beds and bits of street furniture give the track room.
//   arcade: the clock tower's open base (half width hw, arch openings ±open, springing / crown / soffit / top, abs)
//   band:   the bandstand's centre z (Alpha's), column-top height (prop-local, over the square), its steps' foot z
//   flight / flightW: where the terrace's south + north / west + east flights reach down to (m from the centre; the
//           shared build's 12.4). The west + east ones (the track goes down them) start from a landing strip at the
//           dais's height across the ring, so the track leaves the dais level and goes straight down the flight
//   forecourt: the pier forecourt's paving starts this far out (the shared build's 17): the square runs on under the
//           track's loop to the pier gate, so the whole route there is on the square's level
export const TW = {
  arcade: { hw: 2.3, open: 1.5, spring: 3.9, crown: 5.4, soffit: 5.5, top: 6.4 },
  band: { z: tq(-21.8), ct: 5.4, stepFoot: tq(-16.02) },
  flight: 10.9, flightW: 11.5,
  forecourt: 21,
};
// the Winter Gardens (the stretch's new land, between the mid square and the bandstand): the Palm House (a stone plinth
// under the glass — the glass is a collider, its ironwork and panes are the prop), its raised terrace in front (the
// slice's strategic point: a flight down from each front corner toward mid, the end walls a hop / a squid climb),
// stone-kerbed beds (one at the terrace's foot, one on each walk beside the Palm House; the topiary on them is the cover)
//   palm / terrace / beds: [x0, x1, z0, z1]; flights: [x, zTop, zFoot, w] (north-running, Alpha)
export const GARDEN = {
  palm: [-6.4, 6.4, -32.2, -25.9], plinth: 0.9, glass: 5.4,
  terrace: [-6.4, 6.4, -25.9, -22.7], top: 1.2,
  flights: [[-5.2, -22.7, -19.5, 2.4], [5.2, -22.7, -19.5, 2.4]],
  beds: [[-3.0, 3.0, -22.3, -19.9], [-15.5, -9.6, -31.6, -26.2], [9.6, 14.0, -31.6, -26.2]], bedTop: 0.25,
  // (the walks beside the Palm House, x ±6.6 … ±9.4, stay clear: the direct way from the bandstand to mid)
};
// the Crescent's stair turned round (Tower Command): foot by the anchor, climbing toward mid onto a landing that
// meets the terrace walk's open end (landing = the landing's far end, as in STAIR)
export const STAIR_REV = { x: [17.5, 20], foot: -20.8, top: -12.0, landing: -9.0 };

// turned segments along a circle arc (centre c, radii rIn…rOut, angles a0…a1 degrees, n pieces) meeting at their inner
// corners (like mapkit ARC); fill: lower slabs over the outer wedges between them (and at the chain ends if `ends`)
// (y0 may be [even, odd]: the bottoms alternate to sit on arcSub's alternating tops)
export function arcBand(c, rIn, rOut, a0, a1, n, y0, y1, o, fill = null, ends = false, skip = null) {
  const out = [], da = (a1 - a0) / n, t = rOut - rIn, rm = (rIn + rOut) / 2, h = Math.abs(da) * D2R / 2, len = 2 * rIn * Math.tan(h);
  for (let i = 0; i < n; i++) {
    if (skip && skip(i)) continue;
    const a = (a0 + da * (i + 0.5)) * D2R;
    out.push(O(c[0] + rm * Math.cos(a), c[1] + rm * Math.sin(a), t, len, Array.isArray(y0) ? y0[i % 2] : y0, y1, -a / D2R, o));
  }
  // ends: true = fillers at both chain ends too, 'closed' = a full ring (one filler per joint)
  if (fill) for (let i = ends ? 0 : 1; i <= (ends === 'closed' ? n - 1 : ends ? n : n - 1); i++) {
    const a = (a0 + da * i) * D2R, r0 = rIn / Math.cos(h), rmf = (r0 + rOut) / 2, gap = 2 * (rOut - rIn) * Math.tan(h) + 0.14;
    out.push(O(c[0] + rmf * Math.cos(a), c[1] + rmf * Math.sin(a), rOut - r0, gap, fill.y0, fill.y1, -a / D2R, fill.o));
  }
  return out;
}
// the sea-wall plinth under a band: the same segments down in the water, but meeting at their OUTER corners (so the
// outer face runs on unbroken and there are no wedges to fill: one slab per facet keeps the environment's deck-rect
// count low); the overlapping inner corners take alternate tops (tops = [even, odd])
export function arcSub(c, rIn, rOut, a0, a1, n, y0, tops, o) {
  const out = [], da = (a1 - a0) / n, t = rOut - rIn, rm = (rIn + rOut) / 2, h = Math.abs(da) * D2R / 2, len = 2 * rOut * Math.tan(h);
  for (let i = 0; i < n; i++) {
    const a = (a0 + da * (i + 0.5)) * D2R;
    out.push(O(c[0] + rm * Math.cos(a), c[1] + rm * Math.sin(a), t, len, y0, tops[i % 2], -a / D2R, o));
  }
  return out;
}
// sections along a polyline P (travelling so the outward side is on the right: n = (dz, -dx)), spanning offsets
// dIn…dOut from the line (negative = inward); pieces meet at their inner corners, fill covers the outer wedges
function unit(a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return [dx / l, dz / l, l]; }
export function chainSections(P, dIn) {
  const S = [];
  for (let i = 0; i < P.length - 1; i++) { const [dx, dz, l] = unit(P[i], P[i + 1]); S.push({ p: P[i], d: [dx, dz], n: [dz, -dx], l, h: Math.atan2(dx, dz) / D2R }); }
  // inner-line corner points Q (intersections of consecutive inward offset lines)
  const Q = [];
  for (let i = 0; i <= S.length; i++) {
    if (i === 0) { const s = S[0]; Q.push([s.p[0] + s.n[0] * dIn, s.p[1] + s.n[1] * dIn]); continue; }
    if (i === S.length) { const s = S[i - 1], e = P[i]; Q.push([e[0] + s.n[0] * dIn, e[1] + s.n[1] * dIn]); continue; }
    const a = S[i - 1], b = S[i], pa = [a.p[0] + a.n[0] * dIn, a.p[1] + a.n[1] * dIn], pb = [b.p[0] + b.n[0] * dIn, b.p[1] + b.n[1] * dIn];
    const den = a.d[0] * b.d[1] - a.d[1] * b.d[0];
    if (Math.abs(den) < 1e-9) { Q.push(pb); continue; }   // (sections in line: one offset line, the corner is b's start)
    const t = ((pb[0] - pa[0]) * b.d[1] - (pb[1] - pa[1]) * b.d[0]) / den;
    Q.push([pa[0] + a.d[0] * t, pa[1] + a.d[1] * t]);
  }
  return S.map((s, i) => ({ ...s, q0: Q[i], q1: Q[i + 1], len: Math.hypot(Q[i + 1][0] - Q[i][0], Q[i + 1][1] - Q[i][1]) }));
}
export function chainBand(P, dIn, dOut, y0, y1, o, fill = null, only = null) {
  const out = [], S = chainSections(P, dIn);
  S.forEach((s, i) => {
    if (only && !only(i)) return;
    const w = dOut - dIn, cx = (s.q0[0] + s.q1[0]) / 2 + s.n[0] * w / 2, cz = (s.q0[1] + s.q1[1]) / 2 + s.n[1] * w / 2;
    out.push(O(cx, cz, w, s.len, Array.isArray(y0) ? y0[i % 2] : y0, y1, s.h, o));
    if (fill && i > 0) {
      const a = S[i - 1], nb = unit([0, 0], [a.n[0] + s.n[0], a.n[1] + s.n[1]]), db = [-nb[1], nb[0]];
      // (fill.e: start the filler that far out along the bisector, so its inner corners stay behind the front faces)
      const half = Math.acos(Math.max(-1, Math.min(1, a.d[0] * s.d[0] + a.d[1] * s.d[1]))) / 2, e = fill.e || 0, L = w / Math.cos(half) - e, gap = 2 * w * Math.tan(half) + 0.14;
      out.push(O(s.q0[0] + nb[0] * (e + L / 2), s.q0[1] + nb[1] * (e + L / 2), L, gap, fill.y0, fill.y1, Math.atan2(db[0], db[1]) / D2R, fill.o));
    }
  });
  return out;
}

// chainBand's plinth: sections meeting at their outer corners (offset dOut), alternate tops
export function chainSub(P, dIn, dOut, y0, tops, o) {
  const w = dOut - dIn;
  return chainSections(P, dOut).map((s, i) => O((s.q0[0] + s.q1[0]) / 2 - s.n[0] * w / 2, (s.q0[1] + s.q1[1]) / 2 - s.n[1] * w / 2, w, s.len, y0, tops[i % 2], s.h, o));
}

const P = PROM, T = TERR, C = COLO, F = COLO.front;
// deck construction (the environment reads every box whose top is between -2.5 and 0 and whose bottom is below -1 as a
// deck rect: sea masking, foam, pilings, waterline): the walking surfaces stop at -0.9 / -0.99 and the few slabs that
// reach the sea are a plinth under them (PLINTH tops alternate between neighbours), 22 per half
const PL = [-0.9, -0.99], PLINTH = stucco(M.seawall, { tag: 'sea-wall-plinth' });
const JOINT = { y0: -0.99, y1: -0.1, o: stucco(M.joint, { tag: 'paving-joint' }) };

const TIDEWATER = {
  id: 'tidewater',
  bounds: { minX: -28, maxX: 28, minZ: tq(-47), maxZ: -tq(-47) },
  spawnPads: [[0, 2.4, tq(-41.8)], [0, 2.4, -tq(-41.8)]],
  spawnBarrier: 4.2,
  // match intro: opens high beside the clock tower's dials, then sweeps back down the square to your loggia
  intro: { from: [11, 16.5, 12], lookFrom: [0, 10.5, 0], toBack: 3.0 },
  // stage-select hero shot: from out over the bay off the esplanade, past the clock tower across the Winter Gardens'
  // Palm House to the Town Hall, the bandstand and the Crescent with the Assembly Rooms
  art: { from: [-34, 21, 4], look: [4, 0, -24], fov: 64 },
  single: [
    // ---- the round Jubilee terrace: ring of slabs (1.0) with granite joints, the square dais (1.1), the tower
    ...arcBand([0, 0], T.rIn, T.rOut, T.a0, T.a0 + 360, T.n, -0.6, T.top, stucco(M.terrace, { tag: 'terrace-ring' }),
      { y0: -0.6, y1: T.top - 0.1, o: stucco(M.joint, { tag: 'terrace-joint' }) }, 'closed'),
    B(-T.dais, T.dais, -0.6, T.daisTop, -T.dais, T.dais, stucco(M.terrace, { tag: 'terrace-dais', mural: [{ n: [0, 1, 0], id: 5 }] })),
    B(-1.7, 1.7, T.daisTop, 3.6, -1.7, 1.7, stucco(M.stucco, { tag: 'tower-base', notIn: 'tower' })),
    B(-1.7, 1.7, 3.6, 12.5, -1.7, 1.7, stucco(M.stucco, { tag: 'tower', noPaint: NP_ALL, roof: true, notIn: 'tower' })),
    // Tower Command: the tower stands on an open arcade — four corner piers (arches on all four faces, the dressing's),
    // a soffit block over the passage, the shaft on top (the tower starts inside and rolls out through the ±X arches)
    ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
      const a = TW.arcade, x0 = sx * a.open, x1 = sx * a.hw, z0 = sz * a.open, z1 = sz * a.hw;
      return B(Math.min(x0, x1), Math.max(x0, x1), T.daisTop, a.soffit, Math.min(z0, z1), Math.max(z0, z1), stucco(M.stucco, { tag: 'tower-pier', onlyIn: 'tower' }));
    }),
    B(-TW.arcade.hw, TW.arcade.hw, TW.arcade.soffit, TW.arcade.top, -TW.arcade.hw, TW.arcade.hw, stucco(M.stucco, { tag: 'tower-arcade', noPaint: NP_ALL, roof: true, onlyIn: 'tower' })),
    B(-1.7, 1.7, TW.arcade.top, 12.5, -1.7, 1.7, stucco(M.stucco, { tag: 'tower', noPaint: NP_ALL, roof: true, onlyIn: 'tower' })),
    // the terrace balustrade (collision only — the stone balustrade you see is a prop), open at the four flights
    ...arcBand([0, 0], T.rOut - 0.34, T.rOut - 0.1, T.a0, T.a0 + 360, T.n, T.top, T.top + 1.05, { rail: true, tag: 'terrace-rail' }, null, false,
      (i) => [8, 17, 26, 35].some((k) => Math.abs(((i - k + 36) % 36)) <= 1 || Math.abs(((k - i + 36) % 36)) <= 1)),
  ],
  half: [
    // ================= the square (paving at SQ; its ragged edges hide under the pavements / buildings)
    // (the herringbone runs from each slab's max-x / min-z corner and repeats every 2.4 m: the open seams sit on that
    //  lattice so the brickwork carries straight across them; the rest are under granite kerbs or other pieces)
    // (the stretch: the square runs on under the Winter Gardens to the fountain band, one slab TD longer — TD is ten
    //  2.4 m repeats, so the brickwork at mid and at the seams lies exactly as it did)
    B(-19.5, 21, -0.9, SQ, tq(-25), 0, { tag: 'square', color: M.plaza, pattern: SURF.herringbone }),
    // the fountain band: symmetric about its fountain in both halves, so the crest mosaic lands the same way round
    B(-9, 9, -0.9, SQ, tq(-37), tq(-25), { tag: 'square-fountain', color: M.plaza, pattern: SURF.herringbone, mural: [{ n: [0, 1, 0], id: 4 }] }),
    B(9, 19, -0.9, SQ, tq(-37), tq(-25), { tag: 'square', color: M.plaza, pattern: SURF.herringbone }),
    B(-15, -9, -0.9, SQ, tq(-29), tq(-25), { tag: 'square', color: M.plaza, pattern: SURF.herringbone }),
    B(-11.5, -9, -0.9, SQ, tq(-37), tq(-29), { tag: 'square', color: M.plaza, pattern: SURF.herringbone }),
    // the tip by the hall (its sea faces show: these two reach the sea themselves)
    B(-11.5, 19, -1.2, SQ, tq(-38.4), tq(-37), { tag: 'square', color: M.plaza, pattern: SURF.herringbone }),
    B(-9.5, 17.9, -1.2, SQ, tq(-45.3), tq(-38.4), { tag: 'square-under-hall', color: M.plaza, pattern: SURF.herringbone }),
    // the square's own deck slabs, hidden under its paving
    B(-19.5, 21, -2.0, -1.1, tq(-25), 0, stucco(M.seawall, { tag: 'square-deck' })),
    B(-12.8, 19, -2.0, -1.1, tq(-37), tq(-25), stucco(M.seawall, { tag: 'square-deck' })),

    // ================= the Promenade crescent (terrazzo walk at 0, granite joints between its slabs)
    ...arcBand(P.c, P.rIn, P.rOut, P.a0, P.a1, P.n, PL, 0, { tag: 'promenade', color: M.prom, pattern: SURF.terrazzo },
      JOINT, true),
    ...arcSub(P.c, P.rIn, P.rOut, P.a0, P.a1, P.n, -2.0, PL, PLINTH),
    // the esplanade: the promenade's straight section along the sea from the pier forecourt to the crescent (the stretch)
    B(ESPL.x[0], ESPL.x[1], -0.9, 0, ESPL.z[0], ESPL.z[1], { tag: 'esplanade', color: M.prom, pattern: SURF.terrazzo }),
    B(ESPL.x[0], ESPL.x[1], -2.0, PL[1], ESPL.z[0], ESPL.z[1], PLINTH),
    // the pier-gate forecourt at mid (west side; its mirror is the east side's), between the promenade and the Crescent
    B(-27, -17, -2.0, 0, -4, 9, { tag: 'pier-forecourt', color: M.prom, pattern: SURF.terrazzo, notIn: 'tower' }),
    // Tower Command: the forecourt's paving cut back to x ±21 (the square, on its deck, fills in at its corner by mid)
    B(-27, -TW.forecourt, -2.0, 0, -4, 9, { tag: 'pier-forecourt', color: M.prom, pattern: SURF.terrazzo, onlyIn: 'tower' }),
    B(-TW.forecourt, -19.5, -2.0, SQ, -4, 0, { tag: 'square', color: M.plaza, pattern: SURF.herringbone, onlyIn: 'tower' }),
    B(-27, -24, 0, 2.6, -5.5, -2.5, stucco(M.stucco, { tag: 'pier-booth', roof: true, mural: [{ n: [0, 0, 1], id: 11 }] })),
    B(24, 27, 0, 2.6, -5.5, -2.5, stucco(M.stucco, { tag: 'pier-booth', roof: true, mural: [{ n: [0, 0, 1], id: 11 }] })),
    // sea railings (collision only; the cast iron is a prop): round the crescent, the forecourt, the tip by the hall
    ...arcBand(P.c, P.rOut - 0.24, P.rOut - 0.08, P.a0, P.a1, P.n, 0, 1.18, { rail: true, tag: 'sea-rail' }),
    B(-26.95, -26.79, 0, 1.18, 5.5, 9, { rail: true, tag: 'sea-rail' }),
    B(PROM.c[0] - PROM.rOut + 0.08, PROM.c[0] - PROM.rOut + 0.24, 0, 1.18, ESPL.z[0], -5.5, { rail: true, tag: 'sea-rail' }),   // (the esplanade's)
    B(-11.6, -9.5, SQ, 1.0, tq(-38.36), tq(-38.2), { rail: true, tag: 'sea-rail' }),

    // ================= Town Hall: spawn loggia, central balcony, twin stone flights out to the two lanes
    B(-9.5, 22, -1.2, 5.2, tq(-46), tq(-45.4), stucco(M.stucco, { tag: 'townhall-wall', roof: true })),
    B(-9.5, 9.5, SQ, 2.2, tq(-45.4), tq(-38.4), stucco(M.stucco, { tag: 'loggia-body', noPaint: [[1, 0, 0], [-1, 0, 0]] })),
    B(-9.5, 9.5, 2.2, 2.4, tq(-45.4), tq(-38.4), { tag: 'loggia', color: M.loggia, pattern: SURF.terrazzo, noPaint: [[1, 0, 0], [-1, 0, 0]] }),
    B(-4.8, 4.8, SQ, 2.2, tq(-38.4), tq(-36), stucco(M.stucco, { tag: 'balcony-body', noPaint: [[0, 0, 1]] })),
    B(-4.8, 4.8, 2.2, 2.4, tq(-38.4), tq(-36), { tag: 'balcony', color: M.loggia, pattern: SURF.terrazzo, noPaint: [[0, 0, 1]] }),
    R([-10.8, SQ, tq(-37.2)], [-4.8, 2.4, tq(-37.2)], 2.4, { tag: 'flight-w', color: M.granite, pattern: PATTERN.stonestep }),
    R([10.8, SQ, tq(-37.2)], [4.8, 2.4, tq(-37.2)], 2.4, { tag: 'flight-e', color: M.granite, pattern: PATTERN.stonestep }),
    // the loggia's seaward side stands over the water: a balustrade (collision here, stone as a prop)
    B(-9.45, -9.2, 2.4, 3.45, tq(-45.3), tq(-38.4), { rail: true, tag: 'loggia-rail' }),
    // east wing walk (2.4) → steps → the threshold landing (3.8) over the Crescent's first terrace-walk slab (3.7)
    B(9.5, 17.9, SQ, 2.2, tq(-45.4), tq(-41.5), stucco(M.stucco, { tag: 'wing-body', noPaint: [[0, 0, 1]] })),
    B(9.5, 17.9, 2.2, 2.4, tq(-45.4), tq(-41.5), { tag: 'wing-walk', color: M.loggia, pattern: SURF.terrazzo, noPaint: [[0, 0, 1]] }),
    R([16.0, 2.4, tq(-41.5)], [16.0, 3.8, tq(-38.3)], 3.8, { tag: 'wing-steps', color: M.granite, pattern: PATTERN.stonestep }),
    // the steps' solid base: the flight starts 2.4 m up, and the space under it (behind the balustrade's skirt, open to
    // the square) was a pocket kids and bots walked into through the skirt and got stuck in. Its face stands just behind
    // the skirt (dressing over it → not inkable); its top is buried in the flight.
    B(14.16, 17.9, SQ, 2.3, tq(-41.5), tq(-38.3), stucco(M.stone, { tag: 'wing-steps-base', noPaint: NP_ALL })),
    B(13.9, 17.9, -1.2, 3.8, tq(-38.3), tq(-36.4), stucco(M.pink, { tag: 'colonnade-end', noPaint: [[0, 0, 1], [1, 0, 0]], mural: [{ n: [0, 0, 1], id: 7 }] })),
    B(17.9, 25, -1.2, 5.4, tq(-45.4), tq(-38.3), stucco(M.pink, { tag: 'crescent-corner', noPaint: NP_ALL, roof: true })),
    B(17.9, 25, -2.0, -1.2, tq(-45.4), tq(-38.3), stucco(M.seawall, { tag: 'corner-quay', noPaint: NP_ALL })),

    // ================= the Crescent: covered-walk floor (runs on under the shops: the deck's sea edge is their back
    //                   wall), terrace walk, shops, upper storeys (three buildings; wedge fillers close the backs' bends)
    ...chainBand(F, -C.floor, C.shops, PL, 0, { tag: 'colonnade-walk', color: M.colFloor, pattern: SURF.terrazzo }, JOINT),
    ...chainSub(F, -C.floor, C.shops, -2.0, PL, PLINTH),
    ...chainBand(F, -C.deck, 0, C.deckBot, C.deckTop, { tag: 'colonnade-walk-top', color: M.colFloor, pattern: SURF.terrazzo },
      { y0: C.deckBot, y1: C.deckTop - 0.1, o: { tag: 'walk-joint', color: M.colFloor, pattern: SURF.terrazzo } }),
    ...chainBand(F, 0, C.shops, 0, C.deckTop, stucco(M.pink, { tag: 'crescent-shops', mural: [{ n: [0, 0, 1], id: 9 }] }),
      { e: 0.06, y0: 0, y1: C.deckTop - 0.1, o: stucco(M.pink, { tag: 'crescent-shops-joint', noPaint: NP_ALL }) }),
    ...chainBand(F, 0, C.shops, C.deckTop, 7.6, stucco(M.pink, { tag: 'crescent-upper', noPaint: NP_ALL, roof: true }), null, (i) => i === 0),
    ...chainBand(F, 0, C.shops, C.deckTop, 9.2, stucco(M.butter, { tag: 'hotel-upper', noPaint: NP_ALL, roof: true }),
      { e: 0.06, y0: C.deckTop, y1: 7.5, o: stucco(M.pink, { tag: 'crescent-upper-joint', noPaint: NP_ALL, roof: true }) }, (i) => i === 1),
    // the Assembly Rooms (the stretch's fourth house, in line with the corner house): taller than the hotel
    ...chainBand(F, 0, C.shops, C.deckTop, 10.2, stucco(M.stone, { tag: 'assembly-upper', noPaint: NP_ALL, roof: true }),
      { e: 0.06, y0: C.deckTop, y1: 9.1, o: stucco(M.butter, { tag: 'crescent-upper-joint', noPaint: NP_ALL, roof: true }) }, (i) => i === 2),
    ...chainBand(F, 0, C.shops, C.deckTop, 7.2, stucco(M.mint, { tag: 'crescent-upper', noPaint: NP_ALL, roof: true }),
      { e: 0.06, y0: C.deckTop, y1: 7.1, o: stucco(M.mint, { tag: 'crescent-upper-joint', noPaint: NP_ALL, roof: true }) }, (i) => i === 3),
    // the Grand Hotel's roof parapet balustrade (collision only, on its off-limits roof)
    ...chainBand(F, 0.02, 0.3, 9.2, 10.05, { rail: true, tag: 'hotel-parapet' }, null, (i) => i === 1),
    // terrace-walk railing (collision only), on the first two sections; the north section's is split round the landing
    ...chainBand(F, -C.deck, -C.deck + 0.16, C.deckTop, C.deckTop + 1.1, { rail: true, tag: 'walk-rail' }, null, (i) => i < 2),
    // the Assembly Rooms' stretch of the walk railing, open at their stair's landing
    B(F[3][0] - C.deck, F[3][0] - C.deck + 0.16, C.deckTop, C.deckTop + 1.1, chainSections(F, -C.deck)[2].q0[1], STAIR_AR.top, { rail: true, tag: 'walk-rail' }),
    B(F[3][0] - C.deck, F[3][0] - C.deck + 0.16, C.deckTop, C.deckTop + 1.1, STAIR_AR.landing, F[3][1], { rail: true, tag: 'walk-rail' }),
    B(STAIR.x[0], 20.0, C.deckTop, C.deckTop + 1.1, STAIR.landing, STAIR.landing + 0.16, { rail: true, tag: 'walk-rail', notIn: 'tower' }),
    // the landing pier (squid route up: its square-side face) + the stair up from the pier forecourt
    B(STAIR.x[0], STAIR.x[1], -1.2, C.deckTop, STAIR.landing, STAIR.top, { tag: 'colonnade-landing', color: M.colFloor, pattern: SURF.terrazzo, noPaint: [[0, 0, -1]], notIn: 'tower' }),
    R([18.75, 0, STAIR.foot], [18.75, C.deckTop, STAIR.top], 2.5, { tag: 'colonnade-stair', color: M.granite, pattern: PATTERN.stonestep, notIn: 'tower' }),
    // the Assembly Rooms' stair: up from the Winter Gardens toward mid onto a landing at the walk's front (a rail on its
    // far end; the square-side face open, a squid route up like the north landing's)
    R([18.75, SQ, STAIR_AR.foot], [18.75, C.deckTop, STAIR_AR.top], 2.5, { tag: 'assembly-stair', color: M.granite, pattern: PATTERN.stonestep }),
    B(STAIR_AR.x[0], STAIR_AR.x[1], -1.2, C.deckTop, STAIR_AR.top, STAIR_AR.landing, { tag: 'assembly-landing', color: M.colFloor, pattern: SURF.terrazzo }),
    B(STAIR_AR.x[0], STAIR_AR.x[1], C.deckTop, C.deckTop + 1.1, STAIR_AR.landing - 0.16, STAIR_AR.landing, { rail: true, tag: 'walk-rail' }),
    // Tower Command: the stair turned round — from the square by the anchor up toward mid, onto a landing level with the
    // terrace walk's open end (open like it: a drop to the square, over the track's corner by the pier gate)
    B(STAIR_REV.x[0], STAIR_REV.x[1], -1.2, C.deckTop, STAIR_REV.top, STAIR_REV.landing, { tag: 'colonnade-landing', color: M.colFloor, pattern: SURF.terrazzo, onlyIn: 'tower' }),
    R([18.75, 0, STAIR_REV.foot], [18.75, C.deckTop, STAIR_REV.top], 2.5, { tag: 'colonnade-stair', color: M.granite, pattern: PATTERN.stonestep, onlyIn: 'tower' }),

    // ================= promenade furniture blocks: cross-plan shelter screens (on the crescent), the ice-cream kiosk
    B(-23, -20.65, 0, 1.15, tq(-19.15), tq(-18.85), stucco(M.mint, { tag: 'shelter-screen' })),
    B(-20.35, -18, 0, 1.15, tq(-19.15), tq(-18.85), stucco(M.mint, { tag: 'shelter-screen' })),
    B(-20.65, -20.35, 0, 1.15, tq(-21.5), tq(-16.5), stucco(M.mint, { tag: 'shelter-screen' })),
    B(-24.9, -22.3, 0, 2.5, -10.3, -7.7, stucco(M.mint, { tag: 'icecream-kiosk', mural: [{ n: [0, 0, 1], id: 8 }, { n: [-1, 0, 0], id: 8 }] })),

    // ================= the square: the bandstand (1 m stage above the paving), floral clock, border, tea rooms, anchor
    ...OCT(0, tq(-21), 3.8, -0.6, 0.8, stucco(M.stone, { tag: 'bandstand', notIn: 'tower' })),
    R([0, SQ, tq(-27.2)], [0, 0.8, tq(-24.51)], 2.4, { tag: 'bandstand-steps', color: M.granite, pattern: PATTERN.stonestep, notIn: 'tower' }),
    R([0, SQ, tq(-14.8)], [0, 0.8, tq(-17.49)], 2.4, { tag: 'bandstand-steps', color: M.granite, pattern: PATTERN.stonestep, notIn: 'tower' }),
    // Tower Command: the bandstand 0.8 m further out, steps (wider, a touch steeper) on its mid side only — the tower
    // climbs them, rides under the raised roof and drops off the open back
    ...OCT(0, TW.band.z, 3.8, -0.6, 0.8, stucco(M.stone, { tag: 'bandstand', onlyIn: 'tower' })),
    R([0, SQ, TW.band.stepFoot], [0, 0.8, TW.band.z + 3.8 * Math.cos(Math.PI / 8)], 2.8, { tag: 'bandstand-steps', color: M.granite, pattern: PATTERN.stonestep, onlyIn: 'tower' }),
    B(-10.7, -6.3, -0.6, 0.5, tq(-27.2), tq(-22.8), { tag: 'floral-clock', color: M.planter, pattern: PATTERN.planter }),
    B(-15, -9, -0.6, 0.7, -14.5, -9.5, { tag: 'border', color: M.planter, pattern: PATTERN.planter, notIn: 'tower' }),
    B(-14.1, -9, -0.6, 0.7, -13.8, -9.8, { tag: 'border', color: M.planter, pattern: PATTERN.planter, onlyIn: 'tower' }),   // (the track rounds it)
    B(8.5, 12.5, -0.6, 2.8, tq(-30), tq(-26), stucco(M.butter, { tag: 'tearooms', roof: true })),
    B(11.4, 13.6, -0.6, 0.8, -18.6, -16.4, { tag: 'anchor-plinth', color: M.granite, pattern: SURF.stucco }),

    // ================= the Winter Gardens (GARDEN): the Palm House, its terrace + three flights, the beds
    B(GARDEN.palm[0], GARDEN.palm[1], -0.6, GARDEN.plinth, GARDEN.palm[2], GARDEN.palm[3], stucco(M.palm, { tag: 'palm-house-plinth' })),
    B(GARDEN.palm[0] + 0.1, GARDEN.palm[1] - 0.1, GARDEN.plinth, GARDEN.glass, GARDEN.palm[2] + 0.1, GARDEN.palm[3] - 0.1, { tag: 'palm-house-glass', hidden: true, paint: false, roof: true }),
    B(GARDEN.terrace[0], GARDEN.terrace[1], -0.6, GARDEN.top, GARDEN.terrace[2], GARDEN.terrace[3], stucco(M.terrace, { tag: 'garden-terrace' })),
    ...GARDEN.flights.map(([x, zt, zf, w]) => R([x, SQ, zf], [x, GARDEN.top, zt], w, { tag: 'garden-steps', color: M.granite, pattern: PATTERN.stonestep })),
    // the terrace's balustrade between the two flights (collision only; the stone balustrade you see is the Palm House
    // prop's); its ends stay open (a 1.4 m hop, and Tower Command's track climbs them)
    B(-GARDEN.flights[1][0] + GARDEN.flights[1][3] / 2 + 0.1, GARDEN.flights[1][0] - GARDEN.flights[1][3] / 2 - 0.1, GARDEN.top, GARDEN.top + 1.0, GARDEN.terrace[3] - 0.26, GARDEN.terrace[3] - 0.1, { rail: true, tag: 'garden-rail' }),
    ...GARDEN.beds.map((b) => B(b[0], b[1], -0.6, GARDEN.bedTop, b[2], b[3], { tag: 'garden-bed', color: M.planter, pattern: PATTERN.planter })),

    // ================= the terrace flights (Alpha's: south + west; the ring's other two are Bravo's)
    R([0, SQ, -12.4], [0, T.top, -8.1], 4, { tag: 'terrace-steps', color: M.granite, pattern: PATTERN.stonestep, notIn: 'tower' }),
    R([-12.4, SQ, 0], [-8.1, T.top, 0], 4, { tag: 'terrace-steps', color: M.granite, pattern: PATTERN.stonestep, notIn: 'tower' }),
    // Tower Command: shorter flights (the track runs past the foot of the south one and down the west one, which starts
    // from a landing strip across the ring at the dais's height)
    R([0, SQ, -TW.flight], [0, T.top, -8.1], 4, { tag: 'terrace-steps', color: M.granite, pattern: PATTERN.stonestep, onlyIn: 'tower' }),
    R([-TW.flightW, SQ, 0], [-T.rOut, T.daisTop, 0], 4, { tag: 'terrace-steps', color: M.granite, pattern: PATTERN.stonestep, onlyIn: 'tower' }),
    B(-T.rOut, -T.dais, 0.4, T.daisTop, -2, 2, stucco(M.terrace, { tag: 'terrace-landing', onlyIn: 'tower' })),
  ],
  decor: {
    lamps: [],
    palms: [],
    flags: [[-8.9, 2.4, tq(-44.8)], [8.9, 2.4, tq(-44.8)]],
  },
};

export const LAYOUT = TIDEWATER;
