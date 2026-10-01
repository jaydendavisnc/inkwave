// Eco-Forest Treehills — mid: the Seed Vault Plaza's kit and the Solar Canopy over it.
//   treehills_canopy   the Solar Canopy: a big hexagonal shade roof of solar leaves on six slim pylons (underside at
//                      CANOPY.y), a steel ring and spokes under it, gaps between the panels, vines trailing from the rim;
//                      the pylons are cover, the roof is off-limits (slide-off), well over the tower's headroom
//   treehills_console  a seed-bank console on the plaza (1.1 m): a sloped terminal with a lit screen and the vault's
//                      drawer fronts (cover)
import { CANOPY, T1 } from './plan.js';

export function registerPlaza(D, H, T) {
  const { PI, TAU, HP, mixc } = H;
  const { K, NS, pbox, ccyl, seg, colC, ROOF, letters, tpl, hash, blob, puff } = T;

  D.treehills_canopy = {
    desc: 'the Solar Canopy: hexagonal solar-leaf roof on six pylons over the plaza (pylons cover, roof off-limits)',
    build(B) {
      const y0 = T1, yc = CANOPY.y, Rr = CANOPY.R;
      // pylons: a tapered white column with a green band and a flared head, a base plate on the plaza
      for (const [x, z] of CANOPY.pylons) {
        pbox(B, 'metal', K.steelDk, 0.9, 0.08, 0.9, x, y0 + 0.04, z);
        B.cyl('gloss', K.white, 0.2, yc - y0 - 0.5, x, y0 + (yc - y0 - 0.5) / 2, z, { seg: 12, r2: 0.15 });
        B.cyl(NS('gloss'), K.mod, 0.205, 0.3, x, y0 + 1.6, z, { seg: 12, open: true });
        B.cyl('gloss', K.white, 0.5, 0.5, x, yc - 0.25, z, { seg: 12, r2: 0.15 });
        B.cyl(NS('glow'), K.lamp, 0.21, 0.08, x, y0 + 2.6, z, { seg: 12, glow: 1.4, open: true });
        colC(B, x, y0, z, 0.46, yc - y0, 0.46);
      }
      // the frame: a hexagonal ring and six spokes to a hub
      const ring = [];
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; ring.push([Math.cos(a) * (Rr - 0.3), Math.sin(a) * (Rr - 0.3)]); }
      for (let k = 0; k < 6; k++) {
        const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % 6];
        seg(B, 'metal', K.steelLt, [ax, yc + 0.1, az], [bx, yc + 0.1, bz], 0.22, 0.22);
        seg(B, 'metal', K.steelLt, [0, yc + 0.35, 0], [ax, yc + 0.1, az], 0.16, 0.16);
      }
      ccyl(B, 'metal', K.steelLt, 0.7, 0.5, 0, yc + 0.3, 0, { seg: 12 });
      // the rim: a pale fascia band round the hexagon with a green stripe (reads as the roof's edge from the meadow)
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * TAU, a1 = ((k + 1) / 6) * TAU, p0 = [Math.cos(a0) * Rr, Math.sin(a0) * Rr], p1 = [Math.cos(a1) * Rr, Math.sin(a1) * Rr];
        seg(B, 'gloss', K.white, [p0[0], yc + 0.4, p0[1]], [p1[0], yc + 0.4, p1[1]], 0.14, 0.55);
        seg(B, NS('gloss'), K.mod, [p0[0] * 1.004, yc + 0.3, p0[1] * 1.004], [p1[0] * 1.004, yc + 0.3, p1[1] * 1.004], 0.02, 0.14);
      }
      // the solar leaves: each of the six sectors split into triangles (the dome's geodesic language), panels tilted a
      // little, a gap between each (light through), a pale frame round every panel
      const g = tpl('canopy-tri', () => {
        const geo = new H.THREE.BufferGeometry();
        geo.setAttribute('position', new H.THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0.5, 0, 0.866], 3));
        geo.setAttribute('normal', new H.THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
        geo.setAttribute('uv', new H.THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
        return geo;
      });
      const n = 3;   // triangles per sector edge
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * TAU, a1 = ((k + 1) / 6) * TAU;
        const P0 = [0, 0], P1 = [Math.cos(a0) * Rr, Math.sin(a0) * Rr], P2 = [Math.cos(a1) * Rr, Math.sin(a1) * Rr];
        const pt = (i, j) => [P0[0] + ((P1[0] - P0[0]) * i + (P2[0] - P0[0]) * j) / n, P0[1] + ((P1[1] - P0[1]) * i + (P2[1] - P0[1]) * j) / n];
        for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
          const tris = [[pt(i, j), pt(i + 1, j), pt(i, j + 1)]];
          if (i + j < n - 1) tris.push([pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)]);
          for (const tr of tris) {
            const cx = (tr[0][0] + tr[1][0] + tr[2][0]) / 3, cz = (tr[0][1] + tr[1][1] + tr[2][1]) / 3;
            if (Math.hypot(cx, cz) < 1.0) continue;   // (the hub)
            // shrink toward the centroid (the gaps), then lay it as three thin boxes' worth of panel: a filled triangle
            const s = 0.88, q = tr.map(([x, z]) => [cx + (x - cx) * s, cz + (z - cz) * s]);
            const yy = yc + 0.42 + 0.06 * hash(cx * 3.1 + cz);
            const v = [];
            for (const [x, z] of q) v.push(x, yy, z);
            const tri = new H.THREE.BufferGeometry();
            tri.setAttribute('position', new H.THREE.Float32BufferAttribute(v, 3));
            tri.setAttribute('normal', new H.THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
            tri.setAttribute('uv', new H.THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
            tri.setIndex([0, 2, 1, 0, 1, 2]);
            const dark = hash(cx * 1.7 + cz * 2.3) < 0.82;
            B.add('gloss', tri, dark ? mixc('#1f3356', '#2d4a78', hash(cx + cz * 7)) : '#bfe6ef', 0, 0, 0, { ao: false });
            // the panel's backing seen from below: a darker plate facing down
            const back = new H.THREE.BufferGeometry();
            back.setAttribute('position', new H.THREE.Float32BufferAttribute(v.map((c, i) => (i % 3 === 1 ? c - 0.05 : c)), 3));
            back.setAttribute('normal', new H.THREE.Float32BufferAttribute([0, -1, 0, 0, -1, 0, 0, -1, 0], 3));
            back.setAttribute('uv', new H.THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
            back.setIndex([0, 1, 2, 0, 2, 1]);
            B.add(NS('metal'), back, dark ? '#3c4a52' : '#9fc4cc', 0, 0, 0, { ao: false });
            // the panel's frame: its three edges as slim bars
            for (let e = 0; e < 3; e++) { const [ax, az] = q[e], [bx, bz] = q[(e + 1) % 3]; seg(B, NS('metal'), K.steelLt, [ax, yy - 0.02, az], [bx, yy - 0.02, bz], 0.05, 0.05); }
          }
        }
      }
      // ivy trailing from the rim (visual): a slim stem swaying down, small leaves along it
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * TAU + hash(k) * 0.3, r = Rr - 0.1, x = Math.cos(a) * r, z = Math.sin(a) * r, len = 0.9 + 1.4 * hash(k * 3.3);
        const pts = [];
        for (let j = 0; j <= 5; j++) { const t = j / 5; pts.push([x + Math.sin(t * 3 + k) * 0.12, yc + 0.15 - t * len, z + Math.cos(t * 2.5 + k) * 0.12]); }
        B.add(NS('foliage'), H.tubeGeo(pts, 0.018, 4), '#4f7d45', 0, 0, 0, {});
        for (let j = 1; j <= 5; j++) { const [px, py, pz] = pts[j]; B.add(NS('foliage'), blob(0, (k + j) % 8), j % 2 ? '#5d8f4f' : '#79a85e', px, py, pz, { sx: 0.09, sy: 0.05, sz: 0.07, ry: j, ao: false }); }
      }
      // the roof: off-limits (you slide off); three turned slabs cover the hexagon
      for (let k = 0; k < 3; k++) {
        const a = (k * PI) / 3;
        B.push(0, 0, 0, a);
        B.col(-Rr * 0.95, yc, -Rr * 0.5, Rr * 0.95, yc + 0.6, Rr * 0.5, ROOF);
        B.pop();
      }
    },
  };

  D.treehills_console = {
    desc: 'seed-bank console on the plaza (1.1 m): sloped terminal, lit screen, drawer fronts (cover)',
    build(B, o) {
      const w = o.w ?? 1.6, d = 0.7, h = 1.1;
      pbox(B, 'paint', K.modDk, w, h - 0.25, d, 0, (h - 0.25) / 2, 0);
      B.push(0, h - 0.25, 0.05, 0, -0.45);
      pbox(B, 'gloss', K.trim, w + 0.04, 0.08, d * 0.9, 0, 0.04, 0);
      pbox(B, 'glow', K.screen, w * 0.6, 0.02, d * 0.5, -w * 0.12, 0.09, 0.02, { glow: 1.0 });
      for (let k = 0; k < 4; k++) pbox(B, NS('gloss'), k % 2 ? K.yellow : K.red, 0.07, 0.03, 0.07, w * 0.28 + (k % 2) * 0.1, 0.1, -0.08 + Math.floor(k / 2) * 0.12);
      B.pop();
      for (let k = 0; k < 3; k++) {
        const x = -w / 2 + ((k + 0.5) * w) / 3;
        pbox(B, 'gloss', K.whiteSh, w / 3 - 0.08, 0.34, 0.03, x, 0.42, d / 2 + 0.015);
        pbox(B, NS('metal'), K.steelDk, 0.18, 0.04, 0.04, x, 0.52, d / 2 + 0.04);
        letters(B, 'S-' + (k + 1), { h: 0.06, x, y: 0.34, z: d / 2 + 0.035, c: K.modDk });
      }
      B.col(-w / 2, 0, -d / 2, w / 2, h, d / 2, ROOF);
    },
  };
}
