// Mount Nantai — the observatory: the dome + its front wall with the name, the control building's dressing, the control
// room with its weather mast, the roll-off-roof hut, the Stevenson screen, telescope piers. (registered by props.js)
export function registerObservatory(D, H, T) {
  const { THREE, PI, TAU, HP } = H;
  const { K, NS, GB, tpl, kf, pbox, ccyl, seg, colC, ROOF, RAIL, letters, boardSign, railing, rock } = T;

  // ------------------------------------------------------------------------------------------ dome geometry
  // hemisphere shell with the shutter slit cut out (a wedge round the +Z meridian), panel ribs, the dome ring
  const SLIT = 0.15;   // half-width of the slit wedge (rad)
  const shellGeo = (R) => tpl('domeShell|' + R, () => new THREE.SphereGeometry(R, 48, 16, HP + SLIT, TAU - 2 * SLIT, 0, HP));
  const innerGeo = (R) => tpl('domeInner|' + R, () => new THREE.SphereGeometry(R, 24, 8, 0, TAU, 0, HP));
  // a meridian rib at azimuth phi (three's sphere convention: phi 0 = −X, π/2 = +Z) from the ring to the crown
  const ribGeo = (R, phi, th1 = HP) => tpl(['domeRib', R, phi, th1].map(kf).join('|'), () => {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const th = (th1 * i) / 12; pts.push([-Math.cos(phi) * Math.sin(HP - th) * R, Math.sin(th) * R, Math.sin(phi) * Math.sin(HP - th) * R]); }
    return H.tubeGeo(pts, 0.05, 5);
  });
  // the shutter leaves: raised curved strips either side of the slit
  const leafGeo = (R, side) => tpl(['domeLeaf', R, side].map(kf).join('|'), () => {
    const g = new GB(), n = 16, w0 = SLIT + 0.004, w1 = SLIT + 0.11;
    for (let i = 0; i <= n; i++) {
      const th = (HP * 0.97 * i) / n, ct = Math.cos(th), st = Math.sin(th);
      for (const [k, w] of [[0, w0], [1, w1]]) {
        const phi = HP + side * w, x = -Math.cos(phi) * ct * R, z = Math.sin(phi) * ct * R, y = st * R;
        g.v(x, y, z, x / R, y / R, z / R);
        void k;
      }
    }
    for (let i = 0; i < n; i++) g.quad(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    return g.geo();
  });

  // ------------------------------------------------------------------------------------------ the observatory
  // pos = the back of the forecourt (world z −45.4, y 0), front = +Z (the arena). The front wall (layout block
  // 'dome-drum', 3.8 → 7.2) gets its facade; the drum and dome stand behind it; rocks seat it on the summit.
  D.nantai_observatory = {
    desc: 'Nantai Observatory: the white dome with its shutter slit, the front wall with the name, the rocks under it',
    build(B, o) {
      const R = 6.6, zc = -7.0, yb = 8.4;   // dome radius, centre z (local), dome base height
      // drum: white panels, ribs, two bands; a darker plinth course where it meets the wall top
      B.add('paint', T.cylGeo(R - 0.1, R - 0.1, yb - 6.6, 48, true), K.white, 0, (yb + 6.6) / 2, zc);
      for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; pbox(B, NS('paint'), K.whiteSh, 0.06, yb - 6.7, 0.05, Math.sin(a) * (R - 0.08), (yb + 6.7) / 2, zc + Math.cos(a) * (R - 0.08), { ry: a }); }
      B.tor('metal', K.steelLt, R - 0.06, 0.06, 0, yb - 0.05, zc, { rx: HP, rs: 6, ts: 64 });
      B.tor('paint', K.whiteSh, R - 0.07, 0.04, 0, 7.6, zc, { rx: HP, rs: 5, ts: 64 });
      // dome shell (slit toward the arena), ribs every 15°, the leaves, the crown cap
      B.push(0, yb, zc);
      B.add('gloss', shellGeo(R), K.dome, 0, 0, 0);
      for (let i = 0; i < 24; i++) { const phi = HP + SLIT + 0.2 + ((TAU - 2 * SLIT - 0.4) * i) / 23; B.add('paint', ribGeo(R + 0.02, phi, HP * 0.94), K.domeSh, 0, 0, 0); }
      for (const s of [-1, 1]) { B.add('metal', leafGeo(R + 0.05, s), K.steelLt, 0, 0, 0); B.add('paint', ribGeo(R + 0.08, HP + s * (SLIT + 0.11), HP * 0.97), K.steel, 0, 0, 0); B.add('paint', ribGeo(R + 0.06, HP + s * (SLIT + 0.01), HP * 0.97), K.steelDk, 0, 0, 0); }
      B.add('glow', innerGeo(R - 0.25), '#5c2820', 0, 0, 0, { sx: -1, glow: 1.2 });
      B.cyl('metal', K.steelLt, 0.5, 0.35, 0, R - 0.02, 0, { seg: 16 });
      B.sph('metal', K.steel, 0.2, 0, R + 0.25, 0, { ws: 10, hs: 6 });
      // the telescope inside, pointing out through the slit at the sky over the arena
      B.push(0, 0.4, 0.4, 0, -0.75, 0);
      B.cyl('paint', K.white, 0.55, 5.2, 0, 1.2, 0, { seg: 18 });
      B.cyl('paint', K.navy, 0.58, 0.5, 0, -1.2, 0, { seg: 18 });
      B.cyl('paint', K.black, 0.5, 0.06, 0, 3.82, 0, { seg: 18 });
      B.cyl('metal', K.steel, 0.2, 1.4, 0.7, 0.4, 0, { seg: 10 });
      B.pop();
      B.cyl('paint', K.navy, 0.9, 2.2, 0, -1.2, 0, { seg: 12 });
      B.pop();
      // the facade on the front wall (z 0 = the wall face): the name, a door + canopy, lanterns, a plaque
      const fz = 0.0;
      letters(B, 'NANTAI OBSERVATORY', { h: 0.56, x: 0, y: 6.3, z: fz, c: K.navy, dep: 0.1, wt: 0.17, track: 0.14 });
      pbox(B, NS('paint'), K.navy, 12.6, 0.05, 0.03, 0, 6.16, fz + 0.015);
      // double door (x −3.2), steel canopy, a plaque
      B.box('paint', K.steelDk, 2.1, 2.2, 0.12, -3.2, 3.8 + 1.1, fz + 0.06, { r: 0.02 });
      for (const s of [-1, 1]) { B.box('paint', K.teal, 0.95, 2.05, 0.06, -3.2 + s * 0.5, 3.8 + 1.03, fz + 0.13, { r: 0.015 }); pbox(B, NS('metal'), K.steelLt, 0.04, 0.3, 0.05, -3.2 + s * 0.12, 3.8 + 1.05, fz + 0.18); pbox(B, NS('paint'), K.glass, 0.55, 0.7, 0.02, -3.2 + s * 0.5, 3.8 + 1.5, fz + 0.165); }
      B.box('metal', K.steel, 2.8, 0.1, 1.1, -3.2, 3.8 + 2.35, fz + 0.55, { r: 0.02 });
      for (const s of [-1, 1]) seg(B, 'metal', K.steelDk, [-3.2 + s * 1.3, 3.8 + 2.35, fz + 1.05], [-3.2 + s * 1.3, 3.8 + 2.85, fz + 0.02], 0.04, 0.04, { round: true });
      boardSign(B, ['DOME 1', 'STAFF ONLY'], -1.1, 3.8 + 1.5, { h: 0.09, z: fz, board: K.white, c: K.navy, wt: 0.2 });
      boardSign(B, ['NANTAI OBSERVATORY', 'EST. 1962 · 2,657 FT'], 2.6, 3.8 + 1.55, { h: 0.075, z: fz, board: K.brass, c: K.grizzBrown, wt: 0.2, lead: 1.7 });
      // wall lanterns (warm at dusk)
      for (const x of [-5.0, -1.4, 5.2]) {
        pbox(B, NS('metal'), K.iron, 0.12, 0.2, 0.18, x, 3.8 + 2.25, fz + 0.09);
        B.box('glow', K.lamp, 0.16, 0.26, 0.16, x, 3.8 + 2.0, fz + 0.2, { glow: 0.9 });
        pbox(B, NS('metal'), K.iron, 0.2, 0.04, 0.2, x, 3.8 + 2.15, fz + 0.2);
      }
      // wall coping + a ribbed downpipe at each end
      pbox(B, 'paint', K.whiteSh, 18.2, 0.12, 0.7, 0, 7.26, -0.3);
      for (const x of [-8.7, 8.7]) ccyl(B, 'metal', K.steel, 0.06, 3.4, x, 3.8 + 1.7, fz + 0.12, { seg: 8 });
      // the summit rocks the building sits on (behind and either side of the drum)
      const rk = [[-9.5, 0, -6, 4.2, 5.5, 3.8, 3], [9.8, 0, -7.5, 4.5, 6.2, 4.2, 5], [-6, 2, -12.5, 5, 6, 3.5, 7], [6.5, 1.5, -13, 5.5, 7.2, 4, 11], [0, 3, -15, 6.5, 6, 4, 13], [-12.5, -1, -2.5, 3.2, 3.6, 3, 2], [12.8, -1, -3, 3, 3.2, 3.2, 4]];
      for (const [x, y, z, sx, sy, sz, sd] of rk) rock(B, x, y, z, sx, sy, sz, sd, { c: K.granite, det: 2 });
    },
  };

  // ------------------------------------------------------------------------------------------ control building
  // dressing on the podium's faces (pos = the podium's front-right corner at the first terrace: world [9, 1.3, −36.5])
  // — the front face (+Z, x −6…0 local) and the east face (+X, z −8.9…0 local), 1.3 → 3.6: a granite plinth course,
  // windows, the entrance door with a canopy, a noticeboard. Plus the forecourt's coping on the podium's edges.
  function windowF(B, x, y, w, h, z = 0, lit = 0.55) {
    B.box('paint', K.whiteSh, w + 0.16, h + 0.16, 0.08, x, y, z + 0.04, { r: 0.02 });
    B.box('glow', '#e7c48c', w, h, 0.02, x, y, z + 0.085, { glow: lit });
    for (const k of [-1, 1]) pbox(B, NS('paint'), K.steelDk, 0.04, h, 0.03, x + k * w * 0.2, y, z + 0.1);
    pbox(B, NS('paint'), K.steelDk, w, 0.04, 0.03, x, y + h * 0.1, z + 0.1);
    pbox(B, 'paint', K.graniteLt, w + 0.3, 0.07, 0.16, x, y - h / 2 - 0.1, z + 0.08);
  }
  D.nantai_controlbuilding = {
    desc: 'control building dressing: plinth course, windows, the entrance, a noticeboard',
    build(B) {
      // front face (z 0), x from −6 (the grand stair's edge) … 0 (the east corner)
      pbox(B, 'paint', K.graniteDk, 6, 0.45, 0.06, -3, 0.22, 0.03);
      windowF(B, -4.4, 1.35, 1.1, 1.0);
      // the entrance: door + canopy + sign
      const dx = -1.6;
      B.box('paint', K.steelDk, 1.3, 2.25, 0.1, dx, 1.12, 0.05, { r: 0.02 });
      B.box('paint', K.teal, 1.1, 2.12, 0.05, dx, 1.06, 0.11, { r: 0.015 });
      pbox(B, NS('paint'), K.glass, 0.5, 0.9, 0.02, dx, 1.55, 0.14);
      pbox(B, NS('metal'), K.steelLt, 0.04, 0.3, 0.05, dx - 0.4, 1.05, 0.16);
      B.box('metal', K.steel, 1.9, 0.08, 0.9, dx, 2.3, 0.45, { r: 0.02 });
      for (const s of [-1, 1]) seg(B, 'metal', K.steelDk, [dx + s * 0.85, 2.3, 0.85], [dx + s * 0.85, 2.55, 0.02], 0.03, 0.03, { round: true });
      boardSign(B, 'VISITORS', dx, 2.57, { h: 0.11, board: K.navy, c: K.white, wt: 0.2 });
      // east face (x 0), world z from the front corner back 8.9 m: plinth, noticeboard, a downpipe, vents
      B.push(0, 0, 0, HP);
      pbox(B, 'paint', K.graniteDk, 8.9, 0.45, 0.06, 4.45, 0.22, 0.03);
      B.box('wood', K.timberDk, 1.1, 0.85, 0.06, 0.75, 1.45, 0.05, { r: 0.02 });
      pbox(B, NS('paint'), K.grizz, 0.44, 0.62, 0.01, 0.52, 1.45, 0.085);
      pbox(B, NS('paint'), K.grizzCream, 0.36, 0.18, 0.012, 0.52, 1.56, 0.09);
      pbox(B, NS('paint'), K.grizzBrown, 0.26, 0.26, 0.012, 0.52, 1.32, 0.09);
      pbox(B, NS('paint'), K.signLt, 0.44, 0.62, 0.01, 1.02, 1.45, 0.085);
      pbox(B, NS('paint'), K.green, 0.34, 0.28, 0.012, 1.02, 1.52, 0.09);
      for (const x of [3.6, 6.2]) { B.box('metal', K.steel, 0.5, 0.3, 0.06, x, 2.0, 0.03, { r: 0.01 }); for (let i = 0; i < 4; i++) pbox(B, NS('metal'), K.steelDk, 0.44, 0.02, 0.02, x, 1.9 + i * 0.065, 0.07); }
      ccyl(B, 'metal', K.steel, 0.05, 2.3, 8.6, 1.15, 0.08, { seg: 8 });
      B.pop();
    },
  };

  // ------------------------------------------------------------------------------------------ control room + mast
  // pos = the cabin's floor centre (world [7.2, 3.8, −43.8]); the layout block is 3.6 (x) × 3.2 (z) × 2.6. Timber-and-
  // steel upper storey: steel posts, larch cladding (the block's weatherboard), a band of windows over the spawn, a
  // flat roof with the weather mast (anemometer spinning, wind vane, lightning rod), a small solar panel.
  H.spinTemplate('nantai_anemo', () => {
    const parts = [];
    const g = new GB();
    void g;
    const cup = new THREE.SphereGeometry(0.075, 10, 6, 0, TAU, 0, HP);
    const arm = new THREE.CylinderGeometry(0.012, 0.012, 0.36, 5);
    const hub = new THREE.CylinderGeometry(0.035, 0.035, 0.07, 8);
    const out = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      const m1 = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeTranslation(0.18, 0, 0)).multiply(new THREE.Matrix4().makeRotationZ(HP));
      const m2 = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeTranslation(0.36, 0, 0)).multiply(new THREE.Matrix4().makeRotationX(HP));
      out.push(arm.clone().applyMatrix4(m1), cup.clone().applyMatrix4(m2));
    }
    out.push(hub);
    void parts;
    const merged = out.map((x) => (x.index ? x.toNonIndexed() : x));
    for (const x of merged) { x.deleteAttribute('uv'); }
    let n = 0; for (const x of merged) n += x.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), colr = new Float32Array(n * 3).fill(0.85);
    let o = 0; for (const x of merged) { pos.set(x.attributes.position.array, o * 3); nor.set(x.attributes.normal.array, o * 3); o += x.attributes.position.count; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    return geo;
  });
  D.nantai_controlroom = {
    desc: 'the control room cabin: posts, window band, flat roof, weather mast',
    build(B) {
      const W = 3.6, Dd = 3.2, Hh = 2.6;
      // steel corner posts + a sill band
      for (const [x, z] of [[-W / 2, -Dd / 2], [W / 2, -Dd / 2], [-W / 2, Dd / 2], [W / 2, Dd / 2]]) pbox(B, 'metal', K.steelDk, 0.14, Hh, 0.14, x, Hh / 2, z);
      pbox(B, 'metal', K.steelDk, W + 0.1, 0.1, Dd + 0.1, 0, 0.85, 0);
      // window band over the forecourt (the west face, −X) and round the front (+Z)
      B.box('glow', '#e9c690', 0.03, 1.0, Dd - 0.5, -W / 2 - 0.02, 1.55, 0, { glow: 0.7 });
      for (let i = 0; i <= 3; i++) pbox(B, NS('metal'), K.steelDk, 0.06, 1.05, 0.05, -W / 2 - 0.04, 1.55, -Dd / 2 + 0.25 + ((Dd - 0.5) * i) / 3);
      pbox(B, NS('metal'), K.steelDk, 0.06, 0.05, Dd - 0.4, -W / 2 - 0.04, 2.08, 0);
      B.box('glow', '#e9c690', 1.4, 1.0, 0.03, 0.7, 1.55, Dd / 2 + 0.02, { glow: 0.7 });
      pbox(B, NS('metal'), K.steelDk, 1.45, 0.05, 0.05, 0.7, 2.08, Dd / 2 + 0.04);
      // door (front, left)
      B.box('paint', K.teal, 0.9, 2.05, 0.05, -1.05, 1.03, Dd / 2 + 0.03, { r: 0.015 });
      pbox(B, NS('metal'), K.steelLt, 0.04, 0.25, 0.05, -0.7, 1.0, Dd / 2 + 0.07);
      // flat roof: overhanging slab, fascia
      B.box('paint', K.steelDk, W + 0.5, 0.16, Dd + 0.5, 0, Hh + 0.08, 0, { r: 0.03 });
      B.box('paint', K.larchDk, W + 0.56, 0.08, Dd + 0.56, 0, Hh + 0.02, 0, { r: 0.02 });
      // solar panel
      B.push(0.9, Hh + 0.25, 0.9, 0, -0.5);
      B.box('metal', K.screen, 1.3, 0.04, 0.9, 0, 0, 0, { r: 0.01 });
      B.pop();
      pbox(B, NS('metal'), K.steelDk, 0.05, 0.3, 0.05, 0.9, Hh + 0.12, 0.6);
      // lattice mast on the roof (−X back corner), anemometer, vane, rod
      const mx = -0.9, mz = -0.8, m0 = Hh + 0.16, mh = 4.2;
      const legs = [[0.22, 0], [-0.11, 0.19], [-0.11, -0.19]];
      for (const [lx, lz] of legs) seg(B, 'metal', K.steelLt, [mx + lx * 1.4, m0, mz + lz * 1.4], [mx + lx * 0.5, m0 + mh, mz + lz * 0.5], 0.035, 0.035, { round: true });
      for (let k = 0; k < 7; k++) {
        const y0 = m0 + (mh * k) / 7, y1 = m0 + (mh * (k + 1)) / 7, s0 = 1.4 - (0.9 * k) / 7, s1 = 1.4 - (0.9 * (k + 1)) / 7;
        for (let i = 0; i < 3; i++) { const a = legs[i], b = legs[(i + 1) % 3]; seg(B, NS('metal'), K.steelLt, [mx + a[0] * s0, y0, mz + a[1] * s0], [mx + b[0] * s1, y1, mz + b[1] * s1], 0.015, 0.015, { round: true, seg: 4 }); }
      }
      const top = m0 + mh;
      ccyl(B, 'metal', K.steel, 0.03, 1.2, mx, top + 0.6, mz, { seg: 6 });
      B.spin('nantai_anemo', mx, top + 1.25, mz, { speed: 5 });
      // wind vane on an arm
      seg(B, 'metal', K.steel, [mx, top + 0.7, mz], [mx + 0.7, top + 0.7, mz], 0.025, 0.025, { round: true });
      ccyl(B, 'metal', K.steel, 0.015, 0.4, mx + 0.7, top + 0.85, mz, { seg: 5 });
      B.box('metal', K.red, 0.5, 0.18, 0.02, mx + 0.8, top + 1.0, mz, { r: 0.005 });
      pbox(B, 'metal', K.steelDk, 0.12, 0.05, 0.05, mx + 0.52, top + 1.0, mz);
      // lightning rod + aircraft warning light (blinks)
      ccyl(B, 'metal', K.copper, 0.012, 1.3, mx, top + 1.85, mz, { seg: 5 });
      B.blink('#ff4a3a', mx + 0.08, top + 1.2, mz, { size: 0.05, rate: 0.5 });
      // a thermometer box on the mast
      B.box('paint', K.white, 0.2, 0.3, 0.14, mx, m0 + 1.5, mz + 0.35, { r: 0.02 });
    },
  };

  // Stevenson screen: a white louvred box on four legs (pos = ground centre, front +Z)
  D.nantai_stevenson = {
    desc: 'Stevenson screen on legs',
    build(B) {
      for (const [x, z] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) pbox(B, 'wood', K.whiteSh, 0.06, 1.1, 0.06, x, 0.55, z);
      B.box('paint', K.white, 0.8, 0.62, 0.66, 0, 1.4, 0, { r: 0.02 });
      for (let i = 0; i < 6; i++) pbox(B, NS('paint'), K.whiteSh, 0.72, 0.02, 0.02, 0, 1.18 + i * 0.09, 0.335, { rx: -0.5 });
      B.box('paint', K.white, 0.94, 0.07, 0.8, 0, 1.76, 0, { r: 0.02 });
      B.box('paint', K.whiteSh, 0.9, 0.05, 0.76, 0, 1.82, 0, { r: 0.02 });
      colC(B, 0, 0, 0, 0.8, 1.8, 0.66);
    },
  };

  // telescope on a concrete pier (pos = ground; front +Z = where it points): the pier is cover, the scope on top
  D.nantai_telepier = {
    desc: 'refractor on a concrete pier',
    build(B, o) {
      const ph = o.h ?? 1.05;
      B.lathe('paint', K.concrete, [[0, 0], [0.34, 0], [0.34, 0.08], [0.26, 0.14], [0.24, ph - 0.06], [0.3, ph - 0.02], [0.3, ph], [0, ph]], 0, 0, 0, { seg: 14 });
      B.box('metal', K.steelDk, 0.26, 0.18, 0.26, 0, ph + 0.09, 0, { r: 0.02 });
      B.push(0, ph + 0.28, 0, 0, -0.6);
      B.cyl('paint', K.white, 0.1, 1.3, 0, 0, 0.12, { rx: HP, seg: 12 });
      B.cyl('paint', K.navy, 0.115, 0.28, 0, 0, 0.72, { rx: HP, seg: 12 });
      B.cyl('metal', K.black, 0.05, 0.2, 0, 0, -0.6, { rx: HP, seg: 8 });
      B.cyl('metal', K.steel, 0.035, 0.3, 0.12, 0.1, 0.2, { rx: HP, seg: 6 });
      B.pop();
      B.cyl('metal', K.steel, 0.04, 0.4, 0.2, ph + 0.18, 0, { rz: HP, seg: 6 });
      B.sph('metal', K.steelDk, 0.07, 0.42, ph + 0.18, 0, { ws: 8, hs: 6 });
      colC(B, 0, 0, 0, 0.68, ph + 0.2, 0.68);
    },
  };

  // the roll-off-roof hut (layout block 3.6 × 3.2 × 2.6 at the first terrace; pos = floor centre, front +Z): its roof
  // panel, the steel frame it rolls out onto (east, +X), a door, a small sign
  D.nantai_rolloff = {
    desc: 'roll-off-roof observatory hut dressing',
    build(B, o = {}) {
      const W = 3.6, Dd = 3.2, Hh = 2.6;
      // roof panel (low-pitched, overhanging), its wheels on the rails
      B.box('metal', K.steelLt, W + 0.3, 0.12, Dd + 0.36, 0, Hh + 0.1, 0, { r: 0.03 });
      B.box('metal', K.steel, W + 0.34, 0.06, 0.2, 0, Hh + 0.19, 0, { r: 0.02 });
      for (const z of [-Dd / 2 + 0.2, Dd / 2 - 0.2]) {
        seg(B, 'metal', K.steelDk, [W / 2, Hh - 0.05, z], [W / 2 + 3.4, Hh - 0.05, z], 0.1, 0.12, {});
        for (const x of [W / 2 + 1.7, W / 2 + 3.3]) { pbox(B, 'metal', K.steelDk, 0.12, Hh - 0.1, 0.12, x, (Hh - 0.1) / 2, z); colC(B, x, 0, z, 0.16, Hh, 0.16); }
        for (const x of [-W / 2 + 0.4, W / 2 - 0.4]) B.cyl('metal', K.black, 0.07, 0.05, x, Hh - 0.02, z + (z > 0 ? 0.04 : -0.04), { rx: HP, seg: 10 });
      }
      seg(B, 'metal', K.steelDk, [W / 2 + 3.3, Hh - 0.4, -Dd / 2 + 0.2], [W / 2 + 3.3, Hh - 0.4, Dd / 2 - 0.2], 0.08, 0.08, {});
      // door (front) + sign
      B.box('paint', K.larchDk, 0.9, 2.0, 0.05, -0.8, 1.0, Dd / 2 + 0.03, { r: 0.015 });
      pbox(B, NS('metal'), K.steel, 0.04, 0.22, 0.05, -0.45, 1.0, Dd / 2 + 0.07);
      boardSign(B, o.label ?? 'ROLL-OFF 2', 0.8, 1.9, { h: 0.1, z: Dd / 2, board: K.navy, c: K.white, wt: 0.2 });
      // a corner trim
      for (const [x, z] of [[-W / 2, -Dd / 2], [W / 2, -Dd / 2], [-W / 2, Dd / 2], [W / 2, Dd / 2]]) pbox(B, 'paint', K.whiteSh, 0.1, Hh, 0.1, x, Hh / 2, z);
    },
  };


  // a small satellite dish on a post (the observatory's data link): pos = ground, it looks toward +Z and up
  D.nantai_dish = {
    desc: 'satellite dish on a post',
    build(B) {
      ccyl(B, 'metal', K.steelDk, 0.07, 1.6, 0, 0.8, 0, { seg: 8 });
      B.box('paint', K.concrete, 0.6, 0.2, 0.6, 0, 0.1, 0, { r: 0.03 });
      B.push(0, 1.7, 0, 0, -0.7);
      B.lathe('metal', K.white, [[0, -0.02], [0.35, 0.04], [0.62, 0.2], [0.64, 0.22], [0.6, 0.23], [0.33, 0.07], [0, 0.01]], 0, 0, 0, { seg: 20, rx: HP });
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; seg(B, NS('metal'), K.steelLt, [Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.2], [0, 0, 0.7], 0.02, 0.02, { round: true, seg: 4 }); }
      B.cyl('metal', K.steelDk, 0.06, 0.12, 0, 0, 0.72, { rx: HP, seg: 8 });
      B.pop();
      colC(B, 0, 0, 0, 0.6, 2.3, 0.6);
    },
  };


  // the old weather hut (layout block 3.6 × 2.8 × 2.3 on the ridge root; pos = its floor centre, front +Z): a pitched
  // slate roof with a stone chimney, a plank door, a small window, a rain gauge and an old barometer board by the door
  D.nantai_weatherhut = {
    desc: 'old stone weather hut: slate roof, chimney, door, window, rain gauge',
    build(B) {
      const W = 3.6, Dd = 2.8, Hh = 2.3, rise = 1.0;
      const roofGeo = tpl('whRoof', () => { const g = new T.GB(); const e = 0.25, x0 = -W / 2 - e, x1 = W / 2 + e, z0 = -Dd / 2 - e, z1 = Dd / 2 + e;
        for (const s of [-1, 1]) { const zs = s * (Dd / 2 + e), nz = s * 0.7, ny = 0.7; const a = g.v(x0, 0, zs, 0, ny, nz), b = g.v(x1, 0, zs, 0, ny, nz), c = g.v(x1, rise, 0, 0, ny, nz), d = g.v(x0, rise, 0, 0, ny, nz); g.quad(a, b, c, d); }
        for (const s of [-1, 1]) { const x = s * (W / 2); const a = g.v(x, 0, z0 + e, s, 0, 0), b = g.v(x, 0, z1 - e, s, 0, 0), c = g.v(x, rise - 0.18, 0, s, 0, 0); g.tri(a, b, c); }
        return g.geo(); });
      B.add('paint', roofGeo, '#4f5660', 0, Hh, 0);
      for (let i = 1; i < 5; i++) for (const s of [-1, 1]) pbox(B, NS('paint'), '#434952', W + 0.5, 0.02, 0.02, 0, Hh + (rise * i) / 5, s * (Dd / 2 + 0.25) * (1 - i / 5));
      B.box('paint', K.graniteDk, W + 0.56, 0.08, 0.14, 0, Hh + rise + 0.02, 0, { r: 0.02 });
      B.box('paint', K.granite, 0.55, 1.1, 0.55, W / 2 - 0.6, Hh + 0.9, -0.5, { r: 0.04 });
      B.box('paint', K.graniteDk, 0.62, 0.08, 0.62, W / 2 - 0.6, Hh + 1.48, -0.5, { r: 0.02 });
      // door + window on the front
      B.box('wood', K.timberDk, 0.9, 1.9, 0.05, -0.8, 0.95, Dd / 2 + 0.03, { r: 0.015 });
      for (let i = 0; i < 4; i++) pbox(B, NS('wood'), K.timber, 0.2, 1.8, 0.02, -1.1 + i * 0.2, 0.95, Dd / 2 + 0.06);
      B.box('paint', K.whiteSh, 0.8, 0.7, 0.06, 0.8, 1.35, Dd / 2 + 0.03, { r: 0.015 });
      B.box('glow', '#e7c48c', 0.66, 0.56, 0.02, 0.8, 1.35, Dd / 2 + 0.07, { glow: 0.5 });
      pbox(B, NS('paint'), K.whiteSh, 0.04, 0.56, 0.03, 0.8, 1.35, Dd / 2 + 0.09);
      // rain gauge on a post + a barometer board
      pbox(B, 'wood', K.timberDk, 0.08, 0.9, 0.08, W / 2 + 0.6, 0.45, Dd / 2 + 0.3);
      B.cyl('metal', K.copper, 0.09, 0.3, W / 2 + 0.6, 1.05, Dd / 2 + 0.3, { seg: 12 });
      boardSign(B, ['WEATHER', 'STATION 1931'], 0.05, 2.0, { h: 0.075, z: Dd / 2, board: K.whiteSh, c: K.navy, wt: 0.2 });
      colC(B, W / 2 + 0.6, 0, Dd / 2 + 0.3, 0.2, 1.2, 0.2);
    },
  };

  // steel stair railing along a ramp (pos = the ramp's low end, run along local +Z, rise; side = which edge, ±X)
  D.nantai_stairrail = {
    desc: 'a steel handrail along a stair / ramp edge (rail collider)',
    build(B, o) {
      const run = o.run, rise = o.rise, x = o.x ?? 0, h = 1.0;
      railing(B, [x, 0, 0], [x, rise, run], { h, c: o.color ?? K.steel, gap: 1.4 });
      const n = Math.ceil(run / 1.2);
      for (let i = 0; i < n; i++) { const z0 = (run * i) / n, z1 = (run * (i + 1)) / n, y1 = (rise * (i + 1)) / n; B.col(x - 0.06, 0, z0, x + 0.06, y1 + h, z1, RAIL); }
    },
  };
  void ROOF; void PI;
}
