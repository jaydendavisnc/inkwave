// INKWAVE — the sub and special cue director (the sfx-cues job). Every sub and special can be followed by ear:
//
//   G.cues.sub(kind, phase, o)       a sub's one-shot at a phase: 'throw' · 'land' · 'warn' · 'boom' · 'end' · 'beep' ·
//                                    'use' (sounds per kind: SUB_CUE). o: { owner, team, at, vol, pitch, radius, target }
//   G.cues.one(name, o)              any cue one-shot with the mix rules (o.kind: throw | land | warn | boom | end | start)
//   G.cues.update(dt, { quiet })     per frame (main.js): the loops — gathered from the world, capped, reconciled
//   G.cues.clear()                   stop every cue loop (a match change does this by itself)
//
// Loops: every moving / live thing (a thrown sub in the air, a rolling Splat Bomb, a Skitter Bomb, a twister, a
// Tempest cloud, a Kraken, a Crab Rig, an Ink Jet …) holds exactly ONE positional loop per channel, keyed by the object,
// following it every frame. Each frame the director gathers what the world holds now (Projectiles.bombs / clouds,
// SubSystem.items, the kit subs' lists, SpecialSystem.world, the actors' running specials) and reconciles its loops
// against that: whatever is gone — dead, cleared, a quit, a new match — loses its loop that same frame, so nothing
// orphans. Loops run through the engine's loop bus, so a pause (audio.pauseLoops) hushes them with everything else.
//
// Mix rules:
//   - relation to you: own (you threw / started it) · ally (your team) · foe · none (the menus' backdrop match).
//     Your own throws and starts come from you (no position); your own transformation specials' body loops too.
//   - gains (MIX): yours and your team's ~3 dB under the enemy's (your own throws and starts, heard from you, mixed
//     further down so they land ~3 dB under an enemy's from across the lane), the backdrop's ~0.4. Warnings carry
//     params.foe (1 = the harsher, brighter timbre for the enemy's) and, for the enemy's, a boost up to ×1.55 the closer
//     you are to its blast (and when it's after you). An enemy warning with you close to it dips the music a little (a
//     big one — Slam, Strike, Cheer Orb, Howl Box, Stamp, Kraken dive — a little more), so it stands out.
//   - sfx-loud (2026-10-01, "still too quiet … they all need to be louder"): every cue rides the engine's cue bus —
//     +6 dB at the Cues slider's 100 % (settings `cues`, 0 … 150 %) and a gentle compressor; every thrown sub's flight
//     glides with its arc (_fly / _glide); the enemy's specials get a launch alert, a "you're in it" alarm and a sting
//     (_threats / _shots / _sting).
//   - audible in a fight (the realflow measurement, tools/botlab/sfx/realflow.cjs): cues carry further than ordinary
//     sounds (REF: the panner's reference distance, 5–6 m instead of 3; alerts 10, stings 12), and LEVEL sets each one
//     against your own weapon fire in a real match (dB per sound): the enemy's throws and landings ≥ 0 dB over it, its
//     devices' and specials' loops ~+2, its warnings, alerts and alarms +8 … +12.
//   - your teammates' subs (2026-10-01, the user: "dont give throw/warning sounds of teammates bombs, but do play their
//     explosion sound a bit fainter than normal"): a teammate's thrown or placed sub — a Bomb Barrage's bombs too — makes
//     no throw, flight, landing / arming, fuse, windup or warning sound for you (MIX[…].allySub 0), its blast plays at
//     0.6 × the enemy's (MIX.boom.allySub / foe, applied after the cue compressor: audio.js cuePost — as you hear it),
//     and its devices' own loops (a sprinkler spinning, a curtain dripping, a
//     beacon's hum, a murk cloud's hiss), ends and uses stay as a teammate's. Specials, their stings and alerts are
//     unchanged. (Cue calls from a sub carry o.sub: sub() sets it; kits' own one() calls and the loops below pass it.)
//   - caps: at most MAX.move moving loops and MAX.warn warning loops at once (the backdrop: fewer); the rest wait,
//     ranked warnings first, the enemy's first, then by closeness (distance to the listener, and to you for threats).
//   - Doppler-ish: each positional loop's pitch × 1 / (1 − v_r / 55) (clamped 0.84 … 1.22) and level × (1 + v_r / 40)
//     (0.85 … 1.25), v_r = its own speed toward the listener (the camera), smoothed. Only the source's motion counts:
//     swinging the camera round (the listener moving) never makes a standing sprinkler warble.
import { G, on, clamp } from '../core/ctx.js';
import { SUBS, SPECIALS, PLAYER } from '../config.js';
import { SUB_KITS } from '../game/kits/registry.js';
import { specialDangers } from '../game/botSpecials.js';
import { Hit } from '../game/physics.js';

export const MAX = { move: 8, warn: 5, moveMenu: 3, warnMenu: 2 };
const C_EFF = 55;                // m/s: the "speed of sound" the Doppler factor uses (exaggerated so a pass-by reads)
const RANGE = { move: 42, warn: 55, one: { throw: 40, land: 40, warn: 55, boom: Infinity, end: 40, start: 45, beep: 32, use: 30, alert: 70, sting: Infinity } };
// gains per cue class and relation to you (sfx-loud, 2026-10-01: yours and your team's sit ~3 dB under the enemy's —
// as you hear them: your own throws and starts come from you, not from across the lane, so they're mixed down to land
// ~3 dB under an enemy's thrown 7 m in front of you (they stay as loud as they were; the enemy's went up); the launch
// alerts are the enemy's only, the stings the enemy's and — softer, −6 dB — your team's)
// allySub: a teammate's SUB (see the header: no throw / flight / landing / fuse / warning sounds; its blast at 0.6 × the
// enemy's — 0.45 vs 0.75, −4.4 dB; its devices' loops, ends and uses as a teammate's). fly: a thrown thing in the air
// (the move loop's gains, its own row so a teammate's flight can be silent)
export const MIX = {
  throw: { own: 0.38, ally: 0.87, foe: 1.23, none: 0.45, allySub: 0 },
  start: { own: 0.45, ally: 0.78, foe: 1.1, none: 0.5, allySub: 0 },
  land: { own: 0.78, ally: 0.78, foe: 1.1, none: 0.45, allySub: 0 },
  beep: { own: 0.85, ally: 0.85, foe: 1.2, none: 0.4, allySub: 0 },
  use: { own: 0.8, ally: 0.8, foe: 0.6, none: 0.4, allySub: 0.8 },
  boom: { own: 0.56, ally: 0.54, foe: 0.75, none: 0.5, allySub: 0.45 },   // (blasts were loud already: +3.5 dB net over the cue bus)
  end: { own: 0.64, ally: 0.64, foe: 0.9, none: 0.45, allySub: 0.64 },
  move: { own: 0.74, ally: 0.74, foe: 1.05, none: 0.45, allySub: 0.74 },
  fly: { own: 0.74, ally: 0.74, foe: 1.05, none: 0.45, allySub: 0 },
  warn: { own: 0.91, ally: 0.91, foe: 1.29, none: 0.35, allySub: 0 },
  alert: { own: 0, ally: 0, foe: 1.2, none: 0, allySub: 0 },
  sting: { own: 0, ally: 0.5, foe: 1, none: 0, allySub: 0 },
};
// the panner's reference distance per cue class (m): full level inside it, the inverse roll-off beyond. Ordinary sounds
// use 3; cues carry further so a throw 10 m off, a fuse 6 m off, a jet across the lane are heard over a fight and the
// music (blasts keep their own: they're loud already). A launch alert carries across the lane; a sting across the map
// (quieter the further off, never cut).
export const REF = { throw: 5, start: 5, land: 5, beep: 5, use: 5, end: 5, move: 5, warn: 6, alert: 10, sting: 12, danger: 10 };
// per-sound level (dB) on top of the mix: measured in a real match from the local player's view (realflow.cjs) —
// each cue against the weapon fire and the music around it, lifted where it was buried, trimmed where it was harsh.
// (sfx-loud: on top of it all, every cue runs through the engine's cue bus — +6 dB at the Cues slider's 100 % —
// audio.js CUE_BOOST)
export const LEVEL = {
  bomb_throw: 2, throw_burst: 9, throw_seeker: 10.5, throw_scan: 7, throw_sprinkler: 6, throw_shaker: 15, throw_waddle: 8, torpedo_throw: 2, tracer_zap: 3,
  boomerang_throw: 10, bomb_beep: 4.5, seeker_land: 7.5, waddle_land: 2.5, waddle_beep: 10, boomerang_tick: 3, orb_land: -4.5, torpedo_transform: 3,
  fuse_sticky: -4.5, lock_tone: 5.5, seeker_run: 5, shaker_rattle: 7, torpedo_whirr: 6, boomerang_whirr: 10, boomerang_orbit: 4, slam_warn: 4.5,
  strike_mark: -2, orb_fuse: -1.5, orb_fly: 4.5, twister: 5, beam_lock: 9, curtain_drip: 8, tracer_hum: 4, strike_arm: 11, zooka_arm: 1.5,
  shell_whistle: 5, kraken_dive: 4, storm_rain: 3, mine_trip: 1.5, hunt_alarm: 5, waddle_walk: 4, stamp_fly: -1.5, strike_whistle: 2,
  crab_boot: 4.5, crab_move: 2, crab_roll: 2, zip_whizz: 3, zip_aura: 2, wail_hold: 4, strike_aim: 3, barrage_drum: 1.5, shield_hum: 2,
  kraken_move: -4, tornado: -3, mist_hiss: -4,
  sonar_blip: 6, blower_start: 1, jet_ignite: 1, kraken_off: 3, storm_fade: 2, vortex_end: 6, jet_boost: 2,
  // sfx-loud (measured in realflow.cjs: the enemy's warnings +8 … +12 dB over your weapon fire, the flights ~+4)
  sub_flight: 2.5, danger: 0, alert_slam: -4, alert_strike: -2, alert_kraken: -1.5, alert_storm: -4.5, alert_twister: 4.5, alert_wail: 2,
};
// sub_flight's level per voice (dB on top of LEVEL.sub_flight: each kind's flight lands ~+4 dB over your weapon fire)
export const FLIGHT_DB = { bomb: -7.5, sticky: -4.5, burst: 0, seeker: 1, scan: -4, curtain: -7, sprinkler: 2.5, mist: -4.5, waddle: -3.5, storm: -6 };
// the alarm's level per voice (dB)
export const DANGER_DB = { slam: 4.5, kraken: 2, orb: -1.5, stamp: 3 };
const lv = (name) => { const d = LEVEL[name]; return d ? Math.pow(10, d / 20) : 1; };
export const SUB_CUE = {
  bomb: { throw: ['bomb_throw', 0.8], land: ['bomb_beep', 0.7], boom: ['bomb_explode', 1] },
  sticky: { throw: ['throw_sticky', 0.9], land: ['sticky_stick', 0.9], boom: ['sticky_explode', 1] },
  burst: { throw: ['throw_burst', 0.9], boom: ['pellet_pop', 1] },
  seeker: { throw: ['throw_seeker', 0.9], land: ['seeker_land', 0.9], warn: ['seeker_prime', 1], boom: ['seeker_explode', 1] },
  scan: { throw: ['throw_scan', 0.9], boom: ['scan_burst', 0.9] },
  curtain: { throw: ['throw_curtain', 0.9], land: ['curtain_up', 0.9], end: ['curtain_down', 0.9] },
  sprinkler: { throw: ['throw_sprinkler', 0.9], land: ['sprinkler_stick', 0.9], end: ['sprinkler_break', 0.9] },
  mine: { throw: ['place_mine', 0.8], warn: ['mine_trip', 1], boom: ['mine_explode', 0.9] },
  beacon: { throw: ['place_beacon', 0.85], end: ['beacon_break', 0.9], use: ['beacon_use', 0.8] },
  mist: { throw: ['throw_mist', 0.9], boom: ['mist_burst', 0.9] },
  shaker: { throw: ['throw_shaker', 0.9], land: ['shaker_land', 0.9], boom: ['shaker_blast', 0.95] },
  waddle: { throw: ['throw_waddle', 0.9], beep: ['waddle_beep', 0.8], warn: ['waddle_prime', 1], boom: ['waddle_explode', 1], end: ['waddle_pop', 0.9] },
  torpedo: { throw: ['torpedo_throw', 1], boom: ['torpedo_burst', 1] },
  boomerang: { beep: ['boomerang_tick', 0.8], boom: ['boomerang_blast', 1] },
  smash: { end: ['sub_smash', 0.9] },   // a device the Mega Stamp's guard smashed before it went off
};
// a special's start (on top of the shared special_activate); the ones missing here start with their own sound already
export const SPECIAL_START = { slam: 'slam_leap', storm: 'storm_throw', barrage: 'barrage_start', strike: 'strike_arm', zooka: 'zooka_arm', wail: 'wail_up',
  blower: 'blower_start', jetpack: 'jet_ignite', stamp: 'stamp_start', zipcaster: 'zip_cloak', crab: 'crab_boot' };
// ---- the flight of a thrown thing (sfx-loud: "a throw sound that changes pitch based on how long it's been thrown"):
// its pitch follows the arc — up as it climbs (to +FLY_UP semitones at the top), then the falling "incoming" whistle
// down to FLY_DOWN at the landing. On a ballistic arc both halves are linear in the time since the throw: climbing,
// 1 − vy / vy₀ (vy₀ its vertical speed when thrown); falling, |vy| / √(vy² + 2 g h) — its share of the speed it will
// land with (h: its height over the floor below). Every thrown sub in the air plays sub_flight in its own voice
// (params.kind: sfx-alerts.js FLIGHT); the ones with a loop of their own in the air glide that instead (the Torpedo's
// whirr, the Shaker's rattle, the Cheer Orb's flight), and the straight flyers glide by distance (the Tracer's hum
// falls over its range; the Boomerang's whirr falls going out, rises coming home).
export const FLY_UP = 4, FLY_DOWN = -9;
// the sub_flight voice per thrown kind (the Bomb Barrage's bombs are ordinary ones: theirs)
export const FLIGHT_KIND = { bomb: 'bomb', sticky: 'sticky', burst: 'burst', seeker: 'seeker', scan: 'scan', curtain: 'curtain', sprinkler: 'sprinkler', mist: 'mist', waddle: 'waddle', storm: 'storm' };
// thrown (a flight sound) · placed (none: a Lurk Mine / Hop Beacon is set down at your feet)
export const THROWN_SUBS = ['bomb', 'sticky', 'burst', 'seeker', 'scan', 'curtain', 'sprinkler', 'mist', 'shaker', 'waddle', 'torpedo', 'tracer', 'boomerang'];
export const PLACED_SUBS = ['mine', 'beacon'];

// ---- the enemy's specials: launch alerts, the "you're in it" alarm (sfx-loud: "a lot of warning special sounds, like
// if a vortex or cheer bomb is coming"). Where each threat is comes from the bots' danger model (botSpecials.js
// specialDangers(): every special's area — a disc or a line, where a thrown one will land, the time until it hurts),
// so what the bots dodge is what you hear. Per area of the enemy's:
//   alert_<kind>   once, the moment it's fired / aimed: at its target spot (where it will land) — the Vortex Strike and
//                  the Cheer Orb for anyone in earshot, the others only when it's coming your way (you're in its area
//                  or within ALERT_PAD of it); a Tidal Slam's at the landing spot as it leaps; a Bomb Barrage's (no
//                  target) at the thrower as it starts
//   danger         while you stand in it, until it lands: params.kind its voice, params.k its urgency (1 − the time
//                  left over ALARM_T: faster, higher, a frantic edge at the end). The Howl Box's is its own (beam_lock).
// area src (botSpecials) → the alarm's voice; null: none (its own cues do it: a vortex already down, a Crab Rig's gun,
// a Mega Stamp's swings, a kraken's reach, Bubble Guard, the barrage's bombs' fuses)
function alarmOf(d) {
  switch (d.src) {
    case 'strike': return d.tIn > 0.02 ? 'strike' : null;   // (the missile; the vortex once down is its own loud loop)
    case 'booyah': return 'orb';
    case 'slam': return 'slam';
    case 'storm': return 'storm';
    case 'zooka': return 'zooka';
    // (a mortar shell / a thrown stamp: Cues._shots — its whole arc, not only where it lands: one thrown at you hits you)
    case 'kraken': return d.imm ? null : 'kraken';
    case 'jetpack': return 'jet';
    case 'wail': return 'wail';
  }
  return null;
}
// the alert's sound per kind (a Zooka's is the twister's)
export const ALERT_OF = { strike: 'alert_strike', orb: 'alert_orb', slam: 'alert_slam', storm: 'alert_storm', zooka: 'alert_twister', shell: 'alert_shell',
  stamp: 'alert_stamp', wail: 'alert_wail', kraken: 'alert_kraken', jet: 'alert_jet' };
// s over which the alarm climbs from calm to frantic (its k = 1 − time left / this)
export const ALARM_T = { strike: 2.2, orb: 2.6, slam: 1.1, storm: 1.4, zooka: 1, shell: 1.2, stamp: 1.2, kraken: 1, jet: 0.8 };
const ALERT_PAD = { storm: 4, zooka: 1.5, shell: 3, stamp: 3, kraken: 3, jet: 2, wail: 1.5, slam: 4 };
const ALERT_ALL = { strike: 120, orb: 60 };
const ALERT_NEAR = 7;   // (heard by anyone this near its landing spot, in its way or not)
// how deep (m) a point is inside a danger area (0: outside), its edge widened by pad (botSpecials.js inside(), now)
function depthIn(d, x, y, z, pad = 0) {
  if (d.shape === 0) {
    if (y < d.yLo - pad || y > d.yHi + pad) return 0;
    const h = Math.hypot(x - d.x, z - d.z), r = d.r + pad;
    return h < r ? r - h + 0.01 : 0;
  }
  if (d.d3) {
    const vx = x - d.x, vy = y + 0.8 - d.y, vz = z - d.z, al = vx * d.ux + vy * d.uy + vz * d.uz;
    if (al < -d.back - pad || al > d.len / Math.max(0.3, Math.hypot(d.ux, d.uz)) + 0.5 + pad) return 0;
    const pr = Math.hypot(vx - d.ux * al, vy - d.uy * al, vz - d.uz * al), r = d.r + pad;
    return pr < r ? r - pr + 0.01 : 0;
  }
  if (y < d.yLo - pad || y > d.yHi + pad) return 0;
  const vx = x - d.x, vz = z - d.z, al = vx * d.dx + vz * d.dz;
  if (al < -d.back - pad || al > d.len + 0.3 + pad) return 0;
  const pr = Math.abs(vx * d.dz - vz * d.dx), r = d.r + pad;
  return pr < r ? r - pr + 0.01 : 0;
}
// s until the area hurts where you stand (a line: when its front gets to you)
const tInAt = (d, x, z) => (d.speed > 0 ? d.delay + Math.max(0, (x - d.x) * d.dx + (z - d.z) * d.dz) / d.speed : d.tIn);

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const hs = (v) => (v ? Math.hypot(v.x, v.z) : 0);
const _ids = new WeakMap(); let _nid = 0;
const idOf = (o) => { let n = _ids.get(o); if (!n) _ids.set(o, (n = ++_nid)); return n; };

export class Cues {
  constructor() {
    this.slots = new Map();      // key → { key, sound, h, obj, ch, warn, rel, twoD, born, vol, pitch, dop, params, pos }
    this.tracks = new Map();     // key → { x, y, z, vx, vy, vz, ok } (the emitter's smoothed velocity, for the Doppler)
    this.want = [];
    this._keep = new Set();
    this._m = null;
    this._ccd = new WeakMap();   // Crab Rig specials → their mortar cooldown last frame (the reload cue)
    this._tracerEnd = new WeakMap();
    this._vanish = new Map();    // world objects whose disappearance has a sound (the vortex spinning down)
    this._sonarT = 0; this._duckT = -9;
    this.stats = { made: 0, stopped: 0, capped: 0, maxMove: 0, maxWarn: 0 };
    // sfx-loud: the flights (each thrown thing's vertical speed when first heard), the alerts already given (per danger
    // area source), the stings (per actor: the last one, so a special's use + start is one sting), the alarms
    this._fl = new WeakMap(); this._gl = { arc: 0, st: 0, q: 1 };
    this._alerted = new WeakSet(); this._stung = new WeakMap(); this._stormAlert = new WeakMap(); this._jetT = -9;
    this._thr = new Map(); this._dk = {}; this._inT = {}; this._pvT = 0; this._slamAt = new WeakMap(); this._arcs = new WeakMap();
    this.log = null;   // (tests: [{ t, name, kind, rel }] of the alerts / stings played, when an array)
    on('special:start', ({ actor, id }) => { this._sting(actor, id); this._start(actor, id); });
    on('special:use', ({ actor, id }) => { this._sting(actor, id); if (id === 'slam' || id === 'storm') this._start(actor, id); });
    on('special:end', ({ actor, id, reason }) => { if (id === 'kraken' && actor?.alive && reason !== 'splat') this.one('kraken_off', { at: actor.pos, owner: actor, kind: 'end' }); });
    on('storm:end', ({ pos, team, actor }) => this.one('storm_fade', { at: pos, team, owner: actor, kind: 'end', range: 50 }));
  }

  // ------------------------------------------------------------------------------------------------ mix helpers
  _me() { const m = G.match; return m && !m.attract ? m.local || null : null; }
  rel(owner, team) {
    const me = this._me();
    if (!me) return 'none';
    if (owner && owner === me) return 'own';
    return (team ?? owner?.team) === me.team ? 'ally' : 'foe';
  }
  // a teammate's sub (not yours, not the enemy's): the allySub mix — kits ask before an ordinary arming sound of their own
  allySub(owner, team) { return this.rel(owner, team ?? owner?.team) === 'ally'; }
  // how close YOU are to a threat's blast (0 … 1): full inside ~1.4 m of its middle, fading out ~2.2 × its radius away
  close(pos, R = 3) {
    const me = this._me();
    if (!me || !me.alive || !pos) return 0;
    const d = dist(me.pos, pos);
    return clamp((2.2 * R + 2 - d) / (1.6 * R + 2), 0, 1);
  }
  boost(pos, R, target) { return 1 + 0.35 * this.close(pos, R) + (target && target === this._me() ? 0.2 : 0); }

  // ------------------------------------------------------------------------------------------------ one-shots
  one(name, o = {}) {
    const A = G.audio;
    if (!A || !A.ctx || !name) return null;
    const kind = o.kind || 'boom', rel = this.rel(o.owner, o.team ?? o.owner?.team);
    let pos = o.at;
    if ((kind === 'throw' || kind === 'start') && rel === 'own') pos = undefined;   // your own throw / start comes from you
    if (pos && A.L) { const r = o.range ?? RANGE.one[kind] ?? 40; if (r !== Infinity && dist(A.L, pos) > r) return null; }
    const row = MIX[kind] || MIX.boom, ar = o.sub && rel === 'ally';   // (a teammate's sub: allySub)
    let g = (o.vol ?? 1) * row[ar ? 'allySub' : rel], post = 1;
    // a teammate's blast: mixed as the enemy's into the cue bus's twin and scaled by allySub / foe AFTER its compressor
    // (audio.js cuePost) — heard at that share of the enemy's near or far, not evened out by the compression
    if (ar && kind === 'boom' && g > 0) { post = row.allySub / row.foe; g = (o.vol ?? 1) * row.foe; }
    if (!(g > 0)) return null;
    if ((kind === 'warn' || kind === 'beep' || kind === 'alert') && rel === 'foe') {
      g *= this.boost(o.at, o.radius, o.target);
      if ((kind === 'warn' || kind === 'alert') && this.close(o.at, o.radius) > 0.35) this._dip(kind === 'alert' ? 0.35 : 0.25);
    }
    g = Math.min(g, 1.9);   // (never more than ~2× its calibrated level, boosts and all)
    if (this.log && (kind === 'alert' || kind === 'sting')) this.log.push({ t: G.time, name, kind, rel });
    return A.play(name, { pos, volume: g * lv(name), pitch: o.pitch, ref: pos ? o.ref ?? REF[kind] : undefined, cue: true, post });
  }
  sub(kind, phase, o = {}) {
    const c = SUB_CUE[kind]?.[phase] || (phase === 'end' ? SUB_CUE.smash.end : null);
    if (!c) return null;
    const k = phase === 'use' ? 'use' : phase === 'beep' ? 'beep' : phase;
    return this.one(c[0], { ...o, kind: k, sub: true, vol: (o.vol ?? 1) * c[1], radius: o.radius ?? SUBS[kind]?.radius });
  }
  _start(a, id) {
    if (!a) return;
    const kind = SPECIALS[id]?.kind || id, name = SPECIAL_START[kind];
    if (!name) return;
    this.one(name, { at: a.pos, owner: a, kind: 'start' });
  }
  // someone popped a special: its sting (the enemy's full, quieter the further off but heard across the map; your
  // team's softer; yours none — you hear your own activation). A Bomb Barrage (no target spot) alerts from its thrower.
  _sting(a, id) {
    if (!a || !SPECIALS[id]) return;
    const kind = SPECIALS[id].kind || id, rel = this.rel(a, a.team), last = this._stung.get(a);
    if (rel === 'own' || rel === 'none' || (last && last.id === id && G.time - last.t < 1)) return;
    this._stung.set(a, { id, t: G.time });
    this.one('sting_' + kind, { at: a.pos, owner: a, kind: 'sting' });
    if (kind === 'barrage' && rel === 'foe') this.one('alert_barrage', { at: a.pos, owner: a, kind: 'alert', range: 60 });
  }
  // (the audio settings' Cues slider: a taste of the cue level as you drag it)
  preview() {
    const A = G.audio, now = performance.now();
    if (!A || !A.ctx || now - this._pvT < 300) return;
    this._pvT = now;
    A.play('bomb_beep', { volume: MIX.beep.foe * lv('bomb_beep'), cue: true });
  }

  // ------------------------------------------------------------------------------------------------ loops
  // want a loop this frame: one per (object, channel)
  _want(obj, ch, sound, o) {
    const w = this.want[this._n] || (this.want[this._n] = {});
    this._n++;
    w.key = idOf(obj) + ':' + ch; w.obj = obj; w.ch = ch; w.sound = sound;
    w.pos = o.pos || null; w.twoD = !!o.twoD; w.team = o.team ?? o.owner?.team; w.owner = o.owner || null;
    w.warn = !!o.warn; w.vol = o.vol ?? 1; w.pitch = o.pitch ?? 1; w.params = o.params || null;
    w.radius = o.radius || 3; w.target = o.target || null; w.big = !!o.big; w.range = o.range || (w.warn ? RANGE.warn : RANGE.move);
    w.prio = o.prio || 1; w.ref = o.ref || 0; w.glide = o.glide ?? null;
    w.sub = !!o.sub; w.fly = !!o.fly;   // (a sub's loop: a teammate's takes the allySub mix; a flight: the fly row)
    return w;
  }

  update(dt, opts = {}) {
    const A = G.audio;
    if (!A || !A.ctx) return;
    if (G.match !== this._m) { this.clear(); this._m = G.match; }
    this._n = 0;
    const m = G.match;
    // (quiet: the online lobby's set covers the backdrop match — nothing of it is simulated or heard; and once a round
    // is over — time's up, the judge, the results — its devices go silent with it)
    if (m && !opts.quiet && (m.attract || m.state === 'playing' || m.state === 'intro')) this._gather(m, dt);
    this.want.length = this._n;
    this._reconcile(dt, m);
    this._vanished(m);
    this._sonar(dt);
  }

  // what the world holds now → this.want
  _gather(m, dt) {
    const me = this._me(), P = G.projectiles, S = G.subs, SP = G.specials, K = SUB_KITS;
    // ---- Splat Bombs (and the Ink Tempest's ball) — weapons.js
    for (const b of P?.bombs || []) {
      const o = { pos: b.pos, team: b.team, owner: b.owner };
      if (b.kind === 'storm' || !(b.fuse >= 0)) { this._fly(b, b.kind === 'storm' ? 'storm' : 'bomb', o, b.kind === 'storm' ? 1 : 0.9); continue; }
      this._want(b, 'fuse', 'fuse_bomb', { ...o, sub: true, warn: true, radius: SUBS.bomb.radius,
        params: { k: clamp(1 - b.fuse / SUBS.bomb.fuse, 0, 1), roll: clamp((hs(b.vel) - 0.3) / 3.5, 0, 1) } });
    }
    // ---- Ink Tempest clouds
    for (const c of P?.clouds || []) {
      const fade = clamp((c.dur - c.t) / 0.6, 0, 1);
      this._want(c, 'rain', 'storm_rain', { pos: c.group.position, team: c.team, owner: c.owner, vol: 0.6 * fade, radius: SPECIALS.storm.radius, range: 50, prio: 1.5 });
    }
    // ---- the built-in subs — subs.js
    for (const it of S?.items || []) {
      const o = { pos: it.pos, team: it.team, owner: it.owner, sub: true };
      switch (it.state) {
        case 'fly': this._fly(it, FLIGHT_KIND[it.kind] || 'bomb', o, 0.85); break;
        case 'stuck': this._want(it, 'fuse', 'fuse_sticky', { ...o, warn: true, radius: it.sub.radius, params: { k: clamp(it.t / (it.fuse || 1), 0, 1) } }); break;
        case 'run': this._want(it, 'run', 'seeker_run', { ...o, warn: true, radius: it.sub.radius, target: it.target,
          params: { speed: 1, dash: it.dash ? 1 : 0, hunt: me && it.target === me ? 1 : 0 } }); break;
        case 'mist': this._want(it, 'mist', 'mist_hiss', { ...o, radius: it.sub.radius, range: 32, params: { life: 1 - clamp((it.t - (it.sub.mistTime - 0.8)) / 0.8, 0, 1) } }); break;
        case 'curtain': this._want(it, 'curtain', 'curtain_drip', { ...o, range: 26, params: { life: clamp(it.hp / it.sub.hp, 0, 1) } }); break;
        case 'spray': this._want(it, 'spray', 'sprinkler_spin', { ...o, range: 26, params: { fast: it.t < it.sub.sprayFade ? 1 : 0 } }); break;
        case 'beacon': this._want(it, 'beacon', 'beacon_hum', { ...o, range: 16 }); break;
        // (the Lurk Mine is silent while it lurks — hidden; tripped, it plays mine_trip; a Skitter Bomb winding up plays
        // seeker_prime — one-shots, SUB_CUE …warn; the Echo Orb's cloud is a one-shot)
      }
    }
    // ---- kit subs — kits/*.js
    for (const it of K.shaker?.items || []) {
      if (it.state === 'dead') continue;
      const k = it.fuse >= 0 ? 1 - it.fuse / it.sub.fuse : it.next > 0 ? 1 - it.next / it.sub.gap : 0;
      // (a warning from the throw on: its first blast is only half a second after it lands; in the air — thrown, or
      // hopping between blasts — its rattle glides along the arc)
      const gl = !it.ground && !it.armed ? this._glide(it, it.pos, it.vel) : null;
      this._want(it, 'rattle', 'shaker_rattle', { pos: it.pos, team: it.team, owner: it.owner, sub: true, warn: true, radius: it.sub.radius,
        pitch: gl ? gl.q : 1, glide: gl ? gl.st : null, params: { k: clamp(k, 0, 1), armed: it.armed ? 1 : 0 } });
    }
    for (const it of K.waddle?.items || []) {
      const o = { pos: it.pos, team: it.team, owner: it.owner, sub: true };
      if (it.state === 'fly') this._fly(it, 'waddle', o, 0.85);
      else if (it.state === 'wake' || it.state === 'walk') {
        const T = it.target && it.target.alive ? it.target : null;
        const cl = T ? clamp(1 - Math.hypot(T.pos.x - it.pos.x, T.pos.z - it.pos.z) / it.sub.senseRadius, 0, 1) : 0;
        this._want(it, 'walk', 'waddle_walk', { ...o, warn: true, radius: it.sub.radius, target: T, vol: 0.9, pitch: 1 + 0.45 * cl });
        if (me && T === me) this._want(it, 'hunt', 'hunt_alarm', { ...o, warn: true, radius: it.sub.radius, target: T, params: { close: cl } });
      }
    }
    for (const t of K.torpedo?._list || []) {
      if (t.state === 'dead') continue;
      const s = t.sub, o = { pos: t.pos, team: t.team, owner: t.owner, sub: true };
      const lk = t.state === 'unfold' || t.state === 'launch';
      // (thrown, before it locks on: its whirr glides along the arc)
      const gl = t.state === 'fly' && t.vel ? this._glide(t, t.pos, t.vel) : null;
      const p = t.state === 'launch' ? 1 + t.speed / 10 : t.state === 'unfold' ? 0.8 + 0.6 * clamp(t.t / s.unfoldTime, 0, 1) : 0.8 * (gl ? gl.q : 1);
      this._want(t, 'whirr', 'torpedo_whirr', { ...o, warn: lk, fly: !lk, radius: s.radius, target: t.target, vol: lk ? 0.85 : gl ? 0.75 : 0.5, pitch: p, glide: gl ? gl.st : null });
      if (lk && me && t.target === me) {
        const k = t.state === 'unfold' ? 0.3 * clamp(t.t / s.unfoldTime, 0, 1) : 0.3 + 0.7 * clamp(1 - dist(t.pos, me.pos) / s.lockRange, 0, 1);
        this._want(t, 'lock', 'lock_tone', { ...o, warn: true, radius: s.radius, target: me, params: { k } });
      }
    }
    for (const b of K.tracer?._bolts || []) {
      const o = { team: b.team, owner: b.owner, sub: true, fly: true };
      if (b.state === 'fly') {
        // (a straight, fast bolt: its hum falls from +3 to −6 semitones over its range)
        const st = 3 - 9 * clamp((b.travel || 0) / (b.sub.range || 30), 0, 1);
        this._want(b, 'hum', 'tracer_hum', { ...o, pos: b.pos, vol: 0.6, pitch: 1.15 * Math.pow(2, st / 12), glide: st });
      }
      else if (b.pts?.length) {
        let t0 = this._tracerEnd.get(b); if (t0 == null) this._tracerEnd.set(b, (t0 = G.time));
        const k = clamp(1 - (G.time - t0) / (b.sub.trailLife || 1), 0, 1);
        if (k > 0.02) this._want(b, 'hum', 'tracer_hum', { ...o, pos: b.pts[Math.floor(b.pts.length / 2)].p, vol: 0.45 * k, pitch: 0.85 + 0.2 * k });
      }
    }
    for (const it of K.boomerang?._items || []) {
      const o = { pos: it.pos, team: it.team, owner: it.owner, radius: it.sub.radius, sub: true };
      switch (it.state) {
        // (going out it slows to a stop: its whirr falls +2 → −4 semitones; coming home it climbs back −4 → +3)
        case 'out': { const st = 2 - 6 * clamp(it.t / (it.outT || 0.6), 0, 1); this._want(it, 'spin', 'boomerang_whirr', { ...o, fly: true, vol: 0.7, pitch: 1.15 * Math.pow(2, st / 12), glide: st }); break; }
        case 'hover': this._want(it, 'spin', 'boomerang_whirr', { ...o, vol: 0.75, pitch: 1.35 }); break;
        case 'back': { const st = -4 + 7 * clamp(it.t / 1.1, 0, 1); this._want(it, 'spin', 'boomerang_whirr', { ...o, fly: true, vol: 0.7, pitch: 1.15 * Math.pow(2, st / 12), glide: st }); break; }
        case 'orbit': this._want(it, 'spin', 'boomerang_orbit', { ...o, vol: 0.7, pitch: 1 }); break;
        case 'armed': this._want(it, 'spin', 'boomerang_whirr', { ...o, warn: true, radius: it.sub.hitRadius, target: it.victim, vol: 0.85, pitch: 1.6 }); break;
      }
    }
    // ---- specials' world objects — specials.js
    const vanish = this._vanishNow || (this._vanishNow = new Set()); vanish.clear();
    for (const w of SP?.world || []) {
      const o = { team: w.team, owner: w.owner };
      switch (w.kind) {
        case 'missile': this._want(w, 'mark', 'strike_mark', { ...o, pos: w.to, warn: true, big: true, radius: SPECIALS.strike.radius, range: 70, prio: 1.5,
          params: { k: clamp(w.t / w.flight, 0, 1) } }); break;
        case 'tornado': {
          const d = SPECIALS.strike, grow = Math.min(1, w.t / 0.4), fade = clamp((w.dur - w.t) / 0.6, 0, 1);
          this._want(w, 'vortex', 'tornado', { ...o, pos: w.pos, radius: d.radius, range: 50, vol: 0.8 * fade, pitch: 1 + 0.2 * grow, prio: 1.5 });
          vanish.add(w); this._vanish.set(w, { name: 'vortex_end', t: w.t, dur: w.dur, pos: w.pos, owner: w.owner, team: w.team });
          break;
        }
        case 'twister': this._want(w, 'tw', 'twister', { ...o, pos: w.pos, warn: true, radius: 1.2, vol: 1 }); break;
        case 'speaker':
          if (w.phase === 'charge') {
            // (the Howl Box's "you're in it" alarm: carries like the others' — REF.danger)
            if (me && this.rel(w.owner, w.team) === 'foe' && this._inBeam(w, me)) this._want(w, 'lock', 'beam_lock', { ...o, pos: w.pos, warn: true, big: true, radius: 3, target: me, ref: REF.danger, params: { k: clamp(w.t / SPECIALS.wail.charge, 0, 1) } });
          } else if (w.phase === 'blast') this._want(w, 'blast', 'wail_blast', { ...o, pos: w.pos, warn: true, radius: 3, range: 70, vol: 1 });
          break;
        case 'bubble':
          if (!w.held && !w.dead) {
            const c = clamp((w.charge || 0) / SPECIALS.blower.popDamage, 0, 1);
            this._want(w, 'drift', 'bubble_drift', { ...o, pos: w.pos, warn: c > 0.25, radius: w.r * SPECIALS.blower.blastMul, range: 34, params: { charge: c } });
          }
          break;
        case 'stamp': this._want(w, 'fly', 'stamp_fly', { ...o, pos: w.pos, warn: true, big: true, radius: SPECIALS.stamp.throwRadius }); break;
        case 'shell': this._want(w, 'whistle', 'shell_whistle', { ...o, pos: w.pos, warn: true, radius: SPECIALS.crab.cannonRadius, params: { vy: w.vel.y } }); break;
        case 'orb':
          if (w.phase === 'fly') { const gl = this._glide(w, w.pos, w.vel); this._want(w, 'fly', 'orb_fly', { ...o, pos: w.pos, warn: true, big: true, radius: SPECIALS.booyah.radius, pitch: gl.q, glide: gl.st }); }
          else if (w.phase === 'fuse') this._want(w, 'fuse', 'orb_fuse', { ...o, pos: w.pos, warn: true, big: true, radius: SPECIALS.booyah.radius, range: 70, prio: 1.5,
            params: { k: clamp(w.t / SPECIALS.booyah.fuse, 0, 1) } });
          break;
      }
    }
    this._vanishSeen = vanish;
    // ---- the enemy's specials coming your way: launch alerts, the "you're in it" alarm (sfx-loud)
    if (me && me.alive) this._threats(me);
    // ---- the actors' running specials (and Bubble Guard shields)
    for (const a of G.actors || []) {
      if (!a.alive) continue;
      const own2D = !!me && a === me;
      const o = { pos: a.pos, team: a.team, owner: a, twoD: own2D };
      if (a.status?.shield > 0) this._want(a, 'shield', 'shield_hum', { ...o, range: 28 });
      const s = a.specialActive;
      if (!s) continue;
      const hv = hs(a.vel);
      switch (s.kind || s.id) {
        case 'slam': {
          const d = SPECIALS.slam, ph = s.phase === 'rise' ? 0 : s.phase === 'hang' ? 1 : 2;
          const k = ph === 0 ? s.t / d.rise : ph === 1 ? s.t / d.hang : s.t / 0.25;
          // (the enemy's / a teammate's: from the spot it will land on, under the leap — the falling whistle comes down there)
          let at = a.pos;
          if (!own2D) {
            const gy = G.level?.groundHeight?.(a.pos.x, a.pos.z, a.pos.y + 0.2), q = this._slamAt.get(s) || {};
            q.x = a.pos.x; q.z = a.pos.z; q.y = gy > -Infinity ? gy + 0.3 : a.pos.y; this._slamAt.set(s, q); at = q;
          }
          this._want(a, 'slam', 'slam_warn', { ...o, pos: at, warn: true, big: true, radius: d.radius, range: 60, params: { phase: ph, k: clamp(k, 0, 1) } });
          break;
        }
        case 'barrage': this._want(a, 'drum', 'barrage_drum', { ...o, range: 36 }); break;
        case 'strike': if (own2D && s.aiming) this._want(a, 'aim', 'strike_aim', { ...o, prio: 2 }); break;
        case 'wail': this._want(a, 'hold', 'wail_hold', { ...o, range: 30 }); break;
        case 'kraken': {
          this._want(a, 'body', 'kraken_move', { ...o, params: { speed: clamp(hv / s.def.speed, 0, 1) } });
          if (s.attack && !a.grounded) {
            const k = clamp((s.def.attackVel - a.vel.y) / (s.def.attackVel + 14), 0, 1);
            this._want(a, 'dive', 'kraken_dive', { ...o, warn: true, big: true, radius: s.def.radius, params: { k } });
          }
          break;
        }
        case 'blower': if (s.cur) this._want(a, 'inflate', 'blower_inflate', { ...o, vol: 0.85, pitch: 1 + clamp(s.curT / s.def.inflate, 0, 1) }); break;
        case 'jetpack': this._want(a, 'jet', 'jet_loop', { ...o, vol: 0.8, range: 50 }); break;
        case 'stamp': this._want(a, 'carry', 'stamp_carry', { ...o, params: { speed: clamp(hv / s.def.moveSpeed, 0, 1) } }); break;
        case 'booyah': if (!s.thrown) this._want(a, 'charge', 'booyah_charge', { ...o, vol: 0.75, pitch: 1 + clamp(s.charge || 0, 0, 1), range: 50 }); break;
        case 'zipcaster':
          this._want(a, 'aura', 'zip_aura', { ...o, range: 22 });
          if (s.zip) this._want(a, 'zip', 'zip_whizz', { ...o, pitch: 1 });
          break;
        case 'crab': {
          this._want(a, 'crab', s.roll ? 'crab_roll' : 'crab_move', { ...o, vol: Math.min(1, hv / (s.roll ? 6 : 2)) * 0.7, pitch: 0.8 + hv * 0.08, range: 45 });
          // the mortar reloaded: a "ka-chunk" others can hear (its owner's copy only: a ghost's cooldown doesn't run)
          if (!s.ghost && s.ccd != null) {
            const prev = this._ccd.get(s);
            if (prev != null && prev > 0 && s.ccd <= 0 && !s.roll) this.one('crab_reload', { at: a.pos, owner: a, kind: 'warn', radius: SPECIALS.crab.cannonRadius, range: 36 });
            this._ccd.set(s, s.ccd);
          }
          break;
        }
      }
    }
  }
  // ---------------------------------------------------------------------------------------------- flights (sfx-loud)
  // a thrown thing in the air: sub_flight in its kind's voice, gliding along its arc
  _fly(obj, kind, o, vol) {
    const gl = this._glide(obj, obj.pos, obj.vel);
    this._want(obj, 'fly', 'sub_flight', { ...o, sub: kind !== 'storm', fly: true, vol: vol * Math.pow(10, (FLIGHT_DB[kind] || 0) / 20), pitch: gl.q, glide: gl.st, params: { kind, arc: gl.arc } });
  }
  // where along its arc a thrown thing is → { arc (0 thrown … 0.5 the top … 1 landing), st (semitones), q (pitch) }
  _glide(obj, pos, vel, g = 24) {
    const vy = vel ? vel.y : 0;
    let r = this._fl.get(obj);
    if (!r) this._fl.set(obj, (r = { vy0: Math.max(0.05, vy) }));
    const L = G.level, gy = L && L.groundHeight ? L.groundHeight(pos.x, pos.z, pos.y + 0.2) : -Infinity;
    const h = Math.max(0, pos.y - (gy > -Infinity ? gy : PLAYER.waterY ?? pos.y - 6));
    const o = this._gl;
    if (vy > 0) { const c = clamp(1 - vy / r.vy0, 0, 1); o.arc = 0.5 * c; o.st = FLY_UP * c; }
    else { const f = clamp(-vy / Math.sqrt(vy * vy + 2 * g * h + 1e-6), 0, 1); o.arc = 0.5 + 0.5 * f; o.st = FLY_UP + (FLY_DOWN - FLY_UP) * f; }
    o.q = Math.pow(2, o.st / 12);
    return o;
  }

  // ---------------------------------------------------------------------------------------------- the enemy's specials (sfx-loud)
  // launch alerts (once per threat) and the "you're in it" alarm (one loop per kind: the most urgent of that kind)
  _threats(me) {
    const T = this._thr; T.clear();
    let list = [];
    try { list = specialDangers(); } catch (e) { /* (the danger model failing must never silence the rest) */ }
    const x = me.pos.x, y = me.pos.y, z = me.pos.z;
    for (const d of list) {
      if (d.team === me.team) continue;
      const kind = alarmOf(d);
      if (!kind) continue;
      // ---- the launch alert: once per source, when it's fired / aimed (the big ones for anyone near; the rest when
      // it's coming your way)
      if (!this._alerted.has(d.key)) {
        let go = false, at = null;
        if (ALERT_ALL[kind]) { at = d; go = Math.hypot(d.x - x, d.z - z) < ALERT_ALL[kind]; }
        else if (!(kind === 'zooka' && d.shot) && depthIn(d, x, y, z, ALERT_PAD[kind] || 2) > 0) {
          // (at where it lands; a twister / a jet blast / a kraken's jump: at it, coming; a Howl Box: at its mouth)
          go = true;
          at = kind === 'zooka' || kind === 'jet' || kind === 'kraken' ? { x: d.sx, y: d.sy, z: d.sz } : d;
          if (kind === 'wail' && !(d.tIn > 0)) go = false;   // (aimed at you: while it charges)
          if (kind === 'storm') { const t0 = this._stormAlert.get(d.owner); if (t0 != null && G.time - t0 < 2.5) go = false; else this._stormAlert.set(d.owner, G.time); }
          if (kind === 'jet') { if (G.time - this._jetT < 0.3) go = false; else this._jetT = G.time; }
        }
        if (go) {
          this._alerted.add(d.key);
          this.one(ALERT_OF[kind], { at: ALERT_ALL[kind] ? { x: at.x, y: at.y + 0.5, z: at.z } : this._toward(me, at.x, at.y + 0.5, at.z), owner: d.owner, team: d.team, kind: 'alert', radius: d.r, target: me, range: Infinity });
        } else if (ALERT_ALL[kind]) this._alerted.add(d.key);   // (too far to matter: no alert later either)
      }
      // ---- the alarm: you're in it
      if (kind === 'wail' || depthIn(d, x, y, z) <= 0) continue;
      let k;
      if (kind === 'storm') {
        if (d.tIn > 0) k = 0.35 * clamp(1 - d.tIn / ALARM_T.storm, 0, 1);
        else { const t0 = this._inT.storm ?? (this._inT.storm = G.time); k = Math.min(1, 0.45 + (G.time - t0) / 2.5); }
      } else if (kind === 'zooka') k = d.shot ? 0.25 + 0.5 * clamp(1 - d.delay, 0, 1) : clamp(1 - tInAt(d, x, z) / ALARM_T.zooka, 0.6, 1);
      else if (kind === 'jet') k = d.fast ? clamp(1 - d.tIn / ALARM_T.jet, 0.6, 1) : 0.2;
      else k = clamp(1 - d.tIn / (ALARM_T[kind] || 1.5), 0, 1);
      const cur = T.get(kind);
      if (!cur || k > cur.k) T.set(kind, { d, k });
    }
    this._shots(me, T);
    if (!T.has('storm')) this._inT.storm = null;
    for (const [kind, { d, k }] of T) {
      const key = this._dk[kind] || (this._dk[kind] = { kind }), p = key.p || (key.p = { x: 0, y: 0, z: 0 });
      p.x = d.x; p.y = d.y + 1; p.z = d.z;
      this._want(key, 'danger', 'danger', { pos: p, owner: d.owner, team: d.team, warn: true, big: true, radius: d.r, target: me, range: 200, prio: 3, ref: REF.danger,
        vol: Math.pow(10, (DANGER_DB[kind] || 0) / 20), params: { kind, k } });
    }
  }

  // the enemy's mortar shells and thrown stamps: along their arc — where it lands, and how close it passes you on the
  // way (a stamp thrown at you hits you first): an alert once when it's coming your way, the alarm while it's on you
  _shots(me, T) {
    const x = me.pos.x, z = me.pos.z;
    for (const w of G.specials?.world || []) {
      if ((w.kind !== 'stamp' && w.kind !== 'shell') || w.dead || w.team === me.team) continue;
      const kind = w.kind, R = kind === 'stamp' ? SPECIALS.stamp.throwRadius : SPECIALS.crab.cannonRadius, c = this._arcOf(w, kind === 'stamp' ? 12 : 20, me);
      const direct = c.near < 1.3, dl = Math.abs(c.y - me.pos.y) < 3 ? Math.hypot(c.x - x, c.z - z) : Infinity;
      if (!this._alerted.has(w) && (direct || dl < R + 3)) {
        this._alerted.add(w);
        // (at where it will hit: you, if it's coming straight at you)
        this.one(ALERT_OF[kind], { at: direct ? this._toward(me, c.nx, c.ny, c.nz) : this._toward(me, c.x, c.y + 0.5, c.z), owner: w.owner, team: w.team, kind: 'alert', radius: R, target: me, range: Infinity });
      }
      if (!direct && !(dl < R + 0.3)) continue;
      const k = clamp(1 - (direct ? c.tNear : c.tLand) / ALARM_T[kind], 0, 1), cur = T.get(kind);
      if (!cur || k > cur.k) T.set(kind, { d: { x: direct ? w.pos.x : c.x, y: direct ? w.pos.y - 1 : c.y, z: direct ? w.pos.z : c.z, r: R, owner: w.owner, team: w.team }, k });
    }
  }
  // an alert's spot: where the threat is (its landing, the thing coming), brought in to ALERT_NEAR m of you along the
  // same line when it's further — you hear which way it comes from, never too far off to hear it
  _toward(me, x, y, z) {
    const dx = x - me.pos.x, dy = y - me.pos.y, dz = z - me.pos.z, d = Math.hypot(dx, dy, dz), k = d > ALERT_NEAR ? ALERT_NEAR / d : 1;
    return { x: me.pos.x + dx * k, y: me.pos.y + dy * k, z: me.pos.z + dz * k };
  }
  // a thrown thing's arc (gravity g) against the world: where (c.x / y / z) and when (c.tLand, s) it lands, and the
  // closest it comes to your middle on the way (c.near m, at c.tNear s); cached 0.1 s per object
  _arcOf(w, g, me) {
    let c = this._arcs.get(w);
    if (c && G.time - c.t < 0.1 && G.time >= c.t) return c;
    if (!c) this._arcs.set(w, (c = { t: 0 }));
    c.t = G.time;
    const V = w.pos.constructor, a = this._va || (this._va = new V()), b = this._vb || (this._vb = new V()), H = this._hit || (this._hit = new Hit());
    const mx = me.pos.x, my = me.pos.y + 0.9, mz = me.pos.z, dt = 0.04;
    let x = w.pos.x, y = w.pos.y, z = w.pos.z, vx = w.vel.x, vy = w.vel.y, vz = w.vel.z;
    c.near = Math.hypot(x - mx, y - my, z - mz); c.tNear = 0; c.x = c.nx = x; c.y = c.ny = y; c.z = c.nz = z; c.tLand = 3;
    for (let t = dt; t <= 3; t += dt) {
      const nx = x + vx * dt, ny = y + vy * dt - 0.5 * g * dt * dt, nz = z + vz * dt;
      vy -= g * dt;
      // (the closest point of this step to you)
      const sx = nx - x, sy = ny - y, sz = nz - z, L2 = sx * sx + sy * sy + sz * sz || 1e-9;
      const u = clamp(((mx - x) * sx + (my - y) * sy + (mz - z) * sz) / L2, 0, 1), dn = Math.hypot(x + sx * u - mx, y + sy * u - my, z + sz * u - mz);
      if (dn < c.near) { c.near = dn; c.tNear = t - dt * (1 - u); c.nx = x + sx * u; c.ny = y + sy * u; c.nz = z + sz * u; }
      const r = G.physics ? G.physics.segment(a.set(x, y, z), b.set(nx, ny, nz), H, true) : null;
      if (r && r.hit) { c.x = r.point.x; c.y = r.point.y; c.z = r.point.z; c.tLand = t - dt * 0.5; break; }
      x = nx; y = ny; z = nz; c.x = x; c.y = y; c.z = z;
      if (y < (PLAYER.waterY ?? -10) - 2) { c.tLand = t; break; }
    }
    if (c.near < 1.3 && c.tNear < c.tLand) { c.tLand = c.tNear; }
    return c;
  }

  // are you inside a Howl Box's line (the beam's radius, a little extra)?
  _inBeam(w, e) {
    const mx = w.mouth || w.pos, d = w.dir;
    const px = e.pos.x - mx.x, py = e.pos.y + 0.8 - mx.y, pz = e.pos.z - mx.z;
    const along = px * d.x + py * d.y + pz * d.z;
    if (along < -0.5 || along > (w.range || 72)) return false;
    const ox = px - d.x * along, oy = py - d.y * along, oz = pz - d.z * along;
    return Math.hypot(ox, oy, oz) < (w.radius || 1.5) + 1.2;
  }

  _reconcile(dt, m) {
    const A = G.audio, want = this.want, L = A.L, me = this._me();
    const menu = !me, capM = menu ? MAX.moveMenu : MAX.move, capW = menu ? MAX.warnMenu : MAX.warn;
    // score: warnings first, the enemy's first, then the closest (to the listener; for threats, to you)
    for (const w of want) {
      w.rel = this.rel(w.owner, w.team);
      w.d = w.twoD || !w.pos ? 0 : dist(L, w.pos);
      w.cl = w.warn && w.rel === 'foe' ? this.close(w.pos, w.radius) : 0;
      w.mix = MIX[w.warn ? 'warn' : w.fly ? 'fly' : 'move'][w.sub && w.rel === 'ally' ? 'allySub' : w.rel];
      const had = this.slots.has(w.key) ? 1.25 : 1;
      // (silent in this mix — a teammate's sub's flight or fuse: no loop at all, nor a place under the caps)
      w.score = w.d > w.range || !(w.mix > 0) ? -1 : (w.warn ? 4 : 1) * (w.rel === 'foe' ? 2 : 1) * (1 + 2 * w.cl) * w.prio * had * (w.twoD ? 10 : 1) / (1 + w.d / 12);
    }
    want.sort((a, b) => b.score - a.score);
    const keep = this._keep; keep.clear();
    let nm = 0, nw = 0;
    for (const w of want) {
      if (w.score < 0) continue;
      if (w.warn ? nw >= capW : nm >= capM) { this.stats.capped++; continue; }
      if (w.warn) nw++; else nm++;
      keep.add(w.key);
      // Doppler: the emitter's own velocity (smoothed), along the line from it to the listener
      let dop = 1, dv = 1;
      if (!w.twoD && w.pos) {
        let tr = this.tracks.get(w.key);
        if (!tr) this.tracks.set(w.key, (tr = { x: w.pos.x, y: w.pos.y, z: w.pos.z, vx: 0, vy: 0, vz: 0 }));
        else if (dt > 0) {
          let vx = (w.pos.x - tr.x) / dt, vy = (w.pos.y - tr.y) / dt, vz = (w.pos.z - tr.z) / dt;
          const sp = Math.hypot(vx, vy, vz);
          if (sp > 60) { vx = vy = vz = 0; }   // (a jump in position, not a speed)
          const k = 1 - Math.exp(-12 * dt);
          tr.vx += (vx - tr.vx) * k; tr.vy += (vy - tr.vy) * k; tr.vz += (vz - tr.vz) * k;
          tr.x = w.pos.x; tr.y = w.pos.y; tr.z = w.pos.z;
        }
        const dx = L.x - w.pos.x, dy = L.y - w.pos.y, dz = L.z - w.pos.z, dl = Math.hypot(dx, dy, dz);
        if (dl > 0.5) {
          const vr = (tr.vx * dx + tr.vy * dy + tr.vz * dz) / dl;   // + = coming closer
          dop = clamp(1 / (1 - clamp(vr, -40, 40) / C_EFF), 0.84, 1.22);
          dv = clamp(1 + vr / 40, 0.85, 1.25);
        }
      }
      let vol = w.vol * w.mix * dv;
      if (w.warn && w.rel === 'foe') vol *= 1 + 0.35 * w.cl + (w.target && w.target === me ? 0.2 : 0);
      vol = Math.min(vol, 1.6);
      const gain = vol * lv(w.sound);
      const params = w.params ? (w.warn ? { ...w.params, foe: w.rel === 'foe' || w.rel === 'none' ? 1 : 0 } : w.params) : (w.warn ? { foe: w.rel === 'foe' ? 1 : 0 } : null);
      const pitch = w.pitch * dop, pos = w.twoD ? undefined : w.pos;
      let s = this.slots.get(w.key);
      if (s && (!s.h.playing || s.sound !== w.sound || s.twoD !== w.twoD)) { s.h.stop(0.08); this.stats.stopped++; this.slots.delete(w.key); s = null; }
      if (!s) {
        const h = A.loop(w.sound, { pos, volume: gain, pitch, params, ref: pos ? w.ref || (w.warn ? REF.warn : REF.move) : undefined, cue: true });
        if (!h || !h.playing) continue;
        s = { key: w.key, sound: w.sound, h, twoD: w.twoD, born: G.time };
        this.slots.set(w.key, s); this.stats.made++;
      } else s.h.set({ pos, volume: gain, pitch, params });
      Object.assign(s, { obj: w.obj, ch: w.ch, warn: w.warn, rel: w.rel, vol, gain, pitch, dop, params, pos: w.pos, d: w.d, cl: w.cl, seen: G.time, glide: w.glide });
      // a big threat of the enemy's, inside its reach: the music dips a little while it lasts
      if (w.warn && w.rel === 'foe' && w.cl > 0.35) this._dip(w.big && w.cl > 0.5 ? 0.35 : 0.2);
    }
    this.stats.maxMove = Math.max(this.stats.maxMove, nm); this.stats.maxWarn = Math.max(this.stats.maxWarn, nw);
    for (const [k, s] of this.slots) if (!keep.has(k)) { s.h.stop(s.warn ? 0.06 : 0.15); this.slots.delete(k); this.stats.stopped++; }
    for (const k of this.tracks.keys()) if (!keep.has(k)) this.tracks.delete(k);
  }

  // world objects that just went away: the ones that ended on their own play their end (a clear / quit doesn't)
  _vanished(m) {
    const seen = this._vanishSeen;
    for (const [obj, v] of this._vanish) {
      if (seen && seen.has(obj)) continue;
      this._vanish.delete(obj);
      if (m && v.t >= v.dur - 0.1) this.one(v.name, { at: v.pos, owner: v.owner, team: v.team, kind: 'end', range: 50 });
    }
  }

  // revealed by an enemy Deep Sonar: a quiet blip every 2 s while it lasts
  _sonar(dt) {
    const me = this._me(), st = me?.status;
    if (me && me.alive && st && st.reveal > 0 && st.revealTeam !== me.team && !G.match?.paused) {
      if ((this._sonarT -= dt) <= 0) { this._sonarT = 2; G.audio.play('sonar_blip', { volume: 0.8 * lv('sonar_blip'), cue: true }); }
    } else this._sonarT = 1.2;
  }

  // an enemy warning close to you: the music dips a little (rate-limited; a pause's own duck is never lifted by it)
  _dip(amount) {
    if (G.match?.paused || G.time - this._duckT < 0.3) return;
    this._duckT = G.time; G.audio?.duck?.(amount, 0.35);
  }

  clear() {
    for (const s of this.slots.values()) { s.h.stop(0.1); this.stats.stopped++; }
    this.slots.clear(); this.tracks.clear(); this._vanish.clear(); this._vanishSeen = null;
    this.want.length = 0;
  }
  // (tests / tools) the live cue loops: [{ key, sound, ch, warn, rel, vol, pitch, dop, params, obj, pos }]
  live() { return [...this.slots.values()].filter((s) => s.h.playing); }
}

export const cues = new Cues();
