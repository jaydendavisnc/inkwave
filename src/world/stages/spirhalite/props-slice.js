// Spirhalite Islands — the slice (the Long Stages stretch, 2026-09-30): the tide-pool islet's rope bridge, the ruined
// watch-post on its rock shelf and the rock pools round it; Deep Cut's dig in the bend (spoil heaps, a sieve on
// trestles, a wheelbarrow, timber shoring and a ladder in the trench); the supply drop on the spit's root; the ford's
// stepping stones. (Prop builders; see props.js for the contract.)
export function registerSlice(D, H, X) {
  const { THREE, K, PI, TAU, HP, NS, meshGeo, tpl, pbox, colBox, ROOF, RAIL, noise3, fbm3, rng, lerp, clamp, col3, rockGeo } = X;
  const rod = (B, mat, c, a, b, r, radial = 6) => B.tube(mat, c, [a, b], r, { radial });
  // a rope between two points, sagging (s = sag at the middle)
  const rope = (B, a, b, sag, r = 0.022) => {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) - sag * 4 * t * (1 - t), lerp(a[2], b[2], t)]); }
    B.tube(NS('wood'), K.rope, pts, r, { radial: 5 });
    return pts;
  };
  const post = (B, x, y, z, h, R0, r = 0.08) => {
    const lean = (R0() - 0.5) * 0.08;
    B.cyl('wood', R0() < 0.5 ? K.drift : K.driftDk, r, h, x, y + h / 2, z, { r2: r * 0.8, rz: lean, seg: 7 });
    B.cyl(NS('wood'), K.rope, r + 0.012, 0.08, x, y + h - 0.18, z, { seg: 7 });
    B.cyl(NS('wood'), K.rope, r + 0.012, 0.06, x, y + h * 0.45, z, { seg: 7 });
  };

  // ============================================================================================== the rope bridge
  // Dressing for the level's rope-bridge deck (a thin plank ramp, w wide, from its foot (local z 0, y0) to its top
  // (local z L, y1) on the tide-pool islet's shelf): stout driftwood anchor posts at both ends lashed with rope, two
  // handrail ropes a side sagging between them, suspender ropes down to the deck's edge ropes (the netting), cross
  // lashings under the deck, a coil of spare rope. The handrails are rails (kids blocked; shots, ink and squids pass).
  D.spirhalite_ropebridge = {
    desc: 'rope bridge dressing: anchor posts, sagging handrail ropes (rails), suspender netting, edge ropes, lashings',
    params: { L: 'length along local z (foot → top)', y0: 'foot deck height', y1: 'top deck height', w: 'deck width' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.L ?? 8, y0 = o.y0 ?? 0, y1 = o.y1 ?? 1.3, w = o.w ?? 2.2, R0 = rng(o.seed ?? 61);
      const deck = (z) => y0 + (y1 - y0) * clamp(z / L, 0, 1);
      const hw = w / 2 + 0.12, h = 1.25;
      // anchor posts (two at each end, just outside the deck) and a lashed cross-bar at the top end
      for (const sd of [-1, 1]) {
        post(B, sd * hw, y0 - 0.3, -0.35, h + 0.55, R0, 0.1);
        post(B, sd * hw, y1 - 0.3, L + 0.3, h + 0.5, R0, 0.1);
        colBox(B, sd * hw, y0 - 0.3, -0.35, 0.24, h + 0.55, 0.24);
        colBox(B, sd * hw, y1 - 0.3, L + 0.3, 0.24, h + 0.5, 0.24);
      }
      rod(B, 'wood', K.driftDk, [-hw, y1 + h + 0.05, L + 0.3], [hw, y1 + h + 0.05, L + 0.3], 0.06);
      // handrails: an upper and a lower rope a side, sagging; the edge rope along the deck; suspenders between them
      for (const sd of [-1, 1]) {
        const x = sd * hw;
        const up = rope(B, [x, y0 + h, -0.35], [x, y1 + h, L + 0.3], 0.28, 0.028);
        rope(B, [x, y0 + h * 0.55, -0.35], [x, y1 + h * 0.55, L + 0.3], 0.2, 0.02);
        const edge = [];
        for (let i = 0; i <= 8; i++) { const z = -0.2 + (i / 8) * (L + 0.4); edge.push([sd * (w / 2 + 0.02), deck(z) + 0.04, z]); }
        B.tube(NS('wood'), K.rope, edge, 0.03, { radial: 5 });
        const n = Math.round(L / 0.55);
        for (let i = 1; i < n; i++) {
          const t = i / n, z = lerp(-0.35, L + 0.3, t), yU = lerp(y0 + h, y1 + h, t) - 0.28 * 4 * t * (1 - t);
          rod(B, NS('wood'), K.rope, [x, yU, z], [sd * (w / 2 + 0.02), deck(z) + 0.04, z], 0.009, 3);
          if (i % 2) rod(B, NS('wood'), K.rope, [x, yU - 0.15, z], [sd * (w / 2 + 0.02), deck(z + 0.5) + 0.05, z + 0.5], 0.007, 3);
        }
        void up;
        // rails: stepped boxes following the deck (kids blocked at the edge; shots and squids pass)
        const k = 4;
        for (let i = 0; i < k; i++) {
          const za = -0.2 + (i / k) * (L + 0.4), zb = -0.2 + ((i + 1) / k) * (L + 0.4);
          B.col(x - 0.08, deck(za) - 0.1, za, x + 0.08, deck(zb) + 1.05, zb, RAIL);
        }
      }
      // cross lashings under the deck and the plank ends showing at its edges
      const nL = Math.round(L / 0.9);
      for (let i = 0; i <= nL; i++) {
        const z = 0.2 + (i / nL) * (L - 0.4);
        pbox(B, NS('wood'), K.woodDk, w + 0.12, 0.05, 0.14, 0, deck(z) - 0.24, z, { rx: -Math.atan2(y1 - y0, L) });
      }
      B.tor(NS('wood'), K.rope, 0.22, 0.05, hw + 0.45, y1 + 0.06, L + 0.7, { rx: HP, ts: 12, rs: 5 });
    },
  };

  // ============================================================================================== the watch-post
  // Dressing for the ruined watch-post (the level's post box: w × d, from the shelf `y0` up to its floor `y1`, its broken
  // parapet walls on the north and east): a projecting base course, quoins, a blocked doorway with a carved lintel on
  // its south face, a band of glyph roundels under the floor's edge, broken courses along the walls' tops, the old
  // beacon — a stone fire bowl on a drum in the parapet's corner (cover; roof) — Deep Cut's pennant and a survey camera. Local frame: the post's centre at the shelf's top.
  D.spirhalite_watchpost = {
    desc: 'ruined watch-post dressing: base course, quoins, blocked door, glyph band, broken wall tops, beacon bowl (roof collider), pennant',
    params: { w: 'post x size', d: 'post z size', y0: 'shelf top (base)', y1: 'post floor' }, variants: 1, mount: 'ground',
    build(B, o) {
      const w = o.w ?? 3.4, d = o.d ?? 3.8, h = (o.y1 ?? 2.5) - (o.y0 ?? 1.3), R0 = rng(o.seed ?? 77);
      const hw = w / 2, hd = d / 2;
      // base course (a plinth band 0.1 proud), a string course under the floor
      pbox(B, 'rubber', K.stoneDk, w + 0.2, 0.28, d + 0.2, 0, 0, 0);
      pbox(B, 'rubber', K.stoneLt, w + 0.12, 0.12, d + 0.12, 0, h - 0.2, 0);
      // quoins: alternating long/short blocks just proud of each corner
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) {
        const y = 0.3 + i * 0.3, lng = i % 2 === 0;
        pbox(B, 'rubber', i % 2 ? K.stone : K.stoneLt, lng ? 0.55 : 0.3, 0.26, lng ? 0.3 : 0.55, sx * (hw - (lng ? 0.25 : 0.12) + 0.03), y, sz * (hd - (lng ? 0.12 : 0.25) + 0.03));
      }
      // the blocked doorway on its south face: jambs, a carved lintel, the fill of rough blocks
      pbox(B, 'rubber', K.stoneLt, 0.2, 0.9, 0.08, -0.55, 0.05, -hd - 0.02);
      pbox(B, 'rubber', K.stoneLt, 0.2, 0.9, 0.08, 0.35, 0.05, -hd - 0.02);
      pbox(B, 'rubber', K.stone, 1.25, 0.22, 0.1, -0.1, 0.92, -hd - 0.03);
      for (let i = 0; i < 3; i++) B.tor(NS('rubber'), K.stoneDk, 0.07, 0.018, -0.45 + i * 0.35, 1.03, -hd - 0.08, { ts: 10, rs: 4 });
      for (let i = 0; i < 4; i++) pbox(B, 'rubber', i % 2 ? K.stoneDk : K.rockDk, 0.34, 0.2, 0.05, -0.34 + (i % 2) * 0.36, 0.1 + Math.floor(i / 2) * 0.35, -hd - 0.01);
      // glyph roundels round the band under the floor (west and south faces: the faces you walk up to)
      for (let i = 0; i < 4; i++) {
        const z = -hd + 0.5 + i * ((d - 1) / 3);
        B.tor(NS('rubber'), K.stoneLt, 0.12, 0.02, -hw - 0.02, h - 0.42, z, { ry: HP, ts: 12, rs: 4 });
        B.tor(NS('rubber'), K.stoneLt, 0.05, 0.015, -hw - 0.03, h - 0.42, z, { ry: HP, ts: 10, rs: 4 });
      }
      // broken courses along the parapet tops (the walls: north x −hw…−hw+1 and +hw−1.4…+hw, east x +hw−0.5…+hw)
      const brk = (x0, x1, z0, z1, y, n) => {
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n, x = lerp(x0, x1, t), z = lerp(z0, z1, t), s = 0.3 + R0() * 0.25;
          B.add('rubber', rockGeo(500 + i + Math.round(x * 7), 0, 1.3, 0.55, 1.0, 0.25), i % 2 ? K.stone : K.stoneLt, x, y, z, { s, ry: R0() * TAU, ao: false });
        }
      };
      brk(-hw + 0.1, -hw + 0.9, hd - 0.25, hd - 0.25, h + 0.9, 3);
      brk(hw - 1.3, hw - 0.1, hd - 0.25, hd - 0.25, h + 0.9, 3);
      brk(hw - 0.25, hw - 0.25, hd - 0.6, -hd + 0.3, h + 0.9, 5);
      // the beacon: a stone fire bowl on a drum in the parapet's north-east corner (old soot, a crust of salt)
      const bx = hw - 1.05, bz = hd - 0.95;
      B.cyl('rubber', K.stoneDk, 0.3, 0.5, bx, h + 0.25, bz, { r2: 0.36, seg: 12 });
      B.lathe('rubber', K.stone, [[0.05, 0], [0.26, 0.02], [0.46, 0.18], [0.52, 0.36], [0.46, 0.38], [0.3, 0.26], [0, 0.24]], bx, h + 0.5, bz, { seg: 16 });
      B.cyl(NS('rubber'), '#35302b', 0.4, 0.02, bx, h + 0.76, bz, { seg: 14 });
      // Deep Cut hung a storm lantern in the old beacon's bowl: the watch-post's light at dusk
      B.cyl('metal', K.steelDk, 0.08, 0.05, bx, h + 0.78, bz);
      B.cyl('glow', K.glow, 0.07, 0.2, bx, h + 0.9, bz, { glow: 1.7, seg: 10 });
      B.cyl('metal', K.steelDk, 0.085, 0.05, bx, h + 1.02, bz);
      B.tor('metal', K.steelDk, 0.07, 0.008, bx, h + 1.1, bz, { ts: 10 });
      colBox(B, bx, h, bz, 0.95, 0.9, 0.95, ROOF);
      // the upper storey's broken stub (level pieces, local boxes [x0, x1, z0, z1, y0, y1] from the post's centre and the
      // shelf's top): a string course, jagged broken courses along its top, an arched window in its north face, moss
      // in the joints; Deep Cut's pennant on a pole lashed to its top (the landmark seen from mid)
      for (const [x0, x1, z0, z1, y0, y1] of o.stub || []) {
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = x1 - x0, sz = z1 - z0;
        pbox(B, 'rubber', K.stoneLt, sx + 0.08, 0.14, sz + 0.08, cx, y0 + (y1 - y0) * 0.45, cz);
        const n = Math.max(2, Math.round(Math.max(sx, sz) / 0.45));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n, x = sx > sz ? lerp(x0, x1, t) : cx, z = sx > sz ? cz : lerp(z0, z1, t), s = 0.26 + R0() * 0.2;
          B.add('rubber', rockGeo(560 + i + Math.round(y1 * 3), 0, 1.2, 0.7, 1.0, 0.25), i % 2 ? K.stone : K.stoneLt, x, y1 - 0.12 - R0() * 0.25 * (i % 3 === 1 ? 1 : 0), z, { s, ry: R0() * TAU, ao: false });
        }
        B.add(NS('foliage'), rockGeo(580 + Math.round(y1), 1, 0.9, 0.3, 0.7, 0.2), K.moss, cx, y1 - 0.05, cz, { s: Math.min(sx, sz) * 0.6, ao: false });
      }
      const top = (o.stub || [])[0];
      if (top) {
        const [x0, x1, , z1, y0, y1] = top, wx = (x0 + x1) / 2, wy = y0 + (y1 - y0) * 0.62;
        pbox(B, NS('rubber'), '#3a3631', 0.5, 0.75, 0.02, wx, wy - 0.4, z1 + 0.012);
        B.cyl(NS('rubber'), '#3a3631', 0.25, 0.02, wx, wy + 0.35, z1 + 0.012, { rx: HP, seg: 12 });
        pbox(B, 'rubber', K.stoneLt, 0.64, 0.1, 0.06, wx, wy - 0.48, z1 + 0.03);
        B.cyl('metal', K.steelLt, 0.03, 1.9, wx + 0.35, y1 + 0.95, (top[2] + z1) / 2);
        B.flag(wx + 0.35, y1 + 1.75, (top[2] + z1) / 2, { color: K.dc1 });
      }
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.4; rod(B, 'metal', K.steelDk, [-0.6 + Math.cos(a) * 0.35, h, -0.6 + Math.sin(a) * 0.35], [-0.6, h + 1.15, -0.6], 0.018, 5); }
      B.box('gloss', K.black, 0.22, 0.16, 0.14, -0.6, h + 1.26, -0.6, { r: 0.02 });
      B.cyl('gloss', K.glass, 0.05, 0.1, -0.6, h + 1.27, -0.52, { rx: HP, seg: 10 });
    },
  };

  // ============================================================================================== rock pools
  // A tide pool in a rim of barnacled rock: still water (glossy, dark teal to turquoise at the edge), weed and anemones,
  // a starfish, periwinkles. Flat on the ground (no collider: the rim's stones are ankle-high).
  const poolGeo = (w, d, seed) => tpl(`pool|${w}|${d}|${seed}`, () => {
    const n = 20, pos = [0, 0, 0], idx = [], col = [0.14, 0.34, 0.36];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, k = 1 + 0.16 * noise3(Math.cos(a) * 1.7 + seed, Math.sin(a) * 1.7, seed * 0.3);
      pos.push(Math.cos(a) * w * 0.5 * k, 0, Math.sin(a) * d * 0.5 * k); col.push(0.3, 0.6, 0.58);
    }
    for (let i = 0; i < n; i++) idx.push(0, 1 + ((i + 1) % n), 1 + i);
    return meshGeo(pos, idx, col);
  });
  D.spirhalite_rockpool = {
    desc: 'a tide pool in a rim of barnacled rock: glossy water, weed, anemones, a starfish, periwinkles (no collider)',
    params: { w: 'x size', d: 'z size', seed: 'shape' }, variants: 1, mount: 'ground',
    build(B, o) {
      const w = o.w ?? 1.6, d = o.d ?? 1.1, seed = o.seed ?? 3, R0 = rng(seed * 17 + 5);
      B.add(NS('gloss'), poolGeo(w, d, seed), 'white', 0, 0.035, 0);
      const n = Math.max(7, Math.round((w + d) * 3.2));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + R0() * 0.3, k = 1.05 + 0.12 * R0(), s = 0.13 + R0() * 0.14;
        B.add('rubber', rockGeo(600 + ((seed * 7 + i) % 23), 0, 1.2, 0.55, 1.0, 0.3), R0() < 0.6 ? K.rock : K.rockDk, Math.cos(a) * w * 0.5 * k, 0.02, Math.sin(a) * d * 0.5 * k, { s, ry: R0() * TAU, ao: false });
      }
      for (let i = 0; i < 4; i++) {   // weed strands and anemones in the water, periwinkles on the rim
        const a = R0() * TAU, r = 0.25 + R0() * 0.4;
        B.sph(NS('gloss'), i % 2 ? '#b8473e' : '#6d8a4a', 0.045, Math.cos(a) * w * 0.5 * r, 0.03, Math.sin(a) * d * 0.5 * r, { half: true, ws: 7, hs: 3 });
        B.tube(NS('foliage'), '#4d6334', [[Math.cos(a + 1) * w * 0.3, 0.035, Math.sin(a + 1) * d * 0.3], [Math.cos(a + 1.2) * w * 0.38, 0.04, Math.sin(a + 1.3) * d * 0.4]], 0.02, { radial: 3 });
      }
      const sa = R0() * TAU;   // a starfish
      for (let i = 0; i < 5; i++) { const a = sa + (i / 5) * TAU; pbox(B, NS('rubber'), K.orange, 0.13, 0.025, 0.035, Math.cos(sa) * w * 0.18 + Math.cos(a) * 0.06, 0.035, Math.sin(sa) * d * 0.18 + Math.sin(a) * 0.06, { ry: -a }); }
      for (let i = 0; i < 6; i++) { const a = R0() * TAU; B.sph(NS('rubber'), '#3c3a36', 0.025, Math.cos(a) * w * 0.52, 0.09, Math.sin(a) * d * 0.52, { ws: 5, hs: 4 }); }
    },
  };

  // ============================================================================================== the dig
  // a spoil heap: sand and rubble dug out of the trench, a shovel stuck in it, a plank (cover: collider)
  D.spirhalite_spoil = {
    desc: 'a heap of dug sand and rubble with a shovel stuck in it (cover collider)', params: { L: 'length (local x)', W: 'width', h: 'height', seed: 'shape', nocol: 'no collider (dressing against a level piece)' },
    variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.L ?? 2.6, W = o.W ?? 1.5, h = o.h ?? 1.05, seed = o.seed ?? 9, R0 = rng(seed * 5 + 1);
      B.add('rubber', rockGeo(700 + seed, 2, L * 0.5, h, W * 0.5, 0.16), '#c7b492', 0, -0.02, 0, { ao: false });   // (dug sand: darker and damper than the dunes)
      B.add(NS('rubber'), rockGeo(710 + seed, 1, L * 0.36, h * 0.35, W * 0.4, 0.3), '#b8a483', R0() * 0.3, h * 0.72, 0, { ao: false });
      for (let i = 0; i < 4; i++) B.add('rubber', rockGeo(720 + i, 0, 1.3, 0.6, 1.0, 0.3), i % 2 ? K.stone : K.stoneDk, (R0() - 0.5) * L * 0.8, 0.02, (R0() < 0.5 ? -1 : 1) * W * (0.35 + R0() * 0.15), { s: 0.16 + R0() * 0.14, ry: R0() * TAU, ao: false });
      // the shovel: a handle leaning out of the heap's shoulder, its blade buried
      const sx = L * 0.18, sz = W * 0.1;
      rod(B, 'wood', K.wood, [sx, h * 0.55, sz], [sx + 0.35, h + 0.75, sz + 0.2], 0.025);
      pbox(B, 'metal', K.steelDk, 0.28, 0.05, 0.05, sx + 0.37, h + 0.77, sz + 0.21, { ry: 0.5 });
      pbox(B, 'wood', K.drift, 1.5, 0.04, 0.2, -L * 0.25, 0.04, W * 0.62, { ry: 0.2 });
      if (!o.nocol) colBox(B, 0, 0, 0, L * 0.72, h * 0.92, W * 0.62);
      B.blob(L * 1.1, W * 1.2);
    },
  };
  // the sieve: a frame of mesh on two trestles over a heap of sifted sand, buckets and a trowel (cover: collider)
  D.spirhalite_sieve = {
    desc: 'a sieve frame on trestles over sifted sand, buckets, a trowel (collider)', params: {}, variants: 1, mount: 'ground',
    build(B) {
      for (const sx of [-0.62, 0.62]) {
        for (const sz of [-1, 1]) rod(B, 'wood', K.woodDk, [sx, 0, sz * 0.4], [sx, 0.88, 0], 0.03, 5);
        pbox(B, 'wood', K.woodDk, 0.08, 0.06, 0.7, sx, 0.84, 0);
      }
      // the sieve: a timber frame tilted a little, the mesh a fence-material plane
      B.push(0, 0.92, 0, 0, 0, -0.08);
      for (const sz of [-1, 1]) pbox(B, 'wood', K.wood, 1.6, 0.08, 0.06, 0, 0, sz * 0.42);
      for (const sx of [-1, 1]) pbox(B, 'wood', K.wood, 0.06, 0.08, 0.9, sx * 0.8, 0, 0);
      B.add(NS('fence'), tpl('sievemesh', () => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-HP); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3)); return g; }), K.steelDk, 0, 0.03, 0, { sx: 1.55, sz: 0.8, uvs: [18, 9] });
      B.add(NS('rubber'), rockGeo(733, 1, 0.45, 0.12, 0.28, 0.3), K.sandDk, 0.2, 0.04, 0, { ao: false });
      B.pop();
      B.add('rubber', rockGeo(734, 1, 0.7, 0.28, 0.45, 0.2), K.sand, 0.05, -0.02, 0.05, { ao: false });
      for (const [x, z, c] of [[1.05, 0.35, K.orange], [-1.0, -0.4, K.dc1]]) {
        B.cyl('rubber', c, 0.17, 0.3, x, 0.15, z, { r2: 0.14, seg: 12, open: true });
        B.cyl(NS('rubber'), K.sandDk, 0.15, 0.02, x, 0.24, z, { seg: 10 });
        B.tor(NS('metal'), K.steelDk, 0.15, 0.008, x, 0.36, z, { rx: HP, arc: PI, ts: 8 });
      }
      pbox(B, 'metal', K.steelLt, 0.1, 0.01, 0.06, -0.55, 0.3, 0.52, { ry: 0.6 });
      colBox(B, 0, 0, 0, 1.75, 0.98, 0.95);
      B.blob(2.2, 1.3);
    },
  };
  // a wheelbarrow full of sand (low collider)
  D.spirhalite_barrow = {
    desc: 'a wheelbarrow of sand (collider)', params: {}, variants: 1, mount: 'ground',
    build(B) {
      B.push(0, 0, 0, 0, 0, 0.06);
      B.lathe('metal', K.dc2, [[0.02, 0], [0.42, 0.02], [0.5, 0.36], [0.46, 0.38]], 0.1, 0.36, 0, { seg: 4, sx: 1.25, ry: PI / 4 });
      B.add(NS('rubber'), rockGeo(741, 1, 0.5, 0.18, 0.36, 0.25), K.sandDk, 0.1, 0.66, 0, { ao: false });
      B.pop();
      for (const sz of [-1, 1]) rod(B, 'metal', K.steelDk, [0.62, 0.2, sz * 0.12], [-0.95, 0.62, sz * 0.3], 0.022);
      for (const sz of [-1, 1]) rod(B, 'metal', K.steelDk, [-0.2, 0.36, sz * 0.25], [-0.25, 0, sz * 0.25], 0.018);
      B.cyl('rubber', K.black, 0.2, 0.08, 0.72, 0.2, 0, { rx: HP, seg: 12 });
      colBox(B, 0, 0, 0, 1.3, 0.7, 0.7);
    },
  };
  // timber shoring on a trench wall (local +x along the wall, the wall at local z 0, the trench at +z): posts driven in
  // every 1.3 m, three rows of boards; flush with the wall (no collider)
  D.spirhalite_shoring = {
    desc: 'timber shoring boards + posts on a trench wall along local +x (no collider)', params: { L: 'length', h: 'wall height (m, down from 0)' },
    variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.L ?? 4, h = o.h ?? 1.0, n = Math.max(2, Math.round(L / 1.3)), R0 = rng(o.seed ?? 31);
      for (let i = 0; i <= n; i++) pbox(B, 'wood', K.woodDk, 0.12, h + 0.25, 0.1, (i / n) * L, -h, 0.07);
      for (let r = 0; r < 3; r++) pbox(B, 'wood', r % 2 ? K.wood : K.drift, L + 0.1, 0.24, 0.04, L / 2 + (R0() - 0.5) * 0.08, -h + 0.08 + r * 0.3, 0.02);
    },
  };
  // a timber ladder leaning on a trench wall (visual)
  D.spirhalite_ladder = {
    desc: 'a timber ladder leaning on a trench wall (visual)', params: { h: 'height' }, variants: 1, mount: 'ground',
    build(B, o) {
      const h = o.h ?? 1.6, lean = 0.35;
      for (const sx of [-0.22, 0.22]) rod(B, 'wood', K.wood, [sx, 0, lean], [sx, h, 0], 0.03, 5);
      for (let i = 1; i < 6; i++) { const t = i / 6; rod(B, NS('wood'), K.woodDk, [-0.22, h * t, lean * (1 - t)], [0.22, h * t, lean * (1 - t)], 0.02, 4); }
    },
  };

  // ============================================================================================== the supply drop
  // A pallet of Deep Cut crates dropped by the helicopter on the spit's root, still in its cargo net, the parachute
  // collapsed over the dune behind it in orange and white gores, its rigging lines trailing (cover: the crate stack).
  D.spirhalite_supplydrop = {
    desc: 'airdropped pallet of crates in a cargo net, the collapsed parachute draped behind it, rigging lines (collider)',
    params: { seed: 'folds' }, variants: 1, mount: 'ground',
    build(B, o) {
      const R0 = rng((o.seed ?? 5) * 3 + 1);
      pbox(B, 'wood', K.wood, 1.5, 0.14, 1.3, 0, 0, 0);
      X.crate(B, -0.3, 0.14, -0.25, 1.0, 0.05); X.crate(B, 0.32, 0.14, 0.3, 0.95, -0.08); X.crate(B, -0.05, 0.94, 0.05, 0.9, 0.12);
      B.add(NS('fence'), tpl('dropnet', () => { const g = new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, PI / 2); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(1), 3)); return g; }), K.rope, 0, 0.12, 0, { sx: 0.95, sy: 1.62, sz: 0.85, uvs: [7, 4] });
      // the canopy: a crumpled sheet lying over the ground behind the pallet (local −z), its gores banded orange/white
      B.add('foliage', tpl('chute', () => {
        const nx = 12, nz = 9, pos = [], idx = [], col = [], cO = col3(K.orange), cW = col3(K.white), c = new THREE.Color();
        for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
          const u = i / nx - 0.5, v = j / nz, x = u * 3.4 * (0.7 + 0.3 * v), z = -0.9 - v * 2.6;
          const y = 0.04 + Math.max(0, 0.55 * Math.sin(v * PI) * (1 - Math.abs(u) * 1.4)) + 0.12 * Math.sin(i * 1.9 + j * 1.3) + 0.08 * noise3(i * 0.7, j * 0.7, 3);
          pos.push(x, Math.max(0.03, y), z);
          c.copy(Math.floor((u + 0.5) * 6) % 2 ? cO : cW).multiplyScalar(0.85 + 0.15 * Math.sin(i * 2.3 + j));
          col.push(c.r, c.g, c.b);
        }
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
        return meshGeo(pos, idx, col);
      }), 'white', 0, 0, 0);
      for (let i = 0; i < 6; i++) { const x = (i / 5 - 0.5) * 2.6; rod(B, NS('rubber'), K.white, [x * 0.8, 0.12, -1.0], [x * 0.2, 1.2, -0.45], 0.006, 3); }
      for (let i = 0; i < 3; i++) B.tube(NS('rubber'), K.white, [[0.5 + i * 0.2, 0.03, 0.6], [1.2 + R0() * 0.4, 0.03, 1.1 + i * 0.3], [1.9 + R0() * 0.4, 0.03, 0.9 + i * 0.4]], 0.006, { radial: 3 });
      colBox(B, 0, 0, 0, 1.55, 1.7, 1.35);
      B.blob(2.2, 2.0);
    },
  };

  // ============================================================================================== the ford
  // stepping stones across the ford: flat, worn, wet (no collider — they sit in the sand, ankle high)
  D.spirhalite_stones = {
    desc: 'flat stepping stones along the ford (no collider)', params: { pts: '[[x, z], …] local' }, variants: 1, mount: 'ground',
    build(B, o) {
      const R0 = rng(o.seed ?? 13);
      for (const [x, z] of o.pts || [[0, 0], [0.8, 0.6], [1.5, 1.4]]) B.add('rubber', rockGeo(760 + Math.floor(R0() * 9), 1, 1.2, 0.3, 1.0, 0.2), R0() < 0.5 ? K.stoneWet : K.rockDk, x, 0.0, z, { s: 0.32 + R0() * 0.12, ry: R0() * TAU, ao: false });
    },
  };
}
