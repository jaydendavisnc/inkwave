// Eco-Forest Treehills — the biome's working kit, the cover that fills the meadow, the gardens and the hills:
//   nature    granite boulders, fallen logs, shrub clumps (all cover with colliders), stepping stones, a footbridge
//   gardens   polytunnels, a tool shed, water tanks, beehives, compost bays
//   works     Alterna cargo modules, a drone pad with its drone, an antenna mast, the ranger shelter, the crown's
//             maintenance hut
// (The modules share the station's language: deep-green ribbed units, pale corner posts, chequer lids.)

export function registerWorks(D, H, T) {
  const { PI, TAU, HP, mixc, shade, latheGeo } = H;
  const { K, NS, pbox, ccyl, seg, colC, ROOF, letters, boardSign, valve, tpl, hash, puff, blob, shrub, flowerBed, evergreen } = T;

  // ------------------------------------------------------------------------------------------ nature
  // granite boulder (w × h × d): a lumpy stone, lichen on top; solid cover, its top off-limits when too tall to hop on
  const rockGeo = (seed) => tpl('throck|' + seed, () => {
    let g = H.blobGeo(1, 1, seed, 0.2, 0.78, 1.08);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { let y = P.getY(i); if (y < -0.35) y = -0.35 + (y + 0.35) * 0.2; P.setY(i, (y + 0.35) / 1.35); }
    g.computeVertexNormals();
    return g;
  });
  D.treehills_boulder = {
    desc: 'granite boulder (w × h × d, cover; its top off-limits when taller than a hop)',
    build(B, o) {
      const w = o.w ?? 1.6, h = o.h ?? 1.3, d = o.d ?? 1.3, s = (o.seed ?? 3) % 11;
      B.add('paint', rockGeo(s), mixc('#8f8c86', '#a8a49c', hash(s * 1.3)), 0, -0.06, 0, { sx: w / 2, sy: h + 0.06, sz: d / 2, ry: hash(s) * TAU });
      B.add(NS('paint'), rockGeo((s + 5) % 11), '#9a968e', w * 0.32, -0.05, d * 0.22, { sx: w * 0.2, sy: h * 0.4, sz: d * 0.2 });
      for (let k = 0; k < 3; k++) B.add(NS('foliage'), puff(0, k), '#7f8a4a', (hash(s + k) - 0.5) * w * 0.4, h * (0.85 + 0.1 * hash(k)), (hash(s * 2 + k) - 0.5) * d * 0.4, { sx: 0.18, sy: 0.05, sz: 0.14, ao: false });
      shrub(B, -w * 0.45, 0, d * 0.35, 0.6, s + 3, K.shrub, { n: 2, ns: true, flat: 0.6 });
      B.col(-w * 0.4, 0, -d * 0.4, w * 0.4, h, d * 0.4, h > 1.35 ? ROOF : undefined);
    },
  };
  // fallen log along local x (L long, 0.8 m): bark, pale cut ends with rings, moss and a fern at one end
  D.treehills_log = {
    desc: 'fallen log along local x (L long, 0.8 m tall: cover)',
    build(B, o) {
      const L = o.L ?? 4, r = 0.4;
      B.cyl('wood', K.bark, r, L, 0, r, 0, { rz: HP, seg: 12 });
      for (const s of [-1, 1]) {
        B.cyl('wood', '#c9a57a', r - 0.02, 0.03, s * (L / 2 + 0.01), r, 0, { rz: HP, seg: 12 });
        B.tor(NS('wood'), '#a6835a', r * 0.55, 0.012, s * (L / 2 + 0.03), r, 0, { ry: HP, rs: 3, ts: 14 });
      }
      for (let k = 0; k < 5; k++) B.add(NS('foliage'), puff(0, k), '#6f8a45', -L / 2 + (k + 0.5) * (L / 5), r * 1.9, (hash(k * 3) - 0.5) * 0.3, { sx: 0.3, sy: 0.07, sz: 0.2 });
      seg(B, 'wood', K.barkDk, [L * 0.2, r * 1.4, 0.1], [L * 0.28, r * 2.2, 0.35], 0.09, 0.09, { round: true });
      shrub(B, -L / 2 - 0.2, 0, 0.4, 0.7, 5, '#5d8a4a', { n: 2, ns: true });
      B.col(-L / 2, 0, -r, L / 2, 2 * r, r);
    },
  };
  // shrub clump (w wide, h tall): dense evergreen shrubs (cover; you slide off the top)
  D.treehills_shrubs = {
    desc: 'shrub clump (w wide, h tall; cover, slide-off top)',
    build(B, o) {
      const w = o.w ?? 1.6, h = o.h ?? 1.2, s = o.seed ?? 7;
      const n = 5 + (s % 3);
      for (let i = 0; i < n; i++) {
        const a = hash(s + i * 3.1) * TAU, rr = w * 0.26 * hash(s * 2 + i), r = w * (0.26 + 0.1 * hash(s * 5 + i));
        B.add('foliage', puff(1, (s + i) % 6), mixc(o.c ?? '#4f7d47', '#6f9a58', hash(s + i) * 0.6), Math.cos(a) * rr, h * 0.42 + hash(i + s) * h * 0.2, Math.sin(a) * rr, { sx: r, sy: h * 0.46, sz: r * 0.9 });
      }
      if (o.flowers) flowerBed(B, 0, h * 0.5, 0, w * 0.7, w * 0.7, 10, s * 3, { lift: h * 0.4, spread: 0.1 });
      B.col(-w * 0.38, 0, -w * 0.38, w * 0.38, h, w * 0.38, ROOF);
    },
  };
  // stepping stones across the rill (local x across it, n stones), their tops just under the garden's lawn
  D.treehills_stones = {
    desc: 'stepping stones across the rill (walkable)',
    build(B, o) {
      const n = o.n ?? 3, gap = o.gap ?? 0.55, y0 = o.y0 ?? -0.3;
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * gap, s = 0.26 + 0.05 * hash(i + (o.seed ?? 1));
        B.cyl('paint', mixc('#b4b0a6', '#9d998f', hash(i * 3)), s, 0.3, x, y0 + 0.15, (hash(i * 5) - 0.5) * 0.15, { seg: 9 });
        B.col(x - s * 0.8, y0, -s * 0.8, x + s * 0.8, y0 + 0.28, s * 0.8);
      }
    },
  };
  // footbridge over the rill: a timber deck (local x along it, L long, 1.4 wide) on two steel beams, low rails
  D.treehills_footbridge = {
    desc: 'little footbridge over the rill / the channel (local x along it; w wide, default 1.4)',
    build(B, o) {
      const L = o.L ?? 2.6, w = o.w ?? 1.4, y = o.y ?? 0.08;
      for (const z of [-w / 2 + 0.12, w / 2 - 0.12]) pbox(B, 'metal', K.steelDk, L, 0.12, 0.1, 0, y - 0.1, z);
      const nb = Math.round(L / 0.2);
      for (let i = 0; i < nb; i++) pbox(B, 'wood', i % 2 ? K.timber : shade(K.timber, 0.92), L / nb - 0.02, 0.05, w, -L / 2 + ((i + 0.5) * L) / nb, y - 0.025, 0);
      for (const z of [-w / 2 + 0.04, w / 2 - 0.04]) {
        for (const x of [-L / 2 + 0.1, 0, L / 2 - 0.1]) ccyl(B, 'metal', K.steelLt, 0.025, 0.7, x, y + 0.35, z, { seg: 6 });
        seg(B, 'metal', K.steelLt, [-L / 2 + 0.1, y + 0.7, z], [L / 2 - 0.1, y + 0.7, z], 0.04, 0.04, { round: true });
      }
      B.col(-L / 2, y - 0.2, -w / 2, L / 2, y, w / 2);
    },
  };

  // ------------------------------------------------------------------------------------------ gardens
  // polytunnel (local x along it, L long, radius R): white hoops, a milky film (pale, seams), plants inside the open
  // end, a door at the other; solid cover, its roof off-limits
  D.treehills_polytunnel = {
    desc: 'polytunnel: film-covered hoops (L × 2R), solid cover, slide-off roof',
    build(B, o) {
      const L = o.L ?? 6, R = o.R ?? 1.5, nA = 7, nL = Math.max(3, Math.round(L / 1.2));
      pbox(B, 'wood', K.timberDk, L + 0.2, 0.15, 2 * R + 0.2, 0, 0.075, 0);
      for (let i = 0; i < nA; i++) {
        const a0 = (i / nA) * PI, a1 = ((i + 1) / nA) * PI, am = (a0 + a1) / 2;
        B.push(0, 0.15, 0);
        pbox(B, 'gloss', mixc('#e9efe8', '#d7e6dd', hash(i)), L, 0.02, R * (a1 - a0) + 0.01, 0, Math.sin(am) * R, Math.cos(am) * R, { rx: -am + HP });
        B.pop();
      }
      for (let j = 0; j <= nL; j++) B.tor(NS('metal'), K.white, R + 0.02, 0.025, -L / 2 + (j * L) / nL, 0.15, 0, { ry: HP, rs: 3, ts: 14, arc: PI });
      for (const s of [-1, 1]) {
        B.push(s * (L / 2 + 0.01), 0.15, 0, s * HP);
        B.add('gloss', tpl('ptend|' + R.toFixed(2), () => H.extrudeGeo(Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * PI; return [Math.cos(a) * R, Math.sin(a) * R]; }), 0.04, 0.005)), '#dfe9e2', 0, 0, 0, { ry: -HP });
        if (s > 0) { pbox(B, 'wood', K.timber, 0.9, 1.8, 0.05, 0, 0.9, 0.03); pbox(B, NS('gloss'), '#cfe0d6', 0.7, 1.2, 0.03, 0, 1.0, 0.06); }
        B.pop();
      }
      for (let k = 0; k < Math.round(L / 1.4); k++) shrub(B, -L / 2 + 0.8 + k * 1.4, 0.15, (k % 2 - 0.5) * R * 0.6, 0.7, k + 11, '#6fa05a', { n: 2, ns: true, flat: 0.7 });
      B.col(-L / 2 - 0.1, 0, -R - 0.1, L / 2 + 0.1, R + 0.15, R + 0.1, ROOF);
    },
  };
  // module: a free-standing deep-green unit (ribs, pale posts, chequer lid) — the shed, the huts, the cargo modules
  function unit(B, w, d, h, o = {}) {
    const c = o.c ?? K.mod;
    pbox(B, 'paint', c, w, h, d, 0, h / 2, 0);
    const nr = Math.round(w / 0.5);
    for (let k = 1; k < nr; k++) for (const s of [-1, 1]) pbox(B, NS('paint'), shade(c, 1.08), 0.12, h - 0.3, 0.03, -w / 2 + (k * w) / nr, h / 2, s * (d / 2 + 0.012));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pbox(B, 'gloss', K.trim, 0.14, h + 0.02, 0.14, sx * (w / 2 - 0.05), h / 2, sz * (d / 2 - 0.05));
    pbox(B, 'metal', K.plate, w + 0.12, 0.08, d + 0.12, 0, h + 0.04, 0);
  }
  const door = (B, x, z, h = 2.0) => { pbox(B, 'gloss', K.trim, 1.0, h + 0.08, 0.05, x, (h + 0.08) / 2, z + 0.025); pbox(B, 'gloss', K.whiteSh, 0.86, h, 0.03, x, h / 2, z + 0.055); B.cyl(NS('gloss'), K.glassDk, 0.13, 0.02, x, h * 0.72, z + 0.075, { rx: HP, seg: 12 }); };
  D.treehills_shed = {
    desc: 'tool shed (a small module, door, tools rack; cover, slide-off roof)',
    build(B, o) {
      const w = o.w ?? 2.4, d = o.d ?? 2.0, h = 2.3;
      unit(B, w, d, h, { c: K.modLt });
      door(B, -0.5, d / 2);
      boardSign(B, 'TOOLS', 0.65, 1.8, { h: 0.1, z: d / 2 + 0.02, board: K.trim, c: K.modDk, pad: 0.06 });
      // a rake and spade leant on the side, a wheelbarrow
      B.push(w / 2 + 0.03, 0, 0, HP);
      for (const [x, c] of [[-0.4, K.timber], [0.1, K.timberDk]]) seg(B, 'wood', c, [x, 0.05, 0.12], [x + 0.1, 1.5, 0.03], 0.04, 0.04, { round: true });
      pbox(B, 'metal', K.steelDk, 0.22, 0.28, 0.03, -0.4, 0.14, 0.13);
      B.pop();
      B.col(-w / 2 - 0.06, 0, -d / 2 - 0.06, w / 2 + 0.06, h + 0.08, d / 2 + 0.06, ROOF);
    },
  };
  // water tank (radius r, height h): banded white drum, a valve and a pipe down, a gauge
  D.treehills_tank = {
    desc: 'irrigation water tank (r × h; cover)',
    build(B, o) {
      const r = o.r ?? 0.9, h = o.h ?? 2.0;
      B.cyl('gloss', K.white, r, h, 0, h / 2, 0, { seg: 18 });
      for (const y of [0.3, h * 0.5, h - 0.25]) B.cyl(NS('gloss'), K.mod, r + 0.012, 0.1, 0, y, 0, { seg: 18, open: true });
      B.cyl('gloss', K.whiteSh, r * 0.98, 0.12, 0, h + 0.06, 0, { seg: 18 });
      B.push(0, 0, r);
      valve(B, 0, 0.45, 0, 0.12);
      seg(B, 'metal', K.steelLt, [0, 0.45, 0.12], [0, 0.05, 0.4], 0.07, 0.07, { round: true });
      B.cyl(NS('gloss'), K.white, 0.08, 0.02, 0.3, 1.2, 0.01, { rx: HP, seg: 10 });
      B.pop();
      letters(B, 'H2O', { h: 0.18, y: h * 0.72, z: r + 0.02, c: K.modDk });
      B.col(-r * 0.9, 0, -r * 0.9, r * 0.9, h + 0.1, r * 0.9, ROOF);
    },
  };
  // beehives: n hive boxes (stacked supers, pale yellow / white) on a timber stand (cover ~1.1 m)
  D.treehills_hives = {
    desc: 'beehive boxes on a stand (n hives; low cover)',
    build(B, o) {
      const n = o.n ?? 3, sp = 0.62, W = n * sp;
      pbox(B, 'wood', K.timberDk, W + 0.1, 0.08, 0.6, 0, 0.35, 0);
      for (const x of [-W / 2, W / 2]) for (const z of [-0.25, 0.25]) pbox(B, 'wood', K.timberDk, 0.06, 0.35, 0.06, x, 0.175, z);
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + (i + 0.5) * sp, nb = 2 + (i % 2);
        for (let j = 0; j < nb; j++) pbox(B, 'paint', j % 2 ? '#efe6c2' : '#f2d98a', 0.5, 0.22, 0.46, x, 0.39 + 0.11 + j * 0.23, 0);
        pbox(B, 'gloss', K.white, 0.56, 0.06, 0.52, x, 0.39 + nb * 0.23 + 0.03, 0);
        pbox(B, NS('paint'), '#3a2d1f', 0.18, 0.02, 0.02, x, 0.42, 0.24);
      }
      B.col(-W / 2 - 0.05, 0, -0.3, W / 2 + 0.05, 1.15, 0.3);
    },
  };
  // compost bays: three slatted timber bays, dark compost, a fork (1.0 m; cover)
  D.treehills_compost = {
    desc: 'compost bays: three slatted timber bays (1.0 m; cover)',
    build(B) {
      const W = 3.3, d = 1.1, h = 1.0;
      for (let k = 0; k <= 3; k++) pbox(B, 'wood', K.timberDk, 0.08, h, d, -W / 2 + (k * W) / 3, h / 2, 0);
      for (let j = 0; j < 5; j++) pbox(B, 'wood', j % 2 ? K.timber : shade(K.timber, 0.9), W, 0.14, 0.04, 0, 0.1 + j * 0.2, -d / 2 + 0.02);
      for (let k = 0; k < 3; k++) B.add('paint', puff(0, k), k === 1 ? '#4a3a2a' : '#3b2e22', -W / 2 + (k + 0.5) * (W / 3), 0.45 + 0.1 * k, 0.05, { sx: 0.45, sy: 0.35, sz: 0.42 });
      seg(B, 'wood', K.timber, [0.9, 0.6, 0.3], [1.2, 1.5, 0.45], 0.035, 0.035, { round: true });
      B.col(-W / 2 - 0.04, 0, -d / 2, W / 2 + 0.04, h, d / 2);
    },
  };

  // ------------------------------------------------------------------------------------------ works
  // Alterna cargo module (L × 2.5 × 2.6): ribbed unit, double doors at one end, stencilled number, a valve; solid,
  // off-limits roof
  D.treehills_cargo = {
    desc: 'Alterna cargo module (L long along local x, 2.5 wide, 2.6 tall; cover, slide-off roof)',
    build(B, o) {
      const L = o.L ?? 6, d = 2.5, h = 2.6;
      unit(B, L, d, h, { c: o.c ?? K.mod });
      B.push(L / 2 + 0.02, 0, 0, HP);
      for (const s of [-1, 1]) { pbox(B, 'paint', shade(o.c ?? K.mod, 0.9), d / 2 - 0.12, h - 0.3, 0.04, s * (d / 4), h / 2, 0.02); pbox(B, NS('metal'), K.steelLt, 0.04, h - 0.6, 0.06, s * 0.1, h / 2, 0.05); }
      B.pop();
      B.push(0, 0, d / 2 + 0.02);
      boardSign(B, o.num ?? 'ALT-07', -L / 2 + 1.2, 1.9, { h: 0.2, z: 0, board: K.trim, c: K.modDk, pad: 0.08 });
      valve(B, L / 2 - 1.0, 0.9, 0.02, 0.12);
      B.pop();
      B.col(-L / 2 - 0.06, 0, -d / 2 - 0.06, L / 2 + 0.06, h + 0.08, d / 2 + 0.06, ROOF);
    },
  };
  // drone pad: a low hexagonal pad (walkable) with a parked delivery drone (its body cover)
  D.treehills_dronepad = {
    desc: 'drone landing pad (walkable, 0.15 m) with a parked delivery drone',
    build(B) {
      B.cyl('paint', K.plate, 1.6, 0.15, 0, 0.075, 0, { seg: 6 });
      B.cyl(NS('paint'), K.yellow, 1.35, 0.01, 0, 0.155, 0, { seg: 6, open: false });
      B.cyl(NS('paint'), K.plate, 1.2, 0.012, 0, 0.158, 0, { seg: 6 });
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + PI / 6; B.blink('#7fe0ff', Math.cos(a) * 1.45, 0.17, Math.sin(a) * 1.45, { size: 0.04, rate: 0.8, phase: k, lo: 0.4, hi: 4 }); }
      // the drone: a body, four arms with rotors, a cargo pod
      B.push(0, 0.15, 0);
      pbox(B, 'gloss', K.white, 0.7, 0.22, 0.7, 0, 0.45, 0);
      pbox(B, 'gloss', K.mod, 0.5, 0.3, 0.5, 0, 0.2, 0);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + PI / 4, x = Math.cos(a) * 0.62, z = Math.sin(a) * 0.62;
        seg(B, 'metal', K.steelLt, [0, 0.48, 0], [x, 0.52, z], 0.05, 0.05);
        B.cyl('gloss', K.dark, 0.3, 0.02, x, 0.58, z, { seg: 12 });
        ccyl(B, 'metal', K.steelDk, 0.04, 0.3, x, 0.4, z, { seg: 6 });
      }
      B.blink('#ff4a3a', 0, 0.58, 0.36, { size: 0.03, rate: 1.1 });
      B.pop();
      B.col(-1.3, 0, -1.3, 1.3, 0.15, 1.3);
      B.col(-0.4, 0.15, -0.4, 0.4, 0.8, 0.4, ROOF);
    },
  };
  // antenna mast: a lattice tower (h) with two dish antennas and a blinking tip, on a plinth (its plinth collides)
  D.treehills_mast = {
    desc: 'antenna mast: lattice tower with dishes and a blinking tip',
    build(B, o) {
      const h = o.h ?? 8;
      pbox(B, 'paint', K.modDk, 0.9, 0.4, 0.9, 0, 0.2, 0);
      const legs = [[-0.25, -0.25], [0.25, -0.25], [0.25, 0.25], [-0.25, 0.25]];
      for (const [x, z] of legs) seg(B, 'metal', K.steelLt, [x, 0.4, z], [x * 0.3, h, z * 0.3], 0.05, 0.05, { round: true });
      for (let y = 1.0; y < h - 0.5; y += 0.9) { const k = 1 - (y / h) * 0.7; for (let i = 0; i < 4; i++) { const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 4]; seg(B, NS('metal'), K.steelLt, [ax * k, y, az * k], [bx * k, y + 0.45, bz * k], 0.025, 0.025); } }
      for (const [y, a] of [[h * 0.62, 0.6], [h * 0.8, 2.4]]) { B.push(0, y, 0, a, -0.2); B.add('gloss', tpl('mdish', () => latheGeo([[0, 0], [0.25, 0.03], [0.42, 0.1], [0.44, 0.12], [0, 0.04]], 14)), K.white, 0, 0, 0.25, { rx: HP }); B.pop(); }
      B.blink('#ff4a3a', 0, h + 0.1, 0, { size: 0.07, rate: 0.6, lo: 0.3, hi: 6 });
      B.col(-0.45, 0, -0.45, 0.45, 0.4, 0.45);
      B.col(-0.3, 0.4, -0.3, 0.3, h, 0.3, ROOF);
    },
  };
  // ranger shelter: a small module cabin with a porch roof on posts, a bench, a notice board and the weather vane
  D.treehills_ranger = {
    desc: 'ranger shelter: module cabin with a porch roof, bench, notice board (cover, slide-off roof)',
    build(B) {
      const w = 3.0, d = 2.4, h = 2.4;
      B.push(0, 0, -0.5);
      unit(B, w, d, h, { c: K.mod });
      door(B, 0.6, d / 2);
      pbox(B, 'gloss', K.glassDk, 0.9, 0.6, 0.03, -0.7, 1.5, d / 2 + 0.02);
      pbox(B, 'glow', K.screen, 0.84, 0.18, 0.01, -0.7, 1.35, d / 2 + 0.04, { glow: 0.6 });
      boardSign(B, 'RANGER · BIOME 07', 0, h - 0.3, { h: 0.11, z: d / 2 + 0.02, board: K.trim, c: K.modDk, pad: 0.06 });
      B.pop();
      // porch roof on two posts in front, a bench under it
      for (const x of [-1.4, 1.4]) ccyl(B, 'metal', K.steelLt, 0.05, 2.3, x, 1.15, 1.6, { seg: 8 });
      B.push(0, 2.35, 1.0, 0, 0.12);
      pbox(B, 'metal', K.plate, w + 0.2, 0.08, 1.6, 0, 0, 0);
      B.pop();
      pbox(B, 'gloss', K.trim, 1.6, 0.07, 0.4, -0.2, 0.44, 1.05);
      for (const x of [-0.85, 0.45]) pbox(B, 'paint', K.modDk, 0.06, 0.42, 0.36, x, 0.21, 1.05);
      B.col(-w / 2 - 0.06, 0, -0.5 - d / 2 - 0.06, w / 2 + 0.06, h + 0.1, -0.5 + d / 2 + 0.06, ROOF);
      B.col(-w / 2 - 0.1, 2.3, 0.2, w / 2 + 0.1, 2.6, 1.8, ROOF);
      for (const x of [-1.4, 1.4]) B.col(x - 0.07, 0, 1.53, x + 0.07, 2.3, 1.67);
    },
  };
  // the crown's maintenance hut (small module by the turbine: door, vents, a light)
  D.treehills_hut = {
    desc: 'maintenance hut (small module: door, vent, lamp; cover, slide-off roof)',
    build(B, o) {
      const w = o.w ?? 2.2, d = o.d ?? 2.0, h = 2.3;
      unit(B, w, d, h, { c: K.modDk });
      door(B, -0.35, d / 2);
      pbox(B, 'metal', K.steel, 0.5, 0.4, 0.04, 0.65, 1.6, d / 2 + 0.02);
      pbox(B, 'glow', K.lamp, 0.24, 0.08, 0.08, -0.35, 2.2, d / 2 + 0.06, { glow: 1.6 });
      letters(B, 'T-07', { h: 0.14, x: 0.65, y: 1.1, z: d / 2 + 0.02, c: K.label });
      B.col(-w / 2 - 0.06, 0, -d / 2 - 0.06, w / 2 + 0.06, h + 0.08, d / 2 + 0.06, ROOF);
    },
  };
}
