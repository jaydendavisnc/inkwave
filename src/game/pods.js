// Sprout pods: growable plants (Eco-Forest Treehills' gimmick — any stage can have them). Seed bulbs in planters; ink
// one and the team that fills its meter first grows the plant: that team's, tinted in its ink. Two kinds, set per pod:
//   • bramble wall (kind 'wall', the default): a thick thorny wall laid across a real route, its length set by the
//     layout so its ends meet solid geometry — grown, the route is closed. ~2.7 m tall (over a jump: nobody hops it),
//     ~1.2 m deep. Its owners swim up its faces (their ink only) and walk its top: a gate for them, a closed door for
//     the enemy (detour, or cut it down). Old pod data (no kind) is a wall of its given size
//   • canopy (kind 'canopy'): a thick trunk under a broad leafy platform (~3.2 × 3.2 m, its top at ~3 m) rimmed by a
//     low leafy parapet (0.4 m: cover). Two curtains of aerial roots hang from the platform's ±z edges to the ground,
//     flush with its edge and the parapet's outer face: the owners swim straight up one onto the platform. Under the
//     platform it's open (a walk-through either side of the trunk: shelter from above, not one big block)
// Each reads differently while dormant (the default looks: a long trough and a row of thorny buds for a wall, a round
// tub and one big leaf-crowned seed for a canopy — props-pods.js).
//
// LAYOUT.pods = {
//   mirror: true,                                   // each listed pod gets its 180° twin ((x, z) → (−x, −z), rotY + π)
//   timing: { last: 22, wilt: 1.0, recharge: 8, grow: 0.5 },   // s (optional)
//   modes: { boss: 'on' },                          // per match mode: 'on' (default) | 'off' (inert bulbs)
//   bulbY: 0.5,                                     // the bulb's base over the pod's floor: its planter's height
//   planter: false,                                 // true / { type }: the engine draws + collides the planters too
//                                                   //   (a stage normally places its own, as props with colliders)
//   life: { wall, canopy },                         // optional: the plants' life (PODS.kinds.*.life)
//   list: [{ id, pos: [x, y, z],                    // the pod on the floor at pos (y = floor height)
//            kind: 'wall' | 'canopy',               // (default 'wall')
//            rotY: 0,                               // radians (like prop placements): turns the plant
//            size: [w, h, d],                       // wall: its length (local x, across rotY), height, depth (local z);
//                                                   //   canopy: the platform's width (x), its top's height, depth (z)
//            canopy: { trunk, deck, rail, railW, roots, rootsD },   // optional (canopy): the trunk's width, the
//                                                   //   platform's thickness, the parapet's height / thickness, the
//                                                   //   root curtains' width / depth
//            life,                                  // optional: this plant's life
//            bulbY, col: [w, h, d],                 // optional per pod: its bulb's height; its planter's size (the
//                                                   //   plant bursts out of that box; per kind default: PODS.kinds)
//            pod: { type, ...PropKit opts },         // looks (props-pods.js has the contract); default sprout_pod /
//            hedge: { type, ...opts } }],           //   sprout_bramble (wall), sprout_canopy (canopy)
// }
//
// Rules:
//   • meters: each team has its own on every pod. A splat (any main, sub or special ink: Paint.splat forwards every
//     one, online ones too) reaching the bulb adds to its team's meter in proportion to how much of it lands (the share
//     of the bulb it covers × its size², × opts.pod for the weapons whose single shot should count for more). A meter
//     left alone drains. The first team to fill its meter grows the plant — that team's plant
//   • growing: it bursts out of the pod in PODS.timing.grow s (a wall spreads out of its trough; a canopy's trunk shoots
//     up, then its crown spreads) — players and squids where it grows are shoved aside: only where their body fits over
//     floor, never through a wall or into the sea (if someone can't be, the pod waits, meter full). It stands `last` s,
//     wilts `wilt` s (anyone on top is lowered with it; a canopy's crown first draws in over its trunk) and recharges
//     `recharge` s
//   • the plant: solid blocks (moves, shots and sight stop at them), tinted to its team. They take its team's ink only:
//     the climb faces in it are swum up, the tops in it are ground to swim / refill / hide in (BoxPaint per block, read
//     by Actor._surface / _wallInk). The other team's shots still hit it as cover. Its ink goes when it wilts
//   • life: a grown plant has PODS.kinds.<kind>.life. Enemy ink reaching it (the same splat stream: the share of the
//     splat that lands on it — 1 at its face, fading to 0 a radius off — × radius², × the heavy-shot weight: cutWeight)
//     drains it; the owners' own ink never does. It browns and sheds leaves as it goes, cracks at PODS.crack, and at
//     zero it's cut down: it wilts early. Calibrated (tools/botlab/tests/pods.js): one Spritzer firing steadily cuts a
//     wall in ~5 s, two in ~2.5 s, a canopy a little quicker
//   • Tower Command: a pod whose plant would overlap the track (the platform's sweep + headroom) sits the mode out; any
//     other waits (meter full) while the tower's footprint + margin overlaps the plant's footprint
//   • Boss Battle (modes.boss 'on'): a plant stops HULLBREAKER's charge like a wall (BossNav.cast asks dynWall); it
//     tramples one it walks into (it wilts); a pod waits while the boss stands where it would grow
//   • nav: the nodes a plant's ground blocks cover (a wall's body, a canopy's trunk; + a player's width) are marked
//     blocked (stageKit nav layers; bots replan); under a canopy's platform stays open
//
// Sync: the host runs the meters and the plants' life (it sees every splat) and records ['g', pod, team, t] when a
// plant grows (t: the stage clock, the synced match clock — stageKit.js StageClock), ['w', pod, t, cut] when one wilts
// early (cut: 1 = cut down by enemy ink, 0 = trampled) and ['m', meters…] (2 Hz, only when they changed) for the pods'
// look; followers replay them. Life isn't synced: each follower runs its own estimate from the splats it sees, for the
// look only (the host's record is the truth). Everything else (the pose, the wilt, the recharge) follows from the grow
// time on every client, and each client shoves its own squidkids.
//
// Bots (bots.js calls StagePods.bot):
//   • in a fight (or guarding a zone with a foe about), a dormant wall pod whose wall would stand between us and a foe
//     coming → ink it (close the route) and fight from behind it; a dormant canopy near a fight at range / the zone
//     we're guarding → ink it, then climb it
//   • our plant near a fight / a zone we're guarding → ink a column of a climb face, swim up and fight from the top
//     (holding the parapet's side toward the foe on a canopy); off it when there's no reason to stay
//   • a route a standing plant cuts: round it when the way round is ≤ 1.6 × the route; else, theirs → walk up and cut
//     it down; ours → climb over it (the gate). Never climb theirs.
import * as THREE from 'three';
import { G, clamp, angleDiff } from '../core/ctx.js';
import { PLAYER, TOWER } from '../config.js';
import { SFX, texture } from '../audio/audio.js';
import { BoxPaint } from './towerPaint.js';
import { Hit } from './physics.js';
import { TOWER_HEAD } from './tower.js';
import { POD_HINT } from './weapons.js';
import { StageClock, navClaim, navCommit, navRelease, navNodesInBox, shovable, shoveActor, floorFor, clearLine, buildLook, disposeLook } from './stageKit.js';

export const PODS = {
  timing: { grow: 0.5, last: 22, wilt: 1.0, recharge: 8 },
  // per kind: the default size, planter (the plant bursts out of it) and life, the default look
  kinds: {
    wall: { size: [5, 2.7, 1.2], col: [1.6, 0.5, 0.7], life: 29, look: 'sprout_bramble' },
    canopy: { size: [3.2, 3.0, 3.2], col: [1.1, 0.5, 1.1], life: 21.5, look: 'sprout_canopy', trunk: 1.3, deck: 0.45, rail: 0.4, railW: 0.25, roots: 1.3, rootsD: 0.28 },
  },
  legacyCol: [0.9, 0.5, 0.9],   // old pod data (no kind): its planter
  bulbY: 0.5,             // the bulb's base over the pod's floor (its planter's height), unless the layout says
  bulbH: 0.5,             // the catch (what a splat must reach): a column of radius catchR from the floor to bulbY + bulbH
  catchR: 0.5,
  bulbCol: [0.5, 0.5],    // the bulb's own collider (w = d, h) on the planter: shots at it land on it; never inked
  skin: 0.02,             // the plant's blocks are this much wider / deeper than its size: faces clear of the planter's
  need: 7,                // ink to fill a meter: Σ cover × radius² (× opts.pod) — calibrated in tools/botlab/tests/pods.js
  drainDelay: 1.5,        // s without a team's ink before its meter drains …
  drain: 0.15,            // … at this much a second
  crack: 0.3,             // a plant cracks (the cue: a woody crack, a shower of dry leaves) at this much life left
  towerMargin: 0.6,       // m round the tower's platform a plant won't grow into
  bossMargin: 0.5,
  swell: 0.55,            // the bulb's scale-up at a full meter
  sheen: 0.035,           // the plant's leaves (foliage) get this much of its team's ink as a sheen; blossoms (gloss) more
  blush: 0.35,            // a dormant bulb blushes up to this far toward the team that's ahead on it (its glow says the rest)
  withered: 0.55,         // how far the leaves brown as the life runs out (a wilt browns them the rest of the way)
};
// A splat's weight against a plant's life: its ink (share × r²), a charger's charged shot counting for more (its splat
// is small for the hit it is: × opts.pod, 1 + 4.5 · charge²). A roller flick's drops and other thrown drops carry a
// meter weight (opts.pod) because only a few of them land on a small bulb; every one of them lands on a wall, so
// against a plant they count as plain ink
export function cutWeight(opts) {
  const w = opts && opts.pod;
  if (!w || w === POD_HINT.flick || w === POD_HINT.drop) return 1;
  return w;
}
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
const BROWN = new THREE.Color('#8a6a3a'), DRY = new THREE.Color('#a08a52');
const smooth = (s) => s * s * (3 - 2 * s);
const easeOut = (s) => 1 - (1 - s) * (1 - s) * (1 - s);
const backOut = (s) => { const c = 1.9; return 1 + (c + 1) * Math.pow(s - 1, 3) + c * Math.pow(s - 1, 2); };
const lerp = (a, b, k) => a + (b - a) * k;

// ------------------------------------------------------------------------------------------------ the layout
// A plant's blocks, in its own frame (x across, z along its heading, y up from its floor): { id, x, z (centre), hx, hz
// (half sizes), y0, y1, paint (null: every face takes ink, false: none, [ids]: those faces — BoxPaint's 'deck' (top),
// '+x', '-x', '+z', '-z'), top (the one you stand on), ground (on the floor once grown: shoving, nav), crown (it rides
// the trunk's top as the plant grows, spreading out over it: the canopy's platform, parapet and root curtains; the
// others spread out of the planter) }. Every climb face is on ±z; the first block is the body / trunk.
function plantParts(kind, w, h, d, cn) {
  const s = PODS.skin / 2, hx = w / 2 + s, hz = d / 2 + s;
  if (kind !== 'canopy') return [{ id: 'body', x: 0, z: 0, hx, hz, y0: 0, y1: h, paint: null, top: true, ground: true }];
  const tw = cn.trunk / 2, yd = h - cn.deck, rh = cn.rail, rw = cn.railW, vw = cn.roots / 2, vd = cn.rootsD;
  return [
    // the trunk (no ink: a squid up it would only reach the platform's underside)
    { id: 'trunk', x: 0, z: 0, hx: tw, hz: tw, y0: 0, y1: yd, paint: false, ground: true },
    // the root curtains: their outer faces are the climb, on up the platform's edge and the parapet's outer face
    { id: 'roots+z', x: 0, z: hz - vd / 2, hx: vw, hz: vd / 2, y0: 0, y1: yd, paint: ['+z'], ground: true, crown: true },
    { id: 'roots-z', x: 0, z: -(hz - vd / 2), hx: vw, hz: vd / 2, y0: 0, y1: yd, paint: ['-z'], ground: true, crown: true },
    { id: 'deck', x: 0, z: 0, hx, hz, y0: yd, y1: h, paint: null, top: true, crown: true },
    // the parapet: its ±z runs' outer faces carry the climb up over it; the ±x runs between them
    { id: 'rail+z', x: 0, z: hz - rw / 2, hx, hz: rw / 2, y0: h, y1: h + rh, paint: ['+z', 'deck'], crown: true },
    { id: 'rail-z', x: 0, z: -(hz - rw / 2), hx, hz: rw / 2, y0: h, y1: h + rh, paint: ['-z', 'deck'], crown: true },
    { id: 'rail+x', x: hx - rw / 2, z: 0, hx: rw / 2, hz: hz - rw, y0: h, y1: h + rh, paint: false, crown: true },
    { id: 'rail-x', x: -(hx - rw / 2), z: 0, hx: rw / 2, hz: hz - rw, y0: h, y1: h + rh, paint: false, crown: true },
  ];
}
// every pod (twins included) in a fixed order — the looks and the rules index them the same
let _warnedDeg = false;
export function podDefs(layout) {
  const def = layout && layout.pods;
  if (!def || !Array.isArray(def.list) || !def.list.length) return [];
  const out = [];
  for (const p of def.list) {
    if (!p || !Array.isArray(p.pos)) continue;
    let rot = +p.rotY || 0;
    if (Math.abs(rot) > TAU + 0.01) { if (!_warnedDeg) { _warnedDeg = true; console.warn('[inkwave] pods: rotY is in radians — read', rot, 'as degrees'); } rot *= DEG; }
    const kind = p.kind === 'canopy' ? 'canopy' : 'wall', K = PODS.kinds[kind], legacy = !p.kind;
    const [w, h, d] = p.size || K.size;
    const col = p.col || def.col || (legacy ? PODS.legacyCol : K.col);
    const bulbY = p.bulbY ?? def.bulbY ?? PODS.bulbY;
    const cn = kind === 'canopy' ? { trunk: Math.min(K.trunk, w - 1.9, d - 1.9), deck: K.deck, rail: K.rail, railW: K.railW, roots: Math.min(K.roots, w - 1.9), rootsD: K.rootsD, ...(p.canopy || {}) } : null;
    const parts = plantParts(kind, w, h, d, cn);
    const life = p.life ?? (def.life && def.life[kind]) ?? K.life;
    for (const twin of def.mirror ? [false, true] : [false]) {
      const s = twin ? -1 : 1;
      out.push({ id: (p.id || 'pod' + out.length) + (twin ? '~' : ''), x: s * p.pos[0], y: p.pos[1] ?? 0, z: s * p.pos[2], yaw: rot + (twin ? Math.PI : 0),
        kind, legacy, w, h, d, ht: cn ? h + cn.rail : h, cn, parts, life, col, bulbY, pod: p.pod || {}, hedge: p.hedge || {}, planter: def.planter || null, twin });
    }
  }
  return out;
}
// the engine's planters' colliders (Level extras: solid, never inked, a top you slide off) — only when the layout asks
// for the engine's planters (pods.planter); a stage normally places its own planters as props with their colliders
export function podColliders(layout) {
  return podDefs(layout).filter((p) => p.planter).map((p) => ({ obox: true, center: [p.x, p.y + p.col[1] / 2, p.z], size: [...p.col], rotY: p.yaw / DEG, roof: true }));
}

// ------------------------------------------------------------------------------------------------ the looks (per world)
// The bulbs (and, when the layout asks for them, the engine's planters), built with the stage (main.js _buildWorldNow)
// so they're there in every shot, match or not; the match's StagePods drives each bulb's swell / blush / glow. Each bulb
// has its own copies of its materials. The plants are built here too, once per team in that team's ink (`tint`), and
// again whenever the palette changes (hedge()).
export class PodLooks {
  constructor(layout) {
    this.defs = podDefs(layout);
    this.items = [];
    this.palKey = '';
    if (!this.defs.length || !G.scene) return;
    const kit = G.game?.props;
    for (const d of this.defs) {
      const root = new THREE.Group();
      root.name = 'pod:' + d.id;
      root.position.set(d.x, d.y, d.z); root.rotation.y = d.yaw;
      const type = d.pod.type && kit?.hasType?.(d.pod.type) ? d.pod.type : 'sprout_pod';
      const o = { ...d.pod, kind: d.legacy ? null : d.kind, col: d.col };
      let planter = null;
      if (d.planter) { planter = buildLook({ ...o, ...(typeof d.planter === 'object' ? d.planter : {}), type: d.planter.type || type, part: 'planter' }, 'sprout_pod'); root.add(planter); }
      // the bulb: its origin at its base, anchored on the planter at bulbY, scaled from there
      const pivot = new THREE.Group(); pivot.position.set(0, d.bulbY, 0);
      const bulb = buildLook({ ...o, type, part: 'bulb' }, 'sprout_pod');
      pivot.add(bulb); root.add(pivot);
      const mats = [];
      bulb.traverse((m) => { if (!m.isMesh || !m.material) return; m.material = m.material.clone(); mats.push(m.material); m.material.userData.c0 = m.material.color.clone(); });
      G.scene.add(root);
      this.items.push({ def: d, root, planter, pivot, bulb, mats, k: -1, hedge: null });
    }
  }
  // pod i's bulb: swell 0…1 (the meter), blush toward team t (−1: none) by k, glow 0…1; show false hides it (a plant);
  // size: its overall scale (a bulb growing back after a wilt)
  set(i, swell, t, k, glow, show = true, size = 1) {
    const it = this.items[i];
    if (!it) return;
    it.pivot.visible = show;
    if (!show) return;
    const s = (1 + PODS.swell * swell) * size;
    if (Math.abs(s - it.k) > 1e-3) { it.k = s; it.pivot.scale.set(s, s * (1 + 0.08 * swell), s); }
    const col = t >= 0 && G.teamColors ? G.teamColors[t] : null;
    for (const m of it.mats) {
      m.color.copy(m.userData.c0);
      if (col && k > 0) m.color.lerp(_c.copy(col), k);
      if (m.emissive) { if (col && glow > 0) m.emissive.copy(col).multiplyScalar(glow); else m.emissive.setRGB(0, 0, 0); }
    }
  }
  reset() { for (let i = 0; i < this.items.length; i++) { this.set(i, 0, -1, 0, 0, true); const h = this.items[i].hedge; if (h) { h.root.visible = false; h.animT.scale.set(1, 1, 1); h.animC.scale.set(1, 1, 1); h.animC.position.set(0, 0, 0); } } }

  // pod i's plant looks: { root (at the pod, turned), animT / animC (the ground part's look / the crown's: the rules pose
  // them), team: [[looks in team 0's ink], [team 1's]], mats: [[{ m, kind }: foliage / gloss material copies], …] } —
  // (re)built for the current palette
  hedge(i) {
    const it = this.items[i];
    if (!it || !G.teamColors) return null;
    const key = G.teamColors.map((c) => c.getHexString()).join();
    if (key !== this.palKey) { this.palKey = key; for (const x of this.items) this._dropHedge(x); }
    if (!it.hedge) it.hedge = this._buildHedge(it.def);
    return it.hedge;
  }
  _buildHedge(d) {
    const kit = G.game?.props;
    const root = new THREE.Group();
    root.name = 'plant:' + d.id;
    root.position.set(d.x, d.y, d.z); root.rotation.y = d.yaw;
    const animT = new THREE.Group(), animC = new THREE.Group();
    animT.name = 'plant-ground'; animC.name = 'plant-crown';
    root.add(animT, animC);
    const def = PODS.kinds[d.kind].look;
    const type = d.hedge.type && kit?.hasType?.(d.hedge.type) ? d.hedge.type : def;
    const team = [], mats = [];
    for (let t = 0; t < 2; t++) {
      const o = { ...d.hedge, type, kind: d.kind, size: [d.w, d.h, d.d], w: d.w, h: d.h, d: d.d, tint: G.teamColors[t].clone(), team: t, ...(d.cn || {}) };
      const looks = d.kind === 'canopy' ? [buildLook({ ...o, part: 'trunk' }, def), buildLook({ ...o, part: 'crown' }, def)] : [buildLook(o, def)];
      const ms = [];
      looks.forEach((look, k) => {
        look.userData.tint = G.teamColors[t].getHexString();
        // (its own copies of the leaf / blossom materials: a sheen of the team's ink, browning as it's cut / wilts)
        look.traverse((m) => {
          if (!m.isMesh || !m.material || !kit?.mat) return;
          const kind = m.material === kit.mat.foliage ? 'leaf' : m.material === kit.mat.gloss ? 'bloom' : null;
          if (!kind) return;
          m.material = m.material.clone(); m.material.userData.c0 = m.material.color.clone();
          ms.push({ m: m.material, kind });
        });
        look.visible = false;
        (k === 0 ? animT : animC).add(look);
      });
      team.push(looks); mats.push(ms);
    }
    root.visible = false;
    G.scene?.add(root);
    return { root, animT, animC, team, mats };
  }
  _dropHedge(it) {
    const h = it.hedge;
    if (!h) return;
    for (const ms of h.mats) for (const { m } of ms) m.dispose();
    for (const looks of h.team) for (const look of looks) disposeLook(look);
    for (const g of [h.animT, h.animC]) for (const c of [...g.children]) g.remove(c);   // (a match's ink overlays are its own to dispose)
    h.root.removeFromParent();
    it.hedge = null;
  }
  dispose() {
    for (const it of this.items) {
      for (const m of it.mats) m.dispose();
      disposeLook(it.planter); disposeLook(it.bulb);
      this._dropHedge(it);
      it.root.removeFromParent();
    }
    this.items.length = 0;
  }
}

// ------------------------------------------------------------------------------------------------ geometry helpers
// share of a disc of radius R covered by a disc of radius r whose centre is d away (0…1)
function coverFrac(r, R, d) {
  if (d >= r + R) return 0;
  if (d <= Math.abs(r - R)) return Math.min(1, (Math.min(r, R) * Math.min(r, R)) / (R * R));
  const a = r * r * Math.acos(clamp((d * d + r * r - R * R) / (2 * d * r), -1, 1)) + R * R * Math.acos(clamp((d * d + R * R - r * r) / (2 * d * R), -1, 1))
    - 0.5 * Math.sqrt(Math.max(0, (-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R)));
  return clamp(a / (Math.PI * R * R), 0, 1);
}
// two turned rectangles (centre, yaw, half sizes) overlap? (separating axes)
function rectsOverlap(ax, az, ay, ahx, ahz, bx, bz, by, bhx, bhz) {
  const A = [[Math.cos(ay), -Math.sin(ay)], [Math.sin(ay), Math.cos(ay)]], B = [[Math.cos(by), -Math.sin(by)], [Math.sin(by), Math.cos(by)]];
  const dx = bx - ax, dz = bz - az;
  for (const [ux, uz] of [...A, ...B]) {
    const ra = ahx * Math.abs(A[0][0] * ux + A[0][1] * uz) + ahz * Math.abs(A[1][0] * ux + A[1][1] * uz);
    const rb = bhx * Math.abs(B[0][0] * ux + B[0][1] * uz) + bhz * Math.abs(B[1][0] * ux + B[1][1] * uz);
    if (Math.abs(dx * ux + dz * uz) > ra + rb) return false;
  }
  return true;
}
// the 1-D span [c − h, c + h] of `inner` fitted inside `outer`'s (keeps its size up to outer's)
function fitSpan(c, h, oc, oh) { const hs = Math.min(h, oh); return [clamp(c, oc - oh + hs, oc + oh - hs), hs]; }

// the ink on one of a plant's blocks: a BoxPaint whose faces outside `faces` never take any
class PartPaint extends BoxPaint {
  constructor(frame, o, faces) { super(frame, o); this.mask = faces ? this.surf.map((s) => faces.includes(s.id)) : null; }
  _paint(s, a, b, rr, team, seed) { if (this.mask && !this.mask[this.surf.indexOf(s)]) return; super._paint(s, a, b, rr, team, seed); }
}

// ------------------------------------------------------------------------------------------------ the rules (per match)
export class StagePods {
  // null when the stage has none, or they sit this mode out
  static create(match) {
    const layout = G.level?.layout, defs = podDefs(layout);
    if (!defs.length) return null;
    const mode = (layout.pods.modes && layout.pods.modes[match.mode]) || 'on';
    if (mode === 'off') return null;
    return new StagePods(match, layout.pods, defs);
  }

  constructor(match, def, defs) {
    this.match = match;
    this.def = def;
    this.T = { ...PODS.timing, ...(def.timing || {}) };
    this.clock = new StageClock();
    const L = G.game?.podLooks;
    this.looks = L && L.items.length === defs.length ? L : null;
    this.looks?.reset();
    this.pods = defs.map((d, i) => this._makePod(d, i));
    this.snapT = 0; this.sent = null;
    this.stats = { grown: 0, held: 0, shoved: 0, trampled: 0, cut: 0, cracked: 0, carried: 0, detours: 0, waits: 0, perched: 0, exits: 0, cuts: 0, crossings: 0, byPod: {} };
    // Tower Command: pods whose plant would stand on the track sit the mode out
    const T = match.tower;
    if (T) for (const p of this.pods) if (this._onTrack(p, T)) { p.off = 'track'; p.bulbBlock.solid = false; console.warn('[inkwave] pods:', p.id, 'would grow onto the tower track — off in Tower Command'); }
    // nav: this set's own layer (+ the plants' cores: routes never enter them — _botRoute; and whose they are)
    this.blk = navClaim(this);
    this.hard = G.nav ? new Uint8Array(G.nav.nodes.length) : null;
    this.hardPod = G.nav ? new Int16Array(G.nav.nodes.length).fill(-1) : null;
    this.navDirty = false;
    // Boss Battle: its charge stops at a plant
    if (G.boss?.nav) { this.bossNav = G.boss.nav; this.bossNav.dynWall = (x, z, r) => this.bossWall(x, z, r); }
    this.leaves = G.scene && typeof document !== 'undefined' ? new LeafPuffs(G.scene) : null;
  }
  get follower() { return !!this.match.follower; }
  get t() { return this.clock.t; }
  _net(e) { if (!this.follower) G.netm?.recPods?.(e); }

  _makePod(d, i) {
    const p = { i, id: d.id, def: d, kind: d.kind, x: d.x, y: d.y, z: d.z, yaw: d.yaw, w: d.w, h: d.h, d: d.d, ht: d.ht,
      meter: [0, 0], inkT: [-9, -9], fullT: [-1, -1], rustleT: -9,
      state: 'dormant', owner: -1, t0: 0, wiltAt: 0, off: '', held: '', cutBy: false,
      life: d.life, life0: d.life, hitT: -9, shedT: -9, hitSndT: -9, cracked: false, crackT: -9, hitSide: 1, shake: 0, brown: 0,
      look: null, k: 0, top: d.y, c: Math.cos(d.yaw), s: Math.sin(d.yaw) };
    // its footprint's half sizes (the tower, the boss, bots)
    p.hw = d.w / 2 + PODS.skin / 2; p.hd = d.d / 2 + PODS.skin / 2;
    // its blocks (dynamic level blocks: parked, not solid, until it grows), each with its ink (the grower's only)
    const acc = (t) => t === p.owner && (p.state === 'stand' || p.state === 'wilt');
    p.parts = d.parts.map((q, k) => {
      const part = { ...q, k, blk: G.level.addDynamic({ tag: 'plant:' + d.id + ':' + q.id }), paint: null, ink: null, frame: null,
        wx: p.x + q.x * p.c + q.z * p.s, wz: p.z - q.x * p.s + q.z * p.c, topY: d.y + q.y1,
        box: { lx: q.x, lz: q.z, hx: q.hx, hz: q.hz, y0: q.y0, y1: q.y1 }, cur: { lx: q.x, lz: q.z, hx: q.hx, hz: q.hz, y0: q.y0, y1: q.y1 } };
      part.blk.solid = false;
      this._park(part.blk, i * 8 + k);
      if (q.paint !== false && typeof document !== 'undefined') {
        part.frame = { pos: new THREE.Vector3(part.wx, p.y + q.y0, part.wz), yaw: p.yaw };
        part.paint = new PartPaint(part.frame, { hx: q.hx, hz: q.hz, h: q.y1 - q.y0, ppm: 48, accept: acc }, q.paint);
        part.blk.inkPaint = part.paint;
        // its look: drawn from the paint's canvas just off the block's faces (on the plant's look: _hedge)
        if (G.scene) {
          const mat = new THREE.MeshStandardMaterial({ map: part.paint.texture, transparent: true, roughness: 0.3, metalness: 0, side: THREE.DoubleSide,
            depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
          const ink = part.paint.inkMesh(mat);
          ink.position.set(q.x, q.y0, q.z);
          ink.renderOrder = 1; ink.name = 'plant-ink:' + d.id + ':' + q.id;
          ink.onBeforeRender = (r, scene, cam, geo) => { geo.drawRange.count = scene.overrideMaterial ? 0 : Infinity; };   // (out of the AO pass)
          part.ink = ink;
        }
      }
      return part;
    });
    p.block = p.parts[0].blk;                            // (the body / the trunk)
    p.ground = p.parts[0];
    p.topPart = p.parts.find((q) => q.top);
    // how far off the middle a climb column may run (a wall: along its face; a canopy: across its root curtain)
    const rc = p.parts.find((q) => q.id === 'roots+z');
    p.climbHalf = rc ? Math.max(0, rc.hx - 0.35) : Math.max(0, p.w / 2 - 0.45);
    p.ids = new Set(p.parts.map((q) => q.blk.id));
    p.paint = p.topPart.paint;                           // (its top's ink: tests, the HUD)
    // the bulb's (solid while it's there to shoot at: dormant)
    const [bw, bh] = PODS.bulbCol;
    p.bulbBlock = G.level.addDynamic({ tag: 'pod:' + d.id, roof: true });
    G.level.moveDynamic(p.bulbBlock, _v.set(d.x, d.y + d.bulbY + bh / 2, d.z), _v2.set(bw / 2, bh / 2, bw / 2), d.yaw);
    // nav nodes under its ground blocks (+ a player's width), on its floor; and the ones a body can't stand on at all
    // while it stands (a route through them goes through it)
    p.nav = []; p.core = [];
    if (G.nav) for (const q of p.parts) if (q.ground) {
      p.nav.push(...navNodesInBox(q.wx, q.wz, p.yaw, q.hx, q.hz, PLAYER.radius + 0.25, d.y - 1.0, d.y + 0.6));
      p.core.push(...navNodesInBox(q.wx, q.wz, p.yaw, q.hx, q.hz, PLAYER.radius - 0.05, d.y - 1.0, d.y + 0.6));
    }
    this._hedge(p);                      // (its looks built now, while loading)
    return p;
  }
  _park(b, k) { G.level.moveDynamic(b, _v.set(1e4 + k * 10, -50, 1e4), _v2.set(0.1, 0.1, 0.1), 0); }
  // the plant's looks (PodLooks: one per team, rebuilt when the palette changes) with this match's ink on them
  _hedge(p) {
    const h = this.looks?.hedge(p.i) || null;
    if (h !== p.look) {
      p.look = h;
      if (h) for (const q of p.parts) if (q.ink) (q.crown ? h.animC : h.animT).add(q.ink);
      if (h) this._showHedge(p);
    }
    return h;
  }
  _showHedge(p) {
    const h = p.look;
    if (!h) return;
    const on = !!(p.block && p.block.solid) && p.owner >= 0;
    h.root.visible = on;
    h.team.forEach((looks, t) => { for (const g of looks) g.visible = on && t === p.owner; });
  }

  // ---- the phase of a pod at stage time t (a pure function of its grow time: every client agrees)
  _phase(p, t) {
    if (p.state === 'dormant' && p.owner < 0) return { st: 'dormant', u: 0 };
    const T = this.T, u = t - p.t0;
    if (u < T.grow) return { st: 'grow', u: Math.max(0, u) / T.grow };
    if (t < p.wiltAt) return { st: 'stand', u: (u - T.grow) / T.last };
    if (t < p.wiltAt + T.wilt) return { st: 'wilt', u: (t - p.wiltAt) / T.wilt };
    if (t < p.wiltAt + T.wilt + T.recharge) return { st: 'recharge', u: (t - p.wiltAt - T.wilt) / T.recharge };
    return { st: 'dormant', u: 0 };
  }

  // ---- per frame (Match.update, before bots and actors move)
  update(dt) {
    const m = this.match, t = this.clock.tick(m, dt);
    const live = m.state === 'playing';
    for (const p of this.pods) {
      if (p.off) continue;
      const ph = this._phase(p, t);
      if (ph.st !== p.state) this._enter(p, ph.st, t);
      if (p.state === 'dormant') {
        if (live) this._meters(p, t, dt);
      }
      this._pose(p, ph, dt);
    }
    if (G.boss) this.bossStep();
    if (this.navDirty) { this.navDirty = false; this._navMark(); }
    // host: the meters' look for the followers (2 Hz, when they changed)
    if (!this.follower && G.netm && (this.snapT -= dt) <= 0) {
      this.snapT = 0.5;
      const q = []; for (const p of this.pods) q.push(Math.round(p.meter[0] * 100), Math.round(p.meter[1] * 100));
      if (!this.sent || q.some((v, k) => Math.abs(v - this.sent[k]) >= 2)) { this.sent = q; this._net(['m', ...q]); }
    }
    this._looks(dt);
    this.leaves?.update(dt);
  }

  // meters: drain; the first team to a full meter grows it (the host decides; followers wait for its record)
  _meters(p, t, dt) {
    for (let k = 0; k < 2; k++) {
      if (p.meter[k] <= 0 || p.meter[k] >= 1) continue;
      if (t - p.inkT[k] > PODS.drainDelay) p.meter[k] = Math.max(0, p.meter[k] - PODS.drain * dt);
    }
    if (this.follower) return;
    const full = [0, 1].filter((k) => p.meter[k] >= 1).sort((a, b) => p.fullT[a] - p.fullT[b]);
    if (!full.length) { p.held = ''; return; }
    const why = this._blocked(p);
    if (why) { if (p.held !== why) this.stats.held++; p.held = why; return; }
    p.held = '';
    this.grow(p, full[0], t);
  }

  // why a full pod can't grow right now ('' = it can): the tower / the boss in the way, someone it can't shove aside
  _blocked(p) {
    const T = this.match.tower;
    if (T && this._towerIn(p, T)) return 'tower';
    const B = G.boss;
    if (B && !B.dead && this._bossIn(p, B, PODS.bossMargin)) return 'boss';
    for (const a of this.match.actors) {
      if (!a.alive || a.superJumpState) continue;
      for (const q of p.parts) {
        if (!q.ground || !this._inBox(p, q.box, a, 0.02)) continue;
        if (!this._escapes(p, q.box, a).length) return 'player';
      }
    }
    return '';
  }
  _towerIn(p, T) {
    const R = TOWER.platformR + PODS.towerMargin;
    if (T.pos.y > p.y + p.ht || T.pos.y + TOWER_HEAD < p.y) return false;
    return rectsOverlap(p.x, p.z, p.yaw, p.hw, p.hd, T.pos.x, T.pos.z, T.yaw, R, R);
  }
  // the plant's box over the tower track (the platform's sweep and its headroom), all the way along
  _onTrack(p, T) {
    const R = TOWER.platformR;
    for (let s = -T.path.len[1]; s <= T.path.len[0]; s += 0.4) {
      const q = T.path.at(s, _v);
      if (q.y > p.y + p.ht || q.y + TOWER_HEAD < p.y) continue;
      if (rectsOverlap(p.x, p.z, p.yaw, p.hw, p.hd, q.x, q.z, T.yaw, R, R)) return true;
    }
    return false;
  }
  _bossIn(p, B, pad) {
    const s = Math.sin(B.yaw), c = Math.cos(B.yaw);
    for (const [z, r] of [[2.3, 2.5], [-1.8, 2.6]]) if (this._rectDist(p, B.pos.x + s * z, B.pos.z + c * z) < r + pad) return true;
    return false;
  }
  // (x, z) in the plant's frame
  _loc(p, x, z) { const dx = x - p.x, dz = z - p.z; return [dx * p.c - dz * p.s, dx * p.s + dz * p.c]; }
  _world(p, lx, lz, out = _v3) { return out.set(p.x + lx * p.c + lz * p.s, p.y, p.z - lx * p.s + lz * p.c); }
  // distance from (x, z) to the plant's footprint (0 inside)
  _rectDist(p, x, z) {
    const [lx, lz] = this._loc(p, x, z);
    const ex = Math.max(0, Math.abs(lx) - p.hw), ez = Math.max(0, Math.abs(lz) - p.hd);
    return Math.hypot(ex, ez);
  }
  // BossNav.cast: is a standing plant within r of (x, z)?
  bossWall(x, z, r) {
    for (const p of this.pods) if (p.block && p.block.solid && this._rectDist(p, x, z) < r) return true;
    return false;
  }

  // is actor a (feet at a.pos) inside box (a part's, in the plant's frame; + its body radius + pad)?
  _inBox(p, box, a, pad = 0) {
    const top = p.y + box.y1, bot = p.y + box.y0;
    if (a.pos.y > top - 0.05 || a.pos.y + (a.form === 'squid' ? 0.6 : PLAYER.height) < bot) return false;
    const [lx, lz] = this._loc(p, a.pos.x, a.pos.z);
    const r = PLAYER.radius + pad;
    return Math.abs(lx - box.lx) < box.hx + r && Math.abs(lz - box.lz) < box.hz + r;
  }
  // where a can be shoved to, out of box (nearest side first): the spots that are clear of walls, over floor and reached
  // along a clear line
  _escapes(p, box, a) {
    const [ax, az] = this._loc(p, a.pos.x, a.pos.z), lx = ax - box.lx, lz = az - box.lz;
    const r = PLAYER.radius + 0.06, hx = box.hx + r, hz = box.hz + r;
    const cands = [[lx, Math.sign(lz || 1) * hz], [lx, -Math.sign(lz || 1) * hz], [Math.sign(lx || 1) * hx, lz], [-Math.sign(lx || 1) * hx, lz]]
      .map(([x, z]) => ({ x: x + box.lx, z: z + box.lz, d: Math.hypot(x - lx, z - lz) })).sort((q, w) => q.d - w.d);
    const out = [];
    for (const q of cands) {
      const wx = p.x + q.x * p.c + q.z * p.s, wz = p.z - q.x * p.s + q.z * p.c;
      _v.set(wx, a.pos.y, wz);
      if (G.physics && !G.physics.bodyFits(_v, PLAYER.radius, PLAYER.stepUp, PLAYER.height * 0.9, a.form === 'squid')) continue;
      if (!floorFor(a, wx, wz) || !clearLine(a.pos, wx, wz)) continue;
      out.push([wx, wz]);
    }
    return out;
  }

  // ---- a plant grows: team t's, at stage time t0 (the host's call, or its record replayed)
  grow(p, team, t0) {
    p.owner = team; p.t0 = t0; p.wiltAt = t0 + this.T.grow + this.T.last; p.cutBy = false;
    p.meter[0] = p.meter[1] = 0; p.fullT[0] = p.fullT[1] = -1; p.held = '';
    p.life = p.life0; p.cracked = false; p.shake = 0;
    p.state = 'dormant';                  // (_enter('grow') runs on the next update: the phase decides)
    this.stats.grown++; this._tally(p, 'grown');
    this._net(['g', p.i, team, +t0.toFixed(3)]);
    const ph = this._phase(p, this.clock.t);
    this._enter(p, ph.st, this.clock.t);
    this._pose(p, ph, 0);
  }
  // …and wilts early: trampled (the boss), or cut down (enemy ink: cut)
  wilt(p, tw, cut = false) {
    if (p.state !== 'grow' && p.state !== 'stand') return;
    p.wiltAt = tw; p.cutBy = cut;
    if (cut) { this.stats.cut++; this._tally(p, 'cutDown'); } else this.stats.trampled++;
    this._net(['w', p.i, +tw.toFixed(3), cut ? 1 : 0]);
  }

  _enter(p, st, t) {
    const prev = p.state;
    p.state = st;
    const au = this.match.attract ? null : G.audio;
    p.bulbBlock.solid = st === 'dormant' && !p.off;
    _v.set(p.x, p.y + p.ht * 0.5, p.z);
    if (st === 'grow' || (st === 'stand' && prev !== 'grow')) {
      for (const q of p.parts) { q.blk.solid = true; q.paint?.clear(); }
      this._hedge(p); this._showHedge(p);
      this.navDirty = true;
      // (the bigger the plant, the bigger the burst)
      au?.play?.('pod_grow', { pos: _v, volume: 0.95, pitch: p.kind === 'canopy' ? 0.82 : 0.9 });
      au?.play?.('pod_burst', { pos: _v, volume: 0.85, pitch: p.kind === 'canopy' ? 0.85 : 1 });
      this.leaves?.puff(p, p.owner, p.kind === 'canopy' ? 80 : Math.round(40 + 6 * p.w));
      this._tintHedge(p);
    } else if (st === 'wilt') {
      if (p.cutBy) {
        au?.play?.('pod_snap', { pos: _v, volume: 1 });
        this.leaves?.puff(p, -1, 60, true);
      } else {
        au?.play?.('pod_wilt', { pos: _v, volume: 0.8 });
        this.leaves?.puff(p, -1, 24, true);
      }
    } else if (st === 'recharge' || st === 'dormant') {
      if (p.block.solid) { p.parts.forEach((q) => { q.blk.solid = false; this._park(q.blk, p.i * 8 + q.k); }); this.navDirty = true; }
      for (const q of p.parts) q.paint?.clear();
      if (st === 'dormant') { p.owner = -1; p.meter[0] = p.meter[1] = 0; }
      this._showHedge(p);
    }
  }

  // the pose at this moment of its phase: { gy (the ground part's height, share of its full height), gx (its spread
  // out of the planter 0…1), ry (the crown's thickness share), rx (its spread out over the trunk 0…1), and the looks':
  // tvy (the ground look's height scale: it overshoots as it bursts up), cs (the crown look's spread, 0…1) } — null
  // when there's nothing standing
  _anim(p, ph) {
    const col = p.def.col, g = p.ground, gh = g.y1 - g.y0, ch = Math.min(1, col[1] / gh);
    const A = { gy: 1, gx: 1, ry: 1, rx: 1, rr: 1, tvy: 1, cs: 1, brown: 0 };
    if (ph.st === 'grow') {
      if (p.kind === 'canopy') {
        const u1 = Math.min(1, ph.u / 0.6), u2 = clamp((ph.u - 0.3) / 0.7, 0, 1), e1 = easeOut(u1), e2 = easeOut(u2);
        A.gy = ch + (1 - ch) * e1; A.gx = e1; A.tvy = ch + (1 - ch) * backOut(u1);
        A.ry = A.rr = 0.25 + 0.75 * e2; A.rx = e2; A.cs = backOut(u2);
      } else {
        const e = easeOut(ph.u);
        A.gy = ch + (1 - ch) * e; A.gx = e; A.tvy = ch + (1 - ch) * backOut(ph.u);
      }
    } else if (ph.st === 'wilt') {
      A.brown = Math.min(1, ph.u * 1.6);
      if (p.kind === 'canopy') {
        // the parapet slumps, the crown draws in over the trunk, then it all sinks (the parapet's gone before the crown
        // draws in: it never sweeps a rider)
        const uA = Math.min(1, ph.u / 0.4), uB = clamp((ph.u - 0.4) / 0.6, 0, 1);
        A.rx = A.cs = 1 - smooth(uA);
        A.gy = A.ry = A.tvy = Math.max(0.02, 1 - smooth(uB));
        A.rr = Math.max(0.02, Math.min(A.ry, 1 - smooth(Math.min(1, ph.u / 0.12))));
      } else A.gy = A.tvy = Math.max(0.02, 1 - smooth(ph.u));
    } else if (ph.st !== 'stand') return null;
    return A;
  }
  // each block where the pose puts it (in the plant's frame: q.cur), placed in the level
  _boxes(p, A) {
    const col = p.def.col, g = p.ground;
    for (const q of p.parts) {
      const c = q.cur;
      if (!q.crown) {
        // out of the planter's box (the part's share of it), spreading to its own by gx; its height by gy
        const [sx, shx] = fitSpan(q.x, q.hx, 0, col[0] / 2), [sz, shz] = fitSpan(q.z, q.hz, 0, col[2] / 2);
        c.lx = lerp(sx, q.x, A.gx); c.hx = lerp(shx, q.hx, A.gx); c.lz = lerp(sz, q.z, A.gx); c.hz = lerp(shz, q.hz, A.gx);
        c.y0 = q.y0; c.y1 = q.y0 + (q.y1 - q.y0) * A.gy;
      }
    }
    const gc = g.cur;
    for (const q of p.parts) {
      if (!q.crown) continue;
      const c = q.cur;
      // riding the trunk's top: out of its box (the part's share of it), spreading to its own by rx; its thickness by ry
      const [sx, shx] = fitSpan(q.x, q.hx, gc.lx, gc.hx), [sz, shz] = fitSpan(q.z, q.hz, gc.lz, gc.hz);
      c.lx = lerp(sx, q.x, A.rx); c.hx = lerp(shx, q.hx, A.rx); c.lz = lerp(sz, q.z, A.rx); c.hz = lerp(shz, q.hz, A.rx);
      const rail = q.y0 >= p.topPart.y1 - 1e-6;
      c.y0 = gc.y1 + (q.y0 - g.y1) * A.ry;
      c.y1 = c.y0 + (q.y1 - q.y0) * (rail ? A.rr : A.ry);
    }
    for (const q of p.parts) {
      const c = q.cur;
      _v.set(p.x + c.lx * p.c + c.lz * p.s, p.y + (c.y0 + c.y1) / 2, p.z - c.lx * p.s + c.lz * p.c);
      G.level.moveDynamic(q.blk, _v, _v2.set(Math.max(0.01, c.hx), Math.max(0.01, (c.y1 - c.y0) / 2), Math.max(0.01, c.hz)), p.yaw);
    }
  }

  // the blocks + looks at this moment of its phase; shove during the growth; carry down during the wilt
  _pose(p, ph, dt) {
    const A = this._anim(p, ph);
    if (!A) { p.k = 0; return; }
    const top0 = p.parts.map((q) => q.topY);
    this._boxes(p, A);
    for (const q of p.parts) q.topY = p.y + q.cur.y1;
    p.k = A.gy; p.top = p.topPart.topY;
    const L = p.look;
    if (L) {
      const g = p.ground, gc = g.cur;
      L.animT.scale.set(gc.hx / g.hx, Math.max(0.02, A.tvy), gc.hz / g.hz);
      if (p.kind === 'canopy') {
        // the crown sits on the trunk look's top, spread by cs (from the trunk's width / depth to its own)
        const dk = p.topPart, gH = g.y1 - g.y0, sx0 = Math.min(1, gc.hx / dk.hx), sz0 = Math.min(1, gc.hz / dk.hz);
        const ey = Math.max(0.02, A.ry);
        L.animC.scale.set(lerp(sx0, 1, A.cs), ey, lerp(sz0, 1, A.cs));
        L.animC.position.y = gH * Math.max(0.02, A.tvy) - dk.y0 * ey;
      }
    }
    p.wiltBrown = A.brown;
    if (ph.st === 'grow' || (ph.st === 'stand' && ph.u * this.T.last < 0.1)) this._shove(p);
    if (ph.st === 'wilt' && dt > 0) this._carry(p, top0);
  }

  // this client's squidkids where the plant is growing: out of its way, to the nearest side they fit on (a ground
  // block); riding up on it (someone on its top, or on the crown as it rises)
  _shove(p) {
    for (const a of this.match.actors) {
      if (!shovable(a)) continue;
      for (const q of p.parts) {
        const c = q.cur;
        if (!this._inBox(p, c, a, 0)) continue;
        if (!q.ground) {
          // a platform / parapet block: up onto it if we're over its middle, else it's the level's to resolve (under
          // it: a hop)
          if (a.pos.y > p.y + (c.y0 + c.y1) / 2 && a.vel.y <= 0.5) { a.pos.y = p.y + c.y1 + 0.01; if (a.vel.y < 0) a.vel.y = 0; }
          continue;
        }
        // (standing on it already — it grew under a hop — rides up instead)
        if (a.pos.y > p.y + c.y1 - 0.3 && a.vel.y <= 0) { a.pos.y = p.y + c.y1 + 0.01; continue; }
        const sp = this._escapes(p, c, a);
        if (shoveActor(a, sp) >= 0) this.stats.shoved++;
      }
    }
  }
  // anyone standing on a wilting plant goes down with the block they stand on (never dropped through, never pushed
  // into anything)
  _carry(p, top0) {
    for (const a of this.match.actors) {
      if (!a.alive || a.remote || a.superJumpState || !a.grounded || !a.ground) continue;
      const q = p.parts.find((w) => w.blk.id === a.ground.block);
      if (!q) continue;
      const dy = q.topY - top0[q.k];
      if (dy >= 0) continue;
      a.pos.y += dy;
      if (a.vel.y > 0) a.vel.y = 0;
      this.stats.carried++;
    }
  }

  _navMark() {
    const blk = this.blk;
    if (!blk) return;
    blk.fill(0); this.hard.fill(0); this.hardPod.fill(-1);
    for (const p of this.pods) if (p.block && p.block.solid) { for (const id of p.nav) blk[id] = 1; for (const id of p.core) { this.hard[id] = 1; this.hardPod[id] = p.i; } }
    navCommit(this.match.actors);
  }

  // ---- ink (Paint.splat forwards every splat): the meters of the dormant pods it reaches; a plant's own ink (its
  // owner's) and its life (the other team's)
  onSplat(center, radius, team, opts = {}) {
    if (team !== 0 && team !== 1) return;
    const t = this.clock.t;
    for (const p of this.pods) {
      if (p.off) continue;
      const dx = center.x - p.x, dz = center.z - p.z, reach = radius + Math.max(p.w, p.d) + 0.5;
      if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
      if (p.state === 'dormant') {
        if (p.meter[team] >= 1) continue;
        // (the catch: a column over the planter up to the bulb's top — the distance from the splat's centre to it)
        const top = p.y + p.def.bulbY + PODS.bulbH, dy = center.y > top ? center.y - top : center.y < p.y ? p.y - center.y : 0;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const cov = coverFrac(radius, PODS.catchR, d);
        if (cov <= 0) continue;
        const amt = (cov * radius * radius * (opts.pod ?? 1)) / PODS.need;
        p.meter[team] = Math.min(1, p.meter[team] + amt);
        p.inkT[team] = t;
        if (p.meter[team] >= 1 && p.fullT[team] < 0) p.fullT[team] = t;
        if (t - p.rustleT > 0.11 && !this.match.attract) {
          p.rustleT = t;
          G.audio?.play?.('pod_rustle', { pos: _v.set(p.x, p.y + 0.5, p.z), volume: 0.35 + 0.4 * Math.min(1, amt * 4), pitch: 0.85 + 0.5 * p.meter[team] });
        }
      } else if (p.state === 'grow' || p.state === 'stand' || p.state === 'wilt') {
        if (p.state !== 'grow') for (const q of p.parts) q.paint?.splat(center, radius, team, opts);
        if (team !== p.owner && p.state !== 'wilt' && p.life > 0) this._harm(p, center, radius, opts, t);
      }
    }
  }
  // enemy ink on a grown plant: the share of the splat that lands on it (1 at its face, fading to 0 a radius off) ×
  // radius² × its weight drains its life; at zero the host cuts it down. Every client runs this (a follower's is only
  // its look: the host's record decides)
  _harm(p, center, radius, opts, t) {
    let d = Infinity, near = null;
    for (const q of p.parts) {
      if (!q.blk.solid) continue;
      const cp = G.physics.closestOnBlock(q.blk, center, _v);
      const e = cp.distanceTo(center);
      if (e < d) { d = e; near = _v2.copy(cp); }
    }
    if (!(d < radius)) return;
    const amt = (1 - d / radius) * radius * radius * cutWeight(opts);
    if (amt <= 0) return;
    p.life = Math.max(0, p.life - amt);
    p.hitT = t; p.hitSide = this._loc(p, center.x, center.z)[1] >= 0 ? 1 : -1;
    p.shake = Math.min(1, p.shake + (amt / p.life0) * 5);
    const k = 1 - p.life / p.life0;
    if (!this.match.attract) {
      // leaves shaken loose where it was hit (browner as it goes), a leafy thwack
      if (t - p.shedT > 0.07) { p.shedT = t; this.leaves?.shed(near, 2 + Math.round(3 * Math.min(1, amt / 1.5)), k); }
      if (t - p.hitSndT > 0.09) { p.hitSndT = t; G.audio?.play?.('pod_hit', { pos: near, volume: 0.3 + 0.35 * Math.min(1, amt), pitch: 1.15 - 0.35 * k }); }
    }
    if (!p.cracked && p.life <= p.life0 * PODS.crack) {
      p.cracked = true; p.crackT = t; this.stats.cracked++;
      if (!this.match.attract) G.audio?.play?.('pod_crack', { pos: _v.set(p.x, p.y + p.ht * 0.6, p.z), volume: 0.9 });
      this.leaves?.puff(p, -1, 26, true);
      p.shake = 1;
    }
    if (p.life <= 0 && !this.follower) this.wilt(p, t, true);
  }

  // ---- the looks: bulbs swell / blush / glow with the meters; plants tinted, withering as they lose life, browning as
  // they wilt, shaking when hit; new ink shown
  _looks(dt) {
    const L = this.looks, time = G.time || 0;
    for (const p of this.pods) {
      if (L) {
        if (p.state === 'dormant' || p.state === 'recharge') {
          const m0 = p.meter[0], m1 = p.meter[1], lead = m0 === m1 ? -1 : m0 > m1 ? 0 : 1, mx = Math.max(m0, m1), mn = Math.min(m0, m1);
          const back = p.state === 'recharge' ? smooth(clamp(this._phase(p, this.clock.t).u, 0, 1)) : 1;   // (regrowing after a wilt)
          const pulse = mx > 0.75 ? 0.5 + 0.5 * Math.sin(time * (8 + 10 * mx)) : 0;
          const k = lead < 0 ? 0 : PODS.blush * clamp((mx - mn) * 1.4 + mx * 0.25, 0, 1);
          L.set(p.i, mx, lead, k, lead < 0 ? 0 : (0.08 + 0.55 * Math.pow(mx, 1.5) + 0.25 * pulse) * back, true, 0.2 + 0.8 * back);
        } else L.set(p.i, 0, -1, 0, 0, false);
      }
      if (p.owner >= 0 && p.block.solid) {
        this._hedge(p);                                 // (a palette change rebuilds its looks)
        const dmg = 1 - p.life / p.life0;
        p.brown = Math.max(p.wiltBrown || 0, PODS.withered * dmg * (0.6 + 0.4 * dmg));
        this._tintHedge(p);
        // a hit's shake: a quick shiver of the leaves (the ink stays on the blocks); cracked, it leans away from the fire
        // (a few cm at its top: it's going)
        if (p.look) {
          p.shake = Math.max(0, p.shake - dt * 3.2);
          const sh = p.shake * p.shake, j = 0.045 * sh, lean = p.cracked ? -p.hitSide * 0.028 * smooth(clamp((this.clock.t - p.crackT) / 0.3, 0, 1)) : 0;
          for (const looks of p.look.team) for (const g of looks) { g.position.set(j * Math.sin(time * 61 + p.i), 0, j * Math.cos(time * 53 + p.i * 1.7)); g.rotation.x = lean; }
        }
        for (const q of p.parts) if (q.paint && q.paint.dirty) { q.paint.texture.needsUpdate = true; q.paint.dirty = false; }
      }
    }
  }
  // the grower's look: its ink is in the look (built with `tint`); here a sheen of it, browning / drying as it's cut
  // and as it wilts
  _tintHedge(p) {
    const h = p.look;
    if (!h || p.owner < 0) return;
    const col = G.teamColors ? G.teamColors[p.owner] : null, br = p.brown || 0;
    for (const { m, kind } of h.mats[p.owner]) {
      m.color.copy(m.userData.c0);
      if (br > 0) m.color.lerp(kind === 'leaf' ? BROWN : DRY, br * (kind === 'leaf' ? 0.75 : 0.5));
      if (m.emissive) { if (col) m.emissive.copy(col).multiplyScalar((kind === 'leaf' ? PODS.sheen : 0.3) * (1 - br)); else m.emissive.setRGB(0, 0, 0); }
    }
  }

  // ---- Boss Battle: HULLBREAKER walking (not charging) into a standing plant tramples it (the host decides)
  bossStep() {
    const B = G.boss;
    if (!B || B.dead || this.follower || !B.sim) return;
    const charging = B.move && B.move.id === 'charge';
    if (charging) return;
    for (const p of this.pods) if ((p.state === 'stand') && this._bossIn(p, B, -0.3)) this.wilt(p, this.clock.t);
  }

  // ---- online: a follower replays the host's records (netmatch 'pd', on the host's event timeline)
  netEvent(e) {
    if (!Array.isArray(e) || !this.follower) return;
    const p = this.pods[e[1]];
    switch (e[0]) {
      case 'g': if (p && !p.off) this.grow(p, e[2], e[3]); break;
      case 'w': if (p && (p.state === 'grow' || p.state === 'stand' || p.state === 'dormant')) { p.wiltAt = e[2]; p.cutBy = !!e[3]; if (p.cutBy) this.stats.cut++; } break;
      case 'm': for (let i = 0; i < this.pods.length; i++) {
        const q = this.pods[i];
        if (q.state !== 'dormant') continue;
        const a0 = e[1 + i * 2], a1 = e[2 + i * 2];
        if (a0 !== undefined) q.meter[0] = Math.min(0.999, a0 / 100);
        if (a1 !== undefined) q.meter[1] = Math.min(0.999, a1 / 100);
      } break;
    }
  }

  // practice: start over
  reset() {
    for (const p of this.pods) { p.owner = -1; p.meter[0] = p.meter[1] = 0; p.fullT[0] = p.fullT[1] = -1; p.held = ''; p.life = p.life0; p.cracked = false; this._enter(p, 'dormant', this.clock.t); }
    this._navMark();
  }

  // the pod whose plant actor a stands on (any of its blocks: a wall's top, a canopy's platform or parapet), or null
  hedgeUnder(a) {
    if (!a.grounded || !a.ground) return null;
    for (const p of this.pods) if (p.block && p.block.solid && p.ids.has(a.ground.block)) return p;
    return null;
  }

  // snapshot for tests / the HUD
  // per-pod tallies for the botlab (stats.byPod[id]: grown, the bot tasks picked on it — grow / climb / cover / cut —,
  // seconds perched on it, crossings over it, detours round it, times cut down)
  _tally(p, k, v = 1) { const o = this.stats.byPod[p.id] || (this.stats.byPod[p.id] = {}); o[k] = Math.round(((o[k] || 0) + v) * 1000) / 1000; }
  state() {
    return { t: +this.clock.t.toFixed(3), pods: this.pods.map((p) => ({ id: p.id, kind: p.kind, state: p.state, owner: p.owner, meter: [+p.meter[0].toFixed(3), +p.meter[1].toFixed(3)],
      life: +(p.life / p.life0).toFixed(3), held: p.held, off: p.off, k: +p.k.toFixed(3), top: +p.top.toFixed(3), solid: !!(p.block && p.block.solid), t0: +p.t0.toFixed(3), wiltAt: +p.wiltAt.toFixed(3) })),
      blocked: this.blk ? this.blk.reduce((s, v) => s + v, 0) : 0, stats: { ...this.stats } };
  }

  dispose() {
    for (const p of this.pods) {
      for (const q of p.parts) {
        if (q.ink) { q.ink.removeFromParent(); q.ink.geometry.dispose(); q.ink.material.dispose(); }
        q.paint?.dispose();
      }
      if (p.look) for (const looks of p.look.team) for (const g of looks) { g.position.set(0, 0, 0); g.rotation.x = 0; }
      p.look = null;
    }
    this.looks?.reset();
    this.leaves?.dispose();
    if (this.bossNav && this.bossNav.dynWall) this.bossNav.dynWall = null;
    navRelease(this);
    G.level?.clearDynamic?.();
  }

  // ============================================================================================ bots
  // Called by BotBrain.update every frame (after its own fight / paint / threat logic): may take over the move, the
  // trigger and the aim. Returns an aim ({ yaw, pitch, dist }) to hold, or null. State lives in brain.podS.
  bot(b, dt, it, move, vis) {
    const a = b.a, S = b.podS || (b.podS = { task: null, p: null, t0: 0, next: 0, press: false, face: 1, u: 0, okT: 0, exit: null, bad: -1, seen: null, waitT: 0, hold: null, noClimb: null, lastT: -1, gate: null, cross: false });
    // (the brain was reset — a respawn — or we haven't run for a while: nothing carries over)
    if (!(b.t >= S.lastT && b.t - S.lastT < 1)) { S.task = null; S.exit = null; S.hold = null; S.seen = null; S.gate = null; S.cross = false; S.next = b.t + 0.3; S.noClimb = null; }
    S.lastT = b.t;
    if (!a.alive || a.superJumpState || (a.specialActive && a.specialActive.body)) { S.task = null; S.exit = null; S.gate = null; return null; }
    // (on it — or off our feet for a moment right over it: a bump against the parapet isn't getting off)
    const top = this.hedgeUnder(a) || (S.task === 'top' && S.p && S.p.block.solid && !a.grounded && !a.climbing && a.pos.y > S.p.top - 0.4
      && this._rectDist(S.p, a.pos.x, a.pos.z) < 0.05 && b.t - S.topT < 0.4 ? S.p : null);
    if (top) return this._botTop(b, S, top, dt, it, move, vis);
    if (S.task === 'top') {
      // off it (walked off, dropped): plan from down here now, and don't go straight back up it
      S.task = null; S.exit = null; S.cross = false; b.path = null; b.repath = 0; b.goalTimer = 0; S.next = b.t + 3;
      S.noClimb = { p: S.p, until: b.t + 8 };
    }
    if (this.match.tower && b.tRole === 'ride') { S.task = null; S.gate = null; return null; }   // (a tower rider's job is the tower)
    // a route a standing plant cuts: round it, if that's not much longer; else walk up to it and cut it down (theirs) or
    // climb over it (ours); no way at all: hold short of it (a fight: it's cover) until it wilts or the brain picks
    // another goal — its route kept, the walk frozen (no re-planning churn), looked at again every 1.2 s
    if (b.path && b.path !== S.seen) { S.seen = b.path; this._botRoute(b, S); }
    if (S.hold) {
      if (b.path !== S.hold) S.hold = null;
      else if (b.t > S.waitT) { S.hold = null; S.seen = null; }
      else if (!S.task) { move.set(0, 0, 0); b.perchUntil = b.t + 0.3; this._settle(b); }
    }
    if (S.gate && !S.task) this._botGate(b, S);
    // a canopy we just grew: straight on up it (that's what it was for)
    if (S.task === 'grow' && S.p && S.p.kind === 'canopy' && S.p.owner === a.team && (S.p.state === 'grow' || S.p.state === 'stand')) { S.task = 'climb'; S.t0 = b.t; S.cross = false; this._climbStart(b, S, S.p); }
    if (S.task && !this._botValid(b, S)) { if (S.task === 'cut') { b.path = null; b.repath = 0; } S.task = null; S.cross = false; S.next = b.t + 1.5; }
    if (!S.task && b.t >= S.next) { S.next = b.t + 0.45 + Math.random() * 0.2; this._botPick(b, S, vis); }
    if (S.task === 'grow') return this._botGrow(b, S, dt, it, move);
    if (S.task === 'cover') return this._botCover(b, S, dt, it, move, vis);
    if (S.task === 'climb') return this._botClimb(b, S, dt, it, move);
    if (S.task === 'cut') return this._botCut(b, S, dt, it, move, vis);
    return null;
  }
  _settle(b) { b.wiggleT = 0; b._needJump = false; b.noProg = 0; b.dispT = 0; b.moveAcc = 0; b.snap.copy(b.a.pos); }
  // the move is ours for now: no route (its climb edges / waypoints would pull the other way), re-planned after
  _own(b) { this._settle(b); b.path = null; b.repath = Math.max(b.repath, 0.3); b.navBack = null; }
  _botValid(b, S) {
    const p = S.p, lim = S.task === 'cover' ? 12 : S.task === 'cut' ? 14 : 10;
    if (!p || p.off || b.t - S.t0 > lim) return false;
    if (S.task === 'grow') return p.state === 'dormant' && (!!b.target || S.why === 'zone') && b.a.ink > PLAYER.inkMax * 0.08;
    // (cover: while the foe's been seen in the last 2 s — else go and find it)
    if (S.task === 'cover') return (p.state === 'grow' || p.state === 'stand') && !!b.target && b.t - S.t0 < 8 && !!b.tk && G.time - b.tk.t < 2;
    if (S.task === 'climb') return (p.state === 'stand' || p.state === 'grow') && p.owner === b.a.team && (p.wiltAt - this.clock.t) > 4 && b.mode !== 'retreat';
    if (S.task === 'cut') return (p.state === 'grow' || p.state === 'stand') && p.owner !== b.a.team;
    return false;
  }
  // the foes we know of (seen in the last 6 s, within 22 m): their positions
  _foes(b) {
    const a = b.a, out = [];
    for (const k of b.sight.mem.values()) {
      if (!k.e.alive || (!k.seen && G.time - k.t > 6)) continue;
      const fp = k === b.tk && b.tv ? b.tv.pos : k.pos;
      if (Math.hypot(fp.x - a.pos.x, fp.z - a.pos.z) > 22) continue;
      out.push(fp);
    }
    return out;
  }
  // what to do near here: our plant to climb or hide behind; a wall pod to close the route a foe is coming by; a canopy
  // pod to grow and climb near a fight at range / the zone we guard; a foe up on their plant, out of sight → cut it down
  _botPick(b, S, vis) {
    const a = b.a, tv = b.target ? b.tv : null, range = b._range(), melee = range < 6;
    const fighting = b.mode === 'fight' && tv;
    const zoneGuard = !fighting && this.match.zones && (b.zRole === 'guard' || b.zRole === 'watch');
    if (!fighting && !zoneGuard) return;
    const foes = this._foes(b);
    if (!fighting && !foes.length && !zoneGuard) return;
    // a foe we're after, up on their plant and out of sight: bring it down
    if (fighting && !vis && b.target) {
      const tp = this.hedgeUnder(b.target);
      if (tp && tp.owner !== a.team && tp.state === 'stand' && this._rectDist(tp, a.pos.x, a.pos.z) < Math.max(3, range * 0.9) && Math.abs(tp.y - a.pos.y) < 1.5) {
        S.task = 'cut'; S.p = tp; S.t0 = b.t; this.stats.cuts++; this._tally(tp, 'cut'); return;
      }
    }
    let best = null, bs = -Infinity, task = null, why = null;
    for (const p of this.pods) {
      if (p.off) continue;
      const dp = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
      if (dp > 11 || Math.abs(p.y - a.pos.y) > 1.5) continue;
      if (p.state === 'stand' && p.owner === a.team && p.wiltAt - this.clock.t > 6 && p.life > p.life0 * 0.35) {
        // our plant: its top over a fight across open ground (not for close-range kits), or over the zone we guard
        const high = !melee && a.hp > PLAYER.hp * 0.45 && (fighting ? Math.hypot(tv.pos.x - p.x, tv.pos.z - p.z) > (p.kind === 'canopy' ? 5 : 6) && tv.pos.y < p.y + p.h - 0.3 : this._nearZone(p) < 6);
        const again = S.noClimb && S.noClimb.p === p && b.t < S.noClimb.until;   // (just came down it)
        if (high && dp < 8 && !again) { const sc = 10 - dp + (fighting ? 0 : 2) + (p.kind === 'canopy' ? 2 : 0); if (sc > bs) { bs = sc; best = p; task = 'climb'; } }
        else if (fighting && !melee && p.kind === 'wall' && this._between(p, a.pos, tv.pos, 0.3)) { const sc = 6 - dp; if (sc > bs) { bs = sc; best = p; task = 'cover'; } }
        continue;
      }
      if (p.state !== 'dormant' || p.meter[1 - a.team] >= 1 || (S.noGrow && S.noGrow.p === p && b.t < S.noGrow.until)) continue;
      if (dp < 1.6 || dp > Math.min(Math.max(range * 0.95, a.weapon.kind === 'roller' ? 6.5 : 0), 10) || this._inBox(p, p.ground.box, a, 0.3)) continue;
      let sc = -Infinity, w = null;
      if (p.kind === 'canopy') {
        // near a fight at range (the foe a way off it: it'd look down on them) / the zone we guard
        if (fighting && !melee && dp < 9) { const fd = Math.hypot(tv.pos.x - p.x, tv.pos.z - p.z); if (fd > 6 && fd < range + 8) { sc = 7 - dp * 0.5; w = 'fight'; } }
        if (zoneGuard && this._nearZone(p) < 8 && dp < 9) { sc = Math.max(sc, 6 - dp * 0.4); w = w || 'zone'; }
      } else {
        // between us and a foe coming (the target, or another we know of: a flank), and nearer us than them
        for (const fp of fighting ? [tv.pos, ...foes] : foes) {
          if (Math.hypot(fp.x - p.x, fp.z - p.z) < dp) continue;
          if (this._between(p, a.pos, fp, 0.8)) { sc = 8 - dp * 0.5; w = fighting ? 'fight' : 'zone'; break; }
        }
      }
      if (sc === -Infinity) continue;
      if (!this._seesPod(a, p)) continue;
      sc += p.meter[a.team] * 4;
      if (sc > bs) { bs = sc; best = p; task = 'grow'; why = w; }
    }
    if (!best || (task === 'grow' && Math.random() < 0.15)) return;
    S.task = task; S.p = best; S.t0 = b.t; S.why = why; S.cross = false; S.gT = undefined; this._tally(best, task);
    if (task === 'climb') this._climbStart(b, S, best);
  }
  // a climb: the climb face toward us (±z), the column in front of us — the nearest one with room to stand in front of
  // it (the spot 1.2 m out clear, on the plant's floor: a neighbouring hedge, a tree or a bed can crowd a wall's end)
  _climbStart(b, S, p, lx0) {
    const a = b.a, [lx, lz] = this._loc(p, a.pos.x, a.pos.z), half = p.climbHalf;
    S.face = lz >= 0 ? 1 : -1; S.u = clamp(lx0 ?? lx, -half, half); S.swimT = 0; S.letGo = 0; S.best = -1; S.bestT = b.t;
    if (!G.physics || !G.level) return;
    const f = S.face, at = (u, o, y) => _v.set(p.x + u * p.c + f * (p.hd + o) * p.s, p.y + y, p.z - u * p.s + f * (p.hd + o) * p.c);
    const room = (u) => {
      at(u, 1.2, 0.02);
      if (Math.abs(G.level.groundHeight(_v.x, _v.z, p.y + 0.5) - p.y) >= 0.4 || !G.physics.bodyFits(_v, PLAYER.radius, PLAYER.stepUp, PLAYER.height * 0.9)) return false;
      // …and the swim up the column clear of anything else (a hedge or a tree against the plant's end)
      for (const y of [0.4, 1.2, 2.0]) if (y < p.h && !G.physics.bodyFits(at(u, 0.4, y), 0.3, 0, 0.6)) return false;
      return true;
    };
    if (room(S.u)) return;
    for (let k = 1; k <= 14; k++) {
      const d = k * 0.3;
      if (S.u - d >= -half && room(S.u - d)) { S.u -= d; return; }
      if (S.u + d <= half && room(S.u + d)) { S.u += d; return; }
    }
  }
  // a clear shot at the bulb from a's eyes (whatever the ray meets within the pod's own catch doesn't count)
  _seesPod(a, p) {
    _v.set(a.pos.x, a.pos.y + 1.1, a.pos.z); _v2.set(p.x, p.y + p.def.bulbY + 0.15, p.z).sub(_v);
    const len = _v2.length(); _v2.multiplyScalar(1 / len);
    const h = G.physics.raycast(_v, _v2, len, this._hit || (this._hit = new Hit()), true);
    return !h.hit || h.dist > len - PODS.catchR - 0.35;
  }
  _nearZone(p) {
    const Z = this.match.zones;
    if (!Z || !Z.active) return Infinity;
    let best = Infinity;
    for (const z of Z.active.zones) if (z.center) best = Math.min(best, Math.hypot(z.center[0] - p.x, z.center[2] - p.z) - (z.radius || 5));
    return best;
  }
  // does the plant's footprint (+ pad) cross the line from a to b?
  _between(p, A, Bp, pad) {
    const hx = p.w / 2 + pad, hz = p.d / 2 + pad;
    const [x0, z0] = this._loc(p, A.x, A.z), [x1, z1] = this._loc(p, Bp.x, Bp.z);
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dz = z1 - z0;
    for (const [q, d, lo, hi] of [[x0, dx, -hx, hx], [z0, dz, -hz, hz]]) {
      if (Math.abs(d) < 1e-9) { if (q < lo || q > hi) return false; continue; }
      let a0 = (lo - q) / d, a1 = (hi - q) / d;
      if (a0 > a1) { const tt = a0; a0 = a1; a1 = tt; }
      t0 = Math.max(t0, a0); t1 = Math.min(t1, a1);
      if (t0 > t1) return false;
    }
    return true;
  }
  _aimAt(a, x, y, z) {
    const dx = x - a.pos.x, dz = z - a.pos.z, hd = Math.max(0.4, Math.hypot(dx, dz)), dy = y - (a.pos.y + 1.1);
    return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, hd), dist: Math.hypot(hd, dy) };
  }
  // the weapon's own rhythm: charge-and-release, press-and-release (flicks / cuts / punches), a steady stream
  _trigger(b, S, aimed) {
    const a = b.a, w = a.weapon, wr = a.weaponRunner, kind = w.kind;
    if (!aimed) return wr.charging;       // (keep a charge while turning onto it)
    if (kind === 'charger' || kind === 'bow') return !(wr.charging && wr.charge >= 0.92);
    if (kind === 'spinner' || kind === 'splatling') return wr.burstT <= 0 && !wr.streaming && !(wr.charging && wr.charge >= 0.8);
    if (kind === 'roller' || kind === 'brush' || kind === 'blade') { S.press = !S.press; return S.press; }
    return true;
  }
  // grow it: stand off, aim at the bulb, ink it full
  _botGrow(b, S, dt, it, move) {
    const a = b.a, p = S.p, dp = Math.hypot(p.x - a.pos.x, p.z - a.pos.z), range = b._range();
    // no headway in 3 s — its meter not filling and us not getting anywhere (a shot that can't reach its bulb, a way to
    // it we can't walk): give it up for a while (the task owns the move, so the bot's own unsticking can't step in)
    const mt = p.meter[a.team];
    if (S.gT === undefined || mt > S.gm + 0.02 || Math.hypot(a.pos.x - S.gx, a.pos.z - S.gz) > 0.6) { S.gm = mt; S.gx = a.pos.x; S.gz = a.pos.z; S.gT = b.t; }
    if (b.t - S.gT > 3) { S.task = null; S.next = b.t + 3; S.noGrow = { p, until: b.t + 12 }; return null; }
    // (a roller flicks at the planter's foot: the sheet comes down flat on it)
    const aim = this._aimAt(a, p.x, p.y + (a.weapon.kind === 'roller' ? 0.1 : p.def.bulbY + 0.15), p.z);
    const aimed = Math.abs(angleDiff(b.aimYaw, aim.yaw)) < Math.max(0.05, Math.atan2(0.3, dp)) && Math.abs(b.aimPitch - aim.pitch) < 0.12;
    it.squid = false; it.sub = false;
    it.fire = this._trigger(b, S, aimed);
    const nx = (p.x - a.pos.x) / (dp || 1), nz = (p.z - a.pos.z) / (dp || 1);
    const want = a.weapon.kind === 'roller' ? 5.4 : Math.min(range * 0.6, 5);    // (a flick comes down ~5 m out)
    // (and never where it'll grow: out past its footprint + a stride)
    const clear = Math.max(p.hw, p.hd) + 0.8;
    if (dp > want + 1 && dp > clear + 0.5) move.set(nx, 0, nz);
    else if (dp < Math.max(2.2, clear)) move.set(-nx, 0, -nz);
    else move.multiplyScalar(0.35);        // (keep the duel's footwork, gently)
    this._settle(b);
    return aim;
  }
  // fight from behind it (a wall): a spot on its far side from the foe, level with us along it; strafe out past its end
  _botCover(b, S, dt, it, move, vis) {
    const a = b.a, p = S.p, tv = b.tv;
    if (!tv) return null;
    const fl = (tv.pos.x - p.x) * p.s + (tv.pos.z - p.z) * p.c, side = fl >= 0 ? -1 : 1;
    const lx = clamp((a.pos.x - p.x) * p.c - (a.pos.z - p.z) * p.s, -p.w / 2 + 0.4, p.w / 2 - 0.4);
    const ox = lx + (vis ? b.strafeS * 1.2 : 0), oz = side * (p.d / 2 + 0.95);
    const sx = p.x + ox * p.c + oz * p.s, sz = p.z - ox * p.s + oz * p.c;
    const gx = sx - a.pos.x, gz = sz - a.pos.z, gl = Math.hypot(gx, gz);
    if (gl > 6 || !b._fatLos(a.pos.x, a.pos.y, a.pos.z, sx, a.pos.y, sz)) { if (gl > 1.2) return null; }
    if (gl > 0.25) { const k = Math.min(1, gl / 0.6 + 0.2); move.set((gx / gl) * k, 0, (gz / gl) * k); } else move.set(0, 0, 0);
    if (gl < 0.4) b.perchUntil = b.t + 0.3;          // (in cover on purpose)
    this._own(b);
    return null;
  }
  // on up our plant: stand 1.2 m out in front of a column of a climb face, ink it bottom to top (a canopy's: the trunk,
  // the platform's edge and the parapet), swim up it
  _botClimb(b, S, dt, it, move) {
    const a = b.a, p = S.p, f = S.face;
    const nx = f * p.s, nz = f * p.c;             // the face's outward normal (local ±z)
    const cx = p.x + S.u * p.c + f * p.hd * p.s, cz = p.z - S.u * p.s + f * p.hd * p.c;   // the column's foot
    if (a.climbing) {
      it.squid = true; it.fire = false; it.jump = false; it.sub = false; b._bombAim = false;
      move.set(-a.wallN.x, 0, -a.wallN.z);
      this._own(b);
      return null;
    }
    // popping over its top: onto its middle line and stop there (a wall's top is only ~1.2 m deep: the pop's carry
    // would take us over the far side)
    if (!a.grounded && a.pos.y > p.y + p.h * 0.6 && this._rectDist(p, a.pos.x, a.pos.z) < 1.2) {
      it.squid = false; it.fire = false; it.jump = false;
      const lz = (a.pos.x - p.x) * p.s + (a.pos.z - p.z) * p.c, k = clamp(-lz / 0.35, -1, 1);
      move.set(p.s * k, 0, p.c * k);
      this._own(b);
      return null;
    }
    const sx = cx + nx * 1.2, sz = cz + nz * 1.2, gx = sx - a.pos.x, gz = sz - a.pos.z, gl = Math.hypot(gx, gz);
    if (gl > 7 || (gl > 1.5 && !b._fatLos(a.pos.x, a.pos.y, a.pos.z, sx, a.pos.y, sz))) { S.task = null; S.cross = false; S.next = b.t + 4; return null; }
    // in front of the column: level with it along the face, 0.3–2.1 m out (a squid swimming in stays "in position")
    const lat = (a.pos.x - p.x) * p.c - (a.pos.z - p.z) * p.s, out = f * ((a.pos.x - p.x) * p.s + (a.pos.z - p.z) * p.c) - p.hd;
    const inPos = Math.abs(lat - S.u) < 0.5 && out > 0.3 && out < 2.1 && Math.abs(a.pos.y - p.y) < 0.5;
    const gap = inPos ? this._colGap(p, S, a.team) : 0;
    S.at = { gl, inPos, gap };            // (tests)
    // no headway up the column in 3 s (ink not taking, a shot that can't reach it): give it up for a while
    const lvl = gap === null ? 9 : gap;
    if (!(S.best >= 0) || lvl > S.best + 0.05) { S.best = lvl; S.bestT = b.t; }
    if (b.t - S.bestT > 3) { S.task = null; S.cross = false; S.next = b.t + 3; S.noClimb = { p, until: b.t + 10 }; return null; }
    if (inPos && gap === null && b.t >= (S.letGo || 0)) {
      it.squid = true; it.fire = false; it.jump = false; it.sub = false; b._bombAim = false;
      move.set(-nx, 0, -nz);
      if ((S.swimT = (S.swimT || 0) + dt) > 1.8) { S.swimT = 0; S.letGo = b.t + 0.8; }
      this._own(b);
      return null;
    }
    S.swimT = 0;
    it.squid = false;
    if (gl > 0.2) { const k = Math.min(1, gl / 0.8 + 0.2); move.set((gx / gl) * k, 0, (gz / gl) * k); } else move.set(0, 0, 0);
    this._own(b);
    if (inPos) b.perchUntil = b.t + 0.3;                 // (standing here inking the column on purpose)
    if (!inPos || gap === null || a.ink < PLAYER.inkMax * 0.04) { it.fire = false; return null; }
    if (out < 0.8) { move.set(nx, 0, nz); it.fire = false; return null; }   // (too close to ink it: a shot would start inside it)
    const aim = this._aimAt(a, cx, p.y + gap + 0.15, cz);
    const aimed = Math.abs(angleDiff(b.aimYaw, aim.yaw)) < 0.12 && Math.abs(b.aimPitch - aim.pitch) < 0.12;
    it.fire = this._trigger(b, S, aimed);
    return aim;
  }
  // the block whose climb face (on side f: local ±z) covers (lx, y) (null: none — past its end, over its top)
  _faceAt(p, f, lx, y) {
    for (const q of p.parts) {
      if (Math.abs(q.z + f * q.hz - f * p.hd) > 0.03) continue;
      if (Math.abs(lx - q.x) > q.hx || y < q.y0 || y > q.y1) continue;
      return q;
    }
    return null;
  }
  // the lowest height on the column that isn't our ink yet (null: ours to the top)
  _colGap(p, S, team) {
    const f = S.face, nx = f * p.s, nz = f * p.c;
    for (let y = 0.15; y < p.ht - 0.05; y += 0.2) {
      const ok = [-0.2, 0, 0.2].every((o) => {
        const lx = S.u + o, q = this._faceAt(p, f, lx, y);
        if (!q) return true;
        if (!q.paint) return false;
        const wx = p.x + lx * p.c + f * p.hd * p.s, wz = p.z - lx * p.s + f * p.hd * p.c;
        return q.paint.wallTeam(_v.set(wx, p.y + y, wz), _v2.set(nx, 0, nz)) === team + 1;
      });
      if (!ok) return y;
    }
    return null;
  }
  // on top: fight from it while there's a reason to be up there — a foe in range in sight or just seen (≤ 1.5 s), or the
  // zone below we guard / watch — holding its middle (a wall: strafing along it in a duel; a canopy: the parapet's side
  // toward the foe), hiding in our ink on it when hurt, inking it when there's nothing to shoot. The reason gone (1.5 s),
  // low on ink or health, a new role, the plant starting to wilt or nearly cut down → off it: walk off the edge nearest
  // where we're going (a plain drop; over a canopy's parapet with a hop) and plan again from below. Crossing our wall
  // (the gate): straight off its far side. Perching on purpose sets brain.perchUntil (botlab's stuck metric reads it as
  // holding); getting off doesn't
  _botTop(b, S, p, dt, it, move, vis) {
    const a = b.a;
    // (a fresh stay: not on this top a moment ago — a brain reset, a teleport — starts over)
    if (S.task !== 'top' || S.p !== p || !(b.t >= S.topT && b.t - S.topT < 0.5)) {
      const cross = S.cross && S.p === p;
      // (just up: a look round first — 3 s before 'nothing to fight from here' rather than 1.5)
      S.task = 'top'; S.p = p; S.t0 = b.t; S.okT = b.t + 1.5; S.exit = null; S.bad = -1; S.role = b.zRole || b.tRole || null; S.cross = cross;
    }
    S.topT = b.t;
    it.jump = false;
    const hp = a.hp / PLAYER.hp, ink = a.ink / PLAYER.inkMax, range = b._range() * 1.1;
    const tk = b.tk, fresh = b.target && (vis || (tk && G.time - tk.t <= 1.5));
    const inRange = fresh && b.tv && Math.hypot(b.tv.pos.x - a.pos.x, b.tv.pos.z - a.pos.z) < range;
    const guard = this.match.zones && (b.zRole === 'guard' || b.zRole === 'watch') && this._nearZone(p) < 6;
    if (inRange || guard) S.okT = b.t;
    const why = S.exit ? S.exit.why : S.cross ? 'cross'
      : b.t - S.okT > 1.5 ? 'no foe' : hp < 0.35 ? 'hurt' : ink < 0.08 && a.groundTeam !== 1 ? 'dry' : b.mode === 'retreat' ? 'retreat'
      : (b.zRole || b.tRole || null) !== S.role ? 'role' : p.state !== 'stand' || p.wiltAt - this.clock.t < 0.8 ? 'wilt' : p.life < p.life0 * 0.15 ? 'cut' : null;
    if (why) return this._botExit(b, S, p, it, move, why, vis);
    b.perchUntil = b.t + 0.3; this.stats.perched += dt; this._tally(p, 'perchS', dt);
    const [lx, lz] = this._loc(p, a.pos.x, a.pos.z);
    let wx, wz;
    if (p.kind === 'canopy') {
      // the platform inside the parapet: stand by its side toward the foe (a squid behind it is covered), strafing along
      const m = p.hw - p.def.cn.railW - PLAYER.radius - 0.08, n = p.hd - p.def.cn.railW - PLAYER.radius - 0.08;
      let fx = 0, fz = 0;
      if (b.tv) { const [tx, tz] = this._loc(p, b.tv.pos.x, b.tv.pos.z); const l = Math.hypot(tx, tz) || 1; fx = tx / l; fz = tz / l; }
      const k = 0.75, sx = vis ? b.strafeS * 0.8 : 0;
      wx = clamp(fx * m * k - fz * sx, -m, m); wz = clamp(fz * n * k + fx * sx, -n, n);
    } else { wx = clamp(lx + (vis ? b.strafeS * 0.8 : 0), -p.w / 2 + 0.4, p.w / 2 - 0.4); wz = 0; }
    const ex = wx - lx, ez = wz - lz;
    const gx = ex * p.c + ez * p.s, gz = -ex * p.s + ez * p.c, gl = Math.hypot(gx, gz);
    if (gl > 0.12) { const k = Math.min(0.8, gl / 0.5); move.set((gx / gl) * k, 0, (gz / gl) * k); } else move.set(0, 0, 0);
    it.squid = a.groundTeam === 1 && (hp < 0.45 || (!vis && ink < 0.4));
    if (it.squid) { it.fire = false; move.set(0, 0, 0); }
    this._own(b);
    // nothing to shoot: ink the top round our feet (to hide and refill in)
    if (!vis && !it.squid && a.groundTeam !== 1 && ink > 0.15) {
      it.fire = true;
      return { yaw: b.aimYaw, pitch: -1.0, dist: 1.6 };
    }
    return null;
  }
  // off the top: an edge with open floor under it — not the sea, a drop of at most ~3.6 m, room to land, the nav graph
  // there — nearest where we're going (the route's goal, else the foe, else the enemy base), away from a foe when we're
  // hurt; crossing: the far side; one that doesn't get us off in 2.5 s is dropped for another. A wall's: either long
  // side level with us, either end; a canopy's: the middle of each side, hopping its parapet
  _botExit(b, S, p, it, move, why, vis) {
    const a = b.a, nav = G.nav, L = G.level;
    if (!S.exit || b.t - S.exit.t0 > 2.5) {
      if (S.exit) S.bad = S.exit.k;
      const goal = b.goal >= 0 && nav.nodes[b.goal] ? nav.nodes[b.goal] : b.tv ? b.tv.pos : L.spawnPads[1 - a.team];
      const [lx0] = this._loc(p, a.pos.x, a.pos.z), lx = clamp(lx0, -p.w / 2 + 0.3, p.w / 2 - 0.3);
      const foe = (why === 'hurt' || why === 'dry' || why === 'retreat') && b.tv ? b.tv.pos : null;
      const cands = p.kind === 'canopy' ? [[0, p.hd + 0.6], [0, -p.hd - 0.6], [p.hw + 0.6, 0], [-p.hw - 0.6, 0]]
        : [[lx, p.hd + 0.55], [lx, -p.hd - 0.55], [p.hw + 0.55, 0], [-p.hw - 0.55, 0]];
      let best = null, bs = Infinity;
      cands.forEach(([qx, qz], k) => {
        if (why === 'cross' && k !== (S.face > 0 ? 1 : 0)) return;      // (the far side from the face we came up)
        const x = p.x + qx * p.c + qz * p.s, z = p.z - qx * p.s + qz * p.c;
        const gy = L.groundHeight(x, z, p.y + p.h - 0.2);
        if (!(gy > PLAYER.waterY + 0.4) || gy < p.y + p.h - 3.6) return;
        _v.set(x, gy + 0.02, z);
        if (G.physics && !G.physics.bodyFits(_v, PLAYER.radius, PLAYER.stepUp, PLAYER.height * 0.9)) return;
        if (nav && nav.nearest(_v, 0.8, true) < 0) return;
        let sc = Math.hypot(goal.x - x, goal.z - z) + 2 * Math.hypot(x - a.pos.x, z - a.pos.z) + (k === S.bad ? 60 : 0);
        if (foe) sc += Math.max(0, 8 - Math.hypot(foe.x - x, foe.z - z));
        if (sc < bs) { bs = sc; best = { x, z, k }; }
      });
      S.exit = best ? { ...best, t0: b.t, why } : { x: a.pos.x + (a.pos.x - p.x), z: a.pos.z + (a.pos.z - p.z), k: -1, t0: b.t, why };
      this.stats.exits++;
      if (why === 'cross') { this.stats.crossings++; this._tally(p, 'crossed'); }
    }
    const gx = S.exit.x - a.pos.x, gz = S.exit.z - a.pos.z, gl = Math.hypot(gx, gz) || 1;
    move.set(gx / gl, 0, gz / gl);
    it.squid = false; it.jump = false;
    // (a canopy's parapet: hop it once we're up against it)
    if (p.kind === 'canopy' && a.grounded) {
      const [lx, lz] = this._loc(p, a.pos.x, a.pos.z), rw = p.def.cn.railW, r = PLAYER.radius + 0.35;
      if (Math.abs(lx) > p.hw - rw - r || Math.abs(lz) > p.hd - rw - r) it.jump = true;
    }
    if (why === 'hurt' || why === 'retreat' || !vis) it.fire = false;
    this._settle(b); b.path = null; b.repath = Math.max(b.repath, 0.3);
    return null;
  }
  // A route (the brain's, just made) through a standing plant: the same goal with the plants' cores off-limits, if
  // that's at most 1.6 × as long; else walk up to it and cut it down (theirs) or climb over it (our wall: the gate) —
  // _botGate; else (no way round, and nothing to be done about it) hold short of it (bot(): a fight: it's cover;
  // otherwise the brain's next goal may lie elsewhere). Held on purpose (perchUntil) while waiting. A route that goes
  // round a wall (the brain's A* pays to cross the plants' nodes, so it usually does): if the way through is under
  // 1 / 1.6 of it, take the way through and deal with the wall the same way.
  _botRoute(b, S) {
    const path = b.path, hard = this.hard, nav = G.nav;
    if (!hard || !nav || !path.length) return;
    const a = b.a, team = a.team, start = nav.nearest(a.pos, 1.2, true), goal = path[path.length - 1];
    const noClimb = b._climbRule ? b._climbRule() : b.t < b.noClimbUntil;   // (the brain's own rule for climbs: bots.js)
    // (the lengths: from where we stand, along the route)
    const len = (q, i0) => { let s = 0; for (let i = Math.max(1, i0); i < q.length; i++) { const m = nav.nodes[q[i - 1]], n = nav.nodes[q[i]]; s += Math.hypot(n.x - m.x, n.z - m.z); } return s; };
    const pi = clamp(b.pi | 0, 0, path.length - 1), n0 = nav.nodes[path[pi]];
    const here = Math.hypot(n0.x - a.pos.x, n0.z - a.pos.z) + len(path, pi + 1);
    const firstHard = (q, i0, pod = -1) => { for (let i = Math.max(1, i0); i < q.length; i++) if (hard[q[i]] && (pod < 0 || this.hardPod[q[i]] === pod)) return i; return -1; };
    const gateOk = (p) => p && p.kind === 'wall' && (p.owner !== team || p.wiltAt - this.clock.t > 5);
    let cut = firstHard(path, pi);
    if (cut < 0) {
      // a route round a wall (the brain plans with the plants' nodes marked): is the way through it much shorter? then
      // take that and deal with the wall (cut it down / climb over it) — _botGate
      if (start < 0) return;
      const gn = nav.nodes[goal];
      for (const p of this.pods) {
        if (!(p.state === 'grow' || p.state === 'stand') || !gateOk(p) || !this._between(p, a.pos, gn, 0.4)) continue;
        const blk0 = nav.blocked; nav.blocked = null;
        const direct = nav.path(start, goal, team, undefined, noClimb);
        nav.blocked = blk0;
        const k = direct ? firstHard(direct, 1, p.i) : -1;
        if (k < 0) continue;
        const dl = len(direct, 1);
        S.route = { direct: +dl.toFixed(1), alt: +here.toFixed(1), pod: p.id, round: true };   // (tests)
        if (here > 1.6 * dl + 2) {
          b.path = direct; b.pi = Math.min(1, direct.length - 1); b.bestD = Infinity; b.noProg = 0; S.seen = direct;
          S.gate = { p, path: direct, i: k, own: p.owner === team, t0: b.t };
        }
        return;
      }
      return;
    }
    const p = this.pods[this.hardPod[path[cut]]] || null;
    const alt = start >= 0 && !hard[goal] ? nav.path(start, goal, team, undefined, noClimb, hard) : null;
    const altLen = alt ? len(alt, 1) : Infinity;
    S.route = { direct: +here.toFixed(1), alt: alt ? +altLen.toFixed(1) : null, pod: p ? p.id : null };   // (tests)
    const useAlt = () => { b.path = alt; b.pi = Math.min(1, alt.length - 1); b.bestD = Infinity; b.noProg = 0; S.seen = alt; this.stats.detours++; if (p) this._tally(p, 'detour'); };
    if (alt && (altLen <= 1.6 * here + 2 || !gateOk(p))) { useAlt(); return; }
    // the long way round (or none), through a wall: up to it — theirs to cut down, ours to climb over
    if (gateOk(p)) { S.gate = { p, path, i: cut, own: p.owner === team, t0: b.t }; return; }
    if (!S.hold) this.stats.waits++;
    S.hold = path; S.waitT = b.t + 1.2;
  }
  // walking a route into a wall (S.gate): near it, start cutting it down (theirs: once we can see it) or climbing over
  // it (ours, at the column the route crosses)
  _botGate(b, S) {
    const g = S.gate, p = g.p, a = b.a;
    if (b.path !== g.path || !(p.state === 'grow' || p.state === 'stand') || b.t - g.t0 > 25) { S.gate = null; return; }
    if (Math.abs(a.pos.y - p.y) > 1.2) return;           // (not down on its floor yet)
    const dist = this._rectDist(p, a.pos.x, a.pos.z);
    if (g.own) {
      if (dist < 3.2 && p.wiltAt - this.clock.t > 4) {
        const n = G.nav.nodes[g.path[g.i]], [lx] = this._loc(p, n.x, n.z);
        S.task = 'climb'; S.p = p; S.t0 = b.t; S.cross = true; S.gate = null;
        this._climbStart(b, S, p, lx);
      }
      return;
    }
    const reach = Math.max(2.4, Math.min(b._range() * 0.85, 8));
    if (dist < reach && this._seesPlant(a, p)) { S.task = 'cut'; S.p = p; S.t0 = b.t; S.gate = null; this.stats.cuts++; this._tally(p, 'cut'); }
  }
  // the nearest point of the plant's ground blocks to a, at chest height (a wall's face; a canopy's root curtain or
  // trunk) — seen clear?
  _cutPoint(a, p, out = _v3) {
    const [lx, lz] = this._loc(p, a.pos.x, a.pos.z);
    let best = Infinity, fx = 0, fz = 0, hy = 1;
    for (const g of p.parts) {
      if (!g.ground) continue;
      const cx = clamp(lx, g.x - g.hx + 0.2, g.x + g.hx - 0.2), cz = clamp(lz, g.z - g.hz + 0.1, g.z + g.hz - 0.1);
      // on the face toward us (the nearer of the two axes)
      const ox = Math.abs(lx - g.x) - g.hx, oz = Math.abs(lz - g.z) - g.hz;
      const x = ox > oz ? g.x + Math.sign(lx - g.x || 1) * g.hx : cx, z = ox > oz ? cz : g.z + Math.sign(lz - g.z || 1) * g.hz;
      const e = Math.hypot(x - lx, z - lz);
      if (e < best) { best = e; fx = x; fz = z; hy = g.y1 - g.y0; }
    }
    this._world(p, fx, fz, out);
    out.y = p.y + Math.min(1.2, hy * 0.5);
    return out;
  }
  _seesPlant(a, p) {
    const c = this._cutPoint(a, p);
    _v.set(a.pos.x, a.pos.y + 1.1, a.pos.z); _v2.copy(c).sub(_v);
    const len = _v2.length(); if (len < 0.3) return true;
    _v2.multiplyScalar(1 / len);
    const h = G.physics.raycast(_v, _v2, len + 0.3, this._hit || (this._hit = new Hit()), true);
    return h.hit && p.ids.has(h.block);
  }
  // cut it down: stand off at a comfortable range facing its face (the ground block), aim at chest height, keep firing
  // in the weapon's rhythm until it goes (a duel in sight: the fight first)
  _botCut(b, S, dt, it, move, vis) {
    const a = b.a, p = S.p;
    if (vis) return null;
    const c = this._cutPoint(a, p), aim = this._aimAt(a, c.x, c.y, c.z);
    const dx = a.pos.x - c.x, dz = a.pos.z - c.z, dl = Math.hypot(dx, dz) || 1;
    const want = clamp(b._range() * 0.55, 1.5, 5);
    if (dl > want + 0.7) move.set(-dx / dl, 0, -dz / dl); else if (dl < want - 0.7) move.set(dx / dl, 0, dz / dl); else move.set(0, 0, 0);
    it.squid = false; it.sub = false; it.jump = false; b._bombAim = false;
    this._own(b);
    b.perchUntil = b.t + 0.3;                            // (standing here on purpose)
    if (a.ink < PLAYER.inkMax * 0.05) { it.fire = false; if (a.groundTeam === 1) { it.squid = true; move.set(0, 0, 0); } return aim; }
    const aimed = Math.abs(angleDiff(b.aimYaw, aim.yaw)) < 0.14 && Math.abs(b.aimPitch - aim.pitch) < 0.14;
    it.fire = this._trigger(b, S, aimed);
    return aim;
  }
}

// ------------------------------------------------------------------------------------------------ leaves
// A puff of leaves when a plant bursts out (and dry ones as it wilts, is cut down, is hit): one instanced mesh of small
// leaf cards
class LeafPuffs {
  constructor(scene) {
    const N = (this.N = 420);
    const g = new THREE.BufferGeometry();
    // a pointed leaf (two triangles either side of a midrib, a slight fold)
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.07, 0.035, 0.006, 0, 0, 0, 0.07, -0.035, 0.006, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(g, this.mat, N);
    this.mesh.frustumCulled = false; this.mesh.name = 'pod-leaves'; this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.p = Array.from({ length: N }, () => ({ on: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0, t: 0, s: 1 }));
    this.next = 0;
    for (let i = 0; i < N; i++) this.mesh.setColorAt(i, _c.set(0x5ba257));
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
  }
  _slot() { const idx = this.next; this.next = (this.next + 1) % this.N; return idx; }
  puff(p, team, n, dry = false) {
    const col = team >= 0 && G.teamColors ? G.teamColors[team] : null, H = p.ht || p.h;
    for (let k = 0; k < n; k++) {
      const idx = this._slot(), L = this.p[idx];
      const lx = (Math.random() - 0.5) * p.w, lz = (Math.random() - 0.5) * p.d, ly = Math.random() * H * (dry ? 1 : 0.85);
      L.pos.set(p.x + lx * p.c + lz * p.s, p.y + ly + 0.1, p.z - lx * p.s + lz * p.c);
      const out = dry ? 0.6 + Math.random() * 0.6 : 2.4 + Math.random() * 2.6;
      const ox = lx / (p.w / 2 || 1) + (Math.random() - 0.5), oz = (lz / (p.d / 2 || 1)) * 1.6 + (Math.random() - 0.5);
      const wx = ox * p.c + oz * p.s, wz = -ox * p.s + oz * p.c, wl = Math.hypot(wx, wz) || 1;
      L.vel.set((wx / wl) * out, dry ? 0.3 + Math.random() * 0.8 : 2.8 + Math.random() * 3.8, (wz / wl) * out);
      L.rot.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
      L.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      L.life = dry ? 1.6 + Math.random() : 1.1 + Math.random() * 0.9; L.t = 0; L.on = true; L.s = (0.8 + Math.random() * 0.9) * (H > 2.2 ? 1.25 : 1);
      _c.set(dry ? ['#9a7a45', '#8a6a3a', '#7d8a45'][k % 3] : ['#5ba257', '#8fc46b', '#3f8249'][k % 3]);
      if (col && !dry && k % 4 === 0) _c.lerp(_c2.copy(col), 0.6);        // (a few petals in the grower's ink)
      this.mesh.setColorAt(idx, _c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  // a few leaves shaken loose at pos (a hit): greener while it's healthy, browner as it's cut down (k 0…1)
  shed(pos, n, k = 0) {
    if (!pos) return;
    for (let i = 0; i < n; i++) {
      const idx = this._slot(), L = this.p[idx];
      L.pos.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + (Math.random() - 0.5) * 0.3, pos.z + (Math.random() - 0.5) * 0.4);
      L.vel.set((Math.random() - 0.5) * 2.2, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 2.2);
      L.rot.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
      L.spin.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
      L.life = 0.9 + Math.random() * 0.8; L.t = 0; L.on = true; L.s = 0.7 + Math.random() * 0.6;
      _c.set(['#5ba257', '#8fc46b', '#3f8249'][i % 3]).lerp(_c2.set(i % 2 ? '#9a7a45' : '#7d8a45'), Math.min(1, 0.2 + k));
      this.mesh.setColorAt(idx, _c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    let n = 0;
    const m = this._m, q = this._q, s = this._s;
    for (let i = 0; i < this.N; i++) {
      const L = this.p[i];
      if (!L.on) continue;
      L.t += dt;
      if (L.t >= L.life) { L.on = false; continue; }
      L.vel.y -= 5.5 * dt; L.vel.multiplyScalar(1 - Math.min(0.9, 2.2 * dt));
      L.vel.x += Math.sin(L.t * 7 + i) * 0.6 * dt; L.vel.z += Math.cos(L.t * 6 + i * 1.3) * 0.6 * dt;   // (flutter)
      L.pos.addScaledVector(L.vel, dt);
      L.rot.x += L.spin.x * dt; L.rot.y += L.spin.y * dt; L.rot.z += L.spin.z * dt;
      const k = L.s * Math.min(1, (L.life - L.t) / 0.35);
      m.compose(L.pos, q.setFromEuler(L.rot), s.set(k, k, k));
      this.mesh.setMatrixAt(i, m); n = i + 1;
    }
    this.mesh.count = n;
    // (dead slots below n render at zero scale)
    for (let i = 0; i < n; i++) if (!this.p[i].on) { this.mesh.setMatrixAt(i, m.makeScale(0, 0, 0)); }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); this.mesh.dispose?.(); }
}

// ------------------------------------------------------------------------------------------------ sounds
// (synthesised like every other: src/audio/audio.js voices)
// the meter filling: a short leafy rustle (a crackle of noise ticks through a leafy band, a soft swish under it)
if (!SFX.pod_rustle) SFX.pod_rustle = {
  gain: 0.3, max: 4, jitter: 0.1, reverb: 0.06, minGap: 0.05,
  build(v, p) {
    const T = v.t;
    v.nz({ kind: 'pink', f: 2600 * p, f1: 1500 * p, sw: 0.16, q: 1.1, a: 0.012, d: 0.16, peak: 0.5 });
    const cg = v.gain(0, v.out);
    cg.gain.setValueAtTime(0, T); cg.gain.linearRampToValueAtTime(0.7, T + 0.02); cg.gain.linearRampToValueAtTime(0, T + 0.2);
    v.buffer(texture(v.ctx, 'sizzle'), T, T + 0.22, v.filter('bandpass', 3800 * p, 0.9, cg), 0.7 * p);
  },
};
// a plant bursting out: a soft thump, a rising leafy whoomph, a shower of rustles settling
if (!SFX.pod_grow) SFX.pod_grow = {
  gain: 0.5, max: 3, jitter: 0.05, reverb: 0.18,
  build(v, p) {
    const T = v.t;
    v.tone({ f: 120 * p, f1: 45 * p, sw: 0.22, a: 0.004, d: 0.3, peak: 0.9 });                        // thump
    const g = v.gain(0, v.out), bp = v.filter('bandpass', 260 * p, 0.9, g);                            // whoomph
    bp.frequency.setValueAtTime(260 * p, T); bp.frequency.exponentialRampToValueAtTime(1500 * p, T + 0.28); bp.frequency.exponentialRampToValueAtTime(700 * p, T + 0.6);
    g.gain.setValueAtTime(0, T); g.gain.linearRampToValueAtTime(0.9, T + 0.1); g.gain.linearRampToValueAtTime(0.35, T + 0.35); g.gain.linearRampToValueAtTime(0, T + 0.7);
    v.noise('pink', T, T + 0.72, bp);
    const cg = v.gain(0, v.out);                                                                         // leaves settling
    cg.gain.setValueAtTime(0, T + 0.05); cg.gain.linearRampToValueAtTime(0.6, T + 0.2); cg.gain.linearRampToValueAtTime(0, T + 0.95);
    v.buffer(texture(v.ctx, 'sizzle'), T + 0.05, T + 0.97, v.filter('bandpass', 3200 * p, 0.8, cg), 0.6);
    v.tone({ t: 0.02, type: 'triangle', f: 330 * p, f1: 520 * p, sw: 0.12, a: 0.005, d: 0.12, peak: 0.12 });   // a bright pop on top
  },
};
// …and under it, for the big plants: a deep woody heave (the trunk / canes forcing up out of the soil: a low groan
// sweeping up, creaks), a roaring rush of leaves opening out, a last flurry
if (!SFX.pod_burst) SFX.pod_burst = {
  gain: 0.55, max: 3, jitter: 0.04, reverb: 0.22,
  build(v, p) {
    const T = v.t;
    v.tone({ f: 58 * p, f1: 96 * p, sw: 0.4, a: 0.02, d: 0.45, peak: 0.8 });                            // the heave
    v.tone({ t: 0.03, type: 'triangle', f: 42 * p, f1: 70 * p, sw: 0.3, a: 0.01, d: 0.35, peak: 0.5 });
    for (let i = 0; i < 4; i++) v.tone({ t: 0.05 + i * 0.07 + v.r(0, 0.03), type: 'sawtooth', f: v.r(170, 260) * p, f1: v.r(120, 180) * p, sw: 0.06, a: 0.004, d: 0.07, peak: 0.12 });   // creaks
    const g = v.gain(0, v.out), bp = v.filter('bandpass', 500 * p, 0.6, g);                             // leaves opening out
    bp.frequency.setValueAtTime(500 * p, T + 0.12); bp.frequency.exponentialRampToValueAtTime(2600 * p, T + 0.45); bp.frequency.exponentialRampToValueAtTime(1200 * p, T + 1.0);
    g.gain.setValueAtTime(0, T + 0.1); g.gain.linearRampToValueAtTime(0.85, T + 0.3); g.gain.linearRampToValueAtTime(0.3, T + 0.6); g.gain.linearRampToValueAtTime(0, T + 1.05);
    v.noise('pink', T + 0.1, T + 1.07, bp);
    const cg = v.gain(0, v.out);
    cg.gain.setValueAtTime(0, T + 0.35); cg.gain.linearRampToValueAtTime(0.5, T + 0.5); cg.gain.linearRampToValueAtTime(0, T + 1.25);
    v.buffer(texture(v.ctx, 'sizzle'), T + 0.35, T + 1.27, v.filter('bandpass', 4200 * p, 0.8, cg), 0.8);
  },
};
// enemy ink hitting a plant: a leafy thwack (a short slap of noise, a twiggy tick)
if (!SFX.pod_hit) SFX.pod_hit = {
  gain: 0.28, max: 4, jitter: 0.12, reverb: 0.05, minGap: 0.06,
  build(v, p) {
    v.nz({ kind: 'pink', f: 1900 * p, f1: 900 * p, sw: 0.08, q: 0.9, a: 0.002, d: 0.09, peak: 0.7 });
    v.nz({ t: 0.01, ft: 'highpass', f: 3000, a: 0.0005, d: v.r(0.01, 0.02), peak: 0.35 });
  },
};
// a plant nearly cut down: a woody crack (a sharp split, a creak, a spill of twigs)
if (!SFX.pod_crack) SFX.pod_crack = {
  gain: 0.5, max: 2, jitter: 0.04, reverb: 0.14,
  build(v, p) {
    v.nz({ ft: 'highpass', f: 1800 * p, a: 0.0006, d: 0.05, peak: 0.9 });                                // the split
    v.tone({ t: 0.01, type: 'sawtooth', f: 240 * p, f1: 110 * p, sw: 0.25, a: 0.004, d: 0.3, peak: 0.25 });   // the creak
    for (let i = 0; i < 5; i++) v.nz({ t: 0.06 + v.r(0, 0.35), ft: 'highpass', f: 2600, a: 0.0005, d: v.r(0.008, 0.02), peak: v.r(0.25, 0.5) });
  },
};
// cut down: a loud snap, a groaning collapse, leaves raining down
if (!SFX.pod_snap) SFX.pod_snap = {
  gain: 0.6, max: 2, jitter: 0.03, reverb: 0.2,
  build(v, p) {
    const T = v.t;
    v.nz({ ft: 'highpass', f: 1400 * p, a: 0.0005, d: 0.07, peak: 1 });                                  // snap
    v.tone({ type: 'sawtooth', f: 180 * p, f1: 60 * p, sw: 0.6, a: 0.01, d: 0.7, peak: 0.3 });           // the groan down
    v.tone({ t: 0.05, f: 90 * p, f1: 40 * p, sw: 0.5, a: 0.01, d: 0.5, peak: 0.6 });                      // the thud
    const cg = v.gain(0, v.out);
    cg.gain.setValueAtTime(0, T + 0.05); cg.gain.linearRampToValueAtTime(0.8, T + 0.2); cg.gain.linearRampToValueAtTime(0, T + 1.2);
    const bp = v.filter('bandpass', 2200 * p, 0.7, cg);
    bp.frequency.setValueAtTime(2200 * p, T); bp.frequency.exponentialRampToValueAtTime(900 * p, T + 1.2);
    v.buffer(texture(v.ctx, 'sizzle'), T + 0.05, T + 1.22, bp, 0.9);
    for (let i = 0; i < 7; i++) v.nz({ t: v.r(0.05, 0.7), ft: 'highpass', f: 2500, a: 0.0005, d: v.r(0.008, 0.02), peak: v.r(0.3, 0.6) });
  },
};
// a plant wilting: a dry crackle of twigs and leaves, sinking
if (!SFX.pod_wilt) SFX.pod_wilt = {
  gain: 0.42, max: 3, jitter: 0.06, reverb: 0.12,
  build(v, p) {
    const T = v.t;
    const cg = v.gain(0, v.out);
    cg.gain.setValueAtTime(0, T); cg.gain.linearRampToValueAtTime(0.9, T + 0.08); cg.gain.linearRampToValueAtTime(0.5, T + 0.6); cg.gain.linearRampToValueAtTime(0, T + 1.1);
    const bp = v.filter('bandpass', 2600 * p, 0.7, cg);
    bp.frequency.setValueAtTime(2600 * p, T); bp.frequency.exponentialRampToValueAtTime(1100 * p, T + 1.1);
    v.buffer(texture(v.ctx, 'sizzle'), T, T + 1.12, bp, 0.9);
    for (let i = 0; i < 6; i++) v.nz({ t: v.r(0, 0.8), ft: 'highpass', f: 2500, a: 0.0005, d: v.r(0.008, 0.02), peak: v.r(0.3, 0.6) });   // twig snaps
    v.nz({ kind: 'pink', ft: 'lowpass', f: 900 * p, f1: 250 * p, sw: 0.9, a: 0.05, d: 0.9, peak: 0.35 });                          // settling down
  },
};
