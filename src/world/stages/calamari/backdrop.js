// Calamari County — the stage's own far scenery (layout.env.backdrop; see the top of src/world/environment.js). Gets the
// environment's SCENERY_KIT (+ THREE, bounds, runs, rnd) — imports nothing, so layout.js stays importable in Node.
//
// The village sits on a neck of land between two coves; the railway tunnels through a headland at each end. Per half
// (Alpha's south-west, Bravo's north-east, the 180° twin): the hill rising behind the terraces' retaining walls and the
// co-op (a coast-hugging heightfield: clipped hard at the stage's walls, sloping into the sea along the coves), the
// headland over the tunnel portal, snow-laden pines, the rest of the village's houses climbing the slope (snow on the
// roofs, lit windows at dusk), telegraph poles along the coast road; out at sea the outer breakwater with its white
// light, drifting ice floes, and snowy mountains inland on the horizon.
//
// The Long Stages stretch (stretch.js): the co-op and the hill behind it moved out by D with the base; the land behind
// the co-op, the hill houses' slope and the village beyond follow it (ZB, the co-op's back), the hill runs on beside
// the new land (the high street's allotments).
import { STRETCH } from './stretch.js';

export function buildBackdrop(kit) {
  const { THREE, box, cyl, prep, xf, triGeo, makeIsland, fbm, smooth, WATER_Y, rnd } = kit;
  const R = rnd(4242);
  const out = { static: [], plain: [], terrain: [], instances: [], objects: [] };

  // ------------------------------------------------------------------------------------------ the land (SW frame)
  // coast lines (Alpha's frame: the hill + west headland at x < −33.9, the co-op's back at z < −48.2)
  const HX = -33.9, D = STRETCH.d, ZB = -48.2 - D;   // the hill's foot; the co-op's back (z −68.7)
  const coastN = (x) => 9.4 + 0.3 * (HX - x) + 2.2 * Math.sin(x * 0.13) + 1.2 * Math.sin(x * 0.41);   // headland's north shore (z)
  const coastS = (z) => 11.2 + 0.62 * (ZB - z) + 1.8 * Math.sin(z * 0.17);                            // the south-east shore (x)
  // the land, as (height above the sea, or null = water / the stage): hard-clipped at the stage's walls, sloping into
  // the sea along the coves
  function landH(x, z) {
    let h = -Infinity;
    const n = fbm(x * 0.045 + 3.1, z * 0.045 - 1.7, 4), n2 = fbm(x * 0.11 - 7.0, z * 0.11 + 2.0, 3);
    // the hill + the west headland over the tunnel
    if (x <= HX && z <= coastN(x) + 6) {
      const u = HX - x, toSea = coastN(x) - z;
      let e = 4.6 + 0.5 * Math.pow(u, 1.08) + 5.5 * smooth(13, 0, Math.abs(z)) + 0.12 * Math.max(0, -z - 10);
      // (the shore slope widens with the hill's height: no sheer snow walls down to the sea at the headland's ends)
      e *= smooth(-2, 14 + 1.1 * u, toSea);
      h = Math.max(h, e - (toSea < 0 ? 3 - toSea * 2 : 0));
    }
    // behind T2's west end and the hill houses (the hill houses stand in it)
    if (x <= HX && z <= -37.3 - D) h = Math.max(h, 5.8 + 0.35 * (-37.3 - D - z) + 0.4 * (HX - x));
    if (x <= -9.1 && z <= -40.6 - D) h = Math.max(h, 4.2 + 0.4 * (-40.6 - D - z) + 0.12 * (-9.1 - x));
    // behind the co-op (low first — the warehouse's back yard — then climbing), sloping into the south-east cove
    if (z <= ZB && x <= coastS(z) + 6) {
      const v = ZB - z, toSea = coastS(z) - x;
      let e = 1.8 + (v > 7 ? 0.62 * Math.pow(v - 7, 1.05) : 0) + 0.05 * Math.max(0, -x);
      e *= smooth(-2, 8 + 1.1 * e, toSea);   // (a shore slope as wide as the hill is high: no snow cliff in the spawn's view)
      h = Math.max(h, e - (toSea < 0 ? 3 - toSea * 2 : 0));
    }
    if (!Number.isFinite(h)) return null;
    const far = Math.hypot(x + 20, z + 30);
    h += (n - 0.5) * 5 * smooth(8, 30, far) + (n2 - 0.5) * 1.6 + 0.08 * Math.max(0, far - 60);
    // far out: a soft cap (no flat table-top) and the land sinking into the sea before the far grid's outer edges
    // (x −200, z −220), so no square-cut plateau shows through the haze behind the hills
    if (h > 38) h = 38 + (h - 38) * 0.4;
    const fade = smooth(0, 70, Math.min(x + 200, z + 220));
    return Math.min(h * fade - 5 * (1 - fade), 62);
  }
  // heightfield mesh over a rectangle (grid step s), clipped to the land; vertex colour = winter meadow tint
  function heightfield(x0, x1, z0, z1, s, tint) {
    const nx = Math.round((x1 - x0) / s), nz = Math.round((z1 - z0) / s), H = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + i * s, z = z0 + j * s, h = landH(x, z);
      H.push(h == null ? -4 : h);
    }
    // indexed grid (smooth normals), then only the cells with land in them
    const vp = [], vc = [], c = new THREE.Color(tint), idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + i * s, z = z0 + j * s, t = 0.92 + 0.1 * Math.sin(x * 0.7 + z * 0.3);
      vp.push(x, WATER_Y + H[j * (nx + 1) + i], z); vc.push(c.r * t, c.g * t, c.b * t);
    }
    const id = (i, j) => j * (nx + 1) + i;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const hs = [H[id(i, j)], H[id(i + 1, j)], H[id(i, j + 1)], H[id(i + 1, j + 1)]];
      if (Math.max(...hs) < -1) continue;   // all under the sea: skip
      idx.push(id(i, j), id(i, j + 1), id(i + 1, j), id(i + 1, j), id(i, j + 1), id(i + 1, j + 1));
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g = g.toNonIndexed();
    g.setAttribute('glow', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
    return g;
  }
  const mirror = (g) => xf(g, 0, 0, 0, Math.PI);
  const winter = '#7b8466';
  // near land (fine) + far land (coarse), for both halves
  const nearA = heightfield(-72, 16, -96 - D, 30, 1.6, winter), farA = heightfield(-200, 40, -220, 60, 6, winter);
  // the far grid skips the near window (no double surfaces): punch it out by culling triangles inside it
  const cull = (g, x0, x1, z0, z1) => {
    const p = g.attributes.position.array, nr = g.attributes.normal.array, keep = [], cols = g.attributes.color.array, keepC = [], keepN = [], gl = [];
    for (let t = 0; t < p.length; t += 9) {
      const cx = (p[t] + p[t + 3] + p[t + 6]) / 3, cz = (p[t + 2] + p[t + 5] + p[t + 8]) / 3;
      if (cx > x0 && cx < x1 && cz > z0 && cz < z1) continue;
      for (let k = 0; k < 9; k++) { keep.push(p[t + k]); keepC.push(cols[t + k]); keepN.push(nr[t + k]); }
      gl.push(1, 1, 1);
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
    ng.setAttribute('normal', new THREE.Float32BufferAttribute(keepN, 3));
    ng.setAttribute('color', new THREE.Float32BufferAttribute(keepC, 3));
    ng.setAttribute('glow', new THREE.Float32BufferAttribute(gl, 1));
    return ng;
  };
  const farA2 = cull(farA, -72 + 3, 16 - 3, -96 - D + 3, 30 - 3);
  out.terrain.push(nearA, farA2, mirror(nearA.clone()), mirror(farA2.clone()));

  // ------------------------------------------------------------------------------------------ pines + bare trees
  const pine = (() => {
    const parts = [xf(cyl(0.12, 0.2, 1.4, 6, '#4a3a2e'), 0, 0.7, 0)];
    for (let t = 0; t < 4; t++) {
      const f = t / 3, r = 1.5 * (1 - f) + 0.35, y = 1.0 + f * 3.6;
      parts.push(xf(cyl(0.05, r, 1.5, 8, '#2f4a3a'), 0, y + 0.75, 0, t * 0.4));
      parts.push(xf(cyl(0.03, r * 0.9, 0.6, 8, '#eef3f8'), 0, y + 1.2, 0, t * 0.4 + 0.2));
    }
    parts.push(xf(cyl(0, 0.22, 0.5, 6, '#eef3f8'), 0, 5.6, 0));
    return mergeGeos(parts);
  })();
  function mergeGeos(list) {
    const pos = [], nor = [], col = [], glow = [];
    for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); col.push(...g.attributes.color.array); glow.push(...(g.attributes.glow ? g.attributes.glow.array : new Float32Array(g.attributes.position.count))); }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    m.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    m.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 1));
    return m;
  }
  const trees = [];
  const place = (list, n, x0, x1, z0, z1, minH, maxH, scale, fn) => {
    for (let k = 0, tries = 0; k < n && tries < n * 30; tries++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0), h = landH(x, z);
      if (h == null || h < minH || h > maxH) continue;
      // keep clear of the stage (the walls) and steep cliff edges
      if (x > HX - 1.6 && z > -40 - D) continue;
      if (z > -50 - D && x > -11) continue;
      const hx = landH(x + 1.5, z), hz = landH(x, z + 1.5);
      if (hx == null || hz == null || Math.abs(hx - h) > 1.6 || Math.abs(hz - h) > 1.6) continue;
      const s = scale[0] + R() * (scale[1] - scale[0]);
      const item = [x, WATER_Y + h - 0.2, z, s, R() * 6.28];
      list.push(item); if (fn) fn(item); k++;
    }
  };
  place(trees, 190, -95, 8, -110 - D, 22, 3, 60, [0.8, 1.5]);
  const treesAll = [...trees, ...trees.map(([x, y, z, s, r]) => [-x, y, -z, s, r])];
  out.instances.push({ geo: pine, list: treesAll });

  // ------------------------------------------------------------------------------------------ the village beyond
  // little two-storey houses with snowy gable roofs up the slope behind the co-op and the hill houses (lit windows at
  // dusk: glow 1), plus a few sheds; one instanced geometry, tinted per instance
  const house = (() => {
    const w = 5, d = 4.4, h1 = 2.6, h2 = 2.2;
    const parts = [xf(box(w, h1, d, '#5a4333'), 0, h1 / 2, 0), xf(box(w - 0.3, h2, d - 0.3, '#e7e1d4'), 0, h1 + h2 / 2, 0)];
    // windows (glow at dusk)
    for (const s of [-1, 1]) { parts.push(xf(box(1.2, 0.8, 0.05, '#ffdca8', 1), s * 1.2, h1 + 1.1, d / 2 - 0.12)); parts.push(xf(box(1.0, 0.7, 0.05, '#ffdca8', 1), s * 1.3, 1.3, d / 2 + 0.03)); }
    // roof: a gable prism (kawara) with a thick snow slab on each slope
    const rw = w + 1.2, rd = d + 1.4, rh = 1.5;
    const tri = (a, b, c, hex) => triGeo([...a, ...b, ...c], hex, true);
    const y0 = h1 + h2;
    for (const s of [-1, 1]) {
      const q = [[-rw / 2, y0, s * rd / 2], [rw / 2, y0, s * rd / 2], [rw / 2, y0 + rh, 0], [-rw / 2, y0 + rh, 0]];
      parts.push(tri(q[0], q[1], q[2], '#454d58'), tri(q[0], q[2], q[3], '#454d58'));
      const lift = (p) => [p[0] * 0.97, p[1] + 0.22, p[2] * 0.9];
      parts.push(tri(lift(q[0]), lift(q[1]), lift(q[2]), '#f2f5f9'), tri(lift(q[0]), lift(q[2]), lift(q[3]), '#f2f5f9'));
    }
    for (const s of [-1, 1]) parts.push(tri([s * (w / 2 - 0.15), y0, -(d / 2 - 0.15)], [s * (w / 2 - 0.15), y0, d / 2 - 0.15], [s * (w / 2 - 0.15), y0 + rh - 0.1, 0], '#e7e1d4'));
    parts.push(xf(box(0.45, 1.3, 0.45, '#8f8a82'), 1.4, y0 + rh, -0.6));
    return mergeGeos(parts);
  })();
  const houses = [];
  const houseSpots = [];
  for (let k = 0, tries = 0; k < 34 && tries < 2000; tries++) {
    const x = -62 + R() * 72, z = -92 - D + R() * 56;
    if (!(z < -51 - D || x < HX - 3.5)) continue;
    const h = landH(x, z);
    if (h == null || h < 2 || h > 26) continue;
    if (houseSpots.some(([a, b]) => Math.hypot(a - x, b - z) < 7.5)) continue;
    const hx = landH(x + 3, z), hz = landH(x, z + 3);
    if (hx == null || hz == null || Math.abs(hx - h) > 2.4 || Math.abs(hz - h) > 2.4) continue;
    houseSpots.push([x, z]);
    const tints = ['#ffffff', '#f4efe6', '#e9eef2', '#f6ece0'];
    // face the sea (roughly north-east), a little random
    houses.push([x, WATER_Y + Math.min(h, hx, hz) - 0.3, z, 0.9 + R() * 0.25, Math.PI * 0.8 + (R() - 0.5) * 0.5, tints[k % tints.length]]);
    k++;
  }
  out.instances.push({ geo: house, list: [...houses, ...houses.map(([x, y, z, s, r, c]) => [-x, y, -z, s, r + Math.PI, c])] });

  // ------------------------------------------------------------------------------------------ telegraph poles
  // along the coast road over the headland (the line of poles tells the road)
  const poleGeo = mergeGeos([xf(cyl(0.12, 0.16, 8, 6, '#5d4a3c'), 0, 4, 0), xf(box(1.6, 0.14, 0.14, '#5d4a3c'), 0, 7.4, 0), xf(box(1.2, 0.12, 0.12, '#5d4a3c'), 0, 6.8, 0), xf(box(0.3, 0.1, 0.3, '#eef3f8'), 0, 8.05, 0)]);
  const poles = [];
  for (let k = 0; k < 8; k++) { const x = HX - 7.5 - k * 9, z = coastN(x) - 6 - Math.sin(k) * 1.5, h = landH(x, z); if (h != null) poles.push([x, WATER_Y + h - 0.3, z, 1, 0.4]); }
  out.instances.push({ geo: poleGeo, list: [...poles, ...poles.map(([x, y, z, s, r]) => [-x, y, -z, s, r + Math.PI])] });
  // wires between the poles
  for (const sg of [1, -1]) for (let k = 0; k < poles.length - 1; k++) {
    const [ax, ay, az] = poles[k], [bx, by, bz] = poles[k + 1];
    for (const o of [-0.7, 0.7]) {
      const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(sg * (ax + (bx - ax) * t + o * 0.3), ay + 7.35 + (by - ay) * t - 0.6 * 4 * t * (1 - t), sg * (az + (bz - az) * t + o))); }
      out.plain.push(prep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.025, 3, false), '#2a2a2a'));
    }
  }

  // ------------------------------------------------------------------------------------------ the outer breakwater
  // a long concrete-block breakwater guarding the cove, with a white harbour light at its head (blinks at dusk)
  const bw = [];
  const A = [38, -19], Bp = [53, -43], L = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]), ang = Math.atan2(Bp[0] - A[0], Bp[1] - A[1]);
  bw.push(xf(box(3.4, 3.0, L, '#9a978f'), (A[0] + Bp[0]) / 2, WATER_Y + 1.2, (A[1] + Bp[1]) / 2, ang));
  for (let k = 0; k < 26; k++) {
    const t = R(), x = A[0] + (Bp[0] - A[0]) * t, z = A[1] + (Bp[1] - A[1]) * t, s = 0.8 + R() * 0.6, side = R() > 0.5 ? 1 : -1;
    bw.push(xf(box(1.6 * s, 1.2 * s, 1.6 * s, '#b0ada6'), x + Math.cos(ang) * side * 2.4, WATER_Y + 0.3, z - Math.sin(ang) * side * 2.4, R() * 3, R(), R()));
  }
  bw.push(xf(cyl(1.0, 1.25, 6.5, 14, '#f1f0ec'), Bp[0], WATER_Y + 5.9, Bp[1]));
  bw.push(xf(cyl(1.5, 1.5, 0.3, 14, '#3d4247'), Bp[0], WATER_Y + 9.2, Bp[1]));
  bw.push(xf(cyl(0.7, 0.7, 1.1, 10, '#ffeab8', 2), Bp[0], WATER_Y + 9.9, Bp[1]));
  bw.push(xf(cyl(0.1, 0.95, 0.8, 10, '#3d4247'), Bp[0], WATER_Y + 10.8, Bp[1]));
  bw.push(xf(cyl(1.6, 1.6, 0.35, 14, '#eef3f8'), Bp[0], WATER_Y + 9.45, Bp[1]));
  const bwGeo = mergeGeos(bw);
  out.static.push(bwGeo, mirror(bwGeo.clone()));

  // ------------------------------------------------------------------------------------------ ice floes out at sea
  const floe = (() => {
    const pts = [], n = 9;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, r = 0.8 + 0.3 * Math.sin(i * 2.7); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    const tris = [];
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; tris.push(0, 0.12, 0, a[0], 0.12, a[1], b[0], 0.12, b[1]); tris.push(a[0], 0.12, a[1], a[0], -0.1, a[1], b[0], 0.12, b[1], b[0], 0.12, b[1], a[0], -0.1, a[1], b[0], -0.1, b[1]); }
    return triGeo(tris, '#e8f0f6', true);
  })();
  const floes = [];
  for (let k = 0; k < 60; k++) {
    const a = -0.9 + R() * 1.4, r = 36 + R() * 70, x = Math.cos(a) * r + 6, z = -Math.sin(a) * r * 0.9 - 30;
    if ((x < 38 && z > -60 - D) || z > -14) continue;
    floes.push([x, WATER_Y + 0.02, z, 1.2 + R() * 3.5, R() * 6.28]);
  }
  out.instances.push({ geo: floe, list: [...floes, ...floes.map(([x, y, z, s, r]) => [-x, y, -z, s, r])] });

  // ------------------------------------------------------------------------------------------ mountains inland
  // big snowy mountains on the horizon behind both hills (the snow line in env.snow does their caps)
  for (const [x, z, rx, rz, h, seed] of [[-300, -200, 170, 120, 150, 3], [-120, -330, 160, 110, 120, 5], [-360, 40, 120, 160, 110, 8], [60, -360, 140, 90, 90, 11]]) {
    for (const sg of [1, -1]) {
      const isl = makeIsland({ x: sg * x, z: sg * z, rx, rz, h, seed: seed + (sg > 0 ? 0 : 20), R: 14, S: 48, grass: '#6f7a62', ridge: 0.5 });
      out.terrain.push(isl.geo);
    }
  }
  return out;
}
