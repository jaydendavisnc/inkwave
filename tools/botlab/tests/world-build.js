// Stage builds never interleave (main.js _buildWorld): two started back to back without waiting — the second must win
// everywhere (level, paint, stage decals), whatever order their lightmap fetches finish in.
//   MAP=halyard PAGE=tools/botlab/tests/world-build.js tools/botlab/run.sh tools/botlab/page.cjs
(async () => {
  const g = window.__inkwave, out = [];
  const R = (name, ok, info) => out.push({ name, ok: !!ok, info });
  const { MAPS } = await import('./src/config.js');
  const pick = (id) => MAPS.find((m) => m.id === id);
  const pairs = [['tidewater', 'craters'], ['craters', 'nantai'], ['spirhalite', 'tidewater'], ['calamari', 'crossmarket']];
  for (const [a, b] of pairs) {
    const p1 = g._buildWorld(pick(a)), p2 = g._buildWorld(pick(b));
    await Promise.all([p1, p2]);
    const lay = __G.level.layout && __G.level.layout.id, dec = g.murals.userData.stage;
    R(`${a} then ${b} back to back: ${b} is built everywhere`, g.layoutId === b && lay === b && dec === b, { layoutId: g.layoutId, level: lay, decals: dec });
  }
  // and the match still starts on the last one asked for
  await g._buildWorld(pick('halyard'));
  R('back on halyard', g.layoutId === 'halyard' && g.murals.userData.stage === 'halyard', { layoutId: g.layoutId, decals: g.murals.userData.stage });
  return out;
})()
