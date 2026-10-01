// Spirhalite Islands — Deep Cut's expedition: the helipad dressing (spawn), the parked helicopter on its rear pad, and
// the camp in the dune hollow (tents, tarp shelter, crates, generator, radio mast, camp table, survey kit, lanterns).
// (Prop builders; see props.js for the contract.)
export function registerCamp(D, H, X) {
  const { THREE, K, PI, TAU, HP, NS, GB, meshGeo, tpl, pbox, colBox, ROOF, RAIL, noise3, rng, lerp, clamp, col3, rockGeo } = X;
  const rod = (B, mat, c, a, b, r, radial = 6) => B.tube(mat, c, [a, b], r, { radial });
  const OCT_A = (R) => R * Math.cos(PI / 8);

  // ============================================================================================== the helipad (spawn)
  // Dresses the level's octagonal pad (body R `body` from the dune top up to 3.0, deck plate R 5.9 up to 3.2): steel
  // columns at the body's corners with X-bracing on every face, cantilever brackets and edge beams carrying the deck's
  // overhang, a fascia with edge lights (glow at dusk) round the deck, safety-net frames off the faces without stairs,
  // a windsock mast, a floodlight, handrails on both stairs (rails).
  D.spirhalite_helipad = {
    desc: 'the expedition helipad dressing: steel frame + bracing, deck fascia with edge lights, safety nets, windsock, floodlight, stair rails',
    params: { R: 'deck circumradius', base: 'body base y', top: 'deck top y', open: 'face indices without nets (0 = +x, 1 = +x+z …)' },
    variants: 1, mount: 'ground',
    build(B, o) {
      const R = o.R ?? 5.9, Rb = o.body ?? R - 0.15, y0 = o.base ?? 1.3, yt = o.top ?? 3.2, open = o.open ?? [0, 2];
      const vtx = (r, k) => { const a = PI / 8 + (k * PI) / 4; return [Math.cos(a) * r, Math.sin(a) * r]; };
      // columns at the body's corners, X-bracing on each face (just proud of the face)
      for (let k = 0; k < 8; k++) {
        const [x, z] = vtx(Rb + 0.08, k);
        B.add('metal', X.boxG(), K.steelDk, x, y0 + (yt - 0.2 - y0) / 2, z, { sx: 0.24, sy: yt - 0.2 - y0, sz: 0.24, ry: -(PI / 8 + (k * PI) / 4) });
        const [x2, z2] = vtx(Rb + 0.08, k + 1), fa = PI / 4 + (k * PI) / 4, ox = Math.cos(fa) * 0.06, oz = Math.sin(fa) * 0.06;
        const lo = y0 + 0.15, hi = yt - 0.3;
        rod(B, 'metal', K.steel, [x + ox, lo, z + oz], [x2 + ox, hi, z2 + oz], 0.05);
        rod(B, 'metal', K.steel, [x + ox, hi, z + oz], [x2 + ox, lo, z2 + oz], 0.05);
        rod(B, 'metal', K.steelDk, [x + ox, lo + 0.02, z + oz], [x2 + ox, lo + 0.02, z2 + oz], 0.06);
        // the overhang: a cantilever bracket from the column's head out under the deck's corner (a beam under the plate,
        // a knee brace down to the column), an edge beam under each face
        if (R - Rb > 0.3) {
          const [cx, cz] = vtx(Rb + 0.08, k), [ex, ez] = vtx(R - 0.12, k), bl = Math.hypot(ex - cx, ez - cz), ba = -(PI / 8 + (k * PI) / 4);
          B.add('metal', X.boxG(), K.steelDk, (cx + ex) / 2, yt - 0.37, (cz + ez) / 2, { sx: bl + 0.12, sy: 0.18, sz: 0.16, ry: ba });
          rod(B, 'metal', K.steel, [cx, yt - 1.05, cz], [lerp(cx, ex, 0.75), yt - 0.44, lerp(cz, ez, 0.75)], 0.045);
          const [ex2, ez2] = vtx(R - 0.12, k + 1);
          B.add('metal', X.boxG(), K.steelDk, (ex + ex2) / 2, yt - 0.37, (ez + ez2) / 2, { sx: Math.hypot(ex2 - ex, ez2 - ez), sy: 0.16, sz: 0.12, ry: -fa + HP });
        }
        // deck fascia (a steel channel just under the deck's edge) + edge lights at the corner and the face's middle
        const [dx, dz] = vtx(R + 0.04, k), [dx2, dz2] = vtx(R + 0.04, k + 1);
        B.add('metal', X.boxG(), K.yellow, (dx + dx2) / 2, yt - 0.13, (dz + dz2) / 2, { sx: Math.hypot(dx2 - dx, dz2 - dz), sy: 0.22, sz: 0.06, ry: -fa + HP });
        for (const f of [0, 0.5]) {
          const lx = lerp(dx, dx2, f) + Math.cos(fa) * 0.06, lz = lerp(dz, dz2, f) + Math.sin(fa) * 0.06;
          B.add(NS('metal'), tpl('lampbase', () => new THREE.CylinderGeometry(0.07, 0.08, 0.06, 8)), K.steelDk, lx, yt - 0.02, lz);
          B.sph('glow', f ? K.glowCool : K.glow, 0.07, lx, yt + 0.05, lz, { half: true, glow: 1.3 });
        }
        // safety net off the faces without a stair: a frame sloping out and down, netting between
        if (!open.includes(k)) {
          const n0 = [dx + Math.cos(fa) * 0.05, dz + Math.sin(fa) * 0.05], n1 = [dx2 + Math.cos(fa) * 0.05, dz2 + Math.sin(fa) * 0.05];
          const out = 1.25, drop = 0.35;
          const f0 = [n0[0] + Math.cos(fa) * out, n0[1] + Math.sin(fa) * out], f1 = [n1[0] + Math.cos(fa) * out, n1[1] + Math.sin(fa) * out];
          rod(B, 'metal', K.steelLt, [f0[0], yt - 0.2 - drop, f0[1]], [f1[0], yt - 0.2 - drop, f1[1]], 0.035);
          for (const t of [0.02, 0.5, 0.98]) rod(B, 'metal', K.steelLt, [lerp(n0[0], n1[0], t), yt - 0.22, lerp(n0[1], n1[1], t)], [lerp(f0[0], f1[0], t), yt - 0.2 - drop, lerp(f0[1], f1[1], t)], 0.03);
          const mx = (n0[0] + n1[0] + f0[0] + f1[0]) / 4, mz = (n0[1] + n1[1] + f0[1] + f1[1]) / 4;
          B.add(NS('fence'), tpl('netplane', () => { const g = new THREE.PlaneGeometry(1, 1); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3)); return g; }), K.steelLt, mx, yt - 0.2 - drop / 2, mz,
            { sx: Math.hypot(n1[0] - n0[0], n1[1] - n0[1]), sy: Math.hypot(out, drop), ry: -fa + HP, rx: -HP + Math.atan2(drop, out), uvs: [Math.hypot(n1[0] - n0[0], n1[1] - n0[1]) * 3, 4] });
        }
      }
      // windsock mast (back-left corner) and a floodlight (back-right)
      const [wx, wz] = vtx(R + 0.5, 5);
      B.cyl('metal', K.white, 0.07, 5.2, wx, y0 + 2.6, wz, { r2: 0.05 });
      for (let i = 0; i < 5; i++) B.cyl('metal', K.red, 0.075, 0.5, wx, y0 + 0.6 + i * 1.0, wz);
      B.push(wx, y0 + 5.1, wz, 0.6);
      B.tor('metal', K.steelDk, 0.22, 0.02, 0.05, 0, 0, { ry: HP, ts: 12 });
      for (let i = 0; i < 4; i++) { const r0 = 0.22 - i * 0.035, x0 = 0.05 + i * 0.36; B.cyl('rubber', i % 2 ? K.white : K.orange, r0 - 0.035, 0.36, x0 + 0.18, -0.02 - i * 0.05, 0, { r2: r0, rz: HP - 0.12, open: true, seg: 10 }); }
      B.pop();
      B.sph('glow', K.red, 0.09, wx, y0 + 5.28, wz, { glow: 1.6 });
      const [fx, fz] = vtx(R + 0.4, 6);
      B.cyl('metal', K.steelDk, 0.08, 3.6, fx, y0 + 1.8, fz);
      B.push(fx, y0 + 3.6, fz, Math.atan2(fx, fz) + PI);
      pbox(B, 'metal', K.steelDk, 0.6, 0.4, 0.35, 0, 0, 0, { rx: 0.5 });
      B.add('glow', tpl('fl', () => { const g = new THREE.PlaneGeometry(0.5, 0.3); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3)); return g; }), K.glowCool, 0, 0.22, 0.19, { rx: 0.5, glow: 1.2, uv: null });
      B.pop();
      // handrails: the front stair (local +z face, from the deck down to the dune) and the side stair (+x face)
      for (const st of o.stairs || []) {
        const [x0, z0, x1, z1, w] = st;            // foot centre → top centre, width
        const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, nx = -uz, nz = ux;
        for (const sd of [-1, 1]) {
          const ox = nx * sd * (w / 2 - 0.04), oz = nz * sd * (w / 2 - 0.04);
          const a = [x0 + ox, y0 + 0.95, z0 + oz], b = [x1 + ox, yt + 0.95, z1 + oz];
          rod(B, 'metal', K.steelLt, a, b, 0.035);
          rod(B, 'metal', K.steelLt, [a[0], a[1] - 0.45, a[2]], [b[0], b[1] - 0.45, b[2]], 0.025);
          for (let i = 0; i <= 3; i++) { const t = i / 3, px = lerp(x0, x1, t) + ox, pz = lerp(z0, z1, t) + oz, py = lerp(y0, yt, t); rod(B, 'metal', K.steelLt, [px, py, pz], [px, py + 0.95, pz], 0.03); }
          // rail colliders following the flight (three steps)
          for (let i = 0; i < 3; i++) {
            const ta = i / 3, tb = (i + 1) / 3, xa = lerp(x0, x1, ta) + ox, xb = lerp(x0, x1, tb) + ox, za = lerp(z0, z1, ta) + oz, zb = lerp(z0, z1, tb) + oz;
            B.col(Math.min(xa, xb) - 0.06, lerp(y0, yt, ta) - 0.1, Math.min(za, zb) - 0.06, Math.max(xa, xb) + 0.06, lerp(y0, yt, tb) + 1.0, Math.max(za, zb) + 0.06, RAIL);
          }
        }
      }
    },
  };

  // ============================================================================================== helicopter
  // A stylised utility helicopter in Deep Cut's colours (abyss navy, eel-gold stripe, dusk-purple trim), parked on its
  // pad with the rotor blades drooping, skids, a tail boom with the fin + tail rotor. Local +x = nose. Visual only.
  function fuselageGeo() {
    // lathe about the local x axis: [x, r] body stations (nose → boom joint), squashed a little in z
    const st = [[3.6, 0.0], [3.5, 0.45], [3.2, 0.82], [2.7, 1.08], [2.0, 1.22], [1.0, 1.28], [0.0, 1.27], [-1.0, 1.2], [-1.8, 1.02], [-2.4, 0.7], [-2.8, 0.46], [-3.0, 0.4]];
    const NK = 20, pos = [], idx = [], col = [];
    const cN = col3(K.dc3), cG = col3(K.dc2), cP = col3(K.dc1), cGl = col3(K.glass), cB = col3('#20222c'), c = new THREE.Color();
    for (let i = 0; i < st.length; i++) {
      const [x, r] = st[i];
      for (let k = 0; k < NK; k++) {
        const a = (k / NK) * TAU, cy = Math.cos(a), sz = Math.sin(a);
        const y = 1.35 + cy * r * (cy < 0 ? 0.82 : 1.0), z = sz * r * 0.86;
        pos.push(x, y, z);
        const up = cy;
        c.copy(cN);
        if (x > 1.2 && up > -0.15) c.copy(cGl).lerp(cB, 0.3 * (1 - up));                       // wrap-round canopy
        else if (Math.abs(up + 0.05) < 0.14) c.copy(cG);                                       // gold stripe
        else if (up < -0.55) c.copy(cP);                                                       // purple belly
        if (x < 1.2 && x > -1.3 && up > 0.05 && up < 0.62 && Math.abs(sz) > 0.6 && x > -0.2) c.copy(cGl);   // side windows
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < st.length - 1; i++) for (let k = 0; k < NK; k++) { const a = i * NK + k, b = i * NK + (k + 1) % NK, cc = (i + 1) * NK + (k + 1) % NK, d = (i + 1) * NK + k; idx.push(a, cc, b, a, d, cc); }
    return meshGeo(pos, idx, col);
  }
  D.spirhalite_helicopter = {
    desc: 'the expedition helicopter, parked (Deep Cut colours), blades drooping; visual only',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      B.add('gloss', tpl('heli-body', fuselageGeo), 'white', 0, 0, 0);
      // tail boom, fin, stabiliser, tail rotor
      B.tube('gloss', K.dc3, [[-2.9, 1.55, 0], [-5.2, 1.7, 0], [-7.6, 1.85, 0]], (t) => lerp(0.36, 0.17, t), { radial: 10 });
      pbox(B, 'gloss', K.dc2, 4.6, 0.08, 0.36, -5.1, 1.6, 0, { ry: 0 });
      B.add('gloss', tpl('fin', () => { const g = new GB(); const p = [[-7.2, 1.8], [-8.3, 1.8], [-8.6, 3.1], [-8.1, 3.15]]; const ids = p.map(([x, y]) => g.v(x, y, 0.06, 0, 0, 1)); const ids2 = p.map(([x, y]) => g.v(x, y, -0.06, 0, 0, -1)); g.quad(ids[0], ids[1], ids[2], ids[3]); g.quad(ids2[0], ids2[3], ids2[2], ids2[1]); return g.geo(); }), K.dc1, 0, 0, 0);
      pbox(B, 'gloss', K.dc3, 0.5, 0.06, 2.0, -6.9, 1.84, 0);
      B.cyl('metal', K.steelDk, 0.08, 0.28, -8.25, 2.55, 0.12, { rx: HP });
      for (const a of [0.3, 0.3 + PI]) B.add('metal', X.boxG(), K.white, -8.25, 2.55 + Math.sin(a) * 0.55, 0.3, { sx: 0.1, sy: 1.1, sz: 0.03, rz: a });
      // engine cowling, mast, hub and four drooping blades
      B.box('gloss', K.dc3, 2.4, 0.55, 1.1, -0.3, 2.62, 0, { round: true, r: 0.22 });
      pbox(B, 'metal', K.steelDk, 0.9, 0.12, 0.6, -1.3, 2.9, 0);
      B.cyl('metal', K.steelDk, 0.12, 0.55, 0, 3.18, 0);
      B.cyl('metal', K.steelDk, 0.28, 0.14, 0, 3.45, 0);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.35, L = 5.6;
        B.push(0, 3.52, 0, a);
        // a blade droops along its length: three segments bending down
        for (let s = 0; s < 3; s++) { const x0 = 0.25 + (s * L) / 3, sag = [0.02, 0.1, 0.24][s]; B.add('metal', X.boxG(), s ? K.dc3 : K.steelDk, x0 + L / 6, -sag, 0, { sx: L / 3 + 0.02, sy: 0.05, sz: 0.34, rz: -0.03 - s * 0.035 }); }
        pbox(B, 'metal', K.dc2, 0.3, 0.052, 0.345, L + 0.1, -0.44, 0, { rz: -0.1 });
        B.pop();
      }
      // skids + struts, door handles, steps
      for (const sd of [-1, 1]) {
        B.tube('metal', K.steelDk, [[2.6, 0.32, sd * 1.15], [2.3, 0.1, sd * 1.15], [-2.2, 0.1, sd * 1.15], [-2.5, 0.18, sd * 1.15]], 0.06, { radial: 8 });
        for (const x of [1.3, -1.2]) rod(B, 'metal', K.steelDk, [x, 0.1, sd * 1.15], [x, 0.6, sd * 0.78], 0.05);
        pbox(B, 'metal', K.steelDk, 0.5, 0.05, 0.22, 0.4, 0.42, sd * 1.05);
        B.sph('glow', sd > 0 ? '#9fffb0' : '#ff7a6a', 0.06, 0.2, 2.25, sd * 1.12, { glow: 1.4 });
      }
      B.blob(4.2, 2.8, -0.6, 0);
    },
  };
  // the rear pad the helicopter stands on (out of bounds, over the sea): steel deck on legs, painted H, tie-downs, a
  // cargo net over a crate pile and drums at its corner
  D.spirhalite_rearpad = {
    desc: 'the helicopter pad behind the spawn (out of bounds): steel deck on legs over the sea, H, cargo net over crates',
    params: { w: 'x size', d: 'z size', y: 'deck top' }, variants: 1, mount: 'ground',
    build(B, o) {
      const w = o.w ?? 12, d = o.d ?? 10, y = o.y ?? 1.0;
      pbox(B, 'metal', K.steel, w, 0.3, d, 0, y - 0.3, 0);
      pbox(B, 'metal', K.yellow, w + 0.1, 0.12, 0.1, 0, y - 0.28, d / 2 + 0.02);
      pbox(B, 'metal', K.yellow, w + 0.1, 0.12, 0.1, 0, y - 0.28, -d / 2 - 0.02);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl('metal', K.steelDk, 0.18, y + 1.8, sx * (w / 2 - 0.6), (y - 1.8) / 2, sz * (d / 2 - 0.6));
      for (const sx of [-1, 0, 1]) rod(B, 'metal', K.steelDk, [sx * (w / 2 - 0.6), -1.4, -d / 2 + 0.6], [sx * (w / 2 - 0.6), y - 0.35, d / 2 - 0.6], 0.07);
      // painted H + circle (white plates flush on the deck)
      pbox(B, 'paint', K.white, 0.5, 0.02, 3.2, -1.0, y, 0); pbox(B, 'paint', K.white, 0.5, 0.02, 3.2, 1.0, y, 0); pbox(B, 'paint', K.white, 1.5, 0.02, 0.45, 0, y, 0);
      B.tor(NS('paint'), K.yellow, 3.2, 0.1, 0, y + 0.01, 0, { rx: HP, ts: 40, rs: 3 });
      // crates under a cargo net, fuel drums
      for (const [x, z, s, h] of [[-4.6, -3.4, 1.0, 0], [-3.5, -3.5, 0.9, 0], [-4.1, -3.4, 0.8, 0.95]]) X.crate(B, x, y + h, z, s, 0.1);
      B.add(NS('fence'), tpl('cargonet', () => { const g = new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, PI / 2); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(1), 3)); return g; }), K.rope, -4.05, y, -3.45, { sx: 1.35, sy: 1.9, sz: 0.85, uvs: [6, 3] });
      for (let i = 0; i < 3; i++) X.drum(B, 4.3 + i * 0.7, y, -3.8, i === 1 ? K.orange : K.dc1);
    },
  };

  // ============================================================================================== camp pieces
  // crate (w = scale): planked sides, a band stencilled in Deep Cut gold, rope handles
  X.crate = (B, x, y, z, s = 1, ry = 0, stencil = true) => {
    B.push(x, y, z, ry, 0, 0, s);
    B.box('wood', K.wood, 1.0, 0.8, 0.8, 0, 0.4, 0, { r: 0.03 });
    for (const sd of [-1, 1]) { pbox(B, 'wood', K.woodDk, 1.02, 0.08, 0.82, 0, 0.36 + sd * 0.3, 0); pbox(B, 'wood', K.woodDk, 0.08, 0.8, 0.82, sd * 0.47, 0, 0); }
    if (stencil) { pbox(B, 'paint', K.dc3, 0.6, 0.2, 0.822, 0, 0.3, 0); pbox(B, 'paint', K.dc2, 0.5, 0.05, 0.824, 0, 0.36, 0); }
    B.pop();
  };
  X.drum = (B, x, y, z, c) => {
    B.cyl('metal', c, 0.29, 0.88, x, y + 0.44, z, { seg: 14 });
    for (const h of [0.28, 0.6]) B.cyl('metal', K.steelDk, 0.295, 0.035, x, y + h, z, { seg: 14 });
    B.cyl('metal', K.steel, 0.27, 0.02, x, y + 0.88, z, { seg: 14 });
  };
  D.spirhalite_crates = {
    desc: 'a stack of Deep Cut expedition crates (cover)', params: { layout: '[[x, z, level, ry], …] 1 m crates' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.layout || [[0, 0, 0, 0], [1.02, 0.05, 0, 0.04], [0.5, 0, 1, 0.1]];
      for (const [x, z, lv, ry] of L) X.crate(B, x, lv * 0.8, z, 1, ry);
      // collider: per ground crate, raised where stacked
      for (const [x, z, lv] of L) if (lv === 0) { const h = L.some(([x2, z2, l2]) => l2 === 1 && Math.abs(x2 - x) < 0.6 && Math.abs(z2 - z) < 0.6) ? 1.6 : 0.8; colBox(B, x, 0, z, 1.0, h, 0.8); }
      for (const [x, z, lv] of L) if (lv === 1 && !L.some(([x2, z2, l2]) => l2 === 0 && Math.abs(x2 - x) < 0.6 && Math.abs(z2 - z) < 0.6)) colBox(B, x, 0.8, z, 1.0, 0.8, 0.8);
      B.blob(1.8 + (o.w ?? 1) * 0.3, 1.2);
    },
  };
  // ridge tent: canvas over an A-frame, flysheet, open door flap, guy ropes + pegs. Roof collider (you slide off it).
  D.spirhalite_tent = {
    desc: 'canvas ridge tent (w × d, ridge h), door at local +z, guy ropes; roof collider', params: { w: 'width', d: 'length', h: 'ridge' },
    variants: 2, mount: 'ground',
    build(B, o) {
      const w = o.w ?? 2.6, d = o.d ?? 3.4, h = o.h ?? 2.0, c = o.variant === 1 ? K.olive : K.canvas;
      const g = tpl(`tent|${w}|${d}|${h}`, () => {
        const gb = new GB(), hw = w / 2, hd = d / 2, sag = 0.08;
        for (const sd of [-1, 1]) {
          const n = [sd * h, hw, 0], l = Math.hypot(n[0], n[1]);
          const nv = [n[0] / l, n[1] / l, 0];
          const rows = 6;
          const ids = [];
          for (let i = 0; i <= rows; i++) {
            const zz = -hd + (i / rows) * d, s2 = Math.sin((i / rows) * PI) * sag;
            ids.push([gb.v(sd * hw, 0, zz, ...nv), gb.v(0, h - s2, zz, ...nv), gb.v(sd * hw * 0.5, h * 0.5 - s2 * 1.5, zz, ...nv)]);
          }
          for (let i = 0; i < rows; i++) { gb.quad(ids[i][0], ids[i + 1][0], ids[i + 1][2], ids[i][2]); gb.quad(ids[i][2], ids[i + 1][2], ids[i + 1][1], ids[i][1]); }
        }
        // back wall + half-open door (two triangles folded back)
        const b0 = gb.v(-hw, 0, -hd, 0, 0, -1), b1 = gb.v(hw, 0, -hd, 0, 0, -1), b2 = gb.v(0, h, -hd, 0, 0, -1); gb.tri(b0, b1, b2);
        const f0 = gb.v(-hw, 0, hd, 0.3, 0, 1), f1 = gb.v(-0.25, 0, hd + 0.35, 0.3, 0, 1), f2 = gb.v(0, h, hd, 0.3, 0, 1); gb.tri(f0, f1, f2);
        const e0 = gb.v(hw, 0, hd, -0.3, 0, 1), e1 = gb.v(0.3, 0, hd + 0.3, -0.3, 0, 1), e2 = gb.v(0, h, hd, -0.3, 0, 1); gb.tri(e0, e2, e1);
        return gb.geo();
      });
      B.add('foliage', g, c, 0, 0, 0);
      // dark interior through the door, the ridge pole, guy ropes + pegs
      B.add('rubber', tpl('tentin', () => { const gb = new GB(); const a = gb.v(-0.45, 0, 0, 0, 0, 1), b2 = gb.v(0.45, 0, 0, 0, 0, 1), cc = gb.v(0, h * 0.8, 0, 0, 0, 1); gb.tri(a, b2, cc); return gb.geo(); }), '#2a2622', 0, 0, d / 2 - 0.05);
      B.cyl('wood', K.woodDk, 0.035, h + 0.12, 0, (h + 0.12) / 2, d / 2 + 0.02); B.cyl('wood', K.woodDk, 0.035, h + 0.12, 0, (h + 0.12) / 2, -d / 2 - 0.02);
      for (const sz of [-1, 1]) {
        rod(B, 'rubber', K.rope, [0, h + 0.08, sz * (d / 2 + 0.02)], [0, 0.02, sz * (d / 2 + 1.1)], 0.012, 4);
        for (const sx of [-1, 1]) rod(B, 'rubber', K.rope, [sx * w * 0.25, h * 0.5, sz * (d / 2 - 0.3)], [sx * (w / 2 + 0.8), 0.02, sz * (d / 2 - 0.1)], 0.01, 4);
      }
      B.blob(w + 0.8, d + 0.6);
      colBox(B, 0, 0, 0, w * 0.9, h * 0.85, d, ROOF);
    },
  };
  // tarp shelter: a teal tarp stretched over four poles (sloped), its corners tied off; poles are thin colliders, the
  // tarp a roof collider (nobody stands on it)
  D.spirhalite_tarp = {
    desc: 'teal tarp shelter on four poles (sloped), guy lines; thin pole colliders + roof tarp', params: { w: 'x', d: 'z', h: 'front height' },
    variants: 1, mount: 'ground',
    build(B, o) {
      const w = o.w ?? 3.6, d = o.d ?? 3.0, h = o.h ?? 2.35, hb = h - 0.45;
      const g = tpl(`tarp|${w}|${d}|${h}`, () => {
        const nx = 7, nz = 6, pos = [], idx = [], col = [];
        for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
          const u = i / nx, v = j / nz, y = lerp(hb, h, v) - Math.sin(u * PI) * Math.sin(v * PI) * 0.16;
          pos.push((u - 0.5) * w, y, (v - 0.5) * d);
          const k = 0.92 + 0.12 * Math.sin(u * 9 + v * 5); col.push(k, k, k);
        }
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
        return meshGeo(pos, idx, col);
      });
      B.add('foliage', g, K.tarp, 0, 0, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const ph = sz > 0 ? h : hb;
        B.cyl('wood', K.woodDk, 0.045, ph + 0.1, sx * (w / 2 - 0.05), (ph + 0.1) / 2, sz * (d / 2 - 0.05));
        rod(B, 'rubber', K.rope, [sx * (w / 2), ph, sz * (d / 2)], [sx * (w / 2 + 0.9), 0.02, sz * (d / 2 + 0.6)], 0.012, 4);
        colBox(B, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 0.12, ph, 0.12);
      }
      B.col(-w / 2, hb - 0.05, -d / 2, w / 2, h + 0.1, d / 2, ROOF);
    },
  };
  // generator: a boxed portable genset with a fuel can and a cable snaking off (collider)
  D.spirhalite_generator = {
    desc: 'portable generator (collider), fuel can, cable run', params: { cable: '[[x, z], …] cable points (local)' }, variants: 1, mount: 'ground',
    build(B, o) {
      B.box('gloss', K.dc2, 1.2, 0.7, 0.75, 0, 0.47, 0, { r: 0.06 });
      pbox(B, 'metal', K.steelDk, 1.3, 0.12, 0.85, 0, 0, 0);
      for (const sx of [-1, 1]) B.tube('metal', K.black, [[sx * 0.62, 0.12, -0.42], [sx * 0.62, 0.95, -0.42], [sx * 0.62, 0.95, 0.42], [sx * 0.62, 0.12, 0.42]], 0.03, { radial: 6 });
      pbox(B, 'metal', K.black, 0.5, 0.3, 0.02, 0.2, 0.3, 0.38);
      B.cyl('metal', K.steelDk, 0.05, 0.25, -0.4, 0.82, -0.15);
      B.box('gloss', K.red, 0.3, 0.38, 0.18, 0.95, 0.19, 0.2, { r: 0.03 });
      const pts = (o.cable || [[0.6, 0], [1.4, 0.8], [2.6, 0.9]]).map(([x, z]) => [x, 0.035, z]);
      B.tube(NS('rubber'), K.black, pts, 0.025, { radial: 4 });
      colBox(B, 0.1, 0, 0, 1.5, 0.95, 0.9);
      B.blob(1.8, 1.2);
    },
  };
  // radio mast: a lattice mast with guy wires, a dish, a whip antenna, the windsock and a small solar panel at its foot
  D.spirhalite_mast = {
    desc: 'expedition radio mast (lattice, guy wires, antennas, windsock, solar panel, aircraft light); thin collider', params: { h: 'height' },
    variants: 1, mount: 'ground',
    build(B, o) {
      const H = o.h ?? 7.5, r = 0.18;
      const cs = [[r, 0], [-r / 2, r * 0.866], [-r / 2, -r * 0.866]];
      for (const [x, z] of cs) rod(B, 'metal', K.steelLt, [x, 0, z], [x * 0.7, H, z * 0.7], 0.025, 5);
      for (let y = 0.4; y < H; y += 0.55) for (let i = 0; i < 3; i++) { const a = cs[i], b = cs[(i + 1) % 3], k0 = 1 - 0.3 * (y / H), k1 = 1 - 0.3 * ((y + 0.55) / H); rod(B, NS('metal'), K.steelLt, [a[0] * k0, y, a[1] * k0], [b[0] * k1, Math.min(H, y + 0.55), b[1] * k1], 0.012, 4); }
      B.cyl('metal', K.steelDk, 0.015, 2.2, 0, H + 1.1, 0);
      B.sph('glow', K.red, 0.08, 0, H + 2.25, 0, { glow: 1.6 });
      B.push(0.1, H - 1.0, 0, 0.8);
      B.add('metal', tpl('dish', () => { const g = new THREE.SphereGeometry(0.45, 14, 5, 0, TAU, 0, 0.8); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(1), 3)); return g; }), K.white, 0.35, 0, 0, { rz: HP });
      B.pop();
      for (const [x, z] of cs) rod(B, NS('rubber'), K.steelLt, [x * 0.75, H * 0.8, z * 0.75], [x * 22, 0, z * 22], 0.008, 3);
      // windsock arm
      rod(B, 'metal', K.steelDk, [0, H - 0.3, 0], [0.9, H - 0.3, 0.3], 0.02);
      B.push(0.9, H - 0.3, 0.3, -0.4);
      for (let i = 0; i < 4; i++) { const r0 = 0.16 - i * 0.025; B.cyl('rubber', i % 2 ? K.white : K.orange, r0 - 0.025, 0.28, 0.14 + i * 0.28, -0.03 - i * 0.06, 0, { r2: r0, rz: HP - 0.2, open: true, seg: 10 }); }
      B.pop();
      // solar panel + battery box at its foot
      B.push(0.9, 0, -0.6, 0.3);
      rod(B, 'metal', K.steelDk, [0, 0, 0], [0, 0.7, 0], 0.03);
      pbox(B, 'gloss', K.navy, 1.0, 0.04, 0.7, 0, 0.7, 0, { rx: -0.5 });
      pbox(B, 'metal', K.steel, 0.4, 0.3, 0.3, 0.4, 0, 0.3);
      B.pop();
      colBox(B, 0, 0, 0, 0.45, H, 0.45, ROOF);
    },
  };
  // camp table: a folding table with charts, a lantern (glow), a radio, mugs and two folding stools (collider)
  D.spirhalite_table = {
    desc: 'camp table with charts, lantern (glow), radio, stools; collider', params: {}, variants: 1, mount: 'ground',
    build(B) {
      pbox(B, 'wood', K.wood, 1.8, 0.05, 0.85, 0, 0.74, 0);
      for (const sx of [-1, 1]) { rod(B, 'metal', K.steelDk, [sx * 0.8, 0, -0.38], [sx * 0.8, 0.74, 0.38], 0.02); rod(B, 'metal', K.steelDk, [sx * 0.8, 0, 0.38], [sx * 0.8, 0.74, -0.38], 0.02); }
      // charts (paper sheets), a rolled chart, the lantern, a radio set, mugs
      pbox(B, 'wood', '#e9e1c8', 0.62, 0.006, 0.44, -0.35, 0.79, 0.02, { ry: 0.12 });
      pbox(B, 'wood', '#d8e2d5', 0.5, 0.006, 0.38, 0.1, 0.795, -0.08, { ry: -0.2 });
      B.cyl('wood', '#e6dcc0', 0.04, 0.6, 0.45, 0.83, 0.22, { rz: HP, seg: 8 });
      B.cyl('metal', K.steelDk, 0.08, 0.05, -0.72, 0.79, -0.25);
      B.cyl('glow', K.glow, 0.065, 0.16, -0.72, 0.9, -0.25, { glow: 1.4, seg: 10 });
      B.cyl('metal', K.steelDk, 0.07, 0.04, -0.72, 1.0, -0.25);
      B.tor('metal', K.steelDk, 0.06, 0.008, -0.72, 1.08, -0.25, { ts: 10 });
      B.box('metal', K.olive, 0.36, 0.2, 0.22, 0.62, 0.89, -0.2, { r: 0.02 });
      rod(B, 'metal', K.black, [0.72, 0.97, -0.25], [0.8, 1.4, -0.25], 0.006);
      for (const [x, z] of [[0.2, 0.28], [-0.05, 0.3]]) B.cyl('rubber', K.dc1, 0.04, 0.09, x, 0.835, z);
      for (const [x, z, a] of [[-0.6, 0.75, 0.3], [0.7, -0.78, -0.2]]) {
        B.push(x, 0, z, a);
        pbox(B, 'rubber', K.olive, 0.4, 0.03, 0.35, 0, 0.45, 0);
        rod(B, 'metal', K.steelDk, [-0.18, 0, -0.15], [0.18, 0.45, 0.15], 0.012); rod(B, 'metal', K.steelDk, [0.18, 0, -0.15], [-0.18, 0.45, 0.15], 0.012);
        B.pop();
      }
      colBox(B, 0, 0, 0, 1.85, 0.8, 0.9);
      B.blob(2.4, 1.6);
    },
  };
  // survey kit: a theodolite on its tripod, a ranging pole with red/white bands, a tape reel
  D.spirhalite_survey = {
    desc: 'survey tripod + theodolite, ranging pole; no collider', params: {}, variants: 1, mount: 'ground',
    build(B) {
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; rod(B, 'wood', K.yellow, [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45], [0, 1.3, 0], 0.022, 5); }
      pbox(B, 'metal', K.steelDk, 0.16, 0.05, 0.16, 0, 1.3, 0);
      B.box('gloss', K.yellow, 0.16, 0.22, 0.14, 0, 1.46, 0, { r: 0.02 });
      B.cyl('metal', K.black, 0.035, 0.22, 0.06, 1.5, 0, { rz: HP });
      for (let i = 0; i < 5; i++) B.cyl('rubber', i % 2 ? K.white : K.red, 0.025, 0.5, 1.4, i * 0.5 + 0.25, 0.3);
      B.cyl('metal', K.orange, 0.09, 0.05, 0.5, 0.09, -0.5, { rx: HP });
    },
  };
  // lantern post: a timber post with a hanging storm lantern (glow at dusk); optional string lights to the next post
  D.spirhalite_lantern = {
    desc: 'timber post with a hanging storm lantern (glow), string lights to `to` (local x, z); thin collider', params: { to: '[x, z] string lights end', h: 'post height' },
    variants: 1, mount: 'ground',
    build(B, o) {
      const h = o.h ?? 2.4;
      B.cyl('wood', K.woodDk, 0.06, h, 0, h / 2, 0);
      rod(B, 'wood', K.woodDk, [0, h - 0.15, 0], [0.35, h - 0.15, 0], 0.03);
      B.cyl('metal', K.steelDk, 0.07, 0.04, 0.35, h - 0.52, 0);
      B.cyl('glow', K.glow, 0.06, 0.18, 0.35, h - 0.48, 0, { glow: 1.5, seg: 10 });
      B.cyl('metal', K.steelDk, 0.075, 0.05, 0.35, h - 0.3, 0);
      rod(B, 'metal', K.steelDk, [0.35, h - 0.25, 0], [0.35, h - 0.15, 0], 0.006);
      if (o.to) {
        const [tx, tz] = o.to, n = Math.max(3, Math.round(Math.hypot(tx, tz) / 0.8));
        const pts = [];
        for (let i = 0; i <= n; i++) { const t = i / n; pts.push([tx * t, h - 0.1 - Math.sin(t * PI) * 0.45, tz * t]); }
        B.tube(NS('rubber'), K.black, pts, 0.008, { radial: 3 });
        for (let i = 1; i < n; i++) B.sph('glow', i % 3 === 0 ? '#ffe7b0' : i % 3 === 1 ? '#ffd08a' : '#fff0d0', 0.045, pts[i][0], pts[i][1] - 0.06, pts[i][2], { glow: 1.6, ws: 6, hs: 4 });
      }
      colBox(B, 0, 0, 0, 0.14, h, 0.14);
    },
  };
  // portable work light: a tripod with a floodlight head aimed at the ruins (glows at dusk), its cable snaking off
  D.spirhalite_worklight = {
    desc: 'expedition work light on a tripod aimed at the ruins (glow), cable; thin collider', params: { h: 'head height', tilt: 'head tilt' },
    variants: 1, mount: 'ground',
    build(B, o) {
      const h = o.h ?? 2.3, tilt = o.tilt ?? 0.35;
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; rod(B, 'metal', K.steelDk, [Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55], [0, h * 0.7, 0], 0.025, 5); }
      B.cyl('metal', K.steel, 0.03, h * 0.35, 0, h * 0.7 + h * 0.175, 0);
      pbox(B, 'metal', K.steelDk, 0.9, 0.05, 0.08, 0, h, 0);
      for (const sx of [-0.28, 0.28]) {
        B.push(sx, h + 0.1, 0.05, 0, -tilt);
        pbox(B, 'metal', K.dc2, 0.42, 0.3, 0.2, 0, -0.15, 0);
        B.add('glow', tpl('wlface', () => { const g = new THREE.PlaneGeometry(0.34, 0.22); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3)); return g; }), K.glowCool, 0, 0, 0.105, { glow: 1.5 });
        B.pop();
      }
      B.tube(NS('rubber'), K.black, [[0, h * 0.7, 0], [0.2, 0.05, -0.2], [0.9, 0.03, -1.0], [1.8, 0.03, -1.3]], 0.02, { radial: 4 });
      colBox(B, 0, 0, 0, 0.3, h, 0.3);
    },
  };
  // survey stakes: a string grid pegged out over a patch of sand with little marker flags (no collider)
  D.spirhalite_stakes = {
    desc: 'survey stakes + string grid + marker flags over a dig patch (no collider)', params: { w: 'x', d: 'z', n: 'cells x' }, variants: 1, mount: 'ground',
    build(B, o) {
      const w = o.w ?? 3, d = o.d ?? 2, n = o.n ?? 3, m = Math.max(1, Math.round((n * d) / w));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) if (i === 0 || j === 0 || i === n || j === m) { const x = -w / 2 + (i * w) / n, z = -d / 2 + (j * d) / m; B.cyl('wood', K.wood, 0.02, 0.4, x, 0.2, z, { seg: 5 }); }
      for (let i = 0; i <= n; i++) { const x = -w / 2 + (i * w) / n; rod(B, NS('rubber'), K.white, [x, 0.36, -d / 2], [x, 0.36, d / 2], 0.006, 3); }
      for (let j = 0; j <= m; j++) { const z = -d / 2 + (j * d) / m; rod(B, NS('rubber'), K.white, [-w / 2, 0.36, z], [w / 2, 0.36, z], 0.006, 3); }
      for (const [x, z, c] of [[-w / 2 - 0.4, 0.2, K.red], [w / 2 + 0.3, -0.5, K.yellow], [0.2, d / 2 + 0.4, K.orange]]) {
        B.cyl('metal', K.steelDk, 0.008, 0.7, x, 0.35, z, { seg: 4 });
        pbox(B, NS('rubber'), c, 0.16, 0.1, 0.005, x + 0.08, 0.58, z);
      }
      B.cyl('wood', K.woodDk, 0.12, 0.35, w / 2 + 0.2, 0.17, d / 2 + 0.1, { seg: 10 });
    },
  };
  // solar path lights: little stakes with a glowing cap, a row of them from `to` (local x, z) (no collider)
  D.spirhalite_pathlights = {
    desc: 'solar path-light stakes (glow at dusk): a row from the origin to `to`, or at `pts`; no collider', params: { to: '[x, z]', n: 'count', pts: '[[x, z], …] (local)' }, variants: 1, mount: 'ground',
    build(B, o) {
      const [tx, tz] = o.to || [4, 0], n = o.n ?? 4;
      const pts = o.pts || Array.from({ length: n }, (_, i) => { const t = n > 1 ? i / (n - 1) : 0; return [tx * t, tz * t]; });
      for (const [x, z] of pts) {
        B.cyl(NS('metal'), K.steelDk, 0.018, 0.42, x, 0.21, z, { seg: 5 });
        B.cyl(NS('metal'), K.black, 0.05, 0.03, x, 0.44, z, { seg: 8 });
        B.cyl('glow', K.glow, 0.045, 0.07, x, 0.49, z, { glow: 1.5, seg: 8 });
        pbox(B, NS('gloss'), K.navy, 0.1, 0.012, 0.1, x, 0.53, z);
      }
    },
  };
  // fuel drums on a pallet, a jerrycan, a coil of hose (cover: collider)
  D.spirhalite_drums = {
    desc: 'fuel drums (Deep Cut purple / orange) on a pallet, jerrycan, hose (collider)', params: {}, variants: 1, mount: 'ground',
    build(B) {
      pbox(B, 'wood', K.wood, 1.6, 0.14, 1.2, 0, 0, 0);
      X.drum(B, -0.4, 0.14, -0.28, K.dc1); X.drum(B, 0.32, 0.14, -0.28, K.orange); X.drum(B, -0.4, 0.14, 0.32, K.orange);
      B.box('gloss', K.red, 0.3, 0.4, 0.16, 0.45, 0.34, 0.35, { r: 0.03 });
      B.tor(NS('rubber'), K.black, 0.28, 0.035, 0.85, 0.05, -0.6, { rx: HP, ts: 16 });
      colBox(B, 0, 0, 0, 1.6, 1.05, 1.25);
    },
  };
  // the camp sign's two posts and its little shingle roof (the board itself is a level piece carrying mural 8)
  D.spirhalite_signposts = {
    desc: 'two timber posts + a shingle cap for the camp sign board (w apart)', params: { w: 'post spacing' }, variants: 1, mount: 'ground',
    build(B, o) {
      const w = o.w ?? 2.4;
      for (const sx of [-1, 1]) { pbox(B, 'wood', K.woodDk, 0.14, 2.05, 0.14, sx * w / 2, 0, 0); colBox(B, sx * w / 2, 0, 0, 0.16, 2.05, 0.16); }
      pbox(B, 'wood', K.woodDk, w + 0.6, 0.06, 0.34, 0, 2.02, 0, { rx: 0.12 });
      pbox(B, 'wood', K.wood, w + 0.5, 0.05, 0.3, 0, 1.96, 0.02);
      B.sph('glow', K.glow, 0.06, 0, 1.9, 0.14, { glow: 1.4 });
    },
  };
  // expedition flagpole: a banner with Deep Cut's colours (cloth instanced by the kit)
  D.spirhalite_flagpole = {
    desc: 'expedition flagpole with a Deep Cut coloured flag', params: { h: 'height', color: 'flag colour' }, variants: 1, mount: 'ground',
    build(B, o) {
      const h = o.h ?? 4.2;
      B.cyl('metal', K.steelLt, 0.05, h, 0, h / 2, 0, { r2: 0.035 });
      B.sph('metal', K.dc2, 0.07, 0, h + 0.03, 0);
      B.flag(0.05, h - 0.1, 0, { color: o.color ?? K.dc1 });
      colBox(B, 0, 0, 0, 0.12, h, 0.12);
    },
  };

  // ============================================================================================== campfire
  // The expedition's campfire: a ring of beach stones, crossed driftwood logs, glowing embers and low flames (they read
  // at dusk), a cooking pot on a tripod, a log to sit on and a kettle. Low: its collider is a step (the logs + stones).
  D.spirhalite_campfire = {
    desc: 'campfire: stone ring, crossed logs, glowing embers + flames, pot on a tripod, a seat log (low step collider)',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      const R0 = rng(907);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + R0() * 0.2, r = 0.62 + R0() * 0.06;
        B.add('rubber', rockGeo(80 + i, 0, 1.0, 0.65, 0.9, 0.3), i % 2 ? K.rock : K.rockDk, Math.cos(a) * r, 0.05, Math.sin(a) * r, { s: 0.16 + R0() * 0.05, ry: a, ao: false });
      }
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI + 0.3;
        B.cyl('wood', i % 2 ? K.driftDk : K.woodDk, 0.07, 0.95, 0, 0.13, 0, { rx: HP, rz: 0, ry: a, seg: 6 });
      }
      B.cyl(NS('glow'), K.orange, 0.34, 0.05, 0, 0.06, 0, { glow: 1.5, seg: 10 });
      for (const [x, z, h, r, c] of [[0, 0, 0.55, 0.16, K.orange], [0.1, 0.06, 0.38, 0.11, K.yellow], [-0.09, -0.05, 0.42, 0.1, K.yellow]]) {
        B.add(NS('glow'), tpl('flame', () => { const g = new THREE.ConeGeometry(1, 1, 7); g.translate(0, 0.5, 0); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(1), 3)); return g; }), c, x, 0.08, z, { sx: r, sy: h, sz: r, glow: 1.8 });
      }
      // tripod + pot
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; rod(B, 'metal', K.steelDk, [Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55], [0, 1.05, 0], 0.018, 5); }
      B.cyl('metal', K.black, 0.15, 0.2, 0, 0.62, 0, { r2: 0.17, seg: 10 });
      rod(B, 'metal', K.steelDk, [0, 1.02, 0], [0, 0.74, 0], 0.008, 4);
      // a seat log and a kettle on a stone
      B.cyl('wood', K.drift, 0.17, 1.4, 1.35, 0.17, 0.25, { rx: HP, ry: 0.35, seg: 8 });
      B.cyl('metal', K.steel, 0.09, 0.14, -0.95, 0.07, 0.5, { r2: 0.07, seg: 8 });
      colBox(B, 0, 0, 0, 1.45, 0.3, 1.45);
      colBox(B, 1.35, 0, 0.25, 1.4, 0.33, 0.5);
    },
  };
}
