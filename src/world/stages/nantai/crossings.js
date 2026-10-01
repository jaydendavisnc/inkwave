// Mount Nantai — the brook crossings: the Old Stone Bridge's arch + parapet dressing, the weir (sluice gantry, railings,
// white water), the log bridge (split logs, rope rail), the lookout platform and its boardwalk. (registered by props.js)
export function registerCrossings(D, H, T) {
  const { THREE, PI, TAU, HP, extrudeGeo } = H;
  const { K, NS, tpl, kf, hash, pbox, ccyl, seg, colC, RAIL, letters, boardSign, railing, rock } = T;
  const WY = -1.6;

  // ------------------------------------------------------------------------------------------ the Old Stone Bridge
  // pos = the bridge's centre over the water (world [0, 0, −11.8]); it crosses along local Z. Layout: crown (±3, −0.6 →
  // 0.8) over z ±2.8, ramps down to the banks, parapets ±3…3.45 (to 1.7). The water: z ±2 under it.
  // Here: the arch body (a segmental arch in an extruded granite mass under the crown), voussoirs on both faces,
  // cutwater-less abutments, coping on the parapets, end piers at the ramp feet with a carved name stone.
  const archGeo = (span, rise, top, len) => tpl(['arch', span, rise, top, len].map(kf).join('|'), () => {
    // profile in (z, y): the mass from the abutments (|z| ≤ span/2 + 0.9) down to below the water, the arch cut out
    const R = (span * span / 4 + rise * rise) / (2 * rise), cy = WY + rise - R, n = 14, prof = [];
    const hz = span / 2 + 0.9;
    prof.push([-hz, WY - 0.8], [-span / 2, WY - 0.8]);
    for (let i = 0; i <= n; i++) { const a = Math.asin(span / 2 / R) * (1 - (2 * i) / n); prof.push([-R * Math.sin(a), cy + R * Math.cos(a)]); }
    prof.push([span / 2, WY - 0.8], [hz, WY - 0.8], [hz, top], [-hz, top]);
    return extrudeGeo(prof.reverse(), len, 0.04);
  });
  D.nantai_stonebridge = {
    desc: 'Old Stone Bridge dressing: arch body, voussoirs, coping, end piers',
    build(B) {
      const span = 4.0, rise = 1.0, top = -0.62, W = 6.86;
      B.add('paint', archGeo(span, rise, top, W), K.granite, 0, 0, 0);
      // voussoirs: a ring of wedge stones proud of each face, alternating tone
      const R = (span * span / 4 + rise * rise) / (2 * rise), cy = WY + rise - R, a0 = Math.asin(span / 2 / R), nv = 11;
      for (const sx of [-1, 1]) {
        for (let i = 0; i < nv; i++) {
          const a = -a0 + ((2 * a0) * (i + 0.5)) / nv, z = (R + 0.21) * Math.sin(a), y = cy + (R + 0.21) * Math.cos(a);
          pbox(B, 'paint', i % 2 ? K.graniteLt : K.graniteWarm, 0.08, 0.42, (2 * a0 * R) / nv - 0.03, sx * (W / 2 + 0.03), y, z, { rx: a });
        }
        // keystone
        pbox(B, 'paint', K.graniteLt, 0.12, 0.5, 0.42, sx * (W / 2 + 0.05), WY + rise + 0.22, 0);
        // a date stone over the keystone
        B.push(sx * (W / 2 + 0.07), 0.35, 0, sx > 0 ? HP : -HP);
        letters(B, '1911', { h: 0.2, x: 0, y: 0.25, z: 0, c: K.graniteDk, flat: true, wt: 0.2 });
        B.pop();
      }
      // coping on the parapets (crown + ramps): a slightly wider capstone, a hair under the perch top
      for (const sx of [-1, 1]) {
        pbox(B, 'paint', K.graniteLt, 0.6, 0.1, 5.6, sx * 3.225, 1.66, 0);
        for (const sz of [-1, 1]) seg(B, 'paint', K.graniteLt, [sx * 3.225, 1.66, sz * 2.8], [sx * 3.225, 0.91, sz * 4.5], 0.6, 0.1, { plain: true });
      }
      // end piers at the ramp feet (cover): square granite posts with a pyramid cap; a carved name on one
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * 3.75, z = sz * 4.8;
        B.box('paint', K.granite, 0.62, 1.15, 0.62, x, 0.575, z, { r: 0.04 });
        B.box('paint', K.graniteLt, 0.72, 0.1, 0.72, x, 1.2, z, { r: 0.02 });
        B.add('paint', H.latheGeo([[0, 0], [0.34, 0], [0.34, 0.04], [0, 0.26]], 4), K.graniteLt, x, 1.25, z, { ry: PI / 4 });
        colC(B, x, 0, z, 0.72, 1.25, 0.72);
      }
      B.push(3.75, 0.62, 5.12, 0);
      letters(B, 'OLD STONE BRIDGE', { h: 0.075, x: 0, y: 0.1, z: 0, c: K.graniteDk, flat: true, wt: 0.2 });
      B.pop();
      // weathered joints on the arch body's faces: a few stone courses (thin dark lines)
      for (const sx of [-1, 1]) for (const y of [WY + 0.2, WY + 0.6]) for (const sz of [-1, 1]) pbox(B, NS('paint'), K.graniteDk, 0.01, 0.025, 0.85, sx * (W / 2 + 0.005), y, sz * 2.45);
    },
  };

  // ------------------------------------------------------------------------------------------ the weir
  // pos = the crest's centre (world [−22, 0, −9.6]); the crest (layout: concrete, FL → 1.3) runs along local Z (6 m),
  // 2.4 wide. Upstream = −X (the tarn), downstream = +X. Railings along both sides (rail colliders; squids and ink pass,
  // so the concrete face stays a squid route up onto the crest), the sluice gantry over the middle, a gauge board,
  // white water where the sluice lets through.
  D.nantai_weir = {
    desc: 'weir: sluice gantry, railings, gauge, white water',
    build(B) {
      const L = 6.0, Wd = 2.4, top = 1.3;
      // railings (rail colliders) along both edges, full length
      for (const sx of [-1, 1]) {
        railing(B, [sx * (Wd / 2 - 0.06), top, -L / 2 + 0.1], [sx * (Wd / 2 - 0.06), top, L / 2 - 0.1], { h: 1.0, c: K.steelLt, gap: 1.5 });
        B.col(sx * (Wd / 2 - 0.06) - 0.06, top, -L / 2, sx * (Wd / 2 - 0.06) + 0.06, top + 1.05, L / 2, RAIL);
      }
      // concrete detail: a chamfered coping strip on each side face, the upstream cutwater nose, stop-log grooves
      for (const sx of [-1, 1]) pbox(B, 'paint', K.concreteDk, 0.06, 0.18, L, sx * (Wd / 2 + 0.03), top - 0.12, 0);
      for (const sz of [-1.2, 1.2]) pbox(B, NS('paint'), K.concreteDk, 0.04, 2.6, 0.16, -Wd / 2 - 0.02, top - 1.4, sz);
      // the sluice gantry: two steel columns off the crest's sides, a beam at 3.6, the gear housing + handwheel,
      // the rising spindle down to the gate (in the downstream channel)
      const gh = 3.7;
      for (const sz of [-1, 1]) {
        pbox(B, 'metal', K.navy, 0.2, gh - top + 2.9, 0.2, Wd / 2 + 0.25, (gh + top - 2.9) / 2, sz * 0.9);
        colC(B, Wd / 2 + 0.25, top - 0.5, sz * 0.9, 0.24, gh - top + 0.6, 0.24);
      }
      B.box('metal', K.navy, 0.3, 0.3, 2.3, Wd / 2 + 0.25, gh, 0, { r: 0.03 });
      B.box('metal', K.navy, 0.55, 0.5, 0.6, Wd / 2 + 0.25, gh + 0.35, 0, { r: 0.05 });
      B.tor('metal', K.red, 0.34, 0.035, Wd / 2 - 0.05, gh + 0.35, 0, { ry: HP, rs: 6, ts: 22 });
      for (let i = 0; i < 4; i++) seg(B, NS('metal'), K.red, [Wd / 2 - 0.05, gh + 0.35, 0], [Wd / 2 - 0.05, gh + 0.35 + Math.cos((i * PI) / 2) * 0.33, Math.sin((i * PI) / 2) * 0.33], 0.025, 0.025, { round: true });
      ccyl(B, 'metal', K.steelLt, 0.05, gh + 1.6, Wd / 2 + 0.25, (gh - 1.6) / 2 + 0.1, 0, { seg: 8 });
      // the gate: a steel board in the downstream mouth, raised a little (the water comes out under it)
      B.box('metal', K.steelDk, 0.12, 1.5, 1.7, Wd / 2 + 0.25, WY + 1.0, 0, { r: 0.02 });
      // gauge board on the upstream face (depth marks)
      B.box('paint', K.white, 0.03, 1.6, 0.22, -Wd / 2 - 0.035, WY + 1.1, 1.9, { r: 0.01 });
      for (let i = 0; i < 8; i++) pbox(B, NS('paint'), i % 2 ? K.red : K.black, 0.035, 0.08, 0.12, -Wd / 2 - 0.04, WY + 0.4 + i * 0.2, 1.93);
      // white water: foam boiling out under the gate, streaks running off downstream
      for (let i = 0; i < 9; i++) {
        const x = Wd / 2 + 0.4 + i * 0.55 + hash(i) * 0.3, z = (hash(i * 3.1) - 0.5) * (1.4 + i * 0.25);
        B.sph(NS('paint'), K.foam, 0.5 - i * 0.03, x, WY + 0.02, z, { sx: 1.4 - i * 0.05, sy: 0.12, sz: 0.9, ws: 10, hs: 5 });
      }
      // name plate on the crest's lawn end
      B.push(0, top - 0.55, L / 2 + 0.01, 0);
      boardSign(B, ['NANTAI BROOK', 'WEIR No. 1'], 0, 0, { h: 0.11, board: K.navy, c: K.white, wt: 0.2, lead: 1.5 });
      B.pop();
    },
  };

  // ------------------------------------------------------------------------------------------ the log bridge
  // pos = the bridge's centre (world [20.6, 0, −15.39]), local Z along the bridge (5.2 m), turned square across the
  // reach. Layout: the deck O-box 1.6 × 5.2 (−0.3 → 0.42), its ends on the bank shelves. Here: two split larch logs whose cut faces are the deck (a hair under
  // it), bark on the round, stakes at the ends, a rope rail on the downstream side (rail collider) on log posts.
  const halfLogGeo = (r, L) => tpl(['hlog', r, L].map(kf).join('|'), () => new THREE.CylinderGeometry(r, r, L, 12, 1, false, -HP, PI));
  D.nantai_logbridge = {
    desc: 'log bridge: two split logs, stakes, rope rail',
    build(B) {
      const L = 5.2, r = 0.52, yc = 0.415;
      for (const sx of [-1, 1]) {
        B.add('wood', halfLogGeo(r, L), K.bark, sx * 0.42, yc, 0, { rx: HP, rz: 0 });
        // end grain rings
        for (const sz of [-1, 1]) B.add('wood', halfLogGeo(r - 0.04, 0.02), K.larchLt, sx * 0.42, yc, sz * (L / 2 + 0.005), { rx: HP });
      }
      // stakes at both ends
      for (const sz of [-1, 1]) for (const sx of [-1.02, 1.02]) { ccyl(B, 'wood', K.barkDk, 0.08, 0.9, sx, 0.3, sz * (L / 2 - 0.35), { seg: 6 }); }
      // rope rail posts (downstream side = local +X) + sagging rope (rail collider along it)
      const px = 0.98, posts = [-L / 2 + 0.3, 0, L / 2 - 0.3];
      for (const z of posts) { ccyl(B, 'wood', K.bark, 0.07, 1.45, px, 0.72 + 0.1, z, { seg: 6 }); B.sph('wood', K.barkDk, 0.075, px, 1.57, z, { ws: 6, hs: 4 }); }
      for (let i = 0; i < posts.length - 1; i++) {
        const a = posts[i], b = posts[i + 1], pts = [];
        for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push([px, 1.48 - 0.16 * 4 * t * (1 - t), a + (b - a) * t]); }
        B.add('rubber', H.tubeGeo(pts, 0.022, 5), K.rope, 0, 0, 0);
      }
      B.col(px - 0.07, 0.4, -L / 2 + 0.2, px + 0.07, 1.5, L / 2 - 0.2, RAIL);
    },
  };

  // ------------------------------------------------------------------------------------------ the lookout + boardwalk
  // pos = the viewing platform's north-east corner (world [−18.8, 2.6, −15.2]); the deck (layout, timber) spans local
  // x −7.8 … 0 (west, overhanging the cliff by 0.3), z −4 … 0 (south). The boardwalk (layout ramp, 2.4 wide, x −4.4…−2 local) runs north from the deck's
  // north edge down to the weir crest (1.3 lower over 3 m). Railings: the deck's west + north edges (the boardwalk
  // opening left), both sides of the boardwalk. Coin binoculars, a bench, a sign; joists under the overhang.
  D.nantai_lookout = {
    desc: 'viewing platform railings, binoculars, bench, sign; boardwalk railings',
    build(B) {
      const c = K.larchDk;
      const post = (x, z, y = 0, h = 1.05) => { pbox(B, 'wood', c, 0.12, h, 0.12, x, y + h / 2, z); };
      const rail = (a, b, y0a = 0, y0b = 0) => {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 1.5));
        for (let i = 0; i <= n; i++) { const t = i / n; post(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, y0a + (y0b - y0a) * t); }
        seg(B, 'wood', K.larch, [a[0], y0a + 1.05, a[1]], [b[0], y0b + 1.05, b[1]], 0.14, 0.06, {});
        seg(B, 'wood', K.larch, [a[0], y0a + 0.55, a[1]], [b[0], y0b + 0.55, b[1]], 0.1, 0.05, {});
        for (let i = 0; i < n * 2; i++) { const t0 = i / (n * 2), t1 = (i + 1) / (n * 2); B.col(Math.min(a[0] + (b[0] - a[0]) * t0, a[0] + (b[0] - a[0]) * t1) - 0.07, Math.min(y0a, y0b), Math.min(a[1] + (b[1] - a[1]) * t0, a[1] + (b[1] - a[1]) * t1) - 0.07, Math.max(a[0] + (b[0] - a[0]) * t0, a[0] + (b[0] - a[0]) * t1) + 0.07, Math.max(y0a, y0b) + 1.1, Math.max(a[1] + (b[1] - a[1]) * t0, a[1] + (b[1] - a[1]) * t1) + 0.07, RAIL); }
      };
      // deck: west edge, north edge either side of the boardwalk
      rail([-7.73, -3.93], [-7.73, -0.07]);
      rail([-7.73, -0.07], [-4.45, -0.07]);
      rail([-1.95, -0.07], [-0.07, -0.07]);
      // boardwalk (descends 1.3 over 3 m going +Z)
      rail([-4.45, 0.0], [-4.45, 3.0], 0, -1.3);
      rail([-1.95, 0.0], [-1.95, 3.0], 0, -1.3);
      // deck fascia + joists under the overhang (west)
      pbox(B, 'wood', K.larchDk, 0.08, 0.22, 4.0, -7.8, -0.1, -2.0);
      for (let i = 0; i < 5; i++) pbox(B, NS('wood'), K.timberDk, 0.34, 0.12, 0.1, -7.63, -0.22, -0.2 - i * 0.9);
      // brackets under the overhang, down to the cliff
      for (const z of [-0.6, -3.4]) seg(B, 'wood', K.timberDk, [-7.7, -0.2, z], [-7.4, -1.6, z], 0.12, 0.12, {});
      // coin binoculars on a post at the west rail
      ccyl(B, 'metal', K.navy, 0.07, 1.1, -7.1, 0.55, -2.2, { seg: 8 });
      B.push(-7.1, 1.25, -2.2, -HP, -0.12);
      B.box('metal', K.navy, 0.36, 0.26, 0.32, 0, 0, 0, { r: 0.05 });
      for (const s of [-1, 1]) B.cyl('metal', K.black, 0.06, 0.18, s * 0.09, 0.02, 0.22, { rx: HP, seg: 10 });
      B.box('metal', K.yellow, 0.14, 0.1, 0.02, 0, 0.1, -0.17, { r: 0.01 });
      B.pop();
      colC(B, -7.1, 0, -2.2, 0.3, 1.4, 0.3);
      // bench facing west over the tarn
      B.push(-4.8, 0, -3.2, -HP);
      B.box('wood', K.larch, 1.6, 0.06, 0.4, 0, 0.45, 0, { r: 0.015 });
      B.box('wood', K.larch, 1.6, 0.3, 0.05, 0, 0.72, -0.2, { r: 0.015 });
      for (const s of [-1, 1]) B.box('metal', K.iron, 0.06, 0.45, 0.4, s * 0.7, 0.22, 0, { r: 0.01 });
      B.pop();
      colC(B, -4.8, 0, -3.2, 0.5, 0.8, 1.7);
      // sign at the boardwalk head
      ccyl(B, 'wood', K.timberDk, 0.05, 1.2, -1.6, 0.6, -0.5, { seg: 6 });
      B.push(-1.6, 1.25, -0.46, 0);
      boardSign(B, ['LOOKOUT', 'WEIR →'], 0, 0, { h: 0.08, board: K.sign, c: K.signLt, wt: 0.2 });
      B.pop();
    },
  };
  void TAU; void rock; void kf;
}
