// Spirhalite Islands — flora and washed-up debris (the reference picture): twisted palms with split monstera leaves and
// hanging aerial roots, yellow pompom flowers on thin stalks, grass tufts, cushion shrubs, bleached driftwood, a
// half-buried rowing boat, a green glass float in its net, buoys, a teal tarp over a crate, and the strange rusted vanes
// turning in the water. (Prop builders; see props.js for the contract.)
export function registerFlora(D, H, X) {
  const { THREE, K, PI, TAU, HP, NS, GB, meshGeo, tpl, pbox, colBox, ROOF, noise3, fbm3, rng, lerp, clamp, col3, rockGeo } = X;
  const rod = (B, mat, c, a, b, r, radial = 6) => B.tube(mat, c, [a, b], r, { radial });

  // ============================================================================================== monstera palm
  // twisted trunk: a bent tube whose section carries three spiral ridges (vertex colour banded along the spiral)
  function trunkGeo(seed, h, lean) {
    const R = rng(seed), bend = R() * TAU, nt = 16, nk = 10, pos = [], idx = [], col = [];
    const lx = Math.cos(bend) * lean, lz = Math.sin(bend) * lean;
    const cDk = col3(K.trunkDk), cT = col3(K.trunk), cM = col3(K.mossDk), c = new THREE.Color();
    const P = (t) => { const s = t * t * (3 - 2 * t); return [lx * s + Math.sin(t * PI) * 0.25 * Math.cos(bend + 1.4), t * h, lz * s + Math.sin(t * PI) * 0.25 * Math.sin(bend + 1.4)]; };
    for (let i = 0; i <= nt; i++) {
      const t = i / nt, p = P(t), q = P(Math.min(1, t + 0.02)), p0 = P(Math.max(0, t - 0.02));
      let tx = q[0] - p0[0], ty = q[1] - p0[1], tz = q[2] - p0[2]; const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
      let ax = 1, ay = 0, az = 0; const d = ax * tx; ax -= d * tx; ay -= d * ty; az -= d * tz; const al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
      const bx = ty * az - tz * ay, by = tz * ax - tx * az, bz = tx * ay - ty * ax;
      const r0 = lerp(0.26, 0.15, t) * (i === 0 ? 1.35 : 1);
      for (let k = 0; k < nk; k++) {
        const a = (k / nk) * TAU, sp = Math.sin(3 * a + t * 14);
        const r = r0 * (1 + 0.1 * sp);
        pos.push(p[0] + (ax * Math.cos(a) + bx * Math.sin(a)) * r, p[1] + (ay * Math.cos(a) + by * Math.sin(a)) * r, p[2] + (az * Math.cos(a) + bz * Math.sin(a)) * r);
        c.copy(cT).lerp(cDk, 0.5 + 0.5 * sp).lerp(cM, 0.25 * clamp(1 - t * 2, 0, 1));
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < nt; i++) for (let k = 0; k < nk; k++) { const a = i * nk + k, b = i * nk + (k + 1) % nk, cc = (i + 1) * nk + (k + 1) % nk, dd = (i + 1) * nk + k; idx.push(a, b, cc, a, cc, dd); }
    return { geo: meshGeo(pos, idx, col), top: P(1) };
  }
  // a split monstera leaf: petiole + drooping midrib, fingers either side (the splits are the gaps between them)
  function leafGeo(seed, L) {
    const R = rng(seed), gb = new GB();
    const cL = col3(K.leaf), cD = col3(K.leafDk), cLt = col3(K.leafLt), c = new THREE.Color();
    const mid = (t) => [t * L, 0.35 * L * Math.sin(t * 1.3) - 0.55 * L * t * t * t, 0];   // rises then droops
    const tan = (t) => { const a = mid(t), b = mid(Math.min(1, t + 0.01)); const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    // petiole (first 25 %) as a thin strip, the blade from 0.25 to 1
    const nf = 6;
    for (const sd of [-1, 1]) for (let j = 0; j < nf; j++) {
      const t0 = 0.26 + (j / nf) * 0.72, t1 = 0.26 + ((j + 0.86) / nf) * 0.72, tm = (t0 + t1) / 2;
      const env = Math.pow(Math.sin(clamp((tm - 0.22) / 0.8, 0, 1) * PI), 0.7) * (0.6 + 0.1 * R()) * L * 0.5;   // finger length
      const back = 0.3 + 0.15 * R();                                                            // sweep back toward the base
      const pts = [];
      for (const [t, w] of [[t0, 0], [t1, 0]]) { const m = mid(t); pts.push(m); void w; }
      const [ux, uy] = tan(tm), a = mid(t0), b = mid(t1);
      // finger quad strip: from the midrib out to the tip, 3 segments, drooping
      const dirx = -ux * back, dirz = sd, dl = Math.hypot(dirx, dirz), fx = dirx / dl, fz = dirz / dl;
      const segs = 3, ids = [];
      for (let s = 0; s <= segs; s++) {
        const f = s / segs, w = 0.92 + 0.3 * f, ox = fx * env * f, oz = fz * env * f, oy = -0.22 * env * f * f;
        const k = 0.9 + 0.2 * R();
        c.copy(cL).lerp(f > 0.7 ? cLt : cD, f > 0.7 ? 0.25 : 0.2 * (1 - f)).multiplyScalar(k);
        ids.push([gb.v(a[0] + ox, a[1] + oy, a[2] + oz * 1, 0, 1, 0, c.r, c.g, c.b), gb.v(lerp(a[0], b[0], w) + ox, lerp(a[1], b[1], w) + oy, lerp(a[2], b[2], w) + oz, 0, 1, 0, c.r, c.g, c.b)]);
      }
      for (let s = 0; s < segs; s++) gb.quad(ids[s][0], ids[s][1], ids[s + 1][1], ids[s + 1][0]);
    }
    // midrib strip + petiole
    const ids = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12, m = mid(t), w = t < 0.28 ? 0.025 : 0.05 * (1 - t); c.copy(cD); ids.push([gb.v(m[0], m[1] + 0.01, -w, 0, 1, 0, c.r, c.g, c.b), gb.v(m[0], m[1] + 0.01, w, 0, 1, 0, c.r, c.g, c.b)]); }
    for (let i = 0; i < 12; i++) gb.quad(ids[i][0], ids[i + 1][0], ids[i + 1][1], ids[i][1]);
    return gb.geo();
  }
  D.spirhalite_palm = {
    desc: 'twisted palm crowned with huge split monstera leaves and hanging aerial roots; trunk collider (roof)',
    params: { h: 'trunk height', lean: 'lean (m)', seed: 'shape' }, variants: 3, mount: 'ground',
    build(B, o) {
      const seed = o.seed ?? 7, h = o.h ?? 3.6, lean = o.lean ?? 0.9, R = rng(seed * 31 + 5);
      const tr = tpl(`trunk|${seed}|${h}|${lean}`, () => trunkGeo(seed, h, lean));
      B.add('wood', tr.geo, 'white', 0, 0, 0);
      const [tx, ty, tz] = tr.top;
      // leaf crown: 8 leaves radiating, arching out and down
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + R() * 0.4, L = 1.9 + R() * 0.7, tilt = -0.1 + R() * 0.3;
        B.add('foliage', tpl(`leaf|${(seed + i) % 5}|${L.toFixed(1)}`, () => leafGeo(seed + i, +L.toFixed(1))), 'white', tx, ty + 0.05, tz, { ry: a, rz: tilt });
      }
      // crown knot + fruiting spathes
      B.sph('wood', K.trunkDk, 0.28, tx, ty - 0.05, tz, { ws: 8, hs: 6 });
      for (let i = 0; i < 3; i++) { const a = R() * TAU; B.cyl('wood', K.pomDk, 0.07, 0.35, tx + Math.cos(a) * 0.22, ty - 0.2, tz + Math.sin(a) * 0.22, { rx: 0.4 * Math.cos(a), rz: -0.4 * Math.sin(a), seg: 6 }); }
      // aerial roots hanging from under the crown
      for (let i = 0; i < 9; i++) {
        const a = R() * TAU, r0 = 0.18 + R() * 0.3, L = 1.2 + R() * 1.9;
        const x0 = tx + Math.cos(a) * r0, z0 = tz + Math.sin(a) * r0, y0 = ty - 0.15;
        B.tube(NS('wood'), K.root, [[x0, y0, z0], [x0 + Math.cos(a) * 0.12, y0 - L * 0.5, z0 + Math.sin(a) * 0.12], [x0 + Math.cos(a) * 0.08, y0 - L, z0 + Math.sin(a) * 0.1]], 0.018, { radial: 4 });
      }
      // moss + grass at the foot
      B.add('foliage', rockGeo(seed + 90, 1, 1, 0.25, 1, 0.3), K.mossDk, 0, 0, 0, { s: 0.55 });
      colBox(B, 0, 0, 0, 0.55, Math.min(2.4, h), 0.55, ROOF);
    },
  };

  // ============================================================================================== small flora
  D.spirhalite_pompoms = {
    desc: 'a clump of yellow pompom flowers on thin stalks (no collider)', params: { n: 'stalks', seed: 'layout' }, variants: 1, mount: 'ground',
    build(B, o) {
      const R = rng((o.seed ?? 3) * 17 + 1), n = o.n ?? 7;
      for (let i = 0; i < n; i++) {
        const a = R() * TAU, r = R() * 0.45, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.45 + R() * 0.7, bx = (R() - 0.5) * 0.25, bz = (R() - 0.5) * 0.25;
        B.tube(NS('foliage'), K.stalk, [[x, 0, z], [x + bx * 0.4, h * 0.55, z + bz * 0.4], [x + bx, h, z + bz]], 0.012, { radial: 3 });
        B.sph(NS('foliage'), R() < 0.8 ? K.pom : K.pomDk, 0.07 + R() * 0.05, x + bx, h + 0.04, z + bz, { ws: 7, hs: 5 });
      }
      for (let i = 0; i < 5; i++) { const a = R() * TAU; B.add(NS('foliage'), tpl('blade', () => { const g = new GB(); const q = [g.v(-0.04, 0, 0, 0, 0, 1), g.v(0.04, 0, 0, 0, 0, 1), g.v(0.0, 0.32, 0.06, 0, 0, 1)]; g.tri(q[0], q[1], q[2]); return g.geo(); }), K.stalk, Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15, { ry: a, s: 0.8 + R() * 0.6 }); }
    },
  };
  function tuftGeo(seed) {
    const R = rng(seed), g = new GB(), cG = col3(K.grass), cD = col3(K.grassDry), c = new THREE.Color();
    for (let i = 0; i < 14; i++) {
      const a = R() * TAU, r = R() * 0.12, h = 0.25 + R() * 0.35, lean = 0.1 + R() * 0.25, w = 0.025 + R() * 0.02;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, dx = Math.cos(a) * lean, dz = Math.sin(a) * lean, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      c.copy(cG).lerp(cD, R() * 0.6);
      const v0 = g.v(x - px, 0, z - pz, dx, 0.5, dz, c.r * 0.8, c.g * 0.8, c.b * 0.8), v1 = g.v(x + px, 0, z + pz, dx, 0.5, dz, c.r * 0.8, c.g * 0.8, c.b * 0.8), v2 = g.v(x + dx, h, z + dz, dx, 0.5, dz, c.r * 1.1, c.g * 1.1, c.b * 1.1);
      g.tri(v0, v1, v2);
    }
    return g.geo();
  }
  D.spirhalite_grass = {
    desc: 'dune grass tufts scattered in a patch (no collider)', params: { n: 'tufts', r: 'patch radius', seed: 'layout' }, variants: 1, mount: 'ground',
    build(B, o) {
      const R = rng((o.seed ?? 5) * 13 + 7), n = o.n ?? 5, rr = o.r ?? 0.8;
      for (let i = 0; i < n; i++) { const a = R() * TAU, r = Math.sqrt(R()) * rr; B.add(NS('foliage'), tpl('tuft|' + (i % 4), () => tuftGeo(40 + (i % 4))), 'white', Math.cos(a) * r, 0, Math.sin(a) * r, { ry: R() * TAU, s: 0.8 + R() * 0.7 }); }
    },
  };
  D.spirhalite_shrub = {
    desc: 'a lumpy cushion shrub (pale yellow-green, lacy); roof collider unless nocol', params: { w: 'size', h: 'height', seed: 'shape', nocol: 'no collider' },
    variants: 1, mount: 'ground',
    build(B, o) {
      const w = o.w ?? 1.6, hh = o.h ?? 1.0, R = rng((o.seed ?? 2) * 7 + 3);
      for (let i = 0; i < 6; i++) {
        const a = R() * TAU, r = R() * w * 0.32, s = w * (0.32 + R() * 0.2);
        B.add('foliage', tpl('puff|' + (i % 3), () => H.puffGeo(1, 11 + (i % 3))), i % 2 ? K.mossLt : K.moss, Math.cos(a) * r, hh * 0.35 + R() * hh * 0.25, Math.sin(a) * r, { sx: s, sy: s * hh * 0.9, sz: s });
      }
      if (!o.nocol) colBox(B, 0, 0, 0, w * 0.85, hh * 0.85, w * 0.85, ROOF);
      B.blob(w * 1.1, w * 1.1);
    },
  };

  // ============================================================================================== debris
  function logGeo(seed, L) {
    const R = rng(seed), nt = 10, nk = 8, pos = [], idx = [], col = [];
    const bend = (R() - 0.5) * 0.5, cD = col3(K.drift), cDk = col3(K.driftDk), c = new THREE.Color();
    for (let i = 0; i <= nt; i++) {
      const t = i / nt, x = (t - 0.5) * L, zc = Math.sin(t * PI) * bend, r = lerp(0.24, 0.17, t) * (1 + 0.12 * noise3(t * 6, seed, 0));
      for (let k = 0; k < nk; k++) {
        const a = (k / nk) * TAU, cr = 1 + 0.08 * Math.sin(a * 3 + t * 20);
        pos.push(x, r + Math.sin(a) * r * cr, zc + Math.cos(a) * r * cr);
        c.copy(cD).lerp(cDk, 0.5 + 0.5 * Math.sin(a * 5 + t * 30 + seed)).multiplyScalar(0.9 + 0.12 * Math.sin(a));
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < nt; i++) for (let k = 0; k < nk; k++) { const a = i * nk + k, b = i * nk + (k + 1) % nk, cc = (i + 1) * nk + (k + 1) % nk, dd = (i + 1) * nk + k; idx.push(a, b, cc, a, cc, dd); }
    return meshGeo(pos, idx, col);
  }
  D.spirhalite_driftwood = {
    desc: 'bleached driftwood log with a root flare and broken branches (cover collider)', params: { L: 'length', seed: 'shape', two: 'a second log across it' },
    variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.L ?? 3.4, seed = o.seed ?? 4, R = rng(seed * 11);
      B.add('wood', tpl(`log|${seed}|${L}`, () => logGeo(seed, L)), 'white', 0, -0.06, 0);
      // root flare at the thick end, snapped branches
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; B.tube('wood', K.driftDk, [[-L / 2 + 0.05, 0.22, 0], [-L / 2 - 0.25, 0.22 + Math.sin(a) * 0.35, Math.cos(a) * 0.35], [-L / 2 - 0.4, 0.2 + Math.sin(a) * 0.55, Math.cos(a) * 0.55]], 0.05, { radial: 5 }); }
      for (let i = 0; i < 2; i++) { const x = (R() - 0.3) * L * 0.6, a = R() * PI; B.tube('wood', K.drift, [[x, 0.3, 0], [x + 0.2, 0.55, Math.cos(a) * 0.4]], 0.05, { radial: 5 }); }
      colBox(B, -0.15, 0, 0, L * 0.9, 0.45, 0.5);
      if (o.two) {
        B.push(0.4, 0.33, 0.1, 0.6);
        B.add('wood', tpl(`log|${seed + 1}|${L * 0.8}`, () => logGeo(seed + 1, L * 0.8)), 'white', 0, -0.06, 0);
        B.pop();
        colBox(B, 0.4, 0.3, 0.1, 1.2, 0.45, 1.2);
      }
      B.blob(L * 0.9, 0.9);
    },
  };
  // half-buried rowing boat, tilted, peeling paint, oars; cover (collider)
  // open double-ended hull: an outer skin (painted teal, white sheer strake) and an inner skin (bare timber), explicit
  // normals so each shows from its own side; gunwales along the sheer
  function hullGeo(L, Bm, Dp, inner) {
    const g = new GB(), nt = 12, nk = 9, rows = [];
    const cO = col3(K.tarp), cW = col3(K.white), cI = col3(K.wood), c = new THREE.Color();
    const sh = inner ? -1 : 1, ins = inner ? 0.05 : 0;
    for (let i = 0; i <= nt; i++) {
      const t = i / nt, x = (t - 0.5) * L * (inner ? 0.97 : 1), fw = Math.pow(Math.sin(t * PI), 0.55) * 0.95 + 0.05, sheer = Dp * (1 + 0.25 * Math.pow(2 * t - 1, 2));
      const row = [];
      for (let k = 0; k <= nk; k++) {
        const a = (k / nk) * PI, ca = Math.cos(a), sa = Math.sin(a);
        const y = sheer - sa * (Dp * (0.35 + 0.65 * fw) - ins), z = ca * (Bm * 0.5 * fw - ins);
        const nl = Math.hypot(ca, sa) || 1;
        c.copy(inner ? cI : (y > sheer - 0.12 ? cW : cO)).multiplyScalar(0.85 + 0.15 * Math.sin(x * 7 + z * 3 + (inner ? 1 : 0)));
        row.push(g.v(x, y, z, 0, -sa / nl * sh, ca / nl * sh, c.r, c.g, c.b));
      }
      rows.push(row);
    }
    for (let i = 0; i < nt; i++) for (let k = 0; k < nk; k++) g.quad(rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]);
    return g.geo();
  }
  D.spirhalite_rowboat = {
    desc: 'a rowing boat half buried in the sand, tilted (cover collider), oars, thwarts', params: {}, variants: 1, mount: 'ground',
    build(B) {
      B.push(0, -0.22, 0, 0, 0, 0.32);
      B.add('wood', tpl('hullout', () => hullGeo(3.6, 1.35, 0.62, false)), 'white', 0, 0, 0);
      B.add('wood', tpl('hullin', () => hullGeo(3.6, 1.35, 0.62, true)), 'white', 0, 0, 0);
      for (const sd of [-1, 1]) B.tube('wood', K.white, Array.from({ length: 9 }, (_, i) => { const t = 0.04 + (i / 8) * 0.92, fw = Math.pow(Math.sin(t * PI), 0.55) * 0.95 + 0.05; return [(t - 0.5) * 3.6, 0.62 * (1 + 0.25 * Math.pow(2 * t - 1, 2)) + 0.02, sd * 1.35 * 0.5 * fw]; }), 0.03, { radial: 5 });
      for (const x of [-0.6, 0.5]) pbox(B, 'wood', K.wood, 0.25, 0.05, 1.2, x, 0.4, 0);
      B.pop();
      rod(B, 'wood', K.woodDk, [-1.1, 0.25, 0.9], [1.3, 0.05, 1.3], 0.03);
      pbox(B, 'wood', K.woodDk, 0.5, 0.03, 0.14, 1.45, 0.03, 1.35, { ry: -0.15 });
      colBox(B, 0, 0, 0, 3.4, 0.75, 1.3);
      B.blob(3.8, 1.8);
    },
  };
  D.spirhalite_float = {
    desc: 'a big green glass fishing float in a rope net (small collider)', params: { r: 'radius' }, variants: 1, mount: 'ground',
    build(B, o) {
      const r = o.r ?? 0.42;
      B.sph('gloss', K.floatGlass, r, 0, r * 0.92, 0, { ws: 16, hs: 12 });
      B.sph(NS('gloss'), K.floatGlassLt, r * 0.3, r * 0.35, r * 1.35, r * 0.2, { ws: 8, hs: 6 });
      for (let i = 0; i < 6; i++) B.tor(NS('rubber'), K.rope, r * 1.01, 0.012, 0, r * 0.92, 0, { ry: (i / 6) * PI, ts: 20, rs: 3 });
      B.tor(NS('rubber'), K.rope, r * 1.01, 0.014, 0, r * 0.92, 0, { rx: HP, ts: 20, rs: 3 });
      B.tube(NS('rubber'), K.rope, [[0, r * 1.9, 0], [0.3, r * 1.5, 0.2], [0.7, 0.03, 0.35]], 0.015, { radial: 3 });
      colBox(B, 0, 0, 0, r * 1.7, r * 1.7, r * 1.7);
    },
  };
  D.spirhalite_buoy = {
    desc: 'washed-up orange buoy (variant 0) or life vest + ring (variant 1); small collider', params: {}, variants: 2, mount: 'ground',
    build(B, o) {
      if ((o.variant ?? 0) === 0) {
        B.lathe('gloss', K.orange, [[0, 0], [0.25, 0.02], [0.34, 0.2], [0.3, 0.45], [0.12, 0.6], [0, 0.62]], 0, 0.12, 0, { rz: 1.35, seg: 14 });
        B.tor('metal', K.steelDk, 0.07, 0.015, -0.66, 0.2, 0, { ry: HP, ts: 10 });
        colBox(B, -0.25, 0, 0, 0.8, 0.55, 0.6);
      } else {
        B.push(0, 0.09, 0, 0.3); B.tor('gloss', K.orange, 0.32, 0.09, 0, 0, 0, { rx: HP, ts: 20 }); for (let i = 0; i < 4; i++) B.tor('gloss', K.white, 0.325, 0.093, 0, 0, 0, { rx: HP, rz: 0, arc: 0.3, ry: (i / 4) * TAU, ts: 4 }); B.pop();
        B.box('rubber', K.orange, 0.5, 0.12, 0.6, 0.7, 0.06, 0.2, { r: 0.05, ry: -0.4 });
        colBox(B, 0.3, 0, 0.1, 1.4, 0.25, 0.9);
      }
    },
  };
  // a teal tarp thrown over a crate and some planks (the reference's washed-up tarp): cover
  D.spirhalite_debris = {
    desc: 'washed-up teal tarp over a crate with planks (cover collider)', params: {}, variants: 1, mount: 'ground',
    build(B) {
      X.crate(B, 0.1, 0, 0, 0.95, 0.2, false);
      B.add('foliage', tpl('tarpheap', () => {
        const nx = 8, nz = 8, pos = [], idx = [], col = [];
        for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
          const u = i / nx - 0.5, v = j / nz - 0.5, x = u * 2.2, z = v * 1.9;
          const inBox = Math.max(Math.abs(x - 0.1) / 0.55, Math.abs(z) / 0.45);
          const y = inBox < 1 ? 0.8 : Math.max(0.03, 0.8 - (inBox - 1) * 0.9) + 0.06 * Math.sin(i * 1.7 + j * 2.3);
          pos.push(x, y, z); const k = 0.85 + 0.15 * Math.sin(i * 2.1 + j); col.push(k, k, k);
        }
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
        return meshGeo(pos, idx, col);
      }), K.tarp, 0, 0.02, 0);
      for (const [x, z, a] of [[-0.9, 0.7, 0.4], [0.7, -0.8, -0.2]]) pbox(B, 'wood', K.drift, 1.4, 0.05, 0.18, x, 0.02, z, { ry: a });
      colBox(B, 0.1, 0, 0, 1.3, 0.85, 1.1);
    },
  };

  // a heap of washed-up kelp and a few bleached planks on the wet-sand shelf (no collider)
  D.spirhalite_kelp = {
    desc: 'washed-up kelp strands and bits of plank on the shore (no collider)', params: { seed: 'layout', L: 'length' }, variants: 1, mount: 'ground',
    build(B, o) {
      const R = rng((o.seed ?? 1) * 29 + 3), L = o.L ?? 2.0;
      for (let i = 0; i < 7; i++) {
        const x0 = (R() - 0.5) * L, z0 = (R() - 0.5) * 0.6, a = (R() - 0.5) * 1.2, len = 0.6 + R() * 1.1, pts = [];
        for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push([x0 + Math.cos(a) * len * t, 0.025 + 0.02 * Math.sin(t * 7 + i), z0 + Math.sin(a) * len * t + 0.12 * Math.sin(t * 5 + i)]); }
        B.tube(NS('foliage'), i % 3 ? '#4f5a33' : '#6b6a3a', pts, 0.03, { radial: 4 });
      }
      for (let i = 0; i < 2; i++) pbox(B, NS('wood'), K.drift, 0.6 + R() * 0.6, 0.04, 0.12, (R() - 0.5) * L, 0.0, (R() - 0.5) * 0.8, { ry: R() * PI });
      for (let i = 0; i < 5; i++) B.sph(NS('gloss'), i % 2 ? '#e9d9cf' : '#d8c4b5', 0.04, (R() - 0.5) * L * 1.2, 0.01, (R() - 0.5) * 1.0, { half: true, ws: 6, hs: 3, sy: 0.6 });
    },
  };

  // ============================================================================================== the vanes
  // strange rusted pinwheels standing in the sea round the islands: a leaning post and a slowly turning hub of curved,
  // pierced blades (a spinner: turned by the kit about the post's axis)
  H.spinTemplate('spirhalite_vane', () => {
    const g = new GB(), c = [0.72, 0.42, 0.28];
    for (let b = 0; b < 5; b++) {
      const a0 = (b / 5) * TAU, ids = [];
      for (let s = 0; s <= 6; s++) {
        const f = s / 6, r = 0.25 + f * 1.9, a = a0 + f * 0.9, w = 0.35 * Math.sin(f * PI) + 0.08, tw = 0.5 * f;
        const cx = Math.cos(a) * r, cz = Math.sin(a) * r, tx = -Math.sin(a), tz = Math.cos(a);
        const k = 0.8 + 0.2 * Math.sin(s * 2 + b);
        ids.push([g.v(cx - tx * w, -Math.sin(tw) * w, cz - tz * w, 0, 1, 0, c[0] * k, c[1] * k, c[2] * k), g.v(cx + tx * w, Math.sin(tw) * w, cz + tz * w, 0, 1, 0, c[0] * k, c[1] * k, c[2] * k)]);
      }
      for (let s = 0; s < 6; s++) { g.quad(ids[s][0], ids[s + 1][0], ids[s + 1][1], ids[s][1]); g.quad(ids[s][1], ids[s + 1][1], ids[s + 1][0], ids[s][0]); }
    }
    const hub = new THREE.CylinderGeometry(0.28, 0.28, 0.3, 10);
    const hp = hub.attributes.position, hn = hub.attributes.normal;
    const base = g.p.length / 3;
    for (let i = 0; i < hp.count; i++) g.v(hp.getX(i), hp.getY(i), hp.getZ(i), hn.getX(i), hn.getY(i), hn.getZ(i), 0.45, 0.33, 0.27);
    const hi = hub.index.array; for (let i = 0; i < hi.length; i += 3) g.idx.push(base + hi[i], base + hi[i + 1], base + hi[i + 2]);
    return g.geo();
  });
  D.spirhalite_vane = {
    desc: 'a strange rusted vane turning slowly in the sea (out of play, visual only)', params: { h: 'hub height above the sea' }, variants: 1, mount: 'ground',
    build(B, o) {
      const h = o.h ?? 4.5;
      B.tube('metal', '#7a5a45', [[0, -2.5, 0], [0.2, h * 0.5, 0.1], [0.35, h, 0.25]], 0.12, { radial: 7 });
      B.spin('spirhalite_vane', 0.35, h, 0.55, { rx: HP * 0.92, ry: 0, speed: o.speed ?? 0.35 });
      B.add('rubber', rockGeo(77, 1, 1.4, 0.5, 1.2), K.rockDk, 0, -1.9, 0, { s: 1.2, ao: false });
    },
  };
}
