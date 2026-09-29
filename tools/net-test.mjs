// Online end-to-end test: N headless clients on the local relay play a real match on autopilot, then everything the
// players would notice is measured — does everyone see the same match, and do other players move smoothly?
//
// usage: node tools/net-test.mjs [--clients 2] [--secs 24] [--map tidewater] [--time day] [--full] [--shots dir]
//   needs the game on :8490 (npm start) and the relay on :8787 (npm run relay)
//   --full   play the whole (60 s) match through the results and back to the lobby
//   --mode boss   Boss Battle: everyone one squad vs HULLBREAKER; adds the boss checks (same path / clock / HP /
//            moves on every screen, guest hits reaching the host, boss damage landing on each owner's squidkid,
//            the boss carrying on after a host drop-out, one result for everyone)
//
// Smoothness is judged on what is drawn: every rendered frame, each client records every squidkid's on-screen
// position (character root) and facing, stamped with the shared wall clock. For squidkids another player owns this is
// compared with the owner's own frames:
//   pops    frame-to-frame displacement that breaks from its neighbours by > 4 cm (a visible hitch / snap)
//   lag     best-fit delay between the owner's path and the remote render
//   error   distance from the owner's path at that delay (RMS / p99)
//   tele    frames that move > 1.2 m outside a respawn / super jump
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +opt('clients', 2), SECS = +opt('secs', 24), MAP = opt('map', 'tidewater'), TIME = opt('time', 'day');
const FULL = args.includes('--full'), SHOTS = opt('shots', null);
const LEAVE = opt('leave', null);
const MODE = opt('mode', 'turf');
const DROP = opt('drop', 'kill');   // kill: the browser dies (socket closes) · freeze: page frozen, socket left open (dead Wi-Fi)   // 'host' | 'guest': that client drops out (browser closed) halfway through recording
const BASE = opt('url', 'http://localhost:8490/');
const NETQ = opt('net', '');   // e.g. "netlag=40&netjitter=30&netspike=0.01" — simulated connection on every client
const Q = opt('quality', N > 2 ? 'low' : 'high');   // several full game instances share one machine
const W = N > 2 ? 640 : 960, H = N > 2 ? 360 : 540;

const say = (...a) => console.log('[net-test]', ...a);
// never hang a CI shell: hard stop well past the longest possible run
// (kills its browsers first: an exit that leaves headless Chrome running orphans GPU/renderer processes that keep
// spinning their WebGL loops and starve every later run)
const watchdog = setTimeout(() => {
  console.log('[net-test] WATCHDOG — stuck, giving up');
  for (const b of browsers) { try { b.process()?.kill('SIGKILL'); } catch { /* gone */ } }
  process.exit(2);
}, (SECS + (args.includes('--full') ? 260 : 150)) * 1000);
watchdog.unref?.();
const browsers = [], pages = [], logs = [];
async function open(i) {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`,
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
    defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  });
  const p = await b.newPage();
  await p.evaluateOnNewDocument((q) => { try { localStorage.setItem('inkwave.settings', JSON.stringify({ ...(JSON.parse(localStorage.getItem('inkwave.settings')) || {}), quality: q })); } catch { /* */ } }, Q);
  p.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warn' || t === 'warning' || process.env.ALLLOGS) logs.push(`c${i} [${t}] ${m.text()}`); });
  p.on('pageerror', (e) => logs.push(`c${i} [pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
  await p.goto(`${BASE}?skipTitle&autopilot${NETQ ? '&' + NETQ : ''}`, { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction('window.__inkwave && window.__G && __G.net && __G.mode === "menu"', { timeout: 180000, polling: 200 });
  await p.evaluate(() => {   // session diary (printed when something goes wrong)
    const L = (window.__netlog = []), t0 = performance.now(), T = () => ((performance.now() - t0) / 1000).toFixed(1);
    for (const k of ['state', 'error', 'leave', 'host', 'match']) __G.net.on(k, (e) => L.push(`${T()} ${k} ${JSON.stringify(e, (kk, v) => (kk === 'lobby' || kk === 'style' ? undefined : v))}`));
  });
  browsers.push(b); pages[i] = p;
}
const ev = (i, fn, ...a) => pages[i].evaluate(fn, ...a);
const until = (i, js, ms = 60000) => pages[i].waitForFunction(js, { timeout: ms, polling: 100 });

try {
  const t0 = Date.now();
  if (N > 2) { for (let i = 0; i < N; i++) await open(i); } else await Promise.all(Array.from({ length: N }, (_, i) => open(i)));
  say(`${N} clients booted in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  // ---- room: create, join, ready, start
  const code = await ev(0, async () => __G.net.create('Host'));
  say('room', code);
  await ev(0, (m, t, mode) => { __G.net.setSettings({ map: m, time: t, bots: true, difficulty: 'normal', mode }); }, MAP, TIME, MODE);
  for (let i = 1; i < N; i++) {
    await ev(i, async (c, n) => { await __G.net.join(c, n); }, code, 'P' + (i + 1));
  }
  await until(0, `__G.net.lobby.players.length === ${N}`, 15000);
  for (let i = 1; i < N; i++) await ev(i, () => __G.net.setMe({ ready: true }));
  await until(0, '__G.net.canStart()', 10000);
  const lobbies = await Promise.all(pages.map((_, i) => ev(i, () => JSON.stringify(__G.net.lobby.players.map((p) => [p.name, p.team, p.weapon, p.host ? 'H' : ''])))));
  say('lobby', lobbies[0]);
  if (new Set(lobbies).size !== 1) say('!! lobby views differ', lobbies);
  await ev(0, (d) => { __G.net.lobby.duration = d; }, FULL ? (MODE === 'boss' ? 75 : 40) : 600);   // test-only lengths (the UI offers 90 s / 3 min)
  const tStart = Date.now();
  await ev(0, () => __G.net.start());
  await Promise.all(pages.map((_, i) => until(i, '__G.net.state === "match" && __inkwave.match && __inkwave.match.state === "playing"', 60000)));
  say(`all playing ${((Date.now() - tStart) / 1000).toFixed(1)} s after start`);

  // ---- record every rendered frame on every client
  await Promise.all(pages.map((_, i) => ev(i, () => {
    const rec = (window.__rec = { f: [], ev: [] });
    if (!window.__bossDmg) { window.__bossDmg = { taken: 0, n: 0 }; import('/src/core/ctx.js').then(({ on }) => on('damage', (e) => { if (e.source === 'boss' && !e.victim.remote) { __bossDmg.taken += e.amount; __bossDmg.n++; } })); }
    if (__G.netm) __G.netm.debug = true;
    const snap = (ts) => {
      const m = __inkwave.match;
      if (m && !m.attract) {
        const row = [performance.timeOrigin + ts];   // the frame's vsync time (what the display shows)
        for (const a of m.actors) {
          const r = a.character.root.position;
          row.push([a.nid, r.x, r.y, r.z, a.character.root.rotation.y, a.alive && a.character.root.visible ? 1 : 0, a.remote ? 1 : 0, (a.remote ? a.net?.tp : a.netTp) || 0, a.superJumpState ? 1 : 0,
            (a.form === 'squid' ? 1 : 0) | (a.grounded ? 2 : 0) | (a.climbing ? 4 : 0) | (a.submerged ? 8 : 0), a.remote ? a.net?.dbg : null]);
        }
        rec.f.push(row);
        const b = m.boss;
        if (b) (rec.b || (rec.b = [])).push([performance.timeOrigin + ts, b.bt, b.pos.x, b.pos.y, b.pos.z, b.yaw, b.hp, b.visible ? 1 : 0, b.move ? b.move.t0 : -1, b.sim ? 1 : 0, b.dead ? 1 : 0]);
      }
      requestAnimationFrame(snap);
    };
    requestAnimationFrame(snap);
  })));
  const tagRes = (i) => pages[i] ? ev(i, () => JSON.stringify({ state: __inkwave.match?.state, t: +(__inkwave.match?.time ?? 0).toFixed(1), fps: __inkwave.fps, host: __G.net.isHost, actors: __G.actors.length, teams: [0, 1].map((t) => __G.actors.filter((a) => a.team === t).length), bots: __G.actors.filter((a) => a.isBot).length })) : Promise.resolve('(gone)');
  let leftRec = null, leftAt = 0, leftIdx = -1;
  for (let s = 0; s < SECS; s += 6) {
    await new Promise((r) => setTimeout(r, Math.min(6, SECS - s) * 1000));
    say(`t+${Math.min(SECS, s + 6)}s`, (await Promise.all(pages.map((_, i) => tagRes(i)))).join('  '));
    if (LEAVE && !leftRec && s + 6 >= SECS / 2) {
      leftIdx = LEAVE === 'host' ? 0 : N - 1;
      leftRec = await ev(leftIdx, () => { const r = window.__rec; window.__rec = null; return r; });
      leftAt = Date.now();
      if (DROP === 'freeze') {
        const cdp = await pages[leftIdx].target().createCDPSession();
        await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
      } else await browsers[leftIdx].process()?.kill('SIGKILL');   // abrupt: the relay sees the socket drop
      pages[leftIdx] = null;
      say(`c${leftIdx} dropped out (${LEAVE}, ${DROP})`);
      if (DROP === 'freeze') {
        const t0 = Date.now(), who = live0 => live0;
        const rest = pages.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
        try {
          await Promise.all(rest.map((i) => until(i, `__G.net.lobby.players.length === ${N - 1}`, 30000)));
          say(`relay dropped the silent client after ${((Date.now() - t0) / 1000).toFixed(1)} s; host now ${(await Promise.all(rest.map((i) => ev(i, () => __G.net.isHost)))).join(',')}`);
        } catch { say('!! the silent client was never dropped'); }
      }
    }
  }
  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); for (let i = 0; i < N; i++) if (pages[i]) await pages[i].screenshot({ path: `${SHOTS}/c${i}.png` }); say('shots', SHOTS); }

  // ---- does everyone see the same match?
  const live = pages.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  const views = await Promise.all(live.map((i) => ev(i, () => {
    const m = __inkwave.match, P = __G.paint;
    const cov = P.coverage ? P.coverage() : (P.getCoverage ? P.getCoverage() : null);
    return {
      t: m.time, cov, state: m.state,
      actors: m.actors.map((a) => ({ nid: a.nid, owner: a.owner, remote: !!a.remote, alive: a.alive, hp: Math.round(a.hp), team: a.team, weapon: a.weaponId, x: a.pos.x, z: a.pos.z, splats: a.stats.splats, deaths: a.stats.deaths })),
      net: { in: __G.net.tr?.bytesIn, out: __G.net.tr?.bytesOut, rtt: __G.net.tr?.rtt },
    };
  })));
  const recs = await Promise.all(pages.map((p, i) => p ? ev(i, () => { const r = window.__rec; window.__rec = null; return r; }) : leftRec));

  say('--- consistency');
  for (let i = 0; i < views.length; i++) say(`c${live[i]} clock ${views[i].t.toFixed(1)}  coverage ${JSON.stringify(views[i].cov && [+(views[i].cov[0] * 100).toFixed(2), +(views[i].cov[1] * 100).toFixed(2)])}  sent ${(views[i].net.out / 1024).toFixed(0)} KB  got ${(views[i].net.in / 1024).toFixed(0)} KB  rtt ${views[i].net.rtt?.toFixed(0)} ms`);
  const dt = Math.max(...views.map((v) => v.t)) - Math.min(...views.map((v) => v.t));
  say(`clock spread ${dt.toFixed(2)} s`);
  const byNid = (v) => Object.fromEntries(v.actors.map((a) => [a.nid, a]));
  const ref = byNid(views[0]);
  for (let i = 1; i < views.length; i++) {
    const o = byNid(views[i]);
    const diffs = [];
    for (const k in ref) {
      const a = ref[k], b = o[k];
      if (!b) { diffs.push(`${k} missing`); continue; }
      if (a.team !== b.team || a.weapon !== b.weapon) diffs.push(`${k} team/weapon`);
      if (a.splats !== b.splats || a.deaths !== b.deaths) diffs.push(`${k} K/D ${a.splats}/${a.deaths} vs ${b.splats}/${b.deaths}`);
    }
    say(`c${live[0]} vs c${live[i]}:`, diffs.length ? diffs.join(', ') : 'rosters + K/D agree');
  }

  if (MODE === 'boss') {
    say('--- boss');
    const bpct = (arr, p) => { if (!arr.length) return 0; const q = [...arr].sort((x, y) => x - y); return q[Math.min(q.length - 1, Math.floor(p * q.length))]; };
    const bdist = (arr, unit = 100, u = 'cm') => `p50 ${(bpct(arr, 0.5) * unit).toFixed(1)} · p90 ${(bpct(arr, 0.9) * unit).toFixed(1)} · p99 ${(bpct(arr, 0.99) * unit).toFixed(1)} · max ${(Math.max(0, ...arr) * unit).toFixed(1)} ${u}`;
    const bv = await Promise.all(live.map((i) => ev(i, () => {
      const b = __inkwave.match.boss;
      return b && { bt: b.bt, hp: b.hp, max: b.maxHp, phase: b.phase, sim: b.sim, dead: b.dead, x: b.pos.x, z: b.pos.z, moves: b.log.moves.map((m) => m[0] + ':' + m[1]), sent: b.log.sent, sentDmg: Math.round(b.log.sentDmg), recv: b.log.recv, recvDmg: Math.round(b.log.recvDmg),
        dmgBy: __inkwave.match.actors.map((a) => [a.nid, a.remote ? 'R' : 'L', a.isBot ? 'bot' : 'human', Math.round(a.stats.bossDmg || 0)]), taken: window.__bossDmg && Math.round(__bossDmg.taken), takenN: window.__bossDmg && __bossDmg.n };
    })));
    bv.forEach((b, k) => say(`c${live[k]} ${b.sim ? 'SIM ' : 'view'} bt ${b.bt.toFixed(2)} hp ${b.hp.toFixed(0)}/${b.max} phase ${b.phase}${b.dead ? ' DEAD' : ''} at (${b.x.toFixed(1)}, ${b.z.toFixed(1)}) moves ${b.moves.length} · hits sent ${b.sent} (${b.sentDmg}) recv ${b.recv} (${b.recvDmg}) · boss damage on own squidkids ${b.taken} in ${b.takenN} hits`));
    const sim = bv.find((b) => b.sim) || bv[0];
    say(`   sim's moves (t0:id): ${sim.moves.join(' ')}`);
    for (const [k, b] of bv.entries()) {
      if (b === sim) continue;
      const setS = new Set(sim.moves), setB = new Set(b.moves);
      const missing = sim.moves.filter((m) => !setB.has(m) && +m.split(':')[0] < b.bt - 0.5), extra = b.moves.filter((m) => !setS.has(m));
      say(`c${live[k]} vs sim: clock behind ${(sim.bt - b.bt).toFixed(2)} s · hp diff ${(b.hp - sim.hp).toFixed(0)} · moves missing ${missing.length} extra ${extra.length}${missing.length || extra.length ? ' ' + JSON.stringify([missing.slice(0, 4), extra.slice(0, 4)]) : ''}`);
    }
    const hostView = bv.find((b) => b.sim);
    if (hostView) for (const [nid, rl, kind, dmg] of hostView.dmgBy) if (kind === 'human' && rl === 'R') say(`host credits guest squidkid ${nid} with ${dmg} boss damage`);
    // path: every non-sim client's rendered boss vs the sim's own frames at the same boss time (bt) — the boss clock is
    // what moves and hazards are keyed to, so "the same boss" means the same pose at the same bt; the lag is how far
    // behind (wall clock) the guest shows that moment
    const simIdx = bv.indexOf(sim);
    const tru = (recs[live[simIdx]]?.b || []).filter((r) => r[7]);
    const atBt = (bt) => {
      let lo = 0, hi = tru.length - 1;
      if (hi < 1 || bt <= tru[0][1] || bt >= tru[hi][1]) return null;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tru[m][1] <= bt) lo = m; else hi = m; }
      const a = tru[lo], c = tru[hi], k = (bt - a[1]) / Math.max(1e-6, c[1] - a[1]);
      return [a[0] + (c[0] - a[0]) * k, a[2] + (c[2] - a[2]) * k, a[4] + (c[4] - a[4]) * k, a[6] + (c[6] - a[6]) * k];
    };
    live.forEach((ci, k) => {
      if (k === simIdx) return;
      const tr = (recs[ci]?.b || []).filter((r) => r[7] && !r[9]);
      if (tr.length < 30) return;
      const lags = [], errs = [], kinks = [], hpd = [];
      for (const f of tr) { const q = atBt(f[1]); if (!q) continue; lags.push(f[0] - q[0]); errs.push(Math.hypot(f[2] - q[1], f[4] - q[2])); hpd.push(Math.abs(f[6] - q[3])); }
      let worst = null;
      for (let j = 2; j < tr.length; j++) {
        const a = tr[j - 2], b = tr[j - 1], c = tr[j], t1 = b[0] - a[0], t2 = c[0] - b[0];
        if (t1 < 6 || t2 < 6 || t1 > 45 || t2 > 45) continue;
        const s2 = t2 / t1, kv = Math.hypot((c[2] - b[2]) - (b[2] - a[2]) * s2, (c[4] - b[4]) - (b[4] - a[4]) * s2);
        kinks.push(kv);
        if (!worst || kv > worst.k) worst = { k: kv, bt: b[1], dt: leftAt ? ((b[0] - leftAt) / 1000).toFixed(1) + ' s from the drop' : '' };
      }
      if (worst && worst.k > 0.2) say(`   worst boss frame: ${(worst.k * 100).toFixed(0)} cm at bt ${worst.bt.toFixed(2)} ${worst.dt}`);
      say(`c${ci} boss at the same boss time as the sim: shown ${bpct(lags, 0.5).toFixed(0)} ms later (p90 ${bpct(lags, 0.9).toFixed(0)}) · pose error ${bdist(errs)} · hp error p50 ${bpct(hpd, 0.5).toFixed(0)} p99 ${bpct(hpd, 0.99).toFixed(0)} · frame kink ${bdist(kinks)}`);
    });
  }

  // ---- smoothness: remote renders vs the owner's own frames
  say('--- remote motion (per client, all squidkids it does not own)');
  const own = {};   // nid → owner's frames [t, x, y, z, yaw, alive, tp, sj]
  recs.forEach((r) => {
    for (const row of r.f) for (let j = 1; j < row.length; j++) {
      const [nid, x, y, z, yaw, alive, remote, tp, sj, fl] = row[j];
      if (remote) continue;
      (own[nid] || (own[nid] = [])).push([row[0], x, y, z, yaw, alive, tp, sj, fl]);
    }
  });
  for (const k in own) own[k].sort((a, b) => a[0] - b[0]);
  const sample = (tr, t) => {   // owner's position at wall time t (linear between its frames)
    let lo = 0, hi = tr.length - 1;
    if (t <= tr[0][0] || t >= tr[hi][0]) return null;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tr[m][0] <= t) lo = m; else hi = m; }
    const a = tr[lo], b = tr[hi];
    if (b[6] !== a[6] || !a[5] || !b[5] || a[7] || b[7]) return null;   // respawn / dead / super jump: skip
    const k = (t - a[0]) / (b[0] - a[0]);
    return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
  };
  const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  // frame-to-frame "kink": how far this frame's step breaks from the previous step (scaled to the frame times)
  const kinks = (tr, outP, outY, worst, nid) => {
    for (let k = 2; k < tr.length; k++) {
      const a = tr[k - 2], b = tr[k - 1], c = tr[k];
      if (!a[5] || !b[5] || !c[5] || a[6] !== c[6] || a[7] || b[7] || c[7]) continue;
      const t1 = b[0] - a[0], t2 = c[0] - b[0];
      if (t1 < 6 || t2 < 6 || t1 > 45 || t2 > 45) continue;   // steady frames only: a renderer hitch is not the netcode
      const s = t2 / t1;
      const kv = Math.hypot((c[1] - b[1]) - (b[1] - a[1]) * s, (c[3] - b[3]) - (b[3] - a[3]) * s, ((c[2] - b[2]) - (b[2] - a[2]) * s) * 0.5);
      outP.push(kv);
      if (worst && kv > 0.12) worst.push({ nid, t: b[0], k: kv, dy: (c[2] - b[2]) - (b[2] - a[2]) * s, fl: [a[8], b[8], c[8]], v: Math.hypot(c[1] - b[1], c[3] - b[3]) / (t2 / 1000), dbg: [a[9], b[9], c[9]], fdt: [Math.round(t1), Math.round(t2)] });
      const w = (x) => Math.atan2(Math.sin(x), Math.cos(x));
      outY.push(Math.abs(w(c[4] - b[4]) - w(b[4] - a[4]) * s));
    }
  };
  const dist = (arr, unit = 100, u = 'cm') => `p50 ${(pct(arr, 0.5) * unit).toFixed(1)} · p90 ${(pct(arr, 0.9) * unit).toFixed(1)} · p99 ${(pct(arr, 0.99) * unit).toFixed(1)} · max ${(Math.max(0, ...arr) * unit).toFixed(1)} ${u}`;
  const ownP = [], ownY = [];
  for (const nid in own) kinks(own[nid], ownP, ownY);
  say(`owners' own frames   kink ${dist(ownP)}   turn-kink ${dist(ownY, 57.3, '°')}`);
  recs.forEach((r, ci) => {
    const tracks = {};
    for (const row of r.f) for (let j = 1; j < row.length; j++) {
      const [nid, x, y, z, yaw, alive, remote, tp, sj, fl, dbg] = row[j];
      if (!remote) continue;
      (tracks[nid] || (tracks[nid] = [])).push([row[0], x, y, z, yaw, alive, tp, sj, fl, dbg]);
    }
    const frameDt = []; for (let k = 1; k < r.f.length; k++) frameDt.push(r.f[k][0] - r.f[k - 1][0]);
    const P = [], Y = [], lags = [], errs = [], worst = [];
    let tele = 0;
    for (const nid in tracks) {
      const tr = tracks[nid];
      kinks(tr, P, Y, worst, nid);
      for (let k = 1; k < tr.length; k++) if (tr[k][5] && tr[k - 1][5] && tr[k][6] === tr[k - 1][6] && !tr[k][7] && Math.hypot(tr[k][1] - tr[k - 1][1], tr[k][3] - tr[k - 1][3]) > 1.2) tele++;
      // delay vs the owner, fitted per 2 s window (the adaptive delay moves), then the path error at that delay
      const tru = own[nid];
      if (!tru || tru.length < 30) continue;
      const t0 = tr[0][0];
      for (let w0 = t0; w0 < tr[tr.length - 1][0]; w0 += 2000) {
        const seg = tr.filter((f) => f[0] >= w0 && f[0] < w0 + 2000 && f[5] && !f[7]);
        if (seg.length < 30) continue;
        let best = null;
        for (let lag = 40; lag <= 400; lag += 5) {
          let e2 = 0, n = 0;
          for (const f of seg) { const p = sample(tru, f[0] - lag); if (!p) continue; e2 += (f[1] - p[0]) ** 2 + (f[3] - p[2]) ** 2 + (f[2] - p[1]) ** 2; n++; }
          if (n > 20 && (!best || e2 / n < best.e)) best = { lag, e: e2 / n };
        }
        if (!best) continue;
        lags.push(best.lag);
        for (const f of seg) { const p = sample(tru, f[0] - best.lag); if (p) errs.push(Math.hypot(f[1] - p[0], f[3] - p[2], f[2] - p[1])); }
      }
    }
    const fps = 1000 / (frameDt.reduce((s, v) => s + v, 0) / Math.max(1, frameDt.length));
    if (leftAt && ci !== leftIdx) {
      let mk = 0, tel = 0, hid = 0;
      for (const nid in tracks) {
        const tr = tracks[nid];
        for (let k = 2; k < tr.length; k++) {
          const a = tr[k - 2], b = tr[k - 1], c = tr[k];
          if (Math.abs(b[0] - leftAt) > 3000) continue;
          if (a[5] && !c[5] && b[5]) hid++;
          if (!a[5] || !b[5] || !c[5] || a[6] !== c[6]) continue;
          const t1 = b[0] - a[0], t2 = c[0] - b[0]; if (t1 < 6 || t2 < 6 || t1 > 45 || t2 > 45) continue;
          const s = t2 / t1;
          mk = Math.max(mk, Math.hypot((c[1] - b[1]) - (b[1] - a[1]) * s, (c[3] - b[3]) - (b[3] - a[3]) * s, ((c[2] - b[2]) - (b[2] - a[2]) * s) * 0.5));
          if (Math.hypot(c[1] - b[1], c[3] - b[3]) > 1.2) tel++;
        }
      }
      say(`   c${ci} around the drop-out (±3 s): max kink ${(mk * 100).toFixed(1)} cm · teleports ${tel} · vanished ${hid}`);
    }
    say(`c${ci} ${fps.toFixed(0)} fps · ${Object.keys(tracks).length} remote squidkids · ${P.length} frames · teleports ${tele}`);
    say(`   kink ${dist(P)}   turn-kink ${dist(Y, 57.3, '°')}`);
    say(`   delay ${pct(lags, 0.5)} ms (${Math.min(...lags)}–${Math.max(...lags)})   path error ${dist(errs)}`);
    if (process.env.WORST) {
      // for each bad remote frame: did the owner's own path kink around the same moment (≈ t − delay)?
      const lag = pct(lags, 0.5);
      worst.sort((a, b) => b.k - a.k);
      for (const w of worst.slice(0, +process.env.WORST || 8)) {
        const tru = own[w.nid] || [];
        let ok = 0;
        for (let k = 2; k < tru.length; k++) {
          const a = tru[k - 2], b = tru[k - 1], c = tru[k];
          if (Math.abs(b[0] - (w.t - lag)) > 90) continue;
          const t1 = b[0] - a[0], t2 = c[0] - b[0]; if (t1 <= 0 || t2 <= 0) continue; const s = t2 / t1;
          ok = Math.max(ok, Math.hypot((c[1] - b[1]) - (b[1] - a[1]) * s, (c[3] - b[3]) - (b[3] - a[3]) * s, ((c[2] - b[2]) - (b[2] - a[2]) * s) * 0.5));
        }
        say(`     nid ${w.nid} kink ${(w.k * 100).toFixed(1)} cm (dy ${(w.dy * 100).toFixed(1)}) speed ${w.v.toFixed(1)} m/s flags ${w.fl.join('/')} · owner's max nearby ${(ok * 100).toFixed(1)} cm · frames ${w.fdt.join('/')} ms`);
        say(`        [mode, past-last, buf, err, x, rate, delay] ${w.dbg.map((d) => JSON.stringify(d)).join('  ')}`);
      }
    }
  });

  // ---- full flow: results, then everyone back in the lobby
  if (FULL) {
    say('--- waiting for the end of the match');
    await Promise.all(live.map((i) => until(i, '__inkwave.match && __inkwave.match.state === "results"', 120000)));
    const res = await Promise.all(live.map((i) => ev(i, () => JSON.stringify(__inkwave.match.result && { w: __inkwave.match.result.winner, c: __inkwave.match.result.coverage.map((v) => +(v * 100).toFixed(1)), boss: __inkwave.match.result.boss && { win: __inkwave.match.result.boss.win, time: __inkwave.match.result.boss.time, hp: __inkwave.match.result.boss.hp }, dmg: __inkwave.match.actors.map((a) => Math.round(a.stats.bossDmg || 0)).join('/') }))));
    say('results', res.join('  '), new Set(res).size === 1 ? '(agree)' : '!! DIFFER');
    await Promise.all(live.map((i) => until(i, '__G.net.state === "lobby" && __G.mode === "menu"', 40000)));
    say('everyone back in the lobby:', (await Promise.all(live.map((i) => ev(i, () => __G.net.lobby.players.length)))).join(','));
  }
  if (LEAVE) for (let i = 0; i < N; i++) if (pages[i]) say(`c${i} session diary:\n   ` + (await ev(i, () => window.__netlog.join('\n   '))));
} catch (e) {
  say('FAIL', e.message);
  for (let i = 0; i < N; i++) if (pages[i]) try { say(`c${i} session diary:\n   ` + (await ev(i, () => window.__netlog.join('\n   ')))); } catch { /* gone */ }
  process.exitCode = 1;
} finally {
  const bad = logs.filter((l) => !/404|preload|Failed to fetch|AudioContext/.test(l));
  if (bad.length) { say('--- console'); console.log(bad.slice(0, 40).join('\n')); }
  if (bad.some((l) => /error|pageerror/i.test(l))) process.exitCode = 1;
  for (const b of browsers) {
    await Promise.race([b.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
    try { b.process()?.kill('SIGKILL'); } catch { /* gone */ }
  }
  process.exit(process.exitCode || 0);   // puppeteer can leave a pipe open after a forced close
}
