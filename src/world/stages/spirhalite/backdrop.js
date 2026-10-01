// Spirhalite Islands — the stage's own world round it (layout.env.backdrop; see the top of src/world/environment.js).
// Gets the environment's SCENERY_KIT (+ THREE, bounds, runs, rnd, U, sceneryMaterial). Imports only this stage's pure data
// modules (no three), so layout.js stays importable in Node.
//   • sandy banks under every edge of the landmass outline, sloping into the sea (terrain shading: sand, wet sand and
//     the foam line at the water), narrower where a channel is tight so the water always shows between islands
//   • shore rocks and boulders along the waterline (instanced)
//   • the far archipelago in the mist: sheer-sided islets with green tops and monstera palms, sea stacks, another great
//     arch, tiered pillars standing in the sea as grey silhouettes (one with its own cascade)
//   • the arena's live pieces: the two cascade pillars' water (animated sheets, splash, foam) and the drips falling from
//     the Great Arch's underside over the centre
import { SHORES, PILLAR as PILLAR_AT } from './outline.js';
import { ARCH } from './props-ruins.js';

// the arena's cascade pillars (Alpha's; Bravo's is the mirror) and the way each pours (east, into the bay beside it);
// the plinth's and tier's faces (apothems) and the headland's shore that the water runs over
const AP = Math.cos(Math.PI / 8);
export const PILLAR = { x: PILLAR_AT.x, z: PILLAR_AT.z, dir: [1, 0], tier: PILLAR_AT.tier * AP, plinth: PILLAR_AT.plinth * AP, shore: PILLAR_AT.isle };

export function buildBackdrop(kit) {
  const { THREE, box, cyl, sph, prep, xf, makeIsland, fbm, DEG, WATER_Y, U } = kit;
  const rnd = kit.rnd(9127);
  const out = { static: [], plain: [], terrain: [], instances: [], objects: [] };
  // ============================================================================================== sandy banks
  // every shore (the S and the two pillar islets): outward normal per edge, averaged at the vertices; reach limited by
  // the open water in front (a ray to any shore's edges)
  const EDGES = [];   // [ax, az, bx, bz, shore, index]
  SHORES.forEach(({ poly }, si) => poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; EDGES.push([p[0], p[1], q[0], q[1], si, i]); }));
  const gapAlong = (x, z, nx, nz, si, skip) => {
    let best = 40;
    for (const [ax, az, bx, bz, sj, j] of EDGES) {
      if (sj === si && skip.includes(j)) continue;
      const ex = bx - ax, ez = bz - az;
      const den = nx * ez - nz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - x) * ez - (az - z) * ex) / den, u = ((ax - x) * nz - (az - z) * nx) / den;
      if (t > 0.05 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best;
  };
  const bankParts = [], rocks = [];
  SHORES.forEach(({ poly, level }, si) => {
    const n = poly.length;
    const area = poly.reduce((a, p, i) => { const q = poly[(i + 1) % n]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
    const sgn = area > 0 ? 1 : -1;
    const edgeN = poly.map((p, i) => { const q = poly[(i + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz); return [(dz / l) * sgn, (-dx / l) * sgn]; });   // outward
    for (let i = 0; i < n; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n], L = Math.hypot(bx - ax, bz - az);
      const [nx, nz] = edgeN[i], [pnx, pnz] = edgeN[(i + n - 1) % n], [qnx, qnz] = edgeN[(i + 1) % n];
      const top = level(i) - 0.04;
      const m = Math.max(1, Math.ceil(L / 0.9)), rows = [];
      for (let k = 0; k <= m; k++) {
        const t = k / m, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        // blend the normal toward the neighbours' at the ends (continuous banks round corners)
        let ux = nx, uz = nz;
        if (k === 0) { ux = nx + pnx; uz = nz + pnz; } else if (k === m) { ux = nx + qnx; uz = nz + qnz; }
        const ul = Math.hypot(ux, uz); ux /= ul; uz /= ul;
        const g = gapAlong(x, z, ux, uz, si, [i, (i + n - 1) % n, (i + 1) % n]);
        const reach = Math.max(0.45, Math.min(2.3, 0.3 * g)) * (0.85 + 0.3 * fbm(x * 0.21, z * 0.21, 2));
        const prof = [[0.02, top], [reach * 0.42, -0.95 + 0.25 * fbm(x * 0.4 + 3, z * 0.4, 2)], [reach, -1.72], [reach + 0.9, -2.7]];
        rows.push(prof.map(([d, y]) => [x + ux * d, y, z + uz * d]));
      }
      const pos = [];
      for (let k = 0; k < m; k++) for (let r = 0; r < 3; r++) {
        const a = rows[k][r], b = rows[k + 1][r], c = rows[k + 1][r + 1], d = rows[k][r + 1];
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      // make sure every triangle faces outward/up (the winding depends on the outline's direction)
      const P = geo.attributes.position, N = geo.attributes.normal;
      if (N.getY(0) < 0) { for (let v = 0; v < P.count; v += 3) { const x1 = P.getX(v + 1), y1 = P.getY(v + 1), z1 = P.getZ(v + 1); P.setXYZ(v + 1, P.getX(v + 2), P.getY(v + 2), P.getZ(v + 2)); P.setXYZ(v + 2, x1, y1, z1); } geo.computeVertexNormals(); }
      const col = new Float32Array(P.count * 3), c = new THREE.Color('#e3d8c2');
      for (let v = 0; v < P.count; v++) { const kk = 0.94 + 0.08 * fbm(P.getX(v) * 0.5, P.getZ(v) * 0.5, 2); col[v * 3] = c.r * kk; col[v * 3 + 1] = c.g * kk; col[v * 3 + 2] = c.b * kk; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const glow = new Float32Array(P.count).fill(1);   // (terrain: glow = baked fold AO → 1 = none)
      geo.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
      bankParts.push(geo);
      // shore rocks and boulders along the waterline where the water in front is wide enough
      for (let s2 = 0.7; s2 < L; s2 += 1.6 + rnd() * 2.2) {
        const t = s2 / L, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const g = gapAlong(x, z, nx, nz, si, [i]);
        if (g < 2.6) continue;
        const d = 0.9 + rnd() * Math.min(1.4, g * 0.25), sc = 0.35 + rnd() * 0.75;
        rocks.push([x + nx * d, WATER_Y - 0.25 + rnd() * 0.3, z + nz * d, sc, rnd() * 6.28, rnd() < 0.5 ? '#a7a296' : '#8f8b80']);
      }
    }
  });
  out.terrain.push(...bankParts);
  const rockGeo = (seed) => {
    const g = new THREE.IcosahedronGeometry(1, 1), P = g.attributes.position;
    for (let v = 0; v < P.count; v++) { const x = P.getX(v), y = P.getY(v), z = P.getZ(v), d = 1 + 0.3 * (fbm(x * 1.3 + seed, y * 1.3 + z, 3) - 0.5) * 2; P.setXYZ(v, x * d, y * d * 0.7, z * d); }
    g.computeVertexNormals();
    return prep(g, '#ffffff');
  };
  out.instances.push({ geo: rockGeo(3), list: rocks });

  // ============================================================================================== far archipelago
  // sheer islets (plateaus: cliffs with green tops) and sea stacks all round, a second great arch, far pillars
  const isl = [
    // [angle°, distance, rx, rz, h, seed, plateau] — far enough to melt into the mist, low and sheer
    [18, 260, 46, 28, 22, 1, 1], [52, 380, 70, 38, 34, 2, 1], [95, 230, 30, 20, 16, 3, 1], [128, 420, 90, 45, 42, 4, 1],
    [160, 290, 48, 30, 24, 5, 1], [203, 360, 64, 36, 30, 6, 1], [236, 220, 26, 18, 14, 7, 1], [270, 460, 110, 50, 48, 8, 1],
    [305, 300, 52, 30, 22, 9, 1], [338, 400, 80, 40, 36, 10, 1], [75, 700, 160, 70, 70, 11, 0], [190, 760, 180, 80, 85, 12, 0],
    [300, 820, 200, 90, 90, 13, 0], [140, 640, 120, 60, 55, 14, 0], [5, 780, 170, 70, 75, 15, 0],
  ];
  const stacks = [[30, 130, 6, 15], [70, 165, 5, 20], [115, 140, 6, 13], [150, 160, 5, 17], [215, 135, 7, 16], [252, 170, 5, 21], [290, 150, 6, 14], [325, 132, 7, 18], [350, 180, 4, 15], [185, 190, 4, 19]];
  const islands = [];
  for (const [a, d, rx, rz, h, seed, pl] of isl) {
    const x = Math.cos(a * DEG) * d, z = Math.sin(a * DEG) * d;
    const it = makeIsland({ x, z, rx, rz, h, seed: seed * 1.37, rot: (a + 90) * DEG, plateau: !!pl, R: pl ? 14 : 18, S: pl ? 48 : 64, grass: '#86b06a', ridge: 0.35 });
    out.terrain.push(it.geo);
    islands.push({ it, h, pl, n: Math.round(rx * rz / 90) });
  }
  for (const [a, d, r, h] of stacks) {
    const x = Math.cos(a * DEG) * d, z = Math.sin(a * DEG) * d;
    const it = makeIsland({ x, z, rx: r, rz: r * 0.8, h, seed: a * 0.07, rot: a * DEG, plateau: true, R: 9, S: 28, grass: '#8ab56c', ridge: 0.6 });
    out.terrain.push(it.geo);
    islands.push({ it, h, pl: 1, n: 3 });
  }
  // palms on the islands' green tops (instanced: a bent trunk and a crown of drooping blades)
  const palmGeo = (() => {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.22, 0.34, 5.5, 5); trunk.translate(0, 2.75, 0); parts.push(prep(xf(trunk, 0, 0, 0, 0, 0, -0.18), '#6d6a48'));
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const b = new THREE.BoxGeometry(3.4, 0.08, 1.3); b.translate(1.6, 0, 0); parts.push(prep(xf(b, 0.95, 5.45, 0, a, 0, -0.45), i % 2 ? '#5f7f48' : '#6f8f50')); }
    const g = new THREE.BufferGeometry();
    const all = parts.map((p) => p.index ? p.toNonIndexed() : p);
    let cnt = 0; for (const p of all) cnt += p.attributes.position.count;
    const pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3), glw = new Float32Array(cnt);
    let o = 0; for (const p of all) { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); col.set(p.attributes.color.array, o * 3); o += p.attributes.position.count; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('glow', new THREE.BufferAttribute(glw, 1));
    return g;
  })();
  const palms = [];
  for (const { it, h, n: cnt } of islands) {
    let placed = 0;
    for (let k = 0; k < cnt * 8 && placed < cnt; k++) {
      const [x, z] = it.sample(rnd, 0.75), y = it.heightAt(x, z);
      if (y < WATER_Y + Math.min(6, h * 0.4)) continue;
      const sl = Math.abs(it.heightAt(x + 2, z) - it.heightAt(x - 2, z)) + Math.abs(it.heightAt(x, z + 2) - it.heightAt(x, z - 2));
      if (sl > 2.5) continue;
      palms.push([x, y - 0.2, z, 0.8 + rnd() * 0.7, rnd() * 6.28]);
      placed++;
    }
  }
  out.instances.push({ geo: palmGeo, list: palms, doubleSided: true });

  // a second great arch far off (south-west), and tiered pillars standing in the sea
  const farArch = (cx, cz, rot, S) => {
    const pos = [], col = [], idx = [], NT = 40, NK = 14, c = new THREE.Color();
    for (let i = 0; i <= NT; i++) {
      const th = (i / NT - 0.5) * Math.PI, cs = Math.cos(th), px = 25 * Math.sin(th), py = -4 + 18 * Math.sign(cs) * Math.pow(Math.abs(cs), 0.62);
      const s = Math.abs(Math.sin(th)), hh = 2.6 + 2.2 * s * s * s, hd = 3.4 + 1.2 * s * s * s;
      let nx = -18 * Math.sin(th) * 0.62, ny = 25 * Math.cos(th); const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      if (ny < 0) { nx = -nx; ny = -ny; }
      for (let k = 0; k < NK; k++) {
        const ph = (k / NK) * Math.PI * 2, u = hh * Math.sign(Math.cos(ph)) * Math.pow(Math.abs(Math.cos(ph)), 0.5), v = hd * Math.sign(Math.sin(ph)) * Math.pow(Math.abs(Math.sin(ph)), 0.5);
        const d = 1 + 0.18 * (fbm(px * 0.1 + k, py * 0.1, 2) - 0.5);
        const lx = (px + nx * u * d) * S, ly = (py + ny * u * d) * S, lz = v * d * S;
        pos.push(cx + lx * Math.cos(rot) + lz * Math.sin(rot), ly, cz - lx * Math.sin(rot) + lz * Math.cos(rot));
        c.set(Math.cos(ph) * ny > 0.5 ? '#8fa47a' : '#b9b3a6').multiplyScalar(0.9 + 0.12 * fbm(px * 0.3, py * 0.3 + k, 2));
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < NT; i++) for (let k = 0; k < NK; k++) { const a = i * NK + k, b = i * NK + (k + 1) % NK, cc = (i + 1) * NK + (k + 1) % NK, d = (i + 1) * NK + k; idx.push(a, b, cc, a, cc, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return prep(g);
  };
  out.static.push(farArch(-190, -320, 0.9, 2.2), farArch(290, 150, -0.6, 1.4));
  const pillarProf = [[3.4, -3], [3.4, 5], [2.6, 5.4], [2.6, 12], [3.0, 12.6], [2.2, 13], [2.2, 19], [2.6, 19.6], [1.8, 20], [1.8, 25], [1.2, 26], [2.2, 28], [2.8, 30.5], [2.0, 33], [0.8, 34.5], [0.5, 36], [0, 36.6]];
  const farPillar = (x, z, s, hex) => { const g = new THREE.LatheGeometry(pillarProf.map(([r, y]) => new THREE.Vector2(r * s, y * s)), 16); g.translate(x, WATER_Y, z); return prep(g, hex); };
  const fp = [[-80, -190, 0.7], [140, -250, 0.9], [-240, 70, 1.0], [170, 240, 0.8], [-110, 310, 1.0], [300, -50, 1.1]];
  for (const [x, z, s] of fp) out.static.push(farPillar(x, z, s, '#aaa69c'));
  // the far cascade: a pale streak down the first far pillar's side
  const fc = new THREE.PlaneGeometry(2.2, 30, 1, 1); fc.translate(fp[0][0] + 0.2, WATER_Y + 13, fp[0][1] + 2.9 * fp[0][2]);
  out.plain.push(prep(fc, '#eef6f6'));

  // ============================================================================================== cascades + drips
  const U_night = U.uNight, uTime = U.uTime;
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uNight: U_night, uHorizon: U.uHorizon },
    vertexShader: /* glsl */`attribute float aS; attribute float aFall; varying float vS; varying float vFall; varying vec2 vUv; varying vec3 vW;
      void main(){ vS = aS; vFall = aFall; vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`uniform float uTime, uNight; uniform vec3 uHorizon; varying float vS; varying float vFall; varying vec2 vUv; varying vec3 vW;
      float h1(float x){ return fract(sin(x * 91.7) * 43758.5); }
      float n1(float x){ float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
      void main(){
        float lane = vUv.x * 30.0;
        float speed = mix(0.5, 2.6, vFall);
        float str = n1(lane + 3.0 * n1(lane * 0.3));                                          // ropes of water across the sheet
        float flow = n1(vS * 2.5 - uTime * speed * 1.6 + lane * 1.7) * 0.55 + n1(vS * 6.0 - uTime * speed * 2.9 + lane * 0.9) * 0.45;
        float rope = smoothstep(0.35, 0.8, str);
        float a = mix(0.12, 0.62, rope) * (0.55 + 0.6 * flow) + 0.22 * vFall * rope;
        float glint = smoothstep(0.78, 0.95, flow) * rope;
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        a = clamp(a * edge + glint * 0.3, 0.0, 0.9);
        vec3 col = mix(vec3(0.62, 0.82, 0.84), vec3(0.96, 1.0, 1.0), clamp(flow * 0.7 + glint + vFall * 0.25, 0.0, 1.0));
        col *= mix(1.0, 0.5, uNight); col = mix(col, uHorizon, 0.1);
        if (a < 0.02) discard;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  // a sheet swept round the pillar along its profile path (r, y), over an arc facing `dir`
  const T = PILLAR.tier, PL = PILLAR.plinth, SH = PILLAR.shore;
  const path = [[0.7, 8.28], [0.98, 7.82], [1.12, 7.72], [1.02, 7.6], [1.02, 6.66], [1.34, 6.48], [1.2, 6.3], [1.2, 4.76], [1.54, 4.5], [1.4, 4.3], [1.4, 2.56],
    [T + 0.08, 2.53], [T + 0.1, 1.34], [PL + 0.07, 1.32], [PL + 0.1, 0.03], [SH - 0.5, 0.03], [SH - 0.15, -0.08], [SH - 0.05, -1.72]];
  const fallSeg = path.map((p, i) => (i && Math.abs(p[1] - path[i - 1][1]) > Math.abs(p[0] - path[i - 1][0]) * 1.5 ? 1 : 0));
  const cascadeGeo = (cx, cz, dx, dz) => {
    const pos = [], uv = [], aS = [], aF = [], idx = [], NW = 10, base = Math.atan2(dz, dx);
    let s = 0;
    for (let i = 0; i < path.length; i++) {
      if (i) s += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      const [r, y] = path[i], half = Math.min(0.5, 1.0 / Math.max(r, 1));
      for (let k = 0; k <= NW; k++) {
        const u = k / NW, a = base + (u - 0.5) * 2 * half;
        pos.push(cx + Math.cos(a) * (r + 0.05), y + 0.02, cz + Math.sin(a) * (r + 0.05));
        uv.push(u, s); aS.push(s); aF.push(fallSeg[i]);
      }
    }
    for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < NW; k++) { const a = i * (NW + 1) + k; idx.push(a, a + NW + 1, a + 1, a + 1, a + NW + 1, a + NW + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1)); g.setAttribute('aFall', new THREE.Float32BufferAttribute(aF, 1)); g.setIndex(idx);
    return g;
  };
  const casc = [cascadeGeo(PILLAR.x, PILLAR.z, PILLAR.dir[0], PILLAR.dir[1]), cascadeGeo(-PILLAR.x, -PILLAR.z, -PILLAR.dir[0], -PILLAR.dir[1])];
  const cg = new THREE.BufferGeometry();
  {
    const merge = (key, sz) => { const tot = casc.reduce((a, g) => a + g.attributes[key].array.length, 0), arr = new Float32Array(tot); let o = 0; for (const g of casc) { arr.set(g.attributes[key].array, o); o += g.attributes[key].array.length; } cg.setAttribute(key, new THREE.BufferAttribute(arr, sz)); };
    merge('position', 3); merge('uv', 2); merge('aS', 1); merge('aFall', 1);
    const idx = []; let off = 0; for (const g of casc) { for (const v of g.index.array) idx.push(v + off); off += g.attributes.position.count; }
    cg.setIndex(idx);
  }
  const cascade = new THREE.Mesh(cg, waterMat);
  cascade.name = 'SpirhaliteCascades'; cascade.renderOrder = 5;
  out.objects.push(cascade);
  // splash mist + foam rings where each cascade meets the lagoon, and the drips under the arch: one points cloud
  const NP = 90, ND = 70, pp = new Float32Array((NP * 2 + ND) * 3), ph = new Float32Array(NP * 2 + ND), kind = new Float32Array(NP * 2 + ND);
  let o3 = 0;
  for (const sg of [1, -1]) for (let i = 0; i < NP; i++) {
    const r = PILLAR.shore - 0.05 + rnd() * 0.5, a = Math.atan2(sg * PILLAR.dir[1], sg * PILLAR.dir[0]) + (rnd() - 0.5) * 0.9;
    pp.set([sg * PILLAR.x + Math.cos(a) * r, WATER_Y + 0.05, sg * PILLAR.z + Math.sin(a) * r], o3 * 3); ph[o3] = rnd(); kind[o3] = 0; o3++;
  }
  const c0 = Math.cos(ARCH.rotY), s0 = Math.sin(ARCH.rotY);
  for (let i = 0; i < ND; i++) {
    const lx = (rnd() - 0.5) * 22, lz = (rnd() - 0.5) * 4.2, th = Math.asin(Math.max(-1, Math.min(1, lx / ARCH.leg)));
    const yc = ARCH.y0 + ARCH.rise * Math.pow(Math.cos(th), 0.62), s3 = Math.pow(Math.abs(lx / ARCH.leg), 3), yi = yc - (2.3 + 1.8 * s3) * 0.9;
    pp.set([lx * c0 + lz * s0, yi, -lx * s0 + lz * c0], o3 * 3); ph[o3] = rnd(); kind[o3] = 1; o3++;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('aPh', new THREE.BufferAttribute(ph, 1)); pg.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const pm = new THREE.ShaderMaterial({
    uniforms: { uTime, uNight: U_night },
    vertexShader: /* glsl */`uniform float uTime; attribute float aPh; attribute float aKind; varying float vA; varying float vK;
      void main(){
        vec3 p = position; float t = fract(uTime * (aKind > 0.5 ? 0.55 : 0.8) + aPh); vK = aKind;
        if (aKind > 0.5) { p.y -= 0.5 * 9.8 * pow(t * 1.5, 2.0); vA = step(0.05, p.y) * (0.5 + 0.5 * sin(aPh * 40.0)); }
        else { p.y += 0.9 * t; p.x += sin(aPh * 17.0 + uTime) * 0.3 * t; vA = (1.0 - t) * 0.6; }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (aKind > 0.5 ? 0.06 : 0.45 + 0.6 * t) * projectionMatrix[1][1] * 420.0 / max(-mv.z, 0.1);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform float uNight; varying float vA; varying float vK;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c * vec2(vK > 0.5 ? 2.2 : 1.0, 1.0)); float a = pow(smoothstep(0.5, 0.0, d), 1.6) * vA; if (a < 0.02) discard;
        gl_FragColor = vec4(mix(vec3(0.95, 0.99, 1.0), vec3(0.82, 0.92, 1.0), vK) * mix(1.0, 0.55, uNight), a * (vK > 0.5 ? 0.7 : 0.32)); }`,
    transparent: true, depthWrite: false, fog: false,
  });
  const pts = new THREE.Points(pg, pm);
  pts.name = 'SpirhaliteSpray'; pts.renderOrder = 6;
  out.objects.push(pts);
  // foam rings on the lagoon under the cascades
  const ring = new THREE.RingGeometry(0.2, 1.6, 24, 1);
  ring.rotateX(-Math.PI / 2);
  const rings = [];
  for (const sg of [1, -1]) { const g = ring.clone(); g.translate(sg * (PILLAR.x + PILLAR.dir[0] * (PILLAR.shore + 0.25)), WATER_Y + 0.03, sg * (PILLAR.z + PILLAR.dir[1] * (PILLAR.shore + 0.25))); rings.push(g); }
  const rg = new THREE.BufferGeometry();
  { const a = rings[0].toNonIndexed(), b = rings[1].toNonIndexed(), p = new Float32Array(a.attributes.position.array.length * 2), u = new Float32Array(a.attributes.uv.array.length * 2); p.set(a.attributes.position.array); p.set(b.attributes.position.array, a.attributes.position.array.length); u.set(a.attributes.uv.array); u.set(b.attributes.uv.array, a.attributes.uv.array.length); rg.setAttribute('position', new THREE.BufferAttribute(p, 3)); rg.setAttribute('uv', new THREE.BufferAttribute(u, 2)); }
  const foam = new THREE.Mesh(rg, new THREE.ShaderMaterial({
    uniforms: { uTime, uNight: U_night },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime, uNight; varying vec2 vUv; varying vec3 vW;
      void main(){ float r = length(vUv - 0.5) * 2.0; float w = 0.5 + 0.5 * sin(r * 14.0 - uTime * 3.0 + sin(vW.x * 3.0) * 0.8);
        float a = smoothstep(1.0, 0.3, r) * (0.35 + 0.45 * w); gl_FragColor = vec4(vec3(0.95, 0.98, 1.0) * mix(1.0, 0.55, uNight), a); }`,
    transparent: true, depthWrite: false, fog: false,
  }));
  foam.name = 'SpirhaliteFoam'; foam.renderOrder = 4;
  out.objects.push(foam);
  return out;
}
