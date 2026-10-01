// In-match replication. Every actor has one owner: each player owns their squidkid, the host owns the bots (and any
// actor whose player left). Owners simulate normally and stream 20 ticks/s; everyone else renders those actors as
// proxies through the same animation code, interpolated on a timeline ~100 ms behind the owner.
//
// What keeps remote players smooth (no teleports, no jitter):
//   · one playback clock per sender: the offset to the sender's clock comes from the *fastest* packets (the network
//     floor); the clock advances with our own frame time and steers gently (±8 %) toward "now − delay", slowing when
//     the sender's samples are about to run out — so neither side's hitches nor network jitter make anyone leap
//   · delay = the sender's tick spacing (p95) + how late packets run (p90 over ~3 s): enough buffer that we are nearly
//     always interpolating, without a rare Wi-Fi hiccup dragging everyone 200 ms further behind
//   · cubic Hermite between snapshots using the owner's velocities (curved paths stay curved; no piecewise-linear
//     kinks at 20 Hz) and a short ballistic extrapolation if the buffer runs dry. Corrections — new data rewriting a
//     moment already shown — are measured exactly and settle on a critically damped offset: no pop, no lurch.
//     Genuine teleports (respawn) carry a counter and cut.
//   · one-shot moments — animation triggers, shots, ink splats, splats, respawns, specials — are timestamped by the
//     owner and replayed on the same timeline, so a shot leaves the muzzle on the frame the character's firing pose
//     plays and its ink lands when the blob you watched lands.
//
// Ink: every paint.splat() the owner performs is recorded and replayed everywhere (projectiles you watch fly for other
// players are visual copies that never paint or damage), so every screen shows the same turf. Hits are decided by the
// shooter's client (what you see is what you hit) and applied by the victim's owner.
import * as THREE from 'three';
import { G, emit, on } from '../core/ctx.js';
import { PLAYER, WEAPONS, SPECIAL_ORDER, mapNoBots } from '../config.js';
import { MAIN_KITS, SUB_KITS, KIT_GHOSTS } from '../game/kits/registry.js';
import { specialNetState, specialNetApply } from '../game/specials.js';
import { BotBrain } from '../game/bots.js';
import { Boss } from '../boss/boss.js';

const TICK = 1 / 20;

const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const now = () => performance.now() / 1000;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _P = blankSample();   // scratch: the path re-evaluated at last frame's moment
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };

// state flags (one int per actor per tick)
const F = {
  alive: 1, squid: 2, sub: 4, climb: 8, grounded: 16, gt1: 32, gt2: 64, charging: 128, rolling: 256, streaming: 512,
  dodge: 1024, subAim: 2048, firing: 4096, special: 8192, sjCharge: 16384, sjFlight: 32768, flick: 65536, slosh: 131072,
  invuln: 262144, enemy: 524288,
};
// events forwarded from owners (actor-bearing payloads; vectors/actors are packed)
const FORWARD = ['actor:jump', 'superjump', 'superjump:land', 'special:use', 'special:slam', 'weapon:dodge', 'weapon:fire', 'splatted', 'respawn'];

export class NetMatch {
  constructor(session, cfg) {
    this.s = session;
    this.cfg = cfg;
    this.myId = session.myId;
    this.byNid = new Map();
    this.peers = new Map();        // sender id → playback clock { off, delay, want, tr, rate, lastTs, events }
    this.out = [];                 // events recorded since the last tick
    this.tickT = 0;
    this.mute = 0;                 // >0: paint calls are visual-only (ghost projectiles / bombs / clouds)
    this.applying = false;         // replaying someone else's splat (don't re-record)
    this.match = null;
    this.clockT = 0;
    this.unsubs = [];
    this.stats = { in: 0, out: 0, extrap: 0, snaps: 0 };
  }

  get isHost() { return this.s.isHost; }

  // ---------------------------------------------------------------------------------------------- setup
  /** Called by main.js once the Match built its actors from the roster. */
  bind(match) {
    this.match = match;
    G.netm = this;
    for (const a of match.actors) {
      this.byNid.set(a.nid, a);
      this._setupActor(a);
    }
    for (const ev of FORWARD) this.unsubs.push(on(ev, (e) => this._onLocalEvent(ev, e)));
    // humans-only stage: anyone who left while the match was loading (no NetMatch yet to hear it) is dropped now
    if (mapNoBots(this.cfg.map)) for (const a of [...this.byNid.values()]) if (a.owner !== this.myId && !this.s._members.has(a.owner)) this._remove(a);
    this.unsubs.push(on('match:state', ({ state, match: m }) => { if (m === this.match && this.isHost) this._sendNow({ k: 'st', s: state, t: r2(m.time) }); }));
  }

  _setupActor(a) {
    a.remote = a.owner !== this.myId;
    if (!a.net) a.net = { buf: [], err: new THREE.Vector3(), tp: -1, lastRaw: null, rendered: new THREE.Vector3(), has: false, prevGrounded: true, prevVy: 0, yawPrev: 0, loops: {}, sjTo: null, sjRing: 0 };
    const ch = a.character;
    if (!ch._netTrig) {
      const orig = ch.trigger.bind(ch);
      ch._netTrig = orig;
      ch.trigger = (name, data) => {
        orig(name, data);
        if (!a.remote && G.netm === this) this._rec(['tr', a.nid, name, packTrig(data)]);
      };
    }
  }

  go() { /* intro starts on every client at the host's word (session._launch → main.netMatchGo) */ }

  dispose() {
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    for (const a of this.byNid.values()) this._stopLoops(a);
    if (G.netm === this) G.netm = null;
  }

  // ---------------------------------------------------------------------------------------------- recording
  _rec(e) { this.out.push([r3(now()), ...e]); }

  recSplat(c, radius, team, o) {
    if (this.applying || this.mute > 0 || o.cosmetic) return;
    const st = o.stretch;
    const e = ['s', r2(c.x), r2(c.y), r2(c.z), r2(radius), team, r3(o.seed ?? Math.random()), o.kind ?? 0,
      st ? r3(st.x) : 0, st ? r3(st.y) : 0, st ? r3(st.z) : 0, st ? r2(o.stretchAmt ?? 1) : 0];
    if (o.pod != null && o.pod !== 1) e.push(r2(o.pod));   // (a sprout pod's weight for it: pods.js)
    this._rec(e);
  }

  recProj(p) {
    const o = p.owner;
    if (!o || o.remote || o.nid === undefined) return;
    this._rec(['p', o.nid, p.type, p.wid || 0, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.vel.x), r2(p.vel.y), r2(p.vel.z),
      r3(p.delay || 0), r3(p.life), r3(p.straight), r2(p.radius), r2(p.size), p.grav, p.drag, p.trailEvery || 0, p.head ? 1 : 0,
      r3(p.vis ?? 0.1), p.tail0 ?? 0.8, p.tailK ?? 1.3, p.wob ?? 0.035, p.wobF ?? 26, p.nose ?? 0.3, p.sats ?? 3]);
  }

  recBomb(b) {
    const o = b.owner;
    if (!o || o.remote) return;
    this._rec(['b', o.nid, b.kind, r2(b.pos.x), r2(b.pos.y), r2(b.pos.z), r2(b.vel.x), r2(b.vel.y), r2(b.vel.z)]);
  }

  // Kit weapons / subs / specials with world objects of their own (src/game/kits/*): the owner records a spawn as
  // ['k', nid, kind, data] (data: a short array of rounded numbers the kit packs); everyone else hands it to the kit's
  // ghost(actor, data) — a visual copy (and, for shields, a solid one): ghosts never paint (mute) and never hurt (a
  // remote attacker's hits are dropped; the owner's splats and hits arrive separately)
  recKit(a, kind, data) {
    if (!a || a.remote || a.nid === undefined || G.netm !== this) return;
    this._rec(['k', a.nid, kind, data]);
  }

  _onLocalEvent(name, e) {
    const a = e.actor || e.victim;
    if (!a || a.remote || a.nid === undefined || G.netm !== this) return;
    this._rec(['ev', name, packEvent(e)]);
  }

  // Boss Battle: the host's move records / crablet bursts go on its event timeline (played in step with the snapshots)
  recBoss(e) { if (this.isHost && G.netm === this) this._rec(e); }
  // Zone Control: the host's rules decisions + count snapshots (zones.js netEvent), on the same timeline as its paint
  recZone(e) { if (this.isHost && G.netm === this) this._rec(['z', e]); }
  // Tower Command likewise: control / checkpoints / position snapshots / overtime / the end (tower.js netEvent)
  recTower(e) { if (this.isHost && G.netm === this) this._rec(['tw', e]); }
  // sprout pods: a hedge grown (by which team, when) / trampled, the meters' look (pods.js netEvent)
  recPods(e) { if (this.isHost && G.netm === this) this._rec(['pd', e]); }
  // a guest's hit on the boss (or a crablet): shooter-authoritative, applied by the host that runs it
  sendBossHit(attacker, d, weak, w, crab = -1) {
    if (this.isHost || attacker.nid === undefined) return;
    const L = this.match?.boss?.log; if (L) { L.sent++; L.sentDmg += d; }
    this.s.tr?.sendTo(this.s.hostId, { k: 'bhit', a: attacker.nid, d: r2(d), weak: weak ? 1 : 0, w, c: crab });
  }

  // a ghost device (a remote player's sprinkler, curtain, waddle …) took a hit here: its owner's copy takes it
  sendDevHit(owner, kind, id, dmg) {
    if (!owner || !owner.remote || owner.owner === undefined) return;
    this.s.tr?.sendTo(owner.owner, { k: 'dh', kind, id, d: r2(dmg) });
  }

  // hits land on the victim's owner right away (not on the playback timeline: health must be current)
  sendHit(attacker, victim, dmg, wid) {
    if (victim.owner === this.myId) return false;
    this.s.tr?.sendTo(victim.owner, { k: 'hit', v: victim.nid, a: attacker.nid, d: r2(dmg), w: wid });
    return true;
  }

  _sendNow(d) { this.s.tr?.broadcast(d); }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    if (!this.match) return;
    // timeline samples for every remote actor (Match.update applies them)
    const t = now();
    for (const p of this.peers.values()) this._advance(p, dt);
    for (const a of this.byNid.values()) if (a.remote) this._sample(a, t, dt);
    this._sampleBoss(dt);
    this._playEvents(t);
    this._voices(dt);
    // outgoing tick
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT += TICK;
      if (this.tickT < 0) this.tickT = TICK;
      this._sendTick();
    }
  }

  _sendTick() {
    const a = [];
    for (const x of this.byNid.values()) if (!x.remote) a.push(packActor(x));
    const msg = { k: 't', ts: r3(now()), a };
    if (this.out.length) { msg.e = this.out; this.out = []; }
    const boss = this.match?.boss;
    if (this.isHost && boss && boss.sim) { this.bossN = (this.bossN || 0) + 1; msg.B = boss.pack(this.bossN % 10 === 0); }
    if (this.isHost && this.match) {
      this.clockT -= TICK;
      if (this.clockT <= 0) { this.clockT = 0.5; msg.c = [this.match.state, r2(this.match.time)]; }
    }
    this.stats.out++;
    this.s.tr?.broadcast(msg);
  }

  // ---------------------------------------------------------------------------------------------- incoming
  onMessage(from, d) {
    switch (d.k) {
      case 't': this._tick(from, d); break;
      case 'hit': this._hit(d); break;
      case 'dh': {   // a hit on one of our devices, made on another player's screen
        const K = d.kind === 'subs' ? G.subs : SUB_KITS[d.kind] || MAIN_KITS[d.kind] || KIT_GHOSTS[d.kind];
        try { K?.netHurt?.(d.id, d.d); } catch (err) { console.warn('[inkwave] device hit', d.kind, err); }
        break;
      }
      case 'bhit': if (this.isHost) this.match?.boss?.remoteHit(d); break;
      case 'st': if (from === this.s.hostId) this._hostState(d); break;
      case 'res': if (from === this.s.hostId) this._result(d); break;
      case 'end': if (from === this.s.hostId) G.game?.netMatchEnd?.(); break;
      case 'own': if (from === this.s.hostId) this._ownership(d.map); break;
    }
  }

  _peer(id) {
    let p = this.peers.get(id);
    if (!p) this.peers.set(id, (p = { off: 0, delay: 0.1, rate: 1, init: false, events: [] }));
    return p;
  }

  _tick(from, d) {
    this.stats.in++;
    const p = this._peer(from);
    const t = now();
    const o = t - d.ts;
    if (!(d.ts < p.lastTs)) p.lastTs = d.ts;
    if (!p.init) { p.off = o; p.init = true; }
    else if (o < p.off) p.off = o;                      // a faster packet: the true floor is lower
    else p.off += (o - p.off) * 0.0025;                 // creep up slowly (clock drift / route change)
    // buffer need from the last ~3 s: how late packets run (90th percentile — a rare hiccup must not drag the delay
    // around; the playback clock rides those out) plus the sender's tick spacing (95th: its frames aren't regular)
    const W = p.win || (p.win = { late: [], gap: [] });
    W.late.push(o - p.off); W.gap.push(p.prevTs !== undefined ? Math.min(0.25, Math.max(0, d.ts - p.prevTs)) : TICK);
    p.prevTs = d.ts;
    if (W.late.length > 60) { W.late.shift(); W.gap.shift(); }
    p.want = Math.min(0.3, Math.max(0.07, quantile(W.gap, 0.95) + quantile(W.late, 0.9) + 0.012));
    // actors
    if (d.a) for (const s of d.a) {
      const a = this.byNid.get(s[0]);
      if (!a || !a.remote || a.owner !== from) continue;
      const buf = a.net.buf;
      const snap = unpackActor(s, d.ts);
      if (buf.length && snap.t <= buf[buf.length - 1].t) continue;
      buf.push(snap);
      if (buf.length > 40) buf.splice(0, buf.length - 40);
    }
    // events → the sender's queue (played on its timeline)
    if (d.e) for (const e of d.e) p.events.push(e);
    if (d.c && from === this.s.hostId) this._hostClock(d.c);
    // the boss: the host's snapshot, on the host's playback timeline
    const boss = this.match?.boss;
    if (d.B && from === this.s.hostId && boss && !boss.sim) {
      const buf = boss.net.buf, snap = Boss.unpack(d.B, d.ts);
      if (!buf.length || snap.t > buf[buf.length - 1].t) { buf.push(snap); if (buf.length > 40) buf.splice(0, buf.length - 40); }
    }
  }

  // ---- timeline sampling -------------------------------------------------------------------------------------------
  // One playback clock per sender, in the sender's time. It advances with this client's own frame time (so a local
  // hitch never makes remote squidkids leap ahead) and steers gently — never jumps — toward "now − delay", where the
  // delay covers the sender's tick spacing and packet lateness. When the sender's samples are about to run out (their frame
  // hitched, packets late) it slows down instead of running off the end of the path into a guess.
  _advance(p, dt) {
    if (!p.init) return;
    const want = p.want ?? 0.1;
    p.delay += (want - p.delay) * Math.min(1, dt * (want > p.delay ? 2 : 0.35));   // quick to add buffer, slow to trim it
    const target = now() - p.off - p.delay;
    if (p.tr === undefined || Math.abs(target - p.tr) > 0.5) { p.tr = target; p.rate = 1; return; }   // (re)sync
    // small errors: a barely visible ±8 % time stretch; big ones (after a hitch) catch up faster
    const e = target - p.tr;
    let rate = Math.abs(e) < 0.12 ? 1 + Math.max(-0.08, Math.min(0.08, e * 1.5)) : 1 + Math.max(-0.2, Math.min(0.25, e * 2.5));
    const ahead = p.lastTs - p.tr;                              // seconds of the sender's path still buffered
    if (ahead < 0.015) rate = Math.min(rate, 0.5 + 0.5 * Math.max(0, ahead / 0.015));
    p.rate += (rate - p.rate) * Math.min(1, dt * 6);            // the rate itself eases: no sudden change of pace
    p.tr += dt * p.rate;
  }

  // The owner's path at time t (sender clock) from the buffered samples → S; returns 0 interpolating, 1 holding across a
  // teleport, 2 extrapolating past the newest sample, 3 before the oldest.
  _pathAt(buf, t, S) {
    let s0 = buf[0], s1 = null;
    for (let i = 0; i < buf.length - 1; i++) { if (buf[i].t <= t && buf[i + 1].t > t) { s0 = buf[i]; s1 = buf[i + 1]; break; } }
    if (s1 && s0.tp === s1.tp) { hermite(s0, s1, t, S); return 0; }
    if (s1) { copySample(t >= s1.t ? s1 : s0, S); return 1; }      // teleport between these two: hold, then snap
    const last = buf[buf.length - 1];
    if (t < last.t) { copySample(s0, S); return 3; }
    // buffer ran dry: a short ballistic extrapolation along the last velocity, then hold
    copySample(last, S);
    const e = Math.min(t - last.t, 0.18);
    if (e > 0) {
      S.x += last.vx * e; S.z += last.vz * e;
      if (!(last.f & F.grounded)) { S.y += last.vy * e - 0.25 * PLAYER.gravity * e * e; S.vy = last.vy - 0.5 * PLAYER.gravity * e; }
    }
    return 2;
  }

  _sample(a, t, dt) {
    const n = a.net, buf = n.buf;
    const peer = this._peer(a.owner);
    const tr = peer.tr;
    if (!buf.length || tr === undefined) return;
    // drop history older than what we might still need (last frame's moment must stay covered)
    while (buf.length > 2 && buf[1].t < tr - 0.25) buf.shift();
    const S = n.cur || (n.cur = blankSample());
    const mode = this._pathAt(buf, tr, S);
    if (mode === 2) this.stats.extrap++;
    let snapNow = false;
    if (S.tp !== n.tp) { snapNow = true; n.tp = S.tp; this.stats.snaps++; }
    // Correction: the path itself is smooth (C1 Hermite through the owner's samples), so the only discontinuities are
    // new data rewriting a moment already shown — typically leaving an extrapolation. Measure exactly that (the path
    // at last frame's time now vs what was shown then) and carry it as an offset that settles on a critically damped
    // curve: no pop, and no kick in speed either.
    const err = n.err, ev = n.errV || (n.errV = new THREE.Vector3());
    if (n.handoff) {
      // a new owner (host migration): its path starts from where it adopted us, a little off what we drew — keep
      // drawing from here and let the offset settle
      n.handoff = false;
      if (n.prevRaw && n.has) { err.x += n.prevRaw.x - S.x; err.y += n.prevRaw.y - S.y; err.z += n.prevRaw.z - S.z; n.tp = S.tp; snapNow = false; }
      if (err.lengthSq() > 16) { err.set(0, 0, 0); ev.set(0, 0, 0); }
      n.has = true;
    } else if (snapNow || !n.has) { err.set(0, 0, 0); ev.set(0, 0, 0); n.has = true; }
    else if (n.prevRaw && n.prevT !== undefined) {
      this._pathAt(buf, n.prevT, _P);
      const jx = n.prevRaw.x - _P.x, jy = n.prevRaw.y - _P.y, jz = n.prevRaw.z - _P.z;
      const j2 = jx * jx + jy * jy + jz * jz;
      if (j2 > 1e-6 && j2 < 16) { err.x += jx; err.y += jy; err.z += jz; }
      else if (j2 >= 16) { err.set(0, 0, 0); ev.set(0, 0, 0); }                    // a real relocation: show it
    }
    (n.prevRaw || (n.prevRaw = new THREE.Vector3())).set(S.x, S.y, S.z);
    n.prevT = tr;
    if (err.x || err.y || err.z || ev.x || ev.y || ev.z) {
      const w = 13, k = Math.exp(-w * dt);
      for (const c of ['x', 'y', 'z']) { const x0 = err[c], v0 = ev[c], q = v0 + w * x0; err[c] = (x0 + q * dt) * k; ev[c] = (v0 - w * q * dt) * k; }
      if (err.lengthSq() < 1e-6 && ev.lengthSq() < 1e-4) { err.set(0, 0, 0); ev.set(0, 0, 0); }
    }
    if (this.debug) n.dbg = [mode, +(tr - buf[buf.length - 1].t).toFixed(3), buf.length, +err.length().toFixed(3), 0, +peer.rate.toFixed(2), +peer.delay.toFixed(3)];
    n.ready = true;
  }

  /** Match.update → for remote actors instead of Actor.update: apply this frame's sample and run the animation. */
  applyRemote(a, dt) {
    const n = a.net;
    a.anim.time = G.time;
    if (!n.ready) { a.character.root.visible = false; return; }
    const S = n.cur;
    if (!a.alive) { a.respawnTimer -= dt; return; }
    // position = sampled path + decaying correction; velocity drives the gait
    const x0 = a.pos.x, y0 = a.pos.y, z0 = a.pos.z;
    a.pos.set(S.x + n.err.x, S.y + n.err.y, S.z + n.err.z);
    a.vel.set(S.vx, S.vy, S.vz);
    this.match?.tower?.carryRemote?.(a, x0, y0, z0, dt);   // (Tower Command: riding the tower isn't walking)
    const dy = angDiff(a.yaw, S.yaw);
    a.netTurnRate = dt > 0 ? dy / dt : 0;
    a.yaw = S.yaw;
    a.aimYaw = S.aimYaw; a.aimPitch = S.aimPitch;
    const cp = Math.cos(a.aimPitch);
    a.aimDir.set(Math.sin(a.aimYaw) * cp, Math.sin(a.aimPitch), Math.cos(a.aimYaw) * cp);
    a.aimPoint.copy(a.pos).setY(a.pos.y + 1.2).addScaledVector(a.aimDir, 25);
    const f = S.f;
    const wasSquid = a.form === 'squid';
    a.form = f & F.squid ? 'squid' : 'kid';
    a.submerged = !!(f & F.sub);
    a.climbing = !!(f & F.climb);
    a.grounded = !!(f & F.grounded);
    a.groundTeam = f & F.gt2 ? 2 : f & F.gt1 ? 1 : 0;
    a.onEnemy = !!(f & F.enemy);
    if (a.climbing) { a.wallN.set(S.wx, S.wy, S.wz); a.anim.wallNormal.copy(a.wallN); }
    if (S.hp < a.hp - 0.5) a.hurtFlash = Math.min(1, a.hurtFlash + (a.hp - S.hp) / 60);
    a.hurtFlash = Math.max(0, a.hurtFlash - dt * 0.6);
    a.hp = S.hp; a.ink = S.ink; a.special = S.sp;
    a.invuln = f & F.invuln ? 0.1 : 0;
    a.stats.turf = Math.max(a.stats.turf, S.turf);
    if (S.spx && SPECIAL_ORDER[S.spx - 1]) a.specialId = SPECIAL_ORDER[S.spx - 1];   // their loadout's special
    // a special: its owner's records run a ghost of it here (specials.js netGhost); the flag alone is the fallback, and a
    // ghost whose end never arrived goes when the flag has been off a moment
    if (f & F.special) { n.spOff = 0; if (!a.specialActive) a.specialActive = { id: a.specialId || a.weapon.special, net: true }; }
    else if (a.specialActive?.ghost) { if ((n.spOff = (n.spOff || 0) + dt) > 0.6) G.specials?.end(a, 'net'); }
    else a.specialActive = null;
    specialNetApply(a, S.spst | 0);
    a.superJumpState = f & (F.sjCharge | F.sjFlight) ? (a.superJumpState || { phase: 'charge', net: true }) : null;
    if (a.superJumpState) a.superJumpState.phase = f & F.sjFlight ? 'flight' : 'charge';
    // weapon pose state (charge glow, roller drum, splatling spin, dualies lock …)
    const wr = a.weaponRunner;
    wr.charging = !!(f & F.charging); wr.charge = S.ch;
    wr.rolling = !!(f & F.rolling); wr.streaming = !!(f & F.streaming); wr.burstFrac = f & F.streaming ? S.ch : 0;
    wr.aimingSub = !!(f & F.subAim); wr.firingT = f & F.firing ? 0.3 : 0;
    wr.flick = f & F.flick ? Math.max(0, wr.flick) : -1;
    wr.slosh = f & F.slosh ? Math.max(0, wr.slosh) : -1;
    wr.lockT = S.lock;
    if (f & F.dodge) { if (!wr.dodge) wr.dodge = { t: 0, dur: a.weapon.rollTime || 0.3 }; wr.dodge.t += dt; } else wr.dodge = null;
    // kit weapons' own pose state (a mitts leap / wall cling, a brolly canopy …): netState → netApply
    MAIN_KITS[a.weapon?.kind]?.netApply?.(wr, S.ks | 0, dt);
    // derived moments the owner produced inline: landings (squash, splash, sound) and squid in / out
    if (!n.prevGrounded && a.grounded && !a.superJumpState) {
      const speed = Math.max(0, -n.prevVy);
      a.landSpeed = speed; a.landT = 0;
      if (speed > 3) {
        const near = a._nearCamera();
        if (near) G.audio?.play(a.form === 'squid' && a.groundTeam === 1 ? 'swim_splash' : 'land', { pos: a.pos, volume: Math.min(0.9, Math.max(0.25, speed / 14)) * 0.8 });
        emit('actor:land', { actor: a, speed, surface: a.groundTeam, pos: a.pos.clone() });
      }
    }
    if (wasSquid !== (a.form === 'squid') && a._nearCamera()) {
      G.audio?.play(a.form === 'squid' ? 'squid_in' : 'squid_out', { pos: a.pos, volume: 0.5 });
      if (a.form === 'squid' && a.groundTeam === 1) G.fx?.burst(_v2.copy(a.pos).setY(a.pos.y + 0.1), UPV, a.color, { count: 8, speed: 2.5, size: 0.07 });
    }
    n.prevGrounded = a.grounded; n.prevVy = a.vel.y;
    a.landT += dt; a.lastDamage += dt;
    // super jump target rings while a teammate is in flight
    if (a.superJumpState?.phase === 'flight' && n.sjTo) {
      n.sjRing += dt;
      if (n.sjRing > 0.12) { n.sjRing = 0; G.fx?.ring(_v2.copy(n.sjTo).setY(n.sjTo.y + 0.05), UPV, a.color, { radius: 1.6, life: 0.5 }); }
    }
    if (n.spawnPending) {
      if (S.tp === n.deathTp) { a.character.root.visible = false; return; }
      n.spawnPending = false;
      a.character.setVisible(true);
      const pad = G.level.spawnPads[a.team];
      G.fx?.spawnFlash(_v2.set(a.pos.x, pad.y, a.pos.z), a.color);
    }
    a.character.root.visible = true;
    a._finishFrame(dt);
  }

  // continuous weapon sounds for remote actors (the owner's loops live in its WeaponRunner)
  _voices(dt) {
    for (const a of this.byNid.values()) {
      if (!a.remote) continue;
      const L = a.net.loops, wr = a.weaponRunner, near = a.alive && a._nearCamera();
      const want = (key, on, snd, set) => {
        if (on && near && !L[key]) L[key] = G.audio?.loop?.(snd, { pos: a.pos, volume: 0 });
        const h = L[key];
        if (!h) return;
        if (!on || !near) { h.stop(0.1); L[key] = null; return; }
        set(h);
      };
      const k = a.weapon.kind;
      want('charge', wr.charging && k === 'charger', 'charger_charge', (h) => h.set({ pos: a.pos, volume: 0.35, pitch: 1 + wr.charge * 1.5 }));
      want('spin', (wr.charging || wr.streaming) && k === 'splatling', 'splatling_spin', (h) => h.set({ pos: a.pos, volume: 0.4, pitch: wr.streaming ? 1.5 : 0.6 + 0.85 * wr.charge }));
      want('roll', wr.rolling, 'roll', (h) => { const s = Math.min(1, Math.hypot(a.vel.x, a.vel.z) / (a.weapon.rollSpeed || 5)); h.set({ pos: a.pos, volume: s * 0.45, pitch: 0.6 + s }); });
    }
  }
  _stopLoops(a) { const L = a.net?.loops; if (L) for (const k in L) { L[k]?.stop?.(0.05); L[k] = null; } }

  // ---- event playback -----------------------------------------------------------------------------------------------
  _playEvents() {
    for (const [id, p] of this.peers) {
      if (!p.events.length || p.tr === undefined) continue;
      const tr = p.tr;
      let i = 0;
      while (i < p.events.length && p.events[i][0] <= tr) i++;
      if (!i) continue;
      const due = p.events.splice(0, i);
      for (const e of due) this._play(id, e);
    }
  }

  _play(from, e) {
    switch (e[1]) {
      case 's': {
        this.applying = true;
        const st = e[9] || e[10] || e[11] ? _v2.set(e[9], e[10], e[11]) : undefined;
        const opts = { seed: e[7] };
        if (e[8]) opts.kind = e[8];
        if (st) { opts.stretch = st; opts.stretchAmt = e[12]; }
        if (e[13]) opts.pod = e[13];
        G.paint?.splat(_v.set(e[2], e[3], e[4]), e[5], e[6], opts);
        this.applying = false;
        break;
      }
      case 'p': { const a = this.byNid.get(e[2]); if (a) G.projectiles?.ghostProjectile(a, e); break; }
      case 'b': { const a = this.byNid.get(e[2]); if (a) G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9]); break; }
      case 'tr': {
        const a = this.byNid.get(e[2]);
        if (!a || !a.remote || !a.alive && e[3] !== 'spawn') break;
        a.character._netTrig?.(e[3], unpackTrig(e[4]));
        this._trigSideEffects(a, e[3]);
        break;
      }
      case 'ev': this._playEvent(e[2], e[3]); break;
      case 'k': {
        const a = this.byNid.get(e[2]);
        const K = MAIN_KITS[e[3]] || SUB_KITS[e[3]] || KIT_GHOSTS[e[3]];
        if (!a || !a.remote || !K || !K.ghost) break;
        this.mute++;
        try { K.ghost(a, e[4]); } catch (err) { console.warn('[inkwave] kit ghost', e[3], err); } finally { this.mute--; }
        break;
      }
      case 'bm': this.match?.boss?.onMove(e[2]); break;
      case 'z': this.match?.zones?.netEvent(e[2]); break;
      case 'tw': this.match?.tower?.netEvent(e[2]); break;
      case 'pd': this.match?.pods?.netEvent(e[2]); break;
      case 'bc': { const b = this.match?.boss; if (b && !b.sim) b._crabBurst(e[2], e[3], e[4], e[5], !!e[6]); break; }
    }
  }

  // ---- the boss (guests) ------------------------------------------------------------------------------------------
  // Same playback clock as the host's squidkids: Hermite through its snapshots, the boss clock read off them, one-shot
  // state from the snapshot already passed. Corrections (a rewritten extrapolation, a host handoff) settle on the same
  // critically damped offset as remote actors — the boss never pops.
  _sampleBoss(dt) {
    const b = this.match?.boss;
    if (!b || b.sim) return;
    const n = b.net, buf = n.buf, peer = this.peers.get(this.s.hostId);
    if (!buf.length || !peer || peer.tr === undefined) return;
    const tr = peer.tr;
    while (buf.length > 2 && buf[1].t < tr - 0.3) buf.shift();
    const S = n.cur || (n.cur = {});
    const at = (t, O) => {
      let s0 = buf[0], s1 = null;
      for (let i = 0; i < buf.length - 1; i++) if (buf[i].t <= t && buf[i + 1].t > t) { s0 = buf[i]; s1 = buf[i + 1]; break; }
      if (s1) {
        const d = Math.max(1e-3, s1.t - s0.t), u = Math.min(1, Math.max(0, (t - s0.t) / d)), u2 = u * u, u3 = u2 * u;
        const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
        O.x = h00 * s0.x + h10 * d * s0.vx + h01 * s1.x + h11 * d * s1.vx;
        O.z = h00 * s0.z + h10 * d * s0.vz + h01 * s1.z + h11 * d * s1.vz;
        O.y = s0.y + (s1.y - s0.y) * u; O.yaw = s0.yaw + angDiff(s0.yaw, s1.yaw) * u; O.bt = s0.bt + (s1.bt - s0.bt) * u;
        O.vx = s0.vx + (s1.vx - s0.vx) * u; O.vz = s0.vz + (s1.vz - s0.vz) * u;
        O.s0 = s0; O.s1 = s1; O.u = u;
        return 0;
      }
      const last = buf[buf.length - 1], e = t > last.t ? Math.min(t - last.t, 0.15) : 0;
      const s = t > last.t ? last : s0;
      O.x = s.x + s.vx * e; O.z = s.z + s.vz * e; O.y = s.y; O.yaw = s.yaw; O.bt = s.bt + e; O.vx = s.vx; O.vz = s.vz;
      O.s0 = s; O.s1 = null; O.u = 0;
      return e > 0 ? 2 : 1;
    };
    at(tr, S);
    // discrete state + crablets from the snapshot already passed (crablets interpolate by id)
    const s0 = S.s0, s1 = S.s1;
    for (const k of ['hp', 'phase', 'f', 'mv', 'anim', 'turn', 'fl', 'wk', 'killer', 'maxHp', 'move']) S[k] = s0[k];
    if (s1 && s1.move) S.move = s1.move;
    const cr = S.crabs || (S.crabs = []);
    cr.length = 0;
    for (const c of s0.crabs || []) {
      const c1 = s1 && s1.crabs ? s1.crabs.find((q) => q[0] === c[0]) : null;
      if (c1) cr.push([c[0], c[1] + (c1[1] - c[1]) * S.u, c[2] + (c1[2] - c[2]) * S.u, c[3] + (c1[3] - c[3]) * S.u, c[4] + angDiff(c[4], c1[4]) * S.u, c1[5]]);
      else cr.push(c);
    }
    // corrections
    const err = n.err, ev = n.errV;
    if (n.handoff) {
      n.handoff = false;
      if (n.prev && n.ready) { err.set(n.prev.x - S.x, n.prev.y - S.y, n.prev.z - S.z); if (err.lengthSq() > 144) { err.set(0, 0, 0); ev.set(0, 0, 0); } }
    } else if (n.prev && n.prevT !== undefined && n.ready) {
      const P = n._P || (n._P = {});
      at(n.prevT, P);
      const jx = n.prevRaw.x - P.x, jz = n.prevRaw.z - P.z, j2 = jx * jx + jz * jz;
      // (a charging boss covers 4 m in a quarter second: only a genuinely lost thread — > 12 m — is shown as a cut)
      if (j2 > 1e-6 && j2 < 144) { err.x += jx; err.z += jz; } else if (j2 >= 144) { err.set(0, 0, 0); ev.set(0, 0, 0); }
    }
    (n.prevRaw || (n.prevRaw = new THREE.Vector3())).set(S.x, S.y, S.z);
    n.prevT = tr;
    if (err.x || err.y || err.z || ev.x || ev.y || ev.z) {
      const w = 13, k = Math.exp(-w * dt);
      for (const c of ['x', 'y', 'z']) { const x0 = err[c], v0 = ev[c], q = v0 + w * x0; err[c] = (x0 + q * dt) * k; ev[c] = (v0 - w * q * dt) * k; }
      if (err.lengthSq() < 1e-6 && ev.lengthSq() < 1e-4) { err.set(0, 0, 0); ev.set(0, 0, 0); }
    }
    (n.prev || (n.prev = new THREE.Vector3())).set(S.x + err.x, S.y + err.y, S.z + err.z);
    n.ready = true;
  }

  _trigSideEffects(a, name) {
    if (!a._nearCamera()) return;
    const pos = a.pos;
    if (name === 'flick') G.audio?.play('roller_flick', { pos, volume: 0.8 });
    else if (name === 'slosh') G.audio?.play('slosh_throw', { pos, volume: 0.55 });
  }

  _playEvent(name, d) {
    const e = unpackEvent(d, this);
    if (!e) return;
    const a = e.actor || e.victim;
    if (!a || !a.remote) return;
    const near = a._nearCamera();
    switch (name) {
      case 'splatted': this._remoteSplat(e.victim, e.attacker, e.cause); return;
      case 'respawn': this._remoteRespawn(a); return;
      case 'actor:jump':
        if (near) G.audio?.play(e.swim ? 'swim_splash' : 'jump', { pos: a.pos, volume: 0.6 });
        if (e.swim) G.fx?.burst(_v2.copy(a.pos), UPV, a.color, { count: 10, speed: 3.5, size: 0.08 });
        break;
      case 'superjump':
        if (e.phase === 'charge') G.audio?.play('super_jump', { pos: a.pos, volume: 0.6 });
        if (e.phase === 'flight') { a.net.sjTo = e.to ? e.to.clone() : null; G.fx?.burst(_v2.copy(a.pos), UPV, a.color, { count: 16, speed: 6, size: 0.1 }); }
        break;
      case 'superjump:land': a.net.sjTo = null; G.fx?.burst(e.pos || a.pos, UPV, a.color, { count: 14, speed: 5, size: 0.09 }); break;
      case 'special:use': G.audio?.play('special_activate', { pos: a.pos, volume: 0.7 }); break;
      case 'special:slam':
        G.fx?.explosion(_v2.copy(e.pos).setY(e.pos.y + 0.3), a.color, e.radius);
        G.audio?.play('special_slam', { pos: e.pos });
        emit('shake', { pos: e.pos.clone(), amount: 1.0 });
        break;
      case 'weapon:dodge': if (near) G.audio?.play('dualies_roll', { pos: a.pos, volume: 0.5 }); break;
      case 'weapon:fire': G.projectiles?.ghostFire(a, e); break;
    }
    emit(name, e);
  }

  _remoteSplat(victim, attacker, cause) {
    if (!victim || !victim.alive) return;
    victim.alive = false; victim.hp = 0;
    victim.respawnTimer = PLAYER.respawnTime;
    victim.stats.deaths++;
    victim.specialActive = null; victim.superJumpState = null;
    victim.weaponRunner.reset();
    this._stopLoops(victim);
    _v2.copy(victim.pos); _v2.y += 0.6;
    G.fx?.splatted(_v2, attacker ? attacker.color : G.teamColors[victim.enemyTeam]);
    if (attacker) attacker.stats.splats++;
    victim.character.setVisible(false);
    victim.net.buf.length = 0; victim.net.ready = false; victim.net.has = false;
    victim.net.deathTp = victim.net.tp;
    // your own kills: the confirm sting / marker (the hit that did it was only a prediction)
    if (attacker && !attacker.remote) emit('hit', { attacker, victim, damage: 0, killed: true, weaponId: cause });
  }

  // Alive again, but the path still holds the old life until the owner's first post-respawn sample is due: stay hidden
  // until then (applyRemote), so the squidkid never flashes up where it was splatted and slides to the pad.
  _remoteRespawn(a) {
    a.alive = true; a.hp = PLAYER.hp; a.invuln = PLAYER.spawnInvuln;
    a.respawnTimer = 0;
    a.net.spawnPending = true;
  }

  // ---- hits (victim's owner) ------------------------------------------------------------------------------------------
  _hit(d) {
    const v = this.byNid.get(d.v), atk = this.byNid.get(d.a);
    if (!v || v.remote || !v.alive || !atk || atk.team === v.team) return;
    this._applyingHit = true;
    G.projectiles?.applyHit(atk, v, d.d, d.w);
    this._applyingHit = false;
  }

  // ---- host clock / state / result --------------------------------------------------------------------------------------
  _hostClock([state, time]) {
    const m = this.match;
    if (!m || this.isHost) return;
    if (state === 'playing' && m.state === 'playing' && Math.abs(m.time - time) > 0.2) m.time += (time - m.time) * 0.5;
  }
  _hostState(d) {
    const m = this.match;
    if (!m || this.isHost) return;
    if (typeof d.t === 'number') m.time = d.t;
    if (d.s !== m.state && d.s !== 'judge') m.setState(d.s);
  }
  sendResult(result) {
    if (!this.isHost) return;
    this._sendNow({ k: 'res', cov: result.coverage, win: result.winner, mode: result.mode, bo: result.boss,
      ...(result.mode === 'zones' ? { zc: result.counts, zp: result.penalty, zr: result.reason, zo: result.overtime ? 1 : 0, zl: result.log } : {}),
      ...(result.mode === 'tower' ? { zc: result.counts, zr: result.reason, zo: result.overtime ? 1 : 0, tb: result.best, tl: result.len } : {}),
      st: this.match.actors.map((a) => [a.nid, Math.round(a.stats.turf), a.stats.splats, a.stats.deaths, Math.round(a.stats.bossDmg || 0), a.stats.weakHits || 0]) });
  }
  _result(d) {
    const m = this.match;
    if (!m || this.isHost) return;
    for (const [nid, turf, splats, deaths, bossDmg, weakHits] of d.st || []) { const a = this.byNid.get(nid); if (a) { a.stats.turf = turf; a.stats.splats = splats; a.stats.deaths = deaths; if (bossDmg !== undefined) { a.stats.bossDmg = bossDmg; a.stats.weakHits = weakHits; } } }
    if (d.mode !== 'boss') m.time = 0;   // (a boss win stops the clock where it was)
    m.result = d.mode === 'boss' ? { mode: 'boss', coverage: d.cov, winner: d.win, boss: d.bo }
      : d.mode === 'zones' ? { mode: 'zones', coverage: d.cov, winner: d.win, reason: d.zr, counts: d.zc, penalty: d.zp, overtime: !!d.zo, log: d.zl || [] }
        : d.mode === 'tower' ? { mode: 'tower', coverage: d.cov, winner: d.win, reason: d.zr, counts: d.zc, best: d.tb, len: d.tl, overtime: !!d.zo }
        : { coverage: d.cov, winner: d.win };
    m.setState('judge');
  }
  sendEnd() { if (this.isHost) this._sendNow({ k: 'end' }); }

  // ---- players leaving: their squidkid carries on as a bot, run by the host -------------------------------------------
  // (a humans-only stage — config noBots, Cargo Terminal — removes it instead: it vanishes in an ink burst on every
  // screen; the clock and judge still move with the host)
  onLeave(id, hostChanged) {
    if (!this.match) return;
    const drop = mapNoBots(this.cfg.map);
    for (const a of [...this.byNid.values()]) {
      if (a.owner !== id) continue;
      if (drop) { this._remove(a); continue; }
      a.owner = this.s.hostId;
      if (a.owner === this.myId) this._adopt(a);
      else { a.net.buf.length = 0; a.net.handoff = true; }   // same squidkid, new sender: glide onto its new path
    }
    if (hostChanged && this.isHost) { this.match.follower = false; this.clockT = 0; }
    // the boss moves with the host: the new host adopts it from what it was showing; everyone else glides onto its path
    if (hostChanged && this.match.boss) { if (this.isHost) this.match.boss.adopt(); else this.match.boss.handoff(); }
  }

  _remove(a) {
    this.byNid.delete(a.nid);
    this._stopLoops(a);
    this.match.removeActor(a);
  }

  _adopt(a) {
    // continue from exactly where it was drawn — no pop
    a.remote = false;
    this._stopLoops(a);
    a.isBot = true;
    a.intent.move.set(0, 0, 0); a.intent.fire = a.intent.squid = a.intent.jump = a.intent.sub = a.intent.special = false;
    a.bot = new BotBrain(a, this.cfg.difficulty || 'normal');
    a.bot.aimYaw = a.yaw; a.bot.aimPitch = 0;
    a.weaponRunner.reset();
    a.superJumpState = null; a.specialActive = null;
    a.netTp = a.net.tp || 0;          // continue the teleport counter everyone else has seen: no false snap
    a.net.buf.length = 0;
    if (a.alive && a.net.spawnPending) { a.net.spawnPending = false; a.respawn(); }   // mid-respawn: finish it here
    else if (a.alive) { a.character.setVisible(true); a.character.root.visible = true; }
    a.net.err.set(0, 0, 0); a.net.errV?.set(0, 0, 0);   // a.pos is already where it was drawn (path + offset)
  }

  _ownership() { /* reserved: explicit transfers */ }

  shouldApplyHit(attacker, victim) {
    // ghosts never hurt anyone; the shooter's client decides, the victim's owner applies
    if (this._applyingHit) return 'local';
    if (attacker.remote) return 'drop';
    if (victim.remote) return 'send';
    return 'local';
  }
}

// ---------------------------------------------------------------------------------------------- packing helpers
const UPV = new THREE.Vector3(0, 1, 0);

function packActor(a) {
  const wr = a.weaponRunner;
  let f = 0;
  if (a.alive) f |= F.alive;
  if (a.form === 'squid') f |= F.squid;
  if (a.submerged) f |= F.sub;
  if (a.climbing) f |= F.climb;
  if (a.grounded) f |= F.grounded;
  if (a.groundTeam === 1) f |= F.gt1; else if (a.groundTeam === 2) f |= F.gt2;
  if (wr.charging) f |= F.charging;
  if (wr.rolling) f |= F.rolling;
  if (wr.streaming) f |= F.streaming;
  if (wr.dodge) f |= F.dodge;
  if (wr.aimingSub) f |= F.subAim;
  if (wr.firingT > 0) f |= F.firing;
  if (a.specialActive) f |= F.special;
  if (a.superJumpState) f |= a.superJumpState.phase === 'flight' ? F.sjFlight : F.sjCharge;
  if (wr.flick >= 0) f |= F.flick;
  if (wr.slosh >= 0) f |= F.slosh;
  if (a.invuln > 0) f |= F.invuln;
  if (a.onEnemy) f |= F.enemy;
  // the visual position (the owner's step smoothing included) — that's what the owner sees
  const y = a.pos.y + (a.smoothY || 0);
  const n = a.climbing ? a.wallN : null;
  return [a.nid, r2(a.pos.x), r2(y), r2(a.pos.z), r2(a.vel.x), r2(a.vel.y), r2(a.vel.z), r3(a.yaw), r3(a.aimYaw), r3(a.aimPitch), f,
    Math.round(a.hp), Math.round(a.ink), Math.round(a.special), r2(wr.streaming ? wr.burstFrac : wr.charge), Math.round(a.stats.turf), a.netTp || 0,
    n ? r2(n.x) : 0, n ? r2(n.y) : 0, n ? r2(n.z) : 0, r2(wr.lockT || 0),
    MAIN_KITS[a.weapon?.kind]?.netState?.(wr) | 0, SPECIAL_ORDER.indexOf(a.specialId) + 1, specialNetState(a)];
}

function unpackActor(s, ts) {
  return { t: ts, x: s[1], y: s[2], z: s[3], vx: s[4], vy: s[5], vz: s[6], yaw: s[7], aimYaw: s[8], aimPitch: s[9], f: s[10], hp: s[11], ink: s[12], sp: s[13], ch: s[14], turf: s[15], tp: s[16], wx: s[17], wy: s[18], wz: s[19], lock: s[20], ks: s[21] || 0, spx: s[22] || 0, spst: s[23] || 0 };
}

function blankSample() { return { t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, aimYaw: 0, aimPitch: 0, f: 0, hp: 100, ink: 100, sp: 0, ch: 0, turf: 0, tp: 0, wx: 0, wy: 0, wz: 1, lock: 0, ks: 0, spx: 0, spst: 0 }; }
function copySample(s, o) { for (const k in s) o[k] = s[k]; return o; }

// cubic Hermite on position (owner velocities as tangents), linear on velocity/angles, discrete state from the earlier
function quantile(arr, q) {
  const s = arr.slice().sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
}

function hermite(a, b, t, o) {
  const d = Math.max(1e-3, b.t - a.t), u = Math.min(1, Math.max(0, (t - a.t) / d));
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  copySample(a, o);
  o.t = t;
  o.x = h00 * a.x + h10 * d * a.vx + h01 * b.x + h11 * d * b.vx;
  o.z = h00 * a.z + h10 * d * a.vz + h01 * b.z + h11 * d * b.vz;
  // vertical: Hermite in the air, but never through a floor both ends are standing on (landing velocities jump)
  let y = h00 * a.y + h10 * d * a.vy + h01 * b.y + h11 * d * b.vy;
  if ((a.f & F.grounded) || (b.f & F.grounded)) y = Math.min(Math.max(a.y, b.y) + 0.02, Math.max(Math.min(a.y, b.y) - 0.02, y));
  o.y = y;
  o.vx = a.vx + (b.vx - a.vx) * u; o.vy = a.vy + (b.vy - a.vy) * u; o.vz = a.vz + (b.vz - a.vz) * u;
  o.yaw = a.yaw + angDiff(a.yaw, b.yaw) * u;
  o.aimYaw = a.aimYaw + angDiff(a.aimYaw, b.aimYaw) * u;
  o.aimPitch = a.aimPitch + (b.aimPitch - a.aimPitch) * u;
  o.ch = a.ch + (b.ch - a.ch) * u;
  o.lock = a.lock + (b.lock - a.lock) * u;
  o.hp = u < 0.5 ? a.hp : b.hp; o.ink = a.ink + (b.ink - a.ink) * u;
  return o;
}

// trigger payloads: numbers, plain objects, or the dualies hand objects (valueOf)
function packTrig(d) {
  if (d == null) return 0;
  if (typeof d === 'number') return r3(d);
  if (typeof d === 'object') { const o = {}; for (const k in d) { const v = d[k]; if (typeof v === 'number') o[k] = r3(v); } return o; }
  return 0;
}
function unpackTrig(d) {
  if (!d) return undefined;
  if (typeof d === 'number') return d;
  if (typeof d === 'object') { const o = { ...d }; if (o.amp !== undefined) o.valueOf = function () { return this.amp; }; else if (o.hand !== undefined) o.valueOf = () => 1; return o; }
  return undefined;
}

// event payloads: actors → {n: nid}, vectors → [x, y, z]
function packEvent(e) {
  const o = {};
  for (const k in e) {
    const v = e[k];
    if (v && v.nid !== undefined && v.character) o[k] = { n: v.nid };
    else if (v && v.isVector3) o[k] = [r2(v.x), r2(v.y), r2(v.z)];
    else if (typeof v === 'number') o[k] = r3(v);
    else if (typeof v === 'string' || typeof v === 'boolean') o[k] = v;
  }
  return o;
}
function unpackEvent(d, nm) {
  const e = {};
  for (const k in d) {
    const v = d[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && v.n !== undefined) e[k] = nm.byNid.get(v.n) || null;
    else if (Array.isArray(v) && v.length === 3) e[k] = new THREE.Vector3(v[0], v[1], v[2]);
    else e[k] = v;
  }
  return e;
}

export { F as NET_FLAGS, WEAPONS as _W };
