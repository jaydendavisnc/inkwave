// INKWAVE — gameplay → VFX glue (Stream 5). main.js calls `initFxHooks(G)` once at boot and `hooks.update(dt)` every
// unpaused frame. Discrete moments come from the event bus (docs/EVENTS.md); continuous effects poll actor / projectile
// state. Every event has a state-polling fallback that switches itself off the first time the real event is seen, so
// the effects work whether or not a given event is emitted yet. The recipes themselves live in fx.js.
//
// Systems: footsteps (own ink / enemy ink / dry dust), landings, jump-off, kid⇄squid pops, dive/emerge splashes, swim
// bubbles, wall-climb drips + ledge pops, enemy-ink sizzle, damage drips, hit splashes, splat ghosts + sea splashes,
// shot mist trails, blaster / charger / roller-flick muzzle extras, charger charge glow + full-charge sparkle + laser dot
// + beam trail/impact, roller spray, bomb trails / bounces / danger zones / beep pulses, Tidal Slam launch / charge /
// fall streaks / shockwaves, Ink Tempest start / puddles / flashes, super-jump charge / launch / trail / landing marker /
// landing splash, spawn-pad pulses, special-ready sparkles, dry-fire wisps, shots plopping into the sea; ambient sea
// spray on the deck edges and drifting gull feathers (+ the GPU dust motes inside fx.js).
// Ink stays ink: flying droplets that land leave a speck in the paint atlas (fx.onSpeck → paint.speck) and every
// splash / footstep / dive ripples the ink surface itself (fx.onRipple → paint.ripple) instead of drawing decals.
import * as THREE from 'three';
import { on } from '../core/ctx.js';
import { PLAYER, SUB, SPECIALS, WEAPONS } from '../config.js';
import { Hit } from '../game/physics.js';

export function initFxHooks(G) { return new FxHooks(G); }

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _dir = new THREE.Vector3();
const _n = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), ZAX = new THREE.Vector3(0, 0, 1);
const TAU = Math.PI * 2;
const rand = Math.random;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const FIRE_KEY = { shooter: 'fire:shooter', blaster: 'fire:blaster', charger: 'fire:charger', roller: 'fire:roller' };
const IMPACT_KEY = { shot: 'impact:shot', blast: 'impact:blast', drop: 'impact:drop', charger: 'impact:charger', roll: 'impact:roll' };

class FxHooks {
  constructor(G) {
    this.G = G;
    this.seen = Object.create(null);     // events that actually fired → their polling fallbacks switch off
    this.st = new Map();                 // actor → per-actor state
    this.bombs = new Map();              // bomb record → { gp, gn, beepT, vy, stamp }
    this.clouds = new Map();             // storm cloud → { stamp, puddleT, flashT }
    this.seenBeams = new WeakSet();
    this.hit = new Hit(); this.hit2 = new Hit();
    this.time = 0; this.stamp = 0;
    this.count = Object.create(null);    // per-system trigger counters (audits: __inkwave.fxHooks.stats())
    this.edges = []; this.edgeLevel = null;
    this.sprayT = 0; this.featherT = 4 + rand() * 6;
    this.flickT = new Map();
    this.enabled = true;
    this._sp = new THREE.Vector3();
    this.heads = new Map();              // slosh wave head globs in flight → last seen { x, y, z, vx, vz, t, team, color }
    this.dropHits = [];                  // recent 'drop' impacts (pos, normal, time) — to find where a head glob landed
    if (G.fx) {
      G.fx.onSpeck = (p, n, col, size) => {
        const P = this.G.paint, t = this._teamOf(col);
        if (!P || t < 0 || size < 0.014) return;
        P.speck?.(this._sp.copy(p).addScaledVector(n, 0.04), Math.min(0.11, size * 1.7), t);
      };
      G.fx.onRipple = (p, amp, wl, speed, life) => this.G.paint?.ripple?.(p, amp, wl, speed, life);
    }
    const sub = (name, fn) => on(name, (e) => { this.seen[name] = true; if (!this.enabled || !G.fx || !e) return; try { fn(e); } catch (err) { console.warn('[fxHooks]', name, err); } });
    sub('actor:footstep', (e) => this._footstep(e.actor, e.pos, e.surface, e.speed));
    sub('actor:land', (e) => this._land(e.actor, e.pos || e.actor.pos, e.speed, e.surface));
    sub('actor:jump', (e) => this._jump(e.actor, e.surface, e.swim));
    sub('actor:form', (e) => this._form(e.actor, e.form, e.surface));
    sub('actor:dive', (e) => this._dive(e.actor, e.pos || e.actor.pos, e.speed || 0));
    sub('actor:emerge', (e) => this._emerge(e.actor, e.pos || e.actor.pos, e.speed || 0));
    sub('actor:climb', (e) => this._climb(e.actor, e.on));
    sub('actor:enemyInk', (e) => this._enemyInk(e.actor, e.on));
    sub('hit', (e) => this._hit(e));
    sub('splatted', (e) => this._splatted(e));
    sub('respawn', (e) => this._respawn(e.actor));
    sub('special:ready', (e) => this._specialReady(e.actor));
    sub('special:use', (e) => this._specialUse(e.actor, e.id));
    sub('special:slam', (e) => this._slam(e.actor, e.pos || e.actor.pos, e.radius));
    sub('superjump', (e) => this._superjump(e.actor, e.phase));
    sub('superjump:land', (e) => this._sjLand(e.actor, e.pos || e.actor.pos));
    sub('lowink', (e) => this._dryFire(e.actor));
    sub('weapon:fire', (e) => this._weaponFire(e));
    sub('weapon:impact', (e) => this._impact(e));
    sub('weapon:dodge', (e) => this._dodge(e));
    sub('storm:start', (e) => this._stormStart(e.pos, e.team));
    sub('bomb:explode', () => {});   // explosion() is drawn by weapons.js; polling handles danger rings + beeps
  }

  // ------------------------------------------------------------------ helpers
  get fx() { return this.G.fx; }
  _bump(k) { this.count[k] = (this.count[k] || 0) + 1; }
  _near(p, d) { const c = this.G.camera; return !!c && c.position.distanceToSquared(p) < d * d; }
  _state(a) {
    let s = this.st.get(a);
    if (!s) {
      s = { init: false, born: -9, grounded: true, vy: 0, form: 'kid', sub: false, climb: false, alive: a.alive, onEnemy: false,
        stepAcc: 0, foot: 0, dripT: 0, sparkT: 0, sizzleT: 0, climbT: 0, bubbleT: 0, full: false, sj: null, sp: null, spT: 0,
        sjLand: -9, hitT: -9, dryT: -9, climbEnd: -9, slamPending: false, lastSJTo: new THREE.Vector3(), vis: new THREE.Vector3(),
        swimYaw: null, carveT: 0, emergeT: -9, wetT: 0, spinFull: false, dodging: false, dodgeDir: new THREE.Vector3(0, 0, 1) };
      this.st.set(a, s);
    }
    return s;
  }
  _visual(a, out) { return a.visualPos ? a.visualPos(out) : out.copy(a.pos); }
  _heading(a, out) {
    const hs = Math.hypot(a.vel.x, a.vel.z);
    if (hs > 0.2) return out.set(a.vel.x / hs, 0, a.vel.z / hs);
    return out.set(Math.sin(a.yaw), 0, Math.cos(a.yaw));
  }
  _inkColor(a, surface) { return surface === 2 ? this.G.teamColors[a.enemyTeam] : a.color; }
  _teamOf(c) {
    const T = this.G.teamColors;
    if (!T || !c) return -1;
    for (let t = 0; t < 2; t++) { const k = T[t]; if (k && Math.abs(k.r - c.r) + Math.abs(k.g - c.g) + Math.abs(k.b - c.b) < 0.05) return t; }
    return -1;
  }
  _fresh(a) { const s = this._state(a); return this.time - s.born < 0.35 || !s.init; }

  // ------------------------------------------------------------------ discrete moments
  _footstep(a, pos, surface = 0, speed) {
    if (!a || !a.alive || !pos || !this._near(pos, surface ? 28 : 18)) return;
    const hs = speed ?? Math.hypot(a.vel.x, a.vel.z);
    this.fx.footstep?.(pos, this._inkColor(a, surface), surface, this._heading(a, _dir), hs);
    this._bump('footstep');
  }
  _land(a, pos, speed = 8, surface = 0) {
    if (!a || !a.alive || speed < 3.5) return;
    const s = this._state(a);
    if (a.specialActive || a.superJumpState || this.time - s.sjLand < 0.3 || !this._near(pos, 38)) return;
    if (a.form === 'squid' && surface === 1) return;          // squid landing in own ink = a dive (actor:dive)
    this.fx.land?.(pos, this._inkColor(a, surface), surface, speed);
    this._bump('land');
  }
  _jump(a, surface = 0, swim = false) {
    if (!a || swim || a.superJumpState || !this._near(a.pos, 30)) return;   // swim jumps: actor:emerge splashes
    this.fx.jumpOff?.(this._visual(a, _v), this._inkColor(a, surface), surface, false);
    this._bump('jump');
  }
  _form(a, form, surface = 0) {
    if (!a || !a.alive || this._fresh(a) || a.superJumpState || a.specialActive) return;
    if (surface === 1) return;                                 // in own ink the dive / emerge splash covers it
    if (!this._near(a.pos, 26)) return;
    this.fx.formPop?.(this._visual(a, _v), a.color, form === 'squid', false);
    this._bump('form');
  }
  _dive(a, pos, speed) {
    if (!a || !a.alive || this._fresh(a) || !this._near(pos, 30)) return;
    if (a.climbing) { this._climb(a, true); return; }
    this.fx.dive?.(pos, a.color, speed);
    this._bump('dive');
  }
  _emerge(a, pos, speed) {
    if (!a || !a.alive || this._fresh(a) || a.superJumpState || !this._near(pos, 30)) return;
    const s = this._state(a);
    if (s.climb || this.time - s.climbEnd < 0.25) { this.fx.climbPop?.(pos, this._heading(a, _dir), a.color); this._bump('climbPop'); return; }
    this.fx.emerge?.(pos, a.color, speed);
    s.emergeT = this.time;   // the kid comes up wet: a few drips run off for half a second
    this._bump('emerge');
  }
  _climb(a, onWall) {
    const s = this._state(a);
    if (!onWall && s.climb) s.climbEnd = this.time;
    s.climb = !!onWall;
    if (!onWall || !a.alive || !this._near(a.pos, 26)) return;
    const n = a.anim?.wallNormal;
    if (!n || n.lengthSq() < 0.5) return;
    _v.copy(a.pos); _v.y += 0.35;
    for (let i = 0; i < 3; i++) this.fx.climbDrip?.(_v, n, a.color);
    this.fx.ring?.(_v2.copy(_v).addScaledVector(n, 0.03), n, a.color, { radius: 0.55, life: 0.3, style: 0, alpha: 0.9 });
    this._bump('climbStart');
  }
  _enemyInk(a, onInk) {
    this._state(a).onEnemy = !!onInk;
    if (!onInk || !a.alive || this._fresh(a) || !this._near(a.pos, 22)) return;
    const col = this.G.teamColors[a.enemyTeam];
    this.fx.footstep?.(a.pos, col, 2, this._heading(a, _dir), 4);
    this._bump('enemyInk');
  }
  _hit({ attacker, victim, damage, killed }) {
    if (!attacker || !victim || killed || damage <= 0 || !victim.alive) return;
    const s = this._state(victim);
    if (this.time - s.hitT < 0.05 || !this._near(victim.pos, 40)) return;
    s.hitT = this.time;
    _v.copy(victim.pos); _v.y += victim.form === 'squid' ? 0.3 : 0.95;
    _dir.copy(victim.pos).sub(attacker.pos); _dir.y = 0;
    if (_dir.lengthSq() < 1e-4) _dir.set(0, 0, 1);
    _dir.normalize();
    this.fx.hitSplash?.(_v, _dir, attacker.color, damage, false);
    this._bump('hit');
  }
  _splatted({ victim, cause }) {
    if (!victim) return;
    if (cause === 'water') { this.fx.waterSplash?.(victim.pos, 1.1); this._bump('seaSplat'); }
    this.fx.ghost?.(_v.copy(victim.pos).setY(Math.max(victim.pos.y, PLAYER.waterY + 0.2)), victim.color);
    this._bump('ghost');
  }
  _respawn(a) {
    const s = this._state(a);
    s.born = this.time; s.init = true; s.full = false; s.sj = null; s.sp = null;
    this.G.game?.decor?.pulse?.(a.team, 1);
    this._bump('respawn');
  }
  _specialReady(a) {
    if (!a || !a.alive || !this._near(a.pos, 40)) return;
    this._visual(a, _v);
    for (let i = 0; i < 10; i++) this.fx.specialSparkle?.(_v, a.color, a.form === 'squid' ? 0.6 : 1.6);
    this.fx.ring?.(_v2.copy(_v).setY(_v.y + 0.03), UP, a.color, { radius: 1.3, life: 0.45, style: 7, alpha: 0.8 });
    this._bump('specialReady');
  }
  _specialUse(a, id) {
    const s = this._state(a);
    s.sp = id; s.spT = 0;
    if (id === 'slam') { this.fx.slamLaunch?.(a.pos, a.color); this._bump('slamLaunch'); }
  }
  _slam(a, pos, radius) {
    if (!a) return;
    const s = this._state(a);
    s.sp = null; s.slamPending = false;
    this.fx.slamWave?.(pos, a.color, radius || SPECIALS.slam.radius);
    this._bump('slamWave');
  }
  _superjump(a, phase) {
    const s = this._state(a);
    s.sj = phase;
    if (phase === 'flight') { this.fx.superJumpLaunch?.(a.pos, a.color); this._bump('sjLaunch'); }
  }
  _sjLand(a, pos) {
    const s = this._state(a);
    s.sj = null; s.sjLand = this.time;
    this.fx.superJumpLand?.(pos, a.color);
    const pad = this.G.level?.spawnPads?.[a.team];
    if (pad && Math.hypot(pos.x - pad.x, pos.z - pad.z) < 3.5) this.G.game?.decor?.pulse?.(a.team, 0.8);
    this._bump('sjLand');
  }
  _dryFire(a) {
    if (!a || !a.alive || a.form === 'squid') return;
    const s = this._state(a);
    if (this.time - s.dryT < 0.4) return;
    s.dryT = this.time;
    a.character?.getMuzzle?.(_v);
    if (!Number.isFinite(_v.x)) return;
    this.fx.dryFire?.(_v, a.aimDir || _dir.set(0, 0, 1));
    this._bump('dryFire');
  }
  _weaponFire(e) {
    const a = e.actor; if (!a || !e.muzzle) return;
    const kind = (e.weapon && (e.weapon.kind || e.weapon)) || a.weapon?.kind;
    const dir = e.dir || a.aimDir;
    if (kind === 'blaster') this.fx.muzzle?.(e.muzzle, dir, a.color, 'blaster');
    else if (kind === 'charger') this.fx.muzzle?.(e.muzzle, dir, a.color, 'charger');
    else if (kind === 'roller' || kind === 'bucket' || kind === 'brush') this._flick(a);
    this._bump(FIRE_KEY[kind] || 'fire:other');
  }
  _impact(e) {
    if (!e.pos || !this._near(e.pos, 32)) return;
    const col = this.G.teamColors[e.team] || _c.set(0xffffff);
    const n = e.normal || UP;
    // shots / flick drops: weapons.js already bursts the splash (fx.burst) and the paint system ripples the ink —
    // nothing is stacked on top here (no decal blots)
    if (e.kind === 'charger') this.fx.beamImpact?.(e.pos, n, col, 1);
    if (e.kind === 'drop' && !e.victim) {
      const H = this.dropHits;
      if (H.length >= 24) H.shift();
      H.push({ x: e.pos.x, y: e.pos.y, z: e.pos.z, nx: n.x, ny: n.y, nz: n.z, t: this.time });
    }
    this._bump(IMPACT_KEY[e.kind] || 'impact:other');
  }
  _stormStart(pos, team) {
    if (!pos) return;
    this.fx.stormStart?.(pos, this.G.teamColors[team] || _c.set(0xffffff), SPECIALS.storm.radius);
    this._bump('stormStart');
  }
  _flick(a) {
    const last = this.flickT.get(a) || -9;
    if (this.time - last < 0.25) return;
    this.flickT.set(a, this.time);
    if (!this._near(a.pos, 34)) return;
    _v.copy(a.pos); _v.y += 1.05;
    _dir.set(Math.sin(a.yaw), 0, Math.cos(a.yaw));
    this.fx.flickCurtain?.(_v, _dir, a.color, a.weapon?.flickSpreadDeg || 50);
    this._bump('flick');
  }

  // dualies dodge roll: push-off splash (the skid + plant are driven per frame from the runner's dodge state)
  _dodge(e) {
    const a = e.actor;
    if (!a || !a.alive || !e.pos || !e.dir) return;
    const s = this._state(a);
    s.dodgeDir.set(e.dir.x, 0, e.dir.z);
    if (s.dodgeDir.lengthSq() < 1e-4) s.dodgeDir.set(Math.sin(a.yaw), 0, Math.cos(a.yaw));
    s.dodgeDir.normalize();
    if (!this._near(e.pos, 34)) return;
    this.fx.dodgeSplash?.(e.pos, s.dodgeDir, a.color);
    this._bump('dodge');
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const G = this.G, fx = G.fx;
    if (!fx || !this.enabled || !(dt > 0)) return;
    this.time += dt; this.stamp++;
    if (G.paint && G.camera && G.paint.viewPos !== G.camera.position) G.paint.setView?.(G.camera.position);
    if (G.actors) for (let i = 0; i < G.actors.length; i++) this._actor(G.actors[i], dt);
    const P = G.projectiles;
    if (P) {
      this._projectiles(P, dt);
      this._bombs(P, dt);
      this._clouds(P, dt);
      this._beams(P);
    }
    this._ambient(dt);
  }

  _actor(a, dt) {
    const fx = this.fx, s = this._state(a);
    const an = a.anim || {};
    if (!a.alive) { s.alive = false; s.stepAcc = 0; s.full = false; return; }
    if (!s.alive) { s.alive = true; s.born = this.time; }
    const pos = this._visual(a, s.vis);
    const near = this._near(pos, 36);
    const hs = Math.hypot(a.vel.x, a.vel.z);
    const form = an.form || 'kid';
    if (!s.init) { s.init = true; s.grounded = a.grounded; s.vy = a.vel.y; s.form = form; s.sub = form === 'swim' || form === 'climb'; s.born = this.time; return; }

    // ---- polling fallbacks for events that may not be emitted (each disables itself once the event is seen)
    if (!this.seen['actor:land'] && a.grounded && !s.grounded && s.vy < -3.5) this._land(a, a.pos, -s.vy, a.groundTeam);
    if (!this.seen['actor:jump'] && !a.grounded && s.grounded && a.vel.y > 4 && !a.superJumpState) this._jump(a, a.groundTeam, s.form === 'swim');
    const sub = form === 'swim' || form === 'climb';
    if (!this.seen['actor:dive'] && sub && !s.sub) this._dive(a, a.pos, hs);
    if (!this.seen['actor:emerge'] && !sub && s.sub) this._emerge(a, a.pos, hs);
    if (!this.seen['actor:climb'] && (form === 'climb') !== s.climb) this._climb(a, form === 'climb');
    const kidForm = form === 'kid' ? 'kid' : 'squid', prevKid = s.form === 'kid' ? 'kid' : 'squid';
    if (!this.seen['actor:form'] && kidForm !== prevKid) this._form(a, kidForm, a.groundTeam);
    // footsteps from stride distance until character.js emits real foot plants
    if (!this.seen['actor:footstep'] && form === 'kid' && a.grounded && hs > 1.2 && !a.superJumpState && !a.specialActive && near) {
      s.stepAcc += hs * dt;
      const stride = 0.45 + 0.12 * hs;
      if (s.stepAcc >= stride) {
        s.stepAcc -= stride;
        s.foot ^= 1;
        const bone = a.character?.bones?.[s.foot ? 'footR' : 'footL'];
        if (bone) { bone.getWorldPosition(_v2); _v2.y = pos.y; } else _v2.copy(pos);
        if (Number.isFinite(_v2.x)) this._footstep(a, _v2, a.groundTeam, hs);
      }
    } else if (hs <= 1.2) s.stepAcc = 0.3;

    // ---- continuous effects
    if (near) {
      const col = a.color;
      // wall climb drips
      if (form === 'climb' && an.wallNormal) {
        s.climbT += dt;
        if (s.climbT > 0.07) { s.climbT = 0; _v.copy(pos); _v.y += 0.3; fx.climbDrip?.(_v, an.wallNormal, col); }
      }
      // carving a hard turn in the ink: throw a fan off the outside of the turn
      if (form === 'swim' && hs > 4.5) {
        const yaw = Math.atan2(a.vel.x, a.vel.z);
        if (s.swimYaw !== null && dt > 0) {
          let dy = yaw - s.swimYaw; dy -= Math.round(dy / TAU) * TAU;
          const rate = dy / dt;
          s.carveT += dt * clamp((Math.abs(rate) - 3.2) / 5, 0, 1) * 22;
          if (s.carveT >= 1) {
            s.carveT = 0;
            _dir.set(a.vel.x / hs, 0, a.vel.z / hs);
            const sg = rate > 0 ? -1 : 1;   // positive yaw rate turns toward the right vector: spray flies left
            _v.set(_dir.z * sg, 0, -_dir.x * sg);
            this.fx.swimCarve?.(pos, _dir, _v, col, clamp(hs / 11.8, 0, 1));
          }
        }
        s.swimYaw = yaw;
      } else { s.swimYaw = null; s.carveT = 0; }
      // just emerged: drips run off the body
      if (form === 'kid' && this.time - s.emergeT < 0.5) {
        s.wetT += dt * 26 * (1 - (this.time - s.emergeT) / 0.5);
        while (s.wetT >= 1) {
          s.wetT -= 1;
          const ang = rand() * TAU, r = 0.14 + rand() * 0.08;
          _v.set(pos.x + Math.cos(ang) * r, pos.y + 0.35 + rand() * 0.8, pos.z + Math.sin(ang) * r);
          fx.hurtDrip?.(_v, col, 0.03);
        }
      } else s.wetT = 0;
      // idle swimming: bubbles
      if (form === 'swim' && hs < 2) {
        s.bubbleT += dt;
        if (s.bubbleT > 0.35) { s.bubbleT = 0; fx.bubbles?.(pos, col, 1); }
      }
      // enemy ink under a kid: sticky sizzle
      const onEnemy = a.onEnemy !== undefined ? a.onEnemy : (a.grounded && a.groundTeam === 2 && form === 'kid');
      if (onEnemy && this._near(pos, 22)) {
        s.sizzleT += dt;
        if (s.sizzleT > 0.11) { s.sizzleT = 0; fx.enemyInkSizzle?.(pos, this.G.teamColors[a.enemyTeam]); }
      }
      // damage: enemy-ink drips off the body
      const hurt = 1 - a.hp / PLAYER.hp;
      if (hurt > 0.08 && !a.superJumpState) {
        s.dripT += dt * hurt * 7;
        while (s.dripT >= 1) {
          s.dripT -= 1;
          const sq = form !== 'kid';
          const ang = rand() * TAU, r = sq ? 0.12 : 0.16 + rand() * 0.06;
          _v.set(pos.x + Math.cos(ang) * r, pos.y + (sq ? 0.15 + rand() * 0.2 : 0.55 + rand() * 0.75), pos.z + Math.sin(ang) * r);
          fx.hurtDrip?.(_v, this.G.teamColors[a.enemyTeam], 0.026 + hurt * 0.02);
        }
      } else s.dripT = 0;
      // special gauge full: sparkles swirl around the character
      if (a.specialReady && a.specialReady() && !a.superJumpState) {
        s.sparkT += dt * (a.isLocal ? 12 : 9);
        while (s.sparkT >= 1) { s.sparkT -= 1; fx.specialSparkle?.(pos, col, form === 'kid' ? 1.55 : 0.55); }
      }
      // weapons: charger glow / laser / roller spray
      const wr = a.weaponRunner;
      if (wr) {
        const wk = a.weapon?.kind ?? 'charger';
        // charger + spinner only — the splatling's spin-up also sets `charging` but has its own tells
        if (wr.charging && form === 'kid' && (wk === 'charger' || wk === 'spinner')) {
          a.character?.getMuzzle?.(_v);
          if (Number.isFinite(_v.x)) {
            fx.chargeGlow?.(_v, col, wr.charge);
            if (wr.charge >= 0.999 && !s.full) { s.full = true; fx.chargeFull?.(_v, col); this._bump('chargeFull'); }
          }
        } else s.full = false;
        // splatling: glow + ink slung off the barrels while spinning up, one crisp "full" cue, a steady sling while
        // streaming (burstFrac = stream left)
        if (wk === 'splatling' && form === 'kid' && (wr.charging || wr.streaming)) {
          a.character?.getMuzzle?.(_v);
          if (Number.isFinite(_v.x)) {
            const aim = a.aimDir || _dir.set(Math.sin(a.yaw), 0, Math.cos(a.yaw));
            if (wr.charging) {
              fx.spinUp?.(_v, aim, col, wr.charge, false);
              if (wr.charge >= 0.999 && !s.spinFull) { s.spinFull = true; fx.spinFull?.(_v, aim, col); this._bump('spinFull'); }
            } else fx.spinUp?.(_v, aim, col, 0.35 + 0.65 * (wr.burstFrac || 0), true);
          }
        } else if (!wr.charging) s.spinFull = false;
        // dualies: skid spray + body fling through the roll, a squelch when it plants
        if (wr.dodge) {
          if (!s.dodging) { s.dodging = true; if (s.dodgeDir.lengthSq() < 0.5) s.dodgeDir.set(Math.sin(a.yaw), 0, Math.cos(a.yaw)); }
          fx.dodgeSkid?.(pos, s.dodgeDir, col, wr.dodge.dur ? wr.dodge.t / wr.dodge.dur : 0);
        } else if (s.dodging) {
          s.dodging = false;
          fx.dodgePlant?.(pos, s.dodgeDir, col);
          this._bump('dodgePlant');
        }
        if (wr.rolling && a.grounded && hs > 0.8) {
          const w = a.weapon || WEAPONS.roller;
          _dir.set(Math.sin(a.yaw), 0, Math.cos(a.yaw));
          _v.set(pos.x + _dir.x * 0.85, pos.y, pos.z + _dir.z * 0.85);
          fx.rollerSpray?.(_v, _dir, w.rollWidth || 1.1, col, clamp(hs / (w.rollSpeed || 5), 0, 1));
        }
      }
    }
    // ---- specials (drawn at any distance: they are big readable moments)
    const sa = a.specialActive;
    if (sa && sa.id === 'slam') {
      if (sa.phase === 'hang') { _v.copy(pos); _v.y += 0.8; this.fx.slamCharge?.(_v, a.color, clamp(sa.t / (SPECIALS.slam.hang || 0.25), 0, 1)); }
      else if (sa.phase === 'fall') this.fx.slamFall?.(pos, a.color);
      else if (sa.phase === 'rise') this.fx.superJumpTrail?.(_v.copy(pos).setY(pos.y + 0.5), a.vel, a.color);
      if (!this.seen['special:slam']) s.slamPending = true;
    } else if (s.slamPending) {
      s.slamPending = false;
      this._slam(a, a.pos, SPECIALS.slam.radius);
    }
    // ---- super jump
    const sj = a.superJumpState;
    if (sj) {
      if (sj.phase === 'charge') {
        fx.superJumpCharge?.(pos, a.color, clamp(sj.t / 0.75, 0, 1));
        const tg = sj.target;
        const tp = tg && tg.pos && tg.pos.isVector3 ? (tg.jumpAnchor ? tg.jumpAnchor() : tg.pos) : tg && tg.isVector3 ? tg : null;
        if (tp && !sj.home) fx.jumpMarker?.(tp, a.color, sj.t);   // (home jumps: the return beacon marks it)
      } else if (sj.phase === 'flight') {
        fx.superJumpTrail?.(pos, a.vel, a.color);
        if (sj.to) { if (!sj.home) fx.jumpMarker?.(sj.to, a.color, sj.t); s.lastSJTo.copy(sj.to); }
      }
      if (!this.seen['superjump'] && s.sj !== sj.phase) { if (sj.phase === 'flight') this._superjump(a, 'flight'); else s.sj = sj.phase; }
    } else if (s.sj === 'flight' && !this.seen['superjump:land']) {
      this._sjLand(a, a.pos);
    }
    s.grounded = a.grounded; s.vy = a.vel.y; s.form = form; s.sub = sub;
  }

  // shots: mist trails, muzzle extras for new projectiles (until weapon:fire exists), plops into the sea
  _projectiles(P, dt) {
    const list = P.list;
    if (!list) return;
    const fx = this.fx, wy = PLAYER.waterY;
    let budget = 48;
    const fireFallback = !this.seen['weapon:fire'];
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.owner) continue;
      if (p._fxAge === undefined || p.age < p._fxAge) {
        // new (or recycled) projectile
        p._fxD = 0; p._fxY = p.pos.y;
        if (fireFallback && p.age < 0.1) {
          if (p.type === 'blast' && this._near(p.pos, 34)) { _dir.copy(p.vel).normalize(); fx.muzzle?.(p.start || p.pos, _dir, p.owner.color, 'blaster'); this._bump('fire:blaster'); }
          else if (p.type === 'drop') this._flick(p.owner);
        }
      }
      p._fxAge = p.age;
      const sp = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
      p._fxD += sp * dt;
      const slosh = p.type === 'slosh';
      if (slosh && p.head) {
        let h = this.heads.get(p);
        if (!h) { h = { x: 0, y: 0, z: 0, vx: 0, vz: 1, t: 0, color: null, born: this.time }; this.heads.set(p, h); }
        h.x = p.pos.x; h.y = p.pos.y; h.z = p.pos.z; h.vx = p.vel.x; h.vz = p.vel.z; h.t = this.time; h.color = p.owner.color; h.stamp = this.stamp;
      }
      const step = p.type === 'blast' ? 0.55 : p.type === 'drop' ? 1.1 : slosh ? (p.head ? 0.45 : 1.0) : 0.8;
      if (p._fxD >= step) {
        p._fxD = 0;
        if (budget > 0 && p.age > 0.03 && (p.delay === undefined || p.age > p.delay) && this._near(p.pos, 30)) {
          budget--;
          if (slosh) fx.sloshTrail?.(p.pos, p.vel, p.owner.color, !!p.head); else fx.shotTrail?.(p.pos, p.vel, p.owner.color, p.type === 'blast');
        }
      }
      if (p._fxY >= wy + 0.05 && p.pos.y < wy + 0.05 && this.G.level && this.G.level.groundHeight(p.pos.x, p.pos.z, p.pos.y + 3) === -Infinity) {
        if (this._near(p.pos, 45)) { fx.waterPlop?.(p.pos, p.type === 'blast' ? 0.6 : 0.3); this._bump('plop'); }
      }
      p._fxY = p.pos.y;
    }
    // slosh wave heads that landed since last frame: the heavy slap where their impact was reported
    if (this.heads.size) {
      this.heads.forEach(this._headFn || (this._headFn = (h, p) => {
        if (h.stamp === this.stamp && p.type === 'slosh' && p.head) return;
        this.heads.delete(p);
        const H = this.dropHits;
        for (let i = H.length - 1; i >= 0; i--) {
          const d = H[i];
          if (d.t < h.t - 1e-6) break;
          const dx = d.x - h.x, dy = d.y - h.y, dz = d.z - h.z;
          if (dx * dx + dy * dy + dz * dz > 1.3 * 1.3) continue;
          if (this._near(_v.set(d.x, d.y, d.z), 34)) {
            _n.set(d.nx, d.ny, d.nz); _v2.set(h.vx, 0, h.vz);
            this.fx.sloshImpact?.(_v, _n, _v2, h.color);
            this._bump('sloshHead');
          }
          H.splice(i, 1);
          break;
        }
      }));
    }
  }

  // bombs: flight drips, bounce splashes, danger zone under an armed bomb, a pulse on every beep
  _bombs(P, dt) {
    const bombs = P.bombs;
    if (!bombs) return;
    const fx = this.fx, st = this.stamp;
    const R = SUB.bomb.radius, fuse0 = SUB.bomb.fuse;
    for (let i = 0; i < bombs.length; i++) {
      const b = bombs[i];
      const col = this.G.teamColors[b.team];
      let r = this.bombs.get(b);
      if (!r) { r = { gp: new THREE.Vector3(), gn: new THREE.Vector3(0, 1, 0), ground: false, beepT: b.beepT || 0, vy: b.vel.y, stamp: st, armed: false }; this.bombs.set(b, r); }
      r.stamp = st;
      const near = this._near(b.pos, 40);
      if (b.fuse < 0) {
        if (near) fx.bombTrail?.(b.pos, b.vel, col);
        if (r.vy < -1.5 && b.vel.y > 0.3 && near) { _n.set(0, 1, 0); fx.bounceSplash?.(_v.copy(b.pos).setY(b.pos.y - 0.2), _n, col); this._bump('bombBounce'); }
      } else if (b.kind === 'bomb') {
        if (!r.armed) {
          r.armed = true;
          _v.copy(b.pos); _v.y += 0.3;
          const h = this.G.physics?.raycast(_v, DOWN, 2.5, this.hit, true);
          if (h && h.hit) { r.gp.copy(h.point); r.gn.copy(h.normal); r.ground = true; } else { r.gp.copy(b.pos); r.gp.y -= 0.2; }
          fx.bounceSplash?.(r.gp, r.gn, col);
          this._bump('bombArm');
        }
        const k = clamp(1 - b.fuse / fuse0, 0, 1);
        fx.dangerRing?.(_v.copy(r.gp).addScaledVector(r.gn, 0.02), r.gn, col, R, k);
        if ((b.beepT || 0) > r.beepT + 1e-4) { fx.beepPulse?.(b.mesh?.position || b.pos, r.gp, r.gn, col, R, k); this._bump('bombBeep'); }   // ([sub-view] the glow on the drawn ball's middle)
      }
      r.beepT = b.beepT || 0; r.vy = b.vel.y;
    }
    if (this.bombs.size) this.bombs.forEach(this._bombGC || (this._bombGC = (r, b) => { if (r.stamp !== this.stamp) this.bombs.delete(b); }));
  }

  // Ink Tempest clouds: start puff, puddle ripples + splash crowns under the rain, flickers inside
  _clouds(P, dt) {
    const clouds = P.clouds;
    if (!clouds) return;
    const fx = this.fx, st = this.stamp, R = SPECIALS.storm.radius;
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      const pos = c.group?.position;
      if (!pos) continue;
      const col = this.G.teamColors[c.team];
      let r = this.clouds.get(c);
      if (!r) {
        r = { stamp: st, puddleT: 0, flashT: 0.5 };
        this.clouds.set(c, r);
        if (!this.seen['storm:start']) this._stormStart(pos, c.team);
      }
      r.stamp = st;
      if (!this._near(pos, 45)) continue;
      const fade = c.dur ? clamp((c.dur - c.t) / 0.6, 0, 1) : 1;
      if (c.t > 0.35 && fade > 0.3) fx.rainSheet?.(pos, R * clamp(c.group.scale.x, 0.3, 1), col, dt);
      r.puddleT += dt * 16 * fade;
      while (r.puddleT >= 1) {
        r.puddleT -= 1;
        const a = rand() * TAU, rr = Math.sqrt(rand()) * R * 0.95;
        _v.set(pos.x + Math.cos(a) * rr, pos.y - 0.6, pos.z + Math.sin(a) * rr);
        const h = this.G.physics?.raycast(_v, DOWN, 14, this.hit, true);
        if (h && h.hit) fx.stormPuddle?.(h.point, h.normal, col);
      }
      r.flashT -= dt;
      if (r.flashT <= 0) { r.flashT = 0.5 + rand() * 1.2; fx.stormFlash?.(pos, col, R); }
    }
    if (this.clouds.size) this.clouds.forEach(this._cloudGC || (this._cloudGC = (r, c) => { if (r.stamp !== this.stamp) this.clouds.delete(c); }));
  }

  // charger: laser-sight dot on surfaces while charging, beam trail + impact when a shot is fired
  _beams(P) {
    const fx = this.fx;
    if (P.sights) P.sights.forEach(this._sightFn || (this._sightFn = (s, a) => {
      if (!s.visible || !a.alive || !this._near(s.position, 50)) return;
      _dir.copy(ZAX).applyQuaternion(s.quaternion);
      const len = s.scale.z;
      _v.copy(s.position).addScaledVector(_dir, Math.max(0, len - 0.25));
      const h = this.G.physics?.raycast(_v, _dir, 0.6, this.hit2, true);
      if (h && h.hit) this.fx.laserDot?.(h.point, h.normal, a.color, a.weaponRunner?.charge || 0);
    }));
    if (!P.beams) return;
    for (let i = 0; i < P.beams.length; i++) {
      const b = P.beams[i];
      if (this.seenBeams.has(b)) continue;
      this.seenBeams.add(b);
      const m = b.mesh;
      if (!m) continue;
      _dir.copy(ZAX).applyQuaternion(m.quaternion);
      const len = m.scale.z;
      _v.copy(m.position); _v2.copy(m.position).addScaledVector(_dir, len);
      if (!this._near(_v, 60) && !this._near(_v2, 40)) continue;
      _c.copy(m.material.color).multiplyScalar(1 / 2.2);
      const charge = clamp(((b.th || 0.06) - 0.035) / 0.05, 0, 1);
      fx.beamTrail?.(_v, _v2, _c, charge);
      if (!this.seen['weapon:fire']) fx.muzzle?.(_v, _dir, _c, 'charger');
      if (!this.seen['weapon:impact']) {
        _v3.copy(_v2).addScaledVector(_dir, -0.3);
        const h = this.G.physics?.raycast(_v3, _dir, 0.7, this.hit, true);
        if (h && h.hit) fx.beamImpact?.(h.point, h.normal, _c, charge);
        else fx.hitSplash?.(_v2, _dir, _c, 40 + 60 * charge, false);
      }
      this._bump('beam');
    }
  }

  // ------------------------------------------------------------------ ambient life
  _ambient(dt) {
    const G = this.G, fx = this.fx, cam = G.camera;
    if (!cam) return;
    if (G.level !== this.edgeLevel) this._buildEdges();
    // sea spray bursting against the deck edges: waves slap the edge somewhere in view every ~0.3–0.8 s on the open
    // sea; scaled by the environment's sea state (sheltered marina water ≈ 0.15 → no spray at all)
    const sea = clamp(G.env?.seaState ?? 1, 0, 2);
    this.sprayT -= dt;
    if (sea < 0.3) this.sprayT = Math.max(this.sprayT, 0.3);
    else if (this.sprayT <= 0 && this.edges.length) {
      this.sprayT = (0.3 + rand() * 0.5) / sea;
      cam.getWorldDirection(_dir);
      let best = null, bestS = -1;
      for (let tries = 0; tries < 14; tries++) {
        const e = this.edges[(rand() * this.edges.length) | 0];
        const dx = e.x - cam.position.x, dz = e.z - cam.position.z, d = Math.hypot(dx, dz);
        if (d > 48 || d < 2) continue;
        const facing = (dx * _dir.x + dz * _dir.z) / d;
        if (facing < 0.35) continue;
        const score = facing * (1 - d / 60) + rand() * 0.3;
        if (score > bestS) { bestS = score; best = e; }
      }
      if (best) {
        _v.set(best.x, PLAYER.waterY + 0.05, best.z); _n.set(best.nx, 0, best.nz);
        this.fx.seaSpray?.(_v, _n, (rand() < 0.18 ? 1.3 + rand() * 0.3 : 0.55 + rand() * 0.55) * Math.min(1, sea));
        this._bump('seaSpray');
      }
    }
    // a gull feather now and then, drifting down through the view
    this.featherT -= dt;
    if (this.featherT <= 0) {
      this.featherT = 7 + rand() * 9;
      cam.getWorldDirection(_dir);
      _v.set(cam.position.x + _dir.x * (6 + rand() * 8) + (rand() - 0.5) * 8, cam.position.y + 5 + rand() * 4, cam.position.z + _dir.z * (6 + rand() * 8) + (rand() - 0.5) * 8);
      fx.feather?.(_v);
      this._bump('feather');
    }
  }

  // open-water deck edges (from the environment's deck footprint): candidate points for sea spray
  _buildEdges() {
    const G = this.G;
    this.edgeLevel = G.level;
    this.edges = [];
    // the environment knows the real deck edges (turned slabs included): spray only where a deck meets open water
    if (G.env && typeof G.env.deckEdges === 'function') { const e = G.env.deckEdges(1.6); if (e.length) { this.edges = e; return; } }
    const rects = (G.env && G.env.footprint && G.env.footprint.length ? G.env.footprint : null) || (G.level ? [G.level.bounds] : []);
    // (turned slabs — env.footprint rects with aligned === false: Cargo Terminal — use their own edges, not the AABB)
    const inR = (r, x, z) => (r.aligned !== false ? x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ
      : Math.abs((x - r.cx) * r.ax + (z - r.cz) * r.az) < r.hx && Math.abs((z - r.cz) * r.ax - (x - r.cx) * r.az) < r.hz);
    const inside = (x, z) => rects.some((r) => inR(r, x, z));
    const P = (r, u, v) => [r.cx + u * r.ax - v * r.az, r.cz + u * r.az + v * r.ax];
    for (const r of rects) {
      const q = r.aligned === false ? [P(r, -r.hx, -r.hz), P(r, r.hx, -r.hz), P(r, r.hx, r.hz), P(r, -r.hx, r.hz)] : null;
      const sides = q ? q.map((a, i) => { const c = q[(i + 1) & 3], n = [[r.az, -r.ax], [r.ax, r.az], [-r.az, r.ax], [-r.ax, -r.az]][i]; return [a[0], a[1], c[0], c[1], n[0], n[1]]; }) : [
        [r.minX, r.minZ, r.maxX, r.minZ, 0, -1], [r.maxX, r.minZ, r.maxX, r.maxZ, 1, 0],
        [r.maxX, r.maxZ, r.minX, r.maxZ, 0, 1], [r.minX, r.maxZ, r.minX, r.minZ, -1, 0],
      ];
      for (const [x0, z0, x1, z1, nx, nz] of sides) {
        const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.floor(len / 1.6));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
          if (inside(x + nx * 0.6, z + nz * 0.6)) continue;
          this.edges.push({ x: x + nx * 0.05, z: z + nz * 0.05, nx, nz });
        }
      }
    }
  }

  stats() { return { ...this.count, seen: Object.keys(this.seen).sort() }; }
}
