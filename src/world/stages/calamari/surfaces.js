// Calamari County — stage surface materials (texlib layers `calamari:<name>`) on this stage's reserved PATTERN slots 55–57
// (stages/surfaces.js STAGE_SLOTS). Contract: see src/world/stages/cargo/surfaces.js (mat = a texlib material: prep
// declares up to 4 fbm + 2 worley requests, surf writes s.alb / s.a / s.h / s.rough / s.metal / s.cav, heights in m).
// All three are `mask` layers: albedo.a = where the block colour applies (the tinted part), albedo.rgb = the layer's
// own colours added on top (premultiplied) — so layout.js picks each block's tone and team ink stays the loudest thing.
//
//   snow     trodden, packed winter snow (streets, the trackbed between the rails, the quays): soft wind-blown swells,
//            packed paths (greyer, smoother, a little shinier), boot prints, ice-crystal sparkle — tinted a cool
//            grey-blue by the block colour (never pure white, so ink reads strongly on it)
//   setts    granite setts in courses with snow packed into the joints and drifted in patches (the square, lanes,
//            terraces; on walls it reads as coursed stone)
//   timber   dark, weathered platform boards (the platforms, the footbridge decks, the jetty): silvered grain, knots,
//            nail lines on the joists, snow caught in the gaps
import { PATTERN } from '../../mapkit.js';

// (slots 55–57 belong to this stage)
export const SURF = { snow: 55, setts: 56, timber: 57 };

const GRID = 1, HEX = 2;

export const SURFACES = [
  {
    slot: 55, name: 'snow', onWall: 56,
    mat: {
      detail: 0.35, scale: 4.0, tint: true, mask: true, alpha: false, mode: HEX, sym: 7, hr: [-0.02, 0.012], ao: 0.35,
      prep: `f[0] = FB(uv, ivec2(3), 4, 0.5, 5501u); f[1] = FB(uv, ivec2(9), 3, 0.5, 5503u); f[2] = FB(uv, ivec2(40), 2, 0.5, 5507u);
  f[3] = FB(uv, ivec2(4), 3, 0.55, 5509u); w[0] = WO(uv, ivec2(18), 0.95, 5511u); w[1] = WO(uv, ivec2(520), 1.0, 5513u);`,
      surf: /* glsl */`
  // soft swells, packed paths (trod: greyer, smoother), oval boot prints in the packed snow, ice sparkle
  float big = n[0], mid = n[1], fine = n[2], trod = n[3];
  float pak = smoothstep(0.0, 0.5, trod);
  vec4 fp = c[0];
  float sel = step(0.55, fract(fp.z * 7.31 + fp.w * 3.1)) * smoothstep(0.1, 0.6, trod);
  // the print: an oval (stretched along a per-cell direction) with a heel gap
  float ang = fract(fp.z * 13.7) * 6.2832;
  float oval = smoothstep(0.34, 0.22, fp.x * (1.0 + 0.45 * sin(ang + fp.y * 2.0)));
  float dimple = sel * oval;
  vec4 g = c[1];
  float spk = step(0.955, g.z) * (1.0 - smoothstep(0.08, 0.3, g.x));
  float tone = 0.8 * (1.0 + 0.04 * big + 0.025 * mid + 0.012 * fine) * (1.0 - 0.07 * pak) * (1.0 - 0.12 * dimple);
  vec3 slush = vec3(0.10, 0.10, 0.11);
  s.alb = slush * dimple * 0.25 + vec3(0.06, 0.07, 0.08) * spk;
  s.a = tone * (1.0 - 0.2 * dimple);
  s.h = 0.006 * big + 0.0022 * mid + 0.0006 * fine - 0.012 * dimple - 0.002 * pak;
  s.rough = mix(0.72, 0.5, pak) - 0.35 * spk;
  s.cav = 1.0 - 0.3 * dimple;`,
    },
  },
  {
    slot: 56, name: 'setts', onWall: 56,
    mat: {
      detail: 0.6, scale: 2.0, tint: true, mask: true, alpha: false, mode: GRID, sym: 1, hr: [-0.018, 0.008], ao: 0.55,
      prep: `f[0] = FB(uv, ivec2(5), 4, 0.5, 5601u); f[1] = FB(uv, ivec2(12), 3, 0.5, 5603u); f[2] = FB(uv, ivec2(48), 2, 0.5, 5607u);
  f[3] = FB(uv, ivec2(3), 4, 0.55, 5609u); w[0] = WO(uv, ivec2(260), 1.0, 5611u);`,
      surf: /* glsl */`
  // granite setts in 140 mm courses (each course its own sett length and phase), joints packed with snow, drifted
  // patches of snow over the stones where the noise is high, domed tops, crystal speckle, per-sett tone
  const float RH = 0.14;
  int row = int(floor(P.y / RH));
  int rw = int(mod(float(row), 14.0));
  float ly = P.y - float(row) * RH;
  float nr = 8.0 + floor(hf(ivec2(rw, 0), 41u) * 3.999);
  float SL = 2.0 / nr;
  float xs = P.x - hf(ivec2(rw, 1), 43u) * SL;
  float ci = floor(xs / SL);
  float lx = xs - ci * SL;
  ivec2 sid = ivec2(int(mod(ci, nr)), rw);
  vec2 jit = (hf2(sid, 47u) - 0.5) * vec2(0.012, 0.006);
  float jw = 0.006 + 0.003 * hf(sid, 53u);
  vec2 lp = vec2(lx - SL * 0.5, ly - RH * 0.5) - jit;
  vec2 hs = vec2(SL * 0.5 - jw - 0.002, RH * 0.5 - jw - 0.001);
  float e = jw - sdRB(lp, hs, 0.022);
  vec2 pr = edgeProf(e, jw, 0.018, 0.005, 0.012);
  float inJ = pr.y;
  float dome = max(0.0, 1.0 - pow(lp.x / hs.x, 2.0)) * max(0.0, 1.0 - pow(lp.y / hs.y, 2.0));
  float h1 = hf(sid, 61u), h2 = hf(sid, 67u);
  float mott = n[0], cloud = n[1], fine = n[2], drift = n[3];
  vec4 gr = c[0];
  float crystal = smoothstep(0.05, 0.25, gr.y - gr.x);
  float spk = step(0.86, gr.z) * crystal;
  float tone = 0.8 * (0.82 + 0.32 * h1) * (1.0 + 0.05 * mott + 0.03 * fine) * (1.0 + 0.08 * spk);
  vec3 hue = h2 < 0.2 ? lin(vec3(0.1, 0.07, 0.06)) : (h2 > 0.82 ? lin(vec3(0.04, 0.06, 0.08)) : vec3(0.0));
  // snow: in every joint (a little proud of the joint floor), and drifted over the stones in patches (edges softened
  // by the fine noise, thicker in the joints)
  float sPatch = smoothstep(0.18, 0.42, drift + 0.12 * fine + 0.25 * inJ);
  float snowJ = inJ;
  float snowC = max(snowJ * 0.95, sPatch);
  vec3 snowCol = lin(vec3(0.86, 0.9, 0.95)) * (0.92 + 0.08 * cloud);
  s.alb = mix(hue * (1.0 - snowC), snowCol, snowC);
  s.a = tone * (1.0 - snowC);
  s.h = mix(pr.x + 0.0012 * dome, -0.004, snowJ) + sPatch * 0.004 + 0.0002 * mott;
  s.rough = mix(mix(0.66 + 0.1 * h1 - 0.12 * dome * smoothstep(-0.2, 0.5, cloud), 0.9, inJ * 0.5), 0.62, snowC);
  s.cav = mix(1.0, 0.75, inJ) * (1.0 - 0.1 * (1.0 - snowC) * (1.0 - dome));`,
    },
  },
  {
    slot: 57, name: 'timber', onWall: PATTERN.concrete,
    mat: {
      detail: 0.4, scale: 2.0, tint: true, mask: true, alpha: false, mode: GRID, sym: 1, hr: [-0.014, 0.002], ao: 0.45,
      prep: `int row = int(floor(P.y / 0.2)); int rw = int(mod(float(row), 10.0));
  float rh = hf(ivec2(rw, 0), 5701u), rh2 = hf(ivec2(rw, 1), 5703u);
  uint sd = uint(rw) * 7919u + 5711u;
  float ly = P.y - float(row) * 0.2;
  f[0] = FNP(vec2(P.x * 1.4, ly * 22.0) + rh * 40.0, 4, sd); f[1] = FNP(vec2(P.x * 0.45, ly * 5.0) + rh2 * 30.0, 3, sd + 17u);
  f[2] = FB(uv, ivec2(4), 3, 0.55, 5719u); w[0] = WO(uv, ivec2(14), 0.8, 5723u);`,
      surf: /* glsl */`
  // 200 mm platform boards along u, 8 mm gaps (snow caught in them), butt joints at staggered joists, silvered grain,
  // knots, nail rows over the joists, per-board tone; snow lying along the gaps + in patches (n[2])
  const float PW = 0.2;
  int row = int(floor(P.y / PW));
  int rw = int(mod(float(row), 10.0));
  float ly = P.y - float(row) * PW;
  float off = 0.5 * hf(ivec2(rw, 3), 5731u) * 2.0;
  float xp = mod(P.x - off, 2.0);
  float eSide = min(ly, PW - ly), eEnd = min(xp, 2.0 - xp);
  vec2 ps = edgeProf(eSide, 0.004, 0.006, 0.0022, 0.012);
  vec2 pe = edgeProf(eEnd, 0.0015, 0.004, 0.0014, 0.01);
  float gap = max(ps.y, pe.y);
  float h = min(ps.x, pe.x);
  float rh = hf(ivec2(rw, 0), 5701u), rh3 = hf(ivec2(rw, 2), 5705u);
  float streak = n[0], warp = n[1], drift = n[2];
  float ring = 0.5 + 0.5 * cos((ly * 70.0 + warp * 3.5 + rh * 9.0) * 3.14159);
  float lines = smoothstep(0.7, 1.0, ring);
  vec4 kn = c[0];
  float knot = step(0.9, kn.z) * (1.0 - smoothstep(0.05, 0.14, kn.x));
  float nail = (1.0 - smoothstep(0.004, 0.009, length(vec2(mod(P.x + 0.3, 0.6) - 0.3, ly - PW * 0.5 + (fract(P.x * 0.83) > 0.5 ? 0.05 : -0.05))))) * (1.0 - gap);
  float silver = smoothstep(-0.3, 0.6, streak) * 0.5 + 0.25 * rh3;
  float tone = 0.8 * (0.86 + 0.24 * rh) * (1.0 - 0.1 * lines) * (1.0 + 0.1 * silver) * (1.0 - 0.35 * knot);
  float snowP = smoothstep(0.25, 0.5, drift + 0.3 * gap);
  float snowC = max(gap * 0.9, snowP * (0.6 + 0.4 * smoothstep(0.3, 0.7, drift)));
  vec3 snowCol = lin(vec3(0.86, 0.9, 0.95));
  s.alb = mix(vec3(0.03, 0.03, 0.035) * nail + vec3(0.02) * silver * 0.3, snowCol, snowC);
  s.a = tone * (1.0 - snowC) * (1.0 - 0.7 * nail);
  s.h = mix(h + 0.0004 * lines - 0.001 * knot, -0.003, gap) + snowP * 0.003;
  s.rough = mix(0.78 + 0.1 * silver - 0.05 * lines, 0.6, snowC);
  s.cav = (1.0 - 0.3 * gap * (1.0 - snowC)) * (1.0 - 0.3 * knot);`,
    },
  },
];
