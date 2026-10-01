// Eco-Forest Treehills — stage surface materials (texlib layers `treehills:<name>`) on this stage's reserved PATTERN slots
// 61–63 (stages/surfaces.js STAGE_SLOTS). See src/world/stages/cargo/surfaces.js for the contract.
//
// The biome is engineered: everything is built, even the grass. Three surfaces, muted so team ink stays the loudest
// thing on screen:
//   lawn     the manicured biome lawn: dense fine turf (tinted by the block colour) in broad mown stripes, the odd clover
//            leaf and daisy, a faint seeding grid where the turf mats were laid (every 1.2 m). Walls of lawn blocks take
//            the retaining panels.
//   panels   the engineered retaining panels of the terraces: pressed green-grey steel triangles (the dome's geodesic
//            language, ~1 m), recessed seams, a bolt at every node, a drain slot now and then, faint water streaks.
//            Mask: the block colour tints the panels (seams, bolts, streaks keep their own colours).
//   chequer  Alterna chequer-plate deck: green-painted steel tread plate, raised lugs alternating ±45°, paint worn off
//            the lugs along the walking lines, a welded seam + bolt row on the 1.2 m repeat — station roofs, decks,
//            the base terraces.
import { PATTERN } from '../../mapkit.js';

export const SURF = { lawn: 61, panels: 62, chequer: 63 };

const PLAIN = 0, GRID = 1;

const lawn = {
  detail: 0.5, scale: 2.4, tint: true, mask: true, alpha: false, mode: GRID, sym: 2, hr: [-0.008, 0.004], ao: 0.4,
  prep: `f[0] = FB(uv, ivec2(2), 4, 0.55, 6101u); f[1] = FB(uv, ivec2(12), 3, 0.5, 6103u); f[2] = FB(uv, ivec2(96), 2, 0.5, 6107u);
  f[3] = FB(uv, ivec2(5), 3, 0.5, 6109u);
  w[0] = WO(uv, ivec2(20), 0.9, 6111u); w[1] = WO(uv, ivec2(170), 1.0, 6113u);`,
  surf: /* glsl */`
  // blades: a dense fine clump pattern (~1.4 cm), bright tips over dark hearts, tinted by the block colour
  vec4 bl = c[1];
  float clump = smoothstep(0.0, 0.5, bl.y - bl.x);
  float bv = 0.86 + 0.22 * fract(bl.z * 9.1);
  float tone = mix(0.8, 1.02, clump) * bv * (1.0 + 0.05 * n[2]);
  // mown stripes: two broad bands per repeat (1.2 m), the light one brushed toward the viewer
  float band = step(0.5, fract(uv.x * 2.0));
  float edgeB = 1.0 - smoothstep(0.0, 0.02, min(fract(uv.x * 2.0), 1.0 - fract(uv.x * 2.0)));
  tone *= mix(0.94, 1.05, band) * (1.0 - 0.03 * edgeB);
  // a slow drift of greener / drier turf, and the laying grid where the mats meet (very faint)
  tone *= 1.0 + 0.06 * n[0] + 0.03 * n[3];
  float mat = min(jd(P.x, 1.2), jd(P.y, 1.2));
  float seam = 1.0 - smoothstep(0.004, 0.012, mat);
  tone *= 1.0 - 0.05 * seam;
  // clover leaves (small darker trefoils, own colour) and a few daisies
  vec4 cl = c[0];
  float clover = step(0.9, cl.z) * (1.0 - smoothstep(0.08, 0.16, cl.x)) * smoothstep(-0.2, 0.3, n[1]);
  float daisy = step(0.985, fract(bl.z * 57.1)) * (1.0 - smoothstep(0.1, 0.28, bl.x));
  float dCore = daisy * (1.0 - smoothstep(0.04, 0.1, bl.x));
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, lin(vec3(0.26, 0.42, 0.2)) * (0.9 + 0.2 * n[2]), clover * 0.8); cov *= 1.0 - clover * 0.8;
  own = mix(own, lin(vec3(0.95, 0.94, 0.9)), daisy * 0.9); cov *= 1.0 - daisy * 0.9;
  own = mix(own, lin(vec3(0.95, 0.78, 0.25)), dCore); cov *= 1.0 - dCore;
  s.alb = own; s.a = cov * clamp(tone, 0.0, 1.0);
  s.h = 0.0025 * clump - 0.0015 + 0.0008 * clover + 0.001 * daisy - 0.002 * seam;
  s.rough = 0.88 - 0.06 * clump;
  s.cav = 0.85 + 0.15 * clump;`,
};

// triangle lattice: 5 columns × 6 rows per 6 m repeat (panels 1.2 m wide, 1.0 m tall: near-equilateral)
const panels = {
  detail: 0.4, scale: 6.0, tint: true, mask: true, alpha: false, mode: PLAIN, sym: 0, hr: [-0.012, 0.004], ao: 0.45,
  prep: `f[0] = FB(uv, ivec2(3), 4, 0.5, 6201u); f[1] = FB(uv, ivec2(20), 3, 0.5, 6203u); f[2] = FB(uv, ivec2(60), 2, 0.5, 6207u);
  f[3] = FB(uv, ivec2(6, 30), 3, 0.55, 6209u);`,
  surf: /* glsl */`
  // lattice coords: u across (5 per repeat), v up (6 per repeat); triangles between v = k, u - v/2 = k, u + v/2 = k
  float u = uv.x * 5.0, v = uv.y * 6.0;
  float a = u - 0.5 * v, b = u + 0.5 * v;
  vec3 dl = vec3(abs(v - floor(v + 0.5)) * 1.0, abs(a - floor(a + 0.5)) * 0.86 * 1.2, abs(b - floor(b + 0.5)) * 0.86 * 1.2);   // ≈ metres to each seam family
  float d = min(dl.x, min(dl.y, dl.z));
  float seam = 1.0 - aa(0.008, d);
  float bev = 1.0 - smoothstep(0.008, 0.04, d);
  // which triangle (for its own tone): floor of the three families
  vec3 id = floor(vec3(v, a, b));
  float tid = fract(sin(dot(id, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float tone = 0.86 + 0.1 * tid + 0.05 * n[0] + 0.025 * n[1];
  // bolts at the nodes (u, v integers with the half-offset rows)
  vec2 nd = vec2(u - floor(u + 0.5 - 0.5 * mod(floor(v + 0.5), 2.0)) - 0.5 * mod(floor(v + 0.5), 2.0), v - floor(v + 0.5));
  float bd = length(vec2(nd.x * 1.2, nd.y * 1.0));
  float bolt = 1.0 - aa(0.022, bd);
  float washer = (1.0 - aa(0.034, bd)) * (1.0 - bolt);
  // a drain slot low on some panels, water streaks running down from them
  float slotOn = step(0.82, tid);
  vec2 sp = vec2(fract(u) - 0.5, fract(v) - 0.3);
  float slot = slotOn * (1.0 - aa(0.07, abs(sp.x) * 1.2)) * (1.0 - aa(0.012, abs(sp.y) * 1.0));
  float streak = smoothstep(0.35, 0.8, n[3]) * (0.5 + 0.5 * n[2]);
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, lin(vec3(0.3, 0.34, 0.32)), seam * 0.55); cov *= 1.0 - seam * 0.55;
  own = mix(own, lin(vec3(0.62, 0.64, 0.6)), bolt * 0.9); cov *= 1.0 - bolt * 0.9;
  own = mix(own, lin(vec3(0.1, 0.11, 0.11)), slot); cov *= 1.0 - slot;
  own = mix(own, lin(vec3(0.3, 0.33, 0.3)), streak * 0.18); cov *= 1.0 - streak * 0.18;
  s.alb = own; s.a = cov * clamp(tone * (1.0 - 0.04 * bev), 0.0, 1.0);
  s.h = -0.008 * seam - 0.003 * bev + 0.003 * bolt + 0.0015 * washer - 0.006 * slot + 0.0006 * n[1];
  s.rough = 0.62 + 0.08 * n[2] + 0.1 * streak - 0.1 * bolt;
  s.metal = 0.15 + 0.4 * bolt;
  s.cav = 1.0 - 0.35 * seam - 0.1 * bev;`,
};

const chequer = {
  detail: 0.3, scale: 1.2, tint: true, mask: true, alpha: false, mode: GRID, sym: 3, hr: [-0.004, 0.003], ao: 0.3,
  prep: `f[0] = FB(uv, ivec2(3), 4, 0.5, 6301u); f[1] = FB(uv, ivec2(24), 2, 0.5, 6303u); f[2] = FB(uv, ivec2(6), 3, 0.5, 6307u);
  f[3] = FB(uv, ivec2(10), 3, 0.5, 6309u); w[0] = WO(uv, ivec2(8), 0.9, 6311u);`,
  surf: /* glsl */`
  const float CS = 0.04;
  vec2 cp = P / CS;
  ivec2 ci = ivec2(floor(cp));
  vec2 cf = cp - vec2(ci) - 0.5;
  bool odd = ((ci.x + ci.y) & 1) == 1;
  vec2 q = (odd ? vec2(cf.x + cf.y, cf.y - cf.x) : vec2(cf.x - cf.y, cf.x + cf.y)) * 0.70710678;
  float ld = length(vec2(max(abs(q.x) - 0.26, 0.0), q.y)) - 0.1;
  float lw = PX / CS;
  float lug = 1.0 - smoothstep(-lw, lw, ld);
  float dome = sqrt(clamp(-ld / 0.1, 0.0, 1.0));
  float dS = min(jd(P.x, 1.2), jd(P.y, 1.2));
  float bead = exp(-dS * dS / 0.00004);
  float nearS = 1.0 - smoothstep(0.004, 0.012, dS);
  lug *= 1.0 - nearS;
  float bu = abs(fract(P.x / 0.15) - 0.5) * 0.15, bv = abs(fract(P.y / 0.15) - 0.5) * 0.15;
  float bd = min(length(vec2(bu, jd(P.y, 1.2) - 0.03)), length(vec2(bv, jd(P.x, 1.2) - 0.03)));
  float bolt = 1.0 - aa(0.009, bd);
  float mott = n[0], fineN = n[1], wearN = n[2];
  float wear = lug * dome * smoothstep(0.5, 0.85, 0.5 + 0.5 * wearN);
  float edgeWear = bead * smoothstep(0.5, 0.8, 0.5 + 0.5 * wearN) * 0.6;
  vec3 steel = lin(vec3(0.66, 0.68, 0.67)) * (1.0 + 0.08 * fineN);
  vec3 own = vec3(0.0); float cov = 1.0;
  own = mix(own, steel, wear * 0.75); cov *= 1.0 - wear * 0.75;
  own = mix(own, steel * 0.9, edgeWear); cov *= 1.0 - edgeWear;
  s.alb = own;
  s.a = cov * 0.86 * (1.0 + 0.05 * mott + 0.03 * fineN) * (1.0 + 0.06 * lug * dome);
  s.h = 0.0018 * lug * dome + 0.0008 * bead - 0.0012 * nearS * (1.0 - bead) + 0.0014 * bolt;
  s.rough = mix(0.52 + 0.06 * mott, 0.34, wear);
  s.metal = wear * 0.7 + edgeWear * 0.5;
  s.cav = 1.0 - 0.3 * nearS * (1.0 - bead);`,
};

export const SURFACES = [
  { slot: 61, name: 'lawn', onWall: 62, mat: lawn },
  { slot: 62, name: 'panels', mat: panels },
  { slot: 63, name: 'chequer', onWall: PATTERN.metalpanel, mat: chequer },
];
