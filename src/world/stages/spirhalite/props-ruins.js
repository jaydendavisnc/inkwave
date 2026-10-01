// Spirhalite Islands — the ruins: the Great Arch over the central sandbar, the cascade pillars' drums and bulb, the
// causeway's posts and fallen slabs, loose blocks and shore rocks. (Prop builders; see props.js for the contract.)
export const ARCH = { leg: Math.hypot(21.8, 14.2), rotY: Math.atan2(14.2, 21.8), y0: -3.5, rise: 17.25 };   // legs in the lagoons' mouths at world (±21.8, ∓14.2)

export function registerRuins(D, H, X) {
  const { THREE, K, PI, TAU, HP, NS, GB, meshGeo, tpl, pbox, colBox, ROOF, RAIL, noise3, fbm3, rng, lerp, clamp, sweep, rockGeo, col3 } = X;
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ============================================================================================== the Great Arch
  // A colossal weathered sea arch of layered sedimentary rock spanning the central sandbar (the reference's arch): a
  // thick, nearly level deck with a flat top and a rounder underside, legs flaring into the sea; its thickness and depth
  // wander along the span; the rock is stacked in strata ~1.25 m thick — each layer set in or out a little, undercut at
  // its base (the dark lines) and weathered back at its top; big lumps, vertical fissures, broken chunks on its edges,
  // moss and palms on its back, a dark wet underside where it drips, an algae band at the sea.
  function archFrameFn() {
    const XL = ARCH.leg, Y0 = ARCH.y0, BR = ARCH.rise;
    const cl = (t) => { const th = (t - 0.5) * PI, c = Math.cos(th); return [XL * Math.sin(th), Y0 + BR * Math.sign(c) * Math.pow(Math.abs(c), 0.5)]; };
    return (t) => {
      const [x, y] = cl(t), e = 1e-3, [xa, ya] = cl(Math.max(0, t - e)), [xb, yb] = cl(Math.min(1, t + e));
      let tx = xb - xa, ty = yb - ya; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      return { p: [x, y, 0], n: [-ty, tx, 0], b: [0, 0, 1], s: Math.abs(x) / XL };
    };
  }
  const archFrame = archFrameFn();
  const archThick = (t) => { const s = archFrame(t).s, s3 = s * s * s; return (2.7 + 1.1 * s3 + 0.7 * sm(0.86, 1, s)) * (1 + 0.24 * fbm3(t * 5.1, 1.3, 0.7, 3)); };
  const archDepth = (t) => { const s = archFrame(t).s, s3 = s * s * s; return (3.5 + 0.6 * s3 + 0.4 * sm(0.86, 1, s)) * (1 + 0.15 * fbm3(t * 3.7 + 5, 0.2, 0.1, 3)); };
  const LH = 1.25;
  const stratum = (x, y, z) => { const yy = y + 0.9 * fbm3(x * 0.035, 0.5, z * 0.05 + 11, 2); const f = yy / LH; return { k: Math.floor(f), f: f - Math.floor(f) }; };
  const hashL = (k) => { const s2 = Math.sin(k * 91.73 + 3.1) * 43758.5453; return s2 - Math.floor(s2); };
  function archGeo() {
    const cStone = col3(K.stone), cDk = col3(K.stoneDk), cLt = col3(K.stoneLt), cWet = col3(K.stoneWet), cAlg = col3(K.algae), cMoss = col3(K.moss), cMossDk = col3(K.mossDk);
    const tmp = new THREE.Color();
    const NT = 190, NK = 44, pos = [], col = [], idx = [];
    for (let i = 0; i <= NT; i++) {
      const t = i / NT, f = archFrame(t), hh = archThick(t), hd = archDepth(t);
      for (let k = 0; k < NK; k++) {
        const ph = (k / NK) * TAU, c = Math.cos(ph), sn = Math.sin(ph);
        const q = c > 0 ? 2 / 7 : 2 / 3.4;                                    // flat back, rounder underside
        const u0 = hh * Math.sign(c) * Math.pow(Math.abs(c), q), v0 = hd * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / 4.5);
        let x = f.p[0] + f.n[0] * u0, y = f.p[1] + f.n[1] * u0, z = v0;
        // horizontal outward direction of this ring point (strata only push the sides, never the flat back)
        const rl = Math.hypot(u0, v0) || 1, rx = (f.n[0] * u0) / rl, ry = (f.n[1] * u0) / rl, rz = v0 / rl;
        const hl = Math.hypot(rx, rz), hx = hl > 1e-4 ? rx / hl : 0, hz = hl > 1e-4 ? rz / hl : 0, side = hl;   // 0 on the top/bottom, 1 on the sides
        const st = stratum(x, y, z);
        const ledge = (hashL(st.k) - 0.5) * 0.95 + 0.22 * sm(0.15, 0.9, st.f) - 0.42 * (1 - sm(0.0, 0.13, st.f));
        const lump = 0.95 * fbm3(x * 0.055 + 7, y * 0.055, z * 0.055, 3) + 0.28 * fbm3(x * 0.22 + 2, y * 0.22, z * 0.22, 2) + 0.1 * noise3(x * 0.9, y * 0.9, z * 0.9);
        const fis = (() => { const q2 = x * 0.2 + 0.8 * noise3(y * 0.15, 0.3, z * 0.2); const fr = q2 - Math.floor(q2); return -0.45 * (1 - sm(0.0, 0.05, Math.abs(fr - 0.5))) * sm(0.3, 0.7, hashL(Math.floor(q2) + 40)); })();
        const dr = lump + fis * side;
        x += (rx) * dr + hx * ledge * side; y += ry * dr; z += rz * dr + hz * ledge * side;
        pos.push(x, y, z);
        // colour: each stratum its own tone, dark undercut lines, wet underside, algae at the sea, moss on its back
        const up = ry;
        const tone = hashL(st.k + 7);
        tmp.copy(cStone).lerp(tone > 0.5 ? cLt : cDk, Math.abs(tone - 0.5) * 0.9);
        tmp.multiplyScalar((0.94 + 0.12 * noise3(x * 0.4, y * 0.4, z * 0.4)) * (1 - 0.3 * (1 - sm(0.0, 0.14, st.f)) * side));
        if (up < -0.35) tmp.lerp(cWet, 0.45 * sm(-0.35, -0.9, up));
        if (y < 0.4) tmp.lerp(cAlg, 0.55 * sm(0.4, -1.3, y)).lerp(cWet, 0.3 * sm(-0.8, -1.6, y));
        if (up > 0.3) tmp.lerp(noise3(x * 0.3, y * 0.3, z * 0.3) > -0.15 ? cMoss : cMossDk, 0.95 * sm(0.3, 0.62, up));
        col.push(tmp.r, tmp.g, tmp.b);
      }
    }
    for (let i = 0; i < NT; i++) for (let k = 0; k < NK; k++) { const a = i * NK + k, b = i * NK + (k + 1) % NK, c = (i + 1) * NK + (k + 1) % NK, d = (i + 1) * NK + k; idx.push(a, b, c, a, c, d); }
    return meshGeo(pos, idx, col);
  }
  // a point on the arch's surface: along the span t, round the section ph (0 = its back, π = underside, ±π/2 = sides)
  const archPoint = (t, ph, out = 0) => {
    const f = archFrame(t), hh = archThick(t) + out, hd = archDepth(t) + out, c = Math.cos(ph), sn = Math.sin(ph);
    const u = hh * Math.sign(c) * Math.pow(Math.abs(c), c > 0 ? 2 / 7 : 2 / 3.4), v = hd * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / 4.5);
    return [f.p[0] + f.n[0] * u, f.p[1] + f.n[1] * u, v];
  };
  D.spirhalite_arch = {
    desc: 'the Great Arch: a colossal weathered stone sea arch spanning the central sandbar, legs in the sea (roof colliders)',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      B.add('rubber', tpl('arch', archGeo), 'white', 0, 0, 0, { ao: false });
      // broken chunks: slabs jutting from its back edges, blocks slumped on its sides, a few hanging under the deck
      const R = rng(4077);
      for (let i = 0; i < 22; i++) {
        const t = 0.1 + R() * 0.8, kind = i < 5 ? 0 : i < 15 ? 1 : 2;
        const ph = kind === 0 ? (R() < 0.5 ? 1.05 : -1.05) + (R() - 0.5) * 0.25 : kind === 1 ? (R() < 0.5 ? 1.57 : -1.57) + (R() - 0.5) * 0.6 : PI + (R() - 0.5) * 0.9;
        const [x, y, z] = archPoint(t, ph, kind === 1 ? -0.45 : -0.35);
        const s = kind === 2 ? 0.6 + R() * 0.5 : 0.9 + R() * 0.9;
        // angular slabs (a low-poly, flattened, faceted rock): broken strata blocks, not boulders
        B.add('rubber', rockGeo(300 + i, 0, 1.5, kind === 2 ? 0.9 : 0.5, 1.1, 0.35), i % 2 ? K.stone : K.stoneLt, x, y, z, { s, ry: R() * TAU, rz: (R() - 0.5) * 0.25, ao: false });
      }
      // life on its back: cushion shrubs and two monstera palms
      for (let i = 0; i < 9; i++) {
        const t = 0.2 + R() * 0.6, [x, y, z] = archPoint(t, (R() - 0.5) * 0.9, -0.35), s2 = 0.9 + R() * 1.1;
        B.add('foliage', tpl('apuff|' + (i % 3), () => H.puffGeo(1, 21 + (i % 3))), i % 2 ? K.mossLt : K.moss, x, y, z, { sx: s2 * 1.4, sy: s2 * 0.7, sz: s2 * 1.2 });
      }
      for (const [t, sd, seed] of [[0.36, 0.4, 31], [0.66, -0.5, 33]]) {
        const [x, y, z] = archPoint(t, sd, -0.3);
        const nc = B.cols.length;   // (B.col ignores the push stack: drop the nested palm's trunk collider — nobody reaches up there)
        B.push(x, y - 0.1, z, t * 5);
        D.spirhalite_palm.build(B, { h: 3.4, lean: 1.1, seed });
        B.pop();
        B.cols.length = nc;
      }
      // legs: off-limits rock (roof); the rib itself up high (roof boxes inside the mesh, for jetpacks and zipcasters)
      for (const sx of [-1, 1]) {
        colBox(B, sx * ARCH.leg, -2.2, 0, 7.2, 9.5, 6.6, ROOF);
        for (let i = 0; i < 10; i++) {
          const t0 = sx > 0 ? 0.5 + i * 0.045 : 0.5 - (i + 1) * 0.045, t1 = t0 + 0.045;
          const [xa, ya] = archPoint(t0, PI, -0.6), [xb, yb] = archPoint(t1, PI, -0.6), [, ta] = archPoint(t0, 0, -0.6), [, tb] = archPoint(t1, 0, -0.6);
          const y0 = Math.min(ya, yb), y1 = Math.max(ta, tb);
          if (y0 < 6.4) continue;
          B.col(Math.min(xa, xb), y0, -2.4, Math.max(xa, xb), y1, 2.4, ROOF);
        }
      }
      // rubble round the legs at the waterline
      for (const sx of [-1, 1]) for (let i = 0; i < 11; i++) {
        const a = (i / 11) * TAU + sx, r = 4.6 + 1.4 * Math.sin(i * 2.7), s2 = 0.8 + 0.8 * ((i * 37) % 10) / 10;
        B.add('rubber', rockGeo(11 + i + (sx > 0 ? 20 : 0), 1, 1.2, 0.7, 1.0), K.rock, sx * ARCH.leg + Math.cos(a) * r, -1.7, Math.sin(a) * r * 0.9, { s: s2, ry: a, ao: false });
      }
    },
  };

  // ============================================================================================== cascade pillar
  // The column above the pillar's tier (the plinth + tier are level pieces; so is the drum's lowest course, 2.5–4.4 m):
  // three drums narrowing upward with carved collars, a neck, the onion bulb and its finial. The side facing its own
  // base (local −z) is streaked dark and green where the cascade runs down it (the water sheet is backdrop.js).
  function pillarGeo() {
    const prof = [[1.3, 2.4], [1.33, 2.55], [1.31, 3.4], [1.3, 4.25], [1.42, 4.33], [1.47, 4.47], [1.42, 4.6], [1.26, 4.66], [1.13, 4.72], [1.12, 5.5],
      [1.11, 6.2], [1.22, 6.28], [1.29, 6.42], [1.2, 6.52], [0.98, 6.6], [0.96, 7.1], [0.95, 7.62], [1.06, 7.7], [1.03, 7.78], [0.74, 7.9], [0.66, 8.1],
      [0.66, 8.28], [0.86, 8.46], [1.13, 8.7], [1.33, 9.05], [1.38, 9.35], [1.3, 9.7], [1.08, 10.0], [0.72, 10.25], [0.42, 10.42], [0.3, 10.55],
      [0.35, 10.72], [0.3, 10.9], [0.16, 11.08], [0.0, 11.16]];
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40);
    const P = g.attributes.position, n = P.count, col = new Float32Array(n * 3);
    const cS = col3(K.stone), cLt = col3(K.stoneLt), cDk = col3(K.stoneDk), cWet = col3(K.stoneWet), cAlg = col3(K.algae), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), r = Math.hypot(x, z) || 1;
      const face = -z / r;   // 1 on the cascade side (local −z)
      c.copy(cS).lerp(cLt, 0.35 * sm(0.2, 1, Math.sin(y * 3.1 + x)) ).multiplyScalar(0.94 + 0.1 * noise3(x * 2, y * 2, z * 2));
      if ([4.47, 6.42, 7.7].some((b) => Math.abs(y - b) < 0.12)) c.lerp(cDk, 0.35);
      const wet = sm(0.35, 0.9, face) * sm(11, 9.3, y);
      c.lerp(cWet, 0.55 * wet).lerp(cAlg, 0.35 * wet * (0.5 + 0.5 * noise3(x * 3, y * 1.5, z * 3)));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv'); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    return g;
  }
  D.spirhalite_pillar = {
    desc: 'the cascade pillar column: drums narrowing upward with carved collars, onion bulb + finial (roof collider above the drum course)',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      B.add('rubber', tpl('pillar', pillarGeo), 'white', 0, 0, 0, { ao: false });
      // carved glyph panels round the lowest drum (a ring of shallow raised tablets), and spouts under the bulb
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + PI / 8;
        B.push(Math.sin(a) * 1.3, 0, Math.cos(a) * 1.3, a);
        pbox(B, 'rubber', K.stone, 0.46, 0.7, 0.05, 0, 3.0, 0.01);
        B.tor('rubber', K.stoneLt, 0.14, 0.022, 0, 3.4, 0.045, { ts: 12, rs: 4 });
        B.tor('rubber', K.stoneLt, 0.07, 0.018, 0, 3.4, 0.048, { ts: 10, rs: 4 });
        pbox(B, 'rubber', K.stoneLt, 0.3, 0.035, 0.035, 0, 3.12, 0.045);
        B.pop();
      }
      for (const a of [-0.55, 0, 0.55]) {
        B.push(Math.sin(PI + a) * 0.95, 0, Math.cos(PI + a) * 0.95, PI + a);
        B.cyl('rubber', K.stoneDk, 0.13, 0.5, 0, 8.45, 0.18, { rx: HP, seg: 8 });
        B.pop();
      }
      B.col(-0.95, 4.4, -0.95, 0.95, 11.2, 0.95, ROOF);
    },
  };

  // ============================================================================================== causeway
  // Dressing for the level's causeway slab (x0…x1, z0…z1 in the prop frame, pos = the causeway's centre on the sea bed):
  // carved stone posts along both edges (cover: colliders), a worn kerb course along the sides, fallen slabs tilted into
  // the lagoons, rubble at its broken far end.
  D.spirhalite_causeway = {
    desc: 'ancient causeway dressing: carved posts along its edges (colliders), fallen slabs in the water, rubble at the broken end',
    params: { len: 'length along local z (m)', w: 'width (m)', top: 'deck height', posts: 'post positions along z (± sides)' },
    variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.len ?? 18.5, W = o.w ?? 4.2, top = o.top ?? 1.3;
      // posts: [z, side]
      for (const [z, sd] of o.posts || []) {
        const x = sd * (W / 2 - 0.3);
        pbox(B, 'rubber', K.stone, 0.62, 0.95, 0.62, x, top, z);
        B.add('rubber', tpl('postcap', () => new THREE.CylinderGeometry(0.2, 0.34, 0.22, 8)), K.stoneLt, x, top + 1.06, z);
        pbox(B, 'rubber', K.stoneDk, 0.64, 0.08, 0.64, x, top + 0.62, z);
        colBox(B, x, top, z, 0.62, 1.0, 0.62);
      }
      // fallen slabs in the water beside it (tilted, half sunk)
      for (const [z, sd, ry, rz] of o.slabs || []) {
        B.add('rubber', X.boxG(), K.stoneDk, sd * (W / 2 + 1.1), -1.45, z, { sx: 1.8, sy: 0.45, sz: 1.2, ry, rz, ao: false });
      }
      // side kerb course: a projecting string course 0.35 m under the deck edge (shadow line) on both sides
      for (const sd of [-1, 1]) pbox(B, 'rubber', K.stoneDk, 0.14, 0.18, L, sd * (W / 2 + 0.06), top - 0.42, 0);
      for (const [x, z, s] of o.rubble || []) B.add('rubber', rockGeo(71 + Math.round(x * 3 + z), 1, 1.1, 0.6, 0.9), K.stone, x, 0, z, { s });
    },
  };

  // ============================================================================================== loose blocks & rocks
  D.spirhalite_rock = {
    desc: 'a weathered boulder (shore / sea rock); collider unless nocol',
    params: { w: 'size (m)', h: 'height factor', seed: 'shape', nocol: 'no collider', moss: 'mossy top' },
    variants: 1, mount: 'ground',
    build(B, o) {
      const w = o.w ?? 1.2, h = o.h ?? 0.6, seed = o.seed ?? 3;
      B.add('rubber', rockGeo(seed, 1, 1, h, 0.85), o.color ?? K.rock, 0, (o.sink ?? 0.15) * -w, 0, { s: w, ry: seed, ao: false });
      if (o.moss) B.add('foliage', rockGeo(seed + 50, 1, 0.8, h * 0.4, 0.68, 0.2), K.moss, 0, w * h * 0.55, 0, { s: w, ry: seed });
      if (!o.nocol) colBox(B, 0, 0, 0, w * 1.5, w * h * 0.8, w * 1.3);
    },
  };
}
