// Shaker Bomb (kit sub 'shaker') — see kits/registry.js.
//
// Hold the sub button to shake it up: the charge climbs from one blast to two to three, with a clink at each new charge
// and a louder, brighter clink on the third. Plain holding takes SUBS.shaker.chargeTime (≈2.7 s) for all three; mashing
// jump, running and waggling the stick / shaking the mouse shake it faster. (The browser Gamepad API exposes no gyro or
// accelerometer, so a physically shaken controller can't be read: a fast stick or mouse waggle stands in for it.)
// Released, it is thrown like any bomb and sprays a thin ink trail as it flies. After it lands it pops once per charge,
// and each pop hops it forward. If you are splatted while holding it, it fizzles out in your hand: no ink is spent and
// nothing is thrown.
//
// Per-actor charge state lives on the weapon runner as `runner.shaker` (runner.kit belongs to kit main weapons).
// Events: 'sub:charge' { actor, kind: 'shaker', level, max } at each new charge; 'sub:use' { actor, kind, level };
// 'bomb:arm' / 'bomb:explode' { actor, pos, team, radius, kind: 'shaker', n } per blast.
import * as THREE from 'three';
import { G, emit, on, clamp, lerp, angleDiff } from '../../core/ctx.js';
import { PLAYER, SUBS, subViewScale } from '../../config.js';
import { SUB_KITS, netRec, netId, ghostMute } from './registry.js';
const r2 = (x) => Math.round(x * 100) / 100;
import { registerSubModel, getSubDef, GEO_KIT } from '../character-weapons.js';
import { superEllipsoid, lathe, smoothProfile } from '../character-geo.js';
import { getPlasticMaterial, getInkMaterial } from '../character-mats.js';
import { Hit } from '../physics.js';
import { THROWN } from '../bots.js';
import { SUB_ICONS } from '../../ui/ui-icons.js';
import { SFX, texture } from '../../audio/audio.js';

const { Parts, C, M, hring, wrapY, screw, decal, squidShape, chevrons, gripSleeve, orient } = GEO_KIT;
const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0), DOWN = new V3(0, -1, 0);
const _v = new V3(), _v2 = new V3(), _v3 = new V3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _qI = new THREE.Quaternion();
const _hit = new Hit(), _hit2 = new Hit();
const GRAV = 24;
const SCALE = 1.9;                 // hand-scale model → world (the other sub props read at this size too) — [sub-view]
                                   // × SUB_VIEW_SCALE.shaker (config.js): drawn bigger, visual only (RAD etc. unchanged)
const CY = 0.107;                  // model-space height of the can's middle (the thrown can tumbles about it)
const RAD = 0.19;                  // world contact radius (the centre rests this far off a surface)
const CAN_R = 0.049;               // [sub-view] the can's foot radius (model space): it rattles on its rim

// ================================================================================================= model
// Prop space: origin at the bottom centre, +Y up, +Z front. A cream can, Ø 0.10 × 0.21 at hand scale, with an ink window
// round its waist. A dark strip up the front carries the three charge lamps (bottom to top). On top is a metal cap with a
// fizz vent, and a knurled grip knob that the left fist holds, as with the Splat Bomb.
const LAMP_Y = [0.0665, 0.081, 0.0955], LAMP_R = 0.0547;
const NOZ = { p: new V3(), n: new V3() };                      // fizz vent tip + direction (set by the builder)
function buildShaker() {
  const P = new Parts(), I = new Parts();
  // rubber foot, cream lower shell with a hazard pinstripe
  P.add(lathe([[0, 0], [0.043, 0], [0.0478, 0.0028], [0.049, 0.009], [0.0466, 0.0135], [0, 0.0135]], 28), C.rubber, M.rubber);
  P.add(lathe([[0, 0.011]].concat(smoothProfile([[0.044, 0.0115], [0.0492, 0.016], [0.0505, 0.026], [0.0505, 0.0535]], 8), [[0, 0.0535]]), 32), C.cream, M.satin);
  P.add(hring(0.0507, 0.0017, 0.031, 4, 34), C.hazard, M.gloss);
  // the ink window between two dark gaskets
  I.add(lathe([[0, 0.053], [0.0494, 0.053], [0.0501, 0.059], [0.0503, 0.081], [0.0501, 0.103], [0.0494, 0.109], [0, 0.109]], 32));
  for (const y of [0.0535, 0.1085]) P.add(hring(0.0507, 0.0034, y, 6, 34), C.dark, M.gloss);
  // cream upper shell rounding into a shoulder, then the metal cap (4 screws)
  P.add(lathe([[0, 0.108]].concat(smoothProfile([[0.0505, 0.108], [0.0505, 0.127], [0.049, 0.14], [0.0448, 0.149], [0.0385, 0.1535]], 8), [[0, 0.1535]]), 32), C.cream, M.satin);
  P.add(lathe([[0, 0.1505]].concat(smoothProfile([[0.0398, 0.1505], [0.0405, 0.156], [0.0355, 0.1635], [0.0245, 0.1685], [0.012, 0.1705]], 8), [[0, 0.171]]), 28), C.metal, M.metal);
  for (let k = 0; k < 4; k++) { const az = Math.PI / 4 + k * Math.PI / 2; screw(P, new V3(Math.sin(az) * 0.0396, 0.1566, Math.cos(az) * 0.0396), new V3(Math.sin(az), 0.5, Math.cos(az)).normalize(), 0.0025); }
  // fizz vent on the cap's front-right shoulder: a dark spout with ink welling at the tip
  { const az = 0.95, p0 = new V3(Math.sin(az) * 0.029, 0.1648, Math.cos(az) * 0.029), n = new V3(Math.sin(az) * 0.72, 0.7, Math.cos(az) * 0.72).normalize();
    P.add(orient(lathe([[0, -0.004], [0.0062, -0.004], [0.0062, 0.005], [0.0053, 0.0115], [0.0047, 0.0158], [0, 0.0158]], 12), n, p0), C.dark, M.gloss);
    I.add(orient(lathe([[0, 0.015], [0.0037, 0.015], [0.0035, 0.0178], [0, 0.0186]], 10), n, p0));
    NOZ.p.copy(p0).addScaledVector(n, 0.019); NOZ.n.copy(n); }
  // collar with a team ring, knurled grip knob, metal end cap
  P.add(lathe([[0, 0.169], [0.0178, 0.169], [0.0192, 0.1725], [0.0174, 0.1765], [0, 0.177]], 18), C.dark, M.gloss);
  I.add(hring(0.0206, 0.0026, 0.1712, 4, 22));
  P.add(gripSleeve(0.1765, 0.2065), C.rubber, M.rubber);
  P.add(lathe([[0, 0.206], [0.0056, 0.206], [0.0056, 0.2098], [0.0074, 0.2112], [0.0074, 0.2138], [0, 0.2146]], 10), C.metal, M.metal);
  // front lamp strip over the window: three dark sockets (the lamps themselves are per-instance meshes, see LAMP_GEO)
  P.add(wrapY(superEllipsoid(0.0108, 0.0262, 0.0032, 0.42, 0.5, 10, 10), 0.0506, 0, 0.081), C.dark, M.gloss);
  for (const y of LAMP_Y) P.add(wrapY(superEllipsoid(0.0068, 0.0068, 0.0018, 1, 1, 12, 6), 0.0535, 0, y), C.darker, M.satin);
  // squid decal on the back, team up-chevrons ("shake it up") on both flanks
  P.add(wrapY(decal(squidShape(0.026)), 0.0507, Math.PI, 0.1255), C.dark, M.print);
  for (const s of [1, -1]) for (const g of chevrons(0.024, 0.009, 3, true)) I.add(wrapY(g, 0.0507, s * Math.PI / 2, 0.1265));
  return { kind: 'shaker', body: P.build(), ink: I.build(), grip: { pos: new V3(0, 0.1915, 0), handZ: new V3(0, 1, 0), handY: new V3(0.3, 0.1, -1) } };
}
registerSubModel('shaker', buildShaker);
const LAMP_GEO = superEllipsoid(0.0057, 0.0057, 0.0034, 1, 1, 12, 6);   // a lamp dome facing +Z
function lampMat(color) { return new THREE.MeshStandardMaterial({ color: 0x141418, emissive: color.clone(), emissiveIntensity: 0.05, roughness: 0.3 }); }

// the thrown can: outer (world position = the can's middle) → inner (tumble) → model (scaled prop, lifted by CY)
function makeMesh(team, vs = 1) {
  const d = getSubDef('shaker'), col = G.teamColors[team];
  const outer = new THREE.Group(), inner = new THREE.Group(), model = new THREE.Group();
  model.scale.setScalar(SCALE * vs); model.position.y = -CY * SCALE * vs;
  const body = new THREE.Mesh(d.body, getPlasticMaterial()); body.castShadow = true;
  const ink = new THREE.Mesh(d.ink, getInkMaterial(col)); ink.castShadow = true;
  model.add(body, ink);
  const mats = LAMP_Y.map(() => lampMat(col));
  const lamps = LAMP_Y.map((y, i) => { const m = new THREE.Mesh(LAMP_GEO, mats[i]); m.position.set(0, y, LAMP_R); model.add(m); return m; });
  inner.add(model); outer.add(inner);
  return { outer, inner, model, lamps, mats };
}

// ================================================================================================= icon + sounds
{
  const K = '#15121c', DK = '#2b2735', LT = '#e4e8ef';
  const O = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  // tilted can: grip knob, metal cap, ink waist, dark lamp strip with three lit lamps; shake arcs and fizz bubbles
  SUB_ICONS.shaker = `<svg class="iw-ico " viewBox="0 0 64 64" aria-hidden="true">
    <g fill="none" stroke="${K}" stroke-width="6.5" stroke-linecap="round"><path d="M7.5 21 Q2.5 28.5 6 36.5 M56.5 31 Q61.5 38.5 58 46.5"/></g>
    <g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7.5 21 Q2.5 28.5 6 36.5 M56.5 31 Q61.5 38.5 58 46.5"/></g>
    <g transform="rotate(14 32 36)"><g ${O}>
      <rect x="27.5" y="3.5" width="9" height="10" rx="2.8" fill="${DK}"/>
      <path d="M21.5 17 Q21.5 11 32 11 Q42.5 11 42.5 17 Z" fill="${LT}"/>
      <rect x="17" y="15.5" width="30" height="41" rx="6" fill="${LT}"/>
      <rect x="17" y="27" width="30" height="16" fill="currentColor"/>
      <rect x="27" y="24.5" width="10" height="21" rx="3.5" fill="${DK}"/>
    </g>
    <circle cx="32" cy="29.5" r="2.3" fill="#fff"/><circle cx="32" cy="35" r="2.3" fill="#fff"/><circle cx="32" cy="40.5" r="2.3" fill="#fff"/>
    <path d="M21.5 20 L21.5 24 M21.5 48 L21.5 51" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/></g>
    <g ${O} stroke-width="2.4"><circle cx="45.5" cy="7" r="3.3" fill="currentColor"/><circle cx="52.5" cy="12.5" r="2.4" fill="currentColor"/><circle cx="50" cy="3.5" r="1.8" fill="currentColor"/></g>
  </svg>`;
}
// a glassy can clink with a fizz of bubbles; the third charge: louder, brighter, a bounce, a pressure hiss
SFX.shaker_clink = {
  gain: 0.26, max: 3, jitter: 0.03, reverb: 0.14, minGap: 0.05,
  build(v, p) {
    const f = 2150 * p;
    for (const [r, a, d] of [[1, 0.5, 0.22], [2.41, 0.26, 0.13], [4.3, 0.12, 0.07], [6.9, 0.06, 0.04]]) v.tone({ f: f * r, a: 0.0006, d, peak: a });
    v.nz({ ft: 'highpass', f: 5500, a: 0.0003, d: 0.012, peak: 0.3 });
    v.tone({ t: 0.004, f: 520 * p, f1: 300 * p, sw: 0.03, a: 0.001, d: 0.03, peak: 0.18 });
    for (let i = 0; i < 4; i++) v.bub(v.t + 0.02 + v.r(0, 0.14), v.r(1500, 2800) * p, 0.07, v.r(0.012, 0.025), v.r(1.5, 2));
  },
};
SFX.shaker_clink_max = {
  gain: 0.44, max: 2, jitter: 0.02, reverb: 0.22, minGap: 0.05,
  build(v, p) {
    const f = 2600 * p;
    for (const [t, k] of [[0, 1], [0.085, 0.55]]) {
      for (const [r, a, d] of [[1, 0.5, 0.36], [2.41, 0.3, 0.2], [4.3, 0.16, 0.12], [6.9, 0.09, 0.07], [9.2, 0.05, 0.05]]) v.tone({ t, f: f * r, a: 0.0006, d: d * (t ? 0.7 : 1), peak: a * k });
    }
    v.nz({ ft: 'highpass', f: 6000, a: 0.0003, d: 0.016, peak: 0.45 });
    v.tone({ t: 0.004, f: 640 * p, f1: 340 * p, sw: 0.03, a: 0.001, d: 0.035, peak: 0.24 });
    v.nz({ t: 0.03, ft: 'highpass', f: 4500, a: 0.02, d: 0.28, peak: 0.16 });
    for (let i = 0; i < 9; i++) v.bub(v.t + 0.03 + v.r(0, 0.3), v.r(1800, 3600) * p, 0.09, v.r(0.01, 0.022), v.r(1.5, 2.2));
  },
};
// the can fizzing in the fist while it's held (local player): bright bubbles + hiss, pitch / level rise with the charge
SFX.shaker_fizz = {
  gain: 0.16, max: 3, jitter: 0, reverb: 0.03, oneShot: 1.2,
  loop(v, p) {
    const T = v.t;
    const bp = v.filter('bandpass', 2600, 0.9, v.out);
    const tex = v.buffer(texture(v.ctx, 'bubbles_bright'), T, null, v.gain(1, bp), p);
    const hs = v.gain(0.05, v.out);
    v.noise('white', T, null, v.filter('highpass', 6500, 0.7, hs));
    return { pitch(q, now) { tex.playbackRate.setTargetAtTime(q, now, 0.05); hs.gain.setTargetAtTime(Math.max(0, 0.05 + 0.14 * (q - 0.85)), now, 0.05); } };
  },
};
// each blast's hop: a pressure "pssht" and a small clink
SFX.shaker_hop = {
  gain: 0.3, max: 3, jitter: 0.06, reverb: 0.06, minGap: 0.04,
  build(v, p) {
    v.nz({ f: 3200 * p, f1: 1300 * p, sw: 0.12, q: 1.2, a: 0.003, d: 0.13, peak: 0.6 });
    v.tone({ f: 1900 * p, a: 0.0006, d: 0.07, peak: 0.18 });
    v.tone({ f: 4400 * p, a: 0.0005, d: 0.04, peak: 0.08 });
  },
};
// splatted while holding: the can goes flat (a deflating hiss and a few sad bubbles)
SFX.shaker_fizzle = {
  gain: 0.28, max: 2, jitter: 0.05, reverb: 0.06,
  build(v, p) {
    v.nz({ f: 2800 * p, f1: 600 * p, sw: 0.45, q: 1.1, a: 0.01, d: 0.45, peak: 0.6 });
    for (let i = 0; i < 5; i++) v.bub(v.t + 0.05 + v.r(0, 0.35), v.r(500, 1100) * p, 0.1, v.r(0.02, 0.04), v.r(1.2, 1.6));
  },
};

// ================================================================================================= charging (hold)
function newState(a) {
  return { meter: 0, level: 1, t0: G.time, t1: G.time, budget: 0.1, jumps: 0, shakes: 0, kick: 0, fizz: 0,
    jumpPrev: !!a.intent?.jump, yawPrev: a.aimYaw, lookSign: 0, axis: [0, 0], lastWag: -9, loop: null, botLevel: null, botMax: 0 };
}
const isBot = (a) => !!a.bot;   // bot brains drive the intent (a human local player has none; the autopilot does)

// Waggles this frame, for the local player: fast reversals of the aim's turn direction (mouse / right stick) and the left
// stick thrown from one side to the other.
function waggles(st, a, dt) {
  let n = 0;
  const dy = angleDiff(st.yawPrev, a.aimYaw); st.yawPrev = a.aimYaw;
  if (dt > 0 && Math.abs(dy) / dt > 3) {
    const s = Math.sign(dy);
    if (s !== st.lookSign) { if (st.lookSign && G.time - st.lastWag > 0.05) { n++; st.lastWag = G.time; } st.lookSign = s; }
  }
  const inp = G.input, pad = inp?.pad;
  if (pad && inp.lastDevice === 'pad') {
    for (let i = 0; i < 2; i++) {
      const x = pad.axes[i] || 0, s = x > 0.6 ? 1 : x < -0.6 ? -1 : 0;
      if (s && s !== st.axis[i]) { if (st.axis[i] && G.time - st.lastWag > 0.04) { n++; st.lastWag = G.time; } st.axis[i] = s; }
    }
  }
  return n;
}

function hold(runner, dt, inp, sub) {
  const a = runner.a;
  let st = runner.shaker;
  if (st && G.time - st.t1 > 0.15) { drop(a, false); st = null; }   // a stale charge (the hold was interrupted)
  if (!st) st = runner.shaker = newState(a);
  st.t1 = G.time;
  const paid = (a.specialActive && a.specialActive.kind === 'barrage') || a.ink >= sub.inkCost;
  const jump = !!a.intent.jump, jp = jump && !st.jumpPrev; st.jumpPrev = jump;
  const wag = a.isLocal && !isBot(a) ? waggles(st, a, dt) : 0;
  if (paid && st.meter < 1) {
    const move = clamp((Math.hypot(a.vel.x, a.vel.z) - 1) / (PLAYER.runSpeed - 1), 0, 1);
    let add = (dt / sub.chargeTime) * (1 + sub.moveBoost * move);
    if (jp) { add += sub.jumpBoost; st.jumps++; }
    if (wag) { add += wag * sub.shakeBoost; st.shakes += wag; }
    st.budget = Math.min(0.3, st.budget + sub.maxRate * dt);   // bursts of presses can't beat the cap
    add = Math.min(add, st.budget); st.budget -= add;
    st.meter = Math.min(1, st.meter + add);
  }
  const lv = st.meter >= 1 ? 3 : st.meter >= 0.5 ? 2 : 1;
  if (lv > st.level) {
    st.level = lv; st.kick = 1;
    clink(a, lv);
    emit('sub:charge', { actor: a, kind: 'shaker', level: lv, max: lv === 3 });
  }
  st.kick = Math.max(0, st.kick - dt * 4);
  if (isBot(a)) botHold(a, st, inp);
  handFx(a, st, dt);
}

function clink(a, lv) {
  const near = a.isLocal || a._nearCamera();
  if (!near) return;
  G.audio?.play(lv >= 3 ? 'shaker_clink_max' : 'shaker_clink', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 1 : 0.75, pitch: lv >= 3 ? 1 : 0.94 });
  const hp = handProp(a);
  if (hp) {
    const p = nozzleWorld(hp, _v3);
    if (lv >= 3) G.fx?.chargeFull?.(p, a.color);
    else G.fx?.burst?.(p, hp.nDir, a.color, { count: 5, speed: 2.2, size: 0.035, sheet: false });
  }
  if (a.isLocal) G.input?.rumble?.(lv >= 3 ? 0.3 : 0.12, lv >= 3 ? 0.5 : 0.25, lv >= 3 ? 120 : 60);
}

// Bots can't mash: they press once, then hold here until the charge they planned (by the fight's range), or ~3 s.
function botHold(a, st, inp) {
  const b = a.bot;
  if (st.botLevel == null) {
    // (Boss Battle: the target is a boss hit-shape / crablet record — its position may sit on .shape)
    const t = b.tv || b.target, tp = t && (t.pos || (t.shape && t.shape.pos)), d = tp ? Math.hypot(tp.x - a.pos.x, tp.z - a.pos.z) : 8;
    if (b.mode === 'fight') st.botLevel = d > 10 ? 3 : d > 6.5 ? (Math.random() < 0.6 ? 3 : 2) : (Math.random() < 0.55 ? 2 : 1);
    else st.botLevel = Math.random() < 0.5 ? 3 : 2;   // painting / a zone lob: a long ink line
    st.botMax = b.mode === 'fight' ? 3.2 : 2.2;
  }
  const keep = a.alive && a.form === 'kid' && st.level < st.botLevel && G.time - st.t0 < st.botMax;
  if (keep) { inp.sub = true; inp.subReleased = false; }
  else if (!inp.sub) inp.subReleased = true;       // the brain let go frames ago: throw now
}

// ---- the can in the fist: rattles harder as it charges (jolts on each clink), its lamps count the charges, the vent fizzes
function handProp(a) {
  const b = a.character?.bomb;
  if (!b || b.kind !== 'shaker') return null;
  const g = b.group;
  let hp = g.userData.shaker;
  if (!hp) {
    const d = getSubDef('shaker');
    const mats = LAMP_Y.map(() => lampMat(a.color));
    const lamps = LAMP_Y.map((y, i) => { const m = new THREE.Mesh(LAMP_GEO, mats[i]); m.position.set(0, y, LAMP_R); g.add(m); return m; });
    hp = g.userData.shaker = { group: g, lamps, mats, pb: g.position.clone(), qb: g.quaternion.clone(), pivot: d.grip.pos.clone(), nDir: new V3() };
  }
  return hp;
}
function nozzleWorld(hp, out) {
  hp.group.updateWorldMatrix(true, false);
  out.copy(NOZ.p).applyMatrix4(hp.group.matrixWorld);
  hp.nDir.copy(NOZ.n).transformDirection(hp.group.matrixWorld);
  return out;
}
function restoreHand(a) {
  const hp = a.character?.bomb?.group?.userData?.shaker;
  if (!hp) return;
  hp.group.position.copy(hp.pb); hp.group.quaternion.copy(hp.qb);
  for (const m of hp.mats) m.emissiveIntensity = 0.05;
}
function handFx(a, st, dt) {
  const hp = handProp(a);
  if (!hp) return;
  const near = a.isLocal || a._nearCamera();
  const f = st.meter, max = st.level >= 3;
  // rattle about the grip: random per-frame jolts (a vibration, not a wobble)
  const amp = (0.035 + 0.09 * f + 0.22 * st.kick) * (near ? 1 : 0.5);
  _e.set((Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp * 0.5, (Math.random() * 2 - 1) * amp);
  _q.setFromEuler(_e);
  hp.group.quaternion.copy(hp.qb).multiply(_q);
  _v.copy(hp.pivot).applyQuaternion(_q).sub(hp.pivot).negate().applyQuaternion(hp.qb);   // qb·(pivot − R·pivot)
  hp.group.position.copy(hp.pb).add(_v);
  // lamps: lit per charge; the next one glows with the progress toward it; at max they all throb
  const part = st.level < 3 ? clamp(f * 2 - (st.level - 1), 0, 1) : 1;
  for (let i = 0; i < 3; i++) {
    const m = hp.mats[i];
    m.emissive.copy(a.color);
    m.emissiveIntensity = i < st.level ? (max ? 2.4 + 1.2 * Math.sin(G.time * 18) : 2.2) + 2.5 * st.kick
      : i === st.level ? 0.12 + 0.9 * part * (0.6 + 0.4 * Math.sin(G.time * 22)) : 0.05;
  }
  // fizz out of the vent (more with the charge, a steady spray at max) + the fizz loop for the local player
  if (near && G.fx) {
    st.fizz += dt * (4 + 26 * f + (max ? 22 : 0));
    if (st.fizz >= 1) {
      const p = nozzleWorld(hp, _v3), n = hp.nDir;
      const col = _c.copy(a.color).lerp(_white, 0.3);
      while (st.fizz >= 1) {
        st.fizz -= 1;
        // fine spray out of the vent, thrown upward in the world (the can rides upside down in the fist)
        const sp = 1.6 + Math.random() * (1.5 + 2 * f);
        _v2.set(n.x * 0.7 + (Math.random() - 0.5) * 0.8, 1.3 + Math.random() * 0.5, n.z * 0.7 + (Math.random() - 0.5) * 0.8).normalize().multiplyScalar(sp);
        G.fx.drop(p, _v2, col, { size: 0.004 + Math.random() * 0.006, life: 0.5, gravity: 1, quiet: true });
      }
      if (f > 0.3 && Math.random() < dt * (3 + 8 * f)) G.fx.mist?.(p, _v2.set(n.x * 0.5, 0.9, n.z * 0.5), col, 0.04 + 0.04 * f, 0.2);
    }
  }
  if (a.isLocal && G.audio) {
    if (!st.loop) st.loop = G.audio.loop('shaker_fizz', { volume: 0.3, pitch: 0.85 });
    st.loop.set({ volume: 0.3 + 0.8 * f + (max ? 0.25 : 0), pitch: 0.85 + 0.55 * f + (max ? 0.15 * Math.sin(G.time * 9) : 0) });
  }
}
const _c = new THREE.Color(), _white = new THREE.Color(1, 1, 1);

// a charge that's dropped (splatted, dived into ink, loadout swap …): no throw, no ink; the fizz stops
function drop(a, fizzle) {
  const r = a.weaponRunner, st = r?.shaker;
  if (!st) return;
  r.shaker = null;
  st.loop?.stop(0.1);
  if (fizzle && (a.isLocal || a._nearCamera())) {
    const hp = handProp(a);
    const p = hp ? nozzleWorld(hp, _v3) : _v3.copy(a.pos).setY(a.pos.y + 1.2);
    G.fx?.burst?.(p, UP, a.color, { count: 7, speed: 1.6, size: 0.04, sheet: false });
    G.fx?.mist?.(p, _v2.set(0, 0.8, 0), _c.copy(a.color).lerp(_white, 0.4), 0.12, 0.3);
    G.audio?.play('shaker_fizzle', { pos: a.isLocal ? undefined : p, volume: a.isLocal ? 0.8 : 0.6 });
  }
  restoreHand(a);
}
on('splatted', ({ victim }) => { if (victim?.weaponRunner?.shaker) drop(victim, G.time - victim.weaponRunner.shaker.t1 < 0.25); });

// ================================================================================================= thrown can
// Bots lob it at their foe: the aim pitch that lands a throw (throwVelocity: pitch + 0.28 rad, +1.5 m/s up, released
// 1.35 m up, gravity 24) d m out and dy above the thrower's feet; null if it can't reach (as bots.js lobPitch).
function lobPitch(d, dy, speed) {
  let best = null, be = Infinity;
  for (let p = -0.5; p <= 0.75; p += 0.025) {
    const tp = clamp(p + 0.28, -0.3, 1.1), vx = Math.cos(tp) * speed, vy = Math.sin(tp) * speed + 1.5, disc = vy * vy + 48 * (1.35 - dy);
    if (disc < 0) continue;
    const e = Math.abs((vx * (vy + Math.sqrt(disc))) / 24 - d);
    if (e < be) { be = e; best = p; }
  }
  return be < 1.2 ? best : null;
}
function botLob(a, sub, short) {
  const b = a.bot, t = b?.tv || b?.target;   // (the target as the bot knows it: out of sight, where it was — bots.js)
  if (!t || !t.alive || b.mode !== 'fight') return;
  const tx = t.pos.x + t.vel.x * 0.5, tz = t.pos.z + t.vel.z * 0.5;          // lead it by about the flight time
  const p = lobPitch(Math.max(1.5, Math.hypot(tx - a.pos.x, tz - a.pos.z) - short), t.pos.y - a.pos.y, sub.throwSpeed);
  if (p == null) return;
  a.aimYaw = Math.atan2(tx - a.pos.x, tz - a.pos.z); a.aimPitch = p;
}
const items = [];
function use(subs, a, sub) {
  const r = a.weaponRunner, st = r.shaker;
  const level = st && G.time - st.t1 < 0.25 ? st.level : 1;
  if (st) { st.loop?.stop(0.08); r.shaker = null; }
  restoreHand(a);
  if (isBot(a)) botLob(a, sub, 0.9);   // its first blast (after the landing slide) on the foe
  const pos = a.pos.clone(); pos.y += 1.35;
  const vel = G.projectiles.throwVelocity(a, sub.throwSpeed, new V3());
  const it = spawn(a, sub, pos, vel, level, false, netId(a));
  netRec(a, 'shaker', [0, it.gid, r2(pos.x), r2(pos.y), r2(pos.z), r2(vel.x), r2(vel.y), r2(vel.z), level]);
  G.cues?.sub('shaker', 'throw', { owner: a, at: a.pos, pitch: 0.95 + 0.06 * level });   // sfx-cues: its own throw (src/audio/cues.js)
  emit('sub:use', { actor: a, kind: 'shaker', level });
}
// the can in flight (ghost: a remote player's, online — it flies and hops the same, but blasts only when its owner's
// did: records [1, gid, x, y, z]; [2, gid] ends one that sank without going off)
function spawn(a, sub, pos, vel, level, ghost, gid) {
  const dir = new V3(vel.x, 0, vel.z);
  if (dir.lengthSq() < 1e-6) dir.set(Math.sin(a.aimYaw), 0, Math.cos(a.aimYaw));
  dir.normalize();
  const vs = subViewScale('shaker');   // [sub-view]
  const m = makeMesh(a.team, vs);
  m.outer.position.copy(pos);
  m.inner.rotation.set(Math.random() * 6, Math.random() * 6, 0);
  G.scene.add(m.outer);
  const it = { owner: a, team: a.team, sub, level, left: level, blasts: 0, pos, vel, dir, m, state: 'fly', age: 0, fuse: -1, next: 0, trail: 0,
    ground: 0, armed: false, sp: !!a.specialActive, spin: new V3(4 + Math.random() * 5, 0, 3 + Math.random() * 5), gp: new V3(), gn: new V3(0, 1, 0), gOk: false,
    ghost, gid, vs, stand: 0 };
  items.push(it);
  lamps(it);
  return it;
}
function ghost(a, d) {
  if (!Array.isArray(d)) return;
  const [op, gid] = d;
  if (op === 0) {
    if (items.some((x) => x.gid === gid)) return;
    spawn(a, SUBS.shaker, new V3(d[2], d[3], d[4]), new V3(d[5], d[6], d[7]), clamp(d[8] | 0, 1, 3), true, gid);
    G.cues?.sub('shaker', 'throw', { owner: a, at: a.pos, pitch: 0.95 + 0.06 * d[8] });   // sfx-cues
    return;
  }
  const it = items.find((x) => x.ghost && x.gid === gid && x.state !== 'dead');
  if (!it) return;
  if (op === 1) { it.pos.set(d[2], d[3], d[4]); it.fuse = -1; it.next = 0; blast(it); }
  else if (op === 2) it.state = 'dead';
}

function lamps(it) {
  const col = G.teamColors[it.team];
  for (let i = 0; i < 3; i++) { it.m.mats[i].emissive.copy(col); it.m.mats[i].emissiveIntensity = i < it.left ? 2.3 : 0.05; }
}

function update(it, dt) {
  const s = it.sub;
  it.age += dt;
  // ---- motion: gravity, swept centre vs the world, then a resting contact (the centre kept RAD off the floor)
  it.vel.y -= GRAV * dt;
  _v.copy(it.pos);
  it.pos.addScaledVector(it.vel, dt);
  let floor = false;
  const h = G.physics.segment(_v, it.pos, _hit);
  if (h.hit) {
    const n = h.normal;
    it.pos.copy(h.point).addScaledVector(n, RAD);
    if (n.y > 0.6) floor = contactFloor(it, n, dt);
    else {
      const vn = it.vel.dot(n);
      if (vn < 0) it.vel.addScaledVector(n, -vn * 1.5).multiplyScalar(0.62);
      // hops carry on away from the wall it bounced off
      const dn = it.dir.x * n.x + it.dir.z * n.z;
      if (dn < 0 && Math.abs(n.y) < 0.6) { it.dir.x -= 2 * dn * n.x; it.dir.z -= 2 * dn * n.z; it.dir.y = 0; it.dir.normalize(); }
    }
  }
  if (!floor) {
    const g = G.physics.raycast(_v2.copy(it.pos), DOWN, RAD, _hit2);
    if (g.hit && g.normal.y > 0.6) { it.pos.y += RAD - g.dist; floor = contactFloor(it, g.normal, dt); }
  }
  it.ground = floor ? 0.12 : Math.max(0, it.ground - dt);
  // ---- thin trail: droplets shaken from the vent while it's travelling through the air
  const hs = Math.hypot(it.vel.x, it.vel.z);
  if (!it.ground && hs > 1.5) {
    it.trail += hs * dt;
    while (it.trail >= s.trailEvery) { it.trail -= s.trailEvery; if (!it.ghost) drip(it); }   // (a ghost's: its owner's drops arrive)
  }
  // ---- fuse (first landing) → blast → hop → blast …
  // (a ghost holds at the brink until its owner's blast record arrives)
  if (it.fuse >= 0) { it.fuse -= dt; if (it.fuse <= 0) { if (it.ghost) it.fuse = 1e-3; else { it.fuse = -1; blast(it); } } }
  else if (it.next > 0) { it.next -= dt; if (it.next <= 0) { if (it.ghost) it.next = 1e-3; else blast(it); } }
  if (it.ghost && it.age > 20) it.state = 'dead';                           // (its owner left mid-throw)
  if (it.state === 'dead') return;
  if (it.pos.y < PLAYER.waterY - 1.8) { it.state = 'dead'; return; }        // sank: no blast
  if (!it.armed && it.age > 6) arm(it);                                     // never found a floor (wedged): go anyway
  // ---- look: tumbles in the air; once armed it stands up and rattles; the danger ring shows the next blast
  const M_ = it.m;
  M_.outer.position.copy(it.pos);
  // [sub-view] armed, the drawn can stands with its foot on the floor: its middle CY·SCALE·vs up, where the physics
  // centre sits RAD up (eased in as it stands up after landing; kept through its hops so it never tumbles into the floor)
  it.stand += ((it.armed ? 1 : 0) - it.stand) * (1 - Math.exp(-24 * dt));
  M_.outer.position.y += (CY * SCALE * it.vs - RAD) * it.stand;
  if (it.ground && it.armed) {
    M_.inner.quaternion.slerp(_qI, 1 - Math.exp(-14 * dt));
    const k = it.fuse >= 0 ? 1 - it.fuse / s.fuse : 1 - it.next / s.gap;
    const j = 0.05 + 0.1 * k, rx = (Math.random() * 2 - 1) * j, rz = (Math.random() * 2 - 1) * j;
    M_.model.rotation.set(rx, 0, rz);
    M_.model.position.y = (-CY + CAN_R * Math.max(Math.abs(rx), Math.abs(rz))) * SCALE * it.vs;   // [sub-view] (rattling on its rim, not into the floor)
  } else {
    M_.inner.rotation.x += it.spin.x * dt; M_.inner.rotation.z += it.spin.z * dt;
    M_.model.rotation.set(0, 0, 0); M_.model.position.y = -CY * SCALE * it.vs;
  }
  if (it.armed && G.fx && near(it.pos, 40)) {
    if (!it.gOk || it.ground) groundUnder(it);
    const k = it.fuse >= 0 ? 1 - it.fuse / s.fuse : 1 - it.next / s.gap;
    if (it.gOk) G.fx.dangerRing?.(_v.copy(it.gp).addScaledVector(it.gn, 0.02), it.gn, G.teamColors[it.team], s.radius, clamp(k, 0, 1));
    const lit = 2.3 + 2.5 * Math.max(0, Math.sin(it.age * (14 + 20 * k)));
    for (let i = 0; i < 3; i++) it.m.mats[i].emissiveIntensity = i < it.left ? lit : 0.05;
  }
}
function contactFloor(it, n, dt) {
  const vn = it.vel.dot(n);
  if (vn < -2.2) { it.vel.addScaledVector(n, -vn).multiplyScalar(0.45).addScaledVector(n, -vn * 0.3); }   // a dull bounce: it lands near where it hits
  else if (vn < 0) { it.vel.addScaledVector(n, -vn); const f = Math.exp(-6 * dt); it.vel.x *= f; it.vel.z *= f; }   // resting: slide to a stop
  if (!it.armed) arm(it);
  return true;
}
function arm(it) {
  it.armed = true; it.fuse = it.sub.fuse;
  groundUnder(it);
  G.cues?.sub('shaker', 'land', { owner: it.owner, team: it.team, at: it.pos });   // sfx-cues: armed (its rattle loop speeds to each blast)
  emit('bomb:arm', { actor: it.owner, pos: it.pos.clone(), team: it.team, radius: it.sub.radius, kind: 'shaker' });
}
function groundUnder(it) {
  const g = G.physics.raycast(_v2.copy(it.pos).setY(it.pos.y + 0.1), DOWN, 2.5, _hit2, true);
  it.gOk = g.hit;
  if (g.hit) { it.gp.copy(g.point); it.gn.copy(g.normal); }
}
function near(p, r) { const c = G.rig?.gameCam || G.camera; return !!c && c.position.distanceToSquared(p) < r * r; }
function credit(it, area) { if (it.sp) it.owner.addTurfNoSpecial(area); else it.owner.addTurf(area); }

function drip(it) {
  _v.copy(it.pos); _v.y -= 0.1;
  G.projectiles.spawnDrop(it.owner, _v, it.vel.x * 0.2 + (Math.random() - 0.5) * 0.5, -2.2 - Math.random(), it.vel.z * 0.2 + (Math.random() - 0.5) * 0.5,
    { damage: 0, radius: it.sub.trailRadius * (0.85 + Math.random() * 0.3), size: 0.045 });
}

function blast(it) {
  const s = it.sub, a = it.owner, team = it.team, col = G.teamColors[team];
  const c = it.pos.clone();
  if (!it.ghost) netRec(a, 'shaker', [1, it.gid, r2(c.x), r2(c.y), r2(c.z)]);
  it.blasts++; it.left--;
  // ink: the floor it stands on + a few satellite splats
  let area = 0;
  const g = G.physics.raycast(_v.copy(c).setY(c.y + 0.2), DOWN, 3.5, _hit);
  area += G.paint.splat(g.hit ? _v2.copy(g.point).addScaledVector(g.normal, 0.1) : c, s.paintRadius, team, { seed: Math.random() });
  for (let k = 0; k < 3; k++) {
    const ang = Math.random() * Math.PI * 2, r = s.paintRadius * (0.55 + Math.random() * 0.4);
    area += G.paint.splat(_v3.set(c.x + Math.cos(ang) * r, c.y + 0.3, c.z + Math.sin(ang) * r), 0.45 + Math.random() * 0.3, team, { seed: Math.random() });
  }
  credit(it, area);
  G.fx?.explosion(c, col, s.radius * 0.95);
  G.cues?.sub('shaker', 'boom', { owner: a, team, at: c, pitch: 1 + 0.06 * it.blasts });   // sfx-cues: its own fizzy blast, a step up each time
  emit('shake', { pos: c.clone(), amount: 0.45 });
  emit('bomb:explode', { actor: a, pos: c.clone(), team, radius: s.radius, kind: 'shaker', n: it.blasts });
  const loc = G.local;
  if (loc && loc.alive) { const d = loc.pos.distanceTo(c); if (d < 12) G.input?.rumble?.(clamp(1 - d / 12, 0, 1) * 0.45, clamp(1 - d / 12, 0, 1) * 0.4, 120); }
  // damage: like a smaller Splat Bomb (line of sight from just above the can)
  _v2.copy(c); _v2.y += 0.3;
  for (const e of G.actors) {
    if (e.team === team || !e.alive) continue;
    _v.copy(e.pos); _v.y += e.form === 'squid' ? 0.3 : 0.7;
    const d = _v.distanceTo(c);
    if (d > s.radius || !G.physics.los(_v2, _v)) continue;
    const k = 1 - clamp((d - 0.8) / (s.radius - 0.8), 0, 1);
    G.projectiles.applyHit(a, e, lerp(s.damageMin, s.damageMax, k * k), 'shaker');
  }
  G.subs?.damageArea(c, s.radius, 40, team);
  G.boss?.splash(a, c, s.radius, s.damageMax, s.damageMin, 'shaker');   // Boss Battle
  if (it.left > 0) {
    // the blast kicks it forward and up; the next one goes off `gap` later (usually just after it lands)
    it.vel.set(it.dir.x * s.hopSpeed, s.hopUp, it.dir.z * s.hopSpeed);
    it.next = s.gap; it.ground = 0;
    it.spin.set(8 + Math.random() * 6, 0, (Math.random() - 0.5) * 6);
    if (near(c, 30)) G.audio?.play('shaker_hop', { pos: c, volume: 0.6 });
    lamps(it);
  } else it.state = 'dead';
}

function dispose(it) {
  G.scene?.remove(it.m.outer);
  for (const m of it.m.mats) m.dispose();
}

// ================================================================================================= HUD: three pips by the sub chip
let pipEl = null, pipL = null;
function pips() {
  const a = G.local, r = a?.weaponRunner, st = r?.shaker;
  const show = !!(a && a.alive && r.aimingSub && st && G.time - st.t1 < 0.15 && a.sub?.kind === 'shaker');
  const xh = G.hud?.xh;
  if (!xh || (!show && !pipEl)) return;
  if (!pipEl || pipEl.parentNode !== xh) {
    if (!document.getElementById('iw-shk-css')) {
      const css = document.createElement('style'); css.id = 'iw-shk-css';
      css.textContent = `.iw-shk { position: absolute; left: -14px; top: 55px; display: flex; gap: 4px; pointer-events: none; opacity: 0; scale: .6; transition: opacity .12s, scale .25s var(--spring, ease-out); }
.iw-shk.is-on { opacity: 1; scale: 1; }
.iw-shk i { position: relative; display: block; width: 14px; height: 7px; border-radius: 999px; background: rgba(14, 11, 22, .78); box-shadow: 0 0 0 1.5px rgba(255, 255, 255, .5); overflow: hidden; }
.iw-shk i::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: var(--self, #fff); transform-origin: left; transform: scaleX(var(--p, 0)); }
.iw-shk i.is-full { box-shadow: 0 0 0 1.5px #fff, 0 0 7px var(--self, #fff); }
.iw-shk.is-max i { animation: iw-shk-max .45s ease-out; }
@keyframes iw-shk-max { 0% { scale: 1.7; filter: brightness(2.2); } }`;
      document.head.appendChild(css);
    }
    pipEl = document.createElement('div'); pipEl.className = 'iw-shk'; pipEl.innerHTML = '<i></i><i></i><i></i>';
    xh.appendChild(pipEl); pipL = { on: null, lv: 0, p: [-1, -1, -1] };
  }
  if (show !== pipL.on) { pipL.on = show; pipEl.classList.toggle('is-on', show); }
  if (!show) return;
  const f = st.meter;
  for (let i = 0; i < 3; i++) {
    const p = i === 0 ? 1 : clamp(f * 2 - (i - 1), 0, 1);
    if (Math.abs(p - pipL.p[i]) > 0.02 || (p === 1) !== (pipL.p[i] === 1)) {
      pipL.p[i] = p;
      const el = pipEl.children[i];
      el.style.setProperty('--p', p.toFixed(2));
      el.classList.toggle('is-full', p >= 1);
    }
  }
  if (st.level !== pipL.lv) { pipL.lv = st.level; if (st.level >= 3) { pipEl.classList.remove('is-max'); void pipEl.offsetWidth; pipEl.classList.add('is-max'); } else pipEl.classList.remove('is-max'); }
}

// ================================================================================================= registration
SUB_KITS.shaker = {
  use,
  hold,
  ghost,
  tick(dt) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      ghostMute(it, () => update(it, dt));
      if (it.state === 'dead') {
        if (!it.ghost && it.left > 0) netRec(it.owner, 'shaker', [2, it.gid]);   // sank without going off
        dispose(it); items.splice(i, 1);
      }
    }
    // a charge whose hold stopped without a throw (dived into ink, loadout swap, …): drop it quietly
    for (const a of G.actors) { const st = a.weaponRunner?.shaker; if (st && G.time - st.t1 > 0.15) drop(a, false); }
    pips();
  },
  clear() {
    for (const it of items) dispose(it);
    items.length = 0;
    for (const a of G.actors) if (a.weaponRunner?.shaker) drop(a, false);
    if (pipEl && pipL?.on) { pipL.on = false; pipEl.classList.remove('is-on'); }
  },
  items,
  bot: {
    // a mid-range lob at the fight (the hold then charges it to the range: see botHold)
    fight(brain, dist) {
      const go = dist > 4 && dist < 14 && Math.random() < 0.03 * (1 + brain.diff.fireDiscipline);
      if (go) brain.bombCd = 5 + Math.random() * 5;
      return go;
    },
    // now and then while painting: three hops leave a long stripe of ink
    paint(brain) {
      const go = Math.random() < 0.0012;
      if (go) brain.bombCd = 9 + Math.random() * 8;
      return go;
    },
  },
};
THROWN.shaker = true;
