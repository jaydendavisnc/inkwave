// Botlab: the sub / special cues as the PLAYER hears them, through the real menus (trusted input, like
// tools/botlab/quit-check.cjs — no api.startMatch). An AnalyserNode taps the master output and every voice's own output
// (after its distance roll-off and panning; a cue's × the cue bus — the Cues slider's gain and its compressor's
// reduction at that moment: what reaches the mix), so each cue's audible level can be compared with the ordinary weapon
// fire and splats around it, in dB.
//   BOTLAB_OUT=… SLOTS=4 tools/botlab/run.sh tools/botlab/sfx/realflow.cjs            (OUT=file.json: the numbers)
// Flow: title → (a key: the first gesture starts the audio) → main → PLAY → TURF WAR → START! → the match; staged
// scenes from the local player's view (you throw each sub; an enemy 7 m off throws each sub at you; every enemy special
// that can hit you, aimed at you; a teammate's Splat Bomb landing in front of you (silent till its quieter blast: the
// teammates'-subs rule); every special popped by an enemy / a teammate / you; a busy fight with a pile of them
// at once), each over a busy fight (you firing, an enemy firing at you); then pause / resume, quit to the menu, the
// Cues slider in the audio settings (trusted clicks), a second match, practice and its loadout screen — in each: the
// cue director updating (not quiet), the loop bus open, the listener set, the cue voices' gains live.
// Then the regression bars: per cue family, the median audible level (a voice's loudest 43 ms) against your own weapon
// fire (sfx-loud, 2026-10-01: the enemy's throws and landings ≥ 0 dB, its devices' and specials' loops ≈ +2, its
// warnings +8 … +12, yours ~3 dB under the enemy's); every thrown sub's flight gliding over its airtime; every enemy
// special's launch alert and "you're in it" alarm, with their lead before it hits you; the stings; nothing painful in
// the busy fight (sample peak, K-weighted short-term loudness, LUFS-S).
// (The first fix, 2026-10-01: the cues had been 8–18 dB under the gun and the music — played, but masked. The second,
// the same day: "still too quiet … they all need to be louder" — +6 dB on the cue bus, the Cues slider.)
const { app } = require('electron');
const fs = require('fs');
require(process.env.S + '/offscreen-boot.cjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const R = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
setTimeout(() => { console.log('WATCHDOG'); app.exit(1); setTimeout(() => process.exit(1), 3000); }, +(process.env.WATCHDOG || 900000));

// ---- the page-side probe: master + per-voice analysers, the cue director's pulse
const PROBE = `(() => {
  if (window.__probe) return true;
  const G = __G, A = G.audio, ctx = A.ctx;
  if (!ctx) return false;
  const mk = () => { const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0; return an; };
  const buf = new Float32Array(2048);
  const lvl = (an) => { an.getFloatTimeDomainData(buf); let s = 0, p = 0; for (let i = 0; i < buf.length; i++) { s += buf[i] * buf[i]; const a = Math.abs(buf[i]); if (a > p) p = a; } return [Math.sqrt(s / buf.length), p]; };
  const master = mk(); (A.limiter || A.master).connect(master);
  const music = mk(); A.duckG.connect(music);   // the music after its volume and any duck (before the master, like each voice)
  // the master's loudness (ITU-R BS.1770 K-weighting: a +4 dB shelf over 1.5 kHz, a 38 Hz high-pass; L + R) and its
  // sample peak per channel
  const out = A.limiter || A.master, ksh = ctx.createBiquadFilter(), khp = ctx.createBiquadFilter();
  ksh.type = 'highshelf'; ksh.frequency.value = 1500; ksh.gain.value = 4; khp.type = 'highpass'; khp.frequency.value = 38; khp.Q.value = 0.5;
  const ksp = ctx.createChannelSplitter(2), psp = ctx.createChannelSplitter(2);
  out.connect(ksh); ksh.connect(khp); khp.connect(ksp); out.connect(psp);
  const kL = mk(), kR = mk(), pL = mk(), pR = mk(); ksp.connect(kL, 0); ksp.connect(kR, 1); psp.connect(pL, 0); psp.connect(pR, 1);
  const P = { taps: [], done: [], masterMax: 0, masterSum: 0, masterN: 0, music: {},  cue: { calls: 0, quiet: 0, lastQuiet: null, live: 0, maxLive: 0 }, voiceBad: [],
    loud: {}, kq: [], comp: {} };
  let cur = null;
  const oPlay = A.play.bind(A), oLoop = A.loop.bind(A), oVoice = A._voice.bind(A);
  A._voice = (...args) => {
    const [def, t, pos, vol, withFade] = args, cue = !!args[6], post = cue && !withFade && args[7] < 0.999 ? args[7] : 1;
    const v = oVoice(...args);
    try {
      const node = v.panner || v.fade || v.out, an = mk(); node.connect(an);
      if (!(vol > 0) || !Number.isFinite(vol)) P.voiceBad.push({ name: cur, vol });
      P.taps.push({ name: cur, an, node, v, cue, post, t0: performance.now(), g0: G.time, pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null, vol, loop: !!withFade, max: 0, peak: 0, sum: 0, n: 0,
        d: pos ? Math.hypot(pos.x - A.L.x, pos.y - A.L.y, pos.z - A.L.z) : 0, scene: P.scene || null });
    } catch (e) { /* */ }
    return v;
  };
  // voices the engine had to steal (over its caps) — by name, and whether it was a cue's
  P.stolen = {}; const names = new WeakMap(); const oSteal = A._steal.bind(A);
  A._steal = (voice, now) => { if (voice && !voice.stolen && !(voice.v && voice.v.dead)) { const n = names.get(voice) || '?'; P.stolen[n] = (P.stolen[n] || 0) + 1; } return oSteal(voice, now); };
  const oVoice2 = A._voice; A._voice = (...args) => { const v = oVoice2(...args); names.set(v, cur); return v; };
  A.play = (n, o) => { cur = n; try { return oPlay(n, o); } finally { cur = null; } };
  A.loop = (n, o) => { cur = n; try { return oLoop(n, o); } finally { cur = null; } };
  if (G.cues && !G.cues.__probed) {
    G.cues.__probed = true;
    const up = G.cues.update.bind(G.cues);
    G.cues.update = (dt, o) => { P.cue.calls++; if (o && o.quiet) P.cue.quiet++; P.cue.lastQuiet = !!(o && o.quiet); up(dt, o); P.cue.live = G.cues.live().length; P.cue.maxLive = Math.max(P.cue.maxLive, P.cue.live); };
  }
  const poll = () => {
    const now = performance.now();
    const [mr] = lvl(master); P.masterMax = Math.max(P.masterMax, mr); if (mr > 1e-5) { P.masterSum += mr * mr; P.masterN++; }
    if (P.scene) { const [qr] = lvl(music); const M = P.music[P.scene] || (P.music[P.scene] = { sum: 0, n: 0 }); M.sum += qr * qr; M.n++; }
    // loudness: K-weighted mean square (L + R) over the last 3 s (short-term) and 0.4 s (momentary); sample peaks
    const [l] = lvl(kL), [r2] = lvl(kR), [, pl] = lvl(pL), [, pr] = lvl(pR);
    P.kq.push([now, l * l + r2 * r2]); while (P.kq.length && now - P.kq[0][0] > 3000) P.kq.shift();
    const lu = (ms) => -0.691 + 10 * Math.log10(ms + 1e-12);
    let s3 = 0, s4 = 0, n4 = 0; for (const [t, q] of P.kq) { s3 += q; if (now - t <= 400) { s4 += q; n4++; } }
    const red = A.cueComp ? A.cueComp.reduction : 0;
    if (P.scene) {
      const Lz = P.loud[P.scene] || (P.loud[P.scene] = { s: -99, m: -99, peak: 0, red: 0 });
      if (now - P.kq[0][0] > 2500) Lz.s = Math.max(Lz.s, lu(s3 / P.kq.length));
      if (n4) Lz.m = Math.max(Lz.m, lu(s4 / n4));
      Lz.peak = Math.max(Lz.peak, pl, pr); Lz.red = Math.min(Lz.red, red);
    }
    // a cue voice reaches the mix through the cue bus: × its gain (the Cues slider) × its compressor's reduction now (a
    // teammate's blast through its twin, cuePost: × that one's gain and reduction × its post share)
    const kc = A.cueBus ? A.cueBus.gain.value * Math.pow(10, (red || 0) / 20) : 1;
    const kp = A.cuePost ? A.cuePost.gain.value * Math.pow(10, (A.cuePostComp.reduction || 0) / 20) : kc;
    for (let i = P.taps.length - 1; i >= 0; i--) {
      const tp = P.taps[i]; let [r, p] = lvl(tp.an);
      if (tp.cue) { const k = tp.post < 1 ? kp * tp.post : kc; r *= k; p *= k; }
      if (r > tp.max) tp.max = r; if (p > tp.peak) tp.peak = p; if (r > 1e-5) { tp.sum += r * r; tp.n++; }
      if (tp.v.v.dead || tp.v.done || (!tp.loop && now - tp.t0 > 4000) || (tp.loop && now - tp.t0 > 20000)) {
        try { tp.node.disconnect(tp.an); } catch (e) { /* */ }
        P.done.push({ name: tp.name, scene: tp.scene, max: tp.max, peak: tp.peak, mean: tp.n ? Math.sqrt(tp.sum / tp.n) : 0, loop: tp.loop, pos: !!tp.pos, d: tp.d, vol: tp.vol, g0: tp.g0, cue: tp.cue });
        P.taps.splice(i, 1);
      }
    }
  };
  P.flush = () => { for (const tp of P.taps) P.done.push({ name: tp.name, scene: tp.scene, max: tp.max, peak: tp.peak, mean: tp.n ? Math.sqrt(tp.sum / tp.n) : 0, loop: tp.loop, pos: !!tp.pos, d: tp.d, vol: tp.vol, g0: tp.g0, cue: tp.cue, open: true }); P.taps.length = 0; };
  setInterval(poll, 12);
  window.__probe = P;
  return true;
})()`;

let claimed = false;
app.on('browser-window-created', (_, win) => {
  if (claimed) return; claimed = true;
  win.webContents.setBackgroundThrottling(false);
  win.webContents.once('did-finish-load', async () => {
    const js = (c) => win.webContents.executeJavaScript(c, true);
    const errs = [];
    win.webContents.on('console-message', (e) => { const m = String(e.message); if (/error/i.test(String(e.level)) || /TypeError|ReferenceError/.test(m)) errs.push(m.slice(0, 300)); });
    try {
      for (let i = 0; i < 160; i++) { if (await js('!!(window.__inkwave && window.__inkwave.menus && window.__inkwave.menus.current)')) break; await wait(250); }
      for (let i = 0; i < 80; i++) { if (await js(`window.__inkwave.menus.current === 'title'`)) break; await wait(250); }
      await wait(800);
      // trusted input
      const KC = { Enter: 'Return', Escape: 'Escape', KeyL: 'L', KeyE: 'E' };
      const key = async (k) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode: KC[k] || k }); await wait(50); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: KC[k] || k }); await wait(50); };
      const click = async (sel, re) => {
        const r = await js(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 4 && b.height > 4 && getComputedStyle(e).visibility !== 'hidden'; });
          const e = ${re ? `els.find((x) => ${re}.test(x.textContent))` : 'els[0]'}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
        if (!r) return false;
        win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
        await wait(40);
        win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
        await wait(70);
        win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
        return true;
      };
      const screen = () => js('window.__inkwave.menus.current');
      // the "What's New" card (first main menu of an update) sits over the menu: close it as a player would
      const dismiss = async () => {
        for (let i = 0; i < 3; i++) {
          if (!(await js(`!!document.querySelector('.iw-modal:not(.is-leaving)')`))) return;
          await key('Escape'); await wait(700);
          if (await js(`!!document.querySelector('.iw-modal:not(.is-leaving)')`)) { await click('.iw-modal .iw-btn'); await wait(700); }
        }
      };
      const until = async (cond, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(cond)) return true; await wait(150); } return false; };
      // the state of the audio path right now
      const audioState = () => js(`(() => { const G = __G, A = G.audio, g = window.__inkwave, P = window.__probe, m = G.match;
        const cam = (g.rig && g.rig.gameCam) || G.camera;
        return { ctx: A.ctx ? A.ctx.state : 'none', vol: { ...A.vol }, settings: { master: g.settings.master, music: g.settings.music, sfx: g.settings.sfx, cues: g.settings.cues }, cueBus: A.cueBus ? +A.cueBus.gain.value.toFixed(3) : null,
          master: A.master ? +A.master.gain.value.toFixed(3) : null, sfxBus: A.sfxBus ? +A.sfxBus.gain.value.toFixed(3) : null, sfxIn: A.sfxIn ? +A.sfxIn.gain.value.toFixed(3) : null,
          loopIn: A.loopIn ? +A.loopIn.gain.value.toFixed(3) : null, loopsPaused: !!A.loopsPaused, duck: A.duckG ? +A.duckG.gain.value.toFixed(3) : null,
          listenerOff: cam ? +Math.hypot(A.L.x - cam.position.x, A.L.y - cam.position.y, A.L.z - cam.position.z).toFixed(2) : null,
          cue: P ? { ...P.cue } : null, cueLive: G.cues ? G.cues.live().length : null, screen: g.menus.current, mode: G.mode,
          match: m ? { attract: !!m.attract, state: m.state, paused: !!m.paused, practice: !!m.practice } : null, fullFrame: !!(g.showcase && g.showcase.fullFrame),
          stored: (() => { try { return JSON.parse(localStorage.getItem('inkwave.settings') || localStorage.getItem('inkwave_settings') || 'null'); } catch (e) { return 'err'; } })() }; })()`);

      // ---- 1) title: the first gesture (a key) starts the audio
      R('boot: the title screen', (await screen()) === 'title');
      await key('Enter'); await wait(1500);
      const okProbe = await js(PROBE);
      let st = await audioState();
      R('the first key starts the audio: the context runs, the buses are open', okProbe && st.ctx === 'running' && st.master > 0.3 && st.sfxBus > 0.3 && st.loopIn > 0.95, st);
      R('defaults: master 0.8 / music 0.6 / sfx 0.85 / cues 1 (100 %: the cue bus +6 dB) in the settings and the engine', st.settings.master === 0.8 && st.settings.music === 0.6 && st.settings.sfx === 0.85 && st.settings.cues === 1 && st.vol.master === 0.8 && st.vol.sfx === 0.85 && st.vol.cues === 1 && Math.abs(st.cueBus - 2) < 0.01, { settings: st.settings, vol: st.vol, cueBus: st.cueBus });
      for (let i = 0; i < 20 && (await screen()) !== 'main'; i++) await wait(250);
      await wait(1200); await dismiss();
      R('on the main menu', (await screen()) === 'main', await screen());
      st = await audioState();
      R('main menu: the cue director runs (the backdrop match)', st.cue && st.cue.calls > 10, st.cue);

      // ---- 2) PLAY → TURF WAR → START! (trusted clicks)
      await click('[data-id="play"]'); await until(`window.__inkwave.menus.current === 'mode'`, 8000); await wait(700);
      await click('.iw-mode--turf'); await until(`window.__inkwave.menus.current === 'setup'`, 8000); await wait(1200);
      const stage = await js(`(window.__inkwave.menus._setup && window.__inkwave.menus._setup.mapId) || null`);
      await js('window.__inkwave._onPointerUnlock = () => {}; 0');   // (an offscreen window can't hold the pointer: a lost lock mustn't pause)
      await click('[data-id="start"]');
      const began = await until(`!!(__G.match && !__G.match.attract && __G.match.state === 'playing')`, 60000);
      R('PLAY → TURF WAR → START! reaches a live match', began, { stage, screen: await screen() });
      await wait(1500);
      st = await audioState();
      R('in the match: the director updates (not quiet), the loop bus is open, the listener is on the camera, the context runs',
        st.cue.calls > 0 && st.cue.lastQuiet === false && st.loopIn > 0.95 && st.listenerOff < 0.05 && st.ctx === 'running' && st.duck > 0.5, st);

      // ---- 3) staged scenes from the local player's view, over a busy fight
      const scenes = await js(`(async () => {
        const g = window.__inkwave, G = __G, m = G.match, P = window.__probe, A = G.audio;
        const { SUBS, SPECIALS, PLAYER } = await import('./src/config.js');
        const { on } = await import('./src/core/ctx.js');
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const me = m.local, foes = m.actors.filter((a) => a.team !== me.team), mates = m.actors.filter((a) => a.team === me.team && a !== me);
        const E = foes[0], E2 = foes[1], F = mates[0];
        const idle = () => {};
        for (const a of [E, E2, F]) if (a && a.bot) { a._bu = a.bot.update; a.bot.update = idle; }
        // (everyone else stands still far off: no stray bot's sub or special lands in a scene)
        const rest = m.actors.filter((a) => a !== me && a !== E && a !== E2 && a !== F);
        // (the match's clock held well off its end: no final countdown in a scene)
        const tank = setInterval(() => { m.time = Math.max(m.time, 150); for (const a of [me, E, E2]) { if (!a.alive) a.respawn(); a.hp = 1e6; a.ink = PLAYER.inkMax; } }, 100);
        // a clear run of deck: a direction from a nav node with 12 m of floor and no wall
        const V3 = me.pos.constructor, Gl = G.level;
        // (deterministic: the nav nodes nearest the stage's middle first; the run needs 3 m of floor either side too)
        let spot = null;
        const nodes = ((G.nav && G.nav.nodes) || []).slice().sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
        for (const n of nodes) {
          for (let a = 0; a < 8 && !spot; a++) {
            const yaw = a * Math.PI / 4, dx = Math.sin(yaw), dz = Math.cos(yaw);
            let ok = true;
            for (let s = -5; s <= 17 && ok; s += 1) for (const side of [-3, 0, 3]) { const x = n.x + dx * s + dz * side, z = n.z + dz * s - dx * side, gy = Gl.groundHeight(x, z, n.y + 1.2); if (gy === -Infinity || Math.abs(gy - n.y) > 0.3) { ok = false; break; } }
            if (ok && !G.physics.los(new V3(n.x, n.y + 1.2, n.z), new V3(n.x + dx * 16, n.y + 1.2, n.z + dz * 16))) ok = false;
            if (ok) spot = { x: n.x, y: n.y, z: n.z, dx, dz, yaw };
          }
          if (spot) break;
        }
        if (!spot) return { error: 'no clear spot' };
        const far = nodes.slice().sort((p, q) => Math.hypot(q.x - spot.x, q.z - spot.z) - Math.hypot(p.x - spot.x, p.z - spot.z));
        rest.forEach((a, i) => { if (a.bot) { a._bu = a.bot.update; a.bot.update = idle; } for (const k of ['fire', 'sub', 'special', 'jump', 'squid']) a.intent[k] = false; a.intent.move.set(0, 0, 0);
          const n = far[(i * 7) % Math.max(1, Math.min(far.length, 40))]; if (n) { a.pos.set(n.x, n.y + 0.05, n.z); a.vel.set(0, 0, 0); } });
        const at = (s, side = 0) => ({ x: spot.x + spot.dx * s + spot.dz * side, y: spot.y, z: spot.z + spot.dz * s - spot.dx * side });
        const place = (a, p) => { a.pos.set(p.x, p.y + 0.05, p.z); a.vel.set(0, 0, 0); a.grounded = false; };
        const faceAt = (a, p) => { const y = Math.atan2(p.x - a.pos.x, p.z - a.pos.z); a.yaw = a.aimYaw = y; };
        const lob = (e, p, speed, grav = 24, from = 1.35) => {
          const d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z); let best = 0, be = 1e9;
          for (let q = -0.6; q <= 0.8; q += 0.005) { const tp = Math.min(1.1, Math.max(-0.3, q + 0.28)), vx = Math.cos(tp) * speed, vy = Math.sin(tp) * speed + 1.5, disc = vy * vy + 2 * grav * from; const err = Math.abs((vx * (vy + Math.sqrt(disc))) / grav - d); if (err < be) { be = err; best = q; } }
          e.yaw = e.aimYaw = Math.atan2(p.x - e.pos.x, p.z - e.pos.z); e.aimPitch = best; e.aimPoint.set(p.x, p.y + 0.5, p.z);
        };
        // ---- what the director does, sampled every 30 ms (per scene): the flights' glide, the alarms; the alerts /
        // stings it played (its log); the first hit you take from each source (to time the warnings' lead)
        G.cues.log = [];
        P.gl = {}; P.alarm = {}; P.hits = {}; P.win = {};
        const sampler = setInterval(() => {
          const sc = P.scene; if (!sc) return;
          for (const s of G.cues.live()) {
            if (s.glide != null) (P.gl[sc] || (P.gl[sc] = [])).push({ t: G.time, key: s.key, sound: s.sound, st: s.glide, arc: s.params && s.params.arc, rel: s.rel });
            if (s.sound === 'danger' || s.sound === 'beam_lock') {
              const k = s.sound === 'beam_lock' ? 'wail' : s.params && s.params.kind, A2 = P.alarm[sc] || (P.alarm[sc] = {});
              const a = A2[k] || (A2[k] = { t: G.time, kMax: 0, n: 0 }); a.n++; a.kMax = Math.max(a.kMax, (s.params && s.params.k) || 0);
            }
          }
        }, 30);
        const offHit = on('damage', (e) => { const sc = P.scene; if (!sc || !e || e.victim !== me) return; const H = P.hits[sc] || (P.hits[sc] = {}); if (H[e.source] == null) H[e.source] = G.time; });
        // you, at the start of the run, the camera behind you looking down it
        const settle = async () => { place(me, at(0)); g.rig.yaw = spot.yaw; g.rig.pitch = -0.12; await wait(400); };
        await settle();
        // the busy fight: you firing, an enemy 8 m off (to the side) firing at you
        place(E2, at(8, 3)); faceAt(E2, me.pos); E2.aimPitch = 0; E2.aimPoint.set(me.pos.x, me.pos.y + 1, me.pos.z);
        const fight = (on) => { g.debug.fire(on); E2.intent.fire = on; };
        // each scene starts with you back at the start of the run, the camera behind you (a vortex's pull, a slam's
        // shove mustn't carry into the next one)
        const scene = async (name, ms, fn) => { place(me, at(0)); g.rig.yaw = spot.yaw; g.rig.pitch = -0.12; await wait(250); P.scene = name; P.win[name] = [G.time, 0]; await fn(); await wait(ms); P.win[name][1] = G.time; P.scene = null; };
        const kinds = ['bomb', 'sticky', 'burst', 'seeker', 'scan', 'curtain', 'sprinkler', 'mine', 'beacon', 'mist', 'shaker', 'waddle', 'torpedo', 'tracer', 'boomerang'];
        const throwBy = (a, k) => { a.setSub(k); a.ink = PLAYER.inkMax; if (k === 'bomb') G.projectiles.throwBomb(a); else G.subs.use(a, SUBS[k]); };
        fight(true);
        await scene('fight', 3500, async () => {});
        // (a) you throw each sub, 6 m down the run
        for (const k of kinds) {
          await scene('own:' + k, k === 'sticky' || k === 'mist' ? 3200 : 2400, async () => { place(me, at(0)); const p = at(6); lob(me, p, SUBS[k].throwSpeed || 13); if (k === 'tracer' || k === 'boomerang') { me.aimPitch = -0.05; me.aimPoint.set(p.x, p.y + 1, p.z); } throwBy(me, k); });
        }
        // (b) an enemy 7 m off throws each sub at you (landing ~1.5 m in front of you)
        place(E, at(7)); faceAt(E, me.pos);
        for (const k of kinds) {
          await scene('foe:' + k, k === 'sticky' || k === 'mist' || k === 'waddle' || k === 'seeker' ? 3600 : 2600, async () => {
            // (your stream would shoot a Torpedo / Waddle down before it gets going: hold fire for those two)
            g.debug.fire(!(k === 'torpedo' || k === 'waddle'));
            place(me, at(0)); place(E, k === 'mine' || k === 'beacon' ? at(3) : at(7)); const p = at(1.5); lob(E, p, SUBS[k].throwSpeed || 13);
            if (k === 'tracer' || k === 'boomerang') { E.aimPitch = 0; E.aimPoint.set(me.pos.x, me.pos.y + 1, me.pos.z); }
            throwBy(E, k);
            if (k === 'mine') setTimeout(() => place(me, at(2.4)), 1200);   // walk onto it
          });
        }
        // (b2) a teammate 7 m off throws a Splat Bomb landing ~1.5 m in front of you (2026-10-01: a teammate's sub makes
        // no throw / flight / landing / fuse sound for you; its blast plays at 0.6 × the enemy's)
        // (the enemy shooting at you holds fire for it: a bucket's swing reuses the bomb_throw sound)
        if (F) await scene('ally:bomb', 2600, async () => { g.debug.fire(true); E2.intent.fire = false; place(me, at(0)); place(F, at(7)); faceAt(F, me.pos); lob(F, at(1.5), SUBS.bomb.throwSpeed); throwBy(F, 'bomb'); });
        E2.intent.fire = true;
        if (F) { const n = far[3] || far[0]; if (n) place(F, { x: n.x, y: n.y, z: n.z }); }   // (back out of the way: the specials' scenes as before)
        g.debug.fire(true);
        // (c) every enemy special that can hit you, aimed at you
        const start = (e, id) => { e.specialId = id; e.special = e.specialCost(); e._startSpecial(); return e.specialActive; };
        const endSp = (e) => { const s = e.specialActive; if (!s) return; if (s.id === 'slam' || s.id === 'storm') { e.specialActive = null; return; } try { G.specials.end(e, 'time'); } catch (x) { /* */ } };
        const chest = () => ({ x: me.pos.x, y: me.pos.y + 1, z: me.pos.z });
        const sp = {
          slam: async () => { place(E, at(3)); start(E, 'slam'); },
          strike: async () => { place(E, at(12)); const s = start(E, 'strike'); s.target.set(me.pos.x, 0, me.pos.z + 0.5); s.confirm = true; },
          booyah: async () => { place(E, at(9)); const s = start(E, 'booyah'); s.charge = 0.97; await wait(300); lob(E, at(1), SPECIALS.booyah.throwSpeed); E.intent.fire = true; await wait(60); E.intent.fire = false; },
          kraken: async () => { place(E, at(6)); start(E, 'kraken'); E.intent.move.set(-spot.dx, 0, -spot.dz); await wait(500); E.intent.move.set(0, 0, 0); E.intent.fire = true; await wait(60); E.intent.fire = false; },
          crab: async () => {
            // a high lob from 13 m: the shell's flight (~1.4 s) is the warning
            place(E, at(13)); const s = start(E, 'crab'); await wait(350); faceAt(E, me.pos); s.hull = E.yaw; s.ccd = 0;
            const D = 13, h0 = 1.8; let lp = 1, be = 1e9; for (let q = 0.5; q <= 1.0; q += 0.005) { const vx = Math.cos(q) * 17, vy = Math.sin(q) * 17, d = vx * (vy + Math.sqrt(vy * vy + 40 * h0)) / 20; if (Math.abs(d - D) < be) { be = Math.abs(d - D); lp = q; } }
            E.aimPitch = lp - 0.45; E.intent.sub = true; await wait(80); E.intent.sub = false;
          },
          zooka: async () => { place(E, at(16, 1.2)); start(E, 'zooka'); await wait(300); faceAt(E, at(-8)); E.aimPitch = 0; E.aimPoint.set(at(-8).x, at(-8).y + 1.2, at(-8).z); await wait(500); E.intent.fire = true; await wait(1200); E.intent.fire = false; },
          storm: async () => { place(E, at(14)); lob(E, at(1), SPECIALS.storm.throwSpeed, 24, 1.45); start(E, 'storm'); },
          wail: async () => { place(E, at(10)); faceAt(E, me.pos); E.aimPitch = 0; start(E, 'wail'); const hold = setInterval(() => { faceAt(E, me.pos); E.aimPitch = 0; }, 30); await wait(1200); clearInterval(hold); },
          stamp: async () => { place(E, at(11)); start(E, 'stamp'); await wait(150); faceAt(E, me.pos); E.aimPitch = 0.05; E.aimPoint.set(me.pos.x, me.pos.y + 1.2, me.pos.z); E.intent.sub = true; await wait(80); E.intent.sub = false; },
          jetpack: async () => { place(E, at(7)); start(E, 'jetpack'); await wait(700); const aim = setInterval(() => { faceAt(E, me.pos); const c = chest(); E.aimPoint.set(c.x, c.y, c.z); E.aimPitch = Math.atan2(c.y - E.pos.y - 1.2, Math.hypot(c.x - E.pos.x, c.z - E.pos.z)); }, 30); E.intent.fire = true; await wait(1500); E.intent.fire = false; clearInterval(aim); },
          barrage: async () => { place(E, at(7)); start(E, 'barrage'); for (let i = 0; i < 3; i++) { await wait(i ? 450 : 200); lob(E, at(1.5, i - 1), SUBS.bomb.throwSpeed); E.ink = PLAYER.inkMax; G.projectiles.throwBomb(E); } },
        };
        for (const [id, fn] of Object.entries(sp)) { await scene('sp:' + id, id === 'storm' ? 5500 : 3800, fn); E.intent.fire = false; E.intent.sub = false; E.intent.move.set(0, 0, 0); endSp(E); await wait(400); }
        // (d) every special popped — by an enemy 12 m off, by a teammate 6 m off, by you: its sting (the enemy's full,
        // the teammate's softer, none for yours)
        const ids = Object.keys(SPECIALS);
        place(E, at(12, 2));
        await scene('stings', 300, async () => {
          for (const id of ids) { start(E, id); await wait(420); endSp(E); place(E, at(12, 2)); await wait(250); }
          if (F) { place(F, at(6, -3)); start(F, 'strike'); await wait(400); endSp(F); start(F, 'kraken'); await wait(400); endSp(F); }
          start(me, 'bubbler'); await wait(400); endSp(me);
        });
        // (e) the busy fight: a pile of the enemy's threats at once around you, you and an enemy firing
        await scene('busy', 4200, async () => {
          place(E, at(8)); const s = start(E, 'strike'); s.target.set(me.pos.x + 1, 0, me.pos.z); s.confirm = true;
          for (const [k, p] of [['bomb', at(1.5, 1)], ['sticky', at(2, -1)], ['sprinkler', at(3, 1.5)], ['seeker', at(2.5, 0)], ['burst', at(1, -0.5)]]) { await wait(160); lob(E2, p, SUBS[k].throwSpeed || 13); throwBy(E2, k); E2.aimPitch = 0; E2.aimPoint.set(me.pos.x, me.pos.y + 1, me.pos.z); }
          await wait(200); place(E, at(9, -1)); const o = start(E, 'booyah'); o.charge = 0.97; await wait(250); lob(E, at(1), SPECIALS.booyah.throwSpeed); E.intent.fire = true; await wait(60); E.intent.fire = false;
        });
        endSp(E);
        fight(false);
        clearInterval(tank); clearInterval(sampler); offHit && offHit();
        for (const a of [E, E2, F, ...rest]) if (a && a.bot && a._bu) a.bot.update = a._bu;
        const log = G.cues.log.slice(); G.cues.log = null;
        return { spot, stage: G.level.layout && G.level.layout.id, voices: P.done.length, gl: P.gl, alarm: P.alarm, hits: P.hits, win: P.win, log, loud: P.loud };
      })()`);
      R('staged scenes ran (a clear run of deck on the stage)', scenes && !scenes.error, scenes);
      await wait(1500);
      const P = await js(`(() => { const P = window.__probe; P.flush(); const A = __G.audio;
        return { done: P.done.filter((d) => d.scene), voiceBad: P.voiceBad.slice(0, 10), masterMax: P.masterMax, sfxBus: A.sfxBus.gain.value, stolen: P.stolen, counts: { ...A.counts },
          music: Object.fromEntries(Object.entries(P.music).map(([k, v]) => [k, v.n ? Math.sqrt(v.sum / v.n) : 0])) }; })()`);
      // ---- 4) the pause, the quit, a second match, practice + its loadout
      await key('Escape'); await wait(900);
      st = await audioState();
      R('pause (Escape): the loop buses hush (the loops\' and the cue loops\')', st.match && st.match.paused && st.loopIn < 0.05 && st.loopsPaused, st);
      await key('Escape'); await wait(900);
      st = await audioState();
      R('resume (Escape): the loop buses are back, the director updates', st.match && !st.match.paused && st.loopIn > 0.95 && !st.loopsPaused && st.cue.lastQuiet === false, st);
      await key('Escape'); await wait(900);
      const quitOk = await click('.iw-btn', '/QUIT|LEAVE|MAIN MENU/');
      await wait(900);
      await click('.iw-modal .iw-btn', '/QUIT|LEAVE|YES/');
      await until(`window.__inkwave.menus.current === 'main'`, 12000); await wait(1500);
      st = await audioState();
      R('quit to the menu (the pause menu): back on main, the loop bus open, nothing ducked', quitOk && st.screen === 'main' && st.loopIn > 0.95 && st.duck > 0.95, st);
      await dismiss();
      // ---- the Cues slider (SETTINGS → Audio): a trusted click at 80 % of its track → 120 %, live in the engine and
      // saved; at 2/3 → back to 100 %
      const clickTrack = async (fx) => {
        const r = await js(`(() => { const row = [...document.querySelectorAll('.iw-row')].find((x) => { const l = x.querySelector('.iw-row__label'); return l && l.textContent.trim() === 'Cues'; });
          const t = row && row.querySelector('.iw-slider__track'); if (!t) return null; const b = t.getBoundingClientRect(); return { x: Math.round(b.left + b.width * ${fx}), y: Math.round(b.top + b.height / 2) }; })()`);
        if (!r) return false;
        win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y }); await wait(40);
        win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 }); await wait(70);
        win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 }); await wait(400);
        return true;
      };
      await click('[data-id="settings"]'); await until(`window.__inkwave.menus.current === 'settings'`, 8000); await wait(900);
      await click('.iw-tab', '/Audio/'); await wait(900);
      const c1 = await clickTrack(0.8);
      const s1 = await audioState();
      const c2 = await clickTrack(2 / 3);
      const s2 = await audioState();
      R('the Cues slider (SETTINGS → Audio, trusted clicks): 80 % of its track = 120 % — the engine\'s cue bus follows (2 × 1.2^1.5) and it\'s saved; back to 100 %',
        c1 && c2 && s1.settings.cues === 1.2 && s1.vol.cues === 1.2 && Math.abs(s1.cueBus - 2 * Math.pow(1.2, 1.5)) < 0.03 && s1.stored && s1.stored.cues === 1.2 && s2.settings.cues === 1 && Math.abs(s2.cueBus - 2) < 0.03 && s2.stored && s2.stored.cues === 1,
        { clicked: [c1, c2], at120: { settings: s1.settings.cues, vol: s1.vol.cues, bus: s1.cueBus, stored: s1.stored && s1.stored.cues }, back: { settings: s2.settings.cues, bus: s2.cueBus, stored: s2.stored && s2.stored.cues } });
      await key('Escape'); await until(`window.__inkwave.menus.current === 'main'`, 8000); await wait(900); await dismiss();
      await click('[data-id="play"]'); await until(`window.__inkwave.menus.current === 'mode'`, 8000); await wait(700);
      await click('.iw-mode--turf'); await until(`window.__inkwave.menus.current === 'setup'`, 8000); await wait(1200);
      await click('[data-id="start"]');
      const began2 = await until(`!!(__G.match && !__G.match.attract && __G.match.state === 'playing')`, 60000);
      await wait(1500);
      const second = await js(`(async () => { const G = __G, m = G.match, P = window.__probe, me = m.local; const { SUBS } = await import('./src/config.js');
        const E = m.actors.find((a) => a.team !== me.team); E.pos.set(me.pos.x + 4, me.pos.y + 0.05, me.pos.z); E.hp = 1e6; if (E.bot) E.bot.update = () => {};
        const n0 = P.done.length + P.taps.length; P.scene = 'second'; E.setSub('bomb'); E.aimPitch = 0.2; G.projectiles.throwBomb(E); await new Promise((r) => setTimeout(r, 2200)); P.scene = null;
        P.flush(); return P.done.filter((d) => d.scene === 'second' && /bomb|fly|fuse/.test(d.name)).map((d) => [d.name, +(20 * Math.log10(d.max + 1e-9)).toFixed(1)]); })()`);
      st = await audioState();
      R('a second match from the menus: the director updates, the loop bus open, the cues sound (Splat Bomb 4 m off)', began2 && st.cue.lastQuiet === false && st.loopIn > 0.95 && second.some(([n, db]) => n === 'fuse_bomb' && db > -60), { st: { loopIn: st.loopIn, cue: st.cue, duck: st.duck }, second });
      // practice: pause → quit, main → LOADOUT → PRACTICE
      await key('Escape'); await wait(900);
      await click('.iw-btn', '/QUIT|LEAVE|MAIN MENU/'); await wait(900); await click('.iw-modal .iw-btn', '/QUIT|LEAVE|YES/');
      await until(`window.__inkwave.menus.current === 'main'`, 12000); await wait(1200);
      await click('[data-id="loadout"]'); await until(`window.__inkwave.menus.current === 'loadout'`, 8000); await wait(900);
      st = await audioState();
      R('the loadout screen (from the main menu): the loop bus open, nothing ducked, the director running', st.screen === 'loadout' && st.loopIn > 0.95 && st.duck > 0.95 && st.cue.lastQuiet === false, { screen: st.screen, loopIn: st.loopIn, duck: st.duck, cue: st.cue });
      await click('[data-id="practice"]');
      const began3 = await until(`!!(__G.match && !__G.match.attract && __G.match.practice && __G.match.state === 'playing')`, 60000);
      await wait(1500);
      st = await audioState();
      R('practice (LOADOUT → PRACTICE): the director updates, the loop bus open', began3 && st.cue.lastQuiet === false && st.loopIn > 0.95, st);
      await key('KeyL'); await wait(1000);
      const inLoadout = (await screen()) === 'loadout';
      st = await audioState();
      const hushed = st.loopIn < 0.05;
      await key('Escape'); await wait(1200);
      st = await audioState();
      R('practice loadout (L) hushes the loops; leaving it (Escape) opens them again', inLoadout && hushed && !st.match.paused && st.loopIn > 0.95, st);
      R('no console errors', errs.length === 0, errs.slice(0, 5));
      // ---- how loud each cue reaches the mix, against your weapon fire and the music around it (per-voice max RMS)
      const db = (x) => 20 * Math.log10(x + 1e-9);
      const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
      const S = med(P.done.filter((d) => /^shoot_/.test(d.name) && !d.pos).map((d) => db(d.max)));    // your shots (no position)
      const Mu = med(Object.values(P.music).map(db)), SB = db(P.sfxBus);                                // the music (after its volume)
      // each scene's own cues (the sub / special it stages), per family ('sub_fly': the old flight loop, for a run on the
      // code before sfx-loud)
      const FL = 'sub_flight sub_fly';
      const OWN = { bomb: `bomb_throw ${FL} bomb_beep fuse_bomb bomb_explode`, sticky: `throw_sticky ${FL} sticky_stick fuse_sticky sticky_explode`, burst: `throw_burst ${FL} pellet_pop`,
        seeker: `throw_seeker ${FL} seeker_land seeker_run seeker_prime seeker_explode`, scan: `throw_scan ${FL} scan_burst`, curtain: `throw_curtain ${FL} curtain_up curtain_drip curtain_down`,
        sprinkler: `throw_sprinkler ${FL} sprinkler_stick sprinkler_spin`, mine: 'place_mine mine_trip mine_explode', beacon: 'place_beacon beacon_hum', mist: `throw_mist ${FL} mist_burst mist_hiss`,
        shaker: 'throw_shaker shaker_rattle shaker_land shaker_blast', waddle: `throw_waddle ${FL} waddle_land waddle_beep waddle_walk hunt_alarm waddle_prime waddle_explode`,
        torpedo: 'torpedo_throw torpedo_whirr torpedo_transform lock_tone torpedo_burst', tracer: 'tracer_zap tracer_hum tracer_hit', boomerang: 'boomerang_throw boomerang_whirr boomerang_tick boomerang_blast',
        slam: 'slam_leap slam_warn special_slam alert_slam danger sting_slam', strike: 'strike_arm strike_launch strike_mark strike_whistle strike_impact tornado alert_strike danger sting_strike',
        booyah: 'booyah_charge booyah_throw orb_fly orb_land orb_fuse booyah_blast alert_orb danger sting_booyah',
        kraken: 'kraken_on kraken_move kraken_jump kraken_dive kraken_slam alert_kraken danger sting_kraken', crab: 'crab_boot crab_move crab_roll crab_cannon shell_whistle shell_boom crab_reload alert_shell danger sting_crab',
        zooka: 'zooka_arm zooka_fire twister twister_burst alert_twister danger sting_zooka', storm: `storm_throw ${FL} storm_thunder storm_rain alert_storm danger sting_storm`,
        wail: 'wail_up wail_charge wail_blast beam_lock alert_wail sting_wail', stamp: 'stamp_start stamp_carry stamp_throw stamp_fly stamp_crash alert_stamp danger sting_stamp',
        jetpack: 'jet_ignite jet_loop jet_fire jet_boom alert_jet danger sting_jetpack', barrage: 'barrage_start barrage_drum alert_barrage sting_barrage bomb_throw sub_flight fuse_bomb bomb_explode' };
      // [family, scene group, names, median ≥ (dB vs your shots), each ≥, median ≤]
      const FAM = [
        ['enemy throws / placings (~7 m)', 'foe', /^(bomb_throw|throw_\w+|torpedo_throw|boomerang_throw|place_\w+|tracer_zap)$/, 0, -6, 99],
        ['enemy subs in the air', 'foe', /^(sub_flight|sub_fly)$/, 0, -4, 6],
        ['enemy landings / arming', 'foe', /^(bomb_beep|sticky_stick|seeker_land|shaker_land|curtain_up|sprinkler_stick|waddle_land|waddle_beep|boomerang_tick|torpedo_transform)$/, 0, -6, 99],
        ['enemy sub warnings', 'foe', /^(fuse_bomb|fuse_sticky|mine_trip|seeker_prime|waddle_prime|hunt_alarm|lock_tone|seeker_run|shaker_rattle|waddle_walk|torpedo_whirr|boomerang_whirr)$/, 8, 3, 13],
        ['enemy device loops', 'foe', /^(curtain_drip|sprinkler_spin|beacon_hum|mist_hiss|tracer_hum)$/, 0, -5, 6],
        ['enemy sub blasts', 'foe', /^(bomb_explode|sticky_explode|pellet_pop|seeker_explode|scan_burst|mist_burst|mine_explode|shaker_blast|waddle_explode|torpedo_burst|boomerang_blast|tracer_hit)$/, 2, -6, 99],
        ['enemy special starts', 'sp', /^(slam_leap|storm_throw|strike_arm|zooka_arm|crab_boot|crab_reload|zooka_fire|kraken_on|booyah_throw|strike_launch|wail_up|stamp_start|stamp_throw|jet_ignite|barrage_start)$/, 0, -8, 99],
        ['enemy special stings', 'stings', /^sting_\w+$/, 0, -8, 99],
        ['enemy special warnings', 'sp', /^(slam_warn|strike_mark|strike_whistle|kraken_dive|orb_fuse|orb_fly|orb_land|shell_whistle|twister|stamp_fly)$/, 8, 3, 13],
        ['enemy special alerts and alarms', 'sp', /^(alert_\w+|danger|beam_lock)$/, 8, 4, 14],
        // (the speed-scaled ones — a Crab Rig's walk, a carried stamp's stomp — stand still in their scenes: left out)
        ['enemy special body loops', 'sp', /^(kraken_move|booyah_charge|storm_rain|tornado|jet_loop|barrage_drum)$/, 0, -6, 6],
        ['your throws (from you)', 'own', /^(bomb_throw|throw_\w+|torpedo_throw|boomerang_throw|place_\w+|tracer_zap)$/, -3, -8, 99],
        ['your devices, fuses and flight', 'own', /^(sub_flight|sub_fly|fuse_bomb|fuse_sticky|seeker_run|shaker_rattle|curtain_drip|sprinkler_spin|beacon_hum|mist_hiss|waddle_walk|torpedo_whirr|boomerang_whirr|tracer_hum|bomb_beep|sticky_stick|seeker_land|shaker_land|curtain_up|sprinkler_stick|waddle_land|waddle_beep)$/, -5, -14, 99],
      ];
      const best = {};
      for (const d of P.done) {
        if (!d.scene) continue;
        let grp, k;
        if (d.scene === 'stings') { grp = 'stings'; k = d.name; if (!/^sting_/.test(d.name)) continue; }
        else { if (!d.scene.includes(':')) continue; [grp, k] = d.scene.split(':'); if (!OWN[k] || !OWN[k].split(' ').includes(d.name)) continue; }
        const key = d.scene + '|' + d.name, v = db(d.max);
        if (!best[key] || v > best[key].v) best[key] = { v, d: d.d, grp, peak: db(d.peak), vol: d.vol };
      }
      console.log(`REF your shots ${S.toFixed(1)} dBFS (per voice) · the music ${Mu.toFixed(1)} dBFS · sfx bus ${SB.toFixed(1)} dB`);
      const famMed = {};
      for (const [fam, grp, re, mBar, eBar, mMax] of FAM) {
        // (a speed-scaled loop that never moved in its scene — a Crab Rig standing to fire — is silent, not quiet: left out)
        const xs = Object.entries(best).filter(([k, b]) => b.grp === grp && re.test(k.split('|')[1]) && b.v > -80).map(([k, b]) => [k, +(b.v - S).toFixed(1), +b.d.toFixed(1)]);
        const m = med(xs.map((x) => x[1])), low = xs.filter((x) => x[1] < eBar);
        famMed[fam] = m;
        console.log(`FAMILY ${fam}: ${m.toFixed(1)} dB (n ${xs.length})`);
        R(`audible: ${fam} — median ${m.toFixed(1)} dB vs your weapon fire (${(m + S + SB - Mu).toFixed(1)} vs the music), bar ${mBar} … ${mMax} (each ≥ ${eBar})`, xs.length >= 2 && m >= mBar && m <= mMax && !low.length,
          { n: xs.length, below: low, quietest: xs.sort((a, b) => a[1] - b[1]).slice(0, 3), loudest: xs.slice(-2) });
      }
      R('the enemy\'s warnings stand out: 6 dB+ over the enemy throws and over the music', famMed['enemy sub warnings'] - famMed['enemy throws / placings (~7 m)'] >= 6 && famMed['enemy sub warnings'] + S + SB - Mu >= 0,
        { warnings: famMed['enemy sub warnings'], throws: famMed['enemy throws / placings (~7 m)'], vsMusic: +(famMed['enemy sub warnings'] + S + SB - Mu).toFixed(1) });
      // yours ~3 dB under the enemy's, as you hear them: the same throw sound, yours (from you) vs an enemy's 7 m off
      const heard = (grp, name) => best[grp + ':' + name.k + '|' + name.n] ? best[grp + ':' + name.k + '|' + name.n].v : NaN;
      const TH = { bomb: 'bomb_throw', sticky: 'throw_sticky', burst: 'throw_burst', seeker: 'throw_seeker', scan: 'throw_scan', curtain: 'throw_curtain', sprinkler: 'throw_sprinkler', mist: 'throw_mist',
        shaker: 'throw_shaker', waddle: 'throw_waddle', torpedo: 'torpedo_throw', boomerang: 'boomerang_throw', tracer: 'tracer_zap' };
      const fo = Object.entries(TH).map(([k, n]) => [n, +(heard('own', { k, n }) - heard('foe', { k, n })).toFixed(1)]).filter((x) => Number.isFinite(x[1]));
      R('yours ~3 dB under the enemy\'s, as you hear them: each sub\'s throw from you vs an enemy\'s 7 m off, median −3 ± 2 dB', fo.length >= 8 && Math.abs(med(fo.map((x) => x[1])) + 3) <= 2, { median: med(fo.map((x) => x[1])), each: fo });

      // ---- teammates' subs (2026-10-01, "dont give throw/warning sounds of teammates bombs, but do play their explosion
      // sound a bit fainter than normal"): a teammate's Splat Bomb landing in front of you — none of its throw, flight,
      // landing or fuse voices reach the mix; its blast ~0.6 × the enemy's at the same spot (−4.4 dB)
      {
        const allyV = Object.keys(best).filter((k) => k.startsWith('ally:bomb|')).map((k) => k.split('|')[1]);
        const ab = best['ally:bomb|bomb_explode'], fb = best['foe:bomb|bomb_explode'], dB = ab && fb ? +(ab.v - fb.v).toFixed(1) : null;
        const silentOk = !allyV.some((n) => /^(bomb_throw|sub_flight|sub_fly|fuse_bomb|bomb_beep)$/.test(n));
        // (0.6 × — −4.4 dB — is applied after the cue compressor: audio.js cuePost, checked exactly in sfx-cues.js; as heard
        // 1.5 m away it lands nearer the enemy's, −2 … −3 dB in these runs: the enemy's bomb arrives with its own fuse loop
        // already pressing the compressor down, and a blast's level varies ±1 dB play to play. The bar: audibly fainter)
        R('a teammate\'s Splat Bomb landing in front of you: no throw, flight, landing or fuse sound reaches the mix; its blast fainter than the enemy\'s at the same spot (0.6 × mixed; as heard −1 … −7 dB)',
          silentOk && dB != null && dB <= -1 && dB >= -7, { voices: allyV, blastDbVsEnemy: dB });
        console.log(`ALLY bomb voices [${allyV.join(', ')}] · blast ${dB} dB vs the enemy's`);
      }
      // ---- every thrown sub's flight glides over its airtime (the director's pitch, semitones, sampled every 30 ms)
      const GL = scenes.gl || {}, glRes = {};
      for (const grp of ['own', 'foe']) for (const k of ['bomb', 'sticky', 'burst', 'seeker', 'scan', 'curtain', 'sprinkler', 'mist', 'shaker', 'waddle', 'torpedo', 'tracer', 'boomerang']) {
        const xs = (GL[grp + ':' + k] || []).filter((x) => x.rel === (grp === 'own' ? 'own' : 'foe'));
        const by = {}; for (const x of xs) (by[x.key] || (by[x.key] = [])).push(x);
        const run = Object.values(by).sort((a, b) => b.length - a.length)[0] || [];
        const st = run.map((x) => x.st), first = st[0], last = st[st.length - 1], top = Math.max(...st), lo = Math.min(...st);
        glRes[grp + ':' + k] = { n: st.length, sound: run[0] && run[0].sound, first: +(first ?? NaN).toFixed(1), top: +top.toFixed(1), last: +(last ?? NaN).toFixed(1), span: +(top - lo).toFixed(1), airtime: run.length ? +(run[run.length - 1].t - run[0].t).toFixed(2) : 0 };
      }
      // (thrown AT you from 7 m, a Torpedo locks on within 0.1 s, a Tracer is there in 0.1 s, a Boomerang arms on you before
      // it slows: their glide is short — it only has to move; thrown down the lane they glide the whole way — but a
      // Torpedo locks on to whoever's near: the enemy firing at you from the side, sometimes, while it still climbs)
      const glideOk = (sk, r) => { const [grp, k] = sk.split(':'), short = grp === 'foe' && (k === 'torpedo' || k === 'tracer' || k === 'boomerang');
        return r.n >= 3 && (short ? r.span >= 1 : k === 'torpedo' ? r.span >= 2.5 : k === 'tracer' ? r.first - r.last >= 1.5 : k === 'boomerang' ? r.span >= 3 : r.span >= 5 && r.last <= r.first - 3); };
      const glBad = Object.entries(glRes).filter(([sk, r]) => !glideOk(sk, r));
      R('every thrown sub\'s flight changes pitch over its airtime (a lob: up with the climb, the falling whistle to −9 st at the landing; the Tracer falls over its range; the Boomerang out and back)', !glBad.length, { bad: glBad, all: glRes });
      for (const [sk, r] of Object.entries(glRes)) if (sk.startsWith('foe:')) console.log(`GLIDE ${sk.padEnd(15)} ${String(r.sound).padEnd(16)} ${r.first} → top ${r.top} → ${r.last} st over ${r.airtime} s`);

      // ---- every enemy special: its launch alert, its "you're in it" alarm, their lead before it first hurts you
      const EXP = { slam: ['alert_slam', 'slam', 'slam'], strike: ['alert_strike', 'strike', 'strike'], booyah: ['alert_orb', 'orb', 'booyah'], kraken: ['alert_kraken', 'kraken', 'kraken'],
        crab: ['alert_shell', 'shell', 'crab'], zooka: ['alert_twister', 'zooka', 'zooka'], storm: ['alert_storm', 'storm', 'storm'], wail: ['alert_wail', 'wail', 'wail'],
        stamp: ['alert_stamp', 'stamp', 'stamp'], jetpack: ['alert_jet', 'jet', 'jetpack'], barrage: ['alert_barrage', null, 'bomb'] };
      // the lead a player can be given: the mechanics' own (a jet blast at 30 m/s, a stamp thrown at 25 m/s from 11 m, a
      // twister at 34 m/s) — the rest ≥ 0.6 s
      const LEAD = { slam: 0.6, strike: 0.6, booyah: 0.6, crab: 0.6, storm: 0.6, wail: 0.6, zooka: 0.6, kraken: 0.45, stamp: 0.3, jetpack: 0.15, barrage: 0.6 };
      const log = scenes.log || [], spRes = {};
      for (const [id, [al, kind, src]] of Object.entries(EXP)) {
        const sc = 'sp:' + id, w = (scenes.win || {})[sc] || [0, 0], hit = ((scenes.hits || {})[sc] || {})[src];
        const a = log.find((x) => x.name === al && x.t >= w[0] && x.t <= w[1] && x.rel === 'foe'), alarm = kind && ((scenes.alarm || {})[sc] || {})[kind];
        const lv = (n) => best[sc + '|' + n] ? +(best[sc + '|' + n].v - S).toFixed(1) : null;
        spRes[id] = { alert: a ? +(hit != null ? hit - a.t : NaN).toFixed(2) : null, alarm: alarm ? +(hit != null ? hit - alarm.t : NaN).toFixed(2) : kind ? null : 'n/a', kMax: alarm ? +alarm.kMax.toFixed(2) : null,
          hit: hit != null, alertDb: lv(al), alarmDb: kind ? lv(kind === 'wail' ? 'beam_lock' : 'danger') : null };
      }
      const spBad = Object.entries(spRes).filter(([id, r]) => r.alert == null || (EXP[id][1] && r.alarm == null) || !r.hit
        || !(Math.max(r.alert, r.alarm === 'n/a' ? -9 : r.alarm) >= LEAD[id]) || !(r.alertDb >= 4) || (EXP[id][1] && !(r.alarmDb >= 4)));
      R('every enemy special: a launch alert and a "you\'re in it" alarm fire before it hits you (lead ≥ 0.6 s where its speed allows) and stand 4 dB+ over your weapon fire', !spBad.length, { bad: spBad, all: spRes });
      for (const [id, r] of Object.entries(spRes)) console.log(`SPECIAL ${id.padEnd(8)} alert lead ${r.alert} s (${r.alertDb} dB) · alarm lead ${r.alarm} s (${r.alarmDb} dB, k ≤ ${r.kMax})`);
      // ---- the stings: one per special popped by an enemy (each its own), softer for a teammate's, none for yours
      const sw = (scenes.win || {}).stings || [0, 0], sl = log.filter((x) => x.kind === 'sting' && x.t >= sw[0] && x.t <= sw[1] + 1);
      const kindsAll = [...new Set(Object.keys(OWN).length ? ['slam', 'storm', 'barrage', 'bubbler', 'sonar', 'strike', 'zooka', 'wail', 'kraken', 'blower', 'jetpack', 'stamp', 'booyah', 'zipcaster', 'crab'] : [])];
      const foeSt = new Set(sl.filter((x) => x.rel === 'foe').map((x) => x.name.slice(6))), missing = kindsAll.filter((k) => !foeSt.has(k));
      R('stings: every special an enemy pops plays its own sting; a teammate\'s too (softer); yours none', !missing.length && sl.some((x) => x.rel === 'ally') && !sl.some((x) => x.rel === 'own'),
        { missing, ally: sl.filter((x) => x.rel === 'ally').map((x) => x.name), own: sl.filter((x) => x.rel === 'own').length, n: sl.length });

      // ---- nothing painful: no cue voice over 0 dBFS, the master's loudest 43 ms under −4 dBFS (the limiter never
      // pinned); the busy fight's sample peak and loudness (K-weighted, LUFS-S over 3 s) against the plain fight's
      const loudest = Object.entries(best).sort((a, b) => b[1].peak - a[1].peak).slice(0, 3).map(([k, b]) => [k, +b.peak.toFixed(1)]);
      const L = scenes.loud || {}, Lf = L.fight || {}, Lb = L.busy || {};
      const loudInfo = { fight: { lufsS: +(Lf.s || -99).toFixed(1), lufsM: +(Lf.m || -99).toFixed(1), peakDb: +db(Lf.peak || 0).toFixed(1) },
        busy: { lufsS: +(Lb.s || -99).toFixed(1), lufsM: +(Lb.m || -99).toFixed(1), peakDb: +db(Lb.peak || 0).toFixed(1), cueCompMaxReductionDb: +(Lb.red || 0).toFixed(1) } };
      console.log('LOUDNESS ' + JSON.stringify(loudInfo));
      // (a game's loud moments run about −10 … −8 LUFS short-term; the busy fight is a vortex, a Cheer Orb and five subs
      // going off round you over two guns — the worst it gets)
      R('nothing painful: no cue voice peaks over 0 dBFS, the master\'s loudest 43 ms under −4 dBFS; the busy fight never clips (sample peak ≤ −0.5 dBFS) and stays ≤ −8 LUFS-S, ≤ −6 LUFS-M',
        loudest.every((x) => x[1] <= 0) && db(P.masterMax) <= -4 && db(Lb.peak || 0) <= -0.5 && (Lb.s || -99) <= -8 && (Lb.m || -99) <= -6,
        { loudestCuePeaks: loudest, masterMaxRms: +db(P.masterMax).toFixed(1), ...loudInfo });
      const bad = (P.voiceBad || []).filter((b) => !/^(roll|enemy_ink_sizzle|swim|climb|crab_move|crab_roll)$/.test(b.name) || !Number.isFinite(b.vol));
      R('no cue voice starts with a zero / NaN gain (only the speed-scaled loops may start silent)', !bad.length, bad.slice(0, 5));
      if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ results, famMed, glRes, spRes, loudInfo, voices: P.done, masterMax: P.masterMax, voiceBad: P.voiceBad, scenes, music: P.music, sfxBus: P.sfxBus, stolen: P.stolen, counts: P.counts }, null, 1));
    } catch (e) { console.log('HARNESS ERROR', e.stack || e.message); }
    console.log(`RESULT ${results.filter((r) => r.ok).length}/${results.length}`);
    app.quit();
  });
});
