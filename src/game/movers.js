// Stage movers: set pieces that move on a fixed timetable — Calamari County's railcars shuttling between the two
// halves of its station. Driven by the stage layout (LAYOUT.movers); a match owns one (match.movers), made in setup
// and updated from Match.update before anyone moves (like the tower).
//
// LAYOUT.movers = {
//   mirror: true,                      // each mover has a 180° twin doing the mirror move at every moment (fair maps)
//   modes: { tower: 'park', boss: 'off' },    // per match mode: 'run' (default) | 'park' (holds its first stop) | 'off'
//   timetable: { first, dwell, move, warn, horn },   // s: the first departure after play starts, the wait at a stop,
//                                      // the move (eased in and out), the warning before each departure, the horn's lead
//   cars: [{ id, stops: [[x, z], [x, z]], y, size: [length, height, width], roof: true,
//            mesh: { type, ...PropKit opts }, twinMesh: { ...opts over mesh for the twin },
//            sounds: { horn, run } }],  // stops: where its centre parks (it starts at the first); length runs A → B
//   signals: { lamps: [[x, y, z, yaw, pair]], bells: [[x, y, z]], bell },   // warning lamps (the two of a pair flash
//                                      // in turn) and bells, live from the warning until the car stops again
// }
//
// Sync: the timetable is a pure function of the match clock — the playing time since the start (duration − time: the
// host's clock, which every follower already runs in step with, ±0.2 s), carried on through overtime by frame time — so
// online every client computes the same car positions with no extra network records (stageKit.js StageClock). Each
// client moves its own squidkids out of a car's way (the owner's position is what the others see).
//
// A car is a moving level block (G.level.addDynamic / moveDynamic, off-limits roof, never inked; the floor under it
// keeps its ink) with its own mesh (PropKit.buildPart). Its current footprint — plus, from the warning until it parks,
// the whole stretch it sweeps — is marked on the nav graph (nav.blocked): routes pay heavily to enter it, goals skip it,
// and a bot whose route runs into a newly marked stretch replans. The blocks go in when play starts (the lightmap bake
// runs during the intro and never sees them) and come out with G.level.clearDynamic() when the match ends.
import * as THREE from 'three';
import { G } from '../core/ctx.js';
import { PLAYER } from '../config.js';
import { SFX } from '../audio/audio.js';
import { bell } from '../audio/music.js';
import { StageClock, navClaim, navCommit, navRelease, shovable, shoveActor, buildLook, disposeLook } from './stageKit.js';

const _v = new THREE.Vector3(), _p = new THREE.Vector3();
const smooth = (s) => s * s * (3 - 2 * s);

// ---- the timetable: where a mover is at timetable time tt (s of play). f = 0 at its first stop, 1 at the second.
export function moverPhase(tt, T) {
  const leg = T.dwell + T.move, u = tt - T.first;
  if (u < 0) return { f: 0, moving: false, leg: -1, toGo: -u, s: 0, v: 0 };
  const k = Math.floor(u / leg), w = u - k * leg, from = k % 2;
  if (w < T.move) {
    const s = w / T.move, e = smooth(s), v = (6 * s * (1 - s)) / T.move;   // v: df/dt magnitude
    return { f: from ? 1 - e : e, moving: true, leg: k, toGo: 0, s, v: from ? -v : v };
  }
  return { f: from ? 0 : 1, moving: false, leg: k, toGo: leg - w, s: 1, v: 0 };
}

export class StageMovers {
  // null when the stage has none, or they sit this mode out
  static create(match) {
    const def = G.level?.layout?.movers;
    if (!def || !def.cars?.length) return null;
    const mode = (def.modes && def.modes[match.mode]) || 'run';
    if (mode === 'off') return null;
    return new StageMovers(match, def, mode);
  }

  constructor(match, def, mode) {
    this.match = match;
    this.def = def;
    this.mode = mode;                    // 'run' | 'park'
    this.T = { first: 20, dwell: 20, move: 5, warn: 4, horn: 1.2, ...(def.timetable || {}) };
    this.clock = new StageClock();       // timetable clock (s of play: this.t)
    this.live = false;                   // blocks in the level (from the first playing frame)
    this.warning = false;
    this.cars = [];
    for (const c of def.cars) {
      this.cars.push(this._makeCar(c, false));
      if (def.mirror) this.cars.push(this._makeCar(c, true));
    }
    this.lamps = [];
    for (const l of def.signals?.lamps || []) {
      this.lamps.push(l);
      if (def.mirror) this.lamps.push([-l[0], l[1], -l[2], l[3] + Math.PI, l[4]]);
    }
    this.bellAt = [];
    for (const b of def.signals?.bells || []) { this.bellAt.push(b); if (def.mirror) this.bellAt.push([-b[0], b[1], -b[2]]); }
    this.bells = [];
    this._navPrep();
    this._buildLamps();
    this.phase = moverPhase(0, this.T);
    this._place(0);
  }

  get t() { return this.clock.t; }

  _makeCar(c, twin) {
    const s = twin ? -1 : 1;
    const A = new THREE.Vector3(s * c.stops[0][0], c.y ?? 0, s * c.stops[0][1]), B = new THREE.Vector3(s * c.stops[1][0], c.y ?? 0, s * c.stops[1][1]);
    const u = B.clone().sub(A); u.y = 0; const span = u.length(); u.normalize();
    const [len, ht, wid] = c.size;
    // yaw: the heading that turns local +X onto u (THREE's rotation.y and Level.moveDynamic agree: x → (cos, 0, −sin))
    const car = { id: c.id + (twin ? '~' : ''), def: c, twin, A, B, u, span, yaw: Math.atan2(-u.z, u.x),
      half: new THREE.Vector3(len / 2, ht / 2, wid / 2), len, ht, wid, pos: A.clone(), vel: 0, block: null, mesh: null, run: null, horned: -1 };
    // the mesh (a prop built along local +X; the twin turned half round like every mirrored placement)
    if (G.game?.props?.buildPart && c.mesh) {
      car.mesh = buildLook({ ...c.mesh, ...(twin ? c.twinMesh || {} : {}) });
      car.mesh.name = 'mover:' + car.id;
    }
    return car;
  }

  // ---- nav: the trackbed nodes each car can cover (sorted along its line), for quick footprint marking
  _navPrep() {
    const nav = G.nav;
    this.nav = nav || null;
    if (!nav) return;
    this.blk = navClaim(this);           // this set's own layer of nav.blocked (stageKit.js)
    const R = PLAYER.radius + 0.25;
    for (const car of this.cars) {
      const list = [], lo = -car.len / 2 - R - 1, hi = car.span + car.len / 2 + R + 1;
      for (const n of nav.nodes) {
        if (n.y > car.A.y + 0.6 || n.y < car.A.y - 1.0) continue;         // (its floor: the trackbed, not the platforms)
        const dx = n.x - car.A.x, dz = n.z - car.A.z, along = dx * car.u.x + dz * car.u.z, perp = Math.abs(-dx * car.u.z + dz * car.u.x);
        if (perp > car.wid / 2 + R || along < lo || along > hi) continue;
        list.push([along, n.id]);
      }
      list.sort((a, b) => a[0] - b[0]);
      car.nodes = list;
      car.navSpan = [NaN, NaN];
    }
  }

  // ---- per frame (Match.update, before bots and actors move)
  update(dt) {
    const m = this.match;
    if (m.state === 'playing' && !this.live) this._goLive();
    this.clock.tick(m, dt);
    const tt = this.mode === 'park' ? 0 : this.t;
    const ph = (this.phase = moverPhase(tt, this.T));
    this.warning = this.mode === 'run' && (ph.moving || (ph.leg >= -1 && ph.toGo <= this.T.warn && tt > 0));
    this._place(dt);
    if (this.live) this._navMark();
    this._signals(dt, ph);
  }

  _goLive() {
    this.live = true;
    for (const car of this.cars) {
      car.block = G.level.addDynamic({ tag: 'mover:' + car.id, roof: car.def.roof !== false });
      this._moveBlock(car);
    }
  }

  _moveBlock(car) {
    _v.set(car.pos.x, car.pos.y + car.ht / 2, car.pos.z);
    G.level.moveDynamic(car.block, _v, car.half, car.yaw);
  }

  // positions: the car along its line at the phase's f (the twin runs the same f: its line is the mirror)
  _place(dt) {
    const ph = this.phase;
    for (const car of this.cars) {
      const f = ph.f;
      _p.copy(car.A).addScaledVector(car.u, f * car.span);
      const dx = _p.x - car.pos.x, dz = _p.z - car.pos.z;
      car.pos.copy(_p);
      car.vel = ph.v * car.span;         // m/s along u (signed)
      if (car.mesh) { car.mesh.position.copy(car.pos); car.mesh.rotation.y = car.yaw; }
      if (this.live) {
        this._moveBlock(car);
        if (dx * dx + dz * dz > 1e-8) this._shove(car, dx, dz);
      }
    }
  }

  // Squidkids in a moving car's way are pushed out of it: out of its front along the track (the way it's going), or
  // out of its nearer side when that's shorter — only where the body fits (never into a wall), else the other way; the
  // capsule resolution (Physics.collideBody, this frame) mops up anything left. This client's own kids only: a remote
  // one is where its owner puts it (its owner shoves it).
  _shove(car, dx, dz) {
    const r = PLAYER.radius + 0.02;
    const ux = car.u.x, uz = car.u.z, dir = Math.sign(dx * ux + dz * uz);
    const hx = car.len / 2 + r, hz = car.wid / 2 + r, y0 = car.pos.y, y1 = car.pos.y + car.ht;
    for (const a of this.match.actors) {
      if (!shovable(a)) continue;
      if (a.pos.y > y1 - 0.05 || a.pos.y + PLAYER.height < y0) continue;       // on its roof (slides off) / below it
      const px = a.pos.x - car.pos.x, pz = a.pos.z - car.pos.z;
      const la = px * ux + pz * uz, lp = -px * uz + pz * ux;
      if (Math.abs(la) >= hx || Math.abs(lp) >= hz) continue;
      const front = dir ? hx - dir * la : Infinity, side = hz - Math.abs(lp), ss = lp >= 0 ? 1 : -1;
      const tries = front <= side ? [[dir * front, 0], [0, ss * side]] : [[0, ss * side], [dir * front, 0]];
      const spot = ([ma, mp]) => [a.pos.x + ux * ma - uz * mp, a.pos.z + uz * ma + ux * mp];
      const used = shoveActor(a, tries.map(spot));
      if (used >= 0 && tries[used][0] && a.vel) {
        const va = a.vel.x * ux + a.vel.z * uz;
        if (va * dir < Math.abs(car.vel)) { a.vel.x += ux * (dir * Math.abs(car.vel) - va); a.vel.z += uz * (dir * Math.abs(car.vel) - va); }
      }
    }
  }

  // ---- nav marking: each car's footprint (a player's width round it); from the warning until it parks, the whole
  // stretch between its stops. Bots whose route runs into a newly marked node replan.
  _navMark() {
    const nav = this.nav, blk = this.blk;
    if (!nav || !blk) return;
    let changed = false;
    for (const car of this.cars) {
      const at = (car.pos.x - car.A.x) * car.u.x + (car.pos.z - car.A.z) * car.u.z;
      let lo = at - car.len / 2 - 0.3, hi = at + car.len / 2 + 0.3;
      if (this.warning) { lo = Math.min(lo, -car.len / 2 - 0.3); hi = Math.max(hi, car.span + car.len / 2 + 0.3); }
      lo = Math.floor(lo * 2) / 2; hi = Math.ceil(hi * 2) / 2;          // (half-metre steps: no churn while it moves)
      if (lo === car.navSpan[0] && hi === car.navSpan[1]) continue;
      car.navSpan = [lo, hi];
      changed = true;
    }
    if (!changed) return;
    blk.fill(0);
    for (const car of this.cars) for (const [along, id] of car.nodes) if (along >= car.navSpan[0] && along <= car.navSpan[1]) blk[id] = 1;
    navCommit(this.match.actors);        // (the union with any other layer; routes into newly marked nodes replan now)
  }

  // ---- warnings: crossing lamps flash in turn and the bells ring from the warning until the car stops; the horn
  // sounds just before it pulls away; a rumble while it moves
  _signals(dt, ph) {
    const au = G.audio, on = this.warning;
    // lamps (an instanced mesh: dark lenses unless warning)
    if (this.lampMesh) {
      const beat = Math.floor(this.t * 2.6) % 2;
      for (let i = 0; i < this.lamps.length; i++) {
        const lit = on && this.lamps[i][4] === beat;
        this.lampMesh.setColorAt(i, lit ? LAMP_ON : LAMP_OFF);
      }
      this.lampMesh.instanceColor.needsUpdate = true;
    }
    if (!au || this.match.attract) { this._stopSounds(); return; }
    if (on && !this.bells.length) {
      for (const b of this.bellAt) this.bells.push(au.loop?.(this.def.signals?.bell || 'crossing_bell', { pos: _p.set(b[0], b[1], b[2]).clone(), volume: 0.8 }));
    } else if (!on && this.bells.length) { for (const h of this.bells) h?.stop?.(0.3); this.bells.length = 0; }
    for (const car of this.cars) {
      // horn: once per departure, horn s before it
      if (this.mode === 'run' && !ph.moving && ph.toGo <= this.T.horn && car.horned !== ph.leg) {
        car.horned = ph.leg;
        au.play?.(car.def.sounds?.horn || 'train_horn', { pos: car.pos, volume: 0.9 });
      }
      const sp = Math.abs(car.vel);
      if (sp > 0.2) {
        if (!car.run) car.run = au.loop?.(car.def.sounds?.run || 'train_run', { pos: car.pos.clone(), volume: 0 }) || null;
        car.run?.set?.({ pos: car.pos, volume: Math.min(1, 0.25 + sp / 7), pitch: 0.7 + sp / 12 });
      } else if (car.run) { car.run.stop?.(0.4); car.run = null; }
    }
  }
  _stopSounds() {
    for (const h of this.bells) h?.stop?.(0.2);
    this.bells.length = 0;
    for (const car of this.cars) if (car.run) { car.run.stop?.(0.2); car.run = null; }
  }

  _buildLamps() {
    if (!this.lamps.length || !G.scene || typeof document === 'undefined') return;
    const geo = new THREE.CircleGeometry(0.115, 14);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, this.lamps.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    this.lamps.forEach(([x, y, z, yaw], i) => {
      q.setFromEuler(e.set(0, yaw, 0));
      mesh.setMatrixAt(i, m.compose(_v.set(x, y, z), q, one));
      mesh.setColorAt(i, LAMP_OFF);
    });
    mesh.frustumCulled = false; mesh.name = 'mover:lamps';
    G.scene.add(mesh);
    this.lampMesh = mesh;
  }

  // snapshot for tests / the HUD
  state() {
    return { t: +this.t.toFixed(3), mode: this.mode, live: this.live, warning: this.warning, phase: { ...this.phase },
      cars: this.cars.map((c) => ({ id: c.id, pos: [+c.pos.x.toFixed(3), +c.pos.y.toFixed(3), +c.pos.z.toFixed(3)], vel: +c.vel.toFixed(3), block: c.block ? c.block.id : -1, navSpan: c.navSpan })),
      blocked: this.blk ? this.blk.reduce((s, v) => s + v, 0) : 0 };
  }

  dispose() {
    this._stopSounds();
    for (const car of this.cars) { disposeLook(car.mesh); car.mesh = null; }
    if (this.lampMesh) { this.lampMesh.removeFromParent(); this.lampMesh.geometry.dispose(); this.lampMesh.material.dispose(); this.lampMesh.dispose?.(); this.lampMesh = null; }
    if (this.live) G.level?.clearDynamic?.();
    this.live = false;
    if (this.nav) navRelease(this);
  }
}

const LAMP_ON = new THREE.Color('#ff3524').multiplyScalar(4.2), LAMP_OFF = new THREE.Color('#3a0f0c');

// ---- sounds (synthesised like every other: src/audio/audio.js voices)
// a Japanese level crossing's warning bell: a bright struck tone with an inharmonic partial, ~2.6 strikes a second
if (!SFX.crossing_bell) SFX.crossing_bell = {
  gain: 0.2, max: 4, jitter: 0, reverb: 0.25, oneShot: 2,
  loop(v, p) {
    const T = v.t;
    const amp = v.gain(0.5, v.out), lp = v.filter('lowpass', 5200, 0.7, amp);
    v.osc('sine', 740 * p, T, null, lp);
    const g2 = v.gain(0.35, lp); v.osc('sine', 740 * 2.76 * p, T, null, g2);
    const g3 = v.gain(0.12, lp); v.osc('triangle', 1480 * p, T, null, g3);
    v.lfo(2.6, -0.5, amp.gain, T, null, 'sawtooth');   // each strike: loud, then decaying to the next
  },
};
// the railcar's horn: a two-note brassy blast (Japanese diesel railcar "pwaan"), then a short second one
if (!SFX.train_horn) SFX.train_horn = {
  gain: 0.3, max: 2, jitter: 0.01, reverb: 0.45, minGap: 0.5,
  build(v, p) {
    const lp = v.filter('lowpass', 2100 * p, 0.9, v.out);
    for (const [t, h] of [[0, 0.75], [0.95, 0.28]]) {
      v.tone({ t, type: 'sawtooth', f: 311 * p, f1: 308 * p, sw: h, a: 0.05, h, d: 0.25, peak: 0.36, to: lp });
      v.tone({ t, type: 'sawtooth', f: 392 * p, f1: 388 * p, sw: h, a: 0.06, h, d: 0.28, peak: 0.3, to: lp });
      v.tone({ t, type: 'square', f: 155.5 * p, a: 0.07, h, d: 0.25, peak: 0.1, to: lp });
    }
    bell(v, v.t + 0.02, 1244 * p, 0.04, { d: 0.3 });
  },
};
// the railcar rolling: a diesel rumble and the rail joints' clatter (pitch ~ speed)
if (!SFX.train_run) SFX.train_run = {
  gain: 0.22, max: 2, jitter: 0, reverb: 0.1, oneShot: 2,
  loop(v, p) {
    const T = v.t;
    const amp = v.gain(0.55, v.out), lp = v.filter('lowpass', 300 * p, 0.8, amp);
    v.osc('sawtooth', 42 * p, T, null, lp);
    v.osc('sawtooth', 42.6 * p, T, null, lp);
    const clat = v.gain(0.2, v.out);
    v.noise('white', T, null, v.filter('bandpass', 1300, 1.8, clat));
    v.lfo(4.2 * p, 0.2, clat.gain, T, null, 'square');
  },
};
