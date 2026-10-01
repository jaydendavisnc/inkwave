// Botlab HUD shots: offscreen pictures of a live match WITH the HUD (shoot.cjs hides it). Boots a match, lets the bots
// play PLAY s (ink on the ground), freezes, then runs SCENES — a script evaluated in the page that fills
// window.__hudScenes = [{ name, set: async () => …, moment?: () => …, wait?: ms }] — and captures each scene: the full
// frame and a crop of the top bar (CROP = 'x,y,w,h' as fractions of the frame; default the top quarter).
// set() drives the state (debug.step etc.), then the roster groups' size transitions settle (src/ui/hud-lead.js); moment()
// (optional) starts a short animation, and the capture comes `wait` ms after the next painted frames (the stepped sim
// holds painting back, so a burst started inside set() would be over before its first frame reaches the capture).
//   MAP=halyard TIME=day MODE=turf SCENES=tools/botlab/tests/hud-lead-scenes.js OUT=/dir tools/botlab/run.sh tools/botlab/hud-shots.cjs
const { app } = require('electron');
const fs = require('fs');
require(process.env.S + '/offscreen-boot.cjs');
const MAP = process.env.MAP || 'halyard', TIME = process.env.TIME || 'day', MODE = process.env.MODE || 'turf';
const OUT = process.env.OUT || (process.env.BOTLAB_ROOT || '.') + '/.botlab/hudshots';
const W = +(process.env.W || 1600), H = +(process.env.H || 900), PLAY = +(process.env.PLAY || 8);
const CROP = (process.env.CROP || '0,0,1,0.25').split(',').map(Number);
setTimeout(() => { console.log('WATCHDOG'); app.exit(1); setTimeout(() => process.exit(1), 3000); }, +(process.env.WATCHDOG || 400000));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let claimed = false;
app.on('browser-window-created', (_, win) => {
  if (claimed) return; claimed = true;
  win.webContents.setBackgroundThrottling(false);
  const logs = [];
  win.webContents.on('console-message', (e) => { const m = String(e.message); if (/error|warn/i.test(String(e.level)) && !/Security Warning|Autofill/.test(m)) logs.push(`[${e.level}] ${m.slice(0, 300)}`); });
  let frame = null, paints = 0; win.webContents.on('paint', (_e, _d, img) => { frame = img; paints++; });
  let started = false;
  win.webContents.on('did-finish-load', async () => {
    if (started) return; started = true;
    await win.loadURL('app://inkwave/index.html?autopilot');
    win.setContentSize(W, H);
    const js = (c) => win.webContents.executeJavaScript(c, true);
    for (let i = 0; i < 120; i++) { if (await js('!!window.__inkwave?.api')) break; await wait(250); }
    await js('window.__inkwave._onPointerUnlock = () => {}; 0');
    fs.mkdirSync(OUT, { recursive: true });
    await js(`window.__inkwave.api.startMatch({ mapId: '${MAP}', duration: 180, time: '${TIME}', mode: '${MODE}' })`);
    for (let i = 0; i < 240; i++) { if (await js(`window.__inkwave.match?.state === 'playing'`)) break; await wait(250); }
    await wait(PLAY * 1000);
    let scenes = [];
    try { scenes = await js(fs.readFileSync(process.env.SCENES, 'utf8')); } catch (e) { console.log('SCENES ERROR', e.message); }
    const tag = `${MAP}-${MODE}-${TIME}`;
    for (let i = 0; i < scenes.length; i++) {
      const name = scenes[i].name;
      let r;
      try {
        r = await js(`(async () => { const s = window.__hudScenes[${i}]; const info = await s.set(); const hud = window.__inkwave.hud;
          const want = (sq) => (sq.classList.contains('is-grow') ? 1.18 : sq.classList.contains('is-shrink') ? 0.86 : 1);
          for (let k = 0; k < 60; k++) { await new Promise((q) => requestAnimationFrame(() => setTimeout(q, 60)));
            if (k >= 8 && hud.squads.every((sq) => Math.abs((+getComputedStyle(sq).scale || 1) - want(sq)) < 0.004)) break; }
          if (s.moment) s.moment();
          return { info, wait: s.wait }; })()`);
      } catch (e) { console.log('SCENE FAIL', name, e.message); continue; }
      // a fresh composited frame first (the stepped sim blocks painting), then the scene's moment (its animations start
      // with that frame)
      const p0 = paints;
      for (let k = 0; k < 150 && paints < p0 + 2; k++) await wait(20);
      await wait(r && r.wait ? r.wait : 80);
      r = r && r.info;
      if (!frame) { console.log('no frame for', name); continue; }
      const img = frame, sz = img.getSize();
      const full = `${OUT}/${tag}-${name}.png`, top = `${OUT}/${tag}-${name}-top.png`;
      fs.writeFileSync(full, img.toPNG());
      const c = { x: Math.round(CROP[0] * sz.width), y: Math.round(CROP[1] * sz.height), width: Math.round(CROP[2] * sz.width), height: Math.round(CROP[3] * sz.height) };
      fs.writeFileSync(top, img.crop(c).toPNG());
      console.log('shot', name, JSON.stringify(r || null), top);
    }
    const uniq = [...new Set(logs)];
    console.log(`CONSOLE ${uniq.length} unique warning/error line(s)`); for (const l of uniq.slice(0, 20)) console.log('  ' + l);
    app.quit();
  });
});
