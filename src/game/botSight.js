// Bot perception: what a bot knows about each enemy (BotBrain.sight), instead of reading everyone's true position.
// A bot knows where a foe is only while it
//   · sees them — a sight line (physics.los: solid blocks and prop colliders block it; grates, rails and ink don't)
//     from its eyes to their chest or head, within its view range (difficulty awareness: 16 / 21 / 26 m) and inside
//     its view cone (±80° round where it's looking), or anywhere within 4 m of it (footsteps, splashes, a shove);
//   · or has them located — what the team's map shows (game/reveal.js: tracked by the Echo Orb, Lurk Mine, Tracer, Deep
//     Sonar; standing in our ink; hurt by our ink and not in their own; anything registered there) — (a tracked foe
//     in plain sight is seen whatever it's doing), or a super jump's landing marker (the spot, until they're down).
// Squids in their own ink: a still one is noticed only from within 2 m; a swimmer's ripples show within 1–9 m (the
// faster, the further) and only after 0.45 s of looking; a swimmer already in sight is followed out to 15 m while it
// keeps moving. A bot that saw a foe dive keeps the dive spot as its memory; one that never saw it go under has none.
// Out of sight, a foe is a memory: where, when and how fast it was last seen (or located) — never where it is now.
// Fresh (≤ 1.2 s) the bot pre-aims where it went (the last spot, run on along its heading up to a wall) and may spray
// that spot or lob a sub there; older, it could be there or gone — the bot looks round the spot (all of it in plain
// view and nobody there, or walked up to it: gone) or gives up and goes back to its job; after 6 s it's forgotten.
// Being hit by a main weapon from out of sight turns the bot to where the shot came from (a memory, not a sighting).
// Team plans (Tower Command's threat checks, Zone Control's specials) use teamKnown(): the union of the teammates'
// sightings, located foes and recent memories.
// Cost: the sight lines. Each bot re-checks every ~0.2 s (staggered by its think timer): ≤ 2 rays per foe in range and
// in its cone, 1 to run a lost target on to a wall, ≤ 4 to look round a remembered spot (≤ 3×/s each); the target in
// sight gets ≤ 2 more every 0.1 s in between (it ducks out of view: noticed within ~0.1 s, not a whole look later). All
// under a frame budget shared by every bot (a check over it waits a frame). Team queries cast no rays.
import * as THREE from 'three';
import { G, on } from '../core/ctx.js';
import { SUBS, SPECIALS, weaponRange } from '../config.js';
import { Hit } from './physics.js';
import { revealedTo } from './reveal.js';

export const SIGHT = {
  fov: 1.4,            // half-angle (rad) of the view cone round the bot's aim yaw
  near: 4,             // all-round awareness within this (m)
  stillR: 2,           // a still squid under its own ink: noticed only this close
  stillSpeed: 1,       // m/s below which a submerged squid counts as still
  swimR: 9,            // a swimmer's ripples: noticed out to this (at full swim speed; less when slower)
  swimK: 1.1,          // …m of range per m/s over stillSpeed
  swimNotice: 0.45,    // s of looking before a swimmer is noticed
  swimTrackR: 15,      // a swimmer already in sight (within swimFollow s) is followed this far while it moves
  swimFollow: 0.6,
  fresh: 1.2,          // s: a memory this young is pre-aimed / sprayed / chased
  keep: 6,             // s: forgotten after this (could be anywhere by now)
  spray: 0.6,          // s after losing sight a bot may still spray the spot
  runOn: 0.45,         // s of its last heading a lost foe is run on for the pre-aim
  lookEvery: 0.3,      // s between looks round a remembered spot
  recheck: 0.1,        // s: the target in sight is re-checked this often between full looks (it ducks out of view)
  frameRays: 24,       // sight lines per frame for all bots together
};
// what the bots' eyes cost and did (a match's totals; tests / botlab read and reset it)
export const SIGHT_STATS = { checks: 0, rays: 0, deferred: 0, seen: 0, lost: 0, cleared: 0, expired: 0, located: 0, jumps: 0, hits: 0, sprays: 0, memBombs: 0, hunts: 0 };

const _eye = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _h = new Hit();
let _frameT = -1, _frameRays = 0;
const ray = (a, b) => { _frameRays++; SIGHT_STATS.rays++; return G.physics.los(a, b); };

// a hit that reveals the shooter: a main weapon (not a sub, a special or a device) — the ink comes from where they are
const NOT_WEAPON = new Set(['ink', 'water', 'drop', 'sprinkler', 'slam']);
for (const id in SUBS) { NOT_WEAPON.add(id); if (SUBS[id].kind) NOT_WEAPON.add(SUBS[id].kind); }
for (const id in SPECIALS) { NOT_WEAPON.add(id); if (SPECIALS[id].kind) NOT_WEAPON.add(SPECIALS[id].kind); }
on('hit', (e) => {
  const v = e.victim, at = e.attacker, S = v && v.bot && v.bot.sight;
  if (!S || !at || at === v || at.team === v.team || !at.alive || NOT_WEAPON.has(e.weaponId)) return;
  if (at.pos.distanceTo(v.pos) > weaponRange(at.weapon || {}) + 4) return;
  S.hitBy = at; S.hitT = G.time;
});

// One enemy as a bot knows it. pos / vel: where and how fast it was when last known; guess: where the bot thinks it is
// (in sight: where it is; lost: the last spot run on along its heading, fresh; else the last spot)
export class Known {
  constructor(e) {
    this.e = e;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.guess = new THREE.Vector3(); this.v0 = new THREE.Vector3();
    this.t = -1e9;        // when last known (seen / located / hit by)
    this.seen = false;    // in sight at the last check
    this.seenT = -1e9;    // when last in sight
    this.src = '';        // 'sight' | 'track' | 'jump' | 'hit'
    this.dove = false;    // last seen as a squid: it may be lying in its ink there (a look at the spot doesn't clear it)
    this.dropped = false; // its bot gave up on it (not taken as a target again until it's seen again)
    this.lookT = 0;       // next look round the remembered spot
    this.view = null;
  }
  age() { return G.time - this.t; }
  // a stand-in for the actor that the fight code and kits read: in sight it's the actor itself; out of sight its
  // position is the guess, its velocity zero, its form the remembered one (never where it really is)
  get viewed() {
    if (this.view) return this.view;
    const k = this;
    this.view = new Proxy(this.e, {
      get(e, p) {
        if (p === 'known') return k;
        if (p === 'actor') return e;
        if (!k.seen) {
          if (p === 'pos') return k.guess;
          if (p === 'vel') return k.v0.set(0, 0, 0);
          if (p === 'form') return k.dove ? 'squid' : 'kid';
          if (p === 'smoothY') return 0;
          if (p === 'specialActive') return null;
        }
        return e[p];
      },
    });
    return this.view;
  }
}

export class Sight {
  constructor(brain) {
    this.b = brain; this.a = brain.a;
    this.mem = new Map();      // enemy → Known
    this.glim = new Map();     // enemy → s spent looking at it while it swims (noticing)
    this.lastT = -1; this.hitBy = null; this.hitT = -1e9;
  }
  reset() { this.mem.clear(); this.glim.clear(); this.lastT = -1; this.hitBy = null; }
  get(e) { return (e && this.mem.get(e)) || null; }
  sees(e) { const k = this.mem.get(e); return !!k && k.seen; }
  _k(e) { let k = this.mem.get(e); if (!k) { k = new Known(e); this.mem.set(e, k); } return k; }

  // one look round (from BotBrain._perceive, every ~0.2 s). false: over this frame's sight-line budget — try next frame
  check() {
    const now = G.time;
    if (_frameT !== now) { _frameT = now; _frameRays = 0; }
    if (_frameRays >= SIGHT.frameRays) { SIGHT_STATS.deferred++; return false; }
    SIGHT_STATS.checks++;
    const a = this.a, b = this.b, dtc = this.lastT < 0 || now < this.lastT ? 0.2 : Math.min(0.5, now - this.lastT);
    this.lastT = now;
    const eye = _eye.set(a.pos.x, a.pos.y + 1.3, a.pos.z), range = b.diff.awareness;
    const fx = Math.sin(b.aimYaw), fz = Math.cos(b.aimYaw), cone = Math.cos(SIGHT.fov);
    for (const e of G.actors) {
      if (e.team === a.team) continue;
      let k = this.mem.get(e);
      if (!e.alive) { if (k) this.mem.delete(e); this.glim.delete(e); continue; }   // splatted: its splat is announced
      const located = !!revealedTo(e, a.team);   // (what the team's map shows — game/reveal.js)
      const sj = e.superJumpState;
      if (sj && sj.phase === 'flight') {
        // in the sky (and untouchable): the landing marker says where it'll be
        if (sj.to) { k = k || this._k(e); if (k.src !== 'jump') SIGHT_STATS.jumps++; k.pos.copy(sj.to); k.vel.set(0, 0, 0); k.guess.copy(sj.to); k.t = now; k.src = 'jump'; k.dove = false; k.dropped = false; }
        if (k) k.seen = false;
        continue;
      }
      const vis = this._look(e, k, eye, fx, fz, cone, range, located, dtc);
      if (vis) {
        k = k || this._k(e);
        if (!k.seen) SIGHT_STATS.seen++;
        k.seen = true; k.seenT = now; k.t = now; k.src = 'sight'; k.dropped = false;
        k.pos.copy(e.pos); k.vel.copy(e.vel); k.guess.copy(e.pos);
        k.dove = e.form === 'squid';
        continue;
      }
      if (located) {
        k = k || this._k(e);
        if (k.src !== 'track' || now - k.t > 0.5) SIGHT_STATS.located++;
        if (k.seen) k.dove = e.form === 'squid';
        k.seen = false; k.t = now; k.src = 'track'; k.dropped = false;
        k.pos.copy(e.pos); k.vel.copy(e.vel); k.guess.copy(e.pos);
        continue;
      }
      if (!k) continue;
      if (k.seen) {
        // just lost sight: where it was heading — or, gone under its ink right there in front of us, where it dove
        k.seen = false;
        if (e.anim && e.anim.form === 'swim') k.dove = true;
        this._runOn(k);
      }
      const age = now - k.t;
      if (age > SIGHT.keep) { this.mem.delete(e); SIGHT_STATS.expired++; continue; }
      // could be there or gone: a look round the spot (from where we stand) settles it
      if (age > 0.5 && now >= k.lookT) {
        k.lookT = now + SIGHT.lookEvery;
        if (this._gone(k, eye, fx, fz, cone, range)) { this.mem.delete(e); SIGHT_STATS.cleared++; }
      }
    }
    // shot by a main weapon from out of sight: where the ink came from (a memory to turn to, not a sighting)
    const h = this.hitBy;
    if (h && now - this.hitT < 0.6) {
      const k = this._k(h);
      if (h.alive && !k.seen && now - k.t > 0.25) {
        const d = h.pos.distanceTo(a.pos), n = d * 0.06;   // (a rough fix: a few % of the range off)
        k.pos.set(h.pos.x + (Math.random() - 0.5) * n, h.pos.y, h.pos.z + (Math.random() - 0.5) * n);
        k.vel.set(0, 0, 0); k.guess.copy(k.pos); k.t = now; k.src = 'hit'; k.dove = false; k.dropped = false;
        SIGHT_STATS.hits++;
      }
      if (!h.alive && !k.seen) this.mem.delete(h);
    }
    this.hitBy = null;
    return true;
  }

  // between full looks: is the target we see still in sight? (checked every SIGHT.recheck s; the frame budget allowing).
  // false: it just went out of sight — its memory is where it was at the last confirmation, run on along its heading
  recheck(e) {
    const k = this.mem.get(e), now = G.time;
    if (!k || !k.seen || now - k.seenT < SIGHT.recheck || now < k.seenT) return !!k && k.seen;
    if (_frameT !== now) { _frameT = now; _frameRays = 0; }
    if (_frameRays >= SIGHT.frameRays) { SIGHT_STATS.deferred++; return true; }
    const a = this.a, b = this.b, eye = _eye.set(a.pos.x, a.pos.y + 1.3, a.pos.z);
    const located = !!revealedTo(e, a.team);
    if (!(e.superJumpState && e.superJumpState.phase === 'flight') && this._look(e, k, eye, Math.sin(b.aimYaw), Math.cos(b.aimYaw), Math.cos(SIGHT.fov), b.diff.awareness, located, now - k.seenT)) {
      k.seenT = now; k.t = now; k.pos.copy(e.pos); k.vel.copy(e.vel); k.guess.copy(e.pos); k.dove = e.form === 'squid';
      return true;
    }
    k.seen = false;
    if (located) { k.src = 'track'; k.t = now; k.pos.copy(e.pos); k.vel.copy(e.vel); k.guess.copy(e.pos); return false; }
    if (e.anim && e.anim.form === 'swim') k.dove = true;
    this._runOn(k);
    return false;
  }

  // can we see e now? (ink hiding, range, cone, then the sight line to its chest, or its head)
  _look(e, k, eye, fx, fz, cone, range, located, dtc) {
    const a = this.a, dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, hd = Math.hypot(dx, dz), d = Math.hypot(hd, e.pos.y - a.pos.y);
    let reach = range, notice = 0;
    // (a tracked foe shows through its ink and anywhere on screen; the HUD marks it)
    const sub = !located && e.anim && e.anim.form === 'swim';
    if (sub) {
      const hs = Math.hypot(e.vel.x, e.vel.z), was = !!k && G.time - k.seenT < SIGHT.swimFollow;
      if (hs < SIGHT.stillSpeed) reach = SIGHT.stillR;
      else if (was) reach = SIGHT.swimTrackR;
      else { reach = Math.max(SIGHT.stillR, Math.min(SIGHT.swimR, (hs - SIGHT.stillSpeed) * SIGHT.swimK)); notice = reach > SIGHT.stillR ? SIGHT.swimNotice : 0; }
      reach = Math.min(reach, range);
    }
    if (d > reach) { this.glim.delete(e); return false; }
    if (!located && d > SIGHT.near && hd > 0.3 && (dx * fx + dz * fz) / hd < cone) { this.glim.delete(e); return false; }
    const sq = e.form === 'squid';
    let vis = ray(eye, _p.set(e.pos.x, e.pos.y + (sq ? 0.3 : 1.0), e.pos.z));
    if (!vis && !sq) vis = ray(eye, _p.set(e.pos.x, e.pos.y + 1.6, e.pos.z));
    if (!vis) { this.glim.delete(e); return false; }
    if (notice > 0) {
      const g = (this.glim.get(e) || 0) + dtc;
      this.glim.set(e, g);
      return g >= notice;
    }
    this.glim.delete(e);
    return true;
  }

  // just lost from sight: the pre-aim point — the last spot run on along its heading for a moment, stopped at a wall
  _runOn(k) {
    SIGHT_STATS.lost++;
    k.guess.copy(k.pos);
    const vx = k.vel.x, vz = k.vel.z, sp = Math.hypot(vx, vz), len = sp * SIGHT.runOn;
    if (len < 0.3) return;
    _p.set(k.pos.x, k.pos.y + 0.9, k.pos.z); _d.set(vx / sp, 0, vz / sp);
    SIGHT_STATS.rays++; _frameRays++;
    const r = G.physics.raycast(_p, _d, len, _h, true);
    let go = r.hit ? Math.max(0, r.dist - 0.4) : len;
    // (nor out over the open sea: wherever it went, it's still on the deck)
    for (let s = 1; s <= go; s += 1) if (G.level.groundHeight(k.pos.x + _d.x * s, k.pos.z + _d.z * s, k.pos.y + 0.6) === -Infinity) { go = s - 1; break; }
    k.guess.set(k.pos.x + _d.x * go, k.pos.y, k.pos.z + _d.z * go);
  }

  // the remembered spot looked over from here and nobody there? Walked up to it (within 3 m, in sight), or — unless it
  // was last seen as a squid (it may be lying in its ink) — the spot and a stride either side of it all in plain view
  _gone(k, eye, fx, fz, cone, range) {
    const a = this.a, p = k.pos, dx = p.x - a.pos.x, dz = p.z - a.pos.z, hd = Math.hypot(dx, dz), d = Math.hypot(hd, p.y - a.pos.y);
    const at = _p.set(p.x, p.y + (k.dove ? 0.3 : 1.0), p.z);
    if (d < SIGHT.stillR + 1) return ray(eye, at);
    if (k.dove || d > range || (hd > 0.3 && (dx * fx + dz * fz) / hd < cone)) return false;
    if (!ray(eye, at)) return false;
    const sx = -dz / (hd || 1), sz = dx / (hd || 1);
    for (const s of [1.6, -1.6]) if (!ray(eye, _d.set(p.x + sx * s, p.y + 1.0, p.z + sz * s))) return false;
    if (k.guess.distanceToSquared(p) > 0.5 && !ray(eye, _d.set(k.guess.x, k.guess.y + 1.0, k.guess.z))) return false;
    return true;
  }
}

// What team t knows about foe e: a teammate bot seeing it (freshest first), a located one, or the freshest memory no
// older than maxAge s. Returns that Known (pos / vel / seen / t) or null. No sight lines: it's the bots' own checks.
export function teamKnown(t, e, maxAge = SIGHT.keep) {
  let best = null;
  for (const o of G.actors) {
    if (o.team !== t || !o.bot || !o.bot.sight) continue;
    const k = o.bot.sight.mem.get(e);
    if (!k) continue;
    if (k.seen && (!best || !best.seen || k.t > best.t)) best = k;
    else if (!best || (!best.seen && k.t > best.t)) best = k;
  }
  return best && (best.seen || G.time - best.t <= maxAge) ? best : null;
}
