// Procedural wall murals / signage, drawn into one canvas atlas that the level shader samples underneath the ink
// layer. Rows 0-3 are the original tileable 2048x256 strips (ids 0-3, unchanged pixels); below them sit face-fitted
// decals for the loaded stage (ids 4…11, redrawn by texture.userData.setStage(id): Halyard Marina's ferry car-deck
// markings + cabin livery here, every other stage's from src/world/stages/<id>/murals.js). The placement table
// travels on texture.userData.murals (indexed by mural id) and is read by levelMaterial.js:
//   rect  [u0, uw, v0, vh]     atlas rectangle in texture space (v from the bottom: CanvasTexture flips Y)
//   place [x0, xLen, y0, yLen] where it sits on the face in metres (face u / v); xLen < 0 = strip repeating every
//                              -xLen face heights (the original rows), yLen <= 0 = full face height
//   fx    [weather, chip]      how much the surface's paint mottling shows through / its chips + peeling cut the mural
import * as THREE from 'three';
import { STAGES } from './stages/index.js';

const W = 2048, RH = 256, ROWS = 4, H = 2048;
const NAVY = '#27304d', CORAL = '#ec7a6b', TEAL = '#3fa8a2', MUSTARD = '#eec35c', CREAM = '#fbf5e8', SKY = '#7cc6e6';

// Halyard decals: canvas rects (px) + face size (m). 64 px/m on the deck, 96 px/m on the cabin.
export const MURAL = { deck: 4, cabinSide: 5, cabinEnd: 6 };
const DECK = { x: 0, y: 1040, w: 2048, h: 640, m: [32, 10] };           // ferry-deck top face: 32 x 10 m
const CSIDE = { x: 0, y: 1696, w: 1248, h: 240, m: [13, 2.5] };         // ferry-cabin ±Z faces: 13 x 2.5 m
const CEND = { x: 1264, y: 1696, w: 557, h: 240, m: [5.8, 2.5] };      // ferry-cabin ±X faces: 5.8 x 2.5 m

// stage decals (ids 4…11) share one region below the strips; it is redrawn for the loaded stage (setStage)
const STAGE_R = { x: 0, y: 1040, w: 2048, h: 1008 };
const STAGE_MURALS = {
  halyard: (g) => {
    drawCarDeck(g, DECK);
    drawCabinSide(g, CSIDE);
    drawCabinEnd(g, CEND);
    return [
      { id: MURAL.deck, ...DECK, place: [0, DECK.m[0], 0, DECK.m[1]], fx: [1, 1] },
      { id: MURAL.cabinSide, ...CSIDE, fx: [0.85, 1] },
      { id: MURAL.cabinEnd, ...CEND, fx: [0.85, 1] },
    ];
  },
};
for (const [id, s] of Object.entries(STAGES)) if (s.drawMurals) STAGE_MURALS[id] = s.drawMurals;

export async function createMuralTexture(stageId = 'halyard') {
  try { await Promise.all([document.fonts.load('120px "Titan One"'), document.fonts.load('800 100px Rubik')]); } catch { /* fallback font */ }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  const font = (px) => `${px}px "Titan One", "Arial Black", sans-serif`;
  const fontB = (px) => `800 ${px}px Rubik, "Arial Black", sans-serif`;
  drawBanner(g, 0, font);
  drawChevrons(g, RH, font);
  drawShop(g, RH * 2, font);
  drawShipping(g, RH * 3, font);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const rect = (r) => [r.x / W, r.w / W, 1 - (r.y + r.h) / H, r.h / H];
  const kit = { font, fontB, NAVY, CORAL, TEAL, MUSTARD, CREAM, SKY, squid, blob };
  let cur = null;
  // (re)draw the stage region for `id` and rebuild the placement table; call before building the level material
  tex.userData.setStage = (id) => {
    if (id === cur) return;
    cur = id;
    tex.userData.stage = id;   // (which stage the region holds: a check for tests)
    g.clearRect(STAGE_R.x, STAGE_R.y, STAGE_R.w, STAGE_R.h);
    const murals = [0, 1, 2, 3].map((k) => ({ rect: [0, 1, 1 - (k + 1) * RH / H, RH / H], place: [0, -8, 0, 0], fx: [0, 0] }));
    let list = [];
    try {
      g.save(); g.beginPath(); g.rect(STAGE_R.x, STAGE_R.y, STAGE_R.w, STAGE_R.h); g.clip();
      list = (STAGE_MURALS[id] && STAGE_MURALS[id](g, { ...STAGE_R }, kit)) || [];
    } catch (e) { console.error('[inkwave] stage murals failed', id, e); } finally { g.restore(); }
    for (const m of list) {
      if (!(m.id >= 4 && m.id <= 11)) { console.warn('[inkwave] mural id out of range (4…11)', id, m.id); continue; }
      murals[m.id] = { rect: rect(m), place: m.place || [0, m.m[0], 0, m.m[1]], fx: m.fx || [0.85, 1] };
    }
    tex.userData.murals = murals;
    tex.needsUpdate = true;
  };
  tex.userData.setStage(stageId);
  return tex;
}

function blob(g, x, y, r, seed, color) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const rr = r * (1 + 0.12 * Math.sin(a * 3 + seed) + 0.08 * Math.sin(a * 7 + seed * 2));
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.fill();
}

function squid(g, x, y, s, color, eye = CREAM) {
  // a little squid icon (mantle + fins + tentacles + eyes)
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = color;
  g.beginPath(); g.moveTo(0, -60); g.bezierCurveTo(34, -40, 34, 10, 26, 22); g.lineTo(-26, 22); g.bezierCurveTo(-34, 10, -34, -40, 0, -60); g.fill();
  g.beginPath(); g.moveTo(-18, -44); g.lineTo(-46, -30); g.lineTo(-22, -22); g.fill();
  g.beginPath(); g.moveTo(18, -44); g.lineTo(46, -30); g.lineTo(22, -22); g.fill();
  for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(-20 + i * 10, 34, 5, 14, (i - 2) * 0.15, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = eye; g.beginPath(); g.ellipse(-10, 2, 7, 9, 0, 0, Math.PI * 2); g.ellipse(10, 2, 7, 9, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = NAVY; g.beginPath(); g.arc(-9, 4, 3.5, 0, Math.PI * 2); g.arc(11, 4, 3.5, 0, Math.PI * 2); g.fill();
  g.restore();
}

// Row 0: big "INKWAVE" banner for the back walls
function drawBanner(g, y0, font) {
  g.save(); g.translate(0, y0);
  // stripe band
  g.fillStyle = NAVY; g.fillRect(0, 150, W, 70);
  g.fillStyle = MUSTARD; g.fillRect(0, 150, W, 10);
  g.fillStyle = CORAL; g.fillRect(0, 214, W, 8);
  for (let k = 0; k < 2; k++) {
    const ox = k * 1024;
    blob(g, ox + 170, 120, 88, 1 + k, TEAL);
    squid(g, ox + 170, 128, 1.25, CREAM, NAVY);
    g.font = font(150);
    g.textBaseline = 'alphabetic';
    g.lineJoin = 'round';
    g.lineWidth = 22; g.strokeStyle = CREAM; g.strokeText('INKWAVE', ox + 300, 186);
    g.fillStyle = NAVY; g.fillText('INKWAVE', ox + 300, 186);
    g.fillStyle = CORAL; g.fillText('INKWAVE', ox + 294, 180);
    g.font = font(34); g.fillStyle = CREAM; g.fillText('TURF RIOT  •  TIDEWATER PLAZA', ox + 320, 205 + 2);
    // splat accents
    blob(g, ox + 960, 70, 26, 5 + k, MUSTARD);
    blob(g, ox + 925, 110, 12, 7 + k, MUSTARD);
  }
  g.restore();
}

// Row 1: bold chevron arrows + hazard stripes for dividing walls
function drawChevrons(g, y0, font) {
  g.save(); g.translate(0, y0);
  g.fillStyle = TEAL; g.fillRect(0, 60, W, 140);
  g.fillStyle = CREAM;
  for (let x = 0; x < W; x += 128) {
    g.beginPath(); g.moveTo(x + 20, 80); g.lineTo(x + 70, 80); g.lineTo(x + 110, 130); g.lineTo(x + 70, 180); g.lineTo(x + 20, 180); g.lineTo(x + 60, 130); g.closePath(); g.fill();
  }
  g.fillStyle = NAVY; g.fillRect(0, 60, W, 8); g.fillRect(0, 192, W, 8);
  g.restore();
}

// Row 2: kiosk shop sign
function drawShop(g, y0, font) {
  g.save(); g.translate(0, y0);
  for (let k = 0; k < 2; k++) {
    const ox = k * 1024;
    g.fillStyle = CORAL; roundRect(g, ox + 40, 30, 944, 150, 40); g.fill();
    g.fillStyle = CREAM; roundRect(g, ox + 54, 44, 916, 122, 30); g.fill();
    g.font = font(92); g.fillStyle = NAVY; g.textBaseline = 'middle';
    g.fillText('TIDE SNACKS', ox + 250, 108);
    // ice-cream squid icon
    g.fillStyle = MUSTARD; g.beginPath(); g.moveTo(ox + 140, 150); g.lineTo(ox + 110, 90); g.lineTo(ox + 170, 90); g.closePath(); g.fill();
    squid(g, ox + 140, 86, 0.7, CORAL, CREAM);
    // awning scallops
    for (let x = 0; x < 1024; x += 64) { g.fillStyle = (x / 64) % 2 ? CREAM : CORAL; g.beginPath(); g.arc(ox + x + 32, 212, 30, 0, Math.PI); g.fill(); }
  }
  g.restore();
}

// Row 3: shipping line logo for containers
function drawShipping(g, y0, font) {
  g.save(); g.translate(0, y0);
  for (let k = 0; k < 2; k++) {
    const ox = k * 1024;
    g.font = font(110); g.textBaseline = 'middle';
    g.fillStyle = 'rgba(251,245,232,0.92)';
    g.fillText('KRAKEN', ox + 140, 110);
    g.font = font(44); g.fillText('LINES  ~  SEA FREIGHT', ox + 150, 190);
    // tentacle wave
    g.strokeStyle = 'rgba(251,245,232,0.92)'; g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.moveTo(ox + 40, 140); g.bezierCurveTo(ox + 70, 60, ox + 120, 200, ox + 110, 70); g.stroke();
    g.beginPath(); g.arc(ox + 105, 64, 12, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ------------------------------------------------------------------------------------------------------------------
// Halyard Marina decals
// ------------------------------------------------------------------------------------------------------------------
const K = { navy: '#2f3a57', hull: '#3f5372', teal: '#3f9f97', tealDk: '#2c7a74', white: '#f1ede4', coral: '#df7c66', yellow: '#e2b64c', black: '#2a2c31' };

// small deterministic RNG for the wear passes
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Paint wear inside a rect: many small erase flecks (worn, chipped paint), a few bigger soft scuffs, and optional long
// erase strokes along given paths (tyre tracks) — destination-out, so it only thins what is already painted.
function wear(g, r, { flecks = 2600, fleck = [0.6, 2.4], scuffs = 60, scuff = [6, 22], strokes = [], seed = 1 } = {}) {
  const R = rng(seed);
  g.save();
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < flecks; i++) {
    const x = r.x + R() * r.w, y = r.y + R() * r.h, rad = fleck[0] + R() * R() * (fleck[1] - fleck[0]);
    g.fillStyle = `rgba(0,0,0,${0.35 + 0.65 * R()})`;
    g.beginPath(); g.ellipse(x, y, rad * (0.6 + R()), rad * (0.6 + R()), R() * Math.PI, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < scuffs; i++) {
    const x = r.x + R() * r.w, y = r.y + R() * r.h, rad = scuff[0] + R() * (scuff[1] - scuff[0]);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(0,0,0,${0.25 + 0.3 * R()})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (const s of strokes) {
    g.strokeStyle = `rgba(0,0,0,${s.a})`; g.lineWidth = s.w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(s.p[0][0], s.p[0][1]); for (const q of s.p.slice(1)) g.lineTo(q[0], q[1]); g.stroke();
  }
  g.restore();
}

// Stencil text in a local frame: at (x, y) in the current transform, reading along +x, `size` = cap height units.
function stencil(g, str, x, y, size, color, { weight = 800, spacing = 0.08, align = 'center', family = 'Rubik' } = {}) {
  g.save();
  g.translate(x, y);
  g.scale(size / 100, size / 100);
  g.font = `${weight} 138px ${family}, "Arial Black", sans-serif`;
  g.textBaseline = 'alphabetic';
  g.fillStyle = color;
  if ('letterSpacing' in g) g.letterSpacing = `${spacing * 100}px`;
  const w = g.measureText(str).width;
  g.fillText(str, align === 'center' ? -w / 2 : 0, 50);
  g.restore();
}

// Ferry car deck (the ferry-deck block's top face, u = -x, v = +z). Drawn in world metres: the transform below maps
// world (X, Z) straight onto the face, and the Bravo end is the same drawing turned 180° (the map's symmetry).
function drawCarDeck(g, r) {
  const S = r.w / r.m[0];                                           // 64 px / m
  const world = (s) => g.setTransform(-S * s, 0, 0, -S * s, r.x + r.w / 2, r.y + r.h / 2);
  const white = 'rgba(241,237,228,0.8)', yellow = 'rgba(226,182,76,0.85)', dark = 'rgba(30,32,36,0.12)';
  g.save();
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  for (const s of [1, -1]) {
    world(s);
    // tyre-polish tracks down each lane (subtle, under everything)
    g.fillStyle = dark;
    for (const zc of [-2.9, 0, 2.9]) for (const o of [-0.8, 0.8]) g.fillRect(6.6, zc + o - 0.14, 9.4, 0.28);
    // yellow walkway edge lines along both bulwarks, the full length of the ship
    g.fillStyle = yellow;
    for (const z of [-4.3, 4.3]) g.fillRect(0.0, z - 0.05, 15.55, 0.1);
    // white dashed lane dividers on the car deck
    g.fillStyle = white;
    for (const z of [-1.45, 1.45]) for (let x = 7.7; x < 15.4; x += 2.4) g.fillRect(x, z - 0.055, Math.min(1.4, 15.4 - x), 0.11);
    // stop line in front of the cabin (clear of the sun-deck stair)
    g.fillRect(7.45, -0.8, 0.12, 5.05);
    // direction arrows toward the ramp
    arrow(g, 9.1, 0.0, 1.9, white);
    arrow(g, 13.75, 2.9, 1.7, white);
    // hatched keep-clear boxes: the stair foot and the plank landing
    hatch(g, 12.7, -2.95, 14.05, -0.85, yellow);
    hatch(g, 14.95, -4.6, 15.95, -2.6, yellow);
    // KEEP CLEAR in the stair box, read by someone walking in from the ramp (facing -X)
    g.save(); g.translate(13.38, -1.9); g.rotate(-Math.PI / 2); stencil(g, 'KEEP CLEAR', 0, 0, 0.19, 'rgba(241,237,228,0.85)', { spacing: 0.1 }); g.restore();
    // lane numbers at the ramp end (read by drivers boarding, facing -X)
    for (const [z, n] of [[0, '2'], [2.9, '3']]) { g.save(); g.translate(15.15, z); g.rotate(-Math.PI / 2); stencil(g, n, 0, 0, 0.5, white); g.restore(); }
    // gangway landing: yellow / black hazard band on the open deck edge
    hazardBand(g, -1.8, -5.0, 1.8, -4.62);
    // rust bleeding from the freeing ports along the bulwark foot
    for (const x of [7.5, 10.5, 13.5]) {
      const gr = g.createLinearGradient(0, -4.62, 0, -4.1);
      gr.addColorStop(0, 'rgba(120,62,34,0.35)'); gr.addColorStop(1, 'rgba(120,62,34,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x + 0.05, -4.6, 0.32, 0.45, 0, 0, Math.PI); g.fill();
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.restore();
  // wear: flecks + scuffs everywhere, heavier along the wheel tracks
  const px = (X, Z, s) => [r.x + r.w / 2 - S * X * s, r.y + r.h / 2 - S * Z * s];
  const strokes = [];
  for (const s of [1, -1]) for (const zc of [-2.9, 0, 2.9]) for (const o of [-0.8, 0.8]) strokes.push({ w: S * 0.22, a: 0.3, p: [px(6.6, zc + o, s), px(16, zc + o, s)] });
  wear(g, r, { flecks: 5200, fleck: [0.6, 2.6], scuffs: 140, scuff: [8, 30], strokes, seed: 7 });
}
function arrow(g, x, z, len, color) {                               // pointing +X, tail at x
  const sw = 0.32, hw = 0.78, hl = 0.62;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, z - sw / 2); g.lineTo(x + len - hl, z - sw / 2); g.lineTo(x + len - hl, z - hw / 2); g.lineTo(x + len, z);
  g.lineTo(x + len - hl, z + hw / 2); g.lineTo(x + len - hl, z + sw / 2); g.lineTo(x, z + sw / 2); g.closePath(); g.fill();
}
function hatch(g, x0, z0, x1, z1, color) {
  g.save();
  g.beginPath(); g.rect(x0, z0, x1 - x0, z1 - z0); g.clip();
  g.strokeStyle = color; g.lineWidth = 0.12;
  for (let t = -Math.abs(z1 - z0) - 1; t < x1 - x0 + 1; t += 0.42) { g.beginPath(); g.moveTo(x0 + t, z0); g.lineTo(x0 + t + (z1 - z0), z1); g.stroke(); }
  g.restore();
  g.strokeStyle = color; g.lineWidth = 0.1;
  g.strokeRect(x0 + 0.05, z0 + 0.05, x1 - x0 - 0.1, z1 - z0 - 0.1);
}
function hazardBand(g, x0, z0, x1, z1) {
  g.save();
  g.beginPath(); g.rect(x0, z0, x1 - x0, z1 - z0); g.clip();
  g.fillStyle = 'rgba(226,182,76,0.9)'; g.fillRect(x0, z0, x1 - x0, z1 - z0);
  g.fillStyle = 'rgba(42,44,49,0.9)';
  for (let t = x0 - 1; t < x1 + 1; t += 0.36) { g.beginPath(); g.moveTo(t, z0); g.lineTo(t + 0.18, z0); g.lineTo(t + 0.18 + (z1 - z0), z1); g.lineTo(t + (z1 - z0), z1); g.closePath(); g.fill(); }
  g.restore();
}

// Kraken Lines roundel with a sail over the swell (the ferry's funnel mark / door plate), centred at the origin.
function roundel(g, R) {
  g.fillStyle = K.teal; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = K.white; g.lineWidth = R * 0.11; g.beginPath(); g.arc(0, 0, R * 0.86, 0, Math.PI * 2); g.stroke();
  // sail (mainsail + jib) above two waves
  g.fillStyle = K.white;
  g.beginPath(); g.moveTo(-R * 0.06, -R * 0.62); g.lineTo(-R * 0.06, R * 0.12); g.lineTo(-R * 0.5, R * 0.12); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(R * 0.04, -R * 0.52); g.quadraticCurveTo(R * 0.46, -R * 0.1, R * 0.42, R * 0.12); g.lineTo(R * 0.04, R * 0.12); g.closePath(); g.fill();
  g.lineWidth = R * 0.1; g.lineCap = 'round'; g.strokeStyle = K.white;
  for (const [y, a] of [[R * 0.3, 1], [R * 0.52, 0.8]]) {
    g.beginPath();
    for (let i = 0; i <= 24; i++) { const x = -R * 0.56 + (i / 24) * R * 1.12; const yy = y + Math.sin(i / 24 * Math.PI * 3) * R * 0.06 * a; if (i) g.lineTo(x, yy); else g.moveTo(x, yy); }
    g.stroke();
  }
}
// The livery band shared by the cabin faces: navy skirt, a teal swell with a white crest line, a coral pinstripe.
// Face metres: x along the face, y up from the deck (drawn with the transform set by the caller).
function liveryBand(g, x0, x1, phase) {
  const crest = (x) => 0.74 + 0.07 * Math.sin((x + phase) * 1.1) + 0.03 * Math.sin((x + phase) * 2.7 + 1.3);
  g.fillStyle = K.navy; g.fillRect(x0, 0, x1 - x0, 0.62);
  g.fillStyle = K.teal;
  g.beginPath(); g.moveTo(x0, 0.5);
  for (let x = x0; x <= x1 + 0.001; x += 0.05) g.lineTo(x, crest(x));
  g.lineTo(x1, 0.5); g.closePath(); g.fill();
  g.strokeStyle = K.white; g.lineWidth = 0.035;
  g.beginPath(); for (let x = x0; x <= x1 + 0.001; x += 0.05) { const y = crest(x) + 0.05; if (x === x0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
  g.fillStyle = K.coral; g.fillRect(x0, 0.955, x1 - x0, 0.03);
}
function faceFrame(g, r) {                                          // face metres (x right, y up) → the rect
  const S = r.w / r.m[0];
  g.setTransform(S, 0, 0, -S, r.x, r.y + r.h);
}
function drawCabinSide(g, r) {
  g.save();
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  faceFrame(g, r);
  liveryBand(g, 0, r.m[0], 0);
  // HALYARD wordmark in the navy skirt, flanked by the roundel
  g.save(); g.scale(1, -1);                                          // text wants y down
  stencil(g, 'HALYARD', r.m[0] / 2, -0.31, 0.34, K.white, { family: '"Titan One"', weight: 400, spacing: 0.12 });
  g.restore();
  for (const x of [r.m[0] / 2 - 2.35, r.m[0] / 2 + 2.35]) { g.save(); g.translate(x, 0.34); g.scale(1, -1); roundel(g, 0.25); g.restore(); }
  g.restore();
  wear(g, r, { flecks: 160, fleck: [0.4, 1.1], scuffs: 22, scuff: [6, 16], seed: 11 });
}
function drawCabinEnd(g, r) {
  g.save();
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  faceFrame(g, r);
  liveryBand(g, 0, r.m[0], 3.7);
  // big roundel + wordmark in the 3.8 m left of the sun-deck stair
  g.save(); g.translate(1.9, 1.62); g.scale(1, -1); roundel(g, 0.56); g.restore();
  g.save(); g.scale(1, -1);
  stencil(g, 'HALYARD', 1.9, -0.3, 0.3, K.white, { family: '"Titan One"', weight: 400, spacing: 0.1 });
  g.restore();
  g.restore();
  wear(g, r, { flecks: 70, fleck: [0.4, 1.1], scuffs: 10, scuff: [6, 14], seed: 13 });
}
