// Sprout pods page test (src/game/pods.js) on the test arena with pods (tools/botlab/page.cjs MAP=podbox):
//   MAP=podbox MODE=turf  PAGE=tools/botlab/tests/pods.js tools/botlab/run.sh tools/botlab/page.cjs   (everything but the modes)
//   MAP=podbox MODE=tower PAGE=…   (plants on the track sit it out; a pod beside the track waits while the tower's there)
//   MAP=podbox MODE=boss  PAGE=…   (walls and canopies stop the boss's charge; walking into one tramples it)
// Turf covers: the layout (both kinds in the engine's planters: troughs, tubs; the mirror twins; old pod data is a wall
// of its size); each team's meter (fills from ink in proportion, drains, the bulb swells and blushes toward the team
// ahead); the meter calibration per weapon kind (reported); growth (the first full meter wins, the owner, the host's
// record), the timing (grow → stand → wilt → recharge → dormant); a wall closes its gap (no route through it; nobody walks
// or hops past); plants block shots; the owner's tint (following a palette change); only the owner's ink sticks; the
// owners swim up both kinds, the enemy up neither; the canopy's platform (standable, the parapet covers a squid, open
// underneath); carried down as it wilts; shoving (never inside it, never into a wall, never into the water); life (enemy
// fire cuts a plant down in the calibrated times — reported per weapon kind — the owners' own fire doesn't hurt it; it
// withers, cracks, snaps); the follower's replay (a grow record, a cut record; its own estimate never cuts); bots
// (closing a route with a wall, growing and fighting from a canopy, getting off, detouring round / cutting down an enemy
// wall, climbing over their own, never climbing an enemy plant).
(async () => {
  const g = window.__inkwave, m = g.match, dbg = g.debug, L = __G.level, Ph = __G.physics, nav = __G.nav;
  const THREE = await import('three');
  const { PLAYER, TEAM_PALETTES } = await import('./src/config.js');
  const { PODS, podDefs } = await import('./src/game/pods.js');
  const { on } = await import('./src/core/ctx.js');
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info: info === undefined ? undefined : JSON.parse(JSON.stringify(info)) });
  const r3 = (v) => Math.round(v * 1000) / 1000, r2 = (v) => Math.round(v * 100) / 100;
  dbg.freeze();
  const P = m.pods;
  const hooks = [];
  const step = (s) => { const n = Math.max(1, Math.round(s * 60)); for (let i = 0; i < n; i++) { hooks.forEach((f) => f()); dbg.step(1000 / 60); } };
  R('pods on this stage and mode (7 listed, mirrored: 14 — 2 walls and 5 canopies a half)', !!P && P.pods.length === 14 && P.pods.filter((p) => p.kind === 'wall').length === 4,
    { n: P && P.pods.length, kinds: P && P.pods.map((p) => p.id + ':' + p.kind), mode: m.mode });
  if (!P) return out;
  // a long clock (the stage clock follows duration − time)
  m.duration = 99999; m.time = m.duration - P.t;
  const now = () => P.t;
  const setClock = (t) => { m.time = m.duration - t; step(1 / 60); };
  const byId = (id) => P.pods.find((p) => p.id === id);
  // brains off: scripted intents (a function per actor, run every frame)
  const intents = new Map();
  for (const a of m.actors) if (a.bot) { a.bot._up0 = a.bot.update; a.bot.update = a.bot._stub = () => { const it = a.intent; it.move.set(0, 0, 0); it.fire = it.squid = it.jump = it.sub = it.special = false; const f = intents.get(a); if (f) f(a, it); }; }
  const A = m.actors.filter((a) => a.team === 0), B = m.actors.filter((a) => a.team === 1);
  const home = (a, i) => { const pd = L.spawnPads[a.team]; a.pos.set(pd.x + (i % 4) - 1.5, pd.y + 0.1, pd.z); a.vel.set(0, 0, 0); a.grounded = false; };
  const homeAll = () => { m.actors.forEach(home); intents.clear(); };
  homeAll();
  step(0.3);
  const W = (p, lx, ly, lz) => new THREE.Vector3(p.x + lx * p.c + lz * p.s, p.y + ly, p.z - lx * p.s + lz * p.c);   // pod local → world
  const loc = (p, v) => [(v.x - p.x) * p.c - (v.z - p.z) * p.s, (v.x - p.x) * p.s + (v.z - p.z) * p.c];
  const dirW = (p, lx, lz) => W(p, lx, 0, lz).sub(W(p, 0, 0, 0));
  const place = (a, v, squid = false) => { a.pos.copy(v); a.vel.set(0, 0, 0); a.grounded = false; a.form = squid ? 'squid' : 'kid'; a.climbing = false; };
  const fill = (p, team, amt = 1.2) => { const c = new THREE.Vector3(p.x, p.y + p.def.bulbY + 0.2, p.z); for (let i = 0; i < 40 && p.meter[team] < amt && p.state === 'dormant'; i++) __G.paint.splat(c, 0.8, team); };
  const grown = (p, team) => { P.grow(p, team, now() - 1); step(2 / 60); };     // (fully grown now)
  const aimAt = (a, v) => { const dx = v.x - a.pos.x, dz = v.z - a.pos.z, dy = v.y - (a.pos.y + 1.1); a.aimYaw = a.yaw = Math.atan2(dx, dz); a.aimPitch = Math.atan2(dy, Math.hypot(dx, dz)); a.aimPoint.copy(v); };
  const onPlant = (a, p) => P.hedgeUnder(a) === p;
  // capture the host's records (a stand-in for the net session, only while needed)
  const recs = [];
  const netOn = () => { __G.netm = new Proxy({ mute: 0, applying: false, recPods: (e) => recs.push(e) }, { get: (o, k) => (k in o ? o[k] : () => {}) }); };
  const netOff = () => { __G.netm = null; };
  const MODE = m.mode;

  // ---- 1) the layout: the engine's planters (a trough per wall, a tub per canopy), the bulbs, mirror twins; old data
  const looks = g.podLooks;
  const planterBlk = P.pods.map((p) => L.blocks.find((b) => !b.dynamic && Math.hypot(b.center.x - p.x, b.center.z - p.z) < 0.01 && Math.abs(b.center.y - p.def.col[1] / 2) < 0.01));
  const sizeOk = P.pods.every((p, i) => { const b = planterBlk[i]; return b && b.solid && Math.abs(b.half.x * 2 - p.def.col[0]) < 0.01 && Math.abs(b.half.z * 2 - p.def.col[2]) < 0.01; });
  const kindCol = P.pods.every((p) => (p.kind === 'wall' ? p.def.col[0] > p.def.col[2] + 0.5 : Math.abs(p.def.col[0] - p.def.col[2]) < 1e-6));
  R('the engine\'s planters, one per kind: a long trough for a wall, a round tub for a canopy (drawn, collided at the planter\'s size), each with its bulb on it',
    sizeOk && kindCol && looks.items.length === P.pods.length && looks.items.every((it) => it.planter && it.planter.children.length > 0 && it.bulb.children.length > 0 && Math.abs(it.pivot.position.y - it.def.bulbY) < 1e-6),
    { planters: planterBlk.filter(Boolean).length, cols: [...new Set(P.pods.map((p) => p.kind + ' ' + p.def.col.join('×')))], items: looks.items.length });
  let mir = true;
  for (let i = 0; i < P.pods.length; i += 2) {
    const a = P.pods[i], b = P.pods[i + 1];
    if (Math.abs(a.x + b.x) > 1e-6 || Math.abs(a.z + b.z) > 1e-6 || Math.abs(Math.cos(a.yaw) + Math.cos(b.yaw)) > 1e-6 || Math.abs(Math.sin(a.yaw) + Math.sin(b.yaw)) > 1e-6 || a.w !== b.w || a.kind !== b.kind) mir = false;
  }
  R('mirror twins: every pod has its 180° twin (position, heading, size, kind)', mir, P.pods.map((p) => [p.id, r3(p.x), r3(p.z), r3(p.yaw)]));
  {
    const old = podDefs({ pods: { list: [{ id: 'old', pos: [1, 0, 2], rotY: 0.3, size: [3, 1.8, 0.9], pod: { type: 'x' }, hedge: { type: 'y' } }] } })[0];
    const bq = old.parts[0];
    R('old pod data (no kind) is a wall of its given size (one block, the old planter)', old.kind === 'wall' && old.legacy && old.parts.length === 1 && Math.abs(bq.hx * 2 - 3.02) < 1e-6 && Math.abs(bq.hz * 2 - 0.92) < 1e-6 && bq.y1 === 1.8 && old.col.join() === '0.9,0.5,0.9',
      { kind: old.kind, parts: old.parts.map((q) => [q.id, r3(q.hx * 2), r3(q.y1), r3(q.hz * 2)]), col: old.col });
  }
  const gate = byId('gate'), mid = byId('mid');
  R('the plants\' shapes: a wall is one block (length × 2.7 × 1.2); a canopy is a trunk, two root curtains, a platform at 3 m and its parapet',
    gate.parts.length === 1 && Math.abs(gate.h - 2.7) < 1e-6 && Math.abs(gate.d - 1.2) < 1e-6 && gate.w === 6 && mid.parts.map((q) => q.id).join() === 'trunk,roots+z,roots-z,deck,rail+z,rail-z,rail+x,rail-x' && Math.abs(mid.topPart.y1 - 3) < 1e-6 && mid.ht > 3.3,
    { gate: [gate.w, gate.h, gate.d], mid: mid.parts.map((q) => [q.id, r2(q.hx * 2), r2(q.hz * 2), r2(q.y0), r2(q.y1)]) });

  if (MODE === 'turf') {
    // ---- 2) meters: each team's own, in proportion, draining; the bulb swells + blushes toward the team ahead
    const pm = byId('mid');
    const c = new THREE.Vector3(pm.x, pm.y + pm.def.bulbY + 0.2, pm.z);
    __G.paint.splat(c, 0.5, 0);
    const m1 = pm.meter[0];
    __G.paint.splat(c.clone().add(new THREE.Vector3(0.75, 0, 0)), 0.5, 0);     // (a splat that only grazes it: less)
    const m2 = pm.meter[0] - m1;
    __G.paint.splat(c.clone().add(new THREE.Vector3(3, 0, 0)), 0.5, 0);        // (one that misses: nothing)
    const m3 = pm.meter[0] - m1 - m2;
    __G.paint.splat(c, 0.5, 1);
    R('meters: each team fills its own, in proportion to how much of a splat lands (a direct one > a graze > a miss)', m1 > 0 && m2 > 0 && m2 < m1 && m3 === 0 && Math.abs(pm.meter[1] - m1) < 1e-9,
      { direct: r3(m1), graze: r3(m2), miss: m3, team1: r3(pm.meter[1]) });
    for (let i = 0; i < 4; i++) __G.paint.splat(c, 0.7, 0);
    step(0.1);
    const it = looks.items[pm.i], sc = it.pivot.scale.x, mat = it.mats.find((q) => q.emissive);
    const tc = __G.teamColors[0], dBlush = mat ? Math.hypot(mat.color.r - tc.r, mat.color.g - tc.g, mat.color.b - tc.b) : 9, d0 = mat ? Math.hypot(mat.userData.c0.r - tc.r, mat.userData.c0.g - tc.g, mat.userData.c0.b - tc.b) : 0;
    R('the bulb shows the meter: it swells, glows and blushes toward the team ahead', sc > 1.05 && mat && mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.05 && dBlush < d0,
      { meter: pm.meter.map(r3), scale: r3(sc), glow: mat && r3(mat.emissive.r + mat.emissive.g + mat.emissive.b), blush: [r3(dBlush), r3(d0)] });
    const before = pm.meter[0];
    step(1.0);
    const hold = pm.meter[0];
    step(2.5);
    R('an unfilled meter drains slowly (after a pause)', Math.abs(hold - before) < 1e-6 && pm.meter[0] < before - 0.2 && pm.meter[0] > 0, { before: r3(before), after1s: r3(hold), after3_5s: r3(pm.meter[0]), rate: PODS.drain, delay: PODS.drainDelay });
    P.reset(); step(0.1);

    // ---- 3) meter calibration per weapon kind: a kid 4 m off (melee 2.2 m) aiming at the bulb
    const pc = byId('calib'), shooter = A.find((a) => !a.isLocal) || A[1];
    const cal = {};
    const bulb = new THREE.Vector3(pc.x, pc.y + pc.def.bulbY + 0.15, pc.z);
    const setup = (id, dist) => {
      P.reset(); __G.projectiles.clear?.(); __G.subs.clear?.();
      shooter.setWeapon(id); shooter.ink = PLAYER.inkMax; shooter.hp = PLAYER.hp; shooter.special = 0;
      place(shooter, new THREE.Vector3(pc.x, 0.02, pc.z - 0.6 - dist)); step(0.3);
    };
    const diag = [], onS = P.onSplat.bind(P);
    P.onSplat = (c0, r, tm, o) => { const dx = c0.x - pc.x, dz = c0.z - pc.z; if (dx * dx + dz * dz < 9) { const m0 = pc.meter[0]; onS(c0, r, tm, o); diag.push([r, pc.meter[0] - m0]); } else onS(c0, r, tm, o); };
    const KINDS = ['shooter', 'twins', 'brolly', 'blaster', 'spinner', 'charger', 'bow', 'roller', 'brush', 'blade', 'mitts', 'bucket'];
    const foot = new THREE.Vector3(pc.x, pc.y + 0.1, pc.z);   // (a flick is thrown at the planter's foot: a flat sheet)
    for (const id of KINDS) for (const dist of id === 'roller' ? [4.4, 5, 5.6] : id === 'shooter' ? [4, 4, 4] : [['brush', 'blade', 'mitts'].includes(id) ? 2.2 : 4]) {
      setup(id, dist);
      let t = 0, peak = 0, full = -1, fires = 0;
      const kind = id, one = ['charger', 'bow', 'spinner', 'roller'].includes(id);
      const fr = (f) => Math.floor(t * 60 + 1e-6) % f;
      intents.set(shooter, (a, i) => {
        aimAt(a, kind === 'roller' ? foot : bulb); a.ink = PLAYER.inkMax;
        if (kind === 'charger' || kind === 'bow') { i.fire = t < 1.1; }
        else if (kind === 'spinner') { i.fire = t < 1.05; }
        else if (kind === 'roller') { i.fire = t > 0.1 && t < 0.2; }
        else if (kind === 'brush' || kind === 'blade') { i.fire = fr(12) < 5; }
        else if (kind === 'brolly') { i.fire = fr(30) < 3; }
        else i.fire = true;
      });
      diag.length = 0;
      const off = on('weapon:fire', (e) => { if (e.actor === shooter) fires++; });
      for (let f = 0; f < 60 * 4 && full < 0; f++) { step(1 / 60); t += 1 / 60; peak = Math.max(peak, pc.meter[0]); if (pc.state !== 'dormant' || pc.meter[0] >= 1) { full = t; peak = 1; } }
      off();
      intents.delete(shooter);
      const res = one ? { oneAction: r3(peak), t: full >= 0 ? r3(full) : null } : full >= 0 ? { full: r3(full) } : { meter4s: r3(peak) };
      res.fires = fires; res.from = dist;
      if (id === 'shooter') { (cal.shooterRuns ||= []).push(res.full ?? 9); cal.shooter = { full: r3(cal.shooterRuns.reduce((q, x) => q + x, 0) / cal.shooterRuns.length), runs: cal.shooterRuns.map(r3), fires: res.fires }; }
      else if (!cal[id] || (res.oneAction ?? 0) > (cal[id].oneAction ?? 0)) cal[id] = res;
    }
    setup('shooter', 4);
    __G.projectiles.throwBomb(shooter);
    { const bb = __G.projectiles.bombs[__G.projectiles.bombs.length - 1]; bb.pos.set(pc.x + 1, 0.6, pc.z - 0.9); bb.vel.set(0.1, -0.5, 0.05); }
    let bm = 0; for (let f = 0; f < 150; f++) { step(1 / 60); bm = Math.max(bm, pc.state !== 'dormant' ? 1 : pc.meter[0]); }
    cal.bomb = { oneBomb: r3(bm) };
    P.onSplat = onS;
    delete cal.shooterRuns;
    const shootOk = cal.shooter.full >= 1.0 && cal.shooter.full <= 1.5;
    const oneOk = ['charger', 'roller'].every((k) => cal[k].oneAction >= 0.95) && cal.bomb.oneBomb >= 0.95;
    R('meter calibration: ~1–1.5 s of direct shooter fire, one charger shot, one roller flick or one bomb fills a meter', shootOk && oneOk, cal);
    P.reset(); homeAll(); step(0.2);

    // ---- 4) growth: the first team to fill it; the host's record; a route through the gap replans (the gate)
    const pg = byId('gate');
    const walker = B.find((a) => !a.isLocal);
    const s1 = nav.nearest(W(pg, 0.3, 0, -3.2), 0.5), s2 = nav.nearest(W(pg, 0.3, 0, 3.2), 0.5);
    const p1 = nav.path(s1, s2, walker.team);
    const through = (path) => path ? path.filter((id) => nav.blocked && nav.blocked[id]).length : -1;
    walker.bot.path = p1 ? p1.slice() : null; walker.bot.pi = 1;
    fill(pg, 1, 0.6);
    netOn();
    fill(pg, 0, 1.2);
    step(1 / 60);
    const t0 = pg.t0;
    netOff();
    const rec = recs.find((e) => e[0] === 'g' && e[1] === pg.i);
    R('growth: the first team to fill its meter grows it — its plant; the host records it (pod, team, time)', pg.owner === 0 && (pg.state === 'grow' || pg.state === 'stand') && pg.block.solid && rec && rec[2] === 0 && Math.abs(rec[3] - t0) < 1e-3 && pg.meter[1] === 0,
      { owner: pg.owner, state: pg.state, record: rec, other: pg.meter[1] });
    R('nav: a bot routed through it replans; goals skip it', !!p1 && through(p1) > 0 && walker.bot.path === null && P.state().blocked > 0 && !nav.blocked[nav.nearest(W(pg, 0, 0, 0), 1)],
      { crossedBefore: through(p1), replanned: walker.bot.path === null, marked: P.state().blocked });
    const T = P.T, samples = {};
    step(0.2); samples.grow = { st: pg.state, k: r3(pg.k), solid: pg.block.solid };
    step(0.4); samples.stand = { st: pg.state, k: r3(pg.k), h: r3(pg.block.half.y * 2) };
    const growOk = samples.grow.st === 'grow' && samples.grow.k > 0.39 && samples.grow.k < 1 && samples.stand.st === 'stand' && Math.abs(samples.stand.h - pg.h) < 1e-3;

    // ---- 5) a wall closes its gap: no route through it (the way round: past the barrier's west end), and an enemy can't
    // walk or hop past it
    {
      const south = nav.nearest(new THREE.Vector3(20, 0, -19.5), 0.5), north = nav.nearest(new THREE.Vector3(20, 0, -12.5), 0.5);
      const q = nav.path(south, north, 1, undefined, false, P.hard);
      const inGap = q ? q.filter((id) => { const n = nav.nodes[id]; return Math.abs(n.z + 16) < 1.3 && n.x > 11; }).length : -1;
      const minX = q ? Math.min(...q.map((id) => nav.nodes[id].x)) : null;
      const rowHard = nav.nodes.filter((n) => Math.abs(n.z + 16) < 0.8 && n.x > 17.3 && n.x < 22.7 && n.y < 0.5);
      // enemies pushing north into it — walking, hopping, at its ends, a squid
      const en = [B[1], B[2], B[3]];
      place(en[0], new THREE.Vector3(20, 0.02, -18.4)); place(en[1], new THREE.Vector3(17.4, 0.02, -18.2)); place(en[2], new THREE.Vector3(22.6, 0.02, -18.3), true);
      // (pushing into it and a little toward an end: past it means out the north side of the gap, not round the
      // barrier's end — that's the way round)
      let t = 0, maxZ = -99, past = 0;
      const push = (dx) => (a, i) => { i.move.set(dx, 0, 1); i.jump = a === en[0] ? Math.floor(t * 60) % 26 < 3 : a === en[1] && Math.floor(t * 60) % 40 < 3; i.squid = a === en[2]; };
      intents.set(en[0], push(0)); intents.set(en[1], push(-0.12)); intents.set(en[2], push(0.12));
      for (let f = 0; f < 60 * 3; f++) {
        step(1 / 60); t += 1 / 60;
        for (const a of en) if (a.pos.x > 16.6 && a.pos.x < 23.4) { maxZ = Math.max(maxZ, a.pos.z); if (a.pos.z > pg.z - pg.hd + 0.3) past++; }
      }
      for (const a of en) intents.delete(a);
      const face = pg.z - pg.hd;
      R('a wall closes its gap: no route through it (the only way is round the barrier\'s end), and an enemy walking, hopping or swimming into it — middle or ends — never gets past',
        !!q && inGap === 0 && minX < 11 && rowHard.length > 0 && rowHard.every((n) => P.hard[n.id]) && past === 0 && maxZ < face + 0.02,
        { routeNodes: q && q.length, inGap, westmost: minX, gapRowHard: rowHard.filter((n) => P.hard[n.id]).length + '/' + rowHard.length, maxZInGap: r3(maxZ), face: r3(face), framesPast: past, ends: en.map((a) => [r3(a.pos.x), r3(a.pos.y), r3(a.pos.z)]) });
      en.forEach((a, i) => home(a, i + 1));
    }

    // ---- 6) standing: blocks shots / sight; the owner's tint; only the owner's ink
    const hitBlk = Ph.raycast(W(pg, 0.6, 1.0, -3), dirW(pg, 0, 1), 6, undefined, true);
    R('a plant blocks shots / sight (a ray across the wall hits it)', hitBlk.hit && hitBlk.block === pg.block.id && !Ph.los(W(pg, 0.6, 1.0, -3), W(pg, 0.6, 1.0, 3)), { rayBlock: hitBlk.block, wall: pg.block.id });
    const cd = (x, col) => Math.hypot(x.r - col.r, x.g - col.g, x.b - col.b);
    const tintOf = (p) => {
      const h = p.look, looksT = h && h.team[p.owner];
      let bloomC = null;
      looksT && looksT.forEach((look) => look.traverse((q) => { if (!bloomC && q.isMesh && h.mats[p.owner].some((x) => x.kind === 'bloom' && x.m === q.material)) { const C = q.geometry.attributes.color; let r = 0, gg = 0, b = 0, n = 0; for (let k = 0; k < C.count; k++) { const s = C.getX(k) + C.getY(k) + C.getZ(k); if (s > 0.2) { r += C.getX(k); gg += C.getY(k); b += C.getZ(k); n++; } } bloomC = new THREE.Color(r / n, gg / n, b / n); } }));
      const lf = h && h.mats[p.owner].find((x) => x.kind === 'leaf');
      return { h, tint: looksT && looksT[0].userData.tint, bloomC, sheen: lf ? lf.m.emissive.r + lf.m.emissive.g + lf.m.emissive.b : 0, shown: !!(looksT && looksT.every((x) => x.visible) && h.root.visible && !h.team[1 - p.owner].some((x) => x.visible)) };
    };
    const t1 = tintOf(pg), tA = __G.teamColors[0];
    const pal0 = g.palette, pal1 = TEAM_PALETTES.find((q) => q.a !== pal0.a) || TEAM_PALETTES[0];
    g._setPalette(pal1); step(1 / 60);
    const t2 = tintOf(pg);
    g._setPalette(pal0); step(1 / 60);
    R('the plant wears its grower\'s ink (a look built with tint: blossoms and berries in it; a sheen on its leaves), rebuilt when the palette changes',
      t1.shown && t1.tint === tA.getHexString() && t1.bloomC && cd(t1.bloomC, tA) < 0.45 && t1.sheen > 0 && t2.tint === pal1.a.replace('#', '').toLowerCase() && t2.h !== t1.h && tintOf(pg).shown,
      { tint: t1.tint, team: tA.getHexString(), bloom: t1.bloomC && t1.bloomC.getHexString(), sheen: r3(t1.sheen), afterPalette: t2.tint, newTeam: pal1.a, rebuilt: t2.h !== t1.h });
    const wallP = W(pg, -0.6, 0.9, -pg.d / 2 - 0.15), nrm = dirW(pg, 0, -1);
    const n0 = pg.paint.n;
    __G.paint.splat(wallP, 0.45, 1);
    const enemyInk = pg.paint.wallTeam(W(pg, -0.6, 0.9, -pg.d / 2), nrm), nE = pg.paint.n - n0;
    __G.paint.splat(wallP, 0.45, 0);
    const ownInk = pg.paint.wallTeam(W(pg, -0.6, 0.9, -pg.d / 2), nrm);
    R('only the grower\'s ink sticks to it: the other team\'s splats leave none', enemyInk === 0 && nE === 0 && ownInk === 1, { enemyInk, enemyPainted: nE, ownInk });

    // ---- 7) the owners climb both kinds; the enemy neither
    const swimUp = (a, p, face, u, team, secs = 2.5) => {
      for (let y = 0.2; y < p.ht; y += 0.3) __G.paint.splat(W(p, u, y, face * (p.hd + 0.12)), 0.4, team);
      place(a, W(p, u, 0.02, face * (p.hd + 0.75)), true);
      const into = dirW(p, 0, -face);
      let climbed = false, maxY = 0;
      // (swim into it while below its top or climbing; a canopy's parapet: on in, gently, till we're on it)
      intents.set(a, (b, i) => { i.squid = true; if (b.pos.y < p.y + p.h - 0.25 || b.climbing) i.move.set(into.x, 0, into.z); else if (p.kind === 'canopy' && !onPlant(b, p)) i.move.set(into.x * 0.4, 0, into.z * 0.4); });
      for (let f = 0; f < 60 * secs; f++) { step(1 / 60); climbed = climbed || a.climbing; maxY = Math.max(maxY, a.pos.y); }
      intents.set(a, (b, i) => { i.squid = true; });
      step(0.5);
      intents.delete(a);
      return { climbed, maxY: r3(maxY), on: onPlant(a, p), y: r3(a.pos.y), block: a.ground && a.ground.block, ids: [...p.ids] };
    };
    const cl = A[1];
    const cw = swimUp(cl, pg, -1, 0.2, 0);
    for (const lx of [-0.9, -0.3, 0.3, 0.9]) __G.paint.splat(W(pg, lx, pg.h + 0.1, 0), 0.5, 0);
    place(cl, W(pg, 0.2, pg.h + 0.05, 0), true); intents.set(cl, (b, i) => { i.squid = true; }); step(0.4); intents.delete(cl);
    const wallTop = cl.grounded && onPlant(cl, pg) && cl.groundTeam === 1 && !cl.roofT;
    const pmid = byId('mid');
    grown(pmid, 0);
    const cc = swimUp(cl, pmid, -1, 0.1, 0, 3);
    R('the owners swim up both kinds: the wall\'s inked face onto its top walkway (2.7 m: over any jump; its ink there is ground to swim in) and the canopy\'s inked root curtain, over the platform\'s edge and the parapet, onto the platform (3 m)',
      cw.climbed && cw.on && Math.abs(cw.y - pg.top) < 0.15 && wallTop && cc.climbed && cc.on && cc.y > pmid.y + pmid.h - 0.1,
      { wall: cw, wallTopInk: wallTop, canopy: cc });
    // the enemy: its ink doesn't stick, so it never gets a hold on either
    const en = B[1];
    const ew = swimUp(en, pg, 1, -1.2, 1, 2), ec = swimUp(en, pmid, 1, -0.1, 1, 2);
    R('the enemy climbs neither: its ink never sticks to the wall or the root curtain, and swimming into them it never gets a hold (stays on the ground)',
      !ew.climbed && !ec.climbed && ew.maxY < 0.7 && ec.maxY < 0.7 && !ew.on && !ec.on, { wall: ew, canopy: ec });
    home(en, 1);

    // ---- 8) the canopy's platform: standable, the parapet covers a squid on it (a kid stands exposed), open underneath
    {
      const pk = cl;
      place(pk, W(pmid, 0.9, pmid.h + 0.05, 0.3)); step(0.6);
      const stand = pk.grounded && onPlant(pk, pmid) && !pk.roofT && Math.abs(pk.pos.y - pmid.top) < 0.05;
      // a squid tucked in behind the +x parapet; an enemy's gun 9 m off beyond it, at ground level
      place(pk, W(pmid, pmid.hw - pmid.def.cn.railW - PLAYER.radius - 0.06, pmid.h + 0.05, 0), true); intents.set(pk, (b, i) => { i.squid = true; }); step(0.5);
      const gun = W(pmid, pmid.hw + 9, 1.1, 0), body = pk.pos.clone().setY(pk.pos.y + 0.25), head = pk.pos.clone().setY(pk.pos.y + 1.2);
      const rs = Ph.raycast(gun, body.clone().sub(gun).normalize(), gun.distanceTo(body), undefined, true);
      const covered = rs.hit && pmid.ids.has(rs.block) && rs.block === pmid.parts.find((q) => q.id === 'rail+x').blk.id;
      const exposed = Ph.los(gun, head);
      intents.delete(pk);
      // under it: a kid walks the corridor beside the trunk right through (along its heading), under the platform
      place(pk, W(pmid, 1.15, 0.02, -pmid.hd - 1.2));
      const fwd = dirW(pmid, 0, 1);
      intents.set(pk, (b, i) => { i.move.set(fwd.x, 0, fwd.z); });
      let under = 0, minHead = 99;
      for (let f = 0; f < 60 * 2.2; f++) { step(1 / 60); const [lx, lz] = loc(pmid, pk.pos); if (Math.abs(lz) < pmid.hd - 0.3 && Math.abs(lx) < pmid.hw) { under++; minHead = Math.min(minHead, pmid.y + pmid.h - pmid.def.cn.deck - (pk.pos.y + PLAYER.height)); } }
      intents.delete(pk);
      const [ex, ez] = loc(pmid, pk.pos);
      R('the canopy\'s platform: a kid stands on it (no slide-off); a squid behind the parapet is covered from below (the shot hits the parapet) while a standing kid is exposed; underneath it\'s open — a kid walks right through beside the trunk',
        stand && covered && exposed && under > 20 && ez > pmid.hd && minHead > 0.5,
        { stand, covered, coverBlock: rs.block, exposed, walkedUnder: under, headroom: r3(minHead), end: [r3(ex), r3(ez)] });
      home(pk, 1);
    }
    // an enemy up on the wall's top (a super jump, higher ground) can stand; its ink doesn't stick
    const eon = B[3];
    place(eon, W(pg, -1.0, pg.h + 0.05, 0)); step(0.8);
    const enOn = eon.grounded && onPlant(eon, pg) && !eon.roofT;
    const gt0 = pg.paint.groundTeam(W(pg, -1.0, pg.h, 0));
    __G.paint.splat(W(pg, -1.0, pg.h + 0.1, 0), 0.5, 1);
    const gt1 = pg.paint.groundTeam(W(pg, -1.0, pg.h, 0));
    R('an enemy on the top can stand there (no slide-off), but its ink doesn\'t stick', enOn && gt1 === gt0 && eon.groundTeam !== 1, { standing: enOn, before: gt0, after: gt1, enemyGround: eon.groundTeam });
    home(eon, 3);

    // ---- 9) carried down as it wilts: a kid on the wall's top; a kid on the canopy's platform (its crown draws in over
    // the trunk first: off its edge, or down with it — never through, never into anything)
    const carry = (p, a, lx, lz) => {
      place(a, W(p, lx, p.h + 0.05, lz)); step(0.4);
      const wiltAt = p.wiltAt;
      setClock(wiltAt - 0.3);
      let worst = 0, inWall = 0, onBlock = 0, minY = 99, wiltS = null;
      for (let f = 0; f < 90; f++) {
        step(1 / 60);
        if (onPlant(a, p)) { onBlock++; const q = p.parts.find((w) => w.blk.id === a.ground.block); worst = Math.max(worst, Math.abs(a.pos.y - q.topY)); }
        let dyn = false; for (const q of p.parts) if (q.blk.solid && L.pointInBlock(q.blk, a.pos.clone().setY(a.pos.y + 0.5), -0.06)) dyn = true;
        if (dyn || !Ph.bodyFits(a.pos, PLAYER.radius - 0.08, PLAYER.stepUp + 0.05, PLAYER.height * 0.8)) inWall++;
        minY = Math.min(minY, a.pos.y);
        if (f === 45) wiltS = { st: p.state, k: r3(p.k) };
      }
      step(0.8);
      return { framesOnIt: onBlock, worstGap: r3(worst), inWall, minY: r3(minY), endY: r3(a.pos.y), wilt: wiltS, state: p.state };
    };
    const c1 = carry(pg, cl, 1.1, 0);
    samples.wilt = c1.wilt;
    samples.recharge = { st: pg.state, solid: pg.block.solid, visible: !!(pg.look && pg.look.root.visible), ink: pg.paint.n, bulbShown: looks.items[pg.i].pivot.visible };
    setClock(Math.max(now(), pg.wiltAt + T.wilt + T.recharge + 0.2));
    samples.dormant = { st: pg.state, owner: pg.owner, bulb: r3(looks.items[pg.i].pivot.scale.x) };
    if (pmid.state !== 'stand') grown(pmid, 0);
    const c2 = carry(pmid, B[2], 0.3, 0.2);
    R('whoever stands on a wilting plant is lowered with it or steps off its drawn-in crown (never dropped through, never pushed into anything)',
      c1.framesOnIt > 20 && c1.worstGap < 0.12 && c1.inWall === 0 && c1.minY > -0.05 && Math.abs(c1.endY) < 0.1 && c2.inWall === 0 && c2.minY > -0.05 && Math.abs(c2.endY) < 0.1,
      { wall: c1, canopy: c2, carried: P.stats.carried });
    R('timing: grows in ' + T.grow + ' s, stands ' + T.last + ' s, wilts ' + T.wilt + ' s, recharges ' + T.recharge + ' s, then dormant again (its ink gone)',
      growOk && T.last === 22 && T.recharge === 8 && samples.wilt.st === 'wilt' && samples.wilt.k < 0.9 && samples.recharge.st === 'recharge' && !samples.recharge.solid && !samples.recharge.visible && samples.recharge.ink === 0 && samples.recharge.bulbShown && samples.dormant.st === 'dormant' && samples.dormant.owner === -1,
      samples);
    homeAll(); P.reset(); step(0.2);

    // ---- 10) shoving: kids + a squid where a wall grows (one hard by the barrier's end), where a canopy grows (one by the
    // water, one where a root curtain comes down)
    {
      const pw = byId('gate'), pe = byId('edge'), pc2 = byId('mid~');
      const k1 = A[1], k2 = A[2], k3 = B[1], k4 = B[2], k5 = B[3];
      place(k1, W(pw, 0.8, 0.02, 0.1)); place(k2, W(pw, -2.7, 0.02, -0.2), true); intents.set(k2, (a, i) => { i.squid = true; });
      place(k3, W(pw, 2.55, 0.02, 0.3));                          // (against the barrier's end)
      place(k4, W(pe, 0.3, 0.02, 1.45));                          // (the edge canopy: where its root curtain comes down, the water side)
      place(k5, W(pc2, 0.2, 0.02, 1.4));                          // (under where mid~'s root curtain comes down)
      step(0.3);
      const watch = [k1, k2, k3, k4, k5], stat = { inside: 0, inWall: 0, wet: 0 }, chest = new THREE.Vector3();
      const plants = [pw, pe, pc2];
      fill(pw, 0); fill(pe, 1); fill(pc2, 0);
      for (let f = 0; f < 60; f++) {
        step(1 / 60);
        for (const a of watch) {
          for (const p of plants) for (const q of p.parts) { chest.set(a.pos.x, a.pos.y + 0.4, a.pos.z); if (q.blk.solid && L.pointInBlock(q.blk, chest, -0.06)) stat.inside++; }
          if (!Ph.bodyFits(a.pos, PLAYER.radius - 0.08, PLAYER.stepUp + 0.05, PLAYER.height * 0.8, a.form === 'squid')) {
            let dyn = false; for (const p of plants) for (const q of p.parts) { chest.set(a.pos.x, a.pos.y + 0.8, a.pos.z); if (q.blk.solid && L.pointInBlock(q.blk, chest, PLAYER.radius)) dyn = true; }
            if (!dyn) stat.inWall++;
          }
          if (a.pos.y < -0.5) stat.wet++;
        }
      }
      intents.delete(k2);
      const o3 = loc(pw, k3.pos);
      R('shoving: kids and squids where a plant grows are pushed out of it — never inside it, never into a wall (the kid at the barrier\'s end goes out front or back), never into the water',
        plants.every((p) => p.state !== 'dormant') && stat.inside === 0 && stat.inWall === 0 && stat.wet === 0 && Math.abs(o3[1]) > pw.hd + PLAYER.radius - 0.05 && k4.pos.x < 28 && k4.pos.y > -0.1,
        { ...stat, states: plants.map((p) => p.state), k1: loc(pw, k1.pos).map(r3), k2: loc(pw, k2.pos).map(r3), k3: o3.map(r3), k4: [r3(k4.pos.x), r3(k4.pos.z)], k5: loc(pc2, k5.pos).map(r3), shoved: P.stats.shoved });
      P.reset(); homeAll(); step(0.2);
    }

    // ---- 11) life: enemy fire cuts a plant down — one Spritzer ~5 s on a wall, two ~2.5 s, a canopy a little quicker;
    // the owners' own fire never hurts it; it withers as it goes, cracks near the end, snaps
    {
      const pw = byId('gate'), pcn = byId('calib');
      const cutRun = (p, ownerTeam, shooters, wid, dist, maxS = 12, rhythm = null) => {
        P.reset(); __G.projectiles.clear?.(); __G.subs.clear?.(); step(0.1);
        grown(p, ownerTeam);
        const face = -1, t0c = now();
        shooters.forEach((a, k) => {
          a.setWeapon(wid); a.ink = PLAYER.inkMax; a.hp = PLAYER.hp; a.special = 0;
          const u = shooters.length > 1 ? (k ? 0.9 : -0.9) : 0.2;
          place(a, W(p, u, 0.02, face * (p.hd + dist)));
        });
        step(0.3);
        let t = 0, cutT = -1, crackT = -1, brown = 0, leaf0 = null, snapped = false;
        const lm = () => p.look && p.look.mats[p.owner].find((x) => x.kind === 'leaf');
        if (lm()) leaf0 = lm().m.userData.c0.clone();
        shooters.forEach((a, k) => intents.set(a, (b, i) => {
          const u = shooters.length > 1 ? (k ? 0.9 : -0.9) : 0.2;
          aimAt(b, W(p, u, Math.min(1.2, p.ground.y1 * 0.5), face * p.hd)); b.ink = PLAYER.inkMax;
          i.fire = rhythm ? rhythm(t) : true;
        }));
        const life0 = p.life;
        for (let f = 0; f < 60 * maxS && cutT < 0; f++) {
          step(1 / 60); t += 1 / 60;
          if (crackT < 0 && p.cracked) crackT = t;
          if (lm() && leaf0) brown = Math.max(brown, Math.hypot(lm().m.color.r - leaf0.r, lm().m.color.g - leaf0.g, lm().m.color.b - leaf0.b));
          if (p.state === 'wilt' || p.state === 'recharge') { cutT = t; snapped = p.cutBy; }
        }
        shooters.forEach((a) => intents.delete(a));
        const res = { t: cutT >= 0 ? r2(cutT) : null, life: r3(p.life / p.life0), crackAt: crackT >= 0 ? r2(crackT) : null, snapped, brownMax: r3(brown), life0 };
        void t0c;
        return res;
      };
      const S1 = B.filter((a) => !a.isLocal).slice(0, 2);
      const one = cutRun(pw, 0, [S1[0]], 'shooter', 5);
      const two = cutRun(pw, 0, S1, 'shooter', 5);
      const can = cutRun(pcn, 0, [S1[0]], 'shooter', 5);
      netOn(); recs.length = 0;
      const own = cutRun(pw, 1, [S1[0]], 'shooter', 5, 5);
      netOff();
      R('life: one Spritzer firing steadily cuts a wall down in ~5 s, two in ~2.5 s, a canopy a little quicker; the owners\' own fire (5 s of it) never hurts it',
        one.t >= 4.3 && one.t <= 5.7 && two.t >= 2.0 && two.t <= 3.0 && can.t >= 3.2 && can.t <= one.t - 0.3 && own.t === null && own.life === 1,
        { oneOnWall: one, twoOnWall: two, oneOnCanopy: can, ownFire: own, life: { wall: PODS.kinds.wall.life, canopy: PODS.kinds.canopy.life } });
      R('as it loses life it withers (its leaves brown), cracks near the end (the cue), and snaps when cut down (it wilts early)',
        one.brownMax > 0.08 && one.crackAt !== null && one.crackAt < one.t && one.snapped && P.stats.cracked > 0 && P.stats.cut >= 3,
        { brown: one.brownMax, crackAt: one.crackAt, cutAt: one.t, snapped: one.snapped, stats: { cut: P.stats.cut, cracked: P.stats.cracked } });
      // the host's record of a cut
      netOn(); recs.length = 0;
      const rc = cutRun(pw, 0, [S1[0]], 'shooter', 5);
      netOff();
      const wrec = recs.find((e) => e[0] === 'w' && e[1] === pw.i);
      R('the host records a cut-down like an early wilt: [\'w\', pod, time, 1]', !!wrec && wrec[3] === 1 && Math.abs(wrec[2] - pw.wiltAt) < 1e-3 && rc.snapped, { record: wrec });
      // per weapon kind (the table: time for one of each to cut the wall down, in its own rhythm, from its own range)
      const table = {};
      const kinds = [['shooter', 5], ['twins', 5], ['brolly', 4, (t) => Math.floor(t * 60) % 30 < 3], ['blaster', 5], ['spinner', 5, (t) => t % 2.3 < 1.1], ['charger', 7, (t) => t % 1.4 < 1.1],
        ['bow', 7, (t) => t % 1.4 < 1.1], ['roller', 3.5, (t) => Math.floor(t * 60) % 38 < 6], ['brush', 2, (t) => Math.floor(t * 60) % 12 < 5], ['blade', 1.8, (t) => Math.floor(t * 60) % 12 < 5], ['mitts', 2.2], ['bucket', 3.5]];
      for (const [wid, dist, rh] of kinds) { const r = cutRun(pw, 0, [S1[0]], wid, dist, 16, rh); table[wid] = r.t ?? ('> 16 s (' + r.life + ' left)'); }
      const vals = Object.values(table).filter((v) => typeof v === 'number');
      R('life per weapon kind: one of each cuts the wall down in a sane time (between ~2.5 and ~12 s) — reported', vals.length >= 10 && Math.min(...vals) >= 2.2 && Math.max(...vals) <= 12.5, table);
      P.reset(); homeAll(); step(0.2);
    }

    // ---- 12) the follower: replays the host's records (a grow with the owner; a cut); never grows from its own meters,
    // never cuts from its own estimate of the life (only the look)
    {
      const pf = byId('calib~'), pf2 = byId('calib'), pwf = byId('gate~');
      m.follower = true;
      const tg = now() - 0.1;
      P.netEvent(['g', pf.i, 1, +tg.toFixed(3)]);
      const fs0 = { st: pf.state, owner: pf.owner, solid: pf.block.solid };
      step(0.6);
      const fs1 = { st: pf.state, k: r3(pf.k), t0: r3(pf.t0) };
      fill(pf2, 0, 1.2); step(0.3);
      const noGrow = pf2.state === 'dormant';
      const q = new Array(P.pods.length * 2).fill(0); q[pf2.i * 2 + 1] = 40;
      P.netEvent(['m', ...q]);
      const snap = r3(pf2.meter[1]);
      // its own estimate of a wall's life: enemy ink wears it (the look) but never cuts it; the host's record does
      P.netEvent(['g', pwf.i, 1, +(now() - 1).toFixed(3)]); step(0.1);
      for (let i = 0; i < 80 && pwf.life > 0; i++) __G.paint.splat(W(pwf, 0.2, 1.2, -pwf.hd - 0.1), 0.85, 0);
      step(0.3);
      const est = { life: r3(pwf.life / pwf.life0), st: pwf.state, brown: r3(pwf.brown) };
      const tw = now() + 0.2;
      P.netEvent(['w', pwf.i, +tw.toFixed(3), 1]);
      step(0.1); const pre = pwf.state;
      step(0.3); const post = pwf.state;
      m.follower = false;
      step(1 / 60);
      const fl = pf.look && pf.look.team[1][0];
      R('follower: a grow record replays (the owner\'s plant, its pose from the grow time); its own meters never grow a pod; the meters\' snapshot applies',
        fs0.owner === 1 && fs0.solid && fs1.st === 'stand' && Math.abs(fs1.t0 - tg) < 1e-3 && noGrow && Math.abs(snap - 0.4) < 1e-3 && fl && fl.visible && fl.userData.tint === __G.teamColors[1].getHexString(),
        { atRecord: fs0, after06: fs1, ownMeterGrew: !noGrow, snapshot: snap });
      R('follower: its own estimate of a plant\'s life shows (withered) but never cuts it; the host\'s cut record does, at its time',
        est.life === 0 && est.st === 'stand' && est.brown > 0.2 && pre === 'stand' && post === 'wilt' && pwf.cutBy, { estimate: est, beforeRecordTime: pre, after: post, cutBy: pwf.cutBy });
      P.reset(); homeAll(); step(0.2);
    }

    // ---- 13) bots: close the route a foe is coming by with a wall; grow a canopy near a fight and fight from its top
    const botOn = (a) => { a.bot.reset(); a.bot.update = a.bot._up0; };
    const botOff = (a) => { a.bot.update = a.bot._stub; };
    {
      const pb = byId('gate'), bot = A.find((a) => !a.isLocal), foe = B.find((a) => !a.isLocal);
      bot.setWeapon('shooter'); bot.bot.setDifficulty?.('normal');
      // (the fight's line runs through the gap 1.5 m off the bulb: its shots at the foe miss the pod)
      place(bot, new THREE.Vector3(21.5, 0.02, -10.5)); bot.yaw = bot.aimYaw = Math.PI; bot.bot.aimYaw = bot.yaw;
      place(foe, new THREE.Vector3(21.5, 0.02, -23));
      intents.set(foe, (a) => { a.hp = PLAYER.hp; a.invuln = 1; });
      botOn(bot);
      hooks.push(() => { bot.special = 0; bot.hp = Math.max(bot.hp, PLAYER.hp * 0.9); });
      let grewT = -1, by = -1; const tasks = new Set();
      for (let f = 0; f < 60 * 8 && grewT < 0; f++) { step(1 / 60); const S = bot.bot.podS; if (S && S.task) tasks.add(S.task); if (pb.state !== 'dormant') { grewT = f / 60; by = pb.owner; } }
      R('bots: a foe coming through a gap — the bot inks the wall pod across it and closes the route (its team\'s wall)', grewT >= 0 && by === 0 && tasks.has('grow'), { grewAt: grewT, by, tasks: [...tasks] });
      hooks.length = 0; botOff(bot); intents.clear(); P.reset(); homeAll(); step(0.2);
    }
    {
      const pb = byId('mid'), bot = A.find((a) => !a.isLocal), foe = B.find((a) => !a.isLocal);
      const other = byId('track~'); other.off = 'test';          // (the only other canopy pod in reach: this one's the test's)
      bot.setWeapon('shooter');
      place(bot, W(pb, 1.9, 0.02, -7)); bot.yaw = bot.aimYaw = 0; bot.bot.aimYaw = 0;
      place(foe, W(pb, 1.9, 0.02, 6.5));
      intents.set(foe, (a) => { a.hp = PLAYER.hp; a.invuln = 1; });
      botOn(bot);
      hooks.push(() => { bot.special = 0; bot.hp = Math.max(bot.hp, PLAYER.hp * 0.9); });
      const log = [];
      let grewT = -1, grewBy = -1, topT = -1, perchN = 0, onN = 0; const tasks = new Set();
      for (let f = 0; f < 60 * 24 && (topT < 0 || f / 60 < topT + 2); f++) {
        step(1 / 60);
        const S = bot.bot.podS;
        if (S && S.task) tasks.add(S.task);
        if (grewT < 0 && pb.state !== 'dormant') { grewT = f / 60; grewBy = pb.owner; }
        if (grewT >= 0 && onPlant(bot, pb)) { if (topT < 0) topT = f / 60; onN++; if (bot.bot.perchUntil > bot.bot.t) perchN++; }
        if (f % 60 === 0) log.push([f / 60, S && S.task, r3(pb.meter[0]), pb.state, r3(bot.pos.x), r3(bot.pos.y), r3(bot.pos.z)]);
      }
      R('bots: in a fight at range, a bot grows the canopy pod near it (its team\'s)', grewT >= 0 && grewBy === 0 && tasks.has('grow'), { grewAt: grewT, by: grewBy, tasks: [...tasks] });
      R('bots: …then inks a root curtain, swims up onto the platform and fights from it (perching on purpose)', topT >= 0 && tasks.has('climb') && onN > 60 && perchN / Math.max(1, onN) > 0.9,
        { topAt: topT, onTop: onN, perched: r3(perchN / Math.max(1, onN)), tasks: [...tasks], log });
      other.off = '';
      hooks.length = 0; botOff(bot); intents.clear();
    }

    // ---- 14) off the top: nothing to fight from up there → off (a hop over the parapet, a plain drop), a route again;
    // fighting from it → perching; the foe gone → off; the plant about to wilt → off
    P.reset(); homeAll(); step(0.2);
    {
      const pt = byId('mid'), up = A.find((a) => !a.isLocal);
      grown(pt, 0);
      const mount = (a, lx = 0.4) => { place(a, W(pt, lx, pt.h + 0.05, 0.2)); step(0.3); a.bot.reset(); a.bot.update = a.bot._up0; };
      mount(up);
      let offT = -1, pathT = -1, landT = -1, wetN = 0;
      for (let f = 0; f < 60 * 6 && (pathT < 0 || landT < 0); f++) {
        step(1 / 60);
        if (offT < 0 && !onPlant(up, pt) && up.pos.y < pt.y + pt.h - 0.5) offT = f / 60;
        if (offT >= 0 && landT < 0 && up.grounded) landT = f / 60;
        if (offT >= 0 && pathT < 0 && up.bot.path) pathT = f / 60;
        if (up.pos.y < -0.5) wetN++;
      }
      R('a bot on a canopy with no foe about gets off within ~4 s (a look round, a hop over the parapet, a plain drop, never into the water) and routes again',
        offT >= 0 && offT <= 4.4 && landT <= 5.2 && pathT >= 0 && wetN === 0 && Math.abs(up.pos.y) < 0.2,
        { offAt: offT, landedAt: landT, pathAt: pathT, why: up.bot.podS && up.bot.podS.exit ? up.bot.podS.exit.why : null, endY: r3(up.pos.y), exits: P.stats.exits });
      const fo = B.find((a) => !a.isLocal);
      intents.set(fo, (a) => { a.hp = PLAYER.hp; a.invuln = 1; });
      up.setWeapon('shooter');
      place(fo, W(pt, 0.5, 0.02, 9));
      mount(up);
      let perchN = 0, onN = 0, fr = 0, leftWhy = null, leftAt = -1;
      for (let f = 0; f < 60 * 3; f++) {
        up.hp = PLAYER.hp; up.ink = PLAYER.inkMax; step(1 / 60); fr++;
        if (onPlant(up, pt)) { onN++; if (up.bot.perchUntil > up.bot.t) perchN++; } else if (leftAt < 0) { leftAt = f / 60; const S = up.bot.podS; leftWhy = [S && S.task, S && S.exit && S.exit.why, up.grounded, r3(up.pos.y), up.bot.mode]; }
      }
      const stayed = onN / fr;
      home(fo, 0);
      let off2 = -1;
      for (let f = 0; f < 60 * 6 && off2 < 0; f++) { step(1 / 60); if (!onPlant(up, pt) && up.grounded) off2 = f / 60; }
      R('fighting from the platform: it stays, flagged as perching on purpose; the foe gone (out of sight and range) → off in ~1.5 s + the walk and hop',
        stayed > 0.9 && perchN / Math.max(1, onN) > 0.95 && off2 >= 0 && off2 <= 4.2, { onTop: r3(stayed), perched: r3(perchN / Math.max(1, onN)), offAfterFoeGone: off2, left: leftAt >= 0 ? { at: leftAt, why: leftWhy } : null });
      place(fo, W(pt, 0.5, 0.02, 9));
      mount(up);
      hooks.push(() => { up.hp = PLAYER.hp; up.ink = PLAYER.inkMax; });
      step(0.8);
      const wasOn = onPlant(up, pt);
      setClock(pt.wiltAt - 0.9);
      let off3 = -1;
      for (let f = 0; f < 60 * 2.5 && off3 < 0; f++) { step(1 / 60); if (!onPlant(up, pt)) off3 = f / 60; }
      R('the plant about to wilt: a bot fighting from it gets off', wasOn && off3 >= 0 && off3 <= 2.0, { wasOn, offIn: off3, why: up.bot.podS && up.bot.podS.exit && up.bot.podS.exit.why });
      hooks.length = 0; botOff(up); intents.clear(); homeAll(); P.reset(); step(0.3);
    }

    // ---- 15) a route an enemy wall cuts: round it when that's not much longer; else walk up and cut it down, then on
    {
      const pw = byId('gate'), rb = B.find((a) => !a.isLocal);
      grown(pw, 0);
      rb.setWeapon('shooter');
      const S0 = () => rb.bot.podS || (rb.bot.podS = {});
      const routeTo = (goal) => {
        place(rb, new THREE.Vector3(20, 0.02, -19.5)); step(0.3);
        const q1 = nav.nearest(rb.pos, 1.2, true), q2 = nav.nearest(goal, 0.5);
        const blk0 = nav.blocked; nav.blocked = null; rb.bot.path = nav.path(q1, q2, rb.team); nav.blocked = blk0; rb.bot.pi = 1;   // (planned before it grew)
        const crossed = rb.bot.path.some((id) => P.hard[id]);
        const S = S0(); S.gate = null; S.hold = null; S.task = null;
        P._botRoute(rb.bot, S);
        return { crossed, route: S.route, detour: !!rb.bot.path && !rb.bot.path.some((id) => P.hard[id]), gate: !!S.gate };
      };
      const far = routeTo(new THREE.Vector3(20, 0, 10));
      const near = routeTo(new THREE.Vector3(20, 0, -12.2));
      R('a route an enemy wall cuts: round it when the way round is ≤ 1.6 × as long (a far goal); a near goal behind it (the way round ~3 × as long): walk up and cut it down instead',
        far.crossed && far.detour && !far.gate && near.crossed && near.gate && !near.detour, { far, near });
      // …and it does: the bot's brain on, its goal just behind the wall
      const goal = new THREE.Vector3(20, 0.02, -12.2);
      place(rb, new THREE.Vector3(20, 0.02, -20.5)); step(0.2);
      botOn(rb);
      rb.bot._pickPaintGoal = function () { this.goalTimer = 6; this._pathTo(goal, 0.3); };
      hooks.push(() => { rb.hp = PLAYER.hp; });
      let cutT = -1, thruT = -1; const tasks = new Set();
      for (let f = 0; f < 60 * 20 && thruT < 0; f++) {
        step(1 / 60);
        const S = rb.bot.podS; if (S && S.task) tasks.add(S.task);
        if (cutT < 0 && pw.state !== 'stand' && pw.state !== 'grow') cutT = f / 60;
        if (rb.pos.z > -15 && rb.pos.x > 16) thruT = f / 60;
      }
      R('…it walks up to the enemy wall, cuts it down (a Spritzer, ~5 s) and goes on through the gap', tasks.has('cut') && cutT >= 0 && cutT < 12 && thruT >= 0 && pw.cutBy,
        { cutAt: cutT, throughAt: thruT, tasks: [...tasks], cuts: P.stats.cuts, pos: [r3(rb.pos.x), r3(rb.pos.z)] });
      hooks.length = 0; botOff(rb); delete rb.bot._pickPaintGoal; intents.clear(); homeAll(); P.reset(); step(0.3);
    }

    // ---- 16) our own wall sealing a dead-end lane: the bot climbs over it (the gate) and goes on in
    {
      const pl = byId('lane'), rb = A.find((a) => !a.isLocal);
      grown(pl, 0);
      rb.setWeapon('shooter');
      const goalIn = new THREE.Vector3(22, 0.02, -33);
      place(rb, new THREE.Vector3(22, 0.02, -22.8)); step(0.3);
      botOn(rb);
      rb.bot._pickPaintGoal = function () { this.goalTimer = 6; this._pathTo(goalIn, 0.3); };
      hooks.push(() => { rb.hp = PLAYER.hp; });
      let inT = -1, topT = -1, pushed = 0; const tasks = new Set();
      for (let f = 0; f < 60 * 16 && inT < 0; f++) {
        step(1 / 60);
        const S = rb.bot.podS; if (S && S.task) tasks.add(S.task);
        if (topT < 0 && onPlant(rb, pl)) topT = f / 60;
        if (rb.pos.z < pl.z - pl.hd - 0.4 && rb.pos.y < 0.3) inT = f / 60;
        const [lx, lz] = loc(pl, rb.pos); if (Math.abs(lx) < pl.hw && Math.abs(lz) < pl.hd && rb.pos.y < pl.y + pl.h - 0.2 && !rb.climbing) pushed++;
      }
      R('our own wall across a dead-end lane: the bot inks it, swims up, walks over and drops in on the far side (a gate for its owners)', tasks.has('climb') && topT >= 0 && inT >= 0 && pushed === 0,
        { topAt: topT, inAt: inT, tasks: [...tasks], crossings: P.stats.crossings, pushedIn: pushed, pos: [r3(rb.pos.x), r3(rb.pos.y), r3(rb.pos.z)] });
      hooks.length = 0; botOff(rb); delete rb.bot._pickPaintGoal; intents.clear(); homeAll(); P.reset(); step(0.3);
    }

    // ---- 17) bots never climb an enemy plant: an enemy canopy right by a fight
    {
      const pb = byId('mid'), bot = A.find((a) => !a.isLocal), foe = B.find((a) => !a.isLocal);
      grown(pb, 1);
      bot.setWeapon('shooter');
      place(bot, W(pb, 1.9, 0.02, -4.5)); place(foe, W(pb, 1.9, 0.02, 8));
      intents.set(foe, (a) => { a.hp = PLAYER.hp; a.invuln = 1; });
      botOn(bot);
      hooks.push(() => { bot.special = 0; bot.hp = Math.max(bot.hp, PLAYER.hp * 0.9); });
      // (climbing: up this plant's sides — its own canopy, grown near the fight, it may climb: that's allowed)
      let climbTask = 0, onIt = 0, climbing = 0; const cl = [];
      for (let f = 0; f < 60 * 5; f++) {
        step(1 / 60); const S = bot.bot.podS; if (S && (S.task === 'climb' || S.task === 'top') && S.p === pb) climbTask++; if (onPlant(bot, pb)) onIt++;
        const [lx, lz] = loc(pb, bot.pos);
        if (bot.climbing && Math.abs(lx) < pb.hw + 0.8 && Math.abs(lz) < pb.hd + 0.8) { climbing++; if (cl.length < 6) cl.push([f, r3(bot.pos.x), r3(bot.pos.y), r3(bot.pos.z), S && S.task, S && S.p && S.p.id]); }
      }
      R('bots never try to climb an enemy plant (an enemy canopy right beside a fight)', climbTask === 0 && onIt === 0 && climbing === 0, { climbTask, onIt, climbing, cl, plant: [pb.x, pb.z, pb.state] });
      hooks.length = 0; botOff(bot); intents.clear(); homeAll(); P.reset(); step(0.2);
    }
  }

  // ---- Tower Command: plants on the track sit it out; one beside it waits (meter full) while the tower's there
  if (MODE === 'tower') {
    const T = m.tower;
    const onT = ['ontrack', 'ontrack~'].map(byId), by = byId('track');
    R('Tower Command: pods whose plant would stand on the track (the platform\'s sweep + headroom) sit the mode out; the others play', onT.every((p) => p.off === 'track') && P.pods.filter((p) => p.off).length === 2,
      P.pods.map((p) => [p.id, p.off || 'on']));
    T.s = 8 + by.z; T._place(); step(1 / 60);
    fill(by, 0);
    step(0.5);
    const held = { st: by.state, meter: r3(by.meter[0]), held: by.held, towerAt: [r3(T.pos.x), r3(T.pos.z)] };
    T.s = 0; T._place(); step(0.3);
    R('Tower Command: a full pod never grows into the tower (footprint + margin): it waits, meter full, and grows once the tower has gone',
      held.st === 'dormant' && held.meter >= 1 && held.held === 'tower' && by.state !== 'dormant' && by.owner === 0, { whileThere: held, after: by.state });
  }

  // ---- Boss Battle: walls and canopies stop the charge like a wall; walking into one tramples it
  if (MODE === 'boss') {
    const Bs = __G.boss, nv = Bs && Bs.nav, pb = byId('mid'), pw = byId('gate');
    // (the boss parked and still, away from the pods, while they grow: roaming, it would walk into the canopy first)
    const bm0 = Bs.move, bp0 = Bs.pos.clone(); Bs.move = null; Bs.pos.set(0, Bs.pos.y, 34);
    // (the gate's gap is too narrow for the boss's body anyway: its wall is checked as the charge's dynWall asks)
    const before = nv && nv.cast(pb.x, pb.z - 18, 0, 34), wBefore = nv && nv.dynWall && nv.dynWall(pw.x, pw.z - pw.hd - 1.5, 2);
    fill(pb, 0); fill(pw, 1); step(0.8);
    const after = nv && nv.cast(pb.x, pb.z - 18, 0, 34), wAfter = nv && nv.dynWall && nv.dynWall(pw.x, pw.z - pw.hd - 1.5, 2);
    R('Boss Battle: a grown canopy and a grown wall stop HULLBREAKER\'s charge like a wall', !!nv && !!nv.dynWall && pb.state === 'stand' && after.dist < before.dist - 3 && after.wall && !wBefore && wAfter,
      { canopy: { before: before && before.dist, after: after && after.dist, wall: after && after.wall }, gateWall: { before: wBefore, after: wAfter } });
    const bm = bm0;
    const bp = bp0, by0 = Bs.yaw;
    Bs.pos.set(pb.x, Bs.pos.y, pb.z - 3.2); Bs.yaw = 0;
    P.bossStep();
    const tr = pb.wiltAt <= now() + 1e-3;
    Bs.pos.copy(bp); Bs.yaw = by0; Bs.move = bm;
    step(1.2);
    R('Boss Battle: HULLBREAKER walking into a plant tramples it (it wilts)', tr && (pb.state === 'wilt' || pb.state === 'recharge') && !pb.cutBy, { trampled: tr, state: pb.state, stat: P.stats.trampled });
  }
  R('state() snapshot', !!P.state(), P.state());
  return out;
})()
