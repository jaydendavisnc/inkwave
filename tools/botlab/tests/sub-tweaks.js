// sub-tweaks (2026-10-01, the user: "make the sprinkler work further away, make the mines invisible to the enemy team and
// transparent to you then only shows itself before it explodes, give the beacon a sonar effect and have a usage indicator
// on it, add an hp meter to the drip curtain for it's ink, and add a short delay explosion for skitter/wattle/mine bombs").
//   MAP=testbox MODE=turf PAGE=tools/botlab/tests/sub-tweaks.js tools/botlab/run.sh tools/botlab/page.cjs
//   PAGE_ARGS='only=sprinkler,mine,beacon,curtain,windup' for a part
// Staged on testbox (a flat deck, top y 0; everyone else parked far off with their brains stubbed unless a scene wakes
// one). Checks:
//  - Twirl Sprinkler: its ink reaches ~sprayRadius (5.5 m) — the ring at 4.7–5.3 m well covered after 12 s, nothing
//    past ~6.3 m; the landings spread evenly over the disc's area (the far half of the area gets about half the drops);
//    drops a pulse / damage per drop from config; a painting bot weighs the new reach (its turf check, teammates' sprinklers);
//  - Lurk Mine: invisible to the enemy team (no mesh: no shadow; no danger area for an enemy bot, nothing a bot knows),
//    a translucent pulsing team-tinted ghost to its own team, popped up and opaque for everyone through its windup — on a
//    ghost too (an enemy client: the owner's update record trips it there);
//  - Hop Beacon: two lights (lit), a sonar ring / shell every ~1.75 s (its team's, the other team's faint); after a
//    jump one light dark, the other blinking, the lamp dimmed; the jump map's labels; online: the ghost's lights follow
//    the owner's record, a jump onto a ghost goes to the owner;
//  - Drip Curtain: its meter tracks hp (decay and hits), on both faces, above the sheet; online: hits reach the ghost;
//  - Skitter Bomb / Waddle Bomb / Lurk Mine: each waits its windup (`delay`) between triggering and the blast, with its
//    tell (swelling / pop-up, its blast radius as a danger ring + beep pulses — the Splat Bomb's look — and its warning
//    cue) and a danger area the bots read; no damage before the blast;
//    a target who walks out during the windup takes none; a bot in it notices and runs its escape.
(async () => {
  const g = window.__inkwave, m = g.match, dbg = g.debug, THREE = await import('three');
  const { SUBS, PLAYER } = await import('./src/config.js');
  const { SUB_KITS } = await import('./src/game/kits/registry.js');
  const { specialDangers, SPECIAL_STATS } = await import('./src/game/botSpecials.js');
  const { getPlasticMaterial } = await import('./src/game/character-mats.js');
  const { SPRAY_SPLAT } = await import('./src/game/subs.js');
  const { on } = await import('./src/core/ctx.js');
  const G = window.__G, P = G.projectiles, S = G.subs, K = SUB_KITS, C = G.cues;
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info: info === undefined ? undefined : JSON.parse(JSON.stringify(info)) });
  const ONLY = (/only=([\w,]+)/.exec(window.__pageArgs || '') || [])[1];
  const want = (k) => !ONLY || ONLY.split(',').includes(k);
  dbg.freeze();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
  const DT = 1 / 60;
  let hook = null;   // per-frame scene hook (before each frame)
  const frame = () => { if (hook) hook(); g._skipRender = true; g._frame(DT); g._skipRender = false; };
  const step = (s, fn) => { const n = Math.max(1, Math.round(s * 60)); for (let i = 0; i < n; i++) { frame(); if (fn && fn(i) === false) return i; } return n; };
  const me = m.local, others = m.actors.filter((a) => a !== me);
  const foe = others.find((a) => a.team !== me.team), mate = others.find((a) => a.team === me.team);
  const zero = (a) => { const it = a.intent; it.move.set(0, 0, 0); it.fire = it.squid = it.jump = it.sub = it.special = false; };
  const stub = (a) => { if (a.bot) a.bot.update = () => zero(a); };
  for (const a of m.actors) stub(a);
  const put = (a, p, yaw = 0) => { a.pos.copy(p); a.pos.y += 0.02; a.vel.set(0, 0, 0); a.yaw = a.aimYaw = yaw; if (a.bot) { a.bot.aimYaw = yaw; a.bot.aimPitch = 0; } };
  // (you — the local kid — stand well off, facing away: a round your weapon still had going must land nowhere near a scene)
  const HOME = V(18, 0, -30);
  const parkAll = () => others.forEach((a, i) => put(a, V(-22 + (i % 4) * 2, 0, 30 + Math.floor(i / 4) * 2)));
  // hits are logged, not dealt (nobody's splatted, so the scenes stay alike)
  const hit0 = P.applyHit, hits = [];
  P.applyHit = function (att, vic, dmg, wid) { hits.push({ t: G.time, vic, dmg: r2(dmg), wid }); };
  // what the cue director was asked to play (one-shots), before any audio-context check
  const one0 = C.one, cues = [];
  C.one = function (name, o) { cues.push({ t: G.time, name, kind: o && o.kind }); return one0.call(this, name, o); };
  // the windup tells drawn (fx.js: the danger ring at the blast radius every frame, the beep pulses)
  const fxLog = [], ring0 = G.fx?.dangerRing, beep0 = G.fx?.beepPulse;
  if (G.fx) {
    G.fx.dangerRing = function (pos, n, col, r, k) { fxLog.push({ t: G.time, f: 'ring', r: r2(r) }); return ring0.apply(this, arguments); };
    G.fx.beepPulse = function (bp, gp, n, col, r, k) { fxLog.push({ t: G.time, f: 'beep', r: r2(r) }); return beep0.apply(this, arguments); };
  }
  const evs = [];
  const offs = ['sub:arm', 'bomb:explode'].map((n) => on(n, (e) => evs.push({ t: G.time, n, kind: e.kind || null, team: e.team, pos: e.pos && { x: e.pos.x, y: e.pos.y, z: e.pos.z } })));
  const reset = () => {
    hook = null; S.viewer = null;
    S.clear(); P.clear(); G.paint.clear?.();
    for (const a of m.actors) { if (!a.alive) a.respawn(); a.hp = PLAYER.hp; a.invuln = 0; a.status.track = 0; zero(a); a.form = 'kid'; a.superJumpState = null; stub(a); }
    parkAll(); put(me, HOME, Math.PI); me.ink = PLAYER.inkMax;
    step(0.1);
    hits.length = 0; cues.length = 0; evs.length = 0; fxLog.length = 0;
  };
  const items = (kind) => S.items.filter((it) => it.kind === kind && it.state !== 'dead');
  const last = (a) => a[a.length - 1];
  // the paint under (x, z) on the deck: 0 none, 1 team 0, 2 team 1
  const inkAt = (x, z) => { const h = G.physics.raycast(V(x, 1, z), V(0, -1, 0), 3); return h && h.hit ? G.paint.sample(h.face, h.u, h.v) : -1; };
  const ring = (cx, cz, r0, r1, team) => { let n = 0, own = 0; for (let r = r0; r <= r1 + 1e-6; r += 0.15) for (let k = 0; k < 96; k++) { const a = (k / 96) * Math.PI * 2; const v = inkAt(cx + Math.cos(a) * r, cz + Math.sin(a) * r); if (v < 0) continue; n++; if (v === team + 1) own++; } return n ? own / n : 0; };
  // a stub of the online session (netmatch) round a scene: records what the owner sends; nothing leaves the page
  const sent = [];
  const netOn = () => { m.actors.forEach((a, i) => { if (a.nid === undefined) { a.nid = i; a._tnid = true; } }); G.netm = { mute: 0, applying: false, isHost: true, byNid: new Map(), recSplat() {}, recProj() {}, recBomb() {}, recZone() {}, recTower() {}, recPods() {}, recBoss() {},
    recKit: (a, kind, data) => sent.push({ kind, data: JSON.parse(JSON.stringify(data)) }), sendDevHit: (o, kind, id, d) => sent.push({ dev: kind, id, d }),
    shouldApplyHit: () => 'local', sendHit: () => false, applyRemote() {}, sendResult() {}, sendEnd() {} }; sent.length = 0; };
  const netOff = () => { G.netm = null; for (const a of m.actors) if (a._tnid) { delete a.nid; delete a._tnid; } };

  try {
    // ============================================================================================ Twirl Sprinkler
    if (want('sprinkler')) {
      reset();
      const s = SUBS.sprinkler, drops = [];
      // (the cosmetic FX droplets off a splash ink where they land offline — main.js onDropletLand — on their own random
      // way: off for this measurement, so it reads the sprinkler's own ink)
      const land0 = G.fx?.onDropletLand, speck0 = G.fx?.onSpeck; if (G.fx) { G.fx.onDropletLand = null; G.fx.onSpeck = null; }
      const drop0 = P.spawnDrop;
      P.spawnDrop = function (a, pos, vx, vy, vz, o) { if (o && o.weaponId === 'sprinkler') drops.push({ t: G.time, dmg: o.damage }); return drop0.call(this, a, pos, vx, vy, vz, o); };
      // (its drops' landings: the drop impacts round it — nothing else of team 0 paints within 9 m of it here)
      const lands = []; const offL = on('weapon:impact', (e) => { if (e.kind === 'drop' && e.team === me.team && Math.hypot(e.pos.x, e.pos.z) < 9) lands.push(Math.hypot(e.pos.x, e.pos.z)); });
      S._throw(me, s, V(0, 0.5, 0), V(0, -2, 0), false);
      const it = last(items('sprinkler'));
      step(0.5);
      const t0 = G.time, n0 = drops.length;
      step(6);
      const perSec = (drops.length - n0) / (G.time - t0);
      step(6);
      P.spawnDrop = drop0; offL(); if (G.fx) { G.fx.onDropletLand = land0; G.fx.onSpeck = speck0; }
      const c = it.pos;
      const cov = { mid: r2(ring(c.x, c.z, 1, 3, me.team)), old: r2(ring(c.x, c.z, 3.2, 4.4, me.team)), far: r2(ring(c.x, c.z, 4.7, 5.3, me.team)), past: r2(ring(c.x, c.z, 6.6, 7.6, me.team)) };
      // the furthest inked spot along 48 directions (to 8 m, every 5 cm)
      const reach = []; for (let k = 0; k < 48; k++) { const a = (k / 48) * Math.PI * 2; let rr = 0; for (let r = 0.5; r <= 8; r += 0.05) if (inkAt(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r) === me.team + 1) rr = r; reach.push(rr); }
      reach.sort((a, b) => a - b);
      // (a landed drop's splat stretches along its flight: a stray finger past the edge now and then — the 90th percentile)
      const med = reach[reach.length >> 1], p90 = reach[Math.floor(reach.length * 0.9)];
      R(`Twirl Sprinkler reaches ~${s.sprayRadius} m (was 3.2): after 12 s the ring at 4.7–5.3 m is well inked (≥ 35 %), the middle too (≥ 60 %), next to nothing past ~6.5 m; the furthest ink along most directions is 5–6.2 m`,
        it.state === 'spray' && cov.far >= 0.35 && cov.mid >= 0.6 && cov.past <= 0.03 && med >= 5 && med <= 6.2 && p90 <= 6.5, { cov, reachMedian: r2(med), reach90: r2(p90), reachMax: r2(reach[reach.length - 1]), reachMin: r2(reach[0]) });
      // landings: evenly over the AREA (the outer half of the area — r > R/√2 — gets about half of them)
      const L = lands.filter((d) => d > 0.3), R1 = s.sprayRadius - SPRAY_SPLAT, outerHalf = L.filter((d) => d > Math.sqrt((R1 * R1 + 0.25) / 2)).length / Math.max(1, L.length);
      R(`its drops land evenly over the disc's area, out to sprayRadius − ${SPRAY_SPLAT} m (their own splat reaches the rest): the far ring isn't thinner than the middle`,
        L.length > 150 && outerHalf > 0.42 && outerHalf < 0.6 && Math.max(...L) < R1 + 0.35 && Math.max(...L) > R1 - 0.4, { landed: L.length, outerHalf: r2(outerHalf), maxLanding: r2(Math.max(...L)), meanLanding: r2(L.reduce((a, b) => a + b, 0) / L.length) });
      R(`its ink output: ${s.drops} drops a pulse every ${s.pulse} s (≈ ${r2(s.drops / s.pulse)} a second, was 20), ${s.dropDamage} damage each (unchanged)`,
        Math.abs(perSec - s.drops / s.pulse) < 1.2 && s.drops === 7 && s.dropDamage === 8 && drops.every((d) => d.dmg === s.dropDamage), { perSec: r2(perSec), dmg: [...new Set(drops.map((d) => d.dmg))] });
      // a painting bot weighs the new reach (bots.js _paintSub): its turf check spans 0.8 × sprayRadius round where a
      // paint-mode lob lands, and a spot a teammate's sprinkler already covers is left alone
      reset();
      const B = mate.bot, rs0 = G.paint.regionStats, rnd0 = Math.random, asked = [];
      put(mate, V(-10, 0, -20), 0); mate.setSub('sprinkler'); mate.ink = PLAYER.inkMax;
      G.paint.regionStats = function (x, y, z, r, team, o) { asked.push({ x: r2(x), z: r2(z), r: r2(r) }); return rs0.call(this, x, y, z, r, team, o); };
      Math.random = () => 0.001;
      let go1 = false, go2 = true;
      try {
        go1 = B._paintSub();
        S._throw(me, s, V(-10, 0.5, -14.5), V(0, -2, 0), false); step(0.4);
        go2 = B._paintSub();
      } finally { Math.random = rnd0; G.paint.regionStats = rs0; }
      R('a bot placing a sprinkler weighs its new reach: the turf check is 0.8 × sprayRadius round where its lob lands (~5.5 m ahead); not where a teammate\'s sprinkler already sprays',
        asked.length >= 1 && Math.abs(asked[0].r - 0.8 * s.sprayRadius) < 0.01 && go1 === true && go2 === false, { asked, go1, go2 });
    }

    // ============================================================================================ Lurk Mine
    if (want('mine')) {
      reset();
      const s = SUBS.mine, M = V(-6, 0, -6);
      put(me, M, 0); step(0.05); S.use(me, s); put(me, HOME, Math.PI);
      const it = last(items('mine'));
      step(1.0);
      const ud = it.mesh.userData;
      // the enemy team's eyes
      S.viewer = foe.team; step(0.05);
      const enemy = { visible: it.mesh.visible, look: S.mineLook(it, foe.team) };
      // its own team's: a translucent, pulsing, team-tinted ghost, casting no shadow
      S.viewer = me.team; const ops = [];
      step(2, () => { ops.push(ud.body.material.opacity); });
      const bm = ud.body.material, col = G.teamColors[it.team];
      const own = { visible: it.mesh.visible, look: S.mineLook(it, me.team), transparent: bm.transparent && ud.ink.material.transparent, opMin: r3(Math.min(...ops)), opMax: r3(Math.max(...ops)),
        shadow: ud.body.castShadow || ud.ink.castShadow, tint: bm.emissive && bm.emissive.getHex() === col.getHex() };
      S.viewer = null; step(0.05);
      const local = { visible: it.mesh.visible, look: it.look };
      R('Lurk Mine: invisible to the enemy team (no mesh — so no shadow either — whether in ink or not)', enemy.visible === false && enemy.look === 'hidden', enemy);
      R('Lurk Mine: a translucent ghost to its own team (opacity 0.35–0.45, pulsing; team-tinted; no shadow) — the local player\'s view too',
        own.visible && own.look === 'ghost' && own.transparent && own.opMin >= 0.349 && own.opMax <= 0.451 && own.opMax - own.opMin > 0.05 && !own.shadow && own.tint && local.visible && local.look === 'ghost', { own, local });
      // the bots: nothing knows of it until it trips (no danger area; no record in an enemy bot's senses)
      const lurking = specialDangers().filter((d) => d.hit === 'mine').length;
      const foeKnows = [...(foe.bot?.sp?.recs?.values() || [])].some((r) => r.d && r.d.hit === 'mine');
      // the minimap: the enemy team's map leaves it out (minimap.js: a mine of the other team is skipped)
      const mm = g.minimap || G.game?.minimap, mmSrc = mm && mm.constructor ? String(mm.constructor.prototype._draw || mm.constructor.prototype.draw || '') : '';
      R('Lurk Mine: an enemy bot can\'t know of a lurking one (no danger area, nothing in its senses — the sight rule); the enemy\'s minimap skips it',
        lurking === 0 && !foeKnows, { lurking, foeKnows, minimapRule: /st === 'mine'\) && it\.team !== me/.test(mmSrc) || 'n/a' });
      // tripped: everyone sees it pop up through its windup
      S.viewer = foe.team;
      put(foe, V(M.x + 1.6, 0, M.z), -Math.PI / 2);
      let trip = null, pk = { y: 0, sc: 0 }, opaque = null, shown = true, danger = null;
      step(1.2, () => {
        if (it.fuse != null && !trip) { trip = G.time; opaque = !ud.body.material.transparent && ud.body.material === getPlasticMaterial() && ud.body.castShadow; danger = specialDangers().find((d) => d.hit === 'mine') || null; danger = danger && { tIn: r3(danger.tIn), r: r2(danger.r) }; }
        if (it.fuse != null && it.state !== 'dead') { shown = shown && it.mesh.visible && it.look === 'reveal'; pk.y = Math.max(pk.y, ud.inner.position.y); pk.sc = Math.max(pk.sc, ud.inner.scale.x); }
        return it.state !== 'dead';
      });
      const arm = evs.find((e) => e.n === 'sub:arm' && e.kind === 'mine'), boom = evs.find((e) => e.n === 'bomb:explode' && e.t >= (arm?.t ?? 0));
      const wait = arm && boom ? r3(boom.t - arm.t) : null;
      const firstHit = hits.find((h) => h.vic === foe);
      const rings = fxLog.filter((x) => x.f === 'ring' && x.t > trip - 1e-6 && x.t <= boom.t + 1e-6), beeps = fxLog.filter((x) => x.f === 'beep' && x.t > trip - 1e-6 && x.t <= boom.t + 1e-6);
      pk.ringFrames = rings.length; pk.ringR = rings[0] && rings[0].r; pk.beeps = beeps.length;
      R(`Lurk Mine tripped: it pops up for everyone — the enemy's eyes included — opaque and swelling, its blast radius (${s.radius} m) on the floor every frame and a beep pulse quickening; ${s.delay} s later it blows (was 0.35)`,
        trip && opaque && shown && pk.y > 0.1 && pk.sc > 1.15 && pk.ringFrames >= 25 && pk.ringR === s.radius && pk.beeps >= 4 && wait != null && Math.abs(wait - s.delay) < 0.02, { opaque, shown, popUp: r2(pk.y), swell: r2(pk.sc), ring: [pk.ringFrames, pk.ringR], beeps: pk.beeps, wait });
      R('…its trip alarm plays at the trip (cues: mine_trip), a danger area for the enemy\'s bots from the trip (the blast where it stands, until it blows), and no damage before the blast',
        cues.some((c) => c.name === 'mine_trip' && Math.abs(c.t - trip) < 0.02) && danger && danger.tIn > 0.3 && danger.tIn <= s.delay + 1e-6 && firstHit && firstHit.t >= boom.t - 1e-6,
        { cue: cues.filter((c) => /mine/.test(c.name)).map((c) => c.name), danger, firstHit: firstHit && { dmg: firstHit.dmg, after: r3(firstHit.t - trip) } });
      // an enemy client: the mine is a ghost there (a remote player's) — hidden until the owner's update record trips it
      reset();
      S.viewer = foe.team;
      S.netGhost(me, [1, 991, 'mine', 4, 0, -8, 0, 1, 0, 0]);
      const gh = S.items.find((x) => x.gid === 991);
      step(1.5);
      const gHidden = gh && !gh.mesh.visible && gh.look === 'hidden' && gh.fuse == null;
      S.netGhost(me, [3, 991]); step(0.15);
      const gShown = gh.mesh.visible && gh.look === 'reveal' && cues.some((c) => c.name === 'mine_trip');
      step(1);
      const gWaits = gh.state !== 'dead';   // (a ghost never blows by itself: its owner's end record does)
      S.netGhost(me, [2, 991]); step(0.05);
      R('online: on an enemy client the mine (a ghost there) is hidden; the owner\'s trip record pops it up there too (with its alarm); the owner\'s end record blows it',
        gHidden && gShown && gWaits && gh.state === 'dead', { gHidden, gShown, gWaits, end: gh.state });
      // the owner's side: the trip goes out as an update record
      reset(); netOn();
      try {
        put(me, M, 0); step(0.05); S.use(me, s); put(me, HOME, Math.PI);
        const it2 = last(items('mine')); step(1);
        put(foe, V(M.x + 1.5, 0, M.z), 0); step(0.1);
        step(0.6);
        const ix3 = sent.findIndex((r) => r.kind === 'subs' && r.data[0] === 3 && r.data[1] === it2.gid && r.data.length === 2), ix2 = sent.findIndex((r) => r.kind === 'subs' && r.data[0] === 2 && r.data[1] === it2.gid);
        R('online, the owner\'s side: tripping sends [3, gid] (every screen pops it up), then the blast\'s end record [2, gid]', it2.gid > 0 && ix3 >= 0 && ix2 > ix3, { gid: it2.gid, sent: sent.filter((r) => r.kind === 'subs').map((r) => r.data.slice(0, 3)) });
      } finally { netOff(); }
    }

    // ============================================================================================ Hop Beacon
    if (want('beacon')) {
      reset();
      const s = SUBS.beacon, Bp = V(6, 0, -6);
      put(me, Bp, 0); step(0.05); S.use(me, s); put(me, HOME, Math.PI);
      const b = last(items('beacon')), fx = b.fx;
      step(0.1);
      const lit = (l) => l.material.emissiveIntensity > 0.5 && l.material.emissive.getHex() === G.teamColors[b.team].getHex();
      const fresh = { lights: fx ? fx.lights.length : 0, lit: fx ? fx.lights.map(lit) : [], pipsY: fx && r2(fx.pips.position.y), top: r2(b.mesh.userData.top) };
      R('Hop Beacon: two lights over it, both lit in its team colour (a fresh one: 2 jumps left)', fresh.lights === 2 && fresh.lit.every(Boolean) && fresh.pipsY > fresh.top, fresh);
      // sonar: rings on its team's view, the other team's faint
      let pings = 0, was = false, rMax = 0, airMax = 0;
      step(4, () => { const v = fx.ring.visible; if (v && !was) pings++; was = v; if (v) { rMax = Math.max(rMax, fx.ring.material.uniforms.uR.value); airMax = Math.max(airMax, fx.air.scale.x); } });
      const aOwn = fx.ring.material.uniforms.uAlpha.value;
      S.viewer = foe.team; step(4, () => !fx.ring.visible);
      step(0.2); const aFoe = fx.ring.material.uniforms.uAlpha.value; S.viewer = null;
      R(`its sonar: a ping every ~${s.sonar} s (a ring along the ground to ~7 m and a shell in the air), its team's to see, the other team's faint`,
        pings >= 2 && pings <= 3 && rMax > 0.8 && airMax > 2.5 && aOwn === 1 && aFoe > 0 && aFoe < 0.3, { pings, ringR: r2(rMax), airR: r2(airMax), alphaOwn: aOwn, alphaFoe: r2(aFoe) });
      // a teammate super jumps to it: one jump left — one light dark, the other blinking, the lamp dimmed
      put(mate, V(-8, 0, -24), 0); mate.setSub('bomb');
      const ok = S.jumpToBeacon(mate, b);
      let landed = false; step(8, () => { if (b.uses < 2) landed = true; return !landed; });
      step(0.1);
      const em = []; step(0.6, () => em.push(fx.lights[0].material.emissiveIntensity));
      const one = { ok, uses: b.uses, first: fx.lights[0].material !== fx.lights[1].material && lit(fx.lights[0]), dark: fx.lights[1].material.emissive.getHex() === 0 && fx.lights[1].scale.x < 0.9,
        blink: r2(Math.max(...em) - Math.min(...em)), glowDim: b.mesh.userData.glow && b.mesh.userData.glow.material !== S._glowMat(b.team) };
      R('after a jump onto it (1 jump left): one light dark, the last one blinking, its lamp dimmed — it looks different from a fresh one',
        ok && one.uses === 1 && one.first && one.dark && one.blink > 0.8 && one.glowDim, one);
      // the jump map: its pin / label shows the lights too
      let label = null; try { const tg = g.hud?._beaconTargets?.(); const t = tg && tg.find((x) => x && x.beacon === b); label = t ? t.name : null; } catch (e) { label = 'err ' + e.message; }
      R('the super-jump map labels it with its jumps left (●○)', typeof label === 'string' && label.includes('●○'), { label });
      // online: the ghost's lights follow the owner's record; a jump onto a ghost goes to its owner
      reset(); netOn();
      try {
        S.netGhost(foe, [1, 992, 'beacon', 8, 0, 10, 0, 1, 0, 0]); step(0.1);
        const gb = S.items.find((x) => x.gid === 992);
        S.netGhost(foe, [3, 992, 1]); step(0.1);
        const ghostOne = gb.uses === 1 && gb.fx.lights[1].material.emissive.getHex() === 0;
        // (a teammate of the ghost's owner — on this screen — lands on it: the jump goes to the owner)
        const E2 = others.filter((a) => a.team === foe.team)[1] || foe; E2._jumpBeacon = gb; S._landedOnBeacon(E2);
        const toOwner = sent.find((r) => r.dev === 'beaconUse' && r.id === 992);
        // the owner's side: a jump that came in from another screen counts, and its record goes out
        put(me, V(6, 0, -6), 0); step(0.05); S.use(me, s); put(me, HOME, Math.PI);
        const ob = last(items('beacon').filter((x) => !x.ghost)); sent.length = 0;
        S.netUse(ob.gid, 1); step(0.05);
        const rec = sent.find((r) => r.kind === 'subs' && r.data[0] === 3 && r.data[1] === ob.gid);
        R('online: a ghost beacon\'s lights follow its owner\'s record; a jump onto a ghost goes to the owner (and uses it up here), the owner counts it and sends the jumps left',
          ghostOne && toOwner && gb.state === 'dead' && ob.uses === 1 && rec && rec.data[2] === 1, { ghostOne, toOwner, ghostAfter: gb.state, ownerUses: ob.uses, rec: rec && rec.data });
      } finally { netOff(); }
    }

    // ============================================================================================ Drip Curtain
    if (want('curtain')) {
      reset();
      const s = SUBS.curtain, Cp = V(0, 0, -4);
      S._throw(me, s, V(Cp.x, 0.5, Cp.z), V(0, -2, 0.02), false);
      const it = last(items('curtain'));
      step(0.6);
      const mt = it.meter, u = mt && mt.material.uniforms;
      let drift = 0, fills = [];
      step(1, () => { fills.push(u.uFill.value); drift = Math.max(drift, Math.abs(u.uFill.value - it.hp / s.hp)); });
      const decayed = fills[0] - fills[fills.length - 1];
      // shots through it (the enemy's): hp drops by the hits × shotMul, the meter with it
      const hp0 = it.hp;
      for (let k = 0; k < 4; k++) S.blockShot(V(Cp.x + k * 0.3 - 0.5, 1.2, Cp.z + 1), V(Cp.x + k * 0.3 - 0.5, 1.2, Cp.z - 1), foe.team, 30);
      step(1 / 60 * 1.01);
      const afterHits = { hp: r2(it.hp), fill: r3(u.uFill.value), expect: r3(it.hp / s.hp) };
      it.mesh.updateWorldMatrix(true, true);
      const wp = mt.getWorldPosition(V(0, 0, 0));
      R('Drip Curtain: an ink meter along its top tracks its hp every frame (its decay, and shots — 4 × 30 × shotMul off), on both faces (double-sided, filling in from both ends toward the middle: the same from either side), above the sheet',
        mt && mt.material.side === THREE.DoubleSide && drift < 1e-6 && decayed > 0.08 && Math.abs(hp0 - it.hp - 4 * 30 * s.shotMul - s.decay * DT) < 0.5 && Math.abs(afterHits.fill - afterHits.expect) < 1e-3 && wp.y > s.height + 0.2,
        { drift, decayedPerSec: r3(decayed), afterHits, meterY: r2(wp.y), color: u.uColor.value.getHex() === G.teamColors[it.team].getHex() });
      // half: the meter at half
      it.hp = s.hp / 2; step(1 / 60 * 1.01);
      R('…half its ink: the meter at half', Math.abs(u.uFill.value - 0.5) < 0.01, { fill: r3(u.uFill.value) });
      // online: the owner sends what hits took (rate-limited); a ghost takes the owner's word (its decay runs there too)
      reset(); netOn();
      try {
        S._throw(me, s, V(Cp.x, 0.5, Cp.z), V(0, -2, 0.02), false); const own = last(items('curtain')); step(0.6); sent.length = 0;
        S.blockShot(V(Cp.x, 1.2, Cp.z + 1), V(Cp.x, 1.2, Cp.z - 1), foe.team, 40); step(0.05);
        const rec = sent.find((r) => r.kind === 'subs' && r.data[0] === 3 && r.data[1] === own.gid), ownHp = own.hp;
        S.netGhost(foe, [0, 993, 'curtain', 6, 0.5, 8, 0, -2, 0.02]); step(0.6);
        const gc = S.items.find((x) => x.gid === 993 && x.state === 'curtain');
        const before = gc && gc.hp; S.netGhost(foe, [3, 993, 60]); step(1 / 60 * 1.01);
        R('online: the owner sends its curtain\'s hp after hits ([3, gid, hp]); a ghost curtain on another screen takes it, its meter with it',
          rec && Math.abs(rec.data[2] - ownHp) < 2 && gc && gc.hp <= 60 && gc.hp > 59 && Math.abs(gc.meter.material.uniforms.uFill.value - gc.hp / s.hp) < 1e-3,
          { rec: rec && rec.data, ghostBefore: before && r2(before), ghostAfter: gc && r2(gc.hp) });
      } finally { netOff(); }
    }

    // ============================================================================================ windups
    if (want('windup')) {
      // one scene per bomb: it reaches / trips on the foe; stay = the foe stands there, out = it runs straight off at
      // run speed from the windup's start. Returns the windup's timing, its tell and the hits.
      const diff0 = foe.bot.diff.id;
      const scene = (kind, mode, opt = {}) => {
        reset();
        const F = V(0, 0, 6), away = opt.bot ? V(22, 0, 0) : HOME;   // (a bot scene: you're behind the wall, out of its sight — no fight)
        put(foe, F, Math.PI);
        let obj = null;
        // (opt.at: the bomb starts right by its target — a bot scene: the windup begins next to it, it never saw it come)
        if (kind === 'seeker') { S._throw(me, SUBS.seeker, V(0, 0.6, opt.at ? 4.95 : 0), V(0, -2, opt.at ? 0 : 0.4), false); obj = last(items('seeker')); }
        else if (kind === 'waddle') {
          put(me, V(0, 0, -2), 0); S.use(me, SUBS.waddle); obj = last(K.waddle.items); obj.pos.set(0, 0.5, 1.5); obj.vel.set(0, -1, 0); put(me, away, 0);
          if (opt.at) { step(0.2); obj.pos.set(0, 0, 5.0); obj.state = 'walk'; obj.target = foe; obj.t = 0; obj.walkT = 0; }
        }
        else { put(me, V(0, 0, 2.5), 0); step(0.05); S.use(me, SUBS.mine); obj = last(items('mine')); put(me, away, 0); step(1); put(foe, V(0, 0, 4.2), Math.PI); }
        if (kind === 'seeker') put(me, away, 0);
        if (opt.bot) { delete foe.bot.update; foe.bot.setDifficulty('hard'); foe.bot.sp.reset(); }
        let armT = null, armPos = null, tell = { sc: 0, lamp: 0 }, danger = null, esc = null, d0 = null, dEnd = null, dEsc = null, dMin = null;
        hook = () => {
          if (armT == null) return;
          if (mode === 'out') { const dx = foe.pos.x - armPos.x, dz = foe.pos.z - armPos.z, l = Math.hypot(dx, dz) || 1; foe.pos.x += (dx / l) * PLAYER.runSpeed * DT; foe.pos.z += (dz / l) * PLAYER.runSpeed * DT; foe.vel.set((dx / l) * PLAYER.runSpeed, 0, (dz / l) * PLAYER.runSpeed); }
        };
        const n = step(8, () => {
          const arm = evs.find((e) => e.n === 'sub:arm' && e.kind === kind);
          if (arm && armT == null) { armT = arm.t; armPos = arm.pos; d0 = Math.hypot(foe.pos.x - armPos.x, foe.pos.z - armPos.z); const dz = specialDangers().find((d) => d.hit === kind); danger = dz && { tIn: r3(dz.tIn), r: r2(dz.r), lethal: dz.lethal }; }
          if (armT != null) {
            const sc = kind === 'waddle' ? obj.m.model.scale.x / (1.8 * obj.vs) : obj.mesh.userData.inner.scale.x;   // (waddle.js WSCALE 1.8)
            tell.sc = Math.max(tell.sc, sc); if (kind === 'waddle') tell.lamp = Math.max(tell.lamp, obj.m.lampMat.emissiveIntensity);
            if (opt.bot && foe.bot.sp.esc && !esc) { esc = { hit: foe.bot.sp.esc.r.d.hit, t: r3(G.time - armT) }; dEsc = Math.hypot(foe.pos.x - armPos.x, foe.pos.z - armPos.z); }
            if (esc && obj.state !== 'dead') { const dd = Math.hypot(foe.pos.x - armPos.x, foe.pos.z - armPos.z); dMin = dMin == null ? dd : Math.min(dMin, dd); }
          }
          const done = obj.state === 'dead';
          if (done && armPos && dEnd == null) dEnd = Math.hypot(foe.pos.x - armPos.x, foe.pos.z - armPos.z);
          return !done;
        });
        hook = null;
        const boom = evs.find((e) => e.n === 'bomb:explode' && armT != null && e.t >= armT);
        const inW = (x) => armT != null && boom && x.t > armT - 1e-6 && x.t <= boom.t + 1e-6;
        const rings = fxLog.filter((x) => x.f === 'ring' && inW(x)), beeps = fxLog.filter((x) => x.f === 'beep' && inW(x));
        const fh = hits.filter((h) => h.vic === foe && (h.wid === kind));
        const cue = cues.find((c) => c.name === { seeker: 'seeker_prime', waddle: 'waddle_prime', mine: 'mine_trip' }[kind]);
        if (opt.bot) { stub(foe); foe.bot.setDifficulty(diff0); }
        return { armed: armT != null, wait: armT != null && boom ? r3(boom.t - armT) : null, firstHitAfterBoom: fh.length ? r3(fh[0].t - (boom ? boom.t : 0)) : null, dmg: r2(fh.reduce((a, h) => a + h.dmg, 0)),
          tell: { swell: r2(tell.sc), lamp: r2(tell.lamp), ringFrames: rings.length, ringR: rings[0] ? rings[0].r : null, beeps: beeps.length }, cue: cue ? r3(cue.t - (armT ?? 0)) : null, danger, esc, d0: d0 != null ? r2(d0) : null, dEsc: dEsc != null ? r2(dEsc) : null, dMin: dMin != null ? r2(dMin) : null, dEnd: dEnd != null ? r2(dEnd) : null, frames: n };
      };
      for (const kind of ['seeker', 'waddle', 'mine']) {
        const D = SUBS[kind].delay, name = SUBS[kind].name;
        const st = scene(kind, 'stay'), ou = scene(kind, 'out');
        R(`${name}: it waits its ${D} s windup between reaching / tripping on its target and the blast (the tell: ${kind === 'mine' ? 'popped up, ' : ''}swelling${kind === 'waddle' ? ', its lamp strobing' : ''}, its blast radius on the floor every frame and a beep pulse quickening — the Splat Bomb's look; its warning cue at the windup's start) — no damage before the blast; the target who stays is hit`,
          st.armed && Math.abs(st.wait - D) < 0.02 && st.firstHitAfterBoom != null && st.firstHitAfterBoom >= -1e-6 && st.dmg > 0 && st.tell.swell > 1.15 && st.tell.ringFrames >= 25 && st.tell.ringR === SUBS[kind].radius && st.tell.beeps >= 4 && (kind !== 'waddle' || st.tell.lamp > 5) && st.cue != null && Math.abs(st.cue) < 0.02, st);
        R(`${name}: a target who walks out during the windup (run speed, from its start) takes none`, ou.armed && Math.abs(ou.wait - D) < 0.02 && ou.dmg === 0, ou);
        R(`${name}: its windup is a danger area for the other team's bots (the blast where it stands, until it goes off)`, st.danger && st.danger.tIn > D - 0.05 && st.danger.tIn <= D + 1e-6 && st.danger.r > SUBS[kind].radius, st.danger);
      }
      // a bot standing in it notices the windup and runs (botSpecials' escape), 3 rounds a bomb
      const SA = (await import('./src/game/botSpecials.js')).SPECIAL_AI, ai0 = SA.enabled; SA.enabled = true;
      const bot = {};
      for (const kind of ['seeker', 'waddle', 'mine']) {
        const rounds = []; for (let r = 0; r < 3; r++) rounds.push(scene(kind, 'stay', { bot: true, at: true }));
        bot[kind] = rounds.map((x) => ({ esc: x.esc, d0: x.d0, dEsc: x.dEsc, dMin: x.dMin, dEnd: x.dEnd, dmg: x.dmg }));
      }
      SA.enabled = ai0;
      // (what's ours to make sure of: the windup is a danger it reads — it notices after its reaction time and heads out;
      // whether it gets clear in 0.45 s is its reaction and footing: it has a chance, like a player). A round counts when
      // the bot started inside the blast; it's a good one when the bot ends outside it, or ran its escape for this bomb
      // and was heading out at the blast — further off than the nearest it got after it set out (a kid walking in when it
      // tripped carries on a step before it turns: the decision is ours, the momentum isn't)
      const good = (k, x) => x.dEnd > SUBS[k].radius || (x.esc && x.esc.hit === k && x.dEnd - x.dMin > 0.15);
      const okBot = Object.entries(bot).every(([k, rs]) => { const c = rs.filter((x) => x.d0 < SUBS[k].radius); return c.length >= 2 && c.filter((x) => good(k, x)).length >= Math.ceil(c.length * 2 / 3); });
      R('a hard bot (its specials awareness on) caught in a windup\'s blast notices it (after its reaction time) and heads out — clear of it at the blast, or turned round and moving out of it — in 2 of 3 rounds for each bomb', okBot, bot);
    }
  } catch (e) {
    R('harness error', false, String(e && e.stack || e).slice(0, 600));
  } finally {
    hook = null; S.viewer = null; netOff();
    delete P.applyHit; if (P.applyHit !== hit0) P.applyHit = hit0;
    delete C.one; if (C.one !== one0) C.one = one0;
    if (G.fx) { delete G.fx.dangerRing; delete G.fx.beepPulse; if (G.fx.dangerRing !== ring0) G.fx.dangerRing = ring0; if (G.fx.beepPulse !== beep0) G.fx.beepPulse = beep0; }
    offs.forEach((f) => f());
    for (const a of m.actors) if (a.bot) delete a.bot.update;
    S.clear(); P.clear();
  }
  return out;
})()
