// Sub weapons drawn bigger (config SUB_VIEW_SCALE, the visibility pass): the look grows, the gameplay doesn't.
//   MAP=testbox MODE=turf PAGE=tools/botlab/tests/sub-scale.js tools/botlab/run.sh tools/botlab/page.cjs
// Every sub kind plays one scripted scene twice from the same seed: once with its factor set to 1, once at its factor.
// Checks, per kind:
//  - the model (the node that carries the factor, measured in its parent's frame) is `factor` × as big;
//  - gameplay is identical: a per-frame trace of every live object's physics position / state / hp, every event with its
//    radius (bomb:throw / arm / explode, sub:land / cloud / arm / lock / destroyed, weapon:impact), every hit (victim, damage,
//    source), paint splat and sprayed drop, the foe's tracked / poisoned status, and the gameplay areas drawn at their
//    gameplay size (echo / murk clouds, the curtain's sheet) — and the event radii are the config's numbers;
//  - the hitboxes that used to be read off a model, or sit near one, block at the same place: the sprinkler's and the
//    beacon's shot hitbox (the highest blocked shot over it), the waddle's (blockShot / blockRay), the torpedo's (the
//    widest blocked miss), the curtain's width; the bots' aim point on a waddle;
//  - the drawn model sits right: a resting Splat Bomb's bottom within 3 cm of the floor (every frame of its rest), a
//    Cling Charge flush on its wall (3 cm), and the other resting ones on their floor;
//  - the Lurk Mine is hidden from an enemy (sub-tweaks: always, in ink or not) and shown to its own team (a ghost);
//  - sub-tweaks' deliberate gameplay changes, against config: the Twirl Sprinkler's drops land out to sprayRadius − 0.75 m
//    (5.5 m of ink; was 3.2), and the Skitter Bomb / Waddle Bomb / Lurk Mine wait their `delay` (0.45 s) between their
//    windup ('sub:arm') and the blast, to the frame.
// Damage is logged, not dealt (the foe is never splatted, so the two runs stay alike).
(async () => {
  const g = window.__inkwave, m = g.match, dbg = g.debug, THREE = await import('three');
  const { SUBS, SUB_VIEW_SCALE } = await import('./src/config.js');
  const { SUB_KITS } = await import('./src/game/kits/registry.js');
  const { SPRAY_SPLAT } = await import('./src/game/subs.js');
  const { on } = await import('./src/core/ctx.js');
  const G = window.__G, P = G.projectiles, K = SUB_KITS;
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info: info === undefined ? undefined : JSON.parse(JSON.stringify(info)) });
  dbg.freeze();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const step = (n = 1) => { for (let i = 0; i < n; i++) dbg.step(1000 / 60); };
  const r4 = (x) => Math.round(x * 1e4) / 1e4, v4 = (v) => [r4(v.x), r4(v.y), r4(v.z)];
  const last = (a) => a[a.length - 1];
  const me = m.local, others = m.actors.filter((a) => a !== me), foe = others.find((a) => a.team !== me.team);
  // every brain frozen, the local kid's too (page.cjs runs it on ?autopilot): nothing moves or shoots but what a scene says
  for (const a of m.actors) if (a.bot) a.bot.update = () => { const it = a.intent; it.move.set(0, 0, 0); it.fire = it.squid = it.jump = it.sub = it.special = false; };
  // the other six are parked far off and switched off (no movement, weapons or paint: nothing to tell the two runs apart)
  const parked = others.filter((a) => a !== foe);
  for (const a of parked) a.update = () => {};
  const put = (a, p, yaw = 0) => { a.pos.copy(p); a.pos.y += 0.02; a.vel.set(0, 0, 0); a.yaw = a.aimYaw = yaw; if (a.bot) { a.bot.aimYaw = yaw; a.bot.aimPitch = 0; } };
  const aim = (yaw, pitch) => { g.rig.yaw = yaw; g.rig.pitch = pitch; me.aimYaw = me.yaw = yaw; me.aimPitch = pitch; };
  const T = V(0, 0, -8), FAR = V(-22, 0, 34);

  // ---- recording (wrappers stay in place for the test, restored at the end)
  const rnd0 = Math.random, hit0 = P.applyHit, splat0 = G.paint.splat, drop0 = P.spawnDrop;
  // cosmetic FX droplets ink where they land offline (main.js onDropletLand) and leave specks (fxHooks onSpeck: cosmetic
  // splats that draw from Math.random), on the FX module's own unseeded random and timing: off for the test, so the two
  // runs can be compared (the kits' FX droplets start where they always did)
  const land0 = G.fx?.onDropletLand, speck0 = G.fx?.onSpeck; if (G.fx) { G.fx.onDropletLand = null; G.fx.onSpeck = null; }
  // sounds draw pitch jitter from Math.random, gated by wall-clock voice limits: silent stand-ins for the test
  const A = G.audio, quiet = { set() {}, stop() {} };
  if (A) { A.play = () => null; A.loop = () => quiet; }
  // (and the HUD's turf pops draw from it on their own clock)
  const H = g.hud; if (H?._turfPop) H._turfPop = () => {};
  let seed = 1, rec = null;
  Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  P.applyHit = function (att, vic, dmg, wid) { if (rec) rec.push(['hit', vic === foe ? 'foe' : vic?.nid, r4(dmg), wid]); };   // logged, not dealt
  G.paint.splat = function (c, r, team, o) { if (rec && !o?.cosmetic) rec.push(['paint', v4(c), r4(r), team]); return splat0.call(this, c, r, team, o); };
  P.spawnDrop = function (a, pos, vx, vy, vz, o) { if (rec) rec.push(['drop', v4(pos), r4(vx), r4(vy), r4(vz), r4(o?.damage || 0), r4(o?.radius || 0)]); return drop0.call(this, a, pos, vx, vy, vz, o); };
  const offs = ['bomb:throw', 'bomb:explode', 'sub:land', 'sub:cloud', 'sub:arm', 'bomb:arm', 'sub:lock', 'sub:destroyed', 'weapon:impact'].map((n) => on(n, (e) => { if (rec) rec.push(['ev', n, r4(e.radius ?? -1), e.pos ? v4(e.pos) : null]); }));
  const kitItems = () => [
    ...K.shaker.items.map((it) => ['shaker', it.state, v4(it.pos), it.left]),
    ...K.waddle.items.map((it) => ['waddle', it.state, v4(it.pos), r4(it.hp)]),
    ...K.torpedo._list.map((t) => ['torpedo', t.state, v4(t.pos), r4(t.hp)]),
    ...K.tracer._bolts.map((b) => ['tracer', b.state, v4(b.pos), b.bounces]),
    ...K.boomerang._items.map((it) => ['boomerang', it.state, v4(it.pos)]),
  ];
  function snap() {
    rec.push(['f',
      P.bombs.map((b) => [b.kind, v4(b.pos), r4(b.fuse)]),
      G.subs.items.map((it) => [it.kind, it.state, v4(it.pos), r4(it.hp ?? 0), it.cloud ? r4(it.cloud.scale.x) : 0,
        it.sheet ? [r4(it.sheet.geometry.parameters.width), r4(it.sheet.geometry.parameters.height), r4(it.sheet.scale.y)] : 0]),
      kitItems(), [r4(foe.status.track || 0), r4(foe.status.poison || 0)]]);
  }
  const run = (n, done) => { for (let i = 0; i < n; i++) { step(1); snap(); if (done && done()) break; } };

  function reset() {
    G.subs.clear(); P.clear(); G.paint.clear?.(); G.fx?.clear?.();
    others.forEach((a, i) => put(a, V(FAR.x + (i % 4) * 1.5, 0, FAR.z + Math.floor(i / 4) * 1.5)));
    put(me, T, 0); me.ink = 100;
    foe.status.track = 0; foe.status.poison = 0;
    g.rig.follow(me, true); aim(0, 0.1);
    step(2); if (g.rig.blend) g.rig.blend.active = false; step(4);
    seed = 4242;
  }

  // the node that carries a kind's drawn size, and its size in its parent's frame
  const subModel = (it) => it.mesh.userData.inner.children[0];
  const scaledNode = {
    bomb: (b) => b.mesh.children[0], shaker: (it) => it.m.model, waddle: (it) => it.m.model, torpedo: (t) => t.mesh.userData.model,
    tracer: (b) => b.head.children[0], boomerang: (it) => it.mesh.userData.spin.children[0],
  };
  function localSize(node) {
    node.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(node.parent.matrixWorld).invert(), box = new THREE.Box3(), tmp = new THREE.Box3(), mm = new THREE.Matrix4();
    node.traverse((o) => { if (!o.isMesh || !o.geometry) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); mm.multiplyMatrices(inv, o.matrixWorld); box.union(tmp.copy(o.geometry.boundingBox).applyMatrix4(mm)); });
    return box.getSize(new THREE.Vector3());
  }
  const worldBox = (o) => { o.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(o, true); };
  const objOf = (kind) => {
    if (kind === 'bomb') return last(P.bombs);
    const L = { shaker: K.shaker.items, waddle: K.waddle.items, torpedo: K.torpedo._list, tracer: K.tracer._bolts, boomerang: K.boomerang._items }[kind];
    return L ? last(L) : last(G.subs.items.filter((it) => it.kind === kind));
  };
  const nodeOf = (kind, o) => (scaledNode[kind] || subModel)(o);

  // a horizontal shot along +x at height y over / past p (z offset dz): does the kind's blockShot stop it? (0 damage)
  const shotAt = (p, y, dz = 0, team = foe.team) => G.subs.blockShot(V(p.x - 3, y, p.z + dz), V(p.x + 3, y, p.z + dz), team, 0);
  const rayAt = (p, y, dz = 0, team = foe.team) => G.subs.blockRay(V(p.x - 3, y, p.z + dz), V(1, 0, 0), 6, team, 0) < 5.9;
  // the edge of what blocks: the largest value in [lo, hi] for which blocked(v) (to 1 mm)
  const edge = (blocked, lo, hi) => { if (!blocked(lo)) return null; if (blocked(hi)) return hi; for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (blocked(mid)) lo = mid; else hi = mid; } return r4(Math.round(lo * 1000) / 1000); };

  // ---- the scenes: throw / place, then play it out (the same inputs in both runs); `probe` adds hitbox edges to the trace
  const S = V(0, 0, -1);
  const scenes = {
    bomb(o) {
      put(foe, V(1.6, 0, -1), Math.PI);
      P.throwBomb(me); const b = last(P.bombs); b.pos.set(S.x, 0.5, S.z); b.vel.set(0, -1, 0); o.first(b);
      run(40, () => b.fuse >= 0); run(20);                      // landed and settling (0.35 s of its fuse)
      o.rest(b); run(120, () => !P.bombs.includes(b));
    },
    sticky(o) {
      put(me, V(7, 0, 0), Math.PI / 2); aim(Math.PI / 2, 0); put(foe, V(12.3, 0, 1.4), 0);
      G.subs._throw(me, SUBS.sticky, V(13.2, 1.2, 0), V(10, 0, 0), false); const it = objOf('sticky'); o.first(it);
      run(60, () => it.state === 'stuck'); run(6); o.rest(it); run(200, () => it.state === 'dead');
    },
    burst(o) {
      put(foe, V(1.4, 0, -1), Math.PI);
      G.subs._throw(me, SUBS.burst, V(S.x, 0.8, S.z), V(0, -3, 0), false); o.first(objOf('burst')); run(30);
      // a direct hit
      G.subs._throw(me, SUBS.burst, V(1.4, 0.9, -2.4), V(0, 0, 9), false); run(30);
    },
    seeker(o) { put(foe, V(3, 0, 7), Math.PI); G.subs.use(me, SUBS.seeker); const it = objOf('seeker'); o.first(it); run(360, () => it.state === 'dead'); },
    scan(o) { put(foe, V(1.6, 0, -1), Math.PI); G.subs._throw(me, SUBS.scan, V(S.x, 1.4, S.z), V(0, -1, 0), false); const it = objOf('scan'); o.first(it); run(120, () => it.state === 'dead'); },
    mist(o) { put(foe, V(1.6, 0, -1), Math.PI); G.subs._throw(me, SUBS.mist, V(S.x, 1.4, S.z), V(0, -1, 0), false); const it = objOf('mist'); o.first(it); run(330, () => it.state === 'dead'); },
    curtain(o) {
      G.subs._throw(me, SUBS.curtain, V(S.x, 0.5, S.z), V(0, -2, 0.02), false); const it = objOf('curtain'); o.first(it);
      run(40); o.rest(it);
      // how far along it (±x) and how high a shot through it (along z) is stopped
      const across = (x, y) => G.subs.blockShot(V(S.x + x, y, S.z - 1), V(S.x + x, y, S.z + 1), foe.team, 0);
      rec.push(['curtainEdge', edge((x) => across(x, 1), 0, 4), edge((y) => across(0, y), 0.5, 4)]);
      run(20);
    },
    sprinkler(o) {
      G.subs._throw(me, SUBS.sprinkler, V(S.x, 0.5, S.z), V(0, -2, 0), false); const it = objOf('sprinkler'); o.first(it);
      run(60, () => it.state === 'spray'); run(20); o.rest(it);
      rec.push(['hitTop', edge((y) => shotAt(it.pos, y), 0.02, 2), 'hitSide', edge((dz) => shotAt(it.pos, 0.1, dz), 0, 2), 'hitH', r4(it.mesh.userData.hitH)]);
      run(40);
    },
    beacon(o) {
      put(me, S, 0); step(1); G.subs.use(me, SUBS.beacon); put(me, T, 0); const it = objOf('beacon'); o.first(it);
      run(20); o.rest(it);
      rec.push(['hitTop', edge((y) => shotAt(it.pos, y), 0.02, 2.5), 'hitSide', edge((dz) => shotAt(it.pos, 0.2, dz), 0, 2), 'hitH', r4(it.mesh.userData.hitH)]);
    },
    mine(o) {
      put(me, S, 0); step(1); G.subs.use(me, SUBS.mine); put(me, T, 0); const it = objOf('mine'); o.first(it);
      run(70); o.rest(it); o.mineSight(it);
      put(foe, V(1.5, 0, -1), Math.PI); run(90, () => it.state === 'dead');
    },
    shaker(o) {
      put(foe, V(1.6, 0, -1), Math.PI);
      G.subs.use(me, SUBS.shaker); const it = objOf('shaker'); it.pos.set(S.x, 0.5, S.z); it.vel.set(0, -1, 0); o.first(it);
      run(60, () => it.armed && it.ground > 0); run(14); o.rest(it); run(150, () => it.state === 'dead');
    },
    waddle(o) {
      G.subs.use(me, SUBS.waddle); const it = objOf('waddle'); it.pos.set(S.x, 0.5, S.z); it.vel.set(0, -1, 0); o.first(it);
      run(60, () => it.state === 'sense'); run(4); o.rest(it);
      const thr = K.waddle.threats([]).find((x) => x.obj === it);
      rec.push(['hitTop', edge((y) => shotAt(it.pos, y), 0.02, 2), 'rayTop', edge((y) => rayAt(it.pos, y), 0.02, 2), 'hitSide', edge((dz) => shotAt(it.pos, 0.2, dz), 0, 2), 'aimY', r4(thr?.aimY ?? -1)]);
      put(foe, V(3.5, 0, 1), Math.PI); run(300, () => it.state === 'dead');
    },
    torpedo(o) {
      put(foe, V(0, 0, -2), Math.PI);
      G.subs.use(me, SUBS.torpedo); const t = objOf('torpedo'); o.first(t);
      run(90, () => t.state === 'unfold'); run(10);
      rec.push(['hitR', edge((dz) => { const p = t.pos, ok = K.torpedo.blockShot(V(p.x - 3, p.y, p.z + dz), V(p.x + 3, p.y, p.z + dz), foe.team, 0); return ok; }, 0, 2)]);
      run(240, () => t.state === 'dead');
    },
    tracer(o) { aim(0, -0.1); step(3); put(foe, V(0.2, 0, 3), Math.PI); G.subs.use(me, SUBS.tracer); o.first(objOf('tracer')); run(70); },
    boomerang(o) { put(foe, V(0.8, 0, 1.3), Math.PI); G.subs.use(me, SUBS.boomerang); const it = objOf('boomerang'); o.first(it); run(480, () => it.state === 'dead'); },
  };

  const FACTORS = { ...SUB_VIEW_SCALE };
  const KINDS = Object.keys(scenes);
  const rows = [];
  try {
    R('every sub kind in the table has a scene (and every kind has a factor)', KINDS.every((k) => FACTORS[k] > 0) && Object.keys(SUBS).every((k) => KINDS.includes(k)), { factors: FACTORS });
    for (const kind of KINDS) {
      const res = {};
      // a first, unrecorded run warms what's made on first use (materials, shaders, cached geometry: three.js draws a
      // Math.random UUID for each), and lets any shot the foe's weapon still had queued go; then ×1 and ×factor
      for (const f of [0, 1, FACTORS[kind]]) {
        SUB_VIEW_SCALE[kind] = f || FACTORS[kind];
        reset();
        const r = { trace: [], size: null, rest: null };
        rec = r.trace;
        try {
          scenes[kind]({
            first: (o) => { r.size = localSize(nodeOf(kind, o)); },
            rest: (o) => { r.rest = o; r.box = worldBox(o.mesh?.userData?.inner || nodeOf(kind, o)); r.restFrames = []; },
            mineSight: (it) => {
              const L = G.local; G.local = foe; G.subs._mine(it, 0); const hidden = !it.mesh.visible;
              G.local = L; G.subs._mine(it, 0); const shown = it.mesh.visible;
              r.mine = { hidden, shown, inOwnInk: it.face >= 0 && G.paint.sample(it.face, it.u, it.v) - 1 === it.team };
            },
          });
        } catch (e) { r.err = e.message + ' ' + (e.stack || '').split('\n')[1]; }
        rec = null;
        if (!f) continue;
        res[f === 1 ? 'one' : 'big'] = r;
        if (FACTORS[kind] === 1) res.big = r;
      }
      SUB_VIEW_SCALE[kind] = FACTORS[kind];
      const A = res.one, B = res.big, F = FACTORS[kind];
      if (A.err || B.err) { R(`${kind}: scene ran`, false, { one: A.err, big: B.err }); continue; }
      // 1) drawn bigger by its factor
      const ratio = A.size && B.size ? [B.size.x / A.size.x, B.size.y / A.size.y, B.size.z / A.size.z].map((x) => +x.toFixed(4)) : null;
      R(`${kind}: model drawn ×${F} (size in its own frame)`, ratio && ratio.every((x) => Math.abs(x - F) < 0.01 * F), { factor: F, before: A.size && v4(A.size), after: B.size && v4(B.size), ratio });
      // 2) gameplay identical
      const ja = A.trace.map((x) => JSON.stringify(x)), jb = B.trace.map((x) => JSON.stringify(x));
      let diff = -1; for (let i = 0; i < Math.max(ja.length, jb.length); i++) if (ja[i] !== jb[i]) { diff = i; break; }
      const counts = (t) => ({ frames: t.filter((x) => x[0] === 'f').length, hits: t.filter((x) => x[0] === 'hit').length, paints: t.filter((x) => x[0] === 'paint').length, drops: t.filter((x) => x[0] === 'drop').length, events: t.filter((x) => x[0] === 'ev').length });
      R(`${kind}: gameplay identical at ×1 and ×${F} (positions, states, hp, events, hits, paint, drops, statuses, hitboxes)`, diff < 0,
        diff < 0 ? counts(B.trace) : { at: diff, one: ja[diff]?.slice(0, 300), big: jb[diff]?.slice(0, 300) });
      // 3) event radii are the config's
      const s = SUBS[kind], allowed = new Set([s.radius, s.hitRadius, s.senseRadius, s.width / 2, s.triggerRadius, s.puddleRadius * 0.5, 0, -1].filter((x) => x !== undefined && !Number.isNaN(x)).map(r4));
      // (weapon:impact: the tracer's puddles; for the others, where their sprayed / shaken drops land — their own sizes)
      const radii = [...new Set(B.trace.filter((x) => x[0] === 'ev' && (x[1] !== 'weapon:impact' || kind === 'tracer')).map((x) => `${x[1]}:${x[2]}`))];
      const bad = radii.filter((x) => !allowed.has(+x.split(':').pop()));
      R(`${kind}: event radii are config numbers`, bad.length === 0, { radii, config: [...allowed] });
      const probes = B.trace.filter((x) => ['hitTop', 'hitR', 'curtainEdge'].includes(x[0]));
      if (probes.length) R(`${kind}: hitbox edges (same at ×1 and ×${F}: part of the trace above)`, true, probes);
      rows.push({ kind, F, before: A.size && +Math.max(A.size.x, A.size.y, A.size.z).toFixed(3), after: B.size && +Math.max(B.size.x, B.size.y, B.size.z).toFixed(3) });
      // 4) sits right
      if (B.rest && B.box) {
        const bx = B.box, o = B.rest;
        if (kind === 'sticky') {
          const gap = +(14 - bx.max.x).toFixed(4);
          R('sticky: the Cling Charge sits flush on its wall (model within 3 cm of the wall face, none of it inside)', Math.abs(gap) <= 0.03, { wallX: 14, modelMaxX: +bx.max.x.toFixed(4), gap, stuckAt: v4(o.pos) });
        } else if (kind === 'curtain' || kind === 'sprinkler' || kind === 'beacon' || kind === 'mine' || kind === 'waddle' || kind === 'shaker' || kind === 'bomb') {
          R(`${kind}: the drawn model rests on the floor (bottom within 3 cm)`, Math.abs(bx.min.y) <= 0.03, { floorY: 0, modelMinY: +bx.min.y.toFixed(4), modelTopY: +bx.max.y.toFixed(3) });
        }
      }
      if (kind === 'mine' && B.mine) R('mine: hidden from an enemy (in its owner\'s ink or not), shown to its own team', B.mine.hidden && B.mine.shown && B.mine.inOwnInk && A.mine.hidden && A.mine.shown, { big: B.mine, one: A.mine });
      // 5) sub-tweaks, the deliberate changes against config
      if (kind === 'sprinkler') {
        // its drops' landings (the drop impacts round it in the trace): out to sprayRadius − SPRAY_SPLAT, the far ring reached
        const sp = B.trace.find((x) => x[0] === 'f' && x[2].some((it) => it[0] === 'sprinkler' && it[1] === 'spray'));
        const at = sp && sp[2].find((it) => it[0] === 'sprinkler')[2];
        const ds = B.trace.filter((x) => x[0] === 'ev' && x[1] === 'weapon:impact' && x[3] && at).map((x) => Math.hypot(x[3][0] - at[0], x[3][2] - at[2]));
        const R1 = s.sprayRadius - SPRAY_SPLAT, far = ds.length ? Math.max(...ds) : 0;
        R(`sprinkler: its drops land out to sprayRadius − ${SPRAY_SPLAT} m (${r4(R1)}; ink to ${s.sprayRadius} m, was 3.2), the far ring reached`, ds.length >= 8 && far <= R1 + 0.3 && far >= R1 - 1, { landings: ds.length, furthest: r4(far), config: { sprayRadius: s.sprayRadius, drops: s.drops, dropDamage: s.dropDamage } });
      }
      if (kind === 'seeker' || kind === 'waddle' || kind === 'mine') {
        // frames from its windup (sub:arm) to the blast (bomb:explode): `delay` s, to the frame
        let ia = -1, ie = -1; B.trace.forEach((x, i) => { if (x[0] === 'ev' && x[1] === 'sub:arm' && ia < 0) ia = i; if (x[0] === 'ev' && x[1] === 'bomb:explode' && ia >= 0 && ie < 0) ie = i; });
        const frames = ia >= 0 && ie >= 0 ? B.trace.slice(ia, ie).filter((x) => x[0] === 'f').length : -1;
        R(`${kind}: its windup lasts its config delay (${s.delay} s = ${Math.round(s.delay * 60)} frames) from the trigger to the blast`, ia >= 0 && ie > ia && Math.abs(frames / 60 - s.delay) <= 1 / 60 + 1e-9, { frames, secs: r4(frames / 60), delay: s.delay });
      }
    }
    // the resting Splat Bomb, frame by frame: its physics centre bobs 0.03–0.21 m; the drawn ball stays on the floor
    {
      reset();
      P.throwBomb(me); const b = last(P.bombs); b.pos.set(S.x, 0.5, S.z); b.vel.set(0, -1, 0);
      for (let i = 0; i < 60 && b.fuse < 0; i++) step(1);
      step(12);
      const ys = [], cy = [];
      for (let i = 0; i < 30 && P.bombs.includes(b); i++) { step(1); ys.push(+worldBox(b.body).min.y.toFixed(4)); cy.push(+b.pos.y.toFixed(3)); }
      R('bomb: a resting Splat Bomb\'s drawn ball stays on the floor every frame (bottom within 3 cm) while its physics centre bobs', ys.length > 20 && ys.every((y) => Math.abs(y) <= 0.03),
        { bottomMin: Math.min(...ys), bottomMax: Math.max(...ys), physicsCentreY: [Math.min(...cy), Math.max(...cy)], frames: ys.length });
    }
    R('factors (the drawn size, largest dimension in m: at ×1 → at the factor)', true, rows);
  } finally {
    Object.assign(SUB_VIEW_SCALE, FACTORS);
    Math.random = rnd0; delete P.applyHit; delete P.spawnDrop; delete G.paint.splat;
    if (P.applyHit !== hit0) P.applyHit = hit0;
    if (G.paint.splat !== splat0) G.paint.splat = splat0;
    if (P.spawnDrop !== drop0) P.spawnDrop = drop0;
    offs.forEach((f) => f());
    if (G.fx) { G.fx.onDropletLand = land0; G.fx.onSpeck = speck0; }
    if (A) { delete A.play; delete A.loop; }
    if (H) delete H._turfPop;
    for (const a of parked) delete a.update;
    G.subs.clear(); P.clear();
  }
  return out;
})()
