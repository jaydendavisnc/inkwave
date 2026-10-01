(async () => {
  const g = window.__inkwave, m = g.match, dbg = g.debug;
  const { TOWER } = await import('./src/config.js');
  const GRACE = TOWER.checkpointGrace;
  const { on } = await import('./src/core/ctx.js');
  const { teamKnown } = await import('./src/game/botSight.js');
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info: info === undefined ? undefined : JSON.parse(JSON.stringify(info)) });
  dbg.freeze();
  const step = (s) => { const n = Math.max(1, Math.round(s * 60)); for (let i = 0; i < n; i++) dbg.step(1000 / 60); };
  for (const a of m.actors) if (a.bot) a.bot.update = () => {};
  for (const a of m.actors) { a.intent.move.set(0, 0, 0); a.intent.fire = false; a.intent.squid = false; }
  const T = m.tower;
  const cpA = T.cps.filter((c) => c.team === 0);
  R('points: two checkpoints, so the whole track is 80 points (80 s with one rider), each checkpoint 10 (10 s)', cpA.length === 2 && Math.abs(T.speed[0] * 80 - T.path.len[0]) < 1e-6 && cpA.every((c) => Math.abs(c.dur - 10) < 1e-6) && Math.abs(T.cpPoints - 10) < 1e-6,
    { speed: T.speed, len: T.path.len, durs: cpA.map((c) => c.dur), cpPoints: T.cpPoints });
  R('Tower Command match: mode, engine, collider (platform + pillar)', m.mode === 'tower' && !!T && __G.level.dyn.length === 2 && T.block.dynamic && T.pillar.dynamic && T.pillar.roof && !T.pillar.paint, { mode: m.mode, dyn: __G.level.dyn.length, len: T && T.path.len, placeholder: T && T.placeholder });
  if (!T) return out;
  const ev = []; const un = ['tower:control', 'tower:checkpoint', 'tower:overtime', 'tower:end', 'tower:contest', 'tower:return', 'tower:home'].map((k) => on(k, (e) => ev.push([k, JSON.parse(JSON.stringify({ ...e }))])));
  const A = m.actors.filter((a) => a.team === 0), B = m.actors.filter((a) => a.team === 1);
  const park = (a, i = 0) => { const ang = (a.team * 4 + i) * 0.7; a.pos.set(T.pos.x + 9 + Math.cos(ang) * 2, T.pos.y + 0.2, T.pos.z + Math.sin(ang) * 2 + (a.team ? -12 : 12)); a.vel.set(0, 0, 0); a.grounded = false; };
  const onTop = (a, k = 0) => { const off = [[0.65, 0.65], [-0.65, 0.65], [0.65, -0.65], [-0.65, -0.65]][k % 4]; a.pos.set(T.pos.x + off[0], T.top + 0.05, T.pos.z + off[1]); a.vel.set(0, 0, 0); a.grounded = false; };
  const all = [...A, ...B];
  // everyone away from the tower first (spawn to the side of the path), then settle
  all.forEach((a, i) => { if (!a.alive) a.respawn?.(); park(a, i); });
  step(0.5);
  // ---- 1) one Alpha rider: Alpha takes control, the tower moves toward Alpha's goal at the base speed, carrying the rider
  const a0 = A[0];
  onTop(a0);
  step(0.4);
  const s0 = T.s, p0 = a0.pos.clone();
  step(3);
  const moved = T.s - s0, want = T.speed[0] * 3;
  R('one rider: Alpha controls it and it rolls toward Alpha\'s goal at the base speed', T.owner === 0 && Math.abs(moved - want) < 0.08, { owner: T.owner, moved: +moved.toFixed(3), want });
  R('the rider rides along (carried, still on the platform, still counted)', T.riders[0] === 1 && a0.pos.distanceTo(p0) > want * 0.8 && Math.abs(a0.pos.y - T.top) < 0.15, { riders: T.riders, rode: +a0.pos.distanceTo(p0).toFixed(2), dy: +(a0.pos.y - T.top).toFixed(3) });
  // ---- 2) speed by riders: 2 / 3 / 4
  const speeds = [];
  for (let n = 2; n <= 4; n++) {
    for (let k = 0; k < n; k++) onTop(A[k], k);
    step(0.3);
    const sA = T.s; step(1);
    speeds.push(+((T.s - sA) / T.speed[0]).toFixed(3));
  }
  const expect = [1.2, 1.33, 1.43];
  R('speed × 1.20 / 1.33 / 1.43 with 2 / 3 / 4 riders', speeds.every((v, i) => Math.abs(v - expect[i]) < 0.04 || T.cps.some((c) => c.at)), { speeds, expect });
  // ---- 3) contested: a Bravo rider too → it stops, Alpha keeps control
  onTop(B[0], 1);
  step(0.3);
  const sC = T.s; step(2);
  R('riders of both teams: it stops, control stays', T.contested && Math.abs(T.s - sC) < 1e-6 && T.owner === 0, { contested: T.contested, ds: T.s - sC, owner: T.owner });
  // ---- 4) the Alpha riders get off → Bravo claims it, it heads for Bravo's goal
  A.forEach((a, i) => park(a, i));
  step(0.3);
  const sB = T.s; step(2);
  R('Alpha off, a Bravo player on → Bravo claims it and it heads back toward Bravo\'s goal', T.owner === 1 && T.s < sB - T.speed[1] * 2 * 0.6, { owner: T.owner, ds: +(T.s - sB).toFixed(3) });
  // ---- 5) empty: control holds 5 s, then neutral, then it rolls back to the centre
  B.forEach((a, i) => park(a, i));
  step(4.5);
  const ownerAt45 = T.owner, sE = T.s;
  step(1);
  const neutral = T.owner === -1;
  step(2);
  R('empty 5 s → neutral, then it rolls back toward the centre', ownerAt45 === 1 && neutral && Math.abs(T.s) < Math.abs(sE) - 0.5 && T.returning, { ownerAt45, owner: T.owner, sE: +sE.toFixed(2), s: +T.s.toFixed(2) });
  // ---- 6) checkpoint: push to Alpha's first checkpoint — it stops there, the timer runs (faster with more riders), then it goes on
  const cp = T.cps.find((c) => c.team === 0 && c.index === 0);
  T.s = cp.d - 0.3; T._place(1);
  onTop(A[0]);
  step(1.5);
  const stopped = Math.abs(T.s - cp.d) < 1e-4 && !cp.cleared, sAtStop = T.s;
  const left0 = cp.left; step(2);
  const ran = left0 - cp.left;
  onTop(A[1], 1); step(0.1);
  const l1 = cp.left; step(1);
  const ran2 = l1 - cp.left;
  R('checkpoint: the tower stops at it and its timer runs (× 1.2 with two riders)', stopped && Math.abs(ran - 2) < 0.05 && Math.abs(ran2 - 1.2) < 0.05, { stopped, sAtStop, d: cp.d, ran: +ran.toFixed(3), ran2: +ran2.toFixed(3), left: +cp.left.toFixed(2) });
  // lose control there (Bravo claims): after 3 s the timer refills; regaining sooner carries on
  A.forEach((a, i) => park(a, i));
  onTop(B[0]); step(1.5);
  B.forEach((a, i) => park(a, i));
  const partial = cp.left;
  // back to Alpha within the grace: carries on
  T.s = cp.d; T._place(1);
  onTop(A[0]); step(0.5);
  const carriedOn = cp.left <= partial + 1e-6;
  A.forEach((a, i) => park(a, i));
  const bestBefore = cp.best, ptsBefore = T.points[0];
  onTop(B[0]); step(1); B.forEach((a, i) => park(a, i));
  // Alpha takes it back but away from the checkpoint (the tower pushed off it): the grace keeps running
  T.s = cp.d - 3; T._place(1); onTop(A[0]); step(0.3); A.forEach((a, i) => park(a, i));
  step(Math.max(0, GRACE - 1.3 + 0.4));
  const refilled = cp.left === cp.dur, dummyOk = Math.abs(cp.dummy - bestBefore) < 1e-6 && cp.dummy > 0, keptScore = T.points[0] >= ptsBefore - 1e-9;
  R('lost control at a checkpoint: back on it in time it carries on; ' + GRACE + ' s off it (even if theirs again elsewhere) refills it, the cleared share becomes dummy seconds and the score stays', carriedOn && refilled && dummyOk && keptScore,
    { partial: +partial.toFixed(2), carriedOn, left: cp.left, dur: cp.dur, best: +bestBefore.toFixed(3), dummy: +cp.dummy.toFixed(3), pts: [+ptsBefore.toFixed(2), +T.points[0].toFixed(2)] });
  // clear it: two riders, dur / 1.2
  T.s = cp.d; T._place(1); T.owner = 0;
  onTop(A[0], 0); onTop(A[1], 1);
  step(cp.dur / 1.2 + 0.3);
  const cleared = cp.cleared;
  const sP = T.s; step(1);
  const TP = T.trackPoints, CP = T.cpPoints;
  const ptsAfter = T.points[0], wantPts = TP * (sP / T.path.len[0]) + CP;
  R('the checkpoint clears (two riders: its time ÷ 1.2) and the tower carries on', cleared && T.s > sP + 0.5, { cleared, ds: +(T.s - sP).toFixed(2) });
  R('points so far = the track points × the distance share + the cleared checkpoint\'s points', Math.abs(T.pointsNow(0) - (TP * (T.s / T.path.len[0]) + CP)) < 0.05 && ptsAfter >= wantPts - 0.1, { now: +T.pointsNow(0).toFixed(2), best: +ptsAfter.toFixed(2), count: T.count[0] });
  // cleared ones don't stop it again: roll it back past it and forward again
  T.s = cp.d - 0.5; T._place(1);
  onTop(A[0], 0); onTop(A[1], 1);
  step(1.5);
  R('a cleared checkpoint doesn\'t stop it again', T.s > cp.d + 0.2, { s: +T.s.toFixed(2), d: cp.d, owner: T.owner, riders: T.riders, contested: T.contested, next: T._nextCp(0) && T._nextCp(0).d, a0: [A[0].pos.x, A[0].pos.y, A[0].pos.z].map((v) => +v.toFixed(2)), top: +T.top.toFixed(2), pos: [T.pos.x, T.pos.z].map((v) => +v.toFixed(2)), win: T.winner });
  // ---- 6b) rolling home: Alpha takes the tower back on its own half (Bravo had pushed it there) and gets off — it rolls
  // on toward the centre at the one-rider speed, still Alpha's, and stops there; 5 s empty still makes it neutral
  const offAll = () => { A.forEach((a, i) => park(a, i)); B.forEach((a, i) => park(a, i)); };
  const retake = (s) => { offAll(); T.s = s; T.owner = 1; T._place(1); step(0.1); onTop(A[0]); step(0.4); offAll(); step(0.1); };
  const evHome = ev.length;
  retake(-12);
  const h0 = T.s, e0 = T.emptyT; step(2);
  R('rolling home: Alpha holds it on its own half and gets off → it rolls on toward the centre at the one-rider speed, still Alpha\'s',
    T.owner === 0 && T.homing && T.riders[0] + T.riders[1] === 0 && Math.abs(T.s - h0 - T.speed[0] * 2) < 0.06 && T.moving === 1 && ev.slice(evHome).some((e) => e[0] === 'tower:home' && e[1].team === 0),
    { owner: T.owner, homing: T.homing, ds: +(T.s - h0).toFixed(3), want: +(T.speed[0] * 2).toFixed(3), emptyT: +(T.emptyT - e0).toFixed(2), s: +T.s.toFixed(2) });
  // (still Alpha's until 5 s empty; then neutral, and it rolls back the neutral way — 0.6 × the speed)
  step(Math.max(0, TOWER.idleNeutral - T.emptyT - 0.15));
  const ownerBefore = T.owner, sN = T.s; step(0.3);
  const sN1 = T.s; step(1);
  R('rolling home still goes neutral after ' + TOWER.idleNeutral + ' s empty, then rolls back as a neutral tower does',
    ownerBefore === 0 && T.owner === -1 && T.returning && !T.homing && Math.abs((T.s - sN1) - TOWER.returnK * T.speed[1]) < 0.05 && sN > h0,
    { ownerBefore, owner: T.owner, returning: T.returning, homing: T.homing, ds1s: +(T.s - sN1).toFixed(3), want: +(TOWER.returnK * T.speed[1]).toFixed(3) });
  // stops at the centre (still Alpha's there)
  retake(-1);
  step(1.8);
  const sMid = T.s; step(0.5);
  R('rolling home stops at the centre (and it\'s still Alpha\'s there)', T.s === 0 && sMid === 0 && T.owner === 0 && !T.homing && T.moving === 0, { s: T.s, owner: T.owner, homing: T.homing, moving: T.moving });
  // someone boarding it: Bravo claims it and pushes it back its way; both teams on it: it stops
  retake(-10);
  step(0.5);
  const sB0 = T.s; onTop(B[0]); step(1);
  const bravoTook = T.owner === 1 && T.s < sB0 - 0.2 && !T.homing;
  retake(-10);
  step(0.5);
  onTop(A[0], 0); onTop(B[0], 1); step(0.3);
  const sC0 = T.s; step(1);
  R('someone boarding a tower rolling home: Bravo on it claims it and pushes it back toward its goal; both teams on it: it stops',
    bravoTook && T.contested && T.s === sC0 && !T.homing, { bravoTook, contested: T.contested, ds: T.s - sC0, owner: T.owner });
  // not on the enemy's half: held there and empty it stays put (then goes neutral as usual)
  offAll(); T.s = 6; T.owner = 0; T._place(1); step(0.1); onTop(A[0]); step(0.3); offAll(); step(0.1);
  const sE0 = T.s; step(2);
  R('held and empty on the other team\'s half: it doesn\'t roll', T.owner === 0 && T.s === sE0 && !T.homing && T.moving === 0, { owner: T.owner, s: T.s, sE0, homing: T.homing });
  // it scores nothing and never touches a checkpoint: roll home past Bravo's first checkpoint (on Alpha's half)
  const cpB = T.cps.find((c) => c.team === 1 && c.index === 0);
  retake(-(cpB.d + 0.6));
  const pts0 = [...T.points], best0 = [...T.best], cnt0 = [...T.count], cpB0 = { left: cpB.left, cleared: cpB.cleared, reached: !!cpB.reached, lost: cpB.lost };
  step(2);
  R('rolling home scores nothing and passes the other team\'s checkpoints untouched',
    T.s > -cpB.d + 0.3 && T.owner === 0 && cpB.left === cpB0.left && cpB.cleared === cpB0.cleared && !!cpB.reached === cpB0.reached && cpB.lost === cpB0.lost
      && T.points.every((p, i) => p === pts0[i]) && T.best.every((b, i) => b === best0[i]) && T.count.every((c, i) => c === cnt0[i]),
    { s: +T.s.toFixed(2), cpAt: -cpB.d, cp: { left: cpB.left, reached: !!cpB.reached, lost: cpB.lost }, cpB0, pts: T.points.map((p) => +p.toFixed(2)), pts0: pts0.map((p) => +p.toFixed(2)) });
  offAll(); step(0.2);
  // ---- 6c) the bots know it: on their own half with one of theirs close — one the team knows about (botSight.js: seen,
  // located or remembered) — their rider hops off to fight while the one of theirs right by it climbs on in its place,
  // the tower rolling home by itself meanwhile. Not for a foe nobody on the team has seen; not on the other team's half.
  // (The bots' updates are off here: their eyes are ticked by hand, a look every 0.2 s as _perceive does.)
  {
    const { towerPlan } = await import('./src/game/bots.js');
    const plan = () => towerPlan();
    A[0].setWeapon('shooter'); A[1].setWeapon('shooter');                    // (neither a charger: they perch)
    const look = () => { for (const a of A) if (a.alive && a.bot && a.bot.sight) a.bot.sight.check(); };
    const stepL = (sec) => { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) { dbg.step(1000 / 60); if (i % 12 === 11) look(); } };
    const near = (a, dx, dz) => { a.pos.set(T.pos.x + dx, T.pos.y + 0.05, T.pos.z + dz); a.vel.set(0, 0, 0); };
    const face = (a, x, z) => { if (a.bot) a.bot.aimYaw = Math.atan2(x - a.pos.x, z - a.pos.z); };
    const setup = (s, foeAt, eyes) => {
      offAll(); T.s = s; T.owner = 1; T._place(1); step(0.1); onTop(A[0]); step(0.3);
      near(A[1], 3.5, 0); near(B[1], 0, 20); near(B[0], foeAt[0], foeAt[1]);
      for (const a of A) face(a, T.pos.x, T.pos.z + 40);                      // (everyone looking down +z: B[1]'s way)
      if (eyes) face(A[1], B[0].pos.x, B[0].pos.z);
      for (const a of A) a.bot?.sight?.reset();
      stepL(0.3);
      for (let i = 0; i < 5; i++) { plan(); stepL(0.26); }                    // (the plan looks ~4× a second)
      return plan();
    };
    // one of theirs 6 m off behind the tower where none of ours can see it (and one seen 20 m off): the rider stays on
    let P = setup(-14, [-6, 0], false);
    const unseenKnown = !!teamKnown(0, B[0], 4), farKnown = !!teamKnown(0, B[1], 4);
    const noHop = !P.homeOff[0] && P.roleOf(A[0]) === 'ride' && !P.steam[0] && farKnown && !unseenKnown;
    // the same foe 10 m off where A[1] sees it: the swap
    P = setup(-14, [6, -8], true);
    const seen = !!teamKnown(0, B[0], 4);
    const hop = P.homeOff[0] && P.roleOf(A[0]) !== 'ride' && P.roleOf(A[1]) === 'ride' && T.owner === 0;
    A[0].pos.set(T.pos.x + 3.5, T.pos.y + 0.05, T.pos.z - 2); A[0].vel.set(0, 0, 0);   // (it walks off …)
    const s1 = T.s; stepL(1.2); P = plan();
    const rolled = T.homing && T.owner === 0 && T.s > s1 + 0.5;
    onTop(A[1]); stepL(0.4); P = plan(); stepL(0.3); P = plan();                // (… and the other one's climbed on)
    const swapped = !P.homeOff[0] && T.riders[0] === 1 && T.riderList.includes(A[1]) && T.owner === 0 && P.roleOf(A[1]) === 'ride';
    P = setup(10, [6, -8], true);
    const stays = !P.homeOff[0] && P.roleOf(A[0]) === 'ride';
    R('bots: on their half with one of theirs close that the team has seen, their rider hops off to fight while a teammate right by it takes its place, the tower rolling home meanwhile; not for one nobody has seen; not on the other half',
      noHop && seen && hop && rolled && swapped && stays, { noHop, unseenKnown, farKnown, seen, hop, rolled, swapped, stays, roles: [P.roleOf(A[0]), P.roleOf(A[1])] });
    offAll(); step(0.2);
  }
  // ---- 7) knockout: to Alpha's goal
  for (const c of T.cps) if (c.team === 0) c.cleared = true;
  T.s = T.path.len[0] - 0.6; T._place(1);
  onTop(A[0], 0); onTop(A[1], 1);
  step(2); step(3);
  R('Alpha reaches its goal → knockout win', T.winner === 0 && T.reason === 'knockout' && T.count[0] === 0 && (m.state === 'finish' || m.state === 'judge'), { winner: T.winner, reason: T.reason, count: T.count, state: m.state, result: m.result && { winner: m.result.winner, counts: m.result.counts, mode: m.result.mode } });
  // ---- 8) scoring, the tie-break and overtime — on fresh engines (the match is over)
  const { TowerCommand } = await import('./src/game/tower.js');
  const fake = (o = {}) => ({ duration: 300, time: 300, actors: [], endTower() {}, ...o });
  const mk = () => { const t = new TowerCommand(fake()); t.block && __G.level.clearDynamic(); return t; };
  let t1 = mk();
  t1.count = [40, 40]; t1.reachT = [100, 120];
  const L1 = t1.losing(), sc1 = t1.scores();
  t1.count = [40, 55];
  const L2 = t1.losing();
  t1.count = [100, 100];
  const L3 = t1.losing();
  R('score: lower count ahead; equal → the team that got there second drops a point; nobody pushed → sudden death', L1 === 1 && sc1[1] === 41 && sc1[0] === 40 && L2 === 1 && L3 === -1, { L1, sc1, L2, L3 });
  // overtime: at time up the team behind in control → overtime; ends on retake / neutral / comeback
  const ot = (setup, act) => { const t = mk(); setup(t); const went = !t.timeUp(); act(t); return { went, winner: t.winner, reason: t.reason }; };
  const o1 = ot((t) => { t.count = [60, 30]; t.reachT = [0, 0]; t.owner = 0; }, (t) => { t.owner = 1; t._overtime(0.1); });
  const o2 = ot((t) => { t.count = [60, 30]; t.owner = 0; }, (t) => { t.owner = -1; t._overtime(0.1); });
  const o3 = ot((t) => { t.count = [60, 30]; t.owner = 0; }, (t) => { t.count = [25, 30]; t._overtime(0.1); });
  const o4 = ot((t) => { t.count = [60, 30]; t.owner = 1; }, () => {});
  const o5 = ot((t) => { t.count = [60, 30]; t.owner = -1; }, () => {});
  R('overtime: the team behind in control → overtime; it ends on a retake / neutral (the team ahead wins) or a comeback',
    o1.went && o1.winner === 1 && o1.reason === 'retake' && o2.went && o2.winner === 1 && o2.reason === 'neutralised' && o3.went && o3.winner === 0 && o3.reason === 'comeback' && !o4.went && o4.winner === 1 && !o5.went && o5.winner === 1,
    { o1, o2, o3, o4, o5 });
  // ---- 9) special gauges: the team in control fills at 4.5 p/s; neutral → the team behind at 2.25
  const t2 = mk();
  const ma = { team: 0, alive: true, specialActive: null, special: 0, specialCost: () => 999, specialReady: () => false };
  const mb = { team: 1, alive: true, specialActive: null, special: 0, specialCost: () => 999, specialReady: () => false };
  t2.match = fake({ actors: [ma, mb] });
  t2.owner = 1; t2._fillSpecials(2);
  const held = [ma.special, mb.special];
  ma.special = mb.special = 0; t2.owner = -1; t2.count = [70, 50]; t2._fillSpecials(2);
  const neu = [ma.special, mb.special];
  R('special gauges: control → 4.5 p/s for that team; neutral → 2.25 p/s for the team behind', held[0] === 0 && Math.abs(held[1] - 9) < 1e-6 && Math.abs(neu[0] - 4.5) < 1e-6 && neu[1] === 0, { held, neu });
  // ---- 10) online: the host's records (0.1 s late) drive a follower — a tower rolling home moves the same there, shows
  // as rolling home, and stops at the centre (not dead-reckoned past it)
  {
    const host = mk(), fol = new TowerCommand(fake({ follower: true })); __G.level.clearDynamic();
    const q = [], netm0 = __G.netm, DT = 1 / 60, LAG = 6;
    __G.netm = { recTower: (e) => q.push([k + LAG, JSON.parse(JSON.stringify(e))]) };
    let k = 0;
    const hs = [], fs = [];
    let folHome = false, folPast = -Infinity, err = 0;
    try {
      host._setOwner(0); host.s = -host.speed[0] * 3; host._place(1);
      for (k = 0; k < Math.round(4.5 / DT); k++) {
        host.update(DT);
        hs.push(host.s);
        while (q.length && q[0][0] <= k) fol.netEvent(q.shift()[1]);
        fol.update(DT);
        fs.push(fol.s);
        if (fol.homing) folHome = true;
        folPast = Math.max(folPast, fol.s);
        if (k > LAG + 20) err = Math.max(err, Math.abs(fol.s - hs[k - LAG]));
      }
    } finally { __G.netm = netm0; }
    R('online: a follower sees the tower rolling home the same way (within a few cm of the host, 0.1 s late), flagged as rolling home, and it stops at the centre',
      folHome && err < 0.1 && Math.abs(fol.s) < 0.01 && folPast < 0.02 && host.s === 0 && fol.owner === 0 && !fol.homing,
      { err: +err.toFixed(3), fol: +fol.s.toFixed(4), past: +folPast.toFixed(4), host: host.s, owner: fol.owner, folHome, homingEnd: fol.homing });
    host.paint?.dispose(); fol.paint?.dispose();
  }
  un.forEach((u) => u());
  R('events fired: control, contest, checkpoint, return, home, end',
    ev.some((e) => e[0] === 'tower:home') && ['tower:control', 'tower:contest', 'tower:checkpoint', 'tower:return', 'tower:end'].every((k) => ev.some((e) => e[0] === k)), { kinds: [...new Set(ev.map((e) => e[0]))] });
  return out;
})()
