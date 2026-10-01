// Navigation graph auto-generated from the level: 1 m grid of walkable samples on every floor/platform/ramp,
// connected by walk / jump-up / drop-down edges. A* with a binary heap.
import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { Hit } from './physics.js';

const _p = new THREE.Vector3(), _d = new THREE.Vector3();
// where a cell's node may move to when its centre doesn't fit a body (_build: lanes the grid misses), nearest first
const NUDGE = [[0, 0.25], [0, -0.25], [0.25, 0], [-0.25, 0], [0, 0.45], [0, -0.45], [0.45, 0], [-0.45, 0]];
// build options (botlab A/Bs build a second graph with one off): nudge = fill the lanes the grid misses (_build)
export const NAV_OPTS = { nudge: true };
// A climb edge's cost (metres of running it's worth): the run to the node on top + `base` + `perM` per metre of rise, +
// `tallPerM` per metre above `tall`. Measured with bots (tools/botlab/tests/bot-climb.js, forced climbs, all 15 mains):
// a 1.3 m wall takes ~1.2–2 s from its foot, a 2.8 m one ~2–3.3 s (the column's top strip wants a hop or two, and a
// squid's more likely to slip at a bare patch) — a tall climb is dearer per metre than a short one. So from the foot of
// Lockgate's lock-chamber stair (~2 s to the top) the 2.8 m side wall costs ~17.5 (it was 9.7: bots stood inking it
// while the stair was the quicker way up), and the 1.3 m loading bank still ~6.5 (a shortcut).
export const CLIMB_COST = { base: 3.5, perM: 1.5, tall: 1.5, tallPerM: 3.5 };

export class NavGraph {
  constructor(level, physics) {
    this.level = level; this.physics = physics;
    this.step = 1.0;
    this.nodes = [];
    // stage movers (src/game/movers.js): nodes a moving set piece covers or is about to sweep (Uint8Array, or null).
    // Routes pay heavily to enter one (never forbidden: a bot standing in one still walks out the shortest way); goals
    // skip them (nearest() without `start`)
    this.blocked = null;
    this._build();
  }

  _build() {
    const L = this.level, B = L.bounds, st = this.step;
    this.x0 = B.minX + st / 2; this.z0 = B.minZ + st / 2;
    this.nx = Math.floor((B.maxX - B.minX) / st); this.nz = Math.floor((B.maxZ - B.minZ) / st);
    this.cells = new Array(this.nx * this.nz);
    const ids = [], fails = [];
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const x = this.x0 + ix * st, z = this.z0 + iz * st;
        const heights = [];
        L.queryBlocks(x - 0.01, z - 0.01, x + 0.01, z + 0.01, ids);
        for (const id of ids) {
          const b = L.blocks[id];
          if (!b.solid || b.axes[1].y < 0.6 || b.roof || b.rail || b.noNav) continue;   // (roofs: off limits; rail tops / noNav walls: no route runs along them)
          const y = this._topAt(b, x, z);
          if (y === null) continue;
          if (heights.some((h) => Math.abs(h.y - y) < 0.15)) continue;
          heights.push({ y, b });
        }
        const list = [];
        for (const { y, b } of heights) {
          // headroom + clearance (not inside geometry, not hugging walls)
          if (!this._clear(x, y, z)) { fails.push({ ix, iz, x, z, b }); continue; }
          list.push(this._addNode(x, y, z, ix, iz).id);
        }
        this.cells[iz * this.nx + ix] = list;
      }
    }
    // Lanes the 1 m grid misses: a cell centre too close to a rail or wall on both sides of a narrow lane (e.g. Lockgate's
    // lock-chamber stair, three flights 1.7 m wide split by handrails — the grid rows land 0.37 m from the rails, so the
    // middle flight had no node at all, and a bot that ended up in it could only head for a node across a handrail). Such
    // a cell gets its node nudged up to half a cell off its centre to where the body fits — only where no node already
    // stands within 0.9 m at that level (a hole in the graph, never a second row along a wall).
    for (const f of NAV_OPTS.nudge ? fails : []) {
      for (const [ox, oz] of NUDGE) {
        const x = f.x + ox, z = f.z + oz, y = this._topAt(f.b, x, z);
        if (y === null || this._near(f.ix, f.iz, x, y, z, 0.9) || !this._clear(x, y, z)) continue;
        const node = this._addNode(x, y, z, f.ix, f.iz);
        node.nudged = true;
        this.cells[f.iz * this.nx + f.ix].push(node.id);
        break;
      }
    }
    // water proximity: wet = 2 with open water within ~1.2 m, 1 within ~2.2 m (paths pay extra to hug such edges);
    // overWater = standing on a grate with water under it (a squid would drop through)
    for (const n of this.nodes) {
      n.wet = 0;
      for (const [rad, level] of [[1.2, 2], [2.2, 1]]) {
        if (n.wet) break;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          if (L.groundHeight(n.x + Math.cos(a) * rad, n.z + Math.sin(a) * rad, n.y + 0.6) === -Infinity) { n.wet = level; break; }
        }
      }
      n.overWater = L.groundHeight(n.x, n.z, n.y + 0.3, true) === -Infinity;
    }
    // edges
    for (const n of this.nodes) {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const jx = n.ix + dx, jz = n.iz + dz;
        if (jx < 0 || jz < 0 || jx >= this.nx || jz >= this.nz) continue;
        for (const mid of this.cells[jz * this.nx + jx]) {
          const m = this.nodes[mid];
          const dy = m.y - n.y;
          const flat = Math.hypot(dx, dz) * this.step;
          if (Math.abs(dy) <= 0.5) {
            if (dx && dz) { // diagonal: both orthogonal neighbours must exist at similar height
              if (!this._has(n.ix + dx, n.iz, n.y) || !this._has(n.ix, n.iz + dz, n.y)) continue;
            }
            if (this._blocked(n, m, Math.max(n.y, m.y))) continue;   // a railing / thin wall between the two cells
            n.nb.push({ to: mid, cost: flat, type: 'walk' });
          } else if (dy > 0.5 && dy <= 1.25 && !(dx && dz)) {
            if (this._blocked(n, m, m.y)) continue;                    // rail along the ledge above
            n.nb.push({ to: mid, cost: flat + 2.5, type: 'jump' });
          } else if (dy < -0.5 && dy >= -3.4 && !(dx && dz) && this._openAbove(m, n.y)) {
            if (this._blocked(n, m, n.y)) continue;                    // rail along the ledge you'd drop off
            n.nb.push({ to: mid, cost: flat + 0.8, type: 'drop' });
          }
        }
      }
    }
    this._climbEdges();
    // keep nodes connected to the spawn both ways (see _prune)
    this._prune();
  }

  // the height of block b's top face at (x, z), or null where (x, z) is off that face
  _topAt(b, x, z) {
    const n = b.axes[1];
    const top = _p.copy(b.center).addScaledVector(n, b.half.y);
    const y = top.y - (n.x * (x - top.x) + n.z * (z - top.z)) / n.y;
    _d.set(x, y - 0.02, z);
    return this.level.pointInBlock(b, _d, 0.001) ? y : null;
  }
  _addNode(x, y, z, ix, iz) {
    const L = this.level, node = { id: this.nodes.length, x, y, z, ix, iz, nb: [], zone: -1 };
    for (let t = 0; t < 2; t++) {
      const pad = L.spawnPads[t];
      if (Math.hypot(x - pad.x, z - pad.z) < L.spawnBarrier + 0.6 && y > pad.y - 1) node.zone = t;
    }
    this.nodes.push(node);
    return node;
  }
  // a node already within r m of (x, y, z) (level with it: ±0.6 m) in cell (ix, iz) or its neighbours
  _near(ix, iz, x, y, z, r) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= this.nx || jz >= this.nz) continue;
      for (const id of this.cells[jz * this.nx + jx] || []) {
        const m = this.nodes[id];
        if (Math.abs(m.y - y) < 0.6 && Math.hypot(m.x - x, m.z - z) < r) return true;
      }
    }
    return false;
  }

  // is the walk between two neighbouring cells cut by something solid at waist height — a railing, fence or thin wall
  // standing between the cell centres (grates and rails count: kids can't pass them)
  _blocked(n, m, y) {
    if (!this.physics) return false;
    _p.set(n.x, y + 0.6, n.z); _d.set(m.x - n.x, 0, m.z - n.z);
    const len = _d.length(); if (len < 1e-4) return false;
    _d.multiplyScalar(1 / len);
    return this.physics.raycast(_p, _d, len, this._bh || (this._bh = new Hit()), false).hit;
  }

  // a drop lands on m only if nothing solid hangs over it below the ledge it drops from (a walkway / veranda / deck
  // overhead would otherwise read as a drop "through" its own floor)
  _openAbove(m, fromY) {
    const L = this.level;
    for (let y = m.y + 1.0; y < fromY - 0.05; y += 0.3) if (L.pointInside(_p.set(m.x, y, m.z), 0)) return false;
    return true;
  }

  _has(ix, iz, y) {
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return false;
    return this.cells[iz * this.nx + ix].some((id) => Math.abs(this.nodes[id].y - y) <= 0.5);
  }

  _clear(x, y, z) {
    const L = this.level;
    const r = PLAYER.radius + 0.08;
    // the body ring is tested from just above step-up height: the capsule rides that high (curbs below it are walked
    // onto), and a lower ring would dip into the slope itself on any ramp steeper than ~18°
    for (const h of [0.15, 0.4, 0.85, 1.4]) {
      if (L.pointInside(_p.set(x, y + h, z), 0)) return false;
      if (h < PLAYER.stepUp) continue;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        if (L.pointInside(_p.set(x + Math.cos(a) * r, y + h, z + Math.sin(a) * r), 0)) return false;
      }
    }
    return true;
  }


  _prune() {
    // Directed reachability from the team-0 spawn. valid = nodes you can reach from spawn AND walk/jump back from
    // (goals: never send a bot into a pit it can't leave); exitable = nodes that can get back to spawn (starts: a bot
    // that fell somewhere odd can still path home).
    const N = this.nodes.length;
    const radj = Array.from({ length: N }, () => []);
    for (const n of this.nodes) for (const e of n.nb) radj[e.to].push(n.id);
    const walk = (start, next) => {
      const seen = new Uint8Array(N), stack = [start]; seen[start] = 1;
      while (stack.length) { const k = stack.pop(); for (const j of next(k)) if (!seen[j]) { seen[j] = 1; stack.push(j); } }
      return seen;
    };
    // seed = the node of the largest undirected region nearest the team-0 spawn pad (never a lone node on a prop top)
    const und = (k) => [...this.nodes[k].nb.map((e) => e.to), ...radj[k]];
    const comp = new Int32Array(N).fill(-1);
    let bestC = -1, bestSize = 0, c = 0;
    for (let i = 0; i < N; i++) {
      if (comp[i] >= 0) continue;
      const seen = walk(i, und); let size = 0;
      for (let k = 0; k < N; k++) if (seen[k]) { comp[k] = c; size++; }
      if (size > bestSize) { bestSize = size; bestC = c; }
      c++;
    }
    const pad = this.level.spawnPads[0];
    let seed = -1, sd = Infinity;
    for (const n of this.nodes) {
      if (comp[n.id] !== bestC) continue;
      const d = (n.x - pad.x) ** 2 + (n.z - pad.z) ** 2 + ((n.y - pad.y) * 3) ** 2;
      if (d < sd) { sd = d; seed = n.id; }
    }
    this.valid = new Uint8Array(N);
    if (seed < 0) { this.exitable = this.valid; this.validIds = []; return; }
    const fwd = walk(seed, (k) => this.nodes[k].nb.map((e) => e.to));
    const back = walk(seed, (k) => radj[k]);
    this.exitable = back;
    let count = 0;
    for (let i = 0; i < N; i++) { this.valid[i] = fwd[i] && back[i] ? 1 : 0; count += this.valid[i]; }
    // safety net: if the two-way set is implausibly small, fall back to the whole region rather than strand the bots
    if (count < bestSize * 0.5) { for (let i = 0; i < N; i++) this.valid[i] = comp[i] === bestC ? 1 : 0; this.exitable = this.valid; }
    this.validIds = this.nodes.filter((n) => this.valid[n.id]).map((n) => n.id);
  }


  // start = true also accepts nodes that are only a way *out* (see _prune)
  nearest(pos, maxUp = 0.8, start = false) {
    const ix = Math.round((pos.x - this.x0) / this.step), iz = Math.round((pos.z - this.z0) / this.step);
    let best = -1, bd = Infinity;
    for (let r = 0; r <= 3; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= this.nx || jz >= this.nz) continue;
        for (const id of this.cells[jz * this.nx + jx]) {
          if (!this.valid[id] && !(start && this.exitable[id])) continue;
          if (!start && this.blocked && this.blocked[id]) continue;
          const n = this.nodes[id];
          if (n.y > pos.y + maxUp) continue;
          const d = (n.x - pos.x) ** 2 + (n.z - pos.z) ** 2 + ((n.y - pos.y) * 2.5) ** 2;
          if (d < bd) { bd = d; best = id; }
        }
      }
      if (best >= 0) return best;
    }
    return best;
  }

  // A* from node a to node b; `team` blocks the enemy spawn zone. The search cap grows with the stage (3 × its nodes). Returns array of node ids (incl. a and b) or null.
  // noClimb: true = plan without climb edges (a bot that just failed a climb); a number = every climb edge costs that
  // much more (a bot that can't ink a wall column now — dry, refilling: a climb only where there's no way round);
  // { add, minRise, maxRise, out, bad } = `add` more each, and `out` more still (none at all without `out`) for one that
  // rises outside minRise…maxRise (a weapon that can't ink so high — the brush — or so low: the roller) or is the edge
  // `bad` (the one that just failed);
  // avoid: nodes never entered (Uint8Array — e.g. where a sprout pod's hedge stands: pods.js routes round it); cost:
  // extra cost to enter a node (Uint8Array or null — e.g. the enemy specials a bot knows about, botSpecials.js: routes
  // go round a Vortex Strike, a Tempest's rain …)
  path(a, b, team, maxIter = Math.max(6000, this.nodes.length * 3), noClimb = false, avoid = null, cost = null) {
    if (a < 0 || b < 0) return null;
    const N = this.nodes.length;
    if (!this._g || this._g.length !== N) { this._g = new Float32Array(N); this._from = new Int32Array(N); this._seen = new Uint32Array(N); this._closed = new Uint32Array(N); this._stamp = 0; }
    const g = this._g, from = this._from, seen = this._seen, closed = this._closed;
    const st = ++this._stamp;
    const nodes = this.nodes, goal = nodes[b], blk = this.blocked;
    const h = (n) => Math.hypot(n.x - goal.x, n.z - goal.z) + Math.abs(n.y - goal.y) * 0.5;
    const heap = new Heap();
    const skipClimb = noClimb === true, CO = noClimb && typeof noClimb === 'object' ? noClimb : null;
    const climbX = typeof noClimb === 'number' ? noClimb : (CO && CO.add) || 0, outX = CO && CO.out !== undefined ? CO.out : Infinity;
    const minRise = (CO && CO.minRise) || 0, maxRise = (CO && CO.maxRise) || Infinity, bad = (CO && CO.bad) || null;
    g[a] = 0; from[a] = -1; seen[a] = st;
    heap.push(a, h(nodes[a]));
    let it = 0;
    while (heap.size && it++ < maxIter) {
      const cur = heap.pop();
      if (cur === b) break;
      if (closed[cur] === st) continue;
      closed[cur] = st;
      const n = nodes[cur];
      for (const e of n.nb) {
        let cx = 0;
        if (e.type === 'climb') {
          if (skipClimb) continue;
          cx = climbX;
          if (e.rise < minRise || e.rise > maxRise || e === bad) { if (outX === Infinity) continue; cx += outX; }
        }
        if (avoid && avoid[e.to]) continue;
        const m = nodes[e.to];
        if (m.zone >= 0 && m.zone !== team) continue;
        const ng = g[cur] + e.cost + cx + (m.wet === 2 ? 2.0 : m.wet === 1 ? 0.5 : 0) + (blk && blk[e.to] ? 40 : 0) + (cost ? cost[e.to] : 0);
        if (seen[e.to] !== st || ng < g[e.to]) {
          seen[e.to] = st; g[e.to] = ng; from[e.to] = cur;
          heap.push(e.to, ng + h(m));
        }
      }
    }
    if (seen[b] !== st) return null;
    const out = [];
    for (let k = b; k !== -1; k = from[k]) { out.push(k); if (out.length > 4000) break; }
    return out.reverse();
  }

  edgeType(a, b) {
    for (const e of this.nodes[a].nb) if (e.to === b) return e.type;
    return 'walk';
  }
  edge(a, b) {
    for (const e of this.nodes[a].nb) if (e.to === b) return e;
    return null;
  }

  // Climb edges: an inkable wall right in front of a node, whose block top holds a node 1.3–5.5 m higher. Bots
  // ink the wall up to the top and swim up it (the same squid wall-climb players use). They make pits escapable
  // without a ramp and raised perches reachable for long-range weapons.
  _climbBarred(wx, wz, m, topY, wallBlock) {
    const L = this.level, ids = [];
    for (const h of [0.3, 0.7, 1.1]) {
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const x = wx + (m.x - wx) * t, z = wz + (m.z - wz) * t;
        _cb.set(x, topY + h, z);
        ids.length = 0;
        for (const id of L.queryBlocks(x - 0.01, z - 0.01, x + 0.01, z + 0.01, ids)) {
          const b = L.blocks[id];
          if (id === wallBlock || b.dynamic || (b.grate && !b.rail)) continue;   // (railings carry the grate flag too: they count)
          if ((b.rail || b.solid) && L.pointInBlock(b, _cb, 0.02)) return true;
        }
      }
    }
    return false;
  }

  _climbEdges() {
    const L = this.level, P = this.physics, hit = new Hit(), o = new THREE.Vector3(), d = new THREE.Vector3();
    for (const n of this.nodes) {
      const seenTop = new Set();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        d.set(Math.cos(a), 0, Math.sin(a));
        o.set(n.x, n.y + 0.35, n.z);
        if (!P.raycast(o, d, 1.3, hit, true).hit) continue;
        if (Math.abs(hit.normal.y) > 0.3 || d.x * hit.normal.x + d.z * hit.normal.z > -0.7) continue; // wall, faced head-on
        const f = hit.face >= 0 ? L.faces[hit.face] : null;
        if (!f || !f.atlas) continue;                                                           // must take ink
        const b = L.blocks[f.block];
        if (b.grate || b.hidden) continue;
        const topY = b.center.y + b.axes[1].y * b.half.y;
        if (topY - n.y < 1.3 || topY - n.y > 5.5) continue;
        // node on top, just past the wall
        const qx = hit.point.x - hit.normal.x * 0.9, qz = hit.point.z - hit.normal.z * 0.9;
        const ix = Math.round((qx - this.x0) / this.step), iz = Math.round((qz - this.z0) / this.step);
        if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) continue;
        let top = -1;
        for (const id of this.cells[iz * this.nx + ix]) if (Math.abs(this.nodes[id].y - topY) < 0.25) top = id;
        if (top < 0 || seenTop.has(top)) continue;
        const m = this.nodes[top];
        // the way over the top must be open: a railing (or a solid prop / wall) along the edge between the wall and the
        // node above stops a climbing squid there — it hangs on the wall under it (the bots' "stuck on the wall" spots)
        if (this._climbBarred(hit.point.x, hit.point.z, m, topY, f.block)) continue;
        seenTop.add(top);
        const rise = m.y - n.y, C = CLIMB_COST;
        n.nb.push({ to: top, cost: Math.hypot(m.x - n.x, m.z - n.z) + C.base + rise * C.perM + Math.max(0, rise - C.tall) * C.tallPerM, type: 'climb', rise,
          wallP: [hit.point.x, hit.point.y, hit.point.z], wallN: [hit.normal.x, hit.normal.z], topY });
      }
    }
  }
}

const _cb = new THREE.Vector3();
class Heap {
  constructor() { this.ids = []; this.pr = []; }
  get size() { return this.ids.length; }
  push(id, p) {
    const ids = this.ids, pr = this.pr;
    let i = ids.length; ids.push(id); pr.push(p);
    while (i > 0) { const j = (i - 1) >> 1; if (pr[j] <= p) break; ids[i] = ids[j]; pr[i] = pr[j]; i = j; }
    ids[i] = id; pr[i] = p;
  }
  pop() {
    const ids = this.ids, pr = this.pr;
    const top = ids[0];
    const lid = ids.pop(), lp = pr.pop();
    if (ids.length) {
      let i = 0; const n = ids.length;
      while (true) {
        let l = i * 2 + 1, r = l + 1, m = i;
        let mp = lp;
        if (l < n && pr[l] < mp) { m = l; mp = pr[l]; }
        if (r < n && pr[r] < mp) { m = r; mp = pr[r]; }
        if (m === i) break;
        ids[i] = ids[m]; pr[i] = pr[m]; i = m;
      }
      ids[i] = lid; pr[i] = lp;
    }
    return top;
  }
}
