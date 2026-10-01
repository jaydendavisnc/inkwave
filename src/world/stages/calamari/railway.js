// Calamari County — the railway (owner: the calamari stage): track, the county's railcars + two-car trains (stage
// movers' looks), name boards, platform edges, the open station overpasses, the level crossings, the tunnel portals,
// signals.
export function registerRailway(D, H, KIT) {
  const { K, NS, pbox, cylGeo, colBox, colRun, ROOF, RAIL, onFace, snowCap, drift, icicles, roof, letters, sign, textW, hash, shade, mixc, extr, pillowGeo, sub, HP, PI, P3, TAU } = KIT;

  // ------------------------------------------------------------------------------------------ track
  // one track along local +X from pos (length L): 1067 mm gauge rails on timber sleepers in snowy ballast; skip = [[x0,
  // x1], …] local ranges with no sleepers (level-crossing panels cover them). Visual only (no colliders: feet pass).
  D.calamari_track = {
    desc: 'One railway track along local +X (length L): rails on timber sleepers, snow between them; skip ranges without sleepers. Non-colliding.',
    params: { length: 'm', skip: '[[x0, x1], …]' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 20, g = 0.535, skip = o.skip ?? [], inSkip = (x) => skip.some(([a, b]) => x > a - 0.2 && x < b + 0.2);
      for (const sz of [-1, 1]) {
        pbox(B, 'metal', K.rail, L, 0.11, 0.06, L / 2, 0.105, sz * g);
        pbox(B, NS('metal'), K.railTop, L, 0.02, 0.07, L / 2, 0.165, sz * g);
        pbox(B, NS('metal'), shade(K.rail, 0.8), L, 0.03, 0.14, L / 2, 0.065, sz * g);
      }
      for (let x = 0.3; x < L; x += 0.62) {
        if (inSkip(x)) continue;
        const j = (hash(x * 3.1) - 0.5) * 0.04;
        pbox(B, 'wood', mixc(K.sleeper, '#3f352d', hash(x)), 0.2, 0.1, 2.0, x + j, 0.0, 0);
        // snow drifted between the sleepers (fresh, lumpy) and on the sleeper ends
        if (hash(x * 7.7) > 0.25) B.add('paint', pillowGeo(0.96, 0.075), K.snow, x + 0.31, 0.0, 0, { sx: 0.32 + 0.12 * hash(x), ao: false });
      }
      // ballast shoulders banked with snow along both sides
      for (const sz of [-1, 1]) {
        for (let x = 0; x < L; x += 3.0) {
          if (inSkip(x + 1.5)) continue;
          B.add('paint', pillowGeo(0.7, 0.08), mixc(K.snow, K.snowSh, hash(x + sz)), x + 1.5, 0.0, sz * 1.25, { sx: 3.02, ao: false });
        }
      }
    },
  };

  // ------------------------------------------------------------------------------------------ the railcar
  // Dresses the level blocks of a county railcar (pos = centre at the trackbed, L along local X, W, floor, h): livery
  // bands, the window band (lit at dusk), doors with steps, cab ends (windscreen, destination board, head / tail lights,
  // snow plough), bogies + underframe kit, the curved roof with snow, exhaust stack, icicles. Colliders: the level's.
  D.calamari_railcar = {
    desc: 'County railcar dressing over its level blocks (pos = centre on the trackbed; L, W, floor, h, number, dest): cream body with a red band, lit window band, doors, cab ends with destination board + lights, bogies, curved snowy roof. Non-colliding (the level blocks collide).',
    params: { L: 'length', W: 'body width', floor: 'body floor y', h: 'body top y', number: 'car number', dest: 'destination' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.L ?? 13.4, W = o.W ?? 2.9, fy = o.floor ?? 1.05, h = o.h ?? 3.4, hw = W / 2 + 0.012;
      // ---- the body shell + underframe (solid: the car's own walls — as a stage mover its level block is only a
      // collider, never drawn; the livery, windows and doors below dress this shell)
      if (o.body !== false) {
        B.box('paint', K.livCream, L, h - fy, W, 0, fy + (h - fy) / 2, 0, { r: 0.05 });
        B.box('metal', '#2c3850', L - 1.6, fy - 0.28, W - 0.5, 0, 0.28 + (fy - 0.28) / 2, 0, { r: 0.03 });
      }
      // ---- sides
      for (const s of [-1, 1]) {
        B.push(0, 0, s * hw, s > 0 ? 0 : PI);
        // skirt + livery: navy skirt, red band under the windows, a thin red line above them, the cream above
        pbox(B, 'paint', K.livNavy, L - 0.2, 0.26, 0.02, 0, fy + 0.13, 0.0);
        pbox(B, 'paint', K.livRed, L - 0.1, 0.34, 0.02, 0, fy + 0.62, 0.0);
        pbox(B, NS('paint'), K.livRed, L - 0.1, 0.06, 0.02, 0, h - 0.34, 0.0);
        // windows: a run of fixed windows between the doors
        const x0 = -L / 2 + 2.1, x1 = L / 2 - 2.1, nw = Math.max(3, Math.round((x1 - x0) / 1.25));
        for (let i = 0; i < nw; i++) {
          const x = x0 + (i + 0.5) * ((x1 - x0) / nw), w = (x1 - x0) / nw - 0.22;
          pbox(B, NS('paint'), K.dark, w + 0.08, 0.86, 0.02, x, fy + 1.33, 0.005);
          pbox(B, NS('gloss'), K.glass, w, 0.78, 0.02, x, fy + 1.33, 0.012);
          pbox(B, NS('glow'), '#f4ecd8', w - 0.04, 0.3, 0.004, x, fy + 1.58, 0.024, { glow: 0.9 });
          pbox(B, NS('metal'), K.galv, w + 0.1, 0.03, 0.03, x, fy + 0.92, 0.02);
        }
        // doors near both ends (folding doors with a window and a step)
        for (const dx of [-1, 1]) {
          const x = dx * (L / 2 - 1.25);
          pbox(B, 'paint', shade(K.livCream, 0.92), 0.98, 1.95, 0.03, x, fy + 0.975, 0.012);
          for (const sx of [-1, 1]) pbox(B, NS('paint'), K.livNavy, 0.02, 1.9, 0.035, x + sx * 0.49, fy + 0.975, 0.02);
          pbox(B, NS('paint'), K.livNavy, 0.02, 1.9, 0.035, x, fy + 0.975, 0.02);
          for (const sx of [-1, 1]) { pbox(B, NS('gloss'), K.glass, 0.32, 0.62, 0.02, x + sx * 0.24, fy + 1.45, 0.03); }
          pbox(B, 'metal', K.steel, 1.0, 0.06, 0.28, x, fy - 0.28, 0.12);
          snowCap(B, x, fy - 0.25, 0.12, 0.9, 0.2, 0.04);
        }
        // the county roundel + the car number
        B.cyl(NS('paint'), K.livCream, 0.26, 0.02, 0, fy + 0.62, 0.02, { rx: HP, seg: 18 });
        B.cyl(NS('paint'), K.livNavy, 0.2, 0.02, 0, fy + 0.62, 0.03, { rx: HP, seg: 18 });
        letters(B, 'CC', { h: 0.16, x: 0, y: fy + 0.54, z: 0.042, c: K.livCream, flat: true, wt: 0.24 });
        letters(B, o.number ?? 'KIHA 101', { h: 0.1, x: -L / 2 + 2.8, y: fy + 0.08, z: 0.02, c: K.livCream, flat: true, wt: 0.2 });
        letters(B, 'CALAMARI COUNTY RAILWAY', { h: 0.11, x: L / 2 - 4.2, y: fy + 0.56, z: 0.02, c: K.livCream, flat: true, wt: 0.2 });
        // gutter + icicles along the roof edge
        pbox(B, NS('metal'), K.galv, L, 0.05, 0.06, 0, h - 0.02, 0.03);
        icicles(B, -L / 2 + 0.4, L / 2 - 0.4, h - 0.06, 0.05, 31 + s * 7, 0.1);
        B.pop();
      }
      // ---- the roof: a curved cap over the body top (its centre raised 0.3) with snow
      B.add('paint', extr('rcroof' + W, (() => { const p = []; for (let i = 0; i <= 10; i++) { const a = PI * (i / 10); p.push([Math.cos(a) * (W / 2 + 0.02), Math.sin(a) * 0.32]); } p.push([-(W / 2 + 0.02), -0.02], [W / 2 + 0.02, -0.02]); return p.reverse(); })(), 1, 0.02), shade(K.livCream, 0.95), 0, h - 0.02, 0, { sx: L });
      B.add('paint', pillowGeo(W - 0.5, 0.22), K.snow, 0, h + 0.18, 0, { sx: L - 0.5, ao: false });
      // exhaust stack + roof vents poking through the snow (all under h + 0.42: it runs under the station overpass)
      B.box('metal', K.ironLt, 0.3, 0.34, 0.3, L / 2 - 3.2, h + 0.25, 0.5, { r: 0.04 });
      for (const vx of [-3, -0.5, 2]) B.box('paint', K.galv, 0.8, 0.16, 0.6, vx, h + 0.3, -0.2, { r: 0.05 });
      // ---- cab ends
      for (const e of [-1, 1]) {
        B.push(e * (L / 2 + 0.012), 0, 0, e > 0 ? HP : -HP);
        pbox(B, 'paint', K.livNavy, W - 0.1, 0.3, 0.02, 0, fy + 0.15, 0);
        pbox(B, 'paint', K.livRed, W, 0.34, 0.02, 0, fy + 0.62, 0);
        for (const sx of [-1, 1]) {
          pbox(B, NS('paint'), K.dark, 1.05, 0.95, 0.02, sx * 0.62, fy + 1.45, 0.005);
          pbox(B, NS('gloss'), K.glassLt, 0.98, 0.88, 0.02, sx * 0.62, fy + 1.45, 0.012);
          B.box(NS('metal'), K.black, 0.03, 0.6, 0.02, sx * 0.62 + 0.2, fy + 1.3, 0.03, { rz: 0.5 });
          // head (white) + tail (red) lights: glow
          B.cyl(NS('glow'), '#fff4d6', 0.1, 0.05, sx * 0.95, fy + 0.62, 0.035, { rx: HP, seg: 12, glow: 1.6 });
          B.cyl(NS('glow'), '#ff5a45', 0.06, 0.05, sx * 0.72, fy + 0.62, 0.035, { rx: HP, seg: 10, glow: 0.9 });
        }
        // destination board over the windscreen (lit)
        pbox(B, NS('paint'), K.dark, 1.3, 0.26, 0.02, 0, h - 0.26, 0.01);
        letters(B, o.dest ?? 'INKOPOLIS', { h: 0.13, x: 0, y: h - 0.325, z: 0.025, c: '#ffe7b8', flat: true, wt: 0.2, mat: 'glow', glow: 1.3 });
        // coupler + snow plough (pilot) with snow on it
        B.box('metal', K.iron, 0.3, 0.2, 0.5, 0, 0.62, 0.25, { r: 0.04 });
        B.add('metal', extr('pilot', [[0, 0], [0.45, 0], [0.45, 0.35], [0, 0.55]]), K.iron, 0, 0.12, 0.0, { sx: W - 0.5 });
        snowCap(B, 0, 0.5, 0.25, W - 0.6, 0.35, 0.12);
        letters(B, o.number ?? 'KIHA 101', { h: 0.09, x: 0, y: fy + 0.18, z: 0.025, c: K.livCream, flat: true, wt: 0.2 });
        B.pop();
      }
      // ---- bogies + underframe kit (on the underframe block's sides, visible under the body)
      for (const bx of [-1, 1]) {
        const x = bx * (L / 2 - 2.3);
        for (const s of [-1, 1]) {
          pbox(B, 'metal', K.iron, 2.3, 0.34, 0.12, x, 0.62, s * (W / 2 - 0.3 + 0.07));
          for (const wx of [-0.8, 0.8]) B.cyl('metal', K.ironLt, 0.43, 0.1, x + wx, 0.43, s * (W / 2 - 0.36), { rx: HP, seg: 16 });
          B.box(NS('metal'), K.rust, 0.5, 0.26, 0.1, x, 0.35, s * (W / 2 - 0.2), { r: 0.03 });
        }
      }
      for (const s of [-1, 1]) {
        B.box(NS('metal'), K.iron, 2.2, 0.55, 0.12, 0, 0.62, s * (W / 2 - 0.2), { r: 0.04 });   // fuel tank / equipment boxes
        B.box(NS('metal'), K.ironLt, 1.1, 0.45, 0.12, 2.1, 0.66, s * (W / 2 - 0.2), { r: 0.04 });
      }
    },
  };

  // ------------------------------------------------------------------------------------------ the train
  // A two-car county train (pos = its centre on the trackbed, along local X): two railcars (their own shells: a stage
  // mover's block is never drawn) coupled with a rubber gangway between them. cars: [{ number, dest }, …]; L = one car's
  // length, gap = the coupling gap.
  D.calamari_train = {
    desc: 'Two-car county train (pos = centre on the trackbed; L per car, gap, W, floor, h, cars: [{ number, dest }]): two railcars coupled by a gangway. Non-colliding (a stage mover block collides).',
    params: { L: 'one car\'s length', gap: 'coupling gap', cars: '[{ number, dest }]' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.L ?? 9, gap = o.gap ?? 0.3, W = o.W ?? 2.9, fy = o.floor ?? 1.05, h = o.h ?? 3.4, cars = o.cars ?? [{}, {}];
      const n = cars.length, total = n * L + (n - 1) * gap;
      cars.forEach((c, i) => {
        const x = -total / 2 + L / 2 + i * (L + gap);
        sub(B, 'calamari_railcar', x, 0, 0, i % 2 ? PI : 0, { L, W, floor: fy, h, number: c.number, dest: c.dest });
      });
      // gangways: dark rubber bellows between the cars, the coupler under them
      for (let i = 1; i < n; i++) {
        const x = -total / 2 + i * (L + gap) - gap / 2;
        B.box('rubber', '#26282c', gap + 0.1, h - fy - 0.35, W - 1.3, x, fy + (h - fy - 0.35) / 2, 0, { r: 0.04 });
        for (let k = 0; k < 4; k++) pbox(B, NS('rubber'), '#34363b', gap + 0.14, 0.05, W - 1.28, x, fy + 0.3 + k * 0.55, 0);
        B.box('metal', K.iron, gap + 0.3, 0.2, 0.4, x, 0.62, 0, { r: 0.03 });
      }
    },
  };

  // ------------------------------------------------------------------------------------------ platforms
  // platform edge run along local +X (length L) at the platform top y: stone coping with a white line and a yellow
  // tactile strip, the timber face down to the ballast (its shadow line), snow ploughed into a ridge by the fence.
  D.calamari_platedge = {
    desc: 'Platform edge along local +X (length L; the track on local +Z): coping stones, white safety line, yellow tactile strip, the face down to the ballast. Non-colliding.',
    params: { length: 'm', y: 'platform height' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 10, y = o.y ?? 1.0;
      pbox(B, 'paint', K.stoneLt, L, 0.06, 0.42, L / 2, y + 0.01, -0.2);
      pbox(B, NS('paint'), K.white, L, 0.012, 0.1, L / 2, y + 0.006, -0.55);
      for (let x = 0.15; x < L; x += 0.3) pbox(B, NS('paint'), '#d9b53e', 0.28, 0.016, 0.28, x, y + 0.008, -0.85);
      pbox(B, NS('paint'), K.stoneDk, L, y - 0.1, 0.04, L / 2, (y - 0.1) / 2, 0.005);
    },
  };

  // the station name board (ekimeihyō) on two posts, facing local +Z: CALAMARI COUNTY, the stops either side
  D.calamari_nameboard = {
    desc: 'Station name board on two posts facing local +Z: CALAMARI COUNTY, previous / next stops beneath. Posts collide.',
    params: { prev: 'left stop', next: 'right stop' }, variants: 1, mount: 'ground',
    build(B, o) {
      const W = 2.5, y0 = 1.25, bh = 0.95;
      for (const sx of [-1, 1]) { B.box('metal', K.ironLt, 0.08, y0 + bh, 0.08, sx * (W / 2 - 0.2), (y0 + bh) / 2, -0.06, { r: 0.01 }); colBox(B, sx * (W / 2 - 0.2), 0, -0.06, 0.12, 1.2, 0.12); }
      for (const s of [-1, 1]) {
        B.push(0, 0, 0, s > 0 ? 0 : PI);
        B.box('paint', K.white, W, bh, 0.05, 0, y0 + bh / 2, 0.0, { r: 0.02 });
        pbox(B, NS('paint'), K.teal, W - 0.1, 0.1, 0.01, 0, y0 + 0.33, 0.03);
        letters(B, 'CALAMARI COUNTY', { h: 0.2, x: 0, y: y0 + 0.52, z: 0.03, c: K.indigo, flat: true, wt: 0.2, track: 0.1 });
        letters(B, s > 0 ? (o.prev ?? '← INKOPOLIS') : (o.next ?? 'SHIOKARA BAY →'), { h: 0.075, x: s > 0 ? -W / 2 + 0.12 : W / 2 - 0.12, align: s > 0 ? 'left' : 'right', y: y0 + 0.14, z: 0.03, c: K.indigo, flat: true, wt: 0.2 });
        letters(B, s > 0 ? (o.next ?? 'SHIOKARA BAY →') : (o.prev ?? '← INKOPOLIS'), { h: 0.075, x: s > 0 ? W / 2 - 0.12 : -W / 2 + 0.12, align: s > 0 ? 'right' : 'left', y: y0 + 0.14, z: 0.03, c: K.indigo, flat: true, wt: 0.2 });
        letters(B, '3 h 30 min', { h: 0.055, x: s > 0 ? -W / 2 + 0.16 : W / 2 - 0.16, align: s > 0 ? 'left' : 'right', y: y0 + 0.05, z: 0.03, c: K.stoneDk, flat: true, wt: 0.2 });
        B.pop();
      }
      snowCap(B, 0, y0 + bh, 0, W - 0.04, 0.1, 0.08);
      icicles(B, -W / 2 + 0.1, W / 2 - 0.1, y0 - 0.01, 0.03, 5, 0.14);
    },
  };

  // ------------------------------------------------------------------------------------------ the overpass
  // The station's open overpass (kosen-kyō) spanning the whole railway cut from one side platform over both tracks and
  // the island to the other (pos = [deck centre x, 0, 0]; w along x, d along z; y = deck top, t = its thickness; the
  // deck and its stairs are level pieces): green-painted steel edge girders, slim steel piers down to the platforms
  // (colliders), railings along every edge with a timber handrail and snow on it (rail colliders: shots, ink and
  // squids pass) — open at the stair heads on the outer edge — the stairs' stringers + handrails (rail colliders),
  // lamp posts, the station name on the railings, a clock and the platform numbers hung under the deck.
  // stairs: [{ z, w, xLow, xTop, yLow }] (local); piers: [[x, z, yBase]]; signs: [[x, z, facing]]; numbers: [[z, text]].
  D.calamari_overpass = {
    desc: 'Open station overpass over the railway cut (pos = deck centre; w, d, y, t; stairs, piers): steel edge girders, piers (collide), railings with snowy handrails (rail colliders, open at the stair heads), stair stringers + handrails (rail), lamps, name signs, a hanging clock and platform numbers.',
    params: { w: 'deck width (x)', d: 'deck length (z)', y: 'deck top', t: 'deck thickness', stairs: '[{ z, w, xLow, xTop, yLow }]', piers: '[[x, z, yBase]]' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const w = o.w, d = o.d, y = o.y, t = o.t ?? 0.4, yb = y - t, green = '#4f6e5c', greenDk = '#3c5647', rH = 1.05;
      const stairs = o.stairs ?? [];
      // edge girders (the slab's edge dressed as a steel plate girder) + the end girders
      for (const s of [-1, 1]) {
        pbox(B, 'metal', green, 0.1, t + 0.1, d + 0.1, s * (w / 2 + 0.03), y - t / 2 + 0.03, 0);
        pbox(B, NS('metal'), greenDk, 0.16, 0.06, d + 0.1, s * (w / 2 + 0.03), y + 0.06, 0);
        for (let z = -d / 2 + 0.9; z < d / 2 - 0.5; z += 1.8) pbox(B, NS('metal'), greenDk, 0.04, t + 0.06, 0.08, s * (w / 2 + 0.09), y - t / 2 + 0.02, z);
        pbox(B, 'metal', green, w + 0.2, t + 0.1, 0.1, 0, y - t / 2 + 0.03, s * (d / 2 + 0.03));
      }
      // piers: slim steel columns with cap and base plates
      for (const [px, pz, py] of o.piers ?? []) {
        const hgt = yb - py;
        B.box('metal', green, 0.3, hgt, 0.3, px, py + hgt / 2, pz, { r: 0.02 });
        pbox(B, NS('metal'), greenDk, 0.5, 0.06, 0.5, px, yb - 0.03, pz);
        pbox(B, NS('metal'), greenDk, 0.46, 0.08, 0.46, px, py + 0.04, pz);
        snowCap(B, px, py + 0.08, pz, 0.62, 0.62, 0.05);
        colBox(B, px, py, pz, 0.34, hgt - 0.05, 0.34);
      }
      // railings: posts, a steel mid rail, the timber handrail with snow; rail colliders along each run
      const railRun = (x0, z0, x1, z1) => {
        const L = Math.hypot(x1 - x0, z1 - z0);
        if (L < 0.3) return;
        const n = Math.max(1, Math.round(L / 1.5)), ang = Math.atan2(z1 - z0, x1 - x0);
        for (let i = 0; i <= n; i++) { const k = i / n; B.box(NS('metal'), green, 0.07, rH, 0.07, x0 + (x1 - x0) * k, y + rH / 2, z0 + (z1 - z0) * k, { r: 0.01 }); }
        B.push((x0 + x1) / 2, y, (z0 + z1) / 2, -ang);
        pbox(B, 'wood', K.woodLt, L, 0.07, 0.11, 0, rH, 0);
        pbox(B, NS('metal'), green, L, 0.045, 0.045, 0, rH * 0.5, 0);
        pbox(B, NS('metal'), green, L, 0.04, 0.04, 0, 0.12, 0);
        snowCap(B, 0, rH + 0.035, 0, L, 0.12, 0.05);
        B.pop();
        colRun(B, x0, z0, x1, z1, y, rH + 0.05, 0.12, RAIL);
      };
      const ex = w / 2 - 0.08, ez = d / 2 - 0.08;
      // a long edge's railing with openings: the stair heads, and the one-way drops (drops / innerDrops: [[z0, z1]])
      const edgeRail = (x, open) => {
        let z = -ez;
        for (const [g0, g1] of [...open].sort((a, b) => a[0] - b[0])) { if (g0 > z) railRun(x, z, x, g0); z = Math.max(z, g1); }
        if (z < ez) railRun(x, z, x, ez);
        // (bollard posts either side of each drop opening, a painted edge line)
        for (const [g0, g1] of o.dropMarks ? open : []) for (const gz of [g0, g1]) if (Math.abs(gz) < ez) B.box(NS('metal'), '#e0b43a', 0.12, 0.5, 0.12, x, y + 0.25, gz, { r: 0.03 });
      };
      edgeRail(-ex, o.innerDrops ?? []);                             // the inner edge (over the gap between the overpasses)
      railRun(-ex, -ez, ex, -ez); railRun(-ex, ez, ex, ez);          // the ends, over the forecourts
      edgeRail(ex, [...stairs.map((st) => [st.z - st.w / 2 - 0.05, st.z + st.w / 2 + 0.05]), ...(o.drops ?? [])]);   // the outer edge
      for (const [g0, g1] of [...(o.drops ?? []).map((g) => [ex, g]), ...(o.innerDrops ?? []).map((g) => [-ex, g])]) {
        // the drop's lip: a yellow-and-black warning edge on the deck
        for (let k = 0; k < Math.round((g1[1] - g1[0]) / 0.3); k++) pbox(B, NS('paint'), k % 2 ? '#1f2124' : '#e0b43a', 0.12, 0.012, 0.3, g0 - Math.sign(g0) * 0.1, y + 0.006, g1[0] + 0.15 + k * 0.3);
      }
      // stairs: side stringers + handrails (rail colliders in three steps up the slope), posts
      for (const st of stairs) {
        const { z: sz, xLow, xTop, yLow, w: sw } = st, run = xTop - xLow, rise = y - yLow, ang = Math.atan2(rise, Math.abs(run)), len = Math.hypot(run, rise), dir = Math.sign(run);
        for (const s of [-1, 1]) {
          const zz = sz + s * (sw / 2 + 0.05);
          B.push((xLow + xTop) / 2, (yLow + y) / 2, zz, dir > 0 ? 0 : PI, 0, ang);
          pbox(B, 'metal', green, len + 0.1, 0.34, 0.08, 0, -0.18, 0);
          pbox(B, 'wood', K.woodLt, len, 0.07, 0.1, 0, 0.92, 0);
          pbox(B, NS('metal'), green, len, 0.045, 0.045, 0, 0.5, 0);
          snowCap(B, 0, 0.955, 0, len, 0.1, 0.04);
          B.pop();
          const np = Math.max(3, Math.round(Math.abs(run) / 1.4));
          for (let i = 0; i <= np; i++) { const k = i / np; B.box(NS('metal'), green, 0.07, 1.0, 0.07, xLow + run * k, yLow + rise * k + 0.45, zz, { r: 0.01 }); }
          // (the handrail's collider follows the slope in 8 steps: nobody stands on air above the handrail)
          for (let k = 0; k < 8; k++) {
            const xa = xLow + (run * k) / 8, xb = xLow + (run * (k + 1)) / 8, top = yLow + (rise * (k + 1)) / 8 + 0.95;
            B.col(Math.min(xa, xb), yLow + (rise * k) / 8 - 0.05, zz - 0.06, Math.max(xa, xb), top, zz + 0.06, RAIL);
          }
        }
      }
      // lamp posts on the railings (enamel shades, lit at dusk)
      for (const [lx, lz] of o.lamps ?? []) {
        B.cyl(NS('metal'), green, 0.045, 2.1, lx, y + 1.05, lz, { seg: 8 });
        B.push(lx, y + 2.1, lz);
        B.lathe('paint', '#e9ece7', [[0.02, 0.08], [0.1, 0.05], [0.24, -0.08], [0.25, -0.1], [0, -0.1]], 0, 0, 0, { seg: 14 });
        B.sph(NS('glow'), K.lit, 0.08, 0, -0.1, 0, { ws: 10, hs: 8, glow: 1.6 });
        snowCap(B, 0, 0.06, 0, 0.36, 0.36, 0.05);
        B.pop();
      }
      // the station name on the railings (both faces), facing ±x
      for (const [nx, nz, face] of o.signs ?? []) {
        B.push(nx, y + 0.55, nz, face > 0 ? HP : -HP);
        B.box('wood', K.cedarDk, 4.6, 0.62, 0.06, 0, 0, 0.1, { r: 0.02 });
        pbox(B, NS('paint'), K.cream, 4.48, 0.5, 0.01, 0, 0, 0.135);
        letters(B, 'CALAMARI COUNTY', { h: 0.26, x: 0, y: -0.02, z: 0.14, c: K.indigo, flat: true, wt: 0.2, track: 0.12 });
        pbox(B, NS('paint'), K.teal, 4.4, 0.05, 0.01, 0, -0.2, 0.14);
        B.pop();
      }
      // under the deck: a clock over the island, the platform numbers over each side of it
      if (o.clock) {
        const [cx, cz] = o.clock;
        B.cyl(NS('metal'), K.iron, 0.012, 0.4, cx, yb - 0.2, cz, { seg: 4 });
        for (const s of [-1, 1]) {
          B.push(cx, yb - 0.66, cz, s > 0 ? HP : -HP);
          B.cyl('paint', K.white, 0.26, 0.1, 0, 0, 0, { rx: HP, seg: 20 });
          B.add(NS('paint'), H.tubeGeo(Array.from({ length: 25 }, (_, i) => { const a = (i / 24) * TAU; return [Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0]; }), 0.03, 6, true), K.iron, 0, 0, 0.05, {});
          pbox(B, NS('paint'), K.dark, 0.02, 0.13, 0.005, 0.03, 0.05, 0.054, { rz: -0.9 });
          pbox(B, NS('paint'), K.dark, 0.016, 0.2, 0.005, -0.02, 0.08, 0.056, { rz: 0.2 });
          B.pop();
        }
      }
      for (const [nz, n] of o.numbers ?? []) {
        B.cyl(NS('metal'), K.iron, 0.01, 0.3, 0, yb - 0.15, nz, { seg: 4 });
        B.push(0, yb - 0.5, nz);
        B.box('paint', K.indigo, 0.05, 0.36, 1.1, 0, 0, 0, { r: 0.02 });
        for (const s of [-1, 1]) { B.push(0, 0, 0, s > 0 ? HP : -HP); letters(B, n, { h: 0.18, x: 0, y: -0.09, z: 0.028, c: K.white, flat: true, wt: 0.2 }); B.pop(); }
        B.pop();
      }
    },
  };

  // ------------------------------------------------------------------------------------------ the level crossing
  // pos = [road centre x, 0, 0] (the cut's centre line); w = road width; the panels between and round the rails over
  // |z| < reach; signal + barrier units at `units` [[x, z, facing]] (world-relative). Units collide (small cover).
  D.calamari_crossing = {
    desc: 'Level crossing (pos = road centre on the cut centre line; w, reach, tracks, units): crossing panels over the tracks, warning posts (crossbuck, red lamps, bell) with barrier machines (arms raised), road markings. Unit bases collide.',
    params: { w: 'road width', reach: 'half length over the cut (z)', tracks: 'track centre z list', units: '[[x, z, ry]]' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const w = o.w ?? 4.5, g = 0.535;
      for (const tz of o.tracks ?? [-5, 5]) {
        // rubber panels between the rails and either side, snow melted off them (dark, wet)
        pbox(B, 'rubber', '#3a3b3e', w, 0.12, g * 2 - 0.12, 0, 0.06, tz);
        for (const s of [-1, 1]) pbox(B, 'rubber', '#3a3b3e', w, 0.12, 0.62, 0, 0.06, tz + s * (g + 0.37));
        for (const s of [-1, 1]) pbox(B, NS('metal'), K.steel, w, 0.03, 0.06, 0, 0.1, tz + s * (g - 0.08));
      }
      // STOP lines on the approaches (painted on the street) + the crossing's yellow-black kerb posts
      for (const s of [-1, 1]) {
        const zz = s * ((o.reach ?? 6.6) + 0.9);
        pbox(B, NS('paint'), K.white, w - 0.6, 0.01, 0.3, 0, 0.006, zz);
      }
      for (const [ux, uz, ry, side = 1] of o.units ?? []) {
        B.push(ux, 0, uz, ry);
        // warning post: black-and-yellow striped base, crossbuck, two red lamps, a bell box
        B.box('paint', K.stoneLt, 0.5, 0.2, 0.5, 0, 0.1, 0, { r: 0.04 });
        const ph = 3.0, bx = side * 0.55;
        for (let k = 0; k < 6; k++) pbox(B, 'paint', k % 2 ? '#1f2124' : '#e0b43a', 0.12, 0.2, 0.12, 0, 0.3 + k * 0.2, 0);
        B.cyl('metal', K.galv, 0.05, ph - 1.3, 0, 1.3 + (ph - 1.3) / 2, 0, { seg: 8 });
        for (const a of [0.62, -0.62]) { B.push(0, ph - 0.1, 0.06, 0, 0, a); pbox(B, 'paint', '#e0b43a', 1.0, 0.16, 0.03, 0, 0, 0); pbox(B, NS('paint'), '#1f2124', 0.96, 0.05, 0.035, 0, 0, 0.002); B.pop(); }
        for (const sx of [-1, 1]) {
          B.box('paint', K.black, 0.34, 0.34, 0.1, sx * 0.3, ph - 0.75, 0.08, { r: 0.05 });
          // (lenses dark: the stage movers flash them in turn while a railcar is due — movers.js signals.lamps)
          if (o.lit === false) B.cyl(NS('paint'), '#4a1410', 0.12, 0.04, sx * 0.3, ph - 0.75, 0.14, { rx: HP, seg: 14 });
          else B.cyl(NS('glow'), '#ff4a3a', 0.12, 0.04, sx * 0.3, ph - 0.75, 0.14, { rx: HP, seg: 14, glow: 1.0 });
          B.cyl(NS('paint'), K.black, 0.17, 0.02, sx * 0.3, ph - 0.62, 0.13, { rx: HP + 0.5, seg: 12, open: true });
        }
        B.box('paint', K.black, 0.3, 0.26, 0.16, 0, ph - 1.2, 0.06, { r: 0.04 });
        pbox(B, NS('paint'), '#e0b43a', 0.2, 0.2, 0.01, 0, ph - 1.2, 0.15, { rz: PI / 4 });
        snowCap(B, 0, ph + 0.18, 0.06, 0.3, 0.2, 0.08);
        // barrier machine beside it (on the road side) with the striped arm raised (vertical)
        B.box('paint', '#e0b43a', 0.36, 0.9, 0.3, bx, 0.45, 0, { r: 0.04 });
        B.box(NS('paint'), K.black, 0.38, 0.12, 0.32, bx, 0.75, 0, { r: 0.02 });
        for (let k = 0; k < 7; k++) pbox(B, 'paint', k % 2 ? '#1f2124' : '#f0ede6', 0.07, 0.42, 0.07, bx + side * 0.2, 1.05 + k * 0.42, 0);
        snowCap(B, bx, 0.9, 0, 0.36, 0.3, 0.06);
        colBox(B, bx / 2, 0, 0, 1.2, 1.2, 0.5);
        B.pop();
      }
    },
  };

  // ------------------------------------------------------------------------------------------ the tunnel portal
  // Stone portal (pos = the face centre at y 0, facing local +Z): coursed masonry, two arched openings over the tracks
  // (dark inside, icicles), a cornice + parapet with snow, a plaque, wing buttresses. Non-colliding (the level block).
  D.calamari_portal = {
    desc: 'Twin-track tunnel portal face (pos = face centre, facing local +Z; w, h, bores): coursed granite, two arched bores (dark), cornice + parapet with snow, a name plaque, icicles. Non-colliding.',
    params: { w: 'face width', h: 'height', bores: 'bore centres (x)', name: 'plaque text' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = o.w ?? 17, Ht = o.h ?? 7.5, bw = o.bw ?? 3.6, spring = 3.6, bores = o.bores ?? [-5, 5];
      // masonry courses: stones of varied length, avoiding the bores
      const inBore = (x, y) => bores.some((c) => Math.abs(x - c) < bw / 2 + 0.25 && (y < spring || Math.hypot(x - c, y - spring) < bw / 2 + 0.25));
      for (let r = 0, y = 0; y < Ht - 0.9; r++, y += 0.55) {
        let x = -W / 2 + (r % 2 ? 0.45 : 0);
        while (x < W / 2 - 0.05) {
          const L = Math.min(W / 2 - x, 0.7 + hash(r * 17 + x) * 0.8);
          if (!inBore(x + L / 2, y + 0.27)) B.box(r % 3 === 0 ? 'paint' : NS('paint'), mixc(K.granite, K.stoneDk, hash(r + x * 3)), L - 0.04, 0.51, 0.18, x + L / 2, y + 0.27, 0.09, { r: 0.04 });
          x += L;
        }
      }
      for (const c of bores) {
        // dark bore, the arch ring of voussoirs, the reveals
        pbox(B, NS('paint'), '#0d0f12', bw, spring, 0.02, c, spring / 2, 0.02);
        B.add(NS('paint'), cylGeo(bw / 2, bw / 2, 0.02, 20, false, -HP, PI), '#0d0f12', c, spring, 0.02, { rx: HP });
        const n = 13;
        for (let i = 0; i < n; i++) {
          const a = PI * (i + 0.5) / n, r0 = bw / 2 + 0.3;
          B.box('paint', shade(K.granite, 1.05), 0.34, 0.62, 0.3, c + Math.cos(a) * r0, spring + Math.sin(a) * r0, 0.15, { rz: a - HP, r: 0.03 });
        }
        for (const sx of [-1, 1]) B.box('paint', shade(K.granite, 1.05), 0.5, spring, 0.3, c + sx * (bw / 2 + 0.25), spring / 2, 0.15, { r: 0.03 });
        icicles(B, c - bw / 2 + 0.3, c + bw / 2 - 0.3, spring + bw / 2 - 0.1, 0.05, Math.round(c * 7) + 3, 0.45);
      }
      // cornice + parapet, snow along the top, the plaque between the bores
      B.box('paint', K.stoneLt, W + 0.4, 0.3, 0.5, 0, Ht - 0.75, 0.2, { r: 0.04 });
      B.box('paint', K.stone, W, 0.6, 0.35, 0, Ht - 0.3, 0.1, { r: 0.04 });
      snowCap(B, 0, Ht, 0.1, W + 0.2, 0.7, 0.24);
      snowCap(B, 0, Ht - 0.6, 0.35, W + 0.3, 0.3, 0.12);
      icicles(B, -W / 2 + 0.3, W / 2 - 0.3, Ht - 0.92, 0.46, 77, 0.35);
      B.box('paint', '#6f6a60', 2.4, 0.7, 0.08, 0, spring + 0.9, 0.2, { r: 0.03 });
      letters(B, o.name ?? 'CALAMARI TUNNEL', { h: 0.18, x: 0, y: spring + 0.9, z: 0.25, c: K.cream, flat: true, wt: 0.2, track: 0.14 });
      letters(B, o.year ?? '1931', { h: 0.12, x: 0, y: spring + 0.65, z: 0.25, c: K.cream, flat: true, wt: 0.2 });
      // wing buttresses at both ends
      for (const sx of [-1, 1]) { B.box('paint', K.stoneDk, 0.9, Ht - 0.5, 0.9, sx * (W / 2 - 0.45), (Ht - 0.5) / 2, 0.35, { r: 0.05 }); snowCap(B, sx * (W / 2 - 0.45), Ht - 0.5, 0.35, 0.9, 0.9, 0.18); }
    },
  };

  // ------------------------------------------------------------------------------------------ signal + relay box
  D.calamari_signal = {
    desc: 'A railway colour-light signal on a mast with a ladder (red / green, lit), a relay cabinet at its foot. Mast + cabinet collide.',
    params: { aspect: "'red' | 'green'" }, variants: 1, mount: 'ground',
    build(B, o) {
      B.cyl('metal', K.galv, 0.08, 4.2, 0, 2.1, 0, { seg: 8 });
      B.box('paint', K.black, 0.4, 0.95, 0.24, 0, 4.1, 0.12, { r: 0.08 });
      for (const [k, c] of [[0, '#ff4a3a'], [1, '#ffcf5a'], [2, '#4ad089']]) {
        const on = (o.aspect ?? 'red') === ['red', 'yellow', 'green'][k];
        B.cyl(on ? NS('glow') : NS('paint'), on ? c : '#2a2c30', 0.1, 0.04, 0, 4.38 - k * 0.28, 0.25, { rx: HP, seg: 12, glow: on ? 1.6 : undefined });
        B.cyl(NS('paint'), K.black, 0.14, 0.14, 0, 4.44 - k * 0.28, 0.28, { rx: HP, seg: 10, open: true, r2: 0.14 });
      }
      snowCap(B, 0, 4.57, 0.12, 0.4, 0.24, 0.08);
      B.box('paint', '#9aa0a3', 0.7, 1.1, 0.5, 0.6, 0.55, 0, { r: 0.04 });
      snowCap(B, 0.6, 1.1, 0, 0.7, 0.5, 0.12);
      colBox(B, 0.3, 0, 0, 1.2, 1.2, 0.6);
    },
  };
}
