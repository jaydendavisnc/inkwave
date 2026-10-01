// Cover map (page script for tools/botlab/page.cjs, any stage): for every 1 m floor cell, the distance to the nearest (on a 0.5 m lattice)
// cover at least 0.9 m tall over that floor (solid level blocks and prop colliders incl. trees; railings — see-through —
// and the pods' hedges — dynamic — don't count). Floor: a cell whose highest surface is the stage's own walkable
// ground (a layout block that isn't a roof), above the water. Reports the share within 5 m of cover and the largest open
// circle (the biggest distance to cover), outside window.__openSkip (optional [[x0, x1, z0, z1], …]: the plaza / zone).
//   MAP=<id> MODE=turf PAGE=tools/botlab/tests/cover-map.js tools/botlab/run.sh tools/botlab/page.cjs
// (the grid comes back base64 in the result: one byte a cell, 255 = not floor, else the distance × 10; cover-map.py draws it)
(async () => {
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info });
  const L = __G.level, B = L.bounds, THREE = await import('three');
  const skip = window.__openSkip || (L.layout?.id === 'treehills' ? [[-7.4, 7.4, -6.8, 6.8]] : []);   // (the plaza top + its zone)
  const x0 = Math.floor(B.minX), z0 = Math.floor(B.minZ), nx = Math.ceil(B.maxX) - x0, nz = Math.ceil(B.maxZ) - z0;
  const ids = [], P = new THREE.Vector3();
  // kerbs and copings along the edges are the ground's trim (a lip of 0.14–0.3 m), not a level of their own
  const EDGE = new Set(['kerb', 'coping', 'retaining', 'plaza-rim']);
  // the ground: the highest top of the stage's own (drawn, non-roof) blocks; a cell is floor when nothing solid stands
  // in the 0.3 m just above it (a prop, a roof's body) — overhead things (the canopy) don't count
  const floorAt = (x, z) => {
    let best = -Infinity, bb = null;
    for (const id of L.queryBlocks(x - 0.01, z - 0.01, x + 0.01, z + 0.01, ids)) {
      const b = L.blocks[id];
      if (!b.solid || b.dynamic || b.rail || b.hidden || b.roof || EDGE.has(b.tag)) continue;
      const n = b.axes[1]; if (n.y < 0.5) continue;
      const tx = b.center.x + n.x * b.half.y, ty = b.center.y + n.y * b.half.y, tz = b.center.z + n.z * b.half.y;
      const y = ty - (n.x * (x - tx) + n.z * (z - tz)) / n.y;
      if (y > 30 || y <= best) continue;
      P.set(x, y - 0.01, z);
      if (L.pointInBlock(b, P, 0.001)) { best = y; bb = b; }
    }
    if (!bb || best < -1) return null;   // water
    if (solidAt(x, best + 0.3, z)) return null;   // something stands on it here (a prop, a building): not floor
    return best;
  };
  const solidAt = (x, y, z) => {
    P.set(x, y, z);
    // (within 0.15 m of the sample, so thin walls between lattice points are found; posts under 0.6 m across — lamps,
    // bollards, pylons' bare shafts — aren't cover)
    for (const id of L.queryBlocks(x - 0.16, z - 0.16, x + 0.16, z + 0.16, ids)) { const b = L.blocks[id]; if (b.solid && !b.dynamic && !b.rail && Math.max(b.half.x, b.half.z) >= 0.3 && L.pointInBlock(b, P, 0.15)) return true; }
    return false;
  };
  const fy = new Float32Array(nx * nz).fill(NaN);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const y = floorAt(x0 + i + 0.5, z0 + j + 0.5); if (y != null) fy[j * nx + i] = y; }
  // cover is looked for on a 0.5 m lattice (thin walls and posts are found), out to RMAX
  const RMAX = 16, offs = [];
  for (let dj = -2 * RMAX; dj <= 2 * RMAX; dj++) for (let di = -2 * RMAX; di <= 2 * RMAX; di++) { const d = Math.hypot(di, dj) / 2; if (d <= RMAX) offs.push([di / 2, dj / 2, d]); }
  offs.sort((a, b) => a[2] - b[2]);
  const bytes = new Uint8Array(nx * nz).fill(255);
  let n = 0, within5 = 0, maxOpen = 0, maxAt = null;
  const inSkip = (x, z) => skip.some((r) => x > r[0] && x < r[1] && z > r[2] && z < r[3]);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const y = fy[j * nx + i]; if (Number.isNaN(y)) continue;
    const cx = x0 + i + 0.5, cz = z0 + j + 0.5;
    let d = RMAX + 1;
    for (const [di, dj, dd] of offs) {
      const x = cx + di, z = cz + dj;
      if (solidAt(x, y + 0.9, z)) { d = dd; break; }
    }
    n++; if (d <= 5) within5++;
    if (!inSkip(cx, cz) && d > maxOpen) { maxOpen = d; maxAt = [cx, cz]; }
    bytes[j * nx + i] = Math.min(254, Math.round(d * 10));
  }
  let bin = ''; for (let k = 0; k < bytes.length; k++) bin += String.fromCharCode(bytes[k]);
  R('cover map', true, { map: L.layout?.id, floorCells: n, within5m_pct: +(100 * within5 / n).toFixed(1), largestOpenRadius_m: +maxOpen.toFixed(1), at: maxAt, skip, grid: { x0, z0, nx, nz, b64: btoa(bin) } });
  return out;
})()
