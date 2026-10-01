// Mount Nantai — stage surface materials (texlib layers `nantai:<name>`) on this stage's reserved PATTERN slots 49–51
// (stages/surfaces.js STAGE_SLOTS). See src/world/stages/cargo/surfaces.js for the contract.
//
// The mountain is built from three surfaces, muted so team ink stays the loudest thing on screen:
//   granite  the summit's pale grey granite: big irregular slabs with weathered joints, a crystal speckle (white / pink
//            feldspar, black mica) and lichen rosettes (sulphur-yellow, grey-green, black dots). Paint mask: the block
//            colour tints the stone (the lichen and the crystals keep their own colours), so terraces, the ridge and
//            Pearl's rock can each sit a shade apart.
//   turf     short alpine turf: grass tufts (tinted by the block colour), cushions of yellow-green moss, and patches
//            where the thin soil wears through to grit and pebbles (own colours).
//   ashlar   the observatory's dressed granite: running-bond blocks in 0.6 m courses with recessed lime joints (walls),
//            the same bond read as paving flags on the terraces. Paint mask like the natural granite.
// (the boardwalks and bridges' timber use the shared weathered deck boards, PATTERN.wood)
export const SURF = { granite: 49, turf: 50, ashlar: 51 };

const granite = {
  detail: 0.8, scale: 4.0, tint: true, mask: true, alpha: false, mode: 0, sym: 0, hr: [-0.01, 0.004], ao: 0.35,
  prep: `f[0] = FB(uv, ivec2(3), 4, 0.55, 4901u); f[1] = FB(uv, ivec2(12), 3, 0.5, 4903u); f[2] = FB(uv, ivec2(96), 2, 0.5, 4907u);
  f[3] = FB(uv, ivec2(20), 4, 0.55, 4909u);
  vec2 wq = uv + 0.03 * vec2(sin(TAU * (2.0 * uv.y + uv.x)) + 0.5 * sin(TAU * (5.0 * uv.y - 3.0 * uv.x) + 1.1),
                             sin(TAU * (2.0 * uv.x - uv.y) + 0.4) + 0.5 * sin(TAU * (4.0 * uv.x + 5.0 * uv.y) + 2.3));
  w[0] = WO(wq, ivec2(2), 0.8, 4911u); w[1] = WO(uv, ivec2(150), 1.0, 4913u);`,
  surf: /* glsl */`
  // slabs ~1.3 m across: weathered joints (a soft rounded groove, a little darker), each slab its own tone, domed
  vec4 sl = c[0];
  float sEdge = (sl.y - sl.x) * 2.0;
  float jw = 0.006 + 0.006 * (n[1] * 0.5 + 0.5);
  float joint = 1.0 - aa(jw, sEdge);
  float jsoft = 1.0 - smoothstep(jw, jw + 0.12, sEdge);
  float dome = smoothstep(0.0, 0.5, sEdge);
  float tone = 0.92 + 0.1 * fract(sl.z * 7.31);
  // crystals (~2.5 cm): white feldspar, a few pink, black mica flecks, the rest grey quartz — a fine, even speckle
  vec4 cr = c[1];
  float ci = cr.z, cin = smoothstep(0.12, 0.32, cr.y - cr.x);
  float feld = step(0.72, ci) * cin, pink = step(0.95, ci) * cin, mica = step(ci, 0.05) * smoothstep(0.25, 0.45, cr.y - cr.x);
  float body = 0.8 * tone * (1.0 + 0.07 * n[0] + 0.04 * n[1] + 0.04 * n[2]) * (1.0 + 0.06 * feld - 0.03 * step(0.3, ci) * step(ci, 0.5));
  body *= (1.0 - 0.04 * jsoft) * (0.98 + 0.04 * dome);
  body *= 1.0 - 0.05 * smoothstep(0.2, 0.8, -n[0]);
  // lichen: soft rosettes in clusters on the slab faces, never in the joints
  float lz = smoothstep(0.38, 0.68, n[3] + 0.15 * n[1]) * smoothstep(0.06, 0.3, sEdge);
  float lk = fract(sl.z * 13.7 + floor(n[3] * 3.0) * 0.37);
  float ring = smoothstep(0.1, 0.6, n[2] * 0.5 + 0.5);
  vec3 yel = lin(vec3(0.8, 0.72, 0.42)) * (0.92 + 0.14 * ring), grn = lin(vec3(0.66, 0.7, 0.6)) * (0.94 + 0.1 * ring);
  vec3 lc = lk < 0.4 ? yel : grn;
  float lich = lz * (0.4 + 0.3 * ring);
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, lin(vec3(0.88, 0.87, 0.84)), feld * 0.3); cov *= 1.0 - feld * 0.3;
  own = mix(own, lin(vec3(0.8, 0.68, 0.63)), pink * 0.35); cov *= 1.0 - pink * 0.35;
  own = mix(own, lin(vec3(0.2, 0.2, 0.21)), mica * 0.45); cov *= 1.0 - mica * 0.45;
  own = mix(own, lc, lich); cov *= 1.0 - lich;
  own = mix(own, lin(vec3(0.5, 0.49, 0.47)) * (0.92 + 0.15 * n[2]), joint * 0.35); cov *= 1.0 - joint * 0.35;
  s.alb = own; s.a = cov * body;
  s.h = -0.006 * joint - 0.002 * jsoft + 0.0015 * dome + 0.0004 * n[1] + 0.00025 * n[2] + 0.0002 * feld + 0.0003 * lich;
  s.rough = 0.83 + 0.05 * n[2] - 0.05 * feld + 0.05 * lich + 0.04 * joint;
  s.cav = (1.0 - 0.3 * joint) * (1.0 - 0.06 * jsoft);`,
};

const turf = {
  detail: 0.6, scale: 2.4, tint: false, alpha: false, mode: 2, sym: 7, hr: [-0.012, 0.006], ao: 0.45,
  prep: `f[0] = FB(uv, ivec2(2), 4, 0.55, 5001u); f[1] = FB(uv, ivec2(10), 3, 0.5, 5003u); f[2] = FB(uv, ivec2(80), 2, 0.5, 5007u);
  f[3] = FB(uv, ivec2(6), 3, 0.5, 5009u);
  w[0] = WO(uv, ivec2(40), 0.9, 5011u); w[1] = WO(uv, ivec2(150), 1.0, 5013u);`,
  surf: /* glsl */`
  // alpine turf: grass tufts (clumps ~1.6 cm, bright tips, dark hearts) in drifts of deep green and sun-dried
  // yellow-green, cushions of moss, and worn patches where the thin soil shows grit and pebbles
  float pat = n[0], drift = n[3];
  float bare = smoothstep(0.34, 0.66, -pat + 0.3 * drift - 0.08);
  float moss = smoothstep(0.22, 0.52, pat + 0.25 * drift) * (1.0 - bare);
  vec4 bl = c[1];
  float clump = smoothstep(0.0, 0.45, bl.y - bl.x);
  float blades = 0.5 + 0.5 * sin((bl.x * 9.0 + fract(bl.z * 7.3) * 6.2831) * 3.0);
  float bv = 0.84 + 0.26 * fract(bl.z * 9.1);
  vec3 deep = lin(vec3(0.43, 0.55, 0.3)), dry = lin(vec3(0.6, 0.62, 0.38)), tip = lin(vec3(0.66, 0.72, 0.44));
  vec3 grassC = mix(deep, dry, smoothstep(-0.35, 0.45, drift + 0.3 * n[1]));
  grassC = mix(grassC * 0.78, mix(grassC, tip, 0.35), clump * (0.7 + 0.3 * blades)) * bv * (1.0 + 0.07 * n[2]);
  vec4 pb = c[0];
  float peb = bare * step(0.4, pb.z) * smoothstep(0.06, 0.2, pb.y - pb.x);
  float pdome = sqrt(clamp((pb.y - pb.x) / 0.5, 0.0, 1.0));
  vec3 pcol = (pb.z < 0.6 ? lin(vec3(0.66, 0.64, 0.6)) : pb.z < 0.85 ? lin(vec3(0.74, 0.72, 0.68)) : lin(vec3(0.52, 0.5, 0.47))) * (0.88 + 0.2 * fract(pb.z * 5.3)) * (0.9 + 0.12 * pdome);
  vec3 grit = lin(vec3(0.54, 0.5, 0.43)) * (0.9 + 0.15 * n[2] + 0.1 * n[1]);
  vec3 mossC = mix(lin(vec3(0.62, 0.66, 0.3)), lin(vec3(0.48, 0.56, 0.26)), smoothstep(-0.3, 0.5, n[1])) * (0.9 + 0.2 * clump);
  float fl = step(0.992, fract(bl.z * 57.1)) * (1.0 - smoothstep(0.1, 0.3, bl.x)) * (1.0 - bare) * (1.0 - moss);
  vec3 flC = fract(bl.z * 91.0) < 0.6 ? lin(vec3(0.94, 0.93, 0.9)) : lin(vec3(0.92, 0.8, 0.34));
  vec3 col = grassC;
  col = mix(col, mossC, moss * 0.85);
  col = mix(col, grit, bare);
  col = mix(col, pcol, peb);
  col = mix(col, flC, fl);
  s.alb = col;
  s.h = 0.004 * clump * (1.0 - bare) * (0.6 + 0.4 * blades) + 0.002 * moss * (0.5 + 0.5 * n[2]) - 0.005 * bare + 0.005 * peb * pdome + 0.0008 * n[1];
  s.rough = mix(mix(0.86 + 0.06 * n[2], 0.92, moss), mix(0.93, 0.7, peb), bare);
  s.cav = mix(0.82 + 0.18 * clump, 1.0, bare) * mix(1.0, 0.8 + 0.2 * pdome, peb);`,
};

const ashlar = {
  detail: 0.7, scale: 2.4, tint: true, mask: true, alpha: false, mode: 1, sym: 1, hr: [-0.014, 0.004], ao: 0.45,
  prep: `int row = int(floor(P.y / 0.6));
  f[0] = FB(uv, ivec2(2), 4, 0.55, 5201u); f[1] = FB(uv, ivec2(12), 3, 0.5, 5203u); f[2] = FB(uv, ivec2(96), 2, 0.5, 5207u);
  f[3] = FB(uv, ivec2(8), 3, 0.5, 5209u);
  w[0] = WO(uv, ivec2(150), 1.0, 5211u); w[1] = WO(uv, ivec2(24), 0.9, 5213u);`,
  surf: /* glsl */`
  // dressed granite in running bond: 0.6 m courses, blocks 0.8–1.6 m (a joint always on the repeat border), 1 cm
  // recessed lime joints, each block its own tone and a little pitch-faced dome; on a floor the same reads as flags
  const float CH = 0.6;
  float row = floor(P.y / CH), ly = P.y - row * CH;
  ivec2 rid = wrp(ivec2(int(row), 0), ivec2(4, 1));
  float h1 = hf(rid, 3u), h2 = hf(rid, 7u);
  // joints along this course: 0 (= the border 2.4), a, and on some courses a third block's joint b2
  float a = 0.7 + 0.9 * h1;
  float b2 = (2.4 - a > 1.3 && h2 > 0.4) ? a + (2.4 - a) * (0.45 + 0.1 * h2) : 9.0;
  float xj = min(min(P.x, 2.4 - P.x), min(abs(P.x - a), abs(P.x - b2)));
  float blk = P.x < a ? 0.0 : (P.x < b2 ? 1.0 : 2.0);
  float yj = min(ly, CH - ly);
  vec2 ev = edgeProf(yj, 0.005, 0.012, 0.004, 0.012);
  vec2 eu = edgeProf(xj, 0.005, 0.012, 0.004, 0.012);
  float inJ = max(ev.y, eu.y);
  float bid = hf(ivec2(int(row) * 3 + int(blk), 11), 13u);
  float tone = 0.9 + 0.14 * bid;
  vec4 cr = c[0];
  float ci = cr.z, cin = smoothstep(0.12, 0.32, cr.y - cr.x);
  float feld = step(0.74, ci) * cin, mica = step(ci, 0.05) * smoothstep(0.25, 0.45, cr.y - cr.x);
  float dome = smoothstep(0.0, 0.08, min(xj, yj));
  float body = 0.8 * tone * (1.0 + 0.06 * n[0] + 0.05 * n[1] + 0.04 * n[2]) * (0.97 + 0.05 * dome) * (1.0 + 0.05 * feld);
  // weathering: darker streaks under the course joints, lichen spots on some blocks
  body *= 1.0 - 0.06 * smoothstep(0.1, 0.0, ly) * smoothstep(-0.2, 0.5, n[3]);
  float lz = smoothstep(0.42, 0.72, n[3] + 0.2 * n[1]) * smoothstep(0.02, 0.08, min(xj, yj)) * step(0.4, bid);
  vec3 lc = fract(bid * 7.3) < 0.5 ? lin(vec3(0.8, 0.72, 0.42)) : lin(vec3(0.66, 0.7, 0.6));
  float lich = lz * 0.55;
  vec3 mortar = lin(vec3(0.6, 0.58, 0.54)) * (0.92 + 0.12 * n[2]);
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, lin(vec3(0.88, 0.87, 0.84)), feld * 0.3); cov *= 1.0 - feld * 0.3;
  own = mix(own, lin(vec3(0.2, 0.2, 0.21)), mica * 0.4); cov *= 1.0 - mica * 0.4;
  own = mix(own, lc, lich); cov *= 1.0 - lich;
  own = mix(own, mortar, inJ); cov *= 1.0 - inJ;
  s.alb = own; s.a = cov * body;
  s.h = min(ev.x, eu.x) + 0.0015 * dome + 0.0004 * n[1] + 0.0002 * n[2] + 0.0002 * feld;
  s.rough = mix(0.82 + 0.05 * n[2] - 0.04 * feld + 0.05 * lich, 0.94, inJ);
  s.cav = mix(1.0, 0.55, inJ);`,
};

export const SURFACES = [
  { slot: 49, name: 'granite', mat: granite },
  { slot: 50, name: 'turf', onWall: 49, mat: turf },
  { slot: 51, name: 'ashlar', mat: ashlar },
];
