// Stage audit (any stage, any mode): the baked lightmap applies to this build (not stale / missing), spawn → mid
// swim time for both teams (nav path, PLAYER.swimSpeed), no wall-climb barred by a railing, and in Tower Command the
// track's length and seconds to the goal. A quick regression line per stage × mode:
//   MAP=<id> MODE=<turf|zones|tower|boss> PAGE=tools/botlab/tests/stage-audit.js tools/botlab/run.sh tools/botlab/page.cjs
(async () => {
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info });
  const L = __G.level, nav = __G.nav, THREE = await import('three');
  const { PLAYER } = await import('./src/config.js');
  const m = window.__inkwave.match;
  R('lightmap applied (baked for this build, not stale)', L.lightSize > 0, { id: L.layout?.id, mode: m.mode, rows: L.lightUsed });
  if (nav && m.mode !== 'boss') {
    const pads = L.spawnPads, half = pads.length / 2;
    const cen = (list) => list.reduce((a, p) => ({ x: a.x + p.x / list.length, y: a.y + p.y / list.length, z: a.z + p.z / list.length }), { x: 0, y: 0, z: 0 });
    const s0 = cen(pads.slice(0, half)), s1 = cen(pads.slice(half)), mid = { x: (s0.x + s1.x) / 2, z: (s0.z + s1.z) / 2 };
    let goal = -1;
    for (const r of [2, 3, 4, 6, 8]) { let by = Infinity; nav.nodes.forEach((n, i) => { if (!nav.valid[i] || Math.hypot(n.x - mid.x, n.z - mid.z) > r) return; if (n.y < by) { by = n.y; goal = i; } }); if (goal >= 0) break; }
    const secs = [];
    for (const [t, s] of [[0, s0], [1, s1]]) {
      const p = nav.path(nav.nearest({ x: s.x, y: s.y + 0.5, z: s.z }, 0.8, true), goal, t);
      if (!p) { secs.push(null); continue; }
      let len = 0; for (let i = 1; i < p.length; i++) { const u = nav.nodes[p[i - 1]], v = nav.nodes[p[i]]; len += Math.hypot(v.x - u.x, v.y - u.y, v.z - u.z); }
      secs.push(+(len / PLAYER.swimSpeed).toFixed(2));
    }
    R('spawn → mid (s, bots\' default search cap)', secs.every((v) => v), { secs, avg: secs.every((v) => v) ? +((secs[0] + secs[1]) / 2).toFixed(2) : null, straight: +Math.hypot(s0.x - mid.x, s0.z - mid.z).toFixed(1) });
    let bad = 0;
    for (const n of nav.nodes) for (const e of n.nb) {
      if (e.type !== 'climb') continue;
      const q = nav.nodes[e.to];
      for (const h of [0.3, 0.7]) { let hit = false; for (let t = 0; t <= 1; t += 0.05) { const x = e.wallP[0] + (q.x - e.wallP[0]) * t, z = e.wallP[2] + (q.z - e.wallP[2]) * t; for (const id of L.queryBlocks(x - 0.01, z - 0.01, x + 0.01, z + 0.01, [])) { const b = L.blocks[id]; if (b.rail && L.pointInBlock(b, new THREE.Vector3(x, e.topY + h, z), 0.02)) hit = true; } } if (hit) { bad++; break; } }
    }
    R('no climb barred by a railing', bad === 0, { bad });
  }
  if (m.mode === 'tower' && m.tower) {
    const T = m.tower, toGoal = T.path.len.map((Ln, t) => +(Ln / T.speed[t] + T.cps.filter((c) => c.team === t).reduce((a, c) => a + c.dur, 0)).toFixed(1));
    const cps = T.cps.filter((c) => c.team === 0);
    R('tower: 100 s to the goal', !T.placeholder ? toGoal.every((s) => Math.abs(s - 100) < 0.5) : true, { len: +T.path.len[0].toFixed(1), cps: cps.map((c) => Math.round(100 * c.d / T.path.len[0]) + '%'), toGoal, placeholder: T.placeholder });
  }
  return out;
})()
