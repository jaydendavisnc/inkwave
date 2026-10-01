// Botlab match: an all-bot (autopilot) match stepped at a fixed 60 Hz in sim time (not wall time, so machine load
// doesn't change the result), as fast as the machine allows. See tools/botlab/README.md.
//   MAP=halyard MODE=turf SECS=180 tools/botlab/run.sh tools/botlab/match.cjs
//   MODE=zones plays a full 5:00 (+ overtime) Zone Control match; MODE=turf plays SECS seconds of Turf War.
//   WEAPONS / SUBS equip the 8 players (slot order = team 0 first): 'all=bow' · 'team0=blade;team1=shooter' ·
//   'blade,blade,shooter,…' (per slot, blank = keep) · unset = the usual random loadouts.
//   TRACK=<weapon> (+ TRACK_TEAM=0|1): a closer look at the players on that weapon (see trk below).
//   TUNE='mitts.punchInterval=0.12,mitts.punchDamage=45': what-if tuning for this run only (WEAPONS / SUBS values).
//   SPECIAL_AI=0 turns the bots' awareness of enemy specials off (src/game/botSpecials.js; an A/B on the same code),
//   team0 / team1: on for that team only (head to head); unset: as shipped.
//   SPCHARGE=3: the special gauge fills 3× as fast (PLAYER.specialChargeRate; this run only) — more specials per match.
//   DIAG=1: every stuck episode also records the bot's nav plan, snapshotted at its start and every 5 s after: mode,
//   route length, pi, the next two route nodes, the edge into the next one (nav.edge: 'none' when there's no such
//   edge — e.g. after the stuck recovery skipped a waypoint), the goal node, noProg, the nearest nav node, and the wall
//   climb it's at (if any). RESULT_JSON.diagEps lists every episode of 2 s or more with them (longest first).
// Reports: stuck %, splats (by cause), per-weapon splats / deaths / turf, specials, super jumps, console errors, sim
// cost, and in Zone Control the objective stats. Last line: RESULT_JSON {…} (also written to OUT if set).
const { app } = require('electron');
require(process.env.S + '/offscreen-boot.cjs');
const { TEST_MAPS, defineTestMap } = require(process.env.S + '/testmaps.cjs');
const MAP = process.env.MAP || 'halyard', MODE = process.env.MODE || 'zones', SECS = +(process.env.SECS || 180);
const OUT = process.env.OUT || '';
const WEAPONS = process.env.WEAPONS || '', SUBS = process.env.SUBS || '', TRACK = process.env.TRACK || '', TRACK_TEAM = process.env.TRACK_TEAM ?? '', TUNE = process.env.TUNE || '';
const SPECIAL_AI = process.env.SPECIAL_AI || '', SPCHARGE = +(process.env.SPCHARGE || 1), DIAG = process.env.DIAG === '1';
setTimeout(() => { console.log('WATCHDOG'); app.exit(1); setTimeout(() => process.exit(1), 3000); }, +(process.env.WATCHDOG || 900000));   // (hard exit if a hung page blocks quitting)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let claimed = false;
app.on('browser-window-created', (_, win) => {
  if (claimed) return; claimed = true;
  win.webContents.setBackgroundThrottling(false);
  const logs = [];
  win.webContents.on('console-message', (e) => { const m = String(e.message); if (/error|warn/i.test(String(e.level)) && !/Security Warning|Autofill/.test(m)) logs.push(`[${e.level}] ${m.slice(0, 300)}`); });
  let started = false;
  win.webContents.on('did-finish-load', async () => {
    if (started) return; started = true;
    await win.loadURL('app://inkwave/index.html?autopilot');
    const js = (c) => win.webContents.executeJavaScript(c, true);
    for (let i = 0; i < 120; i++) { if (await js('!!window.__inkwave?.api')) break; await wait(250); }
    await js('window.__inkwave._onPointerUnlock = () => {}; 0');
    if (TEST_MAPS.includes(MAP)) await js(defineTestMap(MAP));   // (MAP=testbox / podbox: test-only arenas, testmaps.cjs)
    await js(`window.__inkwave.api.startMatch({ mapId: '${MAP}', mode: '${MODE}', duration: ${MODE === 'zones' ? 300 : SECS} })`);
    { const got = await js(`(window.__inkwave.mapDef && window.__inkwave.mapDef.id) || null`); if (got !== MAP) { console.log(`MAP MISMATCH: asked for ${MAP}, the game built ${got} (a stage missing from MAPS falls back to the first one)`); app.exit(3); return; } }   // (never test the wrong stage silently)
    for (let i = 0; i < 240; i++) { if (await js(`window.__inkwave.match?.state === 'playing'`)) break; await wait(250); }
    // what-if tuning (TUNE, see the header): patched into the live config before the loadouts
    const tuned = TUNE ? await js(`(async () => { const C = await import('./src/config.js'); const out = [];
      for (const kv of ${JSON.stringify(TUNE)}.split(',')) { const [path, v] = kv.split('='); const [id, key] = path.split('.'); const o = C.WEAPONS[id] || C.SUBS[id];
        if (!o || !(key in o)) { out.push('?' + path); continue; } o[key] = isNaN(+v) ? v : +v; out.push(path + '=' + o[key]); }
      return out.join(','); })()`) : '';
    // loadouts: WEAPONS / SUBS (see the header)
    const equip = await js(`(() => {
      const m = window.__inkwave.match, A = m.actors;
      const plan = (spec) => { if (!spec) return A.map(() => null); if (spec.startsWith('all=')) return A.map(() => spec.slice(4));
        if (spec.includes('team')) { const t = {}; for (const p of spec.split(';')) { const [k, v] = p.split('='); t[+k.replace('team', '')] = v; } return A.map((a) => t[a.team] || null); }
        const l = spec.split(','); return A.map((a, i) => l[i] || null); };
      const W = plan(${JSON.stringify(WEAPONS)}), S = plan(${JSON.stringify(SUBS)});
      A.forEach((a, i) => { if (W[i]) a.setWeapon(W[i]); if (S[i]) a.setSub(S[i]); });
      return A.map((a) => 'AB'[a.team] + ':' + a.weaponId + '+' + (a.subId || '-')).join(' ');
    })()`);
    // enemy-specials awareness switch (SPECIAL_AI, see the header; a checkout without it just reports 'n/a')
    const spAI = await js(`(async () => { try { const M = await import('./src/game/botSpecials.js'), S = M.SPECIAL_AI, v = ${JSON.stringify(SPECIAL_AI)};
      if (v === '0') S.enabled = false; else if (v === 'team0') S.teams = [true, false]; else if (v === 'team1') S.teams = [false, true];
      M.resetSpecialStats(); return S.enabled ? (S.teams ? 'team' + S.teams.indexOf(true) : 'on') : 'off'; } catch (e) { return 'n/a'; } })()`);
    if (SPCHARGE !== 1) await js(`(async () => { const C = await import('./src/config.js'); C.PLAYER.specialChargeRate *= ${SPCHARGE}; return 0; })()`);
    const t0 = Date.now();
    const r = await js(`(async () => {
      const g = window.__inkwave, m = g.match, Z = m.zones, N = __G.nav;
      const { on } = await import('./src/core/ctx.js');
      g.debug.freeze();
      const ev = { control: [], penalty: [], active: [], overtime: null, end: null, specials: 0, jumps: 0 };
      const offs = [
        on('zones:control', (e) => ev.control.push({ t: +(m.duration - m.time + (Z ? Z.overtimeT : 0)).toFixed(1), owner: e.owner, prev: e.prev, obj: e.objective, last: Z.lastOwner })),
        on('zones:penalty', (e) => ev.penalty.push({ team: e.team, p: e.penalty, start: +e.start.toFixed(1), end: +e.end.toFixed(1) })),
        on('zones:active', (e) => ev.active.push(e.objective)),
        on('zones:overtime', (e) => { ev.overtime = e.losing; }),
        on('zones:end', (e) => { ev.end = { winner: e.winner, reason: e.reason }; }),
        on('special:use', (e) => { ev.specials++; const U = ev.uses || (ev.uses = [{}, {}]), id = /^barrage/.test(String(e.id)) ? 'barrage' : String(e.id); if (e.actor) U[e.actor.team][id] = (U[e.actor.team][id] || 0) + 1; }),
        on('superjump', (e) => { if (e.phase === 'charge') ev.jumps++; }),
        on('special:end', (e) => { if (/^barrage/.test(String(e.id))) (ev.barEnd || (ev.barEnd = new Map())).set(e.actor, simT); }),
        on('splatted', (e) => {
          // splats by special, per victim team (Bomb Barrage: its thrower's bombs during it or within 3.5 s after), K / D per team
          const SP = ['slam', 'storm', 'bubbler', 'sonar', 'strike', 'zooka', 'wail', 'kraken', 'blower', 'jetpack', 'stamp', 'booyah', 'zipcaster', 'crab'];
          const c = String(e.cause || ''), at = e.attacker, v = e.victim;
          const bar = /^(bomb|sticky|burst|seeker|mist)$/.test(c) && at && (at.specialActive?.kind === 'barrage' || simT - ((ev.barEnd && ev.barEnd.get(at)) ?? -99) < 3.5);
          const sp = SP.includes(c) ? c : bar ? 'barrage' : null;
          if (v) { const T = ev.team || (ev.team = [{ k: 0, d: 0, sp: 0, by: {} }, { k: 0, d: 0, sp: 0, by: {} }]); T[v.team].d++; if (at && at !== v && at.team !== v.team) T[at.team].k++;
            if (sp) { T[v.team].sp++; T[v.team].by[sp] = (T[v.team].by[sp] || 0) + 1; } }
        }),
        on('splatted', (e) => { const W = ev.byW || (ev.byW = {}), C = ev.byCause || (ev.byCause = {});
          const aw = e.attacker && e.attacker.weaponId, vw = e.victim && e.victim.weaponId;
          if (aw && e.attacker !== e.victim) (W[aw] || (W[aw] = { splats: 0, deaths: 0 })).splats++;
          if (vw) (W[vw] || (W[vw] = { splats: 0, deaths: 0 })).deaths++;
          const c = String(e.cause || '?'); C[c] = (C[c] || 0) + 1; }),
      ];
      // zone outlines for the "inside the active zone" metric
      const inPoly = (poly, x, z) => { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; };
      const inZone = (zn, p) => { const d = zn.def, parts = d.polys || [d.poly]; return p.y > (d.y0 ?? -2) - 0.6 && p.y < (d.y1 ?? 6) + 1.6 && parts.some((q) => inPoly(q, p.x, p.z)); };
      const hist = new Map(); let samples = 0, stuckS = 0, simT = 0, anyIn = 0, insideN = [0, 0], nearN = [0, 0], held = [0, 0], neutral = 0, zs = 0;
      const eps = []; let holdS = 0; const roleS = {}; const frameErr = { n: 0, msg: '' }; const where = {}; let whereN = 0; const whereT = [{}, {}]; const farMode = {}; let ready = 0;
      offs.push(on('special:ready', () => ready++));
      const open = new Map();
      // DIAG=1: the bot's nav plan now (see the header)
      const r2 = (v) => Math.round(v * 100) / 100, ndP = (id) => { const n = id >= 0 && N.nodes[id]; return n ? [n.x, r2(n.y), n.z] : null; };
      const plan = ${DIAG} ? (a) => {
        const b = a.bot, p = b.path, pi = b.pi | 0, e = p && pi > 0 && pi < p.length ? N.edge(p[pi - 1], p[pi]) : null;
        const cl = b._clE ? { wall: b._clE.wallP.map(r2), topY: r2(b._clE.topY), t: r2(b.climbT || 0), noHeadway: r2(b.t - (b._clT ?? b.t)) } : null;
        return { t: +simT.toFixed(1), mode: b.mode, pos: [r2(a.pos.x), r2(a.pos.y), r2(a.pos.z)], len: p ? p.length : 0, pi, next: p ? [ndP(p[pi]), ndP(p[pi + 1])] : null,
          edgeIn: !p || pi <= 0 || pi >= p.length ? '-' : e ? e.type : 'none', goal: ndP(b.goal), noProg: r2(b.noProg || 0), near: ndP(N.nearest(a.pos, 1.2, true)),
          noClimb: b.t < (b.noClimbUntil || 0), climbing: !!a.climbing, climb: cl, ink: Math.round(a.ink) };
      } : null;
      // TRACK=<weapon id>: a closer look at every player on that weapon (damage in / out and from how far, what they were
      // doing when splatted, how far the nearest enemy was; the mitts add fist / splash / landing damage and leaps)
      const trk = ${JSON.stringify(TRACK)} ? (() => {
        const TR = ${JSON.stringify(TRACK)}, T = { dmgOut: {}, dmgIn: 0, armour: 0, fired: 0, kills: 0, deaths: 0, alive: 0,
          distOut: [], distIn: [], killDist: [], deathDist: [], deathState: {}, deathBy: {}, deathClean: 0, reach: [0, 0, 0, 0], fight: 0,
          leaps: 0, leapKind: {}, leapHits: 0, leapKills: 0, clings: 0 };
        const TT = ${JSON.stringify(TRACK_TEAM)}, is = (a) => a && a.weaponId === TR && (TT === '' || a.team === +TT);
        const last = new Map();                       // "attacker>victim" → sim time of the last damage
        const PJ = __G.projectiles, orig = PJ.applyHit;
        let how = null;
        PJ.applyHit = function (att, vic, dmg, src, ...rest) {
          if (src === 'mitts' && is(att)) { const s = new Error().stack || ''; how = /landSplash|startCling/.test(s) ? 'leap' : /burstFist/.test(s) ? 'splash' : /updateFists/.test(s) ? 'fist' : 'mitts'; }
          try { return orig.call(this, att, vic, dmg, src, ...rest); } finally { how = null; }
        };
        (async () => { try {
          const { MAIN_KITS } = await import('./src/game/kits/registry.js'), K = MAIN_KITS[TR];
          if (K && K.damageTaken) { const o = K.damageTaken; K.damageTaken = (r, amount, ...x) => { const v = o(r, amount, ...x); if (r && r.a && m.actors.includes(r.a)) T.armour += amount - v; return v; }; }
        } catch (e) { /* no kit hook */ } })();
        const d2 = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z), ix = (a) => m.actors.indexOf(a);
        const leapBy = new Map();                       // actor → the leap in flight (for hits on landing)
        offs.push(
          on('damage', (e) => {
            const A = e.attacker, V = e.victim;
            if (is(A) && V !== A && A.team !== V.team) {
              const k = how || String(e.source || '?');
              T.dmgOut[k] = (T.dmgOut[k] || 0) + e.amount;
              T.distOut.push(d2(A, V));
              last.set(ix(A) + '>' + ix(V), simT);
              if (how === 'leap') { const L = leapBy.get(A); if (L && !L.hit) { L.hit = true; T.leapHits++; } }
            }
            if (is(V) && A && A !== V && A.team !== V.team) { T.dmgIn += e.amount; T.distIn.push(d2(A, V)); }
          }),
          on('weapon:fire', (e) => { if (is(e.actor)) T.fired++; }),
          on('mitts:leap', (e) => { if (!is(e.actor)) return; T.leaps++; T.leapKind[e.kind] = (T.leapKind[e.kind] || 0) + 1; leapBy.set(e.actor, { t: simT, hit: false }); }),
          on('mitts:cling', (e) => { if (is(e.actor) && e.on) T.clings++; }),
          on('splatted', (e) => {
            const A = e.attacker, V = e.victim;
            if (is(A) && V !== A) { T.kills++; T.killDist.push(d2(A, V)); if (e.cause === 'mitts') { const L = leapBy.get(A); if (L && simT - L.t < 3 && A.weaponRunner?.kit?.landT < 0.2) T.leapKills++; } }
            if (!is(V)) return;
            T.deaths++;
            const k = V.weaponRunner && V.weaponRunner.kit && V.weaponRunner.kit.mitts ? V.weaponRunner.kit : null;
            const st = k ? (k.charging ? 'charging' : k.leaping ? 'leaping' : k.cling ? 'clinging' : k.landT < 1 ? 'just landed' : V.form === 'squid' ? 'swimming' : 'on foot')
              : V.form === 'squid' ? 'swimming' : 'on foot';
            T.deathState[st] = (T.deathState[st] || 0) + 1;
            const by = A && A !== V ? (e.cause === 'water' ? 'water' : A.weaponId + (e.cause && e.cause !== A.weaponId ? ':' + e.cause : '')) : String(e.cause || '?');
            T.deathBy[by] = (T.deathBy[by] || 0) + 1;
            if (A && A !== V) { T.deathDist.push(d2(A, V)); const lt = last.get(ix(V) + '>' + ix(A)); if (!(lt != null && simT - lt < 4)) T.deathClean++; }
          }),
        );
        // per 0.25 s: how far the nearest living enemy is (reach buckets) and whether the bot is fighting
        const sample = () => {
          for (const a of m.actors) {
            if (!is(a) || !a.alive) continue;
            T.alive += 0.25;
            let best = Infinity; for (const e of m.actors) if (e.team !== a.team && e.alive) best = Math.min(best, d2(a, e));
            T.reach[best < 4.5 ? 0 : best < 8 ? 1 : best < 14 ? 2 : 3] += 0.25;
            if (a.bot && a.bot.mode === 'fight') T.fight += 0.25;
          }
        };
        const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((p, q) => p - q); return +s[s.length >> 1].toFixed(1); };
        const done = () => ({
          weapon: TR, n: m.actors.filter(is).length, team: [...new Set(m.actors.filter(is).map((a) => a.team))],
          kills: T.kills, deaths: T.deaths, fired: T.fired, aliveS: +T.alive.toFixed(0), fightS: +T.fight.toFixed(0),
          dmgOut: Object.fromEntries(Object.entries(T.dmgOut).map(([k, v]) => [k, Math.round(v)])), dmgIn: Math.round(T.dmgIn), armour: Math.round(T.armour),
          distOut: med(T.distOut), distIn: med(T.distIn), killDist: med(T.killDist), deathDist: med(T.deathDist),
          deathState: T.deathState, deathBy: T.deathBy, deathClean: T.deathClean,
          reach: T.reach.map((v) => +(100 * v / Math.max(1, T.alive)).toFixed(0)),
          leaps: T.leaps, leapKind: T.leapKind, leapHits: T.leapHits, leapKills: T.leapKills, clings: T.clings,
        });
        return { sample, done };
      })() : null;
      // sight honesty (per 0.25 s, every bot in a fight): its target in plain sight (a ray from its eyes to the foe's
      // chest or head, through grates and rails), the trigger held at a foe out of sight ("shooting at nothing"), and its
      // aim still on a foe out of sight (tracking through walls) — ground truth, whatever the bot believes
      const SG = { fight: 0, fire: 0, hid: 0, blind: 0, onHid: 0, blindHid: 0, bBel: 0, bChg: 0 };
      const V = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }), _e = V(), _t = V();
      const sightSample = () => {
        for (const a of m.actors) {
          const b = a.bot, t = b && b.target;
          if (!a.alive || !b || b.mode !== 'fight' || !t || !t.alive || !t.pos || t.team === a.team) continue;
          SG.fight += 0.25;
          _e.set(a.pos.x, a.pos.y + 1.3, a.pos.z);
          const sq = t.form === 'squid';
          const vis = __G.physics.los(_e, _t.set(t.pos.x, t.pos.y + (sq ? 0.3 : 1.0), t.pos.z)) || (!sq && __G.physics.los(_e, _t.set(t.pos.x, t.pos.y + 1.6, t.pos.z)));
          const fire = !!a.intent.fire;
          if (fire) SG.fire += 0.25;
          if (vis) continue;
          SG.hid += 0.25;
          // (why: the bot still believes it's in sight — its last look; holding a charge — not a shot; else a shot)
          if (fire) { SG.blind += 0.25; if (b.seeTimer > 0) SG.bBel += 0.25; else if (a.weaponRunner && a.weaponRunner.charging) SG.bChg += 0.25; }
          let d = Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z) - b.aimYaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
          if (Math.abs(d) < 0.2) { SG.onHid += 0.25; if (fire) SG.blindHid += 0.25; }
        }
      };
      // the bots' own cost: BotBrain.update wall time (ms per simulated second)
      const BM = await import('./src/game/bots.js'), BP = BM.BotBrain.prototype, bUpd = BP.update; let botMs = 0;
      BP.update = function (dt) { const q = performance.now(); try { return bUpd.call(this, dt); } finally { botMs += performance.now() - q; } };
      // (and the part of it spent looking: _perceive, plus botSight's between-looks target re-check where there is one)
      let seeMs = 0; const bPer = BP._perceive, SP = await import('./src/game/botSight.js').then((m) => m.Sight.prototype).catch(() => null), bRe = SP && SP.recheck;
      BP._perceive = function () { const q = performance.now(); try { return bPer.call(this); } finally { seeMs += performance.now() - q; } };
      if (bRe) SP.recheck = function (e) { const q = performance.now(); try { return bRe.call(this, e); } finally { seeMs += performance.now() - q; } };
      if (BM.SIGHT_STATS) for (const k in BM.SIGHT_STATS) BM.SIGHT_STATS[k] = 0;   // (this match only, not the menu's)
      if (BM.CLIMB_STATS) for (const k in BM.CLIMB_STATS) BM.CLIMB_STATS[k] = 0;
      const DT = 1 / 60, CH = 15;           // 0.25 s per chunk
      // per activation of an objective: the best ink share each team reached on each of its zones
      const wins = []; let curW = null;
      const noteShares = () => {
        if (!Z) return;
        if (!curW || curW.obj !== Z.active) { curW = { obj: Z.active, id: Z.active.id, t0: +simT.toFixed(0), t1: 0, max: Z.active.zones.map(() => [0, 0]) }; wins.push(curW); }
        curW.t1 = +simT.toFixed(0);
        Z.active.zones.forEach((z, i) => { curW.max[i][0] = Math.max(curW.max[i][0], z.share[0]); curW.max[i][1] = Math.max(curW.max[i][1], z.share[1]); });
      };
      const maxT = ${MODE === 'zones' ? 300 + 320 : SECS};
      let chunk = 0; const tSim0 = performance.now();
      while (m.state === 'playing' && simT < maxT) {
        const render = (chunk++ % 8) === 0;
        for (let k = 0; k < CH; k++) { g._skipRender = !(render && k === CH - 1); try { g._frame(DT); } catch (e) { frameErr.n++; if (!frameErr.msg) frameErr.msg = String(e && e.stack || e).slice(0, 400); } }
        g._skipRender = false;
        simT += CH * DT;
        if (trk && m.state === 'playing') trk.sample();
        if (m.state === 'playing') sightSample();
        // --- zone metrics
        if (Z && m.state === 'playing') {
          noteShares();
          zs++;
          if (Z.owner >= 0) held[Z.owner] += 0.25; else neutral += 0.25;
          const act = Z.active.zones;
          let any = false;
          for (const a of m.actors) {
            if (!a.alive || !a.bot) continue;
            const ins = act.some((zn) => inZone(zn, a.pos));
            if (ins) { any = true; insideN[a.team]++; }
            if (act.some((zn) => Math.hypot(a.pos.x - zn.center[0], a.pos.z - zn.center[2]) < 12)) nearN[a.team]++;
          }
          if (any) anyIn++;
          for (const a of m.actors) {
            if (!a.bot) continue;
            const k = !a.alive ? 'dead' : a.superJumpState ? 'jump' : act.some((zn) => Math.hypot(a.pos.x - zn.center[0], a.pos.z - zn.center[2]) < 14) ? 'near' : 'far';
            where[k] = (where[k] || 0) + 1; whereN++;
            const wt = whereT[a.team]; wt[k] = (wt[k] || 0) + 1;
            if (a.alive && k === 'far') { const md = a.bot.mode; farMode[md] = (farMode[md] || 0) + 1; }
          }
        }
        // --- stuck (as maptool/bots.cjs, but in sim time)
        for (const a of m.actors) {
          if (!a.bot) continue;
          const h = hist.get(a) || []; hist.set(a, h);
          h.push({ t: simT, x: a.pos.x, z: a.pos.z });
          while (h.length && simT - h[0].t > 3) h.shift();
          // a guard / watcher holding its spot on purpose; a bot fighting from a sprout pod's hedge top, or waiting out a
          // hedge that cuts its only route (pods.js sets perchUntil — not while it's trying to get off); a bot inking a
          // wall column to climb it, while the column's getting inked (bots.js _climb: not once it stalls)
          const holding = !!((a.bot.zHoldUntil > a.bot.t && (!a.bot.path || a.bot.pi >= a.bot.path.length)) || a.bot.perchUntil > a.bot.t);
          if (holding && a.alive) holdS += 0.25;
          if (a.alive && a.bot.zRole) roleS[a.bot.zRole] = (roleS[a.bot.zRole] || 0) + 0.25;
          const wants = a.alive && !a.superJumpState && !(a.weaponRunner && a.weaponRunner.charging) && !holding;
          samples++;
          const span = h.length > 1 ? Math.max(...h.map((p) => Math.hypot(p.x - a.pos.x, p.z - a.pos.z))) : 99;
          const stuck = wants && h.length >= 11 && span < 1.0;
          if (stuck) {
            stuckS += 0.25;
            if (!open.has(a)) { const b = a.bot; const ep = { t: +simT.toFixed(1), name: a.name, w: a.weaponId, mode: b.mode, role: b.zRole || '-', pos: [+a.pos.x.toFixed(1), +a.pos.y.toFixed(2), +a.pos.z.toFixed(1)], path: !!b.path, hold: b.zHoldUntil > b.t, pod: b.podS ? b.podS.task || (b.podS.exit ? 'exit' : '-') : '-', dur: 0 }; if (plan) ep.diag = [plan(a)]; open.set(a, ep); eps.push(ep); }
            const ep = open.get(a); ep.dur += 0.25;
            if (plan && ep.dur % 5 === 0) ep.diag.push(plan(a));
          } else open.delete(a);
        }
        if (chunk % 40 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      const simMs = performance.now() - tSim0;
      BP.update = bUpd; BP._perceive = bPer; if (bRe) SP.recheck = bRe;
      offs.forEach((f) => f());
      const st = Z ? Z.state() : null;
      const flips = ev.control.filter((c) => c.owner >= 0).length;
      const cov = __G.paint.coverage().map((c) => +(c * 100).toFixed(1));
      const res = {
        simT: +simT.toFixed(1), simMs: Math.round(simMs), state: m.state, stuckPct: +(100 * stuckS / Math.max(1, samples * 0.25)).toFixed(1),
        splats: m.events.length, water: m.events.filter((e) => e.cause === 'water').length, specials: ev.specials, jumps: ev.jumps, cov,
        teamKD: ev.team || [{ k: 0, d: 0, sp: 0, by: {} }, { k: 0, d: 0, sp: 0, by: {} }],
        spUses: ev.uses || [{}, {}],   // (specials used, per team, by special)
        spStats: await (async () => { try { const M = await import('./src/game/botSpecials.js'); return JSON.parse(JSON.stringify(M.SPECIAL_STATS)); } catch (e) { return null; } })(),
        byCause: ev.byCause || {},
        byWeapon: (() => { const W = ev.byW || {}, out = {}; for (const a of m.actors) { const w = a.weaponId, o = out[w] || (out[w] = { n: 0, splats: 0, deaths: 0, turf: 0 }); o.n++; o.turf += a.stats.turf; }
          for (const w in out) { const o = out[w]; o.splats = (W[w] || {}).splats || 0; o.deaths = (W[w] || {}).deaths || 0; o.turf = Math.round(o.turf / o.n); } return out; })(),
per: (() => { const A = m.actors, n = A.length || 1; const turf = A.reduce((s, a) => s + a.stats.turf, 0) / n, zt = A.reduce((s, a) => s + (a.stats.zoneTurf || 0), 0) / n, sp = A.reduce((s, a) => s + a.stats.splats, 0) / n;
          return { turf: Math.round(turf), zoneTurf: Math.round(zt), splats: +sp.toFixed(1), xpVar: Z ? Math.round(turf * 0.6 + zt + sp * 40) : Math.round(turf + sp * 40) }; })(),
        sight: { fightS: Math.round(SG.fight), fireS: Math.round(SG.fire), hidPct: +(100 * SG.hid / Math.max(1, SG.fight)).toFixed(1),
          blindPct: +(100 * SG.blind / Math.max(1, SG.fire)).toFixed(1), trackPct: +(100 * SG.onHid / Math.max(1, SG.hid)).toFixed(1),
          blindTrackPct: +(100 * SG.blindHid / Math.max(1, SG.fire)).toFixed(1), blindBelievedPct: +(100 * SG.bBel / Math.max(1, SG.fire)).toFixed(1),
          blindChargePct: +(100 * SG.bChg / Math.max(1, SG.fire)).toFixed(1), blindShotPct: +(100 * (SG.blind - SG.bBel - SG.bChg) / Math.max(1, SG.fire)).toFixed(1), stats: BM.SIGHT_STATS ? { ...BM.SIGHT_STATS } : null },
        botMsPerS: +(botMs / Math.max(1, simT)).toFixed(2), seeMsPerS: +(seeMs / Math.max(1, simT)).toFixed(2),
        frameErr, eps: eps.sort((a, b) => b.dur - a.dur).slice(0, 6), diagEps: ${DIAG} ? eps.filter((e) => e.dur >= 2) : undefined,
        climbs: BM.CLIMB_STATS ? { ...BM.CLIMB_STATS } : null, holdPct: +(100 * holdS / Math.max(1, samples * 0.25)).toFixed(1),
        roles: Object.fromEntries(Object.entries(roleS).map(([k, v]) => [k, +(100 * v / Math.max(1, samples * 0.25)).toFixed(0)])),
        // sprout pods (src/game/pods.js): hedges grown per team, bot-seconds perched on tops / in cover, exits, detours, holds
        pods: m.pods ? { ...m.pods.state().stats, perched: +(m.pods.stats.perched || 0).toFixed(1) } : null,
        track: trk ? trk.done() : undefined,
        // Boss Battle: HULLBREAKER's HP left and the squad's damage to it by weapon
        boss: m.boss ? { hpFrac: +(m.boss.hp / Math.max(1, m.boss.maxHp)).toFixed(3), maxHp: Math.round(m.boss.maxHp), dead: !!m.boss.dead, phase: m.boss.phase,
          dmgByWeapon: m.actors.reduce((o, a) => { if (a.stats.bossDmg) o[a.weaponId] = Math.round((o[a.weaponId] || 0) + a.stats.bossDmg); return o; }, {}),
          downs: m.events.filter((e) => e.victim && e.victim.team === 0).length, result: m.result && m.result.mode === 'boss' ? { winner: m.result.winner } : null } : undefined,
      };
      if (Z) Object.assign(res, {
        held: held.map((h) => +h.toFixed(1)), neutral: +neutral.toFixed(1), captures: flips, controlEvents: ev.control.length,
        takeovers: ev.control.filter((c, i) => c.owner >= 0 && ev.control.slice(0, i).reverse().find((q) => q.owner >= 0)?.owner === 1 - c.owner).length,
        firstCapture: ev.control.find((c) => c.owner >= 0)?.t ?? null,
        counts: st.count, penalty: st.penalty.map((p) => +p.toFixed(1)), total: st.total, winner: st.winner, reason: st.reason, overtime: st.overtime, overtimeT: st.overtimeT,
        penalties: ev.penalty, rotations: ev.active.length, zonePct: +(100 * anyIn / Math.max(1, zs)).toFixed(1),
        insideAvg: insideN.map((n) => +(n / Math.max(1, zs)).toFixed(2)), nearAvg: nearN.map((n) => +(n / Math.max(1, zs)).toFixed(2)),
        whereT: whereT.map((w) => { const n = Object.values(w).reduce((a, b) => a + b, 0) || 1; return Object.entries(w).map(([k, v]) => k + ' ' + (100 * v / n).toFixed(0) + '%').join(', '); }),
        teams: [0, 1].map((t) => m.actors.filter((a) => a.team === t).map((a) => a.weaponId + (a.specialId ? '/' + a.specialId : '')).join(' ')),
        where: Object.fromEntries(Object.entries(where).map(([k, v]) => [k, +(100 * v / Math.max(1, whereN)).toFixed(0)])), farMode, ready,
        windows: wins.map((w) => w.id + '@' + w.t0 + '-' + w.t1 + 's ' + w.max.map((mx) => 'A' + (mx[0] * 100).toFixed(0) + '/B' + (mx[1] * 100).toFixed(0)).join('+')).join(' | '),
        reach: await (async () => { try { const { zonePlan } = await import('./src/game/bots.js'); const P = zonePlan(); return P ? P.info.map((I, i) => Z.zones[i].kind + i + ':' + I.reach + '/' + Z.zones[i].cells.length + ' R' + I.R.toFixed(1) + ' nodes' + I.nodes.length).join(' ') + ' | retake pushes A ' + P.waves[0].pushes + ' B ' + P.waves[1].pushes : null; } catch (e) { return String(e); } })(),
        log: ev.control.map((c) => c.t + ':' + (c.owner < 0 ? 'N' : 'AB'[c.owner]) + '@' + c.obj).join(' '),
      });
      return res;
    })()`);
    const wallS = ((Date.now() - t0) / 1000).toFixed(0);
    const perf = await js(`(() => { const p = window.__inkwave.perf; return p ? { cpuSimMs: +p.sim.toFixed(2) } : null; })()`);
    if (MODE === 'zones') {
      console.log(`== ${MAP} [zones]: winner ${r.winner === 0 ? 'Alpha' : r.winner === 1 ? 'Bravo' : '-'} (${r.reason}) | final ${r.counts[0]} vs ${r.counts[1]} (penalty +${r.penalty.join('/+')}) | OT ${r.overtime ? r.overtimeT + 's' : 'no'}`);
      console.log(`   held A ${r.held[0]}s B ${r.held[1]}s neutral ${r.neutral}s | captures ${r.captures} (takeovers ${r.takeovers}), control events ${r.controlEvents}, first capture @${r.firstCapture}s | rotations ${r.rotations}`);
      console.log(`   teams: A [${r.teams[0]}] ${r.whereT[0]} | B [${r.teams[1]}] ${r.whereT[1]}`);
      console.log(`   bot-time: ${JSON.stringify(r.where)} (far by mode ${JSON.stringify(r.farMode)}) | specials ready ${r.ready}`);
      console.log(`   bots in the active zone ${r.zonePct}% of the time | avg inside A ${r.insideAvg[0]} B ${r.insideAvg[1]} | within 12 m A ${r.nearAvg[0]} B ${r.nearAvg[1]}`);
    } else if (r.boss) console.log(`== ${MAP} [boss ${SECS}s]: HULLBREAKER ${r.boss.dead ? 'SUNK' : Math.round(r.boss.hpFrac * 100) + '% HP left'} (max ${r.boss.maxHp}, phase ${r.boss.phase}) | squad downs ${r.boss.downs} | damage by weapon ${JSON.stringify(r.boss.dmgByWeapon)}`);
    else console.log(`== ${MAP} [turf ${SECS}s]: turf ${r.cov.join('% vs ')}%`);
    console.log(`   roles (% of bot-time) ${JSON.stringify(r.roles)} | holding on purpose ${r.holdPct}%`);
    console.log(`   per bot: turf ${r.per.turf}p, on-zone ink ${r.per.zoneTurf}p, splats ${r.per.splats} → XP beyond the win/lose base ≈ ${r.per.xpVar}`);
    if (r.pods) console.log(`   sprout pods: ${JSON.stringify(r.pods)}`);
    console.log(`   stuck ${r.stuckPct}% | splats ${r.splats} (water ${r.water}) | specials ${r.specials} | super jumps ${r.jumps} | turf ${r.cov.join('/')} | sim ${r.simT}s in ${(r.simMs / 1000).toFixed(0)}s (wall ${wallS}s) | ${JSON.stringify(perf)}`);
    if (MODE === 'zones') { console.log('   penalties ' + JSON.stringify(r.penalties)); console.log('   control log ' + r.log); console.log('   best shares per activation ' + r.windows); console.log('   reachable cells ' + r.reach); }
    console.log('   loadouts ' + equip + (tuned ? ' | TUNE ' + tuned : ''));
    console.log('   by weapon (players, splats dealt, deaths, avg turf) ' + Object.entries(r.byWeapon).map(([w, o]) => `${w}×${o.n} ${o.splats}/${o.deaths} ${o.turf}p`).join(' · '));
    console.log('   splats by cause ' + JSON.stringify(r.byCause));
    { const T = r.teamKD; console.log(`   enemy specials AI ${spAI} | splatted by specials: A ${T[0].sp} ${JSON.stringify(T[0].by)} · B ${T[1].sp} ${JSON.stringify(T[1].by)} | K/D A ${T[0].k}/${T[0].d} B ${T[1].k}/${T[1].d}${r.spStats ? ' | ' + JSON.stringify(r.spStats) : ''}`); }
    { const s = r.sight; console.log(`   sight: fighting ${s.fightS} bot-s, trigger held ${s.fireS} s | foe out of sight ${s.hidPct}% of fight time, aim still on it ${s.trackPct}% of that | shooting at nothing ${s.blindPct}% of trigger time (${s.blindTrackPct}% straight at the hidden foe; ${s.blindBelievedPct}% while it still thinks it sees it, ${s.blindChargePct}% a charge held, ${s.blindShotPct}% shots) | bots ${r.botMsPerS} ms per sim s (looking ${r.seeMsPerS})${s.stats ? ' | ' + JSON.stringify(s.stats) : ''}`); }
    if (r.climbs) console.log('   wall climbs (at the wall): ' + JSON.stringify(r.climbs));
    for (const e of DIAG ? [] : r.eps) console.log('   stuck ' + JSON.stringify(e));
    if (DIAG) { console.log(`   DIAG: ${r.diagEps.length} stuck episode(s) of 2 s or more`); for (const e of r.diagEps) { const { diag, ...rest } = e; console.log('   stuck ' + JSON.stringify(rest)); for (const d of diag) console.log('      plan ' + JSON.stringify(d)); } }
    if (r.track) { const t = r.track; console.log(`   TRACK ${t.weapon}×${t.n} (team ${t.team}): ${t.kills} splats / ${t.deaths} deaths | damage out ${JSON.stringify(t.dmgOut)} in ${t.dmgIn} (armour saved ${t.armour}) | median dist: hits out ${t.distOut} m, hits in ${t.distIn} m, kills ${t.killDist} m, deaths ${t.deathDist} m`);
      console.log(`         died while ${JSON.stringify(t.deathState)} | by ${JSON.stringify(t.deathBy)} | ${t.deathClean} deaths without touching the killer | nearest enemy <4.5/<8/<14/far m: ${t.reach.join('/')}% | fighting ${t.fightS}s of ${t.aliveS}s alive | fired ${t.fired}${t.leaps ? ` | leaps ${t.leaps} ${JSON.stringify(t.leapKind)}, hit on landing ${t.leapHits}, landing kills ${t.leapKills}, clings ${t.clings}` : ''}`); }
    if (r.frameErr.n) console.log(`   FRAME ERRORS ${r.frameErr.n}: ${r.frameErr.msg}`);
    const uniq = [...new Set(logs)];
    console.log(`CONSOLE ${uniq.length} unique warning/error line(s)`); for (const l of uniq.slice(0, 20)) console.log('  ' + l);
    r.map = MAP; r.mode = MODE; r.loadouts = equip; r.tune = tuned; r.consoleLines = uniq.length; r.specialAI = spAI; r.spCharge = SPCHARGE;
    console.log('RESULT_JSON ' + JSON.stringify(r));
    if (OUT) require('fs').writeFileSync(OUT, JSON.stringify(r));
    app.quit();
  });
});
