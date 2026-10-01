// sfx-cues listening sheet: renders every sub's and special's sounds offline in the game page (the game's own engine and
// master chain), writes WAVs and measures them.
//   BOTLAB_OUT=… SLOTS=4 tools/botlab/run.sh tools/botlab/sfx/render.cjs
//   ONLY=fuse_bomb,twister …   just those (no sheet);  OUT=dir   (default tools/botlab/sfx/out)
// sfx-loud: at the in-game levels (render-page.js: the default settings, the Cues bus, each cue at the enemy's mix).
// Writes out/<sound>.wav for each (shaker_blast@1.06 → shaker_blast_1.06.wav, sub_flight~bomb → sub_flight_bomb.wav),
// out/cues.wav (the whole sheet: each sub / special
// in turn, its sounds in phase order, 0.5 s apart, 1.2 s between them), out/cues.txt (what starts when) and
// out/metrics.json (peak / raw peak dBFS, LUFS-M max, clicks, NaNs, and a fingerprint — the spectrum in 8 bands, the
// length, the attack, the rhythm, the level over 12 slices — with the closest pairs in each family: how alike they are).
// The WAVs are git-ignored (no audio files in the repo).
const { app } = require('electron');
const fs = require('fs'), path = require('path');
require(process.env.S + '/offscreen-boot.cjs');
setTimeout(() => { console.log('WATCHDOG'); app.exit(1); setTimeout(() => process.exit(1), 3000); }, +(process.env.WATCHDOG || 900000));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.OUT || path.join(__dirname, 'out');
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const SR = 48000, BPF = 4;   // 16-bit stereo
const fileOf = (e) => e.replace('@', '_').replace('~', '_') + '.wav';
// families that must not sound alike (by name)
const FAMILY = {
  throws: (n) => /^(throw_|place_)|^(bomb_throw|torpedo_throw|tracer_zap|boomerang_throw|storm_throw)$/.test(n),
  blasts: (n) => /(_explode|_pop|_boom|_burst|_crash|_blast|_impact|^special_slam|^kraken_slam|^stamp_slam)$/.test(n) || /^(pellet_pop|special_slam|kraken_slam|stamp_slam|strike_impact)$/.test(n),
  // (sfx-loud: every warning — the subs', the specials', the launch alerts and the "you're in it" alarms — against
  // every other: none may sound like another)
  warnings: (n) => /^(fuse_|mine_trip|seeker_prime|waddle_prime|hunt_alarm|lock_tone|slam_warn|strike_mark|beam_lock|kraken_dive|orb_fuse|shell_whistle|bomb_beep|waddle_beep|boomerang_tick|wail_charge|strike_whistle|alert_|danger~)/.test(n),
  alerts: (n) => /^alert_/.test(n),
  alarms: (n) => /^(danger~|beam_lock$)/.test(n),
  stings: (n) => /^sting_/.test(n),
  flights: (n) => /^sub_flight~|~arc$/.test(n),
  loops: (n, m) => m.mode === 'loop' || m.mode === 'loop pass-by' || m.mode === 'loop sweep' ? !/^(fuse_|hunt_alarm|lock_tone|slam_warn|strike_mark|beam_lock|kraken_dive|orb_fuse|shell_whistle)/.test(n) : false,
};
// a sound's fingerprint: its spectrum (8 bands, dB, so the quiet bands count too), its length, its attack, its rhythm
// (the strongest level-modulation rate and depth) and its level shape over 12 slices
const feat = (m) => [
  ...m.bands.map((x) => Math.max(-50, 10 * Math.log10(x + 1e-9)) / 10),
  Math.log2(Math.max(0.05, m.dur)), m.attack * 2,
  m.amDepth > 0.25 ? Math.log2(Math.max(1, m.amRate)) * m.amDepth * 2 : 0, m.amDepth * 2,
  ...m.env.map((x) => x * 0.8),
];
const dist = (a, b) => { const fa = feat(a), fb = feat(b); let d = 0; for (let i = 0; i < fa.length; i++) d += (fa[i] - fb[i]) ** 2; return Math.sqrt(d); };
let claimed = false;
app.on('browser-window-created', (_, win) => {
  if (claimed) return; claimed = true;
  win.webContents.setBackgroundThrottling(false);
  let started = false;
  win.webContents.on('did-finish-load', async () => {
    if (started) return; started = true;
    await win.loadURL('app://inkwave/index.html?autopilot');
    const js = (c) => win.webContents.executeJavaScript(c, true);
    for (let i = 0; i < 80; i++) { if (await js('!!window.__inkwave?.api')) break; await wait(250); }
    try {
      await js(fs.readFileSync(path.join(__dirname, 'render-page.js'), 'utf8'));
      const sheet = ONLY.length ? [['(only)', ONLY]] : await js('window.__R.sheet()');
      fs.mkdirSync(OUT, { recursive: true });
      const metrics = [], chunks = [], index = [], done = new Map();
      let t = 0, bad = 0;
      const gap = (s) => chunks.push(Buffer.alloc(Math.floor(s * SR) * BPF));
      for (const [label, entries] of sheet) {
        index.push(`${t.toFixed(2).padStart(7)} s  ── ${label}`);
        for (const e of entries) {
          let r = done.get(e);
          if (!r) {
            r = await js(`window.__R.render(${JSON.stringify(e)})`);
            if (r.error) { console.log('ERROR', e, r.error.slice(0, 400)); bad++; continue; }
            r.buf = Buffer.from(r.wav, 'base64'); delete r.wav;
            fs.writeFileSync(path.join(OUT, fileOf(e)), r.buf);
            done.set(e, r);
            const warn = r.nan || r.clicks || r.peak > -0.3 ? '  <-- check' : '';
            console.log(`${e.padEnd(20)} ${r.mode.padEnd(13)} dur ${String(r.dur).padStart(5)}  peak ${String(r.peak).padStart(6)}  raw ${String(r.rawPeak).padStart(6)}  LUFS-M ${String(r.lufsM).padStart(6)}  clicks ${r.clicks}${warn}`);
          }
          const pcm = r.buf.subarray(44), keep = Math.min(pcm.length, Math.ceil((Math.max(0.4, r.dur) + 0.25) * SR) * BPF);
          chunks.push(pcm.subarray(0, keep)); gap(0.5);
          index.push(`${t.toFixed(2).padStart(7)} s      ${e}  (${r.mode})`);
          t += keep / (SR * BPF) + 0.5;
        }
        gap(0.7); t += 0.7;
      }
      const all = [...done.entries()].map(([e, r]) => ({ name: e, mode: r.mode, dur: r.dur, peak: r.peak, rawPeak: r.rawPeak, lufsM: r.lufsM, clicks: r.clicks, nan: r.nan, bands: r.bands, env: r.env, attack: r.attack, amRate: r.amRate, amDepth: r.amDepth, centroid: r.centroid }));
      // the closest pairs in each family (distinct sounds: the smaller the distance, the more alike)
      const close = {};
      for (const [fam, test] of Object.entries(FAMILY)) {
        const xs = all.filter((m) => test(m.name.split('@')[0], m) && !/@/.test(m.name));
        const pairs = [];
        for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) pairs.push([xs[i].name, xs[j].name, +dist(xs[i], xs[j]).toFixed(3)]);
        pairs.sort((a, b) => a[2] - b[2]);
        close[fam] = { n: xs.length, closest: pairs.slice(0, 5) };
        console.log(`closest ${fam} (${xs.length}):`, pairs.slice(0, 5).map((p) => `${p[0]}~${p[1]} ${p[2]}`).join('  '));
      }
      if (!ONLY.length) {
        const data = Buffer.concat(chunks), hdr = Buffer.alloc(44);
        hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16);
        hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * BPF, 28); hdr.writeUInt16LE(BPF, 32); hdr.writeUInt16LE(16, 34);
        hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
        fs.writeFileSync(path.join(OUT, 'cues.wav'), Buffer.concat([hdr, data]));
        fs.writeFileSync(path.join(OUT, 'cues.txt'), `INKWAVE sub / special cues — listening sheet (out/cues.wav, ${t.toFixed(0)} s). Loops: warnings swept 0 → 1 over their real fuse, movers passing left → right 3 m in front.\n` + index.join('\n') + '\n');
      }
      fs.writeFileSync(path.join(OUT, ONLY.length ? 'metrics-only.json' : 'metrics.json'), JSON.stringify({ sounds: all, closest: close }, null, 1));
      console.log(`RENDERED ${done.size} sounds${bad ? `, ${bad} failed` : ''}${ONLY.length ? '' : `, sheet ${t.toFixed(0)} s`} → ${OUT}`);
    } catch (e) { console.log('HARNESS ERROR', e.message); }
    app.quit();
  });
});
