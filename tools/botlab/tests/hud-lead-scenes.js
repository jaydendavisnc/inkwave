// Scenes for tools/botlab/hud-shots.cjs: the who's-ahead HUD (src/ui/hud-lead.js) in each of its states, on a real stage.
//   MAP=halyard MODE=turf|zones|tower SCENES=tools/botlab/tests/hud-lead-scenes.js OUT=/dir tools/botlab/run.sh tools/botlab/hud-shots.cjs
// Each mode: your team taking / holding the lead, the other team's, and the same states seen from Bravo's side (the
// local player swapped onto team 1, as an online guest on Bravo sees it); turf adds the colour-blind palette.
(async () => {
  const g = window.__inkwave, m = g.match, dbg = g.debug, G = __G;
  const { COLORBLIND_PALETTE } = await import('./src/config.js');
  dbg.freeze();
  const step = (s) => { const n = Math.max(1, Math.round(s * 60)); for (let i = 0; i < n; i++) dbg.step(1000 / 60); };
  for (const a of m.actors) if (a.bot) a.bot.update = () => {};
  for (const a of m.actors) { a.intent.move.set(0, 0, 0); a.intent.fire = false; a.intent.squid = false; }
  const me = m.local.team, them = 1 - me;
  const info = () => { const s = g.hud.lead.state(); return { leader: s.leader, sides: s.sides.map((q) => q.size + (q.banner ? '+' + q.banner : '')).join(' / '), turf: s.turf }; };
  const bravoView = () => {   // the local player onto Bravo: the HUD redraws from that side (online guests on Bravo)
    const A0 = m.local, B0 = m.actors.find((a) => a.team === 1);
    A0.isLocal = false; B0.isLocal = true; m.local = B0; G.local = B0;
    g.rig.follow?.(B0, true);
    g.hud._L = {};   // (the HUD's dirty-check cache assumes one viewer per match: redraw everything from the new side)
    step(0.2);
  };
  // the take-the-lead moment (flash, burst, the banner popping in), replayed for the picture on whoever leads now
  const took = () => { const L = g.hud.lead, t = L.leader.v; if (t < 0) return; L._took(t); const sd = L.sides[t ^ L.me]; if (sd.kind) g.hud._restart(sd.el, 'is-on'); };
  const S = [];
  const add = (name, set, wait) => S.push({ name, set: async () => { await set(); return info(); }, wait, moment: wait ? took : null });

  if (m.mode === 'turf') {
    const P = G.paint, N = P.turfTotal;
    const cov = (a, b) => { P.counts[me] = Math.round(a * N); P.counts[them] = Math.round(b * N); };
    add('close', () => { cov(0.42, 0.37); step(3); });
    add('take-you', () => { cov(0.46, 0.30); step(1.6); }, 300);
    add('lead-you', () => { step(3.5); });
    add('danger-them', () => { cov(0.55, 0.21); step(2.5); });
    add('take-them', () => { cov(0.2, 0.56); step(1.2); }, 300);
    add('danger-you', () => { step(5); });
    add('danger-you-cb', () => { g._setPalette(COLORBLIND_PALETTE); step(0.2); });
    add('bravo-view', () => { bravoView(); step(0.5); });
  }

  if (m.mode === 'zones') {
    const Z = m.zones;
    Z.nextSwap = 999;
    const zs = () => Z.active.zones;
    const paint = (team, frac, rest = -1) => { for (const z of zs()) z.cells.forEach((c, i) => { G.paint.grid[c] = i < z.cells.length * frac ? team + 1 : rest + 1; }); };
    for (const z of zs()) if (z.owner >= 0) Z._zoneOwner(z, -1);
    if (Z.owner >= 0) Z._setOwner(-1);
    Z.penalty = [0, 0]; paint(-1, 1); Z.count = [100, 100];
    step(1.5);
    add('take-you', () => { Z.count[me] = 88; step(0.8); }, 300);
    add('lead-you', () => { step(0.4); });
    add('hold-you', () => { paint(me, 1); step(2); });
    add('contest', () => { paint(them, 0.33, me); step(1.2); });
    add('take-them', () => { paint(them, 1); step(1.5); Z.count[them] = Math.ceil(Z.count[me]) - 8; step(0.8); }, 300);
    add('lead-them', () => { step(1); });
    add('bravo-view', () => { bravoView(); step(0.5); });
  }

  if (m.mode === 'tower') {
    const T = m.tower, A = m.actors.filter((a) => a.team === me), B = m.actors.filter((a) => a.team === them);
    const park = (a, i = 0) => { const p = G.level.spawnPads[a.team]; a.pos.set(p.x + ((i % 4) - 1.5) * 1.4, p.y + 0.3, p.z); a.vel.set(0, 0, 0); a.grounded = false; };   // (at their spawn: safe)
    const onTop = (a, k = 0) => { const off = [[0.65, 0.65], [-0.65, 0.65], [0.65, -0.65], [-0.65, -0.65]][k % 4]; a.pos.set(T.pos.x + off[0], T.top + 0.05, T.pos.z + off[1]); a.vel.set(0, 0, 0); a.grounded = false; };
    const sgn = me === 0 ? 1 : -1;
    const reset = () => { T.s = 0; T._place(1); T.count = [100, 100]; T.points = [0, 0]; T.best = [0, 0]; T._setOwner(-1); };
    [...A, ...B].forEach((a, i) => { if (!a.alive) a.respawn?.(); park(a, i); });
    reset(); step(0.5);
    add('take-you', () => { onTop(A[0]); onTop(A[1], 1); step(3.5); }, 300);
    add('push-you', () => { step(1); });
    add('them-on-your-half', () => { A.forEach((a, i) => park(a, i)); T.s = -sgn * 1.2; T._place(1); onTop(B[0]); step(1.2); });
    add('take-them', () => { B.forEach((a, i) => park(a, i)); T.count[them] = T.count[me] - 6; T.s = -sgn * 7; T._place(1); onTop(B[0]); onTop(B[1], 1); step(1.2); }, 300);
    add('lead-them', () => { step(1); });
    add('bravo-view', () => { bravoView(); step(0.5); });
  }
  window.__hudScenes = S;
  return S.map((s) => ({ name: s.name }));
})()
