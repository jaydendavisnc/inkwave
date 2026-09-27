// Collision queries against the level's oriented boxes: raycasts, capsule resolution, point/segment helpers,
// plus the character-controller queries (flat-footprint ground probe, lifted body capsule, camera probe).
import * as THREE from 'three';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _s = new THREE.Vector3(), _ab = new THREE.Vector3();
const _n = new THREE.Vector3(), _go = new THREE.Vector3();
const DOWNV = new THREE.Vector3(0, -1, 0);
// footprint ring (unit directions) for the ground probe: 8 samples so a ledge edge is caught at any heading
const RING = Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2), Math.sin((i / 8) * Math.PI * 2)]);
export const WALKABLE = 0.68;   // min ground normal.y a character can stand on (≈47°)
// camera probe rays: [side, up, weight] in units of the probe radius (centre is the hard line of sight)
const CAM_RAYS = [[0, 0, 1]];
for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; CAM_RAYS.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.75]); }
for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.39; CAM_RAYS.push([Math.cos(a), Math.sin(a), 0.4]); }

export class Hit {
  constructor() { this.hit = false; this.dist = 0; this.point = new THREE.Vector3(); this.normal = new THREE.Vector3(); this.block = -1; this.face = -1; this.u = 0; this.v = 0; }
}

// Result of Physics.groundProbe (feet support under a character).
export class GroundHit {
  constructor() { this.hit = false; this.y = 0; this.normal = new THREE.Vector3(0, 1, 0); this.block = -1; this.face = -1; this.u = 0; this.v = 0; this.center = false; this.grate = false; }
}

export class Physics {
  constructor(level) {
    this.level = level;
    this._ids = [];
  }

  // Ray vs all blocks. dir must be normalized. Ignores blocks containing the origin.
  // opts.skipGrates: ink, shots, droplets and the camera pass straight through grates
  raycast(origin, dir, maxDist, out = new Hit(), skipGrates = false) {
    out.hit = false; out.dist = maxDist; out.block = -1; out.face = -1;
    const ex = origin.x + dir.x * maxDist, ez = origin.z + dir.z * maxDist;
    const ids = this.level.queryBlocks(Math.min(origin.x, ex), Math.min(origin.z, ez), Math.max(origin.x, ex), Math.max(origin.z, ez), this._ids);
    const blocks = this.level.blocks;
    let best = maxDist, bestK = -1, bestSign = 0, bestB = -1;
    for (let i = 0; i < ids.length; i++) {
      const b = blocks[ids[i]];
      if (!b.solid || (skipGrates && b.grate)) continue;
      // AABB precheck along the segment (cheap)
      _o.copy(origin).sub(b.center);
      let tmin = -Infinity, tmax = Infinity, kmin = -1, smin = 0, miss = false;
      for (let k = 0; k < 3; k++) {
        const ax = b.axes[k];
        const o = _o.dot(ax), d = dir.dot(ax), h = k === 0 ? b.half.x : k === 1 ? b.half.y : b.half.z;
        if (Math.abs(d) < 1e-9) { if (o < -h || o > h) { miss = true; break; } continue; }
        let t1 = (-h - o) / d, t2 = (h - o) / d, s1 = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s1 = 1; }
        if (t1 > tmin) { tmin = t1; kmin = k; smin = s1; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { miss = true; break; }
      }
      if (miss || tmax < 0 || tmin < 0 || tmin > best) continue;
      best = tmin; bestK = kmin; bestSign = smin; bestB = b.id;
    }
    if (bestB < 0) return out;
    const b = blocks[bestB];
    out.hit = true; out.dist = best; out.block = bestB;
    out.point.copy(origin).addScaledVector(dir, best);
    out.normal.copy(b.axes[bestK]).multiplyScalar(bestSign);
    out.face = b.faces[bestK * 2 + (bestSign > 0 ? 0 : 1)];
    if (out.face >= 0) {
      const f = this.level.faces[out.face];
      _p.copy(out.point).sub(f.origin);
      out.u = _p.dot(f.u); out.v = _p.dot(f.v);
    }
    return out;
  }

  segment(a, b, out = new Hit(), skipGrates = false) {
    _d.copy(b).sub(a);
    const len = _d.length();
    if (len < 1e-6) { out.hit = false; return out; }
    const dir = (this._segDir || (this._segDir = new THREE.Vector3())).copy(_d).multiplyScalar(1 / len);
    return this.raycast(a, dir, len, out, skipGrates);
  }

  // Line of sight between two points (true = clear).
  los(a, b) {
    _ab.copy(b).sub(a);
    const len = _ab.length();
    if (len < 1e-4) return true;
    const dir = _n.copy(_ab).multiplyScalar(1 / len);
    return !this.raycast(a, dir, len - 0.05, this._losHit || (this._losHit = new Hit()), true).hit;
  }

  closestOnBlock(b, p, out) {
    _o.copy(p).sub(b.center);
    out.copy(b.center);
    for (let k = 0; k < 3; k++) {
      const ax = b.axes[k], h = k === 0 ? b.half.x : k === 1 ? b.half.y : b.half.z;
      let d = _o.dot(ax);
      if (d > h) d = h; else if (d < -h) d = -h;
      out.addScaledVector(ax, d);
    }
    return out;
  }

  // Flat-footprint ground probe — the character's feet. Vertical rays at the centre and on a ring of radius `foot`
  // cast from `up` above the feet (y) to `down` below them. The centre surface wins when it is walkable and in range,
  // so slopes are exact (no hovering, no sphere-on-plane bounce); ring samples take over when the centre is over a
  // gap (feet stay planted on a ledge until the whole footprint is off) or when one of them sits on a clear step
  // (> stepMin above the centre: curbs/lips are stepped onto as soon as the foot reaches them).
  groundProbe(x, y, z, up, down, foot, out, skipGrates = false, stepMin = 0.12) {
    out.hit = false; out.center = false;
    const h = this._gh || (this._gh = new Hit());
    const len = up + down;
    let cy = -Infinity, have = false;
    // centre
    _go.set(x, y + up, z);
    this.raycast(_go, DOWNV, len, h, skipGrates);
    if (h.hit && h.normal.y >= WALKABLE) {
      have = true; cy = h.point.y;
      this._fillGround(out, h, true);
    }
    // ring: best clear step above the centre, or (centre missing) the highest walkable sample
    let by = have ? cy + stepMin : -Infinity, bi = -1;
    const hr = this._gh2 || (this._gh2 = new Hit());
    for (let i = 0; i < RING.length; i++) {
      _go.set(x + RING[i][0] * foot, y + up, z + RING[i][1] * foot);
      this.raycast(_go, DOWNV, len, hr, skipGrates);
      if (!hr.hit || hr.normal.y < WALKABLE) continue;
      if (hr.point.y > by) { by = hr.point.y; bi = i; this._fillGround(out, hr, false); }
    }
    out.hit = have || bi >= 0;
    return out;
  }

  _fillGround(out, h, center) {
    out.y = h.point.y; out.normal.copy(h.normal); out.block = h.block; out.face = h.face; out.u = h.u; out.v = h.v;
    out.center = center; out.grate = h.block >= 0 && !!this.level.blocks[h.block].grate;
  }

  // Resolve the character BODY: a vertical capsule whose bottom is lifted `lift` above the feet (everything below the
  // lift is the feet's job — step-ups, curbs). `horizontal` (grounded) turns push-outs into horizontal pushes so walls
  // never shove a grounded character up or down (no fighting with the ground snap). Mutates pos, fills contacts `c`.
  collideBody(pos, radius, lift, height, c, horizontal = false, skipGrates = false, iterations = 3) {
    c.ground = false; c.wall = false; c.ceiling = false;
    c.groundNormal.set(0, 1, 0); c.wallNormal.set(0, 0, 0); c.groundBlock = -1; c.wallBlock = -1;
    const blocks = this.level.blocks;
    const bot = lift + radius, top = Math.max(bot, height - radius);
    for (let it = 0; it < iterations; it++) {
      const ids = this.level.queryBlocks(pos.x - radius - 0.2, pos.z - radius - 0.2, pos.x + radius + 0.2, pos.z + radius + 0.2, this._ids);
      let moved = false;
      for (let i = 0; i < ids.length; i++) {
        const b = blocks[ids[i]];
        if (!b.solid || (skipGrates && b.grate)) continue;
        if (pos.y + height < b.aabbMin.y - 0.05 || pos.y + lift > b.aabbMax.y + 0.05) continue;
        _a.set(pos.x, pos.y + bot, pos.z);
        _b.set(pos.x, pos.y + top, pos.z);
        _ab.copy(_b).sub(_a);
        const abLen2 = Math.max(1e-6, _ab.lengthSq());
        let t = 0.5;
        for (let k = 0; k < 3; k++) {
          _s.copy(_a).addScaledVector(_ab, t);
          this.closestOnBlock(b, _s, _q);
          t = Math.min(1, Math.max(0, ((_q.x - _a.x) * _ab.x + (_q.y - _a.y) * _ab.y + (_q.z - _a.z) * _ab.z) / abLen2));
        }
        _s.copy(_a).addScaledVector(_ab, t);
        this.closestOnBlock(b, _s, _q);
        _n.copy(_s).sub(_q);
        let dist = _n.length(), pen;
        if (dist > 1e-5) {
          if (dist >= radius) continue;
          _n.multiplyScalar(1 / dist);
          pen = radius - dist;
        } else {
          _o.copy(_s).sub(b.center);
          let bestPen = Infinity;
          for (let k = 0; k < 3; k++) {
            const ax = b.axes[k], h = k === 0 ? b.half.x : k === 1 ? b.half.y : b.half.z;
            const d = _o.dot(ax), pk = h - Math.abs(d);
            if (pk < bestPen) { bestPen = pk; _n.copy(ax).multiplyScalar(d >= 0 ? 1 : -1); }
          }
          pen = bestPen + radius;
        }
        const hl = Math.hypot(_n.x, _n.z);
        if (horizontal && hl > 0.3 && _n.y > -0.6) {
          // grounded: push straight out sideways by the horizontal distance that clears the penetration
          const push = Math.min(0.45, pen / hl) + 1e-4;
          pos.x += (_n.x / hl) * push; pos.z += (_n.z / hl) * push;
          c.wall = true; c.wallNormal.set(_n.x / hl, 0, _n.z / hl); c.wallBlock = b.id;
        } else {
          pos.addScaledVector(_n, pen + 1e-4);
          if (_n.y > 0.6) { c.ground = true; c.groundNormal.copy(_n); c.groundBlock = b.id; }
          else if (_n.y < -0.6) c.ceiling = true;
          else if (Math.abs(_n.y) < 0.6) { c.wall = true; c.wallNormal.copy(_n); c.wallBlock = b.id; }
        }
        moved = true;
      }
      if (!moved) break;
    }
    return c;
  }

  // Soft camera probe ("sphere-cast feel"): a cylinder of rays parallel to the boom — the centre plus two rings
  // (radius 0.5·R and R). Each ray's hit limits the boom length; off-axis rays only partially (weight w), so an
  // obstacle sweeping toward the line of sight starts pulling the camera in several frames before it crosses it.
  // `back` = unit boom direction (pivot → lens). Returns out = { hard, soft, floor }: hard = centre-ray limit,
  // soft = blended limit (≤ hard), floor = true when the centre ray hit an upward-facing surface (never go under).
  cameraProbe(pivot, back, want, radius, out, pad = 0.3) {
    const h = this._camHit || (this._camHit = new Hit());
    _a.set(0, 1, 0); if (Math.abs(back.y) > 0.95) _a.set(1, 0, 0);
    _p.crossVectors(back, _a).normalize();     // side
    _q.crossVectors(_p, back).normalize();     // up-ish
    let hard = want, soft = want;
    out.floor = false;
    for (let i = 0; i < CAM_RAYS.length; i++) {
      const ox = CAM_RAYS[i][0], oy = CAM_RAYS[i][1], w = CAM_RAYS[i][2];
      _s.copy(pivot).addScaledVector(_p, ox * radius).addScaledVector(_q, oy * radius);
      this.raycast(_s, back, want + pad, h, true);
      if (!h.hit) continue;
      const lim = Math.max(0, h.dist - pad);
      if (w >= 1) { if (lim < hard) { hard = lim; out.floor = h.normal.y > 0.6; } }
      const blended = lim + (want - lim) * (1 - w);
      if (blended < soft) soft = blended;
    }
    out.hard = hard; out.soft = Math.min(soft, hard);
    return out;
  }

  // Distance from point p to the vertical capsule (feet at base).
  static pointCapsuleDist(p, base, radius, height) {
    const y = Math.min(Math.max(p.y, base.y + radius), base.y + Math.max(radius, height - radius));
    const dx = p.x - base.x, dy = p.y - y, dz = p.z - base.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Closest approach of segment a→b to the vertical capsule; returns distance and sets outT (0..1 along segment).
  static segmentCapsuleDist(a, b, base, radius, height, res) {
    // sample-based closest point (short segments; robust enough for projectiles)
    let best = Infinity, bt = 0;
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      _p.copy(a).lerp(b, t);
      const d = Physics.pointCapsuleDist(_p, base, radius, height);
      if (d < best) { best = d; bt = t; }
    }
    // refine
    let lo = Math.max(0, bt - 1 / steps), hi = Math.min(1, bt + 1 / steps);
    for (let k = 0; k < 8; k++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      _p.copy(a).lerp(b, m1); const d1 = Physics.pointCapsuleDist(_p, base, radius, height);
      _p.copy(a).lerp(b, m2); const d2 = Physics.pointCapsuleDist(_p, base, radius, height);
      if (d1 < d2) hi = m2; else lo = m1;
    }
    res.t = (lo + hi) / 2;
    _p.copy(a).lerp(b, res.t);
    res.dist = Physics.pointCapsuleDist(_p, base, radius, height);
    return res;
  }
}

export function makeContacts() {
  return { ground: false, wall: false, ceiling: false, groundNormal: new THREE.Vector3(0, 1, 0), wallNormal: new THREE.Vector3(), groundBlock: -1, wallBlock: -1 };
}
