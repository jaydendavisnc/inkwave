// INKWAVE texture library — procedural, GPU-generated, tileable PBR surface layers.
//
//   import { createTextureLibrary, TEXLIB_GLSL, TEXLIB_MODE } from './texlib.js';
//   const lib = await createTextureLibrary(renderer, { size: 512 });   // 256 for low quality
//   lib.albedo   DataArrayTexture (WebGLArrayRenderTarget texture) RGBA8 sRGB — rgb albedo, a = alpha mask (1 = solid)
//   lib.normal   same layout, linear — tangent-space normal, +x = texture u, +y = texture v
//   lib.orm      same layout, linear — r cavity/AO, g roughness, b metalness, a height (0 = deepest, 1 = top)
//                (all three: RepeatWrapping, full mip chain, LinearMipmapLinear, anisotropy = renderer max ≤ 16)
//   lib.layers   { concrete: 0, ..., glasstile: 11, planks: 12, ..., render: 18, treads: 19, ..., gangdeck: 22,
//                  detail: 23, gel: 24 }
//                name → layer index (surfaces first; always look layers up by name)
//                ('detail' is not a surface: a neutral 0.5 m micro-surface used by texlibDetail();
//                 'gel' is the wet-ink micro-surface: soft swells + settling ripples, normal only, 1 m repeat)
//   lib.meta     { concrete: { scale, tint, mask, stair, alpha, mode, sym, detail, depth }, ... }
//                  scale = metres per texture repeat · tint = albedo is a neutral detail layer (linear mean
//                  luminance ≈ 0.8) meant to be MULTIPLIED by a per-block colour; tint:false = own colours
//                  mask = albedo.a is a paint mask (1 = tinted, 0 = the layer's own colour: rust, bare timber…),
//                  blend as mix(albedo, tint * albedo * 1.25, a) (marina set: planks, hullpaint, nonslip, gelcoat,
//                  yard, weatherboard, render)
//                  stair = [period along the slope (m), steps per repeat, relief kept under ink, edge kind] for
//                  ramp/stair layers (treads, stonestep, rampboard, gangdeck): v runs downhill, sample phase-locked
//                  alpha = layer uses the alpha mask · mode = recommended anti-tiling mode for texlibSample
//                  (TEXLIB_MODE) · sym = allowed grid transforms (bitmask 1 mirror-u, 2 mirror-v, 4 transpose)
//                  detail = recommended texlibDetail amount · depth = relief depth (m) that orm.a spans
//   lib.names    layer names in index order · lib.size · lib.stats { ms, compileMs, size }
//   lib.dispose()
//
// How it is made: one uber fragment shader per material group (the original layers / the marina set / stairs, compiled in
// parallel; each group's layers sit behind a uniform switch) renders each layer straight into
// one WebGLArrayRenderTarget with three colour attachments (MRT: albedo sRGB8_A8, normal RGBA8, orm RGBA8). Every
// texel evaluates the surface at 2×2 sub-samples (box-filtered albedo/ORM = pre-filtered base level) and derives
// its normal from the sub-sample height gradient (heights are in metres, so bevels/grout have physical slopes).
// Patterns are periodic, band-limited (edge AA widths ≈ half a texel) and use integer PCG hashing, so output is
// deterministic on any GPU. The mip chain is generated once at the end. Materials declare their noise up front
// (prep → up to 4 fbm + 2 worley requests) and one shared loop evaluates them; loops stay rolled (uOne) and there
// is no integer modulo — all to keep the one-time driver compile short, which dominates a cold start.
// Start it early in loading: the compile half is async (KHR_parallel_shader_compile via compileAsync).
//
// GLSL helpers (TEXLIB_GLSL, WebGL2 / three ShaderChunk-compatible, all names prefixed texlib):
//
//   #define TEXLIB_PLAIN 0   plain repeat
//   #define TEXLIB_GRID  1   per-repeat random dihedral transform (mirror-u / mirror-v / transpose, masked by sym).
//                            Every grid layer has joints/seams on its repeat borders, so the hard switch is
//                            invisible; textureGrad with the continuous uv keeps mips/anisotropy seam-free.
//   #define TEXLIB_HEX   2   hex-tile stochastic blend (Mikkelsen 2022): 3 taps, random rotation + offset per hex,
//                            height-aware contrast blend — for isotropic noise layers (asphalt, rubber).
//
//   struct TexlibSample { vec4 albedo; vec3 normal; vec4 orm; };
//     albedo = linear rgb + alpha mask · normal = normalised tangent-space normal already rotated back into the
//     caller's uv frame (+x = +u, +y = +v) · orm = cavity, roughness (Toksvig-widened where mips average bumps
//     away → no specular sparkle at distance), metalness, height
//
//   TexlibSample texlibSample(sampler2DArray tAlbedo, sampler2DArray tNormal, sampler2DArray tOrm,
//                             vec2 uv, float layer, int mode, int sym)
//       uv = surface position in metres / meta.scale (1.0 = one repeat); layer = lib.layers[name];
//       mode/sym = meta.mode/meta.sym (pass TEXLIB_PLAIN to disable anti-tiling). Takes dFdx/dFdy of uv, so call
//       it in uniform control flow.
//   mat3 texlibTangentFrame(vec3 eyePos, vec3 surfNormal, vec2 uv)
//       derivative-based TBN (columns T = ∂p/∂u, B = ∂p/∂v, N) in the space of eyePos/surfNormal, e.g. view space:
//       texlibTangentFrame(-vViewPosition, normal, uv). Handles mirrored uvs. For double-sided back faces
//       multiply columns 0 and 1 by three's faceDirection (as three does for its own normal maps).
//   vec3 texlibPerturbNormal(vec3 nTS, mat3 tbn, float strength)
//   vec3 texlibPerturbNormal(vec3 nTS, vec3 T, vec3 B, vec3 N, float strength)
//       tangent-space normal → normalised normal in the TBN's space; strength scales the tilt (1 = authored).
//   void texlibDetail(inout TexlibSample s, sampler2DArray tAlbedo, sampler2DArray tNormal, sampler2DArray tOrm,
//                     vec2 pMetres, float detailLayer, float amount)
//       optional close-up crispness: blends the extra 'detail' layer (lib.layers.detail, 0.5 m micro-surface) at two
//       rotated scales. pMetres = surface coords in metres (uv * meta.scale), amount = meta.detail. Costs 6 taps;
//       fades to neutral by itself with distance (mips), so it never aliases. Call right after texlibSample.
//   float texlibSpecularAA(vec3 normal, float roughness)
//       screen-space specular anti-aliasing on the FINAL perturbed normal (any space): returns a widened roughness
//       where the normal varies faster than the pixel grid. Apply after the normal is known, e.g. in three:
//       after <lights_physical_fragment>: material.roughness = texlibSpecularAA(normal, material.roughness);
//   float texlibMacro(vec2 pMetres)
//       smooth, band-limited brightness multiplier (≈0.94–1.06, mean ≈1) — multiply into albedo to break up
//       large-scale repetition, e.g. texlibMacro(worldPos.xz + worldPos.y * 0.7).
//   float texlibCoverage(float alpha, vec2 uv, float texSize)
//       grate alpha for an alpha test (< 0.5 → discard) or alphaToCoverage: crisp anti-aliased holes up close;
//       as the openings drop below pixel size the bars thicken (mip-aware) until the grate reads solid, so it
//       never breaks into dotted, shimmering holes or vanishes at distance. texSize = lib.size.

import * as THREE from 'three';

export const TEXLIB_MODE = { plain: 0, grid: 1, hex: 2 };
const { plain: PLAIN, grid: GRID, hex: HEX } = TEXLIB_MODE;

// ---------------------------------------------------------------------------------------------------------------
// Generator GLSL (GLSL ES 3.00, RawShaderMaterial)
// ---------------------------------------------------------------------------------------------------------------

const GEN_VS = /* glsl */`
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const GEN_COMMON = /* glsl */`
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform float uScale;
uniform int uMat;
uniform int uOne;   // = 1: non-constant trip counts, so drivers keep loops rolled (short cold compile)
uniform vec2 uHRange;  // height range (m) mapped to orm.a 0..1
uniform float uAO;     // depth-occlusion strength
layout(location = 0) out vec4 oOut;   // TL_OUT 0: albedo (sRGB target, hardware-encoded) · 1: normal · 2: orm
#define PI 3.14159265
#define TAU 6.28318531
struct S { vec3 alb; float a; float h; float cav; float rough; float metal; };
struct Req { vec2 x; ivec2 per; int oct; float gain; uint seed; };   // fbm request
struct WReq { vec2 uv; ivec2 n; float jit; uint seed; };            // worley request
float PX; // metres per sub-sample step (half a texel): the AA width unit

uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
uint hu(ivec2 p, uint s) { return pcg((uint(p.x) * 0x8da6b343u) ^ (uint(p.y) * 0xd8163841u) ^ (s * 0xcb1ab31fu)); }
float hf(ivec2 p, uint s) { return float(hu(p, s) >> 8u) * (1.0 / 16777216.0); }
vec2 hf2(ivec2 p, uint s) { uint a = hu(p, s); return vec2(float(a >> 8u), float(pcg(a) >> 8u)) * (1.0 / 16777216.0); }
// float wrap: integer % by a non-constant divisor is emulated in software and bloats driver compile time
ivec2 wrp(ivec2 i, ivec2 n) { vec2 fi = vec2(i), fn = vec2(n); return ivec2(fi - fn * floor((fi + 0.5) / fn)); }
vec3 lin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec2 gr(uint h) { return vec2(float(h & 0xffffu), float(h >> 16u)) * (1.0 / 32767.5) - 1.0; }

// periodic gradient noise ~[-1,1]; x in lattice units, n = period in lattice cells
float gn(vec2 x, ivec2 n, uint s) {
  ivec2 i = ivec2(floor(x)); vec2 f = x - vec2(i);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float v0 = dot(gr(hu(wrp(i, n), s)), f);
  float v1 = dot(gr(hu(wrp(i + ivec2(1, 0), n), s)), f - vec2(1.0, 0.0));
  float v2 = dot(gr(hu(wrp(i + ivec2(0, 1), n), s)), f - vec2(0.0, 1.0));
  float v3 = dot(gr(hu(wrp(i + ivec2(1, 1), n), s)), f - vec2(1.0, 1.0));
  return 1.6 * mix(mix(v0, v1, u.x), mix(v2, v3, u.x), u.y);
}
float fbmR(Req r) {
  float sum = 0.0, amp = 1.0, nrm = 0.0; vec2 x = r.x; ivec2 per = r.per;
  for (int o = 0; o < r.oct * uOne; o++) { sum += amp * gn(x, per, r.seed + uint(o) * 1013u); nrm += amp; amp *= r.gain; x *= 2.0; per *= 2; }
  return nrm > 0.0 ? sum / nrm : 0.0;
}
// periodic worley on the tile: n cells per repeat; returns (F1, F2, id of nearest, id of 2nd) in cell units
vec4 worR(WReq q) {
  if (q.n.x == 0) return vec4(0.0);
  vec2 x = q.uv * vec2(q.n); ivec2 i = ivec2(floor(x)); vec2 f = x - vec2(i);
  float F1 = 9.0, F2 = 9.0, id = 0.0, id2 = 0.0;
  for (int y = -uOne; y <= uOne; y++) for (int xx = -uOne; xx <= uOne; xx++) {
    ivec2 c = ivec2(xx, y); ivec2 w = wrp(i + c, q.n);
    vec2 o = vec2(c) + 0.5 + (hf2(w, q.seed) - 0.5) * q.jit;
    float d = length(o - f);
    if (d < F1) { F2 = F1; F1 = d; id2 = id; id = hf(w, q.seed + 7u); } else if (d < F2) { F2 = d; }
  }
  return vec4(F1, F2, id, id2);
}
// request builders: FB = periodic fbm over the repeat (f0 cells), FNP = aperiodic fbm on explicit coords
Req FB(vec2 uv, ivec2 f0, int oct, float gain, uint s) { return Req(uv * vec2(f0), f0, oct, gain, s); }
Req FNP(vec2 x, int oct, uint s) { return Req(x, ivec2(4096), oct, 0.5, s); }
WReq WO(vec2 uv, ivec2 n, float jit, uint s) { return WReq(uv, n, jit, s); }

float aa(float edge, float x) { return smoothstep(edge - PX * 0.75, edge + PX * 0.75, x); }
float jd(float x, float p) { return abs(x - p * floor(x / p + 0.5)); }
float sdRB(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
// joint + rounded arris profile. e = distance from the joint centre line (m), jw = half joint width,
// r = rounding width, de = drop at the arris, dj = joint depth. returns (height, jointMask)
vec2 edgeProf(float e, float jw, float r, float de, float dj) {
  float t = clamp(1.0 - (e - jw) / r, 0.0, 1.0);
  float hE = -de * (1.0 - sqrt(max(1.0 - t * t, 0.0)));
  float inJ = 1.0 - aa(jw, e);
  return vec2(mix(hE, -dj, inJ), inJ);
}
`;

const GEN_MAIN = /* glsl */`
// Surface evaluation at 2x2 sub-samples per texel (rotated into one rolled loop, so the whole material pipeline
// exists once in the binary): box-filtered albedo/ORM, normal from the sub-sample height gradient.
void main() {
  PX = uScale / (2.0 * uRes.x);   // AA width unit: half a texel
  vec3 alb = vec3(0.0); float alpha = 0.0, cav = 0.0, rough = 0.0, metal = 0.0; float hs[4];
  for (int k = 0; k < 4 * uOne; k++) {
    vec2 uv = (gl_FragCoord.xy + (vec2(k & 1, k >> 1) - 0.5) * 0.5) / uRes;
    vec2 P = uv * uScale;
    Req f[4]; WReq w[2];
    for (int q = 0; q < 4; q++) f[q] = Req(vec2(0.0), ivec2(1), 0, 0.5, 0u);
    w[0] = WReq(vec2(0.0), ivec2(0), 0.0, 0u); w[1] = w[0];
    PREP_SWITCH
    float n[4]; vec4 c[2];
    for (int q = 0; q < 4 * uOne; q++) n[q] = fbmR(f[q]);
    for (int q = 0; q < 2 * uOne; q++) c[q] = worR(w[q]);
    S s; s.alb = vec3(0.8); s.a = 1.0; s.h = 0.0; s.cav = 1.0; s.rough = 0.8; s.metal = 0.0;
    SURF_SWITCH
    alb += max(s.alb, vec3(0.0)); alpha += clamp(s.a, 0.0, 1.0);
    cav += clamp(s.cav, 0.0, 1.0) * (1.0 - uAO * clamp(-s.h / -uHRange.x, 0.0, 1.0));
    rough += clamp(s.rough, 0.02, 1.0); metal += clamp(s.metal, 0.0, 1.0);
    hs[k] = s.h;
  }
  float dx = (hs[1] - hs[0] + hs[3] - hs[2]) / (2.0 * PX);
  float dy = (hs[2] - hs[0] + hs[3] - hs[1]) / (2.0 * PX);
  float h = (hs[0] + hs[1] + hs[2] + hs[3]) * 0.25;
#if TL_OUT == 0
  oOut = vec4(alb * 0.25, alpha * 0.25);
#elif TL_OUT == 1
  oOut = vec4(normalize(vec3(-dx, -dy, 1.0)) * 0.5 + 0.5, 1.0);
#else
  oOut = vec4(cav * 0.25, rough * 0.25, metal * 0.25, clamp((h - uHRange.x) / (uHRange.y - uHRange.x), 0.0, 1.0));
#endif
}
`;

// ---------------------------------------------------------------------------------------------------------------
// Materials. prep() declares noise (f[0..3] fbm, w[0..1] worley); surf() gets the results as n[] / c[].
// Heights in metres (0 = nominal top surface). Colours linear. hr = height range mapped to orm.a.
// ---------------------------------------------------------------------------------------------------------------

const PREP_SIG = 'vec2 uv, vec2 P, inout Req f[4], inout WReq w[2]';
const SURF_SIG = 'vec2 uv, vec2 P, float n[4], vec4 c[2], inout S s';

const MATERIALS = [
  {
    name: 'concrete', detail: 1.0, scale: 4.0, tint: true, alpha: false, mode: GRID, sym: 7, hr: [-0.004, 0.0008], ao: 0.5,
    prep: `f[0] = FB(uv, ivec2(3), 5, 0.55, 11u); f[1] = FB(uv, ivec2(8), 3, 0.5, 19u); f[2] = FB(uv, ivec2(24), 3, 0.5, 23u);
  w[0] = WO(uv, ivec2(64), 0.8, 37u);`,
    surf: /* glsl */`
  // 2 x 2 m cast panels: hairline seams, per-pour tone, one form-tie hole per panel, sparse bug-hole pores
  ivec2 pan = wrp(ivec2(floor(P / 2.0)), ivec2(2));
  float dSeam = min(jd(P.x, 2.0), jd(P.y, 2.0));
  float seam = 1.0 - aa(0.003, dSeam);
  float seamSoft = 1.0 - smoothstep(0.0, 0.045, dSeam);
  float mott = n[0], cloud = n[1], fine = n[2];
  float tone = 1.0 + 0.07 * (hf(pan, 5u) - 0.5);
  vec3 col = vec3(0.805) * tone * (1.0 + 0.09 * mott + 0.05 * cloud + 0.025 * fine);
  float rh = length(mod(P, 2.0) - 1.0);
  float hole = 1.0 - aa(0.011, rh);
  float ring = (1.0 - aa(0.02, rh)) * (1.0 - hole);
  vec4 wc = c[0];
  float pr = wc.x * (4.0 / 64.0);
  float pore = step(0.975, wc.z) * (1.0 - smoothstep(0.003 + 0.004 * fract(wc.z * 13.7), 0.0045 + 0.004 * fract(wc.z * 13.7) + PX, pr));
  col *= (1.0 - 0.07 * pore) * (1.0 - 0.10 * hole) * (1.0 - 0.12 * seam) * (1.0 - 0.035 * seamSoft) * (1.0 + 0.02 * ring);
  s.alb = col;
  s.h = 0.00035 * mott + 0.0001 * fine - 0.0015 * pore - 0.0032 * hole - 0.0008 * seam + 0.0001 * ring;
  s.rough = 0.78 + 0.07 * mott - 0.04 * cloud + 0.04 * (hf(pan, 9u) - 0.5);
  s.cav = 1.0 - 0.3 * hole - 0.2 * pore - 0.25 * seam;`,
  },
  {
    name: 'pavers', detail: 0.9, scale: 4.0, tint: true, alpha: false, mode: GRID, sym: 7, hr: [-0.008, 0.001], ao: 0.55,
    prep: `f[0] = FB(uv, ivec2(6), 4, 0.5, 17u); f[1] = FB(uv, ivec2(3), 3, 0.5, 29u); w[0] = WO(uv, ivec2(240), 1.0, 31u);`,
    surf: /* glsl */`
  // 2 x 2 m plaza slabs, 15 mm joints, rounded arrises, per-slab tone + micro tilt, fine aggregate speckle
  ivec2 cell = ivec2(floor(P / 2.0));
  ivec2 cw = wrp(cell, ivec2(2));
  vec2 lp = P - (vec2(cell) * 2.0 + 1.0);
  float e = -sdRB(lp, vec2(1.0), 0.016);
  vec2 pr = edgeProf(e, 0.0075, 0.016, 0.0045, 0.0075);
  float inJ = pr.y;
  float hid = hf(cw, 3u), hid2 = hf(cw, 11u);
  vec2 tilt = hf2(cw, 9u) - 0.5;
  float mott = n[0], cloud = n[1];
  float grain = smoothstep(0.05, 0.2, c[0].y - c[0].x) * (c[0].z - 0.5);
  vec3 col = vec3(0.84) * (1.0 + 0.2 * (hid - 0.5)) * (1.0 + 0.07 * mott + 0.05 * cloud + 0.1 * grain);
  float arris = clamp(1.0 - (e - 0.0075) / 0.016, 0.0, 1.0) * (1.0 - inJ);
  float grime = (1.0 - smoothstep(0.0, 0.06, e - 0.0075)) * (1.0 - inJ);   // soft dirt band hugging the joints
  col *= (1.0 - 0.06 * arris) * (1.0 - 0.09 * grime * (0.7 + 0.3 * cloud));
  col = mix(col, vec3(0.42) * (1.0 + 0.1 * mott), inJ);
  s.alb = col;
  s.h = pr.x + dot(tilt, lp) * 0.0012 * (1.0 - inJ) + 0.00015 * mott + 0.00005 * grain;
  s.rough = mix(0.7 + 0.12 * hid2 + 0.06 * mott + 0.05 * grime, 0.95, inJ);
  s.cav = mix(1.0, 0.5, inJ) * (1.0 - 0.1 * grime);`,
  },
  {
    name: 'tiles', detail: 0.15, scale: 2.0, tint: true, alpha: false, mode: GRID, sym: 7, hr: [-0.003, 0.0006], ao: 0.5,
    prep: `ivec2 cw = wrp(ivec2(floor(P / 0.5)), ivec2(4));
  f[0] = FB(uv, ivec2(12), 1, 0.5, 41u + uint(cw.x * 4 + cw.y) * 131u); f[1] = FB(uv, ivec2(8), 3, 0.5, 13u); f[2] = FB(uv, ivec2(96), 2, 0.5, 7u);`,
    surf: /* glsl */`
  // 0.5 m glazed ceramic tiles, 9 mm grout, cushion edges, per-tile tone / gloss / glaze wave
  ivec2 cell = ivec2(floor(P / 0.5));
  ivec2 cw = wrp(cell, ivec2(4));
  vec2 lp = P - (vec2(cell) * 0.5 + 0.25);
  float e = -sdRB(lp, vec2(0.25), 0.007);
  vec2 pr = edgeProf(e, 0.0045, 0.006, 0.0014, 0.0026);
  float inG = pr.y;
  float hid = hf(cw, 3u), hid2 = hf(cw, 5u);
  float wave = n[0], mott = n[1];
  float edgeTone = 1.0 - smoothstep(0.0, 0.035, e - 0.0045);
  vec3 col = vec3(0.84) * (1.0 + 0.07 * (hid - 0.5) + 0.015 * mott) * (1.0 - 0.05 * edgeTone);
  vec3 grout = vec3(0.6) * (1.0 + 0.06 * n[2]);
  s.alb = mix(col, grout, inG);
  s.h = pr.x + (0.00022 * wave + 0.00004 * mott) * (1.0 - inG);
  s.rough = mix(0.18 + 0.08 * hid2 + 0.03 * mott, 0.9, inG);
  s.cav = mix(1.0, 0.6, inG);`,
  },
  {
    name: 'asphalt', detail: 0.4, scale: 2.0, tint: true, alpha: false, mode: HEX, sym: 7, hr: [-0.0014, 0.0008], ao: 0.45,
    prep: `f[0] = FB(uv, ivec2(4), 4, 0.5, 13u); f[1] = FB(uv, ivec2(64), 2, 0.5, 7u);
  w[0] = WO(uv, ivec2(150), 1.0, 41u); w[1] = WO(uv, ivec2(360), 1.0, 53u);`,
    surf: /* glsl */`
  // fine aggregate in binder, sparse light stones, very low contrast
  vec4 wc = c[0], w2 = c[1];
  float stone = smoothstep(0.06, 0.24, wc.y - wc.x);
  float light = step(0.9, wc.z);
  float st = mix(0.76 + 0.16 * fract(wc.z * 7.13), 1.05, light);
  float big = n[0];
  float binder = 0.63 + 0.05 * n[1];
  float grit = smoothstep(0.05, 0.25, w2.y - w2.x) * (fract(w2.z * 5.31) - 0.5);
  float worn = smoothstep(-0.2, 0.5, big);                 // traffic-polished patches: lighter, a bit smoother
  s.alb = vec3(mix(binder, st, stone)) * (1.0 + 0.06 * big + 0.06 * grit) * (1.0 + 0.04 * worn);
  s.h = -0.0011 * (1.0 - stone) + 0.0005 * stone * (1.0 - wc.x * wc.x) + 0.00012 * grit + 0.0001 * big;
  s.rough = mix(0.94, 0.8, stone * (1.0 - light * 0.5)) - 0.1 * worn;`,
  },
  {
    name: 'boardwalk', detail: 0.3, scale: 2.0, tint: false, alpha: false, mode: GRID, sym: 1, hr: [-0.015, 0.0012], ao: 0.4,
    prep: `int row = int(floor(P.y / 0.25)); int rw = (row + 8) % 8;
  int kk[8] = int[8](0, 2, 1, 3, 2, 0, 3, 1);
  float xp = mod(P.x - 0.25 - 0.5 * float(kk[rw]), 2.0), ly = P.y - float(row) * 0.25;
  float rh = hf(ivec2(rw, 0), 3u), rh2 = hf(ivec2(rw, 1), 3u);
  uint sd = uint(rw) * 7919u + 101u;
  f[0] = FNP(vec2(xp * 1.3, ly * 17.0) + rh * 40.0, 4, sd); f[1] = FNP(vec2(xp * 0.5, ly * 4.0) + rh2 * 30.0, 3, sd + 17u);`,
    surf: /* glsl */`
  // 0.25 m boardwalk planks along u, 8 mm gaps, butt joints on joists (every 0.5 m), grain, nail heads
  const float PW = 0.25;
  int row = int(floor(P.y / PW));
  int rw = (row + 8) % 8;
  float ly = P.y - float(row) * PW;
  int kk[8] = int[8](0, 2, 1, 3, 2, 0, 3, 1);
  float jx = 0.25 + 0.5 * float(kk[rw]);
  float xp = mod(P.x - jx, 2.0);
  float eSide = min(ly, PW - ly);
  float eEnd = min(xp, 2.0 - xp);
  vec2 ps = edgeProf(eSide, 0.004, 0.006, 0.0022, 0.015);
  vec2 pe = edgeProf(eEnd, 0.0015, 0.004, 0.0014, 0.012);
  float gap = max(ps.y, pe.y);
  float h = min(ps.x, pe.x);
  float rh = hf(ivec2(rw, 0), 3u), rh2 = hf(ivec2(rw, 1), 3u), rh3 = hf(ivec2(rw, 2), 3u);
  float streak = n[0], warp = n[1];
  float ring = 0.5 + 0.5 * cos((ly * 64.0 + warp * 3.5 + rh2 * 9.0) * PI);
  float lines = smoothstep(0.72, 1.0, ring);
  vec3 wa = lin(vec3(0.79, 0.64, 0.47)), wb = lin(vec3(0.74, 0.57, 0.42)), wc = lin(vec3(0.82, 0.69, 0.51));
  vec3 base = mix(wa, rh3 > 0.5 ? wb : wc, abs(rh3 - 0.5) * 1.4) * (0.94 + 0.12 * rh);
  vec3 col = base * (1.0 + 0.07 * streak) * (1.0 - 0.07 * lines);
  col *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 0.035, eEnd - 0.0015));
  col *= 1.0 - 0.05 * (1.0 - smoothstep(0.0, 0.02, eSide - 0.004));
  float nx = eEnd < 0.1 ? abs(eEnd - 0.03) : jd(P.x - 0.25, 0.5);
  float ny = min(abs(ly - 0.045), abs(ly - (PW - 0.045)));
  float nd = length(vec2(nx, ny));
  float nail = 1.0 - aa(0.0042, nd);
  col *= 1.0 - 0.1 * (1.0 - smoothstep(0.004, 0.018, nd));
  col = mix(col, lin(vec3(0.46, 0.45, 0.44)) * (0.85 + 0.3 * smoothstep(0.0042, 0.0, nd)), nail);
  col = mix(col, lin(vec3(0.20, 0.15, 0.11)), gap);
  h += (0.0007 * (1.0 - pow((ly - PW * 0.5) / (PW * 0.5), 2.0)) + 0.00011 * streak - 0.00006 * lines) * (1.0 - gap);
  s.alb = col;
  s.h = h - nail * 0.0003;
  s.rough = mix(mix(0.64 + 0.05 * streak + 0.05 * lines, 0.42, nail), 0.92, gap);
  s.metal = nail * 0.75;
  s.cav = mix(1.0, 0.4, gap);`,
  },
  {
    name: 'metalpanel', detail: 0.2, scale: 2.0, tint: true, alpha: false, mode: GRID, sym: 3, hr: [-0.006, 0.003], ao: 0.45,
    prep: `f[0] = FB(uv, ivec2(20, 2), 4, 0.55, 3u); f[1] = FB(uv, ivec2(4), 4, 0.5, 5u); f[2] = FB(uv, ivec2(40), 4, 0.55, 7u);`,
    surf: /* glsl */`
  // painted steel wall panels 1 x 2 m: V-seams, folded edges, two pressed ribs, rivet rows, light edge wear
  ivec2 cell = ivec2(floor(P / vec2(1.0, 2.0)));
  vec2 lp = P - (vec2(cell) * vec2(1.0, 2.0) + vec2(0.5, 1.0));
  float e = -sdRB(lp, vec2(0.5, 1.0), 0.015);
  vec2 pr = edgeProf(e, 0.0035, 0.01, 0.0032, 0.006);
  float inS = pr.y;
  float rib = exp(-pow((abs(lp.y) - 0.333) / 0.022, 2.0)) * smoothstep(0.03, 0.09, e);
  float ry = -0.9 + 0.2 * clamp(floor((lp.y + 1.0) / 0.2), 0.0, 9.0);
  float d1 = length(vec2(abs(lp.x) - 0.465, lp.y - ry));
  float rx = -0.4 + 0.2 * clamp(floor((lp.x + 0.5) / 0.2), 0.0, 4.0);
  float d2 = length(vec2(lp.x - rx, abs(lp.y) - 0.965));
  float rd = min(d1, d2);
  float rv = 1.0 - aa(0.0065, rd);
  float dome = sqrt(max(1.0 - pow(rd / 0.0065, 2.0), 0.0));
  float streak = n[0], mott = n[1], wn = n[2] * 0.5 + 0.5;
  float edgeP = 1.0 - smoothstep(0.004, 0.03, e);
  float wear = smoothstep(0.7, 0.78, wn + 0.3 * edgeP * (1.0 - inS)) * (1.0 - inS);
  wear = max(wear, rv * smoothstep(0.55, 0.9, dome) * smoothstep(0.35, 0.6, wn));
  vec3 col = vec3(0.81) * (1.0 + 0.035 * streak + 0.025 * mott) * (1.0 - 0.08 * edgeP);
  col = mix(col, vec3(0.93), wear * 0.7);
  s.alb = mix(col, vec3(0.36), inS);
  s.h = pr.x + 0.0022 * rib + rv * 0.0025 * dome + 0.00008 * mott - wear * 0.00005;
  s.rough = mix(mix(0.36 + 0.04 * streak, 0.42, wear), 0.7, inS);
  s.metal = mix(mix(0.3, 0.45, wear), 0.2, inS);
  s.cav = mix(1.0, 0.55, inS) * (1.0 - 0.25 * rv * (1.0 - dome));`,
  },
  {
    name: 'corrugated', detail: 0.2, scale: 2.4, tint: true, alpha: false, mode: PLAIN, sym: 0, hr: [-0.03, 0.001], ao: 0.3,
    prep: `f[0] = FB(uv, ivec2(3, 4), 3, 0.5, 5u); f[1] = FB(uv, ivec2(16, 2), 4, 0.55, 9u); f[2] = FB(uv, ivec2(5), 4, 0.5, 11u);
  f[3] = FB(uv, ivec2(8, 40), 4, 0.55, 13u);`,
    surf: /* glsl */`
  // container corrugation: vertical ribs (along v), 0.3 m period, trapezoid 30 mm deep, crest-edge paint wear
  float x = mod(P.x + 0.15, 0.3) - 0.15;
  float a = abs(x);
  float t = clamp((a - 0.042) / 0.066, 0.0, 1.0);
  float prof = mix(t, t * t * (3.0 - 2.0 * t), 0.65);
  float dent = n[0], streak = n[1], mott = n[2], wn = n[3] * 0.5 + 0.5;
  float crestEdge = exp(-pow((a - 0.045) / 0.007, 2.0));
  float troughEdge = exp(-pow((a - 0.105) / 0.009, 2.0));
  float wear = crestEdge * smoothstep(0.52, 0.62, wn);
  vec3 col = vec3(0.81) * (1.0 + 0.03 * streak + 0.025 * mott) * (1.0 - 0.07 * smoothstep(0.1, 0.15, a));
  s.alb = mix(col, vec3(0.95), wear * 0.55);
  s.h = -0.03 * prof + 0.0006 * dent - wear * 0.00005;
  s.rough = mix(0.5 + 0.05 * streak, 0.45, wear);
  s.metal = mix(0.25, 0.4, wear);
  s.cav = 1.0 - 0.18 * troughEdge;`,
  },
  {
    name: 'hazard', detail: 0.5, scale: 2.0, tint: false, alpha: false, mode: PLAIN, sym: 0, hr: [-0.0004, 0.0004], ao: 0.3,
    prep: `f[0] = FB(uv, ivec2(5), 5, 0.55, 5u); f[1] = FB(uv, ivec2(40), 3, 0.5, 9u); f[2] = FB(uv, ivec2(4, 80), 3, 0.5, 15u);`,
    surf: /* glsl */`
  // 45° yellow / black safety stripes (~12 cm each), paint worn through to concrete in soft patches
  const float PER = 1.0 / 3.0;
  float q = fract((P.x + P.y) / PER);
  float dY = q < 0.5 ? min(q, 0.5 - q) : -min(q - 0.5, 1.0 - q);
  float dm = dY * PER * 0.70710678;
  float yel = smoothstep(-PX * 0.75, PX * 0.75, dm);
  vec3 Y = lin(vec3(0.96, 0.77, 0.16)), K = lin(vec3(0.14, 0.14, 0.15));
  float n1 = n[0] * 0.5 + 0.5, n2 = n[1] * 0.5 + 0.5, scuff = n[2] * 0.5 + 0.5;
  float edgeW = 1.0 - smoothstep(0.0, 0.012, abs(dm));
  float thin = smoothstep(0.5, 0.75, n1 + 0.15 * (n2 - 0.5));                    // paint worn thin, broad and soft
  float wear = smoothstep(0.72, 0.8, n1 + 0.35 * (n2 - 0.5) + 0.05 * edgeW);  // worn through, rare
  vec3 paint = mix(K, Y, yel) * (1.0 - 0.05 * (n1 - 0.5)) * (1.0 - 0.06 * smoothstep(0.55, 0.8, scuff));
  vec3 under = lin(vec3(0.63, 0.62, 0.6)) * (1.0 + 0.06 * (n2 - 0.5));
  paint = mix(paint, mix(paint, under, 0.3), thin * (0.2 + 0.25 * yel));
  s.alb = mix(paint, under, wear * 0.85);
  s.h = 0.0003 * (1.0 - wear) + 0.00005 * n2;
  s.rough = mix(0.52 + 0.08 * scuff, 0.86, wear);`,
  },
  {
    name: 'grate', detail: 0.3, scale: 1.2, tint: false, alpha: true, mode: GRID, sym: 3, hr: [-0.009, 0.0006], ao: 0.35,
    prep: `f[0] = FB(uv, ivec2(6), 4, 0.5, 3u); f[1] = FB(uv, ivec2(12), 3, 0.5, 9u); w[0] = WO(uv, ivec2(30), 1.0, 21u);`,
    surf: /* glsl */`
  // galvanised bar grating: bearing bars along u (20 mm, serrated), cross bars along v (14 mm, 3 mm lower),
  // 75 mm pitch -> ~5.5-6 cm openings (alpha 0)
  float db = jd(P.y, 0.075);
  float dc = jd(P.x, 0.075);
  float bb = 1.0 - aa(0.01, db);
  float cb = 1.0 - aa(0.007, dc);
  float hb = -0.0026 * pow(clamp(db / 0.01, 0.0, 1.0), 2.0) - 0.0005 * (0.5 + 0.5 * cos(TAU * P.x / 0.0125)) * smoothstep(0.0075, 0.0, db);
  float hc = -0.003 - 0.002 * pow(clamp(dc / 0.007, 0.0, 1.0), 2.0);
  float h = max(mix(-0.009, hb, bb), mix(-0.009, hc, cb));
  float spang = (c[0].z - 0.5) * smoothstep(0.0, 0.08, c[0].y - c[0].x);
  float mott = n[0];
  vec3 steel = vec3(0.53, 0.55, 0.57) * (1.0 + 0.07 * spang + 0.04 * mott);
  float top = bb * (1.0 - smoothstep(0.0, 0.01, db));
  float polish = top * smoothstep(0.45, 0.7, n[1] * 0.5 + 0.75);
  steel = mix(steel, vec3(0.64, 0.65, 0.66), polish * 0.7);
  float junction = cb * (1.0 - bb) * (1.0 - smoothstep(0.01, 0.02, db));
  s.alb = steel * (1.0 - 0.18 * junction);
  s.a = max(bb, cb);
  s.h = h;
  s.rough = mix(0.46 + 0.05 * mott, 0.3, polish);
  s.metal = 0.85;
  s.cav = 1.0 - 0.35 * junction;`,
  },
  {
    name: 'brick', detail: 0.7, scale: 2.0, tint: true, alpha: false, mode: GRID, sym: 1, hr: [-0.007, 0.0008], ao: 0.5,
    prep: `f[0] = FB(uv, ivec2(80), 3, 0.5, 11u); f[1] = FB(uv, ivec2(6), 4, 0.5, 13u); f[2] = FB(uv, ivec2(128), 2, 0.5, 19u);
  w[0] = WO(uv, ivec2(120), 1.0, 17u);`,
    surf: /* glsl */`
  // stylised running-bond brick 250 x 100 mm (incl. 10 mm mortar), recessed joints, soft arrises
  int row = int(floor(P.y / 0.1));
  float ly = P.y - float(row) * 0.1;
  float bx = P.x - ((row % 2 == 1) ? 0.125 : 0.0);
  int col = int(floor(bx / 0.25));
  float lx = bx - float(col) * 0.25;
  ivec2 bid = wrp(ivec2(col, row), ivec2(8, 20));
  vec2 lp = vec2(lx - 0.125, ly - 0.05);
  float e = -sdRB(lp, vec2(0.125, 0.05), 0.007);
  vec2 pr = edgeProf(e, 0.005, 0.007, 0.0035, 0.0065);
  float inM = pr.y;
  float hid = hf(bid, 3u), hid2 = hf(bid, 5u);
  float sand = n[0], mott = n[1];
  float pit = step(0.9, c[0].z) * (1.0 - aa(0.0022, c[0].x * (2.0 / 120.0)));
  float bulge = (1.0 - pow(lp.x / 0.125, 2.0)) * (1.0 - pow(lp.y / 0.05, 2.0));
  vec3 cb = vec3(0.79) * (1.0 + 0.1 * (hid - 0.5)) * (1.0 + 0.025 * sand + 0.02 * mott) * (1.0 - 0.1 * pit);
  cb *= 1.0 - 0.04 * clamp(1.0 - (e - 0.005) / 0.01, 0.0, 1.0) * (1.0 - inM);
  vec3 mort = vec3(0.9) * (1.0 + 0.05 * n[2]);
  s.alb = mix(cb, mort, inM);
  s.h = pr.x + (0.0005 * bulge * hid2 + 0.00012 * sand - 0.0008 * pit) * (1.0 - inM) + inM * 0.0008 * (pow(clamp(e / 0.005, 0.0, 1.0), 2.0) - 1.0);
  s.rough = mix(0.82 + 0.05 * sand, 0.95, inM);
  s.cav = mix(1.0, 0.72, inM);`,
  },
  {
    name: 'rubber', detail: 0.35, scale: 2.0, tint: true, alpha: false, mode: HEX, sym: 7, hr: [-0.0007, 0.0007], ao: 0.35,
    prep: `f[0] = FB(uv, ivec2(5), 4, 0.5, 71u); w[0] = WO(uv, ivec2(240), 1.0, 61u);`,
    surf: /* glsl */`
  // poured EPDM rubber: ~8 mm bonded granules, sparse light flecks, soft large-scale blotches
  vec4 wc = c[0];
  float gr = smoothstep(0.04, 0.18, wc.y - wc.x);
  float tone = mix(0.78 + 0.08 * fract(wc.z * 3.71), 0.97, step(0.95, wc.z));
  float big = n[0];
  s.alb = vec3(mix(0.7, tone, gr)) * (1.0 + 0.03 * big);
  s.h = 0.00055 * gr * (1.0 - 0.8 * wc.x * wc.x) - 0.0004 * (1.0 - gr) + 0.00008 * big;
  s.rough = 0.9 - 0.04 * gr;`,
  },
  {
    name: 'glasstile', detail: 0.0, scale: 1.2, tint: true, alpha: false, mode: GRID, sym: 7, hr: [-0.004, 0.0018], ao: 0.45,
    prep: `f[0] = FB(uv, ivec2(96), 2, 0.5, 7u);`,
    surf: /* glsl */`
  // 100 mm glossy glass-mosaic tiles: pillowed edges, slight dome + per-tile tilt, 4 mm grout
  ivec2 cell = ivec2(floor(P / 0.1));
  ivec2 cw = wrp(cell, ivec2(12));
  vec2 lp = P - (vec2(cell) * 0.1 + 0.05);
  float e = -sdRB(lp, vec2(0.05), 0.01);
  vec2 pr = edgeProf(e, 0.002, 0.008, 0.002, 0.0036);
  float inG = pr.y;
  float hid = hf(cw, 3u), hid2 = hf(cw, 5u);
  vec2 tilt = hf2(cw, 9u) - 0.5;
  float dome = 1.0 - dot(lp, lp) / 0.005;
  float inner = exp(-pow((e - 0.016) / 0.004, 2.0));
  vec3 col = vec3(0.8) * (1.0 + 0.09 * (hid - 0.5)) * (1.0 + 0.04 * inner);
  vec3 grout = vec3(0.7) * (1.0 + 0.05 * n[0]);
  s.alb = mix(col, grout, inG);
  s.h = pr.x + (0.0007 * dome + dot(tilt, lp) * 0.012 + 0.0001 * inner) * (1.0 - inG);
  s.rough = mix(0.1 + 0.08 * hid2, 0.85, inG);
  s.cav = mix(1.0, 0.65, inG);`,
  },
  // ------------------------------------------------------------------------------------------------ marina set
  // Shared language: ~210-230 texels/m (slabs/plating 160), moderate wear, muted paint + honest rust/timber/steel.
  // mask: premultiplied two-part albedo — rgb = the layer's OWN colours (rust, primer, bare timber, galvanised steel,
  // sealant, antifouling…) already multiplied by their coverage; a = paint coverage x paint brightness (≈ 0.8 where
  // fully painted). The level shader composes rgb + tint * a * 1.25: exact for translucent stains, and linear, so
  // mip / hex filtering stays exact too.
  {
    group: 1, name: 'planks', detail: 0.35, scale: 2.24, tint: false, alpha: false, mode: GRID, sym: 1, hr: [-0.022, 0.0016], ao: 0.4,
    prep: `int row = int(floor(P.y / 0.14)); float ly = P.y - float(row) * 0.14;
  int js[16] = int[16](0, 2, 3, 1, 2, 0, 1, 3, 0, 2, 1, 3, 0, 1, 3, 2);
  float rn = hf(ivec2(row, 0), 17u); float j1 = 0.28 + 0.56 * float(js[row]);
  int seg = rn >= 0.8 && mod(P.x - j1, 2.24) >= 1.12 ? 1 : 0;
  float bo = float(row) * 6.37 + float(seg) * 17.3;
  f[0] = Req(vec2(uv.x * 10.0, ly * 40.0 + bo), ivec2(10, 4096), 3, 0.55, 211u);
  f[1] = FB(uv, ivec2(5), 4, 0.5, 223u);
  f[2] = Req(vec2(uv.x * 4.0, bo * 0.37), ivec2(4, 4096), 3, 0.5, 227u);
  f[3] = FB(uv, ivec2(48), 2, 0.5, 229u);
  w[0] = WO(uv, ivec2(4, 16), 1.0, 233u);`,
    surf: /* glsl */`
  // hardwood dock decking: 140 mm boards along u, 9 mm gaps, joists every 0.56 m (seen through the gaps), butt joints
  // staggered over joists, two stainless screws per board per joist, per-board tone / crown or cup / twist, streaky
  // grain with cathedral figure, raised latewood, end grain darker, checks, a few knots and water stains; arrises and
  // board ends weathered to silver. Own colours: the block colour is not used.
  const float PW = 0.14, GAP = 0.0045, JS = 0.56;
  int row = int(floor(P.y / PW));
  float ly = P.y - float(row) * PW;
  int js[16] = int[16](0, 2, 3, 1, 2, 0, 1, 3, 0, 2, 1, 3, 0, 1, 3, 2);
  float rn = hf(ivec2(row, 0), 17u);
  int nj = rn < 0.14 ? 0 : (rn < 0.8 ? 1 : 2);
  float j1 = 0.28 + JS * float(js[row]);
  int seg = nj == 2 && mod(P.x - j1, 2.24) >= 1.12 ? 1 : 0;
  ivec2 bid = ivec2(row, seg);
  float b1 = hf(bid, 3u), b2 = hf(bid, 5u), b3 = hf(bid, 7u), b4 = hf(bid, 11u), b5 = hf(bid, 13u);
  float eE = nj == 0 ? 1.0 : jd(P.x - j1, nj == 2 ? 1.12 : 2.24);
  float eS = min(ly, PW - ly);
  vec2 ps = edgeProf(eS, GAP, 0.0045, 0.0018, 0.022);
  vec2 pe = edgeProf(eE, 0.0014, 0.003, 0.0012, 0.016);
  float gap = max(ps.y, pe.y);
  float q = clamp((ly - PW * 0.5) / (PW * 0.5 - GAP), -1.0, 1.0);
  float crown = mix(-0.0005, 0.0009, b2) * (1.0 - q * q) + (b3 - 0.5) * 0.0007 * q;
  float streak = n[0], patchN = n[1] * 0.5 + 0.5, warp = n[2], fib = n[3];
  // knot on a quarter of the boards: dark oval, the figure bends around it
  float kxc = (nj == 2 ? j1 + 1.12 * float(seg) + 0.56 : j1 + 1.12) + (b5 * 4.0 - 0.5) * 0.7;
  vec2 kd = vec2(jd(P.x - kxc, 2.24) / 0.024, (ly - PW * (0.3 + 0.4 * b1)) / 0.012);
  float kr = b5 < 0.25 ? length(kd) : 99.0;
  float knot = 1.0 - smoothstep(0.75, 1.0 + PX / 0.012, kr);
  float flatSawn = step(0.4, b4);
  float rc = q * (1.6 + 1.4 * b1) + (0.9 + 1.4 * flatSawn) * warp + 3.0 * b3 + 0.9 * exp(-0.25 * kr * kr);
  float late = smoothstep(0.7, 0.95, 0.5 + 0.5 * cos(TAU * rc)) * mix(0.45, 1.0, flatSawn);
  vec3 wa = lin(vec3(0.68, 0.56, 0.46)), wb = lin(vec3(0.59, 0.47, 0.39)), wc = lin(vec3(0.74, 0.62, 0.51)), wd = lin(vec3(0.64, 0.56, 0.49));
  vec3 wood = mix(mix(wa, wb, b1), mix(wc, wd, b2), step(0.55, b3)) * (0.8 + 0.34 * b4);
  bool fresh = b5 > 0.94;                                  // a replaced board: warmer, not silvered yet
  if (fresh) wood *= vec3(1.08, 0.96, 0.84);
  wood *= (1.0 + 0.12 * streak) * (1.0 - 0.12 * late) * (1.0 + 0.03 * fib);
  wood *= 1.0 - 0.26 * (1.0 - smoothstep(0.0014, 0.032, eE)) * step(0.5, float(nj));
  wood = mix(wood, lin(vec3(0.3, 0.2, 0.13)), knot * 0.85);
  float stain = (1.0 - smoothstep(0.15, 0.45, c[0].x + 0.15 * n[1])) * step(0.7, c[0].z);
  wood *= 1.0 - 0.1 * stain;
  // silvering: arrises and board ends first, then patchy across weathered boards
  float edgeW = 1.0 - smoothstep(0.0, 0.016, eS - GAP);
  float endW = nj == 0 ? 0.0 : 1.0 - smoothstep(0.0, 0.035, eE - 0.0014);
  float silver = (0.08 + 0.45 * b2 * b2 * b3) * (0.7 + 0.6 * patchN) + 0.38 * edgeW + 0.3 * endW;
  silver = fresh ? 0.0 : clamp(silver * (0.55 + 0.9 * smoothstep(-0.5, 0.7, streak)) * (0.85 + 0.3 * (fib * 0.5 + 0.5)), 0.0, 0.75);
  vec3 grey = lin(vec3(0.6, 0.59, 0.56)) * (1.0 + 0.14 * streak) * (1.0 - 0.2 * late) * (1.0 - 0.12 * stain);
  // checks: fine splits along the grain, mostly running in from a butt end
  float chk = 0.0;
  for (int k = 0; k < 2 * uOne; k++) {
    ivec2 ck = ivec2(row * 2 + seg, k);
    float h1 = hf(ck, 41u), h2 = hf(ck, 43u), h3 = hf(ck, 47u);
    if (h1 > 0.5) continue;
    float L = 0.04 + 0.22 * h3;
    float xc = (k == 0 && nj > 0) ? j1 + (h2 > 0.5 ? 1.0 : -1.0) * (0.02 + L) : h2 * 2.24;
    float yc = GAP + 0.02 + h3 * (PW - 2.0 * GAP - 0.04);
    float taper = clamp(1.0 - jd(P.x - xc, 2.24) / L, 0.0, 1.0);
    float d = abs(ly - yc - 0.003 * sin(P.x * 23.0 + h1 * 40.0));
    float wdt = 0.0003 + 0.0011 * taper;
    chk = max(chk, (1.0 - smoothstep(wdt, wdt + PX, d)) * step(0.001, taper));
  }
  chk *= 1.0 - gap;
  // screws: over every joist (either side of a butt joint), 26 mm in from each edge; tannin/iron halo; a few rusty
  float jx = jd(P.x - 0.28, JS);
  float atJ = nj == 0 ? 0.0 : step(eE, 0.08);
  float sx = atJ > 0.5 ? abs(eE - 0.03) : jx;
  float sy = min(abs(ly - GAP - 0.026), abs(PW - GAP - 0.026 - ly));
  float sd = length(vec2(sx, sy));
  float screw = 1.0 - aa(0.0042, sd);
  float halo = (1.0 - smoothstep(0.004, 0.02, sd)) * (1.0 - screw);
  float sh = hf(wrp(ivec2(int(floor(P.x / 0.07)), row * 2 + int(ly > PW * 0.5)), ivec2(32, 32)), 53u);
  vec3 steel = (sh < 0.82 ? lin(vec3(0.62, 0.62, 0.6)) : lin(vec3(0.3, 0.25, 0.21))) * (0.78 + 0.35 * smoothstep(0.0042, 0.0, sd));
  float joist = 1.0 - smoothstep(0.018, 0.026, jx);
  vec3 gapC = mix(lin(vec3(0.03, 0.028, 0.025)), lin(vec3(0.16, 0.12, 0.09)), max(joist * ps.y, pe.y) * 0.85);
  vec3 col = mix(wood, grey, silver);
  col *= (1.0 - 0.45 * halo) * (1.0 - 0.55 * chk);
  col = mix(col, steel, screw);
  col = mix(col, gapC, gap);
  float h = min(ps.x, pe.x);
  h += (crown + 0.00011 * streak + 0.00017 * late + 0.00006 * fib - 0.0001 * knot - 0.0024 * chk) * (1.0 - gap);
  h = mix(h, -0.0004 + 0.00025 * sqrt(max(1.0 - pow(sd / 0.0042, 2.0), 0.0)), screw);
  s.alb = col; s.h = h;
  s.rough = mix(mix(0.68 + 0.08 * (fib * 0.5 + 0.5) + 0.05 * late + 0.1 * silver - 0.05 * knot, 0.36, screw), 0.95, gap);
  s.metal = screw * (sh < 0.82 ? 0.85 : 0.35);
  s.cav = mix(1.0, 0.3, gap) * (1.0 - 0.35 * chk) * (1.0 - 0.25 * halo);`,
  },
  {
    group: 1, name: 'hullpaint', detail: 0.25, scale: 3.2, tint: true, mask: true, alpha: false, mode: GRID, sym: 1, hr: [-0.004, 0.003], ao: 0.3,
    prep: `f[0] = FB(uv, ivec2(5), 4, 0.5, 301u); f[1] = FB(uv, ivec2(128), 2, 0.5, 307u); f[2] = FB(uv, ivec2(32, 4), 3, 0.5, 311u);
  f[3] = FB(uv, ivec2(16), 3, 0.5, 313u); w[0] = WO(uv, ivec2(32), 0.9, 317u);`,
    surf: /* glsl */`
  // painted steel hull plating: 1.6 m strakes welded on the repeat border, butts staggered (lower strake at the repeat
  // edge, upper at mid-length), a riveted butt-strap seam at 1.6 m (two rivet rows), frames every 0.4 m and stringers
  // every 0.8 m pulling the plate into shallow dishes ("hungry horse" — reads in reflections), chips through primer to
  // steel, rust weeping down from chips / rivets / the seam above, roller touch-up patches over old damage.
  // albedo.a = paint (tinted by the block colour); 0 = rust / primer / bare steel
  float x = P.x, y = P.y;
  float dW = min(y, 3.2 - y);
  float dB = y < 1.6 ? min(x, 3.2 - x) : abs(x - 1.6);
  float bead = max(exp(-dW * dW / 0.00006), exp(-dB * dB / 0.00006));
  float toe = max(exp(-pow((dW - 0.011) / 0.004, 2.0)), exp(-pow((dB - 0.011) / 0.004, 2.0)));   // paint pools at the weld toes
  float dL = abs(y - 1.6);
  float seamL = 1.0 - aa(0.001, dL);
  const float RP = 3.2 / 36.0;
  float rd = length(vec2(abs(mod(x, RP) - RP * 0.5), abs(dL - 0.036)));
  float riv = 1.0 - aa(0.0105, rd);
  float dome = sqrt(max(1.0 - pow(rd / 0.0105, 2.0), 0.0));
  float dish = pow(max(sin(PI * fract(x / 0.4)) * sin(PI * fract(y / 0.8)), 0.0), 0.9);
  // chips (10 cm cells, more where the paint is thin)
  vec4 wc = c[0];
  float cp = step(1.0 - (0.008 + 0.025 * smoothstep(0.1, 0.7, n[3] * 0.5 + 0.5)), wc.z);
  float cr = 0.002 + 0.006 * fract(wc.z * 37.1);
  float cdist = wc.x * 0.1 + cr * 0.9 * n[1] + 0.002 * n[2];
  float chip = cp * (1.0 - aa(cr, cdist));
  float core = cp * (1.0 - aa(cr * 0.55, cdist));
  float rsty = step(0.45, fract(wc.z * 71.3));
  // rust weeps: per 10 cm column up to two sources (the welded seam above, a rivet, or a chip), running down
  float weep = 0.0, spot = 0.0;
  int ci = int(floor(x / 0.1));
  for (int it = 0; it < 6 * uOne; it++) {
    int dc = (it >> 1) - 1, k = it & 1;
    ivec2 cid = wrp(ivec2(ci + dc, k), ivec2(32, 2));
    float h1 = hf(cid, 61u), h2 = hf(cid, 67u), h3 = hf(cid, 71u), h4 = hf(cid, 73u);
    if (h1 > 0.2) continue;
    float xs = (float(ci + dc) + 0.15 + 0.7 * h2) * 0.1, ys;
    if (h3 < 0.35) ys = 3.194;
    else if (h3 < 0.7) { xs = (floor(xs / RP) + 0.5) * RP; ys = 1.6 - 0.036 - 0.009; }
    else ys = 0.3 + 2.7 * fract(h4 * 7.3);
    float L = min(0.12 + 0.7 * h4 * h4, ys - 0.03);
    float dy = ys - y;
    if (dy < -0.02 || dy > L) continue;
    float t = max(dy, 0.0) / L;
    float xm = xs + 0.005 * sin(dy * 7.0 + h2 * 30.0) + 0.006 * n[2] * t;
    float w = (0.01 + 0.018 * h2) * (0.5 + 1.5 * t);
    float lat = 1.0 - smoothstep(w * 0.1, w, abs(x - xm) * (1.0 + 0.35 * n[1]));
    weep = max(weep, lat * lat * pow(1.0 - t, 1.2) * smoothstep(-0.015, 0.01, dy) * (0.55 + 0.45 * h4) * (0.75 + 0.25 * n[1]));
    if (h3 >= 0.7) spot = max(spot, 1.0 - aa(0.003 + 0.004 * h2, length(vec2(x - xs, y - ys)) + 0.003 * n[1]));
  }
  // roller touch-up patches (fresh, glossier paint in a slightly different shade) over old chips and weeps
  ivec2 pc = ivec2(floor(P / vec2(0.8, 0.4)));
  ivec2 pcw = wrp(pc, ivec2(4, 8));
  vec2 pl = P - (vec2(pc) * vec2(0.8, 0.4) + vec2(0.4, 0.2)) - (hf2(pcw, 89u) - 0.5) * vec2(0.2, 0.08);
  float pd = sdRB(pl, vec2(0.1 + 0.16 * hf(pcw, 83u), 0.05 + 0.08 * hf(pcw, 87u)), 0.025) + 0.01 * n[1] + 0.012 * n[2];
  float patchM = step(hf(pcw, 81u), 0.07) * (1.0 - aa(0.0, pd));
  float mott = n[0], stip = n[1];
  float chalk = smoothstep(0.15, 0.75, mott);
  float paint = 0.8 * (1.0 + 0.04 * mott + 0.012 * stip) * (1.0 + 0.04 * chalk);
  paint *= mix(1.0, 0.94 + 0.12 * hf(pcw, 91u), patchM);
  paint *= (1.0 + 0.12 * (bead * 0.7 + riv * smoothstep(0.55, 1.0, dome))) * (1.0 - 0.14 * toe);
  weep *= 1.0 - patchM;
  float chipT = max(chip, spot) * (1.0 - patchM);
  vec3 rust = lin(vec3(0.56, 0.33, 0.19)) * (0.85 + 0.3 * n[2]);
  vec3 chipC = mix(lin(vec3(0.36, 0.34, 0.33)), rsty > 0.5 ? lin(vec3(0.33, 0.17, 0.09)) : lin(vec3(0.27, 0.27, 0.28)), core);
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, rust, weep * 0.62); cov *= 1.0 - weep * 0.62;
  own = mix(own, chipC, chipT); cov *= 1.0 - chipT;
  s.alb = own; s.a = cov * paint;
  s.h = 0.0016 * bead - 0.0002 * toe + 0.0028 * riv * dome - 0.0018 * dish - 0.0003 * seamL - 0.00025 * chipT + 0.00003 * stip + 0.0001 * patchM;
  s.rough = mix(mix(mix(0.44 + 0.12 * chalk + 0.03 * stip + 0.06 * bead, 0.3, patchM), 0.72, weep * 0.6), core * (1.0 - rsty) > 0.5 ? 0.42 : 0.82, chipT);
  s.metal = chipT * core * (1.0 - rsty) * 0.75;
  s.cav = (1.0 - 0.3 * seamL) * (1.0 - 0.3 * riv * (1.0 - dome)) * (1.0 - 0.2 * toe);`,
  },
  {
    group: 1, name: 'nonslip', detail: 0.5, scale: 2.4, tint: true, mask: true, alpha: false, mode: GRID, sym: 7, hr: [-0.012, 0.0015], ao: 0.4,
    prep: `f[0] = FB(uv, ivec2(5), 4, 0.5, 401u); f[1] = FB(uv, ivec2(64), 2, 0.5, 409u); f[2] = FB(uv, ivec2(12), 3, 0.5, 419u);
  w[0] = WO(uv, ivec2(260), 1.0, 421u); w[1] = WO(uv, ivec2(10), 0.9, 431u);`,
    surf: /* glsl */`
  // ro-ro car deck: 2.4 m plates welded on the repeat border (slightly sagging between beams), anti-slip coating with
  // grit in the paint, cloverleaf lashing sockets on a 1.2 m grid (galvanised, paint worn off round the rims, some
  // rusty), rubber scuffs, thin worn patches, rust spotting along the seams
  float dW = min(jd(P.x, 2.4), jd(P.y, 2.4));
  float bead = exp(-dW * dW / 0.00003);
  vec2 pu = P / 2.4;
  float sag = sin(PI * pu.x) * sin(PI * pu.y);
  vec4 g = c[0];
  float gran = smoothstep(0.02, 0.22, g.y - g.x) * (1.0 - g.x * g.x);
  float gt = fract(g.z * 7.7) - 0.5;
  ivec2 pc = ivec2(floor(P / 1.2));
  vec2 lp = P - (vec2(pc) * 1.2 + 0.6);
  float r = length(lp);
  float ph = hf(wrp(pc, ivec2(2)), 7u);
  float plate = 1.0 - aa(0.068, r);
  float rim = exp(-pow((r - 0.064) / 0.004, 2.0));
  float lobe = min(min(length(lp - vec2(0.021, 0.0)), length(lp + vec2(0.021, 0.0))), min(length(lp - vec2(0.0, 0.021)), length(lp + vec2(0.0, 0.021)))) - 0.019;
  float hole = 1.0 - aa(0.0, min(lobe, max(abs(lp.x), abs(lp.y)) - 0.02));
  float wearRing = (1.0 - smoothstep(0.068, 0.1 + 0.02 * n[2], r)) * (1.0 - plate);
  float rustHalo = step(ph, 0.4) * (1.0 - smoothstep(0.07, 0.15 + 0.05 * n[2], r)) * (1.0 - plate) * smoothstep(-0.3, 0.3, n[2]);
  float worn = smoothstep(0.4, 0.75, n[0] * 0.5 + 0.5 + 0.1 * n[1]);
  float scuff = step(0.8, c[1].z) * (1.0 - smoothstep(0.03, 0.2, c[1].x + 0.22 * n[2]));
  float seamRust = exp(-dW * dW / 0.00018) * smoothstep(0.62, 0.85, n[2] * 0.5 + 0.5);
  float grime = (1.0 - gran) * smoothstep(0.1, 0.6, g.x);          // dirt settles between the granules
  float paint = 0.8 * (1.0 + 0.03 * n[0] + 0.03 * n[1]) * (1.0 + 0.2 * gt * gran) * (1.0 - 0.1 * grime * (1.0 - worn)) * (1.0 + 0.035 * worn) * (1.0 - 0.22 * scuff);
  paint *= 1.0 + 0.08 * bead;
  vec3 galv = lin(vec3(0.47, 0.48, 0.49)) * (0.8 + 0.2 * n[1]) * (1.0 - 0.3 * smoothstep(0.045, 0.068, r));
  vec3 rust = lin(vec3(0.42, 0.21, 0.1)) * (0.85 + 0.3 * n[2]);
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, lin(vec3(0.36, 0.36, 0.37)), wearRing * 0.45); cov *= 1.0 - wearRing * 0.45;
  own = mix(own, rust, rustHalo * 0.75); cov *= 1.0 - rustHalo * 0.75;
  own = mix(own, rust, seamRust * 0.7); cov *= 1.0 - seamRust * 0.7;
  vec3 potC = mix(galv, lin(vec3(0.015)), hole);
  potC = mix(potC, rust * 0.8, step(ph, 0.4) * smoothstep(0.024, 0.06, r) * 0.45 * (1.0 - hole));
  own = mix(own, potC, plate); cov *= 1.0 - plate;
  float h = 0.0009 * bead - 0.0012 * sag + 0.0006 * gran * (1.0 - 0.5 * worn) + 0.00006 * n[1];
  h = mix(h, 0.0003 + 0.0006 * rim - 0.012 * hole, plate);
  s.alb = own; s.a = cov * paint; s.h = h;
  s.rough = mix(mix(0.86 - 0.06 * gran - 0.09 * worn + 0.04 * n[1], 0.66, seamRust * 0.5), mix(0.5, 0.95, hole), plate);
  s.metal = plate * (1.0 - hole) * 0.8 + wearRing * 0.4;
  s.cav = mix(1.0, 0.15, hole * plate) * (1.0 - 0.2 * rim);`,
  },
  {
    group: 1, name: 'gelcoat', detail: 0.1, scale: 2.4, tint: true, mask: true, alpha: false, mode: GRID, sym: 1, hr: [-0.0016, 0.0005], ao: 0.3,
    prep: `f[0] = FB(uv, ivec2(4), 4, 0.5, 501u); f[1] = FB(uv, ivec2(40, 4), 3, 0.5, 503u); f[2] = FB(uv, ivec2(3, 30), 3, 0.5, 509u);
  f[3] = FB(uv, ivec2(16), 3, 0.5, 511u); w[0] = WO(uv, ivec2(110), 1.0, 521u); w[1] = WO(uv, ivec2(40), 1.0, 523u);`,
    surf: /* glsl */`
  // moulded fibreglass: gloss gelcoat, faint orange peel, moulded panel lines (2.4 x 0.8 m, rounded), crazing round a
  // few panel corners, chalky oxidised patches, horizontal fender scuffs and faint brown run-off streaks
  vec2 cell = floor(P / vec2(2.4, 0.8));
  vec2 lp = P - (cell * vec2(2.4, 0.8) + vec2(1.2, 0.4));
  float e = min(jd(P.y, 0.8), jd(P.x, 2.4) + 0.0006);   // moulded seams: every 0.8 m up, every 2.4 m along
  float line = exp(-e * e / 0.0000035) * (jd(P.y, 0.8) < jd(P.x, 2.4) ? 1.0 : 0.7);
  float ridge = exp(-pow((e - 0.005) / 0.002, 2.0));
  float peel = smoothstep(0.0, 0.25, c[0].y - c[0].x) * (1.0 - c[0].x * c[0].x);
  float ox = smoothstep(0.1, 0.65, n[0]);
  float corner = 1.0 - smoothstep(0.03, 0.22, length(abs(lp) - vec2(1.2, 0.4)));
  float ch = hf(wrp(ivec2(cell), ivec2(1, 3)), 5u);
  float craze = (1.0 - aa(0.0005, (c[1].y - c[1].x) * 0.03)) * corner * step(ch, 0.4) * step(0.001, e);
  float run = smoothstep(0.45, 0.85, n[1] * 0.5 + 0.5) * smoothstep(0.0, 0.5, n[3]);
  float scuff = smoothstep(0.74, 0.94, n[2] * 0.5 + 0.5) * smoothstep(0.6, 0.85, n[3] * 0.5 + 0.5);
  float paint = 0.8 * (1.0 + 0.012 * n[3]) * (1.0 + 0.025 * ox) * (1.0 - 0.14 * scuff) * (1.0 - 0.16 * line) * (1.0 - 0.3 * craze);
  vec3 own = vec3(0.0); float cov = 1.0;
  float oxc = 0.06 * ox;                                   // chalky oxidation drifts toward a pale cream
  own = mix(own, lin(vec3(0.9, 0.87, 0.8)) * (1.0 - 0.14 * scuff), oxc); cov *= 1.0 - oxc;
  float rn2 = 0.1 * run;                                   // faint tannin / run-off streaks
  own = mix(own, lin(vec3(0.62, 0.52, 0.38)), rn2); cov *= 1.0 - rn2;
  s.alb = own; s.a = cov * paint;
  s.h = -0.0006 * line + 0.00008 * ridge + 0.00009 * peel + 0.00006 * n[3] - 0.00025 * craze - 0.00002 * scuff;
  s.rough = 0.12 + 0.1 * ox + 0.06 * scuff + 0.25 * line + 0.2 * craze + 0.015 * n[3];
  s.cav = (1.0 - 0.3 * line) * (1.0 - 0.3 * craze);`,
  },
  {
    group: 1, name: 'yard', detail: 0.9, scale: 3.2, tint: true, mask: true, alpha: false, mode: GRID, sym: 7, hr: [-0.01, 0.0012], ao: 0.5,
    prep: `f[0] = FB(uv, ivec2(4), 5, 0.55, 601u); f[1] = FB(uv, ivec2(16), 3, 0.5, 607u);
  f[2] = FB(uv, ivec2(10, 96), 1, 0.5, 613u); f[3] = FB(uv, ivec2(64), 3, 0.5, 617u);
  vec2 wq = uv + 0.02 * vec2(sin(TAU * (3.0 * uv.y + 2.0 * uv.x)) + 0.5 * sin(TAU * (7.0 * uv.y - 5.0 * uv.x) + 1.3),
                             sin(TAU * (3.0 * uv.x - 2.0 * uv.y) + 0.7) + 0.5 * sin(TAU * (6.0 * uv.x + 5.0 * uv.y) + 2.1));
  w[0] = WO(wq, ivec2(4), 0.85, 619u); w[1] = WO(uv, ivec2(64), 1.0, 631u);`,
    surf: /* glsl */`
  // boatyard hardstanding: 3.2 m broom-finished slabs (broom direction per slab via the grid transform), sealed
  // expansion joints on the repeat border with chipped arrises, oil stains, rust rings from jack stands, clusters of
  // antifouling specks where hulls were sanded and painted, hairline cracks, a trowelled repair, rubber scuffs
  float dE = min(jd(P.x, 3.2), jd(P.y, 3.2));
  float spall = 0.002 * smoothstep(0.25, 0.85, n[3] * 0.5 + 0.5);
  vec2 pe = edgeProf(dE, 0.0055, 0.004 + spall, 0.0016 + spall * 0.5, 0.004);
  float mott = n[0], broom = n[2];
  vec4 wc = c[0];
  float kind = wc.z;
  float d = wc.x + 0.3 * n[1] + 0.07 * n[3];
  float rS = 0.08 + 0.2 * fract(kind * 17.3);
  float away = smoothstep(0.35, 0.75, dE);                      // keep distinct stains off the slab edges (no mirrored twins)
  float oilK = 0.0;                                                // oil lives in the level shader at world scale (never repeats)
  float oil = oilK * (1.0 - smoothstep(rS * 0.85, rS, d));
  float oilCore = oilK * (1.0 - smoothstep(rS * 0.2, rS * 0.8, d + 0.06 * n[3]));
  float ringD = abs(wc.x * 0.8 - (0.07 + 0.07 * fract(kind * 31.0)));
  float rust = step(0.34, kind) * step(kind, 0.42) * max(exp(-ringD * ringD / 0.0003), 0.3 * (1.0 - smoothstep(0.0, 0.12, wc.x * 0.8))) * smoothstep(-0.35, 0.3, n[1]) * away;
  float cluster = step(0.46, kind) * step(kind, 0.6) * (1.0 - smoothstep(0.1, 0.75, wc.x + 0.2 * n[1])) * away;
  vec4 sc = c[1];
  float sr = 0.0018 + 0.004 * pow(fract(sc.z * 13.1), 3.0) + 0.006 * step(0.985, fract(sc.z * 29.3));
  float spk = step(1.0 - 0.45 * cluster * smoothstep(-0.2, 0.3, n[1]), sc.z) * (1.0 - aa(sr, sc.x * 0.05 + 0.25 * sr * n[3]));
  float dust = cluster * smoothstep(-0.3, 0.5, n[1]) * 0.22;                 // sanding dust haze around the specks
  float kf = fract(kind * 7.0);
  vec3 af = kf < 0.55 ? lin(vec3(0.42, 0.27, 0.22)) : (kf < 0.85 ? lin(vec3(0.24, 0.28, 0.34)) : lin(vec3(0.18, 0.18, 0.19)));
  float crack = (1.0 - aa(0.0006, (wc.y - wc.x) * 0.4)) * step(0.55, fract(wc.z * 5.3 + wc.w * 2.7)) * smoothstep(0.1, 0.4, mott) * step(0.02, dE);
  ivec2 pc = ivec2(floor(P / 1.6));
  ivec2 pcw = wrp(pc, ivec2(2));
  vec2 pl = P - (vec2(pc) * 1.6 + 0.8) - (hf2(pcw, 15u) - 0.5) * 0.5;
  float pd = sdRB(pl, vec2(0.2 + 0.22 * hf(pcw, 17u), 0.16 + 0.16 * hf(pcw, 19u)), 0.03) + 0.006 * n[3];
  float patchM = step(hf(pcw, 13u), 0.16) * (1.0 - aa(0.0, pd));
  float patchEdge = step(hf(pcw, 13u), 0.16) * (1.0 - aa(0.0015, abs(pd)));
  float scuff = smoothstep(0.62, 0.92, n[1] * 0.5 + 0.5) * smoothstep(-0.1, 0.5, mott);
  float agg = step(0.8, fract(sc.z * 5.3)) * (1.0 - aa(0.004, sc.x * 0.05 + 0.002 * n[3])) * smoothstep(0.0, 0.6, mott * 0.5 + 0.5);
  float pore = step(0.9, fract(sc.w * 7.9 + sc.z)) * (1.0 - aa(0.0018, sc.x * 0.05));          // bug holes
  float paint = 0.8 * (1.0 + 0.11 * mott + 0.045 * n[1] + 0.02 * broom + 0.05 * n[3]) * (1.0 - 0.35 * pore);
  paint *= 1.0 - 0.1 * smoothstep(0.3, 0.9, -mott);
  paint *= mix(1.0, 0.92 + 0.04 * n[3], patchM) * (1.0 - 0.25 * patchEdge);
  paint *= (1.0 - 0.25 * oil) * (1.0 - 0.14 * scuff) * (1.0 - 0.45 * crack);
  paint *= 1.0 - 0.18 * (1.0 - smoothstep(0.007, 0.03, dE)) * (1.0 - pe.y);   // dirt along the joint
  vec3 rustC = lin(vec3(0.5, 0.27, 0.13)) * (0.85 + 0.3 * n[3]);
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, lin(vec3(0.46, 0.43, 0.39)) * (0.8 + 0.4 * fract(sc.z * 11.3)), agg * 0.6); cov *= 1.0 - agg * 0.6;
  own = mix(own, lin(vec3(0.1, 0.09, 0.08)), oilCore * 0.4); cov *= 1.0 - oilCore * 0.4;
  own = mix(own, af * 1.3, dust); cov *= 1.0 - dust;
  own = mix(own, rustC, rust * 0.7); cov *= 1.0 - rust * 0.7;
  own = mix(own, af * (0.85 + 0.3 * fract(sc.z * 3.7)), spk); cov *= 1.0 - spk;
  own = mix(own, lin(vec3(0.17, 0.165, 0.16)) * (0.85 + 0.3 * n[3]), pe.y); cov *= 1.0 - pe.y;
  s.alb = own; s.a = cov * paint;
  s.h = pe.x + (0.00007 * broom + 0.0001 * n[3] + 0.0002 * spk + 0.00035 * patchM - 0.0015 * crack - 0.0012 * pore + 0.00012 * agg) * (1.0 - pe.y) - 0.0003 * patchEdge;
  s.rough = mix(mix(mix(0.87 + 0.04 * n[3] - 0.05 * agg, 0.72, patchM) - 0.2 * oilCore - 0.06 * oil, 0.5, spk), 0.62, pe.y);
  s.cav = mix(1.0, 0.8, pe.y) * (1.0 - 0.4 * crack) * (1.0 - 0.2 * patchEdge) * (1.0 - 0.4 * pore);`,
  },
  {
    group: 1, name: 'weatherboard', detail: 0.3, scale: 2.4, tint: true, mask: true, alpha: false, mode: GRID, sym: 1, hr: [-0.016, 0.0006], ao: 0.55,
    prep: `int row = int(floor(P.y / 0.15)); float ly = P.y - float(row) * 0.15;
  f[0] = Req(vec2(uv.x * 8.0, ly * 45.0 + float(row) * 5.3), ivec2(8, 4096), 3, 0.5, 701u);
  f[1] = FB(uv, ivec2(5), 4, 0.5, 709u); f[2] = FB(uv, ivec2(40, 16), 3, 0.5, 719u); f[3] = FB(uv, ivec2(24), 3, 0.5, 727u);
  w[0] = WO(uv, ivec2(12, 64), 0.9, 733u);`,
    surf: /* glsl */`
  // painted bevel-lap weatherboards: 150 mm exposure, each board tapering back under the butt of the one above (a crisp
  // drip-edge shadow line), studs every 0.6 m with a nail per board, butt joints over studs, grain telegraphing through
  // satin paint, chalky weathering, paint peeling to grey timber (untinted) along butt edges, rust runs from nails
  const float BW = 0.15;
  int row = int(floor(P.y / BW));
  float ly = P.y - float(row) * BW;
  float t = ly / BW;
  float grain = n[0], weath = smoothstep(0.0, 0.7, n[1]), pn = n[2];
  float h = -0.013 * pow(t, 1.15) - 0.0022 * (1.0 - smoothstep(0.0, 0.005, ly));
  int jsw[16] = int[16](1, 3, 0, 2, 3, 1, 2, 0, 1, 2, 3, 0, 2, 0, 3, 1);
  float jxp = 0.3 + 0.6 * float(jsw[row]);
  float eJ = hf(ivec2(row, 0), 19u) < 0.55 ? jd(P.x - jxp, 2.4) : 1.0;
  vec2 pj = edgeProf(eJ, 0.0009, 0.002, 0.0008, 0.008);
  float nx = eJ < 0.05 ? abs(eJ - 0.022) : jd(P.x - 0.3, 0.6);
  float nd = length(vec2(nx, ly - 0.028));
  float nail = 1.0 - aa(0.0035, nd);
  // peeling: flakes (10 cm cells, denser where weathered) + along the butt edges and joints
  vec4 wc = c[0];                                   // cells 0.2 m along x 37 mm up: flakes run with the grain
  float pp = step(1.0 - (0.02 + 0.11 * weath) * (1.4 - t), wc.z);
  float peel = pp * (1.0 - aa(0.0, (wc.x + 0.28 * pn - (0.3 + 0.35 * fract(wc.z * 19.3))) * 0.0375));
  float edgeP = (1.0 - smoothstep(0.0, 0.005 + 0.016 * weath, ly + 0.005 * pn)) * step(0.64 - 0.3 * weath, pn * 0.5 + 0.5);
  float jointP = (1.0 - smoothstep(0.0, 0.008 + 0.016 * weath, eJ + 0.004 * pn)) * step(0.52, pn * 0.5 + 0.5);
  peel = max(max(peel, edgeP), jointP) * (1.0 - nail);
  float pedge = (1.0 - smoothstep(0.0, 0.6, abs(peel - 0.5) * 2.0)) * step(0.02, peel);
  float checkP = (1.0 - smoothstep(0.0, 0.05, abs(grain))) * smoothstep(0.35, 0.9, weath);   // paint checking along the grain
  // rust runs from a quarter of the nails, a few boards down
  float weep = 0.0;
  int sk = int(floor((P.x - 0.3) / 0.6 + 0.5));
  float xs0 = 0.3 + 0.6 * float(sk);
  for (int dr = 0; dr < 4 * uOne; dr++) {
    int rr = row + dr;
    if (rr > 15) break;
    ivec2 id = wrp(ivec2(sk, rr), ivec2(4, 16));
    float h1 = hf(id, 61u);
    if (h1 > 0.24) continue;
    float ys = float(rr) * BW + 0.024;
    float L = min(0.06 + 0.4 * hf(id, 67u), ys - 0.02);
    float dy = ys - P.y;
    if (dy < -0.004 || dy > L) continue;
    float tt = max(dy, 0.0) / L;
    float xm = xs0 + 0.002 * sin(dy * 40.0 + h1 * 50.0) + 0.002 * pn;
    float w = 0.007 * (1.0 + 1.4 * tt);
    float lat = 1.0 - smoothstep(0.0, w, abs(P.x - xm));
    weep = max(weep, lat * lat * pow(1.0 - tt, 1.2) * (0.6 + 0.4 * h1 / 0.24));
  }
  float paint = 0.8 * (1.0 + 0.025 * grain + 0.02 * n[3]) * (1.0 + 0.05 * weath);
  paint *= (1.0 - 0.06 * smoothstep(0.75, 1.0, t)) * (1.0 + 0.12 * pedge) * (1.0 - 0.3 * checkP) * (1.0 - 0.15 * nail);
  float gl = smoothstep(0.55, 0.95, 0.5 + 0.5 * cos(TAU * (ly * 38.0 + 2.2 * grain)));      // grain lines in the bare wood
  vec3 bare = lin(vec3(0.61, 0.59, 0.55)) * (1.0 + 0.1 * grain) * (1.0 - 0.28 * gl) * (1.0 + 0.06 * n[3]);
  bare *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.35, peel)) * step(0.02, peel);          // shadow under the lifted edge
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, bare, peel); cov *= 1.0 - peel;
  own = mix(own, lin(vec3(0.52, 0.28, 0.13)), weep * 0.6); cov *= 1.0 - weep * 0.6;
  own = mix(own, lin(vec3(0.05)), pj.y); cov *= 1.0 - pj.y;
  s.alb = own; s.a = cov * paint;
  s.h = min(h, pj.x) + 0.00006 * grain * (1.0 + peel) - 0.00012 * peel - 0.0004 * nail;
  s.rough = mix(mix(0.5 + 0.18 * weath + 0.03 * n[3], 0.82, peel), 0.75, weep * 0.5);
  s.cav = (1.0 - 0.45 * smoothstep(0.8, 1.0, t)) * mix(1.0, 0.4, pj.y);`,
  },
  {
    group: 1, name: 'render', detail: 0.8, scale: 2.4, tint: true, mask: true, alpha: false, mode: HEX, sym: 7, hr: [-0.0016, 0.0012], ao: 0.4,
    prep: `f[0] = FB(uv, ivec2(4), 4, 0.55, 801u); f[1] = FB(uv, ivec2(12), 3, 0.5, 809u); f[2] = FB(uv, ivec2(48), 2, 0.5, 811u);
  vec2 wq = uv + 0.018 * vec2(sin(TAU * (4.0 * uv.y + 3.0 * uv.x)) + 0.45 * sin(TAU * (11.0 * uv.y - 7.0 * uv.x) + 1.9),
                              sin(TAU * (4.0 * uv.x - 3.0 * uv.y) + 0.4) + 0.45 * sin(TAU * (9.0 * uv.x + 8.0 * uv.y) + 2.6));
  w[0] = WO(uv, ivec2(220), 1.0, 821u); w[1] = WO(wq, ivec2(5), 0.85, 823u);`,
    surf: /* glsl */`
  // painted cement render, float finish: sand grain, soft trowel undulation, hairline map cracks, chalky blotches,
  // small flakes of paint lost to the grey render beneath (untinted). Isotropic → hex anti-tiling.
  vec4 g = c[0];
  float grain = smoothstep(0.03, 0.25, g.y - g.x) * (1.0 - g.x * g.x);
  float gt = fract(g.z * 5.7) - 0.5;
  float und = n[1], blot = smoothstep(0.0, 0.7, n[0]);
  vec4 k = c[1];
  float crackOn = step(0.72, fract(k.z * 9.1 + k.w * 3.3)) * smoothstep(0.0, 0.35, n[0]);
  float crack = (1.0 - aa(0.0003, (k.y - k.x) * 0.24)) * crackOn;
  float flake = step(0.82, fract(k.w * 13.7 + k.z)) * (1.0 - aa(0.0, (k.x - 0.08 - 0.05 * n[2]) * 0.48)) * step(0.3, n[0]);
  float pass = smoothstep(-0.25, 0.25, n[1] + 0.35 * n[0]);                 // trowel passes: slightly different tone
  float paint = 0.8 * (1.0 + 0.1 * gt * grain - 0.05 * (1.0 - grain) + 0.035 * n[2] + 0.03 * und) * (1.0 + 0.06 * blot) * (1.0 - 0.035 * pass) * (1.0 - 0.3 * crack);
  vec3 bare = lin(vec3(0.55, 0.54, 0.51)) * (1.0 + 0.06 * gt * grain);
  s.alb = bare * flake; s.a = (1.0 - flake) * paint;
  s.h = 0.0006 * grain + 0.0011 * und + 0.0001 * n[2] - 0.0008 * crack - 0.0003 * flake;
  s.rough = 0.8 + 0.06 * blot - 0.04 * grain + 0.03 * flake;
  s.cav = 1.0 - 0.35 * crack;`,
  },
  // ------------------------------------------------------------------------------------------------ stairs + ramps
  // Sampled by the level shader in the ramp's own frame: u across, v running DOWNHILL from the top landing, and
  // phase-locked so a whole number of steps / cleat bays fits the visible flight (meta.stair = [period along the slope
  // (m), steps per repeat, share of relief kept under ink, edge kind]). Stair heights are true step profiles relative
  // to the slope plane, so horizontal treads and vertical risers light like real steps.
  {
    group: 2, name: 'treads', detail: 0.25, scale: 1.12, stair: [0.28, 4, 0.5, 1], tint: true, mask: true, alpha: false, mode: GRID, sym: 1, hr: [-0.1, 0.002], ao: 0.1,
    prep: `f[0] = FB(uv, ivec2(6), 4, 0.5, 901u); f[1] = FB(uv, ivec2(48), 2, 0.5, 907u); f[2] = FB(uv, ivec2(16, 4), 3, 0.5, 911u);
  f[3] = FB(uv, ivec2(10), 3, 0.5, 913u); w[0] = WO(uv, ivec2(40), 1.0, 919u); w[1] = WO(uv, ivec2(12, 16), 0.9, 929u);`,
    surf: /* glsl */`
  // galvanised steel stair (ferry sun-deck stairs): a step every 0.28 m along the slope (θ ≈ 22°), checker-plate
  // treads (raised lozenges alternating ±45° on 28 mm cells), rounded nosings with a yellow anti-slip strip worn at the
  // edge, painted risers (albedo.a = paint, tinted by the block colour), rust at the riser feet, boot scuffs, spangle
  const float PD = 0.28, S2 = 0.1403, TT = 0.4040, CT = 2.4751;
  float j = floor(P.y / PD);
  float a = P.y - j * PD;                          // metres downhill of this step's nosing line (the next one at PD)
  float ar = PD * S2;                              // the riser's footprint on the slope plane
  float r1 = -a * CT, r2 = (a - PD) * TT;          // riser line, tread line
  float kF = 0.004, qF = max(kF - abs(r1 - r2), 0.0) / kF;
  float h = max(r1, r2) + qF * qF * kF * 0.25;     // small fillet at the riser foot
  float xa = a < PD * 0.5 ? a : a - PD;            // signed distance from the nearest nosing line
  float l1 = xa * TT, l2 = -xa * CT;
  float kN = 0.014, qN = max(kN - abs(l1 - l2), 0.0) / kN;
  if (abs(xa) < 0.02) h = min(h, min(l1, l2) - qN * qN * kN * 0.25);   // rounded nosing
  float riser = 1.0 - smoothstep(ar - PX, ar + PX, a);
  vec2 cp = P / 0.028;
  ivec2 ci = ivec2(floor(cp));
  vec2 cf = cp - vec2(ci) - 0.5;
  bool odd = ((ci.x + ci.y) & 1) == 1;
  vec2 q = (odd ? vec2(cf.x + cf.y, cf.y - cf.x) : vec2(cf.x - cf.y, cf.x + cf.y)) * 0.70710678;
  float ld = length(vec2(max(abs(q.x) - 0.3, 0.0), q.y)) - 0.12;
  float lw = PX / 0.028;
  float onPlate = smoothstep(ar + 0.006, ar + 0.014, a) * (1.0 - smoothstep(PD - 0.012, PD - 0.005, a));
  float loz = (1.0 - smoothstep(-lw, lw, ld)) * onPlate;
  float ldome = sqrt(clamp(-ld / 0.12, 0.0, 1.0));
  float lbase = (1.0 - smoothstep(0.0, 0.06, abs(ld))) * onPlate;
  vec4 sp = c[0];
  float mott = n[0], fineN = n[1], strk = n[2], dullN = n[3];
  vec3 galv = lin(vec3(0.6, 0.62, 0.64)) * (1.0 + 0.08 * (sp.z - 0.5) + 0.05 * mott + 0.02 * fineN);
  float dull = smoothstep(0.1, 0.6, dullN);
  galv = mix(galv, lin(vec3(0.68, 0.69, 0.68)), dull * 0.35);                  // white-rust dulling
  float polish = loz * ldome * smoothstep(0.35, 0.75, 0.5 + 0.5 * strk);         // lozenge tops polished by boots
  galv = mix(galv, lin(vec3(0.76, 0.77, 0.79)), polish * 0.6);
  float nose = max(1.0 - smoothstep(0.045 - PX, 0.045 + PX, PD - a), 1.0 - smoothstep(0.012 - PX, 0.012 + PX, a));
  float worn = smoothstep(0.62, 0.86, 0.5 + 0.5 * strk + 0.35 * (1.0 - smoothstep(0.0, 0.01, abs(xa))) + 0.15 * (sp.w - 0.5));
  vec3 yel = lin(vec3(0.93, 0.72, 0.17)) * (1.0 + 0.05 * mott) * (1.0 - 0.1 * smoothstep(0.3, 0.8, dullN));
  vec4 rc = c[1];
  float foot = exp(-pow((a - ar - 0.004) / 0.007, 2.0));
  float rust = foot * smoothstep(0.05, 0.5, dullN + 0.35 * (rc.z - 0.5));
  rust = max(rust, step(0.9, rc.z) * (1.0 - smoothstep(0.06, 0.2, rc.x)) * onPlate * 0.8);
  float scuff = step(0.72, fract(rc.z * 7.3)) * (1.0 - smoothstep(0.1, 0.35, rc.x + 0.15 * fineN)) * smoothstep(PD - 0.13, PD - 0.06, a) * (1.0 - nose);
  galv *= 1.0 - 0.3 * scuff;
  vec3 rustC = lin(vec3(0.46, 0.25, 0.12)) * (0.85 + 0.3 * fineN);
  float yN = nose * (1.0 - worn);
  float rP = riser * (1.0 - nose);
  vec3 own = mix(galv, yel, yN);
  own = mix(own, vec3(0.0), rP); float cov = rP;
  own = mix(own, rustC, rust * 0.8); cov *= 1.0 - rust * 0.8;
  s.alb = own;
  s.a = cov * 0.8 * (0.94 + 0.08 * mott);
  s.h = h + 0.0013 * loz * ldome - 0.0002 * rust;
  s.rough = mix(mix(mix(0.58 + 0.08 * (sp.z - 0.5) + 0.1 * dull - 0.16 * polish + 0.08 * scuff, 0.62, yN), 0.5, rP), 0.85, rust * 0.8);
  s.metal = (0.35 + 0.3 * polish) * (1.0 - yN) * (1.0 - rP) * (1.0 - rust * 0.8) * (1.0 - 0.5 * scuff);
  s.cav = (1.0 - 0.35 * exp(-pow((a - ar) / 0.006, 2.0))) * (1.0 - 0.18 * lbase);`,
  },
  {
    group: 2, name: 'stonestep', detail: 0.6, scale: 1.92, stair: [0.32, 6, 0.5, 2], tint: true, mask: true, alpha: false, mode: GRID, sym: 1, hr: [-0.115, 0.002], ao: 0.1,
    prep: `f[0] = FB(uv, ivec2(4), 4, 0.5, 1001u); f[1] = FB(uv, ivec2(24), 3, 0.5, 1009u); f[2] = FB(uv, ivec2(96), 2, 0.5, 1013u);
  f[3] = FB(uv, ivec2(6, 30), 3, 0.5, 1019u); w[0] = WO(uv, ivec2(120), 1.0, 1021u); w[1] = WO(uv, ivec2(24), 0.9, 1031u);`,
    surf: /* glsl */`
  // limestone steps (quay grand stair): a step every 0.32 m along the slope (θ ≈ 21.5°) with a bullnose, a dark
  // carborundum anti-slip insert 20 mm behind each nosing, a dark grime line where each tread meets the riser above,
  // slabs 0.8-1.1 m long with fine joints staggered step to step, per-slab tone and warm/cool cast, shell fragments,
  // pores, bedding, chipped nosings, water staining at the riser feet. albedo.a = limestone (block colour)
  const float PD = 0.32, S2 = 0.1344, TT = 0.3939, CT = 2.5386;
  float j = floor(P.y / PD);
  int ji = int(j);
  float a = P.y - j * PD;
  float ar = PD * S2;
  float r1 = -a * CT, r2 = (a - PD) * TT;
  float kF = 0.005, qF = max(kF - abs(r1 - r2), 0.0) / kF;
  float h = max(r1, r2) + qF * qF * kF * 0.25;
  float xa = a < PD * 0.5 ? a : a - PD;
  float l1 = xa * TT, l2 = -xa * CT;
  float kN = 0.03, qN = max(kN - abs(l1 - l2), 0.0) / kN;
  if (abs(xa) < 0.03) h = min(h, min(l1, l2) - qN * qN * kN * 0.25);   // bullnose
  float riser = 1.0 - smoothstep(ar - PX, ar + PX, a);
  float jx1 = hf(ivec2(ji, 0), 3u) * 1.92;
  bool two = hf(ivec2(ji, 1), 3u) > 0.4;
  float span = 0.82 + 0.28 * hf(ivec2(ji, 2), 3u);
  float sx = mod(P.x - jx1, 1.92);
  float dj = two ? min(min(sx, 1.92 - sx), abs(sx - span)) : min(sx, 1.92 - sx);
  vec2 pj = edgeProf(dj, 0.0016, 0.004, 0.0014, 0.005);
  int si = two && sx > span ? 1 : 0;
  float t1 = hf(ivec2(ji, si), 5u), t2 = hf(ivec2(ji, si), 7u);
  float mott = n[0], fineN = n[1], grain = n[2], bed = n[3];
  vec4 fc = c[0];
  float fr = fc.x * (1.92 / 120.0);
  float shell = step(0.78, fc.z) * (1.0 - aa(0.0016 + 0.0022 * fract(fc.z * 11.0), fr));
  bool light = fract(fc.z * 3.1) > 0.5;
  float pore = step(0.93, fract(fc.z * 5.7)) * (1.0 - aa(0.0009, fr));
  float ins = smoothstep(0.02 - PX, 0.02 + PX, PD - a) * (1.0 - smoothstep(0.055 - PX, 0.055 + PX, PD - a));
  float grit = step(0.55, fract(fc.z * 13.7 + fc.w));
  float gl = exp(-pow((a - ar - 0.003) / 0.006, 2.0));
  float stain = smoothstep(0.1, 0.7, bed * 0.5 + 0.5 + 0.2 * mott) * exp(-max(a - ar, 0.0) / 0.035) * (1.0 - riser);
  vec4 cc = c[1];
  float chip = step(0.8, cc.z) * (1.0 - aa(0.01 + 0.012 * fract(cc.z * 13.0), cc.x * (1.92 / 24.0) + 0.004 * fineN)) * (1.0 - smoothstep(0.004, 0.02, abs(xa)));
  float tone = 0.8 * (1.0 + 0.1 * (t1 - 0.5)) * (1.0 + 0.05 * mott + 0.03 * fineN + 0.025 * grain) * (1.0 + 0.035 * bed);
  tone *= (1.0 - 0.13 * riser) * (1.0 - 0.5 * gl) * (1.0 - 0.12 * stain) * (1.0 + 0.08 * chip);
  tone *= 1.0 + shell * (light ? 0.12 : -0.22) - 0.3 * pore;
  vec3 own = vec3(0.0); float cov = 1.0;
  float hk = 0.16 * abs(t2 - 0.5) * 2.0;
  vec3 hc = (t2 > 0.5 ? lin(vec3(0.84, 0.78, 0.66)) : lin(vec3(0.7, 0.71, 0.7))) * (tone / 0.8);
  own = mix(own, hc, hk); cov *= 1.0 - hk;
  vec3 insC = lin(vec3(0.17, 0.17, 0.18)) * (1.0 + 0.5 * (grit - 0.5)) * (1.0 + 0.1 * mott);
  own = mix(own, insC, ins); cov *= 1.0 - ins;
  own = mix(own, lin(vec3(0.38, 0.37, 0.35)) * (1.0 + 0.1 * grain), pj.y); cov *= 1.0 - pj.y;
  s.alb = own; s.a = cov * tone;
  s.h = h + pj.x + (0.00012 * grain + 0.00008 * fineN - 0.0006 * ins - 0.0025 * chip - 0.0004 * pore) * (1.0 - pj.y);
  s.rough = mix(mix(0.64 + 0.05 * fineN + 0.06 * riser + 0.08 * chip, 0.93, ins), 0.9, pj.y);
  s.cav = (1.0 - 0.3 * gl) * mix(1.0, 0.6, pj.y) * (1.0 - 0.3 * pore);`,
  },
  {
    group: 2, name: 'rampboard', detail: 0.35, scale: 1.6, stair: [0.4, 4, 0.45, 3], tint: false, alpha: false, mode: GRID, sym: 1, hr: [-0.022, 0.03], ao: 0.3,
    prep: `float bw = 1.6 / 7.0; int bi = int(floor(P.x / bw)); float lx = P.x - float(bi) * bw;
  f[0] = Req(vec2(lx * 28.0 + float(bi) * 13.1, uv.y * 6.0), ivec2(4096, 6), 3, 0.5, 1101u);
  f[1] = FB(uv, ivec2(5), 4, 0.5, 1103u);
  f[2] = Req(vec2(lx * 90.0 + float(bi) * 7.3, uv.y * 40.0), ivec2(4096, 40), 2, 0.5, 1109u);
  f[3] = FB(uv, ivec2(8, 4), 3, 0.5, 1117u);
  w[0] = WO(uv, ivec2(7, 12), 1.0, 1123u);`,
    surf: /* glsl */`
  // scaffold-board ramp (tug ramp): seven 229 mm boards across the repeat running down the slope, 8 mm gaps, one
  // staggered butt joint per board with galvanised hoop-iron end bands, nailed cross cleats (50 x 28 mm) every 0.4 m
  // along the slope (centred between the fitted lines), grit banked on the uphill side of each cleat, weathered
  // grey-brown timber with grain along the boards, knots. Own colours.
  const float BW = 1.6 / 7.0, PD = 0.4;
  int bi = int(floor(P.x / BW));
  float lx = P.x - float(bi) * BW;
  float eS = min(lx, BW - lx);
  vec2 ps = edgeProf(eS, 0.004, 0.006, 0.002, 0.022);
  float b1 = hf(ivec2(bi, 0), 3u), b2 = hf(ivec2(bi, 1), 3u), b3 = hf(ivec2(bi, 2), 3u);
  float eE = jd(P.y - b1 * 1.6, 1.6);
  vec2 pe = edgeProf(eE, 0.002, 0.004, 0.0015, 0.018);
  float cy = P.y - (floor(P.y / PD) + 0.5) * PD;   // from the cleat centre line (v grows downhill)
  float ce = 0.025 - abs(cy);
  float cl = smoothstep(-PX, PX, ce);
  float hCl = 0.028 * sqrt(max(1.0 - pow(1.0 - clamp(ce / 0.007, 0.0, 1.0), 2.0), 0.0));
  float gap = max(ps.y, pe.y) * (1.0 - cl);
  float band = smoothstep(0.018 - PX, 0.018 + PX, eE) * (1.0 - smoothstep(0.043 - PX, 0.043 + PX, eE)) * (1.0 - ps.y) * (1.0 - cl);
  float nd = length(vec2(min(abs(lx - 0.05), abs(lx - (BW - 0.05))), cy));
  float nail = (1.0 - aa(0.0045, nd)) * cl;
  float bnail = (1.0 - aa(0.004, length(vec2(lx - BW * 0.5, eE - 0.0305)))) * band;
  float dirt = smoothstep(0.02, 0.03, -cy) * (1.0 - smoothstep(0.035, 0.08 + 0.03 * n[3], -cy)) * smoothstep(-0.3, 0.4, n[3]) * (1.0 - cl);
  float streak = n[0], blot = n[1], fib = n[2];
  vec3 wa = lin(vec3(0.6, 0.5, 0.39)), wb = lin(vec3(0.5, 0.43, 0.35)), wc = lin(vec3(0.66, 0.57, 0.46));
  vec3 wood = mix(mix(wa, wb, b2), wc, step(0.62, b3) * 0.7) * (0.84 + 0.28 * b1);
  wood *= 1.0 + 0.14 * streak + 0.05 * fib;
  vec3 grey = lin(vec3(0.52, 0.51, 0.48)) * (1.0 + 0.12 * streak);
  wood = mix(wood, grey, clamp(0.3 + 0.35 * smoothstep(-0.4, 0.6, blot) + 0.2 * (b3 - 0.5), 0.0, 0.85));
  vec4 kc = c[0];
  float knot = step(0.86, kc.z) * (1.0 - smoothstep(0.1, 0.22, kc.x));
  wood = mix(wood, lin(vec3(0.28, 0.2, 0.14)), knot * 0.7);
  wood *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.03, eE - 0.002));
  vec3 cleatC = lin(vec3(0.44, 0.36, 0.28)) * (0.9 + 0.2 * hf(ivec2(int(floor(P.y / PD)), 5), 9u)) * (1.0 + 0.1 * streak);
  cleatC = mix(cleatC, grey * 0.9, 0.25);
  vec3 col = mix(wood, cleatC, cl);
  col = mix(col, lin(vec3(0.3, 0.26, 0.21)) * (1.0 + 0.2 * blot), dirt * 0.7);
  col = mix(col, lin(vec3(0.5, 0.52, 0.54)) * (1.0 + 0.1 * fib), band);
  col = mix(col, lin(vec3(0.38, 0.38, 0.39)), max(nail, bnail));
  col = mix(col, lin(vec3(0.06, 0.05, 0.045)), gap);
  float hB = min(ps.x, pe.x) + (0.0004 * streak + 0.0002 * fib) * (1.0 - max(ps.y, pe.y)) + 0.0008 * band;
  s.alb = col;
  s.h = mix(hB, max(hB, hCl), cl) + 0.0004 * max(nail, bnail);
  s.rough = mix(mix(mix(mix(0.78 + 0.08 * fib, 0.82, cl), 0.9, dirt * 0.7), 0.5, band), 0.95, gap);
  s.rough = mix(s.rough, 0.4, max(nail, bnail));
  s.metal = 0.7 * band + 0.8 * max(nail, bnail);
  s.cav = mix(1.0, 0.35, gap) * (1.0 - 0.15 * dirt) * (1.0 - 0.55 * exp(-pow((ce + 0.003) / 0.005, 2.0)) * (1.0 - cl));`,
  },
  {
    group: 2, name: 'gangdeck', detail: 0.3, scale: 1.2, stair: [0.3, 4, 0.4, 4], tint: false, alpha: false, mode: GRID, sym: 1, hr: [-0.004, 0.02], ao: 0.3,
    prep: `f[0] = FB(uv, ivec2(40, 3), 3, 0.5, 1201u); f[1] = FB(uv, ivec2(5), 4, 0.5, 1203u); f[2] = FB(uv, ivec2(24), 3, 0.5, 1207u);
  w[0] = WO(uv, ivec2(12), 0.9, 1213u);`,
    surf: /* glsl */`
  // aluminium gangway decking: extruded planks (8 x 150 mm across the repeat) running down the slope with ten rounded
  // ribs each, bolted cross cleats (35 x 18 mm) every 0.3 m along the slope (centred between the fitted lines),
  // mill-finish streaks, dull oxidised patches, black rubber scuffs, polished cleat tops, a few dents. Own colours.
  const float PW = 0.15, PD = 0.3;
  int pk = int(floor(P.x / PW));
  float lx = P.x - float(pk) * PW;
  float eS = min(lx, PW - lx);
  vec2 ps = edgeProf(eS, 0.001, 0.003, 0.001, 0.004);
  float rib = pow(0.5 + 0.5 * cos(TAU * (lx - 0.0075) / 0.015), 3.0) * smoothstep(0.004, 0.009, eS);
  float cy = P.y - (floor(P.y / PD) + 0.5) * PD;
  float ce = 0.0175 - abs(cy);
  float cl = smoothstep(-PX, PX, ce);
  float hCl = 0.018 * sqrt(max(1.0 - pow(1.0 - clamp(ce / 0.005, 0.0, 1.0), 2.0), 0.0));
  float bd = length(vec2(lx - PW * 0.5, cy));
  float bolt = (1.0 - aa(0.0065, bd)) * cl;
  float bdome = sqrt(max(1.0 - pow(bd / 0.0065, 2.0), 0.0));
  float strk = n[0], ox = smoothstep(0.1, 0.7, n[1]), sc = n[2];
  vec4 wc = c[0];
  float scuff = step(0.82, wc.z) * (1.0 - smoothstep(0.05, 0.3, abs(wc.x - 0.25) + 0.5 * abs(sc))) * smoothstep(0.2, 0.6, strk * 0.5 + 0.5) * (0.5 + 0.5 * cl);
  float dent = step(0.93, fract(wc.z * 7.1)) * (1.0 - smoothstep(0.0, 0.25, wc.x));
  vec3 al = lin(vec3(0.72, 0.73, 0.74)) * (1.0 + 0.05 * strk + 0.02 * sc);
  al = mix(al, lin(vec3(0.77, 0.78, 0.78)), ox * 0.4);
  float pol = cl * smoothstep(0.004, 0.012, ce) * smoothstep(-0.2, 0.5, sc);
  al = mix(al, lin(vec3(0.82, 0.83, 0.85)), pol * 0.5);
  vec3 col = mix(al, lin(vec3(0.07, 0.07, 0.075)), scuff * 0.8);
  col = mix(col, lin(vec3(0.5, 0.51, 0.52)), bolt);
  col *= 1.0 - 0.5 * ps.y * (1.0 - cl);
  float hD = ps.x + 0.0009 * rib - 0.0015 * dent;
  s.alb = col;
  s.h = mix(hD, max(hD, hCl), cl) + 0.002 * bolt * bdome;
  s.rough = mix(0.48 + 0.05 * strk + 0.16 * ox - 0.14 * pol, 0.75, scuff * 0.8);
  s.metal = (0.42 + 0.3 * pol) * (1.0 - scuff * 0.8);
  s.cav = mix(1.0, 0.55, ps.y * (1.0 - cl)) * (1.0 - 0.2 * (1.0 - rib) * (1.0 - cl)) * (1.0 - 0.3 * exp(-pow((ce + 0.0015) / 0.002, 2.0)));`,
  },
  {
    // not a surface: neutral micro-surface for close-up crispness, blended in by texlibDetail() (albedo mean 0.5
    // = multiplier 1.0, roughness mean 0.5 = delta 0). Mips fade it to neutral on their own.
    name: 'detail', detail: 0, scale: 0.5, tint: true, alpha: false, mode: PLAIN, sym: 0, hr: [-0.0003, 0.0002], ao: 0.0,
    prep: `f[0] = FB(uv, ivec2(24), 3, 0.5, 3u); f[1] = FB(uv, ivec2(96), 2, 0.5, 5u);
  w[0] = WO(uv, ivec2(150), 1.0, 7u); w[1] = WO(uv, ivec2(40), 0.9, 9u);`,
    surf: /* glsl */`
  vec4 g = c[0];                                   // ~3 mm grains
  float grain = smoothstep(0.05, 0.3, g.y - g.x);
  float tone = fract(g.z * 7.31) - 0.5;
  float pit = step(0.93, c[1].z) * (1.0 - smoothstep(0.0007, 0.0007 + 2.0 * PX, c[1].x * (0.5 / 40.0)));
  float m = 1.0 + 0.14 * tone * grain + 0.06 * n[0] + 0.035 * n[1] - 0.16 * pit;
  s.alb = vec3(0.5 * m);
  s.h = 0.0002 * grain * (1.0 - g.x * g.x) + 0.00006 * n[1] - 0.00025 * pit;
  s.rough = 0.5 + 0.05 * n[0] + 0.04 * tone * grain;`,
  },
  {
    // not a surface: the gelatinous top of wet ink (normal only). Broad soft swells, a finer settling ripple and a
    // few shallow dimples; the level shader tilts the ink's clearcoat with it so reflections break into wet highlights.
    name: 'gel', detail: 0, scale: 1.0, tint: true, alpha: false, mode: PLAIN, sym: 0, hr: [-0.006, 0.006], ao: 0.0,
    prep: `f[0] = FB(uv, ivec2(4), 3, 0.45, 91u); f[1] = FB(uv, ivec2(12), 2, 0.5, 97u); w[0] = WO(uv, ivec2(7), 1.0, 101u);`,
    surf: /* glsl */`
  vec4 wc = c[0];
  float dimple = (1.0 - smoothstep(0.0, 0.22, wc.x)) * step(0.6, wc.z);
  s.h = 0.0034 * n[0] + 0.0009 * n[1] - 0.0012 * dimple * dimple;
  s.alb = vec3(0.5);
  s.rough = 0.5;`,
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Runtime sampling helpers
// ---------------------------------------------------------------------------------------------------------------

export const TEXLIB_GLSL = /* glsl */`
// ---- INKWAVE texlib (see src/world/texlib.js header for the API) ----
#ifndef TEXLIB_INCLUDED
#define TEXLIB_INCLUDED
#define TEXLIB_PLAIN 0
#define TEXLIB_GRID 1
#define TEXLIB_HEX 2
#ifndef TEXLIB_HEX_SCALE
#define TEXLIB_HEX_SCALE 0.5
#endif
struct TexlibSample { vec4 albedo; vec3 normal; vec4 orm; };

uint texlib_pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
uint texlib_hash(ivec2 p) { return texlib_pcg(uint(p.x) + texlib_pcg(uint(p.y) + 0x9e3779b9u)); }
float texlib_h01(uint h) { return float(h >> 8u) * (1.0 / 16777216.0); }

void texlib_triGrid(vec2 st, out vec3 w, out ivec2 v1, out ivec2 v2, out ivec2 v3) {
  st *= 3.46410162;
  vec2 sk = mat2(1.0, 0.0, -0.57735027, 1.15470054) * st;
  ivec2 b = ivec2(floor(sk));
  vec3 t = vec3(fract(sk), 0.0); t.z = 1.0 - t.x - t.y;
  float s = step(0.0, -t.z), s2 = 2.0 * s - 1.0;
  w = vec3(-t.z * s2, s - t.y * s2, s - t.x * s2);
  int si = int(s);
  v1 = b + ivec2(si, si); v2 = b + ivec2(si, 1 - si); v3 = b + ivec2(1 - si, si);
}
vec2 texlib_hexCentre(ivec2 v) { return mat2(1.0, 0.0, 0.5, 0.8660254) * vec2(v) / (3.46410162 * TEXLIB_HEX_SCALE); }
mat2 texlib_rot(uint h) { float a = texlib_h01(h) * 6.28318531; float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

void texlib_tap(sampler2DArray tA, sampler2DArray tN, sampler2DArray tO, vec2 st, float layer, vec2 gx, vec2 gy, mat2 M,
                out vec4 a, out vec3 n, out float nl, out vec4 o) {
  vec3 p = vec3(st, layer);
  a = textureGrad(tA, p, M * gx, M * gy);
  vec3 nr = textureGrad(tN, p, M * gx, M * gy).xyz * 2.0 - 1.0;
  o = textureGrad(tO, p, M * gx, M * gy);
  nl = length(nr);
  n = vec3(transpose(M) * nr.xy, nr.z);
}

TexlibSample texlibSample(sampler2DArray tA, sampler2DArray tN, sampler2DArray tO, vec2 uv, float layer, int mode, int sym) {
  vec2 gx = dFdx(uv), gy = dFdy(uv);
  // keep the footprint anisotropy within what 16x hardware AF resolves (≤ 12:1): past that, blur instead of alias
  float lx = dot(gx, gx), ly = dot(gy, gy);
  if (lx > ly * 144.0) gy = ly > 1e-20 ? gy * sqrt(lx / (ly * 144.0)) : vec2(-gx.y, gx.x) / 12.0;
  else if (ly > lx * 144.0) gx = lx > 1e-20 ? gx * sqrt(ly / (lx * 144.0)) : vec2(gy.y, -gy.x) / 12.0;
  TexlibSample r;
  vec3 n; float nl;
  if (mode == TEXLIB_HEX) {
    vec3 w; ivec2 v1, v2, v3;
    texlib_triGrid(uv * TEXLIB_HEX_SCALE, w, v1, v2, v3);
    uint h1 = texlib_hash(v1), h2 = texlib_hash(v2), h3 = texlib_hash(v3);
    mat2 R1 = texlib_rot(h1), R2 = texlib_rot(h2), R3 = texlib_rot(h3);
    vec2 c1 = texlib_hexCentre(v1), c2 = texlib_hexCentre(v2), c3 = texlib_hexCentre(v3);
    vec2 o1 = vec2(texlib_h01(texlib_pcg(h1)), texlib_h01(texlib_pcg(h1 + 1u)));
    vec2 o2 = vec2(texlib_h01(texlib_pcg(h2)), texlib_h01(texlib_pcg(h2 + 1u)));
    vec2 o3 = vec2(texlib_h01(texlib_pcg(h3)), texlib_h01(texlib_pcg(h3 + 1u)));
    vec4 a1, a2, a3, q1, q2, q3; vec3 n1, n2, n3; float l1, l2, l3;
    texlib_tap(tA, tN, tO, R1 * (uv - c1) + c1 + o1, layer, gx, gy, R1, a1, n1, l1, q1);
    texlib_tap(tA, tN, tO, R2 * (uv - c2) + c2 + o2, layer, gx, gy, R2, a2, n2, l2, q2);
    texlib_tap(tA, tN, tO, R3 * (uv - c3) + c3 + o3, layer, gx, gy, R3, a3, n3, l3, q3);
    vec3 W = w * w; W *= W; W *= w * w * w;                   // w^7
    W *= mix(vec3(1.0), vec3(q1.a, q2.a, q3.a) + 0.05, 0.6);  // height-aware contrast blend
    W /= max(W.x + W.y + W.z, 1e-6);
    r.albedo = W.x * a1 + W.y * a2 + W.z * a3;
    r.orm = W.x * q1 + W.y * q2 + W.z * q3;
    n = W.x * n1 + W.y * n2 + W.z * n3;
    nl = W.x * l1 + W.y * l2 + W.z * l3;
  } else if (mode == TEXLIB_GRID) {
    uint h = texlib_hash(ivec2(floor(uv))) & uint(sym);
    mat2 M = mat2(1.0);
    if ((h & 4u) != 0u) M = mat2(0.0, 1.0, 1.0, 0.0);
    if ((h & 1u) != 0u) M = mat2(-1.0, 0.0, 0.0, 1.0) * M;
    if ((h & 2u) != 0u) M = mat2(1.0, 0.0, 0.0, -1.0) * M;
    texlib_tap(tA, tN, tO, M * (fract(uv) - 0.5) + 0.5, layer, gx, gy, M, r.albedo, n, nl, r.orm);
  } else {
    texlib_tap(tA, tN, tO, uv, layer, gx, gy, mat2(1.0), r.albedo, n, nl, r.orm);
  }
  // Toksvig: mips average bumps into shorter normals -> widen the lobe instead of sparkling
  float v = max((1.0 - nl) / max(nl, 1e-3) - 0.006, 0.0);
  float a = r.orm.g * r.orm.g;
  r.orm.g = sqrt(sqrt(min(a * a + 2.0 * v, 1.0)));
  r.normal = normalize(vec3(n.xy, max(n.z, 1e-3)));
  return r;
}

mat3 texlibTangentFrame(vec3 eyePos, vec3 surfNormal, vec2 uv) {
  vec3 q0 = dFdx(eyePos), q1 = dFdy(eyePos);
  vec2 st0 = dFdx(uv), st1 = dFdy(uv);
  vec3 N = surfNormal;
  vec3 q1perp = cross(q1, N), q0perp = cross(N, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x;
  vec3 B = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float sc = det == 0.0 ? 0.0 : inversesqrt(det);
  return mat3(T * sc, B * sc, N);
}
vec3 texlibPerturbNormal(vec3 nTS, vec3 T, vec3 B, vec3 N, float strength) {
  return normalize(T * (nTS.x * strength) + B * (nTS.y * strength) + N * nTS.z);
}
vec3 texlibPerturbNormal(vec3 nTS, mat3 tbn, float strength) {
  return texlibPerturbNormal(nTS, tbn[0], tbn[1], tbn[2], strength);
}

#ifndef TEXLIB_DETAIL_SCALE
#define TEXLIB_DETAIL_SCALE 0.5
#endif
// blends the 'detail' layer into a sample at two rotated scales (no visible period). pMetres = surface coords in
// metres; amount = meta.detail (0 = skip). Albedo x (2 * detail), normal UDN-blended, roughness += delta.
void texlibDetail(inout TexlibSample s, sampler2DArray tA, sampler2DArray tN, sampler2DArray tO, vec2 pMetres, float layer, float amount) {
  vec2 u1 = pMetres / TEXLIB_DETAIL_SCALE;
  vec2 gx = dFdx(u1), gy = dFdy(u1);
  if (amount <= 0.0) return;
  const mat2 R = mat2(0.8660254, 0.5, -0.5, 0.8660254);
  vec2 u2 = R * u1 * 0.61 + vec2(0.37, 0.71);
  vec2 hx = R * gx * 0.61, hy = R * gy * 0.61;
  vec4 a1 = textureGrad(tA, vec3(u1, layer), gx, gy), a2 = textureGrad(tA, vec3(u2, layer), hx, hy);
  vec3 n1 = textureGrad(tN, vec3(u1, layer), gx, gy).xyz * 2.0 - 1.0, n2 = textureGrad(tN, vec3(u2, layer), hx, hy).xyz * 2.0 - 1.0;
  vec4 o1 = textureGrad(tO, vec3(u1, layer), gx, gy), o2 = textureGrad(tO, vec3(u2, layer), hx, hy);
  s.albedo.rgb *= mix(1.0, a1.r + a2.r, amount);
  vec2 dn = (n1.xy + transpose(R) * n2.xy) * 0.7071;
  s.normal = normalize(vec3(s.normal.xy + dn * amount, s.normal.z));
  s.orm.g = clamp(s.orm.g + (o1.g + o2.g - 1.0) * amount, 0.02, 1.0);
}

// screen-space specular AA on the final (perturbed) normal (Tokuyoshi-Kaplanyan / Filament): widens the lobe where
// the normal changes faster than the pixel grid can resolve — kills glints on bevels/rivets at distance.
float texlibSpecularAA(vec3 n, float roughness) {
  vec3 du = dFdx(n), dv = dFdy(n);
  float kernel = min(2.0 * 0.15 * (dot(du, du) + dot(dv, dv)), 0.2);
  float a = roughness * roughness;
  return sqrt(sqrt(clamp(a * a + kernel, 0.0, 1.0)));
}
float texlib_vn(vec2 p) {
  vec2 i = floor(p), f = p - i; vec2 u = f * f * (3.0 - 2.0 * f);
  ivec2 c = ivec2(i);
  float a = texlib_h01(texlib_hash(c)), b = texlib_h01(texlib_hash(c + ivec2(1, 0)));
  float d = texlib_h01(texlib_hash(c + ivec2(0, 1))), e = texlib_h01(texlib_hash(c + ivec2(1, 1)));
  return mix(mix(a, b, u.x), mix(d, e, u.x), u.y);
}
float texlibMacro(vec2 p) {
  float n = 0.62 * texlib_vn(p * 0.085 + 3.7) + 0.38 * texlib_vn(p * 0.29 + 11.3);
  return 0.94 + 0.12 * n;
}
float texlibCoverage(float a, vec2 uv, float texSize) {
  vec2 dx = dFdx(uv) * texSize, dy = dFdy(uv) * texSize;
  float lod = 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-8));
  float sharp = clamp((a - 0.5) / max(fwidth(a), 1e-4) + 0.5, 0.0, 1.0);
  // coverage-preserving: as openings fall below the pixel grid the bars thicken until the grate reads solid
  // (as real grating does at a distance / grazing angle) instead of breaking into dotted, shimmering holes
  float far = clamp(a * (1.0 + 1.6 * max(lod, 0.0)), 0.0, 1.0);
  return mix(sharp, far, smoothstep(-0.5, 0.8, lod));
}
#endif
`;

// ---------------------------------------------------------------------------------------------------------------
// Library construction
// ---------------------------------------------------------------------------------------------------------------

export async function createTextureLibrary(renderer, { size = 512 } = {}) {
  const t0 = performance.now();
  const L = MATERIALS.length;
  const aniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());

  // three single-attachment array targets (albedo sRGB, normal + orm linear), one program variant each. Not one MRT
  // pass: ANGLE's D3D backend links for one output and recompiles MRT programs serially at the first draw (~4 s cold);
  // single-output variants all compile in parallel at link time.
  const outs = ['albedo', 'normal', 'orm'].map((name, k) => {
    const o = new THREE.WebGLArrayRenderTarget(size, size, L, {
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat, colorSpace: k ? THREE.NoColorSpace : THREE.SRGBColorSpace,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
      magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipmapLinearFilter,
      generateMipmaps: true, anisotropy: aniso, depthBuffer: false, stencilBuffer: false,
    });
    o.texture.name = 'texlib.' + name;
    return o;
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const raw = (fs, uniforms, k) => new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: GEN_VS, fragmentShader: fs, uniforms, defines: { TL_OUT: k }, depthTest: false, depthWrite: false,
  });
  // one uber-program per material group (the original layers / the marina set): one driver compile + pipeline per
  // group instead of one per layer, and the two compile in parallel (cold start matters) while each stays small
  const uniforms = {
    uRes: { value: new THREE.Vector2(size, size) }, uScale: { value: 1 }, uMat: { value: 0 }, uOne: { value: 1 },
    uHRange: { value: new THREE.Vector2() }, uAO: { value: 0.5 },
  };
  const groups = [0, 1, 2].map((g) => MATERIALS.map((m, i) => [m, i]).filter(([m]) => (m.group || 0) === g)).filter((l) => l.length);
  const srcs = groups.map((list) => {
    const fns = list.map(([m, i]) => `void prep${i}(${PREP_SIG}) {\n  ${m.prep}\n}\nvoid surf${i}(${SURF_SIG}) {${m.surf}\n}`).join('\n');
    const sw = (fn, args) => list.map(([, i], k) => `${k ? 'else ' : ''}if (uMat == ${i}) ${fn}${i}(${args});`).join('\n  ');
    return GEN_COMMON + fns + GEN_MAIN.replace('PREP_SWITCH', sw('prep', 'uv, P, f, w')).replace('SURF_SWITCH', sw('surf', 'uv, P, n, c, s'));
  });
  // per output: a scene holding one quad per group (the layer's group is the visible one)
  const passes = outs.map((o, k) => {
    const scene = new THREE.Scene();
    const quads = srcs.map((fs) => { const q = new THREE.Mesh(geo, raw(fs, uniforms, k)); q.frustumCulled = false; scene.add(q); return q; });
    return { o, scene, quads };
  });
  const groupOf = new Map(groups.flatMap((list, k) => list.map(([, i]) => [i, k])));
  // async (and parallel) where KHR_parallel_shader_compile exists; each bound to its target, since program variants
  // are keyed on the target (compiled for the canvas they'd be thrown away and re-linked, blocking, at the first draw)
  const prevRT0 = renderer.getRenderTarget();
  const compiling = passes.map((p) => { renderer.setRenderTarget(p.o); return renderer.compileAsync(p.scene, cam); });
  renderer.setRenderTarget(prevRT0);
  await Promise.all(compiling);
  const tCompiled = performance.now();

  const prevRT = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  const prevXR = renderer.xr.enabled;
  renderer.autoClear = false;
  renderer.xr.enabled = false;
  for (const p of passes) p.o.texture.generateMipmaps = false;   // build each mip chain once, after the last layer

  for (let i = 0; i < L; i++) {
    const m = MATERIALS[i];
    uniforms.uMat.value = i;
    uniforms.uScale.value = m.scale;
    uniforms.uHRange.value.set(m.hr[0], m.hr[1]);
    uniforms.uAO.value = m.ao;
    for (const p of passes) {
      p.quads.forEach((q, k) => { q.visible = k === groupOf.get(i); });
      if (i === L - 1) p.o.texture.generateMipmaps = true;
      renderer.setRenderTarget(p.o, i);
      renderer.render(p.scene, cam);
    }
  }
  // wait for the GPU so the reported time is honest (one-pixel readback)
  renderer.readRenderTargetPixels(outs[2], 0, 0, 1, 1, new Uint8Array(4));

  renderer.setRenderTarget(prevRT);
  renderer.autoClear = prevAutoClear;
  renderer.xr.enabled = prevXR;
  for (const p of passes) p.quads.forEach((q) => q.material.dispose());
  geo.dispose();

  const layers = {}, meta = {};
  MATERIALS.forEach((m, i) => {
    layers[m.name] = i;
    meta[m.name] = { scale: m.scale, tint: m.tint, mask: !!m.mask, stair: m.stair || null, alpha: m.alpha, mode: m.mode, sym: m.sym, detail: m.detail, depth: +(m.hr[1] - m.hr[0]).toFixed(4) };
  });
  const t1 = performance.now();
  return {
    albedo: outs[0].texture,
    normal: outs[1].texture,
    orm: outs[2].texture,
    layers,
    meta,
    names: MATERIALS.map((m) => m.name),
    size,
    stats: { ms: +(t1 - t0).toFixed(1), compileMs: +(tCompiled - t0).toFixed(1), size },
    dispose() { outs.forEach((o) => o.dispose()); },
  };
}
