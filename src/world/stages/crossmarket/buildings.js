// Crossroads Market — building dressings: town houses (crossmarket_house) and the Corn Exchange behind each spawn.
import { FL } from './kit.js';

export function registerBuildings(D, H, KIT) {
  const { PI, HP, hash } = KIT;
  const { facade, roof } = KIT;
  // ------------------------------------------------------------------------------------------ the house prop
  D.crossmarket_house = {
    desc: 'Crossroads Market building dressing around a W × D block (pos = block base centre at street level): each listed face (n +Z, s -Z, e +X, w -X) gets a town facade (shopfronts, windows, balconettes, cornice, quoins …), the roof sits on the block top (h). No colliders (the block is the building).',
    params: { w: 'm X size', d: 'm Z size', h: 'm wall top (eave)', faces: '{ n|s|e|w: facade spec }', roof: 'roof spec' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = o.w, Dd = o.d, h = o.h, seed = o.seedN ?? Math.round((o.pos[0] * 7 + o.pos[2] * 3) * 10);
      const sides = { n: [0, Dd / 2, W], s: [PI, Dd / 2, W], e: [HP, W / 2, Dd], w: [-HP, W / 2, Dd] };
      for (const [k, spec] of Object.entries(o.faces || {})) {
        const [ry, off, len] = sides[k];
        B.push(Math.sin(ry) * off, 0, Math.cos(ry) * off, ry);
        facade(B, spec.len ?? len, { h, ...o.style, ...spec }, seed + k.charCodeAt(0));
        B.pop();
      }
      if (o.roof) {
        B.push(0, h, 0, o.roof.ry ?? 0); roof(B, o.roof.ry ? Dd : W, o.roof.ry ? W : Dd, { seed, ...o.roof }); B.pop();
        // off-limits roof volume (stepped boxes under the slopes; the block top below is roof-flagged in the layout)
        const RF = { roof: true }, kind = o.roof.kind ?? 'gable', rw = o.roof.ry ? Dd : W, rd = o.roof.ry ? W : Dd;
        const rise = kind === 'mansard' ? 1.9 : (rd / 2) * Math.tan(o.roof.pitch ?? 0.62);
        const box = (hw, hd, y0, y1) => { const [ax, az] = o.roof.ry ? [hd, hw] : [hw, hd]; B.col(-ax, y0, -az, ax, y1, az, RF); };
        if (kind !== 'flat') {
          box(rw / 2, rd / 2, h, h + rise * 0.45);
          box(rw / 2 - (kind === 'hip' ? rd * 0.22 : 0), rd * 0.26, h + rise * 0.45, h + rise * 0.8);
        }
        for (const [x, z] of o.roof.chimneys || []) { const [cx, cz] = o.roof.ry ? [z, -x] : [x, z]; B.col(cx - 0.4, h, cz - 0.4, cx + 0.4, h + rise + 1.0, cz + 0.4, RF); }
      }
    },
  };

}

// ================================================================================================ civic + circulation
export function registerCivic(D, H, KIT) {
  const { PI, TAU, HP, P3, NS, K, tpl, kf, pbox, colBox, rod, letters, textW, arcPts, shade, mixc, GB, cx3, win, wallLantern, extrudeGeo, balconette, hash, rakedRail } = KIT;
  const IRON = K.iron, IRDK = K.ironDk, GOLD = K.gold, ST = K.stone, STL = K.stoneLt, STD = K.stoneDk;
  const baluster = [[0.06, 0], [0.045, 0.07], [0.085, 0.3], [0.045, 0.5], [0.06, 0.56], [0, 0.6]];

  // ---- stone stair dressing (local +Z from the foot (0,0,0) up to (0, rise, run), width W centred): raked sandstone
  // balustrades just outside the walking width (plinth band, turned balusters, moulded handrail), square newels with a
  // lantern at the foot and an urn at the top. Non-colliding (the ramp sides are the level's).
  D.crossmarket_stonestair = {
    desc: 'Stone stair balustrades: raked sandstone balustrades outside the walking width (both sides unless `sides` = [-1] / [1]), newels with lanterns at the foot and urns at the head. Rail colliders along the balustrades (stepped), solid newels.',
    params: { run: 'm', rise: 'm', width: 'm', sides: '[-1, 1]', lamps: 'bool (true)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const run = o.run, rise = o.rise, W = o.width, L = Math.hypot(run, rise), pitch = Math.atan2(rise, run), HR = 0.9;
      const yAt = (t) => (rise * t) / run;
      for (const sx of o.sides ?? [-1, 1]) {
        const x = sx * (W / 2 + 0.16);
        // raked plinth + handrail coping
        B.push(x, rise / 2, run / 2, 0, -pitch);
        B.box('paint', shade(ST, 0.95), 0.3, 0.2, L - 0.3, 0, 0.05, 0, { r: 0.02 });
        B.box('paint', ST, 0.34, 0.1, L - 0.3, 0, HR, 0, { r: 0.03 });
        B.pop();
        const n = Math.round((run - 0.6) / 0.22);
        for (let i = 0; i < n; i++) { const t = 0.4 + ((run - 0.8) * (i + 0.5)) / n; B.lathe(NS('paint'), ST, baluster.map(([r, y]) => [r, y * (HR - 0.2) / 0.6]), x, yAt(t) + 0.12, t, { seg: 5 }); }
        const newel = (t, y0, lamp) => {
          B.box('paint', ST, 0.42, 1.05, 0.42, x, y0 + 0.525, t, { r: 0.03 });
          B.box('paint', STL, 0.5, 0.1, 0.5, x, y0 + 1.1, t, { r: 0.02 });
          pbox(B, NS('paint'), STD, 0.3, 0.5, 0.01, x, y0 + 0.55, t + (t > 0.5 ? -0.215 : 0.215));
          if (lamp) {
            B.lathe('metal', IRON, [[0.12, 0], [0.09, 0.05], [0.05, 0.3], [0.08, 0.34], [0, 0.36]], x, y0 + 1.15, t, { seg: 8 });
            B.lathe(NS('glow'), K.lit, [[0.001, 0], [0.12, 0.02], [0.15, 0.3], [0.001, 0.3]], x, y0 + 1.5, t, { seg: 6, glow: 1.9 });
            B.lathe('metal', IRON, [[0.19, 0], [0.12, 0.08], [0.04, 0.16], [0, 0.22]], x, y0 + 1.8, t, { seg: 6 });
          } else {
            B.lathe('paint', STL, [[0.1, 0], [0.16, 0.1], [0.18, 0.22], [0.1, 0.34], [0.12, 0.4], [0, 0.44]], x, y0 + 1.15, t, { seg: 10 });
          }
        };
        // raked balustrade = rail (stepped boxes from the ground up to the handrail), newels = solid stone
        rakedRail(B, sx > 0 ? W / 2 : -W / 2 - 0.34, sx > 0 ? W / 2 + 0.34 : -W / 2, rise, run, HR + 0.05, Math.max(3, Math.round(run / 1.2)));
        if (o.foot !== false) colBox(B, x, 0, 0.1, 0.42, o.lamps !== false ? 1.6 : 1.15, 0.42, true);
        if (o.head !== false) colBox(B, x, rise, run - 0.1, 0.42, 1.2, 0.42, true);
        if (o.foot !== false) newel(0.1, 0, o.lamps !== false);
        if (o.head !== false) newel(run - 0.1, rise, false);
      }
    },
  };

  // ---- iron stair dressing for the thin (free-spanning) iron stairs: stringer plates both sides, balustrade with a
  // moulded handrail, a pair of legs under the head, riser plates showing between the treads (local +Z foot → head)
  D.crossmarket_ironstair = {
    desc: 'Cast-iron stair dressing (local +Z from the foot to the head): pierced stringer plates, balusters + handrail both sides (unless `sides`), legs under the upper half. Rail colliders along the handrail sides.',
    params: { run: 'm', rise: 'm', width: 'm', sides: '[-1, 1]' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const run = o.run, rise = o.rise, W = o.width, L = Math.hypot(run, rise), pitch = Math.atan2(rise, run), HR = 0.92;
      const yAt = (t) => (rise * t) / run;
      for (const sx of [-1, 1]) {
        const x = sx * (W / 2 + 0.03);
        B.push(x, rise / 2 - 0.12, run / 2, 0, -pitch);
        B.box('metal', IRON, 0.05, 0.34, L + 0.2, 0, 0, 0, { r: 0.012 });
        for (let u = -L / 2 + 0.4; u < L / 2 - 0.3; u += 0.5) B.tor(NS('metal'), IRDK, 0.09, 0.012, sx * 0.03, 0, u, { rs: 3, ts: 10, ry: HP });
        B.pop();
        if (!(o.sides ?? [-1, 1]).includes(sx)) continue;
        B.push(x, rise / 2 + HR - 0.1, run / 2, 0, -pitch);
        B.box('metal', IRDK, 0.07, 0.05, L + 0.1, 0, 0, 0, { r: 0.015 });
        B.pop();
        const n = Math.round(run / 0.26);
        for (let i = 0; i <= n; i++) { const t = 0.05 + ((run - 0.1) * i) / n; pbox(B, NS('metal'), IRON, 0.018, HR - 0.12, 0.018, x, yAt(t) + (HR - 0.12) / 2 + 0.02, t); }
        B.sph(NS('metal'), GOLD, 0.05, x, HR + 0.02, 0.05, { ws: 8, hs: 5 });
        // the handrail side is a rail (stepped along the flight, from under the stringer up to the handrail)
        rakedRail(B, sx > 0 ? W / 2 - 0.02 : -W / 2 - 0.09, sx > 0 ? W / 2 + 0.09 : -W / 2 + 0.02, rise, run, HR + 0.05, Math.max(3, Math.round(run / 1.2)), 0.35);
      }
      for (const sx of [-1, 1]) { const t = run * 0.62; B.box('metal', IRON, 0.08, yAt(t) - 0.1, 0.08, sx * (W / 2 - 0.1), (yAt(t) - 0.1) / 2, t, { r: 0.015 }); }
    },
  };

  // ---- the Arcade Gallery: the iron veranda along Market Street at first floor (pos = the slab centre on the street,
  // slab x ±1.1 × z ±10 at 2.3 … 2.6): cast-iron columns at the street edge (and the free edge over the forecourt),
  // a lattice fascia with a pierced valance, a glazed lean-to canopy on scrolled brackets, railings (solid, see layout),
  // hanging baskets + lamps.
  D.crossmarket_veranda = {
    desc: 'The veranda gallery dressing (pos = centre of the 2.2 × 20 m slab at street level): columns (colliders) along the street edge + the free west edge over the forecourt, fascia girder, pierced valance, glazed lean-to canopy on brackets, railings (rail colliders) on the open edges, baskets, lamps, the ARCADE GALLERY sign.',
    params: { length: 'm (20)', free: 'z ranges (local) where the west edge is open', railW: 'z ranges (local) with a railing on the west edge' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const hw = 1.1, L = o.length ?? 20, FL2 = 2.6, CAN = 5.35, c = IRON;
      const east = hw, west = -hw;
      const nCol = Math.max(2, Math.round((L - 0.8) / 4.6)), colZ = Array.from({ length: nCol + 1 }, (_, i) => -L / 2 + 0.4 + (i * (L - 0.8)) / nCol);
      const column = (x, z, y0, top) => {
        B.lathe('metal', c, [[0.16, y0], [0.17, y0 + 0.05], [0.12, y0 + 0.12], [0.09, y0 + 0.2], [0.075, top - 0.3], [0.1, top - 0.2], [0.16, top - 0.08], [0.17, top], [0, top]], x, 0, z, { seg: 10 });
        for (const y of [y0 + 0.9, FL2 + 0.7]) if (y < top - 0.3) B.tor(NS('metal'), GOLD, 0.085, 0.015, x, y, z, { rs: 3, ts: 10, rx: HP });
      };
      for (const z of colZ) {
        column(east - 0.12, z, 0, CAN);
        colBox(B, east - 0.12, 0, z, 0.3, 2.3, 0.3, true);
        // spandrel brackets under the slab (street side) and under the canopy
        B.tube(NS('metal'), c, arcPts(east - 0.12 - 0.45, 2.3 - 0.45, z, 0.45, 0, HP, 6), 0.022, { radial: 4 });
        B.tube(NS('metal'), c, arcPts(east - 0.12 - 0.5, CAN - 0.5, z, 0.5, 0, HP, 6), 0.022, { radial: 4 });
      }
      for (const [z0, z1] of o.free || []) for (const z of colZ) if (z >= z0 - 0.01 && z <= z1 + 0.01) { column(west + 0.12, z, 0, CAN); colBox(B, west + 0.12, 0, z, 0.3, 2.3, 0.3, true); }
      // slab edge fascia: a lattice girder face along the street + gilt line
      B.box('metal', c, 0.08, 0.34, L, east + 0.02, 2.44, 0, { r: 0.015 });
      for (let z = -L / 2 + 0.3; z < L / 2 - 0.2; z += 0.36) B.tor(NS('metal'), IRDK, 0.13, 0.014, east + 0.065, 2.44, z, { rs: 3, ts: 10, ry: HP });
      pbox(B, NS('paint'), GOLD, 0.005, 0.025, L - 0.1, east + 0.064, 2.6, 0);
      for (const [z0, z1] of o.free || []) { B.box('metal', c, 0.08, 0.34, z1 - z0, west - 0.02, 2.44, (z0 + z1) / 2, { r: 0.015 }); }
      // railings on the open edges: rail colliders (kids blocked; shots, ink and squids pass)
      const rail = (x, z0, z1, side) => {
        const Lr = z1 - z0, cz = (z0 + z1) / 2;
        pbox(B, 'metal', c, 0.06, 0.05, Lr, x, FL2 + 1.0, cz);
        pbox(B, 'metal', c, 0.05, 0.04, Lr, x, FL2 + 0.1, cz);
        pbox(B, NS('metal'), c, 0.04, 0.03, Lr, x, FL2 + 0.82, cz);
        for (let z = z0 + 0.1; z < z1; z += 0.13) pbox(B, NS('metal'), c, 0.016, 0.9, 0.016, x, FL2 + 0.55, z);
        for (let z = z0 + 0.3; z < z1 - 0.2; z += 0.6) B.tor(NS('metal'), c, 0.065, 0.01, x, FL2 + 0.68, z, { rs: 3, ts: 8, ry: HP });
        for (let z = z0; z <= z1 + 1e-3; z += Lr / Math.max(1, Math.round(Lr / 2))) { pbox(B, 'metal', c, 0.07, 1.06, 0.07, x, FL2 + 0.53, z); B.sph(NS('metal'), GOLD, 0.04, x, FL2 + 1.1, z, { ws: 6, hs: 4 }); }
        // thin + outboard so both nav node columns on the 2.2 m deck stay valid (and no node sits on the rail top)
        B.col(side > 0 ? x - 0.03 : x - 0.07, FL2, z0, side > 0 ? x + 0.07 : x + 0.03, FL2 + 1.1, z1, { rail: true });
      };
      rail(east - 0.05, -L / 2, L / 2, 1);
      for (const [z0, z1] of o.railW || []) rail(west - 0.05, z0, z1, -1);
      // canopy: a glazed lean-to from the wall line (west, y CAN + 0.5) down to the street edge (CAN), rafters, gutter
      const pitch = Math.atan2(0.5, 2 * hw + 0.3), sl = Math.hypot(0.5, 2 * hw + 0.3);
      B.push(east + 0.15, CAN + 0.02, 0, HP);
      B.push(0, 0, 0, 0, pitch);
      for (let z = -L / 2; z <= L / 2 + 1e-3; z += 0.8) pbox(B, 'metal', IRDK, 0.05, 0.07, sl, z, 0.03, -sl / 2);
      for (let u = 0.3; u < sl; u += 0.55) pbox(B, NS('metal'), c, L, 0.03, 0.03, 0, 0.07, -u);
      for (let z = -L / 2 + 0.4, i = 0; z < L / 2; z += 0.8, i++) if (i % 3 === 1) pbox(B, NS('gloss'), '#a9bcc6', 0.62, 0.006, sl - 0.2, z, 0.08, -sl / 2);
      B.pop(); B.pop();
      B.box('metal', c, 0.14, 0.2, L + 0.2, east + 0.12, CAN - 0.02, 0, { r: 0.02 });
      B.cyl(NS('metal'), K.gutter, 0.06, L + 0.2, east + 0.24, CAN + 0.02, 0, { rx: HP, seg: 6 });
      // pierced valance under the canopy edge
      B.add('paint', tpl('vervalance|' + L, () => {
        const g = new GB(), n = Math.round(L / 0.22), cc = cx3(c);
        for (let i = 0; i < n; i++) { const z0 = -L / 2 + (i * L) / n, z1 = z0 + L / n; for (const s of [1, -1]) { const a = g.v(0, 0, z0 + 0.02, s, 0, 0, ...cc), b = g.v(0, 0, z1 - 0.02, s, 0, 0, ...cc), m = g.v(0, -0.22, (z0 + z1) / 2, s, 0, 0, ...cc); g.tri(a, b, m); } }
        return g.geo();
      }), 'white', east + 0.2, CAN - 0.1, 0, {});
      // the sign on the canopy fascia (street side) + hanging baskets + lamps
      B.push(east + 0.2, CAN - 0.02, 0, HP);
      B.box('gloss', IRDK, 5.0, 0.42, 0.06, 0, 0.36, 0.0, { r: 0.02 });
      letters(B, 'ARCADE GALLERY', { h: 0.22, x: 0, y: 0.25, z: 0.035, c: GOLD, dep: 0.02, wt: 0.18, track: 0.14, lit: 1.1, litC: '#ffe2a8' });
      B.pop();
      for (const z of colZ.slice(0, -1).map((a, i) => (a + colZ[i + 1]) / 2).filter((_, i) => i % 2 === 0 || L > 18)) {
        const bx = east - 0.3, by = CAN - 1.0;
        for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; rod(B, NS('metal'), IRDK, P3(bx, CAN - 0.1, z), P3(bx + Math.cos(a) * 0.2, by + 0.14, z + Math.sin(a) * 0.2), 0.005, 3); }
        B.sph('wood', '#5a4a36', 0.22, bx, by + 0.14, z, { ws: 10, hs: 5, half: true, rx: PI });
        B.add('foliage', KIT.blob(1, 4), '#4f8a45', bx, by + 0.16, z, { s: 0.25, sy: 0.14 });
        for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; B.sph(NS('foliage'), ['#d9443c', '#e87a8c', '#f2ece0', '#9b6cc6'][k % 4], 0.045, bx + Math.cos(a) * 0.2, by + 0.2 + (k % 2) * 0.05, z + Math.sin(a) * 0.2, { ws: 5, hs: 3 }); }
        for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + 0.2; B.sph(NS('foliage'), k % 2 ? '#5f9a50' : '#e87a8c', 0.05, bx + Math.cos(a) * 0.23, by + 0.06, z + Math.sin(a) * 0.23, { ws: 5, hs: 3, sy: 1.3 }); }
      }
      for (const z of [-L * 0.23, L * 0.23]) {
        B.lathe('metal', c, [[0, 0.3], [0.05, 0.28], [0.2, 0.12], [0.22, 0.1], [0.14, 0.1]], east - 0.5, CAN - 0.75, z, { seg: 8 });
        B.lathe(NS('glow'), K.lit, [[0.001, -0.1], [0.12, -0.06], [0.14, 0.1], [0.001, 0.1]], east - 0.5, CAN - 0.75, z, { seg: 8, glow: 1.9 });
        rod(B, NS('metal'), IRDK, P3(east - 0.5, CAN - 0.1, z), P3(east - 0.5, CAN - 0.45, z), 0.01, 3);
      }
    },
  };

  // ---- Tower Command only: the Exchange footbridge (the overpass from the spawn terrace to the café roof terrace), in
  // the Arcade Gallery's iron (pos = the deck's centre at street level; the deck itself, 2.3 … 2.6, is a layout block):
  // cast-iron columns under it (colliders), a lattice fascia with a gilt line on the open edges, railings (rail
  // colliders) on them, arched brackets from the columns, hanging baskets, and a lettered sign board on one fascia.
  D.crossmarket_footbridge = {
    desc: 'Iron footbridge dressing for a w × d deck at first floor (pos = deck centre at street level; the deck slab 2.3 … 2.6 is the layout\'s): columns (colliders), lattice fascia + railings (rail colliders) along the open edges `rails` [[x0, z0, x1, z1] local, axis-aligned], arched brackets, baskets, an optional sign { text, x, z, ry } on a fascia.',
    params: { w: 'm (local X)', d: 'm (local Z)', rails: '[[x0, z0, x1, z1]] open edges', cols: '[[x, z]] columns', sign: '{ text, x, z, ry }' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const FL2 = 2.6, D0 = 2.3, c = IRON;
      // columns: fluted iron with gilt rings, an arched bracket up to the deck on each open side
      for (const [x, z] of o.cols || []) {
        B.lathe('metal', c, [[0.16, 0], [0.17, 0.05], [0.12, 0.12], [0.09, 0.2], [0.075, D0 - 0.3], [0.1, D0 - 0.2], [0.16, D0 - 0.08], [0.17, D0], [0, D0]], x, 0, z, { seg: 10 });
        B.tor(NS('metal'), GOLD, 0.085, 0.015, x, 0.9, z, { rs: 3, ts: 10, rx: HP });
        colBox(B, x, 0, z, 0.3, D0, 0.3, true);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ex = x + dx * 0.5, ez = z + dz * 0.5;
          if (Math.abs(ex) > o.w / 2 || Math.abs(ez) > o.d / 2) continue;
          // quarter arc from the shaft (0.45 under the deck) out to the deck's underside (arcPts gives [cos, sin, 0])
          B.tube(NS('metal'), c, arcPts(0, 0, 0, 0.45, 0, HP, 6).map(([ca, sa]) => P3(x + dx * (0.45 - ca), D0 - 0.45 + sa, z + dz * (0.45 - ca))), 0.022, { radial: 4 });
        }
      }
      // open edges: lattice fascia (a girder face with rings) + a gilt line, the railing on top (rail collider)
      for (const [x0, z0, x1, z1] of o.rails || []) {
        const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ry = alongX ? 0 : HP;
        // outward normal: away from the deck centre
        const out = alongX ? Math.sign(cz || 1) : Math.sign(cx || 1);
        B.push(cx, 0, cz, ry);
        const n = out;                                       // local +Z (after the turn: +Z or +X) signed outward
        B.box('metal', c, L, 0.34, 0.08, 0, 2.44, n * 0.02, { r: 0.015 });
        for (let u = -L / 2 + 0.3; u < L / 2 - 0.2; u += 0.36) B.tor(NS('metal'), IRDK, 0.13, 0.014, u, 2.44, n * 0.065, { rs: 3, ts: 10 });
        pbox(B, NS('paint'), GOLD, L - 0.1, 0.025, 0.005, 0, FL2, n * 0.064);
        pbox(B, 'metal', c, L, 0.05, 0.06, 0, FL2 + 1.0, n * -0.05);
        pbox(B, 'metal', c, L, 0.04, 0.05, 0, FL2 + 0.1, n * -0.05);
        pbox(B, NS('metal'), c, L, 0.03, 0.04, 0, FL2 + 0.82, n * -0.05);
        for (let u = -L / 2 + 0.1; u < L / 2; u += 0.13) pbox(B, NS('metal'), c, 0.016, 0.9, 0.016, u, FL2 + 0.55, n * -0.05);
        for (let u = -L / 2 + 0.3; u < L / 2 - 0.2; u += 0.6) B.tor(NS('metal'), c, 0.065, 0.01, u, FL2 + 0.68, n * -0.05, { rs: 3, ts: 8 });
        for (let u = -L / 2; u <= L / 2 + 1e-3; u += L / Math.max(1, Math.round(L / 2))) { pbox(B, 'metal', c, 0.07, 1.06, 0.07, u, FL2 + 0.53, n * -0.05); B.sph(NS('metal'), GOLD, 0.04, u, FL2 + 1.1, n * -0.05, { ws: 6, hs: 4 }); }
        B.pop();
        // thin, just inside the edge (rail: kids blocked; shots, ink, squids pass)
        const t = 0.1;
        if (alongX) B.col(Math.min(x0, x1), FL2, out > 0 ? cz - t : cz, Math.max(x0, x1), FL2 + 1.1, out > 0 ? cz : cz + t, { rail: true });
        else B.col(out > 0 ? cx - t : cx, FL2, Math.min(z0, z1), out > 0 ? cx : cx + t, FL2 + 1.1, Math.max(z0, z1), { rail: true });
        // a hanging basket under the fascia mid-span
        if (L > 3) {
          const bx = alongX ? cx : cx + out * 0.25, bz = alongX ? cz + out * 0.25 : cz, by = D0 - 0.75;
          for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; rod(B, NS('metal'), IRDK, P3(bx, D0 - 0.02, bz), P3(bx + Math.cos(a) * 0.2, by + 0.14, bz + Math.sin(a) * 0.2), 0.005, 3); }
          B.sph('wood', '#5a4a36', 0.22, bx, by + 0.14, bz, { ws: 10, hs: 5, half: true, rx: PI });
          B.add('foliage', KIT.blob(1, 4), '#4f8a45', bx, by + 0.16, bz, { s: 0.25, sy: 0.14 });
          for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; B.sph(NS('foliage'), ['#d9443c', '#e87a8c', '#f2ece0', '#9b6cc6'][k % 4], 0.045, bx + Math.cos(a) * 0.2, by + 0.2 + (k % 2) * 0.05, bz + Math.sin(a) * 0.2, { ws: 5, hs: 3 }); }
        }
      }
      // under-deck: iron joists across the short span (reads as a bridge from below)
      const alongW = o.w <= o.d, span = alongW ? o.w : o.d, len = alongW ? o.d : o.w;
      for (let u = -len / 2 + 0.4; u < len / 2 - 0.2; u += 0.9) pbox(B, NS('metal'), IRDK, alongW ? span - 0.1 : 0.1, 0.14, alongW ? 0.1 : span - 0.1, alongW ? 0 : u, D0 - 0.07, alongW ? u : 0);
      if (o.sign) {
        const s = o.sign, w = Math.min(4.6, textW(s.text, 0.2, 0.1) * 0.2 + 0.5);
        B.push(s.x, D0 - 0.05, s.z, s.ry ?? 0);
        B.box('gloss', IRDK, w, 0.42, 0.06, 0, -0.2, 0.08, { r: 0.02 });
        letters(B, s.text, { h: 0.22, x: 0, y: -0.31, z: 0.115, c: GOLD, dep: 0.02, wt: 0.18, track: 0.14, lit: 1.1, litC: '#ffe2a8' });
        B.pop();
      }
    },
  };

  // ---- the Corn Exchange: the civic building behind each spawn terrace (pos = centre of the terrace's back edge at
  // street level, local z = 0 is the facade plane, the building is behind -Z). Its ground floor is the terrace podium;
  // the facade above the terrace: rusticated pilasters, three arched French doors, a first-floor window row, the
  // entablature with CORN EXCHANGE, a pediment with a clock, a copper-domed cupola, balustraded parapets with urns,
  // team flags on staffs. The upper mass collides (camera-safe).
  D.crossmarket_exchange = {
    desc: 'Corn Exchange (pos = terrace back-edge centre at street level; facade faces +Z, building behind): arched French doors on the terrace, pilasters, first-floor windows with balconettes, CORN EXCHANGE entablature, pediment clock, balustraded parapet with urns, cupola, team flags; upper mass collides.',
    params: { w: 'm (18)', team: '0|1' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = o.w ?? 18, T = 2.6, E1 = 9.2, PAR = 10.3, DEP = 7;
      const wall = K.stoneLt, trim = '#f3ecdc', team = o.team ?? 0;
      // mass behind the facade (walls + roof), colliders
      B.box('paint', wall, W, PAR - T, DEP, 0, (T + PAR) / 2, -DEP / 2 - 0.02, { r: 0.05 });
      B.box(NS('paint'), shade(ST, 0.9), W + 12, T + 0.1, DEP + 4, 0, T / 2 - 0.05, -DEP / 2 - 2.02, { r: 0.05 });
      // rusticated podium band continues along the back behind the terrace (to its sides)
      // pilasters (rusticated) + bays: 5 bays, arched French doors on the terrace level, windows above
      const bays = 5, bw = W / bays;
      for (let i = 0; i <= bays; i++) {
        const x = -W / 2 + i * bw;
        B.box('paint', ST, 0.6, E1 - T - 0.1, 0.16, x, (T + E1) / 2, 0.08, { r: 0.02 });
        for (let y = T + 0.35; y < E1 - 0.2; y += 0.42) pbox(B, NS('paint'), STD, 0.62, 0.035, 0.17, x, y, 0.085);
        B.box('paint', trim, 0.72, 0.22, 0.24, x, E1 - 0.1, 0.12, { r: 0.02 });
      }
      for (let i = 0; i < bays; i++) {
        const x = -W / 2 + (i + 0.5) * bw, mid = i === 2;
        // terrace level: tall arched French doors (the middle one a grand doorway under a porch hood)
        const dw = mid ? 1.9 : 1.4, dh = 2.7;
        pbox(B, NS('gloss'), K.glass, dw, dh, 0.02, x, T + dh / 2, 0.01);
        B.add(NS('gloss'), tpl('exarch|' + dw, () => { const g = new GB(), cc = cx3(K.glass); const c0 = g.v(0, 0, 0, 0, 0, 1, ...cc), r = []; for (let k = 0; k <= 10; k++) { const a = (k / 10) * PI; r.push(g.v(Math.cos(a) * dw / 2, Math.sin(a) * dw / 2, 0, 0, 0, 1, ...cc)); } for (let k = 0; k < 10; k++) g.tri(c0, r[k], r[k + 1]); return g.geo(); }), 'white', x, T + dh, 0.01, {});
        B.tube('paint', trim, arcPts(x, T + dh, 0.05, dw / 2 + 0.08, 0, PI, 12), 0.09, { radial: 5 });
        for (const sx of [-1, 1]) pbox(B, 'paint', trim, 0.16, dh, 0.1, x + sx * (dw / 2 + 0.08), T + dh / 2, 0.05);
        B.box('paint', shade(trim, 1.02), 0.2, 0.34, 0.14, x, T + dh + dw / 2 + 0.12, 0.08, { r: 0.015 });
        for (let k = 1; k < 4; k++) pbox(B, NS('paint'), trim, 0.035, dh, 0.03, x - dw / 2 + (k * dw) / 4, T + dh / 2, 0.03);
        for (const t of [0.35, 0.7]) pbox(B, NS('paint'), trim, dw, 0.035, 0.03, x, T + dh * t, 0.03);
        pbox(B, NS('glow'), K.lit, dw - 0.1, 0.5, 0.004, x, T + dh - 0.4, 0.022, { glow: 0.7 });
        if (mid) {
          // porch hood on scrolled consoles + lettered fanlight
          B.box('paint', trim, dw + 1.0, 0.16, 0.8, x, T + dh + dw / 2 + 0.45, 0.4, { r: 0.03 });
          for (const sx of [-1, 1]) { B.box('paint', trim, 0.2, 0.6, 0.6, x + sx * (dw / 2 + 0.3), T + dh + dw / 2 + 0.1, 0.3, { r: 0.04 }); }
        }
        // first floor: window with a stone balconette
        const wy = T + dh + dw / 2 + 1.05;
        if (!mid) win(B, x, wy, 1.05, 1.5, { sur: 'stone', surC: trim, frame: K.frame, hood: i % 2 ? 'cornice' : 'pediment', lit: i === 1 ? 0.7 : 0, key: false });
      }
      // entablature: architrave, frieze with CORN EXCHANGE, cornice; balustraded parapet with urns
      B.box('paint', trim, W + 0.8, 0.26, 0.3, 0, E1 + 0.13, 0.15, { r: 0.03 });
      B.box('paint', wall, W + 0.6, 0.72, 0.18, 0, E1 + 0.62, 0.09, { r: 0.02 });
      letters(B, 'CORN EXCHANGE', { h: 0.46, x: 0, y: E1 + 0.39, z: 0.18, c: K.goldDk, dep: 0.04, wt: 0.16, track: 0.2, lit: 0.9, litC: '#ffe2a8' });
      B.box('paint', trim, W + 1.0, 0.22, 0.46, 0, E1 + 1.08, 0.2, { r: 0.04 });
      for (let x = -W / 2 - 0.3; x < W / 2 + 0.4; x += 0.3) pbox(B, NS('paint'), trim, 0.12, 0.12, 0.12, x, E1 + 0.92, 0.36);
      // parapet balustrade either side of the pediment
      for (const s of [-1, 1]) {
        const x0 = s * 3.6, x1 = s * (W / 2 + 0.3), L = Math.abs(x1 - x0), cx = (x0 + x1) / 2;
        B.box('paint', trim, L, 0.12, 0.4, cx, PAR + 0.06, 0.05, { r: 0.02 });
        B.box('paint', trim, L, 0.12, 0.44, cx, PAR + 0.84, 0.05, { r: 0.02 });
        for (let k = 0; k < Math.round(L / 0.24); k++) B.lathe(NS('paint'), trim, baluster.map(([r, y]) => [r, y * 1.1]), Math.min(x0, x1) + (k + 0.5) * (L / Math.round(L / 0.24)), PAR + 0.12, 0.05, { seg: 5 });
        B.col(Math.min(x0, x1), PAR, -0.2, Math.max(x0, x1), PAR + 1.0, 0.28, { rail: true });   // balustrade: a rail (out of reach anyway)
        for (const x of [x1, x0 + s * 0.2]) { B.box('paint', trim, 0.46, 0.95, 0.46, x, PAR + 0.47, 0.05, { r: 0.02 }); B.lathe('paint', trim, [[0.12, 0], [0.22, 0.1], [0.26, 0.3], [0.2, 0.46], [0.08, 0.52], [0.12, 0.62], [0, 0.7]], x, PAR + 0.95, 0.05, { seg: 10 }); }
      }
      // pediment with the clock
      const PW = 7.6, PR = 2.3, PY = PAR;
      B.add('paint', tpl('expedi', () => extrudeGeo([[-PW / 2, 0], [PW / 2, 0], [0, PR]], 1, 0.002)), wall, 0, PY, -0.3, { ry: HP, sx: 0.9 });
      for (const s of [-1, 1]) { B.push(s * PW / 4, PY + PR / 2 + 0.04, 0.12, 0, 0, -s * Math.atan2(PR, PW / 2)); B.box('paint', trim, Math.hypot(PR, PW / 2) + 0.5, 0.26, 0.4, 0, 0, 0, { r: 0.04 }); B.pop(); }
      B.box('paint', trim, PW + 0.4, 0.2, 0.4, 0, PY + 0.02, 0.12, { r: 0.03 });
      B.cyl('paint', trim, 0.78, 0.12, 0, PY + 1.0, 0.12, { rx: HP, seg: 24 });
      B.cyl(NS('glow'), '#f6eed8', 0.66, 0.03, 0, PY + 1.0, 0.19, { rx: HP, seg: 24, glow: 1.5 });
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; B.box(NS('paint'), K.black, k % 3 ? 0.03 : 0.05, 0.1, 0.01, Math.sin(a) * 0.54, PY + 1.0 + Math.cos(a) * 0.54, 0.21, { rz: -a, r: 0.003 }); }
      for (const [a, l, w2] of [[0.9, 0.36, 0.05], [2.1, 0.52, 0.035]]) B.box(NS('paint'), K.black, w2, l, 0.012, Math.sin(a) * l / 2, PY + 1.0 + Math.cos(a) * l / 2, 0.22, { rz: -a, r: 0.004 });
      for (const x of [-PW / 2 - 0.1, 0, PW / 2 + 0.1]) { B.lathe('paint', trim, [[0.12, 0], [0.22, 0.1], [0.26, 0.3], [0.2, 0.46], [0.08, 0.52], [0.12, 0.62], [0, 0.72]], x, x ? PY + 0.1 : PY + PR + 0.1, 0.12, { seg: 10 }); }
      // cupola behind the pediment: drum with columns, copper dome, lantern + weathervane
      const CZ = -2.8, CYb = PAR + 0.2;
      B.box('paint', trim, 3.0, 1.2, 3.0, 0, CYb + 0.6, CZ, { r: 0.04 });
      B.cyl('paint', wall, 1.2, 2.0, 0, CYb + 2.2, CZ, { seg: 16 });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; B.cyl('paint', trim, 0.09, 2.0, Math.cos(a) * 1.25, CYb + 2.2, CZ + Math.sin(a) * 1.25, { seg: 8 }); }
      B.cyl('paint', trim, 1.45, 0.2, 0, CYb + 3.3, CZ, { seg: 16 });
      B.lathe('gloss', K.verdigris, [[1.4, 0], [1.3, 0.5], [1.0, 1.05], [0.55, 1.45], [0.2, 1.62], [0, 1.66]], 0, CYb + 3.4, CZ, { seg: 16 });
      B.cyl('paint', trim, 0.22, 0.6, 0, CYb + 5.3, CZ, { seg: 10 });
      B.lathe('gloss', K.verdigris, [[0.32, 0], [0.18, 0.3], [0, 0.5]], 0, CYb + 5.6, CZ, { seg: 10 });
      B.sph('metal', GOLD, 0.12, 0, CYb + 6.2, CZ, { ws: 8, hs: 6 });
      B.cyl('metal', IRDK, 0.025, 0.9, 0, CYb + 6.6, CZ, { seg: 5 });
      // team flags on staffs projecting from the pilasters over the terrace
      for (const sx of [-1, 1]) {
        const x = sx * (W / 2 - bw), y = T + 4.6;
        B.push(x, y, 0.2, 0, -0.6);
        B.cyl('metal', GOLD, 0.03, 2.4, 0, 1.2, 0, { seg: 6 });
        B.sph(NS('metal'), GOLD, 0.06, 0, 2.45, 0, { ws: 6, hs: 4 });
        B.pop();
        B.banner(x, y + 1.35, 1.1, { team, rx: 0 });
      }
      // lanterns either side of the grand door
      for (const sx of [-1, 1]) { B.push(sx * 1.55, 0, 0.16, 0); wallLantern(B, 0, T + 2.1); B.pop(); }
      // colliders: the building mass above the terrace (behind the facade plane) + pediment/cupola
      B.col(-W / 2 - 0.3, T, -DEP, W / 2 + 0.3, PAR + 1.0, 0.0, { roof: true });
    },
  };

  // ---- the podium: the spawn terrace's front face (pos = centre of the front edge at street level, face at z = 0,
  // +Z out): rusticated ashlar with channelled joints, blind arches with iron gates, a plinth, a string course, plaques
  D.crossmarket_podium = {
    desc: 'Rusticated podium dressing on the spawn terrace front (pos = front-edge centre, face +Z): channelled rustication, blind arches with iron grilles (skipping the stair openings), plinth + cornice band, a bronze plaque. Non-colliding.',
    params: { w: 'm (18)', h: 'm (2.4)', arches: '[x…] centres', skip: '[[x0, x1]] stair openings' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const W = o.w ?? 18, Hh = o.h ?? 2.4, skip = o.skip ?? [];
      const inSkip = (x) => skip.some(([a, b]) => x > a - 0.05 && x < b + 0.05);
      const segs = []; let x0 = -W / 2;
      for (const [a, b] of [...skip].sort((p, q) => p[0] - q[0])) { if (a > x0) segs.push([x0, a]); x0 = Math.max(x0, b); }
      if (x0 < W / 2) segs.push([x0, W / 2]);
      for (const [a, b] of segs) {
        const L = b - a, cx = (a + b) / 2;
        for (let y = 0.45; y < Hh - 0.3; y += 0.42) pbox(B, NS('paint'), K.stoneDk, L, 0.04, 0.03, cx, y, 0.0);
        pbox(B, 'paint', shade(K.stone, 0.88), L, 0.3, 0.06, cx, 0.15, 0.03);
        B.box('paint', K.stoneLt, L + 0.04, 0.16, 0.14, cx, Hh - 0.02, 0.07, { r: 0.02 });
      }
      for (const x of o.arches ?? []) {
        if (inSkip(x)) continue;
        const aw = 1.3;
        pbox(B, NS('paint'), K.ironDk, aw, 1.2, 0.02, x, 0.6 + 0.3, 0.004);
        B.add(NS('paint'), tpl('podarch|' + aw, () => { const g = new GB(), cc = cx3(K.ironDk); const c0 = g.v(0, 0, 0, 0, 0, 1, ...cc), r = []; for (let k = 0; k <= 10; k++) { const a = (k / 10) * PI; r.push(g.v(Math.cos(a) * aw / 2, Math.sin(a) * aw / 2, 0, 0, 0, 1, ...cc)); } for (let k = 0; k < 10; k++) g.tri(c0, r[k], r[k + 1]); return g.geo(); }), 'white', x, 1.5, 0.004, {});
        B.tube('paint', K.stoneLt, arcPts(x, 1.5, 0.03, aw / 2 + 0.07, 0, PI, 10), 0.08, { radial: 4 });
        B.box('paint', K.stoneLt, 0.2, 0.3, 0.1, x, 2.2, 0.05, { r: 0.01 });
        for (let k = 1; k < 6; k++) pbox(B, NS('metal'), K.iron, 0.025, 1.9, 0.03, x - aw / 2 + (k * aw) / 6, 1.1, 0.02);
        for (const y of [0.5, 1.2]) pbox(B, NS('metal'), K.iron, aw, 0.03, 0.03, x, y, 0.02);
      }
      if (o.plaque) { B.box('metal', '#6f6040', 0.7, 0.45, 0.03, o.plaque, 1.5, 0.015, { r: 0.02 }); letters(B, 'EST 1861', { h: 0.08, x: o.plaque, y: 1.46, z: 0.032, c: '#e8d8a8', flat: true, wt: 0.22 }); }
    },
  };

  // ---- the Fish Lane arcade: segmental arches between the piers, capitals + bases, a boarded ceiling with iron
  // beams, hanging lamps. pos = the pier line's centre (x of the pier centres, z centre), piers every `pitch` along Z.
  D.crossmarket_arcade = {
    desc: 'Arcade dressing (pos = centre of the pier row at floor level; piers 0.8 × 0.7 every `pitch` m along local Z, `n` piers): segmental arches + spandrels between the piers facing ±X, pier caps and bases, the ceiling (joists, iron beams), pendant lamps, a lettered FISH MARKET frieze. Non-colliding.',
    params: { n: 'piers (7)', pitch: 'm (4.6)', depth: 'arcade depth toward -X (3.8)', y0: 'floor (0.15)', top: 'soffit (2.8)', name: 'frieze lettering (FISH MARKET)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const n = o.n ?? 7, pitch = o.pitch ?? 4.6, dep = o.depth ?? 3.8, y0 = o.y0 ?? 0.15, top = o.top ?? 2.8, st = K.stoneLt;
      const z0 = -((n - 1) * pitch) / 2;
      for (let i = 0; i < n; i++) {
        const z = z0 + i * pitch;
        B.box('paint', st, 0.9, 0.2, 0.8, 0, top - 0.1, z, { r: 0.02 });
        B.box('paint', shade(st, 0.94), 0.92, 0.26, 0.82, 0, y0 + 0.13, z, { r: 0.02 });
      }
      for (let i = 0; i < n - 1; i++) {
        const za = z0 + i * pitch + 0.35, zb = z0 + (i + 1) * pitch - 0.35, zc = (za + zb) / 2, span = zb - za, rise = 0.5;
        const R = (span * span / 4 + rise * rise) / (2 * rise), a = Math.asin(span / 2 / R), yc = top - 0.02 - R;
        // spandrel infill: a band between the arch curve and the soffit, both faces
        B.add('paint', tpl(['arcsp', span, rise, top].map(kf).join('|'), () => {
          const g = new GB(), cc = cx3(st), m = 10;
          for (let k = 0; k < m; k++) {
            const t0 = -a + (2 * a * k) / m, t1 = -a + (2 * a * (k + 1)) / m;
            const p0 = [Math.sin(t0) * R, yc + Math.cos(t0) * R - (top - 0.02) + 0.02], p1 = [Math.sin(t1) * R, yc + Math.cos(t1) * R - (top - 0.02) + 0.02];
            for (const s of [1, -1]) { const q = [g.v(s * 0.4, p0[1], p0[0], s, 0, 0, ...cc), g.v(s * 0.4, p1[1], p1[0], s, 0, 0, ...cc), g.v(s * 0.4, 0.02, p1[0], s, 0, 0, ...cc), g.v(s * 0.4, 0.02, p0[0], s, 0, 0, ...cc)]; g.quad(q[0], q[1], q[2], q[3]); }
            const nx = -Math.sin((t0 + t1) / 2), ny = -Math.cos((t0 + t1) / 2);
            const q2 = [g.v(-0.4, p0[1], p0[0], 0, ny, nx, ...cc), g.v(0.4, p0[1], p0[0], 0, ny, nx, ...cc), g.v(0.4, p1[1], p1[0], 0, ny, nx, ...cc), g.v(-0.4, p1[1], p1[0], 0, ny, nx, ...cc)];
            g.quad(q2[0], q2[1], q2[2], q2[3]);
          }
          return g.geo();
        }), 'white', 0, top - 0.02, zc, {});
        B.box('paint', shade(st, 1.03), 0.18, 0.3, 0.26, 0.36, top - 0.2, zc, { r: 0.015 });           // keystone (street face)
        // ceiling: joists across the arcade + an iron beam along it, a pendant lamp per bay
        for (let k = 0; k < 5; k++) pbox(B, NS('wood'), K.woodDk, dep, 0.12, 0.1, -dep / 2 + 0.3, top - 0.08, za + ((k + 0.5) * span) / 5);
        B.cyl(NS('metal'), K.ironDk, 0.012, 0.35, -dep / 2 + 0.2, top - 0.2, zc, { seg: 4 });
        B.lathe('metal', K.iron, [[0, 0.2], [0.05, 0.19], [0.2, 0.06], [0.21, 0.04], [0.14, 0.04]], -dep / 2 + 0.2, top - 0.62, zc, { seg: 8 });
        B.lathe(NS('glow'), K.lit, [[0.001, -0.12], [0.12, -0.08], [0.14, 0.05], [0.001, 0.05]], -dep / 2 + 0.2, top - 0.62, zc, { seg: 8, glow: 1.9 });
      }
      pbox(B, NS('metal'), K.iron, 0.2, 0.18, (n - 1) * pitch, -dep / 2 + 0.2, top - 0.12, 0);
      // frieze letters over the arches (street face)
      B.push(0.41, 0, 0, HP);
      letters(B, o.name ?? 'FISH MARKET', { h: 0.28, x: 0, y: top + 0.12, z: 0, c: K.goldDk, flat: true, wt: 0.18, track: 0.24 });
      B.pop();
    },
  };

  // ---- the Market Passage through the tall row (pos = west mouth centre on the wall line, local +Z = out toward
  // Market Street, the passage runs `depth` m into -Z): stone portals with lettered lintels at both mouths, a lantern,
  // posters on the walls, a side door, a bicycle. Non-colliding except the bicycle stand.
  D.crossmarket_passage = {
    desc: 'Market Passage dressing (pos = west mouth centre at street level; local +Z out, passage toward -Z, width w, depth): stone portals with MARKET PASSAGE lintels at both mouths, hanging lanterns, bill posters, a side door. Non-colliding.',
    params: { w: 'm opening (3)', depth: 'm (9)', h: 'm (2.6)', h2: 'm soffit over the far part (2.2)', split: 'm where the soffit drops (4.5)', name: 'lintel lettering (MARKET PASSAGE)', lampX: 'lanterns off the centre line (0)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.aoBase = null;
      const w = o.w ?? 3, dep = o.depth ?? 9, h = o.h ?? 2.6, h2 = o.h2 ?? 2.2, split = o.split ?? 4.5, lx = o.lampX ?? 0;
      const portal = (z, ry, hh, name) => {
        B.push(0, 0, z, ry);
        for (const sx of [-1, 1]) { B.box('paint', ST, 0.34, hh, 0.14, sx * (w / 2 + 0.17), hh / 2, 0.07, { r: 0.02 }); for (let y = 0.4; y < hh - 0.2; y += 0.4) pbox(B, NS('paint'), STD, 0.36, 0.03, 0.15, sx * (w / 2 + 0.17), y, 0.075); }
        B.box('paint', ST, w + 0.9, 0.46, 0.16, 0, hh + 0.23, 0.08, { r: 0.02 });
        B.box('paint', STL, w + 1.0, 0.08, 0.22, 0, hh + 0.5, 0.1, { r: 0.015 });
        B.box('paint', shade(ST, 1.04), 0.26, 0.2, 0.22, 0, hh + 0.56, 0.11, { r: 0.015 });
        letters(B, name, { h: 0.15, x: 0, y: hh + 0.16, z: 0.185, c: K.ironDk, flat: true, wt: 0.2, track: 0.12 });
        // lantern hung from the lintel
        rod(B, NS('metal'), IRDK, P3(lx, hh - 0.02, -0.25), P3(lx, hh - 0.3, -0.25), 0.01, 3);
        B.lathe('metal', IRON, [[0, 0.2], [0.05, 0.19], [0.15, 0.08], [0.16, 0.06], [0.1, 0.06]], lx, hh - 0.52, -0.25, { seg: 6 });
        B.lathe(NS('glow'), K.lit, [[0.001, -0.12], [0.09, -0.1], [0.11, 0.06], [0.001, 0.06]], lx, hh - 0.52, -0.25, { seg: 6, glow: 1.9 });
        B.pop();
      };
      const name = o.name ?? 'MARKET PASSAGE';
      portal(0, 0, h, name);
      portal(-dep, PI, h2, name);
      // walls: posters, a side door into the bakery, a bench, a lantern mid-way
      for (const sx of [-1, 1]) {
        B.push(sx * w / 2, 0, 0, -sx * HP);
        KIT.bill(B, -1.6, 1.45, 0.006, 0.55, 0.8, sx > 0 ? 'circus' : 'tram');
        KIT.bill(B, -2.3, 1.5, 0.006, 0.5, 0.74, sx > 0 ? 'soap' : 'regatta');
        KIT.bill(B, -6.6, 1.25, 0.006, 0.5, 0.74, sx > 0 ? 'cocoa' : 'herring');
        pbox(B, NS('paint'), shade(ST, 0.8), dep, 0.3, 0.03, -dep / 2, 0.15, 0.015);
        B.pop();
      }
      B.push(-w / 2, 0, -3.4, HP); KIT.frontDoor(B, 0, 0.95, 2.1, { door: '#4a3222', surC: ST }); B.pop();
      B.push(0, 0, 0, 0);
      rod(B, NS('metal'), IRDK, P3(lx, h, -split + 1.2), P3(lx, h - 0.35, -split + 1.2), 0.01, 3);
      B.lathe('metal', IRON, [[0, 0.3], [0.06, 0.28], [0.22, 0.12], [0.24, 0.1], [0.15, 0.1]], lx, h - 0.65, -split + 1.2, { seg: 8 });
      B.lathe(NS('glow'), K.lit, [[0.001, -0.1], [0.12, -0.06], [0.14, 0.1], [0.001, 0.1]], lx, h - 0.65, -split + 1.2, { seg: 8, glow: 1.9 });
      B.pop();
    },
  };

  // ---- roof-terrace furniture: a pergola of iron hoops with vines along the wall, planters, a menu board
  D.crossmarket_pergola = {
    desc: 'Café-terrace pergola along local +X (length): slender iron hoops from the wall line (z = 0) out to posts at depth `d`, trained vines along the top, hanging lamps. Posts collide.',
    params: { length: 'm (8)', d: 'm (1.8)', h: 'm (2.5)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 8, d = o.d ?? 1.8, hh = o.h ?? 2.5, n = Math.max(2, Math.round(L / 2.4));
      for (let i = 0; i <= n; i++) {
        const x = (i * L) / n;
        B.cyl('metal', IRON, 0.035, hh, x, hh / 2, d, { seg: 6 });
        B.tube('metal', IRON, [P3(x, hh, d), P3(x, hh + 0.35, d * 0.55), P3(x, hh + 0.4, 0.05)], 0.025, { radial: 5 });
        colBox(B, x, 0, d, 0.12, hh, 0.12, true);
      }
      for (const z of [0.3, d * 0.55, d]) { const yy = z > d * 0.9 ? hh : hh + 0.36; pbox(B, NS('metal'), IRON, L, 0.03, 0.03, L / 2, yy, z); }
      // vine: a lumpy leaf canopy along the top bars, clumps climbing the posts, wisteria-like drooping bunches
      for (let i = 0; i < Math.round(L / 0.45); i++) {
        const x = 0.2 + i * 0.45, k = hash(i * 3.7 + L), z = d * (0.15 + 0.75 * hash(i * 1.9 + 4));
        B.add('foliage', KIT.blob(1, (i * 3) % 8), k > 0.5 ? '#4f8a45' : '#5f9a50', x, hh + 0.3 + 0.12 * k, z, { sx: 0.32 + 0.12 * k, sy: 0.2, sz: 0.36 });
        if (hash(i * 5.1) < 0.45) { B.add(NS('foliage'), KIT.blob(1, (i + 2) % 8), '#9b7cc6', x + 0.1, hh + 0.02, z, { sx: 0.08, sy: 0.22, sz: 0.08 }); B.add(NS('foliage'), KIT.blob(1, (i + 5) % 8), '#b39ad6', x - 0.12, hh + 0.08, z + 0.1, { sx: 0.07, sy: 0.18, sz: 0.07 }); }
      }
      // climbers twisting up the posts: a thin stem spiral with small leaf clusters
      for (let i = 0; i <= n; i++) {
        const x = (i * L) / n, pts = [];
        for (let k = 0; k <= 12; k++) { const a = k * 1.1 + i; pts.push(P3(x + Math.cos(a) * 0.07, 0.1 + (k / 12) * (hh - 0.1), d + Math.sin(a) * 0.07)); }
        B.tube(NS('wood'), '#5a4a30', pts, 0.015, { radial: 3 });
        for (let k = 0; k < 6; k++) { const a = k * 2.3 + i; B.add(NS('foliage'), KIT.blob(0, (i + k) % 8), k % 2 ? '#4f8a45' : '#5f9a50', x + Math.cos(a) * 0.1, 0.5 + k * 0.36, d + Math.sin(a) * 0.1, { s: 0.09, sy: 0.12 }); }
      }
      for (let i = 0; i < n; i++) { const x = ((i + 0.5) * L) / n; B.sph(NS('glow'), K.lit, 0.06, x, hh + 0.1, d * 0.55, { ws: 8, hs: 6, glow: 2.3 }); }
    },
  };
}
