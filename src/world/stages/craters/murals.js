// Turf War Craters — stage decals / signage for the mural atlas (mural ids 4…11; see src/world/murals.js).
//
// drawMurals(g, R, kit): draw into the canvas 2D context `g` inside the stage region R = { x, y, w, h } (px; 2048 x 1008)
// and return the table entries { id, x, y, w, h, m: [faceW, faceH] } (fitted at the face origin) or
// { …, place: [x0, xLen, y0, yLen], fx } (explicit placement, metres on the face). A layout face shows a mural with
// `mural: [{ n: [nx, ny, nz], id }]` (the face whose outward normal matches n).
//
//   4  interpretive board: THE GREAT TURF WAR — a map of the front across these downs
//   5  interpretive board: TRENCH LINE B — a section through the fire trench
//   6  interpretive board: THE FLOODED CRATERS
//   7  the Great Crater's floor: a bronze ring set into the turf — GROUND ZERO
//   8  the pillbox: flaking camouflage paint and its stencilled number (every wall)
//   9  the memorial's bronze plaque (the plinth top's front face)
//  10  chalk scars on the Great Crater's slopes (every rim facet)
//  11  interpretive board: THE RESERVE LINE — the support line behind the front, the mound (the Long Stages slice)
export const MURAL_IDS = { boardWar: 4, boardTrench: 5, boardPonds: 6, groundZero: 7, pillbox: 8, plaque: 9, scar: 10, boardReserve: 11 };

let seed = 1;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function text(g, s, x, y, px, font, fill, maxW = 9999, align = 'center') {
  g.font = font(px);
  let p = px;
  while (g.measureText(s).width > maxW && p > 8) { p -= 2; g.font = font(p); }
  g.fillStyle = fill; g.textAlign = align; g.textBaseline = 'middle';
  g.fillText(s, x, y);
}
function lines(g, arr, x, y, px, lh, font, fill, maxW) { arr.forEach((s, i) => text(g, s, x, y + i * lh, px, font, fill, maxW, 'left')); }
// a printed board panel: cream ground, a dark green title band, a thin frame line
function panel(g, r, title, kit) {
  g.fillStyle = '#efe8d6'; g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = '#2f4a44'; g.fillRect(r.x, r.y, r.w, 62);
  text(g, title, r.x + r.w / 2, r.y + 33, 38, kit.font, '#f2ead4', r.w - 40);
  g.strokeStyle = '#2f4a44'; g.lineWidth = 4; g.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
  // the park's little logo in the corner: a poppy
  poppy(g, r.x + r.w - 34, r.y + r.h - 30, 14);
}
function poppy(g, x, y, s) {
  g.fillStyle = '#c0392b';
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; g.beginPath(); g.ellipse(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.62, s * 0.5, a, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#222'; g.beginPath(); g.arc(x, y, s * 0.28, 0, Math.PI * 2); g.fill();
}
function zigzag(g, pts, col, w, dash) {
  g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'miter'; g.setLineDash(dash || []);
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.setLineDash([]);
}
function arrow(g, x0, y0, x1, y1, col) {
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0); g.beginPath(); g.moveTo(x1 + Math.cos(a) * 12, y1 + Math.sin(a) * 12);
  g.lineTo(x1 + Math.cos(a + 2.4) * 16, y1 + Math.sin(a + 2.4) * 16); g.lineTo(x1 + Math.cos(a - 2.4) * 16, y1 + Math.sin(a - 2.4) * 16); g.fill();
}

export function drawMurals(g, R, kit) {
  const out = [];
  const FT = kit.fontB, FD = kit.font, INK = '#2c2a26';
  seed = 11;
  // ---- 4: THE GREAT TURF WAR (1.6 x 1.0 m board, 300 px/m)
  {
    const r = { x: R.x, y: R.y, w: 480, h: 300 };
    panel(g, r, 'THE GREAT TURF WAR', kit);
    // the map: sea, the downs' coast, the craters, the two front lines, the attacks
    const m = { x: r.x + 18, y: r.y + 76, w: 250, h: 200 };
    g.fillStyle = '#9cc4c8'; g.fillRect(m.x, m.y, m.w, m.h);
    g.fillStyle = '#b9c08e'; g.beginPath();
    g.moveTo(m.x + 30, m.y); g.lineTo(m.x + 220, m.y); g.lineTo(m.x + 232, m.y + 60); g.lineTo(m.x + 214, m.y + 90); g.lineTo(m.x + 236, m.y + 140); g.lineTo(m.x + 220, m.y + m.h);
    g.lineTo(m.x + 26, m.y + m.h); g.lineTo(m.x + 12, m.y + 130); g.lineTo(m.x + 34, m.y + 100); g.lineTo(m.x + 16, m.y + 50); g.closePath(); g.fill();
    g.fillStyle = '#8e9468';
    for (let k = 0; k < 16; k++) { g.beginPath(); g.arc(m.x + 40 + rand() * 170, m.y + 20 + rand() * 160, 3 + rand() * 6, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#7f8660'; g.beginPath(); g.arc(m.x + 125, m.y + 100, 20, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6e9fae'; for (const [cx, cy] of [[m.x + 170, m.y + 70], [m.x + 80, m.y + 130]]) { g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.fill(); }
    zigzag(g, [[m.x + 20, m.y + 62], [m.x + 70, m.y + 62], [m.x + 80, m.y + 50], [m.x + 130, m.y + 50], [m.x + 140, m.y + 62], [m.x + 225, m.y + 62]], '#b3452e', 5);
    zigzag(g, [[m.x + 20, m.y + 140], [m.x + 105, m.y + 140], [m.x + 115, m.y + 152], [m.x + 160, m.y + 152], [m.x + 170, m.y + 140], [m.x + 226, m.y + 140]], '#2f5b8c', 5);
    arrow(g, m.x + 90, m.y + 70, m.x + 110, m.y + 92, '#b3452e'); arrow(g, m.x + 150, m.y + 132, m.x + 135, m.y + 110, '#2f5b8c');
    text(g, 'YOU ARE HERE', m.x + 172, m.y + 172, 11, FT, INK); g.fillStyle = '#c0392b'; g.beginPath(); g.arc(m.x + 150, m.y + 160, 5, 0, Math.PI * 2); g.fill();
    lines(g, ['About a hundred years ago', 'the seas rose, and every', 'species fought for what', 'land was left.', '', 'For three winters the front', 'ran across these downs.', 'The craters are its scars.'], r.x + 282, r.y + 92, 15, 21, FT, INK, 190);
  }
  // ---- 5: TRENCH LINE B
  {
    const r = { x: R.x + 496, y: R.y, w: 480, h: 300 };
    panel(g, r, 'TRENCH LINE B', kit);
    // section through the fire trench
    const s = { x: r.x + 24, y: r.y + 90, w: 260 };
    g.fillStyle = '#b9c08e'; g.fillRect(s.x, s.y + 40, s.w, 12);
    g.fillStyle = '#d9d3c1'; g.fillRect(s.x, s.y + 52, s.w, 120);
    g.fillStyle = '#efe8d6'; g.fillRect(s.x + 80, s.y + 40, 100, 80);
    g.fillStyle = '#9a8a66'; for (let k = 0; k < 3; k++) { g.fillRect(s.x + 54, s.y + 26 - k * 13, 30, 12); g.fillRect(s.x + 176, s.y + 26 - k * 13, 30, 12); }
    g.fillStyle = '#8b7356'; g.fillRect(s.x + 80, s.y + 40, 8, 80); g.fillRect(s.x + 172, s.y + 40, 8, 80); g.fillRect(s.x + 88, s.y + 112, 84, 8);
    g.fillStyle = '#a0907a'; g.fillRect(s.x + 88, s.y + 88, 24, 24);
    g.strokeStyle = INK; g.lineWidth = 2; g.setLineDash([4, 4]);
    for (const [x0, y0, x1, y1] of [[s.x + 60, s.y + 4, s.x + 40, s.y - 18], [s.x + 100, s.y + 116, s.x + 120, s.y + 150], [s.x + 100, s.y + 96, s.x + 60, s.y + 150], [s.x + 176, s.y + 80, s.x + 220, s.y + 150]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    g.setLineDash([]);
    text(g, 'PARAPET', s.x + 40, s.y - 26, 11, FT, INK); text(g, 'DUCKBOARDS', s.x + 124, s.y + 160, 11, FT, INK);
    text(g, 'FIRE STEP', s.x + 48, s.y + 160, 11, FT, INK); text(g, 'REVETMENT', s.x + 226, s.y + 160, 11, FT, INK);
    lines(g, ['The fire trench, dug in', 'the first winter of the', 'war and kept as it was.', '', 'Stand on the fire step', 'to see over the parapet.', 'Mind the duckboards.'], r.x + 296, r.y + 92, 15, 22, FT, INK, 170);
  }
  // ---- 6: THE FLOODED CRATERS
  {
    const r = { x: R.x + 992, y: R.y, w: 480, h: 300 };
    panel(g, r, 'THE FLOODED CRATERS', kit);
    const c = { x: r.x + 150, y: r.y + 180 };
    g.fillStyle = '#b9c08e'; g.beginPath(); g.ellipse(c.x, c.y, 128, 70, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d9d3c1'; g.beginPath(); g.ellipse(c.x, c.y + 4, 100, 52, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4c7480'; g.beginPath(); g.ellipse(c.x, c.y + 10, 86, 40, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7e8c50'; for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2, x = c.x + Math.cos(a) * 92, y = c.y + 6 + Math.sin(a) * 45; g.fillRect(x - 1.5, y - 22 - rand() * 12, 3, 24 + rand() * 10); }
    g.fillStyle = '#5a4030'; for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; g.fillRect(c.x + Math.cos(a) * 96 - 3, c.y + Math.sin(a) * 47 - 34, 6, 14); }
    for (let k = 0; k < 12; k++) poppy(g, c.x - 120 + rand() * 240, c.y - 70 + rand() * 24, 5);
    lines(g, ['Rain fills the deepest', 'shell holes. Reeds and', 'newts moved in; poppies', 'love the turned chalk.', '', 'Please keep to the rim', 'path: the banks are steep.'], r.x + 290, r.y + 92, 15, 22, FT, INK, 180);
  }
  // ---- 11: THE RESERVE LINE (the Long Stages slice: the support trench, the communication trench, the mound)
  {
    const r = { x: R.x, y: R.y + 548, w: 480, h: 300 };
    panel(g, r, 'THE RESERVE LINE', kit);
    // plan: the front trench (red), the support trench behind it, the communication trenches back, the mound + cenotaph
    const m = { x: r.x + 18, y: r.y + 76, w: 250, h: 200 };
    g.fillStyle = '#b9c08e'; g.fillRect(m.x, m.y, m.w, m.h);
    g.fillStyle = '#8e9468'; for (let k = 0; k < 10; k++) { g.beginPath(); g.arc(m.x + 16 + rand() * 218, m.y + 14 + rand() * 172, 3 + rand() * 5, 0, Math.PI * 2); g.fill(); }
    zigzag(g, [[m.x + 10, m.y + 40], [m.x + 70, m.y + 40], [m.x + 82, m.y + 28], [m.x + 150, m.y + 28], [m.x + 162, m.y + 40], [m.x + 240, m.y + 40]], '#b3452e', 5);
    zigzag(g, [[m.x + 10, m.y + 104], [m.x + 60, m.y + 104], [m.x + 72, m.y + 116], [m.x + 100, m.y + 116]], '#5a4a38', 6);
    zigzag(g, [[m.x + 150, m.y + 110], [m.x + 172, m.y + 110], [m.x + 184, m.y + 122], [m.x + 240, m.y + 122]], '#5a4a38', 6);
    zigzag(g, [[m.x + 196, m.y + 124], [m.x + 196, m.y + 150], [m.x + 184, m.y + 164], [m.x + 184, m.y + 188]], '#5a4a38', 4);
    g.fillStyle = '#9aa66e'; g.beginPath(); g.arc(m.x + 125, m.y + 140, 20, 0, Math.PI * 2); g.fill();
    g.fillStyle = INK; g.fillRect(m.x + 118, m.y + 134, 14, 14); g.fillRect(m.x + 120, m.y + 129, 10, 5); g.fillRect(m.x + 115, m.y + 147, 20, 3);   // (the cenotaph)
    text(g, 'FRONT', m.x + 206, m.y + 14, 11, FT, '#b3452e'); text(g, 'SUPPORT', m.x + 40, m.y + 88, 11, FT, '#5a4a38');
    text(g, 'YOU ARE HERE', m.x + 130, m.y + 178, 11, FT, INK); g.fillStyle = '#c0392b'; g.beginPath(); g.arc(m.x + 150, m.y + 160, 5, 0, Math.PI * 2); g.fill();
    lines(g, ['Behind the fire trench', 'ran the support line,', 'and behind that the', 'reserves. Winding saps', 'brought them up unseen.', '', 'The Inkling Rifles held', 'this line all winter.'], r.x + 282, r.y + 92, 15, 21, FT, INK, 190);
  }
  out.push({ id: 11, x: R.x, y: R.y + 548, w: 480, h: 300, m: [1.6, 1.0], fx: [0.3, 0] });
  out.push({ id: 4, x: R.x, y: R.y, w: 480, h: 300, m: [1.6, 1.0], fx: [0.3, 0] });
  out.push({ id: 5, x: R.x + 496, y: R.y, w: 480, h: 300, m: [1.6, 1.0], fx: [0.3, 0] });
  out.push({ id: 6, x: R.x + 992, y: R.y, w: 480, h: 300, m: [1.6, 1.0], fx: [0.3, 0] });

  // ---- 7: GROUND ZERO ring on the crater floor (the floor block's top face, 9.2 x 9.2 m; the ring 2.6 m across)
  {
    const r = { x: R.x + 1488, y: R.y, w: 520, h: 520 }, cx = r.x + r.w / 2, cy = r.y + r.h / 2, k = r.w / 2.6;
    g.save(); g.translate(cx, cy);
    g.fillStyle = '#6f5a3e'; g.beginPath(); g.arc(0, 0, 1.25 * k, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8f7650'; g.beginPath(); g.arc(0, 0, 1.12 * k, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6f5a3e'; g.beginPath(); g.arc(0, 0, 0.8 * k, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#a58a5c'; g.beginPath(); g.arc(0, 0, 0.72 * k, 0, Math.PI * 2); g.fill();
    const t = 'THE GREAT CRATER  ·  GROUND ZERO  ·  NEVER AGAIN  ·  ';
    g.font = FT(34); g.fillStyle = '#f1e4c2'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const rad = 0.96 * k, per = (Math.PI * 2) / t.length;
    for (let i = 0; i < t.length; i++) { g.save(); g.rotate(i * per); g.translate(0, -rad); g.fillText(t[i], 0, 0); g.restore(); }
    // compass points + a poppy in the middle
    g.fillStyle = '#6f5a3e';
    for (let i = 0; i < 4; i++) { g.save(); g.rotate((i * Math.PI) / 2); g.beginPath(); g.moveTo(0, -0.66 * k); g.lineTo(0.08 * k, -0.2 * k); g.lineTo(-0.08 * k, -0.2 * k); g.closePath(); g.fill(); g.restore(); }
    poppy(g, 0, 0, 0.16 * k);
    g.restore();
    // floor top face: u runs −x, v runs +z; the ring at the centre of the 9.2 m face
    out.push({ id: 7, ...r, place: [4.6 - 1.3, 2.6, 4.6 - 1.3, 2.6], fx: [0.6, 0] });
  }
  // ---- 8: pillbox camouflage + stencil (5.4 x 2.05 m walls, 100 px/m)
  {
    const r = { x: R.x, y: R.y + 320, w: 540, h: 205 };
    g.clearRect(r.x, r.y, r.w, r.h);
    const cols = ['rgba(128,122,94,0.55)', 'rgba(104,108,86,0.5)', 'rgba(150,140,110,0.5)', 'rgba(92,86,70,0.45)'];
    for (let k = 0; k < 26; k++) {
      g.fillStyle = cols[k % cols.length];
      const x = r.x + rand() * r.w, y = r.y + rand() * r.h, s = 22 + rand() * 50;
      g.beginPath();
      for (let j = 0; j < 9; j++) { const a = (j / 9) * Math.PI * 2, rr = s * (0.6 + rand() * 0.5); j ? g.lineTo(x + Math.cos(a) * rr * 1.6, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr * 1.6, y + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    }
    // flaking: knock chips out
    g.save(); g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 90; k++) { g.globalAlpha = 0.3 + rand() * 0.5; g.beginPath(); g.ellipse(r.x + rand() * r.w, r.y + rand() * r.h, 2 + rand() * 7, 1 + rand() * 4, rand() * 3, 0, Math.PI * 2); g.fill(); }
    g.restore();
    text(g, '7', r.x + 60, r.y + 120, 96, FD, 'rgba(236,230,212,0.8)');
    out.push({ id: 8, ...r, m: [5.4, 2.05], fx: [0.8, 0] });
  }
  // ---- 9: the memorial's bronze plaque (plinth top's front: 2.5 x 1.2 m; the plaque 1.7 x 0.7 in the middle)
  {
    const r = { x: R.x + 560, y: R.y + 320, w: 510, h: 210 };
    g.fillStyle = '#6e5639'; g.fillRect(r.x, r.y, r.w, r.h);
    g.strokeStyle = '#a88a58'; g.lineWidth = 6; g.strokeRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16);
    text(g, 'IN MEMORY OF ALL WHO FOUGHT', r.x + r.w / 2, r.y + 50, 30, FT, '#e9d7a8', r.w - 50);
    text(g, 'FOR THIS LAND', r.x + r.w / 2, r.y + 88, 30, FT, '#e9d7a8', r.w - 50);
    text(g, 'THE DOWNS ARE SHARED NOW', r.x + r.w / 2, r.y + 140, 22, FT, '#d8c38e', r.w - 60);
    poppy(g, r.x + r.w / 2, r.y + 180, 12);
    out.push({ id: 9, ...r, place: [0.5, 1.5, 0.3, 0.62], fx: [0.35, 0] });
  }
  // ---- 10: chalk scars on the Great Crater's slopes (every rim facet; a ragged scree of exposed chalk round its middle,
  // the turf showing through in holes — the face is ~4 m across, the scar 3.2 m, centred)
  {
    const r = { x: R.x + 1088, y: R.y + 320, w: 400, h: 400 }, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    g.clearRect(r.x, r.y, r.w, r.h);
    seed = 71;
    // soft-edged patches of weathered chalk (grey-white, fading into the turf), scattered chips and flints
    const patch = (x, y, rr, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `rgba(214,210,196,${a})`); gr.addColorStop(0.55, `rgba(206,202,188,${a * 0.75})`); gr.addColorStop(1, 'rgba(206,202,188,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rr, rr * (0.55 + rand() * 0.3), rand() * 3, 0, Math.PI * 2); g.fill(); };
    for (let k = 0; k < 9; k++) { const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 110; patch(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, 30 + rand() * 45, 0.55 + rand() * 0.3); }
    g.save(); g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 60; k++) { g.globalAlpha = 0.5 + rand() * 0.5; g.beginPath(); g.ellipse(cx + (rand() - 0.5) * 300, cy + (rand() - 0.5) * 220, 3 + rand() * 10, 2 + rand() * 6, rand() * 3, 0, Math.PI * 2); g.fill(); }
    g.restore();
    g.fillStyle = 'rgba(70,72,74,0.75)'; for (let k = 0; k < 22; k++) { const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 115; g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, 1.2 + rand() * 2.2, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(228,225,214,0.85)'; for (let k = 0; k < 70; k++) { const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 135; g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, 1.5 + rand() * 3, 1.5 + rand() * 2.5); }
    out.push({ id: 10, ...r, place: [0.4, 3.2, 0.9, 3.2], fx: [0.75, 0] });
  }
  return out;
}
