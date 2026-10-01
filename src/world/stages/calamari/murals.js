// Calamari County — stage decals / signage for the mural atlas (mural ids 4…11; see src/world/murals.js).
//
// drawMurals(g, R, kit) draws into the stage region R = { x, y, w, h } (px; 2048 × 1008) and returns the table entries
// { id, x, y, w, h, place: [x0, xLen, y0, yLen], fx } (place in metres on the face: u along the face, v up from the
// face's bottom edge). A layout box shows one with `mural: [{ n: [nx, ny, nz], id }]`. Murals sit UNDER the ink.
//
//   4  the village's welcome mural along T2's retaining wall over the back street (12.3 m face, its bottom at y −1.6):
//      a hand-painted winter panorama — the snowy hills, the cove, the little red-and-cream railcar on the coast line,
//      CALAMARI COUNTY in big friendly letters, two squid mascots, weathered by the winters
export const MURAL = { welcome: 4 };

function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function fit(g, s, maxW, px, fontFn) { let p = px; g.font = fontFn(p); while (g.measureText(s).width > maxW && p > 8) { p -= 2; g.font = fontFn(p); } return p; }
function lettering(g, s, x, y, px, fontFn, face, shade, maxW) {
  const p = fit(g, s, maxW, px, fontFn);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const d = Math.max(2, p * 0.06);
  g.fillStyle = shade; g.fillText(s, x + d, y + d);
  g.lineWidth = Math.max(3, p * 0.12); g.strokeStyle = shade; g.strokeText(s, x, y);
  g.fillStyle = face; g.fillText(s, x, y);
}
// winters on a painted wall: flaking paint (pale speckle), damp streaks down from the coping, frost at the foot
function weather(g, x, y, w, h, seed, amount) {
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < w * h * 0.0008 * amount; i++) { g.fillStyle = `rgba(0,0,0,${0.25 + rnd() * 0.6})`; g.fillRect(x + rnd() * w, y + rnd() * h, 2 + rnd() * 8, 2 + rnd() * 5); }
  for (let i = 0; i < w * 0.02 * amount; i++) { g.fillStyle = `rgba(0,0,0,${0.06 + rnd() * 0.14})`; const xx = x + rnd() * w; g.fillRect(xx, y, 3 + rnd() * 9, h * (0.2 + rnd() * 0.5)); }
  g.restore();
}

export function drawMurals(g, R, kit) {
  const out = [];
  const font = kit.font, fontB = kit.fontB;
  // ---- 4: the welcome mural, 17.0 x 2.3 m at 110 px/m (1870 x 253 px)
  {
    const ppm = 110, Wm = 17.0, Hm = 2.3, X = R.x, Y = R.y, w = Math.round(Wm * ppm), h = Math.round(Hm * ppm);
    g.save();
    g.beginPath(); g.rect(X, Y, w, h); g.clip();
    // sky: a pale winter blue, low sun glow on the left
    const sky = g.createLinearGradient(0, Y, 0, Y + h);
    sky.addColorStop(0, '#8fb3d6'); sky.addColorStop(0.55, '#cfe0ee'); sky.addColorStop(1, '#e8eef4');
    g.fillStyle = sky; g.fillRect(X, Y, w, h);
    const sun = g.createRadialGradient(X + 180, Y + 60, 5, X + 180, Y + 60, 160);
    sun.addColorStop(0, 'rgba(255,246,226,0.95)'); sun.addColorStop(1, 'rgba(255,246,226,0)');
    g.fillStyle = sun; g.fillRect(X, Y, 400, h);
    // far mountains (white caps), then the near hills
    const ridge = (y0, amp, col, cap, seed) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(X, Y + h);
      for (let i = 0; i <= 60; i++) { const t = i / 60, yy = y0 - amp * (0.5 + 0.5 * Math.sin(t * 9 + seed) * Math.sin(t * 3.7 + seed * 2)); g.lineTo(X + t * w, Y + yy); }
      g.lineTo(X + w, Y + h); g.closePath(); g.fill();
      if (cap) { g.fillStyle = cap; g.beginPath(); for (let i = 0; i <= 60; i++) { const t = i / 60, yy = y0 - amp * (0.5 + 0.5 * Math.sin(t * 9 + seed) * Math.sin(t * 3.7 + seed * 2)); if (i === 0) g.moveTo(X + t * w, Y + yy); else g.lineTo(X + t * w, Y + yy); } for (let i = 60; i >= 0; i--) { const t = i / 60, yy = y0 - amp * (0.5 + 0.5 * Math.sin(t * 9 + seed) * Math.sin(t * 3.7 + seed * 2)); g.lineTo(X + t * w, Y + yy + 14 + 6 * Math.sin(t * 40)); } g.closePath(); g.fill(); }
    };
    ridge(120, 70, '#9aaabb', '#f4f7fa', 1.3);
    ridge(160, 45, '#7d8f8a', '#eef3f6', 4.1);
    // the cove: slate sea band with white wave ticks
    g.fillStyle = '#4f7486'; g.fillRect(X, Y + 175, w, 40);
    g.strokeStyle = 'rgba(240,246,250,0.8)'; g.lineWidth = 3;
    for (let i = 0; i < 70; i++) { const x = X + 10 + i * 27, y = Y + 185 + (i % 3) * 9; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 7, y - 5, x + 14, y); g.stroke(); }
    // the coast line: a railway embankment with the little railcar (cream + red band) and telegraph poles
    g.fillStyle = '#e9edf1'; g.fillRect(X, Y + 206, w, h - 206);
    g.fillStyle = '#5a4a3e'; g.fillRect(X, Y + 212, w, 4);
    for (let i = 0; i < 16; i++) { const x = X + 60 + i * 120; g.fillStyle = '#5a4a3e'; g.fillRect(x, Y + 150, 5, 62); g.fillRect(x - 14, Y + 156, 33, 4); }
    const tx = X + 1120, ty = Y + 176;
    rr(g, tx, ty, 190, 34, 8); g.fillStyle = '#e8e0c9'; g.fill();
    g.fillStyle = '#a3372f'; g.fillRect(tx + 2, ty + 20, 186, 7);
    g.fillStyle = '#2c3850'; g.fillRect(tx + 4, ty + 29, 182, 5);
    for (let i = 0; i < 7; i++) { g.fillStyle = '#3a4a5c'; g.fillRect(tx + 16 + i * 24, ty + 6, 16, 11); }
    g.fillStyle = '#f4f7fa'; rr(g, tx + 6, ty - 6, 178, 9, 5); g.fill();
    // village roofs along the shore (dark tile, snow on them)
    for (let i = 0; i < 14; i++) {
      const x = X + 330 + i * 52 + (i > 6 ? 330 : 0), y = Y + 168 + (i % 3) * 4, ww = 40 + (i % 2) * 12;
      g.fillStyle = '#5a4333'; g.fillRect(x + 4, y + 10, ww - 8, 24);
      g.fillStyle = '#48525e'; g.beginPath(); g.moveTo(x - 4, y + 12); g.lineTo(x + ww / 2, y - 8); g.lineTo(x + ww + 4, y + 12); g.closePath(); g.fill();
      g.fillStyle = '#f4f7fa'; g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x + ww / 2, y - 7); g.lineTo(x + ww, y + 8); g.lineTo(x + ww / 2, y + 2); g.closePath(); g.fill();
      g.fillStyle = '#ffd99e'; g.fillRect(x + ww / 2 - 5, y + 18, 9, 8);
    }
    // snowflakes
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 90; i++) { const x = X + ((i * 181) % w), y = Y + ((i * 97) % 160); g.beginPath(); g.arc(x, y, 2 + (i % 3), 0, Math.PI * 2); g.fill(); }
    // the title on a painted banner, with the two squid mascots
    const bx = X + w / 2, by = Y + 72;
    rr(g, bx - 520, by - 52, 1040, 104, 26); g.fillStyle = 'rgba(44,56,80,0.92)'; g.fill();
    g.lineWidth = 5; g.strokeStyle = '#e8e0c9'; rr(g, bx - 510, by - 42, 1020, 84, 20); g.stroke();
    lettering(g, 'CALAMARI COUNTY', bx, by - 4, 78, (p) => font(p), '#f4f1e8', '#a3372f', 900);
    g.font = fontB(24); g.fillStyle = '#e8e0c9'; g.textAlign = 'center'; g.fillText('WELCOME HOME  ·  3 h 30 min FROM INKOPOLIS BY THE COAST LINE', bx, by + 64);
    kit.squid(g, bx - 620, by + 10, 1.05, '#e8e0c9', '#2c3850');
    kit.squid(g, bx + 620, by + 10, 1.05, '#a3372f', '#f4f1e8');
    g.restore();
    weather(g, X, Y, w, h, 17, 1.4);
    // placed on the +Z face of T2's front run west of its stair (12.3 m; its bottom edge is the slab's foot at y −1.6):
    // scaled to 12 m (aspect kept), centred, y 0.35 … 1.97 above the back street
    const sc = 12 / Wm;
    out.push({ id: MURAL.welcome, x: X, y: Y, w, h, place: [0.15, Wm * sc, 1.95, Hm * sc], fx: [0.9, 1] });
  }
  return out;
}
