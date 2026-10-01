// Calamari County — village furniture (owner: the calamari stage): the round post box, snowbanks, a snowman, stone
// lanterns, vending machines, bicycles half-buried, the kei truck, the bus shelter, snow-laden pines and bare trees,
// street lamps, the fire lookout tower (the landmark on each hillside), fences, the dry-stone retaining walls, and the
// station's small things (fire buckets, a luggage cart, a snow shovel, a payphone, a notice board).
export function registerVillage(D, H, KIT) {
  const { K, NS, pbox, cylGeo, colBox, colRun, ROOF, RAIL, PERCH, snowCap, drift, driftGeo, icicles, letters, sign, hash, shade, mixc, extr, pillowGeo, puff, chochin, HP, PI, P3, TAU, tpl, kf } = KIT;

  // ------------------------------------------------------------------------------------------ post box
  D.calamari_postbox = {
    desc: 'The round red post box (cast iron pillar with a cap, slot, plate), snow on the cap. Collides (small cover).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.lathe('gloss', K.red, [[0, 0], [0.3, 0], [0.3, 0.08], [0.26, 0.12], [0.26, 1.18], [0.3, 1.22], [0.3, 1.3], [0.2, 1.42], [0, 1.46]], 0, 0, 0, { seg: 20 });
      pbox(B, NS('paint'), K.black, 0.26, 0.03, 0.02, 0, 1.02, 0.255);
      B.box(NS('paint'), K.white, 0.2, 0.26, 0.01, 0, 0.72, 0.262, { r: 0.01 });
      letters(B, 'POST', { h: 0.06, x: 0, y: 1.1, z: 0.265, c: K.white, flat: true, wt: 0.22 });
      snowCap(B, 0, 1.4, 0, 0.36, 0.36, 0.09);
      colBox(B, 0, 0, 0, 0.62, 1.45, 0.62);
    },
  };

  // ------------------------------------------------------------------------------------------ snowbank (cover)
  // shovelled snow heaped into a bank: L long, h high (cover height), d deep; lumpy, with a shovel stuck in it sometimes
  D.calamari_snowbank = {
    desc: 'A shovelled snowbank (L × h × d, lumpy), optionally with a shovel stuck in it. Collides (cover; its top is a perch).',
    params: { length: 'm', h: 'height', d: 'depth', shovel: 'bool' }, variants: 3, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 2.4, h = o.h ?? 0.95, d = o.d ?? 1.2, n = Math.max(1, Math.round(L / 1.1)), sd = (o.variant ?? 0) * 3;
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + (i + 0.5) * (L / n), k = 0.85 + 0.3 * hash(i + sd);
        drift(B, x, 0, (hash(i * 3 + sd) - 0.5) * 0.15, (L / n) * 0.72, h * k, d / 2, { seed: (i + sd) % 6, rot: hash(i) * 0.6 });
      }
      drift(B, 0, 0, 0, L / 2 + 0.2, h * 0.55, d / 2 + 0.15, { seed: (sd + 5) % 6, c: K.snowSh });
      if (o.shovel) { B.push(L * 0.2, h * 0.6, 0.1, 0.3, 0.35); B.cyl('wood', K.woodLt, 0.022, 1.1, 0, 0.5, 0, { seg: 6 }); B.box('paint', '#c7473a', 0.34, 0.4, 0.03, 0, -0.1, 0, { r: 0.02 }); B.pop(); }
      colBox(B, 0, 0, 0, L * 0.92, h, d * 0.85, PERCH);
    },
  };

  // ------------------------------------------------------------------------------------------ snowman
  D.calamari_snowman = {
    desc: 'A snowman (three balls, a bucket hat, a scarf, twig arms, a carrot nose). Collides (small cover).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      for (const [r, y] of [[0.5, 0.42], [0.36, 1.05], [0.26, 1.5]]) B.sph('paint', K.snow, r, 0, y, 0, { ws: 14, hs: 10 });
      B.lathe('paint', '#3f6fa3', [[0, 0], [0.2, 0], [0.18, 0.22], [0, 0.22]], 0, 1.68, 0.02, { seg: 12, rz: 0.2 });
      B.add(NS('paint'), cylGeo(0.02, 0.05, 0.22, 6), '#e0762f', 0, 1.52, 0.33, { rx: HP });
      for (const s of [-1, 1]) B.sph(NS('paint'), K.dark, 0.035, s * 0.09, 1.6, 0.23, { ws: 6, hs: 4 });
      B.tor('paint', K.red, 0.24, 0.06, 0, 1.3, 0, { rx: HP, ts: 16, rs: 6 });
      pbox(B, 'paint', K.red, 0.12, 0.4, 0.04, 0.12, 1.12, 0.28, { rz: 0.2 });
      for (const s of [-1, 1]) B.tube(NS('wood'), K.barkDk, [P3(s * 0.3, 1.1, 0), P3(s * 0.62, 1.32, 0.05), P3(s * 0.75, 1.45, 0.02)], 0.02, { radial: 4 });
      for (let k = 0; k < 3; k++) B.sph(NS('paint'), K.dark, 0.03, 0, 0.95 + k * 0.12, 0.36, { ws: 5, hs: 4 });
      colBox(B, 0, 0, 0, 0.9, 1.7, 0.9);
    },
  };

  // ------------------------------------------------------------------------------------------ stone lantern (tōrō)
  D.calamari_lantern = {
    desc: 'Granite garden lantern (kasuga style: base, shaft, light box glowing at dusk, a big roof with snow). Collides (small cover).',
    params: { h: 'height' }, variants: 1, mount: 'ground',
    build(B, o) {
      const s = (o.h ?? 1.7) / 1.7, st = K.granite;
      B.push(0, 0, 0, 0, 0, 0, s);
      B.cyl('paint', st, 0.34, 0.14, 0, 0.07, 0, { seg: 6 });
      B.lathe('paint', st, [[0, 0.14], [0.26, 0.14], [0.22, 0.3], [0, 0.3]], 0, 0, 0, { seg: 6 });
      B.cyl('paint', st, 0.1, 0.55, 0, 0.58, 0, { seg: 8 });
      B.cyl('paint', st, 0.26, 0.1, 0, 0.9, 0, { seg: 6 });
      B.box('paint', st, 0.32, 0.3, 0.32, 0, 1.1, 0, { r: 0.02 });
      for (const a of [0, HP]) B.box(NS('glow'), K.lit, a ? 0.34 : 0.2, 0.16, a ? 0.2 : 0.34, 0, 1.1, 0, { glow: 1.4 });
      B.lathe('paint', st, [[0, 1.25], [0.48, 1.25], [0.46, 1.3], [0.18, 1.48], [0.08, 1.52], [0, 1.52]], 0, 0, 0, { seg: 6 });
      B.sph('paint', st, 0.07, 0, 1.58, 0, { ws: 6, hs: 4 });
      B.add('paint', driftGeo(1), K.snow, 0, 1.33, 0, { sx: 0.44, sy: 0.16, sz: 0.44, ao: false });
      B.pop();
      colBox(B, 0, 0, 0, 0.6 * s, 1.55 * s, 0.6 * s);
    },
  };

  // ------------------------------------------------------------------------------------------ vending machine
  D.calamari_vending = {
    desc: 'Drinks vending machine (lit display of cans and bottles, lit at all hours), snow on its roof. Collides (cover).',
    params: { c: 'body colour' }, variants: 2, mount: 'ground',
    build(B, o) {
      const c = o.c ?? ((o.variant ?? 0) % 2 ? '#e9e6de' : '#2f6fa3');
      B.box('paint', c, 1.0, 1.85, 0.72, 0, 0.925, 0, { r: 0.04 });
      pbox(B, NS('glow'), '#f3f6ff', 0.86, 0.95, 0.01, 0, 1.3, 0.362, { glow: 1.1 });
      for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) B.cyl(NS('gloss'), ['#d24b3c', '#3b8ec9', '#e8c24a', '#4aa36b', '#f2f2f2', '#8e5a3c'][(i + r * 2) % 6], 0.045, 0.2, -0.33 + i * 0.132, 0.96 + r * 0.3, 0.33, { seg: 8 });
      for (let i = 0; i < 6; i++) B.box(NS('glow'), '#6fe0a0', 0.08, 0.035, 0.02, -0.33 + i * 0.132, 0.82, 0.37, { glow: 1.0 });
      pbox(B, NS('paint'), K.dark, 0.7, 0.16, 0.04, 0, 0.3, 0.36);
      B.box(NS('paint'), K.steel, 0.18, 0.24, 0.05, 0.36, 0.8, 0.37, { r: 0.01 });
      snowCap(B, 0, 1.85, 0, 0.96, 0.66, 0.12);
      colBox(B, 0, 0, 0, 1.0, 1.85, 0.72);
    },
  };

  // ------------------------------------------------------------------------------------------ bicycle half-buried
  D.calamari_bike = {
    desc: 'A mamachari bicycle leaning on its stand, half buried in snow (front basket full of snow). Non-colliding.',
    params: { c: 'frame colour' }, variants: 3, mount: 'ground',
    build(B, o) {
      const c = o.c ?? ['#8f2f33', '#2f5a8f', '#e3d9c4'][(o.variant ?? 0) % 3];
      for (const x of [-0.55, 0.55]) { B.tor(NS('rubber'), K.dark, 0.33, 0.025, x, 0.33, 0, { ts: 20, rs: 4 }); B.tor(NS('metal'), K.galv, 0.3, 0.01, x, 0.33, 0, { ts: 16, rs: 3 }); }
      B.tube('metal', c, [P3(-0.55, 0.33, 0), P3(-0.1, 0.3, 0), P3(0.3, 0.8, 0), P3(0.45, 0.85, 0), P3(0.55, 0.33, 0)], 0.025, { radial: 5 });
      B.tube(NS('metal'), c, [P3(-0.1, 0.3, 0), P3(-0.2, 0.75, 0), P3(-0.55, 0.33, 0)], 0.022, { radial: 5 });
      B.box('rubber', K.dark, 0.24, 0.06, 0.14, -0.2, 0.8, 0, { r: 0.02 });
      B.tube(NS('metal'), K.galv, [P3(0.45, 0.85, 0), P3(0.4, 1.0, 0), P3(0.3, 1.02, -0.25), P3(0.3, 1.02, 0.25)], 0.015, { radial: 4 });
      B.box('metal', K.galv, 0.34, 0.24, 0.3, 0.62, 0.8, 0, { r: 0.02 });
      snowCap(B, 0.62, 0.92, 0, 0.36, 0.3, 0.1);
      drift(B, 0, 0, 0, 0.9, 0.34, 0.4, { seed: 5 });
    },
  };

  // ------------------------------------------------------------------------------------------ kei truck
  D.calamari_kei = {
    desc: 'A little white kei truck parked, snow on the cab roof and in the bed (a tarp over crates), chains on the tyres. Collides (cover).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const L = 3.4, W = 1.48;
      B.box('gloss', K.white, W, 0.5, L, 0, 0.55, 0, { r: 0.06 });
      B.box('gloss', K.white, W, 1.0, 1.2, 0, 1.3, L / 2 - 0.6, { r: 0.1 });
      pbox(B, NS('gloss'), K.glass, W - 0.1, 0.5, 0.02, 0, 1.45, L / 2 - 0.02, { rx: -0.1 });
      for (const s of [-1, 1]) pbox(B, NS('gloss'), K.glass, 0.02, 0.4, 0.8, s * W / 2, 1.45, L / 2 - 0.6);
      for (const s of [-1, 1]) { B.cyl(NS('glow'), '#fff4d6', 0.08, 0.04, s * 0.55, 0.72, L / 2 + 0.01, { rx: HP, seg: 10, glow: 0.8 }); B.box(NS('gloss'), '#c9453b', 0.18, 0.1, 0.04, s * 0.55, 0.7, -L / 2, { r: 0.01 }); }
      for (const s of [-1, 1]) pbox(B, 'metal', K.galv, 0.05, 0.3, 2.2, s * (W / 2 - 0.02), 0.95, -0.55);
      pbox(B, 'metal', K.galv, W, 0.3, 0.05, 0, 0.95, -L / 2 + 0.02);
      B.box('paint', '#3f6f8a', W - 0.2, 0.4, 1.4, 0, 1.0, -0.7, { r: 0.12 });
      snowCap(B, 0, 1.8, L / 2 - 0.6, W - 0.1, 1.1, 0.16);
      snowCap(B, 0, 1.2, -0.7, W - 0.3, 1.3, 0.14);
      for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { B.cyl('rubber', K.dark, 0.27, 0.2, x * (W / 2 - 0.05), 0.27, z * (L / 2 - 0.55), { rz: HP, seg: 12 }); B.cyl(NS('metal'), K.galv, 0.15, 0.21, x * (W / 2 - 0.05), 0.27, z * (L / 2 - 0.55), { rz: HP, seg: 8 }); }
      drift(B, W / 2 + 0.1, 0, 0, 0.35, 0.3, 1.6, { seed: 1 });
      colBox(B, 0, 0, 0, W, 1.3, L);
      colBox(B, 0, 1.3, L / 2 - 0.6, W, 0.6, 1.2, ROOF);
    },
  };

  // ------------------------------------------------------------------------------------------ bus shelter
  D.calamari_busstop = {
    desc: 'Rural bus shelter: timber back wall (solid, cover), side panels, a tin roof with snow, a bench, the bus stop sign + timetable. Wall collides.',
    params: { w: 'width' }, variants: 1, mount: 'ground',
    build(B, o) {
      const w = o.w ?? 2.8, d = 1.3, h = 2.3;
      KIT.boards(B, 0, w, 0.05, h - 0.1, K.cedarGrey, { pitch: 0.4 });
      pbox(B, 'wood', K.cedarGrey, w, h, 0.06, 0, h / 2, 0.0);
      for (const s of [-1, 1]) { pbox(B, 'wood', K.cedarGrey, 0.06, h * 0.85, d, s * (w / 2 - 0.03), h * 0.425, d / 2); B.box('wood', K.beam, 0.1, h, 0.1, s * (w / 2 - 0.05), h / 2, d - 0.05, { r: 0.01 }); }
      B.push(0, h + 0.05, 0, 0, 0.12);
      pbox(B, 'metal', '#8b3f35', w + 0.4, 0.05, d + 0.5, 0, 0, d / 2);
      snowCap(B, 0, 0.03, d / 2, w + 0.2, d + 0.3, 0.2);
      B.pop();
      icicles(B, -w / 2, w / 2, h - 0.1, d + 0.2, 13, 0.25);
      sub(B, 'calamari_bench', 0, 0, 0.35, 0, { length: w - 0.5, col: false });   // (no collider: a bench in a shelter is a pocket bots wander into)
      // the stop sign: a round plate on a pole + timetable
      B.cyl('metal', K.galv, 0.03, 2.3, w / 2 + 0.5, 1.15, d, { seg: 6 });
      B.cyl('paint', '#e8e4d8', 0.25, 0.04, w / 2 + 0.5, 2.1, d, { rx: HP, seg: 18 });
      B.cyl(NS('paint'), '#3b7a4a', 0.21, 0.045, w / 2 + 0.5, 2.1, d, { rx: HP, seg: 18 });
      letters(B, 'BUS', { h: 0.1, x: w / 2 + 0.5, y: 2.04, z: d + 0.03, c: K.white, flat: true, wt: 0.22 });
      B.box('paint', K.white, 0.3, 0.42, 0.03, w / 2 + 0.5, 1.4, d + 0.02, { r: 0.01 });
      snowCap(B, w / 2 + 0.5, 2.36, d, 0.1, 0.1, 0.04);
      colBox(B, 0, 0, 0.03, w, h, 0.14, ROOF);
      for (const s of [-1, 1]) colBox(B, s * (w / 2 - 0.03), 0, d / 2, 0.08, h * 0.85, d, ROOF);
      colBox(B, 0, h - 0.1, d / 2, w + 0.4, 0.4, d + 0.5, ROOF);
    },
  };
  const sub = KIT.sub;

  // ------------------------------------------------------------------------------------------ trees
  // snow-laden pine (tiers of dark needles each capped with snow) or a bare deciduous tree (persimmon) with a few
  // fruit left and snow along the branches; `planter`: a round stone planter (cover) round the trunk
  D.calamari_tree = {
    desc: 'Snowy tree: kind pine (tiered, snow on every tier) or bare (branches with snow lines, a few persimmons); optional stone planter (collider). Trunk collides.',
    params: { kind: "'pine' | 'bare'", h: 'height', planter: 'radius' }, variants: 3, mount: 'ground',
    build(B, o) {
      const h = o.h ?? 5, sd = (o.variant ?? 0) * 7 + 1, y0 = o.planter ? 0.7 : 0;
      if (o.planter) {
        const r = o.planter;
        B.lathe('paint', K.stone, [[0, 0], [r, 0], [r, 0.7], [r - 0.2, 0.7], [r - 0.2, 0.62], [0, 0.62]], 0, 0, 0, { seg: 14 });
        B.cyl(NS('paint'), K.snow, r - 0.2, 0.08, 0, 0.66, 0, { seg: 14 });
        B.add('paint', driftGeo(2), K.snow, 0, 0.7, 0, { sx: r * 0.95, sy: 0.12, sz: r * 0.95, ao: false });
        colBox(B, 0, 0, 0, r * 1.7, 0.7, r * 1.7, PERCH);
      }
      if (o.kind === 'bare') {
        B.add('wood', cylGeo(0.09, 0.16, h * 0.5, 7), K.bark, 0, y0 + h * 0.25, 0, {});
        const br = (x, y, z, dx, dy, dz, L, r, depth) => {
          const ex = x + dx * L, ey = y + dy * L, ez = z + dz * L;
          B.tube(depth > 0 ? 'wood' : NS('wood'), K.bark, [P3(x, y, z), P3((x + ex) / 2 + dz * 0.1, (y + ey) / 2, (z + ez) / 2 - dx * 0.1), P3(ex, ey, ez)], r, { radial: 4 });
          if (r > 0.02) B.tube(NS('paint'), K.snow, [P3(x, y + r * 0.9, z), P3(ex, ey + r * 0.9, ez)], r * 0.55, { radial: 3 });
          if (depth <= 0) { if (hash(ex * 7 + ez) > 0.6) B.sph(NS('gloss'), '#e07b2d', 0.06, ex, ey - 0.08, ez, { ws: 6, hs: 4 }); return; }
          for (let k = 0; k < 3; k++) { const a = hash(sd + depth * 11 + k * 3.3 + x) * TAU; br(ex, ey, ez, Math.cos(a) * 0.7, 0.55 + 0.3 * hash(k + depth), Math.sin(a) * 0.7, L * 0.62, r * 0.6, depth - 1); }
        };
        for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + sd; br(0, y0 + h * 0.45, 0, Math.cos(a) * 0.6, 0.75, Math.sin(a) * 0.6, h * 0.26, 0.07, 2); }
        colBox(B, 0, y0, 0, 0.3, h * 0.5, 0.3);
      } else {
        B.add('wood', cylGeo(0.1, 0.18, h * 0.35, 7), K.barkDk, 0, y0 + h * 0.17, 0, {});
        const tiers = 5;
        for (let t = 0; t < tiers; t++) {
          const f = t / (tiers - 1), r = (1 - f) * h * 0.26 + 0.3, y = y0 + h * 0.2 + f * h * 0.68, th = h * 0.22;
          B.add('foliage', cylGeo(0.05, r, th, 9), mixc(K.pineDk, K.pine, hash(t + sd)), 0, y + th / 2, 0, { ry: hash(t) * 2 });
          B.add('paint', cylGeo(0.02, r * 0.92, th * 0.45, 9), K.snow, 0, y + th * 0.72, 0, { ry: hash(t + 3) * 2 + 0.2, ao: false });
        }
        B.add('paint', cylGeo(0.0, 0.18, 0.4, 7), K.snow, 0, y0 + h * 0.98, 0, {});
        colBox(B, 0, y0, 0, 0.36, h * 0.4, 0.36);
      }
    },
  };

  // ------------------------------------------------------------------------------------------ street lamp
  D.calamari_lamppost = {
    desc: 'Village street lamp: a timber pole with an arm and an enamel shade (lit at dusk), a snow cap, a little shrine-free lantern sign. Pole collides.',
    params: { h: 'height', arm: 'arm length' }, variants: 1, mount: 'ground',
    build(B, o) {
      const h = o.h ?? 4.2, arm = o.arm ?? 0.9;
      B.cyl('wood', K.beam, 0.08, h, 0, h / 2, 0, { seg: 8 });
      for (let k = 0; k < 3; k++) pbox(B, NS('metal'), K.iron, 0.18, 0.04, 0.18, 0, 0.6 + k * 0.08, 0);
      B.box('metal', K.iron, 0.06, 0.06, arm, 0, h - 0.2, arm / 2, { r: 0.01 });
      B.tube(NS('metal'), K.iron, [P3(0, h - 0.7, 0.05), P3(0, h - 0.3, arm * 0.6)], 0.02, { radial: 4 });
      B.lathe('paint', '#35554c', [[0.02, 0.12], [0.1, 0.1], [0.28, -0.04], [0.3, -0.07], [0, -0.07]], 0, h - 0.32, arm, { seg: 14 });
      B.sph(NS('glow'), K.lit, 0.09, 0, h - 0.42, arm, { ws: 8, hs: 6, glow: 2.2 });
      snowCap(B, 0, h - 0.2, arm, 0.46, 0.46, 0.08);
      snowCap(B, 0, h, 0, 0.18, 0.18, 0.06);
      colBox(B, 0, 0, 0, 0.2, h, 0.2);
    },
  };

  // ------------------------------------------------------------------------------------------ fire lookout tower
  // the hanshō fire watchtower every rural village has: a steel lattice tower with a ladder, a little roofed cabin
  // on top holding the alarm bell, a red lamp (visible from everywhere; out of play, non-colliding)
  D.calamari_firetower = {
    desc: 'Fire lookout tower (hanshō yagura): a steel lattice tower (~13 m) with a ladder, a roofed top with the alarm bell, a red lamp, snow on the roof. Landmark scenery (non-colliding).',
    params: { h: 'height' }, variants: 1, mount: 'ground',
    build(B, o) {
      const h = o.h ?? 13, b0 = 1.6, b1 = 0.55, c = '#8e3a32';
      const leg = (sx, sz) => { B.tube('metal', c, [P3(sx * b0, 0, sz * b0), P3(sx * b1, h, sz * b1)], 0.06, { radial: 5 }); };
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(sx, sz);
      const nb = 7;
      for (let k = 0; k < nb; k++) {
        const y0 = (k / nb) * h, y1 = ((k + 1) / nb) * h, w0 = b0 + (b1 - b0) * (k / nb), w1 = b0 + (b1 - b0) * ((k + 1) / nb);
        for (const [ax, az] of [[1, 0], [0, 1]]) for (const s of [-1, 1]) {
          const p = (w, y, t) => ax ? P3(t * w, y, s * w) : P3(s * w, y, t * w);
          B.tube(NS('metal'), c, [p(w0, y0, -1), p(w1, y1, 1)], 0.025, { radial: 3 });
          B.tube(NS('metal'), c, [p(w0, y0, 1), p(w1, y1, -1)], 0.025, { radial: 3 });
          B.tube(NS('metal'), c, [p(w1, y1, -1), p(w1, y1, 1)], 0.03, { radial: 3 });
        }
      }
      for (let y = 0.4; y < h; y += 0.35) pbox(B, NS('metal'), K.iron, 0.4, 0.025, 0.025, 0, y, b0 + (b1 - b0) * (y / h) + 0.12);
      // the top: a platform, a railing, the bell under a little pyramid roof, a red lamp, snow
      B.box('metal', c, 1.8, 0.1, 1.8, 0, h, 0, { r: 0.02 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.cyl(NS('metal'), c, 0.03, 2.0, sx * 0.85, h + 1.0, sz * 0.85, { seg: 5 });
      B.tor(NS('metal'), c, 1.2, 0.02, 0, h + 0.8, 0, { rx: HP, ts: 4, rs: 3, ry: PI / 4 });
      B.lathe('metal', '#b08a3a', [[0, 0.5], [0.12, 0.48], [0.22, 0.2], [0.3, 0], [0, 0]], 0, h + 1.1, 0, { seg: 12 });
      B.lathe('paint', c, [[0, 0.45], [1.35, 0], [1.35, -0.06], [0, -0.06]], 0, h + 2.0, 0, { seg: 4, ry: PI / 4 });
      B.add('paint', driftGeo(3), K.snow, 0, h + 2.02, 0, { sx: 1.1, sy: 0.32, sz: 1.1, ao: false });
      B.blink('#ff4a3a', 0, h + 2.55, 0, { size: 0.12, rate: 0.5, hi: 5 });
      snowCap(B, 0, h + 0.05, 0, 1.7, 1.7, 0.12);
    },
  };

  // ------------------------------------------------------------------------------------------ fences + walls
  // timber picket / bamboo fence along local +X (length L): a rail collider (see-through), snow on the top rail
  D.calamari_fence = {
    desc: 'Low timber fence along local +X (length L, height h): posts, rails, pickets; snow on the top rail. Rail collider (shots, ink, squids pass).',
    params: { length: 'm', h: 'height', style: "'picket' | 'rail'" }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 4, h = o.h ?? 1.0, n = Math.max(1, Math.round(L / 1.8));
      for (let i = 0; i <= n; i++) B.box('wood', K.woodDk, 0.1, h + 0.08, 0.1, (i * L) / n, (h + 0.08) / 2, 0, { r: 0.01 });
      for (const y of [h * 0.35, h * 0.85]) pbox(B, 'wood', K.woodDk, L, 0.07, 0.05, L / 2, y, 0.05);
      if (o.style !== 'rail') for (let x = 0.12; x < L; x += 0.16) pbox(B, NS('wood'), shade(K.woodDk, 1.1), 0.08, h - 0.1, 0.02, x, (h - 0.1) / 2 + 0.05, 0.085);
      snowCap(B, L / 2, h * 0.85 + 0.035, 0.05, L, 0.08, 0.05);
      B.col(0, 0, -0.08, L, h + 0.1, 0.12, RAIL);
    },
  };
  // a low stone garden wall / parapet along local +X (solid cover), snow along its top
  D.calamari_stonewall = {
    desc: 'Low dry-stone wall along local +X (length L, height h, thickness t): stones, snow along the top. Collides (cover; its top is a perch).',
    params: { length: 'm', h: 'height', t: 'thickness' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 3, h = o.h ?? 0.9, t = o.t ?? 0.5;
      for (let r = 0, y = 0; y < h - 0.05; r++, y += 0.22) {
        let x = r % 2 ? 0.25 : 0;
        while (x < L - 0.02) { const l = Math.min(L - x, 0.4 + hash(r * 9 + x) * 0.4); B.box(r % 2 ? NS('paint') : 'paint', mixc(K.granite, K.stoneDk, hash(x * 5 + r)), l - 0.03, 0.21, t, x + l / 2, y + 0.11, 0, { r: 0.05 }); x += l; }
      }
      B.add('paint', pillowGeo(t + 0.06, 0.14), K.snow, L / 2, h - 0.02, 0, { sx: L, ao: false });
      colBox(B, L / 2, 0, 0, L, h, t, PERCH);
    },
  };
  // ------------------------------------------------------------------------------------------ the Cuttlefish cottage
  // Cap'n Cuttlefish's old family cottage: a weathered nameplate by the door, a ship's anchor leaning on the wall, a
  // battered sea chest with rope handles, a life ring from an old boat. Chest collides (low).
  D.calamari_cuttlefish = {
    desc: "The Cuttlefish cottage's one-offs (face frame, +z out of the wall): CUTTLEFISH nameplate, a leaning anchor, a battered sea chest, an old life ring. Chest collides.",
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('wood', '#8a6a4a', 0.2, 0.62, 0.03, 0, 1.55, 0.02, { r: 0.01 });
      B.push(0.035, 1.55, 0.04, 0, 0, -HP);
      letters(B, 'CUTTLEFISH', { h: 0.055, x: 0, y: -0.03, z: 0.0, c: '#2b2420', flat: true, wt: 0.22, track: 0.1 });
      B.pop();
      // the anchor (stock anchor), leaning
      B.push(1.0, 0, 0.35, 0, -0.25, 0);
      B.cyl('metal', K.iron, 0.05, 1.5, 0, 0.75, 0, { seg: 8 });
      B.tor('metal', K.iron, 0.11, 0.03, 0, 1.58, 0, { ts: 12, rs: 5 });
      B.cyl('metal', K.iron, 0.04, 0.9, 0, 1.3, 0, { rz: HP, seg: 6 });
      B.tube('metal', K.iron, [P3(-0.5, 0.35, 0), P3(-0.4, 0.08, 0), P3(0, 0.0, 0), P3(0.4, 0.08, 0), P3(0.5, 0.35, 0)], 0.05, { radial: 6 });
      for (const s of [-1, 1]) B.add('metal', cylGeo(0.0, 0.1, 0.2, 4), K.iron, s * 0.52, 0.42, 0, { rz: s * 0.4 });
      snowCap(B, 0, 1.33, 0, 0.9, 0.08, 0.04);
      B.pop();
      // the sea chest
      B.box('wood', '#5d4332', 1.0, 0.5, 0.55, -1.0, 0.25, 0.4, { r: 0.03 });
      B.lathe('wood', '#5d4332', [[0, 0], [0.275, 0], [0.275, 0.02], [0, 0.18]].map(([a, b]) => [a, b]), -1.0, 0.5, 0.4, { seg: 4 });
      for (const s of [-1, 1]) { pbox(B, NS('metal'), K.rust, 0.04, 0.5, 0.57, -1.0 + s * 0.4, 0.25, 0.4); B.tor(NS('paint'), K.rope, 0.08, 0.015, -1.0 + s * 0.51, 0.35, 0.4, { ry: HP, ts: 10, rs: 3 }); }
      snowCap(B, -1.0, 0.6, 0.4, 0.9, 0.45, 0.07);
      colBox(B, -1.0, 0, 0.4, 1.0, 0.6, 0.55);
      // an old life ring on the wall
      B.tor('paint', '#e8e2d2', 0.26, 0.07, 0.5, 1.7, 0.08, { ts: 18, rs: 8 });
      for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; B.box(NS('paint'), '#b8413a', 0.1, 0.15, 0.16, 0.5 + Math.cos(a) * 0.26, 1.7 + Math.sin(a) * 0.26, 0.08, { rz: a }); }
    },
  };

  // dressing for a dry-stone retaining wall face (the hill walls): big irregular stones in battered courses, snow
  // piled on the top, icicles; along local +X (length L) from y0 to y1, the face toward local +Z. Non-colliding.
  D.calamari_ishigaki = {
    desc: 'Dry-stone retaining wall face dressing along local +X (length L, from y0 to y1, facing local +Z): irregular granite stones, snow on top, icicles. Non-colliding (the level block collides).',
    params: { length: 'm', y0: 'bottom', y1: 'top' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 5, y0 = o.y0 ?? 0, y1 = o.y1 ?? 3;
      for (let r = 0, y = y0; o.stones !== false && y < y1 - 0.1; r++, y += 0.42) {
        let x = r % 2 ? 0.35 : 0;
        while (x < L - 0.05) {
          const l = Math.min(L - x, 0.55 + hash(r * 13 + x * 3) * 0.6), hh = Math.min(0.4, y1 - y - 0.02);
          B.box((r + Math.round(x)) % 3 ? NS('paint') : 'paint', mixc(K.granite, K.stoneDk, hash(x * 7 + r)), l - 0.05, hh, 0.12, x + l / 2, y + hh / 2, 0.05 + hash(x + r) * 0.03, { r: 0.07 });
          x += l;
        }
      }
      B.add('paint', pillowGeo(0.9, 0.3), K.snow, L / 2, y1 - 0.08, -0.25, { sx: L + 0.1, ao: false });
      icicles(B, 0.2, L - 0.2, y1 - 0.06, 0.12, Math.round(L * 7 + y1), 0.3);
    },
  };

  // ------------------------------------------------------------------------------------------ station clutter
  D.calamari_firebuckets = {
    desc: 'Red fire buckets on a timber stand with a FIRE board, snow on the lid. Collides (low).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('wood', K.woodDk, 1.0, 0.7, 0.35, 0, 0.35, 0, { r: 0.02 });
      for (let i = 0; i < 3; i++) B.lathe('gloss', K.red, [[0, 0], [0.12, 0], [0.15, 0.24], [0.14, 0.24], [0, 0.24]], -0.3 + i * 0.3, 0.72, 0, { seg: 12 });
      B.box('paint', K.red, 1.0, 0.24, 0.04, 0, 1.2, -0.16, { r: 0.01 });
      letters(B, 'FIRE', { h: 0.12, x: 0, y: 1.14, z: -0.13, c: K.white, flat: true, wt: 0.22 });
      snowCap(B, 0, 0.96, 0, 0.9, 0.3, 0.06);
      colBox(B, 0, 0, 0, 1.0, 0.95, 0.4);
    },
  };
  D.calamari_cart = {
    desc: 'A station luggage / parcel cart (timber bed on iron wheels) with parcels and a mailbag under snow. Collides (low cover).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('wood', K.woodLt, 2.0, 0.12, 1.0, 0, 0.62, 0, { r: 0.02 });
      for (const [x, z] of [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]]) B.cyl('metal', K.iron, 0.25, 0.08, x, 0.28, z, { rx: HP, seg: 12 });
      B.tube(NS('metal'), K.iron, [P3(1.0, 0.68, -0.3), P3(1.5, 0.95, -0.3), P3(1.5, 0.95, 0.3), P3(1.0, 0.68, 0.3)], 0.025, { radial: 4 });
      for (const [x, z, w, h, c] of [[-0.5, -0.1, 0.6, 0.4, '#c8a877'], [0.2, 0.15, 0.5, 0.35, '#b9955f'], [0.1, -0.25, 0.4, 0.3, '#d6c29a']]) B.box('paint', c, w, h, 0.5, x, 0.68 + h / 2, z, { r: 0.02 });
      B.add('paint', driftGeo(4), '#4e5f6e', 0.65, 0.68, 0.1, { sx: 0.35, sy: 0.4, sz: 0.3 });
      snowCap(B, -0.2, 1.08, 0, 1.4, 0.9, 0.1);
      colBox(B, 0, 0, 0, 2.0, 1.1, 1.0);
    },
  };
  D.calamari_payphone = {
    desc: 'A green payphone on a little timber stand under a tin hood. Collides (small).',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('wood', K.woodDk, 0.6, 1.0, 0.45, 0, 0.5, 0, { r: 0.02 });
      B.box('gloss', '#3f8a5a', 0.36, 0.5, 0.26, 0, 1.25, 0, { r: 0.05 });
      B.box(NS('paint'), K.dark, 0.1, 0.24, 0.08, -0.12, 1.25, 0.14, { r: 0.03 });
      pbox(B, NS('glow'), '#d8f5e0', 0.18, 0.06, 0.01, 0.06, 1.38, 0.132, { glow: 0.8 });
      B.box('metal', '#8b3f35', 0.7, 0.05, 0.55, 0, 1.62, 0.05, { r: 0.01, rx: 0.1 });
      snowCap(B, 0, 1.65, 0.05, 0.66, 0.5, 0.08);
      colBox(B, 0, 0, 0, 0.6, 1.5, 0.45);
    },
  };
  D.calamari_noticeboard = {
    desc: 'Village notice board (a roofed timber board with pinned notices) on two posts, snow on its little roof. Posts collide.',
    params: {}, variants: 1, mount: 'ground',
    build(B, o) {
      const w = 1.6;
      for (const s of [-1, 1]) { B.box('wood', K.beam, 0.1, 2.1, 0.1, s * (w / 2 - 0.05), 1.05, 0, { r: 0.01 }); colBox(B, s * (w / 2 - 0.05), 0, 0, 0.14, 1.6, 0.14); }
      B.box('wood', K.woodDk, w, 0.9, 0.06, 0, 1.45, 0.02, { r: 0.01 });
      for (let i = 0; i < 6; i++) B.box(NS('paint'), ['#f0ead8', '#e8d9b0', '#f3f1ec', '#d9e4ea'][i % 4], 0.34, 0.4, 0.01, -0.55 + (i % 3) * 0.55, 1.25 + Math.floor(i / 3) * 0.44, 0.058, { r: 0.004, rz: (hash(i) - 0.5) * 0.12 });
      B.push(0, 2.1, 0.02, 0, 0.3); pbox(B, 'paint', K.kawara, w + 0.3, 0.05, 0.6, 0, 0, 0.1); snowCap(B, 0, 0.03, 0.1, w + 0.1, 0.5, 0.12); B.pop();
    },
  };
}
