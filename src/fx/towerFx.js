// Tower Command's look (the rules are src/game/tower.js). Built / cleared on 'match:state' like ZoneMarks; update(dt)
// each frame follows match.tower.
//   • the tower: a squat square platform (it matches the collider) in dark steel, its deck edge lights and beacon in the
//     ink of the team in control (warm yellow while neutral); four rider lamps up the mast; a halo that spins faster
//     the faster it moves
//   • a pillar of light: rings of light rising from the tower into the sky, so it can be found from anywhere
//   • the path: a faint ribbon along the whole route; the stretch the tower is heading down (to its next stop) is lit
//     in the ink of the team in control, chevrons flowing its way
//   • checkpoints and goals: light columns in the colour of the team that pushes through them (dim once cleared), a
//     ring on the floor; the goals taller and brighter
import * as THREE from 'three';
import { G, on } from '../core/ctx.js';
import { TOWER } from '../config.js';
import { ceilingAt } from '../game/tower.js';
import { GRATE } from '../game/towerPaint.js';

const NEUTRAL = new THREE.Color('#ffd54a');
const DIM = new THREE.Color('#7d8088');
const _c = new THREE.Color(), _v = new THREE.Vector3();
const PILLAR_H = 70, RINGS = 12;

// transparent overlays stay out of the GTAO normal / depth pass (scene.overrideMaterial), like the zone marks
function noAO(mesh) {
  mesh.onBeforeRender = (renderer, scene, camera, geometry) => { geometry.drawRange.count = scene.overrideMaterial ? 0 : Infinity; };
  return mesh;
}
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });

const PATH_VS = `
  attribute float aS; attribute float aSide;
  varying float vS; varying float vSide;
  void main(){ vS = aS; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PATH_FS = `
  uniform vec3 uBase; uniform vec3 uCol; uniform float uS; uniform float uEnd; uniform float uTime; uniform float uOn;
  varying float vS; varying float vSide;
  void main(){
    float edge = 1.0 - smoothstep(0.55, 1.0, abs(vSide));
    float core = 1.0 - smoothstep(0.0, 0.35, abs(vSide));
    float lo = min(uS, uEnd), hi = max(uS, uEnd);
    float run = uOn * step(lo, vS) * step(vS, hi);
    float sgn = uEnd >= uS ? 1.0 : -1.0;
    float t = fract(((vS - uS) * sgn) * 0.45 - uTime * 0.9);
    float chev = smoothstep(0.0, 0.18, t) * (1.0 - smoothstep(0.28, 0.5, t));
    // a solid line (tinted the riding team's ink), fully lit + chevrons from the tower to its next stop
    float a = edge * (0.55 + 0.2 * core + run * (0.25 + 0.2 * chev));
    vec3 c = mix(mix(uBase, uCol, 0.5 * uOn), uCol * (1.25 + 0.5 * chev), run);
    gl_FragColor = vec4(c, a);
  }`;
// checkpoint / goal pad: a square "mini zone" framing where the tower stops — a floor frame (bright rim, halftone dots
// fading in from the edge over a dark tint) and a low light curtain of halftone dots rising off its edges
const PAD_VS = `
  attribute vec2 aP; attribute float aK;
  varying vec2 vP; varying float vK;
  void main(){ vP = aP; vK = aK; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PAD_FS = `
  uniform vec3 uCol; uniform float uA; uniform float uBeat; uniform float uTime; uniform float uHalf; uniform float uH;
  varying vec2 vP; varying float vK;
  float dots(vec2 p, float cell, float r) { vec2 c = fract(p / cell) - 0.5; return 1.0 - smoothstep(r - 0.07, r + 0.07, length(c)); }
  void main(){
    float a; vec3 c;
    if (vK < 0.5) {
      float d = uHalf - max(abs(vP.x), abs(vP.y));             // m in from the edge
      float rim = 1.0 - smoothstep(0.09, 0.15, d);
      float band = 1.0 - smoothstep(0.15, 1.0, d);
      float dt = dots(vP, 0.24, mix(0.06, 0.4, band));
      a = rim * 0.95 + dt * band * (0.5 + 0.2 * uBeat) + 0.22;
      c = mix(uCol * 0.22, mix(uCol * 1.35, vec3(1.0), rim * 0.3), clamp(rim + dt * band, 0.0, 1.0));
    } else {
      float h = vP.y;                                            // 0 foot … 1 top
      float fade = pow(1.0 - h, 1.3);
      float dt = dots(vec2(vP.x, h * uH), 0.2, mix(0.42, 0.05, h));
      float foot = 1.0 - smoothstep(0.0, 0.09, h);
      float scan = smoothstep(0.42, 0.5, abs(fract(h * 2.5 - uTime * 0.5) - 0.5));
      a = (dt * 0.85 + foot * 0.9 + scan * 0.18) * fade;
      c = uCol * 1.35;
    }
    a *= uA * (0.8 + 0.2 * uBeat);
    if (a < 0.01) discard;
    gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
  }`;
// a pad `size` m square with a `ch` m curtain, as one mesh (turned to the platform's heading by its group)
function padMesh(size, ch, uniforms) {
  const h = size / 2, y0 = 0.045, pos = [], aP = [], aK = [], idx = [];
  const quad = (v, p, k) => { const b = pos.length / 3; v.forEach((q) => pos.push(...q)); p.forEach((q) => aP.push(...q)); for (let i = 0; i < 4; i++) aK.push(k); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  quad([[-h, y0, -h], [h, y0, -h], [h, y0, h], [-h, y0, h]], [[-h, -h], [h, -h], [h, h], [-h, h]], 0);
  const cs = [[-h, -h], [h, -h], [h, h], [-h, h]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = cs[i], [bx, bz] = cs[(i + 1) % 4], i0 = i * size;
    quad([[ax, y0, az], [bx, y0, bz], [bx, y0 + ch, bz], [ax, y0 + ch, az]], [[i0, 0], [i0 + size, 0], [i0 + size, 1], [i0, 1]], 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 2));
  geo.setAttribute('aK', new THREE.Float32BufferAttribute(aK, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: PAD_VS, fragmentShader: PAD_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const m = noAO(new THREE.Mesh(geo, mat));
  m.renderOrder = 1;
  return m;
}


export class TowerFx {
  constructor(scene) {
    this.scene = scene;
    this.match = null; this.T = null; this.root = null;
    this.hum = null;
    this._unsubs = [
      on('match:state', ({ state, match }) => {
        if (!match || match.attract || !match.tower) { if (match !== this.match || state === 'intro') this.clear(); return; }
        if (match !== this.match) this.build(match);
        if (state === 'results') this.clear();
      }),
      on('tower:checkpoint', ({ team, index, state }) => { const c = this.cps?.find((x) => x.cp.team === team && x.cp.index === index); if (c) c.flash = 1; void state; }),
    ];
  }

  clear() {
    this.hum?.stop?.(0.2); this.hum = null;
    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
    }
    this.root = null; this.match = null; this.T = null; this.cps = null;
  }
  dispose() { this.clear(); this._unsubs.forEach((u) => u()); }

  build(match) {
    this.clear();
    const T = match.tower;
    if (!T || !G.level) return;
    this.match = match; this.T = T;
    const root = (this.root = new THREE.Group());
    root.name = 'towerFx';
    this._buildTower(root);
    this._buildPillar(root);
    this._buildPath(root, T);
    this._buildStops(root, T);
    this.scene.add(root);
    this.col = NEUTRAL.clone();
    this.spin = 0;
    this.update(0);
  }

  // ---- the tower
  _buildTower(root) {
    const R = TOWER.platformR, H = TOWER.platformH;
    const g = (this.tower = new THREE.Group());
    const steel = new THREE.MeshStandardMaterial({ color: 0x2b2e38, roughness: 0.45, metalness: 0.55 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x14151b, roughness: 0.6, metalness: 0.3 });
    this.deckMat = new THREE.MeshStandardMaterial({ color: 0x555a66, roughness: 0.7, emissive: NEUTRAL.clone(), emissiveIntensity: 0.12 });
    // the body: a square block as big as its collider (its walls take ink: you swim up them), on a dark skirt
    const body = new THREE.Mesh(new THREE.BoxGeometry(2 * R, H - 0.14, 2 * R), steel);
    body.position.y = (H - 0.14) / 2; body.castShadow = true; body.receiveShadow = true;
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(2 * R + 0.06, 0.1, 2 * R + 0.06), trim);
    skirt.position.y = 0.05;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2 * R, 0.14, 2 * R), this.deckMat);
    deck.position.y = H - 0.07; deck.receiveShadow = true;
    g.add(body, skirt, deck);
    // the grate rimming the top (never inked): perforated steel strips round the deck's edge
    const gc = document.createElement('canvas'); gc.width = gc.height = 64;
    const gx = gc.getContext('2d');
    gx.fillStyle = '#3a3e4a'; gx.fillRect(0, 0, 64, 64);
    gx.fillStyle = '#101117';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { gx.beginPath(); gx.arc(8 + x * 16 + (y % 2) * 8, 8 + y * 16, 5, 0, Math.PI * 2); gx.fill(); }
    const gtex = new THREE.CanvasTexture(gc); gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping; gtex.colorSpace = THREE.SRGBColorSpace;
    const gMat = new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.55, metalness: 0.6 });
    const G0 = GRATE, len = 2 * R;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2, w = k % 2 ? len - 2 * G0 : len;   // (two full strips, two between them)
      const t = gtex.clone(); t.needsUpdate = true; t.repeat.set(w / 0.24, G0 / 0.24);
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.6 });
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, G0), m);
      strip.rotation.x = -Math.PI / 2; strip.rotation.z = a;
      strip.position.set(Math.sin(a) * (R - G0 / 2), H + 0.004, Math.cos(a) * (R - G0 / 2));
      strip.receiveShadow = true;
      g.add(strip);
    }
    gMat.dispose();
    // the ink on it: one mesh of five quads (the deck inside the grate, the four walls) drawn from TowerPaint's canvas
    const P = this.T && this.T.paint;
    if (P) {
      const pos = [], uv = [], idx = [], e = 0.006;
      const place = [
        (a, b) => [a, H + e, b], (a, b) => [R + e, b, a], (a, b) => [-R - e, b, -a], (a, b) => [-a, b, R + e], (a, b) => [a, b, -R - e],
      ];
      P.surf.forEach((sf, i) => {
        const [rx, ry, rw, rh] = sf.rect, k = pos.length / 3;
        for (const [a, b] of [[sf.a0, sf.b0], [sf.a1, sf.b0], [sf.a1, sf.b1], [sf.a0, sf.b1]]) {
          pos.push(...place[i](a, b));
          const px = rx + ((a - sf.a0) / (sf.a1 - sf.a0)) * rw, py = ry + rh - ((b - sf.b0) / (sf.b1 - sf.b0)) * rh;
          uv.push(px / P.W, 1 - py / P.Hc);
        }
        idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      this.inkMat = new THREE.MeshStandardMaterial({ map: P.texture, transparent: true, roughness: 0.3, metalness: 0, side: THREE.DoubleSide,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      const ink = noAO(new THREE.Mesh(geo, this.inkMat));
      ink.renderOrder = 1;
      g.add(ink);
    }
    // the thin pillar in the middle (cover for the riders; its collider is tower.js's): a steel column on a collar,
    // team-lit corner strips and a pyramid cap
    const PW = TOWER.pillarW, PH = TOWER.pillarH;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(PW, PH, PW), steel);
    shaft.position.y = H + PH / 2; shaft.castShadow = true; shaft.receiveShadow = true;
    const collar = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.16, 0.16, PW + 0.16), trim);
    collar.position.y = H + 0.08;
    const CAP = TOWER.pillarCap, cap = new THREE.Mesh(new THREE.CylinderGeometry(0, PW * 0.8, CAP, 4, 1), trim);
    cap.rotation.y = Math.PI / 4; cap.position.y = H + PH + CAP / 2; cap.castShadow = true;
    g.add(shaft, collar, cap);
    this.stripMat = new THREE.MeshBasicMaterial({ color: NEUTRAL.clone(), toneMapped: false });
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.045, PH - 0.3, 0.045), this.stripMat);
      st.position.set(sx * (PW / 2 + 0.005), H + 0.18 + (PH - 0.3) / 2, sz * (PW / 2 + 0.005));
      g.add(st);
    }
    // deck edge light bars (the team colour, brighter while it moves)
    this.edgeMat = new THREE.MeshBasicMaterial({ color: NEUTRAL.clone(), toneMapped: false });
    for (let k = 0; k < 4; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2 * R, 0.06, 0.06), this.edgeMat);
      const a = (k * Math.PI) / 2;
      bar.position.set(Math.sin(a) * (R - 0.02), H + 0.03, Math.cos(a) * (R - 0.02));
      bar.rotation.y = a;
      g.add(bar);
    }
    // the beacon floating well over the riders' heads (no mast: nothing stands in a rider's view) with its halo, and
    // four rider lamps across each end face
    this.beaconMat = new THREE.MeshBasicMaterial({ color: NEUTRAL.clone(), toneMapped: false });
    const beacon = (this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), this.beaconMat));
    beacon.position.y = H + 3.3;
    this.beaconY = H + 3.3; this.ceilT = 0;
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 6, 36), this.beaconMat);
    this.halo.position.y = H + 3.3; this.halo.rotation.x = Math.PI / 2;
    this.lamps = [];
    const lampMats = Array.from({ length: 4 }, () => new THREE.MeshBasicMaterial({ color: 0x222228, toneMapped: false }));
    for (const end of [1, -1]) for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.04), lampMats[k]);
      m.position.set((k - 1.5) * 0.36, H * 0.52, end * (R + 0.02));   // (over the ink on the wall)
      g.add(m);
    }
    this.lamps = lampMats.map((material) => ({ material }));
    g.add(beacon, this.halo);
    root.add(g);
  }

  // ---- the light pillar: a faint beam and rings of light climbing it
  _buildPillar(root) {
    const p = (this.pillar = new THREE.Group());
    this.beamMat = glow(NEUTRAL.clone(), 0.13);
    const beam = noAO(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, PILLAR_H, 12, 1, true), this.beamMat));
    beam.position.y = PILLAR_H / 2; beam.renderOrder = 2;
    p.add(beam);
    this.ringMat = glow(NEUTRAL.clone(), 0.55);
    const ringGeo = new THREE.TorusGeometry(1, 0.05, 6, 40);
    this.rings = [];
    for (let i = 0; i < RINGS; i++) {
      const r = noAO(new THREE.Mesh(ringGeo, this.ringMat.clone()));
      r.rotation.x = Math.PI / 2; r.renderOrder = 2;
      this.rings.push(r); p.add(r);
    }
    root.add(p);
  }

  // ---- the rail: a thin line on the stage along the track — over the floors, straight up a wall's face and across its
  // top, down a drop's face (Splatoon's tower rail). One quad per straight run, each a line-width past its ends so
  // the corners close square.
  _buildPath(root, T) {
    const pts = T.path.rail(), W = 0.13, LIFT = 0.04;
    const pos = [], aS = [], aSide = [], idx = [];
    const t = new THREE.Vector3(), n = new THREE.Vector3(), sd = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1], L = A.p.distanceTo(B.p);
      if (L < 1e-3) continue;
      t.subVectors(B.p, A.p).multiplyScalar(1 / L);
      n.copy(A.wall && B.wall ? A.n : up);
      sd.crossVectors(t, n);
      if (sd.lengthSq() < 1e-6) sd.set(-t.z, 0, t.x);
      sd.normalize();
      const k = pos.length / 3;
      for (const [P, s0, e] of [[A.p, A.s, -W], [B.p, B.s, W]]) for (const side of [1, -1]) {
        pos.push(P.x + t.x * e + sd.x * W * side + n.x * LIFT, P.y + t.y * e + sd.y * W * side + n.y * LIFT, P.z + t.z * e + sd.z * W * side + n.z * LIFT);
        aS.push(s0); aSide.push(side);
      }
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
    geo.setAttribute('aSide', new THREE.Float32BufferAttribute(aSide, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    this.pathU = { uBase: { value: new THREE.Color(0.85, 0.85, 0.8) }, uCol: { value: NEUTRAL.clone() }, uS: { value: 0 }, uEnd: { value: 0 }, uTime: { value: 0 }, uOn: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: this.pathU, vertexShader: PATH_VS, fragmentShader: PATH_FS, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const mesh = noAO(new THREE.Mesh(geo, mat));
    mesh.frustumCulled = false; mesh.renderOrder = -1;
    root.add(mesh);
  }

  // ---- checkpoints and goals
  _buildStops(root, T) {
    this.cps = [];
    const col = (team) => (G.teamColors && G.teamColors[team]) || NEUTRAL;
    const stop = (s, team, goal) => {
      const at = T.path.at(s), g = new THREE.Group();
      g.position.copy(at);
      const h = goal ? 16 : 7, r = goal ? 0.42 : 0.22;
      const colMat = glow(col(team), goal ? 0.4 : 0.32);
      const column = noAO(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.6, h, 12, 1, true), colMat));
      column.position.y = h / 2; column.renderOrder = 1;
      // the pad: a square mini zone just bigger than the platform, square to it
      const size = 2 * TOWER.platformR + (goal ? 1.3 : 0.7), ch = goal ? 1.25 : 0.75;
      const padU = { uCol: { value: col(team).clone() }, uA: { value: 1 }, uBeat: { value: 0 }, uTime: { value: 0 }, uHalf: { value: size / 2 }, uH: { value: ch } };
      const ring = padMesh(size, ch, padU);
      ring.rotation.y = T.yaw;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(goal ? 0.34 : 0.2, 14, 10), new THREE.MeshBasicMaterial({ color: col(team), toneMapped: false }));
      lamp.position.y = goal ? 2.6 : 1.6;
      g.add(column, ring, lamp);
      root.add(g);
      return { g, colMat, padU, lamp, team, goal };
    };
    for (const cp of T.cps) this.cps.push({ ...stop(cp.team === 0 ? cp.d : -cp.d, cp.team, false), cp, flash: 0 });
    this.goals = [stop(T.path.len[0], 0, true), stop(-T.path.len[1], 1, true)];
  }

  update(dt) {
    const T = this.T, m = this.match;
    if (!T || !this.root || !m || G.match !== m) return;
    if (T.paint && T.paint.dirty) { T.paint.texture.needsUpdate = true; T.paint.dirty = false; }   // (new ink on it this frame)
    const t = G.time;
    const owner = T.owner;
    const target = owner >= 0 && G.teamColors ? G.teamColors[owner] : NEUTRAL;
    this.col.lerp(target, dt > 0 ? 1 - Math.exp(-8 * dt) : 1);
    const moving = T.moving !== 0;
    // tower
    const g = this.tower;
    g.position.copy(T.pos);
    g.rotation.y = T.yaw;
    this.deckMat.emissive.copy(this.col); this.deckMat.emissiveIntensity = 0.1 + (moving ? 0.1 : 0);
    const pulse = moving ? 0.75 + 0.25 * Math.sin(t * 9) : T.contested ? 0.55 + 0.45 * Math.abs(Math.sin(t * 14)) : 0.85;
    this.edgeMat.color.copy(this.col).multiplyScalar(1.2 * pulse);
    this.beaconMat.color.copy(this.col).multiplyScalar(1.6);
    this.stripMat.color.copy(this.col).multiplyScalar(1.3 * pulse);
    this.spin += dt * (moving ? 6 : 1.2);
    this.halo.rotation.z = this.spin;
    // under a roof (an arcade, a passage, a trestle) the beacon floats just below it instead of through it
    if ((this.ceilT -= dt) <= 0) {
      this.ceilT = 0.2;
      const H = TOWER.platformH, ceil = ceilingAt(T.pos.x, T.pos.z, T.pos.y + H + 0.3);
      const room = ceil - T.pos.y - 0.5;
      this.beaconRoom = room >= H + TOWER.pillarH + TOWER.pillarCap + 0.3;             // no room over the pillar: hidden till it rolls out
      this.beaconWant = Math.max(H + TOWER.pillarH + TOWER.pillarCap + 0.3, Math.min(H + 3.3, room));
    }
    this.beacon.visible = this.halo.visible = this.beaconRoom !== false;
    this.beaconY += ((this.beaconWant ?? this.beaconY) - this.beaconY) * (dt > 0 ? 1 - Math.exp(-8 * dt) : 1);
    this.beacon.position.y = this.halo.position.y = this.beaconY;
    const n = owner >= 0 ? (T.follower && T.hostRiders ? T.hostRiders[owner] : T.riders[owner]) : 0;
    this.lamps.forEach((l, k) => l.material.color.copy(k < n ? this.col : _c.setRGB(0.13, 0.13, 0.16)).multiplyScalar(k < n ? 1.8 : 1));
    // pillar: from the deck up
    this.pillar.position.set(T.pos.x, T.pos.y + TOWER.platformH + 3.5, T.pos.z);
    this.beamMat.color.copy(this.col);
    // it's for finding the tower from afar: close up (riding it) it fades so it never stands in the way
    const cam0 = G.rig?.gameCam || G.camera, cd = cam0 ? Math.hypot(cam0.position.x - T.pos.x, cam0.position.z - T.pos.z) : 99;
    const nearK = Math.min(1, Math.max(0, (cd - 5) / 9));
    this.beamMat.opacity = (0.1 + (moving ? 0.05 : 0)) * nearK;
    const rise = moving ? 7 : 4;
    this.rings.forEach((r, i) => {
      const k = ((t * rise) / PILLAR_H + i / RINGS) % 1, y = k * PILLAR_H;
      r.position.y = y;
      r.scale.setScalar(0.7 + k * 1.3);
      r.material.color.copy(this.col);
      r.material.opacity = 0.6 * (1 - k) * Math.min(1, k * 12) * (0.25 + 0.75 * nearK);
    });
    // path: lit from the tower to where it's heading
    const U = this.pathU;
    U.uTime.value = t; U.uS.value = T.s; U.uCol.value.copy(this.col);
    let end = T.s, lit = 0;
    if (owner >= 0) {
      const cp = T._nextCp(owner), dir = owner === 0 ? 1 : -1;
      end = cp ? dir * cp.d : dir * T.path.len[owner]; lit = 1;
      if (T.homing) { end = 0; lit = 0.8; }                       // (empty, rolling home: it stops at the centre)
    } else if (T.returning) { end = 0; lit = 0.6; }
    U.uEnd.value = end; U.uOn.value += (lit - U.uOn.value) * (dt > 0 ? 1 - Math.exp(-6 * dt) : 1);
    // checkpoints: dim once cleared, flash on a change, beat while the tower waits at one
    for (const c of this.cps) {
      const base = c.cp.cleared ? DIM : (G.teamColors ? G.teamColors[c.team] : NEUTRAL);
      c.flash = Math.max(0, c.flash - dt * 1.5);
      const at = !c.cp.cleared && Math.abs(T.s - (c.cp.team === 0 ? c.cp.d : -c.cp.d)) < 0.05;
      const beat = at ? 0.6 + 0.4 * Math.abs(Math.sin(t * 6)) : 1;
      c.colMat.color.copy(base); c.colMat.opacity = (c.cp.cleared ? 0.12 : 0.3) * beat + c.flash * 0.4;
      c.padU.uCol.value.copy(base); c.padU.uA.value = c.cp.cleared ? 0.3 : 1; c.padU.uBeat.value = at ? Math.abs(Math.sin(t * 6)) : c.flash; c.padU.uTime.value = t;
      c.lamp.material.color.copy(base).multiplyScalar(c.cp.cleared ? 0.7 : 1.5);
    }
    for (const gl of this.goals) {
      const b = G.teamColors ? G.teamColors[gl.team] : NEUTRAL;
      gl.colMat.color.copy(b); gl.colMat.opacity = 0.32 + 0.1 * Math.sin(t * 2 + gl.team * 3);
      gl.padU.uCol.value.copy(b); gl.padU.uTime.value = t; gl.padU.uBeat.value = 0.5 + 0.5 * Math.sin(t * 2 + gl.team * 3);
      gl.lamp.material.color.copy(b).multiplyScalar(1.6);
    }
    // the rumble of it moving (positional, near the camera only)
    const cam = G.rig?.gameCam || G.camera, near = cam && cam.position.distanceTo(T.pos) < 36;
    if (moving && near && G.audio) {
      if (!this.hum) this.hum = G.audio.loop?.('tower_move', { pos: T.pos, volume: 0.5 }) || null;
      this.hum?.set?.({ pos: T.pos, volume: 0.5, pitch: 0.9 + 0.1 * Math.abs(T.moving) });
    } else if (this.hum) { this.hum.stop?.(0.25); this.hum = null; }
    void _v;
  }
}
