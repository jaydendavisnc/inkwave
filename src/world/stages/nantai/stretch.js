// Mount Nantai — the Long Stages stretch (the user, 2026-09-30: every stage's halves 25 % longer, the spawn → mid swim
// 4 s → 6 s). Pure data, imported by layout.js / ground.js / props.js (never three.js).
//
// Each half grows by ST.d metres along the spawn axis (z). The cut is the seam between what belongs to mid (the lawn,
// the brook, the bank, the rehearsal hollow and Pearl's rock, the terraces' fronts with the side zone) and what belongs
// to the base (the control building and its grand stair, the forecourt, the east yard, the ridge root, the shore stair,
// the crag behind): on Alpha's half everything whose centre lies beyond the cut (z < ST.cut) moves out by ST.d, and the
// gap between is the slice — the solar tower, the radio dish on its knoll, the rock garden (slice.js). Bravo's half is
// the 180° twin, as always (the layout's half list is mirrored after the shift).
//   cut −31.5: the rehearsal hollow's back wall (its back stair tops out onto the shoulder here); the first terrace and
//   the west terrace are split on it (their fronts stay, their backs go with the building); the grand stair (its centre
//   at −33.35) goes with the building it climbs.
export const ST = { cut: -31.5, d: 24 };
// a z (or a point [x, z]) on Alpha's half: beyond the cut it moves out
export const sz = (z) => (z < ST.cut ? +(z - ST.d).toFixed(4) : z);
export const sxz = (p) => [p[0], sz(p[1])];
// a layout piece (box / obox / ramp) whose centre lies beyond the cut moves out as a unit (pieces that cross the cut are
// split or extended by hand in layout.js before this runs)
export function shiftDef(d) {
  if (d.kind === 'box') {
    if ((d.min[2] + d.max[2]) / 2 >= ST.cut) return d;
    return { ...d, min: [d.min[0], d.min[1], d.min[2] - ST.d], max: [d.max[0], d.max[1], d.max[2] - ST.d] };
  }
  if (d.kind === 'obox') {
    if (d.center[2] >= ST.cut) return d;
    return { ...d, center: [d.center[0], d.center[1], d.center[2] - ST.d], ...(d.oct ? { oct: [d.oct[0], d.oct[1] - ST.d, d.oct[2]] } : {}) };
  }
  if ((d.low[2] + d.high[2]) / 2 >= ST.cut) return d;
  return { ...d, low: [d.low[0], d.low[1], d.low[2] - ST.d], high: [d.high[0], d.high[1], d.high[2] - ST.d] };
}
// a prop placement (props.js): by its position
export const shiftPlacement = (p) => (p.pos && p.pos[2] < ST.cut ? { ...p, pos: [p.pos[0], p.pos[1], p.pos[2] - ST.d] } : p);
