// Nav climb audit: wall-climb edges whose way over the top is barred by a railing (a bot climbs, hits the rail and hangs
// on the wall). Any stage:  MAP=<id> PAGE=tools/botlab/tests/climb-audit.js tools/botlab/run.sh tools/botlab/page.cjs
(async () => {
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info });
  const L = __G.level, nav = __G.nav, THREE = await import('three');
  // climb edges whose way over the top is barred by a railing (a rail collider between the wall's top and the node above)
  const bad = [];
  let climbs = 0;
  for (const n of nav.nodes) for (const e of n.nb) {
    if (e.type !== 'climb') continue;
    climbs++;
    const m = nav.nodes[e.to];
    const wx = e.wallP[0], wz = e.wallP[2];
    for (const h of [0.3, 0.7]) {
      const y = e.topY + h;
      // sample along the line from the wall point to the node above
      let railed = null;
      for (let t = 0; t <= 1.0; t += 0.05) {
        const x = wx + (m.x - wx) * t, z = wz + (m.z - wz) * t;
        const ids = L.queryBlocks(x - 0.01, z - 0.01, x + 0.01, z + 0.01, []);
        for (const id of ids) { const b = L.blocks[id]; if (b.rail && L.pointInBlock(b, new THREE.Vector3(x, y, z), 0.02)) railed = [+x.toFixed(2), +z.toFixed(2)]; }
      }
      if (railed) { bad.push({ from: [n.x, +n.y.toFixed(2), n.z], to: [m.x, +m.y.toFixed(2), m.z], rail: railed }); break; }
    }
  }
  R('climb edges barred by a railing', bad.length === 0, { climbs, bad: bad.slice(0, 40), n: bad.length });
  return out;
})()
