// Stage movers page test (src/game/movers.js) on a stage with movers (Calamari County's railcars):
//   MAP=calamari MODE=turf PAGE=tools/botlab/tests/movers.js tools/botlab/run.sh tools/botlab/page.cjs
// The timetable (pure), the live cars following the match clock, 180° symmetry at every moment, no car parked on the
// centre zone, the dynamic blocks (off-limits roof, never inked), shoving (kid + squid ahead of a car, a kid at its
// side: never inside it, never through a wall, never into the sea), a kid on the roof slides off, nav marking (the
// footprint while parked, the whole sweep during a warning + move; routes avoid it; goals skip it; a bot whose route
// runs into a newly marked stretch replans), and the warning (lamps / bells) window.
(async () => {
  const g = window.__inkwave, m = g.match, dbg = g.debug, L = __G.level, Ph = __G.physics, nav = __G.nav;
  const { moverPhase } = await import('./src/game/movers.js');
  const { PLAYER } = await import('./src/config.js');
  const THREE = await import('three');
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info: info === undefined ? undefined : JSON.parse(JSON.stringify(info)) });
  const r3 = (v) => Math.round(v * 1000) / 1000;
  dbg.freeze();
  const step = (s) => { const n = Math.max(1, Math.round(s * 60)); for (let i = 0; i < n; i++) dbg.step(1000 / 60); };
  const M = m.movers;
  R('movers on this stage and mode', !!M && M.mode === 'run' && M.cars.length >= 2, { mode: M && M.mode, cars: M && M.cars.map((c) => c.id) });
  if (!M) return out;
  const T = M.T, leg = T.dwell + T.move;
  for (const a of m.actors) if (a.bot) a.bot.update = () => {};
  for (const a of m.actors) { a.intent.move.set(0, 0, 0); a.intent.fire = false; a.intent.squid = false; a.intent.jump = false; }
  // park everyone on their own spawn deck (out of the way)
  const home = (a, i) => { const p = L.spawnPads[a.team]; a.pos.set(p.x + (i % 4) - 1.5, p.y + 0.1, p.z); a.vel.set(0, 0, 0); a.grounded = false; };
  m.actors.forEach(home);
  const setClock = (t) => { m.time = m.duration - t; step(1 / 60); };
  setClock(1); step(0.2);
  const [car, twin] = M.cars;
  R('dynamic blocks live in play: one per car, an off-limits roof, never inked', M.live && M.cars.every((c) => c.block && c.block.dynamic && c.block.roof && !c.block.paint && L.dyn.includes(c.block)),
    { blocks: M.cars.map((c) => c.block && c.block.id), dyn: L.dyn.length });

  // ---- 0) the cars are solid: rays at each side of a car (along its length, floor to roof) hit its own mesh before its
  // centre line, and none of its materials is see-through (a mover's level block is never drawn: its mesh is its body)
  {
    const rc = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3();
    let rays = 0, miss = 0; const missAt = [];
    for (const c of M.cars) {
      if (!c.mesh || !c.mesh.children.length) continue;
      c.mesh.updateMatrixWorld(true);
      for (const side of [-1, 1]) for (let i = 0; i <= 16; i++) {
        const along = -c.len / 2 + 0.4 + (i / 16) * (c.len - 0.8);
        if (Math.abs(along) < 0.6) continue;                            // (the coupling between two cars)
        for (const hy of [1.3, 1.9, 2.6, 3.1]) {
          const px = -c.u.z * side, pz = c.u.x * side;                   // out of the car's side
          o.set(c.pos.x + c.u.x * along + px * (c.wid / 2 + 2), c.pos.y + hy, c.pos.z + c.u.z * along + pz * (c.wid / 2 + 2));
          d.set(-px, 0, -pz);
          rc.set(o, d); rc.far = c.wid / 2 + 2;
          const hit = rc.intersectObject(c.mesh, true);
          rays++; if (!hit.length) { miss++; if (missAt.length < 4) missAt.push([+along.toFixed(2), hy, side]); }
        }
      }
    }
    const see = [];
    for (const c of M.cars) c.mesh && c.mesh.traverse((m) => { if (m.isMesh && (m.material.transparent || m.material.opacity < 1 || m.material.depthWrite === false)) see.push(m.name); });
    R('the cars are solid: rays at their sides hit their bodies; no car material is transparent', rays > 0 && miss === 0 && see.length === 0, { rays, miss, missAt, transparent: see, parts: M.cars.map((c) => c.mesh ? c.mesh.children.length : 0) });
  }

  // ---- 1) the timetable (pure)
  const F = (t) => moverPhase(t, T);
  const mono = []; for (let k = 0; k <= 50; k++) mono.push(F(T.first + (k / 50) * T.move).f);
  const incr = mono.every((f, i) => i === 0 || f >= mono[i - 1] - 1e-9);
  const vmax = Math.max(...Array.from({ length: 101 }, (_, k) => Math.abs(F(T.first + (k / 100) * T.move).v))) * car.span;
  R('timetable: waits at its first stop, moves (eased, one way) to the second, waits, comes back',
    F(0).f === 0 && F(T.first - 0.01).f === 0 && !F(T.first - 0.01).moving && F(T.first + T.move / 2).moving && Math.abs(F(T.first + T.move / 2).f - 0.5) < 1e-6 && incr &&
    F(T.first + T.move + 0.01).f === 1 && !F(T.first + T.move + 0.01).moving && F(T.first + leg - 0.01).f === 1 && F(T.first + leg + T.move / 2).moving && F(T.first + leg + T.move + 0.01).f === 0,
    { first: T.first, dwell: T.dwell, move: T.move, eased: [r3(F(T.first + 0.25).f), r3(F(T.first + T.move / 2).f), r3(F(T.first + T.move - 0.25).f)] });
  R('a believable speed: top speed ≤ 8 m/s, starts and stops at 0', vmax <= 8 && Math.abs(F(T.first + 0.001).v) * car.span < 0.1 && Math.abs(F(T.first + T.move - 0.001).v) * car.span < 0.1,
    { topSpeed: r3(vmax), span: car.span });

  // ---- 2) the live cars follow the match clock, 3) mirror twins at every moment, 4) never parked on the centre zone
  let follow = true, mirror = true, parkedOnZone = false, worstFollow = 0, worstMirror = 0;
  const zone = (L.layout.zones && L.layout.zones.center) || [];
  const zb = zone.map((z) => { const xs = z.poly.map((p) => p[0]), zs = z.poly.map((p) => p[1]); return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]; });
  for (let k = 0; k <= 80; k++) {
    const t = 1 + k * (2 * leg + 3) / 80;
    setClock(t);
    const ph = F(M.t);
    for (const c of M.cars) {
      const want = c.A.clone().addScaledVector(c.u, ph.f * c.span);
      const d = Math.hypot(want.x - c.pos.x, want.z - c.pos.z); worstFollow = Math.max(worstFollow, d); if (d > 0.02) follow = false;
      const bc = c.block.center; if (Math.hypot(bc.x - c.pos.x, bc.z - c.pos.z) > 0.02) follow = false;
      if (!ph.moving) for (const [x0, x1, z0, z1] of zb) {
        const cx0 = c.pos.x - Math.abs(c.u.x) * c.len / 2 - Math.abs(c.u.z) * c.wid / 2, cx1 = c.pos.x + Math.abs(c.u.x) * c.len / 2 + Math.abs(c.u.z) * c.wid / 2;
        const cz0 = c.pos.z - Math.abs(c.u.z) * c.len / 2 - Math.abs(c.u.x) * c.wid / 2, cz1 = c.pos.z + Math.abs(c.u.z) * c.len / 2 + Math.abs(c.u.x) * c.wid / 2;
        if (cx1 > x0 + 1e-3 && cx0 < x1 - 1e-3 && cz1 > z0 + 1e-3 && cz0 < z1 - 1e-3) parkedOnZone = true;
      }
    }
    const dm = Math.hypot(car.pos.x + twin.pos.x, car.pos.z + twin.pos.z) + Math.hypot(car.block.center.x + twin.block.center.x, car.block.center.z + twin.block.center.z);
    worstMirror = Math.max(worstMirror, dm); if (dm > 1e-3) mirror = false;
  }
  R('the cars follow the synced match clock (duration − time) exactly', follow, { worst: r3(worstFollow), t: r3(M.t), clock: r3(m.duration - m.time) });
  R('180° symmetric at every moment: each twin is the mirror (car and collider)', mirror, { worst: worstMirror });
  R('no car ever parks on the centre zone (it only passes through)', !parkedOnZone && zb.length > 0, { zones: zb });

  // ---- 5) shoving: a kid and a squid on the trackbed ahead of Alpha's car, a kid at the side of Bravo's (on the island)
  const A0 = m.actors.filter((a) => a.team === 0), B0 = m.actors.filter((a) => a.team === 1);
  const kid = A0[1], squid = A0[2], side = B0[1];
  setClock(T.first - 1.5);                                  // parked at its first stop, the warning on
  const c0 = car, dirX = Math.sign(c0.u.x) || 1;
  const trackZ = c0.pos.z, frontX = c0.pos.x + dirX * c0.len / 2;
  kid.pos.set(frontX + dirX * 4, 0.02, trackZ + 0.4); kid.vel.set(0, 0, 0); kid.grounded = false;
  squid.pos.set(frontX + dirX * 9, 0.02, trackZ - 0.5); squid.vel.set(0, 0, 0); squid.grounded = false; squid.intent.squid = true;
  // Bravo's kid on the island's edge, overlapping the side of the twin's sweep (the twin runs along Bravo's track)
  side.pos.set(twin.pos.x + Math.sign(twin.u.x) * (twin.len / 2 + 3), 1.02, twin.pos.z - Math.sign(twin.pos.z) * (twin.wid / 2 + 0.2)); side.vel.set(0, 0, 0); side.grounded = false;
  step(0.5);
  let inside = 0, inWall = 0, wet = 0, frames = 0, minY = 99;
  const chest = new THREE.Vector3();
  const watch = [kid, squid, side];
  for (let i = 0; i < Math.round((T.move + 2) * 60); i++) {
    step(1 / 60); frames++;
    for (const a of watch) {
      for (const c of M.cars) { chest.set(a.pos.x, a.pos.y + 0.5, a.pos.z); if (L.pointInBlock(c.block, chest, -0.08)) inside++; }
      if (!Ph.bodyFits(a.pos, PLAYER.radius - 0.08, PLAYER.stepUp + 0.05, PLAYER.height * 0.8, a.form === 'squid')) {
        // (a car counts: only static geometry is a "wall" here)
        let dynHit = false; for (const c of M.cars) { chest.set(a.pos.x, a.pos.y + 0.8, a.pos.z); if (L.pointInBlock(c.block, chest, PLAYER.radius)) dynHit = true; }
        if (!dynHit) inWall++;
      }
      minY = Math.min(minY, a.pos.y); if (a.pos.y < -0.8) wet++;
    }
  }
  const clear = (a, c) => { const px = a.pos.x - c.pos.x, pz = a.pos.z - c.pos.z, la = Math.abs(px * c.u.x + pz * c.u.z), lp = Math.abs(-px * c.u.z + pz * c.u.x); return la > c.len / 2 + PLAYER.radius - 0.05 || lp > c.wid / 2 + PLAYER.radius - 0.05; };
  R('shove: a kid and a squid ahead of a moving car are pushed along ahead of it — never inside it, never through a wall, never into the sea',
    inside === 0 && inWall === 0 && wet === 0 && clear(kid, car) && clear(squid, car) && Math.sign(kid.pos.x - car.pos.x) === dirX,
    { frames, inside, inWall, wet, minY: r3(minY), kid: [r3(kid.pos.x), r3(kid.pos.y), r3(kid.pos.z)], squid: [r3(squid.pos.x), r3(squid.pos.y), r3(squid.pos.z)], car: [r3(car.pos.x), r3(car.pos.z)], shoved: [kid.stats.shoved || 0, squid.stats.shoved || 0] });
  R('shove: a kid on the platform edge beside the passing car is pushed back onto the platform (not onto the track, not under it)',
    clear(side, twin) && side.pos.y > 0.8 && Math.abs(side.pos.z) < Math.abs(twin.pos.z) - twin.wid / 2 - 0.1 && (side.stats.shoved || 0) > 0, { side: [r3(side.pos.x), r3(side.pos.y), r3(side.pos.z)], twin: [r3(twin.pos.x), r3(twin.pos.z)], shoved: side.stats.shoved || 0 });
  squid.intent.squid = false;
  m.actors.forEach(home);

  // ---- 6) nobody rides on top: a kid on a parked car's roof slides off
  setClock(T.first + T.move + 3);                           // parked at its second stop
  const roofX = car.pos.x + Math.sign(car.pos.x || 1) * car.len * 0.3;    // (the end away from the overpasses)
  kid.pos.set(roofX, car.pos.y + car.ht + 0.05, car.pos.z); kid.vel.set(0, 0, 0); kid.grounded = false;
  step(0.3);
  const landed = kid.grounded && kid.ground && kid.ground.block === car.block.id;
  step(3);
  const onCar = (() => { const px = kid.pos.x - car.pos.x, pz = kid.pos.z - car.pos.z, la = Math.abs(px * car.u.x + pz * car.u.z), lp = Math.abs(-px * car.u.z + pz * car.u.x); return la < car.len / 2 && lp < car.wid / 2 && kid.pos.y > car.pos.y + car.ht - 0.2; })();
  const offRoof = !onCar;
  R('its roof is off-limits: a kid landing on it slides off', offRoof, { landedOnRoof: landed, pos: [r3(kid.pos.x), r3(kid.pos.y), r3(kid.pos.z)], roofTop: car.pos.y + car.ht });
  m.actors.forEach(home);

  // ---- 7) nav: the footprint while parked, the whole sweep during the warning + move
  step(0.1);
  const blocked = () => { const ids = []; nav.blocked.forEach((v, i) => { if (v) ids.push(i); }); return ids; };
  const within = (n, c, extra) => { const px = n.x - c.pos.x, pz = n.z - c.pos.z, la = Math.abs(px * c.u.x + pz * c.u.z), lp = Math.abs(-px * c.u.z + pz * c.u.x); return la <= c.len / 2 + extra && lp <= c.wid / 2 + (extra < 0 ? 0.6 : 1.2); };   // (under it: a kid's width off its sides)
  const parkedIds = blocked();
  const parkedOk = parkedIds.length > 0 && parkedIds.every((id) => M.cars.some((c) => within(nav.nodes[id], c, 1.3)));
  const under = M.cars.map((c) => nav.nodes.filter((n) => n.y < 0.5 && within(n, c, -0.3)).map((n) => n.id));
  const allUnder = under.every((l) => l.length > 0 && l.every((id) => nav.blocked[id]));
  R('nav while parked: exactly the nodes under each car (+ a kid\'s width) are marked', parkedOk && allUnder, { marked: parkedIds.length, underEach: under.map((l) => l.length) });
  // a goal under a car resolves elsewhere; a route across the track by the parked car goes round it
  const gUnder = nav.nearest(new THREE.Vector3(car.pos.x, 0.1, car.pos.z), 0.8);
  const gOk = gUnder < 0 || !nav.blocked[gUnder];          // (none in reach, or one off the car)
  const isl = nav.nearest(new THREE.Vector3(car.pos.x, 1.1, car.pos.z - Math.sign(car.pos.z) * 3.2), 0.5);
  const sidep = nav.nearest(new THREE.Vector3(car.pos.x, 1.1, car.pos.z + Math.sign(car.pos.z) * 2.6), 0.5);
  const route = nav.path(isl, sidep, 0);
  const through = route ? route.filter((id) => nav.blocked[id]).length : -1;
  R('routes go round a parked car; a goal under it moves off it', gOk && route && through === 0, { goal: gUnder, from: isl, to: sidep, routeLen: route && route.length, throughCar: through });
  // a bot routed along the other (open) half of the track replans when the warning marks the whole sweep
  const bot = m.actors.find((a) => a.bot && a.team === 0 && a !== kid);
  const openX = -car.pos.x * 0.6;   // the other half of the station
  const s1 = nav.nearest(new THREE.Vector3(openX - 4, 0.1, car.pos.z), 0.5), s2 = nav.nearest(new THREE.Vector3(openX + 4, 0.1, car.pos.z), 0.5);
  const p1 = nav.path(s1, s2, 0);
  bot.bot.path = p1; bot.bot.pi = 1;
  const clean = p1 && p1.every((id) => !nav.blocked[id]);
  setClock(T.first + leg - T.warn + 0.5);                    // the next departure's warning
  const sweepIds = blocked();
  const sweepOk = sweepIds.length > parkedIds.length && under.flat().every((id) => nav.blocked[id]) && p1 && p1.some((id) => nav.blocked[id]);
  R('warning: the whole stretch the car will sweep is marked; a bot routed through it replans', clean && sweepOk && M.warning && bot.bot.path === null,
    { routeClearBefore: clean, markedParked: parkedIds.length, markedWarning: sweepIds.length, warning: M.warning, botPath: bot.bot.path && bot.bot.path.length });
  // ---- 8) the warning window: lamps flash + bells ring from the warning to the car stopping, not otherwise
  const lamp = (i) => { const c = new THREE.Color(); M.lampMesh.getColorAt(i, c); return c.r; };
  setClock(T.first + leg - T.warn - 2);
  const quiet = !M.warning;
  const offLamps = M.lampMesh ? Array.from({ length: M.lamps.length }, (_, i) => lamp(i)) : [];
  setClock(T.first + leg - 1);
  // the sounds (loops through the audio engine's loop bus): the bells ring, the horn blew, the rumble while it moves
  const A = __G.audio, live = (name) => (A && A.loops ? [...A.loops].filter((h) => h.name === name && h.playing).length : -1);
  const bellsNow = live(M.def.signals?.bell || 'crossing_bell'), hornAt = A && A.last ? A.last.get(M.cars[0].def.sounds?.horn || 'train_horn') : undefined;
  let flashes = 0, prev = null;
  for (let i = 0; i < 90; i++) { step(1 / 60); const v = M.lampMesh ? lamp(0) > 1 : false; if (prev !== null && v !== prev) flashes++; prev = v; }
  const warnOn = M.warning;
  step(T.move / 2);
  const runNow = live(M.cars[0].def.sounds?.run || 'train_run');
  setClock(T.first + leg + T.move + 1); step(0.5);
  const bellsAfter = live(M.def.signals?.bell || 'crossing_bell');
  R('sounds: the bells ring through the warning (loop bus), the horn blows before it pulls out, the rumble while it moves, the bells stop when it parks',
    !A || !A.ctx || (bellsNow === M.bellAt.length && hornAt !== undefined && runNow === M.cars.length && bellsAfter === 0),
    { audio: !!(A && A.ctx), bellsNow, hornPlayedAt: hornAt, runNow, bellsAfter, loopBus: !!(A && A.loopIn) });
  R('warnings: quiet while waiting, lamps flash in turn from the warning until the car stops',
    quiet && offLamps.every((v) => v < 1) && warnOn && flashes >= 2 && !M.warning && (M.lamps.length === 0 || M.lamps.length % 2 === 0),
    { lamps: M.lamps.length, bells: M.bellAt.length, flashesIn1_5s: flashes, warnAfterArrival: M.warning });
  R('state() snapshot', !!M.state(), M.state());
  return out;
})()
