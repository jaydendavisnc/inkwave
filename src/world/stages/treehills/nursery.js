// Eco-Forest Treehills — the nursery's kit (the Long Stages stretch's new land: the research station's seedling nursery
// between the garden and the base terrace):
//   treehills_seedbed      a raised seedbed (w × d × h): green steel sides, a pale rim, soil with rows of seedlings, a
//                          drip line and a label stake; kind 'hoops' adds a fleece row cover, 'frame' a propped cold frame
//   treehills_cloches      a row of glass bell cloches over seedlings on a timber sill (cover, slide-off tops)
//   treehills_pottingshed  the potting shed on the deck: a green module with a glazed lean-to over a potting bench, a
//                          water butt, tools, the sign
//   treehills_pbench       a potting bench (0.95 m): timber top on a steel frame, an upstand, pots, trays, a can
//   treehills_potstack     a pallet of stacked pots and soil sacks (0.95 m cover)
//   treehills_pumphouse    the channel's intake: a small pump module, the pipe from the reservoir, the sluice wheel
//   treehills_sluice       a sluice gate frame across the channel's end (red wheel, a gauge board)
//   treehills_chanedge     the channel's concrete coping (visual): a pale lip along one bank, L long
//   treehills_transformer  the turbine's transformer kiosk (a small ribbed box with a hazard plate)
//   treehills_trellis      a timber trellis screen with climbing beans (w wide, 2.1 m: cover)
//   treehills_saplings     a standing bed of potted young conifers in rows (w × d, ~1.6 m: the forest's next trees;
//                          cover, slide-off top)
//   treehills_trolley      a nursery trolley: a tall wheeled shelf rack of potted flowering plants (1.9 m cover)
//   treehills_edging       timber edging boards along a gravel lane's side (visual, L along local x)
// Same toolkit as the rest of the pack (kit.js); local +Z is a prop's front.

export function registerNursery(D, H, T) {
  const { PI, TAU, HP, mixc, shade, latheGeo } = H;
  const { K, NS, pbox, ccyl, seg, ROOF, letters, boardSign, valve, tpl, hash, puff, blob, shrub, flowerBed } = T;

  // a row of seedlings along local x at height y: little two-leaf sprouts (visual), every `gap` m
  function sprouts(B, x0, x1, y, z, gap, s, c) {
    const n = Math.max(1, Math.floor((x1 - x0) / gap));
    for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.5) * ((x1 - x0) / n), k = hash(s * 3.1 + i * 1.7), sz = 0.05 + 0.035 * k;
      B.add(NS('foliage'), blob(0, (s + i) % 8), mixc(c ?? '#6fa850', '#a5d27a', k), x, y + sz * 0.6, z + (hash(s + i * 5.3) - 0.5) * 0.05, { sx: sz * 1.4, sy: sz * 0.7, sz: sz, ry: k * 3, ao: false });
    }
  }

  // ------------------------------------------------------------------------------------------ seedbeds
  D.treehills_seedbed = {
    desc: "raised seedbed (w × d × h; kind 'rows' | 'hoops' | 'frame'): steel sides, soil, seedling rows (cover)",
    build(B, o) {
      const w = o.w ?? 4, d = o.d ?? 1.2, h = o.h ?? 0.95, s = o.seed ?? 3, kind = o.kind ?? 'rows';
      pbox(B, 'paint', o.c ?? K.mod, w, h - 0.06, d, 0, (h - 0.06) / 2, 0);
      // ribs on the long faces, a darker plinth band
      const nr = Math.max(2, Math.round(w / 0.55));
      for (let k = 1; k < nr; k++) for (const sz of [-1, 1]) pbox(B, NS('paint'), K.modLt, 0.06, h - 0.22, 0.02, -w / 2 + (k * w) / nr, (h - 0.06) / 2 + 0.04, sz * (d / 2 + 0.006));
      pbox(B, NS('paint'), K.modDk, w + 0.02, 0.12, d + 0.02, 0, 0.06, 0);
      pbox(B, 'gloss', K.trim, w + 0.08, 0.07, d + 0.08, 0, h - 0.035, 0);
      pbox(B, NS('paint'), K.soil, w - 0.1, 0.04, d - 0.1, 0, h - 0.05, 0);
      // seedling rows along the bed (the soil's furrows between them)
      const rows = Math.max(2, Math.floor((d - 0.2) / 0.28));
      for (let r = 0; r < rows; r++) {
        const z = -d / 2 + 0.15 + ((r + 0.5) * (d - 0.3)) / rows;
        pbox(B, NS('paint'), K.soilDk, w - 0.2, 0.012, 0.05, 0, h - 0.028, z + 0.12);
        if (kind !== 'hoops' || r % 2 === 0) sprouts(B, -w / 2 + 0.12, w / 2 - 0.12, h - 0.03, z, 0.2 + 0.05 * (r % 2), s + r * 7, r % 3 === 1 ? '#7fae4f' : null);
      }
      // the drip line along the top, its feed pipe down one end, a label stake
      seg(B, NS('metal'), K.dark, [-w / 2 + 0.08, h + 0.01, d / 2 - 0.12], [w / 2 - 0.08, h + 0.01, d / 2 - 0.12], 0.025, 0.025, { round: true, seg: 5 });
      seg(B, NS('metal'), K.dark, [w / 2 - 0.08, h + 0.01, d / 2 - 0.12], [w / 2 + 0.03, 0.1, d / 2 - 0.12], 0.025, 0.025, { round: true, seg: 5 });
      pbox(B, NS('gloss'), K.white, 0.12, 0.08, 0.01, -w / 2 + 0.3, h + 0.12, d / 2 - 0.05, { rx: -0.2 });
      pbox(B, NS('wood'), K.timber, 0.02, 0.2, 0.01, -w / 2 + 0.3, h + 0.04, d / 2 - 0.055);
      if (kind === 'hoops') {
        // a fleece row cover on white hoops over one half of the bed
        const nh = Math.max(2, Math.round(w / 0.9)), R = d * 0.42;
        for (let k = 0; k <= nh; k++) B.tor(NS('metal'), K.white, R, 0.012, -w / 2 + 0.1 + (k * (w - 0.2)) / nh, h - 0.04, 0, { ry: HP, rs: 3, ts: 10, arc: PI });
        B.push(0, h - 0.04, 0);
        for (let i = 0; i < 6; i++) {
          const a0 = (i / 6) * PI, a1 = ((i + 1) / 6) * PI, am = (a0 + a1) / 2;
          pbox(B, 'gloss', mixc('#eef2ec', '#dfe7de', hash(s + i)), w - 0.2, 0.012, R * (a1 - a0) + 0.02, 0, Math.sin(am) * R, Math.cos(am) * R, { rx: -am + HP });
        }
        B.pop();
      } else if (kind === 'frame') {
        // a cold frame: a timber box on the bed with a glazed lid propped open on a stick
        pbox(B, 'wood', K.timberDk, w * 0.5, 0.25, d - 0.12, -w * 0.22, h + 0.12, 0);
        B.push(-w * 0.22, h + 0.25, -d / 2 + 0.08, 0, -0.5);
        pbox(B, 'wood', K.timber, w * 0.5, 0.04, d - 0.1, 0, 0, (d - 0.1) / 2);
        pbox(B, 'gloss', K.glassLt, w * 0.5 - 0.1, 0.02, d - 0.2, 0, 0.02, (d - 0.1) / 2);
        B.pop();
        seg(B, NS('wood'), K.timberDk, [-w * 0.22, h + 0.25, d / 2 - 0.12], [-w * 0.22, h + 0.62, d / 2 - 0.2], 0.03, 0.03);
      }
      B.col(-w / 2, 0, -d / 2, w / 2, h, d / 2);
    },
  };

  // ------------------------------------------------------------------------------------------ cloches
  // a bell cloche: a glass bell (lathe) with a knob, the seedling under it showing through as a darker heart
  const bellGeo = () => tpl('thbell', () => latheGeo([[0, 0], [0.4, 0], [0.42, 0.04], [0.41, 0.2], [0.38, 0.45], [0.32, 0.64], [0.22, 0.76], [0.1, 0.81], [0, 0.82]], 16));
  D.treehills_cloches = {
    desc: 'a row of glass bell cloches over seedlings on a timber sill (n along local x; cover, slide-off tops)',
    build(B, o) {
      const n = o.n ?? 4, gap = o.gap ?? 1.0, W = (n - 1) * gap + 1.0, s = o.seed ?? 5;
      pbox(B, 'wood', K.timberDk, W, 0.1, 1.0, 0, 0.05, 0);
      pbox(B, NS('paint'), K.soil, W - 0.1, 0.03, 0.9, 0, 0.1, 0);
      for (let i = 0; i < n; i++) {
        const x = -((n - 1) * gap) / 2 + i * gap, k = hash(s + i * 2.3);
        // the plant under the bell (seen as a green heart through the glass), the bell, its highlight and knob
        B.add(NS('foliage'), puff(0, (s + i) % 6), mixc('#4f8a45', '#7fb35a', k), x, 0.32, 0, { sx: 0.24, sy: 0.22, sz: 0.24 });
        B.add('gloss', bellGeo(), mixc(K.glassLt, '#cfeee8', k), x, 0.1, 0, { sx: 1.05, sy: 1.0, sz: 1.05 });
        B.add(NS('gloss'), bellGeo(), mixc('#e9fbf8', '#ffffff', 0.5), x - 0.03, 0.11, 0.02, { sx: 0.62, sy: 0.96, sz: 1.08, ao: false });
        B.sph(NS('gloss'), K.glassDk, 0.05, x, 0.95, 0, { ws: 8, hs: 5 });
        pbox(B, NS('paint'), K.soilDk, 0.5, 0.012, 0.5, x, 0.118, 0);
      }
      B.col(-W / 2, 0, -0.5, W / 2, 0.97, 0.5, ROOF);
    },
  };

  // ------------------------------------------------------------------------------------------ potting shed + benches
  // module helper (the station's language): a deep-green ribbed unit with pale posts and a chequer lid
  function unit(B, w, d, h, c = K.mod) {
    pbox(B, 'paint', c, w, h, d, 0, h / 2, 0);
    const nr = Math.round(w / 0.5);
    for (let k = 1; k < nr; k++) for (const s of [-1, 1]) pbox(B, NS('paint'), shade(c, 1.08), 0.12, h - 0.3, 0.03, -w / 2 + (k * w) / nr, h / 2, s * (d / 2 + 0.012));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pbox(B, 'gloss', K.trim, 0.14, h + 0.02, 0.14, sx * (w / 2 - 0.05), h / 2, sz * (d / 2 - 0.05));
    pbox(B, 'metal', K.plate, w + 0.12, 0.08, d + 0.12, 0, h + 0.04, 0);
  }
  // a potting bench's worth of clutter on a top at y (w along local x): pots, a seed tray, a soil sack, a watering can
  function benchClutter(B, w, y, z, s) {
    for (let i = 0; i < Math.round(w / 0.35); i++) {
      const x = -w / 2 + 0.2 + i * 0.35 + (hash(s + i) - 0.5) * 0.06, k = hash(s * 2 + i);
      if (k < 0.2) continue;
      const tc = k < 0.55 ? '#c4744a' : k < 0.8 ? K.modDk : '#2b2f2c', r = 0.08 + 0.03 * hash(s + i * 3);
      B.cyl('paint', tc, r, r * 1.3, x, y + r * 0.65, z + (hash(i + s) - 0.5) * 0.15, { seg: 10, r2: r * 1.2 });
      if (k > 0.35) B.add(NS('foliage'), puff(0, (s + i) % 6), mixc('#5f9a4a', '#8cc063', hash(s + i * 7)), x, y + r * 1.5, z, { sx: r * 1.3, sy: r, sz: r * 1.3 });
    }
    pbox(B, NS('paint'), '#2b2f2c', 0.5, 0.06, 0.34, w * 0.25, y + 0.03, z - 0.05);
    sprouts(B, w * 0.25 - 0.2, w * 0.25 + 0.2, y + 0.06, z - 0.05, 0.1, s + 5);
    B.box('paint', '#d9c9a0', 0.38, 0.22, 0.26, -w * 0.3, y + 0.11, z - 0.12, { round: true, r: 0.06 });
    // the watering can
    B.cyl('gloss', K.blue, 0.1, 0.2, w * 0.4, y + 0.1, z + 0.05, { seg: 10 });
    seg(B, NS('gloss'), K.blue, [w * 0.4 + 0.08, y + 0.08, z + 0.05], [w * 0.4 + 0.28, y + 0.26, z + 0.05], 0.025, 0.025, { round: true, seg: 5 });
  }
  D.treehills_pbench = {
    desc: 'potting bench (w along local x, 0.95 m): timber top on a steel frame, upstand, pots, trays (cover)',
    build(B, o) {
      const w = o.w ?? 2.0, d = 0.7, h = 0.95, s = o.seed ?? 7;
      for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) pbox(B, 'metal', K.steelDk, 0.05, h - 0.05, 0.05, x, (h - 0.05) / 2, z);
      pbox(B, 'metal', K.steel, w - 0.1, 0.04, d - 0.1, 0, 0.3, 0);
      pbox(B, 'wood', K.timber, w, 0.05, d, 0, h - 0.025, 0);
      pbox(B, 'wood', K.timberDk, w, 0.28, 0.04, 0, h + 0.14, -d / 2 + 0.02);
      // stacked pots and a crate on the lower shelf
      for (let i = 0; i < 3; i++) B.cyl('paint', '#b8683f', 0.11, 0.16 + i * 0.03, -w / 2 + 0.35 + i * 0.3, 0.4 + (0.16 + i * 0.03) / 2, 0.05, { seg: 10, r2: 0.13 });
      pbox(B, 'paint', K.modLt, 0.5, 0.25, 0.45, w / 2 - 0.4, 0.44, 0);
      benchClutter(B, w, h, 0.05, s);
      B.col(-w / 2, 0, -d / 2, w / 2, h, d / 2);
    },
  };
  D.treehills_potstack = {
    desc: 'a pallet of stacked pots and soil sacks (0.95 m cover)',
    build(B, o) {
      const s = o.seed ?? 3;
      pbox(B, 'wood', K.timberDk, 1.2, 0.14, 1.0, 0, 0.07, 0);
      for (let i = 0; i < 3; i++) B.box('paint', mixc('#d9c9a0', '#cbb688', hash(s + i)), 0.55, 0.22, 0.4, -0.28 + (i % 2) * 0.56, 0.25 + Math.floor(i / 2) * 0.22, -0.22, { round: true, r: 0.07 });
      for (let i = 0; i < 4; i++) {
        const x = -0.35 + (i % 2) * 0.55, z = 0.25, n = 4 + (i % 3);
        for (let j = 0; j < n; j++) B.cyl(j === n - 1 ? 'paint' : NS('paint'), i % 2 ? '#c4744a' : K.modDk, 0.2, 0.12, x, 0.2 + j * 0.1, z, { seg: 12, r2: 0.23, open: j < n - 1 });
      }
      B.col(-0.6, 0, -0.5, 0.6, 0.95, 0.5);
    },
  };
  D.treehills_pottingshed = {
    desc: 'the potting shed: green module, glazed lean-to over a potting bench, water butt, sign (cover, slide-off roof)',
    build(B, o) {
      const w = o.w ?? 3.0, d = o.d ?? 2.2, h = 2.4;
      unit(B, w, d, h, K.mod);
      // the door (on its +X end), a window on the back, the sign on the front
      B.push(w / 2 + 0.02, 0, 0, HP);
      pbox(B, 'gloss', K.trim, 1.0, 2.1, 0.05, 0.2, 1.05, 0.02); pbox(B, 'gloss', K.whiteSh, 0.86, 2.0, 0.03, 0.2, 1.0, 0.05);
      B.cyl(NS('gloss'), K.glassDk, 0.13, 0.02, 0.2, 1.5, 0.07, { rx: HP, seg: 12 });
      B.pop();
      B.push(0, 0, d / 2 + 0.02);
      boardSign(B, ['POTTING SHED', 'NURSERY 07'], -0.35, h - 0.45, { h: 0.12, lead: 1.4, z: 0, board: K.trim, c: K.modDk, pad: 0.07 });
      pbox(B, 'glow', K.lamp, 0.4, 0.06, 0.06, 0.95, h - 0.25, 0.05, { glow: 1.6 });
      B.pop();
      // the lean-to: a sloped glass roof on two posts over a potting bench along the front
      const lz = d / 2 + 0.75;
      for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) ccyl(B, 'metal', K.steelLt, 0.04, 2.0, x, 1.0, lz + 0.35, { seg: 8 });
      B.push(0, 2.12, d / 2 + 0.55, 0, 0.32);
      pbox(B, 'metal', K.trim, w + 0.1, 0.05, 1.3, 0, 0, 0);
      pbox(B, 'gloss', K.glassLt, w - 0.1, 0.03, 1.2, 0, 0.03, 0);
      for (let k = 1; k < 4; k++) pbox(B, NS('metal'), K.trim, 0.04, 0.05, 1.3, -w / 2 + (k * w) / 4, 0.04, 0);
      B.pop();
      const bw = w - 0.3;
      pbox(B, 'wood', K.timber, bw, 0.05, 0.6, 0, 0.92, d / 2 + 0.35);
      for (const x of [-bw / 2 + 0.05, bw / 2 - 0.05]) pbox(B, 'metal', K.steelDk, 0.05, 0.9, 0.05, x, 0.45, d / 2 + 0.6);
      benchClutter(B, bw, 0.945, d / 2 + 0.38, (o.seed ?? 2) + 11);
      // a water butt at the far corner, tools on the back
      B.cyl('gloss', K.mod, 0.36, 1.0, -w / 2 - 0.3, 0.5, -d / 2 + 0.45, { seg: 14 });
      B.cyl(NS('gloss'), K.trim, 0.37, 0.05, -w / 2 - 0.3, 1.0, -d / 2 + 0.45, { seg: 14 });
      B.push(-w / 2 - 0.3, 0, -d / 2 + 0.45 + 0.36); valve(B, 0, 0.25, 0, 0.07); B.pop();
      B.push(0, 0, -d / 2 - 0.03, PI);
      for (const [x, c] of [[-0.6, K.timber], [-0.2, K.timberDk], [0.3, K.timber]]) seg(B, 'wood', c, [x, 0.05, 0.1], [x + 0.08, 1.6, 0.03], 0.04, 0.04, { round: true });
      B.pop();
      B.col(-w / 2 - 0.06, 0, -d / 2 - 0.06, w / 2 + 0.06, h + 0.08, d / 2 + 0.06, ROOF);
      B.col(-w / 2 - 0.05, 0, d / 2 + 0.06, w / 2 + 0.05, 0.95, d / 2 + 0.66);
      B.col(-w / 2 - 0.05, 2.0, d / 2 + 0.06, w / 2 + 0.05, 2.5, d / 2 + 1.2, ROOF);
      B.col(-w / 2 - 0.68, 0, -d / 2 + 0.07, -w / 2 - 0.06, 1.02, -d / 2 + 0.83);
    },
  };

  // ------------------------------------------------------------------------------------------ the channel's works
  D.treehills_pumphouse = {
    desc: 'the channel intake: a small pump module, the pipe in from the reservoir, the sluice wheel (cover, slide-off roof)',
    build(B, o) {
      const w = o.w ?? 2.6, d = o.d ?? 2.2, h = 2.3;
      unit(B, w, d, h, K.modDk);
      B.push(0, 0, d / 2 + 0.02);
      boardSign(B, ['INTAKE 07', 'IRRIGATION'], -0.45, 1.7, { h: 0.11, lead: 1.4, z: 0, board: K.trim, c: K.modDk, pad: 0.06 });
      pbox(B, 'metal', K.steel, 0.6, 0.5, 0.05, 0.75, 1.55, 0.02);
      for (let k = 0; k < 4; k++) pbox(B, NS('metal'), K.steelDk, 0.5, 0.03, 0.06, 0.75, 1.38 + k * 0.11, 0.04, { rx: 0.5 });
      B.pop();
      // the pipe out of its side into the channel, with a flange and the red sluice wheel on a post
      // (o.chan: how far below the pump house's floor the channel's bed lies — the outlet spouts into it)
      B.push(w / 2 + 0.02, 0, 0, HP);
      seg(B, 'metal', K.steelLt, [0, 0.6, 0.1], [0, 0.6, 0.9], 0.3, 0.3, { round: true, seg: 12 });
      B.cyl('metal', K.steel, 0.22, 0.08, 0, 0.6, 0.92, { rx: HP, seg: 12 });
      if (o.chan) {
        const yb = -o.chan;
        seg(B, NS('gloss'), '#cfeef0', [0, 0.52, 0.97], [0, yb + 0.02, 1.25], 0.2, 0.08);
        B.cyl(NS('gloss'), '#e8f8f8', 0.3, 0.015, 0, yb + 0.01, 1.3, { seg: 14 });
        B.tor(NS('gloss'), '#f4fbfb', 0.4, 0.02, 0, yb + 0.02, 1.3, { rx: HP, rs: 3, ts: 16 });
      }
      B.pop();
      pbox(B, 'metal', K.steelDk, 0.12, 1.0, 0.12, w / 2 + 0.4, 0.5, d / 2 - 0.2);
      B.push(w / 2 + 0.4, 1.0, d / 2 - 0.13); valve(B, 0, 0, 0, 0.18); B.pop();
      B.blink('#7fe0ff', -w / 2 + 0.3, h - 0.3, d / 2 + 0.05, { size: 0.04, rate: 0.7 });
      B.col(-w / 2 - 0.06, 0, -d / 2 - 0.06, w / 2 + 0.06, h + 0.08, d / 2 + 0.06, ROOF);
    },
  };
  D.treehills_sluice = {
    desc: 'a sluice gate frame across the channel end (w across local x): gate, red wheel, gauge board',
    build(B, o) {
      const w = o.w ?? 1.6, y0 = o.y0 ?? -0.3;
      for (const x of [-w / 2 - 0.08, w / 2 + 0.08]) pbox(B, 'metal', K.steelDk, 0.14, 1.4 - y0, 0.2, x, (1.4 + y0) / 2, 0);
      pbox(B, 'metal', K.steel, w + 0.3, 0.14, 0.24, 0, 1.4, 0);
      pbox(B, 'metal', K.modDk, w, 0.7, 0.06, 0, y0 + 0.35, 0);
      seg(B, 'metal', K.steelLt, [0, 1.47, 0], [0, 1.75, 0], 0.05, 0.05, { round: true });
      B.push(0, 1.8, 0, 0, HP); B.tor('gloss', K.red, 0.2, 0.03, 0, 0, 0, { rs: 5, ts: 16 }); B.pop();
      pbox(B, 'gloss', K.white, 0.12, 0.9, 0.02, w / 2 - 0.1, y0 + 0.6, 0.1);
      for (let k = 0; k < 6; k++) pbox(B, NS('paint'), K.dark, 0.06, 0.012, 0.01, w / 2 - 0.12, y0 + 0.25 + k * 0.12, 0.112);
      B.col(-w / 2 - 0.15, y0, -0.12, -w / 2, 1.47, 0.12);
      B.col(w / 2, y0, -0.12, w / 2 + 0.15, 1.47, 0.12);
    },
  };
  D.treehills_chanedge = {
    desc: 'the channel coping (visual): a pale concrete lip along one bank (L along local x)',
    build(B, o) {
      const L = o.L ?? 10;
      pbox(B, NS('paint'), '#c9ccc2', L, 0.05, 0.22, 0, 0.012, 0);
      for (let x = -L / 2 + 1.2; x < L / 2; x += 2.4) pbox(B, NS('paint'), '#a9aca2', 0.03, 0.052, 0.22, x, 0.013, 0);
    },
  };

  // ------------------------------------------------------------------------------------------ the turbine's kit
  D.treehills_transformer = {
    desc: "the turbine's transformer kiosk (1.9 m: cover, slide-off top)",
    build(B, o) {
      const w = 1.6, d = 1.1, h = 1.8;
      pbox(B, 'paint', K.modDk, w, h, d, 0, h / 2, 0);
      for (let k = 1; k < 5; k++) pbox(B, NS('paint'), K.mod, 0.06, h - 0.3, 0.02, -w / 2 + (k * w) / 5, h / 2, d / 2 + 0.01);
      pbox(B, 'metal', K.plate, w + 0.1, 0.06, d + 0.1, 0, h + 0.03, 0);
      pbox(B, 'gloss', K.yellow, 0.34, 0.3, 0.01, 0, 1.3, d / 2 + 0.03);
      letters(B, '!', { h: 0.2, y: 1.2, z: d / 2 + 0.04, c: K.black });
      letters(B, o.num ?? 'WT-07', { h: 0.1, y: 0.95, z: d / 2 + 0.04, c: K.label });
      B.col(-w / 2, 0, -d / 2, w / 2, h + 0.06, d / 2, ROOF);
    },
  };
  // timber trellis screen with climbing beans (w along local x, 2.1 m tall): posts, a lattice, leafy vines, red flowers
  D.treehills_trellis = {
    desc: 'timber trellis screen with climbing beans (w along local x, 2.1 m; cover)',
    build(B, o) {
      const w = o.w ?? 3, h = 2.1, s = o.seed ?? 4;
      pbox(B, 'wood', K.timberDk, w + 0.1, 0.3, 0.5, 0, 0.15, 0);
      for (let k = 0; k <= Math.round(w / 1.0); k++) pbox(B, 'wood', K.timberDk, 0.08, h, 0.08, -w / 2 + (k * w) / Math.round(w / 1.0), h / 2, 0);
      for (let i = 1; i < 6; i++) pbox(B, NS('wood'), K.timber, w, 0.03, 0.03, 0, 0.3 + i * 0.33, 0.03);
      const n = Math.round(w * 5);
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + ((i + 0.5) * w) / n, y = 0.4 + hash(s + i) * (h - 0.5), k = hash(s * 3 + i);
        B.add('foliage', puff(0, (s + i) % 6), mixc('#4f8a3f', '#7db05a', k), x, y, (hash(i * 7 + s) - 0.5) * 0.18, { sx: 0.22, sy: 0.2, sz: 0.14 });
        if (k > 0.72) B.add(NS('gloss'), blob(0, i % 8), '#d8553f', x + 0.05, y + 0.06, 0.1, { s: 0.04, ao: false });
      }
      B.col(-w / 2 - 0.05, 0, -0.18, w / 2 + 0.05, h, 0.18);
    },
  };

  // ------------------------------------------------------------------------------------------ saplings, trolleys
  // a young conifer in a pot (cheap: a trunk and three stacked puffs), base at y
  function sapling(B, x, y, z, h, s) {
    const k = hash(s * 1.9), c = mixc(k < 0.5 ? K.cyp : K.thu, k < 0.5 ? K.cypLt : K.thuLt, 0.15 + 0.35 * hash(s + 3));
    B.cyl('paint', k < 0.3 ? '#2b2f2c' : K.modDk, 0.14, 0.26, x, y + 0.13, z, { seg: 8, r2: 0.17 });
    B.cyl(NS('paint'), K.soil, 0.15, 0.02, x, y + 0.255, z, { seg: 8 });
    const hh = h - 0.26;
    for (let i = 0; i < 3; i++) {
      const t = i / 3, r = (0.26 - 0.07 * i) * (0.9 + 0.2 * hash(s + i));
      B.add('foliage', puff(0, (s + i) % 6), mixc(c, K.cypLt, t * 0.35), x, y + 0.26 + hh * (0.22 + t * 0.34), z, { sx: r, sy: hh * 0.3, sz: r, ry: hash(s + i * 2) * 3 });
    }
  }
  D.treehills_saplings = {
    desc: 'standing bed of potted young conifers in rows (w × d; ~1.6 m cover, slide-off top)',
    build(B, o) {
      const w = o.w ?? 3, d = o.d ?? 2, h = o.h ?? 1.6, s = o.seed ?? 5, gap = 0.52;
      // the bed: a low timber edge round black ground-cover fabric, a drip line down each row
      pbox(B, NS('paint'), '#2a2d2b', w, 0.03, d, 0, 0.015, 0);
      for (const z of [-d / 2, d / 2]) pbox(B, 'wood', K.timberDk, w + 0.1, 0.12, 0.06, 0, 0.06, z);
      for (const x of [-w / 2, w / 2]) pbox(B, 'wood', K.timberDk, 0.06, 0.12, d, x, 0.06, 0);
      const nx = Math.max(1, Math.floor((w - 0.2) / gap)), nz = Math.max(1, Math.floor((d - 0.2) / gap));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = -((nx - 1) * gap) / 2 + i * gap, z = -((nz - 1) * gap) / 2 + j * gap, q = s * 31 + i * 7 + j * 13;
        sapling(B, x + (hash(q) - 0.5) * 0.06, 0.03, z + (hash(q + 1) - 0.5) * 0.06, h * (0.82 + 0.18 * hash(q + 2)), q);
      }
      for (let j = 0; j < nz; j++) seg(B, NS('metal'), K.dark, [-w / 2 + 0.1, 0.06, -((nz - 1) * gap) / 2 + j * gap + 0.2], [w / 2 - 0.1, 0.06, -((nz - 1) * gap) / 2 + j * gap + 0.2], 0.02, 0.02);
      // a row label on a stake at the front
      pbox(B, 'gloss', K.white, 0.3, 0.16, 0.02, -w / 2 + 0.35, 0.55, d / 2 + 0.06);
      letters(B, o.num ?? 'C-07', { h: 0.08, x: -w / 2 + 0.35, y: 0.52, z: d / 2 + 0.075, c: K.modDk });
      pbox(B, NS('wood'), K.timber, 0.03, 0.5, 0.02, -w / 2 + 0.35, 0.25, d / 2 + 0.05);
      B.col(-w / 2 + 0.05, 0, -d / 2 + 0.05, w / 2 - 0.05, h, d / 2 - 0.05, ROOF);
    },
  };
  D.treehills_trolley = {
    desc: 'nursery trolley: a tall wheeled shelf rack of potted flowering plants (1.35 × 0.56 × 1.9: cover)',
    build(B, o) {
      const w = 1.35, d = 0.56, h = 1.9, s = o.seed ?? 3;
      for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) for (const z of [-d / 2 + 0.03, d / 2 - 0.03]) {
        pbox(B, 'metal', K.steelLt, 0.035, h - 0.12, 0.035, x, 0.12 + (h - 0.12) / 2, z);
        B.cyl(NS('metal'), K.dark, 0.05, 0.04, x, 0.06, z, { rz: HP, seg: 8 });
      }
      pbox(B, 'wood', K.timber, w, 0.05, d, 0, 0.14, 0);
      const shelves = [0.14, 0.62, 1.1, 1.55];
      shelves.forEach((y, i) => {
        if (i) pbox(B, 'metal', K.steel, w - 0.04, 0.03, d - 0.04, 0, y, 0);
        for (let k = 0; k < 4; k++) {
          const x = -w / 2 + 0.2 + k * 0.32, q = s * 5 + i * 11 + k;
          B.cyl(NS('paint'), hash(q) < 0.6 ? '#2b2f2c' : '#c4744a', 0.09, 0.12, x, y + 0.08, 0, { seg: 8, r2: 0.11 });
          B.add('foliage', puff(0, q % 6), mixc('#4f8a45', '#7fb35a', hash(q + 1)), x, y + 0.22, 0, { sx: 0.15, sy: 0.12, sz: 0.15 });
          if (hash(q + 2) > 0.3) flowerBed(B, x, y + 0.22, 0, 0.18, 0.18, 4, q, { lift: 0.08, spread: 0.06 });
        }
      });
      B.col(-w / 2, 0, -d / 2, w / 2, h, d / 2);
    },
  };

  D.treehills_edging = {
    desc: "timber edging boards along a gravel lane's side (visual; L along local x)",
    build(B, o) {
      const L = o.L ?? 6, n = Math.max(1, Math.round(L / 2.4));
      for (let i = 0; i < n; i++) pbox(B, NS('wood'), i % 2 ? K.timberDk : shade(K.timberDk, 1.08), L / n - 0.02, 0.07, 0.05, -L / 2 + ((i + 0.5) * L) / n, 0.035, 0);
      for (let i = 0; i <= n; i++) pbox(B, NS('wood'), K.timberDk, 0.05, 0.1, 0.05, -L / 2 + (i * L) / n, 0.05, 0.05);
    },
  };
}
