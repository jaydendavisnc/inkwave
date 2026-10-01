// Calamari County — the village high street's things (owner: the calamari stage; the Long Stages stretch, 2026-09-30):
// the fire-watch terrace (the hanshō tower in play, the fire brigade's pump cart, the "mind the fire" stone, a granite
// coping for its edges), the allotments (raised beds under snow, straw stooks, compost bins, a scarecrow, bamboo
// frames), the onsen garden (the steaming rock pool, a bamboo screen, nobori banners), the post office (the post van,
// parcel cages, the post office's round sign), the road (a curve mirror, a hydrant, a fingerpost) and the fish market's
// auction shed on the quay.
export function registerHighStreet(D, H, KIT) {
  const { K, NS, pbox, cylGeo, colBox, colRun, ROOF, RAIL, PERCH, snowCap, drift, driftGeo, icicles, letters, sign, hash, shade, mixc, pillowGeo, puff, chochin, sub, HP, PI, P3, TAU } = KIT;

  // ------------------------------------------------------------------------------------------ the hanshō tower
  // the village's fire lookout (hi-no-mi yagura): a red steel lattice tower on four concrete footings, open at the foot
  // (the bracing starts above head height, so its base is part of the terrace: the legs are cover), a ladder up one leg,
  // hoses drying on the first girder, the lookout's platform + railing, the alarm bell (hanshō) under a pyramid roof,
  // a red lamp that blinks at dusk; the plate FIRE WATCH on the first girder. Legs collide (their tops off-limits).
  D.calamari_hansho = {
    desc: 'The fire-watch tower in play (hanshō yagura, ~12 m): red steel lattice on four footings, open at the foot (bracing from 2.7 m up), ladder, hoses drying, lookout platform, the alarm bell under a pyramid roof, a blinking red lamp. Leg colliders (tops off-limits).',
    params: { h: 'height', b: 'half-width at the foot' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const h = o.h ?? 12, b0 = o.b ?? 1.6, b1 = 0.6, c = '#9a3a30', c2 = '#7e2e27', y0 = 2.7;
      const w = (y) => b0 + (b1 - b0) * (y / h);
      // footings + legs (angle-iron look: a square tube, raked in)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        B.box('paint', K.stoneLt, 0.62, 0.3, 0.62, sx * b0, 0.15, sz * b0, { r: 0.03 });
        B.tube('metal', c, [P3(sx * b0, 0.28, sz * b0), P3(sx * b1, h, sz * b1)], 0.085, { radial: 4 });
        colBox(B, sx * b0, 0, sz * b0, 0.62, 2.6, 0.62);
        colBox(B, sx * (b0 - 0.08), 2.6, sz * (b0 - 0.08), 0.4, h - 2.6, 0.4, ROOF);
      }
      // the first girder ring at y0 (the portal over the open foot) and the braced bays above it
      const nb = 5;
      for (let k = 0; k <= nb; k++) {
        const y = y0 + (k / nb) * (h - y0), ww = w(y);
        for (const [ax, s] of [[1, -1], [1, 1], [0, -1], [0, 1]]) {
          const p = (t) => ax ? P3(t * ww, y, s * ww) : P3(s * ww, y, t * ww);
          B.tube(k === 0 ? 'metal' : NS('metal'), k === 0 ? c : c2, [p(-1), p(1)], k === 0 ? 0.06 : 0.035, { radial: 4 });
        }
        if (k === nb) break;
        const ya = y, yb = y0 + ((k + 1) / nb) * (h - y0), wa = w(ya), wb = w(yb);
        for (const [ax, s] of [[1, -1], [1, 1], [0, -1], [0, 1]]) {
          const p = (t, yy, ww) => ax ? P3(t * ww, yy, s * ww) : P3(s * ww, yy, t * ww);
          B.tube(NS('metal'), c2, [p(-1, ya, wa), p(1, yb, wb)], 0.028, { radial: 3 });
          B.tube(NS('metal'), c2, [p(1, ya, wa), p(-1, yb, wb)], 0.028, { radial: 3 });
        }
      }
      // knee braces in the open foot bay's corners (above head height)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        B.tube(NS('metal'), c2, [P3(sx * w(1.9), 1.9, sz * w(1.9)), P3(sx * w(y0) * 0.45, y0, sz * w(y0))], 0.03, { radial: 3 });
        B.tube(NS('metal'), c2, [P3(sx * w(1.9), 1.9, sz * w(1.9)), P3(sx * w(y0), y0, sz * w(y0) * 0.45)], 0.03, { radial: 3 });
      }
      // the plate on the first girder, facing +Z
      B.box('paint', K.white, 1.5, 0.3, 0.04, 0, y0 - 0.26, w(y0) + 0.06, { r: 0.01 });
      letters(B, 'FIRE WATCH', { h: 0.13, x: 0, y: y0 - 0.33, z: w(y0) + 0.085, c: K.red, flat: true, wt: 0.22 });
      // hoses drying: white canvas hoses hung over the first girder on the −X face
      for (let k = 0; k < 3; k++) {
        const z = -0.5 + k * 0.5, x = -w(y0) - 0.05;
        B.tube(NS('paint'), '#e8e3d6', [P3(x, y0 + 0.05, z), P3(x - 0.08, y0 - 1.0 - k * 0.2, z + 0.05), P3(x - 0.05, y0 - 1.9 - k * 0.15, z)], 0.05, { radial: 5 });
        B.tube(NS('paint'), '#e8e3d6', [P3(x + 0.1, y0 + 0.05, z + 0.12), P3(x + 0.05, y0 - 0.8, z + 0.14)], 0.05, { radial: 5 });
      }
      // the ladder up the +X face's middle (to the lookout)
      const lx = (y) => w(y) + 0.06;
      for (const s of [-0.22, 0.22]) B.tube(NS('metal'), K.iron, [P3(lx(0.4), 0.4, s), P3(lx(h), h, s)], 0.02, { radial: 3 });
      for (let y = 0.7; y < h; y += 0.35) pbox(B, NS('metal'), K.iron, 0.03, 0.03, 0.44, lx(y), y, 0);
      // the lookout: platform, railing, the bell under a pyramid roof, the red lamp, snow
      B.box('metal', c, b1 * 2 + 0.9, 0.1, b1 * 2 + 0.9, 0, h, 0, { r: 0.02 });
      snowCap(B, 0, h + 0.05, 0, b1 * 2 + 0.8, b1 * 2 + 0.8, 0.1);
      const pr = b1 + 0.42;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.cyl(NS('metal'), c, 0.03, 2.1, sx * pr, h + 1.05, sz * pr, { seg: 5 });
      for (const y of [h + 0.5, h + 1.0]) for (const [ax, s] of [[1, -1], [1, 1], [0, -1], [0, 1]]) {
        const p = (t) => ax ? P3(t * pr, y, s * pr) : P3(s * pr, y, t * pr);
        B.tube(NS('metal'), c, [p(-1), p(1)], 0.02, { radial: 3 });
      }
      B.cyl(NS('metal'), K.iron, 0.02, 0.4, 0, h + 1.85, 0, { seg: 4 });
      B.lathe('metal', '#b08a3a', [[0, 0.5], [0.12, 0.48], [0.2, 0.3], [0.24, 0.08], [0.3, 0], [0, 0]], 0, h + 1.15, 0, { seg: 12 });
      B.lathe('paint', c2, [[0, 0.55], [pr + 0.45, 0], [pr + 0.45, -0.07], [0, -0.07]], 0, h + 2.1, 0, { seg: 4, ry: PI / 4 });
      B.add('paint', driftGeo(3), K.snow, 0, h + 2.12, 0, { sx: pr + 0.15, sy: 0.3, sz: pr + 0.15, ao: false });
      B.cyl(NS('metal'), K.iron, 0.02, 0.5, 0, h + 2.85, 0, { seg: 4 });
      B.blink('#ff4a3a', 0, h + 3.12, 0, { size: 0.12, rate: 0.5, hi: 5 });
      icicles(B, -pr, pr, h + 2.0, pr + 0.4, 71, 0.25);
    },
  };

  // ------------------------------------------------------------------------------------------ the pump cart
  // the fire brigade's hand-drawn pump cart (a Meiji-style te-oshi pump): two big red spoked wheels, the brass pump and
  // its long handles, a hose reel, the brigade's lantern on a pole, snow on the reel. Collides (cover).
  D.calamari_pumpcart = {
    desc: "The fire brigade's hand-drawn pump cart: two big spoked wheels, brass pump + handles, a hose reel, the brigade's lantern on a pole, snow on top. Collides (cover, ~1.2 m).",
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const red = '#b23a31', wr = 0.62;
      for (const s of [-1, 1]) {
        B.tor('wood', K.dark, wr, 0.045, 0, wr, s * 0.62, { ts: 22, rs: 5 });
        B.tor(NS('metal'), K.iron, wr + 0.01, 0.02, 0, wr, s * 0.66, { ts: 22, rs: 3 });
        for (let k = 0; k < 8; k++) { const a = (k / 8) * PI; pbox(B, NS('wood'), red, 0.035, wr * 2 - 0.1, 0.035, 0, wr, s * 0.62, { rz: a }); }
        B.cyl('paint', red, 0.09, 0.14, 0, wr, s * 0.62, { rx: HP, seg: 10 });
      }
      B.cyl(NS('metal'), K.iron, 0.03, 1.36, 0, wr, 0, { rx: HP, seg: 6 });
      B.box('wood', red, 1.2, 0.12, 1.0, -0.15, wr + 0.18, 0, { r: 0.02 });
      // the pump: a brass air chamber, two cylinders, the rocking beam with its long handles
      B.lathe('gloss', '#c49a45', [[0, 0], [0.16, 0], [0.18, 0.1], [0.18, 0.5], [0.12, 0.62], [0, 0.66]], -0.3, wr + 0.24, 0, { seg: 14 });
      for (const s of [-1, 1]) B.cyl('gloss', '#b88e3e', 0.08, 0.38, -0.3, wr + 0.43, s * 0.26, { seg: 10 });
      B.box('wood', K.woodDk, 0.1, 0.1, 1.9, -0.3, wr + 0.98, 0, { r: 0.02 });
      for (const s of [-1, 1]) B.cyl(NS('wood'), K.woodDk, 0.035, 0.9, -0.3, wr + 0.98, s * 0.95, { rz: HP, seg: 6 });
      // the hose reel at the back, the drawbar at the front
      B.cyl('paint', '#d9d2bf', 0.3, 0.5, 0.42, wr + 0.5, 0, { rx: HP, seg: 14 });
      for (const s of [-1, 1]) B.cyl(NS('paint'), red, 0.34, 0.03, 0.42, wr + 0.5, s * 0.27, { rx: HP, seg: 14 });
      snowCap(B, 0.42, wr + 0.8, 0, 0.5, 0.5, 0.1);
      B.tube('wood', K.woodDk, [P3(-0.7, wr + 0.2, -0.3), P3(-1.5, 0.35, -0.3), P3(-1.5, 0.35, 0.3), P3(-0.7, wr + 0.2, 0.3)], 0.035, { radial: 5 });
      // the brigade's lantern on its pole
      B.cyl(NS('wood'), K.woodDk, 0.025, 1.3, 0.7, wr + 0.85, -0.38, { seg: 5 });
      chochin(B, 0.7, wr + 1.52, -0.38, { r: 0.14, h: 0.34, bandC: red });
      colBox(B, -0.1, 0, 0, 1.5, 1.25, 1.4);
    },
  };

  // ------------------------------------------------------------------------------------------ the fire stone
  // a tall natural stone on a two-step plinth, MIND THE FIRE cut into its face (painted in), snow on its shoulders.
  // Collides (cover).
  D.calamari_firestone = {
    desc: 'A memorial stone: a tall rough granite slab on a two-step plinth, MIND THE FIRE cut into its face, snow on its shoulders. Collides (cover, 1.9 m).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('paint', K.stoneDk, 1.4, 0.2, 0.9, 0, 0.1, 0, { r: 0.03 });
      B.box('paint', K.granite, 1.15, 0.2, 0.7, 0, 0.3, 0, { r: 0.03 });
      // the stone: a rough slab, a little narrower at its shoulders
      B.box('paint', '#96938b', 0.8, 0.8, 0.36, 0, 0.8, 0, { r: 0.1 });
      B.box('paint', '#8f8c85', 0.7, 0.5, 0.33, 0.02, 1.4, 0, { r: 0.12, rz: 0.04 });
      letters(B, 'MIND', { h: 0.13, x: 0, y: 1.25, z: 0.176, c: '#f1ede2', flat: true, wt: 0.2 });
      letters(B, 'THE FIRE', { h: 0.13, x: 0, y: 1.02, z: 0.176, c: '#f1ede2', flat: true, wt: 0.2 });
      B.box(NS('paint'), K.red, 0.5, 0.05, 0.01, 0, 0.88, 0.172, { r: 0.004 });
      snowCap(B, 0.02, 1.64, 0, 0.6, 0.26, 0.1);
      snowCap(B, 0, 0.4, 0.28, 1.05, 0.14, 0.06);
      colBox(B, 0, 0, 0, 1.2, 1.7, 0.8);
    },
  };

  // ------------------------------------------------------------------------------------------ granite coping
  // a coping of granite blocks along an edge (local +X, length L) at a floor top y, lipping 0.1 m over the wall's face
  // (local +Z) and 0.12 m over the floor: dresses a terrace's edge; icicles under it. Non-colliding.
  D.calamari_coping = {
    desc: "A granite coping along a terrace's edge (local +X, length L, the wall face toward local +Z), a lip over the face, icicles under it. Non-colliding.",
    params: { length: 'm', y: 'floor top', ice: 'icicles' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 5, y = o.y ?? 1.3, n = Math.max(1, Math.round(L / 0.9));
      for (let i = 0; i < n; i++) pbox(B, i % 2 ? NS('paint') : 'paint', mixc(K.granite, K.stoneLt, hash(i * 3 + L)), L / n - 0.03, 0.09, 0.32, (i + 0.5) * (L / n), y - 0.025, -0.06);
      if (o.ice !== false) icicles(B, 0.2, L - 0.2, y - 0.07, 0.1, Math.round(L * 11 + y * 7), 0.2);
    },
  };

  // ------------------------------------------------------------------------------------------ allotments
  // a raised bed: a plank frame, the soil mounded under snow, leeks / daikon tops / winter cabbages poking through,
  // straw mulch at the ends, a plant label. Collides (low; a perch — stand on it, never ink).
  D.calamari_bed = {
    desc: 'Allotment raised bed (L × W, 0.45 m): plank frame, soil under snow, leeks / daikon tops / cabbages poking through, straw, a label. Collides (low perch).',
    params: { length: 'm', w: 'width', crop: "'leek' | 'daikon' | 'cabbage'" }, variants: 3, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 3, W = o.w ?? 1.2, h = 0.45, crop = o.crop ?? ['leek', 'daikon', 'cabbage'][(o.variant ?? 0) % 3];
      for (const s of [-1, 1]) { pbox(B, 'wood', K.woodDk, L, h, 0.06, 0, h / 2, s * (W / 2 - 0.03)); pbox(B, 'wood', K.woodDk, 0.06, h, W, s * (L / 2 - 0.03), h / 2, 0); }
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.box(NS('wood'), K.beam, 0.08, h + 0.08, 0.08, sx * (L / 2 - 0.02), (h + 0.08) / 2, sz * (W / 2 - 0.02), { r: 0.01 });
      B.box('paint', K.soil, L - 0.1, 0.1, W - 0.1, 0, h - 0.07, 0, { r: 0.02 });
      B.add('paint', pillowGeo(W - 0.14, 0.16), K.snow, 0, h - 0.04, 0, { sx: L - 0.16, ry: HP, ao: false });
      for (const s of [-1, 1]) snowCap(B, 0, h, s * (W / 2 - 0.03), L, 0.08, 0.05);
      const rows = Math.max(1, Math.round(W / 0.5)), per = Math.max(2, Math.round(L / 0.55));
      for (let r = 0; r < rows; r++) for (let i = 0; i < per; i++) {
        const x = -L / 2 + 0.25 + (i * (L - 0.5)) / (per - 1), z = -W / 2 + (r + 0.5) * (W / rows), t = hash(i * 7 + r * 13 + L);
        if (crop === 'leek') { B.cyl(NS('paint'), '#e9ecdf', 0.03, 0.2, x, h + 0.08, z, { seg: 4 }); for (let k = 0; k < 2; k++) pbox(B, NS('foliage'), mixc('#4f7a4a', '#6f9460', t), 0.05, 0.36, 0.01, x, h + 0.34, z, { ry: k * 1.6 + t, rz: (k - 0.5) * 0.4 }); }
        else if (crop === 'daikon') { B.cyl(NS('paint'), K.white, 0.05, 0.12, x, h + 0.05, z, { seg: 5 }); for (let k = 0; k < 3; k++) pbox(B, NS('foliage'), mixc('#4a6e40', '#6d8d58', t), 0.09, 0.3, 0.012, x, h + 0.2, z, { ry: k * 1.05 + t, rx: 0.4 }); }
        else { B.sph('foliage', mixc('#6e8f5a', '#8aa870', t), 0.13, x, h + 0.06, z, { ws: 7, hs: 4, sy: 0.75 }); }
      }
      // straw mulch heaped at one end, the label
      B.add('paint', driftGeo(4), '#c9ad6a', L / 2 - 0.3, h - 0.02, 0, { sx: 0.24, sy: 0.12, sz: W / 2 - 0.12 });
      B.cyl(NS('wood'), K.woodLt, 0.012, 0.35, -L / 2 + 0.15, h + 0.1, -W / 2 + 0.15, { seg: 4 });
      B.box(NS('paint'), K.white, 0.12, 0.08, 0.01, -L / 2 + 0.15, h + 0.3, -W / 2 + 0.16, { r: 0.004 });
      colBox(B, 0, 0, 0, L, h, W, PERCH);
    },
  };
  // rice-straw bundles stacked in a stook (a tidy heap of bundles under a snow cap) — cover
  D.calamari_straw = {
    desc: 'A stack of rice-straw bundles (L long, ~1.1 m high) with a snow cap. Collides (cover).',
    params: { length: 'm' }, variants: 2, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 1.8, n = Math.max(2, Math.round(L / 0.36)), rows = 3;
      for (let r = 0; r < rows; r++) for (let i = 0; i < n - r; i++) {
        const x = -L / 2 + 0.18 + (i + r * 0.5) * ((L - 0.36) / (n - 1)), y = 0.19 + r * 0.33, t = hash(i * 5 + r * 3 + (o.variant ?? 0));
        B.add('paint', cylGeo(0.19, 0.2, 0.95, 8), mixc('#c7aa66', '#b09257', t), x, y, (t - 0.5) * 0.06, { rx: HP, ry: (t - 0.5) * 0.1 });
        B.add(NS('paint'), cylGeo(0.205, 0.205, 0.05, 8, true), '#8a7447', x, y, 0.2, { rx: HP });
        B.add(NS('paint'), cylGeo(0.205, 0.205, 0.05, 8, true), '#8a7447', x, y, -0.2, { rx: HP });
      }
      snowCap(B, 0, 0.19 + (rows - 1) * 0.33 + 0.16, 0, Math.max(0.5, L - 0.36 * (rows - 1)), 0.8, 0.14);
      colBox(B, 0, 0, 0, L, 1.05, 0.95);
    },
  };
  // compost bins: three timber bays, straw and snow on top — cover
  D.calamari_compost = {
    desc: 'Three timber compost bays (2.4 × 0.9 × 1.0), straw and snow on top, a fork leaning on it. Collides (cover).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const L = 2.4, W = 0.9, h = 1.0;
      for (let k = 0; k <= 3; k++) B.box('wood', K.beam, 0.08, h, W, -L / 2 + (k * L) / 3, h / 2, 0, { r: 0.01 });
      for (let y = 0.1; y < h; y += 0.19) { pbox(B, 'wood', mixc(K.woodDk, K.wood, hash(y * 9)), L, 0.15, 0.04, 0, y + 0.07, -W / 2 + 0.02); if (y < 0.6) pbox(B, NS('wood'), mixc(K.woodDk, K.wood, hash(y * 5)), L, 0.15, 0.04, 0, y + 0.07, W / 2 - 0.02); }
      for (let k = 0; k < 3; k++) { B.add('paint', driftGeo(k + 1), k === 1 ? '#8a7447' : K.soil, -L / 3 + (k * L) / 3, 0.62, 0, { sx: L / 6 - 0.05, sy: 0.3, sz: W / 2 - 0.08 }); B.add('paint', driftGeo(k + 3), K.snow, -L / 3 + (k * L) / 3, 0.82, 0, { sx: L / 6 - 0.1, sy: 0.14, sz: W / 2 - 0.12, ao: false }); }
      B.tube(NS('wood'), K.woodLt, [P3(L / 2 + 0.08, 0, 0.2), P3(L / 2 + 0.2, 1.15, 0.3)], 0.02, { radial: 4 });
      colBox(B, 0, 0, 0, L + 0.1, h, W);
    },
  };
  // the scarecrow (kakashi): a post and a cross arm, a straw coat (mino), a sedge hat, a face on a cloth sack
  D.calamari_scarecrow = {
    desc: 'A scarecrow (kakashi): post + cross arm, straw coat, sedge hat, cloth face, snow on the hat. Thin post collider.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.cyl('wood', K.woodDk, 0.04, 1.9, 0, 0.95, 0, { seg: 6 });
      B.cyl('wood', K.woodDk, 0.03, 1.5, 0, 1.45, 0, { rz: HP, seg: 6 });
      B.lathe('paint', '#b39a5e', [[0.1, 1.5], [0.3, 1.2], [0.42, 0.75], [0.4, 0.7], [0, 0.72]], 0, 0, 0, { seg: 10 });
      for (const s of [-1, 1]) B.lathe(NS('paint'), '#a88f55', [[0.03, 0], [0.13, -0.35], [0, -0.33]], s * 0.62, 1.47, 0, { seg: 6 });
      B.sph('paint', '#e6dcc4', 0.17, 0, 1.72, 0, { ws: 10, hs: 8 });
      for (const s of [-1, 1]) B.sph(NS('paint'), K.dark, 0.022, s * 0.06, 1.75, 0.16, { ws: 5, hs: 4 });
      B.box(NS('paint'), K.red, 0.1, 0.018, 0.01, 0, 1.66, 0.165, { r: 0.004 });
      B.lathe('paint', '#8d7a4c', [[0, 0.2], [0.14, 0.14], [0.42, 0], [0.4, -0.02], [0, 0.1]], 0, 1.84, 0, { seg: 14 });
      snowCap(B, 0, 1.98, 0, 0.3, 0.3, 0.07);
      colBox(B, 0, 0, 0, 0.3, 1.5, 0.3);
    },
  };
  // bamboo A-frames along local +X (length L) for the winter peas, straw tied to them: see-through (rail)
  D.calamari_frame = {
    desc: 'Bamboo A-frame trellis along local +X (length L, 1.5 m high): canes, a ridge pole, straw ties, snow on the ridge. Rail collider (see-through).',
    params: { length: 'm' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 3, n = Math.max(2, Math.round(L / 0.45) + 1), hh = 1.5, bam = '#b8aa74';
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * L; for (const s of [-1, 1]) B.tube(NS('wood'), bam, [P3(x, 0, s * 0.42), P3(x, hh, -s * 0.05)], 0.018, { radial: 4 }); }
      B.cyl('wood', bam, 0.025, L + 0.2, L / 2, hh - 0.04, 0, { rz: HP, seg: 6 });
      snowCap(B, L / 2, hh - 0.01, 0, L + 0.1, 0.1, 0.05);
      for (let i = 0; i < n; i += 2) B.tor(NS('paint'), '#c9ad6a', 0.05, 0.015, (i / (n - 1)) * L, hh - 0.08, 0, { ts: 8, rs: 3 });
      B.col(0, 0, -0.45, L, hh, 0.45, RAIL);
    },
  };

  // ------------------------------------------------------------------------------------------ the onsen garden
  // the rock pool (rotenburo): big rounded rocks round a steaming pool, a bamboo spout pouring into it, a stack of
  // wooden buckets, the steam rising. The whole footprint slides you off (roof): nobody stands in the water.
  D.calamari_pool = {
    desc: "The inn garden's rock pool (rotenburo, L × W): rounded rocks round steaming water, a bamboo spout, wooden buckets, steam. Roof collider (slide off; low cover).",
    params: { length: 'm', w: 'width' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 3, W = o.w ?? 2, rr = 0.34;
      // the water (a glossy teal sheet sunk a little inside the rocks), a darker floor under it
      B.box('paint', '#4c5a5c', L - 0.3, 0.2, W - 0.3, 0, 0.1, 0, { r: 0.05 });
      B.box('gloss', '#5f9c9a', L - 0.35, 0.02, W - 0.35, 0, 0.36, 0, { r: 0.005 });
      // the rocks round the rim
      const per = Math.round((2 * (L + W)) / 0.7);
      for (let i = 0; i < per; i++) {
        const t = i / per, P = 2 * (L + W), d = t * P;
        let x, z;
        if (d < L) { x = -L / 2 + d; z = -W / 2; } else if (d < L + W) { x = L / 2; z = -W / 2 + (d - L); } else if (d < 2 * L + W) { x = L / 2 - (d - L - W); z = W / 2; } else { x = -L / 2; z = W / 2 - (d - 2 * L - W); }
        const s = rr * (0.8 + 0.45 * hash(i * 3.3)), g = driftGeo(i % 6);
        B.add('paint', g, mixc(K.granite, K.stoneDk, hash(i * 7)), x, 0, z, { sx: s * 1.2, sy: s * 1.4, sz: s, ry: hash(i) * 3 });
        if (hash(i * 11) > 0.6) B.add(NS('paint'), driftGeo((i + 2) % 6), K.snow, x, s * 1.25, z, { sx: s * 0.8, sy: s * 0.3, sz: s * 0.7, ao: false });
      }
      // the bamboo spout on a post at one end, water falling
      B.cyl('wood', K.woodDk, 0.06, 1.0, -L / 2 - 0.1, 0.5, 0, { seg: 6 });
      B.tube('wood', '#8fa05a', [P3(-L / 2 - 0.1, 0.95, 0), P3(-L / 2 + 0.45, 0.85, 0)], 0.045, { radial: 6 });
      pbox(B, NS('gloss'), '#cfe4ee', 0.05, 0.5, 0.05, -L / 2 + 0.48, 0.6, 0);
      // wooden buckets stacked by the rim
      for (let k = 0; k < 3; k++) B.lathe('wood', '#c49f76', [[0, 0], [0.13, 0], [0.15, 0.2], [0.14, 0.2], [0, 0.02]], L / 2 + 0.28, 0.02 + k * 0.08, W / 2 - 0.25 + k * 0.02, { seg: 10 });
      // steam: soft puffs drifting up off the water
      for (let k = 0; k < 6; k++) {
        const t = k / 5, sz = 0.45 + t * 0.9;
        B.add(NS('foliage'), puff(1, (k + 3) % 6), mixc('#fbfcfd', '#dfe6ee', t * 0.7), (hash(k) - 0.5) * L * 0.5 + t * 0.4, 0.8 + t * 2.4, (hash(k * 3) - 0.5) * W * 0.4, { s: sz, sy: sz * 0.6, sz: sz * 0.8, ry: k, ao: false });
      }
      colBox(B, 0, 0, 0, L + 0.3, 0.6, W + 0.3, ROOF);
    },
  };
  // a bamboo screen along local +X (length L, h high): split-bamboo panels between cedar posts, see-through gaps (rail)
  D.calamari_screen = {
    desc: 'Bamboo screen fence along local +X (length L, height h): split-bamboo slats between cedar posts, a capping rail with snow. Rail collider (shots, ink, squids pass).',
    params: { length: 'm', h: 'height' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 3, h = o.h ?? 1.3, np = Math.max(1, Math.round(L / 1.5));
      for (let i = 0; i <= np; i++) B.box('wood', K.cedarDk, 0.1, h + 0.1, 0.1, (i * L) / np, (h + 0.1) / 2, 0, { r: 0.01 });
      for (let x = 0.08; x < L - 0.04; x += 0.09) B.add(NS('wood'), cylGeo(0.022, 0.022, h - 0.2, 5), mixc('#b8aa74', '#a3955f', hash(x * 13)), x, 0.1 + (h - 0.2) / 2, 0.02, {});
      for (const y of [0.35, h - 0.3]) B.cyl(NS('wood'), '#8a7447', 0.025, L, L / 2, y, 0.06, { rz: HP, seg: 5 });
      pbox(B, 'wood', K.cedarDk, L + 0.1, 0.08, 0.16, L / 2, h + 0.04, 0.02);
      snowCap(B, L / 2, h + 0.08, 0.02, L + 0.05, 0.14, 0.06);
      B.col(0, 0, -0.08, L, h + 0.1, 0.12, RAIL);
    },
  };
  // a nobori banner: a tall narrow cloth flag on a bamboo pole with a cross piece, lettering down it. Non-colliding
  // (a thin pole).
  D.calamari_nobori = {
    desc: 'A nobori banner: tall narrow cloth on a bamboo pole, a vertical word down it, a weighted base. Non-colliding.',
    params: { text: 'vertical word', c: 'cloth colour' }, variants: 1, mount: 'ground',
    build(B, o) {
      const c = o.c ?? '#2f5d6b', tx = o.text ?? 'ONSEN', h = 2.9;
      B.cyl('paint', K.stoneDk, 0.16, 0.14, 0, 0.07, 0, { seg: 8 });
      B.cyl('wood', '#b8aa74', 0.022, h, 0, h / 2, 0, { seg: 5 });
      B.cyl(NS('wood'), '#b8aa74', 0.015, 0.5, 0.25, h - 0.08, 0, { rz: HP, seg: 4 });
      pbox(B, 'paint', c, 0.46, 1.9, 0.008, 0.26, h - 1.05, 0);
      pbox(B, NS('paint'), K.cream, 0.08, 1.9, 0.01, 0.07, h - 1.05, 0.001);
      [...tx].forEach((ch, i) => letters(B, ch, { h: 0.16, x: 0.28, y: h - 0.42 - i * 0.26, z: 0.006, c: K.cream, flat: true, wt: 0.22 }));
    },
  };

  // ------------------------------------------------------------------------------------------ the road
  // the curve mirror at a blind corner: an orange pole with a round convex mirror in a red-rimmed hood, snow on top
  D.calamari_mirror = {
    desc: 'Traffic curve mirror on an orange pole (a round convex mirror, red rim, a hood with snow). Thin pole collider.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.cyl('paint', '#e07a2e', 0.05, 2.9, 0, 1.45, 0, { seg: 8 });
      B.tube(NS('paint'), '#e07a2e', [P3(0, 2.8, 0), P3(0, 2.95, 0.2), P3(0, 2.95, 0.3)], 0.035, { radial: 5 });
      B.push(0, 2.95, 0.34, 0, -0.12);
      B.cyl('gloss', '#b8c6cc', 0.36, 0.05, 0, 0, 0, { rx: HP, seg: 20 });
      B.tor(NS('paint'), '#c3372e', 0.37, 0.035, 0, 0, 0.02, { ts: 24, rs: 4 });
      B.cyl(NS('paint'), '#c3372e', 0.4, 0.06, 0, 0.02, -0.04, { rx: HP, seg: 20, open: true });
      snowCap(B, 0, 0.36, -0.02, 0.42, 0.14, 0.06);
      B.pop();
      colBox(B, 0, 0, 0, 0.2, 2.8, 0.2);
    },
  };
  // the red hydrant (standpipe) with its sign on a pole: HYDRANT
  D.calamari_hydrant = {
    desc: 'A red above-ground hydrant (two outlets, a cap) and its HYDRANT sign on a pole, snow on the cap. Collides (small).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.lathe('gloss', '#c23b30', [[0, 0], [0.2, 0], [0.2, 0.08], [0.14, 0.12], [0.14, 0.72], [0.18, 0.76], [0.16, 0.86], [0, 0.9]], 0, 0, 0, { seg: 14 });
      for (const s of [-1, 1]) B.cyl('gloss', '#c23b30', 0.06, 0.16, s * 0.18, 0.55, 0, { rz: HP, seg: 8 });
      snowCap(B, 0, 0.88, 0, 0.26, 0.26, 0.06);
      B.cyl(NS('metal'), K.galv, 0.03, 2.2, 0.45, 1.1, 0, { seg: 6 });
      B.box('paint', '#c23b30', 0.5, 0.36, 0.03, 0.45, 2.0, 0.03, { r: 0.01 });
      letters(B, 'HYDRANT', { h: 0.07, x: 0.45, y: 1.97, z: 0.05, c: K.white, flat: true, wt: 0.22 });
      snowCap(B, 0.45, 2.18, 0.03, 0.5, 0.06, 0.04);
      colBox(B, 0, 0, 0, 0.46, 0.9, 0.3);
    },
  };
  // a timber fingerpost with arms pointing along the streets (text per arm, yaw per arm); snow on the cap
  D.calamari_fingerpost = {
    desc: 'A timber fingerpost: arms with place names pointing along the streets, a little roof cap with snow. Thin post collider.',
    params: { arms: '[{ text, yaw, y }]' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('wood', K.beam, 0.12, 2.6, 0.12, 0, 1.3, 0, { r: 0.01 });
      for (const a of o.arms ?? []) {
        B.push(0, a.y ?? 2.1, 0, a.yaw ?? 0);
        const w = Math.max(0.9, KIT.textW(a.text, 0.2, 0.1) * 0.1 + 0.3);
        B.box('wood', '#e8e0cc', w, 0.18, 0.04, w / 2 + 0.06, 0, 0, { r: 0.01 });
        letters(B, a.text, { h: 0.1, x: w / 2 + 0.03, y: -0.05, z: 0.022, c: K.cedarDk, flat: true, wt: 0.2, track: 0.1 });
        B.push(0, 0, 0, PI);
        letters(B, a.text, { h: 0.1, x: -w / 2 - 0.06, y: -0.05, z: 0.022, c: K.cedarDk, flat: true, wt: 0.2, track: 0.1 });
        B.pop();
        B.pop();
      }
      B.lathe('paint', K.kawara, [[0, 0.16], [0.14, 0], [0.14, -0.03], [0, -0.03]], 0, 2.62, 0, { seg: 4, ry: PI / 4 });
      snowCap(B, 0, 2.7, 0, 0.18, 0.18, 0.05);
      colBox(B, 0, 0, 0, 0.18, 2.4, 0.18);
    },
  };

  // the yaki-imo stall: a roasted sweet potato cart (a timber cart on two wheels, a stone-lined oven steaming under a
  // little tin roof with snow, a red lantern, a hand-lettered board). Collides (cover; the roof off-limits).
  D.calamari_yatai = {
    desc: 'A yaki-imo (roast sweet potato) cart: timber body on two wheels, a steaming stone oven, a tin roof on posts with snow, a red lantern, a board. Collides (cover ~1.1 m; roof off-limits).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const L = 2.2, W = 1.2, hb = 1.05, hr = 2.2;
      B.box('wood', K.woodDk, L, 0.6, W, 0, 0.55, 0, { r: 0.03 });
      pbox(B, 'wood', K.woodLt, L + 0.1, 0.06, W + 0.1, 0, 0.88, 0);
      for (const s of [-1, 1]) { B.tor('wood', K.dark, 0.34, 0.04, s * 0.55, 0.34, W / 2 + 0.05, { ts: 16, rs: 4 }); B.cyl(NS('metal'), K.iron, 0.05, 0.1, s * 0.55, 0.34, W / 2 + 0.05, { rx: HP, seg: 8 }); }
      // the oven: a black iron box of hot stones, a lid, steam
      B.box('metal', K.iron, 0.9, 0.3, 0.7, -0.35, 1.06, 0, { r: 0.04 });
      for (let k = 0; k < 7; k++) B.sph(NS('paint'), mixc('#8a7f76', '#6d645c', hash(k)), 0.07, -0.7 + (k % 4) * 0.2, 1.22, -0.2 + Math.floor(k / 4) * 0.25, { ws: 6, hs: 4 });
      for (let k = 0; k < 3; k++) B.add(NS('paint'), cylGeo(0.05, 0.03, 0.22, 6), '#8e3f5a', -0.5 + k * 0.2, 1.24, 0.12, { rz: HP, ry: 0.3 * k });
      for (let k = 0; k < 3; k++) { const t = k / 2, sz = 0.3 + t * 0.4; B.add(NS('foliage'), puff(1, (k + 1) % 6), mixc('#fbfcfd', '#dfe6ee', t), -0.35 + t * 0.2, 1.5 + t * 0.9, 0, { s: sz, sy: sz * 0.6, ao: false }); }
      // posts, the tin roof with snow, the lantern, the board, the push handles
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.box(NS('wood'), K.beam, 0.07, hr - 0.9, 0.07, sx * (L / 2 - 0.05), 0.9 + (hr - 0.9) / 2, sz * (W / 2 - 0.05), { r: 0.01 });
      B.push(0, hr, 0, 0, 0, 0.06);
      pbox(B, 'metal', '#8b3f35', L + 0.4, 0.05, W + 0.4, 0, 0, 0);
      snowCap(B, 0, 0.03, 0, L + 0.25, W + 0.25, 0.18);
      B.pop();
      icicles(B, -L / 2 - 0.1, L / 2 + 0.1, hr - 0.1, W / 2 + 0.2, 23, 0.2);
      chochin(B, L / 2 - 0.2, hr - 0.35, W / 2 + 0.05, { r: 0.14, h: 0.34 });
      B.box('wood', '#e8e0cc', 1.2, 0.34, 0.04, 0.3, 1.45, W / 2 + 0.03, { r: 0.01 });
      letters(B, 'YAKI-IMO', { h: 0.14, x: 0.3, y: 1.37, z: W / 2 + 0.052, c: '#8e3f3a', flat: true, wt: 0.22 });
      for (const s of [-1, 1]) B.tube(NS('wood'), K.woodDk, [P3(L / 2, 0.8, s * 0.4), P3(L / 2 + 0.7, 0.75, s * 0.4)], 0.03, { radial: 4 });
      // (the oven, the board and the stall's back panel make it chest-high cover)
      B.box('wood', K.woodDk, L - 0.1, 0.62, 0.05, 0, 1.2, -W / 2 + 0.05, { r: 0.01 });
      colBox(B, 0, 0, 0, L + 0.1, hb + 0.35, W + 0.1);
      colBox(B, 0, hr - 0.1, 0, L + 0.4, 0.3, W + 0.4, ROOF);
    },
  };

  // ------------------------------------------------------------------------------------------ the post office
  // the post van: a little red kei van (the post office's mark on its side), snow on the roof, chains on the tyres.
  // Collides (cover).
  D.calamari_postvan = {
    desc: "The post office's red kei van (the post mark on its sides, POST on the bonnet), snow on the roof. Collides (cover).",
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const L = 3.4, W = 1.48, red = '#b8413a';
      B.box('gloss', red, W, 1.45, L - 0.3, 0, 1.0, -0.15, { r: 0.1 });
      B.box('gloss', red, W, 0.6, 0.6, 0, 0.62, L / 2 - 0.3, { r: 0.1 });
      pbox(B, NS('gloss'), K.glass, W - 0.12, 0.55, 0.02, 0, 1.4, L / 2 - 0.44, { rx: -0.2 });
      for (const s of [-1, 1]) { pbox(B, NS('gloss'), K.glass, 0.02, 0.45, 0.7, s * W / 2, 1.42, L / 2 - 0.9); pbox(B, NS('paint'), K.white, 0.01, 0.1, L - 0.5, s * (W / 2 + 0.002), 0.78, -0.2); postMark(B, s * (W / 2 + 0.006), 1.15, -0.6, s * HP, 0.2, K.white); }
      for (const s of [-1, 1]) { B.cyl(NS('glow'), '#fff4d6', 0.08, 0.04, s * 0.55, 0.72, L / 2 + 0.01, { rx: HP, seg: 10, glow: 0.8 }); B.box(NS('gloss'), '#c9453b', 0.12, 0.26, 0.04, s * 0.6, 1.0, -L / 2, { r: 0.01 }); }
      letters(B, 'POST', { h: 0.12, x: 0, y: 0.8, z: L / 2 + 0.012, c: K.white, flat: true, wt: 0.22 });
      snowCap(B, 0, 1.72, -0.15, W - 0.1, L - 0.4, 0.16);
      for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { B.cyl('rubber', K.dark, 0.27, 0.2, x * (W / 2 - 0.05), 0.27, z * (L / 2 - 0.55), { rz: HP, seg: 12 }); B.cyl(NS('metal'), K.galv, 0.15, 0.21, x * (W / 2 - 0.05), 0.27, z * (L / 2 - 0.55), { rz: HP, seg: 8 }); }
      drift(B, -W / 2 - 0.1, 0, 0.2, 0.35, 0.3, 1.4, { seed: 2 });
      colBox(B, 0, 0, 0, W, 1.72, L);
    },
  };
  // the post office mark (a red roundel with the white post mark: two bars and a stem), face frame (+z out)
  function postMark(B, x, y, z, ry, r, c = K.white) {
    B.push(x, y, z, ry);
    B.cyl(NS('paint'), c === K.white ? '#b8413a' : K.white, r, 0.01, 0, 0, 0, { rx: HP, seg: 20 });
    pbox(B, NS('paint'), c, r * 1.1, r * 0.14, 0.004, 0, r * 0.42, 0.007);
    pbox(B, NS('paint'), c, r * 1.1, r * 0.14, 0.004, 0, r * 0.1, 0.007);
    pbox(B, NS('paint'), c, r * 0.14, r * 0.9, 0.004, 0, -r * 0.3, 0.007);
    B.pop();
  }
  // the post office's sign on the wall: a round white disc with the red post mark, on a bracket (face frame, +z out)
  D.calamari_postsign = {
    desc: 'The post office sign on a wall bracket: a round white disc with the red post mark (both sides). Non-colliding.',
    params: {}, variants: 1, mount: 'wall',
    build(B, o) {
      B.box(NS('metal'), K.iron, 0.05, 0.05, 0.5, 0, 0, 0.25, { r: 0.01 });
      B.push(0, -0.36, 0.5, HP);
      B.cyl('paint', K.white, 0.3, 0.05, 0, 0, 0, { rx: HP, seg: 22 });
      B.tor(NS('paint'), '#b8413a', 0.3, 0.02, 0, 0, 0, { ts: 22, rs: 4 });
      for (const s of [1, -1]) {
        B.push(0, 0, s * 0.028, s > 0 ? 0 : PI);
        pbox(B, NS('paint'), '#b8413a', 0.34, 0.045, 0.004, 0, 0.13, 0);
        pbox(B, NS('paint'), '#b8413a', 0.34, 0.045, 0.004, 0, 0.03, 0);
        pbox(B, NS('paint'), '#b8413a', 0.045, 0.26, 0.004, 0, -0.1, 0);
        B.pop();
      }
      snowCap(B, 0, 0.3, 0, 0.2, 0.06, 0.04);
      B.pop();
    },
  };
  // roll cages of parcels and mail sacks on the sorting dock — cover
  D.calamari_cages = {
    desc: 'Two steel roll cages full of parcels and mail sacks (1.5 m), snow on top. Collides (cover).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      for (const s of [-1, 1]) {
        const x = s * 0.45;
        B.box('metal', K.galv, 0.8, 0.06, 0.7, x, 0.16, 0, { r: 0.01 });
        for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { B.cyl(NS('metal'), K.galv, 0.02, 1.4, x + cx * 0.38, 0.86, cz * 0.33, { seg: 4 }); B.cyl(NS('rubber'), K.dark, 0.05, 0.04, x + cx * 0.33, 0.06, cz * 0.28, { rz: HP, seg: 8 }); }
        for (let yy = 0.5; yy < 1.5; yy += 0.3) for (const cz of [-1, 1]) pbox(B, NS('metal'), K.galv, 0.78, 0.015, 0.015, x, yy, cz * 0.33);
        B.box('paint', '#c8a877', 0.5, 0.35, 0.4, x - 0.08, 0.37, -0.08, { r: 0.02 });
        B.box('paint', '#b9955f', 0.4, 0.3, 0.35, x + 0.1, 0.72, 0.1, { r: 0.02 });
        B.add('paint', driftGeo(s > 0 ? 1 : 4), s > 0 ? '#5a6e8a' : '#6f6a5c', x, 0.9, -0.05, { sx: 0.28, sy: 0.45, sz: 0.24 });
        snowCap(B, x, 1.56, 0, 0.7, 0.6, 0.08);
      }
      colBox(B, 0, 0, 0, 1.75, 1.56, 0.75);
    },
  };

  // the chiller room's dressing (on its level block: the walls are the block, metal panels): a roller door and a
  // personnel door on its long face, the compressor unit on the roof (off-limits) with its fan, pipes, the ICE sign,
  // a frost-rimed drift at its foot. pos = the block's centre at its floor; w (x), d (z), h. Non-colliding.
  D.calamari_chiller = {
    desc: "The fish market's chiller room dressing: roller door, a personnel door, the compressor on the roof, pipes, ICE sign, frost. Non-colliding (the level block collides).",
    params: { w: 'block width', d: 'block depth', h: 'height', face: 'door face (0 +Z, 1 +X, 2 −Z, 3 −X)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = o.w ?? 2.7, Dd = o.d ?? 3.2, h = o.h ?? 2.6;
      KIT.onFace(B, W, Dd, o.face ?? 1, (L) => {
        pbox(B, 'metal', K.galv, 1.5, 2.1, 0.04, -0.4, 1.05, 0.02);
        for (let k = 0; k < 11; k++) pbox(B, NS('metal'), K.steel, 1.5, 0.02, 0.03, -0.4, 0.1 + k * 0.19, 0.05);
        pbox(B, 'metal', '#dfe3e5', 0.75, 1.95, 0.05, L / 2 - 0.5, 0.98, 0.02);
        B.box(NS('metal'), K.iron, 0.05, 0.3, 0.05, L / 2 - 0.78, 1.0, 0.08, { r: 0.01 });
        B.box('paint', '#2c4d56', 0.9, 0.34, 0.04, -0.4, 2.3, 0.03, { r: 0.01 });
        letters(B, 'ICE', { h: 0.2, x: -0.4, y: 2.22, z: 0.055, c: K.white, flat: true, wt: 0.24 });
        B.add('paint', driftGeo(2), K.snow, 0.8, 0, 0.25, { sx: 0.6, sy: 0.3, sz: 0.3, ao: false });
      });
      // the compressor on the roof: a box with a round fan grille, pipes down the side
      B.box('metal', '#c9ced0', 1.2, 0.7, 0.8, 0, h + 0.35, 0.3, { r: 0.04 });
      B.cyl(NS('metal'), K.iron, 0.3, 0.02, 0, h + 0.71, 0.3, { seg: 16 });
      B.tor(NS('metal'), K.steel, 0.3, 0.02, 0, h + 0.72, 0.3, { rx: HP, ts: 16, rs: 3 });
      snowCap(B, 0, h + 0.7, 0.3, 1.1, 0.7, 0.1);
      snowCap(B, 0, h, -0.6, W - 0.2, Dd * 0.4, 0.14);
      for (const dz of [-0.1, 0.05]) B.tube(NS('metal'), K.copper ?? '#b87333', [P3(0.6, h + 0.2, 0.3 + dz), P3(W / 2 + 0.05, h + 0.1, 0.3 + dz), P3(W / 2 + 0.05, 0.3, 0.3 + dz)], 0.025, { radial: 4 });
      icicles(B, -W / 2, W / 2, h - 0.05, Dd / 2 + 0.02, 57, 0.2);
    },
  };

  // ------------------------------------------------------------------------------------------ the fish market
  // the auction shed on the quay (seri-ba): steel posts on a grid, a shallow gable roof of corrugated sheet with snow
  // (off-limits), strip lights under it (lit at dusk), the auction bell on a post, the price board, the market's name
  // board on the gable. pos = the shed's centre; W along local x, Dd along local z. Posts collide (small cover).
  D.calamari_market = {
    desc: 'Fish market auction shed: steel posts, a shallow corrugated gable roof with snow (off-limits collider), strip lights (dusk), the auction bell, a price board, the name board. Posts collide.',
    params: { w: 'width (x)', d: 'depth (z)', h: 'eaves height' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = o.w ?? 6, Dd = o.d ?? 7, h = o.h ?? 4.0, rise = 0.7, steel = '#4f6d6a', nx = 2, nz = Math.max(2, Math.round(Dd / 3.2));
      const posts = [];
      for (let i = 0; i < nx; i++) for (let k = 0; k <= nz; k++) posts.push([-W / 2 + 0.2 + i * (W - 0.4), -Dd / 2 + 0.2 + (k * (Dd - 0.4)) / nz]);
      for (const [x, z] of posts) { B.box('metal', steel, 0.2, h, 0.2, x, h / 2, z, { r: 0.02 }); B.box(NS('paint'), K.stoneLt, 0.34, 0.12, 0.34, x, 0.06, z, { r: 0.02 }); colBox(B, x, 0, z, 0.24, h, 0.24); }
      for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) pbox(B, 'metal', steel, 0.16, 0.26, Dd, x, h - 0.13, 0);
      for (let k = 0; k <= nz; k++) { const z = -Dd / 2 + 0.2 + (k * (Dd - 0.4)) / nz; B.tube(NS('metal'), steel, [P3(-W / 2 + 0.2, h, z), P3(0, h + rise, z), P3(W / 2 - 0.2, h, z)], 0.07, { radial: 4 }); }
      // the roof: two corrugated slopes (ribs as a striped slab), snow on each, icicles on the eaves
      const sl = Math.hypot(W / 2 + 0.5, rise), a = Math.atan2(rise, W / 2 + 0.5);
      for (const s of [-1, 1]) {
        B.push(s * (W / 4 + 0.12), h + rise / 2 + 0.08, 0, 0, 0, -s * a);
        pbox(B, 'metal', '#9aa4a8', sl, 0.05, Dd + 0.8, 0, 0, 0);
        for (let x = -sl / 2 + 0.1; x < sl / 2; x += 0.2) pbox(B, NS('metal'), '#8a9498', 0.05, 0.03, Dd + 0.8, x, -0.035, 0);
        snowCap(B, 0, 0.025, 0, sl - 0.15, Dd + 0.6, 0.18, { ry: HP });
        B.pop();
        icicles(B, -Dd / 2, Dd / 2, h - 0.02, 0, 33 + s, 0.3);
      }
      colBox(B, 0, h - 0.3, 0, W + 1.1, rise + 0.5, Dd + 0.8, ROOF);
      // strip lights under the ridge, the auction bell on a post, the price board, the name board on the gable
      for (let k = 0; k < nz; k++) { const z = -Dd / 2 + 0.2 + ((k + 0.5) * (Dd - 0.4)) / nz; B.box(NS('glow'), '#f4f7ff', 0.1, 0.05, 1.2, 0, h + rise - 0.22, z, { glow: 1.4 }); B.cyl(NS('metal'), K.iron, 0.01, 0.2, 0, h + rise - 0.1, z, { seg: 3 }); }
      const bx = -W / 2 + 0.2, bz = -Dd / 2 + 0.2;
      B.box(NS('metal'), K.iron, 0.4, 0.05, 0.05, bx + 0.25, 2.4, bz, { r: 0.01 });
      B.lathe('metal', '#b08a3a', [[0, 0.3], [0.08, 0.28], [0.13, 0.15], [0.16, 0], [0, 0]], bx + 0.42, 2.05, bz, { seg: 10 });
      B.box('paint', '#2f3a33', 1.4, 0.9, 0.05, W / 2 - 0.2, 1.7, -0.9, { r: 0.02, ry: -HP });
      for (let k = 0; k < 4; k++) pbox(B, NS('paint'), '#e8e4d8', 0.01, 0.04, 0.9 - (k % 2) * 0.3, W / 2 - 0.24, 1.95 - k * 0.16, -0.9 - (k % 2) * 0.15);
      B.push(0, h + 0.1, Dd / 2 + 0.4);
      B.box('wood', K.cedarDk, 3.6, 0.5, 0.06, 0, 0.25, 0, { r: 0.02 });
      letters(B, 'FISH MARKET', { h: 0.24, x: 0, y: 0.12, z: 0.035, c: K.cream, flat: true, wt: 0.2 });
      B.pop();
    },
  };
}
