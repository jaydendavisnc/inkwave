// Audio across pause / resume / quit (the user's bugs): a splatling charging when you pause must not hum on forever
// (not through the pause, never after leaving the match), and the music comes back after a pause.
//   MAP=testbox MODE=turf PAGE=tools/botlab/tests/audio-pause.js tools/botlab/run.sh tools/botlab/page.cjs
(async () => {
  const g = window.__inkwave, m = g.match, A = __G.audio, out = [];
  const R = (name, ok, info) => out.push({ name, ok: !!ok, info });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const me = m.local;
  me.setWeapon('splatling'); me.ink = 100;
  // charge the splatling (the runner as the local kid's input would drive it)
  const w = me.weapon;
  for (let i = 0; i < 30; i++) me.weaponRunner.update(1 / 60, { fire: true, firePressed: i === 0, sub: false, subReleased: false });
  const spin = me.weaponRunner.spinLoop;
  // our hums: the spin loops that aren't another kid's (a bot charging a splatling nearby has its own) — ours or orphans
  const theirs = (h) => m.actors.some((o) => o !== me && o.weaponRunner && (o.weaponRunner.spinLoop === h || o.weaponRunner.chargeLoop === h));
  const live = () => [...A.loops].filter((h) => h.playing !== false && h.name === 'splatling_spin' && !theirs(h)).length;
  for (const o of m.actors) if (o !== me && o.bot) o.bot.update = () => { const it = o.intent; it.move.set(0, 0, 0); it.fire = it.jump = it.squid = it.sub = it.special = false; };   // (the bots stand still: no charges of their own)
  R('charging: the spin loop is playing', !!spin && live() >= 1, { loops: A.loops.size, spin: !!spin });
  g.pause(); await wait(300);
  const loopGain = A.loopIn ? A.loopIn.gain.value : null;
  R('paused: loops are silenced', loopGain !== null && loopGain < 0.05, { loopGain });
  const duckPaused = A.duckG.gain.value;
  g.resume(); await wait(900);
  R('resumed: loops audible again', A.loopIn && A.loopIn.gain.value > 0.95, { loopGain: A.loopIn && A.loopIn.gain.value });
  R('resumed: the music is not ducked (back to full)', A.duckG.gain.value > 0.95, { duckPaused: +duckPaused.toFixed(2), duckAfter: +A.duckG.gain.value.toFixed(2) });
  // charging, swim cancels the charge (latest press wins), charge again: only ever one spin hum (no orphan)
  for (let i = 0; i < 20; i++) me.weaponRunner.update(1 / 60, { fire: true, firePressed: i === 0, sub: false, subReleased: false });
  me.weaponRunner.cancelForSwim();
  for (let i = 0; i < 20; i++) me.weaponRunner.update(1 / 60, { fire: true, firePressed: i === 0, sub: false, subReleased: false });
  R('swim-cancel mid-charge then charge again: one spin hum, not two', live() === 1, { spinLoops: live() });
  me.weaponRunner.reset();
  R('the runner reset leaves no hum', live() === 0, { spinLoops: live() });
  // charge again, pause, then leave the match
  for (let i = 0; i < 30; i++) me.weaponRunner.update(1 / 60, { fire: true, firePressed: i === 0, sub: false, subReleased: false });
  g.pause(); await wait(200);
  await g.quitToMenu(); await wait(1500);
  // (the menu's backdrop match has bots of its own, whose charges may hum near the camera: those are owned. An orphan is
  // a loop no current kid's weapon holds — it would hum forever)
  // (a backdrop kid charging a Brine Cutlass holds its hum in the blade kit's own store, keyed by runner: owned while it charges)
  const owned = (h) => (g.match?.actors || []).some((o) => { const r = o.weaponRunner; return r && (r.spinLoop === h || r.chargeLoop === h || r.rollLoop === h || (h.name === 'blade_charge' && o.alive && o.weapon?.kind === 'blade' && r.kit?.charging)); });
  const orphans = () => [...A.loops].filter((h) => h.playing && /splatling|charge|draw|roll|spin/.test(h.name) && !owned(h)).map((h) => h.name);
  R('after leaving the match: no orphaned weapon hum (every live one belongs to a backdrop kid)', orphans().length === 0, { orphans: orphans(), loops: [...A.loops].map((h) => h.name) });
  await wait(3000);
  R('…and still none 3 s later', orphans().length === 0, { orphans: orphans() });
  R('after leaving: loops un-muted for the menus', A.loopIn && A.loopIn.gain.value > 0.95, { loopGain: A.loopIn && A.loopIn.gain.value });
  R('after leaving: nothing left ducked', A.duckG.gain.value > 0.95, { duck: +A.duckG.gain.value.toFixed(2) });
  return out;
})()
