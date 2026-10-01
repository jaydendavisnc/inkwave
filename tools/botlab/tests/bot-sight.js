// Bot perception (src/game/botSight.js): a bot knows where a foe is only by seeing it or having it located; out of
// sight it's a memory of the last spot that ages out — never the foe's real position.
//   MAP=testbox MODE=turf PAGE=tools/botlab/tests/bot-sight.js tools/botlab/run.sh tools/botlab/page.cjs
// testbox: a flat deck (top y 0) with a 4 m wall at x 14…15, z −8…8. The watcher A (an Alpha bot) stands at (8, 0, 0)
// looking along +x at it; the foe B (a Bravo player) is moved round it. Everyone else is parked far off, all bots idle
// (A's brain only looks, via _perceive, except in the "no shots at nothing" run where it plays).
(async () => {
  const g = window.__inkwave, m = g.match, dbg = g.debug, G = __G;
  const { SIGHT, SIGHT_STATS, teamKnown } = await import('./src/game/bots.js');
  const { PLAYER } = await import('./src/config.js');
  const { emit } = await import('./src/core/ctx.js');
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info: info === undefined ? undefined : JSON.parse(JSON.stringify(info)) });
  dbg.freeze();
  const frame = (n = 1) => { for (let i = 0; i < n; i++) { g._skipRender = true; g._frame(1 / 60); } g._skipRender = false; };
  const step = (s) => frame(Math.max(1, Math.round(s * 60)));
  const r2 = (v) => v && [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
  const flat = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  const idle = () => {};
  for (const a of m.actors) if (a.bot) a.bot.update = idle;
  for (const a of m.actors) { if (!a.alive) a.respawn?.(); a.intent.move.set(0, 0, 0); a.intent.fire = false; a.intent.squid = false; a.status.track = 0; }
  const A = m.actors.find((a) => a.team === 0 && a.bot), B = m.actors.find((a) => a.team === 1);
  const park = () => m.actors.forEach((a, i) => { if (a === A || a === B) return; a.pos.set(-20 + (i % 4) * 8, 0.1, a.team ? 34 : -34); a.vel.set(0, 0, 0); });
  const place = (a, x, z, y = 0.05) => { a.pos.set(x, y, z); a.vel.set(0, 0, 0); a.grounded = false; };
  const bu = B.update;   // (B's actor update: stubbed while its squid state is set by hand)
  A.bot.setDifficulty('normal'); A.setWeapon('shooter'); B.setWeapon('shooter');
  const S = A.bot.sight, look = () => { A.bot.aimYaw = Math.PI / 2; A.bot._perceive(); }, kB = () => S.get(B);
  const fresh = () => { A.bot.reset(); A.bot.update = idle; A.bot.aimYaw = Math.PI / 2; B.status.track = 0; B.superJumpState = null;
    for (const x of [A, B]) { x.intent.move.set(0, 0, 0); x.intent.fire = x.intent.squid = x.intent.sub = x.intent.jump = x.intent.special = false; } };
  // standing still at a spot and looking a few times over dt s (one look per ~0.2 s, like the bot's think)
  const watch = (s) => { let seen = false; for (let t = 0; t < s - 1e-6; t += 0.2) { step(0.2); look(); seen = seen || S.sees(B); } return seen; };
  park(); place(A, 8, 0); place(B, 20, -3); step(0.5);
  const eye = new A.pos.constructor(8, 1.3, 0);

  // ---- 1) behind a wall: unknown; in the open and in view: seen; in the open behind its back: unseen (close by: seen)
  fresh();
  const wallBlocks = !G.physics.los(eye, new A.pos.constructor(20, 1.0, -3)) && !G.physics.los(eye, new A.pos.constructor(20, 1.6, -3));
  const behindWall = !watch(1);
  R('a foe behind a wall is unknown: not seen, no memory, no target', wallBlocks && behindWall && !kB() && A.bot.target === null && !teamKnown(0, B), { wallBlocks, mem: !!kB(), target: !!A.bot.target });
  place(B, 12, 10); const inView = watch(0.4);
  R('a foe in the open, in the view cone: seen and targeted', inView && A.bot.target === B && A.bot.seeTimer > 0, { d: +flat(A.pos, B.pos).toFixed(1), target: A.bot.target === B });
  fresh(); place(B, 0, 0); const behindBack = watch(0.6);
  place(B, 5, 0); const closeBehind = watch(0.4);
  R('a foe in the open behind its back: unseen at 8 m, seen within ' + SIGHT.near + ' m (all-round awareness)', !behindBack && closeBehind, { behindBack, closeBehind });

  // ---- 2) seen, then gone behind the wall: remembered at the last seen spot, not the real one
  // (last seen by the wall's end — round the corner out of view from A — then gone behind it)
  fresh(); place(B, 13, 9.2); watch(0.4);
  const seenAt = B.pos.clone();
  place(B, 20, -3); step(0.2); look();
  let k = kB();
  R('seen then hidden: remembered at the last seen spot (not the real one), still the target', !!k && !k.seen && k.pos.distanceTo(seenAt) < 0.3 && flat(k.pos, B.pos) > 5 && A.bot.target === B && flat(A.bot.tv.pos, B.pos) > 5,
    { mem: r2(k && k.pos), seenAt: r2(seenAt), real: r2(B.pos), view: r2(A.bot.tv && A.bot.tv.pos) });
  // the bot plays on: it may pre-aim / spray the spot for a moment, but never aims or fires at where B really is
  delete A.bot.update;
  A.ink = PLAYER.inkMax; A.hp = PLAYER.hp;
  A.bot.huntFor = 3; A.bot.huntSeek = true; A.bot.sprayOn = true;   // (this run: goes to look, sprays at first)
  let blind = 0, blindLate = 0, onReal = 0, onMem = 0, frames = 0, fightF = 0;
  const yawTo = (p) => Math.atan2(p.x - A.pos.x, p.z - A.pos.z), off = (y) => Math.abs(Math.atan2(Math.sin(y - A.bot.aimYaw), Math.cos(y - A.bot.aimYaw)));
  for (let f = 0; f < 120; f++) {
    frame();
    const kk = kB();
    if (!kk || A.bot.target !== B || A.bot.mode !== 'fight') continue;
    fightF++;
    if (A.intent.fire) { blind++; if (G.time - kk.seenT > SIGHT.spray + 0.05) blindLate++; }
    if (f > 30) { frames++; if (off(yawTo(B.pos)) < 0.15) onReal++; if (off(yawTo(kk.guess)) < 0.2) onMem++; }
  }
  A.bot.update = idle;
  R('out of sight it aims at the remembered spot, not the real one, and shoots only a short spray there (≤ ' + SIGHT.spray + ' s)', fightF > 20 && blindLate === 0 && onReal <= frames * 0.1 && onMem >= frames * 0.6,
    { fightFrames: fightF, sprayFrames: blind, firedLate: blindLate, aimOnReal: onReal, aimOnMemory: onMem, of: frames, mode: A.bot.mode });

  // ---- 3) located (Echo Orb / Lurk Mine / Tracer / Sonar: status.track): known through the wall, and followed while it lasts
  fresh(); park(); place(A, 8, 0); place(B, 20, -3); step(0.3);
  G.subs.track(B, 0, 8); look(); k = kB();
  const known1 = !!k && !k.seen && k.src === 'track' && k.pos.distanceTo(B.pos) < 0.3;
  place(B, 22, 3); step(0.3); look(); k = kB();
  const follows = !!k && k.pos.distanceTo(B.pos) < 0.3;
  const team = teamKnown(0, B);
  R('a located foe is known through the wall (and followed while tracked), for the team too', known1 && follows && team === k && A.bot.target === B, { known1, follows, team: !!team, target: A.bot.target === B, mem: r2(k && k.pos), real: r2(B.pos) });
  B.status.track = 0; const lastLoc = B.pos.clone();
  place(B, 24, -5); step(0.3); look(); k = kB();
  R('the effect over: back to a memory of where it was last located', !!k && k.pos.distanceTo(lastLoc) < 0.3 && flat(k.pos, B.pos) > 3, { mem: r2(k && k.pos), lastLoc: r2(lastLoc), real: r2(B.pos) });

  // ---- 4) memory ages out: still remembered a moment before SIGHT.keep, forgotten after it (and the target dropped)
  const t0 = k ? k.t : G.time;
  let at5 = null;
  while (G.time - t0 < SIGHT.keep - 0.4) { step(0.25); look(); }
  at5 = !!kB();
  while (G.time - t0 < SIGHT.keep + 0.5) { step(0.25); look(); }
  R('memory expires: remembered at ' + (SIGHT.keep - 0.4) + ' s, forgotten after ' + SIGHT.keep + ' s, no target', at5 && !kB() && A.bot.target === null, { at5, after: !!kB(), target: !!A.bot.target });

  place(A, 8, 0); step(0.3);
  // ---- 5) ink: B's squid state is set by hand (form / submerged / speed) so only the perception rules are under test
  B.update = () => { B.anim.time = G.time; };
  const squid = (x, z, vx = 0, vz = 0) => { B.pos.set(x, 0, z); B.vel.set(vx, 0, vz); B.form = 'squid'; B.submerged = true; B.grounded = true; B.groundTeam = 1; B.anim.form = 'swim'; };
  const kid = (x, z) => { B.pos.set(x, 0, z); B.vel.set(0, 0, 0); B.form = 'kid'; B.submerged = false; B.anim.form = 'kid'; };
  // a) still under its own ink: near-invisible (only almost on top of it)
  fresh(); squid(12, 6);
  const still7 = watch(1.2), mem7 = !!kB();
  squid(9.4, 0.4); const still15 = watch(0.4);
  R('submerged and still in its own ink: unseen at 7 m (nothing known), noticed only within ' + SIGHT.stillR + ' m', !still7 && !mem7 && still15, { at7m: still7, mem7, at1_5m: still15 });
  // b) swimming: harder to see (a delay to notice, a shorter range) but it can be followed while it moves
  fresh(); squid(12, 5, 0, 10);
  step(0.2); look(); const firstGlance = S.sees(B);
  let noticedAfter = null;
  for (let t = 0.2; t <= 1.2; t += 0.2) { squid(12, 5, 0, 10); step(0.2); look(); if (S.sees(B)) { noticedAfter = +t.toFixed(1); break; } }
  // (followed out past 13 m while it keeps swimming, in the open)
  let followed = true;
  for (const [x, z] of [[12, 8], [12, 9.5], [12, 11], [12.3, 12.3], [12.5, 13.3]]) { squid(x, z, 1, 10); step(0.2); look(); followed = followed && S.sees(B); }
  const followD = +flat(A.pos, B.pos).toFixed(1);
  // the same swimmer out there, never seen before: not noticed
  fresh(); let freshFar = false; for (let t = 0; t < 1.2; t += 0.2) { squid(12.5, 13.3, 10, 0); step(0.2); look(); freshFar = freshFar || S.sees(B); }
  R('swimming in its own ink: not seen at a glance, noticed after a moment within ~9 m, followed further once seen, unnoticed that far off when fresh',
    !firstGlance && noticedAfter !== null && noticedAfter <= 0.8 && followed && !freshFar, { firstGlance, noticedAfter, followed, followD, freshFar });
  // c) seen diving in: the dive spot is kept as its memory (a look at it doesn't clear it) and ages as usual; truly hidden
  // (already under when the bot first looked): nothing known
  fresh(); kid(12, 6); watch(0.4);
  const sawKid = S.sees(B);
  squid(12, 6); const diveAt = B.pos.clone();
  const stillSeen = watch(2);
  k = kB();
  const kept = !!k && !k.seen && k.dove && k.pos.distanceTo(diveAt) < 0.3;
  const tD = k ? k.t : G.time;
  while (G.time - tD < SIGHT.keep + 0.5) { step(0.25); look(); }
  const expired = !kB();
  fresh(); squid(12, 6); const hidden = watch(1.5);
  R('seen diving into its ink: the dive spot stays remembered (not cleared by looking at it) until it ages out; never seen going under: unknown',
    sawKid && !stillSeen && kept && expired && !hidden && !kB(), { sawKid, stillSeen, kept, dove: k && k.dove, expired, trulyHiddenSeen: hidden, trulyHiddenMem: !!kB() });
  B.update = bu; kid(20, -3);

  // ---- 6) other ways a foe gets located: a super jump's landing marker; a shot in the back from out of view
  fresh(); place(B, 20, -3); step(0.2);
  const land = new A.pos.constructor(22, 0, 4);
  B.superJumpState = { phase: 'flight', to: land, t: 0 }; look(); k = kB();
  const jumpKnown = !!k && k.src === 'jump' && k.pos.distanceTo(land) < 0.1 && !k.seen;
  // online, on the host: another player's jump comes as a bare flag (no landing point) — nothing learnt, nothing breaks
  fresh(); B.superJumpState = { phase: 'flight', net: true }; let netJumpOk = true;
  try { look(); netJumpOk = !kB(); } catch (e) { netJumpOk = false; }
  B.superJumpState = null;
  fresh(); place(B, 0, 0); step(0.2); look();
  const before = !!kB();
  emit('hit', { attacker: B, victim: A, damage: 20, killed: false, weaponId: B.weaponId });
  step(0.2); look(); k = kB();
  R('located otherwise: a super jump\'s landing spot is known (a remote jump without one is skipped); a shot from behind turns it to where it came from (a memory, then sight)',
    jumpKnown && netJumpOk && !before && !!k && k.src === 'hit' && A.bot.target === B, { jumpKnown, netJumpOk, before, hitMem: k && k.src, target: A.bot.target === B });

  R('perception cost (this test): sight lines per check', true, { checks: SIGHT_STATS.checks, rays: SIGHT_STATS.rays, perCheck: +(SIGHT_STATS.rays / Math.max(1, SIGHT_STATS.checks)).toFixed(2), deferred: SIGHT_STATS.deferred });
  return out;
})()
