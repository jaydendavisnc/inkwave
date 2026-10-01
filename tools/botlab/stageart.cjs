// Botlab stage art: the stage-select pictures <id>-<day|dusk>.png from each layout's `art` camera, supersampled (SS, default 2)
// — convert afterwards: 1920×1080 → assets/stages/<id>-<time>.webp and a 480 px <id>-<time>-sm.webp (see assets/stages).
//   STAGES=nantai,craters OUT=/path/dir tools/botlab/run.sh tools/botlab/stageart.cjs
const { app } = require('electron');
const fs = require('fs');
require(process.env.S + '/offscreen-boot.cjs');
const IDS = (process.env.STAGES || 'halyard').split(',');
setTimeout(() => { console.log('WATCHDOG'); app.exit(1); }, 180000 + IDS.length * 330000);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let claimed = false;
app.on('browser-window-created', (_, win) => {
  if (claimed) return; claimed = true;
  let frame = null; win.webContents.on('paint', (_e, _d, img) => { frame = img; });
  win.webContents.once('did-finish-load', async () => {
    const SS = +(process.env.SS || 2); win.setContentSize(1920 * SS, 1080 * SS);   // supersampled; downscaled to 1920×1080 afterwards
    const js = (c) => win.webContents.executeJavaScript(c, true);
    for (let i = 0; i < 80; i++) { if (await js('!!window.__inkwave?.api')) break; await wait(250); }
    await js('window.__inkwave._onPointerUnlock = () => {}; 0');
    const out = process.env.OUT || (process.env.BOTLAB_ROOT || '.') + '/.botlab/stageart';
    fs.mkdirSync(out, { recursive: true });
    for (const id of IDS) for (const time of ['day', 'dusk']) {
      await js(`window.__inkwave.api.startMatch({ mapId: '${id}', duration: 180, time: '${time}' })`);
      // (a loaded machine can take a minute to build a long stage: wait for the round, and for the intro's fly-in to hand
      //  the camera back, before taking it — a shot taken early is the gameplay camera with the HUD up)
      for (let i = 0; i < 600; i++) { if (await js(`window.__inkwave.match?.state === 'playing' && window.__inkwave.rig?.mode !== 'path'`)) break; await wait(250); }
      await wait(2000);
      await js(`(async () => {
        const g = window.__inkwave, THREE = await import('three');
        g.debug.freeze();
        for (const a of g.match.actors) { a.character.setVisible(false); a.character.root.visible = false; }
        __G.projectiles.clear(); __G.paint.clear();
        __G.fx?.clear?.(); g.swimWake?.reset?.();   // (ink droplets / squid wakes from the intro: no stray specks in the art)
        g.hud?.setVisible(false); g.menus?.show(null);
        document.querySelectorAll('.iw-hud, .iw-ui, #fade').forEach((e) => { e.style.visibility = 'hidden'; });
        const B = __G.level.bounds, W = B.maxX - B.minX, D = B.maxZ - B.minZ;
        // an elevated three-quarter view across the stage, like the upstream stage art
        const CAMS = {};   // (per-stage overrides; Halyard's upstream framing moved into its layout's art camera with the Long Stages stretch)
        const { TEAM_PALETTES } = await import('./src/config.js'); const pal = TEAM_PALETTES.find((p) => p.id === 'tangerine-cobalt'); if (pal) g._setPalette(pal);
        const art = CAMS['${id}'] || (__G.level.layout && __G.level.layout.art);
        const from = art ? new THREE.Vector3(...art.from) : new THREE.Vector3(B.maxX + W * 0.08, Math.max(15, D * 0.2), B.minZ + D * 0.2);
        const look = art ? new THREE.Vector3(...art.look) : new THREE.Vector3(B.minX + W * 0.42, -1, B.minZ + D * 0.6);
        window.__fov0 = g.settings.fov; g.settings.fov = (art && art.fov) || 70;
        g.rig.cinematic(from, from, look, look, 99, () => {});
        g.debug.step(1000 / 60); g.rig.cinematic(from, from, look, look, 99, () => {}); g.debug.step(1000 / 60); g.debug.step(1000 / 60);
      })()`);
      await wait(1500);
      if (frame) fs.writeFileSync(`${out}/${id}-${time}.png`, frame.toPNG());   // (full supersampled frame)
      console.log('shot', id, time, frame ? frame.getSize() : null);
      await js(`window.__inkwave.settings.fov = window.__fov0 || window.__inkwave.settings.fov; window.__inkwave.debug.unfreeze(); document.querySelectorAll('.iw-hud, .iw-ui, #fade').forEach((e) => { e.style.visibility = ''; }); window.__inkwave.quitToMenu()`); await wait(1500);
    }
    app.quit();
  });
});
