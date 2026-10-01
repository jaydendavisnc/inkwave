// Sprout pods' default looks (src/game/pods.js): the seed bulb (and a planter, for a layout that asks the engine for
// one) and the plant it grows, for any stage whose LAYOUT.pods doesn't name prop types of its own. A stage's own types
// follow the same contract:
//
//   pod type — built by the engine (PropKit.buildPart, in the pod's own frame); o.kind says which plant the pod grows
//   ('wall' | 'canopy'; null: old pod data — a wall, drawn the old way), o.col its planter's size [w, h, d]. The two
//   kinds must read differently at a glance while dormant (here: a long trough and a row of thorny buds for a wall, a
//   round tub and one big leaf-crowned seed for a canopy):
//     o.part === 'bulb'     the swelling part, its origin at its own base: the engine anchors it at the pod's bulbY
//                           (the planter's height), scales it from there as the meters fill, blushes it toward the team
//                           that's ahead and makes it glow — through its own copies of the materials (build it pale)
//     o.part === 'planter'  the planter, origin at the pod's ground point — only drawn by the engine when the layout
//                           asks it to (pods.planter); a stage normally places its planters as props with colliders
//     (no part: both, for a static placement)
//   plant type — built at o.size = [w, h, d] (also o.w, o.h, o.d), origin at its base centre, no colliders (the engine's
//     blocks). o.tint (a THREE.Color: the grower's ink; null = untinted) and o.team: bake the team into the look (the
//     engine builds one per team, again when the palette changes). On top, the engine gives its own copies of the
//     'foliage' (leaves) and 'gloss' (blossoms, berries) materials a sheen of that ink and browns them as the plant is
//     cut down and wilts. The team's ink is drawn on the blocks' faces, so keep the outside within ~5 cm of them and the
//     tops flat-ish (a few leaves, twigs and roots may stray further where nobody inks: under a canopy, at the ground)
//     • a wall (kind 'wall'; 'sprout_bramble'): one block, w × h × d
//     • a canopy (kind 'canopy'; 'sprout_canopy'): built in two parts the engine animates apart — o.part 'trunk' (its
//       trunk: o.trunk wide, the full depth d, up to h − o.deck) and 'crown' (the platform: w × o.deck × d with its top
//       at h, and the parapet round its rim: o.rail high, o.railW thick); no part: both
export function registerPods(D, H) {
  const { THREE, PALETTE, TAU, HP, col, mixc, blobGeo, puffGeo, roundBox, tubeGeo } = H;
  const cache = new Map();
  const once = (k, fn) => { let g = cache.get(k); if (!g) { g = fn(); cache.set(k, g); } return g; };
  const blob = (det, k) => once('b' + det + ':' + k, () => blobGeo(1, det, k + 1));
  const puff = (det, k) => once('p' + det + ':' + k, () => puffGeo(det, k + 3));
  // a leaf (a pointed oval: a flattened blob) at (x, y, z), lying in the plane facing n ('x' | 'y' | 'z', sign s), turned
  // by `spin` in that plane, `len` long
  const leafAt = (B, c, x, y, z, n, s, spin, len, det = 0) => {
    const o = n === 'z' ? { rz: spin, ry: s > 0 ? 0 : Math.PI } : n === 'x' ? { ry: s * HP, rz: spin } : { rx: -HP * s, rz: spin };
    B.add('foliage', blob(det, (Math.abs(Math.round(x * 13 + y * 7 + z * 5)) % 5)), c, x, y, z, { ...o, sx: len * 0.42, sy: len, sz: 0.022, ao: false });
  };
  // a three-leaflet bramble leaf, fanned out in the face's plane
  const trefoil = (B, c, x, y, z, n, s, a, len) => {
    for (const [da, k] of [[0, 1], [0.75, 0.78], [-0.75, 0.78]]) {
      const ang = a + da, dx = Math.sin(ang) * len * 0.5 * k, dy = Math.cos(ang) * len * 0.5 * k;
      if (n === 'z') leafAt(B, c, x + dx, y + dy, z, n, s, -ang, len * k);
      else if (n === 'x') leafAt(B, c, x, y + dy, z + dx, n, s, ang, len * k);
      else leafAt(B, c, x + dx, y, z + dy, n, s, -ang, len * k);
    }
  };

  // ------------------------------------------------------------------------------------------ the pod
  D.sprout_pod = {
    desc: 'Sprout pod (the pods engine\'s default look): a pale seed in its planter — for a bramble wall a long concrete trough and a row of three '
      + 'thorny buds on a runner, for a canopy a round hooped wooden tub and one big seed crowned with broad leaves; old pod data: the round '
      + 'concrete planter and a teardrop bulb.',
    params: { part: "'planter' | 'bulb' (both when unset)", kind: "'wall' | 'canopy' | null (old data)", col: '[w, h, d]: the planter' },
    variants: 1, mount: 'ground',
    build(B, o) {
      const planter = o.part !== 'bulb', bulb = o.part !== 'planter', kind = o.kind || null;
      const [cw, ch, cd] = o.col || (kind === 'wall' ? [1.6, 0.5, 0.7] : kind === 'canopy' ? [1.1, 0.5, 1.1] : [0.9, 0.5, 0.9]);
      if (planter) {
        if (kind === 'wall') {
          // a long concrete trough: a chamfered body, a rolled lip, iron straps at its ends, dark soil, bramble runners
          B.blob(cw + 0.4, cd + 0.4);
          const conc = mixc('concrete', 'warmgrey', 0.35);
          B.box('paint', conc, cw - 0.04, ch - 0.06, cd - 0.04, 0, (ch - 0.06) / 2, 0, { r: 0.04 });
          for (const s of [1, -1]) {
            B.box('paint', mixc(conc, 'white', 0.12), cw, 0.07, 0.07, 0, ch - 0.035, s * (cd / 2 - 0.035), { r: 0.025 });
            B.box('paint', mixc(conc, 'white', 0.12), 0.07, 0.07, cd - 0.1, s * (cw / 2 - 0.035), ch - 0.035, 0, { r: 0.025 });
            B.box('metal', '#5b5e63', 0.05, ch - 0.1, cd + 0.01, s * (cw / 2 - 0.16), (ch - 0.1) / 2 + 0.02, 0, { r: 0.01 });
          }
          B.box('rubber', PALETTE.soil, cw - 0.14, 0.04, cd - 0.14, 0, ch - 0.07, 0);
          // runners and little leaves on the soil
          for (let i = 0; i < 5; i++) {
            const x0 = -cw / 2 + 0.2 + (i / 4) * (cw - 0.4), z0 = (i % 2 ? 1 : -1) * 0.12;
            B.tube('wood', '#6b3f3a', [[x0 - 0.14, ch - 0.045, z0], [x0, ch - 0.02, z0 * 0.4], [x0 + 0.14, ch - 0.045, -z0 * 0.6]], 0.014, { radial: 5 });
            leafAt(B, mixc('leaf', 'leafdark', B.r(0, 0.6)), x0 + 0.1, ch - 0.035, z0 * 0.2, 'y', 1, B.r(0, TAU), 0.1);
          }
        } else if (kind === 'canopy') {
          // a round tub of hooped wooden staves, soil, moss and broad leaves round its rim
          const R = cw / 2, n = 16;
          B.blob(cw + 0.4, cw + 0.4);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            B.box('wood', mixc('wood', 'wooddark', 0.35 + 0.3 * ((i * 7) % 3) / 2), (TAU * R) / n + 0.01, ch, 0.06, Math.cos(a) * (R - 0.03), ch / 2, Math.sin(a) * (R - 0.03), { ry: -a + HP, r: 0.012 });
          }
          for (const y of [0.1, ch - 0.1]) B.tor('metal', '#4f5358', R + 0.005, 0.018, 0, y, 0, { rx: HP, rs: 4, ts: 24 });
          B.cyl('rubber', PALETTE.soil, R - 0.06, 0.04, 0, ch - 0.06, 0, { seg: 16 });
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + 0.3;
            B.add('foliage', blob(0, i), mixc('#6f9a4e', 'leaflight', B.r(0, 0.4)), Math.cos(a) * (R - 0.12), ch - 0.03, Math.sin(a) * (R - 0.12), { sx: 0.1, sy: 0.035, sz: 0.1, ao: false });
          }
        } else {
          // (old pod data) the planter: a squat concrete bowl with a rolled lip, soil at 0.44 m
          B.blob(1.2, 1.2);
          const prof = [[0, 0], [0.4, 0], [0.45, 0.04], [0.47, 0.44], [0.44, 0.5], [0.38, 0.49], [0.37, 0.42], [0, 0.42]];
          B.lathe('paint', mixc('concrete', 'warmgrey', 0.35), prof, 0, 0, 0, { seg: 18 });
          B.cyl('rubber', PALETTE.soil, 0.37, 0.04, 0, 0.44, 0, { seg: 16 });
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * TAU + B.r(-0.15, 0.15);
            B.add('foliage', once('leaf' + (i % 4), () => blobGeo(1, 1, i % 4)), mixc('leaf', 'leaflight', B.r(0, 0.4)),
              Math.cos(a) * 0.31, 0.49, Math.sin(a) * 0.31, { sx: 0.13, sy: 0.05, sz: 0.09, ry: -a, ao: false });
          }
        }
      }
      if (bulb) {
        const y0 = o.part === 'bulb' ? 0 : ch - 0.04;
        if (kind === 'wall') {
          // three thorny buds on a curling runner, along the trough (pale, so the team blush reads)
          B.tube('gloss', '#b3d692', [[-0.5, y0 + 0.03, 0.04], [-0.25, y0 + 0.07, -0.05], [0, y0 + 0.04, 0.04], [0.25, y0 + 0.07, -0.05], [0.5, y0 + 0.03, 0.03]], 0.035, { radial: 6 });
          for (const [x, s, lean] of [[0, 1, 0], [-0.33, 0.72, 0.28], [0.33, 0.72, -0.28]]) {
            const prof = [[0, 0], [0.1, 0.03], [0.15, 0.12], [0.15, 0.24], [0.12, 0.36], [0.07, 0.46], [0.02, 0.54], [0, 0.56]].map(([r, y]) => [r * s, y * s]);
            B.push(x, y0 + 0.02, 0, 0, 0, lean);
            B.lathe('gloss', '#d8eebb', prof, 0, 0, 0, { seg: 12 });
            for (let k = 0; k < 7; k++) {
              const a = (k / 7) * TAU + x * 3, y = (0.1 + (k % 3) * 0.14) * s, r = 0.15 * s * (1 - (k % 3) * 0.12);
              B.cyl('gloss', '#b8d99a', 0.022 * s, 0.09 * s, Math.cos(a) * r, y, Math.sin(a) * r, { r2: 0, seg: 5, rx: HP * Math.sin(a), rz: -HP * Math.cos(a) });
            }
            // a curled tip
            B.tube('gloss', '#9cc977', [[0, 0.54 * s, 0], [0.04 * s, 0.63 * s, 0.01], [0.09 * s, 0.64 * s, 0.02], [0.1 * s, 0.58 * s, 0.02]], 0.018 * s, { radial: 5 });
            B.pop();
          }
          for (const s of [-1, 1]) B.add('gloss', blob(0, s > 0 ? 2 : 4), '#a8d47a', s * 0.18, y0 + 0.08, 0.1, { sx: 0.1, sy: 0.025, sz: 0.06, ry: s * 0.5 });
        } else if (kind === 'canopy') {
          // one big round seed (pale, finely ribbed) crowned with five broad young leaves, a knobbly cup round its foot
          const prof = [[0, 0], [0.14, 0.02], [0.25, 0.1], [0.3, 0.22], [0.29, 0.34], [0.23, 0.45], [0.13, 0.52], [0, 0.55]];
          B.lathe('gloss', '#d8eebb', prof, 0, y0, 0, { seg: 16 });
          // (fine ribs down its sides)
          for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; B.tube('gloss', '#c2e0a2', prof.slice(1, -1).map(([r, y]) => [Math.cos(a) * r * 1.02, y0 + y, Math.sin(a) * r * 1.02]), 0.012, { radial: 4 }); }
          B.lathe('gloss', '#b3d692', [[0, 0], [0.2, 0.0], [0.27, 0.05], [0.29, 0.1], [0.24, 0.12], [0, 0.1]], 0, y0, 0, { seg: 12 });
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * TAU;
            B.add('gloss', blob(1, k), k % 2 ? '#a8d47a' : '#b8dd8c', Math.cos(a) * 0.13, y0 + 0.66, Math.sin(a) * 0.13,
              { sx: 0.1, sy: 0.2, sz: 0.035, ry: -a + HP, rx: -0.55, ao: false });
          }
          B.cyl('gloss', '#8fbf62', 0.03, 0.16, 0, y0 + 0.6, 0, { seg: 6 });
        } else {
          // (old pod data) a teardrop seed pod, leaf petals cupping it, a curled shoot on top
          const prof = [[0, 0], [0.13, 0.03], [0.21, 0.11], [0.23, 0.2], [0.2, 0.3], [0.13, 0.39], [0.06, 0.45], [0, 0.47]];
          const yb = o.part === 'bulb' ? 0 : 0.46;
          B.lathe('gloss', '#d9ecb8', prof, 0, yb, 0, { seg: 16 });
          for (const [x, z] of [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2], [0.14, 0.14], [-0.14, -0.14]]) B.add('foliage', once('petal', () => blobGeo(1, 1, 5)), 'leaf',
            x, yb + 0.1, z, { sx: 0.11, sy: 0.16, sz: 0.05, ry: Math.atan2(x, z), rx: 0.35, ao: false });
          B.cyl('foliage', 'leafdark', 0.018, 0.14, 0.02, yb + 0.53, 0, { seg: 6, rz: 0.4 });
          B.add('foliage', once('bud', () => blobGeo(1, 1, 2)), 'leaflight', 0.06, yb + 0.59, 0, { sx: 0.05, sy: 0.035, sz: 0.04, ao: false });
        }
      }
    },
  };

  // ------------------------------------------------------------------------------------------ the bramble wall
  // A thick wall of woven bramble: thorny canes arching up out of the ground and back down across both faces over a
  // dense, lumpy leafy body, three-leaflet leaves, clusters of berries and blossoms in the grower's ink; a flat woven top
  // (the owners' walkway) with a crest of arching canes along its edges, gnarled canes rooting it at its foot.
  D.sprout_bramble = {
    desc: 'Bramble wall (the pods engine\'s default wall): a dense woven wall of thorny arching canes and three-leaflet leaves (o.size = [w, h, d], '
      + 'default 5 × 2.7 × 1.2) with a flat leafy top; clusters of berries and blossoms (and a light touch of the leaves) in o.tint.',
    params: { size: '[w, h, d] (m): length (local x), height, depth (local z)', tint: 'THREE.Color | null: the grower\'s ink' },
    variants: 1, mount: 'ground',
    build(B, o) {
      const [w0, h, d0] = o.size || [o.w ?? 5, o.h ?? 2.7, o.d ?? 1.2];
      const w = w0 + 0.03, d = d0 + 0.04, t = o.tint ? col(o.tint) : null, rnd = () => B.r();
      const leaf = (k) => { const c = mixc('#2f6634', '#86c460', Math.min(1, k)); return t ? mixc(c, t, 0.13) : c; };
      const cane = ['#6b3f3a', '#5c3a35', '#7a4a3c', '#6a4a2c'], thorn = '#e2c79c';
      const berry = t ? mixc(t, '#1a1020', 0.12) : col('#3a1f4a'), bloom = t ? mixc(t, '#ffffff', 0.3) : col('#fbeef4');
      let q = 0;
      // the dense body (flat top): a dark tangle just inside the faces (not 'foliage': the engine's team sheen on its
      // leaves would swamp something this dark)
      B.add('wood', roundBox(w - 0.08, h - 0.03, d - 0.08, 0.1), '#1d4424', 0, (h - 0.03) / 2, 0);
      // lumpy leaf masses over both faces and the ends: a jittered grid of flattened puffs at varied depths (dark hollows
      // between them), darker low down, sunlit toward the top
      for (const sz of [-1, 1]) {
        const nx = Math.max(3, Math.round(w / 0.36)), ny = Math.max(3, Math.round(h / 0.36));
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          const r = 0.16 + 0.13 * rnd(), x = -w / 2 + r * 0.8 + ((i + 0.15 + 0.7 * rnd()) / nx) * (w - r * 1.6), y = 0.12 + r * 0.6 + ((j + 0.15 + 0.7 * rnd()) / ny) * (h - r * 1.4 - 0.12);
          const dz = -0.04 - 0.07 * rnd();
          B.add('foliage', puff(rnd() < 0.4 ? 1 : 0, q++ % 6), leaf(0.12 + 0.55 * (y / h) + 0.25 * rnd()), x, y, sz * (d / 2 + dz), { sx: r, sy: r * 0.88, sz: 0.09, ry: (rnd() - 0.5) * 0.5 });
        }
      }
      for (const sx of [-1, 1]) {
        const nz = Math.max(2, Math.round(d / 0.36)), ny = Math.max(3, Math.round(h / 0.36));
        for (let i = 0; i < nz; i++) for (let j = 0; j < ny; j++) {
          const r = 0.15 + 0.1 * rnd(), z = -d / 2 + r * 0.7 + ((i + 0.3 + 0.4 * rnd()) / nz) * (d - r * 1.4), y = 0.12 + r * 0.6 + ((j + 0.15 + 0.7 * rnd()) / ny) * (h - r * 1.4 - 0.12);
          B.add('foliage', puff(0, q++ % 6), leaf(0.15 + 0.5 * (y / h) + 0.2 * rnd()), sx * (w / 2 - 0.05 - 0.05 * rnd()), y, z, { sx: 0.09, sy: r * 0.88, sz: r });
        }
      }
      // arching canes: each springs from the ground, arcs up and over and back down (a bramble's habit), in the face's
      // plane just proud of the leaves, thorns along it; clipped at the wall's ends
      const arch = (sz, x0, dir, span, rise, rad) => {
        const zf = sz * (d / 2 - 0.012), run = [], runs = [];
        for (let k = 0; k <= 18; k++) {
          const u = k / 18, x = x0 + dir * u * span, y = 0.04 + rise * Math.sin(Math.PI * Math.pow(u, 0.75));
          const inside = x > -w / 2 + 0.05 && x < w / 2 - 0.05 && y < h - 0.06;
          if (inside) run.push([x, y, zf + sz * 0.01 * Math.sin(u * 11 + x0 * 3)]);
          if ((!inside || k === 18) && run.length) { if (run.length >= 3) runs.push(run.splice(0)); else run.length = 0; }
        }
        for (const r of runs) {
          B.tube('wood', cane[q++ % 4], r, rad, { radial: 6 });
          for (let k = 1; k < r.length - 1; k++) {
            if (rnd() < 0.45) continue;
            const [x, y, z] = r[k];
            B.cyl('wood', thorn, 0.013, 0.08, x, y + 0.015, z + sz * 0.04, { r2: 0, seg: 4, rx: sz * (HP - 0.35) + (rnd() - 0.5) * 0.5, rz: (rnd() - 0.5) * 0.7 });
          }
        }
      };
      for (const sz of [-1, 1]) {
        const n = Math.round(w * 1.9);
        for (let i = 0; i < n; i++) {
          const dir = rnd() < 0.5 ? -1 : 1, x0 = -w / 2 - 0.4 + rnd() * (w + 0.8);
          arch(sz, x0, dir, 1.3 + rnd() * 1.8, h * (0.55 + 0.5 * rnd()), 0.026 + 0.02 * rnd());
        }
      }
      // three-leaflet bramble leaves over the faces (on top of the canes), and berry / blossom clusters in the ink
      for (const sz of [-1, 1]) {
        const nx = Math.max(3, Math.round(w / 0.34)), ny = Math.max(3, Math.round(h / 0.34));
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          if (rnd() < 0.25) continue;
          const x = -w / 2 + 0.18 + ((i + rnd()) / nx) * (w - 0.36), y = 0.2 + ((j + rnd()) / ny) * (h - 0.32);
          trefoil(B, leaf(0.35 + 0.55 * rnd()), x, y, sz * (d / 2 + 0.004), 'z', sz, rnd() * TAU, 0.2 + 0.08 * rnd());
        }
        const nb = Math.round(w * h * (t ? 1.8 : 1.1));
        for (let i = 0; i < nb; i++) {
          const x = -w / 2 + 0.2 + rnd() * (w - 0.4), y = 0.3 + rnd() * (h - 0.45), zf = sz * (d / 2 + 0.014);
          if (rnd() < 0.55) {
            // a blackberry: a knot of glossy drupelets
            for (let k = 0; k < 9; k++) { const a = k * 2.4; B.add('gloss', blob(0, k), berry, x + Math.cos(a) * 0.036 * (k % 3 ? 1 : 0.4), y + Math.sin(a) * 0.042 - k * 0.005, zf + (k % 2) * 0.012, { s: 0.033, sz: 0.02, ao: false }); }
          } else {
            // a five-petal blossom, its heart gold
            for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; B.add('gloss', blob(0, k + 1), bloom, x + Math.cos(a) * 0.045, y + Math.sin(a) * 0.045, zf, { sx: 0.04, sy: 0.028, sz: 0.008, rz: a, ao: false }); }
            B.add('gloss', blob(0, 3), '#f2d25a', x, y, zf + 0.007, { s: 0.018, sz: 0.008, ao: false });
          }
        }
      }
      // the top: a flat woven mat (the ink sits just over it), a crest of arching canes and leaf sprays along its edges
      const nt = Math.round((w * d) / 0.08);
      for (let i = 0; i < nt; i++) {
        const x = -w / 2 + 0.15 + rnd() * (w - 0.3), z = -d / 2 + 0.12 + rnd() * (d - 0.24);
        leafAt(B, leaf(0.4 + 0.5 * rnd()), x, h - 0.013, z, 'y', 1, rnd() * TAU, 0.17 + 0.07 * rnd());
      }
      for (const sz of [-1, 1]) {
        for (let x = -w / 2 + 0.3; x < w / 2 - 0.3; x += 0.7 + rnd() * 0.5) {
          const L = 0.5 + rnd() * 0.5, pts = [];
          for (let k = 0; k <= 6; k++) { const u = k / 6; pts.push([x + u * L, h - 0.08 + 0.16 * Math.sin(Math.PI * u), sz * (d / 2 - 0.1 + 0.08 * u)]); }
          B.tube('wood', cane[q++ % 4], pts, 0.022, { radial: 5 });
          for (let k = 1; k < 6; k += 2) trefoil(B, leaf(0.5 + 0.4 * rnd()), pts[k][0], pts[k][1] + 0.03, pts[k][2], 'y', 1, rnd() * TAU, 0.16);
        }
      }
      // its foot: gnarled canes rooting into the ground along both faces
      for (const sz of [-1, 1]) for (let x = -w / 2 + 0.25; x < w / 2 - 0.2; x += 0.45 + rnd() * 0.3) {
        B.tube('wood', cane[q++ % 4], [[x, 0.5, sz * (d / 2 - 0.12)], [x + 0.06, 0.2, sz * (d / 2 + 0.02)], [x + 0.14, 0.02, sz * (d / 2 + 0.16)]], 0.045 + 0.015 * rnd(), { radial: 6 });
      }
    },
  };

  // ------------------------------------------------------------------------------------------ the canopy
  // A broad-crowned tree grown in a burst: a thick trunk of ridged bark twisting up from buttress roots (ivy on it),
  // branches spreading under a dense, billowing leafy platform whose underside droops with leaves and hanging tendrils;
  // two curtains of aerial roots dropped from the platform's front and back edges to the ground (the climbs); a clipped
  // leafy parapet round its rim; blossoms and fruit in the grower's ink.
  D.sprout_canopy = {
    desc: 'Canopy tree (the pods engine\'s default canopy): a thick ridged trunk on buttress roots under a broad billowing leafy platform (o.size = '
      + '[w, h, d], default 3.2 × 3.0 × 3.2: the platform\'s top at h) rimmed by a clipped leafy parapet, two curtains of aerial roots dropping from '
      + "its ±z edges to the ground; blossoms and fruit in o.tint. o.part 'trunk' | 'crown' builds one half (the engine animates them apart).",
    params: { size: '[w, h, d] (m): the platform', trunk: 'trunk width (m, 1.3)', deck: 'platform thickness (0.45)', rail: 'parapet height (0.4)',
      railW: 'parapet thickness (0.25)', roots: 'root curtain width (1.3)', rootsD: 'root curtain depth (0.28)', part: "'trunk' | 'crown' (both when unset)", tint: 'THREE.Color | null' },
    variants: 1, mount: 'ground',
    build(B, o) {
      const [w0, h, d0] = o.size || [o.w ?? 3.2, o.h ?? 3.0, o.d ?? 3.2];
      const w = w0 + 0.02, d = d0 + 0.03, tw = o.trunk ?? 1.3, dk = o.deck ?? 0.45, rh = o.rail ?? 0.4, rw = o.railW ?? 0.25, gh = h - dk;
      const vw = o.roots ?? 1.3, vd = o.rootsD ?? 0.28;
      const t = o.tint ? col(o.tint) : null, rnd = () => B.r();
      const leaf = (k) => { const c = mixc('#2a5f31', '#7cba58', Math.min(1, k)); return t ? mixc(c, t, 0.08) : c; };
      const bark = ['#6e5238', '#5a432d', '#836246', '#4d3a28'];
      const bloom = t ? mixc(t, '#ffffff', 0.25) : col('#fbeef4'), fruit = t ? mixc(t, '#20121c', 0.08) : col('#d9573a');
      const trunk = o.part !== 'crown', crown = o.part !== 'trunk';
      const hx = w / 2, hz = d / 2;
      let q = 0;
      // a point on the trunk's rounded-square outline (a superellipse) at angle a, pushed out by k
      const R0 = tw / 2 - 0.03, ring = (a, k = 1) => { const c = Math.cos(a), s = Math.sin(a); return [R0 * k * Math.sign(c) * Math.pow(Math.abs(c), 0.5), R0 * k * Math.sign(s) * Math.pow(Math.abs(s), 0.5)]; };
      const flower = (x, y, z, n, s, a0 = 0) => {
        for (let k = 0; k < 5; k++) {
          const a = a0 + (k / 5) * TAU, dx = Math.cos(a) * 0.05 * s, dy = Math.sin(a) * 0.05 * s;
          if (n === 'y') B.add('gloss', blob(0, k), bloom, x + dx, y, z + dy, { sx: 0.045 * s, sy: 0.01, sz: 0.03 * s, ry: -a, ao: false });
          else if (n === 'z') B.add('gloss', blob(0, k), bloom, x + dx, y + dy, z, { sx: 0.045 * s, sy: 0.03 * s, sz: 0.01, rz: a, ao: false });
          else B.add('gloss', blob(0, k), bloom, x, y + dy, z + dx, { sx: 0.01, sy: 0.03 * s, sz: 0.045 * s, rx: a, ao: false });
        }
        B.add('gloss', blob(0, 2), '#f2d25a', x, y, z, { s: 0.02 * s, ao: false });
      };
      if (trunk) {
        // the trunk: a rounded bark column (it runs up into the platform), ridges twisting up it, flaring at the foot
        B.box('wood', bark[0], tw - 0.05, gh + 0.14, tw - 0.05, 0, (gh + 0.14) / 2, 0, { round: true, r: 0.3 });
        for (let i = 0; i < 18; i++) {
          const a0 = (i / 18) * TAU + rnd() * 0.15, tw2 = 0.35 + rnd() * 0.25, pts = [];
          for (let k = 0; k <= 10; k++) {
            const u = k / 10, flare = u < 0.22 ? 1 + 0.45 * Math.pow(1 - u / 0.22, 2) : 1, [x, z] = ring(a0 + u * tw2, flare * 1.02);
            pts.push([x, 0.02 + u * (gh + 0.08), z]);
          }
          B.tube('wood', bark[1 + (q++ % 3)], pts, 0.045 + 0.03 * rnd(), { radial: 6 });
        }
        // buttress roots: big flares at the corners, smaller between, gripping the ground
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + TAU / 16, big = i % 2 === 0, L = big ? 0.5 + rnd() * 0.2 : 0.3 + rnd() * 0.15;
          const [x0, z0] = ring(a, 0.95), [x1, z1] = ring(a, 1.0 + L / R0 * 0.55), [x2, z2] = ring(a, 1.0 + L / R0);
          B.tube('wood', bark[q++ % 4], [[x0, big ? 0.9 : 0.55, z0], [x0 * 1.05, 0.35, z0 * 1.05], [x1, 0.1, z1], [x2, 0.0, z2]], big ? 0.11 : 0.07, { radial: 7 });
        }
        // moss in the crooks, a knot hole, ivy up two sides
        for (let i = 0; i < 10; i++) { const a = rnd() * TAU, [x, z] = ring(a, 1.03); B.add('foliage', blob(0, i), mixc('#6f9a4e', '#8fb85a', rnd()), x, 0.1 + rnd() * 0.45, z, { sx: 0.16, sy: 0.07 + rnd() * 0.06, sz: 0.16, ry: -a, ao: false }); }
        B.cyl('rubber', '#2e2218', 0.1, 0.06, tw / 2 - 0.02, gh * 0.52, 0.12, { seg: 10, rz: HP });
        B.tor('wood', bark[3], 0.11, 0.035, tw / 2 - 0.01, gh * 0.52, 0.12, { ry: HP, rs: 4, ts: 12 });
        for (const a0 of [0.4, Math.PI + 0.4, HP + 0.2]) {
          const pts = [];
          for (let k = 0; k <= 10; k++) { const u = k / 10, [x, z] = ring(a0 + 0.5 * Math.sin(u * 4), 1.06); pts.push([x, 0.1 + u * (gh - 0.2), z]); }
          B.tube('foliage', '#4f6b32', pts, 0.013, { radial: 4 });
          for (let k = 1; k < pts.length; k++) for (const e of [-1, 1]) {
            const [x, y, z] = pts[k], a = Math.atan2(z, x) + e * 0.35, n = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? 'x' : 'z';
            leafAt(B, leaf(0.35 + 0.4 * rnd()), x + Math.cos(a) * 0.03, y + 0.03, z + Math.sin(a) * 0.03, n, n === 'x' ? Math.sign(Math.cos(a)) : Math.sign(Math.sin(a)), e * 0.8 + (rnd() - 0.5), 0.12 + rnd() * 0.04);
          }
        }
        for (let i = 0; i < 5; i++) { const a = rnd() * TAU, [x, z] = ring(a, 1.05), n = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? 'x' : 'z'; flower(x, 0.7 + rnd() * (gh - 1.0), z, n, 1); }
      }
      if (crown) {
        // branches from the trunk's top spreading under the platform to its rim
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + 0.2, [x0, z0] = ring(a, 0.7), ex = Math.cos(a), ez = Math.sin(a);
          const m = Math.min((hx - 0.3) / Math.max(0.01, Math.abs(ex)), (hz - 0.3) / Math.max(0.01, Math.abs(ez)));
          B.tube('wood', bark[q++ % 4], [[x0, gh - 0.7, z0], [ex * (tw / 2 + 0.25), gh - 0.3, ez * (tw / 2 + 0.25)], [ex * m * 0.75, gh - 0.08, ez * m * 0.75], [ex * m, gh + 0.02, ez * m]], 0.09, { radial: 6 });
        }
        // the aerial-root curtains: a braided panel of roots from the platform down to the ground (their outer faces
        // the climbs: nearly flat), vines through them, the roots splaying a little into the ground
        for (const s of [-1, 1]) {
          const zc = s * (hz - vd / 2);
          B.box('wood', bark[3], vw - 0.06, gh + 0.06, vd - 0.08, 0, (gh + 0.06) / 2, zc, { round: true, r: 0.08 });
          const n = Math.max(4, Math.round(vw / 0.17));
          for (let i = 0; i < n; i++) {
            const x0 = -vw / 2 + 0.08 + (i / (n - 1)) * (vw - 0.16), pts = [];
            for (let k = 0; k <= 9; k++) { const u = k / 9; pts.push([x0 + 0.04 * Math.sin(u * 8 + i * 2.1), gh + 0.02 - u * (gh - 0.02), s * (hz - 0.05 - 0.03 * Math.abs(Math.sin(u * 5 + i)))]); }
            pts.push([x0 + (rnd() - 0.5) * 0.1, 0.0, s * (hz + 0.1 + rnd() * 0.08)]);
            B.tube('wood', bark[q++ % 4], pts, 0.05 + 0.025 * rnd(), { radial: 6 });
          }
          for (let v = 0; v < 2; v++) {
            const pts = [];
            for (let k = 0; k <= 12; k++) { const u = k / 12; pts.push([-vw / 2 + 0.1 + (vw - 0.2) * (0.5 + 0.45 * Math.sin(u * 6 + v * 2)), 0.15 + u * (gh - 0.3), s * (hz + 0.005)]); }
            B.tube('foliage', '#4f6b32', pts, 0.012, { radial: 4 });
            for (let k = 1; k < pts.length; k++) leafAt(B, leaf(0.35 + 0.4 * rnd()), pts[k][0], pts[k][1], pts[k][2] + s * 0.004, 'z', s, rnd() * TAU, 0.12 + 0.05 * rnd());
          }
          flower(-vw / 4 + rnd() * vw / 2, 0.6 + rnd() * 1.2, s * (hz + 0.015), 'z', 1.2);
        }
        // the platform: a dense leafy slab; its underside billows down in big leaf masses, darker (open under it)
        B.add('wood', roundBox(w - 0.06, dk - 0.02, d - 0.06, 0.1), '#1e3a20', 0, gh + (dk - 0.02) / 2, 0);   // (dark: no team sheen)
        for (let i = 0; i < 34; i++) {
          const x = (rnd() - 0.5) * (w - 0.4), z = (rnd() - 0.5) * (d - 0.4);
          if (Math.abs(x) < tw / 2 + 0.05 && Math.abs(z) < tw / 2 + 0.05) continue;   // (the trunk's there)
          const r = 0.3 + rnd() * 0.2;
          B.add('foliage', puff(1, q++ % 6), leaf(0.02 + 0.2 * rnd()), x, gh + 0.08, z, { sx: r, sy: 0.18 + rnd() * 0.06, sz: r });
        }
        // the rim: big leaf masses billowing out round the platform's edge and down under it (flush where the root
        // curtains climb, so the ink up them shows)
        const rimMass = (x, z, nx, nz) => {
          const onClimb = nz !== 0 && Math.abs(x) < vw / 2 + 0.2;
          const r = onClimb ? 0.16 + 0.05 * rnd() : 0.26 + 0.12 * rnd(), out = onClimb ? -0.03 : 0.03 + 0.06 * rnd();
          B.add('foliage', puff(1, q++ % 6), leaf(0.25 + 0.45 * rnd()), x + nx * out, gh + 0.12 + rnd() * (dk - 0.28), z + nz * out,
            nx ? { sx: onClimb ? 0.08 : r * 0.45, sy: r * 0.62, sz: r * 1.15 } : { sx: r * 1.15, sy: r * 0.62, sz: onClimb ? 0.08 : r * 0.45 });
          if (!onClimb) {
            // (a skirt of leaves drooping under the rim: the crown's underside reads round, not a slab)
            B.add('foliage', puff(1, q++ % 6), leaf(0.08 + 0.25 * rnd()), x + nx * (out - 0.04), gh - 0.08 - 0.08 * rnd(), z + nz * (out - 0.04), { sx: r * (nx ? 0.7 : 1.2), sy: r * 0.6, sz: r * (nx ? 1.2 : 0.7) });
            if (rnd() < 0.5) leafAt(B, leaf(0.2 + 0.4 * rnd()), x + nx * (out + 0.02), gh - 0.2 - 0.12 * rnd(), z + nz * (out + 0.02), nx ? 'x' : 'z', nx || nz, (rnd() - 0.5) * 0.8 + Math.PI, 0.16);
          }
        };
        for (const s of [-1, 1]) {
          for (let x = -hx + 0.15; x <= hx - 0.1; x += 0.26 + rnd() * 0.08) rimMass(x, s * (hz - 0.06), 0, s);
          for (let z = -hz + 0.15; z <= hz - 0.1; z += 0.26 + rnd() * 0.08) rimMass(s * (hx - 0.06), z, s, 0);
          // (a band of leaves along the platform's top edge, up under the parapet)
          for (let x = -hx + 0.12; x <= hx - 0.08; x += 0.2) B.add('foliage', puff(0, q++ % 6), leaf(0.4 + 0.3 * rnd()), x, h - 0.08, s * (hz - 0.035), { sx: 0.15, sy: 0.09, sz: 0.06 });
          for (let z = -hz + 0.12; z <= hz - 0.08; z += 0.2) B.add('foliage', puff(0, q++ % 6), leaf(0.4 + 0.3 * rnd()), s * (hx - 0.035), h - 0.08, z, { sx: 0.06, sy: 0.09, sz: 0.15 });
        }
        // tendrils and fruit hanging from its sides over the open ground under it (down to ~1.8 m)
        for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
          const z = -hz + 0.3 + ((i + rnd()) / 7) * (d - 0.6), x = s * (hx - 0.12 - rnd() * 0.6), L = 0.35 + rnd() * 0.45, pts = [];
          for (let k = 0; k <= 6; k++) { const u = k / 6; pts.push([x + s * 0.04 * Math.sin(u * 5), gh + 0.02 - u * L, z + 0.05 * Math.sin(u * 7 + i)]); }
          B.tube('foliage', '#4f6b32', pts, 0.012, { radial: 4 });
          for (let k = 2; k < pts.length; k++) leafAt(B, leaf(0.3 + 0.5 * rnd()), pts[k][0], pts[k][1], pts[k][2], 'x', s, rnd() * TAU, 0.11 + rnd() * 0.05);
          if (i % 2 === 0) { const [fx, fy, fz] = pts[pts.length - 1]; B.add('gloss', blob(1, i % 5), fruit, fx, fy - 0.07, fz, { s: 0.075, sy: 0.085, ao: false }); }
        }
        // its top: a flat mat of leaves just under the ink
        for (let i = 0; i < Math.round((w * d) / 0.06); i++) {
          const x = (rnd() - 0.5) * (w - 0.3), z = (rnd() - 0.5) * (d - 0.3);
          leafAt(B, leaf(0.35 + 0.5 * rnd()), x, h - 0.012, z, 'y', 1, rnd() * TAU, 0.16 + 0.08 * rnd());
        }
        // the parapet: a clipped, lumpy leafy hedge round the rim; blossoms and fruit along it
        const rail = (cx, cz, lx, lz, s) => {
          B.add('foliage', roundBox(lx - 0.03, rh - 0.02, lz - 0.03, 0.07), leaf(0.18), cx, h + (rh - 0.02) / 2, cz);
          const along = lx > lz, L = along ? lx : lz, n = Math.max(2, Math.round(L / 0.22));
          for (let i = 0; i < n; i++) {
            const u = -L / 2 + ((i + 0.5 + (rnd() - 0.5) * 0.3) / n) * L, r = 0.13 + 0.06 * rnd();
            for (const e of [-1, 1]) {
              // (its outer face on a climb stays flush; elsewhere the leaves billow a little)
              const flushOut = along && e === s && Math.abs(u) < vw / 2 + 0.2;
              const off = e === s ? (flushOut ? -0.035 : 0.02 + 0.04 * rnd()) : -0.02;
              const px = along ? cx + u : cx + e * (lx / 2 + off), pz = along ? cz + e * (lz / 2 + off) : cz + u;
              B.add('foliage', puff(0, q++ % 6), leaf(0.3 + 0.45 * rnd()), px, h + 0.12 + rnd() * (rh - 0.2), pz, along ? { sx: r, sy: r * 0.75, sz: 0.08 } : { sx: 0.08, sy: r * 0.75, sz: r });
            }
            B.add('foliage', puff(0, q++ % 6), leaf(0.55 + 0.35 * rnd()), along ? cx + u : cx, h + rh - 0.03, along ? cz : cz + u, { sx: along ? r : 0.12, sy: 0.06, sz: along ? 0.12 : r });
            if (rnd() < 0.75) {
              const px = along ? cx + u + (rnd() - 0.5) * 0.1 : cx, pz = along ? cz : cz + u + (rnd() - 0.5) * 0.1;
              if (rnd() < 0.6) flower(px, h + rh + 0.01, pz, 'y', 1.1, rnd() * TAU);
              else B.add('gloss', blob(1, q % 5), fruit, px, h + rh + 0.04, pz, { s: 0.06, ao: false });
            }
          }
        };
        // leafy tufts spilling up over the parapet's corners (out of the way of anyone standing inside it)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          for (let k = 0; k < 3; k++) {
            const r = 0.2 + 0.08 * rnd();
            B.add('foliage', puff(1, q++ % 6), leaf(0.45 + 0.4 * rnd()), sx * (hx - 0.12 - 0.1 * rnd()) , h + rh - 0.02 + 0.08 * k, sz * (hz - 0.12 - 0.1 * rnd()), { sx: r, sy: r * 0.75, sz: r });
          }
          flower(sx * (hx - 0.18), h + rh + 0.22, sz * (hz - 0.18), 'y', 1.3, rnd() * TAU);
        }
        rail(0, hz - rw / 2, w, rw, 1); rail(0, -(hz - rw / 2), w, rw, -1);
        rail(hx - rw / 2, 0, rw, d - 2 * rw, 1); rail(-(hx - rw / 2), 0, rw, d - 2 * rw, -1);
        // blossoms on the platform's outer faces too
        for (let i = 0; i < Math.round(w * 5); i++) {
          const side = i % 4, u = (rnd() - 0.5) * (side < 2 ? w - 0.3 : d - 0.3), y = gh + 0.12 + rnd() * (dk - 0.2);
          if (side < 2) flower(u, y, (side ? -1 : 1) * (hz + 0.02), 'z', 1); else flower((side === 2 ? 1 : -1) * (hx + 0.02), y, u, 'x', 1);
        }
      }
    },
  };

  // (the old default hedge: a clipped boxwood wall — kept for stages that still name it)
  D.sprout_hedge = {
    desc: 'Sprout pod hedge (the old default look): a clipped boxwood wall (o.size = [w, h, d], default 3 × 1.8 × 0.9) with a flat top, '
      + 'its faces covered in small leaf sprays; o.tint (the grower\'s ink) lightly tints the leaves and colours its blossoms.',
    params: { size: '[w, h, d] (m): width (local x), height, depth (local z)', tint: 'THREE.Color | null: the grower\'s ink' },
    variants: 1, mount: 'ground',
    build(B, o) {
      const [w0, h, d0] = o.size || [o.w ?? 3, o.h ?? 1.8, o.d ?? 0.9];
      const w = w0 + 0.03, d = d0 + 0.04;
      const tint = o.tint ? col(o.tint) : null;
      const leaf = (c, k = 0.06) => (tint ? mixc(c, tint, k) : col(c));
      B.add('foliage', roundBox(w - 0.04, h - 0.03, d - 0.02, 0.05), leaf(mixc('leafdark', 'leaf', 0.3), 0.04), 0, (h - 0.03) / 2, 0);
      const spray = (x, y, z, rx, ry, s) => B.add('foliage', once('spray' + ((x * 7 + y * 13 + z * 5) & 7), () => blobGeo(1, 0, ((x * 7 + y * 13 + z * 5) & 7) + 1)),
        leaf(mixc('leaf', 'leaflight', B.r(0, 0.55))), x, y, z, { sx: s, sy: s * 0.85, sz: 0.045, rx, ry, rz: B.r(0, TAU), ao: false });
      const cell = 0.19;
      for (const sd of [1, -1]) {
        for (let y = 0.12; y < h - 0.08; y += cell) for (let x = -w / 2 + 0.1; x < w / 2 - 0.05; x += cell)
          spray(x + B.r(-0.05, 0.05), y + B.r(-0.04, 0.04), sd * (d / 2 - 0.035), 0, sd > 0 ? 0 : Math.PI, B.r(0.1, 0.14));
        for (let y = 0.12; y < h - 0.08; y += cell) for (let z = -d / 2 + 0.1; z < d / 2 - 0.05; z += cell)
          spray(sd * (w / 2 - 0.035), y + B.r(-0.04, 0.04), z + B.r(-0.04, 0.04), 0, sd * HP, B.r(0.1, 0.14));
      }
      for (let x = -w / 2 + 0.1; x < w / 2 - 0.05; x += cell) for (let z = -d / 2 + 0.1; z < d / 2 - 0.05; z += cell)
        spray(x + B.r(-0.05, 0.05), h - 0.03, z + B.r(-0.04, 0.04), -HP, 0, B.r(0.11, 0.15));
      const bl = once('blossom', () => new THREE.IcosahedronGeometry(1, 1)), bc = tint || 'white';
      const nb = Math.round(w * h * 7);
      for (let k = 0; k < nb; k++) {
        const face = B.r(), s = 0.045 + B.r(0, 0.03);
        if (face < 0.85) {
          const sd = face < 0.425 ? 1 : -1;
          B.add('gloss', bl, bc, B.r(-w / 2 + 0.12, w / 2 - 0.12), B.r(0.3, h - 0.1), sd * (d / 2 + 0.005), { s, sz: s * 0.6, ao: false });
        } else B.add('gloss', bl, bc, B.r(-w / 2 + 0.1, w / 2 - 0.1), h + 0.01, B.r(-d / 2 + 0.1, d / 2 - 0.1), { s: s * 0.8, sy: s * 0.4, ao: false });
      }
    },
  };
}
