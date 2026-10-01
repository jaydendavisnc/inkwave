// Electron shell for INKWAVE: serves the static game over a privileged app:// scheme
// (ES modules + import maps don't load from file://) and opens it in a native window.
const { app, BrowserWindow, Menu, protocol, net, shell, powerSaveBlocker, ipcMain, screen, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');

// GPU: run WebGL through ANGLE's Metal backend (instead of the deprecated OpenGL one),
// prefer the discrete GPU on dual-GPU Macs, and never fall back to software rendering.
app.commandLine.appendSwitch('use-angle', 'metal');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",   // index.html's import map + fade-in snippet are inline
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
].join('; ');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// ---- window state (size + fullscreen), remembered between launches; first launch opens fullscreen
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadState() {
  try { return { fullscreen: true, ...JSON.parse(fs.readFileSync(stateFile(), 'utf8')) }; } catch { return { fullscreen: true }; }
}
function saveState(win) {
  try {
    const s = { fullscreen: win.isFullScreen(), bounds: win.isFullScreen() ? loadState().bounds : win.getNormalBounds() };
    fs.writeFileSync(stateFile(), JSON.stringify(s));
  } catch { /* non-fatal */ }
}
function onScreen(b) {
  return b && screen.getAllDisplays().some(({ workArea: a }) => b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y);
}

function createWindow() {
  const state = loadState();
  const bounds = onScreen(state.bounds) ? state.bounds : { width: 1440, height: 900 };
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 600,
    title: 'INKWAVE',
    backgroundColor: '#0d1020',
    fullscreen: !!state.fullscreen,
    fullscreenable: true,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.loadURL('app://inkwave/index.html');
  // Keep any outbound links in the user's browser instead of inside the game window.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  // Fullscreen. macOS ignores requests made mid-transition, so remember the wanted state and re-apply it once the
  // animation ends. Shortcuts are caught before the page sees them, so the game's key handling / pointer lock can't eat them.
  // `ours` marks a transition we started; any other (green button, View menu) just becomes the new wanted state.
  let want = win.isFullScreen(), ours = false;
  const setFs = (on) => { want = !!on; if (win.isFullScreen() !== want) { ours = true; win.setFullScreen(want); } };
  const settled = () => {
    const now = win.isFullScreen();
    if (ours && now !== want) { win.setFullScreen(want); return; }
    ours = false; want = now;
    if (!win.webContents.isDestroyed()) win.webContents.send('fs:changed', now);
    saveState(win);
  };
  win.on('enter-full-screen', settled);
  win.on('leave-full-screen', settled);
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key.toLowerCase();
    // ⌘Q quits from anywhere (menus, a match with the mouse captured, fullscreen), whatever the page does with keys
    if (process.platform === 'darwin' && input.meta && !input.control && !input.alt && k === 'q') { e.preventDefault(); app.quit(); return; }
    const hit = k === 'f11' || (input.meta && input.control && k === 'f') || (input.meta && k === 'enter');
    if (!hit) return;
    e.preventDefault();
    if (!input.isAutoRepeat) setFs(!want);
  });
  ipcMain.removeAllListeners('fs:set'); ipcMain.removeAllListeners('fs:get');
  ipcMain.on('fs:set', (_e, on) => setFs(on));
  ipcMain.on('fs:get', (e) => { e.returnValue = win.isFullScreen(); });
  ipcMain.removeAllListeners('app:quit');
  ipcMain.on('app:quit', () => app.quit());   // the main menu's QUIT GAME (desktop app only)

  win.on('resized', () => saveState(win));
  win.on('moved', () => saveState(win));
  win.on('close', () => saveState(win));

  // Stop App Nap from throttling the game loop while it's focused; release when in the background.
  let blocker = null;
  win.on('focus', () => { if (blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension'); });
  win.on('blur', () => { if (blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; } });
  return win;
}

const MIME = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac' };
async function rangeResponse(file, header) {
  let size;
  try { ({ size } = await fs.promises.stat(file)); } catch { return new Response('Not found', { status: 404 }); }
  const [, a, b] = /bytes=(\d*)-(\d*)/.exec(header);
  let start = a === '' ? Math.max(0, size - Number(b)) : Number(a);
  let end = a !== '' && b !== '' ? Math.min(Number(b), size - 1) : size - 1;
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  const buf = Buffer.alloc(end - start + 1);
  const fh = await fs.promises.open(file, 'r');
  try { await fh.read(buf, 0, buf.length, start); } finally { await fh.close(); }
  return new Response(buf, { status: 206, headers: {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(buf.length), 'Accept-Ranges': 'bytes',
  } });
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { label: 'GPU Info', click: () => new BrowserWindow({ width: 900, height: 700 }).loadURL('chrome://gpu') },
      ],
    },
    { role: 'windowMenu' },
  ]));
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  protocol.handle('app', async (req) => {
    const { pathname } = new URL(req.url);
    let file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
    if (!file.startsWith(ROOT)) return new Response('Forbidden', { status: 403 });
    // songs ship outside the asar archive (see package.json asar.unpackDir) so media can seek in them
    file = file.replace(`app.asar${path.sep}songs${path.sep}`, `app.asar.unpacked${path.sep}songs${path.sep}`);
    // <audio> streams with byte-range requests: answer them with 206 partial content, or later loads of a song fail
    const range = req.headers.get('range');
    if (range && /^bytes=\d*-\d*$/.test(range)) return rangeResponse(file, range);
    const res = await net.fetch(pathToFileURL(file).toString());
    if (!file.endsWith('.html')) return res;
    // everything the game loads ships inside the app; nothing remote may run in the window
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', CSP);
    return new Response(res.body, { status: res.status, headers });
  });
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
