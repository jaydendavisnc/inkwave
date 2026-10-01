// Size budgets that grow with a stage's area: the baked lightmap atlas (rows used of 2048 at 8 ppm — bake.cjs),
// the paint atlas density (texels per metre at this quality), the nav node count and how far A* has to search
// from each spawn to the other side (against nav.path's default cap: 3 × the nodes, at least 6000). Any stage:
//   MAP=<id> PAGE=tools/botlab/tests/size-budget.js tools/botlab/run.sh tools/botlab/page.cjs
(async () => {
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info });
  const L = __G.level, nav = __G.nav;
  const fits = L.layoutLightmap(8, 2048);
  R('lightmap atlas fits 2048 at 8 ppm', fits, { used: L.lightUsed });
  R('paint atlas density', true, { ppm: +(__G.paint.ppm || 0).toFixed(1), atlas: __G.paint.size });
  // A* reach: from each spawn to the node nearest the far spawn's front (the barrier side), at the bots' 6000 cap
  const pads = L.spawnPads, half = pads.length / 2;
  const reach = [];
  for (const t of [0, 1]) {
    const own = pads[t * half], far = pads[(1 - t) * half];
    const a = nav.nearest(own, 0.8, true);
    // walk from the far pad toward mid until a node outside every spawn zone
    let g = -1;
    for (let k = 0.15; k < 0.6 && g < 0; k += 0.03) {
      const p = { x: far.x + (own.x - far.x) * k, y: far.y + 5, z: far.z + (own.z - far.z) * k };
      let bd = Infinity;
      nav.nodes.forEach((n, i) => { if (!nav.valid[i] || n.zone >= 0) return; const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < 2.5 && d < bd) { bd = d; g = i; } });
    }
    let need = null;
    for (const cap of [1500, 3000, 6000, 9000, 12000, 18000, 30000, 60000]) { if (nav.path(a, g, t, cap)) { need = cap; break; } }
    reach.push(need);
  }
  const cap = Math.max(6000, nav.nodes.length * 3);   // (nav.path's default search cap, the one bots plan with)
  R('A* reach spawn to far side (within the bots\' search cap)', reach.every((n) => n && n <= cap), { nodes: nav.nodes.length, cap, capNeeded: reach });
  return out;
})()
