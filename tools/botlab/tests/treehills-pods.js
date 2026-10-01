// Eco-Forest Treehills — the sprout pods on the stage (page script for tools/botlab/page.cjs; the engine's own tests run
// on the podbox arena, tools/botlab/tests/pods.js — this checks the stage's pods, placements and looks):
//   MAP=treehills MODE=turf|tower|boss PAGE=tools/botlab/tests/treehills-pods.js tools/botlab/run.sh tools/botlab/page.cjs
// (turf runs ~2 min: give it WATCHDOG=420000)
// turf: the layout (8 listed → 16: a half's 2 rill gates, 2 flank gates, 2 zone bulwarks and 2 canopies; the stage's
// planters by kind, the seeds on the soil, mirror twins; the rill hedge and the flank gates' hedgerows). Each gate
// closes the route it's across — on the player's graph (the nav's edges + what a kid really does: climbs onto anything
// ≤ 1.8 m up within 2.3 m, drops, hops over low things) the way across and round and what the key routes through it
// pay; then physically: a kid stepped on its own (actor.update) searches for the shortest way round (walks and hops in
// 8 headings from spot to spot, A* on the distance run) from both sides of each gate — the way round must never go
// over a grown wall or a hedge (a leak). The guard-rails, with EVERY wall on the half grown (gates and bulwarks): the
// same search from mid to the base finds a route, then another with that route's corridor walled off (≥ 2 routes),
// nothing is cut off, each zone keeps ≥ 2 ways in, the side zone and the tower checkpoint on the potting deck stay
// reachable; with the bulwarks grown each zone keeps every way in; the potting deck still sees mid; every canopy — what
// its platform overlooks, a kid stands on it, an enemy can't board it; the owners climb both kinds here; the looks in
// the grower's ink; shoving (never into the reservoir); the wilt carries riders down. tower: no plant sits on the track
// (every pod plays), every hedge and plant clears the track; boss: plants stop the charge, walking into one tramples it.
(async () => {
  const g = window.__inkwave, m = g.match, dbg = g.debug, L = __G.level, Ph = __G.physics, nav = __G.nav;
  const THREE = await import('three');
  const { PLAYER } = await import('./src/config.js');
  const { navNodesInBox } = await import('./src/game/stageKit.js');
  const { GATES, HEDGES } = await import('./src/world/stages/treehills/layout.js');
  const RL = GATES.rill;
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info: info === undefined ? undefined : JSON.parse(JSON.stringify(info)) });
  const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
  dbg.freeze();
  const P = m.pods;
  const step = (s) => { const n = Math.max(1, Math.round(s * 60)); for (let i = 0; i < n; i++) dbg.step(1000 / 60); };
  R('pods on the stage (8 listed, mirrored: 16 — a half\'s 4 gates, 2 bulwarks and 2 canopies)', !!P && P.pods.length === 16 && P.pods.filter((p) => p.kind === 'wall').length === 12,
    { n: P && P.pods.length, kinds: P && P.pods.map((p) => p.id + ':' + p.kind), mode: m.mode });
  if (!P) return out;
  m.duration = 99999; m.time = m.duration - P.t;
  const intents = new Map();
  for (const a of m.actors) if (a.bot) { a.bot._up0 = a.bot.update; a.bot.update = () => { const it = a.intent; it.move.set(0, 0, 0); it.fire = it.squid = it.jump = it.sub = it.special = false; const f = intents.get(a); if (f) f(a, it); }; }
  const A = m.actors.filter((a) => a.team === 0), Bt = m.actors.filter((a) => a.team === 1);
  const byId = (id) => P.pods.find((p) => p.id === id);
  const W = (p, lx, ly, lz) => new THREE.Vector3(p.x + lx * p.c + lz * p.s, p.y + ly, p.z - lx * p.s + lz * p.c);
  const dirW = (p, lx, lz) => W(p, lx, 0, lz).sub(W(p, 0, 0, 0));
  const loc = (p, v) => [(v.x - p.x) * p.c - (v.z - p.z) * p.s, (v.x - p.x) * p.s + (v.z - p.z) * p.c];
  const place = (a, v, squid = false) => { a.pos.copy(v); a.vel.set(0, 0, 0); a.grounded = false; a.form = squid ? 'squid' : 'kid'; a.climbing = false; };
  const home = (a, i) => { const pd = L.spawnPads[a.team]; a.pos.set(pd.x + (i % 4) - 1.5, pd.y + 0.1, pd.z); a.vel.set(0, 0, 0); };
  const grown = (p, team) => { P.grow(p, team, P.t - 1); step(2 / 60); };
  const onPlant = (a, p) => P.hedgeUnder(a) === p;
  const v = new THREE.Vector3(), d = new THREE.Vector3();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // (Alpha's; Bravo's are the mirror)
  const gates = ['stones-gate', 'footbridge-gate', 'strip-gate', 'lobe-gate'].map(byId), bulwarks = ['plaza-bulwark', 'zone-bulwark'].map(byId);
  const walls = [...gates, ...bulwarks];

  // ---- the layout
  const looks = g.podLooks;
  const stageCols = P.pods.map((p) => L.blocks.filter((b) => !b.dynamic && b.hidden && Math.hypot(b.center.x - p.x, b.center.z - p.z) < 0.02 && Math.abs(b.center.y - (p.y + 0.25)) < 0.02));
  const hs = (b) => [b.half.x, b.half.z].sort((a, c) => a - c), cs = (p) => [p.def.col[0] / 2, p.def.col[2] / 2].sort((a, c) => a - c);
  const sizeOk = P.pods.every((p, i) => stageCols[i].length === 1 && hs(stageCols[i][0]).every((h, k) => Math.abs(h - cs(p)[k]) < 0.01));
  R('the planters are the stage\'s props by kind (a 1.6 × 0.7 trough for a wall, a 1.1 tub for a canopy; one collider each); the engine draws the seeds on the soil, no planters',
    sizeOk && looks && looks.items.length === 16 && looks.items.every((it) => !it.planter && it.bulb.children.length > 0 && Math.abs(it.pivot.position.y - 0.46) < 1e-6),
    { colliders: stageCols.map((c, i) => [P.pods[i].id, c.length, c[0] && [r2(c[0].half.x * 2), r2(c[0].half.z * 2)]]) });
  let mir = true;
  for (let i = 0; i < P.pods.length; i += 2) { const a = P.pods[i], b = P.pods[i + 1]; if (Math.abs(a.x + b.x) > 1e-6 || Math.abs(a.z + b.z) > 1e-6 || Math.abs(Math.cos(a.yaw) + Math.cos(b.yaw)) > 1e-6 || a.kind !== b.kind) mir = false; }
  R('mirror twins', mir, P.pods.map((p) => [p.id, r2(p.x), r2(p.y), r2(p.z), Math.round(p.yaw * 180 / Math.PI)]));
  // the rill hedge's lengths between its gates and the flank gates' hedgerows (static, off-limits tops, never inked), both
  // halves; each gate 2.6 m tall like the hedges and 4–6 m across; each bulwark 3–4 m
  const cuts = RL.gates.map((q) => [q.x - q.len / 2, q.x + q.len / 2]).sort((a, b) => a[0] - b[0]);
  const spans = []; { let a = RL.x0; for (const [c0, c1] of cuts) { spans.push([a, c0]); a = c1; } spans.push([a, RL.x1]); }
  const pieces = [...spans.map(([a, b]) => ({ x: (a + b) / 2, y: 0, z: RL.z, w: b - a, h: RL.h })), ...HEDGES];
  const hedgeIds = new Set(), hedgeHits = [];
  for (const sg of [1, -1]) for (const q of pieces) {
    const x = sg * q.x, z = sg * q.z;
    const bl = L.blocks.filter((k) => !k.dynamic && k.roof && k.hidden && Math.abs(k.center.x - x) < 0.3 && Math.abs(k.center.z - z) < 0.3 && Math.abs(Math.max(k.half.x, k.half.z) * 2 - q.w) < 0.1 && Math.abs(k.aabbMax.y - (q.y + q.h)) < 0.05);
    for (const k of bl) hedgeIds.add(k.id);
    hedgeHits.push([r1(x), r1(q.y), r1(z), bl.length]);
  }
  // (the hedges' topiary posts too: roof columns 0.3 m taller at their ends)
  for (const k of L.blocks) if (!k.dynamic && k.roof && k.hidden && Math.abs(k.half.x - 0.55) < 0.3 && pieces.some((q) => [1, -1].some((sg) => Math.hypot(k.center.x - sg * q.x, k.center.z - sg * q.z) < q.w / 2 + 0.6 && Math.abs(k.aabbMax.y - (q.y + q.h + 0.3)) < 0.05))) hedgeIds.add(k.id);
  R(`the hedges: the rill's ${spans.length} lengths and the flank gates' ${HEDGES.length} hedgerows a half (off-limits tops, ≤ 3 m); the gates as tall and 4–6 m across, the bulwarks 3–4 m`,
    hedgeHits.every((h) => h[3] >= 1) && pieces.every((q) => q.h <= 3) && gates.every((p) => Math.abs(p.h - RL.h) < 1e-6 && p.w >= 4 && p.w <= 6) && bulwarks.every((p) => p.w >= 3 && p.w <= 4),
    { pieces: hedgeHits, gates: gates.map((p) => [p.id, p.w, p.h]), bulwarks: bulwarks.map((p) => [p.id, p.w, p.h]) });

  if (m.mode === 'turf' || m.mode === 'zones') {
    // ---- the player's graph: the nav's edges + what a kid does that bots don't — climbs onto anything up to 1.8 m
    // higher within 2.3 m (a hop tops out 1.41 m, ledgeAssist lands it 0.35 m above that), drops, hops over low things
    const PN = nav.nodes.length, padj = nav.nodes.map((n) => n.nb.map((e) => [e.to, e.cost]));
    const has = (a, b) => padj[a].some((e) => e[0] === b);
    const hi0 = new THREE.Vector3(), hd0 = new THREE.Vector3();
    for (const n of nav.nodes) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dz) continue;
      const jx = n.ix + dx, jz = n.iz + dz; if (jx < 0 || jz < 0 || jx >= nav.nx || jz >= nav.nz) continue;
      for (const qid of nav.cells[jz * nav.nx + jx]) {
        const q = nav.nodes[qid], dy = q.y - n.y, hd = Math.hypot(q.x - n.x, q.z - n.z);
        if (hd > 2.3 || has(n.id, qid)) continue;
        if (dy > 0.5 && dy <= 1.8) { if (!nav._blocked(n, q, q.y)) padj[n.id].push([qid, hd + 2.5]); }
        else if (dy < -0.5 && dy >= -3.4) { if (!nav._blocked(n, q, n.y) && nav._openAbove(q, n.y)) padj[n.id].push([qid, hd + 0.8]); }
        else if (Math.abs(dy) <= 0.5 && (Math.abs(dx) === 2 || Math.abs(dz) === 2)) { hi0.set(n.x, Math.max(n.y, q.y) + 1.8, n.z); hd0.set(q.x - n.x, 0, q.z - n.z).normalize(); if (!Ph.raycast(hi0, hd0, hd, undefined, false).hit) padj[n.id].push([qid, hd + 1.5]); }
      }
    }
    const dist = new Float32Array(PN), stamp = new Uint32Array(PN), hk = new Float32Array(PN * 12), hv = new Int32Array(PN * 12), from = new Int32Array(PN); let st = 0;
    const pPath = (s0, s1, avoid) => {   // A* on the player's graph: { len, nodes } or null
      if (s0 == null || s1 == null || s0 < 0 || s1 < 0) return null;
      st++; const gN = nav.nodes[s1]; let n = 0;
      const H = (u) => { const q = nav.nodes[u]; return Math.hypot(q.x - gN.x, q.z - gN.z); };
      const push = (k, x) => { let i = n++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = x; };
      const pop = () => { const x = hv[0], k = hk[--n], y = hv[n]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && hk[c + 1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = k; hv[i] = y; return x; };
      stamp[s0] = st; dist[s0] = 0; from[s0] = -1; push(H(s0), s0);
      while (n > 0 && n < PN * 12 - 32) {
        const u = pop(), du = dist[u];
        if (u === s1) { const nodes = []; for (let k = u; k >= 0; k = from[k]) nodes.push(k); return { len: du, nodes: nodes.reverse() }; }
        if (du > 1500) break;
        for (const [w, c] of padj[u]) { if (avoid && avoid[w]) continue; const nd = du + c; if (stamp[w] !== st || nd < dist[w]) { stamp[w] = st; dist[w] = nd; from[w] = u; push(nd + H(w), w); } }
      }
      return null;
    };
    const near = (x, y, z, up = 0.8) => nav.nearest(v.set(x, y, z), up);
    const pads = L.spawnPads;
    // the hedge's own lengths aren't nav ground (roof tops); a closed gate's footprint is taken out of the graph, and
    // (the graph's hops reach 2.3 m) any edge crossing the gate's line
    const crosses = (a, b, p) => { const [la, za] = loc(p, a), [lb, zb] = loc(p, b); if (Math.max(a.y, b.y) < p.y - 1 || Math.min(a.y, b.y) > p.y + p.h) return false; if ((za > 0) === (zb > 0)) return false; const t = za / (za - zb), u = la + (lb - la) * t; return Math.abs(u) <= p.hw + 0.3; };
    const cut = (ps) => { const av = new Uint8Array(PN); for (const p of ps) for (const id of navNodesInBox(p.x, p.z, p.yaw, p.w / 2, p.d / 2, PLAYER.radius - 0.05, p.y - 1, p.y + 0.6)) av[id] = 1; const adj0 = padj.map((l) => l); for (let i = 0; i < PN; i++) { const A0 = nav.nodes[i]; padj[i] = adj0[i].filter(([w]) => !ps.some((p) => crosses(A0, nav.nodes[w], p))); } return { av, restore: () => { for (let i = 0; i < PN; i++) padj[i] = adj0[i]; } }; };
    const KEY = { 'Alpha spawn → mid': [pads[0], [0, 1.3, 0]], 'mid → Alpha\'s side zone': [[0, 1.3, 0], [13, 1.3, -31]], 'mid → Alpha\'s nursery': [[0, 1.3, 0], [0, 1.3, -30]],
      'mid → Alpha\'s potting deck': [[0, 1.3, 0], [4, 2.62, -37]], 'Alpha spawn → the garden': [pads[0], [0, 0, -12]], 'Alpha spawn → the meadow\'s west side': [pads[0], [-10, 0, 0]],
      'Bravo spawn → Alpha\'s potting deck': [pads[1], [4, 2.62, -37]], 'mid → the west band → Alpha\'s west strip': [[0, 1.3, 0], [-18, 1.3, -30]], 'Alpha spawn → mid → Bravo\'s half': [pads[0], [0, 1.3, 12]],
      'mid → the west band → the orchard bank': [[0, 1.3, 0], [-17, 1.3, -36]], 'mid → the east band → the lobe\'s lane': [[0, 1.3, 0], [18, 1.3, -25]], 'mid → the east band → the turbine': [[0, 1.3, 0], [20, 1.3, -40]],
      'Alpha spawn → the east band': [pads[0], [17, 1.3, -10]], 'Alpha spawn → the west band': [pads[0], [-17, 1.3, -10]] };
    const keyPaths = Object.entries(KEY).map(([name, [a, b]]) => { const s = nav.nearest(v.set(a.x ?? a[0], a.y ?? a[1], a.z ?? a[2]), 1.2, true), e = near(b[0], b[1], b[2]); const q = s >= 0 && e >= 0 ? pPath(s, e, null) : null; return { name, s, e, q }; });
    const gateRep = [];
    const across = (p, closedPs) => {
      const C = cut(closedPs);
      const pick = (q) => { let best = -1, bd = Infinity; for (const n of nav.nodes) { if (C.av[n.id] || !nav.valid[n.id] || Math.abs(n.y - p.y) > 0.6) continue; const dd = Math.hypot(n.x - q.x, n.z - q.z); if (dd < bd) { bd = dd; best = n.id; } } return best; };
      const s0 = pick(W(p, 0, 0, 3.2)), s1 = pick(W(p, 0, 0, -3.2));
      const aft = pPath(s0, s1, C.av), back = pPath(s1, s0, C.av);
      const routes = [];
      for (const kp of keyPaths) { if (!kp.q || !kp.q.nodes.some((id, i) => C.av[id] || (i && closedPs.some((q) => crosses(nav.nodes[kp.q.nodes[i - 1]], nav.nodes[id], q))))) continue; const q2 = pPath(kp.s, kp.e, C.av); routes.push({ route: kp.name, open: r1(kp.q.len), closed: q2 ? r1(q2.len) : 'sealed', cost: q2 ? '+' + Math.round((q2.len / kp.q.len - 1) * 100) + ' %' : '∞' }); }
      C.restore();
      const bef = pPath(s0, s1, null);
      return { across: bef && r1(bef.len), round: aft ? r1(aft.len) : 'sealed', roundBack: back ? r1(back.len) : 'sealed', routes };
    };
    for (const p of gates) gateRep.push({ gate: p.id, alone: across(p, [p]) });
    gateRep.push({ gate: 'both rill gates', footbridge: across(byId('footbridge-gate'), gates.slice(0, 2)) });
    const graphOk = gateRep.slice(0, gates.length).every((r) => typeof r.alone.round === 'number' && r.alone.round >= r.alone.across + 3) && gateRep[gates.length].footbridge.round >= gateRep[gates.length].footbridge.across + 12;
    R('on the player\'s graph each gate closes the route it\'s across (the rill gates: by the other gateway; both, round the hedge\'s ends; the flank gates: through the garden), and what the key routes through them pay', graphOk, gateRep);

    // ---- physically: the shortest way round a kid really finds (actor.update on its own, walks and hops in 8
    // headings from spot to spot, merged on a 0.6 × 0.3 m grid; A* on the distance run), from both sides of each gate.
    // A leak = a way round with a step over a grown wall or a hedge (landing on its top, sliding off it)
    const kid = A.find((a) => a.bot), it = kid.intent, dt = 1 / 60;
    for (const q of m.actors) if (q !== kid) home(q, 0);
    const onRoof = () => kid.grounded && kid.ground && L.blocks[kid.ground.block] && L.blocks[kid.ground.block].roof;
    const putKid = (pos) => { kid.spawnAt(pos, 0); kid.invuln = 99; kid.vel.set(0, 0, 0); kid.form = 'kid'; it.move.set(0, 0, 0); it.jump = it.squid = it.fire = it.sub = it.special = false; for (let i = 0; i < 3; i++) kid.update(dt); };
    const DIRS = []; for (let k = 0; k < 8; k++) DIRS.push([Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);
    const lastP = new THREE.Vector3();
    let overIds = new Set();
    const move = (pos, dir, hop) => {
      putKid(pos); if (!kid.alive || !kid.grounded) return null;
      let travel = 0, over = false; lastP.copy(kid.pos);
      const tick = () => { kid.update(dt); if (!kid.alive) return false; travel += Math.hypot(kid.pos.x - lastP.x, kid.pos.z - lastP.z); lastP.copy(kid.pos); if (kid.grounded && kid.ground && overIds.has(kid.ground.block)) over = true; return true; };
      for (let f = 0; f < (hop ? 54 : 16); f++) { it.move.set(dir[0], 0, dir[1]); it.jump = hop && f < 3; if (!tick()) return null; if (hop && f > 6 && kid.grounded && !onRoof()) break; }
      it.jump = false;
      for (let f = 0; f < 90 && (!kid.grounded || onRoof()); f++) { it.move.set(0, 0, 0); if (!tick()) return null; }
      if (!kid.grounded || onRoof() || kid.pos.y < -1.2) return null;
      // (a spot the body doesn't fit — pressed into a wall — isn't a place to stand: a respawn there would pop it up)
      if (!Ph.bodyFits(kid.pos, PLAYER.radius, PLAYER.stepUp, PLAYER.height, false, 0.04)) return null;
      return { pos: kid.pos.clone(), travel, over };
    };
    const key = (q) => Math.round(q.x / 0.6) + ',' + Math.round(q.z / 0.6) + ',' + Math.round(q.y / 0.3);
    // A* from the starts to any goal spot (within 1.3 m of one, at its level ±0.7), bounded to box [x0, x1, z0, z1]
    const search = (starts, goals, box, budget) => {
      const t0 = performance.now();
      const Hh = (q) => Math.min(...goals.map((f) => Math.hypot(q.x - f.x, q.z - f.z)));
      const isGoal = (q) => goals.some((f) => Math.abs(q.y - f.y) < 0.7 && Math.hypot(q.x - f.x, q.z - f.z) < 1.3);
      const kk = [], vv = [];
      const push = (k, x) => { let i = kk.length; kk.push(k); vv.push(x); while (i > 0) { const q = (i - 1) >> 1; if (kk[q] <= k) break; kk[i] = kk[q]; vv[i] = vv[q]; i = q; } kk[i] = k; vv[i] = x; };
      const pop = () => { const x = vv[0], k = kk.pop(), y = vv.pop(); if (kk.length) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= kk.length) break; if (c + 1 < kk.length && kk[c + 1] < kk[c]) c++; if (kk[c] >= k) break; kk[i] = kk[c]; vv[i] = vv[c]; i = c; } kk[i] = k; vv[i] = y; } return x; };
      const best = new Map();
      for (const s0 of starts) { const q = s0.clone(); q.y = L.groundHeight(q.x, q.z, q.y + 1.2) + 0.05; best.set(key(q), 0); push(Hh(q), { pos: q, g: 0, par: null, over: false }); }
      let found = null, n = 0;
      while (kk.length && performance.now() - t0 < budget) {
        const s0 = pop();
        if (isGoal(s0.pos)) { found = s0; break; }
        if ((best.get(key(s0.pos)) ?? Infinity) < s0.g - 1e-6) continue;
        n++;
        for (const dir of DIRS) for (const hop of [false, true]) {
          const r = move(s0.pos, dir, hop);
          if (!r || r.travel < 0.15 || r.pos.x < box[0] || r.pos.x > box[1] || r.pos.z < box[2] || r.pos.z > box[3]) continue;
          const k = key(r.pos), gg = s0.g + r.travel + (hop ? 0.3 : 0);
          if ((best.get(k) ?? Infinity) <= gg) continue;
          best.set(k, gg); push(gg + Hh(r.pos), { pos: r.pos, g: gg, par: s0, over: r.over });
        }
      }
      const way = [], overAt = []; for (let q = found; q; q = q.par) { way.unshift(q.pos); if (q.over) overAt.push([r1(q.pos.x), r2(q.pos.y), r1(q.pos.z)]); }
      return { found: !!found, len: found ? r1(found.g) : null, way, overAt, exhausted: !found && !kk.length, spots: best.size, expanded: n, ms: Math.round(performance.now() - t0) };
    };
    // (over: the hedges and the gates — a bulwark isn't a barrier: stepping up onto it and down off it is just a way)
    const growAll = (ps) => { P.reset(); step(0.05); for (const q of ps) P.grow(q, 1, P.t - 1); step(2 / 60); overIds = new Set(hedgeIds); for (const q of ps) if (gates.includes(q)) for (const pt of q.parts) if (pt.blk) overIds.add(pt.blk.id); };
    // (the probe's own check: a kid put on a grown gate's top and on a hedge's top is seen going over)
    const selfTest = {};
    { const p = byId('footbridge-gate'); growAll([p]); const r = move(W(p, 1.2, p.h + 0.05, 0), DIRS[1], false); selfTest.gateTop = !!(r && r.over) || (r === null && 'fell off');
      const q = HEDGES[3]; const hr = move(V(q.x, q.y + q.h + 0.05, q.z), DIRS[0], false); selfTest.hedgeTop = !!(hr && hr.over) || (hr === null && 'slid off'); }
    const phys = []; let leaks = 0, notFound = 0;
    for (const p of gates) {
      growAll([p]);
      for (const side of [1, -1]) {
        const st = [0, p.hw - 0.6, -p.hw + 0.6].map((u) => W(p, u, 0, side * (p.hd + 2.4))), far = [0, p.hw - 0.6, -p.hw + 0.6].map((u) => { const q = W(p, u, 0, -side * (p.hd + 2.4)); q.y = p.y; return q; });
        const w = search(st, far, [p.x - 26, p.x + 26, p.z - 26, p.z + 26], 25000);
        if (!w.found) notFound++;
        if (w.overAt.length) leaks++;
        phys.push({ gate: p.id, from: side > 0 ? 'the mid side' : 'the base side', wayRound: w.found ? w.len + ' m' : (w.exhausted ? 'none within 26 m' : 'budget out'), over: w.overAt, via: w.way.filter((_, i) => i % 4 === 0).map((q) => [r1(q.x), r1(q.y), r1(q.z)]), ms: w.ms });
      }
    }
    P.reset(); step(0.1); for (const q of m.actors) if (q !== kid) home(q, 0);
    R('…and physically: a kid searching for the shortest way round each gate (from both sides) finds one that never goes over a grown wall or a hedge', leaks === 0 && selfTest.gateTop === true, { leaks, notFound, selfTest, runs: phys });

    // ---- the guard-rails, with EVERY wall on the half grown (Bravo's: the 4 gates and the 2 bulwarks)
    {
      growAll(walls);
      // physically: mid → the base terrace, then again with the first route's corridor walled off (a temporary block
      // across the half at z −24 over that corridor's width: west x < −10, the garden −10…10, east x > 10)
      const corridors = [['the west (the strip / the upper tier)', -31, -10], ['the middle (the garden)', -10, 10], ['the east (the band / the lobe)', 10, 31]];
      const start = [V(-2, 1.3, -4), V(2, 1.3, -4), V(0, 1.3, -5)], base = [V(-4, 1.3, -55), V(0, 1.3, -55), V(4, 1.3, -55), V(-9, 1.3, -54), V(9, 1.3, -54)];
      const routes = [], blockers = [];
      for (let k = 0; k < 2; k++) {
        const r = search(start, base, [-36, 36, -69, 2], 150000);
        if (!r.found) { routes.push({ route: k + 1, found: false, exhausted: r.exhausted, spots: r.spots, ms: r.ms }); break; }
        let cx = null; for (let i = 1; i < r.way.length; i++) { const a0 = r.way[i - 1], b0 = r.way[i]; if ((a0.z + 24) * (b0.z + 24) <= 0) { cx = a0.x + (b0.x - a0.x) * ((-24 - a0.z) / ((b0.z - a0.z) || 1)); break; } }
        const cor = corridors.find(([, x0, x1]) => cx != null && cx >= x0 && cx < x1);
        routes.push({ route: k + 1, len: r.len + ' m', via: cor ? cor[0] : '?', crossesZ24At: cx != null ? r1(cx) : null, over: r.overAt, ms: r.ms });
        if (!cor) break;
        const bl = L.addDynamic({ roof: true }); L.moveDynamic(bl, V((cor[1] + cor[2]) / 2, 3, -24), V((cor[2] - cor[1]) / 2, 5, 0.5), 0); blockers.push(bl);
      }
      for (const bl of blockers) L.moveDynamic(bl, V(0, -500, 0), V(0.1, 0.1, 0.1), 0);
      // …and the side zone and the tower checkpoint on the potting deck: a kid gets there from mid
      const toZone = search(start, [V(13, 1.3, -31), V(13, 1.3, -29)], [-36, 36, -69, 2], 60000);
      const toDeck = search(start, [V(4, 2.62, -37)], [-36, 36, -69, 2], 60000);
      // the player's graph: nothing cut off, the zones' ways in (4 points round each, 9 m off: unchanged within
      // 25 % + 2 m, or at least still there)
      const C = cut(walls);
      const valid = nav.nodes.filter((n) => nav.valid[n.id]).map((n) => n.id);
      const reach = (fromN, av) => { const seen = new Uint8Array(PN), q = [fromN]; seen[fromN] = 1; while (q.length) { const u = q.pop(); for (const [w] of padj[u]) if (!seen[w] && !(av && av[w])) { seen[w] = 1; q.push(w); } } return seen; };
      const pad = nav.nearest(pads[0], 1.2, true);
      const r1a = reach(pad, C.av);
      C.restore();
      const r0 = reach(pad, null);
      const lost = valid.filter((id) => r0[id] && !r1a[id] && !C.av[id]).length;
      const zoneWays = (ps) => {
        const out2 = [];
        for (const [zx, zz, name] of [[0, 0, 'the centre zone'], [13.25, -31.5, 'Alpha\'s side zone']]) {
          const cN = near(zx, 1.3, zz); let same = 0, still = 0; const det = [];
          for (const [dx, dz] of [[9, 0], [-9, 0], [0, 9], [0, -9]]) { const s0 = near(zx + dx, 1.3, zz + dz, 1.5); if (s0 < 0) { same++; still++; continue; } const qa = pPath(s0, cN, null); const C3 = cut(ps); const qb = pPath(s0, cN, C3.av); C3.restore(); if (!qa || (qb && qb.len <= qa.len * 1.25 + 2)) same++; if (!qa || qb) still++; det.push([dx, dz, qa && r1(qa.len), qb ? r1(qb.len) : 'x']); }
          out2.push({ zone: name, unchanged: same, stillIn: still, ways: det });
        }
        return out2;
      };
      const zAll = zoneWays(walls);
      P.reset(); step(0.1);
      const two = routes.filter((r) => r.len).length >= 2 && routes.every((r) => !r.over || !r.over.length);
      R('with EVERY wall on the half grown (4 gates, 2 bulwarks): a kid still finds 2 routes from mid to the base (the second with the first one\'s corridor walled off), nothing is cut off, each zone keeps ≥ 2 ways in, the side zone and the deck\'s tower checkpoint are reachable',
        two && lost === 0 && zAll.every((z) => z.stillIn >= 2) && toZone.found && toDeck.found,
        { routes, cutOffNodes: lost, zones: zAll, toSideZone: toZone.found ? toZone.len + ' m' : 'NOT FOUND', toDeckCheckpoint: toDeck.found ? toDeck.len + ' m' : 'NOT FOUND' });
      // with the bulwarks grown (the gates open): every zone keeps every way in, and its floor stays open
      const zB = zoneWays(bulwarks);
      const floorOpen = bulwarks.every((p) => { const Z = p.id === 'plaza-bulwark' ? [0, 0] : [13.25, -31.5]; return Math.hypot(p.x - Z[0], p.z - Z[1]) > 3; });
      R('with the zone bulwarks grown each zone keeps all its ways in (4 of 4, within 25 % + 2 m) and its floor stays open (the bulwark at its edge)', zB.every((z) => z.unchanged === 4) && floorOpen, { zones: zB, at: bulwarks.map((p) => [p.id, r1(p.x), r1(p.z)]) });
    }

    // ---- the potting deck (2.62 m) still sees down the middle walk to mid, over the hedge or through a gateway, with
    // every wall grown
    {
      for (const q of walls) P.grow(q, 1, P.t - 1); step(2 / 60);
      const eyes = [[0, -33.6], [2, -33.6], [4, -33.6], [-2, -33.6]].map(([x, z]) => V(x, 2.62 + 1.6, z));
      let k = 0, n = 0;
      for (let z = -30; z <= 0; z += 1) { n++; const gy = L.groundHeight(0, z, 3) + 1.0; if (eyes.some((e) => Ph.los(e, V(0, gy, z)))) k++; }
      const midSeen = eyes.some((e) => Ph.los(e, V(0, 1.3 + 1.0, 0)));
      P.reset(); step(0.1);
      R('the potting deck still sees down the middle walk to mid over the hedge with every wall grown (a kid\'s chest, 1 m up)', midSeen && k / n >= 0.6, { midSeen, middleWalkSeen: Math.round((100 * k) / n) + ' %' });
    }

    // ---- every canopy: what its platform overlooks (the share of the zone / the track it has a line of sight to, and
    // how far above), a kid stands on it; nothing near to hop onto it from
    const zonePolys = [];
    const zs = L.layout.zones; for (const z of zs.center || []) for (const q of z.polys || [z.poly]) zonePolys.push({ name: 'the centre zone', poly: q, y: z.y0 ?? 1.3 });
    for (const q of zs.side.polys || [zs.side.poly]) { zonePolys.push({ name: 'Alpha\'s side zone', poly: q, y: zs.side.y0 ?? 1.3 }); zonePolys.push({ name: 'Bravo\'s side zone', poly: q.map(([x, z]) => [-x, -z]), y: zs.side.y0 ?? 1.3 }); }
    const inPoly = (x, z, Q) => { let c = false; for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) { const [xi, zi] = Q[i], [xj, zj] = Q[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
    const trk = L.layout.tower && L.layout.tower.path;
    const canRep = []; let canOk = true;
    const tg = new THREE.Vector3();
    for (const p of P.pods.filter((q) => q.kind === 'canopy')) {
      grown(p, 0);
      const eyes = [[0, 0], [p.hw - 0.7, 0], [-p.hw + 0.7, 0], [0, p.hd - 0.7], [0, -p.hd + 0.7]].map(([lx, lz]) => W(p, lx, p.h + 1.3, lz));
      const sees = (x, y, z) => eyes.some((e) => Ph.los(e, tg.set(x, y + 0.6, z)));
      const seen = [];
      for (const Z of zonePolys) {
        let n = 0, k = 0, dmin = Infinity;
        const xs = Z.poly.map((q) => q[0]), zz = Z.poly.map((q) => q[1]);
        for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1) for (let z = Math.min(...zz); z <= Math.max(...zz); z += 1) { if (!inPoly(x, z, Z.poly)) continue; n++; dmin = Math.min(dmin, Math.hypot(x - p.x, z - p.z)); if (dmin < 30 && sees(x, L.groundHeight(x, z, 6), z)) k++; }
        if (n && dmin < 25) seen.push({ what: Z.name, dist: r1(dmin), sees: Math.round((100 * k) / n) + ' %', above: r1(p.y + p.h - Z.y) });
      }
      if (trk) {
        let n = 0, k = 0, dmin = Infinity;
        const pts = [];
        const seg = (a, b) => { const ax = a[0], az = a[a.length - 1], bx = b[0], bz = b[b.length - 1], L0 = Math.hypot(bx - ax, bz - az); for (let s = 0; s <= L0; s += 1) pts.push([ax + ((bx - ax) * s) / L0, az + ((bz - az) * s) / L0]); };
        for (let i = 1; i < trk.length; i++) { seg(trk[i - 1], trk[i]); seg(trk[i - 1].map((c, j) => (j === 1 && trk[i - 1].length === 3 ? c : -c)), trk[i].map((c, j) => (j === 1 && trk[i].length === 3 ? c : -c))); }
        for (const [x, z] of pts) { const dd = Math.hypot(x - p.x, z - p.z); if (dd > 18) continue; n++; dmin = Math.min(dmin, dd); if (sees(x, L.groundHeight(x, z, 6), z)) k++; }
        if (n) seen.push({ what: 'the tower track (within 18 m)', dist: r1(dmin), sees: Math.round((100 * k) / n) + ' %', metres: n });
      }
      const kd = A[2];
      place(kd, W(p, 0.4, p.h + 0.1, 0.3)); step(0.6);
      const stands = kd.grounded && onPlant(kd, p) && !kd.roofT;
      let hi = -9;
      for (let a = 0; a < 24; a++) for (const rr of [2.0, 2.6, 3.2, 4.0]) { const x = p.x + Math.cos(a * Math.PI / 12) * rr, z = p.z + Math.sin(a * Math.PI / 12) * rr; const hh = Ph.raycast(v.set(x, p.y + 6, z), d.set(0, -1, 0), 7, undefined, false); if (hh.hit && !L.blocks[hh.block].roof && !L.blocks[hh.block].dynamic) hi = Math.max(hi, hh.point.y - p.y); }
      // (the parapet rails ring the deck at 3.0–3.4: from a floor 1.5 m up or less a kid can't clear them — it climbs
      // 1.8 m, not 1.9); and physically: an enemy kid hopping at it from all round never ends up on its platform
      let boarded = 0;
      const en = Bt.find((a) => a.bot) || Bt[0];
      for (let a = 0; a < 16; a++) {
        const an = (a * Math.PI) / 8, sx = p.x + Math.cos(an) * 3.2, sz = p.z + Math.sin(an) * 3.2, gh = L.groundHeight(sx, sz, p.y + 2.2);
        if (!Number.isFinite(gh)) continue;
        for (const jf of [0, 5, 10]) {
          en.spawnAt(V(sx, gh + 0.05, sz), 0); en.invuln = 99; const ei = en.intent; const dx = p.x - sx, dz = p.z - sz, dl = Math.hypot(dx, dz);
          for (let f = 0; f < 50; f++) { ei.move.set(dx / dl, 0, dz / dl); ei.jump = f >= jf && f < jf + 3; en.update(1 / 60); if (onPlant(en, p) && en.grounded) { boarded++; break; } }
          ei.move.set(0, 0, 0); ei.jump = false;
        }
      }
      home(en, 3);
      const ok = stands && hi <= 1.5 && boarded === 0 && seen.some((s) => parseInt(s.sees) >= 35);
      if (!ok) canOk = false;
      canRep.push({ canopy: p.id, at: [r1(p.x), r1(p.y), r1(p.z)], overlooks: seen, kidStands: stands, highestFloorNear: r2(hi), enemyBoarded: boarded });
      home(kd, 2); P.reset(); step(0.1);
    }
    R('every canopy overlooks something worth holding (a zone or the tower track: a real share of it in sight from its platform), a kid stands on it, and nothing near is high enough to climb onto it from', canOk, canRep);

    // ---- the owners climb both kinds here; the looks in the grower's ink
    const swimUp = (a, p, face, u, team) => {
      for (let y = 0.2; y < p.ht; y += 0.3) __G.paint.splat(W(p, u, y, face * (p.hd + 0.12)), 0.4, team);
      place(a, W(p, u, 0.05, face * (p.hd + 0.75)), true);
      const into = dirW(p, 0, -face);
      let climbed = false;
      intents.set(a, (b, i) => { i.squid = true; if (b.pos.y < p.y + p.h - 0.25 || b.climbing) i.move.set(into.x, 0, into.z); else if (p.kind === 'canopy' && !onPlant(b, p)) i.move.set(into.x * 0.4, 0, into.z * 0.4); });
      for (let f = 0; f < 60 * 3; f++) { step(1 / 60); climbed = climbed || a.climbing; }
      intents.set(a, (b, i) => { i.squid = true; }); step(0.5); intents.delete(a);
      return { climbed, on: onPlant(a, p), y: r2(a.pos.y) };
    };
    const pw = byId('footbridge-gate'), pc = byId('meadow');
    grown(pw, 0); grown(pc, 0);
    const cw = swimUp(A[1], pw, -1, 1.0, 0), cc = swimUp(A[1], pc, -1, 0.1, 0);
    const tintOk = [pw, pc].every((p) => p.look && p.look.team[0].every((x) => x.visible && x.userData.tint === __G.teamColors[0].getHexString()));
    R('the owners swim up both kinds here (the footbridge gate onto its top, the meadow canopy\'s root curtain onto its platform); the looks wear the grower\'s ink',
      cw.climbed && cw.on && cc.climbed && cc.on && tintOk, { wall: cw, canopy: cc, tint: tintOk });
    home(A[1], 1); P.reset(); step(0.2);

    // ---- shoving: a kid where a plant grows ends up out of it, on the ground, never in the reservoir
    const sk = Bt.find((a) => !a.isLocal) || Bt[1], shov = [];
    let wet = 0, inside = 0;
    for (const p of P.pods) {
      place(sk, W(p, 0.25, 0.05, p.kind === 'canopy' ? p.hd - 0.15 : 0.2)); step(0.2);
      const c = new THREE.Vector3(p.x, p.y + p.def.bulbY + 0.2, p.z); for (let i = 0; i < 40 && p.state === 'dormant'; i++) { __G.paint.splat(c, 0.8, 1); step(1 / 60); }
      step(0.8);
      const [lx, lz] = loc(p, sk.pos);
      for (const q of p.parts) if (q.blk.solid && L.pointInBlock(q.blk, sk.pos.clone().setY(sk.pos.y + 0.4), -0.06)) inside++;
      if (!sk.alive || sk.pos.y < -1.2) wet++;
      shov.push([p.id, r2(lx), r2(lz), r2(sk.pos.y)]);
      P.reset(); step(0.1);
    }
    R('shoving: a kid standing where each plant grows ends up out of it, on the ground, never in the reservoir', inside === 0 && wet === 0, { inside, wet, shoved: P.stats.shoved, at: shov });
    home(sk, 1);
    // ---- the wilt: a kid on a wall's top comes down with it, the pod recharges
    const pg = byId('footbridge-gate');
    grown(pg, 0);
    place(A[1], W(pg, 0.8, pg.h + 0.1, 0)); step(0.6);
    const was = onPlant(A[1], pg);
    m.time = m.duration - (pg.wiltAt - 0.3); step(2.0);
    R('it wilts after its time (the kid on top comes down with it, onto the floor or its trough); the pod recharges', was && ['recharge', 'dormant'].includes(pg.state) && A[1].pos.y < pg.y + 0.6,
      { wasOn: was, state: pg.state, kidY: r2(A[1].pos.y), carried: P.stats.carried });
    home(A[1], 1); P.reset(); step(0.2);
  }
  if (m.mode === 'tower') {
    R('Tower Command: every pod plays (none sits on the track)', P.pods.every((p) => !p.off), P.pods.map((p) => [p.id, p.off || 'on']));
    // every hedge and every plant (both halves) clears the track: the platform's half width + 0.5 m
    const rects = [];
    const rect = (id, x, z, deg, hx, hz) => { const r = deg * Math.PI / 180; rects.push({ id, x, z, c: Math.cos(r), s: Math.sin(r), hx, hz }); };
    for (const sg of [1, -1]) {
      rect('the rill hedge', sg * (RL.x0 + RL.x1) / 2, sg * RL.z, 0, (RL.x1 - RL.x0) / 2, 0.6);
      HEDGES.forEach((q, k) => rect('hedgerow ' + k + (sg > 0 ? '' : '~'), sg * q.x, sg * q.z, q.deg, q.w / 2, q.d / 2 + 0.05));
    }
    for (const p of P.pods) rects.push({ id: p.id, x: p.x, z: p.z, c: p.c, s: p.s, hx: p.hw, hz: p.hd });
    const T = m.tower;
    let worst = Infinity, at = null;
    for (let sp = -T.path.len[1]; sp <= T.path.len[0]; sp += 0.4) {
      const q = T.path.at(sp, new THREE.Vector3());
      for (const b of rects) { const dx = q.x - b.x, dz = q.z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c; const dd = Math.hypot(Math.max(0, Math.abs(lx) - b.hx), Math.max(0, Math.abs(lz) - b.hz)); if (dd < worst) { worst = dd; at = b.id; } }
    }
    R('Tower Command: every hedge and plant clears the track (the platform\'s half width + 0.5 m)', worst > 1.25 + 0.5, { pieces: rects.length, nearest: r2(worst), at });
  }
  if (m.mode === 'boss') {
    const Bs = __G.boss, nv = Bs && Bs.nav;
    // (HULLBREAKER parked and still while the plants grow: roaming, it would walk into one first)
    const bm = Bs.move, bp = Bs.pos.clone(), by0 = Bs.yaw; Bs.move = null; Bs.pos.set(0, Bs.pos.y, 30);
    const res = [];
    for (const p of P.pods) {
      const before = nv.dynWall(p.x, p.z, 1.5);
      P.grow(p, 0, P.t - 1); step(2 / 60);
      res.push([p.id, before, nv.dynWall(p.x + p.s * (p.hd + 1.2), p.z + p.c * (p.hd + 1.2), 1.5)]);
    }
    R('Boss Battle: every grown plant stops HULLBREAKER\'s charge like a wall (the charge asks dynWall)', res.every(([, b, a]) => !b && a), res);
    const pb = byId('meadow');
    Bs.pos.set(pb.x, Bs.pos.y, pb.z - 3.2); Bs.yaw = 0;
    P.bossStep();
    const tr = pb.wiltAt <= P.t + 1e-3;
    Bs.pos.copy(bp); Bs.yaw = by0; Bs.move = bm;
    step(1.2);
    R('Boss Battle: HULLBREAKER walking into a plant tramples it (it wilts)', tr && (pb.state === 'wilt' || pb.state === 'recharge'), { trampled: tr, state: pb.state });
  }
  R('state()', !!P.state(), P.state().stats);
  return out;
})()
