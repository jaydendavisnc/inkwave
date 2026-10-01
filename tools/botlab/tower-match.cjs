// Tower Command bot health on one stage: an all-bot (autopilot) match stepped at a fixed 60 Hz (sim time, not wall
// time), a full 5:00 (+ overtime) match.
// Reports: seconds each team controlled the tower / contested / neutral, control changes, max push per team (T.best),
// checkpoints cleared, final counts, winner + reason, avg riders while controlled, empty-while-held episodes + the
// longest, bot stuck % (as bots-zbot), bots stuck against the tower collider, splats / specials / super jumps,
// console errors, sim cost.
//   MAP=halyard tools/botlab/run.sh tools/botlab/tower-match.cjs      (OUT=file.json writes the numbers; DUR=300 match seconds;
//   OTMAX=120 caps a stalled overtime; MAP=towerbox is a synthetic test stage defined below, never shipped)
//   TOWER_DEF='{ path: [[x, z], …] }' swaps in a drawn path for the stage
//   HUMAN=still | ride | escort: Alpha's first player (the local kid) plays as a human would, outside the bots' team plan
//   — still: stands at spawn (a player gone AFK); ride / escort: its own brain in that role, never re-dealt (a pushy
//   player who rides, one who fights round it). Default: all bots (the local kid is one of them).
// The escort trace (`Y`, printed as "escort …" lines): per team while it holds the tower, by the real threat (hot: one of
// theirs up within 20 m of the tower; cold: none within 30 m) — riders, full-steam share, the escorts' distance (every
// bot of the team up and off it but the ones making for it: the backup and the other escorts; perches apart), their
// place along the track (behind / beside / 1–8 m ahead / further ahead / far off), by escort slot too, screening
// (between the tower and the nearest foe), fighting, our ink on the route 2–12 m ahead, an escort by the next
// checkpoint as it nears; riders hidden in our ink on its deck (the stance: threatened / safe), deaths while riding
// (per minute of rider time), the deck's ink; time rolling home and the riders' hop-offs for it; a role timeline
// (1 s per letter, printed for the first 150 s).
const { app } = require('electron');
require(process.env.S + '/offscreen-boot.cjs');
const MAP = process.env.MAP || 'halyard', DUR = +(process.env.DUR || 300), HUMAN = process.env.HUMAN || '';
const OUT = process.env.OUT || '';
setTimeout(() => { console.log('WATCHDOG'); app.exit(1); }, +(process.env.WATCHDOG || 590000));
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
    if (MAP === 'towerbox') await js(`(async () => {
      // test-only arena (never shipped): a flat 56 x 96 m deck, the spawn decks, a straight route along z with a
      // plateau on it (up a ramp, down three 0.3 m steps) and a crate it climbs over and a little cover off it; the route drawn as TOWER_DEF below
      const { MAPS } = await import('./src/config.js'); const { MAP_LAYOUTS } = await import('./src/world/maps.js');
      if (!MAPS.find((m) => m.id === 'towerbox')) MAPS.push({ id: 'towerbox', name: 'Tower Box', blurb: '', theme: 'day', times: { day: 'day', dusk: 'sunset' } });
      const B = (x0, x1, y0, y1, z0, z1, o = {}) => ({ kind: 'box', min: [x0, y0, z0], max: [x1, y1, z1], color: '#d8d2c4', pattern: 3, ...o });
      const RP = (low, high, width) => ({ kind: 'ramp', low, high, width, thickness: 0.4, color: '#c8c2b4', pattern: 3 });
      MAP_LAYOUTS.towerbox = { id: 'towerbox', bounds: { minX: -28, maxX: 28, minZ: -48, maxZ: 48 }, spawnPads: [[0, 2.4, -44], [0, 2.4, 44]], spawnBarrier: 4.2,
        single: [B(-28, 28, -1.2, 0, -40, 40)],
        half: [B(-8, 8, -1.2, 2.4, -48, -40), RP([0, 0, 8], [0, 1.2, 12.5], 8), B(-4, 4, 0, 1.2, 12.5, 20), B(-4, 4, 0, 0.9, 20, 20.8), B(-4, 4, 0, 0.6, 20.8, 21.6), B(-4, 4, 0, 0.3, 21.6, 22.4), B(-1.5, 1.5, 0, 0.7, 28, 29),
          B(-8, -6, 0, 1.4, 3, 5), B(6, 8.5, 0, 1.4, 9, 11), B(-10, -7, 0, 2.5, 17, 20), B(7, 10, 0, 1.2, 25, 27), B(-6, -4, 0, 1.1, 30, 32), B(10, 14, 0, 3, -2, 2)],
        tower: ${process.env.TOWER_DEF || '{ path: [[0, 0], [0, 38]] }'}, decor: { lamps: [], palms: [], flags: [] } };
      return true; })()`);
    else if (process.env.TOWER_DEF) await js(`(async () => { const { MAP_LAYOUTS } = await import('./src/world/maps.js'); MAP_LAYOUTS['${MAP}'].tower = ${process.env.TOWER_DEF}; if (window.__inkwave.layoutId === '${MAP}' && __G.level) __G.level.layout.tower = MAP_LAYOUTS['${MAP}'].tower; return true; })()`);   // (the stage may already be built: its layout is a copy)
    await js(`window.__inkwave.api.startMatch({ mapId: '${MAP}', mode: 'tower', duration: ${DUR} })`);
    { const got = await js(`(window.__inkwave.mapDef && window.__inkwave.mapDef.id) || null`); if (got !== MAP) { console.log(`MAP MISMATCH: asked for ${MAP}, the game built ${got} (a stage missing from MAPS falls back to the first one)`); app.exit(3); return; } }   // (never test the wrong stage silently)
    for (let i = 0; i < 240; i++) { if (await js(`window.__inkwave.match?.state === 'playing'`)) break; await wait(250); }
    const t0 = Date.now();
    const r = await js(`(async () => {
      const g = window.__inkwave, m = g.match, T = m.tower;
      const { on } = await import('./src/core/ctx.js');
      const { TOWER } = await import('./src/config.js');
      const { towerPlan } = await import('./src/game/bots.js');
      const X = { climbs: [0, 0], sjRider: 0, kills: 0, killsNear: [0, 0], stanceT: [[0, 0], [0, 0]], stanceSw: [0, 0], rS: [[0, 0], [0, 0]], rN: [[0, 0], [0, 0]],
        escD: 0, escN: 0, escIn: 0, toBoard: [], nearBoard: [], aborted: 0, attempts: 0, climbMounts: 0, sjMounts: 0, lastSteam: [null, null],
        abortWhy: {}, water: [], steamEp: [[], []], steamT0: [0, 0], rS3: [0, 0], rN3: [0, 0], upS3: [0, 0], offWhy: {}, escOnly: [], bkD: [] };
      const bs = new Map();   // per bot boarding attempt { t0, near, lastClimb, lastSj }
      // a human stand-in on Alpha (HUMAN): out of the team plan
      const HUMAN = '${HUMAN}', me = m.local;
      if (HUMAN === 'still' && me) { me.bot = null; me.intent.move.set(0, 0, 0); me.intent.fire = me.intent.squid = me.intent.jump = me.intent.sub = me.intent.special = false; }
      else if ((HUMAN === 'ride' || HUMAN === 'escort') && me && me.bot) me.bot.human = HUMAN;
      const planned = (a) => !!(a.bot && !a.bot.human);
      // the escort trace: per team [hot, warm, cold] while it holds the tower
      const Y = { heldS: [[0, 0, 0], [0, 0, 0]], rid: [[0, 0, 0], [0, 0, 0]], steamS: [[0, 0, 0], [0, 0, 0]], ridH: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
        escD: [[], [], []], escAl: [[], [], []], place: [{}, {}, {}], dg: [0, 1, 2].map(() => ({ gAl: [], pAl: [], arr: 0, n: 0, fight: 0, slot: {} })), screen: [0, 0, 0], fight: [0, 0, 0], escN: [0, 0, 0], ink: [[0, 0], [0, 0], [0, 0]], cpNear: [0, 0], cpNearN: [0, 0],
        hideS: [[0, 0], [0, 0]], rideS: [[0, 0], [0, 0]], deckInk: [0, 0], rideDeaths: 0, rideDeathsT: [0, 0], riderS: 0, steamTot: [0, 0], line: [[], []], humanRole: {}, humanOn: 0, humanUp: 0, steamHotEp: [0, 0], lastSteamHot: [false, false],
        slotPlace: [{}, {}, {}], homingS: [0, 0], homeOffEp: [0, 0], homeOffS: [0, 0], lastHomeOff: [false, false] };
      const tline = new Map();   // per bot: a letter a second
      g.debug.freeze();
      const ev = { control: [], cps: [], contest: 0, overtime: null, end: null, specials: 0, jumps: 0, idleNeutral: 0, ready: 0 };
      const clock = () => +(m.duration - m.time + (T ? T.overtimeT : 0)).toFixed(1);
      const offs = [
        on('tower:control', (e) => { ev.control.push({ t: clock(), owner: e.owner, prev: e.prev, s: +T.s.toFixed(1) }); if (e.owner < 0 && e.prev >= 0) ev.idleNeutral++; }),
        on('tower:checkpoint', (e) => ev.cps.push({ t: clock(), team: e.team, index: e.index, state: e.state })),
        on('tower:contest', (e) => { if (e.on) ev.contest++; }),
        on('tower:overtime', (e) => { ev.overtime = e.losing; }),
        on('tower:end', (e) => { ev.end = { winner: e.winner, reason: e.reason }; }),
        on('special:use', () => ev.specials++),
        on('special:ready', () => ev.ready++),
        on('superjump', (e) => { if (e.phase === 'charge') { ev.jumps++; const tg = e.actor.superJumpState && e.actor.superJumpState.target; if (tg && T.riderList.includes(tg)) { X.sjRider++; const b = bs.get(e.actor); if (b) b.lastSj = simT; } } }),
        on('actor:climb', (e) => { if (e.on && e.actor.wallHit && e.actor.wallHit.block === T.block.id) { X.climbs[e.actor.team]++; const b = bs.get(e.actor); if (b) b.lastClimb = simT; } }),
        on('splatted', (e) => { X.kills++; const v = e.victim; if (Math.hypot(v.pos.x - T.pos.x, v.pos.z - T.pos.z) < 15) X.killsNear[v.team]++;
          if (T.riderList.includes(v) || riding.has(v)) { const P0 = towerPlan(); Y.rideDeaths++; Y.rideDeathsT[P0 && P0.steam[v.team] ? 1 : 0]++; }
          if (e.cause === 'water' && X.water.length < 12) { const b = v.bot || {}; X.water.push({ t: +simT.toFixed(1), w: v.weaponId, role: b.tRole, mode: b.mode, rode: riding.has(v), climb: !!v.climbing, dT: +Math.hypot(v.pos.x - T.pos.x, v.pos.z - T.pos.z).toFixed(1), pos: [+v.pos.x.toFixed(1), +v.pos.y.toFixed(1), +v.pos.z.toFixed(1)], ts: +T.s.toFixed(1), near: !!b.tNear, board: b.tBoard ? b.tBoard.type + b.tBoard.f : null, hide: !!b.tHide }); } }),
      ];
      const hist = new Map(), sideH = new Map(); let samples = 0, stuckS = 0, simT = 0;
      const held = [0, 0]; let contested = 0, neutral = 0, ts = 0;
      const riderSum = [0, 0], riderN = [0, 0];
      let emptyEp = 0, wasEmptyHeld = false, maxEmpty = 0; const emptyLens = []; let emptyStart = 0;
      let emptyCtx = { alive: 0, near: 0 }, emptyWipe = 0; const emptyAvoid = [];   // (> 2 s with a teammate up within 15 m)
      const eps = [], sideEps = []; let sideS = 0, sideStuckS = 0, holdS = 0, rideS = 0;
      const roleS = {}; const frameErr = { n: 0, msg: '' }; const mounts = [0, 0]; const riding = new Set();
      const open = new Map(), openSide = new Map();
      const dis = {}, lastOff = {};   // dismount reasons; the reasons of the last rider off a held tower
      const emptyHeldNow = (a) => T.owner === a.team && T.riders[a.team] === 0;
      const DT = 1 / 60, CH = 15;           // 0.25 s per chunk
      const maxT = ${DUR} + Math.min(TOWER.overtimeMax, ${+(process.env.OTMAX || 120)}) + 1;   // (a stalled sudden death isn't worth simulating to the 5 min cap)
      const onTop = (a) => T.riderList.includes(a);
      let chunk = 0; const tSim0 = performance.now();
      while (m.state === 'playing' && simT < maxT) {
        const render = (chunk++ % 8) === 0;
        for (let k = 0; k < CH; k++) { g._skipRender = !(render && k === CH - 1); try { g._frame(DT); } catch (e) { frameErr.n++; if (!frameErr.msg) frameErr.msg = String(e && e.stack || e).slice(0, 400); } }
        g._skipRender = false;
        simT += CH * DT;
        if (!T || m.state !== 'playing') continue;
        // --- tower metrics
        ts++;
        if (T.contested) contested += 0.25;
        if (T.owner >= 0) { held[T.owner] += 0.25; riderSum[T.owner] += T.riders[T.owner]; riderN[T.owner]++; } else neutral += 0.25;
        const emptyHeld = T.owner >= 0 && T.riders[0] + T.riders[1] === 0;
        if (emptyHeld && !wasEmptyHeld) {
          emptyEp++; emptyStart = simT;
          // was anyone of the holding team up and near (≤ 15 m) to get back on? (a team wipe can't be helped)
          const mates = m.actors.filter((a) => a.team === T.owner && a.alive && !a.superJumpState);
          emptyCtx = { alive: mates.length, near: mates.filter((a) => Math.hypot(a.pos.x - T.pos.x, a.pos.z - T.pos.z) < 15).length };
        }
        if (!emptyHeld && wasEmptyHeld) { const l = +(simT - emptyStart).toFixed(2); emptyLens.push(l); if (l > 2 && emptyCtx.near) emptyAvoid.push(l); if (!emptyCtx.alive) emptyWipe++; }
        wasEmptyHeld = emptyHeld;
        if (T.owner >= 0) maxEmpty = Math.max(maxEmpty, T.emptyT);
        for (const a of m.actors) {
          if (!a.bot) continue;
          const on = a.alive && onTop(a);
          if (on && !riding.has(a)) { riding.add(a); mounts[a.team]++; }
          if (!on && riding.has(a)) {
            // why a rider came off: splatted / super jump / refill / retreat / no longer a rider / knocked or walked off
            const b = a.bot, why = !a.alive ? 'death' : a.superJumpState ? 'sj' : b.mode === 'refill' ? 'refill' : b.mode === 'retreat' ? 'retreat' : b.tRole !== 'ride' ? 'role' : 'fell';
            dis[why] = (dis[why] || 0) + 1;
            if (emptyHeldNow(a)) lastOff[why] = (lastOff[why] || 0) + 1;
          }
          if (!on) riding.delete(a);
          // boarding attempts: a rider (role) off it → on it
          const b = a.bot; let at = bs.get(a);
          const trying = a.alive && !on && b.tRole === 'ride' && !a.superJumpState;
          if (trying && !at) { at = { t0: simT, near: -1, lastClimb: -9, lastSj: -9 }; bs.set(a, at); X.attempts++; }
          if (at && trying && b.tNear && at.near < 0) at.near = simT;
          if (at && on) { X.toBoard.push(+(simT - at.t0).toFixed(2)); if (at.near >= 0) X.nearBoard.push(+(simT - at.near).toFixed(2)); if (simT - at.lastClimb < 2) X.climbMounts++; else if (simT - at.lastSj < 8) X.sjMounts++; bs.delete(a); }
          else if (at && !trying && !a.superJumpState) { X.aborted++; const w = !a.alive ? 'death' : b.tRole !== 'ride' ? 'role' : 'other'; X.abortWhy[w] = (X.abortWhy[w] || 0) + 1; bs.delete(a); }
        }
        const P = towerPlan();
        if (P) for (let t = 0; t < 2; t++) {
          const st = P.steam && P.steam[t] ? 1 : 0;
          X.stanceT[t][st] += 0.25;
          if (X.lastSteam[t] !== null && X.lastSteam[t] !== st) { X.stanceSw[t]++; if (st) X.steamT0[t] = simT; else X.steamEp[t].push(+(simT - X.steamT0[t]).toFixed(2)); }
          X.lastSteam[t] = st;
          if (st && T.owner === t && simT - X.steamT0[t] >= 3) {
            X.rS3[t] += T.riders[t]; X.rN3[t]++; X.upS3[t] += m.actors.filter((a) => a.team === t && a.alive).length;
            // the alive ones not on it: why
            for (const a of m.actors) {
              if (a.team !== t || !a.alive || onTop(a) || !a.bot) continue;
              const b = a.bot, dd = Math.hypot(a.pos.x - T.pos.x, a.pos.z - T.pos.z);
              const why = a.superJumpState ? 'sj' : b.tRole !== 'ride' ? 'role:' + b.tRole : b.mode !== 'paint' ? 'mode:' + b.mode : a.climbing ? 'climbing' : b.tNear ? (b.tBoard ? 'near:' + b.tBoard.type : 'near') : dd > 15 ? 'far' : b.tBoard ? 'approach' : 'noface';
              X.offWhy[why] = (X.offWhy[why] || 0) + 1;
            }
          }
          if (!st && T.owner === t) for (const a of m.actors) if (a.team === t && a.alive && a.bot && a.bot.tRole === 'escort' && !onTop(a)) { const dd = Math.hypot(a.pos.x - T.pos.x, a.pos.z - T.pos.z); X.escOnly.push(dd); if (P.backup && P.backup[t] === a) X.bkD.push(dd); }
          if (T.owner === t) {
            X.rS[t][st] += T.riders[t]; X.rN[t][st]++;
            if (!st) for (const a of m.actors) if (a.team === t && a.alive && !onTop(a) && !a.superJumpState) { const dd = Math.hypot(a.pos.x - T.pos.x, a.pos.z - T.pos.z); X.escD += dd; X.escN++; if (dd < 12) X.escIn++; }
          }
        }
        // --- the escort trace (Y)
        if (P) for (let t = 0; t < 2; t++) {
          const st = P.steam[t] ? 1 : 0;
          if (st) Y.steamTot[t] += 0.25;
          // riders: hidden in our ink on its deck (submerged), by the stance; deck ink while held
          for (const a of T.riderList) if (a.team === t) { Y.rideS[t][st] += 0.25; Y.riderS += 0.25; if (a.form === 'squid' && a.groundTeam === 1) Y.hideS[t][st] += 0.25; }
          const foes = m.actors.filter((e) => e.team !== t && e.alive && !e.superJumpState);
          const fd = foes.map((e) => Math.hypot(e.pos.x - T.pos.x, e.pos.z - T.pos.z));
          const lvl = fd.some((d) => d < 20) ? 0 : fd.some((d) => d < 30) ? 1 : 2;   // hot / warm / cold
          const sh = st && lvl === 0;
          if (sh && !Y.lastSteamHot[t]) Y.steamHotEp[t]++;
          Y.lastSteamHot[t] = sh;
          const ho = !!(P.homeOff && P.homeOff[t]);
          if (ho && !Y.lastHomeOff[t]) Y.homeOffEp[t]++;
          if (ho) Y.homeOffS[t] += 0.25;
          Y.lastHomeOff[t] = ho;
          if (T.owner !== t) continue;
          if (T.homing) Y.homingS[t] += 0.25;
          Y.heldS[t][lvl] += 0.25; Y.rid[t][lvl] += T.riders[t] * 0.25; if (st) Y.steamS[t][lvl] += 0.25;
          Y.ridH[t][Math.min(4, T.riders[t])] += 0.25;
          // deck ink: a 5 × 5 grid over its deck
          { let own = 0, n = 0; const c = Math.cos(T.yaw), s = Math.sin(T.yaw);
            for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const lx = i * 0.45, lz = j * 0.45; if (Math.abs(lx) < 0.3 && Math.abs(lz) < 0.3) continue; n++; if (T.paint.groundTeam({ x: T.pos.x + lx * c + lz * s, y: T.top, z: T.pos.z - lx * s + lz * c }) === t + 1) own++; }
            Y.deckInk[t] += own / Math.max(1, n) * 0.25; }
          // the route ahead: our ink 2–12 m ahead of it
          const dir = t === 0 ? 1 : -1;
          for (let k = 2; k <= 12; k += 2) { const p = T.path.at(T.s + dir * k); const q = __G.paint.regionStats(p.x, p.y, p.z, 1.5, t, {}); if (q.n) { Y.ink[lvl][0] += q.own; Y.ink[lvl][1]++; } }
          // the escorts (planned bots of t up and off it, not climbing / super jumping): where they stand
          const e = T.path.dir(T.s), ex = e.x * dir, ez = e.z * dir;
          let near = null, nd = Infinity;
          foes.forEach((f, i) => { if (fd[i] < nd) { nd = fd[i]; near = f; } });
          for (const a of m.actors) {
            if (a.team !== t || !a.alive || !planned(a) || onTop(a) || a.superJumpState || P.climbing(a)) continue;
            const role = a.bot.tRole === 'ride' ? 'boarding' : P.backup[t] === a ? 'backup' : a.bot.tRole || '-';
            if (role === 'boarding') continue;
            const rx = a.pos.x - T.pos.x, rz = a.pos.z - T.pos.z, d = Math.hypot(rx, rz);
            // where along the track it stands (the nearest point of it within 40 m of the tower; a bent track counts
            // round its corners): m ahead of the tower the way we push, and how far off the track
            let bk = -1, bd2 = Infinity; const k0 = P.idx(T.s);
            for (let k = Math.max(0, k0 - 40); k <= Math.min(P.pts.length - 1, k0 + 40); k++) { const q = P.pts[k], dd = Math.hypot(q.x - a.pos.x, q.z - a.pos.z) + Math.abs(q.y - a.pos.y) * 0.5; if (dd < bd2) { bd2 = dd; bk = k; } }
            const along = (P.s0 + bk - T.s) * dir;
            const pl = d > 22 || bd2 > 10 ? 'far' : along < -2 ? 'behind' : along <= 1 ? 'beside' : along <= 8 ? 'ahead' : 'wayAhead';
            const grp = role === 'perch' ? 'perch' : 'esc', key = grp + ':' + pl;   // (esc: the backup and the other escorts)
            Y.place[lvl][key] = (Y.place[lvl][key] || 0) + 0.25;
            const sk = (grp === 'esc' && P.slotOf ? P.slotOf(a) : role) + ':' + pl;
            Y.slotPlace[lvl][sk] = (Y.slotPlace[lvl][sk] || 0) + 0.25;
            // (diagnostics: painting escorts — where along the track their goal is, and they are; arrived or on the way)
            if (grp === 'esc') {
              const G0 = Y.dg[lvl]; G0.n++;
              if (a.bot.mode === 'fight') G0.fight++;
              else if (a.bot.mode === 'paint') {
                const arrived = !a.bot.path || a.bot.pi >= a.bot.path.length; if (arrived) G0.arr++;
                const sk2 = P.slotOf ? P.slotOf(a) : role; G0.slot[sk2] = (G0.slot[sk2] || 0) + 1;
                G0.pAl.push(along);
                if (a.bot.goal >= 0) { const gn = __G.nav.nodes[a.bot.goal]; let gk = -1, gd = Infinity; for (let k = Math.max(0, k0 - 40); k <= Math.min(P.pts.length - 1, k0 + 40); k++) { const q2 = P.pts[k], dd = Math.hypot(q2.x - gn.x, q2.z - gn.z); if (dd < gd) { gd = dd; gk = k; } } G0.gAl.push((P.s0 + gk - T.s) * dir); }
              }
            }
            if (grp === 'esc') { Y.escD[lvl].push(d); Y.escN[lvl]++; Y.escAl[lvl].push(along); if (a.bot.mode === 'fight') Y.fight[lvl]++; if (near && nd < 30 && d < 14 && (rx * (near.pos.x - T.pos.x) + rz * (near.pos.z - T.pos.z)) / Math.max(0.1, d * nd) > 0.5) Y.screen[lvl]++; }
          }
          // the next checkpoint as it nears (5–20 m off): an escort within 7 m of it?
          const cp = T._nextCp(t);
          if (cp) { const cd = Math.abs(T.s - dir * cp.d); if (cd > 5 && cd < 20) { Y.cpNearN[t]++; if (m.actors.some((a) => a.team === t && a.alive && planned(a) && !onTop(a) && a.bot.tRole !== 'ride' && Math.hypot(a.pos.x - cp.pos.x, a.pos.z - cp.pos.z) < 7)) Y.cpNear[t]++; } }
        }
        if (me && HUMAN) { Y.humanUp += me.alive ? 0.25 : 0; if (me.alive && onTop(me)) Y.humanOn += 0.25; }
        // the role timeline: a letter a second per bot (R riding, r making for it, E escort, B backup, P perch, . dead, S super jump)
        if (P && (ts % 4) === 0 && simT < 300) for (const a of m.actors) {
          if (!a.bot && a !== me) continue;
          let s = tline.get(a); if (!s) { s = ''; }
          const b = a.bot, ch = !a.alive ? '.' : a.superJumpState ? 'S' : !b ? 'h' : onTop(a) ? 'R' : b.tRole === 'ride' ? 'r' : P.backup[a.team] === a ? 'B' : b.tRole === 'perch' ? 'P' : 'E';
          tline.set(a, s + ch);
        }
        // --- stuck (as bots-zbot, in sim time); riders on the platform and bots holding a spot on purpose don't count
        for (const a of m.actors) {
          if (!a.bot) continue;
          const b = a.bot;
          const h = hist.get(a) || []; hist.set(a, h);
          h.push({ t: simT, x: a.pos.x, z: a.pos.z });
          while (h.length && simT - h[0].t > 3) h.shift();
          const on = a.alive && onTop(a);
          if (on) rideS += 0.25;
          const holding = !!(b.tHoldUntil > b.t && (!b.path || b.pi >= b.path.length));
          if (holding && a.alive) holdS += 0.25;
          const role = b.tRole || '-';
          if (a.alive) roleS[role] = (roleS[role] || 0) + 0.25;
          const wants = a.alive && !a.superJumpState && !(a.weaponRunner && a.weaponRunner.charging) && !holding && !on;
          samples++;
          const span = h.length > 1 ? Math.max(...h.map((p) => Math.hypot(p.x - a.pos.x, p.z - a.pos.z))) : 99;
          const stuck = wants && h.length >= 11 && span < 1.0;
          if (stuck) {
            stuckS += 0.25;
            if (!open.has(a)) { const ep = { t: +simT.toFixed(1), name: a.name, w: a.weaponId, mode: b.mode, role, pos: [+a.pos.x.toFixed(1), +a.pos.y.toFixed(2), +a.pos.z.toFixed(1)], tower: +Math.hypot(a.pos.x - T.pos.x, a.pos.z - T.pos.z).toFixed(1), path: !!b.path, dur: 0 }; open.set(a, ep); eps.push(ep); }
            open.get(a).dur += 0.25;
          } else open.delete(a);
          // against the tower's side: by it (≤ 2.6 m from its centre), on the floor below its top, not riding
          const dx = a.pos.x - T.pos.x, dz = a.pos.z - T.pos.z, c = Math.cos(T.yaw), s = Math.sin(T.yaw);
          const lx = dx * c - dz * s, lz = dx * s + dz * c, edge = Math.max(Math.abs(lx), Math.abs(lz)) - TOWER.platformR;
          const atSide = a.alive && !on && !a.superJumpState && edge < 0.9 && a.pos.y < T.top - 0.3 && a.pos.y > T.pos.y - 1.2;
          const hs = sideH.get(a) || []; sideH.set(a, hs);
          if (atSide) { sideS += 0.25; hs.push({ t: simT, x: a.pos.x, z: a.pos.z, s: T.s }); } else hs.length = 0;
          while (hs.length && simT - hs[0].t > 2) hs.shift();
          const sspan = hs.length > 1 ? Math.max(...hs.map((p) => Math.hypot(p.x - a.pos.x, p.z - a.pos.z))) : 99;
          const sstuck = atSide && hs.length >= 8 && sspan < 0.6;
          if (sstuck) {
            sideStuckS += 0.25;
            if (!openSide.has(a)) { const ep = { t: +simT.toFixed(1), name: a.name, w: a.weaponId, role, edge: +edge.toFixed(2), dy: +(a.pos.y - T.pos.y).toFixed(2), grounded: a.grounded, dur: 0 }; openSide.set(a, ep); sideEps.push(ep); }
            openSide.get(a).dur += 0.25;
          } else openSide.delete(a);
        }
        if (chunk % 40 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      if (wasEmptyHeld) { const l = +(simT - emptyStart).toFixed(2); emptyLens.push(l); if (l > 2 && emptyCtx.near) emptyAvoid.push(l); }
      const simMs = performance.now() - tSim0;
      offs.forEach((f) => f());
      const st = T ? T.state() : null;
      const flips = ev.control.filter((c) => c.owner >= 0);
      const botS = Math.max(1, samples * 0.25);
      const res = {
        simT: +simT.toFixed(1), simMs: Math.round(simMs), state: m.state, stuckPct: +(100 * stuckS / botS).toFixed(1),
        splats: m.events.length, water: m.events.filter((e) => e.cause === 'water').length, specials: ev.specials, ready: ev.ready, jumps: ev.jumps,
        cov: __G.paint.coverage().map((c) => +(c * 100).toFixed(1)),
        frameErr, eps: eps.sort((a, b) => b.dur - a.dur).slice(0, 6), sideEps: sideEps.sort((a, b) => b.dur - a.dur).slice(0, 6),
        sidePct: +(100 * sideS / botS).toFixed(1), sideStuckS: +sideStuckS.toFixed(1), sideStuckN: sideEps.length,
        holdPct: +(100 * holdS / botS).toFixed(1), ridePct: +(100 * rideS / botS).toFixed(1),
        roles: Object.fromEntries(Object.entries(roleS).map(([k, v]) => [k, +(100 * v / botS).toFixed(0)])),
      };
      const q = (arr, p) => { if (!arr.length) return null; const b = [...arr].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
      res.x = { climbs: X.climbs, sjRider: X.sjRider, kills: X.kills, killsNear: X.killsNear, attempts: X.attempts, boarded: X.toBoard.length, aborted: X.aborted,
        climbMounts: X.climbMounts, sjMounts: X.sjMounts,
        toBoard: { med: q(X.toBoard, 0.5), p80: q(X.toBoard, 0.8) }, nearBoard: { med: q(X.nearBoard, 0.5), p80: q(X.nearBoard, 0.8), under6: X.nearBoard.filter((v) => v < 6).length, n: X.nearBoard.length },
        stanceT: X.stanceT, stanceSw: X.stanceSw,
        ridersThreat: [0, 1].map((t) => +(X.rS[t][0] / Math.max(1, X.rN[t][0])).toFixed(2)), ridersSafe: [0, 1].map((t) => +(X.rS[t][1] / Math.max(1, X.rN[t][1])).toFixed(2)),
        heldThreatS: [0, 1].map((t) => X.rN[t][0] * 0.25), heldSafeS: [0, 1].map((t) => X.rN[t][1] * 0.25),
        escortDist: +(X.escD / Math.max(1, X.escN)).toFixed(1), escortWithin12: +(100 * X.escIn / Math.max(1, X.escN)).toFixed(0),
        water: X.water, offWhy: X.offWhy, abortWhy: X.abortWhy, steamEps: X.steamEp.map((e) => e.length), steamEpMed: X.steamEp.map((e) => q(e, 0.5)), ridersSafe3s: [0, 1].map((t) => +(X.rS3[t] / Math.max(1, X.rN3[t])).toFixed(2)), aliveSafe3s: [0, 1].map((t) => +(X.upS3[t] / Math.max(1, X.rN3[t])).toFixed(2)), safe3sS: X.rN3.map((n) => n * 0.25),
        escortMed: q(X.escOnly, 0.5), escortP80: q(X.escOnly, 0.8), backupMed: q(X.bkD, 0.5) };
      // the escort trace, summed over both teams, by the real threat round the tower (hot / warm / cold)
      const r2 = (v) => +v.toFixed(2), sum2 = (A, i) => A[0][i] + A[1][i];
      res.y = { lvl: ['hot', 'warm', 'cold'].map((name, i) => {
        const held = sum2(Y.heldS, i), n = Y.escN[i] || 1, pl = {}, tot = Object.values(Y.place[i]).reduce((s2, v) => s2 + v, 0) || 1;
        for (const [k, v] of Object.entries(Y.place[i])) pl[k] = Math.round(100 * v / tot);
        return { name, heldS: held, riders: held ? r2(sum2(Y.rid, i) / held) : null, steam: held ? Math.round(100 * sum2(Y.steamS, i) / held) : null,
          escMed: q(Y.escD[i], 0.5) && r2(q(Y.escD[i], 0.5)), escP80: q(Y.escD[i], 0.8) && r2(q(Y.escD[i], 0.8)), escAlong: q(Y.escAl[i], 0.5) && r2(q(Y.escAl[i], 0.5)), screen: Math.round(100 * Y.screen[i] / n), fight: Math.round(100 * Y.fight[i] / n),
          inkAhead: Y.ink[i][1] ? Math.round(100 * Y.ink[i][0] / Y.ink[i][1]) : null, place: pl,
          dg: { n: Y.dg[i].n, fight: Math.round(100 * Y.dg[i].fight / (Y.dg[i].n || 1)), arrived: Math.round(100 * Y.dg[i].arr / (Y.dg[i].pAl.length || 1)), goalAlong: q(Y.dg[i].gAl, 0.5), posAlong: q(Y.dg[i].pAl, 0.5), goalP20: q(Y.dg[i].gAl, 0.2), slot: Y.dg[i].slot },
          slotPlace: Object.fromEntries(Object.entries(Y.slotPlace[i]).map(([k, v]) => [k, Math.round(100 * v / tot)])) };
      }),
      ridH: [0, 1, 2, 3, 4].map((k) => Y.ridH[0][k] + Y.ridH[1][k]), steamTot: Y.steamTot, steamHotEp: Y.steamHotEp,
      cpNear: [0, 1].map((t) => Y.cpNearN[t] ? Math.round(100 * Y.cpNear[t] / Y.cpNearN[t]) : null),
      deckInk: [0, 1].map((t) => { const h = Y.heldS[t][0] + Y.heldS[t][1] + Y.heldS[t][2]; return h ? Math.round(100 * Y.deckInk[t] / h) : null; }),
      hide: [0, 1].map((st) => { const r = Y.rideS[0][st] + Y.rideS[1][st]; return r ? Math.round(100 * (Y.hideS[0][st] + Y.hideS[1][st]) / r) : null; }),
      rideS: [0, 1].map((st) => Y.rideS[0][st] + Y.rideS[1][st]), rideDeaths: Y.rideDeaths, rideDeathsT: Y.rideDeathsT,
      rideDeathsPerMin: Y.riderS ? r2(Y.rideDeaths / (Y.riderS / 60)) : null,
      human: HUMAN ? { mode: HUMAN, upS: Y.humanUp, onS: Y.humanOn } : null, homingS: Y.homingS, homeOffEp: Y.homeOffEp, homeOffS: Y.homeOffS,
      line: [...tline.entries()].map(([a, s]) => ({ team: a.team, name: a.name, w: a.weaponId, human: !planned(a), s })) };
      if (T) Object.assign(res, {
        held: held.map((h) => +h.toFixed(1)), contested: +contested.toFixed(1), neutral: +neutral.toFixed(1),
        controlChanges: flips.filter((c, i) => i > 0 && flips[i - 1].owner !== c.owner).length, takes: flips.length, contests: ev.contest, idleNeutral: ev.idleNeutral,
        best: T.best.map((b) => +b.toFixed(1)), len: T.path.len.map((l) => +l.toFixed(1)), placeholder: T.placeholder,
        cpClear: [0, 1].map((t) => ev.cps.filter((c) => c.team === t && c.state === 'clear').length),
        cpReach: [0, 1].map((t) => ev.cps.filter((c) => c.team === t && c.state === 'reach').length),
        cpRefill: [0, 1].map((t) => ev.cps.filter((c) => c.team === t && c.state === 'refill').length),
        counts: st.count, score: st.score, winner: T.winner, reason: T.reason, overtime: st.overtime, overtimeT: st.overtimeT,
        ridersAvg: [0, 1].map((t) => +(riderSum[t] / Math.max(1, riderN[t])).toFixed(2)), mounts, dis, lastOff,
        emptyEp, emptyMax: +maxEmpty.toFixed(1), emptyLong: emptyLens.filter((l) => l > 2).length, emptyLens: emptyLens.sort((a, b) => b - a).slice(0, 6),
        emptyAvoid: emptyAvoid.length, emptyWipe,
        teams: [0, 1].map((t) => m.actors.filter((a) => a.team === t).map((a) => a.weaponId + (a.specialId ? '/' + a.specialId : '')).join(' ')),
        rideByKind: (() => { const o = {}; for (const a of m.actors) { const k = a.weapon.kind; o[k] = +((o[k] || 0) + (a.stats.towerRide || 0)).toFixed(0); } return o; })(),
        log: ev.control.map((c) => c.t + ':' + (c.owner < 0 ? 'N' : 'AB'[c.owner]) + '@' + c.s).join(' '),
        cplog: ev.cps.filter((c) => c.state !== 'reach').map((c) => c.t + ':' + 'AB'[c.team] + c.index + c.state[0]).join(' '),
      });
      return res;
    })()`);
    const wallS = ((Date.now() - t0) / 1000).toFixed(0);
    const perf = await js(`(() => { const p = window.__inkwave.perf; return p ? { cpuSimMs: +p.sim.toFixed(2) } : null; })()`);
    const W = (w) => (w === 0 ? 'Alpha' : w === 1 ? 'Bravo' : '-');
    console.log(`== ${MAP} [tower${r.placeholder ? ', stand-in path' : ''} len ${r.len.join('/')}]: winner ${W(r.winner)} (${r.reason}) | counts ${r.counts.join(' vs ')} (score ${r.score.join('/')}) | best push A ${r.best[0]}m B ${r.best[1]}m | OT ${r.overtime ? r.overtimeT + 's' : 'no'} | sim ${r.simT}s`);
    console.log(`   held A ${r.held[0]}s B ${r.held[1]}s | contested ${r.contested}s (${r.contests}×) | neutral ${r.neutral}s | control changes ${r.controlChanges} (takes ${r.takes}) | idle→neutral ${r.idleNeutral}`);
    console.log(`   checkpoints cleared A ${r.cpClear[0]} B ${r.cpClear[1]} (reached ${r.cpReach.join('/')}, refills ${r.cpRefill.join('/')}) | riders avg while held A ${r.ridersAvg[0]} B ${r.ridersAvg[1]} | mounts ${r.mounts.join('/')}`);
    console.log(`   left empty while held: ${r.emptyEp}× (>2 s: ${r.emptyLong}, of those with a teammate up within 15 m: ${r.emptyAvoid}; team wiped: ${r.emptyWipe}; longest ${r.emptyMax}s; ${JSON.stringify(r.emptyLens)}) | off the tower ${JSON.stringify(r.dis)}, last one off a held tower ${JSON.stringify(r.lastOff)}`);
    console.log(`   teams: A [${r.teams[0]}] | B [${r.teams[1]}] | ride s by kind ${JSON.stringify(r.rideByKind)}`);
    console.log(`   roles (% of bot-time) ${JSON.stringify(r.roles)} | riding ${r.ridePct}% | holding on purpose ${r.holdPct}%`);
    console.log(`   stuck ${r.stuckPct}% | by the tower's side ${r.sidePct}% of bot-time, stuck there ${r.sideStuckS}s (${r.sideStuckN} episodes) | splats ${r.splats} (water ${r.water}) | specials ${r.specials} (ready ${r.ready}) | super jumps ${r.jumps} | turf ${r.cov.join('/')} | sim ${r.simT}s in ${(r.simMs / 1000).toFixed(0)}s (wall ${wallS}s) | ${JSON.stringify(perf)}`);
    console.log('   control log ' + r.log);
    console.log('   checkpoint log ' + r.cplog);
    console.log('   X ' + JSON.stringify(r.x));
    for (const L of r.y.lvl) console.log(`   escort ${L.name}: held ${L.heldS}s | riders ${L.riders} | full steam ${L.steam}% | escort dist med ${L.escMed} p80 ${L.escP80}, along the track med ${L.escAlong} m | screening ${L.screen}% | fighting ${L.fight}% | our ink 2–12 m ahead ${L.inkAhead}% | place ${JSON.stringify(L.place)}`);
    console.log(`   escort: riders held-time by count 0–4 ${JSON.stringify(r.y.ridH)} | full steam total ${JSON.stringify(r.y.steamTot)}s, full-steam-while-hot episodes ${JSON.stringify(r.y.steamHotEp)} | escort by the next checkpoint ${JSON.stringify(r.y.cpNear)}% | deck ink ${JSON.stringify(r.y.deckInk)}% | riders hidden (threat / safe) ${JSON.stringify(r.y.hide)}% of ${JSON.stringify(r.y.rideS)} rider-s | deaths while riding ${r.y.rideDeaths} ${JSON.stringify(r.y.rideDeathsT)} = ${r.y.rideDeathsPerMin}/rider-min | rolling home ${JSON.stringify(r.y.homingS)}s, riders hopped off for it ${JSON.stringify(r.y.homeOffEp)}× (${JSON.stringify(r.y.homeOffS)}s)${r.y.human ? ' | human ' + JSON.stringify(r.y.human) : ''}`);
    for (const L of r.y.lvl) console.log(`   escort slots ${L.name}: ${JSON.stringify(L.slotPlace)} | painting escorts: goal along med ${L.dg.goalAlong} (p20 ${L.dg.goalP20}) vs them ${L.dg.posAlong}, arrived ${L.dg.arrived}%, fighting ${L.dg.fight}% of ${L.dg.n} ${JSON.stringify(L.dg.slot)}`);
    for (const l of r.y.line) console.log(`   roles ${'AB'[l.team]} ${(l.name + (l.human ? '*' : '') + '/' + l.w).padEnd(20)} ${l.s.slice(0, 150)}`);
    for (const e of r.eps) console.log('   stuck ' + JSON.stringify(e));
    for (const e of r.sideEps) console.log('   side-stuck ' + JSON.stringify(e));
    if (r.frameErr.n) console.log(`   FRAME ERRORS ${r.frameErr.n}: ${r.frameErr.msg}`);
    const uniq = [...new Set(logs)];
    console.log(`CONSOLE ${uniq.length} unique warning/error line(s)`); for (const l of uniq.slice(0, 20)) console.log('  ' + l);
    if (OUT) require('fs').writeFileSync(OUT, JSON.stringify(r));
    console.log('RESULT_JSON ' + JSON.stringify({ map: MAP, winner: r.winner, reason: r.reason, counts: r.counts, best: r.best, held: r.held, controlChanges: r.controlChanges, cpClear: r.cpClear, stuckPct: r.stuckPct, console: uniq.length, frameErrors: r.frameErr.n, mounts: r.mounts, ridersAvg: r.ridersAvg, x: r.x, sideStuckS: r.sideStuckS, splats: r.splats }));
    app.quit();
  });
});
