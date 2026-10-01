// Calamari County — the Long Stages stretch (2026-09-30: every stage 50 % longer, "a slice of land in the middle").
// Shared by layout.js, props.js and backdrop.js (plain data: imports nothing).
//
// Each half keeps its mid side (the railway cut, the station, the square, the back street, T1, the harbour's north
// quay and slipway) and its base side (the Fishermen's Co-op with the spawn deck, T2 with the Cuttlefish cottage, the
// loading dock, the net store, the co-op quay, the hill houses); the base side moves out by `d` along the spawn axis
// (−z on Alpha's half, the half list), and the gap is new land: the village high street (layout.js SLICE).
//   cut      the seam between the two sides (Alpha's frame): the back street's south edge (z −30.5) — T2's front, the
//            loading dock's front, the co-op yard — and, on the hillside column (x < −25.5), T1's end (z −28.5)
//   d        how far the base side moves (m): half the straight spawn → mid distance (41.3 m), so the spawn sits 1.5 ×
//            as far from mid (61.8 m)
export const STRETCH = { d: 20.5, cut: -30.5, cutHill: -28.5, hillX: -25.5 };

// move a layout piece (box / obox / ramp) or a placement ({ pos }) out by dz along z
export function moveZ(item, dz) {
  if (item.kind === 'box') return { ...item, min: [item.min[0], item.min[1], item.min[2] + dz], max: [item.max[0], item.max[1], item.max[2] + dz] };
  if (item.kind === 'obox') return { ...item, center: [item.center[0], item.center[1], item.center[2] + dz] };
  if (item.kind === 'ramp') return { ...item, low: [item.low[0], item.low[1], item.low[2] + dz], high: [item.high[0], item.high[1], item.high[2] + dz] };
  if (item.pos) return { ...item, pos: [item.pos[0], item.pos[1], item.pos[2] + dz] };
  return item;
}
// the base side, drawn with the original numbers, moved out as a unit (Alpha's half: −z)
export const moveOut = (list) => list.map((it) => moveZ(it, -STRETCH.d));
