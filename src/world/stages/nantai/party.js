// Mount Nantai — Grizzco's star party on the lawn: the marquee, the big Dobsonian on its crate, refractors on tripods,
// camp chairs + blankets, the projector screen with tonight's star chart, the generator, crates, string lights, bunting,
// the standing banner. (registered by props.js)
export function registerParty(D, H, T) {
  const { THREE, PI, TAU, HP } = H;
  const { K, NS, tpl, kf, hash, pbox, ccyl, seg, colC, ROOF, letters, textW, boardSign } = T;

  // ------------------------------------------------------------------------------------------ Grizzco bear logo
  // a flat bear head in a ring (paint, faces +Z): brown ring, cream disc, brown head with ears, snout
  function bearLogo(B, x, y, z, s, o = {}) {
    B.push(x, y, z, 0);
    B.cyl(NS(o.mat ?? 'paint'), o.ring ?? K.grizzBrown, 0.5 * s, 0.01, 0, 0, 0, { rx: HP, seg: 24 });
    B.cyl(NS(o.mat ?? 'paint'), o.bg ?? K.grizzCream, 0.42 * s, 0.012, 0, 0, 0.002, { rx: HP, seg: 24 });
    B.cyl(NS(o.mat ?? 'paint'), K.grizzBrown, 0.26 * s, 0.014, 0, -0.03 * s, 0.004, { rx: HP, seg: 18 });
    for (const sx of [-1, 1]) B.cyl(NS(o.mat ?? 'paint'), K.grizzBrown, 0.1 * s, 0.014, sx * 0.2 * s, 0.2 * s, 0.004, { rx: HP, seg: 12 });
    B.cyl(NS(o.mat ?? 'paint'), K.grizz, 0.11 * s, 0.016, 0, -0.1 * s, 0.006, { rx: HP, seg: 14 });
    B.cyl(NS(o.mat ?? 'paint'), K.black, 0.035 * s, 0.018, 0, -0.07 * s, 0.008, { rx: HP, seg: 8 });
    for (const sx of [-1, 1]) B.cyl(NS(o.mat ?? 'paint'), K.black, 0.028 * s, 0.018, sx * 0.1 * s, 0.05 * s, 0.008, { rx: HP, seg: 8 });
    B.pop();
  }

  // ------------------------------------------------------------------------------------------ the marquee
  // pos = ground centre, front = +Z (the side facing the lawn's centre). A 4 × 3 m pop-up marquee: steel legs, a
  // peaked canopy in Grizzco orange + brown panels, a valance lettered GRIZZCO STAR PARTY, a trestle table with the urn,
  // thermos flasks, mugs, star charts, the sign-up book; bunting from the corners. The canopy is off-limits (roof).
  const canopyGeo = (W, Dd, rise) => tpl(['canopy', W, Dd, rise].map(kf).join('|'), () => {
    const g = new T.GB(), top = [0, rise, 0], c = [[-W / 2, 0, -Dd / 2], [W / 2, 0, -Dd / 2], [W / 2, 0, Dd / 2], [-W / 2, 0, Dd / 2]];
    const cols = [[0.85, 0.47, 0.17], [0.36, 0.23, 0.15]];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      // two panels per side (orange / brown) meeting at the side's midpoint
      const m = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2];
      for (const [p, q, k] of [[a, m, 0], [m, b, 1]]) {
        const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [top[0] - p[0], top[1] - p[1], top[2] - p[2]];
        let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const col = cols[(k + i) % 2];
        const v0 = g.v(p[0], p[1], p[2], nx, ny, nz, ...col), v1 = g.v(q[0], q[1], q[2], nx, ny, nz, ...col), v2 = g.v(top[0], top[1], top[2], nx, ny, nz, ...col);
        g.tri(v0, v1, v2);
        const u0 = g.v(p[0], p[1], p[2], -nx, -ny, -nz, ...col.map((v) => v * 0.8)), u1 = g.v(q[0], q[1], q[2], -nx, -ny, -nz, ...col.map((v) => v * 0.8)), u2 = g.v(top[0], top[1], top[2], -nx, -ny, -nz, ...col.map((v) => v * 0.8));
        g.tri(u0, u1, u2);
      }
    }
    return g.geo();
  });
  D.nantai_marquee = {
    desc: 'Grizzco star-party marquee with table, urn, flasks, charts',
    build(B, o) {
      const W = 4.0, Dd = 3.0, h = 2.45, rise = 0.9;
      for (const [x, z] of [[-W / 2, -Dd / 2], [W / 2, -Dd / 2], [-W / 2, Dd / 2], [W / 2, Dd / 2]]) {
        ccyl(B, 'metal', K.steelLt, 0.04, h, x, h / 2, z, { seg: 8 });
        B.box('metal', K.steelDk, 0.2, 0.03, 0.2, x, 0.015, z, { r: 0.01 });
        colC(B, x, 0, z, 0.14, h, 0.14);
      }
      // truss eaves
      for (const [a, b] of [[[-W / 2, -Dd / 2], [W / 2, -Dd / 2]], [[W / 2, -Dd / 2], [W / 2, Dd / 2]], [[W / 2, Dd / 2], [-W / 2, Dd / 2]], [[-W / 2, Dd / 2], [-W / 2, -Dd / 2]]]) seg(B, 'metal', K.steelLt, [a[0], h, a[1]], [b[0], h, b[1]], 0.05, 0.05, { round: true });
      B.add('paint', canopyGeo(W + 0.2, Dd + 0.2, rise), '#ffffff', 0, h + 0.02, 0);
      // valance (orange band) round the eaves, lettered on the front and the back
      for (const [w, x, z, ry] of [[W + 0.2, 0, Dd / 2 + 0.1, 0], [W + 0.2, 0, -Dd / 2 - 0.1, PI], [Dd + 0.2, W / 2 + 0.1, 0, HP], [Dd + 0.2, -W / 2 - 0.1, 0, -HP]]) {
        B.push(x, h - 0.12, z, ry);
        B.box('paint', K.grizz, w, 0.32, 0.02, 0, 0, 0, { r: 0.005 });
        for (let i = 0; i < Math.round(w / 0.4); i++) B.add(NS('paint'), T.cylGeo(0.14, 0.14, 0.02, 3), K.grizz, -w / 2 + 0.2 + i * 0.4, -0.2, 0, { rx: HP, rz: PI });
        if (Math.abs(ry) < 0.01 || Math.abs(ry - PI) < 0.01) {
          letters(B, 'GRIZZCO STAR PARTY', { h: 0.15, x: 0.25, y: -0.075, z: 0.012, c: K.grizzCream, flat: true, wt: 0.22, track: 0.1 });
          bearLogo(B, -w / 2 + 0.28, 0, 0.012, 0.42);
        }
        B.pop();
      }
      B.cyl('metal', K.steelLt, 0.05, 0.25, 0, h + rise + 0.1, 0, { seg: 8 });
      // a lantern hanging from the ridge over the table (warm at dusk)
      seg(B, NS('metal'), K.black, [0, h + rise - 0.1, 0], [0, h - 0.35, -0.3], 0.012, 0.012, { round: true, seg: 4 });
      B.cyl('metal', K.black, 0.1, 0.05, 0, h - 0.33, -0.3, { seg: 10 });
      B.cyl(NS('glow'), '#ffcf86', 0.08, 0.2, 0, h - 0.47, -0.3, { seg: 10, glow: 1.3 });
      B.col(-W / 2 - 0.1, h - 0.3, -Dd / 2 - 0.1, W / 2 + 0.1, h + rise, Dd / 2 + 0.1, ROOF);
      // trestle table along the back, with the tea urn, flasks, mugs, charts, the sign-up book, a cash tin
      const tz = -0.6, th = 0.76;
      B.box('paint', K.white, 2.4, 0.05, 0.8, 0, th, tz, { r: 0.015 });
      B.box('paint', K.grizzCream, 2.44, 0.4, 0.02, 0, th - 0.22, tz + 0.41, { r: 0.005 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) seg(B, 'metal', K.steelDk, [sx * 1.1, 0, tz + sz * 0.3], [sx * 0.95, th, tz + sz * 0.3], 0.03, 0.03, { round: true });
      colC(B, 0, 0, tz, 2.4, th + 0.05, 0.8);
      B.cyl('metal', K.steelLt, 0.17, 0.5, -0.8, th + 0.28, tz, { seg: 14 });
      B.cyl('metal', K.black, 0.05, 0.08, -0.8, th + 0.56, tz, { seg: 8 });
      for (let i = 0; i < 3; i++) { B.cyl('gloss', [K.red, K.teal, K.navy][i], 0.055, 0.3, -0.35 + i * 0.16, th + 0.16, tz - 0.2, { seg: 10 }); B.cyl('metal', K.steel, 0.045, 0.05, -0.35 + i * 0.16, th + 0.33, tz - 0.2, { seg: 8 }); }
      for (let i = 0; i < 6; i++) B.cyl('paint', i % 2 ? K.grizz : K.white, 0.045, 0.1, 0.1 + (i % 3) * 0.12, th + 0.05, tz + 0.15 + Math.floor(i / 3) * 0.12, { seg: 8 });
      for (let i = 0; i < 3; i++) B.box('paint', i === 1 ? K.navy : '#e8e2d0', 0.42, 0.01, 0.3, 0.75 + i * 0.07, th + 0.03 + i * 0.012, tz + (hash(i) - 0.5) * 0.2, { ry: (hash(i * 3) - 0.5) * 0.5, r: 0.002 });
      B.box('paint', K.grizzBrown, 0.3, 0.05, 0.22, 0.45, th + 0.05, tz + 0.2, { r: 0.01 });
      B.box('metal', K.green, 0.24, 0.1, 0.16, 1.0, th + 0.07, tz + 0.25, { r: 0.01 });
      // stacked chairs + a crate of flasks under the table's end (the "table stack")
      B.box('wood', K.timber, 0.7, 0.45, 0.5, 1.45, 0.225, tz - 0.05, { r: 0.02 });
      // bunting from the front corners down to stakes
      if (o.bunting !== false) for (const sx of [-1, 1]) buntingRun(B, [sx * W / 2, h + 0.05, Dd / 2], [sx * (W / 2 + 1.6), 0.25, Dd / 2 + 1.4], 8);
    },
  };
  // bunting: small triangles along a sagging line (between two local points)
  function buntingRun(B, a, b, n, sag = 0.25) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]); }
    B.add('rubber', H.tubeGeo(pts, 0.008, 4), K.rope, 0, 0, 0);
    const cols = [K.grizz, K.grizzCream, K.grizzBrown, K.yellow];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), z = a[2] + (b[2] - a[2]) * t;
      const ang = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
      B.add(NS('paint'), T.cylGeo(0.14, 0.14, 0.01, 3), cols[i % 4], x, y - 0.1, z, { ry: ang, rx: HP, rz: PI / 2, sx: 1, sy: 1, sz: 1.4 });
    }
  }

  // ------------------------------------------------------------------------------------------ telescopes
  // the big Dobsonian on its shipping crate (pos = ground centre; the tube points toward +Z and up): cover
  D.nantai_dobsonian = {
    desc: 'big Dobsonian telescope on its crate',
    build(B) {
      // shipping crate
      B.box('wood', K.timber, 1.3, 0.72, 1.0, 0, 0.36, 0, { r: 0.03 });
      for (const y of [0.08, 0.64]) pbox(B, 'wood', K.timberDk, 1.32, 0.08, 1.02, 0, y, 0);
      for (const x of [-0.6, 0.6]) pbox(B, 'wood', K.timberDk, 0.08, 0.72, 1.02, x, 0.36, 0);
      letters(B, 'GRIZZCO', { h: 0.12, x: 0, y: 0.3, z: 0.505, c: K.grizzBrown, flat: true, wt: 0.22 });
      letters(B, 'THIS WAY UP', { h: 0.06, x: 0, y: 0.18, z: 0.505, c: K.black, flat: true, wt: 0.22 });
      // rocker box
      B.box('wood', K.grizz, 0.9, 0.62, 0.9, 0, 0.72 + 0.31, 0, { r: 0.02 });
      for (const sx of [-1, 1]) B.box('wood', K.grizz, 0.05, 0.4, 0.8, sx * 0.44, 1.34 + 0.12, 0, { r: 0.01 });
      // the tube (Ø 0.5, 1.9 m), altitude bearings, finder, eyepiece; points toward +Z, 50° up
      B.push(0, 1.5, 0, 0, -0.87);
      B.cyl('gloss', K.white, 0.27, 1.95, 0, 0, 0.35, { rx: HP, seg: 18 });
      B.cyl('paint', K.black, 0.25, 0.02, 0, 0, 1.33, { rx: HP, seg: 18 });
      B.cyl('paint', K.navy, 0.285, 0.14, 0, 0, 1.22, { rx: HP, seg: 18 });
      for (const sx of [-1, 1]) B.cyl('metal', K.black, 0.16, 0.06, sx * 0.3, 0, 0, { rz: HP, seg: 16 });
      B.cyl('metal', K.black, 0.04, 0.4, 0.2, 0.26, 0.8, { rx: HP, seg: 8 });
      B.cyl('metal', K.steelDk, 0.035, 0.12, -0.28, 0.1, 1.1, { rz: HP, seg: 8 });
      B.pop();
      // a step stool beside it
      B.box('wood', K.timberDk, 0.4, 0.4, 0.35, 0.95, 0.2, 0.2, { r: 0.02 });
      colC(B, 0, 0, 0, 1.32, 1.55, 1.02);
    },
  };
  // a refractor on a tripod (thin: no collider but the tripod's hub)
  D.nantai_refractor = {
    desc: 'refractor on a tripod, a red torch on the tray',
    build(B, o) {
      const hh = 1.25;
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.3; seg(B, 'metal', K.steelDk, [Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55], [Math.cos(a) * 0.08, hh, Math.sin(a) * 0.08], 0.035, 0.035, { round: true }); }
      B.cyl('metal', K.steelDk, 0.22, 0.02, 0, hh * 0.45, 0, { seg: 3 });
      B.box('metal', K.steel, 0.2, 0.16, 0.16, 0, hh + 0.08, 0, { r: 0.02 });
      B.push(0, hh + 0.28, 0, o.aim ?? 0, -0.55);
      B.cyl('paint', o.color ?? K.white, 0.07, 1.0, 0, 0, 0.1, { rx: HP, seg: 12 });
      B.cyl('paint', K.black, 0.08, 0.22, 0, 0, 0.55, { rx: HP, seg: 12 });
      B.cyl('metal', K.black, 0.03, 0.14, 0, 0.04, -0.5, { rx: HP, seg: 8 });
      B.pop();
      B.cyl('metal', K.steelLt, 0.02, 0.35, 0.22, hh + 0.05, 0, { rz: HP, seg: 6 });
      B.box('glow', '#ff3a2a', 0.05, 0.05, 0.12, 0.1, hh * 0.45 + 0.04, 0.05, { glow: 1.0 });   // (no collider: a tripod you walk round, never a perch)
    },
  };

  // ------------------------------------------------------------------------------------------ chairs, blankets
  // camp chairs round a tartan blanket with a thermos, a star chart, a red torch (visual; a low collider per chair)
  function campChair(B, x, z, ry, c) {
    B.push(x, 0, z, ry);
    for (const sx of [-1, 1]) { seg(B, 'metal', K.steelDk, [sx * 0.26, 0, -0.25], [sx * 0.26, 0.45, 0.2], 0.025, 0.025, { round: true }); seg(B, 'metal', K.steelDk, [sx * 0.26, 0, 0.22], [sx * 0.26, 0.85, -0.25], 0.025, 0.025, { round: true }); }
    B.box('paint', c, 0.54, 0.04, 0.42, 0, 0.44, 0, { r: 0.01, rx: 0.12 });
    B.box('paint', c, 0.54, 0.45, 0.04, 0, 0.66, -0.22, { r: 0.01, rx: -0.2 });
    for (const sx of [-1, 1]) B.box('paint', K.black, 0.06, 0.03, 0.4, sx * 0.3, 0.6, 0, { r: 0.01 });
    B.pop();
  }
  D.nantai_chairs = {
    desc: 'camp chairs, blanket, thermos, star chart',
    build(B, o) {
      const cols = [K.navy, K.green, K.red, K.plum];
      // blanket (tartan: base + stripes)
      B.box('paint', K.red, 1.7, 0.02, 1.3, 0, 0.01, 0, { r: 0.005 });
      for (let i = 0; i < 4; i++) { pbox(B, NS('paint'), K.navy, 0.08, 0.004, 1.3, -0.6 + i * 0.4, 0.022, 0); pbox(B, NS('paint'), K.grizzCream, 1.7, 0.004, 0.05, 0, 0.023, -0.45 + i * 0.3); }
      B.cyl('gloss', K.teal, 0.05, 0.32, 0.4, 0.16, 0.25, { seg: 10 });
      B.box('paint', '#e8e2d0', 0.45, 0.01, 0.34, -0.3, 0.03, 0.1, { ry: 0.3, r: 0.002 });
      B.box('glow', '#ff3a2a', 0.04, 0.04, 0.16, 0.1, 0.04, -0.3, { glow: 0.8, ry: 0.7 });
      const n = o.n ?? 3;
      for (let i = 0; i < n; i++) { const a = (i / n) * PI * 1.1 - 0.2 + (o.rot ?? 0), r = 1.25; campChair(B, Math.cos(a) * r, Math.sin(a) * r, -a - HP + (hash(i) - 0.5) * 0.4, cols[i % 4]); colC(B, Math.cos(a) * r, 0, Math.sin(a) * r, 0.5, 0.5, 0.5); }
    },
  };

  // ------------------------------------------------------------------------------------------ the projector screen
  // pos = ground centre, the screen faces +Z: a 3.2 × 2.0 m screen on a steel frame showing tonight's star chart
  // (glowing at dusk), a projector on a stand 3 m in front. The screen is cover from 0.9 m up (squids slip under).
  D.nantai_screen = {
    desc: 'projector screen with the star chart, projector',
    build(B, o) {
      const W = 3.2, Hs = 2.0, y0 = 1.0;
      for (const sx of [-1, 1]) { pbox(B, 'metal', K.steelDk, 0.08, y0 + Hs + 0.2, 0.08, sx * (W / 2 + 0.06), (y0 + Hs + 0.2) / 2, 0); seg(B, 'metal', K.steelDk, [sx * (W / 2 + 0.06), 0, -0.9], [sx * (W / 2 + 0.06), 1.8, 0], 0.05, 0.05, { round: true }); colC(B, sx * (W / 2 + 0.06), 0, -0.3, 0.14, y0 + Hs, 0.7); }
      pbox(B, 'metal', K.black, W + 0.2, Hs + 0.16, 0.05, 0, y0 + Hs / 2, 0);
      B.box('glow', '#1a2644', W, Hs, 0.02, 0, y0 + Hs / 2, 0.035, { glow: 1.0 });
      // the chart: constellations (dots + lines), the Milky Way band, a title
      const stars = [];
      for (let i = 0; i < 70; i++) stars.push([(hash(i * 1.37 + 1) - 0.5) * (W - 0.2), (hash(i * 2.11 + 5) - 0.5) * (Hs - 0.35) - 0.08]);
      for (const [x, y] of stars) { const s = 0.012 + hash(x * 13 + y) * 0.022; pbox(B, NS('glow'), '#fff4d8', s, s, 0.004, x, y0 + Hs / 2 + y, 0.048, { glow: 1.2 }); }
      const cons = [[0, 3, 7, 12, 18], [22, 25, 31, 33], [40, 44, 47, 52, 55], [60, 63, 66]];
      for (const c of cons) for (let i = 0; i < c.length - 1; i++) { const a = stars[c[i]], b = stars[c[i + 1]]; seg(B, NS('glow'), '#6f8fd0', [a[0], y0 + Hs / 2 + a[1], 0.046], [b[0], y0 + Hs / 2 + b[1], 0.046], 0.008, 0.004, { plain: true }); }
      for (let i = 0; i < 12; i++) { const t = i / 11; pbox(B, NS('glow'), '#3b4f86', 0.35, 0.22, 0.003, -W / 2 + 0.2 + t * (W - 0.4), y0 + 0.4 + t * 1.2, 0.043, { rz: 0.5, glow: 1 }); }
      letters(B, 'TONIGHT OVER NANTAI', { h: 0.12, x: 0, y: y0 + Hs - 0.22, z: 0.05, c: '#ffe2a8', flat: true, wt: 0.2, mat: 'glow', glow: 1.1 });
      colC(B, 0, y0 - 0.1, 0, W + 0.2, Hs + 0.2, 0.1);
      // projector on a stand in front
      if (o.projector !== false) {
        const pz = 3.0;
        for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; seg(B, 'metal', K.steelDk, [Math.cos(a) * 0.35, 0, pz + Math.sin(a) * 0.35], [0, 1.0, pz], 0.03, 0.03, { round: true }); }
        B.box('paint', K.steelLt, 0.36, 0.14, 0.32, 0, 1.08, pz, { r: 0.03 });
        B.cyl('metal', K.black, 0.05, 0.06, 0, 1.08, pz - 0.18, { rx: HP, seg: 10 });
        B.box('glow', '#fff4d8', 0.07, 0.07, 0.01, 0, 1.08, pz - 0.215, { glow: 1.2 });
        colC(B, 0, 0, pz, 0.4, 1.15, 0.4);
      }
    },
  };

  // ------------------------------------------------------------------------------------------ generator, crates
  D.nantai_generator = {
    desc: 'Grizzco generator on wheels + cable reel',
    build(B) {
      B.box('metal', K.grizz, 1.3, 0.75, 0.75, 0, 0.62, 0, { r: 0.06 });
      B.box('metal', K.grizzBrown, 1.34, 0.08, 0.79, 0, 1.02, 0, { r: 0.02 });
      for (let i = 0; i < 6; i++) pbox(B, NS('metal'), K.grizzDk, 0.5, 0.02, 0.02, -0.25, 0.45 + i * 0.07, 0.38);
      pbox(B, NS('metal'), K.steelDk, 0.3, 0.22, 0.02, 0.4, 0.68, 0.38);
      bearLogo(B, 0.4, 0.72, 0.39, 0.2);
      for (const sx of [-1, 1]) { B.cyl('rubber', K.rubber, 0.22, 0.12, sx * 0.5, 0.22, 0, { rz: HP, seg: 14 }); B.cyl('metal', K.steel, 0.1, 0.13, sx * 0.5, 0.22, 0, { rz: HP, seg: 10 }); }
      seg(B, 'metal', K.steelDk, [0.65, 0.5, 0], [1.2, 0.25, 0], 0.04, 0.04, { round: true });
      B.cyl('metal', K.steelDk, 0.05, 0.25, 1.22, 0.12, 0, { seg: 8 });
      ccyl(B, 'metal', K.steelLt, 0.04, 0.35, -0.4, 1.2, -0.2, { seg: 8 });
      // cable reel beside it
      B.cyl('paint', K.yellow, 0.3, 0.05, -1.0, 0.3, 0.2, { rx: HP, seg: 16 });
      B.cyl('paint', K.yellow, 0.3, 0.05, -1.0, 0.3, 0.5, { rx: HP, seg: 16 });
      B.cyl('rubber', K.black, 0.22, 0.26, -1.0, 0.3, 0.35, { rx: HP, seg: 14 });
      colC(B, 0, 0, 0, 1.4, 1.05, 0.8);
      colC(B, -1.0, 0, 0.35, 0.3, 0.6, 0.6);
    },
  };
  // Grizzco crates: a stack of n (1–3) plus a loose one (pos = ground; front +Z)
  D.nantai_crates = {
    desc: 'Grizzco crates',
    build(B, o) {
      const n = o.n ?? 2;
      const crate = (x, y, z, ry, s = 1) => {
        B.push(x, y, z, ry);
        B.box('wood', K.timber, 0.9 * s, 0.7 * s, 0.7 * s, 0, 0.35 * s, 0, { r: 0.03 });
        for (const yy of [0.06, 0.64]) pbox(B, 'wood', K.timberDk, 0.92 * s, 0.06 * s, 0.72 * s, 0, yy * s, 0);
        pbox(B, NS('paint'), K.grizz, 0.5 * s, 0.24 * s, 0.01, 0, 0.36 * s, 0.355 * s);
        bearLogo(B, -0.12 * s, 0.36 * s, 0.362 * s, 0.18 * s, { bg: K.grizz });
        letters(B, 'GRIZZCO', { h: 0.07 * s, x: 0.1 * s, y: 0.33 * s, z: 0.362 * s, c: K.grizzBrown, flat: true, wt: 0.22 });
        B.pop();
      };
      crate(0, 0, 0, 0);
      if (n > 1) crate(0.05, 0.7, 0.02, 0.12);
      if (n > 2) crate(0.95, 0, 0.1, -0.1);
      colC(B, 0, 0, 0, 0.95, 0.7 * Math.min(2, n), 0.75);
      if (n > 2) colC(B, 0.95, 0, 0.1, 0.95, 0.7, 0.75);
    },
  };


  // ------------------------------------------------------------------------------------------ working clutter
  // bin, cool box, wheelbarrow, tarp heap, leaning ladder, folded chairs, hose reel; and a power cable across the grass
  D.nantai_clutter = {
    desc: 'clutter: bin, cooler, wheelbarrow, tarp, ladder, chairstack, hose',
    build(B, o) {
      const v = o.variant ?? 'bin';
      if (v === 'bin') {
        B.cyl('metal', K.green, 0.28, 0.85, 0, 0.425, 0, { seg: 14 });
        B.cyl('metal', K.greenLt ?? '#5f8a58', 0.3, 0.06, 0, 0.87, 0, { seg: 14 });
        letters(B, 'LITTER', { h: 0.07, x: 0, y: 0.55, z: 0.285, c: K.white, flat: true, wt: 0.22 });
        colC(B, 0, 0, 0, 0.6, 0.9, 0.6);
      } else if (v === 'cooler') {
        B.box('gloss', o.color ?? K.teal, 0.62, 0.4, 0.4, 0, 0.22, 0, { r: 0.05 });
        B.box('gloss', K.white, 0.64, 0.08, 0.42, 0, 0.44, 0, { r: 0.03 });
        seg(B, 'metal', K.steelLt, [-0.25, 0.49, 0], [0.25, 0.49, 0], 0.03, 0.03, { round: true });
        colC(B, 0, 0, 0, 0.64, 0.5, 0.42);
      } else if (v === 'wheelbarrow') {
        B.push(0, 0, 0, 0, -0.08);
        B.box('metal', K.grizz, 0.7, 0.32, 1.0, 0, 0.55, 0.05, { r: 0.05 });
        B.box('paint', '#8a8578', 0.6, 0.06, 0.9, 0, 0.7, 0.05, { r: 0.03 });
        for (const s2 of [-1, 1]) seg(B, 'metal', K.steelDk, [s2 * 0.25, 0.45, -0.3], [s2 * 0.3, 0.62, -1.05], 0.035, 0.035, { round: true });
        B.cyl('rubber', K.rubber, 0.2, 0.09, 0, 0.2, 0.55, { rz: HP, seg: 14 });
        for (const s2 of [-1, 1]) seg(B, 'metal', K.steelDk, [s2 * 0.2, 0.4, -0.35], [s2 * 0.2, 0, -0.45], 0.03, 0.03, { round: true });
        B.pop();
        colC(B, 0, 0, 0, 0.75, 0.75, 1.7);
      } else if (v === 'tarp') {
        B.box('wood', K.timber, 1.4, 0.5, 1.0, 0, 0.25, 0, { r: 0.03 });
        B.sph('rubber', '#3f5c7a', 0.95, 0, 0.35, 0, { sx: 0.82, sy: 0.55, sz: 0.62, ws: 12, hs: 8 });
        for (const s2 of [-1, 1]) seg(B, NS('rubber'), K.rope, [s2 * 0.7, 0.05, -0.55], [s2 * 0.3, 0.85, 0], 0.015, 0.015, { round: true, seg: 4 });
        colC(B, 0, 0, 0, 1.5, 0.85, 1.1);
      } else if (v === 'ladder') {
        const L = o.len ?? 2.6, lean = 0.34;
        for (const s2 of [-1, 1]) seg(B, 'metal', K.steelLt, [s2 * 0.22, 0, 0], [s2 * 0.22, L * Math.cos(lean), -L * Math.sin(lean)], 0.05, 0.03, {});
        for (let i = 1; i < 8; i++) { const t = i / 8; seg(B, NS('metal'), K.steelLt, [-0.22, L * Math.cos(lean) * t, -L * Math.sin(lean) * t], [0.22, L * Math.cos(lean) * t, -L * Math.sin(lean) * t], 0.025, 0.025, { round: true, seg: 4 }); }
      } else if (v === 'chairstack') {
        for (let i = 0; i < 4; i++) { B.push(0, 0.05 + i * 0.06, i * 0.04, 0, -1.25); B.box('paint', [K.navy, K.green, K.red, K.plum][i], 0.55, 0.9, 0.05, 0, 0.45, 0, { r: 0.01 }); B.pop(); }
      } else if (v === 'hose') {
        B.cyl('metal', K.steelDk, 0.08, 0.5, 0, 0.3, 0, { rz: HP, seg: 10 });
        B.tor('rubber', K.green, 0.3, 0.06, 0, 0.35, 0, { ry: HP, rs: 6, ts: 18 });
        B.tor('rubber', K.green, 0.24, 0.06, 0, 0.35, 0, { ry: HP, rs: 6, ts: 18 });
        for (const s2 of [-1, 1]) seg(B, 'metal', K.steelDk, [s2 * 0.2, 0, 0], [s2 * 0.2, 0.4, 0], 0.04, 0.04, {});
        colC(B, 0, 0, 0, 0.5, 0.7, 0.7);
      } else if (v === 'cable') {
        const pts = (o.pts ?? [[0, 0], [2, 0.3], [4, 0]]).map(([x, z]) => [x, 0.03, z]);
        B.add(NS('rubber'), H.tubeGeo(pts, 0.025, 5), K.black, 0, 0, 0);
      }
    },
  };

  // ------------------------------------------------------------------------------------------ string lights
  // festoon: timber poles at the given local points (heights h), warm bulbs sagging between them (glow at dusk)
  D.nantai_festoon = {
    desc: 'festoon string lights on poles',
    build(B, o) {
      const pts = o.pts ?? [[0, 0], [6, 0]], hh = o.h ?? 4.2, poleAt = o.poles ?? pts.map(() => true);
      pts.forEach(([x, z], i) => { if (!poleAt[i]) return; ccyl(B, 'wood', K.timberDk, 0.07, hh, x, hh / 2, z, { seg: 7 }); B.cyl('metal', K.steelDk, 0.05, 0.1, x, hh + 0.02, z, { seg: 6 }); colC(B, x, 0, z, 0.16, hh, 0.16); });
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), sag = o.sag ?? 0.45;
        const ya = o.hs ? o.hs[i] : hh, yb = o.hs ? o.hs[i + 1] : hh;
        const line = [];
        for (let k = 0; k <= 12; k++) { const t = k / 12; line.push([ax + (bx - ax) * t, ya + (yb - ya) * t - sag * 4 * t * (1 - t), az + (bz - az) * t]); }
        B.add(NS('rubber'), H.tubeGeo(line, 0.01, 4), K.black, 0, 0, 0);
        const nb = Math.max(2, Math.round(L / 0.8));
        for (let k = 1; k < nb; k++) { const t = k / nb; B.sph(NS('glow'), '#ffd28c', 0.055, ax + (bx - ax) * t, ya + (yb - ya) * t - sag * 4 * t * (1 - t) - 0.08, az + (bz - az) * t, { ws: 8, hs: 6, glow: 1.4 }); }
      }
    },
  };

  // ------------------------------------------------------------------------------------------ standing banner
  // GRIZZCO STAR PARTY on a cloth between two poles (pos = ground centre, faces +Z), guy lines to stakes
  D.nantai_banner = {
    desc: 'standing banner: GRIZZCO STAR PARTY',
    build(B, o) {
      const W = o.w ?? 3.6, y0 = 1.4, hb = 0.8;
      for (const sx of [-1, 1]) { ccyl(B, 'metal', K.steelLt, 0.04, y0 + hb + 0.2, sx * W / 2, (y0 + hb + 0.2) / 2, 0, { seg: 8 }); colC(B, sx * W / 2, 0, 0, 0.12, y0 + hb + 0.2, 0.12); for (const sz of [-1, 1]) seg(B, NS('rubber'), K.rope, [sx * W / 2, y0 + hb, 0], [sx * (W / 2 + 0.6), 0, sz * 0.9], 0.012, 0.012, { round: true, seg: 4 }); }
      B.box('paint', K.grizz, W, hb, 0.02, 0, y0 + hb / 2, 0, { r: 0.005 });
      pbox(B, NS('paint'), K.grizzBrown, W, 0.08, 0.024, 0, y0 + 0.04, 0);
      pbox(B, NS('paint'), K.grizzBrown, W, 0.08, 0.024, 0, y0 + hb - 0.04, 0);
      for (const sz of [1, -1]) {
        B.push(0, 0, sz * 0.013, sz > 0 ? 0 : PI);
        letters(B, 'GRIZZCO', { h: 0.2, x: 0.35, y: y0 + hb / 2 + 0.02, z: 0, c: K.grizzCream, flat: true, wt: 0.22 });
        letters(B, 'STAR PARTY TONIGHT', { h: 0.11, x: 0.35, y: y0 + 0.14, z: 0, c: K.grizzBrown, flat: true, wt: 0.24 });
        bearLogo(B, -W / 2 + 0.45, y0 + hb / 2, 0.002, 0.62);
        B.pop();
      }
    },
  };
  void textW; void boardSign; void THREE;
}
