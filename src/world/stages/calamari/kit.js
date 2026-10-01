// Calamari County — shared prop kit (owner: the calamari stage). makeKit(D, H) returns the palette + geometry helpers
// used by the stage's prop builders (buildings.js, railway.js, harbour.js, village.js): plain boxes, colliders, snow
// caps and snow pillows, kawara tile roofs heavy with snow (gable / hip / hip-and-gable), shoji and lattice panels,
// a stroke font for signage (raised or painted letters, lit at dusk). H = PropKit's PACK_HELPERS (THREE + helpers),
// D = the prop definition table (for composing sub-props). Imports nothing (THREE comes in through H).
export function makeKit(D, H) {
  const { THREE, col, shade, mixc, extrudeGeo, puffGeo, PI, TAU, HP, P3 } = H;
  const NS = (m) => (H.noShadow ? H.noShadow(m) : m);

  // ------------------------------------------------------------------------------------------ palette
  // winter village: weathered cedar, white plaster, blue-grey kawara, snow; the accents (noren indigo, post-box red,
  // the railcar's county livery, lantern light) stay below the team inks
  const K = {
    cedar: '#5a4333', cedarDk: '#3d2d23', cedarLt: '#7b5f49', cedarGrey: '#6e6358', beam: '#4a372b',
    plaster: '#ece7dc', plasterSh: '#d8d1c3', plasterWarm: '#eadfca', render: '#d9d4ca',
    kawara: '#4b5561', kawaraDk: '#353c45', kawaraLt: '#66717d', copper: '#6f8f86',
    stone: '#a8a49b', stoneDk: '#817d75', stoneLt: '#c6c2b8', granite: '#9c9a95', moss: '#6e7a5a',
    snow: '#f4f7fa', snowSh: '#e1e8f0', snowDk: '#c9d4df', ice: '#cfe4ee', iceDk: '#9fc2d4', slush: '#b9bec4',
    paper: '#efe6d0', paperDk: '#d8ccb0', lit: '#ffe0b0', litWarm: '#f7cf94', glass: '#2d3a45', glassLt: '#4c5f6e',
    indigo: '#2d3f63', indigoLt: '#46608c', red: '#a63a32', redDk: '#7e2a25', mustard: '#c99a3c', teal: '#3d7f7a',
    iron: '#2f3337', ironLt: '#4f565d', steel: '#8b949b', galv: '#b3bac0', rust: '#8a4d34', black: '#1f2124',
    rail: '#72706c', railTop: '#b9b6b0', sleeper: '#4d4239', ballast: '#8f8e8a',
    wood: '#9c7a57', woodLt: '#c49f76', woodDk: '#6f5238', rope: '#cdb991', net: '#3f5c58', netRed: '#8a3b32',
    cream: '#ebe3cd', white: '#f3f1ec', dark: '#23201e', soil: '#4a3c30',
    pine: '#3c5a45', pineDk: '#2c4535', bark: '#5d4a3c', barkDk: '#43362d',
    // the railcars' county livery (cream body, deep red band, navy skirt)
    livCream: '#e8e0c9', livRed: '#a3372f', livNavy: '#2c3850',
  };

  // ------------------------------------------------------------------------------------------ geometry
  class GB {
    constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.idx = []; }
    v(x, y, z, nx, ny, nz, r = 1, g = r, b = r) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(0, 0); this.c.push(r, g, b); return this.p.length / 3 - 1; }
    tri(a, b, c) {
      const P = this.p, N = this.n;
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az;
      const e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
      const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
      if (cx * cx + cy * cy + cz * cz < 1e-18) return;
      const s = cx * (N[a * 3] + N[b * 3] + N[c * 3]) + cy * (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) + cz * (N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]);
      if (s < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
    }
    quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
    geo() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setIndex(this.idx);
      return g;
    }
  }
  const TPL = new Map();
  const tpl = (key, fn) => { let g = TPL.get(key); if (!g) { g = fn(); TPL.set(key, g); } return g; };
  const kf = (a) => (typeof a === 'number' ? a.toFixed(4) : String(a));
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const pboxGeo = () => tpl('pbox', () => new THREE.BoxGeometry(1, 1, 1));
  // plain (unbevelled) box: 12 triangles, for flush / small parts
  const pbox = (B, mat, c, w, h, d, x, y, z, o = {}) => B.add(mat, pboxGeo(), c, x, y, z, { ...o, sx: w, sy: h, sz: d });
  const cylGeo = (rt, rb, h, seg, open = false, t0 = 0, tl = TAU) => tpl(['cy', rt, rb, h, seg, open ? 1 : 0, t0, tl].map(kf).join('|'), () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, t0, tl));
  const puff = (det, seed) => tpl('pf|' + det + '|' + seed, () => puffGeo(det, seed));
  const extr = (key, prof, L = 1, b = 0.001) => tpl('ex|' + key + '|' + kf(L) + '|' + kf(b), () => extrudeGeo(prof, L, b));
  // collider from centre (x, z), base y and size; flags: ROOF (off-limits top) · RAIL (railing: shots, ink, squids
  // pass, kids don't) · PERCH (stand on it, never ink)
  const ROOF = { roof: true }, RAIL = { rail: true }, PERCH = { perch: true };
  const colBox = (B, x, y, z, w, h, d, f) => B.col(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, f);
  // collider for a strip between two points on the ground plane (a fence / railing run), thickness t
  const colRun = (B, x0, z0, x1, z1, y, h, t, f) => B.col(Math.min(x0, x1) - t / 2, y, Math.min(z0, z1) - t / 2, Math.max(x0, x1) + t / 2, y + h, Math.max(z0, z1) + t / 2, f);
  const det = (B) => (B.k.qf >= 1 ? 2 : 1);
  // compose another type inside this one (its colliders mapped from its own frame into ours; quarter turns are exact)
  function sub(B, type, x, y, z, ry, opts = {}) {
    const def = D[type];
    if (!def) return;
    const n0 = B.cols.length, ao = B.aoBase;
    B.push(x, y, z, ry);
    def.build(B, opts);
    B.pop();
    B.aoBase = ao;
    const c = Math.cos(ry), s = Math.sin(ry);
    for (let i = n0; i < B.cols.length; i++) {
      const b = B.cols[i];
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [lx, lz] of [[b[0], b[2]], [b[3], b[2]], [b[3], b[5]], [b[0], b[5]]]) {
        const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
        x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); z0 = Math.min(z0, wz); z1 = Math.max(z1, wz);
      }
      B.cols[i] = b[6] ? [x0, b[1] + y, z0, x1, b[4] + y, z1, b[6]] : [x0, b[1] + y, z0, x1, b[4] + y, z1];
    }
  }
  // run fn in the frame of one face of a W × Dd block centred on the prop origin (x along the face, +z out of it)
  // side 0 = +Z, 1 = +X, 2 = −Z, 3 = −X; on a face, x runs to the viewer's right (seen from outside)
  function onFace(B, W, Dd, side, fn) {
    const ry = [0, HP, PI, -HP][side], off = side % 2 === 0 ? Dd / 2 : W / 2;
    B.push(Math.sin(ry) * off, 0, Math.cos(ry) * off, ry); fn(side % 2 === 0 ? W : Dd); B.pop();
  }

  // ------------------------------------------------------------------------------------------ snow
  // a snow pillow: flat underside, soft rounded top edges (extruded along X): w long, d deep, t thick
  const pillowGeo = (d, t) => tpl(['pil', d, t].map(kf).join('|'), () => {
    const r = Math.min(t * 0.7, d * 0.3), n = 5, prof = [[-d / 2, 0], [d / 2, 0]];
    for (let i = 0; i <= n; i++) { const a = (i / n) * HP; prof.push([d / 2 - r + Math.sin(a) * r * 0.9 + r * 0.1 * (1 - i / n), t - r + Math.cos(a) * r]); }
    for (let i = n; i >= 0; i--) { const a = (i / n) * HP; prof.push([-d / 2 + r - Math.sin(a) * r * 0.9 - r * 0.1 * (1 - i / n), t - r + Math.cos(a) * r]); }
    // (the profile runs z → y; drop the duplicated crest points)
    const out = prof.filter((p, i) => i === 0 || Math.hypot(p[0] - prof[i - 1][0], p[1] - prof[i - 1][1]) > 1e-4);
    return extrudeGeo(out.reverse(), 1, Math.min(0.06, t * 0.4));
  });
  // snow pillow on a surface at y (centre x, z), w along local x, d along local z, turned ry
  function snowCap(B, x, y, z, w, d, t = 0.12, o = {}) {
    B.add(o.mat ?? 'paint', pillowGeo(d, t), o.c ?? K.snow, x, y, z, { sx: w, ry: o.ry ?? 0, rx: o.rx ?? 0, rz: o.rz ?? 0, ao: false });
  }
  // a rounded drift / snowbank (lumpy half-ellipsoid), rx × ry × rz
  const driftGeo = (seed) => tpl('drift|' + seed, () => {
    const g = new THREE.SphereGeometry(1, 14, 7, 0, TAU, 0, HP);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const n = Math.sin(x * 3.1 + seed) * Math.sin(z * 2.7 + seed * 1.7) * 0.08 + Math.sin(x * 7 + z * 5 + seed) * 0.03;
      P.setXYZ(i, x * (1 + n), y * (1 + n * 1.5), z * (1 + n));
    }
    g.computeVertexNormals();
    const cc = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { const k = 0.9 + 0.1 * P.getY(i); cc[i * 3] = k; cc[i * 3 + 1] = k; cc[i * 3 + 2] = k; }
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    g.deleteAttribute('uv'); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(P.count * 2), 2));
    return g;
  });
  function drift(B, x, y, z, rx, ry, rz, o = {}) {
    B.add(o.mat ?? 'paint', driftGeo(o.seed ?? (Math.round(Math.abs(x * 7 + z * 13)) % 6)), o.c ?? K.snow, x, y, z, { sx: rx, sy: ry, sz: rz, ry: o.rot ?? 0, ao: false });
  }
  // icicles hanging under an edge from x0 to x1 (at height y, depth z)
  function icicles(B, x0, x1, y, z, seed = 1, max = 0.35) {
    const n = Math.max(2, Math.round(Math.abs(x1 - x0) / 0.32));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.3 + hash(seed + i) * 0.4) / n, L = 0.06 + max * Math.pow(hash(seed * 3 + i * 7), 2.2);
      if (L < 0.08) continue;
      B.add(NS('gloss'), cylGeo(0.001, 0.024, 1, 5), K.ice, x0 + (x1 - x0) * t, y - L / 2, z, { sy: L, ao: false });
    }
  }

  // ------------------------------------------------------------------------------------------ roofs
  // Kawara tile roof over a W (along the ridge, local X) × Dd block, eaves at height y, overhang ov (eaves) / ovg
  // (gable ends), pitch = rise / run. `f` picks the shape: 1 = gable (kirizuma), 0 = hip (yosemune), between = hip-and-
  // gable (irimoya: hipped below, a gable triangle above f of the rise from the top). Built as polygons:
  //   long slope: eave (±L/2) → hip line → (±xg, ym) → gable edge → ridge (±xg, yr)   ·   end slope: eave → (xg, ym)
  //   gable wall: (xg, ym, ±Ze f) → ridge (xg, yr, 0)
  // The tiles show on an eave band and the gable edges; snow lies thick above it (inset shells + a rolled eave lip +
  // a ridge roll), icicles drip. o.col adds an off-limits collider over the roof.
  function roofShape(W, Dd, ov, ovg, p, f) {
    const L = W + ovg * 2, Ze = Dd / 2 + ov, yE = -ov * p, yR = (Dd / 2) * p;
    const xg = f >= 1 ? L / 2 : Math.max(0.05, L / 2 - Ze * (1 - f)), ym = f >= 1 ? yE : yE + Ze * (1 - f) * p, zg = f >= 1 ? Ze : Ze * f;
    return { L, Ze, yE, yR, xg, ym, zg };
  }
  // a slab under a planar polygon (top points, CCW seen from above): top face, bottom face t lower, edge walls
  function slab(g, pts, t, cTop = 1, cSide = 0.8) {
    const n = pts.length;
    // plane normal (Newell)
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const top = pts.map((q) => g.v(q[0], q[1], q[2], nx, ny, nz, cTop));
    const bot = pts.map((q) => g.v(q[0] - nx * t, q[1] - ny * t, q[2] - nz * t, -nx, -ny, -nz, cSide * 0.85));
    for (let i = 1; i < n - 1; i++) { g.tri(top[0], top[i], top[i + 1]); g.tri(bot[0], bot[i + 1], bot[i]); }
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      let ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
      // outward edge normal = edge × plane normal
      let ox = ey * nz - ez * ny, oy = ez * nx - ex * nz, oz = ex * ny - ey * nx; const ol = Math.hypot(ox, oy, oz) || 1; ox /= ol; oy /= ol; oz /= ol;
      const cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2, mx = pts.reduce((s2, q) => s2 + q[0], 0) / n, mz = pts.reduce((s2, q) => s2 + q[2], 0) / n;
      if (ox * (cx - mx) + oz * (cz - mz) < 0) { ox = -ox; oy = -oy; oz = -oz; }
      const v0 = g.v(a[0], a[1], a[2], ox, oy, oz, cSide), v1 = g.v(b[0], b[1], b[2], ox, oy, oz, cSide);
      const v2 = g.v(b[0] - nx * t, b[1] - ny * t, b[2] - nz * t, ox, oy, oz, cSide), v3 = g.v(a[0] - nx * t, a[1] - ny * t, a[2] - nz * t, ox, oy, oz, cSide);
      g.quad(v0, v1, v2, v3);
    }
  }
  const roofKey = (a) => a.map(kf).join(',');
  // the tile shell (slopes only), gable walls, snow shells
  function roofGeos(W, Dd, ov, ovg, p, f) {
    return tpl('roof|' + roofKey([W, Dd, ov, ovg, p, f]), () => {
      const R = roofShape(W, Dd, ov, ovg, p, f), { L, Ze, yE, yR, xg, ym, zg } = R;
      const tiles = new GB(), walls = new GB(), snow = new GB(), eaves = new GB();
      for (const s of [-1, 1]) {
        // long slope (s = side in z)
        const long = [[-L / 2, yE, s * Ze], [L / 2, yE, s * Ze], [xg, ym, s * zg], [xg, yR, 0], [-xg, yR, 0], [-xg, ym, s * zg]]
          .filter((q, i, a) => i === 0 || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1], q[2] - a[i - 1][2]) > 1e-3);
        slab(tiles, s > 0 ? long : long.slice().reverse(), 0.14);
        // end slope (s = side in x) for hip / irimoya
        if (f < 1) slab(tiles, [[s * L / 2, yE, -Ze], [s * L / 2, yE, Ze], [s * xg, ym, zg], [s * xg, ym, -zg]], 0.14);
        // gable wall triangle for gable / irimoya (set in 0.05 under the barge boards)
        if (f > 0) {
          const gx = s * (f >= 1 ? W / 2 : xg - 0.04), yb = f >= 1 ? 0 : ym;
          const tz = f >= 1 ? Dd / 2 : zg * ((yR - ym) / (yR - ym + 1e-6));
          const tri = [[gx, yb, -tz], [gx, yb, tz], [gx, yR - 0.02, 0]];
          const nxw = s;
          const ids = tri.map((q) => walls.v(q[0], q[1], q[2], nxw, 0, 0));
          walls.tri(ids[0], ids[1], ids[2]);
          const ids2 = tri.map((q) => walls.v(q[0] - s * 0.06, q[1], q[2], -nxw, 0, 0));
          walls.tri(ids2[0], ids2[2], ids2[1]);
        }
      }
      // snow shells: the same planes, inset from the eaves (the tile band shows) and raised
      const T = 0.2, IN = 0.42;
      const up = (q, n, d) => [q[0] + n[0] * d, q[1] + n[1] * d, q[2] + n[2] * d];
      for (const s of [-1, 1]) {
        const sl = Math.hypot(1, p), nl = [0, 1 / sl, s * p / sl];
        const zi = Ze - IN, yi = yE + IN * p;
        const xi = f >= 1 ? L / 2 - 0.12 : Math.max(0.05, L / 2 - IN - 0.08);
        const long = [[-xi, yi, s * zi], [xi, yi, s * zi], [xg - (f >= 1 ? 0.12 : 0.06), ym + 0.02, s * Math.min(zg, zi)], [xg - (f >= 1 ? 0.12 : 0.06), yR, 0], [-(xg - (f >= 1 ? 0.12 : 0.06)), yR, 0], [-(xg - (f >= 1 ? 0.12 : 0.06)), ym + 0.02, s * Math.min(zg, zi)]]
          .filter((q, i, a) => i === 0 || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1], q[2] - a[i - 1][2]) > 1e-3).map((q) => up(q, nl, T + 0.01));
        slab(snow, s > 0 ? long : long.slice().reverse(), T, 1, 0.9);
        if (f < 1) {
          const ne = [s / sl, 1 / sl, 0].map((v) => v * (s > 0 ? 1 : 1));
          const endP = [[s * (L / 2 - IN), yi, -(Ze - IN)], [s * (L / 2 - IN), yi, Ze - IN], [s * (xg + 0.02), ym, zg - 0.05], [s * (xg + 0.02), ym, -(zg - 0.05)]].map((q) => up(q, [s * p / sl, 1 / sl, 0], T + 0.01));
          void ne;
          slab(snow, endP, T, 1, 0.9);
        }
      }
      // eave soffit + rafter tails under the eaves (visible from the street)
      for (const s of [-1, 1]) {
        const z0 = s * (Dd / 2), z1 = s * (Ze - 0.05);
        const n = Math.max(3, Math.round(L / 0.45));
        for (let i = 0; i <= n; i++) {
          const x = -L / 2 + 0.1 + (i * (L - 0.2)) / n;
          const a = [x - 0.04, yE + (Ze - Math.abs(z1)) * p - 0.16, z1], b = [x + 0.04, yE - 0.16 + (Ze - Math.abs(z0)) * p, z0];
          slab(eaves, [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]], 0.1, 0.7, 0.6);
        }
      }
      return { tiles: tiles.geo(), walls: walls.geo(), snow: snow.geo(), eaves: eaves.geo(), R };
    });
  }
  function roof(B, W, Dd, y, o = {}) {
    const f = o.f ?? (o.kind === 'hip' ? 0 : o.kind === 'irimoya' ? 0.5 : 1), ov = o.ov ?? 0.8, ovg = o.ovg ?? (f >= 1 ? 0.45 : ov), p = o.pitch ?? 0.5;
    const alongX = o.alongX ?? W >= Dd, w = alongX ? W : Dd, d = alongX ? Dd : W, c = o.c ?? K.kawara, snowy = o.snow !== false;
    const G = roofGeos(w, d, ov, ovg, p, f), R = G.R, seed = o.seed ?? 7;
    B.push(o.x ?? 0, y, o.z ?? 0, (alongX ? 0 : HP) + (o.ry ?? 0));
    B.add('paint', G.tiles, c, 0, 0, 0, {});
    if (f > 0) B.add('paint', G.walls, o.wall ?? K.plaster, 0, 0, 0, {});
    B.add(NS('wood'), G.eaves, K.beam, 0, 0, 0, {});
    // eave front: a row of round end tiles; gable edges: barge boards
    for (const s of [-1, 1]) B.add(NS('paint'), cylGeo(0.075, 0.075, R.L - (f < 1 ? 0.1 : 0), 8), shade(c, 0.8), 0, R.yE + 0.02, s * (R.Ze - 0.02), { rz: HP });
    if (f < 1) for (const s of [-1, 1]) B.add(NS('paint'), cylGeo(0.075, 0.075, R.Ze * 2 - 0.1, 8), shade(c, 0.8), s * (R.L / 2 - 0.02), R.yE + 0.02, 0, { rx: HP });
    if (f > 0) {
      const ang = Math.atan(p);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * R.xg, z0 = sz * R.zg, len = Math.hypot(R.zg, R.yR - R.ym);
        B.push(x, (R.ym + R.yR) / 2 + 0.02, z0 / 2, 0, sz * ang);
        pbox(B, 'wood', K.beam, 0.1, 0.24, len + 0.12, 0, 0, 0);
        B.pop();
      }
      // a small gable ornament (gegyo) under the ridge end
      for (const sx of [-1, 1]) B.box(NS('wood'), K.beam, 0.06, 0.34, 0.24, sx * (R.xg + 0.03), R.yR - 0.28, 0, { r: 0.02 });
    }
    // ridge: tiled ridge with a snow crest, onigawara end blocks
    const rL = Math.max(0.3, R.xg * 2 + (f > 0 ? 0.2 : 0));
    pbox(B, 'paint', K.kawaraDk, rL, 0.24, 0.34, 0, R.yR + 0.1, 0);
    B.add('paint', cylGeo(0.15, 0.15, rL + 0.14, 10), K.kawaraDk, 0, R.yR + 0.24, 0, { rz: HP });
    for (const sx of [-1, 1]) B.box('paint', K.kawaraDk, 0.16, 0.44, 0.46, sx * (rL / 2 + 0.06), R.yR + 0.28, 0, { r: 0.06 });
    if (snowy) {
      B.add('paint', G.snow, K.snow, 0, 0, 0, { ao: false });
      B.add('paint', pillowGeo(0.7, 0.2), K.snow, 0, R.yR + 0.36, 0, { sx: Math.max(0.3, rL - 0.1), ao: false });
      // rolled lip of snow along both eaves, just behind the tile band
      const ang = Math.atan(p), IN = 0.42;
      for (const s of [-1, 1]) {
        B.push(0, R.yE + IN * p + 0.1, s * (R.Ze - IN + 0.02), s > 0 ? 0 : PI, ang * 0.9);
        B.add('paint', pillowGeo(0.34, 0.2), K.snowSh, 0, 0, 0, { sx: Math.max(0.4, (f >= 1 ? R.L - 0.3 : R.L - 2 * IN - 0.1)), ao: false });
        B.pop();
      }
      if (o.icicles !== false) for (const s of [-1, 1]) icicles(B, -R.L / 2 + 0.5, R.L / 2 - 0.5, R.yE - 0.05, s * (R.Ze - 0.04), seed + s * 3, 0.32);
    }
    B.pop();
    if (o.col) {
      const cw = w + 0.2, cd = d + 0.2;
      colBox(B, o.x ?? 0, y, o.z ?? 0, alongX ? cw : cd, R.yR + 0.4, alongX ? cd : cw, ROOF);
    }
    return R;
  }

  // ------------------------------------------------------------------------------------------ panels (face frame: +z out)
  // shoji / lattice sliding door or window: frame, kumiko lattice, paper (lit at dusk when lit > 0)
  function shoji(B, x, y, w, h, o = {}) {
    const fc = o.frame ?? K.cedarDk, cols = o.cols ?? Math.max(2, Math.round(w / 0.3)), rows = o.rows ?? Math.max(3, Math.round(h / 0.32));
    pbox(B, NS('paint'), o.inside ?? K.dark, w, h, 0.01, x, y + h / 2, 0.004);
    if (o.lit) pbox(B, NS('glow'), K.lit, w - 0.06, h - 0.06, 0.004, x, y + h / 2, 0.012, { glow: o.lit });
    else pbox(B, NS('paint'), o.paper ?? K.paper, w - 0.06, h - 0.06, 0.004, x, y + h / 2, 0.012);
    for (let i = 1; i < cols; i++) pbox(B, NS('wood'), fc, 0.022, h - 0.06, 0.02, x - w / 2 + (i * w) / cols, y + h / 2, 0.022);
    for (let j = 1; j < rows; j++) pbox(B, NS('wood'), fc, w - 0.06, 0.022, 0.02, x, y + (j * h) / rows, 0.022);
    // frame + a centre stile where two leaves meet
    for (const sx of [-1, 1]) pbox(B, 'wood', fc, 0.05, h, 0.05, x + sx * (w / 2 - 0.025), y + h / 2, 0.025);
    pbox(B, 'wood', fc, w, 0.05, 0.05, x, y + h - 0.025, 0.025);
    pbox(B, 'wood', fc, w, 0.07, 0.05, x, y + 0.035, 0.025);
    if (o.leaves !== 1) pbox(B, NS('wood'), fc, 0.05, h, 0.04, x + (o.split ?? 0) * w, y + h / 2, 0.045);
  }
  // koshi lattice (vertical slats) over a window or shopfront
  function koshi(B, x, y, w, h, o = {}) {
    const fc = o.c ?? K.cedarDk, n = Math.max(3, Math.round(w / (o.pitch ?? 0.07)));
    pbox(B, NS('paint'), o.lit ? K.litWarm : K.dark, w, h, 0.01, x, y + h / 2, 0.004, o.lit ? {} : {});
    if (o.lit) pbox(B, NS('glow'), K.lit, w - 0.04, h - 0.04, 0.004, x, y + h / 2, 0.01, { glow: o.lit });
    for (let i = 0; i <= n; i++) pbox(B, NS('wood'), fc, 0.028, h, 0.035, x - w / 2 + (i * w) / n, y + h / 2, 0.03);
    for (const yy of [0.02, h - 0.02]) pbox(B, 'wood', fc, w + 0.06, 0.05, 0.06, x, y + yy, 0.03);
  }
  // timber board cladding (vertical boards with battens) over a W × h face area from y0
  function boards(B, x, W, y0, h, c = K.cedar, o = {}) {
    pbox(B, 'wood', c, W, h, 0.03, x, y0 + h / 2, 0.015);
    const n = Math.max(2, Math.round(W / (o.pitch ?? 0.45)));
    for (let i = 0; i <= n; i++) pbox(B, NS('wood'), shade(c, 0.78), 0.05, h, 0.02, x - W / 2 + (i * W) / n, y0 + h / 2, 0.035);
  }

  // ------------------------------------------------------------------------------------------ stroke font
  const EA = (cx, cy, rx, ry, a0, a1, n = 12) => { const o = []; for (let i = 0; i <= n; i++) { const a = ((a0 + (a1 - a0) * (i / n)) * PI) / 180; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; };
  const LOOP = (cx, cy, rx, ry, n = 24) => ({ c: EA(cx, cy, rx, ry, 0, 360, n).slice(0, n) });
  const GL = {
    A: [0.66, [[0, 0], [0.33, 1], [0.66, 0]], [[0.13, 0.33], [0.53, 0.33]]],
    B: [0.58, [[0, 0], [0, 1]], [[0, 1], ...EA(0.3, 0.755, 0.245, 0.245, 90, -90, 12), [0, 0.51]], [[0, 0.51], ...EA(0.32, 0.255, 0.255, 0.255, 90, -90, 12), [0, 0]]],
    C: [0.64, EA(0.34, 0.5, 0.34, 0.5, 46, 314, 22)],
    D: [0.6, [[0, 0], [0, 1]], [[0, 1], ...EA(0.16, 0.5, 0.44, 0.5, 90, -90, 16), [0, 0]]],
    E: [0.5, [[0.5, 1], [0, 1], [0, 0], [0.5, 0]], [[0, 0.52], [0.42, 0.52]]],
    F: [0.5, [[0.5, 1], [0, 1], [0, 0]], [[0, 0.52], [0.42, 0.52]]],
    G: [0.68, [...EA(0.34, 0.5, 0.34, 0.5, 46, 360, 22), [0.4, 0.5]]],
    H: [0.6, [[0, 0], [0, 1]], [[0.6, 0], [0.6, 1]], [[0, 0.52], [0.6, 0.52]]],
    I: [0, [[0, 0], [0, 1]]],
    J: [0.5, [[0.5, 1], ...EA(0.25, 0.3, 0.25, 0.3, 0, -172, 12)]],
    K: [0.58, [[0, 0], [0, 1]], [[0.56, 1], [0.02, 0.38]], [[0.22, 0.6], [0.6, 0]]],
    L: [0.48, [[0, 1], [0, 0], [0.48, 0]]],
    M: [0.76, [[0, 0], [0, 1], [0.38, 0.3], [0.76, 1], [0.76, 0]]],
    N: [0.62, [[0, 0], [0, 1], [0.62, 0], [0.62, 1]]],
    O: [0.74, LOOP(0.37, 0.5, 0.37, 0.5, 28)],
    P: [0.56, [[0, 0], [0, 1]], [[0, 1], ...EA(0.29, 0.735, 0.265, 0.265, 90, -90, 12), [0, 0.47]]],
    Q: [0.74, LOOP(0.37, 0.5, 0.37, 0.5, 28), [[0.46, 0.22], [0.78, -0.04]]],
    R: [0.58, [[0, 0], [0, 1]], [[0, 1], ...EA(0.29, 0.735, 0.265, 0.265, 90, -90, 12), [0, 0.47]], [[0.26, 0.47], [0.6, 0]]],
    S: [0.56, [...EA(0.28, 0.75, 0.27, 0.25, 28, 270, 12), ...EA(0.28, 0.25, 0.28, 0.25, 90, -152, 12).slice(1)]],
    T: [0.62, [[0, 1], [0.62, 1]], [[0.31, 1], [0.31, 0]]],
    U: [0.6, [[0, 1], ...EA(0.3, 0.32, 0.3, 0.32, 180, 360, 14), [0.6, 1]]],
    V: [0.66, [[0, 1], [0.33, 0], [0.66, 1]]],
    W: [0.92, [[0, 1], [0.23, 0], [0.46, 0.72], [0.69, 0], [0.92, 1]]],
    X: [0.62, [[0, 1], [0.62, 0]], [[0, 0], [0.62, 1]]],
    Y: [0.64, [[0, 1], [0.32, 0.48], [0.64, 1]], [[0.32, 0.48], [0.32, 0]]],
    Z: [0.56, [[0, 1], [0.56, 1], [0, 0], [0.56, 0]]],
    0: [0.56, LOOP(0.28, 0.5, 0.28, 0.5, 26)],
    1: [0.3, [[0, 0.78], [0.26, 1], [0.26, 0]]],
    2: [0.54, [...EA(0.27, 0.72, 0.27, 0.28, 160, -30, 12), [0, 0], [0.56, 0]]],
    3: [0.54, EA(0.26, 0.75, 0.25, 0.25, 150, -90, 12), EA(0.27, 0.26, 0.28, 0.26, 90, -150, 12)],
    4: [0.6, [[0.44, 0], [0.44, 1], [0, 0.3], [0.6, 0.3]]],
    5: [0.54, [[0.5, 1], [0.07, 1], [0.05, 0.52], ...EA(0.29, 0.34, 0.28, 0.34, 150, -150, 14)]],
    6: [0.56, [...EA(0.28, 0.5, 0.28, 0.5, 62, 180, 10), [0, 0.3]], LOOP(0.28, 0.3, 0.28, 0.3, 20)],
    7: [0.54, [[0, 1], [0.54, 1], [0.18, 0]]],
    8: [0.56, LOOP(0.28, 0.76, 0.23, 0.24, 18), LOOP(0.28, 0.27, 0.28, 0.27, 20)],
    9: [0.56, LOOP(0.28, 0.7, 0.28, 0.3, 20), [[0.56, 0.7], ...EA(0.28, 0.5, 0.28, 0.5, 0, -118, 10)]],
    '-': [0.36, [[0, 0.45], [0.36, 0.45]]],
    "'": [0, [[0, 1], [0, 0.8]]],
    '&': [0.66, [[0.66, 0], ...EA(0.3, 0.3, 0.3, 0.3, -40, -300, 16).reverse().slice(0, 0), [0.1, 0.72], ...EA(0.25, 0.8, 0.16, 0.2, 180, 0, 8), [0.1, 0.55], ...EA(0.28, 0.27, 0.28, 0.27, 150, 330, 12), [0.66, 0.45]]],
    '→': [0.7, [[0, 0.5], [0.7, 0.5]], [[0.42, 0.8], [0.7, 0.5], [0.42, 0.2]]],
    '←': [0.7, [[0.7, 0.5], [0, 0.5]], [[0.28, 0.8], [0, 0.5], [0.28, 0.2]]],
    '↑': [0.6, [[0.3, 0], [0.3, 1]], [[0, 0.7], [0.3, 1], [0.6, 0.7]]],
    '↓': [0.6, [[0.3, 1], [0.3, 0]], [[0, 0.3], [0.3, 0], [0.6, 0.3]]],
    '/': [0.4, [[0, 0], [0.4, 1]]],
    ':': [0.001, [[0, 0.72], [0, 0.73]], [[0, 0.22], [0, 0.23]]],
  };
  const DOTS = { '·': [[0, 0.46]], '.': [[0, 0]] };
  const SPACE = 0.34;
  function ribbon(g, pts, closed, hw, d) {
    const n = pts.length;
    const N = pts.map((p, i) => {
      const a = closed ? pts[(i - 1 + n) % n] : i > 0 ? pts[i - 1] : null;
      const c = closed ? pts[(i + 1) % n] : i < n - 1 ? pts[i + 1] : null;
      const nrm = (u, v) => { const dx = v[0] - u[0], dy = v[1] - u[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
      const n1 = a ? nrm(a, p) : null, n2 = c ? nrm(p, c) : null;
      if (!n1) return [n2[0], n2[1], 1];
      if (!n2) return [n1[0], n1[1], 1];
      let mx = n1[0] + n2[0], my = n1[1] + n2[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      return [mx, my, Math.min(1.6, 1 / Math.max(0.3, mx * n2[0] + my * n2[1]))];
    });
    const walls = d > 1e-5;
    const rings = pts.map((p, i) => {
      const [nx, ny, k] = N[i];
      const L = [p[0] + nx * k * hw, p[1] + ny * k * hw], Rr = [p[0] - nx * k * hw, p[1] - ny * k * hw];
      const r = [g.v(L[0], L[1], d, 0, 0, 1), g.v(Rr[0], Rr[1], d, 0, 0, 1)];
      if (walls) r.push(g.v(L[0], L[1], d, nx, ny, 0), g.v(L[0], L[1], 0, nx, ny, 0), g.v(Rr[0], Rr[1], d, -nx, -ny, 0), g.v(Rr[0], Rr[1], 0, -nx, -ny, 0));
      return r;
    });
    const segs = closed ? n : n - 1, np = rings[0].length;
    for (let i = 0; i < segs; i++) { const A = rings[i], Bq = rings[(i + 1) % n]; for (let j = 0; j < np; j += 2) g.quad(A[j], A[j + 1], Bq[j + 1], Bq[j]); }
  }
  function disc(g, cx, cy, r, d, seg, a0 = 0, a1 = TAU) {
    const full = a1 - a0 > TAU - 1e-4, walls = d > 1e-5;
    const c0 = g.v(cx, cy, d, 0, 0, 1), f = [], wt = [], wb = [];
    const n = full ? seg : seg + 1;
    for (let k = 0; k < n; k++) {
      const a = a0 + ((a1 - a0) * k) / seg, cs = Math.cos(a), sn = Math.sin(a);
      f.push(g.v(cx + cs * r, cy + sn * r, d, 0, 0, 1));
      if (walls) { wt.push(g.v(cx + cs * r, cy + sn * r, d, cs, sn, 0)); wb.push(g.v(cx + cs * r, cy + sn * r, 0, cs, sn, 0)); }
    }
    for (let k = 0; k < seg; k++) { const j = full ? (k + 1) % seg : k + 1; g.tri(c0, f[k], f[j]); if (walls) g.quad(wt[k], wb[k], wb[j], wt[j]); }
  }
  function glyph(ch, wt, dep, ds = 8) {
    return tpl(['gl', ch, wt, dep, ds].map(kf).join('|'), () => {
      const s = 1 - wt, hw = wt / 2, T = (p) => [hw + p[0] * s, hw + p[1] * s];
      const g = new GB();
      if (DOTS[ch]) { for (const p of DOTS[ch]) { const q = T(p); disc(g, hw * 1.15, q[1], hw * 1.15, dep, ds); } return { geo: g.geo(), adv: wt * 1.3 }; }
      const def = GL[ch];
      if (!def) return { geo: null, adv: SPACE };
      const [w, ...strokes] = def;
      strokes.forEach((st, si) => {
        const d = dep > 0 ? dep - si * 0.004 : si * 0.0004;
        const closed = !Array.isArray(st);
        let pts = (closed ? st.c : st).map(T);
        pts = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-4);
        if (pts.length < 2) { const q = pts[0]; disc(g, q[0], q[1], hw * 1.1, d, ds); return; }
        if (closed) { ribbon(g, pts, true, hw, d); return; }
        let cur = [pts[0]];
        const joints = [];
        for (let i = 1; i < pts.length; i++) {
          cur.push(pts[i]);
          if (i < pts.length - 1) {
            const a = pts[i - 1], p = pts[i], c = pts[i + 1];
            const t1 = Math.atan2(p[1] - a[1], p[0] - a[0]), t2 = Math.atan2(c[1] - p[1], c[0] - p[0]);
            let dt = Math.abs(t2 - t1); if (dt > PI) dt = TAU - dt;
            if (dt > 0.6) { ribbon(g, cur, false, hw, d); cur = [pts[i]]; joints.push(pts[i]); }
          }
        }
        if (cur.length > 1) ribbon(g, cur, false, hw, d);
        const endCap = (p, q) => { const a = Math.atan2(p[1] - q[1], p[0] - q[0]); disc(g, p[0], p[1], hw, d, Math.max(3, Math.round(ds / 2)), a - HP, a + HP); };
        endCap(pts[0], pts[1]); endCap(pts[pts.length - 1], pts[pts.length - 2]);
        for (const p of joints) disc(g, p[0], p[1], hw, d, ds);
      });
      return { geo: g.geo(), adv: w * s + wt };
    });
  }
  const textW = (str, wt = 0.17, track = 0.12) => { let w = 0; const cs = [...str]; cs.forEach((ch, i) => { w += ch === ' ' ? SPACE : glyph(ch, wt, 0.1).adv; if (i < cs.length - 1) w += track; }); return w; };
  // a line of letters facing +Z in the current frame (raised letters, or flat paint with flat: true); returns width
  function letters(B, str, o = {}) {
    const h = o.h ?? 0.3, wt = o.wt ?? 0.17, flat = !!o.flat, dep = flat ? 0 : o.dep ?? 0.1, track = o.track ?? 0.12;
    const W = textW(str, wt, track) * h;
    let x = o.align === 'left' ? 0 : o.align === 'right' ? -W : -W / 2;
    const cs = [...str];
    cs.forEach((ch, i) => {
      if (ch === ' ') { x += (SPACE + track) * h; return; }
      const gi = glyph(ch, wt, dep, flat || h < 0.15 ? 6 : 8);
      const m = o.mat ?? 'paint';
      if (gi.geo) B.add(NS(m), gi.geo, o.c ?? K.dark, (o.x ?? 0) + x, o.y ?? 0, o.z ?? 0, { s: h, sz: flat ? 1 : h, glow: o.glow, ao: false });
      x += (gi.adv + (i < cs.length - 1 ? track : 0)) * h;
    });
    return W;
  }
  // a signboard: board + border + letters (face frame, centred at x, bottom y); returns the board's width
  function sign(B, text, x, y, o = {}) {
    const h = o.h ?? 0.22, pad = o.pad ?? 0.14, W = o.w ?? textW(text, o.wt ?? 0.18, o.track ?? 0.12) * h + pad * 2, Hh = o.hh ?? h + pad * 1.4;
    B.box(o.boardMat ?? 'wood', o.board ?? K.cedarDk, W, Hh, 0.05, x, y + Hh / 2, 0.025, { r: 0.012 });
    if (o.border) pbox(B, NS('paint'), o.border, W - 0.05, Hh - 0.05, 0.004, x, y + Hh / 2, 0.052);
    if (o.border) pbox(B, NS(o.boardMat ?? 'wood'), o.board ?? K.cedarDk, W - 0.1, Hh - 0.1, 0.004, x, y + Hh / 2, 0.054);
    letters(B, text, { h, x, y: y + (Hh - h) / 2, z: 0.056, c: o.c ?? K.cream, flat: o.flat ?? true, wt: o.wt ?? 0.18, track: o.track ?? 0.12, mat: o.lit ? 'glow' : 'paint', glow: o.lit });
    return W;
  }

  // ------------------------------------------------------------------------------------------ small shared parts
  // a paper lantern (chōchin): lit at dusk
  function chochin(B, x, y, z, o = {}) {
    const r = o.r ?? 0.17, hh = o.h ?? 0.42;
    B.add(NS('glow'), tpl('chochin', () => H.latheGeo([[0, -0.5], [0.55, -0.46], [0.86, -0.3], [1, 0], [0.86, 0.3], [0.55, 0.46], [0, 0.5]], 12)), o.c ?? K.lit, x, y, z, { sx: r, sz: r, sy: hh, glow: o.glow ?? 1.3, ao: false });
    for (const s of [-1, 1]) B.cyl(NS('paint'), K.black, r * 0.62, 0.05, x, y + s * hh * 0.52, z, { seg: 10 });
    if (o.band !== false) B.add(NS('paint'), cylGeo(r * 1.005, r * 1.005, hh * 0.14, 12, true), o.bandC ?? K.red, x, y, z, { ao: false });
  }
  // a hanging wall lamp (enamel shade + bulb), lit at dusk; face frame (+z out of the wall)
  function wallLamp(B, x, y, o = {}) {
    B.box('metal', K.iron, 0.06, 0.06, 0.4, x, y + 0.2, 0.2, { r: 0.01 });
    B.cyl('metal', K.iron, 0.012, 0.18, x, y + 0.1, 0.38, { seg: 5 });
    B.lathe('paint', o.shade ?? '#3d5a52', [[0.02, 0.1], [0.08, 0.08], [0.17, -0.02], [0.18, -0.04], [0, -0.04]], x, y - 0.02, 0.38, { seg: 12 });
    B.sph(NS('glow'), K.lit, 0.055, x, y - 0.07, 0.38, { ws: 8, hs: 6, glow: o.glow ?? 1.8 });
  }

  return {
    K, NS, GB, TPL, tpl, kf, hash, pbox, pboxGeo, cylGeo, puff, extr, colBox, colRun, ROOF, RAIL, PERCH, det, sub, onFace,
    pillowGeo, snowCap, driftGeo, drift, icicles, roof, roofShape, slab, shoji, koshi, boards, textW, letters, sign, chochin, wallLamp,
    col, shade, mixc, PI, TAU, HP, P3, THREE,
  };
}
