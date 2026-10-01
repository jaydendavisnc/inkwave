// Spirhalite Islands — stage surface materials (texlib layers `spirhalite:<name>`) on this stage's reserved PATTERN slots
// 58–60 (stages/surfaces.js STAGE_SLOTS). See src/world/stages/cargo/surfaces.js for the contract: SURFACES lists
// { slot, name, onWall?, onTop?, mat }, mat = a texlib material (prep declares up to 4 fbm + 2 worley requests, surf
// writes s.alb / s.a / s.h / s.rough / s.metal / s.cav; heights in metres).
// All three are `mask` layers: albedo.a = where the block colour applies (the sand / the stone), albedo.rgb = the
// layer's own colours (moss, shell grit, lichen, water stains), so layout.js picks the tone per block.
//
//   dune   white dune sand: fine quartz grain with darker mineral specks, wind ripples (~10 cm, warped, fading out in
//          sheltered patches), sparse shell grit, faint damp mottling
//   moss   the same sand with mats of pale sage moss creeping over it: lacy, fern-like mat edges, raised and soft,
//          with little sprigs and dry straw-coloured patches (the reference's moss over the dunes)
//   ruin   the ancient stone of the arch, pillars and causeway: pale grey ashlar in eroded courses (1.2 x 0.6 m, joints
//          worn round and deep), pitted faces, water-darkened streaks, lichen rosettes (sulphur yellow, grey-green)
export const SURF = { dune: 58, moss: 59, ruin: 60 };

const PLAIN = 0, GRID = 1, HEX = 2;

// shared GLSL: the sand (grain, specks, ripples) into sandL (the tinted tone), own colours into own / cov
const SAND = /* glsl */`
  float big = n[0], mott = n[1], grain = n[2], warp = n[3];
  vec4 gc = c[0];
  // wind ripples: ~10 cm crests, periodic over the repeat (integer frequencies), warped and faded by noise
  float ph = TAU * (27.0 * uv.x + 8.0 * uv.y) + 5.5 * warp + 1.6 * big;
  float rip = 0.5 + 0.5 * sin(ph);
  rip = rip * rip * (3.0 - 2.0 * rip);
  float calm = smoothstep(-0.15, 0.35, big + 0.35 * mott);
  float ripple = rip * (0.35 + 0.65 * calm);
  float speck = step(0.93, gc.z) * (1.0 - aa(0.18, gc.x));          // dark mineral grains
  float shellM = step(0.975, fract(gc.w * 7.7 + gc.z * 3.1)) * (1.0 - aa(0.26, gc.x));
  float sandL = 0.84 * (1.0 + 0.05 * mott + 0.035 * grain + 0.045 * (ripple - 0.5) * calm) * (1.0 - 0.05 * smoothstep(0.25, 0.7, -big));
`;

export const SURFACES = [
  {
    slot: 58, name: 'dune', onWall: 59,   // (dune banks and walls: moss creeping over the sand)
    mat: {
      detail: 0.55, scale: 3.0, tint: true, mask: true, alpha: false, mode: PLAIN, sym: 0, hr: [-0.004, 0.003], ao: 0.3,
      prep: `f[0] = FB(uv, ivec2(3), 4, 0.55, 5801u); f[1] = FB(uv, ivec2(10), 3, 0.5, 5803u); f[2] = FB(uv, ivec2(96), 2, 0.5, 5807u);
  f[3] = FB(uv, ivec2(5), 3, 0.5, 5809u); w[0] = WO(uv, ivec2(150), 1.0, 5811u);`,
      surf: SAND + /* glsl */`
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, lin(vec3(0.42, 0.38, 0.34)), speck * 0.7); cov *= 1.0 - speck * 0.7;
  own = mix(own, lin(vec3(0.98, 0.9, 0.86)), shellM); cov *= 1.0 - shellM;
  s.alb = own; s.a = cov * sandL;
  s.h = 0.0022 * (ripple - 0.5) * calm + 0.0004 * mott + 0.00015 * grain + 0.0003 * shellM;
  s.rough = 0.9 - 0.05 * ripple * calm + 0.03 * mott - 0.2 * shellM;
  s.cav = 1.0 - 0.12 * (1.0 - ripple) * calm;`,
    },
  },
  {
    slot: 59, name: 'moss',
    mat: {
      detail: 0.6, scale: 3.4, tint: true, mask: true, alpha: false, mode: PLAIN, sym: 0, hr: [-0.004, 0.012], ao: 0.4,
      prep: `f[0] = FB(uv, ivec2(3), 4, 0.55, 5901u); f[1] = FB(uv, ivec2(10), 3, 0.5, 5903u); f[2] = FB(uv, ivec2(96), 2, 0.5, 5907u);
  f[3] = FB(uv, ivec2(5), 3, 0.5, 5909u); w[0] = WO(uv, ivec2(150), 1.0, 5911u);
  vec2 mq = uv + 0.02 * vec2(sin(TAU * (6.0 * uv.y + 3.0 * uv.x)), sin(TAU * (5.0 * uv.x - 4.0 * uv.y) + 0.8));
  w[1] = WO(mq, ivec2(34), 0.95, 5913u);`,
      surf: SAND + /* glsl */`
  // moss mats: where the low-frequency field is high; the mat edge broken into fronds by the fine worley (lacy fringe)
  vec4 fc = c[1];
  float frond = smoothstep(0.02, 0.2, (fc.y - fc.x));                // cell borders = the gaps between fronds
  float field = 0.62 * big + 0.28 * mott + 0.18 * (fc.z - 0.5) + 0.05;
  float body = smoothstep(0.0, 0.08, field);
  float fringe = smoothstep(-0.16, 0.0, field) * (1.0 - body) * (1.0 - frond);
  float moss = max(body, fringe);
  float sprig = step(0.9, fract(fc.w * 11.3)) * (1.0 - aa(0.12, fc.x)) * (1.0 - body) * smoothstep(-0.35, -0.1, field);
  moss = max(moss, sprig);
  float lobe = smoothstep(0.0, 0.3, fc.y - fc.x);                    // cushion lobes inside the mat
  float dry = smoothstep(0.25, 0.6, mott) * body;
  vec3 mc = mix(lin(vec3(0.55, 0.62, 0.4)), lin(vec3(0.66, 0.7, 0.46)), 0.5 + 0.5 * grain);
  mc = mix(mc, lin(vec3(0.73, 0.7, 0.5)), dry * 0.55);                // straw-dry patches
  mc *= 0.86 + 0.18 * lobe;
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, lin(vec3(0.42, 0.38, 0.34)), speck * 0.7 * (1.0 - moss)); cov *= 1.0 - speck * 0.7 * (1.0 - moss);
  own = mix(own, lin(vec3(0.98, 0.9, 0.86)), shellM * (1.0 - moss)); cov *= 1.0 - shellM * (1.0 - moss);
  own = mix(own, mc, moss); cov *= 1.0 - moss;
  s.alb = own; s.a = cov * sandL;
  s.h = mix(0.0018 * (ripple - 0.5) * calm + 0.0004 * mott, 0.006 + 0.004 * lobe + 0.001 * grain, moss);
  s.rough = mix(0.9 - 0.05 * ripple * calm, 0.97, moss);
  s.cav = mix(1.0, 0.75 + 0.25 * lobe, moss) * (1.0 - 0.25 * fringe);`,
    },
  },
  {
    slot: 60, name: 'ruin',
    mat: {
      detail: 0.8, scale: 3.2, tint: true, mask: true, alpha: false, mode: GRID, sym: 1, hr: [-0.035, 0.006], ao: 0.5,
      prep: `f[0] = FB(uv, ivec2(3), 4, 0.55, 6001u); f[1] = FB(uv, ivec2(12), 3, 0.5, 6003u); f[2] = FB(uv, ivec2(64), 2, 0.5, 6007u);
  f[3] = FB(uv, ivec2(2, 9), 3, 0.5, 6009u); w[0] = WO(uv, ivec2(40), 0.9, 6011u); w[1] = WO(uv, ivec2(6), 0.9, 6013u);`,
      surf: /* glsl */`
  // ancient ashlar, worn soft: 4 courses of 0.8 m per repeat, each split into 2–3 blocks of uneven length (per-course
  // hashed joint positions), joints weathered wide and rounded but filled with grit (low contrast), arrises eroded,
  // blocks sagged and tilted a little, pitted faces, lichen rosettes, water-darkened streaks
  int row = int(floor(P.y / 0.8));
  ivec2 rw = wrp(ivec2(0, row), ivec2(1, 4));
  float j1 = 0.6 + 0.9 * hf(rw, 11u), j2 = j1 + 0.8 + 0.8 * hf(rw, 13u);
  float px = P.x;
  float a0 = px < j1 ? 0.0 : (px < j2 ? j1 : j2), a1 = px < j1 ? j1 : (px < j2 ? j2 : 3.2);
  float bi = px < j1 ? 0.0 : (px < j2 ? 1.0 : 2.0);
  vec2 lp = vec2(px - 0.5 * (a0 + a1), P.y - float(row) * 0.8 - 0.4);
  ivec2 bid = ivec2(int(bi), rw.y);
  float big = n[0], mott = n[1], fine = n[2], streak = n[3];
  float wob = 0.018 * big + 0.01 * mott;
  float e = -sdRB(lp, vec2(0.5 * (a1 - a0), 0.4) - 0.01, 0.09 + 0.05 * hf(bid, 7u)) + wob;
  vec2 pr = edgeProf(e, 0.006, 0.08, 0.02, 0.018);
  float inJ = pr.y;
  float tone = 0.8 * (1.0 + 0.12 * (hf(bid, 3u) - 0.5) + 0.08 * mott + 0.04 * fine);
  vec2 tilt = hf2(bid, 9u) - 0.5;
  vec4 pc = c[0];
  float pit = (1.0 - smoothstep(0.05, 0.22, pc.x)) * step(0.5, pc.z);
  float hollow = smoothstep(0.3, 0.8, big) * smoothstep(0.02, 0.12, e);
  vec4 lc = c[1];
  float lich = step(0.6, lc.z) * (1.0 - smoothstep(0.1, 0.28 + 0.1 * fine, lc.x)) * smoothstep(-0.1, 0.3, mott) * (1.0 - inJ);
  vec3 lichC = mix(lin(vec3(0.84, 0.8, 0.46)), lin(vec3(0.64, 0.69, 0.57)), step(0.8, lc.z));
  float wetS = smoothstep(0.25, 0.65, streak) * 0.45;
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, lin(vec3(0.46, 0.44, 0.41)) * (0.9 + 0.2 * fine), inJ * 0.75); cov *= 1.0 - inJ * 0.75;
  own = mix(own, lichC * (0.85 + 0.25 * fine), lich * 0.8); cov *= 1.0 - lich * 0.8;
  s.alb = own; s.a = cov * tone * (1.0 - 0.25 * wetS) * (1.0 - 0.15 * pit) * (1.0 - 0.06 * hollow);
  s.h = pr.x + dot(tilt, lp) * 0.012 * (1.0 - inJ) - 0.004 * pit - 0.007 * hollow + 0.0014 * mott + 0.0004 * fine + 0.0008 * lich;
  s.rough = mix(0.88 + 0.05 * fine - 0.08 * wetS, 0.95, inJ);
  s.cav = mix(1.0, 0.6, inJ) * (1.0 - 0.3 * pit);`,
    },
  },
];
