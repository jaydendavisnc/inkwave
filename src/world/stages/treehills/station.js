// Eco-Forest Treehills — the research stations and their kit: the station's dressing round the level's station block
// (façade, back module with the dish + balloon + mast, deck and stair railings), the greenhouse pod, the seed-bank
// kiosk, seed-bank crates, solar racks. The Alterna modular language: deep-green units with pale trims and chequer
// roofs, red valve wheels, round hatches, stencilled labels.
import { SP, T1, STATION } from './plan.js';

export function registerStation(D, H, T) {
  const { PI, TAU, HP, shade, mixc } = H;
  const { K, NS, pbox, ccyl, seg, colC, colSeg, ROOF, RAIL, letters, boardSign, railing, valve, latheGeo, extrudeGeo, tpl, hash, shrub, flowerBed } = T;

  // ------------------------------------------------------------------------------------------ shared parts
  // a flush door in a module wall (facing +Z at z), centred x, sill at y: frame, leaf with a porthole, a lit plate
  function door(B, x, y, z, o = {}) {
    const w = o.w ?? 1.1, h = o.h ?? 2.15;
    pbox(B, 'gloss', K.trim, w + 0.16, h + 0.08, 0.05, x, y + (h + 0.08) / 2, z + 0.025);
    pbox(B, 'gloss', o.c ?? K.whiteSh, w, h, 0.03, x, y + h / 2, z + 0.06);
    B.cyl('gloss', K.trim, 0.2, 0.03, x, y + h * 0.7, z + 0.08, { rx: HP, seg: 16 });
    B.cyl('gloss', K.glassDk, 0.15, 0.02, x, y + h * 0.7, z + 0.09, { rx: HP, seg: 16 });
    pbox(B, 'metal', K.steelDk, 0.04, 0.3, 0.05, x + w / 2 - 0.14, y + 1.0, z + 0.095);
    if (o.label) {
      boardSign(B, o.label, x, y + h + 0.3, { h: 0.12, z: z + 0.02, board: K.modDk, c: K.label, pad: 0.07 });
      pbox(B, 'glow', K.lamp, 0.3, 0.05, 0.05, x, y + h + 0.08, z + 0.1, { glow: 1.4 });
    }
  }
  // a window (facing +Z at z): pale frame, dark glass with a lit band (glows at dusk)
  function windowPane(B, x, y, z, w, h) {
    pbox(B, 'gloss', K.trim, w + 0.12, h + 0.12, 0.05, x, y, z + 0.025);
    pbox(B, 'gloss', K.glassDk, w, h, 0.03, x, y, z + 0.055);
    pbox(B, 'glow', K.screen, w * 0.94, h * 0.34, 0.01, x, y - h * 0.22, z + 0.072, { glow: 0.55 });
    pbox(B, NS('gloss'), K.trim, 0.05, h, 0.02, x, y, z + 0.075);
  }
  // a louvred vent (facing +Z)
  function vent(B, x, y, z, w = 0.8, h = 0.5) {
    pbox(B, 'metal', K.steel, w + 0.08, h + 0.08, 0.04, x, y, z + 0.02);
    for (let k = 0; k < 5; k++) pbox(B, NS('metal'), K.steelDk, w, 0.035, 0.05, x, y - h / 2 + ((k + 0.5) / 5) * h, z + 0.05, { rx: 0.5 });
  }
  // a pipe run along +X at height y, standing off a wall at z, with brackets
  function pipeRun(B, x0, x1, y, z, r = 0.06, c = K.steelLt) {
    seg(B, 'metal', c, [x0, y, z + r + 0.04], [x1, y, z + r + 0.04], r * 2, r * 2, { round: true, seg: 8 });
    for (let x = x0 + 0.3; x < x1 - 0.1; x += 1.2) pbox(B, NS('metal'), K.steelDk, 0.06, r * 2.4, r + 0.06, x, y, z + (r + 0.06) / 2);
  }
  // a module's vertical trim post (corner casting look) on a wall facing +Z
  function post(B, x, y0, y1, z) {
    pbox(B, 'gloss', K.trim, 0.16, y1 - y0, 0.06, x, (y0 + y1) / 2, z + 0.03);
    for (const y of [y0 + 0.12, y1 - 0.12]) pbox(B, NS('metal'), K.steelDk, 0.1, 0.1, 0.02, x, y, z + 0.065);
  }
  // module box (a free-standing unit: body, pale corner posts, chequer lid overhang) — w (x) × d (z) × h, base y0
  function unit(B, x, y0, z, w, d, h, o = {}) {
    const c = o.c ?? K.mod;
    pbox(B, 'paint', c, w, h, d, x, y0 + h / 2, z);
    // ribs (the container's corrugation) on the long faces
    for (let k = 1; k < Math.round(w / 0.5); k++) {
      const xx = x - w / 2 + (k * w) / Math.round(w / 0.5);
      for (const s of [-1, 1]) pbox(B, NS('paint'), shade(c, 1.08), 0.12, h - 0.3, 0.03, xx, y0 + h / 2, z + s * (d / 2 + 0.012));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pbox(B, 'gloss', K.trim, 0.14, h + 0.02, 0.14, x + sx * (w / 2 - 0.05), y0 + h / 2, z + sz * (d / 2 - 0.05));
    pbox(B, 'metal', K.plate, w + 0.12, 0.08, d + 0.12, x, y0 + h + 0.04, z);
    pbox(B, 'gloss', K.trim, w + 0.14, 0.1, 0.05, x, y0 + h - 0.02, z + d / 2 + 0.06);
    pbox(B, 'gloss', K.trim, w + 0.14, 0.1, 0.05, x, y0 + h - 0.02, z - d / 2 - 0.06);
  }
  // a stencilled number plate like the reference ("05") in a pale frame
  function numberPlate(B, str, x, y, z, h = 0.5) {
    boardSign(B, str, x, y, { h, z, board: K.modDk, c: K.label, pad: h * 0.35, border: K.trim, wt: 0.2 });
  }
  // a round blue badge (Alterna's circle logo): a ring, a swirl mark (facing +Z)
  function badge(B, x, y, z, r) {
    B.cyl('gloss', K.white, r * 1.12, 0.02, x, y, z, { rx: HP, seg: 24 });
    B.cyl('gloss', K.blue, r, 0.03, x, y, z + 0.005, { rx: HP, seg: 24 });
    B.tor(NS('gloss'), K.white, r * 0.62, r * 0.09, x, y, z + 0.022, { rs: 4, ts: 20, arc: PI * 1.4, rz: 0.4 });
    B.sph(NS('gloss'), K.white, r * 0.2, x + r * 0.2, y + r * 0.18, z + 0.02, { ws: 10, hs: 6, sz: 0.3 });
  }

  // ------------------------------------------------------------------------------------------ the station
  // Placed at the station block's centre (x 0, y 0, z −42.5): local body x ±9, z ±4.5 (front +Z = world −38), the base
  // terrace at y 1.3 round it, the deck (the spawn) at 3.9. Builds the façade on the level's block, the side stairs'
  // rails, the deck railing, the back module (off the deck, over the reservoir) with the dish, the mast, solar panels
  // and the float balloon on its tether.
  D.treehills_station = {
    desc: 'Alterna research station dressing (façades, rails, the back module with dish, mast, balloon)',
    build(B) {
      const W = (STATION.x1 - STATION.x0) / 2, Dd = (STATION.z1 - STATION.z0) / 2, zf = Dd, y0 = T1, y1 = SP;
      // ---- front façade (4 bays either side of the stair; the stair covers |x| < 3)
      for (const x of [-9, -6, -3, 3, 6, 9]) post(B, Math.max(-W + 0.08, Math.min(W - 0.08, x)), y0, y1 - 0.34, zf);
      pbox(B, 'gloss', K.trim, 2 * W + 0.1, 0.34, 0.08, 0, y1 - 0.17, zf + 0.04);   // the deck's fascia
      for (const s of [-1, 1]) {
        door(B, s * 4.5, y0, zf, { label: s < 0 ? 'LAB 07' : 'SEED BANK 05' });
        windowPane(B, s * 7.5, 2.75, zf, 1.9, 0.85);
        vent(B, s * 7.5, 1.75, zf, 1.1, 0.42);
        pipeRun(B, s > 0 ? 5.4 : -8.9, s > 0 ? 8.9 : -5.4, 1.58, zf, 0.05);
        valve(B, s * 6.1, 1.58, zf + 0.12, 0.14);
        B.blink('#ff5a4a', s * 8.6, y1 - 0.5, zf + 0.12, { size: 0.05, rate: 0.5, lo: 0.4, hi: 4 });
      }
      letters(B, 'ALTERNA · ECO-FOREST TREEHILLS', { h: 0.17, x: 0, y: y1 - 0.26, z: zf + 0.085, c: K.modDk, wt: 0.2 });
      // ---- side walls (behind the side stairs) and the back (over the reservoir)
      for (const s of [-1, 1]) {
        B.push(s * W, 0, 0, s * HP);
        for (const x of [-4.5, -1.5, 1.5, 4.5]) post(B, x, y0, y1 - 0.1, 0);
        pbox(B, 'gloss', K.trim, 2 * Dd, 0.3, 0.07, 0, y1 - 0.15, 0.035);
        B.pop();
      }
      B.push(0, 0, -Dd, PI);
      for (const x of [-9, -6, -3, 0, 3, 6, 9]) post(B, Math.max(-W + 0.08, Math.min(W - 0.08, x)), -1.5, y1 - 0.1, 0);
      pbox(B, 'gloss', K.trim, 2 * W, 0.3, 0.07, 0, y1 - 0.15, 0.035);
      for (const x of [-7.5, 7.5]) windowPane(B, x, 2.6, 0, 1.6, 0.8);
      pbox(B, 'paint', K.modDk, 2 * W + 0.2, 0.45, 0.2, 0, -1.45, 0.1);   // the plinth at the waterline
      B.pop();
      // ---- the deck: a railing along the back edge; the side stairs' outer rails over the reservoir
      railing(B, [-W - 3.8, y1, -Dd + 0.08], [W + 3.8, y1, -Dd + 0.08], { h: 1.05, kick: true });
      B.col(-W - 3.8, y1, -Dd, W + 3.8, y1 + 1.05, -Dd + 0.16, RAIL);
      for (const s of [-1, 1]) {
        const xr = s * 12.8, zTop = -4.4, zLow = 1.8;   // (world −46.9 … −40.7)
        railing(B, [xr, y1, zTop], [xr, y0, zLow], { h: 1.05, gap: 1.5 });
        for (let k = 0; k < 6; k++) {
          const za = zTop + ((zLow - zTop) * k) / 6, zb = zTop + ((zLow - zTop) * (k + 1)) / 6, ya = y1 + ((y0 - y1) * k) / 6;
          B.col(xr - 0.08, ya - 0.5, Math.min(za, zb), xr + 0.08, ya + 1.05, Math.max(za, zb), RAIL);
        }
      }
      // ---- the back module: a two-storey unit on stilts over the reservoir behind the deck (its top off-limits)
      const bz = -Dd - 2.05, bx = -1.4;
      for (const x of [-5.2, -1.4, 2.4]) for (const z of [bz - 1.4, bz + 1.4]) ccyl(B, 'metal', K.steelDk, 0.12, 3.2, x, -1.5, z, { seg: 8 });
      unit(B, bx, -0.1, bz, 8.4, 3.4, 3.9, { c: K.modDk });
      unit(B, bx, 3.8, bz, 8.4, 3.4, 2.6, { c: K.mod });
      B.col(bx - 4.2, -1.6, bz - 1.7, bx + 4.2, 6.5, bz + 1.7, ROOF);
      B.push(bx, 3.8, bz + 1.72);
      // the station's name board, read from across the meadow over the spawn deck
      boardSign(B, ['ECO-FOREST', 'TREEHILLS'], -0.35, 1.3, { h: 0.62, lead: 1.35, z: 0.02, board: K.modDk, c: K.label, border: K.trim, wt: 0.2, track: 0.14, w: 6.6 });
      badge(B, 3.55, 1.3, 0.04, 0.42);
      pbox(B, 'glow', K.lamp, 6.4, 0.04, 0.04, -0.35, 2.34, 0.1, { glow: 1.2 });
      B.pop();
      // solar panels on its roof (two tilted rows), a hatch, the mast with its blinking tip
      for (const k of [-1, 1]) {
        B.push(bx + k * 2.1, 6.5, bz - 0.6, 0, -0.35);
        pbox(B, 'metal', K.steelDk, 3.6, 0.06, 1.5, 0, 0.3, 0);
        pbox(B, 'gloss', '#24365a', 3.5, 0.04, 1.42, 0, 0.35, 0);
        for (let i = 1; i < 6; i++) pbox(B, NS('metal'), K.steelLt, 0.02, 0.045, 1.42, -1.75 + (i * 3.5) / 6, 0.355, 0);
        B.pop();
        ccyl(B, 'metal', K.steel, 0.04, 0.5, bx + k * 2.1, 6.75, bz - 1.1, { seg: 6 });
      }
      ccyl(B, 'metal', K.steelLt, 0.06, 6.5, bx - 3.7, 6.5 + 3.25, bz - 1.2, { seg: 8 });
      for (const y of [8.2, 9.6, 11]) seg(B, 'metal', K.steelLt, [bx - 3.7, 6.5 + y - 6.5, bz - 1.2], [bx - 3.0, 6.5 + y - 6.9, bz - 1.2], 0.03, 0.03, { round: true });
      B.blink('#ff4a3a', bx - 3.7, 13.1, bz - 1.2, { size: 0.09, rate: 0.7, lo: 0.3, hi: 6 });
      // ---- the dish on the back module's roof: white paraboloid facing the arena, the blue badge, feed horn
      {
        const dx = bx + 1.6, dy = 6.5, dzz = bz + 0.4;
        ccyl(B, 'metal', K.steelLt, 0.22, 1.0, dx, dy + 0.5, dzz, { seg: 10 });
        pbox(B, 'metal', K.steel, 0.7, 0.3, 0.7, dx, dy + 1.1, dzz);
        B.push(dx, dy + 2.4, dzz, 0.25, -0.6);
        const prof = []; for (let i = 0; i <= 10; i++) { const r = (i / 10) * 1.75; prof.push([r, (r * r) / 5.2]); }
        const dish = tpl('thdish', () => latheGeo([...prof, [1.8, 0.63], [1.8, 0.56], ...prof.slice().reverse().map(([r, y]) => [r * 0.98, y - 0.06])], 28));
        B.add('gloss', dish, K.white, 0, 0, 0, { rx: HP });
        B.push(0, 0, 0.12, 0, 0);
        badge(B, 0, 0, 0.02, 0.5);
        B.pop();
        for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.5; seg(B, 'metal', K.steelLt, [Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0.45], [0, 0, 1.55], 0.04, 0.04, { round: true }); }
        ccyl(B, 'gloss', K.whiteSh, 0.14, 0.35, 0, 0, 1.6, { rx: HP, seg: 10 });
        B.pop();
      }
      // ---- the float balloon: a pale-cyan survey balloon on its tether above the module (a navigation marker)
      {
        const tx = bx + 3.6, tz = bz - 1.2, hy = 17.5;
        ccyl(B, 'metal', K.steel, 0.12, 0.4, tx, 6.7, tz, { seg: 8 });
        seg(B, NS('metal'), K.steelDk, [tx, 6.9, tz], [tx + 0.6, hy - 1.3, tz + 0.4], 0.02, 0.02, { round: true, seg: 4 });
        B.sph('gloss', K.cyan, 1.25, tx + 0.6, hy, tz + 0.4, { ws: 20, hs: 14 });
        B.tor(NS('gloss'), K.white, 1.27, 0.05, tx + 0.6, hy, tz + 0.4, { rx: HP, rs: 4, ts: 24 });
        B.sph(NS('gloss'), K.cyanDk, 0.3, tx + 0.6, hy - 1.18, tz + 0.4, { ws: 10, hs: 6 });
      }
    },
  };

  // ------------------------------------------------------------------------------------------ greenhouse pod
  // half-cylinder glass greenhouse on a plinth (long axis local x, length L, radius R): arched ribs, the glass
  // (panes tinted by the plants pressed against them, some pale with the sky), white end walls with a round hatch
  // door and a number plate. Solid cover, its top off-limits.
  D.treehills_greenhouse = {
    desc: 'half-cylinder glass greenhouse pod (L × 2R, solid cover, slide-off top)',
    build(B, o) {
      const L = o.L ?? 6, R = o.R ?? 1.55, ph = 0.35, cy = ph;
      pbox(B, 'paint', K.modDk, L + 0.3, ph, 2 * R + 0.3, 0, ph / 2, 0);
      pbox(B, 'gloss', K.trim, L + 0.34, 0.06, 2 * R + 0.34, 0, ph, 0);
      // glass: n panes around × m along, shaded by what is behind (plants low, sky reflections high)
      const nA = 8, nL = Math.round(L / 1.0);
      for (let i = 0; i < nA; i++) {
        const a0 = (i / nA) * PI, a1 = ((i + 1) / nA) * PI, am = (a0 + a1) / 2;
        for (let j = 0; j < nL; j++) {
          const x = -L / 2 + ((j + 0.5) * L) / nL;
          const low = Math.sin(am) < 0.75, k = hash(i * 7 + j * 3 + (o.seed ?? 0));
          const c = low ? mixc('#4f7d58', '#6c9a6a', k) : mixc(K.glass, K.glassLt, k);
          B.push(x, cy, 0, 0, 0, 0);
          pbox(B, 'gloss', c, L / nL - 0.06, 0.03, R * (a1 - a0) - 0.05, 0, Math.sin(am) * (R - 0.02), Math.cos(am) * (R - 0.02), { rx: -am + HP });
          B.pop();
        }
      }
      // ribs (arches) + the ridge and eave rails
      for (let j = 0; j <= nL; j++) {
        const x = -L / 2 + (j * L) / nL;
        B.tor('gloss', K.trim, R, 0.045, x, cy, 0, { ry: HP, rs: 4, ts: 16, arc: PI });
      }
      for (const a of [0.02, PI / 2, PI - 0.02]) pbox(B, 'gloss', K.trim, L, 0.08, 0.08, 0, cy + Math.sin(a) * R, Math.cos(a) * R);
      // end walls: white half-discs with a round hatch door (one end) and a vent (the other)
      for (const s of [-1, 1]) {
        B.add('gloss', tpl('ghalf|' + R.toFixed(3), () => extrudeGeo(Array.from({ length: 19 }, (_, i) => { const a = (i / 18) * PI; return [Math.cos(a) * R, Math.sin(a) * R]; }), 0.08, 0.01)), K.white, s * (L / 2 + 0.02), cy, 0);
        B.push(s * (L / 2 + 0.07), cy, 0, s * HP);
        if (s > 0) {
          B.cyl('gloss', K.trimSh, 0.62, 0.05, 0, 0.7, 0, { rx: HP, seg: 20 });
          B.cyl('gloss', K.glassDk, 0.36, 0.06, 0, 0.8, 0.01, { rx: HP, seg: 16 });
          pbox(B, 'metal', K.steelDk, 0.26, 0.05, 0.05, 0.3, 0.55, 0.04);
          numberPlate(B, o.num ?? 'G-2', 0, 1.35, 0.01, 0.16);
        } else vent(B, 0, 0.8, 0, 0.9, 0.5);
        B.pop();
      }
      // the lower half of each end is below the arc (a solid plinth face) — the arc end discs cover y ≥ cy
      // plants visible over the end walls' top (a few fronds poking against the glass is enough)
      shrub(B, -L * 0.25, cy + 0.2, 0.3, 1.2, 11, '#5e8f52', { n: 3 });
      shrub(B, L * 0.2, cy + 0.2, -0.4, 1.1, 17, '#6a9a58', { n: 3 });
      B.col(-L / 2 - 0.15, 0, -R - 0.15, L / 2 + 0.15, cy + R, R + 0.15, ROOF);
    },
  };

  // ------------------------------------------------------------------------------------------ seed-bank kiosk
  // one module (w × d × h) in the garden: the Seed Bank's drop-off kiosk. Door + number plate on the front (+Z),
  // a hatch window on the side, a valve on the back; its roof off-limits.
  D.treehills_kiosk = {
    desc: 'seed-bank kiosk: one green module with a door, labels and valves (solid cover, slide-off top)',
    build(B, o) {
      const w = o.w ?? 2.6, d = o.d ?? 2.4, h = o.h ?? 2.5;
      unit(B, 0, 0, 0, w, d, h, { c: o.c ?? K.mod });
      door(B, -0.45, 0.02, d / 2 + 0.02, { w: 0.9, h: 2.0 });
      numberPlate(B, o.num ?? '05', 0.72, 1.75, d / 2 + 0.04, 0.34);
      boardSign(B, 'SEED BANK', 0.72, 1.28, { h: 0.1, z: d / 2 + 0.04, board: K.trim, c: K.modDk, pad: 0.06 });
      B.push(w / 2 + 0.02, 0, 0, HP);
      windowPane(B, 0, 1.55, 0, 1.2, 0.6);
      pbox(B, 'metal', K.plate, 1.4, 0.06, 0.3, 0, 1.18, 0.15);
      B.pop();
      B.push(0, 0, -d / 2 - 0.02, PI);
      pipeRun(B, -w / 2 + 0.1, w / 2 - 0.1, 0.55, 0, 0.05);
      valve(B, 0.3, 0.55, 0.12, 0.13);
      vent(B, -0.5, 1.6, 0, 0.8, 0.5);
      B.pop();
      B.push(-w / 2 - 0.02, 0, 0, -HP);
      badge(B, 0, 1.4, 0.02, 0.36);
      B.pop();
      B.col(-w / 2 - 0.08, 0, -d / 2 - 0.08, w / 2 + 0.08, h + 0.08, d / 2 + 0.08, ROOF);
    },
  };

  // ------------------------------------------------------------------------------------------ seed-bank crates
  // insulated seed crates (green body, white lid band, a label) stacked in a small group: n crates, 1.1 × 0.8 × 0.75
  D.treehills_crates = {
    desc: 'seed-bank crates: insulated green crates with white lids in a stack (cover)',
    build(B, o) {
      const n = o.n ?? 3, cw = 1.1, cd = 0.8, ch = 0.72;
      const at = [[0, 0, 0, 0], [cw + 0.08, 0, 0, 0.05], [cw * 0.5 + 0.04, ch, 0, -0.08], [0, 0, cd + 0.1, 0.1], [0.1, ch, cd + 0.1, 0.2]];
      const boxes = [];
      for (let i = 0; i < Math.min(n, at.length); i++) {
        const [x, y, z, r] = at[i];
        B.push(x, y, z, r);
        pbox(B, 'paint', i % 2 ? K.modLt : K.mod, cw, ch - 0.1, cd, 0, (ch - 0.1) / 2, 0);
        pbox(B, 'gloss', K.trim, cw + 0.04, 0.1, cd + 0.04, 0, ch - 0.05, 0);
        pbox(B, NS('paint'), K.label, 0.42, 0.16, 0.01, 0.12, 0.34, cd / 2 + 0.006);
        letters(B, 'SB-0' + (i + 3), { h: 0.07, x: 0.12, y: 0.31, z: cd / 2 + 0.012, c: K.modDk });
        for (const s of [-1, 1]) pbox(B, NS('metal'), K.steelDk, 0.18, 0.05, 0.05, s * (cw / 2 - 0.25), 0.5, cd / 2 + 0.02);
        B.pop();
        boxes.push([x, y, z]);
      }
      // colliders: the footprint of each tier (quarter-turn free)
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, top = 0;
      for (const [x, y, z] of boxes) { x0 = Math.min(x0, x - cw / 2); x1 = Math.max(x1, x + cw / 2); z0 = Math.min(z0, z - cd / 2); z1 = Math.max(z1, z + cd / 2); top = Math.max(top, y + ch); }
      const low = boxes.filter((b) => b[1] === 0);
      for (const [x, , z] of low) B.col(x - cw / 2, 0, z - cd / 2, x + cw / 2, ch, z + cd / 2);
      for (const [x, y, z] of boxes.filter((b) => b[1] > 0)) B.col(x - cw / 2, y, z - cd / 2, x + cw / 2, y + ch, z + cd / 2);
    },
  };

  // ------------------------------------------------------------------------------------------ solar rack (free-standing)
  D.treehills_solar = {
    desc: 'solar panel rack (two tilted panels on a steel frame, low cover)',
    build(B, o) {
      const w = o.w ?? 3.2;
      for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) { ccyl(B, 'metal', K.steelDk, 0.05, 0.9, x, 0.45, -0.4, { seg: 6 }); ccyl(B, 'metal', K.steelDk, 0.05, 0.45, x, 0.22, 0.4, { seg: 6 }); }
      B.push(0, 0.72, 0, 0, -0.5);
      pbox(B, 'metal', K.steel, w, 0.06, 1.2, 0, 0, 0);
      pbox(B, 'gloss', '#24365a', w - 0.1, 0.04, 1.12, 0, 0.04, 0);
      for (let i = 1; i < 5; i++) pbox(B, NS('metal'), K.steelLt, 0.02, 0.045, 1.12, -w / 2 + (i * w) / 5, 0.045, 0);
      B.pop();
      B.col(-w / 2, 0, -0.55, w / 2, 1.05, 0.55);
    },
  };
}
