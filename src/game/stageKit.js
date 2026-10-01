// Stage set pieces' shared machinery — used by the timetabled movers (src/game/movers.js: Calamari County's railcars)
// and the sprout pods (src/game/pods.js: growable hedges). Anything on a stage that moves, appears or blocks at run time:
//   • StageClock: the match's playing time (duration − time: the host's clock, which every follower already runs in
//     step with), carried on by frame time where the match clock stops (practice, the menu backdrop, overtime) — so
//     every client computes the same set piece state with no per-frame network traffic
//   • nav layers: several owners mark nav nodes blocked at once (nav.blocked is their union); routes into newly
//     blocked nodes are re-planned
//   • shoveActor: push a squidkid out of a set piece's way — only where its body fits, over floor (never into a wall,
//     never into the sea, never through a wall on the way)
//   • buildLook / disposeLook: a moving / growing set piece's mesh from PropKit (PropKit.buildPart)
import * as THREE from 'three';
import { G } from '../core/ctx.js';
import { PLAYER } from '../config.js';
import { Hit } from './physics.js';

const _h = new THREE.Vector3(), _a = new THREE.Vector3(), _d = new THREE.Vector3(), _lh = new Hit();

// ------------------------------------------------------------------------------------------------ clock
export class StageClock {
  constructor() { this.t = 0; }
  // per frame (Match.update): returns the clock (s of play)
  tick(m, dt) {
    if (m.state !== 'playing') return this.t;
    this.t += dt;
    // the host's clock: duration − time (followers track it); overtime / practice / attract keep counting frame time
    if (!m.practice && m.time > 0 && Number.isFinite(m.duration)) {
      const want = m.duration - m.time, d = want - this.t;
      if (Math.abs(d) > 1.5) this.t = want; else this.t += d * Math.min(1, dt * 3);
    }
    return this.t;
  }
}

// ------------------------------------------------------------------------------------------------ nav layers
// nav.blocked (Uint8Array, NavGraph): routes pay heavily to enter a marked node, goals skip them. Each owner (a movers
// set, the pods) keeps its own layer; commit() rebuilds the union and re-plans every bot whose route runs into a node
// that wasn't marked before.
export function navClaim(owner) {
  const nav = G.nav;
  if (!nav) return null;
  const N = nav.nodes.length;
  if (!nav._layers || nav._layersN !== N) { nav._layers = new Map(); nav._layersN = N; }
  let L = nav._layers.get(owner);
  if (!L) { L = new Uint8Array(N); nav._layers.set(owner, L); }
  else L.fill(0);
  if (!nav.blocked || nav.blocked.length !== N) nav.blocked = new Uint8Array(N);
  return L;
}
export function navCommit(actors) {
  const nav = G.nav;
  if (!nav || !nav._layers) return;
  const N = nav.nodes.length, prev = nav._prevBlk && nav._prevBlk.length === N ? nav._prevBlk : (nav._prevBlk = new Uint8Array(N));
  if (!nav.blocked || nav.blocked.length !== N) nav.blocked = new Uint8Array(N);
  const blk = nav.blocked;
  prev.set(blk);
  blk.fill(0);
  for (const L of nav._layers.values()) for (let i = 0; i < N; i++) if (L[i]) blk[i] = 1;
  // routes into newly marked nodes: replan now
  for (const a of actors || []) {
    const b = a.bot;
    if (!b || !b.path) continue;
    for (let i = Math.max(0, (b.pi | 0) - 1); i < b.path.length; i++) {
      const id = b.path[i];
      if (blk[id] && !prev[id]) { b.path = null; b.repath = 0; break; }
    }
  }
}
export function navRelease(owner) {
  const nav = G.nav;
  if (!nav || !nav._layers || !nav._layers.has(owner)) return;
  nav._layers.delete(owner);
  if (!nav._layers.size) { nav.blocked = null; nav._layers = null; return; }
  navCommit(null);
}
// nav nodes under a turned box footprint: centre (cx, cz), heading yaw (its local x along (cos, 0, −sin)), half sizes
// hx × hz, grown by pad; only nodes between y0 and y1 (its floor, not a deck above or below)
export function navNodesInBox(cx, cz, yaw, hx, hz, pad, y0, y1) {
  const nav = G.nav, out = [];
  if (!nav) return out;
  const c = Math.cos(yaw), s = Math.sin(yaw), ex = Math.abs(c) * hx + Math.abs(s) * hz + pad, ez = Math.abs(s) * hx + Math.abs(c) * hz + pad;
  const ix0 = Math.max(0, Math.floor((cx - ex - nav.x0) / nav.step)), ix1 = Math.min(nav.nx - 1, Math.ceil((cx + ex - nav.x0) / nav.step));
  const iz0 = Math.max(0, Math.floor((cz - ez - nav.z0) / nav.step)), iz1 = Math.min(nav.nz - 1, Math.ceil((cz + ez - nav.z0) / nav.step));
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    for (const id of nav.cells[iz * nav.nx + ix]) {
      const n = nav.nodes[id];
      if (n.y < y0 || n.y > y1) continue;
      const dx = n.x - cx, dz = n.z - cz, lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= hx + pad && Math.abs(lz) <= hz + pad) out.push(id);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ shoving
// Can this client push actor a about? (its own squidkids only: a remote one is where its owner puts it)
export const shovable = (a) => a.alive && !a.remote && !a.superJumpState;

// Move squidkid `a` to the first of `spots` ([[x, z], …]) where its body fits. opts.floor: there must also be floor
// under it above the water and no big drop (never into the sea); opts.line: nothing solid on the straight line from
// where it stands (never through a wall). Returns the index of the spot used, or -1 (nothing moved).
export function shoveActor(a, spots, opts = {}) {
  const P = G.physics, L = G.level, squid = a.form === 'squid';
  for (let i = 0; i < spots.length; i++) {
    const [x, z] = spots[i];
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    _h.set(x, a.pos.y, z);
    if (P && !P.bodyFits(_h, PLAYER.radius, PLAYER.stepUp, PLAYER.height * 0.9, squid)) continue;
    if (opts.floor && L && !floorFor(a, x, z)) continue;
    if (opts.line && P && !clearLine(a.pos, x, z)) continue;
    a.pos.x = x; a.pos.z = z;
    if (a.stats) a.stats.shoved = (a.stats.shoved || 0) + 1;
    return i;
  }
  return -1;
}
// floor under (x, z) for a kid standing at a.pos: above the water, and no more than a short drop down
export function floorFor(a, x, z) {
  const L = G.level, gh = L.groundHeight(x, z, a.pos.y + PLAYER.stepUp + 0.05, a.form === 'squid');
  return gh > PLAYER.waterY + 0.4 && gh > a.pos.y - 1.6;
}
// nothing solid at waist / knee height on the straight line from p to (x, z)
export function clearLine(p, x, z) {
  const P = G.physics;
  _d.set(x - p.x, 0, z - p.z);
  const len = _d.length();
  if (len < 1e-3) return true;
  _d.multiplyScalar(1 / len);
  for (const y of [0.45, 0.9]) {
    _a.set(p.x, p.y + y, p.z);
    if (P.raycast(_a, _d, len + PLAYER.radius, _lh, false).hit) return false;
  }
  return true;
}

// ------------------------------------------------------------------------------------------------ looks
// A set piece's mesh: PropKit type o.type built in its own frame (origin = its ground point), added to the scene; a
// type the kit doesn't know falls back to `fallback` (or an empty group). Headless / no kit: an empty group.
export function buildLook(o, fallback) {
  const kit = G.game?.props;
  let g = null;
  if (kit?.buildPart) {
    const type = o && o.type && (!kit.hasType || kit.hasType(o.type)) ? o.type : fallback;
    if (type) g = kit.buildPart(type, o || {});
  }
  if (!g) g = new THREE.Group();
  G.scene?.add(g);
  return g;
}
export function disposeLook(g) {
  if (!g) return;
  const kit = G.game?.props;
  if (kit?.disposePart) kit.disposePart(g); else g.removeFromParent();
}
