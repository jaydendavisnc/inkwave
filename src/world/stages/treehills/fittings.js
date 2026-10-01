// Eco-Forest Treehills — the fittings: the wind turbine (tower, nacelle, plinth; its rotor turns in the backdrop's live
// objects), lamps and bollard lights (glow at dusk), wayfinding totems and the stage sign, railings with rail colliders,
// benches, lawn sprinklers, wall valves.

export function registerFittings(D, H, T) {
  const { PI, TAU, HP, mixc } = H;
  const { K, NS, pbox, ccyl, seg, colC, colSeg, ROOF, RAIL, letters, boardSign, textW, railing, valve, latheGeo, tpl, hash } = T;

  // ------------------------------------------------------------------------------------------ the wind turbine
  // A modern three-blade turbine on a crown: an octagonal plinth (cover; its top off-limits), a tapering white tower,
  // the nacelle facing local +Z (the rotor itself is a live backdrop object, backdrop.js, turning on the hub at
  // (0, hub, 1.9) in this frame). Local: base at y 0.
  D.treehills_turbine = {
    desc: 'wind turbine: plinth, tower, nacelle (the rotor turns in the backdrop)',
    params: { hub: 'hub height above the base (m)' },
    build(B, o) {
      const hub = o.hub ?? 15.5, pr = 1.55, ph = 1.1;
      B.cyl('paint', K.modDk, pr, ph, 0, ph / 2, 0, { seg: 8 });
      B.cyl('gloss', K.trim, pr + 0.06, 0.08, 0, ph, 0, { seg: 8 });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + PI / 8; pbox(B, NS('paint'), K.mod, 0.1, ph - 0.2, 0.04, Math.cos(a) * pr * 0.93, ph / 2, Math.sin(a) * pr * 0.93, { ry: -a + HP }); }
      // a service door and a valve on the plinth (toward the meadow)
      B.push(0, 0, pr * 0.9);
      pbox(B, 'gloss', K.whiteSh, 0.7, 0.9, 0.05, 0, 0.5, 0.03);
      pbox(B, NS('paint'), K.label, 0.4, 0.1, 0.01, 0, 0.82, 0.06);
      B.pop();
      const tower = tpl('thtower|' + hub.toFixed(2), () => latheGeo([[0, ph], [0.78, ph], [0.74, ph + 0.4], [0.62, hub * 0.45], [0.48, hub - 0.4], [0.44, hub], [0, hub]], 20));
      B.add('gloss', tower, K.white, 0, 0, 0, {});
      for (const y of [ph + 0.3, hub * 0.5]) B.cyl(NS('gloss'), K.blue, 0.8 - y * 0.02, 0.18, 0, y, 0, { seg: 20, open: true });
      // nacelle + the badge
      B.push(0, hub + 0.55, 0.3);
      B.box('gloss', K.white, 1.25, 1.15, 3.4, 0, 0, 0, { round: true, r: 0.35 });
      pbox(B, NS('gloss'), K.blue, 0.02, 0.26, 1.6, 0.64, 0.1, -0.2);
      pbox(B, NS('gloss'), K.blue, 0.02, 0.26, 1.6, -0.64, 0.1, -0.2);
      ccyl(B, 'metal', K.steelLt, 0.05, 0.9, 0.3, 0.9, -1.2, { seg: 6 });
      B.blink('#ff4a3a', 0.3, 1.38, -1.2, { size: 0.08, rate: 0.6, lo: 0.3, hi: 6 });
      B.pop();
      B.col(-pr, 0, -pr, pr, ph, pr, ROOF);
      B.col(-0.8, ph, -0.8, 0.8, ph + 3, 0.8, ROOF);
    },
  };

  // ------------------------------------------------------------------------------------------ lights
  // Alterna path light: a slim pale post with a cantilevered ring head (glows at dusk) and a solar cap
  D.treehills_lamp = {
    desc: 'Alterna path light: slim post, glowing ring head (dusk), solar cap',
    build(B, o) {
      const h = o.h ?? 3.4;
      B.cyl('gloss', K.trim, 0.07, h, 0, h / 2, 0, { seg: 10 });
      B.cyl('gloss', K.modDk, 0.12, 0.3, 0, 0.15, 0, { seg: 10 });
      seg(B, 'gloss', K.trim, [0, h - 0.1, 0], [0, h - 0.1, 0.55], 0.06, 0.06);
      B.tor('gloss', K.trim, 0.22, 0.04, 0, h - 0.18, 0.62, { rx: HP, rs: 4, ts: 20 });
      B.tor(NS('glow'), K.lamp, 0.22, 0.03, 0, h - 0.22, 0.62, { rx: HP, rs: 4, ts: 20, glow: 2.4 });
      B.cyl(NS('glow'), K.lamp, 0.19, 0.02, 0, h - 0.24, 0.62, { seg: 16, glow: 2.0 });
      pbox(B, 'gloss', '#2a3a5c', 0.42, 0.03, 0.3, 0, h + 0.05, 0, { rx: 0.25 });
      B.col(-0.1, 0, -0.1, 0.1, h, 0.1, ROOF);
    },
  };
  // low bollard light for the path edges (0.85 m, a glowing band)
  D.treehills_bollard = {
    desc: 'bollard light (0.85 m, glowing band at dusk)',
    build(B) {
      B.cyl('gloss', K.trim, 0.11, 0.85, 0, 0.425, 0, { seg: 12 });
      B.cyl(NS('glow'), K.lamp, 0.113, 0.1, 0, 0.7, 0, { seg: 12, glow: 2.2, open: true });
      B.cyl('gloss', K.modDk, 0.13, 0.06, 0, 0.87, 0, { seg: 12 });
      B.col(-0.12, 0, -0.12, 0.12, 0.9, 0.12, ROOF);
    },
  };

  // ------------------------------------------------------------------------------------------ signs
  // wayfinding totem: a tall slim green board (faces local ±Z) with a biome number and arrows to the places
  D.treehills_totem = {
    desc: 'wayfinding totem: biome number and arrows (two faces)',
    build(B, o) {
      const h = 2.3, w = 0.62;
      pbox(B, 'paint', K.mod, w, h, 0.18, 0, h / 2, 0);
      pbox(B, 'gloss', K.trim, w + 0.06, 0.08, 0.22, 0, h, 0);
      pbox(B, 'gloss', K.modDk, w + 0.1, 0.12, 0.26, 0, 0.06, 0);
      for (const s of [-1, 1]) {
        B.push(0, 0, s * 0.092, s > 0 ? 0 : PI);
        letters(B, o.num ?? '07', { h: 0.28, y: h - 0.42, z: 0.002, c: K.label, wt: 0.2 });
        pbox(B, NS('paint'), K.label, w - 0.12, 0.02, 0.004, 0, h - 0.55, 0.002);
        (o.lines ?? [['< MEADOW'], ['SEED BANK >']]).forEach((ln, i) => letters(B, ln[0], { h: 0.075, y: h - 0.75 - i * 0.16, z: 0.002, c: K.label, wt: 0.2 }));
        B.cyl(NS('gloss'), K.blue, 0.13, 0.01, 0, 0.45, 0.004, { rx: HP, seg: 16 });
        B.pop();
      }
      B.col(-w / 2, 0, -0.1, w / 2, h, 0.1, ROOF);
    },
  };
  // the stage sign: ECO-FOREST TREEHILLS on a frame (faces local +Z), the round badge, a subtitle
  D.treehills_sign = {
    desc: 'stage sign: ECO-FOREST TREEHILLS on a steel frame with the round badge',
    build(B, o) {
      const lh = o.h ?? 0.46, title = o.title ?? 'ECO-FOREST TREEHILLS', sub = o.sub ?? 'ALTERNA  ·  BIOME 07';
      const W = textW(title, 0.2, 0.14) * lh + 1.6, hb = lh * 2.6, y0 = o.y0 ?? 1.2;
      for (const x of [-W / 2 + 0.25, W / 2 - 0.25]) ccyl(B, 'metal', K.steelDk, 0.07, y0 + hb, x, (y0 + hb) / 2, -0.12, { seg: 8 });
      pbox(B, 'paint', K.modDk, W, hb, 0.12, 0, y0 + hb / 2, 0);
      pbox(B, 'gloss', K.trim, W + 0.08, 0.08, 0.16, 0, y0 + hb, 0);
      pbox(B, 'gloss', K.trim, W + 0.08, 0.08, 0.16, 0, y0, 0);
      letters(B, title, { h: lh, x: 0.35, y: y0 + hb * 0.48, z: 0.065, c: K.label, wt: 0.2, track: 0.14 });
      letters(B, sub, { h: lh * 0.36, x: 0.35, y: y0 + hb * 0.18, z: 0.065, c: K.leafMid, wt: 0.2 });
      const bx = -W / 2 + 0.55;
      B.cyl('gloss', K.white, 0.4, 0.03, bx, y0 + hb / 2, 0.07, { rx: HP, seg: 24 });
      B.cyl('gloss', K.blue, 0.34, 0.04, bx, y0 + hb / 2, 0.08, { rx: HP, seg: 24 });
      B.tor(NS('gloss'), K.white, 0.2, 0.035, bx, y0 + hb / 2, 0.105, { rs: 4, ts: 20, arc: PI * 1.4, rz: 0.4 });
      pbox(B, NS('glow'), K.lamp, W - 0.2, 0.03, 0.03, 0, y0 + hb - 0.08, 0.1, { glow: 1.2 });
      if (o.solid !== false) B.col(-W / 2, y0, -0.2, W / 2, y0 + hb, 0.1, ROOF);
    },
  };

  // ------------------------------------------------------------------------------------------ railings
  // a railing along pts ([[x, y, z], …], local; y = the ground under it), with rail colliders (kids stop, ink passes)
  D.treehills_rail = {
    desc: 'tubular steel railing along a polyline, with rail colliders',
    build(B, o) {
      const pts = o.pts, h = o.h ?? 1.05;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        railing(B, a, b, { h, gap: o.gap ?? 1.5, kick: o.kick });
        const L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.ceil(L / 1.2));
        const yl = Math.min(a[1], b[1]);
        colSeg(B, [a[0], a[2]], [b[0], b[2]], 0.07, yl, Math.max(a[1], b[1]) + h, n, RAIL);
      }
    },
  };

  // ------------------------------------------------------------------------------------------ small things
  D.treehills_bench = {
    desc: 'Alterna bench: pale slab seat on green steel legs',
    build(B, o) {
      const w = o.w ?? 1.8;
      for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) pbox(B, 'paint', K.modDk, 0.08, 0.42, 0.42, x, 0.21, 0);
      pbox(B, 'gloss', K.trim, w, 0.07, 0.46, 0, 0.44, 0);
      for (let k = 0; k < 4; k++) pbox(B, NS('wood'), K.timber, w - 0.08, 0.02, 0.08, 0, 0.485, -0.16 + k * 0.105);
      B.col(-w / 2, 0, -0.23, w / 2, 0.48, 0.23);
    },
  };
  // pop-up lawn sprinkler heads (visual)
  D.treehills_sprinkler = {
    desc: 'pop-up lawn sprinkler head (visual)',
    build(B) {
      B.cyl(NS('gloss'), K.steelLt, 0.05, 0.08, 0, 0.04, 0, { seg: 8 });
      B.cyl(NS('gloss'), K.modDk, 0.03, 0.05, 0, 0.1, 0, { seg: 8 });
    },
  };
  // round service hatch in a retaining wall (wall-mounted, local z = 0 on the wall): a pale ring frame, the door with
  // its locking wheel, a number plate, a drain lip below
  D.treehills_hatch = {
    desc: 'round service hatch in a retaining wall (wall-mounted)',
    mount: 'wall',
    build(B, o) {
      const r = o.r ?? 0.45;
      B.cyl('gloss', K.trim, r + 0.08, 0.06, 0, 0, 0.03, { rx: HP, seg: 20 });
      B.cyl('gloss', o.c ?? K.modDk, r, 0.05, 0, 0, 0.07, { rx: HP, seg: 20 });
      B.tor(NS('metal'), K.steelLt, r * 0.42, 0.02, 0, 0, 0.1, { rs: 4, ts: 14 });
      for (let k = 0; k < 4; k++) seg(B, NS('metal'), K.steelLt, [0, 0, 0.1], [Math.cos((k / 4) * TAU) * r * 0.42, Math.sin((k / 4) * TAU) * r * 0.42, 0.1], 0.02, 0.02);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; B.cyl(NS('metal'), K.steelDk, 0.025, 0.03, Math.cos(a) * (r + 0.04), Math.sin(a) * (r + 0.04), 0.07, { rx: HP, seg: 6 }); }
      if (o.num) { pbox(B, NS('paint'), K.label, 0.3, 0.12, 0.01, 0, r + 0.2, 0.01); letters(B, o.num, { h: 0.08, y: r + 0.16, z: 0.017, c: K.modDk }); }
      pbox(B, NS('metal'), K.steel, 0.3, 0.04, 0.12, 0, -r - 0.12, 0.06);
    },
  };
  // the crown's weather station: a lattice mast with an anemometer (cups), a wind vane, a sensor box and a solar
  // panel, on a small plinth (thin: its plinth collides)
  D.treehills_weather = {
    desc: 'weather station: mast, anemometer, vane, sensor box, solar panel',
    build(B) {
      pbox(B, 'paint', K.modDk, 0.7, 0.3, 0.7, 0, 0.15, 0);
      for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [0, 0.14]]) seg(B, 'metal', K.steelLt, [x, 0.3, z], [x * 0.3, 3.2, z * 0.3], 0.035, 0.035, { round: true });
      for (let y = 0.8; y < 3.1; y += 0.6) B.tor(NS('metal'), K.steelLt, 0.1 * (1 - y / 4.5) + 0.03, 0.012, 0, y, 0, { rx: HP, rs: 3, ts: 8 });
      seg(B, 'metal', K.steel, [-0.5, 3.2, 0], [0.5, 3.2, 0], 0.03, 0.03, { round: true });
      ccyl(B, 'metal', K.steel, 0.02, 0.3, -0.5, 3.35, 0, { seg: 6 });
      for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; seg(B, NS('metal'), K.steel, [-0.5, 3.5, 0], [-0.5 + Math.cos(a) * 0.16, 3.5, Math.sin(a) * 0.16], 0.012, 0.012); B.sph(NS('gloss'), K.white, 0.045, -0.5 + Math.cos(a) * 0.18, 3.5, Math.sin(a) * 0.18, { ws: 8, hs: 5 }); }
      ccyl(B, 'metal', K.steel, 0.02, 0.3, 0.5, 3.35, 0, { seg: 6 });
      pbox(B, 'gloss', K.red, 0.34, 0.12, 0.02, 0.55, 3.5, 0);
      pbox(B, 'gloss', K.white, 0.28, 0.36, 0.18, 0, 1.4, 0.16);
      pbox(B, NS('paint'), K.label, 0.16, 0.06, 0.01, 0, 1.46, 0.256);
      B.push(0, 2.2, -0.2, 0, -0.6);
      pbox(B, 'gloss', '#24365a', 0.5, 0.03, 0.36, 0, 0, 0);
      B.pop();
      B.blink('#ff4a3a', 0, 3.28, 0, { size: 0.04, rate: 0.4, lo: 0.3, hi: 5 });
      B.col(-0.35, 0, -0.35, 0.35, 0.3, 0.35);
      B.col(-0.12, 0.3, -0.12, 0.12, 3.2, 0.12, ROOF);
    },
  };
  // seedling nursery: a low steel rack of seed trays (two shelves of little sprouts), low cover
  D.treehills_nursery = {
    desc: 'seedling nursery rack: two shelves of seed trays with sprouts (low cover)',
    build(B, o) {
      const w = o.w ?? 2.2, d = 0.7;
      for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) pbox(B, 'metal', K.steel, 0.05, 0.95, 0.05, x, 0.475, z);
      for (const y of [0.35, 0.9]) {
        pbox(B, 'metal', K.steelLt, w, 0.04, d, 0, y, 0);
        const n = Math.round(w / 0.5);
        for (let i = 0; i < n; i++) {
          const x = -w / 2 + ((i + 0.5) * w) / n;
          pbox(B, NS('paint'), i % 2 ? K.modDk : '#2b2f2c', w / n - 0.06, 0.07, d - 0.1, x, y + 0.055, 0);
          for (let k = 0; k < 6; k++) B.add(NS('foliage'), T.blob(0, k), '#7fb35a', x + ((k % 3) - 1) * 0.12, y + 0.12, (Math.floor(k / 3) - 0.5) * 0.25, { s: 0.05 + 0.02 * hash(i * 7 + k), ao: false });
        }
      }
      B.col(-w / 2, 0, -d / 2, w / 2, 0.98, d / 2);
    },
  };
  // wall valve box (wall-mounted, local z = 0 on the wall): a pipe stub, a red valve wheel, a gauge and a label plate
  D.treehills_wallvalve = {
    desc: 'wall valve box: pipe stub, red valve wheel, gauge, label (wall-mounted)',
    mount: 'wall',
    build(B, o) {
      pbox(B, 'metal', K.steel, 0.7, 0.6, 0.1, 0, 0, 0.05);
      seg(B, 'metal', K.steelLt, [-0.5, -0.1, 0.16], [0.5, -0.1, 0.16], 0.1, 0.1, { round: true, seg: 8 });
      valve(B, 0.1, -0.1, 0.1, 0.14);
      B.cyl('gloss', K.white, 0.08, 0.04, -0.2, 0.15, 0.12, { rx: HP, seg: 12 });
      pbox(B, NS('paint'), K.label, 0.36, 0.1, 0.01, 0, 0.22, 0.105);
      if (o.label) letters(B, o.label, { h: 0.06, y: 0.2, z: 0.112, c: K.modDk });
    },
  };

  // ------------------------------------------------------------------------------------------ the landing pads, a birdhouse
  // the base terrace's landing-pad marking (the Tower Command goal sits on it), laid on the deck 1.5 cm proud: an amber
  // ring, a pale inner ring, twelve ticks, the biome number (read from the spawn side). A prop, not a floor decal: a
  // prop's twin turns with the stage (a mirrored floor decal is only moved). Visual only.
  D.treehills_padring = {
    desc: 'landing-pad marking on the deck (visual): amber ring, inner ring, ticks, number',
    build(B, o) {
      const y = 0.015, R0 = o.r ?? 2.2, G = H.THREE;
      const ring = (r0, r1, c) => B.add(NS('paint'), tpl('pad-ring|' + r0 + '|' + r1, () => new G.RingGeometry(r0, r1, 48, 1)), c, 0, y, 0, { rx: -HP, ao: false });
      ring(R0 - 0.11, R0 + 0.11, K.yellow);
      ring(R0 * 0.82 - 0.05, R0 * 0.82 + 0.05, K.label);
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU, r = R0 * 0.9; pbox(B, NS('paint'), K.label, 0.05, 0.004, 0.16, Math.cos(a) * r, y, Math.sin(a) * r, { ry: -a + HP }); }
      B.push(0, y + 0.003, 0, PI, -HP);
      letters(B, o.num ?? '07', { h: 0.62, y: -0.31, z: 0, c: K.label, wt: 0.22 });
      B.pop();
    },
  };
  // a birdhouse on a post: a little timber house (pitched roof, round door, a perch) — 1.9 m
  D.treehills_birdhouse = {
    desc: 'birdhouse on a slim post (1.9 m)',
    build(B, o) {
      const h = o.h ?? 1.6;
      pbox(B, 'wood', K.timberDk, 0.07, h, 0.07, 0, h / 2, 0);
      pbox(B, 'wood', K.timber, 0.26, 0.28, 0.24, 0, h + 0.14, 0);
      for (const s of [-1, 1]) pbox(B, 'paint', K.mod, 0.2, 0.02, 0.3, s * 0.085, h + 0.33, 0, { rz: s * 0.7 });
      B.cyl(NS('paint'), '#2b2419', 0.045, 0.01, 0, h + 0.17, 0.121, { rx: HP, seg: 10 });
      seg(B, NS('wood'), K.timberDk, [0, h + 0.08, 0.12], [0, h + 0.08, 0.2], 0.015, 0.015, { round: true, seg: 4 });
      B.col(-0.05, 0, -0.05, 0.05, h + 0.3, 0.05, ROOF);
    },
  };
}
