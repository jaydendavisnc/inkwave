// Calamari County — village buildings (owner: the calamari stage). Dressing for the level blocks (layout.js): the block
// is the ground-floor walls (inkable: shitami-itabari cedar boards or white plaster); these props add what makes each a
// house — corner posts and beams, a stone plinth, lattice windows and sliding doors (paper lit at dusk), shopfronts with
// noren, signboards, the upper storey (off-limits), pent roofs between the floors, the kawara roof heavy with snow,
// icicles, snow slid off the eaves, kerosene tanks, downpipes. Frames: pos = the block's centre at its floor, rotY = the
// block's turn; faces 0 = +Z, 1 = +X, 2 = −Z, 3 = −X (local), x along a face to the viewer's right.
export function registerBuildings(D, H, KIT) {
  const { K, NS, pbox, cylGeo, colBox, ROOF, RAIL, onFace, sub, snowCap, drift, icicles, roof, shoji, koshi, sign, letters, chochin, wallLamp, hash, shade, mixc, puff, HP, PI, P3, TAU } = KIT;

  // ------------------------------------------------------------------------------------------ facade items (face frame)
  // sliding entrance: two lattice-glass leaves, a frame, a threshold stone, a little pent roof (hisashi) with snow
  function entrance(B, x, y, w, o = {}) {
    const h = o.h ?? 2.05;
    shoji(B, x, y + 0.08, w, h - 0.08, { lit: o.lit ?? 1.1, cols: Math.max(2, Math.round(w / 0.24)), rows: 5, frame: o.frame ?? K.cedarDk, split: 0 });
    pbox(B, 'wood', K.beam, w + 0.3, 0.14, 0.12, x, y + h + 0.07, 0.06);
    for (const sx of [-1, 1]) pbox(B, 'wood', K.beam, 0.12, h + 0.14, 0.1, x + sx * (w / 2 + 0.09), y + (h + 0.14) / 2, 0.05);
    B.box('paint', K.stoneLt, w + 0.5, 0.12, 0.5, x, y + 0.06, 0.25, { r: 0.03 });
    if (o.hood !== false) {
      const hw = w + 0.8, hd = 0.7, yy = y + h + 0.32;
      B.push(x, yy, 0, 0, -0.32);
      pbox(B, 'paint', K.kawara, hw, 0.07, hd, 0, 0, hd / 2);
      B.add(NS('paint'), cylGeo(0.05, 0.05, hw, 8), shade(K.kawara, 0.8), 0, 0.0, hd, { rz: HP });
      snowCap(B, 0, 0.035, hd / 2 - 0.05, hw - 0.1, hd - 0.12, 0.14);
      B.pop();
      for (const sx of [-1, 1]) B.box(NS('wood'), K.beam, 0.08, 0.08, 0.66, x + sx * (hw / 2 - 0.2), yy - 0.1, 0.33, { r: 0.01 });
      icicles(B, x - hw / 2 + 0.15, x + hw / 2 - 0.15, yy - 0.26, hd * 0.95, Math.round(x * 13 + y), 0.18);
    }
    if (o.noren) noren(B, x, y + h - 0.04, w * 0.92, o.noren);
  }
  // noren: split cloth panels hanging from a rod (colour, a pale mark), at top y
  function noren(B, x, y, w, o = {}) {
    const n = o.n ?? Math.max(2, Math.round(w / 0.4)), L = o.L ?? 0.7, c = o.c ?? K.indigo;
    B.cyl(NS('wood'), K.woodDk, 0.02, w + 0.2, x, y + 0.02, 0.12, { rz: HP, seg: 6 });
    for (let i = 0; i < n; i++) {
      const px = x - w / 2 + (i + 0.5) * (w / n);
      pbox(B, 'paint', c, w / n - 0.03, L, 0.012, px, y - L / 2, 0.12, { rx: 0.03 });
    }
    // the shop's mark across the panels (a pale roundel + a stroke), readable as a crest
    if (o.mark !== false) {
      B.add(NS('paint'), cylGeo(Math.min(0.2, L * 0.28), Math.min(0.2, L * 0.28), 0.004, 20), o.markC ?? K.cream, x, y - L * 0.45, 0.13, { rx: HP });
      if (o.mark === 'onsen') for (let k = -1; k <= 1; k++) B.tube(NS('paint'), K.indigo, [P3(x + k * 0.06, y - L * 0.52, 0.135), P3(x + k * 0.06 + 0.025, y - L * 0.44, 0.135), P3(x + k * 0.06 - 0.02, y - L * 0.36, 0.135), P3(x + k * 0.06 + 0.02, y - L * 0.3, 0.135)], 0.012, { radial: 4 });
    }
  }
  // lattice window with a sill (koshi, paper behind: lit at dusk) or a glazed sash window
  function window_(B, x, y, w, h, o = {}) {
    if (o.sash) {
      pbox(B, NS('paint'), K.dark, w, h, 0.01, x, y + h / 2, 0.005);
      pbox(B, NS('gloss'), o.lit ? K.litWarm : K.glass, w - 0.08, h - 0.08, 0.01, x, y + h / 2, 0.015, o.lit ? {} : {});
      if (o.lit) pbox(B, NS('glow'), K.lit, w - 0.14, h * 0.5, 0.004, x, y + h * 0.62, 0.022, { glow: o.lit });
      for (const sx of [-1, 1]) pbox(B, 'paint', o.frame ?? K.steel, 0.045, h, 0.04, x + sx * (w / 2 - 0.022), y + h / 2, 0.025);
      pbox(B, 'paint', o.frame ?? K.steel, w, 0.045, 0.04, x, y + h - 0.022, 0.025);
      pbox(B, NS('paint'), o.frame ?? K.steel, 0.035, h, 0.03, x, y + h / 2, 0.03);
    } else koshi(B, x, y, w, h, { lit: o.lit ?? 0.9, c: o.c ?? K.cedarDk });
    B.box('wood', K.beam, w + 0.16, 0.06, 0.16, x, y - 0.03, 0.08, { r: 0.01 });
    snowCap(B, x, y, 0.09, w + 0.08, 0.14, 0.06);
    if (o.shutter) pbox(B, 'wood', K.cedarGrey, w * 0.5, h + 0.1, 0.04, x + (w * 0.5 + 0.08) * o.shutter, y + h / 2, 0.03);
  }
  // kerosene tank on a steel stand (every snow-country house has one), copper line into the wall
  function kerosene(B, x, y, o = {}) {
    for (const sx of [-1, 1]) for (const sz of [0.12, 0.52]) pbox(B, NS('metal'), K.steel, 0.035, 0.55, 0.035, x + sx * 0.28, y + 0.275, sz);
    B.box('gloss', o.c ?? '#b9453a', 0.72, 0.62, 0.5, x, y + 0.86, 0.32, { r: 0.08 });
    B.cyl(NS('metal'), K.galv, 0.06, 0.06, x + 0.2, y + 1.2, 0.32, { seg: 8 });
    B.tube(NS('metal'), K.copper ?? '#b87333', [P3(x - 0.3, y + 0.62, 0.32), P3(x - 0.45, y + 0.5, 0.2), P3(x - 0.5, y + 0.9, 0.03)], 0.012, { radial: 4 });
    snowCap(B, x, y + 1.17, 0.32, 0.66, 0.44, 0.1);
  }
  function downpipe(B, x, y0, y1) {
    B.cyl(NS('metal'), K.galv, 0.045, y1 - y0 - 0.1, x, (y0 + y1) / 2, 0.07, { seg: 7 });
    B.box(NS('metal'), K.galv, 0.14, 0.14, 0.12, x, y1 - 0.08, 0.07, { r: 0.02 });
    for (let yy = y0 + 0.7; yy < y1 - 0.3; yy += 1.1) pbox(B, NS('metal'), K.steel, 0.12, 0.025, 0.08, x, yy, 0.04);
  }
  // electricity meter + a little box, a nameplate
  function meter(B, x, y) {
    B.box('paint', '#d8d6cf', 0.24, 0.34, 0.1, x, y, 0.05, { r: 0.02 });
    B.cyl(NS('gloss'), K.glassLt, 0.07, 0.02, x, y + 0.05, 0.1, { rx: HP, seg: 10 });
  }
  function nameplate(B, x, y, text) {
    B.box('wood', K.woodLt, 0.16, 0.42, 0.025, x, y, 0.012, { r: 0.008 });
    letters(B, text, { h: 0.045, x, y: y - 0.02, z: 0.026, c: K.dark, flat: true, wt: 0.2, track: 0.1 });
  }
  // stacked firewood under a little roof (bath house, cottages)
  function woodpile(B, x, y, w, o = {}) {
    const rows = o.rows ?? 5, n = Math.max(3, Math.round(w / 0.16));
    for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
      const px = x - w / 2 + 0.08 + (i * (w - 0.16)) / (n - 1), py = y + 0.08 + r * 0.15;
      B.add(NS('wood'), cylGeo(0.07, 0.07, 0.42, 6), mixc(K.woodLt, K.wood, hash(i * 7 + r)), px + (r % 2) * 0.04, py, 0.24, { rx: HP });
    }
    snowCap(B, x, y + 0.08 + rows * 0.15, 0.24, w, 0.46, 0.1);
  }

  // one facade item (face frame; y = the face's floor)
  function item(B, it, L, top) {
    const x = it.x ?? 0, y = it.y ?? 0;
    switch (it.t) {
      case 'door': entrance(B, x, y, it.w ?? 1.5, it); break;
      case 'win': window_(B, x, y + (it.sill ?? 0.9), it.w ?? 1.1, it.h ?? 1.0, it); break;
      case 'shop': {   // an open shopfront: lit lattice, goods on a stepped stand, noren over it
        const w = it.w ?? 3, h = it.h ?? 2.2;
        koshi(B, x, y + 0.9, w, h - 0.9, { lit: 1.2, c: K.cedarDk, pitch: 0.12 });
        B.box('wood', K.woodDk, w, 0.9, 0.5, x, y + 0.45, 0.25, { r: 0.02 });
        pbox(B, 'wood', K.beam, w + 0.3, 0.16, 0.14, x, y + h + 0.08, 0.07);
        if (it.goods) goods(B, it.goods, x, y + 0.9, w, it);
        if (it.noren) noren(B, x, y + h, w * 0.9, it.noren);
        break;
      }
      case 'noren': noren(B, x, y + (it.y1 ?? 2.1), it.w ?? 1.4, it); break;
      case 'sign': sign(B, it.text, x, y + (it.at ?? 2.4), { h: it.h ?? 0.24, board: it.board ?? K.cedarDk, c: it.c ?? K.cream, border: it.border, lit: it.lit, w: it.bw }); break;
      case 'vsign': {   // a vertical signboard (kanban) hanging off the wall
        const n = it.text.length, h = it.h ?? 0.2, bh = n * h * 1.25 + 0.24;
        B.box('wood', it.board ?? K.cedarDk, h + 0.2, bh, 0.05, x, y + (it.at ?? 1.8) + bh / 2, 0.08, { r: 0.012 });
        [...it.text].forEach((ch, i) => letters(B, ch, { h, x, y: y + (it.at ?? 1.8) + bh - 0.14 - (i + 1) * h * 1.25 + 0.04, z: 0.106, c: it.c ?? K.cream, flat: true, wt: 0.2 }));
        break;
      }
      case 'lamp': wallLamp(B, x, y + (it.at ?? 2.5), it); break;
      case 'chochin': chochin(B, x, y + (it.at ?? 2.25), 0.34, it); B.cyl(NS('metal'), K.iron, 0.01, 0.3, x, y + (it.at ?? 2.25) + 0.36, 0.2, { rx: 0.9, seg: 4 }); break;
      case 'kerosene': kerosene(B, x, y, it); break;
      case 'pipe': downpipe(B, x, y, top); break;
      case 'meter': meter(B, x, y + 1.6); break;
      case 'plate': nameplate(B, x, y + (it.at ?? 1.5), it.text); break;
      case 'wood': woodpile(B, x, y, it.w ?? 1.6, it); break;
      case 'snow': drift(B, x, y, 0.35, it.w ?? L / 2, it.hh ?? 0.45, 0.4, { rot: 0, seed: Math.round(Math.abs(x * 3)) % 6 }); break;
      case 'ac': B.box('paint', '#e8e6e0', 0.8, 0.55, 0.3, x, y + (it.at ?? 0.3) + 0.28, 0.17, { r: 0.03 }); B.cyl(NS('paint'), '#9aa0a5', 0.2, 0.02, x - 0.12, y + (it.at ?? 0.3) + 0.28, 0.33, { rx: HP, seg: 12 }); snowCap(B, x, y + (it.at ?? 0.3) + 0.55, 0.17, 0.78, 0.3, 0.08); break;
      case 'poster': B.box(NS('paint'), it.c ?? '#e9dcc0', it.w ?? 0.5, it.h ?? 0.7, 0.01, x, y + (it.at ?? 1.5), 0.012, { r: 0.004 }); pbox(B, NS('paint'), it.c2 ?? K.red, (it.w ?? 0.5) * 0.8, (it.h ?? 0.7) * 0.3, 0.004, x, y + (it.at ?? 1.5) + (it.h ?? 0.7) * 0.2, 0.018); break;
      case 'clock': clock(B, x, y + (it.at ?? 2.6), it.r ?? 0.3); break;
      default: break;
    }
  }
  function clock(B, x, y, r) {
    B.cyl('paint', K.white, r, 0.08, x, y, 0.06, { rx: HP, seg: 20 });
    B.add(NS('paint'), H.tubeGeo(Array.from({ length: 25 }, (_, i) => { const a = (i / 24) * TAU; return [Math.cos(a) * r, Math.sin(a) * r, 0]; }), 0.03, 6, true), K.iron, x, y, 0.1, {});
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; pbox(B, NS('paint'), K.dark, 0.02, k % 3 ? 0.04 : 0.08, 0.005, x + Math.sin(a) * r * 0.8, y + Math.cos(a) * r * 0.8, 0.103, { rz: -a }); }
    pbox(B, NS('paint'), K.dark, 0.03, r * 0.5, 0.006, x + r * 0.2, y + r * 0.1, 0.108, { rz: -1.2 });
    pbox(B, NS('paint'), K.dark, 0.022, r * 0.75, 0.006, x - r * 0.05, y + r * 0.35, 0.11, { rz: 0.15 });
  }
  // goods on a shop stand: 'veg' (daikon, cabbages in crates), 'fish' (ice boxes with fish), 'sundry' (tins, boxes)
  function goods(B, kind, x, y, w, it) {
    const n = Math.max(2, Math.round(w / 0.62));
    for (let i = 0; i < n; i++) {
      const px = x - w / 2 + (i + 0.5) * (w / n), sd = Math.round(px * 17 + (it.seed ?? 3));
      if (kind === 'fish') {
        B.box('gloss', '#e9eef0', w / n - 0.08, 0.16, 0.42, px, y + 0.08, 0.25, { r: 0.03 });
        pbox(B, NS('gloss'), K.ice, w / n - 0.14, 0.02, 0.36, px, y + 0.155, 0.25);
        for (let k = 0; k < 3; k++) B.add(NS('gloss'), cylGeo(0.035, 0.02, 0.26, 6), ['#8e9aa6', '#b56c55', '#c7ccd0'][(sd + k) % 3], px - 0.1 + k * 0.1, y + 0.185, 0.25, { rx: HP, rz: 0.2 * (k - 1) });
      } else if (kind === 'veg') {
        B.box('wood', K.woodLt, w / n - 0.08, 0.22, 0.4, px, y + 0.11, 0.25, { r: 0.015 });
        for (let k = 0; k < 4; k++) {
          const t = hash(sd + k);
          if ((sd + k) % 3 === 0) B.add(NS('paint'), cylGeo(0.045, 0.02, 0.36, 6), K.white, px - 0.12 + k * 0.08, y + 0.26, 0.25, { rx: HP, rz: 0.5 * (t - 0.5) });
          else B.sph('paint', (sd + k) % 3 === 1 ? '#8fae6a' : '#d6a24a', 0.075, px - 0.12 + k * 0.08, y + 0.28, 0.2 + 0.1 * t, { ws: 7, hs: 5 });
        }
      } else {
        for (let k = 0; k < 3; k++) B.box('paint', ['#c9a86a', '#b7473c', '#6f8fa3', '#e2d9c3'][(sd + k) % 4], 0.16, 0.2 + 0.1 * hash(sd + k), 0.2, px - 0.18 + k * 0.18, y + 0.12, 0.25, { r: 0.01 });
      }
    }
  }

  // ------------------------------------------------------------------------------------------ the house
  // pos = block centre at its floor, w × d (the block), h = wall top above the floor. o.style: 'cedar' | 'plaster';
  // o.faces { side: [items] }; o.upper { h, inset, c, faces }; o.hisashi [sides]; o.roof { f, pitch, c, ov, alongX,
  // over (1: the roof sits on the upper storey) }; o.chimney [x, z, h]; o.snow [sides] drifts along those walls.
  D.calamari_house = {
    desc: 'Calamari County house dressing for a level block (pos = block centre at its floor; w, d, h): corner posts, beams, a stone plinth, lattice windows + sliding doors (paper lit at dusk), shopfronts + noren, signboards, kerosene tanks, the upper storey and a kawara roof heavy with snow (off-limits colliders), pent roofs, icicles, snow drifts along the walls.',
    params: { w: 'block width', d: 'block depth', h: 'wall top', style: "'cedar' | 'plaster'", faces: '{ side: [items] }', upper: '{ h, inset, c, faces }', roof: '{ f, pitch, c, ov, alongX }' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = o.w, Dd = o.d, h = o.h, wc = o.wallC ?? (o.style === 'cedar' ? K.cedar : K.plaster), up = o.upper;
      // corner posts + the beam under the eaves (or under the upper storey)
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.box('wood', K.beam, 0.16, h, 0.16, sx * (W / 2 - 0.02), h / 2, sz * (Dd / 2 - 0.02), { r: 0.02 });
      for (const side of [0, 1, 2, 3]) onFace(B, W, Dd, side, (L) => {
        pbox(B, 'wood', K.beam, L + 0.04, 0.2, 0.08, 0, h - 0.1, 0.04);
        if (o.plinth !== false) B.box('paint', K.stoneDk, L + 0.06, 0.28, 0.07, 0, 0.14, 0.03, { r: 0.015 });
        if (o.style !== 'cedar' && o.posts !== false) for (let k = 1; k < Math.round(L / 1.8); k++) pbox(B, NS('wood'), K.beam, 0.1, h - 0.3, 0.035, -L / 2 + (k * L) / Math.round(L / 1.8), 0.28 + (h - 0.48) / 2, 0.018);
        for (const it of (o.faces && o.faces[side]) || []) item(B, it, L, h);
      });
      let top = h;
      // the upper storey (off-limits): plaster between timber, windows, a pent roof along the listed faces
      if (up) {
        const uw = W - (up.inset ?? 0) * 2, ud = Dd - (up.insetZ ?? up.inset ?? 0) * 2, uh = up.h ?? 2.5, uc = up.c ?? K.plaster;
        B.push(up.x ?? 0, h, up.z ?? 0);
        B.box('paint', uc, uw, uh, ud, 0, uh / 2, 0, { r: 0.03 });
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.box('wood', K.beam, 0.14, uh, 0.14, sx * (uw / 2 - 0.03), uh / 2, sz * (ud / 2 - 0.03), { r: 0.02 });
        for (const side of [0, 1, 2, 3]) onFace(B, uw, ud, side, (L) => {
          pbox(B, 'wood', K.beam, L, 0.14, 0.05, 0, 0.07, 0.02);
          pbox(B, 'wood', K.beam, L, 0.14, 0.05, 0, uh - 0.1, 0.02);
          for (const it of (up.faces && up.faces[side]) || []) item(B, { ...it, y: 0 }, L, uh);
        });
        colBox(B, up.x ?? 0, 0, up.z ?? 0, uw, uh, ud, ROOF);
        B.pop();
        top = h + uh;
      }
      // pent roofs (hisashi) between the floors on the listed faces
      for (const side of o.hisashi ?? []) onFace(B, W, Dd, side, (L) => {
        const hd = 0.85, yy = h + 0.05;
        B.push(0, yy, 0, 0, -0.34);
        pbox(B, 'paint', K.kawara, L + 0.3, 0.08, hd, 0, 0, hd / 2);
        for (let k = 0; k <= Math.round(L / 0.3); k++) B.add(NS('paint'), cylGeo(0.04, 0.04, hd * 0.35, 6, false, 0, PI), shade(K.kawara, 0.85), -L / 2 + (k * L) / Math.round(L / 0.3), 0.04, hd * 0.82, { rx: HP });
        B.add(NS('paint'), cylGeo(0.055, 0.055, L + 0.3, 8), shade(K.kawara, 0.8), 0, 0.02, hd, { rz: HP });
        snowCap(B, 0, 0.04, hd * 0.42, L + 0.1, hd * 0.72, 0.2);
        B.pop();
        icicles(B, -L / 2, L / 2, yy - 0.33, hd * 0.94, side * 11 + Math.round(W * 3), 0.25);
        colBox(B, 0, yy - 0.3, hd / 2, L + 0.3, 0.55, hd, ROOF);
      });
      // the roof
      if (o.roof !== false) {
        const r = o.roof || {};
        const R = roof(B, up ? W - (up.inset ?? 0) * 2 : W, up ? Dd - (up.insetZ ?? up.inset ?? 0) * 2 : Dd, top, { ...r, x: up?.x ?? 0, z: up?.z ?? 0, col: true, seed: Math.round(W * 7 + Dd * 3) });
        void R;
      }
      if (o.chimney) { const [cx, cz, ch] = o.chimney; B.box('paint', K.render, 0.5, ch, 0.5, cx, top + ch / 2, cz, { r: 0.04 }); pbox(B, NS('paint'), K.dark, 0.34, 0.06, 0.34, cx, top + ch + 0.01, cz); snowCap(B, cx, top + ch, cz, 0.5, 0.5, 0.1); }
      // snow slid off the eaves, heaped along the walls (low: not cover, just the look)
      for (const side of o.snow ?? []) onFace(B, W, Dd, side, (L) => {
        const n = Math.max(1, Math.round(L / 2.4));
        for (let k = 0; k < n; k++) drift(B, -L / 2 + (k + 0.5) * (L / n), 0, 0.45, L / n * 0.6, 0.32 + 0.1 * hash(k + side), 0.5, { seed: (k + side) % 6 });
      });
    },
  };

  // ------------------------------------------------------------------------------------------ the bath house (sento)
  // a tall hip-and-gable roof over the bath hall, the boiler's tall chimney (off-limits) with steam, noren with the
  // hot-spring mark over the entrance, the boiler room's woodpile, the price board. pos = block centre, w × d, h.
  D.calamari_bathhouse = {
    desc: 'The village bath house (sento) dressing for its level block: a high irimoya roof with snow, the boiler chimney with a steam plume, the entrance under a karahafu-style hood with noren, lattice windows, a woodpile, price board. Off-limits roof + chimney colliders.',
    params: { w: 'block width', d: 'block depth', h: 'wall top', door: 'entrance side' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = o.w, Dd = o.d, h = o.h, ds = o.door ?? 1;
      // face lengths: the entrance face, the one after it (clockwise) … (items keep ~0.3 m off the corner posts)
      const fl = (side) => (side % 2 === 0 ? W : Dd), L0 = fl(ds) / 2, L1 = fl((ds + 1) % 4) / 2, L2 = fl((ds + 2) % 4) / 2, L3 = fl((ds + 3) % 4) / 2;
      sub(B, 'calamari_house', 0, 0, 0, 0, {
        w: W, d: Dd, h, style: 'plaster', roof: { f: 0.45, pitch: 0.62, ov: 0.9, alongX: false },
        faces: {
          [ds]: [{ t: 'door', x: 0, w: 1.8, noren: { c: K.indigo, n: 3, L: 0.8, mark: 'onsen' } }, { t: 'sign', text: 'BATHS', x: 0, at: 2.62, h: 0.26, board: K.cedarDk, c: K.cream }, { t: 'chochin', x: -1.35, at: 2.2 }, { t: 'chochin', x: 1.35, at: 2.2 }, { t: 'win', x: -(L0 - 0.75), w: 0.8, h: 0.9, sill: 1.2 }, { t: 'win', x: L0 - 0.75, w: 0.8, h: 0.9, sill: 1.2 }],
          [(ds + 1) % 4]: [{ t: 'win', x: -L1 * 0.55, w: 1.5, h: 0.8, sill: 1.9, sash: true, lit: 0.9 }, { t: 'win', x: L1 * 0.3, w: 1.5, h: 0.8, sill: 1.9, sash: true, lit: 0.9 }, { t: 'kerosene', x: L1 - 0.65 }],
          [(ds + 2) % 4]: [{ t: 'wood', x: -L2 * 0.45, w: 2.2 }, { t: 'pipe', x: L2 - 0.4 }, { t: 'meter', x: L2 * 0.55 }],
          [(ds + 3) % 4]: [{ t: 'win', x: -L3 * 0.55, w: 1.5, h: 0.8, sill: 1.9, sash: true, lit: 0.9 }, { t: 'win', x: L3 * 0.3, w: 1.5, h: 0.8, sill: 1.9, sash: true, lit: 0.9 }, { t: 'pipe', x: -(L3 - 0.3) }],
        },
        snow: [(ds + 1) % 4, (ds + 3) % 4],
      });
      // the boiler chimney: a tall brick stack at the back corner with iron bands and a steam plume
      const cx = o.stackX ?? W / 2 - 0.9, cz = o.stackZ ?? -Dd / 2 + 0.9, ch = o.stackH ?? 9.5;
      B.lathe('paint', '#8e5a44', [[0, 0], [0.5, 0], [0.5, 0.2], [0.44, 0.4], [0.34, ch - 0.4], [0.4, ch - 0.3], [0.4, ch], [0.28, ch], [0.28, ch - 0.1], [0, ch - 0.1]], cx, h, cz, { seg: 14 });
      for (let k = 1; k < 5; k++) B.add(NS('metal'), cylGeo(0.36 + 0.06 * (1 - (k / 5)), 0.36 + 0.06 * (1 - (k / 5)), 0.06, 14, true), K.iron, cx, h + (k * ch) / 5, cz, {});
      snowCap(B, cx, h + ch, cz, 0.7, 0.3, 0.06);
      colBox(B, cx, h, cz, 1.0, ch, 1.0, ROOF);
      // steam: soft puffs billowing up and drifting off with the wind (static, stylised), thinning as they rise
      for (let k = 0; k < 7; k++) {
        const t = k / 6, sz = 0.55 + t * 1.6;
        B.add(NS('foliage'), puff(1, (k + 2) % 6), mixc('#fbfcfd', '#d9e1ea', t * 0.8), cx + t * 3.2 + Math.sin(k * 2.1) * 0.35, h + ch + 0.5 + t * 4.2 + Math.sin(k) * 0.2, cz - t * 1.6, { s: sz, sy: sz * 0.62, sz: sz * 0.85, ry: k, ao: false });
      }
    },
  };

  // ------------------------------------------------------------------------------------------ the station building
  // Calamari County Station: timber walls, a big hip-and-gable roof, the station name board under the eaves on the
  // forecourt side, the ticket window, the waiting room (stove, benches) glowing through its windows onto the platform,
  // a deep eave canopy over the platform walkway on timber posts (colliders), a vending machine, a clock.
  D.calamari_station = {
    desc: 'Calamari County Station building dressing (pos = block centre, w × d, h; face 2 = the forecourt, face 0 = the platform): name board, entrance, ticket window, waiting-room windows, a platform eave canopy on posts (collider), clock, posters.',
    params: { w: 'block width', d: 'block depth', h: 'wall top', canopy: 'canopy depth over the platform' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      // platY: the platform's floor on face 0 (the building stands in the forecourt, its platform face above the
      // platform's edge); posts: false = the eave is cantilevered (no posts on the platform)
      const W = o.w, Dd = o.d, h = o.h, cd = o.canopy ?? 2.3, py = o.platY ?? 0, posts = o.posts !== false;
      const up = (items) => items.map((it) => ({ ...it, y: (it.y ?? 0) + py }));
      sub(B, 'calamari_house', 0, 0, 0, 0, {
        w: W, d: Dd, h, style: 'cedar', wallC: K.cedar, roof: { f: 0.4, pitch: 0.55, ov: 0.9, alongX: true, c: K.kawara },
        faces: {
          2: [{ t: 'door', x: -0.6, w: 2.4, h: 2.05, hood: false }, { t: 'win', x: 2.5, w: 1.1, h: 0.8, sill: 1.0, sash: true, lit: 1.0 }, { t: 'poster', x: -2.7, at: 1.3 }, { t: 'poster', x: -3.3, at: 1.35, c2: K.teal }, { t: 'lamp', x: 1.2, at: 2.5 }],
          0: up([{ t: 'win', x: -2.2, w: 1.5, h: 1.1, sill: 0.95, sash: true, lit: 1.3 }, { t: 'win', x: 0.2, w: 1.5, h: 1.1, sill: 0.95, sash: true, lit: 1.3 }, { t: 'door', x: 2.4, w: 1.2, h: 2.05, hood: false }, { t: 'clock', x: -1.0, at: 2.55, r: 0.26 }]),
          1: [{ t: 'win', x: 0, w: 1.0, h: 0.8, sill: 1.1, sash: true, lit: 1.0 }, { t: 'pipe', x: 1.6 }],
          3: [{ t: 'meter', x: 0.8 }, { t: 'pipe', x: -1.6 }, { t: 'ac', x: -0.4 }],
        },
      });
      // the name board over the entrance on the forecourt face: CALAMARI COUNTY STATION
      onFace(B, W, Dd, 2, () => {
        const bw = Math.min(W - 0.5, 6.4), y0 = 2.22;
        B.box('wood', K.cedarDk, bw, 0.5, 0.08, 0, y0 + 0.25, 0.1, { r: 0.02 });
        pbox(B, NS('paint'), K.cream, bw - 0.08, 0.42, 0.01, 0, y0 + 0.25, 0.145);
        letters(B, 'CALAMARI COUNTY STATION', { h: 0.24, x: 0, y: y0 + 0.13, z: 0.15, c: K.cedarDk, flat: true, wt: 0.19, track: 0.12 });
        snowCap(B, 0, y0 + 0.5, 0.1, bw, 0.1, 0.05);
      });
      // the platform canopy: the station's eaves carried out over the walkway on posts (the posts collide)
      onFace(B, W, Dd, 0, (L) => {
        const yT = h + 0.35, pz = cd - 0.25;
        if (posts) {
          for (const px of [-L / 2 + 0.4, 0, L / 2 - 0.4]) { B.box('wood', K.beam, 0.16, yT - py, 0.16, px, py + (yT - py) / 2, pz, { r: 0.02 }); colBox(B, px, py, pz, 0.18, yT - py, 0.18); }
          pbox(B, 'wood', K.beam, L + 0.6, 0.2, 0.16, 0, yT - 0.1, pz);
        } else for (const px of [-L / 2 + 0.3, -L / 6, L / 6, L / 2 - 0.3]) pbox(B, 'wood', K.beam, 0.12, 0.12, cd + 0.2, px, yT - 0.12, (cd + 0.2) / 2, { rx: 0.16 });   // eave brackets
        B.push(0, yT, 0, 0, -0.16);
        pbox(B, 'paint', K.kawara, L + 0.9, 0.1, cd + 0.4, 0, 0.05, (cd + 0.4) / 2);
        B.add(NS('paint'), cylGeo(0.06, 0.06, L + 0.9, 8), shade(K.kawara, 0.8), 0, 0.05, cd + 0.4, { rz: HP });
        snowCap(B, 0, 0.1, (cd + 0.4) / 2 - 0.1, L + 0.7, cd, 0.24);
        B.pop();
        icicles(B, -L / 2 - 0.3, L / 2 + 0.3, yT - 0.4, cd + 0.36, 91, 0.3);
        colBox(B, 0, yT - 0.2, cd / 2 + 0.2, L + 0.9, 0.7, cd + 0.4, ROOF);
        // a bench and the stove pipe out through the wall
        sub(B, 'calamari_bench', -2.4, py, 0.6, PI, {});
        B.tube(NS('metal'), K.ironLt, [P3(1.1, py + 1.9, 0.02), P3(1.1, py + 1.9, 0.35), P3(1.1, h + 0.9, 0.35)], 0.07, { radial: 8 });
        B.cyl(NS('metal'), K.ironLt, 0.13, 0.12, 1.1, h + 0.96, 0.35, { seg: 8 });
      });
    },
  };

  // ------------------------------------------------------------------------------------------ the co-op warehouse
  // Calamari County Fishermen's Co-op: a big two-storey timber warehouse behind the spawn (its bulk + gable roof out of
  // play), roller doors and the co-op's sign, the open upper deck (the spawn) under a narrow awning, the loading dock's
  // fenders. pos = [centre x, 0, the warehouse's front face z], w = its width.
  D.calamari_coop = {
    desc: "Calamari County Fishermen's Co-op warehouse (pos = front face centre; w, deckD, deckY): the warehouse gable (out of play) with its sign, a narrow awning over the back of the spawn deck (an open roof terrace), railings on the deck's side edges, wall lanterns.",
    params: { w: 'warehouse width', deckD: 'spawn deck depth', deckW: 'spawn deck width', deckY: 'deck height' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = o.w ?? 22, dD = o.deckD ?? 8.3, dW = o.deckW ?? 18, dY = o.deckY ?? 3.4, hW = 8;
      // the warehouse face (the level block is 2.5 deep; the bulk continues behind it, off-limits)
      B.box('paint', K.cedar, W, hW, 5.5, 0, hW / 2, -5.25, { r: 0.05 });
      colBox(B, 0, 0, -5.25, W, hW, 5.5, ROOF);
      for (let k = 0; k <= 8; k++) pbox(B, NS('wood'), K.beam, 0.14, hW - dY - 0.2, 0.04, -W / 2 + (k * W) / 8, dY + 0.2 + (hW - dY - 0.2) / 2, 0.02);
      pbox(B, 'wood', K.beam, W, 0.22, 0.06, 0, dY + 3.0, 0.03);
      roof(B, W, 8, hW, { f: 1, pitch: 0.48, ov: 0.8, alongX: true, z: -4, col: true, seed: 3 });
      // the sign across the front above the awning
      B.box('wood', K.cedarDk, 12.4, 1.1, 0.1, 0, dY + 3.75, 0.02, { r: 0.03 });
      pbox(B, NS('paint'), K.cream, 12.2, 0.96, 0.01, 0, dY + 3.75, 0.08);
      letters(B, "FISHERMEN'S CO-OP", { h: 0.52, x: 0, y: dY + 3.5, z: 0.09, c: K.indigo, flat: true, wt: 0.2, track: 0.11 });
      letters(B, 'CALAMARI COUNTY', { h: 0.2, x: 0, y: dY + 4.06, z: 0.09, c: K.red, flat: true, wt: 0.2, track: 0.2 });
      // roller doors either side below the deck level (on the warehouse face, visible from the dock and the quay ramp)
      pbox(B, NS('metal'), K.galv, 1.6, 2.6, 0.04, dW / 2 + 1.0, 1.3, 0.03);
      for (let k = 0; k < 13; k++) pbox(B, NS('metal'), K.steel, 1.6, 0.02, 0.03, dW / 2 + 1.0, 0.1 + k * 0.2, 0.06);
      // a narrow pent awning against the warehouse face over the back of the spawn deck (no posts, no roof over the
      // deck itself: an open roof terrace like Halyard's, so the player's camera at the spawn sees mid unobstructed)
      const yA = dY + 3.02, aD = 0.9;
      for (const px of [-dW / 2 + 0.6, -dW / 6, dW / 6, dW / 2 - 0.6]) pbox(B, 'wood', K.beam, 0.12, 0.12, aD, px, yA - 0.1, aD / 2, { rx: 0.35 });
      B.push(0, yA, 0, -0.22, 0);
      pbox(B, 'paint', K.kawara, dW + 0.6, 0.07, aD + 0.2, 0, 0.07, (aD + 0.2) / 2);
      pbox(B, NS('wood'), '#7a5e46', dW + 0.5, 0.03, aD + 0.1, 0, -0.03, (aD + 0.2) / 2);
      B.add(NS('paint'), cylGeo(0.06, 0.06, dW + 0.6, 8), shade(K.kawara, 0.8), 0, 0.08, aD + 0.2, { rz: HP });
      snowCap(B, 0, 0.1, (aD + 0.2) / 2, dW + 0.4, aD, 0.22);
      B.pop();
      icicles(B, -dW / 2 + 0.3, dW / 2 - 0.3, yA - 0.36, aD + 0.1, 15, 0.18);
      // wall lanterns on the warehouse face either side of the deck's back
      for (const px of [-5, 0, 5]) { B.box(NS('metal'), K.iron, 0.05, 0.05, 0.34, px, dY + 2.3, 0.17); B.lathe('paint', '#3d5a52', [[0.02, 0.1], [0.08, 0.08], [0.2, -0.02], [0.21, -0.04], [0, -0.04]], px, dY + 2.34, 0.36, { seg: 12 }); B.sph(NS('glow'), K.lit, 0.07, px, dY + 2.28, 0.36, { ws: 8, hs: 6, glow: 1.8 }); }
      // railings along the deck's open side edges (x ends), leaving the front open (drops) — rail colliders
      for (const sx of [-1, 1]) {
        const x = sx * (dW / 2 - 0.08);
        for (let k = 0; k <= 4; k++) B.box(NS('wood'), K.beam, 0.08, 1.0, 0.08, x, dY + 0.5, 0.4 + (k * (dD - 2.2)) / 4, { r: 0.01 });
        pbox(B, 'wood', K.beam, 0.1, 0.08, dD - 2.1, x, dY + 1.0, 0.4 + (dD - 2.2) / 2);
        pbox(B, NS('wood'), K.beam, 0.06, 0.06, dD - 2.1, x, dY + 0.55, 0.4 + (dD - 2.2) / 2);
        snowCap(B, x, dY + 1.04, 0.4 + (dD - 2.2) / 2, 0.14, dD - 2.1, 0.05, { ry: 0 });
      }
    },
  };

  // a platform / street bench: timber slats on iron frames, snow on the seat end
  D.calamari_bench = {
    desc: 'Timber bench on iron frames (1.6 m), a little snow at one end. Collider (low cover).',
    params: { length: 'm' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 1.6;
      for (const sx of [-1, 1]) { B.box('metal', K.iron, 0.05, 0.42, 0.42, sx * (L / 2 - 0.15), 0.21, 0, { r: 0.01 }); B.box(NS('metal'), K.iron, 0.05, 0.45, 0.05, sx * (L / 2 - 0.15), 0.65, -0.19, { r: 0.01, rx: -0.15 }); }
      for (let k = 0; k < 4; k++) pbox(B, 'wood', K.woodLt, L, 0.035, 0.09, 0, 0.43, -0.15 + k * 0.1);
      for (let k = 0; k < 2; k++) pbox(B, 'wood', K.woodLt, L, 0.09, 0.03, 0, 0.62 + k * 0.14, -0.22, { rx: -0.15 });
      snowCap(B, L / 2 - 0.35, 0.45, 0, 0.6, 0.36, 0.06);
      if (o.col !== false) colBox(B, 0, 0, 0, L, 0.5, 0.48);
    },
  };

  return { entrance, noren, window_, kerosene, downpipe, woodpile, item, clock, goods };
}
