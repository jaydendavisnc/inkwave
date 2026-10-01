// Botlab boot (required by every harness): the real app (electron/main.cjs) with an isolated profile, every game window
// rendered off-screen (never shown), audio muted, and a few switches that keep headless runs fast on macOS.
const Module = require('module');
const electron = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = process.env.BOTLAB_ROOT || path.resolve(__dirname, '../..');
const ud = process.env.UD || path.join(ROOT, '.botlab', 'ud-test');
fs.mkdirSync(ud, { recursive: true });
fs.writeFileSync(path.join(ud, 'window-state.json'), JSON.stringify({ fullscreen: false, bounds: { x: 60, y: 60, width: 1512, height: 945 } }));
electron.app.setPath('userData', ud);
electron.app.commandLine.appendSwitch('mute-audio');
// the network service as a separate process can crash under sandboxed shells (app:// loads then hang)
electron.app.commandLine.appendSwitch('enable-features', 'NetworkServiceInProcess2');
// don't touch the login keychain (cookie encryption can block on it for ~15 s per launch)
electron.app.commandLine.appendSwitch('use-mock-keychain');
// never shown, so macOS would App-Nap it (timers + IPC throttled to a crawl): keep it awake for the run
electron.app.whenReady().then(() => { try { electron.powerSaveBlocker.start('prevent-app-suspension'); } catch (e) {} });
electron.app.commandLine.appendSwitch('disable-renderer-backgrounding');
electron.app.commandLine.appendSwitch('disable-background-timer-throttling');
electron.app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// DEVSTAGE=1: every game page loads with ?devstage (src/main.js DEV_STAGE), so an online-only stage (config onlineOnly —
// Cargo Terminal) boots offline for page tests, shots, tower checks, bakes and stage art (a solo walk: never with bots)
const DEVSTAGE = process.env.DEVSTAGE === '1';
const devURL = (u) => (DEVSTAGE && typeof u === 'string' && u.startsWith('app://inkwave/index.html') && !/[?&]devstage\b/.test(u)
  ? u.replace(/^([^#]*?)(\?[^#]*)?(#.*)?$/, (_, p, q, h) => `${p}${q ? q + '&' : '?'}devstage${h || ''}`) : u);
class OffscreenBW extends electron.BrowserWindow {
  constructor(opts = {}) {
    super({ ...opts, show: false, fullscreen: false, width: 1512, height: 945, webPreferences: { ...(opts.webPreferences || {}), offscreen: true } });
    this.webContents.setFrameRate(60);
    this.webContents.setAudioMuted(true);
  }
  loadURL(url, opts) { return super.loadURL(devURL(url), opts); }
}
// Serve app:// straight from disk (same URL → file mapping as the app): net.fetch(file://) can cost ~0.4 s per file in
// sandboxed shells, which turns the game's ~150 module loads into a minutes-long boot.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
async function fsHandler(req) {
  const { pathname } = new URL(req.url);
  const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
  if (!file.startsWith(ROOT)) return new Response('Forbidden', { status: 403 });
  let buf;
  try { buf = await fs.promises.readFile(file); } catch { return new Response('Not found', { status: 404 }); }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.get('range');
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m) {
    const size = buf.length; let start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]); let end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    return new Response(buf.subarray(start, end + 1), { status: 206, headers: { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
  }
  return new Response(buf, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(buf.length) } });
}
const protoProxy = new Proxy(electron.protocol, { get: (t, k) => (k === 'handle' ? (scheme, fn) => t.handle(scheme, scheme === 'app' ? fsHandler : fn) : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) });
const patched = new Proxy(electron, { get: (t, k) => (k === 'BrowserWindow' ? OffscreenBW : k === 'protocol' ? protoProxy : t[k]) });
const load = Module._load;
Module._load = function (req) { return req === 'electron' ? patched : load.apply(this, arguments); };
require(path.join(ROOT, 'electron', 'main.cjs'));
Module._load = load;
