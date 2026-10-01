// Crossroads Market — the Butter Cross (Long Stages, 2026-09-30): the market cross on the new block's square, where the
// farm wives sold butter, eggs and cheese out of the weather. An open stone loggia on a raised floor (the layout's
// butter-cross block, 1.2 m, with its steps east and west): Tuscan columns, an entablature lettered BUTTER CROSS, a
// timber ceiling, a stone-slate pyramid roof with an open lantern and a gilt ball-and-cross finial, two stone butter
// tables inside. The floor is the slice's strategic point (and Tower Command's second checkpoint: the track crosses it
// east–west over the steps, so nothing stands in the middle band and the entablature clears the tower's headroom).
export function registerCross(D, H, KIT) {
  const { PI, TAU, HP, P3, NS, K, tpl, pbox, colBox, rod, letters, shade, wallLantern } = KIT;
  const ST = K.stone, STL = K.stoneLt, STD = K.stoneDk;

  // Tuscan column from y0 to y1: square plinth, torus, tapered shaft, echinus + abacus
  function column(B, x, z, y0, y1) {
    const H = y1 - y0;
    B.box('paint', STD, 0.52, 0.14, 0.52, x, y0 + 0.07, z, { r: 0.02 });
    B.lathe('paint', ST, [[0.25, 0], [0.26, 0.06], [0.22, 0.14], [0.2, 0.2], [0.19, H - 0.36], [0.17, H - 0.3], [0.22, H - 0.2], [0.24, H - 0.16], [0.0, H - 0.16]], x, y0 + 0.14, z, { seg: 10 });
    B.box('paint', STL, 0.54, 0.14, 0.54, x, y1 - 0.07, z, { r: 0.02 });
  }

  D.crossmarket_cross = {
    desc: 'The Butter Cross (pos = the floor block\'s centre at street level; floor 5.6 × 5.2 at 1.2, steps on local ±X): Tuscan stone columns (colliders), an entablature lettered BUTTER CROSS and A.D. 1683, a boarded timber ceiling, a stone-slate pyramid roof with an open lantern, a gilt ball-and-cross finial and a weathervane (roof collider: nobody stands on it), two stone butter tables inside along the solid sides (colliders), a moulded coping on the floor edge and an inscribed panel on the solid faces.',
    params: { w: 'floor m along X (5.6)', d: 'floor m along Z (5.2)', floor: 'm (1.2)', top: 'entablature underside m (5.0)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = o.w ?? 5.6, Dd = o.d ?? 5.2, F = o.floor ?? 1.2, T = o.top ?? 5.0, hw = W / 2, hd = Dd / 2;
      // ---- the floor block's dressing: plinth band, a moulded coping on the top edge, the inscribed panels
      for (const [w, d, x, z] of [[W + 0.08, 0.06, 0, -hd - 0.03], [W + 0.08, 0.06, 0, hd + 0.03], [0.06, Dd, -hw - 0.03, 0], [0.06, Dd, hw + 0.03, 0]]) {
        pbox(B, 'paint', STD, w, 0.28, d, x, 0.14, z);
        B.box('paint', STL, w + 0.12, 0.12, d + 0.1, x, F - 0.05, z, { r: 0.02 });
      }
      for (const s of [-1, 1]) {
        B.push(0, 0, s * (hd + 0.04), s > 0 ? 0 : PI);
        B.box('paint', shade(ST, 0.96), 2.4, 0.62, 0.05, 0, 0.62, 0.0, { r: 0.02 });
        letters(B, s > 0 ? 'FAIR WEIGHT' : 'HONEST MEASURE', { h: 0.13, x: 0, y: 0.55, z: 0.03, c: STD, flat: true, wt: 0.2, track: 0.12 });
        B.pop();
      }
      // ---- columns: the four corners + two on each solid side (the stepped sides stay open for the steps)
      const cx = hw - 0.3, cz = hd - 0.3;
      const cols = [[-cx, -cz], [cx, -cz], [-cx, cz], [cx, cz], [-0.85, -cz], [0.85, -cz], [-0.85, cz], [0.85, cz]];
      for (const [x, z] of cols) { column(B, x, z, F, T); colBox(B, x, F, z, 0.4, T - F, 0.4, true); }
      // ---- entablature: architrave, frieze (lettered), cornice all round
      const EW = W + 0.1, ED = Dd + 0.1;
      for (const [w, d, x, z] of [[EW, 0.5, 0, -hd + 0.2], [EW, 0.5, 0, hd - 0.2], [0.5, ED - 1.0, -hw + 0.2, 0], [0.5, ED - 1.0, hw - 0.2, 0]]) {
        B.box('paint', ST, w, 0.24, d, x, T + 0.12, z, { r: 0.02 });
        B.box('paint', STL, w + 0.06, 0.28, d + 0.06, x, T + 0.38, z, { r: 0.02 });
        B.box('paint', ST, w + 0.3, 0.14, d + 0.3, x, T + 0.59, z, { r: 0.03 });
      }
      for (const s of [-1, 1]) {
        B.push(0, T + 0.38, s * (hd + 0.1), s > 0 ? 0 : PI);
        letters(B, 'BUTTER CROSS', { h: 0.17, x: 0, y: -0.085, z: 0.012, c: K.goldDk, flat: true, wt: 0.2, track: 0.16 });
        B.pop();
        B.push(s * (hw + 0.1), T + 0.38, 0, s > 0 ? HP : -HP);
        letters(B, 'A.D. 1683', { h: 0.15, x: 0, y: -0.075, z: 0.012, c: K.goldDk, flat: true, wt: 0.2, track: 0.14 });
        B.pop();
      }
      // ---- the ceiling: boarded soffit on joists, a hanging iron ring for the market scales
      pbox(B, 'wood', K.woodDk, W - 0.4, 0.06, Dd - 0.4, 0, T + 0.3, 0);
      for (let x = -hw + 0.6; x < hw - 0.4; x += 0.7) pbox(B, NS('wood'), shade(K.woodDk, 0.8), 0.12, 0.16, Dd - 0.5, x, T + 0.2, 0);
      B.tor(NS('metal'), K.black, 0.18, 0.02, 0, T + 0.08, 0, { rs: 3, ts: 14, rx: HP });
      rod(B, NS('metal'), K.black, P3(0, T + 0.24, 0), P3(0, T + 0.1, 0), 0.012, 3);
      // ---- the roof: a stone-slate pyramid (square, scaled to the plan), lead hips, an open lantern, the finial
      const RB = T + 0.66, RA = RB + 2.35, rx = hw + 0.35, rz = hd + 0.35;
      B.add('paint', tpl(['cmpyr', rx, rz, RA - RB].map((v) => (typeof v === 'number' ? v.toFixed(3) : v)).join('|'), () => {
        const g = new KIT.GB(), c = KIT.cx3(K.slate), h = RA - RB, corners = [[-rx, -rz], [rx, -rz], [rx, rz], [-rx, rz]];
        for (let i = 0; i < 4; i++) {
          const a = corners[i], b = corners[(i + 1) % 4], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, l = Math.hypot(mx, mz) || 1;
          const ny = Math.hypot(Math.abs(mx) > 0.01 ? rx : rz, 0) / Math.hypot(Math.abs(mx) > 0.01 ? rx : rz, h), nh = h / Math.hypot(Math.abs(mx) > 0.01 ? rx : rz, h);
          const n = [(mx / l) * nh, ny, (mz / l) * nh];
          g.tri(g.v(a[0], 0, a[1], ...n, ...c), g.v(b[0], 0, b[1], ...n, ...c), g.v(0, h, 0, ...n, ...c));
        }
        const u = [0, -1, 0], p = corners.map(([x, z]) => g.v(x, 0, z, ...u, ...c));
        g.quad(p[0], p[3], p[2], p[1]);
        return g.geo();
      }), 'white', 0, RB, 0, {});
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rod(B, NS('metal'), K.lead, P3(sx * rx, RB + 0.03, sz * rz), P3(sx * 0.35, RA - 0.35, sz * 0.35), 0.035, 4);
      const LB = RA - 0.45;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box('paint', K.woodDk, 0.08, 0.7, 0.08, sx * 0.32, LB + 0.35, sz * 0.32, { r: 0.01 });
      B.box('paint', STL, 0.86, 0.08, 0.86, 0, LB + 0.72, 0, { r: 0.01 });
      B.lathe('paint', K.lead, [[0.5, 0], [0.42, 0.1], [0.2, 0.3], [0.12, 0.42], [0.1, 0.55], [0.0, 0.58]], 0, LB + 0.76, 0, { seg: 8 });
      rod(B, 'metal', K.black, P3(0, LB + 1.3, 0), P3(0, LB + 2.3, 0), 0.02, 5);
      B.sph('gloss', K.gold, 0.13, 0, LB + 1.45, 0, { ws: 12, hs: 8 });
      pbox(B, 'gloss', K.gold, 0.05, 0.5, 0.05, 0, LB + 1.85, 0);
      pbox(B, 'gloss', K.gold, 0.3, 0.05, 0.05, 0, LB + 1.95, 0);
      B.push(0, LB + 2.2, 0, 0.6);
      pbox(B, NS('metal'), K.black, 0.7, 0.02, 0.02, 0, 0, 0);
      B.add(NS('metal'), tpl('cmvane', () => KIT.extrudeGeo([[-0.05, -0.12], [0.3, 0.0], [-0.05, 0.12], [0.02, 0.0]], 0.015, 0.004)), K.gold, 0.32, 0, 0, { ry: HP });
      B.pop();
      B.col(-rx, T, -rz, rx, RA, rz, { roof: true });
      // ---- two stone butter tables inside, along the solid sides (the middle stays clear: the steps' line)
      for (const s of [-1, 1]) {
        const z = s * (hd - 0.85);
        B.box('paint', STL, 1.9, 0.12, 0.6, 0, F + 0.84, z, { r: 0.02 });
        for (const x of [-0.7, 0.7]) B.box('paint', ST, 0.18, 0.78, 0.4, x, F + 0.39, z, { r: 0.02 });
        // a crock, a butter pat on a leaf, an egg basket
        B.lathe('paint', '#c7b79a', [[0, 0], [0.12, 0], [0.14, 0.1], [0.12, 0.2], [0.09, 0.22], [0, 0.22]], -0.5, F + 0.9, z, { seg: 10 });
        B.box('paint', '#f3dc86', 0.18, 0.06, 0.12, 0.05, F + 0.93, z, { r: 0.015 });
        B.lathe('wood', K.woodLt, [[0, 0], [0.16, 0], [0.19, 0.12], [0.0, 0.12]], 0.55, F + 0.9, z, { seg: 10 });
        for (let k = 0; k < 5; k++) B.sph(NS('paint'), '#efe3cf', 0.035, 0.55 + Math.cos(k * 1.3) * 0.08, F + 1.02, z + Math.sin(k * 1.3) * 0.08, { ws: 6, hs: 4, sy: 1.25 });
        colBox(B, 0, F, z, 1.9, 0.9, 0.6);
      }
      // ---- lanterns on the two outer faces of the corner columns toward the square's paths
      for (const [x, z, ry] of [[-cx, cz + 0.2, 0], [cx, -cz - 0.2, PI]]) { B.push(x, 0, z, ry); wallLantern(B, 0, F + 2.4); B.pop(); }
    },
  };
}
