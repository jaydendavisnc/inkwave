// Bot wall climbs (src/game/bots.js _climb, nav climb edges) on Lockgate's drained lock chambers: a staged Alpha bot
// (brain running as in a match, everyone else parked) at the foot of the chamber stair, heading off the chamber floor.
//   MAP=lockgate MODE=turf PAGE=tools/botlab/tests/bot-climb.js tools/botlab/run.sh tools/botlab/page.cjs
// The chamber (x 16.5…24.5, z 9.25…14.75, floor −1.9): one broad stair rises east from x 16.65 to the upper gate walk
// (1.3), split into three flights by handrails (z 11.08, 12.92); its side walls (2.8 m: the wharf, the lock side) are
// inkable, so the nav graph also has climb edges up them from the stair's foot. Checks:
//   - the nav graph: a node row up each of the three flights (the middle one used to have none: the 1 m grid's rows
//     land 0.37 m from its handrails), and no walk edge spanning a wall
//   - costs: from the foot, a tall climb loses to the stair when the stair is only a little longer (and short climbs,
//     e.g. the 1.3 m loading bank, stay a shortcut)
//   - with ink (weapon by weapon): off the floor within ~3 s, by the stair or a climb, never standing at the wall
//   - with 0 ink (refilling): off by the stair — no climb in its route, never waiting at the wall
//   - from the middle flight: off within ~3 s
//   - a climb that can't make headway is given up within ~2 s and the route goes round (the wall un-inkable to it)
//   - forced climbs (info): how long each weapon really takes up the 2.8 m wall, and the ink it spends
// PAGE_ARGS='only=ink,forced': just those parts (keys: nav costs ink dry middle stall forced)
(async () => {
  const g = window.__inkwave, m = g.match, dbg = g.debug, G = __G, nav = G.nav;
  const { PLAYER } = await import('./src/config.js');
  const BM = await import('./src/game/bots.js');
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info: info === undefined ? undefined : JSON.parse(JSON.stringify(info)) });
  if (!G.level || g.mapDef?.id !== 'lockgate') { R('runs on lockgate (MAP=lockgate)', false, g.mapDef?.id); return out; }
  const ONLY = (/only=([\w,]+)/.exec(window.__pageArgs || '') || [])[1];
  const want = (k) => !ONLY || ONLY.split(',').includes(k);
  dbg.freeze();
  const V3 = m.actors[0].pos.constructor;
  const frame = () => { g._skipRender = true; g._frame(1 / 60); g._skipRender = false; };
  const r2 = (v) => Math.round(v * 100) / 100;
  const nd = (id) => { const n = nav.nodes[id]; return [n.x, r2(n.y), n.z]; };
  const idle = () => {};
  const A = m.actors.filter((a) => a.team === 0 && a.bot && !a.isLocal);
  const bot = A[0];
  const pathClimbs = (p) => { let k = 0; if (p) for (let i = 1; i < p.length; i++) if (nav.edge(p[i - 1], p[i])?.type === 'climb') k++; return k; };
  const fromTo = (a, b, rule = false) => { const s = nav.nearest(new V3(...a), 1.2, true), t = nav.nearest(new V3(...b), 0.8); return nav.path(s, t, 0, undefined, rule); };
  const cost = (p) => { let c = 0; for (let i = 1; i < p.length; i++) c += nav.edge(p[i - 1], p[i]).cost; return c; };

  // ---- the nav graph in the chamber (the one at +x +z; the other is its mirror)
  if (want('nav')) {
    const flight = (sg, z0, z1) => nav.nodes.filter((n) => sg * n.x > 16.6 && sg * n.x < 24 && sg * n.z > z0 && sg * n.z < z1 && n.y < 1.2 && n.y > -1.95);
    const flights = [flight(1, 9.25, 11.08), flight(1, 11.08, 12.92), flight(1, 12.92, 14.75)], mirrorMiddle = flight(-1, 11.08, 12.92).length;
    let spans = 0;
    for (const n of nav.nodes) for (const e of n.nb) if (e.type === 'walk' && Math.abs(nav.nodes[e.to].y - n.y) > 0.55) spans++;
    R('nav: a node row up each of the chamber stair\'s three flights (the middle one between the handrails too), both chambers; no walk edge spans a wall',
      flights.every((f) => f.length >= 6) && mirrorMiddle >= 6 && spans === 0,
      { flights: flights.map((f) => f.length), middleZ: [...new Set(flights[1].map((n) => n.z))], mirrorMiddle, wallSpanningWalks: spans });
  }

  // ---- costs: from the foot of a flight, the stair vs the climb up the chamber's side wall (2.8 m); the loading bank
  // (1.3 m) by the lock
  if (want('costs')) {
    const S = [17.5, -1.52, 10.5], N = [17.5, -1.52, 13.5];
    const cases = [
      // [from, goal, what it should take, why]
      ['north flight → Alpha spawn', N, [4, 2.4, -63.9], 'stair'],        // (the stair's ~11 m longer on foot: a tall climb isn't worth it)
      ['south flight → the wharf 3 m south', S, [17.5, 1.3, 6.5], 'climb'],   // (the stair's a 21 m walk round)
      ['south flight → far south (17.5, 0.4, -20.5)', S, [17.5, 0.39, -20.5], null],   // (info: ~16 m longer by the stair)
      ['south flight → Alpha spawn', S, [4, 2.4, -63.9], null],
      ['loading bank foot → the bank 7 m on', [13.5, 0, -2.5], [20, 1.3, -1], 'climb'],   // (1.3 m: a shortcut)
    ];
    const rows = {}; let ok = true;
    for (const [k, from, gp, wantR] of cases) {
      const p = fromTo(from, gp), q = fromTo(from, gp, true), r = pathClimbs(p) ? 'climb' : 'stair';
      let walk = 0; for (let i = 1; i < p.length; i++) { const e = nav.edge(p[i - 1], p[i]); if (e.type !== 'climb') walk += e.cost; }
      rows[k] = { route: r, cost: r2(cost(p)), stairOnly: r2(cost(q)), extraWalkByStair: r2(cost(q) - walk) };
      if (wantR && r !== wantR) ok = false;
    }
    const e = nav.nodes[nav.nearest(new V3(...S), 1.2, true)].nb.find((x) => x.type === 'climb');
    const lb = nav.nodes[nav.nearest(new V3(13.5, 0, -2.5), 1.2, true)].nb.find((x) => x.type === 'climb');
    R('costs: a tall climb costs about what it takes (~2 s: ~13 m of running), so from the chamber floor a bot takes the stair when that\'s only a little longer on foot; the 1.3 m loading bank stays a shortcut',
      ok && e.cost > 11 && e.cost < 16 && lb.cost < 8,
      { rows, sideWall: { rise: r2(e.rise), cost: r2(e.cost) }, loadingBank: { rise: r2(lb.rise), cost: r2(lb.cost) } });
  }

  // ---- scenes: the bot at a spot on the chamber floor, going for a goal off it; everyone else parked, brains off
  const scene = (weapon, at, goal, opts = {}) => {
    G.specials.clear(); G.projectiles.clear(); G.subs.clear(); G.paint.clear();
    m.time = Math.max(m.time, 170);
    m.actors.forEach((a, i) => {
      if (!a.alive) a.respawn();
      a.hp = PLAYER.hp; a.invuln = 0; a.ink = PLAYER.inkMax; a.special = 0; a.superJumpState = null; a.climbing = false; a.form = 'kid'; a.vel.set(0, 0, 0);
      a.intent.move.set(0, 0, 0); a.intent.fire = a.intent.squid = a.intent.sub = a.intent.jump = a.intent.special = false;
      if (a === bot) return;
      if (a.bot) a.bot.update = idle;
      const pd = G.level.spawnPads[a.team]; a.pos.set(pd.x - 3 + (i % 4) * 2, pd.y + 0.05, pd.z); a.grounded = false;
    });
    const b = bot.bot;
    delete b.update; delete b._pickPaintGoal; delete b._pathTo; delete b._forcedOnce;
    bot.setWeapon(weapon);
    b.reset(); b._wasDead = false; b.setDifficulty('normal');
    bot.pos.set(...at); bot.vel.set(0, 0, 0); bot.grounded = false;
    const yaw = opts.yaw ?? Math.PI; bot.yaw = bot.aimYaw = yaw; b.aimYaw = b.mvYaw = yaw;
    bot.ink = opts.ink ?? PLAYER.inkMax;
    // (a paint bot keeps to this goal: re-planned there whenever it re-picks)
    const gv = new V3(...goal);
    b._pickPaintGoal = function () { this.goalTimer = 99; this._pathTo(gv, 0.4); };
    if (opts.forced) {
      // a fixed route (tests the climb itself, whatever the costs say): start → top → the next node on top
      const route = opts.forced;
      b._pathTo = function () { this.path = route.slice(); this.pi = 1; this.goal = route[route.length - 1]; this.bestD = Infinity; this.noProg = 0; this.repath = 99; return true; };
    }
    b.mode = 'paint'; b.goalTimer = 0;
    for (let i = 0; i < 3; i++) frame();
    bot.ink = opts.ink ?? PLAYER.inkMax;
  };
  // run until the bot's up at the chamber's rim (1.0+, standing) or `secs` pass; what it did on the way
  const run = (secs, opts = {}) => {
    const b = bot.bot, S = { t: null, climbed: false, wallT: 0, climbInRoute: 0, ink0: bot.ink, inkUsed: 0, giveups: 0, modes: {} };
    const st0 = { ...BM.CLIMB_STATS };
    let lastInk = bot.ink;
    for (let f = 0; f < secs * 60; f++) {
      frame();
      if (bot.ink < lastInk) S.inkUsed += lastInk - bot.ink;
      lastInk = bot.ink;
      if (opts.ink0) { /* (a dry bot: its tank refills on the way as a kid's does) */ }
      if (bot.climbing) S.climbed = true;
      if (b._clE) S.wallT += 1 / 60;
      if (pathClimbs(b.path)) S.climbInRoute++;
      S.modes[b.mode] = (S.modes[b.mode] || 0) + 1;
      if (bot.grounded && bot.pos.y > 1.0) { S.t = r2((f + 1) / 60); break; }
    }
    for (const k in BM.CLIMB_STATS) S[k] = BM.CLIMB_STATS[k] - st0[k];
    S.wallT = r2(S.wallT); S.inkUsed = Math.round(S.inkUsed); S.at = [r2(bot.pos.x), r2(bot.pos.y), r2(bot.pos.z)];
    S.route = S.climbed ? 'climb' : S.t !== null ? 'stair' : '-';
    S.climbInRoute = r2(S.climbInRoute / 60);
    S.modes = Object.fromEntries(Object.entries(S.modes).map(([k, v]) => [k, r2(v / 60)]));
    return S;
  };
  const WEAPONS = ['shooter', 'roller', 'charger', 'blaster', 'bucket', 'spinner', 'twins', 'brush', 'brolly', 'bow', 'blade', 'mitts', 'dualies', 'slosher', 'splatling'];
  const FAR = [17.5, 0.39, -20.5];

  // ---- with ink: off the floor within ~3 s (stair or climb), from the foot of the south flight and from its corner
  if (want('ink')) {
    const rows = {}, ts = []; let ok = true;
    for (const w of WEAPONS) for (const [k, at] of [['foot', [17.5, -1.5, 10.5]], ['corner', [16.95, -1.75, 9.65]]]) {
      scene(w, at, FAR);
      const S = run(8);
      rows[w + ' ' + k] = S.t + 's ' + S.route + (S.wallT ? ' wall ' + S.wallT + 's' : '') + (S.stalled || S.dry ? ' gave up ' + (S.stalled + S.dry) : '');
      ts.push(S.t ?? 99);
      if (S.t === null || S.t > 3.8) ok = false;
    }
    ts.sort((x, y) => x - y);
    const med = ts[ts.length >> 1];
    R('with ink, weapon by weapon (all 15 mains): off the chamber floor within ~3 s (median ≤ 3 s, none over 3.8 s) — the stair or a climb — from the south flight\'s foot and its corner',
      ok && med <= 3, { median: med, max: ts[ts.length - 1], rows });
  }
  // ---- 0 ink: refilling, it plans round climbs → the stair, never at the wall
  if (want('dry')) {
    const rows = {}; let ok = true;
    for (const w of ['shooter', 'roller', 'blade', 'charger', 'mitts']) for (const [k, at, goal] of [['foot → far', [17.5, -1.5, 10.5], FAR], ['corner → wharf', [16.95, -1.75, 9.65], [17.5, 1.3, 6.5]]]) {
      scene(w, at, goal, { ink: 0 });
      const S = run(8, { ink0: true });
      rows[w + ' ' + k] = { t: S.t, route: S.route, wallT: S.wallT, climbInRoute: S.climbInRoute, modes: S.modes };
      if (S.t === null || S.t > 4 || S.climbed || S.wallT > 0 || S.climbInRoute > 0) ok = false;
    }
    R('0 ink (refilling): off the chamber floor by the stair — no climb in its route, never waiting at the wall', ok, rows);
  }
  // ---- the middle flight (between the handrails): off within ~3 s
  if (want('middle')) {
    const rows = {}; let ok = true;
    for (const w of ['shooter', 'roller', 'charger']) {
      scene(w, [17.3, -1.6, 12.0], FAR);
      const S = run(8);
      rows[w] = S.t + 's ' + S.route;
      if (S.t === null || S.t > 3.2) ok = false;
    }
    R('from the middle flight (between the handrails): off the chamber floor within ~3 s', ok, rows);
  }
  // ---- a climb that makes no headway (its wall won't take our ink: every shot's paint wiped as it lands) is given up
  // within ~2 s, and the route goes round (climbs planned round for a while)
  if (want('stall')) {
    const foot = nav.nearest(new V3(17.5, -1.52, 10.5), 1.2, true), e = nav.nodes[foot].nb.find((x) => x.type === 'climb');
    const P = G.paint, splat0 = P.splat;
    P.splat = function (c, r, team, o) { if (c.z < 9.7 && c.x > 16 && c.x < 19 && c.y > -2.5) return; return splat0.call(this, c, r, team, o); };
    let S;
    try {
      scene('shooter', [17.5, -1.5, 10.5], FAR, { forced: null });
      const b = bot.bot;
      b._pickPaintGoal = function () {   // the climb route first; once it's given up, the normal plan (round it)
        this.goalTimer = 99;
        if (!this._forcedOnce) { this._forcedOnce = true; this.path = [foot, e.to, ...nav.nodes[e.to].nb.filter((x) => x.type === 'walk').slice(0, 1).map((x) => x.to)]; this.pi = 1; this.goal = this.path[this.path.length - 1]; this.bestD = Infinity; this.noProg = 0; return; }
        this._pathTo(new V3(...FAR), 0.4);
      };
      b.goalTimer = 0; b.path = null;
      S = run(8);
    } finally { P.splat = splat0; }
    const b = bot.bot;
    R('a climb with no headway (its wall wiped of our ink) is given up within ~2 s, then the route goes round by the stair',
      S.stalled >= 1 && S.wallT < 2.3 && S.t !== null && S.t < 6 && !S.climbed && b.noClimbUntil > b.t, S);
  }
  // ---- forced climbs: weapon by weapon, up three walls — the chamber's side wall from the stair's foot (2.8 m) and
  // from a step up it (1.9 m), and the loading bank by the lock (1.3 m): seconds to the top and the ink it takes.
  // Every main gets up every wall its kind plans (CLIMB.reach: the brush's swipes don't reach 2.8 m; a roller's flick
  // flies over a wall as low as 1.3 m)
  if (want('forced')) {
    const walls = [['tall', [17.5, -1.52, 10.5]], ['mid', [19.5, -0.64, 10.5]], ['short', [13.5, 0.05, -2.5]]].map(([k, at]) => {
      const foot = nav.nearest(new V3(...at), 1.2, true), e = nav.nodes[foot].nb.find((x) => x.type === 'climb');
      return { k, at, foot, e, next: nav.nodes[e.to].nb.find((x) => x.type === 'walk').to };
    });
    const rows = {}, bad = [];
    for (const w of WEAPONS) {
      const row = rows[w] = {};
      for (const W of walls) {
        scene(w, W.at, nd(W.next), { forced: [W.foot, W.e.to, W.next] });
        const S = run(8), reach = BM.CLIMB.reach[bot.weapon.kind], plans = !reach || ((reach.max ?? 99) >= W.e.rise && (reach.min ?? 0) <= W.e.rise);
        row[W.k] = (S.t ?? '-') + 's ' + S.inkUsed + 'ink' + (plans ? '' : ' (not planned)');
        if (plans && (S.t === null || S.t > 4)) bad.push(w + ' ' + W.k);
      }
    }
    R('forced climbs, weapon by weapon (seconds to the top, ink spent): every main up every wall its kind plans within 4 s — the chamber side wall (' + r2(walls[0].e.rise) + ' m), a step up the stair (' + r2(walls[1].e.rise) + ' m), the loading bank (' + r2(walls[2].e.rise) + ' m)',
      bad.length === 0, { bad, rows });
  }
  return out;
})()
