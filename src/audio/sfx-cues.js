// INKWAVE — sub and special audio cues (the sfx-cues job): a sound for every sub and special in every phase, so a
// player with their eyes shut can tell what was thrown or started, roughly where, whether it's coming at them and when
// it's about to go off. Procedural like the rest of src/audio/audio.js; audio.js calls defineCueSounds() before it
// builds SFX_GROUPS, and src/audio/cues.js (the director) plays them: the one-shots at each phase, and one positional
// loop per moving / live thing (following it, a Doppler-ish pitch and level as it comes at you), with the warnings on
// top — louder and harsher when it's the enemy's and close to you.
//
// Families (so the palette stays readable):
//   throw_*   the arm swing (a band-noise whoosh) + the sub's own signature (tick, schlup, ratchet, ting, rattle …)
//   *_land / *_stick / *_up   arming or deploying where it lands
//   fuse_* / *_warn / *_mark / *_alarm / lock_tone / beam_lock   warnings (loops with params { k: 0..1 progress,
//              foe: 0 | 1 }): ticking that speeds up and climbs; foe = the brighter, harder timbre
//   *_explode / *_pop / *_boom / *_burst / *_crash   the blasts, each with its own body and tail
//   loops: seeker_run, shaker_rattle, curtain_drip, sprinkler_spin,   (anything thrown, in the air: sub_flight, sfx-alerts.js)
//          mist_hiss, beacon_hum, twister, kraken_move, bubble_drift, stamp_carry, stamp_fly, orb_fly, zip_aura,
//          zip_whizz, shell_whistle, shield_hum, barrage_drum, wail_hold, strike_aim
// Loop pitch = the director's Doppler factor (≈0.84 receding … 1.22 approaching) times each loop's own rate.
import { mtof, perc, pts, sweep, strokeWave, pulseWave, snare, bell } from './music.js';

// ---- shared bits ------------------------------------------------------------------------------------------------
// a gate LFO: silent most of the cycle, a smooth bump once per period (th = how narrow: 0.86 a tick … 0.3 a pulse)
const _gc = new Map();
function gateCurve(th) {
  let c = _gc.get(th);
  if (c) return c;
  const n = 512; c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, y = Math.max(0, (x - th) / (1 - th)); c[i] = y * y; }
  _gc.set(th, c);
  return c;
}
function gate(v, T, rate, th, depth, param, phase = 0) {
  const ws = v.ctx.createWaveShaper(); ws.curve = gateCurve(th); v.nodes.push(ws);
  const d = v.gain(depth); ws.connect(d); d.connect(param);
  const o = v.osc('sine', rate, T + phase / Math.max(0.1, rate), null, ws);
  return { osc: o, depth: d };
}
const K = 0.04;   // param smoothing (s)
const clamp01 = (x) => Math.min(1, Math.max(0, +x || 0));
// the arm swing every throw shares (a quick rising band of noise)
function swing(v, t, f0, f1, dur, peak) {
  const T = v.t + t, g = v.gain(0, v.out), bp = v.filter('bandpass', f0, 1.5, g);
  sweep(bp.frequency, T, f0, f1, dur);
  pts(g.gain, T, [[0, 0], [dur * 0.6, peak], [dur, 0]]);
  v.noise('pink', T, T + dur + 0.02, bp);
}

export const CUE_GROUPS = {
  Subs: [
    // throws / placing
    'throw_sticky', 'throw_burst', 'throw_seeker', 'throw_scan', 'throw_curtain', 'throw_sprinkler', 'throw_mist', 'throw_shaker', 'throw_waddle',
    'place_mine', 'place_beacon',
    // landing / arming
    'sticky_stick', 'seeker_land', 'shaker_land', 'curtain_up', 'sprinkler_stick', 'mine_trip', 'waddle_beep', 'boomerang_tick',
    // windups (sub-tweaks: the Skitter / Waddle stop and wind up before they burst)
    'seeker_prime', 'waddle_prime',
    // warnings
    'fuse_bomb', 'fuse_sticky', 'hunt_alarm', 'lock_tone',
    // loops
    'seeker_run', 'shaker_rattle', 'curtain_drip', 'sprinkler_spin', 'mist_hiss', 'beacon_hum',
    // blasts / ends
    'sticky_explode', 'pellet_pop', 'seeker_explode', 'scan_burst', 'mist_burst', 'mine_explode', 'shaker_blast', 'waddle_explode',
    'waddle_pop', 'torpedo_burst', 'boomerang_blast', 'curtain_down', 'sprinkler_break', 'beacon_break', 'beacon_use', 'sub_smash',
  ],
  Specials: [
    // starts
    'slam_leap', 'storm_throw', 'barrage_start', 'strike_arm', 'zooka_arm', 'wail_up', 'blower_start', 'jet_ignite', 'stamp_start', 'zip_cloak',
    'crab_boot', 'orb_land', 'kraken_off', 'jet_boost', 'crab_reload', 'sonar_blip',
    // warnings
    'slam_warn', 'strike_mark', 'beam_lock', 'kraken_dive', 'orb_fuse', 'shell_whistle', 'stamp_fly',
    // loops
    'twister', 'kraken_move', 'bubble_drift', 'stamp_carry', 'orb_fly', 'zip_aura', 'zip_whizz', 'shield_hum', 'barrage_drum', 'wail_hold', 'strike_aim',
    // blasts / ends
    'twister_burst', 'shell_boom', 'stamp_crash', 'zip_impact', 'jet_boom', 'storm_fade', 'vortex_end',
  ],
};

// L: the audio.js helpers (texture, bloops, plips, bigSplat, inkBoom, clank, whoosh, vox)
export function defineCueSounds(def, L) {
  const { texture, bloops, plips, bigSplat, inkBoom, clank, whoosh, vox } = L;

  /* ================================================================================================ sub throws */
  // Cling Charge: a wet "schlup" off the fingers and a suction tick
  def('throw_sticky', {
    gain: 0.62, max: 3, jitter: 0.05, reverb: 0.05,
    build(v, p) {
      swing(v, 0, 380 * p, 1700 * p, 0.2, 0.42);
      v.nz({ f: 280 * p, f1: 950 * p, sw: 0.08, q: 7, a: 0.004, d: 0.1, peak: 0.62 });                 // schlup
      v.tone({ f: 190 * p, f1: 95 * p, sw: 0.05, a: 0.002, d: 0.07, peak: 0.45 });
      v.nz({ t: 0.012, ft: 'highpass', f: 3200, a: 0.0004, d: 0.012, peak: 0.35 });                     // suction tick
      bloops(v, 0.03, 2, 0.05, [380, 560], 0.2, p);
    },
  });
  // Pop Pellet: a light, quick flick — a high "pip" and a short whizz
  def('throw_burst', {
    gain: 0.5, max: 4, jitter: 0.06, reverb: 0.04, minGap: 0.04,
    build(v, p) {
      v.tone({ type: 'triangle', f: 900 * p, f1: 1500 * p, sw: 0.04, a: 0.001, d: 0.06, peak: 0.42 });
      v.tone({ f: 1800 * p, f1: 2600 * p, sw: 0.03, a: 0.001, d: 0.03, peak: 0.16 });
      swing(v, 0, 900 * p, 3000 * p, 0.12, 0.34);
    },
  });
  // Skitter Bomb: a wind-up ratchet (four clicks climbing) and its motor catching
  def('throw_seeker', {
    gain: 0.65, max: 3, jitter: 0.04, reverb: 0.05,
    build(v, p) {
      for (let i = 0; i < 4; i++) {
        v.nz({ t: i * 0.028, f: (2600 + i * 350) * p, q: 5, a: 0.0004, d: 0.012, peak: 0.6 });
        v.tone({ t: i * 0.028, f: 420 * p, f1: 300 * p, sw: 0.01, a: 0.0005, d: 0.014, peak: 0.2 });
      }
      const T = v.t + 0.1, g = v.gain(0, v.out), bp = v.filter('bandpass', 900, 4, g);
      const o = v.osc('sawtooth', 280 * p, T, T + 0.3, bp);
      sweep(o.frequency, T, 280 * p, 820 * p, 0.25); sweep(bp.frequency, T, 700 * p, 2200 * p, 0.25);
      pts(g.gain, T, [[0, 0], [0.04, 0.2], [0.2, 0.16], [0.3, 0]]);
      swing(v, 0.06, 500 * p, 1800 * p, 0.2, 0.3);
    },
  });
  // Echo Orb: a glassy ting and an airy lift
  def('throw_scan', {
    gain: 0.3, max: 3, jitter: 0.03, reverb: 0.14,
    build(v, p) {
      bell(v, v.t, 2637 * p, 0.3, { d: 0.55, ratio: 2.76, index: 0.9 });
      bell(v, v.t + 0.05, 3951 * p, 0.14, { d: 0.35, ratio: 2.76, index: 0.7 });
      whoosh(v, 0, 0.3, 700 * p, 2400 * p, 3600 * p, 0.3, { q: 1.6, kind: 'white' });
    },
  });
  // Drip Curtain: a heavy bag of ink sloshing as it's lobbed
  def('throw_curtain', {
    gain: 0.56, max: 3, jitter: 0.05, reverb: 0.06,
    build(v, p) {
      v.tone({ f: 150 * p, f1: 80 * p, sw: 0.08, a: 0.003, d: 0.12, peak: 0.55 });
      v.nz({ f: 520 * p, f1: 280 * p, sw: 0.22, q: 3, a: 0.01, d: 0.22, peak: 0.55 });                 // slosh
      v.nz({ t: 0.08, f: 380 * p, f1: 620 * p, sw: 0.15, q: 4, a: 0.01, d: 0.14, peak: 0.3 });           // …and back
      bloops(v, 0.04, 2, 0.12, [260, 420], 0.22, p);
      swing(v, 0, 300 * p, 1200 * p, 0.26, 0.36);
    },
  });
  // Twirl Sprinkler: a metal "zing" that spins as it leaves the hand
  def('throw_sprinkler', {
    gain: 0.28, max: 3, jitter: 0.04, reverb: 0.08,
    build(v, p) {
      const T = v.t, g = v.gain(0, v.out), end = pts(g.gain, T, [[0, 0], [0.01, 0.4], [0.22, 0.2], [0.32, 0]]);
      const o = v.osc('triangle', 700 * p, T, end + 0.01, g);
      sweep(o.frequency, T, 700 * p, 1450 * p, 0.28);
      v.lfo(32, 45, o.detune, T, end);
      clank(v, 0, 1150, 0.22, 0.12, p, 3);
      swing(v, 0, 600 * p, 2200 * p, 0.2, 0.3);
    },
  });
  // Murk Bomb: a squishy balloon "fwomp" and a gurgle
  def('throw_mist', {
    gain: 0.55, max: 3, jitter: 0.05, reverb: 0.06,
    build(v, p) {
      v.tone({ f: 230 * p, f1: 125 * p, sw: 0.12, a: 0.004, d: 0.14, peak: 0.5 });
      v.nz({ f: 700 * p, f1: 420 * p, sw: 0.12, q: 5, a: 0.004, d: 0.12, peak: 0.45 });                 // squish
      bloops(v, 0.05, 3, 0.12, [180, 360], 0.28, p);
      swing(v, 0, 300 * p, 950 * p, 0.24, 0.3);
    },
  });
  // Shaker Bomb: the spray-can shake (the bearing clacking) and a hiss of pressure as it goes
  def('throw_shaker', {
    gain: 0.65, max: 3, jitter: 0.04, reverb: 0.05,
    build(v, p) {
      for (let i = 0; i < 5; i++) v.nz({ t: i * 0.032 + v.r(0, 0.006), f: v.r(3600, 4600) * p, q: 6, a: 0.0004, d: 0.01, peak: 0.55 - i * 0.05 });
      v.nz({ t: 0.05, ft: 'highpass', f: 5000, a: 0.02, d: 0.2, peak: 0.22 });                          // hiss
      swing(v, 0.04, 500 * p, 1900 * p, 0.2, 0.32);
    },
  });
  // Waddle Bomb: a toy's wind-up key ("krik-krik-krik") and a little "wee!"
  def('throw_waddle', {
    gain: 0.4, max: 3, jitter: 0.03, reverb: 0.05,
    build(v, p) {
      const bp = v.filter('bandpass', 2400, 3, v.out);
      for (let i = 0; i < 3; i++) v.tone({ t: i * 0.05, type: 'square', f: 1800 * p, f1: 1500 * p, sw: 0.015, a: 0.0005, d: 0.016, peak: 0.5, to: bp });
      v.tone({ t: 0.15, f: 620 * p, f1: 1320 * p, sw: 0.12, a: 0.004, d: 0.12, peak: 0.34 });
      swing(v, 0.08, 500 * p, 1700 * p, 0.2, 0.28);
    },
  });
  // Lurk Mine: a soft thunk into the ink, then three quiet arming pips over its 0.9 s arming time
  def('place_mine', {
    gain: 0.34, max: 2, jitter: 0.02, reverb: 0.03,
    build(v, p) {
      v.tone({ f: 160 * p, f1: 70 * p, sw: 0.06, a: 0.001, d: 0.1, peak: 0.6 });
      v.nz({ kind: 'pink', ft: 'lowpass', f: 1200, a: 0.001, d: 0.06, peak: 0.4 });
      plips(v, 0.02, 2, 0.05, [600, 900], 0.12, p);
      [[0.3, 880], [0.58, 1175], [0.86, 1568]].forEach(([t, f]) => v.tone({ t, f: f * p, a: 0.002, h: 0.03, d: 0.05, peak: 0.16 }));
    },
  });
  // Hop Beacon: planted with a clunk, then a power-up chime
  def('place_beacon', {
    gain: 0.36, max: 2, jitter: 0.02, reverb: 0.16,
    build(v, p) {
      clank(v, 0, 520, 0.38, 0.2, p);
      v.tone({ f: 120 * p, f1: 60 * p, sw: 0.06, a: 0.001, d: 0.1, peak: 0.6 });
      v.tone({ t: 0.08, type: 'triangle', f: 440 * p, f1: 880 * p, sw: 0.3, a: 0.05, d: 0.3, peak: 0.2 });
      bell(v, v.t + 0.34, 1760 * p, 0.2, { d: 0.5 });
    },
  });

  /* ================================================================================================ landing / arming */
  // Cling Charge sticks: a suction "thwuck" and a magnetic clamp ring
  def('sticky_stick', {
    gain: 0.48, max: 3, jitter: 0.04, reverb: 0.05,
    build(v, p) {
      v.tone({ f: 300 * p, f1: 115 * p, sw: 0.05, a: 0.001, d: 0.08, peak: 0.7 });
      v.nz({ f: 950 * p, f1: 380 * p, sw: 0.07, q: 6, a: 0.001, d: 0.08, peak: 0.62 });                  // thwuck
      v.tone({ t: 0.01, f: 1240 * p, a: 0.001, d: 0.18, peak: 0.14 });                                   // clamp ring
      v.tone({ t: 0.01, f: 1860 * p, a: 0.001, d: 0.11, peak: 0.07 });
      v.nz({ ft: 'highpass', f: 3500, a: 0.0004, d: 0.012, peak: 0.3 });
    },
  });
  // Skitter Bomb touches down: a clatter of little legs and the motor revving up
  def('seeker_land', {
    gain: 0.45, max: 3, jitter: 0.04, reverb: 0.05,
    build(v, p) {
      [[0, 1500], [0.025, 1750], [0.05, 1350]].forEach(([t, f]) => clank(v, t, f, 0.22, 0.06, p, 3));
      const T = v.t + 0.04, g = v.gain(0, v.out), bp = v.filter('bandpass', 1200, 4, g);
      const o = v.osc('sawtooth', 220 * p, T, T + 0.32, bp);
      sweep(o.frequency, T, 220 * p, 760 * p, 0.28);
      pts(g.gain, T, [[0, 0], [0.05, 0.22], [0.25, 0.18], [0.32, 0]]);
    },
  });
  // Shaker Bomb lands: a can "clonk" and a burst of fizz — its first blast is half a second away
  def('shaker_land', {
    gain: 0.46, max: 3, jitter: 0.04, reverb: 0.08,
    build(v, p) {
      clank(v, 0, 900, 0.34, 0.2, p);
      v.tone({ f: 210 * p, f1: 110 * p, sw: 0.05, a: 0.001, d: 0.07, peak: 0.5 });
      v.nz({ t: 0.02, ft: 'highpass', f: 4500, a: 0.01, d: 0.3, peak: 0.24 });                          // fizz
      for (let i = 0; i < 6; i++) v.bub(v.t + 0.03 + v.r(0, 0.25), v.r(1800, 3400) * p, 0.08, v.r(0.01, 0.02), 1.9);
    },
  });
  // Drip Curtain unrolls: a sheet of ink whooshing down onto the deck
  def('curtain_up', {
    gain: 0.5, max: 3, jitter: 0.04, reverb: 0.12,
    build(v, p) {
      whoosh(v, 0, 0.36, 4200 * p, 1600 * p, 700 * p, 0.45, { q: 1.2, kind: 'white', env: [[0, 0], [0.2, 1], [0.7, 0.7], [1, 0]] });
      bigSplat(v, 0.2, p * 0.9, 0.5);
      const g = v.gain(0, v.out); pts(g.gain, v.t + 0.15, [[0, 0], [0.1, 0.5], [0.6, 0]]);
      v.buffer(texture(v.ctx, 'rain'), v.t + 0.15, v.t + 0.78, v.filter('highpass', 1200, 0.7, g));
    },
  });
  // Twirl Sprinkler clamps on and spins up
  def('sprinkler_stick', {
    gain: 0.42, max: 3, jitter: 0.04, reverb: 0.06,
    build(v, p) {
      clank(v, 0, 1300, 0.3, 0.12, p, 3);
      const T = v.t + 0.03, g = v.gain(0, v.out), am = v.gain(0.6, g);
      const o = v.osc('triangle', 150 * p, T, T + 0.42, am);
      sweep(o.frequency, T, 150 * p, 420 * p, 0.36);
      const l = v.lfo(20, 0.4, am.gain, T, T + 0.42); sweep(l.osc.frequency, T, 20, 42, 0.36);
      pts(g.gain, T, [[0, 0], [0.05, 0.3], [0.3, 0.25], [0.42, 0]]);
    },
  });
  // Lurk Mine tripped: a sharp click and a rising alarm, its 0.45 s windup before it goes (sub-tweaks: was 0.35 s)
  def('mine_trip', {
    gain: 0.4, max: 3, jitter: 0, reverb: 0.05,
    build(v, p) {
      v.nz({ ft: 'highpass', f: 2800, a: 0.0003, d: 0.015, peak: 0.9 });
      v.tone({ f: 420 * p, f1: 180 * p, sw: 0.02, a: 0.0005, d: 0.03, peak: 0.5 });
      const T = v.t + 0.02, g = v.gain(0, v.out), bp = v.filter('bandpass', 1400, 2, g);
      const o = v.osc('square', 900 * p, T, T + 0.46, bp);
      sweep(o.frequency, T, 900 * p, 2400 * p, 0.42); sweep(bp.frequency, T, 1200 * p, 3000 * p, 0.42);
      pts(g.gain, T, [[0, 0], [0.02, 0.22], [0.39, 0.35], [0.43, 0]]);
      const s = v.gain(0, v.out), am = v.gain(0.5, s);
      const o2 = v.osc('sine', 1800 * p, T, T + 0.46, am); sweep(o2.frequency, T, 1800 * p, 3600 * p, 0.42);
      const l = v.lfo(14, 0.5, am.gain, T, T + 0.46, 'square'); sweep(l.osc.frequency, T, 14, 26, 0.42);
      pts(s.gain, T, [[0, 0], [0.02, 0.18], [0.42, 0.26], [0.44, 0]]);
    },
  });
  // Skitter Bomb winding up (0.45 s, then it bursts): its wind-up key cranking — ratchet clicks speeding up — under a
  // motor whine climbing an octave and a half, a hard "clack" as it locks
  def('seeker_prime', {
    gain: 0.42, max: 3, jitter: 0, reverb: 0.05,
    build(v, p) {
      v.nz({ ft: 'highpass', f: 3200, a: 0.0003, d: 0.014, peak: 0.85 });
      v.tone({ f: 520 * p, f1: 240 * p, sw: 0.02, a: 0.0005, d: 0.03, peak: 0.45 });
      let t = 0.03;
      for (let i = 0; i < 11 && t < 0.42; i++) {   // ratchet: 11 clicks, closer and higher
        v.nz({ t, f: (2400 + i * 260) * p, q: 6, a: 0.0004, d: 0.011, peak: 0.55 + 0.03 * i });
        v.tone({ t, f: (380 + i * 30) * p, f1: 260 * p, sw: 0.01, a: 0.0005, d: 0.012, peak: 0.16 });
        t += Math.max(0.022, 0.06 - i * 0.0045);
      }
      const T = v.t + 0.02, g = v.gain(0, v.out), bp = v.filter('bandpass', 900, 3.5, g);
      const o = v.osc('sawtooth', 300 * p, T, T + 0.46, bp);
      sweep(o.frequency, T, 300 * p, 860 * p, 0.42); sweep(bp.frequency, T, 800 * p, 2600 * p, 0.42);
      pts(g.gain, T, [[0, 0], [0.04, 0.14], [0.4, 0.3], [0.44, 0]]);
      v.nz({ t: 0.41, ft: 'highpass', f: 1800, a: 0.0004, d: 0.025, peak: 0.7 });
      v.tone({ t: 0.41, f: 300 * p, f1: 150 * p, sw: 0.03, a: 0.0005, d: 0.04, peak: 0.4 });
    },
  });
  // Waddle Bomb winding up (0.45 s): a toy alarm — a two-tone "bip-bip-bip" racing faster and climbing, a springy
  // wobble under it, a squeak as it puffs up
  def('waddle_prime', {
    gain: 0.36, max: 3, jitter: 0, reverb: 0.05,
    build(v, p) {
      v.tone({ f: 660 * p, f1: 1320 * p, sw: 0.06, a: 0.002, d: 0.07, peak: 0.4 });           // the squeak
      let t = 0.05;
      for (let i = 0; i < 9 && t < 0.43; i++) {
        const f = (i % 2 ? 1760 : 1480) * p * (1 + i * 0.035);
        v.tone({ t, type: 'square', f, a: 0.002, h: 0.012, d: 0.018, peak: 0.16, to: v.filter('lowpass', 4600, 0.8, v.out) });
        v.tone({ t, f, a: 0.002, h: 0.01, d: 0.02, peak: 0.24 });
        t += Math.max(0.03, 0.07 - i * 0.006);
      }
      const T = v.t + 0.02, g = v.gain(0, v.out), am = v.gain(0.5, g), lp = v.filter('lowpass', 900, 1.2, am);
      const o = v.osc('triangle', 180 * p, T, T + 0.45, lp); sweep(o.frequency, T, 180 * p, 360 * p, 0.42);
      const l = v.lfo(9, 0.5, am.gain, T, T + 0.45); sweep(l.osc.frequency, T, 9, 22, 0.42);
      pts(g.gain, T, [[0, 0], [0.04, 0.18], [0.4, 0.26], [0.44, 0]]);
    },
  });
  // the Waddle's lamp while it senses (a toy "bip", higher and rounder than the Splat Bomb's)
  def('waddle_beep', {
    gain: 0.2, max: 3, jitter: 0, reverb: 0.04, minGap: 0.05,
    build(v, p) {
      v.tone({ type: 'square', f: 1976 * p, a: 0.002, h: 0.03, d: 0.03, peak: 0.2, to: v.filter('lowpass', 4600, 0.8, v.out) });
      v.tone({ f: 988 * p, f1: 1318 * p, sw: 0.04, a: 0.002, h: 0.02, d: 0.04, peak: 0.3 });
    },
  });
  // the Boomerang caught a foe: a spinning metal "tink" per tick until the Splat-Bomb blast
  def('boomerang_tick', {
    gain: 0.3, max: 3, jitter: 0, reverb: 0.05, minGap: 0.04,
    build(v, p) {
      v.tone({ type: 'triangle', f: 2600 * p, a: 0.0005, d: 0.05, peak: 0.45 });
      v.tone({ f: 3900 * p, a: 0.0005, d: 0.03, peak: 0.16 });
      v.nz({ ft: 'highpass', f: 5000, a: 0.0003, d: 0.008, peak: 0.25 });
    },
  });

  /* ================================================================================================ warnings (loops) */
  // Splat Bomb fuse (0.95 s): bright "bip"s from 4 to 18 a second, climbing, a rising whine at the very end, and a
  // plastic rattle while it's still rolling. params { k: 0..1 through the fuse, roll: 0..1 speed, foe }
  def('fuse_bomb', {
    gain: 0.18, max: 8, jitter: 0, reverb: 0.05, oneShot: 1.0,
    loop(v, p, o) {
      const T = v.t, st = { k: 0, roll: 0, foe: 1, q: p, ...(o?.params || {}) };
      const tk = v.gain(0, v.out);
      const lp = v.filter('lowpass', 4200, 0.8, tk);
      const s1 = v.osc('sine', 1480 * p, T, null, tk);
      const sq = v.gain(0.3, lp), s2 = v.osc('square', 1480 * p, T, null, sq);
      const g = gate(v, T, 4, 0.8, 0.9, tk.gain);
      const wg = v.gain(0, v.out), w = v.osc('sine', 2960 * p, T, null, wg);                               // the last-moment whine
      const rg = v.gain(0, v.out), rbp = v.filter('bandpass', 700, 2.2, rg);                              // rolling rattle
      v.noise('pink', T, null, rbp);
      const rl = v.lfo(11, 0.5, rg.gain, T, null, 'square');
      const apply = (now) => {
        const k = clamp01(st.k), f = 1480 * st.q * (1 + 0.35 * k);
        s1.frequency.setTargetAtTime(f, now, K); s2.frequency.setTargetAtTime(f, now, K);
        g.osc.frequency.setTargetAtTime(4 + 14 * Math.pow(k, 1.6), now, K);
        sq.gain.setTargetAtTime(st.foe ? 0.3 : 0.0, now, K); lp.frequency.setTargetAtTime(st.foe ? 4200 : 2000, now, K);
        w.frequency.setTargetAtTime(f * 2, now, K); wg.gain.setTargetAtTime(0.12 * Math.pow(Math.max(0, k - 0.55) / 0.45, 2) * (st.foe ? 1 : 0.5), now, K);
        const r = clamp01(st.roll); rg.gain.setTargetAtTime(0.22 * r, now, K); rl.depth.gain.setTargetAtTime(0.2 * r, now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });
  // Cling Charge fuse (2.4 s): a deep two-note "bwom" pulse, 1.6 → 10 a second, climbing a fifth; foe: a tritone
  // (sour, alarming), ally: a fifth. params { k, foe }
  def('fuse_sticky', {
    gain: 0.2, max: 6, jitter: 0, reverb: 0.06, oneShot: 1.2,
    loop(v, p, o) {
      const T = v.t, st = { k: 0, foe: 1, q: p, ...(o?.params || {}) };
      const pg = v.gain(0, v.out), lp = v.filter('lowpass', 1100, 1.2, pg);
      const o1 = v.osc('triangle', 330 * p, T, null, lp);
      const ig = v.gain(0.55, lp), o2 = v.osc('triangle', 330 * 1.414 * p, T, null, ig);
      const sub = v.osc('sine', 165 * p, T, null, v.gain(0.5, pg));
      const g = gate(v, T, 1.6, 0.45, 0.8, pg.gain);
      const zg = v.gain(0.04, v.out);                                                                     // the sticky sizzle
      v.buffer(texture(v.ctx, 'sizzle'), T, null, v.filter('bandpass', 2500, 0.8, zg));
      const apply = (now) => {
        const k = clamp01(st.k), f = 330 * st.q * Math.pow(1.5, k);
        o1.frequency.setTargetAtTime(f, now, K); o2.frequency.setTargetAtTime(f * (st.foe ? 1.414 : 1.5), now, K); sub.frequency.setTargetAtTime(f / 2, now, K);
        g.osc.frequency.setTargetAtTime(1.6 + 8.4 * Math.pow(k, 1.5), now, K);
        lp.frequency.setTargetAtTime((st.foe ? 1400 : 800) * (1 + k), now, K);
        zg.gain.setTargetAtTime(0.03 + 0.09 * k, now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2x, now) { Object.assign(st, o2x); apply(now); } };
    },
  });
  // a Waddle Bomb that's hunting YOU: a toy siren ("nee-naw"), faster and louder as it closes. params { close: 0..1 }
  def('hunt_alarm', {
    gain: 0.07, max: 3, jitter: 0, reverb: 0.04, oneShot: 1.2,
    loop(v, p, o) {
      const T = v.t, st = { close: 0, q: p, ...(o?.params || {}) };
      const amp = v.gain(0.3, v.out), lp = v.filter('lowpass', 2600, 0.8, amp);
      const s = v.osc('square', 1100 * p, T, null, lp);
      const sw = v.gain(160 * p), swo = v.osc('square', 2, T, null, sw); sw.connect(s.frequency);         // the two-tone swap
      const apply = (now) => {
        const c = clamp01(st.close);
        s.frequency.setTargetAtTime(1100 * st.q, now, K); sw.gain.setTargetAtTime(160 * st.q, now, K);
        swo.frequency.setTargetAtTime(2 + 4 * c, now, K); amp.gain.setTargetAtTime(0.3 + 0.7 * c, now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });
  // a Tide Torpedo locked on YOU: missile-lock pips, 4 → 18 a second as it closes. params { k: 0..1 }
  def('lock_tone', {
    gain: 0.18, max: 3, jitter: 0, reverb: 0.03, oneShot: 1.2,
    loop(v, p, o) {
      const T = v.t, st = { k: 0, q: p, ...(o?.params || {}) };
      const pg = v.gain(0, v.out);
      const s1 = v.osc('sine', 1760 * p, T, null, pg);
      const sq = v.gain(0.25, v.filter('lowpass', 5000, 0.7, pg)), s2 = v.osc('square', 1760 * p, T, null, sq);
      const g = gate(v, T, 4, 0.75, 0.9, pg.gain);
      const apply = (now) => {
        const k = clamp01(st.k), f = 1760 * st.q * (1 + 0.12 * k);
        s1.frequency.setTargetAtTime(f, now, K); s2.frequency.setTargetAtTime(f, now, K);
        g.osc.frequency.setTargetAtTime(4 + 14 * k, now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });

  /* ================================================================================================ sub loops */
  // Skitter Bomb scuttling: fast clicky feet, a servo whine, a low motor buzz; dash (committed, straight at a foe):
  // faster and higher; hunt (it's after YOU): a beeping on top. params { speed: 0..1, dash: 0|1, hunt: 0|1 }
  def('seeker_run', {
    gain: 0.55, max: 6, jitter: 0, reverb: 0.04, oneShot: 1.2,
    loop(v, p, o) {
      const T = v.t, st = { speed: 1, dash: 0, hunt: 0, q: p, ...(o?.params || {}) };
      const ft = v.gain(0.02, v.out), fbp = v.filter('bandpass', 3200, 3, ft);
      v.noise('white', T, null, fbp);
      const g1 = gate(v, T, 18, 0.7, 0.5, ft.gain), g2 = gate(v, T, 18, 0.7, 0.35, ft.gain, 0.5);
      const wh = v.gain(0.1, v.out), wbp = v.filter('bandpass', 1400, 4, wh);
      const so = v.osc('sawtooth', 440 * p, T, null, wbp);
      const mb = v.gain(0.07, v.filter('lowpass', 400, 1, v.out)), mo = v.osc('square', 90 * p, T, null, mb);
      const hg = v.gain(0, v.out), hs = v.osc('sine', 2093 * p, T, null, hg);
      const hgate = gate(v, T, 5, 0.8, 0, hg.gain);
      const apply = (now) => {
        const s = clamp01(st.speed), d = st.dash ? 1 : 0, q = st.q;
        const rate = (10 + 10 * s) * (1 + 0.35 * d) * q;
        g1.osc.frequency.setTargetAtTime(rate, now, K); g2.osc.frequency.setTargetAtTime(rate, now, K);
        so.frequency.setTargetAtTime(440 * q * (1 + 0.4 * d), now, K); wbp.frequency.setTargetAtTime(1400 * q * (1 + 0.3 * d), now, K);
        wh.gain.setTargetAtTime((0.06 + 0.06 * s) * (1 + 0.5 * d), now, K);
        mo.frequency.setTargetAtTime(90 * q, now, K);
        hs.frequency.setTargetAtTime(2093 * q, now, K); hgate.depth.gain.setTargetAtTime(st.hunt ? 0.35 : 0, now, K);
        hgate.osc.frequency.setTargetAtTime(5 + 5 * d, now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });
  // Shaker Bomb: the can rattling in flight and between blasts, faster and fizzier as the next blast comes (k: 0..1
  // through the wait), and a pressure whine once it's armed. params { k, armed: 0|1, foe }
  def('shaker_rattle', {
    gain: 0.5, max: 6, jitter: 0, reverb: 0.05, oneShot: 1.0,
    loop(v, p, o) {
      const T = v.t, st = { k: 0, armed: 0, foe: 1, q: p, ...(o?.params || {}) };
      const rg = v.gain(0.03, v.out), rbp = v.filter('bandpass', 2800, 1.5, rg);
      v.noise('white', T, null, rbp);
      const g1 = gate(v, T, 9, 0.4, 0.45, rg.gain), g2 = gate(v, T, 11.7, 0.5, 0.3, rg.gain);
      const fz = v.gain(0.12, v.out), fbp = v.filter('bandpass', 3000, 0.9, fz);
      const tex = v.buffer(texture(v.ctx, 'bubbles_bright'), T, null, fbp, p);
      const wg = v.gain(0, v.out), w = v.osc('sine', 900 * p, T, null, wg);
      const apply = (now) => {
        const k = clamp01(st.k), q = st.q, a = st.armed ? 1 : 0;
        g1.osc.frequency.setTargetAtTime((9 + 20 * k * a) * q, now, K); g2.osc.frequency.setTargetAtTime((11.7 + 22 * k * a) * q, now, K);
        rbp.frequency.setTargetAtTime(2800 * q, now, K); tex.playbackRate.setTargetAtTime(q * (1 + 0.5 * k), now, K);
        fz.gain.setTargetAtTime(0.1 + 0.3 * k * a, now, K);
        w.frequency.setTargetAtTime(q * (900 + 1100 * k), now, K); wg.gain.setTargetAtTime(a * 0.09 * k * (st.foe ? 1 : 0.5), now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });
  // Drip Curtain standing: a sheet of falling ink and its drips, thinner as it fades. params { life: 0..1 }
  def('curtain_drip', {
    gain: 0.16, max: 4, jitter: 0, reverb: 0.08, oneShot: 1.5,
    loop(v, p, o) {
      const T = v.t, st = { life: 1, ...(o?.params || {}) };
      const sh = v.gain(0.35, v.out); v.noise('pink', T, null, v.filter('bandpass', 2400 * p, 0.6, sh));
      v.lfo(0.37, 0.05, sh.gain, T, null);
      const dr = v.gain(0.45, v.out); const tex = v.buffer(texture(v.ctx, 'rain'), T, null, v.filter('highpass', 1500, 0.7, dr), 0.7 * p);
      v.noise('brown', T, null, v.filter('lowpass', 250, 1, v.gain(0.14, v.out)));
      return {
        pitch(q, now) { tex.playbackRate.setTargetAtTime(0.7 * q, now, K); },
        params(o2, now) { Object.assign(st, o2); const l = clamp01(st.life); sh.gain.setTargetAtTime(0.12 + 0.3 * l, now, K); dr.gain.setTargetAtTime(0.2 + 0.3 * l, now, K); },
      };
    },
  });
  // Twirl Sprinkler: a whirring rotor and the spray pulses ("tsh … tsh"); half speed once it tires. params { fast: 0|1 }
  def('sprinkler_spin', {
    gain: 0.26, max: 4, jitter: 0, reverb: 0.05, oneShot: 1.5,
    loop(v, p, o) {
      const T = v.t, st = { fast: 1, q: p, ...(o?.params || {}) };
      const rg = v.gain(0.12, v.out), ro = v.osc('triangle', 260 * p, T, null, v.filter('lowpass', 900, 1, rg));
      const rl = v.lfo(9, 0.08, rg.gain, T, null);
      const sp = v.gain(0.02, v.out); v.noise('white', T, null, v.filter('bandpass', 4200, 1, sp));
      const g = gate(v, T, 3.33, 0.3, 0.5, sp.gain);
      const apply = (now) => {
        const f = st.fast ? 1 : 0.5, q = st.q;
        ro.frequency.setTargetAtTime(260 * f * q, now, K); rl.osc.frequency.setTargetAtTime(9 * f, now, K); g.osc.frequency.setTargetAtTime(3.33 * f, now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });
  // Murk Bomb cloud: murky bubbling, a hiss and (the enemy's) a low beating drone. params { life, foe }
  def('mist_hiss', {
    gain: 0.3, max: 4, jitter: 0, reverb: 0.1, oneShot: 1.5,
    loop(v, p, o) {
      const T = v.t, st = { life: 1, foe: 1, ...(o?.params || {}) };
      const bg = v.gain(0.5, v.out); const tex = v.buffer(texture(v.ctx, 'bubbles'), T, null, v.filter('lowpass', 900, 0.8, bg), 0.55 * p);
      const hs = v.gain(0.12, v.out); v.noise('pink', T, null, v.filter('bandpass', 1800, 0.7, hs)); v.lfo(0.4, 0.05, hs.gain, T, null);
      const dg = v.gain(0.1, v.filter('lowpass', 320, 1, v.out));
      v.osc('sawtooth', 73 * p, T, null, dg); v.osc('sawtooth', 77.5 * p, T, null, dg);
      return {
        pitch(q, now) { tex.playbackRate.setTargetAtTime(0.55 * q, now, K); },
        params(o2, now) { Object.assign(st, o2); const l = clamp01(st.life); bg.gain.setTargetAtTime(0.5 * l, now, K); hs.gain.setTargetAtTime(0.12 * l, now, K); dg.gain.setTargetAtTime((st.foe ? 0.1 : 0.04) * l, now, K); },
      };
    },
  });
  // Hop Beacon: a soft "boop" every 1.2 s over a faint hum (you can find one with your ears)
  def('beacon_hum', {
    gain: 0.1, max: 4, jitter: 0, reverb: 0.1, oneShot: 2.4,
    loop(v, p) {
      const T = v.t, bg = v.gain(0, v.out);
      v.osc('sine', 660 * p, T, null, bg); v.osc('sine', 990 * p, T, null, v.gain(0.4, bg));
      gate(v, T, 0.83, 0.82, 0.7, bg.gain);
      v.osc('triangle', 110 * p, T, null, v.gain(0.08, v.out));
      return { pitch() {} };
    },
  });

  /* ================================================================================================ sub blasts / ends */
  // Cling Charge: a wide, deep blast with a long rumble and a sticky "splorch"
  def('sticky_explode', {
    gain: 0.58, max: 3, jitter: 0.04, reverb: 0.32,
    build(v, p) {
      inkBoom(v, 0, p * 0.88, 1, { f: 72, f1: 22, len: 1.3, bright: 4600, bloops: 9, plips: 6 });
      v.nz({ t: 0.03, f: 720 * p, f1: 240 * p, sw: 0.4, q: 5, a: 0.004, d: 0.4, peak: 0.5 });               // splorch
      v.tone({ t: 0.02, f: 46 * p, f1: 32 * p, sw: 0.6, a: 0.01, d: 0.7, peak: 0.55 });                     // long rumble
    },
  });
  // Pop Pellet: a bright snappy "POK" and a spray — small, quick, nothing like a bomb
  def('pellet_pop', {
    gain: 0.62, max: 4, jitter: 0.06, reverb: 0.1, minGap: 0.03,
    build(v, p) {
      v.nz({ ft: 'highpass', f: 3000, a: 0.0003, d: 0.02, peak: 0.85 });
      v.tone({ f: 1150 * p, f1: 240 * p, sw: 0.05, a: 0.0006, d: 0.07, peak: 0.9 });                         // pok
      v.tone({ f: 170 * p, f1: 62 * p, sw: 0.07, a: 0.001, d: 0.1, peak: 0.6 });
      v.nz({ t: 0.004, f: 2300 * p, f1: 700 * p, sw: 0.12, q: 2, a: 0.001, d: 0.14, peak: 0.6 });           // spray
      plips(v, 0.03, 4, 0.12, [900, 1800], 0.14, p);
    },
  });
  // Skitter Bomb: a mechanical crunch (parts flying) into a mid-size blast
  def('seeker_explode', {
    gain: 0.56, max: 3, jitter: 0.05, reverb: 0.26,
    build(v, p) {
      clank(v, 0, 1700, 0.75, 0.2, p, 4); clank(v, 0.018, 2350, 0.6, 0.16, p, 4); clank(v, 0.05, 1230, 0.45, 0.3, p, 3);   // its shell bursting
      for (let i = 0; i < 12; i++) v.nz({ t: 0.03 + v.r(0, 0.45), f: v.r(1800, 4600), q: 7, a: 0.0005, d: v.r(0.01, 0.03), peak: v.r(0.25, 0.5) });   // parts clattering down
      const T = v.t, g = v.gain(0, v.out), bp = v.filter('bandpass', 1400, 4, g);                                   // its motor dying
      const o = v.osc('sawtooth', 760 * p, T, T + 0.3, bp); sweep(o.frequency, T, 760 * p, 120 * p, 0.28); pts(g.gain, T, [[0, 0], [0.01, 0.2], [0.28, 0]]);
      inkBoom(v, 0.01, p * 1.1, 0.7, { f: 105, f1: 34, len: 0.7, bright: 5200, bloops: 4, plips: 3 });
    },
  });
  // Echo Orb: a sonar "vwoom" rolling out and a ping (no blast: it only marks)
  def('scan_burst', {
    gain: 0.42, max: 3, jitter: 0.02, reverb: 0.35,
    build(v, p) {
      const T = v.t;
      v.tone({ f: 300 * p, f1: 90 * p, sw: 0.5, a: 0.004, d: 0.6, peak: 0.5 });
      whoosh(v, 0, 0.7, 3000 * p, 1400 * p, 500 * p, 0.3, { q: 2, env: [[0, 0], [0.1, 1], [1, 0]] });
      bell(v, T + 0.02, 1568 * p, 0.3, { d: 0.9, ratio: 2.01, index: 0.8 });
      bell(v, T + 0.3, 1568 * p, 0.1, { d: 0.6, ratio: 2.01, index: 0.6 });
    },
  });
  // Murk Bomb bursts: a gassy "pfoomph" and a hiss that lingers into the cloud
  def('mist_burst', {
    gain: 0.5, max: 3, jitter: 0.04, reverb: 0.16,
    build(v, p) {
      v.nz({ kind: 'pink', ft: 'lowpass', f: 1300, f1: 220, sw: 0.4, q: 0.9, a: 0.01, d: 0.5, peak: 0.9 });
      v.tone({ f: 110 * p, f1: 52 * p, sw: 0.3, a: 0.004, d: 0.32, peak: 0.6 });
      v.nz({ t: 0.05, ft: 'highpass', f: 3000, a: 0.06, d: 0.6, peak: 0.2 });
      bloops(v, 0.06, 4, 0.3, [160, 320], 0.3, p);
    },
  });
  // Lurk Mine: a tight, dry snap and an electric zap ("you're marked") over a small splash
  def('mine_explode', {
    gain: 0.55, max: 3, jitter: 0.04, reverb: 0.2,
    build(v, p) {
      const T = v.t;
      v.nz({ ft: 'highpass', f: 2000, a: 0.0003, d: 0.03, peak: 1 });
      v.tone({ f: 420 * p, f1: 90 * p, sw: 0.08, a: 0.0006, d: 0.12, peak: 0.9 });
      const g = v.gain(0, v.out), bp = v.filter('bandpass', 2600, 2.5, g);
      const o = v.osc('sawtooth', 2400 * p, T, T + 0.2, bp); sweep(o.frequency, T, 2400 * p, 300 * p, 0.16);
      pts(g.gain, T, [[0, 0], [0.004, 0.5], [0.18, 0]]);
      bigSplat(v, 0.01, p * 1.1, 0.6);
      const bz = v.gain(0, v.filter('lowpass', 1500, 1, v.out)), bo = v.osc('square', 110 * p, T + 0.08, T + 0.4, bz);
      v.lfo(30, 0.5, bz.gain, T + 0.08, T + 0.4); pts(bz.gain, T + 0.08, [[0, 0], [0.02, 0.1], [0.3, 0]]); void bo;
    },
  });
  // Shaker Bomb blast: a soda-can "pssh-BANG" with fizz — each blast of the three a step higher (pitch 1.06, 1.12 …)
  def('shaker_blast', {
    gain: 0.54, max: 4, jitter: 0.03, reverb: 0.22,
    build(v, p) {
      v.nz({ f: 3000 * p, f1: 1200 * p, sw: 0.15, q: 1.2, a: 0.002, d: 0.18, peak: 0.6 });                   // pssh
      inkBoom(v, 0.02, p * 1.1, 0.8, { f: 110, f1: 34, len: 0.6, bright: 5000, bloops: 4, plips: 3 });
      v.tone({ f: 2400 * p, a: 0.0006, d: 0.12, peak: 0.12 });                                               // can clink
      for (let i = 0; i < 10; i++) v.bub(v.t + 0.05 + v.r(0, 0.4), v.r(1500, 3200) * p, 0.1, v.r(0.01, 0.02), v.r(1.6, 2.2));
    },
  });
  // Waddle Bomb: a toy spring "boing" and the blast
  def('waddle_explode', {
    gain: 0.58, max: 3, jitter: 0.04, reverb: 0.26,
    build(v, p) {
      const T = v.t, g = v.gain(0, v.out), end = perc(g.gain, T, 0.004, 0.9, 0.42);
      const o = v.osc('sine', 170 * p, T, end + 0.01, g); sweep(o.frequency, T, 170 * p, 560 * p, 0.3);
      const o2 = v.osc('triangle', 340 * p, T, end + 0.01, v.gain(0.35, g)); sweep(o2.frequency, T, 340 * p, 1120 * p, 0.3);
      const w = v.lfo(17, 0, o.detune, T, end); w.depth.connect(o2.detune); pts(w.depth.gain, T, [[0, 260], [0.4, 0]]);   // the spring
      v.nz({ ft: 'highpass', f: 3800, a: 0.0004, d: 0.012, peak: 0.4 });                                           // its lid popping
      inkBoom(v, 0.05, p * 1.05, 0.85, { f: 96, f1: 30, len: 0.75, bright: 5400, bloops: 5 });
    },
  });
  // Waddle Bomb popped by fire: a squeaky toy deflating (harmless)
  def('waddle_pop', {
    gain: 0.42, max: 3, jitter: 0.05, reverb: 0.08,
    build(v, p) {
      const T = v.t, g = v.gain(0, v.out), end = pts(g.gain, T, [[0, 0], [0.02, 0.35], [0.25, 0.2], [0.34, 0]]);
      const o = v.osc('sine', 1400 * p, T, end + 0.01, g); sweep(o.frequency, T, 1400 * p, 480 * p, 0.32);
      v.lfo(25, 60, o.detune, T, end);
      v.nz({ f: 2500 * p, f1: 800 * p, sw: 0.3, q: 3, a: 0.002, d: 0.3, peak: 0.35 });
      v.tone({ f: 170 * p, f1: 65 * p, sw: 0.06, a: 0.001, d: 0.08, peak: 0.6 });
    },
  });
  // Tide Torpedo burst: a bright wet crack with a thump under it and droplets pattering down (pitch < 1 = the locked,
  // full burst)
  def('torpedo_burst', {
    gain: 0.56, max: 4, jitter: 0.04, reverb: 0.22,
    build(v, p) {
      v.nz({ ft: 'highpass', f: 2500, a: 0.0003, d: 0.03, peak: 1 });
      v.tone({ f: 260 * p, f1: 62 * p, sw: 0.14, a: 0.001, d: 0.24, peak: 0.95 });
      v.nz({ kind: 'pink', ft: 'lowpass', f: 3200, f1: 220, sw: 0.3, q: 1, a: 0.002, d: 0.34, peak: 0.7 });
      v.nz({ t: 0.01, f: 1900 * p, f1: 500 * p, sw: 0.25, q: 4, a: 0.002, d: 0.28, peak: 0.6 });
      for (let i = 0; i < 8; i++) v.bub(v.t + 0.08 + v.r(0, 0.4), v.r(700, 1700) * p, 0.15, v.r(0.018, 0.032), 1.8);
    },
  });
  // Whirl Boomerang's big blast (it caught a foe): the whirr spinning down into a Splat-Bomb-sized boom
  def('boomerang_blast', {
    gain: 0.58, max: 3, jitter: 0.04, reverb: 0.28,
    build(v, p) {
      const T = v.t, g = v.gain(0, v.out), bp = v.filter('bandpass', 1400, 3, g), am = v.gain(0.6, bp);
      const o = v.osc('sawtooth', 1100 * p, T, T + 0.34, am); sweep(o.frequency, T, 1100 * p, 200 * p, 0.3);
      const l = v.lfo(34, 0.4, am.gain, T, T + 0.34); sweep(l.osc.frequency, T, 34, 8, 0.3);                     // the blades spinning down
      pts(g.gain, T, [[0, 0], [0.01, 0.55], [0.26, 0.3], [0.33, 0]]);
      clank(v, 0.06, 1100, 0.4, 0.3, p);                                                                            // a metal clang
      inkBoom(v, 0.1, p * 0.95, 0.9, { f: 84, f1: 26, len: 0.95, bright: 5000, bloops: 6 });
    },
  });
  // Drip Curtain gone: the sheet draining away (a falling gurgle)
  def('curtain_down', {
    gain: 0.44, max: 3, jitter: 0.04, reverb: 0.14,
    build(v, p) {
      const T = v.t, g = v.gain(0, v.out); pts(g.gain, T, [[0, 0], [0.05, 0.5], [0.45, 0]]);
      v.buffer(texture(v.ctx, 'bubbles'), T, T + 0.5, v.filter('lowpass', 1400, 0.8, g), 0.7 * p);
      v.nz({ f: 1500 * p, f1: 300 * p, sw: 0.5, q: 2, a: 0.01, d: 0.5, peak: 0.4 });
      v.tone({ f: 420 * p, f1: 150 * p, sw: 0.4, a: 0.01, d: 0.4, peak: 0.2 });
    },
  });
  // Twirl Sprinkler shot off: sputters, a clunk, the rotor spinning down
  def('sprinkler_break', {
    gain: 0.44, max: 3, jitter: 0.05, reverb: 0.12,
    build(v, p) {
      let t = 0, a = 0.6;
      for (let i = 0; i < 5; i++) { v.nz({ t, kind: 'pink', ft: 'lowpass', f: 2200 - i * 300, a: 0.004, d: 0.04, peak: a }); t += 0.05 + i * 0.015; a *= 0.75; }
      clank(v, 0.02, 700, 0.35, 0.18, p);
      const T = v.t, g = v.gain(0, v.out), end = pts(g.gain, T, [[0, 0], [0.02, 0.25], [0.4, 0]]);
      const o = v.osc('triangle', 420 * p, T, end + 0.01, g); sweep(o.frequency, T, 420 * p, 80 * p, 0.4);
    },
  });
  // Hop Beacon broken: a power-down and a crack
  def('beacon_break', {
    gain: 0.42, max: 3, jitter: 0.04, reverb: 0.14,
    build(v, p) {
      const T = v.t, g = v.gain(0, v.out), lp = v.filter('lowpass', 2400, 2, g);
      const o = v.osc('sawtooth', 600 * p, T, T + 0.52, lp); sweep(o.frequency, T, 600 * p, 80 * p, 0.5); sweep(lp.frequency, T, 2400, 300, 0.5);
      pts(g.gain, T, [[0, 0], [0.02, 0.3], [0.5, 0]]);
      v.nz({ ft: 'highpass', f: 2600, a: 0.0004, d: 0.04, peak: 0.7 });
      v.tone({ f: 170 * p, f1: 65 * p, sw: 0.06, a: 0.001, d: 0.08, peak: 0.55 });
    },
  });
  // someone super jumped onto a Hop Beacon: a small "ding-dong"
  def('beacon_use', {
    gain: 0.3, max: 2, jitter: 0, reverb: 0.2,
    build(v, p) { bell(v, v.t, 1568 * p, 0.3, { d: 0.5 }); bell(v, v.t + 0.12, 1175 * p, 0.3, { d: 0.6 }); },
  });
  // a device smashed before it went off (Mega Stamp's guard): a crunch and a fizzle
  def('sub_smash', {
    gain: 0.46, max: 3, jitter: 0.06, reverb: 0.1,
    build(v, p) {
      for (let i = 0; i < 4; i++) v.nz({ t: i * 0.02 + v.r(0, 0.01), f: v.r(900, 2400) * p, q: 5, a: 0.0005, d: 0.03, peak: 0.6 });
      v.tone({ f: 300 * p, f1: 100 * p, sw: 0.06, a: 0.001, d: 0.09, peak: 0.6 });
      v.nz({ t: 0.03, f: 2800 * p, f1: 900 * p, sw: 0.3, q: 1.2, a: 0.01, d: 0.3, peak: 0.28 });
    },
  });

  /* ================================================================================================ special starts */
  // Tidal Slam: the leap — a big rush upward and a power swell (the slam_warn loop carries on to the landing)
  def('slam_leap', {
    gain: 0.5, max: 2, jitter: 0.02, reverb: 0.16,
    build(v, p) {
      whoosh(v, 0, 0.5, 250 * p, 1400 * p, 2400 * p, 0.8, { q: 1.3, env: [[0, 0], [0.3, 1], [0.7, 0.5], [1, 0]] });
      v.tone({ f: 130 * p, f1: 55 * p, sw: 0.12, a: 0.002, d: 0.18, peak: 0.8 });                          // push-off
      bloops(v, 0.02, 3, 0.1, [320, 560], 0.25, p);
    },
  });
  // Ink Tempest thrown: a heavy lob with a thunder rumbling inside the ball
  def('storm_throw', {
    gain: 0.5, max: 2, jitter: 0.03, reverb: 0.22,
    build(v, p) {
      swing(v, 0, 250 * p, 1000 * p, 0.3, 0.45);
      v.tone({ f: 90 * p, f1: 50 * p, sw: 0.3, a: 0.01, d: 0.4, peak: 0.5 });
      const g = v.gain(0, v.out); pts(g.gain, v.t, [[0, 0], [0.12, 0.6], [0.6, 0]]);
      v.noise('brown', v.t, v.t + 0.62, v.filter('lowpass', 260, 1, g));
      for (let i = 0; i < 3; i++) v.nz({ t: 0.08 + v.r(0, 0.2), ft: 'highpass', f: 1800, a: 0.001, d: v.r(0.02, 0.05), peak: 0.35 });
    },
  });
  // Bomb Barrage: a bandolier of bombs rattling and a snare fill ("here they come")
  def('barrage_start', {
    gain: 0.42, max: 2, jitter: 0.02, reverb: 0.16,
    build(v, p) {
      for (let i = 0; i < 6; i++) clank(v, i * 0.04, v.r(1900, 2600), 0.2, 0.06, p, 2);
      for (const [t, a] of [[0.26, 0.5], [0.33, 0.6], [0.4, 0.75]]) snare(v, v.t + t, a);
      v.tone({ t: 0.48, f: 150 * p, f1: 50 * p, sw: 0.1, a: 0.002, d: 0.25, peak: 0.8 });
    },
  });
  // Vortex Strike: the targeting computer coming up (the owner's aim loop is strike_aim)
  def('strike_arm', {
    gain: 0.3, max: 2, jitter: 0, reverb: 0.1,
    build(v, p) {
      const lp = v.filter('lowpass', 3200, 0.8, v.out), pw = pulseWave(v.ctx, 0.25);
      [[0, 76], [0.07, 83], [0.14, 88]].forEach(([t, m]) => v.tone({ t, type: pw, f: mtof(m) * p, a: 0.002, h: 0.04, d: 0.05, peak: 0.3, to: lp }));
      whoosh(v, 0, 0.3, 500 * p, 2000 * p, 3200 * p, 0.2, { q: 2, kind: 'white' });
    },
  });
  // Twister Zooka shouldered: a clunk and the wind whirling up inside it
  def('zooka_arm', {
    gain: 0.46, max: 2, jitter: 0.02, reverb: 0.12,
    build(v, p) {
      clank(v, 0, 300, 0.4, 0.2, p);
      v.tone({ f: 120 * p, f1: 60 * p, sw: 0.06, a: 0.001, d: 0.1, peak: 0.6 });
      const T = v.t + 0.05, g = v.gain(0, v.out), am = v.gain(0.5, g), bp = v.filter('bandpass', 400 * p, 2, am);
      sweep(bp.frequency, T, 400 * p, 1600 * p, 0.5);
      const l = v.lfo(6, 0.45, am.gain, T, T + 0.55); sweep(l.osc.frequency, T, 6, 16, 0.5);
      pts(g.gain, T, [[0, 0], [0.3, 0.6], [0.55, 0]]);
      v.noise('pink', T, T + 0.57, bp);
    },
  });
  // Howl Box lifted: an amp powering on (a thunk, a mains hum swelling, a feedback whine)
  def('wail_up', {
    gain: 0.4, max: 2, jitter: 0.02, reverb: 0.12,
    build(v, p) {
      const T = v.t;
      v.tone({ f: 90 * p, f1: 48 * p, sw: 0.08, a: 0.001, d: 0.14, peak: 0.8 });
      v.nz({ ft: 'highpass', f: 2500, a: 0.0003, d: 0.02, peak: 0.5 });
      const g = v.gain(0, v.out); pts(g.gain, T, [[0, 0], [0.3, 0.4], [0.6, 0]]);
      v.osc('sawtooth', 60 * p, T, T + 0.62, v.filter('lowpass', 420, 1, g));
      const w = v.gain(0, v.out); pts(w.gain, T + 0.1, [[0, 0], [0.35, 0.08], [0.5, 0]]);
      const wo = v.osc('sine', 1800 * p, T + 0.1, T + 0.62, w); sweep(wo.frequency, T + 0.1, 1800 * p, 2400 * p, 0.5);
    },
  });
  // Bubble Blower out: a soapy "blup" and the wand swirling
  def('blower_start', {
    gain: 0.42, max: 2, jitter: 0.03, reverb: 0.14,
    build(v, p) {
      v.tone({ f: 200 * p, f1: 520 * p, sw: 0.1, a: 0.003, d: 0.12, peak: 0.6 });
      const T = v.t, g = v.gain(0, v.out); pts(g.gain, T, [[0, 0], [0.05, 0.4], [0.5, 0]]);
      v.buffer(texture(v.ctx, 'bubbles_bright'), T, T + 0.52, v.filter('bandpass', 2400, 0.9, g), p);
      const w = v.gain(0, v.out); pts(w.gain, T, [[0, 0], [0.1, 0.15], [0.5, 0]]);
      const o = v.osc('triangle', 600 * p, T, T + 0.52, w); v.lfo(7, 40, o.detune, T, T + 0.52);
    },
  });
  // Ink Jet: the burner igniting ("fwoom") and the thrust rising (the jet_loop takes over)
  def('jet_ignite', {
    gain: 0.5, max: 2, jitter: 0.02, reverb: 0.1,
    build(v, p) {
      v.nz({ ft: 'highpass', f: 3000, a: 0.0003, d: 0.02, peak: 0.6 });                                     // spark
      v.nz({ t: 0.01, kind: 'pink', ft: 'lowpass', f: 300, f1: 2400, sw: 0.3, q: 0.9, a: 0.02, d: 0.5, peak: 0.9 });
      v.tone({ t: 0.01, f: 60 * p, f1: 120 * p, sw: 0.4, a: 0.03, d: 0.4, peak: 0.5 });
    },
  });
  // Mega Stamp up: a giant rubber "boing" and a heavy clank
  def('stamp_start', {
    gain: 0.48, max: 2, jitter: 0.02, reverb: 0.14,
    build(v, p) {
      const T = v.t, g = v.gain(0, v.out), end = perc(g.gain, T, 0.004, 0.8, 0.5);
      const o = v.osc('sine', 90 * p, T, end + 0.01, g);
      o.frequency.setValueAtTime(90 * p, T); o.frequency.exponentialRampToValueAtTime(180 * p, T + 0.12); o.frequency.exponentialRampToValueAtTime(115 * p, T + 0.5);
      const w = v.lfo(11, 0, o.detune, T, end); pts(w.depth.gain, T, [[0, 0], [0.08, 90], [0.45, 0]]);
      clank(v, 0.02, 400, 0.35, 0.25, p);
    },
  });
  // Zipline: the cloak coming over you — a shimmering reverse swell and a whisper
  def('zip_cloak', {
    gain: 0.16, max: 2, jitter: 0.02, reverb: 0.3,
    build(v, p) {
      const T = v.t, g = v.gain(0, v.out); pts(g.gain, T, [[0, 0], [0.45, 0.25], [0.5, 0]]);
      for (const f of [2637, 2794, 3520, 4186]) v.osc('sine', f * p, T, T + 0.52, g);
      whoosh(v, 0, 0.5, 1500 * p, 4000 * p, 7000 * p, 0.25, { q: 1.4, kind: 'white', mid: 0.8, env: [[0, 0], [0.9, 1], [1, 0]] });
      v.tone({ t: 0.48, f: 220 * p, f1: 110 * p, sw: 0.2, a: 0.004, d: 0.3, peak: 0.3 });
    },
  });
  // Crab Rig: the mech booting (three servo whirs, clanks, a ready beep)
  def('crab_boot', {
    gain: 0.44, max: 2, jitter: 0.02, reverb: 0.1,
    build(v, p) {
      for (let i = 0; i < 3; i++) {
        const T = v.t + i * 0.13, g = v.gain(0, v.out), bp = v.filter('bandpass', 900, 3, g);
        const o = v.osc('sawtooth', (160 + 40 * i) * p, T, T + 0.12, bp); sweep(o.frequency, T, (160 + 40 * i) * p, (420 + 80 * i) * p, 0.1);
        pts(g.gain, T, [[0, 0], [0.02, 0.28], [0.11, 0]]);
        clank(v, i * 0.13 + 0.1, 480 + 80 * i, 0.22, 0.1, p);
      }
      const lp = v.filter('lowpass', 3500, 0.8, v.out), pw = pulseWave(v.ctx, 0.3);
      [[0.44, 84], [0.52, 88]].forEach(([t, m]) => v.tone({ t, type: pw, f: mtof(m) * p, a: 0.002, h: 0.04, d: 0.05, peak: 0.24, to: lp }));
    },
  });
  // Cheer Orb lands: a thud and a choir "hup!" — its 1.5 s fuse starts (orb_fuse)
  def('orb_land', {
    gain: 0.44, max: 3, jitter: 0.02, reverb: 0.2,
    build(v, p) {
      v.tone({ f: 160 * p, f1: 70 * p, sw: 0.08, a: 0.001, d: 0.14, peak: 0.8 });
      const T = v.t, g = v.gain(0, v.out), end = pts(g.gain, T, [[0, 0], [0.02, 0.6], [0.18, 0.3], [0.26, 0]]);
      vox(v, T, end + 0.01, 262 * p, [[700, 6, 1], [1150, 7, 0.5], [2600, 9, 0.2]], g);
      bell(v, T + 0.02, 1320 * p, 0.14, { d: 0.4 });
    },
  });
  // Kraken over: a squelchy pop back into a kid
  def('kraken_off', {
    gain: 0.42, max: 2, jitter: 0.03, reverb: 0.14,
    build(v, p) {
      v.tone({ f: 420 * p, f1: 150 * p, sw: 0.08, a: 0.002, d: 0.1, peak: 0.6 });
      v.nz({ f: 900 * p, f1: 300 * p, sw: 0.14, q: 5, a: 0.002, d: 0.14, peak: 0.55 });
      bloops(v, 0.02, 4, 0.14, [250, 500], 0.3, p);
    },
  });
  // Ink Jet boost (jump): a burst of thrust
  def('jet_boost', {
    gain: 0.46, max: 3, jitter: 0.04, reverb: 0.06,
    build(v, p) {
      v.nz({ kind: 'pink', ft: 'lowpass', f: 500, f1: 3200, sw: 0.15, q: 0.9, a: 0.01, d: 0.35, peak: 0.8 });
      v.tone({ f: 90 * p, f1: 160 * p, sw: 0.15, a: 0.01, d: 0.25, peak: 0.45 });
      const g = v.gain(0, v.out); pts(g.gain, v.t, [[0, 0], [0.03, 0.3], [0.3, 0]]);
      v.buffer(texture(v.ctx, 'sizzle'), v.t, v.t + 0.32, v.filter('bandpass', 2600, 0.8, g));
    },
  });
  // Crab Rig: the mortar reloaded — a heavy "ka-chunk" and a ready beep (the enemy's cannon is loaded)
  def('crab_reload', {
    gain: 0.36, max: 3, jitter: 0.02, reverb: 0.08,
    build(v, p) {
      clank(v, 0, 360, 0.4, 0.18, p); v.tone({ f: 200 * p, f1: 90 * p, sw: 0.05, a: 0.001, d: 0.08, peak: 0.6 });
      clank(v, 0.11, 480, 0.35, 0.16, p); v.tone({ t: 0.11, f: 180 * p, f1: 80 * p, sw: 0.05, a: 0.001, d: 0.08, peak: 0.5 });
      v.tone({ t: 0.22, type: 'triangle', f: 1320 * p, a: 0.002, h: 0.05, d: 0.06, peak: 0.25 });
    },
  });
  // you're revealed by a Deep Sonar: a quiet sonar blip every ~2 s while it lasts
  def('sonar_blip', {
    gain: 0.16, max: 1, jitter: 0, reverb: 0.3, minGap: 0.5,
    build(v, p) {
      v.tone({ f: 540 * p, f1: 523 * p, sw: 0.04, a: 0.003, d: 0.5, peak: 0.5 });
      v.tone({ t: 0.25, f: 523 * p, a: 0.003, d: 0.3, peak: 0.15, to: v.pan(0.4, v.out) });
    },
  });

  /* ================================================================================================ special warnings */
  // Tidal Slam from the leap to the landing: a rising wind-up (rise), a held quiver at the top (hang), then a falling
  // whistle as it drops. params { phase: 0 rise | 1 hang | 2 fall, k: 0..1 through the phase, foe }
  def('slam_warn', {
    gain: 0.26, max: 4, jitter: 0, reverb: 0.1, oneShot: 1.2,
    loop(v, p, o) {
      const T = v.t, st = { phase: 0, k: 0, foe: 1, q: p, ...(o?.params || {}) };
      const wg = v.gain(0.2, v.out), lp = v.filter('lowpass', 1500, 1.2, wg);
      const saw = v.osc('sawtooth', 150 * p, T, null, lp), saw2 = v.osc('sawtooth', 151.5 * p, T, null, lp);
      const trem = v.lfo(12, 0, wg.gain, T, null);
      const whg = v.gain(0, v.out), wh = v.osc('sine', 1400 * p, T, null, whg);
      v.lfo(7, 12, wh.detune, T, null);
      const ng = v.gain(0.2, v.out), nbp = v.filter('bandpass', 800, 1.4, ng); v.noise('pink', T, null, nbp);
      const apply = (now) => {
        const k = clamp01(st.k), q = st.q, ph = st.phase | 0;
        const f = ph === 0 ? 150 + 450 * k : ph === 1 ? 600 : 600 - 350 * k;
        saw.frequency.setTargetAtTime(f * q, now, K); saw2.frequency.setTargetAtTime(f * 1.01 * q, now, K);
        lp.frequency.setTargetAtTime((st.foe ? 1800 : 1000) + (ph === 0 ? 1500 * k : 1200), now, K);
        wg.gain.setTargetAtTime(ph === 2 ? 0.14 : 0.2, now, K); trem.depth.gain.setTargetAtTime(ph === 1 ? 0.12 : 0, now, K);
        wh.frequency.setTargetAtTime((ph === 2 ? 1500 - 1000 * k : 1500) * q, now, K); whg.gain.setTargetAtTime(ph === 2 ? 0.2 : 0, now, K);
        ng.gain.setTargetAtTime(ph === 0 ? 0.25 : ph === 1 ? 0.08 : 0.35 + 0.25 * k, now, K);
        nbp.frequency.setTargetAtTime(ph === 0 ? 600 + 1800 * k : ph === 1 ? 2400 : 2400 - 1600 * k, now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });
  // Vortex Strike: a target alarm at the landing spot for the whole flight — a two-tone pulse speeding up (k: 0..1 of
  // the flight) and a rumble swelling in; the enemy's is a harsh square, a friendly one soft pings. params { k, foe }
  def('strike_mark', {
    gain: 0.16, max: 3, jitter: 0, reverb: 0.1, oneShot: 1.2,
    loop(v, p, o) {
      const T = v.t, st = { k: 0, foe: 1, q: p, ...(o?.params || {}) };
      const pg = v.gain(0, v.out), lp = v.filter('lowpass', 2600, 0.9, pg);
      const sq = v.gain(0.7, lp), s1 = v.osc('square', 740 * p, T, null, sq);
      const si = v.gain(0.6, pg), s2 = v.osc('sine', 740 * p, T, null, si);
      const tw = v.gain(0), two = v.osc('square', 1, T, null, tw); tw.connect(s1.frequency); tw.connect(s2.frequency);   // two-tone
      const g = gate(v, T, 2, 0.55, 0.9, pg.gain);
      const rg = v.gain(0, v.out); v.noise('brown', T, null, v.filter('lowpass', 220, 1, rg));
      const apply = (now) => {
        const k = clamp01(st.k), q = st.q, rate = 2 + 8 * Math.pow(k, 1.3);
        s1.frequency.setTargetAtTime(870 * q, now, K); s2.frequency.setTargetAtTime(870 * q, now, K);
        tw.gain.setTargetAtTime(125 * q, now, K); two.frequency.setTargetAtTime(rate / 2, now, K); g.osc.frequency.setTargetAtTime(rate, now, K);
        sq.gain.setTargetAtTime(st.foe ? 0.7 : 0, now, K); lp.frequency.setTargetAtTime(st.foe ? 2600 : 1600, now, K);
        rg.gain.setTargetAtTime(0.5 * k * k, now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });
  // Howl Box charging with YOU in its line: an electric "zzZZ" crescendo (k: 0..1 of the 1.3 s charge)
  def('beam_lock', {
    gain: 0.4, max: 2, jitter: 0, reverb: 0.06, oneShot: 1.2,
    loop(v, p, o) {
      const T = v.t, st = { k: 0, q: p, ...(o?.params || {}) };
      const g = v.gain(0.4, v.out), bp = v.filter('bandpass', 1200, 2, g), sh = v.shaper(3, bp);
      const s = v.osc('sawtooth', 110 * p, T, null, sh);
      const am = v.lfo(8, 0.35, g.gain, T, null, 'square');
      const apply = (now) => {
        const k = clamp01(st.k);
        s.frequency.setTargetAtTime(110 * st.q * (1 + 0.5 * k), now, K); bp.frequency.setTargetAtTime(1200 + 1800 * k, now, K);
        am.osc.frequency.setTargetAtTime(8 + 22 * k, now, K); g.gain.setTargetAtTime(0.4 + 0.6 * k, now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });
  // Kraken's jump attack coming down: a falling "wheee-oo" whistle over a rush. params { k: 0..1 of the drop, foe }
  def('kraken_dive', {
    gain: 0.24, max: 3, jitter: 0, reverb: 0.08, oneShot: 1.0,
    loop(v, p, o) {
      const T = v.t, st = { k: 0, foe: 1, q: p, ...(o?.params || {}) };
      const wg = v.gain(0.3, v.out), w = v.osc('sine', 1600 * p, T, null, wg); v.lfo(9, 18, w.detune, T, null);
      const ng = v.gain(0.3, v.out), bp = v.filter('bandpass', 1600, 3, ng); v.noise('white', T, null, bp);
      const rg = v.gain(0.1, v.out); v.noise('brown', T, null, v.filter('lowpass', 240, 1, rg));
      const apply = (now) => {
        const k = clamp01(st.k), f = (1600 - 1100 * k) * st.q;
        w.frequency.setTargetAtTime(f, now, K); bp.frequency.setTargetAtTime(f, now, K);
        rg.gain.setTargetAtTime(0.1 + 0.5 * k, now, K); wg.gain.setTargetAtTime(st.foe ? 0.3 : 0.15, now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });
  // Cheer Orb on the ground (1.5 s): the choir swelling to a crescendo over a heartbeat that races. params { k, foe }
  def('orb_fuse', {
    gain: 0.26, max: 3, jitter: 0, reverb: 0.25, oneShot: 1.5,
    loop(v, p, o) {
      const T = v.t, st = { k: 0, foe: 1, q: p, ...(o?.params || {}) };
      const lvl = v.gain(0.3, v.out), mix = v.gain(0.3);
      for (const [f, q, a] of [[750, 5, 1], [1150, 6, 0.5], [2600, 8, 0.22]]) mix.connect(v.filter('bandpass', f, q, v.gain(a, lvl)));
      const vib = v.gain(10); v.osc('sine', 5.5, T, null, vib);
      const oscs = [];
      for (const m of [60, 64, 67, 72]) for (const dt of [-8, 8]) { const x = v.osc('sawtooth', mtof(m) * p, T, null, mix); x.detune.value = dt; vib.connect(x.detune); oscs.push([x, mtof(m)]); }
      const hb = v.gain(0, v.out), ho = v.osc('sine', 60 * p, T, null, hb);
      const g = gate(v, T, 2, 0.6, 0.9, hb.gain);
      const tk = v.gain(0, v.out), to = v.osc('sine', 1046 * p, T, null, tk);
      const g2 = gate(v, T, 2, 0.85, 0.2, tk.gain, 0.25);
      const apply = (now) => {
        const k = clamp01(st.k), q = st.q * (1 + 0.12 * k);
        for (const [x, f] of oscs) x.frequency.setTargetAtTime(f * q, now, K);
        lvl.gain.setTargetAtTime(0.25 + 0.75 * k, now, K);
        const rate = 2 + 10 * k * k;
        g.osc.frequency.setTargetAtTime(rate, now, K); g2.osc.frequency.setTargetAtTime(rate, now, K);
        ho.frequency.setTargetAtTime(60 * st.q, now, K); to.frequency.setTargetAtTime(1046 * q, now, K);
        g2.depth.gain.setTargetAtTime(st.foe ? 0.25 : 0.1, now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });
  // Crab Rig mortar shell in the air: a mortar whistle that climbs going up and falls coming down. params { vy, foe }
  def('shell_whistle', {
    gain: 0.16, max: 4, jitter: 0, reverb: 0.06, oneShot: 1.0,
    loop(v, p, o) {
      const T = v.t, st = { vy: 0, foe: 1, q: p, ...(o?.params || {}) };
      const wg = v.gain(0.5, v.out), w = v.osc('sine', 1100 * p, T, null, wg); v.lfo(11, 10, w.detune, T, null);
      const ng = v.gain(0.25, v.out), bp = v.filter('bandpass', 1100, 4, ng); v.noise('white', T, null, bp);
      const apply = (now) => {
        const f = Math.min(1900, Math.max(450, 1100 + 55 * (+st.vy || 0))) * st.q;
        w.frequency.setTargetAtTime(f, now, K); bp.frequency.setTargetAtTime(f, now, K);
        wg.gain.setTargetAtTime(st.foe ? 0.5 : 0.3, now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });
  // a thrown Mega Stamp: a heavy spinning whoosh and a low hum, coming at you
  def('stamp_fly', {
    gain: 0.3, max: 3, jitter: 0, reverb: 0.06, oneShot: 0.8,
    loop(v, p) {
      const T = v.t;
      const am = v.gain(0.6, v.out), bp = v.filter('bandpass', 520 * p, 1.4, am); v.noise('pink', T, null, bp);
      const spin = v.lfo(9 * p, 0.5, am.gain, T, null);
      const h = v.osc('sine', 80 * p, T, null, v.gain(0.35, v.out));
      return { pitch(q, now) { bp.frequency.setTargetAtTime(520 * q, now, K); spin.osc.frequency.setTargetAtTime(9 * q, now, K); h.frequency.setTargetAtTime(80 * q, now, K); } };
    },
  });

  /* ================================================================================================ special loops */
  // Twister Zooka twister: a tight, fast whirl of wind with a whistle (fast movers: the Doppler makes the pass-by)
  def('twister', {
    gain: 0.36, max: 6, jitter: 0, reverb: 0.05, oneShot: 1.0,
    loop(v, p) {
      const T = v.t;
      const am = v.gain(0.6, v.out), bp = v.filter('bandpass', 1100 * p, 1.6, am); v.noise('pink', T, null, bp);
      const spin = v.lfo(13 * p, 0.5, am.gain, T, null); const sw = v.lfo(3, 400 * p, bp.frequency, T, null);
      const wg = v.gain(0.08, v.out), w = v.osc('sine', 1500 * p, T, null, wg); v.lfo(13, 60, w.detune, T, null);
      v.noise('brown', T, null, v.filter('lowpass', 200, 1, v.gain(0.3, v.out)));
      return {
        pitch(q, now) { bp.frequency.setTargetAtTime(1100 * q, now, K); spin.osc.frequency.setTargetAtTime(13 * q, now, K); sw.depth.gain.setTargetAtTime(400 * q, now, K); w.frequency.setTargetAtTime(1500 * q, now, K); },
      };
    },
  });
  // Kraken moving: a squelchy slither, galloping bounces with its speed, and a gargling growl. params { speed: 0..1 }
  def('kraken_move', {
    gain: 0.3, max: 4, jitter: 0, reverb: 0.06, oneShot: 1.5,
    loop(v, p, o) {
      const T = v.t, st = { speed: 0.5, q: p, ...(o?.params || {}) };
      const sq = v.gain(0.4, v.out), lp = v.filter('lowpass', 1200, 0.8, sq);
      const tex = v.buffer(texture(v.ctx, 'squelch'), T, null, lp, p);
      const th = v.gain(0, v.out), tho = v.osc('sine', 70 * p, T, null, th);
      const g = gate(v, T, 3, 0.5, 0.8, th.gain);
      const gr = v.gain(0.07, v.out), gsh = v.shaper(2.5, v.filter('bandpass', 520, 3, gr));
      const gro = v.osc('sawtooth', 55 * p, T, null, gsh); v.lfo(27, 0.04, gr.gain, T, null);
      const apply = (now) => {
        const s = clamp01(st.speed), q = st.q;
        tex.playbackRate.setTargetAtTime((0.7 + 0.6 * s) * q, now, K); sq.gain.setTargetAtTime(0.2 + 0.6 * s, now, K);
        g.osc.frequency.setTargetAtTime((2.5 + 2.5 * s) * q, now, K); g.depth.gain.setTargetAtTime(0.9 * s, now, K);
        tho.frequency.setTargetAtTime(70 * q, now, K); gro.frequency.setTargetAtTime(55 * q, now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });
  // a drifting Bubble Blower bubble: a glassy wobbling hum; charged by its team's fire (charge 0..1) it strains —
  // higher, a faster wobble, a creak — before it blows. params { charge, foe }
  def('bubble_drift', {
    gain: 0.13, max: 6, jitter: 0, reverb: 0.2, oneShot: 1.5,
    loop(v, p, o) {
      const T = v.t, st = { charge: 0, foe: 1, q: p, ...(o?.params || {}) };
      const amp = v.gain(0.5, v.out);
      const oscs = [[520, 1], [780, 0.5], [1040, 0.25]].map(([f, a]) => [v.osc('sine', f * p, T, null, v.gain(a, amp)), f]);
      const vib = v.gain(20); v.osc('sine', 0.7, T, null, vib); for (const [x] of oscs) vib.connect(x.detune);
      const wob = v.lfo(6, 0.18, amp.gain, T, null);
      const cr = v.gain(0, v.out), cbp = v.filter('bandpass', 1800, 6, cr); v.noise('pink', T, null, cbp);
      const apply = (now) => {
        const c = clamp01(st.charge), q = st.q * (1 + 0.6 * c);
        for (const [x, f] of oscs) x.frequency.setTargetAtTime(f * q, now, K);
        wob.osc.frequency.setTargetAtTime(6 + 12 * c, now, K); cr.gain.setTargetAtTime(0.3 * c * c, now, K); cbp.frequency.setTargetAtTime(1800 * q, now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });
  // Mega Stamp carried: servo creaks and a heavy stomp in step with the charge. params { speed: 0..1 }
  def('stamp_carry', {
    gain: 0.28, max: 4, jitter: 0, reverb: 0.05, oneShot: 1.5,
    loop(v, p, o) {
      const T = v.t, st = { speed: 0, q: p, ...(o?.params || {}) };
      const cg = v.gain(0.05, v.out), cbp = v.filter('bandpass', 600, 5, cg), co = v.osc('sawtooth', 90 * p, T, null, cbp);
      v.lfo(1.3, 0.03, cg.gain, T, null);
      const sg = v.gain(0, v.out), so = v.osc('sine', 55 * p, T, null, sg);
      const g = gate(v, T, 2, 0.6, 0, sg.gain);
      const rg = v.gain(0, v.out); v.noise('pink', T, null, v.filter('bandpass', 1200, 3, rg));
      const g2 = gate(v, T, 2, 0.8, 0, rg.gain);
      const apply = (now) => {
        const s = clamp01(st.speed), q = st.q, rate = (1.6 + 1.6 * s) * q;
        g.osc.frequency.setTargetAtTime(rate, now, K); g2.osc.frequency.setTargetAtTime(rate, now, K);
        g.depth.gain.setTargetAtTime(0.9 * s, now, K); g2.depth.gain.setTargetAtTime(0.25 * s, now, K);
        so.frequency.setTargetAtTime(55 * q, now, K); co.frequency.setTargetAtTime(90 * q, now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });
  // Cheer Orb in the air: a shimmering choir "aah" riding a whoosh
  def('orb_fly', {
    gain: 0.4, max: 3, jitter: 0, reverb: 0.22, oneShot: 1.0,
    loop(v, p) {
      const T = v.t, mix = v.gain(0.25);
      for (const [f, q, a] of [[800, 5, 1], [1200, 6, 0.5], [2700, 9, 0.2]]) mix.connect(v.filter('bandpass', f, q, v.gain(a, v.out)));
      const oscs = [69, 73, 76].map((m) => [v.osc('sawtooth', mtof(m) * p, T, null, mix), mtof(m)]);
      const am = v.gain(0.5, v.out), bp = v.filter('bandpass', 1500 * p, 1.4, am); v.noise('pink', T, null, bp);
      const spin = v.lfo(8, 0.35, am.gain, T, null);
      return { pitch(q, now) { for (const [x, f] of oscs) x.frequency.setTargetAtTime(f * q, now, K); bp.frequency.setTargetAtTime(1500 * q, now, K); spin.osc.frequency.setTargetAtTime(8 * q, now, K); } };
    },
  });
  // the Zipline's cloak: a quiet whispering shimmer on its wearer (you hear one lurking nearby)
  def('zip_aura', {
    gain: 0.035, max: 4, jitter: 0, reverb: 0.3, oneShot: 1.5,
    loop(v, p) {
      const T = v.t, g = v.gain(0.3, v.out);
      const oscs = [[2637, 0], [2794, 0.3], [3520, 0.6]].map(([f, ph]) => { const x = v.osc('sine', f * p, T, null, g); v.lfo(0.3 + ph, 25, x.detune, T, null); return [x, f]; });
      v.lfo(0.9, 0.15, g.gain, T, null);
      const n = v.gain(0.12, v.out); v.noise('pink', T, null, v.filter('bandpass', 6000, 1.5, n)); v.lfo(0.5, 0.06, n.gain, T, null);
      return { pitch(q, now) { for (const [x, f] of oscs) x.frequency.setTargetAtTime(f * q, now, K); } };
    },
  });
  // zipping along the line: the line zinging and the air rushing
  def('zip_whizz', {
    gain: 0.6, max: 3, jitter: 0, reverb: 0.04, oneShot: 0.8,
    loop(v, p) {
      const T = v.t;
      const g = v.gain(0.25, v.out), bp = v.filter('bandpass', 1600 * p, 6, g), s = v.osc('sawtooth', 400 * p, T, null, bp);
      v.lfo(40, 0.1, g.gain, T, null);
      const n = v.gain(0.25, v.out), nbp = v.filter('bandpass', 3000 * p, 1.2, n); v.noise('pink', T, null, nbp);
      return { pitch(q, now) { s.frequency.setTargetAtTime(400 * q, now, K); bp.frequency.setTargetAtTime(1600 * q, now, K); nbp.frequency.setTargetAtTime(3000 * q, now, K); } };
    },
  });
  // Bubble Guard: the shield's glassy wobble on each shielded kid (quiet)
  def('shield_hum', {
    gain: 0.08, max: 6, jitter: 0, reverb: 0.15, oneShot: 1.5,
    loop(v, p) {
      const T = v.t, g = v.gain(0.5, v.out);
      const a = v.osc('sine', 440 * p, T, null, g), b = v.osc('sine', 660 * p, T, null, v.gain(0.5, g));
      const w = v.lfo(5, 30, a.detune, T, null); w.depth.connect(b.detune);
      v.lfo(3.1, 0.12, g.gain, T, null);
      const s = v.gain(0.05, v.out); v.noise('white', T, null, v.filter('bandpass', 5000, 2, s));
      return { pitch(q, now) { a.frequency.setTargetAtTime(440 * q, now, K); b.frequency.setTargetAtTime(660 * q, now, K); } };
    },
  });
  // Bomb Barrage running: a marching snare cadence on the thrower (the bombs have their own sounds)
  def('barrage_drum', {
    gain: 0.14, max: 4, jitter: 0, reverb: 0.1, oneShot: 1.5,
    loop(v, p) {
      const T = v.t, sg = v.gain(0.05, v.out);
      v.noise('white', T, null, v.filter('highpass', 1500, 0.7, sg));
      const st = v.osc(strokeWave(v.ctx, 8), 8 * p, T, null); const d = v.gain(0.5); st.connect(d); d.connect(sg.gain);
      v.lfo(2 * p, 0.12, sg.gain, T, null, 'square');
      const tg = v.gain(0, v.out), to = v.osc('sine', 95 * p, T, null, tg);
      gate(v, T, 2 * p, 0.7, 0.6, tg.gain);
      return { pitch(q, now) { st.frequency.setTargetAtTime(8 * q, now, K); to.frequency.setTargetAtTime(95 * q, now, K); } };
    },
  });
  // Howl Box held on the shoulder (before it's set down): the speaker's idle mains hum and a thin feedback whine
  def('wail_hold', {
    gain: 0.12, max: 4, jitter: 0, reverb: 0.06, oneShot: 1.5,
    loop(v, p) {
      const T = v.t;
      const h = v.osc('sawtooth', 60 * p, T, null, v.filter('lowpass', 300, 1, v.gain(0.3, v.out)));
      const wg = v.gain(0.05, v.out), w = v.osc('sine', 1900 * p, T, null, wg); v.lfo(0.6, 20, w.detune, T, null);
      const cg = v.gain(0.05, v.out); v.buffer(texture(v.ctx, 'sizzle'), T, null, v.filter('bandpass', 3000, 0.8, cg));
      return { pitch(q, now) { h.frequency.setTargetAtTime(60 * q, now, K); w.frequency.setTargetAtTime(1900 * q, now, K); } };
    },
  });
  // Vortex Strike: aiming (the owner only, no position): a targeting computer blipping
  def('strike_aim', {
    gain: 0.09, max: 1, jitter: 0, reverb: 0.05, oneShot: 1.5,
    loop(v, p) {
      const T = v.t, bg = v.gain(0, v.filter('lowpass', 3000, 0.8, v.out));
      const s = v.osc('square', 1200 * p, T, null, bg);
      const sw = v.gain(200 * p); v.osc('square', 1.5, T, null, sw); sw.connect(s.frequency);
      gate(v, T, 3, 0.8, 0.5, bg.gain);
      v.osc('triangle', 220 * p, T, null, v.gain(0.08, v.out));
      return { pitch() {} };
    },
  });

  /* ================================================================================================ special blasts / ends */
  // a Zooka twister ending on a wall: a wind burst and a splat
  def('twister_burst', {
    gain: 0.5, max: 4, jitter: 0.05, reverb: 0.16, minGap: 0.04,
    build(v, p) {
      whoosh(v, 0, 0.35, 2000 * p, 700 * p, 300 * p, 0.7, { q: 1.2, env: [[0, 0], [0.08, 1], [1, 0]] });
      bigSplat(v, 0.02, p * 1.1, 0.7);
    },
  });
  // Crab Rig mortar: a deep "ka-BOOM" with the shell casing ringing
  def('shell_boom', {
    gain: 0.56, max: 3, jitter: 0.04, reverb: 0.26,
    build(v, p) {
      v.tone({ f: 82 * p, f1: 28 * p, sw: 0.6, a: 0.002, d: 0.8, peak: 1 });
      v.nz({ ft: 'highpass', f: 1600, a: 0.0003, d: 0.05, peak: 0.9 });
      const sh = v.shaper(2.5, v.gain(0.7, v.out));
      v.nz({ kind: 'pink', ft: 'lowpass', f: 4200, f1: 170, sw: 0.6, q: 0.9, a: 0.002, d: 0.7, peak: 1, to: sh });
      clank(v, 0.01, 420, 0.22, 0.4, p);
      bloops(v, 0.05, 5, 0.3, [300, 620], 0.28, p);
    },
  });
  // the thrown Mega Stamp landing: a huge rubber THWUMP, a crash and a splash (bigger than a swing's)
  def('stamp_crash', {
    gain: 0.62, max: 2, jitter: 0.03, reverb: 0.3,
    build(v, p) {
      const T = v.t, g = v.gain(0, v.out), end = perc(g.gain, T, 0.002, 1, 0.65);
      const o = v.osc('sine', 150 * p, T, end + 0.01, g);
      o.frequency.setValueAtTime(150 * p, T); o.frequency.exponentialRampToValueAtTime(40 * p, T + 0.1);
      o.frequency.exponentialRampToValueAtTime(58 * p, T + 0.25); o.frequency.exponentialRampToValueAtTime(36 * p, T + 0.6);
      const w = v.lfo(10, 0, o.detune, T, end); pts(w.depth.gain, T, [[0, 0], [0.05, 140], [0.5, 0]]);
      v.tone({ type: 'triangle', f: 210 * p, f1: 70 * p, sw: 0.1, a: 0.001, d: 0.16, peak: 0.6 });
      v.nz({ kind: 'pink', ft: 'lowpass', f: 1200, f1: 150, sw: 0.25, q: 2.5, a: 0.001, d: 0.3, peak: 1 });
      v.nz({ ft: 'highpass', f: 3000, a: 0.002, d: 0.6, peak: 0.28 });
      bigSplat(v, 0.02, p * 0.9, 1);
    },
  });
  // Zipline body impact: the line's twang into a thump and a splash
  def('zip_impact', {
    gain: 0.5, max: 3, jitter: 0.05, reverb: 0.14,
    build(v, p) {
      const T = v.t, g = v.gain(0, v.out), end = perc(g.gain, T, 0.002, 0.5, 0.25), lp = v.filter('lowpass', 5000, 3, g);
      sweep(lp.frequency, T, 5000, 500, 0.2);
      const o = v.osc('sawtooth', 260 * p, T, end + 0.01, lp); sweep(o.frequency, T, 260 * p, 180 * p, 0.25);
      v.tone({ f: 150 * p, f1: 45 * p, sw: 0.2, a: 0.002, d: 0.3, peak: 0.9 });
      v.nz({ kind: 'pink', ft: 'lowpass', f: 2200, f1: 280, sw: 0.2, q: 1.4, a: 0.002, d: 0.22, peak: 0.8 });
      bloops(v, 0.02, 3, 0.1, [380, 650], 0.25, p);
    },
  });
  // an Ink Jet shot landing: a heavy "thoom" with a crackle of burnt ink
  def('jet_boom', {
    gain: 0.52, max: 4, jitter: 0.05, reverb: 0.2, minGap: 0.03,
    build(v, p) {
      v.tone({ f: 120 * p, f1: 34 * p, sw: 0.25, a: 0.002, d: 0.4, peak: 1 });
      v.nz({ ft: 'highpass', f: 2200, a: 0.0003, d: 0.03, peak: 0.7 });
      v.nz({ kind: 'pink', ft: 'lowpass', f: 2400, f1: 220, sw: 0.3, q: 1.1, a: 0.002, d: 0.32, peak: 0.9 });
      const g = v.gain(0, v.out); pts(g.gain, v.t + 0.02, [[0, 0], [0.02, 0.35], [0.3, 0]]);
      v.buffer(texture(v.ctx, 'sizzle'), v.t + 0.02, v.t + 0.34, v.filter('bandpass', 3000, 0.8, g));
      bloops(v, 0.03, 3, 0.1, [360, 640], 0.22, p);
    },
  });
  // Ink Tempest over: the last of the rain thinning out and a far-off rumble
  def('storm_fade', {
    gain: 0.3, max: 2, jitter: 0.02, reverb: 0.3,
    build(v, p) {
      const T = v.t, g = v.gain(0, v.out); pts(g.gain, T, [[0, 0], [0.05, 0.6], [1.2, 0]]);
      v.buffer(texture(v.ctx, 'rain'), T, T + 1.25, v.filter('highpass', 1200, 0.7, g), 0.8 * p);
      v.nz({ kind: 'brown', ft: 'lowpass', f: 300 * p, f1: 120 * p, sw: 1, q: 1, a: 0.1, d: 1.1, peak: 0.6 });
    },
  });
  // Vortex Strike vortex ending: the suction spinning down and a last slurp
  def('vortex_end', {
    gain: 0.4, max: 2, jitter: 0.02, reverb: 0.2,
    build(v, p) {
      const T = v.t, g = v.gain(0, v.out), am = v.gain(0.6, g), bp = v.filter('bandpass', 1200 * p, 1.4, am);
      sweep(bp.frequency, T, 1200 * p, 220 * p, 0.8); pts(g.gain, T, [[0, 0], [0.05, 0.7], [0.8, 0]]);
      const l = v.lfo(12, 0.5, am.gain, T, T + 0.82); sweep(l.osc.frequency, T, 12, 2, 0.8);
      v.noise('pink', T, T + 0.82, bp);
      v.tone({ t: 0.6, f: 200 * p, f1: 600 * p, sw: 0.12, a: 0.004, d: 0.12, peak: 0.35 });
    },
  });
}
