// Botlab bake: build/bake-ao.cjs run offscreen, muted, in an isolated profile (under run.sh's slot lock):
//   tools/botlab/run.sh tools/botlab/bake.cjs nantai nantai.zones
// Bakes ambient-occlusion lightmaps (assets/lightmaps/<layout>.png + .json) for map layouts.
// Runs inside the real game (props hand the level their colliders, so the layout hash matches what the game builds),
// lays the atlas out with Level.layoutLightmap and ray-traces each texel with the game's own physics raycast.
// Tone curve calibrated against the shipped tidewater bake: max(0.65, 1 − 0.9 · occ^1.1), occ = distance-weighted hits.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'assets', 'lightmaps');
const OPTS = { ppm: 8, size: 2048, rays: 96, dist: 3.5, floor: 0.65, strength: 0.9, gamma: 1.1 };
// '<id>' bakes the shared (Turf War) build; '<id>.zones' bakes that stage's Zone Control variant (src/world/variants.js)
const layouts = process.argv.slice(2).filter((a) => /^[a-z0-9_-]+(\.[a-z]+)?$/i.test(a) && !a.endsWith('.cjs'));

require(process.env.S + '/offscreen-boot.cjs');

// 8-bit grayscale PNG (colour type 0), same format as the shipped bakes
function grayPNG(size, pixels) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size + 1));
  for (let y = 0; y < size; y++) { raw[y * (size + 1)] = 0; pixels.copy(raw, y * (size + 1) + 1, y * size, (y + 1) * size); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Runs in the page. Returns { hash, used, png: base64 of size×size gray bytes (row 0 = top of the image) }.
const PAGE_BAKE = (o) => `(async () => {
  const THREE = await import('three'); const { Hit } = await import('./src/game/physics.js');
  const O = ${JSON.stringify(o)}, L = __G.level, P = __G.physics, S = O.size;
  if (!L.layoutLightmap(O.ppm, S)) throw new Error('lightmap atlas does not fit ' + S + ' at ' + O.ppm + ' ppm (used ' + L.lightUsed + ')');
  const img = new Uint8Array(S * S).fill(255);
  const dirs = []; // cosine-weighted hemisphere, Hammersley points
  for (let k = 0; k < O.rays; k++) { let b = k, rv = 0, f = 0.5; while (b) { if (b & 1) rv += f; b >>= 1; f *= 0.5; }
    const u1 = (k + 0.5) / O.rays, r = Math.sqrt(u1), ph = 2 * Math.PI * rv; dirs.push([r * Math.cos(ph), r * Math.sin(ph), Math.sqrt(1 - u1)]); }
  const hit = new Hit(), p = new THREE.Vector3(), d = new THREE.Vector3();
  const faces = L.faces.filter((f) => f.light);
  let done = 0, lastLog = performance.now();
  for (const f of faces) {
    const blk = L.blocks[f.block], pad = f.light.pad;
    const w = Math.ceil(f.su * O.ppm) + pad * 2, h = Math.ceil(f.sv * O.ppm) + pad * 2;
    const val = new Float32Array(w * h).fill(1);
    if (!blk.hidden && f.n.y > -0.5) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const cu = Math.min(f.su - 0.01, Math.max(0.01, (i - pad + 0.5) / O.ppm)), cv = Math.min(f.sv - 0.01, Math.max(0.01, (j - pad + 0.5) / O.ppm));
        p.copy(f.origin).addScaledVector(f.u, cu).addScaledVector(f.v, cv).addScaledVector(f.n, 0.03);
        if (L.pointInside(p, 0.01)) { val[j * w + i] = O.floor; continue; }
        // per-texel rotation of the ray set (hash of the texel) breaks up banding; the blur below removes the noise
        const rot = (((f.id * 73856093) ^ (i * 19349663) ^ (j * 83492791)) >>> 0) / 4294967296 * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
        let occ = 0;
        for (const [a0, b0, c] of dirs) {
          d.set(0, 0, 0).addScaledVector(f.u, a0 * cr - b0 * sr).addScaledVector(f.v, a0 * sr + b0 * cr).addScaledVector(f.n, c);
          P.raycast(p, d, O.dist, hit, true);
          if (hit.hit) occ += 1 - hit.dist / O.dist;
        }
        val[j * w + i] = Math.max(O.floor, 1 - O.strength * Math.pow(occ / O.rays, O.gamma));
      }
    }
    // 3×3 blur inside the face's own rect, then write (the texture is flipped on load: atlas row y → image row S-1-y)
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const x = i + di, y = j + dj; if (x >= 0 && y >= 0 && x < w && y < h) { s += val[y * w + x]; n++; } }
      const X = f.light.x + i, Y = S - 1 - (f.light.y + j);
      if (X < S && Y >= 0) img[Y * S + X] = Math.round((s / n) * 255);
    }
    done++;
    if (performance.now() - lastLog > 3000) { lastLog = performance.now(); console.log('[bake] ' + Math.round(done / faces.length * 100) + '%'); await new Promise((r) => setTimeout(r)); }
  }
  let bin = ''; for (let i = 0; i < img.length; i += 0x8000) bin += String.fromCharCode.apply(null, img.subarray(i, i + 0x8000));
  return { hash: L.layoutHash, used: L.lightUsed, png: btoa(bin) };
})()`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.on('browser-window-created', (_e, win) => {
  if (BrowserWindow.getAllWindows().length > 1) return;
  win.webContents.on('console-message', (e) => { if (String(e.message).startsWith('[bake]')) console.log('  ' + e.message); });
  win.webContents.once('did-finish-load', async () => {
    const js = (c) => win.webContents.executeJavaScript(c, true);
    try {
      for (let i = 0; i < 120 && !(await js('!!window.__inkwave?.api')); i++) await wait(250);
      const maps = await js(`import('./src/config.js').then((m) => m.MAPS.map((x) => ({ id: x.id, layout: x.layout || x.id })))`);
      const todo = layouts.length ? layouts : [...new Set(maps.map((m) => m.layout))];
      for (const id of todo) {
        const [base, mode = 'turf'] = id.split('.');
        const map = maps.find((m) => m.layout === base);
        if (!map) { console.error(`[bake] no map uses layout "${id}"`); continue; }
        console.log(`[bake] ${id}: building world…`);
        await js(`window.__inkwave.api.startMatch({ mapId: '${map.id}', duration: 180, mode: '${mode}' })`);
        const wk = await js('window.__inkwave.worldKey || null');
        if (wk && wk !== id) { console.error(`[bake] ${id}: this stage has no ${mode} variant (built ${wk}) — nothing to bake`); await js('window.__inkwave.quitToMenu()'); await wait(1200); continue; }
        for (let i = 0; i < 160 && !(await js(`window.__inkwave.match?.state === 'intro' || window.__inkwave.match?.state === 'playing'`)); i++) await wait(250);
        await js('window.__inkwave.debug.freeze()');
        const t0 = Date.now();
        const r = await js(PAGE_BAKE(OPTS));
        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(path.join(OUT, `${id}.png`), grayPNG(OPTS.size, Buffer.from(r.png, 'base64')));
        fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify({ id, hash: r.hash, size: OPTS.size, ppm: OPTS.ppm, rays: OPTS.rays, dist: OPTS.dist }));
        console.log(`[bake] ${id}: done in ${((Date.now() - t0) / 1000).toFixed(1)} s (hash ${r.hash}, ${r.used}/${OPTS.size} rows used)`);
        await js('window.__inkwave.debug.unfreeze(); window.__inkwave.quitToMenu()');
        await wait(1200);
      }
    } catch (e) {
      console.error('[bake] failed:', e.message);
      process.exitCode = 1;
    }
    app.quit();
  });
});
