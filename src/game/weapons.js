// Weapons: per-actor WeaponRunner (fire logic for shooter/roller/charger/blaster + bomb sub) and the global
// Projectiles system (ink shots, blaster blobs, roller drops, bombs, storm clouds, charger beams, bomb arc preview).
//
// Accuracy: every shot leaves the muzzle aimed at the crosshair's world point and shooter shots get a
// ballistic launch-pitch correction (same integrator as the flight) so, inside the weapon's range, they land on the
// crosshair instead of dropping under it; spread is a cone around that corrected line (shooter: first-shot accurate,
// blooms with sustained fire, recovers when you let go). Hit tests use the victim's visual (smoothed) body.
import * as THREE from 'three';
import { G, emit, clamp, lerp, smoothstep } from '../core/ctx.js';
import { WEAPONS, SUB, SPECIALS, PLAYER } from '../config.js';
import { Physics, Hit } from './physics.js';

// local-player gamepad rumble (subtle; no-op without a pad or with settings.rumble = 0)
function rumble(a, strong, weak, ms) { if (a && a.isLocal && !a.isBot) G.input?.rumble?.(strong, weak, ms); }
// feet of the victim's *visual* body (the smoothed root), so what you see is what you hit
const _hb = new THREE.Vector3();
function hitBase(e) { return _hb.set(e.pos.x, e.pos.y + (e.smoothY || 0), e.pos.z); }
const SIM_DT = 1 / 60;

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _dir = new THREE.Vector3(), _fwd = new THREE.Vector3(), _vh = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), ZAX = new THREE.Vector3(0, 0, 1);
const _hit = new Hit(), _hit2 = new Hit();
const _res = { t: 0, dist: 0 };
const DEG = Math.PI / 180;
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
    // dualies: alternating hand, per-hand shot clocks, dodge roll + locked turret afterwards
    this.hand = 0; this.sinceHand = this.sinceHand || [99, 99]; this.sinceHand[0] = this.sinceHand[1] = 99;
    this.dodge = null; this.lockT = 0; this.rollsLeft = 2; this.rollPaint = 0;
    this._dodgeDir = this._dodgeDir || new THREE.Vector3();
    // slosher windup · splatling stream
    this.slosh = -1; this.streaming = false; this.burstT = 0; this.burstDur = 0; this.burstFrac = 0;
    this.spinLoop?.stop(0.08); this.spinLoop = null;
  }
  onDeath() { this.reset(); }
  busy() { return this.charging || this.flick >= 0 || this.slosh >= 0 || this.streaming || !!this.dodge || this.lockT > 0; }
  firingPose() { return this.firingT > 0 || this.charging || this.flick >= 0 || this.rolling || this.slosh >= 0 || this.streaming || !!this.dodge || this.lockT > 0; }
  moveSpeed() {
    const w = this.a.weapon;
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
    const a = this.a;
    if (w.kind === 'shooter' || w.kind === 'splatling' || w.kind === 'dualies') {
      if (w.kind === 'dualies' && this.lockT > 0) return w.spreadLock;   // locked turret: tight
      const base = a.grounded ? w.spreadGround : w.spreadAir;
      return base * lerp(w.spreadFirst ?? 0.45, 1, this.bloom);
    }
    if (w.kind === 'blaster') return a.grounded ? (w.spread ?? 1.2) : (w.spreadAir ?? 4);
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
      case 'dualies': this._dualies(dt, inp, w); break;
      case 'slosher': this._slosher(dt, inp, w); break;
      case 'splatling': this._splatling(dt, inp, w); break;
    }
    // ---- sub weapon (splat bomb)
    const bomb = SUB.bomb;
    if (inp.sub && !this.aimingSub) {
      this.aimingSub = true;
      if (a.ink < bomb.inkCost && a.isLocal) { G.audio?.play('low_ink'); emit('lowink', { actor: a, need: bomb.inkCost }); }
    }
    if (this.aimingSub) a.fireFacing = 0.3;
    if (inp.subReleased && this.aimingSub) {
      this.aimingSub = false;
      if (a.ink >= bomb.inkCost) {
        a.ink -= bomb.inkCost;
        a.lastFire = 0;
        a.character.trigger('throw');
        G.projectiles.throwBomb(a);
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
  // ---- dualies: the hands alternate (12 shots/s). A jump press while firing with a move direction dodge-rolls instead
  // (actor.js calls tryDodge / dodgeVel): a 0.3 s ink-trailing roll, then a 0.5 s locked turret — planted, tight spread,
  // faster fire. Two rolls chain; they refill once you stop firing and the lock has ended.
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
    if (!inp.fire && this.lockT <= 0) this.rollsLeft = w.rolls;
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

  /** actor.js: a jump press while grounded → try a dualies dodge roll along `move` (world xz). true = rolling (skip the jump). */
  tryDodge(move) {
    const a = this.a, w = a.weapon;
    if (w.kind !== 'dualies' || this.dodge || !a.alive || a.form === 'squid' || this.aimingSub || !move) return false;
    if (!(this.firingT > 0 || a.intent.fire)) return false;
    const ml = Math.hypot(move.x, move.z);
    if (ml < 0.3 || this.rollsLeft <= 0) return false;
    if (a.ink < w.rollInk) { this._empty(); return false; }
    a.ink -= w.rollInk; a.lastFire = 0;
    this.rollsLeft--; this.lockT = 0; this.rollPaint = 0;
    this._dodgeDir.set(move.x / ml, 0, move.z / ml);
    this.dodge = { t: 0, dur: w.rollTime };
    const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw), dx = this._dodgeDir.x, dz = this._dodgeDir.z;
    a.character.trigger('dodge', { x: dx * cy - dz * sy, z: dx * sy + dz * cy, t: w.rollTime });   // root space (+x = its left)
    if (a.isLocal || a._nearCamera()) G.audio?.play('dualies_roll', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 0.7 : 0.5 });
    emit('weapon:dodge', { actor: a, pos: a.pos.clone(), dir: this._dodgeDir.clone() });
    rumble(a, 0.22, 0.32, 130);
    return true;
  }

  /** actor.js: while rolling, sets the horizontal velocity (fast-out ease: 1.5·dist/time → 0) and returns true. */
  dodgeVel(vel) {
    const d = this.dodge;
    if (!d) return false;
    const w = this.a.weapon, u = Math.min(1, d.t / d.dur);
    const sp = (1.5 * w.rollDist / w.rollTime) * (1 - u * u);
    vel.x = this._dodgeDir.x * sp; vel.z = this._dodgeDir.z * sp;
    return true;
  }

  // ---- slosher: press / hold → a 0.13 s heave, then the wave leaves (Projectiles.fireSlosh); repeats at the fire rate
  _slosher(dt, inp, w) {
    const a = this.a;
    if (this.slosh >= 0) {
      this.slosh += dt; a.fireFacing = 0.5; this.firingT = 0.35;
      if (this.slosh >= w.windup) { this.slosh = -1; G.projectiles.fireSlosh(a, w); this.cooldown = w.fireInterval - w.windup; }
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

  // ---- splatling: hold → spin up (chargeTime; a motor loop rising in pitch, a clunk at full), release → a stream of
  // burstMin…burstMax s scaled by the charge at 15 shots/s. charge = spin-up while charging, the stream left while
  // streaming (burstFrac), so the HUD meter / weapon meter fill and then drain.
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
        this.streaming = false; this.charge = 0; this.burstFrac = 0; this.cooldown = Math.max(this.cooldown, 0.22);
        this.spinLoop?.stop(0.12); this.spinLoop = null;
        if (a.isLocal || a._nearCamera()) G.audio?.play('splatling_wind', { pos, volume: a.isLocal ? 0.6 : 0.42 });
      }
      return;
    }
    if (inp.fire && this.cooldown <= 0) {
      if (!this.charging) {
        if (a.ink < w.inkPerShot * 5) { this._empty(); return; }
        this.charging = true; this.charge = 0; this.chargeT = 0; this.chargeDinged = false;
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

// ---------------------------------------------------------------------------------------------- projectiles
const MAX_BLOBS = 700;
// stream-round looks (visual only; hit size stays in 'size'): dualies smaller + snappier, splatling tight and fast
const LOOK_DUAL_R = Object.freeze({ vis: 0.088, tail0: 0.8, tailK: 1.3, wob: 0.03, wobF: 28, nose: 0.3, sats: 2 });
const LOOK_DUAL_L = Object.freeze({ vis: 0.088, tail0: 0.8, tailK: 1.3, wob: 0.03, wobF: 28, nose: 0.3, sats: 2 });
const LOOK_SPLAT = Object.freeze({ vis: 0.086, tail0: 0.9, tailK: 1.6, wob: 0.025, wobF: 30, nose: 0.35, sats: 2 });
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
    this.vols = Array.from({ length: 32 }, () => ({ hits: [] }));
    this.volI = 0;
    // laser sight lines for charging chargers
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
  }

  _new() {
    const p = this.pool.pop() || { pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), start: new THREE.Vector3() };
    p.delay = 0; p.head = false; p.wid = null; p.dmgFar = undefined; p.vol = null;   // optional fields never leak between recycled rounds
    return p;
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
  // the same frame the trigger is pulled), where it is about to be: shots never leave from the hip.
  _muzzle(a, out) {
    const ch = a.character;
    ch.getMuzzle(out);
    const w = ch.aimReady ? ch.aimReady() : 1;
    if (w < 0.98 && ch.getAimMuzzle && ch.getAimMuzzle(_v2, a.aimPitch)) out.lerp(_v2, 1 - w);
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
    this.list.push(p);
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
    this.list.push(p);
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

  // Slosher wave: 8 heavy globs poured over ~0.09 s along one lob (the lower ballistic solution onto the crosshair,
  // clamped to range, never flatter than 7°). Later globs leave slower and a touch lower, so they land in a line back
  // toward the thrower — one thick stripe, and the arc carries over cover and up onto ledges.
  fireSlosh(a, w) {
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
      this.list.push(p);
    }
    _dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    if (a.isLocal || a._nearCamera()) G.fx?.muzzle(m, _dir, a.color, 'blaster');
    emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: _dir.clone() });
    rumble(a, 0.18, 0.3, 90);
  }

  // head glob landing: a heavy splash that also catches anyone standing next to where it lands
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
    if (p.owner.isLocal || G.camera.position.distanceToSquared(at) < 26 * 26) {
      G.fx?.burst(at, UP, p.owner.color, { count: 16, speed: 4.2, size: 0.09 });
      G.fx?.ring(at, UP, p.owner.color, { radius: w.splashRadius, life: 0.32 });
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
    this.list.push(p);
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
      Object.assign(p, { type: 'drop', owner: a, team: a.team, age: 0, life: 1.4, straight: 0, radius: 0.85 + Math.random() * 0.3, damage: w.flickDamageNear, dmgFar: w.flickDamageFar, size: 0.15, trail: 0, trailEvery: 1.8, trailRadius: 0.45, grav: 26, drag: 0.4, seed: Math.random(),
        vis: 0.1 + 0.085 * mid + Math.random() * 0.03, tail0: 0.4, tailK: 1.0, wob: 0.1, wobF: 19, nose: 0, sats: mid > 0.45 ? 2 : 1 });
      p.pos.set(m.x + fx * 0.6, m.y + 0.3, m.z + fz * 0.6); p.prev.copy(p.pos); p.start.copy(p.pos);
      const cu = Math.cos(up + (Math.random() - 0.5) * 0.12);
      p.vel.set(Math.sin(ang) * cu * sp, Math.sin(up) * sp, Math.cos(ang) * cu * sp);
      this.list.push(p);
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
    if (victim) { len = victim.d; this.applyHit(a, victim.e, dmg, 'charger'); }
    // paint along the line (projected to the ground)
    let area = 0;
    const step = w.lineSplatEvery;
    for (let s = 1.2; s < len - 0.3; s += step) {
      _v2.copy(m).addScaledVector(dir, s);
      const g = G.physics.raycast(_v2, DOWN, 3.5, _hit2, true);
      if (g.hit) area += G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.lineRadius * (0.8 + charge * 0.4), a.team, { seed: Math.random(), stretch: dir, stretchAmt: 1.2 });
    }
    if (hit.hit && !victim) {
      _v2.copy(hit.point).addScaledVector(hit.normal, 0.12);
      area += G.paint.splat(_v2, w.impactRadius * (0.6 + 0.4 * charge), a.team, { seed: Math.random(), stretch: dir, stretchAmt: 0.6 });
      G.fx?.burst(hit.point, hit.normal, a.color, { count: 10, speed: 4, size: 0.09, paint: false });
      if (a.isLocal || a._nearCamera()) G.audio?.play('ink_hit_wall', { pos: hit.point, volume: 0.6 });
    }
    {
      const end = new THREE.Vector3().copy(m).addScaledVector(dir, len);
      emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone(), charge });
      emit('weapon:impact', { pos: end, normal: hit.hit && !victim ? hit.normal.clone() : dir.clone().negate(), team: a.team, kind: 'charger', radius: w.impactRadius * (0.6 + 0.4 * charge) });
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

  // Invisible stand-ins for the materials bombs / storm clouds create at first use, so boot can precompile them.
  warmMeshes() {
    const m = (geo, mat) => new THREE.Mesh(geo, mat);
    return [
      m(this.bombGeo, this._bombMat(0)),
      m(this.bombCapGeo, new THREE.MeshStandardMaterial({ metalness: 0.6 })),
      m(this.cloudGeo, new THREE.MeshStandardMaterial({ transparent: true })),
    ];
  }

  throwVelocity(a, speed, out) {
    const pitch = clamp(a.aimPitch + 0.28, -0.3, 1.1);
    const cp = Math.cos(pitch);
    return out.set(Math.sin(a.aimYaw) * cp * speed + a.vel.x * 0.4, Math.sin(pitch) * speed + 1.5, Math.cos(a.aimYaw) * cp * speed + a.vel.z * 0.4);
  }

  throwBomb(a) {
    const b = SUB.bomb;
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.bombGeo, this._bombMat(a.team).clone());
    body.castShadow = true;
    const cap = new THREE.Mesh(this.bombCapGeo, new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.4, metalness: 0.6 }));
    cap.position.y = 0.2;
    group.add(body, cap);
    const pos = _v.copy(a.pos); pos.y += 1.35;
    group.position.copy(pos);
    this.scene.add(group);
    const vel = this.throwVelocity(a, b.throwSpeed, new THREE.Vector3());
    this.bombs.push({ kind: 'bomb', owner: a, team: a.team, mesh: group, body, pos: pos.clone(), vel, fuse: -1, age: 0, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), beepT: 0 });
    if (a.isLocal || a._nearCamera()) G.audio?.play('bomb_throw', { pos: a.isLocal ? undefined : a.pos, volume: 0.7 });
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
  }

  _explodeBomb(b) {
    const s = SUB.bomb;
    const c = b.pos;
    let area = G.paint.splat(_v.copy(c).setY(c.y + 0.2), s.paintRadius, b.team, { seed: Math.random() });
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2, r = s.paintRadius * (0.6 + Math.random() * 0.4);
      area += G.paint.splat(_v.set(c.x + Math.cos(a) * r, c.y + 0.5, c.z + Math.sin(a) * r), 0.7 + Math.random() * 0.5, b.team, { seed: Math.random() });
    }
    b.owner.addTurf(area);
    G.fx?.explosion(c, G.teamColors[b.team], s.radius);
    G.audio?.play('bomb_explode', { pos: c });
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
    const loop = G.audio?.loop('storm_rain', { pos: group.position, volume: 0.6 });
    this.clouds.push({ owner: b.owner, team: b.team, group, t: 0, dur: sp.duration, dir: b.dir, rainT: 0, loop, groundY });
    G.audio?.play('storm_thunder', { pos: group.position });
    emit('storm:start', { pos: group.position.clone(), team: b.team, actor: b.owner, radius: sp.radius });
  }

  // ---- damage routing
  applyHit(attacker, victim, dmg, weaponId) {
    if (!victim.alive || victim.team === attacker.team) return;
    const killed = victim.damage(dmg, attacker, weaponId);
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
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.delay > 0) { p.delay -= dt; if (p.delay > 0) continue; }   // poured waves: later globs leave a beat later
      p.age += dt;
      p.prev.copy(p.pos);
      if (p.age > p.straight) p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(1 - p.drag * dt * (p.age > p.straight ? 1 : 0));
      p.pos.addScaledVector(p.vel, dt);
      let dead = false;
      // actors
      for (const e of G.actors) {
        if (e.team === p.team || !e.alive) continue;
        const h = e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height;
        if (Math.abs(e.pos.x - p.pos.x) > 3 || Math.abs(e.pos.z - p.pos.z) > 3) continue;
        Physics.segmentCapsuleDist(p.prev, p.pos, hitBase(e), PLAYER.radius, h, _res);
        // generous hitbox: the whole visible body plus the blob's own radius
        if (_res.dist < PLAYER.radius * 0.95 + p.size) {
          _v.copy(p.prev).lerp(p.pos, _res.t);
          let dmg = p.damage;
          if (p.type === 'drop') dmg = lerp(p.damage, p.dmgFar, clamp(p.start.distanceTo(_v) / 7, 0, 1));
          if (p.vol) { if (p.vol.hits.includes(e)) dmg = 0; else p.vol.hits.push(e); }
          if (dmg > 0) this.applyHit(p.owner, e, dmg, p.wid || p.type);
          G.fx?.burst(_v, _v2.copy(p.vel).normalize().negate(), p.owner.color, { count: 6, speed: 3, size: 0.07 });
          if (p.type !== 'blast') emit('weapon:impact', { pos: _v.clone(), normal: _v2.clone(), team: p.team, kind: p.type === 'drop' || p.type === 'slosh' ? 'drop' : 'shot', radius: p.radius * 0.5, victim: e });
          if (p.type === 'blast') this._blastBurst(p, _v, e);
          if (p.type === 'slosh' && p.head) this._sloshSplash(p, _v, e);
          dead = true; break;
        }
      }
      // world
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
          if (g.hit) p.owner.addTurf(G.paint.splat(_v.copy(g.point).addScaledVector(g.normal, 0.1), p.trailRadius * (0.8 + Math.random() * 0.4), p.team, { seed: Math.random() }));
        }
      }
      if (!dead && p.age > p.life) {
        if (p.type === 'blast') this._blastBurst(p, p.pos, null);
        dead = true;
      }
      if (!dead && p.pos.y < PLAYER.waterY - 1.8) dead = true;
      if (dead) { list[i] = list[list.length - 1]; list.pop(); this.pool.push(p); }
    }
    this._updateBombs(dt);
    this._updateClouds(dt);
    this._updateBeams(dt);
    this._draw();
  }

  _impact(p, hit) {
    _v.copy(hit.point).addScaledVector(hit.normal, 0.14);
    _dir.copy(p.vel).normalize();
    const rad = p.radius * (0.85 + Math.random() * 0.3);
    let area;
    if (p.type === 'slosh') {
      // the wave lands as a thick stripe along its travel: stretched along the horizontal heading
      _dir.y = 0; if (_dir.lengthSq() < 1e-4) _dir.set(0, 0, 1); _dir.normalize();
      area = G.paint.splat(_v, rad * 1.12, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 1.25 });
      if (p.head) this._sloshSplash(p, hit.point, null);
    } else area = G.paint.splat(_v, rad, p.team, { seed: p.seed, stretch: _dir, stretchAmt: 0.7 });
    p.owner.addTurf(area);
    if (p.type !== 'blast') emit('weapon:impact', { pos: hit.point.clone(), normal: hit.normal.clone(), team: p.team, kind: p.type === 'drop' || p.type === 'slosh' ? 'drop' : 'shot', radius: rad });
    const near = p.owner.isLocal || G.camera.position.distanceToSquared(hit.point) < 22 * 22;
    if (near) {
      G.fx?.burst(hit.point, hit.normal, p.owner.color, { count: p.type === 'blast' ? 14 : 5, speed: p.type === 'blast' ? 5 : 3, size: 0.07, paint: false });
      if (Math.random() < (p.type === 'shot' ? 0.45 : 1)) G.audio?.play(p.type === 'blast' ? 'splat_big' : 'splat_small', { pos: hit.point, volume: p.type === 'shot' ? 0.35 : 0.6 });
    }
    if (p.type === 'blast') this._blastBurst(p, hit.point, null);
  }

  _blastBurst(p, at, direct) {
    const w = WEAPONS.blaster;
    const c = at.clone();
    G.fx?.explosion(c, p.owner.color, w.burstRadius);
    G.audio?.play('blaster_boom', { pos: c, volume: 0.7 });
    emit('weapon:impact', { pos: c.clone(), normal: new THREE.Vector3(0, 1, 0), team: p.team, kind: 'blast', radius: w.burstRadius });
    // paint under the burst
    const g = G.physics.raycast(_v2.copy(c).setY(c.y + 0.2), DOWN, 3.5, _hit2);
    if (g.hit) p.owner.addTurf(G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.impactRadius, p.team, { seed: Math.random() }));
    for (const e of G.actors) {
      if (e.team === p.team || !e.alive || e === direct) continue;
      _v.copy(e.pos); _v.y += 0.7;
      const d = _v.distanceTo(c);
      if (d > w.splashRadius) continue;
      if (!G.physics.los(c, _v)) continue;
      this.applyHit(p.owner, e, lerp(w.splashDamageMax, w.splashDamageMin, d / w.splashRadius), 'blaster');
    }
  }

  _updateBombs(dt) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.age += dt;
      b.vel.y -= 24 * dt;
      _v.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      const hit = G.physics.segment(_v, b.pos, _hit);
      if (hit.hit) {
        if (b.kind === 'storm') { this._spawnCloud(b); this.scene.remove(b.mesh); this.bombs.splice(i, 1); continue; }
        b.pos.copy(hit.point).addScaledVector(hit.normal, 0.21);
        const vn = b.vel.dot(hit.normal);
        b.vel.addScaledVector(hit.normal, -vn * 1.35);
        b.vel.multiplyScalar(hit.normal.y > 0.6 ? 0.45 : 0.6);
        if (hit.normal.y > 0.6 && b.fuse < 0) {
          b.fuse = SUB.bomb.fuse;
          G.audio?.play('bomb_beep', { pos: b.pos, volume: 0.6 });
          emit('bomb:arm', { actor: b.owner, pos: b.pos.clone(), team: b.team, radius: SUB.bomb.radius });
        }
      }
      if (b.kind === 'storm' && b.age > 1.1) { this._spawnCloud(b); this.scene.remove(b.mesh); this.bombs.splice(i, 1); continue; }
      if (b.fuse >= 0) {
        b.fuse -= dt;
        b.beepT -= dt;
        const k = 1 - b.fuse / SUB.bomb.fuse;
        b.body.material.emissiveIntensity = (Math.sin(b.age * (10 + k * 30)) * 0.5 + 0.5) * (0.4 + k * 1.8);
        b.mesh.scale.setScalar(1 + k * 0.35 + Math.sin(b.age * 40) * 0.03 * k);
        if (b.beepT <= 0) {
          b.beepT = 0.3 - k * 0.2;
          if (G.camera.position.distanceToSquared(b.pos) < 30 * 30) G.audio?.play('bomb_beep', { pos: b.pos, volume: 0.35 + k * 0.4, pitch: 1 + k * 0.25 });
        }
        if (b.fuse <= 0) { this._explodeBomb(b); this.scene.remove(b.mesh); this.bombs.splice(i, 1); continue; }
      }
      if (b.pos.y < PLAYER.waterY - 1.8) { this.scene.remove(b.mesh); this.bombs.splice(i, 1); continue; }
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.x += b.spin.x * dt * (b.fuse < 0 ? 1 : 0.2);
      b.mesh.rotation.z += b.spin.y * dt * (b.fuse < 0 ? 1 : 0.2);
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
          if (g.hit) c.owner.addTurf(G.paint.splat(_v2.copy(g.point).addScaledVector(g.normal, 0.1), 0.45 + Math.random() * 0.35, c.team, { seed: Math.random() }));
        }
        for (const e of G.actors) {
          if (e.team === c.team || !e.alive) continue;
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
    // charger laser sights (every charging actor, so you can read where enemy snipers are aiming)
    for (const a of G.actors) {
      const on = a.alive && a.weaponRunner.charging && a.weapon.kind === 'charger';
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
    if (!show || !a || !a.alive) { this.arcLine.visible = false; this.arcRing.visible = false; return; }
    const vel = this._arcVel || (this._arcVel = new THREE.Vector3());
    this.throwVelocity(a, SUB.bomb.throwSpeed, vel);
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
    const col = a.ink >= SUB.bomb.inkCost ? a.color : new THREE.Color(0.6, 0.6, 0.6);
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
      const ns = p.sats || 0;
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
