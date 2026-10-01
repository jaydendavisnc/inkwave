// Spirhalite Islands — the log bridges across the lagoons and the expedition's shore ropes: Deep Cut lashed big side logs
// onto each bridge and strung rope handrails on driftwood posts above them; round the pillar islets, at the bridge
// landings and along the causeway's edges they set the posts on a kerb of old stone blocks (the ruins' own) and ran the
// rope along it, so nobody walks — or swims — off the edge into the lagoon.
// Colliders: the side logs and the kerb stones are solid (you see them; over the kids' step-up, squids can't slip past);
// the rope above them is a rail (kids blocked; shots, ink and squids pass). (Prop builders; see props.js for the contract.)
export function registerBridges(D, H, X) {
  const { K, NS, pbox, RAIL, rng, lerp } = X;
  const KERB = 0.45;   // kerb stones' height (over PLAYER.stepUp 0.35)

  // a post: a weathered driftwood stake, a little crooked, a rope lashing round its head
  const post = (B, x, y, z, h, R0) => {
    const lean = (R0() - 0.5) * 0.06;
    B.cyl('wood', R0() < 0.5 ? K.drift : K.driftDk, 0.075, h, x, y + h / 2, z, { r2: 0.06, rz: lean, seg: 7 });
    B.cyl(NS('wood'), K.rope, 0.085, 0.07, x, y + h - 0.16, z, { seg: 7 });
  };
  // a rope between two points, sagging (s = sag at the middle)
  const rope = (B, a, b, sag) => {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) - sag * 4 * t * (1 - t), lerp(a[2], b[2], t)]); }
    B.tube(NS('wood'), K.rope, pts, 0.022, { radial: 5 });
  };

  // ============================================================================================== kerb + rope fence
  // Along local +x from the origin, L long: a kerb of worn stone blocks (KERB high, solid) with driftwood posts on it
  // and two sagging ropes (h: post height over the kerb; the rope's rail collider sits on the stones).
  // o.bare: posts and rope only (no kerb) — where the edge is already solid.
  D.spirhalite_ropefence = {
    desc: 'a kerb of worn stone blocks (solid) with driftwood posts and two sagging ropes on it (rail) along local +x',
    params: { L: 'length (m)', h: 'post height over the kerb', seed: 'wobble', bare: 'no kerb' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.L ?? 3, R0 = rng(o.seed ?? 5), n = Math.max(1, Math.round(L / 1.5)), kb = o.bare ? 0 : KERB, h = o.h ?? (o.bare ? 1.05 : 0.8);
      if (!o.bare) {
        const nb = Math.max(1, Math.round(L / 0.85)), bl = (L + 0.3) / nb;
        for (let i = 0; i < nb; i++) {
          const x = -0.15 + (i + 0.5) * bl, hh = KERB + 0.1 + (R0() - 0.5) * 0.06, c = [K.stone, K.stoneLt, K.stoneDk][Math.floor(R0() * 3)];
          B.box('rubber', c, bl - 0.05, hh, 0.46 + (R0() - 0.5) * 0.06, x, hh / 2 - 0.1, (R0() - 0.5) * 0.04, { r: 0.07, ry: (R0() - 0.5) * 0.06 });
        }
        B.col(-0.2, -0.45, -0.24, L + 0.2, KERB, 0.24);
      }
      for (let i = 0; i <= n; i++) post(B, (i / n) * L, kb - 0.05, 0, h, R0);
      for (let i = 0; i < n; i++) {
        const x0 = (i / n) * L, x1 = ((i + 1) / n) * L;
        rope(B, [x0, kb + h - 0.16, 0], [x1, kb + h - 0.16, 0], 0.1);
        rope(B, [x0, kb + h * 0.5, 0], [x1, kb + h * 0.5, 0], 0.07);
      }
      B.col(-0.16, o.bare ? -0.45 : KERB, -0.16, L + 0.16, kb + h + 0.1, 0.16, RAIL);
    },
  };

  // ============================================================================================== log bridge
  // Dressing for a level log-bridge box (the deck: w wide, len long along local z, its top `top` over the origin): a row
  // of logs for the deck, a big side log along each edge (solid: a kerb), cross-lashings, posts on the side logs with a
  // rope handrail (rail), a few loose planks.
  D.spirhalite_logbridge = {
    desc: 'log bridge dressing: deck logs, big lashed side logs (solid kerbs), driftwood posts + rope handrails (rails)',
    params: { len: 'deck length (local z)', w: 'deck width', top: 'deck top y' }, variants: 1, mount: 'ground',
    build(B, o) {
      const len = o.len ?? 6, w = o.w ?? 3, top = o.top ?? 0.25, R0 = rng(o.seed ?? 11);
      const nLog = Math.round(w / 0.36);
      for (let i = 0; i < nLog; i++) {
        const x = -w / 2 + (i + 0.5) * (w / nLog), r = (w / nLog) * 0.5;
        B.cyl('wood', i % 3 ? K.drift : K.driftDk, r, len - 0.1, x, top - r * 0.45, (R0() - 0.5) * 0.08, { rx: Math.PI / 2, seg: 7 });
      }
      // side logs: thick trunks along both edges (their tops 0.42 over the deck), the lashings binding the deck to them
      const sr = 0.28, sy = top + 0.14;
      for (const sd of [-1, 1]) B.cyl('wood', K.driftDk, sr, len + 0.4, sd * (w / 2 - 0.2), sy, 0, { rx: Math.PI / 2, seg: 9 });
      const nL = Math.max(2, Math.round(len / 1.4));
      for (let i = 0; i <= nL; i++) {
        const z = -len / 2 + 0.3 + (i / nL) * (len - 0.6);
        pbox(B, NS('wood'), K.rope, w - 0.5, 0.05, 0.1, 0, top + 0.02, z);
        for (const sd of [-1, 1]) B.tor(NS('wood'), K.rope, sr + 0.02, 0.03, sd * (w / 2 - 0.2), sy, z, { ry: Math.PI / 2, ts: 10, rs: 4 });
      }
      // posts on the side logs + rope handrails; the side logs are solid, the rope a rail
      const nP = Math.max(2, Math.round(len / 1.6)), h = 0.8, pb = sy + sr - 0.05;
      for (const sd of [-1, 1]) {
        const x = sd * (w / 2 - 0.2);
        for (let i = 0; i <= nP; i++) post(B, x, pb, -len / 2 + 0.15 + (i / nP) * (len - 0.3), h, R0);
        for (let i = 0; i < nP; i++) {
          const z0 = -len / 2 + 0.15 + (i / nP) * (len - 0.3), z1 = -len / 2 + 0.15 + ((i + 1) / nP) * (len - 0.3);
          rope(B, [x, pb + h - 0.16, z0], [x, pb + h - 0.16, z1], 0.12);
          rope(B, [x, pb + h * 0.5, z0], [x, pb + h * 0.5, z1], 0.08);
        }
        B.col(x - sr, -0.45, -len / 2 - 0.2, x + sr, sy + sr, len / 2 + 0.2);
        B.col(x - 0.15, sy + sr, -len / 2 - 0.1, x + 0.15, pb + h + 0.1, len / 2 + 0.1, RAIL);
      }
      // a couple of loose planks and a coil of spare rope at one end
      pbox(B, 'wood', K.wood, 0.28, 0.05, 1.3, -w / 2 + 0.75, top + 0.02, len / 2 - 1.1, { ry: 0.2 });
      B.tor(NS('wood'), K.rope, 0.2, 0.05, w / 2 - 0.75, top + 0.06, -len / 2 + 0.7, { rx: Math.PI / 2, ts: 12, rs: 5 });
    },
  };
}
