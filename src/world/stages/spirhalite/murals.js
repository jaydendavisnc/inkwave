// Spirhalite Islands — stage decals / signage for the mural atlas (mural ids 4…11; see src/world/murals.js).
//
// drawMurals(g, R, kit) draws into the stage region R = { x, y, w, h } (2048 x 1008 px) and returns the table
// { id, x, y, w, h, place: [x0, xLen, y0, yLen], fx: [weather, chip] }. A top face has u = −x, v = +z (canvas x → −x,
// canvas up → +z), origin at its (maxX, minZ) corner; a wall has u = v × n (text reads left → right seen from outside),
// v up. A mirrored (Bravo) piece samples the same canvas turned 180° in its own frame, so the drawings on half pieces are
// point-symmetric where it matters.
//   4  the central sandbar under the arch (single slab 12 x 8 m): damp drip marks along the arch's line, puddle rings
//   5  the causeway's top (4.2 x 16 m): a worn band of carved spiral glyphs down its middle
//   6  the causeway's long sides: a frieze of glyph roundels along the top course
//   7  the helipad deck's front arm (4.52 x 3.19 m): SPIRHALITE / DC-1 in stencil, Deep Cut's badge
//   8  the camp's sign board (2.6 x 1.1 m): SPIRHALITE ISLANDS · DEEP CUT EXPEDITION · BASE CAMP
//   10 the pillar plinths' faces (2.14 x 1.3 m): a carved band of roundels and chevrons
const PI = Math.PI;
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Deep Cut's badge (an original mark): a dusk-purple roundel, a gold eel-wave across it, a fin cutting the wave
export function deepCutBadge(g, cx, cy, r, { ring = '#3d3466', gold = '#e0b640', ink = '#22222e', cream = '#f4ecd8' } = {}) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = ink; g.beginPath(); g.arc(0, 0, r, 0, PI * 2); g.fill();
  g.fillStyle = ring; g.beginPath(); g.arc(0, 0, r * 0.88, 0, PI * 2); g.fill();
  g.save(); g.beginPath(); g.arc(0, 0, r * 0.88, 0, PI * 2); g.clip();
  g.strokeStyle = gold; g.lineWidth = r * 0.2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-r, r * 0.25);
  g.bezierCurveTo(-r * 0.45, -r * 0.35, -r * 0.05, r * 0.55, r * 0.35, r * 0.05); g.bezierCurveTo(r * 0.55, -r * 0.18, r * 0.8, -r * 0.1, r, -r * 0.2); g.stroke();
  g.fillStyle = cream; g.beginPath(); g.moveTo(-r * 0.2, r * 0.12); g.quadraticCurveTo(-r * 0.05, -r * 0.62, r * 0.28, -r * 0.62); g.quadraticCurveTo(r * 0.02, -r * 0.3, r * 0.12, r * 0.05); g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = gold; g.lineWidth = r * 0.05; g.beginPath(); g.arc(0, 0, r * 0.94, 0, PI * 2); g.stroke();
  g.restore();
}
function text(g, str, x, y, px, color, { font = 'Rubik', weight = 800, align = 'center', spacing = 0.06, stroke = null, sw = 0, maxW = 0 } = {}) {
  g.save();
  const set = (p) => { g.font = `${weight} ${p}px ${font}, "Arial Black", sans-serif`; if ('letterSpacing' in g) g.letterSpacing = `${spacing * p}px`; };
  set(px);
  if (maxW) while (px > 8 && g.measureText(str).width > maxW) set(--px);
  g.textAlign = align; g.textBaseline = 'middle';
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = sw; g.lineJoin = 'round'; g.strokeText(str, x, y); }
  g.fillStyle = color; g.fillText(str, x, y);
  g.restore();
}
// knock flecks + scuffs out of what was painted in rect r (weathered paint)
function wear(g, r, seed, n = 900) {
  const R = rng(seed);
  g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) { const x = r.x + R() * r.w, y = r.y + R() * r.h, s = 0.6 + R() * R() * 3; g.fillStyle = `rgba(0,0,0,${0.3 + 0.6 * R()})`; g.beginPath(); g.ellipse(x, y, s, s * (0.5 + R()), R() * PI, 0, PI * 2); g.fill(); }
  g.restore();
}
// a carved spiral glyph (eroded strokes)
function glyph(g, cx, cy, s, R, col) {
  g.save(); g.translate(cx, cy); g.strokeStyle = col; g.lineCap = 'round';
  const k = Math.floor(R() * 4);
  g.lineWidth = s * 0.11;
  g.beginPath(); g.arc(0, 0, s * 0.48, 0, PI * 2); g.stroke();
  g.beginPath();
  if (k === 0) { for (let a = 0; a < PI * 4; a += 0.2) { const r = s * 0.05 + (a / (PI * 4)) * s * 0.36; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } }
  else if (k === 1) { g.moveTo(-s * 0.3, s * 0.2); g.lineTo(0, -s * 0.3); g.lineTo(s * 0.3, s * 0.2); g.moveTo(-s * 0.15, s * 0.25); g.lineTo(s * 0.15, s * 0.25); }
  else if (k === 2) { g.arc(0, 0, s * 0.22, 0, PI * 2); g.moveTo(-s * 0.36, 0); g.lineTo(s * 0.36, 0); }
  else { g.moveTo(-s * 0.28, -s * 0.2); g.quadraticCurveTo(0, s * 0.4, s * 0.28, -s * 0.2); g.moveTo(0, -s * 0.3); g.lineTo(0, s * 0.1); }
  g.stroke(); g.restore();
}

export function drawMurals(g, R) {
  const out = [];
  const X = R.x, Y = R.y;

  // ---- 4: central sandbar (12 x 8 m at 40 px/m): damp marks under the arch's line, drawn point-symmetric
  {
    const r = { x: X, y: Y, w: 480, h: 320 }, s = 40, R0 = rng(41);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, ang = Math.atan2(14.2, 21.8);   // the arch's axis on the slab (canvas: x → −x, up → +z)
    const blot = (u, v, rad, a) => { const gr = g.createRadialGradient(u, v, 0, u, v, rad); gr.addColorStop(0, `rgba(96,84,66,${a})`); gr.addColorStop(1, 'rgba(96,84,66,0)'); g.fillStyle = gr; g.fillRect(u - rad, v - rad, rad * 2, rad * 2); };
    g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    for (let i = 0; i < 70; i++) {
      const t = (R0() - 0.5) * 16, off = (R0() - 0.5) * 3.4, rad = (0.2 + R0() * 0.7) * s, a = 0.08 + R0() * 0.14;
      // arch axis in world: along (cos, −sin) · t across (sin, cos) · off; canvas u = −x, v(up) = z
      const wx = Math.cos(ang) * t + Math.sin(ang) * off, wz = -Math.sin(ang) * t + Math.cos(ang) * off;
      for (const sg of [1, -1]) blot(cx - sg * wx * s, cy - sg * wz * s, rad, a);
    }
    g.strokeStyle = 'rgba(120,110,95,0.35)'; g.lineWidth = 1.6;
    for (let i = 0; i < 14; i++) {
      const t = (R0() - 0.5) * 12, wx = Math.cos(ang) * t, wz = -Math.sin(ang) * t, rr = (0.12 + R0() * 0.2) * s;
      for (const sg of [1, -1]) { g.beginPath(); g.ellipse(cx - sg * wx * s, cy - sg * wz * s, rr, rr * 0.8, 0, 0, PI * 2); g.stroke(); }
    }
    g.restore();
    out.push({ id: 4, ...r, place: [0, 12, 0, 8], fx: [0.4, 0] });
  }
  // ---- 5: causeway top (4.2 x 16 m at 28 px/m): a worn band of carved glyphs down its middle (point-symmetric)
  {
    const r = { x: X + 1050, y: Y, w: 118, h: 448 }, s = 28, R0 = rng(55);
    g.strokeStyle = 'rgba(70,66,58,0.55)'; g.lineWidth = 2;
    for (const e of [-0.95, 0.95]) { g.beginPath(); g.moveTo(r.x + r.w / 2 + e * s, r.y + 6); g.lineTo(r.x + r.w / 2 + e * s, r.y + r.h - 6); g.stroke(); }
    for (let i = 0; i < 10; i++) { const v = r.y + 22 + i * ((r.h - 44) / 9); glyph(g, r.x + r.w / 2, v, s * 1.2, R0, 'rgba(70,66,58,0.6)'); }
    wear(g, r, 57, 600);
    out.push({ id: 5, ...r, place: [0, 4.2, 0, 16], fx: [0.9, 1] });
  }
  // ---- 6: causeway sides (a frieze along the top course: 16 x 0.8 m at 40 px/m)
  {
    const r = { x: X + 1180, y: Y, w: 640, h: 32 }, s = 40, R0 = rng(66);
    g.strokeStyle = 'rgba(64,60,54,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(r.x, r.y + 2); g.lineTo(r.x + r.w, r.y + 2); g.moveTo(r.x, r.y + r.h - 2); g.lineTo(r.x + r.w, r.y + r.h - 2); g.stroke();
    for (let i = 0; i < 20; i++) glyph(g, r.x + 16 + i * 32, r.y + r.h / 2, 24, R0, 'rgba(64,60,54,0.55)');
    wear(g, r, 67, 700);
    out.push({ id: 6, ...r, place: [0, 16, 2.75, 0.8], fx: [0.9, 1] });
  }
  // ---- 7: helipad deck front arm (4.52 x 3.19 m at 80 px/m): stencilled DC-1 / SPIRHALITE and the badge, read from the pad
  {
    const r = { x: X + 1180, y: Y + 60, w: 362, h: 256 };
    const cx = r.x + r.w / 2;
    text(g, 'SPIRHALITE', cx, r.y + 92, 44, 'rgba(46,58,82,0.9)', { spacing: 0.14, maxW: 290 });
    deepCutBadge(g, cx - 96, r.y + 160, 34);
    text(g, 'DC-1', cx + 36, r.y + 160, 60, 'rgba(214,168,52,0.95)', { font: '"Titan One"', weight: 400, spacing: 0.04, stroke: 'rgba(46,58,82,0.85)', sw: 6 });
    g.fillStyle = 'rgba(46,58,82,0.75)'; g.fillRect(cx - 140, r.y + 206, 280, 6);
    wear(g, r, 71, 700);
    out.push({ id: 7, ...r, place: [0, 4.52, 0, 3.19], fx: [0.6, 1] });
  }
  // ---- 8: the camp's sign board (2.6 x 1.1 m at 160 px/m): hand-painted planks
  {
    const r = { x: X + 1560, y: Y + 60, w: 416, h: 176 }, R0 = rng(88);
    for (let i = 0; i < 4; i++) { const y = r.y + i * 44; g.fillStyle = ['#a88963', '#9f8059', '#ad8f69', '#a4855e'][i]; g.fillRect(r.x, y, r.w, 43); g.fillStyle = 'rgba(40,28,18,0.4)'; g.fillRect(r.x, y + 42, r.w, 2); for (let k = 0; k < 18; k++) { g.fillStyle = `rgba(60,42,26,${0.08 + R0() * 0.1})`; g.fillRect(r.x + R0() * r.w, y + 6 + R0() * 32, 20 + R0() * 60, 1.5); } }
    text(g, 'SPIRHALITE ISLANDS', r.x + r.w / 2, r.y + 48, 40, '#f4ecd8', { spacing: 0.05, stroke: 'rgba(34,34,46,0.8)', sw: 6, maxW: r.w - 36 });
    text(g, 'DEEP CUT EXPEDITION', r.x + r.w / 2 + 22, r.y + 102, 30, '#e0b640', { spacing: 0.06, stroke: 'rgba(34,34,46,0.8)', sw: 5, maxW: r.w - 110 });
    text(g, 'BASE CAMP · KEEP OFF THE RUINS', r.x + r.w / 2, r.y + 146, 19, '#f4ecd8', { spacing: 0.08, maxW: r.w - 40 });
    deepCutBadge(g, r.x + 40, r.y + 102, 24);
    wear(g, r, 89, 500);
    out.push({ id: 8, ...r, place: [0, 2.6, 0, 1.1], fx: [0.5, 0.6] });
  }
  // ---- 10: pillar plinth faces (2.91 x 1.3 m at 100 px/m: the octagon's side, R 3.8): a carved band of roundels and chevrons
  {
    const r = { x: X + 1320, y: Y + 340, w: 291, h: 130 }, R0 = rng(101), col = 'rgba(66,62,56,0.55)';
    g.strokeStyle = col; g.lineWidth = 3;
    g.beginPath(); g.moveTo(r.x, r.y + 30); g.lineTo(r.x + r.w, r.y + 30); g.moveTo(r.x, r.y + 100); g.lineTo(r.x + r.w, r.y + 100); g.stroke();
    for (let i = 0; i < 5; i++) glyph(g, r.x + 30 + i * 57.5, r.y + 65, 44, R0, col);
    for (let i = 0; i < 14; i++) { const x = r.x + 5.5 + i * 20; g.beginPath(); g.moveTo(x, r.y + 112); g.lineTo(x + 10, r.y + 122); g.lineTo(x + 20, r.y + 112); g.stroke(); }
    wear(g, r, 103, 500);
    out.push({ id: 10, ...r, place: [0, 2.91, 0, 1.3], fx: [0.9, 1] });
  }
  return out;
}
