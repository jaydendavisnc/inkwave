// HULLBREAKER navigation: a 0.5 m grid over the stage with two clearance fields — distance to the nearest WALL (solid
// blocks and raised decks taller than it can stride over) and distance to the nearest DROP (sea, gaps, the edge of the
// stage, the spawn pads). A pose is valid when the full footprint (claws + legs) clears every wall and the body itself
// (shell + belly) is over floor: on a narrow pier its legs may splay out over the water, but it never wades in, never
// pushes a claw through a wall and never sets foot on a spawn pad. Paths are A* over cells with room to walk and turn,
// string-pulled into straight legs.
import * as THREE from 'three';

// footprints in model space (feet at y 0, facing +z)
export const WALL_BODY = [{ z: 2.3, r: 2.5 }, { z: -1.8, r: 2.6 }];                  // claws, legs, shell rim vs walls
export const FLOOR_BODY = [{ z: 2.2, r: 1.45 }, { z: 0, r: 1.5 }, { z: -2.3, r: 1.45 }];  // body over floor
const PLAN_WALL = 2.9;     // path cells: room to swing the claws round
const PLAN_FLOOR = 1.8;    // … and the body well over the floor
const STRIDE = 1.35;       // obstacles up to this high are stepped over (the legs clear them; the belly rides at 1.7 m)
const PAD_MARGIN = [3.5, 1.0];   // the body keeps this far outside a spawn barrier (the squad's pad: well clear)
const _p = new THREE.Vector3();

export class BossNav {
  constructor(level) {
    this.level = level;
    const B = level.bounds, st = (this.step = 0.5);
    this.x0 = B.minX + st / 2; this.z0 = B.minZ + st / 2;
    this.nx = Math.floor((B.maxX - B.minX) / st); this.nz = Math.floor((B.maxZ - B.minZ) / st);
    const N = this.nx * this.nz;
    this.floor = new Float32Array(N);
    this.kind = new Uint8Array(N);   // 0 floor · 1 wall (solid / raised) · 2 drop (sea, gap) · 3 spawn pad
    this.pads = level.spawnPads.map((p) => ({ x: p.x, z: p.z, r: level.spawnBarrier }));
    this.planR = PLAN_WALL;
    // stage pieces that come and go (a sprout pod's hedge, src/game/pods.js): fn(x, z, r) → true when one stands within
    // r of (x, z). A charge stops at one like a wall (cast); the static fields never see them
    this.dynWall = null;
    this._build();
  }

  _build() {
    const L = this.level, N = this.nx * this.nz, st = this.step;
    // main floor height: the most common ground level across the stage (0.25 m bins)
    const hist = new Map();
    for (let i = 0; i < N; i++) {
      const [x, z] = this.xz(i);
      const g = L.groundHeight(x, z, 30);
      if (g > -5) { const k = Math.round(g * 4); hist.set(k, (hist.get(k) || 0) + 1); }
    }
    let best = 0, bn = -1;
    for (const [k, n] of hist) if (n > bn) { bn = n; best = k / 4; }
    // a stage can name its boss floor (layout.boss.floorY) when its biggest level isn't the arena it wants — e.g.
    // Treehills, whose 1.3 m terraces out-cover the meadow the boss belongs on
    if (Number.isFinite(L.layout?.boss?.floorY)) best = L.layout.boss.floorY;
    this.floorY = best;
    for (let i = 0; i < N; i++) {
      const [x, z] = this.xz(i);
      // ground under the body: the main floor, or anything low enough to stride over (curbs, benches, planters, crates);
      // the body itself stays at floor height. Taller blocks and raised decks are walls to it.
      const g = L.groundHeight(x, z, best + STRIDE);
      let k = 0;
      if (!(g >= best - 0.55)) k = 2;
      else {
        this.floor[i] = g;
        for (const h of [STRIDE + 0.1, 2.6, 3.8, 5.2]) if (L.pointInside(_p.set(x, best + h, z), 0)) { k = 1; break; }
      }
      if (k !== 1) this.pads.forEach((pd, t) => { if (Math.hypot(x - pd.x, z - pd.z) < pd.r + PAD_MARGIN[t]) k = 3; });
      this.kind[i] = k;
      if (k) this.floor[i] = best;
    }
    this.Dw = this._field((k) => k === 1);
    this.Dv = this._field((k) => k >= 2, true);
    // plannable cells; keep one connected region: the boss's home ground — big, and toward the far end of the stage from
    // the squad's spawn (team 0), so it never wanders up to the squad's pad
    const nx = this.nx, nz = this.nz;
    const ok = new Uint8Array(N);
    for (let i = 0; i < N; i++) ok[i] = this.Dw[i] >= PLAN_WALL && this.Dv[i] >= PLAN_FLOOR ? 1 : 0;
    const comp = new Int32Array(N).fill(-1);
    let bestC = -1, bestScore = 0, c = 0;
    const pad = this.pads[0], span = Math.hypot(L.bounds.maxX - L.bounds.minX, L.bounds.maxZ - L.bounds.minZ);
    for (let i = 0; i < N; i++) {
      if (!ok[i] || comp[i] >= 0) continue;
      let size = 0, sx = 0, sz = 0; const stack = [i]; comp[i] = c;
      while (stack.length) {
        const k = stack.pop(); size++;
        const [kx0, kz0] = this.xz(k); sx += kx0; sz += kz0;
        const kx = k % nx, kz = (k / nx) | 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const jx = kx + dx, jz = kz + dz;
          if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
          const j = jz * nx + jx;
          if (ok[j] && comp[j] < 0) { comp[j] = c; stack.push(j); }
        }
      }
      const score = size * (0.4 + Math.hypot(sx / size - pad.x, sz / size - pad.z) / span);
      if (score > bestScore) { bestScore = score; bestC = c; }
      c++;
    }
    this.plan = new Uint8Array(N);
    this.planIds = [];
    for (let i = 0; i < N; i++) if (ok[i] && comp[i] === bestC) { this.plan[i] = 1; this.planIds.push(i); }
    this.area = this.planIds.length * st * st;
  }

  // distance from each cell centre to the nearest matching cell's edge (brute force within 7 m; off-grid counts when edge)
  _field(match, edge = false) {
    const R = 14, N = this.nx * this.nz, nx = this.nx, nz = this.nz, st = this.step, D = new Float32Array(N);
    if (!this._offs) {
      this._offs = [];
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) { const d = Math.hypot(dx, dz) * st; if (d <= R * st) this._offs.push([dx, dz, d]); }
      this._offs.sort((a, b) => a[2] - b[2]);
    }
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      if (match(this.kind[i])) { D[i] = 0; continue; }
      let d = R * st;
      for (const [dx, dz, dd] of this._offs) {
        const jx = ix + dx, jz = iz + dz;
        const out = jx < 0 || jz < 0 || jx >= nx || jz >= nz;
        if (out ? edge : match(this.kind[jz * nx + jx])) { d = Math.max(0, dd - st * 0.5); break; }
      }
      D[i] = d;
    }
    return D;
  }

  xz(i) { return [this.x0 + (i % this.nx) * this.step, this.z0 + ((i / this.nx) | 0) * this.step]; }
  cell(x, z) {
    const ix = Math.round((x - this.x0) / this.step), iz = Math.round((z - this.z0) / this.step);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return -1;
    return iz * this.nx + ix;
  }
  wallClear(x, z) { const i = this.cell(x, z); return i < 0 ? 0 : this.Dw[i]; }
  floorClear(x, z) { const i = this.cell(x, z); return i < 0 ? 0 : this.Dv[i]; }
  kindAt(x, z) { const i = this.cell(x, z); return i < 0 ? 2 : this.kind[i]; }
  floorAt(x, z) { const i = this.cell(x, z); const f = i < 0 || this.kind[i] ? this.floorY : this.floor[i]; return f - this.floorY < 0.45 ? f : this.floorY; }
  inPad(x, z, margin = 0) { for (const p of this.pads) if (Math.hypot(x - p.x, z - p.z) < p.r + margin) return true; return false; }
  isPlan(x, z) { const i = this.cell(x, z); return i >= 0 && !!this.plan[i]; }

  // the whole footprint fits: claws/legs clear of walls, body over floor
  poseOk(x, z, yaw) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    for (const b of WALL_BODY) if (this.wallClear(x + s * b.z, z + c * b.z) < b.r) return false;
    for (const b of FLOOR_BODY) if (this.floorClear(x + s * b.z, z + c * b.z) < b.r) return false;
    return true;
  }
  // turning on the spot: the claws must clear the walls at the new heading and the belly stays over floor (the ends
  // may swing out over the water for a moment — a crab turning on a pier)
  turnOk(x, z, yaw) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    for (const b of WALL_BODY) if (this.wallClear(x + s * b.z, z + c * b.z) < b.r) return false;
    return this.floorClear(x, z) >= FLOOR_BODY[1].r;
  }

  // how far the body can travel straight along yaw before the pose stops fitting; wall = a solid is what stops it
  cast(x, z, yaw, maxDist, stepLen = 0.25) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    let d = 0;
    const dyn = this.dynWall, f0 = WALL_BODY[0];
    const dynOk = (dd) => !dyn || !dyn(x + s * (dd + f0.z), z + c * (dd + f0.z), f0.r);
    while (d + stepLen <= maxDist && this.poseOk(x + s * (d + stepLen), z + c * (d + stepLen), yaw) && dynOk(d + stepLen)) d += stepLen;
    let wall = false;
    if (d + stepLen <= maxDist) {
      // what's just ahead of the claws: a wall bonks; an edge or the pad makes it dig in and skid
      const f = WALL_BODY[0], fx = x + s * (d + f.z), fz = z + c * (d + f.z);
      if (dyn && dyn(fx, fz, f.r + 0.6)) wall = true;
      for (let k = 0; k <= 8 && !wall; k++) {
        const a = -0.9 + (k / 8) * 1.8;
        const px = fx + Math.sin(yaw + a) * (f.r + 0.6), pz = fz + Math.cos(yaw + a) * (f.r + 0.6);
        if (this.kindAt(px, pz) === 1) wall = true;
      }
    }
    return { dist: d, wall };
  }

  _cellOk(i, slack = 0) { return i >= 0 && this.Dw[i] >= PLAN_WALL - slack && this.Dv[i] >= PLAN_FLOOR - slack; }
  // straight walk between two points stays on plannable ground
  lineOk(x0, z0, x1, z1, slack = 0.3) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / (this.step * 0.8)));
    for (let k = 0; k <= n; k++) { const t = k / n; if (!this._cellOk(this.cell(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t), slack)) return false; }
    return true;
  }

  // the plannable cell nearest to (x, z)
  nearestPlan(x, z) {
    const ix = Math.round((x - this.x0) / this.step), iz = Math.round((z - this.z0) / this.step);
    for (let r = 0; r < 60; r++) {
      let best = -1, bd = Infinity;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= this.nx || jz >= this.nz) continue;
        const j = jz * this.nx + jx;
        if (!this.plan[j]) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) return best;
    }
    return this.planIds[0] ?? -1;
  }

  // A* over plannable cells (prefers open floor), string-pulled into a few straight legs. Returns [[x, z], …] or null.
  path(x0, z0, x1, z1) {
    const a = this.nearestPlan(x0, z0), b = this.nearestPlan(x1, z1);
    if (a < 0 || b < 0) return null;
    const N = this.nx * this.nz, nx = this.nx;
    if (!this._g) { this._g = new Float32Array(N); this._from = new Int32Array(N); this._seen = new Uint32Array(N); this._closed = new Uint32Array(N); this._stamp = 0; }
    const g = this._g, from = this._from, seen = this._seen, closed = this._closed, st = ++this._stamp;
    const [bx, bz] = this.xz(b);
    const h = (i) => { const [x, z] = this.xz(i); return Math.hypot(x - bx, z - bz); };
    const heap = new MinHeap();
    g[a] = 0; from[a] = -1; seen[a] = st; heap.push(a, h(a));
    let it = 0;
    while (heap.size && it++ < 40000) {
      const cur = heap.pop();
      if (cur === b) break;
      if (closed[cur] === st) continue;
      closed[cur] = st;
      const cx = cur % nx, cz = (cur / nx) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const jx = cx + dx, jz = cz + dz;
        if (jx < 0 || jz < 0 || jx >= nx || jz >= this.nz) continue;
        const j = jz * nx + jx;
        if (!this.plan[j]) continue;
        const ng = g[cur] + Math.hypot(dx, dz) * this.step * (1 + Math.max(0, 5 - this.Dw[j]) * 0.1 + Math.max(0, 3 - this.Dv[j]) * 0.15);
        if (seen[j] !== st || ng < g[j]) { seen[j] = st; g[j] = ng; from[j] = cur; heap.push(j, ng + h(j)); }
      }
    }
    if (seen[b] !== st) return null;
    const cells = [];
    for (let k = b; k !== -1; k = from[k]) { cells.push(k); if (cells.length > 8000) break; }
    cells.reverse();
    const out = [this.xz(cells[0])];
    let i = 0;
    while (i < cells.length - 1) {
      let j = cells.length - 1;
      const [ax, az] = this.xz(cells[i]);
      while (j > i + 1) { const [qx, qz] = this.xz(cells[j]); if (this.lineOk(ax, az, qx, qz)) break; j--; }
      out.push(this.xz(cells[j]));
      i = j;
    }
    return out;
  }

  // a plannable point: rnd() → [0,1)
  randomPoint(rnd) { const i = this.planIds[(rnd() * this.planIds.length) | 0]; return i === undefined ? [0, 0] : this.xz(i); }
}

class MinHeap {
  constructor() { this.ids = []; this.pr = []; }
  get size() { return this.ids.length; }
  push(id, p) {
    const ids = this.ids, pr = this.pr;
    let i = ids.length; ids.push(id); pr.push(p);
    while (i > 0) { const j = (i - 1) >> 1; if (pr[j] <= p) break; ids[i] = ids[j]; pr[i] = pr[j]; i = j; }
    ids[i] = id; pr[i] = p;
  }
  pop() {
    const ids = this.ids, pr = this.pr, top = ids[0], lid = ids.pop(), lp = pr.pop();
    if (ids.length) {
      let i = 0; const n = ids.length;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i, mp = lp;
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
