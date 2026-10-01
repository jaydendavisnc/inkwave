// Who shows on your map (game/reveal.js, the user's rules): an enemy only while located, standing in your ink, hurt by
// your ink and not in their own, or revealed by anything registered later. Teammates always.
//   MAP=testbox MODE=turf PAGE=tools/botlab/tests/map-reveal.js tools/botlab/run.sh tools/botlab/page.cjs
(async () => {
  const g = window.__inkwave, m = g.match, dbg = g.debug, THREE = await import('three');
  const { PLAYER } = await import('./src/config.js');
  const { revealedTo, registerReveal } = await import('./src/game/reveal.js');
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info });
  dbg.freeze();
  const step = (s) => { for (let i = 0; i < Math.round(s * 60); i++) dbg.step(1000 / 60); };
  for (const o of m.actors) if (o.bot) o.bot.update = () => { const it = o.intent; it.move.set(0, 0, 0); it.fire = it.jump = it.squid = it.sub = it.special = false; };
  const me = m.local, mate = m.actors.find((o) => o.team === me.team && o !== me), foe = m.actors.find((o) => o.team !== me.team);
  // the HUD frame's map players (what the minimap draws)
  let players = null; const upd = g.hud.update.bind(g.hud);
  g.hud.update = (dt, f) => { if (f && f.map) players = f.map.players; return upd(dt, f); };
  const onMap = (a) => { step(0.05); players = null; step(1 / 60); return !!players && players.some((p) => Math.abs(p.x - toMap(a).x) < 0.02 && Math.abs(p.y - toMap(a).y) < 0.02 && p.team === a.team); };
  const toMap = (a) => { const t = { x: 0, y: 0 }; g.minimap.toCanvas(a.pos.x, a.pos.z, t); return { x: t.x / g.minimap.w, y: t.y / g.minimap.h }; };
  const place = (a, x, z) => { a.pos.set(x, 0.1, z); a.vel.set(0, 0, 0); };
  m.actors.forEach((o, i) => place(o, -20 + i * 5, o.team ? 30 : -30));
  me.pos.set(0, 0.1, -35); mate.pos.set(6, 0.1, -35);
  __G.paint.clear();
  const reset = () => { foe.hp = PLAYER.hp; foe.status.track = 0; foe.status.reveal = 0; foe.status.trackTeam = -1; foe.status.revealTeam = -1; foe.form = 'kid'; foe.intent.squid = false; };
  const spot = (x, z) => { place(foe, x, z); step(0.3); };

  reset(); spot(10, 10);
  R('an enemy on dry floor at full health is not on your map', !revealedTo(foe, me.team) && !onMap(foe), { why: revealedTo(foe, me.team), ground: foe.groundTeam });
  R('your teammates always are', onMap(mate));

  __G.paint.splat(new THREE.Vector3(-10, 0, 10), 2.5, me.team); reset(); spot(-10, 10);
  R('an enemy standing in your ink is', revealedTo(foe, me.team) === 'inYourInk' && onMap(foe), { why: revealedTo(foe, me.team), ground: foe.groundTeam });

  reset(); spot(10, 10); foe.hp = 60;
  R('an enemy hurt by your ink (not back to full health) on dry floor is', revealedTo(foe, me.team) === 'hurt' && onMap(foe), { why: revealedTo(foe, me.team), hp: foe.hp });

  __G.paint.splat(new THREE.Vector3(10, 0, -5), 2.5, foe.team); reset(); spot(10, -5); foe.hp = 60; foe.intent.squid = true; step(0.1); foe.hp = 60;
  R('a hurt enemy back in their own ink is not', !revealedTo(foe, me.team) && !onMap(foe), { why: revealedTo(foe, me.team), ground: foe.groundTeam, hp: foe.hp });
  foe.intent.squid = false;

  reset(); spot(10, 10); foe.status.track = 5; foe.status.trackTeam = me.team;
  const shown = onMap(foe), ringed = players && players.some((p) => p.team === foe.team && p.tracked);
  R('a located (tracked) enemy is, ringed', revealedTo(foe, me.team) === 'located' && shown && ringed, { why: revealedTo(foe, me.team), ringed });
  reset(); spot(10, 10); foe.status.track = 5; foe.status.trackTeam = foe.team;
  R('tracked by their own team: not on yours', !revealedTo(foe, me.team) && !onMap(foe));
  reset(); spot(10, 10); foe.status.reveal = 3; foe.status.revealTeam = me.team;
  R('pinged by your Deep Sonar: on your map', revealedTo(foe, me.team) === 'located' && onMap(foe));

  reset(); spot(10, 10);
  registerReveal('test-gimmick', (e, team) => e === foe && team === me.team);
  R('a registered reveal (a future gimmick) shows them', revealedTo(foe, me.team) === 'test-gimmick' && onMap(foe), { why: revealedTo(foe, me.team) });
  registerReveal('test-gimmick', () => false);
  R('and hides them again when it stops', !revealedTo(foe, me.team) && !onMap(foe));
  g.hud.update = upd;
  return out;
})()
