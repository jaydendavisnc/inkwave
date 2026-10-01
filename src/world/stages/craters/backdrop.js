// Turf War Craters — the stage's own far scenery (layout.env.backdrop; see the top of src/world/environment.js). Gets the
// environment's SCENERY_KIT (+ THREE, bounds, runs, rnd) — imports nothing, so layout.js stays importable in Node.
//
// The rest of the Cape's headland round the memorial park: the chalk downs run on beyond both pavilions — south toward
// the Cape's point (a car park, the coast road, the downs rising to a crest, pocked with more craters, some flooded,
// then falling to the point with its chalk stacks, the bay's lighthouse on its islet beyond), north onto the mainland
// (rolling downs, a farm, a chalk hill figure of a squid cut into the turf facing the park). White chalk cliffs all
// the way round, a cliff-top fence line, fallen chalk at every cliff foot — and at the park's own cliff edges. The
// flooded craters inside the park get still, dark water. `d` (bound in layout.js) = { coast, ponds, back, head, shelf,
// shelfW } (Alpha's half; back = the promontory's back edge z, head = its half width there, shelf = the coast edges with
// the undercliff shelf at their foot, shelfW its width).
export function buildBackdrop(kit, d = {}) {
  const { THREE, prep, xf, box, cyl, fbm, mulberry, WATER_Y } = kit;
  const W = WATER_Y;
  const rnd = mulberry(7031);
  const out = { static: [], plain: [], terrain: [], instances: [], objects: [] };
  const C = (hex) => new THREE.Color(hex);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerpTab = (tab, t) => {   // tab: [[t, v], …] ascending t → piecewise-smooth value
    if (t <= tab[0][0]) return tab[0][1];
    for (let i = 1; i < tab.length; i++) if (t <= tab[i][0]) { const [t0, v0] = tab[i - 1], [t1, v1] = tab[i], u = (t - t0) / (t1 - t0), s = u * u * (3 - 2 * u); return v0 + (v1 - v0) * s; }
    return tab[tab.length - 1][1];
  };
  const COL = {
    grass: C('#8fa266'), grassLt: C('#a9b477'), grassDk: C('#6f8752'), chalk: C('#eeebe2'), chalkDk: C('#c9c5b8'), flint: C('#5f5e5a'),
    algae: C('#5d6a4e'), tarmac: C('#6d6e6c'), line: C('#e9e6dc'), lane: C('#8a8578'), hedge: C('#4f6a3e'), water: C('#27434a'),
    wheat: C('#c9b98a'), field: C('#9aa86a'),
  };

  // ------------------------------------------------------------------------------------------ the headland's outline
  // half-widths / centre lines beyond each end of the park (z from the pavilion's back edge outward), metres
  // (both run on from the pavilion's promontory: as wide as its headland at the park's edge, spreading out beyond)
  const BK = Math.abs(d.back ?? -44), HW = d.head ?? 11.5;
  const SOUTH = { z0: -BK, zEnd: -166, c: [[0, 0], [25, -1], [55, -6], [85, -16], [105, -27], [121, -42]], w: [[0, HW], [3, HW + 1], [9, 19], [30, 27], [60, 24], [90, 15], [110, 7], [121, 1.2]] };
  const NORTH = { z0: BK, zEnd: 520, c: [[0, 0], [30, -3], [80, -10], [200, -30], [475, -40]], w: [[0, HW], [3, HW + 1], [10, 23], [40, 45], [120, 150], [260, 300], [475, 420]] };
  const hgtS = (x, s) => {   // s = metres beyond the park's south edge
    const crest = lerpTab([[0, 0], [10, 0], [45, 6], [70, 10], [95, 9], [121, 6]], s);
    const cx = lerpTab(SOUTH.c, s), w = lerpTab(SOUTH.w, s), e = Math.min(1, Math.abs(x - cx) / Math.max(1, w));
    return crest * (1 - 0.35 * e * e) + (fbm(x * 0.03 + 3.1, s * 0.03 - 1.7, 3) - 0.5) * 2.4 * smooth(6, 30, s);
  };
  const hgtN = (x, s) => {
    const crest = lerpTab([[0, 0], [10, 0], [45, 7], [110, 14], [220, 32], [475, 55]], s);
    const cx = lerpTab(NORTH.c, s), w = lerpTab(NORTH.w, s), e = Math.min(1, Math.abs(x - cx) / Math.max(1, w));
    return crest * (1 - 0.3 * e * e) + (fbm(x * 0.012 + 7.3, s * 0.012 + 2.9, 4) - 0.5) * 16 * smooth(30, 160, s) + (fbm(x * 0.05, s * 0.05, 2) - 0.5) * 2 * smooth(8, 40, s);
  };
  // craters in the downs beyond the park (x, s, radius, flooded?) — dimples with a low rim
  const CR_S = [[-6, 18, 5, 0], [9, 31, 4, 1], [-13, 46, 6, 0], [4, 58, 4.5, 1], [-20, 70, 5, 0], [-9, 86, 4, 0], [-26, 100, 3.5, 1]];
  const CR_N = [[7, 16, 5, 1], [-10, 28, 4, 0], [16, 44, 6, 0], [-4, 60, 5, 1], [-28, 52, 4.5, 0], [30, 78, 5, 0], [-18, 96, 7, 1], [8, 118, 5, 0]];
  const craterAt = (list, x, s) => { let dz = 0, wet = null; for (const [cx, cs, r, f] of list) { const q = Math.hypot(x - cx, s - cs) / r; if (q < 1.35) { dz += q < 1 ? -1.6 * (1 - q * q) : 0.45 * Math.sin(((q - 1) / 0.35) * Math.PI); if (f && q < 0.62) wet = [cx, cs, r]; } } return [dz, wet]; };
  // car parks behind the pavilions (flat, tarmac): x −11 … 11, s 5 … 18
  const PK = { x: 11, s0: 5, s1: 18 };
  const inPark = (x, s) => Math.abs(x) < PK.x && s > PK.s0 - 0.5 && s < PK.s1 + 0.5;

  // ------------------------------------------------------------------------------------------ land: top + cliffs
  // One ribbon grid per end (rows across the headland, columns between the two cliff edges), the cliff curtains hung
  // from both edges down into the sea. Vertex colours: downland turf, chalk scars, tracks, car park, craters.
  function landEnd(E, sgn, hgt, CR) {
    const rows = [], N = 44;
    let s = 0;
    while (s <= Math.abs(E.zEnd - E.z0) + 1e-6) { rows.push(s); s += s < 30 ? 2 : s < 120 ? 3 : 8; }
    const pos = [], col = [], idx = [];
    const edgeTop = [];
    const flooded = [];
    rows.forEach((s, r) => {
      const z = E.z0 + sgn * s, cx = lerpTab(E.c, s), w = lerpTab(E.w, s), x0 = cx - w, x1 = cx + w;
      for (let i = 0; i <= N; i++) {
        const t = i / N, x = x0 + (x1 - x0) * t;
        let y = hgt(x, s);
        const [dz, wet] = craterAt(CR, x, s);
        y += dz;
        if (wet) flooded.push(wet);
        const park = inPark(x, s), road = Math.abs(x - cx * 0.6) < 2.2 && s > 14;
        if (park) y = 0.0;
        if (s < 1.0) y = 0.0;                                  // flush with the park's back edge
        pos.push(x, y, z);
        // colour: turf by height / noise, chalk where steep, tracks, the car park
        const n = fbm(x * 0.08, z * 0.08, 3), c = COL.grass.clone().lerp(COL.grassLt, Math.max(0, n - 0.35) * 1.4).lerp(COL.grassDk, Math.max(0, 0.45 - n));
        if (dz < -0.6) c.lerp(COL.grassDk, 0.35);
        if (road) c.copy(COL.lane);
        if (park) c.copy(COL.tarmac);
        if (E === NORTH && s > 60 && fbm(x * 0.006 + 4, z * 0.006, 2) > 0.58) c.lerp(COL.wheat, 0.6);   // fields inland
        col.push(c.r, c.g, c.b);
        if (i === 0 || i === N) edgeTop.push({ x, y, z, side: i === 0 ? -1 : 1, s, r });
      }
      if (r > 0) for (let i = 0; i < N; i++) { const a = (r - 1) * (N + 1) + i, b = a + 1, c2 = a + N + 1, d2 = c2 + 1; idx.push(a, c2, b, b, c2, d2); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // (winding: rows run outward; flip for the south end so the top faces up)
    if (sgn < 0) { const I = g.index.array; for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; } g.computeVertexNormals(); }
    out.plain.push(prep(g));
    // cliff curtains: from each edge down into the sea, jagged chalk with flint bands, algae at the foot
    for (const side of [-1, 1]) {
      const E2 = edgeTop.filter((e) => e.side === side);
      const cp = [], cc = [], ci = [];
      const L = 5;
      E2.forEach((e, k) => {
        const nx = side, jag = (fbm(e.z * 0.21, side * 3.3, 2) - 0.5) * 1.6;
        const top = Math.max(e.y, W + 0.4);
        for (let l = 0; l <= L; l++) {
          const f = l / L, y = top + (W - 3.2 - top) * f;
          const o = (0.25 + 1.4 * f * f + Math.max(0, jag) * f + (l > 0 ? (fbm(e.z * 0.5, l * 1.7, 2) - 0.5) * 0.9 : 0)) * nx;
          cp.push(e.x + o, y, e.z);
          const band = Math.abs(Math.sin(y * 1.9 + e.z * 0.02)) > 0.93;
          const c = (l === 0 ? COL.grassDk : y < W + 0.6 ? COL.algae : band ? COL.flint : COL.chalk).clone();
          if (l > 0 && !band && y >= W + 0.6) c.lerp(COL.chalkDk, fbm(e.z * 0.3, y * 0.4, 2) * 0.6);
          cc.push(c.r, c.g, c.b);
        }
        if (k > 0) for (let l = 0; l < L; l++) { const a = (k - 1) * (L + 1) + l, b = a + 1, c2 = a + L + 1, d2 = c2 + 1; ci.push(a, b, c2, b, d2, c2); }
      });
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
      cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      cg.setIndex(ci);
      cg.computeVertexNormals();
      // face outward (away from the headland): flip when the computed normals point in
      const nArr = cg.attributes.normal.array;
      if (nArr[0] * side < 0) { const I = cg.index.array; for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; } cg.computeVertexNormals(); }
      out.static.push(prep(cg));
      // cliff-top fence posts + fallen chalk at the foot
      E2.forEach((e, k) => {
        if (k % 2 === 0 && e.y > 1.2 && e.s > 18) fence.push([e.x - side * 2.2, e.y, e.z]);
        if (rnd() < 0.8) rocks.push([e.x + side * (1.6 + rnd() * 3.5), W - 0.4 + rnd() * 0.5, e.z + (rnd() - 0.5) * 2, 0.6 + rnd() * 1.6, rnd() * 6]);
      });
    }
    // flooded craters: still water discs
    const seen = new Set();
    for (const [cx, cs, r] of flooded) { const key = cx + ':' + cs; if (seen.has(key)) continue; seen.add(key); pools.push([cx, E.z0 + sgn * cs, r * 0.62, hgt(cx, cs) - 1.15]); }
    return edgeTop;
  }
  const fence = [], rocks = [], pools = [];
  landEnd(SOUTH, -1, hgtS, CR_S);
  landEnd(NORTH, 1, hgtN, CR_N);

  // ------------------------------------------------------------------------------------------ the park's own cliff foot
  // (both halves: Alpha's coast from layout.js and its 180° twin) fallen chalk along the waterline
  const coast = d.coast || [];
  const inCoast = (x, z) => { let c = false; for (let i = 0, j = coast.length - 1; i < coast.length; j = i++) { const [xi, zi] = coast[i], [xj, zj] = coast[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  for (const sg of [1, -1]) coast.forEach((a, i) => {
    const b = coast[(i + 1) % coast.length];
    if ((a[1] === 0 && b[1] === 0) || (a[1] === -BK && b[1] === -BK)) return;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L;
    // outward normal: out of the park's outline
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, sn = inCoast(mx + nx * 0.1, mz + nz * 0.1) ? -1 : 1;
    const shelf = (d.shelf || []).includes(i) ? (d.shelfW || 2.4) : 0;   // (beyond the undercliff shelf where there is one)
    for (let t = 0.8; t < L; t += 2.2 + rnd() * 2.4) {
      const off = shelf + 0.5 + rnd() * 1.8, x = a[0] + ((b[0] - a[0]) * t) / L + nx * sn * off, z = a[1] + ((b[1] - a[1]) * t) / L + nz * sn * off;
      rocks.push([x * sg, W - 0.3 + rnd() * 0.3, z * sg, 0.3 + rnd() * 0.7, rnd() * 6]);
    }
  });

  // ------------------------------------------------------------------------------------------ the Cape's point
  // chalk stacks off the point (the lighthouse stands on its islet beyond, from the bay scenery)
  for (const [x, z, h, r] of [[-51, -171, 16, 3.2], [-56, -176, 22, 2.6], [-45, -178, 11, 2.2], [-60, -181, 7, 1.8]]) {
    const g = new THREE.CylinderGeometry(r * 0.72, r, h + 3, 9, 4);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const px = P.getX(i), py = P.getY(i), pz = P.getZ(i); const k = 1 + (fbm(px * 0.8 + x, py * 0.3 + pz, 2) - 0.5) * 0.35; P.setXYZ(i, px * k, py, pz * k); }
    g.computeVertexNormals();
    const cg = prep(g, '#ece9df');
    const cc = cg.attributes.color, pp = cg.attributes.position;
    for (let i = 0; i < cc.count; i++) { const y = pp.getY(i); const c = y > (h + 3) / 2 - 0.2 ? COL.grassDk : Math.abs(Math.sin(y * 1.7)) > 0.92 ? COL.flint : y < -(h + 3) / 2 + 1.2 ? COL.algae : COL.chalk; cc.setXYZ(i, c.r, c.g, c.b); }
    out.static.push(xf(cg, x, W - 1.5 + (h + 3) / 2, z));
  }

  // ------------------------------------------------------------------------------------------ inland: farm + chalk figure
  // a farmhouse and barns on the mainland, a line of hedges, the chalk squid cut into the turf of the hill facing the park
  const farm = (x, z, ry) => {
    const s = 22, y = hgtN(x, z - 45);
    out.static.push(xf(box(9, 5, 6, '#ece6d8'), x, y + 2.5, z, ry), xf(box(9.6, 0.4, 6.6, '#7b4a3b'), x, y + 5.2, z, ry));
    const roof = new THREE.CylinderGeometry(0.01, 4.8, 2.6, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1.4, 1, 0.9);
    out.static.push(xf(prep(roof, '#8a4a38'), x, y + 6.6, z, ry));
    out.static.push(xf(box(12, 4, 7, '#7a5e48'), x + 13, y + 2, z + 2, ry), xf(box(12.4, 0.3, 7.4, '#5d4c40'), x + 13, y + 4.1, z + 2, ry));
    void s;
  };
  farm(-70, 215, 0.3);
  // chalk figure: a big squid on the north hill's face toward the park (drawn as white quads just above the turf)
  {
    const fx = 24, fz = 215, pts = [];
    const shape = (u, v) => {   // u across, v up the figure (−1 … 1): the squid icon — arrowhead mantle + fins, head with two eyes, four tentacles
      const au = Math.abs(u);
      const mantle = v > 0.12 && v < 1.0 && au < Math.min(0.4, 0.5 * (1.0 - v) / 0.7);
      const fin = v > 0.5 && v < 0.98 && au < 0.62 * (0.98 - v) / 0.48 && au > 0.1 && v > 0.5 + (au - 0.1) * 0.35;
      const head = v > -0.3 && v <= 0.14 && au < 0.3;
      const eye = [-0.14, 0.14].some((c) => Math.hypot(u - c, v + 0.06) < 0.075);
      const tent = v < -0.28 && v > -0.97 && [-0.24, -0.08, 0.08, 0.24].some((c) => Math.abs(u - c * (1 + (-0.28 - v) * 0.55) - Math.sin(v * 6 + c * 10) * 0.03) < 0.05 - (-0.28 - v) * 0.02);
      return (mantle || fin || head || tent) && !eye;
    };
    const N = 72, F = 30, hgt = (x, z) => hgtN(x, z - 45) + 0.22;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const u0 = -1 + (2 * i) / N, v0 = -1 + (2 * j) / N, u1 = u0 + 2 / N, v1 = v0 + 2 / N;
      if (!shape((u0 + u1) / 2, (v0 + v1) / 2)) continue;
      const X = (u) => fx + u * F, Z = (v) => fz + v * F * 1.25;   // (stretched up the slope: it reads foreshortened from the park)
      const a = [X(u0), hgt(X(u0), Z(v0)), Z(v0)], b2 = [X(u1), hgt(X(u1), Z(v0)), Z(v0)], c2 = [X(u1), hgt(X(u1), Z(v1)), Z(v1)], d2 = [X(u0), hgt(X(u0), Z(v1)), Z(v1)];
      pts.push(...a, ...c2, ...b2, ...a, ...d2, ...c2);
    }
    if (pts.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.computeVertexNormals(); out.plain.push(prep(g, '#f1eee4')); }
  }
  // distant mainland hills beyond the downs (terrain shading), and the far side of the Cape's bay to the south-east — a
  // green headland that stands between the park and the city's container port (its cranes would fight the place)
  for (const [x, z, rx, rz, h, sd, rot, plateau] of [[-120, 560, 260, 140, 70, 41, 0.2], [160, 610, 300, 160, 95, 42, 0.2], [-380, 470, 200, 130, 60, 43, 0.2], [206, -262, 206, 112, 56, 44, -0.66, true]]) {
    const isl = kit.makeIsland({ x, z, rx, rz, h, seed: sd, rot, plateau: !!plateau, R: 16, S: 60, grass: '#98ad70', ridge: 0.35 });
    if (!plateau) { out.terrain.push(isl.geo); continue; }
    // the flat-topped down across the bay: turf on top, white chalk cliffs all round (own vertex colours, not the
    // terrain shader's grey rock)
    // (makeIsland's `glow` attribute is its baked fold AO for the terrain shader: here it goes into the colour and the
    // attribute is zeroed — in the plain scenery material `glow` means a lamp lit at dusk)
    const g = isl.geo, P = g.attributes.position, Nn = g.attributes.normal, Cc = g.attributes.color, Gl = g.attributes.glow;
    for (let i = 0; i < P.count; i++) {
      const ny = Nn.getY(i), y = P.getY(i), n = fbm(P.getX(i) * 0.05, P.getZ(i) * 0.05, 2), ao = Gl ? Gl.getX(i) : 1;
      const c = (ny > 0.8 ? COL.grass.clone().lerp(COL.grassLt, n * 0.6) : ny > 0.62 ? COL.grassDk.clone() : y < W + 1.2 ? COL.algae.clone() : (Math.abs(Math.sin(y * 0.9)) > 0.95 ? COL.flint.clone() : COL.chalk.clone().lerp(COL.chalkDk, n * 0.5))).multiplyScalar(0.55 + 0.45 * ao);
      Cc.setXYZ(i, c.r, c.g, c.b);
      if (Gl) Gl.setX(i, 0);
    }
    out.static.push(g);
  }

  // ------------------------------------------------------------------------------------------ car parks behind the pavilions
  for (const sg of [-1, 1]) {
    const z0 = sg * (BK + PK.s0), z1 = sg * (BK + PK.s1), zr = [BK + PK.s0 + 3.2, BK + PK.s1 - 3.2];
    // white bay lines
    for (const zz of zr) for (let x = -9.45; x <= 9.45; x += 2.7) out.plain.push(xf(box(0.12, 0.02, 5.0, '#e8e5dc'), x, 0.02, sg * zz));
    // a few parked cars (simple rounded bodies + cabins)
    const cols = ['#b34a3f', '#3f6f9a', '#d9d4c7', '#4a5a4f', '#c9a44a', '#2f3440'];
    for (let k = 0; k < 7; k++) {
      const x = -8.1 + Math.floor(rnd() * 7) * 2.7, z = sg * (rnd() < 0.5 ? zr[0] : zr[1]), c = cols[k % cols.length];
      out.static.push(xf(box(1.7, 0.7, 3.9, c), x, 0.55, z), xf(box(1.5, 0.55, 2.1, c), x, 1.15, z - sg * 0.2), xf(box(1.45, 0.4, 2.0, '#2c3b44'), x, 1.17, z - sg * 0.2));
      for (const [wx, wz] of [[-0.8, 1.2], [0.8, 1.2], [-0.8, -1.2], [0.8, -1.2]]) out.static.push(xf(cyl(0.33, 0.33, 0.24, 8, '#1c1d20'), x + wx, 0.33, z + wz, 0, 0, Math.PI / 2));
    }
    // kerbs round the car park
    out.plain.push(xf(box(2 * PK.x, 0.15, 0.3, '#cfcac0'), 0, 0.075, z1), xf(box(2 * PK.x, 0.15, 0.3, '#cfcac0'), 0, 0.075, z0));
    for (const s of [-1, 1]) out.plain.push(xf(box(0.3, 0.15, Math.abs(z1 - z0), '#cfcac0'), s * PK.x, 0.075, (z0 + z1) / 2));
    void sg;
  }

  // ------------------------------------------------------------------------------------------ instanced bits
  // fence posts, fallen chalk, hedges / gorse on the downs
  const postGeo = box(0.12, 1.1, 0.12, '#7a654e');
  postGeo.translate(0, 0.55, 0);
  out.instances.push({ geo: postGeo, list: fence.map(([x, y, z]) => [x, y, z, 1, 0]) });
  const rockGeo = (() => {   // a faceted, jittered lump of fallen chalk
    const g = new THREE.IcosahedronGeometry(0.7, 1), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = 0.75 + 0.4 * fbm(x * 3 + 1.3, y * 3 + z * 2.1, 2); P.setXYZ(i, x * k * 1.25, y * k * 0.7, z * k); }
    g.computeVertexNormals();
    return prep(g, '#e4e0d4');
  })();
  out.instances.push({ geo: rockGeo, list: rocks.map(([x, y, z, s, r]) => [x, y, z, s, r, rnd() < 0.3 ? '#cfcabd' : '#ecE8dc']) });
  const bushGeo = prep(new THREE.IcosahedronGeometry(1, 1).scale(1.3, 0.7, 1.0), '#ffffff');
  const bushes = [];
  for (let k = 0; k < 90; k++) {
    const south = k < 40, s = south ? 20 + rnd() * 90 : 20 + rnd() * 220, E = south ? SOUTH : NORTH, w = lerpTab(E.w, s) * 0.85, cx = lerpTab(E.c, s);
    const x = cx + (rnd() * 2 - 1) * w, z = E.z0 + (south ? -1 : 1) * s;
    if (inPark(x, s)) continue;
    const y = (south ? hgtS : hgtN)(x, s);
    bushes.push([x, y + 0.1, z, 0.55 + rnd() * 0.9, rnd() * 6, rnd() < 0.4 ? '#56703f' : '#4a6238']);
  }
  out.instances.push({ geo: bushGeo, list: bushes });

  // ------------------------------------------------------------------------------------------ still water in the flooded craters
  // (all the water discs in one mesh: one draw call)
  const waterMat = new THREE.MeshStandardMaterial({ color: COL.water, roughness: 0.08, metalness: 0.1, envMapIntensity: 1.0 });
  const discs = [];
  const disc = (x, y, z, r) => { const g = new THREE.CircleGeometry(r, 36); g.rotateX(-Math.PI / 2); g.translate(x, y, z); discs.push(g); };
  for (const p of d.ponds || []) for (const sg of [1, -1]) disc(p.c[0] * sg, W + 0.05, p.c[1] * sg, p.r / Math.cos(Math.PI / 12) + 0.01);
  for (const [x, z, r, y] of pools) disc(x, y, z, r);
  if (discs.length) {
    const pos = [], nor = [], idx = [];
    for (const g of discs) { const o = pos.length / 3, P = g.attributes.position, I = g.index.array; for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(0, 1, 0); } for (const k of I) idx.push(k + o); g.dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, waterMat); m.receiveShadow = true; m.name = 'craters:ponds';
    out.objects.push(m);
  }
  return out;
}
