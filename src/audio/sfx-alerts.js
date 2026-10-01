// INKWAVE — the second round of sub / special cues (the sfx-loud job, 2026-10-01): "they all need to be louder … give
// every throwable sub a throw sound that changes pitch based on how long it's been thrown … a lot of warning special
// sounds, like if a vortex or cheer bomb is coming". Procedural like the rest; audio.js registers them, src/audio/cues.js
// (the director) plays them.
//
//   sub_flight   the flight of every thrown sub (and the Tempest's ball): one loop per throw, its timbre chosen by
//                params.kind at the start (Splat Bomb, Cling Charge, Pop Pellet, Skitter, Echo Orb, Drip Curtain,
//                Sprinkler, Murk Bomb, Waddle, the Tempest ball); the director glides its pitch along the arc (up with the
//                climb, a falling "incoming" whistle down to the landing) and params.arc (0 at the throw … 1 landing)
//                swells the whistle and the rush of air as it comes down
//   sting_<id>   an enemy (or a teammate, softer) just popped that special: a short motif, one per special
//   alert_<id>   the launch alert: the moment an enemy fires / aims a special that can hit you (at its target spot)
//   danger       the "you're in it" alarm: while you stand in a special's danger area, until it lands; params.kind
//                picks its voice (strike, orb, slam, storm, zooka, stamp, kraken, shell, jet — the Howl Box's in-line
//                alarm is its own beam_lock), params.k (0..1) its urgency (faster, higher, a frantic edge at the end)
import { mtof, perc, pts, sweep, strokeWave, pulseWave, snare, bell, brass, tom, kick, crash } from './music.js';

const K = 0.035;
const clamp01 = (x) => Math.min(1, Math.max(0, +x || 0));
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

// ---- the flight presets: each sub's own voice in the air (w: whistle waveform, f: its pitch, spin: tumble rate,
// nb / nq: the air band, wob: whistle vibrato (cents), tone / air: the layers' levels, x: an extra layer)
export const FLIGHT = {
  bomb: { w: 'sine', f: 1250, spin: 9, nb: 950, nq: 1.3, wob: 25, tone: 0.32, air: 0.55, x: null },
  sticky: { w: 'sine', f: 760, spin: 6, nb: 620, nq: 1.6, wob: 70, tone: 0.28, air: 0.45, x: 'gloop' },
  burst: { w: 'triangle', f: 2100, spin: 15, nb: 1900, nq: 1.4, wob: 15, tone: 0.26, air: 0.45, x: null },
  seeker: { w: 'sawtooth', f: 600, spin: 11, nb: 1400, nq: 2, wob: 10, tone: 0.12, air: 0.4, x: 'motor' },
  scan: { w: 'sine', f: 1760, spin: 5, nb: 3000, nq: 2, wob: 8, tone: 0.3, air: 0.25, x: 'glass' },
  curtain: { w: 'sine', f: 560, spin: 4, nb: 760, nq: 1.6, wob: 40, tone: 0.22, air: 0.55, x: 'slosh' },
  sprinkler: { w: 'triangle', f: 940, spin: 22, nb: 2400, nq: 2.5, wob: 60, tone: 0.26, air: 0.35, x: 'zing' },
  mist: { w: 'sine', f: 680, spin: 5, nb: 800, nq: 0.9, wob: 30, tone: 0.18, air: 0.55, x: 'bubble' },
  waddle: { w: 'triangle', f: 1040, spin: 8, nb: 1200, nq: 1.5, wob: 45, tone: 0.28, air: 0.38, x: 'squeak' },
  storm: { w: 'sine', f: 300, spin: 2, nb: 230, nq: 0.8, wob: 20, tone: 0.16, air: 0.9, x: 'rumble' },
};
// ---- the "you're in it" alarm's voices (f / f2: a two-tone, wave, r0 → r1: pulses a second from calm to frantic,
// th: how short each pulse, dbl: pulses in pairs (a heartbeat), lp: brightness)
export const DANGER = {
  strike: { f: 1320, f2: 990, wave: 'square', r0: 5, r1: 14, th: 0.55, dbl: 0, lp: 3600 },     // a klaxon two-tone
  orb: { f: 880, f2: 880, wave: 'triangle', r0: 1.6, r1: 7, th: 0.75, dbl: 1, lp: 2800 },      // a heartbeat, racing
  slam: { f: 392, f2: 294, wave: 'sawtooth', r0: 3, r1: 10, th: 0.45, dbl: 0, lp: 1800 },      // a low brassy honk
  storm: { f: 1245, f2: 1047, wave: 'triangle', r0: 2.5, r1: 5, th: 0.8, dbl: 0, lp: 4000 },   // slow soft pips (rain)
  zooka: { f: 1100, f2: 1650, wave: 'square', r0: 10, r1: 20, th: 0.5, dbl: 0, lp: 3200 },     // a fast up-down warble
  stamp: { f: 330, f2: 247, wave: 'square', r0: 2.5, r1: 8, th: 0.35, dbl: 0, lp: 1300 },      // a heavy, slow thud-thud
  kraken: { f: 988, f2: 740, wave: 'sawtooth', r0: 5, r1: 12, th: 0.65, dbl: 1, lp: 3200 },    // a snarling double pulse
  shell: { f: 2093, f2: 2093, wave: 'sine', r0: 10, r1: 22, th: 0.72, dbl: 0, lp: 7000 },      // a high, very fast pip
  jet: { f: 1980, f2: 1568, wave: 'triangle', r0: 9, r1: 18, th: 0.6, dbl: 0, lp: 5000 },      // a bright trill
};
export const STING_IDS = ['slam', 'storm', 'barrage', 'bubbler', 'sonar', 'strike', 'zooka', 'wail', 'kraken', 'blower', 'jetpack', 'stamp', 'booyah', 'zipcaster', 'crab'];
export const ALERT_IDS = ['strike', 'orb', 'slam', 'storm', 'barrage', 'twister', 'shell', 'stamp', 'wail', 'kraken', 'jet'];
export const ALERT_GROUPS = {
  Flight: ['sub_flight'],
  Alerts: [...ALERT_IDS.map((k) => 'alert_' + k), 'danger'],
  Stings: STING_IDS.map((k) => 'sting_' + k),
};

export function defineAlertSounds(def, L) {
  const { texture, bloops, whoosh, vox, clank } = L;

  /* ================================================================================================ flight */
  def('sub_flight', {
    gain: 0.34, max: 12, jitter: 0, reverb: 0.04, oneShot: 1.0,
    loop(v, p, o) {
      const T = v.t, P = FLIGHT[o?.params?.kind] || FLIGHT.bomb, st = { arc: 0, q: p, ...(o?.params || {}) };
      // tumbling air: band-passed noise, its level beating at the spin
      const am = v.gain(P.air, v.out), bp = v.filter('bandpass', P.nb * p, P.nq, am);
      v.noise('pink', T, null, bp);
      const spin = v.lfo(P.spin * p, P.air * 0.7, am.gain, T, null);
      // the whistle (the pitch you follow down to the landing)
      const wg = v.gain(P.tone, v.filter('lowpass', 7000, 0.7, v.out)), w = v.osc(P.w, P.f * p, T, null, wg);
      v.lfo(6, P.wob, w.detune, T, null);
      // the incoming rush: a narrow band of air on the whistle's pitch, up as it comes down
      const ig = v.gain(0, v.out), ibp = v.filter('bandpass', P.f * p, 6, ig); v.noise('white', T, null, ibp);
      const xs = [];
      switch (P.x) {
        case 'gloop': { const g = v.gain(0.25, v.out); xs.push([v.buffer(texture(v.ctx, 'squelch'), T, null, v.filter('lowpass', 900, 0.8, g), 1.2 * p), 'rate', 1.2]); break; }
        case 'motor': { const g = v.gain(0.08, v.filter('lowpass', 500, 1, v.out)); xs.push([v.osc('square', 92 * p, T, null, g), 'f', 92]); break; }
        case 'glass': { const g = v.gain(0.12, v.out); xs.push([v.osc('sine', P.f * 2.76 * p, T, null, g), 'f', P.f * 2.76]); break; }
        case 'slosh': { const g = v.gain(0.35, v.out); xs.push([v.buffer(texture(v.ctx, 'squelch'), T, null, v.filter('lowpass', 800, 0.8, g), 0.8 * p), 'rate', 0.8]); break; }
        case 'zing': { const g = v.gain(0.1, v.out), z = v.osc('sawtooth', P.f * 1.5 * p, T, null, v.filter('bandpass', 3000, 3, g)); v.lfo(25, 80, z.detune, T, null); xs.push([z, 'f', P.f * 1.5]); break; }
        case 'bubble': { const g = v.gain(0.3, v.out); xs.push([v.buffer(texture(v.ctx, 'bubbles'), T, null, v.filter('lowpass', 1400, 0.8, g), 0.9 * p), 'rate', 0.9]); break; }
        case 'squeak': { const g = v.gain(0.2, v.out), z = v.osc('triangle', P.f * 1.5 * p, T, null, g); v.lfo(17, 120, z.detune, T, null); v.lfo(5, 0.15, g.gain, T, null); xs.push([z, 'f', P.f * 1.5]); break; }   // (a toy's squeaky warble)
        case 'rumble': { const g = v.gain(0.75, v.out); v.noise('brown', T, null, v.filter('lowpass', 180, 1, g)); v.lfo(1.6, 0.35, g.gain, T, null); break; }   // (thunder rolling inside)
      }
      const apply = (now) => {
        const q = st.q, fall = clamp01((st.arc - 0.5) / 0.5);
        bp.frequency.setTargetAtTime(Math.min(16000, P.nb * q), now, K); spin.osc.frequency.setTargetAtTime(P.spin * q, now, K);
        w.frequency.setTargetAtTime(Math.min(16000, P.f * q), now, K); ibp.frequency.setTargetAtTime(Math.min(16000, P.f * q), now, K);
        wg.gain.setTargetAtTime(P.tone * (0.6 + 0.9 * fall), now, K);       // the whistle swells as it comes down
        ig.gain.setTargetAtTime(0.18 * fall * fall, now, K);
        for (const [n, kind, base] of xs) { if (kind === 'rate') n.playbackRate.setTargetAtTime(base * q, now, K); else n.frequency.setTargetAtTime(base * q, now, K); }
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });

  /* ================================================================================================ the "you're in it" alarm */
  def('danger', {
    gain: 0.2, max: 8, jitter: 0, reverb: 0.03, oneShot: 1.2,
    loop(v, p, o) {
      const T = v.t, D = DANGER[o?.params?.kind] || DANGER.strike, st = { k: 0, q: p, ...(o?.params || {}) };
      const pg = v.gain(0, v.out), lp = v.filter('lowpass', D.lp, 0.8, pg);
      const a = v.osc(D.wave, D.f * p, T, null, lp);
      const sw = v.gain((D.f2 - D.f) * p), swo = v.osc('square', 1, T, null, sw); sw.connect(a.frequency);   // the two-tone swap
      const sine = v.osc('sine', D.f * p, T, null, v.gain(0.4, pg)); sw.connect(sine.frequency);
      const g1 = gate(v, T, D.r0, D.th, 0.85, pg.gain), g2 = D.dbl ? gate(v, T, D.r0, D.th, 0.6, pg.gain, 0.22) : null;
      const fr = v.gain(0, v.out); v.noise('white', T, null, v.filter('bandpass', 3800, 1.4, fr));   // the frantic edge
      const fg = gate(v, T, 18, 0.7, 0, fr.gain);
      const apply = (now) => {
        const k = clamp01(st.k), q = st.q * Math.pow(2, (3 * k) / 12), rate = D.r0 + (D.r1 - D.r0) * k * k;
        a.frequency.setTargetAtTime(D.f * q, now, K); sine.frequency.setTargetAtTime(D.f * q, now, K); sw.gain.setTargetAtTime((D.f2 - D.f) * q, now, K);
        swo.frequency.setTargetAtTime(rate / 2, now, K);
        g1.osc.frequency.setTargetAtTime(rate, now, K); if (g2) g2.osc.frequency.setTargetAtTime(rate, now, K);
        fg.depth.gain.setTargetAtTime(0.16 * Math.max(0, k - 0.6) / 0.4, now, K);
        lp.frequency.setTargetAtTime(D.lp * (1 + 0.5 * k), now, K);
      };
      apply(T);
      return { pitch(q, now) { st.q = q; apply(now); }, params(o2, now) { Object.assign(st, o2); apply(now); } };
    },
  });

  /* ================================================================================================ launch alerts */
  // Vortex Strike launched (at the landing spot): an air-raid siren rising, twice
  def('alert_strike', {
    gain: 0.3, max: 3, jitter: 0, reverb: 0.2,
    build(v, p) {
      const T = v.t, g = v.gain(0, v.out), lp = v.filter('lowpass', 2600, 0.8, g);
      const o1 = v.osc('sawtooth', 380 * p, T, T + 1.25, lp), o2 = v.osc('square', 384 * p, T, T + 1.25, v.gain(0.4, lp));
      for (const o of [o1, o2]) { o.frequency.setValueAtTime(380 * p, T); o.frequency.exponentialRampToValueAtTime(900 * p, T + 0.5); o.frequency.exponentialRampToValueAtTime(520 * p, T + 0.62); o.frequency.exponentialRampToValueAtTime(980 * p, T + 1.1); }
      pts(g.gain, T, [[0, 0], [0.08, 0.5], [0.5, 0.6], [0.62, 0.35], [1.1, 0.65], [1.24, 0]]);
      v.lfo(7, 18, o1.detune, T, T + 1.25);
    },
  });
  // Cheer Orb thrown ("bomb incoming!"): three falling bell warnings over a whoosh, at where it'll land
  def('alert_orb', {
    gain: 0.36, max: 3, jitter: 0, reverb: 0.25,
    build(v, p) {
      const T = v.t;
      [[0, 88], [0.16, 84], [0.32, 79]].forEach(([t, m]) => { bell(v, T + t, mtof(m) * p, 0.45, { d: 0.35, ratio: 2.4, index: 1.4 }); v.tone({ t, type: 'square', f: mtof(m - 12) * p, a: 0.002, h: 0.08, d: 0.05, peak: 0.12, to: v.filter('lowpass', 2400, 0.8, v.out) }); });
      whoosh(v, 0, 0.7, 2600 * p, 1400 * p, 500 * p, 0.35, { q: 1.4, env: [[0, 0], [0.4, 1], [1, 0]] });
    },
  });
  // Tidal Slam leap (at the landing spot): a three-step brass call climbing, and a rush upward
  def('alert_slam', {
    gain: 0.34, max: 3, jitter: 0, reverb: 0.2,
    build(v, p) {
      const T = v.t;
      // (a bright "da-da-DAA" brass call, up a fourth each time, over a short rush up: no low end — the Kraken's is a roar)
      for (const [t, ms, d] of [[0, [62, 69], 0.08], [0.11, [65, 72], 0.08], [0.22, [67, 74], 0.26]]) for (const m of ms) brass(v, T + t, mtof(m) * p, d, 0.42, { bright: 4200, a: 0.005, r: 0.1 });
      whoosh(v, 0.02, 0.35, 600 * p, 2400 * p, 3600 * p, 0.3, { q: 1.5 });
    },
  });
  // Ink Tempest over you: a close thunder crack and a low roll
  def('alert_storm', {
    gain: 0.42, max: 2, jitter: 0.03, reverb: 0.3,
    build(v, p) {
      const T = v.t;
      v.nz({ ft: 'highpass', f: 1800, a: 0.0005, d: 0.05, peak: 1 });
      for (let i = 0; i < 4; i++) v.nz({ t: 0.02 + v.r(0, 0.12), ft: 'highpass', f: 2200, a: 0.0008, d: v.r(0.02, 0.05), peak: v.r(0.4, 0.8) });
      v.nz({ t: 0.03, kind: 'brown', ft: 'lowpass', f: 500 * p, f1: 120 * p, sw: 1.0, q: 1, a: 0.02, d: 1.1, peak: 1 });
      v.tone({ t: 0.02, f: 70 * p, f1: 38 * p, sw: 0.5, a: 0.01, d: 0.7, peak: 0.7 });
      const g = v.gain(0, v.out); pts(g.gain, T, [[0, 0], [0.4, 0.5], [1.2, 0]]);
      v.buffer(texture(v.ctx, 'rain'), T + 0.1, T + 1.25, v.filter('highpass', 1200, 0.7, g));
    },
  });
  // Bomb Barrage running (an enemy's): a snare roll swelling into a cymbal
  def('alert_barrage', {
    gain: 0.36, max: 2, jitter: 0, reverb: 0.2,
    build(v, p) {
      const T = v.t, c = v.gain(0, v.out);
      pts(c.gain, T, [[0, 0], [0.05, 0.25], [0.75, 1], [0.8, 0]]);
      const am = v.gain(0.1, c), st = v.osc(strokeWave(v.ctx, 7), 24 * p, T, T + 0.82); const d = v.gain(0.85); st.connect(d); d.connect(am.gain);
      v.noise('white', T, T + 0.82, v.filter('highpass', 1300, 0.7, am)); v.osc('triangle', 200, T, T + 0.82, v.gain(0.35, am));
      crash(v, T + 0.8, 0.5, { d: 0.9 }); kick(v, T + 0.8, 0.7);
    },
  });
  // a Zooka shot coming your way: a rising wind scream with a whistle on top
  def('alert_twister', {
    gain: 0.34, max: 4, jitter: 0.03, reverb: 0.08, minGap: 0.1,
    build(v, p) {
      const T = v.t;
      whoosh(v, 0, 0.45, 600 * p, 2400 * p, 3200 * p, 0.8, { q: 2, kind: 'white', mid: 0.7, env: [[0, 0], [0.8, 1], [1, 0]] });
      const g = v.gain(0, v.out), o = v.osc('sine', 900 * p, T, T + 0.47, g); sweep(o.frequency, T, 900 * p, 2400 * p, 0.42); v.lfo(14, 40, o.detune, T, T + 0.47);
      pts(g.gain, T, [[0, 0], [0.35, 0.35], [0.45, 0]]);
    },
  });
  // a Crab Rig shell lobbed at you: a triple "pip-pip-pip" and the start of the drop
  def('alert_shell', {
    gain: 0.3, max: 3, jitter: 0, reverb: 0.1,
    build(v, p) {
      for (let i = 0; i < 3; i++) v.tone({ t: i * 0.09, type: 'square', f: 1568 * p, a: 0.002, h: 0.04, d: 0.03, peak: 0.3, to: v.filter('lowpass', 4000, 0.8, v.out) });
      v.tone({ t: 0.3, f: 1900 * p, f1: 1100 * p, sw: 0.4, a: 0.01, d: 0.4, peak: 0.4 });
    },
  });
  // a Mega Stamp thrown at you: a heavy "bwomp-bwomp" alarm under a rising whoosh
  def('alert_stamp', {
    gain: 0.36, max: 3, jitter: 0, reverb: 0.12,
    build(v, p) {
      for (const t of [0, 0.16]) { v.tone({ t, f: 140 * p, f1: 90 * p, sw: 0.12, a: 0.004, d: 0.14, peak: 0.9 }); v.tone({ t, type: 'square', f: 392 * p, a: 0.003, h: 0.07, d: 0.05, peak: 0.18, to: v.filter('lowpass', 1800, 0.8, v.out) }); }
      whoosh(v, 0.05, 0.4, 300 * p, 1200 * p, 1800 * p, 0.45, { q: 1.4 });
    },
  });
  // a Howl Box set down with you in its line: a feedback screech climbing
  def('alert_wail', {
    gain: 0.26, max: 2, jitter: 0, reverb: 0.1,
    build(v, p) {
      const T = v.t, g = v.gain(0, v.out), bp = v.filter('bandpass', 1800, 6, g), sh = v.shaper(2, bp);
      const o = v.osc('sawtooth', 900 * p, T, T + 0.62, sh); sweep(o.frequency, T, 900 * p, 2600 * p, 0.55);
      sweep(bp.frequency, T, 1500, 3600, 0.55); pts(g.gain, T, [[0, 0], [0.05, 0.3], [0.5, 0.6], [0.6, 0]]);
      v.osc('square', 60 * p, T, T + 0.6, v.filter('lowpass', 300, 1, v.gain(0.25, v.out)));
    },
  });
  // a Kraken's dive coming down on you: a deep roar under a rising whistle
  def('alert_kraken', {
    gain: 0.36, max: 2, jitter: 0, reverb: 0.15,
    build(v, p) {
      const T = v.t, g = v.gain(0, v.out), end = pts(g.gain, T, [[0, 0], [0.05, 0.6], [0.25, 0.35], [0.35, 0]]);
      const sh = v.shaper(2.5, g);
      vox(v, T, end + 0.01, 62 * p, [[480, 4, 1.2], [950, 5, 0.6], [240, 1, 0.5]], sh).srcs.forEach((x) => sweep(x.frequency, T, 62 * p, 90 * p, 0.3));
      // (then two rising whistles, the dive coming: a long, high tail no other alert has)
      for (const [t, f0, f1] of [[0.12, 900, 2200], [0.42, 1100, 2600]]) v.tone({ t, f: f0 * p, f1: f1 * p, sw: 0.38, a: 0.02, d: 0.4, peak: 0.4, to: v.filter('bandpass', 1800 * p, 1.2, v.out) });
    },
  });
  // an Ink Jet shot coming at you: a short incoming whistle
  def('alert_jet', {
    gain: 0.28, max: 4, jitter: 0.04, reverb: 0.05, minGap: 0.12,
    build(v, p) {
      v.tone({ f: 2400 * p, f1: 1300 * p, sw: 0.3, a: 0.01, d: 0.28, peak: 0.6 });
      v.nz({ f: 2400 * p, f1: 1300 * p, sw: 0.3, q: 5, a: 0.02, d: 0.25, peak: 0.25 });
    },
  });

  /* ================================================================================================ activation stings */
  const motif = (v, notes, o = {}) => {
    const out = o.to || v.filter('lowpass', o.lp || 4200, 0.8, v.out), pw = o.pw ? pulseWave(v.ctx, o.pw) : null;
    for (const [t, m, d, a] of notes) v.tone({ t, type: pw || o.type || 'triangle', f: mtof(m) * (o.p || 1), a: 0.003, h: d * 0.6, d: d * 0.5, peak: a ?? 0.4, to: out });
  };
  // Tidal Slam: a low brass hit dropping a fifth, and a thump
  def('sting_slam', { gain: 0.34, max: 2, jitter: 0, reverb: 0.25, build(v, p) { const T = v.t; for (const m of [43, 50]) brass(v, T, mtof(m) * p, 0.14, 0.5, { bright: 2200, a: 0.008, r: 0.1 }); for (const m of [36, 43]) brass(v, T + 0.18, mtof(m) * p, 0.25, 0.5, { bright: 1800, a: 0.01, r: 0.2 }); kick(v, T + 0.18, 0.8); } });
  // Ink Tempest: a thunder crack, then a high minor arpeggio falling like rain over a hiss
  def('sting_storm', { gain: 0.32, max: 2, jitter: 0, reverb: 0.3, build(v, p) { const T = v.t; v.nz({ ft: 'highpass', f: 2000, a: 0.0005, d: 0.06, peak: 0.8 }); v.nz({ t: 0.02, kind: 'brown', ft: 'lowpass', f: 400, f1: 120, sw: 0.4, a: 0.02, d: 0.35, peak: 0.45 }); [[0.08, 88], [0.17, 84], [0.26, 81], [0.35, 76]].forEach(([t, m]) => bell(v, T + t, mtof(m) * p, 0.3, { d: 0.25, ratio: 3.5, index: 0.8 })); v.nz({ t: 0.05, ft: 'highpass', f: 4000, a: 0.1, d: 0.4, peak: 0.12 }); } });
  // Bomb Barrage: a quick snare roll and three rising pulses
  def('sting_barrage', { gain: 0.32, max: 2, jitter: 0, reverb: 0.2, build(v, p) { const T = v.t; for (let i = 0; i < 6; i++) snare(v, T + i * 0.035, 0.25 + i * 0.07); motif(v, [[0.24, 72, 0.08], [0.32, 76, 0.08], [0.4, 79, 0.16, 0.5]], { pw: 0.25, p }); } });
  // Bubble Guard: a bubbly arpeggio climbing
  def('sting_bubbler', { gain: 0.3, max: 2, jitter: 0, reverb: 0.25, build(v, p) { [[0, 72], [0.07, 76], [0.14, 79], [0.21, 84]].forEach(([t, m]) => { v.tone({ t, f: mtof(m) * p * 0.7, f1: mtof(m) * p, sw: 0.05, a: 0.003, d: 0.12, peak: 0.45 }); v.bub(v.t + t + 0.02, mtof(m) * p * 1.5, 0.15, 0.03, 1.8); }); } });
  // Deep Sonar: two sonar pings, high then low, echoing
  def('sting_sonar', { gain: 0.3, max: 2, jitter: 0, reverb: 0.4, build(v, p) { for (const [t, f] of [[0, 1046], [0.22, 784]]) { v.tone({ t, f: f * 1.03 * p, f1: f * p, sw: 0.04, a: 0.003, d: 0.4, peak: 0.5 }); v.tone({ t: t + 0.12, f: f * p, a: 0.003, d: 0.25, peak: 0.15, to: v.pan(0.5, v.out) }); } } });
  // Vortex Strike: a two-tone klaxon, twice
  def('sting_strike', { gain: 0.28, max: 2, jitter: 0, reverb: 0.15, build(v, p) { motif(v, [[0, 77, 0.12, 0.45], [0.13, 72, 0.12, 0.45], [0.26, 77, 0.12, 0.45], [0.39, 72, 0.16, 0.45]], { type: 'square', lp: 2600, p }); } });
  // Twister Zooka: a whoosh up into a square chord stab
  def('sting_zooka', { gain: 0.32, max: 2, jitter: 0, reverb: 0.15, build(v, p) { whoosh(v, 0, 0.3, 400 * p, 1800 * p, 2600 * p, 0.6, { q: 1.6 }); motif(v, [[0.28, 67, 0.18, 0.3], [0.28, 71, 0.18, 0.3], [0.28, 74, 0.18, 0.3]], { pw: 0.3, p }); } });
  // Howl Box: a short distorted power chord
  def('sting_wail', { gain: 0.26, max: 2, jitter: 0, reverb: 0.15, build(v, p) { const T = v.t, g = v.gain(0, v.out), e = pts(g.gain, T, [[0, 0], [0.01, 0.5], [0.3, 0.35], [0.45, 0]]), sh = v.shaper(3, v.filter('lowpass', 2400, 1, g)); for (const m of [40, 47, 52]) v.osc('sawtooth', mtof(m) * p, T, e + 0.01, v.gain(0.4, sh)); } });
  // Kraken: a low growl sliding down
  def('sting_kraken', { gain: 0.34, max: 2, jitter: 0, reverb: 0.2, build(v, p) { const T = v.t, g = v.gain(0, v.out), e = pts(g.gain, T, [[0, 0], [0.04, 0.8], [0.35, 0.6], [0.5, 0]]); vox(v, T, e + 0.01, 75 * p, [[520, 4, 1.2], [980, 5, 0.6], [250, 1, 0.5]], g).srcs.forEach((x) => sweep(x.frequency, T, 75 * p, 48 * p, 0.5)); bloops(v, 0.1, 3, 0.2, [200, 400], 0.3, p); } });
  // Bubble Blower: a triplet of soapy blips
  def('sting_blower', { gain: 0.3, max: 2, jitter: 0, reverb: 0.2, build(v, p) { [[0, 1], [0.09, 1.26], [0.18, 1.5]].forEach(([t, r]) => v.tone({ t, f: 300 * r * p, f1: 900 * r * p, sw: 0.07, a: 0.003, d: 0.1, peak: 0.55 })); v.buffer(texture(v.ctx, 'bubbles_bright'), v.t, v.t + 0.35, v.filter('bandpass', 2400, 0.9, v.gain(0.25, v.out)), p); } });
  // Ink Jet: a burner swelling into a bright fanfare triad
  def('sting_jetpack', { gain: 0.3, max: 2, jitter: 0, reverb: 0.2, build(v, p) { v.nz({ kind: 'pink', ft: 'lowpass', f: 300, f1: 2600, sw: 0.25, a: 0.05, d: 0.25, peak: 0.6 }); for (const m of [72, 76, 79]) brass(v, v.t + 0.2, mtof(m) * p, 0.2, 0.32, { bright: 4400, a: 0.006, r: 0.15 }); } });
  // Mega Stamp: a rubber boing and a timpani hit
  def('sting_stamp', { gain: 0.34, max: 2, jitter: 0, reverb: 0.2, build(v, p) { const T = v.t, g = v.gain(0, v.out), e = perc(g.gain, T, 0.004, 0.7, 0.35), o = v.osc('sine', 110 * p, T, e + 0.01, g); o.frequency.setValueAtTime(110 * p, T); o.frequency.exponentialRampToValueAtTime(220 * p, T + 0.08); o.frequency.exponentialRampToValueAtTime(140 * p, T + 0.35); tom(v, T + 0.2, 70 * p, 0.9); } });
  // Cheer Orb: a choir "boo-YAH!"
  def('sting_booyah', { gain: 0.32, max: 2, jitter: 0, reverb: 0.3, build(v, p) { const T = v.t; for (const [t, m, d] of [[0, 67, 0.14], [0.16, 74, 0.26]]) { const g = v.gain(0, v.out), e = pts(g.gain, T + t, [[0, 0], [0.02, 0.8], [d * 0.8, 0.6], [d, 0]]); for (const dm of [0, 4, 7]) vox(v, T + t, e + 0.01, mtof(m + dm) * p, [[700, 6, 1], [1150, 7, 0.5], [2600, 9, 0.2]], v.gain(0.4, g)); } } });
  // Zipline: a shimmer and a descending pluck
  def('sting_zipcaster', { gain: 0.3, max: 2, jitter: 0, reverb: 0.35, build(v, p) { const T = v.t, g = v.gain(0, v.out); pts(g.gain, T, [[0, 0], [0.15, 0.12], [0.35, 0]]); for (const f of [2637, 2794, 3520]) v.osc('sine', f * p, T, T + 0.36, g); [[0.1, 81], [0.2, 76], [0.3, 69]].forEach(([t, m]) => v.tone({ t, type: 'triangle', f: mtof(m) * p, a: 0.002, d: 0.18, peak: 0.4 })); } });
  // Crab Rig: two mech horn honks and a servo
  def('sting_crab', { gain: 0.32, max: 2, jitter: 0, reverb: 0.15, build(v, p) { for (const t of [0, 0.18]) { const out = v.filter('lowpass', 1600, 2, v.out); v.tone({ t, type: 'sawtooth', f: 233 * p, a: 0.01, h: 0.1, d: 0.05, peak: 0.25, to: out }); v.tone({ t, type: 'sawtooth', f: 294 * p, a: 0.01, h: 0.1, d: 0.05, peak: 0.2, to: out }); } clank(v, 0.36, 480, 0.3, 0.15, p); } });
}
