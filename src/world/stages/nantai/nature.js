// Mount Nantai — the mountain itself: brook banks (boulders at the waterline, stones in the stream), dwarf pines,
// granite boulders, cairns, trail signs, scree, Pearl's rehearsal rock, the rowing boat, benches. (registered by props.js)
export function registerNature(D, H, T) {
  const { THREE, PI, TAU, HP } = H;
  const { K, NS, tpl, kf, hash, pbox, ccyl, seg, colC, ROOF, RAIL, letters, textW, boardSign, rock, pine, heath } = T;
  const WY = -1.6;

  // ------------------------------------------------------------------------------------------ brook banks
  // pos = a point on the water edge; the bank runs `length` along local +X, the water on local +Z. Boulders crowd the
  // foot of the bank face (tops kept under the deck), a few breaking the surface, foam where the stream runs past.
  // foot: a hidden collision slab under the gravel bar (−2.4 → 0, `bar` deep inland from the edge): it sits inside
  // the bar (never touched) and puts the true water edge into the environment's deck footprint (foam, shading).
  D.nantai_bank = {
    desc: 'brook bank: waterline boulders, stones in the stream, footprint slab',
    build(B, o) {
      const L = o.length ?? 6, seed = o.seed ?? 1, n = Math.max(2, Math.round(L / 0.9));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.2 + hash(seed + i) * 0.6) / n, x = t * L, big = hash(seed * 3 + i) > 0.7;
        const r = big ? 0.55 + hash(i * 7 + seed) * 0.25 : 0.32 + hash(i * 5 + seed) * 0.25;
        const z = 0.05 + hash(i * 11 + seed) * 0.3, base = WY - 0.35, top = (big ? -0.3 : -0.95) - hash(i * 13 + seed) * 0.3;
        rock(B, x, base, z, r, (top - base) / 1.62, r * 0.8, seed * 17 + i, { c: hash(i + seed * 2) > 0.5 ? K.graniteLt : K.granite, ao: false });
      }
      // stones in the stream + foam trails behind them (downstream = local +X)
      const ns = o.stones ?? Math.round(L / 3);
      for (let i = 0; i < ns; i++) {
        const x = ((i + 0.5) / ns) * L + (hash(seed * 5 + i) - 0.5), z = 0.9 + hash(seed * 9 + i) * ((o.width ?? 2.5) - 1.6), r = 0.25 + hash(i * 3 + seed) * 0.25;
        rock(B, x, WY - 0.35, z, r, r * 0.55, r * 0.8, seed * 31 + i, { c: K.graniteLt, ao: false });
      }
      if (o.bar) B.col(0, -2.4, -o.bar, L, 0.0, 0);
    },
  };

  // the environment's footprint under a ledge (hidden slabs: the tarn's edge rocks and foam follow the true shore). pos =
  // the ledge's centre, local x along it (len), local z across it (w); never rendered, never touched (inside the ledge)
  D.nantai_foot = {
    desc: 'footprint slab under a shore ledge (collision-only, hidden)',
    build(B, o) { B.col(-o.len / 2 + 0.04, -2.4, -o.w / 2 + 0.04, o.len / 2 - 0.04, -0.02, o.w / 2 - 0.04); },
  };

  // ------------------------------------------------------------------------------------------ pines, boulders, cairns
  D.nantai_pine = {
    desc: 'wind-bent dwarf mountain pine (cover)',
    build(B, o) {
      const s = o.scale2 ?? 1;
      pine(B, 0, 0, 0, s, o.seed ?? 3, 0);
      rock(B, -0.2, -0.1, 0.1, 0.45, 0.3, 0.4, (o.seed ?? 3) + 40, { c: K.graniteDk });
      if (o.solid !== false) colC(B, 0.45 * s, 0, 0, 1.5 * s, 1.9 * s, 1.1 * s);
    },
  };
  // granite boulder(s) as cover: w × h × d footprint, the collider a box a little inside the rock
  D.nantai_boulder = {
    desc: 'granite boulder (cover)',
    build(B, o) {
      const w = o.w ?? 1.6, h = o.h ?? 1.1, d = o.d ?? 1.3, seed = o.seed ?? 5;
      rock(B, 0, -0.05, 0, w / 2, h / 1.62, d / 2, seed, { c: o.color ?? K.granite });
      if (o.heath !== false) heath(B, w * 0.42, 0, d * 0.35, 0.9, seed, undefined);
      if (o.pebbles !== false) for (let i = 0; i < 3; i++) { const a = hash(seed + i) * TAU; rock(B, Math.cos(a) * (w / 2 + 0.2), -0.05, Math.sin(a) * (d / 2 + 0.2), 0.18, 0.12, 0.16, seed + i * 7, { c: K.graniteDk }); }
      if (o.lichen !== false) for (let i = 0; i < 4; i++) { const a = hash(seed * 3 + i) * TAU; B.sph(NS('paint'), i % 2 ? K.lichen : '#9aa08a', 0.16, Math.cos(a) * w * 0.3, h * 0.92, Math.sin(a) * d * 0.3, { sx: 1, sy: 0.12, sz: 0.8, ws: 8, hs: 4 }); }
      if (o.solid !== false) colC(B, 0, 0, 0, w * 0.82, h * 0.95, d * 0.82, o.roof ? ROOF : undefined);
    },
  };
  D.nantai_cairn = {
    desc: 'trail cairn',
    build(B, o) {
      const n = o.n ?? 6;
      let y = 0;
      for (let i = 0; i < n; i++) { const r = 0.38 - i * 0.045, h = 0.2 - i * 0.012; rock(B, (hash(i * 3) - 0.5) * 0.06, y - 0.03, (hash(i * 5) - 0.5) * 0.06, r, h / 1.24 * 1.1, r * 0.9, i * 11 + 3, { c: i % 2 ? K.granite : K.graniteLt }); y += h * 0.9; }
      colC(B, 0, 0, 0, 0.7, y, 0.7);
    },
  };
  // scree: loose stones strewn over a patch (visual only), w × d
  D.nantai_scree = {
    desc: 'scree / loose stones (visual)',
    build(B, o) {
      const w = o.w ?? 2, d = o.d ?? 2, n = o.n ?? 14, seed = o.seed ?? 9;
      for (let i = 0; i < n; i++) { const r = 0.07 + hash(seed + i * 1.7) * 0.14; rock(B, (hash(seed * 3 + i) - 0.5) * w, -0.02, (hash(seed * 7 + i) - 0.5) * d, r, r * 0.55, r * 0.85, seed + i, { c: hash(i) > 0.5 ? K.scree : K.granite, ao: false }); }
    },
  };


  // an outcrop: a cluster of granite blocks round a big one (cover; one collider box over the core), heather at its foot
  D.nantai_outcrop = {
    desc: 'granite outcrop (cover)',
    build(B, o) {
      const w = o.w ?? 2.6, h = o.h ?? 1.3, d = o.d ?? 1.8, seed = o.seed ?? 7;
      rock(B, 0, -0.05, 0, w * 0.42, h / 1.62, d * 0.45, seed, { c: K.granite, det: 1 });
      rock(B, w * 0.32, -0.05, d * 0.2, w * 0.24, h * 0.62 / 1.62, d * 0.32, seed + 5, { c: K.graniteDk });
      rock(B, -w * 0.34, -0.05, -d * 0.15, w * 0.22, h * 0.48 / 1.62, d * 0.3, seed + 9, { c: K.graniteLt });
      for (let i = 0; i < 4; i++) { const a = hash(seed * 1.7 + i) * TAU; rock(B, Math.cos(a) * w * 0.55, -0.03, Math.sin(a) * d * 0.6, 0.16, 0.08, 0.14, seed + 20 + i, { c: K.scree, ao: false }); }
      heath(B, -w * 0.45, 0, d * 0.45, 1.1, seed + 3);
      heath(B, w * 0.5, 0, -d * 0.4, 0.8, seed + 4);
      colC(B, 0, 0, 0, w * 0.8, h * 0.95, d * 0.8, o.roof ? ROOF : undefined);
    },
  };
  // heather / grass clumps strewn over a patch (visual)
  D.nantai_heath = {
    desc: 'heather and grass clumps (visual)',
    build(B, o) {
      const w = o.w ?? 2, d = o.d ?? 2, n = o.n ?? 5, seed = o.seed ?? 3;
      for (let i = 0; i < n; i++) heath(B, (hash(seed * 3 + i) - 0.5) * w, 0, (hash(seed * 7 + i) - 0.5) * d, 0.5 + hash(seed + i) * 0.6, seed + i);
    },
  };
  // granite planter with alpine plants (cover): w × d, 0.6 high
  D.nantai_planter = {
    desc: 'granite planter with alpine plants',
    build(B, o) {
      const w = o.w ?? 1.8, d = o.d ?? 0.8, h = 0.62;
      B.box('paint', K.stone, w, h, d, 0, h / 2, 0, { r: 0.05 });
      B.box('paint', K.graniteLt, w + 0.08, 0.08, d + 0.08, 0, h - 0.03, 0, { r: 0.03 });
      B.box('paint', '#4c3e30', w - 0.16, 0.04, d - 0.16, 0, h + 0.005, 0, { r: 0.01 });
      heath(B, -w * 0.25, h - 0.02, 0, 0.7, 11, K.moss);
      heath(B, w * 0.22, h - 0.02, 0.05, 0.6, 13, '#6d7c46');
      for (let i = 0; i < 7; i++) B.sph(NS('paint'), i % 3 ? '#e9e3f0' : '#e8c24a', 0.035, (hash(i * 3) - 0.5) * (w - 0.3), h + 0.1 + hash(i) * 0.08, (hash(i * 5) - 0.5) * (d - 0.3), { ws: 6, hs: 4 });
      colC(B, 0, 0, 0, w, h + 0.1, d);
    },
  };
  // interpretive board on a stand, angled (faces +Z): a title, a small star map
  D.nantai_infoboard = {
    desc: 'interpretive board: the night sky from Nantai',
    build(B, o) {
      for (const s of [-1, 1]) pbox(B, 'metal', K.steelDk, 0.07, 0.95, 0.07, s * 0.6, 0.47, 0);
      B.push(0, 1.05, 0, 0, -0.55);
      B.box('metal', K.steelDk, 1.46, 0.86, 0.06, 0, 0, 0, { r: 0.02 });
      pbox(B, NS('paint'), K.navy, 1.36, 0.76, 0.01, 0, 0, 0.035);
      letters(B, o.title ?? 'THE SKY FROM NANTAI', { h: 0.06, x: 0, y: 0.28, z: 0.042, c: K.white, flat: true, wt: 0.22 });
      for (let i = 0; i < 26; i++) { const s = 0.012 + hash(i * 1.7) * 0.014; pbox(B, NS('paint'), '#f4ecd2', s, s, 0.004, (hash(i * 2.3) - 0.5) * 1.2, (hash(i * 3.7) - 0.5) * 0.44 - 0.06, 0.043); }
      pbox(B, NS('paint'), K.grizz, 0.3, 0.12, 0.004, 0.46, -0.28, 0.043);
      B.pop();
      colC(B, 0, 0, 0, 1.4, 1.35, 0.3);
    },
  };
  // path bollard with a red night light (astronomers keep their eyes dark-adapted): glows at dusk
  D.nantai_bollard = {
    desc: 'red path bollard light',
    build(B) {
      B.cyl('metal', K.iron, 0.09, 0.75, 0, 0.375, 0, { seg: 10 });
      B.cyl('metal', K.iron, 0.11, 0.06, 0, 0.78, 0, { seg: 10 });
      B.box('glow', '#ff4a36', 0.1, 0.07, 0.1, 0, 0.68, 0, { glow: 1.1 });
      colC(B, 0, 0, 0, 0.2, 0.8, 0.2);
    },
  };

  // ------------------------------------------------------------------------------------------ signs
  // wooden fingerpost: a post, blades pointing along given headings (rad, local), carved text; a small roof cap
  D.nantai_fingerpost = {
    desc: 'trail fingerpost',
    build(B, o) {
      const blades = o.blades ?? [['SUMMIT 0.2 KM', 0.3], ['OCTO VALLEY 6 KM', PI + 0.2], ['INKOPOLIS 14 KM', -1.2]];
      pbox(B, 'wood', K.timberDk, 0.12, 2.4, 0.12, 0, 1.2, 0);
      B.box('wood', K.timberDk, 0.24, 0.06, 0.24, 0, 2.43, 0, { r: 0.01 });
      blades.forEach(([txt, a], i) => {
        const y = 2.05 - i * 0.3, w = textW(txt, 0.2, 0.1) * 0.1 + 0.4;
        B.push(0, y, 0, a);
        B.add('wood', H.extrudeGeo([[-0.12, -0.12], [0.12, -0.12], [0.12, 0.12], [-0.12, 0.12]], 1, 0.004), K.sign, 0.06 + w / 2, 0, 0, { sx: w, sy: 1, sz: 0.18 });
        pbox(B, 'wood', K.sign, 0.17, 0.17, 0.043, 0.06 + w, 0, 0, { rz: PI / 4 });
        B.push(0.06 + w / 2, -0.05, 0.03, 0);
        letters(B, txt, { h: 0.1, x: 0, y: 0, z: 0, c: K.signLt, flat: true, wt: 0.2, track: 0.1 });
        B.pop();
        B.push(0.06 + w / 2, -0.05, -0.03, PI);
        letters(B, txt, { h: 0.1, x: 0, y: 0, z: 0, c: K.signLt, flat: true, wt: 0.2, track: 0.1 });
        B.pop();
        B.pop();
      });
      rock(B, 0, -0.1, 0, 0.35, 0.22, 0.32, 21, { c: K.graniteDk });
      colC(B, 0, 0, 0, 0.3, 2.4, 0.3);
    },
  };
  // a board on two posts (pos = ground, board faces +Z): lines of text, colours
  D.nantai_board = {
    desc: 'sign board on posts',
    build(B, o) {
      const lines = o.lines ?? ['NANTAI BROOK'], h = o.h ?? 0.14, y = o.y ?? 1.2;
      const W = boardSign(B, lines, 0, y, { h, board: o.board ?? K.sign, c: o.c ?? K.signLt, wt: 0.2, lead: 1.5, z: 0.04 });
      for (const s of [-1, 1]) pbox(B, 'wood', K.timberDk, 0.1, y + 0.2, 0.1, s * (W / 2 - 0.12), (y + 0.2) / 2 - 0.1, 0);
      colC(B, 0, 0, 0.05, W, y + 0.3, 0.2);
    },
  };

  // ------------------------------------------------------------------------------------------ Pearl's rehearsal rock
  // pos = the rock's centre on the hollow floor (world [−15, 1.3, −25.5]); the layout octagon (R 2.6, 1.3 → 2.4) is the
  // walkable, inkable rock. Here: split-off granite at its corners and foot (never over its faces' middles, so ink on
  // the rock's sides stays readable), shockwave-cracked shards, the battered mic stand on top, the crate of spare mic
  // cables, the hand-painted sign.
  D.nantai_pearlsrock = {
    desc: "Pearl's rehearsal rock dressing: corner blocks, shards, mic stand, cable crate, sign",
    build(B) {
      const A = 2.6 * Math.cos(PI / 8), top = 1.1;
      // corner chunks (at the octagon's vertices), a few spalls at the foot
      for (let i = 0; i < 8; i++) {
        const a = PI / 8 + (i * PI) / 4, r = 2.62;
        rock(B, Math.cos(a) * r, -0.15, Math.sin(a) * r, 0.55 + hash(i) * 0.2, 0.62 + hash(i * 3) * 0.25, 0.5 + hash(i * 5) * 0.2, 60 + i, { c: i % 2 ? K.granite : K.graniteWarm });
      }
      for (let i = 0; i < 10; i++) { const a = hash(i * 7.7) * TAU, r = 3.0 + hash(i * 2.3) * 0.9; rock(B, Math.cos(a) * r, -0.04, Math.sin(a) * r, 0.14 + hash(i) * 0.12, 0.1, 0.12, 80 + i, { c: K.graniteLt, ao: false }); }
      // mic stand on top (slightly bent, base plate), cable snaking off the edge
      const mx = 0.5, mz = 0.3;
      B.cyl('metal', K.black, 0.22, 0.03, mx, top + 0.015, mz, { seg: 14 });
      seg(B, 'metal', K.steelDk, [mx, top, mz], [mx + 0.04, top + 1.35, mz - 0.02], 0.025, 0.025, { round: true });
      seg(B, 'metal', K.steelDk, [mx + 0.04, top + 1.35, mz - 0.02], [mx + 0.32, top + 1.52, mz - 0.1], 0.02, 0.02, { round: true });
      B.push(mx + 0.38, top + 1.54, mz - 0.12, 0.3, 0, -0.9);
      B.cyl('metal', K.black, 0.03, 0.18, 0, 0, 0, { seg: 8 });
      B.sph('metal', K.steelLt, 0.05, 0, 0.12, 0, { ws: 10, hs: 8 });
      B.pop();
      const cab = [[mx, top + 0.02, mz], [mx - 0.5, top + 0.02, mz + 0.4], [mx - 1.2, top + 0.02, mz + 0.9], [mx - 1.5, top + 0.02, mz + 1.6], [-1.3, top - 0.2, 2.35], [-1.6, 0.02, 2.9], [-2.9, 0.02, 3.3]];
      B.add('rubber', H.tubeGeo(cab, 0.018, 5), K.black, 0, 0, 0);
      // the crate of spare cables at the foot (cover, low)
      B.push(-3.45, 0, 3.6, 0);
      B.box('wood', K.timber, 1.0, 0.55, 0.7, 0, 0.275, 0, { r: 0.03 });
      for (const y of [0.12, 0.42]) pbox(B, 'wood', K.timberDk, 1.02, 0.06, 0.72, 0, y, 0);
      for (let i = 0; i < 5; i++) B.tor('rubber', i % 2 ? K.black : K.grizzBrown, 0.14, 0.025, -0.3 + i * 0.15, 0.58, (hash(i) - 0.5) * 0.3, { rx: HP + 0.3, rs: 5, ts: 14 });
      letters(B, 'MIC CABLES', { h: 0.07, x: 0, y: 0.24, z: 0.355, c: K.white, flat: true, wt: 0.22 });
      B.pop();
      colC(B, -3.45, 0, 3.6, 1.1, 0.6, 0.7, ROOF);   // (flush with the ridge wall, off-limits top: nobody wedges or parks there)
      // the sign, hand-painted on a board on a stake, at the foot facing the brook (+Z local → the hollow's front)
      B.push(1.2, 0, 3.4, -0.25);
      pbox(B, 'wood', K.timberDk, 0.08, 1.35, 0.08, 0, 0.62, 0);
      B.box('wood', '#e9e1cc', 1.25, 0.55, 0.035, 0, 1.2, 0.05, { r: 0.015, rz: 0.04 });
      B.push(0, 1.2, 0.07, 0, 0, 0.04);
      letters(B, 'QUIET PLEASE', { h: 0.1, x: 0, y: 0.08, z: 0, c: K.red, flat: true, wt: 0.22 });
      letters(B, 'REHEARSAL (P.)', { h: 0.075, x: 0, y: -0.1, z: 0, c: K.navy, flat: true, wt: 0.22 });
      pbox(B, NS('paint'), K.red, 0.9, 0.012, 0.003, 0, -0.14 + 0.155, 0);
      B.pop();
      B.pop();
      colC(B, 1.2, 0, 3.4, 0.3, 1.5, 0.3);
    },
  };

  // ------------------------------------------------------------------------------------------ the rowing boat
  // pulled up on the shore, bow toward the tarn (local +Z), oars across the thwarts (pos = ground centre)
  const hullGeo = tpl('nantaiBoatHull', () => {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10, z = (t - 0.5) * 3.6, w = 0.62 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.02)), 0.55); pts.push([z, w]); }
    const g = new T.GB();
    const ring = pts.map(([z, w], i) => {
      const r = [];
      for (let k = 0; k <= 6; k++) { const a = (k / 6) * PI, x = -Math.cos(a) * w, y = -Math.sin(a) * 0.42 * (w / 0.62 * 0.6 + 0.4); r.push(g.v(x, y + 0.48 + (i === 0 || i === 10 ? 0.08 : 0), z, -Math.cos(a), -Math.sin(a) * 0.8, 0)); }
      return r;
    });
    for (let i = 0; i < ring.length - 1; i++) for (let k = 0; k < 6; k++) g.quad(ring[i][k], ring[i][k + 1], ring[i + 1][k + 1], ring[i + 1][k]);
    return g.geo();
  });
  D.nantai_rowboat = {
    desc: 'rowing boat pulled up on the shore',
    build(B) {
      B.push(0, 0.02, 0, 0, 0.06);
      B.add('paint', hullGeo, K.teal, 0, 0, 0);
      B.add('paint', hullGeo, K.whiteSh, 0, 0.02, 0, { sx: 0.93, sy: 0.93, sz: 0.97 });
      pbox(B, 'wood', K.larch, 1.1, 0.05, 0.22, 0, 0.42, -0.3);
      pbox(B, 'wood', K.larch, 0.9, 0.05, 0.22, 0, 0.42, 0.7);
      pbox(B, 'wood', K.red, 0.05, 0.05, 3.5, 0, 0.5, 0, {});
      for (const s of [-1, 1]) { seg(B, 'wood', K.larchLt, [s * 0.4, 0.5, -1.2], [s * 0.2, 0.52, 1.3], 0.05, 0.05, { round: true }); B.box('wood', K.larchLt, 0.14, 0.02, 0.5, s * 0.18, 0.52, 1.45, { r: 0.005 }); }
      letters(B, 'NANTAI 2', { h: 0.09, x: 0, y: 0.32, z: 0, c: K.white, flat: true, wt: 0.22 });
      B.pop();
      colC(B, 0, 0, 0, 1.3, 0.6, 3.6);
    },
  };

  // ------------------------------------------------------------------------------------------ benches
  // a larch bench on granite blocks (pos = ground centre, faces +Z); o.plaque = a small brass plaque on the back rail
  D.nantai_bench = {
    desc: 'bench (a plaque optional)',
    build(B, o) {
      for (const s of [-1, 1]) B.box('paint', K.granite, 0.3, 0.42, 0.45, s * 0.7, 0.21, 0, { r: 0.04 });
      for (let i = 0; i < 3; i++) B.box('wood', K.larch, 1.8, 0.05, 0.13, 0, 0.46, -0.15 + i * 0.15, { r: 0.012 });
      for (const s of [-1, 1]) pbox(B, 'wood', K.larchDk, 0.08, 0.5, 0.08, s * 0.7, 0.7, -0.26);
      for (let i = 0; i < 2; i++) B.box('wood', K.larch, 1.8, 0.1, 0.04, 0, 0.72 + i * 0.16, -0.27, { r: 0.012 });
      if (o.plaque) {
        B.box('metal', K.brass, 0.46, 0.1, 0.012, 0, 0.8, -0.245, { r: 0.005 });
        letters(B, o.plaque, { h: 0.028, x: 0, y: 0.787, z: -0.238, c: K.grizzBrown, flat: true, wt: 0.24 });
      }
      colC(B, 0, 0, 0, 1.8, 0.55, 0.55);
    },
  };
  void kf; void THREE; void RAIL; void ccyl;
}
