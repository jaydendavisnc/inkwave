// Eco-Forest Treehills — the stage's own far scenery (layout.env.backdrop; see the top of src/world/environment.js). Gets the
// environment's SCENERY_KIT (+ THREE, bounds, runs, rnd, U, sceneryMaterial) — imports only plan.js (pure data), so
// layout.js stays importable in Node.
//
// We are indoors: a biome cavern under the mountain, its sky a simulation on the dome's screens. Round the arena:
//   • the reservoir (the environment's water) out to the cavern's rock walls (~520–760 m), which rise into the dome's
//     rim: a steel ring beam with a string of service lights where the screens start
//   • the dome's geodesic grid: thin pale-blue glowing seams between the screen panels (triangles meeting at nodes),
//     drawn over the sky (additive, no fog), a little brighter at dusk
//   • rolling artificial forest hills beyond the reservoir: terraced (retaining rings, lawn tops) and wooded (instanced
//     cypress cones), with wind turbines turning on their crests
//   • distant Alterna works: clusters of green modules, greenhouse domes, a lift shaft and a pipe bundle climbing the
//     cavern wall to the rim, sluices and a weir in the reservoir's walls
//   • the live rotors of every turbine (the arena's two on the crowns included), one instanced mesh turning slowly
import { TURBINE, NTURBINE, T1, T3 } from './plan.js';

export function buildBackdrop(kit) {
  const { THREE, box, cyl, sph, prep, xf, makeIsland, mulberry, fbm, polar, DEG, WATER_Y } = kit;
  const rnd = mulberry(7707);
  const out = { static: [], plain: [], terrain: [], instances: [], objects: [] };
  const C = (h) => new THREE.Color(h);
  const COL = {
    rock: C('#6a6259'), rockDk: C('#463f39'), rockLt: C('#958b7e'), strata: C('#7c7265'),
    lawn: C('#86a868'), lawnDk: C('#6f9058'), wall: C('#8d9a92'), wallDk: C('#6f7b74'),
    cyp: C('#2f5a3d'), cypLt: C('#46774d'), mod: C('#3d6b55'), trim: C('#e6eae4'), white: C('#eef1ec'), glass: C('#9fd4d6'),
    ring: C('#8c969a'), ringDk: C('#5d666b'),
  };
  const tmp = new THREE.Color();

  // ---------------------------------------------------------------------------------------------- cavern walls
  // a ring of rock rising from the reservoir to the dome's rim: an irregular radius (bays, buttresses), faceted strata
  // bands, darker low down; the rim ring beam along the top with its lights (glow at dusk)
  const RIM = 118;                               // the rim's height above the water (the screens start here)
  const wallR = (a) => 980 + 120 * (fbm(Math.cos(a) * 1.6 + 3.1, Math.sin(a) * 1.6 - 1.7, 3) - 0.5) * 2 + 50 * Math.sin(a * 5 + 0.7);
  {
    const NA = 360, NY = 26, pos = [], col = [], idx = [];
    for (let j = 0; j <= NY; j++) {
      const t = j / NY, y = WATER_Y - 4 + t * (RIM + 4);
      for (let i = 0; i <= NA; i++) {
        const a = (i / NA) * Math.PI * 2;
        // the wall leans in as it rises (the cavern closing toward the dome), with rock noise
        // rock: big bays and spurs (low-frequency), vertical ribs (columnar jointing), stepped strata (ledges every
        // ~1/7 of the height), the wall leaning in toward the rim
        const n = fbm(Math.cos(a) * 9 + t * 3.1, Math.sin(a) * 9 - t * 2.3, 3) - 0.5;
        const rib = Math.abs(Math.sin(a * 70 + n * 5)), rib2 = Math.abs(Math.sin(a * 23 + 1.3 + n * 2));
        const st = (t * 7 + n * 0.8) % 1;
        const r = wallR(a) - t * t * 70 + n * 70 - rib * 16 - rib2 * 22 - st * 10 + Math.sin(t * 22 + a * 17) * 6;
        pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
        const band = 0.5 + 0.5 * Math.sin(t * 38 + n * 6);
        tmp.copy(COL.rockDk).lerp(COL.rock, Math.min(1, t * 1.6)).lerp(COL.strata, band * 0.35).lerp(COL.rockLt, Math.max(0, n) * 0.6);
        tmp.multiplyScalar(0.62 + 0.5 * (1 - rib) * (1 - st * 0.6));
        // hanging greenery on the strata ledges (the biome creeping up its own walls)
        if (st > 0.82 && n > -0.1 && t < 0.8) tmp.lerp(COL.cyp, 0.55);
        if (t < 0.12) tmp.lerp(COL.lawnDk, (0.12 - t) / 0.12 * 0.55 * (0.5 + n));   // moss and ferns low down, where the spray reaches
        col.push(tmp.r, tmp.g, tmp.b);
      }
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // normals point toward the arena (the wall faces inward)
    const N = g.attributes.normal; let flip = 0; for (let i = 0; i < N.count; i++) flip += N.getX(i) * pos[i * 3] + N.getZ(i) * pos[i * 3 + 2];
    if (flip > 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    out.plain.push(prep(g.toNonIndexed()));
    // the rim ring beam + its lights
    const ring = [];
    for (let i = 0; i < 96; i++) {
      const a0 = (i / 96) * Math.PI * 2, a1 = ((i + 1) / 96) * Math.PI * 2, r0 = wallR(a0) - 70 - 8, r1 = wallR(a1) - 70 - 8;
      const x0 = Math.cos(a0) * r0, z0 = Math.sin(a0) * r0, x1 = Math.cos(a1) * r1, z1 = Math.sin(a1) * r1;
      ring.push(kit.beam(x0, RIM + WATER_Y, z0, x1, RIM + WATER_Y, z1, 12, '#8c969a'));
      ring.push(kit.beam(x0, RIM + WATER_Y - 9, z0, x1, RIM + WATER_Y - 9, z1, 4, '#5d666b'));
      if (i % 2 === 0) ring.push(xf(box(4, 1.8, 4, '#fff1cf', 1), x0 * 0.99, RIM + WATER_Y - 5, z0 * 0.99));
    }
    out.plain.push(...ring);
  }

  // ---------------------------------------------------------------------------------------------- forest hills
  // rolling artificial hills round the reservoir (makeIsland shapes, recoloured): lawn and wood, retaining rings
  // where they were terraced, instanced cypress cones in the woods
  const masses = [];
  function hill(o) {
    const isl = makeIsland({ R: 14, S: 56, ridge: 0.25, ...o });
    const g = isl.geo, P = g.attributes.position, Cc = g.attributes.color, Gl = g.attributes.glow, Nn = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i) - WATER_Y, z = P.getZ(i), ny = Nn.getY(i);
      const n = fbm(x * 0.02 + o.seed, z * 0.02 - o.seed, 3);
      if (y < 1.2) tmp.copy(COL.wallDk);
      else if (1 - ny > 0.42) tmp.copy(COL.wall).multiplyScalar(0.9 + 0.2 * n);
      else tmp.copy(COL.lawn).lerp(COL.lawnDk, n).lerp(COL.cyp, Math.max(0, n - 0.5) * 1.6);
      const ao = Gl ? Gl.getX(i) : 1;
      Cc.setXYZ(i, tmp.r * ao, tmp.g * ao, tmp.b * ao);
      if (Gl) Gl.setX(i, 0);
    }
    out.plain.push(g);
    masses.push({ ...o, isl });
    return isl;
  }
  const at = (a, d) => polar(a, d);
  const HILLS = [
    [8, 210, 60, 40, 14], [40, 250, 70, 50, 18], [72, 200, 55, 42, 11], [104, 240, 80, 50, 20], [140, 205, 60, 45, 13],
    [172, 260, 80, 50, 19], [204, 210, 60, 42, 12], [234, 245, 75, 50, 18], [264, 200, 55, 42, 11], [294, 240, 70, 50, 17],
    [324, 210, 60, 44, 13], [352, 265, 80, 52, 20],
    [22, 480, 140, 90, 44], [92, 520, 150, 100, 54], [158, 470, 130, 90, 40], [228, 530, 160, 100, 58], [298, 490, 140, 90, 48],
    [58, 640, 170, 90, 70], [196, 650, 180, 100, 78], [330, 640, 170, 90, 66],
  ];
  HILLS.forEach(([a, d, rx, rz, h], k) => { const [x, z] = at(a, d); hill({ x, z, rx, rz, h, seed: 11 + k, rot: (a + 90) * DEG }); });
  // terraced mounds (the engineered look, like the arena's tree-hills): stacked hexagonal tiers with panel walls and
  // lawn tops, wooded on every tier (the trees go in with the rest below)
  const terr = [];
  for (const [a, d, r, n, tw] of [[52, 290, 26, 3, 0.2], [124, 270, 22, 3, 1.1], [196, 300, 28, 4, 0.6], [268, 275, 20, 3, 0.3], [336, 295, 24, 3, 0.9]]) {
    const [x, z] = at(a, d);
    const tiers = [];
    for (let k = 0; k < n; k++) {
      const rr = r * (1 - k * 0.26), y0 = WATER_Y + k * 4, h = 4;
      terr.push(xf(cyl(rr, rr, h, 6, '#8d9a92'), x, y0 + h / 2, z, tw));
      terr.push(xf(cyl(rr - 0.5, rr - 0.5, 0.4, 6, '#86a868'), x, y0 + h + 0.2, z, tw));
      tiers.push({ r0: k < n - 1 ? r * (1 - (k + 1) * 0.26) : 0, r1: rr - 1, y: y0 + h + 0.3 });
    }
    masses.push({ terr: true, x, z, r, tiers });
  }
  out.plain.push(...terr);

  // cypress cones over the hills (instanced): a trunk and three stacked cones (the trunk and the upper two cones
  // open-ended: their ends are always inside the next piece up or the ground — half the triangles of thousands of trees)
  const treeGeo = (() => {
    const parts = [xf(cyl(0.3, 0.45, 3, 5, '#5b4636', 0, true), 0, 1.5, 0)];
    for (const [y, r, h, k] of [[2, 2.6, 5, 0], [4.4, 2.0, 4.4, 1], [6.6, 1.3, 3.8, 2]]) parts.push(xf(cyl(0, r, h, 7, '#ffffff', 0, k > 0), 0, y + h / 2, 0));
    return merge(parts);
  })();
  const trees = [];
  const treeC = ['#2f5a3d', '#284f35', '#3b6b43', '#46774d', '#2a5134'];
  for (const m of masses) {
    if (m.terr) {
      for (const t of m.tiers) for (let k = 0; k < 10; k++) { const a = rnd() * Math.PI * 2, rr = t.r0 + 1 + rnd() * Math.max(0.5, t.r1 - t.r0 - 1); trees.push([m.x + Math.cos(a) * rr, t.y - 0.3, m.z + Math.sin(a) * rr, 0.45 + rnd() * 0.35, rnd() * 6.28, treeC[(rnd() * 5) | 0]]); }
      continue;
    }
    const want = Math.round(Math.min(420, m.rx * m.rz * 0.05));
    let placed = 0, tries = 0;
    while (placed < want && tries++ < want * 6) {
      const [x, z] = m.isl.sample(rnd, 0.85);
      const y = m.isl.heightAt(x, z);
      if (y < WATER_Y + 1.5) continue;
      const n = fbm(x * 0.02 + m.seed, z * 0.02 - m.seed, 3);
      if (n < 0.42 && rnd() > 0.2) continue;
      trees.push([x, y - 0.3, z, 0.9 + rnd() * 1.2, rnd() * 6.28, treeC[(rnd() * 5) | 0]]);
      placed++;
    }
  }
  out.instances.push({ geo: treeGeo, list: trees });

  // ---------------------------------------------------------------------------------------------- turbines
  // far turbines on the hill crests (towers + nacelles static; rotors live below), and the arena's two
  const rotorAt = [];
  const towers = [];
  const turbine = (x, y, z, hub, yaw) => {
    towers.push(xf(cyl(hub * 0.022, hub * 0.042, hub, 12, '#eef1ec'), x, y + hub / 2, z));
    const nx = Math.sin(yaw), nz = Math.cos(yaw);
    towers.push(xf(box(hub * 0.07, hub * 0.07, hub * 0.2, '#eef1ec'), x, y + hub + hub * 0.03, z, yaw));
    rotorAt.push({ x: x + nx * hub * 0.12, y: y + hub + hub * 0.03, z: z + nz * hub * 0.12, yaw, s: hub / 15.5 });
  };
  for (const m of masses) {
    if (m.terr || m.h < 17) continue;
    const y = m.isl.heightAt(m.x, m.z);
    const yaw = Math.atan2(-m.x, -m.z);   // facing the arena
    turbine(m.x, y - 1, m.z, 26 + m.h * 0.35, yaw);
  }
  out.plain.push(...towers);
  // the arena's crown turbines (props.js treehills_turbine builds the tower; the rotor turns here): the hub at the
  // nacelle's front, the rotor facing the meadow (−X on the east crown, +X on the west)
  for (const s of [1, -1]) rotorAt.push({ x: s * (TURBINE.x - 2.15), y: T3 + TURBINE.hub + 0.55, z: s * TURBINE.z, yaw: s > 0 ? -Math.PI / 2 : Math.PI / 2, s: 1, near: true });
  // (and the nurseries' two, in the lobes' bays: facing the nursery like the crown's, −X on Alpha's, +X on Bravo's)
  for (const s of [1, -1]) rotorAt.push({ x: s * (NTURBINE.x - 2.15), y: T1 + NTURBINE.hub + 0.55, z: s * NTURBINE.z, yaw: s > 0 ? -Math.PI / 2 : Math.PI / 2, s: 1, near: true });

  // rotors: one instanced mesh (three tapered blades + the spinner), turning slowly with a per-rotor phase
  {
    const parts = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const g = new THREE.BufferGeometry();
      // a flat tapered blade from the hub outward along +Y, twisted a little (a thin box stretched and tapered)
      const bl = new THREE.BoxGeometry(0.62, TURBINE.rotor, 0.12, 1, 4, 1);
      const P = bl.attributes.position;
      for (let i = 0; i < P.count; i++) { const y = P.getY(i) / TURBINE.rotor + 0.5; P.setX(i, P.getX(i) * (1 - 0.72 * y) + (y < 0.15 ? 0 : 0.1 * y)); P.setZ(i, P.getZ(i) * (1 - 0.6 * y)); P.setY(i, (y * TURBINE.rotor) + 0.4); }
      bl.computeVertexNormals();
      g.copy(bl);
      parts.push(xf(prep(g, '#f3f5f2'), 0, 0, 0, 0, 0, a));
    }
    parts.push(prep(xf(new THREE.ConeGeometry(0.5, 1.2, 12), 0, 0, 0.55, 0, Math.PI / 2), '#f3f5f2'));
    parts.push(prep(xf(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), 0, 0, 0.02, 0, Math.PI / 2), '#2f6db0'));
    const geo = merge(parts);
    const mat = kit.sceneryMaterial({}, { roughness: 0.45 });
    const im = new THREE.InstancedMesh(geo, mat, rotorAt.length);
    im.name = 'TreehillsRotors';
    im.castShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const Z = new THREE.Vector3(0, 0, 1);
    const place = (t) => {
      rotorAt.forEach((r, i) => {
        q.setFromEuler(e.set(0, r.yaw, 0, 'YXZ'));
        q2.setFromAxisAngle(Z, -(t * 0.55 + i * 1.7));
        q.multiply(q2);
        m4.compose(v.set(r.x, r.y, r.z), q, sc.setScalar(r.s));
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
    };
    place(0);
    out.objects.push(im);
    out._place = place;
  }

  // ---------------------------------------------------------------------------------------------- Alterna works
  // module clusters, greenhouse domes and a lift shaft + pipe bundle up the cavern wall (toward the rim)
  const works = [];
  const moduleBlock = (x, z, rot, n) => {
    for (let k = 0; k < n; k++) {
      const w = 8 + rnd() * 10, d = 6 + rnd() * 6, h = 5 + (rnd() * 3 | 0) * 5, ox = (rnd() - 0.5) * 30, oz = (rnd() - 0.5) * 24;
      const cx = x + ox * Math.cos(rot) - oz * Math.sin(rot), cz = z + ox * Math.sin(rot) + oz * Math.cos(rot);
      works.push(xf(box(w, h, d, '#3d6b55'), cx, WATER_Y + h / 2, cz, rot));
      works.push(xf(box(w + 0.6, 0.6, d + 0.6, '#9aa39f'), cx, WATER_Y + h + 0.3, cz, rot));
      if (rnd() < 0.6) works.push(xf(box(w * 0.7, 1.2, 0.3, '#ffe2b0', 1), cx + Math.sin(-rot) * 0, WATER_Y + h * 0.6, cz + d / 2 + 0.2, rot));
    }
    works.push(xf(sph(9, 16, 8, '#bfe3e4'), x + 18 * Math.cos(rot), WATER_Y, z + 18 * Math.sin(rot), 0, 0, 0, 1, 0.9, 1));
  };
  for (const [a, d] of [[28, 640], [118, 660], [206, 640], [298, 650]]) { const [x, z] = at(a, d); moduleBlock(x, z, (a + 90) * DEG, 7); }
  // the lift shaft + pipe bundle up the cavern wall (two of them, on opposite walls)
  for (const a of [64, 244]) {
    const r = wallR(a * DEG) - 20, [x, z] = at(a, r);
    for (let k = 0; k < 4; k++) { const [px, pz] = at(a + (k - 1.5) * 0.9, r - 4); works.push(xf(cyl(1.4, 1.4, RIM, 8, k % 2 ? '#8d9894' : '#c2c9c6'), px, WATER_Y + RIM / 2, pz)); }
    works.push(xf(box(14, RIM + 10, 12, '#5d666b'), x, WATER_Y + RIM / 2, z, -a * DEG));
    for (let y = 20; y < RIM; y += 24) works.push(xf(box(15, 1.2, 13, '#fff1cf', 1), x, WATER_Y + y, z, -a * DEG));
  }
  // the reservoir's weirs: two concrete spillways set into the cavern wall (behind each station, far off), the water
  // falling in a white sheet into a foam apron, and small sluice outlets spouting from the rock between them
  for (const a of [90, 270]) {
    const r = wallR(a * DEG) - 30, [x, z] = at(a, r), rot = -a * DEG + Math.PI / 2;
    const cx = Math.cos(a * DEG), cz = Math.sin(a * DEG);
    works.push(xf(box(70, 42, 16, '#b9bdb6'), x, WATER_Y + 21, z, rot));
    works.push(xf(box(56, 3, 20, '#9ea39c'), x - cx * 2, WATER_Y + 41, z - cz * 2, rot));
    for (let k = -2; k <= 2; k++) works.push(xf(box(3, 46, 20, '#a9aea7'), x - cx * 3 + Math.sin(a * DEG) * k * 13, WATER_Y + 23, z - cz * 3 - Math.cos(a * DEG) * k * 13, rot));
    // the falling sheet (a slab leaning out from the crest, streaked) and the foam at its foot
    const sheet = xf(box(52, 40, 1.2, '#eef6f6'), x - cx * 11, WATER_Y + 20, z - cz * 11, rot, -0.16);
    kit.vcolorBy(sheet, (px, py, pzz) => new THREE.Color().setScalar(0.8 + 0.2 * Math.abs(Math.sin(px * 0.9 + pzz * 0.9))));
    works.push(sheet);
    for (let k = 0; k < 9; k++) works.push(xf(sph(5 + rnd() * 3, 8, 5, '#f4fbfb'), x - cx * (15 + rnd() * 6) + Math.sin(a * DEG) * (k - 4) * 6, WATER_Y, z - cz * (15 + rnd() * 6) - Math.cos(a * DEG) * (k - 4) * 6, 0, 0, 0, 1, 0.45, 1));
  }
  for (const a of [18, 150, 206, 330]) {
    const r = wallR(a * DEG) - 26, [x, z] = at(a, r), rot = -a * DEG + Math.PI / 2, cx = Math.cos(a * DEG), cz = Math.sin(a * DEG);
    works.push(xf(box(12, 12, 6, '#b9bdb6'), x, WATER_Y + 18, z, rot));
    works.push(xf(cyl(3.2, 3.2, 4, 12, '#2f3a38'), x - cx * 3.2, WATER_Y + 18, z - cz * 3.2, rot, Math.PI / 2));
    works.push(xf(box(5, 18, 1, '#eef6f6'), x - cx * 7, WATER_Y + 9, z - cz * 7, rot, -0.25));
    works.push(xf(sph(4, 8, 5, '#f4fbfb'), x - cx * 10, WATER_Y, z - cz * 10, 0, 0, 0, 1, 0.4, 1));
  }
  // service galleries cut into the rock: a concrete balcony slab with a row of lit windows (glow at dusk), here and there
  for (const [a0, a1, y] of [[40, 52, 46], [128, 136, 62], [168, 182, 38], [300, 311, 54], [340, 346, 70]]) {
    for (let a = a0; a < a1; a += 0.7) {
      const r = wallR(a * DEG) - 70 * Math.pow(y / RIM, 2) - 4, [x, z] = at(a, r), rot = -a * DEG + Math.PI / 2;
      works.push(xf(box(12, 1.2, 5, '#a9aea7'), x, WATER_Y + y, z, rot));
      works.push(xf(box(9, 3, 1, '#ffe7b8', 1), x + Math.cos(a * DEG) * 1.5, WATER_Y + y + 2.2, z + Math.sin(a * DEG) * 1.5, rot));
    }
  }
  out.plain.push(...works);

  // ---------------------------------------------------------------------------------------------- the dome's grid
  // a geodesic dome (a subdivided icosahedron, the part above the rim) as glowing seams: each edge a thin ribbon facing
  // the centre, soft-edged, additive over the sky; a brighter dot at every node. Brighter at dusk (uNight).
  {
    const R = 2600, cy = -1100;
    const ico = new THREE.IcosahedronGeometry(1, 4);
    const P = ico.attributes.position;
    const key = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    const verts = new Map(), edges = new Set();
    const vid = (i) => { const k = key(P.getX(i), P.getY(i), P.getZ(i)); if (!verts.has(k)) verts.set(k, [P.getX(i), P.getY(i), P.getZ(i)]); return k; };
    for (let i = 0; i < P.count; i += 3) {
      const a = vid(i), b = vid(i + 1), c = vid(i + 2);
      for (const [p, q] of [[a, b], [b, c], [c, a]]) edges.add(p < q ? p + '|' + q : q + '|' + p);
    }
    const minY = (RIM + WATER_Y - cy + 40) / R;
    const pos = [], uvA = [];
    const W = 5.5;
    for (const e of edges) {
      const [ka, kb] = e.split('|'), A = verts.get(ka), Bv = verts.get(kb);
      if (A[1] < minY || Bv[1] < minY) continue;
      const a = new THREE.Vector3(...A).multiplyScalar(R), b = new THREE.Vector3(...Bv).multiplyScalar(R);
      const mid = a.clone().add(b).multiplyScalar(0.5), side = b.clone().sub(a).cross(mid).normalize().multiplyScalar(W);
      const p0 = a.clone().add(side), p1 = a.clone().sub(side), p2 = b.clone().sub(side), p3 = b.clone().add(side);
      for (const [p, u] of [[p0, 1], [p1, -1], [p2, -1], [p0, 1], [p2, -1], [p3, 1]]) { pos.push(p.x, p.y + cy, p.z); uvA.push(u, 0); }
    }
    for (const [, V] of verts) {
      if (V[1] < minY) continue;
      const c = new THREE.Vector3(...V).multiplyScalar(R), n = c.clone().normalize();
      const t1 = new THREE.Vector3(0, 1, 0).cross(n).normalize().multiplyScalar(W * 3.2), t2 = n.clone().cross(t1).normalize().multiplyScalar(W * 3.2);
      const q = [c.clone().add(t1).add(t2), c.clone().sub(t1).add(t2), c.clone().sub(t1).sub(t2), c.clone().add(t1).sub(t2)];
      for (const [k, u, w] of [[0, 1, 1], [1, -1, 1], [2, -1, -1], [0, 1, 1], [2, -1, -1], [3, 1, -1]]) { pos.push(q[k].x, q[k].y + cy, q[k].z); uvA.push(u, w + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvA, 2));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uNight: kit.U.uNight, uCol: { value: new THREE.Color('#9fd8ff') } },
      vertexShader: `varying vec2 vUv; varying float vH; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vH = w.y; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uNight; uniform vec3 uCol; varying vec2 vUv; varying float vH;
        void main(){
          float a;
          if (vUv.y > 0.5) { vec2 q = vec2(vUv.x, vUv.y - 2.0); a = smoothstep(1.0, 0.2, length(q)) * 1.3; }
          else a = pow(1.0 - abs(vUv.x), 1.6);
          float fade = smoothstep(${(RIM + WATER_Y + 30).toFixed(1)}, ${(RIM + WATER_Y + 220).toFixed(1)}, vH);
          gl_FragColor = vec4(uCol * a * fade * mix(0.42, 0.95, uNight), 1.0);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false,
    });
    const grid = new THREE.Mesh(g, mat);
    grid.name = 'TreehillsDomeGrid';
    grid.renderOrder = 9001;
    grid.frustumCulled = false;
    out.objects.push(grid);
  }

  // ---------------------------------------------------------------------------------------------- animation
  const place = out._place; delete out._place;
  out.animate = (t) => place(t);
  return out;

  function merge(list) {
    const geos = list.map((g) => prep(g.index ? g.toNonIndexed() : g));
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), glow = new Float32Array(n);
    let o = 0;
    for (const g of geos) {
      if (!g.attributes.normal) g.computeVertexNormals();
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
      if (g.attributes.glow) glow.set(g.attributes.glow.array, o);
      o += g.attributes.position.count;
    }
    const outG = new THREE.BufferGeometry();
    outG.setAttribute('position', new THREE.BufferAttribute(pos, 3)); outG.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    outG.setAttribute('color', new THREE.BufferAttribute(col, 3)); outG.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
    return outG;
  }
}
