// Turf War Craters — the Long Stages stretch (the user, 2026-09-30: every stage's halves 25 % longer, the spawn → mid
// swim 4 s → 6 s). Pure data, imported by layout.js / slice.js / props.js (never three.js).
//
// Each half grows by ST.d metres along the spawn axis (z). The cut is the seam between the Round Down's front (the
// crater, the Remembrance Walk, the fire trench, the zig-zag, the pillbox, the memorial, the flooded crater — mid's)
// and the pavilion's promontory with its neck and coves (the base's): on Alpha's half everything whose centre lies
// beyond the cut (z < ST.cut) moves out by ST.d, and the gap between is the slice — the reserve line (slice.js). The
// park's round outline becomes a stadium: the cliffs run on straight-ish down both sides of the slice to the moved
// cap round the neck (layout.js COAST). Bravo's half is the 180° twin, as always.
//   cut −28.5: just behind the pillbox's stair and the neck's sandbag wall, in front of the forecourt path (−29.7)
export const ST = { cut: -28.5, d: 22 };
// a z (or a point [x, z]) on Alpha's half: beyond the cut it moves out
export const sz = (z) => (z < ST.cut ? +(z - ST.d).toFixed(4) : z);
export const sxz = (p) => [p[0], sz(p[1])];
// a layout piece (box / obox / ramp) whose centre lies beyond the cut moves out as a unit
export function shiftDef(d) {
  if (d.kind === 'box') {
    if ((d.min[2] + d.max[2]) / 2 >= ST.cut) return d;
    return { ...d, min: [d.min[0], d.min[1], d.min[2] - ST.d], max: [d.max[0], d.max[1], d.max[2] - ST.d] };
  }
  if (d.kind === 'obox') {
    if (d.center[2] >= ST.cut) return d;
    return { ...d, center: [d.center[0], d.center[1], d.center[2] - ST.d] };
  }
  if ((d.low[2] + d.high[2]) / 2 >= ST.cut) return d;
  return { ...d, low: [d.low[0], d.low[1], d.low[2] - ST.d], high: [d.high[0], d.high[1], d.high[2] - ST.d] };
}
// a prop placement (props.js): by its position
export const shiftPlacement = (p) => (p.pos && p.pos[2] < ST.cut ? { ...p, pos: [p.pos[0], p.pos[1], p.pos[2] - ST.d] } : p);
