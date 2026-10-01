// Botlab: the main menu's QUIT GAME (desktop app only) — the button is there, its confirmation opens and cancels, and
// confirming quits the app.   tools/botlab/run.sh tools/botlab/quit-check.cjs
const { app } = require('electron');
require(process.env.S + '/offscreen-boot.cjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let quitting = false, results = [];
const done = (why) => { console.log(results.map((r) => (r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.info ? '  ' + JSON.stringify(r.info) : '')).join('\n')); console.log(`RESULT ${results.filter((r) => r.ok).length}/${results.length} (${why})`); };
app.on('before-quit', () => { if (!quitting) { quitting = true; results.push({ name: 'confirming QUIT quits the app', ok: true }); done('app quit'); } });
setTimeout(() => { results.push({ name: 'confirming QUIT quits the app', ok: false, info: 'no quit within 60 s' }); done('timeout'); app.exit(1); }, 60000);
let claimed = false;
app.on('browser-window-created', (_, win) => {
  if (claimed) return; claimed = true;
  win.webContents.once('did-finish-load', async () => {
    const js = (c) => win.webContents.executeJavaScript(c, true);
    for (let i = 0; i < 120; i++) { if (await js('!!window.__inkwave?.menus')) break; await wait(250); }
    await wait(1500);
    const R = (name, ok, info) => results.push({ name, ok: !!ok, info });
    R('the desktop bridge offers quit', await js(`typeof window.inkwaveNative?.quit === 'function'`));
    await js(`window.__inkwave.menus.show('main'); 0`); await wait(1200);
    const btn = await js(`!!document.querySelector('[data-id="quitgame"], #quitgame, .iw-btn[data-btn="quitgame"]') || [...document.querySelectorAll('.iw-btn')].some((b) => /QUIT GAME/.test(b.textContent))`);
    R('the main menu has QUIT GAME', btn);
    // reachable without the mouse: arrow keys from the stack reach it (controllers move focus the same way)
    const focusTxt = () => js(`(window.__inkwave.menus._focus && window.__inkwave.menus._focus.textContent) || ''`);
    // real key presses (trusted input, as the keyboard sends them)
    const KC = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };
    const key = async (code) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode: KC[code] || code }); await wait(40); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: KC[code] || code }); };
    let reached = false;
    const trail = [];
    for (const seq of [['ArrowUp', 'ArrowDown'], ['ArrowUp', 'ArrowRight'], ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown']]) {
      await js(`window.__inkwave.menus.show('main'); 0`); await wait(900);
      const seen = [];
      for (const c of seq) { await key(c); await wait(250); seen.push((await focusTxt()).trim().slice(0, 12)); }
      trail.push(seq.join('+') + ': ' + seen.join(' > '));
      if (/QUIT GAME/.test(await focusTxt())) { reached = seq.join('+'); break; }
    }
    R('reachable with the keyboard / controller', !!reached, { via: reached, trail });
    await js(`window.__inkwave.menus.show('main'); 0`); await wait(900);
    const click = (re) => js(`(() => { const b = [...document.querySelectorAll('.iw-btn')].find((x) => ${re}.test(x.textContent)); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
    await click('/QUIT GAME/'); await wait(600);
    const modal = await js(`(() => { const m = document.querySelector('.iw-modal'); return m ? m.textContent : null; })()`);
    R('it asks first: QUIT INKWAVE?', modal && /QUIT INKWAVE\\?/.test(modal) && /KEEP PLAYING/.test(modal), modal && modal.slice(0, 120));
    await click('/KEEP PLAYING/'); await wait(600);
    R('KEEP PLAYING closes the card, the game stays open', await js(`!document.querySelector('.iw-modal:not(.is-leaving)')`) && !quitting);
    await click('/QUIT GAME/'); await wait(600);
    await js(`(() => { const b = [...document.querySelectorAll('.iw-modal .iw-btn')].find((x) => /^\\s*QUIT\\s*$/.test(x.textContent)); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b; })()`);
  });
});
