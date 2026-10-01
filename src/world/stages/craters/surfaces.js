// Turf War Craters — stage surface materials (texlib layers `craters:<name>`) on this stage's reserved PATTERN slots 52–54
// (stages/surfaces.js STAGE_SLOTS). See src/world/stages/cargo/surfaces.js for the contract: { slot, name, onWall?,
// onTop?, mat } — mat follows the MATERIALS contract in src/world/texlib.js (prep declares up to 4 fbm + 2 worley
// requests, surf writes s.alb / s.a / s.h / s.rough / s.metal / s.cav; heights in metres). All three are `mask` layers:
// albedo.a = where the block colour applies, albedo.rgb = the layer's own colours.
//
//   turf     downland turf over chalk: tussocks with dark thatch between, grass blades, sun-bleached straw patches, thin
//            places where the chalk shows through (own white, with a flint or two), a sprinkling of wildflowers — red
//            field poppies above all, a few ox-eye daisies and buttercups (own colours). Its vertical faces are chalk
//            (the cliff faces, the crater's crest bank, the pond's banks): onWall → chalk
//   chalk    a chalk cliff face (vertical faces only: the cliffs, the crater's crest bank, the pond banks): bedding
//            planes, bands of flint nodules, joints, weathering streaks, the wet algae-dark foot at the waterline
//   sandbag  hessian sandbags in a stretcher bond (0.5 × 0.2 m courses): pillowed bags, dark gaps, per-bag tone, a sewn
//            seam at one end, sun-bleached tops and damp, earth-stained lower courses — the trench parapets
import { PATTERN } from '../../mapkit.js';

export const SURF = { turf: 52, chalk: 53, sandbag: 54 };

const GRID = 1, HEX = 2;

export const SURFACES = [
  {
    slot: 52, name: 'turf', onWall: 53,
    mat: {
      detail: 0.55, scale: 2.4, tint: true, mask: true, alpha: false, mode: HEX, sym: 7, hr: [-0.01, 0.016], ao: 0.5,
      prep: `f[0] = FB(uv, ivec2(3), 4, 0.55, 5201u); f[1] = FB(uv, ivec2(9), 4, 0.55, 5203u); f[2] = FB(uv, ivec2(96, 24), 2, 0.5, 5207u);
  f[3] = FB(uv, ivec2(48), 2, 0.5, 5209u); w[1] = WO(uv, ivec2(54), 1.0, 5213u);`,
      surf: /* glsl */`
  // downland turf: soft tussock humps (mid noise) with darker thatch in the hollows, streaky grass blades, sun-bleached
  // straw patches, a rare thin place where the chalk shows (own white); wildflowers in a few fine cells (own colours)
  float big = n[0], hump = n[1], blade = 0.5 + 0.5 * n[2], grain = n[3];
  vec4 fc = c[1];
  float mound = smoothstep(-0.35, 0.45, hump);
  float hollow = 1.0 - smoothstep(-0.55, -0.1, hump);
  float chalkM = smoothstep(-0.62, -0.8, hump + 0.25 * big) * 0.85;
  float straw = smoothstep(0.3, 0.75, big + 0.2 * hump) * 0.38;
  float tone = 0.8 * (0.93 + 0.09 * big) * (0.9 + 0.14 * mound) * (0.86 + 0.2 * blade) * (1.0 + 0.04 * grain) * (1.0 - 0.16 * hollow);
  float fsel = fract(fc.z * 17.31), kind = fract(fc.z * 5.77);
  float flower = (1.0 - smoothstep(0.16, 0.25, fc.x)) * step(0.955, fsel) * smoothstep(0.0, 0.5, big + 0.6 * hump) * (1.0 - chalkM);
  vec3 petal = kind < 0.66 ? lin(vec3(0.78, 0.15, 0.1)) : kind < 0.86 ? lin(vec3(0.92, 0.91, 0.85)) : lin(vec3(0.9, 0.75, 0.2));
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, lin(vec3(0.73, 0.66, 0.45)) * (0.86 + 0.22 * blade), straw); cov *= 1.0 - straw;
  own = mix(own, lin(vec3(0.84, 0.83, 0.78)) * (0.94 + 0.08 * grain), chalkM); cov *= 1.0 - chalkM;
  own = mix(own, petal * (0.9 + 0.15 * grain), flower); cov *= 1.0 - flower;
  s.alb = own; s.a = cov * tone;
  s.h = (0.01 * mound + 0.0025 * blade + 0.001 * grain) * (1.0 - chalkM) - 0.005 * chalkM + 0.0015 * flower;
  s.rough = mix(mix(0.93 - 0.05 * blade, 0.86, chalkM), 0.65, flower);
  s.cav = 1.0 - 0.3 * hollow * (1.0 - chalkM);`,
    },
  },
  {
    slot: 53, name: 'chalk',
    mat: {
      detail: 0.7, scale: 3.2, tint: true, mask: true, alpha: false, mode: GRID, sym: 1, hr: [-0.03, 0.012], ao: 0.55,
      prep: `f[0] = FB(uv, ivec2(3), 4, 0.55, 5301u); f[1] = FB(uv, ivec2(12, 2), 3, 0.5, 5303u); f[2] = FB(uv, ivec2(56), 2, 0.5, 5307u);
  f[3] = FB(uv, ivec2(28, 3), 3, 0.5, 5309u); w[0] = WO(uv, ivec2(5, 2), 0.85, 5311u);`,
      surf: /* glsl */`
  // a chalk cliff face (v = up the face, from its foot): bedding planes at irregular heights, each bed its own tone and a
  // little proud or recessed; bands of black flint nodules (white cortex) every ~0.9 m; vertical joints; grey-green
  // weathering streaks running down; iron staining; the wet, algae-dark foot where the sea (or the pond) meets it.
  // Its own colour (a turf block's faces are chalk: the block colour never tints it)
  float big = n[0], hz = n[1], grain = n[2], streak = n[3];
  vec4 jc = c[0];
  float vv = P.y + 0.06 * hz;
  float bed = floor(vv / 0.34), fb = vv - bed * 0.34;
  float bh = hf(ivec2(int(bed) + 64, 3), 5u), bh2 = hf(ivec2(int(bed) + 64, 5), 7u);
  float bedLine = (1.0 - smoothstep(0.004, 0.012 + 0.008 * bh, min(fb, 0.34 - fb))) * step(0.3, bh2);
  float fv = P.y - floor(P.y / 0.92) * 0.92;
  float band = 1.0 - smoothstep(0.035, 0.07, abs(fv - 0.46 + 0.03 * hz));
  float nod = band * smoothstep(0.1, 0.35, hz + 0.45 * grain);
  float cortex = band * (smoothstep(-0.05, 0.1, hz + 0.45 * grain) - smoothstep(0.1, 0.35, hz + 0.45 * grain));
  float joint = (1.0 - aa(0.004, (jc.y - jc.x) * 0.64)) * step(0.55, fract(jc.z * 7.3 + jc.w * 3.1));
  float wetFoot = 1.0 - smoothstep(0.55, 0.85, P.y + 0.08 * big);
  float stain = smoothstep(0.35, 0.8, big) * 0.35;
  float streakM = smoothstep(0.25, 0.7, streak + 0.3 * big) * 0.35;
  vec3 ch = lin(vec3(0.9, 0.89, 0.85)) * (0.95 + 0.07 * (bh - 0.5)) * (1.0 + 0.04 * grain) * (1.0 - 0.1 * bedLine);
  ch = mix(ch, lin(vec3(0.86, 0.78, 0.6)), stain);
  ch = mix(ch, lin(vec3(0.62, 0.64, 0.57)), streakM);
  ch = mix(ch, lin(vec3(0.97, 0.96, 0.93)), cortex * 0.7);
  ch = mix(ch, lin(vec3(0.17, 0.18, 0.21)) * (0.85 + 0.3 * grain), nod);
  ch = mix(ch, lin(vec3(0.4, 0.4, 0.37)), joint * 0.8);
  ch = mix(ch, lin(vec3(0.25, 0.3, 0.24)) * (0.8 + 0.3 * grain), wetFoot * 0.85);
  s.alb = ch; s.a = 0.0;
  s.h = 0.006 * (bh - 0.5) - 0.01 * bedLine + 0.004 * nod + 0.0015 * grain - 0.02 * joint;
  s.rough = mix(mix(0.9, 0.55, nod), 0.4, wetFoot * 0.7);
  s.cav = (1.0 - 0.45 * bedLine) * (1.0 - 0.6 * joint);`,
    },
  },
  {
    slot: 54, name: 'sandbag',
    mat: {
      detail: 0.4, scale: 2.0, tint: true, mask: true, alpha: false, mode: GRID, sym: 1, hr: [-0.035, 0.035], ao: 0.5,
      prep: `f[0] = FB(uv, ivec2(4), 3, 0.5, 5401u); f[1] = FB(uv, ivec2(96), 2, 0.5, 5403u); f[2] = FB(uv, ivec2(16), 3, 0.5, 5407u);
  f[3] = FB(uv, ivec2(40, 4), 2, 0.5, 5409u);`,
      surf: /* glsl */`
  // stretcher-bond sandbags: 0.5 m bags in 0.2 m courses (every other course offset half a bag), pillowed, 12–18 mm
  // gaps (own dark earth), per-bag tone + sag, a sewn seam across one end, hessian fuzz, damp earth on the lowest course
  const float BH = 0.2, BL = 0.5;
  float row = floor(P.y / BH), ly = P.y - row * BH;
  float off = (row - 2.0 * floor(row * 0.5)) * (BL * 0.5);
  float bx = P.x + off, col = floor(bx / BL), lx = bx - col * BL;
  ivec2 id = wrp(ivec2(int(col), int(row)), ivec2(4, 10));
  float h1 = hf(id, 7u), h2 = hf(id, 11u), h3 = hf(id, 13u);
  vec2 q = vec2(lx - BL * 0.5 + (h2 - 0.5) * 0.02, ly - BH * 0.5);
  float d = sdRB(q, vec2(BL * 0.5 - 0.008 - 0.006 * h3, BH * 0.5 - 0.007), 0.07);
  float bag = 1.0 - smoothstep(-PX, PX, d);
  float dome = sqrt(clamp(-d / 0.07, 0.0, 1.0));
  float seam = (1.0 - smoothstep(0.004, 0.004 + PX * 2.0, abs(lx - (h1 > 0.5 ? 0.06 : BL - 0.06)))) * bag * smoothstep(0.02, 0.05, -d);
  float fuzz = n[1], stain = n[0], lump = n[2], wrinkle = n[3];
  float damp = (1.0 - smoothstep(0.08, 0.35, P.y)) * 0.6 + 0.25 * smoothstep(0.3, 0.8, stain);
  float tone = 0.8 * (0.86 + 0.24 * h1) * (0.9 + 0.12 * dome) * (1.0 + 0.06 * fuzz + 0.05 * lump) * (1.0 - 0.3 * damp) * (1.0 - 0.18 * seam) * (1.0 - 0.06 * wrinkle);
  vec3 own = vec3(0.0); float cov = 1.0;
  float gap = 1.0 - bag;
  own = mix(own, lin(vec3(0.16, 0.13, 0.1)) * (0.8 + 0.3 * lump), gap); cov *= 1.0 - gap;
  s.alb = own; s.a = cov * tone;
  s.h = mix(-0.03, 0.03 * dome - 0.004 * seam + 0.002 * lump + 0.0015 * wrinkle - 0.01 * (1.0 - dome) * (0.5 + 0.5 * h3), bag);
  s.rough = mix(0.96, 0.92 - 0.04 * fuzz, bag);
  s.cav = mix(0.35, 1.0 - 0.2 * (1.0 - dome), bag);`,
    },
  },
];
void PATTERN;
