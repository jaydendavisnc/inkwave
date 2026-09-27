// INKWAVE — procedural SFX engine (Web Audio). No audio files: every sound is synthesized per play.
//
//   import { audio } from './audio.js';
//   audio.init()                                   // idempotent; call from a user gesture (also inits music)
//   audio.setVolumes({ master, music, sfx })       // 0..1 each (perceptual taper)
//   audio.setListener(pos, forward, up)            // THREE.Vector3-like {x,y,z}; every frame
//   audio.play(name, { pos, volume = 1, pitch = 1 })   // one-shot; pos → 3D (HRTF, inverse distance) else 2D
//   const h = audio.loop(name, { pos, volume, pitch }); h.set({ volume, pitch, pos }); h.stop(fade = 0.15)
//   audio.duck(amount = 0.5, seconds = 1.2)        // temporarily lowers the music bus
//
// Loop pitch conventions: charger_charge pitch = 1 + 1.5 * charge (0..1); roll / swim / climb pitch ≈ 0.7 + speed
// factor (≈0.6..1.6), volume ≈ speed / maxSpeed. judge_drumroll works as a 3 s one-shot (play) or open loop (loop).
//
// Graph: voices → [lowpass(distance) → panner] → sfxIn → sfxBus ─┐
//        voices → reverb send → convolver (plaza IR) → sfxBus     ├→ master → glue comp → limiter → destination
//        music.js → musicBus → duck ─────────────────────────────┘
// Every builder works on any BaseAudioContext so tools/audio-test.mjs renders them through OfflineAudioContext.

import { DEFAULT_SETTINGS } from '../config.js';
import {
  V, music as musicSingleton, makeImpulse, mulberry32, mtof, ahr, adsr, pts, sweep, strokeWave, pulseWave,
  kick, snare, crash, tom, brass, bell, pad, bass,
} from './music.js';

const MAX_VOICES = 48;   // one-shots alive at once (oldest stolen beyond this)
const MAX_LOOPS = 24;
const taper = (v) => Math.pow(Math.min(1, Math.max(0, +v || 0)), 1.5);
const validPos = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const distCut = (d) => (d < 10 ? 22000 : Math.max(900, 22000 * Math.pow(0.5, (d - 10) / 13)));

/* ------------------------------------------------------------------------------------------------------------
 * Grain textures for wet loops (bubbles, squelch, rain, sizzle): JS-rendered, seamlessly looping buffers.
 * ----------------------------------------------------------------------------------------------------------*/
const TEX = {
  bubbles: { dur: 3, rate: 46, f: [230, 950], d: [0.018, 0.065], amp: [0.25, 1], rise: [1.35, 2.3] },
  bubbles_bright: { dur: 2.5, rate: 60, f: [650, 2300], d: [0.01, 0.035], amp: [0.2, 1], rise: [1.4, 2.4] },
  squelch: { dur: 2.5, rate: 75, f: [110, 460], d: [0.03, 0.09], amp: [0.3, 1], rise: [1.1, 1.7] },
  rain: { dur: 3, rate: 280, f: [1500, 5500], d: [0.004, 0.016], amp: [0.05, 1], rise: [1.2, 1.9] },
  sizzle: { dur: 2, rate: 450, crackle: true, d: [0.0006, 0.003], amp: [0.05, 1] },
};
const texCache = new WeakMap();
export function texture(ctx, kind) {
  let m = texCache.get(ctx);
  if (!m) { m = new Map(); texCache.set(ctx, m); }
  let buf = m.get(kind);
  if (buf) return buf;
  const d = grainSamples(kind, ctx.sampleRate);
  buf = ctx.createBuffer(1, d.length, ctx.sampleRate);
  buf.copyToChannel(d, 0);
  m.set(kind, buf);
  return buf;
}

// Pure sample generator behind texture() (also run off the main thread: AudioEngine._warm).
export function grainSamples(kind, sr) {
  const s = TEX[kind], len = Math.floor(s.dur * sr);
  const d = new Float32Array(len);
  let seed = 0;
  for (const c of kind) seed = (seed * 31 + c.charCodeAt(0)) | 0;
  const rnd = mulberry32(seed);
  const lerp = (r, x) => r[0] + (r[1] - r[0]) * x;
  const n = Math.floor(s.rate * s.dur), atk = 0.0012 * sr;
  for (let k = 0; k < n; k++) {
    const start = Math.floor(rnd() * len);
    const dec = lerp(s.d, rnd()) * sr, amp = lerp(s.amp, Math.pow(rnd(), 3));
    const L = Math.min(len, Math.floor(dec * 5));
    if (s.crackle) {
      for (let i = 0; i < L; i++) d[(start + i) % len] += amp * (rnd() * 2 - 1) * Math.exp(-i / dec);
    } else {
      const f0 = lerp(s.f, rnd()), f1 = f0 * lerp(s.rise, rnd());
      let ph = rnd() * 0.2;
      for (let i = 0; i < L; i++) {
        const f = f0 * Math.pow(f1 / f0, Math.min(1, i / (dec * 2)));
        ph += (2 * Math.PI * f) / sr;
        d[(start + i) % len] += amp * (1 - Math.exp(-i / atk)) * Math.exp(-i / dec) * Math.sin(ph);
      }
    }
  }
  let ss = 0, pk = 0, mean = 0;
  for (let i = 0; i < len; i++) mean += d[i];
  mean /= len;
  for (let i = 0; i < len; i++) { d[i] -= mean; ss += d[i] * d[i]; pk = Math.max(pk, Math.abs(d[i])); }
  const g = Math.min(0.25 / Math.sqrt(ss / len || 1), 0.95 / (pk || 1));
  for (let i = 0; i < len; i++) d[i] *= g;
  return d;
}

/* ------------------------------------------------------------------------------------------------------------
 * Engine
 * ----------------------------------------------------------------------------------------------------------*/
const NOOP_HANDLE = Object.freeze({ set() {}, stop() {}, playing: false });

export class AudioEngine {
  // opts: { context (use an existing/offline ctx), seed (deterministic randomness), music: false (don't attach
  //         the music singleton), raw: true (no master dynamics — used by the test to measure raw levels), hrtf }
  constructor(opts = {}) {
    this.opts = opts;
    this.ctx = null; this.ready = false; this.offline = false;
    this.hrtf = opts.hrtf ?? true;
    this.vol = { master: DEFAULT_SETTINGS.master ?? 0.8, music: DEFAULT_SETTINGS.music ?? 0.6, sfx: DEFAULT_SETTINGS.sfx ?? 0.85 };
    this.byName = new Map(); this.voices = []; this.loops = new Set(); this.last = new Map();
    this.L = { x: 0, y: 0, z: 0 };
    this.rng = opts.seed != null ? mulberry32(opts.seed) : Math.random;
    this.counts = { played: 0, dropped: 0, stolen: 0 };
    this._warned = new Set(); this._duck = null;
    this.music = musicSingleton;
  }

  init() {
    if (this.ctx) { this.resume(); return this; }
    let ctx = this.opts.context;
    if (!ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return this;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { return this; } }
    }
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.master = g(taper(this.vol.master));
    this.sfxBus = g(taper(this.vol.sfx));
    this.musicBus = g(taper(this.vol.music));
    this.duckG = g(1);
    this.sfxIn = g(1);
    this.sfxIn.connect(this.sfxBus); this.sfxBus.connect(this.master);
    this.musicBus.connect(this.duckG); this.duckG.connect(this.master);
    // shared plaza reverb
    this.revSend = g(1);
    this.conv = ctx.createConvolver();
    this.conv.buffer = makeImpulse(ctx, 1.5, 3.4, { pre: 0.012, seed: 3 });
    this.revRet = g(0.6);
    this.revSend.connect(this.conv); this.conv.connect(this.revRet); this.revRet.connect(this.sfxBus);
    // master dynamics: gentle glue then a safety limiter
    // sub-sonic / DC safety high-pass on everything
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 25; hp.Q.value = 0.707;
    this.master.connect(hp);
    if (this.opts.raw) hp.connect(ctx.destination);
    else {
      const glue = ctx.createDynamicsCompressor();
      glue.threshold.value = -12; glue.knee.value = 8; glue.ratio.value = 3; glue.attack.value = 0.003; glue.release.value = 0.18;
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
      hp.connect(glue); glue.connect(lim); lim.connect(ctx.destination);
      this.glue = glue; this.limiter = lim;
    }
    this.ready = true;
    if (this.opts.music !== false && this.music) this.music._init(ctx, this.musicBus, { offline: this.offline });
    if (!this.offline) { this._installUnlock(); this._warm(); this.resume(); }
    return this;
  }

  resume() {
    const c = this.ctx;
    if (c && !this.offline && c.state !== 'running' && c.state !== 'closed' && c.resume) c.resume().catch(() => {});
  }

  _installUnlock() {
    if (typeof window === 'undefined') return;
    const h = () => this.resume();
    for (const ev of ['pointerdown', 'keydown', 'touchend', 'mousedown']) window.addEventListener(ev, h, { capture: true, passive: true });
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) h(); });
  }

  // pre-render grain textures on another core (each is 100–200 ms of JS: on the main thread that's a hitch per kind,
  // right as a match starts); anything not back yet is rendered on demand by texture()
  _warm() {
    const ctx = this.ctx;
    let w;
    try { w = new Worker(import.meta.url, { type: 'module' }); } catch { return; }   // this module (see its end)
    let left = 0;
    w.onmessage = ({ data: { kind, d } }) => {
      let m = texCache.get(ctx);
      if (!m) { m = new Map(); texCache.set(ctx, m); }
      if (!m.has(kind)) { const buf = ctx.createBuffer(1, d.length, ctx.sampleRate); buf.copyToChannel(d, 0); m.set(kind, buf); }
      if (--left === 0) w.terminate();
    };
    w.onerror = () => w.terminate();
    for (const kind of Object.keys(TEX)) { left++; w.postMessage({ kind, sr: ctx.sampleRate }); }
  }

  setVolumes(v = {}) {
    for (const k of ['master', 'music', 'sfx']) if (v[k] != null && Number.isFinite(+v[k])) this.vol[k] = Math.min(1, Math.max(0, +v[k]));
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(taper(this.vol.master), t, 0.04);
    this.musicBus.gain.setTargetAtTime(taper(this.vol.music), t, 0.04);
    this.sfxBus.gain.setTargetAtTime(taper(this.vol.sfx), t, 0.04);
  }

  setListener(pos, forward, up) {
    if (!this.ctx || !validPos(pos)) return;
    this.L.x = pos.x; this.L.y = pos.y; this.L.z = pos.z;
    const l = this.ctx.listener, t = this.ctx.currentTime;
    const okF = validPos(forward) && (forward.x || forward.y || forward.z);
    const u = validPos(up) && (up.x || up.y || up.z) ? up : { x: 0, y: 1, z: 0 };
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.01); l.positionY.setTargetAtTime(pos.y, t, 0.01); l.positionZ.setTargetAtTime(pos.z, t, 0.01);
      if (okF) {
        l.forwardX.setTargetAtTime(forward.x, t, 0.01); l.forwardY.setTargetAtTime(forward.y, t, 0.01); l.forwardZ.setTargetAtTime(forward.z, t, 0.01);
        l.upX.setTargetAtTime(u.x, t, 0.01); l.upY.setTargetAtTime(u.y, t, 0.01); l.upZ.setTargetAtTime(u.z, t, 0.01);
      }
    } else {
      if (l.setPosition) l.setPosition(pos.x, pos.y, pos.z);
      if (okF && l.setOrientation) l.setOrientation(forward.x, forward.y, forward.z, u.x, u.y, u.z);
    }
  }

  _dist(p) { const dx = p.x - this.L.x, dy = p.y - this.L.y, dz = p.z - this.L.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }

  _panner(pos) {
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = this.hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse'; p.refDistance = 3; p.maxDistance = 60; p.rolloffFactor = 1.2;
    p.coneInnerAngle = 360; p.coneOuterAngle = 360;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    return p;
  }

  _setPos(voice, pos, t) {
    if (!voice.panner || !validPos(pos)) return;
    const p = voice.panner;
    if (p.positionX) { p.positionX.setTargetAtTime(pos.x, t, 0.02); p.positionY.setTargetAtTime(pos.y, t, 0.02); p.positionZ.setTargetAtTime(pos.z, t, 0.02); }
    else p.setPosition(pos.x, pos.y, pos.z);
    const d = this._dist(pos);
    voice.lp.frequency.setTargetAtTime(distCut(d), t, 0.05);
    if (voice.send) voice.send.gain.setTargetAtTime(voice.rev * this._sendScale(d), t, 0.05);
  }

  _sendScale(d) { return Math.sqrt(3 / (3 + 1.2 * Math.max(0, d - 3))); }

  _voice(def, t, pos, vol, withFade) {
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = vol;
    const v = new V(ctx, out, t, this.rng);
    v.nodes.push(out);
    const voice = { v, out, def, t, vol, panner: null, lp: null, send: null, rev: def.reverb ?? 0.08, fade: null };
    let head = out;
    if (withFade) { voice.fade = ctx.createGain(); out.connect(voice.fade); head = voice.fade; v.nodes.push(voice.fade); }
    let scale = 1;
    if (validPos(pos)) {
      const d = this._dist(pos);
      voice.lp = ctx.createBiquadFilter(); voice.lp.type = 'lowpass'; voice.lp.Q.value = 0.5; voice.lp.frequency.value = distCut(d);
      voice.panner = this._panner(pos);
      head.connect(voice.lp); voice.lp.connect(voice.panner); voice.panner.connect(this.sfxIn);
      v.nodes.push(voice.lp, voice.panner);
      voice.rev += Math.min(0.25, Math.max(0, (d - 6) / 60));
      scale = this._sendScale(d);
    } else head.connect(this.sfxIn);
    if (voice.rev > 0.001) {
      voice.send = ctx.createGain(); voice.send.gain.value = voice.rev * scale;
      head.connect(voice.send); voice.send.connect(this.revSend); v.nodes.push(voice.send);
    }
    return voice;
  }

  _steal(voice, now) {
    if (!voice || voice.v.dead || voice.stolen) return;
    voice.stolen = true; this.counts.stolen++;
    const p = voice.out.gain;
    p.cancelScheduledValues(now); p.setValueAtTime(voice.burst ? p.value : voice.vol, now); p.linearRampToValueAtTime(0, now + 0.025);
    voice.v.kill(now + 0.03);
  }

  _def(name) {
    const d = SFX[name];
    if (!d && !this._warned.has(name)) { this._warned.add(name); console.warn('[audio] unknown sound', name); }
    return d;
  }

  play(name, o = {}) {
    if (!this.ctx) return null;
    const d = this._def(name);
    if (!d) return null;
    o = o || {};
    const now = this.ctx.currentTime;
    const t = Math.max(now, o.at ?? now) + (o.delay || 0);
    // same sound within a few ms (e.g. 8 droplets landing together) collapses into one
    const lt = this.last.get(name);
    if (lt !== undefined && t >= lt && t - lt < (d.minGap ?? 0.018)) { this.counts.dropped++; return null; }
    const vol = Math.max(0, o.volume ?? 1) * (d.gain ?? 0.5);
    if (vol < 1e-4) return null;
    this.last.set(name, t);
    // per-name voice limit (drop oldest) + global cap
    let list = this.byName.get(name);
    if (!list) this.byName.set(name, (list = []));
    for (let i = list.length - 1; i >= 0; i--) if (list[i].v.dead || list[i].stolen) list.splice(i, 1);
    while (list.length >= (d.max ?? 6)) this._steal(list.shift(), now);
    if (this.voices.length >= MAX_VOICES) {
      for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i].v.dead || this.voices[i].stolen) this.voices.splice(i, 1);
      while (this.voices.length >= MAX_VOICES) this._steal(this.voices.shift(), now);
    }
    const pitch = Math.max(0.05, o.pitch ?? 1) * (1 + (this.rng() * 2 - 1) * (d.jitter ?? 0.06));
    const voice = this._voice(d, t, o.pos, vol);
    const v = voice.v;
    try {
      if (d.build) d.build(v, pitch, o);
      else if (d.loop) {
        // loop sound fired as a one-shot: short burst with a fade out
        const len = d.oneShot ?? 1.2;
        voice.burst = true;
        d.loop(v, pitch, o);
        voice.out.gain.setValueAtTime(0, t); voice.out.gain.linearRampToValueAtTime(vol, t + 0.05);
        voice.out.gain.setValueAtTime(vol, t + len - 0.15); voice.out.gain.linearRampToValueAtTime(0, t + len);
        v.kill(t + len + 0.01);
      }
    } catch (e) {
      console.error('[audio] build failed', name, e);
      v.dispose();
      return null;
    }
    v.ondispose = () => { voice.done = true; };
    v.finish();
    list.push(voice); this.voices.push(voice);
    this.counts.played++;
    return voice;
  }

  loop(name, o = {}) {
    if (!this.ctx) return NOOP_HANDLE;
    const d = this._def(name);
    if (!d) return NOOP_HANDLE;
    o = o || {};
    for (const h of this.loops) if (!h.playing) this.loops.delete(h);
    if (this.loops.size >= MAX_LOOPS) this.loops.values().next().value.stop(0.05);
    const t = this.ctx.currentTime;
    const gain = d.gain ?? 0.5;
    const voice = this._voice(d, t, o.pos, Math.max(0, +(o.volume ?? 1) || 0) * gain, true);
    const v = voice.v, outG = voice.out.gain, fadeG = voice.fade.gain;
    fadeG.setValueAtTime(0, t);
    fadeG.linearRampToValueAtTime(1, t + 0.06);
    const fadeNow = (now) => Math.min(1, Math.max(0, (now - t) / 0.06));
    let ctl = {};
    try {
      if (d.loop) ctl = d.loop(v, Math.max(0.05, o.pitch ?? 1), o) || {};
      else { d.build(v, Math.max(0.05, o.pitch ?? 1), o); v.finish(); }
    } catch (e) {
      console.error('[audio] loop build failed', name, e);
      v.dispose();
      return NOOP_HANDLE;
    }
    const eng = this;
    let stopped = false;
    const h = {
      name,
      get playing() { return !stopped && !v.dead; },
      set(p = {}) {
        if (stopped || v.dead || !p) return;
        const now = eng.ctx.currentTime;
        if (p.volume != null && Number.isFinite(+p.volume)) outG.setTargetAtTime(Math.max(0, +p.volume) * gain, now, 0.04);
        if (p.pitch != null && Number.isFinite(+p.pitch) && ctl.pitch) ctl.pitch(Math.max(0.05, +p.pitch), now);
        if (p.pos) eng._setPos(voice, p.pos, now);
      },
      stop(fade = 0.15) {
        if (stopped) return;
        stopped = true;
        eng.loops.delete(h);
        if (v.dead) return;
        const now = eng.ctx.currentTime, f = Math.max(0.01, +fade || 0.01);
        fadeG.cancelScheduledValues(now); fadeG.setValueAtTime(fadeNow(now), now); fadeG.linearRampToValueAtTime(0, now + f);
        v.kill(now + f + 0.02);
      },
    };
    this.loops.add(h);
    return h;
  }

  // duck envelope is tracked in JS (linear points) so overlapping ducks always continue from the exact current value
  _duckAt(t) {
    const P = this._duckPts;
    if (!P || !P.length || t >= P[P.length - 1][0]) return P && P.length ? P[P.length - 1][1] : 1;
    if (t <= P[0][0]) return P[0][1];
    for (let i = 1; i < P.length; i++) if (t <= P[i][0]) { const [t0, v0] = P[i - 1], [t1, v1] = P[i]; return t1 > t0 ? v0 + ((v1 - v0) * (t - t0)) / (t1 - t0) : v1; }
    return 1;
  }
  duck(amount = 0.5, seconds = 1.2) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    let target = 1 - Math.min(1, Math.max(0, +amount || 0));
    let until = now + 0.08 + Math.max(0, +seconds || 0);
    if (this._duck && now < this._duck.until) { target = Math.min(target, this._duck.target); until = Math.max(until, this._duck.until); }
    this._duck = { target, until };
    const v = this._duckAt(now), p = this.duckG.gain;
    this._duckPts = [[now, v], [now + 0.08, target], [until, target], [until + 0.6, 1]];
    p.cancelScheduledValues(now);
    p.setValueAtTime(v, now);
    p.linearRampToValueAtTime(target, now + 0.08);
    p.setValueAtTime(target, until);
    p.linearRampToValueAtTime(1, until + 0.6);
  }

  stopAll(fade = 0.1) {
    for (const h of [...this.loops]) h.stop(fade);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const vc of this.voices) this._steal(vc, now);
    this.voices.length = 0; this.byName.clear();
  }

  stats() {
    for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i].v.dead || this.voices[i].stolen) this.voices.splice(i, 1);
    return { voices: this.voices.length, loops: this.loops.size, state: this.ctx ? this.ctx.state : 'none', ...this.counts };
  }
}

/* ------------------------------------------------------------------------------------------------------------
 * Sound definitions. build(v, pitch, opts) for one-shots; loop(v, pitch, opts) → { pitch(q, now) } for loops.
 * v.t = start time, v.out = voice output. gain = voice level, max = voices per name, jitter = random pitch ±,
 * reverb = plaza send, minGap = merge window.
 * ----------------------------------------------------------------------------------------------------------*/
export const SFX = {};
const def = (name, o) => { SFX[name] = o; };

// shared wet layers
function bloops(v, t0, n, spread, fr, peak, p = 1) {
  for (let i = 0; i < n; i++) {
    const f = v.r(fr[0], fr[1]) * p;
    v.tone({ t: t0 + v.r(0, spread), f, f1: f * v.r(0.3, 0.45), sw: v.r(0.04, 0.07), a: 0.0015, d: v.r(0.05, 0.09), peak: peak * v.r(0.6, 1) });
  }
}
function plips(v, t0, n, spread, fr, peak, p = 1) {
  for (let i = 0; i < n; i++) v.bub(v.t + t0 + v.r(0, spread), v.r(fr[0], fr[1]) * p, peak * v.r(0.5, 1), v.r(0.02, 0.04), v.r(1.4, 2.0));
}
function bigSplat(v, t, p, s) {
  v.tone({ t, f: 120 * p, f1: 40 * p, sw: 0.15, a: 0.002, d: 0.28, peak: 1 * s });
  v.nz({ t, kind: 'pink', ft: 'lowpass', f: 2500, f1: 300, sw: 0.25, q: 1.5, a: 0.002, d: 0.28, peak: 0.9 * s });
  v.nz({ t: t + 0.01, f: 1600 * p, f1: 320 * p, sw: 0.3, q: v.r(5, 8), a: 0.003, d: 0.32, peak: 0.9 * s });
  bloops(v, t + 0.02, 3, 0.12, [400, 650], 0.35 * s, p);
  v.nz({ t, ft: 'highpass', f: 3500, a: 0.005, d: 0.35, peak: 0.3 * s });
}
function uiNote(v, t, m, p, peak) {
  const f = mtof(m) * p;
  v.tone({ t, f: f * 0.5, f1: f, sw: 0.018, a: 0.002, d: 0.2, peak });
  v.tone({ t, type: 'triangle', f: f * 2, a: 0.001, d: 0.07, peak: peak * 0.18 });
}

/* ---- UI (quiet, pleasant) ---- */
def('ui_hover', {
  gain: 0.14, max: 3, jitter: 0.02, reverb: 0, minGap: 0.03,
  build(v, p) {
    v.tone({ f: 1900 * p, f1: 1450 * p, sw: 0.03, a: 0.002, d: 0.05, peak: 0.6 });
    v.nz({ ft: 'highpass', f: 5000, a: 0.0006, d: 0.012, peak: 0.12 });
  },
});
def('ui_click', {
  gain: 0.26, max: 3, jitter: 0.03, reverb: 0.03,
  build(v, p) {
    v.tone({ f: 380 * p, f1: 1150 * p, sw: 0.035, a: 0.002, d: 0.075, peak: 0.6 });
    v.tone({ type: 'triangle', f: 760 * p, f1: 2300 * p, sw: 0.03, a: 0.001, d: 0.04, peak: 0.16 });
    v.nz({ f: 3000, q: 1.5, a: 0.0005, d: 0.01, peak: 0.18 });
  },
});
def('ui_confirm', { gain: 0.2, max: 2, jitter: 0, reverb: 0.06, build(v, p) { uiNote(v, 0, 84, p, 0.5); uiNote(v, 0.075, 91, p, 0.55); } });
def('ui_back', { gain: 0.19, max: 2, jitter: 0, reverb: 0.05, build(v, p) { uiNote(v, 0, 79, p, 0.5); uiNote(v, 0.07, 72, p, 0.5); } });
def('ui_toggle', {
  gain: 0.32, max: 2, jitter: 0.02, reverb: 0.02,
  build(v, p) {
    const lp = v.filter('lowpass', 2200, 1.2, v.out);
    v.tone({ type: 'square', f: 640 * p, f1: 540 * p, sw: 0.04, a: 0.001, d: 0.05, peak: 0.3, to: lp });
    v.tone({ f: 1280 * p, a: 0.001, d: 0.03, peak: 0.25 });
    v.nz({ ft: 'highpass', f: 4000, a: 0.0005, d: 0.008, peak: 0.15 });
  },
});
def('ui_slider', {
  gain: 0.22, max: 3, jitter: 0, reverb: 0, minGap: 0.025,
  build(v, p) {
    v.tone({ f: 2600 * p, a: 0.001, d: 0.022, peak: 0.5 });
    v.tone({ type: 'triangle', f: 5200 * p, a: 0.0005, d: 0.01, peak: 0.1 });
  },
});
def('ui_error', {
  gain: 0.13, max: 2, jitter: 0, reverb: 0.02,
  build(v, p) {
    const lp = v.filter('lowpass', 1100, 1.5, v.out);
    for (const t of [0, 0.11]) for (const f of [155, 163]) {
      const T = v.t + t, g = v.gain(0, lp);
      const end = ahr(g.gain, T, 0.004, 0.25, 0.065, 0.03);
      v.osc('square', f * p, T, end + 0.01, g);
    }
  },
});

/* ---- Weapons ---- */
def('shoot_shooter', {
  gain: 0.72, max: 8, jitter: 0.05, reverb: 0.07, minGap: 0.02,
  build(v, p) {
    // three voicings (+ the engine's pitch jitter) so a 10-shot/s stream never machine-guns one sample
    const vo = v.pick([[1, 1], [1.12, 0.93], [0.9, 1.08]]);
    const k = vo[0] * p, w = vo[1] * p;
    v.nz({ f: 4200 * k, q: 1.6, a: 0.0004, d: 0.018, peak: 0.66 });                                       // snap (presence)
    v.tone({ f: 2600 * k, f1: 820 * k, sw: 0.014, a: 0.0005, d: 0.02, peak: 0.26 });                       // "pew" chirp
    const bp = v.r(2500, 3100) * k;
    v.nz({ f: bp, f1: bp * 0.62, sw: 0.05, q: 1.4, a: 0.0008, d: 0.05, peak: 0.8 });                       // pneumatic "pshk"
    v.tone({ f: 175 * w, f1: 62 * w, sw: 0.05, a: 0.001, d: 0.055, peak: 0.52 });                          // thump
    v.nz({ t: 0.01, f: v.r(1500, 1900) * w, f1: v.r(520, 680) * w, sw: 0.09, q: v.r(4.5, 7), a: 0.004, d: 0.09, peak: 0.72 }); // wet splort
    v.bub(v.t + v.r(0.018, 0.035), v.r(900, 1400) * w, 0.12, 0.022, 1.8);                                  // droplet plip
    v.nz({ ft: 'highpass', f: 5200, a: 0.001, d: 0.06, peak: 0.2 });                                      // air
  },
});
def('shoot_blaster', {
  gain: 0.55, max: 4, jitter: 0.04, reverb: 0.1,
  build(v, p) {
    v.nz({ ft: 'highpass', f: 3800, a: 0.0003, d: 0.008, peak: 0.5 });                                   // valve click
    v.nz({ f: 1500 * p, f1: 900 * p, sw: 0.02, q: 2.2, a: 0.0006, d: 0.022, peak: 0.75 });                // "chunk"
    v.tone({ f: 150 * p, f1: 40 * p, sw: 0.16, a: 0.002, d: 0.3, peak: 1 });                             // thoomp
    v.tone({ type: 'triangle', f: 300 * p, f1: 88 * p, sw: 0.08, a: 0.002, d: 0.1, peak: 0.35 });
    v.nz({ kind: 'pink', ft: 'lowpass', f: 1600, f1: 280, sw: 0.12, q: 2, a: 0.002, d: 0.14, peak: 0.9 });
    v.nz({ t: 0.008, f: 320 * p, f1: 950 * p, sw: 0.06, q: 6, a: 0.004, d: 0.08, peak: 0.55 });          // the ink ball: a big rising gloop
    v.tone({ t: 0.01, f: 190 * p, f1: 430 * p, sw: 0.07, a: 0.003, d: 0.075, peak: 0.4 });
    v.nz({ f: 700 * p, f1: 2400 * p, sw: 0.22, q: 1.4, a: 0.03, d: 0.18, peak: 0.26 });                  // projectile whoosh
    v.nz({ t: 0.05, ft: 'highpass', f: 5000, a: 0.02, d: 0.16, peak: 0.08 });                            // vent hiss
  },
});
// Blaster pump rack: slide back → back-stop clack, slide forward → front-stop clack + re-pressurise puff. weapons.js
// schedules it 0.27 s after the shot so the clacks land on the pump animation's stops (+0.29 s and +0.46 s).
def('blaster_pump', {
  gain: 0.62, max: 3, jitter: 0.03, reverb: 0.06,
  build(v, p) {
    const clack = (t, hard) => {
      v.nz({ t, f: 3100 * p, q: 2.4, a: 0.0003, d: 0.009, peak: 0.8 * hard });                          // click
      v.tone({ t, f: 1870 * p, a: 0.0005, d: 0.045, peak: 0.12 * hard });                               // metal ring
      v.tone({ t, f: 3050 * p, a: 0.0005, d: 0.03, peak: 0.07 * hard });
      v.tone({ t, f: 230 * p, f1: 120 * p, sw: 0.025, a: 0.001, d: 0.03, peak: 0.5 * hard });           // body thunk
    };
    v.nz({ f: 1200 * p, f1: 2200 * p, sw: 0.02, q: 1.2, a: 0.008, d: 0.014, peak: 0.12 });              // slide back
    clack(0.02, 0.85);
    v.nz({ t: 0.08, f: 2000 * p, f1: 1300 * p, sw: 0.1, q: 1.2, a: 0.03, d: 0.08, peak: 0.1 });         // slide forward
    clack(0.19, 1);
    v.nz({ t: 0.2, f: 900 * p, f1: 500 * p, sw: 0.08, q: 1.5, a: 0.01, d: 0.09, peak: 0.25 });          // re-pressurise
  },
});
def('blaster_boom', {
  gain: 0.55, max: 4, jitter: 0.05, reverb: 0.22,
  build(v, p) {
    v.tone({ f: 110 * p, f1: 34 * p, sw: 0.3, a: 0.002, d: 0.45, peak: 1 });
    v.nz({ ft: 'highpass', f: 2500, a: 0.0005, d: 0.03, peak: 0.7 });                                   // crack
    v.tone({ t: 0.004, f: 950 * p, f1: 210 * p, sw: 0.03, a: 0.0006, d: 0.03, peak: 0.28 });             // pop
    v.nz({ kind: 'pink', ft: 'lowpass', f: 3500, f1: 250, sw: 0.35, q: 1, a: 0.002, d: 0.4, peak: 1 });
    v.nz({ t: 0.03, f: 1400 * p, f1: 450 * p, sw: 0.4, q: 3.5, a: 0.004, d: 0.45, peak: 0.7 });
    bloops(v, 0.04, 3, 0.1, [400, 700], 0.25, p);
    // the shell of droplets raining back down: a patter that thins out
    let t = 0.09;
    for (let i = 0; i < 9; i++) { t += v.r(0.022, 0.05); v.bub(v.t + t, v.r(700, 1900) * p, 0.16 * (1 - i / 11), v.r(0.012, 0.026), v.r(1.5, 2.1)); }
    v.nz({ t: 0.05, ft: 'highpass', f: 3500, a: 0.02, d: 0.4, peak: 0.2 });
  },
});
def('charger_charge', {
  gain: 0.28, max: 2, jitter: 0, reverb: 0.05, oneShot: 1.0,
  loop(v, p) {
    const T = v.t, base = 250;
    const amp = v.gain(0.7, v.out);
    const bp = v.filter('bandpass', base * 4 * p, 5, amp);
    const o1 = v.osc('sawtooth', base * p, T, null, bp);
    const o2 = v.osc('sine', base * 2 * p, T, null, v.gain(0.35, amp));
    const o3 = v.osc('sine', base * 3.01 * p, T, null, v.gain(0.12, amp));
    const trem = v.lfo(7 * p, 0.3, amp.gain, T, null);
    const sh = v.gain(0.05 * p, v.out);
    v.noise('white', T, null, v.filter('highpass', 7000, 0.7, sh));
    return {
      pitch(q, now) {
        const k = 0.03;
        o1.frequency.setTargetAtTime(base * q, now, k); o2.frequency.setTargetAtTime(base * 2 * q, now, k);
        o3.frequency.setTargetAtTime(base * 3.01 * q, now, k); bp.frequency.setTargetAtTime(Math.min(base * 4 * q, 16000), now, k);
        trem.osc.frequency.setTargetAtTime(7 * q * q, now, k); sh.gain.setTargetAtTime(0.05 * q, now, k);
      },
    };
  },
});
def('charger_full', {
  gain: 0.24, max: 2, jitter: 0, reverb: 0.2,
  build(v, p) {
    const ding = (t, f, k) => {
      for (const [r, a, d] of [[1, 0.5, 0.9], [2.0, 0.22, 0.6], [3.01, 0.14, 0.4], [4.2, 0.09, 0.28], [5.43, 0.05, 0.2]]) v.tone({ t, f: f * r, a: 0.001, d: d * k, peak: a });
    };
    ding(0, 1568 * p, 1); ding(0.065, 2349 * p, 0.8);
    v.nz({ ft: 'highpass', f: 8000, a: 0.002, d: 0.15, peak: 0.08 });
  },
});
def('shoot_charger', {
  gain: 0.55, max: 4, jitter: 0.03, reverb: 0.18,
  build(v, p) {
    v.nz({ ft: 'highpass', f: 2600, a: 0.0002, d: 0.03, peak: 1 });                                     // crack
    v.tone({ f: 5200 * p, a: 0.0002, d: 0.006, peak: 0.22 });                                           // bite
    v.nz({ f: 6000 * p, f1: 900 * p, sw: 0.14, q: 3, a: 0.001, d: 0.16, peak: 0.5 });                   // "pshew" whistle-whoosh
    const lp = v.filter('lowpass', 6000, 1, v.out);
    v.tone({ type: 'sawtooth', f: 2600 * p, f1: 260 * p, sw: 0.13, a: 0.0008, d: 0.15, peak: 0.16, to: lp }); // zap
    v.tone({ f: 140 * p, f1: 46 * p, sw: 0.12, a: 0.001, d: 0.2, peak: 0.85 });                          // sub thump (pitch < 1 = full charge)
    v.nz({ t: 0.03, f: 1700 * p, f1: 420 * p, sw: 0.5, q: 2.5, a: 0.01, d: 0.55, peak: 0.5 });          // ink streak splash
    v.nz({ t: 0.04, ft: 'highpass', f: 3000, a: 0.03, d: 0.45, peak: 0.2 });
    bloops(v, 0.05, 2, 0.12, [500, 800], 0.2, p);
  },
});
def('roller_flick', {
  gain: 0.6, max: 3, jitter: 0.05, reverb: 0.16,
  build(v, p) {
    const T = v.t, g = v.gain(0, v.out), bp = v.filter('bandpass', 350, 1.8, g);
    bp.frequency.setValueAtTime(320 * p, T); bp.frequency.exponentialRampToValueAtTime(1700 * p, T + 0.15); bp.frequency.exponentialRampToValueAtTime(600 * p, T + 0.32);
    pts(g.gain, T, [[0, 0], [0.13, 0.7], [0.2, 0.5], [0.34, 0]]);
    v.noise('pink', T, T + 0.36, bp);                                                                     // heavy whoosh
    v.tone({ t: 0.12, f: 120 * p, f1: 45 * p, sw: 0.18, a: 0.002, d: 0.25, peak: 0.9 });
    v.nz({ t: 0.14, kind: 'pink', ft: 'lowpass', f: 1100, f1: 220, sw: 0.2, q: 1.5, a: 0.002, d: 0.2, peak: 0.6 });
    // the sheet leaves the drum as a ripple of overlapping slaps (centre heavy, edges lighter)
    for (let i = 0; i < 4; i++) v.nz({ t: 0.145 + i * 0.018 + v.r(0, 0.006), f: v.r(1100, 1500) * p, f1: v.r(350, 480) * p, sw: 0.3 + i * 0.05, q: v.r(2.5, 3.5), a: 0.003, d: 0.34, peak: 0.55 - i * 0.08 });
    bloops(v, 0.16, 4, 0.2, [350, 700], 0.3, p);
    v.nz({ t: 0.16, ft: 'highpass', f: 3500, a: 0.01, d: 0.5, peak: 0.25 });
  },
});
def('roll', {
  gain: 0.24, max: 2, jitter: 0, reverb: 0.04, oneShot: 1.2,
  loop(v, p) {
    const T = v.t;
    const lp = v.filter('lowpass', 1200 + 600 * p, 0.8, v.out);
    const tex = v.buffer(texture(v.ctx, 'squelch'), T, null, v.gain(0.9, lp), p);
    v.noise('brown', T, null, v.filter('lowpass', 220, 1, v.gain(0.55, v.out)));                        // rumble
    const sq = v.gain(0.1, v.out);
    v.noise('pink', T, null, v.filter('bandpass', 750, 3, sq));
    const l = v.lfo(5 * p, 0.09, sq.gain, T, null);                                                      // drum rotation squish
    return {
      pitch(q, now) {
        tex.playbackRate.setTargetAtTime(q, now, 0.05); l.osc.frequency.setTargetAtTime(5 * q, now, 0.05);
        lp.frequency.setTargetAtTime(1200 + 600 * q, now, 0.05);
      },
    };
  },
});

// ---- Arsenal: dualies · slosher · splatling
// Dualies: lighter, snappier than the shooter (smaller nozzle) — a tight "tik-pff" with a slide clack; weapons.js
// alternates the pitch per hand (0.97 / 1.05) so the rhythm reads left-right.
def('shoot_dualies', {
  gain: 0.8, max: 10, jitter: 0.04, reverb: 0.06, minGap: 0.018,
  build(v, p) {
    v.nz({ f: 4800 * p, q: 1.8, a: 0.0003, d: 0.01, peak: 0.6 });                                        // snap
    v.nz({ t: 0.002, f: 3200 * p, q: 3, a: 0.0003, d: 0.006, peak: 0.35 });                              // slide clack
    const bp = v.r(2700, 3300) * p;
    v.nz({ f: bp, f1: bp * 0.6, sw: 0.04, q: 1.5, a: 0.0006, d: 0.04, peak: 0.72 });                     // pneumatic "pff"
    v.tone({ f: 210 * p, f1: 80 * p, sw: 0.04, a: 0.001, d: 0.042, peak: 0.45 });                        // small thump
    v.nz({ t: 0.008, f: v.r(1700, 2100) * p, f1: v.r(600, 760) * p, sw: 0.07, q: v.r(5, 7), a: 0.003, d: 0.07, peak: 0.55 }); // wet
    v.nz({ ft: 'highpass', f: 5600, a: 0.001, d: 0.045, peak: 0.16 });
  },
});
// Dodge roll: a body whoosh, a rubbery skid across the deck, a wet smear, and the plant.
def('dualies_roll', {
  gain: 0.55, max: 3, jitter: 0.05, reverb: 0.08,
  build(v, p) {
    const T = v.t, g = v.gain(0, v.out), bp = v.filter('bandpass', 500, 1.2, g);
    sweep(bp.frequency, T, 450 * p, 1900 * p, 0.12); pts(g.gain, T, [[0, 0], [0.05, 0.6], [0.16, 0.35], [0.3, 0]]);
    v.noise('pink', T, T + 0.32, bp);                                                                     // whoosh
    v.nz({ t: 0.04, f: 900 * p, f1: 1400 * p, sw: 0.2, q: 4, a: 0.02, d: 0.2, peak: 0.3 });               // rubber skid
    v.nz({ t: 0.06, kind: 'pink', ft: 'lowpass', f: 1400, f1: 400, sw: 0.25, q: 1.5, a: 0.01, d: 0.22, peak: 0.45 }); // ink smear
    plips(v, 0.08, 3, 0.18, [800, 1500], 0.14, p);
    v.tone({ t: 0.29, f: 140 * p, f1: 60 * p, sw: 0.06, a: 0.002, d: 0.09, peak: 0.7 });                 // plant
    v.nz({ t: 0.29, f: 700 * p, f1: 380 * p, sw: 0.06, q: 3, a: 0.002, d: 0.07, peak: 0.4 });
  },
});
// Slosher heave: the weight coming round (a rising air swing) and the wave leaving the lip (a deep "shloop").
def('slosh_throw', {
  gain: 0.6, max: 3, jitter: 0.05, reverb: 0.14,
  build(v, p) {
    const T = v.t, g = v.gain(0, v.out), bp = v.filter('bandpass', 300, 1.6, g);
    bp.frequency.setValueAtTime(260 * p, T); bp.frequency.exponentialRampToValueAtTime(1400 * p, T + 0.13); bp.frequency.exponentialRampToValueAtTime(500 * p, T + 0.3);
    pts(g.gain, T, [[0, 0], [0.11, 0.65], [0.17, 0.4], [0.32, 0]]);
    v.noise('pink', T, T + 0.34, bp);                                                                     // swing
    v.tone({ t: 0.12, f: 180 * p, f1: 420 * p, sw: 0.09, a: 0.004, d: 0.12, peak: 0.55 });               // shloop (rising gloop)
    v.nz({ t: 0.12, f: 380 * p, f1: 1100 * p, sw: 0.1, q: 6, a: 0.006, d: 0.12, peak: 0.5 });
    v.tone({ t: 0.125, f: 110 * p, f1: 48 * p, sw: 0.14, a: 0.003, d: 0.2, peak: 0.7 });                 // body
    v.nz({ t: 0.14, f: 1500 * p, f1: 500 * p, sw: 0.35, q: 2.5, a: 0.01, d: 0.4, peak: 0.45 });          // sheet of ink tearing away
    bloops(v, 0.15, 3, 0.18, [350, 650], 0.22, p);
  },
});
// Slosher wave landing: a heavy wet slap with a spray and a patter of globs.
def('slosh_land', {
  gain: 0.58, max: 4, jitter: 0.06, reverb: 0.15, minGap: 0.05,
  build(v, p) {
    bigSplat(v, 0, p * 0.9, 0.95);
    v.nz({ ft: 'highpass', f: 2800, a: 0.0005, d: 0.025, peak: 0.45 });                                  // slap
    let t = 0.06;
    for (let i = 0; i < 6; i++) { t += v.r(0.02, 0.045); v.bub(v.t + t, v.r(650, 1500) * p, 0.14 * (1 - i / 8), v.r(0.014, 0.028), v.r(1.5, 2)); }
  },
});
// Splatling spin loop: motor whine + gear rattle + air; pitch = 0.6 (idle spin) … ~1.45 (full) … 1.5 streaming.
def('splatling_spin', {
  gain: 0.21, max: 3, jitter: 0, reverb: 0.05, oneShot: 1.2,
  loop(v, p) {
    const T = v.t, base = 180;
    const amp = v.gain(0.6, v.out);
    const lp = v.filter('lowpass', 1800 * p, 0.9, amp);
    const o1 = v.osc('sawtooth', base * p, T, null, lp);                                                 // motor
    const o2 = v.osc('square', base * 2.02 * p, T, null, v.filter('bandpass', base * 6 * p, 3, v.gain(0.08, amp)));
    const rat = v.gain(0.06, v.out), rbp = v.filter('bandpass', 2400, 2.5, rat);
    const rn = v.noise('white', T, null, rbp);
    const trem = v.lfo(base * p / 6, 0.05, rat.gain, T, null, 'square');                                  // barrel/gear rattle
    const air = v.gain(0.04 * p, v.out); v.noise('pink', T, null, v.filter('highpass', 3000, 0.7, air));
    return {
      pitch(q, now) {
        const k = 0.05;
        o1.frequency.setTargetAtTime(base * q, now, k); o2.frequency.setTargetAtTime(base * 2.02 * q, now, k);
        lp.frequency.setTargetAtTime(Math.min(1800 * q * q, 12000), now, k); trem.osc.frequency.setTargetAtTime(base * q / 6, now, k);
        air.gain.setTargetAtTime(0.04 * q, now, k); rbp.frequency.setTargetAtTime(2000 + 900 * q, now, k);
        void rn;
      },
    };
  },
});
// Splatling full charge: a hard mechanical clunk under a bright two-note chime (distinct from the charger's ting).
def('splatling_ready', {
  gain: 0.3, max: 2, jitter: 0, reverb: 0.18,
  build(v, p) {
    v.tone({ f: 170 * p, f1: 90 * p, sw: 0.04, a: 0.001, d: 0.06, peak: 0.8 });
    v.nz({ f: 2600 * p, q: 3, a: 0.0004, d: 0.012, peak: 0.6 });
    for (const [t, m] of [[0.02, 91], [0.075, 96]]) { const f = mtof(m) * p; v.tone({ t, f, a: 0.001, d: 0.5, peak: 0.34 }); v.tone({ t, f: f * 2.76, a: 0.001, d: 0.14, peak: 0.08 }); }
  },
});
// Splatling round (15/s): very short and tight so the stream reads as a buzzing torrent, not a wall of clicks.
def('shoot_splatling', {
  gain: 1.0, max: 10, jitter: 0.05, reverb: 0.05, minGap: 0.03,
  build(v, p) {
    v.nz({ f: 3600 * p, q: 1.6, a: 0.0003, d: 0.012, peak: 0.75 });
    v.nz({ f: 2400 * p, f1: 1300 * p, sw: 0.03, q: 1.6, a: 0.0005, d: 0.04, peak: 0.85 });
    v.tone({ f: 160 * p, f1: 70 * p, sw: 0.03, a: 0.001, d: 0.04, peak: 0.42 });
    v.nz({ t: 0.006, f: v.r(1500, 1900) * p, f1: 600 * p, sw: 0.06, q: 5, a: 0.002, d: 0.075, peak: 0.6 });   // wet
    v.nz({ t: 0.01, f: 2100 * p, f1: 1500 * p, sw: 0.08, q: 1.2, a: 0.004, d: 0.08, peak: 0.28 });             // fizz tail
  },
});
// Splatling spin-down after a stream: the motor winding down + a vent sigh.
def('splatling_wind', {
  gain: 0.34, max: 2, jitter: 0.03, reverb: 0.08,
  build(v, p) {
    const T = v.t, g = v.gain(0, v.out), lp = v.filter('lowpass', 2400, 0.9, g);
    const o = v.osc('sawtooth', 270 * p, T, T + 0.62, lp);
    sweep(o.frequency, T, 270 * p, 60 * p, 0.6); sweep(lp.frequency, T, 2400, 300, 0.6);
    pts(g.gain, T, [[0, 0], [0.02, 0.5], [0.3, 0.25], [0.6, 0]]);
    v.nz({ t: 0.03, f: 3500, f1: 1200, sw: 0.4, q: 1, a: 0.04, d: 0.35, peak: 0.12 });
  },
});

/* ---- Ink ---- */
def('splat_small', {
  gain: 0.42, max: 8, jitter: 0.07, reverb: 0.08, minGap: 0.03,
  build(v, p) {
    v.tone({ f: 170 * p, f1: 65 * p, sw: 0.06, a: 0.001, d: 0.08, peak: 0.8 });                         // thump
    v.nz({ f: v.r(2200, 3000) * p, f1: v.r(800, 1100) * p, sw: 0.09, q: v.r(2, 3.5), a: 0.001, d: 0.1, peak: 0.9 }); // wet spray
    const f = v.r(550, 750) * p;
    v.tone({ t: 0.006, f, f1: f * 0.32, sw: 0.05, a: 0.0015, d: 0.06, peak: 0.45 });                     // bloop
    plips(v, 0.03, 1 + (v.rng() < 0.5 ? 1 : 0), 0.05, [700, 1300], 0.15, p);
  },
});
def('splat_big', { gain: 0.55, max: 4, jitter: 0.06, reverb: 0.16, build(v, p) { bigSplat(v, 0, p, 1); } });
def('ink_hit_wall', {
  gain: 1.0, max: 6, jitter: 0.07, reverb: 0.07, minGap: 0.03,
  build(v, p) {
    v.nz({ f: v.r(1100, 1500) * p, f1: v.r(420, 560) * p, sw: 0.06, q: 4, a: 0.001, d: 0.07, peak: 0.9 });
    const f = v.r(850, 1000) * p;
    v.tone({ f, f1: f * 0.44, sw: 0.04, a: 0.001, d: 0.045, peak: 0.35 });
    v.nz({ ft: 'highpass', f: 4000, a: 0.0005, d: 0.02, peak: 0.3 });
  },
});
def('bomb_throw', {
  gain: 1.0, max: 3, jitter: 0.05, reverb: 0.05,
  build(v, p) {
    v.tone({ type: 'triangle', f: 330 * p, f1: 210 * p, sw: 0.03, a: 0.001, d: 0.05, peak: 0.4 });
    v.nz({ f: 500 * p, f1: 2200 * p, sw: 0.22, q: 1.5, a: 0.08, d: 0.14, peak: 0.5 });
  },
});
def('bomb_beep', {
  gain: 0.2, max: 3, jitter: 0, reverb: 0.05, minGap: 0.05,
  build(v, p) {
    const lp = v.filter('lowpass', 4000, 0.8, v.out);
    v.tone({ type: 'square', f: 1480 * p, a: 0.002, h: 0.05, d: 0.03, peak: 0.22, to: lp });
    v.tone({ f: 1480 * p, a: 0.002, h: 0.05, d: 0.04, peak: 0.35 });
  },
});
def('bomb_explode', {
  gain: 0.6, max: 3, jitter: 0.05, reverb: 0.28,
  build(v, p) {
    v.tone({ f: 90 * p, f1: 30 * p, sw: 0.5, a: 0.002, d: 0.7, peak: 1 });
    v.nz({ ft: 'highpass', f: 2000, a: 0.0003, d: 0.04, peak: 0.9 });
    const sh = v.shaper(2, v.gain(0.8, v.out));
    v.nz({ kind: 'pink', ft: 'lowpass', f: 5000, f1: 180, sw: 0.6, q: 0.9, a: 0.002, d: 0.7, peak: 1, to: sh });
    v.nz({ t: 0.04, f: 1500 * p, f1: 350 * p, sw: 0.5, q: 3, a: 0.004, d: 0.6, peak: 0.7 });
    bloops(v, 0.05, 5, 0.25, [350, 700], 0.3, p);
    v.nz({ t: 0.06, ft: 'highpass', f: 3000, a: 0.04, d: 0.7, peak: 0.3 });
  },
});

/* ---- Squid ---- */
def('squid_in', {
  gain: 0.4, max: 3, jitter: 0.06, reverb: 0.05,
  build(v, p) {
    v.tone({ f: 950 * p, f1: 240 * p, sw: 0.09, a: 0.002, d: 0.12, peak: 0.7 });
    v.nz({ f: 900 * p, f1: 380 * p, sw: 0.1, q: 6, a: 0.004, d: 0.1, peak: 0.55 });
    plips(v, 0.05, 2, 0.05, [900, 1400], 0.18, p);
  },
});
def('squid_out', {
  gain: 0.48, max: 3, jitter: 0.06, reverb: 0.05,
  build(v, p) {
    v.tone({ f: 260 * p, f1: 1050 * p, sw: 0.07, a: 0.002, d: 0.09, peak: 0.6 });
    v.nz({ ft: 'highpass', f: 3000, a: 0.002, d: 0.07, peak: 0.25 });
    v.nz({ f: 600 * p, f1: 1400 * p, sw: 0.06, q: 4, a: 0.002, d: 0.07, peak: 0.4 });
  },
});
def('swim', {
  gain: 0.18, max: 2, jitter: 0, reverb: 0.03, oneShot: 1.5,
  loop(v, p) {
    const T = v.t;
    const lp = v.filter('lowpass', 1300, 0.9, v.out);
    const tex = v.buffer(texture(v.ctx, 'bubbles'), T, null, v.gain(1, lp), p);
    v.lfo(0.7, 420, lp.frequency, T, null);
    const rum = v.gain(0.35, v.out);
    v.noise('brown', T, null, v.filter('lowpass', 300, 1, rum));
    v.lfo(0.31, 0.12, rum.gain, T, null);
    return { pitch(q, now) { tex.playbackRate.setTargetAtTime(q, now, 0.05); } };
  },
});
def('climb', {
  gain: 0.16, max: 2, jitter: 0, reverb: 0.03, oneShot: 1.5,
  loop(v, p) {
    const T = v.t;
    const bp = v.filter('bandpass', 1800, 0.8, v.out);
    const tex = v.buffer(texture(v.ctx, 'bubbles_bright'), T, null, v.gain(1.2, bp), p);
    const sc = v.gain(0.12, v.out);
    v.noise('pink', T, null, v.filter('bandpass', 1200, 2, sc));
    const l = v.lfo(7 * p, 0.1, sc.gain, T, null);
    return { pitch(q, now) { tex.playbackRate.setTargetAtTime(q, now, 0.05); l.osc.frequency.setTargetAtTime(7 * q, now, 0.05); } };
  },
});
def('swim_splash', {
  gain: 0.8, max: 3, jitter: 0.06, reverb: 0.08,
  build(v, p) {
    v.nz({ f: 1600 * p, f1: 700 * p, sw: 0.12, q: 2, a: 0.002, d: 0.16, peak: 0.8 });
    v.tone({ f: 500 * p, f1: 200 * p, sw: 0.06, a: 0.002, d: 0.07, peak: 0.3 });
    plips(v, 0.02, 3, 0.1, [700, 1500], 0.16, p);
  },
});
def('jump', {
  gain: 0.48, max: 3, jitter: 0.05, reverb: 0.03,
  build(v, p) {
    v.tone({ type: 'triangle', f: 280 * p, f1: 620 * p, sw: 0.09, a: 0.003, d: 0.1, peak: 0.35 });
    v.tone({ f: 280 * p, f1: 620 * p, sw: 0.09, a: 0.003, d: 0.1, peak: 0.3 });
    v.nz({ f: 800, f1: 1800, sw: 0.1, q: 1.5, a: 0.02, d: 0.08, peak: 0.2 });
  },
});
def('land', {
  gain: 0.4, max: 3, jitter: 0.06, reverb: 0.03,
  build(v, p) {
    v.tone({ f: 140 * p, f1: 55 * p, sw: 0.07, a: 0.001, d: 0.1, peak: 0.8 });
    v.nz({ f: 750 * p, f1: 420 * p, sw: 0.06, q: 3, a: 0.002, d: 0.08, peak: 0.5 });
    v.nz({ ft: 'highpass', f: 3000, a: 0.0005, d: 0.015, peak: 0.15 });
  },
});

/* ---- Combat feedback ---- */
// Consecutive hits climb 1.5 semitones a step (up to an octave) and swell slightly — the rhythm of landing a stream.
// Combo state is per AudioContext, so offline renders (tools/audio-test) stay independent.
const _hitCombo = new WeakMap();
def('hit_marker', {
  gain: 0.48, max: 4, jitter: 0, reverb: 0, minGap: 0.035,
  build(v, p) {
    let st = _hitCombo.get(v.ctx);
    if (!st) _hitCombo.set(v.ctx, (st = { t: -9, n: 0 }));
    st.n = v.t - st.t < 0.55 ? Math.min(st.n + 1, 8) : 0; st.t = v.t;
    const q = p * Math.pow(2, (st.n * 1.5) / 12), lift = 1 + st.n * 0.05;
    v.nz({ ft: 'highpass', f: 4500, a: 0.0003, d: 0.007, peak: 0.42 });                                 // tick
    v.nz({ f: 3400 * q, q: 4, a: 0.0006, d: 0.022, peak: 0.32 });                                      // wet "tsk"
    v.tone({ f: 1650 * q, f1: 1250 * q, sw: 0.02, a: 0.0008, d: 0.05, peak: 0.62 * lift });           // plink
    v.tone({ type: 'triangle', f: 3300 * q, a: 0.0005, d: 0.025, peak: 0.16 * lift });
  },
});
// Ink smacking a body — diegetic, 3D at the victim (weapons.js), under the UI tick. pitch < 1 = a heavy hit.
def('ink_hit_body', {
  gain: 0.5, max: 5, jitter: 0.07, reverb: 0.06, minGap: 0.03,
  build(v, p) {
    const lp = v.filter('lowpass', 2600, 0.8, v.out);
    v.tone({ f: 190 * p, f1: 70 * p, sw: 0.05, a: 0.001, d: 0.06, peak: 0.85, to: lp });                // smack
    v.nz({ f: 1300 * p, f1: 520 * p, sw: 0.07, q: 3, a: 0.001, d: 0.08, peak: 0.8 });                  // wet slap
    v.nz({ kind: 'pink', ft: 'lowpass', f: 900, a: 0.001, d: 0.05, peak: 0.5, to: lp });
    v.bub(v.t + v.r(0.015, 0.03), v.r(700, 1100) * p, 0.14, 0.025, 1.7);
  },
});
def('hurt', {
  gain: 0.5, max: 3, jitter: 0.06, reverb: 0.03, minGap: 0.06,
  build(v, p) {
    const lp = v.filter('lowpass', 1400, 0.8, v.out);
    v.tone({ f: 130 * p, f1: 50 * p, sw: 0.12, a: 0.002, d: 0.18, peak: 0.9, to: lp });
    v.nz({ f: 700 * p, f1: 260 * p, sw: 0.14, q: 5, a: 0.003, d: 0.16, peak: 0.8, to: lp });
    v.nz({ kind: 'pink', ft: 'lowpass', f: 600, a: 0.002, d: 0.1, peak: 0.5, to: lp });
  },
});
def('splat_enemy', {
  gain: 0.45, max: 3, jitter: 0, reverb: 0.18,
  build(v, p) {
    v.nz({ ft: 'highpass', f: 3000, a: 0.0003, d: 0.02, peak: 0.45 });                                 // crack
    v.tone({ f: 780 * p, f1: 170 * p, sw: 0.06, a: 0.001, d: 0.09, peak: 0.9 });                         // pop
    v.nz({ f: 2000, f1: 700, sw: 0.1, q: 2, a: 0.001, d: 0.1, peak: 0.6 });
    v.tone({ f: 110, f1: 45, sw: 0.1, a: 0.001, d: 0.15, peak: 0.6 });
    v.nz({ t: 0.005, kind: 'pink', ft: 'lowpass', f: 2400, f1: 300, sw: 0.2, q: 1.2, a: 0.002, d: 0.22, peak: 0.5 }); // the splat itself
    [88, 92, 95, 100].forEach((m, i) => {                                                                 // sparkle chime E maj
      const f = mtof(m) * p, t = 0.03 + i * 0.045;
      v.tone({ t, f, a: 0.001, d: 0.35, peak: 0.26 });
      v.tone({ t, f: f * 2.76, a: 0.001, d: 0.12, peak: 0.07 });
    });
    v.nz({ t: 0.03, ft: 'highpass', f: 7000, a: 0.05, d: 0.3, peak: 0.08 });
  },
});
def('splatted_self', {
  gain: 0.55, max: 1, jitter: 0, reverb: 0.22,
  build(v, p) {
    bigSplat(v, 0, p, 1.1);
    const T = v.t + 0.12, g = v.gain(0, v.out);
    const end = adsr(g.gain, T, 0.02, 0.3, 0.8, 0.22, 0.9, 0.25);
    const lp = v.filter('lowpass', 2000, 3, g);
    lp.frequency.setValueAtTime(2000, T); lp.frequency.exponentialRampToValueAtTime(700, T + 1.0);
    v.lfo(5, 300, lp.frequency, T, end);
    const o = v.osc('square', 620 * p, T, end + 0.01, lp);
    sweep(o.frequency, T, 620 * p, 150 * p, 0.95);                                                      // descending sad tone
    v.lfo(6, 30, o.detune, T, end);
  },
});
def('ally_splatted', {
  gain: 0.34, max: 2, jitter: 0, reverb: 0.15,
  build(v, p) {
    const lp = v.filter('lowpass', 1800, 0.7, v.out);
    v.nz({ f: 1200, f1: 400, sw: 0.15, q: 3, a: 0.002, d: 0.15, peak: 0.45, to: lp });
    v.tone({ t: 0.02, type: 'triangle', f: mtof(74) * p, a: 0.005, d: 0.25, peak: 0.35 });
    v.tone({ t: 0.13, type: 'triangle', f: mtof(69) * p, a: 0.005, d: 0.35, peak: 0.35 });
  },
});
def('enemy_ink_sizzle', {
  gain: 0.26, max: 2, jitter: 0, reverb: 0.02, oneShot: 1.2,
  loop(v, p) {
    const T = v.t;
    const hp = v.filter('highpass', 2000, 0.7, v.out);
    const tex = v.buffer(texture(v.ctx, 'sizzle'), T, null, v.gain(1, hp), p);
    const fz = v.gain(0.1, v.out);
    v.noise('pink', T, null, v.filter('bandpass', 5000, 0.7, fz));
    v.lfo(11, 0.05, fz.gain, T, null); v.lfo(17.3, 0.04, fz.gain, T, null);
    v.noise('brown', T, null, v.filter('lowpass', 400, 1, v.gain(0.14, v.out)));
    return { pitch(q, now) { tex.playbackRate.setTargetAtTime(q, now, 0.05); } };
  },
});

/* ---- Status / specials ---- */
def('low_ink', {
  gain: 0.38, max: 1, jitter: 0, reverb: 0.04, minGap: 0.4,
  build(v, p) {
    for (const t of [0, 0.15]) {
      v.tone({ t, f: 520 * p, f1: 300 * p, sw: 0.07, a: 0.002, d: 0.1, peak: 0.5 });
      v.tone({ t, type: 'triangle', f: 260 * p, f1: 150 * p, sw: 0.07, a: 0.002, d: 0.08, peak: 0.2 });
    }
  },
});
def('empty_click', {
  gain: 0.6, max: 2, jitter: 0.03, reverb: 0, minGap: 0.08,
  build(v, p) {
    v.nz({ f: 2400 * p, q: 2, a: 0.0003, d: 0.006, peak: 0.8 });
    v.tone({ type: 'square', f: 190 * p, a: 0.0005, d: 0.018, peak: 0.3, to: v.filter('lowpass', 900, 1, v.out) });
    v.nz({ t: 0.028, f: 3200 * p, q: 2, a: 0.0003, d: 0.005, peak: 0.4 });
    v.nz({ t: 0.035, f: 2800 * p, f1: 1600 * p, sw: 0.06, q: 1.4, a: 0.004, d: 0.06, peak: 0.2 });    // tank dry: a thin sputter of air
    v.bub(v.t + 0.05, 1300 * p, 0.06, 0.02, 1.6);                                                       // …and a last spit of ink
  },
});
def('refill_full', {
  gain: 0.26, max: 1, jitter: 0, reverb: 0.12,
  build(v, p) {
    v.tone({ f: 400 * p, f1: 1200 * p, sw: 0.06, a: 0.002, d: 0.07, peak: 0.4 });
    bell(v, v.t + 0.05, mtof(84) * p, 0.35, { d: 0.45, index: 1.2 });
    bell(v, v.t + 0.11, mtof(91) * p, 0.35, { d: 0.55, index: 1.2 });
  },
});
def('special_ready', {
  gain: 0.35, max: 1, jitter: 0, reverb: 0.25,
  build(v, p) {
    const lp = v.filter('lowpass', 3500, 1, v.out), pw = pulseWave(v.ctx, 0.25);
    [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => v.tone({ t: i * 0.045, type: pw, f: mtof(m) * p, a: 0.002, d: 0.18, peak: 0.22, to: lp }));
    bell(v, v.t + 0.32, mtof(96) * p, 0.3, { d: 0.7 });
    const g = v.gain(0, v.out), bp = v.filter('bandpass', 800, 2, g);
    sweep(bp.frequency, v.t, 800, 6000, 0.32);
    pts(g.gain, v.t, [[0, 0], [0.3, 0.35], [0.36, 0]]);
    v.noise('white', v.t, v.t + 0.38, bp);
    for (const m of [72, 76, 79]) pad(v, v.t + 0.3, mtof(m) * p, 0.25, 0.1, { a: 0.02, r: 0.4, cut: 2600 });
  },
});
def('special_activate', {
  gain: 0.45, max: 2, jitter: 0, reverb: 0.2,
  build(v, p) {
    const T = v.t;
    v.nz({ f: 300, f1: 3000, sw: 0.35, q: 2, a: 0.25, d: 0.15, peak: 0.6 });
    const g = v.gain(0, v.out), end = ahr(g.gain, T, 0.05, 0.25, 0.25, 0.2);
    const lp = v.filter('lowpass', 600, 2, g);
    sweep(lp.frequency, T, 600, 4000, 0.35);
    for (const r of [1, 1.5]) { const o = v.osc('sawtooth', 110 * r * p, T, end + 0.01, lp); sweep(o.frequency, T, 110 * r * p, 440 * r * p, 0.35); }
    v.tone({ t: 0.35, f: 120, f1: 40, sw: 0.25, a: 0.002, d: 0.3, peak: 0.9 });
    v.nz({ t: 0.35, kind: 'pink', ft: 'lowpass', f: 3000, f1: 200, sw: 0.3, q: 1, a: 0.002, d: 0.3, peak: 0.6 });
  },
});
def('special_slam', {
  gain: 0.48, max: 2, jitter: 0.03, reverb: 0.32,
  build(v, p) {
    v.tone({ f: 70 * p, f1: 24 * p, sw: 0.9, a: 0.002, d: 1.1, peak: 1 });
    v.nz({ ft: 'highpass', f: 1800, a: 0.0003, d: 0.05, peak: 1 });
    const sh = v.shaper(2.5, v.gain(0.7, v.out));
    v.nz({ kind: 'pink', ft: 'lowpass', f: 6000, f1: 150, sw: 0.8, q: 0.8, a: 0.002, d: 1.0, peak: 1, to: sh });
    v.nz({ t: 0.05, f: 900, f1: 250, sw: 0.9, q: 2, a: 0.01, d: 1.0, peak: 0.6 });                     // rushing wave
    bloops(v, 0.06, 6, 0.4, [300, 700], 0.3, p);
    v.nz({ t: 0.08, ft: 'highpass', f: 3000, a: 0.05, d: 0.9, peak: 0.3 });
  },
});
def('storm_rain', {
  gain: 0.22, max: 2, jitter: 0, reverb: 0.1, oneShot: 2,
  loop(v, p) {
    const T = v.t;
    const tex = v.buffer(texture(v.ctx, 'rain'), T, null, v.gain(1, v.filter('highpass', 900, 0.7, v.out)), p);
    const hs = v.gain(0.22, v.out);
    v.noise('pink', T, null, v.filter('bandpass', 3000, 0.5, hs));
    v.lfo(0.23, 0.06, hs.gain, T, null);
    v.noise('brown', T, null, v.filter('lowpass', 180, 1, v.gain(0.3, v.out)));
    return { pitch(q, now) { tex.playbackRate.setTargetAtTime(q, now, 0.05); } };
  },
});
def('storm_thunder', {
  gain: 0.6, max: 2, jitter: 0.05, reverb: 0.35,
  build(v, p) {
    const n = 3 + Math.floor(v.r(0, 3));
    for (let i = 0; i < n; i++) v.nz({ t: v.r(0, 0.25), ft: 'highpass', f: 1500, a: 0.001, d: v.r(0.03, 0.08), peak: v.r(0.3, 0.6) });
    v.nz({ kind: 'brown', ft: 'lowpass', f: 400 * p, f1: 120 * p, sw: 2.0, q: 1, a: 0.05, d: 2.2, peak: 1 });
    const g = v.gain(0, v.out);
    pts(g.gain, v.t, [[0, 0], [0.3, 1], [0.6, 0.5], [0.9, 0.8], [1.6, 0.2], [2.4, 0]]);
    v.noise('brown', v.t, v.t + 2.45, v.filter('lowpass', 250, 1, g));
    v.tone({ f: 60 * p, f1: 35 * p, sw: 0.6, a: 0.01, d: 0.8, peak: 0.6 });
  },
});
def('respawn', {
  gain: 0.35, max: 2, jitter: 0, reverb: 0.25,
  build(v, p) {
    v.tone({ f: 300 * p, f1: 1300 * p, sw: 0.35, a: 0.03, h: 0.22, d: 0.2, peak: 0.3 });
    for (let i = 0; i < 8; i++) v.bub(v.t + i * 0.05 + v.r(0, 0.02), (500 + i * 140) * p, 0.14, 0.03, 1.8);
    [79, 84, 88].forEach((m, i) => bell(v, v.t + 0.35 + i * 0.03, mtof(m) * p, 0.25, { d: 0.6 }));
    v.nz({ f: 600, f1: 3000, sw: 0.4, q: 1.5, a: 0.3, d: 0.15, peak: 0.3 });
  },
});
def('super_jump', {
  gain: 0.42, max: 2, jitter: 0.03, reverb: 0.2,
  build(v, p) {
    v.tone({ type: 'triangle', f: 200 * p, f1: 900 * p, sw: 0.25, a: 0.01, d: 0.28, peak: 0.35 });
    v.tone({ f: 600 * p, f1: 2400 * p, sw: 0.7, a: 0.05, h: 0.4, d: 0.3, peak: 0.2 });
    v.nz({ f: 400, f1: 2500, sw: 0.5, q: 1.2, a: 0.02, d: 0.6, peak: 0.6 });
    v.tone({ f: 110, f1: 50, sw: 0.15, a: 0.002, d: 0.2, peak: 0.7 });
  },
});

/* ---- Match flow ---- */
def('ready', {
  gain: 0.4, max: 1, jitter: 0, reverb: 0.25,
  build(v, p) {
    const T = v.t;
    const g = v.gain(0, v.out), bp = v.filter('bandpass', 300, 1.8, g);
    sweep(bp.frequency, T, 300, 4000, 1.1);
    pts(g.gain, T, [[0, 0], [0.9, 0.5], [1.1, 0.6], [1.22, 0]]);
    v.noise('white', T, T + 1.25, bp);
    const cg = v.gain(0, v.out);
    pts(cg.gain, T, [[0, 0], [1.02, 0.1], [1.1, 0.1], [1.25, 0]]);
    const lp = v.filter('lowpass', 400, 1.5, cg);
    sweep(lp.frequency, T, 400, 5000, 1.1);
    [48, 55, 60, 64].forEach((m, i) => {
      const o = v.osc('sawtooth', mtof(m) * p, T, T + 1.27, lp);
      o.detune.setValueAtTime(-1200 + (i - 1.5) * 6, T); o.detune.linearRampToValueAtTime((i - 1.5) * 6, T + 1.1);
    });
    v.tone({ t: 1.08, f: 600, f1: 1400, sw: 0.06, a: 0.002, d: 0.12, peak: 0.3 });
  },
});
def('go_horn', {
  gain: 0.5, max: 1, jitter: 0, reverb: 0.28,
  build(v, p) {
    const T = v.t;
    for (const [m, pan] of [[60, -0.3], [64, 0.25], [67, -0.15], [72, 0.3], [76, 0]]) brass(v, T, mtof(m) * p, 0.42, 0.34, { to: v.pan(pan, v.out), bright: 4200, a: 0.012, r: 0.35 });
    crash(v, T, 0.45);
    kick(v, T, 0.8);
  },
});
def('countdown_tick', {
  gain: 0.3, max: 2, jitter: 0, reverb: 0.06, minGap: 0.2,
  build(v, p) {
    v.tone({ f: 880 * p, a: 0.001, h: 0.05, d: 0.06, peak: 0.55 });
    v.tone({ type: 'square', f: 880 * p, a: 0.001, h: 0.04, d: 0.04, peak: 0.1, to: v.filter('lowpass', 3000, 0.7, v.out) });
  },
});
def('final_count', {
  gain: 0.38, max: 2, jitter: 0, reverb: 0.08, minGap: 0.2,
  build(v, p) {
    v.tone({ f: 1320 * p, a: 0.001, h: 0.08, d: 0.08, peak: 0.55 });
    const lp = v.filter('lowpass', 4500, 0.7, v.out);
    v.tone({ type: 'square', f: 660 * p, a: 0.001, h: 0.07, d: 0.06, peak: 0.16, to: lp });
    v.tone({ type: 'sawtooth', f: 1326 * p, a: 0.001, h: 0.05, d: 0.05, peak: 0.06, to: lp });
    v.nz({ ft: 'highpass', f: 5000, a: 0.0004, d: 0.01, peak: 0.3 });
  },
});
def('one_minute', {
  gain: 0.36, max: 1, jitter: 0, reverb: 0.2,
  build(v, p) {
    const lp = v.filter('lowpass', 4000, 0.8, v.out), pw = pulseWave(v.ctx, 0.25);
    for (const [m, t, h] of [[67, 0, 0.08], [72, 0.1, 0.08], [76, 0.2, 0.08], [79, 0.3, 0.35]]) {
      v.tone({ t, type: pw, f: mtof(m) * p, a: 0.003, h, d: 0.12, peak: 0.25, to: lp });
      bell(v, v.t + t, mtof(m + 12) * p, 0.12, { d: 0.4 });
    }
  },
});
def('times_up', {
  gain: 0.27, max: 1, jitter: 0, reverb: 0.3,
  build(v, p) {
    const T = v.t;
    const g = v.gain(0, v.out);                                                                          // referee whistle
    ahr(g.gain, T, 0.02, 0.35, 0.55, 0.08);
    const o = v.osc('sine', 2600, T, T + 0.7, g);
    v.lfo(28, 160, o.frequency, T, T + 0.7);
    v.nz({ f: 2600, q: 3, a: 0.02, h: 0.55, d: 0.08, peak: 0.12 });
    const t2 = T + 0.72;                                                                                 // stinger
    for (const [m, pan] of [[58, -0.3], [62, 0.3], [65, -0.1], [70, 0.2]]) brass(v, t2, mtof(m) * p, 0.14, 0.38, { to: v.pan(pan, v.out), bright: 3800, a: 0.01, r: 0.45 });
    crash(v, t2, 0.4); tom(v, t2, 70, 0.8); kick(v, t2, 0.7);
  },
});
// snare roll: noise + body amplitude-modulated by a decaying-stroke waveform (~22 strokes/s), hand accents at half rate
function snareRoll(v, T, t1, p, to) {
  const am = v.gain(0, to);
  const st = v.osc(strokeWave(v.ctx, 7), 22 * p, T, t1);
  const depth = v.gain(0.85); st.connect(depth); depth.connect(am.gain);
  am.gain.value = 0.16;
  v.lfo(11 * p, 0.12, am.gain, T, t1);
  v.noise('white', T, t1, v.filter('highpass', 1200, 0.7, am));
  v.osc('triangle', 190, T, t1, v.gain(0.35, am));
  return st;
}
def('judge_drumroll', {
  gain: 0.42, max: 1, jitter: 0, reverb: 0.2,
  build(v, p) {
    const T = v.t, c = v.gain(0, v.out);
    pts(c.gain, T, [[0, 0], [0.04, 0.25], [2.85, 1], [3.0, 0]]);
    snareRoll(v, T, T + 3.02, p, c);
  },
  loop(v, p) {
    const st = snareRoll(v, v.t, null, p, v.gain(0.8, v.out));
    return { pitch(q, now) { st.frequency.setTargetAtTime(22 * q, now, 0.05); } };
  },
});
def('judge_reveal', {
  gain: 0.5, max: 1, jitter: 0, reverb: 0.35,
  build(v, p) {
    const T = v.t;
    crash(v, T, 0.8, { d: 2.0 }); kick(v, T, 0.9); tom(v, T, 65, 0.6);
    for (const [m, pan] of [[48, 0], [60, -0.3], [64, 0.3], [67, -0.15], [72, 0.15]]) brass(v, T, mtof(m) * p, 1.0, 0.3, { to: v.pan(pan, v.out), bright: 3600, a: 0.015, r: 0.6 });
    [84, 88, 91, 96].forEach((m, i) => bell(v, T + 0.05 + i * 0.05, mtof(m) * p, 0.14, { d: 0.9 }));
  },
});
def('victory_fanfare', {
  gain: 0.28, max: 1, jitter: 0, reverb: 0.3,
  build(v, p) {
    const T = v.t, b = 60 / 132;
    // melody (beat, midi, beats)
    for (const [bt, m, len] of [[0, 67, 0.3], [0.333, 72, 0.3], [0.667, 76, 0.3], [1, 79, 0.9], [2, 76, 0.45], [2.5, 79, 0.45], [3, 81, 0.7], [3.75, 83, 0.22], [4, 84, 2.6]]) {
      brass(v, T + bt * b, mtof(m) * p, len * b, 0.5, { bright: 4500, a: 0.012, r: 0.25 });
    }
    // harmony: C | Am | F G | C
    for (const [bt, ms, len] of [[1, [60, 64, 67], 0.9], [2, [57, 60, 64], 0.9], [3, [53, 57, 60], 0.45], [3.5, [55, 59, 62], 0.45], [4, [48, 55, 60, 64, 67], 2.6]]) {
      ms.forEach((m, i) => brass(v, T + bt * b, mtof(m) * p, len * b, 0.2, { to: v.pan(i % 2 ? 0.35 : -0.35, v.out), bright: 2600, a: 0.02, r: 0.3 }));
    }
    for (const [bt, m] of [[1, 36], [2, 33], [3, 29], [3.5, 31], [4, 36]]) {
      bass(v, T + bt * b, mtof(m) * p, (bt === 4 ? 2.4 : 0.8) * b, 0.7, { style: 'sub' });
      tom(v, T + bt * b, mtof(m + 12) * p, 0.6);
    }
    for (const bt of [0, 0.333, 0.667]) snare(v, T + bt * b, 0.45);
    kick(v, T + b, 0.8); kick(v, T + 4 * b, 0.9);
    crash(v, T + 4 * b, 0.6, { d: 2 });
    [84, 88, 91, 96].forEach((m, i) => bell(v, T + (4.5 + i * 0.25) * b, mtof(m) * p, 0.12, { d: 0.8 }));
  },
});
def('defeat_jingle', {
  gain: 0.3, max: 1, jitter: 0, reverb: 0.25,
  build(v, p) {
    const T = v.t;
    for (const [t, m, len] of [[0, 72, 0.22], [0.28, 67, 0.22], [0.56, 68, 0.26], [0.9, 67, 1.1]]) {
      const T0 = T + t, f = mtof(m) * p, g = v.gain(0, v.out);
      const end = adsr(g.gain, T0, 0.03, 0.2, 0.8, 0.3, len, 0.2);
      const lp = v.filter('lowpass', 300, 5, g);                                                         // muted-horn "wah"
      lp.frequency.setValueAtTime(300, T0);
      lp.frequency.exponentialRampToValueAtTime(1500, T0 + Math.min(0.12, len * 0.5));
      lp.frequency.exponentialRampToValueAtTime(700, T0 + len + 0.1);
      const oscs = [-6, 6].map((dt) => { const o = v.osc('sawtooth', f, T0, end + 0.01, lp); o.detune.value = dt; return o; });
      if (len > 0.5) {
        v.lfo(5, 300, lp.frequency, T0 + 0.15, end);
        const vib = v.lfo(5, 20, oscs[0].detune, T0 + 0.15, end); vib.depth.connect(oscs[1].detune);
      }
      bass(v, T0, (f / 4) * (m === 72 ? 1 : 1), len, 0.35, { style: 'sub' });
    }
    v.bub(T + 2.15, 300 * p, 0.2, 0.08, 2.2);
  },
});
def('xp_tick', {
  gain: 0.4, max: 4, jitter: 0.01, reverb: 0.02, minGap: 0.03,
  build(v, p) {
    v.tone({ type: 'square', f: 1900 * p, a: 0.0005, d: 0.03, peak: 0.18, to: v.filter('highpass', 1000, 0.7, v.out) });
    v.tone({ f: 3800 * p, a: 0.0005, d: 0.02, peak: 0.2 });
  },
});
def('level_up', {
  gain: 0.4, max: 1, jitter: 0, reverb: 0.3,
  build(v, p) {
    const T = v.t;
    [72, 76, 79, 84, 88, 91, 96].forEach((m, i) => bell(v, T + i * 0.05, mtof(m) * p, 0.2, { d: 0.5, ratio: 2, index: 1.2 }));
    for (const m of [72, 76, 79, 84]) pad(v, T + 0.35, mtof(m) * p, 0.3, 0.12, { a: 0.02, r: 0.6, cut: 3000 });
    v.nz({ ft: 'highpass', f: 8000, a: 0.3, d: 0.6, peak: 0.06 });
    v.tone({ t: 0.35, f: 65.4 * p, a: 0.005, d: 0.5, peak: 0.3 });
  },
});

/* ---- Footsteps + world ambience (lead additions) ---- */
def('step_dry', {
  gain: 0.16, max: 6, jitter: 0.08, reverb: 0.02, minGap: 0.05,
  build(v, p) {
    // rubber sole on concrete: short low thump + soft grit scuff
    v.tone({ f: 120 * p, f1: 70 * p, sw: 0.03, a: 0.001, d: 0.045, peak: 0.55 });
    v.nz({ f: 2600 * p, q: 0.9, a: 0.002, d: 0.035, peak: 0.28 });
    v.nz({ ft: 'highpass', f: 5200, a: 0.001, d: 0.012, peak: 0.12 });
  },
});
def('step_ink', {
  gain: 0.2, max: 6, jitter: 0.08, reverb: 0.03, minGap: 0.05,
  build(v, p) {
    // wet squelch: filtered noise sweep + a couple of tiny plips
    v.nz({ f: 1300 * p, f1: 520 * p, sw: 0.05, q: 3.5, a: 0.002, d: 0.07, peak: 0.6 });
    v.tone({ f: 190 * p, f1: 110 * p, sw: 0.04, a: 0.001, d: 0.05, peak: 0.35 });
    plips(v, 0.01, 2, 0.05, [900, 1900], 0.12, p);
  },
});
def('step_enemy', {
  gain: 0.2, max: 6, jitter: 0.06, reverb: 0.02, minGap: 0.06,
  build(v, p) {
    // sticky: slower, lower squelch with a tacky release click
    v.nz({ f: 700 * p, f1: 330 * p, sw: 0.09, q: 5, a: 0.004, d: 0.1, peak: 0.6 });
    v.tone({ f: 140 * p, f1: 85 * p, sw: 0.06, a: 0.002, d: 0.08, peak: 0.35 });
    v.nz({ t: 0.07, ft: 'highpass', f: 3500, a: 0.001, d: 0.015, peak: 0.25 });
  },
});
def('ink_drip', {
  gain: 0.18, max: 4, jitter: 0.12, reverb: 0.05, minGap: 0.04,
  build(v, p) { plips(v, 0, 1, 0.01, [1100, 2100], 0.3, p); },
});
def('gull', {
  gain: 0.2, max: 2, jitter: 0.1, reverb: 0.35,
  build(v, p) {
    // two-syllable gull cry: bright glide with a nasal band-pass formant
    const bp = v.filter('bandpass', 2300 * p, 2.2, v.out);
    v.tone({ type: 'sawtooth', f: 1450 * p, f1: 980 * p, sw: 0.18, a: 0.02, d: 0.2, peak: 0.35, to: bp });
    v.tone({ t: 0.26, type: 'sawtooth', f: 1320 * p, f1: 900 * p, sw: 0.22, a: 0.02, d: 0.26, peak: 0.3, to: bp });
  },
});
def('ferry_horn', {
  gain: 0.3, max: 1, jitter: 0.02, reverb: 0.55,
  build(v, p) {
    // a ship's horn out in the channel: a low major-third chord, brassy harmonics under a lowpass, slight wobble;
    // one long blast then a short one
    const lp = v.filter('lowpass', 820 * p, 0.9, v.out);
    for (const [t, h] of [[0, 1.35], [2.05, 0.55]]) {
      v.tone({ t, type: 'sawtooth', f: 98 * p, f1: 97 * p, sw: h, a: 0.14, h, d: 0.65, peak: 0.42, to: lp });
      v.tone({ t, type: 'sawtooth', f: 123.5 * p, f1: 122.4 * p, sw: h, a: 0.16, h, d: 0.7, peak: 0.34, to: lp });
      v.tone({ t, type: 'square', f: 49 * p, a: 0.2, h, d: 0.6, peak: 0.16, to: lp });
    }
  },
});
def('halyard_clink', {
  gain: 0.07, max: 6, jitter: 0.12, reverb: 0.3, minGap: 0.03,
  build(v, p) {
    // a halyard slapping an aluminium mast: inharmonic metal partials, a quick bounce
    const f = 1850 * p;
    for (const [t, k] of [[0, 1], [0.07 + v.r(0, 0.05), 0.45]]) {
      for (const [r, a, d] of [[1, 0.5, 0.2], [2.76, 0.26, 0.1], [5.4, 0.12, 0.05], [8.93, 0.06, 0.03]]) v.tone({ t, f: f * r, a: 0.0008, d, peak: a * k });
    }
  },
});
def('harbor_ambience', {
  gain: 0.12, max: 1, jitter: 0, reverb: 0.1, oneShot: 3,
  loop(v, p) {
    // sea wash against the pilings: brown noise swells + a brighter hiss riding the crests
    const T = v.t;
    const lp = v.filter('lowpass', 520, 0.7, v.out);
    const wash = v.gain(0.9, lp);
    v.noise('brown', T, null, wash);
    v.lfo(0.11, 0.45, wash.gain, T, null);
    const hp = v.filter('bandpass', 2600, 0.6, v.out);
    const hiss = v.gain(0.08, hp);
    v.noise('pink', T, null, hiss);
    v.lfo(0.17, 0.06, hiss.gain, T, null);
    return { pitch() {} };
  },
});

/* ------------------------------------------------------------------------------------------------------------ */
export const SFX_GROUPS = {
  UI: ['ui_hover', 'ui_click', 'ui_back', 'ui_confirm', 'ui_toggle', 'ui_slider', 'ui_error'],
  Weapons: ['shoot_shooter', 'shoot_blaster', 'blaster_pump', 'blaster_boom', 'charger_charge', 'charger_full', 'shoot_charger', 'roller_flick', 'roll',
    'shoot_dualies', 'dualies_roll', 'slosh_throw', 'slosh_land', 'splatling_spin', 'splatling_ready', 'shoot_splatling', 'splatling_wind'],
  Ink: ['splat_small', 'splat_big', 'ink_hit_wall', 'bomb_throw', 'bomb_beep', 'bomb_explode'],
  Squid: ['squid_in', 'squid_out', 'swim', 'swim_splash', 'jump', 'land', 'climb', 'step_dry', 'step_ink', 'step_enemy', 'ink_drip'],
  World: ['gull', 'harbor_ambience', 'ferry_horn', 'halyard_clink'],
  Combat: ['hit_marker', 'ink_hit_body', 'hurt', 'splat_enemy', 'splatted_self', 'ally_splatted', 'enemy_ink_sizzle'],
  Status: ['low_ink', 'empty_click', 'refill_full', 'special_ready', 'special_activate', 'special_slam', 'storm_rain', 'storm_thunder', 'respawn', 'super_jump'],
  Match: ['ready', 'go_horn', 'countdown_tick', 'one_minute', 'final_count', 'times_up', 'judge_drumroll', 'judge_reveal', 'victory_fanfare', 'defeat_jingle', 'xp_tick', 'level_up'],
};
export const SFX_NAMES = Object.values(SFX_GROUPS).flat();
export const LOOP_NAMES = SFX_NAMES.filter((n) => SFX[n] && SFX[n].loop);

export const audio = new AudioEngine();
export { musicSingleton as music };

// Loaded as a module Worker by AudioEngine._warm: renders grain textures off the main thread.
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = ({ data: { kind, sr } }) => {
    const d = grainSamples(kind, sr);
    self.postMessage({ kind, d }, [d.buffer]);
  };
}
