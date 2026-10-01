// Level: turns a map layout (oriented boxes) into collision blocks, paintable faces and render geometry.
import * as THREE from 'three';
import { PATTERN } from './maps.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Level {
  // extra: collision-only boxes from set dressing ({min,max}, or {obox, center, size, rotY} for a turned prop; optional
  // roof / rail / perch flags) — solid, un-inkable, never rendered (the prop mesh is)
  constructor(layout, extra = []) {
    this.extra = extra;
    this.layout = layout;
    this.bounds = layout.bounds;
    this.spawnPads = layout.spawnPads.map((p) => new THREE.Vector3(...p));
    this.spawnBarrier = layout.spawnBarrier;
    this.blocks = [];
    this.faces = [];
    this._stamp = 1;
    this.dyn = [];              // moving collision boxes (Tower Command's tower): outside the hash, checked by every query
    this._build();
  }

  // ---------------------------------------------------------------- blocks
  _build() {
    const L = this.layout;
    const defs = [...L.single, ...L.half, ...L.half.map(mirrorDef),
      ...this.extra.map((c) => (c.obox
        ? { kind: 'obox', center: c.center, size: c.size, rotY: c.rotY, paint: false, hidden: true, color: '#888888', roof: !!c.roof, rail: !!c.rail, perch: !!c.perch }
        : { kind: 'box', min: c.min, max: c.max, paint: false, hidden: true, color: '#888888', roof: !!c.roof, rail: !!c.rail, perch: !!c.perch }))];
    for (const d of defs) this._addBlock(d);
    this.hasRails = this.blocks.some((b) => b.rail);   // (actors only run the railing foot check where there are rails)
    this._buildHash();
    for (const b of this.blocks) this._buildFaces(b);
  }

  _addBlock(d) {
    const b = {
      id: this.blocks.length,
      center: new THREE.Vector3(),
      half: new THREE.Vector3(),
      axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
      aabbMin: new THREE.Vector3(), aabbMax: new THREE.Vector3(),
      paint: d.paint !== false && !d.grate && !d.rail, solid: d.solid !== false,
      color: new THREE.Color(d.color || '#dddddd'),
      pattern: d.pattern ?? PATTERN.plain,
      tag: d.tag || null,
      mural: d.mural || null,
      noPaint: d.noPaint || null,
      grate: !!d.grate || !!d.rail, // walkable for kids, squids + ink + shots pass through, never inkable
      roof: !!d.roof,              // off-limits top (roofs, crane legs …): never inkable, anyone landing on it slides off
      perch: !!d.perch,            // a top you can stand on (overhead steel reached by a super jump) but never ink
      noNav: !!d.noNav,            // no route runs along its top (narrow walls a bot would only fall off)
      // rail: railings / fences — kids can't walk through (but can hop up and stand on top), shots + ink + squids pass.
      // Collision-only (the railing you see is a prop): a grate block that is never drawn or inked
      rail: !!d.rail,
      hidden: !!d.hidden || !!d.rail, // collision-only (prop colliders, rails)
      bevel: d.bevel,
      faces: [-1, -1, -1, -1, -1, -1],
      aligned: true,
    };
    if (d.kind === 'box') {
      b.center.set((d.min[0] + d.max[0]) / 2, (d.min[1] + d.max[1]) / 2, (d.min[2] + d.max[2]) / 2);
      b.half.set((d.max[0] - d.min[0]) / 2, (d.max[1] - d.min[1]) / 2, (d.max[2] - d.min[2]) / 2);
    } else if (d.kind === 'obox') {
      // box turned about the vertical axis by rotY degrees (a stage laid out at an angle, turned props)
      const a = (d.rotY * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      b.center.set(d.center[0], d.center[1], d.center[2]);
      b.half.set(d.size[0] / 2, d.size[1] / 2, d.size[2] / 2);
      b.axes = [new THREE.Vector3(c, 0, -s), new THREE.Vector3(0, 1, 0), new THREE.Vector3(s, 0, c)];
      b.aligned = false;
    } else {
      // Ramp: a thick tilted slab whose top surface runs from low → high and whose underside reaches the floor.
      const L0 = new THREE.Vector3(...d.low), H0 = new THREE.Vector3(...d.high);
      const s = H0.clone().sub(L0); const len = s.length(); s.normalize();
      const flat = new THREE.Vector3(s.x, 0, s.z).normalize();
      const side = new THREE.Vector3().crossVectors(UP, flat).normalize();
      const n = new THREE.Vector3().crossVectors(s, side).normalize();
      if (n.y < 0) { n.negate(); side.negate(); }
      const cosT = n.y;
      const rise = H0.y - L0.y;
      // thin: a free-spanning plank/gangway (keeps its own thickness instead of reaching down to the floor)
      const thick = d.thin ? d.thickness : Math.max(d.thickness, rise * cosT + 0.35);
      const ext = 0.6; // extend under the floor at the low end
      const a = L0.clone().addScaledVector(s, -ext);
      const topMid = a.clone().add(H0).multiplyScalar(0.5);
      b.center.copy(topMid).addScaledVector(n, -thick / 2);
      b.half.set(d.width / 2, thick / 2, (len + ext) / 2);
      b.axes = [side, n, s];
      b.aligned = false;
      // keep right-handed: side x n should equal s
      const chk = new THREE.Vector3().crossVectors(side, n);
      if (chk.dot(s) < 0) b.axes[0].negate();
    }
    // AABB
    b.aabbMin.set(Infinity, Infinity, Infinity); b.aabbMax.set(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < 8; i++) {
      _v.copy(b.center)
        .addScaledVector(b.axes[0], (i & 1 ? 1 : -1) * b.half.x)
        .addScaledVector(b.axes[1], (i & 2 ? 1 : -1) * b.half.y)
        .addScaledVector(b.axes[2], (i & 4 ? 1 : -1) * b.half.z);
      b.aabbMin.min(_v); b.aabbMax.max(_v);
    }
    this.blocks.push(b);
  }

  // 2D spatial hash over XZ for broadphase
  _buildHash() {
    const cs = (this.hashCell = 4);
    const bx = this.bounds;
    this.hx0 = bx.minX - 8; this.hz0 = bx.minZ - 8;
    this.hw = Math.ceil((bx.maxX - bx.minX + 16) / cs);
    this.hd = Math.ceil((bx.maxZ - bx.minZ + 16) / cs);
    this.hash = Array.from({ length: this.hw * this.hd }, () => []);
    this.blockStamp = new Uint32Array(this.blocks.length);
    for (const b of this.blocks) {
      const x0 = this._hxi(b.aabbMin.x), x1 = this._hxi(b.aabbMax.x);
      const z0 = this._hzi(b.aabbMin.z), z1 = this._hzi(b.aabbMax.z);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.hash[z * this.hw + x].push(b.id);
    }
  }
  _hxi(x) { return Math.max(0, Math.min(this.hw - 1, Math.floor((x - this.hx0) / this.hashCell))); }
  _hzi(z) { return Math.max(0, Math.min(this.hd - 1, Math.floor((z - this.hz0) / this.hashCell))); }

  // Unique block ids whose hash cells overlap the XZ rectangle (plus any moving block whose AABB does).
  queryBlocks(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    const st = ++this._stamp;
    const x0 = this._hxi(minX), x1 = this._hxi(maxX), z0 = this._hzi(minZ), z1 = this._hzi(maxZ);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const cell = this.hash[z * this.hw + x];
      for (let i = 0; i < cell.length; i++) {
        const id = cell[i];
        if (this.blockStamp[id] !== st) { this.blockStamp[id] = st; out.push(id); }
      }
    }
    for (let i = 0; i < this.dyn.length; i++) {
      const b = this.dyn[i];
      if (b.aabbMax.x >= minX && b.aabbMin.x <= maxX && b.aabbMax.z >= minZ && b.aabbMin.z <= maxZ) out.push(b.id);
    }
    return out;
  }

  // ---------------------------------------------------------------- moving blocks
  // A collision-only box that moves (never drawn, never inked — the mesh is its owner's): d as a 'box' def's flags.
  // Moving blocks sit after the stage's own, so clearDynamic() takes them all off again (match end).
  addDynamic(d = {}) {
    this._addBlock({ kind: 'box', min: [0, 0, 0], max: [1, 1, 1], color: '#888888', ...d, paint: false, hidden: true });
    const b = this.blocks[this.blocks.length - 1];
    b.dynamic = true;
    this.dyn.push(b);
    if (this.blockStamp.length < this.blocks.length) { const s = new Uint32Array(this.blocks.length + 8); s.set(this.blockStamp); this.blockStamp = s; }
    return b;
  }
  // place a moving block: centre, half extents, turned `yaw` about the vertical (its local z along (sin yaw, cos yaw))
  moveDynamic(b, center, half, yaw = 0) {
    b.center.copy(center);
    if (half) b.half.copy(half);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    b.axes[0].set(c, 0, -s); b.axes[1].set(0, 1, 0); b.axes[2].set(s, 0, c);
    const ex = Math.abs(c) * b.half.x + Math.abs(s) * b.half.z, ez = Math.abs(s) * b.half.x + Math.abs(c) * b.half.z;
    b.aabbMin.set(b.center.x - ex, b.center.y - b.half.y, b.center.z - ez);
    b.aabbMax.set(b.center.x + ex, b.center.y + b.half.y, b.center.z + ez);
  }
  clearDynamic() {
    if (!this.dyn.length) return;
    this.blocks.length = this.dyn[0].id;
    this.dyn.length = 0;
  }

  pointInBlock(b, p, pad = 0) {
    _v2.copy(p).sub(b.center);
    return Math.abs(_v2.dot(b.axes[0])) < b.half.x + pad &&
      Math.abs(_v2.dot(b.axes[1])) < b.half.y + pad &&
      Math.abs(_v2.dot(b.axes[2])) < b.half.z + pad;
  }

  pointInside(p, pad = 0, exclude = -1) {
    const ids = this.queryBlocks(p.x - 0.01, p.z - 0.01, p.x + 0.01, p.z + 0.01, this._qtmp || (this._qtmp = []));
    for (const id of ids) {
      if (id === exclude) continue;
      const b = this.blocks[id];
      if (!b.solid) continue;
      if (this.pointInBlock(b, p, pad)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- faces
  _buildFaces(b) {
    if (b.hidden) return;
    const ax = b.axes, h = [b.half.x, b.half.y, b.half.z];
    for (let k = 0; k < 3; k++) {
      for (const sign of [1, -1]) {
        const n = ax[k].clone().multiplyScalar(sign);
        if (n.y < -0.5) {
          // underside: only keep if it floats well above the floor (overhangs)
          const lowest = b.center.y - h[1];
          if (lowest < 0.5) continue;
        }
        const others = [0, 1, 2].filter((i) => i !== k);
        let ui, vi;
        if (Math.abs(n.y) < 0.5) {
          // wall: v = the in-plane axis most aligned with world up
          vi = Math.abs(ax[others[0]].y) > Math.abs(ax[others[1]].y) ? others[0] : others[1];
          ui = others[0] === vi ? others[1] : others[0];
        } else {
          ui = Math.abs(ax[others[0]].x) >= Math.abs(ax[others[1]].x) ? others[0] : others[1];
          vi = others[0] === ui ? others[1] : others[0];
        }
        const v = ax[vi].clone();
        if (Math.abs(n.y) < 0.5) { if (v.y < 0) v.negate(); } else if (v.z < 0 && Math.abs(v.z) > 0.3) v.negate();
        const u = new THREE.Vector3().crossVectors(v, n); // u x v = n
        const su = 2 * h[ui], sv = 2 * h[vi];
        const origin = b.center.clone().addScaledVector(n, h[k]).addScaledVector(u, -su / 2).addScaledVector(v, -sv / 2);
        const face = {
          id: this.faces.length, block: b.id, n, u, v, origin, su, sv,
          wall: Math.abs(n.y) < 0.3, turf: n.y > 0.7, ceiling: n.y < -0.5,
          paintable: b.paint && n.y > -0.5,
          pattern: b.pattern, color: b.color,
          groundedBottom: false,
          atlas: null, grid: -1, nu: 0, nv: 0,
        };
        if (this._faceHidden(face)) continue;
        face.mural = -1;
        if (b.mural) for (const m of b.mural) if (n.x * m.n[0] + n.y * m.n[1] + n.z * m.n[2] > 0.9) face.mural = m.id;
        if (b.noPaint) for (const m of b.noPaint) if (n.x * m[0] + n.y * m[1] + n.z * m[2] > 0.9) face.paintable = false;
        if ((b.roof || b.perch) && n.y > 0.5) face.paintable = false;
        if (face.wall) {
          _v.copy(origin).addScaledVector(u, su / 2).addScaledVector(v, -0.06).addScaledVector(n, 0.06);
          face.groundedBottom = this.pointInside(_v, 0, b.id) || _v.y < 0.02;
        }
        b.faces[k * 2 + (sign > 0 ? 0 : 1)] = face.id;
        this.faces.push(face);
      }
    }
  }

  // A face is hidden when every sample point just outside it lies inside another solid block.
  _faceHidden(f) {
    const nu = Math.max(2, Math.ceil(f.su / 1.25)), nv = Math.max(2, Math.ceil(f.sv / 1.25));
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const uu = Math.min(f.su - 0.05, Math.max(0.05, (i / nu) * f.su));
        const vv = Math.min(f.sv - 0.05, Math.max(0.05, (j / nv) * f.sv));
        _v.copy(f.origin).addScaledVector(f.u, uu).addScaledVector(f.v, vv).addScaledVector(f.n, 0.03);
        if (!this.pointInside(_v, 0, f.block)) return false;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------- baked-lighting atlas
  // Deterministic shelf layout of every rendered face at a fixed density, independent of the paint atlas/quality.
  layoutLightmap(ppm = 5, size = 1024, pad = 2) {
    const faces = this.faces.filter((f) => !this.blocks[f.block].grate);
    const rects = faces.map((f) => ({ f, w: Math.ceil(f.su * ppm) + pad * 2, h: Math.ceil(f.sv * ppm) + pad * 2 }));
    rects.sort((a, b) => b.h - a.h || b.w - a.w || a.f.id - b.f.id);
    let x = 0, y = 0, rowH = 0;
    for (const r of rects) {
      if (x + r.w > size) { x = 0; y += rowH; rowH = 0; }
      r.f.light = { x, y, ppm, pad };
      x += r.w; rowH = Math.max(rowH, r.h);
    }
    this.lightSize = size;
    this.lightUsed = y + rowH;
    // checksum so a stale bake is never applied to a changed layout
    let h = 2166136261;
    for (const f of this.faces) for (const v of [f.origin.x, f.origin.y, f.origin.z, f.su, f.sv]) { h ^= Math.round(v * 100); h = Math.imul(h, 16777619) >>> 0; }
    this.layoutHash = (h >>> 0).toString(16);
    return this.lightUsed <= size;
  }

  // ---------------------------------------------------------------- render geometry
  // Every block renders as a rounded box: exposed edges get a real bevel (quarter-round strips + octant corners),
  // edges flush against other geometry stay sharp so floors never show grooves. Bevel vertices map into their face's
  // paint atlas (the 8-texel padding holds extrapolated ink), so ink wraps smoothly over the rounded edges.
  // Requires faces to have been laid out in the paint atlas (face.atlas = {x, y, ppm, pad}) — non-paintable faces render too.
  buildGeometry(atlasSize, filter = (b) => !b.grate) {
    const B = { pos: [], nor: [], col: [], puv: [], luv: [], fuv: [], fdat: [], fflag: [], ftan: [], idx: [] };
    const LS = this.lightSize || 1;
    const lin = new THREE.Color();
    const P = new THREE.Vector3(), Nn = new THREE.Vector3(), E = new THREE.Vector3(), Q = new THREE.Vector3();
    const faceOf = (b, k, s) => b.faces[k * 2 + (s > 0 ? 0 : 1)];
    const self = this;
    function vert(f, p, n) {
      const i = B.pos.length / 3;
      B.pos.push(p.x, p.y, p.z); B.nor.push(n.x, n.y, n.z);
      lin.copy(f.color); B.col.push(lin.r, lin.g, lin.b);
      Q.copy(p).sub(f.origin);
      const cu = Q.dot(f.u), cv = Q.dot(f.v);
      if (f.atlas) B.puv.push((f.atlas.x + f.atlas.pad + cu * f.atlas.ppm) / atlasSize, (f.atlas.y + f.atlas.pad + cv * f.atlas.ppm) / atlasSize);
      else B.puv.push(0, 0);
      if (f.light) B.luv.push((f.light.x + f.light.pad + cu * f.light.ppm) / LS, (f.light.y + f.light.pad + cv * f.light.ppm) / LS);
      else B.luv.push(-1, -1);
      B.fuv.push(cu, cv);
      B.fdat.push(f.pattern, f.atlas ? 1 : 0, f.su, f.sv);
      B.fflag.push(f.wall ? 1 : 0, f.groundedBottom ? 1 : 0, f.mural);
      B.ftan.push(f.u.x, f.u.y, f.u.z);
      return i;
    }
    // triangle with winding chosen so it faces along `n`
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
    function tri(i0, i1, i2, n) {
      const pp = B.pos;
      _a.set(pp[i1 * 3] - pp[i0 * 3], pp[i1 * 3 + 1] - pp[i0 * 3 + 1], pp[i1 * 3 + 2] - pp[i0 * 3 + 2]);
      _b.set(pp[i2 * 3] - pp[i0 * 3], pp[i2 * 3 + 1] - pp[i0 * 3 + 1], pp[i2 * 3 + 2] - pp[i0 * 3 + 2]);
      _c.crossVectors(_a, _b);
      if (_c.dot(n) >= 0) B.idx.push(i0, i1, i2); else B.idx.push(i0, i2, i1);
    }
    for (const b of this.blocks) {
      if ((!b.solid && !b.render) || !filter(b)) continue;
      const ax = b.axes, h = [b.half.x, b.half.y, b.half.z];
      const minH = Math.min(h[0], h[1], h[2]);
      // bevel scales with the block: chunky rounded edges on big structures, finer on crates/ramps/rails
      const bev = Math.min(b.bevel ?? Math.max(0.04, Math.min(0.13, minH * 0.14)), minH * 0.45);
      // exposed-edge test (both faces rendered and nothing solid hugging the edge)
      const edgeCache = new Map();
      const bevelled = (k1, s1, k2, s2) => {
        if (bev < 0.01) return false;
        const key = k1 < k2 ? `${k1}${s1}${k2}${s2}` : `${k2}${s2}${k1}${s1}`;
        if (edgeCache.has(key)) return edgeCache.get(key);
        let ok = faceOf(b, k1, s1) >= 0 && faceOf(b, k2, s2) >= 0;
        if (ok) {
          const k3 = 3 - k1 - k2;
          for (let t = -1; t <= 1; t += 0.25) {
            E.copy(b.center).addScaledVector(ax[k1], s1 * h[k1]).addScaledVector(ax[k2], s2 * h[k2]).addScaledVector(ax[k3], t * h[k3] * 0.98);
            Q.copy(E).addScaledVector(ax[k1], s1 * 0.04).addScaledVector(ax[k2], s2 * 0.04);
            if (self.pointInside(Q, 0, b.id)) { ok = false; break; }
          }
        }
        edgeCache.set(key, ok);
        return ok;
      };
      // --- faces (inset where the edge is bevelled)
      for (let k = 0; k < 3; k++) for (const s of [1, -1]) {
        const fid = faceOf(b, k, s);
        if (fid < 0) continue;
        const f = this.faces[fid];
        const [i, j] = [0, 1, 2].filter((a) => a !== k);
        const ip = bevelled(k, s, i, 1) ? bev : 0, im = bevelled(k, s, i, -1) ? bev : 0;
        const jp = bevelled(k, s, j, 1) ? bev : 0, jm = bevelled(k, s, j, -1) ? bev : 0;
        const cf = E.copy(b.center).addScaledVector(ax[k], s * h[k]).clone();
        const corner = (si, sj) => {
          const di = si > 0 ? h[i] - ip : -(h[i] - im), dj = sj > 0 ? h[j] - jp : -(h[j] - jm);
          return vert(f, P.copy(cf).addScaledVector(ax[i], di).addScaledVector(ax[j], dj), f.n);
        };
        const v0 = corner(-1, -1), v1 = corner(1, -1), v2 = corner(1, 1), v3 = corner(-1, 1);
        tri(v0, v1, v2, f.n); tri(v0, v2, v3, f.n);
      }
      if (bev < 0.01) continue;
      // --- edge strips
      const SEG = 2; // per half (4 segments per quarter-round)
      for (let k1 = 0; k1 < 3; k1++) for (let k2 = k1 + 1; k2 < 3; k2++) for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
        if (!bevelled(k1, s1, k2, s2)) continue;
        const k3 = 3 - k1 - k2;
        const fa = this.faces[faceOf(b, k1, s1)], fb = this.faces[faceOf(b, k2, s2)];
        const nA = ax[k1].clone().multiplyScalar(s1), nB = ax[k2].clone().multiplyScalar(s2);
        const endCut = (s3) => faceOf(b, k3, s3) >= 0 && bevelled(k3, s3, k1, s1) && bevelled(k3, s3, k2, s2) ? bev : 0;
        const t0 = -h[k3] + endCut(-1), t1 = h[k3] - endCut(1);
        const base = E.copy(b.center).addScaledVector(nA, h[k1] - bev).addScaledVector(nB, h[k2] - bev).clone();
        for (const half of [0, 1]) {
          const f = half ? fb : fa;
          const rows = [];
          for (let q = 0; q <= SEG; q++) {
            const th = (Math.PI / 4) * (half + q / SEG);
            Nn.copy(nA).multiplyScalar(Math.cos(th)).addScaledVector(nB, Math.sin(th));
            const r0 = vert(f, P.copy(base).addScaledVector(ax[k3], t0).addScaledVector(Nn, bev), Nn);
            const r1 = vert(f, P.copy(base).addScaledVector(ax[k3], t1).addScaledVector(Nn, bev), Nn);
            rows.push([r0, r1, Nn.clone()]);
          }
          for (let q = 0; q < SEG; q++) {
            const [a0, a1, na] = rows[q], [b0, b1] = rows[q + 1];
            tri(a0, a1, b1, na); tri(a0, b1, b0, na);
          }
        }
      }
      // --- rounded corners (octant patches) where all three edges are bevelled
      const NC = 3;
      for (const s0 of [1, -1]) for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
        const sg = [s0, s1, s2];
        if (!(bevelled(0, s0, 1, s1) && bevelled(0, s0, 2, s2) && bevelled(1, s1, 2, s2))) continue;
        const n0 = ax[0].clone().multiplyScalar(s0), n1 = ax[1].clone().multiplyScalar(s1), n2 = ax[2].clone().multiplyScalar(s2);
        const c = E.copy(b.center).addScaledVector(n0, h[0] - bev).addScaledVector(n1, h[1] - bev).addScaledVector(n2, h[2] - bev).clone();
        // map the whole patch to the most "up" face (usually the top) so its ink matches what you see from above
        let best = 0, bd = -2;
        [n0, n1, n2].forEach((nn, a) => { if (nn.y > bd) { bd = nn.y; best = a; } });
        const f = this.faces[faceOf(b, best, sg[best])];
        const ids = [];
        for (let a = 0; a <= NC; a++) { ids.push([]); for (let bb = 0; bb <= NC - a; bb++) {
          const cc = NC - a - bb;
          Nn.set(0, 0, 0).addScaledVector(n0, a).addScaledVector(n1, bb).addScaledVector(n2, cc).normalize();
          ids[a].push(vert(f, P.copy(c).addScaledVector(Nn, bev), Nn));
        } }
        const mid = n0.clone().add(n1).add(n2).normalize();
        for (let a = 0; a < NC; a++) for (let bb = 0; bb < NC - a; bb++) {
          tri(ids[a][bb], ids[a + 1][bb], ids[a][bb + 1], mid);
          if (bb < NC - a - 1) tri(ids[a + 1][bb], ids[a + 1][bb + 1], ids[a][bb + 1], mid);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    g.setAttribute('paintUv', new THREE.Float32BufferAttribute(B.puv, 2));
    g.setAttribute('lightUv', new THREE.Float32BufferAttribute(B.luv, 2));
    g.setAttribute('faceUv', new THREE.Float32BufferAttribute(B.fuv, 2));
    g.setAttribute('faceData', new THREE.Float32BufferAttribute(B.fdat, 4));
    g.setAttribute('faceFlags', new THREE.Float32BufferAttribute(B.fflag, 3));
    g.setAttribute('faceTan', new THREE.Float32BufferAttribute(B.ftan, 3));
    g.setIndex(B.idx);
    g.computeBoundingSphere();
    this.renderTris = B.idx.length / 3;
    return g;
  }

  // Highest walkable surface under (x,z) below yMax (used by nav + spawns). Returns y or -Infinity.
  // skipGrates: what a squid would land on (squids drop straight through grates)
  groundHeight(x, z, yMax = 50, skipGrates = false) {
    let best = -Infinity;
    const ids = this.queryBlocks(x - 0.01, z - 0.01, x + 0.01, z + 0.01, this._qtmp2 || (this._qtmp2 = []));
    for (const id of ids) {
      const b = this.blocks[id];
      if (!b.solid || (skipGrates && b.grate)) continue;
      // intersect vertical line with the block's top face plane
      const n = b.axes[1];
      if (n.y < 0.5) continue;
      const top = _v.copy(b.center).addScaledVector(n, b.half.y);
      // plane: n·(p - top) = 0 → y = top.y - (n.x (x-top.x) + n.z (z-top.z)) / n.y
      const y = top.y - (n.x * (x - top.x) + n.z * (z - top.z)) / n.y;
      _v2.set(x, y - 0.01, z);
      if (y <= yMax && y > best && this.pointInBlock(b, _v2, 0.001)) best = y;
    }
    return best;
  }
}

function mirrorDef(d) {
  const mural = d.mural ? d.mural.map((m) => ({ ...m, n: [-m.n[0], m.n[1], -m.n[2]] })) : undefined;
  const noPaint = d.noPaint ? d.noPaint.map((m) => [-m[0], m[1], -m[2]]) : undefined;
  if (d.kind === 'box') {
    return { ...d, mural, noPaint, min: [-d.max[0], d.min[1], -d.max[2]], max: [-d.min[0], d.max[1], -d.min[2]] };
  }
  if (d.kind === 'obox') return { ...d, mural, noPaint, center: [-d.center[0], d.center[1], -d.center[2]] };
  return { ...d, mural, noPaint, low: [-d.low[0], d.low[1], -d.low[2]], high: [-d.high[0], d.high[1], -d.high[2]] };
}
