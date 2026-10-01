(async () => {
  const g = window.__inkwave, m = g.match, dbg = g.debug, THREE = await import('three');
  const { TOWER, SUB, SPECIALS } = await import('./src/config.js');
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info: info === undefined ? undefined : JSON.parse(JSON.stringify(info)) });
  dbg.freeze();
  const T = m.tower, P = T.paint;
  const intents = new Map();
  for (const a of m.actors) if (a.bot) a.bot.update = () => { const it = intents.get(a); a.intent.move.set(0, 0, 0); a.intent.fire = a.intent.squid = a.intent.jump = a.intent.sub = a.intent.special = false; if (it) it(a.intent); };
  const step = (s) => { for (let i = 0; i < Math.round(s * 60); i++) dbg.step(1000 / 60); };
  const A = m.actors.filter((a) => a.team === 0 && !a.isLocal), B = m.actors.filter((a) => a.team === 1);
  const park = (a, i = 0) => { const pd = __G.level.spawnPads[a.team]; a.pos.set(pd.x + i, pd.y + 0.3, pd.z); a.vel.set(0, 0, 0); };
  for (const a of m.actors) park(a, m.actors.indexOf(a) % 4);
  step(0.5);
  const c = Math.cos(T.yaw), s = Math.sin(T.yaw), X = new THREE.Vector3(c, 0, -s), Z = new THREE.Vector3(s, 0, c);
  const W = (lx, ly, lz) => new THREE.Vector3(T.pos.x + X.x * lx + Z.x * lz, T.pos.y + ly, T.pos.z + X.z * lx + Z.z * lz);
  const Rr = TOWER.platformR, H = TOWER.platformH;
  // 1) ink reaches the tower: a splat on its +x wall, one on its deck, none on the grate / pillar
  const n0 = P.n;
  for (let y = 0.25; y < H; y += 0.35) for (let z = -0.9; z <= 0.9; z += 0.45) __G.paint.splat(W(Rr + 0.15, y, z), 0.45, 0);
  __G.paint.splat(W(-0.6, H + 0.1, 0.6), 0.5, 0);
  const wallInk = P.wallTeam(W(Rr, 0.8, 0), X), deckInk = P.groundTeam(W(-0.6, H, 0.6)), grateInk = P.groundTeam(W(Rr - 0.1, H, 0));
  R('ink reaches the tower: its wall and deck take it, the grate rim does not', P.n > n0 && wallInk === 1 && deckInk === 1 && grateInk === 0, { painted: P.n - n0, wallInk, deckInk, grateInk });
  // 2) swim up the inked wall: a squid pressing into it climbs and pops onto the deck
  const a = A[0];
  a.pos.copy(W(Rr + 0.75, 0, 0)); a.pos.y = T.pos.y + 0.05; a.vel.set(0, 0, 0); a.yaw = Math.atan2(-X.x, -X.z);
  intents.set(a, (it) => { it.squid = true; it.move.set(-X.x, 0, -X.z); });
  let climbed = false, maxY = 0;
  for (let i = 0; i < 180; i++) { step(1 / 60); climbed = climbed || a.climbing; maxY = Math.max(maxY, a.pos.y - T.pos.y); }
  intents.set(a, (it) => { it.squid = true; });
  step(0.6);
  const onTop = Math.abs(a.pos.y - T.top) < 0.25 && Math.hypot(a.pos.x - T.pos.x, a.pos.z - T.pos.z) < Rr + 0.2;
  R('a squid swims up the inked wall onto the deck (' + H + ' m: higher than a jump)', climbed && onTop, { climbed, maxY: +maxY.toFixed(2), dy: +(a.pos.y - T.top).toFixed(2), grounded: a.grounded, onBlock: a.ground && a.ground.block === T.block.id });
  // 3) swimming in our ink on the deck: the ground reads as our ink
  a.pos.copy(W(-0.6, H + 0.05, 0.6)); a.vel.set(0, 0, 0); intents.set(a, (it) => { it.squid = true; });
  step(0.4);
  R('on the deck in our ink: our ground (swim / refill / hide)', a.groundTeam === 1, { groundTeam: a.groundTeam, form: a.form });
  intents.set(a, null);
  // 4) a sticky bomb on the tower rides with it
  const b0 = B[0];
  b0.pos.copy(W(Rr + 4, 0, 0)); b0.pos.y = T.pos.y + 0.05;
  __G.subs._throw(b0, SUB.sticky, new THREE.Vector3(b0.pos.x, T.pos.y + 1.0, b0.pos.z), new THREE.Vector3(-X.x * 14, 0.5, -X.z * 14));
  let st = null;
  for (let i = 0; i < 40 && !st; i++) { step(1 / 60); st = __G.subs.items.find((it) => it.kind === 'sticky' && it.state === 'stuck'); }
  // (now move the tower: Alpha rides)
  A.slice(1, 3).forEach((r, i) => { r.pos.copy(W(i ? 0.8 : -0.8, H + 0.05, 0)); r.vel.set(0, 0, 0); });
  const s0 = T.s, off0 = st ? st.pos.clone().sub(T.pos) : null;
  step(1.2);
  const off1 = st && !st.dead ? st.pos.clone().sub(T.pos) : null;
  R('a sticky bomb stuck to the tower rides with it', !!st && !!st.ride && Math.abs(T.s - s0) > 0.3 && off0 && off1 && off0.distanceTo(off1) < 0.05, { stuck: !!st, rides: !!(st && st.ride), moved: +(T.s - s0).toFixed(2), drift: off0 && off1 ? +off0.distanceTo(off1).toFixed(3) : null });
  // 5) riders carried along don't walk
  const rider = A[1];
  let hsMax = 0; for (let i = 0; i < 60; i++) { A.slice(1, 3).forEach((r) => { r.vel.x = r.vel.z = 0; }); step(1 / 60); hsMax = Math.max(hsMax, rider.character.hs || 0); }
  R('a rider standing still while the tower carries them does not walk (animation)', T.moving !== 0 && hsMax < 0.25, { hsMax: +hsMax.toFixed(3), towerMoving: T.moving });
  // 5b) the local player (no brain, as a player's kid) standing still on the deck while two riders push it: nothing
  // zeroed by hand — its feet stay planted (no steps), its gait reads still; and a remote player (moved by its owner's
  // samples: 0.1 s late, 20 a second, uneven in between, its own velocity 0) likewise
  const steps = (a) => { const ch = a.character, o = { n: 0, at: [] }; const td = ch._touchDown, ss = ch._startSettle, lo = ch._liftOff;
    const note = (k, x) => { o.n++; if (o.at.length < 6) o.at.push([k, +__G.time.toFixed(2), x && x[1] !== undefined ? +(+x[1]).toFixed(3) : null, +ch.yawRate.toFixed(2)]); };
    ch._touchDown = function (...x) { note('td', x); return td.apply(this, x); }; ch._startSettle = function (...x) { note('settle', x); return ss.apply(this, x); }; ch._liftOff = function (...x) { note('lift', x); return lo.apply(this, x); };
    o.undo = () => { ch._touchDown = td; ch._startSettle = ss; ch._liftOff = lo; }; return o; };
  const me = m.local;
  me.bot = null; me.intent.move.set(0, 0, 0); me.intent.fire = me.intent.squid = me.intent.jump = false;
  me.pos.copy(W(-0.75, H + 0.05, -0.75)); me.vel.set(0, 0, 0); me.yaw = 0;
  A.slice(1, 3).forEach((r, i) => { r.pos.copy(W(i ? 0.8 : -0.8, H + 0.05, 0.6)); r.vel.set(0, 0, 0); });
  step(0.6);                                                               // (landed, settled)
  const ms = steps(me), sL = T.s; let hsL = 0, movL = false, driftL = 0;
  for (let i = 0; i < 120; i++) {
    step(1 / 60);
    const ch = me.character; hsL = Math.max(hsL, ch.hs || 0); movL = movL || !!ch.moving;
    for (const f of ch.feet) if (f.planted) driftL = Math.max(driftL, Math.hypot(f.pw.x - me.pos.x, f.pw.z - me.pos.z));
  }
  // … through a stop and a start (one of theirs on the deck a moment: contested), and on through the moment its idle
  // shuffle falls due (forced 0.5 s ahead): a weight-shift re-plant on a moving tower reads as a step, so none while
  // carried
  const sL1 = T.s, b1 = B[1] || B[0];
  b1.pos.copy(W(0.8, H + 0.05, -0.75)); b1.vel.set(0, 0, 0);
  let stopped = false; for (let i = 0; i < 36; i++) { step(1 / 60); stopped = stopped || (T.contested && T.moving === 0); }
  b1.pos.copy(W(Rr + 6, 0.05, 3)); b1.vel.set(0, 0, 0);
  let started = false; for (let i = 0; i < 60; i++) { step(1 / 60); started = started || T.moving !== 0; }
  me.character.shufT = 0.5;
  for (let i = 0; i < 180; i++) { step(1 / 60); movL = movL || !!me.character.moving; }
  ms.undo();
  R('the local player standing still on the moving tower does not walk: no steps (2 s riding, a stop and a start, 3 s more with an idle shuffle due), feet planted with it',
    Math.abs(T.s - sL) > 3 && stopped && started && T.riderList.includes(me) && ms.n === 0 && !movL && hsL < 0.25 && driftL < 0.45,
    { rode: +Math.abs(T.s - sL).toFixed(2), stopStart: [stopped, started], onDeck: T.riderList.includes(me), steps: ms.n, at: ms.at, moving: movL, hsMax: +hsL.toFixed(3), footDrift: +driftL.toFixed(3), s: +T.s.toFixed(2), sL1: +sL1.toFixed(2) });
  // a remote rider: a stand-in network (applyRemote) plays its owner's samples back
  const rem = A[1], netm0 = __G.netm, lat = new THREE.Vector3(-0.8, 0, 0.6);   // (its own spot)
  let smp = [], clock = 0;
  const own = () => { const c2 = Math.cos(T.yaw), s2 = Math.sin(T.yaw); return new THREE.Vector3(T.pos.x + c2 * lat.x + s2 * lat.z, T.top + 0.001, T.pos.z - s2 * lat.x + c2 * lat.z); };
  __G.netm = { applyRemote(a, dt) {
    clock += dt;
    if (!smp.length || clock - smp[smp.length - 1].t >= 0.05) smp.push({ t: clock, p: own() });      // the owner's 20 Hz samples
    const tr = clock - 0.1; let i = smp.length - 1; while (i > 0 && smp[i - 1].t > tr) i--;
    const p0 = smp[Math.max(0, i - 1)], p1 = smp[i], u = p1 === p0 ? 1 : Math.min(1, Math.max(0, (tr - p0.t) / (p1.t - p0.t))), e = u * u * (3 - 2 * u);   // Hermite, zero tangents
    const x0 = a.pos.x, y0 = a.pos.y, z0 = a.pos.z;
    a.pos.copy(p0.p).lerp(p1.p, e); a.vel.set(0, 0, 0); a.grounded = true; a.climbing = false;
    T.carryRemote?.(a, x0, y0, z0, dt);
    a._finishFrame(dt);
  } };
  rem.remote = true;
  const rs = steps(rem), sR = T.s; let hsR = 0, movR = false;
  try {
    for (let i = 0; i < 120; i++) { step(1 / 60); hsR = Math.max(hsR, rem.character.hs || 0); movR = movR || !!rem.character.moving; }
  } finally { __G.netm = netm0; rem.remote = false; rs.undo(); }
  R('a remote player standing still on the moving tower (its owner\'s uneven samples) does not walk either',
    Math.abs(T.s - sR) > 0.5 && rs.n === 0 && !movR && hsR < 0.25, { rode: +Math.abs(T.s - sR).toFixed(2), steps: rs.n, moving: movR, hsMax: +hsR.toFixed(3) });
  // stepping off the moving tower and back on: the feet re-plant on landing (no stray steps once standing again)
  me.pos.copy(W(Rr + 1.5, 0.05, 0)); me.vel.set(0, 0, 0); step(0.8);
  me.pos.copy(W(-0.75, H + 0.3, -0.75)); me.vel.set(0, 0, 0); step(0.6);
  const ms2 = steps(me); for (let i = 0; i < 60; i++) step(1 / 60); ms2.undo();
  R('off the moving tower and back on: standing still again, no stray steps', T.riderList.includes(me) && ms2.n === 0, { onDeck: T.riderList.includes(me), steps: ms2.n });
  me.pos.copy(W(Rr + 6, 0.05, -3)); me.vel.set(0, 0, 0);
  // 6) Bubble Guard on the tower: double the shove
  const q = A[2];
  q.status.shield = 5; q.vel.set(0, 0, 0);
  const sOn = T.riderList.includes(q);
  __G.specials.filterDamage(q, 40, b0, 'test');
  const vOn = Math.hypot(q.vel.x, q.vel.z);
  const q2 = A[3] || B[1]; q2.status.shield = 5; q2.pos.copy(W(Rr + 6, 0.05, 3)); q2.vel.set(0, 0, 0); step(1 / 60); q2.vel.set(0, 0, 0);
  __G.specials.filterDamage(q2, 40, b0, 'test');
  const vOff = Math.hypot(q2.vel.x, q2.vel.z);
  q.status.shield = 0; q2.status.shield = 0;
  R('Bubble Guard on the tower: twice the shove', sOn && Math.abs(vOn - 2 * vOff) < 0.05 && vOff > 0, { onTower: sOn, vOn: +vOn.toFixed(2), vOff: +vOff.toFixed(2) });
  // 7) a Kraken on the tower can be shot off
  const k = A[1];
  k.setSpecial('kraken'); k.special = k.specialCost(); k._startSpecial(); step(0.2);
  k.pos.copy(W(0.8, H + 0.05, 0)); k.vel.set(0, 0, 0); step(0.2);
  const onBefore = T.riderList.includes(k);
  let t = 0; for (; t < 4 && T.riderList.includes(k); t += 1 / 60) { if ((t * 60 | 0) % 7 === 0) __G.specials.filterDamage(k, 35, b0, 'test'); step(1 / 60); }
  R('a Kraken riding the tower is shot off by steady fire', onBefore && !T.riderList.includes(k), { onBefore, secs: +t.toFixed(2), kraken: !!(k.specialActive && k.specialActive.id === 'kraken') });
  if (k.specialActive) __G.specials.end(k, 'test');
  // 8) a super jump to a teammate riding the tower lands on its deck (not off its edge), even as it moves
  const mate = A[0], jumper = A[2];
  mate.pos.copy(W(0.8, H + 0.05, 0)); mate.vel.set(0, 0, 0);
  park(jumper, 0); jumper.status.shield = 0; step(0.5);
  const js = jumper.superJump(mate, { instant: true });
  let landed = false;
  for (let i = 0; i < 240 && !landed; i++) { step(1 / 60); landed = !jumper.superJumpState && T.riderList.includes(jumper); }
  R('a super jump to a teammate riding the tower lands on its deck', js && landed, { started: js, onDeck: T.riderList.includes(jumper), dy: +(jumper.pos.y - T.top).toFixed(2), dxz: +Math.hypot(jumper.pos.x - T.pos.x, jumper.pos.z - T.pos.z).toFixed(2) });
  return out;
})()
