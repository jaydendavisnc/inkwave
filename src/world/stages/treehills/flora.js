// Eco-Forest Treehills — the planting: the hills' evergreens (Hinoki cypress, Thujopsis), young cypress clumps in round
// planters, the meadow's planters and pollinator borders, shrub fringes; and the stage's gimmick, the sprout pods (the
// dormant seed bulb in its planter) and the hedge a pod grows (built at the size the pods engine asks for, tinted in
// the owner team's colour).

export function registerFlora(D, H, T) {
  const { PI, TAU, HP, mixc, col } = H;
  const { K, NS, pbox, ccyl, seg, colC, ROOF, evergreen, shrub, flowerBed, puff, blob, tpl, latheGeo, hash, letters } = T;

  // ------------------------------------------------------------------------------------------ evergreens
  // a Hinoki cypress / Thujopsis on the tiers: h tall, w width factor; its trunk and the dense lower foliage are cover
  // (a solid core, its top off-limits); the spray tips beyond are soft
  D.treehills_tree = {
    desc: 'evergreen (Hinoki cypress or Thujopsis): h tall; the lower foliage core is solid cover',
    build(B, o) {
      const h = o.h ?? 7, w = o.w ?? 0.8, kind = o.kind ?? 'hinoki';
      const tone = o.c ?? mixc(kind === 'thujopsis' ? K.thu : K.cyp, kind === 'thujopsis' ? K.thuLt : K.cypLt, (hash((o.seed ?? 1) * 1.7) - 0.3) * 0.4);
      evergreen(B, 0, 0, 0, h, { kind, seed: o.seed ?? 1, w, c: tone, rot: o.rot, lite: o.lite });
      // a mulch ring at the foot (not in a grove: its bed is the mulch)
      if (o.mulch !== false) B.cyl(NS('paint'), '#6b5a45', Math.min(0.75, h * 0.1), 0.03, 0, 0.015, 0, { seg: 12 });
      if (o.solid !== false) { const cw = o.core ?? Math.min(1.8, h * w * 0.3); colC(B, 0, 0, 0, cw, Math.min(3.2, h * 0.45), cw, ROOF); }
    },
  };
  // ferns (the groves' underplanting, visual only): a low clump of arching fronds (r across), a few curled fiddleheads
  D.treehills_ferns = {
    desc: 'fern clump (visual, knee-high): arching fronds round a crown',
    build(B, o) {
      const r = o.r ?? 0.6, s = o.seed ?? 3, n = o.n ?? 7;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + hash(s + k) * 0.6, L = r * (0.75 + 0.35 * hash(s * 3 + k)), tilt = 0.5 + 0.35 * hash(s + k * 7);
        const c = mixc('#3f6e3a', '#7fae5a', 0.25 + 0.55 * hash(s * 5 + k));
        B.push(Math.cos(a) * L * 0.45, 0.16 + 0.12 * hash(k + s), Math.sin(a) * L * 0.45, -a, 0, tilt * 0.6);
        B.add(NS('foliage'), blob(0, (s + k) % 8), c, 0, 0, 0, { sx: L * 0.55, sy: 0.035, sz: 0.11 + 0.05 * hash(k * 3 + s), ao: false });
        B.pop();
      }
      B.add(NS('foliage'), blob(0, s % 8), '#35572f', 0, 0.08, 0, { sx: 0.16, sy: 0.08, sz: 0.16, ao: false });
    },
  };
  // young cypress clump: three young Hinoki in a round steel planter (cover in the meadow)
  D.treehills_clump = {
    desc: 'young cypress clump: three young Hinoki in a round planter (solid cover)',
    build(B, o) {
      const r = o.r ?? 1.1, ph = 0.55, s = o.seed ?? 3;
      B.cyl('paint', K.mod, r, ph - 0.06, 0, (ph - 0.06) / 2, 0, { seg: 12 });
      B.tor('gloss', K.trim, r, 0.05, 0, ph - 0.04, 0, { rx: HP, rs: 4, ts: 24 });
      B.cyl(NS('paint'), K.soil, r - 0.06, 0.04, 0, ph - 0.05, 0, { seg: 12 });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU + hash(s) * 2, rr = r * 0.45;
        evergreen(B, Math.cos(a) * rr, ph - 0.05, Math.sin(a) * rr, 2.6 + hash(s + k) * 1.1, { kind: 'hinoki', seed: s + k, w: 0.62, c: mixc(K.cyp, K.cypLt, 0.25 + 0.3 * hash(s * 3 + k)) });
      }
      shrub(B, 0, ph - 0.05, 0, 0.9, s + 7, K.shrubLt, { n: 3, ns: true });
      colC(B, 0, 0, 0, 2 * r * 0.92, ph, 2 * r * 0.92);
      colC(B, 0, ph, 0, 1.5, 2.2, 1.5, ROOF);
    },
  };

  // ------------------------------------------------------------------------------------------ planters, borders
  // a rectangular steel planter (w × d × h): module-green body, a pale rim, shrubs / flowers / a small tree
  D.treehills_planter = {
    desc: 'raised steel planter (w × d × h) with shrubs and flowers (cover)',
    build(B, o) {
      const w = o.w ?? 2.2, d = o.d ?? 0.9, h = o.h ?? 0.6, s = o.seed ?? 5;
      pbox(B, 'paint', o.c ?? K.mod, w, h - 0.06, d, 0, (h - 0.06) / 2, 0);
      for (let k = 1; k < Math.round(w / 0.6); k++) for (const sz of [-1, 1]) pbox(B, NS('paint'), K.modLt, 0.06, h - 0.2, 0.02, -w / 2 + (k * w) / Math.round(w / 0.6), (h - 0.06) / 2, sz * (d / 2 + 0.006));
      pbox(B, 'gloss', K.trim, w + 0.08, 0.07, d + 0.08, 0, h - 0.035, 0);
      pbox(B, NS('paint'), K.soil, w - 0.1, 0.04, d - 0.1, 0, h - 0.05, 0);
      const n = Math.max(2, Math.round(w / 0.7));
      for (let i = 0; i < n; i++) shrub(B, -w / 2 + ((i + 0.5) * w) / n, h - 0.06, (hash(s + i) - 0.5) * d * 0.3, Math.min(d, 0.9) * 1.05, s + i * 5, i % 2 ? K.shrubLt : K.shrub, { n: 3 });
      flowerBed(B, 0, h - 0.04, 0, w * 0.9, d * 0.8, Math.round(w * 9), s * 7, { lift: 0.3, spread: 0.2, cols: o.flowers });
      if (o.tree) evergreen(B, o.tree * w * 0.3, h - 0.05, 0, 2.8, { kind: 'hinoki', seed: s, w: 0.6 });
      B.col(-w / 2, 0, -d / 2, w / 2, h, d / 2);
    },
  };
  // pollinator border: a long flower strip (L along local x, 0.8 wide) behind a low timber edging, with bee-hotel posts
  // (visual only: ankle-high, you walk through it)
  D.treehills_border = {
    desc: 'pollinator border: flower strip with timber edging and bee-hotel posts (visual)',
    build(B, o) {
      const L = o.L ?? 6, d = o.d ?? 0.8, s = o.seed ?? 9;
      for (const z of [-d / 2, d / 2]) pbox(B, 'wood', K.timber, L, 0.12, 0.06, L / 2, 0.06, z);
      pbox(B, NS('paint'), K.soilDk, L - 0.06, 0.03, d - 0.08, L / 2, 0.02, 0);
      const n = Math.round(L / 0.55);
      for (let i = 0; i < n; i++) B.add(NS('foliage'), puff(0, (s + i) % 6), mixc('#6f9a4e', '#98b862', hash(s + i)), ((i + 0.5) * L) / n, 0.16, (hash(s * 3 + i) - 0.5) * d * 0.5, { sx: 0.3, sy: 0.22, sz: 0.28 });
      flowerBed(B, L / 2, 0.08, 0, L * 0.95, d * 0.8, Math.round(L * 14), s * 11, { lift: 0.2, spread: 0.35 });
      for (let k = 0; k < Math.max(1, Math.round(L / 5)); k++) {
        const x = ((k + 0.5) * L) / Math.max(1, Math.round(L / 5));
        ccyl(B, 'wood', K.timberDk, 0.04, 1.0, x, 0.5, 0, { seg: 6 });
        pbox(B, 'wood', K.timber, 0.34, 0.3, 0.2, x, 1.1, 0);
        pbox(B, NS('wood'), K.timberDk, 0.4, 0.05, 0.26, x, 1.27, 0);
        for (let i = 0; i < 6; i++) B.cyl(NS('paint'), K.soilDk, 0.025, 0.02, x - 0.1 + (i % 3) * 0.1, 1.04 + Math.floor(i / 3) * 0.12, 0.1, { rx: HP, seg: 6 });
      }
    },
  };
  // shrub fringe along the foot of a wall (L along local x): visual
  D.treehills_fringe = {
    desc: 'shrub fringe along a wall foot (visual)',
    build(B, o) {
      const L = o.L ?? 4, s = o.seed ?? 13, n = Math.max(2, Math.round(L / 0.9));
      for (let i = 0; i < n; i++) shrub(B, ((i + 0.3 + hash(s + i) * 0.4) * L) / n, 0, (hash(s * 5 + i) - 0.5) * 0.3, 0.8 + hash(s + i * 2) * 0.5, s + i * 3, i % 3 ? K.shrub : '#4d7a47', { n: 3, flat: 0.7 });
      if (o.flowers !== false) flowerBed(B, L / 2, 0.02, 0, L, 0.6, Math.round(L * 5), s * 5, { lift: 0.35, spread: 0.3 });
    },
  };

  // ------------------------------------------------------------------------------------------ sprout pods
  // The pod (src/game/pods.js draws the bulbs; the stage places the planters). o.kind says which plant it grows (the
  // pods engine's two kinds; none: old pod data, a hedge), o.col its planter's size:
  //   part 'planter' — the station's green-steel planter, 0.5 high (dark soil at 0.46): for a bramble wall a long trough
  //                    (1.6 × 0.7: pale ribs, a pale rim, bramble runners on the soil), for a canopy a round tub (1.1
  //                    across: ribs, a pale rolled rim, moss and leaves), for old data the 0.9 round planter; the stage's
  //                    static prop, its collider the planter's size (never inked)
  //   part 'bulb'    — the seed, origin at its own base: the engine anchors it on the soil (LAYOUT.pods.bulbY 0.46),
  //                    scales it from there as the meters fill and blushes / lights it through its own material copies,
  //                    so it is built pale (the two kinds: the engine's own seeds — a row of thorny buds / one big seed
  //                    crowned with leaves — so they read the same on every stage)
  //   (no part)      — both (the bulb set on the soil)
  const PH = 0.5, SOIL = 0.46;
  const bulbGeo = () => tpl('thbulb', () => latheGeo([[0, 0], [0.12, 0.01], [0.24, 0.07], [0.3, 0.17], [0.29, 0.28], [0.22, 0.39], [0.13, 0.47], [0.06, 0.54], [0.03, 0.62], [0, 0.64]], 14));
  const veinGeo = () => tpl('thvein', () => latheGeo([[0, 0.005], [0.125, 0.015], [0.245, 0.075], [0.305, 0.17], [0.295, 0.28], [0.225, 0.39], [0.135, 0.47], [0.062, 0.54], [0, 0.56]], 7));
  D.treehills_pod = {
    desc: "sprout pod: a pale seed (origin at its base) in the station's green-steel planter — a trough (bramble wall), a round tub (canopy) or the old round planter (part 'planter' | 'bulb' | both)",
    params: { part: "'planter' (static, collides) | 'bulb' (the engine's moving part, origin at its base) | undefined (both)", kind: "'wall' | 'canopy' | null (old data)", col: '[w, h, d]: the planter' },
    build(B, o) {
      const kind = o.kind || null;
      if (o.part !== 'bulb') {
        if (kind === 'wall') {
          const [cw, , cd] = o.col || [1.6, PH, 0.7];
          pbox(B, 'paint', K.modDk, cw - 0.04, PH - 0.05, cd - 0.04, 0, (PH - 0.05) / 2, 0);
          for (let x = -cw / 2 + 0.18; x < cw / 2 - 0.1; x += 0.36) for (const sz of [-1, 1]) pbox(B, NS('paint'), K.mod, 0.06, PH - 0.14, 0.02, x, (PH - 0.05) / 2, sz * (cd / 2 - 0.01));
          for (const sz of [-1, 1]) { pbox(B, 'gloss', K.trim, cw, 0.05, 0.06, 0, PH - 0.025, sz * (cd / 2 - 0.03)); pbox(B, 'gloss', K.trim, 0.06, 0.05, cd - 0.08, sz * (cw / 2 - 0.03), PH - 0.025, 0); }
          pbox(B, NS('paint'), K.soil, cw - 0.12, 0.03, cd - 0.12, 0, SOIL, 0);
          for (let i = 0; i < 5; i++) {
            const x0 = -cw / 2 + 0.22 + (i / 4) * (cw - 0.44), z0 = (i % 2 ? 1 : -1) * 0.1;
            seg(B, NS('wood'), '#6b3f3a', [x0 - 0.13, SOIL + 0.01, z0], [x0 + 0.12, SOIL + 0.04, -z0 * 0.5], 0.014, 0.012, { round: true, seg: 4 });
            B.add(NS('foliage'), blob(0, i), '#6f9a4e', x0 + 0.08, SOIL + 0.03, z0 * 0.3, { sx: 0.07, sy: 0.02, sz: 0.05, ry: i, ao: false });
          }
          pbox(B, NS('paint'), K.label, 0.22, 0.1, 0.01, cw / 4, 0.3, cd / 2 + 0.002);
          if (o.part === 'planter') B.col(-cw / 2, 0, -cd / 2, cw / 2, PH, cd / 2);
        } else {
          const R = kind === 'canopy' ? (o.col ? o.col[0] / 2 : 0.55) : 0.45, nr = kind === 'canopy' ? 8 : 6;
          B.cyl('paint', K.modDk, R, PH - 0.05, 0, (PH - 0.05) / 2, 0, { seg: kind === 'canopy' ? 16 : 12 });
          for (let k = 0; k < nr; k++) { const a = (k / nr) * TAU; pbox(B, NS('paint'), K.mod, 0.08, PH - 0.14, 0.03, Math.cos(a) * (R + 0.002), (PH - 0.05) / 2, Math.sin(a) * (R + 0.002), { ry: -a + HP }); }
          B.tor('gloss', K.trim, R, 0.04, 0, PH - 0.03, 0, { rx: HP, rs: 4, ts: kind === 'canopy' ? 24 : 20 });
          B.cyl(NS('paint'), K.soil, R - 0.04, 0.03, 0, SOIL, 0, { seg: 12 });
          const nl = kind === 'canopy' ? 8 : 5;
          for (let k = 0; k < nl; k++) { const a = (k / nl) * TAU + 0.4; B.add(NS('foliage'), blob(0, k), '#6f9a4e', Math.cos(a) * (R - 0.15), SOIL + 0.03, Math.sin(a) * (R - 0.15), { sx: 0.08, sy: 0.04, sz: 0.08, ao: false }); }
          pbox(B, NS('paint'), K.label, 0.16, 0.1, 0.01, 0, 0.3, R + 0.002);
          if (o.part === 'planter') B.col(-R, 0, -R, R, PH, R);
        }
      }
      if (o.part !== 'planter') {
        // the two kinds: the engine's seeds (a row of thorny buds / one big leaf-crowned seed)
        if (kind && D.sprout_pod) { if (o.part === 'bulb') D.sprout_pod.build(B, { ...o, part: 'bulb' }); else { B.push(0, SOIL, 0); D.sprout_pod.build(B, { ...o, part: 'bulb' }); B.pop(); } return; }
        const y0 = o.part === 'bulb' ? 0 : SOIL;
        B.add('gloss', bulbGeo(), '#d8eebb', 0, y0, 0, {});
        for (let k = 0; k < 7; k++) B.add('gloss', veinGeo(), '#b3d692', 0, y0, 0, { ry: (k / 7) * TAU, sx: 0.12, sz: 1.02 });
        // the sprout on top: a curled shoot and two first leaves
        // (the bulb is one material — each bulb is its own moving part with its own material copies, so one draw a bulb)
        seg(B, 'gloss', '#8fbf62', [0, y0 + 0.62, 0], [0.04, y0 + 0.8, 0.02], 0.035, 0.035, { round: true });
        for (const s of [-1, 1]) B.add('gloss', blob(0, s > 0 ? 2 : 5), '#a8d47a', s * 0.1, y0 + 0.82, 0.02, { sx: 0.12, sy: 0.03, sz: 0.07, rz: s * 0.4 });
        // roots gripping the soil
        for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.3; seg(B, 'gloss', '#8a7a52', [Math.cos(a) * 0.18, y0 + 0.05, Math.sin(a) * 0.18], [Math.cos(a) * 0.33, y0 + 0.005, Math.sin(a) * 0.33], 0.025, 0.02, { round: true, seg: 4 }); }
      }
    },
  };
  // ------------------------------------------------------------------------------------------ the bramble hedgerows
  // The gateways' permanent hedgerows: a managed bramble hedge (the gardeners keep it clipped: a flat top, straight
  // faces; arching thorny canes and three-leaflet leaves in it, dark berries and white blossom, untinted — it's nobody's)
  // on a timber edging board. w along local x, h tall (2.4), d deep (1.0); its top is off-limits (roof: nobody walks it
  // round a gate), never inked. o.post: 'a' | 'b' | 'both' — a clipped topiary post (1.1 across, 2.9 tall, a ball on
  // top) at its −x ('a') / +x ('b') end: the posts frame a gateway, where a sprout pod grows its wall across the gap
  D.treehills_hedgerow = {
    desc: 'clipped permanent bramble hedgerow (w × h × d, top off-limits) with optional topiary gate posts at its ends',
    params: { w: 'length (local x)', h: 'height (2.4)', d: 'depth (1.0)', post: "'a' | 'b' | 'both' | undefined" },
    build(B, o) {
      const w = o.w ?? 4, h = o.h ?? 2.4, d = o.d ?? 1.0, s = o.seed ?? 5, rnd = (i) => hash(s * 1.91 + i * 0.617);
      const leaf = (k) => mixc('#2c5f30', '#78b356', Math.min(1, k));
      let q = 0;
      // the clipped body, a skirt of stems at its foot, the edging board
      B.add(NS('foliage'), tpl('thhedge' + [w, h, d].map((v) => v.toFixed(2)).join(), () => H.roundBox(w - 0.06, h - 0.02, d - 0.06, 0.08)), '#1f4626', 0, (h - 0.02) / 2, 0);
      pbox(B, 'wood', '#6b5a3e', w - 0.1, 0.16, d + 0.06, 0, 0.08, 0);
      // leafy masses over the faces and ends, flush (clipped), lighter toward the top
      for (const sz of [-1, 1]) {
        const nx = Math.max(2, Math.round(w / 0.5)), ny = Math.max(3, Math.round(h / 0.5));
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          const r = 0.22 + 0.08 * rnd(q++), x = -w / 2 + r * 0.8 + ((i + 0.2 + 0.6 * rnd(q++)) / nx) * (w - r * 1.6), y = 0.2 + r * 0.6 + ((j + 0.2 + 0.6 * rnd(q++)) / ny) * (h - r * 1.3 - 0.2);
          B.add(NS('foliage'), puff(0, q % 6), leaf(0.15 + 0.5 * (y / h) + 0.2 * rnd(q++)), x, y, sz * (d / 2 - 0.05), { sx: r, sy: r * 0.9, sz: 0.08 });
        }
        // arching canes (a handful) and their trefoil leaves, a few berries and blossoms
        for (let k = 0; k < Math.max(2, Math.round(w / 1.2)); k++) {
          const x0 = -w / 2 + rnd(q++) * w, dir = rnd(q++) < 0.5 ? -1 : 1, span = 1.2 + rnd(q++) * 1.2, rise = h * (0.5 + 0.4 * rnd(q++)), pts = [];
          for (let u = 0; u <= 1.0001; u += 1 / 8) { const x = x0 + dir * u * span; if (x < -w / 2 + 0.05 || x > w / 2 - 0.05) break; pts.push([x, 0.1 + rise * Math.sin(Math.PI * Math.pow(u, 0.8)), sz * (d / 2 - 0.01)]); }
          if (pts.length >= 3) B.tube(NS('wood'), '#6b3f3a', pts, 0.028, { radial: 5 });
        }
        for (let k = 0; k < Math.round(w * 1.6); k++) {
          const x = -w / 2 + 0.2 + rnd(q++) * (w - 0.4), y = 0.4 + rnd(q++) * (h - 0.6), zf = sz * (d / 2 + 0.01);
          if (rnd(q++) < 0.5) for (let i = 0; i < 6; i++) B.add(NS('gloss'), blob(0, i), '#3a1f4a', x + Math.cos(i * 2.4) * 0.03, y + Math.sin(i * 2.4) * 0.03, zf, { s: 0.028, sz: 0.018, ao: false });
          else for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; B.add(NS('gloss'), blob(0, i), '#f6f0f2', x + Math.cos(a) * 0.04, y + Math.sin(a) * 0.04, zf, { sx: 0.035, sy: 0.025, sz: 0.008, rz: a, ao: false }); }
        }
      }
      for (const sx of [-1, 1]) {
        const nz = Math.max(2, Math.round(d / 0.45)), ny = Math.max(3, Math.round(h / 0.5));
        for (let i = 0; i < nz; i++) for (let j = 0; j < ny; j++) {
          const r = 0.2 + 0.06 * rnd(q++), z = -d / 2 + r * 0.7 + ((i + 0.5) / nz) * (d - r * 1.4), y = 0.2 + r * 0.6 + ((j + 0.2 + 0.6 * rnd(q++)) / ny) * (h - r * 1.3 - 0.2);
          B.add(NS('foliage'), puff(0, q % 6), leaf(0.2 + 0.5 * (y / h)), sx * (w / 2 - 0.05), y, z, { sx: 0.08, sy: r * 0.9, sz: r });
        }
      }
      // the clipped top: flat, a mat of small sprays
      for (let i = 0; i < Math.round((w * d) / 0.12); i++) B.add(NS('foliage'), puff(0, i % 6), leaf(0.55 + 0.3 * rnd(q++)), -w / 2 + 0.15 + rnd(q++) * (w - 0.3), h - 0.04, -d / 2 + 0.12 + rnd(q++) * (d - 0.24), { sx: 0.18, sy: 0.05, sz: 0.14 });
      B.col(-w / 2, 0, -d / 2, w / 2, h, d / 2, ROOF);
      // the gate posts: clipped columns, taller, a ball on top, flush with the hedge's end (a length too short for two
      // is one post, as wide as it)
      const post = (x, pw = 1.1) => {
        const ph = h + 0.3;   // (2.9 m on the rill hedge: nothing on the line above 3 m)
        B.add(NS('foliage'), blob(1, 3), '#244f2b', x, ph / 2 - 0.1, 0, { sx: pw / 2, sy: ph / 2, sz: Math.max(pw, d + 0.1) / 2 });
        for (let j = 0; j < 6; j++) for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + j * 0.5, y = 0.3 + j * 0.42; B.add(NS('foliage'), puff(0, (j + k) % 6), leaf(0.2 + 0.1 * j), x + Math.cos(a) * pw * 0.45, y, Math.sin(a) * Math.max(pw, d + 0.1) * 0.45, { sx: 0.26, sy: 0.24, sz: 0.26 }); }
        B.add(NS('foliage'), puff(1, 2), leaf(0.7), x, ph + 0.18, 0, { s: 0.36 });
        pbox(B, 'wood', '#6b5a3e', pw + 0.1, 0.16, Math.max(pw, d + 0.1) + 0.1, x, 0.08, 0);
        B.col(x - pw / 2, 0, -Math.max(pw, d + 0.1) / 2, x + pw / 2, ph, Math.max(pw, d + 0.1) / 2, ROOF);
      };
      if (o.post === 'both' && w < 2.4) post(0, w);
      else {
        if (o.post === 'a' || o.post === 'both') post(-w / 2 + 0.55);
        if (o.post === 'b' || o.post === 'both') post(w / 2 - 0.55);
      }
    },
  };

  // The hedge a pod grows: w (across, local x) × h × d, origin at its base centre, no colliders (the engine's block is
  // the size + 2 cm). A dense clipped boxwood wall: a flat top (the owner's ink is drawn on the block's faces), leafy
  // clumps flush with the faces (the look stays within a few cm of the box, a little deeper than the 0.9 m planter it
  // bursts from). o.tint (THREE.Color: the grower's ink): a light touch in the leaves ('foliage', the engine adds a
  // faint sheen); the full colour in its blossoms ('gloss', a stronger sheen); the stems ('wood') never glow.
  D.treehills_hedge = {
    desc: 'grown sprout hedge (w × h × d from `size`, origin at its base centre, tinted by `tint`; no colliders)',
    params: { size: '[w, h, d] (m)', tint: 'owner team colour (optional)' },
    build(B, o) {
      const [w0, h, d0] = o.size || [o.w ?? 3, o.h ?? 1.8, o.d ?? 0.9];
      const w = w0 + 0.03, d = d0 + 0.04, t = o.tint ?? null, s = o.seed ?? 21;
      // tinted: the leaves keep their green with a touch of the owner's colour; its blossoms carry the colour itself
      const leaf = t ? mixc('#b4dc98', t, 0.2) : col(K.leafMid);
      const leafDk = t ? mixc('#86b36d', t, 0.16) : col('#86b36d');
      const bloom = t ? mixc(t, '#ffffff', 0.12) : null;
      // the clipped body (flat top) just inside the faces, and a darker skirt of stems at the base
      B.box('foliage', mixc(leafDk, leaf, 0.35), w - 0.05, h - 0.03, d - 0.05, 0, (h - 0.03) / 2, 0, { round: true, r: 0.06 });
      pbox(B, NS('wood'), '#6b5a3e', w - 0.3, 0.12, d - 0.2, 0, 0.06, 0);
      // leafy clumps on both faces and the ends (a jittered grid, random sizes, lighter toward the top), each one flush:
      // its outer side ≤ ~3 cm past the face; sprigs along the top edges (≤ 4 cm over the top)
      const rnd = (i) => hash(s * 1.37 + i * 0.731);
      let q = 0;
      const clumps = (nx, ny, place) => {
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          const u = (i + 0.2 + 0.6 * rnd(q++)) / nx, v = (j + 0.2 + 0.6 * rnd(q++)) / ny, r = 0.15 + 0.12 * rnd(q++);
          const c = mixc(leafDk, leaf, Math.min(1, 0.25 + v * 0.6 + 0.3 * rnd(q++)));
          place(u, v, r, c, (i * 7 + j) % 6);
        }
      };
      const flat = 0.09;
      for (const sz of [-1, 1]) clumps(Math.max(3, Math.round(w / 0.4)), Math.max(2, Math.round(h / 0.42)), (u, v, r, c, k) =>
        B.add('foliage', puff(0, k), c, -w / 2 + r * 0.9 + u * (w - r * 1.8), 0.1 + r * 0.8 + v * (h - r * 1.8 - 0.14), sz * (d / 2 - flat * 0.7), { sx: r, sy: r * 0.92, sz: flat, ry: (rnd(q++) - 0.5) * 0.4 }));
      for (const sx of [-1, 1]) clumps(Math.max(2, Math.round(d / 0.36)), Math.max(2, Math.round(h / 0.42)), (u, v, r, c, k) =>
        B.add('foliage', puff(0, k), c, sx * (w / 2 - flat * 0.7), 0.1 + r * 0.8 + v * (h - r * 1.8 - 0.14), -d / 2 + r * 0.8 + u * (d - r * 1.6), { sx: flat, sy: r * 0.92, sz: r }));
      const ns = Math.round(w / 0.28);
      for (const sz of [-1, 1]) for (let i = 0; i < ns; i++) {
        const x = -w / 2 + 0.15 + ((i + rnd(q++)) / ns) * (w - 0.3), r = 0.09 + 0.06 * rnd(q++);
        B.add('foliage', puff(0, i % 6), leaf, x, h - 0.02, sz * (d / 2 - 0.06), { sx: r * 1.3, sy: 0.05, sz: r * 0.7 });
      }
      // blossoms in little clusters on the faces (the owner's colour when tinted; mixed flowers otherwise)
      const nb = Math.round(w * h * (t ? 4.2 : 2.2));
      for (let i = 0; i < nb; i++) {
        const side = rnd(q++) < 0.5 ? -1 : 1, x = (rnd(q++) - 0.5) * (w - 0.3), y = 0.35 + rnd(q++) * (h - 0.55);
        const c = bloom ?? K.flowers[i % K.flowers.length];
        for (let k = 0; k < 3; k++) B.add('gloss', blob(0, (i + k) % 8), c, x + (k - 1) * 0.07, y + (k % 2) * 0.06, side * (d / 2 + 0.015), { s: 0.05 + 0.025 * rnd(q++), sz: 0.03, ao: false });
      }
    },
  };
}
