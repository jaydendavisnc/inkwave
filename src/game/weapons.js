// Weapons: per-actor WeaponRunner (fire logic for shooter/roller/charger/blaster/bucket/spinner/twins/brush +
// upstream's dualies/slosher/splatling + bomb sub) and the global
// Projectiles system (ink shots, blaster blobs, roller drops, bombs, storm clouds, charger beams, bomb arc preview).
//
// Accuracy (stream 4): every shot leaves the muzzle aimed at the crosshair's world point and shooter shots get a
// ballistic launch-pitch correction (same integrator as the flight) so, inside the weapon's range, they land on the
// crosshair instead of dropping under it; spread is a cone around that corrected line (shooter: first-shot accurate,
// blooms with sustained fire, recovers when you let go). Hit tests use the victim's visual (smoothed) body.
import * as THREE from 'three';
import { G, emit, clamp, lerp, smoothstep } from '../core/ctx.js';
import { WEAPONS, SUB, SPECIALS, PLAYER, subViewScale } from '../config.js';
import { Physics, Hit } from './physics.js';
import { MAIN_KITS, SUB_KITS } from './kits/registry.js';

// local-player gamepad rumble (subtle; no-op without a pad or with settings.rumble = 0)
function rumble(a, strong, weak, ms) { if (a && a.isLocal && !a.isBot) G.input?.rumble?.(strong, weak, ms); }
// feet of the victim's *visual* body (the smoothed root), so what you see is what you hit
const _hb = new THREE.Vector3();
function hitBase(e) { return _hb.set(e.pos.x, e.pos.y + (e.smoothY || 0), e.pos.z); }
const SIM_DT = 1 / 60;

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _dir = new THREE.Vector3(), _fwd = new THREE.Vector3(), _vh = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), ZAX = new THREE.Vector3(0, 0, 1);
const _hit = new Hit(), _hit2 = new Hit();
const _res = { t: 0, dist: 0 };
const DEG = Math.PI / 180;
// sprout pods (src/game/pods.js): how much more a heavy single shot's splat counts toward a pod's meter than its ink
// alone would (splat opts.pod) — so one full-charge charger shot or one roller flick fills a meter (tools/botlab/tests/pods.js
// calibration); any other thrown drop (brush swipes, cutlass crescents, sprinkler spray) a little more too.
// charger: × (1 + charger · charge²)
export const POD_HINT = { charger: 4.5, flick: 7.5, drop: 1.6 };
// trigger('shoot', HAND_*) arg for dual wield (character.js reads .hand; valueOf keeps numeric readers at 1)
const HAND_R = Object.freeze({ hand: 0, valueOf() { return 1; } }), HAND_L = Object.freeze({ hand: 1, valueOf() { return 1; } });

// ---------------------------------------------------------------------------------------------- per-actor runner
export class WeaponRunner {
  constructor(actor) {
    this.a = actor;
    this.reset();
  }
  reset() {
    this.cooldown = 0; this.charge = 0; this.charging = false; this.rolling = false;
    this.flick = -1; this.firingT = 0; this.emptyCd = 0; this.aimingSub = false;
    this.bloom = 0; this.spread = 0; this.rollT = 0; this.chargeT = 0; this.flickRecover = 0; this.rumbleT = 0;
    this.rollDist = 0; this.rollHits = new Map(); this.chargeLoop?.stop(0.05); this.chargeLoop = null; this.chargeDinged = false;
    this.rollLoop?.stop(0.1); this.rollLoop = null;
    this.lastRollPos = null;
    // spinner: charged burst; twins: dodge roll + planted stance; brush/bucket reuse flick (swing) + rolling (brushing)
    // (burstT is shared: the spinner's burst left / the splatling's stream left)
    this.burstT = 0; this.burstPower = 0; this.streamCd = 0;
    this.dodgeT = 0; this.dodgeDir = this.dodgeDir || new THREE.Vector3(); this.rollsUsed = 0; this.rollLock = 0; this.sinceRoll = 9; this.rollQueued = false;
    this.turret = false; this.twinSide = 1; this.swipeSide = 1;
    // dualies: alternating hand, per-hand shot clocks ([right, left] s since that hand fired — twins use them too),
    // dodge roll + locked turret afterwards. dualRolls = rolls left in the chain (rollsLeft() is the HUD accessor)
    this.hand = 0; this.sinceHand = this.sinceHand || [99, 99]; this.sinceHand[0] = this.sinceHand[1] = 99;
    this.dodge = null; this.lockT = 0; this.dualRolls = this.a?.weapon?.rolls ?? 2; this.rollPaint = 0;
    this._dodgeDir = this._dodgeDir || new THREE.Vector3();
    // slosher windup · splatling stream
    this.slosh = -1; this.streaming = false; this.burstDur = 0; this.burstFrac = 0;
    this.spinLoop?.stop(0.08); this.spinLoop = null;
    this.kit = null;   // kit weapons (kits/*.js) keep their per-runner state here
    MAIN_KITS[this.a?.weapon?.kind]?.reset?.(this);
  }
  onDeath() { this.reset(); }
  // Swim pressed over the weapon (actor.js: the latest press of swim / fire / sub wins): let go of what the weapon is
  // doing — a charge (no shot, no ink spent), a splatling / spinner stream, a flick / swing / slosh wind-up, the sub held
  // ready to throw (not thrown). Dodge rolls and the post-roll turret keep the body (brief, committed moves); kit weapons
  // cancel their own through MAIN_KITS[kind].cancel?(runner). True when anything was dropped.
  cancelForSwim() {
    let did = false;
    if (this.charging) { this.charging = false; this.charge = 0; this.chargeT = 0; this.chargeLoop?.stop(0.05); this.chargeLoop = null; this.spinLoop?.stop(0.08); this.spinLoop = null; did = true; }   // (a splatling's charge hum is its spinLoop)
    if (this.streaming || this.burstT > 0) { this.streaming = false; this.burstT = 0; this.burstPower = 0; this.spinLoop?.stop(0.08); this.spinLoop = null; did = true; }
    if (this.flick >= 0) { this.flick = -1; did = true; }
    if (this.slosh >= 0) { this.slosh = -1; did = true; }
    if (this.aimingSub) { this.aimingSub = false; did = true; }
    if (MAIN_KITS[this.a.weapon?.kind]?.cancel?.(this)) did = true;
    return did;
  }
  busy() { return this.charging || this.flick >= 0 || this.burstT > 0 || this.dodgeT > 0 || this.slosh >= 0 || this.streaming || !!this.dodge || this.lockT > 0 || !!MAIN_KITS[this.a.weapon?.kind]?.busy?.(this); }
  firingPose() { return this.firingT > 0 || this.charging || this.flick >= 0 || this.rolling || this.burstT > 0 || this.turret || this.slosh >= 0 || this.streaming || !!this.dodge || this.lockT > 0 || !!MAIN_KITS[this.a.weapon?.kind]?.firingPose?.(this); }
  moveSpeed() {
    { const K = MAIN_KITS[this.a.weapon?.kind]; const v = K?.moveSpeed?.(this, this.a.weapon); if (v) return v; }
    const w = this.a.weapon;
    switch (w.kind) {
      case 'brush':   // brushing is faster than running; swipes barely slow you
        if (this.rolling) return lerp(w.moveSpeedFiring, w.brushSpeed, smoothstep(0, 0.35, this.rollT));
        return this.firingT > 0 ? w.moveSpeedFiring : PLAYER.runSpeed;
      case 'bucket':
        if (this.flick >= 0) return w.moveSpeedFiring * 0.7;
        return this.firingT > 0 ? w.moveSpeedFiring : PLAYER.runSpeed;
      case 'spinner':
        if (this.burstT > 0) return w.moveSpeedFiring;
        if (this.charging) return lerp(PLAYER.runSpeed * 0.75, w.moveSpeedCharging, Math.min(1, this.charge * 2));
        return PLAYER.runSpeed;
      case 'twins':
        return this.firingT > 0 ? w.moveSpeedFiring : PLAYER.runSpeed;
    }
    if (this.lockT > 0) return 0;                                     // dualies: planted after a roll
    if (this.streaming) return w.moveSpeedFiring;                     // splatling stream
    if (this.charging && w.kind === 'splatling') return lerp(PLAYER.runSpeed * 0.75, w.moveSpeedCharging, Math.min(1, this.charge * 2.5));
    if (this.slosh >= 0) return w.moveSpeedFiring * 0.7;              // slosher heave plants you a little
    // roller: the drum has weight — rolling speed builds up over ~0.45 s; the flick wind-up plants you
    if (this.rolling) return lerp(w.rollSpeed * 0.5, w.rollSpeed, smoothstep(0, 0.45, this.rollT));
    if (this.flick >= 0) return lerp(w.moveSpeedFiring, w.moveSpeedFiring * 0.45, clamp(this.flick / w.flickWindup, 0, 1));
    if (this.flickRecover > 0) return lerp(PLAYER.runSpeed, w.moveSpeedFiring * 0.6, this.flickRecover / 0.18);
    if (this.charging) return lerp(PLAYER.runSpeed * 0.7, w.moveSpeedFiring, Math.min(1, this.charge * 3));
    if (this.firingT > 0) return w.moveSpeedFiring;
    return PLAYER.runSpeed;
  }

  // current shot cone half-angle in degrees (HUD crosshair should use this)
  _spreadDeg(w) {
    { const K = MAIN_KITS[w.kind]; if (K?.spreadDeg) return K.spreadDeg(this, w); }
    const a = this.a;
    if (w.kind === 'shooter' || w.kind === 'splatling' || w.kind === 'dualies') {
      if (w.kind === 'dualies' && this.lockT > 0) return w.spreadLock;   // locked turret: tight
      const base = a.grounded ? w.spreadGround : w.spreadAir;
      return base * lerp(w.spreadFirst ?? 0.45, 1, this.bloom);
    }
    if (w.kind === 'blaster') return a.grounded ? (w.spread ?? 1.2) : (w.spreadAir ?? 4);
    if (w.kind === 'twins') return this.turret ? w.turretSpread : (a.grounded ? w.spreadGround : w.spreadAir) * lerp(0.5, 1, this.bloom);
    if (w.kind === 'spinner') return a.grounded ? w.spreadGround : w.spreadAir;
    return 0;
  }

  update(dt, inp) {
    const a = this.a, w = a.weapon;
    this.cooldown -= dt; this.emptyCd -= dt; this.rumbleT -= dt;
    this.firingT = Math.max(0, this.firingT - dt);
    this.flickRecover = Math.max(0, this.flickRecover - dt);
    // spread bloom recovers when the trigger is released (and slowly while still firing between shots)
    if (!inp.fire) this.bloom = Math.max(0, this.bloom - dt / (w.bloomRecover ?? 0.28));
    this.spread = this._spreadDeg(w);
    this.sinceHand[0] += dt; this.sinceHand[1] += dt;
    switch (w.kind) {
      case 'shooter': case 'blaster': this._auto(dt, inp, w); break;
      case 'charger': this._charger(dt, inp, w); break;
      case 'roller': this._roller(dt, inp, w); break;
      case 'bucket': this._bucket(dt, inp, w); break;
      case 'spinner': this._spinner(dt, inp, w); break;
      case 'twins': this._twins(dt, inp, w); break;
      case 'brush': this._brush(dt, inp, w); break;
      case 'dualies': this._dualies(dt, inp, w); break;
      case 'slosher': this._slosher(dt, inp, w); break;
      case 'splatling': this._splatling(dt, inp, w); break;
      default: MAIN_KITS[w.kind]?.update(this, dt, inp, w);   // kit weapons (kits/*.js)
    }
    // ---- sub weapon (the actor's own: the Splat Bomb here, everything else via G.subs). Bomb Barrage: its bomb,
    // no ink, as fast as its throw gap allows
    const bar = a.specialActive && a.specialActive.kind === 'barrage' ? a.specialActive : null;
    const sub = bar ? bar.bomb : (a.sub || SUB.bomb);
    const SK = SUB_KITS[sub.kind];
    if (this.aimingSub && SK?.hold) SK.hold(this, dt, inp, sub);   // charge-up subs
    if (inp.sub && !this.aimingSub) {
      this.aimingSub = true;
      if (!bar && a.ink < sub.inkCost && a.isLocal) { G.audio?.play('low_ink'); emit('lowink', { actor: a, need: sub.inkCost }); }
    }
    if (this.aimingSub) a.fireFacing = 0.3;
    if (inp.subReleased && this.aimingSub) {
      this.aimingSub = false;
      // "Can't use": a kit sub that only allows one out at a time (or similar) refuses the throw, ink untouched
      const refused = !!SK?.blocked?.(a, sub);
      if (refused) emit('sub:cantuse', { actor: a, kind: sub.kind });
      const ok = !refused && (bar ? G.time >= (bar.nextThrow || 0) : a.ink >= sub.inkCost);
      if (ok) {
        if (bar) bar.nextThrow = G.time + bar.def.gap; else a.ink -= sub.inkCost;
        a.lastFire = 0;
        a.character.trigger('throw');
        if (sub.kind === 'bomb') G.projectiles.throwBomb(a); else G.subs.use(a, sub);
        rumble(a, 0.08, 0.22, 70);
      }
    }
    if (!inp.sub && !inp.subReleased) this.aimingSub = false;
  }

  _empty() {
    const a = this.a;
    if (this.emptyCd > 0) return;
    this.emptyCd = 0.45;
    if (a.isLocal) { G.audio?.play('empty_click'); emit('lowink', { actor: a }); }
  }

  _auto(dt, inp, w) {
    const a = this.a;
    if (!inp.fire) { if (this.cooldown < 0) this.cooldown = 0; return; }
    this.firingT = 0.35;
    a.fireFacing = 0.5;
    let guard = 0;
    while (this.cooldown <= 0 && guard++ < 3) {
      if (a.ink < w.inkPerShot) { this._empty(); this.cooldown += w.fireInterval; break; }
      a.ink -= w.inkPerShot;
      a.lastFire = 0;
      this.spread = this._spreadDeg(w);
      if (w.kind === 'shooter') G.projectiles.fireShooter(a, w, this.spread);
      else G.projectiles.fireBlaster(a, w, this.spread);
      this.bloom = Math.min(1, this.bloom + (w.bloomPerShot ?? 0.3));
      a.character.trigger('shoot');
      this.cooldown += w.fireInterval;
    }
  }

  _charger(dt, inp, w) {
    const a = this.a;
    if (inp.fire && this.cooldown <= 0) {
      if (!this.charging) {
        if (a.ink < w.inkFull * 0.2) { this._empty(); return; }
        this.charging = true; this.charge = 0; this.chargeT = 0; this.chargeDinged = false;
        this.chargeLoop?.stop(0.05);
        if (a.isLocal || a._nearCamera()) this.chargeLoop = G.audio?.loop('charger_charge', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 0.55 : 0.35, pitch: 1 });
      }
      const maxCharge = clamp(a.ink / w.inkFull, 0, 1);
      // charge builds on a gentle S-curve (quick first 20 % so taps are useful, a committed middle, a crisp top-off)
      this.chargeT = Math.min(1, this.chargeT + dt / w.chargeTime);
      const t = this.chargeT, curve = t < 0.2 ? t * 1.25 : 0.25 + (t - 0.2) * 0.9375;
      this.charge = Math.min(maxCharge, curve);
      a.fireFacing = 0.4;
      this.chargeLoop?.set({ pitch: 1 + this.charge * 1.5, pos: a.isLocal ? undefined : a.pos });
      if (this.charge >= 1 && !this.chargeDinged) {
        this.chargeDinged = true;
        if (a.isLocal) G.audio?.play('charger_full', { volume: 0.7 });
        rumble(a, 0.05, 0.3, 60);
      }
    } else if (this.charging) {
      this.charging = false;
      this.chargeLoop?.stop(0.05); this.chargeLoop = null;
      const c = Math.max(0.12, this.charge);
      a.ink = Math.max(0, a.ink - w.inkFull * c);
      a.lastFire = 0;
      G.projectiles.fireCharger(a, w, c);
      a.character.trigger('charge_release');
      this.charge = 0; this.chargeT = 0;
      this.firingT = 0.35;
      this.cooldown = 0.28;
    }
  }

  _roller(dt, inp, w) {
    const a = this.a;
    // flick wind-up → release
    if (this.flick >= 0) {
      this.flick += dt;
      a.fireFacing = 0.4;
      if (this.flick >= w.flickWindup) {
        this.flick = -1;
        G.projectiles.fireFlick(a, w);
        this.cooldown = w.flickInterval - w.flickWindup;
        this.firingT = 0.25;
        this.flickRecover = 0.18;
      }
      return;
    }
    if (inp.firePressed && this.cooldown <= 0) {
      if (a.ink < w.flickInk) { this._empty(); }
      else {
        a.ink -= w.flickInk; a.lastFire = 0;
        this.flick = 0;
        a.character.trigger('flick');
        if (a.isLocal || a._nearCamera()) G.audio?.play('roller_flick', { pos: a.isLocal ? undefined : a.pos, volume: 0.8 });
        return;
      }
    }
    const canRoll = inp.fire && a.grounded && a.ink > 0.5 && this.cooldown <= 0.25;
    this.rollT = canRoll ? this.rollT + dt : 0;
    if (canRoll !== this.rolling) {
      this.rolling = canRoll;
      if (canRoll) { this.lastRollPos = a.pos.clone(); this.rollDist = 0; }
      this.rollLoop?.stop(0.05);
      if (canRoll && (a.isLocal || a._nearCamera())) this.rollLoop = G.audio?.loop('roll', { pos: a.isLocal ? undefined : a.pos, volume: 0 });
      if (!canRoll) { this.rollLoop?.stop(0.12); this.rollLoop = null; }
    }
    if (inp.fire && a.ink <= 0.5) this._empty();
    if (!this.rolling) return;
    a.lastFire = 0;
    const hs = Math.hypot(a.vel.x, a.vel.z);
    this.rollLoop?.set({ volume: clamp(hs / w.rollSpeed, 0, 1) * (a.isLocal ? 0.7 : 0.45), pitch: 0.6 + clamp(hs / w.rollSpeed, 0, 1), pos: a.isLocal ? undefined : a.pos });
    const moved = a.pos.distanceTo(this.lastRollPos);
    // roll damage in front of the drum
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    for (const e of G.actors) {
      if (e.team === a.team || !e.alive) continue;
      const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, dy = e.pos.y - a.pos.y;
      const fwd = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
      if (fwd > -0.2 && fwd < 1.35 && lat < w.rollWidth / 2 + 0.35 && Math.abs(dy) < 1.2 && hs > 1.0) {
        const last = this.rollHits.get(e) || -9;
        if (G.time - last > 0.5) { this.rollHits.set(e, G.time); G.projectiles.applyHit(a, e, w.rollDamage, 'roller'); }
      }
    }
    // boss mode: the drum crushes into HULLBREAKER's claws / belly and flattens crablets
    if (G.boss && hs > 1.0) {
      const bh = G.boss.rollHit(a.pos, fx, fz, w.rollWidth);
      const key = bh && (bh.boss ? G.boss : bh.target);
      if (bh && G.time - (this.rollHits.get(key) || -9) > 0.5) { this.rollHits.set(key, G.time); G.boss.hit(a, w.rollDamage, bh.target, 'roller', bh.point); }
    }
    if (moved < 0.28) return;
    this.lastRollPos.copy(a.pos);
    a.ink = Math.max(0, a.ink - w.rollInkPerMeter * moved);
    // paint a stripe across the drum: kind 'roll' + the roll direction → paint.js lays one straight-edged band segment
    // per splat (identical on the CPU turf grid) instead of round blobs, so rolled turf reads as a clean stripe
    let area = 0;
    const rx = fz, rz = -fx; // right-ish perpendicular
    _fwd.set(fx, 0, fz);
    for (let i = -1; i <= 1; i++) {
      const off = i * w.rollWidth * 0.33;
      _v.set(a.pos.x + fx * 0.75 + rx * off, a.pos.y + 0.35, a.pos.z + fz * 0.75 + rz * off);
      area += G.paint.splat(_v, 0.62, a.team, { seed: Math.random(), kind: 'roll', stretch: _fwd });
    }
    a.addTurf(area);
    emit('weapon:impact', { pos: _v.set(a.pos.x + fx * 0.75, a.pos.y + 0.02, a.pos.z + fz * 0.75).clone(), normal: a.groundN ? a.groundN.clone() : UP.clone(), team: a.team, kind: 'roll', radius: w.rollWidth / 2 });
    if (this.rumbleT <= 0) { this.rumbleT = 0.12; rumble(a, 0.04, clamp(hs / w.rollSpeed, 0, 1) * 0.14, 110); }
  }

  // ---- dualies (upstream): the hands alternate (12 shots/s). A jump press while firing with a move direction
  // dodge-rolls instead (actor.js calls tryDodge / dodgeVel): a 0.3 s ink-trailing roll, then a 0.5 s locked turret —
  // planted, tight spread, faster fire. Two rolls chain; they refill once you stop firing and the lock has ended.
  _dualies(dt, inp, w) {
    const a = this.a;
    if (this.dodge) {
      const d = this.dodge;
      d.t += dt;
      a.fireFacing = 0.5; this.firingT = 0.35;
      this.rollPaint -= dt;
      if (this.rollPaint <= 0 && a.grounded) {          // the roll smears a trail of ink behind it
        this.rollPaint = 0.045;
        _v.set(a.pos.x, a.pos.y + 0.3, a.pos.z);
        a.addTurf(G.paint.splat(_v, 0.62, a.team, { seed: Math.random(), kind: 'trail' }));
      }
      if (d.t >= d.dur) { this.dodge = null; this.lockT = w.lockTime; }
      return;                                           // no shots mid-roll
    }
    if (this.lockT > 0) { this.lockT = Math.max(0, this.lockT - dt); a.fireFacing = 0.5; this.firingT = Math.max(this.firingT, 0.3); }
    if (!inp.fire && this.lockT <= 0) this.dualRolls = w.rolls;
    if (!inp.fire) { if (this.cooldown < 0) this.cooldown = 0; return; }
    this.firingT = 0.35;
    a.fireFacing = 0.5;
    let guard = 0;
    while (this.cooldown <= 0 && guard++ < 3) {
      if (a.ink < w.inkPerShot) { this._empty(); this.cooldown += w.fireInterval; break; }
      a.ink -= w.inkPerShot;
      a.lastFire = 0;
      this.spread = this._spreadDeg(w);
      this.hand ^= 1;
      G.projectiles.fireDualies(a, w, this.spread, this.hand);
      this.sinceHand[this.hand] = 0;
      this.bloom = Math.min(1, this.bloom + (w.bloomPerShot ?? 0.25));
      a.character.trigger('shoot', this.hand ? HAND_L : HAND_R);
      this.cooldown += this.lockT > 0 ? w.lockInterval : w.fireInterval;
    }
  }

  // dualies dodge roll along `move` (world xz); tryDodge() dispatches here. true = rolling (skip the jump).
  _dualDodge(move) {
    const a = this.a, w = a.weapon;
    if (w.kind !== 'dualies' || this.dodge || !a.alive || !a.grounded || a.form === 'squid' || this.aimingSub || !move) return false;
    if (!(this.firingT > 0 || a.intent.fire)) return false;
    const ml = Math.hypot(move.x, move.z);
    if (ml < 0.3 || this.dualRolls <= 0) return false;
    if (a.ink < w.rollInk) { this._empty(); return false; }
    a.ink -= w.rollInk; a.lastFire = 0;
    this.dualRolls--; this.lockT = 0; this.rollPaint = 0;
    this._dodgeDir.set(move.x / ml, 0, move.z / ml);
    this.dodge = { t: 0, dur: w.rollTime };
    const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw), dx = this._dodgeDir.x, dz = this._dodgeDir.z;
    a.character.trigger('dodge', { x: dx * cy - dz * sy, z: dx * sy + dz * cy, t: w.rollTime });   // root space (+x = its left)
    if (a.isLocal || a._nearCamera()) G.audio?.play('dualies_roll', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 0.7 : 0.5 });
    emit('weapon:dodge', { actor: a, pos: a.pos.clone(), dir: this._dodgeDir.clone() });
    rumble(a, 0.22, 0.32, 130);
    return true;
  }

  /** actor.js (_horizontal): while a dualies roll runs, sets the horizontal velocity (fast-out ease: 1.5·dist/time → 0)
   *  and returns true. (Twins use dodgeVelocity(out) instead.) */
  dodgeVel(vel) {
    const d = this.dodge;
    if (!d) return false;
    const w = this.a.weapon, u = Math.min(1, d.t / d.dur);
    const sp = (1.5 * w.rollDist / w.rollTime) * (1 - u * u);
    vel.x = this._dodgeDir.x * sp; vel.z = this._dodgeDir.z * sp;
    return true;
  }

  // ---- slosher (upstream): press / hold → a 0.13 s heave, then the wave leaves (Projectiles.fireSlosher); repeats
  // at the fire rate
  _slosher(dt, inp, w) {
    const a = this.a;
    if (this.slosh >= 0) {
      this.slosh += dt; a.fireFacing = 0.5; this.firingT = 0.35;
      if (this.slosh >= w.windup) { this.slosh = -1; G.projectiles.fireSlosher(a, w); this.cooldown = w.fireInterval - w.windup; }
      return;
    }
    if (inp.fire && this.cooldown <= 0) {
      if (a.ink < w.inkPerShot) { this._empty(); this.cooldown = 0.2; return; }
      a.ink -= w.inkPerShot; a.lastFire = 0;
      this.slosh = 0; this.firingT = 0.35; a.fireFacing = 0.5;
      a.character.trigger('slosh');
      if (a.isLocal || a._nearCamera()) G.audio?.play('slosh_throw', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 0.75 : 0.55 });
    }
  }

  // ---- splatling (upstream): hold → spin up (chargeTime; a motor loop rising in pitch, a clunk at full), release → a
  // stream of burstMin…burstMax s scaled by the charge at 15 shots/s. charge = spin-up while charging, the stream left
  // while streaming (burstFrac), so the HUD meter / weapon meter fill and then drain. burstT = stream time left.
  _splatling(dt, inp, w) {
    const a = this.a;
    const pos = a.isLocal ? undefined : a.pos;
    if (this.streaming) {
      this.burstT -= dt;
      this.burstFrac = Math.max(0, this.burstT / Math.max(0.01, this.burstDur));
      this.charge = this.burstFrac;
      this.firingT = 0.3; a.fireFacing = 0.5;
      let guard = 0;
      while (this.cooldown <= 0 && guard++ < 3 && this.burstT > 0) {
        if (a.ink < w.inkPerShot) { this._empty(); this.burstT = 0; break; }
        a.ink -= w.inkPerShot; a.lastFire = 0;
        this.spread = this._spreadDeg(w);
        G.projectiles.fireSplatling(a, w, this.spread);
        this.bloom = Math.min(1, this.bloom + (w.bloomPerShot ?? 0.05));
        a.character.trigger('shoot');
        this.cooldown += w.fireInterval;
      }
      this.spinLoop?.set({ pitch: 1.5 + 0.06 * Math.sin(G.time * 31), pos });
      if (this.burstT <= 0) {
        this.burstT = 0; this.streaming = false; this.charge = 0; this.burstFrac = 0; this.cooldown = Math.max(this.cooldown, 0.22);
        this.spinLoop?.stop(0.12); this.spinLoop = null;
        if (a.isLocal || a._nearCamera()) G.audio?.play('splatling_wind', { pos, volume: a.isLocal ? 0.6 : 0.42 });
      }
      return;
    }
    if (inp.fire && this.cooldown <= 0) {
      if (!this.charging) {
        if (a.ink < w.inkPerShot * 5) { this._empty(); return; }
        this.charging = true; this.charge = 0; this.chargeT = 0; this.chargeDinged = false;
        this.spinLoop?.stop(0.05);   // (never start a loop over a live one: an orphaned handle hums forever)
        if (a.isLocal || a._nearCamera()) this.spinLoop = G.audio?.loop('splatling_spin', { pos, volume: a.isLocal ? 0.6 : 0.4, pitch: 0.6 });
      }
      this.chargeT += dt;
      this.charge = Math.min(1, this.chargeT / w.chargeTime);
      a.fireFacing = 0.45;
      this.spinLoop?.set({ pitch: 0.6 + 0.85 * this.charge, pos });
      if (this.charge >= 1 && !this.chargeDinged) {
        this.chargeDinged = true;
        if (a.isLocal) G.audio?.play('splatling_ready', { volume: 0.7 });
        rumble(a, 0.05, 0.28, 60);
      }
    } else if (this.charging) {
      this.charging = false;
      this.burstDur = lerp(w.burstMin, w.burstMax, this.charge); this.burstT = this.burstDur; this.burstFrac = 1;
      this.streaming = true; this.cooldown = 0; this.bloom = 0;
    }
  }
}

// ---------------------------------------------------------------------------------------------- new weapon kinds
Object.assign(WeaponRunner.prototype, {
  // bucket: a short wind-up swing, then a volley of ink hurled in an arc (holding fire keeps hurling)
  _bucket(dt, inp, w) {
    const a = this.a;
    if (this.flick >= 0) {
      this.flick += dt; a.fireFacing = 0.45;
      if (this.flick >= w.windup) { this.flick = -1; G.projectiles.fireSlosh(a, w); this.cooldown = w.fireInterval - w.windup; this.firingT = 0.35; }
      return;
    }
    if (!(inp.fire || inp.firePressed) || this.cooldown > 0) return;
    if (a.ink < w.inkPerShot) { this._empty(); return; }
    a.ink -= w.inkPerShot; a.lastFire = 0;
    this.flick = 0;
    a.character.trigger('flick');   // two-handed underarm throw
    if (a.isLocal || a._nearCamera()) G.audio?.play('roller_flick', { pos: a.isLocal ? undefined : a.pos, volume: 0.7, pitch: 0.8 });
  },

  // spinner: hold to spin up (like a charger), release to fire a stream whose length and reach follow the charge
  _spinner(dt, inp, w) {
    const a = this.a;
    if (this.burstT > 0) {
      this.burstT -= dt; this.streamCd -= dt; this.firingT = 0.2; a.fireFacing = 0.5; a.lastFire = 0;
      let guard = 0;
      while (this.streamCd <= 0 && guard++ < 4) { G.projectiles.fireStream(a, w, this.burstPower, this._spreadDeg(w)); this.streamCd += w.fireInterval; a.character.trigger('stream'); }
      this.chargeLoop?.set({ pitch: 1.5 + 0.06 * Math.sin(G.time * 31), pos: a.isLocal ? undefined : a.pos });
      if (this.burstT <= 0) {
        this.burstT = 0; this.cooldown = 0.2; this.chargeLoop?.stop(0.12); this.chargeLoop = null;
        if (a.isLocal || a._nearCamera()) G.audio?.play('splatling_wind', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 0.6 : 0.42 });
      }
      return;
    }
    if (inp.fire && this.cooldown <= 0) {
      if (!this.charging) {
        if (a.ink < w.inkFull * 0.15) { this._empty(); return; }
        this.charging = true; this.charge = 0; this.chargeT = 0; this.chargeDinged = false;
        this.chargeLoop?.stop(0.05);
        if (a.isLocal || a._nearCamera()) this.chargeLoop = G.audio?.loop('splatling_spin', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 0.6 : 0.4, pitch: 0.6 });
      }
      this.chargeT = Math.min(1, this.chargeT + dt / w.chargeTime);
      this.charge = Math.min(clamp(a.ink / w.inkFull, 0, 1), this.chargeT);
      a.fireFacing = 0.4;
      this.chargeLoop?.set({ pitch: 0.6 + 0.85 * this.charge, pos: a.isLocal ? undefined : a.pos });
      if (this.charge >= 1 && !this.chargeDinged) {
        this.chargeDinged = true;
        if (a.isLocal) G.audio?.play('splatling_ready', { volume: 0.7 });
        rumble(a, 0.05, 0.28, 60);
      }
    } else if (this.charging) {
      this.charging = false;
      const c = Math.max(0.15, this.charge);
      a.ink = Math.max(0, a.ink - w.inkFull * c);
      this.burstPower = c; this.burstT = lerp(w.burstMin, w.burstMax, c); this.burstDur = this.burstT; this.streamCd = 0;
      this.charge = 0; this.chargeT = 0;
      a.character.trigger('charge_release');
    }
  },

  // twins: rapid alternating fire; after a dodge roll, holding fire plants you with both guns together (faster, tighter)
  _twins(dt, inp, w) {
    const a = this.a;
    this.rollLock = Math.max(0, this.rollLock - dt); this.sinceRoll += dt;
    if (this.rollLock <= 0 && this.sinceRoll > w.rollReset && this.dodgeT <= 0) this.rollsUsed = 0;
    if (this.turret && (!inp.fire || Math.hypot(a.intent.move.x, a.intent.move.z) > 0.3)) this.turret = false;   // walk = back to dual mode
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      if (this.dodgeT <= 0) {
        this.dodgeT = 0; this.turret = !!inp.fire;
        // a second roll tapped during this one chains straight on (if fire + a direction are still held)
        if (this.rollQueued) { this.rollQueued = false; if (this._twinDodge(a.intent)) return; }
      }
      return;
    }
    if (!inp.fire) { if (this.cooldown < 0) this.cooldown = 0; return; }
    this.firingT = 0.35; a.fireFacing = 0.5;
    let guard = 0;
    while (this.cooldown <= 0 && guard++ < 3) {
      if (a.ink < w.inkPerShot) { this._empty(); this.cooldown += w.fireInterval; break; }
      a.ink -= w.inkPerShot; a.lastFire = 0;
      this.twinSide = -this.twinSide;
      G.projectiles.fireTwin(a, w, this._spreadDeg(w), this.turret ? 0 : this.twinSide);
      this.bloom = Math.min(1, this.bloom + 0.25);
      // side +1 = the left gun, -1 = the right (planted mode keeps alternating the animation between both guns)
      const hand = this.twinSide > 0 ? 1 : 0;
      this.sinceHand[hand] = 0;
      a.character.trigger('shoot', hand ? HAND_L : HAND_R);
      this.cooldown += this.turret ? w.turretInterval : w.fireInterval;
    }
  },
  // Jump pressed while grounded (actor.js): roll instead of jumping? One dispatcher for both dual-wield kinds — twins
  // (ours: needs fire held + a move direction) and dualies (upstream: firing + a move direction). Accepts the actor's
  // intent (or a bare move vector). Returns true if a roll started.
  tryDodge(intent) {
    const k = this.a.weapon.kind;
    if (k === 'twins') return !!intent && intent.move !== undefined && this._twinDodge(intent);
    if (k === 'dualies') return this._dualDodge(intent && intent.move ? intent.move : intent);
    return false;
  },
  // twins: jump pressed while firing and moving → roll instead of jumping. Returns true if a roll started.
  _twinDodge(intent) {
    const a = this.a, w = a.weapon;
    // jump tapped mid-roll with a roll left in the chain: queue it (and swallow the press, so it never turns into a jump)
    if (w.kind === 'twins' && this.dodgeT > 0 && intent.fire && this.rollLock <= 0 && this.rollsUsed > 0 && this.rollsUsed < w.rollCharges) { this.rollQueued = true; return true; }
    if (w.kind !== 'twins' || !intent.fire || this.dodgeT > 0 || this.rollLock > 0 || !a.grounded || a.form !== 'kid') return false;
    const mh = Math.hypot(intent.move.x, intent.move.z);
    if (mh < 0.3 || a.ink < w.rollInk) return false;
    a.ink -= w.rollInk;
    this.dodgeDir.set(intent.move.x / mh, 0, intent.move.z / mh);
    this.dodgeT = w.rollTime; this.turret = false; this.sinceRoll = 0;
    // two rolls in a row, then a lockout before the next
    if (++this.rollsUsed >= w.rollCharges) { this.rollLock = w.rollLockout; this.rollsUsed = 0; }
    a.character.trigger('roll', this.dodgeDir);
    if (a.isLocal || a._nearCamera()) G.audio?.play('roll', { pos: a.isLocal ? undefined : a.pos, volume: 0.7, pitch: 1.6 });
    G.fx?.burst(_v.copy(a.pos).setY(a.pos.y + 0.1), UP, a.color, { count: 8, speed: 3, size: 0.07 });
    emit('actor:dodge', { actor: a, dir: this.dodgeDir.clone() });
    emit('weapon:dodge', { actor: a, pos: a.pos.clone(), dir: this.dodgeDir.clone() });   // upstream's dodge splash FX
    rumble(a, 0.2, 0.25, 90);
    return true;
  },
  // twins: horizontal velocity while rolling (fast start, eases out), or null (dualies use dodgeVel(vel))
  dodgeVelocity(out) {
    if (this.dodgeT <= 0) return null;
    const w = this.a.weapon, u = 1 - this.dodgeT / w.rollTime;       // 0 → 1 over the roll
    const v0 = w.rollDist / (0.7 * w.rollTime);
    return out.copy(this.dodgeDir).multiplyScalar(v0 * (1 - 0.6 * u));
  },
  // rolls left in the chain (HUD): twins (lockout → 0) or dualies
  rollsLeft() {
    const w = this.a.weapon;
    if (w.kind === 'dualies') return this.dualRolls;
    return this.rollLock > 0 ? 0 : (w.rollCharges ?? 0) - this.rollsUsed;
  },
  // cut any dodge roll / post-roll lock short (a special taking over the body or the trigger mid-roll must not leave
  // the roll velocity or the planted lock running while the runner isn't being updated)
  endDodge() {
    this.dodgeT = 0; this.turret = false;
    this.dodge = null; this.lockT = 0;
  },

  // brush: hold fire while running to brush a thin fast trail (light contact damage, never a one-hit splat);
  // tap (or hold while standing) to swipe side to side, flicking a spray of small globs
  _brush(dt, inp, w) {
    const a = this.a;
    if (this.flick >= 0) {
      this.flick += dt; a.fireFacing = 0.4;
      if (this.flick >= 0.04) { this.flick = -1; G.projectiles.fireSwipe(a, w, this.swipeSide); this.cooldown = w.swipeInterval; this.firingT = 0.25; }
      return;
    }
    const hs = Math.hypot(a.vel.x, a.vel.z);
    const moving = a.grounded && hs > 2.0 && Math.hypot(a.intent.move.x, a.intent.move.z) > 0.3;
    if ((inp.firePressed || (inp.fire && !moving)) && this.cooldown <= 0) {
      if (a.ink < w.swipeInk) this._empty();
      else {
        a.ink -= w.swipeInk; a.lastFire = 0; this.flick = 0;
        this.swipeSide = -this.swipeSide;
        a.character.trigger('flick', this.swipeSide);   // sideways swipe, alternating direction
        if (a.isLocal || a._nearCamera()) G.audio?.play('roller_flick', { pos: a.isLocal ? undefined : a.pos, volume: 0.5, pitch: 1.7 });
        if (this.rolling) { this.rolling = false; this.rollLoop?.stop(0.08); this.rollLoop = null; }
        return;
      }
    }
    const brushing = inp.fire && moving && a.ink > 0.3;
    this.rollT = brushing ? this.rollT + dt : 0;
    if (brushing !== this.rolling) {
      this.rolling = brushing;
      if (brushing) { this.lastRollPos = a.pos.clone(); this.rollHits.clear(); }
      this.rollLoop?.stop(0.05);
      if (brushing && (a.isLocal || a._nearCamera())) this.rollLoop = G.audio?.loop('roll', { pos: a.isLocal ? undefined : a.pos, volume: 0 });
      if (!brushing) { this.rollLoop?.stop(0.1); this.rollLoop = null; }
    }
    if (!this.rolling) return;
    a.lastFire = 0;
    this.rollLoop?.set({ volume: clamp(hs / w.brushSpeed, 0, 1) * (a.isLocal ? 0.45 : 0.3), pitch: 1.3 + clamp(hs / w.brushSpeed, 0, 1) * 0.8, pos: a.isLocal ? undefined : a.pos });
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    for (const e of G.actors) {
      if (e.team === a.team || !e.alive) continue;
      const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, dy = e.pos.y - a.pos.y;
      const fwd = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
      if (fwd > -0.2 && fwd < 1.2 && lat < w.brushWidth / 2 + 0.3 && Math.abs(dy) < 1.2) {
        const last = this.rollHits.get(e) || -9;
        if (G.time - last > w.brushHitCd) { this.rollHits.set(e, G.time); G.projectiles.applyHit(a, e, w.brushDamage, 'brush'); }
      }
    }
    // Boss Battle: the bristles drag across HULLBREAKER's claws / belly or a crablet (like the roller's drum)
    if (G.boss) {
      const bh = G.boss.rollHit(a.pos, fx, fz, w.brushWidth);
      const key = bh && (bh.boss ? G.boss : bh.target);
      if (bh && G.time - (this.rollHits.get(key) || -9) > w.brushHitCd) { this.rollHits.set(key, G.time); G.boss.hit(a, w.brushDamage, bh.target, 'brush', bh.point.clone()); }
    }
    const moved = a.pos.distanceTo(this.lastRollPos);
    if (moved < 0.22) return;
    this.lastRollPos.copy(a.pos);
    a.ink = Math.max(0, a.ink - w.brushInkPerMeter * moved);
    _v.set(a.pos.x + fx * 0.65, a.pos.y + 0.35, a.pos.z + fz * 0.65);
    a.addTurf(G.paint.splat(_v, w.brushWidth * 0.45, a.team, { seed: Math.random(), stretch: _v2.set(fx, 0, fz), stretchAmt: 0.5 }));
    emit('weapon:impact', { pos: _v.clone().setY(a.pos.y + 0.02), normal: a.groundN ? a.groundN.clone() : UP.clone(), team: a.team, kind: 'roll', radius: w.brushWidth / 2 });
    if (this.rumbleT <= 0) { this.rumbleT = 0.12; rumble(a, 0.02, clamp(hs / w.brushSpeed, 0, 1) * 0.08, 90); }
  },
});

// ---------------------------------------------------------------------------------------------- projectiles
const MAX_BLOBS = 700;
// stream-round looks (visual only; hit size stays in 'size'): dualies smaller + snappier, splatling tight and fast
const LOOK_DUAL_R = Object.freeze({ vis: 0.088, tail0: 0.8, tailK: 1.3, wob: 0.03, wobF: 28, nose: 0.3, sats: 2 });
const LOOK_DUAL_L = Object.freeze({ vis: 0.088, tail0: 0.8, tailK: 1.3, wob: 0.03, wobF: 28, nose: 0.3, sats: 2 });
const LOOK_SPLAT = Object.freeze({ vis: 0.086, tail0: 0.9, tailK: 1.6, wob: 0.025, wobF: 30, nose: 0.35, sats: 2 });
// our kinds: spinner stream ≈ splatling (a touch finer), twin pistols ≈ dualies (planted mode: longer, faster tails)
const LOOK_SPIN = Object.freeze({ vis: 0.08, tail0: 0.9, tailK: 1.6, wob: 0.025, wobF: 30, nose: 0.35, sats: 2 });
const LOOK_TWIN = Object.freeze({ vis: 0.088, tail0: 0.8, tailK: 1.3, wob: 0.03, wobF: 28, nose: 0.3, sats: 2 });
const LOOK_TWIN_PLANT = Object.freeze({ vis: 0.086, tail0: 0.9, tailK: 1.5, wob: 0.025, wobF: 30, nose: 0.35, sats: 2 });
// satellite droplets trailing each projectile (fractions of the head radius), thinning out down the string
const SAT_SIZE = [0.46, 0.33, 0.24, 0.17];

// Glossy ink teardrops: a unit sphere (poles on ±Z) deformed per instance in the vertex shader — round, pressure-
// flattened nose; the back half stretched into a tapering tail (length from speed); low-order liquid wobble — then
// oriented along the velocity by the instance matrix (uniform scale = head radius). aShape = (tail length in radii,
// wobble amplitude, wobble phase, nose flatten). Fresnel rim glow keeps them readable against pale floors; anything
// within ~1.6 m of the lens dithers out (allies' shots flying past your camera never blot the view).
function makeBlobMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0x000000, envMapIntensity: 1.15 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aShape;
        vec3 iwP;`)
      .replace('#include <beginnormal_vertex>', `
        vec3 objectNormal;
        {
          vec3 p = position, n = normal;
          float back = step(p.z, 0.0);
          float u = clamp(-p.z, 0.0, 1.0);
          float tau = mix(1.0, 1.0 - 0.42 * pow(u, 1.3), back);       // tail taper (soft, rounded tip)
          float fz = mix(1.0 - 0.22 * aShape.w, max(aShape.x, 1.0), back);
          iwP = vec3(p.xy * tau, p.z * fz);
          objectNormal = normalize(vec3(n.xy / max(tau, 0.15), n.z / fz));
          float wob = aShape.y * (0.6 * sin(aShape.z + 2.3 * p.x + 1.7 * p.y + 0.9 * p.z) + 0.4 * sin(1.63 * aShape.z - 2.9 * p.y + 2.1 * p.z));
          iwP += n * wob * (1.0 - 0.5 * back * u);
        }`)
      .replace('#include <begin_vertex>', 'vec3 transformed = iwP;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          float iwNear = smoothstep(0.55, 1.6, length(vViewPosition));
          float iwIgn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (iwIgn > iwNear) discard;
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float iwRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
          totalEmissiveRadiance += vColor.rgb * (0.16 + 0.55 * iwRim);
        }`);
  };
  mat.customProgramCacheKey = () => 'iw-blob-3';
  return mat;
}

// Camera-facing ribbon (x ∈ {-1, 1} across, z 0..1 along +Z) — charger beams and laser sights. The ribbon turns
// about its own axis to face the camera, so the streak keeps its full width even when seen nearly end-on (your own
// shot from behind the shoulder). Transform semantics match the old cylinders: position = muzzle, +Z = direction,
// scale.z = length (fxHooks reads those for the laser dot / beam trail).
function ribbonGeometry(segs = 16) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((segs + 1) * 6);
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const z = i / segs;
    pos.set([-1, 0, z, 1, 0, z], i * 6);
    if (i < segs) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0.5), 1);
  return g;
}
const RIBBON_VERT = /* glsl */`
uniform float uWidth, uLen;
varying vec2 vUv;
void main() {
  vec3 P = (modelMatrix * vec4(0.0, 0.0, position.z, 1.0)).xyz;
  vec3 A = normalize((modelMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
  vec3 toCam = cameraPosition - P;
  vec3 S = cross(A, toCam);
  float sl = length(S);
  S = sl > 1e-5 ? S / sl : vec3(1.0, 0.0, 0.0);
  float w = max(uWidth, length(toCam) * 0.0016);   // never thinner than ~1 px (no shimmer at range)
  P += S * position.x * w;
  vUv = vec2(position.x, position.z * uLen);
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}`;
const RIBBON_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uT, uLife, uLen, uCharge, uSeed, uMode;
varying vec2 vUv;
float iwH(float x) { return fract(sin(x * 78.233 + uSeed * 13.71) * 43758.5453); }
float iwN(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(iwH(i), iwH(i + 1.0), f); }
void main() {
  float v = vUv.x, m = vUv.y;
  float core = exp(-v * v * 16.0), glow = exp(-v * v * 3.0) * (1.0 - v * v);
  vec3 col; float a;
  if (uMode < 0.5) {
    // fired shot: tracer front races out, white-hot core snaps off, the ink sheath breaks into dashes as it goes
    float t = uT;
    float front = t * 1100.0;
    float drawn = smoothstep(front + 0.6, front - 0.6, m);
    float head = exp(-max(0.0, front - m) * 0.8) * (1.0 - smoothstep(0.02, 0.05, t));
    float k0 = -0.35 + 1.5 * (t / uLife);
    float br = iwN(m * 1.9 - t * 7.0) * 0.72 + iwN(m * 6.3 + 3.1) * 0.28;
    float keep = smoothstep(k0, k0 + 0.3, br);
    float ca = core * min(1.0, exp(-t * 11.0) * 1.3 + head);
    float ga = glow * 0.85 * exp(-t * 4.5) * keep;
    vec3 hot = mix(uColor, vec3(1.0), 0.6) * (2.2 + 3.2 * uCharge + 3.0 * head);
    col = uColor * (1.05 + 0.5 * uCharge) * ga + hot * ca;
    a = clamp(ga + ca, 0.0, 1.0);
    col /= max(a, 1e-3);
    a *= drawn * smoothstep(0.0, 0.3, m) * smoothstep(uLen + 0.05, uLen - 0.12, m);
  } else {
    // laser sight: pulses crawl toward the target faster as the charge builds; white-hot shimmer at full charge
    float ch = uCharge, full = step(0.995, ch);
    float dash = 0.55 + 0.45 * smoothstep(0.3, 0.7, fract(m * 1.4 - uT * (1.5 + 7.0 * ch)));
    float ca = core * (0.35 + 0.65 * ch) * dash;
    float ga = glow * (0.1 + 0.28 * ch) * dash;
    vec3 hot = mix(uColor, vec3(1.0), 0.3 + 0.45 * full) * (1.0 + 2.4 * ch * ch + full * (0.7 + 0.5 * sin(uT * 42.0)));
    col = uColor * ga + hot * ca;
    a = clamp(ga + ca, 0.0, 1.0);
    col /= max(a, 1e-3);
    a *= smoothstep(0.04, 0.5, m) * smoothstep(uLen + 0.02, uLen - 0.3, m);
  }
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function makeRibbonMaterial(mode) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color() }, uT: { value: 0 }, uLife: { value: 0.34 }, uLen: { value: 1 }, uCharge: { value: 0 },
      uSeed: { value: 0 }, uMode: { value: mode }, uWidth: { value: 0.05 },
    },
    vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
  });
  m.color = new THREE.Color();   // compat: fxHooks reads beam.material.color (= team colour × 2.2)
  return m;
}
// Ribbons are drawn camera-facing by their own vertex shader; an override pass (GTAO normals/depth) would draw the raw
// flat strip instead and carve a false dark occluder line down the beam — so they sit those passes out.
function ribbonGate(renderer, scene, camera, geometry) { geometry.drawRange.count = scene.overrideMaterial ? 0 : Infinity; }

export class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.pool = [];
    this.bombs = [];
    this.clouds = [];
    this.beams = [];
    // glossy ink teardrops (+ satellite droplets), one instanced draw
    const geo = new THREE.SphereGeometry(1, 14, 12).rotateX(Math.PI / 2);
    this.blobShape = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BLOBS * 4), 4);
    this.blobShape.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aShape', this.blobShape);
    this.blobs = new THREE.InstancedMesh(geo, makeBlobMaterial(), MAX_BLOBS);
    this.blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blobs.setColorAt(0, new THREE.Color());
    this.blobs.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.blobs.frustumCulled = false;
    this.blobs.castShadow = true;
    this.blobs.count = 0;
    scene.add(this.blobs);
    // bombs
    this.bombGeo = new THREE.SphereGeometry(0.2, 20, 14);
    this.bombCapGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.12, 12);
    this.bombMatCache = new Map();
    // charger beams + laser sights: camera-facing ribbons, pooled (no per-shot geometry/material allocation)
    this.ribbonGeo = ribbonGeometry(16);
    this.beamPool = [];
    // slosher volleys: every glob of one throw shares a record, so a throw lands ONE direct hit (+ splash on others)
    // per victim — two clean throws to splat, like a heavy bucket should be. A reused ring: no per-shot allocation.
    // (Our bucket keeps its own per-throw `volley` set: its later blobs pass through a victim already hit.)
    this.vols = Array.from({ length: 32 }, () => ({ hits: [] }));
    this.volI = 0;
    // laser sight lines for charging chargers / spinners
    this.sights = new Map();
    // bomb/storm arc preview for the local player
    const arcN = 64;
    this.arcGeo = new THREE.BufferGeometry();
    this.arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arcN * 3), 3));
    this.arcN = arcN;
    this.arcLine = new THREE.Line(this.arcGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.95, depthTest: false }));
    this.arcLine.renderOrder = 10; this.arcLine.frustumCulled = false; this.arcLine.visible = false;
    this.arcRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    this.arcRing.visible = false;
    scene.add(this.arcLine, this.arcRing);
    // storm cloud geometry
    this.cloudGeo = new THREE.IcosahedronGeometry(1, 3);
  }

  clear() {
    for (const p of this.list) this.pool.push(p);
    this.list.length = 0;
    for (const b of this.bombs) this.scene.remove(b.mesh);
    this.bombs.length = 0;
    for (const c of this.clouds) this.scene.remove(c.group);
    this.clouds.length = 0;
    for (const b of this.beams) { b.mesh.visible = false; this.beamPool.push(b.mesh); }
    this.beams.length = 0;
    for (const [, s] of this.sights) { this.scene.remove(s); s.material.dispose(); }
    this.sights.clear();
    this.blobs.count = 0;
    for (const k in MAIN_KITS) MAIN_KITS[k].clear?.();
  }

  // a shot knocked out of the air (Mega Stamp guard): gone, no impact, no paint
  removeShot(p) { const i = this.list.indexOf(p); if (i < 0) return; this.list[i] = this.list[this.list.length - 1]; this.list.pop(); this.pool.push(p); }
  // a bomb smashed before it goes off: gone, no blast
  defuseBomb(b) { const i = this.bombs.indexOf(b); if (i < 0) return; this.scene.remove(b.mesh); this.bombs.splice(i, 1); }
  // turf from a projectile / bomb: counts for the owner, but ink from a special never charges the special meter
  _credit(o, area) { if (o.sp) o.owner.addTurfNoSpecial(area); else o.owner.addTurf(area); }

  _new() {
    const p = this.pool.pop() || { pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), start: new THREE.Vector3() };
    // pooled: clear the per-kind optional fields so nothing leaks from the projectile's previous life
    p.volley = null; p.belowFalloff = 0; p.belowFalloffMax = 0; p.burst = null; p.weaponId = null;
    p.delay = 0; p.head = false; p.wid = null; p.dmgFar = undefined; p.vol = null; p.sp = undefined; p.ghost = false;
    p.pod = undefined;   // (a sprout pod's meter: how much this round's splat counts for — src/game/pods.js)
    // look (visual only; _draw falls back to size / defaults for anything left unset)
    p.vis = 0; p.tail0 = undefined; p.tailK = undefined; p.wob = undefined; p.wobF = 0; p.nose = 0; p.sats = 0;
    return p;
  }

  // every round enters the world here; online, rounds you own are recorded so the other players see them fly
  _push(p) {
    if (p.owner?.remote) p.ghost = true;   // a remote player's round made here (a ghost sub's drop …) is a ghost too
    this.list.push(p);
    const nm = G.netm;
    if (nm && !p.ghost) nm.recProj(p);
  }

  // ---- online: other players' rounds, bombs and shots, replayed as visual copies (they never paint or hurt anyone —
  // the owner's splats and hits arrive separately)
  ghostProjectile(a, e) {
    const [, , , type, wid, px, py, pz, vx, vy, vz, delay, life, straight, radius, size, grav, drag, trailEvery, head, vis, tail0, tailK, wob, wobF, nose, sats] = e;
    const p = this._new();
    Object.assign(p, { type, wid: wid || null, owner: a, team: a.team, age: 0, life, straight, radius, damage: 0, size, trail: -1.5, trailEvery, trailRadius: 0.45,
      grav, drag, seed: Math.random(), delay, head: !!head, vis, tail0, tailK, wob, wobF, nose, sats, ghost: true });
    p.pos.set(px, py, pz); p.prev.copy(p.pos); p.start.copy(p.pos);
    p.vel.set(vx, vy, vz);
    this.list.push(p);
  }

  ghostBomb(a, kind, px, py, pz, vx, vy, vz) {
    const s = this.bombs.length;
    if (kind === 'storm') this.throwStorm(a); else this.throwBomb(a);
    const b = this.bombs[s];
    if (!b) return;
    b.ghost = true;
    b.pos.set(px, py, pz); b.vel.set(vx, vy, vz); b.mesh.position.copy(b.pos);
    if (b.dir) b.dir.set(vx, 0, vz).normalize();
  }

  // presentation of someone else's shot (sound + muzzle flash + charger beam); the round itself is a ghost projectile
  ghostFire(a, e) {
    const w = WEAPONS[e.weapon] || a.weapon;
    const m = e.muzzle || a.pos, dir = e.dir || a.aimDir;
    const near = a._nearCamera();
    switch (w.kind) {
      case 'shooter': if (near) { G.audio?.play('shoot_shooter', { pos: m, volume: 0.4 }); G.fx?.muzzle(m, dir, a.color, 'shooter'); } break;
      case 'dualies': if (near) { G.audio?.play('shoot_dualies', { pos: m, volume: 0.36, pitch: e.hand ? 1.05 : 0.97 }); G.fx?.muzzle(m, dir, a.color, 'shooter'); } break;
      case 'splatling': if (near) { G.audio?.play('shoot_splatling', { pos: m, volume: 0.33 }); G.fx?.muzzle(m, dir, a.color, 'shooter'); } break;
      case 'blaster': if (near) { G.audio?.play('shoot_blaster', { pos: m, volume: 0.5 }); G.audio?.play('blaster_pump', { pos: m, volume: 0.4, delay: 0.27 }); } break;
      case 'slosher': if (near) G.fx?.muzzle(m, dir, a.color, 'blaster'); break;
      case 'charger': this._ghostBeam(a, m, dir, e.len || 20, e.charge || 0.5, near); break;
    }
  }

  _ghostBeam(a, m, dir, len, charge, near) {
    const mesh = this._beamMesh();
    mesh.position.copy(m);
    mesh.quaternion.setFromUnitVectors(ZAX, _v3.copy(dir).normalize());
    const th = 0.035 + charge * 0.05;
    mesh.scale.set(th, th, len);
    const bu = mesh.material.uniforms;
    bu.uColor.value.copy(a.color); mesh.material.color.copy(a.color).multiplyScalar(2.2);
    bu.uT.value = 0; bu.uLife.value = 0.3 + 0.1 * charge; bu.uLen.value = len; bu.uCharge.value = charge; bu.uSeed.value = Math.random() * 100;
    bu.uWidth.value = th * 2.3;
    mesh.visible = true;
    this.beams.push({ mesh, t: 0, life: bu.uLife.value, th });
    if (near) G.audio?.play('shoot_charger', { pos: m, volume: 0.6, pitch: 1.08 - 0.16 * charge });
  }

  // pooled charger beam ribbon (stays in the scene, hidden when idle)
  _beamMesh() {
    let m = this.beamPool.pop();
    if (!m) {
      m = new THREE.Mesh(this.ribbonGeo, makeRibbonMaterial(0));
      m.frustumCulled = false; m.renderOrder = 4; m.visible = false; m.onBeforeRender = ribbonGate;
      this.scene.add(m);
    }
    return m;
  }

  // Where the muzzle is — or, while the gun is still coming up to the aim pose (the first shot of a burst fires on
  // the same frame the trigger is pulled), where it is about to be: shots never leave from the hip. (Degrades to the
  // plain muzzle on a character without aimReady / getAimMuzzle.)
  _muzzle(a, out) {
    const ch = a.character;
    ch.getMuzzle(out);
    const w = ch.aimReady?.() ?? 1;
    if (w < 0.98 && ch.getAimMuzzle?.(_v2, a.aimPitch)) out.lerp(_v2, 1 - w);
    _v3.copy(a.pos); _v3.y += a.form === 'squid' ? 0.4 : 1.05;
    if (!isFinite(out.x) || out.distanceToSquared(_v3) > 2.5 || !G.physics.los(_v3, out)) out.copy(_v3).addScaledVector(a.aimDir, 0.3);
    return out;
  }

  // direction from muzzle toward the actor's aim point (falls back to aimDir)
  _aimFrom(a, from, out) {
    out.copy(a.aimPoint).sub(from);
    const d = out.length();
    if (d < 2.0 || out.dot(a.aimDir) < 0) out.copy(a.aimDir);
    else out.multiplyScalar(1 / d);
    return out;
  }

  _spread(dir, deg) {
    if (deg <= 0) return dir;
    const r = deg * DEG * Math.sqrt(Math.random());
    const t = Math.random() * Math.PI * 2;
    // random perpendicular
    _v2.set(-dir.z, 0, dir.x); if (_v2.lengthSq() < 1e-4) _v2.set(1, 0, 0); _v2.normalize();
    _v3.crossVectors(dir, _v2);
    dir.addScaledVector(_v2, Math.cos(t) * Math.tan(r)).addScaledVector(_v3, Math.sin(t) * Math.tan(r) * 0.55).normalize();
    return dir;
  }

  // Raise/lower the launch direction so a gravity shot (straight phase, then gravity + drag — the exact integrator
  // update() uses) passes through `target`. Secant iterations on the launch pitch; no-op beyond maxDist.
  _ballistic(from, dir, target, speed, straight, grav, drag, maxDist) {
    const hx = target.x - from.x, hz = target.z - from.z, hd = Math.hypot(hx, hz);
    if (hd < 1.5 || hd > maxDist || !grav) return dir;
    const dy = target.y - from.y;
    const hdir = Math.hypot(dir.x, dir.z);
    if (hdir < 1e-4) return dir;
    const sim = (pitch) => {
      let vh = Math.cos(pitch) * speed, vy = Math.sin(pitch) * speed, x = 0, y = 0, age = 0;
      for (let i = 0; i < 90; i++) {
        age += SIM_DT;
        const px = x, py = y;
        if (age > straight) { vy -= grav * SIM_DT; const k = 1 - drag * SIM_DT; vh *= k; vy *= k; }
        x += vh * SIM_DT; y += vy * SIM_DT;
        if (x >= hd) { const f = (hd - px) / Math.max(1e-6, x - px); return py + (y - py) * f; }
        if (vh < 0.5) break;
      }
      return -1e3;
    };
    let p0 = Math.atan2(dir.y, hdir), e0 = sim(p0) - dy;
    if (Math.abs(e0) < 0.01) return dir;
    let p1 = p0 - Math.atan2(e0, hd), e1 = sim(p1) - dy;
    for (let it = 0; it < 4 && Math.abs(e1) > 0.005; it++) {
      const d = e1 - e0; if (Math.abs(d) < 1e-6) break;
      const p2 = p1 - e1 * (p1 - p0) / d;
      p0 = p1; e0 = e1; p1 = clamp(p2, -1.2, 1.2); e1 = sim(p1) - dy;
    }
    if (Math.abs(e1) > 0.25 || Math.abs(p1 - Math.atan2(dir.y, hdir)) > 0.35) return dir;   // unreachable: leave it
    const cp = Math.cos(p1);
    return dir.set((dir.x / hdir) * cp, Math.sin(p1), (dir.z / hdir) * cp);
  }

  // Lob solver (bucket): the lowest launch pitch whose arc passes through `target`, found by sweeping pitch with the
  // flight integrator update() uses (gravity + drag from launch) and bisecting the first crossing. Keeps dir's heading;
  // leaves dir alone (returns false) when the target is out of reach.
  _lobAim(from, dir, target, speed, grav, drag, maxDist) {
    const hd = Math.hypot(target.x - from.x, target.z - from.z);
    if (hd < 1 || hd > maxDist) return false;
    const dy = target.y - from.y;
    const f = (pitch) => {
      let vh = Math.cos(pitch) * speed, vy = Math.sin(pitch) * speed, x = 0, y = 0;
      for (let i = 0; i < 180; i++) {
        const px = x, py = y;
        vy -= grav * SIM_DT; const k = 1 - drag * SIM_DT; vh *= k; vy *= k;
        x += vh * SIM_DT; y += vy * SIM_DT;
        if (x >= hd) return py + (y - py) * ((hd - px) / Math.max(1e-6, x - px)) - dy;
        if (y < dy - 8) break;
      }
      return -1e3;
    };
    let prev = -0.6, fp = f(prev);
    for (let p = -0.58; p <= 1.2; p += 0.02) {
      const fv = f(p);
      if (fp < 0 && fv >= 0) {
        let lo = p - 0.02, hi = p;
        for (let k = 0; k < 10; k++) { const mid = (lo + hi) / 2; if (f(mid) >= 0) hi = mid; else lo = mid; }
        const hdir = Math.hypot(dir.x, dir.z) || 1, cp = Math.cos(hi);
        dir.set((dir.x / hdir) * cp, Math.sin(hi), (dir.z / hdir) * cp);
        return true;
      }
      fp = fv;
    }
    return false;
  }

  fireShooter(a, w, spreadDeg) {
    const m = this._muzzle(a, _v.set(0, 0, 0));
    const dir = this._aimFrom(a, m, _dir);
    this._ballistic(m, dir, a.aimPoint, w.projSpeed, w.straightTime, 28, 0.8, w.range);
    this._spread(dir, spreadDeg ?? (a.grounded ? w.spreadGround : w.spreadAir));
    const p = this._new();
    // trail starts ~2.5 m out so shots never drip on the shooter's own feet
    Object.assign(p, { type: 'shot', owner: a, team: a.team, age: 0, life: 1.2, straight: w.straightTime, radius: w.impactRadius, damage: w.damage, size: 0.15, trail: -(2.5 - w.trailEvery), trailEvery: w.trailEvery, trailRadius: w.trailRadius, grav: 28, drag: 0.8, seed: Math.random(),
      vis: 0.1 + Math.random() * 0.012, tail0: 0.8, tailK: 1.3, wob: 0.035, wobF: 26, nose: 0.3, sats: 3 });
    p.pos.copy(m); p.prev.copy(m); p.start.copy(m);
    p.vel.copy(dir).multiplyScalar(w.projSpeed);
    this._push(p);
    if (a.isLocal || a._nearCamera()) {
      G.audio?.play('shoot_shooter', { pos: a.isLocal ? undefined : m, volume: a.isLocal ? 0.55 : 0.4 });
      G.fx?.muzzle(m, dir, a.color, 'shooter');
    }
    emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone() });
    const wr = a.weaponRunner;
    if (wr.rumbleT <= 0) { wr.rumbleT = 0.09; rumble(a, 0.02, 0.1, 40); }
  }

  // Left-hand muzzle for dual wield: the rig's own left pistol when it exposes one, else the right muzzle mirrored
  // across the kid's midline (actor frame) — the pistols are held symmetrically.
  _muzzleHand(a, hand, out) {
    const ch = a.character;
    if (hand && ch.getMuzzleHand) {
      ch.getMuzzleHand(out, 1);
      _v3.copy(a.pos); _v3.y += 1.05;
      if (isFinite(out.x) && out.distanceToSquared(_v3) < 2.5) return out;
    }
    this._muzzle(a, out);
    if (!hand) return out;
    const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw), dx = out.x - a.pos.x, dz = out.z - a.pos.z;
    const lx = -(dx * cy - dz * sy), lz = dx * sy + dz * cy;
    out.x = a.pos.x + lx * cy + lz * sy; out.z = a.pos.z - lx * sy + lz * cy;
    _v3.copy(a.pos); _v3.y += 1.05;
    if (!G.physics.los(_v3, out)) out.copy(_v3).addScaledVector(a.aimDir, 0.3);
    return out;
  }

  // one stream round (shooter-family): ballistic correction onto the crosshair, spread cone, teardrop look
  _fireRound(a, w, spreadDeg, m, look, snd, sndVol, pitch) {
    const dir = this._aimFrom(a, m, _dir);
    this._ballistic(m, dir, a.aimPoint, w.projSpeed, w.straightTime, 28, 0.8, w.range);
    this._spread(dir, spreadDeg ?? (a.grounded ? w.spreadGround : w.spreadAir));
    const p = this._new();
    Object.assign(p, { type: 'shot', wid: w.id, owner: a, team: a.team, age: 0, life: 1.2, straight: w.straightTime, radius: w.impactRadius, damage: w.damage, size: 0.15, trail: -(2.5 - w.trailEvery), trailEvery: w.trailEvery, trailRadius: w.trailRadius, grav: 28, drag: 0.8, seed: Math.random() }, look);
    p.pos.copy(m); p.prev.copy(m); p.start.copy(m);
    p.vel.copy(dir).multiplyScalar(w.projSpeed);
    this._push(p);
    if (a.isLocal || a._nearCamera()) {
      G.audio?.play(snd, { pos: a.isLocal ? undefined : m, volume: a.isLocal ? sndVol : sndVol * 0.72, pitch });
      G.fx?.muzzle(m, dir, a.color, 'shooter');
    }
    return dir;
  }

  fireDualies(a, w, spreadDeg, hand) {
    const m = this._muzzleHand(a, hand, _v.set(0, 0, 0));
    const dir = this._fireRound(a, w, spreadDeg, m, hand ? LOOK_DUAL_L : LOOK_DUAL_R, 'shoot_dualies', 0.5, hand ? 1.05 : 0.97);
    emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone(), hand });
    const wr = a.weaponRunner;
    if (wr.rumbleT <= 0) { wr.rumbleT = 0.08; rumble(a, hand ? 0.01 : 0.03, hand ? 0.1 : 0.05, 35); }
  }

  fireSplatling(a, w, spreadDeg) {
    const m = this._muzzle(a, _v.set(0, 0, 0));
    const dir = this._fireRound(a, w, spreadDeg, m, LOOK_SPLAT, 'shoot_splatling', 0.46, 1);
    emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone() });
    const wr = a.weaponRunner;
    if (wr.rumbleT <= 0) { wr.rumbleT = 0.07; rumble(a, 0.05, 0.12, 50); }
  }

  // Slosher wave (upstream; named fireSlosher here — fireSlosh is our bucket's volley): 8 heavy globs poured over
  // ~0.09 s along one lob (the lower ballistic solution onto the crosshair, clamped to range, never flatter than 7°).
  // Later globs leave slower and a touch lower, so they land in a line back toward the thrower — one thick stripe,
  // and the arc carries over cover and up onto ledges. Globs are type 'slosh' (shared with the bucket) and carry
  // `vol` (+ `head` on the lead glob): that is what marks them as slosher globs in update() / _impact().
  fireSlosher(a, w) {
    const m = this._muzzle(a, _v.set(0, 0, 0));
    _v2.copy(a.aimPoint).sub(m);
    let hd = Math.hypot(_v2.x, _v2.z);
    const yaw = hd > 0.3 ? Math.atan2(_v2.x, _v2.z) : a.aimYaw;
    hd = clamp(hd, 1.2, w.range);
    const dy = clamp(_v2.y, -4, 5), g = w.grav, T0 = 0.32;
    // a bucket toss: the same ~18° heave at every range, the speed doing the work (a soft lob up close, a full heave
    // far out); beyond what a full-speed 18° heave reaches — far or high targets — the angle rises (low ballistic
    // solution at full speed). Either way the head glob lands on the crosshair point.
    let v = w.projSpeed, pitch;
    const den = 2 * Math.cos(T0) * Math.cos(T0) * (hd * Math.tan(T0) - dy);
    const vT = den > 1e-3 ? Math.sqrt((g * hd * hd) / den) : Infinity;
    if (vT <= v) { v = Math.max(5.5, vT); pitch = T0; }
    else {
      const disc = v * v * v * v - g * (g * hd * hd + 2 * dy * v * v);
      pitch = disc >= 0 ? Math.atan((v * v - Math.sqrt(disc)) / (g * hd)) : Math.PI / 4;
      pitch = clamp(pitch, T0, 1.2);
    }
    const n = w.drops;
    const vol = this.vols[this.volI = (this.volI + 1) % this.vols.length];
    vol.hits.length = 0;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const sp = v * (1 - 0.18 * k), pt = pitch - 0.04 * k;
      const yw = yaw + (i === 0 ? 0 : (i % 2 ? 1 : -1) * 0.028 * Math.min(1, i / 3));
      const p = this._new();
      Object.assign(p, { type: 'slosh', wid: w.id, owner: a, team: a.team, age: 0, life: 2.4, straight: 0, delay: i * 0.012,
        radius: w.impactRadius * (i === 0 ? 1 : 0.78 - 0.22 * k), damage: i === 0 ? w.damageHead : w.damageTail, head: i === 0,
        size: i === 0 ? 0.2 : 0.14, trail: -0.8, trailEvery: i < 3 ? w.trailEvery : 0, trailRadius: w.trailRadius,
        grav: g, drag: 0, seed: Math.random(),
        vis: i === 0 ? 0.19 : 0.155 - 0.075 * k, tail0: 0.7, tailK: 1.5, wob: 0.12, wobF: 15, nose: 0.1, sats: i < 2 ? 2 : 1 });
      p.vol = vol;
      p.pos.copy(m); p.prev.copy(m); p.start.copy(m);
      const cp = Math.cos(pt);
      // + g·dt/2 cancels the integrator's half-step drop (update() is semi-implicit Euler), so the head glob lands on
      // the analytic parabola — exactly on the crosshair point
      p.vel.set(Math.sin(yw) * cp * sp, Math.sin(pt) * sp + g * SIM_DT * 0.5, Math.cos(yw) * cp * sp);
      this._push(p);
    }
    _dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    if (a.isLocal || a._nearCamera()) G.fx?.muzzle(m, _dir, a.color, 'blaster');
    emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: _dir.clone() });
    rumble(a, 0.18, 0.3, 90);
  }

  // slosher head glob landing: a heavy splash that also catches anyone standing next to where it lands
  _sloshSplash(p, at, direct) {
    const w = WEAPONS[p.wid] || WEAPONS.slosher;
    for (const e of G.actors) {
      if (e.team === p.team || !e.alive || e === direct || (p.vol && p.vol.hits.includes(e))) continue;
      _v3.copy(e.pos); _v3.y += 0.6;
      if (_v3.distanceTo(at) > w.splashRadius + 0.3) continue;
      if (!G.physics.los(_v2.copy(at).setY(at.y + 0.25), _v3)) continue;
      if (p.vol) p.vol.hits.push(e);
      this.applyHit(p.owner, e, w.splashDamage, p.wid || 'slosher');
    }
    // special objects (bubbles, tanks …) caught in the splash, like a blaster burst
    G.specials?.areaHit(at, w.splashRadius, w.splashDamage, p.team, p.owner);
    // boss mode: one splash per throw (a direct head hit already counted)
    if (G.boss && direct !== 'boss' && !(p.vol && p.vol.hits.includes(G.boss))) { p.vol?.hits.push(G.boss); G.boss.splash(p.owner, at, w.splashRadius + 0.3, w.splashDamage, w.splashDamage, p.wid || 'slosher'); }
    if (p.owner.isLocal || G.camera.position.distanceToSquared(at) < 26 * 26) {
      G.fx?.burst(at, UP, p.owner.color, { count: 16, speed: 4.2, size: 0.09 });
      G.fx?.ring?.(at, UP, p.owner.color, { radius: w.splashRadius, life: 0.32 });
      G.audio?.play('slosh_land', { pos: at, volume: p.owner.isLocal ? 0.75 : 0.6 });
    }
  }

  fireBlaster(a, w, spreadDeg) {
    const m = this._muzzle(a, _v.set(0, 0, 0));
    const dir = this._aimFrom(a, m, _dir);
    this._spread(dir, spreadDeg ?? 1.2);
    const p = this._new();
    Object.assign(p, { type: 'blast', owner: a, team: a.team, age: 0, life: w.range / w.projSpeed, straight: 99, radius: w.impactRadius, damage: w.directDamage, size: 0.26, trail: -1.5, trailEvery: 2.2, trailRadius: 0.45, grav: 0, drag: 0, seed: Math.random(),
      vis: 0.2, tail0: 0.5, tailK: 0.9, wob: 0.085, wobF: 17, nose: 0.15, sats: 4 });
    p.pos.copy(m); p.prev.copy(m); p.start.copy(m);
    p.vel.copy(dir).multiplyScalar(w.projSpeed);
    this._push(p);
    if (a.isLocal || a._nearCamera()) {
      G.audio?.play('shoot_blaster', { pos: a.isLocal ? undefined : m, volume: a.isLocal ? 0.7 : 0.5 });
      // the pump rack: clacks land on the pump animation's back/front stops (character.js, +0.29 s / +0.46 s)
      G.audio?.play('blaster_pump', { pos: a.isLocal ? undefined : m, volume: a.isLocal ? 0.55 : 0.4, delay: 0.27 });
      // muzzle flash: fxHooks draws the blaster-specific one on 'weapon:fire'
    }
    if (a.isLocal) emit('recoil', { amount: 0.012 });   // one clean pitch kick; no trauma shake for your own gun
    emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone() });
    rumble(a, 0.28, 0.4, 95);
  }

  // Specials' guns: a shooter-style shot or a blaster-style blast from an explicit muzzle + direction.
  // o: { type: 'shot'|'blast', speed, damage, straight, range, radius (paint), size, trailEvery, trailRadius, grav, drag,
  //      burst: { radius, splashRadius, dmgMax, dmgMin } (blast only), weaponId, look: { vis, tail0, tailK, wob, wobF,
  //      nose, sats } (optional; defaults to the blaster / shooter teardrop scaled to size) }
  fireCustom(a, from, dir, o) {
    const p = this._new();
    const blast = o.type === 'blast';
    const size = o.size ?? (blast ? 0.26 : 0.14);
    Object.assign(p, {
      type: blast ? 'blast' : 'shot', owner: a, team: a.team, age: 0, life: o.life ?? ((o.range || 20) / o.speed + (blast ? 0 : 0.6)), straight: o.straight ?? (blast ? 99 : 0.15),
      radius: o.radius ?? 0.8, damage: o.damage, size, trail: -1.5, trailEvery: o.trailEvery ?? 1.2, trailRadius: o.trailRadius ?? 0.42,
      grav: o.grav ?? (blast ? 0 : 28), drag: o.drag ?? (blast ? 0 : 0.8), seed: Math.random(), burst: o.burst || null, weaponId: o.weaponId || null,
    }, blast
      ? { vis: size * 0.77, tail0: 0.5, tailK: 0.9, wob: 0.085, wobF: 17, nose: 0.15, sats: 3 }
      : { vis: size * 0.68, tail0: 0.8, tailK: 1.3, wob: 0.035, wobF: 26, nose: 0.3, sats: 2 }, o.look || null);
    p.pos.copy(from); p.prev.copy(from); p.start.copy(from);
    p.vel.copy(dir).normalize().multiplyScalar(o.speed);
    this._push(p);
    return p;
  }

  fireFlick(a, w) {
    const m = _v.copy(a.pos); m.y += 1.0;
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const up = clamp(a.aimPitch, -0.2, 0.5) + 0.32;
    for (let i = 0; i < w.flickDrops; i++) {
      const t = (i / (w.flickDrops - 1)) * 2 - 1;
      const ang = a.yaw + t * w.flickSpreadDeg * DEG * 0.5 + (Math.random() - 0.5) * 0.05;
      const sp = w.flickSpeed * (0.82 + 0.28 * (1 - Math.abs(t)) + Math.random() * 0.08);
      const p = this._new();
      // big globs in the middle of the sheet, smaller beads toward the edges (visual only: the hit size is unchanged)
      const mid = 1 - Math.abs(t);
      Object.assign(p, { type: 'drop', owner: a, team: a.team, age: 0, life: 1.4, straight: 0, radius: 0.85 + Math.random() * 0.3, damage: w.flickDamageNear, dmgFar: w.flickDamageFar, size: 0.15, trail: 0, trailEvery: 1.8, trailRadius: 0.45, grav: 26, drag: 0.4, seed: Math.random(), pod: POD_HINT.flick,
        vis: 0.1 + 0.085 * mid + Math.random() * 0.03, tail0: 0.4, tailK: 1.0, wob: 0.1, wobF: 19, nose: 0, sats: mid > 0.45 ? 2 : 1 });
      p.pos.set(m.x + fx * 0.6, m.y + 0.3, m.z + fz * 0.6); p.prev.copy(p.pos); p.start.copy(p.pos);
      const cu = Math.cos(up + (Math.random() - 0.5) * 0.12);
      p.vel.set(Math.sin(ang) * cu * sp, Math.sin(up) * sp, Math.cos(ang) * cu * sp);
      this._push(p);
    }
    if (a.isLocal) emit('recoil', { amount: 0.007 });
    emit('weapon:fire', { actor: a, weapon: w.id, muzzle: new THREE.Vector3(m.x + fx * 0.6, m.y + 0.3, m.z + fz * 0.6), dir: new THREE.Vector3(fx, Math.sin(up), fz).normalize() });
    rumble(a, 0.3, 0.32, 110);
  }

  fireCharger(a, w, charge) {
    const m = this._muzzle(a, _v.set(0, 0, 0)).clone();
    const dir = this._aimFrom(a, m, _dir).clone();
    const range = lerp(w.rangeMin, w.rangeMax, charge);
    const dmg = charge >= 0.999 ? w.damageMax : lerp(w.damageMin, w.damageMax * 0.62, charge);
    const hit = G.physics.raycast(m, dir, range, _hit, true);
    let len = hit.hit ? hit.dist : range;
    if (G.subs) { const cut = G.subs.blockRay(m, dir, len, a.team, dmg); if (cut < len) { len = cut; hit.hit = false; } }
    if (G.specials) { const cut = G.specials.rayHit(m, dir, len, a.team, dmg, a); if (cut < len) { len = cut; hit.hit = false; } }
    // first enemy along the beam
    let victim = null;
    for (const e of G.actors) {
      if (e.team === a.team || !e.alive) continue;
      _v2.copy(m).addScaledVector(dir, len);
      Physics.segmentCapsuleDist(m, _v2, hitBase(e), PLAYER.radius + 0.12, e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height, _res);
      if (_res.dist < PLAYER.radius + 0.14) {
        const d = _res.t * len;
        if (!victim || d < victim.d) victim = { e, d };
      }
    }
    // boss mode: the beam stops on the boss (or a crablet) when that's nearer than any squidkid
    let bossHit = false;
    if (G.boss) {
      const bh = G.boss.segHit(m, _v2.copy(m).addScaledVector(dir, len), 0.1);
      if (bh && (!victim || bh.dist < victim.d)) { victim = null; len = bh.dist; bossHit = true; G.boss.hit(a, dmg, bh.target, 'charger', bh.point.clone()); }
    }
    if (victim) { len = victim.d; this.applyHit(a, victim.e, dmg, 'charger'); }
    // paint along the line (projected to the ground)
    let area = 0;
    const step = w.lineSplatEvery;
    for (let s = 1.2; s < len - 0.3; s += step) {
      _v2.copy(m).addScaledVector(dir, s);
      const g = G.physics.raycast(_v2, DOWN, 3.5, _hit2, true);
      if (g.hit) area += G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.lineRadius * (0.8 + charge * 0.4), a.team, { seed: Math.random(), stretch: dir, stretchAmt: 1.2 });
    }
    if (hit.hit && !victim && !bossHit) {
      _v2.copy(hit.point).addScaledVector(hit.normal, 0.12);
      area += G.paint.splat(_v2, w.impactRadius * (0.6 + 0.4 * charge), a.team, { seed: Math.random(), stretch: dir, stretchAmt: 0.6, pod: 1 + POD_HINT.charger * charge * charge });
      G.fx?.burst(hit.point, hit.normal, a.color, { count: 10, speed: 4, size: 0.09, paint: false });
      if (a.isLocal || a._nearCamera()) G.audio?.play('ink_hit_wall', { pos: hit.point, volume: 0.6 });
    }
    {
      const end = new THREE.Vector3().copy(m).addScaledVector(dir, len);
      emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone(), charge, len });
      emit('weapon:impact', { pos: end, normal: hit.hit && !victim && !bossHit ? hit.normal.clone() : dir.clone().negate(), team: a.team, kind: 'charger', radius: w.impactRadius * (0.6 + 0.4 * charge) });
    }
    a.addTurf(area);
    // beam visual: tracer front races out, white-hot core snaps off, the ink sheath thins and breaks into dashes
    const mesh = this._beamMesh();
    mesh.position.copy(m);
    mesh.quaternion.setFromUnitVectors(ZAX, dir);
    const th = 0.035 + charge * 0.05;
    mesh.scale.set(th, th, len);
    const bu = mesh.material.uniforms;
    bu.uColor.value.copy(a.color); mesh.material.color.copy(a.color).multiplyScalar(2.2);
    bu.uT.value = 0; bu.uLife.value = 0.3 + 0.1 * charge; bu.uLen.value = len; bu.uCharge.value = charge; bu.uSeed.value = Math.random() * 100;
    bu.uWidth.value = th * 2.3;
    mesh.visible = true;
    this.beams.push({ mesh, t: 0, life: bu.uLife.value, th });
    if (a.isLocal || a._nearCamera()) {
      G.audio?.play('shoot_charger', { pos: a.isLocal ? undefined : m, volume: a.isLocal ? 0.8 : 0.6, pitch: 1.08 - 0.16 * charge });
      // muzzle flash: fxHooks draws the charger-specific one on 'weapon:fire'
    }
    if (a.isLocal) emit('recoil', { amount: 0.005 + charge * 0.013 });
    rumble(a, 0.12 + charge * 0.45, 0.2 + charge * 0.35, 80 + charge * 90);
  }

  // bucket: a volley of blobs thrown along the aim, lobbed upward so it clears cover; the lead blob carries most of
  // the damage and only the first blob of a volley to reach an enemy hurts them (the rest still paint)
  fireSlosh(a, w) {
    const m = this._muzzle(a, _v.set(0, 0, 0)).clone();
    const dir = this._aimFrom(a, m, _dir).clone();
    // default: the aim lifted by the lob (sails over cover when you aim above it). With the crosshair on something in
    // reach, bend the arc so the lead blob lands on it (the solver keeps the default arc if that's out of reach).
    const hd0 = Math.hypot(dir.x, dir.z) || 1, p0 = Math.atan2(dir.y, hd0) + w.lob;
    dir.set((dir.x / hd0) * Math.cos(p0), Math.sin(p0), (dir.z / hd0) * Math.cos(p0));
    this._lobAim(m, dir, a.aimPoint, w.throwSpeed, w.gravity, w.drag, w.reach);
    const hd = Math.hypot(dir.x, dir.z) || 1, pitch = Math.atan2(dir.y, hd);
    const volley = { hit: new Set() };
    for (let i = 0; i < w.blobs; i++) {
      const sp = w.throwSpeed * (1 - i * 0.075), side = (Math.random() - 0.5) * 0.05, pi = pitch + (Math.random() - 0.5) * 0.04;
      const yaw = Math.atan2(dir.x, dir.z) + side, cp = Math.cos(pi);
      const p = this._new();
      const size = 0.22 - i * 0.02;
      Object.assign(p, { type: 'slosh', owner: a, team: a.team, age: 0, life: 2.2, straight: 0, radius: w.impactRadius * (1 - i * 0.08), damage: w.damage, belowFalloff: w.belowFalloff, belowFalloffMax: w.belowFalloffMax, size, trail: 0, trailEvery: 1.6, trailRadius: 0.42, grav: w.gravity, drag: w.drag, seed: Math.random(), volley,
        vis: size * 0.86, tail0: 0.7, tailK: 1.5, wob: 0.12, wobF: 15, nose: 0.1, sats: i < 2 ? 2 : 1 });
      p.pos.copy(m).addScaledVector(dir, -i * 0.12); p.prev.copy(p.pos); p.start.copy(p.pos);
      p.vel.set(Math.sin(yaw) * cp * sp, Math.sin(pi) * sp, Math.cos(yaw) * cp * sp);
      this._push(p);
    }
    if (a.isLocal || a._nearCamera()) G.audio?.play('bomb_throw', { pos: a.isLocal ? undefined : m, volume: a.isLocal ? 0.7 : 0.5, pitch: 0.8 });
    if (a.isLocal) emit('recoil', { amount: 0.008 });
    emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone() });
    rumble(a, 0.2, 0.25, 90);
  }

  // spinner stream: small fast shots; reach and speed follow the burst's charge
  fireStream(a, w, power, spreadDeg) {
    const m = this._muzzle(a, _v.set(0, 0, 0));
    const dir = this._aimFrom(a, m, _dir);
    const speed = lerp(w.speedMin, w.speedMax, power), straight = lerp(w.straightMin, w.straightMax, power), range = lerp(w.rangeMin, w.rangeMax, power);
    this._ballistic(m, dir, a.aimPoint, speed, straight, 28, 0.8, range);
    this._spread(dir, spreadDeg);
    const p = this._new();
    Object.assign(p, { type: 'shot', owner: a, team: a.team, age: 0, life: 1.3, straight, radius: w.impactRadius, damage: w.damage, size: 0.12, trail: -(2.2 - w.trailEvery), trailEvery: w.trailEvery, trailRadius: w.trailRadius, grav: 28, drag: 0.8, seed: Math.random() }, LOOK_SPIN);
    p.pos.copy(m); p.prev.copy(m); p.start.copy(m);
    p.vel.copy(dir).multiplyScalar(speed);
    this._push(p);
    const wr = a.weaponRunner;
    if ((a.isLocal || a._nearCamera()) && (wr._streamN = (wr._streamN || 0) + 1) % 2 === 0) {
      G.audio?.play('shoot_shooter', { pos: a.isLocal ? undefined : m, volume: a.isLocal ? 0.4 : 0.28, pitch: 1.35 });
      G.fx?.muzzle(m, dir, a.color, 'shooter');
    }
    emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone() });
    if (wr.rumbleT <= 0) { wr.rumbleT = 0.07; rumble(a, 0.03, 0.12, 40); }
  }

  // twin pistols: side = -1 / 1 alternates left and right guns (0 = both guns together after a roll)
  fireTwin(a, w, spreadDeg, side) {
    let m;
    // a dual-wield rig (a real pistol in each fist) fires each side from its own gun; otherwise offset the one muzzle
    if (side && a.character.dual && a.character.getMuzzleHand) m = this._muzzleHand(a, side > 0 ? 1 : 0, _v.set(0, 0, 0));
    else {
      m = this._muzzle(a, _v.set(0, 0, 0));
      if (side) {
        // half way between the original twin offset (the gun's muzzle ± 17 cm) and the dualies' spacing (each shot from
        // its own pistol: the left one is the right muzzle mirrored across the kid's midline)
        _v2.set(a.aimDir.z, 0, -a.aimDir.x).normalize();
        const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw), dx = m.x - a.pos.x, dz = m.z - a.pos.z;
        const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy;
        _v4.set(a.pos.x - lx * cy + lz * sy, m.y, a.pos.z + lx * sy + lz * cy);   // mirrored (left pistol) muzzle
        if (side > 0) m.addScaledVector(_v2, 0.17).add(_v4).multiplyScalar(0.5);
        else m.addScaledVector(_v2, -0.085);
        _v4.copy(a.pos); _v4.y += 1.05;
        if (!G.physics.los(_v4, m)) m.copy(_v4).addScaledVector(a.aimDir, 0.3);
      }
    }
    const dir = this._aimFrom(a, m, _dir);
    // side 0 = planted rapid mode: faster, straighter shots with more reach
    const speed = side ? w.projSpeed : w.turretProjSpeed, straight = side ? w.straightTime : w.turretStraight;
    this._ballistic(m, dir, a.aimPoint, speed, straight, 28, 0.8, side ? w.range : w.turretRange);
    this._spread(dir, spreadDeg);
    const p = this._new();
    Object.assign(p, { type: 'shot', owner: a, team: a.team, age: 0, life: 1.2, straight, radius: w.impactRadius, damage: w.damage, size: 0.13, trail: -(2.4 - w.trailEvery), trailEvery: w.trailEvery, trailRadius: w.trailRadius, grav: 28, drag: 0.8, seed: Math.random() }, side ? LOOK_TWIN : LOOK_TWIN_PLANT);
    p.pos.copy(m); p.prev.copy(m); p.start.copy(m);
    p.vel.copy(dir).multiplyScalar(speed);
    this._push(p);
    if (a.isLocal || a._nearCamera()) {
      G.audio?.play('shoot_shooter', { pos: a.isLocal ? undefined : m, volume: a.isLocal ? 0.45 : 0.32, pitch: 1.12 + Math.random() * 0.06 });
      G.fx?.muzzle(m, dir, a.color, 'shooter');
    }
    emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone(), hand: side > 0 ? 1 : 0 });
    const wr = a.weaponRunner;
    if (wr.rumbleT <= 0) { wr.rumbleT = 0.08; rumble(a, 0.02, 0.09, 35); }
  }

  // brush swipe: globs flung off the brush head as it sweeps sideways low across the front — each leaves from its point
  // on the arc, flying outward and along the sweep, low and flat (side +1 sweeps right → left)
  fireSwipe(a, w, side) {
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const up = clamp(a.aimPitch, -0.3, 0.3) * 0.5 + 0.08;
    const arc = w.swipeSpreadDeg * DEG * 1.6;
    for (let i = 0; i < w.swipeDrops; i++) {
      const t = i / Math.max(1, w.swipeDrops - 1);                         // 0 → 1 along the sweep
      const ang = a.yaw - side * (t - 0.5) * arc;
      const ox = Math.sin(ang), oz = Math.cos(ang);                        // outward from the body
      const tx = -oz * side, tz = ox * side;                               // along the sweep
      const sp = w.swipeSpeed * (0.8 + Math.random() * 0.3);
      const p = this._new();
      Object.assign(p, { type: 'drop', owner: a, team: a.team, age: 0, life: 1.0, straight: 0, radius: 0.55 + Math.random() * 0.2, damage: w.swipeDamageNear, dmgFar: w.swipeDamageFar, size: 0.1, trail: 0, trailEvery: 2.2, trailRadius: 0.32, grav: 26, drag: 0.6, seed: Math.random(),
        vis: 0.07 + Math.random() * 0.025, tail0: 0.4, tailK: 1.0, wob: 0.1, wobF: 19, nose: 0, sats: 1 });
      p.pos.set(a.pos.x + ox * 0.85, a.pos.y + 0.45, a.pos.z + oz * 0.85); p.prev.copy(p.pos); p.start.copy(p.pos);
      const hx = ox * 0.8 + tx * 0.45 + fx * 0.25, hz = oz * 0.8 + tz * 0.45 + fz * 0.25, hl = Math.hypot(hx, hz);
      const cu = Math.cos(up + (Math.random() - 0.5) * 0.08);
      p.vel.set((hx / hl) * cu * sp, Math.sin(up) * sp, (hz / hl) * cu * sp);
      this._push(p);
    }
    emit('weapon:fire', { actor: a, weapon: w.id, muzzle: new THREE.Vector3(a.pos.x + fx * 0.85, a.pos.y + 0.45, a.pos.z + fz * 0.85), dir: new THREE.Vector3(fx, Math.sin(up), fz).normalize() });
    rumble(a, 0.08, 0.14, 50);
  }

  // a loose ink drop (sprinkler spray): owner's team, damage with no falloff
  spawnDrop(owner, pos, vx, vy, vz, o = {}) {
    const p = this._new();
    const size = o.size ?? 0.08;
    Object.assign(p, { type: 'drop', owner, team: owner.team, age: 0, life: 1.2, straight: 0, radius: o.radius ?? 0.5, damage: o.damage ?? 8, dmgFar: o.damage ?? 8, size, trail: 0, trailEvery: 0, trailRadius: 0.3, grav: 22, drag: 0.4, seed: Math.random(),
      vis: size * (0.9 + Math.random() * 0.2), tail0: 0.4, tailK: 1.0, wob: 0.09, wobF: 20, nose: 0, sats: 1 });
    if (o.weaponId) p.weaponId = o.weaponId;   // what the hit is credited to (the splat screen): e.g. 'sprinkler'
    p.pos.copy(pos); p.prev.copy(pos); p.start.copy(pos);
    p.vel.set(vx, vy, vz);
    this._push(p);
  }

  // ---- bombs
  _bombMat(team) {
    const key = team;
    if (!this.bombMatCache.has(key)) {
      this.bombMatCache.set(key, new THREE.MeshPhysicalMaterial({ color: G.teamColors[team], roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1, emissive: G.teamColors[team], emissiveIntensity: 0 }));
    }
    return this.bombMatCache.get(key);
  }
  refreshColors() {
    for (const [team, m] of this.bombMatCache) { m.color.copy(G.teamColors[team]); m.emissive.copy(G.teamColors[team]); }
  }

  throwVelocity(a, speed, out) {
    const pitch = clamp(a.aimPitch + 0.28, -0.3, 1.1);
    const cp = Math.cos(pitch);
    return out.set(Math.sin(a.aimYaw) * cp * speed + a.vel.x * 0.4, Math.sin(pitch) * speed + 1.5, Math.cos(a.aimYaw) * cp * speed + a.vel.z * 0.4);
  }

  throwBomb(a) {
    const b = SUB.bomb;
    const group = new THREE.Group();
    // [sub-view] the ball is drawn SUB_VIEW_SCALE.bomb × bigger (visual only: its pos, bounce, rest height and blast are
    // the physics bomb's) — `look` holds the model, `group` tumbles and pulses it; _updateBombs sits it on its surface
    const vs = subViewScale('bomb'), look = new THREE.Group(); look.scale.setScalar(vs);
    const body = new THREE.Mesh(this.bombGeo, this._bombMat(a.team).clone());
    body.castShadow = true;
    const cap = new THREE.Mesh(this.bombCapGeo, new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.4, metalness: 0.6 }));
    cap.position.y = 0.2;
    look.add(body, cap); group.add(look);
    const pos = _v.copy(a.pos); pos.y += 1.35;
    group.position.copy(pos);
    this.scene.add(group);
    const vel = this.throwVelocity(a, b.throwSpeed, new THREE.Vector3());
    this.bombs.push({ kind: 'bomb', owner: a, team: a.team, mesh: group, body, pos: pos.clone(), vel, fuse: -1, age: 0, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), beepT: 0, sp: !!a.specialActive, vs });
    if (G.netm && !a.remote) G.netm.recBomb(this.bombs[this.bombs.length - 1]);
    G.cues?.sub('bomb', 'throw', { owner: a, at: a.pos });   // sfx-cues (src/audio/cues.js: yours from you, theirs where they are)
    emit('bomb:throw', { actor: a, pos: pos.clone(), team: a.team, radius: SUB.bomb.radius });
  }

  throwStorm(a) {
    const sp = SPECIALS.storm;
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.bombGeo, this._bombMat(a.team).clone());
    body.scale.setScalar(1.25);
    group.add(body);
    const pos = _v.copy(a.pos); pos.y += 1.45;
    group.position.copy(pos);
    this.scene.add(group);
    const vel = this.throwVelocity(a, sp.throwSpeed, new THREE.Vector3());
    this.bombs.push({ kind: 'storm', owner: a, team: a.team, mesh: group, body, pos: pos.clone(), vel, fuse: -1, age: 0, spin: new THREE.Vector3(4, 6, 0), beepT: 0, dir: new THREE.Vector3(vel.x, 0, vel.z).normalize() });
    if (G.netm && !a.remote) G.netm.recBomb(this.bombs[this.bombs.length - 1]);
  }

  _explodeBomb(b) {
    const s = SUB.bomb;
    const c = b.pos;
    let area = G.paint.splat(_v.copy(c).setY(c.y + 0.2), s.paintRadius, b.team, { seed: Math.random() });
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2, r = s.paintRadius * (0.6 + Math.random() * 0.4);
      area += G.paint.splat(_v.set(c.x + Math.cos(a) * r, c.y + 0.5, c.z + Math.sin(a) * r), 0.7 + Math.random() * 0.5, b.team, { seed: Math.random() });
    }
    this._credit(b, area);
    G.subs?.damageArea(c, s.radius, 60, b.team);
    G.fx?.explosion(c, G.teamColors[b.team], s.radius);
    G.cues?.sub('bomb', 'boom', { owner: b.owner, team: b.team, at: c });   // sfx-cues
    emit('shake', { pos: c.clone(), amount: 0.6 });
    emit('bomb:explode', { actor: b.owner, pos: c.clone(), team: b.team, radius: s.radius });
    const loc = G.local;
    if (loc && loc.alive) { const d = loc.pos.distanceTo(c); if (d < 14) rumble(loc, clamp(1 - d / 14, 0, 1) * 0.6, clamp(1 - d / 14, 0, 1) * 0.5, 160); }
    for (const e of G.actors) {
      if (e.team === b.team || !e.alive) continue;
      _v.copy(e.pos); _v.y += 0.7;
      const d = _v.distanceTo(c);
      if (d > s.radius) continue;
      if (!G.physics.los(_v2.copy(c).setY(c.y + 0.3), _v)) continue;
      const k = 1 - clamp((d - 0.8) / (s.radius - 0.8), 0, 1);
      this.applyHit(b.owner, e, lerp(s.damageMin, s.damageMax, k * k), 'bomb');
    }
    G.boss?.splash(b.owner, c, s.radius, s.damageMax, s.damageMin, 'bomb');
  }

  _spawnCloud(b) {
    const sp = SPECIALS.storm;
    const g = G.physics.raycast(_v.copy(b.pos).setY(b.pos.y + 0.5), DOWN, 12, _hit);
    const groundY = g.hit ? g.point.y : b.pos.y;
    const group = new THREE.Group();
    const col = G.teamColors[b.team];
    // a soft cumulus: a flattened ring of big puffs with smaller, paler puffs piled on top; tinted underside
    const base = new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(1, 1, 1), 0.12), roughness: 0.95, emissive: col, emissiveIntensity: 0.16, transparent: true, opacity: 0.97 });
    const top = new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(1, 1, 1), 0.55), roughness: 0.95, emissive: col, emissiveIntensity: 0.08, transparent: true, opacity: 0.97 });
    const puff = (x, y, z, r, m) => {
      const p = new THREE.Mesh(this.cloudGeo, m);
      p.position.set(x, y, z); p.scale.set(r, r * 0.68, r);
      p.castShadow = true;
      p.userData.bob = Math.random() * 6.28;
      group.add(p);
    };
    puff(0, 0, 0, 1.9, base);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3, r = 1.7 + Math.random() * 0.6;
      puff(Math.cos(a) * r, -0.1 + Math.random() * 0.2, Math.sin(a) * r, 1.05 + Math.random() * 0.45, base);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4, r = 0.6 + Math.random() * 0.8;
      puff(Math.cos(a) * r, 0.75 + Math.random() * 0.3, Math.sin(a) * r, 0.9 + Math.random() * 0.4, top);
    }
    puff(0, 1.15, 0, 1.0, top);
    group.position.set(b.pos.x, groundY + 4.6, b.pos.z);
    group.scale.setScalar(0.01);
    this.scene.add(group);
    const loop = null;   // sfx-cues: the rain loop follows the cloud from src/audio/cues.js (it never outlives it)
    this.clouds.push({ owner: b.owner, team: b.team, group, t: 0, dur: sp.duration, dir: b.dir, rainT: 0, loop, groundY });
    G.audio?.play('storm_thunder', { pos: group.position });
    emit('storm:start', { pos: group.position.clone(), team: b.team, actor: b.owner, radius: sp.radius });
  }

  // ---- damage routing
  applyHit(attacker, victim, dmg, weaponId) {
    if (!victim.alive || victim.team === attacker.team) return;
    const nm = G.netm;
    let killed = false;
    const route = nm ? nm.shouldApplyHit(attacker, victim) : 'local';
    if (route === 'drop') return;
    if (route === 'send') nm.sendHit(attacker, victim, dmg, weaponId);   // the kill confirm arrives with their splat
    else killed = victim.damage(dmg, attacker, weaponId);
    emit('hit', { attacker, victim, damage: dmg, killed, weaponId });
    // ink smacking the body, at the body (heavier + lower for big hits); the UI tick / kill sting are main.js's
    if (G.audio && (attacker.isLocal || victim.isLocal || victim._nearCamera?.())) {
      _vh.copy(victim.pos); _vh.y += victim.form === 'squid' ? 0.3 : 0.9;
      G.audio.play('ink_hit_body', { pos: _vh, volume: (victim.isLocal ? 0.3 : 0.4) + Math.min(0.45, dmg / 260), pitch: dmg >= 60 ? 0.8 : 1.05 });
    }
    if (attacker.isLocal) rumble(attacker, killed ? 0.35 : 0.06, killed ? 0.4 : 0.16, killed ? 150 : 45);
  }

  // ---- per-frame
  update(dt) {
    for (const k in MAIN_KITS) MAIN_KITS[k].tick?.(dt);   // kit weapons' own world objects (kits/*.js)
    const list = this.list;
    const nm = G.netm;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      // fired while its owner's special was running: its ink never charges the special meter (see _credit)
      if (p.sp === undefined) p.sp = !!(p.owner && p.owner.specialActive);
      if (p.delay > 0) { p.delay -= dt; if (p.delay > 0) continue; }   // poured waves: later globs leave a beat later
      if (p.ghost && nm) nm.mute++;
      try { if (this._step(p, dt)) { list[i] = list[list.length - 1]; list.pop(); this.pool.push(p); } }
      finally { if (p.ghost && nm) nm.mute--; }
    }
    this._updateBombs(dt);
    this._updateClouds(dt);
    this._updateBeams(dt);
    this._draw();
  }

  // one round, one frame; true = it's done
  _step(p, dt) {
    {
      p.age += dt;
      p.prev.copy(p.pos);
      if (p.age > p.straight) p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(1 - p.drag * dt * (p.age > p.straight ? 1 : 0));
      p.pos.addScaledVector(p.vel, dt);
      let dead = false;
      // actors
      for (const e of G.actors) {
        if (e.team === p.team || !e.alive) continue;
        const h = e.hitH || (e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height), hr = e.hitR || PLAYER.radius;
        if (Math.abs(e.pos.x - p.pos.x) > 3 + hr || Math.abs(e.pos.z - p.pos.z) > 3 + hr) continue;
        Physics.segmentCapsuleDist(p.prev, p.pos, hitBase(e), hr, h, _res);
        // generous hitbox: the whole visible body plus the blob's own radius
        if (_res.dist < hr * 0.95 + p.size) {
          if (p.volley && p.volley.hit.has(e)) continue;   // bucket: this throw already landed on them: pass through
          if (p.volley) p.volley.hit.add(e);
          _v.copy(p.prev).lerp(p.pos, _res.t);
          let dmg = p.damage;
          if (p.type === 'drop') dmg = lerp(p.damage, p.dmgFar, clamp(p.start.distanceTo(_v) / 7, 0, 1));
          // bucket: full damage at any range, less only when the target stands below the thrower
          if (p.belowFalloff) dmg *= 1 - clamp((p.start.y - (e.pos.y + 0.8) - 0.5) * p.belowFalloff, 0, p.belowFalloffMax);
          // slosher: one direct hit per throw per victim (the rest of the wave still splashes on them, harmlessly)
          if (p.vol) { if (p.vol.hits.includes(e)) dmg = 0; else p.vol.hits.push(e); }
          if (dmg > 0) this.applyHit(p.owner, e, dmg, p.weaponId || p.wid || p.type);
          G.fx?.burst(_v, _v2.copy(p.vel).normalize().negate(), p.owner.color, { count: 6, speed: 3, size: 0.07 });
          if (p.type !== 'blast') emit('weapon:impact', { pos: _v.clone(), normal: _v2.clone(), team: p.team, kind: p.type === 'drop' || (p.type === 'slosh' && p.vol) ? 'drop' : 'shot', radius: p.radius * 0.5, victim: e });
          if (p.type === 'blast') this._blastBurst(p, _v, e);
          if (p.type === 'slosh' && p.head) this._sloshSplash(p, _v, e);
          dead = true; break;
        }
      }
      // enemy ink curtains and devices (sprinklers, beacons) catch shots; so do special objects (bubbles, tanks)
      if (!dead && G.subs && G.subs.blockShot(p.prev, p.pos, p.team, p.damage || 10)) dead = true;
      if (!dead && G.specials && G.specials.shotHit(p.prev, p.pos, p.team, p.damage || 10, p.owner)) dead = true;
      // world
      // boss mode: HULLBREAKER's hit spheres and its crablets
      if (!dead && G.boss) {
        const bh = G.boss.segHit(p.prev, p.pos, p.size * 0.6);
        if (bh) { this._bossImpact(p, bh); dead = true; }
      }
      if (!dead) {
        const hit = G.physics.segment(p.prev, p.pos, _hit, true);
        if (hit.hit) {
          this._impact(p, hit);
          dead = true;
        }
      }
      // trail drips
      if (!dead && p.trailEvery) {
        p.trail += p.vel.length() * dt;
        if (p.trail > p.trailEvery) {
          p.trail = 0;
          const g = G.physics.raycast(p.pos, DOWN, 4, _hit2, true);
          if (g.hit) this._credit(p, G.paint.splat(_v.copy(g.point).addScaledVector(g.normal, 0.1), p.trailRadius * (0.8 + Math.random() * 0.4), p.team, { seed: Math.random() }));
        }
      }
      if (!dead && p.age > p.life) {
        if (p.type === 'blast') this._blastBurst(p, p.pos, null);
        dead = true;
      }
      if (!dead && p.pos.y < PLAYER.waterY - 1.8) dead = true;
      return dead;
    }
  }

  // a blob / drop / blast connecting with the boss or a crablet (bh from boss.segHit)
  _bossImpact(p, bh) {
    const at = (this._bossAt || (this._bossAt = new THREE.Vector3())).copy(bh.point), target = bh.target;
    const key = target.hp !== undefined && target.id !== undefined ? target : G.boss;   // one hit per volley per body
    let dmg = p.damage;
    if (p.type === 'drop') dmg = lerp(p.damage, p.dmgFar, clamp(p.start.distanceTo(at) / 7, 0, 1));
    if (p.vol) { if (p.vol.hits.includes(key)) dmg = 0; else p.vol.hits.push(key); }
    // a roller flick is one sheet of ink: against a body this size every drop would land, so only the first counts
    // in full and the rest chip
    if (p.type === 'drop') { const o = p.owner, t = o._flickBossT ?? -9; if (G.time - t < 0.3) dmg *= 0.12; else o._flickBossT = G.time; }
    if (dmg > 0) G.boss.hit(p.owner, dmg, target, p.wid || p.type, at.clone());
    else G.fx?.burst(at, _v2.copy(p.vel).normalize().negate(), p.owner.color, { count: 4, speed: 3, size: 0.07 });
    if (p.type !== 'blast') emit('weapon:impact', { pos: at.clone(), normal: _v2.copy(p.vel).normalize().negate().clone(), team: p.team, kind: p.type === 'drop' || p.type === 'slosh' ? 'drop' : 'shot', radius: p.radius * 0.5, victim: null });
    if (p.type === 'blast') this._blastBurst(p, at, 'boss');
    if (p.type === 'slosh' && p.head) this._sloshSplash(p, at, 'boss');
  }

  _impact(p, hit) {
    _v.copy(hit.point).addScaledVector(hit.normal, 0.14);
    _dir.copy(p.vel).normalize();
    const rad = p.radius * (0.85 + Math.random() * 0.3);
    const sloshr = p.type === 'slosh' && !!p.vol;   // an upstream slosher glob (our bucket's blobs paint as before)
    let area;
    if (sloshr) {
      // the wave lands as a thick stripe along its travel: stretched along the horizontal heading
      _dir.y = 0; if (_dir.lengthSq() < 1e-4) _dir.set(0, 0, 1); _dir.normalize();
      area = G.paint.splat(_v, rad * 1.12, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 1.25, pod: p.pod });
      if (p.head) this._sloshSplash(p, hit.point, null);
    } else area = G.paint.splat(_v, rad, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 0.7, pod: p.pod ?? (p.type === 'drop' ? POD_HINT.drop : undefined) });
    this._credit(p, area);
    if (p.type !== 'blast') emit('weapon:impact', { pos: hit.point.clone(), normal: hit.normal.clone(), team: p.team, kind: p.type === 'drop' || sloshr ? 'drop' : 'shot', radius: rad });
    const near = p.owner.isLocal || G.camera.position.distanceToSquared(hit.point) < 22 * 22;
    if (near) {
      G.fx?.burst(hit.point, hit.normal, p.owner.color, { count: p.type === 'blast' ? 14 : 5, speed: p.type === 'blast' ? 5 : 3, size: 0.07, paint: false });
      if (Math.random() < (p.type === 'shot' ? 0.45 : 1)) G.audio?.play(p.type === 'blast' ? 'splat_big' : 'splat_small', { pos: hit.point, volume: p.type === 'shot' ? 0.35 : 0.6 });
    }
    if (p.type === 'blast') this._blastBurst(p, hit.point, null);
  }

  _blastBurst(p, at, direct) {
    const b = p.burst;
    const w = b ? { burstRadius: b.radius, impactRadius: b.paint ?? b.radius * 0.6, splashRadius: b.splashRadius, splashDamageMax: b.dmgMax, splashDamageMin: b.dmgMin } : WEAPONS.blaster;
    const c = at.clone();
    G.fx?.explosion(c, p.owner.color, w.burstRadius);
    G.audio?.play(p.weaponId === 'jetpack' ? 'jet_boom' : 'blaster_boom', { pos: c, volume: 0.7 });   // sfx-cues: the Ink Jet's shots land with their own boom
    emit('weapon:impact', { pos: c.clone(), normal: new THREE.Vector3(0, 1, 0), team: p.team, kind: 'blast', radius: w.burstRadius });
    // paint under the burst
    const g = G.physics.raycast(_v2.copy(c).setY(c.y + 0.2), DOWN, 3.5, _hit2);
    if (g.hit) this._credit(p, G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.impactRadius, p.team, { seed: Math.random() }));
    for (const e of G.actors) {
      if (e.team === p.team || !e.alive || e === direct) continue;
      _v.copy(e.pos); _v.y += 0.7;
      const d = _v.distanceTo(c);
      if (d > w.splashRadius) continue;
      if (!G.physics.los(c, _v)) continue;
      this.applyHit(p.owner, e, lerp(w.splashDamageMax, w.splashDamageMin, d / w.splashRadius), p.weaponId || 'blaster');
    }
    G.specials?.areaHit(c, w.splashRadius, w.splashDamageMin, p.team, p.owner);
    if (direct !== 'boss') G.boss?.splash(p.owner, c, w.splashRadius, w.splashDamageMax, w.splashDamageMin, 'blaster');
  }

  _updateBombs(dt) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.age += dt;
      b.vel.y -= 24 * dt;
      _v.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      const hit = G.physics.segment(_v, b.pos, _hit);
      // boss mode: bombs glance off HULLBREAKER's shell (they'd otherwise sail through it)
      if (!hit.hit && G.boss && b.kind === 'bomb') {
        const bh = G.boss.segHit(_v, b.pos, 0.2), sh = bh && bh.target.pos && bh.target;
        if (sh) {
          _v2.copy(b.pos).sub(sh.pos).normalize(); b.pos.copy(sh.pos).addScaledVector(_v2, sh.r + 0.22);
          const vn = b.vel.dot(_v2); if (vn < 0) b.vel.addScaledVector(_v2, -vn * 1.35);
          b.vel.multiplyScalar(0.55);
        }
      }
      if (hit.hit) {
        if (b.kind === 'storm') { this._spawnCloud(b); if (b.ghost) this.clouds[this.clouds.length - 1].ghost = true; this.scene.remove(b.mesh); this.bombs.splice(i, 1); continue; }
        b.pos.copy(hit.point).addScaledVector(hit.normal, 0.21);
        const vn = b.vel.dot(hit.normal);
        b.vel.addScaledVector(hit.normal, -vn * 1.35);
        b.vel.multiplyScalar(hit.normal.y > 0.6 ? 0.45 : 0.6);
        if (hit.normal.y > 0.6 && b.fuse < 0) {
          b.fuse = SUB.bomb.fuse;
          G.cues?.sub('bomb', 'land', { owner: b.owner, team: b.team, at: b.pos });   // sfx-cues: armed (the fuse loop: src/audio/cues.js)
          emit('bomb:arm', { actor: b.owner, pos: b.pos.clone(), team: b.team, radius: SUB.bomb.radius });
        }
      }
      if (b.kind === 'storm' && b.age > 1.1) { this._spawnCloud(b); if (b.ghost) this.clouds[this.clouds.length - 1].ghost = true; this.scene.remove(b.mesh); this.bombs.splice(i, 1); continue; }
      if (b.fuse >= 0) {
        b.fuse -= dt;
        b.beepT -= dt;
        const k = 1 - b.fuse / SUB.bomb.fuse;
        b.body.material.emissiveIntensity = (Math.sin(b.age * (10 + k * 30)) * 0.5 + 0.5) * (0.4 + k * 1.8);
        b.mesh.scale.setScalar(1 + k * 0.35 + Math.sin(b.age * 40) * 0.03 * k);
        if (b.beepT <= 0) b.beepT = 0.3 - k * 0.2;   // sfx-cues: the fuse ticks are the fuse_bomb loop now (src/audio/cues.js)
        if (b.fuse <= 0) { const nm = G.netm; if (b.ghost && nm) nm.mute++; try { this._explodeBomb(b); } finally { if (b.ghost && nm) nm.mute--; } this.scene.remove(b.mesh); this.bombs.splice(i, 1); continue; }
      }
      if (b.pos.y < PLAYER.waterY - 1.8) { this.scene.remove(b.mesh); this.bombs.splice(i, 1); continue; }
      b.mesh.position.copy(b.pos);
      // [sub-view] armed (it has landed), the drawn ball — radius 0.2 × vs × the fuse pulse — sits ON the floor under it:
      // its centre that far up (the physics centre sits 0.21 up and, resting, bobs 0.03–0.21 as it settles: the drawn
      // one doesn't), and resting it stands cap-up rather than rolling on the spot (the bigger cap would dip into the floor)
      let rest = false;
      if (b.vs && b.fuse >= 0) {
        const br = 0.2 * b.vs * b.mesh.scale.x, g = G.physics.raycast(b.pos, DOWN, br * 2 + 0.25, _hit2);
        if (g.hit && g.normal.y > 0.6) {
          const want = br / g.normal.y;
          if (g.dist < want) b.mesh.position.y += want - g.dist;
          if ((rest = g.dist < 0.3)) { _q.setFromUnitVectors(UP, g.normal); b.mesh.quaternion.slerp(_q, 1 - Math.exp(-10 * dt)); }
        }
      }
      if (!rest) {
        b.mesh.rotation.x += b.spin.x * dt * (b.fuse < 0 ? 1 : 0.2);
        b.mesh.rotation.z += b.spin.y * dt * (b.fuse < 0 ? 1 : 0.2);
      }
    }
  }

  _updateClouds(dt) {
    const sp = SPECIALS.storm;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.t += dt;
      const grow = clamp(c.t / 0.5, 0, 1), fade = clamp((c.dur - c.t) / 0.6, 0, 1);
      const s = (0.3 + 0.7 * (1 - Math.pow(1 - grow, 3))) * (0.2 + 0.8 * fade);
      c.group.scale.setScalar(s);
      c.group.position.addScaledVector(c.dir, sp.driftSpeed * dt);
      c.group.children.forEach((m) => { m.position.y += Math.sin(G.time * 1.6 + m.userData.bob) * 0.0025; });
      c.loop?.set({ pos: c.group.position, volume: 0.6 * fade });
      if (c.t < c.dur - 0.3) {
        G.fx?.rain(c.group.position, sp.radius * s, G.teamColors[c.team], dt, { cloud: false });
        c.rainT -= dt;
        while (c.rainT <= 0) {
          c.rainT += 0.045;
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * sp.radius;
          _v.set(c.group.position.x + Math.cos(a) * r, c.group.position.y - 0.8, c.group.position.z + Math.sin(a) * r);
          const g = G.physics.raycast(_v, DOWN, 12, _hit);
          if (g.hit && !c.ghost) c.owner.addTurfNoSpecial(G.paint.splat(_v2.copy(g.point).addScaledVector(g.normal, 0.1), 0.45 + Math.random() * 0.35, c.team, { seed: Math.random() }));   // (a special's rain)
        }
        if (!c.ghost) G.boss?.rain(c.owner, c.group.position.x, c.group.position.z, sp.radius * s, sp.dps * dt);
        for (const e of G.actors) {
          if (e.team === c.team || !e.alive || e.remote) continue;     // online: each client rains on its own actors
          const dx = e.pos.x - c.group.position.x, dz = e.pos.z - c.group.position.z;
          if (dx * dx + dz * dz > sp.radius * sp.radius || e.pos.y > c.group.position.y) continue;
          _v.copy(e.pos); _v.y += 1.2;
          _v2.set(e.pos.x, c.group.position.y - 0.6, e.pos.z);
          if (!G.physics.los(_v, _v2)) continue;
          const killed = e.damage(sp.dps * dt, c.owner, 'storm');
          if (killed) emit('hit', { attacker: c.owner, victim: e, damage: 0, killed: true, weaponId: 'storm' });
        }
      }
      if (c.t >= c.dur) { c.loop?.stop(0.3); emit('storm:end', { pos: c.group.position.clone(), team: c.team, actor: c.owner }); this.scene.remove(c.group); this.clouds.splice(i, 1); }
    }
  }

  _updateBeams(dt) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      const k = b.t / b.life;
      const u = b.mesh.material.uniforms;
      u.uT.value = b.t;
      u.uWidth.value = b.th * 2.3 * (1 - 0.45 * Math.min(1, k));   // the streak thins as it dissipates (never swells)
      if (k >= 1) { b.mesh.visible = false; this.beamPool.push(b.mesh); this.beams.splice(i, 1); }
    }
    // laser sights on every charging charger (so you can read where enemy snipers are aiming); the spinner and the
    // splatling spin up with their own tells (motor whine, weapon meter) — no sight
    for (const a of G.actors) {
      const k = a.weapon?.kind;
      const on = a.alive && a.weaponRunner.charging && k === 'charger';
      let s = this.sights.get(a);
      if (on) {
        if (!s) {
          s = new THREE.Mesh(this.ribbonGeo, makeRibbonMaterial(1));
          s.frustumCulled = false; s.renderOrder = 4; s.onBeforeRender = ribbonGate;
          this.sights.set(a, s); this.scene.add(s);
        }
        const m = this._muzzle(a, _v.set(0, 0, 0));
        const dir = this._aimFrom(a, m, _dir);
        const w = a.weapon;
        const ch = a.weaponRunner.charge;
        const range = lerp(w.rangeMin, w.rangeMax, ch);
        const hit = G.physics.raycast(m, dir, range, _hit);
        const len = hit.hit ? hit.dist : range;
        s.position.copy(m);
        s.quaternion.setFromUnitVectors(ZAX, dir);
        const th = 0.012 + ch * 0.012;
        s.scale.set(th, th, len);
        const u = s.material.uniforms;
        u.uColor.value.copy(a.color); s.material.color.copy(a.color).multiplyScalar(1.6);
        u.uCharge.value = ch; u.uLen.value = len; u.uT.value = G.time; u.uWidth.value = 0.014 + ch * 0.02;
        s.visible = true;
      } else if (s) {
        s.visible = false;
      }
    }
  }

  // bomb/special throw arc preview (local player holding the sub button)
  updateArc(a, show) {
    const sub = (a && a.specialActive && a.specialActive.bomb) || (a && a.sub) || SUB.bomb;
    if (!show || !a || !a.alive || sub.placed || SUB_KITS[sub.kind]?.noArc) { this.arcLine.visible = false; this.arcRing.visible = false; return; }   // noArc: kit subs that draw their own aim guide (tracer)
    const vel = this._arcVel || (this._arcVel = new THREE.Vector3());
    this.throwVelocity(a, sub.throwSpeed, vel);
    const p = _v.copy(a.pos); p.y += 1.35;
    const pos = this.arcGeo.attributes.position;
    let n = 0, landed = false;
    // same integrator + step as _updateBombs (60 Hz semi-implicit Euler), one vertex every 2 steps → exact landing
    const dt = SIM_DT, per = 2;
    const prev = this._arcPrev || (this._arcPrev = new THREE.Vector3());
    pos.setXYZ(0, p.x, p.y, p.z); n = 1;
    for (let i = 0; i < (this.arcN - 1) * per; i++) {
      prev.copy(p);
      vel.y -= 24 * dt;
      p.addScaledVector(vel, dt);
      const h = G.physics.segment(prev, p, _hit);
      if (h.hit) { pos.setXYZ(n, h.point.x, h.point.y, h.point.z); n++; landed = true; this.arcRing.position.copy(h.point).addScaledVector(h.normal, 0.03); this.arcRing.quaternion.setFromUnitVectors(UP, h.normal); break; }
      if ((i + 1) % per === 0) { pos.setXYZ(n, p.x, p.y, p.z); n++; }
      if (n >= this.arcN) break;
    }
    pos.needsUpdate = true;
    this.arcGeo.setDrawRange(0, n);
    this.arcLine.computeLineDistances();
    const col = a.ink >= sub.inkCost ? a.color : new THREE.Color(0.6, 0.6, 0.6);
    this.arcLine.material.color.copy(col).multiplyScalar(1.4);
    this.arcRing.material.color.copy(col).multiplyScalar(1.4);
    this.arcLine.visible = true;
    this.arcRing.visible = landed;
    this.arcRing.scale.setScalar(1 + Math.sin(G.time * 8) * 0.06);
  }

  // Every projectile = a glossy teardrop head (tail length from its speed, liquid wobble, a fat "squirt" pop as it
  // leaves the muzzle) + a string of satellite droplets that sway behind it and close up as it slows. Blaster balls
  // swell and jiggle in the last moments before their mid-air burst.
  _draw() {
    let n = 0;
    const B = this.blobs, shp = this.blobShape.array;
    for (const p of this.list) {
      if (n >= MAX_BLOBS - 5) break;
      if (p.delay > 0) continue;
      const sp = p.vel.length();
      _dir.copy(p.vel).multiplyScalar(1 / Math.max(sp, 1e-3));
      _q.setFromUnitVectors(ZAX, _dir);
      const g = Math.min(1, p.age * 20);
      let vis = (p.vis || p.size) * g * (1 + 0.3 * Math.sin(g * Math.PI));
      let tail = (p.tail0 ?? 1) + Math.min(p.tailK ?? 1.2, sp * 0.04) * g;
      let wob = p.wob ?? 0.04, bright = 1;
      if (p.type === 'blast') {
        const k = smoothstep(0.8, 1, p.age / p.life);
        vis *= 1 + 0.34 * k; wob *= 1 + 2.4 * k; bright = 1 + 0.9 * k; tail *= 1 - 0.55 * k;
      }
      const ph = p.seed * 40 + p.age * (p.wobF || 20);
      _s.setScalar(vis);
      _m.compose(p.pos, _q, _s);
      B.setMatrixAt(n, _m);
      B.setColorAt(n, bright === 1 ? p.owner.color : _c.copy(p.owner.color).multiplyScalar(bright));
      let o = n * 4; shp[o] = tail; shp[o + 1] = wob; shp[o + 2] = ph; shp[o + 3] = p.nose || 0;
      n++;
      // satellites: only once the head has travelled clear of the gun, thinning out down the string
      const ns = Math.min(p.sats || 0, SAT_SIZE.length);
      if (!ns || sp < 4) continue;
      const trav = p.start.distanceTo(p.pos);
      if (Math.abs(_dir.y) < 0.95) _v2.set(-_dir.z, 0, _dir.x).normalize(); else _v2.set(1, 0, 0);
      _v3.crossVectors(_dir, _v2);
      const r0 = p.vis || p.size, spk = 0.55 + 0.45 * Math.min(1, sp / 25), fade = 1 - 0.45 * Math.min(1, p.age / p.life);
      for (let i = 0; i < ns && n < MAX_BLOBS; i++) {
        const back = r0 * (tail + 1.15 + i * 1.8) * spk;
        if (trav < back + r0 * 1.6) break;
        const sph = p.seed * 31 + i * 2.4 + p.age * 11;
        const lat = r0 * (0.16 + i * 0.16);
        _v.copy(p.pos).addScaledVector(_dir, -back).addScaledVector(_v2, Math.sin(sph) * lat).addScaledVector(_v3, Math.cos(sph * 1.3) * lat);
        _s.setScalar(r0 * SAT_SIZE[i] * fade * (1 + 0.14 * Math.sin(sph * 2.1)));
        _m.compose(_v, _q, _s);
        B.setMatrixAt(n, _m);
        B.setColorAt(n, p.owner.color);
        o = n * 4; shp[o] = 1.3 + 0.25 * spk; shp[o + 1] = 0.05; shp[o + 2] = sph * 3; shp[o + 3] = 0;
        n++;
      }
    }
    B.count = n;
    B.instanceMatrix.needsUpdate = true;
    if (B.instanceColor) B.instanceColor.needsUpdate = true;
    this.blobShape.needsUpdate = true;
  }
}
