// Spawn-to-mid distance: the nav path from each team's spawn pads to mid (the point halfway between the two spawns'
// centres), as metres and as seconds of swimming in your own ink (config swimSpeed). Any stage:
//   MAP=<id> PAGE=tools/botlab/tests/spawn-mid.js tools/botlab/run.sh tools/botlab/page.cjs
(async () => {
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info });
  const L = __G.level, nav = __G.nav;
  const { PLAYER } = await import('./src/config.js').catch(() => ({}));
  const swim = (PLAYER && PLAYER.swimSpeed) || 11.8;
  const pads = L.spawnPads, half = pads.length / 2;
  const cen = (list) => list.reduce((a, p) => ({ x: a.x + p.x / list.length, y: a.y + p.y / list.length, z: a.z + p.z / list.length }), { x: 0, y: 0, z: 0 });
  const s0 = cen(pads.slice(0, half)), s1 = cen(pads.slice(half));
  const mid = { x: (s0.x + s1.x) / 2, z: (s0.z + s1.z) / 2 };
  // the lowest walkable nav node near mid (not inside a tower or on a roof)
  let goal = -1;
  for (const r of [2, 3, 4, 6, 8]) {
    let by = Infinity;
    nav.nodes.forEach((n, i) => { if (!nav.valid[i]) return; if (Math.hypot(n.x - mid.x, n.z - mid.z) > r) return; if (n.y < by) { by = n.y; goal = i; } });
    if (goal >= 0) break;
  }
  const res = {};
  for (const [team, s] of [[0, s0], [1, s1]]) {
    const a = nav.nearest({ x: s.x, y: s.y + 0.5, z: s.z }, 0.8, true);
    const p = nav.path(a, goal, team, 200000);
    if (!p) { res['t' + team] = null; continue; }
    let len = 0;
    for (let i = 1; i < p.length; i++) { const u = nav.nodes[p[i - 1]], v = nav.nodes[p[i]]; len += Math.hypot(v.x - u.x, v.y - u.y, v.z - u.z); }
    res['t' + team] = { m: +len.toFixed(1), s: +(len / swim).toFixed(2), straight: +Math.hypot(s.x - mid.x, s.z - mid.z).toFixed(1) };
  }
  res.spawns = [[+s0.x.toFixed(1), +s0.z.toFixed(1)], [+s1.x.toFixed(1), +s1.z.toFixed(1)]];
  res.mid = [+mid.x.toFixed(1), +mid.z.toFixed(1)];
  R('spawn to mid', !!(res.t0 && res.t1), res);
  return out;
})()
