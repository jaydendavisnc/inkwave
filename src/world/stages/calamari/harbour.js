// Calamari County — the harbour (owner: the calamari stage): quay edges (coping, fenders, ladders, bollards, rime),
// fishing boats (moored in the basin or hauled up on blocks), fish-box stacks, net heaps, glass floats, seaweed drying
// racks, the breakwater light, the slipway winch, ice.
export function registerHarbour(D, H, KIT) {
  const { K, NS, pbox, cylGeo, colBox, colRun, ROOF, RAIL, snowCap, drift, icicles, letters, hash, shade, mixc, extr, pillowGeo, HP, PI, P3, TAU, THREE, tpl, kf } = KIT;

  // ------------------------------------------------------------------------------------------ quay edge
  // along local +X from pos (length L), the water on local +Z: granite coping over the edge, the quay wall face down to
  // the sea, tyre fenders, iron ladders, bollards on the coping, rime ice at the waterline. Bollards collide (low).
  D.calamari_quayedge = {
    desc: 'Quay edge along local +X (length L; the water on local +Z, the deck top at y): granite coping, wall face down to the sea with rime ice, tyre fenders, ladders, bollards (collide, low).',
    params: { length: 'm', y: 'deck top', bollards: '[x]', ladders: '[x]', fenders: 'spacing', drop: 'wall height below y' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.length ?? 10, y = o.y ?? 0, drop = o.drop ?? 1.9;
      // coping: rounded granite stones along the edge (flush with the deck)
      const n = Math.max(1, Math.round(L / 1.2));
      for (let i = 0; i < n; i++) B.box(i % 2 ? 'paint' : NS('paint'), mixc(K.granite, K.stoneLt, hash(i + L)), L / n - 0.03, 0.14, 0.5, (i + 0.5) * (L / n), y - 0.05, -0.23, { r: 0.04 });
      // the wall face (dark wet stone) and a white rime band at the waterline
      pbox(B, 'paint', '#56585a', L, drop, 0.06, L / 2, y - drop / 2, 0.02);
      pbox(B, NS('gloss'), K.ice, L, 0.18, 0.08, L / 2, y - drop + 0.18, 0.04);
      pbox(B, NS('paint'), '#3d4a45', L, 0.3, 0.07, L / 2, y - drop + 0.4, 0.03);
      if (o.fenders !== 0) for (let x = (o.fenders ?? 3.2) / 2; x < L - 0.3; x += o.fenders ?? 3.2) {
        B.add(NS('rubber'), tpl('tyre', () => H.latheGeo([[0.17, -0.1], [0.3, -0.1], [0.34, -0.05], [0.34, 0.05], [0.3, 0.1], [0.17, 0.1], [0.14, 0.05], [0.14, -0.05]], 12, true)), '#26282b', x, y - 0.55, 0.14, { rx: HP });
        B.cyl(NS('metal'), K.rust, 0.012, 0.5, x, y - 0.2, 0.07, { seg: 4 });
      }
      for (const lx of o.ladders ?? []) {
        for (const s of [-1, 1]) pbox(B, NS('metal'), K.rust, 0.04, drop + 0.4, 0.04, lx + s * 0.2, y - drop / 2 + 0.2, 0.1);
        for (let k = 0; k < Math.round(drop / 0.3); k++) pbox(B, NS('metal'), K.rust, 0.42, 0.03, 0.03, lx, y - drop + 0.2 + k * 0.3, 0.1);
        B.tube(NS('metal'), K.rust, [P3(lx - 0.2, y - 0.05, 0.1), P3(lx - 0.2, y + 0.45, -0.1), P3(lx - 0.2, y + 0.1, -0.35)], 0.022, { radial: 5 });
        B.tube(NS('metal'), K.rust, [P3(lx + 0.2, y - 0.05, 0.1), P3(lx + 0.2, y + 0.45, -0.1), P3(lx + 0.2, y + 0.1, -0.35)], 0.022, { radial: 5 });
      }
      for (const bx of o.bollards ?? []) {
        B.lathe('metal', K.iron, [[0, 0], [0.2, 0], [0.2, 0.05], [0.15, 0.1], [0.14, 0.38], [0.21, 0.44], [0.2, 0.5], [0, 0.52]], bx, y, -0.35, { seg: 12 });
        snowCap(B, bx, y + 0.5, -0.35, 0.36, 0.36, 0.08);
        colBox(B, bx, y, -0.35, 0.44, 0.52, 0.44);
      }
      // rime + snow crust along the coping's back edge
      for (let x = 0.6; x < L; x += 2.2) B.add('paint', pillowGeo(0.4, 0.07), K.snow, x, y + 0.02, -0.55, { sx: 1.6 + hash(x) * 0.6, ao: false });
    },
  };

  // ------------------------------------------------------------------------------------------ fishing boat
  // a small coastal fishing boat (L ~7 m): white hull with a coloured sheer strake, a wheelhouse aft, a mast with a
  // light, net drum, fish hold hatch, tyres over the side, snow on the deck + roof. `hauled`: up on timber blocks on
  // the quay (collides: low hull + wheelhouse), else afloat (pos y = the water; non-colliding, out of reach).
  const hullGeo = (L, Bm, Dp) => tpl(['cchull', L, Bm, Dp].map(kf).join('|'), () => {
    const g = new THREE.BufferGeometry(), NSx = 12, NP = 6, pos = [];
    const sec = (t) => { const w = t < 0.6 ? 0.5 * Bm * (0.86 + 0.14 * Math.sin((t / 0.6) * HP)) : 0.5 * Bm * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.6) / 0.4, 2) * 0.985)); const keel = -Dp * (t < 0.7 ? 1 : 1 - 0.75 * Math.pow((t - 0.7) / 0.3, 1.3)); const top = 0.12 * t * t; return { w, keel, top }; };
    const pts = [];
    for (let i = 0; i <= NSx; i++) {
      const t = i / NSx, z = (t - 0.5) * L, { w, keel, top } = sec(t), row = [];
      for (let j = -NP; j <= NP; j++) { const s = Math.abs(j) / NP; row.push([Math.sign(j) * w * Math.pow(Math.sin(s * HP), 0.7), keel + (top - keel) * (1 - Math.cos(s * HP)), z]); }
      pts.push(row);
    }
    // triangles oriented outward (away from the hull's centre line at mid-depth)
    const push = (a, b, c) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz;
      const mx = (a[0] + b[0] + c[0]) / 3, my = (a[1] + b[1] + c[1]) / 3;
      if (nx * mx + ny * (my + Dp * 0.4) < 0) pos.push(...a, ...c, ...b); else pos.push(...a, ...b, ...c);
    };
    for (let i = 0; i < NSx; i++) for (let j = 0; j < NP * 2; j++) {
      const a = pts[i][j], b = pts[i][j + 1], c = pts[i + 1][j + 1], d = pts[i + 1][j];
      push(a, b, c); push(a, c, d);
    }
    // transom (faces −z)
    const st = pts[0], cy = (st[0][1] + st[NP][1]) / 2;
    for (let j = 0; j < NP * 2; j++) {
      const a = [0, cy, st[0][2]], b = st[j], c = st[j + 1];
      const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (nz > 0) pos.push(...a, ...c, ...b); else pos.push(...a, ...b, ...c);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const n = pos.length / 3, cc = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const yy = pos[i * 3 + 1], k = yy > -0.12 ? 0.82 : 1; cc[i * 3] = k; cc[i * 3 + 1] = k; cc[i * 3 + 2] = k; }
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    return g;
  });
  D.calamari_boat = {
    desc: 'Small coastal fishing boat (~7 m; pos = keel line at the waterline or on blocks; hauled: on timber blocks with a collider): white hull, coloured strake + name, wheelhouse, mast + light, net drum, tyres, snow on deck and roof.',
    params: { L: 'length', hauled: 'on blocks', c: 'strake colour', name: 'name' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const L = o.L ?? 7, Bm = o.beam ?? 2.3, Dp = 0.9, fb = 0.75;   // freeboard above the waterline
      const y0 = o.hauled ? 0.75 : 0;   // on blocks: the keel 0.75 above the ground
      B.push(0, y0 + Dp - 0.35, 0);
      B.add('gloss', hullGeo(L, Bm, Dp), K.white, 0, 0, 0, { sy: 1 });
      B.add(NS('gloss'), hullGeo(L, Bm, Dp), '#9a3a30', 0, -0.02, 0, { sx: 1.012, sy: 0.35, sz: 1.005 });
      // sheer strake (colour band) + name, gunwale
      for (const s of [-1, 1]) {
        pbox(B, 'paint', o.c ?? K.teal, 0.04, 0.2, L * 0.8, s * (Bm / 2 * 0.96), fb - 0.15, -L * 0.04, { ry: 0 });
        B.push(s * (Bm / 2 * 0.97 + 0.03), fb - 0.42, -L * 0.1, s > 0 ? HP : -HP);
        letters(B, o.name ?? 'KAIYO MARU', { h: 0.16, x: 0, y: 0, z: 0.0, c: K.indigo, flat: true, wt: 0.2 });
        B.pop();
      }
      pbox(B, 'wood', K.woodDk, Bm * 0.9, 0.06, L * 0.86, 0, fb - 0.02, -L * 0.04);
      // deck snow
      B.add('paint', pillowGeo(Bm * 0.8, 0.12), K.snow, 0, fb, -L * 0.18, { sx: 0.1, ry: HP, ao: false });
      B.add('paint', pillowGeo(L * 0.5, 0.12), K.snow, 0, fb, -L * 0.1, { sx: Bm * 0.72, ao: false, ry: 0 });
      // wheelhouse aft (−z), with windows (lit at dusk), snow on the roof
      const wz = -L * 0.3;
      B.box('paint', K.white, Bm * 0.7, 1.35, 1.7, 0, fb + 0.67, wz, { r: 0.06 });
      for (const s of [-1, 1]) pbox(B, NS('glow'), '#dfe8ee', 0.02, 0.42, 1.2, s * Bm * 0.35, fb + 1.05, wz, { glow: 0.7 });
      pbox(B, NS('glow'), '#dfe8ee', Bm * 0.6, 0.42, 0.02, 0, fb + 1.05, wz + 0.86, { glow: 0.7 });
      B.box('paint', o.c ?? K.teal, Bm * 0.78, 0.1, 1.9, 0, fb + 1.38, wz, { r: 0.03 });
      B.add('paint', pillowGeo(1.8, 0.16), K.snow, 0, fb + 1.43, wz, { sx: Bm * 0.72, ao: false });
      // mast + light + radar, rigging
      B.cyl('metal', K.galv, 0.05, 3.2, 0, fb + 1.4 + 1.6, wz + 0.2, { seg: 6 });
      B.sph(NS('glow'), '#ffe7b8', 0.07, 0, fb + 4.55, wz + 0.2, { ws: 6, hs: 4, glow: 1.8 });
      B.box(NS('metal'), K.galv, 0.9, 0.08, 0.14, 0, fb + 3.2, wz + 0.2, { r: 0.02 });
      B.tube(NS('metal'), K.dark, [P3(0, fb + 4.4, wz + 0.2), P3(0, fb + 0.1, L * 0.42)], 0.012, { radial: 3 });
      // net drum forward, hatch, fish boxes, a flag
      B.cyl('metal', K.ironLt, 0.4, 1.3, 0, fb + 0.5, L * 0.15, { rz: HP, seg: 12 });
      B.cyl(NS('paint'), K.net, 0.36, 1.2, 0, fb + 0.52, L * 0.15, { rz: HP, seg: 12 });
      snowCap(B, 0, fb + 0.88, L * 0.15, 1.2, 0.34, 0.06);
      B.box('wood', K.woodDk, 1.0, 0.25, 0.9, 0, fb + 0.12, L * 0.32, { r: 0.03 });
      for (const s of [-1, 1]) for (const tz of [-0.25, 0.1]) B.add(NS('rubber'), tpl('tyre', () => H.latheGeo([[0.17, -0.1], [0.3, -0.1], [0.34, -0.05], [0.34, 0.05], [0.3, 0.1], [0.17, 0.1], [0.14, 0.05], [0.14, -0.05]], 12, true)), '#26282b', s * (Bm / 2 + 0.06), fb - 0.3, L * tz, { rz: HP, s: 0.85 });
      icicles(B, -Bm * 0.35, Bm * 0.35, fb + 1.32, wz + 0.94, 7, 0.18);
      B.pop();
      if (o.hauled) {
        for (const bz of [-L * 0.28, L * 0.18]) { B.box('wood', K.woodDk, 1.2, 0.75, 0.35, 0, 0.37, bz, { r: 0.02 }); }
        for (const s of [-1, 1]) B.tube(NS('metal'), K.rust, [P3(s * 0.4, 0, -L * 0.05), P3(s * Bm * 0.45, 0.9, -L * 0.05)], 0.035, { radial: 5 });
        colBox(B, 0, 0, -L * 0.02, Bm * 0.9, y0 + Dp + fb - 0.4, L * 0.84);
        colBox(B, 0, 0, wz, Bm * 0.7, y0 + Dp + fb + 0.9, 1.7, ROOF);
        drift(B, Bm * 0.6, 0, -L * 0.1, 0.5, 0.3, 1.4, { seed: 2 });
      }
    },
  };

  // ------------------------------------------------------------------------------------------ fish boxes, nets, floats
  D.calamari_fishboxes = {
    desc: 'Stack of blue / orange fish boxes (plastic crates) with snow on top; n columns × rows high. Collides (cover).',
    params: { cols: 'n', rows: 'high', depth: 'rows deep' }, variants: 3, mount: 'ground',
    build(B, o) {
      const cols = o.cols ?? 2, rows = o.rows ?? 3, dep = o.depth ?? 1, w = 0.62, h = 0.3, d = 0.44;
      const cs = ['#3f6fa3', '#d0703a', '#3f6fa3', '#5f8f86', '#e8e4d8'];
      for (let c = 0; c < cols; c++) for (let z = 0; z < dep; z++) {
        const hh = rows - ((c + z + (o.variant ?? 0)) % 2 === 1 && rows > 1 ? 1 : 0);
        for (let r = 0; r < hh; r++) {
          const x = (c - (cols - 1) / 2) * (w + 0.02), zz = (z - (dep - 1) / 2) * (d + 0.02), col = cs[(c * 3 + r + z + (o.variant ?? 0)) % cs.length];
          B.box('gloss', col, w, h, d, x + (hash(c + r * 3) - 0.5) * 0.04, r * h + h / 2, zz, { r: 0.03, ry: (hash(r + c) - 0.5) * 0.08 });
          pbox(B, NS('paint'), shade(col, 0.6), w * 0.6, 0.06, 0.01, x, r * h + h * 0.7, zz + d / 2 + 0.001);
        }
        snowCap(B, (c - (cols - 1) / 2) * (w + 0.02), hh * h, (z - (dep - 1) / 2) * (d + 0.02), w - 0.04, d - 0.04, 0.07);
      }
      colBox(B, 0, 0, 0, cols * (w + 0.02), (rows - (cols > 1 ? 0 : 0)) * h, dep * (d + 0.02));
    },
  };
  D.calamari_nets = {
    desc: 'Heap of fishing nets (green / red) with orange floats and a coil of rope, snow on the top. Collides (low cover).',
    params: { r: 'radius' }, variants: 2, mount: 'ground',
    build(B, o) {
      const r = o.r ?? 0.9, c = (o.variant ?? 0) % 2 ? K.netRed : K.net;
      B.add('rubber', KIT.driftGeo(3), c, 0, 0, 0, { sx: r * 1.15, sy: r * 0.62, sz: r * 0.9 });
      for (let k = 0; k < 9; k++) { const a = k * 2.4, rr = r * (0.55 + 0.3 * hash(k)); B.sph(NS('gloss'), k % 3 ? '#e4803a' : '#d9d2c0', 0.09, Math.cos(a) * rr, 0.2 + hash(k * 3) * r * 0.35, Math.sin(a) * rr * 0.8, { ws: 7, hs: 5 }); }
      B.tor('paint', K.rope, 0.32, 0.05, r * 0.9, 0.06, -r * 0.4, { rx: HP, ts: 18, rs: 5 });
      B.tor(NS('paint'), K.rope, 0.26, 0.05, r * 0.9, 0.14, -r * 0.4, { rx: HP, ts: 16, rs: 5 });
      KIT.drift(B, 0, r * 0.4, 0, r * 0.7, r * 0.22, r * 0.55, { seed: 4 });
      colBox(B, 0, 0, 0, r * 2.0, r * 0.62, r * 1.6);
    },
  };
  // glass fishing floats in rope nets, hung on a wall / post (decor; non-colliding)
  D.calamari_floats = {
    desc: 'A string of glass fishing floats in rope netting (green / blue / amber), hanging from a nail. Non-colliding.',
    params: { n: 'count' }, variants: 1, mount: 'wall',
    build(B, o) {
      const n = o.n ?? 4;
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.34, y = -0.3 - (i % 2) * 0.12, c = ['#6fa88a', '#5f86a8', '#c99a4c', '#7fb0a0'][i % 4];
        B.sph(NS('gloss'), c, 0.14, x, y, 0.16, { ws: 10, hs: 7 });
        B.tor(NS('paint'), K.rope, 0.14, 0.008, x, y, 0.16, { ts: 12, rs: 3 });
        B.tube(NS('paint'), K.rope, [P3(x, y + 0.14, 0.16), P3(0, 0, 0.05)], 0.006, { radial: 3 });
      }
      B.cyl(NS('metal'), K.iron, 0.015, 0.1, 0, 0, 0.04, { rx: HP, seg: 4 });
    },
  };

  // ------------------------------------------------------------------------------------------ seaweed drying rack
  // timber A-frames with poles strung with kelp / wakame hung to dry: see-through (a rail collider), snow on the poles
  D.calamari_rack = {
    desc: 'Seaweed drying rack along local +X (length L): timber trestles, three poles with kelp hung over them, snow on the poles. Rail collider (see-through, shots + ink pass).',
    params: { length: 'm' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 4, n = Math.max(2, Math.round(L / 1.8) + 1), hh = 1.6;
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * L;
        for (const s of [-1, 1]) { B.push(x, hh / 2, s * 0.35, 0, s * 0.22); pbox(B, 'wood', K.woodDk, 0.07, hh + 0.1, 0.07, 0, 0, 0); B.pop(); }
      }
      for (const [yy, zz] of [[hh, 0], [hh * 0.72, -0.28], [hh * 0.72, 0.28]]) {
        B.cyl('wood', K.bamboo ?? '#a89a6a', 0.03, L + 0.3, L / 2, yy, zz, { rz: HP, seg: 6 });
        snowCap(B, L / 2, yy + 0.02, zz, L + 0.2, 0.07, 0.04);
        for (let x = 0.2; x < L; x += 0.16) {
          const hl = 0.5 + hash(x * 9 + yy) * 0.5;
          pbox(B, NS('foliage'), mixc('#2f3d2a', '#4a4a2a', hash(x + zz)), 0.1, hl, 0.012, x, yy - hl / 2, zz + 0.02, { rz: (hash(x) - 0.5) * 0.2 });
        }
      }
      B.col(0, 0, -0.5, L, hh + 0.05, 0.5, RAIL);
    },
  };

  // ------------------------------------------------------------------------------------------ breakwater light
  D.calamari_harbourlight = {
    desc: 'Harbour entrance light on the breakwater head: a small round red tower with a gallery and a lantern (blinks), snow on the gallery. Collides.',
    params: { c: 'colour' }, variants: 1, mount: 'ground',
    build(B, o) {
      const c = o.c ?? '#b8413a', h = 3.6;
      B.lathe('paint', K.white, [[0, 0], [0.75, 0], [0.75, 0.4], [0, 0.4]], 0, 0, 0, { seg: 16 });
      B.lathe('gloss', c, [[0, 0.4], [0.62, 0.4], [0.52, h], [0, h]], 0, 0, 0, { seg: 16 });
      for (let k = 1; k < 3; k++) B.add(NS('paint'), cylGeo(0.6 - k * 0.035, 0.6 - k * 0.035, 0.2, 16, true), K.white, 0, 0.4 + (k * (h - 0.4)) / 3, 0, {});
      B.cyl('paint', K.white, 0.72, 0.1, 0, h + 0.05, 0, { seg: 16 });
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; B.cyl(NS('metal'), K.iron, 0.015, 0.5, Math.cos(a) * 0.68, h + 0.35, Math.sin(a) * 0.68, { seg: 4 }); }
      B.tor(NS('metal'), K.iron, 0.68, 0.02, 0, h + 0.6, 0, { rx: HP, ts: 20, rs: 4 });
      B.cyl(NS('gloss'), K.glassLt, 0.3, 0.55, 0, h + 0.38, 0, { seg: 12 });
      B.lathe('paint', c, [[0, 0.7], [0.4, 0.7], [0.1, 1.05], [0, 1.1]], 0, h, 0, { seg: 12 });
      B.blink('#ff5a45', 0, h + 0.4, 0, { size: 0.16, rate: 0.25, hi: 6 });
      snowCap(B, 0, h + 0.1, 0, 1.3, 1.3, 0.12);
      KIT.snowCap(B, 0, h + 1.02, 0, 0.3, 0.3, 0.08);
      colBox(B, 0, 0, 0, 1.4, h + 1.1, 1.4, ROOF);
    },
  };

  // slipway winch + a chain across the slipway's head (see-through rail) and the ramp's snow and ice
  D.calamari_winch = {
    desc: 'Slipway winch (a hand winch on a timber frame, cable running down the ramp), a post + chain barrier. Winch collides (low).',
    params: { length: 'cable run' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('wood', K.woodDk, 1.1, 0.7, 0.8, 0, 0.35, 0, { r: 0.03 });
      B.cyl('metal', K.ironLt, 0.2, 0.9, 0, 0.9, 0, { rz: HP, seg: 12 });
      B.cyl(NS('metal'), K.rust, 0.22, 0.6, 0, 0.9, 0, { rz: HP, seg: 12 });
      for (const s of [-1, 1]) B.box('metal', K.iron, 0.08, 0.7, 0.5, s * 0.5, 0.95, 0, { r: 0.02 });
      B.tube(NS('metal'), K.rust, [P3(0.52, 1.1, 0), P3(0.9, 1.3, 0.1), P3(1.05, 1.0, 0.3)], 0.02, { radial: 4 });
      B.tube(NS('metal'), K.dark, [P3(0, 0.75, 0.2), P3(0, 0.1, o.length ?? 4)], 0.012, { radial: 3 });
      snowCap(B, 0, 0.7, 0, 1.0, 0.7, 0.08);
      colBox(B, 0, 0, 0, 1.2, 0.9, 0.9);
    },
  };
}
