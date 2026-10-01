// Bots vs enemy specials (src/game/botSpecials.js): staged scenes on testbox, each with an enemy using a special (or
// its world object put where it matters) next to Alpha bots whose brains run as in a match. Most scenes run twice —
// the awareness on, then off (SPECIAL_AI.enabled = false: the old behaviour, same code) — and check the difference:
// they leave lethal areas before impact, don't route into a lingering one, back off from and don't shoot the
// untouchable (and re-engage when it's over), shoot what can be shot, and never react to a special they can't know.
//   MAP=testbox MODE=turf PAGE=tools/botlab/tests/bot-specials.js tools/botlab/run.sh tools/botlab/page.cjs
//   MAP=testbox MODE=tower PAGE=…   (the tower rider: takes a Tempest's rain on the deck, leaves a Vortex Strike)
// testbox: a flat deck (top y 0, x −28…28, z −40…40, the sea beyond x ±28) with 4 m walls at x 14…15 and −15…−14,
// z −8…8. Everyone not in a scene is parked far off with an idle brain. Where the old behaviour must stay put for the
// check to mean something, the bots are in a fight with a tough dummy (hp 1e6): chargers plant to charge at ~19 m;
// rollers close in; shooters hold their distance.
(async () => {
  const g = window.__inkwave, m = g.match, dbg = g.debug, G = __G;
  const SP = await import('./src/game/botSpecials.js');
  const { SPECIALS, PLAYER } = await import('./src/config.js');
  const { on, angleDiff } = await import('./src/core/ctx.js');
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info: info === undefined ? undefined : JSON.parse(JSON.stringify(info)) });
  dbg.freeze();
  const V3 = m.actors[0].pos.constructor;
  const frame = () => { g._skipRender = true; g._frame(1 / 60); g._skipRender = false; };
  const step = (s, fn) => { const n = Math.max(1, Math.round(s * 60)); for (let i = 0; i < n; i++) { frame(); if (fn && fn(i / 60) === false) return; } };
  const A = m.actors.filter((a) => a.team === 0 && a.bot && !a.isLocal), B = m.actors.filter((a) => a.team === 1);
  const idle = () => {};
  const flat = (p, x, z) => Math.hypot(p.x - x, p.z - z);
  const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
  const place = (a, x, z, y = 0.05) => { a.pos.set(x, y, z); a.vel.set(0, 0, 0); a.grounded = false; };
  const face = (a, x, z) => { const y = Math.atan2(x - a.pos.x, z - a.pos.z); a.yaw = a.aimYaw = y; a.aimPitch = 0; if (a.bot) { a.bot.aimYaw = y; a.bot.mvYaw = y; a.bot.aimPitch = 0; } };
  const tank = (e) => { e.hp = 1e6; };   // (a dummy that can be hurt but never goes down)
  const TOWER = m.mode === 'tower';
  // PAGE_ARGS='only=slam,crab': just those scenes (keys: slam bomb strike wail orb storm zooka kraken bubbler crab stamp blower jet sight tower)
  // (Tower Command: the tower's roles take over the staged bots, so there only the tower scene runs unless asked)
  const ONLY = (/only=([\w,]+)/.exec(window.__pageArgs || '') || [])[1] || (TOWER ? 'tower' : null);
  const want = (k) => !ONLY || ONLY.split(',').includes(k);
  // a fresh scene: world and ink cleared, everyone healed and parked; `live` Alpha bots run their brains
  const scene = (ai, live, foes, opts = {}) => {
    G.specials.clear(); G.projectiles.clear(); G.subs.clear(); G.paint.clear();
    SP.SPECIAL_AI.enabled = ai; SP.SPECIAL_AI.teams = null; SP.resetSpecialStats();
    m.time = 170;
    m.actors.forEach((a, i) => {
      if (!a.alive) a.respawn();
      if (a.specialActive) { try { G.specials.end(a, 'test'); } catch (e) { /* */ } a.specialActive = null; }
      a.reset();   // (every timer too — how long since it was hit, fired, landed …: nothing carried over from the last scene)
      a.status.shield = 0; a.status.track = 0; a.status.reveal = 0; a.hp = PLAYER.hp; a.invuln = 0; a.ink = PLAYER.inkMax; a.special = 0;
      a.intent.move.set(0, 0, 0); a.intent.fire = a.intent.squid = a.intent.sub = a.intent.jump = a.intent.special = false;
      a.form = 'kid'; a.vel.set(0, 0, 0); a.superJumpState = null; a.climbing = false;
      if (a.bot) { a.bot.reset(); a.bot._wasDead = false; a.bot.setDifficulty(opts.diff || 'normal'); if (live.includes(a)) delete a.bot.update; else a.bot.update = idle; }
      if (live.includes(a)) a.setWeapon(opts.weapon || 'shooter');
      else if (foes.includes(a)) a.setWeapon(opts.foeWeapon || 'shooter');
      else place(a, -24 + (i % 8) * 6, a.team ? 37 : -37);
    });
  };
  const settle = (xs, s = 0.5) => { step(s); xs.forEach((a) => { a.hp = PLAYER.hp; a.invuln = 0; a.ink = PLAYER.inkMax; }); };
  const start = (e, id) => { e.specialId = id; e.special = e.specialCost(); e._startSpecial(); return e.specialActive; };
  // aim an idle enemy at a point (its shots / throws follow aimYaw / aimPitch / aimPoint)
  const aimAt = (e, x, y, z) => { const dx = x - e.pos.x, dz = z - e.pos.z; e.yaw = e.aimYaw = Math.atan2(dx, dz); e.aimPitch = Math.atan2(y - (e.pos.y + 1.1), Math.hypot(dx, dz)); e.aimPoint.set(x, y, z); };
  // the aim pitch that lobs something thrown at `speed` (weapons.js throwVelocity, gravity g, from 1.35 m) onto (x, z)
  const lob = (e, x, z, speed, grav, from = 1.35) => {
    const d = Math.hypot(x - e.pos.x, z - e.pos.z); let best = 0, be = 1e9;
    for (let p = -0.6; p <= 0.8; p += 0.01) {
      const tp = Math.min(1.1, Math.max(-0.3, p + 0.28)), vx = Math.cos(tp) * speed, vy = Math.sin(tp) * speed + 1.5, disc = vy * vy + 2 * grav * from;
      const err = Math.abs((vx * (vy + Math.sqrt(disc))) / grav - d);
      if (err < be) { be = err; best = p; }
    }
    e.yaw = e.aimYaw = Math.atan2(x - e.pos.x, z - e.pos.z); e.aimPitch = best;
  };
  const dead = (xs) => xs.filter((a) => !a.alive).length;
  // Alpha chargers planted in a fight with a dummy 19 m off (they hold still while they charge)
  const chargers = (ours, spots, E2, e2x, e2z) => { place(E2, e2x, e2z); tank(E2); spots.forEach((s, i) => { place(ours[i], s[0], s[1]); face(ours[i], e2x, e2z); }); };

  // ================================================================ 1) Tidal Slam: out of the kill ring before it lands
  const slam = (ai, diff = 'normal') => {
    const E = B[0], ours = A.slice(0, 3);
    scene(ai, ours, [E], { weapon: 'roller', diff });
    place(E, 0, -10); tank(E);
    place(ours[0], 1.6, -10); place(ours[1], -1.4, -8.6); place(ours[2], 0.4, -12.4);
    ours.forEach((a) => face(a, 0, -10));
    settle(ours, 0.4); tank(E);
    let at = null;
    const off = on('special:slam', (e) => { if (e.actor === E && !at) at = ours.map((a) => r1(Math.hypot(a.pos.x - e.pos.x, a.pos.y - e.pos.y, a.pos.z - e.pos.z))); });
    start(E, 'slam');
    step(1.6);
    off();
    return { at, dead: dead(ours), st: { ...SP.SPECIAL_STATS } };
  };
  if (want('slam')) {
    // (3 scenes of each: brawling right under the jumper leaves ~0.8 s to cover 3.2 m after noticing it — a hard bot is
    // caught ~1 time in 30 (a late look, a teammate in the way), a normal one ~1 in 3; the old behaviour, every time.
    // One scene's "all 3 hard bots out" was missed ~1 run in 8 by that chance alone. Caught: splatted by it — a bot at
    // 3.2 m on the rounded distance may be just clear of it)
    const hs = [0, 1, 2].map(() => slam(true, 'hard')), ns = [0, 1, 2].map(() => slam(true, 'normal')), b = slam(false);
    const hc = hs.reduce((t, x) => t + x.dead, 0), nc = ns.reduce((t, x) => t + x.dead, 0);
    R('Tidal Slam: rollers brawling the jumper get out of its kill ring (3.2 m) before it lands — hard bots nearly all (at most 2 of 9 caught over 3 scenes), normal bots (slower to react) fewer (at most 6 of 9, and no fewer caught than hard ones); the old behaviour loses them all',
      hc <= 2 && nc <= 6 && hc <= nc && b.dead >= 2,
      { hard: { caught: hc, scenes: hs.map((x) => ({ distAtImpact: x.at, dead: x.dead, hops: x.st.hops })) }, normal: { caught: nc, scenes: ns.map((x) => ({ distAtImpact: x.at, dead: x.dead })) }, off: { distAtImpact: b.at, dead: b.dead } });
  }

  // ================================================================ 2) Bomb Barrage: bombs armed at their feet
  const bomb = (ai, weapon = 'shooter', round = 0) => {
    const E = B[0], E2 = B[1], ours = A.slice(0, 3);
    scene(ai, ours, [E, E2], { weapon });
    if (weapon === 'charger') chargers(ours, [[-6, -8], [0, -8], [6, -8]], E2, 0, 11);
    else { place(E2, round * 2, 2); tank(E2); [[-5, -6], [0, -7], [5, -6]].forEach((p, i) => { place(ours[i], p[0] + round, p[1]); face(ours[i], round * 2, 2); }); }
    place(E, -16, -20); tank(E);
    settle(ours, 1.0); tank(E2);
    start(E, 'barrage');
    const hp0 = ours.map((a) => a.hp);
    for (const a of ours) {
      G.projectiles.throwBomb(E);
      const b = G.projectiles.bombs[G.projectiles.bombs.length - 1];
      b.pos.set(a.pos.x + 0.4, a.pos.y + 0.25, a.pos.z + 0.3); b.vel.set(0, 0, 0); b.fuse = 0.95;
    }
    step(1.3);
    return { dead: dead(ours), dmg: ours.map((a, i) => (a.alive ? r1(hp0[i] - a.hp) : 'dead')), st: { ...SP.SPECIAL_STATS } };
  };
  if (want('bomb')) {
    const a = [0, 1, 2].map((k) => bomb(true, 'shooter', k)), b = [0, 1, 2].map((k) => bomb(false, 'shooter', k)), c = bomb(true, 'charger'), c0 = bomb(false, 'charger');
    const sum = (xs) => xs.reduce((t, x) => t + x.dmg.reduce((u, v) => u + (v === 'dead' ? 100 : v), 0), 0), dd = (xs) => xs.reduce((t, x) => t + x.dead, 0);
    const da = dd(a), db = dd(b), sa = sum(a), sb = sum(b);
    R('Bomb Barrage: a Splat Bomb armed at the feet of chargers mid-charge (slow on their feet: a squid hop out) — on: at most one caught; off: splatted; shooters mid-duel (3 × 3: the old behaviour dodges some by strafing luck) no worse',
      c.dead <= 1 && c0.dead >= 2 && c.dead < c0.dead && da <= db, { on: { dead: da, dmgTotal: r1(sa), escapes: a.reduce((t, x) => t + x.st.escapes, 0), evaded: a.reduce((t, x) => t + x.st.evaded, 0) }, off: { dead: db, dmgTotal: r1(sb) },
        chargers: { on: { dead: c.dead, dmg: c.dmg }, off: { dead: c0.dead, dmg: c0.dmg } } });
  }

  // ================================================================ 3) Vortex Strike: out of the ring before the missile lands; routes round the vortex
  const strike = (ai) => {
    const E = B[0], E2 = B[1], ours = A.slice(0, 3), c = [0, -12];
    scene(ai, ours, [E, E2], { weapon: 'charger' });
    chargers(ours, [[c[0] + 1, c[1]], [c[0] - 2.5, c[1] + 1.5], [c[0] + 1.5, c[1] - 3]], E2, 0, 7.5);
    place(E, 0, 32); tank(E);
    settle(ours, 1.0); tank(E2);
    const s = start(E, 'strike');
    s.autoT = 0.05; s.target.set(c[0], 0, c[1]);
    let impact = null, inRing = null;
    const off = on('special:strike', (e) => { impact = e.pos.clone(); inRing = ours.filter((a) => flat(a.pos, e.pos.x, e.pos.z) < SPECIALS.strike.radius).length; });
    step(2.7);
    off();
    // the vortex stands: a route from one side of it to the other goes round it, and walking it never steps in
    const X = ours[0];
    let through = -1, walkIn = 0;
    if (impact) {
      ours.forEach((a) => { if (a !== X) place(a, 20, 30); });
      place(E2, 22, -30);
      place(X, -12, impact.z); X.hp = PLAYER.hp; step(0.3);
      X.bot.goalTimer = 99; X.bot._pathTo(new V3(12, 0, impact.z), 0.3);
      through = X.bot.path ? X.bot.path.filter((id) => flat(G.nav.nodes[id], impact.x, impact.z) < SPECIALS.strike.radius).length : -1;
      step(2, () => { if (flat(X.pos, impact.x, impact.z) < SPECIALS.strike.radius - 0.3) walkIn++; });
    }
    return { inRing, dead: dead(ours), through, walkIn, st: { ...SP.SPECIAL_STATS } };
  };
  if (want('strike')) {
    // (off, 3 scenes: a charger planted in a duel stays under the ring ~4 times in 5 — the odd one steps out by chance,
    // so one scene's "2 of 3 stay" was missed now and then)
    const as = [strike(true), strike(true)], bs = [strike(false), strike(false), strike(false)], a = as[0], b = bs[0];
    const onIn = as.reduce((t, x) => t + x.inRing, 0), offIn = bs.reduce((t, x) => t + x.inRing, 0);
    R('Vortex Strike: chargers in a fight under the ring are out of it when the missile lands — on: none in it (2 scenes); off: many stay (at least 4 of 9 over 3 scenes)',
      as.every((x) => x.inRing === 0) && offIn >= 4, { on: { inRing: onIn, dead: as.reduce((t, x) => t + x.dead, 0), escapes: a.st.escapes, evaded: a.st.evaded }, off: { inRing: offIn, perScene: bs.map((x) => x.inRing), dead: bs.reduce((t, x) => t + x.dead, 0) } });
    R('Vortex Strike: a route past the standing vortex goes round it and the bot never walks in (off: straight through)',
      a.through === 0 && a.walkIn === 0 && b.through > 0, { on: { nodesInside: a.through, framesInside: a.walkIn }, off: { nodesInside: b.through } });
  }

  // ================================================================ 4) Howl Box: out of the beam's line during its charge
  const wail = (ai) => {
    const E = B[0], E2 = B[1], ours = A.slice(0, 3);
    scene(ai, ours, [E, E2], { weapon: 'charger' });
    chargers(ours, [[-4, -14], [-4, -8], [-4, -2]], E2, 15.5, -8);
    place(E, -4, 16); tank(E);
    settle(ours, 1.0); tank(E2);
    aimAt(E, -4, 1, -20);
    start(E, 'wail');
    let inBeam = null;
    step(3.5, () => {
      aimAt(E, -4, 1, -20);
      const sk = G.specials.world.find((w) => w.kind === 'speaker');
      if (sk && sk.phase === 'blast' && inBeam === null) inBeam = ours.filter((a) => Math.abs(a.pos.x - sk.mouth.x) < SPECIALS.wail.radius + 0.45).length;
    });
    return { inBeam, dead: dead(ours), st: { ...SP.SPECIAL_STATS } };
  };
  if (want('wail')) {
    const a = wail(true), b = wail(false);
    R('Howl Box: chargers standing in the beam\'s line step out of it during the 1.3 s charge — on: none in it (none splatted); off: splatted',
      a.inBeam === 0 && a.dead === 0 && b.dead >= 1, { on: { inBeam: a.inBeam, dead: a.dead, escapes: a.st.escapes }, off: { inBeam: b.inBeam, dead: b.dead } });
  }

  // ================================================================ 5) Cheer Orb: clear of its blast (or behind cover) before it goes off
  const orb = (ai) => {
    const E = B[0], E2 = B[1], ours = A.slice(0, 3), c = [-4, -12];
    scene(ai, ours, [E, E2], { weapon: 'charger' });
    chargers(ours, [[c[0] - 1.5, c[1]], [c[0] + 1.5, c[1] + 1], [c[0] + 0.5, c[1] - 1.8]], E2, 15, -12);
    place(E, c[0] - 12, c[1] + 1); tank(E);
    settle(ours, 1.0); tank(E2);
    const s = start(E, 'booyah');
    s.charge = 1;
    lob(E, c[0], c[1], SPECIALS.booyah.throwSpeed, 24);
    step(0.1); E.intent.fire = true; step(1 / 60); E.intent.fire = false;
    let at = null;
    const off = on('special:slam', (e) => { if (e.actor === E && !at) at = ours.map((a) => ({ d: r1(flat(a.pos, e.pos.x, e.pos.z)), los: G.physics.los(new V3(e.pos.x, e.pos.y + 0.35, e.pos.z), new V3(a.pos.x, a.pos.y + 0.8, a.pos.z)) })); });
    step(3);
    off();
    return { at, dead: dead(ours), st: { ...SP.SPECIAL_STATS } };
  };
  if (want('orb')) {
    const a = orb(true), b = orb(false);
    R('Cheer Orb: chargers where the orb comes down are clear of its 8.4 m blast when it goes off — on: none splatted; off: splatted',
      a.dead === 0 && a.at && b.dead >= 2, { on: { atBlast: a.at, dead: a.dead, escapes: a.st.escapes }, off: { atBlast: b.at, dead: b.dead } });
  }

  // ================================================================ 6) Ink Tempest: out from under the rain (turf: nobody stays in it)
  const storm = (ai) => {
    const E = B[0], E2 = B[1], ours = A.slice(0, 3), c = [-4, -12];
    scene(ai, ours, [E, E2], { weapon: 'charger' });
    chargers(ours, [[c[0] - 1, c[1]], [c[0] + 1.5, c[1] + 0.5], [c[0], c[1] - 1.5]], E2, 15, -12);
    place(E, c[0] - 12, c[1] - 1); tank(E);
    settle(ours, 1.0); tank(E2);
    face(E, c[0], c[1]);
    start(E, 'storm');
    // (the thrown cloud-bomb: 2 m short of them, about to burst — its cloud drifts east over them)
    { const sb = G.projectiles.bombs.find((q) => q.kind === 'storm'); if (sb) { sb.pos.set(c[0] - 2, 3, c[1]); sb.vel.set(0, 0, 0); sb.age = 1.08; sb.dir.set(1, 0, 0); } }
    let inRain = 0, formed = 0;
    step(5, () => {
      const cl = G.projectiles.clouds[0];
      if (!cl || cl.t < 0.6) return;
      formed += 1 / 60;
      for (const a of ours) if (a.alive && flat(a.pos, cl.group.position.x, cl.group.position.z) < SPECIALS.storm.radius) inRain += 1 / 60;
    });
    return { inRain: inRain / 3, formed: r1(formed), dmg: ours.map((a) => (a.alive ? r1(PLAYER.hp - a.hp) : 'dead')), st: { ...SP.SPECIAL_STATS } };
  };
  if (want('storm')) {
    // (3 scenes on, 2 off: a bot's time in the rain runs 0–1.5 s on, 0–2.8 off — one scene's average sat right on the bar)
    const as = [storm(true), storm(true), storm(true)], bs = [storm(false), storm(false)];
    const avg = (xs) => xs.reduce((t, x) => t + x.inRain, 0) / xs.length, on = avg(as), off = avg(bs);
    R('Ink Tempest: chargers under the cloud leave the rain (a light area: nobody in Turf War takes it) — on: under 0.8 s each in it on average (3 scenes); off: a second or more (2 scenes)',
      as.every((a) => a.formed > 2) && on < 0.8 && off >= 1.0,
      { on: { sInRainEach: r2(on), scenes: as.map((a) => ({ sInRainEach: r1(a.inRain), dmg: a.dmg, escapes: a.st.escapes })) }, off: { sInRainEach: r2(off), scenes: bs.map((b) => ({ sInRainEach: r1(b.inRain), dmg: b.dmg })) }, cloudS: as[0].formed });
  }

  // ================================================================ 7) Twister Zooka: sidestep a twister seen coming
  const zooka = (ai, diff) => {
    const E = B[0], X = A[0];
    let hits = 0, noticed = 0;
    for (let k = 0; k < 10; k++) {
      // (a shooter that has spotted the zooka user 25 m off walks in toward its range, straight down the lane)
      scene(ai, [X], [E], { diff });
      place(X, -2 + (k % 5) * 1.3 + (k >= 5 ? 0.65 : 0), -15); place(E, 0, 10); tank(E); face(X, 0, 10);
      settle([X], 0.3); tank(E);
      start(E, 'zooka');
      step(0.45);
      { const tl = Math.hypot(X.pos.x - E.pos.x, X.pos.z - E.pos.z) / SPECIALS.zooka.speed; aimAt(E, X.pos.x + X.vel.x * tl, X.pos.y + 0.8, X.pos.z + X.vel.z * tl); }
      E.intent.fire = true; step(1 / 60); E.intent.fire = false;
      const hp0 = X.hp;
      step(1.2);
      if (!X.alive || X.hp < hp0 - 100) hits++;
      noticed += SP.SPECIAL_STATS.noticed;
    }
    return { hits, noticed };
  };
  // sustained: a bot duelling a foe while a zooka user 20 m off to one side fires at it (led) once a second for 6 s
  const zookaRain = (ai, diff) => {
    const E = B[0], E2 = B[1], X = A[0];
    scene(ai, [X], [E, E2], { diff });
    place(X, 0, -12); place(E2, 0, -3); tank(E2); face(X, 0, -3);
    place(E, 12, 4); tank(E);   // (20 m off, 37° to its right: in view)
    settle([X], 0.6); tank(E2);
    start(E, 'zooka');
    let hits = 0, shots = 0, hp0 = X.hp;
    step(6, () => {
      if (!X.alive || X.hp < hp0 - 100) hits++;
      if (!X.alive) { X.respawn(); X.bot._wasDead = false; place(X, 0, -12); X.hp = PLAYER.hp; X.invuln = 0; }
      if (X.hp < PLAYER.hp) X.hp = PLAYER.hp;   // (keep it in the fight: count the hits)
      hp0 = X.hp;
      const s = E.specialActive;
      E.intent.fire = false;
      if (s && s.cd <= 0) { const tl = Math.hypot(X.pos.x - E.pos.x, X.pos.z - E.pos.z) / SPECIALS.zooka.speed; aimAt(E, X.pos.x + X.vel.x * tl, X.pos.y + 0.8, X.pos.z + X.vel.z * tl); E.intent.fire = true; shots++; }
    });
    return { hits, shots };
  };
  if (want('zooka')) {
    // (per 6-shot round the old behaviour takes ~4.6 hits, a normal bot ~3.8 — 0 to 6: 20 m off is at the edge of what
    // it sees and reacts to in time — and a hard one ~2.6. A normal bot's edge is small next to a round's luck: 30 rounds
    // of it and of the old behaviour (12 of the hard bot's) make the ordering hold — 2 rounds' worth missed it 1 run in 3)
    const rounds = (ai, diff, n) => { const t = { hits: 0, shots: 0, perRound: [] }; for (let i = 0; i < n; i++) { const r = zookaRain(ai, diff); t.hits += r.hits; t.shots += r.shots; t.perRound.push(r.hits); } return t; };
    const rate = (t) => t.hits / t.shots;
    const r0 = rounds(false, 'normal', 30), r1n = rounds(true, 'normal', 30), r1h = rounds(true, 'hard', 12);
    R('Twister Zooka, sustained (6 shots a round: 30 rounds off, 30 on for a normal bot, 12 for a hard one): a bot mid-duel with a zooka user 20 m off to one side firing (led) once a second — on: it steps out of the line before each shot, hit less (hard bots least); off: hit nearly every time',
      rate(r1n) < rate(r0) && rate(r1h) <= rate(r1n), { hitRate: { off: r2(rate(r0)), normalOn: r2(rate(r1n)), hardOn: r2(rate(r1h)) }, off: r0, normalOn: r1n, hardOn: r1h });
  }
  if (want('zooka')) {
    const a = zooka(true, 'hard'), b = zooka(false, 'hard'), n = zooka(true, 'normal');
    R('Twister Zooka: a hard bot walking in on the zooka user sidesteps a twister led at it from ~25 m (on: at most 3 of 10 hit; off: 6+) — a normal bot, slower, dodges fewer',
      a.hits <= 3 && b.hits >= 6 && a.hits < n.hits, { hardOn: a, hardOff: b, normalOn: n });
  }

  // ================================================================ 8) Kraken: keep out of its reach, don't shoot it (a hurtable foe instead), back on it when it's over
  const kraken = (ai) => {
    const E = B[0], E2 = B[1], ours = A.slice(0, 2);
    scene(ai, ours, [E, E2], { weapon: 'roller' });
    place(ours[0], -3, -10); place(ours[1], 3, -10); ours.forEach((a) => face(a, 0, 0));
    place(E, 0, -4.5); place(E2, 0, 5); tank(E2);
    // (our own turf round them, as in a match: a kid can't outrun a kraken on foot, a squid in its ink can)
    for (const [x, z] of [[-6, -12], [0, -14], [6, -12], [-9, -17], [9, -17], [0, -20]]) G.paint.splat(new V3(x, 0.2, z), 4.5, 0, { seed: 1 });
    settle(ours, 0.3); tank(E2);
    start(E, 'kraken');
    // (the kraken, played by hand: at the nearest roller, a jump attack from 3 m)
    let cd = 0;
    const drive = () => {
      let best = null, bd = 99;
      for (const a of ours) if (a.alive) { const d = flat(a.pos, E.pos.x, E.pos.z); if (d < bd) { bd = d; best = a; } }
      E.intent.fire = false;
      if (!best) { E.intent.move.set(0, 0, 0); return; }
      const dx = best.pos.x - E.pos.x, dz = best.pos.z - E.pos.z, l = Math.hypot(dx, dz) || 1;
      E.intent.move.set(dx / l, 0, dz / l); E.yaw = E.aimYaw = Math.atan2(dx, dz);
      if ((cd -= 1 / 60) <= 0 && bd < 3 && E.grounded) { E.intent.fire = true; cd = 0.8; }
    };
    let shotsAtK = 0, shotsAtE2 = 0, near = 0;
    step(4, () => {
      drive();
      for (const a of ours) {
        if (!a.alive) continue;
        if (flat(a.pos, E.pos.x, E.pos.z) < 3) near += 1 / 60;
        // (a shot at it: the trigger held with the aim on it, as botSpecials judges one — a roller rolling away from it
        // with it still its target is no shot at it)
        const aimedAt = (T) => Math.abs(angleDiff(a.bot.aimYaw, Math.atan2(T.pos.x - a.pos.x, T.pos.z - a.pos.z))) < 0.45;
        if (a.intent.fire && a.bot.target === E && aimedAt(E)) shotsAtK++;
        if (a.intent.fire && a.bot.target === E2 && aimedAt(E2)) shotsAtE2++;
      }
    });
    const res = { dead: dead(ours), sWithin3m: r1(near), shotsAtKraken: shotsAtK, shotsAtOther: shotsAtE2, st: { ...SP.SPECIAL_STATS } };
    // over: it's a squidkid again → back on it
    if (E.specialActive) G.specials.end(E, 'time');
    E.intent.move.set(0, 0, 0); E.intent.fire = false;
    place(E2, 20, 30);
    ours.forEach((a) => { if (!a.alive) { a.respawn(); a.bot._wasDead = false; } });
    place(E, 0, -4); tank(E);
    ours.forEach((a, i) => { a.hp = PLAYER.hp; place(a, i ? 3 : -3, -13); face(a, 0, -4); });
    let back = 0;
    step(1.5, () => { for (const a of ours) if (a.alive && a.intent.fire && a.bot.target === E) back++; });
    res.shotsAfter = back; res.reengaged = SP.SPECIAL_STATS.reengaged;
    return res;
  };
  if (want('kraken')) {
    const a0 = kraken(true), a1 = kraken(true), b0 = kraken(false), b1 = kraken(false);
    const add = (x, y) => ({ dead: x.dead + y.dead, sWithin3m: r1(x.sWithin3m + y.sWithin3m), shotsAtKraken: x.shotsAtKraken + y.shotsAtKraken, shotsAtOther: x.shotsAtOther + y.shotsAtOther, shotsAfter: x.shotsAfter + y.shotsAfter, reengaged: x.reengaged + y.reengaged, escapes: x.st?.escapes + y.st?.escapes, evaded: x.st?.evaded + y.st?.evaded });
    const a = add(a0, a1), b = add(b0, b1);
    R('Kraken (2 rounds): rollers in their own turf don\'t roll at it — they swim out of its reach (dodging its jumps), no more lost than the old behaviour — then go for it once it\'s a kid again',
      a.shotsAtKraken === 0 && b.shotsAtKraken > 20 && a.dead <= b.dead && a.shotsAfter > 0,
      { on: a, off: { dead: b.dead, sWithin3m: b.sWithin3m, shotsAtKraken: b.shotsAtKraken, shotsAtOther: b.shotsAtOther } });
  }

  // ================================================================ 9) Bubble Guard: no shots into the shield, back off out of its reach, back on it when it pops; the sea behind it: shoot
  const bubbler = (ai) => {
    const E = B[0], X = A[0];
    scene(ai, [X], [E]);
    place(X, 0, -14); place(E, 0, -7); face(X, 0, -7);
    settle([X], 0.4);
    G.specials.giveShield(E, 5, true);
    let shots = 0, d1 = 0;
    step(3, () => { if (X.intent.fire && X.bot.target === E) shots++; });
    d1 = r1(flat(X.pos, E.pos.x, E.pos.z));
    const st = { ...SP.SPECIAL_STATS };
    G.specials._dropShield(E, true); E.status.shield = 0;
    let after = 0, first = null;
    step(2, (t) => { if (X.intent.fire && X.bot.target === E) { after++; if (first === null) first = r1(t); } });
    return { shotsShielded: shots, distShielded: d1, shotsAfter: after, firstShotAfter: first, st };
  };
  const knock = (ai) => {
    const E = B[0], X = A[0];
    scene(ai, [X], [E]);
    place(X, 20, 20); place(E, 27.45, 20); face(X, 27.45, 20);
    settle([X], 0.4);
    G.specials.giveShield(E, 6, true);
    let shots = 0;
    step(3, () => { if (X.intent.fire && X.bot.target === E) shots++; });
    return { shots, sunk: !E.alive, st: { ...SP.SPECIAL_STATS } };
  };
  if (want('bubbler')) {
    const a = bubbler(true), b = bubbler(false), k = knock(true);
    R('Bubble Guard: no shots into the shield and backed out of its reach; back on it straight after it pops (off: shoots the shield)',
      a.shotsShielded === 0 && a.distShielded > 12 && a.shotsAfter > 0 && b.shotsShielded > 20, { on: a, off: { shotsShielded: b.shotsShielded, distShielded: b.distShielded } });
    R('Bubble Guard at the very edge of the deck: the shove can put it in the sea — judged worth it, so the bot keeps shooting',
      k.shots > 10 && k.st.knockShots >= 1, { shots: k.shots, sunk: k.sunk, knockShots: k.st.knockShots });
  }

  // ================================================================ 10) Crab Rig: out of its gun lane, no shots into the hull from the front; the rider from behind
  const crab = (ai) => {
    const E = B[0], X = A[0];
    scene(ai, [X], [E]);
    place(X, 0, -16); place(E, 0, -6); face(X, 0, -6); face(E, 0, -16);
    settle([X], 0.3);
    const s = start(E, 'crab');
    let frontShots = 0, inLane = 0;
    step(3, () => {
      face(E, 0, -16); s.hull = E.aimYaw; E.intent.fire = true;
      const fx = Math.sin(s.hull), fz = Math.cos(s.hull), rx = X.pos.x - E.pos.x, rz = X.pos.z - E.pos.z;
      if (X.alive && Math.abs(rx * fz - rz * fx) < 1.4 && rx * fx + rz * fz > 0) inLane += 1 / 60;
      if (X.alive && X.intent.fire && X.bot.target === E && (rx * fx + rz * fz) / (Math.hypot(rx, rz) || 1) > -0.45) frontShots++;
    });
    E.intent.fire = false;
    const res = { dead: !X.alive, sInLane: r1(inLane), frontShots, st: { ...SP.SPECIAL_STATS } };
    // from behind: the rider is open — shoot
    if (!X.alive) X.respawn();
    X.hp = PLAYER.hp; place(X, 0, 2); face(X, 0, -6);
    let backShots = 0; const hp0 = E.hp;
    step(1.5, () => { face(E, 0, -16); s.hull = E.aimYaw; if (X.intent.fire && X.bot.target === E) backShots++; });
    res.backShots = backShots; res.riderHit = E.hp < hp0 || !E.alive;
    return res;
  };
  if (want('crab')) {
    const a = crab(true), b = crab(false);
    R('Crab Rig: out of its gun lane, no shots into the armoured front (off: stands in the lane shooting the hull); from behind it shoots the rider',
      !a.dead && a.frontShots === 0 && a.sInLane < 1 && b.frontShots > 20 && a.backShots > 0 && a.riderHit,
      { on: a, off: { dead: b.dead, sInLane: b.sInLane, frontShots: b.frontShots } });
  }

  // ================================================================ 11) Mega Stamp: out of the lane in front of it, no shots into its guarded front; its side is open
  const stamp = (ai) => {
    const E = B[0], X = A[0];
    scene(ai, [X], [E]);
    place(X, 0, -12); place(E, 0, -6); face(X, 0, -6); face(E, 0, -12); tank(E);
    settle([X], 0.3); tank(E);
    const s = start(E, 'stamp');
    let front = 0, inLane = 0, k = 0;
    step(2.5, () => {
      face(E, X.pos.x, X.pos.z); E.intent.fire = (k++ % 12) < 2;   // (swinging: its guard is up)
      const fy = s.bodyYaw, fx = Math.sin(fy), fz = Math.cos(fy), rx = X.pos.x - E.pos.x, rz = X.pos.z - E.pos.z, rl = Math.hypot(rx, rz) || 1;
      if (X.alive && (rx * fx + rz * fz) / rl > Math.cos(1.2) && rl < 6) inLane += 1 / 60;
      if (X.alive && X.intent.fire && X.bot.target === E && (rx * fx + rz * fz) / rl > Math.cos((SPECIALS.stamp.deflectArc * Math.PI) / 180)) front++;
    });
    E.intent.fire = false;
    return { dead: !X.alive, frontShots: front, sInFront: r1(inLane), st: { ...SP.SPECIAL_STATS } };
  };
  if (want('stamp')) {
    const a = stamp(true), b = stamp(false);
    R('Mega Stamp: no shots into its front, guarded swing after swing (the old code held them only mid-swing); out of the lane in front of it',
      a.frontShots === 0 && b.frontShots >= 5 && !a.dead, { on: a, off: { dead: b.dead, frontShots: b.frontShots, sInFront: b.sInFront } });
  }

  // ================================================================ 12) Bubble Blower: out of an enemy bubble's blast; no shots soaked by it; pop our own on one of theirs
  const blow = (e, n) => { for (let k = 0; k < n; k++) { e.intent.fire = true; step(1.7); e.intent.fire = false; step(0.15); } };
  const blower = (ai) => {
    const E = B[0], E2 = B[1], X = A[0], Y = A[1];
    scene(ai, [X, Y], [E, E2], { weapon: 'charger', foeWeapon: 'charger' });
    // X fights E (a charger 19 m off: close enough to shoot a bubble by X), Y fights E2 with a bubble on its line of fire
    // (Y's duel 7 m clear of the deck's wall at x 14…15 — at 10 its strafing took it out of sight behind the wall's end
    // — and over 22 m from E: nearer, it could see the bubble blower, defenceless while it blows, and go for that)
    place(X, -8, -10); place(E, -8, 9); tank(E); face(X, -8, 9);
    place(Y, 7, -10); place(E2, 7, 9); tank(E2); face(Y, 7, 9);
    settle([X, Y], 1.0); tank(E); tank(E2);
    start(E, 'blower'); E.bot.update = idle;
    blow(E, 2);
    const bs = G.specials.world.filter((w) => w.kind === 'bubble' && !w.held && !w.dead);
    let inside = 0, soaked = 0, blocked = 0;
    const bu = bs[0], bu2 = bs[1] || null;
    // (a shot whose line runs through the bubble: soaked)
    const offF = on('weapon:fire', (e) => {
      if (e.actor !== Y || !bu2 || Y.bot.target !== E2) return;
      const m0 = e.muzzle, tx = E2.pos.x - m0.x, ty = E2.pos.y + 0.85 - m0.y, tz = E2.pos.z - m0.z, L2 = tx * tx + ty * ty + tz * tz;
      const vx = bu2.pos.x - m0.x, vy = bu2.pos.y - m0.y, vz = bu2.pos.z - m0.z, u = Math.max(0, Math.min(1, (vx * tx + vy * ty + vz * tz) / L2));
      if (Math.hypot(vx - tx * u, vy - ty * u, vz - tz * u) < bu2.r * 0.95) soaked++;
    });
    // (bu2 stays on Y's line of fire, 6 m out, however Y strafes: the situation the check is about — a charge held, no
    // shot soaked — every frame, rather than now and then)
    const onLine = () => { const ex = Y.pos.x, ey = Y.pos.y + 1.1, ez = Y.pos.z, tx = E2.pos.x - ex, ty = E2.pos.y + 0.85 - ey, tz = E2.pos.z - ez, k = 6 / (Math.hypot(tx, ty, tz) || 1); bu2.pos.set(ex + tx * k, ey + ty * k, ez + tz * k); };
    if (bu) {
      bu.pos.set(X.pos.x + 1.6, 1.3, X.pos.z); bu.vel.set(0, 0, 0); bu.life = 9;
      if (bu2) { onLine(); bu2.vel.set(0, 0, 0); bu2.life = 9; }
      step(4, (t) => {
        bu.vel.set(0, 0, 0); if (bu2) { bu2.vel.set(0, 0, 0); onLine(); }
        if (t > 0.9 && flat(X.pos, bu.pos.x, bu.pos.z) < bu.r * SPECIALS.blower.blastMul) inside += 1 / 60;
        if (bu2 && Y.bot.target === E2) blocked++;
      });
    }
    offF();
    return { bubbles: bs.length, sInsideAfter09: r1(inside), shotsIntoBubble: soaked, framesBlocked: blocked, bubbleHold: r1(SP.SPECIAL_STATS.bubbleHold), st: { ...SP.SPECIAL_STATS } };
  };
  const popOwn = (ai = true) => {
    const E2 = B[1], X = A[0], Y = A[1];
    scene(ai, [X], [E2]);
    X.bot._spray = () => false; X.bot._memBombAim = () => null;   // (no spray / bomb at the spot it ducked out at: either can set the bubble off by chance)
    place(Y, -10, 20); face(Y, -10, 30);
    place(X, 6, -12.5); place(E2, 16.5, -10.5); tank(E2); face(X, 16.5, -10.5);
    start(Y, 'blower');
    blow(Y, 1);
    const bu = G.specials.world.find((w) => w.kind === 'bubble' && !w.held && w.team === 0);
    if (!bu) return { bubble: false };
    bu.pos.set(-20, 1.3, 30); bu.vel.set(0, 0, 0);
    X.hp = PLAYER.hp; place(X, 6, -12.5); face(X, 16.5, -10.5); place(E2, 16.5, -10.5); tank(E2);
    step(0.5, () => bu.vel.set(0, 0, 0));
    const seen = X.bot.target === E2 && X.bot.seeTimer > 0;
    // it ducks behind the wall (x 14…15, z −8…8) next to our bubble at the wall's end: out of sight, in the blast
    // (X's shots still in the air at where it stood are gone: one flying on into the bubble set it off ~1 run in 4 —
    // not the bot's doing, and the check is about the bot choosing to)
    G.projectiles.clear();
    place(E2, 16.5, -5.5); tank(E2);
    bu.pos.set(17.3, 1.3, -7.9);   // (off the line of its spray at the spot where it ducked out)
    const hidden = !G.physics.los(new V3(X.pos.x, X.pos.y + 1.3, X.pos.z), new V3(16.5, 1, -5.5)) && !G.physics.los(new V3(X.pos.x, X.pos.y + 1.3, X.pos.z), new V3(16.5, 1.6, -5.5));
    const hp0 = E2.hp;
    step(1.5, () => { if (!bu.dead) bu.vel.set(0, 0, 0); });
    delete X.bot._spray; delete X.bot._memBombAim;
    return { bubble: true, sawItFirst: seen, hidden, popped: bu.dead, e2Hit: r1(hp0 - E2.hp), popShots: SP.SPECIAL_STATS.popShots };
  };
  if (want('blower')) {
    const a = blower(true), b = blower(false), p = popOwn(true), p0 = popOwn(false);
    R('Bubble Blower: out of an enemy bubble\'s blast while one of theirs can set it off (off: stays in it); no shots into one on the line of fire (a charge is held till the line clears)',
      a.bubbles >= 2 && a.sInsideAfter09 < 0.3 && b.sInsideAfter09 > 1 && a.shotsIntoBubble === 0 && a.bubbleHold > 1,
      { on: a, off: { sInsideAfter09: b.sInsideAfter09, shotsIntoBubble: b.shotsIntoBubble, framesBlocked: b.framesBlocked } });
    R('Bubble Blower, counter-play: one of theirs ducks out of sight behind a wall right by our team\'s bubble — the bot shoots the bubble and it goes off on them',
      p.bubble && p.sawItFirst && p.hidden && p.popped && p.popShots >= 1 && p.e2Hit > 0, { on: p, off: p0 });
  }

  // ================================================================ 13) Ink Jet: its blasts' splash sidestepped; a jetpacker in reach is the target first
  const jet = (ai) => {
    const E = B[0], E2 = B[1], X = A[0];
    let dmg = 0;
    for (let k = 0; k < 4; k++) {
      // (a charger planted mid-charge in a fight 19 m off: the old behaviour stays put)
      scene(ai, [X], [E, E2], { diff: 'hard', weapon: 'charger' });
      chargers([X], [[-2 + k, -14]], E2, -2 + k, 5.5);
      place(E, 8, 12); tank(E);
      settle([X], 0.8); tank(E2);
      const J = SPECIALS.jetpack, from = new V3(E.pos.x, E.pos.y + 4.8, E.pos.z), dir = new V3(X.pos.x - from.x, X.pos.y + 0.05 - from.y, X.pos.z - from.z).normalize();
      G.projectiles.fireCustom(E, from, dir, { type: 'blast', speed: J.projSpeed, damage: J.directDamage, range: J.range, weaponId: 'jetpack', burst: { radius: J.splashRadius, splashRadius: J.splashRadius, dmgMax: J.splashMax, dmgMin: J.splashMin, paint: J.paintRadius } });
      const hp0 = X.hp;
      step(1.4);
      dmg += X.alive ? hp0 - X.hp : hp0;
    }
    return r1(dmg / 4);
  };
  const jetTarget = () => {
    const E = B[0], E2 = B[1], X = A[0];
    scene(true, [X], [E, E2]);
    place(X, 0, -10); place(E2, -2, -4); tank(E2); place(E, 3, 0); face(X, 0, -3);
    start(E, 'jetpack'); E.bot.update = idle;
    step(0.8); tank(E2); E.hp = 1e6;
    let onJet = 0, onOther = 0;
    step(1.5, () => { if (X.bot.target === E) onJet++; else if (X.bot.target === E2) onOther++; });
    // out of its reach (17 m off, the other foe 9 m): not lured out toward it — the reachable foe, and never under it
    place(X, 0, -10); place(E2, -3, -2); tank(E2); place(E, 9, 4); E.pos.y = 4; face(X, 2, -2);
    let farJet = 0, farOther = 0, minUnder = 99;
    step(2.5, () => { if (X.bot.target === E) farJet++; else if (X.bot.target === E2) farOther++; minUnder = Math.min(minUnder, flat(X.pos, E.pos.x, E.pos.z)); });
    return { framesOnJetpacker: onJet, framesOnCloserFoe: onOther, hunted: SP.SPECIAL_STATS.hunted, outOfReach: { framesOnJetpacker: farJet, framesOnReachableFoe: farOther, closestToUnderIt: r1(minUnder) } };
  };
  if (want('jet')) {
    const a = jet(true), b = jet(false), t = jetTarget();
    R('Ink Jet: a hard charger mid-charge gets out of a blast\'s path and splash seen coming from ~28 m (avg damage on well under off)', a < b * 0.6, { avgDmgOn: a, avgDmgOff: b });
    R('Ink Jet: a jetpacker in reach is taken before a closer foe (floating, in the open); one out of reach doesn\'t lure the bot out (the foe it can reach, and never under it)',
      t.framesOnJetpacker > t.framesOnCloserFoe && t.outOfReach.framesOnReachableFoe > t.outOfReach.framesOnJetpacker && t.outOfReach.closestToUnderIt > 6, t);
  }

  // ================================================================ 14) the sight rule: nothing that can't be known
  if (want('sight')) {
    const E = B[0], X = A[0];
    const recOf = (e) => [...X.bot.sp.recs.values()].filter((r) => r.d.actor === e || r.d.owner === e);
    // a) a Bubble Guard behind a wall, never seen: its shield is nothing to us
    scene(true, [X], [E]); X.bot.update = idle;
    place(X, 8, 0); face(X, 20, 0); place(E, 20, -3);
    G.specials.giveShield(E, 6, true);
    for (let t = 0; t < 1.2; t += 0.2) { step(0.2); X.bot._perceive(); X.bot.sp.tick(0.2); }
    const a1 = recOf(E).length;
    // b) a Tidal Slam behind that wall, out of view and out of earshot (18 m): nothing; c) the same 8 m off: heard
    scene(true, [X], [E]); X.bot.update = idle;
    place(X, -2, 0); face(X, -20, 0); place(E, 16, 5);
    start(E, 'slam');
    for (let t = 0; t < 0.6; t += 0.1) { step(0.1); X.bot._perceive(); X.bot.sp.tick(0.1); }
    const b1 = recOf(E).length;
    scene(true, [X], [E]); X.bot.update = idle;
    place(X, 8, 0); face(X, -20, 0); place(E, 16, 1);
    start(E, 'slam');
    for (let t = 0; t < 0.6; t += 0.1) { step(0.1); X.bot._perceive(); X.bot.sp.tick(0.1); }
    const c1 = recOf(E).length;
    // d) a Kraken behind the wall 11 m off, out of view: nothing; e) 7 m off: heard
    scene(true, [X], [E]); X.bot.update = idle;
    place(X, 4, 0); face(X, -20, 0); place(E, 15.5, 3);
    start(E, 'kraken');
    for (let t = 0; t < 0.8; t += 0.2) { step(0.2); X.bot._perceive(); X.bot.sp.tick(0.2); }
    const d1 = recOf(E).length;
    place(E, 15.5, 1.5); place(X, 8.8, 0); face(X, -20, 0);
    for (let t = 0; t < 0.8; t += 0.2) { step(0.2); X.bot._perceive(); X.bot.sp.tick(0.2); }
    const e1 = recOf(E).length;
    // f) a Vortex Strike ring behind its back 20 m off: on the map, so known
    scene(true, [X], [E]); X.bot.update = idle;
    place(X, 0, -10); face(X, 0, -30); place(E, 0, 30);
    const s = start(E, 'strike'); s.autoT = 0.05; s.target.set(0, 0, 10);
    for (let t = 0; t < 1; t += 0.2) { step(0.2); X.bot._perceive(); X.bot.sp.tick(0.2); }
    const f1 = [...X.bot.sp.recs.values()].filter((r) => r.d.src === 'strike').length;
    R('the sight rule: a shield / a slam / a kraken behind a wall, unseen and unheard, is nothing to the bot; heard close by (slam 8 m, kraken 7 m) or on the map (a strike ring behind it): noticed',
      a1 === 0 && b1 === 0 && c1 > 0 && d1 === 0 && e1 > 0 && f1 > 0, { shieldBehindWall: a1, slamFar: b1, slamHeard: c1, krakenFar: d1, krakenHeard: e1, strikeOnMap: f1 });
  }

  // ================================================================ 15) Tower Command: a rider takes a Tempest's rain on the deck, but leaves before a Vortex Strike lands
  if (TOWER && want('tower')) {
    const Tw = m.tower, E = B[0], X = A[0];
    const onDeck = () => { const off = [[0.65, 0.65]][0]; X.pos.set(Tw.pos.x + off[0], Tw.top + 0.05, Tw.pos.z + off[1]); X.vel.set(0, 0, 0); X.grounded = false; };
    scene(true, [X], [E]);
    place(E, Tw.pos.x + 12, Tw.pos.z + 14); tank(E);
    onDeck(); step(1.5); X.hp = PLAYER.hp;
    const role = X.bot.tRole;
    // rain on the deck
    lob(E, Tw.pos.x, Tw.pos.z, SPECIALS.storm.throwSpeed, 24, 1.45);
    start(E, 'storm');
    let onT = 0, tot = 0, hpLeft = null;
    step(4, () => { const cl = G.projectiles.clouds[0]; if (!cl || cl.t < 0.6) return; tot += 1 / 60; if (Tw.riderList.includes(X)) onT += 1 / 60; else if (hpLeft === null) hpLeft = r1(X.hp); });
    const rainAlive = X.alive;
    G.projectiles.clear();
    onDeck(); X.hp = PLAYER.hp; step(0.5);
    // (on the ground beside the platform, as the bots aim it: a vortex on the pillar's top can't reach the deck)
    const s = start(E, 'strike'); s.autoT = 0.05; s.target.set(Tw.pos.x + 2.2, 0, Tw.pos.z);
    let offAt = null;
    const off = on('special:strike', (e) => { offAt = r1(flat(X.pos, e.pos.x, e.pos.z)); });
    step(2.7);
    off();
    R('Tower Command: the rider takes a Tempest\'s rain on the deck (a light area, and it\'s the objective) while it\'s healthy, hops off before it\'s splatted; it\'s off and out of the ring when a Vortex Strike lands by the tower',
      role === 'ride' && tot > 2 && onT >= 0.6 && rainAlive && offAt !== null && offAt > SPECIALS.strike.radius, { role, sOnDeckInRain: r1(onT), rainS: r1(tot), hpWhenItLeft: hpLeft, alive: rainAlive, distAtStrike: offAt });
  }
  return out;
})()
