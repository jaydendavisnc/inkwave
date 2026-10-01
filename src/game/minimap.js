// Top-down turf map (stream 6). The HUD frames `canvas` (corner + TAB-expanded) and draws player dots / super-jump
// beacons on top in normalised canvas space, so `w/h` === canvas size and `toCanvas` is the only projection.
//
// Layers (all 2D canvas, allocation-free per frame):
//   base   (per layout + viewer side)  sea with swell, height-tinted surfaces from each block's colour, hillshaded ramps,
//                                      soft sun shadows cast by tall blocks, contact AO, crisp rims, grates, props
//   ink    (≤ 6 Hz, on paint.version)  bilinear team field → smooth anti-aliased blobs, glossy embossed rims
//   flash  (with ink)                  freshly claimed pixels, faded out over ~0.4 s
//   live   (every frame)               spawn pads, bombs (arming blink), tempest clouds + rain radius, slam shock rings,
//                                      super-jump landing targets + your team's jump travel lines (_jumpLines),
//                                      respawn pulses (splats: the HUD's death markers)
import { G, on } from '../core/ctx.js';
import { SPECIALS, SUB } from '../config.js';

const TAU = Math.PI * 2;
let CURRENT = null;          // the live Minimap (a new one is built per stage layout)
const fxList = [];           // transient map effects (shared; cleared when the layout changes)
const live = () => { const m = G.match; return !!(m && !m.attract); };
function pushFx(fx) { if (!CURRENT || !live()) return; if (fxList.length > 40) fxList.shift(); fxList.push(fx); }
on('special:slam', ({ actor, pos, radius }) => pushFx({ kind: 'slam', x: pos.x, z: pos.z, team: actor ? actor.team : 0, r: radius || SPECIALS.slam.radius, t: 0, life: 0.9 }));
on('bomb:explode', ({ pos, team, radius }) => pushFx({ kind: 'boom', x: pos.x, z: pos.z, team: team | 0, r: radius || SUB.bomb.radius, t: 0, life: 0.7 }));
on('superjump', ({ actor, phase, to, home }) => { if (phase === 'flight' && to && !home) pushFx({ kind: 'jump', x: to.x, z: to.z, team: actor.team, actor, t: 0, life: 3 }); });
on('superjump:land', ({ actor }) => { for (const f of fxList) if (f.kind === 'jump' && f.actor === actor) f.life = Math.min(f.life, f.t + 0.35); });
on('respawn', ({ actor }) => { const p = G.level?.spawnPads?.[actor.team]; if (p) pushFx({ kind: 'spawn', x: p.x, z: p.z, team: actor.team, t: 0, life: 0.8 }); });
// (splats: the HUD draws the death markers over this canvas — a squid-skull in the victim's ink, main.js deathMarks)

// ---- live super jumps (the travel line on this map and the TAB map diorama). Mirrors Actor.superJump /
// _updateSuperJump: a 0.75 s charge in place, then a flight of s.dur s from s.from to s.to (horizontal ease-in-out,
// vertical sine lob). While charging, the landing is the target's: a teammate's jumpAnchor() or a fixed point.
// superJumpInfo(actor, from, to, out) fills from / to ({x,y,z}) and out = { phase, k (0..1 of the phase), e (horizontal
// progress 0..1, flight only), home } and returns out — or null when the actor isn't super jumping. No allocation.
export const SJ_CHARGE = 0.75;
export const sjEase = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export function superJumpInfo(a, from, to, out) {
  const s = a && a.superJumpState;
  if (!s) return null;
  let f, d;
  if (s.phase === 'flight') { f = s.from; d = s.to; }
  else {
    const tg = s.target;
    d = tg && tg.pos && tg.pos.isVector3 ? (tg.jumpAnchor ? tg.jumpAnchor() : tg.pos) : tg;
    f = a.pos;
  }
  if (!f || !d || !Number.isFinite(d.x + d.z)) return null;
  from.x = f.x; from.y = f.y; from.z = f.z; to.x = d.x; to.y = d.y; to.z = d.z;
  const flight = s.phase === 'flight';
  out.phase = flight ? 'flight' : 'charge';
  out.k = Math.min(1, Math.max(0, flight ? s.t / (s.dur || 1) : s.t / SJ_CHARGE));
  out.e = flight ? sjEase(out.k) : 0;
  out.home = !!s.home;
  return out;
}
const _jf = { x: 0, y: 0, z: 0 }, _jt = { x: 0, y: 0, z: 0 }, _ji = { phase: '', k: 0, e: 0, home: false }, _ja = { x: 0, y: 0 }, _jb = { x: 0, y: 0 };

// linear → sRGB 0..255
function lin2s(c) { return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const _a = { x: 0, y: 0 }, _b = { x: 0, y: 0 };
export class Minimap {
  constructor(level, paint, pxPerM = 7) {
    this.level = level; this.paint = paint;
    const B = level.bounds;
    this.s = pxPerM;
    this.w = Math.round((B.maxX - B.minX) * pxPerM);
    this.h = Math.round((B.maxZ - B.minZ) * pxPerM);
    const mk = () => { const c = document.createElement('canvas'); c.width = this.w; c.height = this.h; return c; };
    this.canvas = mk();
    this.ctx = this.canvas.getContext('2d');
    this.base = mk(); this.bctx = this.base.getContext('2d', { willReadFrequently: true });
    this.inkC = mk(); this.ictx = this.inkC.getContext('2d');
    this.flashC = mk(); this.fctx = this.flashC.getContext('2d');
    this.inkImg = this.ictx.createImageData(this.w, this.h);
    this.flashImg = this.fctx.createImageData(this.w, this.h);
    this.flip = false;
    this.version = -1;
    this.timer = 0;
    this.time = 0;
    this.flashT = 9;
    this._team = [null, null];
    CURRENT = this;
    fxList.length = 0;
    this._built = false;
    this._band = 0;
    // the raster + shading pass (~0.1–0.3 s) runs when the browser is idle after loading; a match forces it early
    const idle = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 1500 }) : (fn) => setTimeout(fn, 60);
    idle(() => { if (!this._built && CURRENT === this) this._build(); });
  }

  setViewerTeam(team) {
    this.viewerTeam = team;
    const f = team === 1;
    if (f === this.flip && this._built) { this.version = -1; return; }
    this.flip = f;
    this._build();
    this.version = -1;
  }
  ensure() { if (!this._built) this._build(); }

  // world → canvas px (float)
  toCanvas(x, z, out = { x: 0, y: 0 }) {
    const B = this.level.bounds;
    let cx = (B.maxX - x) * this.s, cy = (B.maxZ - z) * this.s;
    if (this.flip) { cx = this.w - cx; cy = this.h - cy; }
    out.x = cx; out.y = cy;
    return out;
  }
  _worldX(px) { const B = this.level.bounds; const c = this.flip ? this.w - px : px; return B.maxX - c / this.s; }
  _worldZ(py) { const B = this.level.bounds; const c = this.flip ? this.h - py : py; return B.maxZ - c / this.s; }

  // ------------------------------------------------------------------------------------------ static layers
  _build() {
    const W = this.w, H = this.h, N = W * H, lvl = this.level, s = this.s;
    const hgt = (this.hgt = new Float32Array(N).fill(-99));
    const top = (this.topBlock = new Int32Array(N).fill(-1));
    const nrm = (this.nrm = new Float32Array(N * 2));
    const tc = { x: 0, y: 0 };
    // 1) rasterise every solid block's top surface (ramps included) → height + owning block + normal
    for (const b of lvl.blocks) {
      if (!b.solid || b.dynamic) continue;   // (a moving block — the tower — is drawn as its own marker)
      if (b.hidden && (b.roof || b.perch) && b.aabbMin.y > 3) continue;   // overhead steel (crane girders, booms): not over the turf
      const n = b.axes[1];
      if (n.y < 0.45) continue;
      const tx = b.center.x + n.x * b.half.y, ty = b.center.y + n.y * b.half.y, tz = b.center.z + n.z * b.half.y;
      this.toCanvas(b.aabbMax.x, b.aabbMax.z, tc); let x0 = tc.x, y0 = tc.y;
      this.toCanvas(b.aabbMin.x, b.aabbMin.z, tc); let x1 = tc.x, y1 = tc.y;
      if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0];
      const px0 = Math.max(0, Math.floor(x0)), px1 = Math.min(W - 1, Math.ceil(x1)), py0 = Math.max(0, Math.floor(y0)), py1 = Math.min(H - 1, Math.ceil(y1));
      const a0 = b.axes[0], a2 = b.axes[2];
      const cnx = this.flip ? n.x : -n.x, cny = this.flip ? n.z : -n.z;   // normal in canvas space
      for (let py = py0; py <= py1; py++) {
        const z = this._worldZ(py + 0.5);
        for (let px = px0; px <= px1; px++) {
          const x = this._worldX(px + 0.5);
          const y = ty - (n.x * (x - tx) + n.z * (z - tz)) / n.y;
          const dx = x - b.center.x, dy = y - 0.01 - b.center.y, dz = z - b.center.z;
          if (Math.abs(dx * a0.x + dy * a0.y + dz * a0.z) > b.half.x || Math.abs(dx * a2.x + dy * a2.y + dz * a2.z) > b.half.z) continue;
          const i = py * W + px;
          if (y > hgt[i]) { hgt[i] = y; top[i] = b.id; nrm[i * 2] = cnx; nrm[i * 2 + 1] = cny; }
        }
      }
    }
    // 2) turf pixels → paint cells (bilinear field: base cell + fractions + neighbour steps)
    const P = this.paint;
    const faces = P.paintFaces.filter((f) => f.turf).sort((a, b) => a.origin.y - b.origin.y);
    const cell = (this.pixCell = new Int32Array(N).fill(-1));
    const fx = (this.pixFx = new Uint8Array(N)), fy = (this.pixFy = new Uint8Array(N));
    const sx = (this.pixSx = new Int8Array(N)), sy = (this.pixSy = new Int32Array(N));
    for (const f of faces) {
      if (f.n.y < 0.45) continue;
      const ux = f.u.x, uz = f.u.z, vx = f.v.x, vz = f.v.z;
      const uh = ux * ux + uz * uz, vh = vx * vx + vz * vz;
      if (uh < 1e-4 || vh < 1e-4) continue;
      // canvas bbox of the face
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const [a, c] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        this.toCanvas(f.origin.x + ux * f.su * a + vx * f.sv * c, f.origin.z + uz * f.su * a + vz * f.sv * c, tc);
        bx0 = Math.min(bx0, tc.x); bx1 = Math.max(bx1, tc.x); by0 = Math.min(by0, tc.y); by1 = Math.max(by1, tc.y);
      }
      const px0 = Math.max(0, Math.floor(bx0)), px1 = Math.min(W - 1, Math.ceil(bx1)), py0 = Math.max(0, Math.floor(by0)), py1 = Math.min(H - 1, Math.ceil(by1));
      const faceTop = f.origin.y + Math.max(0, f.u.y * f.su) + Math.max(0, f.v.y * f.sv);
      for (let py = py0; py <= py1; py++) {
        const z = this._worldZ(py + 0.5);
        for (let px = px0; px <= px1; px++) {
          const i = py * W + px;
          if (hgt[i] > faceTop + 0.05) continue;             // something taller covers this face here
          const x = this._worldX(px + 0.5);
          const dx = x - f.origin.x, dz = z - f.origin.z;
          const a = (dx * ux + dz * uz) / uh, c = (dx * vx + dz * vz) / vh;   // metres along u / v
          if (a < 0 || c < 0 || a >= f.su || c >= f.sv) continue;
          const cu = a / f.cu - 0.5, cv = c / f.cv - 0.5;
          let iu = Math.floor(cu), iv = Math.floor(cv);
          let tu = cu - iu, tv = cv - iv;
          if (iu < 0) { iu = 0; tu = 0; } if (iv < 0) { iv = 0; tv = 0; }
          if (iu >= f.nu - 1) { iu = f.nu - 1; tu = 0; } if (iv >= f.nv - 1) { iv = f.nv - 1; tv = 0; }
          const k = f.grid + iv * f.nu + iu;
          if (P.dead[k]) continue;
          cell[i] = k; fx[i] = Math.round(tu * 255); fy[i] = Math.round(tv * 255);
          sx[i] = iu < f.nu - 1 && !P.dead[k + 1] ? 1 : 0;
          sy[i] = iv < f.nv - 1 && !P.dead[k + f.nu] ? f.nu : 0;
        }
      }
    }
    this._drawBase();
    this.owner = new Uint8Array(N);
    this._built = true;
  }

  _drawBase() {
    const W = this.w, H = this.h, N = W * H, hgt = this.hgt, top = this.topBlock, nrm = this.nrm, lvl = this.level, s = this.s;
    const img = this.bctx.createImageData(W, H), d = img.data;
    const theme = G.game?.theme || G.game?.mapDef?.theme || 'day';
    const dusk = theme === 'sunset';
    // sun from the top-left of the map; shadows fall toward the bottom-right
    const Lx = -0.62, Ly = -0.78;
    const shadowSlope = 0.11;           // metres of height per pixel of shadow length
    const blockCol = new Map();
    const colOf = (id) => {
      let c = blockCol.get(id);
      if (c) return c;
      const b = lvl.blocks[id];
      const cr = lin2s(b.color.r), cg = lin2s(b.color.g), cb = lin2s(b.color.b);
      // map palette: the block's own tint, lifted toward warm paper so ink stays the loudest thing
      const k = b.hidden ? 0.35 : 0.52;
      const paper = dusk ? [236, 214, 196] : [242, 236, 222];
      c = [cr + (paper[0] - cr) * k, cg + (paper[1] - cg) * k, cb + (paper[2] - cb) * k];
      if (b.grate) c = [150, 162, 176];
      if (b.hidden) c = [c[0] * 0.78, c[1] * 0.78, c[2] * 0.84];
      blockCol.set(id, c);
      return c;
    };
    const sea0 = dusk ? [70, 64, 120] : [36, 104, 170], sea1 = dusk ? [104, 86, 150] : [62, 146, 206];
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const i = py * W + px, o = i * 4, h = hgt[i];
        if (top[i] < 0) {
          // sea: gradient + soft swell bands + foam hugging the dock
          const wave = 0.5 + 0.5 * Math.sin((px * 0.9 + py * 0.55) * 0.13) * Math.sin(py * 0.05 + px * 0.012);
          let near = 0;
          for (let r = 1; r <= 6 && !near; r++) {
            if ((px - r >= 0 && top[i - r] >= 0) || (px + r < W && top[i + r] >= 0) || (py - r >= 0 && top[i - r * W] >= 0) || (py + r < H && top[i + r * W] >= 0)) near = 1 - (r - 1) / 6;
          }
          const k = 0.25 + wave * 0.35;
          d[o] = sea0[0] + (sea1[0] - sea0[0]) * k + near * 60;
          d[o + 1] = sea0[1] + (sea1[1] - sea0[1]) * k + near * 55;
          d[o + 2] = sea0[2] + (sea1[2] - sea0[2]) * k + near * 40;
          d[o + 3] = 255;
          continue;
        }
        const b = lvl.blocks[top[i]];
        const c = colOf(top[i]);
        // height tint: trenches darker, raised decks lighter
        let lum = 0.9 + Math.max(-0.14, Math.min(0.16, h * 0.035));
        // hillshade for tilted surfaces (ramps)
        const nx = nrm[i * 2], ny = nrm[i * 2 + 1];
        if (nx * nx + ny * ny > 0.002) lum *= 1 + (nx * Lx + ny * Ly) * 1.6;
        // soft cast shadow from taller geometry toward the light
        let sh = 0;
        for (let k = 3; k <= 27; k += 3) {
          const qx = Math.round(px + Lx * k), qy = Math.round(py + Ly * k);
          if (qx < 0 || qy < 0 || qx >= W || qy >= H) break;
          const dh = hgt[qx + qy * W] - h - k * shadowSlope;
          if (dh > 0) sh = Math.max(sh, Math.min(1, dh / 0.5) * (1 - k / 30));
        }
        lum *= 1 - sh * 0.3;
        // contact AO at the foot of walls + crisp rims on raised edges
        let hi = 0, lo = 0;
        for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
          if ((!ox && !oy) || Math.abs(ox) + Math.abs(oy) > 2) continue;
          const qx = px + ox, qy = py + oy;
          if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
          const q = qx + qy * W;
          const dh = (top[q] < 0 ? -3 : hgt[q]) - h;
          const wgt = 1 / (Math.abs(ox) + Math.abs(oy));
          if (dh > 0.3) hi += wgt * Math.min(1, dh);
          if (dh < -0.3 && Math.abs(ox) + Math.abs(oy) === 1) lo = 1;
        }
        lum *= 1 - Math.min(0.28, hi * 0.07);
        let r = c[0] * lum, g = c[1] * lum, bl = c[2] * lum;
        if (lo) { r *= 0.42; g *= 0.4; bl *= 0.48; }               // dark rim where this surface drops away
        if (b.grate) {
          const hatch = ((px + py) % 4 < 1.5) || ((px - py + 4000) % 4 < 1.5);
          if (hatch) { r *= 0.62; g *= 0.64; bl *= 0.7; }
        }
        d[o] = Math.min(255, r); d[o + 1] = Math.min(255, g); d[o + 2] = Math.min(255, bl); d[o + 3] = 255;
      }
    }
    this.bctx.putImageData(img, 0, 0);
    // subtle map grid (5 m) over the deck for scale
    const c = this.bctx;
    c.save();
    c.globalAlpha = 0.07; c.strokeStyle = '#1b1830'; c.lineWidth = 1;
    const step = 5 * s;
    c.beginPath();
    for (let x = (this.w % step) / 2; x < this.w; x += step) { c.moveTo(Math.round(x) + 0.5, 0); c.lineTo(Math.round(x) + 0.5, this.h); }
    for (let y = (this.h % step) / 2; y < this.h; y += step) { c.moveTo(0, Math.round(y) + 0.5); c.lineTo(this.w, Math.round(y) + 0.5); }
    c.stroke();
    c.restore();
  }

  // ------------------------------------------------------------------------------------------ ink
  _teamRGB() {
    const ca = G.teamColors?.[0], cb = G.teamColors?.[1];
    if (!ca || !cb) return [[255, 138, 20], [47, 91, 255]];
    return [[lin2s(ca.r), lin2s(ca.g), lin2s(ca.b)], [lin2s(cb.r), lin2s(cb.g), lin2s(cb.b)]];
  }

  // Ink refresh for rows [y0, y1). The full map is refreshed over INK_BANDS consecutive frames so no single frame
  // pays for the whole bilinear field + emboss (≈ 1/3 of the work per frame).
  _drawInk(y0 = 0, y1 = this.h) {
    const W = this.w, H = this.h, N = W * H;
    const grid = this.paint.grid, cell = this.pixCell, fxA = this.pixFx, fyA = this.pixFy, sxA = this.pixSx, syA = this.pixSy;
    const d = this.inkImg.data, fd = this.flashImg.data, own = this.owner;
    if (y0 === 0) this._rgb = this._teamRGB();
    const [A, Bc] = this._rgb || this._teamRGB();
    const al = this._alpha || (this._alpha = new Float32Array(N));
    const tm = this._tm || (this._tm = new Uint8Array(N));
    const tt = this._tt || (this._tt = new Uint8Array(N));
    const a0 = Math.max(0, y0 - 1) * W, a1 = Math.min(H, y1 + 1) * W;
    for (let i = a0; i < a1; i++) {
      const k = cell[i];
      if (k < 0) { al[i] = 0; continue; }
      const sx = sxA[i], sy = syA[i];
      const g00 = grid[k], g10 = grid[k + sx], g01 = grid[k + sy], g11 = grid[k + sx + sy];
      if (g00 === g10 && g00 === g01 && g00 === g11) {           // uniform cell block: no edge here (fast path)
        al[i] = g00 ? 1 : 0; tm[i] = g00; tt[i] = g00 || 1;
        continue;
      }
      const tx = fxA[i] * (1 / 255), ty = fyA[i] * (1 / 255);
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const fa = (g00 === 1 ? w00 : 0) + (g10 === 1 ? w10 : 0) + (g01 === 1 ? w01 : 0) + (g11 === 1 ? w11 : 0);
      const fb = (g00 === 2 ? w00 : 0) + (g10 === 2 ? w10 : 0) + (g01 === 2 ? w01 : 0) + (g11 === 2 ? w11 : 0);
      const t = fa >= fb ? 1 : 2, f = t === 1 ? fa : fb;
      const a = smooth(0.34, 0.62, f);
      al[i] = a; tm[i] = a > 0.5 ? t : 0; tt[i] = t;
    }
    let flashes = 0;
    for (let py = y0; py < y1; py++) {
      for (let px = 0; px < W; px++) {
        const i = py * W + px, o = i * 4, a = al[i];
        if (a <= 0.003) { d[o + 3] = 0; fd[o + 3] = 0; own[i] = 0; continue; }
        const c = tt[i] === 2 ? Bc : A;
        // emboss: highlight on the lit (top-left) rim, soft shade on the far rim → reads as thick glossy ink
        const up = px > 0 && py > 0 ? al[i - W - 1] : a, dn = px < W - 1 && py < H - 1 ? al[i + W + 1] : a;
        const lit = a - up > 0 ? a - up : 0, dark = a - dn > 0 ? a - dn : 0;
        const k = 0.94 - dark * 0.32, add = lit * 150;
        d[o] = c[0] * k + add; d[o + 1] = c[1] * k + add; d[o + 2] = c[2] * k + add;   // Uint8Clamped clamps
        d[o + 3] = a * 255;
        const now = tm[i];
        if (now && own[i] !== now) { fd[o] = 255; fd[o + 1] = 255; fd[o + 2] = 255; fd[o + 3] = 170; flashes++; }
        else fd[o + 3] = 0;
        own[i] = now;
      }
    }
    this.ictx.putImageData(this.inkImg, 0, 0, 0, y0, W, y1 - y0);
    this.fctx.putImageData(this.flashImg, 0, 0, 0, y0, W, y1 - y0);
    if (flashes && !this._quiet) this.flashT = 0;
  }

  // ------------------------------------------------------------------------------------------ per frame
  update(dt, force = false) {
    if (!this._built) this._build();
    this.time += dt;
    this.timer -= dt;
    const teamKey = G.teamHex ? G.teamHex[0] + G.teamHex[1] : '';
    if (teamKey !== this._teamKey) { this._teamKey = teamKey; this.version = -1; }
    const theme = G.game?.theme || G.game?.mapDef?.theme || 'day';
    if (theme !== this._theme) { const had = this._theme; this._theme = theme; if (had) this._drawBase(); }
    const BANDS = 3;
    if (this._band > 0) {
      const b = this._band;
      this._drawInk(Math.floor((this.h * b) / BANDS), Math.floor((this.h * (b + 1)) / BANDS));
      this._band = b + 1 >= BANDS ? 0 : b + 1;
      if (!this._band) this._quiet = false;
    } else if (force || (this.timer <= 0 && this.version !== this.paint.version)) {
      this.timer = 0.15;
      const first = this.version === -1;
      this.version = this.paint.version;
      if (first || force) { this._quiet = first; this._drawInk(0, this.h); this._quiet = false; if (first) this.flashT = 9; }
      else { this._drawInk(0, Math.floor(this.h / BANDS)); this._band = 1; }
    }
    this.flashT += dt;
    this._compose(dt);
  }

  _compose(dt) {
    const c = this.ctx, W = this.w, H = this.h, s = this.s;
    c.globalAlpha = 1;
    c.drawImage(this.base, 0, 0);
    c.drawImage(this.inkC, 0, 0);
    if (this.flashT < 0.45) { c.globalAlpha = (1 - this.flashT / 0.45) * 0.85; c.drawImage(this.flashC, 0, 0); c.globalAlpha = 1; }
    const hex = G.teamHex || ['#ff8a14', '#2f5bff'];
    const t = this.time;
    // Zone Control: every zone's outline — the operational objective in its holder's ink (white while neutral), the
    // others as faint dashed ghosts
    const Zc = G.match && !G.match.attract ? G.match.zones : null;
    if (Zc) this._drawZones(c, Zc, hex, t);
    // Tower Command: the path (the stretch ahead lit in the ink of the team in control), checkpoints and goals; the
    // tower itself goes on top of everything (below)
    const Tw = G.match && !G.match.attract ? G.match.tower : null;
    if (Tw) this._drawTowerPath(c, Tw, hex, t);
    const tc = this._tc || (this._tc = { x: 0, y: 0 });
    // spawn pads
    const pads = this.level.spawnPads || [];
    for (let team = 0; team < 2; team++) {
      const p = pads[team]; if (!p) continue;
      this.toCanvas(p.x, p.z, tc);
      const r = (this.level.spawnBarrier || 4) * s * 0.62;
      c.beginPath(); c.arc(tc.x, tc.y, r, 0, TAU);
      c.fillStyle = hex[team]; c.globalAlpha = 0.28; c.fill(); c.globalAlpha = 1;
      c.lineWidth = 3; c.strokeStyle = '#15121c'; c.stroke();
      c.lineWidth = 1.6; c.strokeStyle = '#ffffff'; c.stroke();
      c.beginPath(); c.arc(tc.x, tc.y, r * 0.45, 0, TAU); c.fillStyle = hex[team]; c.fill();
      c.lineWidth = 2.5; c.strokeStyle = '#15121c'; c.stroke();
    }
    // transient effects
    for (let i = fxList.length - 1; i >= 0; i--) {
      const f = fxList[i];
      f.t += dt;
      if (f.t >= f.life) { fxList.splice(i, 1); continue; }
      this.toCanvas(f.x, f.z, tc);
      const k = f.t / f.life, col = hex[f.team] || '#fff';
      if (f.kind === 'slam' || f.kind === 'boom') {
        const r = f.r * s * (0.3 + 0.7 * (1 - Math.pow(1 - k, 3)));
        c.globalAlpha = (1 - k) * 0.45; c.fillStyle = col; c.beginPath(); c.arc(tc.x, tc.y, r, 0, TAU); c.fill();
        c.globalAlpha = 1 - k; c.lineWidth = f.kind === 'slam' ? 4 : 3; c.strokeStyle = '#ffffff'; c.stroke();
        c.globalAlpha = 1;
      } else if (f.kind === 'jump') {
        // (your team's jumps in the air: the travel line below draws this landing target)
        if (f.actor && f.actor.superJumpState && f.actor.team === (this.viewerTeam ?? 0)) continue;
        const pulse = 0.5 + 0.5 * Math.sin(t * 10);
        const r = s * (1.1 + 0.35 * pulse);
        c.lineWidth = 3; c.strokeStyle = '#15121c'; c.beginPath(); c.arc(tc.x, tc.y, r + 1, 0, TAU); c.stroke();
        c.lineWidth = 2; c.strokeStyle = col; c.beginPath(); c.arc(tc.x, tc.y, r, 0, TAU); c.stroke();
        c.beginPath(); c.moveTo(tc.x - r * 1.5, tc.y); c.lineTo(tc.x - r * 0.5, tc.y); c.moveTo(tc.x + r * 0.5, tc.y); c.lineTo(tc.x + r * 1.5, tc.y);
        c.moveTo(tc.x, tc.y - r * 1.5); c.lineTo(tc.x, tc.y - r * 0.5); c.moveTo(tc.x, tc.y + r * 0.5); c.lineTo(tc.x, tc.y + r * 1.5); c.stroke();
      } else if (f.kind === 'spawn') {
        const r = s * (2 + 5 * k);
        c.globalAlpha = 1 - k; c.lineWidth = 3; c.strokeStyle = '#ffffff'; c.beginPath(); c.arc(tc.x, tc.y, r, 0, TAU); c.stroke(); c.globalAlpha = 1;
      }
    }
    // ink tempest clouds
    const P = G.projectiles;
    if (P && P.clouds) for (const cl of P.clouds) {
      const pos = cl.group && cl.group.position; if (!pos) continue;
      this.toCanvas(pos.x, pos.z, tc);
      const col = hex[cl.team] || '#fff';
      const r = (SPECIALS.storm.radius || 3.4) * s;
      const left = Math.max(0, 1 - cl.t / (cl.dur || 6.5));
      c.globalAlpha = 0.22; c.fillStyle = col; c.beginPath(); c.arc(tc.x, tc.y, r, 0, TAU); c.fill(); c.globalAlpha = 1;
      c.setLineDash([4, 4]); c.lineDashOffset = -t * 12; c.lineWidth = 2; c.strokeStyle = col; c.stroke(); c.setLineDash([]);
      c.lineWidth = 3; c.strokeStyle = '#ffffff'; c.beginPath(); c.arc(tc.x, tc.y, r + 3, -Math.PI / 2, -Math.PI / 2 + left * TAU); c.stroke();
      this._cloud(c, tc.x, tc.y - 1, s * 1.1, col);
    }
    // bombs: team orb; armed ones blink faster as the fuse runs out
    if (P && P.bombs) for (const b of P.bombs) {
      this.toCanvas(b.pos.x, b.pos.z, tc);
      const col = hex[b.team] || '#fff';
      if (b.kind === 'storm') { this._cloud(c, tc.x, tc.y, s * 0.8, col); continue; }
      const armed = b.fuse >= 0;
      const k = armed ? 1 - b.fuse / (SUB.bomb.fuse || 1) : 0;
      if (armed) {
        const blink = 0.5 + 0.5 * Math.sin(b.age * (10 + k * 30));
        c.globalAlpha = 0.35 + blink * 0.4; c.fillStyle = col; c.beginPath(); c.arc(tc.x, tc.y, (SUB.bomb.radius || 3) * s * (0.5 + 0.5 * k), 0, TAU); c.fill(); c.globalAlpha = 1;
      }
      const r = s * 0.62;
      c.beginPath(); c.arc(tc.x, tc.y, r + 1.5, 0, TAU); c.fillStyle = '#15121c'; c.fill();
      c.beginPath(); c.arc(tc.x, tc.y, r, 0, TAU); c.fillStyle = col; c.fill();
      c.beginPath(); c.arc(tc.x - r * 0.3, tc.y - r * 0.3, r * 0.3, 0, TAU); c.fillStyle = 'rgba(255,255,255,.75)'; c.fill();
    }
    // sub devices: your team's beacons + mines (mines stay secret from the other side), everyone's sprinklers,
    // curtains and clouds
    const S = G.subs, me = this.viewerTeam ?? 0;
    if (S) for (const it of S.items) {
      const st = it.state;
      if (st === 'dead' || st === 'fly') continue;
      if ((st === 'beacon' || st === 'mine') && it.team !== me) continue;
      this.toCanvas(it.pos.x, it.pos.z, tc);
      const col = hex[it.team] || '#fff';
      if (st === 'curtain') {
        this.toCanvas(it.pos.x + it.tan.x * it.sub.width / 2, it.pos.z + it.tan.z * it.sub.width / 2, _a);
        this.toCanvas(it.pos.x - it.tan.x * it.sub.width / 2, it.pos.z - it.tan.z * it.sub.width / 2, _b);
        c.lineCap = 'round'; c.lineWidth = s * 0.55 + 2; c.strokeStyle = '#15121c'; c.beginPath(); c.moveTo(_a.x, _a.y); c.lineTo(_b.x, _b.y); c.stroke();
        c.lineWidth = s * 0.55; c.strokeStyle = col; c.stroke();
        continue;
      }
      if (st === 'cloud' || st === 'mist') {
        c.globalAlpha = 0.3; c.fillStyle = st === 'mist' ? '#6b4a8c' : col;
        c.beginPath(); c.arc(tc.x, tc.y, it.sub.radius * s, 0, TAU); c.fill(); c.globalAlpha = 1;
        continue;
      }
      const r = s * (st === 'beacon' ? 0.75 : 0.55);
      c.beginPath(); c.arc(tc.x, tc.y, r + 1.5, 0, TAU); c.fillStyle = '#15121c'; c.fill();
      c.beginPath();
      if (st === 'beacon') { c.moveTo(tc.x, tc.y - r * 1.2); c.lineTo(tc.x + r, tc.y + r * 0.7); c.lineTo(tc.x - r, tc.y + r * 0.7); c.closePath(); }
      else c.arc(tc.x, tc.y, r, 0, TAU);
      c.fillStyle = col; c.fill();
      if (st === 'spray') { c.lineWidth = 1.5; c.strokeStyle = col; c.globalAlpha = 0.5; c.beginPath(); c.arc(tc.x, tc.y, it.sub.sprayRadius * s * 0.8, 0, TAU); c.stroke(); c.globalAlpha = 1; }
      // a beacon's jumps left: a dot under it per jump (lit) out of its two (dark: used) — the last one stands alone
      if (st === 'beacon') {
        const n = it.sub.uses || 2, pr = Math.max(1.2, s * 0.22);
        for (let i = 0; i < n; i++) {
          const px = tc.x + (i - (n - 1) / 2) * pr * 2.6, py = tc.y + r * 1.25 + pr * 1.6;
          c.beginPath(); c.arc(px, py, pr + 1, 0, TAU); c.fillStyle = '#15121c'; c.fill();
          c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fillStyle = i < it.uses ? col : '#4a4458'; c.fill();
        }
      }
    }
    // specials: vortex targets + funnels, sound beams, bubbles, cheer orbs, the local strike cursor
    G.specials?.drawMap(c, this, tc, s, hex, t);
    c.globalAlpha = 1;
    if (Tw) this._drawTowerIcon(c, Tw, hex, t);
    this._jumpLines(c, s, hex, t, me);
    void W; void H;
  }

  // Super jumps in progress on your team: a travel line from the take-off to the landing spot. While charging it
  // reaches out to the landing (the target ring closing in on it); in flight ink dots stream toward the landing ahead
  // of the jumper and the flown part fades to a thin trail (your own dot rides the line). Yours bold, teammates' thin.
  // Widths are in metres (× s): the corner map shows this canvas at roughly ⅓ scale.
  _jumpLines(c, s, hex, t, team) {
    const acts = G.match && !G.match.attract ? G.match.actors : null;
    if (!acts) return;
    const A = _ja, B = _jb, J = _ji;
    for (const a of acts) {
      if (!a.alive || a.team !== team || !a.superJumpState || !superJumpInfo(a, _jf, _jt, J)) continue;
      this.toCanvas(_jf.x, _jf.z, A); this.toCanvas(_jt.x, _jt.z, B);
      const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
      const self = !!a.isLocal, col = hex[a.team] || '#ffffff', w = self ? 1 : 0.62;
      const flight = J.phase === 'flight';
      // landing target: a crosshair ring sized to show round the destination teammate's dot (≈ 9 px on the corner
      // map), closing in on the landing while the jump charges; the line stops at its rim
      const pulse = 0.5 + 0.5 * Math.sin(t * 10);
      const lock = flight ? 0 : Math.pow(1 - J.k, 2);
      const r = J.home ? 0 : s * (self ? 4.6 + 0.6 * pulse : 4.4 + 0.3 * pulse) * (1 + lock * 1.3);
      const done = flight ? J.e : 0;
      const reach = Math.max(done, Math.min(flight ? 1 : 1 - Math.pow(1 - J.k, 3), 1 - (r * 0.9) / Math.max(1, len)));   // charge: draws out
      const px = A.x + dx * done, py = A.y + dy * done, rx = A.x + dx * reach, ry = A.y + dy * reach;
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      if (len > 2) {
        if (done > 0.002) {
          c.globalAlpha = self ? 0.7 : 0.4; c.lineWidth = 0.85 * s * w; c.strokeStyle = col;
          c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(px, py); c.stroke();
        }
        if (reach - done > 0.002) {
          c.globalAlpha = self ? 0.62 : 0.4; c.lineWidth = 2.7 * s * w; c.strokeStyle = '#15121c';
          c.beginPath(); c.moveTo(px, py); c.lineTo(rx, ry); c.stroke();
          // dots anchored to the line (not to its moving start), streaming toward the landing
          const gap = 3.1 * s * w;
          c.setLineDash([0.001, gap]); c.lineDashOffset = ((len * done - t * 5.5 * s) % gap + gap) % gap;
          c.globalAlpha = 1; c.lineWidth = 1.55 * s * w; c.strokeStyle = self ? '#ffffff' : col;
          c.stroke();
          if (self) { c.lineWidth = 0.85 * s; c.strokeStyle = col; c.stroke(); }
          c.setLineDash([]);
        }
      }
      if (!J.home) {
        c.globalAlpha = self ? 0.22 : 0.12; c.fillStyle = col; c.beginPath(); c.arc(B.x, B.y, r, 0, TAU); c.fill();
        c.globalAlpha = self ? 1 : 0.7;
        c.lineWidth = (self ? 1.15 : 0.7) * s; c.strokeStyle = '#15121c'; c.stroke();
        c.lineWidth = (self ? 0.6 : 0.36) * s; c.strokeStyle = self ? '#ffffff' : col; c.stroke();
        if (self) {
          const a0 = r * 1.12, a1 = r * 1.5;
          c.beginPath();
          c.moveTo(B.x - a1, B.y); c.lineTo(B.x - a0, B.y); c.moveTo(B.x + a0, B.y); c.lineTo(B.x + a1, B.y);
          c.moveTo(B.x, B.y - a1); c.lineTo(B.x, B.y - a0); c.moveTo(B.x, B.y + a0); c.lineTo(B.x, B.y + a1);
          c.lineWidth = 0.95 * s; c.strokeStyle = '#15121c'; c.stroke();
          c.lineWidth = 0.48 * s; c.strokeStyle = col; c.stroke();
        }
      }
      c.restore();
    }
  }

  _drawTowerPath(c, T, hex, t) {
    const s = this.s, tc = { x: 0, y: 0 };
    if (this._twFor !== T || this._twFlip !== this.flip) {
      this._twFor = T; this._twFlip = this.flip;
      this._twLine = T.path.line(0.75).map(({ s: d, p }) => { this.toCanvas(p.x, p.z, tc); return { d, x: tc.x, y: tc.y }; });
      const p = new Path2D();
      this._twLine.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)));
      this._twPath = p;
    }
    c.save();
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.globalAlpha = 0.55; c.lineWidth = 1.2 * s; c.strokeStyle = '#15121c'; c.stroke(this._twPath);
    c.globalAlpha = 0.7; c.lineWidth = 0.55 * s; c.strokeStyle = '#f4f0e6'; c.stroke(this._twPath);
    // the stretch it's heading down: from the tower to its next stop, in the controlling team's ink, marching its way
    let end = null;
    if (T.owner >= 0) { const cp = T._nextCp(T.owner), dir = T.owner === 0 ? 1 : -1; end = T.homing ? 0 : cp ? dir * cp.d : dir * T.path.len[T.owner]; }
    else if (T.returning) end = 0;
    if (end != null && Math.abs(end - T.s) > 0.1) {
      const lo = Math.min(T.s, end), hi = Math.max(T.s, end), seg = new Path2D();
      let first = true;
      for (const q of this._twLine) { if (q.d < lo || q.d > hi) continue; if (first) { seg.moveTo(q.x, q.y); first = false; } else seg.lineTo(q.x, q.y); }
      c.globalAlpha = 1; c.lineWidth = 1.05 * s; c.strokeStyle = T.owner >= 0 ? hex[T.owner] : '#ffd54a';
      c.setLineDash([1.4 * s, 0.9 * s]); c.lineDashOffset = (end > T.s ? -1 : 1) * t * 3 * s; c.stroke(seg); c.setLineDash([]);
    }
    // checkpoints (the colour of the team that pushes through them; grey once cleared) and the two goals
    for (const cp of T.cps) {
      const p = T.path.at(cp.team === 0 ? cp.d : -cp.d);
      this.toCanvas(p.x, p.z, tc);
      const r = 0.95 * s;
      c.globalAlpha = 1; c.fillStyle = cp.cleared ? '#8a8d96' : hex[cp.team]; c.strokeStyle = '#15121c'; c.lineWidth = 0.35 * s;
      c.beginPath(); c.moveTo(tc.x, tc.y - r); c.lineTo(tc.x + r, tc.y); c.lineTo(tc.x, tc.y + r); c.lineTo(tc.x - r, tc.y); c.closePath(); c.fill(); c.stroke();
    }
    for (let team = 0; team < 2; team++) {
      const p = T.path.at(team === 0 ? T.path.len[0] : -T.path.len[1]);
      this.toCanvas(p.x, p.z, tc);
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + team * 2);
      c.globalAlpha = 0.35 + 0.25 * pulse; c.fillStyle = hex[team];
      c.beginPath(); c.arc(tc.x, tc.y, 2.3 * s, 0, TAU); c.fill();
      c.globalAlpha = 1; c.lineWidth = 0.45 * s; c.strokeStyle = '#15121c'; c.fillStyle = hex[team];
      c.beginPath(); c.arc(tc.x, tc.y, 1.1 * s, 0, TAU); c.fill(); c.stroke();
    }
    c.restore();
  }
  // the tower: always shown — a badge in the ink of the team in control (warm yellow while neutral), a ring while contested
  _drawTowerIcon(c, T, hex, t) {
    const s = this.s, tc = this.toCanvas(T.pos.x, T.pos.z, { x: 0, y: 0 });
    const col = T.owner >= 0 ? hex[T.owner] : '#ffd54a', R = 1.9 * s;
    c.save();
    c.globalAlpha = 0.35 + 0.2 * Math.sin(t * 5); c.fillStyle = col;
    c.beginPath(); c.arc(tc.x, tc.y, R * 1.7, 0, TAU); c.fill();
    c.globalAlpha = 1; c.fillStyle = '#15121c'; c.beginPath(); c.arc(tc.x, tc.y, R + 0.45 * s, 0, TAU); c.fill();
    c.fillStyle = col; c.beginPath(); c.arc(tc.x, tc.y, R, 0, TAU); c.fill();
    // a little tower glyph: the deck and the mast
    c.fillStyle = '#15121c';
    c.fillRect(tc.x - R * 0.62, tc.y + R * 0.1, R * 1.24, R * 0.38);
    c.fillRect(tc.x - R * 0.1, tc.y - R * 0.62, R * 0.2, R * 0.75);
    c.beginPath(); c.arc(tc.x, tc.y - R * 0.62, R * 0.2, 0, TAU); c.fill();
    if (T.contested) { c.strokeStyle = '#ffffff'; c.lineWidth = 0.5 * s; c.setLineDash([0.8 * s, 0.6 * s]); c.lineDashOffset = -t * 4 * s; c.beginPath(); c.arc(tc.x, tc.y, R * 1.45, 0, TAU); c.stroke(); }
    c.restore();
  }

  _drawZones(c, Z, hex, t) {
    if (this._zFor !== Z || this._zFlip !== this.flip) {
      this._zFor = Z; this._zFlip = this.flip;
      const tc = { x: 0, y: 0 };
      this._zPaths = Z.zones.map((z) => {
        const p = new Path2D();
        for (const part of z.def.polys || [z.def.poly]) {
          part.forEach(([x, zz], i) => { this.toCanvas(x, zz, tc); if (i) p.lineTo(tc.x, tc.y); else p.moveTo(tc.x, tc.y); });
          p.closePath();
        }
        return p;
      });
    }
    const act = Z.active.zones, s = this.s;          // line widths in metres: the corner map shows the canvas at ~⅓ scale
    c.save();
    c.lineJoin = 'round';
    c.setLineDash([1.5 * s, 1.1 * s]);
    for (let i = 0; i < Z.zones.length; i++) {
      if (act.includes(Z.zones[i])) continue;
      const path = this._zPaths[i];
      c.globalAlpha = 0.5; c.lineWidth = 0.95 * s; c.strokeStyle = '#15121c'; c.stroke(path);
      c.globalAlpha = 0.85; c.lineWidth = 0.45 * s; c.strokeStyle = '#ffffff'; c.stroke(path);
    }
    c.setLineDash([]);
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    for (const z of act) {
      const path = this._zPaths[Z.zones.indexOf(z)];
      const held = z.owner === 0 || z.owner === 1, col = held ? hex[z.owner] : '#ffffff';
      c.globalAlpha = (held ? 0.36 : 0.3) + 0.1 * pulse; c.fillStyle = col; c.fill(path);
      c.globalAlpha = 1; c.lineWidth = 1.15 * s; c.strokeStyle = '#15121c'; c.stroke(path);
      c.lineWidth = 0.6 * s; c.strokeStyle = col; c.stroke(path);
      if (!held) { c.setLineDash([0.9 * s, 0.9 * s]); c.lineDashOffset = -t * 2 * s; c.strokeStyle = '#bdb6cc'; c.stroke(path); c.setLineDash([]); }
    }
    c.restore();
  }

  _cross(c, x, y, r) { c.beginPath(); c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); c.stroke(); }
  _cloud(c, x, y, r, col) {
    c.beginPath();
    c.arc(x - r * 0.55, y + r * 0.1, r * 0.55, 0, TAU); c.arc(x + r * 0.55, y + r * 0.1, r * 0.5, 0, TAU); c.arc(x, y - r * 0.25, r * 0.7, 0, TAU);
    c.lineWidth = 3; c.strokeStyle = '#15121c'; c.stroke(); c.fillStyle = col; c.fill();
    c.beginPath(); c.arc(x - r * 0.15, y - r * 0.45, r * 0.25, 0, TAU); c.fillStyle = 'rgba(255,255,255,.6)'; c.fill();
  }
}
