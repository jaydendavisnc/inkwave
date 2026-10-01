// Cargo Terminal — stage decals / signage for the mural atlas (see src/world/murals.js; drawn when the stage loads).
//
// drawMurals(g, R, kit) draws into the stage region R = { x, y, w, h } (2048 x 1008 px) and returns the table for mural
// ids 4…11:  { id, x, y, w, h, place: [x0, xLen, y0, yLen], fx: [weather, chip] }.
//
// Ground markings live on the tops of the layout's ground slabs (layout.js). A top face has u = −x, v = +z, origin at
// the slab's (maxX, minZ) corner, so the canvas reads as seen by an Alpha player at the base looking toward mid. The
// mirrored (Bravo) slab samples the same canvas turned 180° in its own frame — so every slab drawing here is made
// point-symmetric about the slab centre: each feature is drawn in Alpha world metres and again turned 180°
// (its twin lands under boxes / buildings, or is the marking the other half needs anyway).
// (All in the berth's LOCAL frame — layout.js turns the slabs 35°; a turned slab's top face keeps the same u / v.)
// The Long Stages stretch (layout.js STRETCH) carried the lane and yard slabs on through the slice to the moved base
// apron (z −54.6 … −7): their centres now sit close to the cut, so each feature of the old section has its twin in the
// slice and the other way round — the drawings below keep that in mind (the lane's zebra doubles across the cut,
// Block 4A's slot rows repeat under Block 4B, the power strip's twin is the RTG runway's keep-clear edge; slice
// features whose twins would show in the old section are left out).
//   4  Block 4A / 4B yard slab (x 6 … 16.16, z −54.6 … −7): slot outlines, block boundary, RTG 41's runway
//   5  truck lane slab (x −6 … 6, z −54.6 … −7): yellow edges, dashed centre, arrows, 20 km/h roundels, crossings
//   6  apron slabs (7.84 × 64, both flanks): quay edge line + walkway bands (symmetric in u as well: the two Alpha
//      aprons see the canvas mirrored to each other)
//   7  base slab (x ±16.16, z −47.4 … −31.6 as drawn; moved out with the base): zebra crossing at the ops stair,
//      walkway band, stop lines at the gate
//   8  reefer block slab (x −16.16 … −6): slot ends, alley walkway
//   9  KRAKEN LINES (40' long sides)  10  TIDEBANK (40')
//   11 the Landing (single slab x ±16.16, z ±7, drawn once): the round crane working zone, KEEP CLEAR, box slots,
//      4A / R2 block ids for both teams
const PI = Math.PI;

function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Text in the current transform: centred at (x, y), `size` = cap height, reading along +x (rotate the frame first)
function stencil(g, str, x, y, size, color, { weight = 800, spacing = 0.06, family = 'Rubik', align = 'center' } = {}) {
  g.save();
  g.translate(x, y);
  g.scale(size / 100, size / 100);
  g.font = `${weight} 138px ${family}, "Arial Black", sans-serif`;
  g.textBaseline = 'alphabetic';
  g.fillStyle = color;
  if ('letterSpacing' in g) g.letterSpacing = `${spacing * 100}px`;
  const w = g.measureText(str).width;
  g.fillText(str, align === 'center' ? -w / 2 : align === 'right' ? -w : 0, 50);
  g.restore();
  return w * size / 100;
}
// knock random flecks + soft scuffs out of whatever was painted in rect r (paint worn by tyres and boots)
function wear(g, r, { flecks = 2600, fleck = [0.6, 2.4], scuffs = 60, scuff = [6, 22], seed = 1 } = {}) {
  const R = rng(seed);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < flecks; i++) {
    const x = r.x + R() * r.w, y = r.y + R() * r.h, rad = fleck[0] + R() * R() * (fleck[1] - fleck[0]);
    g.fillStyle = `rgba(0,0,0,${0.35 + 0.65 * R()})`;
    g.beginPath(); g.ellipse(x, y, rad * (0.6 + R()), rad * (0.6 + R()), R() * PI, 0, PI * 2); g.fill();
  }
  for (let i = 0; i < scuffs; i++) {
    const x = r.x + R() * r.w, y = r.y + R() * r.h, rad = scuff[0] + R() * (scuff[1] - scuff[0]);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(0,0,0,${0.25 + 0.3 * R()})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.restore();
}

const WHITE = 'rgba(238,236,228,0.86)', YELLOW = 'rgba(232,184,58,0.9)', GREEN = 'rgba(88,150,96,0.82)', DARK = 'rgba(30,32,36,0.2)';

// Draw on a ground slab in Alpha world metres: `slab` = { minX, maxX, minZ, maxZ }, `r` = canvas rect. fn(g, s) is
// called twice: s = 1 (as placed) and s = −1 (turned 180° about the slab centre).
function onSlab(g, r, slab, fn) {
  const sx = r.w / (slab.maxX - slab.minX), sz = r.h / (slab.maxZ - slab.minZ);
  const cx = (slab.minX + slab.maxX) / 2, cz = (slab.minZ + slab.maxZ) / 2;
  g.save();
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  for (const s of [1, -1]) {
    // canvas x = r.x + (maxX − x)·sx, canvas y = r.y + r.h − (z − minZ)·sz; the twin maps (x, z) → (2cx − x, 2cz − z)
    g.setTransform(-sx, 0, 0, -sz, r.x + slab.maxX * sx, r.y + r.h + slab.minZ * sz);
    if (s < 0) g.transform(-1, 0, 0, -1, 2 * cx, 2 * cz);
    fn(g, s);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.restore();
}
// text on the ground, readable by someone standing at −Z looking toward +Z (the Alpha player's view), cap height h
function groundText(g, str, x, z, h, color, o = {}) {
  g.save(); g.translate(x, z); g.rotate(PI + (o.rot ?? 0)); stencil(g, str, 0, h / 2, h, color, o); g.restore();
}
// arrow on the ground pointing +Z (toward mid) with its tail at (x, z)
function arrowZ(g, x, z, len, color, dir = 1) {
  const sw = 0.34, hw = 0.95, hl = 0.8;
  g.save(); g.translate(x, z); g.scale(1, dir);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(-sw / 2, 0); g.lineTo(-sw / 2, len - hl); g.lineTo(-hw / 2, len - hl); g.lineTo(0, len); g.lineTo(hw / 2, len - hl); g.lineTo(sw / 2, len - hl); g.lineTo(sw / 2, 0);
  g.closePath(); g.fill();
  g.restore();
}
function hatchBox(g, x0, z0, x1, z1, color, pitch = 0.45, lw = 0.12) {
  g.save();
  g.beginPath(); g.rect(x0, z0, x1 - x0, z1 - z0); g.clip();
  g.strokeStyle = color; g.lineWidth = lw;
  const d = Math.abs(z1 - z0);
  for (let t = -d - 1; t < x1 - x0 + 1; t += pitch) { g.beginPath(); g.moveTo(x0 + t, z0); g.lineTo(x0 + t + (z1 - z0), z1); g.stroke(); }
  g.restore();
  g.strokeStyle = color; g.lineWidth = 0.1;
  g.strokeRect(x0 + 0.05, z0 + 0.05, x1 - x0 - 0.1, z1 - z0 - 0.1);
}
// container-slot outline (rectangle with open corners), x0..x1 × z0..z1, line width w
function slotOutline(g, x0, z0, x1, z1, color, w = 0.1, gap = 0.35) {
  g.fillStyle = color;
  g.fillRect(x0 + gap, z0, x1 - x0 - 2 * gap, w); g.fillRect(x0 + gap, z1 - w, x1 - x0 - 2 * gap, w);
  g.fillRect(x0, z0 + gap, w, z1 - z0 - 2 * gap); g.fillRect(x1 - w, z0 + gap, w, z1 - z0 - 2 * gap);
  // corner Ls
  for (const [cx, cz, dx, dz] of [[x0, z0, 1, 1], [x1, z0, -1, 1], [x1, z1, -1, -1], [x0, z1, 1, -1]]) {
    g.fillRect(Math.min(cx, cx + dx * 0.25), Math.min(cz, cz + dz * w), 0.25, w);
    g.fillRect(Math.min(cx, cx + dx * w), Math.min(cz, cz + dz * 0.25), w, 0.25);
  }
}
function roundel(g, x, z, R, txt) {
  g.save(); g.translate(x, z); g.rotate(PI);
  g.fillStyle = 'rgba(232,236,232,0.85)'; g.beginPath(); g.arc(0, 0, R, 0, PI * 2); g.fill();
  g.strokeStyle = 'rgba(190,62,52,0.9)'; g.lineWidth = R * 0.18; g.beginPath(); g.arc(0, 0, R * 0.88, 0, PI * 2); g.stroke();
  stencil(g, txt, 0, R * 0.36, R * 0.8, 'rgba(34,36,40,0.9)', { spacing: 0.02 });
  g.restore();
}

export function drawMurals(g, R, kit) {
  const out = [];
  const rect = (x, y, w, h) => ({ x: R.x + x, y: R.y + y, w, h });

  // ---------------------------------------------------------------- 4: Block 4A slab (tarmac)
  {
    const r = rect(0, 0, 280, 1008), slab = { minX: 6.0, maxX: 16.16, minZ: -54.6, maxZ: -7 };
    onSlab(g, r, slab, (g) => {
      // block boundary: yellow lines along the lane + apron edges
      g.fillStyle = YELLOW;
      for (const x of [6.12, 16.04]) g.fillRect(x - 0.06, -31.5, 0.12, 24.4);
      // slot outlines: rows 0–2 × four 20' slots (6.15 m) from the base end (row 3's lie under its wall; its twin strip is
      // RTG 41's runway in the slice — the others' twins fall under Block 4B and in cross aisle C)
      for (let k = 0; k < 4; k++) for (let r0 = 0; r0 < 3; r0++) slotOutline(g, 6.0 + r0 * 2.54 + 0.1, -31.6 + k * 6.15 + 0.1, 6.0 + (r0 + 1) * 2.54 - 0.1, -31.6 + (k + 1) * 6.15 - 0.1, WHITE, 0.09);
      // RTG 41's runway beside the lane (row 0's strip in the slice): tyre track lines, hatched stop ends, its number
      // (twins under 4A's row-3 wall)
      for (const x of [6.3, 8.3]) g.fillRect(x - 0.07, -54.4, 0.14, 17.2);
      for (const z of [-47.4, -37.8]) hatchBox(g, 6.4, z - 0.5, 8.2, z + 0.5, YELLOW, 0.4, 0.1);
      groundText(g, 'RTG 41', 7.3, -51.6, 0.5, YELLOW, { rot: -PI / 2 });
    });
    wear(g, r, { flecks: 3400, scuffs: 70, seed: 41 });
    out.push({ id: 4, ...r, place: [0, 10.16, 0, 47.6], fx: [0.9, 1] });
  }
  // ---------------------------------------------------------------- 8: Reefer block slab (tarmac)
  {
    const r = rect(280, 0, 280, 1008), slab = { minX: -16.16, maxX: -6.0, minZ: -54.6, maxZ: -7 };
    onSlab(g, r, slab, (g) => {
      g.fillStyle = YELLOW;
      for (const x of [-6.12, -16.04]) g.fillRect(x - 0.06, -31.5, 0.12, 24.4);
      // slot ends across the rows, every 6.15 m
      g.fillStyle = WHITE;
      for (let k = 0; k <= 4; k++) g.fillRect(-15.9, -31.6 + k * 6.15 - 0.05 + (k === 0 ? 0.12 : k === 4 ? -0.12 : 0), 9.8, 0.1);
      // the alley under the catwalk: green pedestrian walkway with white edges (x −10.44 … −8.44)
      g.fillStyle = 'rgba(88,150,96,0.55)'; g.fillRect(-10.2, -31.4, 1.5, 24.2);
      g.fillStyle = WHITE; for (const x of [-10.26, -8.62]) g.fillRect(x - 0.04, -31.4, 0.08, 24.2);
      for (let z = -29; z < -8; z += 5) groundText(g, 'WALK', -9.45, z, 0.32, 'rgba(238,236,228,0.75)');
      // power strip along the apron edge: hatched keep-clear (its twin: the keep-clear edge of RTG 41's runway)
      hatchBox(g, -16.1, -30.5, -15.45, -8, YELLOW, 0.5, 0.1);
      // RTG 41's runway on this side (twins under R2's row 2)
      g.fillStyle = YELLOW;
      for (const x of [-8.3, -6.3]) g.fillRect(x - 0.07, -54.4, 0.14, 17.2);
      for (const z of [-47.4, -37.8]) hatchBox(g, -8.2, z - 0.5, -6.4, z + 0.5, YELLOW, 0.4, 0.1);
    });
    wear(g, r, { flecks: 3400, scuffs: 70, seed: 43 });
    out.push({ id: 8, ...r, place: [0, 10.16, 0, 47.6], fx: [0.9, 1] });
  }
  // ---------------------------------------------------------------- 5: truck lane slab (tarmac)
  {
    const r = rect(560, 0, 340, 1008), slab = { minX: -6, maxX: 6, minZ: -54.6, maxZ: -7 };
    onSlab(g, r, slab, (g) => {
      // tyre polish in the two running lanes
      g.fillStyle = DARK;
      for (const x of [-4.1, -1.9, 1.9, 4.1]) g.fillRect(x - 0.3, -31.6, 0.6, 24.6);
      // yellow edge lines, white dashed centre line (3 m dash / 3 m gap)
      g.fillStyle = YELLOW;
      for (const x of [-5.7, 5.7]) g.fillRect(x - 0.08, -31.6, 0.16, 24.6);
      g.fillStyle = WHITE;
      for (let z = -28.3; z < -7; z += 6) g.fillRect(-0.07, z, 0.14, 3);
      // the lane to the player's right runs toward mid: arrow + 20 km/h roundel (the twins serve the other lane — the
      // arrow's beside the transfer platform in the slice, the roundel at its stair foot in cross aisle C)
      arrowZ(g, -4.4, -22.5, 4.2, WHITE);
      roundel(g, -3.4, -27.4, 1.0, '20');
      // pedestrian crossing at the base end
      for (let x = -5.2; x < 5.3; x += 0.9) g.fillRect(x, -31.2, 0.5, 2.4);
    });
    wear(g, r, { flecks: 5600, scuffs: 120, seed: 45 });
    out.push({ id: 5, ...r, place: [0, 12, 0, 47.6], fx: [0.9, 1] });
  }
  // ---------------------------------------------------------------- 6: apron slabs (quay concrete)
  {
    const r = rect(900, 0, 160, 1008), slab = { minX: 16.16, maxX: 24, minZ: -64, maxZ: 0 };
    onSlab(g, r, slab, (g) => {
      // mirrored in u too (the two Alpha aprons read the canvas mirrored): every feature has an x-twin
      for (const m of [1, -1]) {
        const X = (x) => (m > 0 ? x : 40.16 - x);
        // quay edge line (yellow) + white safety line 1 m in
        g.fillStyle = YELLOW; g.fillRect(Math.min(X(23.55), X(23.75)), -63.9, 0.2, 63.8);
        g.fillStyle = WHITE;
        for (let z = -63.4; z < -0.5; z += 2.5) g.fillRect(Math.min(X(22.7), X(22.82)), z, 0.12, 1.5);
      }
      // crane parking marks: hatched boxes where the crane's bogies stop (both ends, mid side)
      hatchBox(g, 17.6, -2.4, 18.6, -0.2, YELLOW, 0.4, 0.1);
      hatchBox(g, 21.56, -2.4, 22.56, -0.2, YELLOW, 0.4, 0.1);
    });
    wear(g, r, { flecks: 3100, scuffs: 60, seed: 47 });
    out.push({ id: 6, ...r, place: [0, 7.84, 0, 64], fx: [0.9, 1] });
  }
  // ---------------------------------------------------------------- 7: base slab (quay concrete)
  {
    const r = rect(1060, 0, 840, 410), slab = { minX: -16.16, maxX: 16.16, minZ: -47.4, maxZ: -31.6 };   // (drawn where it stood: the slab moved as a whole)
    onSlab(g, r, slab, (g) => {
      // zebra crossing across the base aisle at the foot of the ops stair, walkway band along the building front
      g.fillStyle = WHITE;
      for (let x = -5.6; x < 5.7; x += 0.9) g.fillRect(x, -34.2, 0.5, 2.3);
      g.fillStyle = 'rgba(88,150,96,0.6)'; g.fillRect(-9, -39.2, 18, 0.9);
      g.fillStyle = WHITE; g.fillRect(-9, -38.35, 18, 0.08);
      // stop lines + GATE lane arrows (the twins land in the reefer corner as its own lane markings)
      g.fillStyle = WHITE;
      for (const [x0, x1] of [[9.2, 12.3], [14.5, 16.1]]) g.fillRect(x0, -38.9, x1 - x0, 0.3);
      arrowZ(g, 10.8, -36.2, 2.6, WHITE, -1);
      groundText(g, 'OUT', 10.8, -37.4, 0.45, WHITE);
      // aisle edge lines (yellow) along the stack fronts
      g.fillStyle = YELLOW;
      g.fillRect(6.1, -31.95, 10, 0.12); g.fillRect(-16.1, -31.95, 10, 0.12);
      groundText(g, 'BERTH 4', 0, -36.9, 0.8, YELLOW, { weight: 900 });
    });
    wear(g, r, { flecks: 3000, scuffs: 60, seed: 49 });
    out.push({ id: 7, ...r, place: [0, 32.32, 0, 15.8], fx: [0.9, 1] });
  }
  // ---------------------------------------------------------------- 9–11: shipping-line logos on container sides
  // Placed on the long sides, 1.25 m high band; 40' logos centred on a 12.19 m side, the 20' one on a 6.06 m side.
  const logo = (id, x, y, w, h, place, draw) => {
    const r = rect(x, y, w, h);
    g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip(); g.translate(r.x, r.y); draw(g, w, h); g.restore();
    wear(g, r, { flecks: 900, fleck: [0.6, 2.0], scuffs: 18, scuff: [8, 24], seed: id * 7 });
    out.push({ id, ...r, place, fx: [0.8, 1] });
  };
  const cream = 'rgba(244,240,230,0.94)';
  logo(9, 1060, 420, 600, 150, [2.3, 7.6, 0.6, 1.9], (g, w, h) => {
    // KRAKEN LINES: a squid roundel + wordmark
    g.fillStyle = cream; g.beginPath(); g.arc(70, h / 2, 58, 0, PI * 2); g.fill();
    kit.squid(g, 70, h / 2 + 12, 0.78, 'rgba(60,70,90,0.9)', cream);
    g.save(); g.translate(145, 0);
    g.font = `${kit.fontB ? '' : ''}900 92px Rubik, "Arial Black", sans-serif`; g.fillStyle = cream; g.textBaseline = 'alphabetic';
    if ('letterSpacing' in g) g.letterSpacing = '6px';
    g.fillText('KRAKEN', 0, 96);
    g.font = '800 34px Rubik, "Arial Black", sans-serif'; if ('letterSpacing' in g) g.letterSpacing = '14px';
    g.fillText('LINES', 6, 138);
    g.restore();
  });
  logo(10, 1060, 580, 600, 150, [2.3, 7.6, 0.55, 1.9], (g, w, h) => {
    // TIDEBANK: wave swoosh + italic wordmark
    g.strokeStyle = cream; g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); for (let i = 0; i <= 30; i++) { const x = 20 + i * 4, y = 88 + Math.sin(i / 30 * PI * 2) * 22; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
    g.beginPath(); for (let i = 0; i <= 30; i++) { const x = 20 + i * 4, y = 122 + Math.sin(i / 30 * PI * 2 + 0.6) * 16; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
    g.save(); g.translate(160, 118); g.transform(1, 0, -0.18, 1, 0, 0);
    g.font = '900 96px Rubik, "Arial Black", sans-serif'; g.fillStyle = cream; if ('letterSpacing' in g) g.letterSpacing = '4px';
    g.fillText('TIDEBANK', 0, 0);
    g.restore();
  });
  // ---------------------------------------------------------------- 11: the Landing (single slab, drawn once)
  {
    const r = rect(1060, 740, 988, 268), sl = { minX: -16.16, maxX: 16.16, minZ: -7, maxZ: 7 };
    const sx = r.w / (sl.maxX - sl.minX), sz = r.h / (sl.maxZ - sl.minZ);
    g.save();
    g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    g.setTransform(-sx, 0, 0, -sz, r.x + sl.maxX * sx, r.y + r.h + sl.minZ * sz);
    // tyre polish where the lane runs through + the lane's yellow edges up to the working circle
    g.fillStyle = DARK;
    for (const x of [-4.1, -1.9, 1.9, 4.1]) g.fillRect(x - 0.3, -7, 0.6, 14);
    // the crane working zone: a hatched yellow ring round the landing, KEEP CLEAR both ways
    g.strokeStyle = YELLOW; g.lineWidth = 0.22;
    g.beginPath(); g.arc(0, 0, 6.75, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 0.1; g.beginPath(); g.arc(0, 0, 6.2, 0, Math.PI * 2); g.stroke();
    g.save(); g.beginPath(); g.arc(0, 0, 6.72, 0, Math.PI * 2); g.arc(0, 0, 6.24, 0, Math.PI * 2, true); g.clip('evenodd');
    g.lineWidth = 0.14; for (let a = 0; a < Math.PI * 2; a += Math.PI / 36) { g.beginPath(); g.moveTo(Math.cos(a) * 6.1, Math.sin(a) * 6.1); g.lineTo(Math.cos(a + 0.09) * 6.9, Math.sin(a + 0.09) * 6.9); g.stroke(); }
    g.restore();
    for (const s2 of [1, -1]) {
      g.save(); g.scale(s2, s2);
      groundText(g, 'K7 · KEEP CLEAR', 0, -6.05, 0.34, YELLOW);
      // box slots where the crane lands boxes beside the hatch covers (one each side, as the blue 20' shows)
      slotOutline(g, 9.9, -3.5, 16.16, -0.86, WHITE, 0.09);
      // block ids at the stacks' mid ends, read from each team's own base
      groundText(g, '4A', 11.08, -5.4, 1.2, YELLOW, { weight: 900 });
      groundText(g, 'R2', -11.1, -5.4, 1.2, YELLOW, { weight: 900 });
      for (let r0 = 0; r0 < 4; r0++) groundText(g, String(r0 + 1).padStart(2, '0'), 7.27 + r0 * 2.54, -6.55, 0.36, WHITE);
      g.restore();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.restore();
    wear(g, r, { flecks: 1600, scuffs: 30, seed: 51 });
    out.push({ id: 11, ...r, place: [0, 32.32, 0, 14], fx: [0.9, 1] });
  }
  return out;
}
