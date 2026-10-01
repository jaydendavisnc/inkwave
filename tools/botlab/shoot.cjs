// Botlab shoot: offscreen screenshots of one stage + a load / perf / sanity report.
//   MAP=crossmarket TIME=day MODE=turf OUT=/path/dir SHOTS='top,art,spawnA,mid' tools/botlab/run.sh tools/botlab/shoot.cjs
// MODE: turf (default) / zones / tower — the zones' marks or the tower + its rail show in the pictures.
// SHOTS: comma list of presets (play = the player's own camera at spawn; top, art, intro, spawnA, spawnB, mid, aerialA, aerialB, sideL, sideR) and/or a JSON array
//   of custom cameras [{"name":"x","from":[x,y,z],"look":[x,y,z],"fov":70}] (fov = horizontal degrees, default 70).
// PLAY=secs lets the bot match run first (paint on the ground, shows what inks); ACTORS=1 keeps characters visible.
// W/H set the image size (default 1600x900). Prints console errors/warnings, then REPORT {...}.
// PRE=path/to/script.js: evaluated in the game page once the match is playing (after PLAY), before the pictures — set a
// scene up (grow sprout pods, pose characters …); it may step the sim itself (window.__inkwave.debug.step).
// PRE_ARGS (a string) reaches it as window.__preArgs (which view of a scene to stage, say).
// MAP=testbox / podbox: the botlab's test-only arenas (testmaps.cjs).
const { app } = require('electron');
const fs = require('fs');
require(process.env.S + '/offscreen-boot.cjs');
const { TEST_MAPS, defineTestMap } = require(process.env.S + '/testmaps.cjs');
const MAP = process.env.MAP || 'halyard', TIME = process.env.TIME || 'day', MODE = process.env.MODE || 'turf';
const OUT = process.env.OUT || (process.env.BOTLAB_ROOT || '.') + '/.botlab/shots';
const W = +(process.env.W || 1600), H = +(process.env.H || 900), PLAY = +(process.env.PLAY || 0);
const SHOTS = (() => { const s = process.env.SHOTS || 'top,art,spawnA,mid'; if (s.trim().startsWith('[')) return JSON.parse(s); const i = s.indexOf('['); if (i > 0) return [...s.slice(0, i).split(',').filter(Boolean), ...JSON.parse(s.slice(i))]; return s.split(',').filter(Boolean); })();
setTimeout(() => { console.log('WATCHDOG'); app.exit(1); }, 90000 + PLAY * 1000 + SHOTS.length * 8000);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let claimed = false;
app.on('browser-window-created', (_, win) => {
  if (claimed) return; claimed = true;
  const logs = [];
  win.webContents.on('console-message', (e) => { const m = String(e.message); if (/error|warn/i.test(String(e.level)) && !/Security Warning|Autofill/.test(m)) logs.push(`[${e.level}] ${m.slice(0, 300)}`); });
  let frame = null; win.webContents.on('paint', (_e, _d, img) => { frame = img; });
  win.webContents.once('did-finish-load', async () => {
    win.setContentSize(W, H);
    const js = (c) => win.webContents.executeJavaScript(c, true);
    for (let i = 0; i < 120; i++) { if (await js('!!window.__inkwave?.api')) break; await wait(250); }
    await js('window.__inkwave._onPointerUnlock = () => {}; 0');
    fs.mkdirSync(OUT, { recursive: true });
    const t0 = Date.now();
    if (TEST_MAPS.includes(MAP)) await js(defineTestMap(MAP));   // (a test-only arena)
    await js(`window.__inkwave.api.startMatch({ mapId: '${MAP}', duration: 180, time: '${TIME}', mode: '${MODE}' })`);
    { const got = await js(`(window.__inkwave.mapDef && window.__inkwave.mapDef.id) || null`); if (got !== MAP) { console.log(`MAP MISMATCH: asked for ${MAP}, the game built ${got} (a stage missing from MAPS falls back to the first one)`); app.exit(3); return; } }   // (never test the wrong stage silently)
    for (let i = 0; i < 240; i++) { if (await js(`window.__inkwave.match?.state === 'playing'`)) break; await wait(250); }
    const loadMs = Date.now() - t0;
    if (PLAY) await wait(PLAY * 1000);
    else await wait(3000);
    if (process.env.PRE) { try { await js(`window.__preArgs = ${JSON.stringify(process.env.PRE_ARGS || '')}; 0`); const r = await js(fs.readFileSync(process.env.PRE, 'utf8')); console.log('PRE', JSON.stringify(r)); } catch (e) { console.log('PRE ERROR', e.message); } }
    const rep = await js(`(() => {
      const g = window.__inkwave, L = __G.level, B = L.bounds;
      let top = 0, wall = 0; for (const f of L.faces) { if (f.noPaint) continue; const a = (f.w || 0) * (f.h || 0); }
      const cov = __G.paint.coverage ? __G.paint.coverage() : null;
      return { map: '${MAP}', mode: '${MODE}', time: '${TIME}', loadMs: ${loadMs}, blocks: L.blocks.length, solidBlocks: L.blocks.filter(b => b.solid).length,
        propMeshes: g.props ? g.props.group?.children?.length ?? null : null, navNodes: __G.nav?.nodes?.length,
        bounds: B, perf: g.perf ? { calls: g.perf.calls, tris: g.perf.tris, cpuRenderMs: +g.perf.render.toFixed(2), cpuSimMs: +g.perf.sim.toFixed(2) } : null,
        coverage: cov && cov.map(c => +(c * 100).toFixed(1)) };
    })()`);
    await js(`(async () => {
      const g = window.__inkwave;
      g.debug.freeze();
      if (!${!!process.env.ACTORS}) { for (const a of g.match.actors) { a.character.setVisible(false); a.character.root.visible = false; } __G.projectiles.clear(); }
      if (!${PLAY}) __G.paint.clear();
      g.hud?.setVisible(false); g.menus?.show(null);
      document.querySelectorAll('.iw-hud, .iw-ui, #fade').forEach((e) => { e.style.visibility = 'hidden'; });
      window.__fov0 = g.settings.fov;
    })()`);
    for (const s of SHOTS) {
      const spec = typeof s === 'string' ? { name: s, preset: s } : s;
      if (spec.preset === 'play') {
        // the player's own camera at the spawn (the normal gameplay rig, the local kid standing on the pad, turned
        // toward mid by the match start): run the sim 1.5 s, then capture
        await js(`(() => { const g = window.__inkwave, me = g.match.local; g.settings.fov = window.__fov0; me.character.root.visible = true; me.character.setVisible?.(true); g.rig.follow(me, true); g.debug.unfreeze(); return 1; })()`);   // (back to the follow rig after any cinematic shot)
        await wait(1500);
        await js(`window.__inkwave.debug.freeze(); 0`); await wait(400);
        const f = `${OUT}/${MAP}-${MODE === 'turf' ? '' : MODE + '-'}${TIME}-play.png`;
        if (frame) fs.writeFileSync(f, frame.toPNG());
        console.log('shot', f);
        continue;
      }
      const ok = await js(`(async () => {
        const g = window.__inkwave, THREE = await import('three'), L = __G.level, B = L.bounds, lay = L.layout || {};
        const W = B.maxX - B.minX, D = B.maxZ - B.minZ, sp = lay.spawnPads || [[0, 2, B.minZ + 4], [0, 2, B.maxZ - 4]];
        const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
        const P = ${JSON.stringify(spec)};
        let from, look, fov = P.fov || 70;
        const topH = Math.max((D / 2) / (Math.tan(35 * Math.PI / 360) * 1.0) * 1.04, (W / 2) / (Math.tan(35 * Math.PI / 360) / (16 / 9)) * 1.04);
        switch (P.preset) {
          case 'top': from = [-0.02, topH, 0]; look = [0, 0, 0]; fov = 35; break;
          case 'art': if (lay.art) { from = lay.art.from; look = lay.art.look; fov = lay.art.fov || 70; } else { from = [B.maxX + W * 0.08, Math.max(15, D * 0.2), B.minZ + D * 0.2]; look = [B.minX + W * 0.42, -1, B.minZ + D * 0.6]; } break;
          case 'intro': { const it = lay.intro || { from: [7, 12.5, 11], lookFrom: [0, 2.8, -1] }; from = it.from; look = it.lookFrom; break; }
          case 'spawnA': from = [sp[0][0], sp[0][1] + 1.7, sp[0][2]]; look = [sp[0][0] * 0.3, sp[0][1] - 1.5, 0]; fov = 82; break;
          case 'spawnB': from = [sp[1][0], sp[1][1] + 1.7, sp[1][2]]; look = [sp[1][0] * 0.3, sp[1][1] - 1.5, 0]; fov = 82; break;
          case 'mid': from = [W * 0.08, 7, -D * 0.2]; look = [0, 1, D * 0.08]; fov = 82; break;
          case 'aerialA': from = [W * 0.15, D * 0.32, B.minZ - D * 0.12]; look = [0, 0, -D * 0.05]; break;
          case 'aerialB': from = [-W * 0.15, D * 0.32, B.maxZ + D * 0.12]; look = [0, 0, D * 0.05]; break;
          case 'sideL': from = [B.minX - W * 0.55, D * 0.22, 0]; look = [0, 0, 0]; break;
          case 'sideR': from = [B.maxX + W * 0.55, D * 0.22, 0]; look = [0, 0, 0]; break;
          default: from = P.from; look = P.look;
        }
        if (!from || !look) return 'bad shot ' + JSON.stringify(P);
        g.settings.fov = fov;
        g.rig.cinematic(V(from), V(from), V(look), V(look), 99, () => {});
        for (let i = 0; i < 4; i++) g.debug.step(1000 / 60);
        return true;
      })()`);
      if (ok !== true) { console.log('SHOT FAIL', ok); continue; }
      await wait(1100);
      await js(`window.__inkwave.debug.step(1000 / 60)`); await wait(400);
      const f = `${OUT}/${MAP}-${MODE === 'turf' ? '' : MODE + '-'}${TIME}-${spec.name}.png`;
      if (frame) fs.writeFileSync(f, frame.toPNG());
      console.log('shot', f);
    }
    await js(`window.__inkwave.settings.fov = window.__fov0; 0`);
    console.log('REPORT ' + JSON.stringify(rep));
    const uniq = [...new Set(logs)];
    console.log(`CONSOLE ${uniq.length} unique warning/error line(s)`); for (const l of uniq.slice(0, 30)) console.log('  ' + l);
    app.quit();
  });
});
