// sfx-cues: every sub and special by ear (src/audio/cues.js — the director; src/audio/sfx-cues.js — the sounds).
// Staged scenes on testbox (a flat deck, top y 0, x −28…28, z −40…40; a 4 m wall at x 14…15, z −8…8): an enemy (or
// you / an ally) throws each sub and uses each special near you, and the test follows it frame by frame through the
// audio engine (audio.play / audio.loop are hooked and recorded — the run is muted, nothing needs to be audible):
//   - the right one-shot at each phase (throw / land / arm / warn / blast / end), the enemy's positional;
//   - a moving / live thing holds exactly one cue loop per channel, the loop's position follows it every frame, and
//     the loop stops the frame the thing stops or dies (the engine handle stops playing too);
//   - the warnings start ahead of the blast (≥ 0.6 s where the mechanics give that long);
//   - the enemy's is louder (and harsher: params.foe) than your own or an ally's; your own throw comes from you;
//   - a twister passing you rises then falls in pitch (the Doppler); the caps hold in a crowd;
//   - no cue loop survives the object, a pause (they're hushed and come back), the end of the round, or a quit;
//   - sfx-loud: every thrown sub's flight glides with its arc (up with the climb, the falling whistle to the landing),
//     in its own voice; the placed ones have none; every enemy special that can hit you plays its launch alert (and
//     the "you're in it" alarm when you stand in it) before it hits, every special popped by an enemy its own sting;
//     yours and your team's mix ~3 dB under the enemy's;
//   - sub-tweaks: the Skitter / Waddle wind up before they burst (their own warning at the windup: seeker_prime /
//     waddle_prime), the Lurk Mine's trip alarm leads its blast by its 0.45 s windup;
//   - teammates' subs (2026-10-01): a teammate's thrown Splat Bomb / Skitter Bomb makes no throw, flight, landing, fuse
//     or windup sound, its blast at 0.6 × the enemy's; its devices' own loops (a sprinkler spinning) stay.
//   MAP=testbox MODE=turf PAGE=tools/botlab/tests/sfx-cues.js tools/botlab/run.sh tools/botlab/page.cjs
//   PAGE_ARGS='only=subs' | 'only=specials' | 'only=bomb,crab,…' (scene keys) to run a part
(async () => {
  const g = window.__inkwave, m = g.match, G = __G, A = G.audio, C = G.cues;
  const { SUBS, SPECIALS, PLAYER } = await import('./src/config.js');
  const { SUB_CUE, SPECIAL_START, MAX, LEVEL, MIX, FLIGHT_KIND, THROWN_SUBS, PLACED_SUBS, FLY_UP, FLY_DOWN } = await import('./src/audio/cues.js');
  const lvOf = (n) => Math.pow(10, ((LEVEL && LEVEL[n]) || 0) / 20);   // (a cue's calibrated level: realflow.cjs measures the audible result)
  const { SUB_KITS } = await import('./src/game/kits/registry.js');
  const { on } = await import('./src/core/ctx.js');
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info: info === undefined ? undefined : JSON.parse(JSON.stringify(info)) });
  const ONLY = (/only=([\w,]+)/.exec(window.__pageArgs || '') || [])[1];
  const want = (k, group) => !ONLY || ONLY.split(',').includes(k) || ONLY.split(',').includes(group);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const r2 = (x) => Math.round(x * 100) / 100;
  g.debug.freeze();
  if (!A.ctx) A.init();
  const frame = () => { g._skipRender = true; g._frame(1 / 60); g._skipRender = false; };
  const step = (s, fn) => { const n = Math.max(1, Math.round(s * 60)); for (let i = 0; i < n; i++) { frame(); if (fn && fn(i) === false) return; } };
  const me = m.local, B = m.actors.filter((a) => a.team !== me.team), F = m.actors.filter((a) => a.team === me.team && a !== me);
  const E = B[0], E2 = B[1];
  for (const a of m.actors) if (a.bot) a.bot.update = () => {};   // (scripted: the scenes set the intents)
  const zero = (a) => { a.intent.move.set(0, 0, 0); a.intent.fire = a.intent.sub = a.intent.jump = a.intent.special = a.intent.squid = false; };

  // ---- the audio engine, recorded: every play / loop (and every loop's last position set)
  const rec = [];
  const _play = A.play.bind(A), _loop = A.loop.bind(A);
  const P3 = (p) => (p ? { x: p.x, y: p.y, z: p.z } : null);
  // (vol: what the director asked for — × post, a teammate's blast's share applied after the cue compressor: audio.js cuePost)
  A.play = (n, o) => { const v = _play(n, o); rec.push({ t: G.time, n, pos: P3(o && o.pos), vol: (o && o.volume != null ? o.volume : 1) * (o && o.post != null ? o.post : 1), post: o && o.post, ok: !!v }); return v; };
  A.loop = (n, o) => {
    const h = _loop(n, o);
    h._pos = P3(o && o.pos);
    const set = h.set;
    if (typeof set === 'function' && !Object.isFrozen(h)) h.set = (p) => { if (p && p.pos) h._pos = P3(p.pos); else if (p && 'pos' in p) h._pos = null; return set.call(h, p); };
    rec.push({ t: G.time, n, loop: true, h, pos: P3(o && o.pos) });
    return h;
  };
  const plays = (t0, name) => rec.filter((r) => !r.loop && r.t >= t0 - 1e-6 && (!name || r.n === name));
  const firstPlay = (t0, name) => plays(t0, name)[0] || null;
  const d3 = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : Infinity);
  const slotsOf = (obj) => C.live().filter((s) => s.obj === obj);

  // ---- staging
  const place = (a, x, z, y = 0.05) => { a.pos.set(x, y, z); a.vel.set(0, 0, 0); a.grounded = false; };
  const face = (a, x, z) => { const y = Math.atan2(x - a.pos.x, z - a.pos.z); a.yaw = a.aimYaw = y; a.aimPitch = 0; };
  const aimAt = (e, x, y, z) => { const dx = x - e.pos.x, dz = z - e.pos.z; e.yaw = e.aimYaw = Math.atan2(dx, dz); e.aimPitch = Math.atan2(y - (e.pos.y + 1.1), Math.hypot(dx, dz)); e.aimPoint.set(x, y, z); e.aimDir?.set(dx, y - (e.pos.y + 1.2), dz).normalize(); };
  const lob = (e, x, z, speed, grav = 24, from = 1.35) => {
    const d = Math.hypot(x - e.pos.x, z - e.pos.z); let best = 0, be = 1e9;
    for (let p = -0.6; p <= 0.8; p += 0.005) {
      const tp = Math.min(1.1, Math.max(-0.3, p + 0.28)), vx = Math.cos(tp) * speed, vy = Math.sin(tp) * speed + 1.5, disc = vy * vy + 2 * grav * from;
      const err = Math.abs((vx * (vy + Math.sqrt(disc))) / grav - d);
      if (err < be) { be = err; best = p; }
    }
    e.yaw = e.aimYaw = Math.atan2(x - e.pos.x, z - e.pos.z); e.aimPitch = best; e.aimPoint.set(x, 0.5, z);
  };
  const start = (e, id) => { e.specialId = id; e.special = e.specialCost(); e._startSpecial(); return e.specialActive; };
  const tap = (a, key) => { a.intent[key] = true; frame(); a.intent[key] = false; };
  const reset = (meAt = [0, -8]) => {
    G.specials.clear(); G.projectiles.clear(); G.subs.clear(); G.paint.clear();
    m.time = Math.max(m.time, 170);
    m.actors.forEach((a, i) => {
      if (!a.alive) a.respawn();
      if (a.specialActive) { try { G.specials.end(a, 'test'); } catch (e) { /* */ } a.specialActive = null; }
      a.status.shield = 0; a.status.track = 0; a.status.reveal = 0; a.status.poison = 0;
      a.hp = 1e6; a.invuln = 0; a.ink = PLAYER.inkMax; a.special = 0; zero(a);
      a.form = 'kid'; a.superJumpState = null; a.climbing = false;
      place(a, -24 + (i % 8) * 6, a.team === me.team ? -37 : 37);
    });
    place(me, meAt[0], meAt[1]); face(me, meAt[0], meAt[1] + 10);
    step(0.4);
    for (const a of m.actors) { a.hp = 1e6; zero(a); }
    rec.length = 0;
  };
  // a scripted run: fn(i) each frame; returns the frames' cue-loop picture for the watched objects
  const watch = (secs, objs, fn) => {
    const frames = [];
    step(secs, (i) => {
      const r = fn ? fn(i) : undefined;
      const list = typeof objs === 'function' ? objs() : objs;
      frames.push({ t: G.time, lz: A.L.z, objs: list.map((o) => ({ o, p: P3(o.pos), gp: P3(o.group && o.group.position), to: P3(o.to), sl: slotsOf(o).map((s) => ({ sound: s.sound, ch: s.ch, warn: s.warn, rel: s.rel, vol: s.vol, dop: s.dop, params: s.params ? { ...s.params } : null, h: s.h, hpos: s.h._pos, twoD: s.twoD })) })) });
      return r;
    });
    return frames;
  };
  // is this object still in its system's live list?
  const liveIn = (o) => {
    if (G.projectiles.bombs.includes(o) || G.projectiles.clouds.includes(o)) return true;
    if (G.subs.items.includes(o)) return o.state !== 'dead';
    if (G.specials.world.includes(o)) return !o.dead;
    for (const k in SUB_KITS) { const K = SUB_KITS[k], L = K.items || K._list || K._items || K._bolts; if (L && L.includes(o)) return o.state !== 'dead'; }
    return false;
  };

  // ================================================================================== sub scenes
  // expected loop(s) by state, per kind (primary channel first)
  const LOOPS = {
    bomb: (o) => (o.fuse >= 0 ? 'fuse_bomb' : 'sub_flight'),
    sticky: (o) => ({ fly: 'sub_flight', stuck: 'fuse_sticky' })[o.state],
    burst: (o) => ({ fly: 'sub_flight' })[o.state],
    seeker: (o) => ({ fly: 'sub_flight', run: 'seeker_run' })[o.state],
    scan: (o) => ({ fly: 'sub_flight' })[o.state],
    curtain: (o) => ({ fly: 'sub_flight', curtain: 'curtain_drip' })[o.state],
    sprinkler: (o) => ({ fly: 'sub_flight', spray: 'sprinkler_spin' })[o.state],
    mine: () => null,
    beacon: (o) => ({ beacon: 'beacon_hum' })[o.state],
    mist: (o) => ({ fly: 'sub_flight', mist: 'mist_hiss' })[o.state],
    shaker: () => 'shaker_rattle',
    waddle: (o) => ({ fly: 'sub_flight', wake: 'waddle_walk', walk: 'waddle_walk' })[o.state],
    torpedo: () => 'torpedo_whirr',
    tracer: (o) => (o.state === 'fly' ? 'tracer_hum' : null),   // (then the trail's hum, fading, at its middle)
    boomerang: (o) => ({ out: 'boomerang_whirr', hover: 'boomerang_whirr', back: 'boomerang_whirr', orbit: 'boomerang_orbit', armed: 'boomerang_whirr' })[o.state],
  };
  // the phases each staged throw goes through (what must sound)
  const PHASES = { bomb: ['throw', 'land', 'boom'], sticky: ['throw', 'land', 'boom'], burst: ['throw', 'boom'], seeker: ['throw', 'land', 'warn', 'boom'], scan: ['throw', 'boom'],
    curtain: ['throw', 'land', 'end'], sprinkler: ['throw', 'land', 'end'], mine: ['throw', 'warn', 'boom'], beacon: ['throw', 'end'], mist: ['throw', 'boom'],
    shaker: ['throw', 'land', 'boom'], waddle: ['throw', 'beep', 'warn', 'boom'], torpedo: ['throw', 'boom'], tracer: ['hit'], boomerang: ['beep', 'boom'] };
  const WARN_MIN = { bomb: 0.6, sticky: 0.6, seeker: 0.6, shaker: 0.6, waddle: 0.6, torpedo: 0.6, mine: 0.4, boomerang: 0.55 };   // (mine: its 0.45 s windup; boomerang: its 0.6 s fuse)
  const THROW = { tracer: 'tracer_zap', boomerang: 'boomerang_throw' };
  const newObj = (kind, before) => {
    if (kind === 'bomb') return G.projectiles.bombs[G.projectiles.bombs.length - 1];
    const K = SUB_KITS[kind];
    const L = K ? (K.items || K._list || K._items || K._bolts) : G.subs.items;
    return L.filter((x) => !before.includes(x)).pop();
  };
  const listOf = (kind) => { const K = SUB_KITS[kind]; return kind === 'bomb' ? G.projectiles.bombs : K ? (K.items || K._list || K._items || K._bolts) : G.subs.items; };
  const subScene = (kind, o) => {
    reset(o.me || [0, -8]);
    const T = o.thrower || E;
    place(T, ...(o.at || [0, 3]));
    T.setSub(kind); T.ink = PLAYER.inkMax;
    o.aim(T);
    step(0.05);
    rec.length = 0;
    const t0 = G.time, before = [...listOf(kind)];
    if (o.pre) o.pre(T);
    if (kind === 'bomb') G.projectiles.throwBomb(T); else G.subs.use(T, SUBS[kind]);
    const obj = newObj(kind, before);
    let deadAt = null, boomT = null, warnT = null;
    const bad = { multi: 0, follow: 0, missing: 0, afterDeath: 0, engineAfter: 0 }, seen = new Set(), sample = [], glide = [];
    const hs = new Set();
    const n = Math.round((o.secs || 4) * 60);
    for (let i = 0; i < n; i++) {
      o.during?.(i, obj, T);
      frame();
      const alive = obj && liveIn(obj);
      const sl = slotsOf(obj);
      for (const s of sl) hs.add(s.h);
      if (alive) {
        const ex = LOOPS[kind](obj);
        const chs = new Map(); for (const s of sl) chs.set(s.ch, (chs.get(s.ch) || 0) + 1);
        if ([...chs.values()].some((n) => n > 1)) bad.multi++;
        const main = sl.filter((s) => s.sound === ex);
        if (ex && main.length !== 1) { bad.missing++; if (sample.length < 3) sample.push({ t: r2(G.time - t0), state: obj.state, ex, got: sl.map((s) => s.sound) }); }
        for (const s of main) { if (!s.twoD && d3(s.h._pos, obj.pos) > 1e-3 && kind !== 'tracer') bad.follow++; }
        for (const s of sl) { seen.add(s.sound); if (s.warn && warnT == null) warnT = G.time; if (s.glide != null) glide.push({ t: G.time, st: s.glide, sound: s.sound, kind: s.params && s.params.kind }); }
      } else {
        if (deadAt == null) deadAt = G.time;
        if (sl.length) bad.afterDeath++;
        if ([...hs].some((h) => h.playing) && G.time - deadAt > 0.3) bad.engineAfter++;
      }
      if (boomT == null && SUB_CUE[kind]?.boom && firstPlay(t0, SUB_CUE[kind].boom[0])) boomT = firstPlay(t0, SUB_CUE[kind].boom[0]).t;
    }
    // a one-shot warning (the Lurk Mine's trip) counts as the warning's start too
    const wp = SUB_CUE[kind]?.warn && firstPlay(t0, SUB_CUE[kind].warn[0]);
    if (wp && (warnT == null || wp.t < warnT)) warnT = wp.t;
    // tracer: the trail's hum outlives the bolt by its trail (≤ 1 s), then goes
    const lingering = [...hs].filter((h) => h.playing).length;
    const th = THROW[kind] || SUB_CUE[kind]?.throw?.[0], tp = th && firstPlay(t0, th);
    return { obj, t0, deadAt, boomT, warnT, bad, seen: [...seen], sample, lingering, throwPlay: tp, rec: plays(t0).map((r) => r.n), glide };
  };
  const SUB_STAGE = {
    bomb: { aim: (T) => lob(T, 0.4, -6.6, SUBS.bomb.throwSpeed), secs: 3 },
    sticky: { aim: (T) => lob(T, 0.4, -6, SUBS.sticky.throwSpeed), secs: 4.2 },
    burst: { aim: (T) => lob(T, 0.4, -6, SUBS.burst.throwSpeed), secs: 2 },
    seeker: { aim: (T) => lob(T, 0, 0, SUBS.seeker.throwSpeed), secs: 5.5 },
    scan: { aim: (T) => lob(T, 0, -5, SUBS.scan.throwSpeed), secs: 2.6 },
    curtain: { aim: (T) => lob(T, 0, -3, SUBS.curtain.throwSpeed), secs: 3, during: (i, o) => { if (i === 150 && o && o.state === 'curtain') G.subs._destroy(o); } },
    sprinkler: { aim: (T) => lob(T, 0, -4, SUBS.sprinkler.throwSpeed), secs: 3, during: (i, o) => { if (i === 150 && o && o.state === 'spray') G.subs._hurt(o, 500); } },
    mine: { at: [0, -4.5], me: [0, -10], aim: () => {}, secs: 3, during: (i) => { if (i === 75) place(me, 0.6, -5.3); } },
    beacon: { at: [1, -5], aim: () => {}, secs: 2.5, during: (i, o) => { if (i === 90 && o && o.state === 'beacon') G.subs._hurt(o, 500); } },
    mist: { aim: (T) => lob(T, 0.4, -5.5, SUBS.mist.throwSpeed), secs: 6.5 },
    shaker: { aim: (T) => lob(T, 0, -3.5, SUBS.shaker.throwSpeed), secs: 4, pre: (T) => { T.weaponRunner.shaker = { level: 3, t1: G.time, loop: null, meter: 1 }; } },
    waddle: { at: [0, 6], aim: (T) => lob(T, 0, -3, SUBS.waddle.throwSpeed), secs: 6 },
    torpedo: { at: [0, 1], aim: (T) => lob(T, 0, -7, SUBS.torpedo.throwSpeed), secs: 4 },
    tracer: { at: [0, 8], aim: (T) => aimAt(T, me.pos.x, me.pos.y + 1, me.pos.z), secs: 2.2 },
    boomerang: { at: [0, -2], aim: (T) => aimAt(T, me.pos.x, me.pos.y + 1, me.pos.z), secs: 3.5 },
  };
  const subRes = {};
  for (const kind of Object.keys(SUB_STAGE)) {
    if (!want(kind, 'subs')) continue;
    const s = subScene(kind, SUB_STAGE[kind]);
    subRes[kind] = s;
    const cue = SUB_CUE[kind] || {};
    const phases = {};
    for (const ph of PHASES[kind]) phases[ph] = !!firstPlay(s.t0, ph === 'hit' ? 'tracer_hit' : cue[ph][0]);
    const need = phases;
    const lead = s.boomT != null && s.warnT != null ? r2(s.boomT - s.warnT) : null;
    const leadOk = WARN_MIN[kind] == null || (lead != null && lead >= WARN_MIN[kind]);
    const ok = !!s.obj && (!s.throwPlay ? false : true) && Object.values(need).every(Boolean) && !s.bad.multi && !s.bad.follow && !s.bad.missing && !s.bad.afterDeath && !s.bad.engineAfter && s.lingering === 0 && leadOk
      && (!s.throwPlay || s.throwPlay.pos);   // an enemy's throw is heard where they are
    R(`${SUBS[kind].name}: its own sounds at each phase, one loop per channel following it, gone with it${WARN_MIN[kind] ? `, warning ≥ ${WARN_MIN[kind]} s ahead` : ''}`,
      ok, { phases, loops: s.seen, warnLead: lead, bad: s.bad, sample: s.sample, lingering: s.lingering, throwAt: s.throwPlay && !!s.throwPlay.pos, sounds: [...new Set(s.rec)].slice(0, 16) });
    // (sub-tweaks) the windup's own warning, played as it stops to burst: its lead over the blast is the windup
    if (kind === 'seeker' || kind === 'waddle' || kind === 'mine') {
      const wp = firstPlay(s.t0, cue.warn[0]), wl = wp && s.boomT != null ? r2(s.boomT - wp.t) : null, D = SUBS[kind].delay;
      R(`${SUBS[kind].name}: its windup warning (${cue.warn[0]}) plays as it stops to burst, ${D} s before the blast (the enemy's positional)`, wl != null && Math.abs(wl - D) < 0.04 && !!wp.pos, { lead: wl, delay: D });
    }
  }
  // sfx-loud: every thrown sub's flight glides along its arc, in its own voice; the placed ones have no flight
  if (want('glide', 'subs') && Object.keys(subRes).length >= 13) {
    const res = {}, bad = [];
    for (const k of THROWN_SUBS) {
      const g2 = (subRes[k] && subRes[k].glide) || [], st = g2.map((x) => x.st);
      if (!st.length) { bad.push([k, 'no glide']); continue; }
      const first = st[0], last = st[st.length - 1], top = Math.max(...st), lo = Math.min(...st);
      res[k] = { n: st.length, sound: g2[0].sound, voice: g2[0].kind || null, first: r2(first), top: r2(top), last: r2(last) };
      // (a Torpedo locks on to you while it's still climbing here: its whirr only rose; a Boomerang thrown at you arms on
      // you before it slows to a stop: its whirr only fell a little)
      // (a short throw aimed down — the Skitter Bomb's at the floor 3 m off — has no climb: it starts at the top)
      const ok = k === 'tracer' ? first - last >= 1.5 : k === 'boomerang' ? first - lo >= 1.5 : k === 'torpedo' ? top - lo >= 2.5
        : (top >= first + 0.5 || first >= FLY_UP - 1) && last <= first - 3 && lo >= FLY_DOWN - 0.01 && top <= FLY_UP + 0.01;
      if (!ok) bad.push([k, res[k]]);
      if (FLIGHT_KIND[k] && g2[0].sound === 'sub_flight' && g2[0].kind !== FLIGHT_KIND[k]) bad.push([k, 'voice ' + g2[0].kind]);
    }
    for (const k of PLACED_SUBS) if (subRes[k] && subRes[k].glide.length) bad.push([k, 'a placed sub with a flight']);
    R(`every thrown sub's flight changes pitch with its time in the air (a lob: up to +${FLY_UP} st with the climb, the falling whistle to ${FLY_DOWN} st at the landing; the Tracer falls over its range; the Boomerang out and home), each in its own voice; the placed ones (${PLACED_SUBS.join(', ')}) none`,
      !bad.length, { bad, res });
  }
  // a Waddle Bomb shot down: a squeaky deflate (harmless), its loops gone with it
  if (want('waddle', 'subs')) {
    reset(); place(E, 0, 6); E.setSub('waddle'); lob(E, 0, -3, SUBS.waddle.throwSpeed); step(0.05); rec.length = 0;
    const t0 = G.time; G.subs.use(E, SUBS.waddle);
    const wd = SUB_KITS.waddle.items[SUB_KITS.waddle.items.length - 1];
    let popped = false;
    step(3, () => { if (!popped && (wd.state === 'walk' || wd.state === 'wake')) { popped = true; SUB_KITS.waddle.damageArea(wd.pos, 1, 100, me.team); } });
    R('Waddle Bomb shot down: waddle_pop (no blast), its walk loop and hunt alarm gone with it', popped && !!firstPlay(t0, 'waddle_pop') && !firstPlay(t0, 'waddle_explode') && !slotsOf(wd).length, { popped });
  }
  // unique signatures: no two subs share a throw, a loop or a blast
  if (want('unique', 'subs')) {
    const col = (ph) => Object.entries(SUB_CUE).filter(([k]) => k !== 'smash' && SUB_CUE[k][ph]).map(([k, c]) => [k, c[ph][0]]);
    const dup = (xs) => xs.filter(([, n], i) => xs.findIndex(([, m2]) => m2 === n) !== i);
    const throws = col('throw').concat([['tracer', 'tracer_zap'], ['boomerang', 'boomerang_throw']]), booms = col('boom').concat([['tracer', 'tracer_hit']]);
    R('every sub has its own throw and its own blast (no shared names)', !dup(throws).length && !dup(booms).length, { dupThrows: dup(throws), dupBooms: dup(booms) });
  }

  // ================================================================================== specials
  const spRes = {};
  // (sfx-loud: what each scene's special sounded for you — the director's alert / sting log, its alarm loops)
  const warned = {};
  const specialScene = (key, fn) => {
    if (!want(key, 'specials')) return;
    C.log = []; const alarms = new Set();
    const _f = g._frame; g._frame = (dt) => { _f.call(g, dt); for (const s of C.live()) if (s.sound === 'danger' && s.rel === 'foe') alarms.add(s.params.kind); else if (s.sound === 'beam_lock' && s.rel === 'foe') alarms.add('wail'); };
    try { fn(); } catch (e) { R(`${key}: scene error`, false, String(e && e.stack || e).slice(0, 400)); }
    g._frame = _f;
    warned[key] = { alerts: [...new Set(C.log.filter((x) => x.kind === 'alert' && x.rel === 'foe').map((x) => x.name))], stings: [...new Set(C.log.filter((x) => x.kind === 'sting').map((x) => x.name + ':' + x.rel))], alarms: [...alarms] };
    C.log = null;
  };
  const loopLife = (frames, obj, sound) => {   // first / last time a sound's loop was on this object
    let a = null, b = null, n = 0, follow = 0, multi = 0;
    for (const f of frames) for (const w of f.objs) if (w.o === obj) {
      const s = w.sl.filter((x) => x.sound === sound);
      if (s.length > 1) multi++;
      if (s.length) {
        if (a == null) a = f.t; b = f.t; n++;
        const at = sound === 'strike_mark' ? w.to : w.p || w.gp;   // (where the director should have put it this frame)
        if (!s[0].twoD && at && d3(s[0].hpos, at) > 1e-3) follow++;
      }
    }
    return { from: a, to: b, n, follow, multi };
  };

  // ---- Tidal Slam: the leap to the landing is one warning loop, ≥ 0.6 s before the impact
  specialScene('slam', () => {
    reset(); place(E, 0, -4); face(E, 0, -8); step(0.1); rec.length = 0;
    let imp = null; const off = on('special:slam', (e) => { if (e.actor === E && imp == null) imp = G.time; });
    const t0 = G.time; start(E, 'slam');
    const fr = watch(1.8, [E]); off();
    const L = loopLife(fr, E, 'slam_warn');
    const after = fr.filter((f) => imp != null && f.t > imp + 0.02).some((f) => f.objs[0].sl.some((s) => s.sound === 'slam_warn'));
    const lead = imp != null && L.from != null ? r2(imp - L.from) : null;
    R('Tidal Slam: slam_leap at the jump, the slam_warn loop from the leap to the landing (≥ 0.6 s ahead), special_slam on impact, the loop gone after',
      !!firstPlay(t0, 'slam_leap') && L.n > 0 && lead >= 0.6 && !after && !!firstPlay(t0, 'special_slam') && !L.multi, { lead, loop: L, after, leap: !!firstPlay(t0, 'slam_leap') });
  });

  // ---- Ink Tempest: the throw, the ball's whoosh, the rain loop drifting with the cloud, the fade at the end
  specialScene('storm', () => {
    reset(); place(E, 0, 4); lob(E, 0, -6.5, SPECIALS.storm.throwSpeed, 24, 1.45); step(0.05); rec.length = 0;
    const t0 = G.time; start(E, 'storm');
    const ball = G.projectiles.bombs.find((b) => b.kind === 'storm');
    let cloud = null;
    const fr = watch(1.6, () => [ball, cloud].filter(Boolean), () => { if (!cloud && G.projectiles.clouds.length) { cloud = G.projectiles.clouds[0]; cloud.dur = cloud.t + 1.5; } });
    const fr2 = watch(1.2, () => [cloud].filter(Boolean));
    const all = fr.concat(fr2);
    const Lb = loopLife(all, ball, 'sub_flight'), Lc = loopLife(all, cloud, 'storm_rain');
    // the rain's position follows the cloud's drift
    let follow = 0, moved = 0, p0 = null;
    for (const f of all) for (const w of f.objs) if (w.o === cloud) { const s = w.sl.find((x) => x.sound === 'storm_rain'); if (s) { if (d3(s.hpos, w.gp) > 1e-3) follow++; if (!p0) p0 = { ...s.hpos }; else moved = Math.max(moved, d3(p0, s.hpos)); } }
    const gone = !G.projectiles.clouds.includes(cloud) && !slotsOf(cloud).length;
    R('Ink Tempest: storm_throw, the ball\'s whoosh in the air, the rain loop following the drifting cloud, storm_fade at its end and no loop after',
      !!firstPlay(t0, 'storm_throw') && Lb.n > 0 && Lc.n > 0 && !follow && moved > 0.5 && gone && !!firstPlay(t0, 'storm_fade'), { ball: Lb, rain: Lc, follow, moved: r2(moved), gone, fade: !!firstPlay(t0, 'storm_fade') });
  });

  // ---- Bomb Barrage: the start, a drum on the thrower, each bomb its own loops
  specialScene('barrage', () => {
    reset(); place(E, 0, 3); step(0.05); rec.length = 0;
    const t0 = G.time; start(E, 'barrage');
    lob(E, -1.2, -6.4, SUBS.bomb.throwSpeed); G.projectiles.throwBomb(E);
    lob(E, 1.2, -6.4, SUBS.bomb.throwSpeed); G.projectiles.throwBomb(E);
    const bombs = G.projectiles.bombs.slice(-2);
    const fr = watch(1.4, () => [E, ...bombs]);
    const drum = loopLife(fr, E, 'barrage_drum');
    const fuses = bombs.map((b) => loopLife(fr, b, 'fuse_bomb'));
    const both = fr.some((f) => f.objs.filter((w) => w.o !== E && w.sl.some((s) => s.sound === 'fuse_bomb')).length === 2);
    G.specials.end(E, 'time'); step(0.1);
    R('Bomb Barrage: barrage_start, a barrage_drum loop on the thrower while it lasts, every bomb its own fuse loop (two at once here), all gone after',
      !!firstPlay(t0, 'barrage_start') && drum.n > 0 && fuses.every((x) => x.n > 0) && both && !slotsOf(E).some((s) => s.sound === 'barrage_drum'), { drum, fuses, both });
  });

  // ---- Bubble Guard: a hum on every shielded kid, gone with the shield
  specialScene('bubbler', () => {
    reset(); place(E, 0, -3); place(E2, 0.8, -3); step(0.05); rec.length = 0;
    const t0 = G.time; start(E, 'bubbler');
    const fr = watch(0.6, [E, E2]);
    const a = loopLife(fr, E, 'shield_hum'), b = loopLife(fr, E2, 'shield_hum');
    E.status.shield = 0.01; E2.status.shield = 0.01; step(0.2);
    R('Bubble Guard: shield_up, a shield_hum loop on each shielded kid (shared too), gone when the shield pops',
      !!firstPlay(t0, 'shield_up') && a.n > 0 && b.n > 0 && !slotsOf(E).length && !slotsOf(E2).length, { a, b });
  });

  // ---- Deep Sonar: the ping, then a quiet blip every 2 s while you're revealed
  specialScene('sonar', () => {
    reset(); place(E, 0, 10); step(0.05); rec.length = 0;
    const t0 = G.time; start(E, 'sonar');
    step(4.5);
    const n = plays(t0, 'sonar_blip').length;
    me.status.reveal = 0; const t1 = G.time; step(2.5);
    R('Deep Sonar: sonar_ping, then sonar_blip every ~2 s while you\'re revealed (and none after)', !!firstPlay(t0, 'sonar_ping') && n >= 2 && n <= 3 && !plays(t1 + 0.1, 'sonar_blip').length, { blips: n });
  });

  // ---- Vortex Strike: the mark at the landing spot for the whole flight, the vortex loop, its spin-down
  specialScene('strike', () => {
    reset(); place(E, 0, 14); step(0.05); rec.length = 0;
    const t0 = G.time; const s = start(E, 'strike');
    s.target.set(me.pos.x + 1, 0, me.pos.z); s.confirm = true;
    let missile = null, torn = null, impT = null;
    const fr = watch(4, () => [missile, torn].filter(Boolean), () => {
      missile = missile || G.specials.world.find((w) => w.kind === 'missile');
      if (!torn) { torn = G.specials.world.find((w) => w.kind === 'tornado'); if (torn) { impT = G.time; torn.dur = torn.t + 1.2; } }
    });
    const mk = loopLife(fr, missile, 'strike_mark'), vx = loopLife(fr, torn, 'tornado');
    const markAt = fr.flatMap((f) => f.objs.filter((w) => w.o === missile).flatMap((w) => w.sl)).find((s) => s.sound === 'strike_mark');
    const lead = impT != null && mk.from != null ? r2(impT - mk.from) : null;
    const gone = torn && !G.specials.world.includes(torn) && !slotsOf(torn).length && !slotsOf(missile).length;
    R('Vortex Strike: strike_arm, the strike_mark alarm at the landing spot from launch (≥ 0.6 s ahead; the enemy\'s harsh and boosted on you), strike_impact, the vortex loop, vortex_end',
      !!firstPlay(t0, 'strike_arm') && lead >= 0.6 && markAt && d3(markAt.hpos, missile.to) < 1e-3 && markAt.params.foe === 1 && !!firstPlay(t0, 'strike_impact') && vx.n > 0 && gone && !!firstPlay(t0, 'vortex_end'),
      { lead, mark: mk, vortex: vx, markVol: markAt && r2(markAt.vol), gone, end: !!firstPlay(t0, 'vortex_end') });
  });

  // ---- Twister Zooka: each twister's own loop, the Doppler rising as it comes at you and falling as it leaves
  specialScene('zooka', () => {
    reset([1.6, -8]); place(E, 0, 18); step(0.05); rec.length = 0;
    const t0 = G.time; start(E, 'zooka');
    aimAt(E, 0, 1.2, -30);
    let tw = null;
    const fr = watch(2.2, () => [tw].filter(Boolean), (i) => { if (i === 20) { E.intent.fire = true; } if (i === 21) E.intent.fire = false; tw = tw || G.specials.world.find((w) => w.kind === 'twister'); });
    const L = loopLife(fr, tw, 'twister');
    const dops = fr.flatMap((f) => f.objs.flatMap((w) => w.sl.filter((s) => s.sound === 'twister').map((s) => ({ t: f.t, dop: s.dop, z: w.p.z, lz: f.lz }))));
    const L0 = G.audio.L;
    const up = Math.max(0, ...dops.filter((d) => d.z > d.lz + 2).map((d) => d.dop)), down = Math.min(9, ...dops.filter((d) => d.z < d.lz - 2).map((d) => d.dop));
    G.specials.end(E, 'time'); step(0.1);
    R('Twister Zooka: zooka_arm, zooka_fire, a twister loop following each twister — pitch up coming at you, down going away (Doppler), gone with it',
      !!firstPlay(t0, 'zooka_arm') && !!firstPlay(t0, 'zooka_fire') && L.n > 0 && !L.follow && !L.multi && up > 1.08 && down < 0.93 && !slotsOf(tw).length, { loop: L, dopplerIn: r2(up), dopplerOut: r2(down) });
  });

  // ---- Howl Box: held hum, the charge with YOU in its line (a beam lock ≥ 0.6 s ahead), the blast loop, gone after
  specialScene('wail', () => {
    reset(); place(E, 0, 6); aimAt(E, me.pos.x, me.pos.y + 0.8, me.pos.z); step(0.05); rec.length = 0;
    const t0 = G.time; start(E, 'wail');
    let sp = null, blastT = null;
    const fr = watch(6.3, () => [E, sp].filter(Boolean), () => { aimAt(E, me.pos.x, me.pos.y + 0.8, me.pos.z); sp = sp || G.specials.world.find((w) => w.kind === 'speaker'); if (sp && sp.phase === 'blast' && blastT == null) blastT = G.time; });
    const hold = loopLife(fr, E, 'wail_hold'), lock = loopLife(fr, sp, 'beam_lock'), bl = loopLife(fr, sp, 'wail_blast');
    const lead = blastT != null && lock.from != null ? r2(blastT - lock.from) : null;
    R('Howl Box: wail_up, wail_hold while it\'s carried, wail_charge + a beam_lock warning when you\'re in its line (≥ 0.6 s before the blast), the wail_blast loop, all gone after',
      !!firstPlay(t0, 'wail_up') && hold.n > 0 && !!firstPlay(t0, 'wail_charge') && lead >= 0.6 && bl.n > 0 && sp && !G.specials.world.includes(sp) && !slotsOf(sp).length,
      { hold, lock, blast: bl, lead });
  });

  // ---- Kraken: the body loop with its speed, the dive warning in the jump attack, kraken_off at the end
  specialScene('kraken', () => {
    reset(); place(E, 0, -2); face(E, 0, -8); step(0.05); rec.length = 0;
    const t0 = G.time; const s = start(E, 'kraken');
    let slamT = null; const off = on('special:slam', (e) => { if (e.actor === E && slamT == null) slamT = G.time; });
    const fr = watch(2.2, [E], (i) => {
      if (i < 40) E.intent.move.set(0, 0, -1); else E.intent.move.set(0, 0, 0);
      if (i === 45) E.intent.fire = true; if (i === 46) E.intent.fire = false;
    });
    off();
    const body = loopLife(fr, E, 'kraken_move'), dive = loopLife(fr, E, 'kraken_dive');
    const moving = fr.flatMap((f) => f.objs[0].sl.filter((x) => x.sound === 'kraken_move').map((x) => x.params.speed)).some((v) => v > 0.5);
    const lead = slamT != null && dive.from != null ? r2(slamT - dive.from) : null;
    G.specials.end(E, 'time'); step(0.1);
    R('Kraken: kraken_on, the kraken_move loop following it (faster with its speed), the kraken_dive warning in the jump attack (≥ 0.6 s: its air time), kraken_slam, kraken_off',
      !!firstPlay(t0, 'kraken_on') && body.n > 0 && !body.follow && moving && dive.n > 0 && lead >= 0.6 && !!firstPlay(t0, 'kraken_slam') && !!firstPlay(t0, 'kraken_off') && !slotsOf(E).length,
      { body, dive, lead, moving, slam: !!firstPlay(t0, 'kraken_slam') });
    void s;
  });

  // ---- Bubble Blower: inflating on the blower, each drifting bubble its loop (straining as its team charges it)
  specialScene('blower', () => {
    reset(); place(E, 0, 2); face(E, 0, -8); step(0.05); rec.length = 0;
    const t0 = G.time; start(E, 'blower');
    let bub = null;
    const fr = watch(2.2, () => [E, bub].filter(Boolean), (i) => {
      E.intent.fire = i >= 10 && i < 55;
      if (!bub) bub = G.specials.world.find((w) => w.kind === 'bubble');
      if (i === 100 && bub) G.specials._bubbleHit(bub, E.team, 30, E);
    });
    const inf = loopLife(fr, E, 'blower_inflate'), dr = loopLife(fr, bub, 'bubble_drift');
    const charged = fr.flatMap((f) => f.objs.filter((w) => w.o === bub).flatMap((w) => w.sl.map((s) => s.params && s.params.charge || 0)));
    const maxC = Math.max(0, ...charged);
    G.specials._bubbleHit(bub, E.team, 40, E); step(0.1);
    G.specials.end(E, 'time'); step(0.1);
    R('Bubble Blower: blower_start, blower_inflate while it\'s blown, bubble_release, a bubble_drift loop following it (straining as its team shoots it), bubble_blast, gone after',
      !!firstPlay(t0, 'blower_start') && inf.n > 0 && !!firstPlay(t0, 'bubble_release') && dr.n > 0 && !dr.follow && maxC > 0.4 && !!firstPlay(t0, 'bubble_blast') && !slotsOf(bub).length,
      { inflate: inf, drift: dr, maxCharge: r2(maxC) });
  });

  // ---- Ink Jet: the ignition, the jet loop following the flyer, the boost, jet_end
  specialScene('jetpack', () => {
    reset(); place(E, 0, 2); step(0.05); rec.length = 0;
    const t0 = G.time; start(E, 'jetpack');
    const fr = watch(1.6, [E], (i) => { E.intent.move.set(1, 0, 0); if (i === 50) E.intent.jump = true; if (i === 51) E.intent.jump = false; });
    const L = loopLife(fr, E, 'jet_loop');
    G.specials.end(E, 'time'); step(0.1);
    R('Ink Jet: jet_ignite, a jet_loop following the flyer, jet_boost on a boost, jet_end, gone after',
      !!firstPlay(t0, 'jet_ignite') && L.n > 0 && !L.follow && !!firstPlay(t0, 'jet_boost') && !!firstPlay(t0, 'jet_end') && !slotsOf(E).some((s) => s.sound === 'jet_loop'), { loop: L });
  });

  // ---- Mega Stamp: carried (a stomping loop), thrown (a spinning warning loop on the stamp), the crash
  specialScene('stamp', () => {
    reset(); place(E, 0, 4); aimAt(E, me.pos.x, me.pos.y + 0.8, me.pos.z); step(0.05); rec.length = 0;
    const t0 = G.time; start(E, 'stamp');
    let ts = null;
    const fr = watch(2.2, () => [E, ts].filter(Boolean), (i) => {
      E.intent.move.set(0, 0, i < 50 ? -1 : 0); aimAt(E, me.pos.x, me.pos.y + 0.8, me.pos.z);
      // (a Mega Stamp charges on its own: thrown early, from ~9 m, so it's seen coming — sfx-loud's alert and alarm)
      if (i === 14) E.intent.sub = true; if (i === 15) E.intent.sub = false;
      ts = ts || G.specials.world.find((w) => w.kind === 'stamp');
    });
    const carry = loopLife(fr, E, 'stamp_carry'), fly = loopLife(fr, ts, 'stamp_fly');
    R('Mega Stamp: stamp_start, a stamp_carry loop while it\'s carried, stamp_throw, a stamp_fly warning loop following the thrown stamp, stamp_crash, gone after',
      !!firstPlay(t0, 'stamp_start') && carry.n > 0 && !!firstPlay(t0, 'stamp_throw') && fly.n > 0 && !fly.follow && !!firstPlay(t0, 'stamp_crash') && ts && !slotsOf(ts).length && !slotsOf(E).some((s) => s.sound === 'stamp_carry'),
      { carry, fly });
  });

  // ---- Cheer Orb: the charge loop (climbing), the orb's flight loop, the 1.5 s fuse warning, the blast
  specialScene('booyah', () => {
    reset(); place(E, 0, 6); step(0.05); rec.length = 0;
    const t0 = G.time; const s = start(E, 'booyah');
    let orb = null, blastT = null;
    const pitches = [];
    const fr = watch(4, () => [E, orb].filter(Boolean), (i) => {
      if (i === 30) s.charge = 0.98;
      if (i === 60) { lob(E, 0, -7, SPECIALS.booyah.throwSpeed); E.intent.fire = true; } if (i === 61) E.intent.fire = false;
      orb = orb || G.specials.world.find((w) => w.kind === 'orb');
      const sl = slotsOf(E).find((x) => x.sound === 'booyah_charge'); if (sl) pitches.push(sl.pitch);
      if (blastT == null && firstPlay(t0, 'booyah_blast')) blastT = G.time;
    });
    const ch = loopLife(fr, E, 'booyah_charge'), fl = loopLife(fr, orb, 'orb_fly'), fu = loopLife(fr, orb, 'orb_fuse');
    const lead = blastT != null && fu.from != null ? r2(blastT - fu.from) : null;
    R('Cheer Orb: the booyah_charge loop climbing with the charge, booyah_throw, an orb_fly loop on the orb, orb_land + the orb_fuse warning (≥ 0.6 s ahead), booyah_blast, gone after',
      ch.n > 0 && pitches.length && pitches[pitches.length - 1] > pitches[0] + 0.5 && !!firstPlay(t0, 'booyah_throw') && fl.n > 0 && !!firstPlay(t0, 'orb_land') && lead >= 0.6 && !!firstPlay(t0, 'booyah_blast') && orb && !slotsOf(orb).length,
      { charge: ch, pitch: pitches.length ? [r2(pitches[0]), r2(pitches[pitches.length - 1])] : null, fly: fl, fuse: fu, lead });
  });

  // ---- Zipline: the cloak's aura loop, the zip's whizz while zipping, the impact
  specialScene('zipcaster', () => {
    reset([4, -6]); place(E, 6, 0); step(0.05); rec.length = 0;
    const t0 = G.time; const s = start(E, 'zipcaster');
    let zipped = 0;
    const fr = watch(2, [E], (i) => { if (i === 20) { aimAt(E, 14, 1.5, 0); E.intent.sub = true; } if (i === 21) E.intent.sub = false; if (s.zip) zipped++; });
    const aura = loopLife(fr, E, 'zip_aura'), wz = loopLife(fr, E, 'zip_whizz');
    const whizzAfter = !!slotsOf(E).find((x) => x.sound === 'zip_whizz');
    G.specials.end(E, 'time'); step(0.1);
    R('Zipline: zip_cloak, a zip_aura loop on its wearer, zip_fire / zip_latch, a zip_whizz loop only while zipping, zip_impact, gone after',
      !!firstPlay(t0, 'zip_cloak') && aura.n > 0 && !!firstPlay(t0, 'zip_fire') && !!firstPlay(t0, 'zip_latch') && wz.n > 0 && wz.n <= zipped + 1 && !whizzAfter && !!firstPlay(t0, 'zip_impact') && !slotsOf(E).length,
      { aura, whizz: wz, zippedFrames: zipped });
  });

  // ---- Crab Rig: walk → roll → walk (one loop at a time), the mortar shell's whistle, the reload, the break
  specialScene('crab', () => {
    reset(); place(E, 0, 3); face(E, 0, -8); step(0.05); rec.length = 0;
    const t0 = G.time; const s = start(E, 'crab');
    let shell = null, multi = 0;
    const fr = watch(3.2, () => [E, shell].filter(Boolean), (i) => {
      E.intent.move.set(0, 0, i < 100 ? -0.6 : 0);
      E.intent.squid = i >= 40 && i < 70;
      // (aimed to land at you: the lowest lob that reaches — sfx-loud's alert and alarm)
      if (i === 80) { const D = Math.hypot(me.pos.x - E.pos.x, me.pos.z - E.pos.z); let lp = 0.1, be = 1e9; for (let q = 0.1; q <= 0.6; q += 0.005) { const vx = Math.cos(q) * 17, vy = Math.sin(q) * 17, d = vx * (vy + Math.sqrt(vy * vy + 40 * 1.8)) / 20; if (Math.abs(d - D) < be) { be = Math.abs(d - D); lp = q; } } E.aimPitch = lp - 0.45; E.intent.sub = true; }
      if (i === 81) E.intent.sub = false;
      shell = shell || G.specials.world.find((w) => w.kind === 'shell');
      if (slotsOf(E).filter((x) => x.ch === 'crab').length > 1) multi++;
    });
    const walk = loopLife(fr, E, 'crab_move'), roll = loopLife(fr, E, 'crab_roll'), wh = loopLife(fr, shell, 'shell_whistle');
    const vys = fr.flatMap((f) => f.objs.filter((w) => w.o === shell).flatMap((w) => w.sl.map((x) => x.params.vy)));
    G.specials.end(E, 'time'); step(0.1);
    R('Crab Rig: crab_boot, crab_move then crab_roll then crab_move (one at a time), crab_cannon, a shell_whistle warning following the shell (climbing then falling), shell_boom, crab_reload, crab_break, gone after',
      !!firstPlay(t0, 'crab_boot') && walk.n > 0 && roll.n > 0 && !multi && !!firstPlay(t0, 'crab_cannon') && wh.n > 0 && !wh.follow && vys.length && Math.max(...vys) > 0 && Math.min(...vys) < 0 && !!firstPlay(t0, 'shell_boom') && !!firstPlay(t0, 'crab_reload') && !!firstPlay(t0, 'crab_break') && !slotsOf(E).length,
      { walk, roll, multi, whistle: wh, vy: vys.length ? [r2(Math.max(...vys)), r2(Math.min(...vys))] : null });
    void s;
  });

  // every special starts with its own sound (on top of the shared special_activate)
  if (want('starts', 'specials')) {
    const miss = Object.keys(SPECIALS).filter((id) => { const k = SPECIALS[id].kind || id; return !SPECIAL_START[k] && !['bubbler', 'sonar', 'kraken', 'booyah'].includes(k); });
    R('every special has its own start sound (the four that don\'t start through cues start with shield_up / sonar_ping / kraken_on / the booyah_charge loop)', !miss.length, { missing: miss });
  }

  // sfx-loud: the launch alerts, the in-zone alarms, the stings
  if (want('starts', 'specials') && Object.keys(warned).length >= 12) {
    const ALERT = { slam: 'alert_slam', strike: 'alert_strike', booyah: 'alert_orb', storm: 'alert_storm', barrage: 'alert_barrage', zooka: 'alert_twister', wail: 'alert_wail', kraken: 'alert_kraken', crab: 'alert_shell', stamp: 'alert_stamp' };
    const ALARM = { slam: 'slam', strike: 'strike', booyah: 'orb', storm: 'storm', wail: 'wail', stamp: 'stamp', crab: 'shell' };   // (the scenes that put you in it)
    const bad = [];
    for (const [k, a] of Object.entries(ALERT)) if (warned[k] && !warned[k].alerts.includes(a)) bad.push([k, 'no ' + a, warned[k]]);
    for (const [k, a] of Object.entries(ALARM)) if (warned[k] && !warned[k].alarms.includes(a)) bad.push([k, 'no ' + a + ' alarm', warned[k]]);
    R('every enemy special aimed at you plays its own launch alert (Slam, Strike, Cheer Orb, Tempest, Barrage, Zooka, Howl Box, Kraken, Crab Rig shell, Mega Stamp), and the "you\'re in it" alarm where you stand in its area',
      !bad.length, { bad, warned });
    const noSting = Object.entries(warned).filter(([k, w]) => !w.stings.some((x) => x === 'sting_' + (SPECIALS[k] ? SPECIALS[k].kind || k : k) + ':foe'));
    R('every special an enemy pops plays its own sting', !noSting.length, { noSting: noSting.map(([k, w]) => [k, w.stings]) });
    // (your own throws and starts come from you, not from across the lane: mixed further down — realflow.cjs holds
    // them ~3 dB under an enemy's as you hear them)
    const r3 = ['throw', 'start', 'land', 'move', 'warn', 'end'].map((c) => [c, r2(20 * Math.log10(MIX[c].own / MIX[c].foe)), r2(20 * Math.log10(MIX[c].ally / MIX[c].foe))]);
    R('the mix: yours and your team\'s ~3 dB under the enemy\'s (landings, loops, warnings, ends −3 ± 0.5 dB; your own throws and starts, heard from you, further down); launch alerts the enemy\'s only; stings the enemy\'s, your team\'s −6 dB, none for yours',
      r3.every(([c, o, a]) => (c === 'throw' || c === 'start' ? o <= -6 : Math.abs(o + 3) <= 0.5) && Math.abs(a + 3) <= 0.5) && MIX.alert.own === 0 && MIX.alert.ally === 0 && MIX.sting.own === 0 && Math.abs(20 * Math.log10(MIX.sting.ally / MIX.sting.foe) + 6) < 0.5, { r3 });
  }

  // ================================================================================== friend vs foe
  if (want('foe', 'mix')) {
    const fuseOf = (T) => {
      reset(); place(T, 0, -4.5); lob(T, 0.3, -6.4, SUBS.bomb.throwSpeed); step(0.05); rec.length = 0;
      const t0 = G.time; G.projectiles.throwBomb(T);
      const b = G.projectiles.bombs[G.projectiles.bombs.length - 1];
      let v = null, par = null;
      step(0.8, () => { const s = slotsOf(b).find((x) => x.sound === 'fuse_bomb'); if (s && s.params.k > 0.3 && v == null) { v = s.vol; par = s.params.foe; } });
      const th = firstPlay(t0, 'bomb_throw');
      step(1);
      return { vol: v, foe: par, throwPos: !!(th && th.pos), throwVol: th ? th.vol : null };
    };
    const own = fuseOf(me), ally = fuseOf(F[0]), foe = fuseOf(E);
    R('friend vs foe: the enemy\'s fuse is the loud, harsh one (params.foe 1); your own is quieter and softer (foe 0) — a teammate\'s none at all (sub-tweaks); your own throw comes from you (no position), the enemy\'s from them',
      foe.vol > own.vol * 1.6 && ally.vol == null && ally.throwVol == null && foe.foe === 1 && own.foe === 0 && !own.throwPos && foe.throwPos,
      { own, ally, foe });
    // your own transformation's body loop has no position (it's you)
    reset(); step(0.05);
    start(me, 'jetpack'); step(0.3);
    const js = slotsOf(me).find((s) => s.sound === 'jet_loop');
    G.specials.end(me, 'time'); step(0.2);
    R('your own Ink Jet\'s loop plays from you (no position); an enemy\'s is positional (Ink Jet scene)', js && js.twoD && js.h._pos == null, { twoD: js && js.twoD });
  }

  // ================================================================================== teammates' subs (2026-10-01)
  // the user: "dont give throw/warning sounds of teammates bombs, but do play their explosion sound a bit fainter than
  // normal" — a teammate's thrown sub makes no throw / flight / landing / fuse / windup sound; its blast plays at
  // MIX.boom.allySub (0.6 × the enemy's); its devices' own loops stay; yours and the enemy's unchanged
  if (want('ally', 'mix')) {
    const runBy = (T, kind, secs, at = [0.3, -6.4]) => {
      reset(); place(T, 0, -4.5); T.setSub(kind); T.ink = PLAYER.inkMax; lob(T, at[0], at[1], SUBS[kind].throwSpeed || 13); step(0.05); rec.length = 0;
      const t0 = G.time, loops = new Set();
      if (kind === 'bomb') G.projectiles.throwBomb(T); else G.subs.use(T, SUBS[kind]);
      step(secs, () => { for (const s2 of C.live()) loops.add(s2.sound); });
      const ps = plays(t0);
      return { names: [...new Set(ps.map((r) => r.n))], loops: [...loops], vol: (n) => { const r = ps.find((x) => x.n === n); return r ? r.vol : null; } };
    };
    const SILENT = { bomb: ['bomb_throw', 'bomb_beep', 'sub_flight', 'fuse_bomb'], seeker: ['throw_seeker', 'seeker_land', 'seeker_prime', 'sub_flight', 'seeker_run'] };
    const BOOM = { bomb: 'bomb_explode', seeker: 'seeker_explode' };
    const res = {}, bad = [];
    for (const k of ['bomb', 'seeker']) {
      const al = runBy(F[0], k, k === 'bomb' ? 2.2 : 6), fo = runBy(E, k, k === 'bomb' ? 2.2 : 6);
      const heard = SILENT[k].filter((n) => al.names.includes(n) || al.loops.includes(n));
      const ratio = al.vol(BOOM[k]) != null && fo.vol(BOOM[k]) ? r2(al.vol(BOOM[k]) / fo.vol(BOOM[k])) : null;
      const foeHas = SILENT[k].filter((n) => fo.names.includes(n) || fo.loops.includes(n));
      res[k] = { allyHeard: heard, foeHas, ratio };
      if (heard.length || ratio == null || Math.abs(ratio - 0.6) > 0.02 || foeHas.length < SILENT[k].length - 1) bad.push(k);
    }
    R('a teammate\'s thrown Splat Bomb: no throw, flight, landing beep or fuse sound for you; its blast at 0.6 × the enemy\'s (the enemy\'s bomb: every one of them)', !bad.includes('bomb'), res.bomb);
    R('…a teammate\'s Skitter Bomb likewise: no throw, flight, landing, run or windup sound; its blast at 0.6 × the enemy\'s', !bad.includes('seeker'), res.seeker);
    // a teammate's device keeps its own loop (a sprinkler spinning), only its throw / flight / landing go
    const sp = runBy(F[0], 'sprinkler', 1.6, [0, -4]);
    R('…a teammate\'s sprinkler still spins (its device loop, as a teammate\'s), with no throw, flight or landing sound',
      sp.loops.includes('sprinkler_spin') && !sp.loops.includes('sub_flight') && !sp.names.includes('throw_sprinkler') && !sp.names.includes('sprinkler_stick'), sp);
    R('the mix: MIX.boom.allySub is 0.6 × MIX.boom.foe; a teammate\'s throw / landing / beep / fuse / warning / flight 0; its device loops, ends and uses as a teammate\'s',
      Math.abs(MIX.boom.allySub / MIX.boom.foe - 0.6) < 1e-9 && ['throw', 'land', 'beep', 'warn', 'fly'].every((c) => MIX[c].allySub === 0) && MIX.move.allySub === MIX.move.ally && MIX.end.allySub === MIX.end.ally && MIX.use.allySub === MIX.use.ally,
      { boom: [MIX.boom.allySub, MIX.boom.foe] });
  }

  // ================================================================================== the mix in a crowd
  if (want('caps', 'mix')) {
    reset();
    const foes = B.slice(0, 4), mates = F.slice(0, 2);
    foes.forEach((e, i) => { place(e, -6 + i * 4, 4); });
    mates.forEach((e, i) => { place(e, -3 + i * 6, -12); });
    let maxLive = 0, maxEngine = 0, maxWarn = 0, maxMove = 0, maxVoices = 0;
    const tick = () => {
      const L = C.live(); maxLive = Math.max(maxLive, L.length);
      maxWarn = Math.max(maxWarn, L.filter((s) => s.warn).length); maxMove = Math.max(maxMove, L.filter((s) => !s.warn).length);
      maxEngine = Math.max(maxEngine, [...A.loops].filter((h) => h.playing).length);
      maxVoices = Math.max(maxVoices, A.stats().voices);
    };
    const kinds = ['bomb', 'sticky', 'seeker', 'burst', 'mist', 'sprinkler', 'curtain', 'torpedo', 'waddle', 'shaker', 'boomerang', 'tracer'];
    step(0.05);
    for (let r = 0; r < 3; r++) {
      foes.forEach((e, i) => {
        const k = kinds[(r * 4 + i) % kinds.length]; e.setSub(k); e.ink = PLAYER.inkMax;
        lob(e, -2 + i, -5 + r, SUBS[k].throwSpeed || 13); aimAt(e, me.pos.x, 1, me.pos.z); lob(e, -2 + i, -5 + r, SUBS[k].throwSpeed || 13);
        if (k === 'bomb') G.projectiles.throwBomb(e); else G.subs.use(e, SUBS[k]);
      });
      mates.forEach((e) => { lob(e, 0, 2, SUBS.bomb.throwSpeed); G.projectiles.throwBomb(e); });
      step(0.35, tick);
    }
    start(foes[0], 'jetpack'); start(foes[1], 'crab'); start(mates[0], 'kraken');
    step(2.5, tick);
    R(`a crowd (4 foes throwing 12 subs, 2 mates bombing, a Jet, a Crab, a Kraken): at most ${MAX.move} moving + ${MAX.warn} warning cue loops at once, the engine's live loops within 24 (its cap is 32) and its voices within 48`,
      maxWarn <= MAX.warn && maxMove <= MAX.move && maxEngine <= 24 && maxVoices <= 48 && C.stats.capped > 0,
      { maxLive, maxWarn, maxMove, maxEngine, maxVoices, capped: C.stats.capped });
    // nothing painful: every level the director asked for stays in bounds
    const loud = rec.filter((r) => r.vol / lvOf(r.n) > 2);
    const loudLoops = C.live().filter((s) => s.vol > 1.6);
    R('no cue\'s mix asks for more than 2× on top of its calibrated level (loops ≤ 1.6×)', !loud.length && !loudLoops.length, { loud: loud.slice(0, 5).map((r) => [r.n, r2(r.vol)]) });
  }

  // ================================================================================== pause / the end / a quit
  if (want('pause', 'life')) {
    reset(); place(E, 0, 3); E.setSub('sprinkler'); lob(E, 0, -4, SUBS.sprinkler.throwSpeed); G.subs.use(E, SUBS.sprinkler);
    step(1.2);
    const before = C.live().map((s) => s.key).sort().join();
    // (the audio clock can lag real time under load: wait until it has run the 0.08 s fade)
    const settle = async () => { const c0 = A.ctx.currentTime, w0 = performance.now(); for (let i = 0; i < 80 && A.ctx.currentTime - c0 < 0.25; i++) await wait(50); return { audio: r2(A.ctx.currentTime - c0), real: r2((performance.now() - w0) / 1000), state: A.ctx.state }; };
    g.pause(); step(0.5); const st1 = await settle();
    // (the cue loops run through the cue loop bus — sfx-loud; a bus with nothing playing through it isn't processed, so
    // its gain reads stale: the one carrying the sprinkler is the one to read)
    const dbg = { paused: m.paused, loopsPaused: A.loopsPaused, gain: r2(A.cueLoopIn.gain.value), st1, voices: A.stats().voices, loops: [...A.loops].filter((h) => h.playing).length };
    // (if the audio clock barely ran — a busy machine, another app holding the audio device — the 0.08 s fade can't
    //  have played out: then the pause is judged by its state, not the gain it is still ramping toward)
    const stalled = st1 && st1.audio < 0.09;
    const hushed = A.loopsPaused && (A.cueLoopIn.gain.value < 0.05 || stalled), same = C.live().map((s) => s.key).sort().join() === before && before.length > 0;
    g.resume(); step(0.1); await settle();
    R('a pause hushes the cue loops (the cue loop bus), keeps them (no orphan, no duplicate) and they come back on resume',
      hushed && same && !A.loopsPaused && A.cueLoopIn.gain.value > 0.95 && C.live().length > 0, { before, hushed, same, after: r2(A.cueLoopIn.gain.value), dbg });
  }
  if (want('quit', 'life')) {
    // quitting mid-special (a jet running, a Tempest raining, a sprinkler spinning): nothing of the match keeps sounding
    reset(); place(E, 0, 3); start(E, 'jetpack'); place(E2, 2, 4); start(E2, 'storm');
    const E3 = B[2]; place(E3, -2, 3); E3.setSub('sprinkler'); lob(E3, -2, -3, SUBS.sprinkler.throwSpeed); G.subs.use(E3, SUBS.sprinkler);
    step(1.5);
    const cueNames = new Set(C.live().map((s) => s.sound));
    await g.quitToMenu(); await wait(1200);
    for (let i = 0; i < 30; i++) frame();
    // what's live now belongs to the menus' backdrop match (its own bots) — never to the match we left
    const inWorld = (o) => G.actors.includes(o) || liveIn(o);
    const orphans = C.live().filter((s) => !inWorld(s.obj)).map((s) => s.sound);
    const engineCue = [...A.loops].filter((h) => h.playing && [...cueNames].includes(h.name)).length;
    R('after quitting to the menu mid-special: no cue loop of the old match survives (only the backdrop match\'s own, if any)', cueNames.size >= 3 && orphans.length === 0 && engineCue <= C.live().length,
      { hadBefore: [...cueNames], orphans, live: C.live().map((s) => s.sound), engineCue });
  }
  if (want('end', 'life')) {
    // (a fresh match when the quit test has left the menus up)
    if (!g.match || g.match.attract || g.match.state !== 'playing') {
      await g.api.startMatch({ mapId: 'testbox', duration: 180, mode: 'turf' });
      for (let i = 0; i < 900 && g.match.state !== 'playing'; i++) frame();
    }
    const M2 = g.match, me2 = M2.local, foes2 = M2.actors.filter((a) => a.team !== me2.team);
    for (const a of M2.actors) { if (a.bot) a.bot.update = () => {}; zero(a); a.hp = 1e6; }
    const [X, Y] = foes2;
    place(me2, 0, -8); place(X, 0, 3); place(Y, 3, 3); step(0.3);
    X.setSub('sprinkler'); lob(X, 0, -4, SUBS.sprinkler.throwSpeed); G.subs.use(X, SUBS.sprinkler);
    Y.setSub('curtain'); lob(Y, 3, -3, SUBS.curtain.throwSpeed); G.subs.use(Y, SUBS.curtain);
    step(1.2);
    const had = C.live().length;
    M2.time = 0.05; step(0.6);
    const devices = G.subs.items.filter((it) => it.state !== 'dead').length;
    R('the round ends (time\'s up): every cue loop stops though the devices are still standing', had > 0 && M2.state !== 'playing' && devices > 0 && C.live().length === 0 && ![...A.loops].some((h) => h.playing && /sprinkler_spin|curtain_drip/.test(h.name)),
      { had, state: M2.state, devices, live: C.live().length });
  }
  return out;
})()
