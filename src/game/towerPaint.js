// Ink on a moving / growing box: Tower Command's tower, the sprout pods' hedges (src/game/pods.js). The level's paint
// (src/world/paint.js) lives on static faces; these boxes move or come and go, so each keeps its own (BoxPaint): its four
// walls and its top (inside a rim that never takes ink: the tower's grate) each hold a grid of which team's ink is
// where, and one canvas texture its look draws them from (src/fx/towerFx.js, pods.js).
//   • every splat on the stage (Paint.splat, so online ones too) that reaches the box paints it, in box space: the ink
//     rides with it. `accept(team)` can refuse a team's ink (a hedge takes its grower's only)
//   • the top in your ink is ground you swim, refill and hide in (Actor._surface); its walls in your ink are walls you
//     swim up (Actor._updateClimb) — a dynamic level block with `inkPaint` set to its BoxPaint is all the actor needs
import * as THREE from 'three';
import { G } from '../core/ctx.js';
import { TOWER } from '../config.js';

const CELL = 0.1;                    // m per ownership cell
const PPM = 64;                      // canvas pixels per metre
export const GRATE = 0.3;            // m of grate rimming the deck (no ink)
const _d = new THREE.Vector3();

// a tiny deterministic noise for the splat edges (the same splat looks the same on every screen)
const rnd = (s) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// A box's own ink. frame: anything with .pos (the base centre, a Vector3) and .yaw (its local x along (cos, 0, −sin));
// o: { hx, hz: half sizes across (local x) and along (local z), h: height, rim: m round the top that never inks,
//      ppm: canvas pixels per metre, accept(team) → false refuses that team's ink }
export class BoxPaint {
  constructor(frame, o) {
    this.T = frame;
    const hx = o.hx, hz = o.hz, H = o.h, rim = o.rim || 0, ppm = o.ppm || PPM;
    this.hx = hx; this.hz = hz; this.H = H; this.rim = rim; this.accept = o.accept || null;
    this.R = hx; this.Ri = hx - rim;     // (the tower's names: a square box)
    // surfaces: the top (a: local x, b: local z, inside the rim) and the walls +x, −x (a: along local z), +z, −z (a: along
    // local x) (b: height 0…H); rect = where each sits in the canvas
    const tw = Math.ceil(2 * (hx - rim) * ppm), td = Math.ceil(2 * (hz - rim) * ppm), wx = Math.ceil(2 * hz * ppm), wz = Math.ceil(2 * hx * ppm), wh = Math.ceil(H * ppm);
    this.surf = [
      { id: 'deck', a0: -(hx - rim), a1: hx - rim, b0: -(hz - rim), b1: hz - rim, rect: [0, 0, tw, td] },
      { id: '+x', a0: -hz, a1: hz, b0: 0, b1: H, rect: [tw + 2, 0, wx, wh] },
      { id: '-x', a0: -hz, a1: hz, b0: 0, b1: H, rect: [tw + 2, wh + 2, wx, wh] },
      { id: '+z', a0: -hx, a1: hx, b0: 0, b1: H, rect: [tw + wx + 4, 0, wz, wh] },
      { id: '-z', a0: -hx, a1: hx, b0: 0, b1: H, rect: [tw + wx + 4, wh + 2, wz, wh] },
    ];
    for (const s of this.surf) { s.nu = Math.ceil((s.a1 - s.a0) / CELL); s.nv = Math.ceil((s.b1 - s.b0) / CELL); s.grid = new Int8Array(s.nu * s.nv); }
    this.W = tw + wx + wz + 6; this.Hc = Math.max(td, 2 * wh + 2);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W; this.canvas.height = this.Hc;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.dirty = false;
    this.n = 0;
  }
  dispose() { this.texture.dispose(); }
  // wipe it (a hedge wilting away)
  clear() {
    for (const s of this.surf) s.grid.fill(0);
    this.ctx.clearRect(0, 0, this.W, this.Hc);
    this.dirty = true; this.n = 0;
  }

  // world → box space (x across, y up from the base, z along its heading)
  _local(p, out) {
    const T = this.T, c = Math.cos(T.yaw), s = Math.sin(T.yaw);
    _d.subVectors(p, T.pos);
    return out.set(_d.x * c - _d.z * s, _d.y, _d.x * s + _d.z * c);
  }

  // a splat of ink (Paint.splat forwards every one): paint whichever of the box's surfaces its sphere reaches
  splat(center, radius, team, opts = {}) {
    if (opts.cosmetic || team < 0 || team > 1) return;
    if (this.accept && !this.accept(team)) return;
    const T = this.T, hx = this.hx, hz = this.hz, H = this.H, pad = radius + 0.2, ext = Math.max(hx, hz) * 1.5;
    // quick reject against the box
    if (Math.abs(center.x - T.pos.x) > ext + pad || Math.abs(center.z - T.pos.z) > ext + pad || center.y < T.pos.y - pad || center.y > T.pos.y + H + pad) return;
    const L = this._local(center, _l);
    const r = radius * 1.1, seed = opts.seed ?? Math.random();
    const hit = (s, dn, a, b) => {
      if (dn > r || dn < -0.12) return;
      const rr = Math.sqrt(Math.max(0, r * r - Math.max(0, dn) * Math.max(0, dn)));
      if (rr > 0.02) this._paint(s, a, b, rr, team, seed);
    };
    hit(this.surf[0], L.y - H, L.x, L.z);
    if (L.y > -0.2 && L.y < H + 0.2) {
      hit(this.surf[1], L.x - hx, L.z, L.y);
      hit(this.surf[2], -hx - L.x, -L.z, L.y);
      hit(this.surf[3], L.z - hz, -L.x, L.y);
      hit(this.surf[4], -hz - L.z, L.x, L.y);
    }
  }
  _paint(s, a, b, rr, team, seed) {
    if (a + rr < s.a0 || a - rr > s.a1 || b + rr < s.b0 || b - rr > s.b1) return;
    // ownership: the cells the blob covers
    const i0 = Math.max(0, Math.floor((a - rr - s.a0) / CELL)), i1 = Math.min(s.nu - 1, Math.floor((a + rr - s.a0) / CELL));
    const j0 = Math.max(0, Math.floor((b - rr - s.b0) / CELL)), j1 = Math.min(s.nv - 1, Math.floor((b + rr - s.b0) / CELL));
    const t = team + 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const ca = s.a0 + (i + 0.5) * CELL, cb = s.b0 + (j + 0.5) * CELL;
      if ((ca - a) * (ca - a) + (cb - b) * (cb - b) <= rr * rr) s.grid[j * s.nu + i] = t;
    }
    // the look: a blob with a few drops round it, in the team's ink
    const g = this.ctx, [rx, ry, rw, rh] = s.rect, sx = rw / (s.a1 - s.a0), sy = rh / (s.b1 - s.b0);
    const px = (u) => rx + (u - s.a0) * sx, py = (v) => ry + rh - (v - s.b0) * sy;
    g.save();
    g.beginPath(); g.rect(rx, ry, rw, rh); g.clip();
    g.fillStyle = (G.teamHex && G.teamHex[team]) || (team ? '#2f5bff' : '#ff8a14');
    g.beginPath();
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const ang = (k / n) * Math.PI * 2, w = 0.82 + 0.3 * rnd(seed * 91 + k);
      const x = px(a + Math.cos(ang) * rr * w), y = py(b + Math.sin(ang) * rr * w);
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.fill();
    for (let k = 0; k < 3; k++) {
      const ang = rnd(seed * 17 + k * 3.1) * Math.PI * 2, d = rr * (1.1 + 0.5 * rnd(seed * 5 + k)), dr = rr * (0.12 + 0.12 * rnd(seed * 3 + k));
      g.beginPath(); g.arc(px(a + Math.cos(ang) * d), py(b + Math.sin(ang) * d), dr * sx, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    this.dirty = true;
    this.n++;
  }

  // team at a surface point: 0 none, 1 = team 0, 2 = team 1
  _at(s, a, b) {
    const i = Math.floor((a - s.a0) / CELL), j = Math.floor((b - s.b0) / CELL);
    if (i < 0 || j < 0 || i >= s.nu || j >= s.nv) return 0;
    return s.grid[j * s.nu + i];
  }
  // the ink under feet standing on the top (the rim: none)
  groundTeam(p) {
    const L = this._local(p, _l);
    return this._at(this.surf[0], L.x, L.z);
  }
  // the ink on a wall at a world point with the wall's outward normal (from a raycast)
  wallTeam(p, n) {
    const L = this._local(p, _l), T = this.T, c = Math.cos(T.yaw), s = Math.sin(T.yaw);
    const nx = n.x * c - n.z * s, nz = n.x * s + n.z * c;
    if (Math.abs(nx) >= Math.abs(nz)) return nx > 0 ? this._at(this.surf[1], L.z, L.y) : this._at(this.surf[2], -L.z, L.y);
    return nz > 0 ? this._at(this.surf[3], -L.x, L.y) : this._at(this.surf[4], L.x, L.y);
  }
  // where a surface sits in the canvas, as UVs (for the look)
  uv(i) { const [x, y, w, h] = this.surf[i].rect; return [x / this.W, 1 - (y + h) / this.Hc, (x + w) / this.W, 1 - y / this.Hc]; }

  // the ink's look: one mesh of five quads (the top inside the rim, the four walls) just off the box's faces, drawn from
  // the canvas; in box space (the caller places it at the frame)
  inkMesh(mat) {
    const hx = this.hx, hz = this.hz, H = this.H, pos = [], uv = [], idx = [], e = 0.006;
    const place = [
      (a, b) => [a, H + e, b], (a, b) => [hx + e, b, a], (a, b) => [-hx - e, b, -a], (a, b) => [-a, b, hz + e], (a, b) => [a, b, -hz - e],
    ];
    this.surf.forEach((sf, i) => {
      const [rx, ry, rw, rh] = sf.rect, k = pos.length / 3;
      for (const [a, b] of [[sf.a0, sf.b0], [sf.a1, sf.b0], [sf.a1, sf.b1], [sf.a0, sf.b1]]) {
        pos.push(...place[i](a, b));
        const px = rx + ((a - sf.a0) / (sf.a1 - sf.a0)) * rw, py = ry + rh - ((b - sf.b0) / (sf.b1 - sf.b0)) * rh;
        uv.push(px / this.W, 1 - py / this.Hc);
      }
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  }
}

// Tower Command's tower: its platform's four walls and deck, inside the grate that rims the top
export class TowerPaint extends BoxPaint {
  constructor(T) { super(T, { hx: TOWER.platformR, hz: TOWER.platformR, h: TOWER.platformH, rim: GRATE }); }
}
const _l = new THREE.Vector3();
