// Mount Nantai — the slice's prop builders and its dressing (the Long Stages stretch: slice.js has the land). Registered
// by props.js (T = its kit); SLICE_PLACEMENTS are appended to its PLACEMENTS (already in the stretched frame: never
// shifted again). Half list as usual: every entry is mirrored (x, z) → (−x, −z) with rotY + π for Bravo.
//   nantai_solartower   the Solar Tower (1954): render walls, windows, the door and its canopy, the shaft with slit
//                       windows up to the coelostat deck (two mirrors on a fork, the roll-back hood, a railing)
//   nantai_radiodish    the 5.6 m radio dish on the knoll's pedestal: turntable, yoke, the dish with its back ribs and
//                       rim, the feed on four legs, counterweight, ladder, the aviation light (all off limits)
//   nantai_dishhut      the receiver hut's dressing: door, vents, the air-con unit, the roof antenna, the cable duct
//   nantai_rockery      the rock garden's rockery: rocks round the bed, cushion plants in flower, a dwarf conifer
//   nantai_pool         the rock garden's pool: a granite kerb, still water, a little spout
//   nantai_sundial      a granite pedestal sundial (cover)
//   nantai_cabinet      the dish's control cabinets / cable drums (cover)
//   nantai_knollrock    granite blocks along a knoll face (visual)
import { SOLAR, HUT, PEDESTAL, KNOLL, DELL, ROLL1 } from './slice.js';

export function registerSlice(D, H, T) {
  const { PI, TAU, HP } = H;
  const { K, NS, pbox, ccyl, seg, colC, ROOF, letters, boardSign, rock, pine, heath, railing, hash } = T;

  // ------------------------------------------------------------------------------------------ the Solar Tower
  // pos = the house's floor centre (the layout block 'solar-tower', G2), front (+Z local) = the door side (world +X),
  // local x along the long side (5.8), local z across (4.0); walls 3.4 high (the block), everything above is the prop
  const window2 = (B, x, y, w, h, z, lit = 0.5) => {
    B.box('paint', K.whiteSh, w + 0.14, h + 0.14, 0.08, x, y, z + 0.04, { r: 0.02 });
    B.box('glow', '#e7c48c', w, h, 0.02, x, y, z + 0.085, { glow: lit });
    pbox(B, NS('paint'), K.steelDk, 0.04, h, 0.03, x, y, z + 0.1);
    pbox(B, NS('paint'), K.steelDk, w, 0.04, 0.03, x, y + h * 0.18, z + 0.1);
    pbox(B, 'paint', K.graniteLt, w + 0.26, 0.07, 0.16, x, y - h / 2 - 0.1, z + 0.08);
  };
  D.nantai_solartower = {
    desc: 'the Solar Tower: render house, the shaft, the coelostat deck with its mirrors and hood',
    build(B) {
      const L = SOLAR.z1 - SOLAR.z0, W = SOLAR.x1 - SOLAR.x0, Hh = SOLAR.h;   // local x = L (5.8), local z = W (4.0)
      // granite plinth course + quoins, a string course, the coping
      pbox(B, 'paint', K.graniteDk, L + 0.08, 0.42, W + 0.08, 0, 0.21, 0);
      for (const [x, z] of [[-L / 2, -W / 2], [L / 2, -W / 2], [-L / 2, W / 2], [L / 2, W / 2]]) for (let i = 0; i < 5; i++) pbox(B, 'paint', i % 2 ? K.graniteLt : K.stone, 0.34, 0.5, 0.34, x, 0.7 + i * 0.55, z);
      pbox(B, 'paint', K.whiteSh, L + 0.12, 0.1, W + 0.12, 0, 2.45, 0);
      B.box('paint', K.whiteSh, L + 0.3, 0.16, W + 0.3, 0, Hh + 0.07, 0, { r: 0.03 });
      // the front (the door side, local +Z): a double door under a steel canopy, the name, a date stone
      const fz = W / 2;
      B.box('paint', K.steelDk, 1.8, 2.2, 0.1, 0.9, 1.1, fz + 0.05, { r: 0.02 });
      for (const s of [-1, 1]) { B.box('paint', K.navy, 0.8, 2.05, 0.05, 0.9 + s * 0.43, 1.05, fz + 0.11, { r: 0.015 }); pbox(B, NS('paint'), K.glass, 0.46, 0.6, 0.02, 0.9 + s * 0.43, 1.5, fz + 0.14); }
      B.box('metal', K.steel, 2.4, 0.08, 1.0, 0.9, 2.3, fz + 0.5, { r: 0.02 });
      for (const s of [-1, 1]) seg(B, 'metal', K.steelDk, [0.9 + s * 1.1, 2.3, fz + 0.95], [0.9 + s * 1.1, 2.75, fz + 0.02], 0.03, 0.03, { round: true });
      letters(B, 'SOLAR TOWER', { h: 0.3, x: -0.2, y: 2.85, z: fz, c: K.navy, dep: 0.06, wt: 0.17, track: 0.12 });
      boardSign(B, ['NANTAI OBSERVATORY', 'SOLAR TOWER · 1954'], -1.7, 1.5, { h: 0.07, z: fz, board: K.brass, c: K.grizzBrown, wt: 0.2, lead: 1.7 });
      window2(B, -1.7, 1.9, 0.8, 1.0, fz, 0.45);
      // the long sides (local ±Z are the short ends here: the long sides face ±X local … the house is L along x)
      for (const s of [-1, 1]) {
        B.push(s * L / 2, 0, 0, s * HP);
        window2(B, -0.9, 1.7, 0.7, 1.1, W * 0 + 0, 0.4);
        window2(B, 0.9, 1.7, 0.7, 1.1, 0, 0.4);
        B.pop();
      }
      // the back (local −Z): a downpipe, a vent, a small window
      B.push(0, 0, -W / 2, PI);
      window2(B, 1.2, 1.9, 0.6, 0.8, 0, 0.35);
      ccyl(B, 'metal', K.steel, 0.06, Hh, -2.5, Hh / 2, 0.1, { seg: 8 });
      B.box('metal', K.steel, 0.5, 0.3, 0.06, -0.8, 2.2, 0.03, { r: 0.01 });
      B.pop();
      // the shaft (to the coelostat deck at y 7.9), slit windows up its faces, a band at the top
      const sx = -0.7, sz = -0.3, sw = 2.3, top = 7.9;
      B.box('paint', K.white, sw, top - Hh, sw, sx, (Hh + top) / 2, sz, { r: 0.03 });
      pbox(B, 'paint', K.graniteLt, sw + 0.16, 0.34, sw + 0.16, sx, Hh + 0.17, sz);
      for (let i = 0; i < 3; i++) for (const [dx, dz, ry] of [[0, sw / 2, 0], [sw / 2, 0, HP], [0, -sw / 2, PI], [-sw / 2, 0, -HP]]) {
        B.push(sx + dx, Hh + 0.9 + i * 1.25, sz + dz, ry);
        B.box('paint', K.whiteSh, 0.3, 0.8, 0.06, 0, 0, 0.03, { r: 0.01 });
        B.box('glow', '#d9b27a', 0.2, 0.68, 0.02, 0, 0, 0.065, { glow: 0.3 });
        B.pop();
      }
      B.box('paint', K.whiteSh, sw + 0.3, 0.2, sw + 0.3, sx, top - 0.1, sz, { r: 0.03 });
      // the coelostat deck: a steel grating deck, a railing round it, the pier with the fork and two mirrors, the
      // secondary mirror on its own post, the hood rolled back on its rails
      const dy = top;
      B.box('metal', K.steelDk, 3.2, 0.12, 3.2, sx, dy + 0.06, sz, { r: 0.02 });
      for (const [a, b] of [[[-1.55, -1.55], [1.55, -1.55]], [[1.55, -1.55], [1.55, 1.55]], [[1.55, 1.55], [-1.55, 1.55]], [[-1.55, 1.55], [-1.55, -1.55]]]) railing(B, [sx + a[0], dy + 0.12, sz + a[1]], [sx + b[0], dy + 0.12, sz + b[1]], { h: 0.9, c: K.steel, gap: 1.6 });
      ccyl(B, 'paint', K.concrete, 0.3, 0.9, sx - 0.3, dy + 0.57, sz + 0.2, { seg: 12 });
      B.push(sx - 0.3, dy + 1.1, sz + 0.2, 0.6);
      B.box('metal', K.steelDk, 0.9, 0.12, 0.3, 0, 0, 0, { r: 0.02 });
      for (const s of [-1, 1]) B.box('metal', K.steel, 0.08, 0.6, 0.2, s * 0.42, 0.3, 0, { r: 0.01 });
      B.push(0, 0.42, 0, 0, -0.7);
      B.cyl('metal', K.steelLt, 0.36, 0.08, 0, 0, 0, { seg: 20, rx: HP });
      B.cyl('gloss', '#9fc3dd', 0.32, 0.02, 0, 0, 0.045, { seg: 20, rx: HP });
      B.pop();
      B.pop();
      ccyl(B, 'metal', K.steelDk, 0.07, 1.2, sx + 0.8, dy + 0.72, sz - 0.5, { seg: 8 });
      B.push(sx + 0.8, dy + 1.4, sz - 0.5, 2.2, 0.5);
      B.cyl('metal', K.steelLt, 0.24, 0.06, 0, 0, 0, { seg: 16, rx: HP });
      B.cyl('gloss', '#9fc3dd', 0.21, 0.02, 0, 0, 0.035, { seg: 16, rx: HP });
      B.pop();
      // the hood (a half-barrel of steel sheet on rails, rolled back over the deck's rear edge)
      for (const s of [-1, 1]) seg(B, 'metal', K.steelDk, [sx - 1.5, dy + 0.18, sz + s * 1.0], [sx + 1.5, dy + 0.18, sz + s * 1.0], 0.08, 0.08, {});
      B.add('metal', T.cylGeo(1.05, 1.05, 2.1, 14, true, 0, PI), K.steelLt, sx + 1.05, dy + 0.18, sz, { rz: HP });
      pbox(B, 'metal', K.steel, 0.06, 1.1, 2.1, sx + 0.45, dy + 0.66, sz);
      // lightning rod + a wind vane on the shaft's corner
      ccyl(B, 'metal', K.copper, 0.02, 1.6, sx - 1.45, dy + 0.9, sz - 1.45, { seg: 5 });
      B.box('metal', K.iron, 0.5, 0.02, 0.08, sx - 1.45, dy + 1.55, sz - 1.45, { r: 0.005 });
      // colliders (the house is the layout block): the shaft and the deck, off limits
      colC(B, sx, Hh, sz, sw, top - Hh, sw, ROOF);
      colC(B, sx, top, sz, 3.2, 1.1, 3.2, ROOF);
    },
  };

  // ------------------------------------------------------------------------------------------ the radio dish
  // pos = the pedestal's foot at its centre on the knoll (the layout block 'dish-pedestal', 3 × 3 × 2.2, off limits);
  // the dish looks up and away from mid (local −Z) at 55°; the elevation axis 1.6 m over the pedestal. Its near rim stays
  // over the knoll's back (clear of the tower's run across the knoll: z > −1.55 local never below 6 m)
  const dishProfile = (R, dep, t) => {
    const n = 10, pts = [];
    for (let i = 0; i <= n; i++) { const r = (R * i) / n; pts.push([r, dep * (r / R) ** 2]); }
    pts.push([R + 0.04, dep + 0.02]);
    for (let i = n; i >= 0; i--) { const r = (R * i) / n; pts.push([r * 0.995, dep * (r / R) ** 2 - t - 0.06 * (1 - r / R)]); }
    return pts;
  };
  D.nantai_radiodish = {
    desc: 'the radio dish: turntable, yoke, the 5.6 m dish, feed legs, counterweight, ladder, aviation light',
    build(B) {
      const ph = PEDESTAL.h, R = 2.8, dep = 0.78, e = 55 * PI / 180, ax = ph + 1.6;
      // the pedestal's dressing: a panel door, the ladder up its west face, the name plate, conduit
      B.box('paint', K.steelDk, 0.9, 1.7, 0.06, 0.4, 0.95, 1.53, { r: 0.02 });
      pbox(B, NS('paint'), K.steel, 0.04, 0.3, 0.05, 0.75, 0.95, 1.57);
      boardSign(B, ['NANTAI RADIO', 'DISH 1 · 11 GHz'], -0.8, 1.55, { h: 0.08, z: 1.5, board: K.white, c: K.navy, wt: 0.2, lead: 1.6 });
      for (const s of [-1, 1]) seg(B, 'metal', K.steel, [-1.56, 0.1, s * 0.22], [-1.56, ph + 0.9, s * 0.22], 0.04, 0.04, { round: true, seg: 5 });
      for (let i = 0; i < 9; i++) pbox(B, NS('metal'), K.steelLt, 0.03, 0.03, 0.44, -1.56, 0.35 + i * 0.3, 0);
      seg(B, 'metal', K.steelDk, [1.52, 0.05, -0.8], [1.52, ph - 0.1, -0.8], 0.08, 0.08, {});
      // the turntable, the yoke's arms, the elevation axle
      B.cyl('metal', K.steelDk, 1.2, 0.36, 0, ph + 0.18, 0, { seg: 24 });
      B.cyl('metal', K.steel, 1.28, 0.06, 0, ph + 0.36, 0, { seg: 24 });
      for (const s of [-1, 1]) {
        B.box('paint', K.white, 0.34, 1.5, 1.0, s * 1.25, ph + 1.05, 0, { r: 0.04 });
        B.box('paint', K.whiteSh, 0.4, 0.5, 0.5, s * 1.25, ax, 0, { r: 0.04 });
      }
      B.cyl('metal', K.steelDk, 0.15, 2.9, 0, ax, 0, { seg: 12, rz: HP });
      // the dish (turned about x: its axis local +Y → up and toward −Z)
      B.push(0, ax, 0, 0, -(HP - e));
      B.lathe('paint', K.white, dishProfile(R, dep, 0.05), 0, 0.42, 0, { seg: 40 });
      B.tor('metal', K.steelLt, R + 0.02, 0.05, 0, 0.42 + dep + 0.01, 0, { rx: HP, rs: 5, ts: 48 });
      // back ribs and the hub (the counterweight arm down behind the axle)
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; seg(B, NS('metal'), K.steel, [Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5], [Math.cos(a) * R * 0.97, 0.36 + dep * 0.94, Math.sin(a) * R * 0.97], 0.06, 0.1, {}); }
      B.cyl('metal', K.steelDk, 0.62, 0.5, 0, 0.18, 0, { seg: 16 });
      B.box('metal', K.iron, 0.9, 0.9, 0.9, 0, -0.55, 0.35, { r: 0.05 });
      // the feed on four legs at the focus, its horn, the aviation light
      const fy = 0.42 + (R * R) / (4 * dep);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + PI / 4; seg(B, NS('metal'), K.steelLt, [Math.cos(a) * R * 0.9, 0.42 + dep * 0.81, Math.sin(a) * R * 0.9], [0, fy - 0.2, 0], 0.05, 0.05, { round: true, seg: 5 }); }
      B.cyl('paint', K.white, 0.2, 0.55, 0, fy, 0, { seg: 12 });
      B.cyl('metal', K.steelDk, 0.12, 0.2, 0, fy - 0.36, 0, { seg: 10, r2: 0.2 });
      B.blink('#ff3a2a', 0, fy + 0.34, 0, { size: 0.07, rate: 0.6 });
      B.pop();
      // colliders: the dish and its mount, off limits (the pedestal is the layout block)
      colC(B, 0, ph, 0, 2.6, 1.9, 1.2, ROOF);
      colC(B, 0, ax - 0.4, -0.9, 5.8, 3.4, 4.2, ROOF);
    },
  };

  // ------------------------------------------------------------------------------------------ the receiver hut
  // pos = the hut's floor centre (layout block 'dish-hut', 3.6 × 5.2 × 2.6, concrete, off-limits roof), front +Z (the
  // door, toward mid): a steel door, louvres, a high window, the air-con unit on the east side, the roof's antenna,
  // the cable duct across to the knoll
  D.nantai_dishhut = {
    desc: 'receiver hut dressing: door, louvres, air-con, roof antenna, cable duct',
    build(B) {
      const W = HUT.x1 - HUT.x0, Dd = HUT.z1 - HUT.z0, Hh = HUT.h, fz = Dd / 2;
      B.box('paint', K.concreteDk, W + 0.3, 0.14, Dd + 0.3, 0, Hh + 0.07, 0, { r: 0.03 });
      B.box('paint', K.steelDk, 1.0, 2.1, 0.08, -0.8, 1.05, fz + 0.04, { r: 0.02 });
      B.box('paint', K.teal, 0.88, 1.98, 0.04, -0.8, 1.02, fz + 0.1, { r: 0.015 });
      pbox(B, NS('metal'), K.steelLt, 0.04, 0.3, 0.05, -0.45, 1.0, fz + 0.14);
      boardSign(B, ['RECEIVER', 'NANTAI RADIO'], 0.8, 1.7, { h: 0.1, z: fz, board: K.navy, c: K.white, wt: 0.2 });
      boardSign(B, 'KEEP OUT · RF', 0.8, 1.05, { h: 0.08, z: fz, board: K.yellow, c: K.black, wt: 0.22 });
      // louvres on the west side, a high window on the south
      B.push(-W / 2, 0, 0, -HP);
      for (const x of [-1.2, 1.2]) { B.box('metal', K.steel, 0.9, 0.6, 0.06, x, 1.6, 0.03, { r: 0.01 }); for (let i = 0; i < 5; i++) pbox(B, NS('metal'), K.steelDk, 0.84, 0.03, 0.03, x, 1.38 + i * 0.11, 0.07); }
      B.pop();
      B.push(0, 0, -Dd / 2, PI);
      B.box('paint', K.whiteSh, 1.3, 0.5, 0.06, 0, 2.0, 0.03, { r: 0.02 });
      B.box('glow', '#e7c48c', 1.16, 0.38, 0.02, 0, 2.0, 0.07, { glow: 0.5 });
      B.pop();
      // the air-con unit on the east wall (cover-sized: the hut is cover anyway)
      B.push(W / 2, 0, 0.9, HP);
      B.box('paint', K.whiteSh, 1.0, 0.8, 0.45, 0, 0.55, 0.23, { r: 0.04 });
      B.cyl('metal', K.steelDk, 0.28, 0.04, 0, 0.58, 0.47, { seg: 14, rx: HP });
      for (let i = 0; i < 4; i++) pbox(B, NS('metal'), K.steel, 0.02, 0.5, 0.02, -0.12 + i * 0.08, 0.58, 0.48);
      B.pop();
      // roof: a small dish, a whip antenna, a vent
      B.push(0.6, Hh + 0.14, -1.2);
      ccyl(B, 'metal', K.steelDk, 0.05, 0.8, 0, 0.4, 0, { seg: 8 });
      B.push(0, 0.9, 0, 0.9, -0.6);
      B.lathe('metal', K.white, [[0, -0.01], [0.25, 0.03], [0.44, 0.14], [0.46, 0.16], [0.42, 0.16], [0.24, 0.05], [0, 0.01]], 0, 0, 0, { seg: 16 });
      B.pop();
      B.pop();
      ccyl(B, 'metal', K.steelLt, 0.015, 2.2, -1.2, Hh + 1.2, 1.6, { seg: 5 });
      B.box('metal', K.steel, 0.6, 0.35, 0.6, -0.9, Hh + 0.32, -0.3, { r: 0.03 });
      void colC; void ROOF;
    },
  };

  // ------------------------------------------------------------------------------------------ the rock garden
  // the rockery (pos = the bed's top centre; w × d): rocks set round its edge and in it, cushion plants in flower,
  // a dwarf conifer, a label; the bed is the layout block (you can stand on it)
  const BLOOM = ['#e9a3c1', '#f0e6f2', '#e8c24a', '#b58ad6', '#f4f0e6', '#d9607a'];
  const cushion = (B, x, y, z, s, seed) => {
    B.add(NS('foliage'), T.tpl('cush|' + (seed % 5), () => H.puffGeo(1, seed % 5)), seed % 2 ? '#6d7c46' : '#5f7040', x, y + s * 0.18, z, { sx: s, sy: s * 0.42, sz: s * 0.9 });
    for (let i = 0; i < 6; i++) { const a = hash(seed + i * 1.3) * TAU, r = s * 0.55 * hash(seed * 3 + i); B.sph(NS('paint'), BLOOM[(seed + i) % BLOOM.length], 0.035, x + Math.cos(a) * r, y + s * 0.34, z + Math.sin(a) * r, { ws: 5, hs: 3 }); }
  };
  D.nantai_rockery = {
    desc: 'rockery: edge rocks, cushion plants, a dwarf conifer, a label',
    build(B, o) {
      const w = o.w ?? 3.2, d = o.d ?? 3.6, seed = o.seed ?? 3;
      const n = Math.round((w + d) * 1.6);
      for (let i = 0; i < n; i++) {
        const t = (i + hash(seed + i) * 0.5) / n, per = 2 * (w + d), s = t * per;
        const [x, z] = s < w ? [-w / 2 + s, -d / 2] : s < w + d ? [w / 2, -d / 2 + (s - w)] : s < 2 * w + d ? [w / 2 - (s - w - d), d / 2] : [-w / 2, d / 2 - (s - 2 * w - d)];
        const r = 0.28 + hash(seed * 5 + i) * 0.22;
        rock(B, x, -0.65, z, r, (0.65 + 0.15 + hash(i) * 0.2) / 1.62, r * 0.85, seed * 13 + i, { c: hash(i * 3) > 0.5 ? K.granite : K.graniteLt });
      }
      for (let i = 0; i < 5; i++) rock(B, (hash(seed * 7 + i) - 0.5) * (w - 1), -0.05, (hash(seed * 11 + i) - 0.5) * (d - 1), 0.3 + hash(i) * 0.2, 0.28, 0.3, seed + 50 + i, { c: K.graniteLt });
      for (let i = 0; i < 9; i++) cushion(B, (hash(seed * 17 + i) - 0.5) * (w - 0.5), 0, (hash(seed * 19 + i) - 0.5) * (d - 0.5), 0.35 + hash(i * 7) * 0.25, seed + i);
      pine(B, -w * 0.18, 0, d * 0.12, 0.7, seed + 4, 0.8);
      B.box('metal', K.brass, 0.3, 0.02, 0.18, w / 2 - 0.3, 0.05, d / 2 - 0.25, { r: 0.005, rx: -0.4 });
    },
  };
  // the pool (pos = its centre on the garden floor; r): a ring of granite kerbstones, still water, a spout, a few pads
  D.nantai_pool = {
    desc: 'rock-garden pool: kerb, still water, a spout',
    build(B, o) {
      const r = o.r ?? 1.2, n = 14;
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; rock(B, Math.cos(a) * r, -0.04, Math.sin(a) * r, 0.26, 0.17, 0.2, 60 + i, { c: i % 3 ? K.granite : K.graniteLt, rot: -a }); }
      B.cyl('gloss', '#2d5f5a', r - 0.05, 0.02, 0, 0.06, 0, { seg: 24 });
      rock(B, r * 0.45, 0, -r * 0.3, 0.3, 0.3, 0.25, 77, { c: K.graniteLt });
      B.cyl('glow', '#dff2ee', 0.03, 0.3, r * 0.45, 0.62, -r * 0.3, { seg: 6, glow: 0.4 });
      for (let i = 0; i < 4; i++) { const a = hash(i * 5.1) * TAU, rr = r * 0.55 * hash(i * 2.3); B.cyl('foliage', '#5f7a3e', 0.14, 0.01, Math.cos(a) * rr, 0.075, Math.sin(a) * rr, { seg: 8 }); }
    },
  };
  // a granite pedestal sundial (pos = ground, front +Z = its noon line): cover
  D.nantai_sundial = {
    desc: 'granite pedestal sundial (cover)',
    build(B) {
      B.box('paint', K.graniteDk, 1.0, 0.18, 1.0, 0, 0.09, 0, { r: 0.03 });
      B.lathe('paint', K.stone, [[0, 0.18], [0.34, 0.18], [0.34, 0.26], [0.26, 0.34], [0.24, 0.9], [0.36, 0.98], [0.4, 1.04], [0, 1.04]], 0, 0, 0, { seg: 12 });
      B.cyl('metal', K.brass, 0.34, 0.03, 0, 1.055, 0, { seg: 24 });
      B.push(0, 1.07, 0);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * PI - PI; pbox(B, NS('metal'), K.grizzBrown, 0.015, 0.004, 0.08, Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26, { ry: -a }); }
      B.push(0, 0.1, 0, 0, 0, 0);
      B.box('metal', K.brass, 0.02, 0.2, 0.3, 0, 0, 0, { r: 0.004, rx: -0.6 });
      B.pop();
      B.pop();
      colC(B, 0, 0, 0, 0.8, 1.08, 0.8);
    },
  };
  // the dish's control cabinets (variant 'cabinet': two steel cabinets and a desk) or cable drums ('drums'): cover
  D.nantai_cabinet = {
    desc: 'control cabinets / cable drums (cover)',
    build(B, o) {
      if (o.variant === 'drums') {
        for (const [x, z, r] of [[-0.55, 0, 0.62], [0.6, 0.15, 0.5]]) {
          B.push(x, r, z, 0, 0, HP);
          B.cyl('wood', K.timber, r, 0.1, 0, 0.36, 0, { seg: 16 }); B.cyl('wood', K.timber, r, 0.1, 0, -0.36, 0, { seg: 16 });
          B.cyl('paint', '#2b2c30', r * 0.78, 0.62, 0, 0, 0, { seg: 16 });
          B.cyl('wood', K.timberDk, 0.12, 0.84, 0, 0, 0, { seg: 8 });
          B.pop();
        }
        colC(B, 0, 0, 0.05, 2.3, 1.2, 1.1);
        return;
      }
      for (const x of [-0.6, 0.0]) { B.box('paint', '#a9b2ab', 0.58, 1.55, 0.6, x, 0.78, 0, { r: 0.02 }); pbox(B, NS('paint'), K.steelDk, 0.02, 0.2, 0.03, x + 0.22, 0.9, 0.31); B.box('glow', '#7fd28a', 0.08, 0.04, 0.02, x - 0.15, 1.38, 0.31, { glow: 0.8 }); }
      B.box('paint', K.steelDk, 0.9, 0.08, 0.7, 0.8, 0.9, 0.05, { r: 0.02 });
      B.box('paint', K.steel, 0.8, 0.86, 0.5, 0.8, 0.43, -0.05, { r: 0.02 });
      B.box('paint', K.screen, 0.5, 0.34, 0.04, 0.8, 1.14, -0.15, { r: 0.01, rx: -0.2 });
      colC(B, 0.2, 0, 0, 1.9, 1.56, 0.72);
    },
  };
  // a square granite planter with a dwarf pine in it (the terraces' trees; pos = ground, w square): cover
  D.nantai_treeplanter = {
    desc: 'granite planter with a dwarf pine (cover)',
    build(B, o) {
      const w = o.w ?? 1.4, h = 0.66, seed = o.seed ?? 3;
      B.box('paint', K.stone, w, h, w, 0, h / 2, 0, { r: 0.05 });
      B.box('paint', K.graniteLt, w + 0.1, 0.09, w + 0.1, 0, h - 0.03, 0, { r: 0.03 });
      B.box('paint', '#4c3e30', w - 0.18, 0.04, w - 0.18, 0, h + 0.005, 0, { r: 0.01 });
      pine(B, -0.35, h, -0.05, 0.62, seed, o.lean ?? 0.4);
      heath(B, w * 0.22, h, w * 0.2, 0.5, seed + 2, K.moss);
      colC(B, 0, 0, 0, w, h + 0.05, w);
      colC(B, 0, h, 0, w * 0.7, 1.25, w * 0.7);
    },
  };
  // granite blocks set along a knoll or bed face (pos = the face's foot at its middle; the face runs `length` along
  // local x, the blocks just in front of it, +Z) — visual only
  D.nantai_knollrock = {
    desc: 'granite blocks along a face (visual)',
    build(B, o) {
      const L = o.length ?? 6, n = Math.max(2, Math.round(L / 1.1)), seed = o.seed ?? 3, hmax = o.h ?? 0.9;
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + ((i + 0.3 + hash(seed + i) * 0.4) / n) * L, r = 0.4 + hash(seed * 3 + i) * 0.3;
        rock(B, x, -0.05, 0.1 + hash(seed * 7 + i) * 0.2, r, (hmax * (0.5 + 0.5 * hash(i * 5 + seed))) / 1.62, r * 0.6, seed * 11 + i, { c: hash(i) > 0.5 ? K.granite : K.graniteDk });
        if (hash(seed * 13 + i) > 0.5) heath(B, x + 0.4, 0, 0.5, 0.6, seed + i);
      }
    },
  };
  void TAU; void KNOLL; void DELL;
}

// ============================================================================================================
// The slice's dressing (Alpha's half, in the stretched frame). Kept off the tower's runs (2.5 m bands: z −34, −43.5,
// −52.25 and −59 across, x 3, −5.75 and −16 along; see layout.js TOWER).
// ============================================================================================================
const P = Math.PI, HP = P / 2;
const G1 = 1.3, G2 = 2.6;
export const SLICE_PLACEMENTS = [
  // ================= at the cut: the terraces' fronts lost roll-off hut no. 2 and a pier to the base's move — a pier on
  //                   the stargazing terrace's front; roll-off hut no. 1 (slice.js), a planter and a Grizzco crate stack
  //                   on the first terrace's (between the tower's runs)
  { type: 'nantai_telepier', pos: [-9.6, G2, -30.4], rotY: 2.6 },
  { type: 'nantai_rolloff', pos: [ROLL1.x0 + 1.8, G1, ROLL1.z0 + 1.6], rotY: 0, label: 'ROLL-OFF 1' },
  { type: 'nantai_crates', pos: [14.6, G1, -29.9], rotY: 0.15, n: 3 },
  { type: 'nantai_treeplanter', pos: [0.6, G1, -30.1], rotY: 0.3, seed: 4 },
  // ================= the Solar Tower on the shoulder, its forecourt: telescope piers, the sundial, a board, crates
  { type: 'nantai_solartower', pos: [(SOLAR.x0 + SOLAR.x1) / 2, G2, (SOLAR.z0 + SOLAR.z1) / 2], rotY: HP },
  { type: 'nantai_telepier', pos: [-12.6, G2, -35.4], rotY: 2.3 },
  { type: 'nantai_telepier', pos: [-9.4, G2, -39.4], rotY: 2.8 },
  { type: 'nantai_sundial', pos: [-13.4, G2, -38.8], rotY: HP },
  { type: 'nantai_infoboard', pos: [-14.2, G2, -34.0], rotY: HP, title: 'THE SUN FROM NANTAI' },
  { type: 'nantai_bench', pos: [-8.2, G2, -36.9], rotY: HP },
  // ================= the ridge carried on: pines, an outcrop, a cairn, a bench looking out over the tarn
  { type: 'nantai_pine', pos: [-22.6, G2, -34.8], rotY: 2.6, seed: 5, scale2: 0.9 },
  { type: 'nantai_outcrop', pos: [-24.4, G2, -41.4], rotY: 1.2, w: 2.2, h: 1.15, d: 1.6, seed: 39 },
  { type: 'nantai_bench', pos: [-23.6, G2, -45.4], rotY: -HP },
  { type: 'nantai_pine', pos: [-20.8, G2, -49.6], rotY: 0.4, seed: 6 },
  { type: 'nantai_cairn', pos: [-21.6, G2, -54.0], rotY: 0 },
  { type: 'nantai_heath', pos: [-23.2, G2, -38.4], w: 1.4, d: 1.6, n: 3, seed: 29 },
  { type: 'nantai_scree', pos: [-21.4, G2, -44.0], w: 1.6, d: 2.2, n: 12, seed: 13 },
  { type: 'nantai_heath', pos: [-22.4, G2, -52.0], w: 1.2, d: 1.4, n: 3, seed: 31 },
  // ================= the rock garden (1.3): the rockery, the pool, boulders, a pine, heather
  { type: 'nantai_rockery', pos: [-11.8, 1.95, -47.4], w: 3.2, d: 3.6, seed: 5 },
  { type: 'nantai_pool', pos: [-16.6, G1, -48.6], r: 1.25 },
  { type: 'nantai_boulder', pos: [-17.4, G1, -42.4], rotY: 0.6, w: 1.4, h: 1.05, d: 1.1, seed: 51 },
  { type: 'nantai_boulder', pos: [-9.6, G1, -42.2], rotY: -0.3, w: 1.2, h: 0.95, d: 1.0, seed: 53 },
  { type: 'nantai_pine', pos: [-9.9, G1, -49.7], rotY: 1.9, seed: 8, scale2: 0.8 },
  { type: 'nantai_heath', pos: [-14.6, G1, -42.4], w: 1.6, d: 0.9, n: 3, seed: 33 },
  { type: 'nantai_heath', pos: [-18.2, G1, -46.8], w: 0.9, d: 1.4, n: 3, seed: 35 },
  { type: 'nantai_knollrock', pos: [-15.0, G1, DELL.z1 - 0.05], rotY: P, length: 3.4, h: 0.8, seed: 7 },
  { type: 'nantai_knollrock', pos: [-9.7, G1, DELL.z0 + 0.05], rotY: 0, length: 1.4, h: 0.7, seed: 9 },
  // ================= the stargazing terrace carried on: planters on the garden's edge, lamps' bollards
  { type: 'nantai_planter', pos: [-7.9, G2, -44.2], rotY: HP, w: 1.3, d: 0.7 },
  { type: 'nantai_planter', pos: [-7.9, G2, -49.6], rotY: HP, w: 1.3, d: 0.7 },
  { type: 'nantai_bollard', pos: [-3.5, G2, -52.4] },
  { type: 'nantai_telepier', pos: [-9.4, G2, -53.4], rotY: 2.0, notIn: 'tower' },
  // (Tower Command: the track's loop runs along the terrace's front and back here (z −52.25 and −59), so this pier and
  //  the one at the terrace's back (props.js) stand inside the loop, beside the stargazing board)
  { type: 'nantai_telepier', pos: [-13.0, G2, -55.6], rotY: 2.0, onlyIn: 'tower' },
  { type: 'nantai_telepier', pos: [-8.3, G2, -55.5], rotY: 2.6, onlyIn: 'tower' },
  // ================= the Dish Knoll: the dish, the control cabinets, cable drums, the granite round its foot
  { type: 'nantai_radiodish', pos: [(PEDESTAL.x0 + PEDESTAL.x1) / 2, G2, (PEDESTAL.z0 + PEDESTAL.z1) / 2], rotY: 0 },
  { type: 'nantai_cabinet', pos: [-1.8, G2, -45.6], rotY: 0 },
  { type: 'nantai_cabinet', variant: 'drums', pos: [7.6, G2, -41.1], rotY: 0.2 },
  { type: 'nantai_crates', pos: [-1.6, G2, -40.9], rotY: -0.15, n: 2 },
  { type: 'nantai_knollrock', pos: [(KNOLL.x0 + 0.5) / 2 - 0.3, G1, KNOLL.z1 + 0.05], rotY: 0, length: 2.6, h: 0.75, seed: 11 },
  { type: 'nantai_knollrock', pos: [7.3, G1, KNOLL.z1 + 0.05], rotY: 0, length: 2.6, h: 0.75, seed: 13 },
  { type: 'nantai_knollrock', pos: [5.4, G1, KNOLL.z0 - 0.05], rotY: P, length: 5.2, h: 0.8, seed: 17 },
  // ================= the first terrace round it: piers, crates, the receiver hut
  { type: 'nantai_dishhut', pos: [(HUT.x0 + HUT.x1) / 2, G1, (HUT.z0 + HUT.z1) / 2], rotY: 0 },
  { type: 'nantai_treeplanter', pos: [-1.5, G1, -37.5], rotY: 1.1, seed: 6 },
  { type: 'nantai_crates', pos: [7.6, G1, -37.6], rotY: 0.2, n: 2 },
  { type: 'nantai_bollard', pos: [8.6, G1, -35.9] },
  // ================= the apron in front of the grand stair (the goal's spot stays open), the strip by the knoll
  { type: 'nantai_planter', pos: [6.6, G1, -51.2], rotY: 0, w: 1.6 },
  { type: 'nantai_cabinet', variant: 'drums', pos: [12.4, G1, -53.2], rotY: -0.4 },
  { type: 'nantai_bollard', pos: [11.0, G1, -45.2] },
  // ================= the shore trail carried on + the shore meadow (0)
  { type: 'nantai_boulder', pos: [20.4, 0, -35.2], rotY: 0.8, w: 1.4, h: 1.0, d: 1.2, seed: 55 },
  { type: 'nantai_pine', pos: [20.6, 0, -43.6], rotY: 2.0, seed: 2, scale2: 0.9 },
  { type: 'nantai_boulder', pos: [23.6, 0, -48.2], rotY: 0.3, w: 1.6, h: 1.1, d: 1.3, seed: 57 },
  { type: 'nantai_fingerpost', pos: [18.4, 0, -46.8], rotY: -HP, blades: [['RADIO DISH', P - 0.2], ['SHORE TRAIL', 0.1], ['SOLAR TOWER', HP + 0.3]] },
  { type: 'nantai_bench', pos: [23.2, 0, -44.2], rotY: HP + 0.3 },
  { type: 'nantai_heath', pos: [21.1, 0.65, -52.9], w: 3.0, d: 2.4, n: 6, seed: 41 },
  { type: 'nantai_pine', pos: [22.3, 0.65, -53.6], rotY: 0.9, seed: 9, scale2: 0.8 },
  { type: 'nantai_cairn', pos: [16.6, 0, -54.4], rotY: 0 },
  { type: 'nantai_scree', pos: [19.8, 0, -49.4], w: 1.6, d: 1.8, n: 10, seed: 21 },
  { type: 'nantai_heath', pos: [21.0, 0, -38.2], w: 1.0, d: 1.6, n: 3, seed: 43 },
];
