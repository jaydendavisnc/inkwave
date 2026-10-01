// Bot awareness of the other team's specials (BotBrain.sp — the hooks in bots.js are the lines marked "enemy
// specials"). The user, 2026-09-30: "they blindlessly walk into specials that are clearly going to kill them, or walk
// right next to someone with a bubble or kraken who cant take damage".
//
// THE MODEL — specialDangers(): once a frame the live enemy specials are read into danger areas: a disc or a line (and
// a height band), the time until it hurts (tIn), how long it lasts (tOut), how bad it is (lethal 2: splats a full-health
// kid · 1: hurts a lot · 0: a slow drain), whether a wall between you and its centre is cover (los), and how a player
// could know about it (vis: 'map' — drawn on everyone's minimap · 'big' — seen on screen or heard close by · 'near' —
// a projectile seen coming or close · 'actor' — only by seeing that player):
//   Tidal Slam       the landing ring under the leap (r 5.2, lethal 3.2), at the landing beat — big (heard ~14 m)
//   Ink Tempest      the rain under the cloud (r 3.4, 34 dps, drifting) and where a thrown one will form — big, light
//   Bomb Barrage     every enemy bomb (the barrage's are ordinary Splat Bombs / Cling Charges / Skitter Bombs / Murk
//                    mist, so all of them): an armed one's blast and fuse, one in flight's landing, a Skitter Bomb on
//                    the run, a mist — near (seen, or within ~5 m: they beep)
//   sub windups      (sub-tweaks) a Skitter Bomb / Waddle Bomb stopped and winding up to burst (its `delay`), a Lurk Mine
//                    tripped (popped up, blowing `delay` later): the blast where it stands — near. A Lurk Mine that
//                    hasn't tripped is in nobody's list: it's invisible to the other team (the sight rule)
//   Vortex Strike    the ring where the missile lands (r 5.5, its 2.2 s flight) and the vortex (4.5 s, 62 dps) — map
//   Twister Zooka    each twister in flight (a line to where it ends, one-shot) — big; the holder's aim lane in the
//                    moment before its next shot (once a second; judged roughly, by difficulty), at any range — actor
//   Howl Box         the placed speaker's beam (a line through walls: 1.3 s charge, 3.2 s blast) — map
//   Kraken           invulnerable: its reach (5.5 m: it outruns a kid) and where an attack jump lands — big (heard 10 m)
//   Bubble Blower    an enemy bubble's blast (1.9 × its size) while one of theirs is near enough to set it off — map
//   Ink Jet          each blast in flight (its path and splash, r 2.4) — big; the ground under the jetpacker (6 m: a
//                    blast from right above can't be seen coming) — big (heard 12 m), a wall between is cover
//   Mega Stamp       the lane in front of it (swing + lunge + its charge), and a thrown stamp's blast — big / near
//   Cheer Orb        the orb's blast (r 8.4, lethal nearly all of it) where it will land and while it swells — map
//   Crab Rig         its gun lane (22 m along the hull, when it's firing or about to) and each cannon shell — big
//   Bubble Guard     untouchable: its holder's (and every shielded teammate's) weapon reach — actor
// Deep Sonar hurts nobody and a Zipline zip is 22 m/s (nothing to step out of in time): left alone.
//
// PERCEPTION (no wall-hacks: botSight.js rules): a bot notices a danger only as a player could (vis above), after its
// reaction time (difficulty; a little later mid-fight or when it's off to the side), and — easy bots most — now and
// then misses a fast projectile altogether. What it noticed it keeps while the thing lasts; a special on a player (a
// kraken, a crab, a bubble …) only while it still sees or hears that player (0.8 s grace). A bot's team shares what its
// bots have noticed (the route costs below).
//
// RESPONSES (SpecialSense, per bot):
//   escape   inside a noticed area that will hurt soon (lethal / heavy: before its tIn; light: unless it's holding the
//            objective — a zone guard or a tower rider takes a Tempest's rain) → out along the quickest safe line:
//            12 headings scored by the time to get clear (swimming where it's our ink, slow in theirs) against the time
//            left, never into the sea or off a big drop, never through another area, walls count as cover from a
//            blast that needs a sight line; toward teammates / home. A Slam's edge: a hop at the landing beat.
//   routes   the areas the team knows that linger (a vortex, rain, a beam, a bubble, an orb, a kraken's reach …) cost
//            nav nodes (dangerCost; nav.path's cost), routes into newly marked nodes re-plan, and a goal inside one
//            moves to the nearest clear node outside it (no chasing a foe into it either); every step checked against
//            walking into a lethal one (guard).
//   untouchable foes (immunity(): Bubble Guard, Kraken, Crab Rig from the front / sides, Mega Stamp's guarded front, a
//            Tidal Slam's armoured leap, spawn / landing invulnerability): a hurtable foe in sight is the target
//            instead; no shots or subs into them (a charge is held for when it's over), unless the knock-back pays —
//            a Kraken or a Bubble Guard with the sea right behind it, or riding the tower (the shove is 4× / 2× there),
//            or a Crab Rig's tank from beyond its gun's reach; their reach is a danger area (kept out of, backed out
//            of); back in the moment it's over. An enemy bubble in the line of fire soaks the shots: held.
//   counter-play: shoot what can be shot — our own team's bubble with one of theirs inside its blast (our shots set it
//            off; theirs only soak ours); the Crab Rig's rider from behind; the defenceless (a Cheer Orb holder, a Howl
//            Box being aimed, a Vortex Strike being aimed, a Bubble Blower) first, a floating Ink Jet first once it's in
//            reach (from the edge of our reach, never from under it).
// SPECIAL_AI.enabled (or .teams [bool, bool]) switches it all off for an A/B on the same code; SPECIAL_STATS counts.
import * as THREE from 'three';
import { G, on, clamp, angleDiff } from '../core/ctx.js';
import { PLAYER, SPECIALS, SUBS, weaponRange } from '../config.js';
import { Hit } from './physics.js';
import { MAIN_KITS, SUB_KITS } from './kits/registry.js';
import { SIGHT } from './botSight.js';

export const SPECIAL_AI = { enabled: true, teams: null };
// engagements, not frames (heldFire / bubbleHold are seconds); splattedBy: bots splatted per special (Bomb Barrage:
// bombs thrown during one, or within its last fuse)
export const SPECIAL_STATS = { noticed: 0, missed: 0, escapes: 0, evaded: 0, caught: 0, avoidedPath: 0, goalMoved: 0, guard: 0, backedOff: 0,
  retargeted: 0, heldFire: 0, knockShots: 0, reengaged: 0, bubbleHold: 0, popShots: 0, hops: 0, hunted: 0, splattedBy: {} };
export function resetSpecialStats() { for (const k in SPECIAL_STATS) SPECIAL_STATS[k] = typeof SPECIAL_STATS[k] === 'object' ? {} : 0; }

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _d = new THREE.Vector3(), _h = new Hit();
const _st = { own: 0, enemy: 0, empty: 0, n: 0 };
const CHARGE = { charger: true, spinner: true, splatling: true };
const BOMB = { bomb: true, sticky: true, burst: true, seeker: true, mist: true };
const MISS = { easy: 0.35, normal: 0.18, hard: 0.06 };    // chance a fast projectile goes unnoticed (by difficulty)
const LEAVE = 0.45;                                          // (m past an area's edge counts as out of it)

// ------------------------------------------------------------------------------------------------ what hurts where
const KEYS = Symbol('botDangerKeys');
// a stable key object per source (a special's world object, a bomb, an actor's running special …); i: several areas
function keyOf(o, i = 0, seed) {
  let k = o[KEYS];
  if (!k || (seed !== undefined && k.seed !== seed)) { k = o[KEYS] = []; k.seed = seed; }
  return k[i] || (k[i] = { i });
}
const _pool = new Map(), _list = [];
let _gen = 0, _t = -1, _m = null;
const TEAMK = [new Set(), new Set()];   // danger keys each team's bots have noticed (their routes avoid those)
const DIRTY = [false, false];           // … one newly added: rebuild that team's route costs now
const LAY = [null, null];
// the pooled descriptor for key, not yet registered this frame (its prediction cache survives the per-frame reset)
function P0(key) {
  let d = _pool.get(key);
  if (!d) { d = { key, pT: -9, gen: -1 }; _pool.set(key, d); }
  return d;
}
// … registered for this frame, its fields reset
function D(key, src, team, owner) {
  const d = P0(key);
  d.gen = _gen; d.src = src; d.hit = src; d.team = team; d.owner = owner;
  d.shape = 0; d.x = 0; d.y = 0; d.z = 0; d.dx = 0; d.dz = 1; d.len = 0; d.d3 = false; d.ux = 0; d.uy = 0; d.uz = 1; d.back = 0.4;
  d.r = 1; d.core = 1; d.yLo = -1e9; d.yHi = 1e9; d.vx = 0; d.vz = 0; d.vt = 0; d.tIn = 0; d.tOut = 60; d.lethal = 2;
  d.los = false; d.losY = 0.35; d.vis = 'near'; d.sx = 0; d.sy = 0; d.sz = 0; d.linger = false; d.actor = null;
  d.speed = 0; d.delay = 0; d.dodge = 0; d.shot = false; d.hear = 0; d.imm = null; d.fast = false; d.obj = null; d.pop = false;
  _list.push(d);
  return d;
}
const disc = (d, x, y, z, r, core) => { d.shape = 0; d.x = x; d.y = y; d.z = z; d.r = r; d.core = core; d.yLo = y - r - 1.2; d.yHi = y + r; };
const see = (d, x, y, z) => { d.sx = x; d.sy = y; d.sz = z; };
function line(d, x, y, z, dx, dz, len, r) {
  const l = Math.hypot(dx, dz) || 1;
  d.shape = 1; d.x = x; d.y = y; d.z = z; d.dx = dx / l; d.dz = dz / l; d.len = len; d.r = r; d.core = r; d.yLo = y - 2.2; d.yHi = y + 2.2;
}
// how far a straight line from (x, y, z) along (dx, dz) runs before a wall (≤ len; y: the height it flies at)
function reach(x, y, z, dx, dz, len) {
  const l = Math.hypot(dx, dz) || 1;
  const r = G.physics.raycast(_p.set(x, y, z), _d.set(dx / l, 0, dz / l), len, _h, true);
  return r.hit ? r.dist : len;
}
// where a thrown thing lands (gravity g; the first thing its path hits), cached 0.1 s on the descriptor: d.px/py/pz,
// d.pAt (the moment), d.pN (a floor under it); false: it falls in the sea / flies on out of reach
function predict(d, pos, vel, g, maxT) {
  const now = G.time;
  if (now - d.pT < 0.1 && now >= d.pT) return d.pOk;
  d.pT = now; d.pOk = false; d.px = pos.x; d.py = pos.y; d.pz = pos.z; d.pAt = now; d.pN = false;
  let x = pos.x, y = pos.y, z = pos.z, vx = vel.x, vy = vel.y, vz = vel.z;
  const dt = 0.05;
  for (let t = dt; t <= maxT + 1e-6; t += dt) {
    const nx = x + vx * dt, ny = y + vy * dt - 0.5 * g * dt * dt, nz = z + vz * dt;
    vy -= g * dt;
    const r = G.physics.segment(_p.set(x, y, z), _q.set(nx, ny, nz), _h, true);
    if (r.hit) { d.px = r.point.x; d.py = r.point.y; d.pz = r.point.z; d.pAt = now + t - dt * 0.5; d.pN = r.normal.y > 0.6; d.pOk = true; return true; }
    if (ny < PLAYER.waterY - 1.8) return false;
    x = nx; y = ny; z = nz;
  }
  d.px = x; d.py = y; d.pz = z; d.pAt = now + maxT;   // (still in the air at the end: where it'll be)
  return false;
}
const _barEnd = new WeakMap();
const barrage = (a) => !!a && (a.specialActive?.kind === 'barrage' || G.time - (_barEnd.get(a) ?? -99) < 3.5);

// every enemy special effect as a danger area (both teams' — a bot reads the other team's); once a frame
export function specialDangers() {
  if (G.match !== _m) { _m = G.match; _pool.clear(); _list.length = 0; TEAMK[0].clear(); TEAMK[1].clear(); LAY[0] = LAY[1] = null; _t = -1; }
  if (G.time === _t) return _list;
  _t = G.time; _gen++; _list.length = 0;
  const now = G.time;
  // ---- the specials' world objects
  for (const w of G.specials?.world || []) {
    if (w.dead) continue;
    switch (w.kind) {
      case 'missile': case 'tornado': {
        const S = SPECIALS.strike, p = w.kind === 'missile' ? w.to : w.pos, d = D(w, 'strike', w.team, w.owner);
        disc(d, p.x, p.y, p.z, S.radius + 0.6, S.radius + 0.6);
        d.tIn = w.kind === 'missile' ? Math.max(0, w.flight - w.t) : 0;
        d.tOut = w.kind === 'missile' ? d.tIn + S.duration : Math.max(0, w.dur - w.t);
        d.yLo = p.y - 1.6; d.yHi = p.y + 7; d.vis = 'map'; d.linger = true; see(d, p.x, p.y + 1.5, p.z);
        break;
      }
      case 'twister': {
        const Z = SPECIALS.zooka, v = w.vel, sp = Math.hypot(v.x, v.z) || 1, d = D(w, 'zooka', w.team, w.owner);
        if (now - d.pT >= 0.1 || now < d.pT) { d.pT = now; d.cLen = reach(w.pos.x, w.pos.y, w.pos.z, v.x, v.z, Math.max(0, w.life - w.t) * sp); }
        const len = Math.max(0, d.cLen - (now - d.pT) * sp);
        line(d, w.pos.x, w.pos.y, w.pos.z, v.x, v.z, len, Z.radius + PLAYER.radius + 0.3);
        d.speed = sp; d.back = 0; d.tOut = len / sp + 0.1;
        d.yLo = w.pos.y - Z.height * 0.5 - PLAYER.height - 0.2; d.yHi = w.pos.y + Z.height * 0.5; d.fast = true; d.vis = 'big'; d.hear = 5; see(d, w.pos.x, w.pos.y, w.pos.z);
        break;
      }
      case 'speaker': {
        if (w.phase === 'fade') break;
        const W = SPECIALS.wail, d = D(w, 'wail', w.team, w.owner), u = w.dir, hl = Math.hypot(u.x, u.z) || 1;
        line(d, w.mouth.x, w.mouth.y, w.mouth.z, u.x, u.z, w.range * hl, W.radius + 0.45 + 0.4);
        d.d3 = true; d.ux = u.x; d.uy = u.y; d.uz = u.z; d.yLo = -1e9; d.yHi = 1e9; d.back = 0.5;
        d.tIn = w.phase === 'charge' ? Math.max(0, W.charge - w.t) : 0;
        d.tOut = w.phase === 'charge' ? d.tIn + W.blast : Math.max(0, W.blast - w.t);
        d.vis = 'map'; d.linger = true; see(d, w.pos.x, w.pos.y + 1, w.pos.z);
        break;
      }
      case 'bubble': {
        if (w.held) break;
        const B = SPECIALS.blower, R = w.r * B.blastMul, d = D(w, 'blower', w.team, w.owner);
        disc(d, w.pos.x, w.pos.y, w.pos.z, R + 0.4, R * 0.87);
        d.yLo = w.pos.y - R - 1.2; d.yHi = w.pos.y + R;
        d.los = true; d.losY = 0.35; d.tIn = w.charge > 0 ? 0.15 : 0.45; d.tOut = Math.max(0, w.life);
        d.pop = true; d.obj = w; d.vis = 'map'; d.linger = true; see(d, w.pos.x, w.pos.y, w.pos.z);
        break;
      }
      case 'stamp': case 'shell': {
        const stamp = w.kind === 'stamp', S = stamp ? SPECIALS.stamp : SPECIALS.crab, d = D(w, stamp ? 'stamp' : 'crab', w.team, w.owner);
        predict(d, w.pos, w.vel, stamp ? 12 : 20, stamp ? Math.max(0.1, 3 - w.t) : Math.max(0.1, 4 - w.t));
        const R = stamp ? S.throwRadius : S.cannonRadius;
        disc(d, d.px, d.py, d.pz, R + 0.3, stamp ? 2.5 : 2.3);
        d.tIn = Math.max(0, d.pAt - now); d.tOut = d.tIn + 0.1; d.los = true; d.losY = 0.35; d.fast = true;
        see(d, w.pos.x, w.pos.y, w.pos.z);
        break;
      }
      case 'orb': {
        const S = SPECIALS.booyah, d = D(w, 'booyah', w.team, w.owner);
        let x = w.pos.x, y = w.pos.y, z = w.pos.z;
        if (w.phase === 'fly') { predict(d, w.pos, w.vel, 24, Math.max(0.1, 4 - w.t)); x = d.px; y = d.py; z = d.pz; d.tIn = Math.max(0, d.pAt - now) + S.fuse; }
        else d.tIn = Math.max(0, S.fuse - w.t);
        disc(d, x, y, z, S.radius + 0.4, 7.9);
        d.tOut = d.tIn + 0.1; d.los = true; d.losY = 0.35; d.vis = 'map'; d.linger = true; see(d, w.pos.x, w.pos.y, w.pos.z);
        break;
      }
    }
  }
  const P = G.projectiles;
  if (P) {
    // ---- Ink Tempest clouds (rain under them; drifting), and a thrown one (where its cloud will form)
    for (const c of P.clouds) {
      const S = SPECIALS.storm, g = c.group.position, d = D(c, 'storm', c.team, c.owner);
      disc(d, g.x, c.groundY, g.z, S.radius + 0.35, S.radius);
      d.vx = c.dir.x * S.driftSpeed; d.vz = c.dir.z * S.driftSpeed; d.vt = 4;
      d.tOut = Math.max(0, c.dur - 0.3 - c.t); d.lethal = 0; d.yLo = -1e9; d.yHi = g.y; d.linger = true; d.vis = 'big'; d.hear = 9;
      see(d, g.x, g.y, g.z);
    }
    for (const b of P.bombs) {
      if (b.kind === 'storm') {
        const S = SPECIALS.storm, d = D(b, 'storm', b.team, b.owner);
        predict(d, b.pos, b.vel, 24, Math.max(0.05, 1.1 - b.age));
        const gy = G.level.groundHeight(d.px, d.pz, d.py + 0.5);
        disc(d, d.px, gy === -Infinity ? d.py : gy, d.pz, S.radius + 0.35, S.radius);
        d.tIn = Math.max(0, d.pAt - now) + 0.3; d.tOut = d.tIn + S.duration; d.lethal = 0; d.yLo = -1e9; d.yHi = d.y + 4.6;
        d.linger = true; see(d, b.pos.x, b.pos.y, b.pos.z);
      } else if (b.kind === 'bomb') {
        const S = SUBS.bomb, d = D(b, barrage(b.owner) ? 'barrage' : 'bomb', b.team, b.owner);
        let x = b.pos.x, y = b.pos.y, z = b.pos.z;
        if (b.fuse >= 0) d.tIn = b.fuse;
        else { predict(d, b.pos, b.vel, 24, 3); x = d.px; y = d.py; z = d.pz; d.tIn = Math.max(0, d.pAt - now) + S.fuse; }
        disc(d, x, y, z, S.radius + 0.3, 1.6);
        d.hit = 'bomb'; d.tOut = d.tIn + 0.1; d.los = true; d.losY = 0.3; see(d, b.pos.x, b.pos.y, b.pos.z);
      }
    }
    // ---- Ink Jet blasts in flight: where each splashes
    for (const s of P.list) {
      if (s.type !== 'blast' || s.weaponId !== 'jetpack') continue;
      const J = SPECIALS.jetpack, v = s.vel, sp = v.length() || 1, d = D(keyOf(s, 0, s.seed), 'jetpack', s.team, s.owner);
      if (now - d.pT >= 0.1 || now < d.pT) {
        d.pT = now;
        const len = Math.max(0.1, (s.life - s.age) * sp), r = G.physics.raycast(_p.copy(s.pos), _d.copy(v).multiplyScalar(1 / sp), len, _h, true);
        const t = (r.hit ? r.dist : len) / sp;
        d.px = s.pos.x + (v.x / sp) * t * sp; d.py = s.pos.y + (v.y / sp) * t * sp; d.pz = s.pos.z + (v.z / sp) * t * sp; d.pAt = now + t;
      }
      // (its path to the splash: a shot coming in low hits the body on the way — a line, stepped across)
      const hx = d.px - s.pos.x, hz = d.pz - s.pos.z, hl = Math.hypot(hx, hz), hs = Math.hypot(v.x, v.z) || 1;
      if (hl > 1) { line(d, s.pos.x, d.py, s.pos.z, hx, hz, hl + J.splashRadius, J.splashRadius + 0.3); d.speed = hs; d.back = 0; d.yLo = d.py - 2.4; d.yHi = Math.max(s.pos.y, d.py) + 0.5; }
      else disc(d, d.px, d.py, d.pz, J.splashRadius + 0.3, 1.2);
      d.lethal = 1; d.tIn = Math.max(0, d.pAt - now); d.tOut = d.tIn + 0.1; d.los = hl <= 1; d.losY = 0.2; d.fast = true; d.vis = 'big'; d.hear = 5;
      see(d, s.pos.x, s.pos.y, s.pos.z);
    }
  }
  // ---- Bomb Barrage's other bombs (sub items): Cling Charges, Skitter Bombs on the run, Murk mist
  for (const it of G.subs?.items || []) {
    if (it.state === 'dead') continue;
    const S = it.sub, k = it.kind;
    // (sub-tweaks) a windup to get out of: a Skitter Bomb stopped to burst, a Lurk Mine tripped — never one still lurking
    if ((k === 'seeker' && it.state === 'prime') || (k === 'mine' && it.fuse != null)) {
      const d = D(keyOf(it), it.sp || barrage(it.owner) ? 'barrage' : 'sub', it.team, it.owner);
      d.hit = k;
      disc(d, it.pos.x, it.pos.y, it.pos.z, S.radius + 0.3, k === 'mine' ? S.radius : 1.5);
      d.tIn = Math.max(0, it.fuse); d.tOut = d.tIn + 0.1; d.los = true; d.losY = 0.3; d.lethal = k === 'mine' ? 1 : 2;
      see(d, it.pos.x, it.pos.y + 0.3, it.pos.z);
      continue;
    }
    if (k !== 'sticky' && k !== 'seeker' && k !== 'mist') continue;
    let x = it.pos.x, y = it.pos.y, z = it.pos.z, tIn = 0;
    if (k === 'sticky') {
      if (it.state === 'stuck') tIn = Math.max(0, it.fuse - it.t);
      else if (it.state === 'fly') { const p = P0(keyOf(it)); predict(p, it.pos, it.vel, 24, 3); x = p.px; y = p.py; z = p.pz; tIn = Math.max(0, p.pAt - now) + S.fuse; }
      else continue;
    } else if (k === 'seeker' && it.state !== 'run') continue;
    else if (k === 'mist' && it.state !== 'mist') continue;
    const d = D(keyOf(it), it.sp || barrage(it.owner) ? 'barrage' : 'sub', it.team, it.owner);
    d.hit = k;
    if (k === 'mist') { disc(d, x, y, z, S.radius + 0.2, S.radius); d.lethal = 0; d.linger = true; d.tOut = Math.max(0, S.mistTime - it.t); }
    else if (k === 'seeker') {
      disc(d, x, y, z, S.radius + 0.3, 1.5);
      const hd = it.heading || 0; d.vx = Math.sin(hd) * S.speed; d.vz = Math.cos(hd) * S.speed; d.vt = 1.2;
      d.tIn = 0.35; d.tOut = Math.max(0, S.life - it.t); d.los = true; d.losY = 0.5;
    } else { disc(d, x, y, z, S.radius + 0.3, 1.9); d.tIn = tIn; d.tOut = tIn + 0.1; d.los = true; d.losY = 0.3; }
    see(d, it.pos.x, it.pos.y, it.pos.z);
  }
  // ---- (sub-tweaks) a Waddle Bomb winding up to burst where it stands
  for (const it of SUB_KITS.waddle?.items || []) {
    if (it.state !== 'prime') continue;
    const S = it.sub, d = D(keyOf(it), 'sub', it.team, it.owner);
    d.hit = 'waddle';
    disc(d, it.pos.x, it.pos.y, it.pos.z, S.radius + 0.3, 1.6);
    d.tIn = Math.max(0, it.fuse); d.tOut = d.tIn + 0.1; d.los = true; d.losY = 0.3;
    see(d, it.pos.x, it.pos.y + 0.3, it.pos.z);
  }
  // ---- specials on players (and the untouchable)
  for (const e of G.actors) {
    if (!e.alive || e.superJumpState) continue;
    const s = e.specialActive;
    if (e.status && e.status.shield > 0.1) {
      // Bubble Guard (its holder and every teammate it's shared with): its weapon's reach
      const d = D(keyOf(e, 0), 'bubbler', e.team, e);
      const r = clamp(weaponRange(e.weapon || {}) + 1.5, 5, 14);
      disc(d, e.pos.x, e.pos.y, e.pos.z, r, r);
      d.lethal = 1; d.vx = e.vel.x; d.vz = e.vel.z; d.vt = 1; d.tOut = e.status.shield; d.imm = 'bubble'; d.actor = e; d.vis = 'actor';
      d.los = true; d.losY = 1.1;   // (out of its sight behind a wall is as good as out of its reach)
      d.linger = true; d.yLo = e.pos.y - 3; d.yHi = e.pos.y + 3; see(d, e.pos.x, e.pos.y + 1, e.pos.z);
    }
    if (!s) continue;
    switch (s.kind || s.id) {
      case 'slam': {
        // the leap: it lands under the jumper (drifting a little while it rises) at the landing beat
        const S = SPECIALS.slam, d = D(keyOf(s, 0), 'slam', e.team, e);
        let T = 0, up = 0, x = e.pos.x, z = e.pos.z;
        if (s.phase === 'rise') { const tr = Math.max(0, S.rise - s.t), v = Math.max(0, e.vel.y); T = tr + S.hang; up = Math.max(0, v * tr - 11.25 * tr * tr) + 0.1; x += e.vel.x * tr; z += e.vel.z * tr; }
        else if (s.phase === 'hang') T = Math.max(0, S.hang - s.t);
        const gy0 = G.level.groundHeight(x, z, e.pos.y + 0.2), gy = gy0 === -Infinity ? (s.startY ?? e.pos.y) : gy0;
        T += Math.max(0, e.pos.y + up - gy) / 34;
        disc(d, x, gy, z, S.radius + 0.3, S.killRadius + 0.3);
        d.tIn = T; d.tOut = T + 0.1; d.los = true; d.losY = 0.8; d.actor = e; d.vis = 'big'; d.hear = 14; see(d, e.pos.x, e.pos.y + 1, e.pos.z);
        break;
      }
      case 'kraken': {
        // untouchable, faster than a kid on foot: its reach; an attack jump: where it comes down
        const S = SPECIALS.kraken, d = D(keyOf(s, 0), 'kraken', e.team, e);
        disc(d, e.pos.x, e.pos.y, e.pos.z, 5.5, 5.5);
        d.vx = e.vel.x; d.vz = e.vel.z; d.vt = 0.6; d.tOut = Math.max(0, s.dur - s.t); d.imm = 'kraken'; d.actor = e; d.vis = 'big'; d.hear = 10;
        d.linger = true; d.yLo = e.pos.y - 3; d.yHi = e.pos.y + 3; see(d, e.pos.x, e.pos.y + 1, e.pos.z);
        if (!e.grounded && s.attack) {
          const j = D(keyOf(s, 1), 'kraken', e.team, e);
          predict(j, e.pos, e.vel, PLAYER.gravity * 1.1, 1.6);
          disc(j, j.px, j.py, j.pz, S.radius + 0.4, S.radius);
          j.tIn = Math.max(0, j.pAt - now); j.tOut = j.tIn + 0.1; j.los = true; j.losY = 0.4; j.actor = e; j.vis = 'big'; j.hear = 10;
          see(j, e.pos.x, e.pos.y + 1, e.pos.z);
        }
        break;
      }
      case 'crab': {
        // armoured from the front and sides; its gatling down the hull's line (22 m) while it's firing or about to
        if (s.roll || s.hull === undefined) break;
        const S = SPECIALS.crab, d = D(keyOf(s, 0), 'crab', e.team, e), fx = Math.sin(s.hull), fz = Math.cos(s.hull);
        if (now - d.pT >= 0.15 || now < d.pT) { d.pT = now; d.cLen = reach(e.pos.x, e.pos.y + 0.7, e.pos.z, fx, fz, S.gunRange); }
        line(d, e.pos.x, e.pos.y, e.pos.z, fx, fz, d.cLen, 1.5);
        d.back = 0; d.tIn = s.firing > 0 ? 0 : 0.5; d.dodge = 0.6; d.los = true; d.losY = 0.7; d.imm = 'crab'; d.actor = e; d.vis = 'big'; d.hear = 10;
        d.linger = true; see(d, e.pos.x, e.pos.y + 1.2, e.pos.z);
        break;
      }
      case 'stamp': {
        // the lane in front of it: a swing's reach, its lunge, and its charge
        const S = SPECIALS.stamp, d = D(keyOf(s, 0), 'stamp', e.team, e), fy = s.bodyYaw ?? e.yaw, hs = Math.hypot(e.vel.x, e.vel.z);
        line(d, e.pos.x, e.pos.y, e.pos.z, Math.sin(fy), Math.cos(fy), S.reach + S.radius + (hs > 1.5 ? S.lunge + 1.5 : 0.8), S.radius + 0.35);
        d.back = 0.6; d.imm = 'stamp'; d.actor = e; d.vis = 'big'; d.hear = 9; d.linger = true; see(d, e.pos.x, e.pos.y + 1, e.pos.z);
        break;
      }
      case 'jetpack': {
        // floating 3.8 m up and firing down: right under it a blast can't be seen coming or stepped out of — keep out
        // from under it (a wall between is cover); shoot it from the edge of our reach
        const d = D(keyOf(s, 0), 'jetpack', e.team, e), gy0 = G.level.groundHeight(e.pos.x, e.pos.z, e.pos.y + 0.2), gy = gy0 === -Infinity ? e.pos.y - 4 : gy0;
        disc(d, e.pos.x, gy, e.pos.z, 6, 6);
        d.lethal = 1; d.vx = e.vel.x; d.vz = e.vel.z; d.vt = 0.6; d.tOut = Math.max(0, s.dur - s.t); d.actor = e; d.vis = 'big'; d.hear = 12;
        d.los = true; d.losY = e.pos.y - gy; d.linger = true; d.yLo = gy - 2; d.yHi = e.pos.y; see(d, e.pos.x, e.pos.y, e.pos.z);
        break;
      }
      case 'zooka': {
        // its aim lane in the moment before the next twister (a player sees the bazooka pointing at them)
        const Z = SPECIALS.zooka, d = D(keyOf(s, 0), 'zooka', e.team, e), fx = Math.sin(e.aimYaw), fz = Math.cos(e.aimYaw);
        if (now - d.pT >= 0.15 || now < d.pT) { d.pT = now; d.cLen = reach(e.pos.x, e.pos.y + 1.3, e.pos.z, fx, fz, Z.range); }
        line(d, e.pos.x, e.pos.y, e.pos.z, fx, fz, d.cLen, Z.radius + PLAYER.radius + 0.35);
        d.back = 0; d.speed = Z.speed; d.delay = Math.max(0, s.cd || 0); d.dodge = 0.45; d.shot = true; d.actor = e; d.vis = 'actor';
        d.los = true; d.losY = 1.3; see(d, e.pos.x, e.pos.y + 1, e.pos.z);   // (a twister stops at a wall: cover)
        break;
      }
    }
  }
  // (a pooled entry not registered this frame is gone — or only a prediction cache nobody used: dropped)
  for (const [k, d] of _pool) if (d.gen !== _gen && !(d.gen === -1 && now - d.pT < 0.2)) _pool.delete(k);
  return _list;
}

// how much of a hit on e (from a shooter at ax, ay, az) gets through: 1 all · 0.25 a Tidal Slam's armoured leap · 0
// nothing (Bubble Guard, Kraken, a Crab Rig's hull from its front / sides, a Mega Stamp's guarded front, a fresh
// respawn's protection — more than a second of it left; a slam's 0.3 s landing grace is gone before a shot gets there)
export function immunity(e, ax, ay, az) {
  if (!e || !e.alive) return 1;
  if (e.invuln > 1) return 0;
  if (e.status && e.status.shield > 0.15) return 0;
  const s = e.specialActive;
  if (!s) return 1;
  switch (s.kind || s.id) {
    case 'kraken': return 0;
    case 'slam': return s.armor ? 0.25 : 1;
    case 'crab': {
      if (s.roll) return 0;
      const rx = ax - e.pos.x, rz = az - e.pos.z, rl = Math.hypot(rx, rz) || 1, h = s.hull ?? e.yaw;
      return (rx * Math.sin(h) + rz * Math.cos(h)) / rl < -0.45 || ay > e.pos.y + 2.4 ? 1 : 0;
    }
    case 'stamp': {
      // (its front is treated as guarded the whole time: the swings come every 0.42 s and can't be timed)
      const rx = ax - e.pos.x, rz = az - e.pos.z, rl = Math.hypot(rx, rz) || 1, fy = s.bodyYaw ?? e.yaw;
      return (rx * Math.sin(fy) + rz * Math.cos(fy)) / rl >= Math.cos((SPECIALS.stamp.deflectArc * Math.PI) / 180) ? 0 : 1;
    }
  }
  return 1;
}
// busy with a special that leaves them defenceless (or floating in the open): worth taking first (targetBias)
export function vulnerable(e) {
  const s = e && e.specialActive;
  if (!s) return false;
  switch (s.kind || s.id) {
    case 'booyah': return !s.thrown;
    case 'wail': case 'sonar': case 'blower': case 'jetpack': return true;
    case 'strike': return !!s.aiming;
  }
  return false;
}
// the cause of a splat, as a special (null: not one): Bomb Barrage's bombs by their thrower's barrage
export function specialCause(e) {
  const c = String(e && e.cause || '');
  if (SPECIALS[c] && !SPECIALS[c].kind) return c;
  if (BOMB[c] && barrage(e.attacker)) return 'barrage';
  return null;
}
on('special:end', (e) => { if (e && e.actor && SPECIALS[e.id]?.kind === 'barrage') _barEnd.set(e.actor, G.time); });
on('damage', (e) => { const sp = e && e.victim && e.victim.bot && e.victim.bot.sp; if (sp) sp.hitT[e.source] = G.time; });
on('splatted', (e) => { if (!e || !e.victim || !e.victim.bot) return; const c = specialCause(e); if (c) SPECIAL_STATS.splattedBy[c] = (SPECIAL_STATS.splattedBy[c] || 0) + 1; });

// ------------------------------------------------------------------------------------------------ area geometry
// how deep (x, y, z) is inside d (m to its edge; 0 = outside), tau s from now (a drifting cloud / a running foe moves
// on; a projectile's line is clear again once it's gone by; over: everything's over after tOut — false: where it will
// have hurt, whenever we get there)
function inside(d, x, y, z, tau = 0, over = true) {
  if (over && tau > d.tOut) return 0;
  if (d.shape === 0) {
    if (y < d.yLo || y > d.yHi) return 0;
    const k = Math.min(tau, d.vt), h = Math.hypot(x - d.x - d.vx * k, z - d.z - d.vz * k);
    return h < d.r ? d.r - h + 0.01 : 0;
  }
  if (d.d3) {
    const vx = x - d.x, vy = y + 0.8 - d.y, vz = z - d.z, al = vx * d.ux + vy * d.uy + vz * d.uz;
    if (al < -d.back || al > d.len / Math.max(0.3, Math.hypot(d.ux, d.uz)) + 0.5) return 0;
    const px = vx - d.ux * al, py = vy - d.uy * al, pz = vz - d.uz * al, pr = Math.hypot(px, py, pz);
    return pr < d.r ? d.r - pr + 0.01 : 0;
  }
  if (y < d.yLo || y > d.yHi) return 0;
  const vx = x - d.x, vz = z - d.z, al = vx * d.dx + vz * d.dz;
  if (al < -d.back || al > d.len + 0.3) return 0;
  if (d.speed > 0 && tau > d.delay + Math.max(0, al) / d.speed + 0.15) return 0;
  const pr = Math.abs(vx * d.dz - vz * d.dx);
  return pr < d.r ? d.r - pr + 0.01 : 0;
}
// s until d hurts at (x, z) (a projectile's line: when it gets there)
function tInAt(d, x, z) {
  if (d.speed > 0) return d.delay + Math.max(0, (x - d.x) * d.dx + (z - d.z) * d.dz) / d.speed;
  return d.tIn;
}
// flat distance from (x, z) to d's area (0 inside)
function distTo(d, x, z) {
  if (d.shape === 0) return Math.max(0, Math.hypot(x - d.x, z - d.z) - d.r);
  const vx = x - d.x, vz = z - d.z, al = clamp(vx * d.dx + vz * d.dz, 0, d.len);
  return Math.max(0, Math.hypot(vx - d.dx * al, vz - d.dz * al) - d.r);
}

// ------------------------------------------------------------------------------------------------ routes
// per-team nav cost of the lingering areas that team's bots know about (rebuilt ~3×/s): all (light ones too) and hard
// (heavy / lethal only — a zone guard or a tower rider takes a Tempest); routes into newly marked nodes re-plan
export function dangerCost(team, hardOnly = false) {
  const nav = G.nav;
  if (!nav || team < 0 || team > 1) return null;
  specialDangers();
  const N = nav.nodes.length;
  let L = LAY[team];
  if (!L || L.nav !== nav || L.all.length !== N) L = LAY[team] = { nav, all: new Uint8Array(N), hard: new Uint8Array(N), prev: new Uint8Array(N), t: -9, any: false, anyHard: false };
  if (G.time - L.t > 0.3 || G.time < L.t || (DIRTY[team] && G.time > L.t)) { DIRTY[team] = false; rebuild(L, team); }
  return hardOnly ? (L.anyHard ? L.hard : null) : (L.any ? L.all : null);
}
function rebuild(L, team) {
  L.t = G.time;
  const nav = G.nav, K = TEAMK[team];
  for (const k of K) { const d = _pool.get(k); if (!d || d.gen !== _gen) K.delete(k); }
  L.prev.set(L.all); L.all.fill(0); L.hard.fill(0); L.any = L.anyHard = false;
  for (const d of _list) {
    if (d.team === team || !d.linger || !K.has(d.key) || d.tIn > 6) continue;
    mark(nav, d, d.lethal === 2 ? 60 : d.lethal === 1 ? 25 : 8, L);
  }
  if (!L.any) return;
  for (const a of G.actors) {
    const b = a.bot, sp = b && b.sp;
    if (!sp || a.team !== team || !b.path || !a.alive || G.time < sp.replanT || !sp.on()) continue;
    const C = sp._objective() ? L.hard : L.all;
    for (let i = Math.max(0, (b.pi | 0) - 1), n = Math.min(b.path.length, (b.pi | 0) + 30); i < n; i++) {
      const id = b.path[i];
      if (C[id] && L.all[id] > L.prev[id]) { b.path = null; b.repath = 0; sp.replanT = G.time + 0.6; SPECIAL_STATS.avoidedPath++; break; }
    }
  }
}
function mark(nav, d, c, L) {
  const r = d.r + 0.4, st = nav.step;
  let x0, x1, z0, z1, ex = 0, ez = 0;
  if (d.shape === 0) {
    const k = Math.min(d.vt, d.tOut); ex = d.vx * k; ez = d.vz * k;
    x0 = Math.min(d.x, d.x + ex) - r; x1 = Math.max(d.x, d.x + ex) + r; z0 = Math.min(d.z, d.z + ez) - r; z1 = Math.max(d.z, d.z + ez) + r;
  } else {
    const hx = d.x + d.dx * d.len, hz = d.z + d.dz * d.len;
    x0 = Math.min(d.x, hx) - r; x1 = Math.max(d.x, hx) + r; z0 = Math.min(d.z, hz) - r; z1 = Math.max(d.z, hz) + r;
  }
  const ix0 = Math.max(0, Math.floor((x0 - nav.x0) / st)), ix1 = Math.min(nav.nx - 1, Math.ceil((x1 - nav.x0) / st));
  const iz0 = Math.max(0, Math.floor((z0 - nav.z0) / st)), iz1 = Math.min(nav.nz - 1, Math.ceil((z1 - nav.z0) / st));
  const hard = d.lethal >= 1, sl = ex * ex + ez * ez;
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    const cell = nav.cells[iz * nav.nx + ix];
    if (!cell) continue;
    for (const id of cell) {
      const n = nav.nodes[id];
      let hit = false;
      if (d.shape === 0) {
        if (n.y < d.yLo - 0.3 || n.y > d.yHi) continue;
        // (a drifting cloud: the stretch it'll cover)
        let px = n.x - d.x, pz = n.z - d.z;
        if (sl > 1e-4) { const u = clamp((px * ex + pz * ez) / sl, 0, 1); px -= ex * u; pz -= ez * u; }
        hit = px * px + pz * pz < r * r;
      } else { const r0 = d.r; d.r = r; hit = inside(d, n.x, n.y, n.z, 0) > 0; d.r = r0; }
      if (!hit) continue;
      if (L.all[id] < c) L.all[id] = c;
      L.any = true;
      if (hard) { if (L.hard[id] < c) L.hard[id] = c; L.anyHard = true; }
    }
  }
}

// ------------------------------------------------------------------------------------------------ per bot
export class SpecialSense {
  constructor(brain) {
    this.b = brain; this.a = brain.a;
    this.recs = new Map();       // danger key → what this bot knows of it ({ d, at: acted on from, miss, lastT, … })
    this.known = [];             // the ones it's acting on now
    this.hitT = Object.create(null);   // damage source → when it last hurt us (evaded / caught)
    this.reset();
  }
  reset() {
    this.recs.clear(); this.known.length = 0; this.scanT = Math.random() * 0.2; this._rays = 0; this.gone = [];
    this.esc = null; this.replanT = 0; this.prevTgt = null; this.held = null; this.heldT = 0; this.knockOn = null;
    this.pop = null; this.popT = 0; this.popTgt = null; this.guardT = 0;
  }
  on() { const S = SPECIAL_AI; return S.enabled && (!S.teams || !!S.teams[this.a.team]) && !G.boss && !!G.nav; }
  dead() { this.esc = null; this.pop = null; }

  // per frame, right after the brain's look round: what it has noticed (a new look every ~0.2 s)
  tick(dt) {
    if (!this.on()) { if (this.recs.size || this.esc) this.reset(); return; }
    specialDangers();
    if ((this.scanT -= dt) <= 0) { this.scanT = 0.1 + Math.random() * 0.05; this._scan(); }
    this._known();
  }
  _known() {
    const now = G.time, K = this.known, team = TEAMK[this.a.team];
    K.length = 0;
    for (const r of this.recs.values()) {
      if (r.miss || now < r.at || r.d.gen !== _gen) continue;
      if (r.d.actor && now - r.lastT > 0.8) continue;
      if (!r.noted) { r.noted = true; SPECIAL_STATS.noticed++; }
      if (!team.has(r.key)) { team.add(r.key); DIRTY[this.a.team] = true; }
      K.push(r);
    }
  }
  // one look round: new dangers a player in our shoes would notice now (after our reaction time); a special on a player
  // stays known while we still see / hear them; what's over is forgotten (and scored: evaded or caught)
  _scan() {
    const a = this.a, b = this.b, now = G.time;
    const ex = a.pos.x, ey = a.pos.y + 1.3, ez = a.pos.z, fx = Math.sin(b.aimYaw), fz = Math.cos(b.aimYaw), cone = Math.cos(SIGHT.fov), aw = b.diff.awareness;
    const fighting = b.mode === 'fight' && b.seeTimer > 0;
    this._rays = 3;
    for (const r of this.recs.values()) r.live = false;
    for (const d of _list) {
      if (d.team === a.team || distTo(d, ex, ez) > 45) continue;
      let r = this.recs.get(d.key);
      if (r) {
        r.live = true; r.d = d;
        if (d.actor && this._sense(d, ex, ey, ez, fx, fz, cone, aw, r)) r.lastT = now;
        continue;
      }
      if (!this._sense(d, ex, ey, ez, fx, fz, cone, aw, null)) continue;
      const sx = d.sx - ex, sz = d.sz - ez, sl = Math.hypot(sx, sz), inCone = sl < SIGHT.near || (sx * fx + sz * fz) / (sl || 1) > cone;
      // (a telegraphed special registers a little quicker than a flick onto a foe: 0.6–1.0 × the reaction time; later
      // mid-fight and off to the side)
      const watching = !!b.target && (d.actor === b.target || d.owner === b.target) && b.seeTimer > 0;
      const at = now + b.diff.reaction * (0.6 + Math.random() * 0.4) + (fighting && !watching ? 0.05 + Math.random() * 0.1 : 0) + (inCone || watching ? 0 : 0.2);
      let at2 = at;
      for (const q of this.gone) if (q.src === d.src && now - q.t < 1 && Math.hypot(q.x - d.x, q.z - d.z) < 2.5) { at2 = Math.min(at, Math.max(now, q.at)); break; }
      const miss = at2 === at && d.fast && Math.random() < (MISS[b.diff.id] ?? 0.18);
      if (miss) SPECIAL_STATS.missed++;
      // (jit: how far off its read of a zooka's rhythm is — a hard bot within ~0.05 s, an easy one ~0.2 s)
      const jit = (Math.random() - 0.5) * 0.9 * (1.05 - b.diff.fireDiscipline);
      this.recs.set(d.key, { key: d.key, d, at: at2, miss, lastT: now, live: true, t0: now, noted: false, wasIn: false, cover: false, backed: false, rayT: -9, jit });
    }
    // (what's over: scored, and kept a moment — the vortex a missile turns into is the same danger)
    for (let i = this.gone.length - 1; i >= 0; i--) if (now - this.gone[i].t > 1) this.gone.splice(i, 1);
    for (const [k, r] of this.recs) if (!r.live) { this._gone(r); if (!r.miss) this.gone.push({ src: r.d.src, x: r.d.x, z: r.d.z, t: now, at: r.at }); this.recs.delete(k); }
    // behind cover from a blast that needs a sight line from its centre? (one look each, at those we're in)
    for (const r of this.recs.values()) {
      const d = r.d;
      r.cover = false;
      if (!d.los || r.miss || now < r.at || this._rays <= 0 || !inside(d, a.pos.x, a.pos.y, a.pos.z, 0)) continue;
      this._rays--;
      r.cover = !G.physics.los(_p.set(d.x, d.y + d.losY, d.z), _q.set(a.pos.x, a.pos.y + 0.8, a.pos.z));
    }
  }
  // could a player here know about d? (vis: see the header)
  _sense(d, ex, ey, ez, fx, fz, cone, aw, r) {
    const b = this.b, dx = d.sx - ex, dz = d.sz - ez, dh = Math.hypot(dx, dz), dist = Math.hypot(dh, d.sy - ey);
    if (d.vis === 'map') return dist < 42;
    if (d.vis === 'actor') return b.sight.sees(d.actor) || dist < SIGHT.near;
    if (dist < (d.vis === 'big' ? d.hear || 9 : 5)) return true;
    if (d.actor && b.sight.sees(d.actor)) return true;
    if (dist > aw + (d.vis === 'big' ? 10 : 0)) return false;
    if (dh > 0.5 && (dx * fx + dz * fz) / dh < cone) return false;
    if (r && G.time - r.rayT < 0.4) return false;
    if (this._rays <= 0) return false;
    this._rays--;
    if (r) r.rayT = G.time;
    return G.physics.los(_p.set(ex, ey, ez), _q.set(d.sx, d.sy, d.sz));
  }
  _gone(r) {
    const d = r.d;
    if (!r.noted || !r.wasIn || d.lethal < 1 || d.imm || d.pop) return;
    if (!this.a.alive || (this.hitT[d.hit] ?? -9) > r.t0) SPECIAL_STATS.caught++; else SPECIAL_STATS.evaded++;
  }

  // holding the objective (a zone guard / watcher, on the zone; a tower rider): a light area (rain) is taken
  _objective() {
    const b = this.b, m = G.match;
    if (m && m.zones && b.zRole) {
      if (b.zRole === 'guard' || b.zRole === 'watch') return true;
      const z = m.zones.zones && m.zones.zones[b.zZone];
      return !!z && Math.hypot(this.a.pos.x - z.center[0], this.a.pos.z - z.center[2]) < 9;
    }
    return !!(m && m.tower && b.tRole === 'ride');
  }
  // one of theirs we know of (in sight or seen lately) close enough to (x, z) to shoot it — set their bubble off
  _popper(x, z) {
    const now = G.time;
    for (const [e, k] of this.b.sight.mem) {
      if (!e.alive || !(k.seen || now - k.t < 2)) continue;
      if (Math.hypot(k.pos.x - x, k.pos.z - z) < clamp(weaponRange(e.weapon || {}) + 2, 8, 28)) return true;
    }
    return false;
  }
  // does d count right now, here (tIn: when it hurts here)? obj: holding the objective
  _urgent(d, r, tIn, obj) {
    if (r.cover) return false;   // (a wall between us and its centre / its gun: cover)
    if (d.shot) return d.delay + r.jit < 0.4;   // (a zooka's line: out of it just before the shot, at any range)
    if (d.dodge && tIn > d.dodge) return false;
    if (tIn > 3.2) return false;
    // (a light area on the objective: taken while healthy — at half health, off: under 45 % a tower rider still on the
    // deck was splatted in the rain now and then (~1 in 20) before it was clear of the cloud)
    if (d.lethal === 0) return !obj || this.a.hp < PLAYER.hp * 0.5;
    if (d.pop && !(d.obj && d.obj.charge > 0) && !this._popper(d.x, d.z)) return false;
    return true;
  }
  // our own body is safe from it all anyway (untouchable, up in the air on a leap / a jet, mid-zip)
  _selfSafe() {
    const a = this.a, s = a.specialActive, k = s && (s.kind || s.id);
    return a.status.shield > 1 || k === 'kraken' || k === 'slam' || k === 'jetpack' || k === 'zipcaster';
  }
  // in any other noticed area that would hurt (x, y, z) tau s from now
  _inAny(x, y, z, tau, skip) {
    for (const r of this.known) {
      const d = r.d;
      if (d === skip || d.lethal < 1 || (d.pop && !this._popper(d.x, d.z))) continue;
      if (inside(d, x, y, z, tau) && tInAt(d, x, z) - tau < 2.5) return true;
    }
    return false;
  }

  // per frame, after every other system has had its say (fight footwork, devices, the tower, climbing): get out of a
  // noticed danger, don't step into one, hold fire on the untouchable; returns an aim to hold (popping our bubble) or null
  act(dt, it, move) {
    if (!this.on()) return null;
    const a = this.a;
    this._watchTarget();
    if (!a.alive || a.superJumpState) { this.esc = null; return null; }
    specialDangers();
    const safe = this._selfSafe() || a.climbing;
    const r = safe ? null : this._here();
    if (r) this._escape(r, dt, it, move);
    else {
      if (this.esc) this._endEsc();
      if (!safe) this._guard(move);
    }
    this._fire(it, dt);
    return r ? null : this._popAim(dt, it);
  }
  // the worst noticed danger we're standing in that counts now
  _here() {
    const a = this.a, x = a.pos.x, y = a.pos.y, z = a.pos.z, obj = this._objective();
    let best = null, bs = 0;
    for (const r of this.known) {
      const d = r.d;
      if (!inside(d, x, y, z, 0)) continue;
      const tIn = tInAt(d, x, z);
      if (!this._urgent(d, r, tIn, obj)) continue;
      r.wasIn = true;
      const sc = (d.lethal === 2 ? 3 : d.lethal === 1 ? 1.5 : 0.6) / (0.25 + tIn);
      if (sc > bs) { bs = sc; best = r; }
    }
    return best;
  }
  _escape(r, dt, it, move) {
    const a = this.a, b = this.b, now = G.time, d = r.d;
    let E = this.esc;
    // (sub-tweaks) a fresh way out at once when the area changed under us: it stopped (a Skitter Bomb stopping to wind
    // up — its way out was picked from where it was heading), or a still one's middle shifted (moving ones re-pick on
    // their usual beat)
    const mv = d.vt > 0 && Math.hypot(d.vx, d.vz) > 0.5;
    if (E && E.r === r && ((E.mv && !mv) || (!mv && Math.hypot(d.x - E.cx, d.z - E.cz) > 0.75))) E.reT = now;
    if (!E || E.r !== r || now >= E.reT) {
      const fresh = !E || E.r !== r;
      const pk = this._pick(r);
      if (fresh) {
        SPECIAL_STATS.escapes++;
        if (d.imm && !r.backed) { r.backed = true; SPECIAL_STATS.backedOff++; }
      }
      E = this.esc = { r, yaw: pk.yaw, swim: pk.swim, spare: pk.spare, reT: now + 0.28 + (1 - b.diff.fireDiscipline) * 0.5, mv, cx: d.x, cz: d.z };
    }
    move.set(Math.sin(E.yaw), 0, Math.cos(E.yaw));
    // shooting (and charging, rolling, brushing) slows a kid down: none while getting out of a blast, unless there's
    // a second to spare and the weapon keeps its pace (backing off from the untouchable: the fight's own trigger)
    const w = a.weapon, slowGun = CHARGE[w.kind] || w.kind === 'roller' || w.kind === 'brush' || MAIN_KITS[w.kind]?.bot?.charges || MAIN_KITS[w.kind]?.bot?.melee || (w.moveSpeedFiring || 6) < 4.4;
    if (!d.imm && (slowGun || E.spare < 1)) { it.fire = false; it.sub = false; b._bombAim = false; }
    // (a charger mid-charge or just after its shot walks at 1.8 m/s: a squid hops faster even on bare ground)
    const noSq = a.specialActive && a.specialActive.noSquid, wr = a.weaponRunner;
    const slowKid = !d.imm && (wr.charging || wr.firingT > 0.05) && (a.weapon.moveSpeedFiring || 6) < PLAYER.squidDrySpeed;
    if (!noSq && !b._squidWouldDrop(move) && ((E.swim && a.groundTeam === 1) || (slowKid && a.groundTeam !== 2))) { it.squid = true; it.fire = false; it.sub = false; b._bombAim = false; }
    else it.squid = false;
    // a Tidal Slam: at its edge, a hop on the landing beat lifts us out of the kill ring (3D distance)
    if (d.src === 'slam' && a.grounded && b.jumpCd <= 0) {
      const tIn = tInAt(d, a.pos.x, a.pos.z), h = Math.hypot(a.pos.x - d.x, a.pos.z - d.z);
      if (tIn > 0.08 && tIn < 0.3 && h > d.core - 1 && h < d.core + 0.8) { it.jump = true; b.jumpCd = 0.6; SPECIAL_STATS.hops++; }
    }
    b.noProg = 0; b.bestD = Infinity;   // (off the route on purpose: not "stuck")
  }
  _endEsc() {
    const b = this.b;
    this.esc = null;
    b.path = null; b.repath = 0;   // (back to the job: a fresh route, round what's still there)
  }
  // the quickest safe line out of d: 12 headings from straight out (a disc: away from its centre; a line: across it,
  // to the side we're on), each walked out in 0.5 m steps to where it's clear of d and every other noticed area (at
  // the time we'd get there) — or behind cover from a blast; the sea, a big drop, a wall or a way through another area
  // rule a heading out. Scored by the time to spare (swimming in our ink, wading in theirs), how far, our ink at the
  // end, the way to our teammates; easy bots judge it roughly (noise)
  _pick(r) {
    const a = this.a, b = this.b, d = r.d, x0 = a.pos.x, y0 = a.pos.y, z0 = a.pos.z;
    const tIn = tInAt(d, x0, z0);
    let base;
    if (d.shape === 0) {
      const k = Math.min(0.3, d.vt), cx = d.x + d.vx * k, cz = d.z + d.vz * k;
      base = Math.hypot(x0 - cx, z0 - cz) > 0.2 ? Math.atan2(x0 - cx, z0 - cz) : Math.random() * Math.PI * 2;
    } else { const sg = (x0 - d.x) * d.dz - (z0 - d.z) * d.dx >= 0 ? 1 : -1; base = Math.atan2(d.dz * sg, -d.dx * sg); }
    // toward teammates close by (else home)
    let hx = 0, hz = 0, hn = 0;
    for (const o of G.actors) {
      if (o === a || o.team !== a.team || !o.alive || inside(d, o.pos.x, o.pos.y, o.pos.z, 0)) continue;
      const dd = Math.hypot(o.pos.x - x0, o.pos.z - z0);
      if (dd < 25 && dd > 2) { hx += (o.pos.x - x0) / dd; hz += (o.pos.z - z0) / dd; hn++; }
    }
    if (!hn) { const h = G.level.spawnPads[a.team]; hx = h.x - x0; hz = h.z - z0; }
    { const l = Math.hypot(hx, hz) || 1; hx /= l; hz /= l; }
    const own = a.groundTeam === 1, noise = (1 - b.diff.fireDiscipline) * 2.2, prev = this.esc && this.esc.r === r ? this.esc.yaw : null;
    let best = null;
    for (let k = 0; k < 12; k++) {
      const yaw = base + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6)), sx = Math.sin(yaw), sz = Math.cos(yaw);
      let exit = -1, py = y0, blocked = 0, through = false, cover = false, looks = 0;
      for (let s = 0.5; s <= 11; s += 0.5) {
        const px = x0 + sx * s, pz = z0 + sz * s, gy = G.level.groundHeight(px, pz, py + 0.6);
        if (gy === -Infinity || gy < py - 2.6) { blocked = s; break; }
        py = gy;
        // (out of d: out of its area — the time it takes to get there is the spare-time score's business)
        const tA = s / PLAYER.runSpeed, inD = inside(d, px, py, pz, tA, false) > 0, inO = this._inAny(px, py, pz, tA, d);
        if (inO) through = true;
        if (!inD && !inO) { exit = s; break; }
        if (d.los && inD && looks < 2 && (s === 1.5 || s === 3)) {
          looks++;
          if (!inO && !G.physics.los(_p.set(d.x, d.y + d.losY, d.z), _q.set(px, py + 0.8, pz))) { exit = s; cover = true; break; }
        }
      }
      let sc, swim = false, spare = -9;
      if (exit < 0) sc = -20 + (blocked || 11) * 0.3;
      else {
        const ex = exit + (cover ? 0.3 : LEAVE), ux = x0 + sx * ex, uz = z0 + sz * ex;
        if (!b._dryLine(x0, y0, z0, ux, uz) || !b._fatLos(x0, y0, z0, ux, py, uz)) sc = -12 - ex * 0.2;
        else {
          G.paint.regionStats(x0 + sx * ex * 0.5, py, z0 + sz * ex * 0.5, 1.2, a.team, _st);
          swim = own && _st.n > 0 && _st.own > 0.55;
          const slow = _st.n > 0 && _st.enemy > 0.5;
          const sp = swim ? PLAYER.swimSpeed * 0.85 : slow ? PLAYER.enemyInkSpeed + 1 : PLAYER.runSpeed * 0.9;
          const t = ex / sp + (swim ? 0.05 : 0.12);
          spare = tIn - t;
          // (the pull toward teammates, and keeping the heading we had, only count when there's time to spare)
          const easy = clamp(spare, 0, 1);
          sc = clamp(spare, -2, 1.2) * 3 - ex * 0.2 + (cover ? 0.4 : 0) + (_st.n ? _st.own * 0.6 : 0) + (sx * hx + sz * hz) * 0.4 * easy - (through ? 4 : 0)
            - (G.nav.nearest(_p.set(ux, py, uz), 1.2) < 0 ? 3 : 0) + (prev !== null ? Math.cos(yaw - prev) * (0.15 + 0.35 * easy) : 0);
        }
      }
      sc += (Math.random() - 0.5) * noise;
      if (!best || sc > best.sc) best = { sc, yaw, swim, spare };
    }
    return best;
  }
  // walking on: never a step into a lethal / heavy area we're not in (slide along its edge, else stop and re-plan)
  _guard(move) {
    const ml = Math.hypot(move.x, move.z);
    if (ml < 0.05 || !this.known.length) return;
    const a = this.a, x0 = a.pos.x, y0 = a.pos.y, z0 = a.pos.z;
    const bad = (yw) => {
      const sx = Math.sin(yw), sz = Math.cos(yw);
      for (const r of this.known) {
        const d = r.d;
        if (d.lethal < 1 || (d.pop && !this._popper(d.x, d.z)) || inside(d, x0, y0, z0, 0)) continue;
        for (const s of [0.8, 1.7]) {
          const px = x0 + sx * s, pz = z0 + sz * s, tA = s / PLAYER.runSpeed;
          if (!inside(d, px, y0, pz, tA)) continue;
          const tI = tInAt(d, px, pz) - tA;
          if (d.shot ? d.delay < 0.5 : (d.linger || tI < 2.2) && !(d.dodge && tI > d.dodge)) return true;
        }
      }
      return false;
    };
    const yaw = Math.atan2(move.x, move.z);
    if (!bad(yaw)) return;
    const sg = this.guardSide || 1;
    for (const off of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const yw = yaw + off * sg;
      if (!bad(yw)) { this.guardSide = Math.sign(off) * sg; move.set(Math.sin(yw) * ml, 0, Math.cos(yw) * ml); return; }
    }
    move.set(0, 0, 0);
    const b = this.b;
    if (G.time - this.guardT > 1) { this.guardT = G.time; SPECIAL_STATS.guard++; if (b.path) { b.path = null; b.repath = 0; } }
  }
  // no shots / subs into the untouchable (unless the shove pays), none into an enemy bubble in the way — only when the
  // aim is on the target (a sprout pod, a device, a wall column, the tower's deck … are other systems' shots)
  _fire(it, dt) {
    const a = this.a, b = this.b, T = b.target;
    if (!T || b.mode !== 'fight' || !(b.seeTimer > 0) || !T.alive) return;
    if (!it.fire && !it.sub && !b._bombAim && !a.weaponRunner.charging) return;
    if (Math.abs(angleDiff(b.aimYaw, Math.atan2(T.pos.x - a.pos.x, T.pos.z - a.pos.z))) > 0.45) return;
    if (immunity(T, a.pos.x, a.pos.y, a.pos.z) < 0.3) {
      if (this._knock(T) || this._crabFar(T)) { if (this.knockOn !== T) { this.knockOn = T; SPECIAL_STATS.knockShots++; } return; }
      this._hold(it);
      it.sub = false; b._bombAim = false;
      SPECIAL_STATS.heldFire += dt;
      return;
    }
    if (this._bubbleInLine(T)) { this._hold(it); SPECIAL_STATS.bubbleHold += dt; }
  }
  // no shot now: a charge weapon keeps what it has charged (letting go fires it) and starts no new one
  _hold(it) {
    const a = this.a, w = a.weapon, wr = a.weaponRunner;
    it.fire = !!((CHARGE[w.kind] || MAIN_KITS[w.kind]?.bot?.charges) && wr.charging && !wr.streaming && !(wr.burstT > 0));
  }
  // shooting it shoves it (Kraken, Bubble Guard): worth it with the sea right behind it, or off the tower
  _knock(e) {
    const kind = e.status && e.status.shield > 0.15 ? 'bubble' : e.specialActive && e.specialActive.kind === 'kraken' ? 'kraken' : null;
    if (!kind) return false;
    const T = G.match && G.match.tower;
    if (T && T.riderList && T.riderList.includes(e)) return true;
    const a = this.a, dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, l = Math.hypot(dx, dz) || 1;
    if (l > this.b._range() * 1.05) return false;
    // (off the deck the shove is small — a hit adds ≤ 1.6 m/s and a standing kid brakes it — so only right at the edge)
    for (const s of [0.5, 0.9]) if (G.level.groundHeight(e.pos.x + (dx / l) * s, e.pos.z + (dz / l) * s, e.pos.y + 0.6) === -Infinity) return true;
    return false;
  }
  // a Crab Rig's tank from beyond its gun's reach: it can't answer, so every hit on the hull counts
  _crabFar(e) {
    const s = e.specialActive;
    return !!s && s.kind === 'crab' && !s.roll && Math.hypot(e.pos.x - this.a.pos.x, e.pos.z - this.a.pos.z) > SPECIALS.crab.gunRange + 1.5;
  }
  // an enemy bubble on the line from our eyes to it (it soaks every shot)
  _bubbleInLine(T) {
    const a = this.a, ex = a.pos.x, ey = a.pos.y + 1.1, ez = a.pos.z, tx = T.pos.x - ex, ty = T.pos.y + 0.85 - ey, tz = T.pos.z - ez, L2 = tx * tx + ty * ty + tz * tz;
    if (L2 < 1e-4) return false;
    for (const w of G.specials?.world || []) {
      if (w.kind !== 'bubble' || w.dead || w.team === a.team) continue;
      const vx = w.pos.x - ex, vy = w.pos.y - ey, vz = w.pos.z - ez, u = clamp((vx * tx + vy * ty + vz * tz) / L2, 0, 1);
      if (Math.hypot(vx - tx * u, vy - ty * u, vz - tz * u) < w.r * 0.95) return true;
    }
    return false;
  }
  // target bookkeeping: switched off an untouchable foe (retargeted), back on one whose special is over (re-engaged),
  // going for a defenceless one (hunted)
  _watchTarget() {
    const a = this.a, b = this.b, T = b.target, P = this.prevTgt;
    if (T !== P) {
      if (P && T && P.alive && b.sight.sees(P) && immunity(P, a.pos.x, a.pos.y, a.pos.z) < 0.3 && !this._knock(P)) SPECIAL_STATS.retargeted++;
      if (T && vulnerable(T) && b.sight.sees(T)) SPECIAL_STATS.hunted++;
      this.prevTgt = T;
    }
    // foes we've seen untouchable (a shield, a kraken, a crab, a stamp): the first time one is our target again with
    // it over, that's a re-engage
    const H = this.held || (this.held = new Map()), now = G.time;
    if (((this.heldT = (this.heldT || 0) - 1) <= 0)) {
      this.heldT = 6;
      for (const [e, k] of b.sight.mem) {
        if (!k.seen || !e.alive) continue;
        const kind = e.status && e.status.shield > 0.15 ? 'bubble' : e.specialActive && e.specialActive.kind;
        if (kind === 'bubble' || kind === 'kraken' || kind === 'crab' || kind === 'stamp') H.set(e, { kind, t: now });
      }
    }
    for (const [e, h] of H) {
      if (!e.alive || now - h.t > 12) { H.delete(e); continue; }
      const over = h.kind === 'bubble' ? !(e.status.shield > 0.15) : !(e.specialActive && e.specialActive.kind === h.kind);
      if (over && T === e && b.seeTimer > 0) { H.delete(e); SPECIAL_STATS.reengaged++; }
    }
  }
  // the target score (BotBrain._perceive: lower is preferred): the untouchable last, the defenceless first
  targetBias(e, dist) {
    if (!this.on()) return 0;
    const a = this.a;
    if (immunity(e, a.pos.x, a.pos.y, a.pos.z) < 0.3) return this._knock(e) || this._crabFar(e) ? 0 : 30;
    if (!vulnerable(e)) return 0;
    // (a jetpacker only once it's in reach — walking out under one is how bots got splatted by it; the defenceless ones
    // are worth a few steps)
    return e.specialActive.kind === 'jetpack' ? (dist < this.b._range() ? -5 : 0) : dist < this.b._range() * 1.2 + 4 ? -5 : 0;
  }
  // the route costs this bot plans with (null: nothing known)
  cost() { return this.on() ? dangerCost(this.a.team, this._objective()) : null; }
  // a goal node inside a known area → the nearest clear node round it (≤ 16 m by the graph), else the goal as it was
  goalOk(g) {
    if (g < 0 || !this.on()) return g;
    const C = this.cost();
    if (!C || !C[g]) return g;
    const nav = G.nav, N = nav.nodes.length;
    if (!this._bfsSeen || this._bfsSeen.length !== N) { this._bfsSeen = new Uint32Array(N); this._bfsQ = new Int32Array(N); this._bfsS = 0; }
    const seen = this._bfsSeen, Q = this._bfsQ, st = ++this._bfsS, g0 = nav.nodes[g];
    let h = 0, tl = 0; Q[tl++] = g; seen[g] = st;
    while (h < tl && tl < 900) {
      const id = Q[h++], n = nav.nodes[id];
      if (!C[id] && nav.valid[id]) { SPECIAL_STATS.goalMoved++; return id; }
      for (const e of n.nb) {
        const m = nav.nodes[e.to];
        if (seen[e.to] === st || Math.hypot(m.x - g0.x, m.z - g0.z) > 16 || (m.zone >= 0 && m.zone !== this.a.team)) continue;
        seen[e.to] = st; Q[tl++] = e.to;
      }
    }
    return g;
  }
  // counter-play: one of their players inside the blast of our team's bubble, and we can see it → pop it (our shots
  // set it off). Steady-trigger weapons only (a flick / charge / swing can't be kept on a floating bubble). Returns the
  // aim to hold, or null
  _popAim(dt, it) {
    const a = this.a, b = this.b, W = G.specials && G.specials.world;
    if (!W || b.mode === 'refill' || a.climbing || a.specialActive || !POP[a.weapon.kind] || a.ink < 4) { this.pop = null; return null; }
    const range = b._range(), ey = a.pos.y + 1.1;
    // (one of theirs in the lethal part of its blast: ≤ 0.85 of it — seen, or just ducked out of sight there)
    const foeIn = (w) => { const R = w.r * SPECIALS.blower.blastMul * 0.85; for (const [e, k] of b.sight.mem) if (e.alive && (k.seen || G.time - k.t < 1.5) && Math.hypot(k.pos.x - w.pos.x, k.pos.y + 0.8 - w.pos.y, k.pos.z - w.pos.z) < R) return e; return null; };
    let w = this.pop;
    if (w && (w.dead || w.held || !foeIn(w))) w = this.pop = null;
    if (!w) {
      if ((this.popT -= dt) > 0) return null;
      this.popT = 0.3;
      let bd = range * 0.95;   // (its shots have to carry to a bubble floating 1.3 m up)
      for (const o of W) {
        if (o.kind !== 'bubble' || o.dead || o.held || o.team !== a.team) continue;
        const dd = Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z);
        if (dd > bd || dd < 1.5) continue;
        const e = foeIn(o);
        if (!e || (b.target && b.seeTimer > 0 && b.target !== e && Math.hypot(b.target.pos.x - a.pos.x, b.target.pos.z - a.pos.z) < range)) continue;
        if (!G.physics.los(_p.set(a.pos.x, ey, a.pos.z), _q.copy(o.pos))) continue;
        bd = dd; w = o;
      }
      if (!w) return null;
      this.pop = w; SPECIAL_STATS.popShots++;
    }
    const dx = w.pos.x - a.pos.x, dy = w.pos.y - ey, dz = w.pos.z - a.pos.z, dh = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, dh);
    it.squid = false;
    it.fire = Math.abs(angleDiff(b.aimYaw, yaw)) < Math.atan2(w.r * 0.8, dh) && Math.abs(b.aimPitch - pitch) < 0.25;
    return { yaw, pitch, dist: Math.max(1, Math.hypot(dh, dy)) };
  }
}
const POP = { shooter: true, blaster: true, dualies: true, twins: true, slosher: true, bucket: true };
