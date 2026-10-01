// Tower Command track check on one stage: the track the engine builds from the stage's layout.tower (src/world/
// tower-data.js) — or a trial one — audited, ridden and photographed.
//   MAP=halyard tools/botlab/run.sh tools/botlab/tower-check.cjs
//   env: OUT=dir (PNGs + <map>-track.json; default .botlab/tower-check), TOWER_DEF='{"path":[[x,z],…],…}' (try a track
//        without editing tower-data.js), SHOTS=0 (no pictures), RIDE=0 (no ride test)
// Prints: both sides' tracks (runs, inclines, climbs, drops), holes (no floor under the platform), clearance problems
// (anything solid inside the tower or its riders' headroom; the platform floating over the floor), the rail, the
// checkpoints, and a stepped ride test per team (two riders from the centre to the goal: time, riders knocked off,
// stalls). Pictures: <map>-top.png (the whole stage from above, the rail lit) and <map>-NN-<what>.png looking at every
// climb, drop, corner, checkpoint and goal on Alpha's side (Bravo's is the mirror).
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
require(process.env.S + '/offscreen-boot.cjs');
setTimeout(() => { console.log('WATCHDOG'); app.exit(1); setTimeout(() => process.exit(1), 3000); }, +(process.env.WATCHDOG || 540000));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MAP = process.env.MAP || 'halyard';
const OUT = process.env.OUT || path.join(process.env.BOTLAB_ROOT || '.', '.botlab', 'tower-check');
const SHOTS = process.env.SHOTS !== '0', RIDE = process.env.RIDE !== '0';
let claimed = false;
app.on('browser-window-created', (_, win) => {
  if (claimed) return; claimed = true;
  win.webContents.setBackgroundThrottling(false);
  let frame = null; win.webContents.on('paint', (_e, _d, img) => { frame = img; });
  const errs = [];
  win.webContents.on('console-message', (e) => { const m = String(e.message); if (/error/i.test(String(e.level)) || /TypeError|ReferenceError/.test(m)) errs.push(m.slice(0, 300)); });
  let started = false;
  win.webContents.on('did-finish-load', async () => {
    if (started) return; started = true;
    await win.loadURL('app://inkwave/index.html?autopilot');
    const js = (c) => win.webContents.executeJavaScript(c, true);
    for (let i = 0; i < 120; i++) { if (await js('!!window.__inkwave?.api')) break; await wait(250); }
    await js('window.__inkwave._onPointerUnlock = () => {}; 0');
    fs.mkdirSync(OUT, { recursive: true });
    if (process.env.TOWER_DEF) await js(`(async () => { const { MAP_LAYOUTS } = await import('./src/world/maps.js'); MAP_LAYOUTS['${MAP}'].tower = ${process.env.TOWER_DEF}; return 1; })()`);
    const start = async () => {
      await js(`window.__inkwave.debug.unfreeze(); window.__inkwave.api.startMatch({ mapId: '${MAP}', time: 'day', mode: 'tower' })`);
      { const got = await js(`(window.__inkwave.mapDef && window.__inkwave.mapDef.id) || null`); if (got !== MAP) { console.log(`MAP MISMATCH: asked for ${MAP}, the game built ${got} (a stage missing from MAPS falls back to the first one)`); app.exit(3); return; } }   // (never test the wrong stage silently)
      for (let i = 0; i < 240; i++) { if (await js(`window.__inkwave.match?.state === 'playing' && !!window.__inkwave.match.tower`)) break; await wait(250); }
    };
    await start();
    // ---------------------------------------------------------------- the track
    const rep = await js(`(async () => {
      const g = window.__inkwave, m = g.match, T = m.tower, P = T.path, L = __G.level, { TOWER } = await import('./src/config.js');
      g.debug.freeze();
      const { TOWER_HEAD } = await import('./src/game/tower.js');
      const R = TOWER.platformR, HEAD = TOWER_HEAD, r2 = (v) => Math.round(v * 100) / 100;
      const col = (x, z) => { const out = []; for (const id of L.queryBlocks(x - 0.01, z - 0.01, x + 0.01, z + 0.01, [])) { const b = L.blocks[id]; if (!b || !b.solid || b.dynamic) continue;
        let lo = -Infinity, hi = Infinity, ok = true;
        for (let k = 0; k < 3 && ok; k++) { const a = b.axes[k], h = k === 0 ? b.half.x : k === 1 ? b.half.y : b.half.z, c = a.x * (x - b.center.x) + a.z * (z - b.center.z) - a.y * b.center.y;
          if (Math.abs(a.y) < 1e-6) { if (Math.abs(c) > h) ok = false; continue; } let t0 = (-h - c) / a.y, t1 = (h - c) / a.y; if (t0 > t1) [t0, t1] = [t1, t0]; lo = Math.max(lo, t0); hi = Math.min(hi, t1); }
        if (ok && hi > lo) out.push({ lo, hi, id, tag: b.tag || b.kind || '', mat: b.surface || b.mat || '' }); } return out; };
      const cy = Math.cos(T.yaw), sy = Math.sin(T.yaw);
      const foot = (x, z, fn) => { for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const lx = i / 2 * (R - 0.04), lz = j / 2 * (R - 0.04); fn(x + lx * cy + lz * sy, z - lx * sy + lz * cy); } };
      // what a climb goes up onto: the solid(s) whose top is the new height, just ahead under the platform
      const onto = (S, i) => {
        const a = S.pts[i], b = S.pts[i + 1], nx = S.pts[i + 2] || b, dx = nx.x - b.x, dz = nx.z - b.z, l = Math.hypot(dx, dz) || 1;
        const found = new Map();
        foot(b.x + dx / l * 0.3, b.z + dz / l * 0.3, (x, z) => { for (const c of col(x, z)) if (Math.abs(c.hi - b.y) < 0.03 && !found.has(c.id)) found.set(c.id, c); });
        return [...found.values()].slice(0, 3).map((c) => { const B = L.blocks[c.id];
          return { id: c.id, tag: B.tag || undefined, prop: B.hidden && !B.rail ? true : undefined, rail: B.rail || undefined, centre: [r2(B.center.x), r2(B.center.y), r2(B.center.z)], size: [r2(B.half.x * 2), r2(B.half.y * 2), r2(B.half.z * 2)] }; });
      };
      const sides = P.sides.map((S, t) => {
        const segs = [];
        for (let i = 0; i < S.pts.length - 1; i++) {
          const a = S.pts[i], b = S.pts[i + 1], h = Math.hypot(b.x - a.x, b.z - a.z), dy = b.y - a.y;
          const kind = h < 1e-3 ? (dy > 0 ? 'CLIMB' : 'DROP') : Math.abs(dy) < 0.05 ? 'run' : 'incline';
          if (kind === 'CLIMB') segs.push({ kind, onto: onto(S, i), from: [r2(a.x), r2(a.y), r2(a.z)], to: [r2(b.x), r2(b.y), r2(b.z)], len: 0, dy: r2(dy), s: r2(S.cum[i]), slopeDeg: 90 });
          else segs.push({ kind, from: [r2(a.x), r2(a.y), r2(a.z)], to: [r2(b.x), r2(b.y), r2(b.z)], len: r2(h), dy: r2(dy), s: r2(S.cum[i]), slopeDeg: h > 1e-3 ? Math.round(Math.atan2(Math.abs(dy), h) * 180 / Math.PI) : 90 });
        }
        return { team: t, len: r2(S.len), segs };
      });
      // clearance audit every 0.25 m: solids inside the platform (base..+0.8) or its riders' headroom (..+HEAD); gap under it
      const issues = [];
      const vertical = (s) => { const S = P.sides[s >= 0 ? 0 : 1], d = Math.abs(s), i = Math.min(S._seg(d), S.pts.length - 2), a = S.pts[i], b = S.pts[i + 1]; return Math.hypot(b.x - a.x, b.z - a.z) < 1e-3; };
      for (let s = -P.len[1]; s <= P.len[0]; s += 0.25) {
        if (vertical(s)) continue;                         // (mid-climb / mid-drop: in the air by design)
        const p = P.at(s); let body = null, head = null, floor = -Infinity;
        foot(p.x, p.z, (x, z) => { for (const c of col(x, z)) {
          if (c.hi <= p.y + 0.05 && c.hi > floor) floor = c.hi;
          if (c.lo < p.y + 0.8 && c.hi > p.y + 0.05) body = body || c; else if (c.lo < p.y + HEAD && c.hi > p.y + 0.05) head = head || c; } });
        const gap = p.y - floor;
        const bad = body ? 'solid inside the tower' : head ? 'headroom < ' + HEAD + ' m' : gap > 0.35 ? 'floating ' + r2(gap) + ' m over the floor' : null;
        if (bad) { const last = issues[issues.length - 1];
          if (last && last.what === bad && s - last.s1 < 0.3) last.s1 = r2(s);
          else issues.push({ what: bad, s0: r2(s), s1: r2(s), at: [r2(p.x), r2(p.y), r2(p.z)], block: (body || head) ? { id: (body || head).id, tag: (body || head).tag, lo: r2((body || head).lo), hi: r2((body || head).hi) } : undefined }); }
      }
      const cps = T.cps.map((c) => { const p = P.at(c.team ? -c.d : c.d); return { team: c.team, index: c.index, d: r2(c.d), dur: r2(c.dur), at: [r2(p.x), r2(p.y), r2(p.z)] }; });
      return { map: '${MAP}', placeholder: T.placeholder, yawDeg: r2(T.yaw * 180 / Math.PI), len: P.len.map(r2), holes: P.holes, speed: T.speed.map(r2),
        goalSecs1: P.len.map((l, t) => r2(l / T.speed[t] + T.cps.filter((c) => c.team === t).reduce((a, c) => a + c.dur, 0))), sides, issues, cps,
        rail: P.rail().length, pad: L.spawnPads.map((p) => [r2(p.x), r2(p.y), r2(p.z)]) };
    })()`);
    // ---------------------------------------------------------------- ride test (two riders each way, stepped)
    const rides = [];
    if (RIDE) for (const team of [0, 1]) {
      if (team === 1) await start();
      rides.push(await js(`(async () => {
        const g = window.__inkwave, m = g.match, T = m.tower, { TOWER } = await import('./src/config.js');
        g.debug.freeze();
        const K = ${+(process.env.RIDEK || 1)};   // real speed by default (RIDEK=8 for a quick look: much faster and a rider can be left behind at a drop)
        T.speed = T.speed.map((v) => v * K); for (const c of T.cps) { c.dur /= K; c.left /= K; }
        for (const a of m.actors) if (a.bot) a.bot.update = () => { a.intent.move.set(0, 0, 0); a.intent.fire = a.intent.squid = a.intent.jump = a.intent.sub = a.intent.special = false; };
        const riders = m.actors.filter((a) => a.team === ${team} && !a.isLocal).slice(0, 2);
        const others = m.actors.filter((a) => !riders.includes(a));
        for (const a of others) { const p = __G.level.spawnPads[a.team]; a.pos.set(p.x, p.y + 0.3, p.z); a.vel.set(0, 0, 0); }
        const put = (a, i) => { a.pos.set(T.pos.x + (i ? 0.8 : -0.8), T.top + 0.05, T.pos.z); a.vel.set(0, 0, 0); };   // (either side of the pillar)
        riders.forEach(put);
        const log = { team: ${team}, drops: [], stalls: [], t: 0, end: null, minTop: 99, maxAbove: 0 };
        let lastS = T.s, still = 0, stalled = false, t = 0;
        while (t < 240 && T.winner == null) {
          g.debug.step(1000 / 60); t += 1 / 60;
          for (const a of others) { const p = __G.level.spawnPads[a.team]; a.pos.set(p.x, p.y + 0.3, p.z); a.vel.set(0, 0, 0); }
          riders.forEach((a, i) => {
            if (!a.alive) { log.drops.push({ i, s: +T.s.toFixed(2), why: 'splatted', t: +t.toFixed(2) }); return; }
            const dy = a.pos.y - T.top, dx = a.pos.x - T.pos.x, dz = a.pos.z - T.pos.z;
            if (dy < -0.3 || dy > 2 || Math.hypot(dx, dz) > 1.9) { log.drops.push({ i, s: +T.s.toFixed(2), why: 'off', dy: +dy.toFixed(2), dxz: +Math.hypot(dx, dz).toFixed(2), y: +T.pos.y.toFixed(2), t: +t.toFixed(2) }); put(a, i); }
            else { log.maxAbove = Math.max(log.maxAbove, +dy.toFixed(2)); }
          });
          const cp = T.cps.find((c) => c.team === ${team} && !c.cleared && Math.abs(Math.abs(T.s) - c.d) < 0.05);
          if (Math.abs(T.s - lastS) < 1e-5 && !cp) { still += 1 / 60; if (still > 1 && !stalled) { log.stalls.push({ s: +T.s.toFixed(2), t: +t.toFixed(2), owner: T.owner, riders: [...T.riders] }); stalled = true; } }
          else { still = 0; stalled = false; }
          lastS = T.s;
        }
        log.t = +(t * K).toFixed(1); log.end = { winner: T.winner, reason: T.reason, s: +T.s.toFixed(2), count: [...T.count], simSecs: +t.toFixed(1) };
        if (log.drops.length > 12) log.drops = [...log.drops.slice(0, 12), { more: log.drops.length - 12 }];
        return log;
      })()`));
    }
    // ---------------------------------------------------------------- pictures
    const shots = [];
    if (SHOTS) {
      await start();
      await wait(2500);                                         // (let the intro fly-through finish: it owns the camera)
      const W = 2400, H = 1350;
      win.setContentSize(W, H); await wait(600);
      const setup = await js(`(async () => {
        const g = window.__inkwave, m = g.match, T = m.tower, P = T.path, THREE = await import('three');
        g.debug.freeze();
        // everyone hidden where they stand (moving them off the stage splats them: a splatted local player puts the camera
        // into spectate and draws the splatted-screen overlay over the pictures)
        for (const a of m.actors) { a.character.setVisible(false); a.character.root.visible = false; }
        __G.projectiles?.clear?.(); __G.paint.clear(); __G.fx?.clear?.();
        g.hud?.setVisible(false); g.menus?.show(null);
        document.querySelectorAll('.iw-hud, .iw-ui, #fade').forEach((e) => { e.style.visibility = 'hidden'; });
        if (__G.scene.fog) { __G.scene.fog.near = 5000; __G.scene.fog.far = 9000; }
        T.owner = 0;                                           // the rail lit in Alpha's ink from the centre to its first stop
        // (settings.fov is the horizontal field of view)
        window.__shot = (from, look, fov) => { g.settings.fov = fov; const f = new THREE.Vector3(...from), l = new THREE.Vector3(...look); g.rig.cinematic(f, f, l, l, 99, () => {});
          g.rig._prevMode = 'path'; if (g.rig.blend) g.rig.blend.active = false;   // no pose blend from whatever the camera did before
          for (let i = 0; i < 4; i++) g.debug.step(1000 / 60); const cam = __G.camera; cam.near = 0.2; cam.far = 4000; cam.updateProjectionMatrix(); g.debug.step(1000 / 60); return 1; };
        const B = __G.level.bounds, Dz = B.maxZ - B.minZ, Dx = B.maxX - B.minX, th = Math.tan(9 * Math.PI / 360), tv = th / (${W} / ${H});
        const h = Math.max((Dz / 2 + 4) / th, (Dx / 2 + 4) / tv);
        window.__shot([-0.001, h, 0], [0, 0, 0], 9); __G.camera.near = Math.max(1, h - 80); __G.camera.far = h + 80; __G.camera.updateProjectionMatrix(); g.debug.step(1000 / 60);
        // points of interest on Alpha's side: climbs, drops, corners, checkpoints, the goal
        const S = P.sides[0], poi = [];
        for (let i = 0; i < S.pts.length - 1; i++) { const a = S.pts[i], b = S.pts[i + 1], hz = Math.hypot(b.x - a.x, b.z - a.z);
          if (hz < 1e-3) poi.push({ s: S.cum[i], what: b.y > a.y ? 'climb' : 'drop' });
          else if (i > 0) { const p = S.pts[i - 1], h0 = Math.hypot(a.x - p.x, a.z - p.z); if (h0 > 1e-3) { const c = ((a.x - p.x) * (b.x - a.x) + (a.z - p.z) * (b.z - a.z)) / (h0 * hz); if (c < 0.95) poi.push({ s: S.cum[i], what: 'corner' }); } } }
        for (const c of T.cps) if (c.team === 0) poi.push({ s: c.d, what: 'checkpoint' + (c.index + 1) });
        poi.push({ s: P.len[0], what: 'goal' });
        poi.sort((a, b) => a.s - b.s);
        const keep = []; for (const p of poi) if (!keep.length || p.s - keep[keep.length - 1].s > 1.5 || p.what.startsWith('check') || p.what === 'goal') keep.push(p);
        return { poi: keep.slice(0, 16).map((p) => ({ ...p, s: +p.s.toFixed(2) })) };
      })()`);
      await wait(1500);
      await js(`(() => { const B = __G.level.bounds, Dz = B.maxZ - B.minZ, Dx = B.maxX - B.minX, th = Math.tan(9 * Math.PI / 360), tv = th / (${W} / ${H});
        const h = Math.max((Dz / 2 + 4) / th, (Dx / 2 + 4) / tv); window.__shot([-0.001, h, 0], [0, 0, 0], 9);
        __G.camera.near = Math.max(1, h - 80); __G.camera.far = h + 80; __G.camera.updateProjectionMatrix(); window.__inkwave.debug.step(1000 / 60); return 1; })()`);
      await wait(500);
      if (process.env.DEBUG_TOP) console.log('TOPCAM', JSON.stringify(await js(`(() => { const c = __G.camera, r = window.__inkwave.rig; return { pos: c.position.toArray().map((v) => +v.toFixed(1)), fov: c.fov, near: c.near, far: c.far, mode: r && (r.mode || r.state), path: !!(r && r.path), frozen: window.__inkwave.frozen, st: window.__inkwave.match.state, settingsFov: window.__inkwave.settings.fov }; })()`)));
      if (frame) { fs.writeFileSync(path.join(OUT, `${MAP}-top.png`), frame.toPNG()); shots.push(`${MAP}-top.png`); }
      win.setContentSize(1600, 900); await wait(600);
      let n = 0;
      for (const p of setup.poi) {
        n++;
        // the tower parked just before the spot; the camera behind and above it, looking along the track at the spot
        await js(`(() => { const T = window.__inkwave.match.tower, P = T.path, s = ${p.s};
          T.s = Math.max(0, s - (${JSON.stringify(p.what)} === 'goal' ? 3 : 1.6)); T._place(); T.owner = 0;
          const at = P.at(s), d = P.dir(Math.max(0.01, s - 0.5)), back = 7.5, side = 2.5;
          window.__shot([at.x - d.x * back - d.z * side, at.y + 4.2, at.z - d.z * back + d.x * side], [at.x + d.x * 1.5, at.y + 0.8, at.z + d.z * 1.5], 60); return 1; })()`);
        await wait(700); await js('window.__inkwave.debug.step(1000 / 60)'); await wait(350);
        const name = `${MAP}-${String(n).padStart(2, '0')}-${p.what}-s${Math.round(p.s)}.png`;
        if (frame) { fs.writeFileSync(path.join(OUT, name), frame.toPNG()); shots.push(name); }
      }
    }
    // ---------------------------------------------------------------- report
    const r = rep;
    console.log(`== ${MAP} tower track${r.placeholder ? ' (STAND-IN: no drawn path)' : ''} · heading ${r.yawDeg}° · length ${r.len[0]} / ${r.len[1]} m (Alpha's / Bravo's side) · speed ${r.speed[0]} m/s at 1 rider · to the goal ≈ ${r.goalSecs1[0]} s with checkpoints`);
    for (const S of r.sides) {
      const cnt = (k) => S.segs.filter((g) => g.kind === k).length;
      console.log(`   side ${S.team ? 'Bravo (s<0), the mirror — pieces in the JSON' : 'Alpha (s>0)'}: ${S.segs.length} pieces · ${cnt('run')} runs, ${cnt('incline')} inclines, ${cnt('CLIMB')} climbs, ${cnt('DROP')} drops · ${S.len} m`);
      for (const g of S.team ? [] : S.segs) console.log(`     ${g.kind.padEnd(8)} s=${String(g.s).padStart(6)}  ${JSON.stringify(g.from)} → ${JSON.stringify(g.to)}  ${g.kind === 'run' || g.kind === 'incline' ? g.len + ' m' : ''}${g.kind === 'incline' ? ' ' + g.slopeDeg + '°' : ''}${g.kind === 'CLIMB' || g.kind === 'DROP' ? g.dy + ' m' : ''}${g.onto ? '  onto ' + JSON.stringify(g.onto) : ''}`);
    }
    console.log(`   checkpoints ${JSON.stringify(r.cps)}`);
    console.log(`   holes (no floor under the platform): ${r.holes.length ? JSON.stringify(r.holes.slice(0, 20)) + (r.holes.length > 20 ? ` … ${r.holes.length}` : '') : 'none'}`);
    console.log(`   clearance: ${r.issues.length ? '' : 'clean'}`);
    for (const i of r.issues.slice(0, 30)) console.log(`     ${i.what} at s ${i.s0}…${i.s1} ${JSON.stringify(i.at)}${i.block ? ' block ' + JSON.stringify(i.block) : ''}`);
    for (const d of rides) console.log(`   ride ${d.team ? 'Bravo' : 'Alpha'}: ${d.end.reason || 'no end'} (winner ${d.end.winner}) at s ${d.end.s} after ${d.t} s (real speed) · riders knocked off ${d.drops.length} ${d.drops.length ? JSON.stringify(d.drops) : ''} · stalls ${d.stalls.length ? JSON.stringify(d.stalls) : 'none'} · max rider height over the top ${d.maxAbove} m`);
    if (shots.length) console.log(`   pictures (${OUT}): ${shots.join(', ')}`);
    console.log('   console errors:', errs.length ? [...new Set(errs)].slice(0, 5).join(' || ') : 'none');
    fs.writeFileSync(path.join(OUT, `${MAP}-track.json`), JSON.stringify({ ...r, rides, shots }, null, 1));
    console.log('RESULT_JSON ' + JSON.stringify({ map: MAP, len: r.len, holes: r.holes.length, issues: r.issues.length, climbs: r.sides[0].segs.filter((g) => g.kind === 'CLIMB').length, drops: r.sides[0].segs.filter((g) => g.kind === 'DROP').length, rides: rides.map((d) => ({ reason: d.end.reason, drops: d.drops.length, stalls: d.stalls.length })) }));
    app.quit();
  });
});
