// INKWAVE — procedural SFX engine (Web Audio). No audio files: every sound is synthesized per play.
//
//   import { audio } from './audio.js';
//   audio.init()                                   // idempotent; call from a user gesture (also inits music)
//   audio.setVolumes({ master, music, sfx, cues })  // 0..1 each (perceptual taper); cues 0..1.5 (the sub / special cue
//                                                  bus: 1 = the default cue mix, CUE_BOOST over the other SFX)
//   audio.setListener(pos, forward, up)            // THREE.Vector3-like {x,y,z}; every frame
//   audio.play(name, { pos, volume = 1, pitch = 1, ref })   // one-shot; pos → 3D (HRTF, inverse distance from `ref` m,
//                                                  default the def's ref or 3) else 2D; { cue: true, post } — a cue one-shot
//                                                  scaled by post (0 … 1) AFTER the cue compressor (a teammate's sub blast)
//   const h = audio.loop(name, { pos, volume, pitch }); h.set({ volume, pitch, pos, params }); h.stop(fade = 0.15)
//                                                  (params: loops with extra controls, e.g. zone_hum { mode, tension })
//   audio.duck(amount = 0.5, seconds = 1.2)        // temporarily lowers the music bus
//
// Loop pitch conventions: charger_charge pitch = 1 + 1.5 * charge (0..1); roll / swim / climb pitch ≈ 0.7 + speed
// factor (≈0.6..1.6), volume ≈ speed / maxSpeed. judge_drumroll works as a 3 s one-shot (play) or open loop (loop).
//
// Graph: voices → [lowpass(distance) → panner] → sfxIn → sfxBus ─┐
//        cue voices (isCue) → cueBus (the Cues slider) → cueComp ─→ sfxIn   (loops: → loopIn / cueLoopIn first)
//        cue one-shots with post < 1 → cuePost (its twin) → cuePostComp → cuePostOut (× post) → sfxIn
//        voices → reverb send → convolver (plaza IR) → sfxBus     ├→ master → glue comp → limiter → destination
//        music.js → musicBus → duck ─────────────────────────────┘
// Every builder works on any BaseAudioContext so tools/audio-test.mjs renders them through OfflineAudioContext.

import { DEFAULT_SETTINGS } from '../config.js';
import {
  V, music as musicSingleton, makeImpulse, mulberry32, mtof, perc, ahr, adsr, pts, sweep, strokeWave, pulseWave,
  kick, snare, crash, tom, brass, bell, pad, bass,
} from './music.js';
import { defineCueSounds, CUE_GROUPS } from './sfx-cues.js';   // sfx-cues: every sub / special's own sounds (src/audio/cues.js plays them)
import { defineAlertSounds, ALERT_GROUPS } from './sfx-alerts.js';   // sfx-loud: the flight glides, the special alerts / alarms / stings

const MAX_VOICES = 48;   // one-shots alive at once (oldest stolen beyond this)
const MAX_LOOPS = 32;   // sfx-cues: the cue director keeps up to 13 of its own (src/audio/cues.js) beside the weapons', zones' and ambience's
// sfx-loud: the sub / special cues sit this far over the rest of the SFX at the Cues slider's 100 % (+6 dB: "they all
// need to be louder", 2026-10-01); a gentle compressor on the cue bus keeps a pile of them from clipping or getting harsh
export const CUE_BOOST = 2;
const cueGain = (v) => CUE_BOOST * Math.pow(Math.min(1.5, Math.max(0, +v || 0)), 1.5);
// which sounds ride the cue bus: whatever the director plays (o.cue), and every sub's and special's own sound that game
// code plays itself (a Vortex Strike's launch, a Cheer Orb's blast, a kit sub's bounce …) — not a Crab Rig's gatling
// (a gun, like the other weapons)
let CUE_SET = null;
const KIT_CUE = /^(torpedo|tracer|boomerang|waddle|shaker)_/, NOT_CUE = new Set(['crab_gatling']);
export function isCue(name) {
  if (!CUE_SET) CUE_SET = new Set([...SFX_GROUPS.Subs, ...SFX_GROUPS.Specials, ...SFX_GROUPS.Flight, ...SFX_GROUPS['Special alerts'], ...SFX_GROUPS['Special stings'],
    'bomb_throw', 'bomb_beep', 'bomb_explode', 'special_slam', 'storm_rain', 'storm_thunder']);
  return (CUE_SET.has(name) || KIT_CUE.test(name)) && !NOT_CUE.has(name);
}
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
  const s = TEX[kind], sr = ctx.sampleRate, len = Math.floor(s.dur * sr);
  buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
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
  m.set(kind, buf);
  return buf;
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
    this.vol = { master: DEFAULT_SETTINGS.master ?? 0.8, music: DEFAULT_SETTINGS.music ?? 0.6, sfx: DEFAULT_SETTINGS.sfx ?? 0.85, cues: DEFAULT_SETTINGS.cues ?? 1 };
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
    // looping sounds (weapon charge / spin hums, rolls, stage machinery …) join the SFX through their own bus, so a pause
    // can hush every one of them at once (pauseLoops) and bring them back where they were
    this.loopIn = g(1);
    this.loopIn.connect(this.sfxIn);
    this.musicBus.connect(this.duckG); this.duckG.connect(this.master);
    // the sub / special cue bus (src/audio/cues.js plays with o.cue): its own volume (the Cues slider, CUE_BOOST over the
    // other SFX at 100 %) and a gentle compressor — a crowd of warnings and blasts stays clean, never clips; its loops
    // pause with the rest (cueLoopIn)
    this.cueBus = g(cueGain(this.vol.cues));
    this.cueComp = ctx.createDynamicsCompressor();
    this.cueComp.threshold.value = -10; this.cueComp.knee.value = 8; this.cueComp.ratio.value = 4; this.cueComp.attack.value = 0.004; this.cueComp.release.value = 0.2;
    this.cueBus.connect(this.cueComp); this.cueComp.connect(this.sfxIn);
    this.cueLoopIn = g(1); this.cueLoopIn.connect(this.cueBus);
    // its twin for a cue one-shot scaled AFTER the compressor (o.post: a teammate's sub blast at 0.6 × the enemy's —
    // cues.js MIX.boom.allySub): scaled before it, a close blast's compression all but evened the two out (−0.3 dB at 1.5 m
    // for 0.6 ×, measured in realflow.cjs); scaled after, it's that share of the enemy's as you hear it, near or far
    this.cuePost = g(cueGain(this.vol.cues));
    this.cuePostComp = ctx.createDynamicsCompressor();
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) this.cuePostComp[k].value = this.cueComp[k].value;
    this.cuePostOut = g(1);
    this.cuePost.connect(this.cuePostComp); this.cuePostComp.connect(this.cuePostOut); this.cuePostOut.connect(this.sfxIn);
    // shared plaza reverb (the loops' sends pause with them: loopRev; the cues' follow the Cues slider: cueRev)
    this.revSend = g(1);
    this.loopRev = g(1); this.loopRev.connect(this.revSend);
    this.cueRev = g(cueGain(this.vol.cues)); this.cueRev.connect(this.revSend);
    this.cueLoopRev = g(1); this.cueLoopRev.connect(this.cueRev);
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

  // pre-render grain textures in idle slices so the first swim/roll doesn't hitch
  _warm() {
    const kinds = Object.keys(TEX);
    const step = () => { const k = kinds.shift(); if (!k || !this.ctx) return; texture(this.ctx, k); setTimeout(step, 40); };
    setTimeout(step, 60);
  }

  setVolumes(v = {}) {
    for (const k of ['master', 'music', 'sfx']) if (v[k] != null && Number.isFinite(+v[k])) this.vol[k] = Math.min(1, Math.max(0, +v[k]));
    if (v.cues != null && Number.isFinite(+v.cues)) this.vol.cues = Math.min(1.5, Math.max(0, +v.cues));
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.cueBus.gain.setTargetAtTime(cueGain(this.vol.cues), t, 0.04);
    this.cuePost.gain.setTargetAtTime(cueGain(this.vol.cues), t, 0.04);
    this.cueRev.gain.setTargetAtTime(cueGain(this.vol.cues), t, 0.04);
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

  // ref: the def's reference distance (m) — giant sources (the boss) stay loud across the arena
  _panner(pos, ref = 3) {
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = this.hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse'; p.refDistance = ref; p.maxDistance = Math.max(60, ref * 20); p.rolloffFactor = 1.2;
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
    const d = this._dist(pos) * (voice.dk || 1);
    voice.lp.frequency.setTargetAtTime(distCut(d), t, 0.05);
    if (voice.send) voice.send.gain.setTargetAtTime(voice.rev * this._sendScale(d), t, 0.05);
  }

  _sendScale(d) { return Math.sqrt(3 / (3 + 1.2 * Math.max(0, d - 3))); }

  // refO: a per-call reference distance (sfx-cues: the cue director lets its cues carry further than their def says);
  // cue: through the cue bus (the Cues slider, its compressor)
  _voice(def, t, pos, vol, withFade, refO, cue, post = 1) {
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = vol;
    const v = new V(ctx, out, t, this.rng);
    v.nodes.push(out);
    const voice = { v, out, def, t, vol, panner: null, lp: null, send: null, rev: def.reverb ?? 0.08, fade: null };
    let head = out;
    if (withFade) { voice.fade = ctx.createGain(); out.connect(voice.fade); head = voice.fade; v.nodes.push(voice.fade); }
    let scale = 1;
    const toPost = cue && !withFade && post < 0.999;
    if (toPost) this.cuePostOut.gain.setValueAtTime(Math.max(0, post), t);
    const dest = toPost ? this.cuePost : cue ? (withFade ? this.cueLoopIn : this.cueBus) : withFade ? this.loopIn : this.sfxIn;
    if (validPos(pos)) {
      const ref = refO > 0 ? refO : (def.ref || 3);
      voice.dk = 3 / ref;                             // big sources: distance air-absorption / reverb scale with their size
      const d = this._dist(pos) * voice.dk;
      voice.lp = ctx.createBiquadFilter(); voice.lp.type = 'lowpass'; voice.lp.Q.value = 0.5; voice.lp.frequency.value = distCut(d);
      voice.panner = this._panner(pos, ref);
      head.connect(voice.lp); voice.lp.connect(voice.panner); voice.panner.connect(dest);
      v.nodes.push(voice.lp, voice.panner);
      voice.rev += Math.min(0.25, Math.max(0, (d - 6) / 60));
      scale = this._sendScale(d);
    } else head.connect(dest);   // (withFade: the loops)
    if (voice.rev > 0.001) {
      voice.send = ctx.createGain(); voice.send.gain.value = voice.rev * scale * (toPost ? post : 1);
      head.connect(voice.send); voice.send.connect(cue ? (withFade ? this.cueLoopRev : this.cueRev) : withFade ? this.loopRev : this.revSend); v.nodes.push(voice.send);
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
    const voice = this._voice(d, t, o.pos, vol, false, o.ref, o.cue ?? isCue(name), o.post ?? 1);
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
    const voice = this._voice(d, t, o.pos, Math.max(0, +(o.volume ?? 1) || 0) * gain, true, o.ref, o.cue ?? isCue(name));
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
        if (p.params && ctl.params) ctl.params(p.params, now);
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

  // lift any duck at once (a pause's long duck ends with the pause; duck(1, …) would duck to silence, not lift it)
  unduck(fade = 0.15) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, p = this.duckG.gain, v = this._duckAt(now), f = Math.max(0.01, +fade || 0.01);
    this._duck = null;
    this._duckPts = [[now, v], [now + f, 1]];
    p.cancelScheduledValues(now);
    p.setValueAtTime(v, now);
    p.linearRampToValueAtTime(1, now + f);
  }
  // hush (true) or restore (false) every loop — a paused match's charge hums, rolls and machinery stop sounding
  pauseLoops(on, fade = 0.08) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.loopsPaused = !!on;
    for (const n of [this.loopIn, this.cueLoopIn, this.loopRev, this.cueLoopRev]) {   // (the loops' reverb sends too)
      const p = n.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(on ? 0 : 1, now + Math.max(0.01, fade));
    }
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

/* ---- Special weapons ----
 * Loop pitch conventions: tornado pitch ≈ intensity (1..2); blower_inflate pitch ≈ bubble size (1..2);
 * booyah_charge pitch = 1 + charge (1..2, rises an octave); crab_move / crab_roll pitch ≈ speed factor (≈0.5..1.6);
 * wail_blast / jet_loop pitch ≈ 1 (small variations ok). */
// struck metal: inharmonic free-bar partials + a contact click
function clank(v, t, f, peak, d, p = 1, n = 4, to) {
  const P = [[1, 1, 1], [2.76, 0.55, 0.65], [5.4, 0.3, 0.4], [8.93, 0.15, 0.25]];
  for (let i = 0; i < n; i++) { const [r, a, k] = P[i]; v.tone({ t, f: f * r * p, a: 0.0006, d: d * k, peak: peak * a, to }); }
  v.nz({ t, ft: 'highpass', f: 3000, a: 0.0004, d: 0.01, peak: peak * 0.5, to });
}
// band-passed noise whoosh: centre f0 → fm (at `mid` of dur) → f1, level follows env ([[frac, level], ...])
function whoosh(v, t, dur, f0, fm, f1, peak, o = {}) {
  const T = v.t + t, g = v.gain(0, o.to || v.out), bp = v.filter('bandpass', f0, o.q ?? 1.5, g);
  bp.frequency.setValueAtTime(f0, T);
  bp.frequency.exponentialRampToValueAtTime(fm, T + dur * (o.mid ?? 0.55));
  bp.frequency.exponentialRampToValueAtTime(f1, T + dur);
  pts(g.gain, T, (o.env || [[0, 0], [0.5, 1], [0.7, 0.6], [1, 0]]).map(([x, y]) => [x * dur, y * peak]));
  v.noise(o.kind || 'pink', T, T + dur + 0.02, bp);
  return bp;
}
// big wet explosion core shared by the heavy impacts (sub drop, crack, driven noise burst, wash, bloops, hiss tail)
function inkBoom(v, t, p, s, o = {}) {
  const len = o.len ?? 1;
  v.tone({ t, f: (o.f ?? 85) * p, f1: (o.f1 ?? 26) * p, sw: 0.75 * len, a: 0.002, d: 0.95 * len, peak: s });
  v.tone({ t, type: 'triangle', f: 180 * p, f1: 55 * p, sw: 0.14, a: 0.001, d: 0.18, peak: 0.45 * s });
  v.nz({ t, ft: 'highpass', f: 1800, a: 0.0003, d: 0.05, peak: (o.crack ?? 1) * s });
  const sh = v.shaper(2.4, v.gain(0.75, v.out));
  v.nz({ t, kind: 'pink', ft: 'lowpass', f: o.bright ?? 5500, f1: 160, sw: 0.7 * len, q: 0.85, a: 0.002, d: 0.85 * len, peak: s, to: sh });
  v.nz({ t: t + 0.04, f: 1300 * p, f1: 280 * p, sw: 0.8 * len, q: 2.5, a: 0.006, d: 0.85 * len, peak: 0.65 * s });   // wash
  bloops(v, t + 0.05, o.bloops ?? 7, 0.45 * len, [280, 680], 0.3 * s, p);
  v.nz({ t: t + 0.07, ft: 'highpass', f: 3000, a: 0.05, d: 0.8 * len, peak: 0.28 * s });
  plips(v, t + 0.2, o.plips ?? 5, 0.6 * len, [800, 1700], 0.1 * s, p);                                  // droplets raining back
}
// sawtooth "voice" through parallel band-pass formants → to; returns the source oscillators
function vox(v, T, t1, f0, formants, to, detune = 8) {
  const mix = v.gain(1);
  const srcs = [-detune, detune].map((dt) => { const o = v.osc('sawtooth', f0, T, t1, mix); o.detune.value = dt; return o; });
  const fs = formants.map(([f, q, a]) => { const bp = v.filter('bandpass', f, q, v.gain(a, to)); mix.connect(bp); return bp; });
  return { srcs, fs };
}

def('special_end', {
  gain: 0.43, max: 2, jitter: 0, reverb: 0.25,
  build(v, p) {
    const T = v.t;
    const lp = v.filter('lowpass', 5000, 0.8, v.out), pw = pulseWave(v.ctx, 0.25);
    sweep(lp.frequency, T, 5000, 900, 0.5);
    [84, 79, 76, 72, 67, 60].forEach((m, i) => v.tone({ t: i * 0.05, type: pw, f: mtof(m) * p, f1: mtof(m) * 0.94 * p, sw: 0.15, a: 0.002, d: 0.15, peak: 0.2, to: lp }));
    const g = v.gain(0, v.out), end = ahr(g.gain, T, 0.02, 0.22, 0.18, 0.3);                            // falling glide
    const o = v.osc('triangle', 1400 * p, T, end + 0.01, g);
    sweep(o.frequency, T, 1400 * p, 200 * p, 0.5);
    v.lfo(9, 25, o.detune, T, end);
    const ng = v.gain(0, v.out), bp = v.filter('bandpass', 7000, 1.5, ng);                               // falling air
    sweep(bp.frequency, T, 7000, 500, 0.5);
    pts(ng.gain, T, [[0, 0], [0.04, 0.3], [0.5, 0]]);
    v.noise('white', T, T + 0.52, bp);
    v.tone({ t: 0.05, f: 220 * p, f1: 55 * p, sw: 0.4, a: 0.01, d: 0.4, peak: 0.35 });                  // power-down
  },
});
// a transformation special is about to run out (last ~2 s): a looping 8-bit figure that speeds up and climbs, like a
// power-up wearing off
def('special_ending', {
  gain: 0.34, max: 2, jitter: 0, reverb: 0.15,
  build(v, p) {
    const lp = v.filter('lowpass', 5200, 0.7, v.out), pw = pulseWave(v.ctx, 0.25);
    const fig = [72, 76, 79, 84, 79, 76];
    let t = 0, i = 0;
    while (t < 1.9) {
      const k = t / 1.9, gap = 0.15 - 0.085 * k;
      const m = fig[i % fig.length] + (k > 0.66 ? 2 : 0);
      v.tone({ t, type: pw, f: mtof(m) * p, a: 0.002, h: gap * 0.35, d: gap * 0.55, peak: 0.16 + 0.08 * k, to: lp });
      t += gap; i++;
    }
  },
});
def('shield_up', {
  gain: 0.37, max: 2, jitter: 0.02, reverb: 0.2,
  build(v, p) {
    const T = v.t;
    const g = v.gain(0, v.out), end = pts(g.gain, T, [[0, 0], [0.05, 0.22], [0.26, 0.32], [0.5, 0.06], [0.62, 0]]);
    const wob = { depth: v.gain(45) };                                                                    // wobble, speeding up
    wob.osc = v.osc('sine', 8, T, end, wob.depth);
    sweep(wob.osc.frequency, T, 8, 17, 0.3);
    [[1, 'triangle', 1], [1.5, 'sine', 0.5], [2.005, 'sine', 0.35]].forEach(([r, type, a], i) => {
      const o = v.osc(type, 300 * r * p, T, end + 0.01, v.gain(a, g));
      sweep(o.frequency, T, 300 * r * p, 900 * r * p, 0.28);
      o.detune.value = (i - 1) * 7; wob.depth.connect(o.detune);
    });
    whoosh(v, 0, 0.32, 900, 4500, 6000, 0.22, { q: 2, kind: 'white', mid: 0.8, env: [[0, 0], [0.8, 1], [1, 0]] });
    v.tone({ t: 0.26, f: 720 * p, f1: 260 * p, sw: 0.05, a: 0.001, d: 0.07, peak: 0.6 });               // soft pop
    v.tone({ t: 0.26, f: 170 * p, f1: 85 * p, sw: 0.1, a: 0.003, d: 0.14, peak: 0.45 });                 // whum
    bell(v, T + 0.27, mtof(96) * p, 0.1, { d: 0.5 });
    plips(v, 0.28, 2, 0.06, [1200, 1800], 0.1, p);
  },
});
def('shield_hit', {
  gain: 0.37, max: 4, jitter: 0.08, reverb: 0.08, minGap: 0.04,
  build(v, p) {
    const T = v.t;
    v.tone({ f: 260 * p, f1: 120 * p, sw: 0.05, a: 0.001, d: 0.06, peak: 0.7 });                        // thump
    for (const [f, a, d] of [[1850, 0.28, 0.09], [2790, 0.18, 0.07], [4150, 0.1, 0.05]]) v.tone({ f: f * p, a: 0.0006, d, peak: a }); // glass
    const g = v.gain(0, v.out), end = perc(g.gain, T + 0.008, 0.004, 0.45, 0.2);                       // boing
    const o = v.osc('sine', 330 * p, T + 0.008, end + 0.01, g);
    sweep(o.frequency, T + 0.008, 330 * p, 520 * p, 0.2);
    const o2 = v.osc('triangle', 660 * p, T + 0.008, end + 0.01, v.gain(0.2, g));
    sweep(o2.frequency, T + 0.008, 660 * p, 1040 * p, 0.2);
    const w = v.lfo(19, 0, o.detune, T + 0.008, end);
    w.depth.connect(o2.detune);
    pts(w.depth.gain, T + 0.008, [[0, 160], [0.2, 0]]);
    v.nz({ ft: 'highpass', f: 5000, a: 0.0004, d: 0.01, peak: 0.25 });
  },
});
def('shield_pop', {
  gain: 0.53, max: 2, jitter: 0.04, reverb: 0.22,
  build(v, p) {
    v.nz({ ft: 'highpass', f: 2500, a: 0.0004, d: 0.03, peak: 0.8 });
    v.tone({ f: 1100 * p, f1: 300 * p, sw: 0.06, a: 0.001, d: 0.08, peak: 0.7 });                       // pop
    v.tone({ f: 200 * p, f1: 70 * p, sw: 0.12, a: 0.002, d: 0.16, peak: 0.6 });                         // whump
    for (let i = 0; i < 9; i++) {                                                                         // glassy shards
      const f = v.r(2200, 5200) * p;
      v.tone({ t: 0.01 + v.r(0, 0.22), f, f1: f * 0.9, sw: 0.1, a: 0.0006, d: v.r(0.08, 0.2), peak: v.r(0.06, 0.14) });
    }
    whoosh(v, 0, 0.4, 6000, 3500, 1500, 0.35, { q: 3, kind: 'white', env: [[0, 0], [0.03, 1], [1, 0]] });
    plips(v, 0.03, 3, 0.1, [900, 1600], 0.2, p);
  },
});
def('sonar_ping', {
  gain: 0.35, max: 2, jitter: 0, reverb: 0.4,
  build(v, p) {
    const T = v.t, f = 523 * p;
    v.tone({ f: 70 * p, f1: 42 * p, sw: 0.4, a: 0.004, d: 0.55, peak: 0.7 });                          // sub pulse
    for (let k = 0; k < 6; k++) {                                                                         // ping + darkening echoes
      const t = k * 0.3, a = Math.pow(0.48, k), to = k ? v.pan(k % 2 ? 0.45 : -0.45, v.out) : v.out;
      v.tone({ t, f: f * 1.04, f1: f, sw: 0.05, a: 0.003, d: k ? 0.5 : 1.1, peak: 0.6 * a, to });
      v.tone({ t, f: f * 2, a: 0.002, d: k ? 0.12 : 0.35, peak: (k ? 0.04 : 0.14) * a, to });
    }
    const g = v.gain(0, v.out), bp = v.filter('bandpass', 2400, 2, g);                                   // wave rolling outward
    sweep(bp.frequency, T, 2400, 300, 1.6);
    pts(g.gain, T, [[0, 0], [0.08, 0.22], [0.5, 0.14], [1.7, 0]]);
    v.noise('pink', T, T + 1.72, bp);
    bell(v, T, 1568 * p, 0.08, { d: 1.2, ratio: 2.01, index: 0.8 });
  },
});
def('sonar_mark', {
  gain: 0.235, max: 1, jitter: 0, reverb: 0.1, minGap: 0.3,
  build(v, p) {
    const lp = v.filter('lowpass', 3000, 0.8, v.out);
    for (const [t, m] of [[0, 81], [0.1, 76]]) {
      v.tone({ t, type: 'triangle', f: mtof(m) * p, a: 0.006, h: 0.035, d: 0.08, peak: 0.5, to: lp });
      v.tone({ t, f: mtof(m) * 2 * p, a: 0.005, d: 0.06, peak: 0.12 });
    }
    v.tone({ t: 0.2, f: 523 * p, a: 0.006, d: 0.35, peak: 0.12 });                                     // faint sonar tail
  },
});
def('strike_launch', {
  gain: 0.55, max: 2, jitter: 0.04, reverb: 0.2,
  build(v, p) {
    const T = v.t;
    v.tone({ f: 160 * p, f1: 55 * p, sw: 0.12, a: 0.002, d: 0.2, peak: 0.9 });                          // launch thoonk
    v.nz({ kind: 'pink', ft: 'lowpass', f: 2500, f1: 400, sw: 0.15, q: 1, a: 0.002, d: 0.15, peak: 0.7 });
    const g = v.gain(0, v.out), bp = v.filter('bandpass', 350 * p, 1.2, g), am = v.gain(0.75, bp);       // fluttering rocket roar
    sweep(bp.frequency, T, 350 * p, 3200 * p, 1.0);
    pts(g.gain, T, [[0, 0], [0.06, 0.9], [0.35, 0.7], [1.05, 0]]);
    v.lfo(28, 0.25, am.gain, T, T + 1.08);
    v.noise('pink', T, T + 1.08, am);
    const cg = v.gain(0, v.out);                                                                          // exhaust crackle
    pts(cg.gain, T, [[0, 0], [0.05, 0.4], [0.9, 0]]);
    v.buffer(texture(v.ctx, 'sizzle'), T, T + 0.92, v.filter('bandpass', 2500, 0.8, cg));
    v.tone({ t: 0.03, f: 500 * p, f1: 2000 * p, sw: 1.0, a: 0.1, h: 0.4, d: 0.45, peak: 0.08 });        // rising doppler whistle
    v.nz({ t: 0.02, ft: 'highpass', f: 3500, a: 0.05, h: 0.2, d: 0.6, peak: 0.12 });
  },
});
def('strike_whistle', {
  gain: 0.134, max: 3, jitter: 0.03, reverb: 0.15,
  build(v, p) {
    const T = v.t, D = 1.4;
    const g = v.gain(0, v.out);
    pts(g.gain, T, [[0, 0], [0.3, 0.22], [1.2, 0.8], [1.36, 0.9], [D, 0]]);
    const o = v.osc('sine', 1800 * p, T, T + D + 0.01, g);
    sweep(o.frequency, T, 1800 * p, 500 * p, D);
    v.lfo(6, 12, o.detune, T, T + D);
    const o2 = v.osc('triangle', 1800 * p, T, T + D + 0.01, v.gain(0.12, g));
    sweep(o2.frequency, T, 1800 * p, 500 * p, D);
    const ng = v.gain(0, v.out), bp = v.filter('bandpass', 1800 * p, 6, ng);                             // air rush following the pitch
    sweep(bp.frequency, T, 1800 * p, 500 * p, D);
    pts(ng.gain, T, [[0, 0], [1.2, 0.5], [D, 0]]);
    v.noise('white', T, T + D + 0.01, bp);
    const rg = v.gain(0, v.out);                                                                          // approaching rumble
    pts(rg.gain, T, [[0, 0], [0.5, 0], [1.35, 0.5], [D, 0]]);
    v.noise('brown', T, T + D + 0.01, v.filter('lowpass', 300, 1, rg));
  },
});
def('strike_impact', {
  gain: 0.445, max: 3, jitter: 0.04, reverb: 0.32,
  build(v, p) { inkBoom(v, 0, p, 1, { crack: 1, bright: 6000 }); },
});
def('tornado', {
  gain: 0.32, max: 3, jitter: 0, reverb: 0.12, oneShot: 2,
  loop(v, p) {
    const T = v.t;
    const g1 = v.gain(0.7, v.out), bp1 = v.filter('bandpass', 650 * p, 1.4, g1);                        // swirling wind
    v.noise('pink', T, null, bp1);
    const s1 = v.lfo(1.2 * p, 380 * p, bp1.frequency, T, null);
    const s1a = v.gain(0.3, g1.gain); s1.osc.connect(s1a);                                               // louder as it brightens
    const g2 = v.gain(0.18 * p, v.out), bp2 = v.filter('bandpass', 2200 * p, 2.2, g2);                  // airy counter-swirl
    v.noise('white', T, null, bp2);
    const s2 = v.lfo(1.9 * p, 1100 * p, bp2.frequency, T, null);
    const s2a = v.gain(0.08 * p, g2.gain); s2.osc.connect(s2a);
    const lg = v.gain(0.55, v.out), lp = v.filter('lowpass', 1300 * p, 0.8, lg);                        // churning liquid
    const tex = v.buffer(texture(v.ctx, 'squelch'), T, null, lp, p);
    v.lfo(0.63, 0.2, lg.gain, T, null);
    const bg = v.gain(0.25, v.out);
    const bub = v.buffer(texture(v.ctx, 'bubbles'), T, null, v.filter('lowpass', 1800, 0.7, bg), 0.8 * p);
    const rlp = v.filter('lowpass', 170 * p, 1, v.gain(0.55, v.out));                                  // low rumble
    v.noise('brown', T, null, rlp);
    return {
      pitch(q, now) {
        const k = 0.08;
        bp1.frequency.setTargetAtTime(650 * q, now, k); s1.osc.frequency.setTargetAtTime(1.2 * q, now, k); s1.depth.gain.setTargetAtTime(380 * q, now, k);
        bp2.frequency.setTargetAtTime(2200 * q, now, k); s2.osc.frequency.setTargetAtTime(1.9 * q, now, k); s2.depth.gain.setTargetAtTime(1100 * q, now, k);
        g2.gain.setTargetAtTime(0.18 * q, now, k); s2a.gain.setTargetAtTime(0.08 * q, now, k);
        tex.playbackRate.setTargetAtTime(q, now, k); bub.playbackRate.setTargetAtTime(0.8 * q, now, k);
        lp.frequency.setTargetAtTime(1300 * q, now, k); rlp.frequency.setTargetAtTime(170 * q, now, k);
      },
    };
  },
});
def('zooka_fire', {
  gain: 0.55, max: 3, jitter: 0.04, reverb: 0.2,
  build(v, p) {
    const T = v.t;
    v.tone({ f: 130 * p, f1: 40 * p, sw: 0.18, a: 0.002, d: 0.3, peak: 1 });                            // thump
    v.nz({ kind: 'pink', ft: 'lowpass', f: 1800, f1: 250, sw: 0.15, q: 1.5, a: 0.002, d: 0.16, peak: 0.9 });
    v.nz({ ft: 'highpass', f: 2500, a: 0.0005, d: 0.03, peak: 0.5 });
    const g = v.gain(0, v.out), am = v.gain(0.55, g), bp = v.filter('bandpass', 350 * p, 2, am);         // rising swirl, spinning faster
    sweep(bp.frequency, T + 0.03, 350 * p, 2600 * p, 0.7);
    pts(g.gain, T, [[0, 0], [0.08, 0.6], [0.45, 0.8], [0.9, 0]]);
    const spin = v.lfo(7, 0.45, am.gain, T, T + 0.92);
    sweep(spin.osc.frequency, T, 7, 22, 0.8);
    v.noise('pink', T, T + 0.92, bp);
    v.tone({ t: 0.04, type: 'triangle', f: 260 * p, f1: 1100 * p, sw: 0.7, a: 0.08, h: 0.3, d: 0.35, peak: 0.1 });
    bloops(v, 0.03, 3, 0.1, [350, 650], 0.25, p);
  },
});
def('wail_charge', {
  gain: 0.22, max: 2, jitter: 0, reverb: 0.15,
  build(v, p) {
    const T = v.t, E = T + 1.24;
    const g = v.gain(0, v.out);                                                                           // rising electrical whine
    pts(g.gain, T, [[0, 0], [0.1, 0.12], [1.05, 0.45], [1.15, 0.45], [1.22, 0]]);
    const lp = v.filter('lowpass', 900, 2, g);
    sweep(lp.frequency, T, 900, 5000, 1.15);
    for (const [r, dt, a] of [[1, -8, 1], [1, 8, 1], [2, 0, 0.3]]) {
      const o = v.osc(r > 1 ? 'square' : 'sawtooth', 110 * r * p, T, E, a < 1 ? v.gain(a, lp) : lp);
      o.detune.value = dt; sweep(o.frequency, T, 110 * r * p, 660 * r * p, 1.15);
    }
    const hg = v.gain(0, v.out);                                                                          // mains buzz
    pts(hg.gain, T, [[0, 0], [0.2, 0.1], [1.2, 0.15], [1.22, 0]]);
    v.osc('square', 60 * p, T, E, v.filter('lowpass', 400, 1, hg));
    const sg = v.gain(0, v.out), sam = v.gain(0.8, sg);                                                  // throbbing sub
    pts(sg.gain, T, [[0, 0], [1.1, 0.75], [1.22, 0]]);
    const so = v.osc('sine', 38 * p, T, E, sam);
    sweep(so.frequency, T, 38 * p, 55 * p, 1.2);
    const th = v.lfo(4, 0.2, sam.gain, T, E);
    sweep(th.osc.frequency, T, 4, 11, 1.2);
    const cg = v.gain(0, v.out);                                                                          // arcing crackle
    pts(cg.gain, T, [[0, 0], [0.3, 0.05], [1.1, 0.25], [1.2, 0]]);
    v.buffer(texture(v.ctx, 'sizzle'), T, E, v.filter('bandpass', 3000, 0.8, cg));
    v.tone({ t: 1.12, f: 140 * p, f1: 60 * p, sw: 0.08, a: 0.002, d: 0.12, peak: 0.5 });              // armed
  },
});
def('wail_blast', {
  gain: 0.16, max: 2, jitter: 0, reverb: 0.1, oneShot: 2,
  loop(v, p) {
    const T = v.t, W = 5.2;
    const bg = v.gain(0.55, v.out), sh = v.shaper(2.2, bg), lp = v.filter('lowpass', 420, 5, sh);       // wub bass
    const bass = [[1, -12, 'sawtooth'], [1, 12, 'sawtooth'], [0.5, 0, 'square']].map(([r, dt, type]) => {
      const o = v.osc(type, 55 * r * p, T, null, r < 1 ? v.gain(0.5, lp) : lp); o.detune.value = dt; return [o, r];
    });
    const wub = v.lfo(W * p, 320, lp.frequency, T, null);
    const sg = v.gain(0.6, v.out);                                                                        // sub throb
    const sub = v.osc('sine', 55 * p, T, null, sg);
    const sam = v.gain(0.5, sg.gain); wub.osc.connect(sam);
    const rg = v.gain(0.22, v.out), rlp = v.filter('lowpass', 3200, 0.7, rg), rsh = v.shaper(4, rlp);   // distorted roar
    const rbp = v.filter('bandpass', 700 * p, 0.9, v.gain(2.5, rsh));
    v.noise('pink', T, null, rbp);
    const ram = v.gain(0.12, rg.gain); wub.osc.connect(ram);
    const wg = v.gain(0.07, v.out);                                                                       // wailing siren edge
    const wo = v.osc('triangle', 220 * p, T, null, v.filter('lowpass', 1800, 0.7, wg));
    const wv = v.lfo(W * p, 60, wo.detune, T, null);
    return {
      pitch(q, now) {
        const k = 0.05;
        for (const [o, r] of bass) o.frequency.setTargetAtTime(55 * r * q, now, k);
        sub.frequency.setTargetAtTime(55 * q, now, k); wo.frequency.setTargetAtTime(220 * q, now, k);
        wub.osc.frequency.setTargetAtTime(W * q, now, k); wv.osc.frequency.setTargetAtTime(W * q, now, k);
        rbp.frequency.setTargetAtTime(700 * q, now, k);
      },
    };
  },
});
def('kraken_on', {
  gain: 0.38, max: 2, jitter: 0.02, reverb: 0.25,
  build(v, p) {
    const T = v.t, T0 = T + 0.2, D = 0.85;
    v.nz({ f: 250, f1: 1800, sw: 0.22, q: 1.5, a: 0.2, d: 0.08, peak: 0.4 });                          // transform swell
    v.tone({ t: 0.2, f: 110 * p, f1: 36 * p, sw: 0.3, a: 0.002, d: 0.4, peak: 0.9 });                  // whump
    const g = v.gain(0, v.out);                                                                           // gargling growl
    const end = pts(g.gain, T0, [[0, 0], [0.06, 0.8], [0.45, 0.65], [D, 0]]);
    const sh = v.shaper(2.5, g), am = v.gain(0.6, sh);
    v.lfo(27, 0.4, am.gain, T0, end);
    const { srcs, fs } = vox(v, T0, end + 0.01, 70 * p, [[550, 4, 1.2], [1000, 5, 0.7], [250, 1, 0.5]], am, 14);
    for (const o of srcs) { o.frequency.setValueAtTime(70 * p, T0); o.frequency.exponentialRampToValueAtTime(96 * p, T0 + 0.25); o.frequency.exponentialRampToValueAtTime(58 * p, T0 + D); }
    fs[0].frequency.setValueAtTime(480, T0); fs[0].frequency.exponentialRampToValueAtTime(820, T0 + 0.25); fs[0].frequency.exponentialRampToValueAtTime(560, T0 + D);
    fs[1].frequency.setValueAtTime(900, T0); fs[1].frequency.exponentialRampToValueAtTime(1250, T0 + 0.25); fs[1].frequency.exponentialRampToValueAtTime(950, T0 + D);
    const bg = v.gain(0, v.out);                                                                          // gloop
    pts(bg.gain, T0, [[0, 0], [0.05, 0.7], [0.7, 0.3], [0.95, 0]]);
    v.buffer(texture(v.ctx, 'squelch'), T0, T0 + 0.97, v.filter('lowpass', 1500, 0.8, bg), 0.8 * p);
    bloops(v, 0.22, 6, 0.6, [220, 480], 0.35, p);
  },
});
def('kraken_jump', {
  gain: 0.45, max: 2, jitter: 0.05, reverb: 0.1,
  build(v, p) {
    const T = v.t;
    v.tone({ f: 120 * p, f1: 60 * p, sw: 0.06, a: 0.002, d: 0.1, peak: 0.7 });                         // push-off thud
    const g = v.gain(0, v.out), end = perc(g.gain, T, 0.006, 0.8, 0.32);                                // boing
    const o = v.osc('sine', 110 * p, T, end + 0.01, g);
    sweep(o.frequency, T, 110 * p, 330 * p, 0.22);
    const o2 = v.osc('triangle', 220 * p, T, end + 0.01, v.gain(0.3, g));
    sweep(o2.frequency, T, 220 * p, 660 * p, 0.22);
    const w = v.lfo(15, 0, o.detune, T, end);
    w.depth.connect(o2.detune);
    pts(w.depth.gain, T, [[0, 250], [0.3, 0]]);
    v.nz({ f: 500 * p, f1: 1500 * p, sw: 0.15, q: 4, a: 0.004, d: 0.16, peak: 0.6 });                  // squelch
    bloops(v, 0.02, 3, 0.1, [300, 550], 0.25, p);
  },
});
def('kraken_slam', {
  gain: 0.45, max: 2, jitter: 0.03, reverb: 0.3,
  build(v, p) {
    inkBoom(v, 0, p * 0.9, 1, { crack: 0.5, bright: 4000, bloops: 9, plips: 6 });
    bigSplat(v, 0.018, p * 0.8, 0.6);
    v.nz({ t: 0.02, f: 900 * p, f1: 260 * p, sw: 0.6, q: 4, a: 0.004, d: 0.6, peak: 0.5 });           // sloppy squelch tail
  },
});
def('blower_inflate', {
  gain: 0.24, max: 2, jitter: 0, reverb: 0.06, oneShot: 1.5,
  loop(v, p) {
    const T = v.t, f0 = 150;
    const rg = v.gain(0.5, v.out), am = v.gain(0.75, rg), lp = v.filter('lowpass', 700 * p, 5, am);    // stretching rubber
    const o1 = v.osc(pulseWave(v.ctx, 0.3), f0 * p, T, null, lp);
    const o2 = v.osc('triangle', f0 * 2.01 * p, T, null, v.gain(0.4, lp));
    const vib = v.lfo(5.7, 35, o1.detune, T, null); vib.depth.connect(o2.detune);
    const vib2 = v.lfo(0.83, 60, o1.detune, T, null); vib2.depth.connect(o2.detune);
    const trem = v.lfo(3.3 * p, 0.25, am.gain, T, null);
    const wah = v.lfo(2.1, 250 * p, lp.frequency, T, null);
    const ag = v.gain(0.12, v.out), abp = v.filter('bandpass', 1100 * p, 1.2, ag);                      // air blown in
    v.noise('pink', T, null, abp);
    const bg = v.gain(0.35, v.out);                                                                       // wet soap film
    const tex = v.buffer(texture(v.ctx, 'bubbles'), T, null, v.filter('lowpass', 1600, 0.7, bg), 0.8 * p);
    return {
      pitch(q, now) {
        const k = 0.05;
        o1.frequency.setTargetAtTime(f0 * q, now, k); o2.frequency.setTargetAtTime(f0 * 2.01 * q, now, k);
        lp.frequency.setTargetAtTime(700 * q, now, k); wah.depth.gain.setTargetAtTime(250 * q, now, k);
        trem.osc.frequency.setTargetAtTime(3.3 * q, now, k); abp.frequency.setTargetAtTime(1100 * q, now, k);
        tex.playbackRate.setTargetAtTime(0.8 * q, now, k);
      },
    };
  },
});
def('bubble_release', {
  gain: 0.5, max: 3, jitter: 0.08, reverb: 0.12,
  build(v, p) {
    v.tone({ f: 240 * p, f1: 520 * p, sw: 0.07, a: 0.003, d: 0.1, peak: 0.7 });                         // plop
    v.tone({ f: 130 * p, f1: 80 * p, sw: 0.08, a: 0.003, d: 0.1, peak: 0.4 });
    v.nz({ f: 900 * p, f1: 1600 * p, sw: 0.1, q: 3, a: 0.005, d: 0.08, peak: 0.2 });
    v.tone({ t: 0.08, f: 700 * p, f1: 1300 * p, sw: 0.25, a: 0.05, d: 0.2, peak: 0.08 });              // airy lift-off
    plips(v, 0.04, 2, 0.08, [900, 1400], 0.1, p);
  },
});
def('bubble_pop', {
  gain: 0.64, max: 4, jitter: 0.1, reverb: 0.1, minGap: 0.03,
  build(v, p) {
    v.nz({ ft: 'highpass', f: 2500, a: 0.0003, d: 0.012, peak: 0.7 });
    v.tone({ f: 950 * p, f1: 420 * p, sw: 0.03, a: 0.0008, d: 0.04, peak: 0.6 });
    plips(v, 0.01, 3, 0.07, [1100, 2200], 0.15, p);
    v.nz({ t: 0.005, f: 2200 * p, f1: 900 * p, sw: 0.08, q: 2, a: 0.002, d: 0.08, peak: 0.25 });     // fizz
  },
});
def('bubble_blast', {
  gain: 0.42, max: 3, jitter: 0.04, reverb: 0.3,
  build(v, p) {
    v.nz({ ft: 'highpass', f: 3000, a: 0.0003, d: 0.02, peak: 0.8 });                                  // glassy pop
    v.tone({ f: 1500 * p, f1: 500 * p, sw: 0.04, a: 0.0008, d: 0.05, peak: 0.6 });
    for (const [f, a] of [[2637, 0.18], [3951, 0.12], [5274, 0.07]]) v.tone({ f: f * p, a: 0.0005, d: 0.18, peak: a });
    inkBoom(v, 0.025, p, 0.95, { f: 95, f1: 28, crack: 0.4, bright: 5000 });                             // the blast
  },
});
def('jet_loop', {
  gain: 0.25, max: 2, jitter: 0, reverb: 0.05, oneShot: 1.5,
  loop(v, p) {
    const T = v.t;
    const fl = v.gain(0.8, v.out), lp = v.filter('lowpass', 1400 * p, 0.9, fl);                         // roaring thrust
    v.noise('pink', T, null, lp);
    const flut = v.lfo(24 * p, 0.2, fl.gain, T, null);
    const wander = v.lfo(0.37, 200, lp.frequency, T, null);
    v.lfo(7.3, 0.06, fl.gain, T, null);
    v.noise('brown', T, null, v.filter('lowpass', 260, 1, v.gain(0.7, v.out)));                        // body
    const hg = v.gain(0.14, v.out), hbp = v.filter('bandpass', 4200 * p, 0.8, hg);                     // hiss
    v.noise('white', T, null, hbp);
    const gg = v.gain(0.2, v.out), gsh = v.shaper(3, v.filter('lowpass', 2500, 0.7, gg));              // burner grit
    const gbp = v.filter('bandpass', 500 * p, 1.2, v.gain(3, gsh));
    v.noise('pink', T, null, gbp);
    return {
      pitch(q, now) {
        const k = 0.06;
        lp.frequency.setTargetAtTime(1400 * q, now, k); flut.osc.frequency.setTargetAtTime(24 * q, now, k);
        hbp.frequency.setTargetAtTime(4200 * q, now, k); gbp.frequency.setTargetAtTime(500 * q, now, k);
        wander.depth.gain.setTargetAtTime(200 * q, now, k);
      },
    };
  },
});
def('jet_fire', {
  gain: 0.485, max: 3, jitter: 0.05, reverb: 0.16,
  build(v, p) {
    v.tone({ f: 140 * p, f1: 36 * p, sw: 0.2, a: 0.002, d: 0.38, peak: 1 });                            // THOOMP
    v.tone({ type: 'triangle', f: 280 * p, f1: 80 * p, sw: 0.1, a: 0.002, d: 0.12, peak: 0.45 });
    v.nz({ ft: 'highpass', f: 2200, a: 0.0004, d: 0.03, peak: 0.6 });
    const sh = v.shaper(2, v.gain(0.8, v.out));
    v.nz({ kind: 'pink', ft: 'lowpass', f: 2200, f1: 260, sw: 0.18, q: 1.5, a: 0.002, d: 0.2, peak: 1, to: sh });
    v.nz({ f: 600 * p, f1: 2600 * p, sw: 0.25, q: 1.3, a: 0.03, d: 0.2, peak: 0.35 });                 // projectile whoosh
    v.nz({ t: 0.01, f: 1300 * p, f1: 400 * p, sw: 0.18, q: 4, a: 0.003, d: 0.2, peak: 0.6 });
    bloops(v, 0.02, 3, 0.08, [380, 650], 0.25, p);
  },
});
def('jet_end', {
  gain: 0.6, max: 2, jitter: 0.03, reverb: 0.1,
  build(v, p) {
    let t = 0, a = 0.8;
    for (let i = 0; i < 7; i++) {                                                                         // sputters, slowing down
      v.nz({ t, kind: 'pink', ft: 'lowpass', f: 1600 * (1 - i * 0.09), q: 1.2, a: 0.008, d: 0.04 + i * 0.008, peak: a });
      v.tone({ t, f: 110 * p * (1 - i * 0.05), f1: 70 * p, sw: 0.04, a: 0.005, d: 0.05, peak: a * 0.5 });
      t += 0.055 + i * 0.022 + v.r(0, 0.02); a *= 0.8;
    }
    const g = v.gain(0, v.out), end = pts(g.gain, v.t, [[0, 0], [0.02, 0.12], [0.6, 0.04], [0.8, 0]]); // dying whine
    const o = v.osc('triangle', 520 * p, v.t, end + 0.01, v.filter('lowpass', 1500, 1, g));
    sweep(o.frequency, v.t, 520 * p, 110 * p, 0.8);
    v.nz({ t: t + 0.02, f: 900, f1: 400, sw: 0.2, q: 1, a: 0.02, d: 0.18, peak: 0.3 });               // last puff
  },
});
def('stamp_swing', {
  gain: 0.47, max: 3, jitter: 0.05, reverb: 0.08,
  build(v, p) {
    const T = v.t;
    whoosh(v, 0, 0.46, 220 * p, 900 * p, 300 * p, 0.9, { q: 1.4, mid: 0.48, env: [[0, 0], [0.45, 1], [0.6, 0.75], [1, 0]] });
    whoosh(v, 0.03, 0.4, 1200 * p, 2800 * p, 1400 * p, 0.2, { q: 2, kind: 'white' });
    const g = v.gain(0, v.out), end = pts(g.gain, T, [[0, 0], [0.2, 0.4], [0.46, 0]]);                // heavy "vwoom"
    const o = v.osc('sine', 60 * p, T, end + 0.01, g);
    o.frequency.setValueAtTime(60 * p, T); o.frequency.exponentialRampToValueAtTime(95 * p, T + 0.2); o.frequency.exponentialRampToValueAtTime(60 * p, T + 0.46);
  },
});
def('stamp_slam', {
  gain: 0.63, max: 2, jitter: 0.04, reverb: 0.26,
  build(v, p) {
    const T = v.t;
    const g = v.gain(0, v.out), end = perc(g.gain, T, 0.002, 1, 0.5);                                   // rubbery THWUMP
    const o = v.osc('sine', 170 * p, T, end + 0.01, g);
    o.frequency.setValueAtTime(170 * p, T); o.frequency.exponentialRampToValueAtTime(48 * p, T + 0.09);
    o.frequency.exponentialRampToValueAtTime(62 * p, T + 0.2); o.frequency.exponentialRampToValueAtTime(44 * p, T + 0.5);
    const w = v.lfo(11, 0, o.detune, T, end);
    pts(w.depth.gain, T, [[0, 0], [0.05, 120], [0.4, 0]]);
    v.tone({ type: 'triangle', f: 240 * p, f1: 90 * p, sw: 0.08, a: 0.001, d: 0.14, peak: 0.55 });    // rubber smack
    v.nz({ kind: 'pink', ft: 'lowpass', f: 1400, f1: 200, sw: 0.18, q: 2.5, a: 0.001, d: 0.2, peak: 1 });
    v.nz({ ft: 'highpass', f: 2000, a: 0.0004, d: 0.025, peak: 0.6 });
    bigSplat(v, 0.015, p, 0.8);                                                                           // ink splash
    bloops(v, 0.05, 5, 0.3, [300, 650], 0.3, p);
    plips(v, 0.12, 4, 0.35, [800, 1600], 0.1, p);
  },
});
def('stamp_throw', {
  gain: 1.0, max: 3, jitter: 0.05, reverb: 0.1,
  build(v, p) {
    const T = v.t, D = 0.65;
    const g = v.gain(0, v.out), am = v.gain(0.5, g), bp = v.filter('bandpass', 420 * p, 1.6, am);        // spinning whoosh
    pts(g.gain, T, [[0, 0], [0.12, 0.8], [0.4, 0.6], [D, 0]]);
    v.lfo(9 * p, 0.5, am.gain, T, T + D + 0.02);
    bp.frequency.setValueAtTime(420 * p, T); bp.frequency.exponentialRampToValueAtTime(1300 * p, T + 0.25); bp.frequency.exponentialRampToValueAtTime(600 * p, T + D);
    v.noise('pink', T, T + D + 0.02, bp);
    v.tone({ type: 'triangle', f: 330 * p, f1: 210 * p, sw: 0.04, a: 0.001, d: 0.05, peak: 0.3 });    // release
    v.tone({ f: 110 * p, f1: 70 * p, sw: 0.06, a: 0.002, d: 0.08, peak: 0.4 });
  },
});
def('booyah_charge', {
  gain: 0.25, max: 2, jitter: 0, reverb: 0.25, oneShot: 1.5,
  loop(v, p) {
    const T = v.t, notes = [48, 55, 60, 64, 67];
    const lp = v.filter('lowpass', 2400 * p, 0.7, v.out);
    const lvl = v.gain(0.75 + 0.25 * p, lp), am = v.gain(0.8, lvl);                                     // swells with charge
    const trem = v.lfo(4 * p, 0.2, am.gain, T, null);                                                    // energy pulse, faster with charge
    const mix = v.gain(0.35);                                                                             // "ah" choir: saws through formants
    for (const [f, q, a] of [[750, 5, 1], [1150, 6, 0.55], [2600, 8, 0.25]]) mix.connect(v.filter('bandpass', f, q, v.gain(a, am)));
    const vib = v.gain(12); v.osc('sine', 5.2, T, null, vib);
    const oscs = [];
    for (const m of notes) for (const dt of [-9, 9]) {
      const o = v.osc('sawtooth', mtof(m) * p, T, null, mix); o.detune.value = dt; vib.connect(o.detune); oscs.push([o, mtof(m)]);
    }
    const hg = v.gain(0.3, am);                                                                           // hum
    for (const m of [36, 48]) oscs.push([v.osc('sine', mtof(m) * p, T, null, hg), mtof(m)]);
    const sg = v.gain(0.025 * p, v.out), shp = v.filter('highpass', 6000, 0.7, sg);                     // shimmer
    v.noise('white', T, null, shp);
    const sl = v.lfo(9 * p, 0.012, sg.gain, T, null);
    return {
      pitch(q, now) {
        const k = 0.06;
        for (const [o, f] of oscs) o.frequency.setTargetAtTime(f * q, now, k);
        lp.frequency.setTargetAtTime(2400 * q, now, k); trem.osc.frequency.setTargetAtTime(4 * q, now, k); lvl.gain.setTargetAtTime(0.75 + 0.25 * q, now, k);
        sg.gain.setTargetAtTime(0.025 * q, now, k); sl.osc.frequency.setTargetAtTime(9 * q, now, k);
      },
    };
  },
});
def('booyah_cheer', {
  gain: 0.27, max: 3, jitter: 0.04, reverb: 0.12, minGap: 0.06,
  build(v, p) {
    const T = v.t, D = 0.34, f0 = 330 * p;
    const g = v.gain(0, v.out), end = pts(g.gain, T, [[0, 0], [0.025, 1], [0.2, 0.85], [D, 0]]);
    const { srcs, fs } = vox(v, T, end + 0.01, f0, [[350, 6, 1], [2100, 8, 0.7], [2900, 10, 0.25]], g);
    for (const o of srcs) { o.frequency.setValueAtTime(f0 * 0.85, T); o.frequency.exponentialRampToValueAtTime(f0 * 1.25, T + 0.1); o.frequency.exponentialRampToValueAtTime(f0 * 1.12, T + D); }
    [[350, 800], [2100, 1250], [2900, 2700]].forEach(([a, b], i) => {                                    // "ye" → "ah"
      fs[i].frequency.setValueAtTime(a, T + 0.03); fs[i].frequency.exponentialRampToValueAtTime(b, T + 0.14);
    });
    bell(v, T + 0.02, mtof(88) * p, 0.08, { d: 0.25 });
  },
});
def('booyah_throw', {
  gain: 0.55, max: 2, jitter: 0.03, reverb: 0.2,
  build(v, p) {
    const T = v.t;
    v.tone({ f: 150 * p, f1: 60 * p, sw: 0.1, a: 0.002, d: 0.15, peak: 0.7 });
    whoosh(v, 0, 0.45, 300 * p, 1500 * p, 2400 * p, 0.7, { q: 1.5, env: [[0, 0], [0.22, 1], [0.5, 0.6], [1, 0]] });
    const g = v.gain(0, v.out), end = pts(g.gain, T, [[0, 0], [0.04, 0.2], [0.3, 0.15], [0.45, 0]]);   // energy streak
    const o = v.osc('triangle', 220 * p, T, end + 0.01, g);
    sweep(o.frequency, T, 220 * p, 880 * p, 0.4);
    v.lfo(11, 30, o.detune, T, end);
    [79, 84, 88].forEach((m, i) => bell(v, T + 0.04 + i * 0.05, mtof(m) * p, 0.08, { d: 0.35 }));
  },
});
def('booyah_blast', {
  gain: 0.4, max: 2, jitter: 0.02, reverb: 0.38,
  build(v, p) {
    const T = v.t;
    inkBoom(v, 0, p, 1, { f: 65, f1: 20, len: 1.6, bright: 7000, bloops: 12, plips: 8 });
    const g = v.gain(0, v.out);                                                                           // long rolling rumble
    pts(g.gain, T, [[0, 0], [0.15, 0.9], [0.6, 0.6], [1.2, 0.35], [2.1, 0]]);
    v.noise('brown', T, T + 2.15, v.filter('lowpass', 260, 1, g));
    [84, 88, 91].forEach((m) => bell(v, T + 0.05, mtof(m) * p, 0.06, { d: 1.0 }));                      // victorious glint
  },
});
def('zip_fire', {
  gain: 0.58, max: 3, jitter: 0.05, reverb: 0.08,
  build(v, p) {
    const T = v.t;
    const lp = v.filter('lowpass', 5000, 0.8, v.out);                                                    // zip
    v.tone({ type: 'sawtooth', f: 300 * p, f1: 1800 * p, sw: 0.12, a: 0.002, d: 0.14, peak: 0.22, to: lp });
    v.nz({ f: 1200 * p, f1: 5000 * p, sw: 0.14, q: 3, a: 0.003, d: 0.14, peak: 0.5 });
    const g = v.gain(0, v.out), end = perc(g.gain, T + 0.01, 0.002, 0.6, 0.3);                         // twang of the taut line
    const flp = v.filter('lowpass', 4000, 3, g);
    sweep(flp.frequency, T + 0.01, 4000, 500, 0.2);
    const o = v.osc('sawtooth', 210 * p, T + 0.01, end + 0.01, flp);
    sweep(o.frequency, T + 0.01, 210 * p, 160 * p, 0.25);
    v.lfo(14, 18, o.detune, T + 0.01, end);
    v.nz({ ft: 'highpass', f: 4000, a: 0.0004, d: 0.01, peak: 0.4 });
  },
});
def('zip_latch', {
  gain: 0.48, max: 3, jitter: 0.05, reverb: 0.12,
  build(v, p) {
    clank(v, 0, 620, 0.5, 0.25, p);
    v.tone({ f: 180 * p, f1: 80 * p, sw: 0.05, a: 0.001, d: 0.07, peak: 0.6 });
    v.nz({ t: 0.008, f: 2200 * p, f1: 800 * p, sw: 0.1, q: 2.5, a: 0.001, d: 0.12, peak: 0.7 });       // splat
    bloops(v, 0.015, 2, 0.05, [500, 750], 0.3, p);
    plips(v, 0.04, 2, 0.06, [900, 1500], 0.12, p);
  },
});
def('zip_pull', {
  gain: 0.55, max: 2, jitter: 0.04, reverb: 0.08,
  build(v, p) {
    const T = v.t, D = 0.5;
    const g = v.gain(0, v.out), bp = v.filter('bandpass', 300 * p, 1.5, g);                            // rushing air, rising
    sweep(bp.frequency, T, 300 * p, 3500 * p, D);
    pts(g.gain, T, [[0, 0], [0.3, 0.7], [0.44, 0.8], [D, 0]]);
    v.noise('pink', T, T + D + 0.02, bp);
    const wg = v.gain(0, v.out), am = v.gain(0.6, wg), lp = v.filter('lowpass', 2500, 1, am);          // line whirr
    pts(wg.gain, T, [[0, 0], [0.05, 0.12], [0.4, 0.16], [D, 0]]);
    const o = v.osc('sawtooth', 160 * p, T, T + D + 0.02, lp);
    sweep(o.frequency, T, 160 * p, 700 * p, D);
    const r = v.lfo(30, 0.4, am.gain, T, T + D + 0.02);
    sweep(r.osc.frequency, T, 30, 80, D);
    v.nz({ t: 0.05, ft: 'highpass', f: 5000, a: 0.3, d: 0.15, peak: 0.12 });
  },
});
def('crab_move', {
  gain: 0.39, max: 3, jitter: 0, reverb: 0.05, oneShot: 1.5,
  loop(v, p) {
    const T = v.t, step = 4.4;
    const sg = v.gain(0.25, v.out), sbp = v.filter('bandpass', 900 * p, 2.5, sg);                       // servo whirr
    const s1 = v.osc('sawtooth', 115 * p, T, null, sbp);
    const s2 = v.osc('triangle', 231 * p, T, null, v.gain(0.5, sg));
    const sv = v.lfo(step * p, 60, s1.detune, T, null); sv.depth.connect(s2.detune);
    const legs = [[0, [640, 1730, 2980]], [0.5, [540, 1490, 2610]]].map(([ph, fs]) => {                 // clanky legs, alternating
      const lg = v.gain(0.12, v.out);
      const st = v.osc(strokeWave(v.ctx, 9), step * p, T + ph / (step * p), null);
      const dp = v.gain(0.9); st.connect(dp); dp.connect(lg.gain);
      const mg = v.gain(0.06, lg);
      for (const f of fs) v.osc('sine', f, T, null, mg);
      v.noise('white', T, null, v.filter('bandpass', 2500, 2, v.gain(0.35, lg)));
      v.osc('sine', 85, T, null, v.gain(0.45, lg));
      return st;
    });
    return {
      pitch(q, now) {
        const k = 0.05;
        s1.frequency.setTargetAtTime(115 * q, now, k); s2.frequency.setTargetAtTime(231 * q, now, k); sbp.frequency.setTargetAtTime(900 * q, now, k);
        sv.osc.frequency.setTargetAtTime(step * q, now, k);
        for (const st of legs) st.frequency.setTargetAtTime(step * q, now, k);
      },
    };
  },
});
def('crab_gatling', {
  gain: 0.51, max: 4, jitter: 0.08, reverb: 0.04, minGap: 0.03,
  build(v, p) {
    v.tone({ f: 190 * p, f1: 85 * p, sw: 0.03, a: 0.0008, d: 0.035, peak: 0.7 });
    v.nz({ f: v.r(2000, 2800) * p, f1: 900 * p, sw: 0.03, q: 1.5, a: 0.0006, d: 0.03, peak: 0.6 });
    v.tone({ f: v.r(650, 800) * p, f1: 300 * p, sw: 0.025, a: 0.001, d: 0.03, peak: 0.2 });
  },
});
def('crab_cannon', {
  gain: 0.55, max: 3, jitter: 0.04, reverb: 0.18,
  build(v, p) {
    v.tone({ f: 105 * p, f1: 42 * p, sw: 0.14, a: 0.002, d: 0.32, peak: 1 });                          // thoo-
    v.tone({ f: 260 * p, f1: 150 * p, sw: 0.06, a: 0.001, d: 0.09, peak: 0.45 });                       // -onk
    v.nz({ f: 320 * p, q: 7, a: 0.001, d: 0.14, peak: 0.9 });
    v.nz({ kind: 'pink', ft: 'lowpass', f: 1500, f1: 250, sw: 0.15, q: 1.2, a: 0.002, d: 0.18, peak: 0.7 });
    v.nz({ t: 0.03, f: 500 * p, f1: 1800 * p, sw: 0.3, q: 1.4, a: 0.05, d: 0.25, peak: 0.2 });         // shell leaving
    clank(v, 0, 900, 0.12, 0.15, p);
    bloops(v, 0.02, 2, 0.06, [380, 600], 0.2, p);
  },
});
def('crab_roll', {
  gain: 0.27, max: 3, jitter: 0, reverb: 0.04, oneShot: 1.5,
  loop(v, p) {
    const T = v.t, rev = 3;
    const rlp = v.filter('lowpass', 200 * p, 1, v.gain(0.7, v.out));                                  // rumble
    v.noise('brown', T, null, rlp);
    const am = v.gain(0.6, v.gain(0.35, v.out));                                                        // hum throbbing once per turn
    const o = v.osc('triangle', 62 * p, T, null, v.filter('lowpass', 400, 0.8, am));
    const rl = v.lfo(rev * p, 0.4, am.gain, T, null);
    const cbp = v.filter('bandpass', 900 * p, 1.2, v.gain(0.3, v.out));                                // gravel crunch
    const tex = v.buffer(texture(v.ctx, 'sizzle'), T, null, cbp, 0.6 * p);
    const pg = v.gain(0.1, v.out);                                                                       // armour plates clacking
    const st = v.osc(strokeWave(v.ctx, 9), 2 * rev * p, T, null);
    const dp = v.gain(0.9); st.connect(dp); dp.connect(pg.gain);
    const mg = v.gain(0.05, pg);
    for (const f of [410, 1130, 2210]) v.osc('sine', f, T, null, mg);
    v.noise('pink', T, null, v.filter('bandpass', 1800, 2, v.gain(0.3, pg)));
    return {
      pitch(q, now) {
        const k = 0.05;
        rlp.frequency.setTargetAtTime(200 * q, now, k); o.frequency.setTargetAtTime(62 * q, now, k); rl.osc.frequency.setTargetAtTime(rev * q, now, k);
        cbp.frequency.setTargetAtTime(900 * q, now, k); tex.playbackRate.setTargetAtTime(0.6 * q, now, k); st.frequency.setTargetAtTime(2 * rev * q, now, k);
      },
    };
  },
});
def('crab_hit', {
  gain: 0.38, max: 4, jitter: 0.1, reverb: 0.06, minGap: 0.04,
  build(v, p) {
    clank(v, 0, v.r(1500, 1900), 0.45, 0.12, p, 3);
    v.nz({ f: 2600 * p, f1: 1200 * p, sw: 0.04, q: 2, a: 0.001, d: 0.04, peak: 0.3 });                 // ink spatter
  },
});
def('crab_break', {
  gain: 0.45, max: 2, jitter: 0.02, reverb: 0.25,
  build(v, p) {
    const T = v.t;
    const g = v.gain(0, v.out), end = pts(g.gain, T, [[0, 0], [0.02, 0.3], [0.5, 0.2], [0.75, 0]]);    // servo power-down
    const lp = v.filter('lowpass', 2500, 2, g);
    sweep(lp.frequency, T, 2500, 300, 0.75);
    const o = v.osc('sawtooth', 320 * p, T, end + 0.01, lp);
    sweep(o.frequency, T, 320 * p, 55 * p, 0.75);
    [[0, 1], [0.16, 0.8], [0.34, 0.6]].forEach(([t, a], i) => {                                          // clunks
      clank(v, t, 520 - i * 90, 0.35 * a, 0.2, p);
      v.tone({ t, f: 150 * p, f1: 60 * p, sw: 0.06, a: 0.001, d: 0.12, peak: 0.7 * a });
      v.nz({ t, kind: 'pink', ft: 'lowpass', f: 900, a: 0.001, d: 0.06, peak: 0.5 * a });
    });
    bigSplat(v, 0.42, p, 0.9);                                                                            // ink burst
    bloops(v, 0.45, 5, 0.3, [300, 650], 0.3, p);
    v.nz({ t: 0.42, ft: 'highpass', f: 3000, a: 0.02, d: 0.5, peak: 0.2 });
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
/* ---- Zone Control (src/ui/hud.js plays the control / penalty / shift / overtime cues on the zones:* events;
 *      src/fx/zoneMarks.js plays the zones' own positional sounds: the hum, the flood / wipe, the contested warnings) ---- */
// shared: a wet ink-flood burst (low slosh swelling into a bright spray) under the control cues
function floodBurst(v, T, p, s) {
  const g = v.gain(0, v.out), lp = v.filter('lowpass', 500, 1.2, g);
  sweep(lp.frequency, T, 420 * p, 3600 * p, 0.2); lp.frequency.exponentialRampToValueAtTime(900 * p, T + 0.55);
  pts(g.gain, T, [[0, 0], [0.03, 0.75 * s], [0.22, 0.5 * s], [0.6, 0]]);
  v.noise('pink', T, T + 0.62, lp);
  bloops(v, T - v.t + 0.04, 4, 0.2, [320, 620], 0.3 * s, p);
  v.tone({ at: T, f: 95 * p, f1: 44 * p, sw: 0.2, a: 0.003, d: 0.3, peak: 0.75 * s });
}
// glass-and-ink crack: a hard transient with inharmonic, falling metal partials (a hold breaking)
function crack(v, T, p, s, dir = -1) {
  v.nz({ at: T, ft: 'highpass', f: 2200, a: 0.0006, d: 0.05, peak: 0.8 * s });
  v.nz({ at: T, f: 4200 * p, f1: (dir < 0 ? 1400 : 7000) * p, sw: 0.18, q: 6, a: 0.001, d: 0.2, peak: 0.45 * s });
  for (const [r, a, d] of [[1, 0.3, 0.3], [2.43, 0.18, 0.2], [3.87, 0.11, 0.14], [5.61, 0.07, 0.09]]) {
    const f = 1150 * p * r;
    v.tone({ at: T + 0.004, f, f1: f * (dir < 0 ? 0.82 : 1.12), sw: d, a: 0.0008, d, peak: a * s });
  }
}
// WE take control: an ink splash + a quick 8-bit climb landing on a bright brass C major with a sub and a sparkle
def('zone_ours', {
  gain: 0.33, max: 1, jitter: 0, reverb: 0.22, minGap: 0.25,
  build(v, p) {
    const T = v.t, lp = v.filter('lowpass', 4600, 0.8, v.out), pw = pulseWave(v.ctx, 0.25);
    floodBurst(v, T, p, 0.55);
    kick(v, T, 0.75);
    [67, 72, 76, 79].forEach((m, i) => v.tone({ t: i * 0.055, type: pw, f: mtof(m) * p, a: 0.002, h: 0.04, d: 0.13, peak: 0.26, to: lp }));
    for (const [m, pan] of [[72, -0.3], [76, 0.3], [79, 0], [84, 0.12]]) brass(v, T + 0.22, mtof(m) * p, 0.42, m === 84 ? 0.2 : 0.34, { to: v.pan(pan, v.out), bright: 4600, a: 0.01, r: 0.36 });
    bass(v, T + 0.22, mtof(48) * p, 0.4, 0.55, { style: 'sub' });
    crash(v, T + 0.22, 0.28, { d: 0.9 });
    [91, 96].forEach((m, i) => bell(v, T + 0.26 + i * 0.07, mtof(m) * p, 0.16, { d: 0.7 }));
    v.nz({ t: 0.08, f: 900, f1: 5200, sw: 0.2, q: 1.5, a: 0.12, d: 0.14, peak: 0.26 });
  },
});
// THEY take control: a low boom, a falling diminished figure and a dark, clustered brass stab over a sagging saw —
// an alarm, clearly not ours
def('zone_theirs', {
  gain: 0.33, max: 1, jitter: 0, reverb: 0.2, minGap: 0.25,
  build(v, p) {
    const T = v.t, lp = v.filter('lowpass', 2600, 0.9, v.out), pw = pulseWave(v.ctx, 0.3);
    kick(v, T, 0.95, { f0: 120, f1: 38, d: 0.5 }); tom(v, T + 0.02, 55, 0.7);
    [70, 66, 63, 58].forEach((m, i) => v.tone({ t: i * 0.06, type: pw, f: mtof(m) * p, a: 0.002, h: 0.045, d: 0.12, peak: 0.24, to: lp }));
    for (const [m, pan] of [[51, -0.3], [54, 0.3], [57, -0.1], [58, 0.15]]) brass(v, T + 0.24, mtof(m) * p, 0.5, 0.32, { to: v.pan(pan, v.out), bright: 1700, a: 0.02, r: 0.4 });
    bass(v, T + 0.24, mtof(39) * p, 0.5, 0.6, { style: 'sub' });
    v.tone({ t: 0.24, type: 'sawtooth', f: 233 * p, f1: 98 * p, sw: 0.6, a: 0.01, d: 0.6, peak: 0.16, to: v.filter('lowpass', 1000, 2.5, v.out) });
    // two-tone warning horn
    const hl = v.filter('lowpass', 1800, 1.4, v.out);
    v.tone({ t: 0.26, type: 'square', f: 466 * p, a: 0.01, h: 0.12, d: 0.05, peak: 0.12, to: hl });
    v.tone({ t: 0.44, type: 'square', f: 415 * p, a: 0.01, h: 0.16, d: 0.12, peak: 0.12, to: hl });
  },
});
// our hold is broken (the zone goes neutral while we held it): a crack, a falling zap and a thud, a minor drop
def('zone_lost', {
  gain: 0.58, max: 1, jitter: 0, reverb: 0.2, minGap: 0.25,
  build(v, p) {
    const T = v.t, lp = v.filter('lowpass', 2800, 0.9, v.out), pw = pulseWave(v.ctx, 0.25);
    crack(v, T, p, 0.9, -1);
    v.tone({ type: 'sawtooth', f: 980 * p, f1: 150 * p, sw: 0.38, a: 0.002, d: 0.4, peak: 0.2, to: v.filter('lowpass', 2400, 3, v.out) });
    tom(v, T + 0.02, 82, 0.7);
    [74, 69].forEach((m, i) => v.tone({ t: 0.1 + i * 0.12, type: pw, f: mtof(m) * p, a: 0.002, h: 0.07, d: 0.18, peak: 0.22, to: lp }));
    for (const [m, pan] of [[57, -0.2], [60, 0.2], [64, 0]]) brass(v, T + 0.24, mtof(m) * p, 0.3, 0.2, { to: v.pan(pan, v.out), bright: 1900, a: 0.02, r: 0.3 });
  },
});
// we break THEIR hold (their zone goes neutral): a crack that rings upward and a bright two-note lift — good news,
// but smaller than a capture
def('zone_broken', {
  gain: 0.58, max: 1, jitter: 0, reverb: 0.2, minGap: 0.25,
  build(v, p) {
    const T = v.t, lp = v.filter('lowpass', 4200, 0.8, v.out), pw = pulseWave(v.ctx, 0.25);
    crack(v, T, p, 0.8, 1);
    v.nz({ f: 700, f1: 4800, sw: 0.25, q: 1.6, a: 0.08, d: 0.14, peak: 0.24 });
    [76, 83].forEach((m, i) => v.tone({ t: 0.08 + i * 0.08, type: pw, f: mtof(m) * p, a: 0.002, h: 0.05, d: 0.16, peak: 0.24, to: lp }));
    bell(v, T + 0.16, mtof(88) * p, 0.2, { d: 0.6 });
    kick(v, T, 0.45);
  },
});
// our held zone is being inked back (≈ 30 %, the hold breaks at 40 %): an urgent, clipped double-beep alarm
def('zone_warn', {
  gain: 0.42, max: 1, jitter: 0, reverb: 0.06, minGap: 1.5,
  build(v, p) {
    const bp = v.filter('bandpass', 1500, 1.1, v.out);
    for (const t of [0, 0.13, 0.36, 0.49]) {
      v.tone({ t, type: 'square', f: 1245 * p, f1: 1175 * p, sw: 0.08, a: 0.002, h: 0.06, d: 0.03, peak: 0.34, to: bp });
      v.tone({ t, f: 622 * p, a: 0.002, h: 0.06, d: 0.04, peak: 0.2 });
    }
    v.tone({ type: 'sawtooth', f: 110 * p, a: 0.01, h: 0.5, d: 0.1, peak: 0.1, to: v.filter('lowpass', 500, 1, v.out) });
  },
});
// THEIR held zone is nearly broken (we've inked ≈ 30 % back): rising, bubbly chirps — go, go
def('zone_chance', {
  gain: 0.55, max: 1, jitter: 0, reverb: 0.1, minGap: 1.5,
  build(v, p) {
    const lp = v.filter('lowpass', 3600, 0.8, v.out), pw = pulseWave(v.ctx, 0.2);
    [[0, 67, 74], [0.16, 71, 79]].forEach(([t, a, b]) => v.tone({ t, type: pw, f: mtof(a) * p, f1: mtof(b) * p, sw: 0.1, a: 0.002, h: 0.07, d: 0.12, peak: 0.45, to: lp }));
    v.tone({ t: 0.16, type: 'triangle', f: mtof(83) * p, a: 0.002, d: 0.25, peak: 0.16 });
    plips(v, 0.04, 4, 0.3, [900, 1900], 0.22, p);
  },
});
// the flood (positional, at the zone): a big wet surge rolling out as the zone fills with the taker's ink
def('zone_flood', {
  gain: 0.7, max: 3, jitter: 0.03, reverb: 0.2, minGap: 0.1,
  build(v, p) {
    const T = v.t;
    floodBurst(v, T, p, 1);
    const g = v.gain(0, v.out), bp = v.filter('bandpass', 700 * p, 1.4, g);
    sweep(bp.frequency, T, 700 * p, 2600 * p, 0.45);
    pts(g.gain, T, [[0, 0], [0.12, 0.45], [0.5, 0]]);
    v.noise('white', T, T + 0.52, bp);
    let t = 0.12;
    for (let i = 0; i < 8; i++) { t += v.r(0.03, 0.07); v.bub(T + t, v.r(500, 1500) * p, 0.2 * (1 - i / 10), v.r(0.018, 0.035), v.r(1.4, 2)); }
  },
});
// the wipe (positional, at a zone becoming the objective): the old ink draining away — a falling hiss and a suck
def('zone_wipe', {
  gain: 0.7, max: 3, jitter: 0.03, reverb: 0.25, minGap: 0.1,
  build(v, p) {
    const T = v.t, g = v.gain(0, v.out), hp = v.filter('bandpass', 5000, 0.9, g);
    sweep(hp.frequency, T, 6500 * p, 700 * p, 0.6);
    pts(g.gain, T, [[0, 0], [0.08, 0.5], [0.45, 0.35], [0.7, 0]]);
    v.noise('pink', T, T + 0.72, hp);
    v.tone({ t: 0.35, f: 140 * p, f1: 420 * p, sw: 0.22, a: 0.01, d: 0.22, peak: 0.3 });
  },
});
// the last 30 s: centre only — a snare swell into three rising brass hits and a crash
def('zone_final', {
  gain: 0.4, max: 1, jitter: 0, reverb: 0.25, minGap: 1,
  build(v, p) {
    const T = v.t, c = v.gain(0, v.out);
    pts(c.gain, T, [[0, 0], [0.05, 0.12], [0.55, 0.7], [0.6, 0]]);
    snareRoll(v, T, T + 0.62, p, c);
    [[0.62, [62, 69]], [0.8, [64, 71]], [0.98, [67, 74, 79]]].forEach(([t, ms]) => {
      for (const m of ms) brass(v, T + t, mtof(m) * p, t > 0.9 ? 0.6 : 0.12, 0.3, { to: v.pan(m % 2 ? 0.25 : -0.25, v.out), bright: 4200, a: 0.008, r: t > 0.9 ? 0.45 : 0.08 });
      tom(v, T + t, mtof(ms[0] - 24) * p, 0.6);
    });
    crash(v, T + 0.98, 0.4, { d: 1.4 }); kick(v, T + 0.98, 0.8);
  },
});
// the zones' own sound (positional loop, one per live zone): a soft pulsing tone whose timbre says who holds it —
// neutral: an open fifth, airy; ours: a warm major third, brighter; theirs: a buzzy, beating tritone, darker — and
// tension (0..1, a flip coming) quickens the pulse, lifts the pitch and opens the filter.
//   h = audio.loop('zone_hum', { pos, volume }); h.set({ pos, volume, params: { mode: 'neutral'|'ours'|'theirs', tension } })
const HUM = {
  neutral: { f: 196, iv: 1.5, hard: 0, det: 4, cut: 1300, rate: 0.7, depth: 0.18, air: 0.05 },
  ours: { f: 220, iv: 1.26, hard: 0.1, det: 5, cut: 2300, rate: 1.1, depth: 0.2, air: 0.02 },
  theirs: { f: 185, iv: 1.414, hard: 0.26, det: 24, cut: 950, rate: 1.1, depth: 0.28, air: 0.02 },
};
def('zone_hum', {
  gain: 0.14, max: 4, jitter: 0, reverb: 0.12, oneShot: 2.5,
  loop(v, p) {
    const T = v.t, H = HUM.neutral;
    const lp = v.filter('lowpass', H.cut, 0.9, v.out);
    const amp = v.gain(0.72, lp);
    const pulse = v.lfo(H.rate, H.depth, amp.gain, T, null);
    const soft = v.gain(0.62, amp), iv = v.gain(0.42, soft), hard = v.gain(H.hard, amp);
    const o1 = v.osc('triangle', H.f * p, T, null, soft);
    const o2 = v.osc('triangle', H.f * H.iv * p, T, null, iv);
    const o3 = v.osc('sawtooth', H.f * 0.5 * p, T, null, hard);
    const o4 = v.osc('sawtooth', H.f * 0.5 * p, T, null, hard);
    o4.detune.value = H.det;
    const air = v.gain(H.air, v.out);
    v.noise('pink', T, null, v.filter('bandpass', 2600, 1.1, air));
    let q = p, st = { mode: 'neutral', tension: 0 };
    const apply = (now, k = 0.22) => {
      const S = HUM[st.mode] || H, x = Math.min(1, Math.max(0, +st.tension || 0));
      const f = S.f * q * Math.pow(2, (2.5 * x) / 12);
      o1.frequency.setTargetAtTime(f, now, k); o2.frequency.setTargetAtTime(f * S.iv, now, k);
      o3.frequency.setTargetAtTime(f * 0.5, now, k); o4.frequency.setTargetAtTime(f * 0.5, now, k);
      o4.detune.setTargetAtTime(S.det, now, k);
      hard.gain.setTargetAtTime(S.hard * (1 + 0.6 * x), now, k);
      lp.frequency.setTargetAtTime(Math.min(9000, S.cut * (1 + 1.3 * x)), now, k);
      pulse.osc.frequency.setTargetAtTime(S.rate * (1 + 4.5 * x), now, k);
      pulse.depth.gain.setTargetAtTime(Math.min(0.55, S.depth + 0.3 * x), now, k);
      air.gain.setTargetAtTime(S.air + 0.06 * x, now, k);
    };
    return {
      pitch(np, now) { q = np; apply(now); },
      params(o, now) { if (!o) return; if (o.mode) st.mode = o.mode; if (o.tension != null) st.tension = o.tension; apply(now); },
    };
  },
});
// a penalty lands: a two-step buzzer and a thump
def('zone_penalty', {
  gain: 0.3, max: 2, jitter: 0, reverb: 0.1, minGap: 0.2,
  build(v, p) {
    const lp = v.filter('lowpass', 2400, 1, v.out);
    v.tone({ type: 'square', f: 330 * p, a: 0.002, h: 0.07, d: 0.05, peak: 0.26, to: lp });
    v.tone({ t: 0.11, type: 'square', f: 247 * p, a: 0.002, h: 0.14, d: 0.12, peak: 0.28, to: lp });
    v.tone({ t: 0.11, type: 'sawtooth', f: 123.5 * p, a: 0.004, h: 0.12, d: 0.14, peak: 0.15, to: lp });
    tom(v, v.t + 0.1, 70, 0.55);
  },
});
// the objective moves: an air sweep and a two-note announcement chime
def('zone_shift', {
  gain: 0.38, max: 1, jitter: 0, reverb: 0.3, minGap: 0.4,
  build(v, p) {
    const T = v.t;
    const g = v.gain(0, v.out), bp = v.filter('bandpass', 400, 1.6, g);
    sweep(bp.frequency, T, 400, 3200, 0.35);
    pts(g.gain, T, [[0, 0], [0.25, 0.28], [0.42, 0]]);
    v.noise('white', T, T + 0.44, bp);
    bell(v, T + 0.12, mtof(84) * p, 0.3, { d: 0.9, index: 1.4 });
    bell(v, T + 0.36, mtof(79) * p, 0.3, { d: 1.1, index: 1.4 });
    pad(v, T + 0.12, mtof(72) * p, 0.5, 0.08, { a: 0.02, r: 0.5, cut: 2200 });
  },
});
// overtime begins: a two-tone siren under a brass stab
def('zone_overtime', {
  gain: 0.32, max: 1, jitter: 0, reverb: 0.25,
  build(v, p) {
    const T = v.t;
    const g = v.gain(0, v.out);
    ahr(g.gain, T, 0.03, 0.2, 0.8, 0.25);
    const o = v.osc('square', 700 * p, T, T + 1.12, v.filter('lowpass', 2600, 1, g));
    v.lfo(5, 180 * p, o.frequency, T, T + 1.12, 'square');
    for (const [m, pan] of [[62, -0.3], [65, 0.3], [69, -0.1], [74, 0.15]]) brass(v, T + 0.05, mtof(m) * p, 0.5, 0.3, { to: v.pan(pan, v.out), bright: 4000, a: 0.01, r: 0.4 });
    crash(v, T + 0.05, 0.4); kick(v, T + 0.05, 0.7);
  },
});
// last ten counts of either team: a small, dry tick (higher for ours)
def('zone_tick', {
  gain: 0.2, max: 2, jitter: 0, reverb: 0.04, minGap: 0.12,
  build(v, p) {
    v.tone({ type: 'triangle', f: 1760 * p, a: 0.0008, d: 0.05, peak: 0.45 });
    v.tone({ f: 880 * p, a: 0.001, d: 0.07, peak: 0.22 });
    v.nz({ ft: 'highpass', f: 6000, a: 0.0003, d: 0.008, peak: 0.22 });
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

/* ---- Boss mode: HULLBREAKER (played by src/audio/bossAudio.js from the boss:* events; `ref` = reference distance,
 * so a 6 m crab stays loud across the arena) ---- */
def('boss_roar', {
  gain: 0.37, max: 2, jitter: 0.04, reverb: 0.34, ref: 16,
  build(v, p) {
    const T = v.t, D = 1.9;
    // throat: detuned saws + a square through a driven formant pair; pitch swells then sags, growl flutter on top
    const env = v.gain(0, v.out);
    pts(env.gain, T, [[0, 0], [0.12, 0.75], [0.5, 1], [1.3, 0.85], [D, 0]]);
    const flutter = v.gain(1, env);
    v.lfo(24, 0.4, flutter.gain, T, T + D);
    const drive = v.shaper(3, flutter);
    const f1 = v.filter('bandpass', 380, 2.4, drive), f2 = v.filter('bandpass', 1050, 3.2, v.gain(0.7, drive));
    sweep(f1.frequency, T, 300, 720, 0.5); f1.frequency.exponentialRampToValueAtTime(240, T + D);
    sweep(f2.frequency, T, 900, 1500, 0.5); f2.frequency.exponentialRampToValueAtTime(700, T + D);
    const mix = v.gain(1); mix.connect(f1); mix.connect(f2);
    const lp = v.filter('lowpass', 2600, 0.8, mix);
    for (const [det, type, lv] of [[-14, 'sawtooth', 0.5], [9, 'sawtooth', 0.5], [0, 'square', 0.3]]) {
      const o = v.osc(type, 52 * p, T, T + D + 0.05, v.gain(lv, lp));
      o.detune.value = det;
      o.frequency.setValueAtTime(50 * p, T); o.frequency.linearRampToValueAtTime(80 * p, T + 0.45);
      o.frequency.linearRampToValueAtTime(58 * p, T + 1.3); o.frequency.linearRampToValueAtTime(38 * p, T + D);
    }
    v.nz({ kind: 'pink', f: 950, f1: 420, sw: D, q: 0.9, a: 0.1, h: 1.1, d: 0.6, peak: 0.5 });          // breath
    v.tone({ f: 46 * p, f1: 30 * p, sw: D, a: 0.1, h: 1.0, d: 0.7, peak: 0.75 });                       // chest
    bloops(v, 0.25, 6, 1.2, [170, 420], 0.22, p);                                                        // wet gurgle
  },
});
def('boss_step', {
  gain: 0.62, max: 6, jitter: 0.08, reverb: 0.12, ref: 10, minGap: 0.05,
  build(v, p) {
    v.tone({ f: 72 * p, f1: 32 * p, sw: 0.18, a: 0.002, d: 0.32, peak: 1 });
    v.nz({ kind: 'brown', ft: 'lowpass', f: 700, f1: 110, sw: 0.25, a: 0.002, d: 0.3, peak: 0.8 });
    v.nz({ t: 0.004, f: 380 * p, q: 6, a: 0.001, d: 0.12, peak: 0.32 });                              // the container clanks
    v.tone({ t: 0.01, type: 'triangle', f: 233 * p, a: 0.001, d: 0.2, peak: 0.12 });
    v.tone({ t: 0.01, type: 'triangle', f: 347 * p, a: 0.001, d: 0.15, peak: 0.08 });
    plips(v, 0.02, 2, 0.06, [260, 520], 0.1, p);
  },
});
def('boss_slam', {
  gain: 0.4, max: 2, jitter: 0.04, reverb: 0.3, ref: 16,
  build(v, p) {
    v.tone({ f: 82 * p, f1: 25 * p, sw: 0.9, a: 0.002, d: 1.25, peak: 1 });
    v.nz({ ft: 'highpass', f: 1600, a: 0.0003, d: 0.06, peak: 1 });
    const sh = v.shaper(3, v.gain(0.7, v.out));
    v.nz({ kind: 'pink', ft: 'lowpass', f: 5200, f1: 120, sw: 0.9, q: 0.8, a: 0.002, d: 1.1, peak: 1, to: sh });
    for (const [f, pk, d] of [[183, 0.26, 0.95], [497, 0.18, 0.6], [1130, 0.1, 0.42], [1720, 0.06, 0.3]]) v.tone({ type: 'triangle', f: f * p, a: 0.001, d, peak: pk });   // claw armour rings
    bigSplat(v, 0.03, p * 0.8, 0.9);
    v.nz({ t: 0.12, f: 700, f1: 190, sw: 1.0, q: 1.4, a: 0.02, d: 1.0, peak: 0.5 });                   // the shockwave ring rolling out
  },
});
def('boss_tele', {
  gain: 0.34, max: 2, jitter: 0.02, reverb: 0.25, ref: 16, minGap: 0.25,
  build(v, p) {
    // ominous low horn "bwaamp" + a metal creak: something big is winding up
    const T = v.t;
    for (const [m, pan] of [[38, -0.2], [45, 0.2], [50, 0]]) brass(v, T, mtof(m) * p, 0.34, 0.4, { to: v.pan(pan, v.out), bright: 1400, a: 0.03, r: 0.3 });
    const g = v.gain(0, v.out); pts(g.gain, T, [[0, 0], [0.05, 0.25], [0.45, 0.18], [0.6, 0]]);
    const bp = v.filter('bandpass', 700 * p, 9, g); sweep(bp.frequency, T, 700 * p, 1100 * p, 0.55);
    v.noise('pink', T, T + 0.62, bp);
  },
});
def('boss_whistle', {
  gain: 0.21, max: 6, jitter: 0.06, reverb: 0.1, ref: 8,
  build(v, p) {
    const T = v.t, D = 0.95;
    const g = v.gain(0, v.out); pts(g.gain, T, [[0, 0], [0.08, 0.5], [D - 0.1, 0.75], [D, 0]]);
    const o = v.osc('sine', 2100 * p, T, T + D + 0.02, g);
    o.frequency.exponentialRampToValueAtTime(640 * p, T + D);
    v.lfo(9, 38, o.frequency, T, T + D);
    v.nz({ f: 2000 * p, f1: 700 * p, sw: D, q: 4, a: 0.1, h: D - 0.2, d: 0.1, peak: 0.12 });
  },
});
def('boss_barrel', {
  gain: 0.6, max: 6, jitter: 0.07, reverb: 0.18, ref: 9, minGap: 0.04,
  build(v, p) {
    v.nz({ ft: 'highpass', f: 1200, a: 0.0005, d: 0.05, peak: 0.9 });
    for (let i = 0; i < 3; i++) v.nz({ t: v.r(0, 0.04), f: v.r(500, 1400) * p, q: 8, a: 0.001, d: v.r(0.04, 0.09), peak: 0.4 });   // staves crack
    v.tone({ f: 140 * p, f1: 58 * p, sw: 0.2, a: 0.002, d: 0.3, peak: 0.7 });
    bigSplat(v, 0.01, p, 1.1);
  },
});
def('boss_cannon_charge', {
  gain: 0.23, max: 2, jitter: 0.02, reverb: 0.15, ref: 14,
  build(v, p) {
    const T = v.t, D = 1.25;
    const g = v.gain(0, v.out); pts(g.gain, T, [[0, 0], [0.2, 0.35], [D - 0.08, 1], [D, 0]]);
    const trem = v.gain(1, g); v.lfo(14, 0.3, trem.gain, T, T + D);
    const lp = v.filter('lowpass', 600, 5, trem); sweep(lp.frequency, T, 500, 5200, D);
    const o = v.osc('sawtooth', 110 * p, T, T + D + 0.02, lp); o.frequency.exponentialRampToValueAtTime(640 * p, T + D);
    const o2 = v.osc('sine', 220 * p, T, T + D + 0.02, v.gain(0.5, trem)); o2.frequency.exponentialRampToValueAtTime(1280 * p, T + D);
    const bub = v.gain(0, v.out); pts(bub.gain, T, [[0, 0], [0.3, 0.3], [D, 0.65], [D + 0.05, 0]]);
    v.buffer(texture(v.ctx, 'bubbles_bright'), T, T + D + 0.05, bub, 1.2 * p);
  },
});
def('boss_cannon_sweep', {
  gain: 0.27, max: 2, jitter: 0, reverb: 0.12, ref: 14, oneShot: 2.4,
  loop(v, p) {
    const T = v.t;
    const hs = v.gain(0.5, v.out);
    v.noise('white', T, null, v.filter('bandpass', 1800 * p, 0.8, hs));
    v.lfo(6, 0.12, hs.gain, T, null);
    v.noise('brown', T, null, v.filter('lowpass', 260, 1, v.gain(0.6, v.out)));
    const tex = v.buffer(texture(v.ctx, 'squelch'), T, null, v.gain(0.7, v.filter('lowpass', 1400, 0.8, v.out)), p);
    const o = v.osc('sawtooth', 55 * p, T, null, v.gain(0.12, v.filter('lowpass', 300, 1, v.out)));
    return { pitch(q, now) { tex.playbackRate.setTargetAtTime(q, now, 0.05); o.frequency.setTargetAtTime(55 * q, now, 0.05); } };
  },
});
def('boss_gallop', {
  gain: 0.42, max: 2, jitter: 0, reverb: 0.1, ref: 12, oneShot: 1.8,
  loop(v, p) {
    // eight legs pounding: a stroke-shaped AM (~9 thuds/s) on a sub thump, dirt and a container rattle, plus scrape
    const T = v.t, am = v.gain(0, v.out);
    const st = v.osc(strokeWave(v.ctx, 9), 8.5 * p, T, null);
    const dep = v.gain(1); st.connect(dep); dep.connect(am.gain);
    v.osc('sine', 58 * p, T, null, v.gain(0.9, am));
    v.noise('brown', T, null, v.filter('lowpass', 500, 1, v.gain(1.2, am)));
    v.noise('white', T, null, v.filter('bandpass', 420 * p, 5, v.gain(0.35, am)));
    v.noise('pink', T, null, v.filter('bandpass', 900, 0.7, v.gain(0.12, v.out)));
    return { pitch(q, now) { st.frequency.setTargetAtTime(8.5 * q, now, 0.05); } };
  },
});
def('boss_crash', {
  gain: 0.49, max: 2, jitter: 0.04, reverb: 0.32, ref: 16,
  build(v, p) {
    v.tone({ f: 96 * p, f1: 30 * p, sw: 0.7, a: 0.002, d: 1.0, peak: 1 });
    v.nz({ ft: 'highpass', f: 1500, a: 0.0003, d: 0.08, peak: 1 });
    const sh = v.shaper(4, v.gain(0.6, v.out));
    v.nz({ kind: 'pink', ft: 'lowpass', f: 7000, f1: 300, sw: 0.6, q: 0.8, a: 0.002, d: 0.85, peak: 1, to: sh });
    for (const [f, pk, d] of [[151, 0.3, 1.3], [412, 0.22, 0.9], [867, 0.16, 0.7], [1391, 0.1, 0.5], [2210, 0.06, 0.35]]) v.tone({ type: 'triangle', f: f * p, f1: f * p * 0.96, sw: d, a: 0.001, d, peak: pk });
    for (let i = 0; i < 9; i++) v.nz({ t: 0.08 + v.r(0, 0.6), f: v.r(900, 3500), q: 6, a: 0.001, d: v.r(0.02, 0.06), peak: v.r(0.1, 0.3) });   // debris
  },
});
def('boss_dizzy', {
  gain: 0.1, max: 1, jitter: 0, reverb: 0.2, ref: 10, oneShot: 2.5,
  loop(v, p) {
    // cartoon birdies circling its eye stalks: chirping sines on a sawtooth sweep, gated by a slow square
    const T = v.t;
    const gate = v.gain(0, v.out), am = v.gain(0.5); am.connect(gate.gain);
    v.osc('square', 3.2, T, null, am);
    gate.gain.value = 0.5;
    const o = v.osc('sine', 1700 * p, T, null, gate);
    v.lfo(7, 480 * p, o.frequency, T, null, 'sawtooth'); v.lfo(0.8, 260 * p, o.frequency, T, null);
    const o2 = v.osc('triangle', 2500 * p, T, null, v.gain(0.07, v.out));
    v.lfo(5.3, 650 * p, o2.frequency, T, null, 'sawtooth');
    return { pitch() {} };
  },
});
def('boss_frenzy', {
  gain: 0.26, max: 1, jitter: 0, reverb: 0.12, ref: 14, oneShot: 3,
  loop(v, p) {
    const T = v.t;
    const bp = v.filter('bandpass', 900, 1.2, v.gain(0.8, v.out));
    v.noise('pink', T, null, bp);
    const l = v.lfo(3.2 * p, 650, bp.frequency, T, null);                                            // whoosh per turn
    const hs = v.gain(0.35, v.out);
    v.noise('white', T, null, v.filter('highpass', 2500, 0.7, hs));
    v.lfo(3.2 * p, 0.2, hs.gain, T, null);
    v.buffer(texture(v.ctx, 'squelch'), T, null, v.gain(0.5, v.out), 1.3 * p);
    v.osc('sawtooth', 70 * p, T, null, v.gain(0.1, v.filter('lowpass', 240, 1, v.out)));
    return { pitch(q, now) { l.osc.frequency.setTargetAtTime(3.2 * q, now, 0.1); } };
  },
});
def('crablet_chitter', {
  gain: 1.0, max: 4, jitter: 0.1, reverb: 0.05, ref: 5, minGap: 0.08,
  build(v, p) {
    for (let i = 0; i < 9; i++) v.nz({ t: i * 0.035 + v.r(0, 0.012), ft: 'highpass', f: v.r(2500, 4500), a: 0.0005, d: v.r(0.008, 0.02), peak: v.r(0.3, 0.6) });
    v.tone({ t: 0.05, type: 'square', f: 1300 * p, f1: 1900 * p, sw: 0.06, a: 0.002, d: 0.07, peak: 0.1 });
    v.tone({ t: 0.18, type: 'square', f: 1500 * p, f1: 1100 * p, sw: 0.06, a: 0.002, d: 0.06, peak: 0.08 });
  },
});
def('crablet_pop', {
  gain: 0.45, max: 5, jitter: 0.08, reverb: 0.08, ref: 5, minGap: 0.03,
  build(v, p) {
    v.tone({ f: 900 * p, f1: 170 * p, sw: 0.07, a: 0.001, d: 0.09, peak: 0.8 });
    v.nz({ ft: 'highpass', f: 2500, a: 0.0005, d: 0.03, peak: 0.6 });
    bloops(v, 0.01, 3, 0.08, [500, 900], 0.35, p);
    plips(v, 0.03, 3, 0.1, [900, 1500], 0.15, p);
  },
});
def('boss_hit', {
  gain: 0.56, max: 4, jitter: 0.06, reverb: 0.04, minGap: 0.05,
  build(v, p) {
    v.tone({ f: 190 * p, f1: 88 * p, sw: 0.06, a: 0.001, d: 0.09, peak: 0.8 });                        // armoured thunk
    v.tone({ type: 'triangle', f: 640 * p, a: 0.001, d: 0.06, peak: 0.18 });
    v.nz({ f: 1800 * p, q: 2, a: 0.0005, d: 0.04, peak: 0.4 });
  },
});
def('boss_crit', {
  gain: 0.46, max: 3, jitter: 0.03, reverb: 0.1, minGap: 0.06,
  build(v, p) {
    v.nz({ ft: 'highpass', f: 2200, a: 0.0003, d: 0.05, peak: 0.8 });
    v.tone({ f: 260 * p, f1: 105 * p, sw: 0.08, a: 0.001, d: 0.12, peak: 0.8 });
    bell(v, v.t, mtof(91) * p, 0.34, { d: 0.35 });
    bell(v, v.t + 0.028, mtof(98) * p, 0.2, { d: 0.3 });
    v.tone({ type: 'square', f: 1760 * p, f1: 2640 * p, sw: 0.05, a: 0.001, d: 0.06, peak: 0.07 });
    bloops(v, 0.01, 2, 0.05, [500, 800], 0.22, p);
  },
});
def('boss_phase', {
  gain: 0.42, max: 1, jitter: 0, reverb: 0.34,
  build(v, p) {
    const T = v.t;
    crash(v, T, 0.7, { d: 2 }); kick(v, T, 0.9);
    tom(v, T, 55, 0.8); tom(v, T + 0.17, 49, 0.7); tom(v, T + 0.34, 43, 0.85);
    // a diminished stab over a low D: the fight just got worse
    for (const [m, pan] of [[38, 0], [50, -0.3], [53, 0.3], [56, -0.15], [62, 0.2]]) brass(v, T, mtof(m) * p, 0.95, 0.34, { to: v.pan(pan, v.out), bright: 3000, a: 0.02, r: 0.7 });
    v.tone({ f: 44 * p, f1: 30 * p, sw: 1.2, a: 0.01, d: 1.3, peak: 0.6 });
  },
});
def('boss_title', {
  gain: 0.31, max: 1, jitter: 0, reverb: 0.32,
  build(v, p) {
    const T = v.t;
    kick(v, T, 1); crash(v, T, 0.8, { d: 2.2 }); tom(v, T, 48, 0.9);
    v.tone({ f: 55 * p, f1: 29 * p, sw: 1.2, a: 0.002, d: 1.4, peak: 0.8 });
    for (const [m, pan] of [[38, 0], [50, -0.3], [53, 0.3], [57, -0.15], [62, 0.2], [65, 0]]) brass(v, T, mtof(m) * p, 0.62, 0.32, { to: v.pan(pan, v.out), bright: 3400, a: 0.015, r: 0.7 });
    const t2 = T + 0.72;
    tom(v, t2, 43, 0.85); kick(v, t2, 0.85);
    for (const [m, pan] of [[34, 0], [46, -0.25], [50, 0.25], [53, -0.1], [58, 0.1]]) brass(v, t2, mtof(m) * p, 1.0, 0.3, { to: v.pan(pan, v.out), bright: 2800, a: 0.02, r: 1.0 });
  },
});
def('boss_defeat', {
  gain: 0.36, max: 1, jitter: 0, reverb: 0.36, ref: 20,
  build(v, p) {
    const T = v.t;
    // a last groan, sagging down
    const g = v.gain(0, v.out); pts(g.gain, T, [[0, 0], [0.1, 0.7], [1.0, 0.5], [1.6, 0]]);
    const lp = v.filter('lowpass', 1500, 1.5, g); sweep(lp.frequency, T, 1500, 280, 1.6);
    for (const d of [-12, 7]) { const o = v.osc('sawtooth', 92 * p, T, T + 1.65, lp); o.detune.value = d; o.frequency.exponentialRampToValueAtTime(30 * p, T + 1.6); }
    // the container crumples
    for (let i = 0; i < 6; i++) {
      const t = 0.2 + i * 0.16 + v.r(0, 0.08);
      v.tone({ t, type: 'triangle', f: v.r(180, 900) * p, a: 0.001, d: v.r(0.2, 0.5), peak: v.r(0.08, 0.2) });
      v.nz({ t, f: v.r(700, 2400), q: 5, a: 0.001, d: 0.06, peak: 0.25 });
    }
    // it hits the deck
    v.tone({ t: 1.1, f: 76 * p, f1: 24 * p, sw: 1.0, a: 0.002, d: 1.3, peak: 1 });
    const sh = v.shaper(3, v.gain(0.6, v.out));
    v.nz({ t: 1.1, kind: 'pink', ft: 'lowpass', f: 4500, f1: 120, sw: 1.0, q: 0.8, a: 0.002, d: 1.2, peak: 1, to: sh });
    // ink geyser: a rushing column, bubbling, then big splats raining back down
    v.nz({ t: 1.35, f: 300, f1: 2600, sw: 1.2, q: 0.9, a: 0.25, h: 0.6, d: 1.0, peak: 0.7 });
    const bg = v.gain(0, v.out); pts(bg.gain, T + 1.35, [[0, 0], [0.3, 0.7], [1.6, 0.5], [2.3, 0]]);
    v.buffer(texture(v.ctx, 'bubbles'), T + 1.35, T + 3.7, bg, 1.1);
    for (let i = 0; i < 5; i++) bigSplat(v, 2.0 + i * 0.28 + v.r(0, 0.1), p * v.r(0.8, 1.2), 0.45);
  },
});
def('boss_sunk', {
  gain: 0.3, max: 1, jitter: 0, reverb: 0.3,
  build(v, p) {
    const T = v.t, b = 60 / 140;
    // short triumphant brass flourish (major), the squad won
    for (const [bt, ms, len] of [[0, [62, 66, 69, 74], 0.4], [0.5, [64, 67, 71, 76], 0.4], [1, [66, 69, 74, 78], 2.2]]) {
      ms.forEach((m, i) => brass(v, T + bt * b, mtof(m) * p, len * b, i === ms.length - 1 ? 0.5 : 0.24, { to: v.pan((i - 1.5) * 0.25, v.out), bright: 4200, a: 0.012, r: 0.4 }));
    }
    kick(v, T, 0.7); snare(v, T + 0.5 * b, 0.5); kick(v, T + b, 0.9); crash(v, T + b, 0.7, { d: 2 });
    bass(v, T + b, mtof(38) * p, 2 * b, 0.7, { style: 'sub' });
    [86, 90, 93, 98].forEach((m, i) => bell(v, T + (1.3 + i * 0.18) * b, mtof(m) * p, 0.12, { d: 0.8 }));
  },
});

/* ------------------------------------------------------------------------------------------------------------ */
// ---- Tower Command
// the tower rolling: a low motor, a gear whine and the clatter of its treads (positional loop, src/fx/towerFx.js)
def('tower_move', {
  gain: 0.2, max: 2, jitter: 0, reverb: 0.06, oneShot: 1.6,
  loop(v, p) {
    const T = v.t;
    const amp = v.gain(0.6, v.out), lp = v.filter('lowpass', 420 * p, 0.8, amp);
    v.osc('sawtooth', 46 * p, T, null, lp);
    v.osc('sawtooth', 46.7 * p, T, null, lp);
    const whine = v.gain(0.07, v.out);
    v.osc('triangle', 560 * p, T, null, v.filter('bandpass', 560 * p, 6, whine));
    const clat = v.gain(0.22, v.out);
    v.noise('white', T, null, v.filter('bandpass', 1700, 1.6, clat));
    v.lfo(11 * p, 0.2, clat.gain, T, null, 'square');
    v.lfo(1.3, 0.12, amp.gain, T, null);
  },
});
// the tower pulled up at a checkpoint: a clunk and a two-tone alarm
def('tower_checkpoint', {
  gain: 0.3, max: 1, jitter: 0, reverb: 0.2, minGap: 0.4,
  build(v, p) {
    const T = v.t;
    kick(v, T, 0.6, { f0: 110, f1: 45, d: 0.3 });
    v.nz({ f: 380, q: 2, a: 0.002, d: 0.12, peak: 0.4 });
    const pw = pulseWave(v.ctx, 0.35), lp = v.filter('lowpass', 3800, 0.8, v.out);
    for (let i = 0; i < 3; i++) {
      v.tone({ t: 0.12 + i * 0.26, type: pw, f: mtof(81) * p, a: 0.004, h: 0.09, d: 0.03, peak: 0.24, to: lp });
      v.tone({ t: 0.25 + i * 0.26, type: pw, f: mtof(76) * p, a: 0.004, h: 0.09, d: 0.03, peak: 0.24, to: lp });
    }
  },
});
// a checkpoint cleared: a rising run into a bright stab and a bell
def('tower_clear', {
  gain: 0.32, max: 1, jitter: 0, reverb: 0.24, minGap: 0.4,
  build(v, p) {
    const T = v.t, lp = v.filter('lowpass', 5200, 0.8, v.out), pw = pulseWave(v.ctx, 0.25);
    [64, 67, 71, 74, 79].forEach((m, i) => v.tone({ t: i * 0.045, type: pw, f: mtof(m) * p, a: 0.002, h: 0.03, d: 0.1, peak: 0.22, to: lp }));
    for (const [m, pan] of [[71, -0.3], [74, 0.3], [79, 0]]) brass(v, T + 0.24, mtof(m) * p, 0.36, 0.3, { to: v.pan(pan, v.out), bright: 5200, a: 0.01, r: 0.3 });
    kick(v, T + 0.24, 0.6);
    bell(v, T + 0.3, mtof(91) * p, 0.18, { d: 0.8 });
    crash(v, T + 0.24, 0.2, { d: 0.7 });
  },
});
// a team takes the lead (the top bar's LEAD flash, src/ui/hud-lead.js) — a short sting, smaller than a capture's fanfare.
// Ours: a quick rising pulse run (C E G) with an upward swoosh into a bright fifth, a bell on top.
def('lead_ours', {
  gain: 0.4, max: 1, jitter: 0, reverb: 0.18, minGap: 1,
  build(v, p) {
    const T = v.t, lp = v.filter('lowpass', 5200, 0.8, v.out), pw = pulseWave(v.ctx, 0.25);
    [72, 76, 79].forEach((m, i) => v.tone({ t: i * 0.06, type: pw, f: mtof(m) * p, a: 0.002, h: 0.03, d: 0.09, peak: 0.26, to: lp }));
    v.nz({ t: 0.02, f: 900, f1: 5600, sw: 0.17, q: 1.4, a: 0.08, d: 0.1, peak: 0.16 });
    for (const [m, pan] of [[79, -0.25], [84, 0.25]]) brass(v, T + 0.18, mtof(m) * p, 0.2, 0.26, { to: v.pan(pan, v.out), bright: 5200, a: 0.008, r: 0.28 });
    kick(v, T + 0.18, 0.35);
    bell(v, T + 0.2, mtof(96) * p, 0.15, { d: 0.6 });
  },
});
// theirs: the same shape turned down — a falling run (D B♭ F) sagging into a dark, low minor third with a thud
def('lead_theirs', {
  gain: 0.4, max: 1, jitter: 0, reverb: 0.16, minGap: 1,
  build(v, p) {
    const T = v.t, lp = v.filter('lowpass', 2600, 0.9, v.out), pw = pulseWave(v.ctx, 0.3);
    [74, 70, 65].forEach((m, i) => v.tone({ t: i * 0.07, type: pw, f: mtof(m) * p, a: 0.002, h: 0.035, d: 0.1, peak: 0.24, to: lp }));
    v.tone({ t: 0.2, type: 'sawtooth', f: 262 * p, f1: 131 * p, sw: 0.35, a: 0.01, d: 0.35, peak: 0.1, to: v.filter('lowpass', 1200, 2, v.out) });
    for (const [m, pan] of [[58, -0.25], [61, 0.25]]) brass(v, T + 0.21, mtof(m) * p, 0.24, 0.26, { to: v.pan(pan, v.out), bright: 1800, a: 0.015, r: 0.3 });
    tom(v, T + 0.21, 70, 0.5);
  },
});

// sfx-cues: the sub and special cue sounds (src/audio/sfx-cues.js), built with this file's shared layers
defineCueSounds(def, { texture, bloops, plips, bigSplat, inkBoom, clank, whoosh, vox });
defineAlertSounds(def, { texture, bloops, whoosh, vox, clank });

export const SFX_GROUPS = {
  UI: ['ui_hover', 'ui_click', 'ui_back', 'ui_confirm', 'ui_toggle', 'ui_slider', 'ui_error'],
  Weapons: ['shoot_shooter', 'shoot_blaster', 'blaster_pump', 'blaster_boom', 'charger_charge', 'charger_full', 'shoot_charger', 'roller_flick', 'roll',
    'shoot_dualies', 'dualies_roll', 'slosh_throw', 'slosh_land', 'splatling_spin', 'splatling_ready', 'shoot_splatling', 'splatling_wind'],
  Ink: ['splat_small', 'splat_big', 'ink_hit_wall', 'bomb_throw', 'bomb_beep', 'bomb_explode'],
  Squid: ['squid_in', 'squid_out', 'swim', 'swim_splash', 'jump', 'land', 'climb', 'step_dry', 'step_ink', 'step_enemy', 'ink_drip'],
  World: ['gull', 'harbor_ambience', 'ferry_horn', 'halyard_clink'],
  Combat: ['hit_marker', 'ink_hit_body', 'hurt', 'splat_enemy', 'splatted_self', 'ally_splatted', 'enemy_ink_sizzle'],
  Status: ['low_ink', 'empty_click', 'refill_full', 'special_ready', 'special_activate', 'special_slam', 'storm_rain', 'storm_thunder', 'respawn', 'super_jump'],
  Specials: ['special_ending', 
    'special_end', 'shield_up', 'shield_hit', 'shield_pop', 'sonar_ping', 'sonar_mark', 'strike_launch', 'strike_whistle', 'strike_impact',
    'tornado', 'zooka_fire', 'wail_charge', 'wail_blast', 'kraken_on', 'kraken_jump', 'kraken_slam', 'blower_inflate', 'bubble_release',
    'bubble_pop', 'bubble_blast', 'jet_loop', 'jet_fire', 'jet_end', 'stamp_swing', 'stamp_slam', 'stamp_throw', 'booyah_charge',
    'booyah_cheer', 'booyah_throw', 'booyah_blast', 'zip_fire', 'zip_latch', 'zip_pull', 'crab_move', 'crab_gatling', 'crab_cannon',
    'crab_roll', 'crab_hit', 'crab_break',
    ...CUE_GROUPS.Specials,   // sfx-cues
  ],
  Subs: CUE_GROUPS.Subs,      // sfx-cues: throws, landings, fuses, loops and blasts of every sub
  Flight: ALERT_GROUPS.Flight,          // sfx-loud: every thrown sub in the air (one def, a voice per kind: params.kind)
  'Special alerts': ALERT_GROUPS.Alerts,   // sfx-loud: launch alerts + the "you're in it" alarm (params.kind)
  'Special stings': ALERT_GROUPS.Stings,   // sfx-loud: someone popped a special
  Match: ['ready', 'go_horn', 'countdown_tick', 'one_minute', 'final_count', 'times_up', 'judge_drumroll', 'judge_reveal', 'victory_fanfare', 'defeat_jingle', 'xp_tick', 'level_up'],
  Zones: ['zone_ours', 'zone_theirs', 'zone_lost', 'zone_broken', 'zone_warn', 'zone_chance', 'zone_penalty', 'zone_shift', 'zone_final',
    'zone_overtime', 'zone_tick', 'zone_flood', 'zone_wipe', 'zone_hum'],
  Tower: ['tower_move', 'tower_checkpoint', 'tower_clear'],
  Lead: ['lead_ours', 'lead_theirs'],
  Boss: ['boss_roar', 'boss_step', 'boss_slam', 'boss_tele', 'boss_whistle', 'boss_barrel', 'boss_cannon_charge', 'boss_cannon_sweep', 'boss_gallop', 'boss_crash',
    'boss_dizzy', 'boss_frenzy', 'crablet_chitter', 'crablet_pop', 'boss_hit', 'boss_crit', 'boss_phase', 'boss_title', 'boss_defeat', 'boss_sunk'],
};
export const SFX_NAMES = Object.values(SFX_GROUPS).flat();
export const LOOP_NAMES = SFX_NAMES.filter((n) => SFX[n] && SFX[n].loop);

export const audio = new AudioEngine();
export { musicSingleton as music };
