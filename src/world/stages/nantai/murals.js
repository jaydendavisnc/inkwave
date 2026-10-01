// Mount Nantai — stage decals / signage for the mural atlas (mural ids 4…11; see src/world/murals.js). Drawn into the
// stage region R of the atlas; each entry: its canvas rect, the face size it covers (m), where it sits on the face.
//   shock        the rehearsal hollow's floor round Pearl's rock: a ring of shockwave cracks through the turf, the
//                grass bleached pale where the blasts hit (face 8 × 12 m, centred on the rock — the mirrored hollow
//                shows the same ring)
//   inscription  carved in the first terrace's front wall: NANTAI OBSERVATORY · 1962
//   blaze        a painted trail blaze on the bastion by the hollow: red-white-red and SUMMIT ▲ 0.2 KM
//   rose         a brass compass rose set in the first terrace's paving (face 8.5 × 9.3 m since the stretch, centred; N = world −X)
//   paths        the lawn's centre (one slab across the centre line, 14.4 × 19.2 m): footpaths worn into the turf from
//                one bridge to the other and out toward the two marquees (drawn 180°-symmetric, like the stage)
export const MURAL = { shock: 4, inscription: 5, blaze: 6, rose: 7, paths: 8 };

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function drawMurals(g, R, kit) {
  const out = [];
  // ---------------------------------------------------------------- shockwave ring (8 × 12 m at 40 px/m)
  {
    const PPM = 40, W = 8 * PPM, H = 12 * PPM, x0 = R.x, y0 = R.y, cx = x0 + W / 2, cy = y0 + H / 2, r = rng(4242);
    g.save();
    // bleached ring: the grass blasted pale round the rock (soft annulus)
    const grad = g.createRadialGradient(cx, cy, 2.2 * PPM, cx, cy, 4.6 * PPM);
    grad.addColorStop(0, 'rgba(226,222,196,0.0)'); grad.addColorStop(0.08, 'rgba(226,222,196,0.42)'); grad.addColorStop(0.55, 'rgba(214,214,176,0.22)'); grad.addColorStop(1, 'rgba(214,214,176,0)');
    g.fillStyle = grad; g.fillRect(x0, y0, W, H);
    // radial cracks: jagged, forking, soil-dark, tapering
    g.lineCap = 'round'; g.lineJoin = 'round';
    const crack = (x, y, ang, len, w, depth) => {
      const steps = Math.round(len / 9);
      for (let i = 0; i < steps; i++) {
        ang += (r() - 0.5) * 0.7;
        const nx = x + Math.cos(ang) * 9, ny = y + Math.sin(ang) * 9, t = i / steps;
        g.strokeStyle = `rgba(52,42,32,${0.75 - 0.45 * t})`; g.lineWidth = Math.max(0.8, w * (1 - t));
        g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        if (depth > 0 && r() < 0.09) crack(nx, ny, ang + (r() > 0.5 ? 0.6 : -0.6), len * (0.35 + 0.2 * r()), w * 0.6, depth - 1);
        x = nx; y = ny;
      }
    };
    for (let k = 0; k < 17; k++) { const a = (k / 17) * Math.PI * 2 + (r() - 0.5) * 0.25; crack(cx + Math.cos(a) * 2.35 * PPM, cy + Math.sin(a) * 2.35 * PPM, a, (1.4 + r() * 1.9) * PPM, 3.2 + r() * 1.6, 2); }
    // broken ring cracks (arcs) where the shockwaves stopped
    for (const [rad, n] of [[3.3, 7], [4.4, 9]]) {
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2 + r() * 0.3, a1 = a0 + 0.25 + r() * 0.35;
        g.strokeStyle = 'rgba(58,48,36,0.5)'; g.lineWidth = 1.6;
        g.beginPath();
        for (let t = 0; t <= 8; t++) { const a = a0 + ((a1 - a0) * t) / 8, rr = (rad + (r() - 0.5) * 0.12) * PPM; const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr; if (t) g.lineTo(px, py); else g.moveTo(px, py); }
        g.stroke();
      }
    }
    // scattered chips of granite on the grass
    for (let k = 0; k < 60; k++) { const a = r() * Math.PI * 2, rr = (2.5 + Math.pow(r(), 1.6) * 2.6) * PPM, s = 1.5 + r() * 3; g.fillStyle = `rgba(${200 + r() * 30 | 0},${198 + r() * 30 | 0},${190 + r() * 30 | 0},0.85)`; g.beginPath(); g.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, s, s * 0.7, r() * 3, 0, Math.PI * 2); g.fill(); }
    g.restore();
    out.push({ id: MURAL.shock, x: x0, y: y0, w: W, h: H, m: [8, 12], fx: [0.3, 1] });
  }
  // ---------------------------------------------------------------- inscription (14.1 × 1.3 face; panel 8 × 0.46 m at 60 px/m)
  {
    const PPM = 60, W = 8 * PPM, H = Math.round(0.46 * PPM), x0 = R.x + 360, y0 = R.y;
    g.save();
    g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(x0, y0, W, H);
    g.font = kit.fontB(20); g.textAlign = 'center'; g.textBaseline = 'middle';
    const txt = 'NANTAI  OBSERVATORY  ·  1962';
    g.fillStyle = 'rgba(246,244,238,0.55)'; g.fillText(txt, x0 + W / 2 + 1, y0 + H / 2 + 1);   // the cut's lit lower lip
    g.fillStyle = 'rgba(58,56,52,0.85)'; g.fillText(txt, x0 + W / 2, y0 + H / 2);
    g.restore();
    out.push({ id: MURAL.inscription, x: x0, y: y0, w: W, h: H, m: [8, 0.46], place: [4.6, 8, 0.52, 0.46], fx: [0.5, 1] });
  }
  // ---------------------------------------------------------------- trail blaze (2.3 × 2.6 face; panel 0.9 × 1.1 m at 80 px/m)
  {
    const PPM = 80, W = Math.round(0.9 * PPM), H = Math.round(1.1 * PPM), x0 = R.x + 360, y0 = R.y + 60;
    g.save();
    g.clearRect(x0, y0, W, H);
    const bx = x0 + 10, bw = W - 20;
    g.fillStyle = 'rgba(196,56,48,0.92)'; g.fillRect(bx, y0 + 6, bw, 12); g.fillRect(bx, y0 + 30, bw, 12);
    g.fillStyle = 'rgba(244,242,236,0.92)'; g.fillRect(bx, y0 + 18, bw, 12);
    g.font = kit.fontB(15); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(244,242,236,0.9)';
    g.fillText('SUMMIT', x0 + W / 2, y0 + 58);
    g.fillText('▲ 0.2 KM', x0 + W / 2, y0 + 76);
    g.restore();
    out.push({ id: MURAL.blaze, x: x0, y: y0, w: W, h: H, m: [0.9, 1.1], place: [0.7, 0.9, 0.9, 1.1], fx: [0.6, 1] });
  }
  // ---------------------------------------------------------------- compass rose (8.5 × 14.3 m face at 30 px/m)
  {
    const PPM = 30, W = Math.round(8.5 * PPM), H = Math.round(14.3 * PPM), x0 = R.x + 860, y0 = R.y, cx = x0 + W / 2, cy = y0 + H / 2;
    g.save();
    g.clearRect(x0, y0, W, H);
    const brass = 'rgba(186,146,74,0.95)', brassDk = 'rgba(128,96,44,0.95)', stone = 'rgba(58,56,52,0.8)';
    const Rr = 1.9 * PPM;
    g.lineWidth = 3; g.strokeStyle = brass; g.beginPath(); g.arc(cx, cy, Rr, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, Rr - 9, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2, r0 = Rr - (i % 6 ? 4 : 8); g.lineWidth = i % 6 ? 1 : 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * Rr, cy + Math.sin(a) * Rr); g.stroke(); }
    // 16-point star, north (canvas −x = world −X) longest
    for (let i = 0; i < 16; i++) {
      const a = Math.PI + (i / 16) * Math.PI * 2, L = (i % 4 === 0 ? (i === 0 ? 1.0 : 0.82) : i % 2 === 0 ? 0.58 : 0.38) * (Rr - 12), w = i % 4 === 0 ? 0.13 : 0.1;
      for (const [s, c] of [[1, brass], [-1, brassDk]]) {
        g.fillStyle = c; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); g.lineTo(cx + Math.cos(a + s * w * 2.4) * L * 0.22, cy + Math.sin(a + s * w * 2.4) * L * 0.22); g.closePath(); g.fill();
      }
    }
    g.fillStyle = brassDk; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
    g.font = kit.fontB(15); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = stone;
    for (const [t, a] of [['N', Math.PI], ['E', -Math.PI / 2], ['S', 0], ['W', Math.PI / 2]]) g.fillText(t, cx + Math.cos(a) * (Rr + 14), cy + Math.sin(a) * (Rr + 14));
    g.font = kit.fontB(9); g.fillStyle = stone; g.fillText('NANTAI  ·  2,657 FT', cx, cy + Rr + 34);
    g.restore();
    // (since the stretch the rose sits on the terrace's front, a 9.3 m face: drawn for 14.3, lifted 2.5 m to centre on it)
    out.push({ id: MURAL.rose, x: x0, y: y0, w: W, h: H, m: [8.5, 14.3], place: [0, 8.5, -2.5, 14.3], fx: [0.4, 1] });
  }
  // ---------------------------------------------------------------- worn footpaths (14.4 × 19.2 m at 24 px/m)
  {
    const PPM = 24, W = Math.round(14.4 * PPM), H = Math.round(19.2 * PPM), x0 = R.x + 1130, y0 = R.y, r = rng(777);
    g.save();
    g.clearRect(x0, y0, W, H);
    // face coords (m, origin at the slab's min corner) → canvas: u → +x, v (world +z) → up
    const P = (wx, wz) => [x0 + (wx + 7.2) * PPM, y0 + H - (wz + 9.6) * PPM];
    const pathXZ = (t) => [1.1 * Math.sin(t * 0.3), t];                        // bridge to bridge, a lazy S
    const strokeWorn = (pts, w) => {
      for (const [a, k] of [[0.18, 1.5], [0.28, 1.0], [0.22, 0.6]]) {
        g.strokeStyle = `rgba(122,108,82,${a})`; g.lineWidth = w * PPM * k; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); pts.forEach(([x, z], i) => { const [cx, cy] = P(x, z); if (i) g.lineTo(cx, cy); else g.moveTo(cx, cy); }); g.stroke();
      }
      // grit and pebbles along the wear
      for (let i = 0; i < pts.length * 3; i++) { const [x, z] = pts[(r() * pts.length) | 0]; const [cx, cy] = P(x + (r() - 0.5) * w * 0.8, z + (r() - 0.5) * 0.6); g.fillStyle = `rgba(${150 + r() * 40 | 0},${140 + r() * 35 | 0},${118 + r() * 30 | 0},0.7)`; g.beginPath(); g.arc(cx, cy, 1 + r() * 1.6, 0, Math.PI * 2); g.fill(); }
    };
    const main = []; for (let t = -9.8; t <= 9.8; t += 0.4) main.push(pathXZ(t));
    strokeWorn(main, 1.0);
    for (const sgn of [1, -1]) {
      // a branch off the main path toward this half's marquee (the other half's is its 180° twin)
      const br = []; for (let k = 0; k <= 14; k++) { const t = k / 14, z0 = -4.6 * sgn, [xs] = pathXZ(z0); br.push([xs + (7.6 * sgn - xs) * t, z0 + 0.5 * sgn * Math.sin(t * Math.PI)]); }
      strokeWorn(br, 0.8);
    }
    g.restore();
    out.push({ id: MURAL.paths, x: x0, y: y0, w: W, h: H, m: [14.4, 19.2], fx: [0.6, 1] });
  }
  return out;
}
