// Mount Nantai — the stage's own far scenery (layout.env.backdrop; see the top of src/world/environment.js). Gets the
// environment's SCENERY_KIT (+ THREE, bounds, runs, rnd) — imports nothing, so layout.js stays importable in Node.
//
// The arena is a granite rib across the tarn in the saddle under the summit. Round it:
//   • the tarn's shores (80–220 m): granite slabs and scree at the waterline, alpine meadow, dwarf pines
//   • behind Alpha's dome (−Z): the summit crag of Mount Nantai (with the trig pillar) and the summit massif beyond;
//     behind Bravo's (+Z): Little Nantai, a lower granite peak
//   • the −X side: a forested ridge with the path down to Octo Valley; far beyond, Octo Valley's domed hills
//   • the +X side: the tarn's lip — low, open — and far down the mountain, hazy, Inkopolis Bay with the city's towers
//   • all round at 1.5–4 km: layered blue ranges, snow on the highest
//   • at the waterline round the arena's outer edges: a skirt of granite boulders (the deck never meets the water bare)
// Vertex colours are the scenery's own (the terrain shader's sandy beaches would read as seaside), baked per vertex
// from height, slope and noise; glow stays 0 except on the city's lit windows.
// o.d: the Long Stages stretch (layout.js ST.d) — the arena's ends moved out by d, so the summit crag, Little Nantai
// and the knolls behind the domes move out with them (the tarn's sides, the islets and the far world stay put)
export function buildBackdrop(kit, o = {}) {
  const D = o.d ?? 0, E = (z) => z + Math.sign(z) * D;
  const { THREE, box, cyl, sph, prep, xf, triGeo, makeIsland, mulberry, fbm, polar, DEG, WATER_Y } = kit;
  const rnd = mulberry(2657);
  const statics = [], plains = [];
  const C = (h) => new THREE.Color(h);
  const COL = {
    shore: C('#6f6a62'), wet: C('#4c4944'), rock: C('#9c9a94'), rockDk: C('#7b7872'), rockLt: C('#b7b4ad'), scree: C('#a8a197'),
    meadow: C('#8fa169'), meadowDry: C('#a9a773'), heath: C('#7d7f52'), pine: C('#465f3e'), pineDk: C('#344832'), snow: C('#eef2f6'),
    farA: C('#6f8da8'), farB: C('#8aa3b8'), farC: C('#a5b8c8'),
  };
  const tmp = new THREE.Color();

  // ---------------------------------------------------------------------------------------------- terrain masses
  // makeIsland for the shape; colours re-baked: waterline shingle, granite on steep faces, meadow / heath / pine
  // on the gentler slopes, scree and snow high up; the fold AO multiplied in (and the glow channel cleared)
  const masses = [];
  function mass(o) {
    const isl = makeIsland({ R: 16, S: 64, ...o });
    const g = isl.geo, P = g.attributes.position, N = g.attributes.normal, Cc = g.attributes.color, Gl = g.attributes.glow;
    const snowLine = o.snow ?? 1e9, far = o.far ?? 0;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i) - WATER_Y, z = P.getZ(i), ny = N.getY(i);
      const n1 = fbm(x * 0.013 + o.seed, z * 0.013 - o.seed, 3), n2 = fbm(x * 0.05 - o.seed * 2, z * 0.05 + 3.1, 2);
      const slope = 1 - ny;
      let c;
      if (far) {
        // distant ranges: flat bands of blue-grey, lighter with height, snow on the tops
        c = tmp.copy(far === 1 ? COL.farA : far === 2 ? COL.farB : COL.farC).multiplyScalar(0.9 + 0.2 * n2 + 0.08 * Math.min(1, y / (o.h || 1)));
        if (y > snowLine + (n1 - 0.5) * 60 && slope < 0.55) c = tmp.copy(COL.snow).multiplyScalar(0.92 + 0.08 * n2);
      } else if (y < 0.9 + n2 * 0.8) {
        c = tmp.copy(y < 0.35 ? COL.wet : COL.shore).multiplyScalar(0.9 + 0.2 * n2);
      } else if (slope > 0.34 + (n2 - 0.5) * 0.18) {
        c = tmp.copy(COL.rock).lerp(COL.rockDk, n1).lerp(COL.rockLt, Math.max(0, n2 - 0.55));
      } else {
        const hi = y / Math.max(8, o.h);
        c = tmp.copy(COL.meadow).lerp(COL.meadowDry, Math.max(0, Math.min(1, n1 * 1.6 - 0.4)));
        if (hi < 0.55 && n1 > 0.52 && y > 2) c.lerp(n2 > 0.5 ? COL.pine : COL.pineDk, Math.min(1, (n1 - 0.52) * 7));   // dwarf-pine thickets
        if (hi > 0.62) c.lerp(COL.scree, Math.min(1, (hi - 0.62) * 3));
        if (n2 > 0.72) c.lerp(COL.heath, 0.5);
        if (y > snowLine + (n1 - 0.5) * 30) c = tmp.copy(COL.snow).multiplyScalar(0.94 + 0.06 * n2);
      }
      const ao = Gl ? Gl.getX(i) : 1;
      Cc.setXYZ(i, c.r * ao, c.g * ao, c.b * ao);
      if (Gl) Gl.setX(i, 0);
    }
    (o.plain ? plains : statics).push(g);
    masses.push({ ...o, isl });
    return isl;
  }
  const at = (a, d) => polar(a, d);
  // --- the tarn's shores (the basin round the arena; x ±26, z ±(46 + D))
  //     −X: the forested ridge (the path to Octo Valley); +X: the low lip with the view down the mountain
  mass({ x: -175, z: 10, rx: 95, rz: 210, h: 48, seed: 1, rot: 0.08, ridge: 0.45 });
  mass({ x: -118, z: -120, rx: 70, rz: 60, h: 30, seed: 2, rot: 0.6 });
  mass({ x: -110, z: 150, rx: 80, rz: 55, h: 26, seed: 3, rot: -0.4 });
  mass({ x: 150, z: -115, rx: 75, rz: 70, h: 20, seed: 4, rot: 0.3 });
  mass({ x: 160, z: 130, rx: 90, rz: 70, h: 28, seed: 5, rot: -0.2 });
  mass({ x: 180, z: 10, rx: 55, rz: 80, h: 5.5, seed: 6, rot: 0.1, ridge: 0.1 });            // the lip (low: the view)
  // --- the ends: the summit crag behind Alpha's dome (−Z) with the massif beyond; Little Nantai behind Bravo's (+Z)
  const crag = mass({ x: -6, z: E(-96), rx: 42, rz: 26, h: 24, seed: 7, rot: 0.15, ridge: 0.7 });
  mass({ x: 18, z: E(-72), rx: 26, rz: 18, h: 9, seed: 8, rot: -0.3, ridge: 0.6 });
  mass({ x: -28, z: E(-70), rx: 20, rz: 16, h: 8, seed: 9, rot: 0.5, ridge: 0.6 });
  mass({ x: -50, z: -300, rx: 230, rz: 140, h: 165, seed: 10, rot: 0.25, ridge: 0.75, snow: 132 });
  mass({ x: -170, z: -330, rx: 140, rz: 100, h: 128, seed: 18, rot: -0.4, ridge: 0.8, snow: 112 });
  mass({ x: 40, z: E(-150), rx: 70, rz: 50, h: 46, seed: 19, rot: 0.6, ridge: 0.85 });
  mass({ x: 4, z: E(92), rx: 38, rz: 24, h: 16, seed: 11, rot: -0.2, ridge: 0.6 });
  mass({ x: -22, z: E(70), rx: 24, rz: 16, h: 7, seed: 12, rot: 0.4, ridge: 0.6 });
  mass({ x: 26, z: E(72), rx: 22, rz: 16, h: 8, seed: 13, rot: -0.5, ridge: 0.6 });
  mass({ x: 60, z: 230, rx: 160, rz: 110, h: 92, seed: 14, rot: -0.3, ridge: 0.5 });
  // --- islets in the tarn
  mass({ x: 62, z: -28, rx: 9, rz: 6, h: 3.2, seed: 15, rot: 0.4, R: 8, S: 28 });
  mass({ x: -64, z: 34, rx: 11, rz: 7, h: 4, seed: 16, rot: -0.5, R: 8, S: 28 });
  mass({ x: 48, z: 64, rx: 6, rz: 5, h: 2.2, seed: 17, rot: 0.1, R: 6, S: 20 });
  // --- far ranges (1.4–4 km), hazy layers; the gap toward +X (the bay) stays low
  const far = [
    [150, 1500, 480, 260, 210, 2, 21], [185, 1900, 520, 280, 330, 1, 22], [215, 1600, 420, 240, 260, 2, 23], [250, 2300, 700, 300, 520, 1, 24],
    [285, 1700, 450, 260, 300, 2, 25], [320, 2100, 600, 300, 420, 1, 26], [65, 1500, 420, 240, 200, 2, 27], [95, 2000, 560, 280, 380, 1, 28],
    [120, 2700, 700, 320, 560, 1, 29], [40, 2500, 500, 220, 150, 3, 30], [-25, 2600, 520, 220, 130, 3, 31], [340, 2900, 700, 300, 480, 3, 32],
    [168, 3200, 900, 400, 640, 3, 33],
  ];
  for (const [a, d, rx, rz, h, f, s] of far) { const [x, z] = at(a, d); mass({ x, z, rx, rz, h, seed: s, rot: (a + 90) * DEG, far: f, snow: h * 0.72, R: 14, S: 56, ridge: 0.5, plain: true }); }
  // Octo Valley's domed hills (−X, far): round smooth domes
  for (const [a, d, r, h, s] of [[172, 2300, 260, 170, 41], [160, 2500, 200, 140, 42], [182, 2650, 240, 190, 43]]) { const [x, z] = at(a, d); mass({ x, z, rx: r, rz: r * 0.9, h, seed: s, plateau: true, far: 2, R: 12, S: 48, plain: true }); }
  // the far shore beyond the lip (+X, 1.2–2 km): low hazy hills framing the bay
  for (const [a, d, rx, rz, h, s] of [[-18, 1300, 380, 160, 70, 51], [28, 1250, 360, 150, 60, 52], [-40, 1800, 420, 180, 110, 53], [48, 1900, 400, 170, 95, 54]]) { const [x, z] = at(a, d); mass({ x, z, rx, rz, h, seed: s, rot: (a + 90) * DEG, far: 3, R: 12, S: 48, plain: true }); }

  // ---------------------------------------------------------------------------------------------- Inkopolis, far off
  // a low hazy skyline on the bay's far shore (+X, ~3.4 km): towers as boxes, a few lit windows at dusk (glow)
  const city = [];
  const cityC = [C('#b9c6d3'), C('#a6b5c4'), C('#cdd6de'), C('#98a9ba')];
  for (let i = 0; i < 46; i++) {
    const a = 2 + (rnd() - 0.5) * 22, d = 3400 + rnd() * 380, [x, z] = at(a, d);
    const w = 18 + rnd() * 34, h = 20 + Math.pow(rnd(), 2.2) * 150, dd = 18 + rnd() * 30;
    const g = xf(box(w, h, dd, '#ffffff'), x, WATER_Y + h / 2, z, rnd() * 1.5);
    kit.vcolorBy(g, () => cityC[i % 4]);
    city.push(g);
    if (h > 60) plains.push(xf(box(w * 0.72, h * 0.62, dd + 0.6, '#6e6558', 1), x, WATER_Y + h * 0.46, z, 0));
  }
  // the needle tower (Inkopolis Tower) — a thin spire with a lit top
  { const [x, z] = at(4, 3500); plains.push(xf(cyl(4, 14, 260, 8, '#c9d2dc'), x, WATER_Y + 130, z)); plains.push(xf(sph(9, 8, 6, '#ffd9a0', 1), x, WATER_Y + 262, z)); }
  plains.push(...city);

  // ---------------------------------------------------------------------------------------------- the summit crag's trig pillar
  { const x = -4, z = E(-96); const y = crag.heightAt(x, z); statics.push(xf(box(0.9, 1.4, 0.9, '#e8e6e0'), x, y + 0.6, z)); statics.push(xf(cyl(0.12, 0.12, 0.3, 8, '#9aa1a8'), x, y + 1.45, z)); }
  // a cairn line down the summit ridge + a few trail posts
  for (let i = 0; i < 6; i++) { const x = -24 - i * 10, z = -170 - i * 14, y = masses[9].isl.heightAt(x, z); if (y > WATER_Y + 2) statics.push(xf(sph(0.9, 6, 4, '#a39d94'), x, y + 0.4, z, 0, 0, 0, 1, 1.4, 1)); }

  // ---------------------------------------------------------------------------------------------- waterline boulders
  // a skirt of granite boulders along the arena's outer deck edges (never along the brooks inside the arena)
  // (a brook edge has the far bank within ~5.5 m straight out from it: skip those — the props dress the brooks)
  const segHit = (px, pz, dx, dz, L, self) => kit.runs.some((q) => {
    if (q === self) return false;
    const ux = (q.bx - q.ax) / q.len, uz = (q.bz - q.az) / q.len, ax = q.ax + ux * q.s0, az = q.az + uz * q.s0, bx = q.ax + ux * q.s1, bz = q.az + uz * q.s1;
    const ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-6) return false;
    const t = ((ax - px) * ez - (az - pz) * ex) / den, u = ((ax - px) * dz - (az - pz) * dx) / den;
    return t > 0.05 && t < L && u >= 0 && u <= 1;
  });
  const brookEdge = (run) => { const dx = (run.bx - run.ax) / run.len, dz = (run.bz - run.az) / run.len; let hits = 0; for (const f of [0.25, 0.5, 0.75]) { const s = run.s0 + (run.s1 - run.s0) * f; if (segHit(run.ax + dx * s + run.nx * 0.02, run.az + dz * s + run.nz * 0.02, run.nx, run.nz, 5.5, run)) hits++; } return hits >= 2; };
  const rockGeoB = (seed) => {
    // a smooth-ish boulder: per-direction radius from a few sines (never spiky: shared vertices get one radius)
    const g = new THREE.IcosahedronGeometry(1, 1), P = g.attributes.position, r = mulberry(seed), ph = [r() * 6, r() * 6, r() * 6];
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const k = 0.86 + 0.16 * Math.sin(x * 2.3 + ph[0]) * Math.sin(z * 2.1 + ph[1]) + 0.1 * Math.sin(y * 3.1 + ph[2]) + 0.05 * Math.sin((x + z) * 4.1 + ph[0]);
      P.setXYZ(i, x * k * 1.2, y * k * 0.7, z * k);
    }
    return g;
  };
  const rockGeos = [0, 1, 2, 3].map((s) => rockGeoB(900 + s));
  let nb = 0;
  for (const run of kit.runs) {
    const dx = (run.bx - run.ax) / run.len, dz = (run.bz - run.az) / run.len;
    if (brookEdge(run)) continue;   // a brook edge (the props dress those)
    const L = run.s1 - run.s0, n = Math.max(1, Math.round(L / 1.1));
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.22) continue;                                   // gaps: the rock lies in clusters, not a necklace
      const s = run.s0 + ((i + 0.2 + rnd() * 0.6) / n) * L, ex = run.ax + dx * s, ez = run.az + dz * s;
      const big = rnd() < 0.35, r = big ? 1.0 + rnd() * 0.7 : 0.5 + rnd() * 0.5, out = 0.15 + rnd() * (big ? 0.7 : 0.9);
      const g = rockGeos[(nb++) & 3].clone();
      xf(g, ex + run.nx * out, WATER_Y - 0.1 + (rnd() - 0.4) * 0.45, ez + run.nz * out, rnd() * 6.28, (rnd() - 0.5) * 0.3, 0, r, r * (0.75 + rnd() * 0.5), r * (0.8 + rnd() * 0.4));
      g.deleteAttribute('uv');
      const gp = g.index ? g.toNonIndexed() : g; gp.computeVertexNormals();
      const cc = new Float32Array(gp.attributes.position.count * 3), tone = 0.7 + rnd() * 0.3, base = C('#85827c');
      for (let k = 0; k < gp.attributes.position.count; k++) { const y = gp.attributes.position.getY(k) - WATER_Y, w = y < 0.25 ? 0.55 : y < 0.45 ? 0.8 : 1; cc[k * 3] = base.r * tone * w; cc[k * 3 + 1] = base.g * tone * w; cc[k * 3 + 2] = base.b * tone * w; }
      gp.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      plains.push(gp);   // (plain: the shore shader's foam band would paint rocks this small white)
    }
  }

  // ---------------------------------------------------------------------------------------------- crags
  // faceted granite tors on the knolls and crags close behind the domes (the finely meshed ones: the far massifs'
  // coarse meshes sit too far under their analytic height for anything to rest on them)
  const crags = [];
  for (const [mi, n, lo, hi] of [[6, 9, 0.2, 0.95], [7, 3, 0.3, 0.9], [8, 3, 0.3, 0.9], [12, 6, 0.2, 0.95], [13, 3, 0.3, 0.9], [14, 3, 0.3, 0.9]]) {
    const m = masses[mi];
    if (!m) continue;
    let k = 0, tries = 0;
    while (k < n && tries++ < n * 20) {
      const [x, z] = m.isl.sample(rnd, 0.7), y = m.isl.heightAt(x, z), f = (y - WATER_Y) / m.h;
      if (f < lo || f > hi) continue;
      const r = m.h * (0.06 + rnd() * 0.06);
      crags.push([x, y - r * 0.35, z, r, rnd() * 6.28]);
      k++;
    }
  }
  for (const [x, y, z, r, a] of crags) {
    const g = rockGeoB(300 + ((x * 7 + z) | 0));
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    xf(g, x, y, z, a, (rnd() - 0.5) * 0.3, 0, r * (1 + rnd() * 0.6), r * (0.7 + rnd() * 0.6), r);
    const gp = g.index ? g.toNonIndexed() : g; gp.computeVertexNormals();
    const cc = new Float32Array(gp.attributes.position.count * 3), tone = 0.78 + rnd() * 0.22, base = C('#8e8b85');
    for (let i = 0; i < gp.attributes.position.count; i += 3) { const ny = gp.attributes.normal.getY(i), v = tone * (0.85 + 0.2 * Math.max(0, ny)); for (let q = 0; q < 3; q++) { cc[(i + q) * 3] = base.r * v; cc[(i + q) * 3 + 1] = base.g * v; cc[(i + q) * 3 + 2] = base.b * v; } }
    gp.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    plains.push(gp);
  }

  // ---------------------------------------------------------------------------------------------- dwarf pines + boulders
  // instanced over the near masses' gentle slopes (not the far ranges): a leaning pine of stacked pads
  const pineGeo = (() => {
    const parts = [xf(cyl(0.18, 0.28, 2.2, 5, '#6b5544'), 0.2, 1.1, 0, 0, 0, -0.18)];
    for (const [x, y, z, s] of [[0.4, 1.7, 0, 1.3], [0.9, 2.4, 0.2, 1.05], [1.2, 3.0, -0.1, 0.75], [0.1, 1.2, -0.3, 0.9]]) parts.push(xf(sph(1, 7, 4, '#ffffff'), x, y, z, 0, 0, 0, s * 1.3, s * 0.55, s));
    return parts;
  })();
  const pineList = [], boulderList = [];
  const pineC = ['#4a6443', '#3f593b', '#56704c', '#3a5236'];
  for (const m of masses) {
    if (m.far || m.h < 3) continue;
    const want = Math.round(Math.min(260, m.rx * m.rz * 0.012));
    let placed = 0, tries = 0;
    while (placed < want && tries++ < want * 8) {
      const [x, z] = m.isl.sample(rnd, 0.85);
      if (Math.abs(x) < 30 && Math.abs(z) < 50 + D) continue;
      const y = m.isl.heightAt(x, z);
      if (y < WATER_Y + 1.4 || y > WATER_Y + 60) continue;
      const sl = Math.abs(m.isl.heightAt(x + 2, z) - m.isl.heightAt(x - 2, z)) + Math.abs(m.isl.heightAt(x, z + 2) - m.isl.heightAt(x, z - 2));
      if (sl > 3.2) continue;
      const cl = fbm(x * 0.013 + m.seed, z * 0.013 - m.seed, 3);   // pines gather in the thickets (the same noise as the colours)
      if (cl < 0.47 && rnd() > 0.25) continue;
      pineList.push([x, y - 0.15, z, 0.7 + rnd() * 0.9, rnd() * 6.28, pineC[(rnd() * 4) | 0]]);
      if (rnd() < 0.35) boulderList.push([x + (rnd() - 0.5) * 6, y - 0.2, z + (rnd() - 0.5) * 6, 0.5 + rnd() * 1.1, rnd() * 6.28, '#a09c94']);
      placed++;
    }
  }
  const merge = (parts) => {
    // tiny local merge (the environment merges the static lists; instanced geometry has to arrive merged)
    const geos = parts.map((g) => prep(g));
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), glow = new Float32Array(n);
    let o = 0;
    for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
    return out;
  };
  const pineMerged = merge(pineGeo);
  // shade the pine: trunk stays brown (vertex colour), pads take the instance colour; pads darker underneath
  { const P = pineMerged.attributes.position, Cc = pineMerged.attributes.color; for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (Cc.getX(i) > 0.9) { const k = 0.72 + 0.28 * Math.min(1, Math.max(0, (y - 0.8) / 2.6)); Cc.setXYZ(i, k, k, k); } } }
  const bGeo = (() => { const g = rockGeoB(77); g.deleteAttribute('uv'); g.computeVertexNormals(); return prep(g, '#ffffff'); })();

  return {
    static: statics,
    plain: plains,
    terrain: [],
    instances: [{ geo: pineMerged, list: pineList }, { geo: bGeo, list: boulderList }],
  };
}
