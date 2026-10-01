// Eco-Forest Treehills — stage decals / signage for the mural atlas (mural ids 4…11; see src/world/murals.js). Drawn into
// the stage region R of the atlas; each entry: its canvas rect, where it sits on its face (metres).
//   meadow   the Commons Meadow's ground (its core slab's top, 30 × 28 m): gravel spokes, stepping stones, moss, bark
//            beds, pollinator strips, greener / drier turf (drawn 180°-symmetric, like the stage)
//   sign     ECO-FOREST TREEHILLS in pale stencil along the tree-hill's upper retaining wall, facing the meadow
//   biome    BIOME 07 · COMMONS MEADOW stencilled along the band's low wall
//   bandE/W  the bands' ground (the east band's column top, 4 × 78 m: on through the nursery since the stretch; the west
//            one's the same picture turned 180°)
//   upperE/W the upper tiers' ground (the east upper tier's column top, 7 × 30 m; the west one's turned 180°)
export const MURAL = { meadow: 4, sign: 5, upperE: 6, upperW: 7, biome: 8, bandE: 9, bandW: 10 };

export function drawMurals(g, R, kit) {
  const out = [];
  const font = (px) => `800 ${px}px Rubik, "Arial Black", sans-serif`;
  // ---------------------------------------------------------------- the ground: soft painted patches over the lawn
  // (the surface's own blades show through: fx weather 1). World → canvas through T(x, z); every shape takes world
  // metres. rnd: a seeded generator, so the pictures never change between loads.
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
  const TAU = Math.PI * 2;
  function kitFor(T, PPM, seed) {
    const rnd = rng(seed);
    const P = (x, z) => T(x, z);
    // a smooth irregular blob (k lobes) of radius rx × rz
    const blobPath = (x, z, rx, rz, j = 0.28, k = 9) => {
      const pts = [];
      for (let i = 0; i < k; i++) { const a = (i / k) * TAU, f = 1 - j / 2 + j * rnd(); pts.push(P(x + Math.cos(a) * rx * f, z + Math.sin(a) * rz * f)); }
      g.beginPath();
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let m = mid(pts[k - 1], pts[0]); g.moveTo(m[0], m[1]);
      for (let i = 0; i < k; i++) { const n = mid(pts[i], pts[(i + 1) % k]); g.quadraticCurveTo(pts[i][0], pts[i][1], n[0], n[1]); }
      g.closePath();
    };
    const blob = (x, z, rx, rz, fill, blur = 3, j) => { g.filter = `blur(${blur}px)`; g.fillStyle = fill; blobPath(x, z, rx, rz, j); g.fill(); g.filter = 'none'; };
    // speckles scattered inside an ellipse (grit, needles, petals)
    const specks = (x, z, rx, rz, n, cols, size = 1.6, needle = false) => {
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, r = Math.sqrt(rnd()), [px, py] = P(x + Math.cos(a) * rx * r, z + Math.sin(a) * rz * r);
        g.fillStyle = g.strokeStyle = cols[(rnd() * cols.length) | 0];
        if (needle) { const b = rnd() * TAU, L = size * (1.5 + rnd()); g.lineWidth = 1; g.beginPath(); g.moveTo(px - Math.cos(b) * L, py - Math.sin(b) * L); g.lineTo(px + Math.cos(b) * L, py + Math.sin(b) * L); g.stroke(); }
        else { const s = size * (0.6 + 0.8 * rnd()); g.fillRect(px - s / 2, py - s / 2, s, s); }
      }
    };
    // a gravel path along a polyline (w wide): a darker worn margin, the pale gravel, grit
    const path = (pts, w, o = {}) => {
      const line = (width, style, blur) => {
        g.filter = `blur(${blur}px)`; g.strokeStyle = style; g.lineWidth = width * PPM; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); pts.forEach(([x, z], i) => { const [px, py] = P(x, z); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); g.filter = 'none';
      };
      line(w + 0.35, o.edge ?? 'rgba(122,110,78,0.32)', 3);
      line(w, o.fill ?? 'rgba(206,193,164,0.9)', 1.2);
      // grit along it
      let L = 0; const seg = [];
      for (let i = 0; i + 1 < pts.length; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push([L, l, i]); L += l; }
      const n = Math.round(L * w * (o.grit ?? 26));
      for (let q = 0; q < n; q++) {
        const s = rnd() * L, [s0, l, i] = seg.find(([a, b]) => s >= a && s <= a + b) || seg[seg.length - 1], t = (s - s0) / l;
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = (bx - ax) / l, dz = (bz - az) / l, off = (rnd() - 0.5) * w * 0.9;
        const [px, py] = P(ax + (bx - ax) * t - dz * off, az + (bz - az) * t + dx * off);
        g.fillStyle = rnd() < 0.5 ? 'rgba(236,228,208,0.9)' : 'rgba(128,116,92,0.75)';
        const sz = 1 + rnd() * 1.4; g.fillRect(px - sz / 2, py - sz / 2, sz, sz);
      }
    };
    // stepping stones along a polyline, every `step` m
    const stones = (pts, step = 0.8) => {
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az);
        for (let s = step / 2; s < l; s += step) {
          const x = ax + ((bx - ax) * s) / l + (rnd() - 0.5) * 0.12, z = az + ((bz - az) * s) / l + (rnd() - 0.5) * 0.12;
          blob(x, z - 0.03, 0.34, 0.27, 'rgba(60,58,40,0.35)', 2, 0.2);
          blob(x, z, 0.31, 0.24, 'rgba(196,190,174,0.95)', 0.6, 0.18);
        }
      }
    };
    // a pollinator strip along a polyline (w wide): lush darker base, flower heads
    const flowers = (pts, w, dens = 70) => {
      path(pts, w, { edge: 'rgba(40,70,30,0.18)', fill: 'rgba(78,118,52,0.5)', grit: 0 });
      const cols = ['rgba(242,212,90,0.95)', 'rgba(233,138,176,0.95)', 'rgba(183,154,230,0.95)', 'rgba(250,250,244,0.95)', 'rgba(240,138,93,0.9)'];
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / l, dz = (bz - az) / l;
        for (let q = 0; q < l * w * dens; q++) {
          const s = rnd() * l, off = (rnd() - 0.5) * w * 0.85, [px, py] = P(ax + dx * s - dz * off, az + dz * s + dx * off);
          g.fillStyle = cols[(rnd() * cols.length) | 0]; const r = 0.9 + rnd() * 1.3;
          g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill();
        }
      }
    };
    // needle litter / bark mulch under trees
    const litter = (x, z, rx, rz) => {
      blob(x, z, rx, rz, 'rgba(104,84,56,0.62)', 4);
      specks(x, z, rx * 0.9, rz * 0.9, Math.round(rx * rz * 60), ['rgba(70,52,34,0.8)', 'rgba(150,118,78,0.75)', 'rgba(92,110,58,0.6)'], 1.4, true);
    };
    const moss = (x, z, rx, rz) => { blob(x, z, rx, rz, 'rgba(62,104,48,0.36)', 5); specks(x, z, rx * 0.8, rz * 0.8, Math.round(rx * rz * 25), ['rgba(88,132,62,0.55)', 'rgba(52,86,40,0.5)'], 1.8); };
    const tint = (x, z, r, dark) => {
      const [px, py] = P(x, z), rr = r * PPM, gr = g.createRadialGradient(px, py, 0, px, py, rr);
      gr.addColorStop(0, dark ? 'rgba(52,88,40,0.16)' : 'rgba(226,244,196,0.13)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(px - rr, py - rr, rr * 2, rr * 2);
    };
    return { blob, specks, path, stones, flowers, litter, moss, tint };
  }
  // ---------------------------------------------------------------- the Commons Meadow's ground (30 × 28 m, 24 px/m):
  // the meadow's core slab is one self-symmetric piece, so its decal is drawn for Alpha's half and again turned 180°.
  // Gravel spokes to the plaza (the ramp's funnel from the footbridge, the stair's path round the mound to the band
  // stair, the tower's service lane off the plaza's flat to the band), stepping stones between the pod and the
  // greenhouse, moss round the boulders and the log, bark beds under the pods, pollinator strips at the foot of the
  // band walls and the plaza's climbable faces, broad patches of greener / drier turf
  {
    const PPM = 24, W = 30 * PPM, H = 28 * PPM, x0 = R.x, y0 = R.y;
    g.save(); g.beginPath(); g.rect(x0, y0, W, H); g.clip();
    g.clearRect(x0, y0, W, H);
    for (const turn of [0, 1]) {
      const T = (x, z) => (turn ? [x0 + (15 + x) * PPM, y0 + (14 + z) * PPM] : [x0 + (15 - x) * PPM, y0 + (14 - z) * PPM]);
      const k = kitFor(T, PPM, 4101 + turn * 17);
      for (const [x, z, r, d] of [[-10, -2, 3.5, 1], [6, -10.5, 3, 1], [-3, -12, 2.5, 1], [12, -6, 2.8, 1], [-13, -11, 2.5, 1], [9, -8.5, 2.6, 0], [-8.5, -3, 3, 0], [1, -11.5, 2.2, 0], [13.5, -12, 2, 0], [-12.5, 3.2, 2.4, 0]]) k.tint(x, z, r, d);
      k.moss(4.7, -8.0, 1.5, 1.3); k.moss(-2.4, -13.2, 1.3, 1.0); k.moss(2.5, -13.7, 1.4, 0.9); k.moss(10.8, -3.4, 2.3, 0.9);
      // bark beds under the pods' hedges
      k.litter(-6.25, -7.9, 1.6, 0.75); k.litter(5.3, -11.8, 0.75, 1.9);
      // the greenhouse's mulch border
      k.litter(-9, -12, 4.6, 2.55);
      // gravel: the ramp's funnel, the tower's lane, the stair's path, the band stair's foot
      k.path([[0, -14.4], [0, -12.6], [0, -11.1]], 2.4);
      k.path([[-0.2, -12.2], [0.2, -11.1]], 5.0, { grit: 10 });
      k.path([[7.0, 0.05], [11.0, -0.1], [15.2, 0.05]], 2.5);
      k.path([[8.0, -7.7], [6.9, -9.7], [7.1, -12.4], [8.7, -13.6], [10.4, -14.4]], 1.25);
      k.path([[11.5, 6.4], [11.3, 7.6]], 1.9);
      // stepping stones from the west band stair past the pod to the ramp's foot
      k.path([[-11.4, -8.6], [-9.4, -9.0], [-7.2, -8.95], [-5.0, -9.35], [-3.4, -10.4]], 0.9, { edge: 'rgba(0,0,0,0)', fill: 'rgba(196,186,150,0.22)', grit: 0 });
      k.stones([[-11.4, -8.6], [-9.4, -9.0], [-7.2, -8.95], [-5.0, -9.35], [-3.4, -10.4]], 0.78);
      // pollinator strips: the band walls' foot (either side of the lane and the band stair), the plaza's climbable face
      k.flowers([[14.2, -13.6], [14.25, -8.0], [14.2, -2.2]], 1.2);
      k.flowers([[14.2, 1.9], [14.25, 5.0]], 1.2);
      k.flowers([[14.2, 9.0], [14.25, 13.6]], 1.2);
      k.flowers([[-7.25, -2.95], [-4.35, -6.9]], 0.8, 90);
    }
    g.restore();
    out.push({ id: MURAL.meadow, x: x0, y: y0, w: W, h: H, place: [0, 30, 0, 28], fx: [1, 0.25] });
  }
  // ---------------------------------------------------------------- the band's ground (4 × 81.08 m, 12 px/m): the
  // east band's column (x 15 … 19, z −21 … 60.08: u from x 19, v from z −21; the stretch made it 22 m longer: it runs on
  // through Bravo's nursery as the strip's inner edge) — a gravel trail winding along it past the groves and on through
  // the nursery, needle litter under the groves, moss at the wall's foot, gravel landings at the band stairs, the tower's
  // lanes across it (the start at z 0, the nursery's front and bank lanes — twin wheel tracks like the nursery's own —
  // and the lane along Bravo's terrace at the north end), a pollinator strip along the meadow edge and the nursery's, a
  // gravel yard by the nursery rack. The west band (its twin, a single piece of its own: a mirrored piece's decal isn't
  // turned) takes the same picture turned 180°.
  {
    const PPM = 12, ZMAX = 57.309, LEN = ZMAX + 21, W = 4 * PPM, H = Math.round(LEN * PPM), xE = R.x + 1980, xW = R.x + 1920, y0 = R.y + 20;
    g.save(); g.beginPath(); g.rect(xE, y0, W, H); g.clip();
    g.clearRect(xE, y0, W, H);
    const k = kitFor((x, z) => [xE + (19 - x) * PPM, y0 + (ZMAX - z) * PPM], PPM, 5207);
    for (const [z, r] of [[-19, 1.6], [-4, 1.3], [2.6, 1.2], [6.8, 1.4], [22.5, 1.5], [33.2, 1.3], [40.6, 1.2], [53, 1.3], [58, 1.6]]) k.moss(18.75, z, 0.55, r);
    k.litter(18.45, -9.25, 0.95, 1.75); k.litter(18.45, 12.8, 0.95, 2.0); k.litter(18.1, 17.9, 1.35, 2.4); k.litter(18.0, 49.75, 1.0, 1.6);
    k.path([[15.9, -17.0], [16.1, -14.5]], 2.4, { grit: 14 });
    k.path([[15.9, 6.1], [16.1, 8.1]], 2.6, { grit: 14 });
    k.path([[16.3, -21.2], [16.1, -18.6], [16.2, -15.5], [16.9, -12.5], [16.4, -9.0], [16.9, -5.5], [17.0, -2.0], [16.8, 2.0], [17.2, 4.6], [16.6, 8.5], [16.3, 12.6], [16.1, 16.8], [16.7, 21.0], [16.3, 24.0],
      [16.5, 30.6], [17.3, 34.0], [16.7, 37.6], [17.2, 41.2], [16.6, 48.6], [16.4, 52.0]], 1.25);
    k.path([[15.0, 0], [19.1, 0]], 2.5);
    for (const [z0, z1] of [[26, 27.2], [28.2, 29.4], [42.9, 43.8], [44.8, 46.6]]) k.path([[15.0, (z0 + z1) / 2], [19.1, (z0 + z1) / 2]], z1 - z0 + 0.1, { grit: 20 });
    k.path([[15.0, 53.0], [19.1, 53.0]], 2.3);
    k.path([[16.4, 55.6], [17.8, 58.6]], 2.6, { grit: 16 });
    k.flowers([[15.62, -13.7], [15.62, -2.1]], 0.55, 90); k.flowers([[15.62, 2.0], [15.62, 5.3]], 0.55, 90); k.flowers([[15.62, 8.8], [15.62, 20.5]], 0.55, 90);
    k.flowers([[15.5, 30.2], [15.5, 42.1]], 0.5, 90);
    g.restore();
    // the west band: the same picture turned 180°
    g.save(); g.clearRect(xW, y0, W, H); g.translate(xW + W, y0 + H); g.rotate(Math.PI); g.drawImage(g.canvas, xE, y0, W, H, 0, 0, W, H); g.restore();
    out.push({ id: MURAL.bandE, x: xE, y: y0, w: W, h: H, place: [0, 4, 0, LEN], fx: [1, 0.25] });
    out.push({ id: MURAL.bandW, x: xW, y: y0, w: W, h: H, place: [0, 4, 0, LEN], fx: [1, 0.25] });
  }
  // ---------------------------------------------------------------- the upper tier's ground (7 × 30 m, 20 px/m): the
  // east hill's upper-tier column (x 19.5 … 26.5, z −10 … 20: u from x 26.5, v from z −10) — the walking strip between
  // the meadow-edge stands and the crown's wall, the Tower Command route down its middle (flat: paint only). A gravel
  // trail winding from the hill ramp's top round the ranger's clearing and north along the strip, the tower's lane
  // across from the band, needle litter spilling from the stands, moss and pollinator strips at the crown wall's foot,
  // flowers in the gaps between the stands. The west hill's is the same picture turned 180°.
  {
    const PPM = 20, W = 7 * PPM, H = 30 * PPM, xE = R.x + 740, xW = R.x + 900, y0 = R.y + 340;
    g.save(); g.beginPath(); g.rect(xE, y0, W, H); g.clip();
    g.clearRect(xE, y0, W, H);
    const k = kitFor((x, z) => [xE + (26.5 - x) * PPM, y0 + (20 - z) * PPM], PPM, 6311);
    for (const [x, z, r, d] of [[24, 7, 2.6, 1], [23.2, 14.5, 2.2, 0], [24.6, -6, 2.4, 1], [22.6, 2.8, 2.0, 0]]) k.tint(x, z, r, d);
    k.moss(26.2, 5.2, 0.45, 3.4); k.moss(26.2, -1.2, 0.4, 1.6); k.moss(21.9, 9.6, 0.5, 0.9); k.moss(22.0, 15.1, 0.5, 1.0);
    k.litter(21.75, 4.5, 0.5, 2.1); k.litter(21.75, 10.5, 0.45, 1.8); k.litter(21.8, 16.0, 0.5, 2.0); k.litter(26.2, -6.6, 0.45, 2.4);
    k.path([[20.8, -9.5], [25.4, -9.4]], 1.6, { grit: 14 });
    k.path([[19.4, 0], [25.9, 0]], 2.4);
    k.path([[23.0, -9.4], [24.4, -8.0], [25.65, -6.6], [25.7, -3.3], [24.7, -1.4], [23.5, 1.6], [24.4, 5.0], [23.6, 9.0], [24.5, 13.0], [23.7, 16.5], [24.1, 20.2]], 1.3);
    k.flowers([[26.2, -3.7], [26.2, 1.4]], 0.5, 90); k.flowers([[26.2, 9.2], [26.2, 13.7]], 0.5, 90);
    k.flowers([[21.75, 6.9], [21.75, 8.4]], 0.6, 90); k.flowers([[21.75, 12.6], [21.75, 13.8]], 0.6, 90);
    g.restore();
    g.save(); g.clearRect(xW, y0, W, H); g.translate(xW + W, y0 + H); g.rotate(Math.PI); g.drawImage(g.canvas, xE, y0, W, H, 0, 0, W, H); g.restore();
    out.push({ id: MURAL.upperE, x: xE, y: y0, w: W, h: H, place: [0, 7, 0, 30], fx: [1, 0.25] });
    out.push({ id: MURAL.upperW, x: xW, y: y0, w: W, h: H, place: [0, 7, 0, 30], fx: [1, 0.25] });
  }
  // ---------------------------------------------------------------- the sign on the upper tier's wall (18 × 1.1 m)
  {
    const PPM = 60, W = 18 * PPM, H = Math.round(1.1 * PPM), x0 = R.x + 736, y0 = R.y;
    g.save();
    g.clearRect(x0, y0, W, H);
    g.font = font(50); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(238,242,232,0.92)';
    const txt = 'ECO-FOREST   TREEHILLS';
    g.fillText(txt, x0 + W / 2 + 40, y0 + H / 2 + 2);
    // the round badge before the name
    const bx = x0 + W / 2 - g.measureText(txt).width / 2 - 20, by = y0 + H / 2;
    g.fillStyle = 'rgba(238,242,232,0.92)'; g.beginPath(); g.arc(bx, by, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(47,109,176,0.95)'; g.beginPath(); g.arc(bx, by, 21, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(238,242,232,0.95)'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.arc(bx, by, 12, 0.5, 4.8); g.stroke();
    g.restore();
    out.push({ id: MURAL.sign, x: x0, y: y0, w: W, h: H, place: [6, 18, 3.85, 1.1], fx: [0.5, 0.8] });
  }
  // ---------------------------------------------------------------- the band wall stencil (11.5 × 0.9 m at 60 px/m)
  {
    const PPM = 60, W = 11.5 * PPM, H = Math.round(0.9 * PPM), x0 = R.x + 1180, y0 = R.y + 80;
    g.save();
    g.clearRect(x0, y0, W, H);
    g.font = font(36); g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(236,240,230,0.9)';
    g.fillText('BIOME 07  ·  COMMONS MEADOW', x0 + 10, y0 + H / 2 + 2);
    g.restore();
    out.push({ id: MURAL.biome, x: x0, y: y0, w: W, h: H, place: [8.4, 11.5, 2.7, 0.9], fx: [0.6, 0.8] });
  }
  return out;
}
