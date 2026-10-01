// Tower Command: the rules engine (no UI). A match with opts.mode === 'tower' owns one of these (match.tower); its
// look (tower mesh, light pillar, path glow, checkpoint beacons) is src/fx/towerFx.js.
//
// A tower stands at the centre of a mirrored path that runs through the stage to a goal on each side (the path comes
// from the stage layout, see TOWER_FORMAT; its far end on Bravo's side is Alpha's goal). Position is one number, `s`:
// metres along the path from the centre, positive toward Alpha's goal (Bravo's half), negative toward Bravo's.
//
//   • riding: a player standing on the platform rides it. Riders of one team only → that team controls the tower and
//     it moves toward that team's goal, faster with more riders (TOWER.mult: 1 / 1.2 / 1.33 / 1.43 ×). Its speed on a
//     stage comes from the points (below): the whole track is TOWER.trackPoints at TOWER.pointRate. Riders of both
//     teams → it stops (contested). An enemy on a tower whose riders fell off / were splatted → the enemy claims it.
//   • empty: 5 s with nobody on it and the team in control loses it (neutral); a neutral tower rolls back toward the
//     centre (TOWER.returnK × its one-rider speed).
//   • rolling home: a team in control of the tower on its own half (the other team had pushed it there) can get off it —
//     it rolls on toward the centre at the one-rider speed, still theirs, and stops there. The 5 s rule still runs
//     (then it's neutral and does what neutral does); anyone boarding it claims / contests it as usual. It scores
//     nothing and never touches a checkpoint.
//   • checkpoints: each side has checkpoints (TOWER.checkpoints). Pushing into enemy territory the tower stops at the
//     next uncleared one until its timer runs out (cleared faster by more riders); cleared ones don't stop it again.
//     If the tower leaves it half-cleared (the team loses control, or it's pushed / rolls off it), the team has
//     TOWER.checkpointGrace s to bring it back under its control; then it carries on where it was. Otherwise its timer
//     refills: the seconds already cleared stay scored (a team's score never drops), but they have to be cleared again
//     as dummy seconds that earn nothing (c.dummy: the share of the timer that is).
//   • score: 100 points to win. Riding the tower the whole track into enemy territory is TOWER.trackPoints (60) of them,
//     in proportion to the distance; clearing that side's checkpoints the rest (TOWER.checkpointPoints, 40, split evenly,
//     earned as each one's timer runs). A stage with two checkpoints splits them 80 / 20 (TOWER.twoCheckpoints). A team's score is the most it has ever had, shown as a count from 100 down to 0;
//     reaching the goal is a knockout. At time up the lower count wins; equal counts → the team that
//     reached that count second drops a point (no draws). Nobody pushed at all → sudden death.
//   • overtime: at time up, if the team behind controls the tower, play on until it takes the lead (it wins), the other
//     team retakes the tower (one of theirs on it with none of the team behind), or the tower goes neutral (the team
//     ahead wins), or TOWER.overtimeMax.
//   • special gauges: the team in control fills at TOWER.gaugeHeld p/s (riding or not); while neutral, the team behind
//     fills at TOWER.gaugeNeutral. Each client fills its own players (online a remote player's meter is its owner's).
//
// Online the host runs the rules and records every decision (control, checkpoints, overtime, the end) plus a snapshot
// (TOWER.snapHz) on its event timeline; everyone else follows (netEvent), easing the tower onto the host's position.
// Each client carries its own players standing on the platform as it moves.
//
// Events:
//   tower:control { owner, prev }            owner -1 = neutral
//   tower:contest { on }                     riders of both teams on it (it stopped) / not any more
//   tower:checkpoint { team, index, state }  state 'reach' | 'clear' | 'refill'
//   tower:return {}                          a neutral tower started rolling back
//   tower:home { team }                      an empty tower started rolling home for the team holding it
//   tower:overtime { losing }  ·  tower:end { winner, reason, counts }
//
// TOWER_FORMAT (layout.tower, src/world/tower-data.js): { path: [[x, z] | [x, y, z], …] centre → Alpha's goal (the
//   corners of straight runs; a given y forces that height there), checkpoints?: [[x, z] | m | fraction, …],
//   checkpointTime?: [s, …], yaw?: the platform's heading (default: the runs' own grid) }
import * as THREE from 'three';
import { G, emit, clamp } from '../core/ctx.js';
import { TOWER, PLAYER } from '../config.js';
import { TowerPaint } from './towerPaint.js';

const V3 = THREE.Vector3;
const r3 = (x) => Math.round(x * 1000) / 1000;
const _v = new V3(), _d = new V3(), _p0 = new V3();

// ---------------------------------------------------------------------------------------------- the path
// The track is straight lines only: flat runs along the floor, straight inclines over ramps / stairs, and straight up
// (or down) wherever it meets a wall, a box or a drop — the platform rises flush against a wall it meets and goes past
// a drop's edge before it comes down (it never cuts through anything). The platform keeps one heading all match
// (a square that never swings at a corner): the stage's grid, from the path's own directions.
const PSTEP = 0.1;                      // floor sampling along a run (m)
// headroom the tower needs over its base (the platform, its pillar + cap, a margin; riders' heads are lower): lower → climbed
export const TOWER_HEAD = TOWER.platformH + TOWER.pillarH + TOWER.pillarCap + 0.08;
const HEAD = TOWER_HEAD;
const JUMP = 0.45;                      // a height change within one sample bigger than this is a wall / drop
const _ids = [], _hits = [];

// One side: points from the centre outward, cumulative (3D) lengths
class Side {
  constructor(pts) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.len = this.cum[this.cum.length - 1];
  }
  // index of the segment holding distance d (binary search)
  _seg(d) {
    const c = this.cum;
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= d) lo = m; else hi = m; }
    return lo;
  }
  at(d, out) {
    d = clamp(d, 0, this.len);
    const i = this._seg(d), a = this.pts[i], b = this.pts[Math.min(i + 1, this.pts.length - 1)];
    const L = this.cum[i + 1] - this.cum[i] || 1;
    return out.copy(a).lerp(b, (d - this.cum[i]) / L);
  }
  // unit XZ direction of increasing d (on a climb / drop: the run it leads to, else the one it came from)
  dir(d, out) {
    d = clamp(d, 0, this.len);
    const n = this.pts.length, i0 = Math.min(this._seg(d), n - 2);
    for (const i of [i0, i0 + 1, i0 + 2, i0 - 1, i0 - 2]) {
      if (i < 0 || i > n - 2) continue;
      const a = this.pts[i], b = this.pts[i + 1];
      out.set(b.x - a.x, 0, b.z - a.z);
      const l = Math.hypot(out.x, out.z);
      if (l > 1e-4) return out.multiplyScalar(1 / l);
    }
    return out.set(0, 0, 1);
  }
  // unit direction of travel (outward) including its climb: +y up a wall, -y down a drop
  dir3(d, out) {
    d = clamp(d, 0, this.len);
    const i = Math.min(this._seg(d), this.pts.length - 2);
    return out.subVectors(this.pts[i + 1], this.pts[i]).normalize();
  }
}

// solid spans [lo, hi, …] of the level along the vertical line through (x, z) (the tower's own block excluded)
function column(L, x, z, out) {
  out.length = 0;
  for (const id of L.queryBlocks(x - 0.01, z - 0.01, x + 0.01, z + 0.01, _ids)) {
    const b = L.blocks[id];
    if (!b || !b.solid || b.dynamic) continue;
    let lo = -Infinity, hi = Infinity, ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      const a = b.axes[k], h = k === 0 ? b.half.x : k === 1 ? b.half.y : b.half.z;
      const c = a.x * (x - b.center.x) + a.z * (z - b.center.z) - a.y * b.center.y;   // a·(p − centre) = c + a.y·y
      if (Math.abs(a.y) < 1e-6) { if (Math.abs(c) > h) ok = false; continue; }
      let t0 = (-h - c) / a.y, t1 = (h - c) / a.y;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
      if (t0 > lo) lo = t0;
      if (t1 < hi) hi = t1;
    }
    if (ok && hi > lo) out.push(lo, hi);
  }
  return out;
}
// the underside of the lowest solid over (x, z) above height y (Infinity: open sky) — e.g. an arcade the tower starts in
export function ceilingAt(x, z, y) {
  const h = column(G.level, x, z, _hits);
  let c = Infinity;
  for (let k = 0; k < h.length; k += 2) if (h[k] > y && h[k] < c) c = h[k];
  return c;
}
// the platform's footprint (a square of half-size R turned by yaw), sampled 5 × 5
function footprint(x, z, yaw, R, fn) {
  const c = Math.cos(yaw), s = Math.sin(yaw), r = R - 0.04;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const lx = (i / 2) * r, lz = (j / 2) * r;
    fn(x + lx * c + lz * s, z - lx * s + lz * c);
  }
}
// where the tower's base sits at (x, z) coming from height y: on the highest floor under any part of the platform (so
// it stays up until it's fully past an edge), then up onto anything that leaves it less than HEAD of room (so it
// climbs a wall it meets instead of going through; a roof HEAD or more above stays overhead). NaN: no floor at all.
function baseAt(x, z, y, yaw, R) {
  const L = G.level;
  let rest = -Infinity;
  footprint(x, z, yaw, R, (px, pz) => {
    const h = column(L, px, pz, _hits);
    for (let k = 0; k < h.length; k += 2) if (h[k + 1] <= y + 0.5 && h[k + 1] > rest) rest = h[k + 1];
  });
  if (rest === -Infinity) return NaN;
  for (let it = 0; it < 16; it++) {
    let up = rest;
    footprint(x, z, yaw, R, (px, pz) => {
      const h = column(L, px, pz, _hits);
      for (let k = 0; k < h.length; k += 2) if (h[k] < rest + HEAD && h[k + 1] > rest + 0.02 && h[k + 1] > up) up = h[k + 1];
    });
    if (up === rest) break;
    rest = up;
  }
  return rest;
}
// Douglas–Peucker on (t, y) samples (a run between walls → its straight flats and inclines)
function straighten(ts, ys, i0, i1, eps, keep) {
  let worst = -1, wd = eps;
  const t0 = ts[i0], y0 = ys[i0], dt = ts[i1] - t0, dy = ys[i1] - y0, L = Math.hypot(dt, dy) || 1;
  for (let i = i0 + 1; i < i1; i++) {
    const d = Math.abs((ts[i] - t0) * dy - (ys[i] - y0) * dt) / L;
    if (d > wd) { wd = d; worst = i; }
  }
  if (worst < 0) return;
  straighten(ts, ys, i0, worst, eps, keep); keep.add(worst); straighten(ts, ys, worst, i1, eps, keep);
}
// one side's drawn corners (XZ; y optional = a forced height there) → its 3D track
function buildSide(raw, yaw, R, y0, holes) {
  const out = [new V3(raw[0].x, y0, raw[0].z)];
  let y = y0;
  const push = (x, yy, z) => { const l = out[out.length - 1]; if (Math.abs(l.x - x) + Math.abs(l.y - yy) + Math.abs(l.z - z) > 1e-4) out.push(new V3(x, yy, z)); };
  for (let i = 0; i < raw.length - 1; i++) {
    const a = raw[i], b = raw[i + 1], ux = b.x - a.x, uz = b.z - a.z, L = Math.hypot(ux, uz);
    if (L < 1e-4) continue;
    const n = Math.max(1, Math.ceil(L / PSTEP));
    const ts = [0], ys = [y];
    for (let k = 1; k <= n; k++) {
      const t = (L * k) / n, yy = baseAt(a.x + (ux * t) / L, a.z + (uz * t) / L, ys[k - 1], yaw, R);
      if (!Number.isFinite(yy)) { holes.push([+(a.x + (ux * t) / L).toFixed(2), +(a.z + (uz * t) / L).toFixed(2)]); ys.push(ys[k - 1]); } else ys.push(yy);
      ts.push(t);
    }
    // walls / drops: a vertical at the exact spot (bisected) — before the wall for a climb, past the edge for a drop
    const P = (t) => [a.x + (ux * t) / L, a.z + (uz * t) / L];
    let from = 0;
    const emit = (i0, i1) => {   // the straight flats / inclines between two walls
      const keep = new Set([i0, i1]);
      straighten(ts, ys, i0, i1, 0.2, keep);
      for (const k of [...keep].sort((p, q) => p - q)) { const [x, z] = P(ts[k]); push(x, ys[k], z); }
    };
    for (let k = 1; k <= n; k++) {
      if (Math.abs(ys[k] - ys[k - 1]) <= JUMP) continue;
      let lo = ts[k - 1], hi = ts[k];
      for (let it = 0; it < 7; it++) {
        const m = (lo + hi) / 2, [x, z] = P(m), yy = baseAt(x, z, ys[k - 1], yaw, R);
        if (Number.isFinite(yy) && Math.abs(yy - ys[k - 1]) <= JUMP) lo = m; else hi = m;
      }
      emit(from, k - 1);
      const tw = ys[k] > ys[k - 1] ? lo : hi, [x, z] = P(tw);   // a climb stops short of the wall, a drop goes past the edge
      push(x, ys[k - 1], z); push(x, ys[k], z);
      ts[k - 1] = tw; from = k - 1; ys[k - 1] = ys[k];
    }
    emit(from, n);
    y = ys[n];
    if (Number.isFinite(b.y) && Math.abs(b.y - y) > 1e-3) { push(b.x, y, b.z); push(b.x, b.y, b.z); y = b.y; }
  }
  return out;
}
// the platform's heading: the drawn runs' own grid — the direction (mod 90°) covering the most track, averaged over the
// runs within 3° of it (a diagonal run or two doesn't skew a square layout)
function gridYaw(raw) {
  const runs = [];
  for (let i = 0; i < raw.length - 1; i++) {
    const dx = raw[i + 1].x - raw[i].x, dz = raw[i + 1].z - raw[i].z, L = Math.hypot(dx, dz);
    if (L > 1e-3) runs.push({ L, a: ((Math.atan2(dx, dz) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2) });
  }
  const near = (a, b) => { const d = Math.abs(a - b) % (Math.PI / 2); return Math.min(d, Math.PI / 2 - d) < (3 * Math.PI) / 180; };
  let best = null, bl = -1;
  for (const r of runs) { const l = runs.reduce((s2, q) => s2 + (near(q.a, r.a) ? q.L : 0), 0); if (l > bl) { bl = l; best = r; } }
  if (!best) return 0;
  let sx = 0, sy = 0;
  for (const q of runs) if (near(q.a, best.a)) { sx += q.L * Math.cos(4 * q.a); sy += q.L * Math.sin(4 * q.a); }
  const y = Math.atan2(sy, sx) / 4;
  return Math.abs(y) < 1e-6 ? 0 : y;
}

// A stage without a drawn path: the walkable route from the centre toward Bravo's base (its goal a few metres outside
// the spawn barrier), straightened a little. Bravo's side is the mirror, as always.
export function placeholderPath(level) {
  const nav = G.nav, pad = level.spawnPads[1], R = (level.spawnBarrier || 4.2) + 4;
  if (nav && nav.validIds && nav.validIds.length) {
    let c = -1, cd = Infinity, g = -1, gd = Infinity;
    for (const id of nav.validIds) {
      const n = nav.nodes[id];
      if (n.zone >= 0) continue;
      const dc = Math.hypot(n.x, n.z) + Math.max(0, n.y - 3) * 2;   // (the floor, not a crane top over the centre)
      if (dc < cd) { cd = dc; c = id; }
      const dp = Math.hypot(n.x - pad.x, n.z - pad.z);
      if (dp >= R && n.wet !== 2) { const v = dp - R + Math.abs(n.y - pad.y) * 0.5; if (v < gd) { gd = v; g = id; } }
    }
    const ids = c >= 0 && g >= 0 ? nav.path(c, g, 0, 30000, true) || nav.path(c, g, 0, 30000, false) : null;   // (a climb if it must)
    if (ids && ids.length > 4) {
      // keep turning points only (straight runs collapse), then the exact centre in front
      const pts = ids.map((id) => nav.nodes[id]);
      const keep = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = keep[keep.length - 1], b = pts[i + 1], p = pts[i];
        const abx = b.x - a.x, abz = b.z - a.z, L = Math.hypot(abx, abz) || 1;
        const off = Math.abs((p.x - a.x) * abz - (p.z - a.z) * abx) / L;
        if (off > 0.9 || Math.abs(p.y - a.y) > 0.6) keep.push(p);
      }
      keep.push(pts[pts.length - 1]);
      const path = keep.map((n) => [+n.x.toFixed(2), +n.y.toFixed(2), +n.z.toFixed(2)]);
      // start at the exact centre (a nav node right by it would leave a stub going the wrong way first)
      if (Math.hypot(path[0][0], path[0][2]) < 1.5) path[0] = [0, path[0][1], 0]; else path.unshift([0, path[0][1], 0]);
      return { placeholder: true, path };
    }
  }
  const y = level.groundHeight(0, 0, 4);
  return { placeholder: true, path: [[0, y === -Infinity ? 0 : y, 0], [pad.x * 0.8, pad.y, pad.z * 0.8]] };
}

export class TowerPath {
  constructor(def) {
    const raw = def.path.map((p) => (p.length === 3 ? new V3(p[0], p[1], p[2]) : new V3(p[0], NaN, p[1])));
    const R = TOWER.platformR;
    this.yaw = Number.isFinite(def.yaw) ? def.yaw : gridYaw(raw);
    // the start: a given height, else the floor under the centre (below the spawn decks' height: never a roof over it)
    const pad = G.level.spawnPads[0], hint = Number.isFinite(raw[0].y) ? raw[0].y : (pad ? pad.y + 1 : 4);
    let y0 = Number.isFinite(raw[0].y) ? raw[0].y : baseAt(raw[0].x, raw[0].z, hint, this.yaw, R);
    if (!Number.isFinite(y0)) y0 = 0;
    this.holes = [];                   // (x, z) where a run found no floor at all (a stage to fix)
    const a = buildSide(raw, this.yaw, R, y0, this.holes);
    // the mirror (180° about the vertical through the origin), built on its own floors (dressing may differ)
    const b = buildSide(raw.map((p) => new V3(-p.x, p.y, -p.z)), this.yaw, R, y0, this.holes);
    this.sides = [new Side(a), new Side(b)];   // [toward Alpha's goal (s > 0), toward Bravo's goal (s < 0)]
    this.len = [this.sides[0].len, this.sides[1].len];
  }
  // world point at s (m from the centre; + toward Alpha's goal)
  at(s, out = new V3()) { return s >= 0 ? this.sides[0].at(s, out) : this.sides[1].at(-s, out); }
  // unit XZ direction of increasing s
  dir(s, out = new V3()) { return s >= 0 ? this.sides[0].dir(s, out) : this.sides[1].dir(-s, out).negate(); }
  // distance along side `team` of the point nearest (x, z) (a checkpoint drawn on the stage)
  project(team, x, z) {
    const S = this.sides[team];
    let best = Infinity, bd = 0;
    for (let i = 0; i < S.pts.length - 1; i++) {
      const a = S.pts[i], b = S.pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
      if (l2 < 1e-8) continue;
      const u = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1), px = a.x + dx * u, pz = a.z + dz * u;
      const d = Math.hypot(x - px, z - pz);
      if (d < best - 1e-6) { best = d; bd = S.cum[i] + u * (S.cum[i + 1] - S.cum[i]); }
    }
    return bd;
  }
  // evenly spaced points from Bravo's goal (s = -len1) to Alpha's (s = +len0), for the minimap
  line(step = 0.75) {
    const out = [];
    for (let s = -this.len[1]; s < this.len[0]; s += step) out.push({ s, p: this.at(s) });
    out.push({ s: this.len[0], p: this.at(this.len[0]) });
    return out;
  }
  // the rail drawn on the stage: the track, but up a wall's face / down a drop's face instead of through the air in
  // front of it (the platform climbs flush against the wall, its centre half a platform out). [{ s, p, n }] from
  // Bravo's goal to Alpha's, n = the surface the rail lies on (up on floors; facing back along the track on a wall)
  rail() {
    const out = [], R = TOWER.platformR;
    const half = (S, sign) => {
      const pts = [];
      for (let i = 0; i < S.pts.length; i++) pts.push({ s: sign * S.cum[i], p: S.pts[i].clone(), n: new V3(0, 1, 0) });
      // each climb / drop: shift its vertical to the face, extend the floor before / after it up to that face
      const segDir = (j) => {
        const p = S.pts[j], q = S.pts[j + 1];
        if (!p || !q) return null;
        const d = new V3(q.x - p.x, 0, q.z - p.z), l = Math.hypot(d.x, d.z);
        return l > 1e-4 ? d.multiplyScalar(1 / l) : null;
      };
      const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
      for (let i = 0; i < S.pts.length - 1; i++) {
        const a = S.pts[i], b = S.pts[i + 1];
        if (Math.hypot(b.x - a.x, b.z - a.z) > 1e-4 || Math.abs(b.y - a.y) < 1e-4) continue;
        const up = b.y > a.y, d = (up ? segDir(i + 1) || segDir(i - 1) : segDir(i - 1) || segDir(i + 1)) || new V3(0, 0, 1);
        // centre → the platform's edge along d (a square turned by yaw)
        const lx = d.x * c - d.z * sn, lz = d.x * sn + d.z * c, reach = R / Math.max(Math.abs(lx), Math.abs(lz), 1e-3);
        const off = d.clone().multiplyScalar(up ? reach : -reach);
        pts[i].p.add(off); pts[i + 1].p.add(off);
        pts[i].n = pts[i + 1].n = d.clone().multiplyScalar(up ? -1 : 1);   // the face looks back down the climb / out over the drop
        pts[i].wall = pts[i + 1].wall = true;
      }
      return pts;
    };
    const A = half(this.sides[0], 1), B = half(this.sides[1], -1);
    for (let i = B.length - 1; i > 0; i--) out.push(B[i]);
    for (const p of A) out.push(p);
    return out;
  }
}

// ---------------------------------------------------------------------------------------------- the rules
export class TowerCommand {
  constructor(match) {
    this.match = match;
    const def = (G.level.layout && G.level.layout.tower) || placeholderPath(G.level);
    this.placeholder = !!def.placeholder;
    this.def = def;
    this.path = new TowerPath(def);
    this.s = 0;                          // position along the path (m; + toward Alpha's goal)
    this.pos = this.path.at(0);          // the tower's base (on the path's floor)
    this.yaw = this.path.yaw;           // fixed: the platform never turns (the track's corners are square)
    this.owner = -1;                     // team in control (-1 neutral)
    this.riders = [0, 0];
    this.riderList = [];
    this.contested = false;
    this.emptyT = 0;                     // s with nobody on it
    this.moving = 0;                     // this frame: -1 / 0 / 1 (toward Bravo's goal / stopped / toward Alpha's)
    this.returning = false;              // a neutral tower rolling back
    this.homing = false;                 // an empty tower rolling home (to the centre) for the team holding it
    this.best = [0, 0];                  // furthest each team has ridden it (m into enemy territory)
    this.count = [TOWER.count, TOWER.count];
    this.reachT = [0, 0];                // match clock when each team's count last went down (the tie-break)
    this.clock = 0;
    // checkpoints: Alpha's on the + side, Bravo's (the mirror) on the − side
    const cps = def.checkpoints || TOWER.checkpoints;
    // speed + checkpoint times from the points: the track = trackPoints, the checkpoints = checkpointPoints (even split;
    // a stage with two checkpoints splits the 100 as TOWER.twoCheckpoints)
    const pts = cps.length === 2 ? TOWER.twoCheckpoints : TOWER;
    this.trackPoints = pts.trackPoints;
    const cpPts = cps.length ? pts.checkpointPoints / cps.length : 0;
    this.cpPoints = cpPts;
    this.speed = this.path.len.map((L) => L / (this.trackPoints / TOWER.pointRate));
    this.cps = [];
    for (let team = 0; team < 2; team++) cps.forEach((c, i) => {
      // a checkpoint: a spot on the stage [x, z] (Alpha's side; Bravo's is its mirror), metres along, or a fraction
      const L = this.path.len[team];
      const d = Array.isArray(c) ? Math.min(this.path.project(team, team ? -c[0] : c[0], team ? -c[1] : c[1]), L - 1) : c <= 1 ? c * L : Math.min(c, L - 1);
      const dur = def.checkpointTime ? def.checkpointTime[Math.min(i, def.checkpointTime.length - 1)] : cpPts / TOWER.pointRate;
      // best: the most of its timer ever cleared; dummy: the share of a refilled timer already scored (re-cleared for nothing)
      this.cps.push({ team, index: i, d, dur, left: dur, cleared: false, lost: 0, at: false, best: 0, dummy: 0, pos: this.path.at(team === 0 ? d : -d) });
    });
    this.points = [0, 0];                // each team's best points so far (of 100)
    this.overtime = false; this.overtimeT = 0; this.otLosing = -1;
    this.winner = null; this.reason = null;
    this.log = [];
    this.snapT = 0;
    this.net = null;                     // follower: the host's latest snapshot { s, t }
    // the collider: a square platform, turned along the path (the mesh is round and a touch smaller)
    this.half = new V3(TOWER.platformR, TOWER.platformH / 2, TOWER.platformR);
    this.block = G.level.addDynamic({ tag: 'tower' });
    // the thin pillar in its middle: cover for the riders (never inked; a top you slide off)
    this.pillarHalf = new V3(TOWER.pillarW / 2, TOWER.pillarH / 2, TOWER.pillarW / 2);
    this.pillar = G.level.addDynamic({ tag: 'tower-pillar', roof: true });
    this.paint = new TowerPaint(this);   // ink on its walls and deck (swim up the walls, swim on the deck)
    this.block.inkPaint = this.paint;    // (Actor._surface / _wallInk read a dynamic block's own ink through this)
    this._place(1);
  }

  get follower() { return !!this.match.follower; }
  _net(e) { if (!this.follower) G.netm?.recTower?.(e); }
  dispose() { G.level?.clearDynamic?.(); this.paint?.dispose(); }

  get top() { return this.pos.y + TOWER.platformH; }
  // the team currently behind (higher count after the tie-break), or -1 when nobody has pushed at all (sudden death)
  losing() {
    const [a, b] = this.count;
    if (a === b) {
      if (a >= TOWER.count) return -1;
      return this.reachT[0] <= this.reachT[1] ? 1 : 0;   // the one that got there second drops a point
    }
    return a > b ? 0 : 1;
  }
  // the counts as scored (the tie-break's point applied)
  scores() {
    const c = [...this.count], L = this.losing();
    if (c[0] === c[1] && L >= 0) c[L] = Math.min(TOWER.count, c[L] + 1);
    return c;
  }

  // ---- riders: players on the platform (feet over it, from just below its top to a hop above)
  _scanRiders() {
    const n = [0, 0], list = this.riderList;
    list.length = 0;
    const R = TOWER.platformR - 0.05, top = this.top;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    for (const a of this.match.actors) {
      if (!a.alive || a.superJumpState || a.team > 1) continue;
      const dy = a.pos.y - top;
      if (dy < -0.3 || dy > TOWER.riderUp) continue;
      const dx = a.pos.x - this.pos.x, dz = a.pos.z - this.pos.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) > R || Math.abs(lz) > R) continue;
      n[a.team]++; list.push(a);
    }
    this.riders = n;
    return n;
  }

  _setOwner(o) {
    const prev = this.owner;
    if (o === prev) return;
    this.owner = o;
    this.returning = false;
    this._net(['o', o]);
    this.log.push({ t: this.clock, owner: o, s: r3(this.s) });
    emit('tower:control', { owner: o, prev });
  }

  // is the tower on team t's own half (pushed there by the other team; the centre itself is nobody's)?
  homeSide(t, s = this.s) { return (t === 0 ? s : -s) < -1e-6; }

  // the next uncleared checkpoint ahead for a team pushing into enemy territory
  _nextCp(team) {
    const dir = team === 0 ? 1 : -1, here = this.s * dir;
    let best = null;
    for (const c of this.cps) if (c.team === team && !c.cleared && c.d >= here - 1e-4 && (!best || c.d < best.d)) best = c;
    return best;
  }

  // ---- per frame while the match is playing (and through overtime)
  update(dt) {
    if (this.winner != null) return;
    this.clock += dt;
    const before = this.s;
    const n = this._scanRiders();
    for (const a of this.riderList) a.stats.towerRide = (a.stats.towerRide || 0) + dt;   // (results / XP)
    if (this.follower) this._follow(dt);
    else this._rules(dt, n);
    for (const c of this.cps) { const p = c.cleared ? 1 : 1 - c.left / (c.dur || 1); if (p > c.best) c.best = p; }
    this._place(dt);
    this._carry(before);
    this._score();
    this._fillSpecials(dt);
    if (this.follower) { if (this.overtime) this.overtimeT += dt; return; }
    if (this.overtime) this._overtime(dt);
    if ((this.snapT -= dt) <= 0) {
      this.snapT = 1 / TOWER.snapHz;
      this._net(['s', r3(this.s), this.owner, n[0], n[1], r3(this.emptyT), this.contested ? 1 : 0, ...this.cps.map((c) => (c.cleared ? -1 : r3(c.left))),
        ...this.cps.map((c) => Math.round(c.lost * 100) / 100)]);
    }
  }

  _rules(dt, n) {
    const both = n[0] > 0 && n[1] > 0;
    if (both !== this.contested) { this.contested = both; emit('tower:contest', { on: both }); }
    let push = -1;
    if (both) this.emptyT = 0;
    else if (n[0] || n[1]) {
      const t = n[0] ? 0 : 1;
      this.emptyT = 0;
      this._setOwner(t);
      push = t;
    } else {
      this.emptyT += dt;
      if (this.owner >= 0 && this.emptyT >= TOWER.idleNeutral) this._setOwner(-1);
    }
    // checkpoints: progress for the team in control at one, the grace / refill for the rest
    let hold = null;
    for (const c of this.cps) {
      if (c.cleared) continue;
      const cs = c.team === 0 ? c.d : -c.d, here = Math.abs(this.s - cs) < 1e-3;
      c.at = here;
      if (this.owner === c.team && here) {
        c.lost = 0;                                       // (on it and theirs: the grace stops, even while contested)
        if (push === c.team) {
          hold = c;
          this.s = cs;                                    // (exactly on it)
          if (!c.reached) {
            c.reached = true;
            this._net(['c', this.cps.indexOf(c), 1]);
            emit('tower:checkpoint', { team: c.team, index: c.index, state: 'reach' });
          }
          c.left -= dt * TOWER.mult[Math.min(4, n[c.team])];
          if (c.left <= 0) {
            c.cleared = true; c.left = 0; hold = null;
            this._net(['c', this.cps.indexOf(c), 2]);
            emit('tower:checkpoint', { team: c.team, index: c.index, state: 'clear' });
          }
        }
      } else if (c.left < c.dur) {
        c.lost += dt;
        if (c.lost >= TOWER.checkpointGrace) {
          c.dummy = c.best; c.left = c.dur; c.lost = 0; c.reached = false;
          this._net(['c', this.cps.indexOf(c), 3]);
          emit('tower:checkpoint', { team: c.team, index: c.index, state: 'refill' });
        }
      }
    }
    // movement
    this.moving = 0;
    const homing = this.homing;
    this.homing = false;
    if (push >= 0 && !hold) {
      const dir = push === 0 ? 1 : -1, cp = this._nextCp(push);
      const end = cp ? dir * cp.d : dir * this.path.len[push];
      const step = this.speed[push] * TOWER.mult[Math.min(4, n[push])] * dt;
      const s1 = dir > 0 ? Math.min(end, this.s + step) : Math.max(end, this.s - step);
      if (s1 !== this.s) { this.s = s1; this.moving = dir; }
      if (cp && Math.abs(this.s - end) < 1e-6 && !cp.reached) {
        cp.reached = true;
        this._net(['c', this.cps.indexOf(cp), 1]);
        emit('tower:checkpoint', { team: cp.team, index: cp.index, state: 'reach' });
      }
      if (!cp && Math.abs(this.s - end) < 1e-6) return this._end(push, 'knockout');
    } else if (this.owner >= 0 && this.homeSide(this.owner) && !both && !(n[0] || n[1])) {
      // held and empty on the holders' own half: it rolls on home to the centre at the one-rider speed and stops there
      // (nothing scored, no checkpoints: those on this half are the other team's)
      this.homing = true;
      if (!homing) { this._net(['h', this.owner]); emit('tower:home', { team: this.owner }); }
      const step = this.speed[this.owner] * TOWER.mult[1] * dt;
      this.s = this.s > 0 ? Math.max(0, this.s - step) : Math.min(0, this.s + step);
      if (Math.abs(this.s) < 1e-6) this.s = 0;
      this.moving = this.owner === 0 ? 1 : -1;
    } else if (this.owner === -1 && this.s !== 0 && !both && !(n[0] || n[1])) {
      if (!this.returning) { this.returning = true; emit('tower:return', {}); }
      const step = TOWER.returnK * this.speed[this.s > 0 ? 0 : 1] * dt;
      this.s = this.s > 0 ? Math.max(0, this.s - step) : Math.min(0, this.s + step);
      this.moving = this.s > 0 ? -1 : this.s < 0 ? 1 : 0;
    }
  }

  // follower: ease onto the host's position (its snapshots ride the host's timeline, in step with its players)
  _follow(dt) {
    const N = this.net;
    if (!N) return;
    N.age += dt;
    // dead-reckon between snapshots (the tower moves at a steady speed), then ease; rolling back / home it stops at the
    // centre (never guessed past it)
    let target = N.s + N.v * Math.min(N.age, 0.25);
    if ((this.returning || this.homing) && target * N.s < 0) target = 0;
    const k = 1 - Math.exp(-10 * dt);
    const s0 = this.s;
    this.s += (target - this.s) * k;
    this.moving = this.s > s0 + 1e-5 ? 1 : this.s < s0 - 1e-5 ? -1 : 0;
  }

  // the tower's base and collider at s (its heading never changes)
  _place() {
    this.path.at(this.s, this.pos);
    _v.copy(this.pos); _v.y += TOWER.platformH / 2;
    G.level.moveDynamic(this.block, _v, this.half, this.yaw);
    _v.copy(this.pos); _v.y += TOWER.platformH + TOWER.pillarH / 2;
    G.level.moveDynamic(this.pillar, _v, this.pillarHalf, this.yaw);
  }

  // this client's own players standing on the platform go with it (along, up a wall, down a drop)
  _carry(sBefore) {
    if (this.s === sBefore) return;
    const p1 = this.pos;
    this.path.at(sBefore, _p0);
    const dx = p1.x - _p0.x, dy = p1.y - _p0.y, dz = p1.z - _p0.z;
    for (const a of this.match.actors) {
      if (!a.alive || a.remote) continue;                 // (remote players move by the network: carryRemote)
      const onIt = a.grounded && a.ground && a.ground.block === this.block.id;
      const upIt = a.climbing && a.wallHit && a.wallHit.block === this.block.id;   // swimming up its wall
      if (!onIt && !upIt) continue;
      a.pos.x += dx; a.pos.z += dz; a.pos.y += dy;
      if (a.anim?.carry) { a.anim.carry.x += dx; a.anim.carry.y += dy; a.anim.carry.z += dz; }
    }
  }

  // online (netmatch applyRemote): a remote player on the platform moves by its owner's samples — its own walking plus
  // the ride, a touch late and not quite even between samples. All of this frame's move but its own walking (the
  // owner's velocity: the ride isn't in it) is the ride, so its gait and planted feet go by its walking alone.
  carryRemote(a, x0, y0, z0, dt) {
    if (!a.alive || a.superJumpState || !a.anim?.carry) return;
    if (!this.riderList.includes(a) && !(a.climbing && this._byWall(a))) return;   // (on its deck, or swimming up its wall)
    const dx = a.pos.x - x0, dy = a.pos.y - y0, dz = a.pos.z - z0;
    if (dx * dx + dy * dy + dz * dz > 4) return;          // (a snap: not a ride)
    a.anim.carry.set(dx - a.vel.x * dt, dy - a.vel.y * dt, dz - a.vel.z * dt);
  }

  // right against one of its walls, below its top (a climber on it)
  _byWall(a) {
    const dx = a.pos.x - this.pos.x, dz = a.pos.z - this.pos.z, c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const e = Math.max(Math.abs(dx * c - dz * s), Math.abs(dx * s + dz * c)) - TOWER.platformR;
    return e > -0.2 && e < 0.7 && a.pos.y > this.pos.y - 0.3 && a.pos.y < this.top + 0.2;
  }

  // points now: the distance into enemy territory (trackPoints over the whole track) + that side's checkpoints (each
  // cpPoints, earned as its timer runs); a team keeps the most it has had
  pointsNow(t) {
    const d = Math.max(0, t === 0 ? this.s : -this.s);
    let p = this.trackPoints * Math.min(1, d / this.path.len[t]);
    for (const c of this.cps) if (c.team === t) p += c.cleared ? this.cpPoints : this.cpPoints * clamp(1 - c.left / (c.dur || 1), 0, 1);
    return Math.min(TOWER.count, p);
  }
  _score() {
    for (let t = 0; t < 2; t++) {
      const d = t === 0 ? this.s : -this.s;
      if (d > this.best[t]) this.best[t] = d;
      const p = this.pointsNow(t);
      if (p > this.points[t]) {
        this.points[t] = p;
        const c = Math.max(0, Math.ceil(TOWER.count - p - 1e-6));
        if (c < this.count[t]) { this.count[t] = c; this.reachT[t] = this.clock; }
      }
    }
  }

  _fillSpecials(dt) {
    let team = -1, rate = 0;
    if (this.owner >= 0) { team = this.owner; rate = TOWER.gaugeHeld; }
    else { team = this.losing(); rate = TOWER.gaugeNeutral; }
    if (team < 0) return;
    for (const a of this.match.actors) {
      if (a.team !== team || !a.alive || a.specialActive || a.remote) continue;
      const was = a.specialReady();
      a.special = Math.min(a.specialCost(), a.special + rate * dt);
      if (!was && a.specialReady()) emit('special:ready', { actor: a });
    }
  }

  // ---- time's up. Returns true when the match should end now; false = overtime has begun.
  timeUp() {
    const L = this.losing();
    if (L < 0 || this.owner === L) {
      this.overtime = true; this.overtimeT = 0; this.otLosing = L;
      this._net(['t', L]);
      emit('tower:overtime', { losing: L });
      return false;
    }
    this._end(1 - L, 'time');
    return true;
  }

  _overtime(dt) {
    this.overtimeT += dt;
    const L = this.otLosing;
    if (L < 0) {                                          // sudden death: the first to get ahead
      const l = this.losing();
      if (l >= 0) return this._end(1 - l, 'sudden-death');
      if (this.overtimeT >= TOWER.overtimeMax) return this._end(Math.random() < 0.5 ? 0 : 1, 'overtime-cap');
      return;
    }
    const W = 1 - L;
    if (this.losing() === W) return this._end(L, 'comeback');      // the team behind took the lead
    if (this.owner === W) return this._end(W, 'retake');
    if (this.owner === -1) return this._end(W, 'neutralised');
    if (this.overtimeT >= TOWER.overtimeMax) return this._end(W, 'overtime-cap');
  }

  _end(winner, reason) {
    if (this.winner != null) return;
    if (!this.follower) this._score();          // (a knockout lands mid-frame: count the last stretch to the goal first)
    const sc = this.scores();
    this._net(['e', winner, reason, sc[0], sc[1], r3(this.best[0]), r3(this.best[1])]);
    this.winner = winner; this.reason = reason;
    emit('tower:end', { winner, reason, counts: sc });
    this.match.endTower?.(winner, reason);
  }

  // ---- online: a follower replays the host's records (netmatch 'tw', on the host's event timeline)
  netEvent(e) {
    if (!Array.isArray(e) || !this.follower || this.winner != null) return;
    switch (e[0]) {
      case 'o': {
        const o = e[1], prev = this.owner;
        if (o === prev) break;
        this.owner = o; this.returning = false; this.homing = false;
        emit('tower:control', { owner: o, prev });
        break;
      }
      case 'h': if (!this.homing) { this.homing = true; emit('tower:home', { team: e[1] }); } break;
      case 'c': {
        const c = this.cps[e[1]];
        if (!c) break;
        const st = e[2] === 1 ? 'reach' : e[2] === 2 ? 'clear' : 'refill';
        if (st === 'clear') { c.cleared = true; c.left = 0; }
        if (st === 'refill') { c.dummy = c.best; c.left = c.dur; c.lost = 0; c.reached = false; }
        if (st === 'reach') c.reached = true;
        emit('tower:checkpoint', { team: c.team, index: c.index, state: st });
        break;
      }
      case 's': {
        const [, s, owner, n0, n1, emptyT, contested] = e;
        const N = this.net;
        const v = N && N.age > 0 ? clamp((s - N.s) / Math.max(0.05, N.age), -2, 2) : 0;
        // (rolled back / home onto the centre: it stops there — no dead-reckoning on past it)
        const stop = Math.abs(s - (N ? N.s : s)) < 1e-4 || (s === 0 && (this.returning || this.homing));
        this.net = { s, v: stop ? 0 : v, age: 0 };
        if (!N) { this.s = s; }
        this.owner = owner; this.emptyT = emptyT;
        this.hostRiders = [n0, n1];
        const on = !!contested;
        if (on !== this.contested) { this.contested = on; emit('tower:contest', { on }); }
        const ret = owner === -1 && Math.abs(s) > 1e-3 && !n0 && !n1;
        if (ret && !this.returning) emit('tower:return', {});
        this.returning = ret;
        // (rolling home: held, empty, on the holders' half — the 'h' record marks its start, this keeps it in step)
        const home = owner >= 0 && !n0 && !n1 && this.homeSide(owner, s);
        if (home && !this.homing) emit('tower:home', { team: owner });
        this.homing = home;
        for (let i = 0; i < this.cps.length; i++) {
          const v2 = e[7 + i];
          if (v2 === undefined) continue;
          if (v2 < 0) { this.cps[i].cleared = true; this.cps[i].left = 0; } else this.cps[i].left = v2;
          const g = e[7 + this.cps.length + i];                 // its grace clock (for the timer over it)
          if (g !== undefined) this.cps[i].lost = g;
        }
        break;
      }
      case 't': this.overtime = true; this.overtimeT = 0; this.otLosing = e[1]; emit('tower:overtime', { losing: e[1] }); break;
      case 'e': {
        const [, winner, reason, c0, c1, b0, b1] = e;
        if (b0 != null) { this.best = [b0, b1]; this.count = [c0, c1]; }
        this._end(winner, reason);
        break;
      }
    }
  }

  // snapshot for the HUD / results / tests
  state() {
    const sc = this.scores(), n = this.follower && this.hostRiders ? this.hostRiders : this.riders;
    const next = this.owner >= 0 ? this._nextCp(this.owner) : null;
    return {
      s: this.s, len: [...this.path.len], owner: this.owner, riders: [...n], contested: this.contested,
      count: [...this.count], score: sc, best: [...this.best], emptyT: this.emptyT, returning: this.returning,
      homing: this.homing, moving: this.moving,
      checkpoints: this.cps.map((c) => ({ team: c.team, index: c.index, d: c.d, dur: c.dur, left: c.left, cleared: c.cleared, at: !!c.at,
        best: c.best, dummy: c.dummy, lost: c.lost, pos: [c.pos.x, c.pos.y, c.pos.z] })),
      grace: TOWER.checkpointGrace,
      next: next ? { team: next.team, index: next.index, d: next.d, left: next.left, dur: next.dur, at: Math.abs(this.s - (next.team === 0 ? next.d : -next.d)) < 0.05 } : null,
      pos: [this.pos.x, this.pos.y, this.pos.z], top: this.top,
      overtime: this.overtime, overtimeT: +this.overtimeT.toFixed(1), losing: this.losing(),
      winner: this.winner, reason: this.reason, placeholder: this.placeholder,
    };
  }
}
